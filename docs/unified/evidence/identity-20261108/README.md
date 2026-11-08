# PR123: identity authority evidence, 2026-11-08

Це докази конкретного auth patch від `d03e72b8c5030390c635f3aac9133d977078dedf`; попередній CI run не переноситься на нього. Загальний продукт **NOT_READY**, shared site/ERP SSO **NOT_IMPLEMENTED**.

- `verification.json`: актуальний scope, local/CI status, незалежний review та межі.
- `source-files.json`: SHA-256 змінених runtime/test inputs; незмінні inputs успадковуються від base commit.
- `local-runs.json`: результати окремих RED/GREEN ітерaцій, їхні raw-log digests і sanitized assertion names. Suites перекриваються; кількості не підсумовувати.
- `site-source-and-local.json`: 13 перевірених site inputs, 197 VPS tests, static/build evidence.

Failure payloads із synthetic bearer/CSRF/password material не копіюються до репозиторію. Перший portal RED мав один помилковий positive fixture; виправлений RED окремо довів чотири реальні scope failures. No skipped/local-double tests are represented as actual PostgreSQL acceptance.

Повторення: чистий Node24 checkout; root `npm run audit:source && npm run verify:modules && npm test`; site `npm ci --ignore-scripts` та чинні check/test/build/verify:build/test:vps; ERP `APP_MODE=TEST` з ізольованою PostgreSQL, чинні migrate/typecheck/build і повний `npm test -- --no-file-parallelism`. Без DATABASE_URL SQL suites локально пропускаються — це NOT_RUN. Точні services/build/intake prerequisites визначає незмінний `.github/workflows/ci.yml`.
