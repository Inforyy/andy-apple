'use strict';
// Andy Apples · effecten
// Deeltjes, ambient deeltjes en achtergrondleven.

// =====================================================================
//  Deeltjes & effecten
// =====================================================================
function addPart(p) { if (parts.length < Q.parts) parts.push(p); }
function burst(x, y, n, col, spd, r) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7);
    addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3, life: rand(0.35, 0.8), max: 0.8, col, r: r * rand(0.6, 1.2) });
  }
}
function starBurst(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(80, 260);
    addPart({ type: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.35, 0.7), max: 0.7, col: i % 3 ? col : '#ffffff', r: rand(2.5, 5), rot: rand(0, 6), vr: rand(-8, 8), g: 400, drag: 2 });
  }
}
function confetti(x, y, n) {
  const cols = ['#ff5a5a', '#ffd23f', '#4ade80', '#60a5fa', '#f472b6', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI * 0.9, -Math.PI * 0.1), s = rand(250, 650);
    addPart({ type: 'confetti', x: x + rand(-20, 20), y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(1.2, 2), max: 2, col: cols[i % cols.length], r: rand(3, 5), rot: rand(0, 6), vr: rand(-12, 12), g: 520, drag: 1.6 });
  }
}
function splash(x, n, lava) {
  const P = paletteAt((x - START_X) / PX_PER_M);
  for (let i = 0; i < n; i++) {
    addPart({ x: x + rand(-18, 18), y: HAZARD_Y, vx: rand(-170, 170), vy: -rand(220, 680), life: rand(0.5, 1), max: 1,
      col: i % 3 ? P.hazTop : (lava ? '#ffe08a' : '#ffffff'), r: rand(3, 7) });
  }
  addPart({ type: 'ring', x, y: HAZARD_Y + 2, vx: 0, vy: 0, life: 0.6, max: 0.6, col: 'rgba(255,255,255,.7)', r: 10, grow: 60, g: 0, flat: true });
}
// De tekst beweegt een beetje mee in de richting waarin Andy vliegt: bij hoge snelheid schiet hij
// dan minder snel uit beeld voorbij (de camera beweegt immers ook mee), en blijft hij leesbaar.
function floatText(x, y, txt, col, size) { texts.push({ x, y, txt, col, t: 0, max: 1.2, size: size || 20, dvx: G ? G.vx * 0.62 : 0 }); }
function shake(amp, dur) { shakeAmp = Math.max(shakeAmp, amp); shakeT = Math.max(shakeT, dur); }

function updateEffects(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += (p.g === undefined ? 900 : p.g) * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vr) p.rot += p.vr * dt;
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.t += dt; t.y -= 45 * dt; t.x += t.dvx * dt;
    if (t.t > t.max) texts.splice(i, 1);
  }
  // opruimen van wat achter de camera ligt
  for (let i = vines.length - 1; i >= 0; i--) {
    const v = vines[i];
    if (v === G.vine) continue;
    if (v.x < camX - 900 || (!v.anchored && v.pts[0].y > HAZARD_Y + 200)) vines.splice(i, 1);
  }
  for (let i = shrooms.length - 1; i >= 0; i--) if (shrooms[i].x < camX - 300) shrooms.splice(i, 1);
  shakeT = Math.max(0, shakeT - dt); if (shakeT === 0) shakeAmp = 0;
  flashT = Math.max(0, flashT - dt);
}

function updateCamera(dt) {
  // bij hoge snelheid kijkt de camera verder vooruit
  const tx = Math.max(-100, G.x - viewW * (G.state === 'rocket' ? 0.25 : 0.33 - clamp(G.vx / 1800, 0, 1) * 0.1));
  camX += (tx - camX) * Math.min(1, dt * 4.5);
  // verticaal meebewegen (de wereld is veel hoger dan het scherm), maar nooit onder de bodem kijken
  const bt = baseTop();
  const ty = Math.min(bt, G.y - viewH * 0.5 + clamp(G.vy * 0.15, -110, 190));
  camY += (ty - camY) * Math.min(1, dt * 4.5);
  if (G.state !== 'dead') camY = clamp(camY, G.y - viewH + 120, G.y - 100);
  camY = Math.min(camY, bt);
}

// =====================================================================
//  Ambient deeltjes (bladeren, sneeuw, vuurvliegjes, ...) in beeldcoördinaten
// =====================================================================
const makeAmb = () => Array.from({ length: 70 }, () => ({ x: Math.random() * 2000, y: Math.random() * 1400, s: rand(0.5, 1.5), ph: Math.random() * 6.28 }));
let amb = makeAmb();
function updateAmbient(dt, type, camDX, camDY) {
  for (let i = 0; i < Q.amb; i++) {
    const p = amb[i];
    let vx = 0, vy = 0;
    switch (type) {
      case 'leaf': vy = 25 + p.s * 25; vx = Math.sin(time * 1.3 + p.ph) * 30; break;
      case 'firefly': vx = Math.sin(time * 0.7 + p.ph) * 18; vy = Math.cos(time * 0.9 + p.ph * 1.3) * 18; break;
      case 'dust': vx = -40 * p.s; vy = Math.sin(time + p.ph) * 8; break;
      case 'snow': vy = 40 + p.s * 45; vx = Math.sin(time * 0.8 + p.ph) * 25; break;
      case 'ember': vy = -(30 + p.s * 50); vx = Math.sin(time * 1.1 + p.ph) * 18; break;
      case 'star': vx = Math.sin(time * 0.4 + p.ph) * 8; vy = Math.cos(time * 0.5 + p.ph) * 8; break;
    }
    p.x += vx * dt - camDX * (0.6 + p.s * 0.3);
    p.y += vy * dt - camDY * (0.6 + p.s * 0.3);
    const W = viewW + 40, H = viewH + 40;
    p.x = ((p.x + 20) % W + W) % W - 20;
    p.y = ((p.y + 20) % H + H) % H - 20;
  }
}

// =====================================================================
//  Achtergrondleven: vogelzwermen, vlinders, papegaaien, giraffen, vissen, vallende sterren
//  (klein, gedempt en achter de speelwereld, zodat het niet afleidt)
// =====================================================================
const makeLife = () => ({ flocks: [], flyers: [], sky: [], shoot: [], nextFlock: 1.5, nextParrot: 6, nextSky: 2, nextFish: 2, nextShoot: 3 });
let life = makeLife();
function updateLife(dt, P) {
  const st = P.t < 0.5 ? P.a.style : P.b.style;
  // zwermen vogels ver weg
  life.nextFlock -= dt;
  if (life.nextFlock <= 0 && life.flocks.length < 2) {
    life.nextFlock = rand(5, 10);
    const dir = Math.random() < 0.7 ? -1 : 1, f = rand(0.08, 0.16), n = 3 + ((Math.random() * 5) | 0);
    const birds = [];
    for (let j = 0; j < n; j++) birds.push({ dx: -dir * Math.abs(j - (n - 1) / 2) * 16 + rand(-4, 4), dy: Math.abs(j - (n - 1) / 2) * 9 + rand(-3, 3), ph: rand(0, 6) });
    life.flocks.push({ f, lx: camX * f + (dir < 0 ? viewW + 60 : -60), y: rand(60, 280), vx: dir * rand(35, 60), birds, style: st, size: rand(0.7, 1.1) });
  }
  for (let i = life.flocks.length - 1; i >= 0; i--) {
    const fl = life.flocks[i];
    fl.lx += fl.vx * dt;
    const sx = fl.lx - camX * fl.f;
    if (sx < -200 || sx > viewW + 200) life.flocks.splice(i, 1);
  }
  // vlinders / libellen / vuurvliegjes in de middenlaag
  const want = st === 'jungle' || st === 'swamp' || st === 'savanne' || st === 'night' ? 5 : 0;
  while (life.flyers.filter(f => f.kind !== 'parrot').length < want) {
    life.flyers.push({ kind: st === 'swamp' ? 'dragonfly' : st === 'night' ? 'glow' : 'butterfly', f: 0.5, lx: camX * 0.5 + rand(-100, viewW + 400), y: rand(200, 620), ph: rand(0, 6),
      col: ['#ff7eb6', '#ffd23f', '#7ec8ff', '#ff9a3c', '#c084fc'][(Math.random() * 5) | 0] });
  }
  life.nextParrot -= dt;
  if (st === 'jungle' && life.nextParrot <= 0) {
    life.nextParrot = rand(8, 14);
    life.flyers.push({ kind: 'parrot', f: 0.42, lx: camX * 0.42 + viewW + 60, y: rand(120, 380), ph: 0, vx: -rand(110, 150), col: Math.random() < 0.5 ? '#e8322b' : '#2f7fe0' });
  }
  for (let i = life.flyers.length - 1; i >= 0; i--) {
    const f = life.flyers[i];
    f.ph += dt;
    if (f.kind === 'parrot') f.lx += f.vx * dt;
    else { f.lx += Math.sin(f.ph * 0.8) * 25 * dt + 12 * dt; f.y += Math.cos(f.ph * 1.1) * 20 * dt; }
    const sx = f.lx - camX * f.f;
    if (sx < -150 || sx > viewW + 500 || (f.kind !== 'parrot' && f.kind !== (st === 'swamp' ? 'dragonfly' : st === 'night' ? 'glow' : 'butterfly'))) life.flyers.splice(i, 1);
  }
  // vogels boven het plafond (in de wereld, alleen zichtbaar als je hoog vliegt)
  life.nextSky -= dt;
  if (life.nextSky <= 0) {
    life.nextSky = rand(3, 7);
    const dir = Math.random() < 0.6 ? -1 : 1, n = 2 + ((Math.random() * 4) | 0), y = rand(CEIL_Y - 600, CEIL_Y - 150);
    for (let j = 0; j < n; j++) life.sky.push({ x: camX + (dir < 0 ? viewW + 80 + j * 30 : -80 - j * 30), y: y + j * rand(-20, 20), vx: dir * rand(110, 160), ph: rand(0, 6), style: st });
  }
  for (let i = life.sky.length - 1; i >= 0; i--) { const b = life.sky[i]; b.x += b.vx * dt; b.ph += dt; if (b.x < camX - 300 || b.x > camX + viewW + 300) life.sky.splice(i, 1); }
  // springende vissen (in water)
  life.nextFish -= dt;
  if (life.nextFish <= 0) {
    life.nextFish = rand(2.5, 5);
    if (st === 'jungle' || st === 'swamp' || st === 'night') {
      const x = camX + rand(0.2, 0.95) * viewW;
      fishes.push({ x, t: 0, dur: rand(0.7, 1), h: rand(50, 100), dir: Math.random() < 0.5 ? -1 : 1, col: st === 'night' ? '#9ad7ff' : Math.random() < 0.5 ? '#ff9a3c' : '#c0d6e0' });
      splash(x, 4);
    }
  }
  for (let i = fishes.length - 1; i >= 0; i--) { const f = fishes[i]; f.t += dt; if (f.t > f.dur) { splash(f.x + f.dir * 60, 4); fishes.splice(i, 1); } }
  // vallende sterren
  life.nextShoot -= dt;
  if (life.nextShoot <= 0) { life.nextShoot = rand(3, 7); if (st === 'night') life.shoot.push({ x: rand(0.2, 1) * viewW, y: rand(20, 200), t: 0 }); }
  for (let i = life.shoot.length - 1; i >= 0; i--) { life.shoot[i].t += dt; if (life.shoot[i].t > 0.8) life.shoot.splice(i, 1); }
}
