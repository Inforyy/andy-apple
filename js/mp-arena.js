'use strict';
// Andy Apples · arena-modi (online multiplayer): Koning van de liaan, Overleven (waves) en Vlag veroveren
// Net als battle royale: een kleine arena met een eigen vaste set lianen, en je zwaait vrije kanten op (freeSwing).
//
// Netwerk: iedereen simuleert zijn eigen Andy. Gedeelde berichten zijn 'ar'-berichten (de host stuurt ze door):
//  - beuken: wie met genoeg vaart tegen een ander aan zwaait, stuurt 'bump' (wie, welke kant op, hoe hard);
//    de geraakte speler rekent het bij zichzelf uit (laat los en vliegt weg), net als een treffer bij BR.
//  - Koning en Vlag: de host is de baas. Spelers melden wat ze doen ('grab', 'let', 'take', 'cap', 'drop', 'ret'),
//    de host beslist en stuurt twee keer per seconde (en bij elke verandering) de stand ('st') naar iedereen.
//  - Overleven: de waves volgen uit de seed van het potje en de klok, dus iedereen simuleert dezelfde gevaren
//    zonder berichten. Wie geraakt wordt, meldt zelf dat hij af is ('ev', zoals bij endurance).

const ARENA = {
  king:  { x0: 700, x1: 3300 },
  waves: { x0: 500, x1: 2500 },
  ctf:   { x0: WALL_X, x1: 4290 },
};
const arenaMode = () => game.mp && ARENA[game.mp.mode] ? game.mp.mode : null;
// vrije zwaairichting (geen voorwaartse voorkeur): battle royale en de arena-modi
const freeSwing = () => !!(game.mp && (game.mp.mode === 'br' || ARENA[game.mp.mode]));
const AR_BUMP_SP = 620;       // zo hard moet je gaan om iemand te beuken
const AR_RESPAWN = 3;         // s na een val (Koning en Vlag)
const KING_WIN = 60, KING_TIME = 180;
const CTF_WIN = 3, CTF_TIME = 300, CTF_DROP = 8, CTF_CUT_CD = 6, CTF_REGROW = 5, CTF_PEELS = 2;
const CTF_COL = ['#2f7fe0', '#e8322b'], CTF_NAME = ['Blauw', 'Rood'];
const CTF_RED = { x0: 4030, x1: 4290, top: ROCK.top }; // de rode basis: gespiegeld aan de startrots (blauw)
const WAVE_LEN = 10, WAVE_T0 = 2, WAVE_ANN = 1.5;

// ---- start van een potje ----
function arenaStart(M) {
  const cfg = ARENA[M.mode];
  const A = M.ar = { mode: M.mode, x0: cfg.x0, x1: cfg.x1, prot: 1.5, cd: new Map(), vl: [], cuts: [], respawnT: 0, host: MP.role === 'host',
    t0: performance.now() + 3500, el: 0, end: false, sent: 0, claimT: 0, peels: [], seq: 0 };
  // de wereld: alleen de arena (vaste lianen, voor iedereen hetzelfde)
  vines = []; apples = []; shrooms = []; foes = []; tramps = []; portals = []; loot = []; pups = [];
  vineSeq = 100; // hoger dan MP_FREE_VINES: alle lianen buigen mee als een ander eraan hangt
  genRandom = mulberry32((M.seed ^ 0x2545f491) >>> 0);
  if (M.mode === 'king') kingBuild(M, A);
  else if (M.mode === 'ctf') ctfBuild(M, A);
  else wavesBuild(M, A);
  arenaSpawn(M, true);
  if (M.bot) return;
  $('arBtns').classList.toggle('hidden', M.mode !== 'ctf');
  document.body.classList.add('arena'); // geen afstand in de HUD
  arenaBtns();
}
function arenaStop() { const b = $('arBtns'); if (b) b.classList.add('hidden'); document.body.classList.remove('arena'); }
function arenaVine(A, x, ay, len) {
  const v = makeVine(x, ay, len, 'normal', 0);
  v.ax0 = x; v.orig = v.pts.map(p => ({ x: p.x, y: p.y }));
  vines.push(v); A.vl.push(v);
  return v;
}
// een doorgeknipte of gebroken liaan weer laten aangroeien
function arenaRegrow(v) {
  v.pts.forEach((p, i) => { p.x = p.px = v.orig[i].x; p.y = p.py = v.orig[i].y; });
  v.pts[0].im = 0; v.anchored = true; v.x = v.ax0; v.cut = false; v.snapT = 0;
  if (!vines.includes(v)) vines.push(v);
}
function arenaCut(v) {
  if (!v || !v.anchored) return;
  v.anchored = false; v.cut = true; v.pts[0].im = 1;
  if (G.vine === v) release(false);
  game.mp.ar.cuts.push({ v, t: CTF_REGROW });
}
const meId = M => M.bot ? M.bot.id : MP.myId; // een aap van de host speelt in een eigen wereld (botIn)
const myIdx = M => Math.max(0, M.ids.indexOf(meId(M)));

// terugkomen (na een val) of beginnen: Koning aan een liaan aan de rand, Vlag in je eigen basis, Overleven ergens in het rooster
function arenaSpawn(M, first) {
  const A = M.ar, i = myIdx(M);
  let v = null;
  if (M.mode === 'ctf') {
    const t = ctfTeam(M, MP.myId), R = t ? CTF_RED : ROCK, x = (R.x0 + R.x1) / 2 + (t ? 30 : -30);
    arenaResetG(x, R.top - FEET);
    G.state = 'stand'; G.standPress = input.presses; G.vine = null;
    A.prot = 2; // respawn-muur: even veilig in je eigen basis
  } else {
    const list = A.spawnV || A.vl;
    v = list[(first ? i : i + ((M.t * 7) | 0)) % list.length];
    if (v && !v.anchored) arenaRegrow(v);
    const p = v.pts, k = Math.round(p.length * 0.55);
    arenaResetG(p[k].x, p[k].y + ARM_LEN);
    G.state = 'air'; attach(v, k); G.om *= 0.3;
    A.prot = first ? 1.5 : 1;
  }
  game.holdLock = true; // blijft hangen/staan tot je drukt
  run.firstJump = false;
  if (first) { camX = Math.max(-100, G.x - viewW * 0.5); camY = Math.min(baseTop(), G.y - viewH * 0.5); lastCamX = camX; }
}
function arenaResetG(x, y) {
  if (G.state === 'hang' && G.vine) freeHand(G.vine, G.k);
  Object.assign(G, { x, y, px: x, py: y, vx: 0, vy: 0, angle: 0, trick: null, trickRot: 0, dive: 0, diveT: 0, airT: 0, airX: x,
    splashed: false, invuln: 1, lastVine: null, releaseT: 0, vine: null, deadT: 0 });
}
// wie zit er in welk team (Vlag): om en om in de volgorde van de spelerslijst; 0 = blauw (links), 1 = rood (rechts)
const ctfTeam = (M, id) => Math.max(0, M.ids.indexOf(id)) % 2;

// ---- elke physics-stap (mijn eigen Andy) ----
function arenaStep(dt) {
  const M = game.mp, A = M.ar, alive = G.state !== 'dead' && !M.myEv;
  A.prot = Math.max(0, A.prot - dt);
  for (const [k, t] of A.cd) if (t - dt <= 0) A.cd.delete(k); else A.cd.set(k, t - dt);
  // doorgeknipte en gebroken lianen groeien terug
  for (let i = A.cuts.length - 1; i >= 0; i--) if ((A.cuts[i].t -= dt) <= 0) { arenaRegrow(A.cuts[i].v); A.cuts.splice(i, 1); }
  let lo = A.x0, hi = A.x1;
  if (M.mode === 'waves') { const w = wavesStep(M, A, dt, alive); lo = w[0]; hi = w[1]; }
  else if (M.mode === 'king') kingStep(M, A, dt, alive);
  else ctfStep(M, A, dt, alive);
  if (!alive) {
    // Koning en Vlag: na een val kom je terug
    if (G.state === 'dead' && M.mode !== 'waves' && (G.deadT || 0) > AR_RESPAWN) arenaSpawn(M, false);
    return;
  }
  // de wanden van de arena: in de lucht terugkaatsen (aan een liaan mag je er even overheen zwaaien)
  if (G.state === 'air' && (G.x < lo || G.x > hi)) {
    const dir = G.x < lo ? 1 : -1;
    G.x = dir > 0 ? lo : hi; G.vx = dir * Math.max(380, Math.abs(G.vx) * 0.6); G.vy = Math.min(G.vy, -120);
  }
  // beuken: met vaart tegen een ander aan
  const sp = Math.hypot(G.vx, G.vy);
  if (game.mode === 'playing' && sp > AR_BUMP_SP && M.mode !== 'waves') {
    for (const P of opps(M)) {
      const g = P.ghost;
      if (!g || P.left || P.ev || g.state === 'dead' || A.cd.has(P.id)) continue;
      if (M.mode === 'ctf' && ctfTeam(M, P.id) === ctfTeam(M, MP.myId)) continue; // je eigen team beuk je niet
      if (Math.hypot(g.x - G.x, g.y - G.y) > G_R * 2 + 16) continue;
      if (sp < Math.hypot(g.vx || 0, g.vy || 0) + 120) continue; // de snelste beukt
      A.cd.set(P.id, 0.8);
      arenaSend({ k: 'bump', to: P.id, dx: +(G.vx / sp).toFixed(3), dy: +(G.vy / sp).toFixed(3), sp: Math.round(sp) });
      floatText(g.x, g.y - 70, 'Beuk!', '#ffe46b', 26); starBurst((g.x + G.x) / 2, (g.y + G.y) / 2, 12, '#ffffff'); shake(4, 0.2); Sfx.boing();
      G.vx *= 0.55; G.vy *= 0.55;
    }
  }
}
// ik word gebeukt: loslaten en wegvliegen (hoe harder de ander ging, hoe verder)
function arenaBumped(m, P) {
  const M = game.mp, A = M.ar;
  if (G.state === 'dead' || M.myEv || A.prot > 0 || game.mode !== 'playing') return;
  if (G.state === 'hang') release(false);
  G.state = 'air';
  const push = clamp((+m.sp || 700) * 1.15, 650, 2000), dx = clamp(+m.dx || 0, -1, 1), dy = clamp(+m.dy || 0, -1, 1);
  G.vx = dx * push; G.vy = dy * push - 260; G.airT = 0; G.airX = G.x; G.lastVine = null;
  floatText(G.x, G.y - 70, `Gebeukt door ${P.name}!`, '#ffb0b0', 22); shake(7, 0.3); Sfx.crack(); flashT = Math.max(flashT, 0.12);
  if (M.mode === 'ctf') ctfDropMine(M, A);
}
// een val (in het water): Koning en Vlag komen terug; Overleven: een extra leven, anders ben je af (false)
function arenaDied(M) {
  const A = M.ar;
  if (M.mode === 'waves') {
    if (A.lives > 0) { A.lives--; A.respawnT = 1.6; floatText(G.x, G.y - 80, '❤️ Extra leven!', '#7dff8a', 26); return true; }
    return false;
  }
  M.falls++;
  if (M.mode === 'ctf') ctfDropMine(M, A);
  floatText(G.x, G.y - 70, `Plons! Over ${AR_RESPAWN} tellen terug`, '#ffffff', 22);
  return true;
}
// mag ik deze liaan grijpen? (Koning: de gouden liaan is van de koning; wie ertegenaan springt, botst)
function arenaGrab(v) {
  const M = game.mp, A = M.ar;
  if (M.mode === 'king' && v.gold && A.king && A.king !== MP.myId) {
    const d = Math.sign(G.x - v.pts[0].x) || 1;
    G.vx = d * Math.max(420, Math.abs(G.vx) * 0.7); G.vy = Math.min(G.vy, -200);
    if (A.cd.get('bez') === undefined) { A.cd.set('bez', 0.6); floatText(G.x, G.y - 60, 'Bezet!', '#ffe46b', 22); Sfx.boing(); }
    return false;
  }
  return true;
}
// net gegrepen (Vlag: een bananenschil van de tegenstander, dan glij je eraf)
function arenaAttached(v) {
  const M = game.mp;
  if (M.mode === 'ctf' && v.peel && v.peel.team !== ctfTeam(M, MP.myId)) {
    release(false); G.vy = 250; G.vx *= 0.3;
    floatText(G.x, G.y - 60, 'Uitgegleden! 🍌', '#ffe46b', 24); Sfx.whoa();
    arenaSend({ k: 'unpeel', vid: v.id }); v.peel = null;
  }
}
// Vlag: springen vanaf je eigen basis (rood springt naar links)
function arenaJump() {
  const M = game.mp;
  if (!M || M.mode !== 'ctf') return false;
  const dir = ctfTeam(M, MP.myId) ? -1 : 1;
  G.state = 'air'; G.vx = dir * 690; G.vy = -770; G.airT = 0; G.airX = G.x; G.noDive = true; G.lastVine = null;
  floatText(G.x, G.y - 60, 'Hup!', '#ffffff', 26); Sfx.jump(); Sfx.hup();
  return true;
}
// tempo (Overleven: slowmotion of turbo)
const arenaTimeK = () => { const A = game.mp && game.mp.ar; return A && A.timeK ? A.timeK : 1; };

// ---- berichten ----
function arenaSend(m) {
  const M = game.mp || MP.round;
  if (!M) return;
  mpSend(Object.assign({ type: 'ar', id: M.seed, from: MP.myId }, m));
}
// iets melden bij de host (de host verwerkt het meteen zelf)
function arenaClaim(m) {
  if (MP.role === 'host') arenaHostMsg(MP.myId, m); else arenaSend(m);
}
function arenaMsg(P, m) {
  const M = MP.match, A = M && M.ar;
  if (!A) return;
  if (MP.role === 'host' && ['grab', 'let', 'take', 'cap', 'drop', 'ret'].includes(m.k)) { arenaHostMsg(P.id, m); return; }
  if (m.k === 'bump') { if (m.to === MP.myId && game.mp === M) arenaBumped(m, P); else if (P.ghost) floatText(P.ghost.x, P.ghost.y - 70, 'Beuk!', '#ffe46b', 22); }
  else if (m.k === 'st' && P.host) arenaState(M, A, m);
  else if (m.k === 'cut') { const v = A.vl.find(w => w.id === m.vid); if (v) { arenaCut(v); floatText(v.x, v.ay + 80, '✂️', '#ffffff', 30); } }
  else if (m.k === 'peel') { const v = A.vl.find(w => w.id === m.vid); if (v) v.peel = { team: m.team | 0, own: P.id }; }
  else if (m.k === 'unpeel') { const v = A.vl.find(w => w.id === m.vid); if (v) v.peel = null; }
  else if (m.k === 'pick') { const p = A.pu && A.pu[m.i | 0]; if (p) p.up = false; }
  else if (m.k === 'apple') wavesApple(A, +m.x || 0, P.id);
}

// ---- de host: Koning en Vlag bijhouden ----
function arenaHostMsg(id, m) {
  const M = MP.round, A = M && M.ar;
  if (!A || A.end || !M.ids.includes(id)) return;
  if (M.mode === 'king') {
    if (m.k === 'grab' && !A.king) { A.king = id; A.kingT0 = performance.now(); arenaBroadcast(M, A); }
    else if (m.k === 'let' && A.king === id) { A.king = null; arenaBroadcast(M, A); }
  } else if (M.mode === 'ctf') {
    const t = ctfTeam(M, id), e = 1 - t, F = A.fl;
    if (m.k === 'take' && (m.t | 0) === e && F[e].a !== 'car' && !F.some(f => f.a === 'car' && f.by === id)) { F[e] = { a: 'car', by: id }; A.news = [id, 'take', e]; }
    else if (m.k === 'drop') {
      for (const f of F) if (f.a === 'car' && f.by === id) { Object.assign(f, { a: 'drop', by: null, x: clamp(+m.x || 0, A.x0 + 40, A.x1 - 40), y: clamp(+m.y || 0, -1050, HAZARD_Y - 140), dt: CTF_DROP }); A.news = [id, 'drop']; }
    } else if (m.k === 'ret' && (m.t | 0) === t && F[t].a === 'drop') { F[t] = { a: 'base' }; A.news = [id, 'ret', t]; }
    else if (m.k === 'cap' && F[e].a === 'car' && F[e].by === id && F[t].a === 'base') {
      F[e] = { a: 'base' }; A.sc[t]++; A.caps[id] = (A.caps[id] || 0) + 1; A.news = [id, 'cap', t];
      if (A.sc[t] >= CTF_WIN) A.end = true;
    } else return;
    arenaBroadcast(M, A);
  }
}
// twee keer per seconde (vanuit mpTick): punten tellen, de tijd, en de stand naar iedereen
function arenaHostTick(M) {
  const A = M.ar;
  if (!A || A.end || M.mode === 'waves') return;
  const now = performance.now(), el = Math.max(0, (now - A.t0) / 1000), dt = Math.max(0, el - A.el);
  A.el = el;
  const active = id => id === MP.myId ? !M.quit : (P => P && !P.left)(MP.players.get(id));
  if (M.mode === 'king') {
    if (A.king && !active(A.king)) A.king = null;
    if (A.king) { A.sc[A.king] = (A.sc[A.king] || 0) + dt; if (A.sc[A.king] >= KING_WIN) { A.sc[A.king] = KING_WIN; A.end = true; } }
    if (el >= KING_TIME) A.end = true;
  } else {
    for (let t = 0; t < 2; t++) {
      const f = A.fl[t];
      if (f.a === 'drop' && (f.dt -= dt) <= 0) A.fl[t] = { a: 'base' };
      if (f.a === 'car' && !active(f.by)) A.fl[t] = { a: 'base' };
    }
    // een heel team weg: dan wint het andere
    for (let t = 0; t < 2; t++) if (!M.ids.some(id => ctfTeam(M, id) === t && active(id))) { A.sc[1 - t] = Math.max(A.sc[1 - t], A.sc[t] + 1); A.end = true; }
    if (el >= CTF_TIME) A.end = true;
  }
  arenaBroadcast(M, A);
}
function arenaBroadcast(M, A) {
  const m = { k: 'st', el: +A.el.toFixed(1), end: A.end ? 1 : 0 };
  if (M.mode === 'king') {
    m.king = A.king || null; m.ks = A.king ? +((performance.now() - A.kingT0) / 1000).toFixed(1) : 0;
    m.sc = {}; for (const id in A.sc) m.sc[id] = +A.sc[id].toFixed(1);
  } else { m.fl = A.fl; m.sc = A.sc; m.caps = A.caps; m.news = A.news || null; A.news = null; }
  arenaSend(m);
  arenaState(M, A, m, true);
}
// de stand van de host overnemen (ook bij de host zelf, voor de meldingen)
function arenaState(M, A, m, self) {
  A.el = +m.el || 0; A.elAt = performance.now();
  if (m.end) A.end = true;
  if (M.mode === 'king') {
    const was = A.king;
    A.king = typeof m.king === 'string' ? m.king : null; A.ks = +m.ks || 0; A.ksAt = performance.now();
    if (!self) A.sc = m.sc && typeof m.sc === 'object' ? m.sc : {};
    if (A.king !== was && A.king && game.mp === M) {
      if (A.king === MP.myId) { showBanner('👑 Jij bent koning!', 'Hou vol!'); A.prot = Math.max(A.prot, 1); Sfx.cheer(); }
      else if (G.vine && G.vine.gold && game.mode === 'playing') { // te laat: een ander was eerst
        release(false); G.vx = (Math.sign(G.x - G.vine.pts[0].x) || 1) * 500; G.vy = -300;
        floatText(G.x, G.y - 60, 'Te laat!', '#ffb0b0', 22);
      }
    }
  } else {
    if (!self) { A.fl = Array.isArray(m.fl) ? m.fl : A.fl; A.sc = Array.isArray(m.sc) ? m.sc : A.sc; A.caps = m.caps || A.caps; }
    const n = m.news;
    if (Array.isArray(n) && game.mp === M) {
      const who = n[0] === MP.myId ? 'Jij' : (MP.players.get(n[0]) || { name: '?' }).name;
      if (n[1] === 'cap') { showBanner(`${CTF_NAME[n[2]]} scoort!`, `${who} bracht de vlag thuis · ${A.sc[0]} – ${A.sc[1]}`); Sfx.jingle(1); confetti(G.x, G.y - 120, 50); }
      else if (n[1] === 'take') { showBanner(`${who} heeft de ${n[2] ? 'rode' : 'blauwe'} vlag!`, ''); Sfx.steal(); }
      else if (n[1] === 'ret') showBanner(`De ${n[2] ? 'rode' : 'blauwe'} vlag is terug`, '');
    }
  }
}
// is het potje klaar? (Koning en Vlag: de host zegt het; Overleven: null = zoals endurance)
function arenaOver(M, all, busy) {
  if (M.mode === 'waves') return null;
  return !!M.ar.end || (all.length > 1 && busy.length <= 1);
}

// =====================================================================
//  Koning van de liaan
// =====================================================================
function kingBuild(M, A) {
  const C = (A.x0 + A.x1) / 2;
  A.C = C; A.king = null; A.sc = {}; A.ks = 0; A.onGold = false; A.slipAcc = 0;
  const gold = arenaVine(A, C, -980, 780);
  gold.gold = true; gold.col = '#e8b923'; gold.dark = shade(gold.col, -0.38); gold.light = shade(gold.col, 0.35); gold.leaf = '#ffd23f'; gold.flower = null;
  A.gold = gold;
  // een ring van gewone lianen eromheen, zodat je van alle kanten kunt aanvallen
  const ring = [[-430, -1020, 320], [430, -1020, 320], [-760, -700, 380], [760, -700, 380], [-560, -330, 330], [560, -330, 330],
    [-980, -250, 440], [980, -250, 440], [-1180, -760, 420], [1180, -760, 420], [-1220, 40, 400], [1220, 40, 400], [-300, 30, 300], [300, 30, 300]];
  for (const [dx, ay, len] of ring) arenaVine(A, C + dx, ay, len);
  A.spawnV = A.vl.filter(v => Math.abs(v.ax0 - C) > 1100); // terugkomen aan de rand
}
function kingStep(M, A, dt, alive) {
  const g = A.gold, reign = A.king ? A.ks + (performance.now() - (A.ksAt || 0)) / 1000 : 0;
  // de gouden liaan zwaait langzaam; hoe langer iemand koning is, hoe harder hij schudt
  const shakeA = A.king ? Math.min(34, reign * 1.1) : 0;
  const ax = g.ax0 + Math.sin(time * 0.55) * 70 + Math.sin(time * 17) * shakeA;
  if (g.anchored) { g.pts[0].x = ax; g.x = ax; }
  const onGold = alive && G.state === 'hang' && G.vine === g;
  const now = performance.now();
  if (game.mode === 'playing' && (onGold !== A.onGold || (onGold && !A.king && now - A.claimT > 1000))) { // (opnieuw) melden als de plek vrij is
    A.onGold = onGold; A.claimT = now; arenaClaim({ k: onGold ? 'grab' : 'let' });
  }
  if (onGold && A.king === MP.myId) {
    G.om += Math.sin(time * 9) * shakeA * 0.5 * dt / Math.max(40, G.R) * 10;
    // na een tijdje kan je eraf glijden
    if (reign > 15 && A.prot <= 0) { A.slipAcc += dt; if (A.slipAcc > 1) { A.slipAcc = 0; if (Math.random() < (reign - 15) * 0.035) { release(false); floatText(G.x, G.y - 60, 'Weggegleden!', '#ffe46b', 24); Sfx.whoa(); } } }
  }
}
function kingDraw(M, A) {
  // kroon boven de koning (licht op), en een klein kroontje boven de anderen met hun punten
  const who = [{ id: MP.myId, g: G }].concat(opps(M).filter(P => P.ghost && !P.left).map(P => ({ id: P.id, g: P.ghost })));
  for (const w of who) {
    const g = w.g; if (!g || g.state === 'dead') continue;
    const king = A.king === w.id, s = king ? 1.4 : 0.8, y = g.y - (w.id === MP.myId ? 78 : 104);
    if (king) { ctx.fillStyle = `rgba(255,220,80,${0.35 + 0.2 * Math.sin(time * 6)})`; circ(g.x, y, 30); }
    crown(g.x, y, s, king ? '#ffd23f' : 'rgba(255,215,90,.55)');
  }
}
function crown(x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(90,60,0,.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(-16, -8); ctx.lineTo(-7, 0); ctx.lineTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(16, -8); ctx.lineTo(14, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
const kingPts = (A, id) => Math.floor((A.sc && A.sc[id]) || 0);

// =====================================================================
//  Vlag veroveren
// =====================================================================
function ctfBuild(M, A) {
  const C = (A.x0 + A.x1) / 2; // symmetrisch rond het midden
  A.fl = [{ a: 'base' }, { a: 'base' }]; A.sc = [0, 0]; A.caps = {}; A.cutCd = 0; A.lastTake = 0;
  const half = [[FIRST_VINE.x, FIRST_VINE.ay, FIRST_VINE.len], [870, -200, 420], [1180, -760, 380], [1230, 0, 420], [1560, -330, 380], [1580, -900, 360], [1900, -60, 400], [1950, -620, 380]];
  for (const [x, ay, len] of half) { arenaVine(A, x, ay, len); arenaVine(A, 2 * C - x, ay, len); }
  // teams even groot? Anders krijgt het kleinste team een snelheidsbonus
  const n = [0, 0]; M.ids.forEach(id => n[ctfTeam(M, id)]++);
  A.bonus = n[0] === n[1] ? -1 : n[0] < n[1] ? 0 : 1;
  A.team = ctfTeam(M, MP.myId);
}
const ctfFlagBase = t => t ? [(CTF_RED.x0 + CTF_RED.x1) / 2, CTF_RED.top - 60] : [(ROCK.x0 + ROCK.x1) / 2 + 20, ROCK.top - 60];
function ctfFlagPos(M, A, t) {
  const f = A.fl[t];
  if (f.a === 'base') return ctfFlagBase(t);
  if (f.a === 'drop') return [f.x, f.y];
  const g = f.by === MP.myId ? G : (MP.players.get(f.by) || {}).ghost;
  return g ? [g.x - 8, g.y - 58] : ctfFlagBase(t);
}
const ctfCarrying = (A, id) => A.fl.findIndex(f => f.a === 'car' && f.by === id);
function ctfDropMine(M, A) {
  if (ctfCarrying(A, MP.myId) < 0) return;
  A.noTake = performance.now() + 1500; // niet meteen weer oppakken
  arenaClaim({ k: 'drop', x: Math.round(G.x), y: Math.round(Math.min(G.y, HAZARD_Y - 140)) });
}
function ctfStep(M, A, dt, alive) {
  const t = A.team, e = 1 - t, now = performance.now();
  A.cutCd = Math.max(0, A.cutCd - dt);
  if (Math.ceil(A.cutCd) !== A.cdShown) { A.cdShown = Math.ceil(A.cutCd); arenaBtns(); }
  // de rode basis is ook massief: erop landen
  const R = CTF_RED;
  if (alive && G.state === 'air' && G.x > R.x0 - 10 && G.x < R.x1 + 10) {
    const prevFeet = (G.iy != null ? G.iy : G.y) + FEET;
    if (G.vy > 0 && prevFeet <= R.top + 4 && G.y + FEET >= R.top) { G.y = R.top - FEET; G.state = 'stand'; G.vx = 0; G.vy = 0; G.standPress = input.presses; G.sq = -0.3; }
    else if (G.y + FEET > R.top + 6) { G.x = R.x0 - G_R * 0.6; G.vx = -Math.abs(G.vx) * 0.3; }
  }
  // snelheid: met de vlag wat langzamer, op je eigen helft en in het kleinste team wat sneller (alleen in de lucht)
  if (alive && G.state === 'air' && G.ix != null) {
    const C = (A.x0 + A.x1) / 2, own = t ? G.x > C : G.x < C;
    const K = (ctfCarrying(A, MP.myId) >= 0 ? 0.8 : 1) * (own ? 1.08 : 1) * (A.bonus === t ? 1.12 : 1);
    if (K !== 1) G.x = G.ix + (G.x - G.ix) * K;
  }
  if (!alive || game.mode !== 'playing' || now - A.claimT < 400) return;
  const near = (p, r) => Math.hypot(G.x - p[0], G.y - p[1]) < r;
  const carrying = ctfCarrying(A, MP.myId) >= 0;
  if (!carrying && A.fl[e].a !== 'car' && now > (A.noTake || 0) && near(ctfFlagPos(M, A, e), 75)) { A.claimT = now; arenaClaim({ k: 'take', t: e }); }
  else if (A.fl[t].a === 'drop' && near(ctfFlagPos(M, A, t), 75)) { A.claimT = now; arenaClaim({ k: 'ret', t }); }
  else if (carrying && A.fl[t].a === 'base' && near(ctfFlagBase(t), 130)) { A.claimT = now; arenaClaim({ k: 'cap' }); }
}
// knippen: de liaan waar een tegenstander aan hangt (de dichtstbijzijnde), anders de liaan het dichtst bij je
function ctfCut() {
  const M = game.mp, A = M && M.ar;
  if (!A || M.mode !== 'ctf' || A.cutCd > 0 || G.state === 'dead' || game.mode !== 'playing') return;
  let best = null, bd = 2400; // tot ongeveer een (uitgezoomd) scherm ver
  for (const P of opps(M)) {
    const g = P.ghost;
    if (!g || P.left || g.state !== 'hang' || ctfTeam(M, P.id) === A.team) continue;
    const s = P.snaps[P.snaps.length - 1], v = s && A.vl.find(w => w.id === s.vid && w.anchored), d = v ? Math.hypot(g.x - G.x, g.y - G.y) : Infinity;
    if (d < bd) { bd = d; best = v; }
  }
  if (!best) { bd = Infinity; for (const v of A.vl) { if (!v.anchored || v === G.vine) continue; const d = Math.hypot(v.pts[0].x - G.x, v.ay + 200 - G.y); if (d < bd) { bd = d; best = v; } } }
  if (!best) return;
  A.cutCd = CTF_CUT_CD;
  arenaCut(best); floatText(best.x, best.ay + 80, '✂️ Knip!', '#ffffff', 26); Sfx.crack();
  arenaSend({ k: 'cut', vid: best.id });
  arenaBtns();
}
// een bananenschil op je liaan (of de dichtstbijzijnde); je hebt er maximaal twee tegelijk
function ctfPeel() {
  const M = game.mp, A = M && M.ar;
  if (!A || M.mode !== 'ctf' || G.state === 'dead' || game.mode !== 'playing') return;
  let v = G.state === 'hang' ? G.vine : null;
  if (!v) { let bd = 420; for (const w of A.vl) { if (!w.anchored) continue; const p = w.pts[w.pts.length - 1], d = Math.hypot(p.x - G.x, p.y - G.y); if (d < bd) { bd = d; v = w; } } }
  if (!v || v.peel) return;
  if (A.peels.length >= CTF_PEELS) { const old = A.peels.shift(); if (old.peel && old.peel.own === MP.myId) { old.peel = null; arenaSend({ k: 'unpeel', vid: old.id }); } }
  v.peel = { team: A.team, own: MP.myId }; A.peels.push(v);
  arenaSend({ k: 'peel', vid: v.id, team: A.team });
  floatText(G.x, G.y - 60, '🍌 Schil gelegd', '#ffe46b', 20);
  arenaBtns();
}
function arenaBtns() {
  const M = game.mp, A = M && M.ar;
  if (!A || M.mode !== 'ctf') return;
  $('btnArCut').textContent = A.cutCd > 0 ? `✂️ ${Math.ceil(A.cutCd)}` : '✂️';
  $('btnArCut').classList.toggle('off', A.cutCd > 0);
  $('btnArPeel').textContent = `🍌 ${CTF_PEELS - A.peels.filter(v => v.peel && v.peel.own === MP.myId).length}`;
}
function arenaKey(code) {
  if (arenaMode() !== 'ctf') return false;
  if (code === 'KeyX') { ctfCut(); return true; }
  if (code === 'KeyC') { ctfPeel(); return true; }
  return false;
}
function ctfDraw(M, A) {
  // de rode basis: de startrots gespiegeld
  if (camX + viewW > CTF_RED.x0 - 100) {
    const cx = camX; camX = -1e4;
    ctx.save(); ctx.translate(ROCK.x0 + CTF_RED.x1, 0); ctx.scale(-1, 1);
    try { drawRock(); } finally { ctx.restore(); camX = cx; }
  }
  // de bases: een gekleurde gloed
  for (let t = 0; t < 2; t++) {
    const [bx, by] = ctfFlagBase(t);
    ctx.fillStyle = t ? 'rgba(232,50,43,.18)' : 'rgba(47,127,224,.18)'; ell(bx, by + 60, 140, 22);
  }
  // bananenschillen
  ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const v of A.vl) if (v.peel && v.anchored) { const p = v.pts[Math.round(v.pts.length * 0.55)]; ctx.fillText('🍌', p.x + 12, p.y); }
  // vlaggen
  for (let t = 0; t < 2; t++) {
    const [x, y] = ctfFlagPos(M, A, t), f = A.fl[t];
    ctfFlag(x, y, CTF_COL[t], f.a === 'car' ? 0.75 : 1);
    if (f.a === 'drop') { ctx.fillStyle = '#fff'; ctx.font = '900 16px Trebuchet MS, sans-serif'; ctx.fillText(Math.max(0, Math.ceil(f.dt || 0)) + 's', x, y - 76); }
  }
  // teamkleur boven jezelf
  if (G.state !== 'dead') { ctx.fillStyle = CTF_COL[A.team]; ctx.beginPath(); ctx.moveTo(G.x - 10, G.y - 92); ctx.lineTo(G.x + 10, G.y - 92); ctx.lineTo(G.x, G.y - 78); ctx.closePath(); ctx.fill(); }
}
function ctfFlag(x, y, col, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 5; line(0, 60, 0, -50);
  const w = Math.sin(time * 7) * 5;
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(2, -50); ctx.quadraticCurveTo(24, -54 + w, 46, -44 + w); ctx.quadraticCurveTo(30, -32 - w, 44, -18 + w); ctx.quadraticCurveTo(22, -24, 2, -18); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffe46b'; circ(0, -52, 5);
  ctx.restore();
}

// =====================================================================
//  Overleven (waves)
// =====================================================================
const WAVE_KINDS = {
  coco:   { name: 'Kokosregen' }, crush: { name: 'Pletblokken' }, bomb: { name: 'Bananenbommen' }, meteor: { name: 'Meteoor' },
  wasp:   { name: 'Wespenzwerm' }, cannon: { name: 'Kanonskogels' }, kiwi: { name: 'Kiwi-invasie' }, wind: { name: 'Windvlaag' },
  lava:   { name: 'Stijgende lava' }, geyser: { name: 'Geisers' }, shark: { name: 'Haaien' },
  rotten: { name: 'Rotte lianen' }, slide: { name: 'Schuivende lianen' }, dark: { name: 'Donker' }, grav: { name: 'Omgekeerde zwaartekracht' },
  time:   { name: 'Slowmotion' }, walls: { name: 'Krimpende wanden' },
};
const WAVE_EASY = ['coco', 'cannon', 'bomb', 'wind', 'geyser', 'shark', 'crush', 'kiwi', 'rotten'];
const WAVE_POW = { shield: { icon: '🛡️', name: 'Schild' }, dbl: { icon: '🪽', name: 'Dubbele sprong' }, life: { icon: '❤️', name: 'Extra leven' } };
function wavesBuild(M, A) {
  const cols = 6, m = 260, w = (A.x1 - A.x0 - 2 * m) / (cols - 1); // niet te dicht bij de wanden
  for (let i = 0; i < cols; i++) arenaVine(A, A.x0 + m + i * w, -820, 380);
  for (let i = 0; i < cols - 1; i++) arenaVine(A, A.x0 + m + (i + 0.5) * w, -250, 380);
  A.wave = 0; A.hz = []; A.fx = {}; A.lives = 0; A.shield = 0; A.dbl = 0; A.pu = []; A.ann = null; A.appleCd = 0; A.gapples = []; A.timeK = 1;
}
const waveAt = t => Math.max(0, Math.floor((t - WAVE_T0) / WAVE_LEN) + 1);
function waveGen(M, A, n) {
  const rnd = mulberry32(((M.seed * 31) ^ (n * 7919)) >>> 0), r = (a, b) => a + rnd() * (b - a);
  const sp = n >= 12 ? Math.pow(1.05, n - 11) : 1, w0 = WAVE_T0 + (n - 1) * WAVE_LEN + WAVE_ANN, W = A.x1 - A.x0;
  wavesReset(A);
  A.hz = []; A.fx = {}; A.pu = []; A.timeK = 1;
  if (n % 5 === 0) { // rustige wave met power-ups
    ['shield', 'dbl', 'life'].forEach((k, i) => A.pu.push({ i, k, x: A.x0 + W * (0.25 + 0.25 * i) + r(-60, 60), y: r(-650, -150), up: true }));
    return `WAVE ${n} · Even rust: pak een power-up!`;
  }
  const cnt = n <= 5 ? 1 : n <= 11 ? 2 : 3, pool = n <= 2 ? WAVE_EASY.slice() : Object.keys(WAVE_KINDS), kinds = [];
  while (kinds.length < cnt && pool.length) kinds.push(pool.splice((rnd() * pool.length) | 0, 1)[0]);
  const X = () => r(A.x0 + 60, A.x1 - 60), hz = (o) => A.hz.push(Object.assign({ on: false, t: 0 }, o));
  for (const k of kinds) {
    if (k === 'coco') for (let i = 0, c = Math.min(30, Math.round(16 * sp)); i < c; i++) hz({ k, at: w0 + i * 7.5 / c, x: X(), y: -1350, vy: 450 * sp, r: 22, warn: 0.9 });
    else if (k === 'crush') for (let i = 0; i < 3; i++) hz({ k, at: w0 + i * 2.6, x: X(), w: 170, h: 130, warn: 1 });
    else if (k === 'bomb') for (let i = 0; i < 5; i++) hz({ k, at: w0 + i * 1.4, x: X(), y: r(-760, 60), fuse: 2 / sp, R: 170 });
    else if (k === 'meteor') for (let i = 0; i < 2; i++) { const L = rnd() < 0.5; hz({ k, at: w0 + 0.5 + i * 4, sx: L ? A.x0 - 300 : A.x1 + 300, sy: -1450, tx: X(), ty: HAZARD_Y, sp: 1400 * sp, r: 55, warn: 1.2 }); }
    else if (k === 'wasp') for (let i = 0; i < 2; i++) { const d = i % 2 ? -1 : 1; hz({ k, at: w0 + 0.3 + i * 4, x: d > 0 ? A.x0 - 40 : A.x1 + 40, d, sp: 330 * sp, gy: r(-700, 20), gh: 150 }); }
    else if (k === 'cannon') for (let i = 0; i < 6; i++) { const d = i % 2 ? -1 : 1; hz({ k, at: w0 + i * 1.3, x: d > 0 ? A.x0 : A.x1, y: r(-820, 200), d, sp: 1150 * sp, r: 20, warn: 0.8 }); }
    else if (k === 'kiwi') for (let i = 0; i < 5; i++) { const d = rnd() < 0.5 ? 1 : -1; hz({ k, at: w0 + i * 1.6, x: d > 0 ? A.x0 : A.x1, y: HAZARD_Y, vx: d * r(600, 820) * sp, vy: -r(1150, 1400), r: 28 }); }
    else if (k === 'shark') for (let i = 0; i < 5; i++) { const d = rnd() < 0.5 ? 1 : -1; hz({ k, at: w0 + i * 1.5, x: X(), y: HAZARD_Y + 40, vx: d * 480 * sp, vy: -1250, r: 34 }); }
    else if (k === 'geyser') for (let i = 0; i < 4; i++) hz({ k, at: w0 + i * 2, x: X(), warn: 1, top: -380 });
    else if (k === 'wind') A.fx.wind = { d: rnd() < 0.5 ? -1 : 1, at: w0 };
    else if (k === 'lava') A.fx.lava = { at: w0 };
    else if (k === 'rotten') A.fx.rotten = { at: w0, ids: A.vl.filter(() => rnd() < 0.5).map(v => v.id) };
    else if (k === 'slide') A.fx.slide = { at: w0 };
    else if (k === 'dark') A.fx.dark = { at: w0 };
    else if (k === 'grav') A.fx.grav = { at: w0 };
    else if (k === 'time') A.fx.time = { at: w0, k: rnd() < 0.5 ? 0.6 : 1.4 };
    else if (k === 'walls') A.fx.walls = { at: w0 };
  }
  const names = kinds.map(k => k === 'time' ? (A.fx.time.k < 1 ? 'Slowmotion' : 'Turbo') : WAVE_KINDS[k].name);
  return `WAVE ${n} · ${names.join(' + ')}`;
}
// het einde van een wave: alles wat de arena veranderde weer terug
function wavesReset(A) {
  for (const v of A.vl) {
    if (v.rotW) { v.rotW = false; v.col = v.col0 || v.col; v.dark = shade(v.col, -0.38); v.light = shade(v.col, 0.3); }
    if (!v.anchored) arenaRegrow(v);
    if (v.pts[0].x !== v.ax0) { v.pts[0].x = v.ax0; v.x = v.ax0; }
  }
  A.cuts = [];
}
function wavesStep(M, A, dt, alive) {
  const t = M.t, n = waveAt(t);
  if (game.mode === 'playing' && n !== A.wave && n > 0) {
    A.wave = n;
    const txt = waveGen(M, A, n);
    A.ann = { txt, t: 0 };
    if (game.mp === M) { Sfx.milestone(); if (n > 1 && !M.myEv) floatText(G.x, G.y - 80, `Wave ${n - 1} overleefd!`, '#7dff8a', 24); }
  }
  if (A.ann && (A.ann.t += dt) > 2.4) A.ann = null;
  A.appleCd = Math.max(0, A.appleCd - dt);
  if (A.respawnT > 0 && (A.respawnT -= dt) <= 0) { arenaSpawn(M, false); A.prot = 2; }
  const F = A.fx, on = f => f && t >= f.at;
  let lo = A.x0, hi = A.x1;
  // gevaren die de arena zelf veranderen
  A.timeK = on(F.time) ? F.time.k : 1;
  if (on(F.walls)) { const k = clamp((t - F.walls.at) / 3, 0, 1) * clamp((F.walls.at + WAVE_LEN - WAVE_ANN - t) / 1.2, 0, 1), inset = (A.x1 - A.x0) * 0.28 * k; lo += inset; hi -= inset; }
  if (on(F.slide)) A.vl.forEach((v, i) => { if (v.anchored) { const x = v.ax0 + Math.sin((t - F.slide.at) * 1.3 + i * 1.7) * 140; v.pts[0].x = x; v.x = x; } });
  if (on(F.rotten) && !F.rotten.done) {
    F.rotten.done = true;
    for (const v of A.vl) if (F.rotten.ids.includes(v.id)) { v.rotW = true; v.col0 = v.col; v.col = '#7a6a4a'; v.dark = shade(v.col, -0.38); v.light = shade(v.col, 0.2); }
  }
  if (on(F.rotten) && alive && G.state === 'hang' && G.vine && G.vine.rotW) {
    G.vine.snapT = (G.vine.snapT || 0) + dt;
    if (G.vine.snapT > 0.9) { const v = G.vine; floatText(G.x, G.y - 60, 'Krak!', '#d9c49a', 24); Sfx.crack(); v.anchored = false; v.pts[0].im = 1; release(false); }
  }
  // de lava stijgt en zakt weer
  A.lavaY = HAZARD_Y;
  if (on(F.lava)) { const e = t - F.lava.at, up = clamp(e / 4, 0, 1) * clamp((WAVE_LEN - WAVE_ANN - e) / 2, 0, 1); A.lavaY = HAZARD_Y - (HAZARD_Y - 230) * up * up * (3 - 2 * up); }
  if (alive && G.state !== 'dead' && G.y + G_R * 0.6 > A.lavaY && A.lavaY < HAZARD_Y - 5) wavesHit(M, A, 'lava');
  // wind, zwaartekracht
  if (alive && on(F.wind)) { const f = F.wind.d * 700 * (0.6 + 0.4 * Math.sin((t - F.wind.at) * 2)); if (G.state === 'air') G.vx += f * dt; else if (G.state === 'hang') G.om += f * 0.5 * Math.cos(G.th) * dt / Math.max(40, G.R); }
  if (alive && on(F.grav) && G.state === 'air') { G.vy -= 2 * AIR_G * dt; if (G.y < CEIL_Y) { G.y = CEIL_Y; G.vy = Math.abs(G.vy) * 0.3; } }
  // dubbele sprong: in de lucht nog een keer drukken (als er niets te grijpen was)
  if (alive && A.dbl > 0 && G.state === 'air' && input.presses !== A.lastPress && G.airT > 0.15) { A.dbl--; G.vy = -900; G.vx *= 1.05; starBurst(G.x, G.y + 20, 12, '#bfefff'); Sfx.boing(); floatText(G.x, G.y - 60, '🪽', '#ffffff', 28); }
  A.lastPress = input.presses;
  // de gevaren zelf
  for (let i = A.hz.length - 1; i >= 0; i--) {
    const h = A.hz[i];
    if (t < h.at) continue;
    const e = t - h.at;
    if (wavesHz(M, A, h, e, dt, alive) === false) A.hz.splice(i, 1);
  }
  // power-ups (rustige wave)
  for (const p of A.pu) {
    if (!p.up || !alive || M.bot || Math.hypot(G.x - p.x, G.y - p.y) > 70) continue;
    p.up = false; arenaSend({ k: 'pick', i: p.i });
    const P = WAVE_POW[p.k];
    if (p.k === 'shield') A.shield = 1; else if (p.k === 'dbl') A.dbl = 2; else A.lives++;
    floatText(p.x, p.y - 40, `${P.icon} ${P.name}!`, '#ffe46b', 24); starBurst(p.x, p.y, 14, '#ffe46b'); Sfx.lootPick();
  }
  // appels van de geesten
  for (let i = A.gapples.length - 1; i >= 0; i--) {
    const a = A.gapples[i];
    a.vy += 1300 * dt; a.y += a.vy * dt;
    if (a.y > HAZARD_Y) { A.gapples.splice(i, 1); continue; }
    if (alive && a.own !== MP.myId && Math.hypot(G.x - a.x, G.y - a.y) < G_R + 16) {
      A.gapples.splice(i, 1);
      if (G.state === 'hang') release(false);
      G.vx += (G.x < a.x ? -1 : 1) * 420; G.vy = Math.max(G.vy, 200);
      floatText(G.x, G.y - 60, '🍎 Bonk!', '#ffb0b0', 22); Sfx.crack(); shake(4, 0.2);
    }
  }
  return [lo, hi];
}
function wavesHit(M, A, why) {
  if (G.state === 'dead' || M.myEv || G.invuln > 0 || A.prot > 0 || game.mode !== 'playing') return;
  if (A.shield) { A.shield = 0; G.invuln = 1.2; floatText(G.x, G.y - 70, '🛡️ Schild!', '#bfefff', 24); Sfx.boing(); return; }
  floatText(G.x, G.y - 70, why === 'lava' ? 'Au, heet!' : 'Geraakt!', '#ffb0b0', 26);
  die();
}
// één gevaar bijwerken (en of het mij raakt); false = weg
function wavesHz(M, A, h, e, dt, alive) {
  const hit = (x, y, r) => alive && Math.hypot(G.x - x, G.y - y) < G_R + r;
  switch (h.k) {
    case 'coco': case 'meteor': {
      if (e < h.warn) return true;
      if (h.k === 'coco') { h.vy += 1400 * dt; h.y += h.vy * dt; if (hit(h.x, h.y, h.r)) wavesHit(M, A); return h.y < HAZARD_Y + 40; }
      const L = Math.hypot(h.tx - h.sx, h.ty - h.sy), f = (e - h.warn) * h.sp / L;
      h.x = h.sx + (h.tx - h.sx) * f; h.y = h.sy + (h.ty - h.sy) * f;
      if (hit(h.x, h.y, h.r)) wavesHit(M, A);
      if (f >= 1 && !h.boom) { h.boom = true; burst(h.x, HAZARD_Y - 10, 24, '#ff8a2a', 420, 6); shake(5, 0.3); }
      return f < 1.05;
    }
    case 'crush': {
      if (e < h.warn) return true;
      const k = e - h.warn, bottom = k < 0.35 ? -1250 + (1550 * k / 0.35) : k < 0.95 ? 300 : 300 - (k - 0.95) * 1500;
      h.bot = bottom;
      if (alive && Math.abs(G.x - h.x) < h.w / 2 + G_R * 0.6 && G.y < bottom + G_R * 0.6 && G.y > bottom - h.h - 900) wavesHit(M, A);
      return bottom > -1300;
    }
    case 'bomb': {
      if (e < h.fuse) return true;
      if (!h.boom) { h.boom = true; burst(h.x, h.y, 26, '#ffd23f', 420, 6); shake(5, 0.3); Sfx.crack(); if (alive && Math.hypot(G.x - h.x, G.y - h.y) < h.R) wavesHit(M, A); }
      return e < h.fuse + 0.4;
    }
    case 'wasp': {
      h.x += h.d * h.sp * dt;
      if (alive && Math.abs(G.x - h.x) < 34 && Math.abs(G.y - h.gy) > h.gh) wavesHit(M, A);
      return h.d > 0 ? h.x < A.x1 + 60 : h.x > A.x0 - 60;
    }
    case 'cannon': {
      if (e < h.warn) return true;
      h.x2 = (h.x2 == null ? h.x : h.x2) + h.d * h.sp * dt;
      if (hit(h.x2, h.y, h.r)) wavesHit(M, A);
      return h.x2 > A.x0 - 100 && h.x2 < A.x1 + 100;
    }
    case 'kiwi': case 'shark': {
      h.vy += (h.k === 'shark' ? 1100 : 1000) * dt; h.x += h.vx * dt; h.y += h.vy * dt;
      if (hit(h.x, h.y, h.r) && !h.done) {
        if (h.k === 'shark') wavesHit(M, A);
        else if (A.prot <= 0 && G.invuln <= 0) { h.done = true; if (G.state === 'hang') release(false); G.vx = Math.sign(h.vx) * 900; G.vy = -400; floatText(G.x, G.y - 60, '🦧 Kiwi!', '#ffb070', 24); Sfx.boing(); }
      }
      return h.y < HAZARD_Y + 80 && h.x > A.x0 - 200 && h.x < A.x1 + 200;
    }
    case 'geyser': {
      if (e < h.warn) return true;
      const k = e - h.warn, top = k < 0.3 ? HAZARD_Y - (HAZARD_Y - h.top) * k / 0.3 : k < 1.5 ? h.top : h.top + (k - 1.5) * 1400;
      h.cur = top;
      if (alive && Math.abs(G.x - h.x) < 42 && G.y > top) wavesHit(M, A);
      return top < HAZARD_Y;
    }
  }
  return false;
}
// een geest (wie af is) gooit een appel: van boven, op de plek waar je tikt
function wavesThrow(x) {
  const M = game.mp, A = M && M.ar;
  if (!A || M.mode !== 'waves' || !M.myEv || A.appleCd > 0 || game.mode !== 'playing') return false;
  A.appleCd = 5;
  x = clamp(Math.round(x), A.x0, A.x1);
  wavesApple(A, x, MP.myId);
  arenaSend({ k: 'apple', x });
  return true;
}
function wavesApple(A, x, own) { if (A.gapples) A.gapples.push({ x, y: CEIL_Y - 100, vy: 300, own }); }
function arenaPointer(e) {
  const M = game.mp;
  if (!M || M.mode !== 'waves' || !M.myEv) return false;
  const [sx] = toGame(e.clientX, e.clientY);
  wavesThrow(camX + sx / scale);
  return true;
}
function wavesDraw(M, A) {
  const t = M.t, F = A.fx;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // de wanden (krimpend) als een donkere mist
  for (const h of A.hz) {
    if (t < h.at) continue;
    const e = t - h.at;
    if ((h.k === 'coco' || h.k === 'meteor' || h.k === 'cannon' || h.k === 'crush' || h.k === 'geyser') && e < h.warn) { // waarschuwing
      const a = 0.25 + 0.25 * Math.sin(e * 20);
      ctx.fillStyle = `rgba(255,40,40,${a})`; ctx.strokeStyle = `rgba(255,60,60,${a + 0.2})`; ctx.lineWidth = 6;
      if (h.k === 'coco') ctx.fillRect(h.x - 14, camY - 20, 28, viewH + 40);
      else if (h.k === 'crush') ctx.fillRect(h.x - h.w / 2, camY - 20, h.w, viewH + 40);
      else if (h.k === 'geyser') { ctx.fillStyle = `rgba(200,240,255,${a + 0.3})`; for (let i = 0; i < 5; i++) circ(h.x + Math.sin(e * 9 + i * 2) * 26, HAZARD_Y - 6 - ((e * 90 + i * 17) % 40), 7); }
      else if (h.k === 'cannon') ctx.fillRect(h.d > 0 ? h.x : h.x - 2000, h.y - 10, 2000, 20);
      else line(h.sx, h.sy, h.tx, h.ty);
      continue;
    }
    if (h.k === 'coco') { ctx.fillStyle = '#6b4424'; circ(h.x, h.y, h.r); ctx.fillStyle = '#8a5a2e'; circ(h.x - 6, h.y - 6, h.r * 0.5); }
    else if (h.k === 'meteor') { ctx.fillStyle = 'rgba(255,140,40,.35)'; circ(h.x, h.y, h.r * 1.6); ctx.fillStyle = '#ff6a1a'; circ(h.x, h.y, h.r); ctx.fillStyle = '#ffd23f'; circ(h.x, h.y, h.r * 0.55); }
    else if (h.k === 'crush' && h.bot != null) { ctx.fillStyle = '#5b5f66'; ctx.fillRect(h.x - h.w / 2, h.bot - h.h, h.w, h.h); ctx.fillStyle = '#3c3f44'; ctx.fillRect(h.x - h.w / 2, h.bot - 14, h.w, 14); ctx.fillStyle = '#4a4d52'; ctx.fillRect(h.x - 16, h.bot - h.h - 1400, 32, 1400); }
    else if (h.k === 'bomb') { if (!h.boom) { ctx.font = '40px sans-serif'; ctx.globalAlpha = Math.sin(e * (6 + e * 8)) > 0 ? 1 : 0.55; ctx.fillText('🍌', h.x, h.y); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,60,60,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(h.x, h.y, h.R, 0, Math.PI * 2); ctx.stroke(); } else { ctx.fillStyle = 'rgba(255,210,63,.35)'; circ(h.x, h.y, h.R * (e - h.fuse) / 0.4); } }
    else if (h.k === 'wasp') { ctx.font = '26px sans-serif'; for (let y = CEIL_Y; y < HAZARD_Y; y += 46) if (Math.abs(y - h.gy) > h.gh) ctx.fillText('🐝', h.x + Math.sin(y * 0.1 + t * 12) * 10, y); }
    else if (h.k === 'cannon' && h.x2 != null) { ctx.fillStyle = '#222'; circ(h.x2, h.y, h.r); ctx.fillStyle = '#555'; circ(h.x2 - 6, h.y - 6, h.r * 0.4); }
    else if (h.k === 'kiwi') { ctx.font = '48px sans-serif'; ctx.fillText('🦧', h.x, h.y); }
    else if (h.k === 'shark') { ctx.font = '56px sans-serif'; ctx.save(); ctx.translate(h.x, h.y); if (h.vx < 0) ctx.scale(-1, 1); ctx.fillText('🦈', 0, 0); ctx.restore(); }
    else if (h.k === 'geyser' && h.cur != null) { const g = ctx.createLinearGradient(0, h.cur, 0, HAZARD_Y); g.addColorStop(0, 'rgba(230,248,255,.9)'); g.addColorStop(1, 'rgba(120,200,255,.7)'); ctx.fillStyle = g; ctx.fillRect(h.x - 34, h.cur, 68, HAZARD_Y - h.cur); ctx.fillStyle = '#fff'; circ(h.x, h.cur, 40); }
  }
  // lava
  if (A.lavaY < HAZARD_Y - 1) {
    const y = A.lavaY;
    ctx.fillStyle = 'rgba(255,90,20,.9)'; ctx.fillRect(camX - 20, y, viewW + 40, HAZARD_Y + 200 - y);
    ctx.fillStyle = '#ffb020'; for (let x = Math.floor(camX / 60) * 60; x < camX + viewW + 60; x += 60) circ(x + Math.sin(t * 3 + x) * 8, y + 4, 12);
  }
  // wind
  if (F.wind && t >= F.wind.at) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; for (let i = 0; i < 14; i++) { const x = camX + ((i * 197 + t * 900 * F.wind.d) % viewW + viewW) % viewW, y = camY + (i * 131) % viewH; line(x, y, x - F.wind.d * 90, y); } }
  // power-ups
  for (const p of A.pu) {
    if (!p.up) continue;
    const y = p.y + Math.sin(time * 2.6 + p.i) * 8;
    ctx.fillStyle = 'rgba(191,239,255,.3)'; circ(p.x, y, 36); ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, y, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '34px sans-serif'; ctx.fillText(WAVE_POW[p.k].icon, p.x, y + 2);
  }
  // appels van de geesten
  ctx.font = '30px sans-serif';
  for (const a of A.gapples) ctx.fillText('🍎', a.x, a.y);
  // mijn schild
  if (A.shield && G.state !== 'dead') { ctx.strokeStyle = `rgba(191,239,255,${0.6 + 0.3 * Math.sin(time * 5)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(G.x, G.y, 44, 0, Math.PI * 2); ctx.stroke(); }
}

// ---- tekenen (wereldcoördinaten), vanuit drawStorm in mp-online.js ----
function arenaDraw() {
  const M = game.mp, A = M.ar;
  // buiten de arena: donkere mist
  const y0 = camY - 30, y1 = camY + viewH + 30;
  let lo = A.x0, hi = A.x1;
  if (M.mode === 'waves' && A.fx.walls && M.t >= A.fx.walls.at) { const k = clamp((M.t - A.fx.walls.at) / 3, 0, 1) * clamp((A.fx.walls.at + WAVE_LEN - WAVE_ANN - M.t) / 1.2, 0, 1), inset = (A.x1 - A.x0) * 0.28 * k; lo += inset; hi -= inset; }
  ctx.fillStyle = 'rgba(20,14,34,.55)';
  if (M.mode !== 'ctf' && lo > camX) ctx.fillRect(camX - 30, y0, lo - camX + 30, y1 - y0);
  if (hi < camX + viewW) ctx.fillRect(hi, y0, camX + viewW + 30 - hi, y1 - y0);
  if (M.mode === 'king') kingDraw(M, A);
  else if (M.mode === 'ctf') ctfDraw(M, A);
  else wavesDraw(M, A);
}
// in beeldcoördinaten: scorebord, wave-aankondiging, donker
function arenaOverlay() {
  const M = game.mp, A = M.ar, u = 1 / scale;
  if (M.mode === 'waves' && A.fx.dark && M.t >= A.fx.dark.at && G.state !== 'dead') {
    const sx = G.x - camX, sy = G.y - camY, R = 260;
    const g = ctx.createRadialGradient(sx, sy, R * 0.55, sx, sy, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.94)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.textBaseline = 'middle'; ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,.6)';
  const txt = (s, x, y, size, col, align) => { ctx.font = `900 ${size * u}px Trebuchet MS, sans-serif`; ctx.textAlign = align || 'center'; ctx.fillStyle = col || '#fff'; ctx.strokeText(s, x, y); ctx.fillText(s, x, y); };
  if (M.mode === 'waves') {
    if (A.ann) { const a = clamp(Math.min(A.ann.t * 4, 2.4 - A.ann.t), 0, 1); ctx.globalAlpha = a; txt(A.ann.txt, viewW / 2, viewH * 0.3, 30, '#ffe46b'); ctx.globalAlpha = 1; }
    const bits = [A.shield ? '🛡️' : '', A.dbl ? '🪽'.repeat(A.dbl) : '', A.lives ? '❤️'.repeat(A.lives) : ''].join(' ').trim();
    if (bits && !M.myEv) txt(bits, viewW / 2, viewH - 36 * u, 24);
    if (M.myEv && game.mode === 'playing') txt(A.appleCd > 0 ? `👻 Je bent een geest · appel over ${Math.ceil(A.appleCd)} s` : '👻 Je bent een geest · tik om een appel te gooien', viewW / 2, viewH - 36 * u, 18);
    return;
  }
  if (M.mode === 'king') {
    const rows = [{ id: MP.myId, name: 'Jij' }].concat(opps(M).filter(P => !P.left).map(P => ({ id: P.id, name: P.name })))
      .map(r => Object.assign(r, { p: kingPts(A, r.id) })).sort((a, b) => b.p - a.p).slice(0, 6);
    rows.forEach((r, i) => txt(`${A.king === r.id ? '👑 ' : ''}${r.name} ${r.p}`, viewW - 16 * u, (120 + i * 24) * u, 16, r.id === MP.myId ? '#ffe46b' : '#fff', 'right'));
    return;
  }
  // Vlag: de score groot bovenin
  txt(`${A.sc[0]}`, viewW / 2 - 40 * u, 96 * u, 34, '#7fb8ff'); txt('–', viewW / 2, 96 * u, 30); txt(`${A.sc[1]}`, viewW / 2 + 40 * u, 96 * u, 34, '#ff8a80');
  if (ctfCarrying(A, MP.myId) >= 0) txt('🚩 Breng de vlag naar je basis!', viewW / 2, 132 * u, 18, '#ffe46b');
}
// de regel met info in de HUD
function arenaHud(M) {
  const A = M.ar, left = s => { const r = Math.max(0, Math.ceil(s)); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
  const el = A.el + (A.elAt && !A.end ? (performance.now() - A.elAt) / 1000 : 0);
  if (M.mode === 'king') return `👑 ${kingPts(A, MP.myId)} / ${KING_WIN} · ⏱ ${left(KING_TIME - el)}`;
  if (M.mode === 'ctf') return `${A.team ? '🔴 Rood' : '🔵 Blauw'} · ${A.sc[0]} – ${A.sc[1]} · ⏱ ${left(CTF_TIME - el)}`;
  return `🌊 Wave ${Math.max(1, A.wave)} · nog ${mpPlace(M)} van ${M.ids.length} over`;
}
// eindstand
function arenaRank(M, forfeit) {
  const A = M.ar, me = { id: MP.myId, name: myName(), col: '#e8322b', me: true, ev: M.myEv, left: !!forfeit, dist: run.dist, t: M.t };
  const rows = [me].concat(opps(M).map(P => ({ id: P.id, name: P.name, col: P.col, ev: P.ev, left: P.left, dist: P.dist, t: P.t })));
  if (M.mode === 'king') {
    for (const r of rows) { r.p = (A.sc && A.sc[r.id]) || 0; r.val = `👑 ${Math.floor(r.p)}`; }
    return rows.sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : 1));
  }
  if (M.mode === 'ctf') {
    const w = A.sc[0] === A.sc[1] ? -1 : A.sc[0] > A.sc[1] ? 0 : 1;
    for (const r of rows) { r.team = ctfTeam(M, r.id); r.col = CTF_COL[r.team]; r.p = (A.caps && A.caps[r.id]) || 0; r.val = `${r.team ? '🔴' : '🔵'} 🚩 ${r.p}`; }
    return rows.sort((a, b) => (b.team === w) - (a.team === w) || b.p - a.p || (a.id < b.id ? -1 : 1));
  }
  for (const r of rows) r.val = `🌊 wave ${Math.max(1, waveAt(r.ev ? r.ev.t : Math.max(r.t, M.t)))}`;
  const key = r => (!r.ev && !r.left ? [0, -r.t] : r.ev ? [1, -r.ev.t] : [2, -r.t]);
  return rows.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || (a.id < b.id ? -1 : 1); });
}
// titel en uitleg van de uitslag (null = gewoon op plek)
function arenaResult(M) {
  const A = M.ar;
  if (M.mode === 'ctf') {
    const w = A.sc[0] === A.sc[1] ? -1 : A.sc[0] > A.sc[1] ? 0 : 1;
    return { result: w === A.team ? 'win' : 'lose', title: w < 0 ? 'Gelijkspel' : w === A.team ? 'Gewonnen!' : 'Verloren', reason: w < 0 ? `Gelijkspel: ${A.sc[0]} – ${A.sc[1]}` : `${CTF_NAME[w]} wint met ${A.sc[0]} – ${A.sc[1]}.` };
  }
  const w = M.rank[0];
  if (M.mode === 'waves' && M.ids.length === 1) { const n = Math.max(1, waveAt(M.myEv ? M.myEv.t : M.t)); return { result: 'lose', title: `Wave ${n}!`, reason: `Je hield het vol tot wave ${n}.` }; } // alleen gespeeld
  if (M.mode === 'king') return { reason: `${w.me ? 'Jij was' : w.name + ' was'} het langst koning (${Math.floor(w.p)} punten).` };
  return { reason: `${w.me ? 'Jij hield' : w.name + ' hield'} het langst vol (wave ${Math.max(1, waveAt(w.ev ? w.ev.t : M.t))}).` };
}

// =====================================================================
//  Apen bij Overleven: blijven hangen, en springen naar een veiligere liaan als er gevaar aankomt
// =====================================================================
// hoe gevaarlijk is het (binnenkort) op plek x, y? 0 = veilig
function waveDanger(M, A, x, y) {
  const t = M.t;
  let d = 0;
  if (y > A.lavaY - 180 || (A.fx.lava && t > A.fx.lava.at - 0.5 && y > 60)) d++;
  for (const h of A.hz) {
    if (t < h.at - 0.5) continue;
    switch (h.k) {
      case 'coco': if (Math.abs(x - h.x) < 75 && (h.y == null || h.y < y + 40)) d++; break;
      case 'crush': if (Math.abs(x - h.x) < h.w / 2 + 60) d++; break;
      case 'geyser': if (Math.abs(x - h.x) < 95 && y > h.top - 60) d++; break;
      case 'cannon': if (Math.abs(y - h.y) < 75 && (h.x2 == null || (h.d > 0 ? h.x2 < x + 40 : h.x2 > x - 40))) d++; break;
      case 'bomb': if (!h.boom && Math.hypot(x - h.x, y - h.y) < h.R + 70) d++; break;
      case 'wasp': if ((h.d > 0 ? h.x < x + 30 && x - h.x < 550 : h.x > x - 30 && h.x - x < 550) && Math.abs(y - h.gy) > h.gh - 40) d++; break;
      case 'shark': case 'kiwi': if (h.x != null && Math.hypot(x - h.x, y - h.y) < 230) d++; break;
      case 'meteor': {
        const ex = h.tx - h.sx, ey = h.ty - h.sy, L2 = ex * ex + ey * ey, u = clamp(((x - h.sx) * ex + (y - h.sy) * ey) / L2, 0, 1);
        if (Math.hypot(x - h.sx - u * ex, y - h.sy - u * ey) < h.r + 90) d++;
        break;
      }
    }
  }
  return d;
}
function waveBotThink(ai) {
  const M = game.mp, A = M.ar, L = AI_LV[ai.lvl];
  if (!G || game.mode !== 'playing' || G.state === 'dead' || M.myEv) { if (input.down && game.mode === 'playing') aiSet(false); return; }
  ai.t = (ai.t || 0) + DT;
  if (G.state === 'stand') { aiSet(!input.down); return; }
  if (G.state === 'hang') {
    if (!input.down) { if (ai.t - (ai.relT || 0) > 0.05) aiSet(true); return; } // vasthouden
    if ((ai.k = (ai.k || 0) + 1) % 6) return;
    const here = waveDanger(M, A, G.x, G.y) + (G.vine && G.vine.rotW ? 1 : 0);
    if (!here) { ai.alarm = 0; ai.dir = 0; return; }
    if (!ai.alarm) ai.alarm = ai.t + L.react + (Math.random() < L.oops ? 0.5 : 0); // hoe goed de aap is: hoe snel hij reageert
    if (ai.t < ai.alarm) return;
    if (!ai.dir) { // de veiligste kant kiezen (liever niet tegen een wand aan)
      const side = s => waveDanger(M, A, G.x + s * 340, G.y) * 2 + waveDanger(M, A, G.x + s * 600, G.y) + (G.x + s * 340 < A.x0 + 80 || G.x + s * 340 > A.x1 - 80 ? 5 : 0);
      const l = side(-1), r = side(1);
      ai.dir = l < r ? -1 : r < l ? 1 : (G.x < (A.x0 + A.x1) / 2 ? 1 : -1);
    }
    // loslaten zodra de zwaai de goede kant op gaat
    if (G.vx * ai.dir > 260 && G.vy < 150) { aiSet(false); ai.relT = ai.t; ai.alarm = 0; ai.dir = 0; }
    return;
  }
  // in de lucht: grijpen als er een (niet rotte) liaan binnen bereik komt
  const R = gripR(0) + 20;
  let near = false;
  for (const v of vines) {
    if (!v.anchored || v.rotW || Math.abs(v.x - G.x) > 650 || (v === G.lastVine && G.releaseT > 0)) continue;
    const p = v.pts;
    for (let j = 2; j < p.length && !near; j += 2) { const dx = p[j].x - G.x, dy = p[j].y - G.y; near = dx * dx + dy * dy < R * R; }
    if (near) break;
  }
  aiSet(near);
}
