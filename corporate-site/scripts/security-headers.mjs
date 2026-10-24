import {writeFile} from 'node:fs/promises';
const temporary=process.env.KNABA_RELEASE_MODE!=='official';
await writeFile('.astro-static/_headers',`/*
  ${temporary?'X-Robots-Tag: noindex, follow\n  ':''}X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/konto/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`);
