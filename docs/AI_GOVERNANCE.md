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

## Director usage view

`assistant.usage` requires `assistant.manage` and a current active internal OWNER, DIRECTOR or OPERATIONS_MANAGER. BOT_ADMIN alone cannot access this director view. The query is bound to the current company. It does not grant broader finance, payroll, GPS or company-scoped permissions.

Optional input is `{from,to,configId}`. The default is thirty days ending now; maximum span is 93 days. The interval is `[from,to)`. SQL selects only metric fields, limits the result to 10,001 rows and rejects a result exceeding 10,000; it never returns a silently partial total. Narrow the reporting period when that bound is exceeded.

The output includes category totals, counts/statuses, original reserved cents, known settled cents, retained uncertain reservation, available token counts, explicit unknown cost/token record counts and effective configured budgets. Missing provider metrics remain unknown. Cost-basis counts distinguish configured-rate estimates, explicitly provider-reported amounts and undeclared legacy records. `supplierStatus:NOT_RECONCILED_TO_PROVIDER_INVOICE` prevents interpreting these values as verified supplier billing. Key status reports only presence and `validation:NOT_CHECKED`; the key, prompts, responses, actor IDs and private customer data are absent. No provider call runs to produce this view.

[AIUsagePanel.tsx](../apps/web/src/AIUsagePanel.tsx) provides bounded UTC date filters, configuration choice, loading/error/retry/empty states, category consumption and token totals, uncertainty counts and configured budget caps. The selected reporting interval is shown separately from lifetime/daily caps; it does not invent remaining budget from an arbitrary interval. Key presence is displayed without its value or an unperformed provider validation.

## Verification scope

[assistant-governance.test.ts](../tests/assistant-governance.test.ts) exercises actual handlers with mutation-forbidden transactions, network spies, all closed business/private tools, source ACL filtering, prompt injection, six languages, fresh authority, Berlin/DST budget boundaries, legacy costs, exact cents and safe usage projection. Tests are CPU/domain/transport-boundary checks.

[assistant-governance.integration.test.ts](../tests/assistant-governance.integration.test.ts) contains seven genuine PostgreSQL cases: actual Engine read-only mode and zero changed business/history/audit/receipt/outbox/blob rows for both commands; PostgreSQL denial of add/save/event; fresh metrics under a reused read key; revoked-role denial. These tests are skipped without DATABASE_URL. Their presence does not establish a PostgreSQL pass, a provider evaluation or production approval.
