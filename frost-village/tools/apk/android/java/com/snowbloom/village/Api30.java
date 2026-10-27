// 행복한 눈꽃마을 이야기 · Snowbloom Village — Android app (tools/apk).
//
// Android 11+ (API 30) window code: edge-to-edge, the keyboard and the camera cutout through WindowInsets, and the
// full-screen mode through WindowInsetsController. In a class of its own so that phones older than Android 11 never load
// it (MainActivity calls it only when Build.VERSION.SDK_INT >= 30). The API 29/30 types compile against the
// compile-only stubs in tools/apk/android/stubs; methods added to older classes are called by reflection.
//
// Why: an app with targetSdk 35+ is always edge-to-edge on Android 15+ (targetSdk 36 removes the opt-out). The window
// then covers the status bar, the navigation bar and the camera cutout, and android:windowSoftInputMode="adjustResize"
// no longer shrinks it for the keyboard. So on every Android 11+ phone the app asks for the same edge-to-edge window
// itself (one behaviour on Android 11-16, the one Android 15+ would force anyway) and MainActivity.GameFrame pads the
// game by what it must not cover: the visible bars, the cutout and the keyboard.
package com.snowbloom.village;

import android.graphics.Insets;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

final class Api30 {
    /** WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS (API 30): what Android 15+ uses for targetSdk 35+ */
    static final int CUTOUT_MODE_ALWAYS = 3;

    private Api30() {}

    /** what the game must not be drawn under: the bars that are showing, the camera cutout and the keyboard */
    static int guardedTypes() {
        return WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
    }

    /** the window covers the whole screen, cutout included (GameFrame keeps the game clear of it) */
    static void edgeToEdge(Window w) {
        MainActivity.call(Window.class, w, "setDecorFitsSystemWindows", new Class<?>[] { boolean.class }, false);
        try {
            WindowManager.LayoutParams lp = w.getAttributes();
            WindowManager.LayoutParams.class.getField("layoutInDisplayCutoutMode").setInt(lp, CUTOUT_MODE_ALWAYS);   // API 28 field
            w.setAttributes(lp);
        } catch (Exception e) {
            Log.w(MainActivity.TAG, "layoutInDisplayCutoutMode not available: " + e);
        }
    }

    /** full screen: status and navigation bars hidden; a swipe from the edge shows them for a moment, over the game */
    static void hideBars(Window w) {
        Object c = MainActivity.call(Window.class, w, "getInsetsController", new Class<?>[0]);
        if (!(c instanceof WindowInsetsController)) return;
        WindowInsetsController ic = (WindowInsetsController) c;
        ic.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        ic.hide(WindowInsets.Type.systemBars());
    }

    /**
     * Pads the view by the guarded insets and returns the insets for its children with exactly those types set to
     * zero (the pattern of developer.android.com "Understand window insets in WebView"): the WebView inside is never
     * under a bar, the cutout or the keyboard, and it is told so, so it adds no safe-area inset or keyboard resize of
     * its own on top (the page's env(safe-area-inset-*) stays 0, as in the targetSdk 34 app).
     */
    static WindowInsets apply(View v, WindowInsets in) {
        int types = guardedTypes();
        Insets i = in.getInsets(types);
        if (v.getPaddingLeft() != i.left || v.getPaddingTop() != i.top || v.getPaddingRight() != i.right || v.getPaddingBottom() != i.bottom) {
            v.setPadding(i.left, i.top, i.right, i.bottom);
        }
        return new WindowInsets.Builder(in).setInsets(types, Insets.NONE).build();
    }

    /** a status or navigation bar is showing for good (not just the transient swipe, which never changes the insets) */
    static boolean barsShowing(WindowInsets in) {
        return in.isVisible(WindowInsets.Type.statusBars()) || in.isVisible(WindowInsets.Type.navigationBars());
    }
}
