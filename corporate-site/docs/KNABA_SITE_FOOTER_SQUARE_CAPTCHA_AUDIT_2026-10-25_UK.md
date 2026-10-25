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
