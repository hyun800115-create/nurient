package com.nurient.tvcode;

import android.webkit.ValueCallback;

/** Leaves the app when the page reports it had nothing to close. */
class BackResult implements ValueCallback<String> {
    private final MainActivity activity;

    BackResult(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public void onReceiveValue(String handled) {
        if (!"true".equals(handled)) activity.exitApp();
    }
}
