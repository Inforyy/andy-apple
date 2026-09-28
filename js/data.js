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
const SPR_RES = 1.25;         // resolutie van voorgetekende sprites

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
];
for (const b of BIOMES) { b.rgb = {}; for (const k in b.c) b.rgb[k] = hexToRgb(b.c[k]); }

// Kansen per kolom lianen: vijanden en speciale lianen, per biome
function features(bi) {
  return {
    wasps:   [0, .30, .14, .10, .10, .16, .10][bi],
    fire:    [0, 0, 0, 0, .45, .20, 0][bi],
    birds:   [0, 0, 0, .22, .06, .20, .10][bi],
    rotten:  [0, .12, .28, .06, .20, .16, .10][bi],
    icy:     [0, 0, .05, .40, 0, .16, .06][bi],
    turbo:   [.08, .07, .07, .07, .10, .08, .08][bi],
    elastic: [.05, .06, .10, .05, .06, .08, .07][bi],
    fruit:   [.08, .07, .06, .06, .05, .06, .06][bi],
    portals: [0, 0, 0, 0, 0, 0, .45][bi],
  };
}

// =====================================================================
//  Upgrades
// =====================================================================
const gripR      = l => 34 + 7 * l;
const pumpA      = l => 600 * (1 + 0.22 * l);
const launchM    = l => 1.16 + 0.07 * l;
const magnetR    = l => l ? 50 + 35 * l : 0;
const appleVal   = l => 1 + 0.5 * l;
const goldChance = l => 0.03 + 0.025 * l;
const rocketDist = l => 150 * l;
const parrotCd   = l => 2.4 - 0.45 * l;
const comboWin   = l => 0.8 + 0.3 * l;
// Hoeveel appels één geplukte appel oplevert. De biomebonus telt op bij de Appeloogst-upgrade
// (niet vermenigvuldigen), zodat late biomes lonend zijn zonder dat upgrades uit balans raken.
const applesPerPick = bi => appleVal(lvl('value')) + BIOMES[bi].bonus;
const fmtNum = n => (Math.round(n * 10) / 10).toString().replace('.', ',');

const UPGRADES = [
  { id:'grip',    icon:'✋', name:'Lange armen',    info:'Grijp lianen van verder weg.',                          max:5, base:25,  growth:1.8,  fx:l => `${gripR(l)} bereik` },
  { id:'swing',   icon:'🌀', name:'Zwaaikracht',    info:'Zwaai harder en sneller.',              max:5, base:30,  growth:1.8,  fx:l => `+${l * 22}% zwaai, max ${1250 + 120 * l}` },
  { id:'launch',  icon:'💨', name:'Lanceerkracht',  info:'Meer vaart bij het loslaten.',                        max:5, base:40,  growth:1.85, fx:l => `+${l * 7}% vaart, top ${1600 + 130 * l}` },
  { id:'magnet',  icon:'🧲', name:'Appelmagneet',   info:'Trekt appels naar je toe.',                 max:5, base:35,  growth:1.8,  fx:l => l ? `${magnetR(l)} bereik` : 'geen' },
  { id:'value',   icon:'🧺', name:'Appeloogst',     info:'Elke appel telt voor meer.', max:5, base:50, growth:1.9, fx:l => `×${fmtNum(appleVal(l))} per appel` },
  { id:'golden',  icon:'✨', name:'Gouden appels',  info:'Meer gouden appels (5 waard).',                  unlock:4, max:4, base:45,  growth:1.9,  fx:l => `${Math.round(goldChance(l) * 100)}% kans` },
  { id:'balloon', icon:'🎈', name:'Reddingsballon', info:'Redt je als je valt.',                     max:3, base:80,  growth:2.2,  fx:l => `${l}× per run` },
  { id:'helmet',  icon:'⛑️', name:'Helm',           info:'Vijanden stelen geen appels.',         unlock:6, max:3, base:70,  growth:2.2,  fx:l => `${l}× per run` },
  { id:'rocket',  icon:'🚀', name:'Raketstart',     info:'Begin met een raketvlucht.',                   unlock:20, max:4, base:120, growth:2.0,  fx:l => l ? `${rocketDist(l)} m` : 'geen' },
  { id:'parrot',  icon:'🦜', name:'Papegaaimaatje', info:'Een papegaai plukt appels voor je.',  unlock:14, max:4, base:90,  growth:2.0,  fx:l => l ? `elke ${fmtNum(parrotCd(l))} s een appel` : 'geen' },
  { id:'rain',    icon:'🌧️', name:'Appelregen',     info:'Appelregen bij elke 100 m.',        unlock:16, max:3, base:60,  growth:2.0,  fx:l => l ? `${3 + l * 3} appels per 100 m` : 'geen' },
  { id:'combo',   icon:'🔥', name:'Comboketting',   info:'Langere combo\'s, meer bonus.',  unlock:8, max:3, base:55,  growth:2.0,  fx:l => `${fmtNum(comboWin(l))} s · bonus ×${1 + l}` },
  { id:'vinewise',icon:'🌿', name:'Liaankenner',    info:'Sterkere rotte lianen, minder glad ijs.', unlock:12, max:3, base:50, growth:2.0, fx:l => l ? `+${l * 40}% grip` : 'geen' },
  { id:'wingsuit',icon:'🦸', name:'Wingsuit',       info:'Glijd veel verder door de lucht.', max:4, base:110, growth:2.0, fx:l => l ? `+${l * 25}% glijvlucht` : 'geen' },
  { id:'shroom',  icon:'🍄', name:'Stuiterzwam',    info:'Meer en sterkere paddenstoelen.',  unlock:10, max:3, base:40,  growth:1.9,  fx:l => l ? `+${l * 40}% paddenstoelen` : 'geen' },
];
// ---- XP: hoe verder je komt, hoe meer XP; met spelerslevels ontgrendel je nieuwe upgrades ----
const xpNeed = L => Math.round(260 * Math.pow(L, 1.6)); // XP nodig om van level L naar L+1 te gaan
function playerLevel(xp) { let L = 1; while (xp >= xpNeed(L)) { xp -= xpNeed(L); L++; } return { L, into: xp, need: xpNeed(L) }; }
const unlocked = u => !u.unlock || playerLevel(save.xp).L >= u.unlock;
// ---- Carrière: levels met een start en een finish; hoe hoger, hoe moeilijker ----
const LEVELS = 35;
function levelInfo(n) {
  const bi = Math.min(BIOMES.length - 1, Math.floor((n - 1) / 5));
  return { n, bi, L: 180 + n * 40, diff: clamp(0.04 + (n - 1) * 0.045, 0, 1.35) };
}
const upCost = (u, l) => Math.round(u.base * 1.5 * Math.pow(u.growth, l) / 5) * 5;

// =====================================================================
//  Moeilijkheid, tempo en kleurpalet per afstand
// =====================================================================

function biomeIndexAt(m) { if (game.career) return game.career.bi; let i = 0; for (let j = 0; j < BIOMES.length; j++) if (m >= BIOMES[j].start) i = j; return i; }
// Eindeloos (en multiplayer): de moeilijkheid loopt geleidelijk op en vlakt af naar een plafond,
// zodat het spel altijd te doen blijft (meer gaten, grotere afstanden, meer vijanden, minder appels).
// DIFF_START: ook aan het begin is het al iets lastiger dan de allereerste versie.
const DIFF_START = 0.2, DIFF_MAX = 1.3, DIFF_RAMP = 3000;
function diffAt(m) {
  if (game.career) return clamp(game.career.diff + 0.08 + Math.max(0, m) / game.career.L * 0.08, 0, 1.45);
  return DIFF_START + (DIFF_MAX - DIFF_START) * (1 - Math.exp(-Math.max(0, m) / DIFF_RAMP));
}
// Eindeloos: het tempo gaat ook iets omhoog naarmate je verder komt, tot maximaal +12%% (bij 4000 m).
// Debug-snelheid telt overal mee, behalve online (dan moeten beide spelers gelijk zijn).
const TEMPO_MAX = 0.12, TEMPO_DIST = 4000;
// Standaardtempo van het spel (100% in het debugmenu).
// Werkt als tijdschaal: de physics-stappen blijven gelijk, er gaan er alleen minder per seconde.
const BASE_SPEED = 0.56; // = 80% van het vorige standaardtempo (0,7)
function timeScale() {
  let k = BASE_SPEED * (game.mp && !game.mp.local ? 1 : DBG.speed);
  if (!game.career && !game.mp && run) { const t = clamp(run.dist / TEMPO_DIST, 0, 1); k *= 1 + TEMPO_MAX * t * t * (3 - 2 * t); }
  return k;
}
function paletteAt(m) {
  const i = biomeIndexAt(m), a = BIOMES[i], b = game.career ? a : BIOMES[i + 1] || a;
  let t = 0;
  if (b !== a) { const zone = 90; t = clamp((m - (b.start - zone)) / zone, 0, 1); }
  const P = { a, b, t, ai: i, bi: b === a ? i : i + 1 };
  for (const k in a.rgb) {
    P[k + 'C'] = mixC(a.rgb[k], b.rgb[k], t);
    P[k] = rgbStr(P[k + 'C']);
  }
  return P;
}
function styleWeight(P, style) { return (P.a.style === style ? 1 - P.t : 0) + (P.b.style === style ? P.t : 0); }

// Uiterlijk van speciale lianen
const VINE_LOOK = {
  rotten:  { col: '#7b5b36', leaf: '#9a7a4a' },
  icy:     { col: '#8fcfe6', leaf: '#f2fbff' },
  turbo:   { col: '#f2b705', leaf: '#ffe680' },
  elastic: { col: '#e0559f', leaf: '#ff9ed2' },
  balloon: { col: '#b98d55', leaf: '#e8d3a8' },
};

// Kiwi (AI-tegenstander): niveaus, zie mp-local.js
// De niveaus verschillen in reactietijd, timing, fouten en hoe goed hij vaart opbouwt.
const AI_LV = [
  { name: 'Makkelijk', react: 0.28, late: [0.1, 0.4],   oops: 0.25, grab: 0.62, patience: 0 },
  { name: 'Normaal',   react: 0.1,  late: [0.02, 0.16], oops: 0.06, grab: 0.88, patience: 0.5 },
  { name: 'Moeilijk',  react: 0.04, late: [0, 0.07],    oops: 0.02, grab: 1,    patience: 0.8 },
  { name: 'Expert',    react: 0,    late: [0, 0.02],    oops: 0,    grab: 1,    patience: 1 },
];
