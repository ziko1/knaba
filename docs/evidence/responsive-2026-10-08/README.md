# Responsive web evidence

This directory separates exact tested application code from the later documentation commit. It covers two focused responsive PRs against their own active bases; it does not represent a merge of the product-completion and V4 business runtimes.

- [Source and tree bindings](source-binding.json) list both exact bases, all 11 changed implementation/test/workflow files and their hashes. Nine shared responsive files are byte-identical across the lines. API, worker, domain, infrastructure and package inputs are unchanged from each line's own base.
- [Discovery history](history.json) preserves failed and superseded attempts, downloaded artifact digests, the original V4 browser/SQL failures and the concrete fixes supported by actual screenshots and traces.
- [Product-completion receipt](product-receipt.json) records the product line's own final responsive and release results.
- [V4 receipt](v4-receipt.json) records the authoritative V4 target line's own responsive and release results, keeping inherited release blockers separate from the design acceptance.
- [Product scenario inventory](product-scenarios.json) and [V4 scenario inventory](v4-scenarios.json) record every actually executed responsive scenario and browser.

## What the responsive suite verifies

The actual built React application is rendered in Chromium and WebKit. Dedicated in-memory HTTP fixtures are explicit; the command schemas come from the real Engine registry. Public entry/request coverage uses all six supported languages at 13 viewport dimensions. Console modules are exercised at phone, tablet, desktop and wide desktop widths. Forms, keyboard table scrolling, boards, deep location trees, drawer focus and rotation, short viewports, chat, customer issues, enlarged text and the actual embedded contact widget have user-visible assertions.

The separate release suite supplies actual PostgreSQL and persisted application browser evidence. Product-completion browser classification is 23 actual backend/UI scenarios plus three explicit transport fixtures. V4 retains its own 26 actual backend/UI scenarios plus one explicit transport fixture. Neither classification turns a mocked provider into a real provider.

Selected screenshots are direct PNG bytes from successful source-bound browser attachments. Their filename, original artifact, digest and reviewed scenario are recorded in the receipts. No raw cookies, authentication state, database URLs, private trace payloads or real customer data are committed here.

## Acceptance boundary

Responsive web acceptance concerns the tested rendering and interaction matrix. The layouts interpolate between the documented widths, but arbitrary hardware/browser/keyboard combinations are not exhaustively tested. Physical Android/iPhone use, native UI, production deployment, real provider delivery, company UAT, all 72 whole V4 criteria and all 475 preserved regression criteria require their own evidence.

The V4 base already had failed PostgreSQL/worker/business scenarios and a separate core-load SQL parameter failure. The final receipt compares those exact test identities and reports the actual latest result. This design task does not revise unrelated business contracts or declare that full release ready.
