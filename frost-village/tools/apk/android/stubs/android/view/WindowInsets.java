// COMPILE-ONLY STUB (tools/apk): android.view.WindowInsets (API 20; the members below are API 29/30) is newer than the
// API 16 stub android.jar the app compiles against. It is on javac's class path only and is never dexed or packed: the
// phone's own framework class is used at run time (the app calls these only on Android 11+, see Api30.java).
// Exactly the members the app uses, with the Android SDK's signatures; tools/apk/test/api36_check.py compares every
// member of every stub with the real Android 16 (API 36) framework classes.
package android.view;

import android.graphics.Insets;

public final class WindowInsets {
    /** API 30 */
    public static final WindowInsets CONSUMED = null;

    private WindowInsets() {}

    /** API 30: the insets of the given types that are visible now (0 for hidden bars) */
    public Insets getInsets(int typeMask) { return null; }

    /** API 30 */
    public boolean isVisible(int typeMask) { return false; }

    /** API 30 */
    public static final class Type {
        private Type() {}

        public static int statusBars() { return 0; }

        public static int navigationBars() { return 0; }

        public static int ime() { return 0; }

        public static int systemBars() { return 0; }

        public static int displayCutout() { return 0; }
    }

    /** API 29 (setInsets: API 30) */
    public static final class Builder {
        public Builder(WindowInsets insets) {}

        public Builder setInsets(int typeMask, Insets insets) { return this; }

        public WindowInsets build() { return null; }
    }
}
