'use strict';
// Andy Apples · hoofdlus en opstarten
// Laadt als laatste: de hoofdlus, haken voor de Android-app en tests, en het opstarten.

// =====================================================================
//  Hoofdlus
// =====================================================================
let last = performance.now(), acc = 0;
// automatische kwaliteit: te traag -> resolutie en effecten omlaag (en onthouden voor de volgende keer)
const perf = { ema: 16.7, t: 0, cool: 3, good: 0, slow: 0 };
// na een tabwissel, focuswissel of pauze haperen de eerste beelden: die tellen niet mee
function perfSettle() { perf.cool = Math.max(perf.cool, 2.5); perf.ema = 16.7; perf.slow = 0; }
function adaptQuality(dtMs) {
  if (document.hidden || game.paused || curScreen) { perf.cool = Math.max(perf.cool, 1); return; }
  if (dtMs > 250) return; // echte hapering (bijv. tabwissel): niet meetellen
  dtMs = Math.min(dtMs, 120); // trage beelden tellen WEL mee, anders schakelt een trage machine nooit terug
  perf.ema += (dtMs - perf.ema) * 0.07;
  perf.slow += ((dtMs > 19 ? 1 : 0) - perf.slow) * 0.05; // aandeel trage beelden: losse haperingen tellen nauwelijks
  perf.t += dtMs / 1000; perf.cool -= dtMs / 1000;
  // 'soepel' = nauwelijks trage beelden (een losse hapering reset de teller niet)
  perf.good = perf.slow < 0.2 && perf.ema < 18.5 ? perf.good + dtMs / 1000 : 0;
  if (perf.cool > 0) return;
  // veel te traag: sneller terugschakelen
  if (perf.ema > 21 && perf.slow > 0.45 && qLevel > 0) { const slow = perf.ema > 32; qMax = qLevel; setQuality(qLevel - 1); perf.t = 0; perf.cool = slow ? 1 : 2.5; perf.ema = 16.7; perf.slow = 0; perf.good = 0; }
  // omhoog als het een tijd soepel loopt; na een eerdere terugval pas na langere tijd opnieuw proberen
  else if (qLevel < 4 && perf.good > (qLevel + 1 >= qMax ? 15 : 3)) { if (qLevel + 1 >= qMax) qMax = 4; setQuality(qLevel + 1); perf.good = 0; perf.cool = 3; }
}
window.addEventListener('focus', perfSettle);
document.addEventListener('visibilitychange', perfSettle);
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  adaptQuality(dt * 1000);
  if (dt > 0.1) dt = 0.1;
  if (LOCAL.on) { localLoop(dt); requestAnimationFrame(frame); return; }
  if (!game.paused) {
    const ts = timeScale();
    acc += dt * ts;
    let steps = 0;
    // hooguit 12 physics-stappen per beeld: liever even iets trager dan een haperende spiraal
    while (acc >= STEP && steps < 12) { step(DT); acc -= STEP; steps++; }
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
  requestAnimationFrame(frame);
}

// Android-app: terugknop (true = afgehandeld; false = app mag naar de achtergrond) en resultaat van opslaan
window.__andyBack = () => {
  if (curScreen === 'menu') return false;
  if (curScreen === 'over' || curScreen === 'done') { toMenu(); return true; }
  if (curScreen === 'mpRes') { $('btnMpLobby').click(); return true; }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  return true;
};
window.__andySaved = ok => saveMsg(ok ? 'Save-bestand opgeslagen.' : 'Opslaan geannuleerd.', ok);

// Debug-/testhaak (handig voor automatische tests)
window.__andy = { get G() { return G; }, get run() { return run; }, get game() { return game; }, get save() { return save; },
  get vines() { return vines; }, get apples() { return apples; }, get foes() { return foes; }, get quality() { return qLevel; }, get tramps() { return tramps; }, get portalsList() { return portals; }, attach, release, AIR_G, MAX_FALL, DT, Sfx, Music, press, unpress, startReady,
  MP, get ghostPin() { return ghostPin; }, mpStartMatch, localStart, get LOCAL() { return LOCAL; }, localPress, localUnpress, useWorld, mpHost, mpConnect, mpMakeAnswer, mpJoinStart, mpHostStart, mpSelect, mpAgain, mpForfeit, openMp, mpRender, get curScreen() { return curScreen; },
  get scale() { return scale; }, get viewW() { return viewW; }, get viewH() { return viewH; }, get zoomK() { return zoomK; }, get rotPref() { return rotPref; }, get texts() { return texts; }, resize, toggleFullscreen, toggleRotate };

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
