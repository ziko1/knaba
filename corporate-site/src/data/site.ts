/// <reference types="vite/client" />
/** Mode is explicit: preview (noindex), official knaba.de or independent vsp.rest. */
const mode = import.meta.env.KNABA_RELEASE_MODE;
const official = mode === 'official';
const vsp = mode === 'vsp';
export const siteConfig = {
  origin: official ? 'https://knaba.de' : 'https://kneba.vsp.rest',
  officialOrigin: 'https://knaba.de',
  temporary: !(official || vsp),
  // Public indexing is a separate explicit build-time approval, not implied by the domain.
  indexable: official || (vsp && import.meta.env.KNABA_VSP_INDEX_APPROVED === '1'),
} as const;
