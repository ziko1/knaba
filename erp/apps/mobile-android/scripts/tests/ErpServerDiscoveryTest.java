package de.knaba.mobile;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Explicit HTTP fixtures, never a claim that the live ERP is configured. */
public final class ErpServerDiscoveryTest {
    private static int checks;
    static void check(boolean value, String name) { if (!value) throw new AssertionError(name); checks++; }
    static final class Reply extends HttpURLConnection {
        String body, type = "application/json; charset=utf-8";
        int status = 200; long length = -1; boolean disconnected;
        Reply(String body) throws Exception { super(new URL(ErpServerDiscovery.CONFIG_URL)); this.body = body; }
        public void connect() { }
        public void disconnect() { disconnected = true; }
        public boolean usingProxy() { return false; }
        public int getResponseCode() { return status; }
        public String getContentType() { return type; }
        public long getContentLengthLong() { return length; }
        public InputStream getInputStream() { return new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)); }
    }
    static final class Queue implements ErpConsoleTransport.ConnectionFactory {
        final List<Reply> replies = new ArrayList<>(); final List<URL> urls = new ArrayList<>();
        Reply add(String body) throws Exception { Reply reply = new Reply(body); replies.add(reply); return reply; }
        public HttpURLConnection open(URL url) {
            urls.add(url);
            if (replies.isEmpty()) throw new AssertionError("Unexpected request " + url.getPath());
            return replies.remove(0);
        }
    }
    static String config(Object origin) throws Exception { return new JSONObject().put("schemaVersion",1).put("erpOrigin",origin).toString(); }
    static void fails(Queue q, String expected) throws Exception {
        try { new ErpServerDiscovery(q).discover(); throw new AssertionError("Unsafe discovery succeeded"); }
        catch (ErpConsoleTransport.Failure failure) {
            check(expected.equals(failure.code),"Expected "+expected+", got "+failure.code);
            check(!failure.outcomeUnknown,"Public GET never becomes an uncertain mutation");
        }
    }
    public static void main(String[] args) throws Exception {
        for (Object mode : List.of("PRODUCTION", "DEMO", "test", JSONObject.NULL)) {
            Queue strict = new Queue();
            strict.add(config("https://erp.knaba.de"));
            JSONObject body = new JSONObject().put("ready",true).put("database","CONNECTED");
            if (mode != JSONObject.NULL) body.put("mode",mode);
            strict.add(body.toString());
            try {
                new ErpServerDiscovery(strict, true).discover();
                throw new AssertionError("Test package accepted an unverified mode");
            } catch (ErpConsoleTransport.Failure failure) {
                check("SERVER_NOT_READY".equals(failure.code), "test-only build requires literal ready TEST");
            }
        }
        Queue readyTest = new Queue();
        readyTest.add(config("https://erp.knaba.de")); readyTest.add("{\"ready\":true,\"database\":\"CONNECTED\",\"mode\":\"TEST\"}");
        check("https://erp.knaba.de".equals(new ErpServerDiscovery(readyTest, true).discover()), "test-only build accepts verified TEST");
        String host = "partner-test.knaba.de";
        Queue dedicated = new Queue();
        dedicated.add(config("https://stage-erp.knaba.de"));
        dedicated.add("{\"ready\":true,\"database\":\"CONNECTED\",\"mode\":\"TEST\"}");
        check("https://stage-erp.knaba.de".equals(new ErpServerDiscovery(dedicated, true, host).discover()),
              "Dedicated bootstrap accepts the delegated TEST ERP");
        check(dedicated.urls.get(0).toString().equals("https://partner-test.knaba.de/api/public/release"),
              "Uses only the fixed release path at the configured partner host");
        check(dedicated.urls.get(1).toString().equals("https://stage-erp.knaba.de/ready"), "Probes the delegated origin");
        Queue unconfigured = new Queue();
        unconfigured.add(config(JSONObject.NULL));
        try { new ErpServerDiscovery(unconfigured, true, host).discover(); throw new AssertionError("Unconfigured host accepted"); }
        catch (ErpConsoleTransport.Failure expected) {
            check(expected.code.equals("SERVER_NOT_CONFIGURED") && unconfigured.urls.size() == 1, "Dedicated build never falls back to the official manifest");
        }
        Queue wrongMode = new Queue();
        wrongMode.add(config("https://stage-erp.knaba.de"));
        wrongMode.add("{\"ready\":true,\"database\":\"CONNECTED\",\"mode\":\"PRODUCTION\"}");
        try { new ErpServerDiscovery(wrongMode, true, host).discover(); throw new AssertionError("Non-TEST ERP accepted"); }
        catch (ErpConsoleTransport.Failure expected) {
            check(expected.code.equals("SERVER_NOT_READY"), "Dedicated manifest cannot approve a non-TEST ERP");
        }
        for (String invalid : List.of("", "knaba.de", "erp.knaba.de.example.test", "https://erp.knaba.de",
                "x.knaba.de:443", "x.knaba.de/test", "x.knaba.de?x", "test@x.knaba.de", "-x.knaba.de",
                "x-.knaba.de", "x.knaba.de.", " x.knaba.de", "x".repeat(64) + ".knaba.de")) {
            try { new ErpServerDiscovery(dedicated, true, invalid); throw new AssertionError("Invalid host accepted"); }
            catch (IllegalArgumentException expected) { check(expected.getMessage().equals("INVALID_PARTNER_DISCOVERY_HOST"), "Invalid host rejected"); }
        }
        try { new ErpServerDiscovery(dedicated, false, host); throw new AssertionError("Ordinary build accepted custom discovery"); }
        catch (IllegalArgumentException expected) { check(dedicated.urls.size() == 2, "Ordinary clients reject partner overrides without a request"); }
        Queue q = new Queue(); Reply release = q.add(config("https://erp.knaba.de/"));
        Reply ready = q.add("{\"ready\":true,\"database\":\"CONNECTED\",\"mode\":\"TEST\"}");
        check("https://erp.knaba.de".equals(new ErpServerDiscovery(q).discover()),"Approved origin normalized");
        check(q.urls.get(0).toString().equals("https://knaba.de/api/public/release"),"Only fixed official bootstrap");
        check(q.urls.get(1).toString().equals("https://erp.knaba.de/ready"),"Authoritative ERP readiness checked");
        for (Reply reply : List.of(release,ready)) {
            check(reply.getRequestMethod().equals("GET")&&!reply.getDoOutput(),"Read-only requests");
            check(reply.getRequestProperty("Cookie")==null&&reply.getRequestProperty("Authorization")==null,"No credentials in bootstrap");
            check(ErpServerDiscovery.USER_AGENT.equals(reply.getRequestProperty("User-Agent")),"Stable app identity without device or user identifiers");
            check(!reply.getInstanceFollowRedirects()&&!reply.getUseCaches(),"No redirects or cached config");
            check(reply.getConnectTimeout()==10000&&reply.getReadTimeout()==10000&&reply.disconnected,"Timeouts and cleanup");
        }
        q=new Queue();q.add(config(JSONObject.NULL));fails(q,"SERVER_NOT_CONFIGURED");check(q.urls.size()==1,"Null config never guesses a host");
        for (Object value : List.of("", "http://erp.knaba.de", "https://knaba.de.attacker.test", "https://attacker.test/knaba.de", "https://knaba.de@attacker.test", "https://erp.knaba.de:444", "https://erp.knaba.de/path", "https://erp.knaba.de?token=hidden", "https://erp.knaba.de#hidden", "https://127.0.0.1", "https://localhost", 5)) {
            q=new Queue();q.add(config(value));fails(q,"SERVER_CONFIG_INVALID");check(q.urls.size()==1,"Rejected origin never contacted");
        }
        for (String body : List.of("{}","{\"schemaVersion\":2,\"erpOrigin\":null}","{\"schemaVersion\":\"1\",\"erpOrigin\":null}","<html>Private gateway page</html>","[]")) {
            q=new Queue();q.add(body);fails(q,"SERVER_CONFIG_INVALID");
        }
        for (int status : List.of(301,302,307,401,403,429,503)) {
            q=new Queue();Reply reply=q.add("private server body");reply.status=status;
            fails(q,"SERVER_UNAVAILABLE");check(reply.disconnected&&q.urls.size()==1,"Never follows redirects or auth walls");
        }
        q=new Queue();q.add(config("https://erp.knaba.de")).type="text/html";fails(q,"SERVER_CONFIG_INVALID");
        q=new Queue();q.add("{} "+" ".repeat(32768));fails(q,"SERVER_CONFIG_INVALID");
        q=new Queue();q.add("{}").length=32769;fails(q,"SERVER_CONFIG_INVALID");
        for (String body : List.of("{}","{\"ready\":\"true\",\"database\":\"CONNECTED\"}","{\"ready\":true,\"database\":\"DISCONNECTED\"}")) {
            q=new Queue();q.add(config("https://erp.knaba.de"));q.add(body);fails(q,"SERVER_NOT_READY");
        }
        ErpServerDiscovery offline=new ErpServerDiscovery(url->{throw new java.io.IOException("private network diagnostic");});
        try { offline.discover(); throw new AssertionError("Expected network failure"); }
        catch(ErpConsoleTransport.Failure failure) { check(failure.code.equals("NETWORK_ERROR")&&!failure.getMessage().contains("private"),"Sanitized network failure"); }
        check(ErpReadRetry.retryAfter("300",0)==300000,"Retry-After seconds");
        check(ErpReadRetry.retryAfter("Thu, 01 Jan 1970 00:01:01 GMT",1000)==60000,"Retry-After HTTP date");
        for (String invalid : List.of("-10","NaN","1.5","private error","9".repeat(129))) check(ErpReadRetry.retryAfter(invalid,0)==0,"Invalid retry header ignored");
        check(ErpReadRetry.retryAfter(null,0)==0,"Missing throttle header");
        check(ErpReadRetry.retryAfter("Thu, 01 Jan 1970 00:00:00 GMT",1000)==0,"Past retry date");
        check(ErpReadRetry.delay(30000,1,0,0)==60000&&ErpReadRetry.delay(30000,1,0,1)==72000,"Bounded positive retry jitter");
        check(ErpReadRetry.delay(15000,1,0,1)==36000,"Chat read backoff");
        check(ErpReadRetry.delay(30000,50,0,1)==120000,"Local retry cap");
        check(ErpReadRetry.delay(30000,1,300000,1)==300000,"Server delay overrides local cap");
        System.out.println("PASS "+checks+" server discovery assertions; synthetic HTTP fixtures only");
    }
}
