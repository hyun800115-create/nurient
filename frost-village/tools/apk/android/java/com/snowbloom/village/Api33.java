// 행복한 눈꽃마을 이야기 · Snowbloom Village — Android app (tools/apk).
//
// Android 13+ (API 33) back handling. With targetSdk 36 on Android 16 the back gesture and the back button no longer
// call Activity.onBackPressed() and KEYCODE_BACK is not dispatched (predictive back is the default); the manifest's
// android:enableOnBackInvokedCallback="true" makes Android 13-15 behave the same way. The only way to see "back" is
// an OnBackInvokedCallback, registered here; it opens the same 「게임을 끝낼까요?」 dialog as onBackPressed() on
// Android 7-12. In a class of its own so that older phones never load it (MainActivity calls it only on API 33+).
package com.snowbloom.village;

import android.app.Activity;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

final class Api33 {
    private Api33() {}

    /** the callback the dispatcher calls for every back gesture / back button press while the game is in front */
    static final class BackCallback implements OnBackInvokedCallback {
        private final MainActivity activity;

        BackCallback(MainActivity activity) {
            this.activity = activity;
        }

        @Override
        public void onBackInvoked() {
            activity.askToExit();
        }
    }

    /** registers the back callback; returns it (for unregisterBack) or null when the platform has no dispatcher */
    static Object registerBack(MainActivity a) {
        Object d = MainActivity.call(Activity.class, a, "getOnBackInvokedDispatcher", new Class<?>[0]);
        if (!(d instanceof OnBackInvokedDispatcher)) return null;
        BackCallback cb = new BackCallback(a);
        ((OnBackInvokedDispatcher) d).registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
        return cb;
    }

    static void unregisterBack(Activity a, Object cb) {
        if (!(cb instanceof OnBackInvokedCallback)) return;
        Object d = MainActivity.call(Activity.class, a, "getOnBackInvokedDispatcher", new Class<?>[0]);
        if (d instanceof OnBackInvokedDispatcher) ((OnBackInvokedDispatcher) d).unregisterOnBackInvokedCallback((OnBackInvokedCallback) cb);
    }
}
