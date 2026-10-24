# KnaBa: повний аудит гілок і PR
Дата зрізу: 2026-10-24. Джерело: GitHub ziko1/knaba, метадані 14 гілок і PR #1–#10, порівняння GitHub комітів. Усі 10 PR — OPEN, DRAFT, MERGED=false. У головній гілці `main` — насамперед документація специфікації, НЕ інтегрований ERP чи корпоративний runtime.

| Гілка | HEAD (GitHub) | Зміст / залежність |
|---|---|---|
| main | ff748a2e5731e973883344ed28f3e82cf8a3bc06 | Основна документація, спільний ancestor; не реліз застосунку |
| knaba-staging | 366c30b137951749bac7ec22ad35278300f93a4a | PR #1: первинний V3/V4 runtime, 426 файлів PR |
| codex/knaba-product-completion | 83d0d18e2310d2e7b1642cd38d1af992cc086484 | PR #2 на knaba-staging; accountant export, session/chat race, ціна; НЕ частина пізнішого V4-ланцюга автоматично |
| codex/knaba-responsive-20261009 | c083a647d5c842ef71cdd42185b8bb3fc127fa75 | PR #3 на PR #2; альтернативний responsive для product-completion |
| codex/knaba-responsive-v4-20261009 | 826aef9c344b596584552439de32daa8f03e72c3 | PR #4 на knaba-staging; responsive для V4 |
| codex/knaba-v4-sql-recovery-20261011 | 1e7fbc04bc5b75d8044204f94da987d96c3271ee | PR #5 на PR #4; SQL + AI authority recovery |
| codex/knaba-v4-recovery-20261011 | c931fbe60a50d3a6193480cc9742d99fc6f3b714 | PR #6 на PR #5; replay, leases, worker safety |
| ci/balance-github-codemagic-20261011 | b2c1d8f2926a9ebe4ea443e1865e6b57f093defb | PR #7 на PR #6; CI/event-policy та manual iOS |
| deploy/knaba-vps-20261013 | 35b687c400d423966742bac9f1e503032794dbf1 | На 6 комітів попереду PR #6 за GitHub compare; інфра, виправлення, тести, backup; НЕ доказ live |
| docs/pvux-adoption-20261015 | db314e0224b119dce8108a9d9a89b2330924941c | PR #8 на main, лише правила PVUX |
| docs/ups100-adoption-20261015 | 5f3e39db8b2a2ef024ce025e605feeaea9b2e712 | Окрема документаційна гілка; окремий diff/review обов'язковий |
| codex/knaba-corporate-astro-20261024 | 4a4d0d3baec0cb28a0dc79fd905549b51ee245cc | PR #9 на main: Astro сайт, D1 leads, owner-approved portal |
| codex/knaba-russian-20261024 | 412c0c8cfbec69781359be3da44bfa9c2747ab64 | PR #10 на PR #9: 22 RU routes / інтерфейси |
| codex/knaba-public-assistant-20261024 | db6c514c52d038b6491aa101bca6cd5fa76cc102 | Прямий нащадок PR #10 (+1 commit); публічний інформаційний помічник; окремого PR на час зрізу немає |

## Розділити три ланцюги, не merge все одразу
- **ERP/V4**: #1 → #4 → #5 → #6 → #7 → deploy/* (конкретний ancestry підтверджувати окремо перед cherry-pick). #2 → #3 — паралельна гілка з додатковим V3 функціоналом. Визначати реальну відсутню поведінку за contract/test, а не за назвою PR; два UI-патчі не дублювати.
- **Public/CRM**: #9 → #10 → codex/knaba-public-assistant-20261024. Compare RU→assistant: 1 коміт вперед, 0 позаду. У ньому збережені RU сторінки; приватний портал винесений у /portal/.
- **Governance**: #8 та docs/ups100: перевірка змісту й зв'язку з канонічними правилами, не перезаписувати AGENTS.md та історію доказів ERP.

## Докази ≠ готовність
- У PR #6 задокументовано PASS 2242/2242 unit/integration і 421 real PostgreSQL, 27 browser, 66 Android Java, 19 iOS Simulator XCTest **на конкретному executable SHA a10e709...**, а не на об'єднаному продукті.
- PR #7 документує 19 iOS XCTest на окремому source; GitHub jobs були BLOCKED_ENVIRONMENT, раніше release FAILED; це різні результати.
- PR #9 має 44 локальні тести та D1 live inquiry receipt, PR #10 — 50 Vitest +8 Node, а гілка public-assistant — 63 Vitest +8 Node за її власним журналом. Ці результати не доводять наскрізну інтеграцію, повний UAT, фізичні телефони або офіційний домен.
- На 2026-10-24 GET/HEAD https://kneba.vsp.rest/ дає HTTP 200 з VPS; це доступність URL, не перевірка сценаріїв і не production acceptance. Live API inbox/notifications/ERP bridge НЕ перевірені.
- Статуси WHOLE PRODUCT, 72 V4 і 475 V3 acceptance — NOT_READY / не перенесені в PASS. Не агрегувати перехресні результати в один «PASS».

## Застереження
`KNABA_DE_TARGET_SPEC.md` і V4 `AGENTS.md` на ERP-гілках є контрактами ERP. `corporate-site/PROJECT_MEMORY.md` і `corporate-site/ROADMAP.md` — чинні локальні документи сайту. Цей аудит не перезаписує їх. Перед інтеграцією перевіряти актуальний diff/HEAD усіх гілок та незакомічену R4 роботу поза GitHub (її фактичний статус зараз UNKNOWN). Не змішувати KnaBa з AVENQO.
