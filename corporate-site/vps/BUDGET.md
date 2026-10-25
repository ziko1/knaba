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
