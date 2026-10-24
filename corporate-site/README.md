# KnaBa corporate website and role portal

German-first corporate cleaning website for Berlin and Brandenburg, temporarily hosted at https://kneba.vsp.rest/. Official existing business site: https://knaba.de/.

## Architecture

Astro7 prerenders25 HTML pages with visible SEO content. SolidJS owns the inquiry and role portal; Vue/Pinia, Svelte and Zustand remain isolated in the service planner. TanStack Solid Query manages the portal/catalogue server state. Tailwind4 and TypeScript share a Vite8 pipeline.

A separately built Cloudflare Worker serves `/api/portal/*` and `/api/leads`. D1 stores profiles, requests, rate limits and an audit trail. The native Sites gateway handles ChatGPT sign-in. This application never accepts passwords or claims that client-selected roles are authorized. Internal identity-provider worker IDs are not returned to client-role request views.

Vite8.3.5 replaces the older starter's8.0.13 because current npm advisories reported vulnerabilities. Versions are pinned in package.json and package-lock.json. No SvelteKit/Turbopack or duplicate router is installed.

## Run and check

Node22.23.4+ is required; integration tests use the actual `node:sqlite` engine.

```sh
npm ci
npm run check
npm test
npm run build
npm run verify:build
npm run dev
```

`dev` serves the built Worker and static output. It applies pending schema migrations to an ignored **local** database under `.wrangler/state`. Rebuild after source changes. `npm run dev:content` offers Astro content HMR without the backend. Local and hosted D1 are separate. Local preview has no production login identity; authorization integration tests supply explicit synthetic identity fixtures in an in-memory SQLite adapter. There is no production test-account bypass.

Build sequence: Astro -> `.astro-static`, security headers -> same asset directory, Vite/Cloudflare -> `dist/client` + `dist/server/index.js`. The vendored Sites Vite plugin copies the manifest and Drizzle migrations into `dist/.openai`. The native Sites source helper packages and publishes this exact output.

## Owner and role model

Configure server-only `OWNER_EMAIL` in Sites runtime secrets. It must be the verified Site owner's sign-in email; never use a public frontend variable. A missing owner configuration is a deployment blocker. Hosted authentication supplies trusted identity headers; custom-host traffic must pass through the supported Sites dispatcher. Do not expose the Worker directly with caller-controlled identity headers.

- Anonymous: public information and a rate-limited cleaning inquiry without sign-in.
- Registered: profile pending; no business data until approval.
- Client: own requests, status, cancellation before scheduling, feedback after completion.
- Worker: assigned jobs, four-item checklist, status progression, internal note.
- Admin: received requests, scheduling, assignment to approved workers, client replies.
- Owner: admin capabilities plus role approval/suspension and audit. No first-user privilege escalation.

API contracts: `src/lib/portal-contract.ts`. Every mutation checks JSON type, bounded payload, matching Origin, custom request header, authorization, allowed fields and record version. Submissions use cryptographically random idempotency keys. Contact inquiries are saved to D1; **no notification email is sent**. The operator must check the portal. Public inquiries are not automatically linked to later profiles.

## Languages and navigation

German is the primary site language. `/en/` and `/uk/` are localized overviews; articles/service/legal detail pages remain German. The portal's functional interface supports DE/EN/UK. Only a language preference is saved to localStorage. Personal records remain server-side, transient forms in memory.

Astro ClientRouter changes internal pages in the same window without a document reload; forms use fetch. Normal links remain usable without JavaScript. ChatGPT sign-in/sign-out are intentionally top-level platform navigations. Native browser dialogs/mail/phone/external links are outside client routing.

## Search and release modes

`KNABA_RELEASE_MODE` defaults to temporary. Public pages carry `noindex, follow`, public crawling is allowed, API/account paths disallowed. The sitemap is empty until an explicitly reviewed official release. The temporary warning remains visible.

`KNABA_RELEASE_MODE=official npm run build` prepares canonical `https://knaba.de`, indexable public metadata and23 sitemap URLs. This is a **technical build switch, not authorization to migrate**. Before official publication: review legal/operator data and processor contracts, final copy/assets, old URL redirects, owner workflow, retention, Google property verification and measurement plan. Keep account/API pages noindex.

Useful files: docs/SEO_AUDIT_UK.md (competitors/queries), docs/LEGAL_AUDIT_UK.md, docs/REVISION_3_PLAN_UK.md, docs/TEMPORARY_HOSTING.md and evidence.

## Operational boundaries

The dashboard starts with the newest 200 requests/profiles and signals truncation. Role-scoped `GET /api/portal/requests?after=...` and `GET /api/portal/profiles?after=...` load older records in batches of 50 through existing portal buttons without reloading the page. The server repeats every permission check on every page request; cursors convey ordering only, not authority. This is not a searchable enterprise CRM. It does not issue invoices, payments, automatic customer emails or employee notifications. No analytics/tracking is enabled. Rights/export/correction/deletion requests currently go to the operator's public privacy contact; no automatic record-retention or self-service deletion is configured. Removing the domain does not delete data.

Unit/integration/build checks do not establish field Core Web Vitals, human acceptance, Google index status, legal certification or sales growth. Exact verified release and runtime evidence are recorded separately.
