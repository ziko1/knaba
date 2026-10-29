# KNABA Mobile — module memory

Project: KNABA DE (separate from AVENQO). Mobile module inside `ziko1/knaba`, not a new standalone business domain. Candidate based on `feat/knaba-customer-release-20261028`; work in `feat/knaba-android-ios-workspace-20261028` one stacked Draft PR. Read canonical repo rules first.

Existing Android `de.knaba.mobile` and iOS `de.knaba.mobile` native apps implement employee device enrollment, work-time/GPS/offline sync, **not full native role parity**. Existing Astro role portal `/konto/` and owner Control Center `/admin/` provide login/role views via browser; ERP `/console` separate login. PR #110 contains pending user/partner/owner grant and OIDC changes, not customer-live. New `/app/` acts as role-aware installable mobile web entry and native system-browser handoff. No backend unification or website-to-ERP SSO.

Next security/release tasks: verify site build and PWA manifest; browser UAT; actual Android SDK/Gradle and Xcode builds; server migration, auth bridge and full role API; signed distributions and owner acceptance. GPS stays opt-in/OFF unless explicitly authorized. No production deploy or paid vendor activation.
