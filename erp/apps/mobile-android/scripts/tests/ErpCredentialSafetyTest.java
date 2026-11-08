package de.knaba.mobile;

import de.knaba.mobile.ErpConsoleTransportTest.Fake;
import de.knaba.mobile.ErpConsoleTransportTest.Queue;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Real transport with synthetic HTTP/journal doubles; no credentials or requests leave this process. */
public final class ErpCredentialSafetyTest {
    private static int assertions, tests, failures;
    private interface Checked { void run() throws Exception; }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); assertions++; }
    private static void test(String name, Checked action) {
        tests++;
        try { action.run(); }
        catch (Throwable error) { failures++; System.out.println("FAILED: " + name + " / " + error.getClass().getSimpleName() + ": " + error.getMessage()); }
    }
    private static ErpConsoleTransport.Failure failure(String code, Checked action) throws Exception {
        try { action.run(); throw new AssertionError("Expected safe error " + code); }
        catch (ErpConsoleTransport.Failure error) { check(code.equals(error.code), "Expected safe error " + code); return error; }
    }
    private static final class Journal implements ErpConsoleTransport.Journal {
        final Map<String,String> records = new HashMap<>();
        int writes;
        public String read(String scope) { return records.get(scope); }
        public void write(String scope, String envelope) { writes++; records.put(scope,envelope); }
        public void remove(String scope, String key) throws Exception {
            String record=records.get(scope);
            if (record!=null && new JSONObject(record).getJSONObject("body").getString("idempotency_key").equals(key)) records.remove(scope);
        }
    }
    private static JSONObject actor() throws Exception {
        return new JSONObject().put("userId","user-1").put("companyId","company-1")
            .put("roles",new JSONArray().put("EMPLOYEE").put("SUPERVISOR"))
            .put("permissions",new JSONArray().put("identity.self").put("task.read"))
            .put("siteIds",new JSONArray().put("site-a")).put("mfaVerified",true);
    }
    private static String identity(JSONObject actor) throws Exception { return new JSONObject().put("actor",actor).put("csrfToken","c".repeat(43)).toString(); }
    private static ErpConsoleTransport signed(Queue queue, Journal journal) throws Exception {
        Fake response=queue.login(); response.response=identity(actor());
        ErpConsoleTransport transport=new ErpConsoleTransport(queue,journal);
        transport.configure("https://erp.example.invalid"); transport.login("synthetic@example.invalid","synthetic-login",""); return transport;
    }
    private static JSONObject passwordInput() throws Exception {
        return new JSONObject().put("currentPassword","synthetic-old-password").put("newPassword","synthetic-new-password");
    }
    public static void main(String[] args) throws Exception {
        test("credential change never journals and requires reauthentication",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            queue.add(identity(actor())); Fake response=queue.add("{\"ok\":true,\"reauthenticationRequired\":true}");
            transport.command("user.password.rotate",passwordInput(),null,"synthetic-password-key");
            check(journal.writes==0 && journal.records.isEmpty(),"Credential input reached durable recovery");
            check(!transport.isSignedIn() && !transport.hasPendingCommand(),"Credential change must leave no reusable session or retry");
            check(queue.urls.size()==3 && queue.urls.get(1).getPath().equals("/api/v1/me"),"Credential change must freshly check authority once");
            check(response.body().getJSONObject("input").getString("newPassword").equals("synthetic-new-password"),"Credential change sends original input exactly once");
        });
        test("MFA configure is a one-shot command too",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            queue.add(identity(actor())); queue.add("{\"ok\":true,\"reauthenticationRequired\":true}");
            transport.command("user.mfa.configure",new JSONObject().put("currentPassword","synthetic-old-password").put("secret","ABCDEFGHIJKLMNOP").put("otp","123456"),null,"synthetic-mfa-key");
            check(journal.writes==0 && !transport.isSignedIn() && !transport.hasPendingCommand(),"MFA secret or OTP entered recovery");
        });
        test("nested arbitrary secrets are rejected before journal or network",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            JSONObject input=new JSONObject().put("nested",new JSONArray().put(new JSONObject().put("api_key","synthetic-secret")));
            Throwable result=null; try { transport.command("task.create",input,null,"synthetic-nested-key"); } catch(Throwable error) { result=error; }
            check(journal.writes==0 && queue.urls.size()==1,"Nested secret must not reach journal or connection factory");
            check(result instanceof ErpConsoleTransport.Failure && ((ErpConsoleTransport.Failure)result).code.equals("SENSITIVE_COMMAND"),"Nested secret needs a safe explicit refusal");
        });
        test("invalid credential fields never dispatch",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            Throwable result=null; try { transport.command("user.password.rotate",passwordInput().put("extra","not-allowed"),null,"synthetic-invalid-key"); } catch(Throwable error) { result=error; }
            check(journal.writes==0 && queue.urls.size()==1,"Unexpected credential fields must fail before storage or I/O");
            check(result instanceof ErpConsoleTransport.Failure && ((ErpConsoleTransport.Failure)result).code.equals("INVALID_COMMAND"),"Invalid one-shot shape must fail safely");
        });
        test("unknown credential outcome cannot become an automatic or explicit replay",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            queue.add(identity(actor())); Fake response=queue.add("{}"); response.failRead=true;
            check(failure("NETWORK_ERROR",()->transport.command("user.password.rotate",passwordInput(),null,"synthetic-unknown-key")).outcomeUnknown,"Lost credential response must remain unknown");
            check(journal.writes==0 && !transport.isSignedIn() && !transport.hasPendingCommand(),"Unknown credential outcome must discard recovery and session");
            int before=queue.urls.size(); failure("NEEDS_REAUTH",()->transport.command("user.password.rotate",passwordInput(),null,"synthetic-unknown-key"));
            check(queue.urls.size()==before,"Credential command was replayed without a new login");
        });
        test("same-user permission refresh fences a late private response",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            Fake privateRead=queue.add("{\"private\":true}"); privateRead.entered=new CountDownLatch(1); privateRead.release=new CountDownLatch(1);
            AtomicReference<Throwable> result=new AtomicReference<>();
            Thread worker=new Thread(()->{try { transport.dashboard(); result.set(new AssertionError("Late private response accepted")); } catch(Throwable error) { result.set(error); }});
            worker.start(); check(privateRead.entered.await(2,TimeUnit.SECONDS),"Private read fixture did not start");
            Throwable refresh=null;
            try { queue.add(identity(actor().put("permissions",new JSONArray().put("identity.self")))); transport.me(); }
            catch(Throwable error) { refresh=error; }
            finally { privateRead.release.countDown(); worker.join(2000); }
            check(refresh instanceof ErpConsoleTransport.Failure && ((ErpConsoleTransport.Failure)refresh).code.equals("ACCESS_CHANGED"),"Same-user permission change was not fenced");
            check(!worker.isAlive() && result.get() instanceof ErpConsoleTransport.Failure && ((ErpConsoleTransport.Failure)result.get()).code.equals("ACCESS_CHANGED"),"Old private response escaped the new authority boundary");
            check(!transport.isSignedIn(),"Changed authority must require reauthentication");
        });
        test("authority ordering and reporting timestamp are stable but MFA expiry is not",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            JSONObject reordered=actor().put("roles",new JSONArray().put("SUPERVISOR").put("EMPLOYEE"))
                .put("permissions",new JSONArray().put("task.read").put("identity.self")).put("mfaVerifiedAt","2026-11-08T00:00:00Z");
            queue.add(identity(reordered)); transport.me(); check(transport.isSignedIn(),"Equivalent authority must not cause reauthentication");
            queue.add(identity(actor().put("mfaVerified",false))); failure("ACCESS_CHANGED",transport::me);
            check(!transport.isSignedIn(),"MFA expiry must revoke old in-flight authority");
        });
        test("legacy credential journals cannot restore a retry",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            Fake response=queue.add("{}"); response.failRead=true;
            failure("NETWORK_ERROR",()->transport.command("task.create",new JSONObject().put("title","synthetic-safe"),null,"synthetic-legacy-key"));
            String scope=journal.records.keySet().iterator().next(); JSONObject saved=new JSONObject(journal.records.get(scope));
            saved.getJSONObject("body").put("input",new JSONObject().put("nested",new JSONObject().put("accessToken","synthetic-legacy-secret")));
            journal.records.put(scope,saved.toString()); transport.clear(); Fake login=queue.login(); login.response=identity(actor());
            failure("RECOVERY_STORAGE_INVALID",()->transport.login("synthetic@example.invalid","synthetic-login",""));
            check(!transport.isSignedIn() && !transport.hasPendingCommand(),"Legacy credential input was exposed as a recovered command");
        });
        test("future authority fields are part of the session boundary",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            queue.add(identity(actor().put("delegationScope",new JSONObject().put("siteIds",new JSONArray().put("site-b")))));
            failure("ACCESS_CHANGED",transport::me);
            check(!transport.isSignedIn(),"Future authority fields were ignored");
        });
        test("late one-shot completion cannot clear a newer login",()->{
            Queue queue=new Queue(); Journal journal=new Journal(); ErpConsoleTransport transport=signed(queue,journal);
            queue.add(identity(actor())); Fake response=queue.add("{\"ok\":true,\"reauthenticationRequired\":true}");
            response.entered=new CountDownLatch(1); response.release=new CountDownLatch(1);
            AtomicReference<Throwable> result=new AtomicReference<>();
            Thread worker=new Thread(()->{try { transport.command("user.password.rotate",passwordInput(),null,"synthetic-late-key"); result.set(new AssertionError("Old credential response accepted")); } catch(Throwable error) { result.set(error); }});
            worker.start();
            try {
                check(response.entered.await(2,TimeUnit.SECONDS),"One-shot fixture did not start");
                failure("COMMAND_IN_PROGRESS",()->transport.command("task.create",new JSONObject().put("title","synthetic"),null,"synthetic-concurrent-key"));
                transport.clear(); Fake login=queue.login(); login.response=identity(actor().put("userId","user-2"));
                transport.login("new-synthetic@example.invalid","synthetic-login","");
            } finally { response.release.countDown(); worker.join(2000); }
            check(!worker.isAlive() && result.get() instanceof ErpConsoleTransport.Failure && ((ErpConsoleTransport.Failure)result.get()).code.equals("ACCESS_CHANGED"),"Late one-shot result was not fenced");
            check(transport.isSignedIn() && journal.writes==0,"Old one-shot cleanup erased a newer login or persisted credentials");
        });
        System.out.println("Credential safety: " + tests + " tests, " + assertions + " assertions, " + failures + " failures (synthetic HTTP/journal doubles)");
        if (failures!=0) throw new AssertionError("Credential safety checks failed");
    }
}
