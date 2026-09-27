# 🍎 Andy Apples

Een 2D-slingerspel in puur HTML. Andy de gorilla zwaait door de jungle aan lianen die met physics werken, verzamelt appels en probeert zo ver mogelijk te komen.

## Spelen

Open `index.html` in een browser. Er is geen installatie, server of internetverbinding nodig: alles (graphics, geluid en physics) zit in dit ene bestand. Alleen voor multiplayer heb je een netwerkverbinding nodig.

## Multiplayer

Speel met z'n tweeën, op twee manieren:

- 📺 **Op één scherm**: twee spelers op hetzelfde apparaat met een gedeeld scherm (naast elkaar op een breed scherm, boven elkaar op een staand scherm). **Speler 1** speelt met `Spatie` (of tikt op de linker/bovenste helft), **Speler 2** met `↑` of `Enter` (of tikt op de rechter/onderste helft). Geen codes of internet nodig, en pauzeren kan gewoon.
- 🌐 **Online op twee apparaten**, zonder account of server: de twee browsers verbinden direct met elkaar (WebRTC). Je wisselt alleen twee codes uit (zie *Instellen*).

Beide manieren hebben dezelfde spelmodi:


- 🏁 **Race**: wie het eerst bij de finish is (500, 1000 of 2000 m), wint. Val je, dan kom je na een tel terug op een liaan; dat kost tijd.
- ⏱️ **Endurance**: wie het langst volhoudt, wint. Val je, dan ben je af. Een storm jaagt je van achteren op en gaat steeds sneller.
- **Upgrades staan uit** tijdens multiplayer, zodat iedereen gelijk is. Appels en XP uit multiplayer tellen niet mee voor je save.
- Jullie spelen in precies dezelfde wereld (dezelfde seed) en zien elkaar als tweede gorilla met een blauwe bandana. Buiten beeld wijst een pijl naar je tegenstander.

### Instellen (online)

De uitleg staat ook in het spel: **👥 Multiplayer → ❓ Set-up**.

1. **Speler 1 (host)** klikt op **👥 Multiplayer → 🏠 Spel hosten**, kopieert de **uitnodigingscode** en stuurt die naar speler 2 (WhatsApp, Discord, e-mail…).
2. **Speler 2** klikt op **👥 Multiplayer → 🔗 Meedoen**, plakt de code en klikt op **✍️ Maak antwoordcode**.
3. Speler 2 stuurt de **antwoordcode** terug; de host plakt die en klikt op **🔌 Verbinden**.
4. Staat er **Verbonden**, dan kiest de host Race of Endurance en klikt op **▶ Start!**. Na afloop kun je met **🔁 Revanche** meteen opnieuw.

Tips: codes zijn eenmalig (mislukt het, klik dan op **✖ Opnieuw**). Het werkt het best als beide apparaten op hetzelfde wifi-netwerk zitten; sommige school-, werk- of mobiele netwerken blokkeren directe verbindingen. Wie tijdens een potje een paar seconden wegklikt, geeft op. Twee tabbladen in hetzelfde venster werkt niet voor online spelen (de browser zet het verborgen tabblad stil); gebruik twee aparte vensters naast elkaar, of speel gewoon met 📺 Op één scherm.

## Besturing

| Actie | Toetsenbord | Muis / touchscreen |
| --- | --- | --- |
| Van de startrots naar de eerste liaan springen | `Spatie` ingedrukt houden | scherm ingedrukt houden |
| Aan een liaan blijven hangen | `Spatie` ingedrukt houden | scherm ingedrukt houden |
| Loslaten / springen | `Spatie` loslaten | loslaten |
| Duiken (in de lucht, begint rustig en versnelt) | `Spatie` ingedrukt houden | scherm ingedrukt houden |
| Liaan grijpen | ingedrukt houden terwijl je een liaan raakt | idem |
| Pauze | `P` of `Esc` | ❚❚-knop |

## Features

- **Lianen met physics**: elke liaan is een Verlet-touw van segmenten dat schuin naar linksonder hangt (zoals in Benji Bananas), zodat je hem makkelijk grijpt. Andy's gewicht, vaart, zwaaien en loslaten werken zoals je zou verwachten.
- **Drie modi**: 🏁 **Carrière** met 35 levels (start → finish, steeds langer en moeilijker, elke 5 levels een nieuwe biome, tot 3 sterren per level), ♾️ **Eindeloos** (zo ver mogelijk komen) en 👥 **Multiplayer** (zie hierboven).
- **Vloeiend zwaaien**: Andy zwaait als een echte slinger zonder energieverlies. Bij het grijpen blijft al zijn vaart behouden als voorwaartse zwaai; alleen verkeerd loslaten kost snelheid. Zwaai je te hoog, dan wordt het touw even slap. Grijp je een liaan te hoog, dan glijdt hij vanzelf omlaag.
- **Trucs**: blijf je lang in de lucht, dan doet Andy salto's, kurkentrekkers, sterrensprongen en superaap-poses voor bonusappels (achter elkaar = meer bonus).
- **Lucht-trampolines** en grote **stuiterzwammen** lanceren je omhoog.
- **De ruimte**: soms hangt er hoog boven het plafond een pad van gouden ballonnen. Pak ze perfect achter elkaar en laat los bij de laatste: dan word je de ruimte in gelanceerd (weinig zwaartekracht, sterappels, +25 🍎).
- **Start op een rots**: Andy begint op een rots en springt met ingedrukte spatie naar de eerste liaan. Lianen spawnen nooit in of tegen elkaar.
- **Lianen in een logisch patroon**: kolommen op regelmatige afstand met drie banen (hoog, midden, laag) die in een rustige golf op en neer lopen. De lianen zijn lang en hangen aan takjes. Hoe verder je komt, hoe groter de afstand en hoe vaker er een bovenste baan ontbreekt; de laagste baan is er altijd. Boven het plafond hangen geen lianen: daar vliegen alleen vogels langs en drijft af en toe een **luchtballon** met een liaan eronder (+5 🍎).
- **Speciale lianen**: ✨ turbo (extra vaart), 🎀 elastiek (rekt en veert), 🍎 fruitliaan (vol appels), 🪵 rot (breekt na even hangen), 🧊 ijs (je glijdt omlaag).
- **Snel en belonend**: een extra krachtige eerste sprong, combo's als je snel appels pakt, bonussen voor mooie sprongen, mijlpalen elke 100 m met confetti, en een **WOOHOO!** als je van een liaan zwaait.
- **Alleen vallen is game over**: wespen, eksters en vuurballen stelen appels (die je terug kunt pakken), maar laten Andy nooit vallen. Een helm beschermt je appels.
- **Zeven biomes**, die steeds iets lastiger worden:
  1. 🌿 Jungle (0 m)
  2. 🐸 Moeras (450 m): wespen, rotte lianen
  3. 🦒 Savanne (1100 m): meer rotte en elastieken lianen
  4. ❄️ IJsbergen (1900 m): gladde ijslianen en eksters
  5. 🌋 Vulkaan (2900 m): vuurballen uit de lava
  6. 🌙 Sterrennacht (4100 m): alles door elkaar
  7. 🌀 Portaalwoud (5200 m): portalen zoals in *Portal 2*. Vlieg door het **blauwe** portaal en je komt met al je vaart uit het **oranje** portaal, een flink stuk verderop (en meestal hoger). Er hangt steeds maar één portaalpaar tegelijk, zodat het overzichtelijk blijft.

  Hoe verder je komt, hoe meer gaten tussen de lianen, hoe meer vijanden en hoe minder appels.
  Bij elke nieuwe biome speelt een riedeltje en tellen appels voor meer: +0,5 / +1 / +1,5 / +2 / +3 / +4 per appel, bovenop de Appeloogst-upgrade.
- **Levendige wereld**: meerdere parallaxlagen (bergen, heuvels, boomlijn, gedetailleerde bomen, reuzenstammen, voorgrond), een zon met stralen, wolken, noorderlicht en sterren, en daarnaast vogelzwermen, vlinders, papegaaien, giraffen, springende vissen en vallende sterren.
- **Muziek en geluid**: een procedurele jungle-groove (marimba, conga's, shaker, bas) met een eigen toonsoort per biome. Muziek en geluid staan los van elkaar aan/uit.
- **XP en spelerslevels**: hoe verder je komt, hoe meer XP. Direct te koop zijn Wingsuit, Lange armen, Zwaaikracht, Lanceerkracht, Appelmagneet, Appeloogst en Reddingsballon; de rest ontgrendel je langzaam met spelerslevels: Gouden appels (level 4), Helm (6), Comboketting (8), Stuiterzwam (10), Liaankenner (12), Papegaaimaatje (14), Appelregen (16) en Raketstart (20).
- **15 permanente upgrades**, betaald met 🍎 appels. Snelheid moet je verdienen: Zwaaikracht en Lanceerkracht verhogen ook je topsnelheid. Naast de basis-upgrades (en Gouden appels, Helm, Raketstart):
  - 🦸 **Wingsuit**: Andy krijgt een cape en glijdt veel verder.
  - 🦜 **Papegaaimaatje**: een papegaai vliegt mee en plukt appels voor je.
  - 🌧️ **Appelregen**: bij elke 100 m regent het appels.
  - 🔥 **Comboketting**: langere combo's met grotere bonussen.
  - 🌿 **Liaankenner**: rotte lianen houden langer, ijs is minder glad en er zijn meer turbolianen.
  - 🍄 **Stuiterzwam**: meer paddenstoelen die je verder lanceren.
- **Draaiknop voor telefoons**: met 🔄 **Liggend** in het hoofdmenu speel je op een staande telefoon toch liggend (breder zicht). Waar het kan wordt het scherm echt gedraaid (volledig scherm, Android); anders draait het spel het beeld zelf een kwartslag, zodat je de telefoon gewoon kantelt. Met 🔄 **Staand** zet je het terug. De keuze wordt onthouden.
- **Soepel op elk apparaat**: het spel meet zelf de framerate en past resolutie en effecten automatisch aan (en onthoudt dat). Op trage machines schakelt het snel terug, tot een extra lichte stand. Op telefoons en tablets is het beeld iets verder uitgezoomd voor meer overzicht. De verre achtergrond wordt in een aparte buffer op lage resolutie getekend.
- **Save-systeem**:
  - De voortgang wordt automatisch opgeslagen in de `localStorage` van de browser.
  - **Exporteren** geeft een `.json`-save-bestand; **importeren** laadt zo'n bestand weer in.
  - Er is ook een **save-code** (tekst) om te kopiëren en plakken, handig op een telefoon.
  - Saves krijgen een checksum, zodat je een waarschuwing ziet als een bestand met de hand is aangepast.
  - Oude saves met bananen worden automatisch omgezet naar appels.
