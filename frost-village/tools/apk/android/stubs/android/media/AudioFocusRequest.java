// COMPILE-ONLY STUB (tools/apk): android.media.AudioFocusRequest is API 26, newer than the API 16 stub android.jar the
// app compiles against. Class path only, never dexed or packed: the phone's own framework class is used at run time
// (only on Android 8+, see Api26.java). Exactly the members the app uses, with the SDK's signatures (checked against
// the real API 36 framework by tools/apk/test/api36_check.py).
package android.media;

import android.os.Handler;

public final class AudioFocusRequest {
    private AudioFocusRequest() {}

    public static final class Builder {
        public Builder(int focusGain) {}

        public Builder setAudioAttributes(AudioAttributes attributes) { return this; }

        public Builder setAcceptsDelayedFocusGain(boolean acceptsDelayedFocusGain) { return this; }

        public Builder setWillPauseWhenDucked(boolean pauseOnDuck) { return this; }

        public Builder setOnAudioFocusChangeListener(AudioManager.OnAudioFocusChangeListener listener, Handler handler) { return this; }

        public AudioFocusRequest build() { return null; }
    }
}
