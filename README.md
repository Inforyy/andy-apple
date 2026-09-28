# 🍎 Andy Apples

Een 2D-slingerspel in de browser. Andy de gorilla zwaait aan lianen door elf werelden, verzamelt appels en probeert zo ver mogelijk te komen. Alles (graphics, muziek, geluid en physics) wordt in code gemaakt: geen plaatjes, geen geluidsbestanden, geen installatie.

**[▶ Speel online](https://stijnbarendse.nl/appel)**

## Inhoud

- [Spelen](#spelen)
- [Besturing](#besturing)
- [Spelmodi](#spelmodi)
- [Het spel](#het-spel)
- [Multiplayer](#multiplayer)
- [Instellingen](#instellingen)
- [Voortgang en saves](#voortgang-en-saves)
- [Voor ontwikkelaars](#voor-ontwikkelaars)
- [Supabase instellen](#supabase-instellen)

## Spelen

- **Online**: open de [link hierboven](https://stijnbarendse.nl/appel). Werkt het best in Chrome; in Firefox loopt het op sommige apparaten minder soepel.
- **Lokaal**: open `index.html` in een browser. Houd het bestand bij de mappen `css/` en `js/`. Internet is alleen nodig voor online multiplayer, accounts en de ranglijst.
- **Android-app**: [`android/AndyApples.apk`](android/AndyApples.apk) (Android 7.0+, schermvullend en liggend). Installeren en zelf bouwen: zie [`android/README.md`](android/README.md).

## Besturing

Het hele spel werkt met één knop.

| Actie | Toetsenbord | Muis / touchscreen |
| --- | --- | --- |
| Springen, aan een liaan hangen | `Spatie` ingedrukt houden | scherm ingedrukt houden |
| Loslaten en wegspringen | `Spatie` loslaten | loslaten |
| Duiken (in de lucht) | `Spatie` ingedrukt houden | scherm ingedrukt houden |
| Liaan grijpen | ingedrukt houden terwijl je een liaan raakt | idem |
| Pauze | `P` of `Esc` | ❚❚-knop |

Laat los als Andy naar voren zwaait. Alleen in het water (of de lava, …) vallen is game over.

## Spelmodi

- 🏁 **Carrière**: 55 levels met een start en een finish, steeds langer en moeilijker. Elke 5 levels een nieuwe wereld. Tot 3 sterren per level, afhankelijk van hoeveel appels je pakt.
- ♾️ **Eindeloos**: kom zo ver mogelijk. Het wordt geleidelijk lastiger en iets sneller (tot een plafond). Met een account kom je met je gebruikersnaam op de online ranglijst.
- 👥 **Spelmodi**: Multiplayer (online tot 20 spelers), Duel (met z'n tweeën op één scherm), Tegen Kiwi en Achtervolging. Zie [Multiplayer](#multiplayer).

## Het spel

### Werelden

Hoe verder je komt, hoe meer gaten tussen de lianen, hoe meer vijanden en hoe minder appels, maar ook hoe meer elke appel waard is.

| | Wereld | Vanaf | Wat is er anders | Appelbonus |
| --- | --- | --- | --- | --- |
| 1 | 🌿 Jungle | 0 m | het begin | — |
| 2 | 🐸 Moeras | 450 m | wespen, rotte lianen | +0,5 |
| 3 | 🦒 Savanne | 1100 m | meer rotte en elastieken lianen | +1 |
| 4 | ❄️ IJsbergen | 1900 m | gladde ijslianen, eksters | +1,5 |
| 5 | 🌋 Vulkaan | 2900 m | vuurballen uit de lava | +2 |
| 6 | 🌙 Sterrennacht | 4100 m | alles door elkaar | +3 |
| 7 | 🌀 Portaalwoud | 5200 m | portalen: blauw in, oranje uit, met al je vaart | +4 |
| 8 | 🟩 Kubuswoud | 6300 m | alles van blokjes, zoals *Minecraft* | +5 |
| 9 | 🖍️ Tekenland | 7400 m | alles getekend, zoals in *Paint* | +6 |
| 10 | 🧊 3D-wereld | 8500 m | low-poly bergen, neonraster, retrozon | +7 |
| 11 | 🍭 Snoepland | 9700 m | lollybomen, zuurstoklianen, een chocoladerivier | +8 |

De appelbonus komt bovenop de upgrade Appeloogst.

- **Na Snoepland** komen de werelden steeds terug, elk 1100 m lang, in een vaste, door elkaar gehusselde volgorde (je blijft dus nooit in dezelfde wereld). Appels tellen daar minstens +8.
- **Een nieuwe wereld** kondig je niet zomaar aan: op de grens staat een poort met de naam, en als je erdoor gaat krijg je slow motion, filmbalken, een grote titelkaart en een eigen geluid per wereld. Rond de grens is een korte, rustige buffer: geen vijanden, geen lastige lianen en alle drie de banen hangen er.

### Lianen en extra's

- **Speciale lianen**: ✨ turbo (extra vaart), 🎀 elastiek (rekt en veert), 🍎 fruit (vol appels), 🪵 rot (breekt na even hangen), 🧊 ijs (je glijdt omlaag).
- **Trampolines en stuiterzwammen** lanceren je omhoog.
- **Trucs**: blijf je lang in de lucht, dan doet Andy salto's en andere kunstjes voor bonusappels.
- **Combo's**: pak snel achter elkaar appels voor extra bonus. Elke 100 m is er een mijlpaal met confetti.
- **Vijanden** (wespen, eksters, vuurballen) laten Andy nooit vallen, maar stelen appels. Die kun je terugpakken. Een helm beschermt je.
- **Luchtballonnen** drijven boven het plafond, met een liaan eronder (+5 🍎).
- **Straaljager**: heel af en toe (Eindeloos, vanaf 150 m) scheurt er een straaljager van achteren over je heen, met een lange liaan die ver naar achteren wappert. Grijp hem (+8 🍎) en je wordt zo'n 5 seconden meegesleurd; daarna laat hij je met flinke vaart los.
- **De ruimte**: in Eindeloos hangt er vanaf 150 m geregeld een pad van drie gouden ballonnen hoog in de lucht. Pak ze achter elkaar en laat bij de laatste los: dan word je de ruimte in gelanceerd (+25 🍎), met weinig zwaartekracht, sterrenlianen, planetoïden en een ufo (+15 🍎).
- **Head-start**: vóór je eerste sprong in Eindeloos koop je met appels een raketvlucht vooruit (250 tot 2000 m).
- **Onder water**: val je in het water (niet in lava, niet in multiplayer), dan is er 20% kans dat Andy niet verdrinkt maar ondergaat. Je zwemt dan verder door een onderwaterwereld met rotswanden, kwallen (die appels stelen) en parels. Een stroming houdt je onder water, behalve bij een **luchtgat** (een bellenzuil). Haal je er binnen 30 seconden een, dan schiet je omhoog (+10 🍎 en een bonus per seconde lucht over); anders verdrinkt Andy.
- **Kisten**: tijdens het spelen hangen er soms kisten 📦 in de lucht (en onder water). Raak je er een aan, dan krijg je hem na de run. Open ze via **📦 Kisten** in het menu of op het eindscherm: een rij prijzen rolt voorbij (zoals in *Counter-Strike*) en stopt op je buit.

  | Zeldzaamheid | Kans | Wat |
  | --- | --- | --- |
  | Gewoon | 55% | appels of XP |
  | Ongewoon | 26% | bruine of grijze vacht, petje, **kiwikostuum** (je ziet eruit als Kiwi) |
  | Zeldzaam | 12,5% | blauwe of roze vacht, cowboyhoed, piratenhoed |
  | Episch | 5% | gouden vacht, kroon, tovenaarshoed |
  | Legendarisch | 1,5% | **appelkostuum**, regenboogvacht |

  In de **garderobe** (onder de kisten) kies je vachtkleur, hoed en kostuum, met een voorbeeld van Andy. Heb je iets al, dan krijg je in plaats daarvan appels. Online zien anderen je gewone uiterlijk.

### Upgrades en levels

Met appels koop je 15 permanente upgrades. Met XP (vooral voor afstand) stijg je in level en ontgrendel je er meer.

| Direct te koop | Ontgrendel je later |
| --- | --- |
| ✋ Lange armen · 🌀 Zwaaikracht · 💨 Lanceerkracht · 🧲 Appelmagneet · 🧺 Appeloogst · 🎈 Reddingsballon · 🦸 Wingsuit | ✨ Gouden appels (level 4) · ⛑️ Helm (6) · 🔥 Comboketting (8) · 🍄 Stuiterzwam (10) · 🌿 Liaankenner (12) · 🦜 Papegaaimaatje (14) · 🌧️ Appelregen (16) · 🚀 Raketstart (20) |

Zwaaikracht en Lanceerkracht verhogen ook je topsnelheid: snelheid moet je verdienen. Maar hoe meer upgrades je hebt, hoe lastiger de wereld: grotere gaten tussen de lianen, vaker een ontbrekende liaan en meer vijanden (in Eindeloos en de carrière; in multiplayer staan upgrades uit).

## Multiplayer

In multiplayer staan upgrades uit, en appels en XP tellen niet mee voor je save. Iedereen speelt in dezelfde wereld en ziet de anderen als extra gorilla's.

**Manieren van spelen**
- **Online lobbies (tot 20 spelers)**: kies **Spelmodi → Multiplayer → + Nieuwe lobby**. Je lobby verschijnt in de lijst van anderen, of je stuurt een uitnodigingslink. De host kiest de spelmodus en start vanaf 2 spelers. Na afloop start de host een nieuwe ronde.
- **Duel** (2 spelers, één scherm): speler 1 speelt met `Spatie` (of de linker/bovenste helft van het scherm), speler 2 met `↑` of `Enter` (of de rechter/onderste helft). Geen internet nodig.
- **Tegen Kiwi (AI)**: een race naar de finish tegen een orang-oetan op niveau *Makkelijk*, *Normaal*, *Moeilijk* of *Expert*.

**Spelmodi**
- **Race**: wie het eerst bij de finish is (500, 1000 of 2000 m), wint. Val je, dan kom je terug op een liaan en verlies je tijd.
- **Endurance** (Multiplayer en Duel): wie het langst volhoudt, wint. Een storm jaagt je op.
- **Achtervolging** (tegen Kiwi): Kiwi start 3 tellen na jou en wordt steeds sneller. Hoe lang hou je het vol? Je record wordt bewaard.

Online gebruikt het spel Supabase alleen om lobbies te vinden en de verbinding op te zetten. Daarna praten de spelers direct met de host (WebRTC). Bij 20 spelers heeft de host een goede verbinding nodig.

## Instellingen

Instellingen open je met het tandwiel rechtsboven in het hoofdmenu, of in het pauzescherm.

- **Grafische kwaliteit**: een schuifje met *AI* (standaard: het spel meet de framerate en kiest zelf), *Laag*, *Normaal* en *Hoog*. Tekent je browser zonder grafische versnelling, of moet het spel naar de laagste stand, dan krijg je in het menu een melding met een tip.
- **Liggend spelen**: op telefoons standaard aan. Waar het kan wordt het scherm liggend vastgezet; anders draait het spel het beeld zelf een kwartslag.
- **Volledig scherm**, **geluid** en **muziek**: los aan en uit te zetten.
- **Debug**: achter het wachtwoord `jungle-debug`. Hier stel je zoom en spelsnelheid in en zet je een FPS-meter aan. Runs met een andere snelheid tellen niet voor de ranglijst.

## Voortgang en saves

- Je voortgang wordt automatisch in de browser bewaard.
- Met een **account** wordt je voortgang ook online bewaard en kun je op een ander apparaat verder. Heb je op beide plekken voortgang, dan vraagt het spel welke je wilt houden.
- Bij **Account** kies je ook een **gebruikersnaam** (uniek, 3–16 tekens: letters, cijfers en `_`). Die zie je op de ranglijst en in multiplayer. Zonder account krijg je in multiplayer een willekeurige naam, die je zelf kunt aanpassen.
- De Android-app heeft een eigen voortgang, los van de browser. Log in met hetzelfde account om die gelijk te houden.

## Voor ontwikkelaars

Er is geen build-stap en geen npm. `index.html` bevat de schermen, `css/style.css` de opmaak, en de code staat in gewone scripts in `js/`:

| Bestand | Wat |
| --- | --- |
| `config.js` | Supabase-instellingen (zie [Supabase instellen](#supabase-instellen)) |
| `data.js` | werelden, upgrades, levels, Kiwi-niveaus, moeilijkheid en tempo: **hier begin je bij uitbreiden of balanceren** |
| `util.js`, `save.js`, `audio.js` | hulpfuncties, opslag, geluid en muziek |
| `view.js`, `world.js`, `physics.js`, `effects.js` | beeld, zoom en kwaliteit; wereldgenerator; lianen en zwaaien; deeltjes |
| `render-bg.js`, `render-world.js` | achtergrond en speelwereld tekenen |
| `online.js`, `mp-online.js`, `mp-local.js` | Supabase (ranglijst, accounts), online lobbies, één scherm en Kiwi |
| `game.js`, `main.js` | spelverloop, menu's, invoer en HUD; hoofdlus en opstarten |

- **Testen**: `node tools/smoke.mjs` (Node 18+ en Chrome/Chromium). Klikt door de menu's, speelt alle modi en faalt bij elke JavaScript-fout.
- **Android-app bouwen**: zie [`android/README.md`](android/README.md). De APK in de repo wordt niet vanzelf bijgewerkt als het spel verandert.
- **Ander debug-wachtwoord**: reken de nieuwe waarde voor `DBG_HASH` in `js/view.js` uit met:
  ```sh
  node -e "let h=0x811c9dc5;for(const c of 'andy-debug:'+process.argv[1]){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0}console.log(h.toString(16).padStart(8,'0'))" NIEUW_WACHTWOORD
  ```
  Dit is een drempel, geen echte beveiliging: alles draait in de browser.

## Supabase instellen

Accounts, online lobbies en de ranglijst gebruiken één gratis [Supabase](https://supabase.com)-project. Zolang dat niet is ingesteld, zijn de knoppen **Account** en **Ranglijst** verborgen. De rest van het spel werkt dan gewoon.

1. Maak een account op supabase.com en een nieuw project (gratis plan, regio in Europa).
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

   -- ===== Gebruikersnamen: uniek (ook zonder op hoofdletters te letten), 3-16 tekens =====
   create table public.profiles (
     user_id    uuid primary key references auth.users (id) on delete cascade,
     username   text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
     updated_at timestamptz not null default now()
   );
   create unique index profiles_username_uniek on public.profiles (lower(username));
   alter table public.profiles enable row level security;
   create policy "eigen naam lezen"    on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
   create policy "eigen naam maken"    on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
   create policy "eigen naam wijzigen" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
   grant select, insert, update on public.profiles to authenticated;

   -- ===== Ranglijst (Eindeloos): alleen spelers met een account en een gebruikersnaam =====
   create table public.ranking (
     user_id    uuid primary key references auth.users (id) on delete cascade,
     dist       integer not null check (dist between 0 and 100000),
     updated_at timestamptz not null default now()
   );
   alter table public.ranking enable row level security;  -- geen policies: schrijven kan alleen via submit_run

   create or replace function public.submit_run(p_dist integer)
   returns void language plpgsql security definer set search_path = public as $$
   begin
     if auth.uid() is null then raise exception 'niet ingelogd'; end if;
     if p_dist is null or p_dist < 0 or p_dist > 100000 then raise exception 'ongeldige afstand'; end if;
     insert into public.ranking (user_id, dist) values (auth.uid(), p_dist)
     on conflict (user_id) do update
       set dist = greatest(ranking.dist, excluded.dist),
           updated_at = case when excluded.dist > ranking.dist then now() else ranking.updated_at end;
   end $$;
   revoke all on function public.submit_run(integer) from public, anon;
   grant execute on function public.submit_run(integer) to authenticated;

   -- openbare lijst: alleen naam en afstand (de view leest de tabellen als eigenaar, dus e-mail en id blijven verborgen)
   create or replace view public.leaderboard as
     select p.username as name, r.dist, r.updated_at from public.ranking r join public.profiles p using (user_id);
   revoke all on public.leaderboard from anon, authenticated;
   grant select on public.leaderboard to anon, authenticated;
   ```

   Had je al een eerdere versie ingericht? Voer dan alleen de blokken *Gebruikersnamen* en *Ranglijst* uit. De oude, anonieme ranglijst wordt niet meer gebruikt; die ruim je op met:

   ```sql
   drop function if exists public.submit_score(text, text, integer);
   drop table if exists public.scores;
   ```

3. **Lobbies** hebben geen tabel nodig: ze gebruiken Realtime, dat standaard aan staat. Staat bij **Realtime → Settings** "Allow public access" uit, zet dat dan aan.
4. **Inloggen met e-mail** staat standaard aan. Zet onder **Authentication → URL Configuration** de **Site URL** op het adres van je spel, voor de bevestigingsmail. Geen bevestigingsmail nodig? Zet dan **Confirm email** uit. De ingebouwde mailserver verstuurt maar een paar mails per uur; stel voor meer spelers een eigen mailprovider in onder **Authentication → Emails → SMTP Settings**.
5. Kopieer bij **Project Settings → API Keys** de **Project URL** en de **publishable key** (`sb_publishable_…`, in oudere projecten de **anon public** key). Die mag openbaar in een website staan. Gebruik **nooit** de `service_role`- of secret key.
6. Vul ze in in `js/config.js`:

   ```js
   const CONFIG = {
     supabase: { url: 'https://abcdefgh.supabase.co', key: 'sb_publishable_…' },
     siteUrl: 'https://stoin3.github.io/andy-apple/',   // voor uitnodigingslinks en de bevestigingsmail
   };
   ```

7. Zet het spel online, bijvoorbeeld met **GitHub Pages**: repository → **Settings → Pages** → *Deploy from a branch* → `main` en `/ (root)`.

**Goed om te weten**
- Een vergeten wachtwoord kun je (nog) niet in het spel resetten. Dat kan in Supabase bij **Authentication → Users**.
- Op de ranglijst staan alleen spelers met een account en een gebruikersnaam. Helemaal waterdicht is hij niet: een ingelogde speler met technische kennis kan een nepscore insturen. Verwijder die in **Table Editor → ranking**.
