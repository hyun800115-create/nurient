// TEST-ONLY STAND-IN (tools/apk/test/robolectric): Robolectric needs a few classes of androidx.test:monitor /
// espresso-idling-resource, which are .aar files on Google's Maven repository (dl.google.com, not reachable from this
// build). These minimal versions have the same names and the members Robolectric calls; the tests do not use them.
package androidx.test.internal.runner.lifecycle;

import android.app.Activity;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitor;
import androidx.test.runner.lifecycle.Stage;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

public final class ActivityLifecycleMonitorImpl implements ActivityLifecycleMonitor {
    private final Map<Activity, Stage> stages = new WeakHashMap<>();
    private final List<ActivityLifecycleCallback> callbacks = new ArrayList<>();

    public ActivityLifecycleMonitorImpl() {}

    public ActivityLifecycleMonitorImpl(boolean declawThreadCheck) {}

    @Override public void addLifecycleCallback(ActivityLifecycleCallback callback) { callbacks.add(callback); }

    @Override public void removeLifecycleCallback(ActivityLifecycleCallback callback) { callbacks.remove(callback); }

    @Override public Stage getLifecycleStageOf(Activity activity) {
        Stage s = stages.get(activity);
        if (s == null) throw new IllegalArgumentException("unknown activity " + activity);
        return s;
    }

    @Override public Collection<Activity> getActivitiesInStage(Stage stage) {
        List<Activity> out = new ArrayList<>();
        for (Map.Entry<Activity, Stage> e : stages.entrySet()) if (e.getValue() == stage) out.add(e.getKey());
        return out;
    }

    public void signalLifecycleChange(Stage stage, Activity activity) {
        stages.put(activity, stage);
        for (ActivityLifecycleCallback c : new ArrayList<>(callbacks)) c.onActivityLifecycleChanged(activity, stage);
    }
}
