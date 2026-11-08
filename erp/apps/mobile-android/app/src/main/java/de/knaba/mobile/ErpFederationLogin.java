package de.knaba.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** One RAM-only browser ceremony. Never uses the current app cookie as redemption evidence. */
final class ErpFederationLogin {
    static final String CLIENT_ID = "knaba-android-test-v1";
    static final String REDIRECT = "de.knaba.mobile.test:/auth/federation/callback";
    static final long RECOVERY_MS = 120_000;
    private static final int MAX_JSON = 65_536;
    enum Phase { NEW, DISCOVERING, UNAVAILABLE, READY, STARTING, BROWSER, CALLBACK, REDEEMING, RECOVERABLE, CHECKING, VERIFIED, ADOPTED, RESTART_REQUIRED, CANCELLED }
    interface Clock { long wall(); long elapsed(); }
    static final Clock SYSTEM_CLOCK = new Clock() {
        public long wall() { return System.currentTimeMillis(); }
        public long elapsed() { return System.nanoTime()/1_000_000; }
    };
    static final class Authority {
        final String id, label, siteOrigin;
        Authority(String id,String label,String siteOrigin) { this.id=id; this.label=label; this.siteOrigin=siteOrigin; }
    }
    static final class Configuration {
        final String issuer;
        final List<Authority> authorities;
        Configuration(String issuer,List<Authority> authorities) { this.issuer=issuer; this.authorities=List.copyOf(authorities); }
        Authority authority(String id) { for (Authority value:authorities) if(value.id.equals(id)) return value; return null; }
    }
    static final class Adoption {
        final ErpConsoleTransport transport;
        final JSONObject profile;
        Adoption(ErpConsoleTransport transport,JSONObject profile) { this.transport=transport; this.profile=profile; }
    }
    private final ErpConsoleTransport owner;
    private final ErpConsoleTransport.ConnectionFactory connections;
    private final ErpConsoleTransport.FederationBinding binding;
    private final boolean testBuild;
    private final Clock clock;
    private Phase phase=Phase.NEW;
    private String error="", verifier="", state="", code="", candidate="", authorizationUrl="";
    private String candidateUser="",candidateCompany="";
    private long deadline, candidateDeadline, adoptionRevision;
    private Configuration configuration;
    private JSONObject result;
    private JSONObject verifiedProfile;
    private ErpConsoleTransport adoptedTransport;
    private boolean callbackClaimed;
    private boolean browserLaunched;
    private boolean workPending;

    ErpFederationLogin(ErpConsoleTransport owner,ErpConsoleTransport.ConnectionFactory connections,
            ErpConsoleTransport.FederationBinding binding,boolean testBuild,Clock clock) {
        this.owner=owner; this.connections=connections; this.binding=binding; this.testBuild=testBuild; this.clock=clock;
        deadline=clock.elapsed()+300_000;
    }
    Phase phase() { synchronized(owner) { expireIfNeeded(); return phase; } }
    String errorCode() { synchronized(owner) { return error; } }
    List<Authority> authorities() { synchronized(owner) { return configuration==null?List.of():configuration.authorities; } }
    String authorizationUrl() throws Exception { synchronized(owner) { require(); need(phase==Phase.BROWSER,"FEDERATION_RESTART_REQUIRED"); return authorizationUrl; } }
    void cancel() { synchronized(owner) { phase=Phase.CANCELLED; error=""; scrub(); result=null; adoptedTransport=null; owner.forgetFederation(this); } }
    JSONObject adoptedProfile() throws Exception {
        synchronized(owner) {
            if(phase!=Phase.ADOPTED || adoptedTransport==null || !adoptedTransport.federationAdoptionCurrent(adoptionRevision)) return null;
            return result==null?null:new JSONObject(result.toString());
        }
    }
    boolean takeCallback() { synchronized(owner) { expireIfNeeded(); if(phase!=Phase.CALLBACK || callbackClaimed) return false; callbackClaimed=true; return true; } }
    String takeBrowserLaunch() throws Exception { synchronized(owner) { require(); if(phase!=Phase.BROWSER || browserLaunched) return null; browserLaunched=true; return authorizationUrl; } }
    void browserUnavailable() { failed(problem("FEDERATION_BROWSER_UNAVAILABLE"),false); }
    boolean reserveWork() { synchronized(owner) { if(workPending) return false; workPending=true; return true; } }
    void finishWork() { synchronized(owner) { workPending=false; } }
    boolean workPending() { synchronized(owner) { return workPending; } }
    void requireAdoption() throws ErpConsoleTransport.Failure { require(); }
    private boolean terminal() { return phase==Phase.CANCELLED||phase==Phase.RESTART_REQUIRED||phase==Phase.UNAVAILABLE||phase==Phase.ADOPTED; }
    private void scrub() { verifier=""; state=""; code=""; candidate=""; authorizationUrl=""; candidateUser=""; candidateCompany=""; verifiedProfile=null; binding.forget(); }
    private void expireIfNeeded() {
        if(terminal()) return;
        try { require(); }
        catch(Exception denied) { phase=Phase.RESTART_REQUIRED; error=safeCode(denied); scrub(); }
    }
    private void require() throws ErpConsoleTransport.Failure {
        need(!terminal(),"FEDERATION_RESTART_REQUIRED");
        owner.requireFederation(this,binding);
        need(clock.elapsed()<deadline,"FEDERATION_EXPIRED");
        if(!candidate.isEmpty()) need(clock.elapsed()<candidateDeadline,"FEDERATION_EXPIRED");
    }
    private void current() throws ErpConsoleTransport.Failure { synchronized(owner) { require(); } }
    private void begin(Phase expected,Phase next) throws Exception {
        synchronized(owner) { require(); need(phase==expected,"FEDERATION_IN_PROGRESS"); phase=next; error=""; }
    }
    private void failed(Exception exception,boolean recoverable) {
        synchronized(owner) {
            if(phase==Phase.CANCELLED || phase==Phase.ADOPTED) return;
            verifiedProfile=null;
            error=safeCode(exception);
            try { require(); }
            catch(Exception stale) { error=safeCode(stale); recoverable=false; }
            if(recoverable && !candidate.isEmpty()) phase=Phase.RECOVERABLE;
            else { phase=Phase.RESTART_REQUIRED; scrub(); }
        }
    }
    private static String safeCode(Exception error) {
        return error instanceof ErpConsoleTransport.Failure ? ((ErpConsoleTransport.Failure)error).code : "FEDERATION_INVALID_RESPONSE";
    }
    private static ErpConsoleTransport.Failure problem(String code) { return new ErpConsoleTransport.Failure(0,code,false); }
    private static void need(boolean accepted,String code) throws ErpConsoleTransport.Failure { if(!accepted) throw problem(code); }

    void discover() throws Exception {
        begin(Phase.NEW,Phase.DISCOVERING);
        try {
            if(!testBuild) { synchronized(owner) { phase=Phase.UNAVAILABLE; } return; }
            checkTestMode();
            Configuration found=parseConfiguration(exchange("/api/v1/auth/federation/config",null,null,null,false),binding.origin,true);
            synchronized(owner) { require(); configuration=found; phase=found==null?Phase.UNAVAILABLE:Phase.READY; }
        } catch(Exception error) { failed(error,false); throw error; }
    }
    private void checkTestMode() throws Exception {
        JSONObject health=exchange("/api/v1/health",null,null,null,false);
        need(Boolean.TRUE.equals(health.opt("ok")) && "KNABA DE".equals(health.optString("application")) &&
            health.opt("apiVersion") instanceof Number && ((Number)health.opt("apiVersion")).doubleValue()==1 &&
            "TEST".equals(health.optString("mode")),"FEDERATION_UNAVAILABLE");
    }
    static Configuration parseConfiguration(JSONObject source,String origin,boolean testBuild) throws Exception {
        try { return configurationDto(source,origin,testBuild); }
        catch(ErpConsoleTransport.Failure known) { throw known; }
        catch(Exception invalid) { throw problem("FEDERATION_INVALID_CONFIG"); }
    }
    private static boolean text(Object value,int max) {
        return value instanceof String && !((String)value).isEmpty() && ((String)value).length()<=max &&
            !java.util.regex.Pattern.compile("[\\x00-\\x1f\\x7f]").matcher((String)value).find();
    }
    private static boolean identifier(Object value) { return value instanceof String && ((String)value).matches("[A-Za-z0-9_-]{1,64}"); }
    private static String siteOrigin(String value) throws Exception {
        need(text(value,512),"FEDERATION_INVALID_CONFIG"); URI url=new URI(value);
        need("https".equals(url.getScheme()) && url.getHost()!=null && url.getRawUserInfo()==null && url.getRawQuery()==null &&
            url.getRawFragment()==null && (url.getRawPath()==null || url.getRawPath().isEmpty()) &&
            (url.getPort()==-1 || url.getPort()>0 && url.getPort()<=65535),"FEDERATION_INVALID_CONFIG");
        String canonical="https://"+url.getHost().toLowerCase(Locale.ROOT)+(url.getPort()==-1||url.getPort()==443?"":":"+url.getPort());
        need(canonical.equals(value),"FEDERATION_INVALID_CONFIG"); return value;
    }
    private static void keys(JSONObject object,String... keys) throws Exception {
        Set<String> expected=new HashSet<>(List.of(keys));
        need(object.length()==expected.size(),"FEDERATION_INVALID_CONFIG");
        java.util.Iterator<String> names=object.keys(); while(names.hasNext()) need(expected.contains(names.next()),"FEDERATION_INVALID_CONFIG");
    }
    private static Configuration configurationDto(JSONObject source,String origin,boolean testBuild) throws Exception {
        if(!testBuild) return null;
        if(Boolean.FALSE.equals(source.opt("enabled"))) { keys(source,"enabled"); return null; }
        need(Boolean.TRUE.equals(source.opt("enabled")),"FEDERATION_INVALID_CONFIG");
        keys(source,"enabled","authorizationIssuer","clients","authorities");
        String issuer=origin+"/auth/federation";
        need(issuer.equals(source.opt("authorizationIssuer")),"FEDERATION_INVALID_CONFIG");
        JSONArray clients=source.optJSONArray("clients"), authorities=source.optJSONArray("authorities");
        need(clients!=null && clients.length()>0 && clients.length()<=16 && authorities!=null && authorities.length()>0 && authorities.length()<=8,"FEDERATION_INVALID_CONFIG");
        Set<String> ids=new HashSet<>(); boolean supported=false;
        for(int i=0;i<clients.length();i++) {
            JSONObject client=clients.getJSONObject(i);
            need(identifier(client.opt("clientId")) && text(client.opt("label"),80),"FEDERATION_INVALID_CONFIG");
            String id=client.getString("clientId"); need(ids.add(id),"FEDERATION_INVALID_CONFIG");
            if("NATIVE".equals(client.opt("kind"))) {
                keys(client,"clientId","kind","platform","label","redirectUri");
                need(("ANDROID".equals(client.opt("platform"))||"IOS".equals(client.opt("platform"))) && text(client.opt("redirectUri"),2048),"FEDERATION_INVALID_CONFIG");
            } else {
                keys(client,"clientId","kind","platform","label");
                need("WEB".equals(client.opt("kind")) && "WEB".equals(client.opt("platform")),"FEDERATION_INVALID_CONFIG");
            }
            if(CLIENT_ID.equals(id)) {
                need("NATIVE".equals(client.opt("kind")) && "ANDROID".equals(client.opt("platform")) && REDIRECT.equals(client.opt("redirectUri")),"FEDERATION_INVALID_CONFIG");
                supported=true;
            }
        }
        if(!supported) return null;
        List<Authority> result=new ArrayList<>(); ids.clear();
        for(int i=0;i<authorities.length();i++) {
            JSONObject authority=authorities.getJSONObject(i); keys(authority,"authorityId","label","siteOrigin");
            need(identifier(authority.opt("authorityId")) && text(authority.opt("label"),253) && authority.opt("siteOrigin") instanceof String,"FEDERATION_INVALID_CONFIG");
            String id=authority.getString("authorityId"),label=authority.getString("label"); need(ids.add(id),"FEDERATION_INVALID_CONFIG");
            String site=siteOrigin(authority.getString("siteOrigin"));
            need(site.equals(authority.getString("siteOrigin")) && label.equals(URI.create(site).getHost()),"FEDERATION_INVALID_CONFIG");
            result.add(new Authority(id,label,site));
        }
        return new Configuration(issuer,result);
    }
    void start(String authorityId) throws Exception {
        begin(Phase.READY,Phase.STARTING);
        try {
            Authority selected=configuration.authority(authorityId);
            need(selected!=null,"FEDERATION_INVALID_CONFIG");
            checkTestMode();
            Configuration fresh=parseConfiguration(exchange("/api/v1/auth/federation/config",null,null,null,false),binding.origin,testBuild);
            need(fresh!=null && fresh.authority(authorityId)!=null && fresh.authority(authorityId).siteOrigin.equals(selected.siteOrigin),"FEDERATION_UNAVAILABLE");
            final JSONObject body;
            synchronized(owner) {
                require(); verifier=random(); state=random();
                body=new JSONObject().put("authorityId",authorityId).put("clientId",CLIENT_ID).put("redirectUri",REDIRECT)
                    .put("state",state).put("codeChallenge",challenge(verifier)).put("codeChallengeMethod","S256");
            }
            // One explicit start, one stable body/key. No automatic retry on an uncertain response.
            JSONObject response=exchange("/api/v1/auth/federation/start",body,UUID.randomUUID().toString(),null,false);
            String id=response.optString("requestId");
            need(id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"),"FEDERATION_INVALID_RESPONSE");
            String expected=configuration.issuer+"/authorize?request_id="+id;
            need(expected.equals(response.opt("authorizationUrl")),"FEDERATION_INVALID_RESPONSE");
            synchronized(owner) {
                require(); deadline=Math.min(deadline,expires(response.getString("expiresAt"),300_000));
                require(); authorizationUrl=expected; phase=Phase.BROWSER;
            }
        } catch(Exception error) { failed(error,false); throw error; }
    }
    boolean callback(String address) {
        synchronized(owner) {
            try {
                require(); if(phase!=Phase.BROWSER) return false;
                code=parseCallback(address,state,configuration.issuer); authorizationUrl=""; phase=Phase.CALLBACK; return true;
            } catch(Exception rejected) { expireIfNeeded(); return false; }
        }
    }
    static String parseCallback(String address,String state,String issuer) throws Exception {
        need(address!=null && address.length()<=2048 && address.startsWith(REDIRECT+"?"),"FEDERATION_CALLBACK_INVALID");
        URI uri=new URI(address);
        need(uri.getRawAuthority()==null && uri.getRawFragment()==null && "/auth/federation/callback".equals(uri.getRawPath()) && "de.knaba.mobile.test".equals(uri.getScheme()),"FEDERATION_CALLBACK_INVALID");
        Map<String,String> values=new HashMap<>();
        for(String pair:uri.getRawQuery().split("&",-1)) {
            int equals=pair.indexOf('='); need(equals>0,"FEDERATION_CALLBACK_INVALID");
            String key=pair.substring(0,equals);
            need(Set.of("code","state","iss").contains(key) && !values.containsKey(key),"FEDERATION_CALLBACK_INVALID");
            values.put(key,URLDecoder.decode(pair.substring(equals+1),StandardCharsets.UTF_8.name()));
        }
        need(values.size()==3 && issuer.equals(values.get("iss")) && values.get("code").matches("K3C\\.[A-Za-z0-9_-]{43}") &&
            values.get("state").matches("[A-Za-z0-9_-]{43}") && MessageDigest.isEqual(state.getBytes(StandardCharsets.US_ASCII),values.get("state").getBytes(StandardCharsets.US_ASCII)),"FEDERATION_CALLBACK_INVALID");
        return values.get("code");
    }
    static String challenge(String verifier) throws Exception {
        need(verifier.matches("[A-Za-z0-9._~-]{43,128}"),"FEDERATION_INVALID_PKCE");
        return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
    }
    private static String random() { byte[] bytes=new byte[32]; new SecureRandom().nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }

    void redeem() throws Exception {
        begin(Phase.CALLBACK,Phase.REDEEMING);
        JSONObject body;
        synchronized(owner) { require(); body=new JSONObject().put("grantType","authorization_code").put("clientId",CLIENT_ID).put("redirectUri",REDIRECT).put("code",code).put("codeVerifier",verifier); }
        JSONObject profile;
        try {
            profile=exchange("/api/v1/auth/federation/token",body,null,null,true);
        } catch(Exception error) { failed(error,true); throw error; }
        finally { synchronized(owner) { code=""; verifier=""; state=""; } }
        try {
            validateProfile(profile);
            synchronized(owner) {
                require(); need(!candidate.isEmpty(),"FEDERATION_COOKIE_INVALID");
                candidateDeadline=Math.min(candidateDeadline,expires(profile.getString("expiresAt"),RECOVERY_MS));
                candidateUser=profile.getJSONObject("actor").getString("userId"); candidateCompany=profile.getJSONObject("actor").getString("companyId");
                require(); phase=Phase.RECOVERABLE;
            }
        } catch(Exception error) { failed(error,false); throw error; }
        recover();
    }
    void recover() throws Exception {
        begin(Phase.RECOVERABLE,Phase.CHECKING);
        try {
            final String onlyCandidate;
            synchronized(owner) { require(); need(!candidate.isEmpty(),"FEDERATION_RESTART_REQUIRED"); onlyCandidate=candidate; }
            JSONObject profile=exchange("/api/v1/me",null,null,onlyCandidate,false);
            validateProfile(profile);
            synchronized(owner) {
                require();
                need(candidateUser.isEmpty() || candidateUser.equals(profile.getJSONObject("actor").getString("userId")) &&
                    candidateCompany.equals(profile.getJSONObject("actor").getString("companyId")),"FEDERATION_INVALID_PROFILE");
                // Network completion is not adoption. The foreground UI still owns Cancel and its old actor.
                verifiedProfile=new JSONObject(profile.toString()); phase=Phase.VERIFIED; error="";
            }
        } catch(Exception error) {
            boolean retry=error instanceof IOException || error instanceof ErpConsoleTransport.Failure &&
                (((ErpConsoleTransport.Failure)error).status>=500 || ((ErpConsoleTransport.Failure)error).status==429 ||
                Set.of("NETWORK_ERROR","RECOVERY_STORAGE_UNAVAILABLE").contains(((ErpConsoleTransport.Failure)error).code));
            failed(error,retry); throw error;
        }
    }
    /** Final synchronous boundary: the main thread calls this immediately before replacing its actor projection. */
    Adoption adopt() throws Exception {
        synchronized(owner) {
            try {
                require(); need(phase==Phase.VERIFIED && verifiedProfile!=null,"FEDERATION_RESTART_REQUIRED");
                JSONObject complete=new JSONObject(verifiedProfile.toString()), output=new JSONObject(verifiedProfile.toString());
                adoptedTransport=owner.adoptFederation(this,binding,candidate,complete);
                adoptionRevision=adoptedTransport.federationAuthorityRevision();
                result=complete; phase=Phase.ADOPTED; error=""; scrub(); return new Adoption(adoptedTransport,output);
            } catch(Exception error) { failed(error,"RECOVERY_STORAGE_UNAVAILABLE".equals(safeCode(error))); throw error; }
        }
    }
    static void validateProfile(JSONObject value) throws Exception {
        JSONObject actor=value.optJSONObject("actor");
        need("TEST".equals(value.opt("mode")) && value.opt("csrfToken") instanceof String && value.getString("csrfToken").matches("[A-Za-z0-9_-]{30,100}") && actor!=null,"FEDERATION_INVALID_PROFILE");
        for(String name:new String[]{"userId","companyId"})
            need(actor.opt(name) instanceof String && !actor.getString(name).isEmpty() && actor.getString(name).length()<=128,"FEDERATION_INVALID_PROFILE");
        for(String name:new String[]{"roles","permissions","siteIds","warehouseIds","customerIds"}) {
            JSONArray array=actor.optJSONArray(name); need(array!=null && array.length()<=4096,"FEDERATION_INVALID_PROFILE");
            for(int i=0;i<array.length();i++) need(array.opt(i) instanceof String && !array.getString(i).isEmpty() && array.getString(i).length()<=200,"FEDERATION_INVALID_PROFILE");
        }
    }
    private long expires(String instant,long cap) throws Exception {
        long remaining=Instant.parse(instant).toEpochMilli()-clock.wall();
        need(remaining>0,"FEDERATION_EXPIRED"); return clock.elapsed()+Math.min(remaining,cap);
    }
    private void tokenHeaders(HttpURLConnection http) throws Exception {
        synchronized(owner) {
            require(); String raw=null; int count=0;
            Map<String,List<String>> headers=http.getHeaderFields();
            if(headers!=null) for(Map.Entry<String,List<String>> entry:headers.entrySet()) {
                if(!"Set-Cookie".equalsIgnoreCase(entry.getKey()) || entry.getValue()==null) continue;
                for(String value:entry.getValue()) {
                    if(value==null) continue;
                    java.util.regex.Matcher cookies=java.util.regex.Pattern.compile("(?i)(?:^|[,;]\\s*)knaba_session\\s*=").matcher(value);
                    while(cookies.find()) { count++; raw=value; }
                }
            }
            need(count==1 && raw!=null && raw.length()<=4096 && !raw.contains("\r") && !raw.contains("\n"),"FEDERATION_COOKIE_INVALID");
            String[] parts=raw.split(";",-1);
            need(parts[0].matches("knaba_session=KF3\\.[A-Za-z0-9_-]{43}"),"FEDERATION_COOKIE_INVALID");
            String token=parts[0].substring("knaba_session=".length());
            need(!token.equals(binding.cookie),"FEDERATION_COOKIE_INVALID");
            Map<String,String> attrs=new HashMap<>();
            for(int i=1;i<parts.length;i++) {
                String part=parts[i].trim(); int equal=part.indexOf('=');
                String name=(equal<0?part:part.substring(0,equal)).toLowerCase(Locale.ROOT);
                need(!attrs.containsKey(name),"FEDERATION_COOKIE_INVALID"); attrs.put(name,equal<0?"":part.substring(equal+1));
            }
            need(attrs.containsKey("secure") && attrs.get("secure").isEmpty() && attrs.containsKey("httponly") && attrs.get("httponly").isEmpty() &&
                "/".equals(attrs.get("path")) && "strict".equalsIgnoreCase(attrs.get("samesite")) && !attrs.containsKey("domain"),"FEDERATION_COOKIE_INVALID");
            long bound=clock.elapsed()+RECOVERY_MS;
            if(attrs.containsKey("max-age")) {
                need(attrs.get("max-age").matches("[0-9]{1,10}"),"FEDERATION_COOKIE_INVALID");
                long seconds=Long.parseLong(attrs.get("max-age")); need(seconds>0,"FEDERATION_EXPIRED");
                bound=Math.min(bound,clock.elapsed()+Math.min(seconds,120)*1000);
            }
            if(attrs.containsKey("expires")) {
                long remaining=ZonedDateTime.parse(attrs.get("expires"),DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli()-clock.wall();
                need(remaining>0,"FEDERATION_EXPIRED"); bound=Math.min(bound,clock.elapsed()+Math.min(remaining,RECOVERY_MS));
            }
            candidateDeadline=Math.min(deadline,bound); candidate=token;
        }
    }
    private JSONObject exchange(String path,JSONObject body,String key,String candidateCookie,boolean token) throws Exception {
        current();
        need(!binding.origin.isEmpty() && binding.origin.equals(ErpOriginPolicy.origin(binding.origin)),"INVALID_ORIGIN");
        byte[] bytes=body==null?null:body.toString().getBytes(StandardCharsets.UTF_8);
        need(bytes==null || bytes.length<=8192,"REQUEST_TOO_LARGE");
        HttpURLConnection http=null;
        try {
            http=connections.open(new URL(binding.origin+path)); current();
            http.setInstanceFollowRedirects(false); http.setUseCaches(false); http.setConnectTimeout(15_000); http.setReadTimeout(15_000);
            http.setRequestProperty("Accept","application/json");
            if(candidateCookie!=null) http.setRequestProperty("Cookie","knaba_session="+candidateCookie);
            if(bytes!=null) {
                http.setRequestMethod("POST"); http.setDoOutput(true); http.setFixedLengthStreamingMode(bytes.length);
                http.setRequestProperty("Origin",binding.origin); http.setRequestProperty("Content-Type","application/json");
                if(key!=null) http.setRequestProperty("Idempotency-Key",key);
                current(); try(OutputStream out=http.getOutputStream()) { current(); out.write(bytes); } current();
            }
            int status=http.getResponseCode(); current();
            if(status>=300 && status<400) throw new ErpConsoleTransport.Failure(status,"REDIRECT_BLOCKED",false);
            if(status==200 && token) tokenHeaders(http); // Capture only this response before a body can be lost.
            if(status!=200) throw new ErpConsoleTransport.Failure(status,status==401?"NEEDS_REAUTH":status==403?"ACCESS_DENIED":status==429?"RATE_LIMITED":status==409?"FEDERATION_CONFLICT":"FEDERATION_UNAVAILABLE",false);
            ByteArrayOutputStream buffer=new ByteArrayOutputStream();
            try(InputStream in=http.getInputStream()) {
                if(in==null) throw problem("FEDERATION_INVALID_RESPONSE");
                byte[] chunk=new byte[8192]; int count;
                while(true) { current(); count=in.read(chunk); current(); if(count<0) break;
                    need(buffer.size()+count<=MAX_JSON,"RESPONSE_TOO_LARGE"); buffer.write(chunk,0,count); }
            }
            current();
            try { return new JSONObject(buffer.toString(StandardCharsets.UTF_8.name())); }
            catch(org.json.JSONException invalid) { throw problem("FEDERATION_INVALID_RESPONSE"); }
        } catch(IOException unknown) { current(); throw problem("NETWORK_ERROR"); }
        finally { if(http!=null) http.disconnect(); }
    }
}
