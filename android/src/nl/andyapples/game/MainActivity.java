package nl.andyapples.game;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.OutputStream;

/**
 * Andy Apples als Android-app: een schermvullende WebView die het spel (assets/index.html) laadt.
 * Een kleine JavaScript-brug regelt wat een WebView zelf niet kan: een save-bestand opslaan,
 * tekst naar het klembord kopiëren en een save-bestand kiezen om te importeren.
 */
public class MainActivity extends Activity {
    private static final int REQ_OPEN = 1, REQ_SAVE = 2;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 42, 26));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // localStorage: hier staat je voortgang in
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " AndyApplesApp/1.0");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* geen app */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Save-bestand kiezen"), REQ_OPEN);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        hideSystemBars();
        web.loadUrl("file:///android_asset/index.html");
    }

    /** Wordt vanuit JavaScript aangeroepen (window.AndroidBridge). */
    public class Bridge {
        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(new Runnable() {
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Andy Apples", text));
                }
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String text) {
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingSave = text;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (Exception e) {
                        pendingSave = null;
                        web.evaluateJavascript("window.__andySaved && window.__andySaved(false)", null);
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = (result == RESULT_OK && data != null) ? data.getData() : null;
        if (request == REQ_OPEN) {
            if (fileCallback != null) fileCallback.onReceiveValue(uri != null ? new Uri[] { uri } : null);
            fileCallback = null;
        } else if (request == REQ_SAVE) {
            boolean ok = false;
            if (uri != null && pendingSave != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os != null) {
                        os.write(pendingSave.getBytes("UTF-8"));
                        os.close();
                        ok = true;
                    }
                } catch (Exception e) { /* mislukt */ }
            }
            pendingSave = null;
            web.evaluateJavascript("window.__andySaved && window.__andySaved(" + ok + ")", null);
        }
    }

    private void hideSystemBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    /** Terugknop: eerst het spel laten reageren (pauze, terug naar menu); in het hoofdmenu gaat de app naar de achtergrond. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){ return !!(window.__andyBack && window.__andyBack()); })()", new ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) moveTaskToBack(true);
            }
        });
    }
}
