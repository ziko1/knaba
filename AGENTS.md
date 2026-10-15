# KNABA DE — додаткові правила UI/UX (PVUX v1.0)

Цей файл не замінює продуктову специфікацію, правила безпеки, memory, roadmap, backlog, budget або інші AGENTS.md у підкаталогах. **Не змішувати дані з AVENQO чи іншими продуктами.**

Перед зміною UI прочитати власні джерела проєкту й [план PVUX](docs/quality/PVUX_ADOPTION_UK.md). Власник застосовує один канонічний стандарт із 91 правила: приватний `ziko1/ai-team-orchestrator`, pinned Git commit `72e0285809609e2aa557f836f011a452b6e01854`, `standards/pvux/v1.0/PRODUCTION_VISUAL_UX_QUALITY_GATE_UK.md`. Доступ до приватного джерела перевіряти; без доступу не вдавати, що прочитано всі 91 правило.

Мінімальні самодостатні вимоги: W3C WCAG 2.2 AA, семантичний UI, видимий focus, keyboard і screen-reader navigation; responsive за реальним контентом без горизонтального переповнення від 320 CSS px (для web); достатній контраст; i18n; loading/empty/error/offline/denied; progressive enhancement і graceful degradation; дизайн-токени, затверджені screenshots та functional/visual regressions. Для Web Core Web Vitals — p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Ціль локальної видимої реакції ≤100ms p95 — лише вимірювана внутрішня ціль. Native платформи — власні Android/iOS стандарти.

**Релізне правило:** виміряти на точному SHA/артефакті та фактично розгорнутій версії, відрізняти local, emulator, device й production. Кожна перевірка має PASS/FAIL/UNKNOWN і доказ. UNKNOWN/P0/P1 для критичних потоків блокують випуск. Ніяких mock/build/CI як заміни live. Ніяких paid CI, merge, deploy, publish, DNS або руйнівних змін без дозволу.
