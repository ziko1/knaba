import { inflateRawSync } from 'node:zlib';
import { posix } from 'node:path';
import { z } from 'zod';
import { operationsCommands } from '../domain/operations.ts';

export interface LocationImportError { row?: number; column?: string; code: string; message: string; }
export interface LocationImportResult { rows: Record<string, unknown>[]; errors: LocationImportError[]; sourceRows?: number[]; }
const limits = { file: 8 * 1024 * 1024, expanded: 16 * 1024 * 1024, part: 5 * 1024 * 1024, entries: 200, rows: 1000, columns: 32, field: 32767, nodes: 100000, depth: 64 } as const;
const mainNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const packageNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const officeNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
class ImportFailure extends Error { constructor(readonly issue: LocationImportError) { super(issue.message); } }
function fail(code: string, message: string, detail: Pick<LocationImportError, 'row' | 'column'> = {}): never { throw new ImportFailure({ code, message, ...detail }); }
function check(condition: unknown, code: string, message: string): asserts condition { if (!condition) fail(code, message); }
function utf8(bytes: Uint8Array): string { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); } catch { return fail('FILE_ENCODING', 'Use valid UTF-8 text; UTF-16, legacy encodings and invalid bytes are unsupported.'); } }
type Cell = string | number | boolean;
interface TableRow { row: number; cells: Cell[]; }

function csvTable(text: string): TableRow[] {
  check(!text.includes('\0'), 'CSV_SYNTAX', 'CSV cannot contain NUL characters.');
  let delimiter = '', content = text, firstLine = 1;
  const directive = /^sep=([;,])(?:\r\n|\r|\n)/i.exec(content);
  if (directive) { delimiter = directive[1]!; content = content.slice(directive[0].length); firstLine++; }
  if (!delimiter) {
    let quoted = false, commas = 0, semicolons = 0;
    for (let i = 0; i < content.length; i++) { const c = content[i]!; if (c === '"') { if (quoted && content[i + 1] === '"') i++; else quoted = !quoted; } else if (!quoted && (c === '\n' || c === '\r')) break; else if (!quoted && c === ',') commas++; else if (!quoted && c === ';') semicolons++; }
    check(!(commas && semicolons), 'CSV_DELIMITER', 'The header mixes comma and semicolon separators.'); delimiter = semicolons ? ';' : ',';
  }
  const output: TableRow[] = []; let fields: string[] = [], field = '', quoted = false, closed = false, line = firstLine, recordLine = firstLine;
  const pushField = () => { check(fields.length < limits.columns, 'FILE_COLUMNS', `At most ${limits.columns} columns are allowed.`); fields.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); if (fields.some(s => s.trim() !== '')) { check(output.length <= limits.rows, 'FILE_ROWS', `At most ${limits.rows} data rows are allowed.`); output.push({ row: recordLine, cells: fields }); } fields = []; recordLine = line + 1; };
  for (let i = 0; i < content.length; i++) {
    const c = content[i]!;
    if (quoted) {
      if (c === '"') { if (content[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else if (c === '\r' || c === '\n') { if (c === '\r' && content[i + 1] === '\n') i++; field += '\n'; line++; }
      else field += c;
    } else if (c === delimiter) pushField();
    else if (c === '\r' || c === '\n') { pushRow(); if (c === '\r' && content[i + 1] === '\n') i++; line++; }
    else if (c === '"') { if (field.trim() || closed) fail('CSV_SYNTAX', 'A quote must start a field or escape a quote inside a quoted field.', { row: recordLine }); field = ''; quoted = true; }
    else if (closed) { if (!/[ \t]/.test(c)) fail('CSV_SYNTAX', 'Unexpected text after a closing quote.', { row: recordLine }); }
    else field += c;
    if (field.length > limits.field) fail('FILE_CELL_SIZE', `A cell exceeds ${limits.field} characters.`, { row: recordLine });
  }
  if (quoted) fail('CSV_SYNTAX', 'A quoted CSV field is not closed.', { row: recordLine });
  if (fields.length || field.length || closed) pushRow(); return output;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) { let c = i; for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[i] = c >>> 0; }
function crc32(bytes: Buffer): number { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function extraFields(bytes: Buffer): void { for (let at = 0; at < bytes.length;) { check(at + 4 <= bytes.length, 'XLSX_ZIP_INVALID', 'Malformed ZIP extra field.'); const type = bytes.readUInt16LE(at), size = bytes.readUInt16LE(at + 2); check(at + 4 + size <= bytes.length && type !== 1 && type !== 0x9901, 'XLSX_UNSUPPORTED', 'ZIP64 and encrypted ZIP extensions are unsupported.'); at += 4 + size; } }
function safePartPath(name: string): void { check(name.length > 0 && name.length <= 250 && !/[\\:\u0000-\u001f]/.test(name) && !name.startsWith('/') && !name.split('/').some((s, i, all) => s === '..' || s === '.' || (!s && i !== all.length - 1)) && !/%(?:2f|5c|2e)/i.test(name), 'XLSX_ZIP_UNSAFE_PATH', 'The archive contains an unsafe part path.'); }
function unzip(bytes: Buffer): Map<string, Buffer> {
  check(bytes.length >= 22 && bytes.readUInt32LE(0) === 0x04034b50, 'XLSX_ZIP_INVALID', 'XLSX must be an ordinary ZIP-based workbook; legacy/encrypted containers are unsupported.');
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
  check(end >= 0, 'XLSX_ZIP_INVALID', 'The ZIP central directory is missing or truncated.');
  const count = bytes.readUInt16LE(end + 10), directorySize = bytes.readUInt32LE(end + 12), directoryOffset = bytes.readUInt32LE(end + 16);
  check(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0 && bytes.readUInt16LE(end + 8) === count && count > 0 && count <= limits.entries && directoryOffset !== 0xffffffff && directorySize !== 0xffffffff && directoryOffset + directorySize === end, 'XLSX_UNSUPPORTED', 'Multipart/ZIP64 archives, excessive entries and invalid directory bounds are unsupported.');
  const output = new Map<string, Buffer>(), names = new Set<string>(), ranges: [number, number][] = []; let cursor = directoryOffset, total = 0;
  for (let index = 0; index < count; index++) {
    check(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'XLSX_ZIP_INVALID', 'Malformed ZIP central-directory entry.');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), crc = bytes.readUInt32LE(cursor + 16), packed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32), offset = bytes.readUInt32LE(cursor + 42), attrs = bytes.readUInt32LE(cursor + 38);
    check(cursor + 46 + nameLength + extraLength + commentLength <= end && bytes.readUInt16LE(cursor + 34) === 0, 'XLSX_ZIP_INVALID', 'ZIP entry fields exceed their declared bounds.');
    check(!(flags & ~0x080e) && [0, 8].includes(method) && ((attrs >>> 16) & 0xf000) !== 0xa000, 'XLSX_UNSUPPORTED', 'Encrypted, unsupported-compression or symlink entries are rejected.');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength); if (!(flags & 0x800)) check(nameBytes.every(b => b < 128), 'XLSX_UNSUPPORTED', 'Non-UTF-8 archive part names are unsupported.');
    const name = utf8(nameBytes); safePartPath(name); check(!names.has(name.toLowerCase()), 'XLSX_ZIP_INVALID', 'Duplicate or case-ambiguous archive part names are rejected.'); names.add(name.toLowerCase());
    extraFields(bytes.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    check(size <= limits.part && packed <= limits.file && total + size <= limits.expanded && (size < 65536 || size <= Math.max(1, packed) * 200), 'XLSX_ZIP_BOMB', 'The expanded archive exceeds import limits.'); total += size;
    check(offset + 30 <= directoryOffset && bytes.readUInt32LE(offset) === 0x04034b50, 'XLSX_ZIP_INVALID', 'The ZIP local header is missing or overlaps the central directory.');
    const localName = bytes.readUInt16LE(offset + 26), localExtra = bytes.readUInt16LE(offset + 28), dataStart = offset + 30 + localName + localExtra, dataEnd = dataStart + packed;
    check(dataEnd <= directoryOffset && bytes.readUInt16LE(offset + 6) === flags && bytes.readUInt16LE(offset + 8) === method && bytes.subarray(offset + 30, offset + 30 + localName).equals(nameBytes), 'XLSX_ZIP_INVALID', 'ZIP local and central headers disagree.');
    extraFields(bytes.subarray(offset + 30 + localName, dataStart)); let rangeEnd = dataEnd;
    if (!(flags & 8)) check(bytes.readUInt32LE(offset + 14) === crc && bytes.readUInt32LE(offset + 18) === packed && bytes.readUInt32LE(offset + 22) === size, 'XLSX_ZIP_INVALID', 'ZIP sizes or CRC differ between headers.');
    else { const signed = dataEnd + 4 <= directoryOffset && bytes.readUInt32LE(dataEnd) === 0x08074b50, descriptor = dataEnd + (signed ? 4 : 0); check(descriptor + 12 <= directoryOffset && bytes.readUInt32LE(descriptor) === crc && bytes.readUInt32LE(descriptor + 4) === packed && bytes.readUInt32LE(descriptor + 8) === size, 'XLSX_ZIP_INVALID', 'ZIP data descriptor does not match its central directory.'); rangeEnd = descriptor + 12; }
    ranges.push([offset, rangeEnd]); let part: Buffer;
    try { part = method === 0 ? Buffer.from(bytes.subarray(dataStart, dataEnd)) : inflateRawSync(bytes.subarray(dataStart, dataEnd), { maxOutputLength: Math.max(1, size + 1) }); } catch { return fail('XLSX_ZIP_INVALID', 'A compressed workbook part is invalid or exceeds its declared size.'); }
    check(part.length === size && crc32(part) === crc, 'XLSX_ZIP_CRC', 'A workbook part failed size/CRC integrity verification.');
    if (!name.endsWith('/')) output.set(name, part); cursor += 46 + nameLength + extraLength + commentLength;
  }
  check(cursor === end, 'XLSX_ZIP_INVALID', 'Unexpected data in the central directory.'); ranges.sort((a, b) => a[0] - b[0]); check(ranges.every((range, index) => !index || ranges[index - 1]![1] <= range[0]), 'XLSX_ZIP_INVALID', 'Workbook part data ranges overlap.'); return output;
}

interface XmlAttribute { name: string; local: string; namespace: string; value: string; }
interface XmlNode { name: string; local: string; namespace: string; attributes: XmlAttribute[]; children: XmlNode[]; text: string[]; }
function entities(text: string): string {
  return text.replace(/&([^;]*);|&/g, (matched, body: string | undefined) => {
    if (!body) return fail('XLSX_XML_UNSAFE', 'Malformed XML entity.');
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }; if (Object.hasOwn(named, body)) return named[body]!;
    const numeric = /^#(\d+)$/.exec(body) ?? /^#x([0-9a-f]+)$/i.exec(body); if (!numeric) return fail('XLSX_XML_UNSAFE', 'Declared/external/unknown XML entities are not permitted.');
    const code = Number.parseInt(numeric[1]!, /^#x/i.test(body) ? 16 : 10); check(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff), 'XLSX_XML_UNSAFE', 'XML character reference is invalid.'); return String.fromCodePoint(code);
  });
}
function xml(bytes: Buffer): XmlNode {
  const source = utf8(bytes).replace(/\r\n?/g, '\n'); check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source) && !/<!\s*(?:DOCTYPE|ENTITY)/i.test(source), 'XLSX_XML_UNSAFE', 'DTD/entities and invalid XML controls are forbidden.');
  const stack: { node: XmlNode; namespaces: Map<string, string> }[] = []; let root: XmlNode | undefined, count = 0, at = 0;
  const append = (raw: string, decode = true) => { const text = decode ? entities(raw) : raw; if (!stack.length) check(text.trim() === '', 'XLSX_XML_INVALID', 'Text occurs outside the XML document root.'); else stack.at(-1)!.node.text.push(text); };
  while (at < source.length) {
    if (source[at] !== '<') { let next = source.indexOf('<', at); if (next < 0) next = source.length; check(!source.slice(at, next).includes(']]>'), 'XLSX_XML_INVALID', 'Invalid XML text delimiter.'); append(source.slice(at, next)); at = next; continue; }
    if (source.startsWith('<!--', at)) { const end = source.indexOf('-->', at + 4); check(end >= 0 && !source.slice(at + 4, end).includes('--'), 'XLSX_XML_INVALID', 'Invalid XML comment.'); at = end + 3; continue; }
    if (source.startsWith('<![CDATA[', at)) { const end = source.indexOf(']]>', at + 9); check(end >= 0 && stack.length, 'XLSX_XML_INVALID', 'Invalid CDATA section.'); append(source.slice(at + 9, end), false); at = end + 3; continue; }
    if (source.startsWith('<?', at)) { const end = source.indexOf('?>', at + 2); check(end >= 0 && !root && /^<\?xml\s/i.test(source.slice(at, end)) && !/encoding\s*=\s*['"](?!UTF-8['"])/i.test(source.slice(at, end)), 'XLSX_UNSUPPORTED', 'Only a UTF-8 XML declaration is supported.'); at = end + 2; continue; }
    check(!source.startsWith('<!', at), 'XLSX_XML_UNSAFE', 'XML declarations/entities are unsupported.');
    let end = at + 1, quote = ''; for (; end < source.length; end++) { const c = source[end]!; if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break; }
    check(end < source.length, 'XLSX_XML_INVALID', 'Unclosed XML tag.'); let tag = source.slice(at + 1, end); at = end + 1;
    if (tag.startsWith('/')) { const name = tag.slice(1).trim(); check(/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name) && stack.at(-1)?.node.name === name, 'XLSX_XML_INVALID', 'XML closing tags are not balanced.'); stack.pop(); continue; }
    const selfClosing = /\/\s*$/.test(tag); if (selfClosing) tag = tag.replace(/\/\s*$/, '');
    const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(tag); check(match, 'XLSX_XML_INVALID', 'Invalid XML element name.'); const name = match[1]!; let position = name.length;
    const rawAttrs: { name: string; value: string }[] = [], attributeNames = new Set<string>();
    const attribute = /\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
    while (position < tag.length) { if (tag.slice(position).trim() === '') break; attribute.lastIndex = position; const a = attribute.exec(tag); check(a && !attributeNames.has(a[1]!) && rawAttrs.length < 100 && !(a[3] ?? a[4] ?? '').includes('<'), 'XLSX_XML_INVALID', 'Invalid or duplicate XML attribute.'); attributeNames.add(a[1]!); rawAttrs.push({ name: a[1]!, value: entities((a[3] ?? a[4]!).replace(/[\t\n\r]/g, ' ')) }); position = attribute.lastIndex; }
    const namespaces = new Map(stack.at(-1)?.namespaces ?? [['xml', 'http://www.w3.org/XML/1998/namespace']]);
    for (const a of rawAttrs) if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) namespaces.set(a.name === 'xmlns' ? '' : a.name.slice(6), a.value);
    const split = name.split(':'); check(split.length <= 2 && (!name.includes(':') || namespaces.has(split[0]!)), 'XLSX_XML_INVALID', 'Unbound XML namespace.'); const namespace = namespaces.get(split.length === 2 ? split[0]! : '') ?? '';
    const attributes: XmlAttribute[] = []; const expandedNames = new Set<string>();
    for (const a of rawAttrs) { if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue; const s = a.name.split(':'); check(s.length <= 2 && (s.length === 1 || namespaces.has(s[0]!)), 'XLSX_XML_INVALID', 'Unbound attribute namespace.'); const ns = s.length === 2 ? namespaces.get(s[0]!)! : '', local = s.at(-1)!, key = `${ns}:${local}`; check(!expandedNames.has(key), 'XLSX_XML_INVALID', 'Ambiguous duplicate XML attributes.'); expandedNames.add(key); attributes.push({ ...a, namespace: ns, local }); }
    const node: XmlNode = { name, local: split.at(-1)!, namespace, attributes, children: [], text: [] }; check(++count <= limits.nodes && stack.length < limits.depth, 'XLSX_XML_LIMIT', 'XML node/depth limits exceeded.');
    if (stack.length) stack.at(-1)!.node.children.push(node); else { check(!root, 'XLSX_XML_INVALID', 'XML has multiple document roots.'); root = node; }
    if (!selfClosing) stack.push({ node, namespaces });
  }
  check(root && !stack.length, 'XLSX_XML_INVALID', 'XML document is empty or unbalanced.'); return root;
}
function attr(node: XmlNode, name: string, namespace = ''): string | undefined { return node.attributes.find(a => a.local === name && a.namespace === namespace)?.value; }
function children(node: XmlNode, local: string, namespace = mainNS): XmlNode[] { return node.children.filter(c => c.local === local && c.namespace === namespace); }
function descendants(node: XmlNode, local: string): XmlNode[] { const output: XmlNode[] = []; const visit = (n: XmlNode) => { if (n.local === local && n.namespace === mainNS) output.push(n); n.children.forEach(visit); }; visit(node); return output; }
function content(node: XmlNode): string { check(node.children.length === 0, 'XLSX_XML_INVALID', 'Unexpected nested cell-value XML.'); const text = node.text.join(''); check(text.length <= limits.field, 'FILE_CELL_SIZE', 'A workbook cell exceeds the character limit.'); return text; }
function richString(node: XmlNode): string { const direct = children(node, 't'), runs = children(node, 'r'); check(direct.length <= 1 && !(direct.length && runs.length), 'XLSX_XML_INVALID', 'A string cannot mix plain text with rich-text runs.'); const nodes = [...direct, ...runs.flatMap(r => children(r, 't'))]; const text = nodes.map(content).join(''); check(text.length <= limits.field, 'FILE_CELL_SIZE', 'A shared/inline string exceeds the character limit.'); return text; }
function numericInteger(raw: string): number {
  // All numeric location fields are integers. Verify decimal/exponent text before conversion,
  // preventing values such as 9007199254740991.1 or 1e-999 from silently rounding to an ID.
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(raw), value = Number(raw);
  check(match && Number.isSafeInteger(value), 'XLSX_NUMERIC_PRECISION', 'Use exact safe-integer numeric cells; store other identifiers and labels as text.');
  const [whole, fraction = ''] = match[2]!.split('.'), digits = `${whole || '0'}${fraction}`.replace(/^0+/, ''), exponent = Number(match[3] ?? 0), scale = exponent - fraction.length;
  if (!digits) return 0;
  check(Number.isSafeInteger(exponent) && scale >= -digits.length && scale <= 16, 'XLSX_NUMERIC_PRECISION', 'A numeric cell would lose precision or underflow.');
  let integer = digits;
  if (scale < 0) { const zeros = -scale; check(/^0*$/.test(digits.slice(-zeros)), 'XLSX_NUMERIC_PRECISION', 'A numeric cell has a fractional component.'); integer = digits.slice(0, -zeros); }
  else integer += '0'.repeat(scale);
  check(integer.length <= 16 && BigInt(`${match[1] === '-' ? '-' : ''}${integer || '0'}`) === BigInt(value), 'XLSX_NUMERIC_PRECISION', 'A numeric cell cannot be represented exactly.'); return value;
}
function sourceOfRelationship(path: string): string { if (path === '_rels/.rels') return ''; const match = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(path); check(match, 'XLSX_ZIP_UNSAFE_PATH', 'Invalid relationship part path.'); return (match[1] ?? '') + match[2]!; }
function targetPart(source: string, raw: string): string { check(raw.length > 0 && !/[\\?#]/.test(raw) && !/^\/\//.test(raw) && !/^[a-z][a-z0-9+.-]*:/i.test(raw), 'XLSX_EXTERNAL_RELATIONSHIP', 'External/URI relationships are forbidden.'); let target: string; try { target = decodeURIComponent(raw); } catch { return fail('XLSX_ZIP_UNSAFE_PATH', 'Malformed relationship target encoding.'); } const resolved = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(source || '.'), target)); safePartPath(resolved); return resolved; }
interface Relationship { id: string; type: string; target: string; }
function workbookTable(bytes: Buffer): TableRow[] {
  const parts = unzip(bytes), docs = new Map<string, XmlNode>(), relations = new Map<string, Relationship[]>();
  for (const [name, bytes] of parts) {
    check(!/(?:vbaProject|activeX|externalLinks|embeddings|\.bin$)/i.test(name), 'XLSX_UNSUPPORTED', 'Macros, embedded active content and external-link parts are forbidden.');
    if (name.endsWith('.xml') || name.endsWith('.rels')) docs.set(name, xml(bytes));
  }
  const types = docs.get('[Content_Types].xml'); check(types?.local === 'Types' && types.namespace === 'http://schemas.openxmlformats.org/package/2006/content-types', 'XLSX_UNSUPPORTED', 'Missing/unsupported workbook content types.');
  for (const n of types.children) check(!/(?:macroEnabled|vbaProject|activeX|oleObject|externalLink)/i.test(attr(n, 'ContentType') ?? ''), 'XLSX_UNSUPPORTED', 'Workbook active-content types are forbidden.');
  for (const [path, document] of docs) if (path.endsWith('.rels')) {
    check(document.local === 'Relationships' && document.namespace === packageNS, 'XLSX_UNSUPPORTED', 'Unsupported relationships namespace.'); const items: Relationship[] = [], ids = new Set<string>();
    for (const n of document.children) { check(n.local === 'Relationship' && n.namespace === packageNS && (attr(n, 'TargetMode') ?? 'Internal') === 'Internal', 'XLSX_EXTERNAL_RELATIONSHIP', 'External relationships are forbidden.'); const id = attr(n, 'Id'), type = attr(n, 'Type'), target = attr(n, 'Target'); check(id && type && target && !ids.has(id), 'XLSX_XML_INVALID', 'Relationship fields are missing or duplicated.'); const resolved = targetPart(sourceOfRelationship(path), target); check(parts.has(resolved), 'XLSX_ZIP_INVALID', 'A relationship points to a missing workbook part.'); ids.add(id); items.push({ id, type, target: resolved }); }
    relations.set(path, items);
  }
  const office = (relations.get('_rels/.rels') ?? []).filter(r => r.type === `${officeNS}/officeDocument`); check(office.length === 1, 'XLSX_UNSUPPORTED', 'Exactly one OOXML workbook document is required.'); const workbookPath = office[0]!.target, workbook = docs.get(workbookPath);
  check(workbook?.local === 'workbook' && workbook.namespace === mainNS, 'XLSX_UNSUPPORTED', 'Only transitional spreadsheet OOXML workbooks are supported.');
  const sheetContainers = children(workbook, 'sheets'); check(sheetContainers.length === 1, 'XLSX_XML_INVALID', 'Workbook sheet list is missing or ambiguous.'); const sheets = children(sheetContainers[0]!, 'sheet'); check(sheets.length === 1 && (attr(sheets[0]!, 'state') ?? 'visible') === 'visible', 'XLSX_UNSUPPORTED', 'Use one visible worksheet for a location import.');
  const workbookRels = relations.get(posix.join(posix.dirname(workbookPath), '_rels', `${posix.basename(workbookPath)}.rels`)) ?? [], sheetId = attr(sheets[0]!, 'id', officeNS);
  const sheetRel = workbookRels.find(r => r.id === sheetId && r.type === `${officeNS}/worksheet`); check(sheetRel, 'XLSX_XML_INVALID', 'The worksheet relationship is missing.'); const sheet = docs.get(sheetRel.target); check(sheet?.local === 'worksheet' && sheet.namespace === mainNS, 'XLSX_UNSUPPORTED', 'Unsupported worksheet namespace.');
  check(descendants(sheet, 'f').length === 0, 'XLSX_FORMULA', 'Formulas are forbidden in location imports; provide explicit values.'); const sharedRel = workbookRels.find(r => r.type === `${officeNS}/sharedStrings`); let shared: string[] = [];
  if (sharedRel) { const sst = docs.get(sharedRel.target); check(sst?.local === 'sst' && sst.namespace === mainNS, 'XLSX_XML_INVALID', 'Invalid shared-string table.'); const entries = children(sst, 'si'); check(entries.length <= (limits.rows + 1) * limits.columns, 'XLSX_XML_LIMIT', 'Shared-string count exceeds import limits.'); shared = entries.map(richString); }
  const data = children(sheet, 'sheetData'); check(data.length === 1, 'XLSX_XML_INVALID', 'Worksheet data is missing or ambiguous.'); const output: TableRow[] = []; let previousRow = 0;
  for (const rowNode of children(data[0]!, 'row')) {
    const rowLabel = attr(rowNode, 'r'), rowNumber = rowLabel === undefined ? previousRow + 1 : Number(rowLabel); check((rowLabel === undefined || /^[1-9]\d*$/.test(rowLabel)) && Number.isInteger(rowNumber) && rowNumber > previousRow && rowNumber <= 1048576, 'XLSX_CELL_REFERENCE', 'Invalid/duplicate/reordered worksheet row reference.'); previousRow = rowNumber;
    const cells: Cell[] = [], occupied = new Set<number>(); let nextColumn = 0;
    for (const cell of children(rowNode, 'c')) {
      const address = attr(cell, 'r'); let column = nextColumn;
      if (address) { const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(address); check(match && Number(match[2]) === rowNumber, 'XLSX_CELL_REFERENCE', 'Cell address does not match its worksheet row.'); column = [...match[1]!].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1; }
      check(column >= nextColumn && column < limits.columns && !occupied.has(column), 'FILE_COLUMNS', 'Too many, duplicate or reordered workbook columns.'); occupied.add(column); nextColumn = column + 1;
      const type = attr(cell, 't') ?? 'n', values = children(cell, 'v'), inline = children(cell, 'is'); check(values.length <= 1 && inline.length <= 1, 'XLSX_XML_INVALID', 'A cell has duplicate value elements.'); let value: Cell = '';
      if (type === 'inlineStr') { check(inline.length === 1 && !values.length, 'XLSX_XML_INVALID', 'Invalid inline-string cell.'); value = richString(inline[0]!); }
      else if (values.length) { const raw = content(values[0]!);
        if (type === 's') { check(/^\d+$/.test(raw) && Number(raw) < shared.length, 'XLSX_XML_INVALID', 'Shared-string index is invalid.'); value = shared[Number(raw)]!; }
        else if (type === 'b') { check(raw === '0' || raw === '1', 'XLSX_XML_INVALID', 'Boolean cell must be 0 or 1.'); value = raw === '1'; }
        else if (type === 'str') value = raw;
        else if (type === 'n') value = numericInteger(raw);
        else fail('XLSX_UNSUPPORTED', 'Date/error/unsupported typed cells must be converted to explicit values.', { row: rowNumber, column: address });
      } else check(type === 'n' || type === 'str', 'XLSX_UNSUPPORTED', 'Cell type requires an explicit value.');
      while (cells.length < column) cells.push(''); cells[column] = value;
    }
    if (cells.some(c => String(c).trim() !== '')) { check(output.length <= limits.rows, 'FILE_ROWS', `At most ${limits.rows} data rows are allowed.`); output.push({ row: rowNumber, cells }); }
  }
  return output;
}

const headers = new Map<string, string>([
  ...['externalKey', 'parentExternalKey', 'nodeType', 'code', 'name', 'names', 'sortOrder', 'floorLevel', 'floorLabelDe', 'measurementValueMilli', 'measurementUnit', 'measurementSource', 'customTypeApproval'].map(s => [s, s] as [string, string]),
  ['external_key', 'externalKey'], ['parent_external_key', 'parentExternalKey'], ['node_type', 'nodeType'], ['sort_order', 'sortOrder'], ['floor_level', 'floorLevel'], ['floor_label_de', 'floorLabelDe'], ['measurement_value_milli', 'measurementValueMilli'], ['measurement_unit', 'measurementUnit'], ['measurement_source', 'measurementSource'], ['custom_type_approval', 'customTypeApproval'],
  ['floorNumber', 'floorLevel'], ['floorLabel', 'floorLabelDe'], ['unitType', 'measurementUnit'],
]);
const rowSchema = ((operationsCommands['location.import.preview']!.schema as z.ZodObject<any>).shape.rows as z.ZodArray<z.ZodTypeAny>).element;
function normalize(table: TableRow[]): LocationImportResult {
  const errors: LocationImportError[] = [], rows: Record<string, unknown>[] = [], sourceRows: number[] = [];
  if (!table.length) return { rows, sourceRows, errors: [{ code: 'FILE_EMPTY', message: 'The file has no header/data rows.' }] };
  const columnNames: string[] = [], seen = new Set<string>();
  for (const [index, value] of table[0]!.cells.entries()) { const supplied = String(value).trim(), canonical = headers.get(supplied); if (!canonical) errors.push({ row: table[0]!.row, column: supplied || String(index + 1), code: 'HEADER_UNKNOWN', message: `Unsupported header '${supplied}'. Use the documented canonical headers.` }); else if (seen.has(canonical)) errors.push({ row: table[0]!.row, column: supplied, code: 'HEADER_DUPLICATE', message: 'The same canonical field is present more than once.' }); if (canonical) seen.add(canonical); columnNames[index] = canonical ?? ''; }
  for (const required of ['externalKey', 'nodeType', 'code', 'name']) if (!seen.has(required)) errors.push({ row: table[0]!.row, column: required, code: 'HEADER_REQUIRED', message: `Required header '${required}' is missing.` });
  if (errors.length) return { rows, errors, sourceRows }; if (table.length === 1) return { rows, sourceRows, errors: [{ code: 'FILE_EMPTY', message: 'The file has headers but no location rows.' }] };
  for (const entry of table.slice(1)) {
    const startErrors = errors.length, row: Record<string, unknown> = {}, measurement: Record<string, unknown> = {};
    if (entry.cells.length > columnNames.length) { errors.push({ row: entry.row, code: 'ROW_COLUMNS', message: 'This row has more values than the header.' }); continue; }
    for (const [index, key] of columnNames.entries()) {
      const value = entry.cells[index] ?? '', raw = String(value).trim(); if (!raw && !['externalKey', 'nodeType', 'code', 'name'].includes(key)) continue;
      if (typeof value === 'boolean') { errors.push({ row: entry.row, column: key, code: 'CELL_INVALID', message: 'Boolean values are not supported for this location field.' }); continue; }
      if (['floorLevel', 'sortOrder', 'measurementValueMilli'].includes(key)) {
        if (!/^[+-]?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) errors.push({ row: entry.row, column: key, code: 'CELL_INVALID', message: 'Use an exact integer, without decimal or thousands separators.' });
        else if (key === 'measurementValueMilli') measurement.valueMilli = Number(raw); else row[key] = Number(raw);
      } else if (key === 'measurementUnit') measurement.unit = raw;
      else if (key === 'measurementSource') measurement.source = raw;
      else if (key === 'names') { try { row.names = JSON.parse(raw); } catch { errors.push({ row: entry.row, column: key, code: 'CELL_INVALID', message: 'Localized names must be a JSON object of language-to-name strings.' }); } }
      else row[key] = typeof value === 'number' ? String(value) : value;
    }
    if (Object.keys(measurement).length) row.measurement = measurement;
    if (row.nodeType === 'FLOOR' && (row.floorLevel === undefined || !row.floorLabelDe)) errors.push({ row: entry.row, column: 'floorLabelDe', code: 'FLOOR_LABEL_REQUIRED', message: 'Supply floorLevel and the actual German sign (UG, EG, 1. OG, etc.); labels are never inferred.' });
    if (row.nodeType === 'CUSTOM' && !row.customTypeApproval) errors.push({ row: entry.row, column: 'customTypeApproval', code: 'CUSTOM_TYPE_APPROVAL_REQUIRED', message: 'A CUSTOM location requires its recorded approval reference.' });
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) for (const issue of parsed.error.issues) errors.push({ row: entry.row, column: issue.path.join('.'), code: 'ROW_VALIDATION', message: issue.message });
    if (errors.length === startErrors && parsed.success) { rows.push(parsed.data); sourceRows.push(entry.row); }
  }
  return { rows, errors, sourceRows };
}

/** Pure, bounded ingestion. Scope, hierarchy validation, preview hash and commit remain server commands. */
export function parseLocationImport(bytes: Uint8Array, mimeType: string): LocationImportResult {
  try {
    check(bytes.byteLength > 0 && bytes.byteLength <= limits.file, 'FILE_TOO_LARGE', `Supply a nonempty file up to ${limits.file / 1024 / 1024} MiB.`);
    const mime = mimeType.split(';')[0]!.trim().toLowerCase(), buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (mime === 'text/csv' || mime === 'application/csv') return normalize(csvTable(utf8(buffer)));
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return normalize(workbookTable(buffer));
    return { rows: [], sourceRows: [], errors: [{ code: 'FILE_TYPE', message: 'Only UTF-8 CSV and ordinary .xlsx workbooks are supported; legacy .xls is not accepted.' }] };
  } catch (error) {
    if (error instanceof ImportFailure) return { rows: [], sourceRows: [], errors: [error.issue] };
    return { rows: [], sourceRows: [], errors: [{ code: 'FILE_INVALID', message: 'The file is malformed or uses an unsupported workbook feature.' }] };
  }
}
