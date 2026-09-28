# 🍎 Andy Apples

Een 2D-slingerspel in puur HTML. Andy de gorilla zwaait door de jungle aan lianen die met physics werken, verzamelt appels en probeert zo ver mogelijk te komen.

## Spelen

Open `index.html` in een browser. Er is geen installatie, server of internetverbinding nodig: alles (graphics, geluid en physics) zit in dit ene bestand. Alleen voor multiplayer heb je een netwerkverbinding nodig.

## Android-app

In [`android/`](android/) staat **`AndyApples.apk`**: het spel als Android-app (schermvullend, altijd liggend, Android 7.0+). Hoe je hem installeert en zelf opnieuw bouwt, staat in [`android/README.md`](android/README.md).

## Multiplayer

Speel met z'n tweeën, op twee manieren:

- **Op één scherm**: twee spelers op hetzelfde apparaat met een gedeeld scherm. **Speler 1** speelt met `Spatie` (of tikt op de linker/bovenste helft), **Speler 2** met `↑` of `Enter` (of tikt op de rechter/onderste helft). Geen internet nodig.
- **Online op twee apparaten** via lobbies: maak er een of doe mee met een lobby uit de lijst.

Spelmodi: **Race** (eerst bij de finish van 500, 1000 of 2000 m wint) en **Endurance** (wie het langst volhoudt; een storm jaagt je op). Upgrades staan uit, appels en XP tellen niet mee voor je save. Jullie spelen in dezelfde wereld en zien elkaar als tweede gorilla.

### Online spelen (lobbies)

1. **Speler 1** kiest **Multiplayer → Lobby maken**. De lobby verschijnt meteen in de lijst van iedereen die het multiplayermenu open heeft. Met **Kopieer uitnodiging** stuur je ook een link.
2. **Speler 2** klikt in de lijst **Open lobbies** op **Meedoen** (of opent de link).
3. De host kiest Race of Endurance en klikt op **Start**.

Lobbies lopen via Supabase Realtime (zie *Supabase instellen*): de server koppelt alleen de twee spelers, daarna praten de browsers direct met elkaar (WebRTC). Een volle lobby verdwijnt uit de lijst. Blokkeert een netwerk directe verbindingen, gebruik dan **Handmatig verbinden (zonder server)**: dan wissel je een uitnodigings- en antwoordcode uit.

## Supabase instellen (accounts, lobbies, ranglijst)

Accounts, online lobbies en de ranglijst gebruiken één gratis [Supabase](https://supabase.com)-project. Zolang dat niet is ingesteld, zijn de knoppen **Account** en **Ranglijst** verborgen en werkt de rest van het spel gewoon (offline, op één scherm, of handmatig verbinden).

1. Maak een account op supabase.com en een nieuw project (gratis plan; kies een regio in Europa).
2. Open **SQL Editor → New query**, plak dit en klik op **Run**:

   ```sql
   -- ===== Accounts: voortgang online bewaren =====
   create table public.saves (
     user_id    uuid primary key references auth.users (id) on delete cascade,
     data       jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.saves enable row level security;
   create policy "eigen save lezen"    on public.saves for select to authenticated using ((select auth.uid()) = user_id);
   create policy "eigen save maken"    on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
   create policy "eigen save bijwerken" on public.saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

   -- ===== Ranglijst (Eindeloos) =====
   create table public.scores (
     player_id  text primary key check (char_length(player_id) between 16 and 40),
     name       text not null check (char_length(name) between 1 and 12),
     dist       integer not null check (dist between 0 and 100000),
     updated_at timestamptz not null default now()
   );
   create index scores_dist_idx on public.scores (dist desc);
   alter table public.scores enable row level security;
   create policy "ranglijst lezen" on public.scores for select to anon, authenticated using (true);
   revoke all on table public.scores from anon, authenticated;
   grant select (name, dist, updated_at) on table public.scores to anon, authenticated;

   create or replace function public.submit_score(p_id text, p_name text, p_dist integer)
   returns void language plpgsql security definer set search_path = public as $$
   begin
     if p_id is null or p_id !~ '^[0-9a-f]{24}$' then raise exception 'ongeldig id'; end if;
     if p_dist is null or p_dist < 0 or p_dist > 100000 then raise exception 'ongeldige afstand'; end if;
     p_name := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>&"]', '', 'g')), 12);
     if p_name = '' then p_name := 'Andy'; end if;
     insert into public.scores (player_id, name, dist) values (p_id, p_name, p_dist)
     on conflict (player_id) do update
       set name = excluded.name,
           dist = greatest(scores.dist, excluded.dist),
           updated_at = case when excluded.dist > scores.dist then now() else scores.updated_at end;
   end $$;
   revoke all on function public.submit_score(text, text, integer) from public;
   grant execute on function public.submit_score(text, text, integer) to anon, authenticated;
   ```

   (Heb je de ranglijst-tabel al aangemaakt met de vorige instructies? Voer dan alleen het blok *Accounts* uit.)

3. **Lobbies** hebben geen tabel nodig: ze gebruiken Realtime (broadcast en presence), dat standaard aan staat. Staat bij **Realtime → Settings** "Allow public access" uit (alleen private channels), zet dat dan aan.
4. **Inloggen met e-mail** staat standaard aan (**Authentication → Sign In / Providers → Email**). Standaard moeten nieuwe spelers hun e-mailadres bevestigen via een link; zet onder **Authentication → URL Configuration** de **Site URL** op het adres van je spel (bijv. `https://stoin3.github.io/andy-apple/`). Wil je geen bevestigingsmail, zet dan **Confirm email** uit. Let op: de ingebouwde mailserver van Supabase verstuurt maar een paar mails per uur; voor meer spelers stel je onder **Authentication → Emails → SMTP Settings** een eigen mailprovider in.
5. Kopieer bij **Project Settings → API Keys** de **Project URL** en de **publishable key** (`sb_publishable_…`, in oudere projecten de **anon public** key). Deze key mag openbaar in een website staan; gebruik **nooit** de `service_role`/secret key.
6. Vul ze in bovenaan het `<script>` in `index.html`:

   ```js
   const CONFIG = {
     supabase: { url: 'https://abcdefgh.supabase.co', key: 'sb_publishable_…' },
     siteUrl: 'https://stoin3.github.io/andy-apple/',   // voor uitnodigingslinks en de bevestigingsmail
   };
   ```

7. Zet het spel online, bijvoorbeeld met **GitHub Pages**: repository → **Settings → Pages** → *Deploy from a branch* → `main` en `/ (root)`.

**Hoe het werkt**
- *Account*: via **Account** in het hoofdmenu maak je een account (e-mail + wachtwoord) of log je in. Je voortgang blijft ook lokaal staan en wordt na elke wijziging binnen een paar seconden online bewaard. Log je in op een ander apparaat, dan wordt de online voortgang geladen; staat er op beide plekken (verschillende) voortgang, dan vraagt het spel welke je wilt houden. Een wachtwoord vergeten kun je (nog) niet in het spel resetten; dat kan in Supabase bij **Authentication → Users**.
- *Ranglijst*: elke speler krijgt een willekeurig, geheim id. Na elke run in Eindeloos wordt je beste afstand met je naam verstuurd. Runs met een aangepaste debug-snelheid tellen niet mee. Iemand met technische kennis kan een nepscore insturen; verwijder die in **Table Editor → scores**.

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
- **Vloeiend zwaaien**: Andy zwaait als een echte slinger zonder energieverlies. Bij het grijpen blijft al zijn vaart behouden als voorwaartse zwaai; alleen verkeerd loslaten kost snelheid. Zwaai je te hoog, dan wordt het touw even slap. Grijp je een liaan te hoog, dan glijdt hij vanzelf omlaag. Bij verkeerde timing wordt een lancering die bijna kaarsrecht omhoog of pal achteruit zou gaan automatisch teruggebogen naar een bruikbare, voorwaartse sprong: zo verspil je nooit een hele zwaai.
- **Uitzoomen**: het beeld staat standaard 25% verder uitgezoomd voor meer overzicht, en zoomt rustig verder uit (tot 50% meer beeld) naarmate Andy gemiddeld sneller vooruit gaat (en weer in als hij vertraagt). Alleen de speelwereld zoomt mee; de verre achtergrond blijft op een vaste zoom en sluit altijd netjes aan op de waterlijn.
- **Trucs**: blijf je lang in de lucht, dan doet Andy salto's, kurkentrekkers, sterrensprongen en superaap-poses voor bonusappels (achter elkaar = meer bonus).
- **Lucht-trampolines** schieten je omhoog, uit welke richting je ze ook raakt; grote **stuiterzwammen** lanceren je ook.
- **De ruimte**: soms hangt er hoog boven het plafond een pad van gouden ballonnen. Pak ze perfect achter elkaar en laat los bij de laatste: dan word je de ruimte in gelanceerd (weinig zwaartekracht, sterappels, +25 🍎).
- **Start op een rots**: Andy begint op een rots en springt met ingedrukte spatie naar de eerste liaan. Lianen spawnen nooit in of tegen elkaar.
- **Lianen in een logisch patroon**: kolommen op regelmatige afstand met drie banen (hoog, midden, laag) die in een rustige golf op en neer lopen. De lianen zijn lang en hangen aan takjes. Hoe verder je komt, hoe groter de afstand en hoe vaker er een bovenste baan ontbreekt; de laagste baan is er altijd. Boven het plafond hangen geen lianen: daar vliegen alleen vogels langs en drijft af en toe een **luchtballon** met een liaan eronder (+5 🍎).
- **Speciale lianen**: ✨ turbo (flink extra vaart), 🎀 elastiek (rekt en veert), 🍎 fruitliaan (vol appels), 🪵 rot (breekt na even hangen), 🧊 ijs (je glijdt omlaag).
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

  Hoe verder je komt, hoe meer gaten tussen de lianen, hoe meer vijanden en hoe minder appels. In Eindeloos gaat ook het tempo langzaam omhoog (tot +12% bij 4000 m, bovenop het standaardtempo). Beide lopen af naar een plafond, zodat het altijd te doen blijft.
  Bij elke nieuwe biome speelt een riedeltje en tellen appels voor meer: +0,5 / +1 / +1,5 / +2 / +3 / +4 per appel, bovenop de Appeloogst-upgrade.
- **Levendige wereld**: meerdere parallaxlagen (bergen, heuvels, boomlijn, gedetailleerde bomen, reuzenstammen, voorgrond), een zon met stralen, wolken, noorderlicht en sterren, en daarnaast vogelzwermen, vlinders, papegaaien, giraffen, springende vissen en vallende sterren.
- **Muziek en geluid**: een procedurele jungle-groove (marimba, conga's, shaker, bas) met een eigen toonsoort per biome. Muziek en geluid staan los van elkaar aan/uit.
- **Accounts, online lobbies en een ranglijst** voor Eindeloos (zie *Supabase instellen*).
- **XP en spelerslevels**: hoe verder je komt, hoe meer XP. Direct te koop zijn Wingsuit, Lange armen, Zwaaikracht, Lanceerkracht, Appelmagneet, Appeloogst en Reddingsballon; de rest ontgrendel je langzaam met spelerslevels: Gouden appels (level 4), Helm (6), Comboketting (8), Stuiterzwam (10), Liaankenner (12), Papegaaimaatje (14), Appelregen (16) en Raketstart (20).
- **15 permanente upgrades**, betaald met 🍎 appels. Snelheid moet je verdienen: Zwaaikracht en Lanceerkracht verhogen ook je topsnelheid. Naast de basis-upgrades (en Gouden appels, Helm, Raketstart):
  - 🦸 **Wingsuit**: Andy krijgt een cape en glijdt veel verder.
  - 🦜 **Papegaaimaatje**: een papegaai vliegt mee en plukt appels voor je.
  - 🌧️ **Appelregen**: bij elke 100 m regent het appels.
  - 🔥 **Comboketting**: langere combo's met grotere bonussen.
  - 🌿 **Liaankenner**: rotte lianen houden langer, ijs is minder glad en er zijn meer turbolianen.
  - 🍄 **Stuiterzwam**: meer paddenstoelen die je verder lanceren.
- **Volledig scherm en draaiknop**: in **Instellingen** staan twee losse knoppen: **Volledig scherm** en **Liggend spelen**. Met de draaiknop speel je op een staande telefoon toch liggend (breder zicht) — waar het kan wordt de oriëntatie van het scherm echt vastgezet (via volledig scherm, meestal op Android); lukt dat niet, dan draait het spel het beeld zelf een kwartslag, zodat je de telefoon gewoon kantelt. Met **Staand spelen** zet je het terug. Beide keuzes staan los van elkaar en worden onthouden.
- **Debug-instellingen**: **Instellingen → Debug**, met wachtwoord `jungle-debug`: zoomniveau en spelsnelheid. Een ander wachtwoord? Reken de nieuwe waarde voor `DBG_HASH` in `index.html` uit met:
  ```sh
  node -e "let h=0x811c9dc5;for(const c of 'andy-debug:'+process.argv[1]){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0}console.log(h.toString(16).padStart(8,'0'))" NIEUW_WACHTWOORD
  ```
  Het is een drempel, geen echte beveiliging: alles draait in de browser.
- **Soepel op elk apparaat**: Andy wordt tussen de physics-stappen door geïnterpoleerd, zodat hij ook op 75/90/144 Hz-schermen niet schokt of flikkert. het spel meet zelf de framerate en past resolutie en effecten automatisch aan (en onthoudt dat). Op trage machines schakelt het snel terug, tot een extra lichte stand. Op telefoons en tablets is het beeld iets verder uitgezoomd voor meer overzicht. De verre achtergrond wordt in een aparte buffer op lage resolutie getekend.
- **Save-systeem**:
  - De voortgang wordt automatisch opgeslagen in de `localStorage` van de browser.
  - **Exporteren** geeft een `.json`-save-bestand; **importeren** laadt zo'n bestand weer in.
  - Er is ook een **save-code** (tekst) om te kopiëren en plakken, handig op een telefoon.
  - Saves krijgen een checksum, zodat je een waarschuwing ziet als een bestand met de hand is aangepast.
  - Oude saves met bananen worden automatisch omgezet naar appels.
