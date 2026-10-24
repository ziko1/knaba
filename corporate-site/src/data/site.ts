/// <reference types="vite/client" />
/** Official release is a deliberate build-time choice; preview stays noindex. */
const official = import.meta.env.KNABA_RELEASE_MODE === 'official';
export const siteConfig = {
  origin: official ? 'https://knaba.de' : 'https://kneba.vsp.rest',
  officialOrigin: 'https://knaba.de',
  temporary: !official,
} as const;
