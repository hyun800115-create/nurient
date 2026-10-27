// Snowbloom Village APK pipeline (tools/apk): APK signatures with Google's apksig library
// (com.android.tools.build:apksig 2.3.0 from Maven Central — the code behind the SDK's apksigner). Desktop JVM only.
//
// v1 (JAR) signing is done by the JDK's own jarsigner first (apksig 2.3.0's v1 signer calls a JDK-internal PKCS7
// method that JDK 17+ no longer has). This tool then adds the APK Signature Scheme v2 block with apksig's
// DefaultApkSignerEngine, over the whole jarsigned (and re-aligned) zip, META-INF files included — the same steps
// ApkSigner.sign() takes, minus its v1 part.
//
//   java <exports> -cp apksig.jar:<classes> SignApk v2     <in.apk> <out.apk> <keystore.p12> <storepass> <alias> <minSdk>
//   java <exports> -cp apksig.jar:<classes> SignApk verify <apk> <minSdk> <maxSdk>
// <exports> = --add-exports=java.base/sun.security.{x509,pkcs,util}=ALL-UNNAMED (apksig 2.3.0 touches them).
// verify prints one JSON object and exits 1 unless the APK verifies for every platform in [minSdk, maxSdk]. It also runs
// on the newer apksig inside bundletool (tools/apk/build_aab.py), which knows the v3 scheme bundletool signs with.
import com.android.apksig.ApkSignerEngine;
import com.android.apksig.ApkVerifier;
import com.android.apksig.DefaultApkSignerEngine;
import com.android.apksig.util.DataSources;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class SignApk {
    public static void main(String[] a) throws Exception {
        if (a.length >= 7 && a[0].equals("v2")) {
            addV2(new File(a[1]), new File(a[2]), new File(a[3]), a[4].toCharArray(), a[5], Integer.parseInt(a[6]));
        } else if (a.length >= 4 && a[0].equals("verify")) {
            System.exit(verify(new File(a[1]), Integer.parseInt(a[2]), Integer.parseInt(a[3])) ? 0 : 1);
        } else {
            System.err.println("usage: SignApk v2 <in> <out> <keystore.p12> <storepass> <alias> <minSdk> | verify <apk> <minSdk> <maxSdk>");
            System.exit(2);
        }
    }

    /** add an APK Signature Scheme v2 block (between the last entry and the central directory) */
    static void addV2(File in, File out, File ks, char[] pass, String alias, int minSdk) throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        InputStream s = new FileInputStream(ks);
        try { store.load(s, pass); } finally { s.close(); }
        PrivateKey key = (PrivateKey) store.getKey(alias, pass);
        if (key == null) throw new IllegalArgumentException("no key '" + alias + "' in " + ks);
        List<X509Certificate> chain = new ArrayList<X509Certificate>();
        for (java.security.cert.Certificate c : store.getCertificateChain(alias)) chain.add((X509Certificate) c);

        byte[] apk = Files.readAllBytes(in.toPath());
        // ZIP sections. The writer (build_apk.py) and jarsigner leave no archive comment: EOCD = the last 22 bytes.
        int eocdAt = apk.length - 22;
        ByteBuffer eocd = ByteBuffer.wrap(apk, eocdAt, 22).slice().order(ByteOrder.LITTLE_ENDIAN);
        if (eocd.getInt(0) != 0x06054b50 || (eocd.getShort(20) & 0xffff) != 0) throw new IllegalStateException("EOCD not at the end (zip comment?)");
        long cdSize = eocd.getInt(12) & 0xffffffffL, cdOff = eocd.getInt(16) & 0xffffffffL;
        if (cdOff + cdSize != eocdAt) throw new IllegalStateException("central directory does not end at the EOCD");
        for (int i = (int) cdOff - 16; i >= Math.max(0, (int) cdOff - 64); i--) {
            if (new String(apk, i, 16, "ISO-8859-1").equals("APK Sig Block 42")) throw new IllegalStateException("already has an APK Signing Block");
        }

        DefaultApkSignerEngine.SignerConfig cfg = new DefaultApkSignerEngine.SignerConfig.Builder("CERT", key, chain).build();
        DefaultApkSignerEngine engine = new DefaultApkSignerEngine.Builder(Collections.singletonList(cfg), minSdk)
                .setV1SigningEnabled(false)       // v1 is jarsigner's (already in the zip and covered by this v2 signature)
                .setV2SigningEnabled(true)
                .setCreatedBy("Snowbloom Village tools/apk (jarsigner v1 + apksig v2)")
                .build();
        byte[] eocdCopy = new byte[22];
        System.arraycopy(apk, eocdAt, eocdCopy, 0, 22);
        ApkSignerEngine.OutputApkSigningBlockRequest req = engine.outputZipSections(
                DataSources.asDataSource(ByteBuffer.wrap(apk, 0, (int) cdOff).slice()),
                DataSources.asDataSource(ByteBuffer.wrap(apk, (int) cdOff, (int) cdSize).slice()),
                DataSources.asDataSource(ByteBuffer.wrap(eocdCopy)));
        if (req == null) throw new IllegalStateException("the engine made no signing block");
        byte[] block = req.getApkSigningBlock();
        req.done();
        engine.outputDone();
        engine.close();

        ByteBuffer newEocd = ByteBuffer.wrap(eocdCopy).order(ByteOrder.LITTLE_ENDIAN);
        newEocd.putInt(16, (int) (cdOff + block.length));
        OutputStream o = new FileOutputStream(out);
        try {
            o.write(apk, 0, (int) cdOff);             // entries (local headers + data), unchanged
            o.write(block);                           // APK Signing Block
            o.write(apk, (int) cdOff, (int) cdSize);  // central directory, unchanged
            o.write(eocdCopy);                        // EOCD with the moved central directory offset
        } finally {
            o.close();
        }
    }

    static boolean verify(File apk, int minSdk, int maxSdk) throws Exception {
        ApkVerifier.Result r = new ApkVerifier.Builder(apk)
                .setMinCheckedPlatformVersion(minSdk)
                .setMaxCheckedPlatformVersion(maxSdk)
                .build()
                .verify();
        List<String> errors = new ArrayList<String>(), warnings = new ArrayList<String>();
        for (Object e : r.getErrors()) errors.add(e.toString());
        for (Object w : r.getWarnings()) warnings.add(w.toString());
        for (ApkVerifier.Result.V1SchemeSignerInfo si : r.getV1SchemeSigners()) {
            for (Object e : si.getErrors()) errors.add("v1 " + si.getName() + ": " + e);
            for (Object w : si.getWarnings()) warnings.add("v1 " + si.getName() + ": " + w);
        }
        for (ApkVerifier.Result.V2SchemeSignerInfo si : r.getV2SchemeSigners()) {
            for (Object e : si.getErrors()) errors.add("v2 #" + si.getIndex() + ": " + e);
            for (Object w : si.getWarnings()) warnings.add("v2 #" + si.getIndex() + ": " + w);
        }
        StringBuilder j = new StringBuilder("{");
        j.append("\"verified\":").append(r.isVerified());
        j.append(",\"v1\":").append(r.isVerifiedUsingV1Scheme());
        j.append(",\"v2\":").append(r.isVerifiedUsingV2Scheme());
        j.append(",\"v3\":").append(flag(r, "isVerifiedUsingV3Scheme"));     // newer apksig only (bundletool's)
        j.append(",\"checkedSdk\":[").append(minSdk).append(',').append(maxSdk).append(']');
        j.append(",\"signers\":[");
        boolean first = true;
        for (X509Certificate c : r.getSignerCertificates()) {
            if (!first) j.append(',');
            first = false;
            j.append("{\"subject\":").append(q(c.getSubjectX500Principal().getName()))
             .append(",\"sha256\":").append(q(hex(MessageDigest.getInstance("SHA-256").digest(c.getEncoded()))))
             .append(",\"keyAlg\":").append(q(c.getPublicKey().getAlgorithm()))
             .append(",\"sigAlg\":").append(q(c.getSigAlgName()))
             .append(",\"notAfter\":").append(q(c.getNotAfter().toInstant().toString()))
             .append('}');
        }
        j.append("],\"errors\":").append(list(errors)).append(",\"warnings\":").append(list(warnings)).append('}');
        System.out.println(j);
        return r.isVerified() && errors.isEmpty();
    }

    /** a boolean getter that only newer apksig versions have (null when this apksig does not know it) */
    static Boolean flag(Object o, String getter) {
        try {
            return (Boolean) o.getClass().getMethod(getter).invoke(o);
        } catch (Exception e) {
            return null;
        }
    }

    static String list(List<String> l) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < l.size(); i++) { if (i > 0) b.append(','); b.append(q(l.get(i))); }
        return b.append(']').toString();
    }

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    static String hex(byte[] d) {
        StringBuilder b = new StringBuilder();
        for (byte x : d) b.append(String.format("%02x", x & 0xff));
        return b.toString();
    }
}
