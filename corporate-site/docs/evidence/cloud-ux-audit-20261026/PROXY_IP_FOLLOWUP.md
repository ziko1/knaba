# P1: окремі visitor limits за Traefik — follow-up

Дата: 2026-10-26. **OPEN: runtime не виправлено.** Цей документ описує наступну зміну, а не підтверджує її реалізацію чи deployment.

## Підтверджена проблема

`vps/server.mjs` передає `req.socket.remoteAddress` у `createLogin(...clientKey)` та у внутрішній `cf-connecting-ip` для Worker. За Traefik це адреса proxy, тому незалежні відвідувачі ділять IP-квоти: 20 заявок/год, 20 відгуків/год і 10 нових чатів/год; login має 5 спроб/15 хв для комбінації email + IP. Власні email/user/conversation обмеження залишаються окремими.

Read-only перевірка release-аудитора побачила `coolify-proxy` (`traefik:v3.7`) з IP `10.0.1.6`, застосунок `10.0.1.20`, shared network `coolify`, upstream port 8080. У переглянутих аргументах/top-level config не було `forwardedHeaders.insecure`, `trustedIPs` чи `notAppendXForwardedFor`. **IP — спостереження, не стабільний контракт:** `IPAMConfig=null`; незмінність адреси та повний upstream/CDN chain не доведені. Локальний DNS lookup 2026-10-26 повернув `ECONNREFUSED`, тому не є доказом актуальних DNS-записів.

## Мінімальний контракт і код

1. Додати server-only `KNABA_TRUSTED_PROXY_IPS`: невеликий allowlist **точних IP**. Порожній список за замовчуванням; жодних implicit loopback/private ranges, CIDR, hostname, wildcard чи hardcoded `10.0.1.6`. Невалідну конфігурацію відхиляти до відкриття DB.
2. У новому `vps/client-ip.mjs` нормалізувати socket peer та IP-записи: строгий `node:net.isIP`, канонічний IPv6, однакова ідентичність IPv4 та IPv4-mapped IPv6. Не приймати zone IDs, порт, brackets, `unknown` або quoted tokens у XFF. Окремі тести потрібні для нормалізації: `isIP` сам по собі її не виконує.
3. Довіряти `X-Forwarded-For` лише якщо **socket peer** входить у allowlist. Обмежити заголовок, наприклад 1024 bytes/16 hops. Йти справа наліво через лише явно довірені proxy до першого недовіреного IP; усе лівіше ігнорувати. Невідомий peer, відсутній/надмірний заголовок, помилковий token на довіреному суфіксі або відсутність визначеного клієнта → conservative socket key. Це fail-closed щодо довіри заголовкам; не відключати throttling і не передавати порожній IP.
4. Обчислювати `clientIp` один раз у `vps/server.mjs`; використовувати його і для login, і для внутрішнього Worker header. Вхідні `cf-connecting-ip`, `Forwarded`, `X-Real-IP`, `oai-*` не стають джерелами довіри; `X-Forwarded-Proto: https` не доводить довірений peer. Auth, schema, квоти й CAPTCHA не змінювати.
5. Scope: нові `vps/client-ip.mjs` / `vps/client-ip.test.mjs`, вузький diff `vps/server.mjs` / `vps/server.test.mjs`, deployment/config документація. Env активується окремо на перевіреному runtime; не змінювати shared Traefik, DNS або мережу автоматично.

## Acceptance перед закриттям P1

- [ ] Unit: empty allowlist; unknown peer + forged XFF/CF header; exact trusted peer; spoofed left prefix; перший недовірений проміжний hop; IPv4/mapped IPv6/canonical IPv6; malformed/oversized/missing XFF; invalid config. Зміна attacker-controlled prefix не змінює bucket.
- [ ] Disposable HTTP + SQLite integration: дві адреси через довірений test proxy мають різні durable buckets; одна адреса досягає чинного ліміту, друга продовжує працювати; direct untrusted socket не обходить його через headers. Перевірити login і реальний compiled Worker, зберегти existing auth/spoofing regressions. Без production submissions чи live DB writes.
- [ ] На фактичному ingress перевірити image identity, socket peer, ефективні forwarding settings і upstream chain; довести, що proxy додає справжній remote address справа. Контрольні запити з підробленими headers не змінюють визначеного клієнта. Використати ізольовану діагностику; не додавати public IP-echo endpoint.
- [ ] Встановити операційний контракт адреси: гарантоване закріплення або контрольована повторна верифікація/оновлення allowlist при кожній зміні proxy/network. Старий IP може перейти іншому контейнеру — його не можна лишати довіреним. Не вирішувати drift довірою до всього subnet. Невідповідність блокує acceptance; fallback зберігає захист, але shared limit може повернутися.
- [ ] Якщо є upstream CDN/LB, довести його provenance окремо. Без цього адреса першого недовіреного hop безпечніша, але може лишитися спільною для багатьох клієнтів. Лише після integration + runtime evidence позначити P1 CLOSED і зберегти точні source/artifact/config identities та rollback.

Висновок: bounded fix можна реалізувати й протестувати без broad trust або послаблення квот. **Повне live-виправлення потребує перевіреного ingress та стабільного операційного контракту IP; поточного спостереження `10.0.1.6` недостатньо.**

Офіційне джерело для контракту forwarding: [Traefik EntryPoints](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/) (`trustedIPs`, `insecure`, append behavior). Документація не замінює перевірку встановленого image/config.
