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
    ctx.fillStyle = cachedGrad('shroom' + col, () => { const cg = ctx.createRadialGradient(-14, -76, 4, 0, -56, 52); cg.addColorStop(0, shade(col, 0.35)); cg.addColorStop(1, col); return cg; });
    ctx.beginPath(); ctx.ellipse(0, -56, 50, 28, 0, Math.PI, 0); ctx.fill();
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
  ctx.save(); ctx.globalAlpha = w;
  const px0 = -camX * 0.012, py0 = -camY * 0.01;
  // nevels
  if (!Q.lite) for (const [x, y, r, c] of [[0.3, 0.35, 380, '150,70,220'], [0.75, 0.25, 320, '40,150,220'], [0.55, 0.7, 420, '220,60,140']]) {
    const cx = ((x * viewW + px0 * (r / 300)) % (viewW + 800) + viewW + 800) % (viewW + 800) - 400, cy = y * viewH + py0;
    ctx.fillStyle = cachedGrad('neb' + c + r, () => { const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r); g.addColorStop(0, `rgba(${c},.28)`); g.addColorStop(1, `rgba(${c},0)`); return g; });
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1.6, 0.8); circ(0, 0, r); ctx.restore();
  }
  // sterren
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 220; i++) {
    const x = ((hash(i * 3.17) * viewW * 1.3 + px0 * (0.5 + hash(i) * 2)) % viewW + viewW) % viewW, y = ((hash(i * 7.3) * viewH * 1.5 - camY * 0.05) % viewH + viewH) % viewH;
    ctx.globalAlpha = w * (0.3 + 0.7 * Math.abs(Math.sin(time * 1.1 + i)));
    const sz = hash(i) < 0.12 ? 2.4 : 1.3; ctx.fillRect(x, y, sz, sz);
  }
  ctx.globalAlpha = w;
  // een spiraalstelsel in de verte
  const gx = ((viewW * 0.62 + px0 * 0.4) % (viewW + 400) + viewW + 400) % (viewW + 400) - 200, gy = viewH * 0.16;
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(time * 0.02); ctx.scale(1, 0.45);
  for (let k = 0; k < 90; k++) { const a = k * 0.21, r = 3 + k * 0.75; ctx.fillStyle = k % 3 ? 'rgba(220,200,255,.7)' : 'rgba(255,220,180,.8)'; ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2); ctx.fillRect(-Math.cos(a) * r, -Math.sin(a) * r, 2, 2); }
  ctx.fillStyle = 'rgba(255,240,220,.9)'; circ(0, 0, 5); ctx.restore();
  // geringde planeet
  const px = viewW * 0.22 + px0 * 1.5, py = viewH * 0.3 + py0 * 1.5;
  ctx.strokeStyle = 'rgba(230,200,150,.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(px, py, 120, 26, -0.3, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
  const pg = ctx.createRadialGradient(px - 25, py - 25, 10, px, py, 70); pg.addColorStop(0, '#ffd9a0'); pg.addColorStop(1, '#b8603a');
  ctx.fillStyle = pg; circ(px, py, 70);
  ctx.fillStyle = 'rgba(120,50,30,.35)'; ell(px, py - 15, 66, 7, -0.3); ell(px + 5, py + 18, 62, 6, -0.3);
  ctx.beginPath(); ctx.ellipse(px, py, 120, 26, -0.3, -Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
  // blauwe gasreus en een rode maan
  const bx = viewW * 0.86 + px0 * 2.2, by = viewH * 0.55 + py0 * 2.2;
  const bg = ctx.createRadialGradient(bx - 40, by - 40, 10, bx, by, 110); bg.addColorStop(0, '#9fe3ff'); bg.addColorStop(1, '#1f4fa0');
  ctx.fillStyle = bg; circ(bx, by, 110);
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ell(bx, by - 30, 104, 10); ell(bx, by + 20, 100, 8); ell(bx + 10, by + 55, 80, 6);
  const mx = bx - 170 + Math.cos(time * 0.2) * 10, my = by - 120;
  ctx.fillStyle = '#c0583a'; circ(mx, my, 22); ctx.fillStyle = 'rgba(80,20,10,.4)'; circ(mx - 6, my - 4, 5); circ(mx + 8, my + 6, 4);
  // een ruimtestation
  const sx2 = ((viewW * 0.45 + px0 * 3) % (viewW + 600) + viewW + 600) % (viewW + 600) - 300, sy2 = viewH * 0.12 + py0 * 3;
  ctx.save(); ctx.translate(sx2, sy2); ctx.rotate(time * 0.05);
  ctx.strokeStyle = '#c9d0de'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; line(-34, 0, 34, 0); line(0, -34, 0, 34);
  ctx.fillStyle = '#e6e9f0'; circ(0, 0, 8); ctx.fillStyle = '#2f5fb8'; ctx.fillRect(-60, -6, 20, 12); ctx.fillRect(40, -6, 20, 12);
  ctx.restore();
  // komeet
  const ct = (time * 0.12) % 1, cx2 = viewW * (1.1 - ct * 1.4), cy2 = viewH * (0.05 + ct * 0.35);
  const cg = ctx.createLinearGradient(cx2, cy2, cx2 + 160, cy2 - 50); cg.addColorStop(0, 'rgba(200,240,255,.9)'); cg.addColorStop(1, 'rgba(200,240,255,0)');
  ctx.strokeStyle = cg; ctx.lineWidth = 4; line(cx2, cy2, cx2 + 160, cy2 - 50); ctx.fillStyle = '#ffffff'; circ(cx2, cy2, 3.5);
  // de gloed van de aarde onder je
  const hy = viewH + 2300 - clamp((-(camY + viewH / 2) - 1900) / 1300, 0, 1) * 150;
  const eg = ctx.createRadialGradient(viewW / 2, hy, 2300, viewW / 2, hy, 2520);
  eg.addColorStop(0, 'rgba(80,170,255,.9)'); eg.addColorStop(0.3, 'rgba(80,170,255,.35)'); eg.addColorStop(1, 'rgba(80,170,255,0)');
  ctx.fillStyle = eg; ctx.fillRect(0, viewH * 0.4, viewW, viewH * 0.6);
  ctx.restore();
}
// Straaljager: grijs toestel met cockpit, vleugels en een vlammende uitlaat; de liaan hangt aan de staart
function drawJet(v) {
  const a = v.pts[0], x = a.x, y = a.y;
  ctx.save(); ctx.translate(x, y - 14);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-260, -3, 200, 6); // condensstreep
  ctx.fillStyle = Math.random() < 0.5 ? '#ffb020' : '#ff6a1f'; ell(-58, 0, 22 + Math.random() * 12, 7); ctx.fillStyle = '#fff3a0'; ell(-50, 0, 10, 4);
  ctx.fillStyle = '#5d6b7a'; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-38, -34); ctx.lineTo(-24, -34); ctx.lineTo(12, 0); ctx.fill(); // staartvin
  ctx.fillStyle = '#8a98a8'; ctx.beginPath(); ctx.moveTo(-44, -9); ctx.lineTo(70, -8); ctx.quadraticCurveTo(100, 0, 70, 8); ctx.lineTo(-44, 9); ctx.closePath(); ctx.fill(); // romp
  ctx.fillStyle = '#6b7888'; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(-30, 30); ctx.lineTo(-14, 30); ctx.lineTo(30, 2); ctx.fill(); // vleugel
  ctx.fillStyle = '#9fe3ff'; ell(48, -8, 16, 6); ctx.fillStyle = 'rgba(255,255,255,.7)'; ell(52, -10, 6, 2);
  ctx.fillStyle = '#e8322b'; ctx.fillRect(-4, -3, 22, 5); // streep
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
  if (b.path) { // gouden ballonpad: nummertje, en bij de eerste een bordje "naar de ruimte"
    ctx.font = '900 30px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(b.step + 1, x, cy); ctx.fillStyle = b.visited ? '#7dff8a' : '#ffffff'; ctx.fillText(b.step + 1, x, cy);
    if (b.step === 0 && !b.visited) {
      const by = cy - ry - 34 + Math.sin(time * 3) * 4;
      ctx.fillStyle = 'rgba(20,16,60,.8)'; ctx.fillRect(x - 92, by - 18, 184, 36);
      ctx.font = '900 18px Trebuchet MS, sans-serif'; ctx.fillStyle = '#ffe46b'; ctx.fillText('🚀 Naar de ruimte!', x, by + 1);
    }
  }
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
  const st = v.type === 'balloon' || v.type === 'space' ? '' : BIOMES[v.bi].style;
  if (st === 'blocky' || st === 'paint' || st === 'poly3d' || st === 'candy') { drawStyledVine(v, st, path, shakeX); return; }
  if (v.type === 'turbo') { ctx.strokeStyle = `rgba(255,215,70,${0.25 + 0.15 * Math.sin(time * 6)})`; ctx.lineWidth = 16; path(); ctx.stroke(); }
  if (v.type === 'space') { ctx.strokeStyle = `rgba(190,160,255,${0.25 + 0.12 * Math.sin(time * 4 + v.phase)})`; ctx.lineWidth = 15; path(); ctx.stroke(); }
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
      const lx = q.x + Math.cos(ang) * 7, ly = q.y + Math.sin(ang) * 7, detail = qLevel >= 2; // lage standen: zonder schaduw en nerf
      if (detail) { ctx.fillStyle = v.leafD || (v.leafD = shade(v.leaf, -0.25)); ell(lx + 0.8, ly + 0.8, 7.5, 3.4, ang); }
      ctx.fillStyle = v.leaf; ell(lx, ly, 7.5, 3.4, ang);
      if (detail) { ctx.strokeStyle = v.leafDD || (v.leafDD = shade(v.leaf, -0.3)); ctx.lineWidth = 0.8; line(lx - Math.cos(ang) * 6, ly - Math.sin(ang) * 6, lx + Math.cos(ang) * 6, ly + Math.sin(ang) * 6); }
    }
  }
  if (v.type === 'rotten') { ctx.fillStyle = '#4a321a'; for (let i = 3; i < n; i += 4) circ(p[i].x + shakeX, p[i].y, 2.5); }
  if (v.type === 'turbo') { // glinsters die langs de liaan omlaag lopen
    ctx.fillStyle = '#fff6c0';
    for (let j = 0; j < 3; j++) { const q = p[Math.floor((time * 10 + j * n / 3) % n)]; starPath(ctx, q.x, q.y, 4.5, time * 4); ctx.fill(); }
  }
  if (v.type === 'space') { // sterretjes langs de sterrenliaan
    ctx.fillStyle = '#ffffff';
    for (let j = 0; j < 3; j++) { const q = p[Math.floor((time * 6 + j * n / 3 + v.phase) % n)]; starPath(ctx, q.x, q.y, 4, time * 3); ctx.fill(); }
  }
  ctx.fillStyle = v.dark; circ(p[n - 1].x, p[n - 1].y, 3.5);
}
// Lianen in de stijl-biomes: blokjes, Paint-streep, een 3D-buis of een zuurstok
function drawStyledVine(v, st, path, shakeX) {
  const p = v.pts, n = p.length;
  if (st === 'blocky') {
    for (let i = 0; i < n; i++) {
      const q = p[i], b = i % 3 === 2 ? 11 : 9, x = Math.round((q.x + shakeX) / 3) * 3, y = Math.round(q.y / 3) * 3;
      ctx.fillStyle = v.dark; ctx.fillRect(x - b / 2 - 1.5, y - b / 2 - 1.5, b + 3, b + 3);
      ctx.fillStyle = (i % 2) ? v.col : v.light; ctx.fillRect(x - b / 2, y - b / 2, b, b);
      if (i % 3 === 2) { ctx.fillStyle = v.leaf; ctx.fillRect(x + (i % 2 ? 5 : -13), y - 3, 8, 8); }
    }
  } else if (st === 'paint') {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 9; path(); ctx.stroke();
    ctx.strokeStyle = v.col; ctx.lineWidth = 5; path(); ctx.stroke();
    for (let i = 3; i < n; i += 3) {
      const q = p[i], side = i % 2 ? 1 : -1;
      ctx.fillStyle = v.leaf; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(q.x + side * 9, q.y, 7, 4, side * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (st === 'poly3d') {
    ctx.strokeStyle = v.dark; ctx.lineWidth = 10; path(); ctx.stroke();
    ctx.strokeStyle = v.col; ctx.lineWidth = 7; path(); ctx.stroke();
    ctx.save(); ctx.translate(-2, -1.5); ctx.strokeStyle = v.light; ctx.lineWidth = 2.6; path(); ctx.stroke();
    ctx.translate(-0.5, -0.5); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.9; path(); ctx.stroke(); ctx.restore();
    for (let i = 3; i < n; i += 3) { // gefacetteerde blaadjes: twee driehoekjes in licht en schaduw
      const q = p[i], side = i % 2 ? 1 : -1, x = q.x + side * 11, y = q.y;
      ctx.fillStyle = v.leaf; ctx.beginPath(); ctx.moveTo(q.x, y); ctx.lineTo(x, y - 7); ctx.lineTo(x + side * 8, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(v.leaf, -0.35); ctx.beginPath(); ctx.moveTo(q.x, y); ctx.lineTo(x + side * 8, y); ctx.lineTo(x, y + 6); ctx.closePath(); ctx.fill();
    }
  } else { // snoep: zuurstok met gummies
    ctx.strokeStyle = shade(v.col, -0.3); ctx.lineWidth = 9; path(); ctx.stroke();
    ctx.strokeStyle = '#fff6fa'; ctx.lineWidth = 7; path(); ctx.stroke();
    ctx.setLineDash([9, 9]); ctx.lineDashOffset = -v.phase * 10; ctx.strokeStyle = v.col; ctx.lineWidth = 7; ctx.lineCap = 'butt'; path(); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round';
    for (let i = 4; i < n; i += 4) { const q = p[i]; ctx.fillStyle = SPRINKLE_COLS[i % SPRINKLE_COLS.length]; ell(q.x + (i % 8 ? 9 : -9), q.y + 2, 5, 6); ctx.fillStyle = 'rgba(255,255,255,.55)'; circ(q.x + (i % 8 ? 7.5 : -10.5), q.y, 1.8); }
  }
  if (v.type === 'turbo') { ctx.fillStyle = '#fff6c0'; for (let j = 0; j < 3; j++) { const q = p[Math.floor((time * 10 + j * n / 3) % n)]; starPath(ctx, q.x, q.y, 5, time * 4); ctx.fill(); } }
  if (v.type === 'elastic') { ctx.setLineDash([5, 7]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.5; path(); ctx.stroke(); ctx.setLineDash([]); }
  if (v.type === 'rotten') { ctx.fillStyle = '#4a321a'; for (let i = 3; i < n; i += 4) circ(p[i].x + shakeX, p[i].y, 2.5); }
  if (v.type === 'icy') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; path(); ctx.stroke(); }
}
function drawStyledBranch(v, style, c) {
  const L = v.bl;
  ctx.save(); ctx.translate(v.x, v.ay);
  if (style === 'blocky') { // drie houtblokken met gras erop
    const b = 16;
    for (let i = -2; i <= 1; i++) {
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(i * b, -b / 2, b, b);
      ctx.fillStyle = '#8a6238'; ctx.fillRect(i * b + 3, -b / 2 + 3, 5, 5); ctx.fillRect(i * b + 9, -b / 2 + 9, 4, 4);
      ctx.fillStyle = c.canopy2; ctx.fillRect(i * b, -b / 2 - 5, b, 6);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(-2 * b, -b / 2 - 5, 4 * b, b + 5);
  } else if (style === 'paint') { // een bruine balk met een dikke zwarte rand
    ctx.rotate(v.tilt);
    ctx.fillStyle = '#8b5a2b'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-L, -7); ctx.lineTo(L * 0.7, -6); ctx.lineTo(L * 0.72, 7); ctx.lineTo(-L - 2, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.canopy2; ctx.beginPath(); ctx.ellipse(-L * 0.5, -14, 12, 7, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  } else if (style === 'poly3d') { // 3D-balk: voorkant, bovenkant en zijkant
    const w = L * 1.7, h = 13, d = 9, x = -L;
    ctx.fillStyle = '#5a4fcf'; ctx.fillRect(x, -h / 2, w, h);
    ctx.fillStyle = '#8f86f0'; ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x + d, -h / 2 - d * 0.7); ctx.lineTo(x + w + d, -h / 2 - d * 0.7); ctx.lineTo(x + w, -h / 2); ctx.fill();
    ctx.fillStyle = '#34298f'; ctx.beginPath(); ctx.moveTo(x + w, -h / 2); ctx.lineTo(x + w + d, -h / 2 - d * 0.7); ctx.lineTo(x + w + d, h / 2 - d * 0.7); ctx.lineTo(x + w, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,140,230,.9)'; ctx.lineWidth = 1.2; ctx.strokeRect(x, -h / 2, w, h);
  } else { // snoep: een chocoladereep met een lolly
    ctx.rotate(v.tilt);
    ctx.fillStyle = '#5a2e16'; ctx.fillRect(-L, -8, L * 1.75, 15);
    ctx.fillStyle = '#7a4424'; for (let x = -L + 2; x < L * 0.7; x += 13) ctx.fillRect(x, -6, 10, 5);
    ctx.fillStyle = '#ffe6f3'; ctx.fillRect(-L, -10, L * 1.75, 4); for (let x = -L + 4; x < L * 0.7; x += 11) circ(x, -6, 2.5);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; line(-L * 0.5, -8, -L * 0.6, -26);
    ctx.fillStyle = '#ff7eb9'; circ(-L * 0.6, -31, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-L * 0.6, -31, 4, 0, 4.5); ctx.stroke();
  }
  ctx.restore();
}
// Een planetoïde (ruimte): grijze bobbelige rots met kraters
function drawAsteroid(x, y, r, rot, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = shade(col, -0.35); ctx.beginPath();
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2, rr = r * (0.82 + hash(i * 3.1 + r) * 0.26); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2, rr = r * (0.78 + hash(i * 3.1 + r) * 0.24); ctx.lineTo(Math.cos(a) * rr - 2, Math.sin(a) * rr - 2); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, -0.25); circ(-r * 0.3, -r * 0.1, r * 0.2); circ(r * 0.3, r * 0.3, r * 0.14); circ(r * 0.15, -r * 0.45, r * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; circ(-r * 0.35, -r * 0.4, r * 0.18);
  ctx.restore();
}
// Dingen in de ruimte: planetoïden (stuiteren), de ufo en satellieten
function drawSpaceObjs() {
  for (const o of spaceObjs) {
    if (o.x < camX - 200 || o.x > camX + viewW + 200 || o.y < camY - 200 || o.y > camY + viewH + 200) continue;
    if (o.type === 'rock') {
      if (!Q.lite) { ctx.globalAlpha = 0.35; ctx.drawImage(glowSprite('200,180,255').c, o.x - o.r * 1.6, o.y - o.r * 1.6, o.r * 3.2, o.r * 3.2); ctx.globalAlpha = 1; }
      drawAsteroid(o.x, o.y, o.r, o.ph, '#8f86a8');
    } else if (o.type === 'ufo') {
      const x = o.x, y = o.y;
      if (!o.done) { ctx.fillStyle = `rgba(170,255,140,${0.12 + 0.06 * Math.sin(time * 8)})`; ctx.beginPath(); ctx.moveTo(x - 20, y + 8); ctx.lineTo(x + 20, y + 8); ctx.lineTo(x + 60, y + 170); ctx.lineTo(x - 60, y + 170); ctx.fill(); }
      ctx.fillStyle = 'rgba(170,230,255,.75)'; ell(x, y - 12, 22, 18);
      ctx.fillStyle = '#7ddc5a'; circ(x, y - 12, 8); ctx.fillStyle = '#111'; circ(x - 3, y - 14, 1.8); circ(x + 3, y - 14, 1.8);
      ctx.fillStyle = '#9aa3b5'; ell(x, y, 50, 13); ctx.fillStyle = '#c9d0de'; ell(x, y - 3, 44, 7);
      for (let k = 0; k < 6; k++) { ctx.fillStyle = ((time * 6 | 0) + k) % 3 ? '#ffe14f' : '#ff5a7a'; circ(x - 38 + k * 15.2, y + 4, 3); }
    } else { // satelliet
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.sin(o.ph * 0.3) * 0.4);
      ctx.fillStyle = '#2f5fb8'; ctx.fillRect(-58, -9, 38, 18); ctx.fillRect(20, -9, 38, 18);
      ctx.strokeStyle = '#9fc3ff'; ctx.lineWidth = 1; for (let k = 0; k < 3; k++) { line(-58 + k * 13, -9, -58 + k * 13, 9); line(20 + k * 13, -9, 20 + k * 13, 9); }
      ctx.fillStyle = '#d7dbe4'; ctx.fillRect(-16, -13, 32, 26); ctx.fillStyle = '#b0b6c2'; ctx.fillRect(-16, 5, 32, 8);
      ctx.strokeStyle = '#d7dbe4'; ctx.lineWidth = 2; line(0, -13, 0, -26); ctx.fillStyle = Math.sin(o.ph * 5) > 0 ? '#ff4f4f' : '#6b1d1d'; circ(0, -27, 3);
      ctx.restore();
    }
  }
}
// De tak waar een liaan aan hangt (blijft staan als een rotte liaan breekt)
function drawBranch(v) {
  if (v.jet) { drawJet(v); return; }
  if (v.balloon) { drawBalloon(v); return; }
  if (v.space) { drawAsteroid(v.pts[0].x, v.pts[0].y - v.space.r * 0.55, v.space.r, v.space.ph + time * 0.15, v.space.col); return; }
  const style = BIOMES[v.bi].style, c = BIOMES[v.bi].c;
  if (style === 'blocky' || style === 'paint' || style === 'poly3d' || style === 'candy') { drawStyledBranch(v, style, c); return; }
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
  const bob = a.vine || a.loose ? 0 : Math.sin(a.t * 3) * 4;
  if (a.pearl) { // parel onder water
    const y = a.y + bob;
    ctx.fillStyle = a.gold ? '#ffe08a' : '#f4eefa'; circ(a.x, y, 13);
    ctx.fillStyle = a.gold ? '#c9971a' : '#c9b6dc'; circ(a.x + 3, y + 3, 7);
    ctx.fillStyle = '#ffffff'; circ(a.x - 4, y - 4, 4);
    return;
  }
  const x = a.x, y = a.y + bob, s = appleSprite(a.gold);
  if (a.gold && !Q.lite) ctx.drawImage(glowSprite('255,230,120').c, x - 40, y - 40, 80, 80);
  const sc = APPLE_SC * (1 + Math.sin(a.t * 4) * 0.04);
  ctx.drawImage(s.c, x - s.w * sc / 2, y - s.h * sc / 2 - 3, s.w * sc, s.h * sc);
  if (a.gold && Math.sin(a.t * 5) > 0.6) { ctx.fillStyle = '#fff'; starPath(ctx, x + 12, y - 9, 5, a.t); ctx.fill(); }
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
    else if (f.type === 'jelly') drawJelly(f);
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
  const dir = f.vy < 0 ? 1 : -1, c2a = blue ? 'rgba(79,184,255,0.35)' : 'rgba(255,138,26,0.35)';
  for (let i = 4; i >= 1; i--) {
    ctx.fillStyle = i > 2 ? c2a : c2;
    circ(f.x + Math.sin(time * 20 + i) * 2, f.y + dir * i * 8, f.r * (1 - i * 0.16));
  }
  ctx.save(); ctx.translate(f.x, f.y);
  ctx.fillStyle = cachedGrad(`fire${blue ? 'b' : 'r'}${f.r}`, () => {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, f.r * 1.6);
    g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c3);
    return g;
  });
  circ(0, 0, f.r * 1.6); ctx.restore();
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
// Hoofdmenu: af en toe doet Andy een kunstje op de rots (de eerste na ~4 s, daarna om de 14 s steeds een ander).
// Geeft { kind, u (seconden bezig), p (0..1) } of null.
const ANTICS = ['wave', 'dance', 'salto', 'juggle'], ANTIC_EVERY = 14, ANTIC_DUR = 2.6, ANTIC_FIRST = 4;
function menuAntic() {
  if (game.mode !== 'menu' || !G || G.state !== 'stand') return null;
  const t = G.standT - ANTIC_FIRST;
  if (t < 0) return null;
  const u = t % ANTIC_EVERY;
  if (u > ANTIC_DUR) return null;
  return { kind: ANTICS[Math.floor(t / ANTIC_EVERY) % ANTICS.length], u, p: u / ANTIC_DUR };
}
function drawGorilla() {
  if (G.state === 'dead' && G.y > HAZARD_Y + 60 && !(run && run.under)) return; // onder water blijf je zichtbaar
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
  const an = menuAntic();
  if (an && an.kind === 'dance') { const b = Math.sin(an.u * 9); ctx.translate(b * 4, -Math.abs(Math.cos(an.u * 9)) * 4); ctx.rotate(b * 0.14); }
  if (an && an.kind === 'salto') { // een sprongetje met een achterwaartse salto, en weer netjes op de rots
    const e = clamp((an.p - 0.15) / 0.7, 0, 1), s = e * e * (3 - 2 * e);
    ctx.translate(0, -Math.sin(e * Math.PI) * 55); ctx.rotate(-s * Math.PI * 2);
  }
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
    if (an) {
      const w = Math.sin(an.u * 14), b = Math.sin(an.u * 9);
      if (an.kind === 'wave') { h1 = [-15, 12]; h2 = [21 + w * 5, -27 + Math.abs(w) * 2]; mouth = 'grin'; }
      else if (an.kind === 'dance') { h1 = [-18, -18 + b * 9]; h2 = [18, -18 - b * 9]; f1 = [-9, 26 - Math.max(0, b) * 5]; f2 = [9, 26 - Math.max(0, -b) * 5]; mouth = 'grin'; }
      else if (an.kind === 'salto') { h1 = [-9, 4]; h2 = [9, 4]; f1 = [-6, 20]; f2 = [6, 20]; mouth = 'open'; if (an.p < 0.15 || an.p > 0.85) { h1 = [-20, -20]; h2 = [20, -20]; f1 = [-9, 26]; f2 = [9, 26]; mouth = 'grin'; } }
      else if (an.kind === 'juggle') { const j = Math.sin(an.u * 12); h1 = [-11, -4 + j * 5]; h2 = [11, -4 - j * 5]; mouth = 'grin'; }
    }
  } else if (G.state === 'rocket') { h1 = [14, 6]; h2 = [20, 8]; mouth = 'open'; }
  else if (G.state === 'dead') { const w = Math.sin(time * 20) * 6; h1 = [-24, -12 + w]; h2 = [24, -12 - w]; mouth = 'o'; }
  else if (tr && tr.id === 'star') { const e = Math.sin(tk * Math.PI); h1 = [-12 - 16 * e, -10 - 14 * e]; h2 = [12 + 16 * e, -10 - 14 * e]; f1 = [-8 - 10 * e, 25]; f2 = [8 + 10 * e, 25]; mouth = 'grin'; }
  else if (tr && tr.id === 'super') { h1 = [-3, -36]; h2 = [3, -36]; f1 = [-4, 27]; f2 = [4, 27]; mouth = 'grin'; }
  else if (tr) { h1 = [-9, 4]; h2 = [9, 4]; f1 = [-6, 18]; f2 = [6, 18]; mouth = 'grin'; } // ingedoken voor een salto
  else if (G.diving) { h1 = [-10, 20]; h2 = [-2, 22]; f1 = [-5, 27]; f2 = [5, 27]; mouth = 'o'; }
  else if (G.state === 'swim') { const s = Math.sin(time * 7); h1 = [-8 + s * 14, -20 - s * 6]; h2 = [8 - s * 14, -18 + s * 6]; f1 = [-8 - s * 5, 26]; f2 = [8 + s * 5, 26]; mouth = 'o'; } // zwemslag
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
  if (GC.appleSuit) { // appelkostuum: een grote, glanzende appel als lijf
    ctx.fillStyle = GC.ink; ell(0, 3, 20, 18);
    ctx.fillStyle = cachedGrad('applesuit', () => { const g = ctx.createRadialGradient(-6, -4, 2, 0, 3, 20); g.addColorStop(0, '#ff8a7a'); g.addColorStop(0.5, '#e8322b'); g.addColorStop(1, '#9e1b16'); return g; });
    ell(0, 3, 18.5, 16.5);
  }
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
  if (GC.appleSuit) drawAppleSuitTop();
  if (GC.hat) drawHat(GC.hat);
  if (an && an.kind === 'juggle') { // drie appels in een boogje boven de handen
    for (let i = 0; i < 3; i++) {
      const ph = an.u * 5 + i * Math.PI * 2 / 3, x = Math.cos(ph) * 12, y = -40 - Math.abs(Math.sin(ph)) * 22;
      ctx.fillStyle = GC.ink; circ(x, y, 5.2); ctx.fillStyle = '#e8322b'; circ(x, y, 4.2);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; circ(x - 1.5, y - 1.5, 1.2); ctx.fillStyle = '#4caf50'; ell(x + 1.5, y - 4.5, 2, 1, -0.5);
    }
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
  ctx.strokeStyle = lavaW > 0.5 ? 'rgba(255,240,160,.75)' : styleWeight(P, 'candy') > 0.5 ? 'rgba(160,90,60,.9)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = sx; x <= x1 + 14; x += 14) { const y = waveY(x) + 1.5; x === sx ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  // voorwerpen op het oppervlak, per biome
  const st = P.t < 0.5 ? P.a.style : P.b.style;
  if (st === 'poly3d') { // neon-raster in perspectief: de rasterzee
    ctx.strokeStyle = 'rgba(255,120,230,.55)'; ctx.lineWidth = 1.6;
    const vx = camX + viewW / 2;
    for (let k = 0; k < 7; k++) { const y = HAZARD_Y + 6 + k * k * 6 + ((time * 20) % 12) * (k / 7); line(x0, y, x1, y); }
    for (let i = Math.floor((x0 - vx) / 90) - 6; i <= Math.ceil((x1 - vx) / 90) + 6; i++) { const x = vx + i * 90 - (camX % 90); line(x, HAZARD_Y + 4, vx + (x - vx) * 2.4, bottom); }
  } else if (st === 'paint') { ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.beginPath(); for (let x = sx; x <= x1 + 14; x += 14) { const y = waveY(x); x === sx ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
  else if (st === 'blocky') { // blokwater: vierkantjes met lichte en donkere tinten
    for (let i = Math.floor(x0 / 24); i < x1 / 24 + 1; i++) for (let j = 0; j < 4; j++) {
      const h = hash(i * 7.1 + j * 3.3 + Math.floor(time * 2) * 0.37);
      if (h < 0.3) { ctx.fillStyle = h < 0.12 ? 'rgba(255,255,255,.28)' : 'rgba(10,30,120,.25)'; ctx.fillRect(i * 24, HAZARD_Y + 4 + j * 24, 24, 24); }
    }
  }
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
    } else if (st === 'candy') { // marshmallows en snoepjes drijven in de chocola
      if (h < 0.4) { ctx.fillStyle = '#fff4f8'; ctx.fillRect(x - 10, y - 8, 20, 14); ctx.fillStyle = '#ffd1e6'; ctx.fillRect(x - 10, y - 8, 20, 4); }
      else if (h < 0.55) { ctx.fillStyle = SPRINKLE_COLS[(h * 50 | 0) % SPRINKLE_COLS.length]; ell(x, y, 9, 6); ctx.fillStyle = 'rgba(255,255,255,.5)'; circ(x - 3, y - 2, 2); }
    } else if (st === 'blocky') {
      if (h < 0.25) { ctx.fillStyle = '#3a8a2a'; ctx.fillRect(Math.round(x / 8) * 8, y - 4, 24, 8); } // waterlelieblokje
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
const PAINT_COLS = ['#ed1c24', '#ffc90e', '#22b14c', '#00a2e8', '#a349a4'], SPRINKLE_COLS = ['#ff4f8b', '#4fb0ff', '#ffe14f', '#6fe07a', '#b69cff'];
function drawAmbient(P) {
  const type = P.t < 0.5 ? P.a.particle : P.b.particle, ga = ctx.globalAlpha;
  // wisselende doorzichtigheid via globalAlpha: geen nieuwe kleurstring per deeltje per beeld
  for (let i = 0; i < Q.amb; i++) {
    const p = amb[i];
    switch (type) {
      case 'leaf': ctx.fillStyle = p.s > 1.2 ? 'rgba(120,190,70,.85)' : 'rgba(90,170,70,.8)'; ell(p.x, p.y, 5 * p.s, 2.4 * p.s, time * 2 + p.ph); break;
      case 'firefly': {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + p.ph));
        ctx.globalAlpha = ga * a * 0.25; ctx.fillStyle = 'rgb(230,255,120)'; circ(p.x, p.y, 7 * p.s);
        ctx.globalAlpha = ga * a; ctx.fillStyle = 'rgb(250,255,170)'; circ(p.x, p.y, 2 * p.s); break;
      }
      case 'dust': ctx.fillStyle = 'rgba(255,230,180,.45)'; circ(p.x, p.y, 1.8 * p.s); break;
      case 'snow': ctx.fillStyle = 'rgba(255,255,255,.9)'; circ(p.x, p.y, 2.4 * p.s); break;
      case 'ember':
        ctx.globalAlpha = ga * (0.5 + 0.5 * Math.sin(time * 5 + p.ph));
        ctx.fillStyle = p.ember || (p.ember = `rgb(255,${120 + (p.s * 80 | 0)},40)`); circ(p.x, p.y, 1.8 * p.s); break;
      case 'star': {
        const a = 0.3 + 0.7 * Math.abs(Math.sin(time * 1.7 + p.ph));
        ctx.globalAlpha = ga * a * 0.2; ctx.fillStyle = 'rgb(170,210,255)'; circ(p.x, p.y, 6 * p.s);
        ctx.globalAlpha = ga * a; ctx.fillStyle = 'rgb(210,235,255)'; circ(p.x, p.y, 1.6 * p.s); break;
      }
      case 'pixel': ctx.fillStyle = p.s > 1 ? 'rgba(96,181,56,.85)' : 'rgba(255,255,255,.85)'; ctx.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, 5 * p.s, 5 * p.s); break;
      case 'paint':
        ctx.fillStyle = PAINT_COLS[(p.ph * 10 | 0) % PAINT_COLS.length]; ctx.globalAlpha = ga * 0.8;
        ell(p.x, p.y, 5 * p.s, 3.5 * p.s, p.ph); ell(p.x + 4 * p.s, p.y - 3 * p.s, 2 * p.s, 2 * p.s); break;
      case 'cube': {
        const r = 4 * p.s, a = time * 0.8 + p.ph, c = Math.cos(a) * r, sn = Math.sin(a) * r;
        ctx.strokeStyle = 'rgba(143,245,229,.8)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p.x + c, p.y + sn * 0.5 - r); ctx.lineTo(p.x - sn, p.y + c * 0.5 - r); ctx.lineTo(p.x - c, p.y - sn * 0.5 - r); ctx.lineTo(p.x + sn, p.y - c * 0.5 - r); ctx.closePath();
        ctx.moveTo(p.x + c, p.y + sn * 0.5 + r); ctx.lineTo(p.x - sn, p.y + c * 0.5 + r); ctx.lineTo(p.x - c, p.y - sn * 0.5 + r); ctx.lineTo(p.x + sn, p.y - c * 0.5 + r); ctx.closePath();
        ctx.stroke(); break;
      }
      case 'sprinkle': {
        ctx.strokeStyle = SPRINKLE_COLS[(p.ph * 10 | 0) % SPRINKLE_COLS.length]; ctx.lineWidth = 2.6 * p.s; ctx.lineCap = 'round';
        const a = time * 2 + p.ph; line(p.x - Math.cos(a) * 4 * p.s, p.y - Math.sin(a) * 4 * p.s, p.x + Math.cos(a) * 4 * p.s, p.y + Math.sin(a) * 4 * p.s); break;
      }
    }
  }
  ctx.globalAlpha = ga;
}
function drawFlash() {
  if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT})`; ctx.fillRect(0, 0, viewW, viewH); }
}


// =====================================================================
//  Biome-overgang, onder water, kisten en het uiterlijk van Andy
// =====================================================================
// Een poort op elke biomegrens (Eindeloos): twee pilaren, een glinsterend gordijn en een bord met de naam
function drawBiomeGates() {
  if (game.career) return;
  const m0 = (camX - 300 - START_X) / PX_PER_M, m1 = (camX + viewW + 300 - START_X) / PX_PER_M;
  const S = biomeSeg(m0), bounds = [];
  if (S.start > 0) bounds.push(S.start);
  for (let b = S.nextStart, k = 0; b <= m1 && k < 3; k++) { bounds.push(b); b = biomeSeg(b + 0.01).nextStart; }
  for (const b of bounds) {
    const x = START_X + b * PX_PER_M;
    if (x < camX - 300 || x > camX + viewW + 300) continue;
    const B = BIOMES[biomeSeg(b + 0.01).i], y0 = Math.max(camY - 60, CEIL_Y - 1200), y1 = HAZARD_Y + 20;
    // gordijn van licht in de kleuren van de nieuwe biome
    ctx.fillStyle = cachedGrad('gate' + B.name, () => { const g = ctx.createLinearGradient(-70, 0, 70, 0); g.addColorStop(0, rgbStr(B.rgb.skyTop, 0)); g.addColorStop(0.5, rgbStr(B.rgb.sun, 0.22)); g.addColorStop(1, rgbStr(B.rgb.skyTop, 0)); return g; });
    ctx.save(); ctx.translate(x, 0); ctx.fillRect(-70, y0, 140, y1 - y0); ctx.restore();
    ctx.fillStyle = rgbStr(B.rgb.sun, 0.55);
    for (let k = 0; k < 8; k++) { const yy = y1 - ((time * 90 + k * 130) % (y1 - y0)); circ(x + Math.sin(time * 2 + k) * 40, yy, 2.5); }
    for (const sd of [-1, 1]) { // pilaren
      const px = x + sd * 78;
      ctx.fillStyle = '#5b5560'; ctx.fillRect(px - 14, y0, 28, y1 - y0);
      ctx.fillStyle = '#7d7684'; ctx.fillRect(px - 14, y0, 9, y1 - y0);
      ctx.fillStyle = B.c.vine; for (let yy = Math.floor(y0 / 90) * 90; yy < y1; yy += 90) { ctx.fillRect(px - 14, yy, 28, 6); }
    }
    // bord met de naam, altijd in beeld zolang de poort er is
    const by = clamp(camY + viewH * 0.18, y0 + 60, y1 - 120);
    ctx.font = '900 26px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = `${B.icon} ${B.name.toUpperCase()}`, w = ctx.measureText(txt).width + 40;
    ctx.fillStyle = 'rgba(20,14,30,.85)'; ctx.fillRect(x - w / 2, by - 24, w, 48);
    ctx.fillStyle = B.c.sun; ctx.fillRect(x - w / 2, by + 20, w, 4);
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, x, by + 1);
  }
}
// Filmische titelkaart bij een nieuwe biome (in beeldcoördinaten)
function drawCinematic() {
  const C = run && run.cine;
  if (!C) return;
  const t = C.t, B = BIOMES[C.bi], u = 1 / scale, W = viewW, H = viewH;
  const ease = e => { e = clamp(e, 0, 1); return 1 - Math.pow(1 - e, 3); };
  if (t < 1) { // kleurgolf vanuit het midden
    ctx.fillStyle = rgbStr(B.rgb.sun, 0.35 * (1 - t));
    circ(W / 2, H / 2, ease(t) * Math.hypot(W, H) * 0.6);
  }
  const bars = t < 0.35 ? ease(t / 0.35) : t > CINE_DUR - 0.5 ? ease((CINE_DUR - t) / 0.5) : 1, bh = H * 0.12 * bars;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
  const a = t < 0.3 ? 0 : t < 0.7 ? (t - 0.3) / 0.4 : t > CINE_DUR - 0.6 ? (CINE_DUR - t) / 0.6 : 1;
  if (a <= 0) return;
  const slide = (1 - ease((t - 0.3) / 0.6)) * W * 0.3;
  ctx.globalAlpha = clamp(a, 0, 1); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const ls = 'letterSpacing' in ctx;
  if (ls) ctx.letterSpacing = `${6 * u}px`;
  ctx.font = `900 ${17 * u}px Trebuchet MS, sans-serif`; ctx.fillStyle = B.c.sun;
  ctx.fillText(C.lap ? 'TERUG IN' : 'NIEUWE BIOME', W / 2 - slide * 0.5, H * 0.35);
  const fs = Math.min(86, cssW * 0.085);
  ctx.font = `900 ${fs * u}px Trebuchet MS, sans-serif`;
  const title = `${B.icon} ${B.name.toUpperCase()}`;
  ctx.lineWidth = 10 * u; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(title, W / 2 + slide, H * 0.44);
  ctx.fillStyle = '#ffffff'; ctx.fillText(title, W / 2 + slide, H * 0.44);
  if (ls) ctx.letterSpacing = '0px';
  const lw = W * 0.42 * ease((t - 0.55) / 0.5);
  ctx.fillStyle = B.c.sun; ctx.fillRect(W / 2 - lw / 2, H * 0.44 + fs * u * 0.62, lw, 5 * u);
  ctx.font = `800 ${22 * u}px Trebuchet MS, sans-serif`; ctx.lineWidth = 5 * u;
  ctx.strokeText(C.sub, W / 2 - slide * 0.3, H * 0.44 + fs * u * 1.05); ctx.fillText(C.sub, W / 2 - slide * 0.3, H * 0.44 + fs * u * 1.05);
  if (bh > 20 * u) { ctx.font = `700 ${16 * u}px Trebuchet MS, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(B.tip, W / 2, H - bh / 2); }
  ctx.globalAlpha = 1;
}
// De onderwaterwereld (in wereldcoördinaten, vóór de rest van de speelwereld getekend)
function drawUnderwater(P) {
  const U = run.under, x0 = camX - 40, x1 = camX + viewW + 40, top = HAZARD_Y - 6;
  if (camY + viewH < top) return;
  const bot = Math.max(camY + viewH + 40, UNDER_FLOOR + 300);
  ctx.fillStyle = cachedGrad('deep' + paletteKey(P), () => {
    const g = ctx.createLinearGradient(0, HAZARD_Y, 0, UNDER_FLOOR);
    g.addColorStop(0, P.hazTop); g.addColorStop(0.25, rgbStr(mixC(P.hazTopC, P.hazBotC, 0.7))); g.addColorStop(1, rgbStr(mixC(P.hazBotC, [0, 5, 20], 0.6)));
    return g;
  });
  ctx.fillRect(x0, top, x1 - x0, bot - top);
  // lichtbundels van boven
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = Math.floor(x0 / 260) - 1; i < x1 / 260 + 1; i++) {
    const x = i * 260 + Math.sin(time * 0.3 + i) * 40;
    ctx.beginPath(); ctx.moveTo(x, HAZARD_Y); ctx.lineTo(x + 70, HAZARD_Y); ctx.lineTo(x - 90, UNDER_FLOOR); ctx.lineTo(x - 200, UNDER_FLOOR); ctx.fill();
  }
  const nearExit = x => U.exits.some(e => Math.abs(e - x) < 110);
  // de stroming vlak onder het oppervlak (hier kom je niet door, behalve bij een luchtgat)
  ctx.fillStyle = 'rgba(0,10,40,.28)'; ctx.fillRect(x0, HAZARD_Y, x1 - x0, UNDER_TOP - HAZARD_Y + 10);
  ctx.strokeStyle = 'rgba(200,230,255,.35)'; ctx.lineWidth = 2;
  for (let i = Math.floor(x0 / 90); i < x1 / 90; i++) {
    const x = i * 90 + ((time * 50) % 90);
    if (nearExit(x)) continue;
    const y = HAZARD_Y + 18; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x + 7, y); ctx.stroke();
  }
  // luchtgaten: bellenzuilen
  for (const e of U.exits) {
    if (e < x0 - 100 || e > x1 + 100) continue;
    ctx.fillStyle = cachedGrad('exitcol', () => { const g = ctx.createLinearGradient(-70, 0, 70, 0); g.addColorStop(0, 'rgba(180,240,255,0)'); g.addColorStop(0.5, 'rgba(180,240,255,.35)'); g.addColorStop(1, 'rgba(180,240,255,0)'); return g; });
    ctx.save(); ctx.translate(e, 0); ctx.fillRect(-70, HAZARD_Y - 30, 140, UNDER_FLOOR - HAZARD_Y + 30); ctx.restore();
    ctx.strokeStyle = 'rgba(235,250,255,.85)'; ctx.lineWidth = 1.6;
    for (let k = 0; k < 16; k++) { const y = UNDER_FLOOR - ((time * 180 + k * 67) % (UNDER_FLOOR - HAZARD_Y)); ctx.beginPath(); ctx.arc(e + Math.sin(time * 3 + k) * 22, y, 3 + (k % 4), 0, Math.PI * 2); ctx.stroke(); }
    ctx.font = '900 24px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText('⬆ LUCHT', e, UNDER_TOP + 70 + Math.sin(time * 4) * 5);
    ctx.fillStyle = '#e6fbff'; ctx.fillText('⬆ LUCHT', e, UNDER_TOP + 70 + Math.sin(time * 4) * 5);
  }
  // rotswanden
  for (const w of U.walls) {
    if (w.x < x0 - 80 || w.x > x1 + 80) continue;
    const y0 = Math.max(w.y0, HAZARD_Y), y1 = Math.min(w.y1, UNDER_FLOOR + 40), rx = w.w / 2;
    ctx.fillStyle = '#34414f'; ctx.beginPath(); ctx.moveTo(w.x - rx, y1); ctx.lineTo(w.x - rx * 0.8, y0 + 10); ctx.quadraticCurveTo(w.x, y0 - 12, w.x + rx * 0.85, y0 + 8); ctx.lineTo(w.x + rx, y1); ctx.fill();
    ctx.fillStyle = '#4a5a6b'; ctx.fillRect(w.x - rx * 0.7, y0 + 10, rx * 0.4, y1 - y0 - 10);
    ctx.fillStyle = '#3f8f5a'; for (let k = 0; k < 4; k++) ell(w.x + (hash(w.x + k) - 0.5) * w.w, y0 + 20 + hash(w.x * 2 + k) * (y1 - y0 - 40), 8, 5);
  }
  // bodem met zand, zeewier en koraal
  ctx.fillStyle = '#b89d62'; ctx.beginPath(); ctx.moveTo(x0, bot);
  for (let x = Math.floor(x0 / 30) * 30; x <= x1 + 30; x += 30) ctx.lineTo(x, UNDER_FLOOR - 12 - noise1(x * 0.01) * 26);
  ctx.lineTo(x1 + 30, bot); ctx.fill();
  ctx.lineCap = 'round';
  for (let i = Math.floor(x0 / 70); i < x1 / 70; i++) {
    const h = hash(i * 3.3), x = i * 70 + h * 40, base = UNDER_FLOOR - 16;
    if (h < 0.55) { // zeewier
      ctx.strokeStyle = h < 0.25 ? '#2f8a4a' : '#4aa35a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, base);
      const L = 90 + h * 200; for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(time * 1.4 + i + k * 0.8) * 10 * k / 6, base - L * k / 6); ctx.stroke();
    } else if (h < 0.7) { ctx.fillStyle = h < 0.62 ? '#ff7a9a' : '#ffb05a'; circ(x, base - 10, 12); circ(x - 10, base - 4, 8); circ(x + 11, base - 6, 9); }
  }
  // het oppervlak van onderen
  ctx.strokeStyle = 'rgba(220,245,255,.7)'; ctx.lineWidth = 3; ctx.beginPath();
  for (let x = Math.floor(x0 / 14) * 14; x <= x1 + 14; x += 14) { const y = waveY(x); x === Math.floor(x0 / 14) * 14 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
}
// Luchtmeter onder water (in beeldcoördinaten)
function drawUnderHud() {
  const U = run && run.under;
  if (!U) return;
  const u = 1 / scale, W = viewW, H = viewH, k = clamp(U.t / UNDER_TIME, 0, 1);
  if (U.t < 8) { // het wordt benauwd: een rode rand
    const a = (1 - U.t / 8) * (0.5 + 0.3 * Math.sin(time * 10));
    ctx.strokeStyle = `rgba(200,20,40,${clamp(a, 0, 0.8)})`; ctx.lineWidth = 40 * u; ctx.strokeRect(0, 0, W, H);
  }
  const bw = 300 * u, bh = 22 * u, x = W / 2 - bw / 2, y = 74 * u;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 4 * u, y - 4 * u, bw + 8 * u, bh + 8 * u);
  ctx.fillStyle = k > 0.5 ? '#6fd3ff' : k > 0.25 ? '#ffd23f' : '#ff4f5a'; ctx.fillRect(x, y, bw * k, bh);
  ctx.font = `900 ${17 * u}px Trebuchet MS, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillText(`🫧 Lucht: ${Math.max(0, Math.ceil(U.t))} s`, W / 2, y + bh / 2 + 1 * u);
  const next = U.exits.find(e => e > G.x - 90);
  if (next !== undefined && !U.drowned) {
    ctx.font = `800 ${15 * u}px Trebuchet MS, sans-serif`; ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,.5)';
    const txt = Math.abs(next - G.x) < 90 ? '⬆ Zwem omhoog!' : `Luchtgat over ${Math.round((next - G.x) / PX_PER_M)} m ➜`;
    ctx.strokeText(txt, W / 2, y + bh + 20 * u); ctx.fillText(txt, W / 2, y + bh + 20 * u);
  }
}
// Kisten om op te pakken
function drawLoot() {
  for (const L of loot) {
    if (L.x < camX - 90 || L.x > camX + viewW + 90 || L.y < camY - 90 || L.y > camY + viewH + 90) continue;
    const y = L.y + Math.sin(L.t * 2.5) * 8;
    if (!Q.lite) { ctx.globalAlpha = 0.6 + 0.2 * Math.sin(L.t * 4); ctx.drawImage(glowSprite('255,210,90').c, L.x - 64, y - 64, 128, 128); ctx.globalAlpha = 1; }
    // draaiende lichtstralen erachter, zodat je hem van ver ziet
    ctx.save(); ctx.translate(L.x, y - 4); ctx.rotate(L.t * 0.6);
    ctx.fillStyle = '#ffe680'; ctx.globalAlpha = 0.28 + 0.1 * Math.sin(L.t * 3); ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; ctx.moveTo(0, 0); ctx.arc(0, 0, 78, a - 0.11, a + 0.11); }
    ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(L.x, y); ctx.rotate(Math.sin(L.t * 1.7) * 0.08); ctx.scale(LOOT_SC, LOOT_SC);
    ctx.fillStyle = '#3a220f'; ctx.fillRect(-19, -9, 38, 24);
    ctx.fillStyle = '#8a5a2e'; ctx.fillRect(-17, -7, 34, 20);
    ctx.fillStyle = '#3a220f'; ctx.beginPath(); ctx.moveTo(-19, -8); ctx.quadraticCurveTo(0, -26, 19, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a0703c'; ctx.beginPath(); ctx.moveTo(-17, -8); ctx.quadraticCurveTo(0, -23, 17, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f5c518'; ctx.fillRect(-19, -10, 38, 3.5); ctx.fillRect(-12, -18, 3.5, 33); ctx.fillRect(8.5, -18, 3.5, 33);
    ctx.fillStyle = '#ffe680'; ctx.fillRect(-4, -4, 8, 9); ctx.fillStyle = '#3a220f'; ctx.fillRect(-1, -1, 2, 4);
    ctx.restore();
    // drie fonkelende sterretjes die om de kist heen draaien
    ctx.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) {
      const a = L.t * 1.3 + k * 2.094, tw = 0.5 + 0.5 * Math.sin(L.t * 5 + k * 2);
      starPath(ctx, L.x + Math.cos(a) * 46, y - 6 + Math.sin(a) * 34, 3 + tw * 5, L.t * 2 + k); ctx.fill();
    }
  }
}
function drawJelly(f) {
  const p = 1 + Math.sin(f.t * 3) * 0.08;
  ctx.save(); ctx.translate(f.x, f.y);
  ctx.strokeStyle = `hsla(${f.hue},80%,80%,.6)`; ctx.lineWidth = 2;
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 6, 4); for (let j = 1; j <= 4; j++) ctx.lineTo(k * 6 + Math.sin(f.t * 4 + j + k) * 4, 4 + j * 9); ctx.stroke(); }
  ctx.fillStyle = `hsla(${f.hue},80%,70%,.75)`; ctx.beginPath(); ctx.ellipse(0, 0, 20 * p, 16 / p, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ell(-6, -8, 5, 3);
  if (f.fleeT !== undefined) { const s = appleSprite(false); ctx.drawImage(s.c, -7, 6, 14, 16); }
  ctx.restore();
}
// ---- Uiterlijk van Andy (uit kisten, zie game.js) ----
const APPLE_SUIT = { fur: '#e8322b', furD: '#a8141c', furL: '#ff8a7a', band: '#4caf50', bandD: '#2e7d32', appleSuit: true };
let lookKey = '', lookPal = null;
// het palet voor jouw eigen gorilla, met je gekozen vachtkleur, hoed en kostuum
function myLook() {
  const c = save.cosm, col = LOOT_BY_ID[c.color];
  if (!c.color && !c.hat && !c.suit) return GC;
  if (col && col.rainbow && !c.suit) { // regenboog: de kleur loopt rond
    const h = (time * 60) % 360;
    return Object.assign({}, GC, { fur: `hsl(${h},70%,48%)`, furD: `hsl(${h},70%,32%)`, furL: `hsl(${(h + 30) % 360},80%,68%)`, hat: c.hat });
  }
  const key = c.color + '|' + c.hat + '|' + c.suit;
  if (key !== lookKey || !lookPal) {
    lookKey = key;
    const base = c.suit === 'suit_kiwi' ? GCK : c.suit === 'suit_apple' ? Object.assign({}, GC, APPLE_SUIT) : col ? Object.assign({}, GC, { fur: col.fur, furD: col.furD, furL: col.furL }) : GC;
    lookPal = Object.assign({}, base, { hat: c.suit === 'suit_apple' ? '' : c.hat });
  }
  return lookPal;
}
function drawHat(id) {
  ctx.lineWidth = 1.6; ctx.strokeStyle = GC.ink; ctx.lineJoin = 'round';
  const shape = (col, fn) => { ctx.fillStyle = col; ctx.beginPath(); fn(); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  if (id === 'hat_cap') {
    shape('#2f7fe0', () => { ctx.arc(0, -25, 12.5, Math.PI, 0); });
    shape('#1d5bb0', () => { ctx.ellipse(10, -25, 11, 3, 0, 0, Math.PI * 2); });
    ctx.fillStyle = '#fff'; circ(0, -37, 2);
  } else if (id === 'hat_cowboy') {
    shape('#8b5a2b', () => { ctx.ellipse(0, -27, 23, 5, 0, 0, Math.PI * 2); });
    shape('#a0703c', () => { ctx.moveTo(-11, -27); ctx.lineTo(-9, -42); ctx.quadraticCurveTo(0, -38, 9, -42); ctx.lineTo(11, -27); });
    ctx.fillStyle = '#4a2e16'; ctx.fillRect(-10.5, -31, 21, 3.5);
  } else if (id === 'hat_pirate') {
    shape('#1d1d24', () => { ctx.moveTo(-21, -25); ctx.quadraticCurveTo(-10, -46, 0, -40); ctx.quadraticCurveTo(10, -46, 21, -25); ctx.quadraticCurveTo(0, -31, -21, -25); });
    ctx.fillStyle = '#fff'; circ(0, -33, 3.2); ctx.fillStyle = '#1d1d24'; circ(-1.2, -33.5, 0.9); circ(1.2, -33.5, 0.9);
    ctx.strokeStyle = '#f5c518'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-19, -26); ctx.quadraticCurveTo(0, -32, 19, -26); ctx.stroke();
  } else if (id === 'hat_crown') {
    shape('#f5c518', () => { ctx.moveTo(-12, -25); ctx.lineTo(-13, -38); ctx.lineTo(-6, -31); ctx.lineTo(0, -41); ctx.lineTo(6, -31); ctx.lineTo(13, -38); ctx.lineTo(12, -25); });
    ctx.fillStyle = '#e8322b'; circ(0, -29, 2.2); ctx.fillStyle = '#2f7fe0'; circ(-7, -28.5, 1.8); circ(7, -28.5, 1.8);
  } else if (id === 'hat_wizard') {
    shape('#5b2fa8', () => { ctx.moveTo(-13, -27); ctx.quadraticCurveTo(-2, -45, 6, -60); ctx.quadraticCurveTo(4, -42, 13, -27); });
    shape('#5b2fa8', () => { ctx.ellipse(0, -27, 18, 4.5, 0, 0, Math.PI * 2); });
    ctx.fillStyle = '#ffd23f'; starPath(ctx, -2, -38, 3.5, 0.3); ctx.fill(); starPath(ctx, 4, -48, 2.5, 0); ctx.fill();
  }
}
function drawAppleSuitTop() { // steeltje en blaadje op het hoofd, glans op de "appel"
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(1, -37, 4, -41); ctx.stroke();
  ctx.fillStyle = '#4caf50'; ctx.strokeStyle = GC.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(11, -39, 8, 3.8, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ell(-8, -23, 2.5, 4.5, -0.5); ell(-9, 2, 3, 6, -0.3);
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
  const mid = (camX + viewW * 0.5 - START_X) / PX_PER_M, P = paletteAt(mid);
  const S = scale * pr;
  // achtergrondtegels: per beeld maar een paar nieuwe; komt de volgende biome eraan, dan die alvast vooruit tekenen
  tileBudget = TILE_BUDGET;
  const SG = biomeSeg(mid);
  tileAheadBi = SG.next !== SG.i && P.t === 0 && mid > SG.nextStart - 240 ? SG.next : -1;
  const under = !!(run && run.under);
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
      drawLightRays(P); // in de achtergrondbuffer: een beeldvullend 'lighter'-vlak op volle resolutie is duur (vooral in Firefox)
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
    withBaseView(() => { drawFlyers(); drawGiantTrunks(P); });
    ctx.globalAlpha = 1;
  }
  // 3) de speelwereld
  const sx = shakeT > 0 ? (Math.random() - 0.5) * shakeAmp * 2 : 0, sy = shakeT > 0 ? (Math.random() - 0.5) * shakeAmp * 2 : 0;
  ctx.setTransform(S, 0, 0, S, -(camX + sx) * S + VOX, -(camY + sy) * S + VOY);
  if (under) drawUnderwater(P);
  drawRock();
  drawSkyBirds();
  drawMarkers();
  drawBiomeGates();
  drawFinish();
  drawShrooms();
  drawTramps();
  if (spaceObjs.length) drawSpaceObjs();
  drawPortals(false);
  const vx0 = camX - 300, vx1 = camX + viewW + 420, vy0 = camY - 60, vy1 = camY + viewH + 60;
  for (const v of vines) if (v.jet ? v.x > vx0 - 700 && v.x - 900 < vx1 : v.x > vx0 && v.rest[2] - 200 < vx1 && v.ay < vy1 && v.rest[3] + 150 > vy0) drawVine(v); // een straaljager beweegt: niet op zijn startplek (rest) testen
  for (const v of vines) if (v.x > camX - 300 && v.x < camX + viewW + 300 && v.ay > camY - 220 && v.ay < camY + viewH + 60) drawBranch(v);
  drawPortals(true);
  for (const a of apples) if (a.x > camX - 50 && a.x < camX + viewW + 50 && a.y > camY - 50 && a.y < camY + viewH + 50) drawApple(a);
  if (loot.length) drawLoot();
  if (game.career) drawCareerWorld();
  drawFoes();
  drawFish();
  if (game.mp) drawGhost();
  if (G) { drawOwnGorilla(); drawParrot(); }
  drawParts();
  if (game.mp) drawStorm();
  if (!under) drawHazard(P); // onder water tekent drawUnderwater het water (anders zou het over Andy heen vallen)
  drawTexts();
  ctx.setTransform(S0, 0, 0, S0, VOX, VOY);
  if (!under) withBaseView(() => { drawForeground(P); if (spW < 0.6) drawAmbient(P); });
  ctx.setTransform(S, 0, 0, S, VOX, VOY);
  drawWarnings();
  if (game.mp) drawMpOverlay();
  drawFlash();
  drawCinematic();
  if (game.career) drawCareerHud();
  drawUnderHud();
  if (clip) { if (game.mp) drawLocalHud(); mainCtx.restore(); }
}
