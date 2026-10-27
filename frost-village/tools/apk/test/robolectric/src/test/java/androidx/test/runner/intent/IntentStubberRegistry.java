// TEST-ONLY STAND-IN (tools/apk/test/robolectric): Robolectric needs a few classes of androidx.test:monitor /
// espresso-idling-resource, which are .aar files on Google's Maven repository (dl.google.com, not reachable from this
// build). These minimal versions have the same names and the members Robolectric calls; the tests do not use them.
package androidx.test.runner.intent;

public final class IntentStubberRegistry {
    private static volatile IntentStubber instance;

    private IntentStubberRegistry() {}

    public static boolean isLoaded() {
        return instance != null;
    }

    public static IntentStubber getInstance() {
        if (instance == null) throw new IllegalStateException("no IntentStubber loaded");
        return instance;
    }

    public static void load(IntentStubber stubber) {
        instance = stubber;
    }
}
