# KNABA DE — F3: фактичний 303 і контрольований HTTPS return

**F3_NOT_ACCEPTED_REQUIRED_BROWSER_FAILURE; PRODUCT_NOT_READY.**
Цей checkpoint зберігає фактичний результат source
`77b64956d94f68233dff80e35b5b0e73a2e9ef50`, tree
`87a91a49fccdbbc9dfdb72f5e6bf1dd89575f3c1`, та окреме вузьке виправлення
browser transport у [draft PR129](https://github.com/ziko1/knaba/pull/129).
Попередні dispatcher і label/domain failures збережено у власних історичних
receipts; новий результат не переписує їх.

## Факти останнього прогону

| Перевірка на 77b64956 | Actual результат |
|---|---|
| ERP CPU + PostgreSQL17.6 |3260/3260 PASS,0 FAIL/SKIP;147 files |
| Обов'язкові F3/F2 PostgreSQL |18 F3 +24 F2 PASS, включені в3260 |
| Сайт SQLite ↔ ERP HTTP/PostgreSQL |26/26 PASS:8 F3,7 F2,11 попередніх |
| Rendered HTTP fixtures |18 PASS /1 FAIL;19 executed;0 skipped/retried/flaky; F3=9/10 |
| Browser roles / languages / public |111 /32 /24 PASS |
| Root і сайт |29 root;900 Vitest +92 Node +354 VPS, check/build/verify PASS |
| Android run42504597544 |SUCCESS; native inputs незмінні |
| iOS PR42504597458 |SKIPPED за чинною policy; нового iOS push run немає |

[Repository PR run42504597503](https://github.com/ziko1/knaba/actions/runs/42504597503)
завершився FAILURE тільки через обов'язковий rendered F3 case. Repository
push42504593986 CANCELLED за concurrency policy. Native artifact acceptance
залишається прив'язаним до af6f84d:72 Android cases та145 iOS XCTest/simulator;
121 унікальний native input path незмінний. Це не нове приймання фізичного
пристрою, upgrade signing або store release.

Actual manifests, case inventories, archive sizes/digests, safe extraction і
scoped results перевірено незалежно. Final receipt SHA256:
`6f2a8c795900a08eca4beb6ba5f6c752503aa5a772f58e09bd0126bf3c7674f7`.
[Bounded actual evidence](evidence/full-completion-20261108/federation-f3/actual-77b64956/)
зберігає оригінальні bytes; повні текстові журнали доступні в
[окремому evidence bundle](https://chatgpt.com/library?file_id=libfile_63469d32357081918c88184c80696ea1&account_id=personal).
Bundle SHA256 `864d94af7e7e282f65995c028b499b294c9bd5b38009d41c2cd6658a0796c08b`,
306503 bytes/28 entries; TEXT_EVIDENCE_SUBSET без browser images/trace/HTML
і без повторного native archive. Metadata-only посилання на excluded files
не є їхніми bytes. Це не повна копія browser archive.

## Підтверджена межа browser fixture

Невдалий case:
`F3 HTTP fixture: actual Strict/Lax cross-site continuation and explicit WEB account plus MFA confirmation`.

Попереднє виправлення реально пройшло: перший cross-site source GET не містив
Strict source cookie; password input, accessible name, required/autocomplete,
введення пароля та explicit consent виконано. Continue і Approve POST містили
source cookie. Approve повернув справжній HTTP303 з exact ERP return Location.

Browser trace зафіксував наступний return GET із Lax flow cookie та без старої
Strict ERP cookie. Запит завершився `net::ERR_NAME_NOT_RESOLVED` для
`erp.browser.invalid`; це спостереження browser request, а не отримання його
ERP сервером. Очікування account review спливло на Chrome DNS error page;
подальші ERP MFA і new-session assertions не виконані.

Pinned Playwright1.55.1 документує в установленому
`playwright-core/types/types.d.ts` виклик route handler лише для першого URL
redirect chain. Синтетичний `page.route(...).fulfill(303)` не обслуговує
наступний redirected URL. Збільшення timeout не виправляє цю DNS межу.

## Обмежене виправлення transport

Три source paths — `erp/tests/federation-login-ui.spec.ts`,
`erp/tests/fixtures/federation-https-return.ts` і
`erp/tests/federation-https-return.test.ts`. Application runtime, protocol,
workflows, dependencies, cookie policies і mandatory case inventory не змінюються.

Перший WEB case використовує окремий loopback HTTPS listener з ephemeral port.
Source response лишається HTTP303; браузер сам виконує redirected GET. Listener
приймає лише exact method/Host/return target з очікуваним request_id, віддає bytes
поточного `dist/web/index.html` та фіксує фактично отриманий Cookie header у RAM.
Решта asset/API responses лишається явними fixtures. Cookies не переносяться
вручну; source redirect не замінюється JavaScript navigation.

Тимчасовий self-signed certificate створюється встановленим OpenSSL у приватному
тимчасовому каталозі; PEM files прибираються після створення TLS context. Listener
має обмежені timeouts/connections і закриває власні sockets/files у finally.
Дозвіл synthetic self-signed TLS scoped лише до цього test case; глобальні TLS
налаштування не змінюються. Це не доказ public TLS/DNS readiness.

[Frozen source preparation](evidence/full-completion-20261108/federation-f3/browser-transport-correction/)
має manifest SHA256
`3e81ba032e6e7038f197a9aaccf3099d8ec03fa0d8c61a26b1139991267b69af` і source digest
`3735630d3767c2fe91e6a83945b93dd93b055e8bfaa2cf5f9566e994d083531e`.
Авторські 4 Node HTTPS tests пройдені; root незалежно повторив ті самі 4/4,
0 FAIL/SKIP. Це повторна перевірка чотирьох cases, не вісім різних тестів.
Typecheck exit0; collection19 cases/3 files exit0. Початкові три type errors
виправлено, первинний failed log збережено окремо. Незалежні source і downstream
reviews прийняли exact frozen files у межах test-source scope.

Усі 19 full titles та інші дев'ять F3 bodies байт у байт відповідають baseline.
Source-cookie, flow-cookie, old-cookie, consent, MFA, new-session і storage
assertions збережено. Actual corrected browser execution залишається **NOT_RUN**.
Focused Node/OpenSSL transport checks і Playwright collection не замінюють
browser SameSite/MFA acceptance.

## Наступна залежність і rollback

Після local verification та independent source review виконується один
зарезервований candidate checkpoint через чинні workflows. F3 dependency
приймається лише за actual corrected PostgreSQL/pair/browser required aggregate
та незалежним receipt на exact source/tree. До цього native F3 adapters і
versioned identity privacy implementation лишаються в черзі. Native push —
окремий подальший source gap.

Rollback обмежений цими test-source змінами; historical failure evidence не
переписується.114 trace rows/42 IN_PROGRESS/72 AC NOT_RUN та нормативні V4/V3
збережені. Whole product NOT_READY. Merge, production/DNS/live DB, paid-provider
activation і store/device publication не виконано.
