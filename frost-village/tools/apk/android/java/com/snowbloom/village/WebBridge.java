// 행복한 눈꽃마을 이야기 · Snowbloom Village — Android app (tools/apk).
//
// window.SnowbloomAndroid: what the game's 「마을 옮기기」 (Move village, src/scenes/MovePanel.js) needs from the phone and
// a web page cannot do reliably inside a WebView — put the village code on the clipboard, open the phone's share sheet
// with it (KakaoTalk '나와의 채팅', a memo app, Gmail), and read the clipboard back for 「붙여넣기」.
//   copy(text) -> true when it is on the clipboard · share(text) -> true when the share sheet is opening · paste() -> the
//   clipboard's text ("" when empty or refused)
// Only the game's own pages may use it: every call checks that the page now in the WebView is on the app's virtual
// origin (AssetRouter.ORIGIN; MainActivity reports each page start). No permission is needed (the clipboard and
// ACTION_SEND need none); nothing goes over the network. WebView calls these methods on its own background thread, so
// the clipboard and the share sheet are used on the main thread (minSdk 24: ClipboardManager / ClipData API 11).
package com.snowbloom.village;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

final class WebBridge {
    /** the name the page sees: window.SnowbloomAndroid */
    static final String NAME = "SnowbloomAndroid";
    /** a longer text is refused (the clipboard and an Intent travel through a ~1 MB Binder buffer); the page then falls
     *  back to its own copy */
    static final int MAX_CHARS = 400000;
    static final String SUBJECT = "행복한 눈꽃마을 이야기 · 마을 옮기기 코드";
    static final String CHOOSER_TITLE = "마을 코드 보내기";

    private final Activity activity;
    private final Handler ui = new Handler(Looper.getMainLooper());
    /** the main-frame page now in the WebView (set on the main thread, read on WebView's bridge thread) */
    private volatile String pageUrl = "";

    WebBridge(Activity activity) {
        this.activity = activity;
    }

    /** MainActivity: a page started loading in the main frame */
    void setPage(String url) {
        pageUrl = url == null ? "" : url;
    }

    /** the page now shown is the game's own (the virtual https origin), not any other page the WebView might show */
    boolean trusted() {
        return AssetRouter.resolve(pageUrl) != null;
    }

    private interface Job<T> {
        T run();
    }

    /** runs on the main thread and waits for it (at most 3 s); directly when already there */
    private <T> T onMain(final Job<T> job, T fallback) {
        if (Looper.myLooper() == Looper.getMainLooper()) return job.run();
        final Object[] out = new Object[1];
        final CountDownLatch done = new CountDownLatch(1);
        ui.post(new Runnable() {
            @Override public void run() {
                try {
                    out[0] = job.run();
                } catch (RuntimeException e) {
                    Log.w(MainActivity.TAG, "bridge", e);
                } finally {
                    done.countDown();
                }
            }
        });
        try {
            if (!done.await(3, TimeUnit.SECONDS)) return fallback;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return fallback;
        }
        @SuppressWarnings("unchecked") T r = (T) out[0];
        return r != null ? r : fallback;
    }

    private ClipboardManager clipboard() {
        Object o = activity.getSystemService(Context.CLIPBOARD_SERVICE);
        return o instanceof ClipboardManager ? (ClipboardManager) o : null;
    }

    @JavascriptInterface
    public boolean copy(final String text) {
        if (!trusted() || text == null || text.length() == 0 || text.length() > MAX_CHARS) return false;
        return onMain(new Job<Boolean>() {
            @Override public Boolean run() {
                ClipboardManager cm = clipboard();
                if (cm == null) return false;
                cm.setPrimaryClip(ClipData.newPlainText(SUBJECT, text));
                return true;
            }
        }, false);
    }

    @JavascriptInterface
    public boolean share(final String text) {
        if (!trusted() || text == null || text.length() == 0 || text.length() > MAX_CHARS) return false;
        return onMain(new Job<Boolean>() {
            @Override public Boolean run() {
                if (activity.isFinishing()) return false;
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text);
                send.putExtra(Intent.EXTRA_SUBJECT, SUBJECT);
                try {
                    activity.startActivity(Intent.createChooser(send, CHOOSER_TITLE));
                    return true;
                } catch (ActivityNotFoundException e) {
                    Log.w(MainActivity.TAG, "no app to share with");
                    return false;
                }
            }
        }, false);
    }

    @JavascriptInterface
    public String paste() {
        if (!trusted()) return "";
        return onMain(new Job<String>() {
            @Override public String run() {
                ClipboardManager cm = clipboard();
                ClipData clip = cm != null ? cm.getPrimaryClip() : null;      // (Android 10+: only while the game has focus)
                if (clip == null || clip.getItemCount() == 0) return "";
                CharSequence t = clip.getItemAt(0).coerceToText(activity);
                return t != null && t.length() <= MAX_CHARS ? t.toString() : "";
            }
        }, "");
    }
}
