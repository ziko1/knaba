package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Real protocol/state/transport code with explicit connection doubles. Not a browser/device gate. */
public final class ErpFederationLoginTest {
    static final String ORIGIN="https://erp.example.invalid", OLD="o".repeat(43), NEW="KF3."+"n".repeat(43), CSRF="c".repeat(43);
    static int assertions;
    interface Checked { void run() throws Exception; }
    static void check(boolean value,String description) { if(!value) throw new AssertionError(description); assertions++; }
    static void fails(String code,Checked operation) throws Exception {
        try { operation.run(); throw new AssertionError("Expected safe failure "+code); }
        catch(ErpConsoleTransport.Failure failure) { check(code.equals(failure.code),"safe failure "+failure.code+" expected "+code); }
    }
    static final class Clock implements ErpFederationLogin.Clock {
        long wall=Instant.parse("2026-11-08T12:00:00Z").toEpochMilli(), elapsed;
        public long wall() { return wall; }
        public long elapsed() { return elapsed; }
        String expires(long delta) { return Instant.ofEpochMilli(wall+delta).toString(); }
    }
    static JSONObject actor(String id) throws Exception {
        return new JSONObject().put("userId",id).put("companyId","company").put("roles",new JSONArray().put("OWNER"))
            .put("permissions",new JSONArray().put("*" )).put("siteIds",new JSONArray()).put("warehouseIds",new JSONArray())
            .put("customerIds",new JSONArray()).put("mfaVerified",true);
    }
    static JSONObject profile(String user) throws Exception { return new JSONObject().put("mode","TEST").put("actor",actor(user)).put("csrfToken",CSRF); }
    static JSONObject config() throws Exception {
        return new JSONObject().put("enabled",true).put("authorizationIssuer",ORIGIN+"/auth/federation")
            .put("authorities",new JSONArray().put(new JSONObject().put("authorityId","site").put("label","site.example.invalid").put("siteOrigin","https://site.example.invalid")))
            .put("clients",new JSONArray().put(new JSONObject().put("clientId",ErpFederationLogin.CLIENT_ID).put("kind","NATIVE").put("platform","ANDROID")
                .put("label","KNABA Android Test").put("redirectUri",ErpFederationLogin.REDIRECT)));
    }
    static String header(String token) { return "knaba_session="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800"; }
    static class Fake extends HttpURLConnection {
        int status=200; String response; Map<String,List<String>> headers=new LinkedHashMap<>();
        ByteArrayOutputStream body=new ByteArrayOutputStream(); boolean readFailure; Runnable beforeHeaders,beforeRead;
        Fake(String response) throws Exception { super(new URL(ORIGIN)); this.response=response; }
        public void connect() { } public void disconnect() { } public boolean usingProxy() { return false; }
        public OutputStream getOutputStream() { return body; }
        public int getResponseCode() { if(beforeHeaders!=null) beforeHeaders.run(); return status; }
        public Map<String,List<String>> getHeaderFields() { return headers; }
        public InputStream getInputStream() throws IOException {
            if(beforeRead!=null) beforeRead.run();
            if(readFailure) throw new IOException("PRIVATE_ERROR_MUST_NOT_ESCAPE");
            return new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8));
        }
        Fake cookie(String value) { headers.put("Set-Cookie",List.of(value)); return this; }
        JSONObject sent() throws Exception { return new JSONObject(body.toString("UTF-8")); }
    }
    static final class Queue implements ErpConsoleTransport.ConnectionFactory {
        final ArrayDeque<Fake> replies=new ArrayDeque<>(); final List<String> paths=new ArrayList<>(); final List<Fake> used=new ArrayList<>();
        synchronized void add(Fake... values) { Collections.addAll(replies,values); }
        public synchronized HttpURLConnection open(URL url) {
            check(url.getProtocol().equals("https") && url.getHost().equals("erp.example.invalid"),"pinned own HTTPS origin");
            if(replies.isEmpty()) throw new AssertionError("Unexpected request "+url.getPath());
            Fake next=replies.remove(); paths.add(url.getPath()); used.add(next); return next;
        }
    }
    static final class Journal implements ErpConsoleTransport.Journal {
        Map<String,String> values=new HashMap<>(); boolean fail; Runnable reading;
        public String read(String scope) throws Exception { if(reading!=null)reading.run(); if(fail)throw new IOException("PRIVATE_DISK"); return values.get(scope); }
        public void write(String scope,String value) { values.put(scope,value); }
        public void remove(String scope,String key) { values.remove(scope); }
    }
    static final class MediaJournal implements ErpMedia.Journal {
        List<ErpMedia.Record> records=new ArrayList<>(); boolean unavailable, malformed;
        public List<ErpMedia.Record> read(String scope) throws Exception { if(unavailable)throw new IOException("SYNTHETIC_MEDIA_DISK"); if(malformed)throw new org.json.JSONException("SYNTHETIC_MEDIA_PARSE"); return records; }
        public void save(ErpMedia.Record record) { throw new AssertionError("Federation preparation must not write media recovery"); }
        public void remove(String scope,String key) { throw new AssertionError("Federation preparation must not remove media recovery"); }
    }
    static final class Fixture {
        final Queue queue=new Queue(); final Clock clock=new Clock(); final Journal journal=new Journal();
        final MediaJournal media=new MediaJournal();
        ErpConsoleTransport transport=new ErpConsoleTransport(queue,journal,media); ErpFederationLogin flow;
        Fake start; String oldToken=OLD;
        Fixture() { transport.configure(ORIGIN); }
        void oldLogin(String token) throws Exception {
            oldToken=token; queue.add(new Fake(profile("old-user").toString()).cookie(header(token)));
            transport.login("old@example.invalid","exact old secret",null);
        }
        Fake health(String mode) throws Exception { return new Fake(new JSONObject().put("ok",true).put("application","KNABA DE").put("mode",mode).put("apiVersion",1).toString()); }
        void ready() throws Exception {
            flow=transport.federationLogin(true,clock); queue.add(health("TEST"),new Fake(config().toString())); flow.discover();
            check(flow.phase()==ErpFederationLogin.Phase.READY,"exact TEST supported client available");
        }
        void browser() throws Exception {
            ready(); start=new Fake(new JSONObject().put("requestId","12345678-1234-4234-8234-123456789abc")
                .put("authorizationUrl",ORIGIN+"/auth/federation/authorize?request_id=12345678-1234-4234-8234-123456789abc")
                .put("expiresAt",clock.expires(300_000)).toString());
            queue.add(health("TEST"),new Fake(config().toString()),start); flow.start("site");
            check(flow.phase()==ErpFederationLogin.Phase.BROWSER,"explicit start ready for system browser");
        }
        String callback() throws Exception { return ErpFederationLogin.REDIRECT+"?code=K3C."+"k".repeat(43)+"&state="+start.sent().getString("state")+"&iss="+URLEncoder.encode(ORIGIN+"/auth/federation",StandardCharsets.UTF_8); }
        void code() throws Exception { browser(); check(flow.callback(callback()),"valid bound callback accepted once"); }
        Fake token() throws Exception { return new Fake(profile("new-user").put("expiresAt",clock.expires(3_600_000)).toString()).cookie(header(NEW)); }
        void oldUnchanged() throws Exception {
            Fake read=new Fake("{}"); queue.add(read); transport.dashboard();
            check(("knaba_session="+oldToken).equals(read.getRequestProperty("Cookie")),"old cookie stays usable and unchanged");
            check(transport.isSignedIn(),"old actor/csrf remain together");
        }
        void unknown() throws Exception { Fake lost=token(); lost.readFailure=true; queue.add(lost); fails("NETWORK_ERROR",()->flow.redeem()); check(flow.phase()==ErpFederationLogin.Phase.RECOVERABLE,"header candidate retained after lost body"); }
        void adopt() throws Exception { transport=flow.adopt().transport; }
    }
    static void protocol() throws Exception {
        check(ErpFederationLogin.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk").equals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"),"RFC7636 S256 vector");
        check(ErpFederationLogin.parseConfiguration(config(),ORIGIN,false)==null,"release registry is empty");
        check(ErpFederationLogin.parseConfiguration(new JSONObject().put("enabled",false),ORIGIN,true)==null,"disabled is default off");
        for(String field:List.of("platform","kind","redirectUri")) {
            JSONObject invalid=config(); invalid.getJSONArray("clients").getJSONObject(0).put(field,"FOREIGN");
            fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(invalid,ORIGIN,true));
        }
        JSONObject labelOnly=config(); labelOnly.getJSONArray("clients").getJSONObject(0).put("clientId","other-client");
        check(ErpFederationLogin.parseConfiguration(labelOnly,ORIGIN,true)==null,"never select by a matching label");
        JSONObject duplicate=config(); duplicate.getJSONArray("clients").put(duplicate.getJSONArray("clients").getJSONObject(0));
        fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(duplicate,ORIGIN,true));
        Fixture f=new Fixture(); f.oldLogin(OLD); f.browser(); String callback=f.callback();
        for(String bad:List.of(callback+"#extra",callback+"&state="+"x".repeat(43),callback+"&other=x",callback.replace("?code=","?%63ode="),
                callback.replace(":/auth","://host/auth"),callback.replace("/callback?","/other?"),callback.replace("/callback?","/%63allback?"),
                callback.replace("state=","state=x"),callback.replace("K3C.","KF3."),callback.replace("erp.example.invalid","other.example.invalid")))
            check(!f.flow.callback(bad),"reject malformed/foreign/duplicate callback");
        check(f.flow.phase()==ErpFederationLogin.Phase.BROWSER,"invalid external callback does not consume legitimate state");
        check(f.flow.callback(callback),"legitimate callback still works"); check(!f.flow.callback(callback),"callback consumed once");
        f.flow.cancel(); f.oldUnchanged(); check(!f.flow.callback(callback),"cancelled callback rejected");
        ErpFederationBrowser.arm(f.flow); ErpFederationBrowser.forget(f.flow); check(!ErpFederationBrowser.deliver(callback),"process-lost attempt cannot resume");
        Fixture release=new Fixture(); release.flow=release.transport.federationLogin(false,release.clock); release.flow.discover();
        check(release.queue.used.isEmpty() && release.flow.phase()==ErpFederationLogin.Phase.UNAVAILABLE,"release does not probe native registry");
        for(String mode:List.of("DEMO","PRODUCTION")) {
            Fixture denied=new Fixture(); denied.oldLogin(OLD); denied.flow=denied.transport.federationLogin(true,denied.clock); denied.queue.add(denied.health(mode));
            fails("FEDERATION_UNAVAILABLE",()->denied.flow.discover()); denied.oldUnchanged();
        }
        Fixture changed=new Fixture(); changed.oldLogin(OLD); changed.ready(); changed.queue.add(changed.health("PRODUCTION"));
        fails("FEDERATION_UNAVAILABLE",()->changed.flow.start("site")); changed.oldUnchanged();
        check(!changed.queue.paths.contains("/api/v1/auth/federation/start"),"current mode rechecked before native start");
    }
    static void successfulAndUnknown() throws Exception {
        Fixture f=new Fixture(); f.oldLogin(OLD); f.code(); Fake token=f.token(), me=new Fake(profile("new-user").toString()); f.queue.add(token,me); f.flow.redeem();
        check(f.flow.phase()==ErpFederationLogin.Phase.VERIFIED,"network proof is staged before the UI boundary"); f.oldUnchanged(); f.adopt();
        check(f.flow.phase()==ErpFederationLogin.Phase.ADOPTED,"new session atomically adopted");
        check(f.flow.adoptedProfile().getJSONObject("actor").getString("userId").equals("new-user"),"new actor returned after current proof");
        check(token.getRequestProperty("Cookie")==null && f.start.getRequestProperty("Cookie")==null,"native start/token send no previous app or browser cookie");
        check(token.getRequestProperty("X-CSRF-Token")==null && ORIGIN.equals(token.getRequestProperty("Origin")),"redemption uses own Origin without old csrf");
        check(("knaba_session="+NEW).equals(me.getRequestProperty("Cookie")),"only new response candidate is checked");
        check(token.sent().keySet().equals(Set.of("grantType","clientId","redirectUri","code","codeVerifier")),"exact token wire keys, no device grant");
        check(f.start.sent().keySet().equals(Set.of("authorityId","clientId","redirectUri","state","codeChallenge","codeChallengeMethod")),"exact start wire keys");
        check(ErpFederationLogin.challenge(token.sent().getString("codeVerifier")).equals(f.start.sent().getString("codeChallenge")),"same RAM PKCE verifier binds start and token");
        check(f.start.getRequestProperty("Idempotency-Key").matches("[a-f0-9-]{36}"),"stable start key supplied");
        check(!f.start.sent().toString().contains(token.sent().getString("codeVerifier")),"verifier absent from start/browser URL");
        Fake after=new Fake("{}"); f.queue.add(after); f.transport.dashboard(); check(("knaba_session="+NEW).equals(after.getRequestProperty("Cookie")),"current app transport uses adopted cookie");
        check(f.journal.values.isEmpty(),"federation secrets never written to command journal");
        Fixture unknown=new Fixture(); unknown.oldLogin(OLD); unknown.code(); unknown.unknown(); unknown.oldUnchanged();
        Fake candidate=new Fake(profile("new-user").toString()); unknown.queue.add(candidate); unknown.flow.recover();
        unknown.oldUnchanged(); unknown.adopt();
        check(("knaba_session="+NEW).equals(candidate.getRequestProperty("Cookie")),"lost-body recovery sends only captured new cookie");
        check(Collections.frequency(unknown.queue.paths,"/api/v1/auth/federation/token")==1,"no token retry after unknown ACK");
        check(unknown.flow.phase()==ErpFederationLogin.Phase.ADOPTED,"candidate /me without expiresAt can prove bounded recovery");
        Fixture missing=new Fixture(); missing.oldLogin(OLD); missing.code(); Fake noHeader=missing.token(); noHeader.headers.clear(); noHeader.readFailure=true; missing.queue.add(noHeader);
        fails("FEDERATION_COOKIE_INVALID",()->missing.flow.redeem()); missing.oldUnchanged();
        check(missing.flow.phase()==ErpFederationLogin.Phase.RESTART_REQUIRED,"missing fresh cookie requires explicit restart");
        check(!missing.queue.paths.contains("/api/v1/me"),"old /me never substitutes for missing redemption cookie");
    }
    static void cookieAndCandidateDenials() throws Exception {
        List<String> invalid=List.of(header(OLD),header("KF3."+"x".repeat(42)),header(NEW)+", knaba_session="+NEW,
            header(NEW).replace("Max-Age=28800","Max-Age=0"),header(NEW)+"; Domain=example.invalid",header(NEW).replace("Path=/","Path=/other"),
            header(NEW).replace("; Secure",""),header(NEW).replace("SameSite=Strict","SameSite=Lax"));
        for(String value:invalid) {
            Fixture f=new Fixture(); f.oldLogin(OLD); f.code(); Fake token=f.token().cookie(value); f.queue.add(token);
            try { f.flow.redeem(); throw new AssertionError("invalid cookie accepted"); } catch(ErpConsoleTransport.Failure expected) { check(true,"invalid cookie denied"); }
            f.oldUnchanged(); check(!f.queue.paths.contains("/api/v1/me"),"invalid cookie never used for candidate /me");
        }
        for(boolean lost:List.of(false,true)) {
            Fixture reused=new Fixture(); reused.oldLogin(NEW); reused.code(); Fake token=reused.token(); token.readFailure=lost; reused.queue.add(token);
            fails("FEDERATION_COOKIE_INVALID",()->reused.flow.redeem()); reused.oldUnchanged();
        }
        Fixture duplicate=new Fixture(); duplicate.oldLogin(OLD); duplicate.code(); Fake two=duplicate.token(); two.headers.put("set-cookie",List.of(header(NEW))); duplicate.queue.add(two);
        fails("FEDERATION_COOKIE_INVALID",()->duplicate.flow.redeem()); duplicate.oldUnchanged();
        for(int status:List.of(201,302,401,403,409,503)) {
            Fixture denied=new Fixture(); denied.oldLogin(OLD); denied.code(); Fake token=denied.token(); token.status=status; denied.queue.add(token);
            try { denied.flow.redeem(); throw new AssertionError("non200 token accepted"); } catch(ErpConsoleTransport.Failure expected) { check(expected.status==status,"exact token HTTP200 required"); }
            denied.oldUnchanged(); check(denied.flow.phase()==ErpFederationLogin.Phase.RESTART_REQUIRED,"non200 fresh header ignored");
        }
        for(int status:List.of(401,403,503)) {
            Fixture denied=new Fixture(); denied.oldLogin(OLD); denied.code(); denied.unknown(); Fake candidate=new Fake("{}"); candidate.status=status; denied.queue.add(candidate);
            try { denied.flow.recover(); throw new AssertionError("denied /me accepted"); } catch(ErpConsoleTransport.Failure expected) { check(expected.status==status,"candidate status preserved safely"); }
            denied.oldUnchanged(); check(denied.flow.phase()==(status==503?ErpFederationLogin.Phase.RECOVERABLE:ErpFederationLogin.Phase.RESTART_REQUIRED),"bounded read-only recovery classification");
        }
        Fixture wrongMode=new Fixture(); wrongMode.oldLogin(OLD); wrongMode.code(); wrongMode.unknown(); wrongMode.queue.add(new Fake(profile("new-user").put("mode","PRODUCTION").toString()));
        fails("FEDERATION_INVALID_PROFILE",()->wrongMode.flow.recover()); wrongMode.oldUnchanged();
    }
    static void expiryAndAuthority() throws Exception {
        Fixture expired=new Fixture(); expired.oldLogin(OLD); expired.code(); expired.unknown(); expired.clock.elapsed+=120_001; expired.clock.wall-=3_600_000;
        fails("FEDERATION_EXPIRED",()->expired.flow.recover()); expired.oldUnchanged(); check(!expired.queue.paths.contains("/api/v1/me"),"elapsed cap cannot be extended by wall-clock rollback");
        Fixture shortCookie=new Fixture(); shortCookie.oldLogin(OLD); shortCookie.code(); Fake shortToken=shortCookie.token().cookie(header(NEW).replace("Max-Age=28800","Max-Age=1")); shortToken.readFailure=true; shortCookie.queue.add(shortToken);
        fails("NETWORK_ERROR",()->shortCookie.flow.redeem()); shortCookie.clock.elapsed=1001; fails("FEDERATION_EXPIRED",()->shortCookie.flow.recover()); shortCookie.oldUnchanged();
        Fixture refresh=new Fixture(); refresh.oldLogin(OLD); refresh.code(); refresh.unknown(); refresh.queue.add(new Fake(profile("old-user").toString())); refresh.transport.me();
        fails("FEDERATION_SUPERSEDED",()->refresh.flow.recover()); refresh.oldUnchanged();
        Fixture changed=new Fixture(); changed.oldLogin(OLD); changed.browser(); String oldCallback=changed.callback(); changed.transport.configure("https://other.example.invalid");
        check(!changed.flow.callback(oldCallback),"origin change rejects old callback");
        Fixture newer=new Fixture(); newer.oldLogin(OLD); newer.browser(); String callback=newer.callback(); newer.transport.federationLogin(true,newer.clock);
        check(!newer.flow.callback(callback),"replacement attempt invalidates callback"); newer.oldUnchanged();
        Fixture delayed=new Fixture(); delayed.oldLogin(OLD); delayed.code(); delayed.unknown();
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1); AtomicReference<Throwable> result=new AtomicReference<>();
        Fake me=new Fake(profile("new-user").toString()); me.beforeHeaders=()->{entered.countDown();try{if(!release.await(3,TimeUnit.SECONDS))throw new AssertionError("fixture timeout");}catch(InterruptedException e){throw new AssertionError(e);}};
        delayed.queue.add(me); Thread worker=new Thread(()->{try{delayed.flow.recover();}catch(Throwable error){result.set(error);}}); worker.start(); check(entered.await(2,TimeUnit.SECONDS),"candidate read held outside owner lock");
        delayed.queue.add(new Fake(profile("old-user").toString())); delayed.transport.me(); release.countDown(); worker.join(3000);
        check(!worker.isAlive() && result.get() instanceof ErpConsoleTransport.Failure,"same-user refresh fences delayed candidate"); delayed.oldUnchanged();
        Fixture canceled=new Fixture(); canceled.oldLogin(OLD); canceled.code(); Fake token=canceled.token(); token.beforeHeaders=canceled.flow::cancel; canceled.queue.add(token);
        fails("FEDERATION_RESTART_REQUIRED",()->canceled.flow.redeem()); canceled.oldUnchanged();
        Fixture afterRead=new Fixture(); afterRead.oldLogin(OLD); afterRead.code(); afterRead.queue.add(afterRead.token(),new Fake(profile("new-user").toString())); afterRead.flow.redeem();
        afterRead.queue.add(new Fake(profile("old-user").toString())); afterRead.transport.me();
        fails("FEDERATION_SUPERSEDED",()->afterRead.flow.adopt()); afterRead.oldUnchanged();
    }
    static void recoveryStorage() throws Exception {
        Fixture f=new Fixture(); f.oldLogin(OLD); f.code(); f.unknown(); f.journal.fail=true;
        f.queue.add(new Fake(profile("new-user").toString())); f.flow.recover(); fails("RECOVERY_STORAGE_UNAVAILABLE",()->f.flow.adopt()); f.oldUnchanged();
        check(f.flow.phase()==ErpFederationLogin.Phase.RECOVERABLE,"failed local journal read leaves candidate and old account intact");
        f.journal.fail=false; f.queue.add(new Fake(profile("new-user").toString())); f.flow.recover(); f.adopt();
        check(f.flow.phase()==ErpFederationLogin.Phase.ADOPTED,"manual recovery after storage repair does not redeem token again");
        Fixture timeout=new Fixture(); timeout.oldLogin(OLD); timeout.code(); timeout.unknown(); timeout.journal.reading=()->timeout.clock.elapsed+=120_001;
        timeout.queue.add(new Fake(profile("new-user").toString())); timeout.flow.recover(); fails("FEDERATION_EXPIRED",()->timeout.flow.adopt()); timeout.oldUnchanged();
    }
    static void strictMediaPreparation() throws Exception {
        for(String problem:List.of("unavailable-unlinked","unavailable-linked","parse-linked","missing","body-mismatch","missing-upload","wrong-scope","duplicate","null-list")) {
            Fixture f=new Fixture(); f.oldLogin(OLD);
            String scope=ErpMedia.hash(new JSONArray().put(ORIGIN).put("company").put("new-user").toString().getBytes(StandardCharsets.UTF_8));
            JSONObject input=new JSONObject().put("siteId","site-1").put("stage","AFTER").put("visibility","INTERNAL").put("caption","").put("retentionPurpose","Synthetic task evidence");
            ErpMedia.Record record=ErpMedia.Record.create(problem.equals("wrong-scope")?"f".repeat(64):scope,"a".repeat(64),input,
                new ErpMedia.FileData("%PDF-1.7 synthetic".getBytes(StandardCharsets.UTF_8),"evidence.pdf"),false);
            if(!problem.equals("missing-upload"))record=record.uploaded(new JSONObject().put("uploadId","upload-1")).registering();
            JSONObject body=input.put("uploadId","upload-1"); if(problem.equals("body-mismatch"))body.put("siteId","different-site");
            if(!problem.equals("unavailable-unlinked"))f.journal.values.put(scope,new JSONObject().put("version",1).put("scope",scope).put("name","media.register").put("nativeMedia",true)
                .put("body",new JSONObject().put("input",body).put("idempotency_key",record.registerKey())).toString());
            if(!problem.equals("missing"))f.media.records.add(record);
            if(problem.equals("duplicate"))f.media.records.add(record);
            if(problem.equals("null-list"))f.media.records=null;
            f.media.unavailable=problem.startsWith("unavailable");
            f.media.malformed=problem.equals("parse-linked");
            Map<String,String> saved=new HashMap<>(f.journal.values);
            List<String> mediaSaved=f.media.records==null?null:f.media.records.stream().map(value->{try{return value.json().toString();}catch(Exception ex){throw new AssertionError(ex);}}).toList();
            f.code(); f.queue.add(f.token(),new Fake(profile("new-user").toString())); f.flow.redeem();
            int effects=f.queue.used.size();
            fails(problem.startsWith("unavailable")?"RECOVERY_STORAGE_UNAVAILABLE":"RECOVERY_STORAGE_INVALID",()->f.flow.adopt());
            check(f.queue.used.size()==effects,"failed local media preparation sends no request: "+problem);
            check(saved.equals(f.journal.values),"command journal bytes retained after failed media preparation: "+problem);
            if(mediaSaved!=null)check(mediaSaved.equals(f.media.records.stream().map(value->{try{return value.json().toString();}catch(Exception ex){throw new AssertionError(ex);}}).toList()),"media metadata retained: "+problem);
            f.oldUnchanged();
        }
        for(boolean historical:List.of(false,true)) {
            Fixture f=new Fixture(); f.oldLogin(OLD);
            String scope=ErpMedia.hash(new JSONArray().put(ORIGIN).put("company").put("old-user").toString().getBytes(StandardCharsets.UTF_8));
            JSONObject observed=actor("old-user"); if(historical)observed.put("siteIds",new JSONArray().put("former-site"));
            String authority=ErpMedia.hash(ErpMedia.canonical(observed).getBytes(StandardCharsets.UTF_8));
            ErpMedia.Record record=ErpMedia.Record.create(scope,authority,new JSONObject().put("siteId","site-1").put("stage","AFTER").put("visibility","INTERNAL").put("caption","").put("retentionPurpose","Synthetic task evidence"),
                new ErpMedia.FileData("%PDF-1.7 synthetic".getBytes(StandardCharsets.UTF_8),"evidence.pdf"),false).uploaded(new JSONObject().put("uploadId","upload-1")).registering();
            f.media.records.add(record);
            f.journal.values.put(scope,new JSONObject().put("version",1).put("scope",scope).put("name","media.register").put("nativeMedia",true)
                .put("body",new JSONObject().put("input",record.registerInput()).put("idempotency_key",record.registerKey())).toString());
            Map<String,String> before=new HashMap<>(f.journal.values); String mediaBefore=record.json().toString();
            f.code(); f.queue.add(new Fake(profile("old-user").put("expiresAt",f.clock.expires(3_600_000)).toString()).cookie(header(NEW)),new Fake(profile("old-user").toString()));
            f.flow.redeem(); int effects=f.queue.used.size(); f.adopt();
            check(f.transport.isSignedIn()&&f.transport.hasNativeMediaPending()&&f.transport.pendingCommand()==null,"valid unknown media stays typed read-only recovery, including historical authority");
            check(before.equals(f.journal.values)&&mediaBefore.equals(f.media.records.get(0).json().toString()),"valid unknown uploadId/key/body preserved during adoption");
            check(f.queue.used.size()==effects,"valid media recovery never automatically resubmits during adoption");
            if(historical)fails("MEDIA_RECOVERY_INVALID",()->f.transport.mediaRecords(f.transport.mediaTicket()));
            else check(f.transport.mediaRecords(f.transport.mediaTicket()).get(0).registerKey().equals(record.registerKey()),"same-authority unknown registration retains exact typed recovery key");
        }
    }
    static void knownTokenIdentityMustMatchCurrentCandidate() throws Exception {
        Fixture mismatch=new Fixture(); mismatch.oldLogin(OLD); mismatch.code();
        mismatch.queue.add(mismatch.token(),new Fake(profile("different-user").toString()));
        fails("FEDERATION_INVALID_PROFILE",()->mismatch.flow.redeem()); mismatch.oldUnchanged();
        check(mismatch.flow.phase()==ErpFederationLogin.Phase.RESTART_REQUIRED,"complete token and candidate /me cannot mix identities");
    }
    static void accountJournalAndTerminalMemory() throws Exception {
        for(boolean sameActor:List.of(false,true)) {
            Fixture f=new Fixture(); f.oldLogin(OLD);
            Fake write=new Fake("{}"); write.readFailure=true; f.queue.add(write);
            fails("NETWORK_ERROR",()->f.transport.command("task.update",new JSONObject().put("id","task-record"),7,"stable_original_key"));
            Map<String,String> originals=new HashMap<>(f.journal.values);
            check(f.transport.hasPendingCommand() && originals.size()==1,"old uncertain mutation has durable scoped recovery");
            f.code(); String user=sameActor?"old-user":"new-user";
            Fake token=new Fake(profile(user).put("expiresAt",f.clock.expires(3_600_000)).toString()).cookie(header(NEW));
            f.queue.add(token,new Fake(profile(user).toString())); f.flow.redeem();
            check(originals.equals(f.journal.values),"VERIFIED network stage has not changed the old journal"); f.adopt();
            check(originals.equals(f.journal.values),"account switch preserves exact prior encrypted-envelope content");
            if(sameActor) {
                JSONObject recovered=f.transport.pendingCommand();
                check(recovered.getString("idempotency_key").equals("stable_original_key") && recovered.getInt("expected_version")==7,"same actor journal key/version restored under adopted session");
            } else check(!f.transport.hasPendingCommand() && f.transport.pendingCommand()==null,"different actor never receives old account journal");
            java.lang.reflect.Field field=ErpFederationLogin.class.getDeclaredField("binding"); field.setAccessible(true);
            ErpConsoleTransport.FederationBinding binding=(ErpConsoleTransport.FederationBinding)field.get(f.flow);
            check(binding.cookie.isEmpty() && binding.csrf.isEmpty() && binding.authority.isEmpty(),"terminal attempt releases captured old credentials and private authority");
            f.flow.cancel();
            java.lang.reflect.Field active=ErpConsoleTransport.class.getDeclaredField("federationAttempt"); active.setAccessible(true);
            check(active.get(f.transport)==null,"closed UI attempt is not retained by transport");
        }
        Fixture browser=new Fixture(); browser.oldLogin(OLD); browser.browser(); browser.flow.browserUnavailable();
        check(browser.flow.phase()==ErpFederationLogin.Phase.RESTART_REQUIRED,"missing system handler never falls back to WebView"); browser.oldUnchanged();
    }
    static void oldInstanceMustBeRetired() throws Exception {
        Fixture f=new Fixture(); f.oldLogin(OLD); f.code(); f.queue.add(f.token(),new Fake(profile("new-user").toString()));
        f.flow.redeem(); ErpFederationLogin.Adoption replacement=f.flow.adopt();
        check(!f.transport.isSignedIn(),"old transport references must not gain the new account cookie");
        check(replacement.transport!=f.transport && replacement.transport.isSignedIn(),"replacement is a separate authenticated instance");
        int before=f.queue.used.size();
        fails("SESSION_RETIRED",()->f.transport.login("old@example.invalid","synthetic",null));
        fails("NEEDS_REAUTH",()->f.transport.command("task.update",new JSONObject().put("id","task"),1,"old_callback_key"));
        f.transport.clear(); fails("SESSION_RETIRED",()->f.transport.login("old@example.invalid","synthetic",null));
        try { f.transport.configure(ORIGIN); throw new AssertionError("retired instance reconfigured"); }
        catch(IllegalStateException expected) { check("SESSION_RETIRED".equals(expected.getMessage()),"retirement cannot be undone by reconfiguration"); }
        check(f.queue.used.size()==before,"old callback cannot create any new HTTP effect or login");
    }
    static void exactDiscoverySchema() throws Exception {
        JSONObject underscore=config(); underscore.getJSONArray("authorities").getJSONObject(0).put("authorityId","_site");
        underscore.getJSONArray("clients").put(new JSONObject().put("clientId","_web").put("kind","WEB").put("platform","WEB").put("label","Website"));
        check(ErpFederationLogin.parseConfiguration(underscore,ORIGIN,true).authority("_site")!=null,"canonical server identifiers allow leading underscore");
        JSONObject port=config(); port.getJSONArray("authorities").getJSONObject(0).put("siteOrigin","https://site.example.invalid:8443");
        check(ErpFederationLogin.parseConfiguration(port,ORIGIN,true).authority("site").siteOrigin.endsWith(":8443"),"source authority metadata preserves configured canonical HTTPS port");
        for(String address:List.of("https://user:synthetic@site.example.invalid","https://site.example.invalid/","https://site.example.invalid/private",
                "https://site.example.invalid?query=1","https://site.example.invalid#fragment","https://site.example.invalid:70000","http://site.example.invalid")) {
            JSONObject invalid=config(); invalid.getJSONArray("authorities").getJSONObject(0).put("siteOrigin",address);
            fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(invalid,ORIGIN,true));
        }
        for(String field:List.of("authorityId","label","siteOrigin")) {
            JSONObject bad=config(); bad.getJSONArray("authorities").getJSONObject(0).put(field,17);
            fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(bad,ORIGIN,true));
        }
        for(String field:List.of("clientId","label","kind","platform","redirectUri")) {
            JSONObject bad=config(); bad.getJSONArray("clients").getJSONObject(0).put(field,17);
            fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(bad,ORIGIN,true));
        }
        for(String field:List.of("clientId","label")) {
            JSONObject bad=config(); bad.getJSONArray("clients").getJSONObject(0).put(field,field.equals("clientId")?"has.dot":"x".repeat(81));
            fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(bad,ORIGIN,true));
        }
        JSONObject wrongHostname=config(); wrongHostname.getJSONArray("authorities").getJSONObject(0).put("label","other.example.invalid");
        fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(wrongHostname,ORIGIN,true));
        JSONObject limits=config();
        for(int i=1;i<8;i++) limits.getJSONArray("authorities").put(new JSONObject().put("authorityId","_site"+i).put("label","site.example.invalid").put("siteOrigin","https://site.example.invalid"));
        for(int i=1;i<16;i++) limits.getJSONArray("clients").put(new JSONObject().put("clientId","_web"+i).put("kind","WEB").put("platform","WEB").put("label","Website"));
        check(ErpFederationLogin.parseConfiguration(limits,ORIGIN,true).authorities.size()==8,"exact8 authorities/16 clients supported");
        JSONObject tooManyClients=new JSONObject(limits.toString()); tooManyClients.getJSONArray("clients").put(new JSONObject().put("clientId","extra").put("kind","WEB").put("platform","WEB").put("label","Website"));
        fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(tooManyClients,ORIGIN,true));
        limits.getJSONArray("authorities").put(new JSONObject().put("authorityId","extra").put("label","site.example.invalid").put("siteOrigin","https://site.example.invalid"));
        fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(limits,ORIGIN,true));
        JSONObject duplicate=config(); duplicate.getJSONArray("authorities").put(duplicate.getJSONArray("authorities").getJSONObject(0));
        fails("FEDERATION_INVALID_CONFIG",()->ErpFederationLogin.parseConfiguration(duplicate,ORIGIN,true));
    }
    public static void main(String[] args) throws Exception {
        strictMediaPreparation(); exactDiscoverySchema(); oldInstanceMustBeRetired(); knownTokenIdentityMustMatchCurrentCandidate(); protocol(); successfulAndUnknown(); cookieAndCandidateDenials(); expiryAndAuthority(); recoveryStorage(); accountJournalAndTerminalMemory();
        System.out.println("PASS federation protocol/state/transport: "+assertions+" assertions; explicit connection doubles, no device/browser claim");
    }
}
