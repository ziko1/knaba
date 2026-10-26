# KNABA — forward integration SEO / test release, 2026-10-26

## Checked source provenance
- Public **test-domain** `https://kneba.vsp.rest/` source at intake: `15cfe1e15ec2bb78c0b85ccb59e5221024a9bae8`, artifact `63c53820a2f71bf3bdbb6c49e793e4f88b3734e5846014d08fa81e64d9c9dcdc`.
- Deployed source is ancestor of PR #98 HEAD `d62d0658344c6b0dc3b06b31d084bd57f560b6c3`; extra PR98 commit is documentation-only. Preserved homepage `HomeGuides.astro` and the existing sections.
- The standalone SEO PR #99 `00d3701137d4b7855c48510e517e4a14a20d21c3` has a different base (PR96). Do not replace the current public preview with PR99 as-is.
- This isolated forward branch ports only the eight content/source/test paths changed by PR99 onto latest PR98, then regenerates the combined source-of-truth i18n catalogue and build verification. Patch applied with no conflicts.
- Other PR #97/#100/#101/#102/#103/#104 remain concurrent, untouched. No ERP/CRM/runtime migrations, user data, DNS, production or paid provider changes.

## Changes
One contextual B2B buying guide on the existing four-language construction catalogues with six actual service situations each (24 translated narratives): construction cleaning, intermediate stage, final handover, site clearance, Bauhelfer, and technical core-drilling *enquiry for assessment* with no execution promise. One heading and six links to active service pages. Site's existing design-system styles reused; inactive old-template CSS archived and removed from active bundle only after source-reference check. No new JS/dependencies or fabricated ratings/prices. Contract checks maintain original SVG icon grids and test new section distinctly.

## Tests actually executed in isolated source candidate
- Node 24.22.1, deterministic npm ci 508 packages.
- Astro/Vue/Svelte check PASS; Vitest **255/255**, native Node **32+27+9**, VPS **41/41**, 130 generated HTML pages.
- i18n extract/verify and full build verify PASS: DE 28 routes / 1030 units, DE/EN/UK/RU; CSS **40719 B gzip** under **40960 B**, JS **194050 B gzip**.
- Built local artifact SHA256 `d686a73a8ce1f47bdff1db481722b0e14572655cffa945912e8d57cce327373b`. After commit on a final SHA, revalidate code/tree and artifact, independent review pending.
- Chromium sandbox in current Docker environment is BLOCKED (do not bypass); Opera connector unavailable, TinyFish paid steps not authorized / wallet insufficient. No browser/device/zoom pass can be claimed.

## Server guard / next steps
- `node vps/doctor.mjs /srv/knaba/vps --strict` measured **92.36% used / cutoverAllowed=false** at intake. **No public preview symlink or Docker service switch while this guard fails.**
- Only verified reproducible cache cleanup permitted. Preserve all PR/local unpushed source, SQLite/WAL/backups/config/uploads/release history and unrelated active tasks.
- Before any test-domain switch: exact source SHA in GitHub, disk doctor PASS, both release locks, CAS against actual current symlink, schema ledger check, verified online SQLite backup + isolated restore, immutable release, smoke HTTP/HTML+health/readiness+auth guards, conditional rollback. No official knaba.de DNS edits.
- Search Console provider unavailable without payment. Organic rankings, conversion, field CWV, real business owner UAT and third-party image/partner consent remain UNKNOWN/OPEN.
- Public test-domain currently allows indexing and has its own sitemap/canonical alongside official knaba.de. Do not change SEO migration/canonical strategy without verified official owner approval.

Status: source integration candidate and tests; staging promotion requires the missing storage release gate and deployment postchecks.