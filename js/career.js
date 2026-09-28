'use strict';
// Andy Apples · carrière
// Wat er in een carrièrelevel extra gebeurt: tijdslimiet, uitdagingen, tijdelijke power-ups en baasgevechten.
// Levelgegevens staan in data.js (levelInfo); de wereldkaart staat in worldmap.js.

// =====================================================================
//  In een level: tijd, uitdagingen, power-ups en de baas
// =====================================================================
const powOn = type => !!(game.career && run && run.pow && run.pow.type === type && run.pow.t > 0);
// bij de start van een carrièrelevel (na resetWorld)
function careerRunInit() {
  const C = game.career;
  run.timeLeft = C.time; run.hurry = false; run.pow = null; run.fail = null;
  run.hearts = C.boss ? (C.up > 0.66 ? 2 : 3) : 0; run.projs = [];
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
  B.cd = Math.max(0.7, (2.7 - w * 0.17) * (1 - 0.3 * C.up)) * rand(0.8, 1.2); // sterkere Andy = snellere baas
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
