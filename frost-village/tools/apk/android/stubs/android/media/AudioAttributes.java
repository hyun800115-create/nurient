// COMPILE-ONLY STUB (tools/apk): android.media.AudioAttributes is API 21, newer than the API 16 stub android.jar the
// app compiles against. Class path only, never dexed or packed: the phone's own framework class is used at run time
// (the app uses it only on Android 8+, see Api26.java). Exactly the members the app uses, with the SDK's signatures and
// constant values (checked against the real API 36 framework by tools/apk/test/api36_check.py).
package android.media;

public final class AudioAttributes {
    public static final int USAGE_GAME = 14;
    public static final int CONTENT_TYPE_MUSIC = 2;

    private AudioAttributes() {}

    public static class Builder {
        public Builder() {}

        public Builder setUsage(int usage) { return this; }

        public Builder setContentType(int contentType) { return this; }

        public AudioAttributes build() { return null; }
    }
}
