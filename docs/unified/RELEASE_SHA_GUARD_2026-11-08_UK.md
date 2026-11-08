# C08-D — узгоджений ідентифікатор релізу до запуску API

## Підстава й межі

Продовження чинного KNABA DE на прийнятому F4-C1 source `131e582f1ffa50a89a5898742cf7f22b5b43efa7`. [PR139](https://github.com/ziko1/knaba/pull/139) і [CI42494833954](https://github.com/ziko1/knaba/actions/runs/42494833954) прийняті незалежно: ERP3192/128 files, bridge82, site732+37+35+10+8+297, root30; усі4 mandatory jobs SUCCESS, acceptance skips0. Ці лічильники належать попередньому source, а не цьому інкременту. [Незмінний receipt](evidence/identity-privacy-export-20261108/accepted-131e58.json).

API раніше допускав explicit `GIT_SHA` із40 нулів і вибирав неперевірений compiled global після створення Database та startup queries. Окремий operator preflight і bundler уже відхиляли zero SHA. Два actual compiled-entrypoint RED cases на попередньому runtime дійшли до навмисного `PG_POOL` trap: zero env SHA та різні valid env/compiled SHA. Вони не виконували справжній SQL або успішний запуск сервісу.

Ця зміна перевіряє формат і взаємну узгодженість release metadata. Самі40 hex-символів не доводять, що artifact зібраний із заявленого commit: clean source, exact tree, build manifest, artifact hashes та незалежне приймання залишаються окремими доказами.

## Контракт

`requireReleaseSha` приймає лише string із рівно40 lowercase hex-символів, який не складається лише з нулів. Explicit input не обрізається й не нормалізується. Окрема перевірка довжини відхиляє terminal newline, який регулярний вираз із `$` може пропустити. Відсутність означає тільки `undefined`; `null`, empty string, неправильний тип або malformed value є помилкою.

| Режим / вхід | Результат |
| --- | --- |
| Будь-який режим, задані однакові valid env і compiled SHA | Одне зафіксоване значення |
| Будь-який режим, valid env без compiled SHA | Значення env |
| Будь-який режим, задані різні valid env і compiled SHA | `RELEASE_SHA_MISMATCH` до Database |
| Після чинної production prerequisite перевірки будь-який заданий input невалідний | `RELEASE_SHA_REQUIRED_OR_INVALID` до Database |
| PRODUCTION, env SHA відсутній або порожній навіть за valid compiled SHA | Чинна prerequisite відмова; explicit env pin обов'язковий |
| TEST/DEMO, env відсутній, compiled valid | Значення compiled SHA |
| TEST/DEMO, обидва джерела справді відсутні | Чинний zero sentinel для unbundled development; не release attestation |

API один раз читає та фіксує `buildSha` до `new Database()`. Той самий рядок використовується чинними version routes та startup output. При невалідній конфігурації немає Pool constructor, GPS/retention/identity startup queries, provider call або worker interval. Негативні перевірки entrypoint використовують явні child-process traps; успішні controls доходять тільки до навмисного Pool trap.

Operator preflight зберігає обов'язковий SHA для всіх режимів і своє фіксоване повідомлення. Bundler зберігає Git fallback тільки за відсутнього env input та фіксовану помилку `EXACT_NON_PLACEHOLDER_RELEASE_SHA_REQUIRED`. Trim застосовується до stdout `git rev-parse`, а не до explicit env. Обидва використовують спільний валідатор. Значення входів не додаються до повідомлень про помилки.

Worker entrypoint, worker supervisor, API permission/identity contracts, SQL/schema, native та UI inputs не змінюються. Worker без release-metadata consumer не отримує нової вимоги API-only конфігурації.

## Приймання

У focused tests входять pure contract, actual preflight/bundler child processes та actual API bundles з esbuild banners. Перевіряються zero, newline, uppercase, malformed, `null`, number, mismatch, missing inputs та позитивні controls для трьох режимів. Bundler negatives працюють у порожньому тимчасовому каталозі без Git/assets і не створюють `dist`; це не заміна повного build.

Локальні результати, точні input hashes, review і бюджет записуються у [verification.json](evidence/release-sha-20261108/verification.json). Повне hosted приймання нового source має виконати всі4 mandatory repository jobs; counts попереднього F4-C1 не переносяться автоматично. Native trigger paths не змінені, нового native run не заплановано.

## Сумісність і відкат

Розгортання з різними env/compiled SHA або malformed explicit SHA тепер зупиниться раніше. Оператор має звірити exact artifact і його фактичний commit та виправити конфігурацію; приховувати mismatch зміною ідентифікатора в самому артефакті не можна. PRODUCTION з valid compiled metadata і відсутнім env SHA як і раніше не запускається.

Міграції даних немає. Source rollback до131e58 не видаляє даних, але повертає раніше відтворені слабкі startup guards. Це опис поведінки, а не прийнятий production rollback. У цій роботі немає merge, deployment, зміни реальних даних, платної активації, signing або store upload.

Whole product залишається **NOT_READY**. F3 issuance, решта F4 retention/erasure/restore/background policy, повна відповідність specialist/native journeys, фізичні пристрої, owner signing, provider/legal/company/load acceptance та вихідні72 V4/475 V3 критерії залишаються окремими gates. Паралельні PR135/137/138 мають власні source та докази й не включені до цього acceptance.

Окремо виявлено застарілі TPL-рядки traceability: source уже містить Original/Business/Modern presets, constrained ZIP import, preview та lifecycle, хоча старі18 рядків пишуть про їхню відсутність. Повне приймання цих складених вимог ще не доведене; наступна звірка має послатися на чинний source/test evidence і конкретні прогалини, зберігши початкові acceptance та без масового PASS.
