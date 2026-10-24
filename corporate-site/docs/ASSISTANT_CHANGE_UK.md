# KN-ASSIST-01 — помічник без входу

Доручення 24.10.2026: «просто ии помошник без chatgpt», скриншот /konto/.

План: замінити публічний шлях входу на KnaBa Assistent; залишити захищений портал на /portal/; перевірити відповіді, мовні стани, мобільний UI і чинні серверні права.

| ID | Критерій | Доказ / стан |
| --- | --- | --- |
| A01 | /konto/ і основна навігація відкривають помічника без акаунта, сесії та D1 | IMPLEMENTED; unit/build/review PASS; browser NOT_RUN |
| A02 | Відповіді про перевірені послуги, регіон, контакти й індивідуальний розрахунок; зрозуміле передавання у форму заявки | IMPLEMENTED; unit/build/review PASS; browser NOT_RUN |
| A03 | DE/EN/UK/RU, клавіатура, мобільна ширина; текст чату не зберігається і не надсилається | IMPLEMENTED; unit/build/review PASS; browser NOT_RUN |
| A04 | Права порталу збережено; жодного доступу до приватних даних через помічник | IMPLEMENTED; unit/build/review PASS; browser NOT_RUN |
| A05 | Повноцінна генеративна AI-модель | NOT_CONFIGURED: у Sites є лише OWNER_EMAIL; не активувати платні API або вигадувати підключення |

Реалізація: /root. Незалежний reviewer: /root/review_assistant. Initial Sites base: a91edbcf989fe342cf342fa8741f0eec8a5b5488; integrated onto fresh Russian localization e708755aabd5a3059c3fa05fd14491cc4e972785. Зовнішні платні API: бюджет EUR0. Жодних нових провайдерів. Помічник явно повідомляє, що відповідає за інформацією сайту; це не доказ готової AI-моделі.

Публікація дозволена для чинного тимчасового kneba.vsp.rest за збереженим дорученням revision 2. Офіційний knaba.de, merge та зміни даних не входять до scope. Відкат — попередня Sites-версія; міграцій БД немає.

## Перевірка

Runtime SHA: `0bcbfc7149d2d6179b925da8d570f7ecbab649f1`. 63 Vitest + 8 inquiry tests PASS, Astro/Vue/Svelte check 0 errors, build and 51-page link/metadata verifier PASS. Independent reviewer `/root/review_assistant` read integrated code and logs; PASS within information-assistant scope. Public UI is implemented but browser NOT_RUN: local preview first returned connection refused; next attempt was explicitly blocked by browser URL security policy, no bypass attempted. Physical device, screen reader, global PQ-B human UAT/field impact NOT_RUN. AI provider NOT_CONFIGURED.

Preserved concurrent Russian localization. Public entry `/konto/` and `/ru/konto/`; primary `/assistent/` and `/ru/assistent/`; protected portal `/portal/` and `/ru/portal/` with corrected native auth return paths. PublicAssistant naming avoids collisions with a separate unfinished R4 assistant implementation discovered in `/workspace/sites/knaba-unified-r4`; that worktree was not edited or committed. Future R4 integration must retain this user correction and localized routes.

## Live check і виправлення selector

Sites version 4 published successfully, source 1395829500e2c9e87b1bf0c6c053858155e4dfe2; deployment appgdep_6adc4c9a4c3c8191b89057618b554cb3. Direct browser on https://kneba.vsp.rest/ru/konto/ confirmed no login, Russian price answer, office service and /ru/kontakt/?leistung=bueroreinigung handoff. Public-site browser succeeded independently; earlier local-preview policy limitation remains recorded. Browser found initial selected language mismatch (Russian copy with Deutsch selection). Fixed explicit selected options; final runtime SHA `0d281284c65aabad579a4aff54ab766b0c3c0a74`; typecheck/build/51-page verifier repeated PASS. Unit suite still applicable unchanged (63+8). Final selector live readback follows publication. Physical mobile device and 320px viewport not run.
