# KNABA — mobile navigation de-duplication and route QA (2026-10-26)

## Scope and baseline
- Source: `ziko1/knaba`, stacked candidate Draft PR #78, parent commit `3ec6eb096d72bb637aff7d4688be862178ec510d`. This evidence concerns a **new child branch**, not `main` or live release.
- Two user-supplied mobile screenshots show a repeated “explore services” CTA after the service cards and in the hero; the bottom dark title strip may be Android browser UI and is **not independently identified as site DOM**.
- Live `https://kneba.vsp.rest` read-only crawl on 2026-10-26: 88/88 sitemap routes returned HTTP 200; 0 unresolved internal fragment references among indexed routes. In DE/EN/UK/RU, hero and under-grid CTA both linked to the exact same `/<locale>/leistungen/`. The contextual optional-services CTA linked to `/<locale>/leistungen/#zusatzarbeiten` but reused the generic label.
- Opera Browser Connector: `Browser not connected`. Do not call this a visual PASS or disable browser admin restrictions.

## Minimal UX fix
1. Preserve exactly one accessible, full-width-on-mobile, design-system CTA to the catalogue in the hero. Remove the redundant full-width CTA below service cards, along with its dead CSS.
2. Remove the service grid’s now-unused `margin-bottom:28px`, keeping section spacing intact.
3. Preserve all six individual service/project detail links and the optional-services deep link; label the latter distinctly in DE/EN/UK/RU to match the destination.
4. Add regression checks to existing `marketing-contrast.test.mjs` and built-page `verify-build.mjs`, covering all four locales; extend existing `AGENTS.md` rather than creating a competing rules file.

## Recorded verification
- TDD RED: native Node test `node --test tests/marketing-contrast.test.mjs` returned exit **1**, 9 PASS / 2 expected FAIL for missing de-dup and extra-services label.
- TDD GREEN: **11/11 PASS** after source fix, exit 0.
- Toolchain: isolated authorized VPS workspace; published Node.js `v24.22.1` archive SHA-256 `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6` verified against nodejs.org SHASUMS256.txt; npm `11.19.1`; `npm ci` exit 0 (install-script approval warnings remained; they were not bypassed).
- `npm run check`: exit 0, Astro 0 errors / 0 warnings / 7 hints; Vue/Svelte checks successful.
- `npm test`: exit 0; 165 Vitest + 39 native Node + 27 policy/asset + 20 image/accessibility = **251 tests passed**.
- `KNABA_RELEASE_MODE=vsp npm run build`: exit 0, **121 HTML pages**.
- `KNABA_RELEASE_MODE=vsp npm run verify:build`: exit 0, including 18 VPS runtime tests, all built HTML local href/src destinations, locale metadata, heading uniqueness, partner assets and new CTA assertions. 251+18 = **269 automated tests** executed across both commands (counts are separate, not a single test harness).
- New isolated `127.0.0.1` HTTP smoke (no public cutover): 121/121 built HTML pages responded 200; DE/EN/UK/RU each had one hero catalogue CTA, zero under-grid duplicates, one localized optional-work anchored CTA; 13/13 locally served JPG/PNG/WebP files responded 200.
- Built artefact hash (generated `dist/client`, **not deployed**): SHA-256 `555717c821b9297b3e42238a9d109b80fd25f78ea8bd52c798679764503c5d70`. CSS gzip 34,708 B vs existing 40 KiB gate; JS gzip 182,737 B vs existing 220 KiB gate. Neither is a measured Web Vital.
- `git diff --check`: pass before publication. Keep release provenance against the final child-branch commit when published.

## Explicitly not certified
- No real mobile browser/device, 200%-zoom pixel/reflow or screen-reader inspection after these edits. Existing authored mobile rules are not a screenshot proof.
- No live change, production merge, customer-owner enrollment, form delivery or notification UAT; owner access/security gates and image rights remain unchanged.
- The source candidate and public preview currently differ. Public screenshot/layout acceptance, independent review, owner approval, rollback snapshot and exact deployed-artifact verification remain **RELEASE HOLD**.
