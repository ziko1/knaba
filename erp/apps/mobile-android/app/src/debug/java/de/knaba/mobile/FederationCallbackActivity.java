package de.knaba.mobile;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Exported only in Debug. Never forwards caller extras, flags, selectors or an embedded Intent. */
public final class FederationCallbackActivity extends Activity {
    @Override public void onCreate(Bundle savedInstanceState) { super.onCreate(savedInstanceState); accept(getIntent()); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); accept(intent); }
    private void accept(Intent incoming) {
        boolean accepted=false;
        try {
            int grants=Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION;
            if(BuildConfig.DEBUG && "de.knaba.mobile.test".equals(BuildConfig.APPLICATION_ID) && incoming!=null &&
                    Intent.ACTION_VIEW.equals(incoming.getAction()) && incoming.getSelector()==null && incoming.getClipData()==null &&
                    (incoming.getFlags()&grants)==0)
                accepted=ErpFederationBrowser.deliver(incoming.getDataString());
        } catch(RuntimeException rejected) { /* Untrusted callback data never enters logs or UI. */ }
        setIntent(new Intent());
        if(accepted) startActivity(new Intent(this,ErpConsoleActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
    }
}
