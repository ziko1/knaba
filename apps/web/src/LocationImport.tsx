import {useRef, useState} from 'react';
import {AlertTriangle, ArrowRight, CheckCircle2, FileText, ShieldCheck, Upload} from './icons';
import {Badge, Button} from '../../../packages/ui/index';
import {api, ApiError, command, type Entity} from './api';
import {entityName, errorText, type Translate} from './CommandForm';

type ImportRow = {externalKey:string;parentExternalKey?:string|null;nodeType:string;code:string;name:string;floorLevel?:number;floorLabelDe?:string;[key:string]:unknown};
type ImportError = {row?:number;code?:string;message?:string;column?:string;field?:string;[key:string]:unknown};
type Preview = {siteId:string;previewHash:string;rowCount:number;createCount:number;updateCount:number;canCommit:boolean;errors:ImportError[]};
type ImportResult = {rows:ImportRow[];errors:ImportError[];sourceRows?:number[];preview?:Preview|null};
const fileLimit = 5 * 1024 * 1024;
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const locationTypes = ['BUILDING','SECTION','ENTRANCE','FLOOR','APARTMENT','ROOM','COMMON_AREA','OUTDOOR_ZONE','TERRITORY_SEGMENT','FENCE_SEGMENT','STORAGE_AREA','CUSTOM'];

function fileBase64(buffer:ArrayBuffer) {
  const bytes = new Uint8Array(buffer), chunks:string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
}

export default function LocationImport({records, t, onSaved, onClose, initialSiteId=''}:{records:Record<string,Entity[]>;t:Translate;onSaved:()=>void;onClose:()=>void;initialSiteId?:string}) {
  const sites = (records.site || []).filter(site => site.data.active !== false);
  const [siteId, setSiteId] = useState(initialSiteId || (sites.length === 1 ? sites[0].id : ''));
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<ImportResult>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState<{locations?:Entity[]}>();
  const idempotency = useRef(crypto.randomUUID());
  const preview = result?.preview;
  const parseErrors = result?.errors || [];
  const errors = [...parseErrors, ...(preview?.errors || []).map(item => ({...item, row:item.row === undefined ? undefined : result?.sourceRows?.[item.row - 1] ?? item.row}))].filter((item, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index);
  const canCommit = Boolean(preview?.canCommit && preview.siteId === siteId && /^[a-f0-9]{64}$/.test(preview.previewHash) && result?.rows.length && errors.length === 0);
  const existing = (records.location || []).filter(location => location.data.siteId === siteId);
  const existingKeys = new Set(existing.map(location => location.data.externalKey).filter(Boolean));
  const importedByKey = new Map(result?.rows.map(row => [row.externalKey, row]) || []);
  const existingByKey = new Map(existing.map(location => [location.data.externalKey, location]));
  const existingById = new Map(existing.map(location => [location.id, location]));
  const selectedSite = sites.find(site => site.id === siteId);

  function invalidate() {
    setResult(undefined); setConfirmed(false); setError(undefined);
    idempotency.current = crypto.randomUUID();
  }

  async function checkFile(event:React.FormEvent) {
    event.preventDefault();
    if (!file || !siteId) return;
    invalidate(); setBusy(true);
    try {
      const extension = file.name.split('.').at(-1)?.toLowerCase();
      if (!['csv', 'xlsx'].includes(extension || '') || file.size === 0 || file.size > fileLimit) {
        throw new ApiError('VALIDATION_ERROR', 400, {reason:'IMPORT_FILE_INVALID'});
      }
      const response = await api<ImportResult>('/api/v1/imports/locations/preview', {
        method:'POST',
        body:JSON.stringify({siteId, fileName:file.name, mimeType:extension === 'csv' ? 'text/csv' : xlsxMime, base64:fileBase64(await file.arrayBuffer())})
      });
      if (!Array.isArray(response.rows) || !Array.isArray(response.errors) || response.rows.length > 1000) {
        throw new ApiError('REQUEST_FAILED', 502);
      }
      setResult(response);
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!confirmed || !canCommit || !preview || !result || busy) return;
    setBusy(true); setError(undefined);
    try {
      const response = await command('location.import.commit', {siteId, rows:result.rows, previewHash:preview.previewHash, confirmed:true}, undefined, idempotency.current);
      setSaved(response); onSaved();
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && ['VERSION_CONFLICT', 'VALIDATION_ERROR'].includes(err.code)) {
        setResult(undefined); setConfirmed(false);
      }
    } finally { setBusy(false); }
  }

  function locationPath(row:ImportRow) {
    const parts = [row.name || row.code], seen = new Set([row.externalKey]);
    let parentKey = row.parentExternalKey;
    while (parentKey && parts.length < 50 && !seen.has(parentKey)) {
      seen.add(parentKey);
      const importedParent = importedByKey.get(parentKey);
      const storedParent = existingByKey.get(parentKey);
      if (!importedParent && !storedParent) { parts.unshift(String(parentKey)); break; }
      const parent = importedParent || storedParent!.data;
      parts.unshift(String(parent.name || parent.code));
      parentKey = importedParent ? importedParent.parentExternalKey : storedParent?.data.parentId ? existingById.get(storedParent.data.parentId)?.data.externalKey : null;
    }
    return parts.join(' / ');
  }

  return <div className="location-import">
    <p className="issue-intro"><ShieldCheck size={18}/>{t('importLocationsDesc')}</p>
    {Boolean(error) && <div className="notice danger" role="alert"><AlertTriangle size={18}/><div>{error instanceof ApiError && error.details.reason === 'IMPORT_FILE_INVALID' ? t('importFileLimit') : errorText(error, t)}{error instanceof ApiError && <small>{error.code}</small>}</div></div>}
    {!navigator.onLine && <div className="notice warning" role="status">{t('offlineDesc')}</div>}
    {saved ? <div className="success-state"><CheckCircle2 size={40}/><h3>{t('success')}</h3><p>{saved.locations?.length || preview?.rowCount || 0} {t('importRows')}</p><Button onClick={onClose}>{t('completed')}</Button></div> : <>
      <form onSubmit={checkFile}>
        <fieldset disabled={busy} className="issue-fields">
          <div className="form-grid">
            <label className="field"><span>{t('siteId')} *</span><select required value={siteId} onChange={event => {setSiteId(event.target.value); invalidate();}}><option value="">{t('none')}</option>{sites.map(site => <option key={site.id} value={site.id}>{entityName(site)}</option>)}</select></label>
            <label className="field"><span>{t('importFile')} *</span><input required type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => {setFile(event.target.files?.[0]); invalidate();}}/><small>{t('importFileLimit')}</small></label>
          </div>
          <details className="import-format"><summary>{t('importFormat')}</summary><p>{t('importHeaderRequired')}</p><code>externalKey,parentExternalKey,nodeType,code,name,floorLevel,floorLabelDe,sortOrder,names,measurementValueMilli,measurementUnit,measurementSource,customTypeApproval</code><p>{t('importFloorHint')}</p><ul className="import-types">{locationTypes.map(type => <li key={type}><span>{t(`locationType_${type}`)}</span><code>{type}</code></li>)}</ul></details>
          <footer className="form-footer"><Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button type="submit" disabled={!file || !siteId || !navigator.onLine}><Upload size={16}/>{busy ? t('loading') : result ? t('importPreviewAgain') : t('importPreview')}</Button></footer>
        </fieldset>
      </form>
      {result && <section className="import-preview" aria-live="polite">
        <h3><FileText size={18}/>{selectedSite ? entityName(selectedSite) : t('preview')}</h3>
        {preview && <div className="import-summary"><Badge>{preview.rowCount} {t('importRows')}</Badge><Badge tone="green">{preview.createCount} {t('importCreate')}</Badge><Badge tone="amber">{preview.updateCount} {t('importUpdate')}</Badge></div>}
        {errors.length > 0 && <div className="import-errors" role="alert"><b>{t('importErrors')}</b><ul>{errors.map((item, index) => <li key={index}><span>{item.row !== undefined ? `${t('importRow')} ${item.row}: ` : ''}{item.column || item.field ? `${item.column || item.field} · ` : ''}{t(`importError_${item.code}`) !== `importError_${item.code}` ? t(`importError_${item.code}`) : item.message || item.code || t('invalid')}</span>{item.code && <code>{item.code}</code>}</li>)}</ul></div>}
        {result.rows.length > 0 && <div className="import-table-scroll"><table className="import-table"><thead><tr><th>{t('importRow')}</th><th>{t('importLocationPath')}</th><th>{t('nodeType')}</th><th>{t('code')}</th><th>{t('importChange')}</th></tr></thead><tbody>{result.rows.map((row, index) => <tr key={`${index}-${row.externalKey}`}><td>{result.sourceRows?.[index] ?? index + 2}</td><td><b>{locationPath(row)}</b><small>{row.externalKey}{row.floorLabelDe ? ` · ${row.floorLabelDe}` : ''}{row.floorLevel !== undefined ? ` (${row.floorLevel})` : ''}</small></td><td>{t(`locationType_${row.nodeType}`)}</td><td>{row.code}</td><td><Badge tone={existingKeys.has(row.externalKey) ? 'amber' : 'green'}>{t(existingKeys.has(row.externalKey) ? 'importUpdate' : 'importCreate')}</Badge></td></tr>)}</tbody></table></div>}
        {canCommit && <><label className="checkbox-field import-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>{t('importConfirm')}</label><footer className="form-footer"><Button disabled={!confirmed || busy || !navigator.onLine} onClick={commit}>{busy ? t('loading') : t('importCommit')}<ArrowRight size={16}/></Button></footer></>}
      </section>}
    </>}
  </div>;
}
