/// <reference types="vite/client" />
/** Official release is a deliberate build-time choice; preview stays noindex. */
const mode = import.meta.env.KNABA_RELEASE_MODE;
const official = mode === 'official';
const vsp = mode === 'vsp';
export const siteConfig = {
  origin: official ? 'https://knaba.de' : 'https://kneba.vsp.rest',
  officialOrigin: 'https://knaba.de',
  temporary: !official,
  // Browser preview semantics are independent from an owner-approved indexing release gate.
  indexable: official || (vsp && import.meta.env.KNABA_VSP_INDEX_APPROVED === '1'),
} as const;
