# Наскрізна перевірка public intake → ERP

Цей suite перевіряє реальний `createKnabaVpsServer` і зібраний Worker, SQLite на диску, підписані HTTP запити до зібраного ERP `dist/server.mjs` та справжній PostgreSQL. Він не входить у CPU-only ERP discovery: окремий job `bridge` обов'язково збирає обидва застосунки й піднімає ізольований PostgreSQL. Відсутність БД або артефактів спричиняє помилку, а не `SKIP`.

Умови запуску:

- Node 24.22.1, встановлені залежності обох модулів, поточні site/ERP production builds.
- `APP_MODE=TEST`; `DATABASE_URL` тільки `127.0.0.1`, база `knaba_bridge_ci` або `knaba_bridge_test`, PostgreSQL ≥17.6. Жодних реальних записів чи provider credentials.
- У CI `SOURCE_SHA` дорівнює HEAD, ERP release має чистий source; `/version` запущеного HTTP процесу повинен містити той самий SHA.

Із кореня репозиторію:

```sh
erp/node_modules/.bin/tsx --tsconfig erp/tsconfig.json --test --test-concurrency=1 --test-reporter=tap tests/bridge/*.test.mjs
```

Дев'ять сценаріїв охоплюють:

1. Анонімний HTTP intake, persisted owner cookie після restart та його revocation, відхилення підроблених authority fields, server-owned service/company mapping, реальний VPS scheduler → Worker → ERP; атомарні lead/inbox/audit/outbox, відсутність створених identities.
2. П'ять паралельних однакових заявок, два drainers, один ERP effect; однаковий replay і конфлікт локального idempotency key.
3. Реальний HTTP proxy губить відповідь після ERP commit; SQLite переживає закриття/повторний запуск, retry відбудовує exact event/body з source row та збереженого fingerprint і не дублює lead.
4. Автентифікований конфлікт payload з тим самим event ID створює ERP quarantine; перший lead залишається незмінним.
5. Відкликання mapped ERP actor після enqueue; scheduler зберігає `REVIEW`, без business effect. Owner HTTP status розрізняє `APPLIED` / `REVIEW` і не розкриває payload/контакти анонімному користувачу.
6. Невідома service mapping, вимкнення bridge та зміна mapping version не спричиняють ERP HTTP effects.
7. SQLite trigger навмисно відхиляє outbox insert: intake та audit відкочуються разом, повторна спроба створює один повний результат.
8. Відновлення простроченої lease після actual ERP commit і fencing старого settlement; два реальні delivery → один ERP effect.
9. Ротація credential у тій самій company зберігає duplicate receipt; credential іншої company не перенаправляє підписаний `target_company_id` і не створює записів у чужому tenant.

Trusted test dependency переводить лише точний налаштований `https://erp.example.com/api/v1/integrations/<source>/events` на ephemeral loopback HTTP, зберігаючи точні bytes, headers, signature та signal. У scheduler cases process-only fetch fence забороняє всі інші nonloopback адреси. Це **не** тест зовнішнього DNS/TLS, Cloudflare D1 deployment, реального провайдера або production egress. Єдина `site_erp_outbox` зберігає references/fingerprints без копії PII body; термінальні рядки також очищають attribution. Затвердження загальної privacy/retention політики для вихідної заявки лишається окремим release gate.

Чотири збережені `erp/tests/site-intake-bridge.integration.test.ts` додатково перевіряють actual PostgreSQL через in-process adapter, зокрема rollback перед ERP commit і зміну source після невідомого результату. Вони використовують той самий canonical dispatcher через CLI wrapper; HTTP proof на них не поширюється. ERP CI окремо збирає малий shared adapter із pinned esbuild, без заміни повного bridge job.

Поточна локальна межа перевірки: suite написано; PostgreSQL тут відсутній, тому нові SQL/HTTP cases **NOT_RUN**. Syntax, YAML та незалежний review не замінюють actual hosted run. Поточний source-bound результат має бути підтверджений окремим CI job; успіх іншого SHA не є прийманням цього suite. CI відхиляє будь-який failed, cancelled, skipped або todo case. Артефакт failure summary містить лише SHA та статуси jobs, без raw HTTP logs або персональних даних.
