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
