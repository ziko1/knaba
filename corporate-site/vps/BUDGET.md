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

## PR #66 guide restoration — 25.10.2026

- External paid APIs/providers/subscriptions activated by this task: **none**. No Google Ads/Analytics, IndexNow send, new cloud inference or paid CI calls. Existing shared VPS and cached Node24/Chromium images were reused.
- Hosting operational cost, remaining cloud quotas, model credits and provider balances: **UNKNOWN**; do not infer zero from no newly activated providers.
- Isolated QA constrained to at most 2 vCPU, 3 GiB RAM, 260 PIDs, no network inside containers; temporary source checkouts removed by shell trap.
- Measured latest VPS disk: 197 GiB total, ~166 GiB used, ~22 GiB available (~89% used). Storage change belongs to concurrent VPS maintenance; this source task did **not** delete shared data or prune Docker.
- Before a real preview release: reserve disk headroom/rollback capacity and require locked artifact build. Before marketing/AI spend: obtain exact API pricing/quota, explicit allowance, approved data scope and reserved budget.
