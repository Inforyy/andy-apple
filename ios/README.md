# Andy Apples voor iOS

`AndyApples.ipa` is het spel als iPhone- en iPad-app. Net als de Android-app laat hij het spel schermvullend en standaard liggend zien, en werkt hij ook zonder internet (alleen online multiplayer heeft internet nodig).

De app staat niet in de App Store en is **niet ondertekend**. Apple laat alleen ondertekende apps toe, dus je ondertekent hem zelf met je eigen Apple ID. Dat kan gratis.

## Downloaden

Download de nieuwste **`AndyApples.ipa`** bij de release [**ios**](https://github.com/Stoin3/andy-apple/releases/tag/ios). Een GitHub-workflow bouwt hem na elke wijziging aan het spel opnieuw.

## Installeren (zelf ondertekenen)

Je hebt een computer (Windows of Mac), een USB-kabel en een Apple ID nodig.

**Met Sideloadly** ([sideloadly.io](https://sideloadly.io)):

1. Installeer Sideloadly. Op Windows heb je ook iTunes en iCloud nodig, de versies van de Apple-site (niet uit de Microsoft Store).
2. Sluit je iPhone of iPad aan en tik op het toestel op **Vertrouw**.
3. Sleep `AndyApples.ipa` naar Sideloadly, vul je Apple ID in en klik op **Start**.
4. Ga op het toestel naar **Instellingen → Algemeen → VPN en apparaatbeheer**, tik op je Apple ID en kies **Vertrouw**.
5. Vanaf iOS 16: zet **Instellingen → Privacy en beveiliging → Ontwikkelaarsmodus** aan en herstart het toestel.

**Met AltStore** ([altstore.io](https://altstore.io)): installeer AltServer op je computer en AltStore op je toestel, en open `AndyApples.ipa` in AltStore via **My Apps → +**.

**Let op:**
- Met een gratis Apple ID werkt de app **7 dagen**; daarna onderteken je hem opnieuw (AltStore doet dat vanzelf als AltServer draait). Met een betaald ontwikkelaarsaccount werkt hij een jaar.
- Je voortgang staat in de app zelf, los van de browser. Opnieuw ondertekenen over dezelfde app heen houdt hem bewaard. Log in met een **account** om je voortgang ook online te bewaren.

Werkt vanaf **iOS 14**.

## Wat de app doet

- Schermvullend: de statusbalk en de thuisbalk zijn weg, en vegen langs de rand gaat eerst naar het spel (in Instellingen → Scherm in het spel aan of uit te zetten).
- Altijd liggend, of meedraaien met het toestel (Instellingen → Scherm).
- Het scherm gaat tijdens het spelen niet op slot.
- Kopiëren (zoals een uitnodigingslink) gaat naar het klembord van iOS. Andere links openen in Safari.
- Stopt het tekenproces van de WebView, dan laadt de app het spel opnieuw in plaats van een leeg scherm te laten zien.

De app geeft het spel dezelfde JavaScript-brug als de Android-app (`window.AndroidBridge`), dus het spel werkt er zonder aanpassingen mee.

## Zelf bouwen

Op een **Mac** met Xcode (of de Command Line Tools met de iOS-SDK) en Python 3:

```sh
python3 build_ipa.py --version 1.0 --build 1
```

Het script compileert `AndyApples.swift` met `swiftc`, schrijft zelf de `Info.plist`, maakt het icoon op maat uit `../android/icon.png` en pakt het spel (`../index.html`, `../css/` en `../js/`, dezelfde bestanden als in de APK) in. Er is geen Xcode-project nodig.

Wil je meteen met je eigen certificaat ondertekenen (bijv. met een betaald ontwikkelaarsaccount):

```sh
python3 build_ipa.py --sign "Apple Development: Jouw Naam (TEAMID)" --profile AndyApples.mobileprovision
```

Het profiel moet bij de bundle-ID `nl.andyapples.game` horen (of een wildcard-ID zijn).

**Zonder Mac**: start op GitHub bij **Actions → iOS-app bouwen → Run workflow** een build. Die draait op een Mac van GitHub en zet de `.ipa` bij de release `ios` en bij de run.
