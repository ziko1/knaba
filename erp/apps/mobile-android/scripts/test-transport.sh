#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/test-federation-policy.py
# org.json is built into Android. JVM tests require its standalone implementation,
# supplied explicitly; no production dependency or automatic network download.
KNABA_TRANSPORT_JSON="${KNABA_JSON_TEST_JAR:-}"
[[ -n "$KNABA_TRANSPORT_JSON" && -f "$KNABA_TRANSPORT_JSON" ]] || { echo 'BLOCKED: supply KNABA_JSON_TEST_JAR with org.json 20240303 for CPU transport tests' >&2; exit 69; }
[[ "$(sha256sum "$KNABA_TRANSPORT_JSON" | cut -d ' ' -f 1)" == 3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed ]] || { echo 'BLOCKED: test JSON dependency hash differs from pinned org.json 20240303' >&2; exit 69; }
KNABA_TRANSPORT_TEST_DIR=$(mktemp -d /tmp/knaba-transport.XXXXXX)
trap 'rm -rf "$KNABA_TRANSPORT_TEST_DIR"' EXIT
if command -v javac >/dev/null 2>&1; then
  KNABA_TRANSPORT_JAVAC=(javac)
elif java --list-modules | grep -q '^jdk.compiler@'; then
  KNABA_TRANSPORT_JAVAC=(java --module jdk.compiler/com.sun.tools.javac.Main)
else
  echo 'BLOCKED: JDK17 compiler required' >&2; exit 69
fi
"${KNABA_TRANSPORT_JAVAC[@]}" -source 17 -target 17 -cp "$KNABA_TRANSPORT_JSON" -d "$KNABA_TRANSPORT_TEST_DIR" \
  app/src/main/java/de/knaba/mobile/ErpOriginPolicy.java \
  app/src/main/java/de/knaba/mobile/ErpConsoleTransport.java \
  app/src/main/java/de/knaba/mobile/ErpFederationLogin.java \
  app/src/main/java/de/knaba/mobile/ErpFederationBrowser.java \
  app/src/main/java/de/knaba/mobile/ErpMedia.java \
  app/src/main/java/de/knaba/mobile/ErpMediaIo.java \
  app/src/main/java/de/knaba/mobile/ErpCommandSecrets.java \
  app/src/main/java/de/knaba/mobile/ErpReadRetry.java \
  app/src/main/java/de/knaba/mobile/ErpServerDiscovery.java \
  scripts/tests/ErpConsoleTransportTest.java \
  scripts/tests/ErpMediaTransportTest.java \
  scripts/tests/ErpMediaMemoryTest.java \
  scripts/tests/ErpMediaIoTest.java \
  scripts/tests/ErpCredentialSafetyTest.java \
  scripts/tests/ErpServerDiscoveryTest.java \
  scripts/tests/ErpFederationCookieTest.java \
  scripts/tests/ErpFederationLoginTest.java \
  scripts/tests/ErpFederationHttpTest.java
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpConsoleTransportTest
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpMediaTransportTest
java -Xmx96m -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpMediaMemoryTest
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpMediaIoTest
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpCredentialSafetyTest
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpServerDiscoveryTest
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpFederationCookieTest
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpFederationLoginTest
java -Dsun.net.http.allowRestrictedHeaders=true -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpFederationHttpTest
