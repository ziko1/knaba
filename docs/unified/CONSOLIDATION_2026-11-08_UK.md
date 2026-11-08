# Консолідація KNABA: шаблони, Studio, Android та одна черга ERP

Статус: інтеграційний кандидат, NOT READY FOR CLIENT DELIVERY. Цей документ описує рішення композиції; фактичний результат нового повного CI має бути прив'язаний до опублікованого SHA.

## Джерела

- PR121, `7e448c6024718b932b79eeb2d38f3e3af672a1ae`: templates v1, JSON/stream resource limits, кореневий CI. Run42427106820 підтвердив root28, site600 Vitest+90 Node, VPS139 та ERP2530/2530 без SKIP.
- PR122, `690a0b9c882f5a3ef5d08e83c043f39091676603`: Android0.4.1, Studio atomic publication/current authority, contacts/favicon, reference-only site queue і ручний dispatcher. Його native/source receipts збережені, але не перетворені на новий integrated PASS.
- Подальші зміни тут: узгодження схем/контрактів, спільний dispatcher для CLI й scheduler, підписане призначення company, lease/config/session fences та TTL24h запрошень.

`main` і production не змінювалися. Локальна композиція feature-гілок не означає дозволу на їх злиття в основну гілку чи розгортання.

## Міграції

Обидві паралельні гілки використали номер0013. В інтегрованому ланцюжку збережено точну `0013_site_templates` з PR121, а additive `site_erp_outbox` із PR122 отримує номер0014. Старі0000–0012 та таблиці VPS залишаються незмінними; новий snapshot містить і templates, і outbox.

БД, яка вже має іншу0013 із PR122, не можна відкривати інтегрованим binary шляхом переписування ledger або вимкнення перевірок. Для одноразового тесту потрібна окрема чиста БД; для збережених даних — окремий погоджений backup/restore/reconciliation план. Старий binary поверх нового ledger також не є підтримуваним rollback. Поточний runtime може відкотити оформлення без видалення контенту.

## Один механізм передачі

Канонічна таблиця — `site_erp_outbox`, із reference до `cleaning_requests` та cascade-on-delete. Друга черга `erp_lead_outbox` не вводиться. CLI та scheduler використовують один core для claim, підпису, доставки й settlement; два окремі state machines не допускаються.

Використовуються чинні `KNABA_ERP_*` налаштування PR122, source `knaba_site` і endpoint `/api/v1/integrations/knaba_site/events`. Нові server-only company/mapping bindings прив'язуються до immutable event. Поле `target_company_id` входить у підписаний envelope, перевіряється ERP до транзакції і в domain apply/preview; переадресування ключа іншій company не дає права перенести стару заявку. Generic legacy clients без цього optional поля залишаються сумісними; новий сайт завжди його надсилає.

Затвердження передачі й privacy version обов'язкові. Вимкнений режим не надсилає нічого. Старі непіновані або portal rows не отримують довільного нового mapping автоматично: потрібне окреме reviewed backfill/identity рішення. `APPLIED`, `REVIEW` та невідомий результат `UNKNOWN` розрізняються; втрата receipt не доводить відсутність ефекту на ERP. Повтор має зберігати той самий event ID та payload fingerprint.

## Вміст заявки й privacy

ERP отримує мінімальний Lead за чинною схемою і точний source/external reference. Повний текст, реквізити початкової згоди та початкова заявка залишаються на сайті. Privacy acceptance не перетворюється на marketing або notification consent і не створює ERP identity.

Виправляються дві неточності старого mapper: частота «Einmalig/Regelmäßig» визначає лише `recurring`, а не бажану дату `desiredPeriod`; площа зберігається як customer-stated `facts.area` із m², але не стає billable `quantityMilli` без перевіреного контракту одиниці послуги. Вихідні поля не видаляються зі source row.

Reference-only черга не копіює весь contact/message. Обмежена attribution усе ще може містити персональні дані в campaign/path; її не можна називати гарантовано «без PII». Потрібні bounded cleanup, source deletion fence, відсутність payload у логах і окреме приймання загальної retention/DSAR/backup політики.

## Межі доказів

Старі test counts і APK receipts належать своїм джерелам. Новий інтегрований source вимагає повного root/site/ERP CI, реального HTTP SQLite→PostgreSQL acceptance, повторного review та exact-source build. Browser/device/live-provider/legal/UAT gates не закриваються таким CI. Zod advisory після mitigation лишається відкритим; 72 V4 критерії не отримують bulk PASS.
