# KNABA — користувацький аудит і тестове приймання 26.10.2026

Доручення: перевірити весь `kneba.vsp.rest` як клієнт, усі сторінки й основні сценарії, виправити недоліки, зберегти роботу в `ziko1/knaba` і перевірити на чинному тестовому сервері. Офіційний `knaba.de`, production merge, платні провайдери та реальні повідомлення клієнтам не входять у цей тестовий випуск.

База: `2164b9505f824486594b2633a05f5fd91aee8c04`; це фактичний target `/srv/knaba/vps/current` під час аудиту. Старі повідомлення про відсутню галерею/неправильні номери вже не відображають live. Гілка: `fix/knaba-user-acceptance-20261026`.

| ID | Вимога й критерій | Власник | Стан / доказ |
|---|---|---|---|
| UA01 | Інвентар усіх доступних маршрутів, посилання, мови, 404, images | root | IN_PROGRESS |
| UA02 | Клієнт може вибрати кожну з 8 будівельних послуг і перевірити точну тему заявки; CRM enum збережено | root | Підтверджено дефект: форма live має лише Baureinigung |
| UA03 | 5 основних послуг планувальника синхронізують єдину точну тему й перехід до заявки | root | Підтверджено дефект: каталог показує одну загальну послугу |
| UA04 | Помічник: фокус при відкритті, Escape, повернення фокусу, припинення мікрофона при закритті | ux_research | IN_PROGRESS |
| UA05 | Послідовність блоків головної: послуги → додаткові роботи → процес → компанія → партнери → відгуки → FAQ → контакт | root | Вибіркове повторне використання PR84; без заміни новіших змін |
| UA06 | Exact-source check/test/build/i18n/VPS + незалежний review; desktop/mobile інтеракції | code_audit / root | IN_PROGRESS |
| UA07 | Тестове розгортання з перевіркою поточної версії, збереженням даних і rollback; повторна live перевірка | root | PENDING UA06 |
| UA08 | Готовність усього проєкту: чесний список ERP/provider/owner/device/rights gaps | code_audit / root | IN_PROGRESS; не прирівнювати сайт до готового ERP/WhatsApp |

Команда: Codex runtime `/root` — інтеграція/браузер/реліз; `/root/ux_research` — офіційні джерела й вузьке виправлення помічника; `/root/code_audit` — незалежний аудит і review. Нові платні API/CI: EUR 0 дозволених витрат; фактична вартість runtime невідома.

Джерела перевірки: https://knaba.de/ (факти компанії), https://www.w3.org/WAI/tutorials/forms/notifications/ (помилки й підтвердження форми), https://www.w3.org/WAI/WCAG22/Understanding/reflow.html (320 CSS px), https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites (локалізовані URL). Це критерії, а не сертифікація WCAG чи юридичне приймання.

Opera Connector: UNAVAILABLE, Browser not connected. Cloud Chromium відкрив чинний сайт без policy error. Автоматичні UI перевірки й людське UAT звітуються окремо.
