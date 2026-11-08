import com.android.apksig.*;
import java.io.*;
import java.security.*;
import java.util.*;
var r = new ApkVerifier.Builder(new File("/workspace/scratch/fe1b7c871eec/deliverables/KNABA-0.4.1-test.apk")).build().verify();
System.out.println("KNABA_RESULT verified="+r.isVerified()+" v1="+r.isVerifiedUsingV1Scheme()+" v2="+r.isVerifiedUsingV2Scheme()+" v3="+r.isVerifiedUsingV3Scheme()+" errors="+r.getErrors()+" warnings="+r.getWarnings());
for(var c:r.getSignerCertificates()) { System.out.println("KNABA_CERT sha256="+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(c.getEncoded()))+" notBefore="+c.getNotBefore().toInstant()+" notAfter="+c.getNotAfter().toInstant()+" issuer="+c.getIssuerX500Principal()); }
/exit
