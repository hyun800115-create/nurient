// COMPILE-ONLY STUB (tools/apk): android.view.WindowInsetsController is API 30, newer than the API 16 stub android.jar
// the app compiles against. Class path only, never dexed or packed. Exactly the members the app uses, with the SDK's
// signatures and constant values (checked against the real API 36 framework by tools/apk/test/api36_check.py).
package android.view;

public interface WindowInsetsController {
    /** system bars hidden; a swipe from the edge shows them for a moment, over the content (the old sticky immersive) */
    int BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE = 2;

    void hide(int types);

    void setSystemBarsBehavior(int behavior);
}
