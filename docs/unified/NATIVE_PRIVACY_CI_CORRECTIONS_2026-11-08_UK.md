# KNABA DE: actual native/privacy CI та три цільові виправлення тестів

Дата: 2026-11-08. **Попередній aggregate FAILED; новий corrective source reviewed, actual CI ще NOT_RUN. Whole product NOT_READY.**

Published parent: `ba0686ed19bd6abc9c18d307e5df178cb52e6e14`, tree `647fd49b4efe53578d9b3c4831ef5a895eb865df`. Цей документ підготовлено в робочому дереві наступного кандидата; його новий commit ще не створено. Це продовження `NATIVE_F3_PRIVACY_SOURCE_CHECKPOINT_2026-11-08_UK.md`. Фактичні попередні результати збережено, а нові локальні перевірки мають окремий scope.

## Фактичний стан ba0686ed

| Run | Результат | Що фактично доведено |
|---|---|---|
| [Repository PR42517324475](https://github.com/ziko1/knaba/actions/runs/42517324475) | FAILED | Root/source та site jobs SUCCESS; ERP3340 PASS/1 FAIL із3341; paired runtime26 PASS; ERP browser aggregate incomplete |
| [Android PR42517324471](https://github.com/ziko1/knaba/actions/runs/42517324471) | SUCCESS | 81 JUnit/Robolectric,0 failure/error/skip; actual APK/AAB; lint0 errors/23 warnings |
| [iOS push42517320499](https://github.com/ziko1/knaba/actions/runs/42517320499) | FAILURE | Debug simulator build SUCCEEDED;209/210 XCTest PASS,1 failed assertion |
| iOS PR42517324482 | SKIPPED | Чинна same-repository workflow policy; не окремий PASS |
| Repository push42517320463 | CANCELLED | Чинна concurrency policy; не rerun і не acceptance |

Усі п'ять records мають exact ba0686ed, attempt1. Ручного dispatch/rerun, нового job/runner або paid activation не було. Деталі та primary artifact hashes: `evidence/full-completion-20261108/native-privacy/ba0686ed-correction/actual-summary.json`.

### PostgreSQL privacy

Raw Vitest має3341 test cases:3340 passed,1 failed,0 pending;151 file results. Новий privacy PG suite виконав15 cases:14 PASS/1 FAIL. Перший case зупинився на `revokedUnexpired`, очікування1, фактичне0. Наступні download/secrets/unchanged-proof assertions цього case ще не виконалися; їх не зараховано.

Root і автор звірили фактичні SQL/domain contracts. ERP child logout відкликає derived session. PRINCIPAL FENCE змінює principal state/minimum epoch і блокує current authority, але зберігає historical source session row `ACTIVE` та його expiry. Лише SESSION FENCE переводить цей row у `REVOKED`. Тест пропустив саме цю операцію; runtime projector правильно відображав stored facts.

Виправлення першого case перевіряє safe SQL projection до й після PRINCIPAL FENCE, виконує чинний signed `f.fence()` SESSION FENCE, перевіряє `REVOKED/version2` і незмінну future expiry, а потім перевіряє всі п'ять export buckets. Очікування `revokedUnexpired:1`, усі downstream assertions і решта14 cases збережені. Runtime/helper/projection не змінювалися. Typecheck,15-case collection та pure-domain witness пройшли локально; це ще не corrected PostgreSQL execution.

### Браузер

Actual SQLite/PostgreSQL HTTP pair26/26 PASS, включно7 F2 і8 F3. Site browser roles111, languages32 та public24 viewport cases PASS. ERP rendered suite має inventory30, включно11 privacy, але aggregate **FAILED/INCOMPLETE**: `result.json` порожній, wrapper завершив child через timeout. Часткові reporter dots не є повним числом PASS.

Чотири завершені traces мають45-second timeout на `getByLabel('Export contents', exact:true)` до будь-якого non-GET API запиту. Wrapping label містить також option text, а фактичне accessibility tree показує combobox із назвою `Export contents`. П'ятий trace перерваний shutdown, без завершеного case result. Окремо actual snapshot і чинний переклад підтвердили кнопку `Review change` замість літерала `Preview` у наступному кроці.

Виправлення змінює лише чотири locator expressions: два exact role/combobox selectors із чинним localized name та два `en('preview')` замість літерала. UI, fixtures/transport routes, assertion matchers, усі30 назв, runtime і45s/240s limits збережені. Локальні collection30/4files та narrow strict TypeScript PASS. Actual browser після виправлення NOT_RUN. Повний ERP dist не завантажували, тому artifact-tree hashes звірені між CI manifest/receipt, а не повторно обчислені з повного локального dist.

### iOS

У raw Xcode evidence перевірено66 build inputs проти git blobs ba0686ed. Actual Debug simulator build SUCCEEDED. Є210 унікальних XCTest results:209 PASS/1 FAIL;145 baseline PASS, federation64/65 PASS. Не створено final success artifact; post-test simulator install/launch не виконано. Це не device/IPA/TestFlight acceptance.

Єдина відмова — останнє assertion нового `testFederationBodyBoundDoesNotRaiseOrdinaryOrMediaLimits`. Історичний `ERPConsoleRecovery.swift` має65536-byte input cap та70000-byte encoded envelope cap для input/idempotency/version metadata; файл byte-identical між6a іba. Federation response має окремий65536-byte cap. Реальний URLSession oversized65537/bodyNil та ordinary2MiB assertions уже пройшли до помилкового очікування envelope64KiB.

Test-only correction додає явні pins для federation/input65536 і виправляє envelope expectation на чинні70000. Жоден runtime/journal/media limit не змінено. Усі210 test declarations збережені. Corrected Swift/XCTest локально NOT_RUN; потрібний новий macOS CI.

### Android: окремо прийняті артефакти

Root незалежно перевірив exact78 native inputs+1 vector, raw81-case XML, actual APK/AAB hashes/signatures/ZIP, scheme registration, callback constant у DEX та21 signed AAB payload entries. Android artifact verdict: `ACCEPT_ANDROID_ARTIFACTS_SCOPED_PHYSICAL_AND_WHOLE_PRODUCT_PENDING`, receipt SHA256 `239c5afda4dfc91e4d0f0ca5ec98d20f20c5d8228d0ca6dee9f0dcf0e5beaa9b`.

CI lint має0 errors/23 warnings. Окремий один local same-signer package має81 PASS і0 errors/20 warnings; три CI-only warnings стосуються target SDK та доступних новіших Gradle/Robolectric metadata. Жоден warning не приховано. Initial review-helper assumptions про path у manifest та однакові warning counts виправлені окремими evidence notes; продуктового дефекту або runtime зміни з цього не зроблено.

| Local TEST artifact | Bytes | SHA256 |
|---|---:|---|
| APK |3093102|`2672134aa1edffbd721c43ed4b252e500c9255c9b2b1f0c1caaef6182382a076`|
| AAB |1037392|`8831f82fedb7665b0219b928924c6f6ee1f60493d9cb7e42fa9c2371d682f554`|

Обидва local artifacts мають попередній public certificate SHA256 `db2f5fb3f756c05a51169c412f9bd93c9f229af10b55c406030736adcd69daa8`. Private key не експортували й не замінювали. CI certificate інший; CI artifacts не видаються за same-signer upgrade package. Package `de.knaba.mobile.test`,0.5.0-test/code8,minSdk31,targetSdk36. Physical install/upgrade/data retention/customer/store acceptance NOT_RUN. Прийняття Android artifacts не підвищує aggregate ba до PASS.

## Точний corrective source

Змінено рівно три test source paths:

| Path | SHA256 виправленого файла |
|---|---|
| `erp/tests/privacy-federation.integration.test.ts` |`acb1ca30cf48b290874801005236b017f55bdcccb59cca69260c9df3b8c21d3e`|
| `erp/tests/privacy-projection-ui.spec.ts` |`119c96c10e98b2ab07721050408182f76d8afefe67bda87e9c75a5dc62fa5b73`|
| `erp/apps/mobile-ios/Tests/ERPFederationURLSessionTests.swift` |`d6de8a4d4327211bbce52465fa760b42b01a7d9acc20788af295438ae4b6ff72`|

Three-file digest: `0fb82cc64ded282fd04655c4f709a70d777055cfea28464132d3c95ff7115a5c`. У попередніх59 frozen source inputs змінені лише ці3;56 інших inputs незмінні. Новий combined59 digest: `fc1028b2e4d97f4743f7e9d7a8f31c905d3b02dd641b5b5f657e38f19d91555c`. Production runtime/API/UI/SQL/locks/version/signing/workflows незмінні. Android79 inputs збігаються з прийнятими ba artifacts; серед66 iOS build inputs змінено лише зазначений test file.

Кожен patch окремо прийнято root independent source review. Review receipts зберігають actual PG/browser/XCTest як pending. Цей checkpoint містить40 byte-identical text/JSON/log/patch proofs та окремий preparation receipt; raw browser archives, images, HTML і traces не копіюються до Git/delivery evidence.

## Наступний gate та межі

Один bounded corrective source publication після незалежного review цього документа. Чинний CI має виконати actual PostgreSQL15, повний ERP/browser30, Android81 та iOS210; потрібні реальні завершені результати й незалежний review exact artifacts. Локальна collection або збірка не підміняє ці gates. Historical failures та metadata збережені.

Budget для ba звірено як USED; резервується один ordinary push/PR run set чинних workflows без timeout/runner/retention змін і без manual rerun. New paid activation ceiling EUR0; фактичні balances, зовнішні quotas та total existing costs UNKNOWN.

V3/V4,114 trace rows/42 IN_PROGRESS/72 AC NOT_RUN збережено. Native push та Zod remediation — окремі source slices, не частина цього corrective runtime. Production links/signing/providers, physical devices, restore/load/legal та company UAT лишаються окремими gates. Main merge, production/DNS/live DB, платні сервіси та store/TestFlight не виконувались. Existing version-aware privacy rollback requirement зберігається: stored v2 не перейменовують і не видаляють для сумісності.
