# Privacy PG failure ba0686ed — storage contract і вузька test correction

## Фактична початкова відмова

Source `ba0686ed19bd6abc9c18d307e5df178cb52e6e14`, run `42517324475`, ERP job `128843103865`: **3340 PASS / 1 FAIL / 0 pending із 3341**. Privacy PostgreSQL suite: **14 PASS / 1 FAIL із 15**. Raw Vitest SHA256 `0a5849cfc38d2c393b6af3786b3a5ff3867febac2fb52925b1b425bae3286920`; незмінений raw artifact збережено root у `verification/native-privacy-actual-ba0686ed/erp-artifact/erp-vitest.json`. Exact failed assertion скопійовано в `initial-failure.json`.

Case `exports own revoked F1/F2/F3 history without secrets and leaves all proof/replay/tombstone rows unchanged` завершився на `privacy-federation.integration.test.ts:65:138`: `revokedUnexpired` expected 1, actual 0. Downstream download/checksum/secrets/unchanged-proof assertions цього case ще не виконалися. Цей звіт не підвищує їхній статус до PASS.

## Root cause

Це **невідповідність fixture задуму тесту**, а не expiry/SQL projection defect.

| Операція fixture | Фактичний storage contract |
|---|---|
| `createFederationLoginPgFixture` → signed `REGISTER_SESSION` | Source session `ACTIVE`, epoch/version 1, expiry приблизно через 12 годин. |
| ERP KF3 child logout | `SiteFederatedSessions.logout()` відкликає `auth_sessions` і derived child у `site_federation_session_authorities`; source session не переписується. |
| Signed `FENCE scope=PRINCIPAL` | `SiteFederationLedger.fenceIn()` змінює principal high-water/state, повертає `sessionCount:0`; source session row не оновлюється. Principal стає `FENCED`, minimumEpoch 2. |
| Current-source guard після principal fence | `assertCurrentSourceSession()` відхиляє old epoch як `NEEDS_REAUTH`, навіть якщо історичний source session row ще `ACTIVE`. |
| Privacy v2 projection | Показує **stored facts**. `ACTIVE` з future expiry → `activeUnexpired`; не виводить effective authority з principal і не маскує ACTIVE як REVOKED. |
| Signed `FENCE scope=SESSION` | Явно записує source session `REVOKED`, збільшує version і зберігає відому expiry. Лише після цього очікуване `revokedUnexpired:1` відповідає storage. |

Початковий test пропустив останню операцію, хоча очікував її результат. Raw CI не містить дампа session row; наведена причина встановлена зі звіреного exact ba runtime/fixture, конкретних SQL branches і actual failing assertion. Не видаємо source reasoning за пряме спостереження дампа CI database.

## Дозволена root correction

Ізольований worktree `knaba-privacy-pg-correction`, branch `fix/knaba-privacy-pg-fixture-20261108`, base exact ba. Змінено лише `erp/tests/privacy-federation.integration.test.ts`:

1. Після child logout exact own source row перевіряється як `ACTIVE/version1/epoch1`, із future expiry за `clock_timestamp()` PostgreSQL та exact початковою source expiry.
2. Після PRINCIPAL fence той самий safe row snapshot має залишитися незмінним.
3. Викликається existing `f.fence()` — справжній signed SESSION FENCE fixture path. Row має стати `REVOKED/version2`, зі збереженими epoch/expiry/future flag.
4. Перевіряються всі п'ять session buckets: тільки `revokedUnexpired:1`, решта 0.

Назва й кількість cases, runtime, projector, SQL loader, shared fixture helper та всі downstream assertions збережені. Вихідне `revokedUnexpired:1` не послаблене. Source preimage і точний diff входять до manifest.

## Локальні докази та межі

`read-only-storage-probe.mjs` викликає реальні pure domain register/fence/current-authority/projector functions із synthetic rows. Exit 0; підтвердив обидві фази та strict expiry boundary. Це **не PostgreSQL, signed HTTP або повтор actual acceptance**. Його вихідний JSON збережено в `read-only-storage-probe.log`.

TypeScript `tsc --noEmit` exit 0; `git diff --check` exit 0. Collection only: початковий запуск без DATABASE_URL повернув порожній list, бо suite uses `describe.skip`; цей output збережено. Початковий summary inspection помилково звернувся до першого елемента порожнього list і дав `IndexError`, не product failure. Повтор collection uses explicit nonconnecting synthetic URL виключно для `vitest list`, без виконання hooks або PG. Його exact inventory/exit записані в manifest.

**Corrected actual PostgreSQL acceptance: NOT_RUN locally.** Нового CI, commit, push, provider call або dependency install не виконано. Наступний потрібний доказ — independent one-file review, потім root-owned exact corrective candidate CI.
