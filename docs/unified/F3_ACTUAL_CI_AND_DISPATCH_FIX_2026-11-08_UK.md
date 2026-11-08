# KNABA DE — фактична перевірка F3 і виправлення диспетчера

## Поточний висновок

**F3_AGGREGATE_FAILED; CORRECTIVE_SOURCE_REVIEWED; PRODUCT_NOT_READY.**
Перша сукупна перевірка F3 виконана для source
`af6f84d0b511d186fbbc4c039a082e21e61c788e`, tree
`e49cb0d12a47b1f2aa43ae9966b3c8ef26aeda0f`, у
[draft PR129](https://github.com/ziko1/knaba/pull/129).
Цей запис продовжує історичний [source checkpoint](F3_NATIVE_MEDIA_CHECKPOINT_2026-11-08_UK.md)
і не змінює його попередніх receipts. Реєстр114 рядків,42 IN_PROGRESS та72 AC NOT_RUN
залишається незмінним; окремі перевірені функції не закривають складені критерії V3/V4.

## Фактичні результати першого запуску

| Обсяг | Результат для af6f84d | Межа доказу |
|---|---|---|
| Кореневі policy/source тести |29 PASS| Job128788150756 |
| ERP/PostgreSQL17.6 |3235 PASS,18 F3 FAIL;0 skipped| Усі18 зупинилися на LOGIN_INSPECT: очікували200, отримали400 |
| VPS SQLite ↔ ERP HTTP/PostgreSQL |18 PASS,8 F3 FAIL;0 skipped| Сайт отримав source failure503 після ERP400; downstream assertions не виконані |
| Поточний rendered browser |NOT_RUN| Попередній bridge step не пройшов; artifact із назвою browser містить лише manifest і TAP |
| Сайт |900 Vitest,92 Node,354 VPS PASS; check/build/verify PASS|161 HTML; CSS gzip40832/40960B, увесь emitted JS gzip222640/225280B; це не польові Web Vitals |
| Android |72 Gradle/Robolectric cases PASS; build/lint/package PASS|4 XML suites: media13, journal9, activity49, icon1; lint0 errors/24 warnings |
| iOS |145 XCTest PASS; simulator install/launch PASS|52 нові media cases і93 попередні; Xcode26.6, iPhone17/iOS26.5; фізичний пристрій NOT_RUN |

Main run [42499230900](https://github.com/ziko1/knaba/actions/runs/42499230900)
завершився FAILURE. Android run
[42499230893](https://github.com/ziko1/knaba/actions/runs/42499230893) та iOS push
[42499225525](https://github.com/ziko1/knaba/actions/runs/42499225525) — SUCCESS.
Повторний iOS PR42499231007 SKIPPED за чинною політикою, repository push42499225479
CANCELLED механізмом concurrency. Це не додаткові прийняті execution results.

## Причина та виправлення

Підписаний протокол і HTTP handler уже розпізнавали LOGIN_INSPECT, LOGIN_APPROVE
і LOGIN_STATUS. Внутрішній `SiteFederationLedger.dispatchIn()` допускав до callback
лише три попередні F2 actions, тому валідний F3 запит завершувався VALIDATION_ERROR
до `SiteFederationLogins.sourceAction()`. Runtime correction додає вже визначений
`FEDERATION_LOGIN_ACTIONS` до цього allowlist. Shared protocol, current company,
configuration/generation/phase, nonce/replay/savepoint і session-mint guards не змінено.

Додано7 регресій через справжній Nest HTTP ingress, перевірку MAC і production
ledger/login handlers; SQL/clock у цьому локальному наборі є явними doubles.
RED на незміненому runtime:4 FAIL/3 PASS. GREEN:69 PASS у5 файлах, включно з цими7;
незалежне повторне виконання7 PASS. Ці числа перекриваються, їх не підсумовують.
Typecheck пройшов. In-memory SQL fixture додатково моделює nonce/operation maps
і savepoint/rollback для цих HTTP регресій. PG fixture та bridge додають лише
обмежені діагностичні коди; усі8 paired cases, їхні assertions та порядок збережено. Діагностика не друкує
cookies, credentials, signed frames, IDs, HTML або довільні повідомлення помилок.

ERP correction і bridge delta незалежно прийняті в source-scoped review.
**PostgreSQL18, runtime-pair8 і rendered F3 browser10 після виправлення ще NOT_RUN.**
Їх має виконати наступний один зарезервований контрольний checkpoint.
Після проходження першого dispatcher gate можуть виявитися окремі downstream
помилки; локальний GREEN не замінює цю перевірку.

## Межі мобільних артефактів

Android APK0.5.0-test/code8: `de.knaba.mobile.test`, min31/target36,
SHA256 `314f674ecc87488321b8bf593e6a6d1ff0741533660f0206c991a3f7cd16a715`.
CI certificate `534be1abf24e67a8abc2bd1978529085c236664685964c78602c8bfed9e4922c`
відрізняється від збереженого попереднього local signer
`db2f5fb3f756c05a51169c412f9bd93c9f229af10b55c406030736adcd69daa8`.
CI APK не підтверджує сумісне оновлення поверх попередньої виданої збірки;
фінальний локальний пакет має використати збережений ключ, після чого потрібен
фактичний device/update acceptance. Попередній keystore збережено.

iOS app0.5.0/build8: `de.knaba.mobile`, minimum OS metadata17,
arm64 iOS Simulator. App ZIP SHA256
`46079462a072c4c481ebb24257b14b9582d044299cd8fa5bf36c471738d352a8`.
Збірка з `CODE_SIGNING_ALLOWED=NO` має linker ad-hoc CodeDirectory,
але не має developer/distribution signature або provisioning profile.
Це simulator/test bundle, не IPA, TestFlight або фізичний iPhone acceptance.
У build log є7 warning occurrences:4 чинні LocationTracker concurrency і3 AppIntents.
Цей checkpoint не заявляє warning-free build або перевірку runtime iOS17.

## Докази та продовження

Поточні scoped evidence: [actual CI](evidence/full-completion-20261108/federation-f3/actual-af6f84d/),
[перевірене виправлення](evidence/full-completion-20261108/federation-f3/corrective-dispatch/).
Бінарні CI archives збережені окремо; hashes і точні source inputs включені в receipts.
Кореневий release gate залишається NOT_READY.

Наступна залежність — actual corrected aggregate та незалежне приймання.
Потім черга: native F3 adapters із S256/state/callback і безпечним adoption нової
сесії; versioned identity privacy inventory/export у чинному approval flow;
native push, для якого підтверджено відсутність source implementation, а не лише
provider credentials. Read-only контракти цих продовжень підготовлені.
Providers, device signing/UAT, legal/restore/load та приймання власником залишаються
окремими gates. Main merge, production/DNS/live-data changes і paid activation не виконано.
