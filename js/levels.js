'use strict';
// Andy Apples · bijzondere carrièrelevels
// - De toren (level 4 van elke wereld): klim langs lianen omhoog in een 3D-cilindertoren. De toren en het landschap
//   eromheen zijn 3D en draaien mee als je om de toren heen klimt; het spelen zelf blijft 2D. Onderweg vallen er
//   potten, stenen en tonnen naar beneden. Stenen ringen om de toren vangen je op als je valt.
// - Het kasteel (het baaslevel): een kasteelzaal boven een lavameer, met kettingen in plaats van lianen, zwaaiende
//   bijlen, lavageisers, pletblokken en punten aan het plafond. De baas valt ondertussen gewoon aan (career.js).
// - Modifiers (MODS in data.js): zware Andy, maanzwaartekracht, reuzen- en mini-Andy, stuiterwater en hyperspeed.

const towerOn = () => !!(game.career && game.career.tower && run && run.tower);
const castleOn = () => !!(game.career && game.career.boss);
const levelMod = () => (game.career && game.career.mod ? MODS[game.career.mod] : null);
const modGrav = () => { const M = levelMod(); return (M && M.grav) || 1; };
const modSize = () => { const M = levelMod(); return (M && M.size) || 1; };
const modGrip = () => { const M = levelMod(); return ((M && M.grip) || 1) * (towerOn() ? 1.6 : 1); }; // in de toren grijp je wat makkelijker
const modTempo = () => { const M = levelMod(); return (M && M.tempo) || 1; };

// =====================================================================
//  De toren
// =====================================================================
const TW_G = ROCK.top; // de grond rond de toren (even hoog als de startrots)
// per verdieping drie lianen: [x vanaf het begin van de verdieping, hoogte van het ophangpunt boven de ring, lengte]
const TW_STEPS = [[430, 560, 360], [830, 770, 360], [1230, 960, 330]];
const TW_DX = 1350; // hoeveel verder de volgende verdieping begint (het pad draait zo om de toren heen)
function towerBuild() {
  const C = game.career, n = C.layers, w = C.bi;
  const T = { rings: [], n, top: TW_G - n * TOWER_RING, drops: [], dropT: 3, goalX: 0 };
  for (let i = 0; i <= n; i++) T.rings.push(TW_G - i * TOWER_RING);
  vines = []; apples = []; shrooms = []; foes = []; tramps = []; portals = []; loot = []; pups = [];
  let x = 250;
  for (let i = 0; i < n; i++) {
    const yb = T.rings[i];
    TW_STEPS.forEach(([dx, dy, len], k) => {
      // latere werelden: af en toe een rotte (brekende) of elastieken liaan
      let type = 'normal';
      const r = genRandom();
      if (w >= 2 && i > 0 && k === 1 && r < 0.18 + 0.02 * w) type = 'rotten';
      else if (w >= 1 && r > 0.88) type = 'elastic';
      const v = makeVine(x + dx + grand(-30, 30), yb - dy + grand(-15, 15), len, type, w);
      vines.push(v);
      for (let j = 0; j < 3; j++) { // appels op de zwaaiboog
        const a = { x: v.x - 190 + j * 110, y: v.ay + len * 0.72 + 30 - Math.abs(j - 1) * 30, gold: genRandom() < 0.12, t: j * 0.6 };
        apples.push(a); countApple(a);
      }
    });
    x += TW_DX;
  }
  T.goalX = x + 200;
  run.tower = T;
}
// springen vanaf een ring: naar de dichtstbijzijnde liaan boven je
function towerJump() {
  let best = null, bd = Infinity;
  for (const v of vines) {
    if (!v.anchored) continue;
    const dy = G.y - v.ay;
    if (dy < 420 || dy > 1000 || Math.abs(v.x - G.x) > 900) continue; // de laagste liaan van de verdieping boven je
    const d = dy + Math.abs(v.x - (G.x + 200)) * 0.3;
    if (d < bd) { bd = d; best = v; }
  }
  let tx = G.x + 350;
  if (best) { let e = Infinity; for (const p of best.pts) { const dd = Math.abs(p.y - (G.y - 300)); if (dd < e) { e = dd; tx = p.x; } } }
  G.state = 'air'; G.vy = -820; G.vx = clamp((tx - G.x) / 0.8, -760, 760);
  G.airT = 0; G.airX = G.x; G.noDive = true; G.lastVine = null;
  floatText(G.x, G.y - 60, 'Hup!', '#ffffff', 26);
  for (let i = 0; i < 10; i++) addPart({ x: G.x + rand(-14, 14), y: G.y + FEET, vx: rand(-120, 120), vy: rand(-120, -20), life: 0.5, max: 0.5, col: 'rgba(200,190,170,.8)', r: rand(3, 6), g: 300 });
  Sfx.jump(); Sfx.hup();
}
// in de lucht: op een ring landen (alleen van bovenaf; van onderen spring je er gewoon doorheen)
function towerLand(prevFeet) {
  if (G.vy <= 0) return false;
  const T = run.tower, feet = G.y + FEET;
  for (const r of T.rings) {
    if (prevFeet > r + 2 || feet < r) continue;
    G.y = r - FEET; G.state = 'stand'; G.vx = 0; G.vy = 0; G.standT = 0; G.standPress = input.presses; G.sq = -0.3; G.angle = 0;
    addPart({ type: 'ring', x: G.x, y: r, vx: 0, vy: 0, life: 0.35, max: 0.35, col: 'rgba(255,255,255,.7)', r: 8, grow: 30, g: 0, flat: true });
    if (r === T.top && game.mode === 'playing') { confetti(G.x, G.y - 60, 80); levelComplete(); }
    return true;
  }
  return false;
}
// elke physics-stap in een torenlevel: vallende dingen
function towerStep(dt) {
  const T = run.tower, w = game.career.bi;
  if ((T.dropT -= dt) <= 0) {
    T.dropT = rand(1.0, 1.7) * Math.max(0.5, 1 - 0.05 * w);
    const aim = Math.random() < 0.55;
    T.drops.push({ x: aim ? G.x + G.vx * 0.55 + rand(-60, 60) : G.x + rand(-650, 650), y: 0, warn: 0.85, vy: 0, kind: (Math.random() * 4) | 0, rot: rand(0, 6), vr: rand(-5, 5), r: 26 });
  }
  const alive = G.state === 'hang' || G.state === 'air' || G.state === 'stand';
  for (let i = T.drops.length - 1; i >= 0; i--) {
    const d = T.drops[i];
    if (d.warn > 0) { if ((d.warn -= dt) <= 0) { d.y = camY - 60; d.vy = 250; } continue; }
    d.vy += 1500 * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
    if (d.y > camY + viewH + 300) { T.drops.splice(i, 1); continue; }
    if (alive && G.invuln <= 0 && Math.hypot(G.x - d.x, G.y - d.y) < d.r + G_R * 0.8) { T.drops.splice(i, 1); towerHit(d); }
  }
}
function towerHit(d) {
  burst(d.x, d.y, 14, TW_DROP_COL[d.kind], 260, 5); shake(6, 0.25); Sfx.crack(); Sfx.whoa();
  G.invuln = 1.2; run.timeLeft -= 3;
  floatText(G.x, G.y - 60, 'Au! −3 s', '#ffb0b0', 24);
  if (G.state === 'hang') { release(false); G.vy = Math.max(G.vy, 350); }
  else if (G.state === 'air') G.vy = Math.max(G.vy, 400);
}
const TW_DROP_COL = ['#c8643a', '#8a8a8a', '#8a5a2e', '#b08850'];

// ---- tekenen: achtergrond (in beeldcoördinaten) ----
const TW_ROW = 44, TW_COLS = 40;
const towerRv = () => Math.min(viewW * 0.36, 520); // straal van de toren in beeld
// landschap rond de toren: bomen, huisjes en velden op vaste plekken (hoek, afstand)
const TW_SCENE = Array.from({ length: 140 }, (_, i) => ({ a: hash(i * 1.37) * Math.PI * 2, r: 1400 + hash(i * 2.91) * 9000, k: hash(i * 4.7), s: 0.7 + hash(i * 6.1) * 0.8 }));
function drawTowerBg(P) {
  const T = run.tower, W = viewW, H = viewH, cx = W / 2, Rv = towerRv();
  const th = (camX + W / 2) / Rv; // hoe ver de camera om de toren heen is gedraaid
  // lucht
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, P.skyTop); sky.addColorStop(0.55, P.skyMid); sky.addColorStop(1, P.skyBot);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // het landschap: hoe hoger je bent, hoe verder de grond onder je ligt (echte perspectief)
  const h = Math.max(60, TW_G - (camY + H * 0.5) + 200), f = H * 0.9, hz = H * 0.42, Rc = Rv + 1100;
  const far = ctx.createLinearGradient(0, hz, 0, H);
  far.addColorStop(0, rgbStr(mixC(P.far2C, P.skyBotC, 0.5))); far.addColorStop(0.3, P.far2); far.addColorStop(1, P.mid);
  ctx.fillStyle = far; ctx.fillRect(0, hz, W, H - hz);
  // bergen aan de horizon (draaien heel langzaam mee)
  ctx.fillStyle = rgbStr(mixC(P.farC, P.skyBotC, 0.35)); ctx.beginPath(); ctx.moveTo(0, hz + 2);
  for (let x = 0; x <= W + 20; x += 20) { const u = x / W * 1.6 + th * 0.35; ctx.lineTo(x, hz - 18 - (Math.sin(u * 5.1) * 0.5 + Math.sin(u * 11.3 + 1) * 0.3 + 0.8) * 40); }
  ctx.lineTo(W, hz + 2); ctx.closePath(); ctx.fill();
  // dingen op de grond, van ver naar dichtbij
  const vis = [];
  for (const o of TW_SCENE) {
    const b = o.a - th, d = Rc - o.r * Math.cos(b);
    if (d < 300) continue;
    const sx = cx + f * o.r * Math.sin(b) / d;
    if (sx < -120 || sx > W + 120) continue;
    vis.push([d, sx, o]);
  }
  vis.sort((a, b) => b[0] - a[0]);
  for (const [d, sx, o] of vis) {
    const gy = hz + f * h / d, sc = f / d * o.s;
    if (gy > H + 60) continue;
    if (o.k < 0.55) { // boom
      ctx.fillStyle = '#5a3a1c'; ctx.fillRect(sx - 6 * sc, gy - 60 * sc, 12 * sc, 60 * sc);
      ctx.fillStyle = P.canopy; circ(sx, gy - 80 * sc, 42 * sc); ctx.fillStyle = P.canopy2; circ(sx - 12 * sc, gy - 92 * sc, 20 * sc);
    } else if (o.k < 0.72) { // huisje
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(sx - 40 * sc, gy - 50 * sc, 80 * sc, 50 * sc);
      ctx.fillStyle = '#b8422e'; ctx.beginPath(); ctx.moveTo(sx - 50 * sc, gy - 48 * sc); ctx.lineTo(sx, gy - 90 * sc); ctx.lineTo(sx + 50 * sc, gy - 48 * sc); ctx.fill();
    } else { // veld
      ctx.fillStyle = o.k < 0.86 ? rgbStr(mixC(P.canopy2C, [230, 200, 90], 0.4), 0.8) : rgbStr(P.canopyC, 0.6);
      ctx.beginPath(); ctx.ellipse(sx, gy, 160 * sc, 40 * sc * clamp(h / 900, 0.3, 1.2), 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // de toren zelf: een stenen cilinder waarvan de stenen meedraaien
  const top = T.top - 300 - camY, y0 = Math.max(-10, top), y1 = H + 10;
  const body = ctx.createLinearGradient(cx - Rv, 0, cx + Rv, 0);
  const st = mixC([150, 138, 122], P.midC, 0.2);
  body.addColorStop(0, rgbStr(mixC(st, [0, 0, 0], 0.55))); body.addColorStop(0.35, rgbStr(mixC(st, [255, 255, 255], 0.12)));
  body.addColorStop(0.7, rgbStr(st)); body.addColorStop(1, rgbStr(mixC(st, [0, 0, 0], 0.6)));
  ctx.fillStyle = body; ctx.fillRect(cx - Rv, y0, Rv * 2, y1 - y0);
  // voegen: horizontale rijen, verticale voegen per rij (om en om half verschoven)
  ctx.strokeStyle = 'rgba(40,30,25,.45)'; ctx.lineWidth = 2; ctx.beginPath();
  const k0 = Math.floor((camY + y0) / TW_ROW), k1 = Math.ceil((camY + y1) / TW_ROW);
  for (let k = k0; k <= k1; k++) {
    const y = k * TW_ROW - camY;
    ctx.moveTo(cx - Rv, y); ctx.lineTo(cx + Rv, y);
    for (let j = 0; j < TW_COLS; j++) {
      const a = (j + (k & 1) * 0.5) / TW_COLS * Math.PI * 2 - th, c = Math.cos(a);
      if (c < 0.08) continue;
      const x = cx + Rv * Math.sin(a);
      ctx.moveTo(x, Math.max(y, y0)); ctx.lineTo(x, y + TW_ROW);
    }
  }
  ctx.stroke();
  // raampjes (schietgaten) en klimop
  for (let k = k0 - 2; k <= k1; k++) {
    if (((k % 7) + 7) % 7) continue;
    for (let m = 0; m < 5; m++) {
      const a = (m / 5 + hash(k) * 0.2) * Math.PI * 2 - th, c = Math.cos(a);
      if (c < 0.15) continue;
      const x = cx + Rv * Math.sin(a), y = k * TW_ROW - camY, ww = 22 * c;
      ctx.fillStyle = '#1c1612'; ctx.beginPath(); ctx.moveTo(x - ww, y + 90); ctx.lineTo(x - ww, y + 20); ctx.quadraticCurveTo(x, y - 6, x + ww, y + 20); ctx.lineTo(x + ww, y + 90); ctx.fill();
    }
    for (let m = 0; m < 3; m++) {
      const a = (m / 3 + hash(k * 3.3) * 0.3) * Math.PI * 2 - th, c = Math.cos(a);
      if (c < 0.1) continue;
      const x = cx + Rv * Math.sin(a), y = k * TW_ROW - camY;
      ctx.fillStyle = rgbStr(P.canopyC, 0.8);
      for (let q = 0; q < 6; q++) circ(x + Math.sin(q * 1.7 + k) * 10 * c, y + 40 + q * 26, (9 + hash(q + k) * 6) * (0.4 + 0.6 * c));
    }
  }
  // rand van de cilinder: schaduw aan beide kanten
  const edge = ctx.createLinearGradient(cx - Rv, 0, cx + Rv, 0);
  edge.addColorStop(0, 'rgba(0,0,0,.35)'); edge.addColorStop(0.12, 'rgba(0,0,0,0)'); edge.addColorStop(0.88, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.4)');
  ctx.fillStyle = edge; ctx.fillRect(cx - Rv, y0, Rv * 2, y1 - y0);
  // kantelen bovenop
  if (top > -60) {
    ctx.fillStyle = rgbStr(mixC(st, [0, 0, 0], 0.15));
    ctx.fillRect(cx - Rv - 20, top - 10, Rv * 2 + 40, 40);
    for (let j = 0; j < 16; j++) {
      const a = (j + 0.5) / 16 * Math.PI * 2 - th, c = Math.cos(a);
      if (c < 0.1) continue;
      const x = cx + (Rv + 20) * Math.sin(a), ww = 26 * c;
      ctx.fillRect(x - ww, top - 56, ww * 2, 50);
    }
  }
}
// ---- tekenen in de wereld: de ringen om de toren, de vlag bovenop en wat er valt ----
function drawTowerRings() {
  const T = run.tower, cx = camX + viewW / 2, Rv = towerRv(), rx = Rv + 110;
  for (const r of T.rings) {
    if (r < camY - 80 || r > camY + viewH + 120) continue;
    const ry = clamp(14 + (r - (camY + viewH * 0.5)) * 0.05, 14, 40); // hoe hoger de camera, hoe meer je van bovenop de ring ziet
    ctx.fillStyle = '#6e645a'; // zijkant
    ctx.beginPath(); ctx.ellipse(cx, r + 26, rx, ry, 0, 0, Math.PI); ctx.lineTo(cx - rx, r); ctx.ellipse(cx, r, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = r === T.rings[0] ? '#7da04a' : '#a89c8c'; // bovenkant (de grond is gras)
    ctx.beginPath(); ctx.ellipse(cx, r, rx, ry, 0, 0, Math.PI); ctx.ellipse(cx, r, Rv, ry * Rv / rx, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,25,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, r, rx, ry, 0, 0, Math.PI); ctx.stroke();
  }
  // de finish: een vlag op de bovenste ring
  const fy = T.top;
  if (fy > camY - 300 && fy < camY + viewH + 50) {
    const fx = cx + 60;
    ctx.fillStyle = '#5a3a1c'; ctx.fillRect(fx - 4, fy - 190, 8, 190);
    ctx.fillStyle = '#e8322b'; ctx.beginPath(); ctx.moveTo(fx + 4, fy - 186); ctx.quadraticCurveTo(fx + 60, fy - 170 + Math.sin(time * 5) * 8, fx + 110, fy - 160); ctx.lineTo(fx + 4, fy - 128); ctx.fill();
    ctx.font = '900 26px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('🏁 TOP', fx + 50, fy - 205);
  }
}
function drawTowerDrops() {
  const T = run.tower;
  for (const d of T.drops) {
    if (d.warn > 0) { // waarschuwing bovenin beeld
      const a = 0.5 + 0.45 * Math.sin(time * 24), y = camY + 40 / scale;
      ctx.fillStyle = `rgba(255,60,60,${a})`; ctx.beginPath(); ctx.moveTo(d.x - 22, y); ctx.lineTo(d.x + 22, y); ctx.lineTo(d.x, y + 30); ctx.closePath(); ctx.fill();
      continue;
    }
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    const c = TW_DROP_COL[d.kind];
    if (d.kind === 0) { // bloempot
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-22, -12); ctx.lineTo(22, -12); ctx.lineTo(16, 22); ctx.lineTo(-16, 22); ctx.fill();
      ctx.fillStyle = shade(c, -0.2); ctx.fillRect(-25, -18, 50, 9); ctx.fillStyle = '#3f8f3a'; circ(-8, -24, 9); circ(8, -26, 10); ctx.fillStyle = '#ff7eb6'; circ(0, -30, 6);
    } else if (d.kind === 1) { // steen
      ctx.fillStyle = shade(c, -0.3); circ(0, 2, 26); ctx.fillStyle = c; circ(-2, 0, 24); ctx.fillStyle = 'rgba(255,255,255,.25)'; circ(-9, -8, 8);
    } else if (d.kind === 2) { // ton
      ctx.fillStyle = c; ctx.fillRect(-20, -26, 40, 52); ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-21, -18, 42, 5); ctx.fillRect(-21, 13, 42, 5);
    } else { // kist
      ctx.fillStyle = c; ctx.fillRect(-24, -24, 48, 48); ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = 4; ctx.strokeRect(-22, -22, 44, 44); line(-22, -22, 22, 22);
    }
    ctx.restore();
  }
}

// =====================================================================
//  Het kasteel (baaslevel)
// =====================================================================
const CASTLE_CEIL = CEIL_Y - 120; // het plafond met punten: te hoog springen doet pijn
function castleBuild() {
  const C = game.career, rnd = mulberry32(C.n * 7777 + 11), obs = [];
  let x = START_X + 1100;
  const end = C.finishX - 500;
  while (x < end) {
    const r = rnd();
    if (r < 0.42) obs.push({ type: 'axe', x, L: 480 + rnd() * 160, amp: 0.85 + rnd() * 0.35, w: 1.5 + rnd() * 0.7 + C.bi * 0.04, ph: rnd() * 6 });
    else if (r < 0.75) obs.push({ type: 'geyser', x, per: 3.2 - C.bi * 0.06, ph: rnd() * 3, h: 0 });
    else obs.push({ type: 'crusher', x, mid: -420 + rnd() * 200, amp: 260 + rnd() * 120, w: 1.2 + rnd() * 0.6, ph: rnd() * 6 });
    x += 720 + rnd() * 420 - Math.min(250, C.bi * 15);
  }
  run.castle = { obs };
}
const axePos = o => { const a = o.amp * Math.sin(time * o.w + o.ph); return [o.x + Math.sin(a) * o.L, CASTLE_CEIL + Math.cos(a) * o.L, a]; };
function castleStep(dt) {
  const K = run.castle;
  if (!K) return;
  const alive = G.state === 'hang' || G.state === 'air';
  for (const o of K.obs) {
    if (Math.abs(o.x - G.x) > 1400) continue;
    if (o.type === 'axe') {
      const [bx, by] = axePos(o);
      if (alive && Math.hypot(G.x - bx, G.y - by) < 58) careerHurt(true, Math.sign(G.x - bx) * 380);
    } else if (o.type === 'geyser') {
      const t = ((time + o.ph) % o.per + o.per) % o.per; // 0..0,9 borrelen, 0,9..2 spuiten
      o.warn = t < 0.9; o.h = t >= 0.9 && t < 2 ? Math.sin((t - 0.9) / 1.1 * Math.PI) * 900 : 0;
      if (o.h > 0 && Math.random() < 0.6) addPart({ x: o.x + rand(-30, 30), y: HAZARD_Y - o.h * rand(0.3, 1), vx: rand(-60, 60), vy: rand(-200, 0), life: 0.5, max: 0.5, col: Math.random() < 0.5 ? '#ffae2a' : '#ff5a1f', r: rand(4, 8), g: 400 });
      if (alive && o.h > 0 && Math.abs(G.x - o.x) < 50 && G.y > HAZARD_Y - o.h) careerHurt(true, Math.sign(G.x - o.x) * 300 || 300);
    } else if (o.type === 'crusher') {
      const cy = o.mid + Math.sin(time * o.w + o.ph) * o.amp;
      if (alive && Math.abs(G.x - o.x) < 70 + G_R * 0.6 && Math.abs(G.y - cy) < 55 + G_R * 0.6) careerHurt(true, Math.sign(G.x - o.x) * 420 || 420);
    }
  }
  // de punten aan het plafond
  if (alive && G.y - G_R < CASTLE_CEIL + 60) { careerHurt(true, 0); G.vy = Math.max(G.vy, 350); G.y = Math.max(G.y, CASTLE_CEIL + 60 + G_R); }
}
// de kasteelmuur met ramen (daardoor zie je de biome buiten), zuilen, fakkels en vaandels; in de basisweergave
let castlePat = null;
function drawCastleWall(P) {
  const W = viewW, H = viewH, off = camX * 0.5, sp = 560;
  if (!castlePat) { // steentjes als patroon
    const c = document.createElement('canvas'); c.width = 120; c.height = 60; const g = c.getContext('2d');
    g.fillStyle = '#4a4550'; g.fillRect(0, 0, 120, 60);
    g.fillStyle = '#56505c'; for (let r = 0; r < 2; r++) for (let k = -1; k < 3; k++) g.fillRect(k * 60 + (r ? 30 : 0) + 2, r * 30 + 2, 56, 26);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let r = 0; r < 2; r++) for (let k = -1; k < 3; k++) g.fillRect(k * 60 + (r ? 30 : 0) + 2, r * 30 + 22, 56, 6);
    castlePat = ctx.createPattern(c, 'repeat');
  }
  // muur met boogramen (evenodd: de ramen blijven open)
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H);
  for (let i = Math.floor(off / sp) - 1; i <= Math.ceil((off + W) / sp) + 1; i++) {
    const x = i * sp - off + sp / 2, wy = H * 0.22, ww = 110, wh = H * 0.42;
    ctx.moveTo(x - ww, wy + wh); ctx.lineTo(x - ww, wy + ww); ctx.arc(x, wy + ww, ww, Math.PI, 0); ctx.lineTo(x + ww, wy + wh); ctx.closePath();
  }
  if (castlePat.setTransform) castlePat.setTransform(new DOMMatrix([1, 0, 0, 1, -(off % 120), 0]));
  ctx.fillStyle = castlePat; ctx.fill('evenodd');
  // schaduw van boven en een rode lavagloed van onder
  const sh = ctx.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(10,6,14,.55)'); sh.addColorStop(0.5, 'rgba(10,6,14,0)'); sh.addColorStop(1, 'rgba(255,90,20,.35)');
  ctx.fillStyle = sh; ctx.fill('evenodd');
  ctx.restore();
  for (let i = Math.floor(off / sp) - 1; i <= Math.ceil((off + W) / sp) + 1; i++) {
    const x = i * sp - off + sp / 2, wy = H * 0.22, ww = 110, wh = H * 0.42;
    // tralies en een stenen rand om het raam
    ctx.strokeStyle = '#2a2530'; ctx.lineWidth = 5; for (let k = -1; k <= 1; k++) line(x + k * 50, wy + 20, x + k * 50, wy + wh);
    ctx.strokeStyle = '#6a6272'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(x - ww, wy + wh); ctx.lineTo(x - ww, wy + ww); ctx.arc(x, wy + ww, ww, Math.PI, 0); ctx.lineTo(x + ww, wy + wh); ctx.stroke();
    // zuil tussen de ramen, met een fakkel en een vaandel in de kleur van de baas
    const px = x + sp / 2;
    ctx.fillStyle = '#3a3440'; ctx.fillRect(px - 34, 0, 68, H); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px - 34, 0, 14, H);
    const B = BOSSES[game.career.bi];
    ctx.fillStyle = B.col; ctx.beginPath(); ctx.moveTo(px - 26, H * 0.08); ctx.lineTo(px + 26, H * 0.08); ctx.lineTo(px + 26, H * 0.34); ctx.lineTo(px, H * 0.29); ctx.lineTo(px - 26, H * 0.34); ctx.fill();
    ctx.fillStyle = '#f5c518'; circ(px, H * 0.17, 8);
    const ty = H * 0.46, fl = Math.sin(time * 14 + i) * 3;
    ctx.fillStyle = '#5a3a1c'; ctx.fillRect(px - 5, ty, 10, 36);
    ctx.fillStyle = 'rgba(255,150,40,.25)'; circ(px, ty - 10, 40);
    ctx.fillStyle = '#ff8a1a'; ell(px, ty - 10 + fl * 0.3, 10, 18 + fl); ctx.fillStyle = '#ffe46b'; ell(px, ty - 6, 5, 9);
  }
}
// in de wereld: het plafond met punten en de valstrikken
function drawCastleWorld() {
  const K = run.castle;
  if (!K) return;
  // plafond
  if (camY < CASTLE_CEIL + 200) {
    const x0 = camX - 50, x1 = camX + viewW + 50;
    ctx.fillStyle = '#2e2934'; ctx.fillRect(x0, CASTLE_CEIL - 900, x1 - x0, 900);
    ctx.fillStyle = '#9a96a6';
    for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) { ctx.beginPath(); ctx.moveTo(x, CASTLE_CEIL); ctx.lineTo(x + 20, CASTLE_CEIL + 46); ctx.lineTo(x + 40, CASTLE_CEIL); ctx.fill(); }
  }
  for (const o of K.obs) {
    if (o.x < camX - 800 || o.x > camX + viewW + 800) continue;
    if (o.type === 'axe') {
      const [bx, by, a] = axePos(o);
      ctx.strokeStyle = '#5a5a66'; ctx.lineWidth = 8; line(o.x, CASTLE_CEIL, bx, by);
      ctx.fillStyle = '#3a3a44'; circ(o.x, CASTLE_CEIL + 6, 12);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(-a);
      ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(70, -10, 64, 40); ctx.quadraticCurveTo(30, 18, 0, 22); ctx.quadraticCurveTo(-30, 18, -64, 40); ctx.quadraticCurveTo(-70, -10, 0, -30); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-60, 36); ctx.quadraticCurveTo(0, 12, 60, 36); ctx.stroke();
      ctx.restore();
    } else if (o.type === 'geyser') {
      ctx.fillStyle = '#3a2a22'; ell(o.x, HAZARD_Y + 2, 58, 12); // stenen rand
      if (o.warn) { ctx.fillStyle = `rgba(255,170,40,${0.5 + 0.4 * Math.sin(time * 30)})`; for (let k = 0; k < 4; k++) circ(o.x + (k - 1.5) * 18, HAZARD_Y - 6 - ((time * 60 + k * 9) % 22), 6); }
      if (o.h > 0) {
        const g = ctx.createLinearGradient(0, HAZARD_Y - o.h, 0, HAZARD_Y);
        g.addColorStop(0, 'rgba(255,230,120,.95)'); g.addColorStop(0.4, '#ffae2a'); g.addColorStop(1, '#d8350f');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(o.x - 34, HAZARD_Y); ctx.quadraticCurveTo(o.x - 46, HAZARD_Y - o.h * 0.5, o.x - 20, HAZARD_Y - o.h);
        ctx.quadraticCurveTo(o.x, HAZARD_Y - o.h - 40, o.x + 20, HAZARD_Y - o.h); ctx.quadraticCurveTo(o.x + 46, HAZARD_Y - o.h * 0.5, o.x + 34, HAZARD_Y); ctx.fill();
      }
    } else if (o.type === 'crusher') {
      const cy = o.mid + Math.sin(time * o.w + o.ph) * o.amp;
      ctx.strokeStyle = '#5a5a66'; ctx.lineWidth = 6; line(o.x - 30, CASTLE_CEIL, o.x - 30, cy - 50); line(o.x + 30, CASTLE_CEIL, o.x + 30, cy - 50);
      ctx.fillStyle = '#4a4552'; ctx.fillRect(o.x - 70, cy - 55, 140, 110);
      ctx.fillStyle = '#6a6474'; ctx.fillRect(o.x - 70, cy - 55, 140, 16);
      ctx.fillStyle = '#c9ced8';
      for (let k = 0; k < 7; k++) { const x = o.x - 70 + k * 20; ctx.beginPath(); ctx.moveTo(x, cy + 55); ctx.lineTo(x + 10, cy + 80); ctx.lineTo(x + 20, cy + 55); ctx.fill(); }
      ctx.fillStyle = '#ff5a5a'; circ(o.x - 30, cy, 7); circ(o.x + 30, cy, 7); // boze oogjes
    }
  }
}
// kettingen in plaats van lianen (in het kasteel)
function drawChain(v) {
  const p = v.pts, n = p.length;
  ctx.lineWidth = 3.5;
  for (let i = 0; i < n - 1; i++) {
    const a = p[i], b = p[i + 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.strokeStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(mx, my, 10, i % 2 ? 2.5 : 5.5, ang, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = i % 2 ? '#8a8a96' : '#b4b4c0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(mx, my, 9, i % 2 ? 2 : 5, ang, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 3.5;
  }
  if (v.type === 'rotten') { ctx.fillStyle = '#8a4a2a'; for (let i = 2; i < n; i += 3) circ(p[i].x, p[i].y, 3); } // roestig: breekt
}
function drawChainAnchor(v) {
  ctx.fillStyle = '#3a3440'; ctx.fillRect(v.x - 24, v.ay - 14, 48, 12);
  ctx.strokeStyle = '#8a8a96'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(v.x, v.ay + 2, 8, 0, Math.PI * 2); ctx.stroke();
}

// =====================================================================
//  Modifiers
// =====================================================================
// stuiterwater: het water gooit je terug omhoog (true = afgehandeld)
function modBounce() {
  const M = levelMod();
  if (!M || !M.bounce) return false;
  G.y = HAZARD_Y - G_R; G.vy = -1550; G.vx = Math.max(G.vx, 450); G.sq = -0.35;
  run.timeLeft -= 4;
  splash(G.x, 16); floatText(G.x, G.y - 60, '🏀 Boing! −4 s', '#ffe46b', 24); Sfx.boing(); shake(3, 0.2);
  return true;
}
// bij de start van een level: de wereld ombouwen voor de toren of het kasteel
function levelBuild() {
  if (!game.career) return;
  if (game.career.tower) towerBuild();
  if (game.career.boss) castleBuild();
}
