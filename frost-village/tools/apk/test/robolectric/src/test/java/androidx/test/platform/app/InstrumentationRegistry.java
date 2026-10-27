// TEST-ONLY STAND-IN (tools/apk/test/robolectric): Robolectric needs a few classes of androidx.test:monitor /
// espresso-idling-resource, which are .aar files on Google's Maven repository (dl.google.com, not reachable from this
// build). These minimal versions have the same names and the members Robolectric calls; the tests do not use them.
package androidx.test.platform.app;

import android.app.Instrumentation;
import android.os.Bundle;

public final class InstrumentationRegistry {
    private static volatile Instrumentation instrumentation;
    private static volatile Bundle arguments;

    private InstrumentationRegistry() {}

    public static Instrumentation getInstrumentation() {
        if (instrumentation == null) throw new IllegalStateException("no Instrumentation registered");
        return instrumentation;
    }

    public static Bundle getArguments() {
        return arguments == null ? new Bundle() : new Bundle(arguments);
    }

    public static void registerInstance(Instrumentation i, Bundle args) {
        instrumentation = i;
        arguments = args == null ? null : new Bundle(args);
    }
}
