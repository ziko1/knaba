# KNABA DE: прийняття PVUX v1.0

- **Task ID:** `PVUX-KNABADE-001`.
- **Джерело:** вказівка власника застосувати єдиний Product Visual & UX Quality Gate до всіх поточних і майбутніх продуктів, 2026-10-15.
- **Статус:** `POLICY_CANDIDATE / PRODUCT_UI_UNKNOWN / RELEASE_BLOCKED`.
- **Repository:** `ziko1/knaba`; **observed source maturity:** `SPEC_ONLY`.
- **Спостережене:** README.md і KNABA_DE_MASTER_SPEC.md описують ТЗ та acceptance; виробничу реалізацію UI в основній гілці не підтверджено.
- **Read first:** KNABA_DE_MASTER_SPEC.md, docs/specification/KNABA_DE_Acceptance_V4.csv.
- **Project-specific PVUX profile:** [knaba-de.md](https://github.com/ziko1/ai-team-orchestrator/blob/72e0285809609e2aa557f836f011a452b6e01854/standards/pvux/v1.0/projects/knaba-de.md) (приватне джерело; доступ потрібен).

## Першочергові сценарії

Для майбутнього табелю: ролі, старт/пауза/кінець зміни, часові пояси, німецька локаль, звіти й помилки доступу.

## Критерії приймання

- [ ] Підтвердити фактичний Git SHA, продукт, власні документи й підтримувані платформи.
- [ ] Визначити екран/роль/стан/локаль/тему/viewport/device matrix, записати `PVUX-xxx` для кожного сценарію.
- [ ] Перевірити W3C WCAG 2.2 AA, адаптивність та функціональні сценарії на реальній реалізації.
- [ ] Затвердити baseline; виконати visual regression actual/diff в однаковому browser/OS/fonts; виключити персональні дані та секрети.
- [ ] Зібрати точні commit SHA, artifact hash, tested/deployed SHA, device/browser, test commands, PASS/FAIL/UNKNOWN та незалежне review.
- [ ] Окремо підтвердити живий HTTPS/пристрій, rollback і застосування до фактичного релізу. Доти `RELEASE_BLOCKED`.

Це **лише документування політики** в окремій Draft-гілці. Не свідчить про реалізацію UI, завершені QA або production-готовність. Після схвалення зберігати цей план разом з власними memory/roadmap/backlog; не дублювати й не замінювати їх.
