// 행복한 눈꽃마을 이야기 · Snowbloom Village — Android test app (tools/apk).
//
// Maps the app's virtual https origin to the game files packed in the APK:
//   https://appassets.androidplatform.net/<path>  ->  APK assets/www/<path>
// Pure Java (no android.* imports) so the same class also runs on a desktop JVM: tools/apk/test/AssetServer.java
// serves a built APK through it for the headless-Chromium boot test.
package com.snowbloom.village;

import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class AssetRouter {
    /** reserved by Android for exactly this use (androidx WebViewAssetLoader uses it too); never resolved on a network */
    public static final String HOST = "appassets.androidplatform.net";
    public static final String ORIGIN = "https://" + HOST;
    public static final String START_URL = ORIGIN + "/index.html";
    /** folder inside the APK's assets/ that holds the game */
    public static final String ASSET_ROOT = "www/";

    private static final Map<String, String> MIME = new HashMap<String, String>();
    private static final Set<String> TEXT = new HashSet<String>();

    static {
        text("html", "text/html");
        text("htm", "text/html");
        text("js", "text/javascript");
        text("mjs", "text/javascript");
        text("json", "application/json");
        text("map", "application/json");
        text("css", "text/css");
        text("txt", "text/plain");
        text("md", "text/markdown");
        text("svg", "image/svg+xml");
        text("xml", "application/xml");
        text("webmanifest", "application/manifest+json");
        MIME.put("webp", "image/webp");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("gif", "image/gif");
        MIME.put("ico", "image/x-icon");
        MIME.put("avif", "image/avif");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("oga", "audio/ogg");
        MIME.put("m4a", "audio/mp4");
        MIME.put("aac", "audio/aac");
        MIME.put("wav", "audio/wav");
        MIME.put("mp4", "video/mp4");
        MIME.put("webm", "video/webm");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf");
        MIME.put("otf", "font/otf");
        MIME.put("wasm", "application/wasm");
        MIME.put("bin", "application/octet-stream");
    }

    private static void text(String ext, String mime) {
        MIME.put(ext, mime);
        TEXT.add(ext);
    }

    /** One request of the virtual origin. assetPath == null: ours, but not a file the game can have (answer 404). */
    public static final class Route {
        public final String assetPath;   // e.g. "www/assets/ui/manifest.json"
        public final String mime;        // e.g. "application/json"
        public final String encoding;    // "utf-8" for text, null for binary

        Route(String assetPath, String mime, String encoding) {
            this.assetPath = assetPath;
            this.mime = mime;
            this.encoding = encoding;
        }
    }

    private AssetRouter() {}

    /** MIME type for a file name ("application/octet-stream" when unknown) */
    public static String mimeOf(String name) {
        String m = MIME.get(extOf(name));
        return m != null ? m : "application/octet-stream";
    }

    /** true for the types served with charset utf-8 */
    public static boolean isText(String name) {
        return TEXT.contains(extOf(name));
    }

    private static String extOf(String name) {
        int slash = name.lastIndexOf('/');
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot < slash) return "";
        return name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /**
     * Route a URL. Returns null when the URL is not on the virtual origin (the WebView handles it itself; with no
     * INTERNET permission any other http(s) load simply fails), a Route with assetPath == null for a bad path.
     */
    public static Route resolve(String url) {
        if (url == null) return null;
        String lower = url.length() > ORIGIN.length() + 1 ? url.substring(0, ORIGIN.length() + 1).toLowerCase(Locale.ROOT) : url.toLowerCase(Locale.ROOT);
        if (!lower.startsWith(ORIGIN)) return null;
        String rest = url.substring(ORIGIN.length());
        if (rest.length() > 0) {
            char c = rest.charAt(0);
            if (c == ':') {                                   // explicit default port
                if (!rest.startsWith(":443")) return null;
                rest = rest.substring(4);
                if (rest.length() > 0 && "/?#".indexOf(rest.charAt(0)) < 0) return null;
            } else if ("/?#".indexOf(c) < 0) {
                return null;                                  // e.g. https://appassets.androidplatform.net.evil.com/
            }
        }
        int cut = indexOfAny(rest, "?#");
        if (cut >= 0) rest = rest.substring(0, cut);
        while (rest.startsWith("/")) rest = rest.substring(1);
        if (rest.length() == 0 || rest.endsWith("/")) rest = rest + "index.html";
        String path = percentDecode(rest);
        if (path == null) return new Route(null, "text/plain", "utf-8");
        StringBuilder clean = new StringBuilder();
        for (String seg : path.split("/", -1)) {
            if (seg.length() == 0 || seg.equals(".")) continue;
            if (seg.equals("..") || seg.indexOf('\\') >= 0 || seg.indexOf('\0') >= 0) return new Route(null, "text/plain", "utf-8");
            if (clean.length() > 0) clean.append('/');
            clean.append(seg);
        }
        if (clean.length() == 0) clean.append("index.html");
        String p = clean.toString();
        return new Route(ASSET_ROOT + p, mimeOf(p), isText(p) ? "utf-8" : null);
    }

    private static int indexOfAny(String s, String chars) {
        for (int i = 0; i < s.length(); i++) if (chars.indexOf(s.charAt(i)) >= 0) return i;
        return -1;
    }

    /** %XX decoding as UTF-8 (a '+' stays a '+': this is a path, not a form). null on a malformed escape. */
    static String percentDecode(String s) {
        if (s.indexOf('%') < 0) return s;
        ByteArrayOutputStream out = new ByteArrayOutputStream(s.length());
        try {
            int i = 0;
            while (i < s.length()) {
                if (s.charAt(i) == '%') {
                    if (i + 2 >= s.length()) return null;
                    int hi = Character.digit(s.charAt(i + 1), 16), lo = Character.digit(s.charAt(i + 2), 16);
                    if (hi < 0 || lo < 0) return null;
                    out.write((hi << 4) | lo);
                    i += 3;
                } else {
                    int j = s.indexOf('%', i);
                    if (j < 0) j = s.length();
                    byte[] b = s.substring(i, j).getBytes("UTF-8");   // a whole run, so surrogate pairs stay together
                    out.write(b, 0, b.length);
                    i = j;
                }
            }
            return new String(out.toByteArray(), "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return null;
        }
    }
}
