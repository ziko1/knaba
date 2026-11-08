package de.knaba.mobile;

import android.content.ComponentName;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.os.Looper;
import android.os.Parcel;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.util.ReflectionHelpers;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** Android framework simulation. Browser/provider/device behaviour still needs an exact artifact gate. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,qualifiers="w411dp-h891dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
public class ErpFederationActivityTest {
    private static final String ORIGIN="https://erp.example.invalid", OLD="o".repeat(43), NEXT="KF3."+"n".repeat(43), CSRF="c".repeat(43);
    private ActivityController<ErpConsoleActivity> controller;
    private ErpConsoleActivity activity;
    private ErpFederationLogin attempt;
    private ErpConsoleTransport transport;
    private final Router router=new Router();
    private static JSONObject profile(String id) throws Exception {
        return new JSONObject().put("mode","TEST").put("csrfToken",CSRF).put("actor",new JSONObject().put("userId",id).put("companyId","company")
            .put("roles",new JSONArray().put("OWNER")).put("permissions",new JSONArray().put("*"))
            .put("siteIds",new JSONArray()).put("customerIds",new JSONArray()).put("warehouseIds",new JSONArray()).put("mfaVerified",true));
    }
    private static JSONObject configuration() throws Exception {
        return new JSONObject().put("enabled",true).put("authorizationIssuer",ORIGIN+"/auth/federation")
            .put("clients",new JSONArray().put(new JSONObject().put("clientId",ErpFederationLogin.CLIENT_ID).put("kind","NATIVE")
                .put("platform","ANDROID").put("label","KNABA Android Test").put("redirectUri",ErpFederationLogin.REDIRECT)))
            .put("authorities",new JSONArray().put(new JSONObject().put("authorityId","site").put("label","site.example.invalid").put("siteOrigin","https://site.example.invalid")));
    }
    private static String cookie(String value) { return "knaba_session="+value+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800"; }
    private static final class Router implements ErpConsoleTransport.ConnectionFactory {
        final List<Connection> requests=new CopyOnWriteArrayList<>(); volatile JSONObject start;
        volatile boolean lostTokenBody; volatile int candidateStatus=200; volatile int tokenCalls,candidateCalls;
        public HttpURLConnection open(URL url) { Connection request=new Connection(url,this); requests.add(request); return request; }
    }
    private static final class Connection extends HttpURLConnection {
        final Router router; final ByteArrayOutputStream body=new ByteArrayOutputStream();
        Connection(URL url,Router router) { super(url); this.router=router; }
        public void connect() { } public void disconnect() { } public boolean usingProxy() { return false; }
        public OutputStream getOutputStream() { return body; }
        public int getResponseCode() {
            if(url.getPath().endsWith("/federation/token")) router.tokenCalls++;
            if(url.getPath().equals("/api/v1/me") && ("knaba_session="+NEXT).equals(getRequestProperty("Cookie"))) { router.candidateCalls++; return router.candidateStatus; }
            return 200;
        }
        public Map<String,List<String>> getHeaderFields() {
            if(url.getPath().endsWith("/federation/token")) return Map.of("Set-Cookie",List.of(cookie(NEXT)));
            if(url.getPath().endsWith("/auth/login")) return Map.of("Set-Cookie",List.of(cookie(OLD)));
            return Map.of();
        }
        public InputStream getInputStream() throws IOException {
            try {
                JSONObject result;
                switch(url.getPath()) {
                    case "/api/v1/health": result=new JSONObject().put("ok",true).put("application","KNABA DE").put("apiVersion",1).put("mode","TEST"); break;
                    case "/api/v1/auth/federation/config": result=configuration(); break;
                    case "/api/v1/auth/federation/start":
                        router.start=new JSONObject(body.toString("UTF-8"));
                        result=new JSONObject().put("requestId","12345678-1234-4234-8234-123456789abc")
                            .put("authorizationUrl",ORIGIN+"/auth/federation/authorize?request_id=12345678-1234-4234-8234-123456789abc")
                            .put("expiresAt",Instant.now().plusSeconds(300).toString()); break;
                    case "/api/v1/auth/federation/token":
                        if(router.lostTokenBody) throw new IOException("SYNTHETIC_LOST_BODY");
                        result=profile("new-user").put("expiresAt",Instant.now().plusSeconds(3600).toString()); break;
                    case "/api/v1/auth/login": result=profile("old-user"); break;
                    case "/api/v1/me": result=profile(("knaba_session="+NEXT).equals(getRequestProperty("Cookie"))?"new-user":"old-user"); break;
                    case "/api/v1/dashboard": result=new JSONObject().put("activeSites",0); break;
                    default: throw new AssertionError("Unexpected fixture path "+url.getPath());
                }
                return new ByteArrayInputStream(result.toString().getBytes(StandardCharsets.UTF_8));
            } catch(IOException ex) { throw ex; } catch(Exception ex) { throw new IOException(ex); }
        }
    }
    private void signedIn() throws Exception {
        transport=new ErpConsoleTransport(router); transport.configure(ORIGIN); transport.login("old@example.invalid","synthetic",null);
    }
    private void browserAttempt() throws Exception {
        signedIn(); attempt=transport.federationLogin(true); attempt.discover(); attempt.start("site"); ErpFederationBrowser.arm(attempt);
    }
    private String callback() throws Exception {
        return ErpFederationLogin.REDIRECT+"?code=K3C."+"k".repeat(43)+"&state="+router.start.getString("state")+"&iss="+URLEncoder.encode(ORIGIN+"/auth/federation",StandardCharsets.UTF_8);
    }
    private Intent invokeCallback(Intent input) {
        ActivityController<FederationCallbackActivity> callback=Robolectric.buildActivity(FederationCallbackActivity.class,input).create();
        FederationCallbackActivity target=callback.get();
        assertTrue(target.isFinishing()); assertNull(target.getIntent().getData()); assertNull(target.getIntent().getExtras());
        Intent output=Shadows.shadowOf(target).getNextStartedActivity(); callback.destroy(); return output;
    }
    private Intent view(String uri) { return new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(uri)).addCategory(Intent.CATEGORY_BROWSABLE); }
    private void await(BooleanSupplier condition) throws Exception {
        long deadline=System.nanoTime()+Duration.ofSeconds(5).toNanos();
        while(System.nanoTime()<deadline) {
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(50));
            if(condition.getAsBoolean()) { Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(250)); return; } Thread.sleep(10);
        }
        fail("Bounded asynchronous fixture did not settle");
    }
    private List<View> views(View item) { List<View> result=new ArrayList<>(); result.add(item); if(item instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++)result.addAll(views(group.getChildAt(i))); return result; }
    private Button button(int id) { return views(activity.findViewById(android.R.id.content)).stream().filter(v->v instanceof Button b && b.getText().toString().equals(activity.getString(id))).map(v->(Button)v).findFirst().orElseThrow(); }
    private void openUi() throws Exception {
        signedIn(); controller=Robolectric.buildActivity(ErpConsoleActivity.class).create(); activity=controller.get();
        ReflectionHelpers.setField(activity,"api",transport); ReflectionHelpers.setField(activity,"actor",profile("old-user").getJSONObject("actor"));
        ReflectionHelpers.callInstanceMethod(activity,"openFederation",ReflectionHelpers.ClassParameter.from(String.class,ORIGIN));
        attempt=ReflectionHelpers.getField(activity,"federation"); controller.start().resume().visible();
        await(()->attempt.phase()==ErpFederationLogin.Phase.READY);
    }
    private Intent launchBrowser() throws Exception {
        openUi(); Button start=views(activity.findViewById(android.R.id.content)).stream().filter(v->v instanceof Button b&&b.getText().toString().contains("site.example.invalid")).map(v->(Button)v).findFirst().orElseThrow();
        start.performClick(); await(()->attempt.phase()==ErpFederationLogin.Phase.BROWSER);
        Intent browser=Shadows.shadowOf(activity).getNextStartedActivity(); assertNotNull(browser); return browser;
    }
    @After public void finish() {
        if(attempt!=null) { attempt.cancel(); ErpFederationBrowser.forget(attempt); }
        if(controller!=null) controller.pause().stop().destroy();
    }
    @Test public void debugCallbackIsExportedOnlyAsAnEphemeralBrowserReceiver() throws Exception {
        assertTrue(BuildConfig.DEBUG); assertEquals("de.knaba.mobile.test",BuildConfig.APPLICATION_ID);
        ActivityInfo info=RuntimeEnvironment.getApplication().getPackageManager().getActivityInfo(new ComponentName(RuntimeEnvironment.getApplication(),FederationCallbackActivity.class),0);
        assertTrue(info.exported); assertTrue((info.flags&ActivityInfo.FLAG_NO_HISTORY)!=0);
        assertNull(info.permission); // Browser callbacks are validated by exact state/issuer/path; no family-app signature guess.
    }
    @Test public void coldAndMalformedCallbacksCannotForwardCallerIntents() throws Exception {
        assertNull(invokeCallback(view(ErpFederationLogin.REDIRECT+"?code=ignored")));
        browserAttempt(); String uri=callback();
        assertNull(invokeCallback(new Intent(Intent.ACTION_SEND,android.net.Uri.parse(uri))));
        assertNull(invokeCallback(view(uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
        assertNull(invokeCallback(view(uri+"&state=duplicate")));
        Intent selector=view(uri); selector.setSelector(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://other.invalid")));
        assertNull(invokeCallback(selector)); assertEquals(ErpFederationLogin.Phase.BROWSER,attempt.phase());
        Intent output=invokeCallback(view(uri).putExtra(Intent.EXTRA_INTENT,new Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://other.invalid"))));
        assertNotNull(output); assertEquals(ErpConsoleActivity.class.getName(),output.getComponent().getClassName());
        assertNull(output.getData()); assertNull(output.getExtras()); assertNull(output.getSelector());
        assertEquals(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP,output.getFlags());
        assertEquals(ErpFederationLogin.Phase.CALLBACK,attempt.phase()); assertNull(invokeCallback(view(uri))); assertEquals(0,router.tokenCalls);
    }
    @Test public void systemBrowserWaitSurvivesStopAndRotationWithoutReopeningOrSavingSecrets() throws Exception {
        Intent browser=launchBrowser(); assertEquals(Intent.ACTION_VIEW,browser.getAction()); assertTrue(browser.hasCategory(Intent.CATEGORY_BROWSABLE));
        assertNull(browser.getExtras()); assertNull(browser.getPackage()); assertNull(browser.getSelector());
        assertEquals(ORIGIN+"/auth/federation/authorize?request_id=12345678-1234-4234-8234-123456789abc",browser.getDataString());
        String verifier=ReflectionHelpers.getField(attempt,"verifier"), state=router.start.getString("state");
        Bundle saved=new Bundle(); controller.saveInstanceState(saved); Parcel parcel=Parcel.obtain();
        try {
            parcel.writeBundle(saved); byte[] bytes=parcel.marshall();
            for(String text:List.of(new String(bytes,StandardCharsets.UTF_8),new String(bytes,StandardCharsets.UTF_16LE))) {
                assertFalse(text.contains(verifier)); assertFalse(text.contains(state)); assertFalse(text.contains(OLD));
            }
        } finally { parcel.recycle(); }
        controller.pause().stop(); assertEquals(ErpFederationLogin.Phase.BROWSER,attempt.phase());
        controller.start().resume(); Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300)); assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
        controller.recreate(); activity=controller.get(); assertSame(attempt,ReflectionHelpers.getField(activity,"federation"));
        assertSame(transport,ReflectionHelpers.getField(activity,"api")); assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
        button(R.string.erp_federation_cancel).performClick(); assertTrue(transport.isSignedIn());
        assertEquals("old-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
        assertFalse(ErpFederationBrowser.deliver(callback())); assertEquals(0,router.tokenCalls);
    }
    @Test public void unknownTokenUiChecksOnlyNewCandidateAndKeepsOldAccountOn401() throws Exception {
        router.lostTokenBody=true; launchBrowser(); assertNotNull(invokeCallback(view(callback())));
        activity.onNewIntent(new Intent()); await(()->attempt.phase()==ErpFederationLogin.Phase.RECOVERABLE);
        assertEquals(1,router.tokenCalls); assertEquals(0,router.candidateCalls); assertTrue(transport.isSignedIn());
        assertEquals("old-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
        router.candidateStatus=401; button(R.string.erp_federation_check).performClick(); await(()->attempt.phase()==ErpFederationLogin.Phase.RESTART_REQUIRED);
        assertEquals(1,router.tokenCalls); assertEquals(1,router.candidateCalls); assertTrue(transport.isSignedIn());
        button(R.string.erp_federation_cancel).performClick(); assertEquals("old-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
    }
    @Test public void successfulCallbackAdoptsActorTogetherWithNewCookieAndLeavesTimeToolsSeparate() throws Exception {
        launchBrowser(); Button oldCancel=button(R.string.erp_federation_cancel);
        assertNotNull(invokeCallback(view(callback()))); activity.onNewIntent(new Intent());
        await(()-> { JSONObject actor=ReflectionHelpers.getField(activity,"actor"); return actor!=null&&"new-user".equals(actor.optString("userId")); });
        ErpConsoleTransport replacement=ReflectionHelpers.getField(activity,"api");
        assertNotSame(transport,replacement); assertFalse(transport.isSignedIn()); assertTrue(replacement.isSignedIn());
        oldCancel.performClick();
        assertSame("A stale screen action cannot replace the newly adopted account",replacement,ReflectionHelpers.getField(activity,"api"));
        assertEquals("new-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
        assertEquals(1,router.tokenCalls); assertTrue(router.candidateCalls>=1);
        for(Connection request:router.requests) if(request.getURL().getPath().endsWith("/federation/token") || request.getURL().getPath().endsWith("/federation/start")) {
            assertNull(request.getRequestProperty("Cookie")); assertNull(request.getRequestProperty("Authorization")); assertNull(request.getRequestProperty("X-CSRF-Token"));
        }
        assertNotNull(button(R.string.erp_time_tools)); assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
        await(()->!((Boolean)ReflectionHelpers.getField(activity,"busy")));
        java.util.concurrent.atomic.AtomicInteger staleOperations=new java.util.concurrent.atomic.AtomicInteger();
        java.lang.reflect.Method run=ErpConsoleActivity.class.getDeclaredMethod("run",kotlin.jvm.functions.Function0.class,boolean.class,boolean.class,
            kotlin.jvm.functions.Function1.class,ErpConsoleTransport.class,kotlin.jvm.functions.Function1.class); run.setAccessible(true);
        kotlin.jvm.functions.Function0<JSONObject> stale=()->{ staleOperations.incrementAndGet(); return new JSONObject(); };
        kotlin.jvm.functions.Function1<JSONObject,kotlin.Unit> success=value->{ fail("Old success callback reached replacement UI"); return kotlin.Unit.INSTANCE; };
        kotlin.jvm.functions.Function1<Exception,kotlin.Unit> error=value->{ fail("Old error callback reached replacement UI"); return kotlin.Unit.INSTANCE; };
        run.invoke(activity,stale,true,false,error,transport,success);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300));
        assertEquals(0,staleOperations.get()); assertSame(replacement,ReflectionHelpers.getField(activity,"api")); assertTrue(replacement.isSignedIn());
    }
    @Test public void cancellationAndSameUserRefreshRejectOldCallbackWithoutClearingSession() throws Exception {
        browserAttempt(); String uri=callback(); transport.me(); assertNull(invokeCallback(view(uri))); assertTrue(transport.isSignedIn());
        attempt=transport.federationLogin(true); attempt.discover(); attempt.start("site"); ErpFederationBrowser.arm(attempt); uri=callback();
        attempt.cancel(); assertNull(invokeCallback(view(uri))); assertTrue(transport.isSignedIn());
    }
    @Test public void delayedLeaveConfirmationCannotActAfterFederationAdoption() throws Exception {
        launchBrowser();
        ReflectionHelpers.setField(activity,"uncertain",true);
        ReflectionHelpers.callInstanceMethod(activity,"goBack");
        AlertDialog stale=org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog();
        assertNotNull(stale); assertTrue(stale.isShowing());
        assertNotNull(invokeCallback(view(callback()))); activity.onNewIntent(new Intent());
        await(()->{JSONObject current=ReflectionHelpers.getField(activity,"actor");return current!=null&&"new-user".equals(current.optString("userId"));});
        ErpConsoleTransport replacement=ReflectionHelpers.getField(activity,"api");
        long screen=ReflectionHelpers.getField(activity,"screen");
        stale.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        assertSame(replacement,ReflectionHelpers.getField(activity,"api"));
        assertEquals("A confirmation from the old account must not navigate the new account",screen,(long)ReflectionHelpers.<Long>getField(activity,"screen"));
        assertTrue(replacement.isSignedIn()); assertEquals("new-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
    }
    @Test public void pausedMainCannotSwitchAccountBeforeLocalAdoptionOrAfterCancel() throws Exception {
        launchBrowser(); long oldRevision=transport.sessionRevision();
        assertNotNull(invokeCallback(view(callback()))); activity.onNewIntent(new Intent());
        // The worker can finish both HTTP replies, but the main event loop deliberately does not drain.
        long until=System.nanoTime()+Duration.ofSeconds(3).toNanos();
        while(System.nanoTime()<until && !Set.of("ADOPTED","VERIFIED").contains(attempt.phase().name())) Thread.sleep(10);
        assertTrue(Set.of("ADOPTED","VERIFIED").contains(attempt.phase().name()));
        assertEquals("Network completion alone cannot switch the account behind the visible Cancel action",oldRevision,transport.sessionRevision());
        assertEquals(OLD,ReflectionHelpers.getField(transport,"cookie"));
        button(R.string.erp_federation_cancel).performClick();
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300));
        assertEquals(OLD,ReflectionHelpers.getField(transport,"cookie"));
        assertEquals("old-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
        assertEquals(1,router.tokenCalls);
    }
    @Test public void verifiedCandidateStaysPrivateInBackgroundUntilForegroundCommit() throws Exception {
        launchBrowser(); long oldRevision=transport.sessionRevision();
        assertNotNull(invokeCallback(view(callback()))); activity.onNewIntent(new Intent()); controller.pause().stop();
        long until=System.nanoTime()+Duration.ofSeconds(3).toNanos();
        while(System.nanoTime()<until && attempt.phase()!=ErpFederationLogin.Phase.VERIFIED) Thread.sleep(10);
        assertEquals(ErpFederationLogin.Phase.VERIFIED,attempt.phase());
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300));
        assertSame(transport,ReflectionHelpers.getField(activity,"api")); assertEquals(oldRevision,transport.sessionRevision());
        assertEquals(OLD,ReflectionHelpers.getField(transport,"cookie"));
        assertEquals("old-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
        controller.start().resume();
        await(()->!transport.isSignedIn());
        ErpConsoleTransport replacement=ReflectionHelpers.getField(activity,"api");
        assertNotSame(transport,replacement); assertTrue(replacement.isSignedIn());
        assertEquals("new-user",((JSONObject)ReflectionHelpers.getField(activity,"actor")).getString("userId"));
        assertEquals(1,router.tokenCalls);
    }
}
