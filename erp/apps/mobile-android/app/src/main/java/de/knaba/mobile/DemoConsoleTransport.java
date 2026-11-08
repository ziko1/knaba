package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Explicit, memory-only UI demonstration. Never connects to any server, creates a
 * cookie, enrolls a device, records location, or claims an external delivery.
 * The activity must keep the DEMO notice visible and restrict entry to a test build.
 * This small scenario is not a substitute for the authoritative ERP domain engine.
 */
final class DemoConsoleTransport extends ErpConsoleTransport {
    static final String USER = "demo-employee";
    static final String COMPANY = "demo-company";
    static final String CHANNEL = "demo-channel-site";
    private final Map<String, LinkedHashMap<String, JSONObject>> records = new LinkedHashMap<>();
    private final Map<String, String> commandInputs = new LinkedHashMap<>();
    private final Map<String, JSONObject> receipts = new LinkedHashMap<>();
    private boolean signedIn;
    private int createdMessages;
    private int createdWorklogs;

    @Override synchronized void configure(String value) {
        // An accidental call with a live origin must never silently switch this adapter.
        throw new IllegalStateException("DEMO_ORIGIN_NOT_SUPPORTED");
    }

    @Override synchronized void clear() {
        signedIn = false;
        records.clear();
        commandInputs.clear();
        receipts.clear();
        createdMessages = 0;
        createdWorklogs = 0;
    }

    @Override synchronized boolean isSignedIn() { return signedIn; }
    @Override synchronized String origin() { return ""; }
    @Override synchronized boolean hasPendingCommand() { return false; }

    @Override synchronized JSONObject login(String email, String password, String otp) throws Exception {
        if (!empty(email) || !empty(password) || !empty(otp)) {
            throw new IllegalArgumentException("DEMO_CREDENTIALS_NOT_ACCEPTED");
        }
        clear();
        seed();
        signedIn = true;
        return me();
    }

    @Override synchronized JSONObject me() throws Exception {
        requireSession();
        return new JSONObject().put("actor", new JSONObject()
                .put("userId", USER).put("companyId", COMPANY)
                .put("roles", new JSONArray().put("EMPLOYEE").put("OPERATIONS_MANAGER"))
                .put("permissions", new JSONArray().put("site.read").put("task.read")
                        .put("task.work").put("order.manage").put("lead.read")
                        .put("chat.read").put("chat.write"))
                .put("siteIds", new JSONArray().put("demo-site-atrium").put("demo-site-park"))
                .put("warehouseIds", new JSONArray()).put("customerIds", new JSONArray()))
                .put("demo", true);
    }

    @Override synchronized JSONObject dashboard() throws Exception {
        requireSession();
        int open = 0, review = 0;
        for (JSONObject task : table("task").values()) {
            String state = task.getJSONObject("data").getString("state");
            if (state.equals("SUBMITTED_FOR_REVIEW")) review++;
            if (!state.equals("ACCEPTED") && !state.equals("CANCELLED")) open++;
        }
        JSONObject counts = new JSONObject();
        for (String kind : new String[]{"decision", "site", "task", "shift", "lead", "order", "material_request", "notification"}) {
            counts.put(kind, records.containsKey(kind) ? records.get(kind).size() : 0);
        }
        return new JSONObject().put("activeShifts", 0).put("activeSites", table("site").size())
                .put("openDecisions", 0).put("counts", counts).put("updatedAt", now())
                .put("openTasks", open).put("tasksAwaitingReview", review).put("demo", true);
    }

    @Override synchronized JSONArray entities(String kind) throws Exception {
        requireSession();
        if (!records.containsKey(kind) || kind.equals("message") || kind.equals("worklog")) {
            throw new Failure(403, "ACCESS_DENIED", false);
        }
        JSONArray result = new JSONArray();
        for (JSONObject item : table(kind).values()) result.put(copy(item));
        return result;
    }

    @Override synchronized JSONArray messages(String channel) throws Exception {
        requireSession();
        requireRecord("channel", channel);
        JSONArray result = new JSONArray();
        for (JSONObject item : table("message").values()) {
            if (channel.equals(item.getJSONObject("data").optString("channel_id"))) result.put(copy(item));
        }
        return result;
    }

    @Override synchronized JSONArray catalog() throws Exception {
        requireSession();
        JSONObject id = new JSONObject().put("type", "string").put("minLength", 1).put("maxLength", 200);
        JSONObject text = new JSONObject().put("type", "string").put("minLength", 1).put("maxLength", 4000);
        JSONObject quantity = new JSONObject().put("type", "integer").put("minimum", 0).put("maximum", 1000000000);
        return new JSONArray()
                .put(definition("task.start", "task.work", new JSONObject().put("taskId", id), "taskId"))
                .put(definition("task.worklog", "task.work", new JSONObject().put("taskId", id)
                        .put("quantityMilli", quantity).put("description", text), "taskId", "quantityMilli", "description"))
                .put(definition("task.submit", "task.work", new JSONObject().put("taskId", id)
                        .put("description", new JSONObject().put("type", "string").put("maxLength", 4000)), "taskId"));
    }

    @Override synchronized JSONObject command(String name, JSONObject input, Integer expectedVersion) throws Exception {
        return command(name, input, expectedVersion, UUID.randomUUID().toString());
    }

    @Override synchronized JSONObject command(String name, JSONObject input, Integer expectedVersion, String idempotencyKey) throws Exception {
        requireSession();
        if (input == null || expectedVersion != null && expectedVersion < 1) throw new Failure(400, "VALIDATION_ERROR", false);
        if (idempotencyKey == null || !idempotencyKey.matches("[A-Za-z0-9_-]{8,200}")) throw new IllegalArgumentException("INVALID_IDEMPOTENCY_KEY");
        String fingerprint = name + ":" + expectedVersion + ":" + canonical(input);
        if (receipts.containsKey(idempotencyKey)) {
            if (!fingerprint.equals(commandInputs.get(idempotencyKey))) throw new Failure(409, "IDEMPOTENCY_CONFLICT", false);
            return copy(receipts.get(idempotencyKey));
        }
        if (receipts.size() >= 250) throw new Failure(429, "DEMO_LIMIT_REACHED", false);
        JSONObject result = execute(name, input, expectedVersion);
        commandInputs.put(idempotencyKey, fingerprint);
        receipts.put(idempotencyKey, copy(result));
        return result;
    }

    private JSONObject execute(String name, JSONObject input, Integer expectedVersion) throws Exception {
        requireSession();
        if (input == null) throw new Failure(400, "VALIDATION_ERROR", false);
        if ("message.send".equals(name)) {
            exactKeys(input, "channel_id", "text", "language");
            String language = input.optString("language", "DE");
            if (!language.matches("DE|EN|PL|LT|RU|UK")) throw new Failure(400, "VALIDATION_ERROR", false);
            return addMessage(input.getString("channel_id"), input.getString("text"), language);
        }
        if (!"task.start".equals(name) && !"task.worklog".equals(name) && !"task.submit".equals(name)) {
            throw new Failure(403, "ACCESS_DENIED", false);
        }
        if (name.equals("task.start")) exactKeys(input, "taskId");
        else if (name.equals("task.worklog")) exactKeys(input, "taskId", "quantityMilli", "description");
        else exactKeys(input, "taskId", "description");
        JSONObject task = requireRecord("task", input.getString("taskId"));
        if (expectedVersion != null && expectedVersion != task.getInt("version")) {
            throw new Failure(409, "VERSION_CONFLICT", false);
        }
        JSONObject data = task.getJSONObject("data");
        String state = data.getString("state");
        if (name.equals("task.start")) {
            if (state.equals("IN_PROGRESS")) return copy(task);
            if (!state.equals("ASSIGNED") && !state.equals("REOPENED")) throw new Failure(409, "INVALID_STATE", false);
            data.put("state", "IN_PROGRESS").put("startedAt", now());
            touch(task);
            return copy(task);
        }
        if (!state.equals("IN_PROGRESS") && !state.equals("REOPENED")) throw new Failure(409, "INVALID_STATE", false);
        if (name.equals("task.submit")) {
            String description = input.optString("description", "");
            if (description.length() > 4000) throw new Failure(400, "VALIDATION_ERROR", false);
            data.put("state", "SUBMITTED_FOR_REVIEW").put("submittedAt", now())
                    .put("submittedBy", USER).put("submissionDescription", description);
            touch(task);
            return copy(task);
        }
        Object rawQuantity = input.get("quantityMilli");
        if (!(rawQuantity instanceof Number)) throw new Failure(400, "VALIDATION_ERROR", false);
        long quantity = ((Number) rawQuantity).longValue();
        if (((Number) rawQuantity).doubleValue() != quantity || quantity < 0 || quantity > 1000000000L) {
            throw new Failure(400, "VALIDATION_ERROR", false);
        }
        String description = input.getString("description").trim();
        if (description.isEmpty() || description.length() > 4000) throw new Failure(400, "VALIDATION_ERROR", false);
        if (createdWorklogs >= 100) throw new Failure(429, "DEMO_LIMIT_REACHED", false);
        JSONObject log = entity("worklog", "demo-log-" + UUID.randomUUID(), new JSONObject()
                .put("taskId", task.getString("id")).put("siteId", data.getString("siteId"))
                .put("quantityMilli", quantity).put("unit", data.getString("unit"))
                .put("description", description).put("authorId", USER).put("reportedAt", now()));
        table("worklog").put(log.getString("id"), log);
        createdWorklogs++;
        data.put("reportedQuantityMilli", data.getLong("reportedQuantityMilli") + quantity);
        touch(task);
        return copy(log);
    }

    @Override synchronized JSONObject sendMessage(String channel, String text) throws Exception {
        return sendMessage(channel, text, "DE", UUID.randomUUID().toString());
    }

    @Override synchronized JSONObject sendMessage(String channel, String text, String language, String idempotencyKey) throws Exception {
        String tag = language == null ? "" : language.toUpperCase(Locale.ROOT);
        if (text == null) throw new Failure(400, "INVALID_MESSAGE", false);
        return command("message.send", new JSONObject().put("channel_id", channel).put("text", text.trim()).put("language", tag), null, idempotencyKey);
    }

    @Override synchronized void logout() { clear(); }
    @Override synchronized Runnable detachSessionForLogout() { clear(); return () -> { }; }

    private JSONObject addMessage(String channel, String text, String language) throws Exception {
        requireRecord("channel", channel);
        if (text == null || text.trim().isEmpty() || text.length() > 12000) throw new Failure(400, "INVALID_MESSAGE", false);
        if (createdMessages >= 100) throw new Failure(429, "DEMO_LIMIT_REACHED", false);
        JSONObject result = entity("message", "demo-message-" + UUID.randomUUID(), new JSONObject()
                .put("channel_id", channel).put("text", text.trim()).put("language", language)
                .put("author_id", USER).put("source", "HUMAN").put("created_at", now())
                .put("delivery_status", "DEMO_LOCAL_ONLY"));
        table("message").put(result.getString("id"), result);
        createdMessages++;
        return copy(result);
    }

    private void seed() throws Exception {
        put("site", "demo-site-atrium", new JSONObject().put("name", "DEMO · Atrium")
                .put("code", "DEMO-01").put("address", "Fiktives Testobjekt · keine echte Adresse")
                .put("active", true).put("timeZone", "Europe/Berlin"));
        put("site", "demo-site-park", new JSONObject().put("name", "DEMO · Parkhaus")
                .put("code", "DEMO-02").put("address", "Fiktives Testobjekt · keine echte Adresse")
                .put("active", true).put("timeZone", "Europe/Berlin"));
        put("order", "demo-order-atrium", new JSONObject().put("name", "DEMO · Bauendreinigung")
                .put("siteId", "demo-site-atrium").put("status", "IN_PROGRESS")
                .put("description", "Testauftrag: Fenster und Eingangsbereich. Keine Kundenbestellung."));
        put("lead", "demo-lead-park", new JSONObject().put("name", "DEMO · Anfrage Parkhaus")
                .put("status", "NEW").put("description", "Fiktive Anfrage zur Funktionsprüfung. Kein Versand."));
        seedTask("demo-task-windows", "DEMO · Fenster reinigen", "ASSIGNED", 0);
        seedTask("demo-task-hall", "DEMO · Eingangsbereich reinigen", "IN_PROGRESS", 25000);
        seedTask("demo-task-facade", "DEMO · Fassadenkontrolle", "SUBMITTED_FOR_REVIEW", 50000);
        put("channel", CHANNEL, new JSONObject().put("name", "DEMO · Team Atrium")
                .put("type", "SITE_INTERNAL").put("site_id", "demo-site-atrium"));
        put("channel", "demo-channel-general", new JSONObject().put("name", "DEMO · Allgemein")
                .put("type", "COMPANY_GENERAL"));
        put("message", "demo-message-welcome", new JSONObject().put("channel_id", CHANNEL)
                .put("text", "DEMO: Aufgaben öffnen, Arbeit starten, Ergebnis erfassen und zur Prüfung einreichen. Nachrichten bleiben nur in dieser Testsitzung.")
                .put("language", "DE").put("author_id", "demo-guide").put("source", "HUMAN")
                .put("created_at", now()).put("delivery_status", "DEMO_LOCAL_ONLY"));
        table("worklog");
    }

    private void seedTask(String id, String title, String state, long reported) throws Exception {
        JSONObject data = new JSONObject().put("title", title).put("state", state)
                .put("description", "Fiktive Aufgabe für den lokalen Test. Keine echte Arbeitszeiterfassung.")
                .put("siteId", "demo-site-atrium").put("orderId", "demo-order-atrium")
                .put("assigneeIds", new JSONArray().put(USER)).put("dependencyIds", new JSONArray())
                .put("unit", "M2").put("plannedQuantityMilli", 50000).put("reportedQuantityMilli", reported)
                .put("acceptedQuantityMilli", 0).put("reviewCycle", 0).put("checklist", new JSONArray())
                .put("requiredPhotoCount", 0).put("completionKind", "ORIGINAL");
        if (state.equals("SUBMITTED_FOR_REVIEW")) data.put("submittedBy", USER).put("submittedAt", now());
        put("task", id, data);
    }

    private void requireSession() throws Failure {
        if (!signedIn) throw new Failure(401, "NEEDS_REAUTH", false);
    }
    private JSONObject requireRecord(String kind, String id) throws Failure {
        JSONObject item = id == null ? null : table(kind).get(id);
        if (item == null) throw new Failure(404, "NOT_FOUND_SAFE", false);
        return item;
    }
    private LinkedHashMap<String, JSONObject> table(String kind) {
        LinkedHashMap<String, JSONObject> value = records.get(kind);
        if (value == null) { value = new LinkedHashMap<>(); records.put(kind, value); }
        return value;
    }
    private void put(String kind, String id, JSONObject data) throws Exception { table(kind).put(id, entity(kind, id, data)); }
    private JSONObject entity(String kind, String id, JSONObject data) throws Exception {
        String time = now();
        return new JSONObject().put("id", id).put("companyId", COMPANY).put("kind", kind)
                .put("version", 1).put("createdAt", time).put("updatedAt", time).put("data", data).put("demo", true);
    }
    private void touch(JSONObject item) throws Exception { item.put("version", item.getInt("version") + 1).put("updatedAt", now()); }
    private JSONObject copy(JSONObject value) throws Exception { return new JSONObject(value.toString()); }
    private static String now() { return Instant.now().toString(); }
    private static boolean empty(String value) { return value == null || value.isEmpty(); }
    private void exactKeys(JSONObject input, String... allowed) throws Failure {
        for (Iterator<String> keys = input.keys(); keys.hasNext();) {
            String key = keys.next(); boolean found = false;
            for (String candidate : allowed) if (candidate.equals(key)) { found = true; break; }
            if (!found) throw new Failure(400, "VALIDATION_ERROR", false);
        }
    }
    private JSONObject definition(String name, String permission, JSONObject properties, String... required) throws Exception {
        JSONArray keys = new JSONArray(); for (String key : required) keys.put(key);
        return new JSONObject().put("name", name).put("permission", permission).put("highRisk", false)
                .put("schema", new JSONObject().put("type", "object").put("properties", properties)
                        .put("required", keys).put("additionalProperties", false));
    }
    private String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            List<String> keys = new ArrayList<>(); object.keys().forEachRemaining(keys::add); Collections.sort(keys);
            List<String> parts = new ArrayList<>();
            for (String key : keys) parts.add(JSONObject.quote(key) + ":" + canonical(object.get(key)));
            return "{" + String.join(",", parts) + "}";
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value; List<String> parts = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) parts.add(canonical(array.get(i)));
            return "[" + String.join(",", parts) + "]";
        }
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof String) return JSONObject.quote((String) value);
        return value.toString();
    }
}
