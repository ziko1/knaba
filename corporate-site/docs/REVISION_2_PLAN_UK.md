# KnaBa — revision 2: тимчасова кольорова версія

Дата: 24.10.2026 (Europe/Berlin). Source: user request in current conversation.
Base: 5ca7dbfdb11603151b48fd78a9524927b57b99a6. Project: ziko1/knaba/corporate-site.

Користувач просить сучасніший, більш кольоровий і функціональний сайт, повну інтеграцію SolidJS+Vue+Svelte / SvelteKit+Tailwind CSS v4+Pinia+TypeScript+Vitest+Zustand+TanStack Query+Vite/Turbopack, тимчасову публікацію на kneba.vsp.rest, видиму позначку та можливість майбутнього перенесення/видалення.

## Архітектурне рішення до реалізації

Astro залишається єдиним маршрутизатором статичних сторінок. SolidJS — форма запиту. Vue 3 + Pinia — підбір послуги за типом об’єкта. Svelte 5 — план/перелік робіт. Zustand vanilla — невеликий спільний стан вибраної послуги між островами; без персональних даних і персистентного сховища. TanStack Solid Query — справжнє завантаження локального каталогу з loading/error/retry у новому модулі. Tailwind v4 через Vite plugin — спільні tokens/utilities. TypeScript — контракти. Vitest — тести вибору, валідації, передачі стану та каталогу.

Вибираємо Svelte із запитаного Svelte / SvelteKit і Vite із Vite/Turbopack. SvelteKit не додається як другий router/server. Turbopack — альтернативний pipeline екосистеми Next.js, не другий bundler Astro. Це явний вибір сумісних альтернатив, а не встановлення невикористаних пакетів.

| ID | Acceptance | Owner / scope | State |
|---|---|---|---|
| R201 | Виразний кольоровий responsive дизайн усіх сторінок, клавіатура, reduced-motion | design: Layout, index, global styles, icons | Implemented, verified in revision2-qa.json |
| R202 | Корисні Vue/Pinia + Svelte інструменти та справжня передача вибору в заявку; Solid Query catalogue | features: new feature components/stores/lib/tests | Implemented, verified in revision2-qa.json |
| R203 | Tailwind v4, TypeScript, Vitest, Vite; сумісна конфігурація та реальні перевірки | root: deps/config/integration | Implemented, verified in revision2-qa.json |
| R204 | Тимчасовий banner, noindex/robots/header, окрема конфігурація домену, removal/migration runbook | root + design | Implemented, verified in revision2-qa.json |
| R205 | kneba.vsp.rest HTTPS реально відкриває перевірений artifact | root; hosting agent read-only discovery | PASS: domain/TLS active and live browser checks |
| R206 | План/промпт/roadmap/memory оновлені; source і deployment identity | root | Implemented, verified in revision2-qa.json |

## Gates / budgets

Prior build: all emitted JS gzip 14,974 bytes, CSS 5,511 bytes (not network/CWV). Revision adds three functional frameworks by explicit request: all emitted JS gzip target <160 KiB, CSS <30 KiB; homepage should hydrate only its own tool and not all frameworks. Static content readable without JS. Local viewport 320/390/768/desktop, flow handoff and error states, tests/build/typecheck and live HTTPS checks. No speedup percentages or field-CWV claims without measurements.

## Publication / recovery

User explicitly authorizes temporary public deployment and exact subdomain kneba.vsp.rest. No change to official knaba.de, vsp.rest root, mail records, unrelated infrastructure. No new paid subscription. Check existing DNS before modification. New isolated site/resource, visible temporary banner, noindex, version receipt and exact created DNS IDs. Future removal: delete only exact resources created for this preview; do not execute removal now. Official migration is a future release, not authorized in this request.

Server-side delivery is still not implemented: form prepares an email draft. No synthetic prices, testimonials, certificates, response guarantees. Existing legal/photo limitations must be resolved or honestly reflected for public preview; no claim of production legal certification. Public preview feedback/UAT and field performance remain distinct gates.

## Acceptance evidence

Final local gates:11Vitest+8inquiry tests, Astro/Vue/Svelte checks,16page build, link/meta/size verifier and production-dependency audit passed. Final live receipts: [revision2-live.json](evidence/revision2-live.json). Independent reviewer /root/hosting checked code/contracts/config and requested corrected build report/singular selection copy, both applied. Public temporary preview is delivered. Official migration, final legal approval, real Lead delivery and human UAT/fieldCWV remain separate future gates. Raw HTTP headers were not verified; meta noindex and canonical were read on the live domain.
