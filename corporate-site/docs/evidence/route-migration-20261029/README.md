# Перенаправлення старих маршрутів KNABA — 29.10.2026

Статус: **ACCEPT_SCOPED_TESTING_ROUTES**. Публічний сайт замовника ще не переключено.

## Виправлення та джерело

Source571823a5a04969f391dcc54babcffc2a416ae525 усуває прив'язку перенаправлення застарілих office-cleaning URL до development hostname та зберігає query string. Host/TLS, авторизація, схема й дані не змінені. Регресія спочатку відтворила HTTP200 замість308 на knaba.de, потім пройшла для чотирьох дозволених origins, чотирьох чинних legacy-локалей і обох slash-форм. PL/LT aliases не вигадувалися.

## Артефакт і фактична перевірка

Testing artifact21c88a4148b2191d56d5b3ad9e9cc6929730535f33850cca87d3b74b652d9e23 активовано17:30:12UTC через незмінений knabactl після перевіреного SQLite backup. З411файлів змінено тільки vps/server.mjs і його тест; інші409 та всі24schema files byte-identical. База testing збережена.

Фінальний VPS suite121/121 і focused test на committed source1/1 пройшли. Root28/28 — попередній прогін на незачеплених входах, не новий після останнього test-only уточнення. Новий build/browser не запускався: відповідні байти лишилися тими самими.

Після deployment: усі160HTML-шляхів прийняті (158точних HTML із metadata та2навмисні308),126assets byte-identical,213linked paths доступні,16legacy routes зберігають query і повертають GET/HEAD308 таPOST405. Host/TLS421, unknown404, private API401/403 і три Studio queries200 підтверджені. Результат і точні hashes — [acceptance.json](acceptance.json).

## Межі готовності

Production pointer/config не змінені. Незалежний зовнішній GET о17:32:16UTC все ще бачив старий One.com сайт на knaba.de і www; приватний kneba.vsp.rest лишився за Cloudflare Access. Customer USER API token відсутній, testing owner enrollment, Access/Turnstile та реальне customer acceptance ще відкриті. Це не повна готовність авторизованих чи provider сценаріїв.

Підготовлений шлях доступу: користувач вводить customer API token через sudo /usr/local/sbin/knaba-cloudflare setup у фізичному терміналі KNABA або SSH як knaba. Токен не передається в чаті. Після доступу потрібні інвентаризація customer account, конфігурація тунелю/Access/Turnstile, точне погоджене production promotion і web DNS cutover. Чинну пошту зберегти.

Код і docs збережені в приватній робочій гілці; public push/main merge не виконувались. Private source bundle і receipt зберігаються на фізичному сервері; off-site backup цим кроком не підтверджений.
