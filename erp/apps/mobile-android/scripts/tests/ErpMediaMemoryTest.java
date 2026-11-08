package de.knaba.mobile;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Runs separately under -Xmx96m. The HTTP sink retains no request body and no network is used. */
public final class ErpMediaMemoryTest {
    static final class Generated extends InputStream {
        final int length; final byte[] header; int position; boolean first=true;
        Generated(int length,byte[] header) { this.length=length;this.header=header; }
        @Override public int read() { if(position>=length)return -1;return position<header.length?header[position++]&255:(position++>=0?0:-1); }
        @Override public int read(byte[] target,int offset,int count) {
            if(position>=length)return -1;
            count=Math.min(count,length-position);
            if(first) { count=Math.min(count,5);first=false; } // Partial initial header must still select the image bound.
            Arrays.fill(target,offset,offset+count,(byte)0);
            for(int i=0;i<count&&position+i<header.length;i++)target[offset+i]=header[position+i];
            position+=count;return count;
        }
    }
    static final class Sink extends HttpURLConnection {
        long received;int declared;boolean disconnected;final MessageDigest digest;
        Sink()throws Exception { super(new URL("https://erp.example.invalid/api/v1/media/uploads"));digest=MessageDigest.getInstance("SHA-256"); }
        public void connect(){} public boolean usingProxy(){return false;} public void disconnect(){disconnected=true;}
        @Override public void setFixedLengthStreamingMode(int size){declared=size;super.setFixedLengthStreamingMode(size);}
        @Override public OutputStream getOutputStream(){return new OutputStream(){
            public void write(int b){digest.update((byte)b);received++;}
            public void write(byte[] bytes,int offset,int count){digest.update(bytes,offset,count);received+=count;}
        };}
        @Override public int getResponseCode(){return 200;}
        @Override public InputStream getInputStream(){return new ByteArrayInputStream(("{\"uploadId\":\""+"a".repeat(64)+"\",\"byteSize\":"+ErpMedia.PDF_BYTES+",\"metadataStripped\":false,\"scanState\":\"CLEAN\"}").getBytes(StandardCharsets.UTF_8));}
    }
    public static void main(String[] args)throws Exception {
        Generated image=new Generated(ErpMedia.PDF_BYTES,new byte[]{(byte)255,(byte)216,(byte)255,0,0});
        try { ErpMedia.read(image,"oversize.jpg");throw new AssertionError("Image above10MiB accepted"); }
        catch(ErpConsoleTransport.Failure expected){if(!expected.code.equals("MEDIA_TOO_LARGE")||image.position>ErpMedia.IMAGE_BYTES+8192)throw new AssertionError("Partial header did not enforce image limit while reading");}
        ErpMedia.FileData file=ErpMedia.read(new Generated(ErpMedia.PDF_BYTES,"%PDF-1.7".getBytes(StandardCharsets.US_ASCII)),"maximum.pdf");
        ErpMedia.Upload upload=new ErpMedia.Upload(file,"maximum.pdf",false);
        ErpConsoleTransportTest.Queue loginQueue=new ErpConsoleTransportTest.Queue();loginQueue.login();
        Sink sink=new Sink();
        ErpConsoleTransport api=new ErpConsoleTransport(url->url.getPath().equals("/api/v1/auth/login")?loginQueue.open(url):sink);
        api.configure("https://erp.example.invalid");api.login("worker@example.invalid","fixture-password","");
        api.uploadMedia(upload,"maximum-size-stable-key",api.sessionRevision());
        if(sink.received!=upload.length()||sink.declared!=upload.length()||!sink.disconnected||!"maximum-size-stable-key".equals(sink.getRequestProperty("Idempotency-Key")))throw new AssertionError("Incomplete streamed request");
        if(Runtime.getRuntime().maxMemory()>100*1024*1024)throw new AssertionError("This regression must run under the declared96MiB heap cap");
        System.out.println("PASS maximum20MiB PDF: exact "+sink.received+" JSON bytes streamed under96MiB JVM heap; partial-header image bound enforced");
    }
}
