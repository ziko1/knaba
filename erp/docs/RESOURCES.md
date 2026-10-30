# Inventory, procurement, remuneration, evidence and reports

The implementation is in `packages/domain/resources.ts`. The command engine supplies permission checks, company filtering, a serialized PostgreSQL transaction, expected versions, durable idempotency, audit and outbox. Domain handlers validate references and site/self/warehouse scopes inside the same transaction. Stock movements, official payroll documents, payout receipts, report versions and customer acknowledgments are immutable. Goods receipt quantities and actual costs remain fixed while their reconciliation state advances through audited commands.

## Stock and exact quantities

`material.create` records the SKU, multilingual names/synonyms, material category, allowed supplier/analog references, storage rules, base unit, exact rational conversions and packaging. Quantities are decimal **strings**, converted with integer arithmetic into ml, g, pieces or pairs. `1.5 l` becomes 1500 ml. Fractional base units and arbitrary volume/mass conversions are rejected. Package conversion is material specific; no chemical substitutions are inferred.

Stock locations are warehouses, sites, vehicles and employee custody. Warehouse access requires an explicit assigned warehouse ID; site and employee locations use the central site/self scope. Consumable usage and custody transfers have different commands. Inventory and assets create custody assignment records when received and cannot be consumed through `stock.use`.

`stock.receive` creates an immutable incoming movement with a receipt reference. `stock.ship` removes physical stock from the source into a unique transit location; `stock.accept` alone moves it from transit to the destination, supporting partial quantities and discrepancy reasons. `stock.return` is a return transfer using that same two-step flow. A shipment does not consume materials. `stock.use` creates one immutable confirmed usage linked to task, optional worklog and location. GPS events do not create movements. The same usage reference cannot create a second effect.

`stock.balance` separately exposes physical, unusable, reserved, free, transit and ordered amounts. Batch status/expiry determines usable stock. Outbound operations from a location holding batched stock require an explicit batch selection. Negative physical and free quantities are rejected; immutable movement history reconstructs balances. Expired reservations cease holding stock; releasing a reservation updates its linked request consistently. Stock count stores a ledger snapshot; applying its difference preserves movements made since the count, requires another approver and cannot consume reserved stock. Counting zero is supported. Writeoffs require a matching approved decision and reason and never create a wage deduction.

Consumption records a deterministic internal weighted average from confirmed receipt costs. Missing receipt valuation remains `MISSING_RECEIPT_COST`; it is not invented. Internal cost is never used as the contractual customer charge. `stock.usage_visibility` approves whether actual material facts may appear in a customer report.

## Requests and procurement

The employee submits a draft material request with material, unit, quantity, site/task, deadline, urgency and reason. A different approver accepts, partially accepts with a reason, or rejects. Reservation, issuance and receipt preserve explicit quantities and different states; a reserve is never presented as a physical issue. Physical transfer receipt is distinct from the requesting employee's receipt statement (`request.ack`); another site's receiver cannot manufacture that employee's confirmation.

`procurement.calculate` returns explained source rows and the exact formula:

`max(0, approved unreserved unissued demand + safety stock - free usable stock - free confirmed uncommitted inbound before deadline)`.

The demand row subtracts reservations already covering that request. Therefore 4 l stock, 1 l reserved to another demand and a new 5 l request require 2 l; reserving the available 3 l for the new request still requires 2 l. Unconfirmed or overdue inbound does not count. Packaging and supplier minimums round up and expose the excess. Duplicate location IDs are rejected.

`procurement.create` updates an existing matching draft rather than creating another draft per run. A distinct actor approves the budget. `procurement.order` records a supplier reference but does **not** place an external order. Only `procurement.receive` increases stock; partial receipts have immutable actual cost records. Document reconciliation and budget checks precede closing. Live supplier ordering and payments remain separate external operations requiring integration and authorization.

## Payroll and payouts

Approved `timesheet.payableSeconds` is the only calculation source. Hourly remuneration uses integer EUR cents and half-up rounding once per approved period. Rate snapshots are immutable; a changed rate inside a period requires a split. Monthly calculations require a complete calendar-month period. Supplement amounts require a matching approved decision that can be applied only once. A pending payout cannot obtain a new approval after its payroll is corrected until current accountant verification is restored. This is explicitly `PRELIMINARY_REMUNERATION`, **not** German net payroll.

Only an ACCOUNTANT with `finance.accountant` may attach a confidential verified payslip and enter its checked gross/net values and provider reference. Payouts require that accountant-verified amount. The system does not calculate German taxes or contributions and does not claim DATEV certification.

`payout.create` → `payout.approve` by another actor → `payout.record` stores the responsible person's actual transfer statement → `payout.ack` by **the employee alone** records full, partial or disputed receipt. A recorded bank transfer is a human attestation, not an executed bank API call. The employee sees their amount, period, method, statement and prior payouts. Received and recorded amounts remain separate. A signature is explicitly simple and not qualified. Reversal creates a linked immutable record and keeps the employee's earlier statement.

Approved closed-period adjustments are folded against the original timesheet exactly once. Recalculation archives the prior calculation, preserves actual payouts and requires a new accountant verification before further payments. A new net amount below already committed payouts produces a reconciliation block, never an automatic employee debt.

The balance distinguishes approved commitments, actual recorded transfers, employee-acknowledged amounts, unconfirmed difference, actual outstanding balance and employee-stated unsettled balance. Actual partial transfers of EUR 400 and EUR 600 settle a EUR 1000 period exactly once. No administrator action manufactures employee receipt.

## Evidence and German customer reports

The private blob adapter must create `media_upload` only after verifying the real file checksum, MIME signature, size, owner, scan state and bounded decoding. `media.register` accepts that verified upload ID rather than trusting a browser's storage key or MIME declaration. The asset requires an explicit site or employee context; task, worklog and location references must match. Original media are internal or confidential; customer media require separate sanitized bytes, checksum, metadata removal and explicit redaction review before `media.approve`. Identical files can be referenced in multiple contexts and are marked as duplicates, never counted as proof of a second completed job. EXIF time is not verified work time. External customers and construction managers may register only their own verified image as an internal DEFECT photo for a site covered by a fresh active unexpired VIEW membership. Employee/payroll/internal context IDs are rejected. Optional task references require that task in an immutable published report visible for the same customer/site; optional locations must be active and belong to that site.

`report.create` builds a German snapshot from the configured legal company, customer/site/order, accepted task/review facts, approved site labor seconds, explicitly approved material facts and approved customer-copy media. Customer prices derive from the canonical order and accepted changes; fixed prices are unaffected by actual payroll, additional hours or material cost. Templates include the same integer cents totals for portal/PDF/tabular adapters. Hours use worker codes and exclude break/GPS/private conversations/bank/payroll/internal-cost details.

`report.daily_draft` produces one deterministic draft per site/order/calendar day in Europe/Berlin (including DST); retries reuse it and never publish automatically. Root scheduling must invoke the command. Approved corrections use the operations module's canonical effective segment timeline. Segments are clipped to the report interval; material usage intervals are half-open so midnight cannot appear in two adjacent reports. Explicit task, media and segment order links cannot cross orders at the same site.

A distinct manager reviews and approves the draft; changed source facts before approval cause `REPORT_SOURCE_CHANGED`. Publication creates a new immutable `report_version` with template, exact snapshot and SHA-256. A correction starts a new draft and next version referencing the prior issued version. Delivery is a separate event and cannot change the issued version or create another report number. Canonical recursively sorted JSON hashes survive PostgreSQL JSONB key ordering. The API exporters produce actual German Unicode PDF, CSV and ECMA-376 XLSX with optional approved photographs; photo bytes must match their immutable checksums. XLSX uses a self-contained ZIP/OOXML writer because external dependency installation was blocked. Exact 16-digit integers use text cells, and formula-like content is literal text. Each version/format artifact is stored once with its own byte SHA and reused unchanged on later downloads.

An active `customer_membership` is required for publication/delivery and each customer acknowledgment. Acknowledgments separately state document receipt, hours confirmation or work acceptance. Work acceptance requires a separate Abnahmeprotokoll and active approved legal template. Read/delivery receipts never act as legal acceptance. Root API projection must expose only approved customer reports/media for current membership.

## Verified local evidence

`npx vitest run tests/resources.test.ts`: **56 passed, 0 failed**. `npx tsc --noEmit`: **passed**. Independent Python openpyxl 3.1.5 validates ZIP CRCs, XML/relationship targets, exact values and types, styles, formula text, CRLF/Unicode and image load/save/load preservation. Evidence is in `docs/evidence/resources-result.json`; synthetic PDF/XLSX/CSV examples and byte hashes are in `artifacts/verified-report-v1.*`. Real S3 credentials and physical devices were not used.

## Remaining external validation

Real supplier placement/payment, accountant provider integration and format verification, bank execution, legal approval of payslip/receipt and acceptance forms, private S3 credentials/antivirus infrastructure and real WhatsApp media delivery need external configuration or review. They must be reported as BLOCKED_EXTERNAL/NOT_RUN until actual evidence exists. Domain acceptance tests and live synthetic scenarios do not substitute for these checks.
