# KnaBa — Visual cards + FAQ Studio + Artifact Gate (25.10.2026)

## Release-candidate scope

Source PR branch `feat/knaba-visual-faq-audit-integrated-20261025`, executable HEAD verified: `a9fee7c119eada9951fe835f288d9d6afaff9b03`.

- Parent Draft PR #59 (Git commit `8668458cb06f52a0920b2f90aadd7305d2995b63`): sixth Baureinigung/planner card pastel contrast and full-width “Alle Leistungen”/locale equivalent link, responsive & keyboard styles.
- Reused Draft PR #53: read-only pinned release/tree hash audit, release switch/ABA detection, eight tests and integrated `npm test`.
- Reused Draft PR #57: allow FAQ `details`/`summary` only as bounded selector ancestors to edit leaf `span`/`p`; no whole-accordion replacement. SSR HTML escaping and browser select/preview/undo previously verified. Three Vitest and two Node focused tests.
- Source diff against PR #59 is one commit, ten documented paths. No auth, provider, database/migration, schema, Worker, Compose, payment or external-domain changes. Existing 42 FAQ entries across four translated languages retained.

## Verification at exact executable SHA

All commands executed in isolated RAM-backed checkout with Node.js v24.22.1 and lockfile-frozen `npm ci`, not on live worktree.

- `npm run check`: **PASS**, Astro/Vue/Svelte 0 errors and 0 warnings.
- `npm test`: **147 Vitest PASS** (24 files), **16 Node PASS** (8 inquiry + 8 pinned artifact).
- `KNABA_RELEASE_MODE=vsp npm run build` + `npm run verify:build`: **PASS**, 103 HTML pages, `VSP_PENDING_APPROVAL`, tree digest `4c0e0765a96b3a25a35fdad808a0223e683e270be2636ce0bab5b6e960de8adb`.
- `node --test vps/*.test.mjs` **after** generating `dist/vps/render-page.mjs`: **18/18 PASS**.
- `KNABA_RELEASE_MODE=vsp KNABA_VSP_INDEX_APPROVED=1 npm run build` + `npm run verify:build`: **PASS**, 103 HTML pages, `VSP_PUBLIC`, tree digest `d52fdcc8a85eed45b170a534141c4289e864526fbd00263422f220c0764f2257`.
- Isolated real Chromium against candidate static output: **12/12 PASS** (DE, EN, UK, RU × widths 320/390/1280). On every locale home: exactly six service cards, pastel-gradient request card, full-width services link, six FAQ preview cards. On full FAQ: 42 items, interactive search/zero result/category filter, 200%-font at 320px, no horizontal overflow, no page JS errors. This is browser QA for source candidate, not live owner login.

The public/noindex artifact digests here apply to different build modes. They are **not** receipts for the active VPS deployment.

## Why an automatic live deploy is still blocked

Read-only comparison found active `/srv/knaba/vps/current` pointing to a specifically labeled hotfix release `visual-card-8668458cb06f-20261025`. Its own `release-manifest.json` and `deploy-receipt.json` prove the scoped PR #59 CSS patch, and the stylesheet checksum `12ae58451bb25d94ed470199746edfc02e7b3395a915b6ed06fbf941ad2ee877` matches. Its parent `7e774c32863ad6b9f90a95288b5bd3495d941a51`, however, contains **unpushed `source-recovery.patch` changes** that have not been recovered to GitHub. Therefore the exact Git source/build identity of all live HTML/JS/CSS is unresolved.

The parent release was observed with 161 files; direct PR #51 VSP_PUBLIC build had 160 files. Only 43 files matched; 129 entries in the union differed. This is concrete proof that blindly deploying an older PR51/59/53/57 bundle would drop some running visual/SEO content.

Live hotfix preview remained healthy while observed: homepage, `/faq/`, `/en/faq/`, `/uk/faq/`, `/ru/faq/`, `/studio/`, `/healthz` returned HTTP200; `/readyz` returned 503 (no verified real owner); the live homepage's robots meta was `index, follow`. The developer preview is not the official `knaba.de` site.

The observed entire hotfix tree (162 files / 103 HTML / 2,995,891 bytes) had digest `b09858bd6e2f9620f07ca8351d4704478a828dec359867d53f59042417b683d0`, **observation-only**, with no independent full-tree build receipt. Manifest’s `distSha256` value applies to an unspecified scope; it must not be blindly equated with the entire observed file tree.

## Safe continuation / acceptance gates

1. Obtain/pin the full Git worktree and `source-recovery.patch` of current parent, verify diff and secure commit provenance.
2. Rebase the verified small patches on that exact, current source snapshot, preserving current color/FAQ/footer/SEO/Studio/Turnstile/auth.
3. Re-run both site index modes, Node/browser/real device/performance and isolated, authenticated owner draft→publish→restore; `/readyz=503` must not be relabeled READY.
4. Only then permit a scoped developer web update using shared lock, expected-current immutable release, independently verified asset SHA, fresh online SQLite backup/integrity test, bounded smoke and code-only rollback. Recheck current at every gate and abort on a race.
5. Do not merge to `main`, alter `knaba.de`/DNS/email, expose secrets, remove client data/backups, opt into external paid AI services or assume 95 pending locales have translations. Disk was around 96% used and remains a capacity gate.

Related tracking: [Issue #54](https://github.com/ziko1/knaba/issues/54) for missing source provenance, [PR #59](https://github.com/ziko1/knaba/pull/59) for current visual patch, [PR #53](https://github.com/ziko1/knaba/pull/53) for artifact gate, [PR #57](https://github.com/ziko1/knaba/pull/57) for FAQ editor.
