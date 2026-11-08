package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Arrays;
import java.util.Locale;

/** Credentials use explicit one-shot commands; arbitrary recovery input must not contain secrets. */
final class ErpCommandSecrets {
    private ErpCommandSecrets() {}
    static boolean isOneShot(String name) { return "user.password.rotate".equals(name) || "user.mfa.configure".equals(name); }
    static boolean sensitiveKey(String key) {
        String value=key.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]","");
        if (value.equals("key")) return true;
        for (String part:Arrays.asList("password","passphrase","secret","token","credential","privatekey","apikey","encryptionkey","signingkey","authorization","cookie","csrf","otp","totp","bearer"))
            if (value.contains(part)) return true;
        return false;
    }
    static boolean containsSecret(Object value) throws ErpConsoleTransport.Failure { return containsSecret(value,0); }
    private static boolean containsSecret(Object value,int depth) throws ErpConsoleTransport.Failure {
        if (depth>24) throw invalid();
        if (value instanceof JSONObject) {
            JSONObject object=(JSONObject)value;
            if (object.length()>256) throw invalid();
            var keys=object.keys();
            while (keys.hasNext()) {
                String key=keys.next();
                if (key.length()>200) throw invalid();
                if (sensitiveKey(key) || containsSecret(object.opt(key),depth+1)) return true;
            }
        } else if (value instanceof JSONArray) {
            JSONArray array=(JSONArray)value;
            if (array.length()>2000) throw invalid();
            for (int i=0;i<array.length();i++) if (containsSecret(array.opt(i),depth+1)) return true;
        }
        return false;
    }
    static void validateOneShot(String name,JSONObject input) throws ErpConsoleTransport.Failure {
        Object password=input.opt("currentPassword");
        if (!(password instanceof String) || ((String)password).isEmpty() || ((String)password).length()>128) throw invalid();
        if ("user.password.rotate".equals(name)) {
            Object next=input.opt("newPassword");
            if (input.length()!=2 || !(next instanceof String) || ((String)next).length()<8 || ((String)next).length()>128) throw invalid();
        } else if ("user.mfa.configure".equals(name)) {
            Object secret=input.opt("secret"),otp=input.opt("otp");
            if (input.length()!=3 || !(secret instanceof String) || !((String)secret).matches("[A-Z2-7]{16,100}") ||
                !(otp instanceof String) || !((String)otp).matches("[0-9]{6}")) throw invalid();
        } else throw new ErpConsoleTransport.Failure(0,"SENSITIVE_COMMAND",false);
    }
    private static ErpConsoleTransport.Failure invalid() { return new ErpConsoleTransport.Failure(0,"INVALID_COMMAND",false); }
}
