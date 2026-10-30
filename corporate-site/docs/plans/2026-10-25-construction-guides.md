# Продовження KNABA: практичні статті

Вихідне доручення: «виправ и продовжуй впровадження», продовження повного аудиту й наповнення будівельним клінінгом. Project KNABA, repo ziko1/knaba; база 60361c9385dec42c46b942fc093357f7d31b0a13, живий код 7e774c32863ad6b9f90a95288b5bd3495d941a51 повторно підтверджений 25.10.2026 12:30 UTC. Робоче дерево чисте. Інші відкриті PR перевірені; онбординг власника, FAQ Studio, auth та редизайн розвиваються окремо й тут не дублюються.

Підтверджена прогалина попереднього аудиту: адреса статті bauendreinigung-vorbereiten досі показує загальну legacy-заглушку. Поточний порадник має короткі корисні списки, але не має повноцінних окремих статей усіма мовами. Цей етап закриває саме редакційну й навігаційну прогалину.

| ID | Результат / приймання | Scope / виконавець | Доказ |
|---|---|---|---|
| GUIDE-01 | 4 корисні статті × DE/EN/UK/RU: підготовка, етапи, порівняння обсягу/витрат, здача; без вигаданих цін чи кваліфікацій | data/construction-guides.ts / content agent | Перевірка повноти, редакційний незалежний review |
| GUIDE-02 | Стаття із змістом, розділами, чеклістом, пов’язаними послугами та зрозумілим CTA; картки в пораднику | ConstructionGuide.astro, ConstructionInfo.astro / UI agent | Браузер 320/390/768/1440, клавіатура, 200% текст |
| GUIDE-03 | 16 доступних локалізованих URL; актуальна стара адреса відновлена; registry, Studio, sitemap/hreflang і тести узгоджені | routes, site-i18n, studio-pages, tests / root | Static verifier, contract tests, усі маршрути, Article schema |
| GUIDE-04 | Незалежний review; точний source/artifact; дозволений dev rollout з rollback | root + QA agent | SHA, тести, backup, live smoke; canonical memory/roadmap/backlog |
| GUIDE-05 | Виявлений review дефект: Article schema має відповідати H1/description після публікації у Studio; чужі schema, draft і некоректні дані не змінювати | vps/render-page.mjs, render-article.test.mjs / root | RED: stale headline; GREEN: actual built guide SSR, idempotency, corrupt JSON, wrong canonical and ambiguous heading guards |
| GUIDE-06 | Виявлений build дефект: preview→VSP залишав проміжне .prerender дерево з дублікатами CSS (65 393 B gzip замість 33 754 B) і перевищував CSS budget; очищати лише два generated output дерева перед збіркою | scripts/clean-build.mjs, package.json build script / root | RED: static verifier CSS budget; GREEN: sequential preview/VSP builds, no stale marker, immutable final artifact |

Без нових залежностей, БД/авторизації/платних сервісів. Нові статті server-rendered, без додаткової клієнтської бібліотеки. Старі неактуальні офісні маршрути залишаються чесними noindex-переходами. Клієнтських заявок не надсилати. Production knaba.de і main не змінювати. Публічний GitHub push залишається відхилений auto-review до прямого дозволу саме на публікацію коду; це не блокує дозволену розробку й оновлення kneba.vsp.rest.
