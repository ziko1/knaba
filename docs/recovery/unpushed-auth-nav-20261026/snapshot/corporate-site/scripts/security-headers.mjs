import {writeFile} from 'node:fs/promises';
const indexable=['official','vsp'].includes(process.env.KNABA_RELEASE_MODE);
await writeFile('.astro-static/_headers',`/*
  ${!indexable?'X-Robots-Tag: noindex, follow\n  ':''}X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
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
/register/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: private, no-store\n/login/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/logout/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`);
