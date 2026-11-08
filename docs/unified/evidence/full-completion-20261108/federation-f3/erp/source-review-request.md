# F3 ERP: запит незалежного перегляду

## Зафіксований обсяг

26 файлів ERP API, shared protocol, additive SQL та власних тестів. База `b3cbb24a33b5c9e677ae2db10fc29e506e8529a1`. Поточна версія не закомічена; файли інших авторів не включені. Маніфест `source-manifest.json`, сумарний digest `d4dc06299a2191f79a26f802a7dc4038b531c3cea15135c80525d3e0cb41b566`. Після цієї фіксації source не змінюю без окремого погодження та нового маніфесту.

## Контракт та поведінка

F3 є окремою вимкненою за замовчуванням політикою поверх чинного F2. WEB і NATIVE використовують явне підтвердження поточного зв’язку F1, source session/epoch/generation, чинних політик і ERP користувача. Source RPC виконується поза SQL lock; транзакційні та фінальні перевірки користуються поточним PostgreSQL clock/ledger. Cookie `KF3.` має обов’язковий незмінний child lineage; archived pre-F3 authenticate відхиляє цей формат до DB.

Системний браузер NATIVE отримує лише одноразовий 60-секундний authorization code, public state й pinned ERP issuer. S256, точні client/platform/redirect, single redemption та секрети тільки в оперативній пам’яті збережені. Основна ERP cookie Strict не послаблена; flow cookie окрема Secure/HttpOnly/Lax. WEB pin-ить присутність/значення початкової ERP cookie; NATIVE не залежить від випадкової ERP cookie системного браузера.

Фактичний ERP TOTP/counter потрібний за поточними правилами; час MFA не переноситься на момент mint. Поточний source SESSION_USE перевіряється перед запитом і після асинхронних робіт/перед відповіддю. Cookie header відкладається до успішного final guard. Локальний logout зводить authority до нуля без мережевого source RPC, і може повернути лише прив’язаний до запиту фіксований ACK.

Вузький guard self device.enroll/device.bind запобігає втраті lineage через незалежний bearer або idempotency receipt. Інші дозволені бізнес-команди зберігають чинні permission/MFA/approval правила; committed operational effects не скасовуються через пізніший logout.

Human companyLabel однаковий у source inspection і ERP status, bounded120 з поточного company aggregate, fallback companyId. requiresErpMfa є явним boolean. Idempotency key відповідає точному чинному контракту: 8..200 printable ASCII (x20..x7e).

## Фактичні локальні докази

- 178 різних CPU tests PASS, 0 FAIL: 66 нових (protocol16, sessions32, flow10, HTTP8) і 112 чинних regressions. Final HTTP8 після вузького повернення canonical key range повторені успішно; це ті самі 8, не додаткові кейси.
- tsc --noEmit: exit0 на фінальній версії; явний receipt `typecheck-freeze.json`. git diff --check: exit0.
- Первинний protocol RED відтворив 3 відхилені нові actions на незміненому F2 union, потім GREEN. Exact old authenticate method виконується реально через TypeScript transpile/VM, не через переписаний аналог.
- Збережено й проміжні невдалі локальні прогони: session-first мав fixture clock skew10001ms; flow-first мав shadowed fixture property. Виправлено fixture, не ослаблено production guard або assertions.

## Не виконано та межі

18 PostgreSQL cases authored, локально SKIPPED/NOT_RUN. Повний перелік назв — `test-inventory.json`. Це actual PG+ERP HTTP+signed synthetic source suite; не приймається за runtime↔runtime pair. Root має окремі 8 реальних paired VPS/SQLite↔ERP/PostgreSQL кейсів та власні ERP browser scenarios. Їхні результати сюди не включені. SQL DDL/triggers, фактичні source fences/clock races/blob/SSE на PG і concurrency залишаються CI gate.

Не доведено production configuration, перевірену native app/universal-link ownership, signing/team/domain, native device execution або повну стару deployment rollback поведінку; доведена лише exact old authentication method boundary. F3 default-off. Privacy export/disposition metadata буде окремо спроєктований у чинному governance pipeline; довільного retention TTL/DELETE не додано.

## Запит reviewer

Перевірити mandatory child і відсутність legacy auth fallback; bind/cookie/parent/PKCE/one-use tuples; фактичний current MFA; online proof vs PG lock ordering і egress; local reduction ACK; SQL state immutability та компанію; self-derived bearer escape перед receipt replay; exact shared schemas/config fingerprints та строгі secret boundaries. Після review потрібні фактичні PG18, paired8 і rendered8 на спільному candidate; production activation не є частиною цього запиту.

## Погоджена correction після першої фіксації

Первинний manifest2b2b7c… і всі26 source bytes збережені у `frozen-v1/`; root незалежно перевірив66 нових CPU cases на тій версії й звірив hashes.

Actual Nest HTTP + actual AuthService/Engine + існуючий SQL/clock double відтворив RED: до unlink /me200, business permission403, source outage503; після terminal F1 unlink очікуваний401 був403. Виправлення обмежене private derived-session currentIn(): ACCESS_DENIED із mandatory current identity check переводиться у NEEDS_REAUTH. Загальний F1 resolveIn/currentSourceIn, login ceremony/permission semantics та unavailable503 не змінено.

На фінальному delta session32 + HTTP9 =41PASS/0FAIL/0skip; tsc --noEmit exit0, diff check0. Це один новий HTTP test. Загальна множина перевірених CPU cases179 (67нових +112чинних) утворена попереднім178 run та delta41, а не новим повним179 run. PG18 не запускалися. Змінилися рівно3 з26 файлів: sessions runtime, HTTP test і лише exports fixture для його actualHTTP setup.
