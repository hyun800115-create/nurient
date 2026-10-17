// 행복한 눈꽃마을 이야기 · Snowbloom Village — Android test app (tools/apk).
//
// One Activity with one full-screen WebView. The game (the claude.ai artifact build, dist/artifact) is packed in the
// APK under assets/www/ and served from a virtual https origin (AssetRouter): no file:// access, no network, no
// server. localStorage of that origin holds the save, like the browser does.
//
// Compiled with javac --release 8 against the API 16 stub android.jar from Maven Central, so everything newer than
// API 16 is reached through reflection (minSdk is 24, so it is always there at run time), and
// onRenderProcessGone (API 26) compiles against a compile-only stub (tools/apk/android/stubs, never packed).
package com.snowbloom.village;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    static final String TAG = "Snowbloom";
    /** the page's own night colour (dist/artifact index.html --night): no white flash before the first paint */
    static final int NIGHT = 0xFF0F1A2C;
    /** View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY (API 19; the stub android.jar is API 16) */
    static final int IMMERSIVE_STICKY = 0x00001000;

    private FrameLayout root;
    private WebView web;
    private AlertDialog exitDialog;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private int crashes;
    private long firstCrashAt;

    private final Runnable hideBars = new Runnable() {
        @Override public void run() { hideSystemUi(); }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);        // keep the screen on while playing
        w.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(NIGHT));
        // the chat's text box: the window shrinks above the keyboard (FLAG_FULLSCREEN would break this, so the bars
        // are hidden with the system-UI flags instead)
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        callStatic(WebView.class, "setWebContentsDebuggingEnabled", new Class<?>[] { boolean.class }, true);   // API 19: chrome://inspect

        root = new FrameLayout(this);
        root.setBackgroundColor(NIGHT);
        setContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(new View.OnSystemUiVisibilityChangeListener() {
            @Override public void onSystemUiVisibilityChange(int visibility) {
                // the bars came back (keyboard, a swipe on an older phone): hide them again after a moment
                if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                    ui.removeCallbacks(hideBars);
                    ui.postDelayed(hideBars, 2500);
                }
            }
        });
        createWebView();
        hideSystemUi();
    }

    /** a new WebView showing the game (also after the renderer was lost) */
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setKeepScreenOn(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // localStorage = the save
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);                  // everything comes from the virtual origin
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setTextZoom(100);                           // the phone's font size must not resize the chat sheet
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);    // the files are in the APK; a new APK must never meet old copies
        call(WebSettings.class, s, "setMediaPlaybackRequiresUserGesture", new Class<?>[] { boolean.class }, false);   // API 17: sound may start before a tap
        s.setUserAgentString(s.getUserAgentString() + " SnowbloomVillageApp/" + versionName());

        web.setWebViewClient(new GameClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                String line = m.message() + "  (" + m.sourceId() + ":" + m.lineNumber() + ")";
                if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.e(TAG, line);
                else if (m.messageLevel() == ConsoleMessage.MessageLevel.WARNING) Log.w(TAG, line);
                else Log.i(TAG, line);
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web.loadUrl(AssetRouter.START_URL);
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    /** full screen: status and navigation bars hidden; a swipe from the edge shows them for a moment (sticky) */
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        // the page turns hidden: the game saves on visibilitychange and Phaser stops the loop and the sound
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (exitDialog != null) exitDialog.dismiss();
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Back never closes the game by accident: it asks first (the save is kept either way). */
    @Override
    public void onBackPressed() {
        if (exitDialog != null && exitDialog.isShowing()) return;
        exitDialog = new AlertDialog.Builder(this)
                .setTitle("게임을 끝낼까요?")
                .setMessage("지금까지 한 것은 자동으로 저장돼요.\n다음에 열면 이어서 할 수 있어요.")
                .setNegativeButton("계속하기", null)
                .setPositiveButton("끝내기", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) { saveAndFinish(); }
                })
                .create();
        exitDialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override public void onDismiss(DialogInterface d) { hideSystemUi(); }
        });
        exitDialog.show();
    }

    private void saveAndFinish() {
        if (web != null) {
            // the game saves on pagehide (src/scenes/Game.js onHide); fire it now, before the page goes away
            web.loadUrl("javascript:try{window.dispatchEvent(new Event('pagehide'))}catch(e){}void 0");
        }
        ui.postDelayed(new Runnable() {
            @Override public void run() { finish(); }
        }, 350);
    }

    // ------------------------------------------------------------------ the virtual origin
    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            // API 21+ calls shouldInterceptRequest(WebView, WebResourceRequest), whose default implementation calls
            // this one with request.getUrl().toString()
            AssetRouter.Route r = AssetRouter.resolve(url);
            if (r == null) return null;
            if (r.assetPath == null) return notFound();
            InputStream in;
            try {
                in = getAssets().open(r.assetPath, AssetManager.ACCESS_STREAMING);
            } catch (IOException e) {
                Log.w(TAG, "404 " + url);
                return notFound();
            }
            WebResourceResponse res = new WebResourceResponse(r.mime, r.encoding, in);
            Map<String, String> h = new HashMap<String, String>();
            h.put("Cache-Control", "no-cache");
            h.put("Access-Control-Allow-Origin", "*");
            call(WebResourceResponse.class, res, "setResponseHeaders", new Class<?>[] { Map.class }, h);       // API 21
            return res;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url == null || AssetRouter.resolve(url) != null) return false;   // the game's own pages stay here
            if (url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("javascript:")) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));       // any other link: the phone's browser
            } catch (ActivityNotFoundException e) {
                Log.w(TAG, "no app for " + url);
            } catch (RuntimeException e) {
                Log.w(TAG, "could not open " + url, e);
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            Log.w(TAG, "load error " + errorCode + " " + description + " " + failingUrl);
        }

        /**
         * API 26+: the page's renderer crashed or the system took it back for memory. Without this the whole app
         * would close. The game saved itself into localStorage, so a fresh WebView continues the village.
         */
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            Log.w(TAG, "WebView renderer gone; starting a new one");
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) parent.removeView(view);
            view.destroy();
            if (view != web) return true;
            web = null;
            long now = SystemClock.elapsedRealtime();
            if (now - firstCrashAt > 60000) { firstCrashAt = now; crashes = 0; }
            if (++crashes > 3) {
                Toast.makeText(MainActivity.this, "게임을 다시 열어 주세요.", Toast.LENGTH_LONG).show();
                finish();
                return true;
            }
            ui.post(new Runnable() {
                @Override public void run() { if (!isFinishing() && web == null) createWebView(); }
            });
            return true;
        }
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse res = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        call(WebResourceResponse.class, res, "setStatusCodeAndReasonPhrase", new Class<?>[] { int.class, String.class }, 404, "Not Found");   // API 21
        return res;
    }

    // ------------------------------------------------------------------ reflection for API > 16
    /** the method is looked up on the public API class (not on the WebView provider's own class) and called virtually */
    static Object call(Class<?> api, Object target, String name, Class<?>[] types, Object... args) {
        try {
            Method m = api.getMethod(name, types);
            return m.invoke(target, args);
        } catch (Exception e) {
            Log.w(TAG, name + " not available: " + e);
            return null;
        }
    }

    static Object callStatic(Class<?> cls, String name, Class<?>[] types, Object... args) {
        try {
            Method m = cls.getMethod(name, types);
            return m.invoke(null, args);
        } catch (Exception e) {
            Log.w(TAG, name + " not available: " + e);
            return null;
        }
    }
}
