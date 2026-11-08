package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Separate in-memory ERP actor session; never reuses an employee GPS token. */
class ErpConsoleTransport {
    private static final Pattern COOKIE = Pattern.compile("(?:^|[,;]\\s*)knaba_session=([A-Za-z0-9_-]{30,100})(?=[;,]|$)");
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private String origin = "";
    private String cookie = "";
    private String csrf = "";
    private long epoch;
    private PendingCommand pending;
    private String blockedNativeMediaKey = "";
    private String actorScope = "";
    private String actorAuthority = "";
    private boolean sensitiveFlight;
    private final ConnectionFactory connections;
    private final Journal journal;
    private final ErpMedia.Journal mediaJournal;

    interface ConnectionFactory { HttpURLConnection open(URL url) throws IOException; }

    /** Journal contains command inputs, never authentication credentials. Production uses device-bound encryption. */
    interface Journal {
        String read(String scope) throws Exception;
        void write(String scope, String envelope) throws Exception;
        void remove(String scope, String idempotencyKey) throws Exception;
    }
    private static final Journal VOLATILE = new Journal() {
        public String read(String scope) { return null; }
        public void write(String scope, String envelope) { }
        public void remove(String scope, String idempotencyKey) { }
    };
    /** Injectable connections and journal allow explicit transport/restart regression tests. */
    ErpConsoleTransport(ConnectionFactory connections, Journal journal, ErpMedia.Journal mediaJournal) { this.connections = connections; this.journal = journal; this.mediaJournal = mediaJournal; }
    ErpConsoleTransport(ConnectionFactory connections, Journal journal) { this(connections, journal, new ErpMedia.MemoryJournal()); }
    ErpConsoleTransport(ConnectionFactory connections) { this(connections, VOLATILE); }
    ErpConsoleTransport(Journal journal) { this(url -> (HttpURLConnection) url.openConnection(), journal); }
    ErpConsoleTransport(Journal journal, ErpMedia.Journal mediaJournal) { this(url -> (HttpURLConnection) url.openConnection(), journal, mediaJournal); }
    ErpConsoleTransport() { this(url -> (HttpURLConnection) url.openConnection(), VOLATILE); }

    /** UI-safe errors contain codes only; response bodies and URLs are never displayed. */
    static final class Failure extends Exception {
        public final int status;
        public final String code;
        public final boolean outcomeUnknown;
        public final long retryAfterMillis;
        Failure(int status, String code, boolean outcomeUnknown) {
            this(status, code, outcomeUnknown, 0);
        }
        Failure(int status, String code, boolean outcomeUnknown, long retryAfterMillis) {
            super(code); this.status = status; this.code = code; this.outcomeUnknown = outcomeUnknown; this.retryAfterMillis = retryAfterMillis;
        }
    }

    private static final class Session {
        final String origin, cookie, csrf;
        final long epoch;
        Session(String origin, String cookie, String csrf, long epoch) {
            this.origin = origin; this.cookie = cookie; this.csrf = csrf; this.epoch = epoch;
        }
    }
    private static final class PendingCommand {
        final String fingerprint, name, body;
        final Session session;
        final String scope;
        final boolean nativeMedia;
        boolean inFlight, uncertain;
        PendingCommand(String fingerprint, String name, String body, Session session, String scope) {
            this(fingerprint,name,body,session,scope,false);
        }
        PendingCommand(String fingerprint, String name, String body, Session session, String scope,boolean nativeMedia) {
            this.fingerprint = fingerprint; this.name = name; this.body = body; this.session = session; this.scope = scope; this.nativeMedia=nativeMedia;
        }
    }

    synchronized void configure(String value) {
        String next = ErpOriginPolicy.origin(value);
        if (!next.equals(origin)) clear();
        origin = next;
    }
    synchronized void clear() { epoch++; cookie = ""; csrf = ""; pending = null; blockedNativeMediaKey=""; actorScope = ""; actorAuthority = ""; sensitiveFlight = false; }
    synchronized boolean isSignedIn() { return !cookie.isEmpty() && !csrf.isEmpty(); }
    synchronized String origin() { return origin; }
    synchronized boolean hasPendingCommand() { return pending != null || !blockedNativeMediaKey.isEmpty(); }
    synchronized boolean hasNativeMediaPending() { return !blockedNativeMediaKey.isEmpty() || pending!=null&&pending.nativeMedia; }
    synchronized long sessionRevision() { return epoch; }
    static final class MediaTicket {
        private final ErpConsoleTransport owner;
        private final Session session;
        private boolean cancelled;
        final String scope, authority, companyId;
        private MediaTicket(ErpConsoleTransport owner, Session session, String scope, String authority, String companyId) {
            this.owner=owner; this.session=session; this.scope=scope; this.authority=authority; this.companyId=companyId;
        }
    }
    static final class MediaProgress {
        final ErpMedia.Record record;
        final JSONObject entity;
        final boolean recoveryPending;
        MediaProgress(ErpMedia.Record record, JSONObject entity, boolean recoveryPending) { this.record=record; this.entity=entity; this.recoveryPending=recoveryPending; }
    }
    static final class MediaFile {
        final byte[] bytes;
        final String mimeType, fileName;
        MediaFile(byte[] bytes,String mimeType,String fileName) { this.bytes=bytes; this.mimeType=mimeType; this.fileName=fileName; }
    }
    synchronized MediaTicket mediaTicket() throws Exception {
        if(!isSignedIn() || actorScope.isEmpty() || actorAuthority.isEmpty())throw new Failure(0,"NEEDS_REAUTH",false);
        return new MediaTicket(this,capture(),actorScope,ErpMedia.hash(actorAuthority.getBytes(StandardCharsets.UTF_8)),new JSONObject(actorAuthority).getString("companyId"));
    }
    synchronized void requireMediaTicket(MediaTicket ticket) throws Exception {
        if(ticket==null || ticket.owner!=this)throw new Failure(0,"ACCESS_CHANGED",false);
        if(ticket.cancelled)throw new Failure(0,"MEDIA_CANCELLED",false);
        requireCurrent(ticket.session);
        if(!ticket.scope.equals(actorScope) || !ticket.authority.equals(ErpMedia.hash(actorAuthority.getBytes(StandardCharsets.UTF_8))))throw new Failure(0,"ACCESS_CHANGED",false);
    }
    synchronized void cancelMediaTicket(MediaTicket ticket) { if(ticket!=null&&ticket.owner==this)ticket.cancelled=true; }
    JSONObject mediaPreflight(MediaTicket ticket, JSONObject input) throws Exception {
        requireMediaTicket(ticket);
        JSONObject current=me(ticket.session).getJSONObject("actor");
        requireMediaTicket(ticket);
        if(!ErpMedia.permitted(current,"media.upload"))throw new Failure(403,"ACCESS_DENIED",false);
        ErpMedia.validateCatalog(catalog(),input);
        requireMediaTicket(ticket);
        if(ErpMedia.external(current) && (input.has("taskId") || !"DEFECT".equals(input.optString("stage")) || !"INTERNAL".equals(input.optString("visibility"))))throw new Failure(403,"ACCESS_DENIED",false);
        String kind=input.has("taskId")?"task":"site", id=input.optString(input.has("taskId")?"taskId":"siteId");
        JSONArray rows=entities(kind); JSONObject selected=null;
        for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).optString("id")))selected=rows.getJSONObject(i);
        requireMediaTicket(ticket);
        if(selected==null || !ticket.companyId.equals(selected.optString("companyId")) || kind.equals("task") && (selected.optJSONObject("data")==null || !input.getString("siteId").equals(selected.getJSONObject("data").optString("siteId"))))throw new Failure(403,"ACCESS_CHANGED",false);
        return current;
    }
    synchronized List<ErpMedia.Record> mediaRecords(MediaTicket ticket) throws Exception {
        requireMediaTicket(ticket);
        if(!blockedNativeMediaKey.isEmpty())throw new Failure(0,"MEDIA_RECOVERY_INVALID",false);
        List<ErpMedia.Record> records;
        try { records=mediaJournal.read(ticket.scope); }
        catch(Failure known) { throw known; }
        catch(Exception error) { throw new Failure(0,"MEDIA_RECOVERY_UNAVAILABLE",false); }
        for(ErpMedia.Record record:records)if(!record.scope().equals(ticket.scope) || !record.authority().equals(ticket.authority))throw new Failure(0,"MEDIA_RECOVERY_AUTHORITY_CHANGED",false);
        return records;
    }
    private void saveMedia(ErpMedia.Record record) throws Exception {
        try { mediaJournal.save(record); }
        catch(Failure known) { throw known; }
        catch(Exception error) { throw new Failure(0,"MEDIA_RECOVERY_UNAVAILABLE",false); }
    }
    ErpMedia.Record prepareMedia(MediaTicket ticket,JSONObject input,ErpMedia.FileData file,boolean redactionConfirmed) throws Exception {
        JSONObject actor=mediaPreflight(ticket,input);
        if(ErpMedia.external(actor)&&file.mime.equals("application/pdf"))throw new Failure(403,"ACCESS_DENIED",false);
        synchronized(this) {
            requireMediaTicket(ticket);
            if(hasPendingCommand())throw new Failure(0,"PENDING_COMMAND_REQUIRES_RETRY",true);
            for(ErpMedia.Record prior:mediaRecords(ticket)) {
                JSONObject value=prior.json();
                if(value.optString("sha256").equals(file.sha256) && prior.name().equals(file.name) &&
                   value.getBoolean("redactionConfirmed")==redactionConfirmed && ErpMedia.canonical(prior.input()).equals(ErpMedia.canonical(input)))return prior;
            }
            ErpMedia.Record record=ErpMedia.Record.create(ticket.scope,ticket.authority,input,file,redactionConfirmed);
            saveMedia(record); return record;
        }
    }
    private synchronized void requireMediaRecord(MediaTicket ticket,ErpMedia.Record record) throws Exception {
        requireMediaTicket(ticket);
        if(!record.scope().equals(ticket.scope)||!record.authority().equals(ticket.authority))throw new Failure(0,"ACCESS_CHANGED",false);
    }
    MediaProgress uploadMedia(MediaTicket ticket,ErpMedia.Record record,ErpMedia.FileData file) throws Exception {
        requireMediaRecord(ticket,record);
        if(!record.uploadId().isEmpty())return new MediaProgress(record,null,false);
        ErpMedia.Upload body=record.upload(file);
        JSONObject actor=mediaPreflight(ticket,record.input());
        if(ErpMedia.external(actor)&&record.mime().equals("application/pdf"))throw new Failure(403,"ACCESS_DENIED",false);
        synchronized(this) { requireMediaRecord(ticket,record); saveMedia(record); }
        JSONObject receipt=uploadMedia(body,record.key(),ticket.session.epoch,ticket);
        if(receipt.getLong("byteSize")!=record.size())throw new Failure(0,"INVALID_RESPONSE",true);
        ErpMedia.Record next=record.uploaded(receipt);
        synchronized(this) {
            requireMediaRecord(ticket,next);
            try { saveMedia(next); return new MediaProgress(next,null,false); }
            catch(Exception storage) { return new MediaProgress(next,null,true); }
        }
    }
    MediaProgress registerMedia(MediaTicket ticket,ErpMedia.Record record) throws Exception {
        requireMediaRecord(ticket,record);
        if(record.phase().equals("REGISTERED"))return new MediaProgress(record,null,false);
        mediaPreflight(ticket,record.input());
        ErpMedia.Record submitted=record.registering();
        synchronized(this) {
            requireMediaRecord(ticket,submitted);
            if(pending!=null && !record.registerKey().equals(new JSONObject(pending.body).optString("idempotency_key")))throw new Failure(0,"PENDING_COMMAND_REQUIRES_RETRY",true);
            saveMedia(submitted);
        }
        JSONObject entity=command("media.register",record.registerInput(),null,record.registerKey(),ticket);
        if(!ticket.companyId.equals(entity.optString("companyId")))throw new Failure(0,"INVALID_RESPONSE",true);
        final ErpMedia.Record next;
        try { next=submitted.registered(entity); } catch(Exception invalid) { throw new Failure(0,"INVALID_RESPONSE",true); }
        synchronized(this) {
            requireMediaRecord(ticket,next);
            try { checkpointMedia(ticket,next); return new MediaProgress(next,entity,false); }
            catch(Exception storage) { return new MediaProgress(next,entity,true); }
        }
    }
    synchronized void checkpointMedia(MediaTicket ticket,ErpMedia.Record record) throws Exception {
        requireMediaRecord(ticket,record); saveMedia(record);
        if(record.phase().equals("REGISTERED")) {
            if(pending!=null&&pending.nativeMedia) {
                JSONObject body=new JSONObject(pending.body);
                if(!record.registerKey().equals(body.optString("idempotency_key")) || !ErpMedia.canonical(record.registerInput()).equals(ErpMedia.canonical(body.getJSONObject("input"))))throw new Failure(0,"MEDIA_RECOVERY_CONFLICT",false);
                resolve(pending);
            }
            mediaJournal.remove(record.scope(),record.key());
        }
    }
    /** Download the current scoped client copy only. No blob key, URL, redirect, or saved cookie is accepted. */
    MediaFile mediaFile(MediaTicket ticket,String id,int version) throws Exception {
        requireMediaTicket(ticket); me(ticket.session); requireMediaTicket(ticket);
        JSONObject selected=null; JSONArray rows=entities("media_asset");
        for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).optString("id")))selected=rows.getJSONObject(i);
        if(selected==null || selected.optInt("version")!=version || !ticket.companyId.equals(selected.optString("companyId")))throw new Failure(403,"ACCESS_CHANGED",false);
        final Session session;
        synchronized(this) { requireMediaTicket(ticket); session=capture(); }
        String path="/api/v1/media/"+ErpMedia.pathComponent(id)+"/file?copy=client";
        HttpURLConnection http=null;
        try {
            requireMediaTicket(ticket);
            http=connections.open(new URL(session.origin+path));
            http.setInstanceFollowRedirects(false); http.setUseCaches(false); http.setConnectTimeout(15000); http.setReadTimeout(15000);
            http.setRequestProperty("Accept","image/jpeg, application/pdf"); http.setRequestProperty("Cookie","knaba_session="+session.cookie);
            int status=http.getResponseCode(); requireCurrent(session); requireMediaTicket(ticket);
            if(status>=300&&status<400)throw new Failure(status,"REDIRECT_BLOCKED",false);
            if(status==401) { synchronized(this) { requireCurrent(session); clear(); } }
            boolean success=status>=200&&status<300;
            String mime=http.getHeaderField("Content-Type"); mime=mime==null?"":mime.split(";",2)[0].trim().toLowerCase(Locale.ROOT);
            if(success&&!List.of("image/jpeg","application/pdf").contains(mime))throw new Failure(status,"INVALID_RESPONSE",false);
            int maximum=success?ErpMedia.DOWNLOAD_BYTES:MAX_RESPONSE_BYTES;
            if(http.getContentLengthLong()>maximum)throw new Failure(status,"RESPONSE_TOO_LARGE",false);
            InputStream stream=success?http.getInputStream():http.getErrorStream(); ByteArrayOutputStream data=new ByteArrayOutputStream();
            if(stream!=null)try(InputStream in=stream) {
                byte[] chunk=new byte[8192];int count;
                while((count=in.read(chunk))!=-1) { requireCurrent(session); requireMediaTicket(ticket); if(data.size()+count>maximum)throw new Failure(status,"RESPONSE_TOO_LARGE",false); data.write(chunk,0,count); }
            }
            requireCurrent(session);
            if(!success) {
                JSONObject error=null;try { error=new JSONObject(data.toString("UTF-8")); }catch(Exception ignored){}
                throw new Failure(status,errorCode(error),false);
            }
            byte[] bytes=data.toByteArray();
            if(!mime.equals(ErpMedia.detect(bytes)))throw new Failure(status,"INVALID_RESPONSE",false);
            requireMediaTicket(ticket);
            return new MediaFile(bytes,mime,ErpMedia.fileName("KNABA-"+id+ErpMedia.extension(mime),mime));
        }catch(Failure known){throw known;}
        catch(IOException error){throw new Failure(0,"NETWORK_ERROR",false);}
        finally { if(http!=null)http.disconnect(); }
    }
    /** Dedicated media entry point; its limits and immutable key are tested separately from commands. */
    JSONObject uploadMedia(ErpMedia.Upload body, String idempotencyKey, long expectedRevision) throws Exception {
        return uploadMedia(body,idempotencyKey,expectedRevision,null);
    }
    private JSONObject uploadMedia(ErpMedia.Upload body, String idempotencyKey, long expectedRevision,MediaTicket ticket) throws Exception {
        Session session = capture();
        if (session.epoch != expectedRevision) throw new Failure(0, "ACCESS_CHANGED", false);
        ErpMedia.validateUploadKey(idempotencyKey);
        JSONObject result = call("/api/v1/media/uploads", null, true, false, session, false, idempotencyKey,body,ticket);
        if (!(result.opt("uploadId") instanceof String) || !ErpMedia.validId(result.optString("uploadId")) || !(result.opt("byteSize") instanceof Number) ||
                result.optLong("byteSize") != body.byteSize() ||
                !(result.opt("metadataStripped") instanceof Boolean) || !"CLEAN".equals(result.optString("scanState")))
            throw new Failure(0, "INVALID_RESPONSE", true);
        return result;
    }
    /** Available only after authenticated same-actor restoration; callers receive a defensive copy. */
    synchronized JSONObject pendingCommand() throws Exception {
        if (pending == null || pending.nativeMedia || !isSignedIn()) return null;
        return new JSONObject(pending.body).put("name", pending.name);
    }
    private String scope(JSONObject actor) throws Exception {
        String binding = new JSONArray().put(origin).put(actor.getString("companyId")).put(actor.getString("userId")).toString();
        byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(binding.getBytes(StandardCharsets.UTF_8));
        StringBuilder value = new StringBuilder(); for (byte b : hash) value.append(String.format(Locale.ROOT, "%02x", b & 255));
        return value.toString();
    }
    private String authority(JSONObject actor) throws Exception {
        JSONObject normalized = new JSONObject(actor.toString());
        // /me reports this timestamp; the actual mfaVerified value still fences expiry.
        normalized.remove("mfaVerifiedAt");
        for (String field : new String[]{"roles", "permissions", "siteIds", "warehouseIds", "customerIds"}) {
            JSONArray values = normalized.optJSONArray(field);
            if (values == null) continue;
            List<String> sorted = new ArrayList<>();
            for (int i=0;i<values.length();i++) {
                if (!(values.get(i) instanceof String)) throw new Failure(0,"INVALID_RESPONSE",false);
                sorted.add(values.getString(i));
            }
            Collections.sort(sorted); normalized.put(field,new JSONArray(sorted));
        }
        return canonical(normalized);
    }
    private void restorePending() throws Exception {
        String saved;
        try { saved = journal.read(actorScope); }
        catch (Exception error) { throw new Failure(0, "RECOVERY_STORAGE_UNAVAILABLE", false); }
        if (saved == null) return;
        try {
            if (saved.getBytes(StandardCharsets.UTF_8).length > 70000) throw new IllegalArgumentException();
            JSONObject record = new JSONObject(saved), body = record.getJSONObject("body");
            String name = record.getString("name"), key = body.getString("idempotency_key");
            if (!name.matches("[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+") || !key.matches("[A-Za-z0-9_-]{8,200}") ||
                    record.getInt("version") != 1 || !actorScope.equals(record.getString("scope")) ||
                    body.getJSONObject("input") == null || ErpCommandSecrets.isOneShot(name) || ErpCommandSecrets.containsSecret(body.getJSONObject("input")) ||
                    body.has("expected_version") && (!(body.get("expected_version") instanceof Number) || body.getInt("expected_version") < 1)) throw new IllegalArgumentException();
            if(record.has("nativeMedia")&&!(record.opt("nativeMedia") instanceof Boolean))throw new IllegalArgumentException();
            boolean nativeMedia=record.optBoolean("nativeMedia",false);
            if(nativeMedia) {
                if(!name.equals("media.register"))throw new IllegalArgumentException();
                ErpMedia.Record linked=null;
                try { for(ErpMedia.Record media:mediaJournal.read(actorScope))if(media.registerKey().equals(key))linked=media; }
                catch(Exception invalid) { blockedNativeMediaKey=key; return; }
                String currentAuthority=ErpMedia.hash(actorAuthority.getBytes(StandardCharsets.UTF_8));
                if(linked==null || !linked.authority().equals(currentAuthority) || linked.uploadId().isEmpty() ||
                    !ErpMedia.canonical(linked.registerInput()).equals(ErpMedia.canonical(body.getJSONObject("input")))) { blockedNativeMediaKey=key; return; }
            }
            JSONObject fingerprintBody = new JSONObject(body.toString()); fingerprintBody.remove("idempotency_key");
            pending = new PendingCommand(name + ":" + canonical(fingerprintBody), name, body.toString(), capture(), actorScope,nativeMedia);
            pending.uncertain = true; // Crash may have happened after the server committed.
        } catch (Exception error) { throw new Failure(0, "RECOVERY_STORAGE_INVALID", false); }
    }
    private void persist(PendingCommand attempt) throws Exception {
        JSONObject record = new JSONObject().put("version", 1).put("scope", attempt.scope).put("name", attempt.name).put("body", new JSONObject(attempt.body));
        if(attempt.nativeMedia)record.put("nativeMedia",true);
        try { journal.write(attempt.scope, record.toString()); }
        catch (Exception error) { throw new Failure(0, "RECOVERY_STORAGE_UNAVAILABLE", false); }
    }
    private void resolve(PendingCommand attempt) throws Exception {
        try { journal.remove(attempt.scope, new JSONObject(attempt.body).getString("idempotency_key")); }
        catch (Exception error) { attempt.uncertain = true; throw new Failure(0, "RECOVERY_STORAGE_UNAVAILABLE", true); }
        if (pending == attempt) pending = null;
    }
    private synchronized Session capture() { return new Session(origin, cookie, csrf, epoch); }
    private synchronized void requireCurrent(Session session) throws Failure {
        if (epoch != session.epoch || !origin.equals(session.origin)) throw new Failure(0, "ACCESS_CHANGED", false);
    }

    private JSONObject call(String path, JSONObject body, boolean authenticated, boolean login) throws Exception {
        return call(path, body, authenticated, login, capture(), false);
    }

    private JSONObject call(String path, JSONObject body, boolean authenticated, boolean login, Session session, boolean detachedLogout) throws Exception {
        return call(path, body, authenticated, login, session, detachedLogout, null,null,null);
    }

    private JSONObject call(String path, JSONObject body, boolean authenticated, boolean login, Session session, boolean detachedLogout, String mediaKey,ErpMedia.Upload upload,MediaTicket mediaTicket) throws Exception {
        final boolean mutation = authenticated && (body != null || upload!=null) && !detachedLogout;
        if (session.origin.isEmpty() || !path.startsWith("/api/v1/") || path.contains("..") || path.contains("//") || path.contains("#"))
            throw new Failure(0, "INVALID_API_PATH", false);
        if (authenticated && (session.cookie.isEmpty() || session.csrf.isEmpty())) throw new Failure(0, "NEEDS_REAUTH", false);
        final byte[] bytes = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
        boolean mediaUpload = mediaKey != null && "/api/v1/media/uploads".equals(path) && authenticated && body == null && upload!=null && !login && !detachedLogout;
        if ((mediaKey != null || upload!=null) && !mediaUpload) throw new Failure(0, "INVALID_API_PATH", false);
        if (bytes != null && bytes.length > 65536 || upload!=null&&upload.length()>ErpMedia.MAX_UPLOAD_JSON_BYTES) throw new Failure(0, "REQUEST_TOO_LARGE", false);
        if (!detachedLogout) requireCurrent(session);
        HttpURLConnection http = null;
        boolean submitted = false;
        try {
            if (mediaTicket!=null)requireMediaTicket(mediaTicket);
            http = connections.open(new URL(session.origin + path));
            http.setInstanceFollowRedirects(false);
            http.setConnectTimeout(15000);
            http.setReadTimeout(15000);
            http.setUseCaches(false);
            http.setRequestProperty("Accept", "application/json");
            if (mediaUpload) http.setRequestProperty("Idempotency-Key", mediaKey);
            if (authenticated) http.setRequestProperty("Cookie", "knaba_session=" + session.cookie);
            if (bytes != null || upload!=null) {
                http.setRequestMethod("POST"); http.setDoOutput(true);
                http.setRequestProperty("Origin", session.origin);
                http.setRequestProperty("Content-Type", "application/json");
                if (authenticated) http.setRequestProperty("X-CSRF-Token", session.csrf);
                http.setFixedLengthStreamingMode(upload!=null?upload.length():bytes.length);
                if (!detachedLogout) requireCurrent(session);
                if (mediaTicket!=null)requireMediaTicket(mediaTicket);
                submitted = true; // A failed write can still have reached the server.
                try (OutputStream out = http.getOutputStream()) {
                    if (mediaTicket!=null)requireMediaTicket(mediaTicket);
                    if(upload==null)out.write(bytes);
                    else upload.write(out,()->{requireCurrent(session);if(mediaTicket!=null)requireMediaTicket(mediaTicket);});
                }
            }
            int status = http.getResponseCode();
            if (!detachedLogout) requireCurrent(session);
            if (mediaTicket!=null)requireMediaTicket(mediaTicket);
            if (status >= 300 && status < 400) throw new Failure(status, "REDIRECT_BLOCKED", mutation && submitted);
            if (status < 200) throw new Failure(status, "INVALID_RESPONSE", mutation && submitted);
            if (status == 401 && authenticated && !detachedLogout) {
                synchronized (this) { requireCurrent(session); clear(); }
            }
            InputStream stream = status < 400 ? http.getInputStream() : http.getErrorStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (stream != null) try (InputStream in = stream) {
                byte[] chunk = new byte[8192]; int count;
                while ((count = in.read(chunk)) != -1) {
                    if (mediaTicket!=null)requireMediaTicket(mediaTicket);
                    if (buffer.size() + count > MAX_RESPONSE_BYTES) throw new Failure(status, "RESPONSE_TOO_LARGE", mutation && submitted);
                    buffer.write(chunk, 0, count);
                }
            }
            JSONObject result = null;
            try { result = buffer.size() == 0 ? new JSONObject() : new JSONObject(buffer.toString("UTF-8")); }
            catch (Exception ignored) { /* Errors are classified by status, never by raw HTML/body. */ }
            if (status >= 400) {
                String code = errorCode(result);
                throw new Failure(status, code, mutation && (status >= 500 || "IDEMPOTENCY_CONFLICT".equals(code)),
                    (status == 429 || status == 503) ? ErpReadRetry.retryAfter(http.getHeaderField("Retry-After"), System.currentTimeMillis()) : 0);
            }
            if (result == null) throw new Failure(status, "INVALID_RESPONSE", mutation && submitted);
            if (detachedLogout) return result;
            synchronized (this) {
                requireCurrent(session);
                if (login) {
                    String nextCookie = sessionCookie(http);
                    String proof = result.optString("csrfToken");
                    JSONObject actor = result.optJSONObject("actor");
                    if (nextCookie == null || !proof.matches("[A-Za-z0-9_-]{30,100}") || actor == null || actor.optString("userId").isEmpty() || actor.optString("companyId").isEmpty())
                        throw new Failure(status, "LOGIN_RESPONSE_INVALID", false);
                    cookie = nextCookie; csrf = proof;
                    try { actorScope = scope(actor); actorAuthority = authority(actor); restorePending(); }
                    catch (Exception error) { clear(); throw error; }
                } else if (authenticated && result.has("csrfToken")) {
                    String proof = result.optString("csrfToken");
                    if (!proof.matches("[A-Za-z0-9_-]{30,100}")) throw new Failure(status, "INVALID_RESPONSE", mutation && submitted);
                    csrf = proof;
                }
            }
            return result;
        } catch (Failure known) {
            if(mutation&&submitted&&"MEDIA_CANCELLED".equals(known.code))throw new Failure(known.status,known.code,true);
            throw known;
        }
        catch (IOException network) { throw new Failure(0, "NETWORK_ERROR", mutation && submitted); }
        finally { if (http != null) http.disconnect(); }
    }

    private static String errorCode(JSONObject result) {
        String code = result == null ? "HTTP_ERROR" : result.optString("code", result.optJSONObject("error") != null ? result.optJSONObject("error").optString("code", "HTTP_ERROR") : "HTTP_ERROR");
        return code.matches("[A-Z][A-Z0-9_]{0,59}") ? code : "HTTP_ERROR";
    }
    private static String sessionCookie(HttpURLConnection http) {
        Map<String, List<String>> headers = http.getHeaderFields();
        if (headers != null) for (Map.Entry<String, List<String>> header : headers.entrySet()) {
            if (!"Set-Cookie".equalsIgnoreCase(header.getKey()) || header.getValue() == null) continue;
            for (String value : header.getValue()) {
                Matcher found = COOKIE.matcher(value);
                if (found.find()) return found.group(1);
            }
        }
        return null;
    }

    JSONObject login(String email, String password, String otp) throws Exception {
        if (email == null || email.trim().isEmpty() || email.trim().length() > 200 || password == null || password.isEmpty() || password.length() > 128 || (otp != null && !otp.isEmpty() && !otp.matches("[0-9]{6}")))
            throw new Failure(0, "INVALID_LOGIN_INPUT", false);
        JSONObject body = new JSONObject().put("email", email.trim()).put("password", password);
        if (otp != null && !otp.isEmpty()) body.put("otp", otp);
        final Session session;
        synchronized (this) { clear(); session = capture(); }
        // Never hold the session monitor over network I/O: logout must invalidate immediately.
        return call("/api/v1/auth/login", body, false, true, session, false);
    }
    JSONObject me() throws Exception {
        return me(capture());
    }
    private JSONObject me(Session session) throws Exception {
        JSONObject result = call("/api/v1/me", null, true, false, session, false);
        synchronized (this) {
            requireCurrent(session);
            JSONObject actor = result.optJSONObject("actor");
            boolean valid;
            try {
                valid = actor != null && actor.opt("userId") instanceof String && actor.opt("companyId") instanceof String &&
                    !actor.optString("userId").isEmpty() && !actor.optString("companyId").isEmpty() && actorScope.equals(scope(actor)) && actorAuthority.equals(authority(actor));
            } catch (Exception invalid) { valid = false; }
            if (!valid) {
                clear(); throw new Failure(0, "ACCESS_CHANGED", false);
            }
        }
        return result;
    }
    JSONObject dashboard() throws Exception { return call("/api/v1/dashboard", null, true, false); }
    JSONArray catalog() throws Exception { return call("/api/v1/commands", null, true, false).getJSONArray("items"); }
    JSONArray entities(String kind) throws Exception {
        if (kind == null || !kind.matches("[a-z][a-z0-9_]{0,48}")) throw new Failure(0, "INVALID_KIND", false);
        return pages("/api/v1/entities/" + kind);
    }
    private JSONArray pages(String resource) throws Exception {
        JSONArray records = new JSONArray(); String cursor = null;
        Session session = capture();
        for (int page = 0; page < 10; page++) {
            String path = resource + "?limit=100" + (cursor == null ? "" : "&cursor=" + java.net.URLEncoder.encode(cursor, "UTF-8"));
            JSONObject response = call(path, null, true, false, session, false);
            JSONArray rows = response.optJSONArray("items");
            if (rows == null || !(response.opt("has_more") instanceof Boolean)) throw new Failure(0, "INVALID_RESPONSE", false);
            for (int i = 0; i < rows.length(); i++) records.put(rows.get(i));
            if (!response.optBoolean("has_more")) return records;
            String next = response.optString("next_cursor");
            if (next.isEmpty() || next.length() > 8192 || next.equals(cursor)) throw new Failure(0, "BAD_CURSOR", false);
            cursor = next;
        }
        throw new Failure(0, "TOO_MANY_PAGES", false);
    }
    JSONArray messages(String channel) throws Exception {
        if (channel == null || !channel.matches("[a-zA-Z0-9-]{8,100}")) throw new Failure(0, "INVALID_CHANNEL", false);
        return pages("/api/v1/channels/" + channel + "/messages");
    }
    JSONObject command(String name, JSONObject input, Integer expectedVersion) throws Exception {
        return command(name, input, expectedVersion, UUID.randomUUID().toString());
    }
    JSONObject command(String name, JSONObject input, Integer expectedVersion, String idempotencyKey) throws Exception {
        return command(name,input,expectedVersion,idempotencyKey,null);
    }
    private JSONObject command(String name, JSONObject input, Integer expectedVersion, String idempotencyKey, MediaTicket expectedMediaTicket) throws Exception {
        if (name == null || !name.matches("[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+") || input == null || (expectedVersion != null && expectedVersion < 1))
            throw new Failure(0, "INVALID_COMMAND", false);
        if (idempotencyKey == null || !idempotencyKey.matches("[A-Za-z0-9_-]{8,200}")) throw new Failure(0, "INVALID_IDEMPOTENCY_KEY", false);
        if (ErpCommandSecrets.isOneShot(name)) {
            JSONObject payload = new JSONObject(input.toString());
            ErpCommandSecrets.validateOneShot(name,payload);
            final Session session;
            synchronized (this) {
                if (!isSignedIn()) throw new Failure(0,"NEEDS_REAUTH",false);
                if (sensitiveFlight) throw new Failure(0,"COMMAND_IN_PROGRESS",false);
                if (hasPendingCommand()) throw new Failure(0,"PENDING_COMMAND_REQUIRES_RETRY",true);
                sensitiveFlight = true; session = capture();
            }
            return executeSensitive(name,payload,expectedVersion,idempotencyKey,session);
        }
        if (ErpCommandSecrets.containsSecret(input)) throw new Failure(0,"SENSITIVE_COMMAND",false);
        JSONObject body = new JSONObject().put("input", input);
        if (expectedVersion != null) body.put("expected_version", expectedVersion);
        String fingerprint = name + ":" + canonical(body);
        body.put("idempotency_key", idempotencyKey);
        final PendingCommand attempt;
        synchronized (this) {
            if (expectedMediaTicket != null) requireMediaTicket(expectedMediaTicket);
            if (!blockedNativeMediaKey.isEmpty()) throw new Failure(0,"MEDIA_RECOVERY_AUTHORITY_CHANGED",true);
            if (pending!=null&&pending.nativeMedia&&expectedMediaTicket==null)throw new Failure(0,"MEDIA_RECOVERY_REQUIRED",true);
            if (!isSignedIn()) throw new Failure(0, "NEEDS_REAUTH", false);
            if(expectedMediaTicket==null&&name.equals("media.register")) {
                List<ErpMedia.Record> media;
                try { media=mediaJournal.read(actorScope); }
                catch(Exception unavailable) { throw new Failure(0,"MEDIA_RECOVERY_UNAVAILABLE",false); }
                for(ErpMedia.Record linked:media)if(!linked.uploadId().isEmpty()&&linked.uploadId().equals(input.optString("uploadId")))throw new Failure(0,"MEDIA_RECOVERY_REQUIRED",true);
            }
            if (sensitiveFlight) throw new Failure(0,"COMMAND_IN_PROGRESS",false);
            if (pending != null && !pending.fingerprint.equals(fingerprint)) throw new Failure(0, "PENDING_COMMAND_REQUIRES_RETRY", true);
            if (pending == null) {
                PendingCommand next = new PendingCommand(fingerprint, name, body.toString(), capture(), actorScope,expectedMediaTicket!=null);
                // Persist before opening a connection: failure must never submit a write without recovery.
                persist(next); pending = next;
            }
            if (pending.inFlight) throw new Failure(0, "COMMAND_IN_PROGRESS", true);
            attempt = pending; attempt.inFlight = true;
        }
        try {
            JSONObject result = call("/api/v1/commands/" + attempt.name, new JSONObject(attempt.body), true, false, attempt.session, false,null,null,expectedMediaTicket);
            // Typed media first stores/validates its known registration receipt.
            // A local cleanup error must not turn that ACK into an unknown write.
            synchronized (this) { if(expectedMediaTicket==null)resolve(attempt); }
            return result;
        } catch (Failure failure) {
            synchronized (this) {
                if (failure.outcomeUnknown || "IDEMPOTENCY_CONFLICT".equals(failure.code)) attempt.uncertain = true;
                if (pending == attempt && !attempt.uncertain) resolve(attempt);
            }
            if (attempt.uncertain && !failure.outcomeUnknown) throw new Failure(failure.status, failure.code, true);
            throw failure;
        } finally { synchronized (this) { attempt.inFlight = false; } }
    }
    private JSONObject executeSensitive(String name,JSONObject input,Integer version,String key,Session session) throws Exception {
        try {
            me(session);
            final Session fresh;
            synchronized (this) { requireCurrent(session); fresh = capture(); }
            JSONObject body = new JSONObject().put("input",input).put("idempotency_key",key);
            if (version != null) body.put("expected_version",version);
            JSONObject result = call("/api/v1/commands/"+name,body,true,false,fresh,false);
            if (!Boolean.TRUE.equals(result.opt("ok")) || !Boolean.TRUE.equals(result.opt("reauthenticationRequired")))
                throw new Failure(0,"INVALID_RESPONSE",true);
            return result;
        } finally {
            // Never clear a newer login or retain secrets for a retry, including after timeout.
            synchronized (this) { if (epoch == session.epoch && origin.equals(session.origin)) clear(); }
        }
    }
    private static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            List<String> keys = new ArrayList<>(); object.keys().forEachRemaining(keys::add); Collections.sort(keys);
            List<String> parts = new ArrayList<>();
            for (String key : keys) parts.add(JSONObject.quote(key) + ":" + canonical(object.get(key)));
            return "{" + String.join(",", parts) + "}";
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value; List<String> parts = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) parts.add(canonical(array.get(i)));
            return "[" + String.join(",", parts) + "]";
        }
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof String) return JSONObject.quote((String) value);
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        throw new IllegalArgumentException("INVALID_JSON_VALUE");
    }
    JSONObject sendMessage(String channel, String text) throws Exception {
        return sendMessage(channel, text, "DE", UUID.randomUUID().toString());
    }
    JSONObject sendMessage(String channel, String text, String language, String idempotencyKey) throws Exception {
        if (channel == null || !channel.matches("[a-zA-Z0-9-]{8,100}") || text == null || text.trim().isEmpty() || text.length() > 12000)
            throw new Failure(0, "INVALID_MESSAGE", false);
        String tag = language == null ? "" : language.toUpperCase(Locale.ROOT);
        if (!java.util.Arrays.asList("DE", "EN", "PL", "LT", "RU", "UK").contains(tag)) throw new Failure(0, "INVALID_LANGUAGE", false);
        return command("message.send", new JSONObject().put("channel_id", channel).put("text", text.trim()).put("language", tag), null, idempotencyKey);
    }
    /** Revoke the captured old session without blocking logout or touching a newer login. */
    synchronized Runnable detachSessionForLogout() {
        Session previous = capture(); clear();
        return () -> {
            if (previous.cookie.isEmpty() || previous.csrf.isEmpty()) return;
            try { call("/api/v1/auth/logout", new JSONObject(), true, false, previous, true); }
            catch (Exception ignored) { /* Local logout is final; remote expiry/revocation is authoritative. */ }
        };
    }
    void logout() { detachSessionForLogout().run(); }
}
