import { describe, expect, it } from 'vitest';
import { crc32, deflateRawSync } from 'node:zlib';
import { BUILTIN_TEMPLATES, TemplateInputError, templateCss, validateSiteTemplate } from '../src/lib/site-template-contract';
import { MAX_TEMPLATE_ZIP_BYTES, parseTemplateZip } from '../worker/template-zip';

const manifest = () => ({ ...structuredClone(BUILTIN_TEMPLATES[1]), id: 'customer-design', name: 'Будівельне прибирання' });
type ZipFile = { name: string; text?: string; bytes?: Buffer; method?: 0 | 8; descriptor?: boolean; descriptorSignature?: boolean; mode?: number; extraCompressed?: Buffer };
/** Independent fixture producer: zlib supplies CRC and raw DEFLATE. */
function zip(files: ZipFile[], directoryOrder?: number[]): Buffer {
  const records: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), content = file.bytes ?? Buffer.from(file.text ?? JSON.stringify(manifest()));
    const method = file.method ?? 0;
    const compressed = Buffer.concat([method === 8 ? deflateRawSync(content) : content, file.extraCompressed ?? Buffer.alloc(0)]);
    const checksum = crc32(content), flags = 0x800 | (file.descriptor ? 8 : 0);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6); header.writeUInt16LE(method, 8);
    if (!file.descriptor) {
      header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(content.length, 22);
    }
    header.writeUInt16LE(name.length, 26);
    const descriptor = file.descriptor ? Buffer.alloc(file.descriptorSignature === false ? 12 : 16) : Buffer.alloc(0);
    if (file.descriptor) {
      const base = file.descriptorSignature === false ? 0 : 4;
      if (base) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(checksum, base); descriptor.writeUInt32LE(compressed.length, base + 4); descriptor.writeUInt32LE(content.length, base + 8);
    }
    const record = Buffer.concat([header, name, compressed, descriptor]);
    records.push(record);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(((file.mode ?? 0o100644) << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    directory.push(Buffer.concat([central, name]));
    offset += record.length;
  }
  const centralBytes = Buffer.concat(directoryOrder ? directoryOrder.map(index => directory[index]) : directory);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, centralBytes, end]);
}
const central = (bytes: Buffer) => bytes.readUInt32LE(bytes.length - 6);
async function rejected(bytes: Uint8Array, code?: string) {
  await expect(parseTemplateZip(bytes)).rejects.toBeInstanceOf(TemplateInputError);
  if (code) await expect(parseTemplateZip(bytes)).rejects.toMatchObject({ code });
}

describe('declarative KNABA template contract', () => {
  it('has three valid, distinct built-ins with immutable original styling', () => {
    expect(BUILTIN_TEMPLATES.map(value => value.id)).toEqual(['knaba-original', 'knaba-business', 'knaba-modern']);
    for (const value of BUILTIN_TEMPLATES) expect(validateSiteTemplate(value)).toEqual(value);
    expect(templateCss(BUILTIN_TEMPLATES[0])).toBe('');
    expect(templateCss(BUILTIN_TEMPLATES[1])).not.toBe(templateCss(BUILTIN_TEMPLATES[2]));
    expect(Object.isFrozen(BUILTIN_TEMPLATES[0].tokens)).toBe(true);
  });
  it('canonicalizes colours and text without keeping mutable input references', () => {
    const input = manifest(); input.tokens.accent = '#174B67'; input.name = '  Company design  ';
    const result = validateSiteTemplate(input);
    expect(result.name).toBe('Company design'); expect(result.tokens.accent).toBe('#174b67');
    input.tokens.radius = 0; expect(result.tokens.radius).toBe(8);
  });
  it.each([
    { schemaVersion: 2 }, { id: '../bad' }, { id: 'Uppercase' }, { id: 'ab' }, { id: 'a'.repeat(65) },
    { name: '<img src=x>' }, { name: 'one\nTwo' }, { name: 'x'.repeat(81) }, { name: '\u202eSpoof' },
    { author: '' }, { license: 'x'.repeat(121) }, { version: '01.1.0' }, { version: '1.0' },
    { layout: 'custom<script>' }, { layout: { toString: (): string => 'original' } }, { scripts: ['x.js'] },
  ])('rejects invalid metadata %#', patch => {
    expect(() => validateSiteTemplate({ ...manifest(), ...patch })).toThrow(TemplateInputError);
  });
  it.each([
    { accent: '#fff' }, { accent: 'url(https://evil.test)' }, { accent: '#ffffff' },
    { surface: '#143044' }, { radius: 25 }, { radius: -1 }, { radius: 1.5 },
    { density: 'url(x)' }, { unknown: 'value' },
  ])('rejects invalid design tokens %#', tokens => {
    const input = manifest();
    expect(() => validateSiteTemplate({ ...input, tokens: { ...input.tokens, ...tokens } })).toThrow(TemplateInputError);
  });
  it('rejects prototype fields, inherited settings, missing fields and accessors', () => {
    const input = manifest();
    expect(() => validateSiteTemplate(JSON.parse(JSON.stringify(input).replace('{', '{"__proto__":{},')))).toThrow(TemplateInputError);
    expect(() => validateSiteTemplate(Object.assign(Object.create({ inherited: true }), input))).toThrow(TemplateInputError);
    const missing = { ...input } as Record<string, unknown>; delete missing.name;
    expect(() => validateSiteTemplate(missing)).toThrow(TemplateInputError);
    Object.defineProperty(input, 'name', { get() { throw new Error('must not execute'); } });
    expect(() => validateSiteTemplate(input)).toThrow(TemplateInputError);
  });
  it('does not treat an uploaded original-layout theme as the built-in original', () => {
    const uploaded = { ...structuredClone(BUILTIN_TEMPLATES[0]), id: 'our-original' };
    expect(templateCss(uploaded)).toContain('#155b46');
    uploaded.tokens.accent = '#174b67';
    expect(templateCss(uploaded)).toContain('#174b67');
  });
  it('emits only trusted CSS without attacker metadata, URL fetches, scripts or DOM-order rules', () => {
    const input = manifest(); input.name = 'Company } @import url(https://example.test);';
    const css = templateCss(input);
    expect(css).toContain('body[data-public-design] #main');
    expect(css).not.toMatch(/@import|url\(|javascript|example\.test|order:|display:none/);
    expect(css.length).toBeLessThan(3000);
  });
});

describe('bounded in-memory KNABA ZIP import', () => {
  it.each([0, 8] as const)('imports a real method-%i archive and canonicalizes the manifest', async method => {
    const result = await parseTemplateZip(zip([{ name: 'template.json', method }]));
    expect(result).toEqual(manifest());
  });
  it('supports an optional plain-text licence and directory entries in a different order', async () => {
    expect(await parseTemplateZip(zip([{ name: 'LICENSE.txt', text: 'Copyright company\nUse with permission.' }, { name: 'template.json', method: 8 }], [1, 0]))).toEqual(manifest());
  });
  it.each([true, false])('supports a checked data descriptor (signature=%s)', async descriptorSignature => {
    expect(await parseTemplateZip(zip([{ name: 'template.json', method: 8, descriptor: true, descriptorSignature }]))).toEqual(manifest());
  });
  it.each(['../template.json', '/template.json', 'C:\\template.json', 'template.JSON', 'template.json\0', 'nested.zip', 'index.html', 'package.json', 'assets/a.svg', 'tеmplate.json'])('rejects unsupported filename %s', async name => {
    await rejected(zip([{ name }]), 'zip_name');
  });
  it('rejects duplicate filenames and a missing manifest', async () => {
    await rejected(zip([{ name: 'template.json' }, { name: 'template.json' }]), 'zip_name');
    await rejected(zip([{ name: 'LICENSE.txt', text: 'Only licence' }]), 'zip_structure');
  });
  it.each([0o120777, 0o040755, 0o060600])('rejects special Unix file mode %i', async mode => {
    await rejected(zip([{ name: 'template.json', mode }]), 'zip_unsupported');
  });
  it('rejects encrypted flags, unsupported compression and ZIP64 version requirements', async () => {
    for (const [field, value] of [[8, 0x801], [10, 99], [6, 45]]) {
      const bytes = zip([{ name: 'template.json' }]); bytes.writeUInt16LE(value, central(bytes) + field);
      await rejected(bytes, 'zip_unsupported');
    }
  });
  it('rejects metadata and trailing bytes instead of silently accepting alternate filenames or payloads', async () => {
    const extra = zip([{ name: 'template.json' }]); extra.writeUInt16LE(1, central(extra) + 30);
    await rejected(extra, 'zip_unsupported');
    const comment = zip([{ name: 'template.json' }]); comment.writeUInt16LE(1, comment.length - 2);
    await rejected(comment, 'zip_structure');
    await rejected(Buffer.concat([zip([{ name: 'template.json' }]), Buffer.from('hidden')]), 'zip_structure');
    const bytes = zip([{ name: 'template.json' }]);
    // Insert a hidden prefix and consistently move the recorded offsets.
    const prefixed = Buffer.concat([Buffer.from('EXE'), bytes]);
    prefixed.writeUInt32LE(central(bytes) + 3, prefixed.length - 6);
    prefixed.writeUInt32LE(3, central(bytes) + 3 + 42);
    await rejected(prefixed, 'zip_structure');
  });
  it('rejects local/central filename, method, length and checksum disagreements', async () => {
    for (const mutate of [
      (bytes: Buffer) => { bytes[30] = 0x78; },
      (bytes: Buffer) => { bytes.writeUInt16LE(8, 8); },
      (bytes: Buffer) => { bytes.writeUInt32LE(2, 22); },
      (bytes: Buffer) => { bytes.writeUInt32LE(2, 14); },
    ]) {
      const bytes = zip([{ name: 'template.json' }]); mutate(bytes); await rejected(bytes, 'zip_mismatch');
    }
  });
  it('rejects corrupt content even when metadata agrees', async () => {
    const bytes = zip([{ name: 'template.json' }]); bytes[30 + 'template.json'.length + 1] ^= 1;
    await rejected(bytes, 'zip_integrity');
  });
  it('rejects extra compressed payload, broken raw DEFLATE and a forged actual expanded size', async () => {
    await rejected(zip([{ name: 'template.json', method: 8, extraCompressed: Buffer.from('hidden') }]), 'zip_compression');
    const broken = zip([{ name: 'template.json', method: 8 }]); broken[30 + 'template.json'.length] = 0xff;
    await rejected(broken, 'zip_compression');
    const forged = zip([{ name: 'template.json', method: 8 }]); forged.writeUInt32LE(1, 22); forged.writeUInt32LE(1, central(forged) + 24);
    await rejected(forged, 'zip_size');
  });
  it('rejects incorrect data descriptors', async () => {
    const bytes = zip([{ name: 'template.json', method: 8, descriptor: true }]);
    bytes.writeUInt32LE(123, central(bytes) - 12);
    await rejected(bytes, 'zip_mismatch');
  });
  it('rejects aliasing local entries and unaccounted data gaps', async () => {
    const bytes = zip([{ name: 'template.json' }, { name: 'LICENSE.txt', text: 'Licence' }]);
    bytes.writeUInt32LE(0, central(bytes) + 46 + 'template.json'.length + 42);
    await rejected(bytes, 'zip_structure');
    const gap = zip([{ name: 'template.json' }]); gap.writeUInt32LE(1, central(gap) + 42);
    await rejected(gap, 'zip_structure');
  });
  it('enforces input, entry count, expanded byte and compression-ratio limits', async () => {
    await rejected(new Uint8Array(MAX_TEMPLATE_ZIP_BYTES + 1), 'zip_size');
    await rejected(zip([{ name: 'template.json' }, { name: 'LICENSE.txt', text: '' }, { name: 'hidden.txt', text: '' }]), 'zip_structure');
    await rejected(zip([{ name: 'template.json', method: 8, text: 'x'.repeat(65537) }]), 'zip_size');
    await rejected(zip([{ name: 'template.json', method: 8, text: 'x'.repeat(50000) }]), 'zip_size');
  });
  it('rejects malformed UTF-8, binary licences and malformed JSON', async () => {
    await rejected(zip([{ name: 'template.json', bytes: Buffer.from([0xff, 0xfe]) }]), 'zip_text');
    await rejected(zip([{ name: 'template.json' }, { name: 'LICENSE.txt', text: 'a\0b' }]), 'zip_text');
    await rejected(zip([{ name: 'template.json', text: '{"schemaVersion":1,}' }]), 'manifest_json');
  });
  it('rejects duplicate JSON keys including escaped aliases, excessive depth and trailing input', async () => {
    const json = JSON.stringify(manifest());
    await rejected(zip([{ name: 'template.json', text: json.replace('{', '{"name":"first",') }]), 'manifest_duplicate');
    await rejected(zip([{ name: 'template.json', text: json.replace('{', '{"na\\u006de":"first",') }]), 'manifest_duplicate');
    await rejected(zip([{ name: 'template.json', text: '{"a":{"a":{"a":{"a":{"a":1}}}}}' }]), 'manifest_depth');
    await rejected(zip([{ name: 'template.json', text: json + '{}' }]), 'manifest_json');
    await rejected(zip([{ name: 'template.json', text: '{"schemaVersion":1,"scripts":[]}' }]), 'manifest_schema');
  });
  it('never exposes raw range errors for truncated archives', async () => {
    const bytes = zip([{ name: 'template.json', method: 8 }]);
    for (const length of [0, 1, 21, 22, 29, 45, bytes.length - 23, bytes.length - 1]) await rejected(bytes.subarray(0, length));
  });
});
