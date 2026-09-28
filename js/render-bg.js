'use strict';
// Andy Apples · tekenen: achtergrond
// Tekenhulpjes, voorgetekende sprites en de parallax-achtergrondlagen.

// =====================================================================
//  Tekenen: hulpjes
// =====================================================================
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function ell(x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); ctx.fill(); }
function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function starPath(c, x, y, r, rot) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}
function layerY(worldY, f) { const bt = baseTop(); return worldY - bt - (camY - bt) * f; }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w * SPR_RES); c.height = Math.ceil(h * SPR_RES); const g = c.getContext('2d'); g.scale(SPR_RES, SPR_RES); return [c, g]; }
function blob(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
// Tekent iets per biome-stijl; tijdens een overgang worden de twee stijlen in elkaar overgevloeid
function crossfade(P, fn) {
  if (P.a === P.b || P.t <= 0.001) { fn(P.a, P.ai, 1); return; }
  if (P.t >= 0.999) { fn(P.b, P.bi, 1); return; }
  ctx.save(); ctx.globalAlpha *= 1 - P.t; fn(P.a, P.ai, 1 - P.t); ctx.restore();
  ctx.save(); ctx.globalAlpha *= P.t; fn(P.b, P.bi, P.t); ctx.restore();
}

// ---- Achtergrondlagen als tegels ----
// De parallaxlagen (bergen, bosrand, bomen, reuzenstammen) veranderen niet in de tijd. Ze worden daarom in vaste
// tegels getekend, in laagcoördinaten (los van de camera), en bewaard. Per beeld worden er hooguit een paar nieuwe
// tegels vooruit getekend, net buiten beeld. Vroeger werd een hele laag in één keer opnieuw opgebouwd zodra de
// camera ver genoeg was verschoven, en tijdens een biome-overgang tot 30 keer: dat gaf duidelijke haperingen.
// Een tegel hoort bij één biome; tijdens een overgang worden de tegels van beide biomes over elkaar gevloeid.
let PAD = 0;               // marge rond het getekende gebied (de tekenfuncties tekenen tot PAD buiten beeld)
let layerCaches = {};      // per laag: { map: tegels, bt }  (per wereld, zie WORLD_VARS)
const TILE = 512, TILE_M = 24;   // tegelmaat en overlap-marge in laagcoördinaten
const TILE_BUDGET = 2;           // zoveel tegels mogen er per beeld 'vooruit' getekend worden
let tileBudget = TILE_BUDGET, tileBuilds = 0, tileAheadBi = -1;
const tilePool = [];
// f/fy = parallax; top(bt) = boven deze laaghoogte is de laag leeg; empty(x0, x1) = geen inhoud in dit stuk
const LAYERS = {
  mtnfar:  { f: 0.05, fy: 0.04, top: bt => MTN_LAYERS[0].base - bt - 460, draw: P => drawMountainLayer(P, MTN_LAYERS[0]) },
  mtnfar2: { f: 0.12, fy: 0.1,  top: bt => 380 - bt,                      draw: P => drawMountainLayer(P, MTN_LAYERS[1]) },
  forest:  { f: 0.22, fy: 0.2,  top: bt => HAZARD_Y + 5 - bt - 320,       draw: P => drawForestLayer(P) },
  trees:   { f: 0.36, fy: 0.34, top: bt => HAZARD_Y + 30 - bt - 640,      draw: P => drawMidTreeLayer(P) },
  trunks:  { f: 0.62, fy: 0.62, top: null, empty: (x0, x1) => !trunkIn(x0, x1), draw: P => drawTrunkLayer(P) },
};
function takeCanvas(px) {
  for (let i = tilePool.length - 1; i >= 0; i--) if (tilePool[i].width === px) return tilePool.splice(i, 1)[0];
  const c = document.createElement('canvas'); c.width = c.height = px; return c;
}
function dropTile(T) { if (T.c && tilePool.length < 16) tilePool.push(T.c); T.c = null; }
// Tekent één tegel door de camera tijdelijk zo te zetten dat de bestaande tekenfunctie precies dit stuk tekent
function buildTile(T, C, L, bi, tx, ty, res) {
  const px = Math.ceil((TILE + 2 * TILE_M) * res);
  let c = T.c;
  if (!c || c.width !== px) { if (c) dropTile(T); c = takeCanvas(px); }
  const g = c.g || (c.g = c.getContext('2d'));
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px);
  g.setTransform(res, 0, 0, res, TILE_M * res, TILE_M * res);
  const s = [camX, camY, viewW, viewH, ctx];
  btOverride = C.bt; camX = tx * TILE / L.f; camY = C.bt + ty * TILE / L.fy; viewW = viewH = TILE; PAD = TILE_M; ctx = g;
  try { L.draw(palettePure(bi)); } finally { [camX, camY, viewW, viewH, ctx] = s; PAD = 0; btOverride = null; }
  T.c = c; T.res = res; tileBuilds++;
}
// must = tekenen, ook als het budget op is (er is niets anders om te laten zien)
function getTile(C, L, bi, tx, ty, res, must) {
  const k = `${bi}:${tx}:${ty}`;
  let T = C.map.get(k);
  if (T) {
    // resolutie flink veranderd (zoom, kwaliteit): zo nodig geleidelijk opnieuw tekenen
    if (Math.abs(T.res / res - 1) > 0.2 && tileBudget > 0) { tileBudget--; buildTile(T, C, L, bi, tx, ty, res); }
    return T;
  }
  if (!must && tileBudget <= 0) return null;
  tileBudget--;
  T = { c: null, res, tx, ty };
  buildTile(T, C, L, bi, tx, ty, res);
  C.map.set(k, T);
  return T;
}
function tileLayer(name, P) {
  const L = LAYERS[name], bt = baseTop();
  let C = layerCaches[name];
  if (!C || C.bt !== bt) { if (C) for (const T of C.map.values()) dropTile(T); C = layerCaches[name] = { map: new Map(), bt }; }
  const m = ctx.getTransform(), res = m.a;
  const off = camX * L.f, offY = (camY - bt) * L.fy;
  const tx0 = Math.floor(off / TILE), tx1 = Math.floor((off + viewW) / TILE);
  const ty0 = Math.floor(offY / TILE), ty1 = Math.floor((offY + viewH) / TILE);
  const top = L.top ? L.top(bt) : -Infinity;
  const wb = P.a === P.b ? 0 : P.t, wa = 1 - wb, ga = ctx.globalAlpha;
  const skip = (tx, ty) => (ty + 1) * TILE + TILE_M < top || (L.empty && L.empty(tx * TILE - TILE_M, (tx + 1) * TILE + TILE_M));
  // tegels op hele apparaatpixels neerzetten: anders geven de randen van aangrenzende tegels dunne naden
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const blit = T => {
    const x = T.tx * TILE - off, y = T.ty * TILE - offY;
    const dx0 = Math.round(m.e + m.a * x), dx1 = Math.round(m.e + m.a * (x + TILE));
    const dy0 = Math.round(m.f + m.d * y), dy1 = Math.round(m.f + m.d * (y + TILE));
    const s = TILE_M * T.res, w = TILE * T.res;
    ctx.drawImage(T.c, s, s, w, w, dx0, dy0, dx1 - dx0, dy1 - dy0);
  };
  try {
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (skip(tx, ty)) continue;
      let A = wa > 0.001 ? getTile(C, L, P.ai, tx, ty, res, wb <= 0.001) : null;
      const B = wb > 0.001 ? getTile(C, L, P.bi, tx, ty, res, wa <= 0.001) : null;
      if (!A && !B) A = getTile(C, L, wa >= wb ? P.ai : P.bi, tx, ty, res, true);
      if (A && B) { ctx.globalAlpha = ga * wa; blit(A); ctx.globalAlpha = ga * wb; blit(B); ctx.globalAlpha = ga; }
      else blit(A || B);
    }
  } finally { ctx.globalAlpha = ga; ctx.setTransform(m); }
  // vooruit tekenen (net buiten beeld), ook voor de volgende biome als die eraan komt
  if (tileBudget > 0) {
    const bis = [];
    if (wa > 0.001) bis.push(P.ai);
    if (wb > 0.001) bis.push(P.bi);
    if (tileAheadBi >= 0 && !bis.includes(tileAheadBi)) bis.push(tileAheadBi);
    for (const bi of bis) for (let ty = ty0 - 1; ty <= ty1 + 1 && tileBudget > 0; ty++) for (let tx = tx0 - 1; tx <= tx1 + 1 && tileBudget > 0; tx++) {
      if (!skip(tx, ty) && !C.map.has(`${bi}:${tx}:${ty}`)) getTile(C, L, bi, tx, ty, res, false);
    }
  }
  // tegels ver buiten beeld opruimen
  if (C.map.size > 60) {
    const cx = (tx0 + tx1) / 2, cy = (ty0 + ty1) / 2;
    const all = [...C.map].sort((p, q) => (Math.abs(q[1].tx - cx) + Math.abs(q[1].ty - cy)) - (Math.abs(p[1].tx - cx) + Math.abs(p[1].ty - cy)));
    for (let i = 0; i < all.length - 40; i++) { dropTile(all[i][1]); C.map.delete(all[i][0]); }
  }
}
const paletteKey = P => `${P.ai}-${P.bi}-${Math.round(P.t * 30)}`;

// =====================================================================
//  Sprites (één keer voorgetekend, daarna snel te tekenen)
// =====================================================================
const spriteCache = new Map();
function sprite(key, make) { let s = spriteCache.get(key); if (!s) { s = make(); spriteCache.set(key, s); } return s; }

function appleSprite(gold) {
  return sprite('apple' + gold, () => {
    const [c, g] = makeCanvas(40, 44);
    const body = g.createRadialGradient(15, 20, 2, 20, 26, 17);
    body.addColorStop(0, gold ? '#fff3b0' : '#ff8a7a'); body.addColorStop(0.45, gold ? '#f5c518' : '#e8322b'); body.addColorStop(1, gold ? '#b8860b' : '#9e1b16');
    g.fillStyle = body;
    g.beginPath(); g.moveTo(20, 13);
    g.bezierCurveTo(8, 6, 1, 18, 5, 29); g.bezierCurveTo(8, 39, 16, 42, 20, 38);
    g.bezierCurveTo(24, 42, 32, 39, 35, 29); g.bezierCurveTo(39, 18, 32, 6, 20, 13); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(12, 20, 3, 6, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(27, 17, 2, 2.5, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5a3a1a'; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(20, 14); g.quadraticCurveTo(20, 8, 23, 4); g.stroke();
    g.fillStyle = '#4caf50'; g.beginPath(); g.ellipse(28, 7, 7, 3.2, -0.45, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2e7d32'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(22, 9); g.lineTo(33, 5); g.stroke();
    return { c, w: 40, h: 44 };
  });
}

function glowSprite(col) {
  return sprite('glow' + col, () => {
    const [c, g] = makeCanvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, `rgba(${col},.75)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return { c, w: 64, h: 64 };
  });
}
function cloudSprite(v) {
  return sprite('cloud' + v, () => {
    const W = 260, H = 120, [c, g] = makeCanvas(W, H), rnd = mulberry32(v * 31 + 5);
    const puffs = [];
    for (let i = 0; i < 9; i++) puffs.push([40 + rnd() * 180, 55 + rnd() * 30 - Math.sin((i / 8) * Math.PI) * 25, 22 + rnd() * 26]);
    g.fillStyle = 'rgba(170,185,210,1)'; for (const [x, y, r] of puffs) blob(g, x, y + 8, r);
    const gr = g.createLinearGradient(0, 20, 0, 110); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dfe8f5');
    g.fillStyle = gr; for (const [x, y, r] of puffs) blob(g, x, y, r);
    g.fillStyle = 'rgba(255,255,255,.9)'; for (const [x, y, r] of puffs) blob(g, x - r * 0.2, y - r * 0.3, r * 0.5);
    return { c, w: W, h: H };
  });
}

// Gedetailleerde bomen per biome (4 varianten per biome)
function treeSprite(bi, v) {
  return sprite(`tree${bi}:${v}`, () => {
    const B = BIOMES[bi], style = B.style, C = B.c;
    const W = 340, H = 540, [c, g] = makeCanvas(W, H);
    const rnd = mulberry32(bi * 977 + v * 131 + 7), rr = (a, b) => a + rnd() * (b - a);
    const cx = W / 2, base = H - 4;
    const leaf = C.mid, cols = [shade(leaf, -0.32), leaf, shade(leaf, 0.2), shade(leaf, 0.42)];
    const bark = { jungle: '#5a4030', swamp: '#4a4632', savanne: '#6e5236', ice: '#4b3b34', volcano: '#231815', night: '#262c52', blocky: '#6b4a2b', paint: '#8b5a2b', poly3d: '#4a3a8a', candy: '#f3d9e6' }[style] || '#5a4030';
    const barkD = shade(bark, -0.4), barkL = shade(bark, 0.22);
    const trunk = (w0, w1, h) => {
      const gr = g.createLinearGradient(cx - w0, 0, cx + w0, 0);
      gr.addColorStop(0, barkD); gr.addColorStop(0.5, bark); gr.addColorStop(0.78, barkL); gr.addColorStop(1, barkD);
      g.fillStyle = gr; g.beginPath(); g.moveTo(cx - w0, base);
      g.quadraticCurveTo(cx - w0 * 0.55, base - h * 0.45, cx - w1, base - h); g.lineTo(cx + w1, base - h);
      g.quadraticCurveTo(cx + w0 * 0.55, base - h * 0.45, cx + w0, base); g.closePath(); g.fill();
      g.fillStyle = barkD;
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(cx + sd * w0 * 0.3, base - 26); g.quadraticCurveTo(cx + sd * (w0 + 6), base - 6, cx + sd * (w0 + 22), base); g.lineTo(cx + sd * w0 * 0.1, base); g.fill(); }
      g.strokeStyle = barkD; g.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) { const x = cx + rr(-w1, w1); g.beginPath(); g.moveTo(x, base - rr(0, h * 0.3)); g.quadraticCurveTo(x + rr(-5, 5), base - h * 0.5, x + rr(-3, 3), base - rr(h * 0.6, h)); g.stroke(); }
    };
    const crown = (cy, rx, ry, n, cl) => {
      const pts = [];
      for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()); pts.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, rr(0.45, 0.8) * Math.min(rx, ry) * 0.6 + 12]); }
      g.fillStyle = cl[0]; for (const [x, y, r] of pts) blob(g, x, y + 7, r);
      g.fillStyle = cl[1]; for (const [x, y, r] of pts) blob(g, x, y, r * 0.9);
      g.fillStyle = cl[2]; for (const [x, y, r] of pts) blob(g, x - r * 0.2, y - r * 0.28, r * 0.55);
      g.fillStyle = cl[3]; for (const [x, y, r] of pts) if (rnd() < 0.55) blob(g, x - r * 0.35, y - r * 0.42, r * 0.22);
      // bladstructuur
      g.strokeStyle = cl[0]; g.lineWidth = 1.2; g.globalAlpha = 0.5;
      for (let i = 0; i < 26; i++) { const [x, y, r] = pts[(rnd() * pts.length) | 0]; g.beginPath(); g.arc(x + rr(-r, r) * 0.5, y + rr(-r, r) * 0.5, rr(3, 6), 0.2, 2.6); g.stroke(); }
      g.globalAlpha = 1;
      return pts;
    };
    if (style === 'jungle' || style === 'night') {
      const h = rr(250, 340);
      trunk(21, 11, h);
      g.strokeStyle = bark; g.lineWidth = 9; g.lineCap = 'round';
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(cx, base - h * 0.72); g.quadraticCurveTo(cx + sd * 30, base - h * 0.9, cx + sd * rr(60, 85), base - h - rr(0, 25)); g.stroke(); }
      const pts = crown(base - h - 25, rr(105, 135), rr(62, 82), 26, cols);
      // hangende liaantjes
      g.strokeStyle = shade(C.vine, -0.2); g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const x = cx + rr(-90, 90), y0 = base - h + rr(0, 30), L = rr(60, 170);
        g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + rr(-15, 15), y0 + L * 0.5, x + rr(-8, 8), y0 + L); g.stroke();
        g.fillStyle = cols[2]; for (let yy = y0 + 18; yy < y0 + L; yy += 22) { g.beginPath(); g.ellipse(x + 4, yy, 4, 2, 0.6, 0, Math.PI * 2); g.fill(); }
      }
      if (style === 'jungle') {
        for (let i = 0; i < 7; i++) { const [x, y, r] = pts[(rnd() * pts.length) | 0]; g.fillStyle = rnd() < 0.5 ? '#ff6b8a' : '#ffd23f'; blob(g, x + rr(-r, r) * 0.6, y + rr(-r, r) * 0.6, 3.5); }
      } else {
        for (let i = 0; i < 8; i++) {
          const [x, y, r] = pts[(rnd() * pts.length) | 0], px = x + rr(-r, r) * 0.6, py = y + rr(-r, r) * 0.6;
          const gl = g.createRadialGradient(px, py, 0, px, py, 9); gl.addColorStop(0, 'rgba(180,255,240,.9)'); gl.addColorStop(1, 'rgba(180,255,240,0)');
          g.fillStyle = gl; blob(g, px, py, 9);
        }
        for (const sd of [-1, 1]) { g.fillStyle = '#6fd6ff'; g.beginPath(); g.ellipse(cx + sd * 30, base - 12, 9, 5, 0, Math.PI, 0); g.fill(); g.fillStyle = '#d8f6ff'; g.fillRect(cx + sd * 30 - 2, base - 12, 4, 10); }
      }
    } else if (style === 'swamp') {
      const h = rr(220, 300);
      trunk(36, 12, h);
      crown(base - h - 10, rr(140, 160), rr(42, 55), 22, cols);
      g.strokeStyle = 'rgba(150,165,110,.75)'; g.lineWidth = 1.6;
      for (let i = 0; i < 45; i++) {
        const x = cx + rr(-140, 140), y0 = base - h + rr(0, 35), L = rr(40, 150);
        g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + 6, y0 + L * 0.3, x - 6, y0 + L * 0.6, x + rr(-4, 4), y0 + L); g.stroke();
      }
    } else if (style === 'savanne') {
      const h = rr(190, 260);
      trunk(13, 7, h * 0.55);
      g.strokeStyle = bark; g.lineCap = 'round';
      g.lineWidth = 9; g.beginPath(); g.moveTo(cx, base - h * 0.55); g.quadraticCurveTo(cx - 30, base - h * 0.8, cx - rr(60, 90), base - h); g.stroke();
      g.beginPath(); g.moveTo(cx, base - h * 0.55); g.quadraticCurveTo(cx + 25, base - h * 0.8, cx + rr(50, 80), base - h + 4); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 20, base - h * 0.75); g.lineTo(cx - 10, base - h - 4); g.stroke();
      const wv = rr(150, 175);
      for (let j = 0; j < 3; j++) { g.fillStyle = cols[j]; g.beginPath(); g.ellipse(cx + rr(-8, 8), base - h - j * 9, wv - j * 28, 27 - j * 6, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = cols[3]; for (let i = 0; i < 16; i++) blob(g, cx + rr(-wv + 30, wv - 30), base - h - 18 + rr(-6, 6), rr(5, 10));
    } else if (style === 'ice') {
      const h = rr(290, 380);
      trunk(11, 6, 70);
      const tiers = 6, th = (h - 50) / tiers;
      for (let j = 0; j < tiers; j++) {
        const y = base - 50 - j * th, w = 32 + (tiers - j) / tiers * 110;
        g.fillStyle = cols[0]; g.beginPath(); g.moveTo(cx, y - th * 1.9);
        for (let k = 0; k <= 8; k++) { const xx = cx + w - k * (2 * w / 8); g.lineTo(xx, y + (k % 2 ? 6 : 0)); }
        g.closePath(); g.fill();
        g.fillStyle = cols[1]; g.beginPath(); g.moveTo(cx, y - th * 1.9); g.lineTo(cx + w * 0.6, y - 4); g.lineTo(cx, y - 2); g.closePath(); g.fill();
        g.fillStyle = '#f4fbff'; g.beginPath(); g.moveTo(cx, y - th * 1.9);
        g.lineTo(cx + w * 0.45, y - th * 1.05);
        for (let k = 0; k <= 6; k++) g.lineTo(cx + w * 0.45 - k * (w * 0.9 / 6), y - th * 1.05 + (k % 2 ? 7 : 0));
        g.closePath(); g.fill();
      }
    } else if (style === 'blocky') { // Minecraft-eik: blokken met pixels
      const B = 34, px = (x, y, w, h, col, seed) => { // blok met een pixelpatroon
        g.fillStyle = col; g.fillRect(x, y, w, h);
        const r2 = mulberry32(seed), cs = [shade(col, -0.18), shade(col, 0.14), shade(col, -0.08)];
        for (let yy = 0; yy < h; yy += 6) for (let xx = 0; xx < w; xx += 6) if (r2() < 0.42) { g.fillStyle = cs[(r2() * 3) | 0]; g.fillRect(x + xx, y + yy, 6, 6); }
      };
      const h = Math.round(rr(5, 8)) * B;
      for (let y = base - B; y > base - h; y -= B) px(cx - B / 2, y, B, B, bark, (y * 7 + v) | 0);
      const lw = Math.round(rr(4, 6)), lh = Math.round(rr(3, 4)), top = base - h - (lh - 1) * B;
      for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
        if ((j === 0 || j === lh - 1) && (i === 0 || i === lw - 1) && rnd() < 0.7) continue; // hoeken eraf
        px(cx - lw * B / 2 + i * B, top + j * B, B, B, j === 0 ? cols[2] : cols[1], i * 31 + j * 7 + v * 3);
      }
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(cx - lw * B / 2, top + lh * B - 8, lw * B, 8);
    } else if (style === 'paint') { // getekend in Paint: platte kleuren, dikke zwarte randen, een beetje bibberig
      const h = rr(200, 290), wob = a => Math.sin(a * 7.3 + v) * 3;
      g.lineWidth = 4; g.strokeStyle = '#000'; g.lineJoin = 'round';
      g.fillStyle = bark; g.beginPath(); g.moveTo(cx - 16, base); g.lineTo(cx - 12 + wob(1), base - h); g.lineTo(cx + 12 + wob(2), base - h); g.lineTo(cx + 17, base); g.closePath(); g.fill(); g.stroke();
      const R = rr(85, 115), cy = base - h - R * 0.6;
      g.fillStyle = C.canopy; g.beginPath();
      for (let a = 0; a <= 40; a++) { const t = a / 40 * Math.PI * 2, rr2 = R * (1 + Math.sin(t * 5 + v) * 0.07); g.lineTo(cx + Math.cos(t) * rr2, cy + Math.sin(t) * rr2 * 0.85); }
      g.closePath(); g.fill(); g.stroke();
      g.lineWidth = 3; g.strokeStyle = C.canopy2; // krabbeltjes met het potlood
      for (let i = 0; i < 6; i++) { const x = cx + rr(-R * 0.6, R * 0.6), y = cy + rr(-R * 0.5, R * 0.4); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 12, x + 20, y); g.stroke(); }
      for (let i = 0; i < 4; i++) { const x = cx + rr(-R * 0.6, R * 0.6), y = cy + rr(-R * 0.4, R * 0.4); g.fillStyle = '#ed1c24'; blob(g, x, y, 8); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke(); }
    } else if (style === 'poly3d') { // low-poly: gefacetteerde kegels met licht van rechts
      const h = rr(260, 360);
      const box = (x, y, w, hh, d, col) => { // 3D-balkje (voorkant, bovenkant, zijkant)
        g.fillStyle = col; g.fillRect(x, y, w, hh);
        g.fillStyle = shade(col, 0.25); g.beginPath(); g.moveTo(x, y); g.lineTo(x + d, y - d * 0.6); g.lineTo(x + w + d, y - d * 0.6); g.lineTo(x + w, y); g.fill();
        g.fillStyle = shade(col, -0.3); g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w + d, y - d * 0.6); g.lineTo(x + w + d, y + hh - d * 0.6); g.lineTo(x + w, y + hh); g.fill();
      };
      box(cx - 12, base - h * 0.35, 24, h * 0.35, 12, bark);
      const tiers = 3;
      for (let j = 0; j < tiers; j++) {
        const w = 120 - j * 28, yb = base - h * 0.28 - j * h * 0.22, yt = yb - h * 0.42;
        const L = cols[2], M = cols[1], D = cols[0];
        g.fillStyle = L; g.beginPath(); g.moveTo(cx, yt); g.lineTo(cx - w, yb); g.lineTo(cx - w * 0.15, yb + 14); g.fill();
        g.fillStyle = M; g.beginPath(); g.moveTo(cx, yt); g.lineTo(cx - w * 0.15, yb + 14); g.lineTo(cx + w * 0.55, yb + 8); g.fill();
        g.fillStyle = D; g.beginPath(); g.moveTo(cx, yt); g.lineTo(cx + w * 0.55, yb + 8); g.lineTo(cx + w, yb); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, yt); g.lineTo(cx - w * 0.15, yb + 14); g.stroke();
      }
    } else if (style === 'candy') { // lolly's en suikerspin op zuurstokstammen
      const h = rr(220, 320);
      g.save(); g.beginPath(); g.rect(cx - 9, base - h, 18, h); g.clip();
      g.fillStyle = '#fff6fa'; g.fillRect(cx - 9, base - h, 18, h);
      g.fillStyle = '#ff4f8b'; for (let y = base - h - 20; y < base + 20; y += 26) { g.beginPath(); g.moveTo(cx - 10, y); g.lineTo(cx + 10, y - 14); g.lineTo(cx + 10, y - 4); g.lineTo(cx - 10, y + 10); g.fill(); }
      g.restore();
      if (v % 2) { // lolly met draaikolk
        const R = rr(70, 95), cy = base - h - R + 10;
        g.fillStyle = ['#ff7eb9', '#7fd3ff', '#b69cff', '#ffd23f'][v % 4]; blob(g, cx, cy, R);
        g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath();
        for (let a = 0; a < 26; a++) { const t = a / 26 * Math.PI * 5, r2 = R * a / 26; g.lineTo(cx + Math.cos(t) * r2, cy + Math.sin(t) * r2); }
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(cx - R * 0.35, cy - R * 0.4, R * 0.25, R * 0.15, -0.6, 0, Math.PI * 2); g.fill();
      } else { // suikerspin
        const pts = crown(base - h - 30, rr(95, 120), rr(60, 75), 24, ['#f59ac7', '#ffb8dc', '#ffd6ec', '#ffffff']);
        for (let i = 0; i < 8; i++) { const [x, y, r] = pts[(rnd() * pts.length) | 0]; g.fillStyle = ['#ff4f4f', '#4fb0ff', '#ffe14f', '#6fe07a'][i % 4]; g.fillRect(x + rr(-r, r) * 0.5, y + rr(-r, r) * 0.5, 7, 3); }
      }
    } else { // vulkaan: verkoolde dode boom met gloeiende scheuren
      const h = rr(220, 310);
      trunk(15, 5, h);
      g.strokeStyle = bark; g.lineCap = 'round';
      const br = (x, y, a, L, w, dpt) => {
        if (dpt === 0) return;
        const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        br(x2, y2, a - rr(0.3, 0.6), L * 0.7, w * 0.65, dpt - 1); br(x2, y2, a + rr(0.3, 0.6), L * 0.7, w * 0.65, dpt - 1);
      };
      br(cx, base - h * 0.6, -2.1, 70, 8, 4); br(cx, base - h * 0.75, -1.0, 65, 7, 4); br(cx, base - h, -1.57, 50, 5, 3);
      g.strokeStyle = '#ff7a1a'; g.shadowColor = '#ff5a00'; g.shadowBlur = 8; g.lineWidth = 1.8;
      for (let k = 0; k < 4; k++) { let x = cx + rr(-8, 8), y = base - rr(10, h * 0.8); g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += rr(-4, 4); y -= rr(6, 12); g.lineTo(x, y); } g.stroke(); }
      g.shadowBlur = 0;
    }
    return { c, w: W, h: H };
  });
}

// =====================================================================
//  Achtergrondlagen
// =====================================================================
const MTN = {
  jungle:  { amp: 250, freq: 0.0032, ridged: false, plateau: 0, snow: 0 },
  swamp:   { amp: 140, freq: 0.0028, ridged: false, plateau: 0, snow: 0 },
  savanne: { amp: 210, freq: 0.0036, ridged: false, plateau: 0.55, snow: 0 },
  ice:     { amp: 340, freq: 0.0048, ridged: true, plateau: 0, snow: 0.45 },
  volcano: { amp: 230, freq: 0.0038, ridged: true, plateau: 0, snow: 0 },
  night:   { amp: 260, freq: 0.0036, ridged: false, plateau: 0, snow: 0 },
  blocky:  { amp: 280, freq: 0.0034, ridged: false, plateau: 0, snow: 0.78, step: 40 }, // step: in blokken van 40
  paint:   { amp: 200, freq: 0.0026, ridged: false, plateau: 0, snow: 0 },
  poly3d:  { amp: 300, freq: 0.0040, ridged: true, plateau: 0, snow: 0, facet: 90 },   // facet: rechte vlakken
  candy:   { amp: 220, freq: 0.0030, ridged: false, plateau: 0, snow: 0.35 },           // 'sneeuw' = glazuur
};
function mtnH(x, p, seed) {
  let n1 = noise1(x * p.freq + seed);
  if (p.ridged) n1 = 1 - Math.abs(n1 * 2 - 1);
  let n = n1 * 0.62 + noise1(x * p.freq * 2.3 + seed * 3) * 0.28 + noise1(x * p.freq * 6.1 + seed * 7) * 0.1;
  if (p.plateau && n > p.plateau) n = p.plateau + (n - p.plateau) * 0.12;
  return n * p.amp;
}
function drawSky(P) {
  ctx.fillStyle = cachedGrad('sky' + paletteKey(P) + viewH, () => {
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, P.skyTop); g.addColorStop(0.55, P.skyMid); g.addColorStop(1, P.skyBot);
    return g;
  });
  ctx.fillRect(0, 0, viewW, viewH);
  const nightW = styleWeight(P, 'night'), iceW = styleWeight(P, 'ice'), volcW = styleWeight(P, 'volcano');
  // sterren
  if (nightW > 0) {
    const ga = ctx.globalAlpha; // één kleur + globalAlpha: geen nieuwe kleurstring per ster per beeld
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 140; i++) {
      const x = ((hash(i * 1.37) * viewW * 1.6 - camX * 0.02) % (viewW + 20) + viewW + 20) % (viewW + 20);
      const y = hash(i * 2.71) * viewH * 0.75, s = hash(i * 5.1) < 0.1 ? 2.4 : 1.4;
      ctx.globalAlpha = ga * nightW * (0.3 + 0.7 * Math.abs(Math.sin(time * 1.3 + i)));
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = ga;
    for (const s of life.shoot) {
      const k = s.t / 0.8, x = s.x - k * 260, y = s.y + k * 110;
      const gr = ctx.createLinearGradient(x, y, x + 80, y - 34);
      gr.addColorStop(0, `rgba(255,255,255,${nightW * (1 - k)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = 2; line(x, y, x + 80, y - 34);
    }
  }
  // noorderlicht boven de ijsbergen
  if (iceW > 0) {
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = cachedGrad(`aurora${k}:${Math.round(iceW * 20)}`, () => {
        const gr = ctx.createLinearGradient(0, 40 + k * 30, 0, 200 + k * 30);
        gr.addColorStop(0, `rgba(120,255,200,0)`); gr.addColorStop(0.5, `rgba(120,255,200,${0.16 * iceW})`); gr.addColorStop(1, 'rgba(120,200,255,0)');
        return gr;
      });
      ctx.beginPath(); ctx.moveTo(0, 220);
      for (let x = 0; x <= viewW + 20; x += 20) ctx.lineTo(x, 70 + k * 35 + Math.sin(x * 0.006 + time * 0.3 + k * 2) * 30 + Math.sin(x * 0.017 - time * 0.5) * 10);
      ctx.lineTo(viewW + 20, 240 + k * 30); ctx.lineTo(0, 240 + k * 30); ctx.fill();
    }
  }
  // zon / maan
  const sx = viewW * 0.76, sy = layerY(150 + volcW * 120, 0.03), R = 48 - volcW * 6;
  ctx.save(); ctx.translate(sx, sy);
  ctx.fillStyle = cachedGrad('sunglow' + paletteKey(P), () => {
    const glow = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 4);
    glow.addColorStop(0, rgbStr(P.sunC, 0.55)); glow.addColorStop(0.35, rgbStr(P.sunC, 0.16)); glow.addColorStop(1, rgbStr(P.sunC, 0));
    return glow;
  });
  circ(0, 0, R * 4); ctx.restore();
  // zonnestralen (langzaam draaiend)
  const rayW = 1 - nightW;
  if (rayW > 0.05) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(time * 0.03);
    ctx.fillStyle = rgbStr(P.sunC, 0.07 * rayW);
    for (let i = 0; i < 14; i++) { ctx.rotate(Math.PI * 2 / 14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 6, -R * 0.55); ctx.lineTo(R * 6, R * 0.55); ctx.fill(); }
    ctx.restore();
  }
  if (iceW > 0) { ctx.strokeStyle = `rgba(255,255,255,${0.35 * iceW})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, R * 2.6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.save(); ctx.translate(sx, sy);
  ctx.fillStyle = cachedGrad('sundisc' + paletteKey(P), () => {
    const disc = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
    disc.addColorStop(0, '#ffffff'); disc.addColorStop(0.55, P.sun); disc.addColorStop(1, rgbStr(mixC(P.sunC, [255, 140, 40], 0.35 * (1 - nightW))));
    return disc;
  });
  // stijl-biomes: een vierkante zon (blokjes), een Paint-zon met zwarte rand en streepjes, of een retro 3D-zon
  const st = P.t < 0.5 ? P.a.style : P.b.style;
  if (st === 'blocky') { ctx.fillRect(-R, -R, R * 2, R * 2); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-R * 0.6, -R * 0.6, R * 0.5, R * 0.5); }
  else if (st === 'paint') {
    ctx.fillStyle = P.sun; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = P.sun; ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + 0.2; line(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3, Math.cos(a) * R * 1.8, Math.sin(a) * R * 1.8); }
  } else if (st === 'poly3d') {
    ctx.fillStyle = cachedGrad('retrosun', () => { const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#fff27a'); g.addColorStop(1, '#ff4fb4'); return g; });
    circ(0, 0, R * 1.3);
    ctx.fillStyle = P.skyMid; for (let k = 0; k < 5; k++) ctx.fillRect(-R * 1.4, R * (0.15 + k * 0.24), R * 2.8, 2 + k * 2.2);
  } else circ(0, 0, R);
  ctx.restore();
  if (nightW > 0) { // maankraters
    ctx.fillStyle = `rgba(150,150,130,${0.45 * nightW})`;
    circ(sx - 14, sy - 8, 9); circ(sx + 14, sy + 12, 7); circ(sx + 8, sy - 20, 4.5); circ(sx - 6, sy + 20, 5);
    ctx.fillStyle = `rgba(255,255,255,${0.25 * nightW})`; circ(sx - 16, sy - 10, 4);
  }
  if (volcW > 0) { // rookbanden voor de zon
    ctx.fillStyle = `rgba(40,10,10,${0.45 * volcW})`;
    for (let k = 0; k < 3; k++) ell(sx + Math.sin(time * 0.1 + k) * 30, sy - 20 + k * 22, R * 2.2, 5 + k * 2);
  }
  // verre wolken
  if (nightW < 0.9) {
    ctx.save(); ctx.globalAlpha = 0.75 * (1 - nightW) * (1 - volcW * 0.6);
    const blocky = styleWeight(P, 'blocky') > 0.5, paint = styleWeight(P, 'paint') > 0.5;
    for (let i = -1; i < 6; i++) {
      const cs = cloudSprite(i & 3), w = 1600;
      const x = (((i * 360 + hash(i * 3.3) * 200 - camX * 0.025 - time * 6) % w) + w) % w - 200;
      const y = layerY(60 + hash(i * 7.7) * 140, 0.02), sc = 0.55 + hash(i * 1.1) * 0.4;
      if (blocky) { // blokwolken
        ctx.fillStyle = '#ffffff'; const b = 24 * sc;
        for (let k = 0; k < 7; k++) ctx.fillRect(x + k * b * 1.4, y + 30 + (hash(i * 5 + k) < 0.5 ? 0 : -b), b * 1.4, b * (hash(i * 5 + k) < 0.5 ? 1 : 2));
      } else if (paint) { // Paint-wolk: witte bolletjes met een zwarte omtrek
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
        ctx.beginPath(); for (let k = 0; k < 4; k++) { const cx = x + 40 * sc + k * 38 * sc; ctx.moveTo(cx + 30 * sc, y + 60 * sc); ctx.arc(cx, y + 60 * sc - (k % 2) * 12 * sc, 30 * sc, 0, Math.PI * 2); }
        ctx.stroke(); ctx.fill();
      } else ctx.drawImage(cs.c, x, y, cs.w * sc, cs.h * sc);
    }
    ctx.restore();
  }
}
const MTN_LAYERS = [
  { f: 0.05, fy: 0.04, base: 520, key: 'far', seed: 11, ampK: 1, haze: 0.25 },
  { f: 0.12, fy: 0.1, base: 615, key: 'far2', seed: 47, ampK: 0.62, haze: 0.1 },
];
function drawMountains(P) {
  for (const L of MTN_LAYERS) {
    tileLayer('mtn' + L.key, P);
    if (L.key === 'far' && styleWeight(P, 'volcano') > 0) drawVolcanoSmoke(P, L);
  }
}
function drawMountainLayer(P, L) {
  const hazeTop = P.skyBotC, col = P[L.key + 'C'];
  crossfade(P, (B) => {
    const p = MTN[B.style], base = layerY(L.base, L.fy), off = camX * L.f, amp = p.amp * L.ampK;
    // punten op een vast raster in de wereld, zodat aangrenzende tegels precies op elkaar aansluiten
    const pts = [], grid = p.step || p.facet || 12;
    for (let k = Math.floor((off - 100 - PAD) / grid); k * grid - off <= viewW + 40 + PAD; k++) {
      const sx = k * grid - off, y = base - mtnH((sx + off) / (L.ampK * 0.9 + 0.1), p, L.seed) * L.ampK;
      if (p.step) { const yq = base - Math.round((base - y) / p.step) * p.step; pts.push([sx, yq], [sx + grid, yq]); } // blokken: vlakke treden
      else pts.push([sx, y]);
    }
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], viewH + 10 + PAD); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.lineTo(pts[pts.length - 1][0], viewH + 10 + PAD); ctx.closePath(); };
    const gr = ctx.createLinearGradient(0, base - amp, 0, base + 40);
    gr.addColorStop(0, rgbStr(mixC(col, hazeTop, L.haze))); gr.addColorStop(1, rgbStr(mixC(col, hazeTop, L.haze + 0.4)));
    ctx.fillStyle = gr; path(); ctx.fill();
    // licht op de flanken (de zon staat rechts)
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = rgbStr(mixC(col, [255, 255, 255], 0.18), 0.5);
    for (let i = 1; i < pts.length - 1; i++) {
      if (pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1]) {
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i][0] + 70, base + 20); ctx.lineTo(pts[i][0] + 18, base + 20); ctx.fill();
      }
    }
    const snowY = base - amp * p.snow * L.ampK - (1 - L.ampK) * 40;
    if (p.snow) { ctx.fillStyle = B.style === 'candy' ? '#ffe6f3' : 'rgba(255,255,255,.92)'; ctx.fillRect(pts[0][0], -PAD, viewW + 200 + 2 * PAD, snowY + PAD); }
    if (B.style === 'candy') { // glazuur dat omlaag druipt
      ctx.fillStyle = '#ffe6f3';
      for (let x = Math.floor((pts[0][0] + off) / 34) * 34 - off; x < viewW + PAD + 40; x += 34) { const hh = 10 + hash(Math.round((x + off) / 34) * 1.7) * 26; ctx.fillRect(x, snowY - 2, 12, hh); circ(x + 6, snowY + hh, 6); }
    } else if (B.style === 'blocky') { // blokranden en een grasrandje op elke trede
      ctx.strokeStyle = rgbStr(mixC(col, [0, 0, 0], 0.25), 0.5); ctx.lineWidth = 2;
      for (let i = 0; i < pts.length; i += 2) { const [x, y] = pts[i]; for (let yy = y; yy < base + 60; yy += p.step) ctx.strokeRect(x, yy, p.step, p.step); }
      ctx.fillStyle = rgbStr(mixC(hexToRgb(B.c.canopy2), hazeTop, L.haze + 0.1));
      for (let i = 0; i < pts.length; i += 2) if (pts[i][1] > snowY + 4) ctx.fillRect(pts[i][0], pts[i][1], p.step, 9);
    } else if (B.style === 'poly3d') { // vlakken met licht van rechts
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], lit = y2 > y1;
        ctx.fillStyle = lit ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.2)';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo((x1 + x2) / 2 + (lit ? 30 : -30), base + 40); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,190,255,.45)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < pts.length - 1; i++) line(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2 + (pts[i + 1][1] > pts[i][1] ? 30 : -30), base + 40);
    }
    ctx.restore();
    if (B.style === 'paint' || B.style === 'poly3d') { // Paint: dikke zwarte omtrek; 3D: een neon randje
      ctx.strokeStyle = B.style === 'paint' ? '#000' : 'rgba(255,120,220,.8)'; ctx.lineWidth = B.style === 'paint' ? 4 : 2; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    if (B.style === 'night') { ctx.strokeStyle = 'rgba(200,210,255,.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    // vulkanen met gloeiende krater
    if (B.style === 'volcano' && L.key === 'far') {
      for (const x of volcanoXs(off)) {
        const top = base - 330, w = 240;
        const vg = ctx.createLinearGradient(0, top, 0, base);
        vg.addColorStop(0, '#5a2018'); vg.addColorStop(1, rgbStr(mixC(col, hazeTop, 0.4)));
        ctx.fillStyle = vg; ctx.beginPath(); ctx.moveTo(x - w * 1.3, base + 30); ctx.lineTo(x - 34, top); ctx.lineTo(x + 34, top); ctx.lineTo(x + w * 1.3, base + 30); ctx.fill();
        const lg = ctx.createRadialGradient(x, top, 4, x, top, 90); lg.addColorStop(0, 'rgba(255,170,60,.9)'); lg.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = lg; circ(x, top, 90);
        ctx.strokeStyle = 'rgba(255,120,30,.7)'; ctx.lineWidth = 3; line(x - 10, top + 4, x - 30, top + 90); line(x + 8, top + 4, x + 22, top + 60);
      }
    }
  });
  if (L.key === 'far2') { // nevel in de dalen
    const mist = ctx.createLinearGradient(0, layerY(430, 0.1), 0, layerY(700, 0.1));
    mist.addColorStop(0, rgbStr(P.skyBotC, 0)); mist.addColorStop(1, rgbStr(P.skyBotC, 0.45));
    ctx.fillStyle = mist; ctx.fillRect(-PAD, -PAD, viewW + 2 * PAD, viewH + 2 * PAD);
  }
}
function volcanoXs(off) {
  const sp = 1400, xs = [];
  for (let i = Math.floor((off - 400 - PAD) / sp); i <= Math.floor((off + viewW + 400 + PAD) / sp); i++) xs.push(i * sp + hash(i * 3.1) * 500 - off);
  return xs;
}
function drawVolcanoSmoke(P, L) {
  const w = styleWeight(P, 'volcano'), top = layerY(L.base, L.fy) - 330;
  for (const x of volcanoXs(camX * L.f)) {
    for (let k = 0; k < 6; k++) { const age = ((time * 18 + k * 40) % 240) / 240; ctx.fillStyle = `rgba(60,40,40,${0.45 * (1 - age) * w})`; circ(x + age * 60 + Math.sin(age * 6 + k) * 10, top - age * 220, 20 + age * 45); }
  }
}
// Wolken op verschillende hoogtes: je vliegt er langs als je klimt
function drawAltClouds(P) {
  if (!Q.clouds) return;
  const nightW = styleWeight(P, 'night'), volcW = styleWeight(P, 'volcano');
  const f = 0.15, fy = 0.5, sp = 380, off = camX * f;
  ctx.save(); ctx.globalAlpha = 0.8 - nightW * 0.55 - volcW * 0.3;
  for (let i = Math.floor((off - 300) / sp); i <= Math.floor((off + viewW + 300) / sp); i++) {
    const wy = -250 - hash(i * 4.7) * 1500;
    const y = layerY(wy, fy);
    if (y < -150 || y > viewH + 50) continue;
    const cs = cloudSprite((i & 3) + 4), sc = 0.7 + hash(i * 9.3) * 0.6;
    ctx.drawImage(cs.c, i * sp + hash(i * 2.2) * 200 - off, y, cs.w * sc, cs.h * sc);
  }
  ctx.restore();
}
function drawFlocks(P) {
  for (const fl of life.flocks) {
    const sx0 = fl.lx - camX * fl.f, sy0 = fl.y - (camY - baseTop()) * 0.08;
    ctx.strokeStyle = fl.style === 'ice' ? 'rgba(255,255,255,.75)' : rgbStr(mixC(P.far2C, [0, 0, 0], 0.5), 0.7);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.6 * fl.size; ctx.lineCap = 'round';
    for (const b of fl.birds) {
      const x = sx0 + b.dx * fl.size, y = sy0 + b.dy * fl.size, w = Math.sin(time * 9 + b.ph) * 4 * fl.size, s = 7 * fl.size;
      ctx.beginPath(); ctx.moveTo(x - s, y - w); ctx.quadraticCurveTo(x - s * 0.4, y - w * 0.3 - 2, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - w * 0.3 - 2, x + s, y - w); ctx.stroke();
    }
  }
}
function drawForestLine(P) {
  tileLayer('forest', P);
  const w = styleWeight(P, 'savanne');
  if (w > 0) { // giraffen die rustig over de savanne wandelen
    const off = camX * 0.22, base = layerY(HAZARD_Y + 5, 0.2), col = rgbStr(mixC(mixC(P.midC, P.skyBotC, 0.5), [0, 0, 0], 0.12));
    ctx.save(); ctx.globalAlpha = w;
    for (let i = Math.floor((off - 300) / 900); i <= Math.floor((off + viewW + 300) / 900); i++) {
      if (hash(i * 6.1) < 0.4) continue;
      const x = i * 900 + hash(i * 2.9) * 400 - off + ((time * 9) % 900) * (hash(i) < 0.5 ? 1 : -1) * 0.2;
      drawGiraffe(x, base - 38, col, time * 2 + i);
    }
    ctx.restore();
  }
}
function drawForestLayer(P) {
  const f = 0.22, fy = 0.2, off = camX * f, base = layerY(HAZARD_Y + 5, fy);
  const col = mixC(P.midC, P.skyBotC, 0.5), colL = mixC(col, P.skyBotC, 0.25), colD = mixC(col, [0, 0, 0], 0.12);
  crossfade(P, (B, bi, w) => {
    const st = B.style;
    ctx.fillStyle = rgbStr(col); ctx.fillRect(-10 - PAD, base - 40, viewW + 20 + 2 * PAD, viewH + 2 * PAD + Math.max(0, 40 - base));
    const sp = st === 'savanne' ? 120 : st === 'blocky' || st === 'poly3d' || st === 'candy' ? 66 : 30;
    for (let i = Math.floor((off - 100 - PAD) / sp); i <= Math.floor((off + viewW + 100 + PAD) / sp); i++) {
      const x = i * sp + hash(i * 1.9) * sp * 0.8 - off, h = hash(i * 3.7), top = base - 50 - noise1(i * 0.15) * 70 - h * 40;
      if (st === 'jungle' || st === 'night' || st === 'swamp') {
        ctx.fillStyle = rgbStr(col); circ(x, top, 24 + h * 18);
        ctx.fillStyle = rgbStr(colL); circ(x - 6, top - 7, 12 + h * 8);
        if (st === 'swamp' && h > 0.6) { ctx.fillStyle = rgbStr(colD); ctx.fillRect(x - 2, top - 70, 4, 70); ell(x, top - 70, 10, 26); }
      } else if (st === 'savanne') {
        if (h < 0.55) { ctx.fillStyle = rgbStr(colD); ctx.fillRect(x - 2, top + 10, 4, base - top); ell(x, top + 8, 34 + h * 20, 8); }
        ctx.fillStyle = rgbStr(colD); for (let k = 0; k < 8; k++) ctx.fillRect(x + k * 14 - 50, base - 44 - hash(i * 9 + k) * 8, 2, 12);
      } else if (st === 'ice') {
        const hh = 60 + h * 70;
        ctx.fillStyle = rgbStr(colD); ctx.beginPath(); ctx.moveTo(x - 16, base - 36); ctx.lineTo(x, base - 36 - hh); ctx.lineTo(x + 16, base - 36); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.moveTo(x - 6, base - 36 - hh * 0.65); ctx.lineTo(x, base - 36 - hh); ctx.lineTo(x + 6, base - 36 - hh * 0.65); ctx.fill();
      } else if (st === 'blocky') { // blokstruiken
        const b = 22, hb = 1 + ((h * 3) | 0), bx = Math.round(x / b) * b;
        ctx.fillStyle = rgbStr(col); for (let k = 0; k < hb; k++) ctx.fillRect(bx, base - 40 - (k + 1) * b, b, b);
        if (h > 0.5) { ctx.fillStyle = rgbStr(colL); ctx.fillRect(bx - b, base - 40 - hb * b, b * 3, b); }
      } else if (st === 'paint') { // rondjes met een zwarte rand
        ctx.fillStyle = rgbStr(col); ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, top + 10, 20 + h * 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (st === 'poly3d') { // piramides met een lichte en een donkere kant
        const hh = 50 + h * 70, w = 24 + h * 12;
        ctx.fillStyle = rgbStr(colL); ctx.beginPath(); ctx.moveTo(x - w, base - 36); ctx.lineTo(x, base - 36 - hh); ctx.lineTo(x, base - 36); ctx.fill();
        ctx.fillStyle = rgbStr(colD); ctx.beginPath(); ctx.moveTo(x + w, base - 36); ctx.lineTo(x, base - 36 - hh); ctx.lineTo(x, base - 36); ctx.fill();
      } else if (st === 'candy') { // lolly's
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; line(x, base - 40, x, top + 14);
        ctx.fillStyle = rgbStr(mixC(col, [255, 120, 190], 0.3)); circ(x, top + 8, 14 + h * 8);
        ctx.fillStyle = 'rgba(255,255,255,.5)'; circ(x - 4, top + 4, 5);
      } else {
        ctx.strokeStyle = rgbStr(colD); ctx.lineWidth = 3; line(x, base - 40, x + (h - 0.5) * 10, top + 10);
        ctx.lineWidth = 2; line(x, top + 40, x - 12, top + 22); line(x, top + 30, x + 10, top + 16);
      }
    }
  });
}
function drawGiraffe(x, y, col, ph) {
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
  ell(x, y - 30, 20, 11);
  ctx.lineWidth = 3.5;
  for (const [lx, o] of [[-14, 0], [-8, 1.5], [10, 3], [15, 4.5]]) line(x + lx, y - 26, x + lx + Math.sin(ph + o) * 3, y);
  ctx.lineWidth = 6; line(x + 16, y - 36, x + 30, y - 76);
  ell(x + 34, y - 78, 8, 5, 0.3);
  ctx.lineWidth = 2; line(x + 31, y - 83, x + 30, y - 89); line(x + 35, y - 83, x + 36, y - 89);
}
function drawMidTrees(P) {
  if (layerY(HAZARD_Y + 30, 0.34) - 560 > viewH) return;
  tileLayer('trees', P);
}
function drawMidTreeLayer(P) {
  const f = 0.36, fy = 0.34, sp = 175, off = camX * f;
  const base = layerY(HAZARD_Y + 30, fy);
  crossfade(P, (B, bi) => {
    for (let i = Math.floor((off - 200 - PAD) / sp); i <= Math.floor((off + viewW + 200 + PAD) / sp); i++) {
      if (hash(i * 8.3) < 0.18) continue;
      const s = treeSprite(bi, (hash(i * 3.3) * 4) | 0), sc = 0.72 + hash(i * 5.3) * 0.38;
      const x = i * sp + hash(i * 3.7) * 90 - off;
      ctx.drawImage(s.c, x - s.w * sc / 2, base - s.h * sc, s.w * sc, s.h * sc);
    }
  });
  // nevel over de middenlaag, zodat hij op de achtergrond blijft
  const fog = ctx.createLinearGradient(0, base - 450, 0, base);
  fog.addColorStop(0, rgbStr(P.skyBotC, 0.12)); fog.addColorStop(1, rgbStr(P.skyBotC, 0.45));
  ctx.fillStyle = fog; ctx.fillRect(-PAD, base - 450, viewW + 2 * PAD, viewH + 2 * PAD + 450 + Math.max(0, -base));
}
function drawFlyers() {
  if (Q.lite) return;
  for (const f of life.flyers) {
    const x = f.lx - camX * f.f, y = f.y - (camY - baseTop()) * 0.45;
    if (x < -40 || x > viewW + 40 || y < -40 || y > viewH + 40) continue;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.85;
    if (f.kind === 'butterfly') {
      const w = Math.abs(Math.sin(f.ph * 12)) * 0.8 + 0.2;
      ctx.fillStyle = f.col; ell(-3, -2, 5 * w, 4, -0.4); ell(3, -2, 5 * w, 4, 0.4);
      ctx.fillStyle = shade(f.col, -0.2); ell(-2.5, 2.5, 3 * w, 2.6, 0.3); ell(2.5, 2.5, 3 * w, 2.6, -0.3);
      ctx.fillStyle = '#222'; ctx.fillRect(-0.6, -4, 1.2, 8);
    } else if (f.kind === 'dragonfly') {
      ctx.fillStyle = 'rgba(210,240,255,.6)'; const w = Math.sin(f.ph * 40) * 1.5;
      ell(-4, -2 + w, 7, 2, -0.2); ell(-4, 2 - w, 7, 2, 0.2);
      ctx.fillStyle = '#2fa6a0'; ctx.fillRect(-2, -1, 14, 2); circ(0, 0, 2.5);
    } else if (f.kind === 'glow') {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(f.ph * 2));
      ctx.globalAlpha = Math.min(1, a / 0.75); // de gloeisprite is in het midden 75% dekkend
      ctx.drawImage(glowSprite('170,255,200').c, -12, -12, 24, 24);
    } else { // papegaai
      const w = Math.sin(f.ph * 10) * 8;
      ctx.fillStyle = f.col; ell(0, 0, 11, 5);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(26, 3); ctx.lineTo(8, 3); ctx.fill();
      ctx.fillStyle = shade(f.col, -0.2); ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(6, -12 - w); ctx.lineTo(10, -1); ctx.fill();
      ctx.fillStyle = '#ffd23f'; circ(-9, -2, 3.5); ctx.fillStyle = '#222'; circ(-10, -3, 1);
    }
    ctx.restore();
  }
}
// Reuzenstammen dicht achter de lianen (zoals in Benji Bananas), over de volle hoogte
const TRUNK = {
  jungle:  { bark: '#4a3524', moss: '#3f7a3a' },
  swamp:   { bark: '#3a3a2a', moss: '#5a6a32' },
  savanne: { bark: '#7a5a3a', moss: null },
  ice:     { bark: '#56606d', moss: '#f4f9ff' },
  volcano: { bark: '#1e1412', moss: null },
  night:   { bark: '#1b1f3a', moss: '#1e4a42' },
  blocky:  { bark: '#6b4a2b', moss: '#5aa532' },
  paint:   { bark: '#8b5a2b', moss: null },
  poly3d:  { bark: '#3a2f6e', moss: null },
  candy:   { bark: '#fbe3ee', moss: '#ff7eb9' },
};
const TRUNK_SP = 880;
// staat er een reuzenstam (met zijtakken) in dit stuk van de laag? (laagcoördinaten)
function trunkIn(x0, x1) {
  for (let i = Math.floor((x0 - 700) / TRUNK_SP); i <= Math.floor((x1 + 300) / TRUNK_SP); i++) {
    if (hash(i * 4.1) < 0.2) continue;
    const w = 60 + hash(i * 5.7) * 45, x = i * TRUNK_SP + hash(i * 2.3) * 400;
    if (x + w * 1.3 + 180 >= x0 && x - w * 1.3 - 180 <= x1) return true;
  }
  return false;
}
function drawGiantTrunks(P) { tileLayer('trunks', P); }
function drawTrunkLayer(P) {
  const f = 0.62, fy = 0.62, sp = TRUNK_SP, off = camX * f, yOff = (camY - baseTop()) * fy;
  const y0 = -10 - PAD, y1 = viewH + 10 + PAD;
  crossfade(P, (B) => {
    const T = TRUNK[B.style], bark = mixC(hexToRgb(T.bark), P.skyBotC, 0.28), barkD = mixC(bark, [0, 0, 0], 0.35), barkL = mixC(bark, [255, 255, 255], 0.12);
    const leafC = mixC(hexToRgb(B.c.canopy), P.skyBotC, 0.3), leafL = mixC(hexToRgb(B.c.canopy2), P.skyBotC, 0.3);
    for (let i = Math.floor((off - 700 - PAD) / sp); i <= Math.floor((off + viewW + 300 + PAD) / sp); i++) {
      if (hash(i * 4.1) < 0.2) continue;
      const w = 60 + hash(i * 5.7) * 45, x = i * sp + hash(i * 2.3) * 400 - off;
      if (x + w * 1.3 + 180 < -PAD || x - w * 1.3 - 180 > viewW + PAD) continue; // zijtakken en wortels steken ver uit
      const wq = Math.round(w / 5) * 5;
      ctx.save(); ctx.translate(x, 0);
      ctx.fillStyle = cachedGrad(`trunk${B.style}${paletteKey(P)}${wq}`, () => {
        const gr = ctx.createLinearGradient(-wq / 2, 0, wq / 2, 0);
        gr.addColorStop(0, rgbStr(barkD)); gr.addColorStop(0.35, rgbStr(bark)); gr.addColorStop(0.7, rgbStr(barkL)); gr.addColorStop(1, rgbStr(barkD));
        return gr;
      });
      ctx.fillRect(-wq / 2, y0, wq, y1 - y0);
      // stijl-biomes: blokken, Paint-randen, 3D-vlakken of zuurstokstrepen over de stam
      if (B.style === 'blocky') { ctx.strokeStyle = rgbStr(barkD, 0.7); ctx.lineWidth = 3; const g0 = Math.floor((yOff + y0) / wq) * wq - yOff; for (let y = g0; y < y1; y += wq) ctx.strokeRect(-wq / 2, y, wq, wq); }
      else if (B.style === 'paint') { ctx.fillStyle = '#000'; ctx.fillRect(-wq / 2 - 4, y0, 7, y1 - y0); ctx.fillRect(wq / 2 - 3, y0, 7, y1 - y0); }
      else if (B.style === 'poly3d') { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-wq / 2, y0, wq * 0.35, y1 - y0); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(wq * 0.2, y0, wq * 0.3, y1 - y0); }
      else if (B.style === 'candy') {
        ctx.save(); ctx.beginPath(); ctx.rect(-wq / 2, y0, wq, y1 - y0); ctx.clip(); ctx.fillStyle = 'rgba(255,79,139,.75)';
        const g0 = Math.floor((yOff + y0) / 70) * 70 - yOff;
        for (let y = g0 - 70; y < y1 + 70; y += 70) { ctx.beginPath(); ctx.moveTo(-wq, y); ctx.lineTo(wq, y - wq); ctx.lineTo(wq, y - wq + 26); ctx.lineTo(-wq, y + 26); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();
      // wortels onderaan
      const gy = layerY(HAZARD_Y + 10, fy);
      if (gy < viewH + 40 + PAD) { ctx.fillStyle = rgbStr(barkD); ctx.beginPath(); ctx.moveTo(x - w / 2, gy - 80); ctx.quadraticCurveTo(x - w / 2 - 10, gy - 10, x - w * 1.3, gy + 10); ctx.lineTo(x + w * 1.3, gy + 10); ctx.quadraticCurveTo(x + w / 2 + 10, gy - 10, x + w / 2, gy - 80); ctx.fill(); }
      // schorsstructuur (punten op een vast raster in de wereld, zodat tegels naadloos aansluiten)
      ctx.strokeStyle = rgbStr(barkD, 0.6); ctx.lineWidth = 2;
      const g0 = Math.floor((yOff + y0) / 24) * 24 - yOff;
      for (let k = 0; k < 5; k++) {
        const bx = x - w / 2 + (k + 0.5) * w / 5;
        ctx.beginPath();
        for (let y = g0; y <= y1 + 24; y += 24) { const xx = bx + Math.sin((y + yOff) * 0.03 + k * 1.7 + i) * 3; y === g0 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y); }
        ctx.stroke();
      }
      // mos / sneeuw, zijtakken met blad en een gewikkelde liaan
      const cell = 150, c0 = Math.floor((yOff + y0 - 100) / cell), c1 = Math.floor((yOff + y1 + 30) / cell);
      for (let c = c0; c <= c1; c++) {
        const y = c * cell - yOff, hh = hash(i * 13.1 + c * 7.7);
        if (T.moss && hh < 0.45) { ctx.fillStyle = rgbStr(mixC(hexToRgb(T.moss), P.skyBotC, 0.3), 0.8); ell(x + (hh < 0.22 ? -1 : 1) * w * 0.32, y + 40, w * 0.22, 16); }
        if (hh > 0.8) {
          const sd = hh > 0.9 ? 1 : -1, bx = x + sd * w / 2, by = y + 60;
          ctx.strokeStyle = rgbStr(bark); ctx.lineWidth = 10; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(bx, by + 10); ctx.quadraticCurveTo(bx + sd * 40, by - 10, bx + sd * 90, by - 30); ctx.stroke();
          ctx.fillStyle = rgbStr(leafC); circ(bx + sd * 95, by - 40, 34); circ(bx + sd * 60, by - 30, 26); circ(bx + sd * 120, by - 25, 24);
          ctx.fillStyle = rgbStr(leafL); circ(bx + sd * 88, by - 50, 16); circ(bx + sd * 112, by - 36, 11);
        }
      }
      ctx.strokeStyle = rgbStr(mixC(hexToRgb(B.c.vine), P.skyBotC, 0.35)); ctx.lineWidth = 5;
      ctx.beginPath();
      const v0 = Math.floor((yOff + y0) / 10) * 10 - yOff;
      for (let y = v0; y <= y1 + 10; y += 10) { const xx = x + Math.sin((y + yOff) * 0.012 + i) * w * 0.52; y === v0 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y); }
      ctx.stroke();
    }
  });
}
function drawLightRays(P) {
  if (!Q.rays) return;
  const w = styleWeight(P, 'jungle') + styleWeight(P, 'swamp') * 0.7 + styleWeight(P, 'savanne') * 0.5;
  if (w <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = ((i * 330 - camX * 0.1 + hash(i) * 200) % (viewW + 400) + viewW + 400) % (viewW + 400) - 200;
    const a = (0.035 + 0.02 * Math.sin(time * 0.5 + i)) * w;
    const gr = ctx.createLinearGradient(x, 0, x - 160, viewH);
    gr.addColorStop(0, `rgba(255,250,210,${a})`); gr.addColorStop(1, 'rgba(255,250,210,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x - 120, viewH); ctx.lineTo(x - 260, viewH); ctx.fill();
  }
  ctx.restore();
}
