'use strict';
// Andy Apples · hulpfuncties
// Kleine, algemene hulpjes (rekenen, kleuren, random) zonder spelkennis. Laadt als eerste script na config.js.

// =====================================================================
//  Hulpfuncties
// =====================================================================
function rand(a, b) { return a + Math.random() * (b - a); }
// de wereldgenerator heeft een eigen random-bron: in de carrière is elk level daardoor altijd hetzelfde
let genRandom = Math.random;
function grand(a, b) { return a + genRandom() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgbStr(c, a) { return a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function mixC(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function shade(hex, f) { const c = hexToRgb(hex); return rgbStr(c.map(v => f < 0 ? v * (1 + f) : v + (255 - v) * f)); }
const $ = id => document.getElementById(id);
