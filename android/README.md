# Andy Apples voor Android

`AndyApples.apk` is het spel als Android-app. De app laat het spel schermvullend en altijd liggend zien, en werkt ook zonder internet (alleen online multiplayer heeft internet nodig).

## Installeren op je telefoon

1. Open deze repository op je telefoon, tik op **`AndyApples.apk`** en daarna op **Download** (of stuur het bestand naar je telefoon via bijv. e-mail, Google Drive of een USB-kabel).
2. Open het gedownloade bestand. Android vraagt waarschijnlijk of je **apps uit deze bron** (je browser of bestandsbeheer) mag installeren: zet dat aan en ga terug.
3. Tik op **Installeren**. Play Protect kan waarschuwen dat de app onbekend is (hij komt niet uit de Play Store): kies **Toch installeren**.
4. Andy Apples staat nu tussen je apps.

**Versie 1.6 heeft een nieuwe sleutel.** Had je een oudere versie (1.5 of eerder) geïnstalleerd, verwijder die dan eerst: Android installeert een app met een andere sleutel niet over de oude heen. Je voortgang in de app gaat daarbij verloren, tenzij je met een **account** speelt (dan staat hij online).

Werkt vanaf **Android 7.0**. Je voortgang wordt in de app zelf bewaard. Die staat los van je voortgang in de browser: log in beide met hetzelfde **account** om hem gelijk te houden.

De app vraagt de hoogste verversingssnelheid van het scherm (90/120 Hz waar dat kan; veel telefoons houden apps anders op 60 Hz), vraagt waar het toestel dat kan om gelijkmatige prestaties, en laat op de achtergrond geen timers doorlopen. Stopt het tekenproces van de WebView onverwacht, dan bouwt de app zich opnieuw op in plaats van te crashen.

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
