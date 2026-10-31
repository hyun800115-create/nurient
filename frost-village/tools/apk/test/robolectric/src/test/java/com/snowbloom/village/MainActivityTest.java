// Snowbloom Village Android app (tools/apk) — MainActivity under Robolectric (the real Android framework code on a JVM).
//
// What a phone would do and the off-device checks cannot show otherwise:
//   Android 16 (API 36, the app's targetSdk) and Android 14 (API 34, where the platform does not force edge-to-edge
//   yet and the app asks for it itself): the window is edge-to-edge with the cutout mode ALWAYS; the root view pads
//   itself by the camera cutout / visible bars / keyboard and hands the WebView zeroed insets (no double padding); the
//   bars are hidden with transient-by-swipe behaviour; the back callback is the window's top OnBackInvokedCallback and
//   opens 「게임을 끝낼까요?」 once; 끝내기 fires pagehide and closes the app.
//   Android 10 (API 29): the old path is unchanged (system-UI flags, the window fits the bars itself, onBackPressed).
//   마을 옮기기 (Android 10 and 16): window.SnowbloomAndroid is on the WebView; on the game's own page copy() puts the
//   code on the clipboard, share() opens the share sheet (a chooser around ACTION_SEND text/plain with the code),
//   paste() reads the clipboard; on any other page all three refuse and nothing is started or copied.
//   (4.2.0.1) the game's sound (Android 10 and 16): onPause tells the page to go silent BEFORE WebView.onPause(), and
//   pauseTimers() waits until the page says its AudioContext has really stopped (asked again every 100 ms; at least
//   400 ms, at most 2 s; an answer for an earlier pause does not count; a quick return cancels it); a renderer rebuilt in
//   the background starts hidden, silent and gets its own pauseTimers; onResume resumes timers + page, then lets the
//   sound back; under the lock screen only once the window has the focus; the exit dialog silences (계속하기 / back /
//   Home and back while it is up / 끝내기); audio focus (USAGE_GAME): lost -> silent, back -> sound, given back on
//   pause, asked again on resume, DELAYED during a call, not asked under the lock screen or the exit dialog (asked when
//   they go), after another app's music took it a tap / the shade closing asks again once that music stopped, refused
//   during a call (Android 7) -> silent until a tap after the call, none while the game's music is off (asked for only
//   once the page has said its music is on: a player whose music is off keeps their own music app);
//   window.SnowbloomAndroid.audioAllowed() reports the state the page boots with; the WebView lets the game's sound
//   start without a tap (the title's intro plays its music untouched); the volume keys set the media volume.
// Run: mvn -q -f frost-village/tools/apk/test/robolectric/pom.xml test   (see the pom)
package com.snowbloom.village;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Insets;
import android.graphics.Rect;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Looper;
import android.view.DisplayCutout;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadow.api.Shadow;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.shadows.ShadowAudioManager;
import org.robolectric.shadows.ShadowDialog;
import org.robolectric.shadows.ShadowSystemClock;
import org.robolectric.shadows.ShadowWebView;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE)
@LooperMode(LooperMode.Mode.PAUSED)
public class MainActivityTest {
    static final String START = "https://appassets.androidplatform.net/index.html";
    static final String PAGEHIDE = "javascript:try{window.dispatchEvent(new Event('pagehide'))}catch(e){}void 0";

    private static MainActivity start() {
        // what the manifest's android:enableOnBackInvokedCallback="true" sets (Config.NONE has no manifest; the built
        // APK's attribute is checked by validate_apk.py)
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            RuntimeEnvironment.getApplication().getApplicationInfo().setEnableOnBackInvokedCallback(true);
        }
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        shadowOf(Looper.getMainLooper()).idle();
        return a;
    }

    private static FrameLayout root(MainActivity a) {
        View v = ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0);
        assertTrue("root is MainActivity.GameFrame", v instanceof MainActivity.GameFrame);
        return (FrameLayout) v;
    }

    private static WebView web(MainActivity a) {
        View v = root(a).getChildAt(0);
        assertTrue("the WebView is the root's child", v instanceof WebView);
        return (WebView) v;
    }

    private static String latestDialogTitle() {
        AlertDialog d = ShadowAlertDialog.getLatestAlertDialog();
        assertNotNull("an AlertDialog was shown", d);
        assertTrue("the dialog is showing", d.isShowing());
        return String.valueOf(((ShadowAlertDialog) Shadow.extract(d)).getTitle());
    }

    // ------------------------------------------------------------------ Android 14 and 16 (targetSdk 36)
    @Test
    @Config(sdk = {34, 36})
    public void api34and36_windowIsEdgeToEdgeAndKeepsTheOldBasics() throws Exception {
        MainActivity a = start();
        Window w = a.getWindow();
        assertEquals("cutout mode ALWAYS (what Android 15+ forces for targetSdk 35+)",
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS, w.getAttributes().layoutInDisplayCutoutMode);
        java.lang.reflect.Field fits = w.getClass().getDeclaredField("mDecorFitsSystemWindows");   // PhoneWindow (API 30+)
        fits.setAccessible(true);
        assertFalse("decor does not fit system windows (edge-to-edge)", fits.getBoolean(w));
        // (whether the platform itself would also enforce it depends on Android 16's feature flags, which Robolectric
        // leaves off; the app does not rely on it: it asks for the edge-to-edge window itself on Android 11+)
        assertTrue("keep screen on", (w.getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0);
        assertEquals("adjustResize", WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
                w.getAttributes().softInputMode & WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
        WindowInsetsController c = w.getInsetsController();
        assertNotNull(c);
        assertEquals("bars come back only transiently, by swipe", WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE,
                c.getSystemBarsBehavior());
        assertEquals("the game is loaded from the virtual origin", START, shadowOf(web(a)).getLastLoadedUrl());
    }

    @Test
    @Config(sdk = {34, 36})
    public void api34and36_rootPadsByCutoutAndKeyboard_webViewGetsZeroedInsets() {
        MainActivity a = start();
        FrameLayout root = root(a);
        final WindowInsets[] seen = new WindowInsets[1];
        web(a).setOnApplyWindowInsetsListener((v, in) -> {
            seen[0] = in;
            return in;
        });
        int guarded = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();

        // full screen (bars hidden) on a phone with a punch-hole camera: only the cutout
        DisplayCutout hole = new DisplayCutout(Insets.of(0, 96, 0, 0), null, new Rect(500, 0, 580, 96), null, null);
        root.dispatchApplyWindowInsets(new WindowInsets.Builder().setDisplayCutout(hole)
                .setInsets(WindowInsets.Type.displayCutout(), Insets.of(0, 96, 0, 0)).build());
        assertEquals(96, root.getPaddingTop());
        assertEquals(0, root.getPaddingBottom());
        assertNotNull("the WebView got insets", seen[0]);
        assertEquals("the WebView sees no cutout (no double padding)", Insets.NONE, seen[0].getInsets(guarded));
        assertTrue("nor the cutout shape (older WebViews read it)", seen[0].getDisplayCutout() == null);

        // the chat's keyboard opens (900 px): the game shrinks above it, the WebView sees no keyboard inset
        seen[0] = null;
        root.dispatchApplyWindowInsets(new WindowInsets.Builder()
                .setInsets(WindowInsets.Type.displayCutout(), Insets.of(0, 96, 0, 0))
                .setInsets(WindowInsets.Type.ime(), Insets.of(0, 0, 0, 900)).setVisible(WindowInsets.Type.ime(), true).build());
        assertEquals(96, root.getPaddingTop());
        assertEquals(900, root.getPaddingBottom());
        assertEquals(Insets.NONE, seen[0].getInsets(guarded));

        // keyboard closed again
        root.dispatchApplyWindowInsets(new WindowInsets.Builder()
                .setInsets(WindowInsets.Type.displayCutout(), Insets.of(0, 96, 0, 0)).build());
        assertEquals(0, root.getPaddingBottom());

        // bars shown for good (e.g. split screen): padded by them, and a re-hide is scheduled
        root.dispatchApplyWindowInsets(new WindowInsets.Builder()
                .setInsets(WindowInsets.Type.statusBars(), Insets.of(0, 110, 0, 0)).setVisible(WindowInsets.Type.statusBars(), true)
                .setInsets(WindowInsets.Type.navigationBars(), Insets.of(0, 0, 0, 63)).setVisible(WindowInsets.Type.navigationBars(), true)
                .setInsets(WindowInsets.Type.displayCutout(), Insets.of(0, 96, 0, 0)).build());
        assertEquals("the larger of status bar and cutout", 110, root.getPaddingTop());
        assertEquals(63, root.getPaddingBottom());
        Duration next = shadowOf(Looper.getMainLooper()).getNextScheduledTaskTime();
        assertTrue("re-hide of the bars is scheduled", next != null && !next.isZero());
    }

    @Test
    @Config(sdk = {34, 36})
    public void api34and36_backGestureOpensTheExitDialogOnce_andExitSavesFirst() throws Exception {
        MainActivity a = start();
        // what Android 13+ calls for a back gesture / back button when the app enables OnBackInvokedCallback (always
        // for targetSdk 36 on Android 16): the top OnBackInvokedCallback of the window
        Object vri = View.class.getMethod("getViewRootImpl").invoke(a.getWindow().getDecorView());
        assertNotNull("the window is attached (ViewRootImpl)", vri);
        Object dispatcher = vri.getClass().getMethod("getOnBackInvokedDispatcher").invoke(vri);
        Object top = dispatcher.getClass().getMethod("getTopCallback").invoke(dispatcher);
        assertNotNull("a back callback is registered", top);
        assertTrue("the top callback is the game's (" + top.getClass().getName() + ")", top instanceof Api33.BackCallback);
        Boolean enabled = (Boolean) Class.forName("android.window.WindowOnBackInvokedDispatcher")
                .getMethod("isOnBackInvokedCallbackEnabled", android.content.Context.class).invoke(null, a);
        assertTrue("with enableOnBackInvokedCallback the back key/gesture goes through OnBackInvokedCallback, not onBackPressed", enabled);

        ((OnBackInvokedCallback) top).onBackInvoked();
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals("게임을 끝낼까요?", latestDialogTitle());
        AlertDialog first = ShadowAlertDialog.getLatestAlertDialog();
        ((OnBackInvokedCallback) top).onBackInvoked();              // a second back while it is open: no second dialog
        shadowOf(Looper.getMainLooper()).idle();
        assertSame(first, ShadowAlertDialog.getLatestAlertDialog());
        assertEquals(1, ShadowDialog.getShownDialogs().size());

        first.getButton(AlertDialog.BUTTON_POSITIVE).performClick();  // 끝내기
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals("pagehide fired before closing (the game saves on it)", PAGEHIDE, shadowOf(web(a)).getLastLoadedUrl());
        assertFalse("not closed before the save had its moment", a.isFinishing());
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(400));
        assertTrue("closed after 끝내기", a.isFinishing());
    }

    @Test
    @Config(sdk = 36)
    public void api36_continueKeepsPlaying() {
        MainActivity a = start();
        a.askToExit();
        shadowOf(Looper.getMainLooper()).idle();
        AlertDialog d = ShadowAlertDialog.getLatestAlertDialog();
        assertEquals("계속하기", String.valueOf(d.getButton(AlertDialog.BUTTON_NEGATIVE).getText()));
        d.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1));
        assertFalse(d.isShowing());
        assertFalse(a.isFinishing());
        assertEquals(START, shadowOf(web(a)).getLastLoadedUrl());
    }

    // ------------------------------------------------------------------ Android 10 (the old path, unchanged)
    @Test
    @Config(sdk = 29)
    public void api29_oldFullScreenFlags_insetsUntouched_onBackPressedAsks() {
        MainActivity a = start();
        Window w = a.getWindow();
        int vis = w.getDecorView().getSystemUiVisibility();
        assertTrue("SYSTEM_UI_FLAG_FULLSCREEN", (vis & View.SYSTEM_UI_FLAG_FULLSCREEN) != 0);
        assertTrue("SYSTEM_UI_FLAG_HIDE_NAVIGATION", (vis & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) != 0);
        assertTrue("SYSTEM_UI_FLAG_IMMERSIVE_STICKY", (vis & View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY) != 0);
        assertEquals("cutout mode left at DEFAULT", WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT,
                w.getAttributes().layoutInDisplayCutoutMode);
        FrameLayout root = root(a);
        root.dispatchApplyWindowInsets(new WindowInsets.Builder().setSystemWindowInsets(Insets.of(0, 0, 0, 120)).build());
        assertEquals("the root does not pad itself before Android 11", 0, root.getPaddingBottom());
        a.onBackPressed();
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals("게임을 끝낼까요?", latestDialogTitle());
        assertEquals(START, shadowOf(web(a)).getLastLoadedUrl());
    }

    // ------------------------------------------------------------------ 마을 옮기기: window.SnowbloomAndroid
    static final String CODE = "[행복한 눈꽃마을 이야기] 마을 옮기기 코드\nSNOWBLOOM1.z.12.abcdefghijkl.0a1b2c3d";

    private static WebBridge bridge(MainActivity a) {
        Object o = shadowOf(web(a)).getJavascriptInterface(WebBridge.NAME);
        assertTrue("window.SnowbloomAndroid is a WebBridge", o instanceof WebBridge);
        return (WebBridge) o;
    }

    private static ClipboardManager clip(MainActivity a) {
        return (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
    }

    @Test
    @Config(sdk = {29, 36})
    public void moveVillage_bridgeCopiesSharesAndPastesOnTheGamesOwnPage() {
        MainActivity a = start();
        WebBridge b = bridge(a);
        // the page start the WebView reports before the game's scripts run
        shadowOf(web(a)).getWebViewClient().onPageStarted(web(a), START, null);
        assertTrue("the game's own page is trusted", b.trusted());

        assertTrue("copy() succeeds", b.copy(CODE));
        ClipData c = clip(a).getPrimaryClip();
        assertNotNull("something is on the clipboard", c);
        assertEquals("the clipboard holds exactly the code", CODE, String.valueOf(c.getItemAt(0).getText()));

        clip(a).setPrimaryClip(ClipData.newPlainText("memo", "SNOWBLOOM1.j.3.abc.00000000"));
        assertEquals("paste() reads the clipboard", "SNOWBLOOM1.j.3.abc.00000000", b.paste());

        assertTrue("share() succeeds", b.share(CODE));
        shadowOf(Looper.getMainLooper()).idle();
        Intent chooser = shadowOf(a).getNextStartedActivity();
        assertNotNull("an activity was started", chooser);
        assertEquals("the phone's share sheet (chooser)", Intent.ACTION_CHOOSER, chooser.getAction());
        Intent send = chooser.getParcelableExtra(Intent.EXTRA_INTENT);
        assertNotNull("the chooser wraps the send intent", send);
        assertEquals(Intent.ACTION_SEND, send.getAction());
        assertEquals("text/plain", send.getType());
        assertEquals("the shared text is exactly the code", CODE, send.getStringExtra(Intent.EXTRA_TEXT));
        assertFalse("the app keeps running behind the share sheet", a.isFinishing());
    }

    @Test
    @Config(sdk = 36)
    public void moveVillage_bridgeRefusesAnyOtherPage() {
        MainActivity a = start();
        WebBridge b = bridge(a);
        clip(a).setPrimaryClip(ClipData.newPlainText("memo", "secret"));
        for (String other : new String[] { "https://example.com/", "https://appassets.androidplatform.net.evil.com/index.html",
                "data:text/html,<p>hi</p>", "about:blank" }) {
            shadowOf(web(a)).getWebViewClient().onPageStarted(web(a), other, null);
            assertFalse("untrusted: " + other, b.trusted());
            assertFalse("copy refused on " + other, b.copy(CODE));
            assertFalse("share refused on " + other, b.share(CODE));
            assertEquals("paste refused on " + other, "", b.paste());
        }
        shadowOf(Looper.getMainLooper()).idle();
        assertTrue("no share sheet was opened", shadowOf(a).getNextStartedActivity() == null);
        assertEquals("the clipboard is untouched", "secret", String.valueOf(clip(a).getPrimaryClip().getItemAt(0).getText()));
        // back on the game's page: allowed again; too long a text is refused (the page falls back to its own copy)
        shadowOf(web(a)).getWebViewClient().onPageStarted(web(a), START, null);
        assertTrue(b.copy(CODE));
        StringBuilder big = new StringBuilder();
        while (big.length() <= WebBridge.MAX_CHARS) big.append("SNOWBLOOM1");
        assertFalse("a text over MAX_CHARS is refused", b.copy(big.toString()));
        assertFalse(b.share(big.toString()));
    }

    // ------------------------------------------------------------------ (4.2.0.1) the game's sound
    /** ShadowWebView that also logs the calls whose ORDER matters (the page's pause / resume / quiet question, onPause /
     *  onResume, timers) and keeps the JS_QUIET callbacks for the test to answer as the page would */
    @Implements(WebView.class)
    public static class RecordingWebView extends ShadowWebView {
        static final List<String> LOG = new ArrayList<>();
        static final List<ValueCallback<String>> QUIET = new ArrayList<>();

        @Implementation protected void onPause() { LOG.add("onPause"); super.onPause(); }

        @Implementation protected void onResume() { LOG.add("onResume"); super.onResume(); }

        @Implementation protected void pauseTimers() { LOG.add("pauseTimers"); }

        @Implementation protected void resumeTimers() { LOG.add("resumeTimers"); }

        @Implementation protected void evaluateJavascript(String script, ValueCallback<String> callback) {
            LOG.add(MainActivity.JS_PAUSE.equals(script) ? "js:pause" : MainActivity.JS_RESUME.equals(script) ? "js:resume"
                    : MainActivity.JS_QUIET.equals(script) ? "js:quiet" : "js:" + script);
            if (MainActivity.JS_QUIET.equals(script)) {
                assertNotNull("the quiet question wants an answer", callback);
                QUIET.add(callback);
            }
            super.evaluateJavascript(script, callback);
        }
    }

    private static ActivityController<MainActivity> launch() {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            RuntimeEnvironment.getApplication().getApplicationInfo().setEnableOnBackInvokedCallback(true);
        }
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        idle();
        RecordingWebView.LOG.clear();
        RecordingWebView.QUIET.clear();
        return c;
    }

    private static void idle() { shadowOf(Looper.getMainLooper()).idle(); }

    private static void idleFor(long ms) { shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms)); }

    private static List<String> log() { return new ArrayList<>(RecordingWebView.LOG); }

    /** the log without the quiet questions (asked every 100 ms until the page answers) */
    private static List<String> pageLog() {
        List<String> l = log();
        l.removeIf("js:quiet"::equals);
        return l;
    }

    private static long count(String what) { return log().stream().filter(what::equals).count(); }

    /** the page answers every JS_QUIET asked so far ("true": its AudioContext is no longer running) */
    private static void answerQuiet(String value) {
        List<ValueCallback<String>> cbs = new ArrayList<>(RecordingWebView.QUIET);
        RecordingWebView.QUIET.clear();
        assertFalse("the app asked the page whether its sound has stopped", cbs.isEmpty());
        for (ValueCallback<String> cb : cbs) cb.onReceiveValue(value);
        idle();
    }

    private static ShadowAudioManager audio(MainActivity a) {
        return shadowOf((AudioManager) a.getApplicationContext().getSystemService(Context.AUDIO_SERVICE));
    }

    /** the game's page is up and has said its music is on (Audio.init -> tellApp): the app takes audio focus */
    private static ShadowAudioManager musicOn(MainActivity a) {
        ShadowAudioManager sam = audio(a);
        shadowOf(web(a)).getWebViewClient().onPageStarted(web(a), START, null);
        bridge(a).gameMusic(true);
        idle();
        return sam;
    }

    private static AudioManager.OnAudioFocusChangeListener listener(ShadowAudioManager sam) {
        ShadowAudioManager.AudioFocusRequest r = sam.getLastAudioFocusRequest();
        assertNotNull("audio focus was asked for", r);
        AudioManager.OnAudioFocusChangeListener l = r.listener != null ? r.listener : r.audioFocusRequest.getOnAudioFocusChangeListener();
        assertNotNull(l);
        return l;
    }

    /** a finger on the game (Activity.dispatchTouchEvent calls onUserInteraction on ACTION_DOWN) */
    private static void tap(MainActivity a) {
        long t = android.os.SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, 200, 400, 0);
        MotionEvent up = MotionEvent.obtain(t, t + 50, MotionEvent.ACTION_UP, 200, 400, 0);
        a.dispatchTouchEvent(down);
        a.dispatchTouchEvent(up);
        down.recycle();
        up.recycle();
        idle();
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_homeSilencesThePageFirst_timersStopOnlyOnceItsSoundStopped_resumeBringsItBack() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        WebBridge b = bridge(a);
        assertTrue("in front: the game may be heard", a.audioAllowed() && b.audioAllowed());

        c.pause();
        idle();
        assertEquals("silence first (the page still runs), then hide the page; the timers wait", Arrays.asList("js:pause", "onPause"), pageLog());
        assertTrue("the app asks the page whether its sound has stopped", count("js:quiet") >= 1);
        assertFalse("the bridge reports it (a page that boots now starts silent)", b.audioAllowed());
        idleFor(1500);
        assertFalse("no pauseTimers before the page has answered", log().contains("pauseTimers"));
        answerQuiet("true");
        idleFor(150);
        assertEquals("pauseTimers once the page has answered", "pauseTimers", log().get(log().size() - 1));
        assertEquals(1, count("pauseTimers"));

        RecordingWebView.LOG.clear();
        c.resume();
        idle();
        assertEquals("timers and page back, then the sound", Arrays.asList("resumeTimers", "onResume", "js:resume"), log());
        assertTrue(a.audioAllowed() && b.audioAllowed());
    }

    @Test
    @Config(sdk = 36, shadows = RecordingWebView.class)
    public void sound_timersWaitForTheSave_aSilentPageStillStops_aQuickReturnCancels() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        // the page answers at once: pauseTimers still waits TIMERS_MIN_MS (its visibilitychange save)
        c.pause();
        idle();
        answerQuiet("true");
        idleFor(MainActivity.TIMERS_MIN_MS - 100);
        assertFalse("not before " + MainActivity.TIMERS_MIN_MS + " ms", log().contains("pauseTimers"));
        idleFor(200);
        assertTrue("then pauseTimers", log().contains("pauseTimers"));
        c.resume();
        idle();
        // a page that never answers (busy, gone): pauseTimers after TIMERS_MAX_MS anyway
        RecordingWebView.LOG.clear();
        c.pause();
        idle();
        idleFor(MainActivity.TIMERS_MAX_MS - 200);
        assertFalse(log().contains("pauseTimers"));
        idleFor(400);
        assertTrue("pauseTimers at the latest after " + MainActivity.TIMERS_MAX_MS + " ms", log().contains("pauseTimers"));
        // a quick return cancels the pending pauseTimers
        c.resume();
        idle();
        RecordingWebView.QUIET.clear();
        RecordingWebView.LOG.clear();
        c.pause();
        idle();
        idleFor(100);
        c.resume();
        idle();
        idleFor(3000);
        assertFalse("back within 100 ms: the timers were never paused", log().contains("pauseTimers"));
        assertEquals("js:resume", pageLog().get(pageLog().size() - 1));
        assertTrue(a.audioAllowed());
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_timersWaitUntilTheContextHasReallyStopped_andAnOlderAnswerDoesNotCount() {
        // (review L1) a later WebView may make AudioContext.suspend() a posted task: the page has run the pause but its
        // context still reports 'running'; pauseTimers() now would freeze that task and the music would play on
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        c.pause();
        idle();
        answerQuiet("false");                          // the pause ran, the context still runs
        idleFor(700);
        assertFalse("not while the page's sound still runs", log().contains("pauseTimers"));
        assertTrue("asked again every 100 ms", count("js:quiet") >= 4);
        answerQuiet("false");
        idleFor(300);
        assertFalse(log().contains("pauseTimers"));
        answerQuiet("true");                           // the suspend has landed
        idleFor(150);
        assertEquals("then pauseTimers", 1, count("pauseTimers"));
        idleFor(2000);
        assertEquals("once", 1, count("pauseTimers"));
        // an answer that belongs to an earlier pause does not let the timers stop for a newer one
        c.resume();
        idle();
        RecordingWebView.QUIET.clear();
        c.pause();
        idle();
        List<ValueCallback<String>> older = new ArrayList<>(RecordingWebView.QUIET);
        c.resume();
        idle();
        RecordingWebView.QUIET.clear();
        RecordingWebView.LOG.clear();
        c.pause();
        idle();
        for (ValueCallback<String> cb : older) cb.onReceiveValue("true");
        idleFor(900);
        assertFalse("the earlier pause's answer is ignored", log().contains("pauseTimers"));
        answerQuiet("true");
        idleFor(150);
        assertTrue(log().contains("pauseTimers"));
        // the cap still holds for a page whose context never stops
        c.resume();
        idle();
        RecordingWebView.QUIET.clear();
        RecordingWebView.LOG.clear();
        c.pause();
        idle();
        for (int i = 0; i < 25; i++) {                 // every question answered "still running"
            for (ValueCallback<String> cb : new ArrayList<>(RecordingWebView.QUIET)) cb.onReceiveValue("false");
            RecordingWebView.QUIET.clear();
            idleFor(100);
        }
        assertTrue("at the latest after " + MainActivity.TIMERS_MAX_MS + " ms", log().contains("pauseTimers"));
        assertFalse(a.audioAllowed());
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_rendererLostInTheBackground_theNewPageStartsSilentAndItsTimersStop() {
        // (review L4) the renderer goes while the app is in the background: the new WebView must be hidden, silent and
        // get a pauseTimers of its own, (A) after the old one's timers were paused long ago (Android takes a background
        // renderer back for memory), (B) when the pending pauseTimers comes due while there is no WebView (it gives up)
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        // A
        c.pause();
        idle();
        answerQuiet("true");
        idleFor(500);
        assertEquals(1, count("pauseTimers"));
        WebView old = web(a);
        RecordingWebView.LOG.clear();
        assertTrue(shadowOf(old).getWebViewClient().onRenderProcessGone(old, null));
        idle();
        WebView neu = web(a);
        assertTrue("a new WebView", neu != old);
        assertFalse("the new page boots silent (audioAllowed false)", bridge(a).audioAllowed());
        assertTrue("the new page is hidden", log().contains("onPause"));
        answerQuiet("true");
        idleFor(500);
        assertEquals("A: the new WebView's timers are paused too", 1, count("pauseTimers"));
        // B
        c.resume();
        idle();
        RecordingWebView.QUIET.clear();
        c.pause();
        idle();
        answerQuiet("true");
        ShadowSystemClock.advanceBy(Duration.ofMillis(MainActivity.TIMERS_MIN_MS + 50));   // the pauseTimers is due...
        old = web(a);
        RecordingWebView.LOG.clear();
        assertTrue(shadowOf(old).getWebViewClient().onRenderProcessGone(old, null));      // ...when the renderer goes
        idle();                                        // (it runs first, finds no WebView and gives up)
        assertTrue("a new WebView", web(a) != old);
        assertFalse(bridge(a).audioAllowed());
        answerQuiet("true");
        idleFor(500);
        assertEquals("B: the new WebView's timers are paused", 1, count("pauseTimers"));
        RecordingWebView.LOG.clear();
        c.resume();
        idle();
        assertEquals(Arrays.asList("resumeTimers", "onResume", "js:resume"), log());
        assertTrue(a.audioAllowed());
    }

    @Test
    @Config(sdk = 36, shadows = RecordingWebView.class)
    public void sound_lockScreen_waitsForTheWindowFocus() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        KeyguardManager km = (KeyguardManager) a.getSystemService(Context.KEYGUARD_SERVICE);
        c.pause();                                     // screen off
        idle();
        shadowOf(km).setKeyguardLocked(true);
        c.windowFocusChanged(false);
        RecordingWebView.LOG.clear();
        c.resume();                                    // screen on, lock screen still up (some phones resume the app here)
        idle();
        assertFalse("no sound on the lock screen", log().contains("js:resume"));
        assertFalse(a.audioAllowed());
        assertFalse(bridge(a).audioAllowed());
        shadowOf(km).setKeyguardLocked(false);         // unlocked: the game's window gets the focus
        c.windowFocusChanged(true);
        idle();
        assertEquals("js:resume", log().get(log().size() - 1));
        assertTrue(a.audioAllowed());
        // losing the focus alone (volume panel, notification shade) keeps the sound
        RecordingWebView.LOG.clear();
        c.windowFocusChanged(false);
        idle();
        assertTrue(a.audioAllowed());
        assertTrue(log().isEmpty());
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_exitDialogSilences_continueBackAndHomeUnderIt_exitKeepsSilent() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        // 계속하기
        a.askToExit();
        idle();
        assertEquals("the dialog silences the game", Arrays.asList("js:pause"), log());
        assertFalse(a.audioAllowed());
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
        idle();
        assertEquals(Arrays.asList("js:pause", "js:resume"), log());
        assertTrue(a.audioAllowed());
        // back again while it is up (cancel)
        a.askToExit();
        idle();
        assertFalse(a.audioAllowed());
        ShadowAlertDialog.getLatestAlertDialog().cancel();
        idle();
        assertTrue("back / a tap beside it closes it: sound again", a.audioAllowed());
        // Home while it is up, then back to the game: still silent until it is closed
        a.askToExit();
        idle();
        c.pause();
        idle();
        RecordingWebView.LOG.clear();
        c.resume();
        idle();
        assertFalse("the dialog is still up", log().contains("js:resume"));
        assertFalse(a.audioAllowed());
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
        idle();
        assertTrue(log().contains("js:resume"));
        assertTrue(a.audioAllowed());
        // 끝내기: silent to the end, pagehide (the save), then the app closes
        a.askToExit();
        idle();
        RecordingWebView.LOG.clear();
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();
        idle();
        assertFalse("끝내기 never lets the sound back", log().contains("js:resume"));
        assertFalse(a.audioAllowed());
        assertEquals(PAGEHIDE, shadowOf(web(a)).getLastLoadedUrl());
        idleFor(400);
        assertTrue(a.isFinishing());
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_audioFocus_lostSilences_gainBrings_givenBackOnPause_delayedDuringACall_noneWithMusicOff() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        ShadowAudioManager sam = audio(a);
        assertNull("no audio focus before the page has said its music is on", sam.getLastAudioFocusRequest());
        musicOn(a);                                                         // the game boots (Audio.init -> tellApp)
        ShadowAudioManager.AudioFocusRequest r = sam.getLastAudioFocusRequest();
        assertNotNull("the game asks for audio focus once its music is on", r);
        assertNotNull("an AudioFocusRequest (Android 8+)", r.audioFocusRequest);
        assertEquals(AudioManager.AUDIOFOCUS_GAIN, r.audioFocusRequest.getFocusGain());
        assertEquals("as a game", AudioAttributes.USAGE_GAME, r.audioFocusRequest.getAudioAttributes().getUsage());
        AudioManager.OnAudioFocusChangeListener l = listener(sam);

        l.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT);       // a call rings, an alarm
        idle();
        assertEquals(Arrays.asList("js:pause"), log());
        assertFalse(a.audioAllowed());
        l.onAudioFocusChange(AudioManager.AUDIOFOCUS_GAIN);                 // over
        idle();
        assertEquals(Arrays.asList("js:pause", "js:resume"), log());
        assertTrue(a.audioAllowed());
        l.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK);   // a notification: Android ducks the game itself
        idle();
        assertTrue(a.audioAllowed());
        l.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);                 // another app's music
        idle();
        assertFalse(a.audioAllowed());

        c.pause();
        idle();
        assertSame("the focus is given back on pause", r.audioFocusRequest, sam.getLastAbandonedAudioFocusRequest());
        c.resume();
        idle();
        assertTrue("asked again on resume: sound", a.audioAllowed());

        // a call is on when the game comes back: DELAYED -> silent until the focus comes
        c.pause();
        idle();
        sam.setNextFocusRequestResponse(MainActivity.FOCUS_REQUEST_DELAYED);
        c.resume();
        idle();
        sam.setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        assertFalse(a.audioAllowed());
        ShadowAudioManager.AudioFocusRequest waiting = sam.getLastAudioFocusRequest();
        tap(a);
        assertSame("a tap does not ask again: Android gives it back by itself", waiting, sam.getLastAudioFocusRequest());
        l.onAudioFocusChange(AudioManager.AUDIOFOCUS_GAIN);
        idle();
        assertTrue(a.audioAllowed());

        // the game's music off (the page tells the bridge): the focus is given back and not asked for again
        bridge(a).gameMusic(false);
        idle();
        ShadowAudioManager.AudioFocusRequest before = sam.getLastAudioFocusRequest();
        c.pause();
        idle();
        c.resume();
        idle();
        assertSame("no new request while the music is off (the player's own music app keeps playing)", before, sam.getLastAudioFocusRequest());
        assertTrue(a.audioAllowed());
        bridge(a).gameMusic(true);
        idle();
        assertTrue("music on again: asked again", before != sam.getLastAudioFocusRequest());
        // and an untrusted page cannot change it
        shadowOf(web(a)).getWebViewClient().onPageStarted(web(a), "https://example.com/", null);
        ShadowAudioManager.AudioFocusRequest now = sam.getLastAudioFocusRequest();
        bridge(a).gameMusic(false);
        idle();
        c.pause();
        idle();
        c.resume();
        idle();
        assertTrue("an untrusted page's gameMusic(false) is ignored", now != sam.getLastAudioFocusRequest());
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_anotherAppsMusicTookTheFocus_aTapOrTheShadeClosingAsksAgainOnceThatMusicStopped() {
        // (review M1) Android never gives the focus back after a permanent loss: the game used to stay silent until the
        // player left and came back. Now a tap or the window back in front asks again, but only once no other app is
        // playing music (a player who started their own music from the notification shade keeps it)
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        ShadowAudioManager sam = musicOn(a);
        AudioManager.OnAudioFocusChangeListener l = listener(sam);
        try {
            l.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);            // Melon starts from the notification shade
            idle();
            assertFalse(a.audioAllowed());
            sam.setIsMusicActive(true);
            ShadowAudioManager.AudioFocusRequest before = sam.getLastAudioFocusRequest();
            tap(a);
            c.windowFocusChanged(false);
            c.windowFocusChanged(true);
            idle();
            assertSame("their music plays: neither a tap nor the shade closing takes it back", before, sam.getLastAudioFocusRequest());
            assertFalse("the game stays silent meanwhile", a.audioAllowed());
            sam.setIsMusicActive(false);                                    // they stopped it
            RecordingWebView.LOG.clear();
            tap(a);
            assertTrue("the next tap asks again", before != sam.getLastAudioFocusRequest());
            assertTrue(a.audioAllowed());
            assertEquals(Arrays.asList("js:resume"), log());
            before = sam.getLastAudioFocusRequest();
            tap(a);
            assertSame("held now: a tap asks nothing", before, sam.getLastAudioFocusRequest());
            // again, and this time they stop it from the shade: closing the shade (the window's focus) asks again
            listener(sam).onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);
            idle();
            assertFalse(a.audioAllowed());
            c.windowFocusChanged(false);
            before = sam.getLastAudioFocusRequest();
            c.windowFocusChanged(true);
            idle();
            assertTrue("the shade closed with nothing else playing: asked again", before != sam.getLastAudioFocusRequest());
            assertTrue(a.audioAllowed());
            // gone for good, then the music switched off in the game: the focus is given back, its sounds play along
            listener(sam).onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);
            idle();
            sam.setIsMusicActive(true);
            bridge(a).gameMusic(false);
            idle();
            assertTrue("music off: the game's sounds play beside the player's music", a.audioAllowed());
        } finally {
            sam.setIsMusicActive(false);
        }
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_focusIsNotTakenUnderTheLockScreenOrTheExitDialog_butWhenTheyGo() {
        // (review L3) while the game stays silent anyway, the player's own music is not paused for nothing
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        ShadowAudioManager sam = musicOn(a);
        KeyguardManager km = (KeyguardManager) a.getSystemService(Context.KEYGUARD_SERVICE);
        // the exit dialog up, Home, back: no request until the dialog is closed
        a.askToExit();
        idle();
        c.pause();
        idle();
        ShadowAudioManager.AudioFocusRequest before = sam.getLastAudioFocusRequest();
        assertSame("given back on pause", before.audioFocusRequest, sam.getLastAbandonedAudioFocusRequest());
        c.resume();
        idle();
        assertSame("no request while the exit dialog is up", before, sam.getLastAudioFocusRequest());
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();   // 계속하기
        idle();
        assertTrue("asked once it is closed", before != sam.getLastAudioFocusRequest());
        assertTrue(a.audioAllowed());
        // resumed under the lock screen: no request until the game's window has the focus
        c.pause();
        idle();
        shadowOf(km).setKeyguardLocked(true);
        c.windowFocusChanged(false);
        before = sam.getLastAudioFocusRequest();
        c.resume();
        idle();
        assertSame("no request under the lock screen", before, sam.getLastAudioFocusRequest());
        shadowOf(km).setKeyguardLocked(false);
        c.windowFocusChanged(true);
        idle();
        assertTrue("asked once the game is in front", before != sam.getLastAudioFocusRequest());
        assertTrue(a.audioAllowed());
        // a call is on when the dialog (left open across Home) closes: DELAYED, silent with no resume in between
        a.askToExit();
        idle();
        c.pause();
        idle();
        c.resume();
        idle();
        sam.setNextFocusRequestResponse(MainActivity.FOCUS_REQUEST_DELAYED);
        RecordingWebView.LOG.clear();
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
        idle();
        sam.setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        assertFalse("a call is on: still silent", a.audioAllowed());
        assertFalse("not even a moment of sound", log().contains("js:resume"));
        listener(sam).onAudioFocusChange(AudioManager.AUDIOFOCUS_GAIN);
        idle();
        assertTrue(a.audioAllowed());
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_focusRefusedDuringACall_silentUntilATapAfterTheCall_refusedOtherwisePlaysAsBefore() {
        // (review L2) Android 7 has no DELAYED: a request during a call answers FAILED. The same rule on every version:
        // refused while a call (or a KakaoTalk voice call: MODE_IN_COMMUNICATION) is on = silent, asked again on a tap
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        ShadowAudioManager sam = audio(a);
        AudioManager am = (AudioManager) a.getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
        try {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            sam.setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_FAILED);
            musicOn(a);
            assertFalse("refused during a call: silent (no music into the call)", a.audioAllowed());
            ShadowAudioManager.AudioFocusRequest before = sam.getLastAudioFocusRequest();
            tap(a);
            assertTrue("a tap asks again", before != sam.getLastAudioFocusRequest());
            assertFalse("still in the call: still silent", a.audioAllowed());
            am.setMode(AudioManager.MODE_NORMAL);                           // the call ends
            sam.setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
            tap(a);
            assertTrue("after the call a tap brings the sound back", a.audioAllowed());
            // refused with no call on (a reason the app does not know): plays as before
            c.pause();
            idle();
            sam.setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_FAILED);
            c.resume();
            idle();
            assertTrue("refused without a call: the game plays as before", a.audioAllowed());
        } finally {
            am.setMode(AudioManager.MODE_NORMAL);
            sam.setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        }
    }

    @Test
    @Config(sdk = {29, 36}, shadows = RecordingWebView.class)
    public void sound_startsWithoutATap_volumeKeysSetTheGame_andAMusicOffPlayerKeepsTheirOwnMusicFromTheFirstStart() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        // the WebView's autoplay rule: the game's AudioContext runs before any tap (src/core/Audio.js autoStart: the
        // title's intro plays bgm_title and its sounds from the first frame)
        assertFalse("sound may start without a tap", web(a).getSettings().getMediaPlaybackRequiresUserGesture());
        assertEquals("the volume keys set the media (game) volume, also while it is silent", AudioManager.STREAM_MUSIC, a.getVolumeControlStream());
        // a player whose music is off: the page says so as it boots, no audio focus is ever taken
        ShadowAudioManager sam = audio(a);
        shadowOf(web(a)).getWebViewClient().onPageStarted(web(a), START, null);
        bridge(a).gameMusic(false);
        idle();
        c.pause();
        idle();
        c.resume();
        idle();
        tap(a);
        assertNull("music off from the start: the player's own music app is never paused", sam.getLastAudioFocusRequest());
        assertTrue("the game's sounds still play", a.audioAllowed());
    }
}
