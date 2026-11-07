#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
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
  scripts/tests/ErpConsoleTransportTest.java
java -cp "$KNABA_TRANSPORT_TEST_DIR:$KNABA_TRANSPORT_JSON" de.knaba.mobile.ErpConsoleTransportTest
