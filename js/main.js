'use strict';
// Andy Apples · hoofdlus en opstarten
// Laadt als laatste: de hoofdlus, haken voor de Android-app en tests, en het opstarten.

// =====================================================================
//  Hoofdlus
// =====================================================================
let last = performance.now(), acc = 0;
// Hooguit zoveel physics-stappen per beeld. Na een traag beeld liever heel even iets trager spelen dan
// een inhaalslag die het volgende beeld óók traag maakt (en zo verder: een haperende spiraal).
const MAX_STEPS = 6;
// ---- Automatische kwaliteit: te traag -> eerst effecten/resolutie omlaag (en onthouden voor de volgende keer) ----
// Een beeld is 'traag' boven SLOW_MS (onder ~45 fps), los van de verversingssnelheid van het scherm.
// Per venster van 2 s telt het aandeel trage beelden: losse haperingen en de schommelende beeldtijden van
// sommige browsers (Firefox) laten de kwaliteit dus niet zakken. Een niveau dat te zwaar bleek, wordt deze
// sessie niet opnieuw geprobeerd (qMax): zo schakelt het spel niet steeds heen en weer.
const SLOW_MS = 22;
const perf = { win: 0, n: 0, slow: 0, cool: 3, good: 0 };
// na een tabwissel, focuswissel of pauze haperen de eerste beelden: die tellen niet mee
function perfSettle() { perf.cool = Math.max(perf.cool, 2.5); perf.win = perf.n = perf.slow = 0; perf.good = 0; }
function adaptQuality(dtMs) {
  if (!qAuto) return;
  if (document.hidden || game.paused || curScreen) { perf.cool = Math.max(perf.cool, 1); return; }
  if (dtMs > 250) return; // echte hapering (bijv. tabwissel): niet meetellen
  perf.cool -= dtMs / 1000;
  if (perf.cool > 0) return;
  perf.win += dtMs; perf.n++; if (dtMs > SLOW_MS) perf.slow++;
  if (perf.win < 2000) return;
  const frac = perf.slow / perf.n;
  perf.win = perf.n = perf.slow = 0;
  if (frac > 0.3 && qLevel > 0) {
    qMax = qLevel - 1; setQuality(qLevel - 1); perf.cool = 1.5; perf.good = 0;
    if (qLevel === 0) gpuWarn(true); // helemaal terug naar 'minimaal': het beeld is aantoonbaar te traag
  }
  else if (frac < 0.03) { if (++perf.good >= 4 && qLevel < qMax) { setQuality(qLevel + 1); perf.good = 0; perf.cool = 2; } } // 8 s soepel: een stap omhoog
  else perf.good = 0;
}
window.addEventListener('focus', perfSettle);
document.addEventListener('visibilitychange', perfSettle);
// ---- FPS-meter (debug) ----
const stats = { dts: new Float32Array(120), i: 0, steps: 0, work: 0, t: 0, tiles: 0, txt: [] };
function drawPerf(now) {
  if (now - stats.t > 500) {
    const s = Array.from(stats.dts).filter(v => v > 0).sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / (s.length || 1), p95 = s.length ? s[Math.floor(s.length * 0.95)] : 0;
    stats.txt = [`${Math.round(1000 / avg)} fps · p95 ${p95.toFixed(1)} ms`,
      `rekenwerk ${stats.work.toFixed(1)} ms · stappen ${stats.steps}`,
      `kwaliteit ${QUALITY_NAMES[qLevel]}${qAuto ? ' (auto)' : ''} · ${canvas.width}×${canvas.height}`,
      `tegels ${((tileBuilds - stats.tiles) * 1000 / Math.max(1, now - stats.t)).toFixed(1)}/s (${tileBuilds})`];
    stats.tiles = tileBuilds; stats.t = now;
  }
  const c = mainCtx, y0 = cssH - 96;
  c.setTransform(pr, 0, 0, pr, 0, 0); c.globalAlpha = 1;
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(8, y0, 270, 84);
  c.font = '13px monospace'; c.fillStyle = '#9f9'; c.textAlign = 'left'; c.textBaseline = 'top';
  for (let i = 0; i < stats.txt.length; i++) c.fillText(stats.txt[i], 14, y0 + 6 + i * 19);
}
function frame(now) {
  const t0 = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  adaptQuality(dt * 1000);
  if (dt < 0.25) stats.dts[stats.i++ % stats.dts.length] = dt * 1000;
  if (dt > 0.1) dt = 0.1;
  if (LOCAL.on) localLoop(dt);
  else frameSolo(dt);
  const t1 = performance.now();
  stats.work += (t1 - t0 - stats.work) * 0.1;
  if (DBG.fps && DBG.open) drawPerf(t1);
  requestAnimationFrame(frame);
}
function frameSolo(dt) {
  if (!game.paused) {
    if (run && run.cine && (run.cine.t += dt) > CINE_DUR) run.cine = null; // filmische biome-overgang (echte tijd)
    const ts = timeScale();
    acc += dt * ts;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) { step(DT); acc -= STEP; steps++; }
    stats.steps = steps;
    if (acc > STEP) acc = 0;
    renderAlpha = acc / STEP;
    const gdt = dt * GAME_SPEED * ts;
    mpFrame(dt, gdt);
    updateEffects(gdt);
    const oy = camY;
    interpBegin(true); updateCamera(gdt); interpEnd(); // camera volgt de getekende (geïnterpoleerde) Andy
    updateZoom(gdt);
    genUntil(camX + viewW + 900);
    const P = paletteAt((camX + viewW * 0.5 - START_X) / PX_PER_M);
    { const dx = camX - lastCamX, dy = camY - oy; withBaseView(() => updateAmbient(gdt, P.t < 0.5 ? P.a.particle : P.b.particle, dx, dy)); }
    updateLife(gdt, P);
    lastCamX = camX;
    updateHud();
  }
  render();
}

// Android-app: terugknop (true = afgehandeld; false = app mag naar de achtergrond) en resultaat van opslaan
window.__andyBack = () => {
  if (curScreen === 'menu') return false;
  if (curScreen === 'over' || curScreen === 'done') { toMenu(); return true; }
  if (curScreen === 'mpRes') { $('btnMpLobby').click(); return true; }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  return true;
};

// Debug-/testhaak (handig voor automatische tests)
window.__andy = { get G() { return G; }, get run() { return run; }, get game() { return game; }, get save() { return save; },
  get vines() { return vines; }, get apples() { return apples; }, get foes() { return foes; }, get quality() { return qLevel; }, get tramps() { return tramps; }, get portalsList() { return portals; }, get spaceObjs() { return spaceObjs; }, get loot() { return loot; }, openCrate, get crate() { return CRATE; }, buyHeadStart, attach, release, AIR_G, MAX_FALL, DT, Sfx, Music, press, unpress, startReady,
  MP, get ghostPin() { return ghostPin; }, mpStartMatch, localStart, get LOCAL() { return LOCAL; }, localPress, localUnpress, useWorld, mpHost, mpConnect, mpMakeAnswer, mpJoinStart, mpHostStart, mpSelect, mpAgain, mpForfeit, openMp, mpRender, get curScreen() { return curScreen; },
  get scale() { return scale; }, get viewW() { return viewW; }, get viewH() { return viewH; }, get zoomK() { return zoomK; }, get rotPref() { return rotPref; }, get texts() { return texts; }, resize, toggleFullscreen, toggleRotate,
  get perf() { return { quality: qLevel, auto: qAuto, steps: stats.steps, work: stats.work, tiles: tileBuilds }; }, setQuality, setQualityChoice };

// Opstarten. Alle bestanden zijn nu geladen: pas hier wordt de pagina bedraad (volgorde = volgorde van de listeners).
viewInit();
mpInit();
lbInit();
accountInit();
uiInit();
inputInit();
resetWorld();
refreshMenu();
showScreen('menu');
if (softwareRender()) gpuWarn(false);
// uitnodigingslink (…#join=lobby-id): meteen naar multiplayer en verbinden
function checkJoinLink() {
  const m = /[#&]join=([^&]+)/.exec(location.hash);
  if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  openMp(); MP.local = false; mpLobbyJoin(decodeURIComponent(m[1]).toLowerCase(), '');
}
window.addEventListener('hashchange', checkJoinLink);
checkJoinLink();
if (lbOn()) lbSubmit().catch(() => { /* offline */ });
try { if (sbOn() && (localStorage.getItem('andyApples.auth') || /access_token|code=/.test(location.hash + location.search))) accEnsure().catch(() => { /* offline */ }); } catch (e) { /* */ }
requestAnimationFrame(frame);
