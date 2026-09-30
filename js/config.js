'use strict';
// Andy Apples · instellingen
// Het enige bestand dat je aanpast bij het online zetten (zie README: "Supabase instellen").

// =====================================================================
//  Instellingen voor de website (zie README: "Supabase instellen")
// =====================================================================
const CONFIG = {
  // Supabase-project voor accounts (voortgang online bewaren), online lobbies en de ranglijst van Eindeloos:
  // de "Project URL" en de "anon"/"publishable" key. Leeg = alleen offline spelen.
  supabase: { url: 'https://vzkkyjfuyzzxnynhafmy.supabase.co/', key: 'sb_publishable_FSL3mmqd9Vn8PSBYq6FmTg_zGuUR69B' },
  // Adres waar het spel online staat (bijv. https://jouwnaam.github.io/andy-apple/). Wordt gebruikt voor
  // uitnodigingslinks als het spel als los bestand of in de Android-app draait. Leeg = het huidige adres.
  siteUrl: 'https://stijnbarendse.nl/appel',
  // Waar de knop "App" in het hoofdmenu de Android-app (.apk) downloadt: de nieuwste versie op GitHub (main).
  // Leeg = geen knop. In de app zelf is de knop er nooit.
  // TURN-server voor online multiplayer, nodig als spelers op hetzelfde (wifi-)netwerk zitten (zie README:
  // "TURN-server voor spelers op hetzelfde netwerk"). Een adres dat de ICE-servers teruggeeft (bijv. de
  // credentials-link van Metered), of een vaste lijst: [{ urls: 'turn:…', username: '…', credential: '…' }].
  // Leeg = alleen STUN: dan lukt verbinden meestal alleen tussen verschillende netwerken.
  turn: '',
  apkUrl: 'https://github.com/Stoin3/andy-apple/raw/main/android/AndyApples.apk',
};
