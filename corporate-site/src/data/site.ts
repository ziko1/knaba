/// <reference types="vite/client" />
/** Public VSP/official releases are indexable; unreleased preview remains noindex. */
const mode = import.meta.env?.KNABA_RELEASE_MODE ?? (globalThis as { process?: { env?: { KNABA_RELEASE_MODE?: string } } }).process?.env?.KNABA_RELEASE_MODE;
const official = mode === 'official';
const vsp = mode === 'vsp';
export const siteConfig = {
  origin: official ? 'https://knaba.de' : 'https://kneba.vsp.rest',
  officialOrigin: 'https://knaba.de',
  temporary: !official,
  // Public release may be indexed, private/404 paths always remain excluded.
  indexable: official || vsp,
} as const;
