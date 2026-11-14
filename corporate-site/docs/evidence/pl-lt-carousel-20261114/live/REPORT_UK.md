# PL/LT carousel — публікація 14.11.2026

**DEPLOYED + LIVE_VERIFIED у вузькому scope двох головних сторінок.**
Активація завершена 14.11.2026 о 15:15:17 за Берліном. Користувач прямо доручив «залий исправления на сервер»; штатна процедура перевірила approval receipt, зробила backup, зберегла попередній release та перевірила health/readiness. GitHub merge не виконувався.

## Походження та обсяг

- Перевірений PR146 source: `799e8b8a2fb3b05d933479fe6afc1b128a4b5d8e`, tree `36695d78cab4d2fcfef2448185c942543d175957`. Локальний source commit `ea2ebe4122f0cf39fe90d35f98be5fef460c7285` має ідентичне дерево.
- Фактичний попередній production artifact: `a503dbb8379a8a7aff083fe3891ba352379643f0e9c8a12156dd1608cd771f4e`, manifest verified.
- Опублікований artifact: `fe5a0cb6708b687b5ccfac4a4afbbea36cf1938562dddc15b7e3c3d086040739`.
- Це попередній production artifact + вузький static overlay PR146, **не повна інтеграційна гілка PR141**. Новий artifact не позначається як повна збірка PR146.
- Runtime, SQLite/schema, конфігурація, DE/EN/UK/RU, інші PL/LT сторінки та всі інші файли byte-identical до попереднього релізу.

| Файл у релізі | Зміна | SHA-256 |
|---|---|---|
| `dist/client/pl/index.html` | Hero зі спільним slider та scoped CSS | `1ceabfa6dbb26ae62259edfc7efa857c98cf7312c2251dbd61c248a012cc8b53` |
| `dist/client/lt/index.html` | Hero зі спільним slider та scoped CSS | `d738521ee5c4f30bf26c7987ffef87324775631b3aa0d93485e2354f437db96e` |
| `dist/client/_astro/ServiceCarousel.DfwA5yFS.css` | Новий shared stylesheet | `b4aae922903a14331a5320eab5c05a3b37b914d61b7afe050d4f8af285948e36` |

Відтворюваний builder: `scripts/build-carousel-hotfix.py`. Він відхиляє drift вихідних PL/LT HTML, перевіряє один slider/8 slides та відновлення всіх незачеплених HTML bytes. Незалежний reviewer відтворив overlay та негативний drift test.

## Перевірки

Node 24.22.1; на вказаному вихідному дереві повторно виконані:

- `npm run check`: 0 errors, 0 warnings, 29 hints; Svelte 0 errors/warnings.
- Site `npm test`: 749 Vitest + 92 Node PASS.
- `npm run test:vps`: 406 PASS; root `npm test`: 36 PASS; snapshot gate PASS.
- `KNABA_RELEASE_MODE=official npm run build` та `KNABA_RELEASE_MODE=official npm run verify:build`: PASS, 161 HTML, i18n/CTA/icon checks PASS. Повна локальна збірка `09fb3181e1a54b9d6187e97e546eefe6d5bfe2910652efd581d4214cde33efb5` служила джерелом hero/CSS; вона не розгорталася цілком.
- Перший verify запуск помилково не мав `KNABA_RELEASE_MODE=official` і очікував staging host. Причину виправлено аргументом середовища; вихідний failed log збережений, assertions не послаблено.
- Локальний Chromium launch був недоступний; WebKit/Firefox не встановлені. Політики браузера не змінювали. Використано наявний підключений Firecrawl браузер.
- Candidate preview: 10 PL/LT + 4 locale regression scenarios PASS; exact HTML/CSS overrides для попереднього приймання.
- **Live HTTPS після активації: ті самі 14 сценаріїв PASS без overrides** (`browser-live.json`).

Браузерні сценарії PL/LT: 320/390/768/1280 CSS px та 980 CSS px із desktop User-Agent + touch. Перевірені layout before-services, один slider/8 slides, decode/naturalWidth всіх 8 картинок, усі dots, previous/next, ArrowLeft/Right, Home/End, фактичне вирівнювання scroll, CDP touch swipe, PL↔LT через UI, 8 існуючих німецьких статей та реальний CTA перехід. JS errors та image HTTP failures: 0. DE/EN/UK/RU: контроль структури, overflow, наступного слайда й decode зображення. Сторінки з формами не надсилалися.

Source review та pre-release screenshots прийняв незалежний `/root/carousel_review`; browser suite підготував `/root/browser_checks`, виконання, інтеграція й деплой — `/root`. Live review фіксується в `independent-review.md`.

Origin HTTP body дорівнює artifact HTML за SHA-256. Публічний Cloudflare response додає динамічний precursor script, тому його повний body hash інший; це не підміна release identity. Деталі без transient tokens: `http-identity.json`.

## Відкат та межі

Backup: `/srv/knaba/customer/backups/production/20261114T141511.284308Z-pre-activate.sqlite`, integrity `ok`, foreign_key_errors `0`. Схема й дані при деплої не змінювалися. Збережено попередній immutable release.

Підготовлена штатна команда відкату саме цього релізу (виконується тільки за потреби; receipt чинний до 16.11.2026 14:14:59 Europe/Berlin):

```sh
python3 /srv/knaba/customer/ops/knabactl.py activate production --artifact a503dbb8379a8a7aff083fe3891ba352379643f0e9c8a12156dd1608cd771f4e --approval /srv/knaba/customer/approvals/pl-lt-carousel-rollback-20261114.json
```

Після закінчення receipt потрібне нове чинне погодження; код gate не змінений. Rollback не запускався, бо перевірки успішні. Готовність інших частин KNABA/ERP/mobile цим звітом не засвідчується. Фізичний телефон та справжній Opera «Версія для ПК» не перевірялися; виконано browser emulation. Field Web Vitals/реальний трафік не вимірювалися.

Firecrawl: перед початком підтверджено 1004 доступні credits, бюджет обмежено 40; два завершені browser sessions повідомили по 4 billed credits, зупинені. Після завершення balance API ще показував 1004; остаточне списання не виводиться з цього незміненого показника. Нові платні сервіси не активувалися.

## Скриншоти живого сайту

- [PL mobile](live-pl-390.jpg), [PL desktop](live-pl-1280.jpg)
- [LT mobile](live-lt-390.jpg), [LT desktop](live-lt-1280.jpg)
