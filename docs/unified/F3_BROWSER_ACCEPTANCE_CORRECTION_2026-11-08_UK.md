# KNABA DE — F3: PostgreSQL і runtime pair прийняті, browser gate відкритий

**F3_NOT_ACCEPTED_REQUIRED_BROWSER_FAILURE; PRODUCT_NOT_READY.**
Факти нижче стосуються exact source `a202ddc8d527f90dc7c13a923a11336410623173`,
tree `9e3701b233312b648a4f12ef7ee190e5b89447e8`, у
[draft PR129](https://github.com/ziko1/knaba/pull/129).
Попередню відмову af6f84d і dispatcher correction збережено в
[окремому історичному checkpoint](F3_ACTUAL_CI_AND_DISPATCH_FIX_2026-11-08_UK.md).

## Фактичний результат

| Перевірка | Результат | Обсяг |
|---|---|---|
| ERP CPU + PostgreSQL17.6 |3260/3260 PASS;0 skipped|147 file results;18 F3 PostgreSQL та24 F2 PostgreSQL включені в загальне число |
| Сайт SQLite ↔ ERP HTTP/PostgreSQL |26/26 PASS;0 skipped|8 F3,7 F2 та11 інших чинних сценаріїв |
| Кореневі тести і сайт |PASS|29 root;900 site Vitest,92 Node,354 VPS; check/build/verify |
| Browser roles / locales / public views |PASS|111 /32 /24 відповідно |
| Обов’язкові rendered HTTP fixtures |18 PASS /1 FAIL;0 skipped/retried/flaky|4 transfer,5 F2,9 із10 F3; усі19 виконані |
| Android workflow |SUCCESS|Новий run42502394288; native inputs не змінено. Повний попередній artifact review залишається прив’язаним до af6f84d |
| iOS workflow |SKIPPED_BY_POLICY|PR42502394289; нового push run немає.54 iOS inputs незмінні, останні145 actual XCTest — af6f84d/run42499225525 |

[Main run42502394292](https://github.com/ziko1/knaba/actions/runs/42502394292)
завершився FAILURE через обов’язковий browser case. Repository push42502389977
CANCELLED за чинною concurrency policy. Actual source/build manifests, case
inventories та ZIP digests перевірені незалежно; жодного skipped/cancelled run
не враховано як acceptance.

Browser тут виконує поточний ERP build і VPS HTML з явно перехопленими синтетичними
HTTP відповідями. Chromium забезпечує фактичну DOM/cookie поведінку. Це окремий
доказ від runtime pair із PostgreSQL; він не доводить production TLS, DNS,
native app links або фізичний пристрій.

## Два підтверджені дефекти fixture

Невдалий case — `F3 HTTP fixture: actual Strict/Lax cross-site continuation and explicit WEB account plus MFA confirmation`.
Він зупинився на `getByLabel('Current password', {exact:true})` після переходу
на сторінку перевірки акаунта. Error context і screenshot показують видиме поле
з доступною назвою `Current password`. Label також має обов’язкову зірочку у
`aria-hidden` span; pinned Playwright1.55.1 label matcher включає її в текст label.
Тому очікування exact label не збігалося з фактичною розміткою.

Trace додатково підтверджує, що перший GET до `site.browser.invalid` уже містив
синтетичний Strict source cookie. ERP і source hosts ділили registrable domain
`browser.invalid`; перехід не був cross-site. Відкладений до кінця цього case
assertion про відсутність Strict cookie також не пройшов би. Значення cookies
не включені до діагностичного висновку.

## Вузьке виправлення і доказ перед наступним запуском

Єдиний змінений source path — `erp/tests/federation-login-ui.spec.ts`:

- source origin — `https://site.source.invalid`, ERP залишається `https://erp.browser.invalid`;
- наявну перевірку відсутності Strict source cookie перенесено без зміни очікування
  безпосередньо після першого переходу, перед Continue;
- password input визначається точним ID/name/type, а його accessible name,
  `required` та `autocomplete="current-password"` перевіряються явно перед fill.

Назви і кількість усіх10 F3 та19 загальних обов’язкових cases збережено.
Перевірки source POST cookie, consent, ERP MFA, Lax flow cookie, відсутності старої
Strict ERP cookie на поверненні, нової KF3 cookie та відсутності пароля у storage
не послаблено. Application runtime, протокол, cookie policies, workflow inventory,
timeouts і guards не змінено.

Typecheck exit0; Playwright collection19 tests/3files exit0. **Collection не запускає
браузер. Actual corrected browser acceptance — NOT_RUN.** Source manifest і
незалежне review мають бути прив’язані до наступного exact committed checkpoint.

## Докази та наступна залежність

[Actual a202 evidence](evidence/full-completion-20261108/federation-f3/actual-a202ddc8/)
і [browser correction](evidence/full-completion-20261108/federation-f3/browser-correction/)
зберігають початковий failure і окрему виправлену версію. Архів для передачі містить
text evidence subset: logs, JSON, TAP, manifests, error context і ERP JSON archive.
Browser screenshots/trace ZIP у нього не входять; provenance original browser ZIP
збережено контрольними сумами. Це не повна копія browser archive.

Після actual corrected aggregate та незалежного приймання починаються native F3
adapters і versioned own-user identity privacy export. Незалежне privacy plan review
додало обов’язкові acceptance: legacy input digest без автоматичного default поля,
ACCESS/PROFILE server boundaries, атомарна відмова без partial artifact та перевірка
версії також на saved download card. Native push залишається наступним source gap.
114 trace rows/42 IN_PROGRESS/72 AC NOT_RUN незмінні; загальний продукт NOT_READY.
Merge, production/DNS/live-data changes, paid providers і device/store publication не виконано.
