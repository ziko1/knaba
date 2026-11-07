# Independent review — Android 0.4.0 test candidate

Reviewer: `/root/android_qa`, separate from the UI, transport and demo implementation agents. Scope: new Android test increment and changed root source assertions; not an audit of the full KNABA product or live services.

## Findings resolved

- Human quantities must convert exactly once to server integer thousandths. Server default 1000 is displayed as 1; a UI regression exercises this behavior.
- Gesture Back uses the registered Android platform callback on API33+ with cleanup; the legacy key/fallback path remains available and Android12L key dispatch is explicitly tested. Explicit tests cover each path. The narrow lint suppression is not a replacement for this implementation.
- Receiver flags are gated to API33+; the package-scoped signature permission also protects API31/32. The separate test identifier has its own permission.
- Android12+ cloud backup and device transfer explicitly exclude protected local storage. All six locales remain available when bundle language splitting is disabled.
- Root source assertion accepts the immutable captured transport reference used for asynchronous operations. No behavioral/auth assertion was removed to force a pass.

## Review outcome

No further blocking finding for a separately installed, clearly labelled test APK. API calls preserve server authorization. Async responses are tied to the original screen/session; login secrets are not saved in view state. Uncertain mutation recovery retains its original payload and idempotency key. Logout detaches the session immediately. Demo is explicitly synthetic, memory-only, without network/GPS activation.

Five actual Robolectric-rendered phone/tablet images were visually reviewed: readable wrapping and touch targets without horizontal overflow. These are framework-simulation images, not screenshots from a physical handset. Tablet layout remains a spacious single column. Demo business records are German seed data; UI language is separately selectable.

The Robolectric legacy manifest parser does not copy the Back opt-in flag into runtime ApplicationInfo. Tests therefore first assert the flag in the actual compiled binary manifest, then enable the same runtime feature through the supported ShadowApplication API. Assertions still exercise the registered framework callback; no private app callback is invoked.

## Open gates

- Pending console mutation recovery survives configuration change, not process death.
- Real ERP login, tenant isolation and role/business UAT need an accessible approved test ERP and accounts.
- Physical installation, updates/data retention, GPS, battery/OEM behavior and customer acceptance: NOT_RUN.
- Owner Android signing, iOS compilation/signing and all remaining canonical roadmap requirements remain open.
- Final build/test/lint results and artifact fingerprints must be read from verification.json and commit-binding.json; this prose alone does not accept them.

## Platform references used during review

- https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture
- https://developer.android.com/reference/android/window/OnBackInvokedDispatcher
- https://developer.android.com/identity/data/autobackup
- https://developer.android.com/develop/background-work/background-tasks/broadcasts
