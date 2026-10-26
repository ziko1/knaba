# KNABA VPS budget
- Existing SferaHost VPS reused, node:24-bookworm-slim image already cached.
- New paid AI, email, WhatsApp or CI services: NONE ACTIVATED. Actual hosting bill/model quotas UNKNOWN.
- Isolated Docker limits: 1 CPU, 512 MiB RAM, PIDs 96; storage persistent and separate from code release.
- VPS 197GiB filesystem, approx 14GiB free at intake (93% used). Do not delete unverified data/cache/backups.
- Before any paid external API call verify actual balance, pricing and request-cost ceiling; reserve funds first.

## 2026-10-25 preview rebrand
Uses existing VPS and cached Node 24 Docker image; no paid AI/model APIs,
new cloud services, domain purchases or billable workflows authorized.
Actual provider quotas/remaining balances are UNKNOWN. Runtime data are not
migrated or deleted. Runtime release requires atomic symlink rollback.


## Full-site audit — 2026-10-25
- Existing VPS and cached Node24/Chromium used. No new npm dependencies, paid services, external AI dispatch or billable workflow activated. Quotas/balances remain UNKNOWN.
- Before rollout: about9.4GiB available on197GiB filesystem (about95% used). Final compressed release687093B; no data deletion, pruning or retention changes.
- Browser QA container removed after completion. Runtime limits unchanged; official production cutover remains outside this development release.


## Guides release — 2026-10-25
- Existing Node24 and cached Chromium reused; no paid provider/dependency activation. Archive 778282 B; SQLite backup 217088 B. About 9.2 GiB free / 96% used before deployment. No runtime-data cleanup.
- Final public CSS 33872 B gzip; all emitted JS 169470 B gzip (+105 B versus full-site audit baseline). Server-rendered article copy adds no client content library. These are build sizes, not field latency or CWV.


## Corporate template candidate — 2026-10-25
Existing local Node24/dependencies/Chromium reused. Two actual Codex executors: root implementation, corporate_audit independent review. No paid provider/CI service activated, quotas UNKNOWN. JS payload unchanged; no server mutation or cleanup performed.


## 2026-10-26 — User acceptance audit
- Existing VPS, cached Node24 and Playwright image; no new npm dependencies, paid API/provider/CI activation or cloud/domain purchases. Model/hosting runtime cost and quotas UNKNOWN.
- Runtime archive1,307,351 B; pre-switch SQLite backup233,472 B. CSS40,890 B gzip; emitted JS195,442 B gzip (not field CWV).
- Temporary browser container ran with network none, read-only, 1CPU/1GiB/160PIDs, capabilities dropped and sandbox requested; sandbox unavailable, no security relaxation. Container auto-removed.
- Permanent web limits remain1CPU/512MiB/96PIDs. Private backup and same-host restored copy retained; no customer data/cache/backups deleted.

- Final read-back: current=cecb321, container healthy, 279 runtime hashes match. Disk subsequently90.236% used /20,628,119,552 B available: WARNING, further cutovers HOLD; no cleanup performed.
