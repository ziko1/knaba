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
    static final class Journal implements ErpConsoleTransport.Journal {
        final Map<String, String> records = new HashMap<>();
        boolean failWrite, failRemove;
        public String read(String scope) { return records.get(scope); }
        public void write(String scope, String envelope) throws Exception {
            if (failWrite) throw new IOException("PRIVATE_STORAGE_DIAGNOSTIC");
            records.put(scope, envelope);
        }
        public void remove(String scope, String key) throws Exception {
            if (failRemove) throw new IOException("PRIVATE_STORAGE_DIAGNOSTIC");
            String value = records.get(scope);
            if (value != null && new JSONObject(value).getJSONObject("body").getString("idempotency_key").equals(key)) records.remove(scope);
        }
    }
    private static ErpConsoleTransport signed(Queue q, Journal journal, String origin, String user, String company) throws Exception {
        Fake login = q.login();
        login.response = new JSONObject(login.response).put("actor", new JSONObject().put("userId", user).put("companyId", company)).toString();
        ErpConsoleTransport api = new ErpConsoleTransport(q, journal); api.configure(origin); api.login("worker@example.invalid", "fixture-password", ""); return api;
    }
    private static ErpConsoleTransport signed(Queue q) throws Exception {
        q.login(); ErpConsoleTransport api = new ErpConsoleTransport(q); api.configure("https://erp.example.invalid/"); api.login("worker@example.invalid", "fixture-password", ""); return api;
    }
    private static JSONObject input(String text) throws Exception { return new JSONObject().put("title", text); }
    public static void main(String[] args) throws Exception {
        Queue q = new Queue(); ErpConsoleTransport api = signed(q);
        check(api.isSignedIn(), "login accepts session cookie among multiple headers");
        Fake me = q.add("{\"actor\":{\"userId\":\"user-1\",\"companyId\":\"company-1\"},\"csrfToken\":\"" + CSRF + "\"}"); api.me();
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

        Queue identityQueue = new Queue(); ErpConsoleTransport identityApi = signed(identityQueue);
        identityQueue.add("{\"actor\":{\"userId\":\"user-1\",\"companyId\":\"another-company\"},\"csrfToken\":\""+CSRF+"\"}");
        fails("ACCESS_CHANGED", identityApi::me);
        check(!identityApi.isSignedIn(), "identity drift in me cannot rebind a journal to another tenant");

        Queue missingActorQueue = new Queue(); ErpConsoleTransport missingActor = signed(missingActorQueue);
        missingActorQueue.add("{\"actor\":{},\"csrfToken\":\""+CSRF+"\"}");
        fails("ACCESS_CHANGED", missingActor::me); check(!missingActor.isSignedIn(), "malformed me cannot retain authenticated journal access");
        for (Object badId : Arrays.asList(42, new JSONObject().put("nested","id"))) {
            Queue invalidIdQueue = new Queue(); ErpConsoleTransport invalidIdApi = signed(invalidIdQueue);
            invalidIdQueue.add(new JSONObject().put("actor",new JSONObject().put("userId",badId).put("companyId","company-1")).toString());
            fails("ACCESS_CHANGED", invalidIdApi::me); check(!invalidIdApi.isSignedIn(), "non-string identity fails closed instead of retaining signed-in state");
        }
        Queue delayedMeQueue = new Queue(); ErpConsoleTransport delayedMeApi = signed(delayedMeQueue);
        Fake delayedMe = delayedMeQueue.add("{\"actor\":{\"userId\":\"other-user\",\"companyId\":\"other-company\"}}");
        delayedMe.entered = new CountDownLatch(1); delayedMe.release = new CountDownLatch(1); AtomicReference<Throwable> meFailure = new AtomicReference<>();
        Thread meThread = new Thread(() -> { try { delayedMeApi.me(); meFailure.set(new AssertionError("old identity accepted")); } catch(Throwable error) { meFailure.set(error); } });
        meThread.start(); check(delayedMe.entered.await(2,TimeUnit.SECONDS), "old me request paused before new login");
        delayedMeQueue.login(); delayedMeApi.login("new@example.invalid","fixture",""); delayedMe.release.countDown(); meThread.join(2000);
        check(!meThread.isAlive() && meFailure.get() instanceof ErpConsoleTransport.Failure && delayedMeApi.isSignedIn(), "stale me cannot clear newly authenticated session");

        Queue pages = new Queue(); ErpConsoleTransport paged = signed(pages);
        pages.add("{\"items\":[{\"id\":\"first\"}],\"has_more\":true,\"next_cursor\":\"a+b/c=\"}");
        pages.add("{\"items\":[{\"id\":\"second\"}],\"has_more\":false}");
        check(paged.messages("channel-123").length() == 2 && pages.urls.get(2).getQuery().contains("a%2Bb%2Fc%3D"), "message history paginates with encoded cursor");
        pages.add("{\"items\":[],\"has_more\":true,\"next_cursor\":\"repeat\"}");
        pages.add("{\"items\":[],\"has_more\":true,\"next_cursor\":\"repeat\"}");
        fails("BAD_CURSOR", () -> paged.entities("task"));
        pages.add("{\"items\":[],\"has_more\":\"false\"}");
        fails("INVALID_RESPONSE", () -> paged.entities("task"));
        Journal journal = new Journal(); Queue initial = new Queue();
        ErpConsoleTransport beforeRestart = signed(initial, journal, "https://erp.example.invalid", "user-1", "company-1");
        Fake lost = initial.add("{}"); lost.failRead = true;
        fails("NETWORK_ERROR", () -> beforeRestart.command("task.worklog", input("Durable original"), 2, "durable-original-key"));
        check(journal.records.size() == 1, "unresolved command persisted before process exit");
        String stored = journal.records.values().iterator().next();
        check(!stored.contains(TOKEN) && !stored.contains(CSRF) && !stored.contains("fixture-password"), "journal contains no login/session credentials");
        beforeRestart.clear();
        check(journal.records.size() == 1 && beforeRestart.pendingCommand() == null, "logout hides but does not discard unresolved command");
        Queue otherQueue = new Queue();
        ErpConsoleTransport otherActor = signed(otherQueue, journal, "https://erp.example.invalid", "user-2", "company-1");
        check(!otherActor.hasPendingCommand() && otherActor.pendingCommand() == null, "other authenticated user cannot discover pending payload");
        ErpConsoleTransport otherCompany = signed(new Queue(), journal, "https://erp.example.invalid", "user-1", "company-2");
        check(!otherCompany.hasPendingCommand(), "same user on another company cannot replay pending command");
        ErpConsoleTransport otherOrigin = signed(new Queue(), journal, "https://other.example.invalid", "user-1", "company-1");
        check(!otherOrigin.hasPendingCommand(), "origin-scoped recovery cannot leak command to another HTTPS server");
        Queue restartedQueue = new Queue();
        ErpConsoleTransport restarted = signed(restartedQueue, journal, "https://erp.example.invalid", "user-1", "company-1");
        check(restarted.hasPendingCommand() && restarted.pendingCommand().getString("name").equals("task.worklog"), "fresh transport restores after same actor login");
        JSONObject recovered = restarted.pendingCommand(); recovered.getJSONObject("input").put("title", "Tampered caller copy");
        check(restarted.pendingCommand().getJSONObject("input").getString("title").equals("Durable original"), "pending envelope is defensive copy");
        fails("PENDING_COMMAND_REQUIRES_RETRY", () -> restarted.command("task.create", input("New mutation"), null, "new-after-restart"));
        Fake permissionLost = restartedQueue.add("{\"code\":\"ACCESS_DENIED\"}"); permissionLost.status = 403;
        check(fails("ACCESS_DENIED", () -> restarted.command("task.worklog", input("Durable original"), 2, "ignored-new-key")).outcomeUnknown && journal.records.size() == 1,
            "denied retry never erases an earlier ambiguous result");
        Fake exactRetry = restartedQueue.add("{\"id\":\"committed-once\"}");
        restarted.command("task.worklog", input("Durable original"), 2, "ignored-new-key");
        check(lost.body().toString().equals(exactRetry.body().toString()), "restart retry preserves exact original body version and idempotency key");
        check(journal.records.isEmpty() && !restarted.hasPendingCommand(), "confirmed response clears durable and RAM state");
        journal.failWrite = true; int writesBefore = restartedQueue.urls.size();
        check(!fails("RECOVERY_STORAGE_UNAVAILABLE", () -> restarted.command("task.create", input("Never sent"), null, "storage-error-key")).outcomeUnknown,
            "journal write failure is a definite no-send result");
        check(writesBefore == restartedQueue.urls.size() && !restarted.hasPendingCommand(), "storage failure prevents network mutation");
        journal.failWrite = false; journal.failRemove = true; restartedQueue.add("{}");
        check(fails("RECOVERY_STORAGE_UNAVAILABLE", () -> restarted.command("task.create", input("Committed"), null, "remove-error-key")).outcomeUnknown && restarted.hasPendingCommand(),
            "failed durable cleanup retains exact retry instead of forgetting committed command");
        journal.failRemove = false; restartedQueue.add("{}"); restarted.command("task.create", input("Committed"), null, "different-key");
        check(journal.records.isEmpty(), "durable cleanup recovers on explicit same-key retry");
        Fake definitelyRejected = restartedQueue.add("{\"code\":\"VALIDATION_ERROR\"}"); definitelyRejected.status = 422;
        fails("VALIDATION_ERROR", () -> restarted.command("task.create", input("Invalid"), null, "definite-error-key"));
        check(journal.records.isEmpty(), "first-attempt definite rejection clears journal");
        Fake futurePending = restartedQueue.add("{}"); futurePending.failRead = true;
        fails("NETWORK_ERROR", () -> restarted.command("task.create", input("Retained"), null, "corrupt-state-key"));
        String scopeKey = journal.records.keySet().iterator().next(); journal.records.put(scopeKey, "corrupt");
        Queue corruptQueue = new Queue(); corruptQueue.login(); ErpConsoleTransport corrupt = new ErpConsoleTransport(corruptQueue, journal); corrupt.configure("https://erp.example.invalid");
        fails("RECOVERY_STORAGE_INVALID", () -> corrupt.login("worker@example.invalid", "fixture", ""));
        check(!corrupt.isSignedIn() && journal.records.get(scopeKey).equals("corrupt"), "corrupt journal fails closed and preserves evidence");
        System.out.println("PASS ERP transport assertions=" + cases + "; explicit HTTP/journal doubles and fresh-instance recovery; live ERP, Android OS process death NOT_RUN");
    }
}
