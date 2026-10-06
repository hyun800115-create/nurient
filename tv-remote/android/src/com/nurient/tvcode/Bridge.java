package com.nurient.tvcode;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.webkit.JavascriptInterface;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Clipboard and hashing for the page, exposed as window.AndroidBridge. */
class Bridge {
    private final Context context;

    Bridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public boolean copy(String text) {
        ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null) return false;
        cm.setPrimaryClip(ClipData.newPlainText("codes", text));
        return true;
    }

    @JavascriptInterface
    public String sha256(String text) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}
