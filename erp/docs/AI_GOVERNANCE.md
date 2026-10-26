# AI budgets, usage and synthetic playground

Requirements: KNABA-R-09-005 and KNABA-R-09-011; master specification §§9.2–9.5. Contracts live in [commerce.ts](../packages/domain/commerce.ts) and [assistant-playground.ts](../packages/integrations/assistant-playground.ts). These additions do not authorize real provider transfer or business actions.

## Draft playground

`assistant.playground` requires `assistant.manage` plus a current active internal OWNER, DIRECTOR, OPERATIONS_MANAGER or BOT_ADMIN user. Permission and company are checked again against the user in the current transaction; mixed external roles are denied. OWNER and OPERATIONS_MANAGER need an explicit permission when their canonical role does not grant it. The selected configuration can be DRAFT, PREVIEW, REGRESSION_TESTED, APPROVED, ACTIVE or RETIRED; no activation is needed.

Input:

```json
{
  "configId": "selected-config-id",
  "configVersion": 1,
  "synthetic": true,
  "messages": [{"language": "DE", "text": "Synthetische Anfrage"}],
  "scenario": "AUTO",
  "toolProposals": []
}
```

Messages are bounded to twenty entries of 4,000 characters. DE/UK/RU/PL/LT/EN are supported when allowed by the selected configuration. Scenarios are AUTO, GREETING, SERVICE_SEARCH, CLARIFICATION, HANDOFF and PROMPT_INJECTION. Closed tool proposals use the same argument schemas as the runtime, with a maximum of six proposals. Only `searchApprovedServices` and `getServiceQuestions` simulate reads over approved active configured services. Pricing, private customer reads, lead/issue creation, confirmations and handoff execution are closed, even when the configuration allows those tools.

The result declares `SIMULATED`, `DETERMINISTIC_POLICY_AND_STATIC_TOOLS`, `providerInvoked:false`, `businessEffectsExecuted:false`, zero provider cost and `actualProviderUsage:null`. It returns fixed policy responses, proposed handoff and minimized current approved PUBLIC knowledge. Internal/personal documents, other customers, live conversation history and user prompts are not returned. This is a deterministic sandbox, not an LLM evaluation. It cannot approve a price, crew, date, payment or legal policy.

The pure simulator accepts no transaction, provider or command dispatcher. The Engine runs these commands in `SERIALIZABLE READ ONLY` with fresh authorization and a ten-second transaction deadline. It bypasses receipt/audit persistence for these two read commands; `add`, `save` and outbox writes are forbidden by PostgreSQL. The existing `assistant_config.preview` remains a separate lifecycle transition that persists the configuration preview; it is not this side-effect-free chat.

An eventual actual provider playground needs a separately approved, minimized read-only provider boundary, transfer authority, configured key, budget reservation and truthful provider evaluation. No such provider execution is represented by this simulation.

The operator console uses [AssistantPlayground.tsx](../apps/web/src/AssistantPlayground.tsx): select a current configuration, write synthetic test messages in a supported language, acknowledge synthetic input, review the message list and run the simulation. Responses have a permanent SIMULATED badge and explicit provider/business-effect disclaimers. Chat input and results stay in component memory; identity/permission/configuration changes, authorization rejection, clear and logout discard them. No conversation is saved by this screen.

## Category budgets and reservations

AssistantConfig stores EUR integer cents and Europe/Berlin budget days:

```json
{
  "budgetCents": 10000,
  "currency": "EUR",
  "budgetTimeZone": "Europe/Berlin",
  "categoryBudgets": {
    "CUSTOMER_ASSISTANT": {"dailyCents": 1000, "totalCents": 6000},
    "INTERNAL_DRAFT": {"dailyCents": 500, "totalCents": 2000},
    "TRANSLATION": {"dailyCents": 1000, "totalCents": 6000}
  }
}
```

Every category must be present. Each daily limit is no larger than its total limit, and each total fits the global `budgetCents` ceiling. Zero disables expenditure. Old configurations without `categoryBudgets` derive each category's daily and total limit from their existing global ceiling; no database rewrite is performed by a read.

DAILY counts the category across the company, including other config IDs, by actual Europe/Berlin calendar date. TOTAL and the global ceiling keep the existing config-ID lifetime contract. A new approved configuration can establish a new lifetime budget, but cannot erase same-day company expenditure. Legacy records without a category count toward every category conservatively. Foreign-company records never count. DST changes follow Berlin calendar dates, not a fixed 24-hour window.

The worker calls `aiBudgetHeadroom(configEntity,usageEntities,category,nowISO)` inside its serialized company transaction before reserving. It records `category`, `currency`, `config_id`, `config_version`, `event_id`, `initial_reserved_cents`, `reserved_cents`, `status` and `started_at`. Only a positive reservation fitting daily, category total and global remaining amounts permits provider execution. Existing translation jobs use TRANSLATION; customer answers use CUSTOMER_ASSISTANT. Internal draft processing must explicitly use INTERNAL_DRAFT through the same reservation gate.

Known terminal costs can settle the reservation to `actual_cents`; RUNNING or unknown outcomes retain the conservative reservation. Settlements preserve the initial reservation and record available input/output token counts. Repeated/uncertain events do not become free retries. Currency mismatches, fractional/negative cost and corrupt metrics fail closed. The worker's configured token tariff uses `cost_basis:CONFIGURED_RATE_ESTIMATE`; it is not a provider invoice.

## Customer answer recovery and retry authority

The following behavior is implemented in source commit [`a10e70911fb519ec7d8199fa66141cd12b462926`](https://github.com/ziko1/knaba/commit/a10e70911fb519ec7d8199fa66141cd12b462926), Git tree `c62487ef71a88352df52bf5d396ce2b27f0bbd6c`. The implementation is in [WorkerRunner](../apps/worker/runner.ts) and the [Engine answer authority guard](../apps/api/engine.ts). This source binding describes the contract; it does not certify deployment, real provider operation or supplier billing. Execution results belong to the separate [exact-source recovery receipt](evidence/assistant-replay-20261011/verification.json); source inventory alone is not execution evidence.

### Current job, service and source authority

Every customer-answer attempt first checks its actual company-scoped SQL outbox row: `assistant.answer_requested`, the complete persisted job payload, `RUNNING` status, matching lease token and an unexpired lease. The current canonical `knaba-integration-service` user must be active, retain `SERVICE_ACCOUNT` and have effective `integration.process` permission. A substituted payload, another job type or an expired/replaced lease cannot authorize new work or an answer replay.

Before new provider work, tool effects or a new reply, the worker rechecks the current configuration, original message, requester and channel. The configuration must remain ACTIVE at the requested configuration version; the undeleted original must belong to the exact requester and channel; the requester must still be able to read it. Only `PRIVATE_CUSTOMER_ASSISTANT` and `SITE_CLIENT` channels with `AI_ACTIVE` ownership qualify, and a linked lead must also remain `AI_ACTIVE`. Prepared configuration, channel and message entity versions are checked again at the next protected boundary. Revocation or intervening source changes cannot be overridden by a previously prepared answer or reserved budget.

Existing worker memberships must still be active, current and able to read the original message. Revoked, removed, left, inactive or expired access is not silently replaced by another worker-created membership. First enrollment is available only when the channel has no historical membership entry for that service user. An independently restored effective membership is evaluated through the same current access rules.

For a new `message.send` with `source:AI`, the Engine requires the canonical service, exact leased answer job, matching channel/reply target and exactly the current channel, configuration and original-message preconditions. The configuration is usable only for this bound send; the service does not gain ordinary administrative configuration visibility. Source authorization is rechecked before a cached Engine send receipt can be returned. Provider calls and private customer context remain separate from these server decisions: the model cannot grant permissions, confirm business actions or determine financial amounts.

### Persisted reply receipts

The worker checks for its deterministic `message.send` receipt after validating the genuine job and canonical service authority. The receipt must describe an AI message by that service in the exact company and channel, replying to the job's original message. Because the reply and receipt commit in the same business transaction, a valid receipt establishes that this answer already persisted.

When a queue item is reclaimed after that commit, the answer handler does nothing further: no provider request, new reply, additional receipt, cost rewrite or artificial human handoff. This worker completion path returns no private message content and does not recreate edited or erased content. New source processing and disclosure remain subject to their current access checks; a queue completion marker is not a fresh permission grant.

Reply persistence and cost settlement are separate facts. If the reply committed and the worker then failed before cost settlement, recovery preserves the existing unresolved reservation. It must not infer a zero charge, invent a refund, repeat the provider request or create a handoff merely because the cost record remains `RUNNING`.

### Safe cancellation retry and durable provider marker

A previous reservation permits a fresh attempt only when all of these persisted conditions hold: the exact answer event has **one** usage record; it belongs to the same configuration and `CUSTOMER_ASSISTANT` category; its status is `CANCELLED`; `provider_invoked` is explicitly `false`; and both `actual_cents` and `reserved_cents` are exactly zero. Current job, service, source, transfer authority and all budget limits are checked again. The same usage aggregate is revised, its previous cancellation stays in aggregate history, `reservation_attempt` increases and `reservation_lease_hash` binds the new reservation to the current lease. Multiple or uncertain records do not qualify.

Immediately before the first adapter call, a serialized company transaction rechecks the source and lease, confirms the matching `RUNNING` reservation, and records `provider_invoked:true` with `provider_started_at`. The marker is a conservative dispatch boundary: a crash after it means the provider **may** have been invoked. It is not proof of provider acceptance, delivered output or a real supplier charge. Recovery must retain that uncertainty rather than resetting the marker to obtain a free retry.

The reservation and settlement outcomes are:

| Persisted condition | Recovery behavior | Cost treatment |
| --- | --- | --- |
| Valid completed reply receipt | Complete the answer handler without another provider call, reply or handoff | Preserve its settled cost or unresolved reservation |
| Exactly one matching `CANCELLED` record with explicit no-call and zero amounts | Retry only after fresh authority and budget checks | Reserve anew on the same aggregate; retain cancellation history |
| Existing `RUNNING` or uncertain provider outcome without a completed reply | No repeat provider call; request human review only while current handoff authority permits it | Retain the conservative reservation |
| First provider round known, second round uncertain | No partial settlement based only on the first round | Retain the full reservation for the combined unknown outcome |
| Known provider result followed by lease loss or revoked business authority | Suppress unauthorized reply/tool effects | Settle only known available usage against the reservation still owned by that attempt |

### Settlement ownership and remaining uncertainty

Settlement compares the attempt's lease hash with `reservation_lease_hash`. A late old-attempt settlement cannot overwrite the reservation that a safe successor has acquired. Even the matching current attempt cannot apply a zero-cost `CANCELLED` settlement once `provider_invoked:true` is durable. These checks leave the protected aggregate, revisions and reserved amount unchanged.

A legitimate late provider result may still settle its original reservation after the queue lease has changed, provided that reservation has not been assigned to a new attempt. This accounts for an already incurred outcome without authorizing another message, handoff or business action. If the provider result is unavailable, cost and token fields stay explicitly unresolved and the reservation remains. The worker's amounts continue to be configured-rate estimates with `provider_reported_cost_available:false`; reconciliation to a real model-provider invoice is a separate operation.

## Director usage view

`assistant.usage` requires `assistant.manage` and a current active internal OWNER, DIRECTOR or OPERATIONS_MANAGER. BOT_ADMIN alone cannot access this director view. The query is bound to the current company. It does not grant broader finance, payroll, GPS or company-scoped permissions.

Optional input is `{from,to,configId}`. The default is thirty days ending now; maximum span is 93 days. The interval is `[from,to)`. SQL selects only metric fields, limits the result to 10,001 rows and rejects a result exceeding 10,000; it never returns a silently partial total. Narrow the reporting period when that bound is exceeded.

The output includes category totals, counts/statuses, original reserved cents, known settled cents, retained uncertain reservation, available token counts, explicit unknown cost/token record counts and effective configured budgets. Missing provider metrics remain unknown. Cost-basis counts distinguish configured-rate estimates, explicitly provider-reported amounts and undeclared legacy records. `supplierStatus:NOT_RECONCILED_TO_PROVIDER_INVOICE` prevents interpreting these values as verified supplier billing. Key status reports only presence and `validation:NOT_CHECKED`; the key, prompts, responses, actor IDs and private customer data are absent. No provider call runs to produce this view.

[AIUsagePanel.tsx](../apps/web/src/AIUsagePanel.tsx) provides bounded UTC date filters, configuration choice, loading/error/retry/empty states, category consumption and token totals, uncertainty counts and configured budget caps. The selected reporting interval is shown separately from lifetime/daily caps; it does not invent remaining budget from an arbitrary interval. Key presence is displayed without its value or an unperformed provider validation.

## Verification scope

[assistant-governance.test.ts](../tests/assistant-governance.test.ts) exercises actual handlers with mutation-forbidden transactions, network spies, all closed business/private tools, source ACL filtering, prompt injection, six languages, fresh authority, Berlin/DST budget boundaries, legacy costs, exact cents and safe usage projection. Tests are CPU/domain/transport-boundary checks.

[assistant-governance.integration.test.ts](../tests/assistant-governance.integration.test.ts) contains seven genuine PostgreSQL cases: actual Engine read-only mode and zero changed business/history/audit/receipt/outbox/blob rows for both commands; PostgreSQL denial of add/save/event; fresh metrics under a reused read key; revoked-role denial. These tests are skipped without DATABASE_URL. Their presence does not establish a PostgreSQL pass, a provider evaluation or production approval.

At the source commit above, [assistant-answer-replay.integration.test.ts](../tests/assistant-answer-replay.integration.test.ts) contains **13 genuine PostgreSQL recovery cases** covering completed-reply replay, reply-before-settlement failure, explicit no-call cancellation retry, uncertain provider outcomes, forged sources/types/leases, current authority revocation, old-attempt settlement fencing and rejection of cancellation after the provider marker. The cases exercise actual WorkerRunner/Engine transactions, receipts, lease reassignment, usage records and historical revisions. External provider responses and explicit crash/scheduling boundaries are controlled test doubles.

[assistant-runtime.integration.test.ts](../tests/assistant-runtime.integration.test.ts) contains **46 genuine PostgreSQL runtime cases** with actual Engine, controller authentication, queue leasing, WorkerRunner and DeepSeekAdapter execution. External AI requests and Express transport objects are explicit doubles. It covers the customer draft/tool flow, current source and worker authority, membership revocation, reservations cancelled before transfer, late known costs and the full retained reservation after an uncertain second provider round. [assistant-answer-authority.integration.test.ts](../tests/assistant-answer-authority.integration.test.ts) separately checks the exact Engine send authority without granting broad configuration access. Case counts describe the source inventory, not execution results. Without `DATABASE_URL` these SQL cases are NOT_RUN; even an actual PostgreSQL pass does not demonstrate private data transfer to a real model, a real supplier bill, live delivery or production acceptance.
