'use strict';
// Andy Apples · beeld
// Canvas, schaal en zoom, automatische kwaliteit, volledig scherm/draaien en debug-instellingen.

// =====================================================================
//  Canvas & schaal
// =====================================================================
const canvas = $('game');
let ctx = canvas.getContext('2d', { alpha: false });
const mainCtx = ctx;
// op één scherm (split-screen): elke speler heeft een eigen beeld; VOX/VOY = linkerbovenhoek, RW/RH = grootte (apparaatpixels)
let VOX = 0, VOY = 0, RW = 0, RH = 0;
const LOCAL = { on: false, split: 'v', vw: 0, vh: 0, worlds: null, base: null, cfg: null, result: null, count: 0, lastCount: 99, score: [0, 0] };
// Kwaliteitsniveaus: het spel meet zelf de framerate en schakelt terug als het te traag gaat.
// px = maximaal aantal pixels voor het beeld, bg = resolutie van de (vage) achtergrond
// (niveau 3 = een volledig 1080p-beeld; de laagste stand blijft nog redelijk scherp)
const QUALITY = [
  { px: 0.45e6, bg: 0.4,  bgEvery: 3, rays: false, clouds: false, parts: 110, amb: 0, lite: true }, // noodstand voor trage machines
  { px: 0.8e6,  bg: 0.45, bgEvery: 2, rays: false, clouds: false, parts: 220, amb: 25 },
  { px: 1.3e6,  bg: 0.5,  bgEvery: 2, rays: false, clouds: true,  parts: 400, amb: 45 },
  { px: 2.2e6,  bg: 0.55, bgEvery: 1, rays: true,  clouds: true,  parts: 650, amb: 70 },
  { px: 3.6e6,  bg: 0.6,  bgEvery: 1, rays: true,  clouds: true,  parts: 900, amb: 70 },
];
const QUALITY_NAMES = ['minimaal', 'laag', 'middel', 'hoog', 'maximaal'];
// Nieuwe sleutel: oude automatische standen (vaak onterecht op de laagste stand blijven hangen) vervallen.
// qAuto = het spel kiest zelf (standaard); anders heeft de speler in Instellingen een vaste stand gekozen.
const QKEY = 'andyApples.quality4';
let qLevel = 3, qMax = 4, qAuto = true;
try {
  const q = JSON.parse(localStorage.getItem(QKEY));
  // automatisch: begin nooit lager dan 'middel'; is dat te zwaar, dan schakelt het spel binnen een paar seconden terug
  if (q && q.l >= 0 && q.l <= 4) { qAuto = q.auto !== false; qLevel = qAuto ? Math.max(2, q.l) : q.l; }
} catch (e) { /* geen voorkeur */ }
let Q = QUALITY[qLevel];
// ---- Debug-instellingen (achter een wachtwoord): zoom, snelheid en FPS-meter ----
const DBG_KEY = 'andyApples.debug';
const DBG_HASH = '80dfac20'; // checksum van het wachtwoord (zie README)
const DBG = { zoom: 1, speed: 1, open: false, fps: false };
try { const d = JSON.parse(localStorage.getItem(DBG_KEY)); if (d) { DBG.zoom = clamp(+d.zoom || 1, 0.4, 2.5); DBG.speed = clamp(+d.speed || 1, 0.25, 2.5); DBG.open = !!d.open; DBG.fps = !!d.fps && DBG.open; } } catch (e) { /* geen instellingen */ }
const dbgPersist = () => { try { localStorage.setItem(DBG_KEY, JSON.stringify(DBG)); } catch (e) { /* negeren */ } };
let dpr = 1, pr = 1, cssW = 0, cssH = 0, baseScale = 1, scale = 1, viewW = 0, viewH = 0, zoomK = 0;
let bgFrame = 0, bgStale = true;
let bgCanvas = document.createElement('canvas');
let bgCtx = bgCanvas.getContext('2d', { alpha: false });
// ---- Draaiknop: een staande telefoon liggend gebruiken ----
// Eerst proberen we het echte scherm te draaien (volledig scherm + oriëntatie vastzetten, werkt op Android).
// Lukt dat niet (bijv. iPhone), dan draaien we de hele pagina zelf een kwartslag.
const IS_MOBILE = navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900;
// In de Android-app (WebView) is er een brug naar Android voor opslaan/kopiëren; de app staat al liggend en schermvullend
const IN_APP = /AndyApplesApp/.test(navigator.userAgent) && !!window.AndroidBridge;
const ROT_KEY = 'andyApples.rotate';
let rotPref = false, rotOn = false;
try { rotPref = localStorage.getItem(ROT_KEY) === '1'; } catch (e) { /* geen voorkeur */ }
function applyRot() {
  rotOn = rotPref && !IN_APP && window.innerHeight > window.innerWidth;
  const b = document.body;
  document.documentElement.classList.toggle('rot', rotOn);
  if (rotOn) { b.style.width = window.innerHeight + 'px'; b.style.height = window.innerWidth + 'px'; b.style.transform = `translateX(${window.innerWidth}px) rotate(90deg)`; }
  else { b.style.width = ''; b.style.height = ''; b.style.transform = ''; }
}
// schermcoördinaten -> coördinaten in het (eventueel gedraaide) spel
const toGame = (x, y) => rotOn ? [y, window.innerWidth - x] : [x, y];
const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
// ---- Volledig scherm: eigen, losse knop ----
async function toggleFullscreen() {
  try {
    const el = document.documentElement;
    if (isFullscreen()) { if (document.exitFullscreen) await document.exitFullscreen(); else if (document.webkitExitFullscreen) await document.webkitExitFullscreen(); }
    else if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch (e) { /* niet ondersteund of geweigerd */ }
  resize();
  setTimeout(resize, 350);
}
// ---- Draaien: eigen, losse knop. Voor het echt vastzetten van de oriëntatie is op de meeste
// browsers volledig scherm nodig, dus die proberen we hier zelf ook (zonder de fullscreen-knop te wijzigen) ----
async function toggleRotate() {
  rotPref = !rotPref;
  try { localStorage.setItem(ROT_KEY, rotPref ? '1' : '0'); } catch (e) { /* negeren */ }
  if (rotPref) {
    try {
      if (!isFullscreen()) await toggleFullscreen();
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (e) { /* niet ondersteund: dan draaien we de pagina zelf (CSS-fallback) */ }
  } else {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* */ }
  }
  resize();
  setTimeout(resize, 350); // sommige telefoons melden de nieuwe maten iets later
}
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  applyRot();
  cssW = rotOn ? window.innerHeight : window.innerWidth; cssH = rotOn ? window.innerWidth : window.innerHeight;
  const hc = document.documentElement.classList;
  hc.toggle('narrow', cssW <= 720 || cssW <= cssH); hc.toggle('slim', cssW <= 720); hc.toggle('short', cssH < 520);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  let vw = cssW, vh = cssH;
  if (LOCAL.on && !LOCAL.ai) { // naast elkaar op een breed scherm, boven elkaar op een smal/staand scherm
    LOCAL.split = cssW >= cssH * 1.1 ? 'v' : 'h';
    if (LOCAL.split === 'v') vw = (cssW - 4) / 2; else vh = (cssH - 4) / 2;
  }
  LOCAL.vw = vw; LOCAL.vh = vh;
  baseScale = Math.min(vh / 740, vw / 500);
  // standaard-zoom (los van de snelheidsafhankelijke zoom hieronder), plus de debug-zoom
  baseScale *= DBG.zoom / BASE_ZOOM_OUT;
  // telefoons/tablets: iets verder uitgezoomd voor meer overzicht
  if (IS_MOBILE) baseScale *= vw < vh ? 0.76 : 0.86;
  applyQuality();
  gradCache.clear();
  applyZoom();
}
// Resolutie en buffers voor het huidige kwaliteitsniveau. Los van resize(), zodat een kwaliteitswissel
// alleen de canvasgroottes aanpast (de gebufferde achtergrondtegels blijven bruikbaar en worden
// geleidelijk op de nieuwe resolutie opnieuw getekend, zie tileLayer in render-bg.js).
function applyQuality() {
  Q = QUALITY[qLevel];
  pr = Math.min(dpr, Math.sqrt(Q.px / (cssW * cssH)));
  const w = Math.round(cssW * pr), h = Math.round(cssH * pr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const vw = LOCAL.vw || cssW, vh = LOCAL.vh || cssH;
  RW = Math.round(vw * pr); RH = Math.round(vh * pr);
  const bw = Math.max(2, Math.round(vw * pr * Q.bg)), bh = Math.max(2, Math.round(vh * pr * Q.bg));
  if (bgCanvas.width !== bw || bgCanvas.height !== bh) { bgCanvas.width = bw; bgCanvas.height = bh; }
  bgStale = true;
}
const BASE_ZOOM_OUT = 1.25; // standaard-zoomniveau (was 1,5: het beeld staat nu 20% verder ingezoomd)
// Hoe sneller Andy gaat, hoe verder uitgezoomd (meer overzicht bij hoge snelheid).
// De zoom volgt NIET de directe snelheid (die schommelt bij elke zwaai sterk), maar de gemiddelde
// voorwaartse snelheid over ruim een seconde, en beweegt daar dan ook nog rustig naartoe.
// bij zoomK=1 is er 35% meer wereld te zien; helemaal uitgezoomd pas op topsnelheid (meer uitzoomen = trager ogen)
const ZOOM_LO = 450, ZOOM_HI = 1550, ZOOM_OUT = 0.35;
function updateZoom(dt) {
  let target = 0;
  if (G && G.state !== 'dead') {
    G.spdAvg = (G.spdAvg || 0) + (Math.max(0, G.vx) - (G.spdAvg || 0)) * Math.min(1, dt * 0.8);
    const k = clamp((G.spdAvg - ZOOM_LO) / (ZOOM_HI - ZOOM_LO), 0, 1);
    target = k * k * (3 - 2 * k); // zacht begin en einde
  }
  zoomK += (target - zoomK) * Math.min(1, dt * 0.7);
  applyZoom();
}
function applyZoom() {
  scale = baseScale / (1 + zoomK * ZOOM_OUT);
  const vw = LOCAL.vw || cssW, vh = LOCAL.vh || cssH;
  viewW = vw / scale; viewH = vh / scale;
}
// De achtergrond (lucht, bergen, bos, reuzenstammen, voorgrond) wordt altijd op de vaste basiszoom
// getekend: die lagen worden gebufferd, en een zoom die elk beeld een beetje verandert zou die
// buffers anders elk beeld opnieuw laten opbouwen (traag en schokkerig). Alleen de speelwereld zoomt.
function withBaseView(fn) {
  const s0 = scale, w0 = viewW, h0 = viewH, cx = camX, cy = camY;
  const vw = LOCAL.vw || cssW, vh = LOCAL.vh || cssH;
  scale = baseScale; viewW = vw / scale; viewH = vh / scale;
  camX = cx + (w0 - viewW) * 0.5;                       // zelfde midden
  camY = HAZARD_Y - (HAZARD_Y - cy) * s0 / scale;        // waterlijn op precies dezelfde hoogte in beeld
  try { fn(); } finally { scale = s0; viewW = w0; viewH = h0; camX = cx; camY = cy; }
}
function setQuality(l) {
  qLevel = clamp(l, 0, 4);
  try { localStorage.setItem(QKEY, JSON.stringify({ l: qLevel, auto: qAuto })); } catch (e) { /* negeren */ }
  applyQuality();
}
// Instellingen: automatisch -> minimaal -> laag -> middel -> hoog -> maximaal -> automatisch
function cycleQuality() {
  if (qAuto) { qAuto = false; setQuality(0); }
  else if (qLevel < 4) setQuality(qLevel + 1);
  else { qAuto = true; qMax = 4; setQuality(3); }
}
const gradCache = new Map();
function cachedGrad(key, make) { let g = gradCache.get(key); if (!g) { g = make(); gradCache.set(key, g); if (gradCache.size > 300) gradCache.clear(); } return g; }
// Bij het opstarten (vanuit main.js): meeschalen met het venster
function viewInit() {
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.documentElement.classList.toggle('touch', navigator.maxTouchPoints > 0 || (window.matchMedia && matchMedia('(pointer: coarse)').matches));
  resize();
}
// bovenkant van het beeld in rust; op hoge (staande) schermen gaat een deel van de extra ruimte naar het water
// (alleen op echt staande schermen; niet omdat het beeld door het uitzoomen hoger wordt)
// (btOverride: tijdens het tekenen van een achtergrondtegel staat viewW/viewH tijdelijk op de tegelmaat; dan geldt de echte waarde)
let btOverride = null;
const baseTop = () => btOverride !== null ? btOverride : WORLD_H + 20 - viewH + Math.max(0, viewH - Math.max(760, viewW * 0.62)) * 0.4;
