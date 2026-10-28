# KNABA Mobile — roadmap

- M0 Candidate: website `/app/` localization and installation entry; native secure URL handoff, tests, safe release-link configuration. Target: inspectable Draft PR, source validation and build evidence.
- M1 Portable site+ERP authentication: verified operator accounts, invitations, PKCE/OIDC & explicit account migration; independent security tests.
- M2 Role data parity: real approved client order state and correspondence, worker job assignment/reporting, partner isolation, operator dispatch. Versioned authoritative ERP bridging only after integration tests.
- M3 Native role screens & offline: on-device role-specific dashboards, encrypted outbox and safe updates, push only with opt-in and verified quota.
- M4 Ownership handover: new server, environment config, backed up data, signed Android/iOS packages, mobile hardware UAT, release and rollback.

**Gates:** no synthetic pass replacing real backend, no own-domain OAuth until credentials and consent confirmed, no implicit deploy/merge.
