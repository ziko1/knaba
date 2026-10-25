# KNABA — Live UX card release on VPS preview (2026-10-25)

**Environment:** publicly reachable developer-preview `https://kneba.vsp.rest`, **NOT** customer/official `knaba.de` production. No merge to `main`.

## Exact deployment provenance

- GitHub source-only Draft PR: [#65](https://github.com/ziko1/knaba/pull/65), stacked on Draft PR #64; first tested executable commit `b40c2e173e505ff9725449c30009fae02f131b3c`. The PR's full tree is **not** the deployed VPS release tree.
- Private VPS integration **actual live SHA**: `b14b0be1cfd43100afb073780da7c4bd1e8e6c99`, committed on top of **previous active VPS SHA** `9d06b6ae622267299f4ef820890064837587477f`, preserving live FAQ/Studio, construction guides and navigation fixes. Source-recovery bundle stays private/root-only on the host.
- Live artifact SHA256: `c2e8e988a691ba989c4280569193910fa487b81f7d1a99afb8f37cf7d8c3e9d6` across **177** released client files; independently recomputed and matched `release-manifest.json`.
- VPS release record: `/srv/knaba/vps/releases/b14b0be1cfd43100afb073780da7c4bd1e8e6c99/deploy-receipt.json` shows dev deployment 2026-10-25 14:27:39 UTC, verified backup receipt and previous release for rollback.
- The live source SHA is not automatically mirrored to GitHub due the existing source-publication safety gate. Do **not** promote the Draft PR as an identical live build or merge by inference.

## User-facing fix

Homepage and service catalogue, all **four published** locales DE/EN/UK/RU: same primary six-card layout. Entries `01`–`03` are cleaning services, **04 project planner CTA**, **05 Bauhelfer**, **06 Baustellenberäumung**. Links remain scoped to locale; the planner is not counted as an actual service. Planner palette is mint/sage/soft lime, matching the other cards. Text-rendered arrows replace boxed glyphs. Existing hero service carousel, additional technical offers, historical CRM service IDs and DB records are untouched.

## Verified acceptance

- Private integrated source QA on Node 24: **156/156 Vitest**, **16/16 Node**, **22/22 VPS** tests PASS, check/build complete; `117` emitted static HTML pages, `116/116` index-route browser reflow checks.
- Chromium isolated before release: **32/32** combinations (DE/EN/UK/RU × homepage/catalogue × 320/390/768/1280 CSS px) PASS. Verified exact six-card order, 01–06 labels, locale links, light CTA palette, responsive columns and no horizontal overflow. Independent review repeated all **116/116** generated index routes at 390 CSS px.
- **Independent live verification 14:28 UTC:** `8/8` public homepage/catalogue routes over HTTPS, correct rendered order and ordinal, HTTP 200; `/faq/`, `/uk/faq/`, `/sitemap.xml` returned HTTP 200; artifact SHA matching stage, TLS verify success; `/healthz` HTTP 200.
- **Independent live interaction QA:** `96/96` action-center hit tests across DE/EN/UK/RU, home/catalogue and 320/390 px. The fixed Assistant launcher did not occlude tested action centers; all had visible clickable destinations, with no horizontal overflow.
- Safe live deploy preserved prior immutable release and a verified SQLite backup; no migrations, tenant/CRM records, DNS or `knaba.de` production touched.

## QA incident and correction

One controlled attempt was automatically rolled back because a **direct loopback** check omitted the mandatory `Host: kneba.vsp.rest` header, causing expected **HTTP 421 Wrong host**. This was a false-negative in the test caller, not authorization to weaken the server Host validation. Correct diagnostic:

```sh
curl -fsS -H 'Host: kneba.vsp.rest' http://127.0.0.1:19110/healthz
curl -fsS https://kneba.vsp.rest/healthz
```

Both were later confirmed HTTP 200. A concurrent process completed the validated dev-preview deployment on the current source; the second safeguarded attempt recognized the target was already active and did not restart a second time.

## Open gates / next design work

- `/readyz` remains **503 owner enrollment required**. This is pre-existing and intentionally not bypassed; private owner Studio/auth must undergo genuine owner onboarding and UAT.
- Native 200% browser zoom, physical Android/iOS, Safari/Firefox, screen-reader, field Core Web Vitals, official customer/legal content sign-off and offsite backup restore are **NOT_RUN**. A synthetic CSS zoom is *not* a valid substitute.
- P2 visual refinement: replace operating-system-dependent service emoji with coherent lightweight local SVG icons only after brand review; retest all four published languages and mobile card grid. P1: genuine owner-scoped Studio acceptance and measured mobile CWV, without enabling paid providers or expanding 95 unreviewed language targets.
- Existing release rollback target: `9d06b6ae622267299f4ef820890064837587477f`; no customer DB restore is needed for static-card-only changes. Use immutable release and source pin checks before any later switch.
