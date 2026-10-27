// 행복한 눈꽃마을 이야기 · Snowbloom Village — Android test app (tools/apk).
//
// One Activity with one full-screen WebView. The game (the claude.ai artifact build, dist/artifact) is packed in the
// APK under assets/www/ and served from a virtual https origin (AssetRouter): no file:// access, no network, no
// server. localStorage of that origin holds the save, like the browser does.
//
// Compiled with javac --release 8 against the API 16 stub android.jar from Maven Central, so methods newer than API 16
// on older classes are reached through reflection (minSdk is 24, so the API 17-24 ones are always there at run time),
// and newer types (onRenderProcessGone's RenderProcessGoneDetail, API 26; WindowInsets & co., API 29/30; the back
// callback, API 33) compile against compile-only stubs (tools/apk/android/stubs, never packed). The API 30 and API 33
// code lives in Api30 / Api33, loaded only on those versions.
//
// targetSdk 36 (Google Play's rule for new apps and updates from 31 Aug 2026): the window is edge-to-edge (Android 15+
// enforces it, Android 16 removes the opt-out), so GameFrame pads the game by the visible bars, the camera cutout and
// the keyboard on Android 11+; and back arrives through an OnBackInvokedCallback on Android 13+ (Android 16 no longer
// calls onBackPressed for targetSdk 36), which opens the same exit dialog.
package com.snowbloom.village;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
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
    /** manifest meta-data: WebView remote debugging (chrome://inspect) on in the sideloaded test APKs, off in Play builds */
    static final String META_WEB_DEBUG = "com.snowbloom.village.WEB_DEBUG";

    private FrameLayout root;
    private WebView web;
    private AlertDialog exitDialog;
    private Object backCallback;                       // Api33.BackCallback (Android 13+)
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
        // the chat's text box must stay above the keyboard. Android 7-10: the window shrinks above it (adjustResize;
        // FLAG_FULLSCREEN would break this, so the bars are hidden with the system-UI flags instead). Android 11+:
        // edge-to-edge, GameFrame pads the game by the keyboard's inset (adjustResize only reports it there).
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 30) Api30.edgeToEdge(w);
        if (metaFlag(META_WEB_DEBUG)) {
            callStatic(WebView.class, "setWebContentsDebuggingEnabled", new Class<?>[] { boolean.class }, true);   // API 19: chrome://inspect
        }

        root = new GameFrame(this);
        root.setBackgroundColor(NIGHT);
        setContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT < 30) {
            getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(new View.OnSystemUiVisibilityChangeListener() {
                @Override public void onSystemUiVisibilityChange(int visibility) {
                    // the bars came back (keyboard, a swipe on an older phone): hide them again after a moment
                    if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) rehideBarsLater();
                }
            });
        }
        if (Build.VERSION.SDK_INT >= 33) backCallback = Api33.registerBack(this);
        createWebView();
        hideSystemUi();
    }

    /**
     * The root view. Android 11+: the window is edge-to-edge, so this view pads itself by the visible system bars, the
     * camera cutout and the keyboard, and hands the WebView the insets with those parts zeroed (see Api30.apply): the
     * game is never under a bar, the notch or the keyboard, and nothing is padded twice. Android 7-10: the window
     * itself still fits the bars and shrinks for the keyboard, as before, so the insets pass through untouched.
     */
    final class GameFrame extends FrameLayout {
        GameFrame(Context c) {
            super(c);
        }

        /** overrides View.onApplyWindowInsets(WindowInsets) (API 20; the API 16 stub jar does not declare it) */
        public WindowInsets onApplyWindowInsets(WindowInsets insets) {
            if (Build.VERSION.SDK_INT < 30) return insets;
            if (Api30.barsShowing(insets)) rehideBarsLater();
            return Api30.apply(this, insets);
        }
    }

    /** the bars came back for good (keyboard on some phones, a dialog): hide them again after a moment */
    void rehideBarsLater() {
        ui.removeCallbacks(hideBars);
        ui.postDelayed(hideBars, 2500);
    }

    /** a boolean <meta-data> of the manifest's <application> (false when missing) */
    private boolean metaFlag(String name) {
        try {
            ApplicationInfo ai = getPackageManager().getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA);
            return ai.metaData != null && ai.metaData.getBoolean(name, false);
        } catch (Exception e) {
            return false;
        }
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
        if (Build.VERSION.SDK_INT >= 30) {
            Api30.hideBars(getWindow());                // WindowInsetsController, transient bars by swipe
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | IMMERSIVE_STICKY);
        }
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
        if (backCallback != null) {
            Api33.unregisterBack(this, backCallback);
            backCallback = null;
        }
        if (exitDialog != null) exitDialog.dismiss();
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /**
     * Back on Android 7-12. (Android 13+: Api33.BackCallback, because the manifest sets
     * android:enableOnBackInvokedCallback="true" and targetSdk 36 makes it the only route on Android 16.)
     */
    @Override
    public void onBackPressed() {
        askToExit();
    }

    /** Back never closes the game by accident: it asks first (the save is kept either way). */
    void askToExit() {
        if (isFinishing()) return;
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
