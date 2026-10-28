package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Shared KNABA ERP actor session; does not reuse a native GPS device token. */
final class ErpConsoleTransport {
    private static final Pattern COOKIE = Pattern.compile("(?:^|[,;]\\s*)knaba_session=([A-Za-z0-9_-]{30,100})");
    private String origin = "";
    private String cookie = "";
    private String csrf = "";
    private int epoch = 0;

    synchronized void configure(String value) {
        String next = ErpOriginPolicy.origin(value);
        if (!next.equals(origin)) clear();
        origin = next;
    }
    synchronized void clear() { epoch++; cookie = ""; csrf = ""; }
    synchronized boolean isSignedIn() { return !cookie.isEmpty() && !csrf.isEmpty(); }
    synchronized String origin() { return origin; }

    private JSONObject call(String path, JSONObject body, boolean authenticated, boolean login) throws Exception {
        final String base, activeCookie, activeCsrf;
        final int generation;
        synchronized (this) {
            base = origin; activeCookie = cookie; activeCsrf = csrf; generation = epoch;
        }
        if (base.isEmpty() || !path.startsWith("/api/v1/") || path.contains("..") || path.contains("//") || path.contains("#")) throw new IllegalArgumentException("INVALID_API_PATH");
        if (authenticated && activeCookie.isEmpty()) throw new IllegalStateException("NEEDS_REAUTH");
        HttpURLConnection http = (HttpURLConnection) new URL(base + path).openConnection();
        http.setInstanceFollowRedirects(false);
        http.setConnectTimeout(15000);
        http.setReadTimeout(15000);
        http.setUseCaches(false);
        http.setRequestProperty("Accept", "application/json");
        if (authenticated) http.setRequestProperty("Cookie", "knaba_session=" + activeCookie);
        if (body != null) {
            http.setRequestMethod("POST"); http.setDoOutput(true);
            http.setRequestProperty("Origin", base);
            http.setRequestProperty("Content-Type", "application/json");
            if (authenticated) http.setRequestProperty("X-CSRF-Token", activeCsrf);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 65536) throw new IllegalArgumentException("REQUEST_TOO_LARGE");
            http.getOutputStream().write(bytes);
            http.getOutputStream().close();
        }
        try {
            int status = http.getResponseCode();
            if (status >= 300 && status < 400) throw new IllegalStateException("REDIRECT_BLOCKED");
            InputStream stream = status < 400 ? http.getInputStream() : http.getErrorStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (stream != null) try (InputStream in = stream) {
                byte[] chunk = new byte[8192]; int count;
                while ((count = in.read(chunk)) != -1) {
                    if (buffer.size() + count > 2 * 1024 * 1024) throw new IllegalStateException("RESPONSE_TOO_LARGE");
                    buffer.write(chunk, 0, count);
                }
            }
            JSONObject result;
            try { result = buffer.size() == 0 ? new JSONObject() : new JSONObject(buffer.toString("UTF-8")); }
            catch (Exception invalid) { throw new IllegalStateException("INVALID_RESPONSE"); }
            synchronized (this) {
                if (epoch != generation || !origin.equals(base)) throw new IllegalStateException("ACCESS_CHANGED");
                if (status == 401 && authenticated) clear();
                if (status >= 400) {
                    String code = result.optString("code", result.optJSONObject("error") != null ? result.optJSONObject("error").optString("code", "HTTP_ERROR") : "HTTP_ERROR");
                    throw new IllegalStateException("HTTP_" + status + ":" + code.substring(0, Math.min(60, code.length())));
                }
                if (login) {
                    Matcher found = COOKIE.matcher(http.getHeaderField("Set-Cookie") == null ? "" : http.getHeaderField("Set-Cookie"));
                    String proof = result.optString("csrfToken");
                    JSONObject actor = result.optJSONObject("actor");
                    if (!found.find() || proof.isEmpty() || actor == null || actor.optString("userId").isEmpty() || actor.optString("companyId").isEmpty()) throw new IllegalStateException("LOGIN_RESPONSE_INVALID");
                    cookie = found.group(1); csrf = proof;
                } else if (authenticated && result.has("csrfToken")) csrf = result.optString("csrfToken");
            }
            return result;
        } finally { http.disconnect(); }
    }
    synchronized JSONObject login(String email, String password, String otp) throws Exception {
        clear();
        if (email == null || email.isEmpty() || password == null || password.isEmpty() || (otp != null && !otp.isEmpty() && !otp.matches("[0-9]{6}"))) throw new IllegalArgumentException("INVALID_LOGIN_INPUT");
        JSONObject body = new JSONObject().put("email", email.trim()).put("password", password);
        if (otp != null && !otp.isEmpty()) body.put("otp", otp);
        return call("/api/v1/auth/login", body, false, true);
    }
    JSONObject me() throws Exception { return call("/api/v1/me", null, true, false); }
    JSONObject dashboard() throws Exception { return call("/api/v1/dashboard", null, true, false); }
    JSONArray catalog() throws Exception { return call("/api/v1/commands", null, true, false).getJSONArray("items"); }
    JSONArray entities(String kind) throws Exception {
        if (kind == null || !kind.matches("[a-z][a-z0-9_]{0,48}")) throw new IllegalArgumentException("INVALID_KIND");
        JSONArray records = new JSONArray(); String cursor = null;
        for (int page = 0; page < 10; page++) {
            String path = "/api/v1/entities/" + kind + "?limit=100" + (cursor == null ? "" : "&cursor=" + java.net.URLEncoder.encode(cursor, "UTF-8"));
            JSONObject response = call(path, null, true, false);
            JSONArray rows = response.optJSONArray("items");
            if (rows == null) throw new IllegalStateException("INVALID_RESPONSE");
            for (int i = 0; i < rows.length(); i++) records.put(rows.get(i));
            if (!response.optBoolean("has_more")) return records;
            String next = response.optString("next_cursor");
            if (next.isEmpty() || next.equals(cursor)) throw new IllegalStateException("BAD_CURSOR");
            cursor = next;
        }
        throw new IllegalStateException("TOO_MANY_PAGES");
    }
    JSONArray messages(String channel) throws Exception {
        if (channel == null || !channel.matches("[a-zA-Z0-9-]{8,100}")) throw new IllegalArgumentException("INVALID_CHANNEL");
        return call("/api/v1/channels/" + channel + "/messages?limit=100", null, true, false).getJSONArray("items");
    }
    JSONObject command(String name, JSONObject input, Integer expectedVersion) throws Exception {
        if (name == null || !name.matches("[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+")) throw new IllegalArgumentException("INVALID_COMMAND");
        JSONObject body = new JSONObject().put("input", input).put("idempotency_key", UUID.randomUUID().toString());
        if (expectedVersion != null) body.put("expected_version", expectedVersion);
        return call("/api/v1/commands/" + name, body, true, false);
    }
    JSONObject sendMessage(String channel, String text) throws Exception {
        if (text == null || text.trim().isEmpty() || text.length() > 12000) throw new IllegalArgumentException("INVALID_MESSAGE");
        return command("message.send", new JSONObject().put("channel_id", channel).put("text", text.trim()).put("language", "DE"), null);
    }
    void logout() {
        try { if (isSignedIn()) call("/api/v1/auth/logout", new JSONObject(), true, false); }
        catch (Exception ignored) { /* Server TTL/revocation remains authoritative. */ }
        finally { clear(); }
    }
}
