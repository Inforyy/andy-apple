'use strict';
// Andy Apples · de wereldkaart van de carrière
// Een 3D-kaart zoals in New Super Mario Bros: per wereld een groot eiland in de stijl van de biome, met een
// kronkelend pad langs de levels, een toren halverwege en het kasteel van de baas. Andy loopt er als 3D-model
// over (model3d.js). Verder: de tussenfilmpjes (pad vult zich, wereld voltooid, overtocht naar de volgende
// wereld) en het laadscherm als je een level kiest.
// Wereldcoördinaten: x (links-rechts), y (omhoog), z (diepte, van de camera af). De grond ligt op y = 0.

const MAP = {
  w: 0, at: 1, startW: null, sel: 1, cam: { x: 0, z: 0 }, zoom: 1, t: 0, walk: null, cine: null, go: null, load: null,
  cv: null, g: null, W: 0, H: 0, dpr: 1, F: 1, cy: 0, hits: [], pop: {}, fill: null, yaw: Math.PI - 0.4, cheer: false,
  free: null, uz: 1, ptr: new Map(), drag: null, // zelf rondkijken: vrije camera, eigen zoom, aanrakingen
};
const MAP_SPAN = 3300, MAP_GAP = 1900;      // breedte van een eiland en de zee tussen twee eilanden
const MAP_PITCH = Math.atan2(400, 700);     // hoe schuin de camera naar beneden kijkt
const MAP_DIST = Math.hypot(400, 700);      // afstand van de camera tot het punt waar hij naar kijkt (bij zoom 1)
const mapDist = () => MAP_DIST / MAP.zoom;
const SEA_Y = -70;                          // zeeniveau (de klif loopt van 0 tot hier)
const worldOf = n => Math.min(WORLDS - 1, Math.floor((n - 1) / LEVELS_PER_WORLD));
const worldX0 = w => w * (MAP_SPAN + MAP_GAP);
const mapLevelAt = (w, i) => w * LEVELS_PER_WORLD + i + 1;

// ---- camera en projectie ----
const MAPC = { x: 0, y: 0, z: 0, s: Math.sin(MAP_PITCH), c: Math.cos(MAP_PITCH) };
function mapCamSetup() {
  // MAP.zoom is geen lens-zoom: de camera vliegt echt dichterbij of verder weg (zelfde lens, andere afstand),
  // zodat dichtbij en ver weg er ook anders uitzien (perspectief), zoals een vliegende camera
  const d = mapDist();
  MAPC.x = MAP.cam.x; MAPC.y = d * Math.sin(MAP_PITCH); MAPC.z = MAP.cam.z - d * Math.cos(MAP_PITCH);
  MAP.F = MAP.F0;
}
// wereld -> [schermX, schermY, diepte]
function mp(x, y, z) {
  const dx = x - MAPC.x, dy = y - MAPC.y, dz = z - MAPC.z;
  const yc = dy * MAPC.c + dz * MAPC.s, zc = Math.max(4, -dy * MAPC.s + dz * MAPC.c), k = MAP.F / zc;
  return [MAP.W / 2 + dx * k, MAP.cy - yc * k, zc];
}
const mpScale = d => MAP.F / d; // pixels per wereldeenheid op diepte d
// een cirkel op de grond als ellips op het scherm
function gEll(x, z, r, y = 0) {
  const c = mp(x, y, z), a = mp(x + r, y, z), f = mp(x, y, z + r), n = mp(x, y, z - r);
  return { x: c[0], y: (f[1] + n[1]) / 2, rx: Math.abs(a[0] - c[0]), ry: Math.max(1, (n[1] - f[1]) / 2), d: c[2] };
}
const fillEll = (g, e, k = 1) => { g.beginPath(); g.ellipse(e.x, e.y, e.rx * k, e.ry * k, 0, 0, 6.3); g.fill(); };
const horizonY = () => MAP.cy - MAP.F * Math.tan(MAP_PITCH);

// ---- de indeling van een wereld (vast per wereld) ----
const mapCache = new Map();
const mapMemo = (key, make) => { let v = mapCache.get(key); if (!v) { v = make(); mapCache.set(key, v); } return v; };
// knopen: [0] is het beginpunt, [1..8] de levels (TOWER_IDX + 1 = toren, laatste = kasteel)
function mapNodes(w) {
  return mapMemo('n' + w, () => {
    const rnd = mulberry32(w * 7919 + 3), ZS = [240, 300, 680, 1000, 950, 620, 280, 440, 860], out = [];
    let x = worldX0(w) + 150;
    for (let k = 0; k <= LEVELS_PER_WORLD; k++) {
      const z = ZS[k % ZS.length] + (k ? (rnd() - 0.5) * 150 : 0);
      if (k) x += Math.abs(z - out[k - 1].z) > 280 ? 230 + rnd() * 60 : 330 + rnd() * 80;
      out.push({ x, z });
    }
    return out;
  });
}
const mapNode = (w, i) => mapNodes(w)[i + 1];
// het pad naar knoop i (vanaf de vorige) als zachte bocht
function mapSeg(w, i) {
  return mapMemo(`s${w}:${i}`, () => {
    const a = mapNode(w, i - 1), b = mapNode(w, i), pts = [];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, bend = (i % 2 ? 1 : -1) * Math.min(110, L * 0.25);
    const cx = (a.x + b.x) / 2 - dz / L * bend, cz = (a.z + b.z) / 2 + dx / L * bend;
    for (let k = 0; k <= 16; k++) { const t = k / 16, u = 1 - t; pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, z: u * u * a.z + 2 * u * t * cz + t * t * b.z }); }
    return pts;
  });
}
const mapPath = w => mapMemo('p' + w, () => { const P = []; for (let i = 0; i < LEVELS_PER_WORLD; i++) P.push(...mapSeg(w, i)); return P; });
// het eiland: een afgeronde rechthoek met een golvende kust
const ISL = w => ({ cx: worldX0(w) + 1480, cz: 600, rx: 1780, rz: 760 });
function islandIn(w, x, z) { const I = ISL(w), a = (x - I.cx) / I.rx, b = (z - I.cz) / I.rz; return a * a * a * a + b * b * b * b; }
function mapIsland(w) {
  return mapMemo('i' + w, () => {
    const I = ISL(w), pts = [];
    for (let k = 0; k < 72; k++) {
      const a = k / 72 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const r = 1 / Math.pow(c ** 4 + s ** 4, 0.25), j = 1 + (noise1(k * 0.45 + w * 7) - 0.5) * 0.14;
      pts.push({ x: I.cx + c * r * I.rx * j, z: I.cz + s * r * I.rz * j });
    }
    return pts;
  });
}
// decoratie per wereld: bomen, struiken, rotsen, bergen, een meer, bloemen, huisjes en biome-specifieke dingen
function mapDeco(w) {
  return mapMemo('d' + w, () => {
    const B = BIOMES[w], st = B.style, rnd = mulberry32(w * 911 + 17), path = mapPath(w), D = [], I = ISL(w);
    const nodes = [-1, ...Array.from({ length: LEVELS_PER_WORLD }, (_, i) => i)].map(i => mapNode(w, i));
    const free = (x, z, r, pad = 0.82) => islandIn(w, x, z) < pad
      && path.every(p => Math.hypot(p.x - x, p.z - z) > r + 70)
      && nodes.every(N => Math.hypot(N.x - x, N.z - z) > r + 120 && !(Math.abs(N.x - x) < 150 + r && z < N.z && N.z - z < 330 + r)) // niet vóór een level
      && D.every(d => !d.solid || Math.hypot(d.x - x, d.z - z) > r + d.r);
    const place = (n, tries, r, make, zmin = I.cz - I.rz, zmax = I.cz + I.rz) => {
      for (let k = 0, got = 0; k < tries && got < n; k++) {
        const x = I.cx + (rnd() * 2 - 1) * I.rx, z = zmin + rnd() * (zmax - zmin), rr = typeof r === 'function' ? r() : r;
        if (!free(x, z, rr)) continue;
        D.push(Object.assign({ x, z, r: rr }, make(rr))); got++;
      }
    };
    // een meer (bevroren, lava of moeras, per biome)
    place(1, 80, 190, () => ({ kind: 'lake', solid: true, v: rnd() }), I.cz - 200, I.cz + 380);
    // bergen achteraan (en in sommige werelden een vulkaan of blokkenberg)
    const mk = st === 'volcano' ? 'volcano' : st === 'blocky' ? 'blockhill' : st === 'poly3d' || st === 'desert' ? 'pyramid' : st === 'candy' ? 'gumdrop' : st === 'cloud' ? 'cloudhill' : st === 'neon' ? 'tower' : st === 'shroom' ? 'mushroom' : 'mount';
    place(st === 'volcano' ? 1 : 3, 60, () => 140 + rnd() * 90, r => ({ kind: mk, solid: true, h: r * (1.1 + rnd() * 0.5), v: rnd() }), I.cz + 420, I.cz + I.rz - 60);
    if (st === 'volcano') place(2, 60, () => 130 + rnd() * 60, r => ({ kind: 'mount', solid: true, h: r * 1.2, v: rnd() }), I.cz + 300, I.cz + I.rz - 60);
    // een huisje bij het begin (Andy's huis) en eentje ergens op het eiland
    const S = mapNode(w, -1);
    D.push({ kind: 'hut', x: S.x - 60, z: S.z + 190, r: 50, solid: true, main: true });
    place(1, 60, 50, () => ({ kind: 'hut', solid: true }));
    // biome-specifiek
    const special = { savanne: 'mesa', ice: 'crystal', night: 'crystal', candy: 'lolly', paint: 'blob', swamp: 'stump', blocky: 'cube', poly3d: 'gem', desert: 'cactus', shroom: 'mushroom', cloud: 'cloudpuff', neon: 'neonpillar' }[st];
    if (special) place(7, 120, () => 40 + rnd() * 40, r => ({ kind: special, solid: true, h: r * (1.2 + rnd()), v: rnd() }));
    if (B.name === 'Portaalwoud') place(2, 80, 60, () => ({ kind: 'portal', solid: true, v: rnd() }));
    // rotsen, bomen en struiken
    place(10, 120, () => 16 + rnd() * 18, () => ({ kind: 'rock', solid: true, v: rnd() }));
    place(st === 'savanne' || st === 'ice' ? 26 : 48, 500, 34, () => ({ kind: 'tree', solid: true, v: (rnd() * 4) | 0, sc: 0.75 + rnd() * 0.5 }));
    place(24, 200, 24, () => ({ kind: 'bush', solid: true, sc: 0.8 + rnd() * 0.5 }));
    // kleine dingen op de grond: bloemen en graspollen (tekenen we plat, vóór de rest)
    const flat = [];
    for (let k = 0; k < 140; k++) {
      const x = I.cx + (rnd() * 2 - 1) * I.rx, z = I.cz + (rnd() * 2 - 1) * I.rz;
      if (islandIn(w, x, z) > 0.85 || path.some(p => Math.hypot(p.x - x, p.z - z) < 40)) continue;
      flat.push({ x, z, kind: rnd() < 0.5 ? 'flower' : 'grass', c: ['#ff5a7a', '#ffd23f', '#ffffff', '#b58cff', '#ff9a2a'][(rnd() * 5) | 0] });
    }
    // vogels die over het eiland vliegen
    const birds = Array.from({ length: 5 }, () => ({ z: I.cz + (rnd() - 0.3) * I.rz, y: 260 + rnd() * 160, ph: rnd() * 10, sp: 70 + rnd() * 50 }));
    return { D, flat, birds };
  });
}
function mapResize() {
  const cv = MAP.cv, dpr = Q.lite ? 1 : Math.min(2, window.devicePixelRatio || 1); // op de laagste kwaliteit minder pixels
  MAP.W = cssW; MAP.H = cssH; MAP.dpr = dpr; MAP.lite = Q.lite;
  const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  // brandpuntsafstand: op een staand scherm iets wijder, zodat er genoeg van het pad in beeld is
  MAP.F0 = Math.min(cssH * 0.95, cssW * 1.25);
  MAP.cy = cssH * 0.6;
}

// ---- tekenen: lucht en zee ----
function drawMapSky(g, w, blend) {
  const A = BIOMES[w].rgb, Bn = BIOMES[Math.min(WORLDS - 1, w + 1)].rgb, mix = k => rgbStr(mixC(A[k], Bn[k], blend));
  const W = MAP.W, H = MAP.H, hy = horizonY();
  const sky = g.createLinearGradient(0, Math.min(0, hy - 300), 0, hy + 10); sky.addColorStop(0, mix('skyTop')); sky.addColorStop(1, mix('skyBot'));
  g.fillStyle = sky; g.fillRect(0, 0, W, Math.max(0, hy) + 12);
  if (hy > 20) {
    g.fillStyle = rgbStr(mixC(A.sun, Bn.sun, blend), 0.9); g.beginPath(); g.arc(W * 0.82, hy * 0.4, Math.max(14, Math.min(W, H) * 0.045), 0, 6.3); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let k = 0; k < 6; k++) {
      const span = W + 300, x = ((k * 330 + MAP.t * 12 - MAP.cam.x * 0.05) % span + span) % span - 150, y = hy * (0.18 + (k % 3) * 0.2);
      g.beginPath(); g.ellipse(x, y, 60, 15, 0, 0, 6.3); g.ellipse(x + 30, y - 9, 34, 15, 0, 0, 6.3); g.fill();
    }
    // verre bergen aan de horizon
    for (const [col, amp, par, off] of [[mix('far2'), 70, 0.03, 3], [mix('far'), 40, 0.06, 0]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, hy + 2);
      for (let x = 0; x <= W + 20; x += 16) g.lineTo(x, hy - 6 - noise1((x + MAP.cam.x * par) * 0.006 + w * 3 + off) * amp);
      g.lineTo(W, hy + 2); g.fill();
    }
  }
  const sea = g.createLinearGradient(0, hy, 0, H); sea.addColorStop(0, mix('hazTop')); sea.addColorStop(1, mix('hazBot'));
  g.fillStyle = sea; g.fillRect(0, Math.max(0, hy), W, H);
  // golfjes op zee
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2;
  for (let k = 0; k < (Q.lite ? 0 : 18); k++) {
    const z = MAP.cam.z - 450 + k * 150, p = mp(MAP.cam.x, SEA_Y, z);
    if (p[1] < hy || p[1] > H + 10 || p[2] < 60) continue;
    const sp = 140 * mpScale(p[2]), off = ((MAP.t * 25 + k * 57) * mpScale(p[2])) % sp;
    g.beginPath(); for (let x = -off; x < W; x += sp) { g.moveTo(x, p[1]); g.quadraticCurveTo(x + sp * 0.12, p[1] - 3, x + sp * 0.25, p[1]); } g.stroke();
  }
}
// ---- het eiland ----
function drawMapIsland(g, w, locked) {
  const B = BIOMES[w], c = B.c, I = mapIsland(w);
  const top = I.map(p => mp(p.x, 0, p.z)), bot = I.map(p => mp(p.x, SEA_Y, p.z));
  let minX = Infinity, maxX = -Infinity;
  for (const p of top) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
  if (maxX < -50 || minX > MAP.W + 50) return false;
  const n = I.length, poly = (P, close = true) => { g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (close) g.closePath(); };
  // schuim rond de kust
  const foam = I.map(p => { const I2 = ISL(w); return mp(I2.cx + (p.x - I2.cx) * 1.03, SEA_Y, I2.cz + (p.z - I2.cz) * 1.05); });
  g.strokeStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(MAP.t * 2)})`; g.lineWidth = Math.max(2, 5 * mpScale(foam[18][2])); poly(foam); g.stroke();
  // klif: per stukje kust een vlak, met licht van links
  const rockA = shade(c.canopy, -0.55), dirt = B.style === 'candy' ? '#f7c6dc' : B.style === 'ice' ? '#cfe8f5' : B.style === 'volcano' ? '#4a3028' : B.style === 'desert' ? '#c9985a' : B.style === 'neon' ? '#2a1048' : B.style === 'cloud' ? '#dfe9f3' : B.style === 'shroom' ? '#6a4a8a' : '#8a6a44';
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = I[i], b = I[j], nx = b.z - a.z, lit = clamp(0.5 - nx / 120 * 0.25, 0.2, 0.8);
    g.fillStyle = shade(dirt, (lit - 0.5) * 0.8 - 0.1);
    g.beginPath(); g.moveTo(top[i][0], top[i][1]); g.lineTo(top[j][0], top[j][1]); g.lineTo(bot[j][0], bot[j][1]); g.lineTo(bot[i][0], bot[i][1]); g.closePath(); g.fill();
  }
  // grasrand boven de klif
  g.fillStyle = rockA; poly(top); g.fill();
  // grond met strepen (zoals de kaart van Mario)
  g.save(); poly(top); g.clip();
  const neon = B.style === 'neon', g1 = neon ? '#2a1048' : shade(c.canopy2, 0.12), g2 = neon ? '#1c0834' : shade(c.canopy2, -0.04), I2 = ISL(w); // neon: donkere grond
  for (let z = I2.cz + I2.rz + 60, k = 0; z > I2.cz - I2.rz - 60; z -= 120, k++) {
    const a = mp(I2.cx - I2.rx - 200, 0, z), b = mp(I2.cx + I2.rx + 200, 0, z), cc = mp(I2.cx + I2.rx + 200, 0, z - 120), d = mp(I2.cx - I2.rx - 200, 0, z - 120);
    g.fillStyle = k % 2 ? g1 : g2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
  }
  g.restore();
  g.strokeStyle = shade(c.canopy, -0.3); g.lineWidth = 3; poly(top); g.stroke();
  // grasrandje net binnen de kust
  const rim = I.map(p => mp(I2.cx + (p.x - I2.cx) * 0.97, 0, I2.cz + (p.z - I2.cz) * 0.96));
  g.strokeStyle = shade(c.canopy2, 0.3); g.lineWidth = 2; g.setLineDash([10, 8]); poly(rim); g.stroke(); g.setLineDash([]);
  if (locked) { // nog niet vrijgespeeld: in de mist
    g.fillStyle = rgbStr(B.rgb.skyBot, 0.72); poly(top); g.fill();
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; g.beginPath(); g.moveTo(top[i][0], top[i][1]); g.lineTo(top[j][0], top[j][1]); g.lineTo(bot[j][0], bot[j][1]); g.lineTo(bot[i][0], bot[i][1]); g.closePath(); g.fill(); }
    const p = mp(I2.cx, 150, I2.cz), s = mpScale(p[2]);
    g.font = `900 ${Math.max(20, 120 * s)}px Trebuchet MS, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText('?', p[0], p[1]);
  }
  return true;
}
// plat op de grond: meer, bloemen, gras, het pad
function drawMapGround(g, w, prog) {
  const B = BIOMES[w], st = B.style, { D, flat } = mapDeco(w);
  for (const d of D) if (d.kind === 'lake') drawMapLake(g, d, st);
  if (!Q.lite) for (const f of flat) { // bloemetjes en gras (niet op de laagste kwaliteit)
    const p = mp(f.x, 0, f.z); if (p[0] < -20 || p[0] > MAP.W + 20 || p[1] > MAP.H + 20) continue;
    const s = mpScale(p[2]);
    if (f.kind === 'flower' && st !== 'volcano' && st !== 'ice') { g.fillStyle = f.c; g.beginPath(); g.arc(p[0], p[1], Math.max(1.5, 4 * s), 0, 6.3); g.fill(); g.fillStyle = '#fff6a0'; g.beginPath(); g.arc(p[0], p[1], Math.max(0.8, 1.6 * s), 0, 6.3); g.fill(); }
    else { g.strokeStyle = shade(B.c.canopy2, st === 'ice' ? 0.5 : -0.25); g.lineWidth = Math.max(1, 2 * s); g.beginPath(); for (const dx of [-5, 0, 5]) { g.moveTo(p[0] + dx * s, p[1]); g.lineTo(p[0] + dx * 1.6 * s, p[1] - 11 * s); } g.stroke(); }
  }
  drawMapPath(g, w, prog);
}
function drawMapLake(g, d, st) {
  const pts = [], N = 28;
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, r = d.r * (1 + (noise1(k * 0.6 + d.v * 9) - 0.5) * 0.3); pts.push(mp(d.x + Math.cos(a) * r * 1.3, 0, d.z + Math.sin(a) * r)); }
  const shape = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
  const col = st === 'volcano' ? ['#ff7a1a', '#ffcf3a'] : st === 'ice' ? ['#bfe9ff', '#ffffff'] : st === 'swamp' ? ['#4e6b3a', '#7e9a5a'] : st === 'candy' ? ['#ff9ad0', '#ffe0f0'] : st === 'desert' ? ['#d9a45a', '#f6d8a0'] : st === 'shroom' ? ['#3fb89a', '#a0ffe0'] : st === 'cloud' ? ['#6a7898', '#ffffff'] : st === 'neon' ? ['#ff2bd6', '#9ff6ff'] : ['#3fa7e0', '#bfeaff'];
  g.fillStyle = shade(col[0], -0.35); shape(); g.fill();
  g.save(); shape(); g.clip();
  const c = mp(d.x, 0, d.z);
  g.fillStyle = col[0]; g.translate(0, 4 * mpScale(c[2])); shape(); g.fill(); g.restore();
  // glinstering / bubbels / ijsscheuren
  const s = mpScale(c[2]);
  g.strokeStyle = col[1]; g.lineWidth = Math.max(1, 2 * s);
  for (let k = 0; k < 3; k++) {
    const ph = (MAP.t * 0.5 + k / 3) % 1, e = gEll(d.x + (hash(k + d.v) - 0.5) * d.r, d.z + (hash(k * 3 + d.v) - 0.5) * d.r * 0.6, 20 + ph * 50);
    g.globalAlpha = st === 'ice' ? 0.5 : 1 - ph; g.beginPath(); g.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, 6.3); g.stroke();
  }
  g.globalAlpha = 1;
  if (st === 'swamp' || st === 'jungle') { g.fillStyle = '#4caf50'; for (let k = 0; k < 4; k++) { const e = gEll(d.x + (hash(k * 5 + d.v) - 0.5) * d.r * 1.4, d.z + (hash(k * 7 + d.v) - 0.5) * d.r * 0.8, 16); g.beginPath(); g.ellipse(e.x, e.y, e.rx, e.ry, 0, 0.4, 6.1); g.lineTo(e.x, e.y); g.fill(); } }
}
// ribbon op de grond langs de punten (breedte hw), voor het pad
function groundRibbon(g, pts, hw, upto) {
  const L = [], R = [];
  for (let k = 0; k <= upto; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * hw, nz = dx / l * hw, p = pts[k];
    L.push(mp(p.x + nx, 0, p.z + nz)); R.push(mp(p.x - nx, 0, p.z - nz));
  }
  g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath(); g.fill();
}
function drawMapPath(g, w, prog) {
  // prog: tot welk level het pad open is (met een fractie voor het vul-filmpje)
  for (let i = 0; i < LEVELS_PER_WORLD; i++) {
    const n = mapLevelAt(w, i), pts = mapSeg(w, i), f = clamp(prog - (n - 1), 0, 1);
    // dicht: stippeltjes
    g.fillStyle = 'rgba(70,50,30,.45)';
    for (let k = 1; k < pts.length - 1; k += 2) { const e = gEll(pts[k].x, pts[k].z, 7); if (e.x > -20 && e.x < MAP.W + 20) fillEll(g, e); }
    if (f <= 0) continue;
    const last = Math.max(1, Math.round(f * (pts.length - 1)));
    g.fillStyle = '#6b4423'; groundRibbon(g, pts, 17, last);
    g.fillStyle = '#e0b276'; groundRibbon(g, pts, 11, last);
    g.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 1; k < last; k += 2) { const e = gEll(pts[k].x, pts[k].z, 3); fillEll(g, e); }
    if (f < 1) { const p = mp(pts[last].x, 0, pts[last].z); g.fillStyle = '#fff6c0'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(p[0] + rand(-12, 12), p[1] + rand(-8, 4), rand(2, 5), 0, 6.3); g.fill(); } }
  }
}

// ---- 3D-dingen op het eiland ----
const mapShade = (col, locked) => locked ? shade(col, -0.45) : col;
// voeg een lijst onderdelen toe op wereldpositie (x, 0, z)
const mapMesh = (parts, x, z, o, sc = 1) => r3Add(parts, p => [x + p[0] * sc, p[1] * sc, z + p[2] * sc], mp, o);
const boxPart = (c, h, col, extra) => Object.assign({ sh: shapeBox(), m: p => [c[0] + p[0] * h[0], c[1] + p[1] * h[1], c[2] + p[2] * h[2]], col, cen: c }, extra);
const cylPart = (c, r, h, col, seg = 10, k = 1, extra) => Object.assign({ sh: shapeCyl(seg, k), m: p => [c[0] + p[0] * r, c[1] + p[1] * h, c[2] + p[2] * r], col, cen: [c[0], c[1] + h * 0.4, c[2]] }, extra);
const ballPart = (c, r, col, seg = 8, extra) => Object.assign({ sh: shapeSphere(seg, Math.max(4, seg * 0.6 | 0)), m: p => [c[0] + p[0] * r[0], c[1] + p[1] * r[1], c[2] + p[2] * r[2]], col, cen: c }, extra);
// vlaggetje (2D) op een 3D-punt
function mapFlag(g, x, y, z, col, icon) {
  const p = mp(x, y, z), s = mpScale(p[2]), wv = Math.sin(MAP.t * 6 + x) * 3 * s;
  g.strokeStyle = '#555'; g.lineWidth = Math.max(1.5, 2.5 * s); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0], p[1] - 40 * s); g.stroke();
  g.fillStyle = col; g.beginPath(); g.moveTo(p[0], p[1] - 40 * s); g.lineTo(p[0] + 34 * s, p[1] - 32 * s + wv); g.lineTo(p[0], p[1] - 22 * s); g.fill();
  if (icon) { g.font = `${Math.max(8, 13 * s)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, p[0] + 13 * s, p[1] - 31 * s); }
}
function mapCastle(g, w, N, done, open) {
  const B = BOSSES[w], L = !open, stone = mapShade('#cfc8bd', L), stoneD = mapShade('#a39b8f', L), roof = mapShade(B.col, L), roofD = mapShade(shade(B.col, -0.25), L);
  const P = [
    boxPart([0, 42, 30], [70, 42, 34], stoneD),
    cylPart([-78, 0, -4], 27, 118, stone), cylPart([78, 0, -4], 27, 118, stone),
    cylPart([-78, 118, -4], 34, 58, roofD, 10, 0), cylPart([78, 118, -4], 34, 58, roofD, 10, 0),
    cylPart([0, 0, 40], 33, 175, stone), cylPart([0, 175, 40], 42, 78, roof, 10, 0),
    boxPart([0, 24, -5], [17, 24, 2], '#3a220f', { ink: false }),
    boxPart([0, 120, 6], [7, 11, 2], '#3a220f', { ink: false }),
    boxPart([-78, 80, -31], [5, 9, 2], '#3a220f', { ink: false }), boxPart([78, 80, -31], [5, 9, 2], '#3a220f', { ink: false }),
  ];
  for (let k = -3; k <= 3; k++) P.push(boxPart([k * 18, 90, -3], [5, 6, 3], stone));
  mapMesh(P, N.x, N.z + 100, undefined, 1.35); // het kasteel staat achter de schijf, zodat Andy ervoor staat
  const top = mp(N.x, 342, N.z + 154);
  r3Item(top[2] - 400, () => mapFlag(g, N.x, 342, N.z + 154, done ? '#e8322b' : '#222', done ? '🍎' : '👑'));
}
function mapTower(g, w, N, done, open) {
  const L = !open, stone = mapShade('#d8cfc0', L), roof = mapShade(shade(BIOMES[w].c.canopy2, -0.1), L);
  const P = [cylPart([0, 0, 18], 36, 128, stone, 12), cylPart([0, 128, 18], 46, 62, roof, 12, 0), boxPart([0, 20, -17], [12, 20, 2], '#3a220f', { ink: false }), boxPart([0, 88, -17], [5, 9, 2], '#3a220f', { ink: false })];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; P.push(boxPart([Math.sin(a) * 36, 124, 18 + Math.cos(a) * 36], [6, 7, 6], stone)); }
  mapMesh(P, N.x, N.z + 75, undefined, 1.2);
  r3Item(mp(N.x, 228, N.z + 97)[2] - 400, () => mapFlag(g, N.x, 228, N.z + 97, done ? '#e8322b' : '#5a3a9a', done ? '🍎' : '⚔️'));
}
function mapHut(x, z, main) {
  const P = [boxPart([0, 22, 0], [30, 22, 26], '#f1dfb4'), cylPart([0, 44, 0], 44, 34, main ? '#e8322b' : '#4f8fcf', 4, 0, { m: p => { const q = rotY([p[0] * 44, 0, p[2] * 44], Math.PI / 4); return [q[0], 44 + p[1] * 34, q[2]]; } }),
    boxPart([0, 14, -27], [8, 14, 1.5], '#6b4423', { ink: false }), boxPart([16, 28, -27], [5, 5, 1.5], '#9fd6ff', { ink: false })];
  if (main) P.push(ballPart([0, 88, 0], [9, 9, 9], '#e8322b'), ballPart([4, 98, 0], [5, 2, 3], '#4caf50', 6));
  mapMesh(P, x, z);
}
// één decoratie-item in de gesorteerde lijst zetten
function mapDecoItem(g, w, d) {
  const p = mp(d.x, 0, d.z);
  if (p[0] < -300 || p[0] > MAP.W + 300 || p[1] < -100 || p[1] > MAP.H + 400) return;
  const s = mpScale(p[2]), B = BIOMES[w], c = B.c, st = B.style;
  switch (d.kind) {
    case 'tree': r3Item(p[2], () => {
      const sp = treeSprite(w, d.v), sc = s * 0.34 * d.sc;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(p[0], p[1], 38 * s * d.sc, 13 * s * d.sc, 0, 0, 6.3); g.fill();
      g.drawImage(sp.c, p[0] - sp.w * sc / 2, p[1] - sp.h * sc + 6 * s, sp.w * sc, sp.h * sc);
    }); break;
    case 'bush': r3Item(p[2], () => {
      g.fillStyle = shade(c.canopy, -0.15); g.beginPath(); g.ellipse(p[0], p[1] - 10 * s * d.sc, 26 * s * d.sc, 16 * s * d.sc, 0, 0, 6.3); g.fill();
      g.fillStyle = shade(c.canopy2, 0.12); g.beginPath(); g.ellipse(p[0] - 7 * s, p[1] - 16 * s * d.sc, 12 * s * d.sc, 8 * s * d.sc, 0, 0, 6.3); g.fill();
      if (st === 'jungle' || st === 'paint') { g.fillStyle = '#e8322b'; g.beginPath(); g.arc(p[0] + 8 * s, p[1] - 14 * s, 3.5 * s, 0, 6.3); g.fill(); }
    }); break;
    case 'rock': mapMesh([st === 'blocky' ? boxPart([0, d.r * 0.6, 0], [d.r, d.r * 0.6, d.r], '#8a8a8a') : ballPart([0, d.r * 0.25, 0], [d.r, d.r * 0.75, d.r * 0.9], st === 'candy' ? '#fff0f6' : st === 'volcano' ? '#3d2b26' : '#9a9590', 6)], d.x, d.z); break;
    case 'mount': {
      const col = st === 'ice' ? '#9fc9df' : st === 'volcano' ? '#5a3a2e' : st === 'night' ? '#3a3a6a' : shade(c.far2, -0.1);
      const P = [cylPart([0, 0, 0], d.r, d.h, col, 9, 0)];
      if (st !== 'volcano') P.push(cylPart([0, d.h * 0.62, 0], d.r * 0.4, d.h * 0.4, st === 'candy' ? '#ff7eb9' : '#ffffff', 9, 0, { ink: false }));
      mapMesh(P, d.x, d.z); break;
    }
    case 'volcano': {
      mapMesh([cylPart([0, 0, 0], d.r * 1.3, d.h * 0.9, '#5a3a2e', 12, 0.3), cylPart([0, d.h * 0.9 - 2, 0], d.r * 0.39, 3, '#ff7a1a', 12, 1, { flat: true, ink: false })], d.x, d.z);
      const tp = mp(d.x, d.h * 0.9, d.z);
      r3Item(tp[2] - 600, () => { // rookpluimen
        for (let k = 0; k < 5; k++) { const ph = (MAP.t * 0.25 + k / 5) % 1, q = mp(d.x + ph * 80, d.h * 0.9 + ph * 260, d.z), r = (20 + ph * 50) * mpScale(q[2]); g.fillStyle = `rgba(90,80,80,${0.5 * (1 - ph)})`; g.beginPath(); g.arc(q[0], q[1], r, 0, 6.3); g.fill(); }
      }); break;
    }
    case 'blockhill': { const P = [], k = d.r / 3; for (let i = 0; i < 3; i++) P.push(boxPart([0, k * (i + 0.5) * 1.3, 0], [d.r - i * k * 0.9, k * 0.65, d.r - i * k * 0.9], i === 2 ? '#5aa532' : '#8a6238')); mapMesh(P, d.x, d.z); break; }
    case 'pyramid': mapMesh([cylPart([0, 0, 0], d.r, d.h, st === 'desert' ? '#e2b06a' : d.v < 0.5 ? '#ff4fb4' : '#39d5ff', 4, 0)], d.x, d.z); break;
    case 'cloudhill': mapMesh([ballPart([0, d.h * 0.2, 0], [d.r, d.h * 0.55, d.r * 0.8], '#ffffff', 10), ballPart([d.r * 0.5, d.h * 0.45, -10], [d.r * 0.55, d.h * 0.4, d.r * 0.5], '#f2f8ff', 8)], d.x, d.z); break;
    case 'cloudpuff': mapMesh([ballPart([0, d.r * 0.5, 0], [d.r, d.r * 0.6, d.r * 0.8], '#ffffff', 8), ballPart([d.r * 0.5, d.r * 0.8, 0], [d.r * 0.55, d.r * 0.45, d.r * 0.5], '#eef6ff', 6)], d.x, d.z); break;
    case 'mushroom': { const s = d.kind === 'mushroom' && d.h > 120 ? 1 : 0.6, hh = d.h * s;
      mapMesh([cylPart([0, 0, 0], d.r * 0.25, hh, '#f3ead8', 8), Object.assign(ballPart([0, hh, 0], [d.r * 0.9, d.r * 0.55, d.r * 0.9], ['#c9425e', '#6a8cff', '#ffb02e'][(d.v * 3) | 0], 10), {})], d.x, d.z); break; }
    case 'cactus': mapMesh([cylPart([0, 0, 0], d.r * 0.3, d.h, '#5f8f34', 7, 0.9), cylPart([d.r * 0.3, d.h * 0.45, 0], d.r * 0.18, d.h * 0.35, '#6fa03e', 6, 0.9)], d.x, d.z); break;
    case 'neonpillar': case 'tower': { const hh = d.kind === 'tower' ? d.h * 1.4 : d.h * 1.2, w = d.kind === 'tower' ? d.r * 0.45 : d.r * 0.3;
      mapMesh([boxPart([0, hh / 2, 0], [w, hh / 2, w], '#1a0a36')], d.x, d.z);
      r3Item(p[2] - 1, () => { const a = mp(d.x - w, hh, d.z - w), b = mp(d.x - w, 0, d.z - w), c2 = mp(d.x + w, hh, d.z - w); g.strokeStyle = d.v < 0.5 ? '#00e5ff' : '#ff2bd6'; g.lineWidth = Math.max(1.5, 3 * s); g.shadowColor = g.strokeStyle; g.shadowBlur = 8; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(a[0], a[1]); g.lineTo(c2[0], c2[1]); g.stroke(); g.shadowBlur = 0; });
      break; }
    case 'gumdrop': mapMesh([ballPart([0, 0, 0], [d.r, d.h * 0.7, d.r], ['#ff7eb9', '#7ee0ff', '#b7ff7e', '#ffe07e'][(d.v * 4) | 0], 10)], d.x, d.z); break;
    case 'mesa': mapMesh([cylPart([0, 0, 0], d.r, d.h * 0.7, '#c46a3a', 7, 0.8), cylPart([0, d.h * 0.7, 0], d.r * 0.8, 4, '#d98a4a', 7)], d.x, d.z); break;
    case 'crystal': mapMesh([cylPart([0, 0, 0], d.r * 0.35, d.h * 1.2, d.v < 0.5 ? '#7ad7ff' : '#c79bff', 5, 0), cylPart([d.r * 0.4, 0, 6], d.r * 0.22, d.h * 0.7, '#a8e8ff', 5, 0)], d.x, d.z); break;
    case 'lolly': mapMesh([cylPart([0, 0, 0], 4, d.h, '#ffffff', 6), Object.assign({ sh: shapeCyl(14), m: q => [q[0] * d.r * 0.6, d.h - q[2] * d.r * 0.6, (q[1] - 0.5) * 8], col: ['#ff5a9a', '#7ee0ff', '#ffd23f'][(d.v * 3) | 0], cen: [0, d.h, 0] })], d.x, d.z); break;
    case 'blob': mapMesh([ballPart([0, d.r * 0.4, 0], [d.r, d.r * 0.8, d.r * 0.8], ['#ed1c24', '#00a2e8', '#fff200', '#22b14c'][(d.v * 4) | 0], 8)], d.x, d.z, { inkW: 3 }); break;
    case 'stump': mapMesh([cylPart([0, 0, 0], d.r * 0.5, d.r * 0.7, '#5a4a32', 8, 0.8), cylPart([0, d.r * 0.7, 0], d.r * 0.4, 2, '#9a8a62', 8)], d.x, d.z); break;
    case 'cube': mapMesh([boxPart([0, d.r * 0.5, 0], [d.r * 0.5, d.r * 0.5, d.r * 0.5], d.v < 0.5 ? '#6ab04c' : '#8a6238')], d.x, d.z); break;
    case 'gem': { // twee kegels punt aan punt; de onderste is een halve slag om de x-as gedraaid
      const r = d.r * 0.5, y0 = d.r * 0.6;
      mapMesh([cylPart([0, y0, 0], r, d.r * 0.9, '#39d5ff', 5, 0), { sh: shapeCyl(5, 0), m: q => [q[0] * r, y0 - q[1] * y0, -q[2] * r], col: '#ff4fb4', cen: [0, y0 * 0.6, 0] }], d.x, d.z); break;
    }
    case 'portal': r3Item(p[2], () => {
      const col = d.v < 0.5 ? '120,200,255' : '255,160,60', q = mp(d.x, 60, d.z), r = 55 * mpScale(q[2]);
      g.lineWidth = Math.max(3, 10 * mpScale(q[2])); g.strokeStyle = `rgba(${col},${0.7 + 0.3 * Math.sin(MAP.t * 4)})`; g.beginPath(); g.ellipse(q[0], q[1], r * 0.7, r, 0, 0, 6.3); g.stroke();
      g.fillStyle = `rgba(${col},.25)`; g.fill();
    }); break;
    case 'hut': mapHut(d.x, d.z, d.main); if (d.main) r3Item(p[2] - 1, () => { const q = mp(d.x + 50, 0, d.z - 40), s2 = mpScale(q[2]); g.fillStyle = '#6b4423'; g.fillRect(q[0] - 3 * s2, q[1] - 44 * s2, 6 * s2, 44 * s2); g.fillStyle = '#a0703c'; g.fillRect(q[0] - 30 * s2, q[1] - 52 * s2, 60 * s2, 24 * s2); g.fillStyle = '#fff'; g.font = `900 ${Math.max(9, 14 * s2)}px Trebuchet MS, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`W${w + 1}`, q[0], q[1] - 40 * s2); }); break;
  }
}
// een level op de kaart: een gouden schijf (of de toren / het kasteel)
function mapNodeItem(g, w, i, prog) {
  const n = mapLevelAt(w, i), N = mapNode(w, i);
  const open = n <= Math.floor(prog + 1e-6), done = save.career.stars[n - 1] > 0 || n < save.career.unlocked;
  const e0 = gEll(N.x, N.z, 34);
  if (i === LEVELS_PER_WORLD - 1) { mapCastle(g, w, N, done, open); MAP.hits.push({ n, x: e0.x, y: e0.y - 100 * mpScale(e0.d), r: 150 * mpScale(e0.d) }); }
  else if (i === TOWER_IDX) { mapTower(g, w, N, done, open); MAP.hits.push({ n, x: e0.x, y: e0.y - 70 * mpScale(e0.d), r: 90 * mpScale(e0.d) }); }
  r3Item(e0.d + 30, () => {
    const pop = MAP.pop[n] ? Math.max(0, 1 - (MAP.t - MAP.pop[n]) / 0.5) : 0, k = 1 + pop * 0.5;
    const e = gEll(N.x, N.z, 34 * k, 7), eb = gEll(N.x, N.z, 34 * k, 0);
    {
      g.fillStyle = 'rgba(0,0,0,.25)'; fillEll(g, { x: eb.x, y: eb.y + 3, rx: eb.rx * 1.08, ry: eb.ry * 1.08 });
      g.fillStyle = '#a8760a'; fillEll(g, eb); g.fillRect(eb.x - eb.rx, e.y, eb.rx * 2, eb.y - e.y);
      g.fillStyle = '#ffd23f'; fillEll(g, e);
      g.fillStyle = !open ? '#2a2a30' : done ? '#2f7fe0' : '#e8322b'; fillEll(g, e, 0.7);
      g.fillStyle = 'rgba(255,255,255,.35)'; fillEll(g, { x: e.x - e.rx * 0.2, y: e.y - e.ry * 0.25, rx: e.rx * 0.35, ry: e.ry * 0.25 });
      MAP.hits.push({ n, x: e.x, y: e.y, r: Math.max(28, e.rx * 1.4) });
    }
    if (MAP.sel === n && !MAP.cine && !MAP.go) { g.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * Math.sin(MAP.t * 5)})`; g.lineWidth = 3; g.beginPath(); g.ellipse(eb.x, eb.y, eb.rx * 1.5, eb.ry * 1.5, 0, 0, 6.3); g.stroke(); }
  });
  // sterren boven een gehaald level
  const st = save.career.stars[n - 1];
  if (st) {
    const onIt = !MAP.walk && MAP.startW === null && MAP.at === n;
    const h = i === LEVELS_PER_WORLD - 1 ? 365 : i === TOWER_IDX ? 255 : onIt ? 150 : 46, q = mp(N.x, h, N.z + (i === LEVELS_PER_WORLD - 1 ? 154 : i === TOWER_IDX ? 97 : 0));
    r3Item(q[2] - 500, () => { const s = mpScale(q[2]); g.font = `900 ${Math.max(11, 18 * s)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(80,50,0,.7)'; const t = '★'.repeat(st); g.strokeText(t, q[0], q[1]); g.fillStyle = '#ffd23f'; g.fillText(t, q[0], q[1]); });
  }
}
// Andy in 3D, met schaduw
function mapAndyItem(g) {
  const A = mapAndyPos(), W = MAP.walk, sh = gEll(A.x, A.z, 26), h = A.h || 0;
  r3Item(sh.d + 20, () => { g.fillStyle = 'rgba(0,0,0,.3)'; fillEll(g, sh, 1 - Math.min(0.5, h / 120)); });
  const pose = { t: MAP.t, walk: W ? W.t * 13 : 0, walkAmt: W ? 1 : 0, cheer: MAP.cheer, cape: lvl('wingsuit') > 0 };
  if (W) pose.squash = Math.max(0, 1 - h / 4) * 0.7; // even inveren bij elke landing
  if (MAP.go) { const t = MAP.go.t; if (t < 0.16) pose.crouch = t / 0.16; else if (h > 2) { pose.air = true; pose.cheer = t < 0.5; } else pose.squash = 0.6; }
  const idle = MAP.t % 7;
  if (!W && !MAP.cheer && !MAP.go) { if (idle > 5.6) pose.wave = true; else if (idle > 3 && idle < 3.8) pose.beat = true; }
  drawAndy3D(mp, A.x, h, A.z, MAP.yaw, 1.9, myLook(), pose, -5);
}
function mapBirds(g, w) {
  const { birds } = mapDeco(w), I = ISL(w);
  g.strokeStyle = 'rgba(40,30,40,.75)'; g.lineCap = 'round';
  for (const b of birds) {
    const x = I.cx - I.rx + ((MAP.t * b.sp + b.ph * 400) % (I.rx * 2 + 800)) - 400, p = mp(x, b.y, b.z), s = mpScale(p[2]), f = Math.sin(MAP.t * 8 + b.ph) * 6 * s;
    if (p[0] < -30 || p[0] > MAP.W + 30) continue;
    g.lineWidth = Math.max(1.2, 2.5 * s); g.beginPath(); g.moveTo(p[0] - 11 * s, p[1] - f); g.quadraticCurveTo(p[0] - 4 * s, p[1] - 5 * s, p[0], p[1]); g.quadraticCurveTo(p[0] + 4 * s, p[1] - 5 * s, p[0] + 11 * s, p[1] - f); g.stroke();
  }
}
function mapFrame(dt) {
  if (!MAP.cv) return;
  MAP.t += dt;
  if (MAP.W !== cssW || MAP.H !== cssH || MAP.lite !== Q.lite) mapResize();
  mapUpdate(dt);
  const g = MAP.g;
  g.setTransform(MAP.dpr, 0, 0, MAP.dpr, 0, 0);
  if (MAP.load) { drawMapLoad(g, MAP.load); return; }
  mapCamSetup();
  // welke werelden zijn in beeld (tijdens een overtocht twee)
  const WS = MAP_SPAN + MAP_GAP, f = (MAP.cam.x - ISL(0).cx) / WS, wa = clamp(Math.floor(f), 0, WORLDS - 1);
  const b0 = clamp((f - wa - 0.25) / 0.5, 0, 1), blend = b0 * b0 * (3 - 2 * b0); // de lucht wisselt boven zee
  drawMapSky(g, wa, blend);
  MAP.hits = [];
  const prog = MAP.fill ? MAP.fill.from + (MAP.fill.to - MAP.fill.from) * MAP.fill.k : mapProg();
  const wu = worldOf(save.career.unlocked), reveal = MAP.startW !== null ? MAP.startW : -1;
  const aw = MAP.walk ? MAP.walk.w : MAP.startW !== null ? MAP.startW : worldOf(Math.max(1, MAP.at));
  for (const w of [wa - 1, wa, wa + 1, wa + 2]) {
    if (w < 0 || w >= WORLDS) continue;
    const locked = w > wu && w !== reveal;
    if (w > wu + 1) continue;
    if (!drawMapIsland(g, w, locked)) continue;
    if (locked) continue;
    r3Begin();
    drawMapGround(g, w, prog);
    for (const d of mapDeco(w).D) if (d.kind !== 'lake') mapDecoItem(g, w, d);
    for (let i = 0; i < LEVELS_PER_WORLD; i++) mapNodeItem(g, w, i, prog);
    if (aw === w) mapAndyItem(g);
    r3Flush(g);
    mapBirds(g, w);
  }
  drawMapCine(g);
  drawMapGo(g);
}
// ---- Andy lopen, camera, filmpjes ----
function mapProg() { return Math.min(save.career.anim, save.career.unlocked); }
function mapAndyPos() {
  const W = MAP.walk;
  if (W) {
    const k = clamp(W.t / W.dur, 0, 1), f = k * (W.pts.length - 1), i = Math.min(W.pts.length - 2, Math.floor(f)), r = f - i;
    const a = W.pts[i], b = W.pts[i + 1];
    return { x: a.x + (b.x - a.x) * r, z: a.z + (b.z - a.z) * r, h: Math.abs(Math.sin(k * Math.PI * W.hops)) * 16, dx: b.x - a.x, dz: b.z - a.z };
  }
  const G0 = MAP.go ? { h: Math.max(0, Math.sin(clamp((MAP.go.t - 0.16) / 0.5, 0, 1) * Math.PI)) * 70 } : {}; // eerst inzakken, dan springen
  if (MAP.startW !== null) return Object.assign({}, mapNode(MAP.startW, -1), G0); // op het beginpunt van een (nieuwe) wereld
  const n = MAP.at, w = worldOf(n);
  return Object.assign({}, n < 1 ? mapNode(0, -1) : mapNode(w, (n - 1) % LEVELS_PER_WORLD), G0);
}
// laat Andy over het pad lopen van level a naar level b (binnen één wereld; a = 0 of het begin van de wereld = beginpunt)
function mapWalk(from, to, cb) {
  const w = worldOf(to), pts = [], dir = to >= from ? 1 : -1;
  if (dir > 0) { for (let n = from + 1; n <= to; n++) { const i = (n - 1) % LEVELS_PER_WORLD; if (worldOf(n) !== w) continue; pts.push(...mapSeg(w, i)); } }
  else { for (let n = from; n > to; n--) { const i = (n - 1) % LEVELS_PER_WORLD; pts.push(...mapSeg(w, i).slice().reverse()); } }
  MAP.startW = null;
  if (pts.length < 2) { MAP.at = to; if (cb) cb(); return; }
  MAP.walk = { pts, t: 0, dur: 0.5 * Math.abs(to - from) + 0.3, hops: 3 * Math.abs(to - from), w, to, cb };
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
  // Andy draait naar waar hij heen loopt, en staat anders schuin naar de camera
  const A = mapAndyPos(), ty = MAP.walk && (A.dx || A.dz) ? Math.atan2(A.dx, A.dz) : Math.PI - 0.4;
  let dy = ((ty - MAP.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  MAP.yaw += dy * Math.min(1, dt * 10);
  // camera volgt Andy (of het filmpje); bij een overtocht vliegt hij omhoog, bij het kiezen van een level naar Andy toe
  // zelf rondkijken (slepen) geldt tot Andy weer gaat lopen, een filmpje begint of je een level kiest
  const C = MAP.cine;
  if (MAP.walk || C || MAP.go || MAP.fill) MAP.free = null;
  const tgt = C && C.cam ? C.cam : MAP.go ? { x: A.x, z: A.z } : MAP.free || { x: A.x + 60, z: 280 + (A.z - 280) * 0.7 };
  const k = Math.min(1, dt * (C && C.fast ? 1.3 : MAP.free ? 14 : 3.2));
  MAP.cam.x += (tgt.x - MAP.cam.x) * k; MAP.cam.z += (tgt.z - MAP.cam.z) * k;
  const zt = MAP.go ? 2.6 : C && C.fast ? 0.72 : MAP.uz; // uz: zelf in- of uitgezoomd (scrollwiel, knijpen)
  MAP.zoom += (zt - MAP.zoom) * Math.min(1, dt * (MAP.go ? 2.2 : 2.5));
  if (C) { C.t += dt; if (C.t >= C.dur) { MAP.cine = null; if (C.cb) C.cb(); } } // de knoppen komen pas terug na het hele filmpje (finish)
  // level gekozen: inzoomen, cirkel sluit zich rond Andy, dan het laadscherm
  if (MAP.go && (MAP.go.t += dt) >= 1.05) { const n = MAP.go.n; MAP.go = null; mapLoadStart(n); }
  if (MAP.load) mapLoadUpdate(dt);
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
  g.font = `900 ${fs * 0.36}px Trebuchet MS, sans-serif`; g.fillStyle = '#ffe46b'; g.fillText(C.sub || '', W / 2, H * 0.3);
  g.font = `900 ${fs}px Trebuchet MS, sans-serif`; g.lineWidth = fs * 0.14; g.strokeStyle = 'rgba(0,0,0,.6)';
  g.strokeText(C.title, W / 2, H * 0.4); g.fillStyle = '#fff'; g.fillText(C.title, W / 2, H * 0.4);
  g.globalAlpha = 1;
  if (C.confetti) for (let k = 0; k < 50; k++) {
    const x = (hash(k * 3.1) * W + C.t * 40 * (hash(k) - 0.5)) % W, y = ((hash(k * 7.7) * H * 0.5 + C.t * (120 + hash(k * 2) * 160)) % H);
    g.fillStyle = ['#ff5a5a', '#ffd23f', '#4ade80', '#60a5fa', '#f472b6'][k % 5]; g.fillRect(x, y, 7, 4);
  }
}
// cirkel die zich rond Andy sluit (zoals in Mario) als je een level kiest
function drawMapGo(g) {
  const G0 = MAP.go;
  if (!G0) return;
  const k = clamp((G0.t - 0.4) / 0.6, 0, 1);
  if (k <= 0) return;
  const A = mapAndyPos(), p = mp(A.x, 45, A.z), R = Math.hypot(MAP.W, MAP.H) * (1 - k) * (1 - k);
  g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, MAP.W, MAP.H); g.moveTo(p[0] + Math.max(0, R), p[1]); g.arc(p[0], p[1], Math.max(0, R), 0, 6.3, true); g.fill('evenodd');
}
// Kaart openen: eventueel eerst de filmpjes (pad vullen, nieuwe wereld) afspelen
function openCareer() {
  if (!MAP.cv) { MAP.cv = $('mapCanvas'); MAP.g = MAP.cv.getContext('2d'); mapResize(); }
  const C = save.career, target = C.unlocked;
  MAP.walk = null; MAP.fill = null; MAP.cine = null; MAP.startW = null; MAP.go = null; MAP.load = null; MAP.cheer = false; MAP.zoom = MAP.uz; MAP.free = null;
  MAP.at = clamp(C.at || 1, 1, target); if (C.anim < target && C.anim >= 1) MAP.at = C.anim;
  if (C.anim < 1) { MAP.at = 0; MAP.startW = 0; }
  MAP.sel = Math.max(1, MAP.at);
  const A = mapAndyPos(); MAP.cam.x = A.x + 60; MAP.cam.z = 280 + (A.z - 280) * 0.7; MAP.yaw = Math.PI - 0.4;
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
      MAP.walk = null; MAP.cheer = false;
      mapCine({ dur: 2.4, cam: { x: start.x + 380, z: 460 }, title: `${B.icon} ${B.name}`, sub: `WERELD ${wt + 1}`, cb: fillAndWalk });
      Sfx.biome(wt);
    };
    if (fresh) { MAP.cam.x = start.x + 900; MAP.cam.z = 700; intro(); return; }
    // wereld voltooid: feest bij het kasteel, dan over zee naar het volgende eiland
    MAP.cheer = true;
    mapCine({ dur: 2.2, title: `Wereld ${wf + 1} voltooid!`, sub: `${BOSSES[wf].name} is verslagen`, confetti: true, cb: () => {
      MAP.cheer = false;
      mapCine({ dur: 2.8, cam: { x: start.x + 300, z: 450 }, fast: true, cb: intro });
    } });
    Sfx.cheer(); Sfx.arp(523, [0, 4, 7, 12, 16], 0.09, 0.1);
    return;
  }
  fillAndWalk();
}
function mapUi(on) { $('career').classList.toggle('cine', !on); }
function levelLabel(I) { return I.boss ? `Wereld ${I.world} · Kasteel` : I.tower ? `Wereld ${I.world} · Toren` : `Wereld ${I.world}-${I.idx + 1}`; }
// de kaartjes en knoppen onder/boven de kaart
function mapRenderUi() {
  const n = Math.max(1, MAP.sel), I = levelInfo(n), w = I.bi, st = save.career.stars;
  $('mapWorld').textContent = `${BIOMES[w].icon} ${BIOMES[w].name}`;
  $('mapLevel').textContent = levelLabel(I);
  $('carStars').textContent = st.reduce((a, b) => a + b, 0) + ' / ' + LEVELS * 3;
  const lines = [];
  if (I.boss) lines.push(`👑 <b>Baasgevecht: ${BOSSES[w].name}</b> · ontwijk zijn aanvallen (${I.up > 0.66 ? 2 : 3} ❤️) en haal de finish`);
  if (I.tower) lines.push('🏰 <b>Toren</b> · extra zwaar, met twee uitdagingen');
  for (const c of I.ch) lines.push(`${CHALLENGES[c].icon} <b>${CHALLENGES[c].name}</b> · ${CHALLENGES[c].info(I.need)}`);
  if (!lines.length) lines.push('Haal de finish op tijd');
  const pips = levelPips(I), pipHtml = `<span class="mc-diff" title="Moeilijkheid">${'●'.repeat(pips)}<i>${'●'.repeat(5 - pips)}</i></span>`;
  $('mapInfo').innerHTML = `<div class="mc-top"><span>${[0, 1, 2].map(i => i < st[n - 1] ? '★' : '☆').join('')}</span>${pipHtml}<span>📏 ${I.L} m · ⏱ ${I.time} s</span></div>`
    + lines.map(l => `<div class="mc-ch">${l}</div>`).join('')
    + (I.up >= 0.15 ? `<div class="mc-up">💪 Zwaarder door je upgrades (+${Math.round(I.up * 100)}%)</div>` : '');
  $('btnMapPrev').disabled = n <= 1; $('btnMapNext').disabled = n >= save.career.unlocked;
  const wu = worldOf(save.career.unlocked);
  document.querySelector('.map-wsel').classList.toggle('hidden', wu < 1);
  $('btnMapPrevW').disabled = w <= 0; $('btnMapNextW').disabled = w >= wu;
}
const mapBusy = () => !!(MAP.cine || MAP.fill || MAP.go || MAP.load);
// naar een ander level op de kaart lopen
function mapGo(n) {
  if (mapBusy() || MAP.walk) return;
  n = clamp(n, 1, save.career.unlocked);
  const cur = Math.max(1, MAP.at);
  MAP.sel = n; mapRenderUi(); MAP.free = null;
  if (worldOf(n) !== worldOf(cur)) { MAP.at = n; MAP.startW = null; const A = mapAndyPos(); MAP.cam.x = A.x + 60; MAP.cam.z = 280 + (A.z - 280) * 0.7; save.career.at = n; return; } // andere wereld: er meteen heen
  mapWalk(cur, n, () => { save.career.at = n; });
}
// level kiezen: Andy springt, de camera zoomt in, dan het laadscherm
function mapPlay() {
  if (mapBusy() || MAP.walk) return;
  const n = Math.max(1, MAP.sel);
  if (n > save.career.unlocked) return;
  save.career.at = n; persist();
  Sfx.init(); Sfx.jump(); Sfx.woohoo(700);
  MAP.go = { n, t: 0 };
  mapUi(false);
}
// tik op de kaart: naar dat level lopen, of (als Andy er al staat) spelen
function mapTap(cx, cy) {
  if (MAP.go || MAP.load) return;
  if (MAP.cine) { MAP.cine.t = Math.max(MAP.cine.t, MAP.cine.dur - 0.3); return; } // filmpje overslaan
  let best = null, bd = Infinity;
  for (const h of MAP.hits) { const d = Math.hypot(h.x - cx, h.y - cy); if (d < h.r && d < bd) { bd = d; best = h; } }
  if (!best || best.n > save.career.unlocked) return;
  if (best.n === MAP.at && !MAP.walk) mapPlay(); else mapGo(best.n);
}

// =====================================================================
//  Laadscherm (nep): even de spanning opbouwen voordat het level begint
// =====================================================================
const LOAD_STEPS = ['Lianen knopen…', 'Appels poetsen…', 'Wespen wakker maken…', 'Kiwi opsluiten…', 'Wind aanzetten…', 'Bananenschillen weghalen…', 'Level klaarzetten…'];
const LOAD_TIPS = [
  'Laat los op het laagste punt van je zwaai voor de meeste vaart.',
  'Rotte lianen breken na een paar tellen: snel door!',
  'Power-ups in bellen duren maar even. Gebruik ze goed!',
  'In een toren krijg je altijd twee uitdagingen tegelijk.',
  'Hoe meer upgrades je hebt, hoe zwaarder de levels worden.',
  'Een baas geeft het op vlak voor de finish. Hou vol!',
  'Rode strepen? Daar valt zo iets naar beneden.',
  'Met ⏰ krijg je 20 seconden extra.',
];
function mapLoadStart(n) {
  const I = levelInfo(n);
  MAP.load = { n, I, t: 0, dur: 2.7, tip: LOAD_TIPS[(Math.random() * LOAD_TIPS.length) | 0], step: -1, steps: I.boss ? ['Kasteel openen…', `${BOSSES[I.bi].name} opwarmen…`, 'Lianen knopen…', 'Harten tellen…'] : LOAD_STEPS.slice().sort(() => Math.random() - 0.5).slice(0, 3).concat('Level klaarzetten…') };
  Sfx.biome(I.bi);
}
// nepvoortgang: met haperingen, zoals een echt laadscherm
const LOAD_KEYS = [[0, 0], [0.12, 0.18], [0.3, 0.24], [0.45, 0.55], [0.6, 0.6], [0.78, 0.86], [0.9, 1], [1, 1]];
function loadProg(f) {
  for (let i = 1; i < LOAD_KEYS.length; i++) { const [a, pa] = LOAD_KEYS[i - 1], [b, pb] = LOAD_KEYS[i]; if (f <= b) return pa + (pb - pa) * (f - a) / (b - a); }
  return 1;
}
function mapLoadUpdate(dt) {
  const L = MAP.load;
  L.t += dt;
  const pr = loadProg(L.t / L.dur), step = Math.min(L.steps.length - 1, Math.floor(pr * L.steps.length));
  if (step !== L.step) { L.step = step; Sfx.tick(1200 + step * 200, 0.06); }
  if (L.t >= L.dur + 0.25) { MAP.load = null; Sfx.bell(1318, 0.4, 0.1); startReady(L.n); }
}
function drawMapLoad(g, L) {
  const W = MAP.W, H = MAP.H, I = L.I, B = BIOMES[I.bi], c = B.c, t = L.t, port = W < H * 0.95;
  // achtergrond: de lucht van de biome met schuine strepen die voorbij schuiven
  const bg = g.createLinearGradient(0, 0, W * 0.3, H); bg.addColorStop(0, c.skyTop); bg.addColorStop(1, shade(c.canopy, -0.2));
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = 0.08; g.fillStyle = '#fff';
  const sw = 60, off = (t * 40) % (sw * 2);
  for (let x = -H - sw * 2 + off; x < W + sw; x += sw * 2) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + sw, H); g.lineTo(x + sw + H, 0); g.lineTo(x + H, 0); g.fill(); }
  g.restore();
  // Andy draait rond op een grasschijf
  const ax = port ? W / 2 : W * 0.28, ay = port ? H * 0.43 : H * 0.66, sc = (port ? Math.min(W * 0.55, H * 0.3) : Math.min(H * 0.5, W * 0.3)) / 95;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(ax, ay + 8 * sc, 58 * sc, 16 * sc, 0, 0, 6.3); g.fill();
  g.fillStyle = shade(c.canopy2, -0.2); g.beginPath(); g.ellipse(ax, ay + 4 * sc, 55 * sc, 15 * sc, 0, 0, 6.3); g.fill();
  g.fillStyle = shade(c.canopy2, 0.1); g.beginPath(); g.ellipse(ax, ay, 55 * sc, 15 * sc, 0, 0, 6.3); g.fill();
  const tilt = 0.28, proj = (x, y, z) => { const q = rotX([x, y, z], -tilt), zc = q[2] + 600; return [ax + q[0] * sc * 600 / zc, ay - q[1] * sc * 600 / zc, zc]; };
  r3Begin();
  const pose = { t: t + 1, walk: t * 11, walkAmt: 0.7, cape: lvl('wingsuit') > 0 };
  drawAndy3D(proj, 0, Math.abs(Math.sin(t * 5.5)) * 3, 0, Math.PI + t * 1.6, 1, myLook(), pose, 0);
  r3Flush(g);
  // tekst
  const tx = port ? W / 2 : W * 0.66, fs = Math.min(port ? W * 0.1 : W * 0.055, H * 0.09);
  let y = port ? H * 0.64 : H * 0.2;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = `900 ${fs * 0.42}px Trebuchet MS, sans-serif`; g.fillStyle = '#ffe46b'; g.fillText(`${B.icon} ${B.name.toUpperCase()}`, tx, y);
  y += fs * 0.9;
  const title = I.boss ? `👑 ${BOSSES[I.bi].name}` : I.tower ? `🏰 Toren ${I.world}` : `Wereld ${I.world}-${I.idx + 1}`;
  g.font = `900 ${fs}px Trebuchet MS, sans-serif`; g.lineWidth = fs * 0.16; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(title, tx, y); g.fillStyle = '#fff'; g.fillText(title, tx, y);
  y += fs * 0.85;
  const lines = [`📏 ${I.L} m   ⏱ ${I.time} s   ${'●'.repeat(levelPips(I))}${'○'.repeat(5 - levelPips(I))}`];
  if (I.boss) lines.push(`Ontwijk de aanvallen · ${I.up > 0.66 ? 2 : 3} ❤️`);
  for (const ch of I.ch) lines.push(`${CHALLENGES[ch].icon} ${CHALLENGES[ch].name}`);
  g.font = `800 ${fs * 0.34}px Trebuchet MS, sans-serif`; g.fillStyle = '#fff';
  for (const l of lines) { g.fillText(l, tx, y); y += fs * 0.48; }
  // voortgangsbalk
  const pr = loadProg(Math.min(1, t / L.dur)), bw = Math.min(port ? W * 0.8 : W * 0.5, 460), bh = Math.max(14, fs * 0.28), bx = tx - bw / 2, by = port ? H * 0.9 : H * 0.8;
  const rr = (x, y2, w2, h2) => { g.beginPath(); g.roundRect ? g.roundRect(x, y2, w2, h2, h2 / 2) : g.rect(x, y2, w2, h2); };
  g.fillStyle = 'rgba(0,0,0,.35)'; rr(bx - 3, by - 3, bw + 6, bh + 6); g.fill();
  g.fillStyle = '#fff6e0'; rr(bx, by, bw, bh); g.fill();
  if (pr > 0.01) { g.fillStyle = '#4caf50'; rr(bx, by, Math.max(bh, bw * pr), bh); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; rr(bx + 4, by + 2, Math.max(0, bw * pr - 8), bh * 0.35); g.fill(); }
  // appeltje dat over de balk rolt
  const apx = bx + bw * pr, apy = by + bh / 2, ar = bh * 0.85;
  g.save(); g.translate(apx, apy); g.rotate(t * 8);
  g.fillStyle = '#140f18'; g.beginPath(); g.arc(0, 0, ar + 2, 0, 6.3); g.fill(); g.fillStyle = '#e8322b'; g.beginPath(); g.arc(0, 0, ar, 0, 6.3); g.fill();
  g.fillStyle = '#4caf50'; g.beginPath(); g.ellipse(ar * 0.4, -ar * 0.9, ar * 0.45, ar * 0.22, -0.5, 0, 6.3); g.fill(); g.restore();
  g.font = `800 ${Math.max(12, fs * 0.3)}px Trebuchet MS, sans-serif`; g.fillStyle = '#fff';
  g.fillText(pr >= 1 ? 'Klaar!' : L.steps[Math.max(0, L.step)], tx, by - bh * 1.1);
  g.font = `700 ${Math.max(11, fs * 0.26)}px Trebuchet MS, sans-serif`; g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillText('💡 ' + L.tip, W / 2, Math.min(H - 14, by + bh * 2.4), W - 24);
  // de cirkel gaat open
  const k = clamp(t / 0.4, 0, 1);
  if (k < 1) { const R = Math.hypot(W, H) * k * k; g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, W, H); g.moveTo(W / 2 + R, H / 2); g.arc(W / 2, H / 2, R, 0, 6.3, true); g.fill('evenodd'); }
  if (L.t > L.dur) { g.fillStyle = `rgba(0,0,0,${clamp((L.t - L.dur) / 0.25, 0, 1)})`; g.fillRect(0, 0, W, H); }
}

function careerInit() {
  on('btnMapPrev', () => mapGo(MAP.sel - 1));
  on('btnMapNext', () => mapGo(MAP.sel + 1));
  on('btnMapPlay', mapPlay);
  const wj = d => { const w = clamp(worldOf(Math.max(1, MAP.sel)) + d, 0, worldOf(save.career.unlocked)); mapGo(Math.min(save.career.unlocked, mapLevelAt(w, 0))); };
  on('btnMapPrevW', () => wj(-1));
  on('btnMapNextW', () => wj(1));
  // Kaart: tikken/klikken = naar een level lopen of spelen; slepen (linkermuisknop of vinger) = rondkijken;
  // scrollwiel of knijpen met twee vingers = in- en uitzoomen
  const cv = $('mapCanvas');
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); Sfx.init();
    if (e.button > 0) return;
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* niet nodig */ }
    MAP.ptr.set(e.pointerId, toGame(e.clientX, e.clientY));
    if (MAP.ptr.size === 1) MAP.drag = { p: toGame(e.clientX, e.clientY), moved: 0 };
    else { MAP.drag = null; MAP.pinch = mapPinchDist(); MAP.pinchZ = MAP.uz; }
  });
  cv.addEventListener('pointermove', e => {
    if (!MAP.ptr.has(e.pointerId)) return;
    const p = toGame(e.clientX, e.clientY);
    MAP.ptr.set(e.pointerId, p);
    if (MAP.ptr.size >= 2 && MAP.pinch) { mapSetZoom(MAP.pinchZ * mapPinchDist() / MAP.pinch); return; }
    const D = MAP.drag;
    if (!D) return;
    const dx = p[0] - D.p[0], dy = p[1] - D.p[1];
    D.moved += Math.abs(dx) + Math.abs(dy); D.p = p;
    if (D.moved > 8 && !mapBusy() && !MAP.walk) mapPan(dx, dy);
  });
  const up = e => {
    if (!MAP.ptr.has(e.pointerId)) return;
    const p = MAP.ptr.get(e.pointerId);
    MAP.ptr.delete(e.pointerId);
    if (MAP.ptr.size < 2) MAP.pinch = 0;
    const D = MAP.drag;
    MAP.drag = null;
    if (D && D.moved <= 8 && e.type === 'pointerup') mapTap(p[0], p[1]); // geen sleep: gewoon een tik
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); if (!mapBusy()) mapSetZoom(MAP.uz * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
}
function mapPinchDist() { const [a, b] = [...MAP.ptr.values()]; return Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])); }
function mapSetZoom(z) { MAP.uz = clamp(z, 0.55, 2.2); }
// de camera verschuiven met een sleep (dx, dy in schermpixels), binnen de vrijgespeelde eilanden
function mapPan(dx, dy) {
  const k = MAP.F / mapDist(), F = MAP.free || (MAP.free = { x: MAP.cam.x, z: MAP.cam.z });
  F.x -= dx / k; F.z += dy / (k * 0.55);
  const wu = worldOf(save.career.unlocked);
  F.x = clamp(F.x, worldX0(0) - 300, worldX0(wu) + MAP_SPAN + 300); F.z = clamp(F.z, -100, 1300);
  MAP.cam.x = F.x; MAP.cam.z = F.z;
}
// toetsen op de kaart (vanuit de algemene toetsenafhandeling in game.js)
function mapKey(code) {
  if (MAP.go || MAP.load) return true; // tijdens het inzoomen en laden doen toetsen niets
  if (code === 'ArrowLeft' || code === 'KeyA') mapGo(MAP.sel - 1);
  else if (code === 'ArrowRight' || code === 'KeyD') mapGo(MAP.sel + 1);
  else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { if (MAP.cine) mapTap(0, 0); else mapPlay(); }
  else return false;
  return true;
}
