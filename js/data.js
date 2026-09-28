'use strict';
// Andy Apples · speldata en afstemming
// Alles wat je aanpast om het spel uit te breiden of te balanceren: constanten, biomes, kansen per biome, upgrades,
// XP en carrière-levels, speciale lianen, Kiwi-niveaus, en moeilijkheid/tempo/kleurpalet per afstand.
// Alleen data en pure functies: bij het laden wordt hier niets uit latere bestanden gebruikt.

// =====================================================================
//  Constanten
// =====================================================================
const WORLD_H = 720;          // logische hoogte van het "rust"-beeld
const HAZARD_Y = 668;         // oppervlak van de dodelijke bodem (water, lava, ...)
const PX_PER_M = 30;          // pixels per meter
const STEP = 1 / 120;         // vaste physics-stap (echte tijd)
const GAME_SPEED = 1.2;       // alles loopt iets sneller dan echte tijd: meer tempo
const DT = STEP * GAME_SPEED; // gesimuleerde tijd per physics-stap
const GRAVITY = 1500;         // zwaartekracht voor lianen en het zwaaien
const AIR_G = 1000;           // lagere zwaartekracht in de lucht: Andy zweeft langer
const MAX_FALL = 1050;        // maximale valsnelheid zonder te duiken
const SEG_LEN = 16;           // lengte van één liaan-segment
const ARM_LEN = 34;           // afstand hand -> lichaam van de gorilla
const G_R = 22;               // straal van de gorilla
const G_DRAW = 1.3;           // tekenschaal van de gorilla
const ROPE_ITERS = 12;
const START_X = 320;          // 0 m
const ROCK = { x0: 40, x1: 300, top: 430 }; // startrots
const FEET = 28;              // afstand van Andy's midden tot zijn voeten
const FIRST_VINE = { x: 580, ay: 20, len: 440 };
const WALL_X = 50;
const SHROOM_TOP = HAZARD_Y - 104;  // bovenkant van de (grote) stuiterzwam
const CEIL_Y = -1150;         // hoogste ophangpunt van lianen: daarboven is alleen nog lucht
const ANCHOR_LOW = 230;       // laagste ophangpunt van lianen
const VINE_CLEAR = 120;       // minimale ruimte tussen onderkant liaan en de bodem
const VINE_TILT = -900;       // constante kracht naar links: lianen hangen schuin naar linksonder
const VINE_SLANT = Math.atan2(-VINE_TILT, GRAVITY);   // rusthoek (~31°)
const TIP_F = Math.cos(VINE_SLANT);                   // hoe hoog het uiteinde hangt t.o.v. de lengte
const ELASTIC_STRETCH = 1.45; // hoe ver een elastieken liaan mag uitrekken
const APPLE_SC = 0.9, APPLE_PICK = 22, LOOT_SC = 1.45; // grootte van appels en kisten in de wereld (en hoe ver je ze pakt)
const SPR_RES = 1.25;         // resolutie van voorgetekende sprites
// Hoe ver achter de camera lianen, paddenstoelen en trampolines blijven bestaan (ruim één scherm): vlieg je
// terug, dan staan ze er nog. Kost vrijwel niets, want buiten beeld worden ze niet gesimuleerd of getekend.
// (Opnieuw genereren kan niet: de generator werkt alleen vooruit en moet in carrière/multiplayer gelijk blijven.)
const KEEP_BEHIND = 2400;

// =====================================================================
//  Biomes
// =====================================================================
const BIOMES = [
  { name:'Jungle', bonus:0, icon:'🌿', start:0, tip:'Gouden turbolianen geven extra vaart!', style:'jungle', particle:'leaf', hazardName:'de rivier', shroom:'#e8322b',
    c:{ skyTop:'#4fb8ef', skyMid:'#9fdcf2', skyBot:'#e2f7d2', sun:'#fff3a0', far:'#86bfa0', far2:'#5a9d6c', mid:'#2f7d45', canopy:'#1f6b33', canopy2:'#3f9a45', hazTop:'#46b6e2', hazBot:'#155489', vine:'#4f8f2a', leaf:'#6fc04a' } },
  { name:'Moeras', bonus:0.5, icon:'🐸', start:450, tip:'Rotte lianen breken! Wespen stelen appels.', style:'swamp', particle:'firefly', hazardName:'het moeras', shroom:'#8a5bd1',
    c:{ skyTop:'#6f8c70', skyMid:'#a9b98e', skyBot:'#dcdca6', sun:'#f0f0b0', far:'#72876a', far2:'#556b48', mid:'#3a4d2e', canopy:'#2e4524', canopy2:'#4d6a33', hazTop:'#6b8a3a', hazBot:'#26331a', vine:'#5f7d2c', leaf:'#8aa04a' } },
  { name:'Savanne', bonus:1, icon:'🦒', start:1100, tip:'Roze elastieken lianen veren mee!', style:'savanne', particle:'dust', hazardName:'het drijfzand', shroom:'#e07a1f',
    c:{ skyTop:'#ef8a3c', skyMid:'#f7b86a', skyBot:'#fde7aa', sun:'#fff0c0', far:'#d9925a', far2:'#b9783f', mid:'#6e5320', canopy:'#5f7a22', canopy2:'#90a83a', hazTop:'#d9a45a', hazBot:'#7a4e1e', vine:'#7d8a2a', leaf:'#a8b84a' } },
  { name:'IJsbergen', bonus:1.5, icon:'❄️', start:1900, tip:'IJslianen zijn glad – je glijdt omlaag!', style:'ice', particle:'snow', hazardName:'het ijswater', shroom:'#4aa3df',
    c:{ skyTop:'#7cbbea', skyMid:'#b4dcf5', skyBot:'#f0f9ff', sun:'#ffffff', far:'#c3d8ec', far2:'#94b4d2', mid:'#2f5d62', canopy:'#d4e7f5', canopy2:'#f4fbff', hazTop:'#8fd0f0', hazBot:'#205d8e', vine:'#5c9aa8', leaf:'#d8f0ff' } },
  { name:'Vulkaan', bonus:2, icon:'🌋', start:2900, tip:'Vuurballen verbranden je appels!', style:'volcano', particle:'ember', hazardName:'de lava', shroom:'#b83b2b',
    c:{ skyTop:'#1e0a0e', skyMid:'#5a1c18', skyBot:'#c2481c', sun:'#ffb060', far:'#4a1d1a', far2:'#331311', mid:'#1f0c0c', canopy:'#2e2016', canopy2:'#4d3320', hazTop:'#ffae2a', hazBot:'#a81c0a', vine:'#6b5230', leaf:'#8a6a3a' } },
  { name:'Sterrennacht', bonus:3, icon:'🌙', start:4100, tip:'Alles komt samen… succes!', style:'night', particle:'star', hazardName:'het nachtmeer', shroom:'#c04ad8',
    c:{ skyTop:'#050822', skyMid:'#171a4a', skyBot:'#3b2c70', sun:'#f4f1d8', far:'#1c2152', far2:'#141a40', mid:'#101842', canopy:'#12302e', canopy2:'#1e4a42', hazTop:'#4046b8', hazBot:'#0c1036', vine:'#3c8a6a', leaf:'#5ac08a' } },
  { name:'Portaalwoud', bonus:4, icon:'🌀', start:5200, tip:'Vlieg door een blauw portaal: je komt met al je vaart uit het oranje!', style:'jungle', particle:'firefly', hazardName:'de energiestroom', shroom:'#ff8a1a',
    c:{ skyTop:'#161a45', skyMid:'#3b3b8f', skyBot:'#8fcfe0', sun:'#e6fbff', far:'#4a57a3', far2:'#384385', mid:'#26306c', canopy:'#26586a', canopy2:'#3a9a98', hazTop:'#63e2ff', hazBot:'#1c2a78', vine:'#3f8f86', leaf:'#7fe0c8' } },
  // Vier stijl-biomes: alles wordt anders getekend (blokjes, Paint, 3D, snoep), zie de stijlen in render-bg.js/render-world.js
  { name:'Kubuswoud', bonus:5, icon:'🟩', start:6300, tip:'Alles is van blokjes, net als in Minecraft!', style:'blocky', particle:'pixel', hazardName:'het blokwater', shroom:'#c0392b',
    c:{ skyTop:'#6f9ff7', skyMid:'#8fb6fa', skyBot:'#c3d8fb', sun:'#fffbe0', far:'#7e9a6a', far2:'#5f8a4a', mid:'#3f7a2a', canopy:'#3a7d24', canopy2:'#5aa532', hazTop:'#3f76e4', hazBot:'#1d3f9a', vine:'#4a8a2a', leaf:'#60b538' } },
  { name:'Tekenland', bonus:6, icon:'🖍️', start:7400, tip:'Alles is getekend in Paint. Pas op voor de verfpot!', style:'paint', particle:'paint', hazardName:'de verfpot', shroom:'#ed1c24',
    c:{ skyTop:'#99d9ea', skyMid:'#a8def0', skyBot:'#d4f1f9', sun:'#fff200', far:'#b5e61d', far2:'#22b14c', mid:'#22b14c', canopy:'#22b14c', canopy2:'#b5e61d', hazTop:'#00a2e8', hazBot:'#3f48cc', vine:'#22b14c', leaf:'#b5e61d' } },
  { name:'3D-wereld', bonus:7, icon:'🧊', start:8500, tip:'Welkom in de derde dimensie!', style:'poly3d', particle:'cube', hazardName:'de rasterzee', shroom:'#ff3d7f',
    c:{ skyTop:'#1a1f5c', skyMid:'#5a4fcf', skyBot:'#ff9ecf', sun:'#ffe066', far:'#6a4bc7', far2:'#4a3aa0', mid:'#2e2a6e', canopy:'#3fd0c9', canopy2:'#7af0e0', hazTop:'#ff4fb4', hazBot:'#20124d', vine:'#3fc9b8', leaf:'#8ff5e5' } },
  { name:'Snoepland', bonus:8, icon:'🍭', start:9700, tip:'Zoete lianen en een rivier van chocola!', style:'candy', particle:'sprinkle', hazardName:'de chocoladerivier', shroom:'#ff5fa2',
    c:{ skyTop:'#ffb3d9', skyMid:'#ffd1e8', skyBot:'#fff0f7', sun:'#fff6b0', far:'#f7a8cf', far2:'#e58bbd', mid:'#c76a9f', canopy:'#ff7eb9', canopy2:'#ffc2e0', hazTop:'#8a4b2a', hazBot:'#4a2412', vine:'#e84a8a', leaf:'#7fdc9a' } },
];
// Muziek per biome: toonsoort (halve tonen) en of hij in mineur klinkt (ook voor het riedeltje bij een nieuwe biome)
BIOMES.forEach((b, i) => { b.key = [0, -3, 2, 5, -2, -5, 3, -1, 4, 1, 6][i]; b.minor = [4, 5, 6, 9].includes(i); });
for (const b of BIOMES) { b.rgb = {}; for (const k in b.c) b.rgb[k] = hexToRgb(b.c[k]); }

// Kansen per kolom lianen: vijanden en speciale lianen, per biome
function features(bi) {
  return {
    wasps:   [0, .30, .14, .10, .10, .16, .10, .12, .12, .14, .12][bi],
    fire:    [0, 0, 0, 0, .45, .20, 0, 0, 0, .15, 0][bi],
    birds:   [0, 0, 0, .22, .06, .20, .10, .15, .18, .20, .15][bi],
    rotten:  [0, .12, .28, .06, .20, .16, .10, .12, .12, .14, .12][bi],
    icy:     [0, 0, .05, .40, 0, .16, .06, .06, .06, .10, .06][bi],
    turbo:   [.08, .07, .07, .07, .10, .08, .08, .08, .08, .09, .10][bi],
    elastic: [.05, .06, .10, .05, .06, .08, .07, .07, .08, .08, .12][bi],
    fruit:   [.08, .07, .06, .06, .05, .06, .06, .06, .07, .06, .10][bi],
    portals: [0, 0, 0, 0, 0, 0, .45, 0, 0, .2, 0][bi],
  };
}

// =====================================================================
//  Upgrades
// =====================================================================
const gripR      = l => 34 + 7 * l;
const pumpA      = l => 600 * (1 + 0.22 * l);
const launchM    = l => 1.16 + 0.07 * l;
const magnetR    = l => l ? 70 + 34 * l : 0;    // bereik in rust (level 5: 240); groeit iets mee met je snelheid, zie updateApples
const magnetPull = l => 900 + 160 * l;          // hoe hard de magneet trekt
const appleVal   = l => 1 + 0.5 * l;
const goldChance = l => 0.03 + 0.025 * l;
const rocketDist = l => 150 * l;
const parrotCd   = l => 2.4 - 0.45 * l;
const comboWin   = l => 0.8 + 0.3 * l;
// Hoeveel appels één geplukte appel oplevert. De biomebonus telt op bij de Appeloogst-upgrade
// (niet vermenigvuldigen), zodat late biomes lonend zijn zonder dat upgrades uit balans raken.
// In de herhaalde biomes na de laatste (zie biomeSeg) tellen appels altijd minstens zoveel als in de laatste biome.
const applesPerPick = (bi, m) => appleVal(lvl('value')) + Math.max(BIOMES[bi].bonus, !game.career && m >= CYCLE_START ? BIOMES[BIOMES.length - 1].bonus : 0);
const fmtNum = n => (Math.round(n * 10) / 10).toString().replace('.', ',');

// Elke upgrade heeft max niveaus, en elk niveau is opgedeeld in tiers kleinere stapjes (standaard 3). Een stapje
// kost ongeveer wat vroeger een heel niveau kostte (zie upCost), dus alles maximaal duurt veel langer zonder
// dat een aankoop duurder wordt. whole: alleen hele niveaus (tellers zoals ballonnen en helmen).
const R0 = n => Math.round(n);
const UPGRADES = [
  { id:'grip',    icon:'✋', name:'Lange armen',    info:'Grijp lianen van verder weg.',                          max:5, base:25,  growth:1.8,  fx:l => `${R0(gripR(l))} bereik` },
  { id:'swing',   icon:'🌀', name:'Zwaaikracht',    info:'Zwaai harder en sneller.',              max:5, base:30,  growth:1.8,  fx:l => `+${R0(l * 22)}% zwaai, max ${R0(1250 + 120 * l)}` },
  { id:'launch',  icon:'💨', name:'Lanceerkracht',  info:'Meer vaart bij het loslaten.',                        max:5, base:40,  growth:1.85, fx:l => `+${R0(l * 7)}% vaart, top ${R0(1600 + 130 * l)}` },
  { id:'magnet',  icon:'🧲', name:'Appelmagneet',   info:'Trekt appels naar je toe.',                 max:5, base:35,  growth:1.8,  fx:l => l ? `${R0(magnetR(l))} bereik` : 'geen' },
  { id:'value',   icon:'🧺', name:'Appeloogst',     info:'Elke appel telt voor meer.', max:5, base:50, growth:1.9, fx:l => `×${fmtNum(appleVal(l))} per appel` },
  { id:'golden',  icon:'✨', name:'Gouden appels',  info:'Meer gouden appels (5 waard).',                  unlock:4, max:4, base:45,  growth:1.9,  fx:l => `${fmtNum(goldChance(l) * 100)}% kans` },
  { id:'balloon', icon:'🎈', name:'Reddingsballon', info:'Redt je als je valt.',                     max:3, base:80,  growth:2.2,  whole:true, fx:l => `${l}× per run` },
  { id:'helmet',  icon:'⛑️', name:'Helm',           info:'Vijanden stelen geen appels.',         unlock:6, max:3, base:70,  growth:2.2,  whole:true, fx:l => `${l}× per run` },
  { id:'rocket',  icon:'🚀', name:'Raketstart',     info:'Begin met een raketvlucht.',                   unlock:20, max:4, base:120, growth:2.0,  fx:l => l ? `${R0(rocketDist(l))} m` : 'geen' },
  { id:'parrot',  icon:'🦜', name:'Papegaaimaatje', info:'Een papegaai plukt appels voor je.',  unlock:14, max:4, base:90,  growth:2.0,  fx:l => l ? `elke ${fmtNum(parrotCd(l))} s een appel` : 'geen' },
  { id:'rain',    icon:'🌧️', name:'Appelregen',     info:'Appelregen bij elke 100 m.',        unlock:16, max:3, base:60,  growth:2.0,  fx:l => l ? `${R0(3 + l * 3)} appels per 100 m` : 'geen' },
  { id:'combo',   icon:'🔥', name:'Comboketting',   info:'Langere combo\'s, meer bonus.',  unlock:8, max:3, base:55,  growth:2.0,  fx:l => `${fmtNum(comboWin(l))} s · bonus ×${fmtNum(1 + l)}` },
  { id:'vinewise',icon:'🌿', name:'Liaankenner',    info:'Sterkere rotte lianen, minder glad ijs.', unlock:12, max:3, base:50, growth:2.0, fx:l => l ? `+${R0(l * 40)}% grip` : 'geen' },
  { id:'wingsuit',icon:'🦸', name:'Wingsuit',       info:'Glijd veel verder door de lucht.', max:4, base:110, growth:2.0, fx:l => l ? `+${R0(l * 25)}% glijvlucht` : 'geen' },
  { id:'shroom',  icon:'🍄', name:'Stuiterzwam',    info:'Meer en sterkere paddenstoelen.',  unlock:10, max:3, base:40,  growth:1.9,  fx:l => l ? `+${R0(l * 40)}% paddenstoelen` : 'geen' },
];
for (const u of UPGRADES) { u.tiers = u.whole ? 1 : 3; u.steps = u.max * u.tiers; }
// In de carrière tellen upgrades veel minder mee (anders is een volledig ge-upgradede Andy niet te stoppen);
// de levels worden daar dan ook maar een beetje zwaarder van (zie levelInfo).
const CAREER_UP = 0.35;
// ---- XP: hoe verder je komt, hoe meer XP; met spelerslevels ontgrendel je nieuwe upgrades ----
const xpNeed = L => Math.round(260 * Math.pow(L, 1.6)); // XP nodig om van level L naar L+1 te gaan
function playerLevel(xp) { let L = 1; while (xp >= xpNeed(L)) { xp -= xpNeed(L); L++; } return { L, into: xp, need: xpNeed(L) }; }
const unlocked = u => !u.unlock || playerLevel(save.xp).L >= u.unlock;
// ---- Carrière: werelden met levels op een kaart (zie career.js); hoe verder, hoe AANZIENLIJK moeilijker ----
// Elke biome is een wereld met LEVELS_PER_WORLD levels: halverwege een toren (extra zwaar, twee uitdagingen)
// en als laatste het kasteel met een baasgevecht. Hoe meer upgrades je hebt, hoe zwaarder elk level (zie levelInfo).
const LEVELS_PER_WORLD = 8, TOWER_IDX = 3, WORLDS = BIOMES.length, LEVELS = WORLDS * LEVELS_PER_WORLD;
// Uitdagingen: een extra opdracht of tegenwerking in een level (zie career.js)
const CHALLENGES = {
  apples: { icon: '🍎', name: 'Appeljacht',  info: n => `Pak minstens ${n} appels vóór de finish` },
  wind:   { icon: '💨', name: 'Tegenwind',   info: () => 'In de lucht blaast de wind je terug' },
  fog:    { icon: '🌫️', name: 'Mist',        info: () => 'Je ziet maar een klein stukje om je heen' },
  rotten: { icon: '🪵', name: 'Rotte boel',  info: () => 'Veel rotte en gladde lianen' },
  swarm:  { icon: '🐝', name: 'Wespennest',  info: () => 'Veel meer vijanden' },
  rush:   { icon: '⏱️', name: 'Tijdrit',     info: () => 'Veel minder tijd' },
};
const CHALLENGE_ORDER = ['apples', 'wind', 'rotten', 'fog', 'swarm', 'rush'];
// De baas van elke wereld (zie career.js): naam, kleur en aanvalstype (throw = gooit, dive = duikt, rain = laat vallen)
const BOSSES = [
  { name: 'Kokosbaron',    col: '#8a5a2e', proj: 'kokos',  moves: ['throw'] },
  { name: 'Koning Wesp',   col: '#f2b705', proj: 'angel',  moves: ['throw', 'dive'] },
  { name: 'Grote Gier',    col: '#6e5236', proj: 'bot',    moves: ['dive', 'throw'] },
  { name: 'IJskoningin',   col: '#8fcfe6', proj: 'ijs',    moves: ['rain', 'throw'] },
  { name: 'Lavadraak',     col: '#c2481c', proj: 'vuur',   moves: ['throw', 'rain', 'dive'] },
  { name: 'Nachtuil',      col: '#3b2c70', proj: 'ster',   moves: ['dive', 'rain'] },
  { name: 'Portaalgeest',  col: '#3a9a98', proj: 'orb',    moves: ['throw', 'dive', 'rain'] },
  { name: 'Blokgolem',     col: '#5aa532', proj: 'blok',   moves: ['throw', 'rain'] },
  { name: 'Gumgum',        col: '#ed1c24', proj: 'verf',   moves: ['dive', 'throw', 'rain'] },
  { name: 'Polygoon',      col: '#ff4fb4', proj: 'kubus',  moves: ['throw', 'dive', 'rain'] },
  { name: 'Suikerspinner', col: '#ff7eb9', proj: 'snoep',  moves: ['rain', 'dive', 'throw'] },
];
// Tijdelijke power-ups in carrièrelevels (seconden; clock geeft extra tijd)
const POWERUPS = {
  star:   { icon: '⭐', name: 'Onkwetsbaar',   dur: 8,  col: '#ffd23f' },
  magnet: { icon: '🧲', name: 'Supermagneet',  dur: 12, col: '#ff5a5a' },
  wings:  { icon: '🪽', name: 'Vleugels',      dur: 10, col: '#9fe3ff' },
  turbo:  { icon: '🚀', name: 'Turbo',         dur: 3,  col: '#ff9a2a' },
  clock:  { icon: '⏰', name: '+20 seconden',  dur: 0,  col: '#7dff8a' },
  slow:   { icon: '⏳', name: 'Slowmotion',    dur: 7,  col: '#b8a4ff' }, // alles gaat half zo snel, ook de klok
};
function levelInfo(n) {
  const w = Math.min(WORLDS - 1, Math.floor((n - 1) / LEVELS_PER_WORLD)), idx = (n - 1) % LEVELS_PER_WORLD;
  const boss = idx === LEVELS_PER_WORLD - 1, tower = idx === TOWER_IDX, p = (n - 1) / (LEVELS - 1); // p: 0 bij level 1, 1 bij het laatste
  // up: hoe sterk je Andy is (0..1, alle upgrades). Een sterke Andy krijgt zwaardere levels en minder tijd.
  const up = upgradePower();
  const L = Math.round(260 + p * 1900 + idx * 25 + (boss ? 150 : 0));
  // uitdagingen: niet in de eerste twee levels en niet bij een baas; in een toren (en later, of met veel upgrades) twee
  const ch = [];
  if (!boss && n > 2 && (idx > 0 || up > 0.5)) {
    ch.push(CHALLENGE_ORDER[(w * 3 + idx) % CHALLENGE_ORDER.length]);
    if (tower || (w >= 5 && idx === 6) || (up > 0.8 && idx >= 4)) {
      const b = CHALLENGE_ORDER[(w * 3 + idx + 2) % CHALLENGE_ORDER.length];
      if (!ch.includes(b)) ch.push(b);
    }
  }
  // tijdslimiet (echte seconden): hoe verder en hoe sterker je bent, hoe sneller je moet gaan
  const pace = 6 + 8 * p + 2.5 * up; // verwachte gemiddelde snelheid (m/s); upgrades tellen in de carrière maar voor een deel mee (CAREER_UP)
  let time = Math.round(L / pace + 14);
  if (ch.includes('rush')) time = Math.round(time * 0.72);
  if (tower) time = Math.round(time * 0.9);
  const diff = clamp(0.2 + p * 1.6 + (tower ? 0.15 : 0) + (boss ? 0.1 : 0), 0, 2) + 0.35 * up;
  return { n, bi: w, world: w + 1, idx, boss, tower, L, p, up, ch, time, need: ch.includes('apples') ? Math.round(L / 11 * (1 + 0.15 * up)) : 0, diff };
}
// hoe zwaar een level is, in 1..5 bolletjes (voor de kaart)
const levelPips = I => clamp(Math.round(I.diff / 2.9 * 5 + 0.4), 1, 5);
// prijs van stapje s (0..steps-1): van de oude prijs van niveau 1 tot die van het laatste niveau, verdeeld over alle stapjes
const upCost = (u, s) => Math.round(u.base * 1.5 * Math.pow(u.growth, u.steps > 1 ? s * (u.max - 1) / (u.steps - 1) : 0) / 5) * 5;
// =====================================================================
//  Kisten (loot-boxes) en uiterlijk van Andy
// =====================================================================
// Kans per kolom lianen dat er een kist hangt (Eindeloos en carrière, niet in multiplayer)
const LOOT_CHANCE = 0.09;
const LOOT_GAP = 2200; // minimale afstand tussen twee kisten (wereld-eenheden)
// Zeldzaamheid: kleur, naam en gewicht (kans) bij het openen van een kist
const RARITY = {
  common:    { name: 'Gewoon',       col: '#9aa4b1', w: 55 },
  uncommon:  { name: 'Ongewoon',     col: '#4caf50', w: 26 },
  rare:      { name: 'Zeldzaam',     col: '#2f7fe0', w: 12.5 },
  epic:      { name: 'Episch',       col: '#a24de0', w: 5 },
  legendary: { name: 'Legendarisch', col: '#f5b301', w: 1.5 },
};
// Wat je uit een kist kunt halen. kind: apples/xp (meteen), color (vachtkleur), hat (hoed), suit (heel kostuum).
// Heb je een uiterlijk al, dan krijg je in plaats daarvan dupe appels.
const LOOT = [
  { id: 'apples30',  r: 'common', kind: 'apples', n: 30,  name: '30 appels',  icon: '🍎' },
  { id: 'apples75',  r: 'common', kind: 'apples', n: 75,  name: '75 appels',  icon: '🍎' },
  { id: 'xp100',     r: 'common', kind: 'xp',     n: 220, name: '220 XP',     icon: '⭐' },
  { id: 'xp250',     r: 'common', kind: 'xp',     n: 500, name: '500 XP',     icon: '⭐' },
  { id: 'fur_brown', r: 'uncommon', kind: 'color', name: 'Bruine vacht', icon: '🟤', fur: '#6b4a2e', furD: '#46301c', furL: '#9a7350' },
  { id: 'fur_grey',  r: 'uncommon', kind: 'color', name: 'Zilverrug',    icon: '⚪', fur: '#6e6e78', furD: '#48484f', furL: '#a6a6b2' },
  { id: 'hat_cap',   r: 'uncommon', kind: 'hat',   name: 'Petje',        icon: '🧢' },
  { id: 'suit_kiwi', r: 'uncommon', kind: 'suit',  name: 'Kiwikostuum',  icon: '🥝' },
  { id: 'fur_blue',  r: 'rare', kind: 'color', name: 'Blauwe vacht', icon: '🔵', fur: '#2f5fb8', furD: '#1b3c7a', furL: '#6a95ea' },
  { id: 'fur_pink',  r: 'rare', kind: 'color', name: 'Roze vacht',   icon: '🩷', fur: '#c9508c', furD: '#8e2f5f', furL: '#f08cbf' },
  { id: 'hat_cowboy',r: 'rare', kind: 'hat',   name: 'Cowboyhoed',   icon: '🤠' },
  { id: 'hat_pirate',r: 'rare', kind: 'hat',   name: 'Piratenhoed',  icon: '🏴‍☠️' },
  { id: 'fur_gold',  r: 'epic', kind: 'color', name: 'Gouden vacht',  icon: '🟡', fur: '#c9971a', furD: '#8a6510', furL: '#ffe066' },
  { id: 'hat_crown', r: 'epic', kind: 'hat',   name: 'Kroon',         icon: '👑' },
  { id: 'hat_wizard',r: 'epic', kind: 'hat',   name: 'Tovenaarshoed', icon: '🧙' },
  { id: 'suit_apple',r: 'legendary', kind: 'suit',  name: 'Appelkostuum',   icon: '🍎' },
  { id: 'fur_rainbow',r:'legendary', kind: 'color', name: 'Regenboogvacht', icon: '🌈', rainbow: true },
];
const LOOT_BY_ID = Object.fromEntries(LOOT.map(l => [l.id, l]));
const DUPE_APPLES = { uncommon: 40, rare: 90, epic: 180, legendary: 400 };
const CRATE_PRICE = 250; // een kist kopen met appels (in het kistenscherm)
// kiest een willekeurige buit: eerst de zeldzaamheid (op gewicht), dan een item daarbinnen
function rollLoot(rnd = Math.random) {
  let r = rnd() * Object.values(RARITY).reduce((a, x) => a + x.w, 0), rar = 'common';
  for (const k in RARITY) { if (r < RARITY[k].w) { rar = k; break; } r -= RARITY[k].w; }
  const pool = LOOT.filter(l => l.r === rar);
  return pool[(rnd() * pool.length) | 0];
}

// Head-start: aan het begin van een run (Eindeloos) koop je voor appels een vlucht vooruit
const HEADSTARTS = [{ m: 250, cost: 60 }, { m: 500, cost: 150 }, { m: 1000, cost: 400 }, { m: 2000, cost: 1000 }];

// =====================================================================
//  Moeilijkheid, tempo en kleurpalet per afstand
// =====================================================================

// De wereld is een rij biome-stukken. Na de laatste biome (Snoepland) komen de biomes steeds opnieuw terug,
// elk CYCLE_LEN meter lang, in een vaste, door elkaar gehusselde volgorde: zo blijf je nooit in dezelfde biome.
const CYCLE_START = 11000, CYCLE_LEN = 1100, CYCLE_ORDER = [3, 8, 5, 10, 1, 7, 4, 9, 2, 6];
// het biome-stuk op afstand m: { i: biome, start, n: volgnummer (hoeveelste stuk), next: volgende biome, nextStart }
function biomeSeg(m) {
  if (game.career) { const i = game.career.bi; return { i, start: -1e9, n: 0, next: i, nextStart: 1e12 }; }
  if (m >= CYCLE_START) {
    const k = Math.floor((m - CYCLE_START) / CYCLE_LEN), start = CYCLE_START + k * CYCLE_LEN;
    return { i: CYCLE_ORDER[k % CYCLE_ORDER.length], start, n: BIOMES.length + k, next: CYCLE_ORDER[(k + 1) % CYCLE_ORDER.length], nextStart: start + CYCLE_LEN };
  }
  let i = 0;
  for (let j = 0; j < BIOMES.length; j++) if (m >= BIOMES[j].start) i = j;
  const last = i === BIOMES.length - 1;
  return { i, start: BIOMES[i].start, n: i, next: last ? CYCLE_ORDER[0] : i + 1, nextStart: last ? CYCLE_START : BIOMES[i + 1].start };
}
function biomeIndexAt(m) { return biomeSeg(m).i; }
// Een korte, rustige 'buffer' rond elke biomegrens: geen vijanden of lastige lianen, alle drie banen aanwezig,
// zodat je de overgang (met slow motion en titelkaart, zie physics.js) op je gemak kunt beleven.
const BUFFER_BEFORE = 35, BUFFER_AFTER = 45;
function inBiomeBuffer(m) {
  if (game.career || game.mp) return false;
  const s = biomeSeg(m);
  return (s.start > 0 && m - s.start < BUFFER_AFTER) || s.nextStart - m < BUFFER_BEFORE;
}
// Hoe sterk Andy is door zijn upgrades (0 = niets gekocht, 1 = alles maximaal). Hoe sterker, hoe lastiger de wereld:
// grotere gaten, vaker ontbrekende lianen en meer vijanden. In multiplayer staan upgrades uit (lvl = 0), dus dan 0.
function upgradePower() {
  let have = 0, max = 0;
  if (game.mp) return 0;
  for (const u of UPGRADES) { have += upSteps(u.id) / u.tiers; max += u.max; }
  return max ? have / max : 0;
}
// Eindeloos (en multiplayer): de moeilijkheid loopt geleidelijk op en vlakt af naar een plafond,
// zodat het spel altijd te doen blijft (meer gaten, grotere afstanden, meer vijanden, minder appels).
// DIFF_START: ook aan het begin is het al iets lastiger dan de allereerste versie.
const DIFF_START = 0.2, DIFF_MAX = 1.3, DIFF_RAMP = 3000;
function diffAt(m) {
  const up = 0.35 * upgradePower(); // meer upgrades = lastiger
  if (game.career) return clamp(game.career.diff + 0.08 + Math.max(0, m) / game.career.L * 0.1, 0, 3); // upgrades zitten al in levelInfo
  return DIFF_START + (DIFF_MAX - DIFF_START) * (1 - Math.exp(-Math.max(0, m) / DIFF_RAMP)) + up;
}
// Eindeloos: het tempo gaat ook iets omhoog naarmate je verder komt, tot maximaal +12%% (bij 4000 m).
// Debug-snelheid telt overal mee, behalve online (dan moeten beide spelers gelijk zijn).
const SLOWMO = 0.5; // tempo tijdens de slowmotion-power-up
const TEMPO_MAX = 0.12, TEMPO_DIST = 4000;
// Standaardtempo van het spel (100% in het debugmenu).
// Werkt als tijdschaal: de physics-stappen blijven gelijk, er gaan er alleen minder per seconde.
const BASE_SPEED = 0.65; // met GAME_SPEED 1,2: de simulatie loopt op ~0,78× echte tijd (was 0,56: te sloom)
function timeScale() {
  let k = BASE_SPEED * (game.mp && !game.mp.local ? 1 : DBG.speed);
  if (!game.career && !game.mp && run) { const t = clamp(run.dist / TEMPO_DIST, 0, 1); k *= 1 + TEMPO_MAX * t * t * (3 - 2 * t); }
  if (game.career) k *= 1 + 0.25 * game.career.p + 0.05 * game.career.up;
  if (game.career && run && run.pow && run.pow.type === 'slow' && run.pow.t > 0) k *= SLOWMO; // power-up slowmotion // carrière: latere levels (en een sterke Andy) lopen sneller
  if (!game.mp && run && run.cine) k *= cineSlow(); // slow motion bij een nieuwe biome
  return k;
}
// Paletten worden bewaard en hergebruikt (niet elk beeld opnieuw 28 kleuren mengen). Lees ze alleen, pas ze niet aan.
const palMemo = new Map();
function makePalette(ai, bi, t) {
  const a = BIOMES[ai], b = BIOMES[bi], P = { a, b, t, ai, bi }; // let op: bij ai === bi zijn a en b hetzelfde object
  for (const k in a.rgb) {
    P[k + 'C'] = mixC(a.rgb[k], b.rgb[k], t);
    P[k] = rgbStr(P[k + 'C']);
  }
  return P;
}
function paletteAt(m) {
  const S = biomeSeg(m), i = S.i, bi = S.next;
  let t = 0;
  if (bi !== i) { const zone = 90; t = Math.round(clamp((m - (S.nextStart - zone)) / zone, 0, 1) * 256) / 256; }
  const key = (i * 16 + bi) * 1000 + t * 256;
  let P = palMemo.get(key);
  if (!P) { if (palMemo.size > 80) palMemo.clear(); P = makePalette(i, bi, t); palMemo.set(key, P); }
  return P;
}
// het palet van precies één biome (voor de gebufferde achtergrondtegels, zie tileLayer in render-bg.js)
const palettePure = i => { const key = -1 - i; let P = palMemo.get(key); if (!P) { P = makePalette(i, i, 0); palMemo.set(key, P); } return P; };
function styleWeight(P, style) { return (P.a.style === style ? 1 - P.t : 0) + (P.b.style === style ? P.t : 0); }

// Uiterlijk van speciale lianen
const VINE_LOOK = {
  rotten:  { col: '#7b5b36', leaf: '#9a7a4a' },
  icy:     { col: '#8fcfe6', leaf: '#f2fbff' },
  turbo:   { col: '#f2b705', leaf: '#ffe680' },
  elastic: { col: '#e0559f', leaf: '#ff9ed2' },
  balloon: { col: '#b98d55', leaf: '#e8d3a8' },
  space:   { col: '#9d7bff', leaf: '#e2d6ff' }, // sterrenlianen in de ruimte
};

// Kiwi (AI-tegenstander): niveaus, zie mp-local.js
// De niveaus verschillen in reactietijd, timing, fouten en hoe goed hij vaart opbouwt.
const AI_LV = [
  { name: 'Makkelijk', react: 0.28, late: [0.1, 0.4],   oops: 0.25, grab: 0.62, patience: 0 },
  { name: 'Normaal',   react: 0.1,  late: [0.02, 0.16], oops: 0.06, grab: 0.88, patience: 0.5 },
  { name: 'Moeilijk',  react: 0.04, late: [0, 0.07],    oops: 0.02, grab: 1,    patience: 0.8 },
  { name: 'Expert',    react: 0,    late: [0, 0.02],    oops: 0,    grab: 1,    patience: 1 },
];
