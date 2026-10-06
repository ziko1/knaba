#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
KNABA_LOCALE_TEST_DIR=$(mktemp -d /tmp/knaba-native-locales.XXXXXX)
trap 'rm -rf "$KNABA_LOCALE_TEST_DIR"' EXIT
python3 - <<'PY'
from pathlib import Path
import re
from xml.etree import ElementTree as ET
root=Path('app/src/main')
folders=['values','values-uk','values-ru','values-pl','values-lt','values-en']
tables={folder:{s.attrib['name']:''.join(s.itertext()) for s in ET.parse(root/'res'/folder/'strings.xml').getroot().findall('string')} for folder in folders}
base=tables['values'];assert len(base)>=80
for folder,table in tables.items():
    assert table.keys()==base.keys(),(folder,'missing/extra resource')
    for key,value in table.items():
        assert value.strip(),(folder,key,'empty translation')
        assert sorted(re.findall(r'%\d+\$[sd]',value))==sorted(re.findall(r'%\d+\$[sd]',base[key])),(folder,key,'format mismatch')
    if folder!='values':
        for key in ['privacy_notice','permission_denied','my_shift','error_access','notification_body','shift_manual_notice']:
            assert table[key]!=base[key],(folder,key,'untranslated privacy/action text')
for source in (root/'java').rglob('*.kt'):
    text=source.read_text()
    for resource in re.findall(r'R\.string\.([a-z_]+)',text):assert resource in base,(source,resource)
    if source.name in ['MainActivity.kt','TrackingService.kt']:
        assert not re.search(r'(?:text|hint)\s*=\s*"',text),(source,'hardcoded visible text')
        assert not re.search(r'setContent(?:Title|Text)\("',text),(source,'hardcoded notification')
manifest=ET.parse(root/'AndroidManifest.xml').getroot()
app=manifest.find('application'); ns='{http://schemas.android.com/apk/res/android}'
assert app.attrib[ns+'allowBackup']=='false' and app.attrib[ns+'usesCleartextTraffic']=='false'
assert not any(p.attrib[ns+'name']=='android.permission.ACCESS_BACKGROUND_LOCATION' for p in manifest.findall('uses-permission'))
for name in ['MainActivity.kt','TrackingService.kt']:
    source=(root/'java/de/knaba/mobile'/name).read_text()
    assert 'POST_NOTIFICATIONS' in source and 'areNotificationsEnabled()' in source and 'IMPORTANCE_NONE' in source,(name,'visible notification gate absent')
service=(root/'java/de/knaba/mobile/TrackingService.kt').read_text()
assert service.count('if (!hasTrackingPermissions())')>=3,'permission revoke not fenced in start/heartbeat/location callback'
print('PASSED actual Android XML: six locales, '+str(len(base))+' complete strings each, format parity, privacy/action/notification translations and resource references; no Android runtime claim')
PY
cat > "$KNABA_LOCALE_TEST_DIR/NativeLocaleVectors.java" <<'JAVA'
import de.knaba.mobile.LanguagePolicy;
import de.knaba.mobile.ShiftClock;
import de.knaba.mobile.GenerationFence;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
public final class NativeLocaleVectors {
    private static int cases=0;
    private static void check(boolean result,String name){if(!result)throw new AssertionError(name);cases++;}
    public static void main(String[] args) throws Exception {
        for(String tag:LanguagePolicy.SUPPORTED){
            check(tag.equals(LanguagePolicy.resolve(tag,Collections.singletonList("fr-FR"))),"explicit "+tag);
            check(tag.equals(LanguagePolicy.resolve("",Arrays.asList("fr-FR",tag.toUpperCase()+"_XX"))),"device fallback "+tag);
        }
        check("uk".equals(LanguagePolicy.resolve("uk-UA",Collections.singletonList("en-US"))),"explicit language priority");
        check("pl".equals(LanguagePolicy.resolve("invalid",Arrays.asList("es-ES","pl-PL","en-GB"))),"first supported device locale");
        check("de".equals(LanguagePolicy.resolve("",Arrays.asList("fr-FR","es-ES"))),"German unsupported fallback");
        check("de".equals(LanguagePolicy.resolve(null,null)),"null device fallback");
        check(LanguagePolicy.supportedTag("<ru>")==null,"malformed language");
        try{LanguagePolicy.SUPPORTED.add("fr");throw new AssertionError("immutable supported list");}catch(UnsupportedOperationException good){cases++;}
        String started="2026-10-06T08:00:00Z",asOf="2026-10-06T10:00:00Z",expires="2026-10-06T10:05:00Z";
        check(Long.valueOf(7201).equals(ShiftClock.elapsedSeconds(started,asOf,expires,1000,2000)),"server anchored monotonic timer");
        check(Long.valueOf(0).equals(ShiftClock.elapsedSeconds("2026-10-06T09:59:59.900Z","2026-10-06T10:00:00.100Z",expires,0,0)),"subsecond boundary floors elapsed duration");
        check(ShiftClock.elapsedSeconds(started,asOf,expires,1000,301000)==null,"lease exact expiry suppressed");
        check(ShiftClock.elapsedSeconds(started,asOf,"2026-10-06T11:00:00Z",1000,301001)==null,"maximum five-minute extrapolation");
        check(ShiftClock.elapsedSeconds(started,asOf,expires,1000,999)==null,"monotonic reset suppressed");
        check(ShiftClock.elapsedSeconds("2026-10-06T10:00:01Z",asOf,expires,1000,1000)==null,"future start suppressed");
        check(ShiftClock.elapsedSeconds(started,"invalid",expires,0,1)==null,"unknown server clock suppressed");
        check(ShiftClock.elapsedSeconds(started,asOf,"invalid",0,1)==null,"unknown lease suppressed");
        check(ShiftClock.elapsedSeconds(null,asOf,expires,0,1)==null,"missing start suppressed");
        check("00:00:00".equals(ShiftClock.duration(0)),"zero duration");
        check("26:01:01".equals(ShiftClock.duration(93661)),"hours do not wrap at midnight");
        try{ShiftClock.duration(-1);throw new AssertionError("negative duration");}catch(IllegalArgumentException good){cases++;}
        GenerationFence fence=new GenerationFence();long previous=fence.capture();AtomicReference<String> privateState=new AtomicReference<>(null);CountDownLatch captured=new CountDownLatch(1),release=new CountDownLatch(1);AtomicReference<Throwable> workerFailure=new AtomicReference<>();
        Thread delayed=new Thread(()->{try{captured.countDown();if(!release.await(2,TimeUnit.SECONDS))throw new AssertionError("release missing");fence.run(previous,()->privateState.set("OLD_PRIVATE_SESSION"));workerFailure.set(new AssertionError("stale response accepted"));}catch(IllegalStateException expected){}catch(Throwable error){workerFailure.set(error);}});
        delayed.start();check(captured.await(2,TimeUnit.SECONDS),"request captured before logout");fence.invalidate();fence.run(fence.capture(),()->privateState.set("NEW_ACCOUNT_CONTEXT"));release.countDown();delayed.join(2000);
        check(!delayed.isAlive()&&workerFailure.get()==null,"pending response completed with generation rejection");check("NEW_ACCOUNT_CONTEXT".equals(privateState.get()),"logout/new account never restored old private session");
        try{fence.run(previous,()->privateState.set("OLD_DEVICE_TOKEN"));throw new AssertionError("old enrollment applied");}catch(IllegalStateException expected){cases++;}
        long current=fence.capture();fence.run(current,()->privateState.set("CURRENT_VALID_CONTEXT"));check("CURRENT_VALID_CONTEXT".equals(privateState.get()),"current callback still accepted");
        fence.invalidate();try{fence.requireCurrent(current);throw new AssertionError("old tracking generation accepted");}catch(IllegalStateException expected){cases++;}
        System.out.println("PASSED native language and display-clock Java vectors="+cases+"; no Android runtime, payroll or GPS authorization claim");
    }
}
JAVA
if command -v javac >/dev/null 2>&1; then
  KNABA_LOCALE_JAVAC=(javac)
elif java --list-modules | grep -q '^jdk.compiler@'; then
  KNABA_LOCALE_JAVAC=(java --module jdk.compiler/com.sun.tools.javac.Main)
else
  echo 'BLOCKED_EXTERNAL: JDK compiler required for actual native language/timer vectors'; exit 69
fi
"${KNABA_LOCALE_JAVAC[@]}" -source 17 -target 17 -d "$KNABA_LOCALE_TEST_DIR" app/src/main/java/de/knaba/mobile/LanguagePolicy.java app/src/main/java/de/knaba/mobile/ShiftClock.java app/src/main/java/de/knaba/mobile/GenerationFence.java "$KNABA_LOCALE_TEST_DIR/NativeLocaleVectors.java"
java -cp "$KNABA_LOCALE_TEST_DIR" NativeLocaleVectors
