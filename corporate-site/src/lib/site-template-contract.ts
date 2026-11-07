/** KNABA Template Package v1 is data, never uploaded executable code. */
export type TemplateLayout = 'original' | 'business' | 'modern';
export interface SiteTemplate {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  license: string;
  layout: TemplateLayout;
  tokens: {
    accent: string;
    surface: string;
    ink: string;
    radius: number;
    density: 'comfortable' | 'compact';
  };
}

export class TemplateInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TemplateInputError';
    this.code = code;
  }
}
const fail = (code: string, message: string): never => { throw new TemplateInputError(code, message); };
const fields = ['schemaVersion', 'id', 'name', 'version', 'author', 'license', 'layout', 'tokens'];
const tokenFields = ['accent', 'surface', 'ink', 'radius', 'density'];

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('schema', 'A template must contain plain JSON objects.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return fail('schema', 'Inherited template settings are not supported.');
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key)))
    return fail('schema', 'Required template fields are missing or unsupported fields are present.');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      return fail('schema', 'Template fields must be JSON values.');
  }
  return value as Record<string, unknown>;
}
function plain(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum ||
    /[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/.test(value))
    return fail('text', 'Template metadata must be bounded plain text.');
  return value.trim();
}
function color(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value))
    return fail('color', 'Template colours must use six-digit hexadecimal values.');
  return value.toLowerCase();
}
function luminance(hex: string): number {
  const linear = [1, 3, 5].map(offset => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Validate and return a new canonical object; never retain mutable caller data. */
export function validateSiteTemplate(input: unknown): SiteTemplate {
  const value = record(input, fields);
  if (value.schemaVersion !== 1) return fail('schema_version', 'Only KNABA Template Package v1 is supported.');
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.id) || value.id.length < 3 || value.id.length > 64)
    return fail('id', 'Template IDs must use small ASCII letters in slugs of 3–64 characters.');
  if (typeof value.version !== 'string' || !/^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})$/.test(value.version))
    return fail('version', 'A template version must have the form 1.0.0.');
  if (typeof value.layout !== 'string' || !['original', 'business', 'modern'].includes(value.layout))
    return fail('layout', 'This template layout is not registered in KNABA.');
  const tokens = record(value.tokens, tokenFields);
  const accent = color(tokens.accent), surface = color(tokens.surface), ink = color(tokens.ink);
  if (contrast(ink, surface) < 4.5 || contrast(accent, '#ffffff') < 4.5)
    return fail('contrast', 'Text/surface and white/accent contrast must be at least 4.5:1.');
  if (!Number.isInteger(tokens.radius) || Number(tokens.radius) < 0 || Number(tokens.radius) > 24)
    return fail('radius', 'The corner radius must be an integer between 0 and 24.');
  if (tokens.density !== 'comfortable' && tokens.density !== 'compact')
    return fail('density', 'Template spacing must be comfortable or compact.');
  return {
    schemaVersion: 1, id: value.id, name: plain(value.name, 80), version: value.version,
    author: plain(value.author, 100), license: plain(value.license, 120),
    layout: value.layout as TemplateLayout,
    tokens: { accent, surface, ink, radius: Number(tokens.radius), density: tokens.density },
  };
}

const originals: SiteTemplate[] = [
  { schemaVersion: 1, id: 'knaba-original', name: 'KnaBa Original', version: '1.0.0', author: 'KnaBa', license: 'Project assets; retain their existing licences', layout: 'original', tokens: { accent: '#155b46', surface: '#fbfcf7', ink: '#102f38', radius: 18, density: 'comfortable' } },
  { schemaVersion: 1, id: 'knaba-business', name: 'KnaBa Business', version: '1.0.0', author: 'KnaBa', license: 'Project assets; retain their existing licences', layout: 'business', tokens: { accent: '#174b67', surface: '#f3f7fa', ink: '#143044', radius: 8, density: 'compact' } },
  { schemaVersion: 1, id: 'knaba-modern', name: 'KnaBa Modern', version: '1.0.0', author: 'KnaBa', license: 'Project assets; retain their existing licences', layout: 'modern', tokens: { accent: '#5c397a', surface: '#f8f4fc', ink: '#2d1f3b', radius: 24, density: 'comfortable' } },
];
export const BUILTIN_TEMPLATES: readonly SiteTemplate[] = Object.freeze(originals.map(value => {
  const template = validateSiteTemplate(value);
  Object.freeze(template.tokens);
  return Object.freeze(template);
}));

/**
 * Only trusted selectors and validated literals enter this stylesheet. No DOM
 * moves: existing positional Studio content selectors retain their meaning.
 * Callers MUST inject it only into authorised public HTML, never private pages.
 * Colour checks cover these explicit pairs, not a full-page accessibility audit.
 */
export function templateCss(input: SiteTemplate): string {
  const template = validateSiteTemplate(input);
  if (JSON.stringify(template) === JSON.stringify(BUILTIN_TEMPLATES[0])) return '';
  const { accent, surface, ink, radius, density } = template.tokens;
  const scope = 'body[data-public-design] #main';
  const gap = density === 'compact' ? 40 : 72;
  const css = [
    `${scope} :is(.bau-hero,.hero,.page-intro){background:${surface};color:${ink};border-radius:${radius}px}`,
    `${scope} .bau-hero::before{background:${surface};border-color:${ink}30;border-radius:${radius}px}`,
    `${scope} :is(.bau-hero-copy h1,.bau-hero-copy h1 span,.bau-lead,.bau-trust,.hero h1,.hero h1 span,.page-intro h1,.page-intro h1 span,.page-intro p){color:${ink}}`,
    `${scope} :is(a.bau-card,a.bau-offer){background:${surface};color:${ink};border-color:${ink}40;border-radius:${radius}px}`,
    `${scope} :is(a.bau-card,a.bau-offer) :is(h2,h3,p,.eyebrow){color:${ink}}`,
    `${scope} :is(.button-dark,.button-dark:hover,.button-dark:focus-visible){background:${accent};color:#ffffff;border-color:${accent}}`,
    `${scope} .button{border-radius:${radius}px}`,
    `${scope} > .section{padding-block:${gap}px}`,
  ];
  if (template.layout === 'business') css.push(
    `${scope} .bau-hero::before{box-shadow:none;background:${surface}}`,
    `${scope} :is(.bau-hero-copy h1,.hero h1){letter-spacing:-.035em}`,
    `${scope} :is(a.bau-card,a.bau-offer){box-shadow:none}`,
  );
  if (template.layout === 'modern') css.push(
    `${scope} .bau-hero::before{box-shadow:0 16px 40px ${ink}18}`,
    `${scope} :is(.bau-hero-copy h1,.hero h1){letter-spacing:-.055em}`,
    `${scope} :is(a.bau-card,a.bau-offer){box-shadow:0 12px 28px ${ink}12}`,
  );
  return css.join('');
}
