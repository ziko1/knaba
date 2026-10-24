# KNABA Assistant — архітектура та acceptance

Стан: isolated feature branch. Не merged, не deployed. Зовнішній AI-провайдер та автоматичні email/WhatsApp push ще не активовані.

- Корпоративний Astro Layout містить компактний чат DE/EN/UK/RU з голосовими API браузера (опційно, попередження щодо передачі аудіо).
- Worker API + D1 зберігає діалоги, повідомлення і тексти погодження. Клієнт має 256-бітний секрет токена у sessionStorage, сервер зберігає SHA256 секрету.
- Owner inbox за маршрутом /postfach/ і /ru/postfach/, server-side allow на роль owner (через Sites auth та OWNER_EMAIL); без автентифікації історія недоступна.
- Підтримано server-side idempotency для надсилань і пропозицій, обмеження полів/тіла запиту, rate limit для IP від Cloudflare і переходи статусів.
- Міграція drizzle/0001_lazy_angel.sql додає нові таблиці; не змінює існуючі запити, профілі і ролі. Перед застосуванням необхідна база D1 з актуальною схемою і можливість rollback.
- Режим автоматичних відповідей засновано на фіксованих перевірених категоріях послуг, без вигаданих цін і дат. Генеративну AI-модель можна підключати тільки після перевірки авторизації, лімітів, дозволів на дані і витрат.
- Немає автоматичного юридично зобов'язувального договору, замовлення чи оплати: погодження клієнта є записом про прийняття тексту.
- Політика privacy DE/RU доповнена описом D1, sessionStorage, запису діалогів та голосового вводу. Конкретні терміни зберігання/видалення чекають затвердження оператором.
- Перевірки: npm ci, npm test, npm run check, npm run build, npm run verify:build на Node24. Мета тестів: scoped auth, isolation, replay, handoff, proposal decisions, no unexpected orders.
- Недоступні: Cloud Browser, Opera connector (Browser not connected). Після окремого дозволеного preview deploy потрібні live browser UAT, owner sign-in, guest-owner-guest conversation, mobile/a11y, D1 міграція та actual notification delivery.
- Зважати: sessionStorage тільки на поточну сесію браузера; закриття вкладки втрачає гостьовий токен. Без сервісу email/WhatsApp власник бачить нові діалоги лише через власний кабінет із polling.
