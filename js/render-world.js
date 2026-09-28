'use strict';
// Andy Apples · tekenen: speelwereld
// De speelwereld tekenen (lianen, Andy, vijanden, ...), render() en interpolatie tussen physics-stappen.

// =====================================================================
//  Speelwereld
// =====================================================================
// De startrots waar Andy op begint
function drawRock() {
  if (camX > ROCK.x1 + 60) return;
  const { x0, x1, top } = ROCK, bot = HAZARD_Y + 80;
  ctx.fillStyle = cachedGrad('rock', () => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#5d5a57'); g.addColorStop(0.6, '#8a8580'); g.addColorStop(1, '#6b6763'); return g; });
  ctx.beginPath();
  ctx.moveTo(x0 - 60, bot); ctx.lineTo(x0 - 20, top + 120); ctx.lineTo(x0, top + 20); ctx.quadraticCurveTo(x0 + 20, top - 6, x0 + 70, top - 4);
  ctx.lineTo(x1 - 40, top - 6); ctx.quadraticCurveTo(x1 - 4, top - 4, x1, top + 24); ctx.lineTo(x1 + 12, top + 140); ctx.lineTo(x1 + 30, bot); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.moveTo(x1 - 20, top + 30); ctx.lineTo(x1 + 12, top + 140); ctx.lineTo(x1 + 30, bot); ctx.lineTo(x1 - 40, bot); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(40,35,30,.5)'; ctx.lineWidth = 2.5;
  line(x0 + 60, top + 40, x0 + 90, top + 110); line(x0 + 90, top + 110, x0 + 80, top + 170); line(x1 - 70, top + 60, x1 - 50, top + 150);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ell(x0 + 110, top + 30, 50, 10, -0.1);
  // gras en mos bovenop
  ctx.fillStyle = '#4e9a3a'; ctx.beginPath(); ctx.moveTo(x0 + 2, top + 16); ctx.quadraticCurveTo(x0 + 20, top - 12, x0 + 70, top - 10); ctx.lineTo(x1 - 40, top - 12); ctx.quadraticCurveTo(x1 - 4, top - 10, x1 + 2, top + 18); ctx.lineTo(x1 - 6, top + 8); ctx.lineTo(x0 + 8, top + 8); ctx.fill();
  ctx.strokeStyle = '#6fc04a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let x = x0 + 8; x < x1; x += 11) line(x, top - 6, x + Math.sin(time * 2 + x) * 2 - 2, top - 16 - (x * 7 % 9));
  // een varen en een appel op de rots
  ctx.fillStyle = '#3f8f3a';
  for (let k = -3; k <= 3; k++) { const a = -Math.PI / 2 + k * 0.3 + Math.sin(time * 1.5) * 0.03; ell(x0 + 40 + Math.cos(a) * 26, top - 8 + Math.sin(a) * 26, 26, 6, a); }
  const ap = appleSprite(false); ctx.drawImage(ap.c, x1 - 70, top - 30, 22, 24);
}
// Finish in de carrière: een geblokte vlaggenlijn over de hele hoogte
// Portalen: een gloeiende ellips met een draaiende kolk. front=false: de gloed erachter, true: de rand ervoor
const PORTAL_COL = { b: ['92,200,255', '#2f8fff', '#0b2a66'], o: ['255,160,60', '#ff7a12', '#5a2204'] };
function drawPortalOne(x, y, rot, kind, ph, front, used) {
  if (x < camX - 140 || x > camX + viewW + 140 || y < camY - 140 || y > camY + viewH + 140) return;
  const [glow, rim, deep] = PORTAL_COL[kind], pulse = 1 + Math.sin(time * 3 + ph) * 0.04 + (time - used < 0.4 ? (0.4 - (time - used)) : 0);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(pulse, pulse);
  if (!front) {
    if (!Q.lite) { ctx.fillStyle = `rgba(${glow},.22)`; ell(0, 0, PORTAL_RX + 16, PORTAL_RY + 16); }
    ctx.fillStyle = cachedGrad('portal' + kind, () => { const g = ctx.createRadialGradient(0, 0, 4, 0, 0, PORTAL_RY); g.addColorStop(0, deep); g.addColorStop(0.75, rim); g.addColorStop(1, `rgba(${glow},.9)`); return g; });
    ctx.save(); ctx.scale(PORTAL_RX / PORTAL_RY, 1); circ(0, 0, PORTAL_RY); ctx.restore();
    // draaiende kolk
    ctx.strokeStyle = `rgba(${glow},.55)`; ctx.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) { const a = time * 2.4 + k * 2.09 + ph; ctx.beginPath(); ctx.ellipse(0, 0, PORTAL_RX * 0.6, PORTAL_RY * 0.62, 0, a, a + 1.3); ctx.stroke(); }
  } else {
    ctx.strokeStyle = rim; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 0, PORTAL_RX, PORTAL_RY, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 0, PORTAL_RX - 1, PORTAL_RY - 1, 0, 0, Math.PI * 2); ctx.stroke();
    if (!Q.lite) for (let k = 0; k < 5; k++) { // vonkjes langs de rand
      const a = time * (kind === 'b' ? 1.6 : -1.6) + k * 1.257 + ph;
      ctx.fillStyle = `rgba(${glow},.95)`; circ(Math.cos(a) * PORTAL_RX, Math.sin(a) * PORTAL_RY, 2.4);
    }
  }
  ctx.restore();
}
function drawPortals(front) {
  for (const P of portals) {
    drawPortalOne(P.bx, P.by, 0, 'b', P.ph, front, P.used);
    drawPortalOne(P.ox, P.oy, P.oa, 'o', P.ph + 1, front, P.used);
    // pijltjes bij het blauwe portaal: hier naar binnen
    if (front && P.bx > camX - 100 && P.bx < camX + viewW + 100) {
      ctx.fillStyle = 'rgba(160,220,255,.7)';
      for (let k = 0; k < 2; k++) {
        const ax = P.bx - 70 + k * 20 + ((time * 40) % 20);
        ctx.beginPath(); ctx.moveTo(ax, P.by - 9); ctx.lineTo(ax + 10, P.by); ctx.lineTo(ax, P.by + 9); ctx.lineTo(ax + 4, P.by); ctx.closePath(); ctx.fill();
      }
    }
  }
}
function drawFinish() {
  const C = game.career || game.mp;
  if (!C || !C.finishX) return;
  const x = C.finishX;
  if (x < camX - 80 || x > camX + viewW + 80) return;
  const y0 = Math.max(camY - 20, CEIL_Y - 400), y1 = Math.min(camY + viewH + 20, HAZARD_Y + 40);
  for (let y = Math.floor(y0 / 24) * 24, r = 0; y < y1; y += 24, r++) {
    ctx.fillStyle = r % 2 ? '#ffffff' : '#111111'; ctx.fillRect(x - 12, y, 12, 24);
    ctx.fillStyle = r % 2 ? '#111111' : '#ffffff'; ctx.fillRect(x, y, 12, 24);
  }
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 12, y0, 60, y1 - y0);
  const by = clamp(G.y - 140, y0 + 40, y1 - 120);
  ctx.fillStyle = '#e8322b'; ctx.fillRect(x + 14, by, 120, 44);
  ctx.fillStyle = '#fff'; ctx.font = '900 24px Trebuchet MS, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', x + 26, by + 23);
}
function drawMarkers() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const m0 = Math.max(100, Math.floor(((camX - START_X) / PX_PER_M) / 100) * 100);
  for (let m = m0; m < m0 + 300; m += 100) {
    const x = START_X + m * PX_PER_M;
    if (x < camX - 60 || x > camX + viewW + 60) continue;
    ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 3, HAZARD_Y - 50, 6, 80);
    ctx.fillStyle = '#8a5a2e'; ctx.fillRect(x - 28, HAZARD_Y - 72, 56, 24);
    ctx.strokeStyle = '#4a2e16'; ctx.lineWidth = 2; ctx.strokeRect(x - 28, HAZARD_Y - 72, 56, 24);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Trebuchet MS, sans-serif'; ctx.fillText(m + ' m', x, HAZARD_Y - 60);
  }
  if (save.best >= 20 && !game.career && !game.mp) {
    const x = START_X + save.best * PX_PER_M;
    if (x > camX - 80 && x < camX + viewW + 80) {
      ctx.fillStyle = '#ddd'; ctx.fillRect(x - 3, HAZARD_Y - 200, 6, 240);
      ctx.fillStyle = '#fde047';
      const w = Math.sin(time * 4) * 4;
      ctx.beginPath(); ctx.moveTo(x + 3, HAZARD_Y - 200); ctx.lineTo(x + 80, HAZARD_Y - 186 + w); ctx.lineTo(x + 3, HAZARD_Y - 160); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a4a1c'; ctx.font = 'bold 13px Trebuchet MS, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('RECORD', x + 8, HAZARD_Y - 186);
      ctx.fillText(save.best + ' m', x + 8, HAZARD_Y - 172);
    }
  }
}
function drawShrooms() {
  for (const s of shrooms) {
    if (s.x < camX - 140 || s.x > camX + viewW + 140) continue;
    const col = BIOMES[s.bi].shroom;
    ctx.save(); ctx.translate(s.x, HAZARD_Y + 10);
    ctx.scale((1 + s.sq * 0.25) * 1.8, (1 - s.sq * 0.3) * 1.45); // grote stuiterzwam
    ctx.fillStyle = '#f3e6cc'; ctx.fillRect(-11, -56, 22, 70);
    ctx.fillStyle = '#d8c7a4'; ctx.fillRect(-11, -56, 6, 70);
    ctx.fillStyle = shade(col, -0.3); ctx.beginPath(); ctx.ellipse(0, -52, 52, 30, 0, Math.PI, 0); ctx.fill();
    const cg = ctx.createRadialGradient(-14, -76, 4, 0, -56, 52); cg.addColorStop(0, shade(col, 0.35)); cg.addColorStop(1, col);
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(0, -56, 50, 28, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.88)'; circ(-24, -66, 6); circ(4, -76, 7); circ(26, -64, 5); circ(-6, -60, 4);
    ctx.restore();
  }
}
// Zwevende lucht-trampolines, gedragen door twee ballonnetjes
function drawTramps() {
  for (const t of tramps) {
    if (t.x < camX - 150 || t.x > camX + viewW + 150) continue;
    const y = t.y + Math.sin(time * 1.5 + t.ph) * 6;
    if (y < camY - 150 || y > camY + viewH + 60) continue;
    const w = t.w, sq = t.sq;
    ctx.save(); ctx.translate(t.x, y);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2;
    const cols = ['#ff5a7a', '#ffd23f'];
    [-1, 1].forEach((sd, i) => {
      const bx = sd * w * 0.42 + Math.sin(time * 2 + i) * 3;
      line(sd * w * 0.36, -2, bx, -70);
      ctx.fillStyle = cols[i]; ell(bx, -86, 13, 16);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ell(bx - 4, -91, 3.5, 5);
      ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(bx - 3, -70); ctx.lineTo(bx + 3, -70); ctx.lineTo(bx, -73); ctx.fill();
    });
    ctx.fillStyle = '#1f2a44'; ell(0, 0, w / 2 + 2, 13);
    ctx.fillStyle = '#3aa0e8'; ell(0, 1 + sq * 9, w / 2 - 8, 7 + sq * 7);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ell(-w * 0.12, -1 + sq * 7, w * 0.18, 2.5);
    ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.ellipse(0, 0, w / 2, 12, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5;
    for (let k = -3; k <= 3; k++) { const x = k * w / 8; line(x, 10 * Math.sqrt(1 - (x / (w / 2)) ** 2), x, 16); }
    ctx.restore();
  }
}
// De ruimte: hoe hoger de camera, hoe meer de lucht overgaat in sterren en een planeet
const spaceWeight = () => clamp((-(camY + viewH / 2) - 1900) / 1300, 0, 1);
function drawSpace(w) {
  ctx.fillStyle = `rgba(3,4,18,${w})`; ctx.fillRect(0, 0, viewW, viewH);
  for (let i = 0; i < 160; i++) {
    const x = hash(i * 3.17) * viewW, y = ((hash(i * 7.3) * viewH * 1.5 - camY * 0.05) % viewH + viewH) % viewH;
    ctx.fillStyle = `rgba(255,255,255,${w * (0.3 + 0.7 * Math.abs(Math.sin(time * 1.1 + i)))})`;
    ctx.fillRect(x, y, hash(i) < 0.12 ? 2.4 : 1.3, hash(i) < 0.12 ? 2.4 : 1.3);
  }
  ctx.save(); ctx.globalAlpha = w;
  const px = viewW * 0.22, py = viewH * 0.3;
  ctx.strokeStyle = 'rgba(230,200,150,.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(px, py, 120, 26, -0.3, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
  const pg = ctx.createRadialGradient(px - 25, py - 25, 10, px, py, 70); pg.addColorStop(0, '#ffd9a0'); pg.addColorStop(1, '#b8603a');
  ctx.fillStyle = pg; circ(px, py, 70);
  ctx.fillStyle = 'rgba(120,50,30,.35)'; ell(px, py - 15, 66, 7, -0.3); ell(px + 5, py + 18, 62, 6, -0.3);
  ctx.beginPath(); ctx.ellipse(px, py, 120, 26, -0.3, -Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
  // de gloed van de aarde onder je
  const hy = viewH + 2300 - clamp((-(camY + viewH / 2) - 1900) / 1300, 0, 1) * 150;
  const eg = ctx.createRadialGradient(viewW / 2, hy, 2300, viewW / 2, hy, 2520);
  eg.addColorStop(0, 'rgba(80,170,255,.9)'); eg.addColorStop(0.3, 'rgba(80,170,255,.35)'); eg.addColorStop(1, 'rgba(80,170,255,0)');
  ctx.fillStyle = eg; ctx.fillRect(0, viewH * 0.4, viewW, viewH * 0.6);
  ctx.restore();
}
function drawBalloon(v) {
  const b = v.balloon, a = v.pts[0], x = a.x, y = a.y;
  // mand
  ctx.fillStyle = '#8a5a2e'; ctx.fillRect(x - 16, y - 22, 32, 20);
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.5; line(x - 16, y - 15, x + 16, y - 15); line(x - 16, y - 8, x + 16, y - 8);
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.2; line(x - 15, y - 22, x - 34, y - 70); line(x + 15, y - 22, x + 34, y - 70); line(x - 5, y - 22, x - 12, y - 64); line(x + 5, y - 22, x + 12, y - 64);
  // ballon met gekleurde banen
  const cy = y - 125, rx = 58, ry = 68;
  ctx.save(); ctx.beginPath(); ctx.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); ctx.moveTo(x - 36, cy + 50); ctx.closePath(); ctx.clip();
  for (let k = -3; k <= 3; k++) { ctx.fillStyle = `hsl(${(b.hue + k * 40 + 360) % 360},80%,${k % 2 ? 55 : 65}%)`; ctx.fillRect(x + k * 17 - 9, cy - ry, 18, ry * 2); }
  const sh = ctx.createRadialGradient(x - 20, cy - 25, 5, x, cy, 70); sh.addColorStop(0, 'rgba(255,255,255,.45)'); sh.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = sh; ctx.fillRect(x - rx, cy - ry, rx * 2, ry * 2);
  ctx.restore();
  ctx.fillStyle = `hsl(${b.hue},70%,40%)`; ctx.beginPath(); ctx.moveTo(x - 34, cy + 52); ctx.quadraticCurveTo(x, cy + 80, x + 34, cy + 52); ctx.lineTo(x + 20, cy + 62); ctx.lineTo(x - 20, cy + 62); ctx.fill();
}
function drawVine(v) {
  const p = v.pts, n = p.length;
  let shakeX = 0;
  if (v.type === 'rotten' && G.vine === v && G.hangT > v.snapAt - 0.45) shakeX = Math.sin(time * 60) * 1.5;
  const path = () => {
    ctx.beginPath(); ctx.moveTo(p[0].x + shakeX, p[0].y);
    for (let i = 1; i < n - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x + shakeX, p[i].y, mx + shakeX, my);
    }
    ctx.lineTo(p[n - 1].x + shakeX, p[n - 1].y);
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (v.type === 'turbo') { ctx.strokeStyle = `rgba(255,215,70,${0.25 + 0.15 * Math.sin(time * 6)})`; ctx.lineWidth = 16; path(); ctx.stroke(); }
  ctx.strokeStyle = v.dark; ctx.lineWidth = v.type === 'balloon' ? 5 : 7.5; path(); ctx.stroke();
  ctx.strokeStyle = v.col; ctx.lineWidth = v.type === 'balloon' ? 3 : 4.5; path(); ctx.stroke();
  if (qLevel >= 3) { ctx.strokeStyle = v.light; ctx.lineWidth = 1.4; ctx.save(); ctx.translate(-1.2, -0.5); path(); ctx.stroke(); ctx.restore(); }
  if (v.type === 'elastic') { ctx.setLineDash([5, 7]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.5; path(); ctx.stroke(); ctx.setLineDash([]); }
  if (v.type === 'icy') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; path(); ctx.stroke(); }
  if (v.type === 'balloon') return;
  // blaadjes (met nerf)
  for (let i = 2; i < n; i += 3) {
    const q = p[i], r = p[i - 1];
    const side = i % 2 ? 1 : -1, ang = Math.atan2(q.y - r.y, q.x - r.x) + side * 0.9;
    if (v.type === 'icy') {
      ctx.fillStyle = v.leaf; ctx.beginPath(); ctx.moveTo(q.x - 3, q.y); ctx.lineTo(q.x + 3, q.y); ctx.lineTo(q.x, q.y + 10); ctx.closePath(); ctx.fill();
    } else {
      const lx = q.x + Math.cos(ang) * 7, ly = q.y + Math.sin(ang) * 7;
      ctx.fillStyle = shade(v.leaf, -0.25); ell(lx + 0.8, ly + 0.8, 7.5, 3.4, ang);
      ctx.fillStyle = v.leaf; ell(lx, ly, 7.5, 3.4, ang);
      ctx.strokeStyle = shade(v.leaf, -0.3); ctx.lineWidth = 0.8; line(lx - Math.cos(ang) * 6, ly - Math.sin(ang) * 6, lx + Math.cos(ang) * 6, ly + Math.sin(ang) * 6);
    }
  }
  if (v.type === 'rotten') { ctx.fillStyle = '#4a321a'; for (let i = 3; i < n; i += 4) circ(p[i].x + shakeX, p[i].y, 2.5); }
  if (v.type === 'turbo') { // glinsters die langs de liaan omlaag lopen
    ctx.fillStyle = '#fff6c0';
    for (let j = 0; j < 3; j++) { const q = p[Math.floor((time * 10 + j * n / 3) % n)]; starPath(ctx, q.x, q.y, 4.5, time * 4); ctx.fill(); }
  }
  ctx.fillStyle = v.dark; circ(p[n - 1].x, p[n - 1].y, 3.5);
}
// De tak waar een liaan aan hangt (blijft staan als een rotte liaan breekt)
function drawBranch(v) {
  if (v.balloon) { drawBalloon(v); return; }
  const style = BIOMES[v.bi].style, c = BIOMES[v.bi].c;
  ctx.save(); ctx.translate(v.x, v.ay); ctx.rotate(v.tilt);
  const L = v.bl;
  const wood = style === 'volcano' ? '#3a2a22' : style === 'ice' ? '#6b5a4e' : '#6b4423';
  // horizontale afgebroken tak, liaan hangt aan de rechterkant (zoals in Benji Bananas)
  ctx.fillStyle = shade(wood, -0.3);
  ctx.beginPath(); ctx.moveTo(-L, -8); ctx.lineTo(L * 0.7, -7); ctx.lineTo(L * 0.7, 7); ctx.lineTo(-L, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = wood;
  ctx.beginPath(); ctx.moveTo(-L, -8); ctx.lineTo(L * 0.7, -7); ctx.lineTo(L * 0.7, 1); ctx.lineTo(-L, 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(wood, 0.25); ctx.fillRect(-L, -8, L * 1.7, 2);
  ctx.fillStyle = '#c89a62'; ell(L * 0.7, 0, 3.5, 7); ctx.fillStyle = '#8a5a2e'; ell(L * 0.7, 0, 1.6, 3.2);
  ctx.fillStyle = '#c89a62'; ell(-L, 0, 3.5, 8); ctx.fillStyle = '#8a5a2e'; ell(-L, 0, 1.6, 3.5);
  // takje met blad
  ctx.strokeStyle = wood; ctx.lineWidth = 3; ctx.lineCap = 'round';
  line(-L * 0.6, -6, -L * 0.8, -20);
  ctx.fillStyle = style === 'ice' ? '#ffffff' : c.canopy2;
  ell(-L * 0.85, -24, 8, 4, -0.8); ell(-L * 0.35, -12, 7, 3.5, 0.5); ell(L * 0.3, -11, 6, 3, -0.4);
  if (style === 'ice') { ctx.fillStyle = 'rgba(255,255,255,.95)'; ell(-L * 0.15, -8, L * 0.85, 3.5); }
  // liaan om de tak gewikkeld
  ctx.strokeStyle = v.col; ctx.lineWidth = 3.5;
  line(-6, -9, 2, 9); line(2, -9, 10, 9);
  if (v.flower) {
    const fx = -L * 0.35, fy = -9;
    ctx.fillStyle = v.flower;
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4 + time * 0.3; ell(fx + Math.cos(a) * 4.5, fy + Math.sin(a) * 4.5, 3.4, 2.4, a); }
    ctx.fillStyle = '#ffd23f'; circ(fx, fy, 2.3);
  }
  ctx.restore();
}
function drawApple(a) {
  const bob = a.vine || a.loose ? 0 : Math.sin(a.t * 3) * 3;
  const x = a.x, y = a.y + bob, s = appleSprite(a.gold);
  if (a.gold && !Q.lite) ctx.drawImage(glowSprite('255,230,120').c, x - 28, y - 28, 56, 56);
  const sc = 0.62 * (1 + Math.sin(a.t * 4) * 0.04);
  ctx.drawImage(s.c, x - s.w * sc / 2, y - s.h * sc / 2 - 2, s.w * sc, s.h * sc);
  if (a.gold && Math.sin(a.t * 5) > 0.6) { ctx.fillStyle = '#fff'; starPath(ctx, x + 8, y - 6, 4, a.t); ctx.fill(); }
}
function drawSkyBirds() {
  for (const b of life.sky) {
    if (b.y < camY - 40 || b.y > camY + viewH + 40) continue;
    const w = Math.sin(b.ph * 10) * 6, d = b.vx < 0 ? -1 : 1;
    ctx.strokeStyle = b.style === 'ice' ? '#ffffff' : b.style === 'night' ? '#0a0c20' : '#3b3340';
    ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x - 10, b.y - w); ctx.quadraticCurveTo(b.x - 4, b.y - w * 0.3 - 2, b.x, b.y); ctx.quadraticCurveTo(b.x + 4, b.y - w * 0.3 - 2, b.x + 10, b.y - w); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ell(b.x + d * 2, b.y + 1, 4, 2);
  }
}
function drawFish() {
  for (const f of fishes) {
    const k = f.t / f.dur, x = f.x + f.dir * 60 * k, y = HAZARD_Y - Math.sin(Math.PI * k) * f.h;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(-Math.cos(Math.PI * k) * f.h * Math.PI, f.dir * 60) + (f.dir < 0 ? Math.PI : 0));
    ctx.fillStyle = f.col; ell(0, 0, 9, 4);
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-14, -5); ctx.lineTo(-14, 5); ctx.fill();
    ctx.fillStyle = '#222'; circ(5, -1, 1.1);
    ctx.restore();
  }
}
function drawFoes() {
  for (const f of foes) {
    if (f.x < camX - 60 || f.x > camX + viewW + 60) continue;
    if (f.type === 'wasp') drawWasp(f);
    else if (f.type === 'fire') drawFire(f);
    else drawBird(f);
  }
}
function drawWasp(f) {
  ctx.save(); ctx.translate(f.x, f.y);
  if (f.fleeT !== undefined) ctx.scale(-1, 1);
  const flap = Math.sin(time * 45) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ell(-2, -11, 6, 11, -0.4 + flap); ell(5, -10, 5, 10, 0.4 - flap);
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#ffcc1a'; ctx.fillRect(-16, -11, 32, 22);
  ctx.fillStyle = '#222'; ctx.fillRect(-4, -11, 4, 22); ctx.fillRect(4, -11, 4, 22);
  ctx.restore();
  ctx.fillStyle = '#222'; circ(-14, 0, 6.5);
  ctx.beginPath(); ctx.moveTo(14, -3); ctx.lineTo(23, 0); ctx.lineTo(14, 3); ctx.fill();
  ctx.fillStyle = '#fff'; circ(-16, -2, 2.2);
  ctx.fillStyle = '#d11'; circ(-16.5, -2, 1.1);
  if (f.fleeT !== undefined) { const s = appleSprite(false); ctx.drawImage(s.c, -6, 6, 14, 16); }
  ctx.restore();
}
function drawFire(f) {
  const blue = f.bi >= 5;
  const c1 = blue ? '#c8f4ff' : '#fff3a0', c2 = blue ? '#4fb8ff' : '#ff8a1a', c3 = blue ? 'rgba(60,90,255,0)' : 'rgba(220,40,10,0)';
  if (f.wait > 0) {
    if (f.wait < 0.7) { // waarschuwing: borrelen
      const a = 1 - f.wait / 0.7;
      const g = ctx.createRadialGradient(f.x, HAZARD_Y, 2, f.x, HAZARD_Y, 40);
      g.addColorStop(0, blue ? `rgba(150,220,255,${a})` : `rgba(255,240,150,${a})`); g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g; ell(f.x, HAZARD_Y, 40, 14);
    }
    return;
  }
  const dir = f.vy < 0 ? 1 : -1;
  for (let i = 4; i >= 1; i--) {
    ctx.fillStyle = i > 2 ? rgbStr(hexToRgb(c2), 0.35) : c2;
    circ(f.x + Math.sin(time * 20 + i) * 2, f.y + dir * i * 8, f.r * (1 - i * 0.16));
  }
  const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r * 1.6);
  g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c3);
  ctx.fillStyle = g; circ(f.x, f.y, f.r * 1.6);
}
function drawBird(f) {
  const style = BIOMES[f.bi].style;
  const body = style === 'ice' ? '#eef4fa' : style === 'night' ? '#3b2a55' : '#1f2230';
  const wingC = style === 'ice' ? '#aebfcf' : style === 'night' ? '#281b3d' : '#2a3a6a';
  const wing = Math.sin(f.t * 14) * 12;
  ctx.save(); ctx.translate(f.x, f.y);
  if (f.fleeT !== undefined) ctx.scale(-1, 1);
  ctx.fillStyle = wingC;
  if (style === 'night') { // vleermuis
    ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-18, -12 - wing); ctx.lineTo(-12, -4 - wing * 0.4); ctx.lineTo(-24, -6 - wing * 0.8); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(18, -12 - wing); ctx.lineTo(12, -4 - wing * 0.4); ctx.lineTo(24, -6 - wing * 0.8); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(4, -20 - wing, 16, -14 - wing); ctx.lineTo(6, 2); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = body; ell(0, 0, 15, 9);
  if (style !== 'ice' && style !== 'night') { ctx.fillStyle = '#ffffff'; ell(2, 3, 8, 4.5); } // ekster: witte buik
  ctx.fillStyle = body; circ(-12, -4, 7.5);
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(-18, -5); ctx.lineTo(-27, -2); ctx.lineTo(-18, 0); ctx.fill();
  ctx.fillStyle = '#fff'; circ(-14, -6, 2.4); ctx.fillStyle = style === 'night' ? '#f33' : '#111'; circ(-14.6, -6, 1.2);
  if (style !== 'night') { ctx.fillStyle = wingC; ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(24, -7); ctx.lineTo(24, 5); ctx.closePath(); ctx.fill(); }
  if (f.fleeT !== undefined) { const s = appleSprite(false); ctx.drawImage(s.c, -30, -4, 14, 16); }
  ctx.restore();
}
function drawWarnings() {
  for (const f of foes) {
    if (f.type !== 'bird' || f.fleeT !== undefined) continue;
    const sx = f.x - camX;
    if (sx > viewW + 10 && sx < viewW + 460) {
      const sy = clamp(f.y - camY, 40, viewH - 40), a = 0.5 + 0.5 * Math.sin(time * 12);
      ctx.fillStyle = `rgba(232,50,43,${0.6 + a * 0.4})`;
      ctx.beginPath(); ctx.moveTo(viewW - 8, sy); ctx.lineTo(viewW - 34, sy - 15); ctx.lineTo(viewW - 34, sy + 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', viewW - 24, sy + 1);
    }
  }
}
// Andy: een cartoongorilla met contourlijnen, kuif, zware wenkbrauwboog, bandana met appelspeldje
let GC = { fur: '#3b3344', furD: '#261f2d', furL: '#6a5b76', skin: '#dcab90', skinD: '#b3836b', ink: '#140f18', band: '#e8322b', bandD: '#a8141c', cape: '#c81e3a', capeD: '#8e1127', gold: '#ffcc33' };
function limb(x1, y1, x2, y2, w) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = GC.ink; ctx.lineWidth = w + 3; line(x1, y1, x2, y2);
  ctx.strokeStyle = GC.fur; ctx.lineWidth = w; line(x1, y1, x2, y2);
  ctx.strokeStyle = GC.furL; ctx.lineWidth = w * 0.3; line(x1 - 1, y1 - 1, (x1 + x2) / 2 - 1, (y1 + y2) / 2 - 1);
}
function hand(x, y, r) {
  ctx.fillStyle = GC.ink; circ(x, y, r + 1.5);
  ctx.fillStyle = GC.skin; circ(x, y, r);
  ctx.strokeStyle = GC.skinD; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x, y + 0.5, r * 0.55, 0.3, Math.PI - 0.3); ctx.stroke();
}
function drawCape(len, spread) {
  // cape hangt aan de schouders en wappert tegen de bewegingsrichting in (lokale coördinaten)
  const ca = Math.cos(-G.angle - (G.trickRot || 0)), sa = Math.sin(-G.angle - (G.trickRot || 0));
  let wx = -G.vx, wy = -G.vy + 300; const wl = Math.hypot(wx, wy) || 1; wx /= wl; wy /= wl;
  const lx = wx * ca - wy * sa, ly = wx * sa + wy * ca; // wereld-richting -> lokaal
  const ex = lx * len, ey = ly * len, nx = -ly * spread, ny = lx * spread, wv = Math.sin(time * 14) * 4;
  ctx.fillStyle = GC.ink;
  ctx.beginPath(); ctx.moveTo(-11, -7); ctx.quadraticCurveTo(ex * 0.5 - nx - 2, ey * 0.5 - ny, ex - nx + wv, ey - ny + wv); ctx.lineTo(ex + nx - wv, ey + ny - wv); ctx.quadraticCurveTo(ex * 0.5 + nx + 2, ey * 0.5 + ny, 11, -7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = GC.cape;
  ctx.beginPath(); ctx.moveTo(-9.5, -6); ctx.quadraticCurveTo(ex * 0.5 - nx, ey * 0.5 - ny, ex * 0.96 - nx * 0.9 + wv, ey * 0.96 - ny * 0.9 + wv); ctx.lineTo(ex * 0.96 + nx * 0.9 - wv, ey * 0.96 + ny * 0.9 - wv); ctx.quadraticCurveTo(ex * 0.5 + nx, ey * 0.5 + ny, 9.5, -6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = GC.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex * 0.96 - nx * 0.9 + wv, ey * 0.96 - ny * 0.9 + wv); ctx.lineTo(ex * 0.96 + nx * 0.9 - wv, ey * 0.96 + ny * 0.9 - wv); ctx.stroke();
  ctx.fillStyle = GC.capeD; ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(ex * 0.7, ey * 0.7); ctx.lineTo(4, -6); ctx.fill();
}
function drawGorilla() {
  if (G.state === 'dead' && G.y > HAZARD_Y + 60) return;
  ctx.save(); ctx.translate(G.x, G.y);
  // zachte gloed zodat Andy goed opvalt tegen de achtergrond
  ctx.globalAlpha = G.turboT > 0 ? 0.7 : 0.35;
  if (!Q.lite) ctx.drawImage(glowSprite(G.turboT > 0 ? '255,220,90' : '255,255,255').c, -52, -52, 104, 104);
  ctx.globalAlpha = 1;
  if (G.balloonT > 0) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; line(0, -28, Math.sin(time * 3) * 4, -82);
    ctx.fillStyle = GC.band; ell(Math.sin(time * 3) * 4, -106, 20, 25);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ell(Math.sin(time * 3) * 4 - 7, -114, 5, 8);
  }
  if (G.state === 'rocket') {
    ctx.fillStyle = '#d9d9e3'; ell(0, 26, 34, 10);
    ctx.fillStyle = GC.band; ctx.beginPath(); ctx.moveTo(30, 18); ctx.lineTo(48, 26); ctx.lineTo(30, 34); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-26, 18); ctx.lineTo(-38, 8); ctx.lineTo(-34, 24); ctx.fill();
    ctx.fillStyle = '#6ec6ff'; circ(12, 26, 4.5);
    ctx.fillStyle = Math.random() < 0.5 ? '#ffb020' : '#fff3a0'; ell(-42, 26, 12 + Math.random() * 8, 6);
  }
  const tr = G.trick, tk = tr ? Math.min(1, G.trickT / tr.dur) : 0;
  ctx.rotate(G.angle + (G.trickRot || 0));
  ctx.scale(G_DRAW, G_DRAW);
  if (tr && tr.id === 'screw') ctx.scale(Math.cos(tk * Math.PI * 4) || 0.05, 1);
  if (G.invuln > 0 && ((time * 16) | 0) % 2) ctx.globalAlpha = 0.5;

  // ---- houding bepalen: handen (h1, h2) en voeten (f1, f2) ----
  let h1, h2, f1 = [-8, 25], f2 = [8, 25], mouth = 'smile';
  const sw = Math.sin(time * 10);
  if (G.state === 'hang') {
    const d = Math.min(Math.hypot(G.hx - G.x, G.hy - G.y) / G_DRAW, 42); // nooit een uitgerekte arm tekenen
    h1 = [-3, -d]; h2 = [3, -d + 3];
    f1 = [-7 + sw * 2, 26]; f2 = [8 - sw * 2, 25]; mouth = Math.abs(G.om * G.R) > 700 ? 'open' : 'smile';
  } else if (G.state === 'stand') {
    const beat = (G.standT % 3.5) > 2.8; // af en toe op de borst trommelen
    if (beat) { const b = Math.sin(G.standT * 30); h1 = [-5, -3 + b * 3]; h2 = [5, -3 - b * 3]; mouth = 'open'; }
    else { h1 = [-15, 12 + Math.sin(G.standT * 2) * 1]; h2 = [15, 12 - Math.sin(G.standT * 2) * 1]; }
    f1 = [-9, 26]; f2 = [9, 26];
  } else if (G.state === 'rocket') { h1 = [14, 6]; h2 = [20, 8]; mouth = 'open'; }
  else if (G.state === 'dead') { const w = Math.sin(time * 20) * 6; h1 = [-24, -12 + w]; h2 = [24, -12 - w]; mouth = 'o'; }
  else if (tr && tr.id === 'star') { const e = Math.sin(tk * Math.PI); h1 = [-12 - 16 * e, -10 - 14 * e]; h2 = [12 + 16 * e, -10 - 14 * e]; f1 = [-8 - 10 * e, 25]; f2 = [8 + 10 * e, 25]; mouth = 'grin'; }
  else if (tr && tr.id === 'super') { h1 = [-3, -36]; h2 = [3, -36]; f1 = [-4, 27]; f2 = [4, 27]; mouth = 'grin'; }
  else if (tr) { h1 = [-9, 4]; h2 = [9, 4]; f1 = [-6, 18]; f2 = [6, 18]; mouth = 'grin'; } // ingedoken voor een salto
  else if (G.diving) { h1 = [-10, 20]; h2 = [-2, 22]; f1 = [-5, 27]; f2 = [5, 27]; mouth = 'o'; }
  else { h1 = [-22, -22 + sw * 4]; h2 = [22, -24 - sw * 4]; f1 = [-10, 24]; f2 = [10, 24]; mouth = G.vy < -200 ? 'open' : 'smile'; }

  // cape (wingsuit)
  const wing = lvl('wingsuit');
  if (wing) drawCape(G.state === 'air' && G.vy > 0 && !G.diving ? 30 + wing * 5 : 24, G.state === 'air' && !G.diving ? 9 + wing : 7);
  // bandana-slierten
  const vw = Math.sin(time * 16) * 3, tl = 12 + Math.min(10, Math.hypot(G.vx, G.vy) / 150);
  ctx.fillStyle = GC.bandD;
  ctx.beginPath(); ctx.moveTo(-11, -25); ctx.lineTo(-11 - tl, -29 + vw); ctx.lineTo(-10 - tl * 0.9, -21 + vw); ctx.closePath(); ctx.fill();
  ctx.fillStyle = GC.band;
  ctx.beginPath(); ctx.moveTo(-11, -24); ctx.lineTo(-11 - tl * 0.8, -19 - vw); ctx.lineTo(-8 - tl * 0.6, -14 - vw); ctx.closePath(); ctx.fill();
  // armen en benen (achter het lijf)
  limb(-11, -5, h1[0], h1[1], 7.5); limb(11, -5, h2[0], h2[1], 7.5);
  limb(-7, 12, f1[0], f1[1] - 3, 7); limb(7, 12, f2[0], f2[1] - 3, 7);
  for (const f of [f1, f2]) { ctx.fillStyle = GC.ink; ell(f[0], f[1], 6.8, 4.2); ctx.fillStyle = GC.skin; ell(f[0], f[1] - 0.3, 5.4, 3); }
  hand(h1[0], h1[1], 4.8); hand(h2[0], h2[1], 4.8);
  // lijf: contour, vacht, borstplaten
  const torso = () => { ctx.beginPath(); ctx.moveTo(-15, -6); ctx.quadraticCurveTo(-18, 8, -11, 16); ctx.quadraticCurveTo(0, 21, 11, 16); ctx.quadraticCurveTo(18, 8, 15, -6); ctx.quadraticCurveTo(0, -13, -15, -6); ctx.closePath(); };
  ctx.fillStyle = GC.ink; ctx.save(); ctx.lineWidth = 3.2; ctx.strokeStyle = GC.ink; torso(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = GC.fur; torso(); ctx.fill();
  ctx.fillStyle = GC.furD; ctx.beginPath(); ctx.moveTo(15, -6); ctx.quadraticCurveTo(18, 8, 11, 16); ctx.quadraticCurveTo(6, 18, 4, 17); ctx.quadraticCurveTo(12, 6, 15, -6); ctx.fill();
  ctx.fillStyle = GC.skinD; ell(-4.6, 0, 5.8, 4.8, -0.2); ell(4.6, 0, 5.8, 4.8, 0.2);
  ctx.fillStyle = GC.skin; ell(-4.8, -0.6, 4.8, 3.8, -0.2); ell(4.8, -0.6, 4.8, 3.8, 0.2);
  ctx.fillStyle = GC.skinD; ell(0, 9, 6, 5.5); ctx.fillStyle = GC.skin; ell(0, 8.4, 5, 4.4);
  ctx.strokeStyle = GC.furL; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; // vachtplukjes op de schouders
  line(-14, -6, -17, -9); line(-12, -8, -14, -12); line(14, -6, 17, -9); line(12, -8, 14, -12);
  // hoofd met kuif en oren (eerst de contour, dan de vulling)
  const headShapes = (grow) => { circ(0, -17, 13 + grow); ell(0, -28, 6.5 + grow, 5 + grow); circ(-13, -16, 4.3 + grow); circ(13, -16, 4.3 + grow); };
  ctx.fillStyle = GC.ink; headShapes(1.6);
  ctx.fillStyle = GC.fur; headShapes(0);
  ctx.fillStyle = GC.skinD; circ(-13, -16, 2.3); circ(13, -16, 2.3);
  ctx.fillStyle = GC.furD; ctx.beginPath(); ctx.arc(0, -17, 13, -0.4, 1.2); ctx.lineTo(0, -17); ctx.fill();
  // gezichtsmasker
  ctx.fillStyle = GC.skin; ell(0, -11.5, 10, 7.8); circ(-4.4, -17, 4.6); circ(4.4, -17, 4.6);
  ctx.fillStyle = GC.skinD; ell(0, -7.5, 7, 3.2);
  // zware wenkbrauwboog
  ctx.fillStyle = GC.ink; ell(0, -21.2, 11.4, 3.6);
  ctx.fillStyle = GC.furD; ell(0, -21.6, 10.6, 2.8);
  // ogen
  const look = clamp(G.vx / 900, -1, 1) * 1.2, lookY = clamp(G.vy / 1200, -1, 1) * 0.8;
  if (G.state === 'dead') {
    ctx.strokeStyle = GC.ink; ctx.lineWidth = 1.7;
    for (const ex of [-4.2, 4.2]) { line(ex - 2, -19, ex + 2, -15); line(ex + 2, -19, ex - 2, -15); }
  } else {
    ctx.fillStyle = GC.ink; ell(-4.2, -17, 3.6, 4); ell(4.2, -17, 3.6, 4);
    ctx.fillStyle = '#ffffff'; ell(-4.2, -17, 2.9, 3.3); ell(4.2, -17, 2.9, 3.3);
    ctx.fillStyle = '#3a2416'; circ(-4.2 + look, -16.6 + lookY, 2); circ(4.2 + look, -16.6 + lookY, 2);
    ctx.fillStyle = '#000'; circ(-4.2 + look, -16.6 + lookY, 1.1); circ(4.2 + look, -16.6 + lookY, 1.1);
    ctx.fillStyle = '#fff'; circ(-3.4 + look, -17.6 + lookY, 0.8); circ(5 + look, -17.6 + lookY, 0.8);
  }
  // neus
  ctx.fillStyle = GC.skinD; ell(0, -11.6, 4.8, 2.9);
  ctx.fillStyle = GC.ink; ell(-1.8, -11.3, 1.3, 1); ell(1.8, -11.3, 1.3, 1);
  // mond
  if (mouth === 'o') { ctx.fillStyle = GC.ink; ell(0, -6.2, 2.4, 2.8); ctx.fillStyle = '#c0394b'; ell(0, -5.6, 1.4, 1.4); }
  else if (mouth === 'open' || mouth === 'grin') {
    ctx.fillStyle = GC.ink; ctx.beginPath(); ctx.moveTo(-5.5, -8); ctx.quadraticCurveTo(0, mouth === 'grin' ? -1.5 : -2, 5.5, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-4, -8, 8, 1.6);
    if (mouth === 'open') { ctx.fillStyle = '#c0394b'; ell(0, -4.8, 2.5, 1.2); }
  } else { ctx.strokeStyle = GC.ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -9.5, 4, 0.3, Math.PI - 0.3); ctx.stroke(); }
  if (GC.kiwi) { // Kiwi heeft een wilde oranje kuif en grote oorbellen-bakkebaarden
    ctx.fillStyle = GC.ink; for (const [x, a] of [[-5, -0.5], [0, 0], [5, 0.5]]) { ctx.save(); ctx.translate(x, -30); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-3.4, 2); ctx.lineTo(0, -9.5); ctx.lineTo(3.4, 2); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = GC.furL; for (const [x, a] of [[-5, -0.5], [0, 0], [5, 0.5]]) { ctx.save(); ctx.translate(x, -30); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-2.2, 1.5); ctx.lineTo(0, -7.5); ctx.lineTo(2.2, 1.5); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = GC.furL; ell(-11.5, -8, 3.2, 5, 0.3); ell(11.5, -8, 3.2, 5, -0.3);
  }
  // bandana met appelspeldje
  ctx.strokeStyle = GC.ink; ctx.lineWidth = 6.4; ctx.beginPath(); ctx.arc(0, -17, 12.6, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  ctx.strokeStyle = GC.band; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.arc(0, -17, 12.6, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; for (const a of [1.25, 1.45, 1.62, 1.78]) circ(Math.cos(Math.PI * a) * 12.6, -17 + Math.sin(Math.PI * a) * 12.6, 0.9);
  ctx.fillStyle = GC.ink; circ(-11.4, -23.5, 3.6); ctx.fillStyle = GC.band; circ(-11.4, -23.5, 2.6);
  if (GC.kiwi) { // Kiwi: een kiwischijfje als speld
    ctx.fillStyle = GC.ink; circ(0, -29.6, 3.9); ctx.fillStyle = '#7a5230'; circ(0, -29.6, 3.1);
    ctx.fillStyle = '#8cc63f'; circ(0, -29.6, 2.5); ctx.fillStyle = '#f4f1c8'; circ(0, -29.6, 0.9);
    ctx.fillStyle = '#1b1b1b'; for (let i = 0; i < 6; i++) circ(Math.cos(i * 1.05) * 1.6, -29.6 + Math.sin(i * 1.05) * 1.6, 0.35);
  } else {
    ctx.fillStyle = GC.ink; circ(0, -29.6, 3.3); ctx.fillStyle = '#e8322b'; circ(-0.9, -29.4, 2); circ(0.9, -29.4, 2);
    ctx.fillStyle = '#4caf50'; ell(1.6, -32, 1.6, 0.8, -0.5);
  }
  ctx.restore();
}
function drawParrot() {
  const B = G.parrot;
  if (!B) return;
  const w = Math.sin(time * 18) * 7, d = B.target ? Math.sign(B.target.x - B.x) || 1 : 1;
  ctx.save(); ctx.translate(B.x, B.y); ctx.scale(d, 1);
  ctx.fillStyle = '#2f7fe0'; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-22, 8); ctx.lineTo(-20, 2); ctx.fill();
  ctx.fillStyle = '#e8322b'; ell(0, 0, 10, 6);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(4, -14 - w); ctx.lineTo(8, -1); ctx.fill();
  ctx.fillStyle = '#2f7fe0'; ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(0, -12 - w * 0.7); ctx.lineTo(4, -1); ctx.fill();
  ctx.fillStyle = '#e8322b'; circ(9, -4, 5);
  ctx.fillStyle = '#ffffff'; circ(10.5, -5, 2); ctx.fillStyle = '#111'; circ(11, -5, 1);
  ctx.fillStyle = '#f5c518'; ctx.beginPath(); ctx.moveTo(13, -4); ctx.lineTo(18, -1); ctx.lineTo(13, 0); ctx.fill();
  ctx.restore();
}
function drawParts() {
  for (const p of parts) {
    const a = clamp(p.life / p.max * 1.5, 0, 1);
    ctx.globalAlpha = a;
    switch (p.type) {
      case 'star': ctx.fillStyle = p.col; starPath(ctx, p.x, p.y, p.r * 1.6, p.rot); ctx.fill(); break;
      case 'ring': {
        const r = p.r + (1 - p.life / p.max) * p.grow;
        ctx.strokeStyle = p.col; ctx.lineWidth = 3 * a; ctx.beginPath();
        if (p.flat) ctx.ellipse(p.x, p.y, r, r * 0.3, 0, 0, Math.PI * 2); else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke(); break;
      }
      case 'confetti': ctx.fillStyle = p.col; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r * Math.abs(Math.cos(p.rot * 1.7))); ctx.restore(); break;
      case 'leaf': ctx.fillStyle = p.col; ell(p.x, p.y, p.r * 1.6, p.r * 0.75, p.rot); break;
      case 'streak': ctx.strokeStyle = p.col; ctx.lineWidth = p.r; line(p.x, p.y, p.x - p.vx * 0.12, p.y - p.vy * 0.12); break;
      default: ctx.fillStyle = p.col; circ(p.x, p.y, p.r);
    }
  }
  ctx.globalAlpha = 1;
}
function waveY(x) { return HAZARD_Y + Math.sin(x * 0.018 + time * 1.8) * 4 + Math.sin(x * 0.043 - time * 2.6) * 2.5; }
function drawHazard(P) {
  const x0 = camX - 20, x1 = camX + viewW + 20, bottom = Math.max(camY + viewH + 20, HAZARD_Y + 60);
  if (camY + viewH < HAZARD_Y - 150) return;
  const lavaW = styleWeight(P, 'volcano');
  if (lavaW > 0) {
    ctx.fillStyle = cachedGrad('lava' + Math.round(lavaW * 20), () => {
      const g = ctx.createLinearGradient(0, HAZARD_Y - 160, 0, HAZARD_Y);
      g.addColorStop(0, 'rgba(255,120,20,0)'); g.addColorStop(1, `rgba(255,120,20,${0.45 * lavaW})`);
      return g;
    });
    ctx.fillRect(x0, HAZARD_Y - 160, x1 - x0, 160);
  }
  ctx.fillStyle = cachedGrad('haz' + paletteKey(P), () => {
    const grd = ctx.createLinearGradient(0, HAZARD_Y, 0, HAZARD_Y + 130);
    grd.addColorStop(0, P.hazTop); grd.addColorStop(0.35, rgbStr(mixC(P.hazTopC, P.hazBotC, 0.5))); grd.addColorStop(1, P.hazBot);
    return grd;
  });
  ctx.beginPath(); ctx.moveTo(x0, bottom);
  const sx = Math.floor(x0 / 14) * 14;
  for (let x = sx; x <= x1 + 14; x += 14) ctx.lineTo(x, waveY(x));
  ctx.lineTo(x1 + 14, bottom); ctx.closePath(); ctx.fill();
  // weerspiegeling van de lucht en lichtstrepen
  ctx.fillStyle = lavaW > 0.5 ? 'rgba(255,230,120,.5)' : 'rgba(255,255,255,.28)';
  for (let i = Math.floor(x0 / 70); i < x1 / 70; i++) {
    const x = i * 70 + hash(i) * 50 + Math.sin(time * 0.8 + i) * 8, y = HAZARD_Y + 14 + hash(i * 2.2) * 50;
    ell(x, y, 8 + hash(i * 3) * 16, 1.6);
  }
  ctx.strokeStyle = lavaW > 0.5 ? 'rgba(255,240,160,.75)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = sx; x <= x1 + 14; x += 14) { const y = waveY(x) + 1.5; x === sx ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  // voorwerpen op het oppervlak, per biome
  const st = P.t < 0.5 ? P.a.style : P.b.style;
  for (let i = Math.floor(x0 / 160); i < x1 / 160 + 1; i++) {
    const h = hash(i * 9.7), x = i * 160 + hash(i * 4.4) * 110, y = waveY(x);
    if (st === 'jungle' || st === 'swamp' || st === 'night') {
      if (h < (st === 'swamp' ? 0.35 : 0.14)) { // waterlelie
        ctx.fillStyle = st === 'night' ? '#1f5a4a' : '#3f8f3a'; ctx.beginPath(); ctx.ellipse(x, y + 3, 17, 5, 0, 0.3, Math.PI * 2 - 0.1); ctx.lineTo(x, y + 3); ctx.fill();
        if (h < 0.12) { ctx.fillStyle = st === 'night' ? '#b0f0ff' : '#ff9ec7'; for (let k = 0; k < 5; k++) ell(x - 3 + Math.cos(k * 1.26) * 3, y - 1 + Math.sin(k * 1.26) * 1.5, 3, 2, k * 1.26); ctx.fillStyle = '#ffd23f'; circ(x - 3, y - 1, 1.5); }
      } else if (h < 0.5) { // riet
        ctx.strokeStyle = st === 'night' ? '#1a3a38' : '#4e7a2e'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        for (let k = 0; k < 5; k++) { const bx = x + k * 5, sw = Math.sin(time * 1.5 + i + k) * 3; line(bx, y + 6, bx + sw, y - 26 - hash(i + k) * 18); }
        ctx.fillStyle = '#6b4423'; ell(x + 10 + Math.sin(time * 1.5 + i) * 3, y - 34, 2.5, 7);
      } else if (st === 'jungle' && h < 0.6) { ctx.fillStyle = '#7d8a8f'; ell(x, y + 4, 22, 10); ctx.fillStyle = '#a3b0b5'; ell(x - 5, y, 12, 5); }
    } else if (st === 'ice') {
      if (h < 0.4) { ctx.fillStyle = '#eef8ff'; ctx.beginPath(); ctx.moveTo(x - 30, y + 4); ctx.lineTo(x - 22, y - 6); ctx.lineTo(x + 18, y - 8); ctx.lineTo(x + 30, y + 4); ctx.fill(); ctx.fillStyle = '#b6dcf2'; ctx.fillRect(x - 30, y + 3, 60, 4); }
    } else if (st === 'volcano') {
      if (h < 0.45) { ctx.fillStyle = '#3a1a10'; ctx.beginPath(); ctx.moveTo(x - 28, y + 5); ctx.lineTo(x - 18, y - 3); ctx.lineTo(x + 20, y - 2); ctx.lineTo(x + 30, y + 6); ctx.fill(); ctx.strokeStyle = '#ffcc4a'; ctx.lineWidth = 1.5; line(x - 10, y - 1, x + 5, y + 4); }
      if (h > 0.8 && Math.random() < 0.02) addPart({ x, y, vx: rand(-30, 30), vy: -rand(80, 200), life: 0.6, max: 0.6, col: '#ffb020', r: rand(2, 4) });
    } else if (st === 'savanne') {
      if (h < 0.35) { ctx.strokeStyle = 'rgba(120,80,30,.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 16, 20, 5, 0, time * 0.5, time * 0.5 + 4.5); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, y + 16, 10, 2.5, 0, -time * 0.7, -time * 0.7 + 4); ctx.stroke(); }
    }
  }
}
function drawForeground(P) {
  const f = 1.25, off = camX * f, base = layerY(HAZARD_Y + 60, f);
  if (base > viewH + 90) return;
  const col = rgbStr(mixC(P.canopyC, [0, 0, 0], 0.55), 0.92);
  ctx.fillStyle = col;
  for (let i = Math.floor((off - 200) / 300); i <= Math.floor((off + viewW + 200) / 300); i++) {
    if (hash(i * 6.6) < 0.5) continue;
    const x = i * 300 + hash(i * 1.4) * 150 - off, s = 0.7 + hash(i * 2.8) * 0.5;
    if (hash(i * 3.9) < 0.5) { circ(x, base, 34 * s); circ(x + 30 * s, base + 6, 28 * s); circ(x - 30 * s, base + 8, 24 * s); }
    else for (let k = -3; k <= 3; k++) { const a = -Math.PI / 2 + k * 0.28 + Math.sin(time * 1.2 + i) * 0.04; ell(x + Math.cos(a) * 36 * s, base + Math.sin(a) * 36 * s, 38 * s, 7 * s, a); }
  }
}
function drawTexts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const t of texts) {
    const pop = t.t < 0.12 ? 0.6 + t.t / 0.12 * 0.55 : t.t < 0.22 ? 1.15 - (t.t - 0.12) / 0.1 * 0.15 : 1;
    ctx.font = `900 ${Math.round(t.size * pop)}px Trebuchet MS, sans-serif`;
    ctx.globalAlpha = clamp((t.max - t.t) / 0.4, 0, 1);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(t.txt, t.x, t.y); ctx.fillStyle = t.col; ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
function drawAmbient(P) {
  const type = P.t < 0.5 ? P.a.particle : P.b.particle;
  for (let i = 0; i < Q.amb; i++) {
    const p = amb[i];
    switch (type) {
      case 'leaf': ctx.fillStyle = p.s > 1.2 ? 'rgba(120,190,70,.85)' : 'rgba(90,170,70,.8)'; ell(p.x, p.y, 5 * p.s, 2.4 * p.s, time * 2 + p.ph); break;
      case 'firefly': {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + p.ph));
        ctx.fillStyle = `rgba(230,255,120,${a * 0.25})`; circ(p.x, p.y, 7 * p.s);
        ctx.fillStyle = `rgba(250,255,170,${a})`; circ(p.x, p.y, 2 * p.s); break;
      }
      case 'dust': ctx.fillStyle = 'rgba(255,230,180,.45)'; circ(p.x, p.y, 1.8 * p.s); break;
      case 'snow': ctx.fillStyle = 'rgba(255,255,255,.9)'; circ(p.x, p.y, 2.4 * p.s); break;
      case 'ember': ctx.fillStyle = `rgba(255,${120 + (p.s * 80 | 0)},40,${0.5 + 0.5 * Math.sin(time * 5 + p.ph)})`; circ(p.x, p.y, 1.8 * p.s); break;
      case 'star': {
        const a = 0.3 + 0.7 * Math.abs(Math.sin(time * 1.7 + p.ph));
        ctx.fillStyle = `rgba(170,210,255,${a * 0.2})`; circ(p.x, p.y, 6 * p.s);
        ctx.fillStyle = `rgba(210,235,255,${a})`; circ(p.x, p.y, 1.6 * p.s); break;
      }
    }
  }
}
function drawFlash() {
  if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT})`; ctx.fillRect(0, 0, viewW, viewH); }
}


// ---- Vloeiend beeld: interpolatie tussen de laatste twee physics-stappen ----
// De physics loopt op vaste stappen van 1/120 s. Op schermen die niet precies 60/120 Hz verversen
// (75, 90, 144 Hz, of bij wisselende framerates) valt er soms een stap meer of minder in een beeld;
// zonder interpolatie schokt/flikkert Andy dan t.o.v. de soepel bewegende camera.
let stepNo = 0, renderAlpha = 1;
const ipVines = [];
let ipTime = null, ipG = null;
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
// zet een gorilla tijdelijk op zijn geïnterpoleerde plek (false = niet nodig of niet mogelijk)
function ipApply(g) {
  if (!g || g.is == null || renderAlpha >= 1) return false;
  if (Math.abs(g.x - g.ix) + Math.abs(g.y - g.iy) > 250) return false; // sprong door een portaal of een respawn
  const a = renderAlpha, b = 1 - a;
  g.sx = g.x; g.sy = g.y; g.shx = g.hx; g.shy = g.hy; g.sa = g.angle; g.str = g.trickRot;
  g.x = g.ix * b + g.x * a; g.y = g.iy * b + g.y * a;
  // de hand alleen interpoleren als hij al aan dezelfde liaan hing: bij het grijpen is de oude handpositie
  // verouderd (van een vorige liaan), en dan zou de arm één beeld lang over het hele scherm getekend worden
  if (g.state === 'hang' && g.ihang === g.vine) { g.hx = g.ihx * b + g.hx * a; g.hy = g.ihy * b + g.hy * a; }
  g.angle = g.sa - wrapA(g.sa - g.ia) * b;
  if (g.trickRot) g.trickRot = g.str - wrapA(g.str - g.itr) * b;
  return true;
}
function ipRestore(g) { g.x = g.sx; g.y = g.sy; g.hx = g.shx; g.hy = g.shy; g.angle = g.sa; g.trickRot = g.str; }
function interpBegin(onlyG) {
  if (!G || G.is == null || renderAlpha >= 1) return;
  const a = renderAlpha, b = 1 - a;
  if (ipApply(G)) ipG = G;
  if (onlyG) return;
  ipTime = time; time -= b * DT;
  for (const v of vines) {
    if (v.is !== G.is) continue;
    ipVines.push(v);
    for (const q of v.pts) { q.sx = q.x; q.sy = q.y; q.x = q.ix * b + q.x * a; q.y = q.iy * b + q.y * a; }
  }
}
function interpEnd() {
  if (ipG) { ipRestore(ipG); ipG = null; }
  if (ipTime !== null) { time = ipTime; ipTime = null; }
  for (const v of ipVines) for (const q of v.pts) { q.x = q.sx; q.y = q.sy; }
  ipVines.length = 0;
}
function render() {
  interpBegin(false);
  try { renderScene(); } finally { interpEnd(); }
}
function renderScene() {
  const P = paletteAt((camX + viewW * 0.5 - START_X) / PX_PER_M);
  const S = scale * pr;
  const clip = LOCAL.on;
  if (clip) { mainCtx.save(); mainCtx.setTransform(1, 0, 0, 1, 0, 0); mainCtx.beginPath(); mainCtx.rect(VOX, VOY, RW, RH); mainCtx.clip(); }
  // 1) verre achtergrond in een aparte buffer op lage resolutie (mag toch wat vaag zijn);
  //    op de lage kwaliteitsniveaus wordt die maar om het andere beeld ververst
  const S0 = baseScale * pr; // vaste basiszoom voor de achtergrond
  if (++bgFrame % Q.bgEvery === 0 || bgStale || clip) {
    bgStale = false;
    ctx = bgCtx;
    const SB = S0 * Q.bg;
    ctx.setTransform(SB, 0, 0, SB, 0, 0);
    withBaseView(() => {
      drawSky(P);
      drawMountains(P);
      drawAltClouds(P);
      drawFlocks(P);
      drawForestLine(P);
      drawMidTrees(P);
      const sw = spaceWeight();
      if (sw > 0) drawSpace(sw);
    });
    ctx = mainCtx;
  }
  ctx.setTransform(1, 0, 0, 1, VOX, VOY);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bgCanvas, 0, 0, RW, RH);
  // 2) nabije achtergrond op volle resolutie
  ctx.setTransform(S0, 0, 0, S0, VOX, VOY);
  const spW = spaceWeight();
  if (spW < 1) {
    ctx.globalAlpha = 1 - spW;
    withBaseView(() => { drawFlyers(); drawGiantTrunks(P); drawLightRays(P); });
    ctx.globalAlpha = 1;
  }
  // 3) de speelwereld
  const sx = shakeT > 0 ? (Math.random() - 0.5) * shakeAmp * 2 : 0, sy = shakeT > 0 ? (Math.random() - 0.5) * shakeAmp * 2 : 0;
  ctx.setTransform(S, 0, 0, S, -(camX + sx) * S + VOX, -(camY + sy) * S + VOY);
  drawRock();
  drawSkyBirds();
  drawMarkers();
  drawFinish();
  drawShrooms();
  drawTramps();
  drawPortals(false);
  const vx0 = camX - 300, vx1 = camX + viewW + 420, vy0 = camY - 60, vy1 = camY + viewH + 60;
  for (const v of vines) if (v.x > vx0 && v.rest[2] - 200 < vx1 && v.ay < vy1 && v.rest[3] + 150 > vy0) drawVine(v);
  for (const v of vines) if (v.x > camX - 80 && v.x < camX + viewW + 80 && v.ay > camY - 220 && v.ay < camY + viewH + 60) drawBranch(v);
  drawPortals(true);
  for (const a of apples) if (a.x > camX - 30 && a.x < camX + viewW + 30 && a.y > camY - 30 && a.y < camY + viewH + 30) drawApple(a);
  drawFoes();
  drawFish();
  if (game.mp) drawGhost();
  if (G) { drawOwnGorilla(); drawParrot(); }
  drawParts();
  if (game.mp) drawStorm();
  drawHazard(P);
  drawTexts();
  ctx.setTransform(S0, 0, 0, S0, VOX, VOY);
  withBaseView(() => { drawForeground(P); if (spW < 0.6) drawAmbient(P); });
  ctx.setTransform(S, 0, 0, S, VOX, VOY);
  drawWarnings();
  if (game.mp) drawMpOverlay();
  drawFlash();
  if (clip) { if (game.mp) drawLocalHud(); mainCtx.restore(); }
}
