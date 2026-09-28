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
};
