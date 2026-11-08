#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/test-federation-policy.py
KNABA_FEDERATION_JSON="${KNABA_JSON_TEST_JAR:-}"
[[ -f "$KNABA_FEDERATION_JSON" ]] || { echo 'BLOCKED: KNABA_JSON_TEST_JAR is required' >&2; exit 69; }
[[ "$(sha256sum "$KNABA_FEDERATION_JSON" | cut -d ' ' -f 1)" == 3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed ]] || { echo 'BLOCKED: pinned org.json hash mismatch' >&2; exit 69; }
KNABA_FEDERATION_CLASSES=$(mktemp -d /tmp/knaba-federation.XXXXXX)
trap 'rm -rf "$KNABA_FEDERATION_CLASSES"' EXIT
javac -source 17 -target 17 -cp "$KNABA_FEDERATION_JSON" -d "$KNABA_FEDERATION_CLASSES" \
  app/src/main/java/de/knaba/mobile/{ErpOriginPolicy,ErpConsoleTransport,ErpMedia,ErpMediaIo,ErpCommandSecrets,ErpReadRetry,ErpFederationLogin,ErpFederationBrowser}.java \
  scripts/tests/ErpFederation{Cookie,Login,Http}Test.java
java -cp "$KNABA_FEDERATION_CLASSES:$KNABA_FEDERATION_JSON" de.knaba.mobile.ErpFederationCookieTest
java -cp "$KNABA_FEDERATION_CLASSES:$KNABA_FEDERATION_JSON" de.knaba.mobile.ErpFederationLoginTest
# Desktop JDK restricts Origin by default; Android's HTTP implementation permits this required API header.
java -Dsun.net.http.allowRestrictedHeaders=true -cp "$KNABA_FEDERATION_CLASSES:$KNABA_FEDERATION_JSON" de.knaba.mobile.ErpFederationHttpTest
