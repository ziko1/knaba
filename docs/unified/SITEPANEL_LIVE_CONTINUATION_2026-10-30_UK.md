# KNABA/VSP: live continuation — 30 October 2026

Source baseline: `30191734a356b879d6f7005d077657f1fd9dd11d`. Status: **PARTIAL_LIVE_VERIFIED; FULL_HANDOVER_HOLD**.
This is a scoped operational update, not a main-branch merge or application release.

| Requirement | Observed result |
| --- | --- |
| Reuse existing implementation | Existing broker already active; 13 package blobs match both PRs; no installer rerun |
| Source acceptance | Independent 34 Python +18 simulated DOM/CLI checks passed |
| Linux permissions and active sessions | Stale KNABA GUI groups removed through targeted session-manager restart; reviewed private VSP roots, tmp artifacts, logs, Docker and LXD access denied afterward |
| Panel identity | Real Linux UID catalogs contain only assigned sites; foreign-site unsupported action returns not_found |
| PAM | Account authorization stage accepts only intended users among five probed identities; password authentication not run |
| Resource separation | Current targets unique; private Docker namespaces and separate mount roots; no cross-account dependencies on the two controlled systemd units |
| Actual operation | Each user's start request against its already-running own Docker container succeeded; one KNABA backup completed with SQLite integrity ok / FK0 |
| Noninterference | All 11 container IDs/start times and sampled service PIDs/timestamps unchanged across corrections and operations; six local site health probes HTTP200 |
| Backups/log privacy | Root-only production backups; new snapshot root0600; no raw logs returned by panel; VSP preservation remains VSP-only |
| TLS | Localhost HTTPS200 with explicit installed-certificate trust; VPN IP certificate mismatch. Tailscale certificate request rejected by account capability |
| Browser | Private VPN endpoint unreachable from available cloud browser; authenticated UI NOT_RUN |
| Reboot recovery | Enabled configuration observed; actual host reboot after these changes NOT_RUN |
| Credentials/DNS/sites | Not modified; website stop/restart not executed |

Independent reviewers: `/root/sitepanel_review` (source and test plan) and `/root/host_security_review` (live security, before/after readback). Coordinator performed the approved host corrections and bounded operations. Native Codex runtime was used; no additional cloud AI API or paid service was activated. Unknown billing/quota is not represented as zero.

## Remaining work

1. Resolve a supported hostname-valid TLS certificate route with the tailnet owner. Do not disable TLS verification or expose Cockpit publicly to complete QA.
2. Complete actual Cockpit login and own-site UI journeys for both existing Linux accounts using their credentials privately. Account-stage PAM success is insufficient.
3. In an agreed maintenance window with independent recovery access, restart existing VSP application services to drop stale supplemental group state and perform a host reboot; then revalidate the same exact installed package and current registry.
4. Keep direct production secrets and backups administrator-only. Provide any additional owner/developer file-management requirement through a separately reviewed scoped interface, without granting Docker/root.
5. Retain future guard-hardening items: cross-owner target uniqueness, shared namespaces, systemd dependency validation. Current deployed configuration passes the corresponding manual checks.
6. Full filesystem privacy, arbitrary resource exhaustion, physical-console/root ownership and all browser/device journeys are outside the established evidence; shared-host account controls are not VM isolation.

Source/package runtime hashes:
- Broker: `00235ea31da5dddbddcb78d27486962d1dbec7d17479c87d2d283798ce0eed79`.
- Service: `d3d4fb270faa6494ec0125212b2c08d02c49836c9d662599d3ef34a7f69b248a`.

Private host registry, IPs, credential files, backup contents and raw host receipts are deliberately excluded from Git. An authorized operator retains the detailed audit/rollback packet.

The newly created backup was checked for integrity; restore from that snapshot is NOT_RUN. Future QA artifacts must use a private TMPDIR/umask077, because a one-time directory chmod does not protect later recreation.
