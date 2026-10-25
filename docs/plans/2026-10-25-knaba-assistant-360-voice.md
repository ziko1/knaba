# KNABA Assistant 360 — Implementation Plan

> **For agentic workers:** Work task by task, verify on the exact source commit, record independent review before accepting a dependent task. Do not deploy, merge, change production data or activate external paid providers without a separate explicit owner approval.

**Goal:** Turn the existing KNABA site information assistant, owner conversation and role portal into one multilingual (German, English, Russian; preserve Ukrainian) AI reception, customer and worker coordination system with real browser voice, eligible WhatsApp Business Calling, human handoff, and integrated CRM/ERP workflows.

**Architecture:** Reuse the Astro/Solid corporate-site and its existing D1 visitor inbox, owner conversation and protected portal. Keep ERP PostgreSQL the system of record for customer orders, employee time, money, permissions and assignments; connect D1 to ERP only via authenticated, idempotent, versioned events. Add a browser voice adapter without new credentials; a real WebRTC voice/media gateway and WhatsApp provider are separate disabled-by-default deployables, subject to confirmed account authorization, budgets, privacy and acceptance.

**Tech Stack:** Existing Astro 7.4.2 + SolidJS 1.9.17 + TypeScript 5.9.3, Node >=22.23.4 (QA uses Node 24), Cloudflare Worker/D1, existing KNABA ERP NestJS/PostgreSQL/SQL outbox. Web Speech API for initial optional voice UI, with a future gated WebRTC gateway for true calls. No automatic Rust rewrite, Redis, new CRM, or paid model.

## Global constraints and precedence

- Project: ziko1/knaba, separate from AVENQO; preserve root AGENTS.md, corporate-site PROJECT_MEMORY.md / ROADMAP.md, ERP AGENTS.md / KNABA_DE_TARGET_SPEC.md / PROJECT_MEMORY.md / MASTER_ROADMAP.md, and unified memory/backlog/contract. The ERP V4/V3 target is not replaced by this plan.
- Baseline integration candidate: Draft PR #12, base source HEAD 1c15e5a4451ef26d080863ba3ddcaeaefbf7b0d4. This is a local test candidate based on that HEAD, NOT an integrated deploy release.
- Existing /api/leads, /api/assistant/*, owner inbox, role portal and public-assistant FAQ must keep their contracts. No new public URL may imply an authenticated worker/client.
- No content or audio recording by default. An explicit click starts microphone access. Browser speech processing may involve a separate vendor and must be described before use; never claim the browser is fully offline.
- The AI may explain, classify, summarize consented content and propose draft work. It may NOT grant a role, commit prices/contracts, change payroll, activate location tracking, disclose another tenant's records or assert that a message/call was delivered before its server receipt.
- No phone numbers, credentials, API tokens, prices, quotas, customer testimonials or acceptance metrics may be invented. Identity derives from trusted server sessions, not user statements.
- Current external spending authorization for this feature: EUR 0. Provider quota, exact prices and existing hosting costs: UNKNOWN. A bound preflight reservation is required before any paid call.
- No PR merge, main mutation, production D1/PostgreSQL migration, production deployment, or paid provider activation without explicit owner approval. Staging needs its own origin, synthetic database and rollback.
- The shared VPS has approximately 11–12 GiB free at the time of development on 2026-10-25; fail early on disk pressure, avoid duplicate toolchains and do not delete unknown Docker volumes/backups.

---

## Verified starting point (source audit)

Observed paths: corporate-site/src/components/PublicAssistant.tsx; corporate-site/src/components/OwnerConversation.tsx; corporate-site/src/lib/public-assistant.ts; corporate-site/src/styles/public-assistant.css; corporate-site/worker/assistant-threads.ts; corporate-site/tests/*.test.ts; docs/unified/INTEGRATION_CONTRACT.md; erp/apps/api.

Existing public FAQ does NOT invoke an LLM. Local owner conversation stores guest messages in D1 behind a private capability and requires real, provider-enforced owner identity for production. A real authenticated owner↔guest UAT and D1↔ERP lead bridge remain unaccepted. A local Web Speech interaction is not a SIP/PSTN phone call and cannot independently receive a WhatsApp call.

## Product interfaces (proposed unless explicitly marked existing)

- Existing: answerQuestion(raw, locale, topic) -> AssistantAnswer, and VisitorOwnerChat under the protected owner conversation workflow.
- Implemented in this candidate: routeAssistantQuestion(raw, locale) -> {intent, answer} | null; routeAssistantSelection(intent, locale) -> {intent, answer}. These are navigation hints ONLY.
- Implemented in this candidate: createBrowserVoiceController(platform, onTranscript, onState) -> {start(locale), speak(text, locale), stop(), support()}. It does not save audio, submit a lead or assume a browser supplies the language-specific voice.
- Proposed: POST /api/assistant/voice/sessions -> short-lived scoped browser-voice session; DELETE /api/assistant/voice/sessions/:id -> revoke session; voice media signaling uses authenticated ephemeral session credentials. No endpoint is considered implemented until code and tests prove it.
- Proposed: POST /internal/v1/assistant/events -> ERP signed and versioned intake/worker event, with shared company/site scope; durable inbox/outbox and idempotent receipts.
- Proposed: provider-specific WhatsApp inbound call webhook -> verified event and media session; strict separate transport authentication and permission checks. Never accept a caller-provided worker/owner role.

## Task 1. Safe public intent routing — implemented candidate

**Files:** Create corporate-site/src/lib/assistant-routing.ts; Test corporate-site/tests/assistant-routing.test.ts.

**Consumes:** AssistantLocale and existing AssistantAnswer. **Produces:** routeAssistantQuestion and routeAssistantSelection.

- [x] Step 1: Add failing cases for worker DE/RU, existing customer EN, owner handoff DE/EN/RU, new construction cleaning/drilling lead EN/RU, partner, urgent safety and unexpected text.
- [x] Step 2: Confirm red caused by the missing module; do not label missing dependency as business integration.
- [x] Step 3: Implement a bounded, non-generative intent classifier; urgent physical danger takes precedence; static internal links only; worker/client requests point to the protected portal; human communication requires separate consented submission.
- [x] Step 4: Run focused Vitest under the pinned development checkout (11/11 initially). Rerun and bind results to final PR HEAD.
- [ ] Step 5: Independent review for false positive and false negative language routing, UX for restricted accounts and accessibility; browser role paths under real authentication remain unverified.
- [ ] Step 6: Accept on a source-pinned reviewed PR, with no production deployment.

## Task 2. Browser spoken conversation, DE/EN/RU (+UK) — implemented candidate

**Files:** Create corporate-site/src/lib/assistant-voice.ts; modify corporate-site/src/components/PublicAssistant.tsx and src/styles/public-assistant.css; Test corporate-site/tests/assistant-voice.test.ts.

**Consumes:** VoicePlatform browser capabilities; existing answerQuestion and owner chat. **Produces:** optional start/stop microphone, single final transcript, optional TTS, explicit locale selection, proper privacy/fallback state.

- [x] Step 1: Write tests for language tags, missing/insecure browser APIs, click-to-listen, final-only transcript, cancel/stale callbacks and explicit synthesized answer.
- [x] Step 2: Confirm module-not-found red before implementation.
- [x] Step 3: Use built-in recognition and synthesis only after user gesture; never auto-restart microphone; stop both streams on reset/language change/unmount; no raw audio storage; limit transcript length; show unavailable/permission-denied/speech-error feedback.
- [x] Step 4: Integrate role selectors, 44px touch controls, accessible labels/status and anchored owner message form without changing protected backend APIs.
- [x] Step 5: Locally run Astro/Vue/Svelte type checks, all site tests, production build and static build verifier using Node 24.22.1. Record exact final candidate SHA before accepting.
- [ ] Step 6: Device-based recognition and playback for German, English and Russian with explicit microphone permission/denial on Android Chrome, desktop Chrome/Edge, Safari/iOS and Firefox fallback. The device/vendor may lack a voice; lack of a voice is NOT a passing multilingual audio test.
- [ ] Step 7: Human accessibility review (keyboard, TalkBack/VoiceOver, 320px/390px, zoom 200%, reduced motion) and independent security review.

## Task 3. Discoverable website voice entry point — code candidate

**Files (proposed):** corporate-site/src/layouts/Layout.astro, corporate-site/src/styles/global.css, corporate-site/tests/site-i18n.test.ts.

**Consumes:** existing localized assistant routes. **Produces:** a compact localized navigation entry on public pages that opens the actual browser voice interface.

- [x] Step 1: Confirm DE/EN/RU links resolve to existing noindex assistant routes and preserve user-selected locale without losing navigation state.
- [x] Step 2: Reuse existing header/mobile assistant link, relabel it as speech assistant in four languages, and preserve locale with no extra overlay. Never label Web Speech as a connected phone call.
- [ ] Step 3: Verify bottom/footer overlap at 320, 390, 768, 1440 CSS pixels and mobile browser toolbar. Reject any fixed overlay obscuring content.
- [ ] Step 4: Rebuild, static-link-verify and review localized navigation. No new window or external page.

## Task 4. Genuine browser voice call gateway (WebRTC)

**Files (proposed):** corporate-site/worker/voice-sessions.ts, corporate-site/src/lib/voice-session-client.ts, separate deployable services/voice-gateway, tests/voice-sessions.test.ts and tests/voice-gateway-security.test.ts.

**Consumes:** explicit browser consent, validated Origin, scoped session, speech and media provider capability. **Produces:** inbound WebRTC offer/answer lifecycle and bounded bidirectional audio streams.

- [ ] Step 1: Write negative tests: without explicit consent, origin mismatch, expired credential, cross-session replay, excessive concurrent calls, malformed SDP and missing provider credentials must fail closed.
- [ ] Step 2: Define POST/DELETE session schema, caller type=anonymous until server authentication, short-lived single-session token, RTCPeerConnection setup, TURN/STUN configuration, DTLS-SRTP/SRTP media and ICE disconnect cleanup.
- [ ] Step 3: Choose and verify an actual STT/TTS/AI media engine with licensed multilingual support and p95 measured latency. The provider must support interruption and cancellation; no invented model names or quotas.
- [ ] Step 4: Add per-call rate/time/concurrency ceilings, bounded upstream retries and backpressure, redacted observability and circuit breaker; no durable audio by default.
- [ ] Step 5: Verify device calls and server connection loss/reconnect using synthetic sessions; separate external consent, price/quota and allowed-data approval is a hard gate before activation.

## Task 5. WhatsApp Business Calling and messaging

**Files (proposed):** services/voice-gateway/providers/whatsapp/, corporate-site/worker/whatsapp-webhook.ts, ERP provider config and tests/whatsapp-inbound.test.ts.

**Consumes:** verified WABA, approved WhatsApp sender, calling eligibility, current Meta provider signature, approved data contract. **Produces:** verified inbound call/message events mapped to the same dispatch session without any authority inferred from WhatsApp display names.

- [ ] Step 1: Check actual ownership of WABA/number, Meta verification, capability availability, number's country code, provider tariff, voice-media integration and active fresh messaging/voice quota. If any fail, leave WhatsApp Calling disabled and preserve the browser channel.
- [ ] Step 2: Test valid and invalid webhook signatures, duplicate delivery, old timestamps, out-of-order call events, orphaned media sessions and revoked numbers.
- [ ] Step 3: Acknowledge verified provider events quickly, durable queue with idempotent processing, enforce authorized recipient scope, opt-in and service-window/template policy for outbound messages.
- [ ] Step 4: Map WhatsApp VoIP to a supported operator endpoint; do not assume calls can be transferred directly to PSTN (ordinary mobile/landline numbers). If provider rejects operator handoff, offer consented callback request instead.
- [ ] Step 5: Conduct real incoming call with a company-approved test number and owner-approved budget, including language switching, noisy speech, dropped call and transcript consent.

## Task 6. Human owner and operator takeover

**Files (proposed):** corporate-site/worker/assistant-handoff.ts, corporate-site/src/components/AssistantInbox.tsx or existing owner inbox, erp/apps/api operator presence and tests/handoff.test.ts.

**Consumes:** verified active browser/WhatsApp session, operator authentication, company membership, consented conversation summary. **Produces:** assigned, time-limited operator handoff or queued callback request.

- [ ] Step 1: Test missing owner identity, cross-company handoff, two agents accepting once, canceled call and stale operator presence.
- [ ] Step 2: Create a single scoped handoff record (requested / accepted / ended / missed), signed operator token, audit actor and timestamp, expiry and cancellation; no guest-controlled owner identity.
- [ ] Step 3: Make browser softphone/VoIP takeover within verified same-media provider available; never claim PSTN forwarding where unsupported.
- [ ] Step 4: Provide missed-call callback queue without automatic outbound dialing, and status messages “requested / connected / unavailable” based on real receipts only.
- [ ] Step 5: Verify physical owner device and a controlled guest call, plus user cancellation and fallback.

## Task 7. D1 → ERP scoped event bridge

**Files (proposed):** corporate-site/worker/assistant-outbox.ts, additive D1 migration, erp/apps/api scoped endpoint, ERP PostgreSQL inbox schema, tests/bridge-idempotency.test.ts.

**Consumes:** existing D1 visitor Lead and consent; server-resolved company/site identity. **Produces:** KNABA_LEAD_V1 / ASSISTANT_CASE_V1 idempotent ERP intake receipts.

- [ ] Step 1: Preserve existing POST /api/leads behavior and current D1 records. Atomic outbox write alongside new consented cases; PII-minimal event.
- [ ] Step 2: Authenticate sender by per-environment HMAC, timestamp freshness, constant-time verification and server-mapped tenant/site (NEVER from browser role claims). Store unique event ID and fingerprint.
- [ ] Step 3: Atomic ERP insert lead/inbox/audit; same replay returns same receipt, same ID with changed payload returns conflict; parallel replay creates exactly one lead.
- [ ] Step 4: Retry transient failures with bounded exponential backoff, DLQ, replay tooling and audit. Timeouts reconcile idempotent receipts before requeue.
- [ ] Step 5: Run actual PostgreSQL + D1 integration and cross-tenant negative tests on a synthetic database with safe rollback.

## Task 8. Worker Desk and role-scoped automation

**Files (proposed):** erp/apps/api/workers/assistant-intake, ERP task/audit tables under the canonical V4 model, corporate-site protected portal UI, tests/worker-intake.test.ts.

**Consumes:** authenticated worker membership and assigned object, approved time entries and site schedule. **Produces:** draft job report, material request, incident or timesheet correction in ERP with provenance.

- [ ] Step 1: Map workers to server-authorized company and site, not to WhatsApp phone alone; require step-up verification for sensitive payroll/personnel data.
- [ ] Step 2: Classify consented voice/text report into job completion, hours, materials, equipment, absence, incident or clarification; make drafts rather than silently applying changes.
- [ ] Step 3: Require foreman/manager approval for disputed hours, allocations, orders, purchases or payroll-affecting updates. Enforce non-overlap and idempotent submissions.
- [ ] Step 4: Test suspended worker, wrong site, no assignment, duplicate voice message, DST Europe/Berlin timesheet date, late shifts, missing data, concurrent review and GDPR erasure.
- [ ] Step 5: Pilot with synthetic crews and then owner UAT; never enable GPS/location without separate permission.

## Task 9. Existing/new clients, contractor workflows and quotes

**Files (proposed):** ERP existing CRM lead/order/quote modules, corporate-site portal enquiry UI, tests/client-intent.test.ts.

**Consumes:** verified customer/partner identity, service category and site. **Produces:** intake drafts, human-approved inspection/quotes, job history for authorized customers.

- [ ] Step 1: Keep cleaning vs Bauhelfer vs Kernbohrungen service taxonomy consistent with verified official KNABA data; remove unsupported office-cleaning claims from the new branded catalogue only after owner content review.
- [ ] Step 2: Collect location, work type, scope, schedule, access restrictions and consent; do not fabricate price/availability, legal warranty or partner testimonials.
- [ ] Step 3: Draft commercial quote only through authoritative ERP pricing, integer EUR cents, taxes and versioned review; require authorized human sign-off.
- [ ] Step 4: Test customer authorization and partner separation, cancellations, amendments, duplicate submissions and rejection of unverified site/tenant.
- [ ] Step 5: Verify lead-to-offer to accepted work with real owner/customer UAT.

## Task 10. Scoped AI orchestration, languages and budget fencing

**Files (proposed):** erp/apps/api/assistant-policy, services/voice-gateway/provider-adapters, AI Team v3 project queue configuration, tests/provider-policy.test.ts.

**Consumes:** approved provider, current budget reservation, language preference and consented minimal context. **Produces:** policy-limited drafted response/summary and actual usage receipt.

- [ ] Step 1: Make deterministic answers and safe handoff the fallback. Before any model call verify provider auth, data-processing region/contract, real fresh quota, price, project budget ceiling, consent and tenant scope.
- [ ] Step 2: Build intent-specialized policies for reception/sales, customer support, worker coordination, incident escalations and operator summary; agents never gain ERP write authority from prompt text.
- [ ] Step 3: DE/EN/RU spoken language and intent tests with human native-language review, accent/noise and code-switching; preserve Ukrainian text path. A browser without matching speech engine must fall back to text with honest status.
- [ ] Step 4: Add prompt injection, social engineering, PII exfiltration and tool-call boundary tests. Unknown user utterance never bypasses authorization or leads to unapproved payment.
- [ ] Step 5: Reserve budget before dispatch, reconcile usage/unknown charge, bounded fail-safe retry and explicit opt-in before a paid request. AI Team daemon is not evidence of any task dispatch.

## Task 11. Privacy, recording, DSAR and legal acceptance

**Files (proposed):** corporate-site/src/pages/datenschutz.astro plus localized legal notices, consent audit event, ERP retention/erasure workflow and tests/privacy.test.ts.

**Consumes:** explicit privacy choice and a legally verified processing basis. **Produces:** explainable permission, limited processing and retention/erasure audit.

- [ ] Step 1: Legal reviewer approves disclosures under GDPR/ePrivacy/AI transparency obligations and German §201 StGB. No call recording by default; separate express recording consent before any nonpublic audio capture.
- [ ] Step 2: Disclose any browser speech-vendor processing, external AI processors, DPA/AVV, destinations and retention period in all relevant languages. Do not silently reuse audio/transcripts for training.
- [ ] Step 3: Support withdrawal, owner/worker access scoping, short-lived capabilities, data export/deletion requests, processor deletion and backup retention reconciliation.
- [ ] Step 4: Tests prove decline/withdrawal prevents streaming or persistence, consent revocation stops the active microphone/session, and deleted data is not restored from stale backups.
- [ ] Step 5: Obtain company/operator sign-off before external audio/customer processing.

## Task 12. Reliability, QA, UX and independent review

**Files (proposed):** corporate-site/tests/e2e/assistant.spec.ts, services/voice-gateway/tests/call-flow, docs/evidence/knaba-assistant-360/, QA release matrix.

**Consumes:** pinned source SHA, immutable built artifact hash, isolated fixture/test accounts. **Produces:** reproducible acceptance evidence with actual PASS/FAIL/NOT_RUN/BLOCKED statuses.

- [ ] Step 1: Run unit + type checks, real D1/Postgres interaction, browser signaling, external provider sandbox and negative security tests at the same exact source.
- [ ] Step 2: Exercise German, English and Russian voice interactions on actual devices/browsers; microphone denial, interrupted audio, no voice installed, 320/390 mobile, keyboard and screen reader.
- [ ] Step 3: Measure p50/p95 startup, STT first token, end-to-end turn latency, owner takeover time, DB queries/N+1, web payload and Web Vitals under a documented workload before setting optimization targets.
- [ ] Step 4: Run restore rehearsal and service-failure drill; check tenant isolation, idempotency replay and secrets/log PII.
- [ ] Step 5: Independent security/QA review checks each acceptance on exact commit and exact deployed artifact. Mark absent device/provider evidence NOT_RUN, not PASS.

## Task 13. Controlled staging, rollout, rollback and customer handover

**Files (proposed):** docs/unified/RELEASE_READINESS.json, docs/evidence/knaba-assistant-360/release-*.json, deploy staging descriptors and runbook.

**Consumes:** passing release gates, owner-approved WABA/provider/legal credentials and separate deployment approval. **Produces:** controlled customer-accepted KNABA release.

- [ ] Step 1: Freeze source SHA, build artifact hash and dependency versions; confirm target DNS/TLS, safe disk headroom, tested backup and rollback artifact.
- [ ] Step 2: Deploy to authorized isolated staging first; health/readiness, real microphone/device, owner session, WABA incoming call and worker flows must be observed, not inferred from build success.
- [ ] Step 3: Confirm tariffs/quotas and owner-approved legal text and retention; obtain explicit permission for production release. If withheld, keep the draft PR and disabled providers.
- [ ] Step 4: Re-run fail-closed npm run audit:release; any blocker stops only release, not unrelated authorized development.
- [ ] Step 5: Production canary only after approval; audit initial calls, hold rollback without destructive database downgrade, hand over support/operations documentation and require client UAT acceptance.

---

## Status snapshot (2026-10-25 local candidate, NOT yet released)

- Task 1 and 2 code implemented in an isolated checkout; unit tests 96 Vitest cases including 20 new focused cases, plus 8 Node inquiry cases PASS. Astro/Vue/Svelte zero errors/warnings, production build and static verifier PASS on Node 24.22.1.
- Browser-native microphone and actual DE/EN/RU voice synthesis on real hardware: NOT_RUN. A simulated Web Speech interface in unit tests does not prove device behavior.
- Genuine WebRTC browser calling, provider STT/LLM, WhatsApp Business Calling, softphone takeover, ERP worker/lead bridge, provider messages, independent review, full privacy/legal sign-off and company UAT: NOT_RUN or BLOCKED_EXTERNAL.
- No external API activation, no additional paid subscription, no merge or production deployment performed. Release gate continues to fail closed.
- Follow the exact release gate status and proof files rather than relabeling an implementation checklist as product completion.

## Project budget and team queue

Project ledger: docs/unified/BUDGET.md. New paid services and API authorization: EUR 0; available provider credits and cloud account quota unknown. Shared VPS was already ~95% full during this development. Do not install a database or maintain multiple build caches merely to get a demo.

AI Team v3 job separation (queue / assignments, not proof of dispatched agents): Architect owns interface and boundary ADR; Web/UI owns voice interaction and localized paths; Backend/Telephony owns signaling/provider webhooks; ERP owns scoped business events and worker flows; Security owns identity, GDPR and recording; QA independently verifies tests/built artifacts; Operations owns staging/rollback/release. Each agent must preserve existing project rules and report source SHA, changed files, test logs, costs and next blocker. Dispatch only when authorization and quota are independently confirmed.

## Unresolved owner/external decisions

1. Which verified KNABA WhatsApp Business account/number is permitted to receive automated inbound voice calls, and is the required calling eligibility actually active?
2. Which lawful audio processing region, voice/STT/TTS/LLM provider and DPA/AVV have been approved by KNABA; what explicit per-month ceiling and fresh real quota exist?
3. What is the owner/operator's verified portal account, staffed availability and chosen softphone/provider for genuine live takeover?
4. Which company-approved consent, privacy, transcript retention and recording policy applies? Recording is OFF by default.
5. Which official branding/services, company legal identity and actual contract/price tables has the owner accepted?
6. When the independently reviewed build and provider/device UAT are complete, the owner must approve the exact production release and rollback plan separately.

**Rollback:** Revert or disable only new voice entry points and media gateways; the existing text FAQ and owner conversation continue unchanged. Preserve D1/PostgreSQL idempotency records, original ERP source and live customer data. Do not run destructive schema down-migrations.
