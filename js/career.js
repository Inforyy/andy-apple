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
  run.timeLeft -= rdt * (powOn('slow') ? SLOWMO : 1); // in slowmotion loopt de klok ook trager
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
  if (powOn('slow') && Math.random() < 0.35) addPart({ type: 'ring', x: G.x, y: G.y, vx: 0, vy: 0, life: 0.5, max: 0.5, col: 'rgba(184,164,255,.5)', r: 14, grow: 60, g: 0 }); // slowmotion: golfjes om Andy
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
  if (type === 'slow') { Sfx.whoosh(0.9, 1400, 180, 0.12); flashT = 0.2; }
  if (type === 'turbo') { G.turboT = P.dur; if (G.state === 'air') { G.vx = Math.max(G.vx, 1300) + 500; G.vy = Math.min(G.vy, -200); } Sfx.turbo(); }
}
// geraakt door de baas of een projectiel. knock: de klap slaat Andy van zijn liaan af (bazen doen dat altijd)
function careerHurt(knock = true, fx = 0) {
  if (powOn('star') || G.invuln > 0 || G.state === 'dead') return;
  run.hearts--; G.invuln = 1.6;
  shake(8, 0.35); flashT = 0.25; Sfx.crack(); Sfx.whoa();
  floatText(G.x, G.y - 60, run.hearts > 0 ? `💔 nog ${run.hearts}` : '💔', '#ff8080', 26);
  if (knock && G.state === 'hang') { release(false); G.vx = G.vx * 0.3 + fx; G.vy = Math.min(G.vy, 0) - 380; floatText(G.x, G.y - 95, 'Eraf geschoten!', '#ffb0b0', 22); }
  else if (knock && G.state === 'air') { G.vx = G.vx * 0.5 + fx; G.vy = Math.min(G.vy, 0) - 220; }
  if (run.hearts <= 0) careerFail('Verslagen!', `${run.boss ? run.boss.name : 'De baas'} was te sterk.`);
}
// ---- De baas: volgt Andy (soms vóór, soms achter hem) en valt aan; jij moet alleen de finish halen ----
// Aanvallen: throw (gooit naar waar Andy straks is), rain (regen van boven), dive (scheert over een hoogte),
// en bij elke baas: snipe (richt een laser en schiet je van je liaan), cut (schiet de liaan kapot waar je aan hangt
// of waar je naartoe vliegt) en vanaf wereld 3 chase (jaagt je een tijdje achterna). Halverwege wordt hij woedend.
function bossMoves(B, w) {
  const extra = ['snipe', 'cut'].concat(w >= 2 ? ['chase'] : []), out = [];
  for (let i = 0; i < Math.max(B.moves.length, extra.length); i++) { if (B.moves[i]) out.push(B.moves[i]); if (extra[i]) out.push(extra[i]); }
  return out;
}
// een liaan kapot schieten (ook als Andy er niet aan hangt)
function cutVine(v) {
  if (!v || !v.anchored) return;
  if (v === G.vine && G.state === 'hang') { snapVine(v); return; }
  v.anchored = false; v.pts[0].im = 1;
  const q = v.pts[1];
  for (let i = 0; i < 12; i++) addPart({ type: 'leaf', x: q.x, y: q.y, vx: rand(-200, 200), vy: rand(-250, 50), life: rand(0.6, 1), max: 1, col: i % 2 ? '#4f8f2a' : '#9a7a4a', r: rand(3, 5), rot: rand(0, 6), vr: rand(-10, 10) });
  Sfx.crack();
}
// de liaan die de baas kapot wil schieten: die van Andy, of anders die waar hij het dichtst bij komt
function cutTarget() {
  if (G.state === 'hang' && G.vine && G.vine.anchored) return G.vine;
  let best = null, bd = 1e9;
  const px = G.x + Math.max(0, G.vx) * 0.45, py = G.y + G.vy * 0.3;
  for (const v of vines) {
    if (!v.anchored || v.jet || v.balloon || v.x < G.x + 60 || v.x > G.x + 900) continue;
    const q = v.pts[v.pts.length - 1], d = Math.hypot(q.x - px, q.y - py);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function updateBoss(dt) {
  const B = run.boss, C = game.career, w = C.bi;
  B.t += dt; B.hit = Math.max(0, B.hit - dt);
  if (B.dead) { B.y += 500 * dt; B.x += 200 * dt; return; }
  if (!B.all) { B.all = bossMoves(B, w); B.side = 1; B.sideT = 4; }
  // halverwege het level: woedend (sneller, vaker en harder)
  if (!B.rage && G.x > START_X + (C.finishX - START_X) * 0.5) { B.rage = true; showBanner(`${B.name} is woedend!`, 'Hij valt nu veel vaker aan'); shake(6, 0.5); Sfx.whoa(); }
  if (B.dive) { // duikaanval: eerst een waarschuwing, dan scheert hij van rechts naar links over die hoogte
    const D = B.dive;
    if (D.warn > 0) { D.warn -= dt; B.x += (camX + viewW + 160 - B.x) * Math.min(1, dt * 5); B.y += (D.y - B.y) * Math.min(1, dt * 4); }
    else {
      B.x += D.vx * dt; B.y += (D.y - B.y) * Math.min(1, dt * 6);
      if (Math.hypot(G.x - B.x, G.y - B.y) < 62) careerHurt(true, -250);
      if (B.x < camX - 250) { B.dive = null; B.x = camX - 250; }
    }
    return;
  }
  if (B.chase) { // achtervolging: eerst krijsen en rood worden, dan gaat hij recht op Andy af (en houdt hij zijn tempo bij)
    const H = B.chase;
    H.t -= dt;
    if (H.wind > 0) { H.wind -= dt; B.x += (G.x + 380 * B.side - B.x) * Math.min(1, dt * 3); B.y += (G.y - 200 - B.y) * Math.min(1, dt * 3); }
    else {
      const dx = G.x - B.x, dy = G.y - B.y, d = Math.hypot(dx, dy) || 1, sp = H.sp;
      B.x += (G.vx + dx / d * sp) * dt; B.y += (G.vy * 0.8 + dy / d * sp) * dt;
      if (Math.random() < 0.5) addPart({ x: B.x + rand(-30, 30), y: B.y + rand(-30, 30), vx: 0, vy: 0, life: 0.35, max: 0.35, col: 'rgba(255,60,40,.7)', r: rand(4, 8), g: 0 });
      if (d < 64) { careerHurt(true, Math.sign(dx) * 400); H.t = 0; }
    }
    if (H.t <= 0) { B.chase = null; B.cd = 1; }
    return;
  }
  // zweven: hij volgt Andy, afwisselend vóór en achter hem, op zijn hoogte (maar altijd in beeld)
  if ((B.sideT -= dt) <= 0) { B.side = B.side > 0 ? -1 : 1; B.sideT = B.side > 0 ? rand(4, 6) : rand(2.5, 4); }
  const tx = clamp(G.x + (B.side > 0 ? 460 : -340) + Math.sin(B.t * 0.8) * 70, camX + 90, camX + viewW - 90);
  const ty = clamp(G.y - 230 + Math.sin(B.t * 1.7) * 45, camY + 70, camY + viewH * 0.7);
  const fk = Math.min(1, dt * (B.aim ? 1.2 : 2.6));
  B.x += (tx - B.x) * fk; B.y += (ty - B.y) * fk;
  if (B.aim) { // richten met een laser; daarna een snel schot recht op Andy af
    const A = B.aim;
    A.t -= dt; A.lx = G.x + G.vx * 0.12; A.ly = G.y + G.vy * 0.12;
    if (A.t <= 0) {
      B.aim = null;
      const n = w >= 6 ? 3 : w >= 3 ? 2 : 1, sp = 1500 + w * 45, ang = Math.atan2(A.ly - B.y, A.lx - B.x);
      for (let i = 0; i < n; i++) { const a = ang + (i - (n - 1) / 2) * 0.13; run.projs.push({ x: B.x, y: B.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, r: 13, kind: B.proj, t: 0, delay: i * 0.05, shot: true }); }
      Sfx.whoosh(0.2, 2400, 700, 0.1); shake(3, 0.15);
    }
    return;
  }
  if (G.x > C.finishX - 200) return; // vlak voor de finish geeft hij het op
  B.cd -= dt;
  if (B.cd > 0 || G.state === 'dead') return;
  B.cd = Math.max(0.5, (2.2 - w * 0.12) * (1 - 0.3 * C.up)) * rand(0.8, 1.2) * (B.rage ? 0.62 : 1); // sterkere Andy = snellere baas
  let mv = B.all[B.move++ % B.all.length];
  if (G.state === 'hang' && Math.random() < 0.35) mv = Math.random() < 0.5 ? 'snipe' : 'cut'; // hangt hij stil? schiet hem eraf!
  if (mv === 'throw') { // gooit naar waar Andy straks is
    const n = 1 + Math.floor(w / 3) + (B.rage ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const T = 0.9 + i * 0.16, tx2 = G.x + G.vx * T * 0.9 + rand(-60, 60), ty2 = G.y + G.vy * T * 0.4, g = 900;
      run.projs.push({ x: B.x, y: B.y + 20, vx: (tx2 - B.x) / T, vy: (ty2 - B.y) / T - 0.5 * g * T, g, r: 15, kind: B.proj, t: 0, delay: i * 0.12 });
    }
    Sfx.whoosh(0.3, 600, 1800, 0.08);
  } else if (mv === 'rain') { // laat van boven een regen vallen vóór Andy (met waarschuwingen)
    const n = 4 + Math.floor(w / 2) + (B.rage ? 2 : 0);
    for (let i = 0; i < n; i++) run.projs.push({ x: G.x + 60 + i * 130 + Math.max(0, G.vx) * 0.55, y: camY - 60, vx: 0, vy: 160, g: 800, r: 15, kind: B.proj, t: 0, delay: 0.6 + i * 0.07, warn: true });
    Sfx.whoosh(0.5, 2000, 500, 0.08);
  } else if (mv === 'snipe') {
    B.aim = { t: Math.max(0.5, 0.95 - w * 0.03) * (B.rage ? 0.8 : 1), lx: G.x, ly: G.y };
    Sfx.tick(2400, 0.08);
  } else if (mv === 'cut') { // een projectiel dat op een liaan af gaat en hem doorknipt
    const v = cutTarget();
    if (!v) { B.cd = 0.2; return; }
    const q = v.pts[Math.min(3, v.pts.length - 1)];
    run.projs.push({ x: B.x, y: B.y, vx: 0, vy: 0, g: 0, r: 12, kind: B.proj, t: 0, delay: 0.55, cut: v, cx: q.x, cy: q.y, mark: true });
    Sfx.whoosh(0.4, 900, 2600, 0.08);
  } else if (mv === 'chase') {
    B.chase = { t: 1.8 + w * 0.06 + (B.rage ? 0.6 : 0), wind: 0.6, sp: 300 + w * 22 };
    Sfx.whoa(); shake(4, 0.3);
  } else { // dive
    B.dive = { warn: Math.max(0.5, 1.0 - w * 0.05), y: clamp(G.y + G.vy * 0.3, camY + 60, HAZARD_Y - 80), vx: -(1600 + w * 100) };
    Sfx.whoa();
  }
}
function updateProjs(dt) {
  const P = run.projs;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    if (p.delay > 0) { p.delay -= dt; if (p.cut) { p.x = run.boss ? run.boss.x : p.x; p.y = run.boss ? run.boss.y : p.y; } continue; }
    if (p.cut) { // naar het ophangpunt van de liaan (dat beweegt mee), en daar knippen
      const q = p.cut.pts[Math.min(3, p.cut.pts.length - 1)], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      p.cx = q.x; p.cy = q.y;
      if (d < 26 || !p.cut.anchored) { if (p.cut.anchored) { cutVine(p.cut); burst(q.x, q.y, 12, projCol(p.kind), 260, 4); } P.splice(i, 1); continue; }
      p.vx = dx / d * 1700; p.vy = dy / d * 1700;
    }
    p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y > HAZARD_Y + 60 || p.x < camX - 600 || p.x > camX + viewW + 900 || p.t > 6) { P.splice(i, 1); continue; }
    if ((G.state === 'hang' || G.state === 'air' || G.state === 'swim') && Math.hypot(G.x - p.x, G.y - p.y) < p.r + G_R * 0.8) { P.splice(i, 1); burst(p.x, p.y, 10, projCol(p.kind), 200, 4); careerHurt(true, Math.sign(p.vx) * 300); }
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
const PROJ_COL = { zand: '#e0b070', spore: '#d08aff', bliksem: '#fff27a', glitch: '#00e5ff', kokos: '#6b4423', angel: '#2a2a2a', bot: '#efe6d0', ijs: '#bfefff', vuur: '#ff7a1a', ster: '#fff27a', orb: '#7fe0c8', blok: '#8a6238', verf: '#00a2e8', kubus: '#ff4fb4', snoep: '#ff7eb9' };
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
  // doelwit van een knip-schot: een knipperend vizier op de liaan
  for (const p of run.projs) if (p.mark) {
    const a = 0.55 + 0.4 * Math.sin(time * 22);
    ctx.strokeStyle = `rgba(255,50,50,${a})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.cx, p.cy, 22, 0, Math.PI * 2); ctx.stroke();
    line(p.cx - 32, p.cy, p.cx + 32, p.cy); line(p.cx, p.cy - 32, p.cx, p.cy + 32);
  }
  // richtlaser (snipe): wordt dikker en feller vlak voor het schot
  if (B.aim) {
    const k = clamp(1 - B.aim.t / 0.9, 0, 1);
    ctx.strokeStyle = `rgba(255,30,30,${0.35 + 0.55 * k})`; ctx.lineWidth = 2 + 4 * k; ctx.setLineDash([18, 10]);
    line(B.x, B.y, B.aim.lx, B.aim.ly); ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(255,30,30,${0.6 + 0.4 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(B.aim.lx, B.aim.ly, 30 - 12 * k, 0, Math.PI * 2); ctx.stroke();
  }
  // woedend of op jacht: een rode gloed om de baas
  if (B.rage || B.chase) { ctx.fillStyle = `rgba(255,40,20,${B.chase ? 0.35 + 0.2 * Math.sin(time * 25) : 0.18})`; circ(B.x, B.y, 82 + Math.sin(time * 9) * 6); }
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
  if (G.x < B.x) ctx.scale(-1, 1); // hij kijkt naar Andy
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
  if (powOn('slow')) { // slowmotion: paarsige randen en een tikkende klok
    const k = Math.min(1, run.pow.t / 0.6, (run.pow.max - run.pow.t) / 0.4), g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(120,90,220,0)'); g.addColorStop(1, `rgba(90,60,200,${0.42 * clamp(k, 0, 1)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
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
