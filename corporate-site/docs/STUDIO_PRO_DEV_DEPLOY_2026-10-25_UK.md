# KNABA Studio Pro — підтверджене розгортання тестового VPS, 25.10.2026

**Середовище:** https://kneba.vsp.rest/studio/ (VSP developer host); **не** офіційний knaba.de.

## Exact SHA та безпечний rollback
- Виконуваний GitHub source SHA: `24dd7fc826ff50c3fab9273ce9e654fbee2095b6` (PR #49, base PR #48).
- Встановлений незмінний реліз: `/srv/knaba/vps/releases/24dd7fc826ff50c3fab9273ce9e654fbee2095b6`.
- Попередній цілісний реліз збережений: `/srv/knaba/vps/releases/77c2a96a870d1ba0e5a0bf766dee1aca541ada8a`.
- Build verifier client artifact SHA256 `80e1242106ebf75ab5dd608da099d896e363661c3fcef9aa1f243a2fa974b511`; Worker `9bb4c48e92056c02e6fd286de29e5532bb0d6323dc6fd2ff7b25286392a32085`; VPS renderer `d1000f1cae7a78c35579b6c568d0ea040ad77a9473f97193d18941318e41ebeb`.
- SQLite online backup `/var/lib/knaba/backups/knaba-2026-10-25T04-41-48-638Z.sqlite`, SHA256 `9cd3cb3288d2e9e7dba463d38267a325ed20377e150cc3915ad9ea2016d38ab0`, 217088 B, 5 міграцій. Не видаляти, не мігрувати й не обнуляти поточні записи.
- Docker Compose/DNS/TLS не змінені; пересоздано тільки `knaba-vps-internal` з попередньо перевіреним Node24 образoм.

## Зроблено
- Відредаговано чинний owner-only Studio, а не створено паралельну CMS: візуальні текст/посилання/малюнок та фон/розмір шрифту/відступи, JSON ручний режим з явним Apply і live-preview, Undo/Redo, 68 public routes, локальна медіабібліотека.
- Приватний API статусу AI (лише owner, без ключів). Зовнішній провайдер **залишається відключеним**, гроші не витрачено.
- Старе PUBLISH, revision/restore, CRM, Turnstile, 4 реальні мови + 95 planned targets, верстка при 200% масштабі й карусель збережені.

## Fresh exact-code verification
- Перш ніж перейти на реліз, виконано Node24.22.1 ізольовано без зовнішнього трафіку: Astro/Vue/Svelte 0 errors/warnings, Vitest 137/137, inquiry 8/8, VPS Node 16/16, 99 HTML файлів (98 маршрутизованих index.html + 404.html), build static verifier PASS.
- Synthetic HTTPS Chromium owner flow PASS: авторизована сесія, live selection/edit, undo, ручний JSON, SSR публікація, перевірка стану AI та responsive; без реальних credentials/client records.
- Після живого оновлення: контейнер healthy; 98 URL перевірено, 96 × HTTP200 + 2 × intended HTTP308, непередбачених помилок 0; невідомий шлях канонізується 303 і повертає 404; Studio/CRM/portal/postfach/media/languages/healthz HTTP200; приватні owner Studio й AI статус анонімним 401.
- Довірений TLS chain Verify return code 0; Let's Encrypt SAN kneba.vsp.rest до 22.01.2027; 7-денний HSTS, CSP, noindex; SQLite `PRAGMA integrity_check=ok`, п'ять міграцій без змін.

## Блокери до повністю готового продукту
- `GET /readyz = 503` — справжній owner account ще не ініціалізовано. Потрібні підтверджена ідентичність власника та захищене stdin password provisioning; **не можна вгадувати email або створювати акаунт за публічним контактом**.
- Диск VPS ~96% використання (~9.1 GiB вільно), conservative `cutoverAllowed=false`: офіційний домен, масова міграція чи великий upload заблоковані.
- Незалежний security review, реальні фізичні Android/PC тестування, screen reader + keyboard для власника, old provider D1 export/reconcile та повне legal/GDPR UAT — NOT_RUN.
- Drag/drop блоків, створення/видалення сторінок, глобальне редагування меню/футера, довільний HTML/CSS source, безпечне завантаження зображень, повністю активний AI workflow — **не реалізовані**. Не називати цей інкремент «повною CMS 100%».

## Зворотний перехід (за підтвердженої регресії)
1. Перевірити, що чинний реліз усе ще `24dd7fc…` (щоб не відкочувати чужі оновлення).
2. Атомарно переставити `/srv/knaba/vps/current` symlink на незмінний `77c2a96a…`.
3. Перезапустити **лише** службу `web` у чинному Compose `/srv/knaba/vps/docker-compose.yml` та повторно перевірити HTTPS/health/права.
4. Схему SQLite не відкочувати/видаляти, резервну копію зберегти. Жодних змін в інших проєктах чи офіційному knaba.de.
