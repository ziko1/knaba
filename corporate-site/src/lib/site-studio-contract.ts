/**
 * Shared, deliberately restricted public-content contract.
 * No HTML/CSS/script authoring, no arbitrary DOM selectors or remote images.
 * Editing operational fields, prices, sessions and live customer data is forbidden.
 */
export type StudioKind = 'text' | 'href' | 'src' | 'alt' | 'color';
export interface StudioEntry { selector: string; kind: StudioKind; value: string }
export class StudioInputError extends Error {
  constructor(message: string) { super(message); this.name = 'StudioInputError'; }
}
const MAX_ENTRIES = 80;
const TAGS = '(?:section|div|article|aside|figure|figcaption|h[1-6]|p|span|a|strong|em|small|li|ul|ol|img|blockquote|b|i|label)';
const selectorPattern = new RegExp('^#main(?: > ' + TAGS + ':nth-of-type\\((?:[1-9][0-9]?)\\)){1,10}$');
const pagePattern = /^\/(?:[a-z0-9-]+\/){0,4}$/;
const restricted = new Set(['api','studio','konto','postfach','portal','admin','signin-with-chatgpt','signout-with-chatgpt','_astro','assets','images']);
const allowedKinds = new Set<StudioKind>(['text','href','src','alt','color']);
const reject = (message: string): never => { throw new StudioInputError(message); };
const isPlain = (value: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(value);
export function normalizeStudioPage(input: unknown): string {
  if(typeof input !== 'string' || input.length > 180 || !pagePattern.test(input) || input.split('/').some(segment=>restricted.has(segment)))
    return reject('Nur öffentliche, statische Seiten können bearbeitet werden.');
  return input;
}
export function validateStudioEntries(input: unknown): StudioEntry[] {
  if(!Array.isArray(input) || input.length > MAX_ENTRIES) return reject('Zu viele oder ungültige Änderungen.');
  const seen=new Set<string>();
  const result: StudioEntry[]=[];
  for(const raw of input){
    if(!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k=>!['selector','kind','value'].includes(k)))
      return reject('Ungültiges Inhaltsfeld.');
    const {selector,kind,value}=raw as Record<string,unknown>;
    if(typeof selector!=='string' || !(selector==='@title'||selector==='@description'||selectorPattern.test(selector)))
      return reject('Dieser Seitenbereich darf nicht bearbeitet werden.');
    if(typeof kind!=='string' || !allowedKinds.has(kind as StudioKind) || typeof value!=='string' || value.length > 700 || !isPlain(value))
      return reject('Bitte verwenden Sie normalen, sicheren Text.');
    const element=selector.split(' > ').at(-1)?.split(':')[0];
    if((selector==='@title'||selector==='@description') && kind!=='text') return reject('SEO-Felder erlauben nur Text.');
    if(selector==='@title' && (!value.trim() || value.length>100)) return reject('Der Seitentitel muss zwischen 1 und 100 Zeichen enthalten.');
    if(selector==='@description' && value.length>250) return reject('Die Seitenbeschreibung ist zu lang.');
    if(kind==='src' && (element!=='img' || !/^\/images\/[a-z0-9/_-]+\.(?:svg|png|jpe?g|webp|avif)$/.test(value))) return reject('Nur veröffentlichte Medien derselben Website sind erlaubt.');
    if(kind==='alt' && element!=='img') return reject('Alternativtext ist nur für Bilder erlaubt.');
    if(kind==='href' && (element!=='a' || !safeStudioHref(value))) return reject('Dieser Link ist nicht erlaubt.');
    if(kind==='color' && !/^#[0-9a-fA-F]{6}$/.test(value)) return reject('Bitte eine sechsstellige HEX-Farbe eingeben.');
    if(kind==='text' && selector!=='@title' && selector!=='@description' && ['img','section','div','article','aside','ul','ol','figure'].includes(element??'')) return reject('Bitte einen reinen Textbereich auswählen.');
    const unique=selector+'\u0000'+kind;
    if(seen.has(unique)) return reject('Doppelte Änderung.');
    seen.add(unique);
    result.push({selector,kind:kind as StudioKind,value:kind==='text'||kind==='alt'?value.trim():value});
  }
  return result.sort((a,b)=>(a.selector.startsWith('@')?0:1)-(b.selector.startsWith('@')?0:1)||a.selector.localeCompare(b.selector)||a.kind.localeCompare(b.kind));
}
export function safeStudioHref(value: string): boolean {
  if(value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\s<>]/.test(value)) return true;
  try {
    const url=new URL(value);
    return url.protocol==='https:' && (url.hostname==='knaba.de'||url.hostname==='www.knaba.de') && !url.username && !url.password;
  } catch { return false; }
}
