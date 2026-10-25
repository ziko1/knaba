# KNABA I18N-99 + current PR42 Carousel/Turnstile — 2026-10-25

## Source and scope
- Exact previous live development source: 89b1ad4fb22f665863196040ea9e696119fb0690, from PR #42.
- Reused verified PR #43 candidate: 2d1c0df2cb1e70324e6f24c66e5a1ed77bca5d6e.
- A separate integration branch, no merge to main; preserve official knaba.de, customer data, DNS, production credentials and other VPS projects.
- 99 valid BCP47 TARGET locales: 4 PUBLISHED (DE/EN/UK/RU) and 95 PENDING/NOT_TRANSLATED. No invented URLs, hreflang, sitemap or language-specific SEO for pending locales.
- New searchable lazy language inventory /languages.json loads only after opening the dropdown; errors keep four existing language links usable. No external provider calls or paid service activation.
- Fixed actual 320px menu overflow: measured dropdown left coordinate -36px before CSS change and +12px after; desktop and other phones preserved.

## Fresh verification on combined source
- Isolated pinned Node24.22.1 dependencies. Astro/Vue/Svelte: 159 checked files, 0 errors, 0 warnings and 4 hints.
- Vitest 127/127 PASS, inquiry Node 8/8 PASS, VPS Node 14/14 PASS; 99 static HTML pages, Worker and SSR renderer build, static links/metadata PASS, source mode VSP_PENDING_APPROVAL.
- npm audit --omit=dev: 0 reported production vulnerabilities with current unchanged lockfile.
- Browser Chromium: 16/16 language picker scenarios (4 locales x 320/390/768/1280), lazy 1 manifest request, 95 non-navigable targets, search/no-results, Escape, no JS errors/horizontal overflow. Failover when JSON unavailable and UK-to-DE same-window navigation also PASS.
- Preserved carousel: 7/7 Chromium controls/deeplinks; footer: 4 short-page viewport + 32 legal/assistant overlap cases PASS.
- Static client artifact SHA256: 53c7f11282c67152ce4907952b167fef62a72eaeaddbabd6cbeb215113d84ed3.
- Worker SHA256: 7ee24ad24e94e7f08643dd53e50ba19571ef57f30aa26c76ab92b7793569ee40.
- VPS SSR renderer SHA256: 9c0295fd969c1f232bd15b3a30828c856cd7a9f8a47f9e4d5421385f286a98fb.
- Homepage HTML SHA256: 75919ae6905d3bcab994b6be48afef9e1c4178a374e8954be4deef2d00107ed0.
- New home payload 38295 bytes / 7959 bytes gzip9; previous observed live home 34626 / 6428 bytes gzip9. Manifest 6952 bytes / 1013 gzip9 on demand only. This is not field CWV, per-user transfer or p95 performance.

## Unfinished gates
- Missing 95 real translations, independent native/legal/RTL checks. Do not advertise 99 translated versions.
- Live VPS Turnstile site/secret keys are configured, but actual human CAPTCHA flow and owner-login UAT are NOT_RUN. No credentials read or generated.
- /readyz=503 until real verified owner enrollment; no automatic accounts or privilege bypass.
- Approximately 95 percent used on 197 GB VPS; no unsafe automatic cleanup, no production database/schema changes, no payment.
- This record is candidate QA. Public dev deployment requires a fresh backup, immutable rollback artifact, strict TLS and live route/browser checks. Official knaba.de remains separate.
