# KNABA/VSP: hardening продовження 30.10.2026

Статус: **SCOPED_LIVE_VERIFIED / FULL_HANDOVER_HOLD**. Перевірки та встановлення: 09:14–09:27 Europe/Berlin. Продовжено той самий пакет ops/sitepanel, без дублювання панелі.

## Вимоги та результати

| ID | Scope / acceptance | Результат |
|---|---|---|
| SP-R1 | Унікальні registry targets і runtime aliases перед операцією | PASS source/runtime guards: duplicate targets, Docker name/full-ID/prefix і systemd Id/Names |
| SP-R2 | Відмова shared Docker PID/IPC/UTS/user/cgroup namespaces і container: network | PASS, private чинні конфігурації прийняті |
| SP-R3 | Перевірка resolved systemd lifecycle dependencies в обох напрямках | PASS для conservative allowlist; невідомі service/target/mount зв’язки відхиляються |
| SP-R3a | Host-wide FailureAction/SuccessAction/StartLimitAction/JobTimeoutAction | PASS: лише none; усі four live values none |
| SP-LIVE | Встановити лише перевірений broker; зберегти сайти | PASS, 09:26:46–09:26:56 Berlin; усі11 контейнерів ID/Running/StartedAt/RestartCount і2VSP service PID/timestamps незмінні |
| SP-BACKUP | Відновити відому копію у приватний ізольований файл | PASS byte/logical identity, integrity, FK, write/read/rollback; application restore NOT_RUN |
| SP-TLS | Довірений HTTPS на VPN hostname | BLOCKED_AUTH/CONFIG: наявний cert лише localhost; Tailscale admin потребує sign-in |
| SP-LOGIN | Реальний password/PAM + browser login двох користувачів | NOT_RUN |
| SP-REBOOT | Фактична перевірка після reboot | NOT_RUN; потрібні login/recovery та maintenance window |

## Зміни та перевірка

Реалізація: Codex agent /root/guard_hardening; незалежне code/test/deployment-plan review: /root/continuation_review; встановлення: /root. 13 нових regression tests довели відмову небезпечних конфігурацій перед mutation. Початкові регресії падали на попередньому коді. Після виправлення **47 Python +18 simulated DOM/CLI PASS**; 47 Python також виконано на фізичному сервері. UI bytes не змінено. Це не browser journey.

Встановлений broker SHA256: `74c5b9d0dc6475144e14f115bbb9c8d8b00b437fda00f974d33adacce7e5ee2e`.
Попередній broker: `00235ea31da5dddbddcb78d27486962d1dbec7d17479c87d2d283798ce0eed79`.
Джерельна база: PR118 `b2a73683357eb1237d96cf15e8c68f8b39ad7bae`, попередній runtime source `30191734a356b879d6f7005d077657f1fd9dd11d`.
Пакет більше не ідентичний PR117: це вузьке hardening продовження існуючого коду.

Перед заміною закрито нові tenant connections до socket, дочекалися завершення вже прийнятих клієнтів та перевірили відсутність pending receipts/command children. Незалежне review виявило, що одного timeout8s недостатньо для slow clients; deployment script додатково перевіряє broker-owned socket inodes і відмовляє при connected/unknown sockets. Збережено старі bytes+metadata; atomic replace лише sitepanel.py, restart лише sitepanel.service. Installer/account-policy helpers не запускалися.

Фактично після restart:
- KNABA catalog2 власних сайтів; VSP7 власних записів, з них4локальні й3external.
- Чужий site_id + unsupported action → not_found в обох напрямках.
- Від обох реальних Linux UID по одному start власного вже running контейнера → completed.
- Ledger3→5, усі completed, pending0; шість локальних HTTP probes200.
- Source/config hashes перевірено; registry, паролі, DNS, cert, app images/source/data не змінено.
- Новий broker root:root0644, runtime directory0750 і socket0660 group sitepanel мають зберігатися.

Приватний host receipt: `/var/lib/sitepanel/audits/hardening-20261030T082042Z/deployment.json`.
Backup старого broker: `/var/lib/sitepanel/audits/hardening-20261030T082042Z/old-sitepanel.py`.
Застосовний deployment script SHA256 `1f9b329a2ff6dc2d87d0a6c086f659f7ec03c95f848684325eae8df1a3b86db2`.

## Backup drill

Відома online-копія `20261030T073942.422254Z-scheduled.sqlite` із SHA256 `93e866b6657642227f06438b770516228cd582bd5a2aed02ef874f73a2fe98f3` скопійована в новий root0700 каталог, файл0600. Відновлені bytes і logical dump digest збігаються; integrity=ok, FK errors0; тестовий write/read повністю rollback, джерело незмінне. Дані не виводилися й не переносилися з хоста. Receipt: `/var/lib/sitepanel/audits/restore-drill-20261030T0820Z/result.json`. Це **offline SQLite restore**, без запуску застосунку з копії чи production replacement.

## TLS, доступ і reboot

Повторно підтверджено: Tailscale online, raw TCP9090→loopback Cockpit; localhost HTTPS200 з явною довірою наявному сертифікату. Cert SAN лише127.0.0.1/localhost. CertDomains не надано, CorpDNS=false; системний resolver не розв’язує tailnet FQDN. Це не доказ збою Tailscale VPN. Попередня certificate issuance отримала account-capability error; повторного issuance без зміни передумов не робили.

Для admin DNS відкрита офіційна Tailscale console, яка перенаправила на sign-in. Доступного Tailscale plugin не знайдено; без нового входу ці налаштування недоступні. Потрібний приватний TLS шлях, не публічне відкриття Cockpit. Офіційна процедура: [Tailscale HTTPS](https://tailscale.com/docs/how-to/set-up-https-certificates) — перевірити MagicDNS і HTTPS Certificates; видача cert публікує hostname в CT, але не відкриває сервіс назовні. Налаштування акаунта не змінено.

Не виконано: browser own-sites journeys, password authentication, actual host reboot. Boot ID залишився `4c2e5950-dec6-42bc-8a2c-1e66bf0cb2c3`. Shared host не є двома незалежними root. Старі supplemental sudo у VSP app processes ще потребують погодженого restart, явний sudoers deny чинний. SP-R4 backup controller ownership mapping перевірено для поточної конфігурації, не узагальнено схемою. Стандартні systemd boot/mount units довірені root; TOCTOU при одночасній адміністративній зміні, ресурси CPU/RAM і повна metadata isolation не закриті цим patch.

## Повторна перевірка та відкат

Від довіреного адміністратора:
```bash
sudo sha256sum /usr/local/libexec/sitepanel/sitepanel.py
sudo systemctl is-active sitepanel.service cockpit.socket
sudo -u knaba /usr/local/bin/sitepanel catalog
sudo -u vsp /usr/local/bin/sitepanel catalog
sudo stat -c '%U %G %a %n' /run/sitepanel /run/sitepanel/control.sock
```
Очікування: hash74c5… вище, active, catalog лише own scope, directory root:sitepanel750, socket root:sitepanel660.

Відкат лише через ту саму fence/drain/pending0 процедуру і перевірку current hash; відновити збережений broker00235… з root:root0644 та перезапустити sitepanel.service. Не чіпати ledger, не повторювати невизначені operations, не відновлювати старі адміністративні groups. Автоматичний rollback підготовлений у deployment script, не знадобився.

Незалежний reviewer повторно прочитав receipt і live state о09:27:58Berlin: installed hash/permissions, active/enabled, own/foreign scope,5completed/pending0, усі11containers+2services без змін — PASS.

Git publication і root source verification додаються окремими receipts; source/UI/host acceptance не означає повний production release або merge.
