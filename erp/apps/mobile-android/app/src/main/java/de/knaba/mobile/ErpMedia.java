package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FilterOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Media preparation and encrypted-recovery DTOs. Never contains a cookie or a persisted URI/file body. */
final class ErpMedia {
    static final int IMAGE_BYTES = 10 * 1024 * 1024, PDF_BYTES = 20 * 1024 * 1024;
    static final int DOWNLOAD_BYTES = 25 * 1024 * 1024, QUEUE_LIMIT = 8;
    static final int MAX_UPLOAD_JSON_BYTES = ((PDF_BYTES + 2) / 3) * 4 + 2048;
    static final Set<String> STAGES = Set.of("BEFORE", "AFTER", "DEFECT", "MATERIALS", "DOCUMENT");
    static final Set<String> VISIBILITIES = Set.of("INTERNAL", "CLIENT_AFTER_APPROVAL", "CONFIDENTIAL");
    static final Set<String> EXTERNAL_ROLES = Set.of("CLIENT", "CUSTOMER", "EXTERNAL_BAULEITER", "GUEST");
    private static final Set<String> RECORD_KEYS = Set.of("format", "scope", "authority", "uploadKey", "registerKey", "sha256", "byteSize", "fileName", "mimeType", "redactionConfirmed", "input", "phase", "uploadId", "assetId", "assetVersion");
    private static final Set<String> INPUT_KEYS = Set.of("siteId", "taskId", "stage", "visibility", "caption", "retentionPurpose");
    private static final List<String> PHASES = List.of("UPLOAD_PENDING", "UPLOADED", "REGISTER_PENDING", "REGISTERED");

    static ErpConsoleTransport.Failure invalid(String code) { return new ErpConsoleTransport.Failure(0, code, false); }
    static boolean validId(String value) { return value != null && !value.isEmpty() && value.length() <= 100; }
    static String pathComponent(String value) throws Exception {
        if (!validId(value)) throw invalid("INVALID_MEDIA_CONTEXT");
        StringBuilder result = new StringBuilder();
        for (byte raw : value.getBytes(StandardCharsets.UTF_8)) {
            int b = raw & 255;
            if (b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || b == '_' || b == '-') result.append((char)b);
            else result.append(String.format(java.util.Locale.ROOT, "%%%02X", b));
        }
        return result.toString();
    }
    static String hash(byte[] bytes) throws Exception {
        StringBuilder value = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return value.toString();
    }
    static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value; List<String> keys = new ArrayList<>();
            object.keys().forEachRemaining(keys::add); Collections.sort(keys);
            List<String> fields = new ArrayList<>();
            for (String key : keys) fields.add(JSONObject.quote(key) + ":" + canonical(object.get(key)));
            return "{" + String.join(",", fields) + "}";
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value; List<String> fields = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) fields.add(canonical(array.get(i)));
            return "[" + String.join(",", fields) + "]";
        }
        if (value instanceof String) return JSONObject.quote((String) value);
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value == null || value == JSONObject.NULL) return "null";
        throw invalid("INVALID_MEDIA");
    }
    static String fileName(String supplied, String mime) {
        String name = supplied == null ? "" : supplied.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").trim();
        if (name.length() > 200) name = name.substring(0, Character.isHighSurrogate(name.charAt(199)) ? 199 : 200);
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "media" + extension(mime);
        return name;
    }
    static String extension(String mime) {
        return switch (mime) { case "image/png" -> ".png"; case "image/webp" -> ".webp"; case "application/pdf" -> ".pdf"; default -> ".jpg"; };
    }
    static String detect(byte[] bytes) throws Exception {
        if (bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255) return "image/jpeg";
        byte[] png = new byte[]{(byte)137,80,78,71,13,10,26,10};
        if (bytes.length >= 8 && Arrays.equals(Arrays.copyOf(bytes, 8), png)) return "image/png";
        if (bytes.length >= 12 && new String(bytes,0,4,StandardCharsets.US_ASCII).equals("RIFF") && new String(bytes,8,4,StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        if (bytes.length >= 5 && new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-")) return "application/pdf";
        throw invalid("MEDIA_UNSUPPORTED");
    }
    static final class FileData {
        private final byte[] bytes;
        final String name, mime, sha256;
        FileData(byte[] bytes, String name) throws Exception {
            this(bytes,name,false);
        }
        private FileData(byte[] bytes,String name,boolean takeOwnership) throws Exception {
            this.mime = detect(bytes);
            if (bytes.length < 1 || bytes.length > (mime.equals("application/pdf") ? PDF_BYTES : IMAGE_BYTES)) throw invalid("MEDIA_TOO_LARGE");
            this.bytes = takeOwnership?bytes:bytes.clone(); this.name = fileName(name, mime); this.sha256 = hash(this.bytes);
        }
        int size() { return bytes.length; }
        private void writeBase64(OutputStream output,Gate gate) throws Exception {
            // Closing the encoder emits padding, but does not close the surrounding JSON stream.
            OutputStream encoded=Base64.getEncoder().wrap(new FilterOutputStream(output) {
                @Override public void close() throws java.io.IOException { flush(); }
                @Override public void write(byte[] bytes,int offset,int count) throws java.io.IOException { out.write(bytes,offset,count); }
            });
            for(int offset=0;offset<bytes.length;offset+=8192) { gate.check(); encoded.write(bytes,offset,Math.min(8192,bytes.length-offset)); }
            encoded.close();
        }
    }
    interface Gate { void check() throws Exception; }
    /** Exact JSON bytes, streamed from the sole retained original buffer. No full base64/JSON/UTF8 copies. */
    static final class Upload {
        private static final byte[] PREFIX="{\"base64\":\"".getBytes(StandardCharsets.UTF_8);
        private final FileData file;
        private final byte[] suffix;
        Upload(FileData file,String fileName,boolean redactionConfirmed) throws Exception {
            if(fileName==null||fileName.isEmpty()||fileName.length()>200)throw invalid("INVALID_MEDIA");
            this.file=file;
            this.suffix=("\",\"fileName\":"+JSONObject.quote(fileName)+",\"mimeType\":"+JSONObject.quote(file.mime)+",\"redactionConfirmed\":"+redactionConfirmed+"}").getBytes(StandardCharsets.UTF_8);
        }
        int byteSize() { return file.size(); }
        int length() { return PREFIX.length+((file.size()+2)/3)*4+suffix.length; }
        void write(OutputStream output,Gate gate) throws Exception {
            gate.check(); output.write(PREFIX); file.writeBase64(output,gate); gate.check(); output.write(suffix);
        }
    }
    static void validateUploadKey(String key) throws Exception {
        if(key==null || !key.matches("[!-~]{8,200}")) throw invalid("INVALID_IDEMPOTENCY_KEY");
    }
    /** The provider's declared size/MIME are hints. Actual bytes and a cumulative limit decide. */
    static FileData read(InputStream stream, String name) throws Exception {
        if (stream == null) throw invalid("MEDIA_UNAVAILABLE");
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192]; int count; int maximum = PDF_BYTES; boolean headerChecked=false;
            while ((count = in.read(chunk)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw invalid("MEDIA_CANCELLED");
                if (out.size() + count > maximum) throw invalid("MEDIA_TOO_LARGE");
                out.write(chunk,0,count);
                if (!headerChecked && out.size() >= 12) {
                    maximum = detect(out.toByteArray()).equals("application/pdf") ? PDF_BYTES : IMAGE_BYTES; headerChecked=true;
                    if(out.size()>maximum)throw invalid("MEDIA_TOO_LARGE");
                }
            }
            return new FileData(out.toByteArray(), name, true);
        }
    }
    static boolean external(JSONObject actor) {
        JSONArray roles = actor.optJSONArray("roles");
        if (roles != null) for (int i=0;i<roles.length();i++) if (EXTERNAL_ROLES.contains(roles.optString(i))) return true;
        return false;
    }
    static boolean permitted(JSONObject actor, String permission) {
        JSONArray permissions = actor.optJSONArray("permissions");
        if (permissions != null) for(int i=0;i<permissions.length();i++) if (permission.equals(permissions.optString(i))) return true;
        return false;
    }
    static void validateInput(JSONObject input) throws Exception {
        Set<String> keys = new HashSet<>(); input.keys().forEachRemaining(keys::add);
        if (!INPUT_KEYS.containsAll(keys) || !keys.containsAll(Set.of("siteId","stage","visibility","caption","retentionPurpose")) ||
                !(input.opt("siteId") instanceof String) || !validId(input.optString("siteId")) || (input.has("taskId") && (!(input.opt("taskId") instanceof String) || !validId(input.optString("taskId")))) ||
                !STAGES.contains(input.optString("stage")) || !VISIBILITIES.contains(input.optString("visibility")) ||
                !(input.opt("caption") instanceof String) || input.getString("caption").length()>2000 ||
                !(input.opt("retentionPurpose") instanceof String) || input.getString("retentionPurpose").length()<3 || input.getString("retentionPurpose").length()>2000)
            throw invalid("INVALID_MEDIA_CONTEXT");
    }
    static void validateCatalog(JSONArray catalog, JSONObject input) throws Exception {
        validateInput(input);
        JSONObject command = null;
        for (int i=0;i<catalog.length();i++) if ("media.register".equals(catalog.getJSONObject(i).optString("name"))) command=catalog.getJSONObject(i);
        if (command == null || !"media.upload".equals(command.optString("permission"))) throw invalid("MEDIA_FORBIDDEN");
        JSONObject schema=command.optJSONObject("schema"), properties=schema==null?null:schema.optJSONObject("properties");
        if (properties==null || properties.optJSONObject("uploadId")==null || properties.optJSONObject("siteId")==null) throw invalid("MEDIA_SCHEMA_CHANGED");
        for(String key:List.of("stage","visibility")) {
            JSONObject definition=properties.optJSONObject(key); JSONArray values=definition==null?null:definition.optJSONArray("enum");
            boolean supported=false;
            if(values!=null) for(int i=0;i<values.length();i++) if(input.getString(key).equals(values.optString(i))) supported=true;
            if(!supported) throw invalid("MEDIA_SCHEMA_CHANGED");
        }
        for(String key:List.of("caption","retentionPurpose")) {
            JSONObject definition=properties.optJSONObject(key);
            if(definition==null || !"string".equals(definition.optString("type")) || input.getString(key).length()<definition.optInt("minLength",0) || input.getString(key).length()>definition.optInt("maxLength",2000)) throw invalid("MEDIA_SCHEMA_CHANGED");
        }
    }
    static final class Record {
        private final JSONObject value;
        Record(JSONObject value) throws Exception { this.value=new JSONObject(value.toString()); validate(); }
        static Record create(String scope,String authority,JSONObject input,FileData file,boolean redactionConfirmed) throws Exception {
            validateInput(input);
            return new Record(new JSONObject().put("format",1).put("scope",scope).put("authority",authority)
                .put("uploadKey",UUID.randomUUID().toString()).put("registerKey",UUID.randomUUID().toString())
                .put("sha256",file.sha256).put("byteSize",file.size()).put("fileName",file.name).put("mimeType",file.mime)
                .put("redactionConfirmed",redactionConfirmed).put("input",input).put("phase","UPLOAD_PENDING"));
        }
        String key() { return value.optString("uploadKey"); }
        String registerKey() { return value.optString("registerKey"); }
        String scope() { return value.optString("scope"); }
        String authority() { return value.optString("authority"); }
        String name() { return value.optString("fileName"); }
        String mime() { return value.optString("mimeType"); }
        String phase() { return value.optString("phase"); }
        String uploadId() { return value.optString("uploadId"); }
        String assetId() { return value.optString("assetId"); }
        long size() { return value.optLong("byteSize"); }
        JSONObject json() throws Exception { return new JSONObject(value.toString()); }
        JSONObject input() throws Exception { return new JSONObject(value.getJSONObject("input").toString()); }
        JSONObject registerInput() throws Exception {
            if(uploadId().isEmpty()) throw invalid("MEDIA_UPLOAD_REQUIRED");
            return input().put("uploadId",uploadId());
        }
        void requireFile(FileData file) throws Exception {
            if(!value.getString("sha256").equals(file.sha256) || size()!=file.size() || !mime().equals(file.mime)) throw invalid("MEDIA_RESELECT_MISMATCH");
        }
        Upload upload(FileData file) throws Exception {
            requireFile(file);
            return new Upload(file,name(),value.getBoolean("redactionConfirmed"));
        }
        Record uploaded(JSONObject receipt) throws Exception {
            String id=receipt.optString("uploadId");
            if(!validId(id) || (!uploadId().isEmpty()&&!uploadId().equals(id))) throw invalid("INVALID_RESPONSE");
            return new Record(json().put("uploadId",id).put("phase","UPLOADED"));
        }
        Record registering() throws Exception { return new Record(json().put("phase","REGISTER_PENDING")); }
        Record registered(JSONObject entity) throws Exception {
            JSONObject data=entity.optJSONObject("data"), context=input();
            if(!validId(entity.optString("id")) || !"media_asset".equals(entity.optString("kind")) || entity.optInt("version")<1 || data==null ||
                    !uploadId().equals(data.optString("uploadId")) || !context.getString("siteId").equals(data.optString("siteId")) ||
                    !context.optString("taskId").equals(data.optString("taskId")) || !context.getString("stage").equals(data.optString("stage")) ||
                    !context.getString("visibility").equals(data.optString("visibility"))) throw invalid("INVALID_RESPONSE");
            return new Record(json().put("phase","REGISTERED").put("assetId",entity.getString("id")).put("assetVersion",entity.getInt("version")));
        }
        private void validate() throws Exception {
            Set<String> keys=new HashSet<>(); value.keys().forEachRemaining(keys::add);
            for(String key:List.of("scope","authority","uploadKey","registerKey","sha256","fileName","mimeType","phase"))if(!(value.opt(key) instanceof String))throw invalid("MEDIA_RECOVERY_INVALID");
            if(!RECORD_KEYS.containsAll(keys) || !(value.opt("format") instanceof Number) || value.optDouble("format")!=1 || !scope().matches("[a-f0-9]{64}") || !authority().matches("[a-f0-9]{64}") ||
                    !value.optString("sha256").matches("[a-f0-9]{64}") || !PHASES.contains(phase()) || !(value.opt("redactionConfirmed") instanceof Boolean) ||
                    name().isEmpty() || name().length()>200 || !name().equals(fileName(name(),mime())) || !(value.opt("byteSize") instanceof Number) || value.optDouble("byteSize")!=size() || size()<1 || size()>(mime().equals("application/pdf")?PDF_BYTES:IMAGE_BYTES) ||
                    !Set.of("image/jpeg","image/png","image/webp","application/pdf").contains(mime())) throw invalid("MEDIA_RECOVERY_INVALID");
            try { if(!UUID.fromString(key()).toString().equalsIgnoreCase(key()) || !UUID.fromString(registerKey()).toString().equalsIgnoreCase(registerKey()))throw new IllegalArgumentException(); } catch(IllegalArgumentException e) { throw invalid("MEDIA_RECOVERY_INVALID"); }
            validateInput(input());
            if(phase().equals("UPLOAD_PENDING")&&value.has("uploadId") || !phase().equals("UPLOAD_PENDING")&&(!(value.opt("uploadId") instanceof String)||!validId(uploadId())) ||
                    !phase().equals("REGISTERED")&&(value.has("assetId")||value.has("assetVersion")) ||
                    phase().equals("REGISTERED")&&(!(value.opt("assetId") instanceof String)||!validId(assetId())||!(value.opt("assetVersion") instanceof Number)||value.optDouble("assetVersion")!=value.optInt("assetVersion")||value.optInt("assetVersion")<1)) throw invalid("MEDIA_RECOVERY_INVALID");
        }
        String immutable() throws Exception {
            JSONObject copy=json(); for(String key:List.of("phase","uploadId","assetId","assetVersion"))copy.remove(key);
            return canonical(copy);
        }
        void accepts(Record next) throws Exception {
            if(!immutable().equals(next.immutable()) || PHASES.indexOf(next.phase())<PHASES.indexOf(phase()) ||
                !uploadId().isEmpty()&&!uploadId().equals(next.uploadId()) || !assetId().isEmpty()&&(!assetId().equals(next.assetId()) || value.getInt("assetVersion")!=next.value.getInt("assetVersion"))) throw invalid("MEDIA_RECOVERY_CONFLICT");
        }
    }
    interface Journal {
        List<Record> read(String scope) throws Exception;
        void save(Record record) throws Exception;
        void remove(String scope,String uploadKey) throws Exception;
    }
    static final class MemoryJournal implements Journal {
        private final java.util.Map<String,Record> records=new java.util.LinkedHashMap<>();
        public synchronized List<Record> read(String scope) throws Exception {
            List<Record> result=new ArrayList<>(); for(Record record:records.values())if(record.scope().equals(scope))result.add(new Record(record.json())); return result;
        }
        public synchronized void save(Record record) throws Exception {
            Record previous=records.get(record.key()); if(previous!=null)previous.accepts(record);
            if(previous==null&&read(record.scope()).size()>=QUEUE_LIMIT)throw invalid("MEDIA_QUEUE_FULL");
            records.put(record.key(),new Record(record.json()));
        }
        public synchronized void remove(String scope,String key) throws Exception {
            Record record=records.get(key); if(record!=null&&(!record.scope().equals(scope)||!record.phase().equals("REGISTERED")))throw invalid("MEDIA_RECOVERY_CONFLICT"); records.remove(key);
        }
    }
}
