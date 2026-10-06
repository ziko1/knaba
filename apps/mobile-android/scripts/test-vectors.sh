#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
KNABA_NATIVE_TEST_DIR=$(mktemp -d /tmp/knaba-native-vectors.XXXXXX)
trap 'rm -rf "$KNABA_NATIVE_TEST_DIR"' EXIT
python3 - ../../tests/native-vectors.json "$KNABA_NATIVE_TEST_DIR/NativeVectors.java" <<'PY'
import json, sys
fixture = json.load(open(sys.argv[1])); vectors = fixture['classifier']
lines=['import de.knaba.mobile.ConservativeGeofence;','public class NativeVectors { public static void main(String[] args) { int tested=0;']
for vector in vectors:
    accuracy='null' if vector['accuracyM'] is None else str(float(vector['accuracyM']))
    call=f"ConservativeGeofence.classify({float(vector['distanceM'])}, {accuracy}, {float(vector['enterM'])}, {float(vector['exitM'])}, {float(vector['maxAccuracyM'])})"
    lines.append(f"if (!{json.dumps(vector['expected'])}.equals({call})) throw new AssertionError({json.dumps(vector['name'])}); tested++;")
for vector in fixture.get('exceptionZones',[]):
    radii='new double[]{'+','.join(str(float(n)) for n in vector['radiiM'])+'}'
    distances='new double[]{'+','.join(str(float(n)) for n in vector['distancesM'])+'}'
    call=f"ConservativeGeofence.classifyZones({float(vector['distanceM'])}, {float(vector['accuracyM'])}, 150.0, 200.0, 50.0, {radii}, {distances})"
    lines.append(f"if (!{json.dumps(vector['expected'])}.equals({call})) throw new AssertionError({json.dumps(vector['name'])}); tested++;")
lines.append('if(Math.abs(ConservativeGeofence.distance(52.52,13.4,52.52,13.4))>0.001)throw new AssertionError("identical coordinates"); tested++;')
lines.append('double metres=ConservativeGeofence.distance(52.52,13.4,52.521,13.4); if(metres<110||metres>113)throw new AssertionError("metre latitude order"); tested++;')
lines.append('System.out.println("PASSED native Java geofence vectors="+tested+"; synthetic calculation only, no Android runtime or physical GPS claim"); }}')
open(sys.argv[2],'w').write('\n'.join(lines))
PY
if command -v javac >/dev/null 2>&1; then
  KNABA_JAVAC=(javac)
elif java --list-modules | grep -q '^jdk.compiler@'; then
  KNABA_JAVAC=(java --module jdk.compiler/com.sun.tools.javac.Main)
else
  echo 'BLOCKED_EXTERNAL: JDK compiler required for native Java vectors'; exit 69
fi
"${KNABA_JAVAC[@]}" -source 17 -target 17 -d "$KNABA_NATIVE_TEST_DIR" app/src/main/java/de/knaba/mobile/ConservativeGeofence.java "$KNABA_NATIVE_TEST_DIR/NativeVectors.java"
java -cp "$KNABA_NATIVE_TEST_DIR" NativeVectors
