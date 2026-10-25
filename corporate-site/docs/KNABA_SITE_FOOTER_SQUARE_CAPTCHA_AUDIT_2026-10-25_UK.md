# KNABA — аудит UX/футера/послуг/Assistant (25.10.2026)

## Baseline та область перевірки
- Публічний сайт: https://kneba.vsp.rest; базовий live SHA e5142f245aac806f4748c1db55a87629c1009bc2 (PR #39).
- Перевірено спільний Astro Layout, шаблони home/catalog, CSS, 4 локалі DE/EN/UK/RU, Assistant Solid, Worker API, VPS Node adapter та Cloudflare account.
- Підтверджено: останній реліз PR #39 вже виправив білу підкладку логотипа у футері; PR #37 — накладання плаваючого Assistant на Impressum/Datenschutz. Ці патчі збережено.

## Реалізоване у candidate
1. Шоста CTA-картка в двох спільних шаблонах (home і каталог) на DE/EN/UK/RU. Перехід до наявного планувальника, не нова неузгоджена послуга.
2. Видима Cloudflare Turnstile після відкриття Assistant: токен у пам'яті, локалізовані повідомлення, обробка expiry/error/retry, посилання на контакт як fallback.
3. Серверний Siteverify із timeout 6 с, перевіркою hostname і strict success, лімітом токена. Часткова конфігурація fail-closed, public sitekey і server-only secret.
4. Виправлено проксі заголовка X-Knaba-Conversation, відсутній раніше в Node адаптері. Збережено CSRF/Host/role-гейти.
5. CSP дозволяє challenges.cloudflare.com у script/frame/connect тільки коли обидва ключі задані.

## Evidence
- Ізольований Node 24.22.1, Docker network none: astro/vue/svelte check 0 errors, 0 warnings (4 hints). Vitest 117/117, inquiry Node 8/8, VPS Node 14/14 PASS.
- Build 99 сторінок і verify:build PASS; 8 локалізованих перевірок на наявність 6 карток і планувальника PASS.
- Candidate build artifact SHA256 b1b32d7f95844b69b50888e3e431ddcd1448e1908014202be90126502fff922e. Field Web Vitals, фізичні Android/iOS й реальна Turnstile розв'язана людиною NOT_RUN.

## Backlog і ризики
- P0: прив'язати free Turnstile widget до kneba.vsp.rest, secret зберегти тільки root-only в VPS env, перевірити live CSP, реальний рендер, відмову без токена, штатну розмову із чинним токеном.
- P1: /readyz 503 доки власник KNABA не зареєстрований. Стару D1 базу ChatGPT Sites не перенесено і не звірено, owner/admin UAT невідоме. Не видаляти історичні записи.
- P1: VPS 95% заповнений; не чистити без підстав; backup перед релізом.
- P1: старі статичні SEO-гайди з офісного клінінгу залишаються у bundle, наприклад /ratgeber/bueroreinigung-checkliste/; для відомих старих URL послуги є 308. Затвердити перенесення/редиректи історичних editorial URLs.
- P2: GDPR і затверджені власником Datenschtuzhinweise з Turnstile, accessibility/screen reader, фізичні мобільні, 200% масштаб, field Web Vitals, CRM/ERP sync, реальні листи/дзвінки потребують окремої перевірки.

## Безпечний rollback
Повернути лише immutable code release symlink /srv/knaba/vps/current та recreate тільки web-сервіс з незмінною Compose. Не замінювати або відновлювати живу SQLite автоматично. Ні main merge, ні deployment на офіційний knaba.de.

- Інтегровано поверх actual live carousel parent fe78624f4263d5f410b9fa29a2329c8ac19a6a74 (не втрачено 8-слайдовий hero).


## Продовження: реальні mobile-state регресії та privacy-by-default
- Відтворено RED у live PR42: після відкриття/закриття KNABA Assistant його заміна .ka-launcher розширювалась до 189.67px і перекривала юридичні посилання на ширинах 360/390/480/600/760. Інша кнопка data-knaba-open була коректною.
- GREEN на candidate: кругла кнопка 54px у обох станах, 32/32 (4 мови × 8 ширин) після закриття, 32/32 початковий футер + 4 короткі сторінки; окремі 7 сценаріїв каруселі пройшли.
- P0 безпека: TURNSTILE_REQUIRED=1 у публічному Node VPS, при порожніх секретах /api/assistant/captcha відповідає 503 і не створює розмов; явно localTest лишається сумісним зі старими synthetic тестами.
- Privacy: до підтвердження прочитання Datenschutzhinweise зовнішній скрипт Turnstile не завантажується. Виконано 4 browser-тести з контрольованою підміною скрипту (не дійсне проходження CAPTCHA); оновлено DE/RU Datenschutzhinweise описом фактичної передачі даних до Cloudflare. Юридичний signoff власника все ще потрібен.
- Full-route audit live baseline: 98/98 HTML маршрутів у Chromium на 390px, без переповнення, несправних логотипів або перекритих legal-посилань; 7 сторінок із CSS font-size 200% не мали overflow. Browser test не замінює фізичний zoom/screen reader.
- Exact candidate Node24 QA: 126/126 Vitest; 8/8 inquiry; 14/14 VPS; 99 generated HTML і verify:build PASS; artifact digest SHA256 3bf9b20eaa22a60adca9843930c4aae82c2f6f42224da452598df9f610974ede.
- Unverified: власник не пройшов реальний Turnstile на телефоні, GDPR/AVV не затверджено, owner account не enrolled (/readyz 503), фізичний Android/iOS, повні screen-reader та field CWV — не доведено.


## Live development deployment — receipt
- Exact website runtime commit: 132145f94c53aabfa72645c3cc157d4c07c76ac2; old code 89b1ad4fb22f665863196040ea9e696119fb0690 retained for rollback. GitHub changes live in Draft PR #42; official knaba.de untouched.
- Before switching: immutable code build, consistent SQLite audit, no schema diff, fresh backup knaba-2026-10-25T04-14-26-764Z.sqlite SHA256 626d449bd4e148d6aca402a426ae87d275f04cefe0de908735e43b62a9212e55; DB integrity ok. Only web container recreated.
- After switching: HTTPS certificate verified (curl ssl_verify_result=0), Docker healthy, /, /uk, /uk/leistungen, privacy pages and /api/assistant/captcha HTTP200; anonymous CRM 401; /readyz expected 503; invalid/missing captcha POST 422.
- Live Chromium on domain: 98/98 HTML routes passed content/overflow/footer assertions; 32/32 locale/width assistant close scenarios and 32/32 initial footer scenarios + 4 synthetic short-page scenarios PASS. 7 carousel scenario flows PASS; 4 consent-gated workflows used a synthetic provider script and PASS.
- Real Cloudflare managed widget visually observed with cross-origin iframe and checkbox after privacy acknowledgment on mobile 390px; no script before acknowledged notice. Human CAPTCHA completion and actual owner/client messaging still NOT_RUN. A request to brunhild.challenges.cloudflare.com failed DNS resolution from isolated VPS Chromium; requires check from actual phone network before acceptance.
- Owner UAT, GDPR/AVV legal review, true device a11y/200% zoom, field CWV, D1 import/reconciliation and physical human completion remain independent blockers. VPS disk 96% / approx 7.8 GiB free; no unreviewed cleanup.
