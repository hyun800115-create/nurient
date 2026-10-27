// COMPILE-ONLY STUB (tools/apk): android.graphics.Insets is API 29, newer than the API 16 stub android.jar the app
// compiles against. Class path only, never dexed or packed. Exactly the members the app uses, with the SDK's signatures
// (checked against the real API 36 framework by tools/apk/test/api36_check.py).
package android.graphics;

public final class Insets {
    public static final Insets NONE = null;

    public final int left;
    public final int top;
    public final int right;
    public final int bottom;

    private Insets() {
        left = 0;
        top = 0;
        right = 0;
        bottom = 0;
    }
}
