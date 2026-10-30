# KNABA — звірення активного VSP-коду з GitHub (25.10.2026)

**Мета:** відновити відтворюваний вихідний код тестового сайту, зберігши всі вже активні зміни, окремо від офіційного knaba.de та БД замовника.

## Вхідні артефакти та походження

- Поточний розгортаний реліз під час початкової перевірки: `/srv/knaba/vps/releases/visual-card-8668458cb06f-20261025` (статичний hotfix PR #59).
- Базовий source: GitHub PR #59 `8668458cb06f52a0920b2f90aadd7305d2995b63`, від PR #51 `5f4e3d1a8ce100578c90453c7e68bc3f59df91e7`.
- Source-only recovery патч, що залишився в immutable релізі `7e774c32863ad6b9f90a95288b5bd3495d941a51`: SHA256 `fcd62bf44c1efe0c596cca95b69bb540af7d89a0f72045ab4f35668e14475339`; 23 шляхи; без конфліктів із PR #59.
- Перший локальний recovery коміт: `bc79def8d7a782838007fc0af74c6df32fa7606f`.
- Друга інтеграція: PR #60 `b32d3edf47c9bf57da8f5697de04475abaf3a4b7`, diff SHA256 `abb8fc4bd8b91695bae1a180958811f5b78e75f469d9d142b7e17d57fa97151c`; обережно імпортовано 11 шляхів. Включає редагування FAQ листових текстових вузлів у чинній Studio та read-only verifier.
- Будь-які інші незлиті PR не застосовувати автоматично.

## Fresh QA: code з PR #59 + recovery + PR #60

Ізольований контейнер `node:24-bookworm-slim` / Node v24.22.1; `--cpus=2 --memory=2600m --pids-limit=256 --cap-drop=ALL --security-opt=no-new-privileges`; одна ефемерна RAM-backed збірка. **Жодних DB/secrets/live mounts.**

- `npm ci --no-audit --no-fund` — EXIT 0.
- `npm run check` — EXIT 0, Astro 0 errors/warnings (4 інформаційні hints), Svelte 0 errors/warnings.
- `npm test` — **151/151 Vitest**, **16/16 Node** tests PASS.
- `KNABA_RELEASE_MODE=vsp KNABA_VSP_INDEX_APPROVED=1 npm run build` — EXIT 0, **103** Astro static pages.
- `npm run verify:build` — internalLinks PASS, metadata PASS, `VSP_PUBLIC`; artifact SHA256 **`3000f2179dec5c724b08005f95627406405d38ede9581d6ea8904a66590ac745`**.
- `KNABA_RELEASE_MODE=vsp node --test vps/*.test.mjs` — **18/18 PASS**.
- Existing runtime read-only checks showed public home/FAQ HTTP 200; private Studio API HTTP 401 without session; `/healthz` HTTP 200; `/readyz` HTTP 503 because genuine owner is not enrolled. These probe a *different, already active* artifact and are not evidence that this source branch has been deployed.
- Static build warnings about Vite extensionless config import exist; no measured runtime regression from them.

## Safe VPS storage recovery

At start disk /dev/vda1 was 197G total, 178G used, 9.3G free (96%). Identified old `node_modules` from prior QA under explicit `/tmp/knaba-*-20261024` directories. Revalidated their real paths, ages ≥18h and absence of open process file references before removing **only eight node_modules folders** (no source trees, databases, release/backup files). Measured approximately 5,183,991,808 reclaimable bytes; after cleanup 173G used, 15G free (93%). Still below conservative production/storage gate.

## Pending and release discipline

- **Draft/source reconciliation only.** Not a GitHub main merge and not authorization for official `knaba.de` release.
- Shared dev current symlink is concurrently changed by other releases. Require exact expected current target and shared deployment lock before *any* cutover.
- Preserve immutable previous release, production SQLite online backup/integrity, Compose/TLS and owner permissions. PR #60 verifier requires immutable 40-hex source release path; current `visual-card-...` is an overlay and cannot be truthfully attested by that utility.
- Owner invitation/authority, physical mobile/Safari/Firefox, genuine Turnstile, complete accessibility, legal/GDPR review, Search Console/Bing verification, field CWV and independent customer security sign-off remain **NOT_RUN**.
- No paid provider calls, no credentials delivery, no owner impersonation, no DB migrations, no customer data modifications.
