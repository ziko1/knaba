package de.knaba.mobile;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Public configuration only. Never accepts credentials, follows redirects or guesses an ERP host. */
class ErpServerDiscovery {
    static final String CONFIG_URL = "https://knaba.de/api/public/release";
    static final String USER_AGENT = "KNABA-Android-Discovery/1";
    private static final int MAX_BYTES = 32768;
    private final ErpConsoleTransport.ConnectionFactory connections;

    ErpServerDiscovery() { this(url -> (HttpURLConnection) url.openConnection()); }
    ErpServerDiscovery(ErpConsoleTransport.ConnectionFactory connections) { this.connections = connections; }

    String discover() throws Exception {
        JSONObject config = get(CONFIG_URL);
        Object version = config.opt("schemaVersion");
        if (!(version instanceof Number) || ((Number) version).doubleValue() != 1 || !config.has("erpOrigin"))
            throw failure(0, "SERVER_CONFIG_INVALID");
        if (config.isNull("erpOrigin")) throw failure(0, "SERVER_NOT_CONFIGURED");
        if (!(config.opt("erpOrigin") instanceof String)) throw failure(0, "SERVER_CONFIG_INVALID");
        String origin;
        try {
            origin = ErpOriginPolicy.origin(config.getString("erpOrigin"));
            String host = URI.create(origin).getHost();
            // An official KNABA HTTPS response delegates to a company-owned host only.
            // Adding an external hosting domain needs an explicit reviewed app change.
            if (!(host.equals("knaba.de") || host.endsWith(".knaba.de"))) throw new IllegalArgumentException();
        } catch (IllegalArgumentException invalid) { throw failure(0, "SERVER_CONFIG_INVALID"); }
        JSONObject ready = get(origin + "/ready");
        if (!Boolean.TRUE.equals(ready.opt("ready")) || !"CONNECTED".equals(ready.opt("database")))
            throw failure(0, "SERVER_NOT_READY");
        return origin;
    }

    private JSONObject get(String address) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = connections.open(new URL(address));
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
            connection.setUseCaches(false); connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Cache-Control", "no-cache");
            int status = connection.getResponseCode();
            if (status != 200) throw new ErpConsoleTransport.Failure(status, "SERVER_UNAVAILABLE", false,
                (status == 429 || status == 503) ? ErpReadRetry.retryAfter(connection.getHeaderField("Retry-After"), System.currentTimeMillis()) : 0);
            String type = connection.getContentType();
            if (type == null || !type.split(";", 2)[0].trim().toLowerCase(Locale.ROOT).equals("application/json"))
                throw failure(status, "SERVER_CONFIG_INVALID");
            if (connection.getContentLengthLong() > MAX_BYTES) throw failure(status, "SERVER_CONFIG_INVALID");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] chunk = new byte[4096]; int count;
                while ((count = input.read(chunk)) != -1) {
                    if (buffer.size() + count > MAX_BYTES) throw failure(status, "SERVER_CONFIG_INVALID");
                    buffer.write(chunk, 0, count);
                }
            }
            try { return new JSONObject(buffer.toString(StandardCharsets.UTF_8.name())); }
            catch (org.json.JSONException invalid) { throw failure(status, "SERVER_CONFIG_INVALID"); }
        } catch (IOException unavailable) { throw failure(0, "NETWORK_ERROR"); }
        finally { if (connection != null) connection.disconnect(); }
    }

    private static ErpConsoleTransport.Failure failure(int status, String code) {
        return new ErpConsoleTransport.Failure(status, code, false);
    }
}
