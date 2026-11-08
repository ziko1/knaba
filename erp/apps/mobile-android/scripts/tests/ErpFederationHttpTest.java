package de.knaba.mobile;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Actual loopback HTTP using the production client; only the injected HTTPS-origin mapping is synthetic. */
public final class ErpFederationHttpTest {
    private static int cases;
    private static void check(boolean good,String message) { if(!good) throw new AssertionError(message); cases++; }
    static final class Server implements AutoCloseable {
        final HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        final ExecutorService workers=Executors.newFixedThreadPool(2);
        final AtomicReference<Throwable> failure=new AtomicReference<>();
        final List<String> paths=Collections.synchronizedList(new ArrayList<>());
        final List<String> candidateCookies=Collections.synchronizedList(new ArrayList<>());
        JSONObject start; volatile int tokenCount; boolean truncate, omitCookie;
        CountDownLatch candidateEntered,candidateRelease;
        Server() throws Exception { server.setExecutor(workers); server.createContext("/",this::handle); server.start(); }
        ErpConsoleTransport transport() {
            ErpConsoleTransport transport=new ErpConsoleTransport(url->{
                if(!url.getProtocol().equals("https") || !url.getHost().equals("erp.example.invalid") || url.getPort()!=-1 || url.getQuery()!=null)
                    throw new IOException("FIXTURE_ORIGIN_DENIED");
                return (HttpURLConnection)new URL("http://127.0.0.1:"+server.getAddress().getPort()+url.getPath()).openConnection();
            });
            transport.configure(ErpFederationLoginTest.ORIGIN); return transport;
        }
        void handle(HttpExchange exchange) {
            try {
                String path=exchange.getRequestURI().getPath(); paths.add(path); JSONObject body=new JSONObject();
                if(exchange.getRequestMethod().equals("POST")) {
                    byte[] bytes=exchange.getRequestBody().readNBytes(8193); check(bytes.length<=8192,"bounded actual request");
                    body=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                }
                JSONObject result;
                switch(path) {
                    case "/api/v1/auth/login":
                        result=ErpFederationLoginTest.profile("old-user"); exchange.getResponseHeaders().add("Set-Cookie",ErpFederationLoginTest.header(ErpFederationLoginTest.OLD)); break;
                    case "/api/v1/health": result=new JSONObject().put("ok",true).put("application","KNABA DE").put("apiVersion",1).put("mode","TEST"); break;
                    case "/api/v1/auth/federation/config": result=ErpFederationLoginTest.config(); break;
                    case "/api/v1/auth/federation/start":
                        noCookie(exchange); check(ErpFederationLoginTest.ORIGIN.equals(exchange.getRequestHeaders().getFirst("Origin")),"actual native start Origin");
                        check(exchange.getRequestHeaders().getFirst("Idempotency-Key")!=null,"actual start key"); start=body;
                        result=new JSONObject().put("requestId","12345678-1234-4234-8234-123456789abc")
                            .put("authorizationUrl",ErpFederationLoginTest.ORIGIN+"/auth/federation/authorize?request_id=12345678-1234-4234-8234-123456789abc")
                            .put("expiresAt",Instant.now().plusSeconds(300).toString()); break;
                    case "/api/v1/auth/federation/token":
                        noCookie(exchange); tokenCount++; check(tokenCount==1,"one actual token request");
                        check(ErpFederationLoginTest.ORIGIN.equals(exchange.getRequestHeaders().getFirst("Origin")),"actual token Origin");
                        check(ErpFederationLogin.challenge(body.getString("codeVerifier")).equals(start.getString("codeChallenge")),"actual S256 body binding");
                        check(body.getString("code").equals("K3C."+"k".repeat(43)),"actual one-use callback code");
                        if(!omitCookie) exchange.getResponseHeaders().add("Set-Cookie",ErpFederationLoginTest.header(ErpFederationLoginTest.NEW));
                        if(truncate) {
                            exchange.getResponseHeaders().add("Content-Type","application/json"); exchange.sendResponseHeaders(200,500);
                            exchange.getResponseBody().write("{".getBytes(StandardCharsets.UTF_8)); exchange.close(); return;
                        }
                        result=ErpFederationLoginTest.profile("new-user").put("expiresAt",Instant.now().plusSeconds(3600).toString()); break;
                    case "/api/v1/me":
                        String cookie=exchange.getRequestHeaders().getFirst("Cookie"); candidateCookies.add(cookie==null?"":cookie);
                        check(("knaba_session="+ErpFederationLoginTest.NEW).equals(cookie),"actual /me uses only response candidate");
                        if(candidateEntered!=null) { candidateEntered.countDown(); check(candidateRelease.await(3,TimeUnit.SECONDS),"release owned HTTP latch"); }
                        result=ErpFederationLoginTest.profile("new-user"); break;
                    case "/api/v1/dashboard":
                        result=new JSONObject().put("cookieWasOld",("knaba_session="+ErpFederationLoginTest.OLD).equals(exchange.getRequestHeaders().getFirst("Cookie"))); break;
                    default: throw new AssertionError("Unexpected exact fixture path");
                }
                byte[] response=result.toString().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type","application/json"); exchange.sendResponseHeaders(200,response.length);
                exchange.getResponseBody().write(response); exchange.close();
            } catch(Throwable error) {
                failure.compareAndSet(null,error); try { exchange.sendResponseHeaders(500,-1); } catch(IOException ignored) { } exchange.close();
            }
        }
        void noCookie(HttpExchange request) {
            check(request.getRequestHeaders().getFirst("Cookie")==null,"actual native ceremony has no app/browser cookie");
            check(request.getRequestHeaders().getFirst("Authorization")==null,"no bearer/device grant");
        }
        ErpFederationLogin code(ErpConsoleTransport transport) throws Exception {
            ErpFederationLogin flow=transport.federationLogin(true); flow.discover(); flow.start("site");
            check(flow.callback(ErpFederationLogin.REDIRECT+"?code=K3C."+"k".repeat(43)+"&state="+start.getString("state")+"&iss="+
                URLEncoder.encode(ErpFederationLoginTest.ORIGIN+"/auth/federation",StandardCharsets.UTF_8)),"actual start response→bound callback"); return flow;
        }
        public void close() { server.stop(0); workers.shutdownNow(); if(failure.get()!=null)throw new AssertionError("HTTP fixture failed",failure.get()); }
    }
    public static void main(String[] args) throws Exception {
        try(Server server=new Server()) {
            ErpConsoleTransport transport=server.transport(); transport.login("old@example.invalid","synthetic",null);
            ErpFederationLogin flow=server.code(transport); flow.redeem();
            check(flow.phase()==ErpFederationLogin.Phase.VERIFIED && transport.dashboard().getBoolean("cookieWasOld"),"actual HTTP proof stays staged before UI adoption"); transport=flow.adopt().transport;
            check(flow.phase()==ErpFederationLogin.Phase.ADOPTED && flow.adoptedProfile().getJSONObject("actor").getString("userId").equals("new-user"),"actual HTTP new session adopted");
        }
        for(boolean missing:List.of(false,true)) try(Server server=new Server()) {
            server.truncate=true; server.omitCookie=missing;
            ErpConsoleTransport transport=server.transport(); transport.login("old@example.invalid","synthetic",null); ErpFederationLogin flow=server.code(transport);
            try { flow.redeem(); throw new AssertionError("truncated body accepted as complete"); } catch(ErpConsoleTransport.Failure expected) { check(true,"actual truncated reply fails safely"); }
            check(transport.dashboard().getBoolean("cookieWasOld"),"actual lost response preserves old transport cookie");
            if(missing) check(flow.phase()==ErpFederationLogin.Phase.RESTART_REQUIRED && server.candidateCookies.isEmpty(),"no new Set-Cookie means no /me proof");
            else {
                check(flow.phase()==ErpFederationLogin.Phase.RECOVERABLE,"actual headers retained before truncated body"); flow.recover(); transport=flow.adopt().transport;
                check(flow.phase()==ErpFederationLogin.Phase.ADOPTED,"actual read-only candidate recovery");
            }
            check(server.tokenCount==1,"actual unknown reply never redeems twice");
        }
        try(Server server=new Server()) {
            server.candidateEntered=new CountDownLatch(1); server.candidateRelease=new CountDownLatch(1);
            ErpConsoleTransport transport=server.transport(); transport.login("old@example.invalid","synthetic",null); ErpFederationLogin flow=server.code(transport);
            AtomicReference<Throwable> error=new AtomicReference<>(); Thread worker=new Thread(()->{try{flow.redeem();}catch(Throwable ex){error.set(ex);}}); worker.start();
            check(server.candidateEntered.await(3,TimeUnit.SECONDS),"actual candidate response pending"); flow.cancel(); server.candidateRelease.countDown(); worker.join(3000);
            check(!worker.isAlive() && error.get() instanceof ErpConsoleTransport.Failure,"cancel fences actual in-flight candidate response");
            check(transport.dashboard().getBoolean("cookieWasOld"),"actual cancel never swaps or clears old session");
        }
        System.out.println("PASS federation actual loopback HTTP: "+cases+" assertions, 4 scenarios; origin mapping is injected, no ERP/browser/device claim");
    }
}
