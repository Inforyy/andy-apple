'use strict';
// Andy Apples · opslag
// Voortgang in localStorage, export/import en save-codes.

// =====================================================================
//  Opslag (localStorage; online via een account, zie online.js)
// =====================================================================
const SAVE_KEY = 'andyApples.save.v1';
function defaultSave() {
  return { version:3, upt:1, matrixSeen:0, apples:0, xp:0, upgrades:{}, best:0, totalApples:0, totalDistance:0, runs:0, maxBiome:0, sound:true, music:true, sfxVol:0.8, musicVol:0.8, lbBest:0, mpGames:0, mpWins:0, chaseBest:0, boxes:0, cosm:{ own:[], color:'', hat:'', suit:'' }, career:{ lpw:LEVELS_PER_WORLD, unlocked:1, anim:0, at:1, stars:Array.from({ length: LEVELS }, () => 0) } };
}
// Oude carrière (5 levels per wereld, het 5e was de baas) omzetten naar LEVELS_PER_WORLD per wereld:
// levels 1-4 blijven, de baas wordt het kasteel (laatste level); de nieuwe levels ertussen moet je nog spelen.
function migrateCareer(c) {
  const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
  const old = num(c.lpw) || 5;
  if (old === LEVELS_PER_WORLD || !Array.isArray(c.stars)) return c;
  const to = (n, lock) => { // lock: een open maar nog niet verslagen baas wordt het eerste nieuwe level
    if (n < 1) return n;
    const w = Math.floor((n - 1) / old), k = (n - 1) % old;
    return w * LEVELS_PER_WORLD + (k === old - 1 ? (lock ? old - 1 : LEVELS_PER_WORLD - 1) : k) + 1;
  };
  const stars = [];
  c.stars.forEach((v, i) => { if (v) stars[to(i + 1) - 1] = v; });
  const u = num(c.unlocked) || 1, beaten = (u - 1) % old === old - 1 ? !!c.stars[u - 1] : true;
  const out = Object.assign({}, c, { lpw: LEVELS_PER_WORLD, stars, unlocked: to(u, !beaten) });
  if ('anim' in c) out.anim = Math.min(to(num(c.anim), true), out.unlocked);
  if ('at' in c) out.at = Math.min(to(num(c.at), true), out.unlocked);
  return out;
}
function normalizeSave(o) {
  const s = defaultSave();
  for (const u of UPGRADES) s.upgrades[u.id] = 0;
  if (!o || typeof o !== 'object') return s;
  const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
  // oudere saves gebruikten bananen als munt: die worden 1-op-1 appels
  s.apples = num('apples' in o ? o.apples : o.bananas);
  s.best = num(o.best);
  s.totalApples = num(o.totalApples);
  s.totalDistance = num(o.totalDistance);
  s.runs = num(o.runs);
  s.maxBiome = Math.min(num(o.maxBiome), BIOMES.length - 1);
  s.sound = o.sound !== false;
  s.music = o.music !== false;
  // volume (0–1) van effecten en muziek
  const vol = (v, d) => (typeof v === 'number' && isFinite(v)) ? clamp(v, 0, 1) : d;
  s.sfxVol = vol(o.sfxVol, s.sfxVol);
  s.musicVol = vol(o.musicVol, s.musicVol);
  s.xp = num(o.xp);
  s.lbBest = num('lbBest' in o ? o.lbBest : o.best); // beste afstand die meetelt voor de ranglijst (zonder debug-snelheid)
  s.mpGames = num(o.mpGames);
  s.matrixSeen = o.matrixSeen ? 1 : 0; // het Matrix-geheim gevonden (eenmalige beloning)
  s.mpWins = Math.min(num(o.mpWins), s.mpGames);
  s.chaseBest = Math.min(num(o.chaseBest), 36e6); // langste achtervolging (ms)
  // kisten en uiterlijk: alleen bestaande items, en alleen aantrekken wat je hebt
  s.boxes = Math.min(num(o.boxes), 9999);
  const cm = (o.cosm && typeof o.cosm === 'object') ? o.cosm : {};
  s.cosm.own = [...new Set(Array.isArray(cm.own) ? cm.own.filter(id => LOOT_BY_ID[id] && ['color', 'hat', 'suit'].includes(LOOT_BY_ID[id].kind)) : [])];
  for (const k of ['color', 'hat', 'suit']) s.cosm[k] = s.cosm.own.includes(cm[k]) && LOOT_BY_ID[cm[k]].kind === k ? cm[k] : '';
  const c = migrateCareer((o.career && typeof o.career === 'object') ? o.career : {});
  s.career.unlocked = clamp(num(c.unlocked) || 1, 1, LEVELS);
  s.career.stars = Array.from({ length: LEVELS }, (_, i) => clamp(num(Array.isArray(c.stars) ? c.stars[i] : 0), 0, 3));
  // anim: tot welk level het vrijspeel-filmpje op de kaart al is getoond (oude saves: alles al gezien); at: waar Andy staat
  s.career.anim = 'anim' in c ? clamp(num(c.anim), 0, s.career.unlocked) : (o.career ? s.career.unlocked : 0);
  s.career.at = clamp(num(c.at) || s.career.unlocked, 1, s.career.unlocked);
  s.career.lpw = LEVELS_PER_WORLD;
  const up = (o.upgrades && typeof o.upgrades === 'object') ? o.upgrades : {};
  // upt: upgrades staan in stapjes (tiers). Oudere saves telden hele niveaus: die worden omgerekend.
  const oldLv = !('upt' in o);
  for (const u of UPGRADES) s.upgrades[u.id] = clamp(num(up[u.id]) * (oldLv ? u.tiers : 1), 0, u.steps);
  return s;
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return normalizeSave(JSON.parse(raw));
  } catch (e) { /* kapotte of geblokkeerde opslag */ }
  return normalizeSave(null);
}
function persist() {
  try { cloudDirty(); } catch (e) { /* account-code nog niet geladen */ }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}
let save = loadSave();
// tijdens multiplayer staan alle upgrades uit: iedereen speelt met een gewone Andy
// upSteps: hoeveel stapjes (tiers) van een upgrade gekocht zijn. lvl: het effectieve niveau (0..max, met tussenstapjes),
// 0 in multiplayer en veel zwakker in de carrière (CAREER_UP; tellers zoals ballonnen blijven hele getallen).
const upSteps = id => save.upgrades[id] || 0;
const UP_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
function lvl(id) {
  if (game.mp) return 0;
  const u = UP_BY_ID[id], l = upSteps(id) / u.tiers * (game.career ? CAREER_UP : 1);
  return u.whole ? Math.floor(l + 1e-9) : l;
}

function checksum(str) { // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
