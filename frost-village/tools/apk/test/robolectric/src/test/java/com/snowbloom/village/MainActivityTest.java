// Snowbloom Village Android app (tools/apk) — MainActivity under Robolectric (the real Android framework code on a JVM).
//
// What a phone would do and the off-device checks cannot show otherwise:
//   Android 16 (API 36, the app's targetSdk): the window is edge-to-edge with the cutout mode ALWAYS; the root view pads
//   itself by the camera cutout / visible bars / keyboard and hands the WebView zeroed insets (no double padding); the
//   bars are hidden with transient-by-swipe behaviour; the back callback is the window's top OnBackInvokedCallback and
//   opens 「게임을 끝낼까요?」 once; 끝내기 fires pagehide and closes the app.
//   Android 10 (API 29): the old path is unchanged (system-UI flags, the window fits the bars itself, onBackPressed).
// Run: mvn -q -f frost-village/tools/apk/test/robolectric/pom.xml test   (see the pom)
package com.snowbloom.village;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlertDialog;
import android.graphics.Insets;
import android.os.Looper;
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

    // ------------------------------------------------------------------ Android 16 (targetSdk 36)
    @Test
    @Config(sdk = 36)
    public void api36_windowIsEdgeToEdgeAndKeepsTheOldBasics() {
        MainActivity a = start();
        Window w = a.getWindow();
        assertEquals("cutout mode ALWAYS (what Android 15+ forces for targetSdk 35+)",
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS, w.getAttributes().layoutInDisplayCutoutMode);
        assertFalse("decor does not fit system windows (edge-to-edge)", w.getDecorFitsSystemWindows());
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
    @Config(sdk = 36)
    public void api36_rootPadsByCutoutAndKeyboard_webViewGetsZeroedInsets() {
        MainActivity a = start();
        FrameLayout root = root(a);
        final WindowInsets[] seen = new WindowInsets[1];
        web(a).setOnApplyWindowInsetsListener((v, in) -> {
            seen[0] = in;
            return in;
        });
        int guarded = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();

        // full screen (bars hidden) on a phone with a punch-hole camera: only the cutout
        root.dispatchApplyWindowInsets(new WindowInsets.Builder()
                .setInsets(WindowInsets.Type.displayCutout(), Insets.of(0, 96, 0, 0)).build());
        assertEquals(96, root.getPaddingTop());
        assertEquals(0, root.getPaddingBottom());
        assertNotNull("the WebView got insets", seen[0]);
        assertEquals("the WebView sees no cutout (no double padding)", Insets.NONE, seen[0].getInsets(guarded));

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
    @Config(sdk = 36)
    public void api36_backGestureOpensTheExitDialogOnce_andExitSavesFirst() throws Exception {
        MainActivity a = start();
        // what Android 16 calls for a back gesture / back button: the top OnBackInvokedCallback of the window
        Object vri = View.class.getMethod("getViewRootImpl").invoke(a.getWindow().getDecorView());
        assertNotNull("the window is attached (ViewRootImpl)", vri);
        Object dispatcher = vri.getClass().getMethod("getOnBackInvokedDispatcher").invoke(vri);
        Object top = dispatcher.getClass().getMethod("getTopCallback").invoke(dispatcher);
        assertNotNull("a back callback is registered", top);
        assertTrue("the top callback is the game's (" + top.getClass().getName() + ")", top instanceof Api33.BackCallback);
        Boolean enabled = (Boolean) Class.forName("android.window.WindowOnBackInvokedDispatcher")
                .getMethod("isOnBackInvokedCallbackEnabled", android.content.Context.class).invoke(null, a);
        assertTrue("targetSdk 36 on Android 16: back goes through OnBackInvokedCallback (onBackPressed is not called)", enabled);

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
}
