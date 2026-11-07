import { TemplateInputError, validateSiteTemplate, type SiteTemplate } from '../src/lib/site-template-contract';

export const MAX_TEMPLATE_ZIP_BYTES = 64 * 1024;
const MAX_UNPACKED_BYTES = 64 * 1024;
const MAX_RATIO = 100;
const ALLOWED_NAMES = new Set(['template.json', 'LICENSE.txt']);
const decoder = new TextDecoder('utf-8', { fatal: true });
const fail = (code: string, message: string): never => { throw new TemplateInputError(code, message); };

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string; flags: number; method: number; crc: number;
  size: number; compressed: number; local: number; needed: number;
  time: number; date: number;
}

async function inflate(bytes: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  const source = new Blob([Uint8Array.from(bytes)]).stream();
  const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 2000);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (timedOut) return fail('zip_timeout', 'Template decompression exceeded its time limit.');
      if (next.done) break;
      total += next.value.byteLength;
      if (total > expectedSize || total > MAX_UNPACKED_BYTES) {
        await reader.cancel().catch(() => undefined);
        return fail('zip_size', 'The expanded template is larger than declared or allowed.');
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof TemplateInputError) throw error;
    return fail('zip_compression', 'The template contains invalid or unsupported compressed data.');
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.byteLength; }
  return result;
}

/** Reject ambiguous duplicate JSON keys before JSON.parse discards evidence. */
function uniqueJson(text: string): unknown {
  let offset = 0;
  const whitespace = () => { while (/\s/.test(text[offset] || '') && offset < text.length) offset++; };
  const string = (): string => {
    whitespace();
    if (text[offset] !== '"') return fail('manifest_json', 'Template metadata must be valid JSON.');
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === '\\') { offset++; continue; }
      if (char === '"') {
        try { return JSON.parse(text.slice(start, offset)) as string; }
        catch { return fail('manifest_json', 'Template metadata must be valid JSON.'); }
      }
    }
    return fail('manifest_json', 'Template metadata must be valid JSON.');
  };
  const value = (depth: number): void => {
    if (depth > 4) return fail('manifest_depth', 'The template JSON is nested too deeply.');
    whitespace();
    if (text[offset] === '{') {
      offset++; whitespace();
      const seen = new Set<string>();
      if (text[offset] === '}') { offset++; return; }
      while (offset < text.length) {
        const key = string();
        if (seen.has(key)) return fail('manifest_duplicate', 'Duplicate template JSON keys are not allowed.');
        seen.add(key); whitespace();
        if (text[offset++] !== ':') return fail('manifest_json', 'Template metadata must be valid JSON.');
        value(depth + 1); whitespace();
        const separator = text[offset++];
        if (separator === '}') return;
        if (separator !== ',') return fail('manifest_json', 'Template metadata must be valid JSON.');
      }
    } else if (text[offset] === '[') {
      // v1 has no array fields: reject without walking attacker-controlled arrays.
      return fail('manifest_schema', 'Template Package v1 does not support array fields.');
    } else if (text[offset] === '"') { string(); return; }
    else {
      const match = /^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(offset));
      if (match) { offset += match[0].length; return; }
    }
    return fail('manifest_json', 'Template metadata must be valid JSON.');
  };
  value(0); whitespace();
  if (offset !== text.length) return fail('manifest_json', 'The template JSON contains trailing content.');
  try { return JSON.parse(text); }
  catch { return fail('manifest_json', 'Template metadata must be valid JSON.'); }
}

/**
 * Strict, bounded ZIP subset. v1 contains template.json and optionally LICENSE.txt.
 * No extraction to disk, filename-derived paths, network access or code execution.
 * ZIP comments/extra fields, split/ZIP64 archives and extra payload are rejected.
 */
export async function parseTemplateZip(input: Uint8Array): Promise<SiteTemplate> {
  if (!(input instanceof Uint8Array) || input.byteLength < 22 || input.byteLength > MAX_TEMPLATE_ZIP_BYTES)
    return fail('zip_size', 'Upload a KNABA template ZIP of at most 64 KiB.');
  // Snapshot the input so a caller cannot mutate metadata during decompression.
  const bytes = Uint8Array.from(input);
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 20, true) !== 0)
    return fail('zip_structure', 'The ZIP must end with an unambiguous directory record and no comment.');
  const entriesCount = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true), centralStart = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 8, true) !== entriesCount || entriesCount < 1 || entriesCount > 2 ||
    centralStart + centralSize !== end || centralStart > end)
    return fail('zip_structure', 'Only a single-volume ZIP with one or two approved files is supported.');
  const entries: Entry[] = [];
  const names = new Set<string>();
  let cursor = centralStart, expandedTotal = 0;
  for (let index = 0; index < entriesCount; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      return fail('zip_structure', 'The ZIP directory is incomplete.');
    const needed = view.getUint16(cursor + 6, true), flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true), nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const compressed = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const mode = view.getUint32(cursor + 38, true), fileType = (mode >>> 16) & 0xf000;
    if ((flags & ~0x080e) !== 0 || (method === 0 && (flags & 6) !== 0) || ![0, 8].includes(method) || needed > 20 ||
      needed < 10 || (method === 8 && needed !== 20) || nameLength < 1 || nameLength > 32 || extraLength !== 0 || commentLength !== 0 ||
      view.getUint16(cursor + 34, true) !== 0 || (mode & 0x10) !== 0 || (fileType !== 0 && fileType !== 0x8000) ||
      cursor + 46 + nameLength > end)
      return fail('zip_unsupported', 'The ZIP contains unsupported flags, links, metadata or file types.');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    let name: string;
    try { name = decoder.decode(nameBytes); } catch { return fail('zip_name', 'ZIP filenames must be valid UTF-8.'); }
    if (!ALLOWED_NAMES.has(name) || names.has(name))
      return fail('zip_name', 'Only one template.json and an optional LICENSE.txt are allowed.');
    names.add(name);
    expandedTotal += size;
    if (expandedTotal > MAX_UNPACKED_BYTES || size > MAX_UNPACKED_BYTES || compressed > MAX_TEMPLATE_ZIP_BYTES ||
      (method === 0 && compressed !== size) || (size > 0 && (compressed === 0 || size / compressed > MAX_RATIO)))
      return fail('zip_size', 'The ZIP exceeds the allowed expanded size or compression ratio.');
    entries.push({ name, needed, flags, method, size, compressed, crc: view.getUint32(cursor + 16, true),
      local: view.getUint32(cursor + 42, true), time: view.getUint16(cursor + 12, true), date: view.getUint16(cursor + 14, true) });
    cursor += 46 + nameLength;
  }
  if (cursor !== end || !names.has('template.json'))
    return fail('zip_structure', 'The ZIP directory must contain template.json with no extra records.');

  // Sort physical records to allow normal central-directory ordering while
  // rejecting aliases, overlaps, gaps, prepended executables and hidden bytes.
  entries.sort((a, b) => a.local - b.local);
  let nextLocal = 0, manifest = '';
  for (const entry of entries) {
    const start = entry.local;
    if (start !== nextLocal || start + 30 > centralStart || view.getUint32(start, true) !== 0x04034b50)
      return fail('zip_structure', 'The ZIP contains hidden, overlapping or missing local data.');
    const nameLength = view.getUint16(start + 26, true), extraLength = view.getUint16(start + 28, true);
    const dataStart = start + 30 + nameLength, dataEnd = dataStart + entry.compressed;
    if (nameLength !== entry.name.length || extraLength !== 0 || dataEnd > centralStart ||
      view.getUint16(start + 4, true) !== entry.needed || view.getUint16(start + 6, true) !== entry.flags ||
      view.getUint16(start + 8, true) !== entry.method || view.getUint16(start + 10, true) !== entry.time ||
      view.getUint16(start + 12, true) !== entry.date)
      return fail('zip_mismatch', 'Local ZIP headers do not match the directory.');
    let localName: string;
    try { localName = decoder.decode(bytes.subarray(start + 30, dataStart)); }
    catch { return fail('zip_name', 'ZIP filenames must be valid UTF-8.'); }
    if (localName !== entry.name) return fail('zip_mismatch', 'ZIP filenames do not match.');
    const descriptor = Boolean(entry.flags & 8);
    const expected = [entry.crc, entry.compressed, entry.size];
    for (let index = 0; index < 3; index++) {
      const actual = view.getUint32(start + 14 + index * 4, true);
      if (actual !== expected[index] && !(descriptor && actual === 0))
        return fail('zip_mismatch', 'ZIP size or checksum metadata does not match.');
    }
    nextLocal = dataEnd;
    if (descriptor) {
      if (nextLocal + 12 > centralStart) return fail('zip_structure', 'The ZIP data descriptor is missing.');
      if (view.getUint32(nextLocal, true) === 0x08074b50) nextLocal += 4;
      if (nextLocal + 12 > centralStart) return fail('zip_structure', 'The ZIP data descriptor is incomplete.');
      for (let index = 0; index < 3; index++) {
        if (view.getUint32(nextLocal + index * 4, true) !== expected[index])
          return fail('zip_mismatch', 'The ZIP data descriptor does not match.');
      }
      nextLocal += 12;
    }
    const compressedBytes = bytes.subarray(dataStart, dataEnd);
    const data = entry.method === 0 ? compressedBytes : await inflate(compressedBytes, entry.size);
    if (data.byteLength !== entry.size || crc32(data) !== entry.crc)
      return fail('zip_integrity', 'The ZIP content failed its size or checksum check.');
    let text: string;
    try { text = decoder.decode(data); } catch { return fail('zip_text', 'Template files must contain valid UTF-8 text.'); }
    if (entry.name === 'template.json') manifest = text;
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
      return fail('zip_text', 'LICENSE.txt must contain plain text.');
  }
  if (nextLocal !== centralStart) return fail('zip_structure', 'The ZIP contains data outside its approved files.');
  return validateSiteTemplate(uniqueJson(manifest));
}
