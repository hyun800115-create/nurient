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
// Run: mvn -q -f frost-village/tools/apk/test/robolectric/pom.xml test   (see the pom)
package com.snowbloom.village;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Insets;
import android.graphics.Rect;
import android.os.Looper;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;

import java.time.Duration;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadow.api.Shadow;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.shadows.ShadowDialog;

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
}
