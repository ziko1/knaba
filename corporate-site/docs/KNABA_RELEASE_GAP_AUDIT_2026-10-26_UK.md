# KNABA — Gap Analysis та кандидат виправлень, 26.10.2026

**Перевірений кандидат коду. Повний продукт NOT_READY.** Проєкт: `ziko1/knaba`, тестовий сайт `kneba.vsp.rest`. Офіційний `knaba.de`, AVENQO та корпоративний `vsp.rest` не змінювалися.

## Ідентичність

- База PR91: `d48cc81ca3db4f689c3126ec60dd17a4192319b7`.
- Перевірений локальний code commit: `229ba40806a8278d24c559acf693e726f11b8256`.
- Опублікований code commit: `7de449b319f57f0d07d2f43b4b6a25e0219c1158`. Git tree ідентичний локальному: `d6bc0694541f42b871a221c4b7f0696d90b5e3f6`; різниця SHA лише в метаданих commit.
- Client artifact digest чинного verifier: `6e98cd797fde6dbc1f720bf754eb376ce44386acfc14ec95924ba5cd03c02901`.
- Перевірений живий реліз: `cecb321ac41106c7a4f6da2d4a98308508852b38`. Новий кандидат **не розгорнуто**.
- Codex: `/root` — інтеграція/QA, `/root/frontend` — UI, `/root/security_api` — API/міграції, `/root/gap_review` — незалежне review. Зовнішні AI-провайдери не запускалися.

## Зіставлення вимог

[gap-matrix.json](evidence/release-gap-20261026/gap-matrix.json): 22 групи, усі24 KNB-блоки та72 AC V4, посилання на джерела,21 SHA256 reviewed files. Враховано доступну історію розмов через Personal Context, поточні документи й гілки; доступ до кожного приватного чату не стверджується.

Сайт містить портал/Studio/CRM/Assistant. ERP із34 модулями,432 вимогами/475 критеріями існує окремо в PR86. Його історичні тести не підтверджують цей кандидат; канонічні `docs/unified/` залишаються на інтеграційній лінії.

| Джерело | Рішення |
|---|---|
| PR91 | Збережена актуальна база: теми заявок, планувальник, focus і головна |
| PR88 /84 | Порядок блоків уже є; повторне перенесення не потрібне |
| PR90 | Вибірково інтегровані картки робочих процесів, навігація й тести |
| PR89 | Повторно використані Studio body limit і migration preflight; додатково виправлений concurrency defect |
| PR87 | SQL не переносився: його0005 ERP bridge конфліктує з чинним0005 public reviews |
| PR86 | Основа наступного об’єднання ERP; не переписувати ERP з нуля |

## Виправлення

1. Assistant та інбокс: generation guard, single-flight polls, захист від stale GET/errors/unmount, повільних відповідей і неправильного busy. Збережені idempotency, recovery та окремі чернетки діалогів.
2. Актуальний401/403 очищає приватні повідомлення, список, чернетки, notification state і ключі; пізній read не повертає їх. Старий401 не закриває новий успішний діалог.
3. Один локалізований контактний перехід у віджеті замість дублювання телефону/email; handoff до власника збережений.
4. Studio stream parser застосовує endpoint-specific32KiB limit, не помилковий загальний12KiB; oversized/UTF-8 негативи збережено.
5. SQL/journal preflight до відкриття БД; повторна перевірка **всієї** історії під `BEGIN IMMEDIATE`. Pending SQL, receipts і auth DDL атомарні. Конкурентний drift блокує SQL, пізній failure відкочує всі pending steps. Історичні SQL/checksums незмінні.
6. Opt-in exact-IP trusted proxy resolver, right-to-left XFF, IPv6 normalization, spoof rejection. HTTP/SQLite тести доводять незалежні visitor/login buckets. Live-конфіг не змінена.
7. «Галерея» стала компактним розділом «Як ми працюємо»:4 контекстні service links, спільний дизайн,4 мови, старий URL. Ілюстрації явно схематичні; фальшивих кейсів/відгуків немає.

## Докази

Node24.22.1; pinned lockfile; disposable SQLite. [verification.json](evidence/release-gap-20261026/verification.json) містить hashes і сирі стиснені логи. Цільові suites входять до загальних і не підсумовуються вдруге.

| Перевірка | Результат |
|---|---|
| Astro/Vue/Svelte | 0 errors,0 warnings,4 наявні hints |
| Vitest | 234/234 PASS |
| Node suites, явно окремо | 68/68 PASS |
| VPS HTTP/SQLite/auth/Studio/migrations/restore | 56/56 PASS |
| VSP build, links, metadata, ordinal/icons | 122 HTML; PASS |
| i18n source/brand | 26 DE routes,948 units;4 published/95 pending |
| npm audit --omit=dev | 0 відомих runtime vulnerabilities |
| Independent review | ACCEPT_SCOPED_SOURCE_CHANGES,21 file hashes |
| Live HTTP | 122 HTML+4 службові адреси:126 успішних кінцевих відповідей; окрема відсутня адреса404 |
| Live browser | 98 navigable pages:1 H1/canonical/no document overflow at1363×936; UK enquiry до contact step, без submit |

Review виявив migration TOCTOU, polling starvation і busy race; після виправлень повторно перевірено регресії. Проміжний verifier/VPS запуск без `KNABA_RELEASE_MODE=vsp` був невдалим; правильний режим пройшов. Incremental artifact зі старими JS перевищив budget: очищено **тільки** generated `.astro-static`/`dist`, clean rebuild пройшов без підняття порогів. Остаточний npm test log містить Vitest; усі68 Node-тестів виконані й записані окремо.

## Продуктивність, доступність, SEO

Однаковий local Node/zlib: JS gzip188346→189223B (**+877B**), CSS40890→40890B;122 сторінки збережено. [payload-comparison.json](evidence/release-gap-20261026/payload-comparison.json). Це all-assets payload, не page transfer, p95 або field CWV; прискорення не заявляється.

Canonical/hreflang/private noindex/metadata/internal links перевірені. Критерії: [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Google canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls). Повна WCAG-сертифікація не заявляється.

Opera недоступна. Cloud Chrome працював на1363×936; native zoom action не змінив viewport. Mobile320/390/768/1440 нового кандидата, physical devices, screen reader,200% zoom **NOT_RUN**. Browser policy/sandbox не послаблювали. Live CSP/HSTS/nosniff підтверджено; чинний CSP `unsafe-inline` потребує окремого сумісного hardening. Browser/live результати стосуються **старого** deployed release, не нового кандидата.

## Конфігурація й наступний крок

`KNABA_TRUSTED_PROXY_IPS`: comma-separated **перевірені точні IP**, без wildcard/CIDR. Empty ігнорує forwarded headers. Перед увімкненням перевірити приватну topology, безпосередній peer та overwrite/append реального client peer у XFF; після rollout — два відвідувачі й spoof-негативи через фактичний edge. Allowlist не визначений і live не ввімкнений.

Перед test rollout: disk нижче90% threshold, актуальний pointer/два deployment locks/CAS, backup+independent restore, exact artifact, browser QA та rollback на збереженийcecb321. Не видаляти backups/customer data заради gate. Main/DNS/офіційний домен не змінено.

**Відкрито:** ERP integration та сумісний reviews/bridge/owner ledger; реальні AI/voice/WhatsApp і provider budget/data permissions; owner/client/role delivery UAT; повний Studio block/template/menu composer і media upload;95 native-reviewed локалізацій; device/a11y/field CWV/p95; media/legal approval; off-host restore, old D1 reconciliation, retention/export/erasure. `/readyz=200` тепер підтверджено, але це не доказ усіх бізнес-сценаріїв. Диск≈91% перевищує cutover gate.

Послідовність: безпечна storage maintenance → isolated browser/device QA → guarded test rollout/proxy verification → forward-port сайту в канонічний ERP monorepo → provider/owner acceptance. Збережені канонічні roadmap й memory доповнені цим checkpoint.
