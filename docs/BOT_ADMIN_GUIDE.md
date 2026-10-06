# Bot and assistant administration

The editor is a persisted, versioned policy lifecycle, not a free-text authorization console. Use the current [authorized command schemas](API_CONTRACTS.md) and [role matrix](ROLE_MATRIX.md). Configuration preview, deterministic regression, approval, activation, provider evaluation and company production release are different events.

## Establish a safe company baseline

Configure the legal company, actual public origin, current owner/roles, confirmed service catalogue, territories and approved legal/tax templates. Do not turn the synthetic seed into real company facts. Secret keys remain in the deployment's secret manager. No frontend environment variable or knowledge document should contain an API key, password, employee payroll or raw route history.

Create/approve services and an effective price book. Prices are integer cents from the server calculator; templates use an explicit VAT/EXEMPT/REVERSE_CHARGE scenario, display policy and recorded approval. GUIDED is the default. DELEGATED_STANDARD needs a preapproved catalogue, current prices, amount/discount/territory/template rules and verified scope/measurements. It never confirms staffing. A nonstandard request returns to a human.

Record actual external reviews through `legal_approval.record`, preserving reviewer/evidence/scope/time/expiry. An ordinary text reference or this guide does not establish company authority. Required subjects include TAX_PROFILE, QUOTE_TEMPLATE and AI_TRANSFER; GPS has four separate subjects described below. Revoking or expiring a review closes dependent actions.

## Assistant version lifecycle

1. `assistant_config.create`: create a new draft with allowed services/territories/knowledge IDs, language/tone/formality/greeting, escalation/human-hours policy, answer-length/tool boundaries, provider/model/timeout/budget and transfer approval. Only approved referenced knowledge is selectable.
2. `assistant_config.preview`: inspect the diff from the active version and representative messages. It invokes no provider and sends no customer message.
3. `assistant_config.regression`: run deterministic policy checks. The record explicitly labels provider evaluation NOT_RUN_REQUIRES_CONFIGURED_PROVIDER; this does not prove a model's multilingual safety or quality.
4. `assistant_config.approve`: authorized high-risk approval; a non-disabled provider needs current AI_TRANSFER review and the correct company mode.
5. `assistant_config.activate`: activate exactly that approved version and retire the prior version. New answers use the current version; existing quotes retain their snapshots.
6. `assistant_config.rollback`: explicitly restore a previously tested/approved suitable version with a reason and current gates. Do not delete the intervening history.

The schema fixes server-side authority, a tool allowlist, ACL-before-retrieval, server-only prices and handoff suppression. Text cannot enable arbitrary SQL, employee ranking, financial authorization, report publication or GPS. Configuration budget is enforced separately from secret/provider provisioning. Disabled/missing/failed provider produces an honest fallback and human decision, preserving the original request.

## Knowledge and translation

Use `knowledge.create` with title/content/source, owner, language, effective dates, PUBLIC/INTERNAL/PERSONAL visibility and site/person limits. Approval is separate; replacement supersedes the prior version. Search filters current approval/expiry/ACL before returning text. Canonical staff roles use assigned site scope for INTERNAL knowledge; any customer/external role keeps the actor outside internal retrieval. PERSONAL entries are available only to their subject, including for managers. Public customer knowledge must not contain staff salary, private chat, personal contact details or route history. Keep source/version/effective date so an answer can be assessed against current facts.

Use `glossary.configure` for confirmed multilingual business terms. Preserve German floor labels, object codes, quantities, currency, negations and uncertainty. Translation is requested against an authorized original/version; editing the original invalidates old context/cache. Provider failure retains original plus status rather than inventing a fluent result. A human-owned conversation may still use authorized translation while automatic assistant replies remain suppressed.

## Human handoff and inbox

A visitor can request a human. `lead.handoff`/channel handoff create HANDOFF_PENDING with reason/context; `lead.claim` or `handoff.take` assigns an authorized operator and HUMAN_ACTIVE. Pending jobs recheck current ownership and cannot answer behind the operator. The original customer text remains available with minimal German summary/sources. `lead.resume_ai`/authorized return to AI requires a deliberate reasoned action. Ownership conflicts and stale versions should be resolved by reloading the current card.

Private web/WhatsApp guests never gain customer membership merely by stating an address, account number or matching name. Grant verified membership and explicit VIEW/ACCEPT_QUOTE/ACCEPT_CHANGE/REPORT_ACK/HOURS_APPROVE/WORK_ACCEPT capabilities through the customer process. Current revocation applies to old chat links, callbacks and documents.

## Routine automation

`automation_rule.create` records trigger, exact filters, whitelisted action, owner/site/customer scope, cooldown, maximum attempts, active date/version and optional Europe/Berlin schedule. `automation_rule.preview` shows which supplied events match without effects; `automation_rule.activate` is a separate high-risk approval. The worker executes stable event/action IDs under current authority and records QUEUED/SUCCEEDED/FAILED/cooldown state.

Allowed actions are REMIND, CREATE_DECISION, DRAFT_REPORT, DRAFT_QUOTE, PROPOSE_CREW and DETECT_SHORTAGE. A proposal is not an assigned crew, a draft is not a published report/offer, and detected unreceived demand is not purchased stock. Financial/GPS/publication/arbitrary-command actions are excluded. The current executable cron subset supports one explicit daily/weekly minute/hour with `*` day/month, optional single weekday; unsupported schedules remain a configuration gap rather than silently executing differently.

Notifications obey recipient settings, current access, quiet hours, current object condition, opt-out and bounded attempts. Duplicate source events do not multiply logical effects. Cancel stale reminders when an order is rescheduled or its condition resolves. Review typed failed/dead-letter records and provider outcomes before retrying; an uncertain network send needs reconciliation.

## Provider setup and actual evidence

The worker uses the same DATABASE_URL, COMPANY_ID and APP_MODE as the API. AI activation requires configured `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_REGION`, approved model/transfer metadata, budget/pricing configuration and permitted test data. WhatsApp send adapter requires explicit `LIVE_SEND_ALLOWED=true`, configured access token/phone/API version and verified account capabilities; nonproduction sends also require a permitted `WHATSAPP_TEST_RECIPIENTS` number. No allowed recipient is currently recorded. The inbound webhook requires separate verify token/app secret and exact raw HMAC validation.

Configure provider values through secret storage without exposing them in logs. Tokens merely present in environment produce configured/pending status, not live acceptance. Verify official Meta ownership/templates/window/opt-in and test each allowed recipient only within recorded authorization. At provider failure the web/app originals and deterministic core remain available. See [the single prerequisite list](EXTERNAL_PREREQUISITES.md), not an invented provider-ready badge.

Before real AI use, separately record German/Ukrainian/Polish/Lithuanian and other required language examples: numbers/units/negations/floors, uncertain measurements, prompt injection, missing-source refusal, budget/timeout, handoff suppression and prohibited personal/financial/GPS requests. Deterministic regression does not replace this evaluation or the company DPA/transfer review.

## GPS and operational administration

GPS policy management/history are explicitly granted to another authorized staff identity by an OWNER under recent MFA; neither OWNER nor BOT_ADMIN receives them automatically. Self-escalation and grants to customer/external roles are rejected. GPS policy management is separately authorized. The active policy needs unexpired recorded GPS_LEGAL_PROCESS, GPS_NECESSITY, GPS_WORKS_COUNCIL and GPS_EMPLOYEE_NOTICE approvals, correct scope and MFA. Production cannot use synthetic review records. Presence is minimal; detailed route is restricted to an explicit permitted business trip. Changing bot text cannot bypass this gate. Company retention/appeal/access requirements and physical device evidence remain outstanding until signed off.

Invite verified users using bounded roles/sites/warehouses, activate once, and review actual rights rather than assuming OWNER/BOT_ADMIN has every permission. Role changes/disablement revoke sessions; device replacement revokes old bearer access. Preserve the last active owner and prohibit self-escalation. Use [technical audit](API_CONTRACTS.md) for changes; do not erase failed history to make a dashboard look healthy.

Governance commands provide bounded separately approved operational delegation and own reviewed privacy export/retention/hold/evidence workflows. Sensitive GPS/finance/identity/privacy authority cannot be delegated. Recorded erasure evidence remains unverified and never claims automatic deletion; see [GOVERNANCE](GOVERNANCE.md).

For release, compare deployed `/version` with the tested exact SHA, validate `/api/v1/ready`, run authorized positive/negative flows and record worker/reboot/restore evidence. Confirm company key/data/hosting ownership and support contacts through [handover](HANDOVER.md). Synthetic staging permission does not authorize company production or real financial/customer side effects.
