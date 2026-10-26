# KNABA DE — відновлення AI-відповідей після збою

**Технічний обсяг перевірено; повна готовність продукту залишається NOT_READY.**

Перевірений executable: **`a10e70911fb519ec7d8199fa66141cd12b462926`**. Git tree: **`c62487ef71a88352df52bf5d396ce2b27f0bbd6c`**. Зміни опубліковані в [draft PR #6](https://github.com/ziko1/knaba/pull/6), який продовжує [PR #5](https://github.com/ziko1/knaba/pull/5). Цей пізніший documentation commit зберігає перевірений executable без зміни source manifest; його власний SHA не підміняє ідентичність runtime.

## Що змінено

Після збою worker розпізнає вже збережену відповідь і завершує повторну обробку без нового звернення до AI, дубля повідомлення, зміни обліку витрат або хибної передачі оператору. Якщо відповідь збережена, але завершення обліку витрат зірвалося, невирішений резерв зберігається.

Новий виклик допускається лише для одного відповідного cancelled reservation, де явно записано `provider_invoked:false`, а фактична й зарезервована суми нульові. Перед ним повторно перевіряються чинні права, джерело, job/lease, legal-transfer та бюджет. Повтор використовує той самий aggregate зі збереженою історією. Перед першим викликом фіксується консервативний маркер можливого початку запиту; після нього невідомий результат не перетворюється на безкоштовний retry. Lease попередньої спроби не може обнулити резерв наступної.

Додано **14 справжніх PostgreSQL сценаріїв відносно PR #5**: 13 crash/replay/authority cases і один historical ACCEPT/REOPEN ledger case. Останній перевіряє історичну арифметику та межу періоду без зміни прийнятого оригіналу. Сукупно відносно PR #4 додано 65 PostgreSQL cases. Успадковані зміни PR #5, його дві виправлені fixtures і окремий docs commit `1e7fbc04bc5b75d8044204f94da987d96c3271ee` збережені. Детальний контракт: [AI_GOVERNANCE.md](../../AI_GOVERNANCE.md).

## Фактичні перевірки exact source

| Обсяг | Результат | Межі доказу |
|---|---:|---|
| Повний unit/integration suite | **2 242/2 242 PASS**, 0 FAIL, 0 SKIP | 1 821 CPU/document/explicit-double та 421 genuine PostgreSQL |
| Історичні failure mappings | **40/40 PASS** | 38 збережених identities та дві явно описані V4 replacements |
| Нові PostgreSQL cases | **65/65 PASS** | 29 authority, 16 runtime, 13 replay, один historical ledger, шість load-seed |
| Три залишкові сценарії попередніх запусків | **3/3 PASS** | Lease-aware handoff, exact-recipient cancellation, completed-answer replay |
| Browser | **27/27 PASS** | 26 actual backend/UI та один HTTP fixture; без retries/flakes/skips |
| TypeScript, build, Docker/source-worker guard | **PASS** | Exact committed source, `source_dirty:false` |
| Backup, tamper rejection, restore | **PASS** | PostgreSQL 17.6; 17 таблиць, 12 private blob checksums/references; окрема порожня DB, source DB незмінна |
| Worker heartbeat/restart | **PASS** | Два різні процеси та durable probes, по одній спробі, exit code 0 |
| Android | **66 host Java PASS** | Debug build; lint 0 errors / 10 warnings |
| iOS | **19 actual XCTest PASS**, 0 FAIL/SKIP | iPhone 16 / iOS 18.5 Simulator; усі 45 bundle-file hashes збіглися |

Піднабори в таблиці не додаються до загальних 2 242. Усі сім isolated acceptance stages пройшли. Зовнішні AI/provider transports у regression suite є явно позначеними імітаціями. Локально виконано 1 821 CPU case з нулем помилок; 421 PostgreSQL case локально NOT_RUN. Реальний SQL результат отримано окремо в hosted CI.

- [Application CI 38098204054](https://github.com/ziko1/knaba/actions/runs/38098204054) — SUCCESS, job `114348501193`.
- [Native CI 38098204040](https://github.com/ziko1/knaba/actions/runs/38098204040) — обидва jobs SUCCESS.
- [Головний receipt](verification.json) — source, результати, hashes та межі.
- [Незалежна application перевірка](application-verification.json) — точні case mappings, source/index/built hashes, stages, restore і worker.
- [Оригінальний звіт усіх 2 242 cases](unit-results.json.gz) — lossless gzip; після розпакування 976 211 bytes, SHA256 `32d6f57b83ea72fca7eb3553782dd8577b78d683be02ee6f94917459614ed475`.
- [Browser report](browser-result.json), [stage receipts](live-stages.jsonl), [очищені restore excerpts](restore-log-excerpts.json), [стан workflow job](workflow-job.json).
- [Native receipt](native-verification.json) — фактичні тести, archive digests, APK/bundle hashes, simulator identity і lint.
- [Збереження source та перевірка документації](source-preservation.json).

## Перевірені пакети

[Незалежний packaging receipt](packaging-verification.json) підтверджує GitHub metadata, довжину, SHA256, ZIP CRC, безпечні шляхи та відсутність дублів для source/docs і обох runtime parts. Перевірено **454 committed source files** проти Git blobs, **113 shared runtime source files**, усі **14 built files**, executable permissions і відносні launcher links.

Runtime відновлено з двох частин: **45 024 537 bytes**, SHA256 `a2f7ff49d6dd45218f430d4bba7799601086ab83141d84eb28bc337583ce2332`. Він містить 13 985 файлів і 253 package manifests. Source/docs/runtime архіви належать executable `a10e…`; звіт та інтегрована історія PR #5 додані наступним docs commit. Перевірка цілісності пакета не є production operating rehearsal.

## Збережена історія

- [PR4: 40 історичних failures](historical-failures.json).
- [PR5 `1cbdbdc…`: 2 226/2 228, два failures](prior-pr5-1cbdbd.json).
- [PR5 `3f4370c…`: окрема успішна перевірка 2 228/2 228](../sql-recovery-2026-10-11/verification.json).
- [Проміжний `5a9e1866…`: 2 240/2 242, два failures](prior-replay-5a9e1866.json).
- [Native history `5a9e1866…`](native-5a9e1866.json) зберігає фактичні результати й cancelled iOS job; він не позначений як overall SUCCESS.

## Наступний обсяг

D07 зберігає відкриті задачі: особисті DECLINED/EXPIRED стани пропозиції та UI; окремий залишок опублікованого звіту; дозволений site-linking flow для scoped unbound orders; пізні material-readiness callbacks зі збереженням стану. Усі 72 compound V4 критерії та історичні 475 V3 критерії оцінюються окремо.

Повний load/SLO, offsite RPO/RTO, фактичні provider рахунки, company UAT, legal/provider approvals, фізичні мобільні сценарії та підпис компанії залишаються у своїх gates. Шість SQL seed regressions не замінюють 900-секундний load run. Існуючі Railway cutoff, MFA та EUR10/month boundaries збережені; цей increment не є merge або deployment.
