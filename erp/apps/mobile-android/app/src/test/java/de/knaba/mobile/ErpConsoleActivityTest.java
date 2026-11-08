package de.knaba.mobile;

import android.app.AlertDialog;
import android.content.res.XmlResourceParser;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Build;
import android.os.Looper;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.shadows.ShadowApplication;
import org.robolectric.util.ReflectionHelpers;
import org.xmlpull.v1.XmlPullParser;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

import static org.junit.Assert.*;

/** Android framework simulation + explicit in-memory demo; not a device or live ERP test. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "w411dp-h891dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@LooperMode(LooperMode.Mode.PAUSED)
public class ErpConsoleActivityTest {
    private ActivityController<ErpConsoleActivity> controller;
    private ErpConsoleActivity activity;

    @Before public void prepare() throws Exception {
        RuntimeEnvironment.getApplication().getSharedPreferences("knaba-language-v1", 0).edit().clear().commit();
        if (Build.VERSION.SDK_INT >= 34) {
            // Robolectric's legacy package parser drops the new opt-in flag. Verify the
            // actual packaged manifest first, then configure its supported framework model.
            XmlResourceParser manifest = RuntimeEnvironment.getApplication().getAssets().openXmlResourceParser("AndroidManifest.xml");
            String manifestPackage = null; boolean optedIn = false;
            try {
                for (int event = manifest.getEventType(); event != XmlPullParser.END_DOCUMENT; event = manifest.next()) {
                    if (event != XmlPullParser.START_TAG) continue;
                    if (manifest.getName().equals("manifest")) manifestPackage = manifest.getAttributeValue(null, "package");
                    if (manifest.getName().equals("application")) optedIn = manifest.getAttributeBooleanValue("http://schemas.android.com/apk/res/android", "enableOnBackInvokedCallback", false);
                }
            } finally { manifest.close(); }
            assertEquals("Back configuration must come from the tested APK", BuildConfig.APPLICATION_ID, manifestPackage);
            assertTrue("The packaged app must opt into platform Back callbacks", optedIn);
            ShadowApplication.setEnableOnBackInvokedCallback(true);
        }
    }
    @After public void finish() {
        if (controller != null) controller.pause().stop().destroy();
        RuntimeEnvironment.setFontScale(1f);
    }
    private void launch() {
        launch(new ErpServerDiscovery() {
            @Override String discover() { return "https://fixture.invalid"; }
        });
    }
    private void launch(ErpServerDiscovery discovery) {
        controller = Robolectric.buildActivity(ErpConsoleActivity.class);
        activity = controller.get();
        ReflectionHelpers.setField(activity, "discovery", discovery);
        controller.setup();
        Shadows.shadowOf(Looper.getMainLooper()).idle();
    }
    private ViewGroup root() { return activity.findViewById(android.R.id.content); }
    private List<View> views(View root) {
        List<View> result = new ArrayList<>(); result.add(root);
        if (root instanceof ViewGroup group) for (int i = 0; i < group.getChildCount(); i++) result.addAll(views(group.getChildAt(i)));
        return result;
    }
    private String text() {
        StringBuilder result = new StringBuilder();
        for (View view : views(root())) if (view instanceof TextView t && view.getVisibility() == View.VISIBLE) result.append(t.getText()).append('\n');
        return result.toString();
    }
    private Button button(String name) {
        return views(root()).stream().filter(v -> v instanceof Button b && b.getText().toString().startsWith(name)).map(v -> (Button) v).findFirst().orElseThrow(() -> new AssertionError("Missing button " + name + " in " + text()));
    }
    private Button button(int resource) { return button(activity.getString(resource)); }
    private boolean hasButton(int resource) {
        String title = activity.getString(resource);
        return views(root()).stream().anyMatch(v -> v instanceof Button b && b.getText().toString().startsWith(title));
    }
    private EditText edit(String hint) {
        return views(root()).stream().filter(v -> v instanceof EditText e && e.getHint().toString().equals(hint)).map(v -> (EditText) v).findFirst().orElseThrow(() -> new AssertionError("Missing input " + hint));
    }
    private EditText edit(int resource) { return edit(activity.getString(resource)); }
    private void click(int resource) { assertTrue(button(resource).isEnabled()); button(resource).performClick(); }
    private void click(String title) { assertTrue(button(title).isEnabled()); button(title).performClick(); }
    private void pressBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            // Exercise the callback registered with Android, without calling our legacy override.
            // Robolectric's gesture helper only supports animation callbacks, not plain callbacks.
            Object callback = ReflectionHelpers.callInstanceMethod(platformBackDispatcher(), "getTopCallback");
            assertNotNull("Android must have a registered Back callback", callback);
            ReflectionHelpers.callInstanceMethod(callback, "onBackInvoked");
        } else {
            activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK));
            activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK));
        }
    }
    private Object platformBackDispatcher() {
        // Activity exposes a ProxyOnBackInvokedDispatcher on SDK 35. The attached View
        // resolves the actual WindowOnBackInvokedDispatcher reached by system Back events.
        Object dispatcher = root().findOnBackInvokedDispatcher();
        assertNotNull("The attached window must expose its Back dispatcher", dispatcher);
        return dispatcher;
    }
    private void await(BooleanSupplier ready) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(6);
        while (System.nanoTime() < deadline) {
            Shadows.shadowOf(Looper.getMainLooper()).idle();
            if (ready.getAsBoolean()) return;
            Thread.sleep(5);
        }
        fail("UI did not reach expected state: " + text());
    }
    private void settled() throws Exception { await(() -> !busy()); }
    private boolean busy() {
        try { Field field = ErpConsoleActivity.class.getDeclaredField("busy"); field.setAccessible(true); return field.getBoolean(activity); }
        catch (Exception e) { throw new AssertionError(e); }
    }
    private void inject(ErpConsoleTransport transport) throws Exception {
        Field field = ErpConsoleActivity.class.getDeclaredField("api"); field.setAccessible(true); field.set(activity, transport);
    }
    private void demo() throws Exception {
        click(R.string.erp_try_demo);
        await(() -> hasButton(R.string.erp_exit_demo) && !busy());
        assertTrue(text().contains(activity.getString(R.string.erp_demo_banner)));
        assertFalse("Demo must not offer employee tracking", hasButton(R.string.erp_time_tools));
    }
    private void openTasks() throws Exception { click(R.string.erp_tasks); settled(); }
    private void openChat() throws Exception {
        click(R.string.erp_messages); settled(); click("DEMO · Team Atrium"); settled();
    }

    private void advance(long seconds) { Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(seconds)); }

    @Test public void serverConfigurationIsAutomaticAndNoAddressInputIsExposed() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport);
        assertEquals("https://fixture.invalid",transport.configuredOrigin);
        assertEquals(1,transport.loginCalls.get());
        assertEquals(1,transport.dashboardReads.get());
        assertFalse(views(root()).stream().anyMatch(v -> v instanceof EditText e && activity.getString(R.string.erp_server).contentEquals(e.getHint())));
        assertNull(Shadows.shadowOf(RuntimeEnvironment.getApplication()).getNextStartedService());
    }

    @Test public void unconfiguredServerNeverSubmitsCredentialsOrFallsBackToDemo() throws Exception {
        launch(new ErpServerDiscovery() {
            @Override String discover() throws Exception { throw new ErpConsoleTransport.Failure(0,"SERVER_NOT_CONFIGURED",false); }
        });
        ControlledTransport transport = new ControlledTransport(); inject(transport);
        await(() -> text().contains(activity.getString(R.string.erp_server_pending)));
        assertFalse(views(root()).stream().anyMatch(v -> v instanceof EditText e && activity.getString(R.string.erp_server).contentEquals(e.getHint())));
        screenshot("phone-login-server-pending.png",411,891);
        edit(R.string.erp_email).setText("synthetic@example.invalid"); edit(R.string.erp_password).setText("synthetic-only");
        click(R.string.erp_sign_in);
        assertEquals(0,transport.loginCalls.get()); assertFalse(hasButton(R.string.erp_exit_demo));
        assertTrue(text().contains(activity.getString(R.string.erp_server_wait)));
    }

    @Test public void automaticTaskRefreshPreservesSearchAndShowsNewServerData() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openTasks();
        EditText search=edit(R.string.erp_search); search.setText("fixture"); search.requestFocus();
        assertFalse(text().contains("New fixture task")); transport.newTask=true;
        int before=transport.taskReads.get(); advance(30);
        await(() -> transport.taskReads.get()>before&&!busy());
        assertSame(search,edit(R.string.erp_search)); assertEquals("fixture",search.getText().toString());
        assertTrue(text().contains("New fixture task")); assertTrue(search.hasFocus());
    }

    @Test public void automaticAndManualMessageRefreshPreserveDraftWithoutSending() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openChat();
        EditText draft=edit(R.string.erp_message); draft.setText("Unsent private draft");
        transport.demo.sendMessage(DemoConsoleTransport.CHANNEL,"New server message","DE","remote-fixture-key");
        int before=transport.messageReads.get(); advance(15);
        await(() -> transport.messageReads.get()>before&&!busy());
        assertTrue(text().contains("New server message")); assertSame(draft,edit(R.string.erp_message));
        assertEquals("Unsent private draft",draft.getText().toString()); assertEquals(0,transport.sendCalls.get());
        click(R.string.erp_refresh); settled();
        assertSame(draft,edit(R.string.erp_message)); assertEquals("Unsent private draft",draft.getText().toString());
    }

    @Test public void foregroundRefreshStopsWhileHiddenAndResumesAutomatically() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openTasks();
        int before=transport.taskReads.get(); controller.pause().stop(); advance(120);
        assertEquals(before,transport.taskReads.get());
        controller.start().resume(); Shadows.shadowOf(Looper.getMainLooper()).idle();
        await(() -> transport.taskReads.get()>before&&!busy());
    }

    @Test public void serverDiscoveryWaitsForFirstStartAndResumesWithoutSubmittingCredentials() throws Exception {
        AtomicInteger probes=new AtomicInteger(); CountDownLatch entered=new CountDownLatch(1);
        controller=Robolectric.buildActivity(ErpConsoleActivity.class); activity=controller.get();
        ReflectionHelpers.setField(activity,"discovery",new ErpServerDiscovery() {
            @Override String discover() { probes.incrementAndGet(); entered.countDown(); return "https://fixture.invalid"; }
        });
        controller.create(); Shadows.shadowOf(Looper.getMainLooper()).idle();
        assertFalse("Public discovery must wait for the first onStart",entered.await(150,TimeUnit.MILLISECONDS));
        ControlledTransport transport=new ControlledTransport(); inject(transport);
        controller.start().resume().visible();
        await(() -> text().contains(activity.getString(R.string.erp_server_connected)));
        assertEquals(1,probes.get());
        edit(R.string.erp_email).setText("synthetic@example.invalid"); edit(R.string.erp_password).setText("synthetic-only");
        controller.pause().stop(); advance(120); assertEquals(1,probes.get());
        controller.start().resume();
        await(() -> probes.get()==2&&!ReflectionHelpers.<Boolean>getField(activity,"discoveryBusy"));
        assertEquals(0,transport.loginCalls.get()); assertEquals("synthetic-only",edit(R.string.erp_password).getText().toString());
    }

    @Test public void delayedLoginAfterStopDefersAuthenticatedReadsUntilForeground() throws Exception {
        launch(); CountDownLatch loginEntered=new CountDownLatch(1),loginRelease=new CountDownLatch(1);
        AtomicInteger authorityReads=new AtomicInteger();
        ControlledTransport transport=new ControlledTransport() {
            @Override JSONObject login(String email,String password,String otp) throws Exception {
                loginEntered.countDown(); if(!loginRelease.await(4,TimeUnit.SECONDS))throw new AssertionError("Unreleased login fixture");
                return super.login(email,password,otp);
            }
            @Override JSONObject me() throws Exception { authorityReads.incrementAndGet(); return super.me(); }
        };
        inject(transport); await(() -> text().contains(activity.getString(R.string.erp_server_connected)));
        edit(R.string.erp_email).setText("synthetic@example.invalid"); edit(R.string.erp_password).setText("synthetic-only");
        try {
            click(R.string.erp_sign_in); assertTrue(loginEntered.await(2,TimeUnit.SECONDS));
            controller.pause().stop(); loginRelease.countDown();
            await(() -> hasButton(R.string.erp_logout)&&!busy()); advance(120);
            assertEquals("No new authority read may start after onStop",0,authorityReads.get());
            assertEquals("No new dashboard read may start after onStop",0,transport.dashboardReads.get());
            controller.start().resume();
            await(() -> transport.dashboardReads.get()==1&&!busy());
            assertEquals(1,authorityReads.get()); assertEquals(1,transport.loginCalls.get()); assertEquals(0,transport.sendCalls.get());
        } finally { loginRelease.countDown(); }
    }

    @Test public void resumedReadRevalidatesCurrentAuthorityBeforeFetchingPrivateRecords() throws Exception {
        launch(); ControlledTransport transport=new ControlledTransport(); signInFixture(transport); openTasks();
        int before=transport.taskReads.get(); controller.pause().stop(); transport.changedScope=true; advance(120);
        assertEquals(before,transport.taskReads.get()); controller.start().resume();
        await(() -> hasButton(R.string.erp_sign_in)&&!busy());
        assertEquals("Changed site scope must prevent a new private data read",before,transport.taskReads.get());
        assertFalse(text().contains("DEMO · Fenster reinigen")); assertEquals(0,transport.sendCalls.get());
    }

    @Test public void recreatedSessionLoadsDashboardImmediatelyOnFirstStart() throws Exception {
        launch(); ControlledTransport transport=new ControlledTransport(); signInFixture(transport);
        int before=transport.dashboardReads.get(); controller.recreate(); activity=controller.get();
        await(() -> transport.dashboardReads.get()==before+1&&!busy());
        assertTrue(hasButton(R.string.erp_logout)); assertEquals(1,transport.loginCalls.get());
    }

    @Test public void connectionLossRetainsReadDataAndRecoversWithBoundedBackoff() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openTasks();
        transport.failTasks=true; int before=transport.taskReads.get(); advance(30);
        await(() -> transport.taskReads.get()>before&&!busy());
        assertTrue(text().contains("DEMO · Fenster reinigen"));
        assertTrue(text().contains(activity.getString(R.string.erp_connection_error)));
        int failed=transport.taskReads.get(); transport.failTasks=false; transport.newTask=true;
        advance(59); assertEquals(failed,transport.taskReads.get()); advance(14);
        await(() -> transport.taskReads.get()>failed&&!busy());
        assertTrue(text().contains("New fixture task"));
        assertFalse(text().contains(activity.getString(R.string.erp_connection_error)));
    }

    @Test public void revokedReadAccessRemovesPrivateRecordsImmediately() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openTasks();
        transport.denyTasks=true; advance(30); await(() -> hasButton(R.string.erp_sign_in)&&!busy());
        assertFalse(text().contains("DEMO · Fenster reinigen")); assertFalse(hasButton(R.string.erp_tasks));
    }

    @Test public void changedSiteScopeRequiresReauthenticationBeforeAnotherDataRead() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openTasks();
        int before=transport.taskReads.get(); transport.changedScope=true; advance(30);
        await(() -> hasButton(R.string.erp_sign_in)&&!busy());
        assertEquals(before,transport.taskReads.get()); assertFalse(text().contains("DEMO · Fenster reinigen"));
    }

    @Test public void uncertainMessageIsNeverAutomaticallyRepeatedOrOverwritten() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openChat();
        transport.unknownSend=true; edit(R.string.erp_message).setText("Uncertain submission"); click(R.string.erp_send); settled();
        int reads=transport.messageReads.get(); advance(120);
        assertEquals(1,transport.sendCalls.get()); assertEquals(reads,transport.messageReads.get());
        controller.pause().stop(); advance(120); controller.start().resume(); advance(120);
        assertEquals("Foreground resume must never repeat an uncertain mutation",1,transport.sendCalls.get());
        assertEquals(reads,transport.messageReads.get());
        assertEquals("Uncertain submission",edit(R.string.erp_message).getText().toString());
        assertTrue(text().contains(activity.getString(R.string.erp_unknown_result)));
    }

    @Test public void latePublicConfigurationDoesNotReplaceAnExplicitDemoSession() throws Exception {
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        launch(new ErpServerDiscovery() {
            @Override String discover() throws Exception {
                entered.countDown(); if (!release.await(4,TimeUnit.SECONDS)) throw new AssertionError("Blocked discovery fixture");
                return "https://fixture.invalid";
            }
        });
        assertTrue(entered.await(2,TimeUnit.SECONDS)); demo(); release.countDown(); settled();
        assertTrue(hasButton(R.string.erp_exit_demo)); assertFalse(hasButton(R.string.erp_sign_in));
        assertFalse(text().contains(activity.getString(R.string.erp_server_connected)));
    }

    @Test public void pendingServerIsRetriedAutomaticallyWithoutSubmittingTypedCredentials() throws Exception {
        AtomicInteger probes=new AtomicInteger();
        launch(new ErpServerDiscovery() {
            @Override String discover() throws Exception {
                if (probes.incrementAndGet()==1) throw new ErpConsoleTransport.Failure(0,"SERVER_NOT_CONFIGURED",false);
                return "https://fixture.invalid";
            }
        });
        ControlledTransport transport=new ControlledTransport(); inject(transport);
        await(() -> text().contains(activity.getString(R.string.erp_server_pending)));
        EditText password=edit(R.string.erp_password); password.setText("synthetic-only");
        advance(60); await(() -> text().contains(activity.getString(R.string.erp_server_connected)));
        assertEquals(2,probes.get()); assertEquals(0,transport.loginCalls.get());
        assertSame(password,edit(R.string.erp_password)); assertEquals("synthetic-only",password.getText().toString());
    }

    @Test public void discoveryResumesAfterATimerOverlapsFailedLoginWithoutReplayingCredentials() throws Exception {
        AtomicInteger probes=new AtomicInteger();
        launch(new ErpServerDiscovery() {
            @Override String discover() { probes.incrementAndGet(); return "https://fixture.invalid"; }
        });
        await(() -> text().contains(activity.getString(R.string.erp_server_connected)));
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        ControlledTransport transport=new ControlledTransport() {
            @Override JSONObject login(String email,String password,String otp) throws Exception {
                loginCalls.incrementAndGet(); entered.countDown();
                if(!release.await(4,TimeUnit.SECONDS))throw new AssertionError("Unreleased failed login fixture");
                throw new Failure(0,"NETWORK_ERROR",false);
            }
        };
        inject(transport);
        edit(R.string.erp_email).setText("synthetic@example.invalid");
        edit(R.string.erp_password).setText("synthetic-only");
        try {
            click(R.string.erp_sign_in); assertTrue(entered.await(2,TimeUnit.SECONDS));
            advance(62);
            assertEquals("Busy login must not start overlapping discovery",1,probes.get());
            release.countDown();
            await(() -> !busy()&&text().contains(activity.getString(R.string.erp_connection_error)));
            advance(1);
            await(() -> probes.get()==2&&!ReflectionHelpers.<Boolean>getField(activity,"discoveryBusy"));
            assertEquals("Discovery must never replay login credentials",1,transport.loginCalls.get());
            assertEquals("",edit(R.string.erp_password).getText().toString());
            assertEquals(0,transport.dashboardReads.get());
        } finally { release.countDown(); }
    }

    @Test public void aSlowRefreshNeverOverlapsAnotherDataRequest() throws Exception {
        launch(); ControlledTransport transport=new ControlledTransport(); signInFixture(transport); openTasks();
        int before=transport.taskReads.get(); transport.blockTasks=true; advance(30);
        assertTrue(transport.entered.await(2,TimeUnit.SECONDS)); advance(30);
        assertEquals(before+1,transport.taskReads.get());
        assertTrue(edit(R.string.erp_search).isEnabled());
        transport.release.countDown(); settled(); assertEquals(before+1,transport.taskReads.get());
    }

    @Test public void recordDetailsRefreshTheirServerVersionAndTitle() throws Exception {
        launch(); ControlledTransport transport=new ControlledTransport(); signInFixture(transport); openTasks();
        click(R.string.erp_view_details); settled(); transport.renamedTask=true;
        int before=transport.taskReads.get(); advance(30); await(() -> transport.taskReads.get()>before&&!busy());
        assertTrue(text().contains("Renamed server task"));
        assertTrue(text().contains(activity.getString(R.string.erp_record_version,2)));
    }

    @Test public void commandFormDoesNotRefreshOrSubmitItself() throws Exception {
        launch(); ControlledTransport transport=new ControlledTransport(); signInFixture(transport); openTasks();
        edit(R.string.erp_search).setText("Eingangsbereich"); click(R.string.erp_view_details); settled(); click(R.string.erp_log_work);
        EditText description=edit(activity.getString(R.string.erp_field_description)+" *"); description.setText("Unsent work form");
        int before=transport.taskReads.get(); advance(120);
        assertEquals(before,transport.taskReads.get()); assertSame(description,edit(activity.getString(R.string.erp_field_description)+" *"));
        assertEquals("Unsent work form",description.getText().toString()); assertEquals(0,transport.sendCalls.get());
    }

    @Test public void serverRetryAfterIsHonoredAcrossForegroundAndManualRefresh() throws Exception {
        launch(); ControlledTransport transport=new ControlledTransport(); signInFixture(transport); openTasks();
        transport.rateLimitTasks=true; int before=transport.taskReads.get(); advance(30);
        await(() -> transport.taskReads.get()>before&&!busy());
        int failed=transport.taskReads.get(); transport.rateLimitTasks=false;
        click(R.string.erp_refresh); assertEquals(failed,transport.taskReads.get());
        controller.pause().stop().start().resume(); advance(299); assertEquals(failed,transport.taskReads.get());
        advance(1); await(() -> transport.taskReads.get()>failed&&!busy());
    }

    @Test public void emptyLoginIsRejectedAndDoesNotStartGps() {
        launch(); click(R.string.erp_sign_in);
        assertTrue(text().contains(activity.getString(R.string.erp_fields_required)));
        assertFalse(busy());
        assertNull(Shadows.shadowOf(RuntimeEnvironment.getApplication()).getNextStartedService());
        assertEquals("de", activity.getResources().getConfiguration().getLocales().get(0).getLanguage());
    }

    @Test public void languagePickerHasSixLanguagesAndSystemChoice() {
        launch(); click(R.string.language_label);
        AlertDialog dialog = ShadowAlertDialog.getLatestAlertDialog();
        assertNotNull(dialog); assertEquals(7, dialog.getListView().getAdapter().getCount());
        String[] expected = {"Deutsch", "English", "Polski", "Lietuvių", "Русский", "Українська"};
        for (int i=0; i<expected.length; i++) assertEquals(expected[i], dialog.getListView().getAdapter().getItem(i));
    }

    @Test public void selectedUkrainianSurvivesNewActivity() {
        NativeLocale.INSTANCE.choose(RuntimeEnvironment.getApplication(), "uk");
        launch();
        assertEquals("uk", activity.getResources().getConfiguration().getLocales().get(0).getLanguage());
        assertTrue(button(R.string.erp_try_demo).isEnabled());
    }

    @Test public void demoSearchDetailBackAndEmptyResultsAreUsable() throws Exception {
        launch(); demo(); openTasks();
        assertTrue(text().contains("DEMO · Fenster reinigen"));
        edit(R.string.erp_search).setText("Fenster");
        assertTrue(text().contains("DEMO · Fenster reinigen"));
        assertFalse(text().contains("DEMO · Fassadenkontrolle"));
        click(R.string.erp_view_details); settled();
        assertTrue(text().contains("demo-task-windows"));
        assertFalse("Details must not dump raw JSON", text().contains("\"companyId\":"));
        pressBack(); settled();
        assertTrue(text().contains("DEMO · Fassadenkontrolle"));
        edit(R.string.erp_search).setText("does-not-exist");
        assertTrue(text().contains(activity.getString(R.string.erp_empty)));
        pressBack(); settled();
        assertTrue(hasButton(R.string.erp_exit_demo));
    }

    @Test public void demoMessagePersistsOnRefreshAndResetsOnExit() throws Exception {
        launch(); demo(); openChat();
        String message = "QA local test, no external recipient";
        edit(R.string.erp_message).setText(message); click(R.string.erp_send); settled();
        assertTrue(text().contains(message));
        click(R.string.erp_refresh); settled(); assertTrue(text().contains(message));
        pressBack(); settled(); pressBack(); settled();
        click(R.string.erp_exit_demo); settled();
        assertTrue(hasButton(R.string.erp_try_demo));
        assertFalse(text().contains(activity.getString(R.string.erp_demo_banner)));
        demo(); openChat(); assertFalse(text().contains(message));
    }

    @Test public void demoTaskStartWorklogSubmitUsesOrdinaryQuantitiesAndNoInternalIds() throws Exception {
        launch(); demo(); openTasks(); edit(R.string.erp_search).setText("Fenster");
        click(R.string.erp_view_details); settled(); click(R.string.erp_start_task);
        assertEquals("Starting a contextual task needs no internal IDs", 0,
                views(root()).stream().filter(v -> v instanceof EditText).count());
        click(R.string.erp_submit); settled();
        edit(R.string.erp_search).setText("Fenster"); click(R.string.erp_view_details); settled();
        click(R.string.erp_log_work);
        EditText quantity = views(root()).stream().filter(v -> v instanceof EditText e && e.getHint().toString().startsWith(activity.getString(R.string.erp_quantity))).map(v -> (EditText) v).findFirst().orElseThrow();
        EditText description = edit(activity.getString(R.string.erp_field_description) + " *");
        quantity.setText("2.5555"); description.setText("Synthetic work result"); click(R.string.erp_submit);
        assertTrue(text().contains(activity.getString(R.string.error_validation)));
        quantity.setText("2.5"); click(R.string.erp_submit); settled();
        Field apiField = ErpConsoleActivity.class.getDeclaredField("api"); apiField.setAccessible(true);
        ErpConsoleTransport transport = (ErpConsoleTransport) apiField.get(activity);
        JSONObject task = transport.entities("task").getJSONObject(0);
        assertEquals("demo-task-windows", task.getString("id"));
        assertEquals(2500, task.getJSONObject("data").getLong("reportedQuantityMilli"));
        edit(R.string.erp_search).setText("Fenster"); click(R.string.erp_view_details); settled();
        click(R.string.erp_submit_task);
        assertEquals("Only the optional description is exposed", 1,
                views(root()).stream().filter(v -> v instanceof EditText).count());
        click(R.string.erp_submit); settled();
        edit(R.string.erp_search).setText("Fenster"); click(R.string.erp_view_details); settled();
        assertTrue(text().contains(activity.getString(R.string.erp_state_review)));
        assertTrue(text().contains(activity.getString(R.string.erp_demo_banner)));
        assertEquals("SUBMITTED_FOR_REVIEW", transport.entities("task").getJSONObject(0).getJSONObject("data").getString("state"));
    }

    @Test public void serverQuantityDefaultIsDisplayedInOrdinaryUnits() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); transport.quantityDefault = true;
        signInFixture(transport); openTasks(); edit(R.string.erp_search).setText("Eingangsbereich");
        click(R.string.erp_view_details); settled(); click(R.string.erp_log_work);
        EditText quantity = views(root()).stream().filter(v -> v instanceof EditText e && e.getHint().toString().startsWith(activity.getString(R.string.erp_quantity))).map(v -> (EditText) v).findFirst().orElseThrow();
        assertEquals("Server default 1000 thousandths is one ordinary unit", "1", quantity.getText().toString());
    }

    @Test public void leavingReadScreenDiscardsLateTaskResults() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport);
        transport.blockTasks = true; click(R.string.erp_tasks);
        assertTrue(transport.entered.await(2, TimeUnit.SECONDS));
        pressBack(); transport.release.countDown(); settled();
        assertTrue(hasButton(R.string.erp_logout));
        assertFalse(text().contains("DEMO · Fenster reinigen"));
    }

    @Test public void repeatedSendWhilePendingCreatesOnlyOneMessage() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport); openChat();
        transport.blockSend = true;
        edit(R.string.erp_message).setText("one submission only");
        Button send = button(R.string.erp_send); send.performClick();
        assertTrue(transport.entered.await(2, TimeUnit.SECONDS));
        assertFalse(send.isEnabled()); send.performClick();
        assertEquals(1, transport.sendCalls.get());
        transport.release.countDown(); settled();
        assertEquals(1, transport.sendCalls.get());
        assertEquals(2, transport.demo.messages(DemoConsoleTransport.CHANNEL).length());
        assertTrue(text().contains("one submission only"));
    }

    @Test public void expiredSessionReturnsToLoginWithoutPrivateRecords() throws Exception {
        launch(); ControlledTransport transport = new ControlledTransport(); signInFixture(transport);
        transport.expired = true; click(R.string.erp_refresh); settled();
        assertTrue(hasButton(R.string.erp_sign_in));
        assertFalse(hasButton(R.string.erp_tasks));
        assertTrue(text().contains(activity.getString(R.string.erp_session_expired)));
    }

    private void signInFixture(ControlledTransport transport) throws Exception {
        inject(transport);
        await(() -> !ReflectionHelpers.<Boolean>getField(activity, "discoveryBusy"));
        edit(R.string.erp_email).setText("synthetic@example.invalid");
        edit(R.string.erp_password).setText("synthetic-only");
        click(R.string.erp_sign_in); await(() -> hasButton(R.string.erp_logout) && !busy());
    }

    /** Explicit HTTP-free control fixture for timing and failures; never used in APK. */
    private static class ControlledTransport extends ErpConsoleTransport {
        final DemoConsoleTransport demo = new DemoConsoleTransport();
        final CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        final AtomicInteger sendCalls = new AtomicInteger(), taskReads = new AtomicInteger(), messageReads = new AtomicInteger(), dashboardReads = new AtomicInteger(), loginCalls = new AtomicInteger();
        volatile boolean blockTasks, blockSend, expired, quantityDefault, failTasks, denyTasks, newTask, unknownSend, changedScope, renamedTask, rateLimitTasks;
        String configuredOrigin;
        @Override void configure(String origin) { configuredOrigin = origin; }
        @Override String origin() { return "https://fixture.invalid"; }
        @Override void clear() { demo.clear(); }
        @Override JSONObject login(String email, String password, String otp) throws Exception { loginCalls.incrementAndGet(); return demo.login("", "", ""); }
        @Override JSONObject me() throws Exception {
            if (expired) throw new Failure(401,"NEEDS_REAUTH",false);
            JSONObject result = demo.me();
            if (changedScope) result.getJSONObject("actor").put("siteIds",new JSONArray());
            return result;
        }
        @Override JSONObject dashboard() throws Exception { dashboardReads.incrementAndGet(); return demo.dashboard(); }
        @Override JSONArray entities(String kind) throws Exception {
            if (kind.equals("task")) {
                taskReads.incrementAndGet();
                if (failTasks) throw new Failure(0,"NETWORK_ERROR",false);
                if (rateLimitTasks) throw new Failure(429,"RATE_LIMITED",false,300000);
                if (denyTasks) throw new Failure(403,"ACCESS_DENIED",false);
            }
            if (blockTasks && kind.equals("task")) { entered.countDown(); if (!release.await(4,TimeUnit.SECONDS)) throw new AssertionError("Unreleased task fixture"); }
            JSONArray items = demo.entities(kind);
            if (renamedTask && kind.equals("task")) { items.getJSONObject(0).put("version",2).getJSONObject("data").put("name","Renamed server task"); }
            if (newTask && kind.equals("task")) items.put(new JSONObject().put("id","new-server-record").put("kind","task").put("version",1)
                .put("data",new JSONObject().put("name","New fixture task").put("state","ASSIGNED")));
            return items;
        }
        @Override JSONArray messages(String channel) throws Exception { messageReads.incrementAndGet(); return demo.messages(channel); }
        @Override JSONArray catalog() throws Exception {
            JSONArray catalog = demo.catalog();
            if (quantityDefault) for (int i=0; i<catalog.length(); i++) {
                JSONObject command = catalog.getJSONObject(i);
                if (command.getString("name").equals("task.worklog")) command.getJSONObject("schema").getJSONObject("properties").getJSONObject("quantityMilli").put("default",1000);
            }
            return catalog;
        }
        @Override JSONObject sendMessage(String channel, String text, String language, String key) throws Exception {
            sendCalls.incrementAndGet();
            if (unknownSend) throw new Failure(0,"NETWORK_ERROR",true);
            if (blockSend) { entered.countDown(); if (!release.await(4,TimeUnit.SECONDS)) throw new AssertionError("Unreleased send fixture"); }
            return demo.sendMessage(channel,text,language,key);
        }
        @Override Runnable detachSessionForLogout() { return demo.detachSessionForLogout(); }
    }

    /** Explicit API fixture: these assertions cover native navigation, not SQL authorization. */
    private static class RoleTransport extends ControlledTransport {
        final JSONObject identity;
        final List<String> requestedKinds = new ArrayList<>();
        RoleTransport(String role, String... permissions) throws Exception {
            identity = new JSONObject().put("actor", new JSONObject().put("userId", "synthetic-user")
                    .put("companyId", "synthetic-company").put("roles", new JSONArray().put(role))
                    .put("permissions", new JSONArray(List.of(permissions))));
        }
        @Override JSONObject login(String email, String password, String otp) throws Exception { return new JSONObject(identity.toString()); }
        @Override JSONObject me() throws Exception { return new JSONObject(identity.toString()); }
        @Override JSONObject dashboard() throws Exception { return new JSONObject().put("counts", new JSONObject()); }
        @Override JSONArray entities(String kind) throws Exception {
            requestedKinds.add(kind);
            return new JSONArray().put(new JSONObject().put("id", "synthetic-" + kind).put("kind", kind).put("version", 7)
                    .put("data", new JSONObject().put("name", "Fixture " + kind).put("status", "APPROVED")));
        }
        @Override JSONArray catalog() throws Exception { return new JSONArray(); }
    }

    private static class RecordCommandTransport extends RoleTransport {
        final JSONObject definition;
        final AtomicInteger calls = new AtomicInteger();
        JSONObject submitted;
        Integer submittedVersion;
        String submittedName, submittedKey;
        RecordCommandTransport(String role, String command, String permission, String primaryField, String... granted) throws Exception {
            super(role, granted);
            definition = new JSONObject().put("name", command).put("permission", permission).put("highRisk", false)
                    .put("schema", new JSONObject().put("type", "object").put("properties", new JSONObject()
                            .put(primaryField, new JSONObject().put("type", "string")))
                            .put("required", new JSONArray().put(primaryField)));
        }
        @Override JSONArray catalog() { return new JSONArray().put(definition); }
        @Override JSONArray entities(String kind) throws Exception {
            JSONArray rows = super.entities(kind);
            JSONObject data = rows.getJSONObject(0).getJSONObject("data");
            if (kind.equals("quote")) data.put("quoteVersion", 12);
            if (kind.equals("crew_assignment")) data.put("employeeId", "synthetic-employee-42").put("scheduleVersion", 3);
            return rows;
        }
        @Override JSONObject command(String name, JSONObject input, Integer version, String key) throws Exception {
            submittedName = name; submitted = new JSONObject(input.toString()); submittedVersion = version; submittedKey = key;
            calls.incrementAndGet();
            return new JSONObject().put("id", "synthetic-result");
        }
    }

    private String actionTitle(int module, int action) { return activity.getString(module) + " · " + activity.getString(action); }

    @Test public void materialRequestActionBindsOpenedRecordAndVersionWithoutManualIds() throws Exception {
        launch(); RecordCommandTransport transport = new RecordCommandTransport("EMPLOYEE", "request.submit", "inventory.request", "requestId", "inventory.read", "inventory.request");
        signInFixture(transport); click(R.string.erp_material_requests); settled(); click(R.string.erp_view_details); settled();
        click(actionTitle(R.string.erp_material_requests, R.string.erp_action_submit)); settled();
        assertTrue(views(root()).stream().noneMatch(v -> v instanceof EditText));
        click(R.string.erp_submit); settled();
        assertEquals(1, transport.calls.get()); assertEquals("request.submit", transport.submittedName);
        assertEquals("synthetic-material_request", transport.submitted.getString("requestId"));
        assertEquals(1, transport.submitted.length()); assertEquals(Integer.valueOf(7), transport.submittedVersion);
        assertNotNull(java.util.UUID.fromString(transport.submittedKey));
        assertTrue(text().contains("Fixture material_request"));
        assertFalse(transport.requestedKinds.contains("task"));
    }

    @Test public void quoteAcceptancePinsPublishedVersionAndRequiresSensitiveConfirmation() throws Exception {
        launch(); RecordCommandTransport transport = new RecordCommandTransport("CLIENT", "quote.accept", "quote.accept", "id", "quote.read", "quote.accept");
        transport.definition.put("highRisk", true);
        transport.definition.getJSONObject("schema").getJSONObject("properties").put("quoteVersion", new JSONObject().put("type", "integer"));
        transport.definition.getJSONObject("schema").getJSONArray("required").put("quoteVersion");
        signInFixture(transport); click(R.string.erp_quotes); settled(); click(R.string.erp_view_details); settled();
        click(actionTitle(R.string.erp_quotes, R.string.erp_action_accept)); settled();
        assertTrue(views(root()).stream().noneMatch(v -> v instanceof EditText));
        click(R.string.erp_submit);
        AlertDialog first = ShadowAlertDialog.getLatestAlertDialog(); assertNotNull(first);
        first.getButton(AlertDialog.BUTTON_NEGATIVE).performClick(); settled(); assertEquals(0, transport.calls.get());
        click(R.string.erp_submit);
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick(); settled();
        assertEquals(1, transport.calls.get()); assertEquals("synthetic-quote", transport.submitted.getString("id"));
        assertEquals(12, transport.submitted.getInt("quoteVersion")); assertEquals(Integer.valueOf(7), transport.submittedVersion);
    }

    @Test public void readPermissionDoesNotExposeWriteEvenIfCatalogListsIt() throws Exception {
        launch(); RecordCommandTransport transport = new RecordCommandTransport("EMPLOYEE", "request.approve", "inventory.approve", "requestId", "inventory.read");
        signInFixture(transport); click(R.string.erp_material_requests); settled(); click(R.string.erp_view_details); settled();
        String forbidden = actionTitle(R.string.erp_material_requests, R.string.erp_action_review);
        assertFalse(text().contains(forbidden));
        click(R.string.erp_actions); settled();
        assertFalse(text().contains(forbidden)); assertTrue(text().contains(activity.getString(R.string.erp_empty)));
        assertEquals(0, transport.calls.get());
    }

    @Test public void incompatibleCommandSchemaCannotBindAnotherEntityId() throws Exception {
        launch(); RecordCommandTransport transport = new RecordCommandTransport("EMPLOYEE", "request.submit", "inventory.request", "payoutId", "inventory.read", "inventory.request");
        signInFixture(transport); click(R.string.erp_material_requests); settled(); click(R.string.erp_view_details); settled();
        assertFalse(text().contains(actionTitle(R.string.erp_material_requests, R.string.erp_action_submit)));
        assertEquals(0, transport.calls.get());
    }

    @Test public void ownCrewResponseUsesProjectedEmployeeIdentityAndScheduleVersion() throws Exception {
        launch(); RecordCommandTransport transport = new RecordCommandTransport("EMPLOYEE", "crew_assignment.acknowledge", "dispatch.acknowledge", "id", "dispatch.acknowledge");
        JSONObject schema = transport.definition.getJSONObject("schema");
        schema.getJSONObject("properties").put("employeeId", new JSONObject().put("type", "string")).put("scheduleVersion", new JSONObject().put("type", "integer"));
        schema.getJSONArray("required").put("employeeId");
        signInFixture(transport); click(R.string.erp_crew); settled(); click(R.string.erp_view_details); settled();
        click(actionTitle(R.string.erp_crew, R.string.erp_action_accept)); settled();
        assertTrue(views(root()).stream().noneMatch(v -> v instanceof EditText));
        click(R.string.erp_submit); settled();
        assertEquals("synthetic-crew_assignment", transport.submitted.getString("id"));
        assertEquals("synthetic-employee-42", transport.submitted.getString("employeeId"));
        assertEquals(3, transport.submitted.getInt("scheduleVersion")); assertEquals(Integer.valueOf(7), transport.submittedVersion);
    }

    @Test public void accountantCanReadPayrollAndReportsWithoutWarehouseOrLocationNavigation() throws Exception {
        launch(); RoleTransport transport = new RoleTransport("ACCOUNTANT", "finance.accountant", "timesheet.read", "report.read", "identity.self");
        signInFixture(transport);
        assertTrue(hasButton(R.string.erp_payroll)); assertTrue(hasButton(R.string.erp_payouts));
        assertTrue(hasButton(R.string.erp_reports)); assertTrue(hasButton(R.string.erp_timesheets));
        assertFalse(hasButton(R.string.erp_materials)); assertFalse(hasButton(R.string.erp_presence)); assertFalse(hasButton(R.string.erp_users));
        click(R.string.erp_payroll); settled(); click(R.string.erp_view_details); settled();
        assertTrue(text().contains("synthetic-payroll_calculation"));
        assertTrue(text().contains(activity.getString(R.string.erp_record_version, 7)));
        assertEquals(List.of("payroll_calculation", "payroll_calculation"), transport.requestedKinds);
    }

    @Test public void customerCanOpenPublishedCommerceAndReportsWithoutInternalModules() throws Exception {
        launch(); RoleTransport transport = new RoleTransport("CLIENT", "customer.portal", "commerce.read", "quote.read", "report.read", "issue.read", "chat.read");
        signInFixture(transport);
        assertTrue(hasButton(R.string.erp_orders)); assertTrue(hasButton(R.string.erp_quotes));
        assertTrue(hasButton(R.string.erp_report_versions)); assertTrue(hasButton(R.string.erp_issues));
        assertFalse(hasButton(R.string.erp_people)); assertFalse(hasButton(R.string.erp_payroll)); assertFalse(hasButton(R.string.erp_crew));
        click(R.string.erp_quotes); settled(); click(R.string.erp_view_details); settled();
        assertTrue(text().contains("synthetic-quote"));
        assertEquals(List.of("quote", "quote"), transport.requestedKinds);
    }

    @Test public void warehouseAndProcurementModulesUseGrantedCapabilitiesAndFreshRevocation() throws Exception {
        launch(); RoleTransport transport = new RoleTransport("STOREKEEPER", "inventory.read", "procurement.read", "identity.self");
        signInFixture(transport);
        assertTrue(hasButton(R.string.erp_material_requests)); assertTrue(hasButton(R.string.erp_request_batches));
        assertTrue(hasButton(R.string.erp_stock_locations)); assertTrue(hasButton(R.string.erp_purchase_orders));
        assertFalse(hasButton(R.string.erp_payroll)); assertFalse(hasButton(R.string.erp_presence));
        click(R.string.erp_material_requests); settled(); click(R.string.erp_view_details); settled();
        assertTrue(text().contains("synthetic-material_request"));
        pressBack(); settled(); pressBack(); settled();
        transport.identity.getJSONObject("actor").put("permissions", new JSONArray().put("identity.self"));
        click(R.string.erp_refresh); settled();
        assertFalse(hasButton(R.string.erp_material_requests)); assertFalse(hasButton(R.string.erp_purchase_orders));
        assertTrue("Changed authority requires reauthentication before showing another module",hasButton(R.string.erp_sign_in));
        assertFalse(text().contains("Fixture material_request"));
        assertEquals(List.of("material_request", "material_request", "material_request"), transport.requestedKinds);
    }

    @Test public void roleNameAloneDoesNotExposeFinanceGpsOrIdentityModules() throws Exception {
        launch(); signInFixture(new RoleTransport("OWNER", "site.read", "identity.self"));
        assertTrue(hasButton(R.string.erp_sites)); assertTrue(hasButton(R.string.erp_alerts));
        assertFalse(hasButton(R.string.erp_payroll)); assertFalse(hasButton(R.string.erp_payouts));
        assertFalse(hasButton(R.string.erp_presence)); assertFalse(hasButton(R.string.erp_users));
        assertFalse(hasButton(R.string.erp_vehicle_trips));
    }

    @Test public void vehicleTripReadNavigationUsesExistingGenericContractWithoutInventedActions() throws Exception {
        launch(); RoleTransport transport=new RoleTransport("EMPLOYEE","trip.read","identity.self");
        signInFixture(transport); click(R.string.erp_vehicle_trips); settled(); click(R.string.erp_view_details); settled();
        assertEquals(List.of("vehicle_trip","vehicle_trip"),transport.requestedKinds);
        assertTrue(text().contains("synthetic-vehicle_trip")); assertFalse(hasButton(R.string.erp_submit));
    }

    private RecordCommandTransport credentialTransport(boolean unknown) throws Exception {
        RecordCommandTransport transport=new RecordCommandTransport("EMPLOYEE","user.password.rotate","identity.self","currentPassword","identity.self") {
            @Override JSONObject command(String name,JSONObject input,Integer version,String key) throws Exception {
                super.command(name,input,version,key);
                if (unknown) throw new Failure(0,"NETWORK_ERROR",true);
                return new JSONObject().put("ok",true).put("reauthenticationRequired",true);
            }
        };
        JSONObject schema=transport.definition.getJSONObject("schema");
        schema.getJSONObject("properties").put("newPassword",new JSONObject().put("type","string"));
        schema.getJSONArray("required").put("newPassword");
        return transport;
    }

    @Test public void credentialFormMasksAndClearsInputsThenRequiresANewLogin() throws Exception {
        launch(); RecordCommandTransport transport=credentialTransport(false); signInFixture(transport);
        click(R.string.erp_actions); settled(); click(R.string.erp_change_password); settled();
        EditText current=edit(activity.getString(R.string.erp_current_password)+" *"),next=edit(activity.getString(R.string.erp_new_password)+" *");
        assertEquals(InputType.TYPE_TEXT_VARIATION_PASSWORD,current.getInputType()&InputType.TYPE_MASK_VARIATION);
        assertEquals(InputType.TYPE_TEXT_VARIATION_PASSWORD,next.getInputType()&InputType.TYPE_MASK_VARIATION);
        assertFalse(current.isSaveEnabled()); assertFalse(next.isSaveEnabled());
        current.setText(" synthetic-old-password "); next.setText(" synthetic-new-password ");
        click(R.string.erp_submit); assertEquals("",current.getText().toString()); assertEquals("",next.getText().toString());
        await(() -> hasButton(R.string.erp_sign_in)&&!busy());
        assertEquals(" synthetic-old-password ",transport.submitted.getString("currentPassword"));
        assertEquals(" synthetic-new-password ",transport.submitted.getString("newPassword"));
        assertNull(ReflectionHelpers.getField(activity,"pendingRecovery")); assertFalse(hasButton(R.string.erp_retry_pending));
        assertTrue(text().contains(activity.getString(R.string.erp_account_change_reauth))); assertEquals(1,transport.calls.get());
    }

    @Test public void unknownCredentialOutcomeCannotLeaveARecoveryOrRepeatAfterResume() throws Exception {
        launch(); RecordCommandTransport transport=credentialTransport(true); signInFixture(transport);
        click(R.string.erp_actions); settled(); click(R.string.erp_change_password); settled();
        edit(activity.getString(R.string.erp_current_password)+" *").setText("synthetic-old-password");
        edit(activity.getString(R.string.erp_new_password)+" *").setText("synthetic-new-password");
        click(R.string.erp_submit); await(() -> hasButton(R.string.erp_sign_in)&&!busy());
        assertNull(ReflectionHelpers.getField(activity,"pendingRecovery")); assertFalse(hasButton(R.string.erp_retry_pending));
        assertTrue(text().contains(activity.getString(R.string.erp_unknown_result)));
        controller.pause().stop(); advance(120); controller.start().resume(); advance(120);
        assertEquals(1,transport.calls.get()); assertFalse(text().contains("synthetic-old-password"));
        assertFalse(text().contains("synthetic-new-password")); assertFalse(hasButton(R.string.erp_retry_pending));
    }

    @Test public void siteSupervisorCanDiscoverOrdersThroughExistingSiteReadAuthority() throws Exception {
        launch(); RoleTransport transport = new RoleTransport("INTERNAL_BAULEITER", "site.read", "task.read", "operations.read", "identity.self");
        signInFixture(transport);
        assertTrue(hasButton(R.string.erp_orders)); assertFalse(hasButton(R.string.erp_payroll));
        click(R.string.erp_orders); settled(); click(R.string.erp_view_details); settled();
        assertEquals(List.of("order", "order"), transport.requestedKinds);
        assertTrue(text().contains("synthetic-order"));
    }

    @Test public void employeeCanFindOwnCrewAndPaymentRecordsWithoutManagerGrant() throws Exception {
        launch(); RoleTransport transport = new RoleTransport("EMPLOYEE", "dispatch.acknowledge", "payroll.self", "finance.payout.ack", "inventory.read");
        signInFixture(transport);
        assertTrue(hasButton(R.string.erp_crew)); assertTrue(hasButton(R.string.erp_payouts));
        assertTrue(hasButton(R.string.erp_receipts)); assertTrue(hasButton(R.string.erp_material_requests));
        assertFalse(hasButton(R.string.erp_people)); assertFalse(hasButton(R.string.erp_presence));
        click(R.string.erp_crew); settled();
        assertEquals(List.of("crew_assignment"), transport.requestedKinds);
    }

    @Test public void reauthenticationShowsRestoredCommandAndRetriesOriginalEnvelope() throws Exception {
        launch();
        ControlledTransport recovered = new ControlledTransport() {
            boolean loggedIn, unresolved = true;
            @Override JSONObject login(String email, String password, String otp) throws Exception { loggedIn = true; return super.login(email,password,otp); }
            @Override boolean hasPendingCommand() { return loggedIn && unresolved; }
            @Override JSONObject pendingCommand() throws Exception {
                return hasPendingCommand() ? new JSONObject().put("name","task.worklog").put("input",new JSONObject().put("task_id","synthetic-task").put("note","Recovered private note"))
                    .put("expected_version",7).put("idempotency_key","original-before-restart") : null;
            }
            @Override JSONObject command(String name, JSONObject input, Integer version, String key) throws Exception {
                assertEquals("task.worklog",name); assertEquals("Recovered private note",input.getString("note"));
                assertEquals(Integer.valueOf(7),version); assertEquals("original-before-restart",key); unresolved = false; return new JSONObject();
            }
        };
        inject(recovered);
        assertFalse("Private pending payload must not appear before authentication",text().contains("Recovered private note"));
        await(() -> !ReflectionHelpers.<Boolean>getField(activity, "discoveryBusy"));
        edit(R.string.erp_email).setText("synthetic@example.invalid"); edit(R.string.erp_password).setText("synthetic-only");
        click(R.string.erp_sign_in); await(() -> hasButton(R.string.erp_retry_pending) && !busy());
        assertTrue(text().contains("Recovered private note"));
        assertFalse("Recovery must not immediately submit a mutation",hasButton(R.string.erp_logout));
        click(R.string.erp_retry_pending); await(() -> hasButton(R.string.erp_logout) && !busy());
        assertFalse(hasButton(R.string.erp_review_pending));
        assertFalse(text().contains("Recovered private note"));
    }

    @Test public void recreationRetainsDemoSessionButNeverEnablesGps() throws Exception {
        launch(); demo(); openChat();
        edit(R.string.erp_message).setText("survives orientation"); click(R.string.erp_send); settled();
        controller.recreate(); activity = controller.get(); settled();
        assertTrue(hasButton(R.string.erp_exit_demo)); assertFalse(hasButton(R.string.erp_time_tools));
        openChat(); assertTrue(text().contains("survives orientation"));
    }

    @Test public void platformBackNavigatesAndUnregistersOnDestroy() throws Exception {
        launch(); demo(); openTasks(); click(R.string.erp_view_details); settled();
        Object dispatcher = platformBackDispatcher();
        Object callback = ReflectionHelpers.callInstanceMethod(dispatcher, "getTopCallback");
        assertNotNull("API 33+ must register with the platform dispatcher", callback);
        assertFalse("System Back must reach the registered callback, not the framework's legacy fallback",
                Class.forName("android.window.CompatOnBackInvokedCallback").isInstance(callback));
        pressBack(); settled();
        assertTrue(text().contains("DEMO · Fassadenkontrolle"));
        assertFalse(activity.isFinishing());
        pressBack(); settled();
        assertTrue(hasButton(R.string.erp_exit_demo));
        controller.pause().stop().destroy(); controller = null;
        assertNotSame("Destroyed Activity must not remain the registered Back destination", callback,
                ReflectionHelpers.callInstanceMethod(dispatcher, "getTopCallback"));
    }

    @Test @Config(sdk = 32) public void legacyBackKeyReturnsThroughDetailListAndDashboard() throws Exception {
        launch(); demo(); openTasks(); click(R.string.erp_view_details); settled();
        pressBack(); settled();
        assertTrue(text().contains("DEMO · Fassadenkontrolle"));
        assertFalse(activity.isFinishing());
        pressBack(); settled();
        assertTrue(hasButton(R.string.erp_exit_demo));
        assertFalse(activity.isFinishing());
    }

    @Test public void phoneScreensRenderWithAccessibleTouchTargets() throws Exception {
        launch(); screenshot("phone-login.png", 411, 891);
        demo(); screenshot("phone-dashboard.png", 411, 891);
        openTasks(); screenshot("phone-tasks.png", 411, 891);
        for (View view : views(root())) if (view instanceof Button b) assertTrue("Small touch target: " + b.getText(), b.getHeight() >= 48);
    }

    @Test @Config(qualifiers = "w800dp-h1280dp-mdpi") public void tabletAndLongUkrainianTextRender() throws Exception {
        NativeLocale.INSTANCE.choose(RuntimeEnvironment.getApplication(), "uk");
        launch(); demo(); screenshot("tablet-dashboard-uk.png", 800, 1280);
        openChat(); screenshot("tablet-chat-uk.png", 800, 1280);
        for (View view : views(root())) if (view instanceof EditText edit) assertTrue(edit.getWidth() > 0 && edit.getWidth() <= 800);
    }

    @Test public void workspaceSearchFiltersAndRestoresOnlyAuthorizedModules() throws Exception {
        launch(); RoleTransport transport = new RoleTransport("CLIENT", "customer.portal", "quote.read", "chat.read");
        signInFixture(transport);
        edit(R.string.erp_search).setText(activity.getString(R.string.erp_orders));
        assertTrue(hasButton(R.string.erp_orders));
        assertFalse(hasButton(R.string.erp_quotes));
        edit(R.string.erp_search).setText(activity.getString(R.string.erp_payroll));
        assertFalse(hasButton(R.string.erp_payroll));
        assertTrue(text().contains(activity.getString(R.string.erp_empty)));
        edit(R.string.erp_search).setText("");
        assertTrue(hasButton(R.string.erp_orders));
        assertTrue(hasButton(R.string.erp_quotes));
        assertFalse(hasButton(R.string.erp_payroll));
    }

    @Test @Config(qualifiers = "w320dp-h720dp-mdpi") public void narrowUkrainianAndDoubleSizeTextRemainReachable() throws Exception {
        RuntimeEnvironment.setFontScale(2f);
        NativeLocale.INSTANCE.choose(RuntimeEnvironment.getApplication(), "uk");
        launch(); screenshot("narrow-login-uk-font2.png", 320, 720);
        assertControlBounds(root(), 320);
        demo(); screenshot("narrow-dashboard-uk-font2.png", 320, 720);
        assertControlBounds(root(), 320);
        openTasks(); screenshot("narrow-tasks-uk-font2.png", 320, 720);
        assertControlBounds(root(), 320);
        pressBack(); settled(); openChat();
        screenshot("narrow-chat-uk-font2.png", 320, 720);
        assertControlBounds(root(), 320);
    }

    @Test public void workerScreenStartsWithGpsOffAndLabelsEveryInput() throws Exception {
        ActivityController<MainActivity> worker = Robolectric.buildActivity(MainActivity.class);
        try {
            worker.setup(); MainActivity screen = worker.get();
            ViewGroup content = screen.findViewById(android.R.id.content);
            screenshot(content, "phone-shift.png", 411, 891);
            assertControlBounds(content, 411);
            assertNull("Opening time tools must never start GPS", Shadows.shadowOf(RuntimeEnvironment.getApplication()).getNextStartedService());
            assertTrue(views(content).stream().anyMatch(v -> v instanceof TextView t && t.getText().toString().equals(screen.getString(R.string.status_off))));
            for (View v : views(content)) if (v instanceof EditText edit) {
                assertTrue("Every worker input has a visible label", views(content).stream().anyMatch(label -> label instanceof TextView && label.getLabelFor() == edit.getId()));
                assertFalse("Enrollment credentials must not enter view state", edit.isSaveEnabled());
            }
        } finally { worker.pause().stop().destroy(); }
    }

    @Test @Config(qualifiers = "w320dp-h720dp-mdpi") public void workerScreenSupportsDoubleSizeText() throws Exception {
        RuntimeEnvironment.setFontScale(2f);
        NativeLocale.INSTANCE.choose(RuntimeEnvironment.getApplication(), "uk");
        ActivityController<MainActivity> worker = Robolectric.buildActivity(MainActivity.class);
        try {
            worker.setup(); View content = worker.get().findViewById(android.R.id.content);
            screenshot(content, "narrow-shift-uk-font2.png", 320, 720);
            assertControlBounds(content, 320);
        } finally { worker.pause().stop().destroy(); }
    }

    private void assertControlBounds(View container, int width) {
        for (View view : views(container)) {
            if (view.getVisibility() != View.VISIBLE || !(view instanceof Button || view instanceof EditText)) continue;
            assertTrue("Control extends beyond screen width", view.getWidth() > 0 && view.getWidth() <= width);
            assertTrue("Touch target shorter than48dp", view.getHeight() >= 48);
            if (view instanceof Button button && button.getLayout() != null) {
                int available = button.getWidth() - button.getCompoundPaddingLeft() - button.getCompoundPaddingRight();
                for (int line = 0; line < button.getLayout().getLineCount(); line++) {
                    assertEquals("Button label is ellipsized: " + button.getText(), 0, button.getLayout().getEllipsisCount(line));
                    assertTrue("Button label exceeds its readable width: " + button.getText(), button.getLayout().getLineWidth(line) <= available + 1);
                }
            }
        }
    }

    private void screenshot(String name, int width, int height) throws Exception {
        screenshot(root(), name, width, height);
    }
    private void screenshot(View view, String name, int width, int height) throws Exception {
        view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        view.layout(0,0,width,height); Shadows.shadowOf(Looper.getMainLooper()).idle();
        Bitmap image = Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888); view.draw(new Canvas(image));
        File dir = new File(System.getProperty("knaba.screenshotDir", "build/qa")); assertTrue(dir.isDirectory() || dir.mkdirs());
        try (FileOutputStream out = new FileOutputStream(new File(dir,name))) { assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,out)); }
        image.recycle();
    }
}
