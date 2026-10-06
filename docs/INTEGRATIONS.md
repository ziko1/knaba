# KNABA DE integrations and durable worker

PostgreSQL aggregates, immutable revisions, command receipts, webhook inbox and outbox are authoritative. Provider calls are isolated behind `packages/integrations` adapters. A provider outage does not remove originals, work records, accepted results, money calculations or reports.

## Executable worker

`npm run worker` starts `apps/worker/main.ts`; a release image runs `node dist/worker.mjs`. The API can call `startWorker(database, engine, options)` and close its returned `stop()` on shutdown. One deliberately credential-disabled SERVICE_ACCOUNT has explicit integration, chat, automation, notification and draft-report permissions. It has no payroll, payment, approval, report publication or GPS authority. Worker queries and command effects remain scoped to the configured `COMPANY_ID`.

Workers lease due PostgreSQL rows through one `UPDATE ... FOR UPDATE SKIP LOCKED` query. The database owns lease time. Independent workers can process distinct rows. An expired RUNNING lease is reclaimable after a reboot. Renewal and completion compare the exact lease timestamp to prevent a previous worker from completing a newly leased row. Jobs start concurrently within a bounded batch of five so later leases remain renewed during slow providers. Domain commands use deterministic idempotency receipts keyed by event and action. Each domain command commits changes, revisions, audit and generated events together.

Technical failures use exponential backoff capped at one hour, with five attempts. Policy/validation/authorization failures dead-letter immediately with typed error codes. Not-due and quiet-hour deferrals do not consume technical attempts. Quiet-hour and related-condition checks run at execution time. Domain reminders independently stop after at most three actual completion attempts. Resolved, accepted, completed or explained conditions cancel their remaining reminders.

An external provider can accept a request before a process dies. Meta does not provide an exactly-once send guarantee. The worker records SENDING before the request and preserves an uncertain result as `PROVIDER_OUTCOME_UNKNOWN`; it does not blindly resend that copy. An operator must reconcile it with provider evidence. Receipt/reboot tests establish exactly-once database business effects, not an invented exactly-once network guarantee.

## WhatsApp ingress

GET verification checks the configured verify token and the subscribe challenge. POST independently validates Meta HMAC-SHA256 on the exact HTTP bytes, before JSON parsing. The adapter validates envelopes and converts allowed message/status fields to `WhatsAppInbound`. Durable HTTP acceptance stores one `webhook_inbox` row under `(provider='WHATSAPP', event_id)` and emits `whatsapp.inbound` with `{provider:'WHATSAPP', event_id}` in the same transaction. The worker loads that inbox payload; duplicates cannot emit a second logical job. Status event identity must include provider message ID, status and provider timestamp so SENT, DELIVERED and READ remain distinct.

Authenticated inbound messages resolve verified, active PHONE/WHATSAPP contact identities. Multiple matching user IDs produce `AMBIGUOUS_RECIPIENT`. A new number receives an isolated guest identity and private consultation; possession of a phone channel does not grant any customer membership. Existing customer access still requires separately verified, granted company memberships. Recipient-specific reply context maps provider copies to one original after a fresh ACL check. Uncontextualized employee messages enter a private operator inbox. Internal channels are never inferred from public text.

Opaque callbacks bind recipient, original message version, expiry and action. Consuming an old, foreign, revoked or expired callback fails before executing the command. Location messages are retained as one-time user inputs, never interpreted as continuous GPS. Untrusted inbound media remains manual-review input until the protected upload/quarantine process handles it.

## Delivery and translation

Immediately before delivery, the worker refreshes current recipient identity, permissions, active membership, history boundary, message version, notification language, consent, opt-out, quiet hours and WhatsApp window. WEB copies stay within protected entity reads. A WhatsApp free-text message needs recorded consent and a received inbound less than 24 hours old. Beyond that window, only an approved template in the current template registry is executable. A template annotation alone cannot authorize delivery. API_ACCEPTED, SENT, DELIVERED and READ are distinct provider states; none is a legal work acceptance or proof of payment receipt.

Translation cache keys include tenant, original message, original version, source/target language, model and glossary version. The original remains unchanged. Current access is checked before provider retrieval and again before exposing a result. Revocation or correction cancels the pending copy. DeepSeek responses require valid structured JSON, preserved fact literals, exact numbers and retained negation. Ambiguous instructions produce an explicit clarification error. Machine copies are labelled and linked to the same original/version. Provider/configuration failure records FAILED with a reason such as PROVIDER_DISABLED; reading the original continues to work.

Active configurations supply approved source IDs, allowed services, response length, budgets, provider model and transfer approval. Assistant retrieval for public/private-customer consultations includes approved public and requester-personal knowledge only. The model cannot see internal payroll, GPS or staff chat, calculate prices, grant permission, assign a crew or execute commands. Human takeover suppresses assistant jobs; authorized resumption is explicit. A provider failure opens a human decision. Usage reservations are persisted before calls, enforce a company configuration budget and remain reserved after an uncertain provider result. No fresh call reuses an uncertain reservation.

## Automation and reports

Only ACTIVE rules with recorded approval, effective date, exact trigger, filters and site/customer scope execute. Rules create one run per event/rule and apply cooldown. Draft reports, reminders, quote drafts and crew recommendations call the same deterministic command registry. Crew recommendation does not assign staff. Shortage detection records unreceived approved quantity for review; it does not buy stock. No action authorizes publication or payment.

The worker queues a deduplicated daily draft for every active site/order after 18:00 Europe/Berlin. The draft includes only accepted task results, approved/locked hours and approved client photos; it stays DRAFT for the defined review workflow. A failed prerequisite remains a typed failed job. Configured scheduled rules accept explicit `minute hour * * *` daily or `minute hour * * weekday` weekly schedules (weekday 0=Sunday). Unsupported cron syntax is not executed. Schedule jobs remain idempotent across repeated polls/reboots and do not call an LLM for GPS pings or every second.

## Runtime configuration

No secret belongs in Git, entity projections, error messages or WhatsApp. Required connection and provider settings are supplied by the deployment secret manager:

| Variable | Meaning |
| --- | --- |
| DATABASE_URL, COMPANY_ID, APP_MODE, PUBLIC_ORIGIN | PostgreSQL, tenant, explicit DEMO/TEST/PRODUCTION, trusted HTTPS origin |
| WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN | Raw-byte POST signature and independent GET challenge |
| WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION | Scoped Meta token, sender identity and explicitly selected supported version |
| LIVE_SEND_ALLOWED=true, WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED=true | Required independent outbound execution and capability gates |
| WHATSAPP_TEST_RECIPIENTS | Comma-separated explicit nonproduction allowed destination numbers |
| DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_REGION, DEEPSEEK_MODEL | HTTPS compatible AI provider and selected transfer region/model |
| AI_TRANSFER_APPROVAL_ID | Recorded legal/data-transfer approval, also required by the active configuration |
| AI_INPUT_PRICE_PER_MILLION_CENTS, AI_OUTPUT_PRICE_PER_MILLION_CENTS | Integer configured provider costs for budget reservation |
| AI_SYNTHETIC_ONLY=true | Explicitly prohibit real personal-data requests for a synthetic test provider |

If the outbound gates or keys are absent, adapters stay disabled. Default synthetic deployments do not send to external recipients. Actual account quotas, template status/capabilities, data-transfer approvals, providers and deliverability require KNABA DE credentials and a named approved test recipient.

## Evidence and remaining live checks

`tests/communications.test.ts` checks membership/history isolation, versioned translations, corrections, callback binding, human ownership, window/consent, reminder limits and Berlin quiet hours. `tests/integrations.test.ts` checks raw-body signatures, contracts, UI limits, structured provider facts/negation/budgets, prompt data isolation, explicit send gates, Maps fallback and worker queue contracts. Its PostgreSQL cases require DATABASE_URL and test concurrent leasing, expired-lease recovery, stale completion rejection and reboot with a disabled translator. Provider HTTP fixtures are synthetic adapters, not evidence of Meta/DeepSeek live approval.

A real Meta webhook/send/status roundtrip, approved template beyond 24 hours, real DeepSeek evaluation in all languages, model-region verification and account-media retrieval remain BLOCKED_EXTERNAL until actual keys, approvals and allowed recipients are supplied. Consult the release evidence for executed test results and SHA rather than treating this runbook as a claim that live tests passed.
