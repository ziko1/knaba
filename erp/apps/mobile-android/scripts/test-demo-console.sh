#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
KNABA_DEMO_JSON_JAR="${KNABA_JSON_JAR:?Set KNABA_JSON_JAR to a verified org.json JVM implementation JAR}"
[[ -f "$KNABA_DEMO_JSON_JAR" ]] || { echo 'Missing JSON implementation' >&2; exit 69; }
KNABA_DEMO_CLASSES=$(mktemp -d /tmp/knaba-demo-console.XXXXXX)
trap 'rm -rf "$KNABA_DEMO_CLASSES"' EXIT
javac -source 17 -target 17 -cp "$KNABA_DEMO_JSON_JAR" -d "$KNABA_DEMO_CLASSES" \
  app/src/main/java/de/knaba/mobile/ErpOriginPolicy.java \
  app/src/main/java/de/knaba/mobile/ErpConsoleTransport.java \
  app/src/main/java/de/knaba/mobile/ErpMedia.java \
  app/src/main/java/de/knaba/mobile/ErpCommandSecrets.java \
  app/src/main/java/de/knaba/mobile/ErpReadRetry.java \
  app/src/main/java/de/knaba/mobile/DemoConsoleTransport.java \
  scripts/fixtures/DemoConsoleTransportVectors.java
java -cp "$KNABA_DEMO_CLASSES:$KNABA_DEMO_JSON_JAR" de.knaba.mobile.DemoConsoleTransportVectors
