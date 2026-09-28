import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** Ondertekent de APK (schema v2, Android 7.0+) met een PKCS12-keystore en controleert het resultaat meteen. */
public class Sign {
    public static void main(String[] a) throws Exception {
        String keystore = a[0], pass = a[1], alias = a[2], in = a[3], out = a[4];
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream f = new FileInputStream(keystore)) { ks.load(f, pass.toCharArray()); }
        PrivateKey key = (PrivateKey) ks.getKey(alias, pass.toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(alias);
        ApkSigner.SignerConfig cfg = new ApkSigner.SignerConfig.Builder("ANDY", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(cfg))
            .setInputApk(new File(in)).setOutputApk(new File(out))
            .setMinSdkVersion(24).setV1SigningEnabled(false).setV2SigningEnabled(true)
            .setCreatedBy("Andy Apples build_apk.py").build().sign();
        ApkVerifier.Result r = new ApkVerifier.Builder(new File(out)).build().verify();
        System.out.println("verified=" + r.isVerified() + " v1=" + r.isVerifiedUsingV1Scheme() + " v2=" + r.isVerifiedUsingV2Scheme());
        for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("FOUT: " + e);
        if (!r.isVerified()) System.exit(1);
    }
}
