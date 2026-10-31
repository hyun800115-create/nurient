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
//
// 「마을 옮기기」 (Move village): the game's own pages get window.SnowbloomAndroid (WebBridge: copy / share / paste of the
// village code), refused to any other page; every page start tells it which page is showing.
//
// (4.2.0.1) Sound only while the game is on screen. WebView.onPause() hides the page but never blurs it, and the game
// (Phaser) went quiet only on blur: the music played on behind Home, other apps, the lock screen and the exit dialog.
// The app now tells the page itself (window.__fvApp.pause / resume('android'), src/core/Audio.js), first thing in
// onPause and once the game can be heard again: resumed, not under the lock screen, the exit dialog closed, audio focus
// held (a call or another app's music silences it). WebView.pauseTimers() waits until the page says its sound has
// actually stopped (JS_QUIET). The volume keys always set the media volume (the game's), even while it is silent.
package com.snowbloom.village;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.media.AudioManager;
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
import android.webkit.ValueCallback;
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
import java.util.Set;
import java.util.TreeSet;

public class MainActivity extends Activity {
    static final String TAG = "Snowbloom";
    /** the page's own night colour (dist/artifact index.html --night): no white flash before the first paint */
    static final int NIGHT = 0xFF0F1A2C;
    /** View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY (API 19; the stub android.jar is API 16) */
    static final int IMMERSIVE_STICKY = 0x00001000;
    /** manifest meta-data: WebView remote debugging (chrome://inspect) on in the sideloaded test APKs, off in Play builds */
    static final String META_WEB_DEBUG = "com.snowbloom.village.WEB_DEBUG";

    // (4.2.0.1) why the game is silent now: any of these (the page hears only "pause" / "resume", src/core/Audio.js)
    /** between onPause and onResume: Home, another app, the recent-apps screen, the screen off */
    static final String SILENT_PAUSED = "paused";
    /** resumed while the lock screen is still up (some phones): until the game's window has the focus */
    static final String SILENT_LOCKED = "locked";
    /** 「게임을 끝낼까요?」 is open (and after 끝내기, until the app is gone) */
    static final String SILENT_DIALOG = "dialog";
    /** audio focus lost: a phone call, an alarm (it comes back with the focus), another app's music (FOCUS_GONE) */
    static final String SILENT_FOCUS = "focus";
    /** what the page runs (window.__fvApp: src/core/Audio.js; a page without it ignores them) */
    static final String JS_PAUSE = "try{window.__fvApp&&window.__fvApp.pause('android')}catch(e){}";
    static final String JS_RESUME = "try{window.__fvApp&&window.__fvApp.resume('android')}catch(e){}";
    /** the page's answer to "has your sound stopped?": true once its AudioContext is no longer running (a suspend()
     *  the page asked for may still be on its way: Chromium may make that state change a posted task, which
     *  pauseTimers() would freeze), also true for a page without window.__fvApp (nothing to wait for) */
    static final String JS_QUIET = "(function(){try{var a=window.__fvApp;return !(a&&a.state&&a.state().ctx==='running')}catch(e){return true}})()";
    /** WebView.pauseTimers() (every page's timers and scripts) waits until the page answers JS_QUIET with true (asked
     *  again every 100 ms) and at least TIMERS_MIN_MS have passed (its visibilitychange save), at most TIMERS_MAX_MS (a
     *  page that never answers) */
    static final long TIMERS_MIN_MS = 400;
    static final long TIMERS_MAX_MS = 2000;
    /** AudioManager.AUDIOFOCUS_REQUEST_DELAYED (API 26; the stub android.jar is API 16) */
    static final int FOCUS_REQUEST_DELAYED = 2;

    // (4.2.0.1) where the app stands with audio focus (asked for only while the game's music is on)
    /** not asked: the music is off, the app is in the background, the focus was given back, or Android refused it
     *  for no reason the app knows (the game then plays as before) */
    static final int FOCUS_NONE = 0;
    /** held: the game may be heard */
    static final int FOCUS_HELD = 1;
    /** Android gives it back by itself (AUDIOFOCUS_GAIN): asked while a call is on (DELAYED), a call ringing, an alarm */
    static final int FOCUS_WAIT = 2;
    /** gone for good: another app's music took it (Android never gives it back), or it was refused while a call is on
     *  (Android 7 has no DELAYED). Silent; asked again on a tap or when the game's window is back in front, once no
     *  other app is playing music (a player who started their own music keeps it) */
    static final int FOCUS_GONE = 3;

    private FrameLayout root;
    private WebView web;
    private WebBridge bridge;                          // window.SnowbloomAndroid (마을 옮기기)
    private AlertDialog exitDialog;
    private Object backCallback;                       // Api33.BackCallback (Android 13+)
    private final Handler ui = new Handler(Looper.getMainLooper());
    private int crashes;
    private long firstCrashAt;

    private final Set<String> silent = new TreeSet<String>();   // (4.2.0.1) reasons for silence (SILENT_*)
    private boolean pageAllowed;                       // what the page was told last (JS_RESUME: true); it boots silent
    private boolean resumed;
    private boolean exiting;                           // 끝내기 was pressed: the dialog's close keeps the game silent
    private int pauseSeq;                              // which pause the page's JS_QUIET answer belongs to
    private boolean pageQuiet;                         // the page said its sound has stopped (latest pause)
    private long pausedAt;
    private AudioManager audio;
    private Object focusRequest;                       // Api26: the AudioFocusRequest (Android 8+)
    private boolean focusAsked;                        // asked since it was last given back (abandon then)
    private int focus = FOCUS_NONE;                    // FOCUS_*
    private Boolean gameMusic;                         // the game's music setting (WebBridge.gameMusic, main thread): the
                                                       // focus is taken only once the page said "on" (a player whose music
                                                       // is off keeps their own music app playing, from the first start)

    private final AudioManager.OnAudioFocusChangeListener focusListener = new AudioManager.OnAudioFocusChangeListener() {
        @Override public void onAudioFocusChange(int change) { audioFocusChanged(change); }
    };

    /** pauseTimers once the page says its sound has stopped (see JS_QUIET, TIMERS_MIN_MS / TIMERS_MAX_MS) */
    private final Runnable pauseTimers = new Runnable() {
        @Override public void run() {
            if (resumed || web == null) return;
            if (!pageQuiet && SystemClock.uptimeMillis() - pausedAt < TIMERS_MAX_MS) {
                askQuiet();
                ui.postDelayed(this, 100);
                return;
            }
            web.pauseTimers();
        }
    };

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
        // (4.2.0.1) the volume keys set the game's (media) volume, also while it is silent (exit dialog, before the
        // first sound): not the ringer's
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
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
        silent.add(SILENT_PAUSED);                     // (not resumed yet)
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
        // API 17: sound may start before a tap (4.2.0.1: the game then starts its sound as it boots, so the title's
        // intro plays its music and sounds untouched; src/core/Audio.js autoStart)
        call(WebSettings.class, s, "setMediaPlaybackRequiresUserGesture", new Class<?>[] { boolean.class }, false);
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
        // 마을 옮기기: copy / share / paste of the village code; each call is refused unless the page is our own origin
        bridge = new WebBridge(this);
        bridge.setAudioAllowed(silent.isEmpty());      // (4.2.0.1) read by the page as it boots
        web.addJavascriptInterface(bridge, WebBridge.NAME);
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
        if (hasFocus) {
            hideSystemUi();
            setSilent(SILENT_LOCKED, false);           // unlocked: the game is really in front now
            retryAudioFocus();                         // (the notification shade closed: the player may have stopped their music there)
        }
        // (losing the focus alone keeps the sound: the volume panel, the notification shade, a keyboard take it too)
    }

    /** (4.2.0.1) every touch / key on the game: after the focus went for good, the game asks for it again (retryAudioFocus) */
    @Override
    public void onUserInteraction() {
        super.onUserInteraction();
        retryAudioFocus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        ui.removeCallbacks(pauseTimers);
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
        // (4.2.0.1) some phones resume the app while the lock screen still shows: no music there, it waits for the focus
        setSilent(SILENT_LOCKED, keyguardLocked() && !hasWindowFocus());
        requestAudioFocus();                           // (not under the lock screen or the exit dialog: asked when they go)
        setSilent(SILENT_PAUSED, false);
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        // (4.2.0.1) silence first, while the page still runs: WebView.onPause() only hides it (the game saves on
        // visibilitychange; the page gets no blur, so its sound would play on), and pauseTimers() stops its scripts,
        // so it comes last, once the page says its sound has stopped (see the pauseTimers runnable)
        resumed = false;
        silent.add(SILENT_PAUSED);
        if (bridge != null) bridge.setAudioAllowed(false);
        sendAudio();
        abandonAudioFocus();
        if (web != null) web.onPause();
        pauseTimersSoon();
        super.onPause();
    }

    /** in the background: ask the page whether its sound has stopped, and pause the timers once it has (the runnable) */
    private void pauseTimersSoon() {
        pauseSeq++;
        pageQuiet = false;
        pausedAt = SystemClock.uptimeMillis();
        askQuiet();
        ui.removeCallbacks(pauseTimers);
        ui.postDelayed(pauseTimers, TIMERS_MIN_MS);
    }

    /** JS_QUIET; a "true" for the latest pause lets the timers stop */
    private void askQuiet() {
        if (web == null) return;
        final int seq = pauseSeq;
        evaluate(JS_QUIET, new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                if (seq == pauseSeq && "true".equals(value)) pageQuiet = true;
            }
        });
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        abandonAudioFocus();
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

    /**
     * Back never closes the game by accident: it asks first (the save is kept either way). (4.2.0.1) The game is silent
     * while it asks: back means "leave" (the designer heard the music play on under it); 계속하기, back again or a tap
     * beside the dialog bring the sound back, 끝내기 keeps it silent until the app is gone.
     */
    void askToExit() {
        if (isFinishing()) return;
        if (exitDialog != null && exitDialog.isShowing()) return;
        exiting = false;
        exitDialog = new AlertDialog.Builder(this)
                .setTitle("게임을 끝낼까요?")
                .setMessage("지금까지 한 것은 자동으로 저장돼요.\n다음에 열면 이어서 할 수 있어요.")
                .setNegativeButton("계속하기", null)
                .setPositiveButton("끝내기", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) { saveAndFinish(); }
                })
                .create();
        exitDialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override public void onDismiss(DialogInterface d) {
                hideSystemUi();
                if (!exiting && !isFinishing()) setSilent(SILENT_DIALOG, false);
            }
        });
        exitDialog.show();
        setSilent(SILENT_DIALOG, true);
    }

    private void saveAndFinish() {
        exiting = true;
        if (web != null) {
            // the game saves on pagehide (src/scenes/Game.js onHide); fire it now, before the page goes away
            web.loadUrl("javascript:try{window.dispatchEvent(new Event('pagehide'))}catch(e){}void 0");
        }
        ui.postDelayed(new Runnable() {
            @Override public void run() { finish(); }
        }, 350);
    }

    // ------------------------------------------------------------------ (4.2.0.1) the game's sound
    /** true when nothing keeps the game silent (WebBridge.audioAllowed reads this state) */
    boolean audioAllowed() {
        return silent.isEmpty();
    }

    /** one reason for silence on / off; the page is told only when the answer (silent or not) changes */
    void setSilent(String why, boolean on) {
        boolean had = on ? !silent.add(why) : silent.remove(why);
        // the lock screen / the exit dialog gone: the game can be heard now, so it asks for the audio focus now (not
        // before: the player's own music plays on meanwhile), which may keep it silent (a call is on)
        if (had && !on && (SILENT_LOCKED.equals(why) || SILENT_DIALOG.equals(why))) requestAudioFocus();
        if (bridge != null) bridge.setAudioAllowed(silent.isEmpty());
        if (silent.isEmpty() != pageAllowed) sendAudio();
    }

    /** tells the page the current answer (JS_PAUSE / JS_RESUME), also when it has not changed */
    private void sendAudio() {
        pageAllowed = silent.isEmpty();
        evaluate(pageAllowed ? JS_RESUME : JS_PAUSE, null);
    }

    /** WebView.evaluateJavascript (API 19); the callback runs on the main thread once the page has run the script */
    private void evaluate(String script, ValueCallback<String> cb) {
        if (web == null) return;
        call(WebView.class, web, "evaluateJavascript", new Class<?>[] { String.class, ValueCallback.class }, script, cb);
    }

    private boolean keyguardLocked() {
        Object km = getSystemService(Context.KEYGUARD_SERVICE);
        return km instanceof KeyguardManager && ((KeyguardManager) km).isKeyguardLocked();
    }

    /**
     * Audio focus (only while the game's music is on: with it off, a player's own music app keeps playing; asked for
     * when the page first reports the setting as it boots, before its title music): the game asks for it when it can
     * be heard (resumed, not under the lock screen or the exit dialog) and gives it back on every pause. A call, an
     * alarm (LOSS_TRANSIENT) or a call already on (DELAYED): silent until it comes back (GAIN). Another app's music
     * (LOSS: Android never gives it back) or a refusal while a call is on (Android 7): silent, asked again by
     * retryAudioFocus. LOSS_TRANSIENT_CAN_DUCK: Android 8+ lowers the game itself, nothing to do.
     */
    private void requestAudioFocus() {
        AudioManager am = audioManager();
        if (am == null || !Boolean.TRUE.equals(gameMusic) || !resumed) {
            setSilent(SILENT_FOCUS, false);
            return;
        }
        if (silent.contains(SILENT_LOCKED) || silent.contains(SILENT_DIALOG)) return;   // silent anyway: asked when they go
        if (focus != FOCUS_NONE) return;               // asked already (held, coming back, or gone: retryAudioFocus)
        int r;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) focusRequest = Api26.focusRequest(focusListener, ui);
            r = Api26.request(am, focusRequest);
        } else {
            r = am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        focusAsked = true;
        if (r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) focus = FOCUS_HELD;
        else if (r == FOCUS_REQUEST_DELAYED) focus = FOCUS_WAIT;      // Android 8+: a call is on, GAIN when it ends
        else focus = inCall(am) ? FOCUS_GONE : FOCUS_NONE;            // refused: during a call silent, else play as before
        setSilent(SILENT_FOCUS, focus == FOCUS_WAIT || focus == FOCUS_GONE);
    }

    /**
     * After the focus went for good (FOCUS_GONE): a tap on the game or its window back in front (the notification shade
     * closed) asks again, unless another app is playing music right now: a player who started their own music keeps it
     * and the game stays silent until that music stops (or until the next return to the game, which asks anyway).
     */
    void retryAudioFocus() {
        if (focus != FOCUS_GONE || !resumed) return;
        AudioManager am = audioManager();
        if (am == null || am.isMusicActive()) return;
        focus = FOCUS_NONE;
        requestAudioFocus();
    }

    /** a phone or a voice / video call (KakaoTalk...) is ringing or on */
    private static boolean inCall(AudioManager am) {
        int m = am.getMode();
        return m == AudioManager.MODE_IN_CALL || m == AudioManager.MODE_IN_COMMUNICATION || m == AudioManager.MODE_RINGTONE;
    }

    private void abandonAudioFocus() {
        AudioManager am = audioManager();
        if (focusAsked && am != null) {
            if (Build.VERSION.SDK_INT >= 26) Api26.abandon(am, focusRequest);
            else am.abandonAudioFocus(focusListener);
        }
        focusAsked = false;
        focus = FOCUS_NONE;
        setSilent(SILENT_FOCUS, false);
    }

    void audioFocusChanged(int change) {
        if (!focusAsked) return;                       // (a late call after the focus was given back)
        if (change == AudioManager.AUDIOFOCUS_GAIN) focus = FOCUS_HELD;
        else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) focus = FOCUS_WAIT;
        else if (change == AudioManager.AUDIOFOCUS_LOSS) focus = FOCUS_GONE;
        else return;                                   // LOSS_TRANSIENT_CAN_DUCK: Android 8+ lowers the game itself
        setSilent(SILENT_FOCUS, focus != FOCUS_HELD);
    }

    /** WebBridge.gameMusic (the page, on boot and on every music toggle; main thread) */
    void setGameMusic(boolean on) {
        if (gameMusic != null && on == gameMusic.booleanValue()) return;
        gameMusic = on;
        if (!resumed) return;
        if (on) requestAudioFocus();
        else abandonAudioFocus();
    }

    private AudioManager audioManager() {
        if (audio == null) {
            Object o = getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
            if (o instanceof AudioManager) audio = (AudioManager) o;
        }
        return audio;
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
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            // (main frame only) the bridge serves only the game's own origin: it learns each page before its scripts run
            if (view == web && bridge != null) bridge.setPage(url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            // (4.2.0.1) the page also reads SnowbloomAndroid.audioAllowed() as it boots; this repeats the answer
            if (view == web) sendAudio();
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
                @Override public void run() {
                    if (isFinishing() || web != null) return;
                    createWebView();
                    if (!resumed) {
                        // (4.2.0.1) in the background: the new page starts hidden and silent (it reads audioAllowed()
                        // as it boots), and its timers stop as after onPause (the earlier pauseTimers may never have
                        // run: the runnable gives up while there is no WebView)
                        web.onPause();
                        pauseTimersSoon();
                    }
                }
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
