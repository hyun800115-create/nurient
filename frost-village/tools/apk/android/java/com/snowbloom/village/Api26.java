// 행복한 눈꽃마을 이야기 · Snowbloom Village — Android app (tools/apk).
//
// (4.2.0.1) Android 8+ (API 26) audio focus: an AudioFocusRequest with the game's own attributes (USAGE_GAME,
// CONTENT_TYPE_MUSIC), so a phone call, an alarm or another app's music takes the focus from the game and MainActivity
// silences it until the focus comes back (AUDIOFOCUS_GAIN). A call that is already on answers DELAYED (silent until
// GAIN). Android 8+ ducks the game by itself for short sounds (navigation, notifications). In a class of its own so
// that older phones never load it (MainActivity calls it only on API 26+; Android 7 uses the old requestAudioFocus).
// The API 21/26 types compile against the compile-only stubs in tools/apk/android/stubs; AudioManager's API 26
// methods are called by reflection (the stub android.jar is API 16).
package com.snowbloom.village;

import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;

final class Api26 {
    private Api26() {}

    /** the game's request: AUDIOFOCUS_GAIN for as long as it is in front, changes reported on the main thread */
    static Object focusRequest(AudioManager.OnAudioFocusChangeListener listener, Handler handler) {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
        return new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(true)
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(listener, handler)
                .build();
    }

    /** AUDIOFOCUS_REQUEST_GRANTED / _FAILED / _DELAYED (FAILED when the call itself fails) */
    static int request(AudioManager am, Object req) {
        if (!(req instanceof AudioFocusRequest)) return AudioManager.AUDIOFOCUS_REQUEST_FAILED;
        Object r = MainActivity.call(AudioManager.class, am, "requestAudioFocus", new Class<?>[] { AudioFocusRequest.class }, req);
        return r instanceof Integer ? ((Integer) r).intValue() : AudioManager.AUDIOFOCUS_REQUEST_FAILED;
    }

    static void abandon(AudioManager am, Object req) {
        if (req instanceof AudioFocusRequest) {
            MainActivity.call(AudioManager.class, am, "abandonAudioFocusRequest", new Class<?>[] { AudioFocusRequest.class }, req);
        }
    }
}
