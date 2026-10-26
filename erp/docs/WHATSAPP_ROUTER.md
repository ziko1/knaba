# Manual WhatsApp business router

The verified staff bot executes existing canonical commands. `packages/integrations/whatsapp-router.ts` contains the durable orchestration; it does not use AI, bypass the Engine, send messages itself, grant roles, publish client media, execute server code, or activate GPS. `whatsapp-router-text.ts` holds DE/UK/RU/PL/LT/EN menus and exact standalone command aliases. Normal chat sentences and quoted START/END remain original text. In a selected named chat, a bare START is message text; `/MENU` switches context.

Implemented vertical flows:

| User flow | Canonical command/effect | Confirmation and limit |
| --- | --- | --- |
| START | `shift.start` at an explicitly selected assigned site | Preview; site-version guard; no GPS activation |
| BREAK / RESUME / END | `shift.activity`, `shift.end`; during a trip `trip.stop` / `trip.resume` | Preview; current shift/trip guards; no inferred lunch/start from a location |
| HOURS | `shift.summary` | Own active shift; exact server seconds with separate work/travel/break/pending counters |
| TRAVEL | `trip.start` with selected allowed SITE/WAREHOUSE and original purpose | Preview; no private home destination, Maps forecast or fabricated track |
| Arrival | `trip.arrive` | Arrival alone keeps WAITING_WORK; arrival + start work is a distinct explicit selection |
| Material request | `request.create`, then separately `request.submit` | Exact canonical unit conversion; supplied due timestamp and original reason; draft is identified as draft; no stock movement/approval |
| Own payout | `payout.ack` FULL/PARTIAL/DISPUTED | Own amount/method/ID and personal statement preview; EUR integer cents; immutable receipt; no director acknowledgment on behalf of employee |
| Own task | `task.start` / `task.submit` | Exact selected task; result description preserved; submission creates review state, not acceptance |
| Corporate chat | `message.send` | Explicit named permitted channel; version/current ACL and reply-context validation; original text and original-language metadata |
| Prepared media | `media.register` | Own CLEAN upload → explicit assigned site → task/site-only → BEFORE/AFTER/DEFECT/MATERIALS/DOCUMENT → confirm; INTERNAL only; original caption retained |
| Bot administration | Authenticated `/app` link with module name | Current admin permissions; select the named module in the console, whose default screen remains role-specific; privileged changes require portal reauthentication/MFA under Engine policy |
| LANGUAGE | Own durable language preference | Explicit choice; never inferred from a phone number; original text unchanged |
| OPTIN / STOP | `notifications.configure` | Explicit signed own request; work delivery consent only, no marketing consent; STOP does not stop a shift |

Unsupported financial/admin changes, unverified media, private customer media requiring published issue context, and complex evidence/approval forms use the authenticated web cabinet. Unknown free text returns `handled:false` for the existing conversation/handoff path. Actual provider capability and delivery remain separate external checks.

## Durable contracts

`new WhatsAppRouter(db, engine, options)` accepts the current Database and Engine structurally. Options include `mode`, `publicOrigin?`, `systemActorId?`, `testRecipients?`, `now?`, `actionTtlSeconds?` (30–900, default300), and explicitly verified `capabilities? {accountVerified,buttons,lists}`. Default capabilities render text with durable numbered choices. Input prompts use `/CANCEL` and `/MENU` so typed money/quantities do not collide with numbered choices. Verified interactive screens obey ≤3 buttons and ≤10 list rows; selectable lists paginate with eight business rows and navigation.

`route(companyId, conversationInputId)` loads the durable `conversation_input` directly. It requires provider WHATSAPP, exact matching provider event ID, and a fresh active verified unique contact identity bound to that actor. It never trusts a user ID supplied by a callback. `conversation_input.data.upload_id` may refer to the scanner-prepared own `media_upload`. Return value is `{handled,state?,responseId?,command?,error?}`. Invoke after `notifications.inbound` and before the old callback/media/text branches; on `handled:false` keep the existing path. Foreign nonrouter callbacks remain available to `callback.consume`.

Persisted aggregates are `whatsapp_router_session` (own current page, language, pending/suspended flow, page generation), `whatsapp_router_action` (opaque token hash, own identity, TTL, page, guards, command plan, claim/result), and `whatsapp_router_response` (own recipient/output/refs/current authorization prerequisites). These remain private under default-deny entity reads. Responses enqueue `whatsapp.router_response {response_id}` transactionally. They are sensitive derivative copies and must participate in the company's specific retention/erasure policy; expired actions cannot authorize a command.

Every mutating preview captures entity versions; internal Engine `preconditions` recheck all relevant versions inside the command transaction. The public HTTP envelope does not accept these internal guards. A CLAIMED router-action guard validates the action expiry and the fresh unique verified nonrevoked unexpired sender-to-actor contact binding inside that serialized transaction after receipt replay. A rebind, revocation, expiry or ambiguous second owner between claim and execution must abort before the handler changes data. Primary entity `expected_version` remains enabled where applicable. Confirmations execute under the fresh human actor, never the integration service account. Each action has one stable Engine idempotency key. A claimed action from another event cannot run twice. Same source replay reuses its existing result. If the transport loses the response after a command commit, the input remains PENDING/action CLAIMED and the same receipt can recover safely after restart. A repeated completed action reports that it was already processed. Unknown transport errors are retried, never asserted to mean no business effect.

`prepareResponse(companyId,responseId)` is the immediately-before-send boundary. It rechecks current actor, unique active identity, role, subject/channel/source visibility, page generation, TTL, opt-in, opt-out, exact24-hour policy and nonproduction recipient allowlist. It returns `{allowed,to,output,policy:{kind:'TEXT'},response}` or a blocked/cancelled reason. It does not claim or send. Full free-text menus outside the window are BLOCKED; they are not embedded in a generic approved template.

Root worker must persist response SENDING before provider I/O, then API_ACCEPTED/provider_message_id or FAILED/PROVIDER_OUTCOME_UNKNOWN. It must never automatically repeat an uncertain SENDING result. Meta sent/delivered/read status processing remains a separate signed webhook step; API_ACCEPTED is not business completion or employee receipt. No simulated adapter result is a live Meta acceptance.

## Executed evidence

`tests/whatsapp-router.test.ts` runs actual canonical domain handlers using a serialized synthetic memory persistence/receipt harness. `evidence/router-deepseek-offline-result.json` records the current router and adapter case counts and result; the earlier router-only report is historical. Covered outcomes include repeated/concurrent confirms, loss after actual handler commit and receipt replay, exact TTL, edited preview/source, revoked role/scope/identity/channel, identity rebind/revocation/expiry/ambiguity strictly between claim and command execution, language/original separation, unsupported instruction boundaries, typed amount/menu collision, work/travel chronology, exact material units, own immutable payout receipt, selected task review, explicit INTERNAL media, outbound opt-in/window/test-allowlist and deferred durable replies.

These are CPU/domain/orchestrator tests. They are not real PostgreSQL isolation, signed live Meta ingestion, external provider delivery, physical GPS, legal approval or deployment evidence. Root integration, full build, real SQL/router worker scenarios and actual approved Meta account delivery must be recorded separately.
