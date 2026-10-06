# API contracts

Internal work notifications are a closed leased-event projection, not a public mutation API. The worker binds the authoritative company outbox row/type/data/token and derives explicit current source recipients with scoped visibility. It atomically creates minimal six-language reason/source/cause metadata, CREATE revision/audit and WEB delivery outbox, with durable source/cause/recipient deduplication. Reads and delivery require current source version/cause and recipient authority; stale assignments, completed causes and revoked memberships are hidden or cancelled. Approval events bind source versions; accepted-without-crew decisions use the recorded quote approver as responsible owner. WhatsApp remains explicitly configured and policy-gated. Exact new-source hosted acceptance is pending; local1513cases/54files are1307CPU PASS/206realPG SKIP.

Base path: **`/api/v1`** on the same origin as the web application. API version is 1. Source authority is [HTTP controller](../apps/api/http.ts), [executor](../apps/api/engine.ts), [domain schemas](../packages/domain/) and [native integration guide](MOBILE.md). The command inventory below is generated from the current domain registry plus identity commands; authenticated `/commands` and `/openapi.json` expose the actual schemas for the caller's current permissions.

## Authentication and request semantics

Staff session cookie: `knaba_session`; private public-guest cookie: `knaba_guest`. Both are HttpOnly/SameSite=Strict; PRODUCTION forces Secure. Session response `/me` includes the session-bound `csrfToken`; cookie-authenticated mutation requests must send `x-csrf-token` and pass the same-origin check. Staff sessions expire after 8 hours, guest sessions after 24 hours. High-risk commands in PRODUCTION require successful recent TOTP MFA (15 minutes). Each request reloads the active actor; stored roles or a browser menu never grant authority. DEMO login exists only in APP_MODE=DEMO and selects a synthetic actor.

Native authentication is an opaque `Authorization: Bearer ...` device credential, server-side hashed and expiring. Device/user/role validity is rechecked. It does not receive high-risk MFA privileges or a reusable staff password. Device bearer mutation requests do not use browser CSRF.

Command request:

```json
{
  "input": {"id": "CURRENT_ENTITY_ID"},
  "expected_version": 3,
  "idempotency_key": "unique-logical-request-key"
}
```

Send to `POST /api/v1/commands/COMMAND_NAME`. Native-compatible `POST /api/v1/commands` accepts the same envelope plus `"command":"COMMAND_NAME"`. `idempotency_key` is required, 8–200 characters. Retain it for a retry of the same logical input; generate a new key after changing input. `expected_version`, if supplied, is a positive aggregate version. Commands that act on a public quote/report/schedule version also validate that business version independently.

The executor validates the schema and current rights before executing or returning an old receipt. The canonical hash includes command/input/expected version. Changed input under an old key fails VERSION_CONFLICT; revoked access invalidates cached receipts. Mutations, audit, revisions, receipt and outbox commit atomically. Unknown fields in strict schemas fail; clients cannot submit a caller price, arbitrary raw GPS or a new state to bypass a typed action.

Entities use `{id,companyId,kind,version,data,createdAt,updatedAt}`. Read endpoints return `{items:[...]}` after default-deny kind/scope/projection checks. Commands return their specific aggregate/result object. Never assume a submitted ID is visible merely because it exists; company/site/self/warehouse/customer/channel scope is evaluated server-side.

## HTTP routes

| Method/path | Authentication | Contract / result |
| --- | --- | --- |
| `GET /health`, `/ready`, `/version` | Public, root paths | Process health; DB connectivity; exact bundle SHA/version/mode. Root `/ready` is a DB probe, not full application/provider acceptance |
| `GET /api/v1/health`, `/ready`, `/version` | Public | API health/version; ready validates auth schema, company, and active production owner; actual integration configuration states |
| `POST /auth/login` | Same-origin | `{email,password,otp?}`; optional `totp` compatibility alias; optional companyId must equal configured company; returns actor/profile/CSRF/expiry and cookie |
| `POST /auth/demo` | Same-origin; DEMO only | `{role}` selects a synthetic active user; production returns NOT_FOUND_SAFE |
| `POST /auth/activate` | Same-origin; one-time invitation | `{token,password,totpSecret?,otp?}`; password minimum12; privileged role activation requires valid TOTP; creates credentials and consumes invitation |
| `POST /auth/logout` | Staff cookie + CSRF | Revokes current session; clears cookie |
| `GET /me` | Staff cookie or native bearer | Current actor/profile, CSRF for cookie, mode, build SHA |
| `GET /commands` | Staff/native | `{items:[{name,permission,highRisk,schema}]}` filtered by exact rights |
| `GET /openapi.json` | Staff/native | OpenAPI3.1 command-path catalogue filtered by rights; it covers commands, not every public/native/media route |
| `POST /commands/:name`, `POST /commands` | Staff CSRF or native bearer | Typed command envelope above; mutations rate-limited |
| `GET /entities/:kind` | Staff/native | Scoped entity projections; arbitrary kind is not an unrestricted table browser |
| `GET /audit` | `audit.read` | Up to500 latest company audit entries; immutable history |
| `GET /dashboard` | Staff/native | Authorized counts/open decisions/active sites/shifts; configuration status and update time |
| `GET /events` | Staff/native | Server-sent update/access_revoked events; scoped record IDs/versions; 3s polling,60s connection, maximum2 per user; reconnect after expiry |
| `GET /public/config` | Public | Mode/demo roles, six languages, active approved service projection, configured legal URLs and WhatsApp link; no secret values |
| `POST /public/leads` | Same-origin; isolated guest cookie | Persisted enquiry contract below; no marketing opt-in or implicit price/time promise |
| `POST /public/chat` | Same-origin; isolated guest cookie | `{text,language,leadId?,requestHuman?}`; private message saved; QUEUED, MANUAL_FALLBACK or HANDOFF_PENDING |
| `GET /public/chat/:channelId/messages` | Matching guest cookie | Only this guest's private channel; fresh message membership/history check; `{channelId,items,csrfToken}` |
| `POST /mobile/enroll` | Same-origin; one-use scoped code | `{code,platform:"ANDROID"|"IOS",deviceName}`; replaces old tracker and returns deviceId/employeeId/deviceToken once |
| `GET /mobile/session` | Device bearer | Bounded server tracking mode/expiry/shift/trip/geofence; OFF when gate/shift/device is unavailable |
| `POST /mobile/events` | Device bearer | `{events:[{command:"presence.ingest"|"trip.sample",input}]}` maximum100; per-event ACCEPTED/REJECTED; deviceId/eventId required |
| `POST /imports/locations/preview` | `site.structure.edit`; cookie CSRF/native | `{siteId,fileName,mimeType,base64}` CSV/XLSX; HTTP limit5MiB; row/column errors or normalized scoped preview, no commit |
| `POST /media/upload` | `media.upload`; staff CSRF/native | Base64 JPEG/PNG/WebP or bounded PDF; actual bytes max25MiB, image max24M pixels; verified proof and private bytes; PDF requires a configured exact clean ClamAV result |
| `GET /media/:id/file` | Scoped actor + current membership | Authorized original or explicitly approved client copy; no-store/nosniff/private bytes |
| `GET /reports/:id/pdf`, `/reports/:id/csv`, `/reports/:id/xlsx` | Scoped actor + published version | Real PDF/XLSX/CSV of a published immutable snapshot; ID may be report or report_version; archived once per version/format; source SHA and artifact SHA kept separate |
| `GET /webhooks/whatsapp` | Configured verify token; root path | Meta subscribe challenge verification |
| `POST /webhooks/whatsapp` | HMAC-SHA256 exact raw bytes; root path | Validated signed inbox deduplication plus durable outbox; `{accepted:true}` only after persistence |

Routes in this table without the root prefix are relative to `/api/v1`. A provider token merely being configured does not mean its live scenario passed. Sensitive responses have private/no-store behavior. Public and mutation/image limits are bounded; application-local limiters are not a demonstrated distributed abuse-control solution.

Public enquiry body:

```json
{
  "contact": {"name": "Testperson", "email": "test@example.invalid", "phone": "+490000000000"},
  "text": "Synthetische Anfrage; keine echte Bestellung.",
  "language": "DE",
  "source": {"channel": "WEB", "landingPage": "/", "campaign": "synthetic-test"},
  "requestHuman": true,
  "contactConsent": true,
  "serviceIds": []
}
```

Name/email/text/contactConsent are required; phone/serviceIds are optional. Source fields are supplied attribution, not inferred history. Repeated identical open submissions under the same private guest are deduplicated; supplied contact text never merges another identity. Reply contact consent has purpose RESPOND_TO_REQUEST; marketingConsent remains false. A request without selected service IDs remains a real stored request for human qualification.

## Native tracking and documents

`mobile/session` issues an at-most5-minute lease further limited by policy/shift expiry. Modes: OFF, PRIVATE_BREAK, SITE_PRESENCE, BUSINESS_TRAVEL. Presence events preserve event ID/sequence/observed time/policy version and forbid latitude/longitude. Trip samples carry precise coordinates only for a legally authorized business interval. Collection mode is checked at original event time; private/off-duty events cannot be legitimized by later upload. Native queue keys retain idempotency during replay. OS permissions and physical background behavior are independent of protocol acceptance.

Image uploads verify bytes/MIME, decode/re-encode and strip metadata. They do not automatically redact faces/plates; `redactionConfirmed` records a human assertion. `media.register` links a verified upload to a valid site/employee/task context; `media.approve` separately allows a sanitized client copy. PDF input uses the implemented bounded ClamAV INSTREAM adapter (`MEDIA_SCANNER_URL=tcp://host:port`); missing configuration, infected, ambiguous, timed-out or failed scans reject upload. A real scanner endpoint has not been verified. `S3_BUCKET` explicitly selects the implemented S3 adapter; absence selects private PostgreSQL. Downloads authorize current scope before retrieving either provider.

Report exports require a published immutable report_version and current scope. PDF, XLSX and CSV read the same verified snapshot amounts (integer cents), exact seconds and canonical source SHA. Each immutable format is archived and later downloads return those same bytes after current authorization. `ETag` identifies artifact bytes; `X-KNABA-Source-SHA256` identifies the source. Formula-like CSV strings are escaped; XLSX contains real OOXML numeric/text/image parts and preserves integers beyond Excel precision as text. Structured E-Rechnung is not implemented or certified. PDF generation is a real document export, not a legal tax-invoice certification or proof that the customer accepted work.

## Typed failures

Response shape is `{code,details}`; validation details contain field paths/messages. Authorization/not-found/authentication failures omit identifying details. Server stacks/secrets are not returned.

| HTTP | Common code / meaning |
| --- | --- |
| 400 | VALIDATION_ERROR or domain rule failure; correct typed input |
| 401 | NEEDS_REAUTH / NEEDS_APPROVAL; obtain valid credentials/recent MFA or the required approval |
| 403 | ACCESS_DENIED; permission/current scope revoked or absent |
| 404 | NOT_FOUND_SAFE; unknown or inaccessible reference/route |
| 409 | VERSION_CONFLICT / INVALID_STATE; reload the current record, do not silently accept a newer proposal |
| 429 | RATE_LIMITED; bounded client retry |
| 503 | MISSING_CONFIGURATION / PROVIDER_UNAVAILABLE; retain original and use documented fallback |
| 500 | INTERNAL_ERROR; correlate technical evidence without leaking internals |

## Customer Issue contract

`issue.context {siteId}` returns only safe active locations `{id,nodeType,code,name,parentId,floorLabelDe}` and tasks `{id,title,state,locationId,orderId}` visible to the current customer (explicitly client-visible or present in a published report). It returns no worker IDs, internal notes or hidden task drafts. Current VIEW membership, site limits, expiry and revocation are checked at each call.

`issue.draft` and `issue.create` take `{siteId,orderId?,locationId?,taskId?,photoIds?,description,language?,externalKey,severity?,dueAt?}`. A concrete location, task or approved/owned verified photo is required. `issue.submit {id}` turns the creator's private draft into a numbered open issue. `issue.get/list` use the same fresh scope and safe external projection. Stable externalKey and command idempotency prevent duplicate logical effects.

A permitted internal reviewer uses `issue.qualify` with exact classification, publicResponse and private internalReason. DEFECT links canonical defect/rework; ADDITIONAL_WORK creates only the remaining contracted continuation; NEW_SCOPE requires a decision and separately approved/accepted Nachtrag; CLARIFICATION creates no work or money. `issue.link_work` validates canonical same-site/cycle relationships. `issue.resolve` requires accepted linked work/closed defect/accepted change where applicable, or a documented no-action agreement; `issue.reopen` preserves prior evidence and starts a new cycle. Customer submissions never rewrite issued reports, accepted original tasks, time, payroll or fixed amounts.

## Bounded delegation and privacy

Governance commands are in the shared registry. `delegation.create` prepares an exact hash for named staff/site/warehouse permission tuples and a maximum 30-day effective interval; a distinct OWNER with MFA approves that hash. Every action reloads effective grants and the grantor's currently held authority; expiry/revocation changes the authorization fingerprint. No transitive grants, finance/GPS/privacy/identity/legal/audit/scope or mass-export delegation is allowed.

An authenticated subject creates an ACCESS or ERASURE `privacy.request`. A distinct authorized privacy reviewer needs current evidenced PRIVACY approval and approved category/projection metadata. `privacy.export` produces an immutable, checksum-verified own JSON snapshot with whitelisted fields; it does not grant access to another employee's wages or raw routes. Category retention policies require fixed approved bounds and separate hash approval. Specific legal holds are scoped and expiring. `privacy.erasure_evidence` records an external reference as unverified/pending; it does not delete source data or report completed erasure. See [governance details](GOVERNANCE.md) for exact schemas and limits.

## Current command inventory

Generated from the composed Engine registry at 2026-10-06T22:16:30.441Z; **257 commands**, **49 high-risk definitions**. Schemas remain available from the authenticated runtime catalogue. Exact permission, current scope, legal/expiry and business-state checks apply; high-risk definitions require recent MFA in PRODUCTION. The [role matrix](ROLE_MATRIX.md) lists defaults.

| Command | Required permission | High risk |
| --- | --- | --- |
| `absence.explain` | `shift.manage` | no |
| `absence.review` | `timesheet.approve` | no |
| `assistant.playground` | `assistant.manage` | no |
| `assistant.usage` | `assistant.manage` | no |
| `assistant_config.activate` | `assistant.approve` | yes |
| `assistant_config.approve` | `assistant.approve` | yes |
| `assistant_config.create` | `assistant.manage` | no |
| `assistant_config.preview` | `assistant.manage` | no |
| `assistant_config.regression` | `assistant.manage` | no |
| `assistant_config.rollback` | `assistant.approve` | yes |
| `automation_rule.activate` | `automation.approve` | yes |
| `automation_rule.create` | `automation.manage` | no |
| `automation_rule.preview` | `automation.manage` | no |
| `automation_rule.run` | `automation.execute` | no |
| `batch.create` | `inventory.manage` | no |
| `batch.status` | `inventory.manage` | no |
| `callback.consume` | `chat.read` | no |
| `callback.create` | `chat.read` | no |
| `change_order.accept` | `quote.accept` | no |
| `change_order.approve` | `quote.approve` | yes |
| `change_order.create` | `quote.create` | no |
| `channel.create` | `chat.write` | no |
| `channel.list` | `chat.read` | no |
| `channel.mark_read` | `chat.read` | no |
| `channel.membership` | `chat.manage` | no |
| `channel.mute` | `chat.read` | no |
| `channel.unread` | `chat.read` | no |
| `crew_assignment.acknowledge` | `dispatch.acknowledge` | no |
| `crew_assignment.start` | `dispatch.acknowledge` | no |
| `customer.create` | `commerce.manage` | no |
| `customer.membership.grant` | `customer.manage` | yes |
| `customer.membership.revoke` | `customer.manage` | yes |
| `customer.portal` | `customer.read` | no |
| `decision.create` | `decision.manage` | no |
| `decision.resolve` | `decision.manage` | no |
| `defect.create` | `task.review` | no |
| `defect.rework` | `task.review` | no |
| `delegation.approve` | `role.manage` | yes |
| `delegation.create` | `role.manage` | yes |
| `delegation.revoke` | `role.manage` | yes |
| `delivery.prepare` | `integration.process` | no |
| `delivery.reply_context` | `chat.read` | no |
| `delivery.status` | `integration.process` | no |
| `device.bind` | `device.self` | no |
| `device.enroll` | `device.manage` | no |
| `device.revoke` | `device.manage` | no |
| `digest.configure` | `notifications.manage` | yes |
| `digest.generate` | `notifications.manage` | no |
| `digest.preview` | `notifications.manage` | no |
| `dispatch.assign` | `dispatch.manage` | yes |
| `dispatch.materials.confirm` | `dispatch.manage` | no |
| `dispatch.readiness` | `dispatch.manage` | no |
| `dispatch.recommend` | `dispatch.read` | no |
| `dispatch.reschedule` | `dispatch.manage` | yes |
| `dispatch.reserve` | `dispatch.manage` | no |
| `employee.availability` | `dispatch.manage` | no |
| `estimate.calculate` | `commerce.read` | no |
| `geofence.configure` | `location.policy.manage` | yes |
| `glossary.configure` | `bot.manage` | no |
| `handoff.inbox` | `chat.manage` | no |
| `handoff.resume` | `chat.manage` | no |
| `handoff.take` | `chat.manage` | no |
| `internal_assistant.confirm` | `assistant.read` | no |
| `internal_assistant.preview` | `assistant.read` | no |
| `internal_assistant.request` | `assistant.read` | no |
| `issue.context` | `issue.read` | no |
| `issue.create` | `issue.create` | no |
| `issue.draft` | `issue.create` | no |
| `issue.get` | `issue.read` | no |
| `issue.link_work` | `task.review` | no |
| `issue.list` | `issue.read` | no |
| `issue.qualify` | `task.review` | no |
| `issue.reopen` | `issue.create` | no |
| `issue.resolve` | `task.review` | no |
| `issue.submit` | `issue.create` | no |
| `knowledge.approve` | `assistant.approve` | yes |
| `knowledge.create` | `assistant.manage` | no |
| `knowledge.search` | `assistant.read` | no |
| `lead.claim` | `lead.handoff` | no |
| `lead.close` | `lead.manage` | no |
| `lead.create` | `lead.create` | no |
| `lead.decline_upsell` | `lead.manage` | no |
| `lead.handoff` | `lead.manage` | no |
| `lead.own_handoff` | `lead.manage_own` | no |
| `lead.own_qualify` | `lead.manage_own` | no |
| `lead.qualify` | `lead.manage` | no |
| `lead.resume_ai` | `lead.handoff` | no |
| `legal_approval.record` | `legal.manage` | yes |
| `legal_approval.revoke` | `legal.manage` | yes |
| `legal_hold.create` | `privacy.review` | yes |
| `legal_hold.release` | `privacy.review` | yes |
| `location.archive` | `site.structure.edit` | no |
| `location.breadcrumb` | `site.read` | no |
| `location.create` | `site.structure.edit` | no |
| `location.import.commit` | `site.structure.edit` | no |
| `location.import.preview` | `site.structure.edit` | no |
| `location.update` | `site.structure.edit` | no |
| `material.create` | `inventory.manage` | no |
| `material.lookup` | `inventory.read` | no |
| `material.price` | `procurement.approve` | no |
| `material.update` | `inventory.manage` | no |
| `media.approve` | `report.approve` | no |
| `media.redact` | `report.approve` | no |
| `media.register` | `media.upload` | no |
| `message.ack` | `chat.read` | no |
| `message.copy_confirm` | `chat.write` | no |
| `message.copy_preview` | `chat.write` | no |
| `message.edit` | `chat.write` | no |
| `message.pin` | `chat.write` | no |
| `message.read` | `chat.read` | no |
| `message.send` | `chat.write` | no |
| `notification.read` | `chat.read` | no |
| `notifications.cancel` | `notifications.manage` | no |
| `notifications.complete` | `integration.process` | no |
| `notifications.configure` | `chat.read` | no |
| `notifications.inbound` | `integration.process` | no |
| `notifications.prepare` | `integration.process` | no |
| `notifications.schedule` | `notifications.manage` | no |
| `operations.statistics` | `operations.read` | no |
| `order.transition` | `dispatch.manage` | no |
| `payout.ack` | `finance.payout.ack` | no |
| `payout.approve` | `finance.payout.approve` | yes |
| `payout.create` | `finance.payout` | yes |
| `payout.record` | `finance.payout` | yes |
| `payout.reverse` | `finance.payout.approve` | yes |
| `payroll.balance` | `finance.payroll` | no |
| `payroll.calculation` | `finance.payroll` | yes |
| `payroll.official` | `finance.accountant` | yes |
| `payroll.rate` | `finance.payroll` | yes |
| `payroll.recalculate` | `finance.payroll` | yes |
| `payroll.supplement_approve` | `finance.payroll.approve` | yes |
| `payroll.supplement_request` | `finance.payroll` | no |
| `presence.ingest` | `location.self` | no |
| `price_book.activate` | `commerce.approve` | yes |
| `price_book.approve` | `commerce.approve` | yes |
| `price_book.create` | `commerce.manage` | no |
| `privacy.erasure.confirm` | `privacy.review` | yes |
| `privacy.erasure.preview` | `privacy.review` | yes |
| `privacy.erasure_evidence` | `privacy.review` | yes |
| `privacy.export` | `identity.self` | no |
| `privacy.request` | `identity.self` | no |
| `privacy.review` | `privacy.review` | yes |
| `privacy.status` | `identity.self` | no |
| `procurement.approve` | `procurement.approve` | yes |
| `procurement.calculate` | `procurement.read` | no |
| `procurement.close` | `procurement.approve` | no |
| `procurement.confirm_delivery` | `procurement.order` | no |
| `procurement.create` | `procurement.request` | no |
| `procurement.order` | `procurement.order` | yes |
| `procurement.receive` | `inventory.receive` | no |
| `procurement.reconcile` | `procurement.approve` | no |
| `quote.accept` | `quote.accept` | no |
| `quote.approve` | `quote.approve` | yes |
| `quote.create` | `quote.create` | no |
| `quote.expire` | `quote.manage` | no |
| `quote.get` | `commerce.read` | no |
| `quote.reject` | `quote.accept` | no |
| `quote.revise` | `quote.create` | no |
| `quote.send` | `quote.send` | no |
| `report.ack` | `report.ack` | no |
| `report.approve` | `report.approve` | yes |
| `report.create` | `report.create` | no |
| `report.daily_draft` | `report.create` | no |
| `report.delivered` | `report.deliver` | no |
| `report.publish` | `report.publish` | no |
| `report.review` | `report.review` | no |
| `report.revise` | `report.create` | no |
| `request.ack` | `inventory.request` | no |
| `request.approve` | `inventory.approve` | no |
| `request.close` | `inventory.approve` | no |
| `request.create` | `inventory.request` | no |
| `request.from_scan` | `inventory.request` | no |
| `request.submit` | `inventory.request` | no |
| `reservation.create` | `inventory.reserve` | no |
| `reservation.expire` | `inventory.reserve` | no |
| `reservation.release` | `inventory.reserve` | no |
| `retention.approve` | `privacy.manage` | yes |
| `retention.create` | `privacy.manage` | yes |
| `service.approve` | `commerce.approve` | yes |
| `service.create` | `commerce.manage` | no |
| `service.list` | `commerce.read` | no |
| `service.questions` | `commerce.read` | no |
| `service.update` | `commerce.manage` | no |
| `shift.activity` | `shift.manage` | no |
| `shift.end` | `shift.manage` | no |
| `shift.start` | `shift.manage` | no |
| `shift.summary` | `shift.read` | no |
| `shift.working_time_advisory` | `shift.read` | no |
| `site.create` | `site.create` | no |
| `site.update` | `site.structure.edit` | no |
| `site_visit.create` | `lead.manage` | no |
| `site_visit.own_create` | `lead.manage_own` | no |
| `stock.accept` | `inventory.receive` | no |
| `stock.balance` | `inventory.read` | no |
| `stock.count.apply` | `inventory.count.approve` | yes |
| `stock.count.create` | `inventory.count` | no |
| `stock.receive` | `inventory.receive` | no |
| `stock.return` | `inventory.ship` | no |
| `stock.ship` | `inventory.ship` | no |
| `stock.usage_visibility` | `report.approve` | no |
| `stock.use` | `inventory.use` | no |
| `stock.use_from_scan` | `inventory.use` | no |
| `stock.writeoff` | `inventory.writeoff` | yes |
| `stock.writeoff_approve` | `inventory.writeoff.approve` | yes |
| `stock.writeoff_request` | `inventory.writeoff` | no |
| `stock_location.create` | `inventory.manage` | no |
| `supplier.create` | `inventory.manage` | no |
| `task.assign` | `task.assign` | no |
| `task.block` | `task.work` | no |
| `task.bulk.commit` | `task.create` | no |
| `task.bulk.preview` | `task.create` | no |
| `task.cancel` | `task.assign` | no |
| `task.checklist` | `task.work` | no |
| `task.create` | `task.create` | no |
| `task.progress` | `task.read` | no |
| `task.ready` | `task.create` | no |
| `task.reopen` | `task.review` | no |
| `task.review` | `task.review` | no |
| `task.start` | `task.work` | no |
| `task.submit` | `task.work` | no |
| `task.summary` | `task.read` | no |
| `task.worklog` | `task.work` | no |
| `task_template.create` | `task.create` | no |
| `task_template.generate_due` | `task.create` | no |
| `task_template.occurrence` | `task.create` | no |
| `task_template.update` | `task.create` | no |
| `time.allocate` | `task.work` | no |
| `timesheet.correction` | `timesheet.submit` | no |
| `timesheet.correction.bulk` | `timesheet.submit` | no |
| `timesheet.correction.review` | `timesheet.approve` | no |
| `timesheet.lock` | `timesheet.approve` | no |
| `timesheet.review` | `timesheet.approve` | no |
| `timesheet.submit` | `timesheet.submit` | no |
| `timesheet.summary` | `timesheet.read` | no |
| `timesheet.working_time_advisory` | `timesheet.read` | no |
| `tracking_policy.approve` | `location.policy.manage` | yes |
| `tracking_policy.create` | `location.policy.manage` | no |
| `tracking_policy.disable` | `location.policy.manage` | no |
| `translation.preferences` | `translation.use` | no |
| `translation.read` | `translation.use` | no |
| `translation.request` | `translation.use` | no |
| `translation.result` | `integration.process` | no |
| `trip.approve` | `trip.approve` | no |
| `trip.arrive` | `trip.manage` | no |
| `trip.destination` | `trip.manage` | no |
| `trip.end` | `trip.manage` | no |
| `trip.resume` | `trip.manage` | no |
| `trip.sample` | `location.self` | no |
| `trip.start` | `trip.manage` | no |
| `trip.stop` | `trip.manage` | no |
| `user.disable` | `identity.manage` | yes |
| `user.invitation.revoke` | `identity.manage` | yes |
| `user.invite` | `identity.manage` | yes |
| `user.mfa.configure` | `identity.self` | no |
| `user.password.rotate` | `identity.self` | no |
| `user.roles` | `identity.manage` | yes |
| `work_package.create` | `task.create` | no |

## Current internal draft and read-only contracts

`assistant.playground` and `assistant.usage` execute in actual PostgreSQL
`SERIALIZABLE READ ONLY` transactions. They re-read current authority and create
no command receipt, audit, outbox event or business row. The playground is an
explicit deterministic `SIMULATED` policy/closed-tool exercise; it does not
invoke a model or establish model quality. Budgets use integer EUR cents,
company-wide Berlin calendar-day ceilings and separate CUSTOMER_ASSISTANT,
INTERNAL_DRAFT and TRANSLATION categories. Unknown provider outcomes retain
reserved costs; configured token-rate estimates are not provider invoices.

`internal_assistant.request` accepts an existing own HUMAN original in an
allowed internal channel, exact message/config versions, a kind TASK_BATCH,
REPORT or MATERIAL_REQUEST, explicitly selected site IDs and scoped context
IDs. It persists a private request and a leased outbox event. The worker
revalidates current actor/source/context/config/transfer approval and lease
before provider I/O and before private draft persistence. A missing provider
returns FAILED/PROVIDER_DISABLED with no business creation. Unknown I/O keeps
RUNNING/UNKNOWN and its reservation; retries do not issue another model call.

`internal_assistant.preview {draftId}` returns the current private authorized
preview, exact draftVersion/previewHash, full selected task paths and typed
clarifications. `internal_assistant.confirm {draftId,expectedVersion,
previewHash,confirmed:true}` revalidates all authority and references, then
invokes only canonical task.bulk.commit, report.create or request.create in
the same transaction. Reports/material requests remain DRAFT. Confirmation
does not publish, order from a supplier, pay anyone or activate GPS.

`GET /mobile/session` revalidates the current bearer-bound device and actor
inside its company transaction. Its optional own `shiftSummary` has shiftId,
siteId, optional siteCode/siteName, state, activity, startedAt, asOf,
activityStartedAt and nonnegative integer siteSeconds/travelSeconds/
breakSeconds/pendingSeconds/serviceSeconds/waitingSeconds. These are recorded
chronological categories, not payroll entitlement. It may return this summary
with mode OFF and GPS_LEGAL_GATE_CLOSED. The summary never grants location
permission or includes a peer, route coordinate, wage or private-break place.

The browser safe-action queue is tab-memory only, max20 entries/4h, cleared on
logout/account change/reload. Only ID/boolean operational actions enter it;
original idempotency keys and expected versions survive manual retries.
Authorization and entity versions are refreshed before retry. No automatic
background POST or persisted personal/GPS/finance payload is supported.

Automation authoring uses `automation_rule.create`, `.preview`, `.activate` and `.run`; preview executes no effects and activation remains an explicit approval. Optional schedules accept only a bounded minute/hour/weekday cron grammar in Europe/Berlin; invalid saved schedules fail closed. The server revalidates the fresh human owner and action-specific permissions against every declared site/customer before authoring, private entity reads, receipt replay or effects. Empty scope dimensions are unbounded and require company authority. Stored run ruleVersion, owner, action, declared scope and canonical JSON parameters must equal the current rule. A worker's automation.execute permission authorizes transport only; canonical business commands still run as the current authorized human owner and require a matching live outbox lease plus run/rule/target version preconditions.

`task.progress` supports site, location and work-package containers using bounded cycle-safe descendants and unique atomic tasks; quantities remain separated by unit. `operations.statistics` reports current backlog separately from period-clipped recorded work and immutable accepted-minus-reopened quantity deltas. Approved trips use the immutable segment snapshot; unprovable legacy boundary-crossing pay/intervals are unresolved rather than prorated. These statistics do not alter payroll or legal entitlements.

## Personal activity, operations digests and private photo edits

`notification.read {notification_id}` requires the current own recipient and
current visibility of its related source/message. Supply `expected_version`
and a stable logical idempotency key. Stale new submissions fail even after the
notification was already read; exact retries return the minimal acknowledgment
only. Delivery state and the separate persisted `read_at` are distinct.
`channel.unread {}` supplies scoped unread chat counts. Revoked source access
hides its notification and blocks cached acknowledgments.

`digest.configure` records an own human policy, bounded Europe/Berlin daily or
weekly schedule, explicit site/customer scope, delivery channel and activation
time. `digest.preview {policyId,at?}` runs in a database READ ONLY transaction;
it has no audit, receipt, snapshot, notification or business writes. An omitted
time selects the latest eligible scheduled slot. `digest.generate
{policyId,policyVersion,slotAt?}` requires the reviewed policy version and emits
one immutable owner-private snapshot and notification per civil schedule slot.
The worker requires its current real SQL lease, service transport authority and
fresh human policy/section permissions. Berlin DST periods are explicit.
Coverage marks unavailable sections; units, period facts and current backlog
remain distinguishable. Payroll, raw GPS and automatic decisions are excluded.
Current permission/source/policy revision changes hide old private snapshots.
WHATSAPP delivery requires its own protected DIRECT channel, consent and current
window/template policy and sends a protected link; provider-disabled is not a
successful provider delivery.

`media.redact {mediaId,clientCopyVersion,rectangles,reason}` requires current
`report.approve` and scoped `media.read`, current asset `expected_version` and
client-copy version. One to thirty integral opaque rectangles use natural
image pixels. Actual bounded Sharp processing writes a new metadata-stripped
PNG, immutable edit lineage and receipt atomically in the private PostgreSQL
store. The private original and earlier edits remain byte-identical. The
client publication approval is cleared; separate `media.approve` is required.
`GET /media/:id/file?copy=client` reads the current authorized private copy with
no-store caching. S3 editing fails closed until atomic edit lifecycle support
is configured. Erasure retention considers originals, prior copies and edits,
including current report/legal holds.
