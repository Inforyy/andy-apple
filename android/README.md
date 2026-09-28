# Andy Apples voor Android

`AndyApples.apk` is het spel als Android-app. De app laat het spel schermvullend en altijd liggend zien, en werkt ook zonder internet (alleen online multiplayer heeft internet nodig).

## Installeren op je telefoon

1. Open deze repository op je telefoon, tik op **`AndyApples.apk`** en daarna op **Download** (of stuur het bestand naar je telefoon via bijv. e-mail, Google Drive of een USB-kabel).
2. Open het gedownloade bestand. Android vraagt waarschijnlijk of je **apps uit deze bron** (je browser of bestandsbeheer) mag installeren: zet dat aan en ga terug.
3. Tik op **Installeren**. Play Protect kan waarschuwen dat de app onbekend is (hij komt niet uit de Play Store): kies **Toch installeren**.
4. Andy Apples staat nu tussen je apps.

Werkt vanaf **Android 7.0**. Je voortgang wordt in de app zelf bewaard. Die staat los van je voortgang in de browser: zet hem eventueel over met **Opslaan → Exporteer** (browser) en **Importeer** (app).

## Zelf opnieuw bouwen

`build_apk.py` bouwt de APK zonder Android Studio of Android SDK. Nodig: Python 3 en een JDK (17+), plus drie jars van Maven Central in een map `tools/`:

| Bestand | Maven Central |
| --- | --- |
| `tools/android-all.jar` | `org.robolectric:android-all:14-robolectric-10818077` |
| `tools/dx.jar` | `com.jakewharton.android.repackaged:dalvik-dx:16.0.1` |
| `tools/apksig.jar` | `com.android.tools.build:apksig:2.3.0` |

```sh
keytool -genkeypair -keystore andy.p12 -storetype PKCS12 -alias andy -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Andy Apples"
python3 build_apk.py --tools tools --keystore andy.p12 --storepass JOUW_WACHTWOORD --version 1.1 --code 2
```

Het script compileert `src/.../MainActivity.java`, schrijft de Android-manifest en resourcetabel zelf, pakt het spel (`../index.html`, `../css/` en `../js/`) in als assets en ondertekent de APK. Een update installeert alleen over de oude versie heen als hij met **dezelfde sleutel** is ondertekend en een hogere `--code` heeft.
