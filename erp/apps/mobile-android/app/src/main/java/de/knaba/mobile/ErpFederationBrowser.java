package de.knaba.mobile;

import java.lang.ref.WeakReference;

/** Process-only rendezvous. No Activity/context, URI, cookie or verifier is persisted here. */
final class ErpFederationBrowser {
    private static WeakReference<ErpFederationLogin> active=new WeakReference<>(null);
    static void arm(ErpFederationLogin attempt) {
        ErpFederationLogin previous;
        synchronized(ErpFederationBrowser.class) { previous=active.get(); active=new WeakReference<>(attempt); }
        if(previous!=null && previous!=attempt) previous.cancel();
    }
    static boolean deliver(String uri) {
        ErpFederationLogin attempt;
        synchronized(ErpFederationBrowser.class) { attempt=active.get(); }
        return attempt!=null && attempt.callback(uri);
    }
    static synchronized void forget(ErpFederationLogin attempt) { if(active.get()==attempt) active.clear(); }
}
