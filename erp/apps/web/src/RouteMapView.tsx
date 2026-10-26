import { useEffect, useMemo, useRef, useState } from 'react';
import { berlinDay, buildRouteMapModel, routeProjection, type AuthorizedRouteRecords, type RoutePoint } from './routeMapModel';
import './RouteMapView.css';

export type RouteMapLabelKey = 'title' | 'description' | 'day' | 'allTrips' | 'trip' | 'measuredPoints' | 'sites' | 'statuses' | 'empty' | 'missingPosition' | 'noRoute' | 'uncertain' | 'source' | 'observed' | 'received' | 'accuracy' | 'employee' | 'device' | 'policy' | 'privateNotice' | 'gapNotice' | 'sourceNotice' | 'zoomIn' | 'zoomOut' | 'reset' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'openSite' | 'refresh' | 'latestSnapshot' | 'limited' | 'routeStatus' | 'approval' | 'activity' | 'tracker' | 'presence' | 'purpose' | 'start' | 'end' | 'intervals' | 'collectionMode' | 'selection';
export interface RouteMapViewProps {
  records: AuthorizedRouteRecords;
  copy: (key: RouteMapLabelKey) => string;
  locale?: string;
  stateLabel?: (state: string) => string;
  onOpenSite?: (siteId: string) => void;
  onRefresh?: () => void;
  receivedAt?: string;
}
const colors = ['#196b70', '#705a98', '#a45622', '#446535', '#8d435a', '#2f5b96'];
const safeLocale = (value: string) => { try { return Intl.getCanonicalLocales(value)[0] || 'de-DE'; } catch { return 'de-DE'; } };

/** Only renders authorized response data. It never starts GPS or calls a map provider. */
export default function RouteMapView({ records, copy, locale = 'de-DE', stateLabel = state => state.replaceAll('_', ' '), onOpenSite, onRefresh, receivedAt }: RouteMapViewProps) {
  const [now, setNow] = useState(Date.now()), [day, setDay] = useState(() => berlinDay(Date.now()));
  const [tripId, setTripId] = useState(''), [selectedId, setSelectedId] = useState('');
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; clientX: number; clientY: number; width: number; height: number; pointerId: number } | null>(null);
  const model = useMemo(() => buildRouteMapModel(records, day, now), [records, day, now]);
  useEffect(() => {
    const resume = () => setNow(Date.now());
    window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, []);
  useEffect(() => {
    // Re-evaluate TTL exactly at the earliest displayed expiration, including idle tabs.
    const expiry = model.nextExpiryAt ? Date.parse(model.nextExpiryAt) - Date.now() : 30000;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(30000, expiry)));
    return () => clearTimeout(timer);
  }, [model.nextExpiryAt, now]);
  useEffect(() => { if (tripId && !model.trips.some(trip => trip.id === tripId)) setTripId(''); }, [tripId, model.trips]);
  useEffect(() => { if (selectedId && !model.points.some(point => point.id === selectedId)) setSelectedId(''); }, [selectedId, model.points]);
  const trips = model.trips.filter(trip => !tripId || trip.id === tripId);
  const points = model.points.filter(point => !tripId || point.tripId === tripId);
  const sites = model.sites;
  const sitePositions = sites.filter(site => site.position);
  const projection = useMemo(() => routeProjection([...points, ...sitePositions.map(site => site.position!)]), [points, sitePositions]);
  const selected = points.find(point => point.id === selectedId);
  const formatter = useMemo(() => new Intl.DateTimeFormat(safeLocale(locale), { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium' }), [locale]);
  const time = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : '—';
  const siteName = (id: string | null) => sites.find(site => site.id === id)?.name || copy('missingPosition');
  const color = (id: string) => colors[Math.max(0, model.trips.findIndex(trip => trip.id === id)) % colors.length];
  function zoom(delta: number) { setViewport(current => ({ ...current, zoom: Math.max(1, Math.min(8, current.zoom + delta)) })); }
  function pan(dx: number, dy: number) { setViewport(current => ({ ...current, x: Math.max(-2000, Math.min(2000, current.x + dx)), y: Math.max(-1200, Math.min(1200, current.y + dy)) })); }
  function choose(point: RoutePoint) { setSelectedId(point.id); }
  function focusSite(siteId: string) {
    const site = sites.find(site => site.id === siteId);
    if (!site?.position) return;
    const position = projection(site.position);
    setViewport({ zoom: 2, x: 500 - position.x * 2, y: 300 - position.y * 2 });
  }
  return <section className="route-map" aria-label={copy('title')}>
    <header className="route-map-heading"><div><h2>{copy('title')}</h2><p>{copy('description')}</p></div>{onRefresh && <button type="button" onClick={() => { setNow(Date.now()); onRefresh(); }}>{copy('refresh')}</button>}</header>
    <div className="route-map-filters">
      <label><span>{copy('day')} · Europe/Berlin</span><input type="date" value={day} max={berlinDay(now)} onChange={event => { setDay(event.target.value); setSelectedId(''); setTripId(''); setViewport({ zoom: 1, x: 0, y: 0 }); }}/></label>
      <label><span>{copy('trip')}</span><select value={tripId} onChange={event => { setTripId(event.target.value); setSelectedId(''); setViewport({ zoom: 1, x: 0, y: 0 }); }}><option value="">{copy('allTrips')}</option>{model.trips.map(trip => <option key={trip.id} value={trip.id}>{time(trip.startAt)} · {siteName(trip.destinationSiteId)}</option>)}</select></label>
    </div>
    {receivedAt && <p className="route-map-snapshot">{copy('latestSnapshot')}: <time>{time(receivedAt)}</time></p>}
    <p className="route-map-privacy">{copy('privateNotice')}</p>
    {model.limited && <p className="route-map-warning" role="status">{copy('limited')}</p>}
    <div className="route-map-canvas-shell">
      <div className="route-map-tools" aria-label={copy('selection')}>
        <button type="button" aria-label={copy('zoomIn')} onClick={() => zoom(0.5)} disabled={viewport.zoom >= 8}>+</button>
        <button type="button" aria-label={copy('zoomOut')} onClick={() => zoom(-0.5)} disabled={viewport.zoom <= 1}>−</button>
        <button type="button" aria-label={copy('panLeft')} onClick={() => pan(80, 0)}>←</button><button type="button" aria-label={copy('panRight')} onClick={() => pan(-80, 0)}>→</button>
        <button type="button" aria-label={copy('panUp')} onClick={() => pan(0, 60)}>↑</button><button type="button" aria-label={copy('panDown')} onClick={() => pan(0, -60)}>↓</button>
        <button type="button" onClick={() => setViewport({ zoom: 1, x: 0, y: 0 })}>{copy('reset')}</button>
      </div>
      <svg className="route-map-canvas" viewBox="0 0 1000 600" role="img" aria-label={`${copy('measuredPoints')}: ${points.length}. ${copy('sourceNotice')}`} onPointerDown={event => {
        if ((event.target as Element).closest('[data-route-marker]')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        drag.current = { ...viewport, clientX: event.clientX, clientY: event.clientY, width: rect.width, height: rect.height, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        const start = drag.current; if (!start || start.pointerId !== event.pointerId) return;
        setViewport(current => ({ ...current, x: Math.max(-2000, Math.min(2000, start.x + (event.clientX - start.clientX) * 1000 / Math.max(1, start.width))), y: Math.max(-1200, Math.min(1200, start.y + (event.clientY - start.clientY) * 600 / Math.max(1, start.height))) }));
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <title>{copy('title')}</title><desc>{copy('sourceNotice')}</desc>
        <rect width="1000" height="600" fill="#f0f5f4"/>
        {[100, 200, 300, 400, 500].map(y => <line key={`y${y}`} x1="0" x2="1000" y1={y} y2={y} stroke="#d7e5e1"/>)}
        {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(x => <line key={`x${x}`} y1="0" y2="600" x1={x} x2={x} stroke="#d7e5e1"/>)}
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {sitePositions.map(site => { const p = projection(site.position!); return <g key={site.id} transform={`translate(${p.x} ${p.y})`} data-route-marker="site" role="button" tabIndex={0} aria-label={site.name} onClick={() => focusSite(site.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusSite(site.id); } }}><title>{site.name} · {site.address}</title><path d="M-9,-7 L0,-15 L9,-7 L9,9 L-9,9Z" fill="#fff" stroke="#315b53" strokeWidth={2 / viewport.zoom}/><text x="15" y="4" fontSize={14 / viewport.zoom} fill="#24473f">{site.code || site.name.slice(0, 20)}</text></g>; })}
          {points.map((point, index) => { const p = projection(point), uncertain = point.quality === 'UNCERTAIN'; return <g key={point.id} transform={`translate(${p.x} ${p.y})`} data-route-marker="point" role="button" tabIndex={0} aria-label={`${copy('measuredPoints')} ${index + 1}: ${time(point.observedAt)}${uncertain ? ` · ${copy('uncertain')}` : ''}`} onClick={() => choose(point)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(point); } }}><title>{time(point.observedAt)} · ±{point.accuracyM}m · {point.source}</title><circle r={(selectedId === point.id ? 10 : 7) / viewport.zoom} fill={uncertain ? '#fff' : color(point.tripId)} stroke={color(point.tripId)} strokeWidth={3 / viewport.zoom} strokeDasharray={uncertain ? `${3 / viewport.zoom} ${2 / viewport.zoom}` : undefined}/>{selectedId === point.id && <circle r={15 / viewport.zoom} fill="none" stroke="#172a24" strokeWidth={1.5 / viewport.zoom}/>}</g>; })}
        </g>
        {!points.length && !sitePositions.length && <text x="500" y="300" textAnchor="middle" fill="#46635b" fontSize="22">{copy('empty')}</text>}
        <text x="20" y="575" fill="#557369" fontSize="14">N ↑ · {copy('measuredPoints')}: {points.length}</text>
      </svg>
      <p className="route-map-caption">{copy('sourceNotice')}</p>
    </div>
    {selected && <section className="route-map-point" aria-live="polite"><h3>{copy('selection')}</h3><dl><dt>{copy('observed')}</dt><dd>{time(selected.observedAt)}</dd><dt>{copy('received')}</dt><dd>{time(selected.receivedAt)}</dd><dt>{copy('accuracy')}</dt><dd>±{selected.accuracyM} m{selected.quality === 'UNCERTAIN' ? ` · ${copy('uncertain')}` : ''}</dd><dt>{copy('source')}</dt><dd>{selected.source}</dd><dt>{copy('device')}</dt><dd>{selected.deviceId}</dd><dt>{copy('policy')}</dt><dd>{selected.policyVersionId}</dd></dl></section>}
    <div className="route-map-details">
      <section><h3>{copy('trip')}</h3>{!trips.length && <p>{copy('noRoute')}</p>}<ol className="route-map-trips">{trips.map(trip => <li key={trip.id}><div className="route-map-trip-heading"><span className="route-map-dot" style={{ backgroundColor: color(trip.id) }}/><strong>{siteName(trip.originSiteId)} → {siteName(trip.destinationSiteId)}</strong></div><p>{trip.purpose}</p><dl><dt>{copy('employee')}</dt><dd>{trip.employeeId}</dd><dt>{copy('start')}</dt><dd>{time(trip.startAt)}</dd><dt>{copy('end')}</dt><dd>{time(trip.endAt)}</dd><dt>{copy('routeStatus')}</dt><dd>{stateLabel(trip.state)} · {stateLabel(trip.routeAvailability)}</dd><dt>{copy('approval')}</dt><dd>{stateLabel(trip.approvalState)}</dd></dl>{!trip.points.length ? <p className="route-map-warning">{copy('noRoute')}</p> : <details><summary>{copy('measuredPoints')}: {trip.points.length}</summary><ol className="route-map-point-list">{trip.points.map(point => <li key={point.id}><button type="button" onClick={() => choose(point)}>{time(point.observedAt)} · ±{point.accuracyM} m{point.quality === 'UNCERTAIN' && ` · ${copy('uncertain')}`}</button></li>)}</ol></details>}{trip.gapCount > 0 && <p className="route-map-warning">{copy('gapNotice')} ({trip.gapCount})</p>}{trip.intervals.length > 0 && <details><summary>{copy('intervals')}</summary><ol>{trip.intervals.map(interval => <li key={interval.id}>{time(interval.startAt)} — {time(interval.endAt)} · {stateLabel(interval.activity)}</li>)}</ol></details>}</li>)}</ol></section>
      <section><h3>{copy('sites')}</h3><ul className="route-map-sites">{sites.map(site => <li key={site.id}><strong>{site.code && `${site.code} · `}{site.name}</strong><p>{site.address}</p>{site.position ? <button type="button" onClick={() => focusSite(site.id)}>{copy('selection')}</button> : <span>{copy('missingPosition')}</span>}{onOpenSite && <button type="button" onClick={() => onOpenSite(site.id)}>{copy('openSite')}</button>}</li>)}</ul></section>
    </div>
    <section className="route-map-statuses"><h3>{copy('statuses')}</h3>{!model.statuses.length && <p>{copy('empty')}</p>}<ul>{model.statuses.map(status => <li key={status.shiftId}><strong>{status.employeeId}</strong><dl><dt>{copy('activity')}</dt><dd>{stateLabel(status.activity)}</dd><dt>{copy('tracker')}</dt><dd>{stateLabel(status.trackerState)}</dd><dt>{copy('presence')}</dt><dd>{stateLabel(status.presence)}</dd><dt>{copy('collectionMode')}</dt><dd>{stateLabel(status.collectionMode)}</dd><dt>{copy('observed')}</dt><dd>{time(status.observedAt)}</dd></dl></li>)}</ul></section>
  </section>;
}
