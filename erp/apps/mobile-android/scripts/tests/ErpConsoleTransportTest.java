package de.knaba.mobile;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** CPU tests of the real transport against explicit HTTP connection doubles, not live ERP acceptance. */
public final class ErpConsoleTransportTest {
    private static int cases;
    private static final String TOKEN = "t".repeat(43), CSRF = "c".repeat(43);
    private static void check(boolean ok, String name) { if (!ok) throw new AssertionError(name); cases++; }
    private interface Checked { void run() throws Exception; }
    private static ErpConsoleTransport.Failure fails(String code, Checked action) throws Exception {
        try { action.run(); throw new AssertionError("Expected " + code); }
        catch (ErpConsoleTransport.Failure failure) { check(code.equals(failure.code), "safe code " + failure.code + " expected " + code); return failure; }
    }
    static final class Fake extends HttpURLConnection {
        int status = 200; String response = "{}"; boolean disconnected, failWrite, failRead;
        CountDownLatch entered, release;
        ByteArrayOutputStream sent = new ByteArrayOutputStream();
        Map<String,List<String>> headers = new LinkedHashMap<>();
        Fake(String body) throws Exception { super(new URL("https://erp.example.invalid")); response = body; }
        @Override public void connect() {}
        @Override public void disconnect() { disconnected = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public OutputStream getOutputStream() throws IOException { if (failWrite) throw new IOException("secret URL must not surface"); return sent; }
        @Override public int getResponseCode() throws IOException {
            if (entered != null) entered.countDown();
            try { if (release != null && !release.await(3, TimeUnit.SECONDS)) throw new IOException("fixture timeout"); }
            catch (InterruptedException e) { throw new IOException(e); }
            return status;
        }
        @Override public InputStream getInputStream() throws IOException { if (failRead) throw new IOException("PRIVATE_RESPONSE"); return new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8)); }
        @Override public InputStream getErrorStream() { return new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8)); }
        @Override public Map<String,List<String>> getHeaderFields() { return headers; }
        JSONObject body() throws Exception { return new JSONObject(sent.toString("UTF-8")); }
    }
    static final class Queue implements ErpConsoleTransport.ConnectionFactory {
        final List<Fake> queue = new ArrayList<>(); final List<URL> urls = new ArrayList<>();
        synchronized Fake add(String body) throws Exception { Fake f = new Fake(body); queue.add(f); return f; }
        synchronized Fake login() throws Exception {
            Fake f = add("{\"actor\":{\"userId\":\"user-1\",\"companyId\":\"company-1\"},\"csrfToken\":\"" + CSRF + "\"}");
            f.headers.put("set-cookie", Arrays.asList("unrelated=abc; Secure", "knaba_session=" + TOKEN + "; Path=/; Secure; HttpOnly"));
            return f;
        }
        @Override public synchronized HttpURLConnection open(URL url) { urls.add(url); if (queue.isEmpty()) throw new AssertionError("unexpected network call " + url.getPath()); return queue.remove(0); }
    }
    private static ErpConsoleTransport signed(Queue q) throws Exception {
        q.login(); ErpConsoleTransport api = new ErpConsoleTransport(q); api.configure("https://erp.example.invalid/"); api.login("worker@example.invalid", "fixture-password", ""); return api;
    }
    private static JSONObject input(String text) throws Exception { return new JSONObject().put("title", text); }
    public static void main(String[] args) throws Exception {
        Queue q = new Queue(); ErpConsoleTransport api = signed(q);
        check(api.isSignedIn(), "login accepts session cookie among multiple headers");
        Fake me = q.add("{\"actor\":{},\"csrfToken\":\"" + CSRF + "\"}"); api.me();
        check(("knaba_session=" + TOKEN).equals(me.getRequestProperty("Cookie")), "isolated cookie sent");
        check(!me.getInstanceFollowRedirects() && me.getConnectTimeout() == 15000 && me.getReadTimeout() == 15000 && me.disconnected, "timeouts redirect block and cleanup");
        Fake denied = q.add("{\"code\":\"ACCESS_DENIED\"}"); denied.status = 403;
        check(!fails("ACCESS_DENIED", api::dashboard).outcomeUnknown && api.isSignedIn(), "403 preserves login");
        Fake unsafeError = q.add("{\"code\":\"private@email.invalid\"}"); unsafeError.status = 400;
        fails("HTTP_ERROR", api::dashboard);
        Fake expired = q.add("<html>private gateway page</html>"); expired.status = 401;
        ErpConsoleTransport.Failure expiredFailure = fails("HTTP_ERROR", api::dashboard);
        check(expiredFailure.status == 401 && !api.isSignedIn(), "non-JSON 401 revokes local credentials");
        int before = q.urls.size(); fails("NEEDS_REAUTH", api::me); check(q.urls.size() == before, "no authenticated I/O after logout");

        Queue staleQueue = new Queue(); Fake delayedLogin = staleQueue.login(); delayedLogin.entered = new CountDownLatch(1); delayedLogin.release = new CountDownLatch(1);
        ErpConsoleTransport stale = new ErpConsoleTransport(staleQueue); stale.configure("https://erp.example.invalid"); AtomicReference<Throwable> late = new AtomicReference<>();
        Thread login = new Thread(() -> { try { stale.login("a@b.invalid", "fixture", ""); late.set(new AssertionError("stale login accepted")); } catch (Throwable e) { late.set(e); } });
        login.start(); check(delayedLogin.entered.await(2, TimeUnit.SECONDS), "delayed login started");
        long start = System.nanoTime(); stale.clear();
        check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 500, "clear does not wait on login network monitor");
        delayedLogin.release.countDown(); login.join(2000);
        check(!login.isAlive() && late.get() instanceof ErpConsoleTransport.Failure && ((ErpConsoleTransport.Failure)late.get()).code.equals("ACCESS_CHANGED") && !stale.isSignedIn(), "late login cannot restore cleared account");

        Queue logoutQueue = new Queue(); ErpConsoleTransport logoutApi = signed(logoutQueue); Runnable oldLogout = logoutApi.detachSessionForLogout();
        check(!logoutApi.isSignedIn(), "detach clears synchronously"); logoutQueue.login(); logoutApi.login("new@example.invalid", "fixture", "");
        Fake remoteLogout = logoutQueue.add("{}"); oldLogout.run();
        check(logoutApi.isSignedIn() && ("knaba_session="+TOKEN).equals(remoteLogout.getRequestProperty("Cookie")), "old remote logout leaves newer local session untouched");

        Queue commands = new Queue(); ErpConsoleTransport commandApi = signed(commands);
        Fake ambiguous = commands.add("{}"); ambiguous.failRead = true;
        ErpConsoleTransport.Failure uncertain = fails("NETWORK_ERROR", () -> commandApi.command("task.create", input("Original"), null, "original-key"));
        check(uncertain.outcomeUnknown && !uncertain.getMessage().contains("PRIVATE") && commandApi.hasPendingCommand(), "post-submit error marked ambiguous and redacted with pending state");
        int networkCount = commands.urls.size(); fails("PENDING_COMMAND_REQUIRES_RETRY", () -> commandApi.command("task.create", input("Changed"), null, "new-key-123"));
        check(commands.urls.size() == networkCount, "changed mutation blocked while original outcome unresolved");
        Fake retry = commands.add("{\"id\":\"saved\"}"); commandApi.command("task.create", input("Original"), null, "new-key-123");
        check(ambiguous.body().toString().equals(retry.body().toString()) && retry.body().getString("idempotency_key").equals("original-key"), "manual retry preserves exact original envelope/key");
        check(!commandApi.hasPendingCommand(), "success clears pending state");
        Fake newAction = commands.add("{}"); commandApi.command("task.create", input("Original"), null, "next-success-key");
        check(newAction.body().getString("idempotency_key").equals("next-success-key"), "confirmed success permits a separate action");
        Fake invalid = commands.add("{\"code\":\"VALIDATION_ERROR\"}"); invalid.status = 422;
        check(!fails("VALIDATION_ERROR", () -> commandApi.command("task.create", input("Invalid"), null, "invalid-key")).outcomeUnknown, "definite rejection classified");
        commands.add("{}"); commandApi.command("task.create", input("Corrected"), null, "corrected-key");
        Fake server = commands.add("{\"code\":\"DATABASE_ERROR\"}"); server.status = 500;
        check(fails("DATABASE_ERROR", () -> commandApi.command("task.create", input("Server failure"), null, "server-key")).outcomeUnknown, "5xx remains unresolved");
        Fake serverRetry = commands.add("{}"); commandApi.command("task.create", input("Server failure"), null, "different-key");
        check(serverRetry.body().getString("idempotency_key").equals("server-key"), "5xx retries original key");
        Fake writeFailure = commands.add("{}"); writeFailure.failWrite = true;
        check(fails("NETWORK_ERROR", () -> commandApi.command("task.create", input("Write"), null, "write-key")).outcomeUnknown && writeFailure.disconnected, "failed output cleaned up and treated uncertain");
        commands.add("{}"); commandApi.command("task.create", input("Write"), null, "write-key");
        Fake message = commands.add("{}"); commandApi.sendMessage("channel-123", "  Привіт  ", "uk", "message-key");
        check(message.body().getJSONObject("input").getString("language").equals("UK") && message.body().getJSONObject("input").getString("text").equals("Привіт"), "selected locale and trimmed chat text");
        fails("INVALID_LANGUAGE", () -> commandApi.sendMessage("channel-123", "x", "xx", "message-key"));
        fails("INVALID_COMMAND", () -> commandApi.command("task.update", input("x"), -1, "invalid-key"));
        Fake redirect = commands.add("{}"); redirect.status = 302;
        check(fails("REDIRECT_BLOCKED", () -> commandApi.command("task.create", input("Redirect"), null, "redirect-key")).outcomeUnknown, "POST redirect cannot cause silent resubmission");
        commands.add("{}"); commandApi.command("task.create", input("Redirect"), null, "redirect-key");
        Fake malformed = commands.add("not JSON");
        check(fails("INVALID_RESPONSE", () -> commandApi.command("task.create", input("Bad response"), null, "malformed-key")).outcomeUnknown, "malformed success preserves pending mutation");
        commands.add("{}"); commandApi.command("task.create", input("Bad response"), null, "malformed-key");

        Queue pages = new Queue(); ErpConsoleTransport paged = signed(pages);
        pages.add("{\"items\":[{\"id\":\"first\"}],\"has_more\":true,\"next_cursor\":\"a+b/c=\"}");
        pages.add("{\"items\":[{\"id\":\"second\"}],\"has_more\":false}");
        check(paged.messages("channel-123").length() == 2 && pages.urls.get(2).getQuery().contains("a%2Bb%2Fc%3D"), "message history paginates with encoded cursor");
        pages.add("{\"items\":[],\"has_more\":true,\"next_cursor\":\"repeat\"}");
        pages.add("{\"items\":[],\"has_more\":true,\"next_cursor\":\"repeat\"}");
        fails("BAD_CURSOR", () -> paged.entities("task"));
        pages.add("{\"items\":[],\"has_more\":\"false\"}");
        fails("INVALID_RESPONSE", () -> paged.entities("task"));
        System.out.println("PASS ERP transport assertions=" + cases + "; explicit HTTP doubles; live ERP, Android device and process-death recovery NOT_RUN");
    }
}
