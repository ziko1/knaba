package de.knaba.mobile;

import java.net.HttpURLConnection;
import java.net.URL;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

/** Existing parser regression. No server, browser, device or secret persistence. */
public final class ErpFederationCookieTest {
    public static void main(String[] args) throws Exception {
        Method parse = ErpConsoleTransport.class.getDeclaredMethod("sessionCookie", HttpURLConnection.class);
        parse.setAccessible(true);
        String token = "KF3." + "a".repeat(43);
        HttpURLConnection connection = new HttpURLConnection(new URL("https://erp.example.invalid")) {
            public void connect() { }
            public void disconnect() { }
            public boolean usingProxy() { return false; }
            public Map<String,List<String>> getHeaderFields() {
                return Map.of("Set-Cookie", List.of("knaba_session=" + token + "; Path=/; Secure; HttpOnly; SameSite=Strict"));
            }
        };
        if (!token.equals(parse.invoke(null, connection))) throw new AssertionError("ERP parser must accept the exact KF3 session cookie format");
        System.out.println("PASS exact KF3 ERP cookie parser");
    }
}
