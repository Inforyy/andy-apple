'use strict';
// Andy Apples · kleine 3D-renderer
// Twee soorten 3D op een gewone 2D-canvas:
// - modellen van driehoeken (bollen, cilinders, kegels, blokken) met vlakschaduw en een inktrand (de "omgekeerde
//   schil": een iets grotere kopie waarvan alleen de achterkant wordt getekend), voor de gebouwen op de kaart;
// - Andy zelf: elk lichaamsdeel is een gladde, belichte ellips of staaf met een inktrand (zoals de 2D-Andy),
//   in 3D geplaatst en geanimeerd (lopen, huppelen, zwaaien, juichen, op de borst trommelen, rondkijken).
// Elk model is één geheel in de sortering (op zijn voetpunt), zodat Andy nooit door een kasteel heen steekt.
// Assen: x naar rechts, y omhoog, z van de camera af. De voorkant van een model kijkt naar +z.

// ---- vectoren ----
const v3 = (x, y, z) => [x, y, z];
const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const v3len = a => Math.hypot(a[0], a[1], a[2]) || 1;
const v3norm = a => { const l = v3len(a); return [a[0] / l, a[1] / l, a[2] / l]; };
// draai om de assen (hoeken in radialen)
const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };

// ---- vormen (eenheidsmaten; driehoeken met de buitenkant tegen de klok in) ----
const SHAPES = {};
function shapeSphere(seg = 12, rings = 8) {
  const key = `s${seg}:${rings}`;
  if (SHAPES[key]) return SHAPES[key];
  const V = [], T = [];
  for (let r = 0; r <= rings; r++) {
    const a = Math.PI * r / rings, y = Math.cos(a), rr = Math.sin(a);
    for (let s = 0; s < seg; s++) { const b = 2 * Math.PI * s / seg; V.push([rr * Math.cos(b), y, rr * Math.sin(b)]); }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = r * seg + s, b = r * seg + (s + 1) % seg, c = a + seg, d = b + seg;
    if (r > 0) T.push([a, b, c]);
    if (r < rings - 1) T.push([b, d, c]);
  }
  return (SHAPES[key] = { V, T });
}
// cilinder van y = 0 tot y = 1 met straal 1 (top: straal k; k = 0 is een kegel)
function shapeCyl(seg = 10, k = 1, caps = true) {
  const key = `c${seg}:${k}:${caps}`;
  if (SHAPES[key]) return SHAPES[key];
  const V = [], T = [];
  for (let s = 0; s < seg; s++) { const b = 2 * Math.PI * s / seg; V.push([Math.cos(b), 0, Math.sin(b)], [Math.cos(b) * k, 1, Math.sin(b) * k]); }
  for (let s = 0; s < seg; s++) {
    const a = s * 2, b = ((s + 1) % seg) * 2;
    T.push([a, a + 1, b]);
    if (k > 0) T.push([b, a + 1, b + 1]);
  }
  if (caps) {
    const bot = V.length; V.push([0, 0, 0]);
    for (let s = 0; s < seg; s++) T.push([bot, s * 2, ((s + 1) % seg) * 2]);
    if (k > 0) { const top = V.length; V.push([0, 1, 0]); for (let s = 0; s < seg; s++) T.push([top, ((s + 1) % seg) * 2 + 1, s * 2 + 1]); }
  }
  return (SHAPES[key] = { V, T });
}
function shapeBox() {
  if (SHAPES.box) return SHAPES.box;
  const V = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]);
  // index = (x>0)*4 + (y>0)*2 + (z>0)
  const T = [[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]];
  return (SHAPES.box = { V, T });
}

// ---- een model is een lijst onderdelen: { sh (vorm), m (vertex -> modelruimte), col, cen (midden, voor de inktrand) } ----

// ---- tekenen ----
// R3 verzamelt driehoeken (van alle modellen in beeld) en tekent ze van ver naar dichtbij.
// proj(x, y, z) -> [schermX, schermY, diepte] (diepte > 0 = voor de camera).
const R3 = { list: [], light: v3norm([-0.45, 0.85, -0.55]) };
function r3Begin() { R3.list.length = 0; }
// zet een kleur (#rrggbb of rgb()/hsl()) om naar [r,g,b] (met een kleine cache)
const colCache = new Map();
function colRGB(c) {
  let v = colCache.get(c);
  if (v) return v;
  if (c[0] === '#') { const n = parseInt(c.length === 4 ? c.replace(/#(.)(.)(.)/, '$1$1$2$2$3$3') : c.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  else { // hsl() of rgb(): via een 1×1-canvas
    const [cv, g] = makeCanvas(1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; v = [d[0], d[1], d[2]];
  }
  if (colCache.size > 400) colCache.clear();
  colCache.set(c, v);
  return v;
}
// ---- modellen van driehoeken (gebouwen, hoeden) ----
// De driehoeken van een model, gesorteerd van ver naar dichtbij. place(p) zet een punt uit modelruimte om naar de
// wereld; o.ink: kleur van de rand (of null), o.inkW: dikte van de rand in modeleenheden.
function r3Tris(parts, place, proj, o = {}) {
  const L = R3.light, ink = o.ink === undefined ? '#140f18' : o.ink, inkW = o.inkW || 1.2, out = [];
  for (const P of parts) {
    const { V, T } = P.sh, n = V.length, W = new Array(n), S = new Array(n);
    for (let i = 0; i < n; i++) { W[i] = place(P.m(V[i])); S[i] = proj(W[i][0], W[i][1], W[i][2]); }
    const rgb = colRGB(P.col), amb = P.flat ? 1 : 0.58;
    for (const t of T) {
      const a = S[t[0]], b = S[t[1]], c = S[t[2]];
      if (a[2] <= 1 || b[2] <= 1 || c[2] <= 1) continue;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (area <= 0) continue; // achterkant
      const nrm = v3norm(v3cross(v3sub(W[t[1]], W[t[0]]), v3sub(W[t[2]], W[t[0]])));
      // licht in stapjes: dan hebben buurdriehoeken vaak dezelfde kleur en tekenen we ze in één keer (drawTris)
      const k = amb + (P.flat ? 0 : Math.round(9 * Math.max(0, nrm[0] * L[0] + nrm[1] * L[1] + nrm[2] * L[2])) * 0.061);
      out.push({ d: (a[2] + b[2] + c[2]) / 3, a, b, c, col: lit(P.col, rgb, k) });
    }
    // inktrand: dezelfde vorm iets groter, alleen de achterkant, net achter het onderdeel
    if (ink && P.ink !== false) {
      const cen = P.cen || P.m([0, 0, 0]), S2 = new Array(n);
      for (let i = 0; i < n; i++) {
        const q = P.m(V[i]), d = v3norm(v3sub(q, cen)), g2 = place([q[0] + d[0] * inkW, q[1] + d[1] * inkW, q[2] + d[2] * inkW]);
        S2[i] = proj(g2[0], g2[1], g2[2]);
      }
      for (const t of T) {
        const a = S2[t[0]], b = S2[t[1]], c = S2[t[2]];
        if (a[2] <= 1 || b[2] <= 1 || c[2] <= 1) continue;
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (area >= 0) continue; // alleen de achterkant van de schil
        out.push({ d: Math.max(a[2], b[2], c[2]) + 0.5, a, b, c, col: ink });
      }
    }
  }
  out.sort((p, q) => q.d - p.d);
  return out;
}
// opeenvolgende driehoeken met dezelfde kleur gaan in één pad (veel sneller dan elk apart)
function drawTris(g, L) {
  let col = null;
  const flush = () => { if (col) { g.fill(); g.stroke(); col = null; } };
  for (const t of L) {
    if (t.col !== col) { flush(); col = t.col; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.6; g.lineJoin = 'round'; g.beginPath(); }
    g.moveTo(t.a[0], t.a[1]); g.lineTo(t.b[0], t.b[1]); g.lineTo(t.c[0], t.c[1]); g.closePath();
  }
  flush();
}
// kleurstring voor kleur × lichtsterkte (bewaard, want er zijn maar een paar stapjes)
const litCache = new Map();
function lit(key, rgb, k) {
  const id = key + k;
  let s = litCache.get(id);
  if (!s) { s = `rgb(${Math.min(255, rgb[0] * k) | 0},${Math.min(255, rgb[1] * k) | 0},${Math.min(255, rgb[2] * k) | 0})`; if (litCache.size > 3000) litCache.clear(); litCache.set(id, s); }
  return s;
}
// Een model als één geheel in de tekenlijst: het wordt op zijn voetpunt ((0,0,0) in modelruimte, of o.d) gesorteerd
// tegenover de rest, zodat modellen nooit door elkaar heen steken. o.bias: extra diepte.
function r3Add(parts, place, proj, o = {}) {
  const tris = r3Tris(parts, place, proj, o), p0 = place([0, 0, 0]);
  R3.list.push({ d: (o.d !== undefined ? o.d : proj(p0[0], p0[1], p0[2])[2]) + (o.bias || 0), fn: g => drawTris(g, tris) });
}
// een los 2D-ding (bijv. een boom-sprite) tussen de modellen laten meesorteren
function r3Item(d, fn) { R3.list.push({ d, fn }); }
function r3Flush(g) {
  const L = R3.list;
  L.sort((p, q) => q.d - p.d);
  for (const t of L) t.fn(g);
  L.length = 0;
}

// =====================================================================
//  Andy in 3D
//  Elk lichaamsdeel is een gladde ellips (bol) of staaf met een inktrand, in 3D geplaatst en onderling op diepte
//  gesorteerd. De houding komt uit pose:
//    t (tijd), walk (loopfase), walkAmt (0..1), squash (landen), crouch (inzakken voor een sprong), air (in de lucht),
//    cheer (juichen), wave (zwaaien), beat (op de borst trommelen), cape (wingsuit)
//  pal: het palet van myLook() (vacht, huid, bandana, hoed, kostuum)
// =====================================================================
const INK = '#140f18', LIGHT2D = [-0.42, -0.55]; // licht van linksboven op het scherm
// licht, midden en donker van een kleur (bewaard per kleur)
const toneCache = new Map();
function tones(col) {
  let t = toneCache.get(col);
  if (!t) {
    const c = colRGB(col), m = (k, add) => `rgb(${clamp(c[0] * k + add, 0, 255) | 0},${clamp(c[1] * k + add, 0, 255) | 0},${clamp(c[2] * k + add, 0, 255) | 0})`;
    t = [m(1.1, 42), m(1, 0), m(0.6, 0)];
    if (toneCache.size > 300) toneCache.clear();
    toneCache.set(col, t);
  }
  return t;
}
function drawAndy3D(proj, X, Y, Z, yaw, sc, pal, pose, bias = 0) {
  const t = pose.t || 0, wA = pose.walkAmt || 0, ph = pose.walk || 0, cr = pose.crouch || 0, sq = pose.squash || 0;
  const items = [], P = w => proj(w[0], w[1], w[2]);
  // ---- houding ----
  const busy = wA > 0.05 || pose.cheer || pose.wave || pose.beat || pose.air || cr;
  const bob = wA * Math.abs(Math.sin(ph)) * 2.2 - cr * 7 + Math.sin(t * 2.2) * 0.5; // op en neer bij het lopen, ademen
  const roll = Math.sin(ph) * 0.08 * wA, lean = 0.16 * wA + cr * 0.35 - (pose.cheer ? 0.1 : 0);
  const sy = 1 - 0.16 * sq, sxz = 1 + 0.09 * sq;
  // hoofd: rondkijken als hij stilstaat, knikken bij het trommelen, omhoog bij het juichen
  const look = busy ? 0 : Math.sin(t * 0.55) * 0.5 * clamp(Math.sin(t * 0.21) * 3, 0, 1);
  const hYaw = look + (pose.wave ? 0.2 : 0), hPitch = pose.beat ? Math.sin(t * 24) * 0.06 : pose.cheer ? -0.22 : cr * 0.2 + wA * 0.05;
  const HIP = 19, NECK = 50;
  const root = p => { const q = rotY([p[0] * sxz, p[1] * sy, p[2] * sxz], yaw); return [X + q[0] * sc, Y + q[1] * sc, Z + q[2] * sc]; };
  const body = p => { let q = [p[0], p[1] - HIP, p[2]]; q = rotX(rotZ(q, roll), lean); return root([q[0], q[1] + HIP + bob, q[2]]); };
  const head = p => { let q = [p[0], p[1] - NECK, p[2]]; q = rotY(rotX(q, hPitch), hYaw); return body([q[0], q[1] + NECK, q[2]]); };
  // pixels per modeleenheid (voor de dikte van de lijnen)
  const o0 = P(root([0, 0, 0])), k = Math.max(Math.hypot(...P(root([10, 0, 0])).slice(0, 2).map((v, i) => v - o0[i])), Math.hypot(...P(root([0, 0, 10])).slice(0, 2).map((v, i) => v - o0[i]))) / 10;
  const ik = Math.max(1, k * 1.1);
  // ---- tekenprimitieven ----
  // een ellipsoïde (middelpunt c, stralen r) in de ruimte van xf; o: { ink (false = geen rand), inkK, flat, shine, db }
  const ball = (c, r, col, xf, o = {}) => {
    const C = xf(c), pc = P(C);
    let a = 0, b = 0, d = 0;
    for (let i = 0; i < 3; i++) { const e = c.slice(); e[i] += r[i]; const q = P(xf(e)), ux = q[0] - pc[0], uy = q[1] - pc[1]; a += ux * ux; b += ux * uy; d += uy * uy; }
    const m = (a + d) / 2, s2 = Math.sqrt(((a - d) / 2) ** 2 + b * b), rx = Math.sqrt(m + s2), ry = Math.sqrt(Math.max(0.01, m - s2)), ang = 0.5 * Math.atan2(2 * b, a - d);
    if (o.front && !o.front(pc[2])) return; // alleen als deze kant naar de camera kijkt
    items.push({ d: pc[2] - (o.db || 0) * sc, draw: g => {
      if (o.ink !== false) { g.fillStyle = INK; g.beginPath(); g.ellipse(pc[0], pc[1], rx + ik * (o.inkK || 1), ry + ik * (o.inkK || 1), ang, 0, 6.2832); g.fill(); }
      if (o.flat) { g.fillStyle = col; g.beginPath(); g.ellipse(pc[0], pc[1], rx, ry, ang, 0, 6.2832); g.fill(); }
      else {
        const T = tones(col), ca = Math.cos(-ang), sa = Math.sin(-ang), lx = LIGHT2D[0] * ca - LIGHT2D[1] * sa, ly = LIGHT2D[0] * sa + LIGHT2D[1] * ca;
        g.save(); g.translate(pc[0], pc[1]); g.rotate(ang); g.scale(Math.max(0.01, rx), Math.max(0.01, ry));
        const gr = g.createRadialGradient(lx * 0.8, ly * 0.8, 0.05, lx * 0.25, ly * 0.25, 1.2);
        gr.addColorStop(0, T[0]); gr.addColorStop(0.42, T[1]); gr.addColorStop(1, T[2]);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 6.2832); g.fill(); g.restore();
      }
      if (o.shine) { g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(pc[0] + LIGHT2D[0] * rx * 0.45, pc[1] + LIGHT2D[1] * ry * 0.45, rx * 0.26, ry * 0.18, ang - 0.5, 0, 6.2832); g.fill(); }
    } });
  };
  // een staaf (arm, been, slip) tussen twee wereldpunten, met inktrand en een lichte streep
  const limb = (A, B, r, col, o = {}) => {
    const pa = P(A), pb = P(B), w = 2 * r * k;
    items.push({ d: (pa[2] + pb[2]) / 2 - (o.db || 0) * sc, draw: g => {
      const T = tones(col), ln = (dx, dy, f = 1) => { g.beginPath(); g.moveTo(pa[0] + dx, pa[1] + dy); g.lineTo(pa[0] + (pb[0] - pa[0]) * f + dx, pa[1] + (pb[1] - pa[1]) * f + dy); g.stroke(); };
      g.lineCap = 'round';
      g.strokeStyle = INK; g.lineWidth = w + 2 * ik; ln(0, 0);
      g.strokeStyle = T[2]; g.lineWidth = w; ln(0, 0);
      g.strokeStyle = T[1]; g.lineWidth = w * 0.7; ln(-w * 0.1, -w * 0.1);
      g.strokeStyle = T[0]; g.lineWidth = w * 0.22; ln(-w * 0.22, -w * 0.22, 0.75);
    } });
  };
  // een lijn over het oppervlak (mond), alleen zichtbaar als die kant naar de camera kijkt
  const curve = (pts, xf, wdt, col, front, d) => {
    const S = pts.map(p => P(xf(p)));
    if (!front(S[S.length >> 1][2])) return;
    items.push({ d: d - 0.05, draw: g => { g.strokeStyle = col; g.lineWidth = Math.max(1, wdt * k); g.lineCap = 'round'; g.beginPath(); S.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); } });
  };
  // een mesh (hoed, stekels, cape) als één onderdeel
  const mesh = (parts, xf, cen) => { const tris = r3Tris(parts, xf, proj, { inkW: 1.1 }); items.push({ d: P(xf(cen))[2], draw: g => drawTris(g, tris) }); };

  const suit = pal.appleSuit, fur = pal.fur, skin = pal.skin, skinD = pal.skinD;
  // ---- benen en voeten ----
  for (const sd of [-1, 1]) {
    const p = ph + (sd > 0 ? Math.PI : 0), stride = Math.sin(p) * 7.5 * wA, lift = Math.max(0, Math.cos(p)) * 5.5 * wA;
    const hip = body([sd * 8, 21, 0]);
    const foot = root([sd * 9.5, 3.4 + lift, stride + 1]);
    const knee = root([sd * 10, 11.5 + lift * 0.6 + bob * 0.5 + cr * -2, stride * 0.5 + 4 + lift * 0.4 + cr * 5]);
    limb(hip, knee, 6, fur); limb(knee, foot, 5.3, fur);
    const fc = [sd * 9.5, 2.9 + lift, stride + 4];
    ball(fc, [5.4, 3, 7.4], skin, root, { inkK: 0.9 });
    for (let i = -1; i <= 1; i++) ball([fc[0] + i * 2.6, fc[1] - 0.2, fc[2] + 6.4], [1.8, 1.6, 1.6], skin, root, { inkK: 0.5 }); // tenen
  }
  // ---- lijf ----
  if (suit) {
    ball([0, 33, 0], [21.5, 20.5, 18], '#e8322b', body, { shine: true });
  } else {
    ball([0, 32, 0], [17.5, 19, 13.5], fur, body);
    ball([0, 27.5, 8.4], [10.5, 11.5, 6], skin, body, { inkK: 0.5 });           // buik
    for (const sd of [-1, 1]) ball([sd * 5.4, 39, 11.2], [5.6, 4.4, 2.6], skinD, body, { inkK: 0.45 }); // borstplaten
    for (const sd of [-1, 1]) ball([sd * 14.5, 45, -0.5], [7.5, 7, 7.5], fur, body); // brede schouders
  }
  // cape (wingsuit): hangt achter de schouders en wappert
  if (pose.cape) {
    const flap = Math.sin(t * 7) * 3 + wA * 4;
    mesh([{ sh: shapeBox(), m: p => { const u = (1 - p[1]) / 2; return [p[0] * 12 * (1 + u * 0.5), 46 - u * 30, -12 - u * (5 + flap) + p[2] * 0.8]; }, col: pal.cape || '#c81e3a', cen: [0, 32, -14] }], body, [0, 32, -16]);
  }
  // ---- armen ----
  for (const sd of [-1, 1]) {
    const sw = Math.sin(ph + (sd > 0 ? 0 : Math.PI));
    let hand, elbow;
    if (pose.cheer) { hand = [sd * 21, 83 + Math.sin(t * 16 + sd * 2) * 3, 3]; elbow = [sd * 24, 64, 1]; }
    else if (pose.wave && sd > 0) { hand = [27 + Math.sin(t * 11) * 5, 77, 7]; elbow = [26, 60, 3]; }
    else if (pose.beat) { const b = Math.sin(t * 24 + (sd > 0 ? Math.PI : 0)); hand = [sd * 6.5, 40 + b * 2.5, 17.5 + Math.max(0, b) * 3]; elbow = [sd * 21, 35, 8]; }
    else if (pose.air) { hand = [sd * 30, 40, 4]; elbow = [sd * 25, 44, 1]; }
    else if (cr) { hand = [sd * 19, 20, -9]; elbow = [sd * 21, 32, -6]; }
    else { const s = sw * wA; hand = [sd * 21, 14.5 + Math.abs(s) * 2 + Math.sin(t * 2 + sd) * 0.5, s * 11 + 3]; elbow = [sd * 21.5, 30, s * 4 - 1]; }
    const S = body([sd * 16, 45, -0.5]), E = body(elbow), H = body(hand);
    limb(S, E, 6.2, fur); limb(E, H, 5.6, fur);
    ball(hand, [5.8, 5.4, 5.8], skin, body, { inkK: 0.9 });
    for (let i = -1; i <= 1; i++) ball([hand[0] + i * 2.4, hand[1] - 1.5, hand[2] + 4.4], [1.5, 1.6, 1.4], skinD, body, { ink: false }); // knokkels
  }
  // ---- hoofd ----
  const hc = P(head([0, 60, 0]))[2], front = d => d < hc + 1.5; // voorkant van het hoofd naar de camera?
  ball([0, 60, 0], [13.8, 13.2, 12.6], fur, head);
  if (!pal.kiwi && !pal.hat) ball([0, 72, -1.5], [6.8, 5.2, 6.2], fur, head); // kuif
  for (const sd of [-1, 1]) {
    ball([sd * 13.8, 60.5, -1], [4.4, 4.7, 3], skin, head, { inkK: 0.8 });
    ball([sd * 14.9, 60.5, -0.6], [2.2, 2.7, 1], skinD, head, { ink: false }); // binnenkant van het oor
  }
  // gezicht: snuit, oogkassen, wenkbrauwboog, ogen, neus en mond
  ball([0, 54.5, 8.6], [10, 7.8, 5.6], skin, head, { inkK: 0.55 });
  for (const sd of [-1, 1]) ball([sd * 4.4, 60, 8.8], [4.9, 4.9, 3.8], skin, head, { ink: false });
  ball([0, 64.6, 9.2], [11.4, 3, 4.2], pal.furD, head, { inkK: 0.7 });
  const blink = (t % 3.7) < 0.13 ? 0.12 : 1, eyeL = clamp(hYaw * -1.2, -0.8, 0.8);
  for (const sd of [-1, 1]) {
    ball([sd * 4.2, 60, 12.3], [3, 3.4 * blink, 1.6], '#ffffff', head, { flat: true, inkK: 0.5 });
    if (blink > 0.5) {
      ball([sd * 4.2 + eyeL, 59.6, 13.6], [1.95, 2.05, 0.7], '#3a2416', head, { flat: true, ink: false });
      ball([sd * 4.2 + eyeL, 59.6, 13.9], [1.05, 1.1, 0.5], '#000000', head, { flat: true, ink: false });
      ball([sd * 4.2 + eyeL + 0.8, 60.5, 14.1], [0.6, 0.6, 0.3], '#ffffff', head, { flat: true, ink: false });
    }
  }
  ball([0, 55.4, 13.6], [4.9, 2.9, 2.3], skinD, head, { inkK: 0.45 });
  for (const sd of [-1, 1]) ball([sd * 1.8, 55.5, 15.6], [1.2, 0.9, 0.5], INK, head, { flat: true, ink: false });
  const mouthOpen = pose.cheer || pose.beat || cr || pose.air;
  if (mouthOpen) {
    ball([0, 50.2, 13.2], [3.6, 2.6, 1], INK, head, { flat: true, ink: false, front });
    ball([0, 49.4, 13.5], [2.2, 1.1, 0.6], '#c0394b', head, { flat: true, ink: false, front });
    ball([0, 51.9, 13.6], [3, 0.6, 0.4], '#ffffff', head, { flat: true, ink: false, front });
  } else curve([-1, -0.5, 0, 0.5, 1].map(u => [u * 4.2, 51 - (1 - u * u) * 1.4, 13.4 - u * u * 1.6]), head, 1.3, INK, front, hc - 20 * sc);
  // bandana om het hoofd (alleen de voorkant is zichtbaar), met witte stipjes, knoop en slierten
  {
    const N = 28, pts = [];
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const y = 67 + (1 - Math.cos(a)) * 1.6, f = Math.sqrt(Math.max(0, 1 - ((y - 60) / 13.2) ** 2)) + 0.07; pts.push(P(head([Math.sin(a) * 13.8 * f, y, Math.cos(a) * 12.6 * f]))); /* strak om de schedel */ }
    const vis = i => (pts[i][2] + pts[i + 1][2]) / 2 < hc + 0.5;
    const T = tones(pal.band);
    items.push({ d: hc - 40 * sc, draw: g => { // over het voorhoofd, vóór de wenkbrauwen
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [col, wd] of [[INK, 3.8 * k + 2 * ik], [T[2], 3.8 * k], [pal.band, 2.6 * k]]) {
        g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); let on = false;
        for (let i = 0; i < N; i++) { if (vis(i)) { if (!on) g.moveTo(pts[i][0], pts[i][1] - (col === pal.band ? 0.5 * k : 0)); g.lineTo(pts[i + 1][0], pts[i + 1][1] - (col === pal.band ? 0.5 * k : 0)); on = true; } else on = false; }
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 1; i < N; i += 3) if (vis(i)) { g.beginPath(); g.arc(pts[i][0], pts[i][1], Math.max(0.8, 0.8 * k), 0, 6.2832); g.fill(); }
    } });
    ball([-5.5, 68.5, -12.2], [3.4, 3, 2.6], pal.band, head, { inkK: 0.8 });
    const fl = Math.sin(t * 9) * 2.5, fl2 = Math.sin(t * 9 + 1.3) * 2.5, st = 1 + wA * 0.5;
    limb(head([-6, 68, -13]), head([-11, 62 + fl, -13 - 9 * st]), 1.9, pal.bandD);
    limb(head([-5, 68, -13]), head([-2, 60.5 + fl2, -12 - 8 * st]), 1.9, pal.band);
  }
  // speldje bovenop: een appeltje (of een kiwischijf); Kiwi heeft een oranje stekelkuif
  if (pal.kiwi) {
    mesh([[-5, -0.5], [0, 0], [5, 0.5]].map(([x, a]) => ({ sh: shapeCyl(6, 0), m: p => { const q = rotZ([p[0] * 3, p[1] * 11, p[2] * 3], -a); return [q[0] + x, q[1] + 70, q[2] - 1]; }, col: pal.furL, cen: [x, 74, -1] })), head, [0, 74, -1]);
    ball([0, 71.5, 6], [3.8, 3.8, 1.3], '#8cc63f', head, { inkK: 0.7 });
  } else if (!suit && !pal.hat) {
    ball([0, 72.8, 4.5], [3.5, 3.3, 3.4], '#e8322b', head, { shine: true, inkK: 0.7 });
    ball([1.8, 76.3, 4.5], [1.9, 0.8, 1.2], '#4caf50', head, { inkK: 0.4 });
  }
  if (suit) { // appelkostuum: steeltje en blad op het hoofd
    limb(head([0, 72, 0]), head([1.5, 79, 0]), 1.3, '#6b4423');
    ball([5, 77.5, 0], [5, 1.4, 3], '#4caf50', head, { inkK: 0.6 });
  }
  if (pal.hat) { const H = []; andyHat(pal.hat, 60, H); mesh(H, head, [0, 76, 0]); }
  // alles van Andy is één geheel in de tekenlijst, gesorteerd op zijn voetpunt
  items.sort((p, q) => q.d - p.d);
  R3.list.push({ d: o0[2] + bias, fn: g => { for (const it of items) it.draw(g); } });
}
function andyHat(id, hy, P) {
  const top = hy + 12;
  const add = (sh, m, col, cen) => P.push({ sh, m, col, cen });
  if (id === 'hat_cap') {
    add(shapeSphere(12, 6), p => [p[0] * 14, top - 3 + Math.max(0, p[1]) * 10, p[2] * 14], '#2f7fe0', [0, top, 0]);
    add(shapeCyl(12), p => [p[0] * 9, top - 2 + p[1] * 1.5, p[2] * 7 + 14], '#1d5bb0', [0, top, 13]);
  } else if (id === 'hat_cowboy') {
    add(shapeCyl(16), p => [p[0] * 25, top - 3 + p[1] * 2, p[2] * 21], '#8b5a2b', [0, top, 0]);
    add(shapeCyl(12, 0.85), p => [p[0] * 12, top - 1 + p[1] * 14, p[2] * 11], '#a0703c', [0, top + 6, 0]);
    add(shapeCyl(12, 1, false), p => [p[0] * 12.2, top + p[1] * 3.5, p[2] * 11.2], '#4a2e16', [0, top + 2, 0]);
  } else if (id === 'hat_pirate') {
    add(shapeSphere(12, 6), p => [p[0] * 21, top - 1 + Math.max(0, p[1]) * 12, p[2] * 10], '#1b1b22', [0, top + 4, 0]);
    add(shapeSphere(6, 4), p => [p[0] * 3, top + 6 + p[1] * 3, 9.5 + p[2]], '#f4f1e8', [0, top + 6, 10]);
  } else if (id === 'hat_crown') {
    add(shapeCyl(10, 1, false), p => [p[0] * 12, top - 3 + p[1] * 7, p[2] * 12], '#ffcc33', [0, top + 1, 0]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(shapeCyl(5, 0), p => [p[0] * 2.6 + Math.sin(a) * 11, top + 4 + p[1] * 7, p[2] * 2.6 + Math.cos(a) * 11], '#ffcc33', [Math.sin(a) * 11, top + 7, Math.cos(a) * 11]); }
    add(shapeSphere(6, 4), p => [p[0] * 2.2, top + 1 + p[1] * 2.2, 12 + p[2]], '#e8322b', [0, top + 1, 12]);
  } else if (id === 'hat_wizard') {
    add(shapeCyl(16), p => [p[0] * 20, top - 3 + p[1] * 2, p[2] * 20], '#4b2a8c', [0, top, 0]);
    add(shapeCyl(12, 0), p => { const h = p[1]; return [p[0] * 12 - h * h * 6, top - 1 + h * 30, p[2] * 12]; }, '#5a34a8', [0, top + 10, 0]);
    add(shapeSphere(6, 4), p => [p[0] * 2.5 + 5, top + 12 + p[1] * 2.5, 10 + p[2]], '#ffe066', [5, top + 12, 10]);
  }
}
