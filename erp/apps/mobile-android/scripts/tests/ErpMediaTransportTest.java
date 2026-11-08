package de.knaba.mobile;

import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Actual native transport with an explicit HTTP connection double, not a live media service. */
public final class ErpMediaTransportTest {
    private static int checks;
    private static void check(boolean value,String label) { if(!value)throw new AssertionError(label);checks++; }
    private interface Action { void run() throws Exception; }
    private static ErpConsoleTransport.Failure fails(String code,Action action) throws Exception {
        try { action.run();throw new AssertionError("Expected "+code); }
        catch(ErpConsoleTransport.Failure error) { check(code.equals(error.code),"safe expected error "+code+", received "+error.code);return error; }
    }
    private static final String CSRF="c".repeat(43);
    private static JSONObject actor() throws Exception {
        return new JSONObject().put("userId","user-1").put("companyId","company-1").put("roles",new JSONArray().put("WORKER"))
            .put("permissions",new JSONArray().put("media.upload").put("media.read").put("task.read")).put("siteIds",new JSONArray().put("site-1"));
    }
    private static String identity(JSONObject actor) throws Exception { return new JSONObject().put("actor",actor).put("csrfToken",CSRF).toString(); }
    private static String catalog() throws Exception {
        JSONObject properties=new JSONObject().put("uploadId",new JSONObject().put("type","string")).put("siteId",new JSONObject().put("type","string"))
            .put("stage",new JSONObject().put("type","string").put("enum",new JSONArray(List.of("BEFORE","AFTER","DEFECT","MATERIALS","DOCUMENT"))))
            .put("visibility",new JSONObject().put("type","string").put("enum",new JSONArray(List.of("INTERNAL","CLIENT_AFTER_APPROVAL","CONFIDENTIAL"))))
            .put("caption",new JSONObject().put("type","string").put("maxLength",2000))
            .put("retentionPurpose",new JSONObject().put("type","string").put("minLength",3).put("maxLength",2000));
        return new JSONObject().put("items",new JSONArray().put(new JSONObject().put("name","media.register").put("permission","media.upload")
            .put("schema",new JSONObject().put("type","object").put("properties",properties)))).toString();
    }
    private static JSONObject input() throws Exception {
        return new JSONObject().put("siteId","site-1").put("taskId","task-1").put("stage","AFTER").put("visibility","INTERNAL").put("caption","Evidence").put("retentionPurpose","Task evidence");
    }
    private static String page(JSONObject item) throws Exception { return new JSONObject().put("items",new JSONArray().put(item)).put("has_more",false).toString(); }
    private static void preflight(ErpConsoleTransportTest.Queue queue) throws Exception {
        queue.add(identity(actor())); queue.add(catalog());
        queue.add(page(new JSONObject().put("id","task-1").put("kind","task").put("companyId","company-1").put("version",2).put("data",new JSONObject().put("siteId","site-1"))));
    }
    private static String receipt(int size) throws Exception {
        return new JSONObject().put("uploadId","a".repeat(64)).put("byteSize",size).put("metadataStripped",false).put("scanState","CLEAN").toString();
    }
    private static JSONObject entity() throws Exception {
        return new JSONObject().put("id","asset-1").put("kind","media_asset").put("companyId","company-1").put("version",1)
            .put("data",input().put("uploadId","a".repeat(64)).put("state","RECEIVED"));
    }
    private static ErpMedia.FileData file() throws Exception { return new ErpMedia.FileData("%PDF-1.7 synthetic bounded test".getBytes(java.nio.charset.StandardCharsets.US_ASCII),"evidence.pdf"); }
    private static final class Journal implements ErpMedia.Journal {
        final ErpMedia.MemoryJournal memory=new ErpMedia.MemoryJournal(); boolean failSave,failRemove;
        public List<ErpMedia.Record> read(String scope)throws Exception{return memory.read(scope);}
        public void save(ErpMedia.Record record)throws Exception{if(failSave)throw new IOException("PRIVATE_STORAGE_ERROR");memory.save(record);}
        public void remove(String scope,String key)throws Exception{if(failRemove)throw new IOException("PRIVATE_STORAGE_ERROR");memory.remove(scope,key);}
    }
    private static ErpConsoleTransport signed(ErpConsoleTransportTest.Queue queue,ErpMedia.Journal media,ErpConsoleTransport.Journal commands)throws Exception {
        ErpConsoleTransportTest.Fake login=queue.login();login.response=identity(actor());
        ErpConsoleTransport api=new ErpConsoleTransport(queue,commands,media);api.configure("https://erp.example.invalid");api.login("worker@example.invalid","fixture-password","");return api;
    }
    public static void main(String[] args) throws Exception {
        ErpConsoleTransportTest.Queue queue = new ErpConsoleTransportTest.Queue();
        queue.login();
        ErpConsoleTransport api = new ErpConsoleTransport(queue);
        api.configure("https://erp.example.invalid");
        api.login("worker@example.invalid", "fixture-password", "");
        byte[] bytes = new byte[80 * 1024];
        byte[] header = "%PDF-1.7".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        System.arraycopy(header, 0, bytes, 0, header.length);
        JSONObject body = new JSONObject().put("base64", Base64.getEncoder().encodeToString(bytes))
            .put("mimeType", "application/pdf").put("fileName", "evidence.pdf").put("redactionConfirmed", false);
        ErpConsoleTransportTest.Fake upload = queue.add("{\"uploadId\":\"00000000-0000-4000-8000-000000000001\",\"byteSize\":81920,\"metadataStripped\":false,\"scanState\":\"CLEAN\"}");
        ErpMedia.Upload typed=new ErpMedia.Upload(new ErpMedia.FileData(bytes,"evidence.pdf"),"evidence.pdf",false);
        api.uploadMedia(typed, "00000000-0000-4000-8000-000000000002", api.sessionRevision());
        check("00000000-0000-4000-8000-000000000002".equals(upload.getRequestProperty("Idempotency-Key")),"canonical media key header");
        check(ErpMedia.canonical(body).equals(ErpMedia.canonical(upload.body())),"media payload above generic cap remains exact");
        check(upload.sent.size()==typed.length(),"fixed Content-Length equals exact streamed JSON bytes");
        int opened=queue.urls.size();
        fails("REQUEST_TOO_LARGE",()->api.command("task.create",new JSONObject().put("title","x".repeat(66000)),null,"large-generic-command"));
        check(opened==queue.urls.size(),"ordinary command request limit remains unchanged");
        fails("INVALID_IDEMPOTENCY_KEY",()->api.uploadMedia(typed,"space forbidden",api.sessionRevision()));
        check(opened==queue.urls.size(),"invalid key never opens a connection");
        fails("MEDIA_UNSUPPORTED",()->new ErpMedia.FileData("HEIC or arbitrary file".getBytes(),"photo.heic"));
        byte[] tooBig=new byte[ErpMedia.IMAGE_BYTES+1];tooBig[0]=(byte)255;tooBig[1]=(byte)216;tooBig[2]=(byte)255;
        fails("MEDIA_TOO_LARGE",()->ErpMedia.read(new ByteArrayInputStream(tooBig),"huge.jpg"));
        check(ErpMedia.pathComponent("a/b?copy=original#x").equals("a%2Fb%3Fcopy%3Doriginal%23x"),"media identifier is one encoded path component");

        ErpConsoleTransportTest.Queue recoveryQueue=new ErpConsoleTransportTest.Queue();Journal journal=new Journal();
        ErpConsoleTransportTest.Journal commandJournal=new ErpConsoleTransportTest.Journal();
        ErpConsoleTransport recovery=signed(recoveryQueue,journal,commandJournal);
        ErpConsoleTransport.MediaTicket ticket=recovery.mediaTicket();ErpMedia.FileData selected=file();
        preflight(recoveryQueue);ErpMedia.Record record=recovery.prepareMedia(ticket,input(),selected,false);
        String saved=journal.read(ticket.scope).get(0).json().toString();
        check(!saved.contains("base64")&&!saved.contains("knaba_session")&&!saved.contains("fixture-password")&&!saved.contains("content://"),"encrypted descriptor has no file bytes, URI or credentials");
        JSONObject changedInput=input();changedInput.put("caption","Changed after snapshot");
        check(record.input().getString("caption").equals("Evidence"),"prepared input is a defensive immutable snapshot");
        preflight(recoveryQueue);ErpConsoleTransportTest.Fake unknown=recoveryQueue.add(receipt(selected.size()));unknown.failRead=true;
        check(fails("NETWORK_ERROR",()->recovery.uploadMedia(ticket,record,selected)).outcomeUnknown,"submitted upload timeout remains unknown");
        int unknownCalls=recoveryQueue.urls.size();
        check(journal.read(ticket.scope).get(0).key().equals(record.key()),"unknown upload retains original key before I/O");
        check(recoveryQueue.urls.size()==unknownCalls,"no automatic retry after upload timeout");
        ErpMedia.FileData changed=new ErpMedia.FileData("%PDF-1.7 DIFFERENT".getBytes(),"evidence.pdf");
        fails("MEDIA_RESELECT_MISMATCH",()->recovery.uploadMedia(ticket,record,changed));
        check(recoveryQueue.urls.size()==unknownCalls,"different reselected bytes never use or replace original key");
        preflight(recoveryQueue);ErpConsoleTransportTest.Fake retried=recoveryQueue.add(receipt(selected.size()));
        ErpConsoleTransport.MediaProgress uploaded=recovery.uploadMedia(ticket,record,selected);
        check(uploaded.record.phase().equals("UPLOADED")&&!uploaded.recoveryPending,"confirmed upload is explicitly unregistered");
        check(unknown.sent.toString().equals(retried.sent.toString())&&unknown.getRequestProperty("Idempotency-Key").equals(retried.getRequestProperty("Idempotency-Key")),"manual upload retry keeps exact body and key");
        preflight(recoveryQueue);ErpConsoleTransportTest.Fake registerUnknown=recoveryQueue.add(entity().toString());registerUnknown.failRead=true;
        fails("NETWORK_ERROR",()->recovery.registerMedia(ticket,uploaded.record));
        check(recovery.hasNativeMediaPending()&&recovery.pendingCommand()==null,"typed media pending is never exposed as a generic editable command");
        check(new JSONObject(commandJournal.records.values().iterator().next()).getBoolean("nativeMedia"),"local encrypted envelope records the native media marker");
        check(!registerUnknown.body().has("nativeMedia")&&registerUnknown.body().keySet().equals(Set.of("input","idempotency_key")),"recovery marker is absent from the exact API wire body");
        int beforeGeneric=recoveryQueue.urls.size();
        fails("MEDIA_RECOVERY_REQUIRED",()->recovery.command("media.register",uploaded.record.registerInput(),null,"fresh-key-must-not-bypass"));
        check(beforeGeneric==recoveryQueue.urls.size(),"generic editor cannot replace typed unknown registration with a fresh key");
        ErpConsoleTransportTest.Queue missingQueue=new ErpConsoleTransportTest.Queue();
        ErpConsoleTransport missing=signed(missingQueue,new ErpMedia.MemoryJournal(),commandJournal);
        check(missing.isSignedIn()&&missing.hasNativeMediaPending()&&missing.pendingCommand()==null,"missing descriptor blocks media recovery without exposing old inputs or disabling the account");
        fails("MEDIA_RECOVERY_INVALID",()->missing.mediaRecords(missing.mediaTicket()));
        fails("MEDIA_RECOVERY_AUTHORITY_CHANGED",()->missing.command("media.register",uploaded.record.registerInput(),null,"missing-descriptor-new-key"));
        missingQueue.add("{\"counts\":{}}");missing.dashboard();
        check(missingQueue.urls.size()==2,"read-only dashboard remains usable with blocked media recovery");
        ErpConsoleTransportTest.Queue changedQueue=new ErpConsoleTransportTest.Queue();
        ErpConsoleTransportTest.Fake changedLogin=changedQueue.login();
        changedLogin.response=identity(actor().put("permissions",new JSONArray().put("task.read")));
        ErpConsoleTransport changedAuthority=new ErpConsoleTransport(changedQueue,commandJournal,journal);
        changedAuthority.configure("https://erp.example.invalid");changedAuthority.login("worker@example.invalid","fixture-password","");
        check(changedAuthority.isSignedIn()&&changedAuthority.pendingCommand()==null&&changedAuthority.hasNativeMediaPending(),"same-user new authority cannot recover private old media command inputs");
        fails("MEDIA_RECOVERY_INVALID",()->changedAuthority.mediaRecords(changedAuthority.mediaTicket()));
        preflight(recoveryQueue);ErpConsoleTransportTest.Fake registerRetry=recoveryQueue.add(entity().toString());
        commandJournal.failRemove=true;
        ErpConsoleTransport.MediaProgress registered=recovery.registerMedia(ticket,uploaded.record);
        check(registered.record.phase().equals("REGISTERED")&&registered.record.assetId().equals("asset-1"),"only acknowledged media.register becomes registered");
        check(registered.recoveryPending&&recovery.hasNativeMediaPending(),"command-journal cleanup failure retains the known ACK and an independent local recovery warning");
        check(registerUnknown.sent.toString().equals(registerRetry.sent.toString()),"unknown registration retries exact original body/key");
        check(!registerRetry.body().has("expected_version"),"creation does not invent an optimistic version");
        check(recoveryQueue.urls.stream().filter(url->url.getPath().equals("/api/v1/media/uploads")).count()==2,"registration recovery never uploads bytes again");
        int acknowledgedCalls=recoveryQueue.urls.size();commandJournal.failRemove=false;journal.failRemove=true;
        try { recovery.checkpointMedia(ticket,registered.record);throw new AssertionError("Expected media cleanup failure"); } catch(IOException expected) { }
        check(commandJournal.records.isEmpty()&&journal.read(ticket.scope).get(0).phase().equals("REGISTERED"),"known receipt survives a media cleanup failure after the command journal is gone");
        fails("MEDIA_RECOVERY_REQUIRED",()->recovery.command("media.register",registered.record.registerInput(),null,"known-ack-fresh-key-bypass"));
        journal.failRemove=false;recovery.checkpointMedia(ticket,registered.record);
        check(acknowledgedCalls==recoveryQueue.urls.size(),"known registration ACK cleanup performs no network replay");
        check(journal.read(ticket.scope).isEmpty()&&commandJournal.records.isEmpty(),"acknowledged registration resolves both recovery journals");

        preflight(recoveryQueue);ErpMedia.Record storageRecord=recovery.prepareMedia(ticket,input(),selected,false);
        preflight(recoveryQueue);ErpConsoleTransportTest.Fake storageAck=recoveryQueue.add(receipt(selected.size()));
        storageAck.entered=new CountDownLatch(1);storageAck.release=new CountDownLatch(1);
        AtomicReference<ErpConsoleTransport.MediaProgress> storedProgress=new AtomicReference<>();AtomicReference<Throwable> asyncError=new AtomicReference<>();
        Thread storageThread=new Thread(()->{try{storedProgress.set(recovery.uploadMedia(ticket,storageRecord,selected));}catch(Throwable error){asyncError.set(error);}});storageThread.start();
        check(storageAck.entered.await(2,TimeUnit.SECONDS),"upload reached response boundary");journal.failSave=true;storageAck.release.countDown();storageThread.join(2500);
        check(asyncError.get()==null&&storedProgress.get()!=null&&storedProgress.get().recoveryPending&&storedProgress.get().record.phase().equals("UPLOADED"),"storage failure after ACK preserves known upload and separate warning");
        journal.failSave=false;
        recovery.checkpointMedia(ticket,storedProgress.get().record);
        int beforeDescriptorBypass=recoveryQueue.urls.size();
        fails("MEDIA_RECOVERY_REQUIRED",()->recovery.command("media.register",storedProgress.get().record.registerInput(),null,"descriptor-fresh-key-bypass"));
        check(beforeDescriptorBypass==recoveryQueue.urls.size(),"known upload descriptor cannot be bypassed through generic registration even without a generic pending command");
        ErpConsoleTransportTest.Queue restartQueue=new ErpConsoleTransportTest.Queue();ErpConsoleTransport restarted=signed(restartQueue,journal,commandJournal);
        ErpMedia.Record restored=restarted.mediaRecords(restarted.mediaTicket()).get(0);
        check(restored.key().equals(storageRecord.key())&&restored.uploadId().equals("a".repeat(64)),"new same-authority session restores confirmed receipt without bytes");
        check(!restored.registerKey().equals(restored.key()),"upload and registration use separate durable keys");
        JSONObject forbiddenReplacement=restored.json();forbiddenReplacement.getJSONObject("input").put("caption","replacement");
        fails("MEDIA_RECOVERY_CONFLICT",()->journal.save(new ErpMedia.Record(forbiddenReplacement)));

        ErpConsoleTransportTest.Queue raceQueue=new ErpConsoleTransportTest.Queue();Journal raceJournal=new Journal();
        ErpConsoleTransport race=signed(raceQueue,raceJournal,new ErpConsoleTransportTest.Journal());
        ErpConsoleTransport.MediaTicket oldTicket=race.mediaTicket();preflight(raceQueue);ErpMedia.Record raceRecord=race.prepareMedia(oldTicket,input(),selected,false);
        preflight(raceQueue);ErpConsoleTransportTest.Fake delayed=raceQueue.add(receipt(selected.size()));delayed.entered=new CountDownLatch(1);delayed.release=new CountDownLatch(1);
        AtomicReference<Throwable> raceError=new AtomicReference<>();Thread request=new Thread(()->{try{race.uploadMedia(oldTicket,raceRecord,selected);}catch(Throwable error){raceError.set(error);}});request.start();
        check(delayed.entered.await(2,TimeUnit.SECONDS),"delayed upload started");race.clear();delayed.release.countDown();request.join(2500);
        check(raceError.get() instanceof ErpConsoleTransport.Failure&&((ErpConsoleTransport.Failure)raceError.get()).code.equals("ACCESS_CHANGED"),"old upload response cannot restore private state after logout");
        check(raceJournal.read(oldTicket.scope).get(0).uploadId().isEmpty(),"stale callback did not store another authority's ACK");
        int beforeRace=raceQueue.urls.size();fails("ACCESS_CHANGED",()->race.mediaPreflight(oldTicket,input()));
        check(beforeRace==raceQueue.urls.size(),"stale picker ticket cannot start a fresh preflight");

        ErpConsoleTransportTest.Queue cancelledQueue=new ErpConsoleTransportTest.Queue();Journal cancelledJournal=new Journal();
        ErpConsoleTransport cancelled=signed(cancelledQueue,cancelledJournal,new ErpConsoleTransportTest.Journal());
        ErpConsoleTransport.MediaTicket beforeSend=cancelled.mediaTicket();cancelled.cancelMediaTicket(beforeSend);
        fails("MEDIA_CANCELLED",()->cancelled.prepareMedia(beforeSend,input(),selected,false));
        check(cancelledQueue.urls.size()==1&&cancelledJournal.read(beforeSend.scope).isEmpty()&&cancelled.isSignedIn(),"cancel before submit sends nothing and leaves account/GPS authority untouched");
        ErpConsoleTransport.MediaTicket duringSend=cancelled.mediaTicket();preflight(cancelledQueue);ErpMedia.Record cancelRecord=cancelled.prepareMedia(duringSend,input(),selected,false);
        preflight(cancelledQueue);ErpConsoleTransportTest.Fake cancelReply=cancelledQueue.add(receipt(selected.size()));cancelReply.entered=new CountDownLatch(1);cancelReply.release=new CountDownLatch(1);
        AtomicReference<Throwable> cancellationError=new AtomicReference<>();Thread cancelThread=new Thread(()->{try{cancelled.uploadMedia(duringSend,cancelRecord,selected);}catch(Throwable error){cancellationError.set(error);}});cancelThread.start();
        check(cancelReply.entered.await(2,TimeUnit.SECONDS),"cancel fixture reached sent request boundary");cancelled.cancelMediaTicket(duringSend);cancelReply.release.countDown();cancelThread.join(2500);
        check(cancellationError.get() instanceof ErpConsoleTransport.Failure&&((ErpConsoleTransport.Failure)cancellationError.get()).outcomeUnknown,"cancel after send cannot claim rollback");
        check(cancelledJournal.read(duringSend.scope).get(0).key().equals(cancelRecord.key()),"cancel after send preserves exact original descriptor/key");

        ErpConsoleTransportTest.Queue boundaryQueue=new ErpConsoleTransportTest.Queue();Journal boundaryMedia=new Journal();
        ErpConsoleTransportTest.Journal boundaryCommands=new ErpConsoleTransportTest.Journal();AtomicReference<Runnable> afterPersist=new AtomicReference<>();
        ErpConsoleTransport boundary=signed(boundaryQueue,boundaryMedia,new ErpConsoleTransport.Journal(){
            public String read(String scope)throws Exception{return boundaryCommands.read(scope);}
            public void write(String scope,String envelope)throws Exception{boundaryCommands.write(scope,envelope);Runnable action=afterPersist.get();if(action!=null)action.run();}
            public void remove(String scope,String key)throws Exception{boundaryCommands.remove(scope,key);}
        });
        ErpConsoleTransport.MediaTicket boundaryTicket=boundary.mediaTicket();
        ErpMedia.Record boundaryRecord=ErpMedia.Record.create(boundaryTicket.scope,boundaryTicket.authority,input(),selected,false).uploaded(new JSONObject(receipt(selected.size())));
        boundaryMedia.save(boundaryRecord);afterPersist.set(()->boundary.cancelMediaTicket(boundaryTicket));preflight(boundaryQueue);
        check(!fails("MEDIA_CANCELLED",()->boundary.registerMedia(boundaryTicket,boundaryRecord)).outcomeUnknown,"cancellation after journal persistence but before send is a known local stop");
        check(boundaryQueue.urls.stream().noneMatch(url->url.getPath().equals("/api/v1/commands/media.register"))&&boundary.isSignedIn(),"final ticket guard prevents the cancelled registration connection without signing out");
        check(boundaryMedia.read(boundaryTicket.scope).get(0).registerKey().equals(boundaryRecord.registerKey()),"cancel-before-send retains the original typed recovery key");

        ErpConsoleTransportTest.Queue downloadQueue=new ErpConsoleTransportTest.Queue();ErpConsoleTransport download=signed(downloadQueue,new Journal(),new ErpConsoleTransportTest.Journal());
        ErpConsoleTransport.MediaTicket downloadTicket=download.mediaTicket();
        downloadQueue.add(identity(actor()));downloadQueue.add(page(entity()));
        ErpConsoleTransportTest.Fake binary=downloadQueue.add("%PDF-1.7 authorised client copy");binary.headers.put("Content-Type",List.of("application/pdf"));
        ErpConsoleTransport.MediaFile downloaded=download.mediaFile(downloadTicket,"asset-1",1);
        check(downloaded.mimeType.equals("application/pdf")&&new String(downloaded.bytes).equals(binary.response),"authenticated client-copy download works without Content-Length");
        check(downloadQueue.urls.get(downloadQueue.urls.size()-1).toString().equals("https://erp.example.invalid/api/v1/media/asset-1/file?copy=client"),"download uses only canonical own-origin client-copy path");
        check(binary.getRequestProperty("Cookie")!=null&&!binary.getInstanceFollowRedirects()&&binary.disconnected,"binary download keeps isolated in-memory auth and forbids redirects");
        downloadQueue.add(identity(actor()));downloadQueue.add(page(entity().put("companyId","foreign-company")));
        fails("ACCESS_CHANGED",()->download.mediaFile(downloadTicket,"asset-1",1));
        check(downloadQueue.urls.get(downloadQueue.urls.size()-1).getPath().equals("/api/v1/entities/media_asset"),"foreign company response is rejected before any private file request");
        downloadQueue.add(identity(actor()));downloadQueue.add(page(entity()));
        ErpConsoleTransportTest.Fake wrongMime=downloadQueue.add("%PDF-1.7 data");wrongMime.headers.put("Content-Type",List.of("text/html"));
        fails("INVALID_RESPONSE",()->download.mediaFile(downloadTicket,"asset-1",1));
        downloadQueue.add(identity(actor()));downloadQueue.add(page(entity()));
        ErpConsoleTransportTest.Fake redirect=downloadQueue.add("");redirect.status=302;
        fails("REDIRECT_BLOCKED",()->download.mediaFile(downloadTicket,"asset-1",1));

        ErpConsoleTransportTest.Queue legacyQueue=new ErpConsoleTransportTest.Queue();ErpConsoleTransport legacy=signed(legacyQueue,new Journal(),new ErpConsoleTransportTest.Journal());
        ErpConsoleTransportTest.Fake legacyUnknown=legacyQueue.add("{}");legacyUnknown.failRead=true;
        fails("NETWORK_ERROR",()->legacy.command("media.register",new JSONObject().put("uploadId","legacy-other-source"),null,"legacy-media-key"));
        check(legacy.pendingCommand()!=null&&!legacy.hasNativeMediaPending(),"legacy generic registration without a typed descriptor preserves its existing recovery contract");
        System.out.println("PASS media transport/recovery: "+checks+" assertions; explicit HTTP doubles, no live service");
    }
}
