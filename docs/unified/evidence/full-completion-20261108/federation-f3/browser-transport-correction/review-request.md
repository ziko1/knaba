# F3 rendered fixture: real HTTPS return transport

Status: **SOURCE_FROZEN_FOR_INDEPENDENT_REVIEW**. Base
`77b64956d94f68233dff80e35b5b0e73a2e9ef50`; exactly three test paths are frozen
in `source-manifest.json`. No application runtime or CI policy is changed.

## Observed failure and correction

The actual77 browser trace reaches the real source 303 after password and
consent. Its redirected ERP return GET bypasses the pinned Playwright
interception and fails DNS for the virtual hostname. The previous topology
and locator corrections executed; the source landing Strict cookie was
absent, source POST cookie present, and returning Lax/Strict cookie behavior
was already correct. The aggregate remains FAILED.

Only this existing WEB case now supplies a real ephemeral HTTPS ERP origin.
Node listens on `127.0.0.1` with an ephemeral port. It serves the current built
`dist/web/index.html` only for the exact GET target, expected request ID and
Host. Other methods, paths, aliases, query additions and Host values get 404.
Subsequent built assets and API calls retain the fixture's existing explicit
route/method validation using the same overridden origin. Other nine F3
cases keep their existing virtual origins and byte-identical test bodies.

The original source 303 remains a real redirect. There is no replacement
`page.goto`, script navigation or forwarded Cookie header. Return-cookie
assertions read immutable snapshots of headers actually received by the
HTTPS listener. The case additionally requires exactly one accepted return
request and no unexpected receiver requests.

Installed OpenSSL generates the self-signed certificate in a private
temporary directory, under a ten-second timeout. The private key is mode
0600, its directory 0700, PEM files are removed before receiver startup
completes, and the temporary input buffers are cleared after TLS context
creation. Request/header/handshake and shutdown waits are bounded. The case
closes the listener and all its own connections in `finally`; cleanup is
idempotent. Certificate-error tolerance is limited to this one case in an
unnamed Playwright suite. This is synthetic transport, not public TLS trust.

## Local verification

- **4/4 actual Node HTTPS helper tests PASS**, zero skipped. They cover exact
  HTML and incoming-header preservation, default TLS rejection of the
  self-signed certificate, target/method/Host negatives, PEM cleanup,
  unfinished-connection shutdown and invalid/unbounded input. These are not
  browser SameSite, MFA or PostgreSQL tests.
- **TypeScript PASS**, exit 0. The initial draft had three narrow type errors;
  its failed log is retained. Final helper tests and typecheck ran after the
  type corrections.
- **Collection PASS: 19 cases / 3 files**, with exact full titles equal to
  baseline: 4 conversation transfer, 5 F2 linking, 10 F3 login. The unnamed
  suite adds no title. `collection-invariants.json` records the comparison.
- `git diff --check` PASS.

The default collection reporter generated a tracked browser-result file.
That list-only output is preserved in verification, and the tracked file was
restored to exact HEAD bytes. Only the three assigned test paths remain
changed. Collection may use `--reporter=list` to avoid report writes.

## Required next evidence

Corrected **actual browser execution is NOT_RUN** locally. Root must review
the exact frozen files and run the reserved hosted checkpoint. No native,
privacy, production, public redirect ownership or whole-product acceptance
is claimed. There was no commit, push, CI dispatch or dependency installation.
