/// <reference types="vite/client" />
/** Only an approved official-domain build is indexable. VPS is staging. */
const mode = import.meta.env?.KNABA_RELEASE_MODE ?? (globalThis as { process?: { env?: { KNABA_RELEASE_MODE?: string } } }).process?.env?.KNABA_RELEASE_MODE;
const official = mode === 'official';
export const siteConfig = {
  origin: official ? 'https://knaba.de' : 'https://kneba.vsp.rest',
  officialOrigin: 'https://knaba.de',
  temporary: !official,
  // Staging stays noindex even when it is publicly reachable for acceptance.
  indexable: official,
} as const;
