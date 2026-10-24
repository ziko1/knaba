# KNABA DE web application

React 19 + Vite 7 responsive DE-first web console and public entry. `apps/web/vite.config.ts` builds to `dist/web`; Nest/Express serves that output under the same origin. Development: `npx vite --config apps/web/vite.config.ts --host 0.0.0.0`, proxying API to localhost:3000. No frontend environment secrets or business records are bundled.

## Workflows

The public `/` route separates new customers, existing customer login and staff login. Enquiry forms persist through `/api/v1/public/leads`, require contact consent, preserve channel attribution and do not imply marketing consent. Public webchat preserves private guest messages and displays actual queued/manual/handoff status. It polls the authorised guest messages endpoint every 10 seconds. A WhatsApp link appears only when the server supplies a confirmed number.

Staff `/console` uses role-specific landings. Site/location editing, task boards and review, shift controls, timesheets, travel, resources, procurement, payroll, report/media, operator inbox, assistant configuration, administration and audit expose persisted API entities. Structured forms are generated from authorised JSON Schema command catalogues, including nested fields, repeatable rows, entity selectors, validation, explicit review and execution. Record actions carry expected version; a retry retains its idempotency key until input changes. All business transitions remain server-authorised.

Staff with `site.structure.edit` can import CSV/XLSX location structures through the Sites screen. The 5 MiB file remains in memory and is sent to `/api/v1/imports/locations/preview` for actual parsing. The form shows file/domain errors, normalised hierarchy and create/update counts. Explicit confirmation calls `location.import.commit` with the exact preview rows and hash; stale previews require another check. Customer roles cannot open this workflow.

Customer issue forms select an authorised site, location, task and existing/actual uploaded photos, preserve original language and require review before submit. Location/task selectors use the safe `issue.context` projection; raw internal task aggregates remain protected. Material scan uses an explicit optional BarcodeDetector camera action with paste/type fallback; it resolves actual configured SKU/QR/barcodes and shows server ledger balances before separate confirmed request/usage commands. Camera streams stop on detection, cancellation or unmount; physical camera validation is NOT_RUN.

The Privacy screen submits own ACCESS/ERASURE requests with selected data categories and explicit review. Own request statuses show actual legal holds, approvals and evidence states. An approved own ACCESS request can prepare and download a private minimised JSON export through the authenticated export endpoint. The screen states the export scope and that erasure requests/evidence do not establish actual source deletion. Staff with recorded permissions can review other users' requests and use the canonical retention/hold commands; the UI creates no legal evidence or approvals automatically.

Photo registration has an actual JPEG/PNG/WebP uploader; originals and cleaned client copies are preserved by the server. The redaction checkbox records the uploader's explicit review and does not claim automated face redaction. Published report versions offer authorised PDF/CSV/XLSX downloads. Corporate chat retains originals, requested translations and server membership checks. SSE refreshes authorised records and clears displayed records on access revocation.

## Security and offline behaviour

HttpOnly cookies authenticate staff and guests separately. CSRF proofs are held in memory, kept separate for guest and staff identities and attached to JSON requests. Logout clears both proofs and session storage. Only the language preference is persisted in local storage. All drafts, files and form results are memory-only and cleared with the mounted application/session.

The service worker caches only the public icon and manifest. It does not cache HTML, API replies, photos, GPS, documents, payroll or identity data. It never queues writes or silently replays an offline business operation. Failed forms remain open with explicit unsynchronised status and manual resend after reconnection. Full offline app loading and reliable background synchronisation are not claimed; real-device verification remains a release prerequisite.

## Languages and accessibility

UI dictionaries in `packages/i18n` cover DE/UK/RU/PL/LT/EN, role captions, common fields, validation and statuses. Domain contract names and user-supplied text remain original. Unknown administrative contract fields use a readable key rather than inventing a translated business meaning. Money stays integer cents in commands; timestamps are entered/displayed in Europe/Berlin and submitted as UTC ISO timestamps. Invalid DST wall times are rejected by the form.

The design uses white and warm neutral surfaces, forest green actions, visible status text, keyboard focus, accessible form labels, modal focus restoration/trapping and reduced-motion support. The fluid layout supports narrow phones, landscape viewports, tablets and wide displays. At 1024px and below, navigation becomes an inert-aware keyboard-accessible drawer. Forms, chat, card grids and header actions reflow, while wide tables and boards own local scroll regions. Shared dialogs follow the visible browser viewport. See [responsive design and test matrix](../../docs/RESPONSIVE_DESIGN.md) for exact source-bound browser evidence, breakpoints and limits. No external fonts or analytics requests are made.

## Embedding

Use the actual deployment origin in place of `https://YOUR-KNABA-ORIGIN`:

```html
<script src="https://YOUR-KNABA-ORIGIN/widget.js" data-language="DE" defer></script>
```

The widget opens the product's public private-chat entry in a small iframe. The operator must allow the confirmed company website in the deployment's `WIDGET_ALLOWED_ORIGINS`/CSP frame-ancestors configuration before cross-origin embedding. Same-origin embedding is available without that approval. Independent public entry and login remain usable without installation.

## Honest boundaries

The browser does not collect GPS. Native approved device/policy is required for background tracking. External AI, WhatsApp delivery, legally approved documents, paid deployment and physical mobile verification depend on the repository's external prerequisite records. The UI displays real connector readiness and never creates synthetic activity itself. DEMO role login is displayed only when the backend explicitly enables DEMO.

Frontend-only typecheck: `npx tsc --noEmit --project apps/web/tsconfig.json`. Frontend API regression tests: `npx vitest run --config apps/web/vitest.config.ts`.
