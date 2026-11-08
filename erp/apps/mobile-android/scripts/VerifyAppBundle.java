import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.CodeSigner;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Set;
import java.util.jar.JarFile;

/** Verify every payload entry and the APK/AAB signer identity, without requiring a public CA. */
class VerifyAppBundle {
    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[1].matches("[0-9a-fA-F]{64}")) throw new IllegalArgumentException("Expected bundle and APK certificate SHA-256");
        Path path = Path.of(args[0]);
        if (Files.size(path) > 256L * 1024 * 1024) throw new SecurityException("App bundle exceeds verification budget");
        Set<String> names = new HashSet<>();
        long total = 0; int signedEntries = 0;
        try (JarFile jar = new JarFile(path.toFile(), true)) {
            var entries = jar.entries();
            byte[] buffer = new byte[8192];
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                String name = entry.getName();
                if (!names.add(name) || name.startsWith("/") || name.contains("\\") || name.contains("../")) throw new SecurityException("Unsafe or duplicate bundle entry");
                if (entry.isDirectory()) continue;
                try (InputStream stream = jar.getInputStream(entry)) {
                    int read;
                    while ((read = stream.read(buffer)) != -1) {
                        total += read;
                        if (total > 512L * 1024 * 1024) throw new SecurityException("Expanded app bundle exceeds verification budget");
                    }
                }
                if (name.matches("(?i)META-INF/(MANIFEST\\.MF|[^/]+\\.(SF|RSA|DSA|EC))")) continue;
                CodeSigner[] signers = entry.getCodeSigners();
                if (signers == null || signers.length != 1) throw new SecurityException("Unsigned or ambiguously signed payload");
                byte[] certificate = signers[0].getSignerCertPath().getCertificates().get(0).getEncoded();
                String fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(certificate));
                if (!args[1].equalsIgnoreCase(fingerprint)) throw new SecurityException("APK and app bundle signer mismatch");
                signedEntries++;
            }
        }
        if (!names.containsAll(Set.of("BundleConfig.pb", "base/manifest/AndroidManifest.xml", "base/dex/classes.dex", "base/resources.pb"))) throw new SecurityException("Missing native app bundle payload");
        System.out.println("{\"signature\":\"PASS\",\"certificateSha256\":\"" + args[1].toLowerCase(java.util.Locale.ROOT) + "\",\"signedEntries\":" + signedEntries + ",\"structure\":\"BASE_MODULE_PRESENT\"}");
    }
}
