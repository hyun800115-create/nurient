// COMPILE-ONLY STUB (tools/apk): android.window.OnBackInvokedDispatcher is API 33, newer than the API 16 stub
// android.jar the app compiles against. Class path only, never dexed or packed. Exactly the members the app uses, with
// the SDK's signatures and constant values (checked against the real API 36 framework by tools/apk/test/api36_check.py).
package android.window;

public interface OnBackInvokedDispatcher {
    int PRIORITY_DEFAULT = 0;

    void registerOnBackInvokedCallback(int priority, OnBackInvokedCallback callback);

    void unregisterOnBackInvokedCallback(OnBackInvokedCallback callback);
}
