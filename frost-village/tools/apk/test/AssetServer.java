// Snowbloom Village APK pipeline (tools/apk) — test harness, desktop JVM.
//
// Serves the game packed inside a built APK (assets/www/) through the app's own AssetRouter class
// (tools/apk/android/java/com/snowbloom/village/AssetRouter.java, the exact code MainActivity uses to answer the
// WebView), so the headless-Chromium boot test (boot_test.mjs) sees what the phone's WebView sees: same paths, same
// MIME types and charsets, same 404s.
//
//   javac -d <out> AssetRouter.java AssetServer.java
//   java -cp <out> AssetServer <app.apk> [port]        prints "READY <port>", then one line per 404
//   java -cp <out> AssetServer --selftest <app.apk>    routes every packed file + edge cases, prints JSON, exit 1 on failure
import com.snowbloom.village.AssetRouter;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public class AssetServer {
    public static void main(String[] a) throws Exception {
        if (a.length >= 2 && a[0].equals("--selftest")) {
            System.exit(selfTest(new ZipFile(a[1])) ? 0 : 1);
        }
        final ZipFile zip = new ZipFile(a[0]);
        int port = a.length > 1 ? Integer.parseInt(a[1]) : 0;
        final AtomicInteger served = new AtomicInteger();
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 64);
        s.createContext("/", (HttpExchange ex) -> {
            try {
                String raw = ex.getRequestURI().getRawPath();
                String q = ex.getRequestURI().getRawQuery();
                String url = AssetRouter.ORIGIN + raw + (q != null ? "?" + q : "");
                AssetRouter.Route r = AssetRouter.resolve(url);
                byte[] body = null;
                if (r != null && r.assetPath != null) {
                    ZipEntry e = zip.getEntry("assets/" + r.assetPath);
                    if (e != null) body = readAll(zip.getInputStream(e));
                }
                if (body == null) {
                    System.out.println("404 " + raw);
                    System.out.flush();
                    ex.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
                    ex.sendResponseHeaders(404, -1);
                } else {
                    // what WebResourceResponse(mime, encoding, stream) + MainActivity's headers give the WebView
                    ex.getResponseHeaders().set("Content-Type", r.mime + (r.encoding != null ? "; charset=" + r.encoding : ""));
                    ex.getResponseHeaders().set("Cache-Control", "no-cache");
                    ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                    ex.sendResponseHeaders(200, body.length == 0 ? -1 : body.length);
                    if (body.length > 0) {
                        OutputStream o = ex.getResponseBody();
                        o.write(body);
                        o.close();
                    }
                    served.incrementAndGet();
                }
            } catch (IOException e) {
                System.out.println("ERR " + e);
            } finally {
                ex.close();
            }
        });
        s.setExecutor(Executors.newFixedThreadPool(6));
        s.start();
        System.out.println("READY " + s.getAddress().getPort());
        System.out.flush();
    }

    static byte[] readAll(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] b = new byte[1 << 16];
            for (int n; (n = in.read(b)) > 0; ) o.write(b, 0, n);
            return o.toByteArray();
        } finally {
            in.close();
        }
    }

    /** every packed file is reachable at its URL with a known type; the edge cases route (or refuse) as intended */
    static boolean selfTest(ZipFile zip) {
        List<String> fails = new ArrayList<String>();
        int files = 0, text = 0;
        java.util.TreeMap<String, Integer> types = new java.util.TreeMap<String, Integer>();
        for (Enumeration<? extends ZipEntry> en = zip.entries(); en.hasMoreElements(); ) {
            ZipEntry e = en.nextElement();
            if (!e.getName().startsWith("assets/www/") || e.isDirectory()) continue;
            String p = e.getName().substring("assets/www/".length());
            files++;
            AssetRouter.Route r = AssetRouter.resolve(AssetRouter.ORIGIN + "/" + encodePath(p) + "?v=1");
            if (r == null || !("www/" + p).equals(r.assetPath)) fails.add("route " + p + " -> " + (r == null ? "null" : r.assetPath));
            else if (r.mime.equals("application/octet-stream")) fails.add("unknown type " + p);
            if (r != null && r.encoding != null) text++;
            if (r != null) types.merge(r.mime, 1, Integer::sum);
        }
        String O = AssetRouter.ORIGIN;
        String[][] cases = {
            {O, "www/index.html"}, {O + "/", "www/index.html"}, {O + "/index.html?x=1#top", "www/index.html"},
            {O + "#frag", "www/index.html"}, {O + "/lib/", "www/lib/index.html"}, {O + "//game.js", "www/game.js"},
            {O + "/./game.js", "www/game.js"}, {"https://APPASSETS.androidplatform.net/game.js", "www/game.js"},
            {O + ":443/game.js", "www/game.js"}, {O + "/a%20b+c.png", "www/a b+c.png"},
            {O + "/%E2%9D%84.webp", "www/❄.webp"},
            {O + "/../secret", "404"}, {O + "/assets/../../x", "404"}, {O + "/%2e%2e/x", "404"}, {O + "/x%zz", "404"},
            {O + "/x%2", "404"}, {O + "/a%5Cb", "404"},
            {"https://appassets.androidplatform.net.evil.example/x", "null"}, {"http://appassets.androidplatform.net/x", "null"},
            {O + ":8443/x", "null"}, {"https://example.com/", "null"}, {"data:text/plain,hi", "null"}, {null, "null"},
        };
        for (String[] c : cases) {
            AssetRouter.Route r = AssetRouter.resolve(c[0]);
            String got = r == null ? "null" : (r.assetPath == null ? "404" : r.assetPath);
            if (!got.equals(c[1])) fails.add("case " + c[0] + " -> " + got + " (want " + c[1] + ")");
        }
        String[][] mimes = {{"index.html", "text/html"}, {"game.js", "text/javascript"}, {"a.json", "application/json"},
            {"a.webp", "image/webp"}, {"a.PNG", "image/png"}, {"a.jpg", "image/jpeg"}, {"a.mp3", "audio/mpeg"},
            {"a.ogg", "audio/ogg"}, {"a.woff2", "font/woff2"}, {"a.woff", "font/woff"}, {"a.css", "text/css"},
            {"a.wasm", "application/wasm"}, {"a.md", "text/markdown"}, {"dir.x/noext", "application/octet-stream"}};
        for (String[] m : mimes) if (!AssetRouter.mimeOf(m[0]).equals(m[1])) fails.add("mime " + m[0] + " -> " + AssetRouter.mimeOf(m[0]));
        if (!AssetRouter.isText("a.js") || AssetRouter.isText("a.png")) fails.add("text/binary charset rule");
        StringBuilder j = new StringBuilder("{\"files\":").append(files).append(",\"textFiles\":").append(text)
            .append(",\"cases\":").append(cases.length + mimes.length).append(",\"types\":{");
        boolean first = true;
        for (java.util.Map.Entry<String, Integer> t : types.entrySet()) {
            if (!first) j.append(',');
            first = false;
            j.append('"').append(t.getKey()).append("\":").append(t.getValue());
        }
        j.append("},\"failures\":[");
        for (int i = 0; i < fails.size(); i++) j.append(i > 0 ? "," : "").append('"').append(fails.get(i).replace("\"", "'")).append('"');
        j.append("]}");
        System.out.println(j);
        return files > 0 && fails.isEmpty();
    }

    /** percent-encode a path like a browser would (keeps / and unreserved characters) */
    static String encodePath(String p) {
        StringBuilder b = new StringBuilder();
        for (byte x : p.getBytes(StandardCharsets.UTF_8)) {
            int c = x & 0xff;
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || "/-._~".indexOf(c) >= 0) b.append((char) c);
            else b.append(String.format("%%%02X", c));
        }
        return b.toString();
    }
}
