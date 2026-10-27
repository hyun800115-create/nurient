// TEST-ONLY STAND-IN (tools/apk/test/robolectric): Robolectric needs a few classes of androidx.test:monitor /
// espresso-idling-resource, which are .aar files on Google's Maven repository (dl.google.com, not reachable from this
// build). These minimal versions have the same names and the members Robolectric calls; the tests do not use them.
package androidx.test.runner.lifecycle;

public final class ApplicationLifecycleMonitorRegistry {
    private static volatile ApplicationLifecycleMonitor instance;

    private ApplicationLifecycleMonitorRegistry() {}

    public static ApplicationLifecycleMonitor getInstance() {
        return instance;
    }

    public static void registerInstance(ApplicationLifecycleMonitor monitor) {
        instance = monitor;
    }
}
