'use strict';
// Andy Apples · opslag
// Voortgang in localStorage, export/import en save-codes.

// =====================================================================
//  Opslag (localStorage + export/import)
// =====================================================================
const SAVE_KEY = 'andyApples.save.v1';
const GAME_ID = 'Andy Apples';
function defaultSave() {
  return { version:3, apples:0, xp:0, upgrades:{}, best:0, totalApples:0, totalDistance:0, runs:0, maxBiome:0, sound:true, music:true, lbBest:0, mpGames:0, mpWins:0, chaseBest:0, boxes:0, cosm:{ own:[], color:'', hat:'', suit:'' }, career:{ unlocked:1, stars:Array.from({ length: LEVELS }, () => 0) } };
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
  s.xp = num(o.xp);
  s.lbBest = num('lbBest' in o ? o.lbBest : o.best); // beste afstand die meetelt voor de ranglijst (zonder debug-snelheid)
  s.mpGames = num(o.mpGames);
  s.mpWins = Math.min(num(o.mpWins), s.mpGames);
  s.chaseBest = Math.min(num(o.chaseBest), 36e6); // langste achtervolging (ms)
  // kisten en uiterlijk: alleen bestaande items, en alleen aantrekken wat je hebt
  s.boxes = Math.min(num(o.boxes), 9999);
  const cm = (o.cosm && typeof o.cosm === 'object') ? o.cosm : {};
  s.cosm.own = [...new Set(Array.isArray(cm.own) ? cm.own.filter(id => LOOT_BY_ID[id] && ['color', 'hat', 'suit'].includes(LOOT_BY_ID[id].kind)) : [])];
  for (const k of ['color', 'hat', 'suit']) s.cosm[k] = s.cosm.own.includes(cm[k]) && LOOT_BY_ID[cm[k]].kind === k ? cm[k] : '';
  const c = (o.career && typeof o.career === 'object') ? o.career : {};
  s.career.unlocked = clamp(num(c.unlocked) || 1, 1, LEVELS);
  s.career.stars = Array.from({ length: LEVELS }, (_, i) => clamp(num(Array.isArray(c.stars) ? c.stars[i] : 0), 0, 3));
  const up = (o.upgrades && typeof o.upgrades === 'object') ? o.upgrades : {};
  for (const u of UPGRADES) s.upgrades[u.id] = clamp(num(up[u.id]), 0, u.max);
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
const lvl = id => game.mp ? 0 : (save.upgrades[id] || 0);

function checksum(str) { // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function makeExport() {
  const data = JSON.parse(JSON.stringify(save));
  return { game:GAME_ID, format:1, exported:new Date().toISOString(), data, check:checksum(JSON.stringify(data)) };
}
const toB64 = s => btoa(unescape(encodeURIComponent(s)));
const fromB64 = s => decodeURIComponent(escape(atob(s.replace(/\s+/g, ''))));
function parseSaveText(text) {
  text = String(text || '').trim();
  if (!text) throw new Error('Er is niets om te laden.');
  try {
    if (text[0] === '{') return JSON.parse(text);
    if (text.startsWith('AA1:')) text = text.slice(4);
    return JSON.parse(fromB64(text));
  } catch (e) { throw new Error('dit is geen geldige Andy Apples save.'); }
}
function importObject(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Onbekend bestandsformaat.');
  let data = obj;
  if ('game' in obj) {
    if (obj.game !== GAME_ID || !obj.data) throw new Error('Dit is geen Andy Apples save.');
    data = obj.data;
    if (obj.check && obj.check !== checksum(JSON.stringify(data))) {
      if (!confirm('Deze save lijkt handmatig aangepast te zijn. Toch importeren?')) return false;
    }
  } else if (!('apples' in obj) && !('bananas' in obj) && !('upgrades' in obj)) {
    throw new Error('Dit is geen Andy Apples save.');
  }
  const incoming = normalizeSave(data);
  if (!confirm(`Save importeren?\n\nNieuw: 🍎 ${incoming.apples} · record ${incoming.best} m\nHuidig: 🍎 ${save.apples} · record ${save.best} m\n\nJe huidige voortgang wordt overschreven.`)) return false;
  save = incoming;
  persist();
  return true;
}
