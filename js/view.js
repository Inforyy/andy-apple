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
// qAuto = het spel kiest zelf (standaard); anders heeft de speler in Instellingen een vaste stand gekozen.
// Sleutel 5: een automatische stand is pas bewaard sinds een stap omlaag wordt gecontroleerd (zie adaptQuality).
const QKEY = 'andyApples.quality5', QKEY_OLD = 'andyApples.quality4';
// eerste keer: op een telefoon/tablet beginnen op 'middel' (schermen zijn klein en scherp; auto gaat vanzelf omhoog als het kan)
let qLevel = navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900 ? 2 : 3, qMax = 4, qAuto = true;
try {
  let q = JSON.parse(localStorage.getItem(QKEY)), old = false;
  if (!q) { q = JSON.parse(localStorage.getItem(QKEY_OLD)); old = true; }
  // automatisch: beginnen op de bewaarde stand (een stap omlaag telt alleen als die echt hielp, dus die is betrouwbaar;
  // was hij toch te laag, dan gaat het spel in de eerste halve minuut snel omhoog). Een oude automatische stand kan
  // onterecht laag zijn (bijv. door een telefoon in energiebesparing): daarvan beginnen we op minstens 'middel'.
  if (q && q.l >= 0 && q.l <= 4) { qAuto = q.auto !== false; qLevel = qAuto && old ? Math.max(2, q.l) : q.l; }
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
// telefoons/tablets spelen standaard liggend (tot de speler in Instellingen 'Staand spelen' kiest)
let rotPref = IS_MOBILE, rotOn = false;
try { const r = localStorage.getItem(ROT_KEY); if (r !== null) rotPref = r === '1'; } catch (e) { /* geen voorkeur */ }
if (IN_APP && typeof AndroidBridge.isLandscape === 'function') rotPref = !!AndroidBridge.isLandscape(); // de app bewaart dit zelf
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
// in de Android-app regelt de app zelf volledig scherm en draaien (AndroidBridge.setFullscreen/setLandscape)
const appScreen = () => IN_APP && typeof AndroidBridge.setFullscreen === 'function';
function isFullscreen() { if (appScreen()) return !!AndroidBridge.isFullscreen(); return !!(document.fullscreenElement || document.webkitFullscreenElement); }
// ---- Volledig scherm: eigen, losse knop ----
async function toggleFullscreen() {
  if (appScreen()) { AndroidBridge.setFullscreen(!AndroidBridge.isFullscreen()); setTimeout(resize, 350); return; }
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
async function lockLandscape() {
  try {
    if (!isFullscreen()) await toggleFullscreen();
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (e) { /* niet ondersteund: dan draaien we de pagina zelf (CSS-fallback) */ }
}
async function toggleRotate() {
  rotPref = !rotPref;
  try { localStorage.setItem(ROT_KEY, rotPref ? '1' : '0'); } catch (e) { /* negeren */ }
  if (appScreen()) { AndroidBridge.setLandscape(rotPref); setTimeout(resize, 350); return; }
  if (rotPref) await lockLandscape();
  else {
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
  hc.toggle('narrow', cssW <= 720 || cssW <= cssH); hc.toggle('slim', cssW <= 720); hc.toggle('short', cssH < 640);
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
  // Liggend is de zoom op telefoons/tablets gelijk aan die op de pc (de hoogte van de wereld past precies,
  // net als op de pc). Alleen staand wordt het iets verder uitgezoomd, anders zie je te weinig vooruit.
  if (IS_MOBILE && vw < vh) baseScale *= 0.76;
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
// bij zoomK=1 is er 55% meer wereld te zien; helemaal uitgezoomd pas op topsnelheid (meer uitzoomen = trager ogen)
const ZOOM_LO = 420, ZOOM_HI = 1550, ZOOM_OUT = 0.55;
function updateZoom(dt) {
  let target = 0;
  if (G && G.state !== 'dead') {
    G.spdAvg = (G.spdAvg || 0) + (Math.max(0, G.vx) - (G.spdAvg || 0)) * Math.min(1, dt * 0.8);
    const k = clamp((G.spdAvg - ZOOM_LO) / (ZOOM_HI - ZOOM_LO), 0, 1);
    target = G.auto ? 1 : towerOn() ? 0.45 : brOn() ? Math.max(0.55, k * k * (3 - 2 * k)) : k * k * (3 - 2 * k); // zacht begin en einde; boven de afgrond helemaal uitgezoomd
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
// Schuifje in Instellingen: 0 = AI (automatisch) (kiest zelf uit alle 5 niveaus), 1 = laag, 2 = normaal, 3 = hoog
const QUALITY_CHOICES = [null, 1, 3, 4];
const qualityChoice = () => qAuto ? 0 : qLevel >= 4 ? 3 : qLevel >= 2 ? 2 : 1;
function setQualityChoice(i) {
  if (i === qualityChoice()) return;
  if (i === 0) { qAuto = true; qMax = 4; perf.capped = false; perf.check = null; setQuality(Math.max(2, qLevel)); }
  else { qAuto = false; setQuality(QUALITY_CHOICES[i]); }
}
// Tekent de browser zonder grafische kaart (software)? Browsers zeggen niet of canvas-tekenen versneld is,
// maar de WebGL-renderer verraadt het meestal: geen WebGL, of een software-renderer. (Dat het canvas toch
// traag is terwijl WebGL wel een GPU meldt, vangt adaptQuality in main.js op.)
function softwareRender() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
  } catch (e) { return false; }
}
const gradCache = new Map();
function cachedGrad(key, make) { let g = gradCache.get(key); if (!g) { g = make(); gradCache.set(key, g); if (gradCache.size > 300) gradCache.clear(); } return g; }
// Bij het opstarten (vanuit main.js): meeschalen met het venster
function viewInit() {
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  // Standaard liggend op een telefoon: bij de eerste tik (volledig scherm vraagt om een tik van de speler) het scherm
  // echt liggend vastzetten waar dat kan (Android). Anders (iPhone) draait het spel de pagina zelf, zie applyRot.
  if (IS_MOBILE && !IN_APP && screen.orientation && screen.orientation.lock) {
    const once = () => {
      window.removeEventListener('pointerup', once);
      if (rotPref && window.innerHeight > window.innerWidth) lockLandscape().then(() => { resize(); setTimeout(resize, 350); });
    };
    window.addEventListener('pointerup', once);
  }
  document.documentElement.classList.toggle('touch', navigator.maxTouchPoints > 0 || (window.matchMedia && matchMedia('(pointer: coarse)').matches));
  resize();
}
// bovenkant van het beeld in rust; op hoge (staande) schermen gaat een deel van de extra ruimte naar het water
// (alleen op echt staande schermen; niet omdat het beeld door het uitzoomen hoger wordt)
// (btOverride: tijdens het tekenen van een achtergrondtegel staat viewW/viewH tijdelijk op de tegelmaat; dan geldt de echte waarde)
let btOverride = null;
const baseTop = () => btOverride !== null ? btOverride : WORLD_H + 20 - viewH + Math.max(0, viewH - Math.max(760, viewW * 0.62)) * 0.4;
