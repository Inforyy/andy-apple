'use strict';
// Andy Apples · kleine 3D-renderer
// Tekent eenvoudige 3D-modellen (bollen, cilinders, kegels, blokken) als driehoeken op een gewone 2D-canvas,
// met vlakschaduw en een inktrand (de "omgekeerde schil": een iets grotere kopie waarvan alleen de
// achterkant wordt getekend). Gebruikt voor Andy, de torens en kastelen op de wereldkaart en het laadscherm.
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

// ---- een model is een lijst onderdelen: { sh (vorm), m (vertex -> modelruimte), col, ink } ----
// hulpfuncties die zo'n vertex-functie maken
const xfEll = (c, r, rot) => p => { let q = [p[0] * r[0], p[1] * r[1], p[2] * r[2]]; if (rot) q = rot(q); return [q[0] + c[0], q[1] + c[1], q[2] + c[2]]; };
// een staaf (cilinder) van a naar b met straal r (en straal rb aan het eind)
function xfRod(a, b, r) {
  const ax = v3sub(b, a), L = v3len(ax), Y = v3norm(ax);
  const helper = Math.abs(Y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const X = v3norm(v3cross(helper, Y)), Z = v3cross(X, Y);
  return p => [a[0] + (X[0] * p[0] * r + Y[0] * p[1] * L + Z[0] * p[2] * r), a[1] + (X[1] * p[0] * r + Y[1] * p[1] * L + Z[1] * p[2] * r), a[2] + (X[2] * p[0] * r + Y[2] * p[1] * L + Z[2] * p[2] * r)];
}

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
// voeg een model toe. place(p) zet een punt uit modelruimte om naar de wereld; o.ink: kleur van de rand (of null),
// o.inkW: dikte van de rand in modeleenheden, o.bias: extra diepte voor de sortering tegenover andere modellen.
function r3Add(parts, place, proj, o = {}) {
  const L = R3.light, ink = o.ink === undefined ? '#140f18' : o.ink, inkW = o.inkW || 1.2, bias = o.bias || 0, out = R3.list;
  for (const P of parts) {
    const { V, T } = P.sh, n = V.length, W = new Array(n), S = new Array(n);
    for (let i = 0; i < n; i++) { W[i] = place(P.m(V[i])); S[i] = proj(W[i][0], W[i][1], W[i][2]); }
    const rgb = colRGB(P.col), amb = P.flat ? 1 : 0.58, db = bias + (P.db || 0); // db: details (gezicht, borst) net vóór de vacht
    for (const t of T) {
      const a = S[t[0]], b = S[t[1]], c = S[t[2]];
      if (a[2] <= 1 || b[2] <= 1 || c[2] <= 1) continue;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (area <= 0) continue; // achterkant
      const nrm = v3norm(v3cross(v3sub(W[t[1]], W[t[0]]), v3sub(W[t[2]], W[t[0]])));
      // licht in stapjes: dan hebben buurdriehoeken vaak dezelfde kleur en tekenen we ze in één keer (r3Flush)
      const k = amb + (P.flat ? 0 : Math.round(9 * Math.max(0, nrm[0] * L[0] + nrm[1] * L[1] + nrm[2] * L[2])) * 0.061);
      const col = lit(P.col, rgb, k);
      out.push({ d: (a[2] + b[2] + c[2]) / 3 + db, a, b, c, col });
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
        out.push({ d: Math.max(a[2], b[2], c[2]) + bias + 0.5, a, b, c, col: ink });
      }
    }
  }
}
// kleurstring voor kleur × lichtsterkte (bewaard, want er zijn maar een paar stapjes)
const litCache = new Map();
function lit(key, rgb, k) {
  const id = key + k;
  let s = litCache.get(id);
  if (!s) { s = `rgb(${Math.min(255, rgb[0] * k) | 0},${Math.min(255, rgb[1] * k) | 0},${Math.min(255, rgb[2] * k) | 0})`; if (litCache.size > 3000) litCache.clear(); litCache.set(id, s); }
  return s;
}
// een los 2D-ding (bijv. een boom-sprite) tussen de driehoeken laten meesorteren
function r3Item(d, fn) { R3.list.push({ d, fn }); }
function r3Flush(g) {
  const L = R3.list;
  L.sort((p, q) => q.d - p.d);
  // opeenvolgende driehoeken met dezelfde kleur gaan in één pad (veel sneller dan elk apart)
  let col = null;
  const flush = () => { if (col) { g.fill(); g.stroke(); col = null; } };
  for (const t of L) {
    if (t.fn) { flush(); t.fn(); continue; }
    if (t.col !== col) { flush(); col = t.col; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.6; g.lineJoin = 'round'; g.beginPath(); }
    g.moveTo(t.a[0], t.a[1]); g.lineTo(t.b[0], t.b[1]); g.lineTo(t.c[0], t.c[1]); g.closePath();
  }
  flush();
  L.length = 0;
}

// =====================================================================
//  Andy in 3D
//  pose: { walk (fase), walkAmt (0..1), hop, wave, cheer, beat, t }
//  pal: het palet van myLook() (vacht, huid, bandana, hoed, kostuum)
// =====================================================================
function andyParts(pal, pose) {
  const lo = typeof Q !== 'undefined' && Q.lite, S = lo ? shapeSphere(9, 6) : shapeSphere(12, 8), Ss = lo ? shapeSphere(6, 4) : shapeSphere(8, 6), C = shapeCyl(lo ? 6 : 8), P = []; // minder driehoeken op de laagste kwaliteit
  const add = (sh, m, col, extra) => P.push(Object.assign({ sh, m, col }, extra));
  const ell = (c, r, col, sh = S, rot, extra) => add(sh, xfEll(c, r, rot), col, Object.assign({ cen: c }, extra));
  const rod = (a, b, r, col) => { add(C, xfRod(a, b, r), col, { cen: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] }); ell(b, [r, r, r], col, Ss); };
  const t = pose.t || 0, wA = pose.walkAmt || 0, ph = pose.walk || 0;
  const breathe = Math.sin(t * 2.2) * 0.6;
  const suit = pal.appleSuit, fur = pal.fur, furD = pal.furD, skin = pal.skin, skinD = pal.skinD;
  // benen (kort en krachtig) en voeten
  for (const sd of [-1, 1]) {
    const sw = Math.sin(ph + (sd > 0 ? Math.PI : 0)) * 9 * wA;
    const hip = [sd * 8, 18, 0], foot = [sd * 10, 4 + Math.max(0, -sw) * 0.3, sw];
    rod(hip, foot, 5.6, fur);
    ell([foot[0], 3, foot[2] + 3], [5.5, 3.2, 7.5], skin, Ss);
  }
  // lijf (of een grote appel)
  if (suit) {
    ell([0, 33 + breathe, 0], [21, 20, 18], '#e8322b');
    ell([-7, 42 + breathe, 12], [5, 5, 3], '#ff8a7a', Ss, null, { ink: false, flat: true });
  } else {
    ell([0, 33 + breathe, 0], [18, 20, 14], fur);
    ell([0, 30 + breathe, 9], [11, 12.5, 6.5], skin, S, null, { ink: false, db: -2 });
    ell([-5.5, 40 + breathe, 12.5], [5.5, 4.2, 2.6], skinD, Ss, null, { ink: false, db: -3 });
    ell([5.5, 40 + breathe, 12.5], [5.5, 4.2, 2.6], skinD, Ss, null, { ink: false, db: -3 });
  }
  // armen: lange gorilla-armen, zwaaien bij het lopen; zwaaien (wave), juichen (cheer) of op de borst trommelen (beat)
  for (const sd of [-1, 1]) {
    const sh = [sd * 16, 46 + breathe, 0];
    let hand;
    const sw = Math.sin(ph + (sd > 0 ? 0 : Math.PI)) * 12 * wA;
    if (pose.cheer) hand = [sd * 26, 76 + Math.sin(t * 14 + sd) * 4, 2];
    else if (pose.wave && sd > 0) hand = [30, 70 + Math.sin(t * 12) * 3, 4 + Math.sin(t * 12) * 6];
    else if (pose.beat) { const b = Math.sin(t * 28 + (sd > 0 ? Math.PI : 0)); hand = [sd * 6, 40 + b * 3, 16 + Math.max(0, b) * 3]; }
    else hand = [sd * 24, 14 + Math.abs(sw) * 0.2, sw + 2];
    const elbow = [(sh[0] + hand[0]) / 2 + sd * 5, (sh[1] + hand[1]) / 2, (sh[2] + hand[2]) / 2 - 2];
    rod(sh, elbow, 6, fur); rod(elbow, hand, 5.4, fur);
    ell(hand, [5.4, 5, 5.4], skin, Ss);
  }
  // hoofd
  const hy = 60 + breathe * 0.5;
  ell([0, hy, 0], [13.5, 13, 12.5], fur);
  ell([-13.5, hy + 1, -1], [4.5, 4.5, 3], skin, Ss); ell([13.5, hy + 1, -1], [4.5, 4.5, 3], skin, Ss);
  if (!pal.kiwi) ell([0, hy + 12, -1], [6.5, 5, 6], fur, Ss); // kuif
  ell([0, hy - 5, 9], [10, 7.5, 5.5], skin, S, null, { ink: false, db: -1.5 });     // snuit
  ell([-4.5, hy + 1, 9], [4.8, 4.8, 3.6], skin, Ss, null, { ink: false, db: -1.5 });
  ell([4.5, hy + 1, 9], [4.8, 4.8, 3.6], skin, Ss, null, { ink: false, db: -1.5 });
  ell([0, hy + 5.5, 9.5], [11.5, 3.3, 4.2], furD, S, null, { ink: false, db: -2.5 }); // wenkbrauwboog
  // ogen (knipperen af en toe)
  const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
  for (const sd of [-1, 1]) {
    ell([sd * 4.2, hy + 1, 12.2], [2.9, 3.3 * blink, 1.6], '#ffffff', Ss, null, { ink: false, flat: true, db: -3 });
    if (blink > 0.5) ell([sd * 4.2 + 0.3, hy + 0.6, 13.4], [1.5, 1.7, 0.8], '#2a1a10', Ss, null, { ink: false, flat: true, db: -4 });
  }
  ell([0, hy - 4.5, 14], [4.6, 2.8, 2], skinD, Ss, null, { ink: false, db: -3 }); // neus
  ell([0, hy - 9.5, 12.8], [4, 1.3, 1], '#140f18', Ss, null, { ink: false, flat: true, db: -3 }); // mond
  // bandana met slierten achter het hoofd
  add(shapeCyl(14, 1, false), xfEll([0, hy + 7, -0.5], [13.9, 4.2, 13.1]), pal.band, { cen: [0, hy + 9, -0.5], ink: false });
  const tl = 1 + (pose.walkAmt || 0) * 0.4, wv = Math.sin(t * 9) * 2;
  rod([-2, hy + 8, -12], [-6, hy - 2 + wv, -18 * tl], 2, pal.bandD); rod([2, hy + 8, -12], [6, hy - 4 - wv, -17 * tl], 2, pal.band);
  // speldje: een appeltje (of een kiwischijf) bovenop
  if (pal.kiwi) {
    for (const [x, a] of [[-5, -0.5], [0, 0], [5, 0.5]]) add(shapeCyl(6, 0), p => { let q = rotZ([p[0] * 3, p[1] * 11, p[2] * 3], -a); return [q[0] + x, q[1] + hy + 10, q[2]]; }, pal.furL, { cen: [x, hy + 14, 0] });
    ell([0, hy + 13, 8], [3.6, 3.6, 1.2], '#8cc63f', Ss);
  } else if (!suit) {
    ell([0, hy + 17, 3], [3.4, 3.2, 3.4], '#e8322b', Ss);
    ell([1.6, hy + 20.5, 3], [1.8, 0.8, 1.2], '#4caf50', Ss, null, { ink: false });
  }
  if (suit) { // appelkostuum: steeltje en blad op het hoofd
    rod([0, hy + 12, 0], [1.5, hy + 20, 0], 1.4, '#6b4423');
    ell([5, hy + 18, 0], [5, 1.4, 3], '#4caf50', Ss, q => rotZ(q, -0.5));
  }
  if (pal.hat) andyHat(pal.hat, hy, P);
  // cape als je een wingsuit hebt
  if (pose.cape) {
    const flap = Math.sin(t * 7) * 3;
    add(shapeBox(), p => { const q = [p[0] * 13 * (1 + (p[1] + 1) * 0.25), (p[1] - 1) * 14, p[2] * 1]; return [q[0], q[1] + 49, -11 - (1 - p[1]) * 4 + flap * (1 - p[1]) * 0.5]; }, pal.cape || '#c81e3a', { cen: [0, 35, -12] });
  }
  return P;
}
function andyHat(id, hy, P) {
  const top = hy + 12;
  const add = (sh, m, col, cen) => P.push({ sh, m, col, cen });
  if (id === 'hat_cap') {
    add(shapeSphere(12, 6), p => [p[0] * 13, top - 2 + Math.max(0, p[1]) * 9, p[2] * 13], '#2f7fe0', [0, top, 0]);
    add(shapeCyl(12), p => [p[0] * 9, top - 2 + p[1] * 1.5, p[2] * 7 + 13], '#1d5bb0', [0, top, 12]);
  } else if (id === 'hat_cowboy') {
    add(shapeCyl(16), p => [p[0] * 24, top - 3 + p[1] * 2, p[2] * 20], '#8b5a2b', [0, top, 0]);
    add(shapeCyl(12, 0.85), p => [p[0] * 11, top - 1 + p[1] * 14, p[2] * 10], '#a0703c', [0, top + 6, 0]);
    add(shapeCyl(12, 1, false), p => [p[0] * 11.2, top + p[1] * 3.5, p[2] * 10.2], '#4a2e16', [0, top + 2, 0]);
  } else if (id === 'hat_pirate') {
    add(shapeSphere(12, 6), p => [p[0] * 20, top + Math.max(0, p[1]) * 12, p[2] * 9], '#1b1b22', [0, top + 4, 0]);
    add(shapeSphere(6, 4), p => [p[0] * 3, top + 7 + p[1] * 3, 8.5 + p[2]], '#f4f1e8', [0, top + 7, 9]);
  } else if (id === 'hat_crown') {
    add(shapeCyl(10, 1, false), p => [p[0] * 11, top - 2 + p[1] * 7, p[2] * 11], '#ffcc33', [0, top + 2, 0]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(shapeCyl(5, 0), p => [p[0] * 2.6 + Math.sin(a) * 10, top + 5 + p[1] * 7, p[2] * 2.6 + Math.cos(a) * 10], '#ffcc33', [Math.sin(a) * 10, top + 8, Math.cos(a) * 10]); }
    add(shapeSphere(6, 4), p => [p[0] * 2.2, top + 2 + p[1] * 2.2, 11 + p[2]], '#e8322b', [0, top + 2, 11]);
  } else if (id === 'hat_wizard') {
    add(shapeCyl(16), p => [p[0] * 19, top - 3 + p[1] * 2, p[2] * 19], '#4b2a8c', [0, top, 0]);
    add(shapeCyl(12, 0), p => { const h = p[1]; return [p[0] * 11 - h * h * 6, top - 1 + h * 30, p[2] * 11]; }, '#5a34a8', [0, top + 10, 0]);
    add(shapeSphere(6, 4), p => [p[0] * 2.5 + 5, top + 12 + p[1] * 2.5, 9 + p[2]], '#ffe066', [5, top + 12, 9]);
  }
}
// Andy in 3D tekenen op wereldpositie (x, y, z) met draaiing yaw en schaal sc
function drawAndy3D(proj, x, y, z, yaw, sc, pal, pose, bias) {
  const parts = andyParts(pal, pose), tilt = pose.tilt || 0;
  r3Add(parts, p => { let q = rotY(rotX(p, tilt), yaw); return [x + q[0] * sc, y + q[1] * sc, z + q[2] * sc]; }, proj, { inkW: 1.1, bias });
}
