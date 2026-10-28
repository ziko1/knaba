# KNABA — реєстр перевірки демонстрації 28.10.2026

## Межа і поточний verdict

Дедлайн: **28.10.2026 12:00 Europe/Berlin**. Початок цієї перевірки: 07:28 Europe/Berlin. Єдиний дозволений публічний deployment цього етапу — `https://kneba.vsp.rest/`. Customer production, `knaba.de`/DNS, подання sitemap та бізнес-профілі: **PENDING_USER_APPROVAL після демонстрації**.

**Проміжний verdict: NOT_READY для повного заявленого продукту.** Сайт і наявний SQLite Portal працюють; повний PostgreSQL ERP, міст identities/leads, реальна пошта, зовнішній AI/месенджери та приймання власником не підтверджені. Окрему часткову демонстрацію не вважати погодженим скороченням обсягу.

Канонічний кандидат: PR #113, `release/knaba-staging-20261028`, поверх PR #110. Перевірочна копія `release/knaba-demo-verification-20261028` зберігає вузькі зміни до інтеграції; не є паралельною архітектурою. Інші приватні чати недоступні через інструмент пошуку історії; звірено доступні PR, GitHub refs, project memory, VPS worktrees та coordination record. Незакомічений owner-settings/access-dialog overlay на VPS не копіювався й не перезаписувався.

## Реєстр сервісів і доступів

| Сервіс | Середовище / ID | Власник | Потрібні права / доступ | Захищене джерело | Квота / витрати | Блокер |
|---|---|---|---|---|---|---|
| GitHub | `ziko1/knaba`, repo ID `1407861296`, account `ziko1` / `10818679` | ziko1 | Connector підтвердив admin/maintain/pull/push; PR/refs читаються | Підключений GitHub connector; secrets не експортувалися | API/Actions залишок UNKNOWN; новий платний план не підключався | Немає для source checkpoint; локальний gh відсутній |
| Staging VPS | `kneba.vsp.rest`, SentinelX `host_cffe53b3b000e4ad`, hostname `vsp` | Інфраструктурний власник потребує підтвердження | SentinelX read/exec; штатний `sudo docker` працює | Наявний connector; `/srv/knaba/vps/config/site.env` | SentinelX Free, 1/1 active host; hosting billing UNKNOWN; нових ресурсів не куплено | Не підміняти цим сервер замовника |
| Runtime / reverse proxy | `knaba-vps-internal`, `node:24-bookworm-slim`, user `1000:1000`, Traefik/Coolify | Оператор VPS | Read-only root filesystem, private state volume, loopback port `19110` | Чинний Compose у `/srv/knaba/vps/docker-compose.yml` | 512 MiB / 1 CPU configured; диск 20 GiB вільно на discovery | Actual Compose старший за portable template; перед cutover звіряти окремо |
| Customer host | hostname/IP/provider/fingerprint UNKNOWN | Замовник | Не підключено; bootstrap/cutover заборонені на цьому етапі | UNKNOWN | UNKNOWN | Отримати host, verified fingerprint, окремі ключі, права, ресурси/backups після approval |
| DNS / TLS / поштові DNS | `knaba.de`; staging HTTPS працює | Власник домену UNKNOWN | Production тільки read-only; DNS connector не підтверджено | UNKNOWN | UNKNOWN | Не змінювати A/AAAA/CNAME/MX/SPF/DKIM/DMARC |
| Сайт SQLite | `/srv/knaba/vps/state/site.sqlite`; 10 застосованих migration entries у initial receipt | KNABA / оператор | Доступ через чинний runtime; synthetic fixture readback підтверджено | Приватний state volume; backup окремо | Існуючий диск | Не починати з порожньої БД; D1/import не підтверджено |
| Старі Sites / D1 | історичний project `appgprj_6adc346d6f8881918b73ac79ebc5d759` | UNKNOWN | Актуальний export/provider доступ не підтверджено | Provider-owned secret store, доступ UNKNOWN | UNKNOWN | Старі акаунти/заявки/чат не вважати перенесеними |
| ERP PostgreSQL/API/worker/storage | Окрема `erp/` інфраструктура; чинний публічний KNABA ERP endpoint UNKNOWN | KNABA / deployment owner UNKNOWN | У переліку KNABA containers робочий V4 ERP не встановлено; source позначає `integration-required` | Потрібний окремий private env та DB/identity config | UNKNOWN; нових платних сервісів не створено | Немає доказу live ERP та site↔ERP; це обов'язковий непідтверджений scope |
| Turnstile | staging site/server key присутні, значення не виводилися | Cloudflare account owner UNKNOWN | Конфіг є; quota/domain ownership UNKNOWN | `/srv/knaba/vps/config/site.env` | UNKNOWN | Реальний challenge/owner config UAT окремо; захист не вимикати |
| Mail / recovery / invitations | SMTP/API config у site.env не виявлено; `/srv/knaba/mail` існує | KNABA mail owner UNKNOWN | Контрольована test mailbox не надана | Потрібне підтверджене захищене джерело | UNKNOWN | Delivery NOT_RUN. Публічний контакт не доводить контроль тестової скриньки |
| Owner / developer | OWNER_EMAIL присутній, developer config відсутній; 1 VPS user на initial backup | Реальні identities не підтверджені | Owner browser login повернув failure; developer не активований | Приватна конфігурація; browserAuth для пароля | N/A | Потрібні окремі verified identities; паролі/токени не в Git/чат |
| Google / Microsoft OIDC | client/secret/tenant keys відсутні | KNABA-owned project UNKNOWN | Provider buttons не показуються без конфігурації | Потрібний private env після підтвердження provider project/callback | UNKNOWN | Provider UAT BLOCKED; email match не SSO |
| AI / WhatsApp / Telegram / voice | Сайт використовує deterministic assistant; PR #103 — окрема source гілка | Provider accounts UNKNOWN | Активні зовнішні інтеграції не доведені | UNKNOWN | UNKNOWN, новий spend 0 EUR authorized | Не називати adapters/rules реальною LLM/двостороннім ботом |
| Monitoring / backup | SQLite online backup/isolated restore initial receipt; retention audit timer active | Оператор VPS | Local backup/read-only timer доступні | `/srv/knaba/vps/state/backups`, private evidence | Існуючий диск; off-host quota UNKNOWN | Off-host restore, сповіщення оператору та затверджена retention policy не підтверджені |
| Android / iOS | PR #112 stacked source | KNABA signing owners UNKNOWN | Native signing/distribution не підтверджено | Signing vault UNKNOWN | Membership/quota UNKNOWN; нічого не куплено | Не оголошувати source/debug як production app; `/app/` поза поточним runtime |
| SEO / analytics | GSC Wizard account call → `INVALID_ARGUMENT`; GBP/Bing/GA property UNKNOWN | KNABA property owners UNKNOWN | Production read-only; звіти недоступні | Підключення власника потрібне | UNKNOWN; підписки не куплено | Impressions/clicks/CTR/positions/conversions/field CWV UNKNOWN |
| ChatGPT / Work | Поточна сесія | Користувач | Лічильник кредитів не експонується | N/A | **UNKNOWN**; не плутати з OpenAI API / hosting | Не давати гарантій залишку |

`site.env` має ACL `root` + `knaba`, group/other не мають доступу; видимий mode 0660 є ACL mask, а не доказ загальногрупового читання. OS users `knaba` (2001) і `vsp` (2002) існують на **staging**; це не перевірка customer host.

## Перевірені факти та докази

| ID | Сценарій | Середовище / код | Фактичний результат | Статус / доказ |
|---|---|---|---|---|
| INITIAL-01 | Initial staging switch + SQLite online backup/restore | Active `fcce39ca316419417b2eb7d97605bf4006ab5652` | Інша сесія виконала deployment; її receipt прочитано. Власна перевірка підтвердила active pointer, Docker healthy та HTTPS | PASS у межах stated receipt; `/srv/knaba/vps/evidence/staging-release-20261028/stage1-deployment-retry.json` |
| A-01 | Anonymous home → request → empty validation → Bauhelfer | Cloud Chrome, live fcce39, DE, desktop | Порожній service повертає native validation; перехід 3 кроків і review працює | PASS browser steps 06:54–06:55 UTC |
| A-02 | Submit synthetic lead; truthful success; persistence | Cloud Chrome + read-only live SQLite | ID `1f068abb-f1de-4687-91d4-234539a66ca0`, рівно 1 record, status `new`, 06:55:42 UTC. Stable service enum `baureinigung`; selected Bauhelfer у message | PASS; `cloud-form-20261028.jpg`; operator UI visibility ще BLOCKED |
| A-03 | No outbound email from inquiry button | `Inquiry.tsx:sendRequest` → worker `createRequest` | POST same-origin `/api/leads`, SQL insert+audit, receipt; no mail/provider call. Mailto — окрема ненатиснута дія | PASS source trace. Первинний auto-review block знято після встановлення цього факту |
| AUTH-01 | Actual owner cloud login | `https://kneba.vsp.rest/login/`, browserAuth | Secure collector submitted; сайт показав «Anmeldung fehlgeschlagen». Секрет не читався | FAIL login attempt; причина credentials/identity не визначена; owner browser acceptance BLOCKED |
| PRIVACY-01 | New records identify shown privacy version | Working tree atop fcce39 | Before: 3 focused tests reproduced old date. After: new records 2026-10-28; replay preserves old historical acknowledgement | PASS focused + full tests; runtime deploy pending |
| PRIVACY-02 | DE/RU privacy recipients/roles/device storage | Working tree atop fcce39 | Описані authorized developer, partner, public access request, language Local Storage; без вигаданого AVV/provider | PASS source/legal text regression; owner/legal factual approval pending |
| QA-01 | Existing site checks/tests/build | Working tree atop fcce39; Node24.22.1 | Check 0 errors/0 warnings; 263 Vitest + 77 Node; 88 VPS/SQLite; build 130 HTML; verifier PASS | PASS scoped automated; `verification-working-tree.json` і названі logs |
| QA-02 | Build performance budgets | Та сама staging збірка | CSS gzip 40,949 B / 40,960 cap; emitted JS gzip 195,116 B; artifact `7306560cb740f3cfb84e9c05252ea1d08f49a481fb93c5b67c3054a69d445bf1` | PASS build budget; лише 11 B CSS reserve; field LCP/INP/CLS UNKNOWN |
| ROLE-01 | Owner/developer/client/partner/worker isolation | Ізольовані реальні SQLite HTTP tests | Existing customer/invite/role/revoke/IDOR tests у 88-test suite PASS | PASS local fixtures; не live browser PASS |
| ERP-01 | Full ERP order/document workflow + bridge | Current public staging | Live V4 ERP/tenant identity/lead bridge не доведені | BLOCKED; `src/lib/admin-modules.ts` має `integration-required` |
| UAT-01 | Owner/human acceptance, physical devices | Користувач/замовник | Не отримано | NOT_RUN |

## Виправлення, що зберігаються цим checkpoint

- DE/RU privacy узгоджено з фактичними повноваженнями owner/developer/partner та public join. Немає нової бізнес-функції, міграції чи provider activation.
- Нові inquiries/profiles/chats/invitations/access requests записують чинну privacy version 2026-10-28. Старі записи не перетеговані. Publication consent відгуків — окремий незмінений контракт.
- Перегенеровано чинний German source catalogue: 28 routes / 1,052 units; 4 published languages, 95 pending. EN/UK legal translations не вигадані: чинні посилання ведуть на позначений DE legal.

## Конкретні зовнішні рішення

1. **Доступ:** verified owner/developer identities і контрольована test mailbox через захищений канал. Публічний `kontakt@knaba.de` не є доказом owner login чи дозволеного test recipient.
2. **Scope/business:** поточна конструкційна версія навмисно приховує колишній office-cleaning маршрут, тоді як офіційний сайт включає Gebäudereinigung/Büro-/Unterhalts-/Glasreinigung. Потрібно підтвердити представлення цих чинних послуг та B2B/B2C; нові сторінки/істотний layout не додавати мовчки.
3. **Правові факти:** форма бізнесу/реєстр, VSBG willingness/obligation, BFSG фактичні критерії, модель Bauhelfer/AÜG, processor agreements/transfers, retention, media rights — owner/counsel confirmation pending. Автоматизований аудит не є юридичною гарантією.
4. **Координація:** фінальний switch тільки під existing locks + current-pointer compare-and-swap, з повторним читанням GitHub HEAD і незакомічених worktrees; не перезаписувати паралельну роботу.

## Наступні релізні кроки

Після інтеграції з актуальним PR #113: точний runtime SHA/tree → relevant regression → isolated official SEO build → final staging bundle/checksum → online backup/isolated restore → locked deployment → cloud/public/role smoke на останньому artifact → demo verdict. Customer bootstrap, domain/DNS/index submission та external business edits не виконувати.
