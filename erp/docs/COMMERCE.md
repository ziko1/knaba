# Commerce, dispatch and assistant policy contracts

`packages/domain/commerce.ts` exports `commerceCommands`. The shared engine validates each Zod schema, checks the named permission and MFA for high risk commands, serializes the company transaction, enforces idempotency and commits aggregates, audit and outbox atomically. Domain handlers validate object references, customer/site/own scopes, exact versions and business state. Company boundaries are enforced by Transaction; IDs from another company produce NOT_FOUND_SAFE. All schemas reject unknown fields. Prices supplied by callers are rejected; only approved PriceBook rates are authoritative.

## Canonical storage and units

Singular aggregate kinds are `service`, `price_book`, `lead`, `quote`, `quote_acceptance`, `change_order`, `dispatch_request`, `schedule_reservation`, `crew_assignment`, `order`, `customer`, `customer_membership`, `site_visit_request`, `decision`, `assistant_config`, `knowledge`, `automation_rule`, `automation_run`. QuoteVersion is represented by a distinct immutable quote ID for each `quoteVersion`; approval/delivery/acceptance change workflow metadata, while a revised scope creates a new ID. PriceBook updates create a new aggregate and retire the previous active named edition. Issued quotes retain their original service/rate/tax/contact/facts snapshots when a price book or customer changes.

Amounts are integer EUR cents; quantities are thousandths of a clearly specified business unit (`PERSON_HOUR`, `M2`, `UNIT`, `FIXED`). A fixed line has quantity 1000. Half-up rounding happens once per line and once on aggregate tax; BigInt multiplication prevents floating point accumulation. Discounts are basis points. Three people working two hours is 6000 person-hour quantity, never 2000. Included lines have zero additional amount. The calculator never reads payroll. Negative change orders can reduce a contract but cannot make its final sum negative.

A tax profile must explicitly identify `VAT`, `EXEMPT` or `REVERSE_CHARGE`, `rateBps` and `NET`/`GROSS` display. Exempt/reverse charge charge zero tax. Activation requires an active APPROVED `legal_approval` with matching subject TAX_PROFILE. Templates require subject QUOTE_TEMPLATE. External AI transfer requires subject AI_TRANSFER. An approval's expiry is enforced. Synthetic test profiles are accepted only when the canonical company entity has operatingMode DEMO or TEST. The test rate of 19% is never a production default; deployment must seed company mode deliberately.

## Command API

All commands are invoked through the shared `/api/v1/commands/:command` envelope. `expected_version` applies to the command's principal entity. A quote's public `quoteVersion` is separate from aggregate optimistic version. `idempotency_key` identifies the logical request across channels.

| Commands | Permission | Main payload |
|---|---|---|
| service.create / update | commerce.manage | name, description, unit, model, active, included, excluded, questions, requiredSkills, requiresVisit; update adds id |
| service.list / questions | commerce.read | {} / {id} |
| estimate.calculate | commerce.read | priceBookId, lines[{serviceId,quantityMilli}] |
| price_book.create | commerce.manage | name, validFrom, validUntil?, tax, rules[{serviceId,rateCents,minimumQuantityMilli?,minimumCents?,included?}], mode, delegation? |
| price_book.approve / activate | commerce.approve, MFA | id |
| customer.create | commerce.manage | name, type, contact, businessCode? |
| customer.membership.grant / revoke | customer.manage, MFA | customerId,userId,siteIds,permissions,verifiedIdentityId / id,reason |
| lead.create | lead.create | contact{name,email? or phone?},serviceIds,source{channel,campaign?,landingPage?,referralCode?},facts?,language?,customerId?,newRequest? |
| lead.qualify | lead.manage | id,facts,needsVisit?,reason? |
| lead.handoff / claim / resume_ai | lead.manage / lead.handoff | id,reason,summaryDE,unresolved?,documentIds? / id / id,reason |
| lead.close / decline_upsell | lead.manage | id,status LOST or WITHDRAWN,reason / id,serviceId |
| site_visit.create | lead.manage | leadId,reason,requestedAt? |
| quote.create / revise | quote.create | leadId,priceBookId,lines,expiresAt,scope,included?,excluded?,legalTemplateId,pricingModel FIXED or TIME_MATERIAL,discountBps?,certainty?; revise adds old id |
| quote.approve | quote.approve, MFA | id,reviewReason |
| quote.send | quote.send | id |
| quote.accept / reject | quote.accept | id,quoteVersion,acceptanceEvidence? / id,quoteVersion,reason |
| quote.expire / get | quote.manage / commerce.read | id |
| change_order.create | quote.create | orderId,reason,scopeAdded[],scopeRemoved[],deltaNetCents,expiresAt,scheduleImpact,legalTemplateId |
| change_order.approve / accept | quote.approve, MFA / quote.accept | id,reviewReason / id,acceptanceEvidence? |
| dispatch.reserve / recommend | dispatch.manage / dispatch.read | orderId,employeeIds,startAt,endAt,ttlMinutes? / orderId,startAt,endAt |
| dispatch.assign | dispatch.manage, MFA | orderId,reservationId,siteId,foremanId?,requireEmployeeAck?,materialRequirements[] |
| dispatch.reschedule | dispatch.manage, MFA | assignment id,startAt,endAt,reason |
| crew_assignment.acknowledge / start | dispatch.acknowledge | id,employeeId |
| order.transition | dispatch.manage | id,status,reason |
| decision.create / resolve | decision.manage | reason,ownerId,siteId?,orderId?,sources[],dueAt?,amountCents?,actions[],summaryDE / id,action,reason,ownerId? |
| customer.portal | customer.read | customerId,siteId? |
| assistant_config.create / preview / regression | assistant.manage | versioned policy fields / id,messages[] / id |
| assistant_config.approve / activate / rollback | assistant.approve, MFA | id / id / id,reason |
| knowledge.create / approve / search | assistant.manage / assistant.approve, MFA / assistant.read | title,source?,content,ownerId,language,validFrom,validUntil?,visibility,siteIds?,subjectUserId?,supersedesId? / id / query,limit? |
| automation_rule.create / preview / activate / run | automation.manage / automation.manage / automation.approve, MFA / automation.execute | typed rule / id,events[] / id / id,event{id,type,data} |

`lead.facts` accepts only relevant qualification data: customerType, propertyType, condition, address/area, quantityMilli, measurementSource, desiredPeriod, recurring, access, restrictions, locations, photoIds. Customer-stated measurements stay labeled CUSTOMER_STATED. Missing qualification facts preserve QUALIFYING. Professional uncertainty or a service requiring inspection creates SITE_VISIT_REQUIRED and a manager decision. Marketing consent starts false. Declined upsells are remembered. Repeated START resumes the same authenticated person's open request for the same services; a different identity never merges on name, email text, IP or phone supplied in a message. Channel source attributes are stored only when supplied.

## Approval, acceptance and fixed price

GUIDED is the default. A typed calculator prepares DRAFT; a permitted person approves its template and exact version before sending. DELEGATED_STANDARD automatically approves only when an already approved policy covers the amount range, maximum discount, template, territory, verified measured inputs and active service rates. Fixed services with exactly one unit need no physical measurement. A failed condition produces a human review decision and a DRAFT. Delegation never assigns resources or promises a time.

Accept requires the exact current SENT version before expiry. A superseded, draft, expired or rejected version cannot accept. A repeat ACCEPT returns the original logical order/dispatch and never creates a second one even with a different delivery callback. Managers recording acceptance on behalf of a customer supply acceptanceEvidence. Customer identities need an active membership with ACCEPT_QUOTE, or ownership of their isolated authenticated lead for a first acceptance. Staff recordings do not create a customer membership for the staff member.

Acceptance creates one PENDING_OPERATIONS order, DispatchRequest, QuoteAcceptance and open director decision, with the honest message that team and time remain unconfirmed. Quote acceptance is separate from work acceptance, reports, timesheets and payment. FIXED order finalNetCents is baseNetCents plus accepted ChangeOrder amounts. Raw hours, materials, rejected/draft changes and internal payroll cannot increase it. ChangeOrder requires internal approval and then an authorized customer acceptance; repeats add zero extra. Customer projection separately shows initial agreed amount, accepted additions, final agreed amount, invoiced, paid and balance.

## Dispatch and operations boundary

ScheduleReservation carries a TTL (1–120 minutes); only active nonexpired reservations and active CrewAssignments block overlap. Company transaction serialization and optimistic checks guarantee one conflicting operation succeeds. The employee record has `userId`, `active`, approved skill objects `{id,verified,expiresAt?}` and optional absences `{startAt,endAt}`. Required service skills must be represented by a verified nonexpired crew skill. Recommendations use availability, absence, schedule conflict and explicit skills only, never AI ranking or protected traits. No availability is invented when the candidate list is empty.

Assign consumes a reservation, validates the existing site's customer, updates the single order and lead, grants each worker the site scope, and creates canonical operations tasks (`state`, `assigneeIds` containing USER IDs, `plannedQuantityMilli`, review metadata). It creates explicit material requirements and emits one dispatch event. Existing tasks for an order/quote line are deduplicated. The existing site/location tree is retained; creating a complex site/tree uses operations commands before assignment.

`requireEmployeeAck` defaults true. ASSIGNED is separate from ACKNOWLEDGED/STARTED. Client schedule confirmation is emitted only after all required employee acknowledgments. Rescheduling increments scheduleVersion, clears old confirmation/acknowledgments and cancels pending old order reminders. Worker acknowledgment resolves the employee entity to its own user identity. Decision resolution records the human choice and history; resource, financial and publication actions still execute their separately authorized command.

## Customer privacy and knowledge

CustomerMembership is checked from current transaction records on every read/action, including repeats of old callbacks. Active membership identifies user/customer, optional restricted site IDs and explicit capabilities. Empty site list means all sites of that customer. A claim to be an existing customer, address or site ID grants no access. Membership activation requires verified contact_identity. Revoke emits an access revocation event and immediately blocks future portal/quote access.

Portal is an explicit projection. It contains own site descriptors, approved contractual amounts, confirmed schedule and published report references. It excludes payroll, cost/margin, personal worker contacts, private breaks, raw routes, internal comments and unapproved reports. Knowledge search filters APPROVED status, effective dates, visibility, user/site ACL *before* query matching or returning text. PUBLIC, INTERNAL and PERSONAL are distinct. Superseded knowledge stops retrieval; versions preserve evidence.

## Assistant versions and automation

AssistantConfig follows DRAFT → PREVIEW → REGRESSION_TESTED → APPROVED → ACTIVE → RETIRED. The schema fixes server authorization, tool allowlist, ACL-before-retrieval, server-only pricing and handoff suppression. It exposes language/tone, Sie/du, greeting, human hours/escalation, service/territory/knowledge selections, max response, provider/model/timeout/budget. An administrator cannot enable arbitrary SQL, payroll or GPS through a text field. Activation retires the old config; rollback requires prior deterministic regression and approved current knowledge/privacy gates. Existing quote snapshots are independent of configuration versions.

Preview displays a diff and deterministic nonproduction messages without provider/customer side effects. Regression performs **deterministic policy checks** for money, language policy, handoff, ACL, allowed tools, timeout/budget and output limits. It explicitly marks provider evaluation NOT_RUN_REQUIRES_CONFIGURED_PROVIDER. It is not evidence that a real model follows those policies in German/Ukrainian/Polish/Lithuanian. Real AI quality/privacy testing requires configured keys, approval and the external evaluation suite.

Automation rules carry typed trigger, exact filters, whitelisted routine action, schedule/timezone, owner/scope, cooldown, maximum attempts, active date and version. Preview never executes effects. Activation requires preview and separate approval. Rule/event ID deduplication produces one run. CREATE_DECISION is completed in-domain. REMIND, DRAFT_REPORT, DRAFT_QUOTE, PROPOSE_CREW and DETECT_SHORTAGE emit typed `automation.action_requested`; the worker must consume those through scoped handlers and may not treat queueing as completed execution. Financial, GPS, publication and arbitrary command actions are absent from this allowlist.

## Validation evidence and explicit limits

`tests/commerce.test.ts` contains synthetic adversarial tests for T-SALES-01..05, T-DISPATCH-01..04 and customer/knowledge/config/automation invariants. Root integration tests must additionally exercise concurrent PostgreSQL requests and external rendering/documents. This module does not imply external WhatsApp delivery, real legal validity, provider evaluation or physical dispatch verification.

External blockers: reviewed tax scenario and offer/change templates; verified real customer identities and acceptance process; employee verified skills, current availability/absence and travel buffer policy; transport/material capacity checks; legal AI transfer approval and provider key; provider multilingual evaluation; worker consumers for queued routine automation; production communication consent/templates. Test-only demo entities are visibly synthetic and must not become approved production rates/documents.

## Additional readiness controls

`service.approve {id}` records catalog approval (commerce.approve, MFA). Delegated automatic sending additionally requires approved services and exact canonical scope (joined service descriptions), included and excluded catalog lists. Arbitrary customer instructions or a changed description cannot be embedded as an extra promise in an automatically approved quote. `service.update` clears that approval by replacing the service data, so the next changed edition needs approval.

`employee.availability` (dispatch.manage) records reviewed windows, absences, travel buffer minutes, source and validUntil. Production reservations require a current reviewed availability record. A slot must fit a declared availability window; employee buffer separates incompatible slots. DEMO/TEST companies may use explicit synthetic availability fixtures. Skill evidence is an object with verified=true and expiry, never a caller's free-form string.

Material readiness is independent of the employee acknowledgment. `dispatch.materials.confirm {requirementId,requestId}` links an approved resource request for the same site/material/quantity. An approved request must be covered by confirmed receivedBase or active nonexpired stock reservations, with physically usable stock. `dispatch.readiness {orderId}` reevaluates both materials and acknowledgment. An uncovered requirement keeps order CONFIRMED and creates a shortage decision; no client schedule confirmation is emitted. Replanning does not imply stock has arrived.

Lead photo references are verified media_asset image records with nonconfidential visibility and appropriate uploader/customer/site scope. Closing an unaccepted lead supersedes its open quotes; an old button cannot resurrect the withdrawn sale.

## Customer Issues and safe context

The canonical `issue` aggregate retains public/private history and a review cycle. `issue.draft` creates a creator-private DRAFT; `issue.create` or `issue.submit` opens a numbered `KNB-I-<id>` case with one internal decision. A concrete location, task or photo is required. `externalKey` deduplicates an unchanged logical case; changed content under the same key conflicts. Current active, unrevoked and unexpired VIEW membership with matching site controls external actions. A static customerIds list never substitutes for it.

`issue.context {siteId}` returns active same-site locations `{id,nodeType,code,name,parentId,floorLabelDe}` and safe tasks `{id,title,state,locationId,orderId}`. Customer tasks must be clientVisible or included in a published report snapshot. No staff assignments, private notes or hidden task contents are projected. Guessed foreign site/location/task/photo references fail safely. Photos must be verified owned evidence or separately approved sanitized client media; confidential originals cannot be exposed.

`issue.get/list` apply fresh scope and creator-only draft access. The external projection excludes owner/assignees/internalReason/privateHistory/original task snapshots and internal decision/work IDs. It shows public response/history and current workStatus. OWNER/DIRECTOR/OPERATIONS_MANAGER/INTERNAL_BAULEITER/QUALITY_CONTROL may review within current site scope; any external/customer role prevents internal review even if a task.review string is attached.

| Classification | Effect and closure prerequisite |
| --- | --- |
| DEFECT | Canonical operations defect and optional INTERNAL rework, retaining original accepted work/photo/time. COMPLETED requires accepted linked rework and CLOSED defect |
| ADDITIONAL_WORK | Canonical CONTRACT continuation only for remaining originally planned quantity, preserving the original accepted amount. COMPLETED requires accepted continuation |
| NEW_SCOPE | Internal customer-additional-scope decision; separately approved/accepted ChangeOrder and valid ADDITIONAL_SCOPE task linkage. No automatic price, resource promise or paid task |
| CLARIFICATION | Public response without task, time, price or legal acceptance; resolution uses ANSWERED |

`issue.qualify` requires publicResponse and private internalReason, checks the principal expected_version before composing canonical operations handlers inside the same transaction, and creates at most one effect per cycle. `issue.link_work` rejects foreign-site/source/cycle links, an unrelated rework task, or replacing existing linked work. `issue.resolve` checks canonical completion state; NO_ACTION_AGREED instead requires a documented evidenceReference. It does not claim work was completed. `issue.reopen` preserves prior evidence/history, starts a new cycle and never deletes old task/report versions. Customer issue resolution is separate from legal Abnahme, document receipt, hour confirmation and payment.

The focused commerce suite currently passes 46 tests, including 13 Issue/context checks and 5 canonical knowledge ACL cases (2026-10-06T18:24:48 UTC). These execute domain handlers against explicit synthetic transaction fixtures. The shared engine's real database atomicity/concurrency and the browser workflow still require their separate final runtime evidence.
