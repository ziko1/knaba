/** Text-only visual editing. Routes are a whitelist: forms, portal, assistant and legal pages never render CMS overrides. */
export const editableTags = ['h1', 'h2', 'h3', 'p'] as const;
export type CmsBlocks = Record<string, string>;
export const CMS_MAX_BLOCKS = 80;
export const CMS_MAX_TEXT = 1400;
export const CMS_MAX_PAYLOAD = 32768;

/** Keep a narrow, auditable list of public marketing routes. */
export function isCmsPage(path: string): boolean {
  if (typeof path !== 'string' || path.length > 128 || !/^\/(?:[a-z0-9-]+\/)*$/.test(path)) return false;
  if (path === '/' || path === '/ru/' || path === '/en/' || path === '/uk/') return true;
  const parts = path.slice(1, -1).split('/');
  if (parts[0] === 'ru') parts.shift();
  if (parts.length === 1) return ['berlin', 'branchen', 'unternehmen', 'kontakt', 'karriere', 'leistungen', 'ratgeber'].includes(parts[0]);
  return parts.length === 2 && ['leistungen', 'ratgeber'].includes(parts[0]) && /^[a-z0-9-]{1,64}$/.test(parts[1]);
}

export function isCmsBlockKey(value: string): boolean {
  return /^(?:h1|h2|h3|p)-(?:0|[1-9]\d{0,2})$/.test(value);
}

export function parseCmsBlocks(input: unknown): CmsBlocks {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('blocks');
  const entries = Object.entries(input);
  if (entries.length > CMS_MAX_BLOCKS) throw Error('blocks');
  const result: CmsBlocks = Object.create(null);
  for (const [key, value] of entries) {
    if (!isCmsBlockKey(key) || typeof value !== 'string' || value.length > CMS_MAX_TEXT ||
        /[\u0000-\u001f\u007f]/.test(value) || /[<>]/.test(value)) throw Error('blocks');
    result[key] = value.trim();
  }
  if (JSON.stringify(result).length > CMS_MAX_PAYLOAD - 600) throw Error('blocks');
  return result;
}
