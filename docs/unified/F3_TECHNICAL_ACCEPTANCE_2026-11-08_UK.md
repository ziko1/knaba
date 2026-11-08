# KNABA DE — прийнятий технічний gate F3

## Точний перевірений кандидат

Серверний і вебконтур F3 прийнято в межах технічного контракту на коміті
`6a395bb73501455371a0e281debf81a6c18c6329`, Git tree
`e81d6947e96038174d9ec8e2741250713b804396`.
[Обов’язковий CI run42507639872](https://github.com/ziko1/knaba/actions/runs/42507639872)
завершив усі чотири required jobs з SUCCESS.
[Draft PR129](https://github.com/ziko1/knaba/pull/129) залишається окремим кандидатом.

Незалежне рішення `ACCEPT_F3_TECHNICAL_AGGREGATE_SCOPED` має SHA-256
`a80ae519a224c36d1f272e88841f19d46c5f606c310725643abff46c64ace8f8`.
Повні поля джерела, метод перевірки й межі наведені в
[independent-acceptance.json](evidence/full-completion-20261108/federation-f3/actual-6a395bb/independent-acceptance.json).
Наступний коміт зі змінами native/privacy потребує власних перевірок.

## Фактичні результати

| Контур | Результат на 6a395bb |
|---|---|
| Root source/policy | 29 PASS |
| Corporate site | 900 Vitest + 92 Node + 354 VPS PASS; check/build/verify PASS |
| ERP | 3264/3264 у 148 файлах, 0 FAIL/PENDING |
| Обов’язкові PostgreSQL підмножини ERP | F3: 18; F2: 24; входять до 3264 |
| Реальна пара VPS SQLite → підписаний ERP HTTP → PostgreSQL | 26/26, включно з 8 F3 та 7 F2 |
| Відображений ERP UI з явно синтетичними HTTP fixtures | 19/19, з них 10 F3; 0 SKIP/retry/flaky |
| Site browser suites | Ролі 111, мови 32, public viewport cases 24 PASS |
| Site gzip budgets | JS 222640/225280 B; CSS 40832/40960 B |

Це окремі набори й підмножини, їх не додають до одного штучного total.
Чотири Node HTTPS helper cases входять до ERP total. Польові Web Vitals,
фізичні пристрої та фактичне навантаження не перевірялись цим run.

Перший WEB browser case тепер справді проходить source303, приймання
повернення loopback HTTPS сервером, Lax flow cookie без старого Strict ERP
cookie, явне підтвердження акаунтів/MFA, отримання нової сесії та відкриття
консолі. Джерельні й API відповіді цього браузерного сценарію залишаються
явними fixtures. Окрема runtime-пара перевіряє справжні SQLite/HTTP/PostgreSQL.
Це не сертифікація production TLS, стороннього identity provider або native
app-link ownership.

## Прив’язка доказів до джерела

CI manifest містить exact source, clean checkout і незмінні input digests
до/після прогону. Три явні protocol/entry inputs звірені з Git blobs.
Чотири групи зібраних файлів перевіряє чинний CI wrapper. Їхні повні dist
каталоги не включені в отриманий архів, тому незалежний локальний повторний
hash цих dist bytes не заявляється.

| Архів | SHA-256 |
|---|---|
| ERP reporter archive | `77a70191dd1dfd5f70f811a72d7a99966b0c559af846060dedd14d124590a5f5` |
| Browser/pair archive | `cc46bcaa9a2a1c441196a51bebc9ad91cf7a73a9a115c6d0294bcf20ed73196c` |
| Build manifest | `0e7fe7ebfc7575237df6a995c2382da8d21495eb2b950b1356f76ae58cb07e5b` |

API source/digest, розміри, ZIP CRC, унікальні безпечні paths і bounded
extraction перевірені. [Git evidence subset](evidence/full-completion-20261108/federation-f3/actual-6a395bb/README.md)
містить незмінені короткі JSON receipts та inventory. Він не містить
зображень, HTML/trace archives або native binaries.
Окремий текстовий [пакет перевірки](https://chatgpt.com/library?file_id=libfile_3aefc2d191b08191b9a844eec4a29f99&account_id=personal)
має 305645 B, 33 ZIP entries і SHA-256
`351b124d75214ec1cffad45efc20242e8dd3e7da7e57f52203e4b3a240af7436`.

## Native та історія виправлень

Android run42507639781 SUCCESS. iOS PR run42507639722 SKIPPED за чинною
політикою. Усі 121 унікальні native inputs незмінні від прийнятого af6f84d;
повторні native архіви не завантажувалися. Попередні 72 Android cases,
145 XCTest і simulator install/launch залишаються доказами af6f84d.
На 6a395bb не приписується новий iOS артефакт, підпис або перевірка оновлення.

Історичні af6 dispatcher failure, a202 locator/site fixture failure та
77b64956 redirect DNS failure збережено. Вони пояснюють виправлення й не
переписані заднім числом у PASS. 6a395bb закриває останній технічний F3 gate
окремим фактичним прогоном після незалежного review.

## Наступна дозволена робота та межі

Технічну залежність для native F3 і privacy v2 відкрито. Android/iOS adapters
мають окремо довести TEST-only системний браузер, PKCE/state, точний callback,
одноразовий token exchange, ізольоване підтвердження кандидата та атомарне
прийняття сесії. Privacy v2 має пройти version/legal/category/tenant checks,
legacy receipt/bytes compatibility, обмеження SQL projection та UI races.
Native remote push залишається наступним відомим source gap.

Whole product — **NOT_READY**. Канонічні 72 compound AC, 475 V3 criteria й
114 trace rows не отримують автоматичного PASS. Provider/device/owner UAT,
restore/load, legal/privacy classification, production app-link/signing/store
і live release gates залишаються окремими. Поточне прийняття не надає нових
дозволів на main merge, production/DNS/live-data зміни або платні сервіси.
Для локального source rollback збережено попередні commit/worktree/evidence;
цей gate не застосовує міграцій чи rollback до живої системи.
