package nl.andyapples.game;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.Display;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Andy Apples als Android-app: een schermvullende WebView die het spel (assets/index.html) laadt.
 * Een kleine JavaScript-brug regelt wat een WebView zelf niet kan: tekst naar het klembord kopiëren.
 * Voor soepel en zuinig spelen: de hoogste verversingssnelheid van het scherm, gelijkmatige prestaties waar het toestel dat kan,
 * en op de achtergrond staan de timers stil.
 */
public class MainActivity extends Activity {
    private WebView web;

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
        useHighestRefreshRate();
        // gelijkmatige prestaties: liever een vaste, iets lagere kloksnelheid dan na een paar minuten warm worden en haperen
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null && pm.isSustainedPerformanceModeSupported()) getWindow().setSustainedPerformanceMode(true);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 42, 26));
        // Scherm ingedrukt houden = een liaan vasthouden. Zonder dit ziet Android dat als "lang indrukken"
        // (tekst selecteren / contextmenu) en trilt de telefoon steeds.
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) { return true; } // afgehandeld: geen selectie, geen trilling
        });
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // localStorage: hier staat je voortgang in
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

            // Het tekenproces van de WebView is gestopt (bijv. door Android opgeruimd): de app opnieuw opbouwen
            // in plaats van helemaal te laten crashen. Je voortgang staat in localStorage en blijft bewaard.
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != web) return true;
                if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                web = null;
                recreate();
                return true;
            }
        });
        // op de achtergrond het spel liever niet afsluiten (dan ben je je run kwijt)
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        applyOrientation();
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

        /** Instellingen → Scherm: volledig scherm (systeembalken verbergen) aan of uit. */
        @JavascriptInterface
        public void setFullscreen(final boolean on) {
            prefs().edit().putBoolean("full", on).apply();
            runOnUiThread(new Runnable() { public void run() { if (web != null) hideSystemBars(); } });
        }

        @JavascriptInterface
        public boolean isFullscreen() { return prefs().getBoolean("full", true); }

        /** Instellingen → Scherm: altijd liggend, of meedraaien met de telefoon. */
        @JavascriptInterface
        public void setLandscape(final boolean on) {
            prefs().edit().putBoolean("land", on).apply();
            runOnUiThread(new Runnable() { public void run() { applyOrientation(); } });
        }

        @JavascriptInterface
        public boolean isLandscape() { return prefs().getBoolean("land", true); }

    }

    /**
     * De hoogste verversingssnelheid van het scherm vragen (90/120 Hz waar dat kan). Veel toestellen houden apps
     * anders op 60 Hz. Wordt het te zwaar, dan verlaagt de automatische kwaliteit (adaptQuality) de grafische stand.
     * Kies de snelste stand met dezelfde resolutie; het verzoek zelf is een hint aan Android.
     */
    private void useHighestRefreshRate() {
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        Display d = getWindowManager().getDefaultDisplay();
        Display.Mode cur = d.getMode(), best = cur;
        for (Display.Mode m : d.getSupportedModes()) {
            if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()
                    && m.getRefreshRate() > best.getRefreshRate()) best = m;
        }
        lp.preferredDisplayModeId = best.getModeId();
        lp.preferredRefreshRate = best.getRefreshRate();
        getWindow().setAttributes(lp);
    }

    private SharedPreferences prefs() { return getSharedPreferences("scherm", MODE_PRIVATE); }

    private void applyOrientation() {
        setRequestedOrientation(prefs().getBoolean("land", true) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
    }

    /** Volledig scherm (standaard): systeembalken weg. Uit: de balken blijven gewoon staan. */
    private void hideSystemBars() {
        if (!prefs().getBoolean("full", true)) { web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE); return; }
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && web != null) hideSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web == null) return;
        web.onPause();
        web.pauseTimers(); // op de achtergrond geen JavaScript-timers laten doorlopen (batterij)
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web == null) return;
        web.resumeTimers();
        web.onResume();
        hideSystemBars();
    }

    /** Terugknop: eerst het spel laten reageren (pauze, terug naar menu); in het hoofdmenu gaat de app naar de achtergrond. */
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(function(){ return !!(window.__andyBack && window.__andyBack()); })()", new ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) moveTaskToBack(true);
            }
        });
    }
}
