'use strict';
// Andy Apples · carrière
// De wereldkaart (een 3D-kaart per wereld, met levels als stippen en paden ertussen, zoals in New Super Mario
// Bros), de tussenfilmpjes (pad vult zich, volgende wereld), en wat er in een carrièrelevel extra gebeurt:
// tijdslimiet, uitdagingen, tijdelijke power-ups en baasgevechten. Levelgegevens staan in data.js (levelInfo).

// =====================================================================
//  In een level: tijd, uitdagingen, power-ups en de baas
// =====================================================================
const powOn = type => !!(game.career && run && run.pow && run.pow.type === type && run.pow.t > 0);
// bij de start van een carrièrelevel (na resetWorld)
function careerRunInit() {
  const C = game.career;
  run.timeLeft = C.time; run.hurry = false; run.pow = null; run.fail = null;
  run.hearts = C.boss ? 3 : 0; run.projs = [];
  run.boss = C.boss ? Object.assign({}, BOSSES[C.bi], { x: START_X + 1400, y: 0, t: 0, cd: 3, move: 0, warn: 0, dive: null, dead: false, hit: 0 }) : null;
}
// het level mislukt (tijd op, verslagen, te weinig appels): Andy valt, daarna het eindscherm met deze tekst
function careerFail(title, reason) {
  if (G.state === 'dead' || game.mode !== 'playing') return;
  run.fail = { title, reason };
  showBanner(title, reason);
  die();
}
// seconden in (ongeveer) echte tijd, ook als het tempo verandert
const realDt = dt => dt / (GAME_SPEED * Math.max(0.05, timeScale()));
function updateCareer(dt) {
  const C = game.career;
  if (!C || !run || run.timeLeft === undefined) return;
  const alive = G.state !== 'dead', rdt = realDt(dt);
  for (const p of pups) p.t += dt;
  if (game.mode !== 'playing' || !alive) return;
  // tijdslimiet
  run.timeLeft -= rdt;
  if (!run.hurry && run.timeLeft < 20) { run.hurry = true; showBanner('Schiet op!', 'Nog 20 seconden'); Sfx.arp(880, [0, 4, 7, 12], 0.07, 0.07); }
  if (run.timeLeft <= 0) { run.timeLeft = 0; careerFail('Tijd op!', 'Je haalde de finish niet op tijd.'); return; }
  // power-ups oppakken en aflopen
  for (let i = pups.length - 1; i >= 0; i--) {
    const p = pups[i];
    if (p.x < camX - 400) { pups.splice(i, 1); continue; }
    if (Math.hypot(G.x - p.x, G.y - p.y) < G_R + 44) { pups.splice(i, 1); givePow(p.type, p.x, p.y); }
  }
  if (run.pow && (run.pow.t -= rdt) <= 0) { floatText(G.x, G.y - 60, `${POWERUPS[run.pow.type].icon} op`, '#ffffff', 20); run.pow = null; }
  if (powOn('wings') && G.state === 'air' && G.vy > 260) G.vy = 260; // vleugels: rustig zweven
  if (powOn('star') && Math.random() < 0.5) addPart({ type: 'star', x: G.x + rand(-20, 20), y: G.y + rand(-20, 20), vx: rand(-40, 40), vy: rand(-60, 0), life: 0.4, max: 0.4, col: '#ffd23f', r: 3, rot: 0, vr: 6, g: 0 });
  // uitdaging: tegenwind
  if (C.ch.includes('wind') && G.state === 'air' && G.vx > 180) G.vx -= 200 * dt;
  if (run.boss) updateBoss(dt);
  updateProjs(dt);
}
function givePow(type, x, y) {
  const P = POWERUPS[type];
  starBurst(x, y, 16, P.col); Sfx.lootPick();
  floatText(x, y - 40, `${P.icon} ${P.name}!`, P.col, 24);
  if (type === 'clock') { run.timeLeft += 20; return; }
  run.pow = { type, t: P.dur, max: P.dur };
  if (type === 'turbo') { G.turboT = P.dur; if (G.state === 'air') { G.vx = Math.max(G.vx, 1300) + 500; G.vy = Math.min(G.vy, -200); } Sfx.turbo(); }
}
// geraakt door de baas of een projectiel
function careerHurt() {
  if (powOn('star') || G.invuln > 0 || G.state === 'dead') return;
  run.hearts--; G.invuln = 1.6;
  shake(8, 0.35); flashT = 0.25; Sfx.crack(); Sfx.whoa();
  floatText(G.x, G.y - 60, run.hearts > 0 ? `💔 nog ${run.hearts}` : '💔', '#ff8080', 26);
  if (run.hearts <= 0) careerFail('Verslagen!', `${run.boss ? run.boss.name : 'De baas'} was te sterk.`);
}
// ---- De baas: vliegt boven en vóór Andy en valt aan; jij moet alleen de finish halen ----
function updateBoss(dt) {
  const B = run.boss, C = game.career, w = C.bi;
  B.t += dt; B.hit = Math.max(0, B.hit - dt);
  if (B.dead) { B.y += 500 * dt; B.x += 200 * dt; return; }
  if (B.dive) { // duikaanval: eerst een waarschuwing, dan scheert hij van rechts naar links over die hoogte
    const D = B.dive;
    if (D.warn > 0) { D.warn -= dt; B.x += (camX + viewW + 160 - B.x) * Math.min(1, dt * 5); B.y += (D.y - B.y) * Math.min(1, dt * 4); }
    else {
      B.x += D.vx * dt; B.y += (D.y - B.y) * Math.min(1, dt * 6);
      if (Math.hypot(G.x - B.x, G.y - B.y) < 62) careerHurt();
      if (B.x < camX - 250) { B.dive = null; B.x = camX - 250; }
    }
    return;
  }
  // zweven: een eind vóór Andy, boven in beeld
  const tx = G.x + 480 + Math.sin(B.t * 0.8) * 90, ty = camY + viewH * 0.2 + Math.sin(B.t * 1.7) * 45;
  B.x += (tx - B.x) * Math.min(1, dt * 2.2); B.y += (ty - B.y) * Math.min(1, dt * 2.2);
  if (G.x > C.finishX - 200) return; // vlak voor de finish geeft hij het op
  B.cd -= dt;
  if (B.cd > 0 || G.state === 'dead') return;
  B.cd = Math.max(0.85, 2.7 - w * 0.17) * rand(0.8, 1.2);
  const mv = B.moves[B.move++ % B.moves.length];
  if (mv === 'throw') { // gooit naar waar Andy straks is
    const n = 1 + Math.floor(w / 4);
    for (let i = 0; i < n; i++) {
      const T = 1.05 + i * 0.18, tx2 = G.x + G.vx * T * 0.9 + rand(-60, 60), ty2 = G.y + G.vy * T * 0.4, g = 900;
      run.projs.push({ x: B.x, y: B.y + 20, vx: (tx2 - B.x) / T, vy: (ty2 - B.y) / T - 0.5 * g * T, g, r: 15, kind: B.proj, t: 0, delay: i * 0.12 });
    }
    Sfx.whoosh(0.3, 600, 1800, 0.08);
  } else if (mv === 'rain') { // laat van boven een regen vallen vóór Andy (met waarschuwingen)
    const n = 3 + Math.floor(w / 3);
    for (let i = 0; i < n; i++) run.projs.push({ x: G.x + 150 + i * 150 + Math.max(0, G.vx) * 0.55, y: camY - 60, vx: 0, vy: 120, g: 700, r: 15, kind: B.proj, t: 0, delay: 0.7 + i * 0.08, warn: true });
    Sfx.whoosh(0.5, 2000, 500, 0.08);
  } else { // dive
    B.dive = { warn: Math.max(0.55, 1.1 - w * 0.05), y: clamp(G.y + G.vy * 0.3, camY + 60, HAZARD_Y - 80), vx: -(1500 + w * 90) };
    Sfx.whoa();
  }
}
function updateProjs(dt) {
  const P = run.projs;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y > HAZARD_Y + 60 || p.x < camX - 400 || p.t > 6) { P.splice(i, 1); continue; }
    if ((G.state === 'hang' || G.state === 'air' || G.state === 'swim') && Math.hypot(G.x - p.x, G.y - p.y) < p.r + G_R * 0.8) { P.splice(i, 1); burst(p.x, p.y, 10, projCol(p.kind), 200, 4); careerHurt(); }
  }
}
// finish gehaald in een baaslevel
function bossDefeated() {
  const B = run.boss;
  if (!B || B.dead) return;
  B.dead = true; run.projs.length = 0;
  confetti(B.x, B.y, 80); burst(B.x, B.y, 30, B.col, 400, 7); shake(10, 0.5);
  floatText(G.x, G.y - 100, `${B.name} verslagen!`, '#ffe46b', 30);
  Sfx.cheer();
}
const PROJ_COL = { kokos: '#6b4423', angel: '#2a2a2a', bot: '#efe6d0', ijs: '#bfefff', vuur: '#ff7a1a', ster: '#fff27a', orb: '#7fe0c8', blok: '#8a6238', verf: '#00a2e8', kubus: '#ff4fb4', snoep: '#ff7eb9' };
const projCol = k => PROJ_COL[k] || '#ffffff';

// ---- tekenen in de wereld ----
function drawCareerWorld() {
  // power-ups: een zwevende bel met een icoon
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of pups) {
    if (p.x < camX - 80 || p.x > camX + viewW + 80 || p.y < camY - 80 || p.y > camY + viewH + 80) continue;
    const P = POWERUPS[p.type], y = p.y + Math.sin(p.t * 3) * 7;
    if (!Q.lite) { ctx.globalAlpha = 0.55; ctx.drawImage(glowSprite('255,255,255').c, p.x - 50, y - 50, 100, 100); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,.3)'; circ(p.x, y, 30);
    ctx.strokeStyle = P.col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, y, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ell(p.x - 10, y - 13, 7, 4, -0.5);
    ctx.font = '34px sans-serif'; ctx.fillText(P.icon, p.x, y + 2);
  }
  if (!run || !run.projs) return;
  // projectielen (en waarschuwingen waar een regen gaat vallen)
  for (const p of run.projs) {
    if (p.delay > 0) {
      if (p.warn) { ctx.strokeStyle = `rgba(255,60,60,${0.5 + 0.4 * Math.sin(time * 20)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, camY + 20); ctx.lineTo(p.x, camY + viewH); ctx.setLineDash([12, 12]); ctx.stroke(); ctx.setLineDash([]); }
      continue;
    }
    const c = projCol(p.kind);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 8);
    if (p.kind === 'vuur') { ctx.fillStyle = 'rgba(255,160,40,.4)'; circ(0, 0, p.r * 1.7); }
    ctx.fillStyle = shade(c, -0.35); circ(0, 0, p.r + 2); ctx.fillStyle = c; circ(0, 0, p.r);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; circ(-p.r * 0.35, -p.r * 0.35, p.r * 0.3);
    if (p.kind === 'kokos') { ctx.fillStyle = '#2e1c0e'; circ(-4, -2, 2.2); circ(3, -3, 2.2); circ(0, 4, 2.2); }
    ctx.restore();
  }
  const B = run.boss;
  if (!B) return;
  // waarschuwing voor een duikaanval: een rode baan over die hoogte
  if (B.dive && B.dive.warn > 0) {
    const a = 0.25 + 0.2 * Math.sin(time * 18);
    ctx.fillStyle = `rgba(255,40,40,${a})`; ctx.fillRect(camX, B.dive.y - 38, viewW, 76);
    ctx.font = '900 44px Trebuchet MS, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('!', camX + viewW - 40, B.dive.y);
  }
  drawBoss(B);
}
function drawBoss(B) {
  if (B.x < camX - 200 || B.x > camX + viewW + 260) return;
  const flap = Math.sin(B.t * 12) * 0.5, col = B.col, dk = shade(col, -0.35), lt = shade(col, 0.35);
  ctx.save(); ctx.translate(B.x, B.y); if (B.dead) ctx.rotate(B.t * 4);
  ctx.scale(-1, 1); // hij kijkt naar Andy (naar links)
  ctx.fillStyle = dk; // vleugels
  for (const sd of [-1, 1]) { ctx.save(); ctx.scale(1, 1); ctx.beginPath(); ctx.moveTo(-10, -10); ctx.quadraticCurveTo(-40, -70 - flap * 40 * sd, -95, -40 - flap * 30); ctx.quadraticCurveTo(-60, -10, -10, 5); ctx.fill(); ctx.restore(); ctx.scale(-1, 1); }
  ctx.fillStyle = '#140f18'; ell(0, 0, 58, 50);
  ctx.fillStyle = col; ell(0, 0, 55, 47);
  ctx.fillStyle = lt; ell(8, 14, 30, 24);
  // boze ogen en wenkbrauwen
  for (const ex of [-18, 12]) { ctx.fillStyle = '#fff'; ell(ex, -12, 12, 13); ctx.fillStyle = '#c00'; circ(ex - 4, -10, 6); ctx.fillStyle = '#000'; circ(ex - 5, -10, 3); }
  ctx.strokeStyle = '#140f18'; ctx.lineWidth = 5; ctx.lineCap = 'round'; line(-30, -30, -8, -22); line(24, -30, 2, -22);
  ctx.fillStyle = '#140f18'; ctx.beginPath(); ctx.moveTo(-26, 16); ctx.quadraticCurveTo(-8, 8, 10, 16); ctx.lineTo(8, 20); ctx.quadraticCurveTo(-8, 13, -24, 20); ctx.fill();
  ctx.fillStyle = '#fff'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-20 + k * 10, 15); ctx.lineTo(-16 + k * 10, 22); ctx.lineTo(-12 + k * 10, 14); ctx.fill(); }
  // kroon
  ctx.fillStyle = '#f5c518'; ctx.strokeStyle = '#8a6510'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-26, -40); ctx.lineTo(-30, -66); ctx.lineTo(-15, -52); ctx.lineTo(-2, -72); ctx.lineTo(10, -52); ctx.lineTo(26, -66); ctx.lineTo(22, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8322b'; circ(-2, -50, 4);
  ctx.restore();
}
// ---- HUD in beeld: tijd, harten, de baas, actieve power-up; en de mist-uitdaging ----
function drawCareerHud() {
  const C = game.career;
  if (!C || !run || run.timeLeft === undefined) return;
  const u = 1 / scale, W = viewW, H = viewH;
  if (C.ch.includes('fog')) { // mist: alleen rond Andy is het helder
    const sx = G.x - camX, sy = G.y - camY, r = Math.min(W, H) * 0.34;
    const g = ctx.createRadialGradient(sx, sy, r * 0.35, sx, sy, r * 1.25);
    g.addColorStop(0, 'rgba(210,215,225,0)'); g.addColorStop(1, 'rgba(210,215,225,.96)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // tijd (rood en knipperend in de laatste 20 seconden)
  const t = Math.max(0, Math.ceil(run.timeLeft)), low = run.timeLeft < 20;
  const tw = 128 * u, th = 36 * u, tx = W / 2 - tw / 2, ty = 12 * u;
  ctx.fillStyle = low ? `rgba(180,20,30,${0.65 + 0.25 * Math.sin(time * 10)})` : 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, ty, tw, th, th / 2) : ctx.rect(tx, ty, tw, th); ctx.fill();
  ctx.font = `900 ${22 * u}px Trebuchet MS, sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(`⏱ ${t}`, W / 2, ty + th / 2 + 1 * u);
  let y = ty + th + 8 * u;
  if (C.need) { // appeljacht
    const ok = run.picked >= C.need;
    ctx.font = `800 ${15 * u}px Trebuchet MS, sans-serif`; ctx.fillStyle = ok ? '#7dff8a' : '#ffffff';
    ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,.5)'; const s = `🍎 ${run.picked} / ${C.need}`; ctx.strokeText(s, W / 2, y + 8 * u); ctx.fillText(s, W / 2, y + 8 * u); y += 24 * u;
  }
  if (run.boss) { // baas: naam en jouw harten
    ctx.font = `900 ${16 * u}px Trebuchet MS, sans-serif`; ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    const s = `👑 ${run.boss.name}`; ctx.strokeText(s, W / 2, y + 9 * u); ctx.fillStyle = run.boss.dead ? '#7dff8a' : '#ffd6d6'; ctx.fillText(s, W / 2, y + 9 * u);
    ctx.font = `${22 * u}px sans-serif`; ctx.fillText([0, 1, 2].map(i => i < run.hearts ? '❤️' : '🖤').join(''), W / 2, y + 34 * u);
    y += 50 * u;
  }
  if (run.pow) { // actieve power-up met een balkje
    const P = POWERUPS[run.pow.type], k = clamp(run.pow.t / run.pow.max, 0, 1), bw = 120 * u;
    ctx.font = `800 ${15 * u}px Trebuchet MS, sans-serif`; ctx.fillStyle = '#fff'; ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(`${P.icon} ${P.name}`, W / 2, y + 8 * u); ctx.fillText(`${P.icon} ${P.name}`, W / 2, y + 8 * u);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(W / 2 - bw / 2, y + 20 * u, bw, 7 * u);
    ctx.fillStyle = P.col; ctx.fillRect(W / 2 - bw / 2, y + 20 * u, bw * k, 7 * u);
  }
}

// =====================================================================
//  De wereldkaart
//  Een schuine 3D-kaart per wereld: een eiland in de stijl van de biome, met het pad van de levels.
//  Wereldcoördinaten op de grond: x (links-rechts) en z (diepte, 0 = vooraan); zie mapProj.
// =====================================================================
const MAP = { w: 0, at: 1, startW: null, sel: 1, camX: 0, t: 0, walk: null, cine: null, cv: null, g: null, W: 0, H: 0, dpr: 1, hits: [], pop: {}, fill: null, open: false };
const MAP_GAP = 1400; // ruimte tussen twee eilanden (voor de overtocht naar de volgende wereld)
const worldOf = n => Math.min(WORLDS - 1, Math.floor((n - 1) / LEVELS_PER_WORLD));
// de plek van een knoop: i = -1 is het beginpunt, 0..4 de levels (4 = kasteel van de baas)
function mapNode(w, i) {
  const x = 60 + (i + 1) * 300, z = i < 0 ? 170 : 300 + Math.sin(i * 1.45 + w * 0.9) * 170;
  return { x: x + w * (6 * 300 + MAP_GAP), z };
}
const worldX0 = w => w * (6 * 300 + MAP_GAP);
// punten van het pad naar knoop i (vanaf de vorige), als zachte bocht
function mapSeg(w, i) {
  const a = mapNode(w, i - 1), b = mapNode(w, i), pts = [];
  const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2 + (i % 2 ? 90 : -90);
  for (let k = 0; k <= 16; k++) { const t = k / 16, u = 1 - t; pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, z: u * u * a.z + 2 * u * t * cz + t * t * b.z }); }
  return pts;
}
// schermpositie en schaal van een punt op de grond (h = hoogte boven de grond)
function mapProj(x, z, h = 0) {
  const D = 620, s = D / (D + z), K = MAP.K;
  const hy = MAP.H * 0.27, base = MAP.H * 0.9;
  return { x: MAP.W / 2 + (x - MAP.camX) * s * K, y: hy + (base - hy) * s - h * s * K, s: s * K };
}
// decoratie per wereld: bomen en struiken naast het pad (vast per wereld)
const mapDecoCache = new Map();
function mapDeco(w) {
  let D = mapDecoCache.get(w);
  if (D) return D;
  D = [];
  const rnd = mulberry32(w * 911 + 17), x0 = worldX0(w), segs = [];
  for (let i = 0; i < LEVELS_PER_WORLD; i++) segs.push(...mapSeg(w, i));
  for (let k = 0; k < 90 && D.length < 30; k++) {
    const x = x0 - 150 + rnd() * 1900, z = 80 + rnd() * 700;
    if (segs.some(p => Math.hypot(p.x - x, (p.z - z) * 1.3) < 95)) continue;
    // niet vlak vóór een stip of het kasteel (dan zou de boom hem verbergen)
    if ([-1, 0, 1, 2, 3, 4].some(i => { const N = mapNode(w, i); return Math.abs(N.x - x) < 120 && z < N.z && N.z - z < 260; })) continue;
    D.push({ x, z, kind: rnd() < 0.72 ? 'tree' : 'bush', v: (rnd() * 4) | 0, sc: 0.8 + rnd() * 0.5 });
  }
  mapDecoCache.set(w, D);
  return D;
}
function mapResize() {
  const cv = MAP.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
  MAP.W = cssW; MAP.H = cssH; MAP.dpr = dpr;
  const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  // hoe groot alles op de kaart is: op een staand scherm iets kleiner, zodat er genoeg van het pad in beeld is
  MAP.K = Math.min(cssH / 560, cssW / (cssW < cssH ? 520 : 900)) * 1.05;
}
// ---- tekenen ----
function drawMapWorld(g, w) {
  const B = BIOMES[w], c = B.c, x0 = worldX0(w);
  // eiland: bovenkant (ver weg) en onderkant (vooraan) met een golvende rand
  const far = [], near = [];
  for (let k = 0; k <= 24; k++) {
    const x = x0 - 260 + k * (2150 / 24);
    far.push(mapProj(x, 860 + Math.sin(k * 1.7 + w) * 40));
    near.push(mapProj(x, 30 + Math.sin(k * 2.3 + w * 2) * 25));
  }
  if (near[0].x > MAP.W + 200 || near[near.length - 1].x < -200) return false;
  const shape = () => { g.beginPath(); far.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); for (let i = near.length - 1; i >= 0; i--) g.lineTo(near[i].x, near[i].y); g.closePath(); };
  // klif vooraan (de "3D"-dikte van het eiland)
  g.fillStyle = shade(c.canopy, -0.55);
  g.beginPath(); near.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
  for (let i = near.length - 1; i >= 0; i--) g.lineTo(near[i].x, near[i].y + 46 * near[i].s); g.closePath(); g.fill();
  g.fillStyle = shade(c.canopy, -0.4); g.beginPath(); near.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
  for (let i = near.length - 1; i >= 0; i--) g.lineTo(near[i].x, near[i].y + 14 * near[i].s); g.closePath(); g.fill();
  // grond met strepen (zoals de kaart van Mario)
  g.save(); shape(); g.clip();
  const g1 = shade(c.canopy2, 0.1), g2 = shade(c.canopy2, -0.08);
  for (let z = 900, k = 0; z > 0; z -= 70, k++) {
    const a = mapProj(x0 - 400, z), b = mapProj(x0 - 400, z - 70);
    g.fillStyle = k % 2 ? g1 : g2; g.fillRect(-10, a.y, MAP.W + 20, b.y - a.y + 1);
  }
  g.restore();
  g.strokeStyle = shade(c.canopy, -0.3); g.lineWidth = 3; shape(); g.stroke();
  return true;
}
function drawMapPath(g, w, prog) {
  // prog: tot welk level het pad open is (met een fractie voor het vul-filmpje)
  for (let i = 0; i < LEVELS_PER_WORLD; i++) {
    const n = w * LEVELS_PER_WORLD + i + 1, pts = mapSeg(w, i).map(p => mapProj(p.x, p.z));
    const f = clamp(prog - (n - 1), 0, 1); // 0 = dicht, 1 = open
    // onderlaag: een vaag gestippeld pad
    g.setLineDash([6, 10]); g.strokeStyle = 'rgba(80,60,40,.45)'; g.lineCap = 'round';
    g.lineWidth = Math.max(3, 9 * pts[8].s); g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); g.setLineDash([]);
    if (f <= 0) continue;
    const last = Math.max(1, Math.round(f * (pts.length - 1)));
    for (const [col, wd] of [['#6b4423', 26], ['#d9a86a', 17]]) {
      g.strokeStyle = col; g.lineWidth = Math.max(4, wd * pts[8].s);
      g.beginPath(); for (let k = 0; k <= last; k++) k ? g.lineTo(pts[k].x, pts[k].y) : g.moveTo(pts[k].x, pts[k].y); g.stroke();
    }
    if (f < 1) { const p = pts[last]; g.fillStyle = '#fff6c0'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(p.x + rand(-10, 10) * p.s, p.y + rand(-10, 10) * p.s, rand(2, 5), 0, 6.3); g.fill(); } }
  }
}
function drawMapNode(g, w, i, prog) {
  const n = w * LEVELS_PER_WORLD + i + 1, N = mapNode(w, i), p = mapProj(N.x, N.z), s = p.s;
  const open = n <= Math.floor(prog + 1e-6), done = save.career.stars[n - 1] > 0 || n < save.career.unlocked;
  const pop = MAP.pop[n] ? Math.max(0, 1 - (MAP.t - MAP.pop[n]) / 0.5) : 0; // ploppen als hij net opengaat
  if (i === LEVELS_PER_WORLD - 1) { drawMapCastle(g, p, w, done, open); MAP.hits.push({ n, x: p.x, y: p.y - 60 * s, r: 70 * s }); return; }
  const rx = 30 * s * (1 + pop * 0.5), ry = 12 * s * (1 + pop * 0.5);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.x, p.y + 5 * s, rx * 1.05, ry * 1.05, 0, 0, 6.3); g.fill();
  g.fillStyle = '#b8860b'; g.beginPath(); g.ellipse(p.x, p.y + 2 * s, rx, ry, 0, 0, 6.3); g.fill();
  g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(p.x, p.y, rx, ry, 0, 0, 6.3); g.fill();
  g.fillStyle = !open ? '#2a2a30' : done ? '#2f7fe0' : '#e8322b';
  g.beginPath(); g.ellipse(p.x, p.y, rx * 0.72, ry * 0.72, 0, 0, 6.3); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(p.x - rx * 0.2, p.y - ry * 0.25, rx * 0.35, ry * 0.25, 0, 0, 6.3); g.fill();
  if (MAP.sel === n && !MAP.cine) { g.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(MAP.t * 5)})`; g.lineWidth = 3; g.beginPath(); g.ellipse(p.x, p.y, rx * 1.35, ry * 1.35, 0, 0, 6.3); g.stroke(); }
  // sterren boven een gehaald level
  const st = save.career.stars[n - 1];
  if (st) { g.font = `${Math.max(10, 13 * s)}px sans-serif`; g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.fillText('★'.repeat(st), p.x, p.y - 20 * s); }
  MAP.hits.push({ n, x: p.x, y: p.y, r: Math.max(26, 42 * s) });
}
function drawMapCastle(g, p, w, done, open) {
  const s = p.s, B = BOSSES[w], x = p.x, y = p.y, stone = '#c9c2b8', dk = '#8f877c';
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + 6 * s, 60 * s, 18 * s, 0, 0, 6.3); g.fill();
  const tower = (tx, w2, h, roof) => {
    g.fillStyle = dk; g.fillRect(tx - w2 / 2, y - h, w2, h);
    g.fillStyle = stone; g.fillRect(tx - w2 / 2, y - h, w2 * 0.7, h);
    for (let k = 0; k < 3; k++) { g.fillStyle = stone; g.fillRect(tx - w2 / 2 + k * w2 / 2.5, y - h - 8 * s, w2 / 4, 8 * s); }
    g.fillStyle = roof; g.beginPath(); g.moveTo(tx - w2 / 2 - 4 * s, y - h - 8 * s); g.lineTo(tx, y - h - 42 * s); g.lineTo(tx + w2 / 2 + 4 * s, y - h - 8 * s); g.fill();
  };
  tower(x - 34 * s, 26 * s, 62 * s, shade(B.col, -0.2)); tower(x + 34 * s, 26 * s, 62 * s, shade(B.col, -0.2)); tower(x, 38 * s, 92 * s, B.col);
  g.fillStyle = '#3a220f'; g.beginPath(); g.moveTo(x - 12 * s, y); g.lineTo(x - 12 * s, y - 24 * s); g.quadraticCurveTo(x, y - 36 * s, x + 12 * s, y - 24 * s); g.lineTo(x + 12 * s, y); g.fill();
  // vlag: van de baas, of (verslagen) die van Andy
  const fy = y - 134 * s, fx = x;
  g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, fy + 6 * s); g.lineTo(fx, fy - 26 * s); g.stroke();
  const wv = Math.sin(MAP.t * 6) * 3 * s;
  g.fillStyle = done ? '#e8322b' : '#222'; g.beginPath(); g.moveTo(fx, fy - 26 * s); g.lineTo(fx + 30 * s, fy - 20 * s + wv); g.lineTo(fx, fy - 12 * s); g.fill();
  g.font = `${Math.max(9, 11 * s)}px sans-serif`; g.textAlign = 'center'; g.fillText(done ? '🍎' : '👑', fx + 12 * s, fy - 17 * s);
  if (!open) { g.fillStyle = 'rgba(20,20,30,.35)'; g.fillRect(x - 50 * s, y - 140 * s, 100 * s, 140 * s); }
  if (MAP.sel === mapLevelAt(w, LEVELS_PER_WORLD - 1) && !MAP.cine) { g.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(MAP.t * 5)})`; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y + 4 * s, 64 * s, 20 * s, 0, 0, 6.3); g.stroke(); }
}
const mapLevelAt = (w, i) => w * LEVELS_PER_WORLD + i + 1;
function drawMapAndy(g, pos) {
  const p = mapProj(pos.x, pos.z, pos.h || 0), s0 = ctx, G0 = G, GC0 = GC;
  g.fillStyle = 'rgba(0,0,0,.28)'; const ps = mapProj(pos.x, pos.z); g.beginPath(); g.ellipse(ps.x, ps.y, 22 * ps.s, 8 * ps.s, 0, 0, 6.3); g.fill();
  ctx = g;
  const k = p.s * 0.9;
  g.save(); g.translate(p.x, p.y - 34 * k); g.scale(k, k);
  G = { x: 0, y: 0, state: MAP.walk ? 'air' : 'stand', standT: MAP.t, angle: 0, trickRot: 0, balloonT: 0, turboT: 0, invuln: 0, vx: MAP.walk ? 300 : 0, vy: MAP.walk ? -100 : 0, trick: null, diving: false };
  try { GC = myLook(); drawGorilla(); } finally { ctx = s0; G = G0; GC = GC0; g.restore(); }
}
function drawMapSky(g, w, blend) {
  const A = BIOMES[w].rgb, Bn = BIOMES[Math.min(WORLDS - 1, w + 1)].rgb, mix = k => rgbStr(mixC(A[k], Bn[k], blend));
  const hy = MAP.H * 0.27;
  const sky = g.createLinearGradient(0, 0, 0, hy + 40); sky.addColorStop(0, mix('skyTop')); sky.addColorStop(1, mix('skyBot'));
  g.fillStyle = sky; g.fillRect(0, 0, MAP.W, hy + 40);
  // zon en wolken
  g.fillStyle = rgbStr(mixC(A.sun, Bn.sun, blend), 0.9); g.beginPath(); g.arc(MAP.W * 0.82, hy * 0.35, Math.min(MAP.W, MAP.H) * 0.05, 0, 6.3); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (let k = 0; k < 6; k++) {
    const x = ((k * 330 + MAP.t * 12 - MAP.camX * 0.05) % (MAP.W + 300) + MAP.W + 300) % (MAP.W + 300) - 150, y = hy * (0.2 + (k % 3) * 0.18);
    g.beginPath(); g.ellipse(x, y, 60, 16, 0, 0, 6.3); g.ellipse(x + 30, y - 10, 34, 16, 0, 0, 6.3); g.fill();
  }
  // verre heuvels bij de horizon
  g.fillStyle = mix('far');
  g.beginPath(); g.moveTo(0, hy + 40);
  for (let x = 0; x <= MAP.W + 20; x += 20) g.lineTo(x, hy - 18 - (noise1((x + MAP.camX * 0.08) * 0.008 + w) * 50));
  g.lineTo(MAP.W, hy + 40); g.fill();
  // zee
  const sea = g.createLinearGradient(0, hy, 0, MAP.H); sea.addColorStop(0, mix('hazTop')); sea.addColorStop(1, mix('hazBot'));
  g.fillStyle = sea; g.fillRect(0, hy, MAP.W, MAP.H - hy);
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
  for (let k = 0; k < 14; k++) { const z = 60 + k * 70, y = mapProj(0, z).y, off = (MAP.t * 30 + k * 57) % 120; g.beginPath(); for (let x = -off; x < MAP.W; x += 120) { g.moveTo(x, y); g.quadraticCurveTo(x + 15, y - 4, x + 30, y); } g.stroke(); }
}
function mapFrame(dt) {
  if (!MAP.cv) return;
  MAP.t += dt;
  if (MAP.W !== cssW || MAP.H !== cssH) mapResize();
  mapUpdate(dt);
  const g = MAP.g;
  g.setTransform(MAP.dpr, 0, 0, MAP.dpr, 0, 0);
  // welke werelden zijn in beeld (tijdens een overtocht twee)
  const wf = MAP.camX / (6 * 300 + MAP_GAP), wa = clamp(Math.floor(wf - 0.1), 0, WORLDS - 1);
  const blend = clamp((MAP.camX - worldX0(wa) - 1900) / (MAP_GAP + 300), 0, 1);
  drawMapSky(g, wa, blend);
  MAP.hits = [];
  const prog = MAP.fill ? MAP.fill.from + (MAP.fill.to - MAP.fill.from) * MAP.fill.k : mapProg();
  for (const w of [wa, wa + 1]) {
    if (w >= WORLDS || w > worldOf(save.career.unlocked)) continue;
    if (!drawMapWorld(g, w)) continue;
    drawMapPath(g, w, prog);
    // alles op volgorde van diepte: ver weg eerst
    const items = mapDeco(w).map(d => ({ z: d.z, fn: () => {
      const p = mapProj(d.x, d.z);
      if (p.x < -120 || p.x > MAP.W + 120) return;
      if (d.kind === 'tree') { const sp = treeSprite(w, d.v), sc = p.s * 0.3 * d.sc; g.drawImage(sp.c, p.x - sp.w * sc / 2, p.y - sp.h * sc + 6 * p.s, sp.w * sc, sp.h * sc); }
      else { g.fillStyle = shade(BIOMES[w].c.canopy, -0.1); g.beginPath(); g.ellipse(p.x, p.y - 8 * p.s, 22 * p.s * d.sc, 14 * p.s * d.sc, 0, 0, 6.3); g.fill(); g.fillStyle = shade(BIOMES[w].c.canopy2, 0.1); g.beginPath(); g.ellipse(p.x - 6 * p.s, p.y - 13 * p.s, 10 * p.s, 7 * p.s, 0, 0, 6.3); g.fill(); }
    } }));
    for (let i = 0; i < LEVELS_PER_WORLD; i++) { const N = mapNode(w, i); items.push({ z: N.z + 0.1, fn: () => drawMapNode(g, w, i, prog) }); }
    const S = mapNode(w, -1); // beginpunt: een bordje
    items.push({ z: S.z, fn: () => { const p = mapProj(S.x, S.z); g.fillStyle = '#6b4423'; g.fillRect(p.x - 3 * p.s, p.y - 40 * p.s, 6 * p.s, 40 * p.s); g.fillStyle = '#a0703c'; g.fillRect(p.x - 26 * p.s, p.y - 46 * p.s, 52 * p.s, 20 * p.s); g.fillStyle = '#fff'; g.font = `900 ${Math.max(9, 12 * p.s)}px Trebuchet MS, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`W${w + 1}`, p.x, p.y - 36 * p.s); } });
    if ((MAP.walk ? MAP.walk.w : MAP.startW !== null ? MAP.startW : worldOf(Math.max(1, MAP.at))) === w) { const A = mapAndyPos(); items.push({ z: A.z - 0.2, fn: () => drawMapAndy(g, A) }); }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.fn();
  }
  drawMapCine(g);
}
// ---- Andy lopen, camera, filmpjes ----
function mapProg() { return Math.min(save.career.anim, save.career.unlocked); }
function mapAndyPos() {
  const W = MAP.walk;
  if (W) {
    const k = clamp(W.t / W.dur, 0, 1), f = k * (W.pts.length - 1), i = Math.min(W.pts.length - 2, Math.floor(f)), r = f - i;
    const a = W.pts[i], b = W.pts[i + 1];
    return { x: a.x + (b.x - a.x) * r, z: a.z + (b.z - a.z) * r, h: Math.abs(Math.sin(k * Math.PI * W.hops)) * 18 };
  }
  if (MAP.startW !== null) return mapNode(MAP.startW, -1); // op het beginpunt van een (nieuwe) wereld
  const n = MAP.at, w = worldOf(n);
  return n < 1 ? mapNode(0, -1) : mapNode(w, (n - 1) % LEVELS_PER_WORLD);
}
// laat Andy over het pad lopen van level a naar level b (binnen één wereld; a = 0 of het begin van de wereld = beginpunt)
function mapWalk(from, to, cb) {
  const w = worldOf(to), pts = [], dir = to >= from ? 1 : -1;
  if (dir > 0) { for (let n = from + 1; n <= to; n++) { const i = (n - 1) % LEVELS_PER_WORLD; if (worldOf(n) !== w) continue; pts.push(...mapSeg(w, i)); } }
  else { for (let n = from; n > to; n--) { const i = (n - 1) % LEVELS_PER_WORLD; pts.push(...mapSeg(w, i).reverse()); } }
  MAP.startW = null;
  if (pts.length < 2) { MAP.at = to; if (cb) cb(); return; }
  MAP.walk = { pts, t: 0, dur: 0.45 * Math.abs(to - from) + 0.3, hops: 3 * Math.abs(to - from), w, to, cb };
  Sfx.tick(1400, 0.08);
}
function mapUpdate(dt) {
  const W = MAP.walk;
  if (W && (W.t += dt) >= W.dur) { MAP.walk = null; MAP.at = W.to; MAP.sel = W.to; mapRenderUi(); if (W.cb) W.cb(); }
  if (MAP.fill) {
    const F = MAP.fill;
    F.k = Math.min(1, F.k + dt / F.dur);
    if (Math.random() < 0.4) Sfx.tick(1800 + F.k * 1200, 0.04);
    if (F.k >= 1) { MAP.fill = null; MAP.pop[F.to] = MAP.t; Sfx.bell(1046, 0.5, 0.12); Sfx.bell(1568, 0.6, 0.08, 0.1); if (F.cb) F.cb(); }
  }
  // camera volgt Andy (of het filmpje)
  const C = MAP.cine, A = mapAndyPos();
  const tx = C && C.camX !== undefined ? C.camX : A.x + 120;
  MAP.camX += (tx - MAP.camX) * Math.min(1, dt * (C && C.fast ? 1.4 : 3.2));
  if (C) { C.t += dt; if (C.t >= C.dur) { MAP.cine = null; if (C.cb) C.cb(); } } // de knoppen komen pas terug na het hele filmpje (finish)
}
function mapCine(o) { MAP.cine = Object.assign({ t: 0 }, o); mapUi(false); }
// grote tekst tijdens filmpjes
function drawMapCine(g) {
  const C = MAP.cine;
  if (!C || !C.title) return;
  const a = clamp(Math.min(C.t / 0.4, (C.dur - C.t) / 0.4), 0, 1), W = MAP.W, H = MAP.H;
  g.fillStyle = `rgba(0,0,0,${0.45 * a})`; g.fillRect(0, 0, W, H * 0.12 * a); g.fillRect(0, H - H * 0.12 * a, W, H * 0.12 * a);
  g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const fs = Math.min(64, W * 0.09);
  g.font = `900 ${fs * 0.36}px Trebuchet MS, sans-serif`; g.fillStyle = '#ffe46b'; g.fillText(C.sub || '', W / 2, H * 0.36);
  g.font = `900 ${fs}px Trebuchet MS, sans-serif`; g.lineWidth = fs * 0.14; g.strokeStyle = 'rgba(0,0,0,.6)';
  g.strokeText(C.title, W / 2, H * 0.46); g.fillStyle = '#fff'; g.fillText(C.title, W / 2, H * 0.46);
  g.globalAlpha = 1;
  if (C.confetti) for (let k = 0; k < 40; k++) {
    const x = (hash(k * 3.1) * W + C.t * 40 * (hash(k) - 0.5)) % W, y = ((hash(k * 7.7) * H * 0.5 + C.t * (120 + hash(k * 2) * 160)) % H);
    g.fillStyle = ['#ff5a5a', '#ffd23f', '#4ade80', '#60a5fa', '#f472b6'][k % 5]; g.fillRect(x, y, 7, 4);
  }
}
// Kaart openen: eventueel eerst de filmpjes (pad vullen, nieuwe wereld) afspelen
function openCareer() {
  if (!MAP.cv) { MAP.cv = $('mapCanvas'); MAP.g = MAP.cv.getContext('2d'); mapResize(); }
  const C = save.career, target = C.unlocked;
  MAP.walk = null; MAP.fill = null; MAP.cine = null; MAP.startW = null;
  MAP.at = clamp(C.at || 1, 1, target); if (C.anim < target && C.anim >= 1) MAP.at = C.anim;
  if (C.anim < 1) { MAP.at = 0; MAP.startW = 0; }
  MAP.sel = Math.max(1, MAP.at);
  MAP.camX = mapAndyPos().x + 120;
  showScreen('career');
  mapRenderUi();
  if (C.anim < target) setTimeout(() => mapPlayUnlock(C.anim, target), 350);
  else mapUi(true);
}
// het filmpje voor een net vrijgespeeld level (en eventueel de overtocht naar een nieuwe wereld)
function mapPlayUnlock(from, to) {
  mapUi(false);
  const wf = worldOf(Math.max(1, from)), wt = worldOf(to), fresh = from < 1;
  const finish = () => { save.career.anim = to; save.career.at = to; MAP.sel = to; persist(); mapRenderUi(); mapUi(true); };
  const fillAndWalk = () => {
    MAP.fill = { from: to - 1, to, k: 0, dur: 1.1, cb: () => mapWalk(MAP.at, to, finish) };
  };
  if (fresh || wt !== wf) {
    const B = BIOMES[wt], start = mapNode(wt, -1);
    const intro = () => {
      MAP.at = mapLevelAt(wt, 0) - 1; MAP.startW = wt; // op het beginpunt van de nieuwe wereld
      MAP.walk = null;
      mapCine({ dur: 2.2, camX: start.x + 400, title: `${B.icon} ${B.name}`, sub: `WERELD ${wt + 1}`, cb: fillAndWalk });
      Sfx.biome(wt);
    };
    if (fresh) { MAP.camX = start.x + 400; intro(); return; }
    // wereld voltooid: feest bij het kasteel, dan over zee naar het volgende eiland
    mapCine({ dur: 2.1, title: `Wereld ${wf + 1} voltooid!`, sub: `${BOSSES[wf].name} is verslagen`, confetti: true, cb: () => {
      mapCine({ dur: 2.4, camX: start.x + 200, fast: true, cb: intro });
    } });
    Sfx.cheer(); Sfx.arp(523, [0, 4, 7, 12, 16], 0.09, 0.1);
    return;
  }
  fillAndWalk();
}
function mapUi(on) { $('career').classList.toggle('cine', !on); }
// de kaartjes en knoppen onder/boven de kaart
function mapRenderUi() {
  const n = Math.max(1, MAP.sel), I = levelInfo(n), w = I.bi, st = save.career.stars;
  $('mapWorld').textContent = `${BIOMES[w].icon} ${BIOMES[w].name}`;
  $('mapLevel').textContent = I.boss ? `Wereld ${w + 1} · Baas` : `Wereld ${w + 1}-${I.idx + 1}`;
  $('carStars').textContent = st.reduce((a, b) => a + b, 0) + ' / ' + LEVELS * 3;
  const lines = [];
  if (I.boss) lines.push(`👑 <b>Baasgevecht: ${BOSSES[w].name}</b> · ontwijk zijn aanvallen (3 ❤️) en haal de finish`);
  for (const c of I.ch) lines.push(`${CHALLENGES[c].icon} <b>${CHALLENGES[c].name}</b> · ${CHALLENGES[c].info(I.need)}`);
  if (!lines.length) lines.push('Haal de finish op tijd');
  $('mapInfo').innerHTML = `<div class="mc-top"><span>${[0, 1, 2].map(i => i < st[n - 1] ? '★' : '☆').join('')}</span><span>📏 ${I.L} m · ⏱ ${I.time} s</span></div>` + lines.map(l => `<div class="mc-ch">${l}</div>`).join('');
  $('btnMapPrev').disabled = n <= 1; $('btnMapNext').disabled = n >= save.career.unlocked;
  const wu = worldOf(save.career.unlocked);
  document.querySelector('.map-wsel').classList.toggle('hidden', wu < 1);
  $('btnMapPrevW').disabled = w <= 0; $('btnMapNextW').disabled = w >= wu;
}
// naar een ander level op de kaart lopen
function mapGo(n) {
  if (MAP.cine || MAP.fill) return;
  n = clamp(n, 1, save.career.unlocked);
  if (MAP.walk) return;
  const cur = Math.max(1, MAP.at);
  MAP.sel = n; mapRenderUi();
  if (worldOf(n) !== worldOf(cur)) { MAP.at = n; MAP.startW = null; MAP.camX = mapAndyPos().x + 120; save.career.at = n; return; } // andere wereld: er meteen heen
  mapWalk(cur, n, () => { save.career.at = n; });
}
function mapPlay() {
  if (MAP.cine || MAP.fill || MAP.walk) return;
  const n = Math.max(1, MAP.sel);
  if (n > save.career.unlocked) return;
  save.career.at = n; persist();
  Sfx.init(); startReady(n);
}
// tik op de kaart: naar dat level lopen, of (als Andy er al staat) spelen
function mapTap(cx, cy) {
  if (MAP.cine) { MAP.cine.t = Math.max(MAP.cine.t, MAP.cine.dur - 0.3); return; } // filmpje overslaan
  let best = null, bd = Infinity;
  for (const h of MAP.hits) { const d = Math.hypot(h.x - cx, h.y - cy); if (d < h.r && d < bd) { bd = d; best = h; } }
  if (!best || best.n > save.career.unlocked) return;
  if (best.n === MAP.at && !MAP.walk) mapPlay(); else mapGo(best.n);
}
function careerInit() {
  on('btnMapPrev', () => mapGo(MAP.sel - 1));
  on('btnMapNext', () => mapGo(MAP.sel + 1));
  on('btnMapPlay', mapPlay);
  const wj = d => { const w = clamp(worldOf(Math.max(1, MAP.sel)) + d, 0, worldOf(save.career.unlocked)); mapGo(Math.min(save.career.unlocked, mapLevelAt(w, 0))); };
  on('btnMapPrevW', () => wj(-1));
  on('btnMapNextW', () => wj(1));
  $('mapCanvas').addEventListener('pointerdown', e => { e.preventDefault(); Sfx.init(); const [x, y] = toGame(e.clientX, e.clientY); mapTap(x, y); });
}
// toetsen op de kaart (vanuit de algemene toetsenafhandeling in game.js)
function mapKey(code) {
  if (code === 'ArrowLeft' || code === 'KeyA') mapGo(MAP.sel - 1);
  else if (code === 'ArrowRight' || code === 'KeyD') mapGo(MAP.sel + 1);
  else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { if (MAP.cine) mapTap(0, 0); else mapPlay(); }
  else return false;
  return true;
}
