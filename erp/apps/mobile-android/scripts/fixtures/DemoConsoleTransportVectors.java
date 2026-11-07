package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;

/** Genuine JVM behavior checks for synthetic demo only, not backend acceptance. */
public final class DemoConsoleTransportVectors {
    private static int checks;
    private interface Operation { void run() throws Exception; }
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
        checks++;
    }
    private static void rejects(String code, Operation operation) throws Exception {
        try { operation.run(); throw new AssertionError("Expected " + code); }
        catch (Exception error) { check(code.equals(error.getMessage()), "Expected " + code + " but got " + error); }
    }
    private static JSONObject first(DemoConsoleTransport demo) throws Exception { return demo.entities("task").getJSONObject(0); }
    private static JSONObject input(String task) throws Exception { return new JSONObject().put("taskId", task); }

    public static void main(String[] args) throws Exception {
        URL.setURLStreamHandlerFactory(protocol -> new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) {
                throw new AssertionError("DEMO attempted network access: " + url.getProtocol());
            }
        });
        DemoConsoleTransport demo = new DemoConsoleTransport();
        rejects("NEEDS_REAUTH", demo::me);
        rejects("DEMO_CREDENTIALS_NOT_ACCEPTED", () -> demo.login("real@example.invalid", "secret", ""));
        check(!demo.isSignedIn(), "Credentials were not accepted");
        JSONObject session = demo.login("", "", "");
        check(session.getBoolean("demo") && !session.has("csrfToken"), "Explicit demo without real session");
        check(demo.origin().isEmpty(), "No backend origin");
        rejects("DEMO_ORIGIN_NOT_SUPPORTED", () -> demo.configure("https://example.invalid"));
        check(demo.dashboard().getInt("activeSites") == 2, "Correct site count");
        check(demo.dashboard().getJSONObject("counts").getInt("task") == 3, "Correct task count");
        check(demo.catalog().length() == 3, "Only supported task commands advertised");
        JSONObject initial = first(demo);
        String task = initial.getString("id");
        initial.getJSONObject("data").put("state", "ACCEPTED");
        check(first(demo).getJSONObject("data").getString("state").equals("ASSIGNED"), "Detached reads cannot mutate demo");
        rejects("INVALID_STATE", () -> demo.command("task.submit", input(task), 1));
        JSONObject started = demo.command("task.start", input(task), 1, "test-start-001");
        check(started.getInt("version") == 2 && started.getJSONObject("data").getString("state").equals("IN_PROGRESS"), "Start changes state/version");
        JSONObject duplicate = demo.command("task.start", input(task), 1, "test-start-001");
        check(duplicate.getInt("version") == 2 && first(demo).getInt("version") == 2, "Replay does not duplicate effect");
        rejects("IDEMPOTENCY_CONFLICT", () -> demo.command("task.start", input("demo-task-hall"), 1, "test-start-001"));
        JSONObject logInput = input(task).put("quantityMilli", 1250).put("description", "Synthetic measured result");
        demo.command("task.worklog", logInput, 2, "test-worklog-001");
        demo.command("task.worklog", new JSONObject().put("description", "Synthetic measured result").put("quantityMilli", 1250).put("taskId", task), 2, "test-worklog-001");
        check(first(demo).getInt("version") == 3 && first(demo).getJSONObject("data").getInt("reportedQuantityMilli") == 1250, "Worklog replay applies once irrespective of key order");
        rejects("VALIDATION_ERROR", () -> demo.command("task.worklog", input(task).put("quantityMilli", -1).put("description", "bad"), 3));
        rejects("VALIDATION_ERROR", () -> demo.command("task.worklog", input(task).put("quantityMilli", 1.5).put("description", "bad"), 3));
        rejects("VERSION_CONFLICT", () -> demo.command("task.submit", input(task), 1));
        check(first(demo).getInt("version") == 3, "Rejected operations leave task unchanged");
        JSONObject submitted = demo.command("task.submit", input(task).put("description", "For independent review"), 3);
        check(submitted.getJSONObject("data").getString("state").equals("SUBMITTED_FOR_REVIEW"), "Submit does not imply acceptance");
        rejects("ACCESS_DENIED", () -> demo.command("task.review", input(task).put("decision", "ACCEPT"), 4));
        check(demo.messages(DemoConsoleTransport.CHANNEL).length() == 1, "Seed message only");
        JSONObject sent = demo.sendMessage(DemoConsoleTransport.CHANNEL, "Local only", "uk", "test-message-001");
        check(sent.getJSONObject("data").getString("language").equals("UK"), "Selected language retained");
        check(sent.getJSONObject("data").getString("delivery_status").equals("DEMO_LOCAL_ONLY"), "No delivered claim");
        JSONObject sentAgain = demo.sendMessage(DemoConsoleTransport.CHANNEL, "Local only", "UK", "test-message-001");
        check(sent.getString("id").equals(sentAgain.getString("id")) && demo.messages(DemoConsoleTransport.CHANNEL).length() == 2, "Message replay saved once");
        rejects("IDEMPOTENCY_CONFLICT", () -> demo.sendMessage(DemoConsoleTransport.CHANNEL, "Different", "UK", "test-message-001"));
        check(demo.messages("demo-channel-general").length() == 0, "Channel separation");
        rejects("NOT_FOUND_SAFE", () -> demo.messages("missing-channel"));
        rejects("ACCESS_DENIED", () -> demo.entities("user"));
        rejects("INVALID_MESSAGE", () -> demo.sendMessage(DemoConsoleTransport.CHANNEL, " "));
        rejects("VALIDATION_ERROR", () -> demo.sendMessage(DemoConsoleTransport.CHANNEL, "bad language", "XX", "test-message-002"));
        Runnable oldLogout = demo.detachSessionForLogout();
        check(!demo.isSignedIn(), "Immediate local logout");
        rejects("NEEDS_REAUTH", () -> demo.entities("task"));
        demo.login("", "", "");
        oldLogout.run();
        check(demo.isSignedIn() && first(demo).getInt("version") == 1, "New demo survives stale logout and resets changes");
        check(demo.messages(DemoConsoleTransport.CHANNEL).length() == 1, "New demo clears user messages");
        for (int i = 0; i < 100; i++) demo.sendMessage(DemoConsoleTransport.CHANNEL, "Bounded local item " + i);
        rejects("DEMO_LIMIT_REACHED", () -> demo.sendMessage(DemoConsoleTransport.CHANNEL, "Beyond bound"));
        check(demo.messages(DemoConsoleTransport.CHANNEL).length() == 101, "Bounded store includes one seed");
        demo.logout();
        check(!demo.isSignedIn(), "Logout clears local state");
        System.out.println("PASS DemoConsoleTransport JVM checks=" + checks + "; no network, backend or device acceptance claimed");
    }
}
