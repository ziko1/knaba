import {writeFile,rm} from 'node:fs/promises';
// Astro's internal render cache is not a public asset. Vite copies publicDir
// recursively, so remove this generated intermediate before the worker build.
await rm(new URL('../.astro-static/.prerender/',import.meta.url),{recursive:true,force:true});
const indexable=process.env.KNABA_RELEASE_MODE==='official';
await writeFile('.astro-static/_headers',`/*
  ${!indexable?'X-Robots-Tag: noindex, follow\n  ':''}X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(self), geolocation=()
/admin/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/konto/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/ru/konto/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/studio/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/crm/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/postfach/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/ru/postfach/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/login/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/logout/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`);
