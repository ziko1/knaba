package de.knaba.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.io.*;
import java.nio.file.Files;
import java.security.*;
import java.security.cert.Certificate;
import java.security.spec.AlgorithmParameterSpec;
import java.util.*;
import javax.crypto.*;
import static org.junit.Assert.*;

/** Actual AES-GCM/AtomicFile round trips with an explicit in-memory Keystore provider.
 * Proves application persistence/isolation, not hardware Keystore or actual OS process death. */
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class ConsoleRecoveryJournalTest {
    private static final Map<String,Key> keys = new HashMap<>();
    private Context context;
    private final String scope = "a".repeat(64);
    @Before public void setup() {
        context = RuntimeEnvironment.getApplication(); keys.clear();
        Security.removeProvider("AndroidKeyStore");
        Provider provider = new Provider("AndroidKeyStore",1.0,"Explicit test-only Keystore double") {};
        provider.put("KeyStore.AndroidKeyStore",TestKeys.class.getName());
        provider.put("KeyGenerator.AES",TestGenerator.class.getName()); Security.addProvider(provider);
        for(String name: new String[]{"knaba-secure-v1.bin","knaba-console-recovery-v1.bin"})
            for(String suffix: new String[]{"",".bak",".new"}) new File(context.getFilesDir(),name+suffix).delete();
    }
    @After public void teardown(){ Security.removeProvider("AndroidKeyStore"); keys.clear(); }
    private File journalFile(){ return new File(context.getFilesDir(),"knaba-console-recovery-v1.bin"); }
    private String envelope(String key) throws Exception {
        return new JSONObject().put("version",1).put("scope",scope).put("name","message.send")
            .put("body",new JSONObject().put("idempotency_key",key).put("input",new JSONObject().put("text","PRIVATE_RECOVERY_PAYLOAD"))).toString();
    }
    @Test public void encryptedRecordSurvivesNewStoreAndDoesNotShareGpsState() throws Exception {
        SecureStore gps = new SecureStore(context,""); gps.update(value -> { try {value.put("deviceToken","GPS_ONLY_SYNTHETIC");}catch(Exception e){throw new RuntimeException(e);}return kotlin.Unit.INSTANCE; });
        byte[] gpsBytes=Files.readAllBytes(new File(context.getFilesDir(),"knaba-secure-v1.bin").toPath());
        ConsoleRecoveryJournal journal=new ConsoleRecoveryJournal(context);String saved=envelope("saved-original-key");journal.write(scope,saved);
        byte[] ciphertext=Files.readAllBytes(journalFile().toPath());
        assertFalse(new String(ciphertext,java.nio.charset.StandardCharsets.ISO_8859_1).contains("PRIVATE_RECOVERY_PAYLOAD"));
        assertEquals(saved,new ConsoleRecoveryJournal(context).read(scope));
        assertNull(new ConsoleRecoveryJournal(context).read("b".repeat(64)));
        journal.remove(scope,"saved-original-key");assertNull(new ConsoleRecoveryJournal(context).read(scope));
        assertArrayEquals(gpsBytes,Files.readAllBytes(new File(context.getFilesDir(),"knaba-secure-v1.bin").toPath()));
        assertEquals("GPS_ONLY_SYNTHETIC",new SecureStore(context,"").read().getString("deviceToken"));
    }
    @Test public void interruptedLegacyAtomicWriteRecoversBackupWhenBaseIsMissing() throws Exception {
        ConsoleRecoveryJournal journal=new ConsoleRecoveryJournal(context);String original=envelope("legacy-backup-key");journal.write(scope,original);
        File backup=new File(journalFile().getPath()+".bak");assertTrue(journalFile().renameTo(backup));assertFalse(journalFile().exists());
        assertEquals("AtomicFile.openRead must restore its own legacy backup",original,new ConsoleRecoveryJournal(context).read(scope));
        assertTrue(journalFile().exists());assertFalse(backup.exists());
    }
    @Test public void conflictingWriteAndStaleCompletionPreserveOriginal() throws Exception {
        ConsoleRecoveryJournal first=new ConsoleRecoveryJournal(context),second=new ConsoleRecoveryJournal(context);String original=envelope("original-key");
        first.write(scope,original);second.write(scope,original);
        assertThrows(IllegalArgumentException.class,()->second.write(scope,envelope("replacement-key")));
        assertThrows(IllegalArgumentException.class,()->second.remove(scope,"wrong-key"));assertEquals(original,first.read(scope));
    }
    @Test public void tamperedCiphertextFailsClosedWithoutDeletingRecord() throws Exception {
        ConsoleRecoveryJournal journal=new ConsoleRecoveryJournal(context);journal.write(scope,envelope("integrity-key"));
        byte[] bytes=Files.readAllBytes(journalFile().toPath());bytes[bytes.length-1]^=1;Files.write(journalFile().toPath(),bytes);
        assertThrows(Exception.class,()->new ConsoleRecoveryJournal(context).read(scope));assertArrayEquals(bytes,Files.readAllBytes(journalFile().toPath()));
    }
    @Test public void sizeAndScopeLimitsFailBeforeOverwritingExistingRecords() throws Exception {
        ConsoleRecoveryJournal journal=new ConsoleRecoveryJournal(context);
        for(int i=0;i<16;i++)journal.write(String.format("%064x",i),envelope("key-"+i));
        assertThrows(IllegalArgumentException.class,()->journal.write("f".repeat(64),envelope("overflow-key")));
        assertNotNull(journal.read(String.format("%064x",0)));
        assertThrows(IllegalArgumentException.class,()->journal.write(scope,"x".repeat(70001)));
        try(RandomAccessFile oversized=new RandomAccessFile(journalFile(),"rw")){oversized.setLength(4*1024*1024+30);}
        IllegalArgumentException error=assertThrows(IllegalArgumentException.class,()->journal.read(scope));assertEquals("SECURE_STORAGE_TOO_LARGE",error.getMessage());
    }
    public static final class TestGenerator extends KeyGeneratorSpi {
        String alias;
        @Override protected void engineInit(AlgorithmParameterSpec spec,SecureRandom random){alias=((KeyGenParameterSpec)spec).getKeystoreAlias();}
        @Override protected void engineInit(SecureRandom random){throw new UnsupportedOperationException();}
        @Override protected void engineInit(int size,SecureRandom random){throw new UnsupportedOperationException();}
        @Override protected SecretKey engineGenerateKey(){try{KeyGenerator real=KeyGenerator.getInstance("AES","SunJCE");real.init(256);SecretKey key=real.generateKey();keys.put(alias,key);return key;}catch(Exception e){throw new IllegalStateException(e);}}
    }
    public static final class TestKeys extends KeyStoreSpi {
        public Key engineGetKey(String alias,char[] password){return keys.get(alias);}
        public void engineDeleteEntry(String alias){keys.remove(alias);}
        public void engineLoad(InputStream in,char[] password){}
        public void engineStore(OutputStream out,char[] password){}
        public Certificate[] engineGetCertificateChain(String alias){return null;}
        public Certificate engineGetCertificate(String alias){return null;}
        public Date engineGetCreationDate(String alias){return null;}
        public void engineSetKeyEntry(String alias,Key key,char[] password,Certificate[] chain){keys.put(alias,key);}
        public void engineSetKeyEntry(String alias,byte[] key,Certificate[] chain){throw new UnsupportedOperationException();}
        public void engineSetCertificateEntry(String alias,Certificate cert){throw new UnsupportedOperationException();}
        public Enumeration<String> engineAliases(){return Collections.enumeration(keys.keySet());}
        public boolean engineContainsAlias(String alias){return keys.containsKey(alias);}
        public int engineSize(){return keys.size();}
        public boolean engineIsKeyEntry(String alias){return keys.containsKey(alias);}
        public boolean engineIsCertificateEntry(String alias){return false;}
        public String engineGetCertificateAlias(Certificate cert){return null;}
    }
}
