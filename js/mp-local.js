'use strict';
// Andy Apples · lokale multiplayer
// Twee spelers op één scherm, en Kiwi de AI-tegenstander.

// =====================================================================
//  Op één scherm: twee spelers in één venster (split-screen)
//  Elke speler krijgt een eigen kopie van de wereld (dezelfde seed). Per beeld wordt de
//  wereldstatus van speler 1 en 2 om de beurt "ingeladen", gesimuleerd en getekend.
// =====================================================================
let curW = -1;
// welke variabelen bij een wereld horen: zie WORLD_VARS in world.js
function grabWorld() {
  const w = {};
  for (const k in WORLD_VARS) w[k] = WORLD_VARS[k][0]();
  return w;
}
function putWorld(w) {
  for (const k in WORLD_VARS) WORLD_VARS[k][1](w[k]);
  applyZoom();
}
function useWorld(i) {
  if (curW === i) return;
  if (curW >= 0) LOCAL.worlds[curW] = grabWorld();
  putWorld(LOCAL.worlds[i]);
  curW = i;
}
function freshWorld(i, cfg, seed) {
  const w = {};
  for (const k in WORLD_VARS) w[k] = WORLD_VARS[k][2]();
  w.mp = { local: true, idx: i, mode: cfg.mode, len: cfg.mode === 'race' ? cfg.len : 0, seed, t: 0, myEv: null, falls: 0, result: null,
    stormX: START_X - 1100, bolt: 0, boltX: 0, oppEv: null, oppT: 0 };
  return w;
}
function localStart(cfg, aiLvl) {
  const mode = cfg.mode === 'endurance' ? 'endurance' : 'race';
  const ai = aiLvl != null && aiLvl >= 0 ? { lvl: clamp(aiLvl | 0, 0, AI_LV.length - 1) } : null;
  if (LOCAL.on && !!LOCAL.ai !== !!ai) LOCAL.score = [0, 0];
  LOCAL.ai = ai;
  LOCAL.cfg = { mode, len: [500, 1000, 2000].includes(cfg.len) ? cfg.len : 1000 };
  if (!LOCAL.on) { LOCAL.base = grabWorld(); LOCAL.on = true; LOCAL.score = [0, 0]; }
  curW = -1;
  resize();
  const seed = 1 + ((Math.random() * 2147483000) | 0);
  LOCAL.worlds = [0, 1].map(i => freshWorld(i, LOCAL.cfg, seed));
  LOCAL.result = null; LOCAL.count = 3.5; LOCAL.lastCount = 99;
  game.paused = false; game.career = null;
  for (const i of [0, 1]) { useWorld(i); resetWorld(); }
  game.mode = 'mpcount';
  localPointers.clear();
  Music.duck();
  showScreen(null);
  $('hud').classList.add('local');
  $('mpHud').classList.add('hidden');
  showBanner(mode === 'race' ? `Race · ${LOCAL.cfg.len} m` : 'Endurance', mode === 'race' ? 'Eerst bij de finish wint' : 'Blijf de storm voor');
}
function localExit() {
  if (!LOCAL.on) return;
  putWorld(LOCAL.base);
  curW = -1; LOCAL.on = false; LOCAL.worlds = null; LOCAL.base = null; LOCAL.ai = null;
  game.mp = null;
  localPointers.clear();
  $('hud').classList.remove('local');
  $('mpCount').textContent = '';
  resize();
}
// invoer: elke speler zijn eigen knop / schermhelft
const localPointers = new Map();
function localPress(p) { const c = curW; useWorld(p); press(); if (c >= 0) useWorld(c); }
function localUnpress(p) { const c = curW; useWorld(p); unpress(); if (c >= 0) useWorld(c); }
function localKey(code) { if (LOCAL.ai) return code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'Enter' || code === 'NumpadEnter' ? 0 : -1; return code === 'Space' || code === 'KeyA' || code === 'KeyW' ? 0 : (code === 'ArrowUp' || code === 'ArrowDown' || code === 'Enter' || code === 'NumpadEnter' || code === 'KeyL') ? 1 : -1; }
const localSide = (x, y) => LOCAL.ai ? 0 : (LOCAL.split === 'v' ? x > cssW / 2 : y > cssH / 2) ? 1 : 0;

// wordt elk beeld aangeroepen in plaats van de gewone lus
function localLoop(dt) {
  const ts = timeScale(), gdt = dt * GAME_SPEED * ts;
  if (!game.paused) {
    if (game.mode === 'mpcount') {
      LOCAL.count -= dt;
      const c = Math.ceil(LOCAL.count - 0.5);
      if (c !== LOCAL.lastCount) {
        LOCAL.lastCount = c;
        const el = $('mpCount');
        el.textContent = c > 0 ? c : 'GO!';
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        if (c > 0) Sfx.tone(520, 0.15, 'square', 0.07); else Sfx.tone(1040, 0.35, 'square', 0.08);
        if (c <= 0) { game.mode = 'playing'; setTimeout(() => { if ($('mpCount').textContent === 'GO!') $('mpCount').textContent = ''; }, 800); }
      }
    }
    acc += dt * ts;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { n++; acc -= STEP; }
    stats.steps = n;
    if (acc > STEP) acc = 0;
    renderAlpha = acc / STEP;
    for (const i of [0, 1]) {
      useWorld(i);
      for (let k = 0; k < n; k++) { if (LOCAL.ai && i === 1) aiThink(); step(DT); }
      updateEffects(gdt);
      const oy = camY;
      interpBegin(true); updateCamera(gdt); interpEnd();
      updateZoom(gdt);
      genUntil(camX + viewW + 900);
      const P = paletteAt((camX + viewW * 0.5 - START_X) / PX_PER_M);
      { const dx = camX - lastCamX, dy = camY - oy; withBaseView(() => updateAmbient(gdt, P.t < 0.5 ? P.a.particle : P.b.particle, dx, dy)); }
      updateLife(gdt, P);
      lastCamX = camX;
      localPin(i);
    }
    localCheck();
    updateHud();
  }
  // tekenen: eerst een donkere scheidingslijn, dan beide beelden
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  mainCtx.fillStyle = '#10261a'; mainCtx.fillRect(0, 0, canvas.width, canvas.height);
  for (const i of LOCAL.ai ? [0] : [0, 1]) { // tegen Kiwi: alleen jouw beeld, schermvullend
    useWorld(i);
    VOX = i && LOCAL.split === 'v' ? canvas.width - RW : 0;
    VOY = i && LOCAL.split === 'h' ? canvas.height - RH : 0;
    render();
  }
  VOX = VOY = 0;
}
// =====================================================================
//  Kiwi: de AI-tegenstander (speelt in zijn eigen wereld met dezelfde seed)
// =====================================================================
// Kiwi "drukt" net als een speler: vasthouden aan een liaan, loslaten om te springen, en in de lucht
// ingedrukt houden om een liaan te grijpen. Om te beslissen wanneer hij loslaat, rekent hij vooruit waar
// hij terecht zou komen als hij nú loslaat, en springt hij op het moment dat dat het verst oplevert.
function aiSet(down) { if (down && !input.down) press(); else if (!down && input.down) unpress(); }
// waar komt Kiwi uit als hij nu loslaat? (vooruitgerekende vlucht; 0 = nergens te grijpen)
function aiScore(L) {
  const m = launchM(0);
  let vx = G.vx * m + (G.vx > 0 ? 60 : 0), vy = G.vy * m - 50, x = G.x, y = G.y;
  const R = gripR(0) * L.grab, R2 = R * R, h = 1 / 30;
  const cand = vines.filter(v => v !== G.vine && v.anchored && v.x > G.x + 40 && v.x < G.x + 1700);
  if (!cand.length) return 0;
  for (let i = 0; i < 80; i++) {
    vy = Math.min(vy + AIR_G * h, MAX_FALL); vx += 55 * h; x += vx * h; y += vy * h;
    if (y > HAZARD_Y - 40) return 0;
    for (const v of cand) {
      if (Math.abs(v.rest[0] - x) > 520) continue;
      const p = v.pts;
      for (let j = 3; j < p.length; j += 2) { const dx = p[j].x - x, dy = p[j].y - y; if (dx * dx + dy * dy < R2) return Math.max(1, x - G.x + (j / p.length) * 60); }
    }
  }
  return 0;
}
function aiThink() {
  const A = LOCAL.ai, L = AI_LV[A.lvl];
  if (!G || game.mode !== 'playing' || G.state === 'dead') { A.relAt = 0; if (input.down && game.mode === 'playing') aiSet(false); return; }
  A.t = (A.t || 0) + DT;
  if (G.state === 'stand') { aiSet(!input.down); return; }  // springen van de rots
  if (G.state === 'rocket') return;
  if (G.state === 'hang') {
    A.air = 0;
    if (!input.down) { if (A.t - (A.lastRel || 0) > 0.05) aiSet(true); return; }
    if (A.relAt) { if (A.t >= A.relAt) { A.relAt = 0; A.lastRel = A.t; aiSet(false); } return; }
    const fwd = G.vx > 60;
    if (!fwd) { A.prev = 0; A.swing = 0; return; }
    if (!A.swing) { // begin van een voorwaartse zwaai
      A.swing = 1; A.prev = 0;
      if (Math.random() < L.oops) { A.relAt = A.t + rand(0.05, 0.25); return; } // foutje: te vroeg los
    }
    if ((A.k = (A.k || 0) + 1) % 3) return;
    const sc = aiScore(L), sp = Math.hypot(G.vx, G.vy);
    // voorbij het beste moment van deze zwaai: loslaten (met een beetje vertraging, afhankelijk van het niveau)
    if (A.prev > 0 && sc < A.prev * 0.97) {
      // goede spelers bouwen eerst meer vaart op als de sprong kort is
      const short = A.prev < 420 && sp < swingCap() * 0.85 && Math.random() < L.patience;
      if (!short) A.relAt = A.t + L.react * 0.5 + rand(L.late[0], L.late[1]);
      A.prev = 0;
      return;
    }
    // niets binnen bereik, maar wel volle vaart: dan maar blind een mooie sprong (rond 40°)
    if (!sc && !A.prev && sp > swingCap() * 0.9 && G.vy < 0 && Math.abs(G.vy) > G.vx * 0.7) A.relAt = A.t + rand(L.late[0], L.late[1]);
    if (sc > 0) A.prev = Math.max(A.prev, sc);
    return;
  }
  // in de lucht: ingedrukt houden zodra er een liaan binnen grijpbereik komt (na zijn reactietijd)
  A.air = (A.air || 0) + DT;
  const R = gripR(0) + 30;
  let near = false;
  for (const v of vines) {
    if (!v.anchored || Math.abs(v.x - G.x) > 650 || (v === G.lastVine && G.releaseT > 0)) continue;
    const p = v.pts;
    for (let j = 2; j < p.length && !near; j += 2) { const dx = p[j].x - G.x, dy = p[j].y - G.y; near = dx * dx + dy * dy < R * R; }
    if (near) break;
  }
  if (near) { A.nearT = (A.nearT || 0) + DT; if (A.nearT >= L.react) aiSet(true); }
  else { A.nearT = 0; if (A.air > 0.15) aiSet(false); }
}

// hangt de andere speler aan een liaan, dan buigt die liaan in jouw wereld ook mee
function localPin(i) {
  const o = LOCAL.worlds[1 - i].G;
  ghostPin.v = null;
  if (!o || o.state !== 'hang' || !o.vine) return;
  const v = vines.find(w => w.id === o.vine.id);
  if (!v || v === G.vine || !v.anchored || o.k >= v.pts.length) return;
  const an = v.pts[0], reach = o.k * SEG_LEN * (v.type === 'elastic' ? ELASTIC_STRETCH : 1) + 60;
  if (Math.hypot(o.hx - an.x, o.hy - an.y) < reach) { ghostPin.v = v; ghostPin.k = o.k; ghostPin.x = o.hx; ghostPin.y = o.hy; }
}
// beide klokken lopen precies gelijk, dus de uitslag is meteen duidelijk
function localCheck() {
  if (LOCAL.result !== null || game.mode !== 'playing') return;
  const A = LOCAL.worlds[0].mp, B = LOCAL.worlds[1].mp, a = A.myEv, b = B.myEv;
  if (!a && !b) return;
  let w;
  if (A.mode === 'race') w = a && b ? (a.t < b.t ? 0 : b.t < a.t ? 1 : -1) : a ? 0 : 1;
  else w = a && b ? (a.t > b.t ? 0 : b.t > a.t ? 1 : -1) : a ? 1 : 0;
  localEnd(w);
}
function localEnd(w) {
  LOCAL.result = w;
  game.mode = 'mpend';
  const M = LOCAL.worlds[0].mp;
  M.endT = M.t;
  if (w >= 0) LOCAL.score[w]++;
  const race = M.mode === 'race';
  const nm = localName(w), jij = LOCAL.ai && w === 0;
  const why = w < 0 ? (race ? 'Tegelijk over de finish!' : 'Tegelijk gevallen!') : race ? `${nm} ${jij ? 'was' : 'was'} als eerste bij de finish.` : `${nm} hield het langst vol.`;
  LOCAL.why = why;
  showBanner(w < 0 ? 'Gelijkspel!' : jij ? 'Gewonnen!' : `${nm} wint!`, why);
  Sfx.jingle(2);
  const c = curW;
  if (w >= 0) { useWorld(w); confetti(G.x + 60, G.y - 160, 140); flashT = 0.3; }
  if (c >= 0) useWorld(c);
  const worlds = LOCAL.worlds;
  setTimeout(() => { if (LOCAL.on && LOCAL.worlds === worlds) localShowResult(); }, 2200);
}
function localShowResult() {
  const w = LOCAL.result, race = LOCAL.cfg.mode === 'race';
  $('mpCount').textContent = '';
  $('mpResTitle').textContent = w < 0 ? 'Gelijkspel!' : LOCAL.ai && w === 0 ? 'Gewonnen!' : `${localName(w)} wint!`;
  $('mpResSub').textContent = LOCAL.why + (LOCAL.ai ? ` (Kiwi: ${AI_LV[LOCAL.ai.lvl].name.toLowerCase()})` : '');
  const P = [0, 1].map(i => { const W = i === curW ? grabWorld() : LOCAL.worlds[i]; return { M: W.mp, run: W.run }; });
  const row = (label, a, b) => `<div><span style="flex:1">${label}</span><b style="color:#e8322b;min-width:80px;text-align:right">${a}</b><b style="color:#2f7fe0;min-width:90px;text-align:right">${b}</b></div>`;
  const fmt = t => t == null ? '—' : fmtTime(t);
  let h = row('', localName(0), localName(1));
  const d = p => Math.floor(race ? Math.min(p.M.len, p.run.dist) : p.run.dist) + ' m';
  if (race) {
    h += row('Finishtijd', fmt(P[0].M.myEv && P[0].M.myEv.t), fmt(P[1].M.myEv && P[1].M.myEv.t));
    h += row('📏 Afstand', d(P[0]), d(P[1]));
    h += row('Gevallen', P[0].M.falls + '×', P[1].M.falls + '×');
  } else {
    h += row('Volgehouden', fmt(P[0].M.myEv ? P[0].M.myEv.t : P[0].M.t), fmt(P[1].M.myEv ? P[1].M.myEv.t : P[1].M.t));
    h += row('📏 Afstand', d(P[0]), d(P[1]));
  }
  h += row('Appels', Math.max(0, Math.floor(P[0].run.earned)), Math.max(0, Math.floor(P[1].run.earned)));
  $('mpResTable').innerHTML = h;
  $('mpResScore').textContent = `Stand: ${localName(0)} ${LOCAL.score[0]} – ${LOCAL.score[1]} ${localName(1)}`;
  mpAgainRender();
  showScreen('mpRes');
}
// kleine HUD in elk beeld (in beeldcoördinaten)
function drawLocalHud() {
  const M = game.mp;
  if (!M || !M.local) return;
  const S = scale * pr, u = 1 / scale; // u = één CSS-pixel
  ctx.setTransform(S, 0, 0, S, VOX, VOY);
  const blue = M.idx === 1, col = blue ? '#2f7fe0' : '#e8322b';
  const dist = M.mode === 'race' ? `${Math.min(M.len, Math.floor(run.dist))} / ${M.len} m` : `${Math.floor(run.dist)} m`;
  const t = fmtTime(M.result ? M.endT : (LOCAL.result !== null ? LOCAL.worlds[0].mp.endT : M.t)).slice(0, -1);
  let extra = '⏱ ' + t;
  if (M.mode === 'endurance') extra += G.state === 'dead' ? ' · af' : ` · 🌩️ ${Math.max(0, Math.floor((G.x - M.stormX) / PX_PER_M))} m`;
  ctx.font = `900 ${18 * u}px Trebuchet MS, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const label = localName(M.idx), lw = ctx.measureText(label).width;
  const pill = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + h / 2, y); ctx.arcTo(x + w, y, x + w, y + h, h / 2); ctx.arcTo(x + w, y + h, x, y + h, h / 2); ctx.arcTo(x, y + h, x, y, h / 2); ctx.arcTo(x, y, x + w, y, h / 2); ctx.fill(); };
  const x0 = 12 * u, y0 = 12 * u, h = 30 * u;
  pill(x0, y0, lw + 22 * u, h, col);
  ctx.fillStyle = '#fff'; ctx.fillText(label, x0 + 11 * u, y0 + h / 2 + 1 * u);
  ctx.font = `900 ${20 * u}px Trebuchet MS, sans-serif`;
  const dw = ctx.measureText(dist).width, dx = x0 + lw + 30 * u;
  pill(dx, y0, dw + 22 * u, h, 'rgba(0,0,0,.4)');
  ctx.fillStyle = '#fff'; ctx.fillText(dist, dx + 11 * u, y0 + h / 2 + 1 * u);
  ctx.font = `800 ${15 * u}px Trebuchet MS, sans-serif`;
  const ew = ctx.measureText(extra).width;
  pill(x0, y0 + h + 6 * u, ew + 20 * u, 24 * u, 'rgba(0,0,0,.4)');
  ctx.fillStyle = '#fff'; ctx.fillText(extra, x0 + 10 * u, y0 + h + 18 * u);
  // groot bericht als deze speler klaar is
  const big = M.mode === 'race' && M.myEv ? 'FINISH!' : M.mode === 'endurance' && M.myEv ? 'AF!' : '';
  if (big) {
    ctx.font = `900 ${56 * u}px Trebuchet MS, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 8 * u; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(big, viewW / 2, viewH * 0.4);
    ctx.fillStyle = M.mode === 'race' ? '#ffe46b' : '#ffffff'; ctx.fillText(big, viewW / 2, viewH * 0.4);
  }
}
