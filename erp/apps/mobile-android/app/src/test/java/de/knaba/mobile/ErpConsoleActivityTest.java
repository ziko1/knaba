package de.knaba.mobile;

import android.app.AlertDialog;
import android.content.res.XmlResourceParser;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Build;
import android.os.Looper;
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
    }
    private void launch() {
        controller = Robolectric.buildActivity(ErpConsoleActivity.class).setup();
        activity = controller.get();
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
        edit(R.string.erp_server).setText("https://fixture.invalid");
        edit(R.string.erp_email).setText("synthetic@example.invalid");
        edit(R.string.erp_password).setText("synthetic-only");
        click(R.string.erp_sign_in); await(() -> hasButton(R.string.erp_logout) && !busy());
    }

    /** Explicit HTTP-free control fixture for timing and failures; never used in APK. */
    private static class ControlledTransport extends ErpConsoleTransport {
        final DemoConsoleTransport demo = new DemoConsoleTransport();
        final CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        final AtomicInteger sendCalls = new AtomicInteger();
        volatile boolean blockTasks, blockSend, expired, quantityDefault;
        @Override void configure(String origin) { }
        @Override String origin() { return "https://fixture.invalid"; }
        @Override void clear() { demo.clear(); }
        @Override JSONObject login(String email, String password, String otp) throws Exception { return demo.login("", "", ""); }
        @Override JSONObject me() throws Exception { if (expired) throw new Failure(401,"NEEDS_REAUTH",false); return demo.me(); }
        @Override JSONObject dashboard() throws Exception { return demo.dashboard(); }
        @Override JSONArray entities(String kind) throws Exception {
            if (blockTasks && kind.equals("task")) { entered.countDown(); if (!release.await(4,TimeUnit.SECONDS)) throw new AssertionError("Unreleased task fixture"); }
            return demo.entities(kind);
        }
        @Override JSONArray messages(String channel) throws Exception { return demo.messages(channel); }
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
            if (blockSend) { entered.countDown(); if (!release.await(4,TimeUnit.SECONDS)) throw new AssertionError("Unreleased send fixture"); }
            return demo.sendMessage(channel,text,language,key);
        }
        @Override Runnable detachSessionForLogout() { return demo.detachSessionForLogout(); }
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
        edit(R.string.erp_server).setText("https://fixture.invalid");
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

    private void screenshot(String name, int width, int height) throws Exception {
        View view = root();
        view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        view.layout(0,0,width,height); Shadows.shadowOf(Looper.getMainLooper()).idle();
        Bitmap image = Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888); view.draw(new Canvas(image));
        File dir = new File(System.getProperty("knaba.screenshotDir", "build/qa")); assertTrue(dir.isDirectory() || dir.mkdirs());
        try (FileOutputStream out = new FileOutputStream(new File(dir,name))) { assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,out)); }
        image.recycle();
    }
}
