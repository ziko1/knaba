# Поточна реалізація V4

Стан: **вихідний код заморожений і локально перевірений; hosted реліз ще не прийнятий**. Ціль V4 і збереження NestJS/PostgreSQL SQL/outbox затверджені користувачем через ADR-0002. Оригінальний V3 master та історичні докази збережені.

Опублікований повний план: `2fb35d4219d637b1e1c8742459c8f352b31b469d`. Останній фактично прийнятий executable: `ca9ed79ff4c0429223eb60754289ee1132088361`. Поточні зміни коду ще не мають candidate SHA й потребують нових hosted доказів.

Реалізовано вихідний код: точні десяткові ставки/розбиття часу, 10-хвилинну MFA, незалежний Lead review і внутрішню верифікацію вимірів, незмінний опублікований кошторис/acceptance, збереження прийнятого завдання з окремою переробкою, GEOFENCE_V1/видані сервером lease/boot/monotonic/reconciliation, native 72-годинну GPS-чергу, незалежне payroll/payout погодження та reconciliation/нові заяви, ліміти фото10/PDF20MiB, quiet20–07/retry1–5–15/обмежені geo reminders, generic signed inbound/quarantine/minimized approved outbound, іменовані REST та opaque keyset pagination, повторювані atomic-PG uploads, approved-retention production gate. Форми мають контекстні довідники, явний null і конфіденційний PDF.

Календар оператора, guards замовлення, багаторядкові матеріальні заявки, серверний device batch, current-source сповіщення та форми canonical employee ID підключені до серверу/Worker/UI. Фінальні scope/replay регресії завершуються перед загальним прогоном; rendered browser та actual SQL/native/load ще потребують hosted виконання. Детальний 22-delta реєстр: [V4_IMPLEMENTATION_STATUS.json](V4_IMPLEMENTATION_STATUS.json).

Проміжний локальний integration прогін: 1 648 PASS, 0 FAIL, 295 genuine PostgreSQL NOT_RUN. Вихідний код продовжував змінюватися; це не фінальний exact-SHA release proof. Фінальний source freeze має завершитися typecheck/build/full applicable hosted SQL/browser/restore/Worker/native/independent packaging перевірками. Всі 72 compound V4 критерії наразі NOT_RUN.

Railway URL залишається NOT_READY. Попередній cutoff сплив; reviewable tested patch, конкретне поновлене вікно та Dashboard MFA потрібні для запуску. Погоджений ліміт €10/місяць не змінений; recurring cost ще не виміряна. Єдиний зовнішній список: [EXTERNAL_PREREQUISITES.md](../EXTERNAL_PREREQUISITES.md).

Явні незавершені source-контракти D07: персональні offer DECLINED/EXPIRED та їх UI; окреме поле залишку у published report; узгоджений state-preserving callback пізнього матеріального забезпечення для IN_PROGRESS. Core load runner/окремий CI job створені, але жодні фактичні latency/load/RPO/RTO результати поки не прийняті.

Фінальний заморожений локальний прогін: **1 821 CPU/document/explicit-double PASS, 0 FAIL; 356 PostgreSQL NOT_RUN**, 87 файлів / 2 177 точних case identities. TypeScript PASS; classifier/packager EXACT_INDEX_VALIDATED, 4 явні V4 заміни застарілих кейсів. Executable source manifest SHA256 `b5e3505381fb3e2f07b36733af74e037b04ec44ef9778d4eb3bd7d0910f6ffd9`. [Доказ](../evidence/v4-source-freeze-local-summary.json). Clean-commit build і hosted SQL/browser/restore/Worker/native/core-load/незалежні артефакти залишаються окремими обов’язковими кроками.
