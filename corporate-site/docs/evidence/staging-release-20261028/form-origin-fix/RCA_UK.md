# Native forms: Origin verification failed — 28.10.2026

## Відтворення

На runtime `9127b1d3424517ea061df2eea2ecc820a6bcfbde` у Work cloud Chrome: `/register/` → `/join/?lang=de` → синтетичні ім'я/email `.example.test`, partner intent, privacy acknowledgement → Submit. Реальна відповідь: **Origin verification failed**. Обліковий запис не створений. Окремий same-origin HTTP POST порожньої форми пройшов CSRF та отримав 422 validation; missing/cross-origin запити отримали 403. Форма звичайної заявки через fetch раніше успішно зберігала запис.

## Причина і мінімальна правка

Private HTML form responses мали `Referrer-Policy: no-referrer`. Стандартна поведінка браузера для native HTML POST за цієї політики — `Origin: null`. Суворий незмінний `csrfOK` відхиляє його. Джерело: [MDN Referrer-Policy — Effect on Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header), перевірено 28.10.2026; [Origin header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin).

Для HTML-форм встановлено `strict-origin`: join/review, register, owner/developer activation, invite/revoke-result, password та OIDC consent. Передається лише origin без path/query/fragment; downgrade referrer не надсилається. Точний Origin, Host, Fetch Metadata, no-store, noindex, CSP, frame protection, ролі та session rules не змінено. Немає fallback для missing/null Origin.

На OIDC redirects/callback responses збережено `no-referrer`; його також додано до issuer-mismatch error, щоб callback query не могла потрапити в Referer. Логін не мав цієї несправної політики: його попередня generic credential failure залишається окремим зовнішнім блокером.

## Перевірка

- Cloud-browser red відтворено на 9127b1d.
- Red tests: поточні HTML response headers не відповідають сумісній policy; `red.log/json`.
- Вся native VPS/SQLite suite після основної правки: **90/90 PASS**; `green.log/json`.
- Остаточна адресна регресія після доповнення issuer-error: **5/5 PASS**; `final-focused.log/json`.
- Assertions охоплюють strict-origin form headers, null/missing/cross-site rejection, invitation/account state, no-referrer на provider/callback redirects. Existing expiry/replay/role-isolation checks збережені.
- Незалежний вузький review підтвердив coverage, включно з HTML після revoke та OIDC consent override.
- **Потрібен final deploy і повторний native cloud submit; HTTP fixture сам по собі не є browser PASS.**
