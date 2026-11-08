# KNABA DE — продовження релізу 0.5.2

Доручення: застосувати «Реліз застосунку», усунути виявлені прогалини й продовжити до перевірених тестових збірок, повної матриці та пакета передачі. Погоджений V4 + сумісний V3 + site/mobile scope збережено. **Повний продукт NOT_READY; клієнтське приймання HOLD.**

## Джерела та інтеграція

База — PR133, `bb223af67af9eae5f11e7ca225f89ddf97a8e4e2`: актуальний backend e747fd94 та native iOS0.5.1. PR129 `e03d2be0d0ea1ae7ced90f50631c7b81cd34c5b5` не є надмножиною цієї бази; повна заміна втратила б чинні F2/F4 guards і tests. Перенесено тільки bounded recovery logic з адаптацією до поточної SQLite/auth архітектури. Зміни перебувають в ізольованій `feat/knaba-release-continuation-20261108`; merge/deploy не виконуються.

Незмінні native bb223 artifacts отримано з run42486326902. Android APK SHA256 `14501b771ba7e3bc51012763f9f32a589b7d1c332d384a53ae479f61720dc0f2`, iOS simulator ZIP `b32347c7f6be30d39c5baf95e9d8d21f92e8b70dd3095e5fbb87c3838c7ff24f`; первинний XCTest summary підтверджує67 PASS/0FAIL/0SKIP. Це попередній кандидат; його байти або результати не перейменовуються на0.5.2.

## Зміни й межі

| Критерій | Реалізація | Доказ до hosted перевірки |
| --- | --- | --- |
| MOBILE-011: unknown-write recovery/logout | Збережено прийняті bb223 durable journal, exact-envelope retry, session generation fences та коректний redirect delegate | 67 actual XCTest належать bb223; нова0.5.2 перевірка pending |
| Localization gate / native versions | Єдиний declared-version contract; обидві платформи0.5.2/build9; six-locale/placeholder gates перед native jobs | 6 process/mutation tests PASS;95 companion+162 ERP localization rows; source only |
| KN-C08-B: company/origin | Явний bounded company; demo fallback лише DEMO/TEST; production demo IDs відхиляються; HTTP(S) root origin без credentials/path/query/fragment; HTTPS у production; API canonical origin, worker raw origin | 293 focused PASS/2SQLskipped;49 compiled-entrypoint checks із явними PG/network/interval traps; TypeScript PASS |
| Template delivery origin | Відсутній origin завершує template delivery доSENDING/provider; збережено text jobs без URL | Додано2 real-PG regressions; виконання hosted pending |
| Self-service password recovery | Одноразовий capability, bounded mail, atomic password/session/token/audit update; чинні F2/F4 authority readers збережено | Local SQLite/HTTP/compatibility evidence; combined PostgreSQL bridge pending |

Окремий before-control на незміненому bb223 відтворив4 цільові company/origin failures;45 інших cases цілеспрямовано не запускались. Після виправлення відповідні сценарії входять до293 PASS. Це source/bootstrap boundary доказ, не справжній PostgreSQL startup чи company authorization.

Account recovery002 — додаткова checksumed VPS auth migration; ledger001 та його guard збережено. Production startup не мігрує мовчки. Перед операторським застосуванням потрібні backup, rehearsal і явний migration gate. Live email залишається OFF; synthetic mail receipt не означає доставку листа користувачу. Деталі: [операційний контракт](../../corporate-site/docs/PASSWORD_RECOVERY_OPERATIONS_UK.md).

## Команда, приймання та наступні кроки

`/root` відповідає за native/runtime/config/template та package; `/root/scope_matrix` — за source reconciliation і bounded recovery. Взаємне review проводиться по різних ownership scopes. Exact final commit, hosted logs, artifacts, hashes та independent acceptance записуються у фінальний release packet; жодного незапущеного test PASS тут немає.

Після source freeze потрібні актуальні repository CI з реальними PostgreSQL/SQLite bridge та native CI. Далі — перевірка отриманих bytes/метаданих і повна PASS/FAIL/BLOCKED matrix. Фізичні Android/iPhone, стабільний Android signer/upgrade, signed IPA/TestFlight, реальний TEST ERP, providers/правові параметри, restore/load/company UAT та незавершені F3/business сценарії лишаються окремими gates. Історичні24 V4 блоки/72 AC,18 template criteria,432 V3 requirements і475 V3 acceptance не отримують bulk PASS. MOBILE-012 додається до повної матриці, а не губиться через старий denominator142.

Поточні квота/ліміти: [BUDGET](../mobile/BUDGET.md). Нові платні послуги, production, DNS, store uploads і повідомлення замовнику не виконуються.
