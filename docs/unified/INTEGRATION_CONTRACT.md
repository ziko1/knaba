# KnaBa: контракт об'єднання сайту, Assistant, CRM та ERP

**Status:** PROPOSED — не реалізований API, не підтверджений provider deployment. Чинні endpoint-и потрібно зберегти без зміни контракту до окремого versioned transition.

## Наявні інтерфейси (перевірені за source public-assistant branch)
- `POST /api/leads` (Worker `corporate-site/worker/api.ts`): валідує service/objectType/postcode/frequency/name/email, consent, honeypot, strict JSON+same Origin+`X-KnaBa-Request: portal-v1`, rate limiting і request idempotency. Response `{id,received:true}`; owner/admin бачать заявки у `GET /api/portal/dashboard`.
- `GET /api/portal/session`, `POST /api/portal/register`, `POST /api/portal/roles`, `PATCH /api/portal/requests/:id`: серверні roles owner/admin/worker/client; owners approve.
- `PublicAssistant.tsx` + `src/lib/public-assistant.ts` відповідають за site knowledge локально; питання НЕ зберігаються і НЕ надсилаються. Це не AI provider і не двосторонній owner chat.
- ERP runtime в `apps/api`, `apps/worker`, `packages/domain` на V4/Deploy гілках. Реальні маршрути ERP handoff треба перечитати на exact HEAD перед реалізацією; наведені нижче — proposed, а не вигадані готові API.

## Пропонований event contract KNABA_LEAD_V1
Сайт зберігає lead і outbox подію **однією D1 transaction/batch**; consumer ERP підтверджує тільки після ACID insert lead+inbox+audit у PostgreSQL. Body:
```json
{
  "version": 1,
  "eventId": "UUID",
  "source": "knaba-public",
  "externalLeadId": "UUID",
  "tenantId": "server-resolved",
  "siteId": "server-resolved",
  "occurredAt": "ISO-UTC",
  "data": {"service": "known-service", "postcode": "12345", "contact": {"name": "string", "email": "string"}, "consentVersion": "2026-10-24"}
}
```
Приклади UUID/ZIP вище демонстраційні. `tenantId/siteId` походять тільки з trusted server config, не з browser claims. PII payload мінімальний і зашифрований in transit. `eventId` unique в inbox, `(tenantId,source,externalLeadId)` unique на ERP lead, 409 однакового ключа з іншим fingerprint. Не переносити worker assignments або гроші із public form; лише ERP має право бізнес-команд.

## Перевірка транспорту
- Пропонований `POST /internal/v1/leads` на ERP (НЕ існує до реалізації), HMAC-SHA256 від `timestamp + "\\n" + raw_body`, `X-KnaBa-Event-ID`, `X-KnaBa-Timestamp`, `X-KnaBa-Signature`; secrets на server only, ключ окремо на кожне середовище.
- Replay-window не більше 5 хв; одноразовість eventId з durable inbox, idempotent ack, constant-time signature comparison. Актуальна tenant membership / site scope перевіряється сервером під час обробки, не тільки під час постановки в чергу.
- Retries only transient 5xx/timeout, exponential bounded budget + DLQ, PII-minimal logs, authenticated receipt. Незрозумілий результат після timeout перевіряється через idempotency lookup — не створювати другий Lead.
- Event schema version bump лише сумісним additive способом; rollback залишає unsent outbox, не видаляє D1/Postgres.

## KNABA Assistant, owner і клієнт
Мінімальний end-to-end: добровільна заявка (consent) → owner inbox → owner підтверджує/відповідає → відвідувач бачить повідомлення → optional ERP lead/status, з повним журналом. Анонімна розмова потребує server-hashed high-entropy capability token, не токена в URL чи query, revocation/expiry і rate limits; owner inbox під серверною роллю. Ніякого тихого копіювання приватних AI-повідомлень; summary тільки за явної згоди.
Email/WhatsApp повідомлення: опційний durable outbox після дозволу власника, перевіреного WhatsApp Business API/template/opt-in та підтверджених тарифів/квоти. Відмова каналу не повинна відкотити сам lead. Зберігати delivery receipts, дедуплікацію, privacy/GDPR deletion і відписку. **Платні моделі, WhatsApp і outbound email у цьому інтеграційному кандидатові НЕ активовані.**

## Контроль і negative tests
Unauthorized/expired owner і mismatched tenant → 403/404 без деталей чужих записів; cross-origin mutate → 403; invalid JSON→400, too large→413, validation→422, rate limited→429; idempotency changed payload→409; identical replay returns same receipt. Parallel replay створює рівно 1 ERP lead. Deleted/suspended worker never sees a чужу заявку. Перевірка з реальними Postgres/D1 та публічним browser обов'язкова перед release.
