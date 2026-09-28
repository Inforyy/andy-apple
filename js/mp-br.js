'use strict';
// Andy Apples · battle royale (online multiplayer)
// Een kleine arena waar je niet kunt wegvluchten: pak fruitwapens op, richt met de muis en klik om te schieten.
// Wie als laatste overblijft, wint. Zwaaien kan hier alle kanten op (vrije richting, zie brOn in physics.js).
// Een storm drukt de arena na een tijdje van beide kanten steeds kleiner.
//
// Netwerk: iedereen simuleert zijn eigen Andy (zoals in de andere modi). Een schot wordt als bericht naar iedereen
// gestuurd ('br'/'shot') en overal als kogel gesimuleerd; alleen wie geraakt wordt, rekent de schade uit (bij
// zichzelf) en meldt dat ('br'/'hit'). Ben je uitgeschakeld, dan stuur je een 'ev' met wie je eruit schoot (by).
// Wapens oppakken: 'br'/'pick', dan is dat wapen bij iedereen even weg.

const BR_X0 = WALL_X, BR_X1 = 4700;   // de arena (wereld-x): links de wand achter de startrots, rechts de storm
const BR_HP = 100;
const BR_ZONE_T = 40, BR_ZONE_DUR = 70, BR_ZONE_MIN = 1300; // de storm begint na 40 s en krimpt de arena in 70 s tot 1300 breed
const BR_PICK_R = 70, BR_RESPAWN = 11;
// Fruitwapens. ammo: Infinity = onbeperkt; g: zwaartekracht op de kogel; n/spread: hagel; boom: ontploft (straal);
// knock: een voltreffer slaat je van je liaan
const BR_WEAPONS = {
  sling:   { name: 'Appelkatapult',   icon: '🍎', ammo: Infinity, cd: 0.5,  speed: 1500, dmg: 10, g: 900, r: 9,  life: 1.6, col: '#e8322b' },
  pistol:  { name: 'Bananenblaster',  icon: '🍌', ammo: 15, cd: 0.2,  speed: 2200, dmg: 13, g: 0,   r: 6,  life: 1.1, col: '#ffd23f' },
  shotgun: { name: 'Kokoskanon',      icon: '🥥', ammo: 6,  cd: 0.85, speed: 1700, dmg: 11, g: 0,   r: 6,  life: 0.45, col: '#8a5a2e', n: 6, spread: 0.32 },
  rocket:  { name: 'Ananasbazooka',   icon: '🍍', ammo: 3,  cd: 1.1,  speed: 1150, dmg: 55, g: 0,   r: 12, life: 2.2, col: '#f2b705', boom: 170, knock: true },
  sniper:  { name: 'Druivensniper',   icon: '🍇', ammo: 4,  cd: 1.4,  speed: 3800, dmg: 60, g: 0,   r: 7,  life: 0.9, col: '#8e44ad', knock: true },
};
const BR_PICKS = ['pistol', 'shotgun', 'heal', 'rocket', 'pistol', 'sniper', 'heal', 'shotgun'];
const brOn = () => !!(game.mp && game.mp.mode === 'br');

// ---- start van een potje ----
function brStart(M) {
  const rnd = mulberry32((M.seed ^ 0x5bd1e995) >>> 0), n = 9, picks = [];
  for (let i = 0; i < n; i++) picks.push({ i, x: 900 + (i + 0.5) / n * (BR_X1 - 1150) + (rnd() - 0.5) * 200, y: -520 + rnd() * 780, k: (i * 3 + (rnd() * 8 | 0)) % BR_PICKS.length, up: true, t: 0, ph: rnd() * 6 });
  M.br = { hp: BR_HP, w: 'sling', ammo: Infinity, cd: 0, fireQ: false, fireHeld: false, aim: 0, mx: null, my: null, bullets: [], picks, sid: 0,
    zone0: BR_X0, zone1: BR_X1, lastBy: null, lastByT: -9, hurtT: 0, feed: [], kills: new Map(), stormHurt: 0 };
  // iedereen begint op een eigen plek in de arena, aan een liaan (zo zit je niet allemaal op de startrots)
  genUntil(BR_X1);
  const idx = Math.max(0, M.ids.indexOf(MP.myId)), sx = 900 + (idx + 0.5) / M.ids.length * (BR_X1 - 1300);
  let best = null, bd = Infinity;
  for (const v of vines) {
    if (!v.anchored || v.type === 'rotten' || v.type === 'icy' || v.type === 'elastic' || v.balloon) continue;
    const d = Math.abs(v.x - sx) + Math.abs(v.ay - LANES[1]) * 0.3;
    if (d < bd) { bd = d; best = v; }
  }
  if (best) {
    const p = best.pts, k = Math.round(p.length * 0.55);
    Object.assign(G, { x: p[k].x, y: p[k].y + ARM_LEN, vx: 0, vy: 0, state: 'air' });
    attach(best, k); G.om *= 0.5;
    run.firstJump = false;
    game.holdLock = true; // blijft hangen tot je drukt
    camX = Math.max(-100, G.x - viewW * 0.5); camY = Math.min(baseTop(), G.y - viewH * 0.5); lastCamX = camX;
  }
  canvas.style.cursor = 'crosshair';
}
function brStop() { canvas.style.cursor = ''; }

// ---- elke physics-stap ----
function brStep(dt) {
  const M = game.mp, B = M.br, alive = G.state !== 'dead' && !M.myEv;
  B.cd -= dt; B.hurtT -= dt; B.stormHurt -= dt;
  // de storm: na BR_ZONE_T seconden schuiven beide randen naar het midden
  const mid = (BR_X0 + BR_X1) / 2, zk = clamp((M.t - BR_ZONE_T) / BR_ZONE_DUR, 0, 1), half = (BR_X1 - BR_X0) / 2;
  const hw = half + (BR_ZONE_MIN / 2 - half) * zk * zk * (3 - 2 * zk);
  B.zone0 = mid - hw; B.zone1 = mid + hw;
  if (zk > 0) for (const v of vines) if (v.anchored && (v.x < B.zone0 - 30 || v.x > B.zone1 + 30)) { v.anchored = false; v.pts[0].im = 1; if (G.vine === v) release(false); }
  // tegen de rand van de arena: terugkaatsen, en in de storm doet het pijn
  if (alive && (G.state === 'air' || G.state === 'hang')) {
    const lo = Math.max(BR_X0, B.zone0), hi = B.zone1;
    if (G.x < lo || G.x > hi) {
      const dir = G.x < lo ? 1 : -1;
      if (G.state === 'hang') release(false);
      G.x = dir > 0 ? lo : hi; G.vx = dir * Math.max(420, Math.abs(G.vx) * 0.7); G.vy = Math.min(G.vy, -150);
      if ((zk > 0 || dir < 0) && B.stormHurt <= 0) { B.stormHurt = 0.6; brDamage(12, null, dir, 0, 'storm'); }
    }
  }
  // wapen richten en schieten
  if (B.mx !== null) { const w = brMouseWorld(); B.aim = Math.atan2(w[1] - G.y, w[0] - G.x); }
  if (alive && game.mode === 'playing' && (B.fireQ || B.fireHeld) && B.cd <= 0) brFire();
  B.fireQ = false;
  // kogels
  for (let i = B.bullets.length - 1; i >= 0; i--) {
    const b = B.bullets[i], W = BR_WEAPONS[b.w];
    b.t += dt; b.vy += W.g * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let gone = b.t > W.life || b.y > HAZARD_Y || b.x < BR_X0 - 100 || b.x > BR_X1 + 300;
    // raakt hij mij? (alleen kogels van anderen; ik reken mijn eigen schade uit)
    if (!gone && alive && b.own !== MP.myId && Math.hypot(G.x - b.x, G.y - b.y) < G_R + W.r) {
      gone = true;
      if (W.boom) brBoom(b); else { const d = Math.hypot(b.vx, b.vy) || 1; brDamage(W.dmg, b.own, b.vx / d, b.vy / d, b.w); }
      mpSend({ type: 'br', id: M.seed, from: MP.myId, k: 'hit', sid: b.sid, own: b.own });
    }
    // raakt hij (op mijn scherm) een ander? dan verdwijnt hij daar (de schade rekent die speler zelf uit)
    if (!gone) for (const P of opps(M)) {
      const g = P.ghost;
      if (P.id === b.own || !g || P.ev || P.left || g.state === 'dead') continue;
      if (Math.hypot(g.x - b.x, g.y - b.y) < G_R + W.r) { gone = true; if (W.boom) brBoom(b); else burst(b.x, b.y, 8, W.col, 220, 3); break; }
    }
    // een raket ontploft ook als hij tegen de bodem of zijn einde komt
    if (gone && W.boom && !b.boomed && (b.t > W.life || b.y > HAZARD_Y)) brBoom(b);
    if (gone) B.bullets.splice(i, 1);
  }
  // wapens oppakken en weer laten verschijnen
  for (const p of B.picks) {
    if (!p.up) { if ((p.t -= dt) <= 0) { p.up = true; p.k = (p.k + 1) % BR_PICKS.length; } continue; }
    if (p.x < B.zone0 || p.x > B.zone1) continue; // in de storm: niet te pakken
    if (alive && Math.hypot(G.x - p.x, G.y - p.y) < BR_PICK_R) { brTake(p, true); mpSend({ type: 'br', id: M.seed, from: MP.myId, k: 'pick', i: p.i }); }
  }
  for (let i = B.feed.length - 1; i >= 0; i--) if ((B.feed[i].t += dt) > 6) B.feed.splice(i, 1);
}
function brMouseWorld() {
  const B = game.mp.br;
  return [camX + B.mx / scale, camY + B.my / scale];
}
function brFire() {
  const M = game.mp, B = M.br, W = BR_WEAPONS[B.w];
  B.cd = W.cd;
  const sid = MP.myId + ':' + (++B.sid);
  const ox = G.x + Math.cos(B.aim) * 34, oy = G.y + Math.sin(B.aim) * 34;
  brSpawn(MP.myId, B.w, ox, oy, B.aim, sid);
  mpSend({ type: 'br', id: M.seed, from: MP.myId, k: 'shot', w: B.w, x: Math.round(ox), y: Math.round(oy), a: +B.aim.toFixed(3), sid });
  // terugslag: in de lucht duwt een zwaar wapen je een stukje terug
  if (G.state === 'air') { const kick = W.boom ? 260 : W.n ? 180 : W.knock ? 140 : 30; G.vx -= Math.cos(B.aim) * kick; G.vy -= Math.sin(B.aim) * kick; }
  if (B.ammo !== Infinity && --B.ammo <= 0) { floatText(G.x, G.y - 60, 'Op! Terug naar de katapult', '#ffffff', 20); B.w = 'sling'; B.ammo = Infinity; }
}
// een schot (van mij of van een ander) als kogels in de wereld zetten
function brSpawn(own, w, x, y, a, sid) {
  const W = BR_WEAPONS[w], B = game.mp.br;
  if (!W) return;
  const n = W.n || 1;
  for (let i = 0; i < n; i++) {
    const aa = a + (n > 1 ? (i / (n - 1) - 0.5) * W.spread : 0) + (W.n ? rand(-0.03, 0.03) : 0);
    B.bullets.push({ own, w, x, y, vx: Math.cos(aa) * W.speed, vy: Math.sin(aa) * W.speed, t: 0, sid: n > 1 ? sid + '/' + i : sid });
  }
  addPart({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.18, max: 0.18, col: 'rgba(255,240,180,.9)', r: 6, grow: 40, g: 0 });
  if (own === MP.myId || Math.abs(x - G.x) < 1400) Sfx.voice({ f: W.boom ? 160 : W.knock ? 900 : 520, f2: W.boom ? 60 : 180, d: W.boom ? 0.35 : 0.12, v: W.boom ? 0.12 : 0.07, type: 'square', lp: 2400 });
}
// een ontploffende ananas: schade aan mij als ik in de buurt ben (met afstand minder)
function brBoom(b) {
  if (b.boomed) return;
  b.boomed = true;
  const W = BR_WEAPONS[b.w];
  burst(b.x, b.y, 26, '#ffb020', 420, 6); burst(b.x, b.y, 14, '#fff3a0', 260, 4);
  addPart({ type: 'ring', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.4, max: 0.4, col: 'rgba(255,190,60,.9)', r: 20, grow: W.boom * 2, g: 0 });
  shake(6, 0.3); Sfx.crack(); Sfx.noise(0.5, 0.3, 300, 0, { pink: true, f2: 80 });
  const d = Math.hypot(G.x - b.x, G.y - b.y);
  if (b.own !== MP.myId && d < W.boom && G.state !== 'dead' && !game.mp.myEv) brDamage(Math.round(W.dmg * (1 - 0.6 * d / W.boom)), b.own, (G.x - b.x) / (d || 1), (G.y - b.y) / (d || 1) - 0.4, b.w);
}
// ik word geraakt: levens eraf, een duw (een zware voltreffer slaat je van je liaan), en bij 0 ben je af
function brDamage(dmg, by, dx, dy, w) {
  const M = game.mp, B = M.br;
  if (G.state === 'dead' || M.myEv || game.mode !== 'playing') return;
  const W = BR_WEAPONS[w];
  B.hp = Math.max(0, B.hp - dmg); B.hurtT = 0.25;
  if (by) { B.lastBy = by; B.lastByT = M.t; }
  flashT = Math.max(flashT, 0.18); shake(4 + dmg * 0.08, 0.2); Sfx.crack();
  floatText(G.x, G.y - 50, `-${dmg}`, '#ff6b6b', 22);
  const push = 260 + dmg * 9;
  if (G.state === 'hang' && (W && W.knock || dmg >= 30)) { release(false); floatText(G.x, G.y - 80, 'Eraf geschoten!', '#ffb0b0', 22); }
  if (G.state === 'hang') G.om += (dx * Math.cos(G.th) - dy * Math.sin(G.th)) * push * 0.6 / G.R;
  else { G.vx += dx * push; G.vy += dy * push - 80; }
  if (B.hp <= 0) {
    floatText(G.x, G.y - 90, 'Uitgeschakeld!', '#ffffff', 28);
    die();
  }
}
function brTake(p, me) {
  const B = game.mp.br, type = BR_PICKS[p.k];
  p.up = false; p.t = BR_RESPAWN;
  if (!me) return;
  starBurst(p.x, p.y, 14, '#ffe46b'); Sfx.lootPick();
  if (type === 'heal') { B.hp = Math.min(BR_HP, B.hp + 50); floatText(p.x, p.y - 40, '❤️ +50', '#7dff8a', 24); return; }
  const W = BR_WEAPONS[type];
  B.w = type; B.ammo = W.ammo; B.cd = Math.min(B.cd, 0.15);
  floatText(p.x, p.y - 40, `${W.icon} ${W.name}!`, '#ffe46b', 24);
}
// berichten van andere spelers
function brMsg(P, m) {
  const M = game.mp;
  if (!M || !M.br) return;
  const B = M.br;
  if (m.k === 'shot' && BR_WEAPONS[m.w]) brSpawn(P.id, m.w, +m.x || 0, +m.y || 0, +m.a || 0, String(m.sid || ''));
  else if (m.k === 'hit') {
    const pre = String(m.sid || '');
    for (let i = B.bullets.length - 1; i >= 0; i--) if (B.bullets[i].sid === pre || B.bullets[i].sid.startsWith(pre + '/')) {
      const b = B.bullets[i]; if (BR_WEAPONS[b.w].boom) brBoom(b); else burst(b.x, b.y, 8, BR_WEAPONS[b.w].col, 220, 3);
      B.bullets.splice(i, 1);
    }
    if (P.ghost) { P.ghost.hurt = 0.25; }
    if (m.own === MP.myId) { Sfx.tick(1600, 0.08); floatText(P.ghost ? P.ghost.x : G.x, (P.ghost ? P.ghost.y : G.y) - 60, 'Raak!', '#ffe46b', 20); }
  } else if (m.k === 'pick') { const p = B.picks[m.i | 0]; if (p && p.up) brTake(p, false); }
}
// iemand is af (ook ikzelf): in de lijst linksboven, en de kills bijhouden
function brOut(id, by) {
  const M = game.mp, B = M && M.br;
  if (!B) return;
  const nm = x => x === MP.myId ? 'Jij' : (MP.players.get(x) || { name: '?' }).name;
  if (by && by !== id) B.kills.set(by, (B.kills.get(by) || 0) + 1);
  B.feed.push({ t: 0, txt: by && by !== id ? `${nm(by)} 🎯 ${nm(id)}` : `${nm(id)} viel eruit` });
  if (by === MP.myId && id !== MP.myId) { showBanner('Uitgeschakeld!', `Je schoot ${nm(id)} eruit`); Sfx.cheer(); }
}
// de speler die mij het laatst raakte (binnen 6 s) krijgt de kill, ook als ik daarna in het water val
const brKiller = M => M.br && M.br.lastBy && M.t - M.br.lastByT < 6 ? M.br.lastBy : null;
const brKills = id => { const B = game.mp && game.mp.br; return B ? B.kills.get(id) || 0 : 0; };

// ---- invoer: muis richt en schiet, SPATIE of rechtermuisknop grijpt; op een touchscreen links = grijpen, rechts = schieten ----
const brPtr = new Map();
function brPointerDown(e) {
  const B = game.mp.br, [sx, sy] = toGame(e.clientX, e.clientY);
  if (e.pointerType === 'mouse') {
    B.mx = sx; B.my = sy;
    if (e.button === 2) { brPtr.set(e.pointerId + ':grab', 'grab'); press(); }
    else if (e.button === 0) { brPtr.set(e.pointerId, 'fire'); B.fireQ = true; B.fireHeld = true; }
    return;
  }
  const W = window.innerWidth;
  if (sx < (rotOn ? window.innerHeight : W) * 0.35) { brPtr.set(e.pointerId, 'grab'); press(); }
  else { brPtr.set(e.pointerId, 'fire'); B.mx = sx; B.my = sy; B.fireQ = true; B.fireHeld = true; }
}
function brPointerMove(e) {
  const B = game.mp && game.mp.br;
  if (!B) return;
  if (e.pointerType === 'mouse' || brPtr.get(e.pointerId) === 'fire') { const [sx, sy] = toGame(e.clientX, e.clientY); B.mx = sx; B.my = sy; }
}
function brPointerUp(e) {
  const B = game.mp && game.mp.br;
  let hit = false;
  for (const key of [e.pointerId, e.pointerId + ':grab']) {
    const k = brPtr.get(key);
    if (!k) continue;
    hit = true; brPtr.delete(key);
    if (k === 'fire' && B && ![...brPtr.values()].includes('fire')) B.fireHeld = false;
    if (k === 'grab' && ![...brPtr.values()].includes('grab') && !pointers.size) unpress();
  }
  return hit;
}

// ---- tekenen (in wereldcoördinaten) ----
function drawBr() {
  const M = game.mp, B = M.br;
  // de storm aan beide kanten
  for (const [x, dir] of [[Math.max(B.zone0, BR_X0), -1], [B.zone1, 1]]) {
    if (dir < 0 && x <= BR_X0 + 1) continue; // links is eerst gewoon de wand achter de startrots
    const y0 = camY - 30, y1 = camY + viewH + 30, far = x + dir * 900;
    if ((dir > 0 && x > camX + viewW + 100) || (dir < 0 && x < camX - 100)) continue;
    const gr = ctx.createLinearGradient(x, 0, x + dir * 520, 0);
    gr.addColorStop(0, 'rgba(38,22,66,0)'); gr.addColorStop(0.25, 'rgba(38,22,66,.86)'); gr.addColorStop(1, 'rgba(18,10,34,.97)');
    ctx.fillStyle = gr; ctx.fillRect(Math.min(x, far), y0, 900, y1 - y0);
    for (let i = 0; i < 9; i++) {
      const yy = camY + (i + 0.5) / 9 * viewH + Math.sin(time * 1.1 + i) * 24, r = 60 + 20 * Math.sin(time * 1.7 + i * 1.9);
      ctx.fillStyle = i % 2 ? 'rgba(60,38,98,.8)' : 'rgba(44,28,76,.85)';
      circ(x + dir * 40 + Math.sin(time * 1.5 + i * 2.3) * 20, yy, r);
    }
  }
  // wapens om op te pakken: een zwevende bel met het fruit erin
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of B.picks) {
    if (!p.up || p.x < B.zone0 || p.x > B.zone1 || p.x < camX - 80 || p.x > camX + viewW + 80) continue;
    const type = BR_PICKS[p.k], y = p.y + Math.sin(time * 2.6 + p.ph) * 8, heal = type === 'heal';
    ctx.fillStyle = heal ? 'rgba(125,255,138,.28)' : 'rgba(255,228,107,.28)'; circ(p.x, y, 36);
    ctx.strokeStyle = heal ? '#7dff8a' : '#ffe46b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, y, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '36px sans-serif'; ctx.fillText(heal ? '❤️' : BR_WEAPONS[type].icon, p.x, y + 2);
  }
  // kogels
  for (const b of B.bullets) {
    const W = BR_WEAPONS[b.w];
    if (b.x < camX - 40 || b.x > camX + viewW + 40) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ell(-W.r * 1.6, 0, W.r * 2.4, W.r * 0.5);
    ctx.fillStyle = shade(W.col, -0.35); ell(0, 0, W.r * 1.3 + 1.5, W.r + 1.5); ctx.fillStyle = W.col; ell(0, 0, W.r * 1.3, W.r);
    ctx.restore();
  }
  // wapens in de handen, levensbalkjes boven de anderen
  const others = opps(M).filter(P => P.ghost && !P.left && !P.ev && P.ghost.state !== 'dead');
  for (const P of others) {
    const g = P.ghost;
    if (g.x < camX - 100 || g.x > camX + viewW + 100) continue;
    brGun(g.x, g.y, g.brAim || 0, g.brW || 'sling');
    const hp = clamp(g.brHp == null ? BR_HP : g.brHp, 0, BR_HP) / BR_HP, w = 62, y = g.y - 96;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(g.x - w / 2 - 2, y - 2, w + 4, 10);
    ctx.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#ffd23f' : '#ff5a5a'; ctx.fillRect(g.x - w / 2, y, w * hp, 6);
    if (g.hurt > 0) { g.hurt -= 1 / 60; ctx.fillStyle = 'rgba(255,60,60,.35)'; circ(g.x, g.y, 40); }
  }
  if (G.state !== 'dead' && !M.myEv) {
    brGun(G.x, G.y, B.aim, B.w);
    if (B.hurtT > 0) { ctx.fillStyle = `rgba(255,60,60,${B.hurtT * 1.4})`; circ(G.x, G.y, 42); }
    // vizier op de muis
    if (B.mx !== null && game.mode === 'playing') {
      const [wx, wy] = brMouseWorld();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(wx, wy, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,60,60,.95)'; line(wx - 24, wy, wx - 8, wy); line(wx + 8, wy, wx + 24, wy); line(wx, wy - 24, wx, wy - 8); line(wx, wy + 8, wx, wy + 24);
    }
  }
}
// een fruitwapen in de hand, gericht op a
function brGun(x, y, a, w) {
  const W = BR_WEAPONS[w] || BR_WEAPONS.sling, left = Math.cos(a) < 0;
  ctx.save(); ctx.translate(x, y + 4); ctx.rotate(a); if (left) ctx.scale(1, -1);
  const L = W.boom ? 56 : W.knock ? 64 : W.n ? 46 : 38, th = W.boom ? 14 : W.n ? 11 : 8;
  ctx.fillStyle = '#2a2230'; ctx.fillRect(14, -th / 2 - 2, L + 4, th + 4);
  ctx.fillStyle = W.col; ctx.fillRect(16, -th / 2, L, th);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(16, -th / 2, L, th * 0.3);
  ctx.fillStyle = '#2a2230'; ctx.fillRect(20, th / 2, 8, 12);
  ctx.restore();
  ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(W.icon, x + Math.cos(a) * 30, y + 4 + Math.sin(a) * 30);
}
// in beeldcoördinaten: wie wie eruit schoot, en een levensbalk onderaan
function drawBrOverlay() {
  const M = game.mp, B = M.br, u = 1 / scale; // u: één schermpixel
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = `800 ${15 * u}px Trebuchet MS, sans-serif`; ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,.6)';
  B.feed.slice(-5).forEach((f, i) => { const y = (120 + i * 22) * u; ctx.globalAlpha = clamp(6 - f.t, 0, 1); ctx.fillStyle = '#fff'; ctx.strokeText(f.txt, viewW - 16 * u, y); ctx.fillText(f.txt, viewW - 16 * u, y); });
  ctx.globalAlpha = 1;
  if (M.myEv) return;
  const W = BR_WEAPONS[B.w], bw = Math.min(260 * u, viewW * 0.4), x = viewW / 2 - bw / 2, y = viewH - 40 * u, bh = 14 * u;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 3 * u, y - 3 * u, bw + 6 * u, bh + 6 * u);
  const hp = B.hp / BR_HP;
  ctx.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#ffd23f' : '#ff5a5a'; ctx.fillRect(x, y, bw * hp, bh);
  ctx.textAlign = 'center'; ctx.font = `900 ${17 * u}px Trebuchet MS, sans-serif`; ctx.fillStyle = '#fff';
  const txt = `❤️ ${Math.ceil(B.hp)}   ${W.icon} ${W.name}${B.ammo === Infinity ? '' : ' · ' + B.ammo}`;
  ctx.strokeText(txt, viewW / 2, y - 16 * u); ctx.fillText(txt, viewW / 2, y - 16 * u);
}
