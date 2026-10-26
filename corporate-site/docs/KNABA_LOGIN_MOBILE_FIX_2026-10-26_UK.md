# KNABA developer-preview login mobile reflow — 26.10.2026

Root cause reproduced in real Chromium: at 390 CSS px, original login panel
used content-box width 90vw plus two-sided padding 2.2rem, causing 33px horizontal overflow.

Safe fix: login-only main panel now uses border-box sizing and a viewport-bound
width of calc(100vw - 32px). No changes to password hashing, HTTP sessions,
role authorization, return_to allowlist or owner enrollment.

Exact tested executable commit ddf3db88cbce01b50991eb88740ad799fd378f39
from live source c08e58c41ddad287c154fcfc597654e777fa8db6.

RED -> GREEN: vps/login-layout.test.mjs expected failure before CSS and PASS after.
Fresh offline Node24.22.1 QA on same code: Astro/Svelte/Vue checks, 184 Vitest,
16 Node, 27 focused tests and 24 VPS tests; 118-page build/static verifier PASS.
Client artifact SHA256 unchanged from live: 70d004af331c80dc515a9c65fe809b29c7e275885a684b278d27b242e8331587.
Real isolated Chromium at 320,360,390,768px: zero horizontal overflow,
visible password input, login panel border-box sizing PASS.

Still blocked: owner identity not verified; /readyz=503, actual owner login and
password recovery/UAT NOT_RUN. Do not generate or disclose a privileged real
owner password without a verified invitation and security review.

Deployment requires current-source lease, immutable source bundle, SQLite
backup+integrity, domain health, 4-locale route parity, negative access tests
and rollback. Official knaba.de is out of scope.
