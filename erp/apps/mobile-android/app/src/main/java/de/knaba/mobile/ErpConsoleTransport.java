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
    private String actorScope = "";
    private final ConnectionFactory connections;
    private final Journal journal;

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
    ErpConsoleTransport(ConnectionFactory connections, Journal journal) { this.connections = connections; this.journal = journal; }
    ErpConsoleTransport(ConnectionFactory connections) { this(connections, VOLATILE); }
    ErpConsoleTransport(Journal journal) { this(url -> (HttpURLConnection) url.openConnection(), journal); }
    ErpConsoleTransport() { this(url -> (HttpURLConnection) url.openConnection(), VOLATILE); }

    /** UI-safe errors contain codes only; response bodies and URLs are never displayed. */
    static final class Failure extends Exception {
        public final int status;
        public final String code;
        public final boolean outcomeUnknown;
        Failure(int status, String code, boolean outcomeUnknown) {
            super(code); this.status = status; this.code = code; this.outcomeUnknown = outcomeUnknown;
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
        boolean inFlight, uncertain;
        PendingCommand(String fingerprint, String name, String body, Session session, String scope) {
            this.fingerprint = fingerprint; this.name = name; this.body = body; this.session = session; this.scope = scope;
        }
    }

    synchronized void configure(String value) {
        String next = ErpOriginPolicy.origin(value);
        if (!next.equals(origin)) clear();
        origin = next;
    }
    synchronized void clear() { epoch++; cookie = ""; csrf = ""; pending = null; actorScope = ""; }
    synchronized boolean isSignedIn() { return !cookie.isEmpty() && !csrf.isEmpty(); }
    synchronized String origin() { return origin; }
    synchronized boolean hasPendingCommand() { return pending != null; }
    /** Available only after authenticated same-actor restoration; callers receive a defensive copy. */
    synchronized JSONObject pendingCommand() throws Exception {
        if (pending == null || !isSignedIn()) return null;
        return new JSONObject(pending.body).put("name", pending.name);
    }
    private String scope(JSONObject actor) throws Exception {
        String binding = new JSONArray().put(origin).put(actor.getString("companyId")).put(actor.getString("userId")).toString();
        byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(binding.getBytes(StandardCharsets.UTF_8));
        StringBuilder value = new StringBuilder(); for (byte b : hash) value.append(String.format(Locale.ROOT, "%02x", b & 255));
        return value.toString();
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
                    body.getJSONObject("input") == null || body.has("expected_version") && (!(body.get("expected_version") instanceof Number) || body.getInt("expected_version") < 1)) throw new IllegalArgumentException();
            JSONObject fingerprintBody = new JSONObject(body.toString()); fingerprintBody.remove("idempotency_key");
            pending = new PendingCommand(name + ":" + canonical(fingerprintBody), name, body.toString(), capture(), actorScope);
            pending.uncertain = true; // Crash may have happened after the server committed.
        } catch (Exception error) { throw new Failure(0, "RECOVERY_STORAGE_INVALID", false); }
    }
    private void persist(PendingCommand attempt) throws Exception {
        JSONObject record = new JSONObject().put("version", 1).put("scope", attempt.scope).put("name", attempt.name).put("body", new JSONObject(attempt.body));
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
        final boolean mutation = authenticated && body != null && !detachedLogout;
        if (session.origin.isEmpty() || !path.startsWith("/api/v1/") || path.contains("..") || path.contains("//") || path.contains("#"))
            throw new Failure(0, "INVALID_API_PATH", false);
        if (authenticated && (session.cookie.isEmpty() || session.csrf.isEmpty())) throw new Failure(0, "NEEDS_REAUTH", false);
        final byte[] bytes = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes != null && bytes.length > 65536) throw new Failure(0, "REQUEST_TOO_LARGE", false);
        if (!detachedLogout) requireCurrent(session);
        HttpURLConnection http = null;
        boolean submitted = false;
        try {
            http = connections.open(new URL(session.origin + path));
            http.setInstanceFollowRedirects(false);
            http.setConnectTimeout(15000);
            http.setReadTimeout(15000);
            http.setUseCaches(false);
            http.setRequestProperty("Accept", "application/json");
            if (authenticated) http.setRequestProperty("Cookie", "knaba_session=" + session.cookie);
            if (bytes != null) {
                http.setRequestMethod("POST"); http.setDoOutput(true);
                http.setRequestProperty("Origin", session.origin);
                http.setRequestProperty("Content-Type", "application/json");
                if (authenticated) http.setRequestProperty("X-CSRF-Token", session.csrf);
                http.setFixedLengthStreamingMode(bytes.length);
                if (!detachedLogout) requireCurrent(session);
                submitted = true; // A failed write can still have reached the server.
                try (OutputStream out = http.getOutputStream()) { out.write(bytes); }
            }
            int status = http.getResponseCode();
            if (!detachedLogout) requireCurrent(session);
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
                    if (buffer.size() + count > MAX_RESPONSE_BYTES) throw new Failure(status, "RESPONSE_TOO_LARGE", mutation && submitted);
                    buffer.write(chunk, 0, count);
                }
            }
            JSONObject result = null;
            try { result = buffer.size() == 0 ? new JSONObject() : new JSONObject(buffer.toString("UTF-8")); }
            catch (Exception ignored) { /* Errors are classified by status, never by raw HTML/body. */ }
            if (status >= 400) {
                String code = errorCode(result);
                throw new Failure(status, code, mutation && (status >= 500 || "IDEMPOTENCY_CONFLICT".equals(code)));
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
                    try { actorScope = scope(actor); restorePending(); }
                    catch (Exception error) { clear(); throw error; }
                } else if (authenticated && result.has("csrfToken")) {
                    String proof = result.optString("csrfToken");
                    if (!proof.matches("[A-Za-z0-9_-]{30,100}")) throw new Failure(status, "INVALID_RESPONSE", mutation && submitted);
                    csrf = proof;
                }
            }
            return result;
        } catch (Failure known) { throw known; }
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
        Session session = capture();
        JSONObject result = call("/api/v1/me", null, true, false, session, false);
        synchronized (this) {
            requireCurrent(session);
            JSONObject actor = result.optJSONObject("actor");
            if (actor == null || !(actor.opt("userId") instanceof String) || !(actor.opt("companyId") instanceof String) || actor.optString("userId").isEmpty() || actor.optString("companyId").isEmpty() || !actorScope.equals(scope(actor))) {
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
        if (name == null || !name.matches("[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+") || input == null || (expectedVersion != null && expectedVersion < 1))
            throw new Failure(0, "INVALID_COMMAND", false);
        if (idempotencyKey == null || !idempotencyKey.matches("[A-Za-z0-9_-]{8,200}")) throw new Failure(0, "INVALID_IDEMPOTENCY_KEY", false);
        JSONObject body = new JSONObject().put("input", input);
        if (expectedVersion != null) body.put("expected_version", expectedVersion);
        String fingerprint = name + ":" + canonical(body);
        body.put("idempotency_key", idempotencyKey);
        final PendingCommand attempt;
        synchronized (this) {
            if (!isSignedIn()) throw new Failure(0, "NEEDS_REAUTH", false);
            if (pending != null && !pending.fingerprint.equals(fingerprint)) throw new Failure(0, "PENDING_COMMAND_REQUIRES_RETRY", true);
            if (pending == null) {
                PendingCommand next = new PendingCommand(fingerprint, name, body.toString(), capture(), actorScope);
                // Persist before opening a connection: failure must never submit a write without recovery.
                persist(next); pending = next;
            }
            if (pending.inFlight) throw new Failure(0, "COMMAND_IN_PROGRESS", true);
            attempt = pending; attempt.inFlight = true;
        }
        try {
            JSONObject result = call("/api/v1/commands/" + attempt.name, new JSONObject(attempt.body), true, false, attempt.session, false);
            synchronized (this) { resolve(attempt); }
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
