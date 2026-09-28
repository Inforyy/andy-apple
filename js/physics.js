'use strict';
// Andy Apples · physics en update
// Lianen (Verlet-touw), zwaaien, portalen en de vaste physics-stap step().

// =====================================================================
//  Physics: lianen (Verlet touw) + gorilla
// =====================================================================
function solve(a, b, len, stiff) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
  const w = a.im + b.im;
  if (d < 1e-6 || w === 0) return;
  const diff = (d - len) / (d * w) * stiff;
  a.x += dx * diff * a.im; a.y += dy * diff * a.im;
  b.x -= dx * diff * b.im; b.y -= dy * diff * b.im;
}
function limitDist(a, b, max) { // "long range attachment": voorkomt te ver uitrekken
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d > max) { b.x = a.x + dx / d * max; b.y = a.y + dy / d * max; }
}
function simVine(v, dt) {
  const p = v.pts, n = p.length, dt2 = dt * dt;
  const hang = G.state === 'hang' && G.vine === v;
  v.is = stepNo; for (let i = 0; i < n; i++) { p[i].ix = p[i].x; p[i].iy = p[i].y; } // voor de interpolatie bij het tekenen
  if (v.balloon) { // de luchtballon drijft langzaam naar rechts en deint op en neer
    const b = v.balloon, a = p[0];
    a.x += b.vx * dt; v.x += b.vx * dt;
    a.y = v.ay + Math.sin(time * 0.9 + b.bob) * 12;
    a.px = a.x; a.py = a.y;
  }
  // de scheefhang-kracht werkt niet op de liaan waar Andy aan hangt: die zou zijn zwaai afremmen
  const wind = (Math.sin(time * 0.7 + v.phase) * 0.6 + Math.sin(time * 1.9 + v.phase * 2) * 0.4) * 60 + (hang ? 0 : VINE_TILT);
  const damp = hang ? 0.9995 : 0.996;
  for (let i = 0; i < n; i++) {
    const q = p[i]; if (q.im === 0) continue;
    const vx = (q.x - q.px) * damp, vy = (q.y - q.py) * damp;
    q.px = q.x; q.py = q.y;
    q.x += vx + wind * dt2; q.y += vy + (v.space ? GRAVITY * SPACE_G : GRAVITY) * dt2;
  }
  const k = G.k, elastic = v.type === 'elastic';
  if (hang) { // Andy's hand is een vast punt op het touw; het touw volgt hem
    const h = p[k]; h.im = 0; h.x = G.hx; h.y = G.hy; h.px = h.x; h.py = h.y;
  }
  // multiplayer: hangt de tegenstander aan deze liaan, dan buigt hij ook bij jou mee
  let gq = null;
  if (!hang && ghostPin.v === v && ghostPin.k < n) { gq = p[ghostPin.k]; gq.im = 0; gq.x = ghostPin.x; gq.y = ghostPin.y; gq.px = gq.x; gq.py = gq.y; }
  const stiff = elastic ? 0.25 : 1, reach = elastic ? ELASTIC_STRETCH : 1;
  const iters = hang ? 10 : 6;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n - 1; i++) solve(p[i], p[i + 1], SEG_LEN, stiff);
    if (v.anchored) {
      const a = p[0];
      for (let i = 2; i < n; i++) if (!(hang && i === k) && p[i] !== gq) limitDist(a, p[i], i * SEG_LEN * reach);
    }
  }
  if (gq) gq.im = 1;
  // Andy duwt lianen opzij waar hij doorheen vliegt
  if (!hang && (G.state === 'air' || G.state === 'hang' || G.state === 'rocket') && Math.abs(v.x - G.x) < 520) {
    const rr = G_R + 5;
    for (let i = 1; i < n; i++) {
      const q = p[i], dx = q.x - G.x, dy = q.y - G.y, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        q.x = G.x + dx / d * rr; q.y = G.y + dy / d * rr;
        q.px = q.x - G.vx * dt * 0.4; q.py = q.y - G.vy * dt * 0.4;
      }
    }
  }
}
// ---- Zwaaien als echte slinger: hoek en hoeksnelheid rond het ophangpunt ----
// x = anker + R·sin(θ), y = anker + R·cos(θ). De energie blijft behouden, dus zwaaien voelt vloeiend.
const swingCap = () => 1250 + 120 * lvl('swing'); // tot hier kun je vaart opbouwen door te zwaaien
function setHand() { G.hx = G.x - Math.sin(G.th) * ARM_LEN; G.hy = G.y - Math.cos(G.th) * ARM_LEN; }
function freeHand(v, k) { // hand los: het touwpunt wordt weer gewoon touw en krijgt Andy's vaart mee
  if (!v || !v.pts[k]) return;
  const q = v.pts[k]; q.im = 1; q.px = q.x - G.vx * DT * 0.5; q.py = q.y - G.vy * DT * 0.5;
}
function swingStep(v, dt) {
  const a = v.pts[0], bvx = v.balloon ? v.balloon.vx : 0;
  if (G.slack) { // te hoog gezwaaid: het touw is even slap en Andy vliegt vrij, tot het weer strak staat
    G.vy += GRAVITY * dt; G.x += G.vx * dt; G.y += G.vy * dt;
    const rx = G.x - a.x, ry = G.y - a.y, d = Math.hypot(rx, ry);
    G.th = Math.atan2(rx, ry);
    if (d >= G.R0) {
      G.R = G.R0; G.slack = false;
      const c = Math.cos(G.th), sn = Math.sin(G.th);
      G.om = ((G.vx - bvx) * c - G.vy * sn) / G.R;
      G.x = a.x + G.R * sn; G.y = a.y + G.R * c;
    }
    setHand();
    return;
  }
  const g = v.space ? GRAVITY * SPACE_G : GRAVITY, elastic = v.type === 'elastic';
  if (elastic) { // bungee: het touw rekt uit en veert terug
    const acc = g * Math.cos(G.th) + G.R * G.om * G.om - 38 * (G.R - G.R0);
    G.vr = (G.vr + acc * dt) * 0.995;
    const Rold = G.R;
    G.R = clamp(G.R + G.vr * dt, G.R0 * 0.92, G.R0 * ELASTIC_STRETCH);
    if (G.R === G.R0 * ELASTIC_STRETCH && G.vr > 0) G.vr = -G.vr * 0.3;
    G.om *= Rold / G.R;
  } else if (G.R !== G.R0) { // omlaag glijden of het touw trekt strak: de snelheid blijft gelijk
    const Rold = G.R;
    G.R = G.R < G.R0 ? Math.min(G.R0, G.R + 520 * dt) : Math.max(G.R0, G.R - 520 * dt);
    G.om *= Rold / G.R;
  }
  let alpha = -(g / G.R) * Math.sin(G.th);
  if (game.mode !== 'dying') { // "pompen": Andy zwaait zelf mee
    const vt = G.om * G.R, c = Math.cos(G.th);
    if (c > 0.25 && Math.abs(vt) > 15 && Math.abs(vt) < swingCap()) {
      const s = Math.sign(G.om), fwd = s * c > 0;
      alpha += s * pumpA(lvl('swing')) * (fwd ? 1 : 0.55) / G.R;
    }
  }
  G.om = (G.om + alpha * dt) * 0.99998;
  G.th += G.om * dt;
  const sn = Math.sin(G.th), c = Math.cos(G.th);
  G.x = a.x + G.R * sn; G.y = a.y + G.R * c;
  G.vx = G.R * G.om * c + G.vr * sn + bvx; G.vy = -G.R * G.om * sn + G.vr * c;
  // spanning negatief (boven het anker en te langzaam)? dan wordt het touw slap
  if (!elastic && G.R * G.om * G.om + g * c < 0) G.slack = true;
  setHand();
}

function tryGrab() {
  const R = gripR(lvl('grip'));
  let best = null, bk = 0, bd = R * R;
  for (const v of vines) {
    if (!v.anchored || Math.abs(v.x - G.x) > 640) continue;
    if (v === G.lastVine && G.releaseT > 0) continue;
    const p = v.pts;
    for (let i = 2; i < p.length; i++) {
      const dx = p[i].x - G.x, dy = p[i].y - G.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = v; bk = i; }
    }
  }
  if (best) attach(best, bk);
}
function attach(v, k) {
  const airT = G.airT, dx = G.x - G.airX;
  const p = v.pts, n = p.length;
  if (G.trick) { G.trick = null; G.trickRot = 0; } // truc onderbroken
  G.state = 'hang'; G.vine = v; G.k = k; G.hangT = 0; G.iceT = 0; G.diveT = 0; G.dive = 0; G.noDive = false; G.chain = 0; G.swSide = 0;
  // Nooit helemaal bovenin: Andy glijdt een stukje omlaag (anders is al zijn vaart weg)
  G.slideTo = Math.max(k, Math.max(6, Math.round(n * 0.45))); G.slideT = 0;
  if (v.type === 'icy') G.slideTo = Math.max(G.slideTo, Math.round(n * 0.6));
  if (G.slideTo > k && game.mode === 'playing') Sfx.slide();
  // Slinger opzetten. Alle vaart blijft behouden en wordt een voorwaartse zwaai
  // (tenzij je bewust hard terug vliegt), met een minimale zwaaisnelheid.
  const a = p[0], rx = G.x - a.x, ry = G.y - a.y;
  G.R = Math.max(40, Math.hypot(rx, ry)); G.R0 = k * SEG_LEN + ARM_LEN; G.th = Math.atan2(rx, ry); G.vr = 0; G.slack = false;
  const c = Math.cos(G.th), sn = Math.sin(G.th), speed = Math.hypot(G.vx, G.vy);
  const vt = (G.vx - (v.balloon ? v.balloon.vx : 0)) * c - G.vy * sn;
  let dir = Math.abs(c) > 0.2 ? Math.sign(c) : -Math.sign(sn) || 1;
  if (G.vx < -250 && Math.sign(vt) === -dir) dir = -dir;
  // een overschot boven de topsnelheid (zie de air-state) gaat niet mee de zwaai in: anders stapelt het zich
  // bij elke liaan op (loslaten vermenigvuldigt de vaart), en wordt het spel steeds sneller
  G.om = dir * Math.max(Math.min(speed, G.maxS || maxSpeed()), 480) / G.R;
  setHand();
  Sfx.grab();
  if (v.type === 'turbo' && game.mode === 'playing') Sfx.turboCharge();
  for (let i = 0; i < 7; i++) addPart({ type: 'leaf', x: p[k].x, y: p[k].y, vx: rand(-160, 160), vy: rand(-200, 40), life: rand(0.6, 1.1), max: 1.1, col: v.leaf, r: rand(3, 5), rot: rand(0, 6), vr: rand(-8, 8), g: 500 });
  addPart({ type: 'ring', x: p[k].x, y: p[k].y, vx: 0, vy: 0, life: 0.35, max: 0.35, col: 'rgba(255,255,255,.8)', r: 6, grow: 30, g: 0 });
  if (v.balloon && !v.balloon.visited && game.mode === 'playing') {
    v.balloon.visited = true;
    if (v.balloon.path) {
      const prev = vines.find(w => w.balloon && w.balloon.path === v.balloon.path && w.balloon.step === v.balloon.step - 1);
      if (v.balloon.step > 0 && !(prev && prev.balloon.visited)) v.balloon.visited = false; // niet op volgorde: telt niet
      else reward(G.x, G.y - 60, v.balloon.step === SPACE_PATH - 1 ? 'Laatste ballon! Laat los!' : `Ballonpad ${v.balloon.step + 1}/${SPACE_PATH}`, 3, '#ffe46b');
    } else reward(G.x, G.y - 60, 'Luchtballon!', 5, '#ffe46b');
  }
  // beloning voor een mooie sprong
  else if (game.mode === 'playing' && v !== G.lastVine) {
    if (airT > 1.5 && dx > 900) reward(G.x, G.y - 60, 'ENORME SPRONG!', 5, '#ffe46b');
    else if (airT > 1.0 && dx > 550) reward(G.x, G.y - 60, 'Mooie sprong!', 2, '#ffffff');
  }
}
function reward(x, y, txt, bonus, col) {
  run.earned += bonus;
  floatText(x, y, `${txt} +${bonus}🍎`, col, 24);
  starBurst(x, y, 12, '#ffe46b');
  Sfx.bigjump();
}
// de wereld van Kiwi (die wordt niet getekend): geen losse geluidjes voor dingen die je niet ziet
function aiWorld() { return !!(game.mp && game.mp.local && LOCAL.ai && game.mp.idx === 1); }
// voluntary = de speler liet zelf los (niet weggegleden of een gebroken liaan)
function release(voluntary = true) {
  if (G.state !== 'hang') return;
  const v = G.vine;
  const m = launchM(lvl('launch'));
  freeHand(v, G.k);
  // Bij verkeerde timing (te lang vastgehouden, verkeerde kant van de zwaai) zou je hier kaarsrecht
  // omhoog of pal achteruit gelanceerd worden. Dat verspilt de hele zwaai en voelt onterecht, dus zo'n
  // uitschieter wordt teruggebogen naar een bruikbare, voorwaartse sprong. Een normale (ook steile)
  // sprong blijft ongemoeid.
  const sp0 = Math.hypot(G.vx, G.vy);
  if (sp0 > 70) {
    if (G.vx < 0) G.vx *= 0.4; // vol achteruit: fors afgezwakt
    const sp1 = Math.hypot(G.vx, G.vy);
    const vert = sp1 > 1 ? Math.abs(G.vy) / sp1 : 0; // 0 = helemaal horizontaal, 1 = kaarsrecht op/neer
    if (vert > 0.82) { // pas voorbij zo'n 55° buigen we bij; een stevige, steile sprong blijft mogelijk
      const t = (vert - 0.82) / 0.18, steer = Math.abs(G.vy) * t * 0.55;
      G.vx += steer;
      G.vy -= Math.sign(G.vy) * steer * 0.75;
    }
  }
  let vx = G.vx * m, vy = G.vy * m;
  if (vx > 0) vx += 60 + 20 * lvl('launch');
  vy -= 50;
  const playing = game.mode === 'playing';
  if (playing && voluntary && v.type === 'turbo') {
    vx = vx * 1.6 + 280; vy = vy * 1.3 - 180;
    G.turboT = 1.6;
    floatText(G.x, G.y - 55, 'TURBO!', '#ffd23f', 26);
    starBurst(G.x, G.y, 16, '#ffd23f');
    shake(5, 0.25);
    Sfx.turbo();
  }
  if (playing && voluntary && v.type === 'elastic') Sfx.boingy();
  // de allereerste sprong krijgt extra kracht, zodat je meteen vaart hebt
  if (playing && voluntary && run.firstJump) {
    run.firstJump = false;
    vx = Math.max(vx, 0) * 1.15 + 300; vy = Math.min(vy, 0) - 250;
    floatText(G.x, G.y - 60, 'Daar gaat ie!', '#ffffff', 26);
    starBurst(G.x, G.y, 18, '#ffe46b');
    shake(4, 0.2);
  }
  G.vx = vx; G.vy = vy;
  G.lastVine = v; G.releaseT = 0.3; G.vine = null; G.state = 'air'; G.airT = 0; G.airX = G.x; G.slack = false;
  if (playing && voluntary && v.balloon && v.balloon.path) checkSpaceLaunch(v);
  if (playing) {
    Sfx.release();
    for (let i = 0; i < 5; i++) addPart({ x: G.x, y: G.y + 10, vx: -vx * rand(0.05, 0.2) + rand(-40, 40), vy: rand(-40, 40), life: 0.4, max: 0.4, col: 'rgba(255,255,255,.6)', r: rand(3, 6), g: 0 });
    // WOOHOO! bij een flinke zwaai (niet vaker dan eens per 0,7 s)
    if (voluntary && Math.hypot(vx, vy) > 380 && time - run.lastWoo > 0.7) { run.lastWoo = time; Sfx.woohoo(); }
  }
}
// Sprong vanaf de startrots naar de eerste liaan
function jump() {
  G.state = 'air'; G.vx = 690; G.vy = -770; G.airT = 0; G.airX = G.x; G.noDive = true; G.lastVine = null;
  floatText(G.x, G.y - 60, 'Hup!', '#ffffff', 26);
  for (let i = 0; i < 10; i++) addPart({ x: G.x + rand(-14, 14), y: ROCK.top, vx: rand(-120, 60), vy: rand(-120, -20), life: 0.5, max: 0.5, col: 'rgba(210,190,160,.8)', r: rand(3, 6), g: 300 });
  Sfx.jump();
}
// ---- Portalen (Portaalwoud) ----
const PORTAL_RY = 78, PORTAL_RX = 24;
// het portaal als lijnstuk (voor de ruimte-check met lianen); a = richting waarin je eruit komt
function portalSeg(x, y, a) { const dx = Math.sin(a) * PORTAL_RY, dy = -Math.cos(a) * PORTAL_RY; return [x - dx, y - dy, x + dx, y + dy]; }
// "speedy thing goes in, speedy thing comes out": je vaart blijft behouden, alleen de richting verandert
function enterPortal(P) {
  const ox = G.x, oy = G.y;
  const sp = Math.max(Math.hypot(G.vx, G.vy), 780) * 1.05;
  const inA = clamp(Math.atan2(G.vy, G.vx), -0.6, 0.6);
  const outA = P.oa + inA * 0.35;
  const off = clamp(G.y - P.by, -PORTAL_RY, PORTAL_RY) * 0.5; // waar je het portaal raakte, schuift mee
  G.x = P.ox + Math.cos(P.oa) * 26 - Math.sin(P.oa) * off; G.y = P.oy + Math.sin(P.oa) * 26 + Math.cos(P.oa) * off;
  G.vx = Math.cos(outA) * sp; G.vy = Math.sin(outA) * sp;
  G.airT = 0.3; G.airX = G.x; G.noDive = false; G.dive = 0; G.diveT = 0; G.releaseT = 0;
  // de camera verschuift mee, zodat Andy op dezelfde plek in beeld blijft
  camX += G.x - ox; lastCamX += G.x - ox; camY += G.y - oy; bgStale = true;
  P.used = time;
  for (let i = 0; i < 18; i++) {
    const a = rand(0, 6.28);
    addPart({ x: P.bx + Math.cos(a) * PORTAL_RX, y: P.by + Math.sin(a) * PORTAL_RY, vx: rand(-80, 40), vy: rand(-60, 60), life: 0.5, max: 0.5, col: '#5cc8ff', r: rand(2, 4), g: 0 });
    addPart({ x: G.x, y: G.y, vx: Math.cos(outA + rand(-0.8, 0.8)) * rand(100, 380), vy: Math.sin(outA + rand(-0.8, 0.8)) * rand(100, 380), life: 0.55, max: 0.55, col: i % 2 ? '#ff9a2a' : '#ffd08a', r: rand(2, 5), g: 0 });
  }
  if (game.mode === 'playing') { reward(G.x, G.y - 60, 'Portaal!', 2, '#ffb14a'); Sfx.portal(); }
}
function snapVine(v) {
  v.anchored = false; v.pts[0].im = 1;
  const q = v.pts[1];
  for (let i = 0; i < 14; i++) addPart({ type: 'leaf', x: q.x, y: q.y, vx: rand(-200, 200), vy: rand(-250, 50), life: rand(0.6, 1), max: 1, col: i % 2 ? '#7b5b36' : '#9a7a4a', r: rand(3, 5), rot: rand(0, 6), vr: rand(-10, 10) });
  floatText(G.x, G.y - 50, 'Krak!', '#ffd6a0');
  Sfx.crack();
  release(false);
}
// extra = gekochte head-start in meters (bovenop de Raketstart-upgrade). Een lange vlucht gaat sneller,
// zodat hij nooit veel langer dan een paar seconden duurt.
function startRocket(extra = 0) {
  run.firstJump = false;
  if (G.state === 'hang') { freeHand(G.vine, G.k); G.lastVine = G.vine; G.releaseT = 1; G.vine = null; }
  G.state = 'rocket';
  const dist = rocketDist(lvl('rocket')) + extra;
  G.rocketEnd = START_X + dist * PX_PER_M;
  G.y = ROCK.top - FEET - 30;
  G.vx = clamp(dist * PX_PER_M / 4, 1500, 9000); G.vy = 0;
  floatText(G.x, G.y - 60, extra ? `Head-start: ${extra} m! 🚀` : 'Raketstart! 🚀', '#ffe07a', 24);
  Sfx.rocket();
  if (extra) { Sfx.turbo(); confetti(G.x, G.y - 30, 40); shake(5, 0.3); }
}
function hitHazard() {
  if (G.balloons > 0) {
    G.balloons--;
    G.y = HAZARD_Y - G_R; G.vy = -1400; G.vx = Math.max(G.vx, 420);
    G.balloonT = 1.4; G.invuln = Math.max(G.invuln, 0.8);
    splash(G.x, 14);
    floatText(G.x, G.y - 70, 'Gered! 🎈', '#ffffff', 24);
    Sfx.balloon();
  } else die();
}
// Vijanden kunnen Andy NOOIT laten vallen of doodgaan: ze stelen alleen appels.
function hitFoe(f) {
  if (G.invuln > 0 || G.state === 'rocket' || f.done) return;
  f.done = true;
  G.invuln = 1.4;
  if (G.helmets > 0) {
    G.helmets--;
    starBurst(f.x, f.y, 14, '#ffffff');
    floatText(G.x, G.y - 55, 'Helm! ⛑️', '#ffffff', 22);
    Sfx.shield();
  } else {
    const have = Math.floor(run.earned);
    const lose = Math.min(have, 3 + BIOMES[f.bi].bonus * 2 | 0);
    if (lose > 0) {
      run.earned -= lose; run.stolen += lose;
      // de appels vliegen weg en kun je nog terugpakken
      for (let i = 0; i < lose; i++) apples.push({ x: G.x, y: G.y, vx: rand(-260, 260), vy: rand(-520, -220), loose: true, grace: 0.45, gold: false, t: 0 });
      floatText(G.x, G.y - 55, `-${lose} 🍎`, '#ff8080', 24);
    } else floatText(G.x, G.y - 55, 'Hé!', '#ff8080', 22);
    Sfx.steal();
  }
  // de vijand maakt zich uit de voeten
  f.fleeT = 0;
}
function die() {
  if (G.state === 'dead') return;
  if (game.mp) { // multiplayer: geen game over; race = terug op een liaan, endurance = af
    if (G.state === 'hang') { freeHand(G.vine, G.k); G.vine = null; }
    G.state = 'dead'; G.deadT = 0; G.trick = null; G.trickRot = 0;
    G.vx *= 0.25; G.vy = Math.min(G.vy, 200);
    splash(G.x, 30); Sfx.splash(); shake(7, 0.35);
    if (game.mode === 'playing') mpDied();
    return;
  }
  if (game.mode === 'done') { // al gefinisht: gewoon een plons, geen game over
    if (G.state === 'hang') { freeHand(G.vine, G.k); G.vine = null; }
    G.state = 'dead'; G.deadT = 0; splash(G.x, 20); return;
  }
  if (G.state === 'hang') { freeHand(G.vine, G.k); G.vine = null; }
  G.state = 'dead'; game.mode = 'dying'; run.reason = 'fall'; G.deadT = 0;
  G.vx *= 0.25; G.vy = Math.min(G.vy, 200);
  G.splashed = true; splash(G.x, 30); Sfx.splash(); shake(7, 0.35);
}

// =====================================================================
//  Update
// =====================================================================
function step(dt) {
  stepNo++;
  if (G) { G.is = stepNo; G.ix = G.x; G.iy = G.y; G.ihx = G.hx; G.ihy = G.hy; G.ihang = G.state === 'hang' ? G.vine : null; G.ia = G.angle; G.itr = G.trickRot || 0; }
  time += dt;
  const forced = game.mode === 'menu' || game.mode === 'ready' || game.mode === 'done' || game.mode === 'mpcount' || game.mode === 'mpend' || game.holdLock;
  const holdHang = forced || (game.mode === 'playing' && input.down);
  const holdAir = game.mode === 'playing' && input.down;

  if (G.state === 'hang') swingStep(G.vine, dt);
  // alleen lianen in (de buurt van) beeld worden gesimuleerd
  const x0 = camX - 500, x1 = camX + viewW + 500, y0 = camY - 450, y1 = camY + viewH + 450;
  for (const v of vines) {
    // ook de liaan waar de tegenstander aan hangt (ghostPin): anders hangt die er buiten beeld bevroren bij
    if (v === G.vine || v === ghostPin.v || (v.x > x0 && v.x < x1 && v.ay < y1 && v.rest[3] > y0 - 200)) simVine(v, dt);
  }

  updateGorilla(dt, holdHang, holdAir);
  updateParrot(dt);
  updateFoes(dt);
  updateApples(dt);
  for (const s of shrooms) s.sq *= Math.pow(0.02, dt);
  for (const t of tramps) t.sq *= Math.pow(0.03, dt);
  if (tramps.length && tramps[0].x < camX - 400) tramps.shift();
  if (portals.length && portals[0].ox < camX - 700) portals.shift();
  updateSpace(dt);
  if (game.mp) mpStep(dt);
}

function updateGorilla(dt, holdHang, holdAir) {
  G.invuln = Math.max(0, G.invuln - dt);
  G.balloonT = Math.max(0, G.balloonT - dt);
  G.turboT = Math.max(0, G.turboT - dt);
  G.releaseT -= dt;
  const playing = game.mode === 'playing';

  if (G.state === 'hang') {
    const v = G.vine, p = v.pts;
    G.diving = false;
    // omlaag glijden na een grijp te hoog aan de liaan
    const moveHand = nk => { freeHand(v, G.k); G.k = nk; G.R0 = G.k * SEG_LEN + ARM_LEN; };
    if (G.k < G.slideTo) {
      G.slideT += dt;
      while (G.slideT > 0.016 && G.k < G.slideTo) {
        G.slideT -= 0.016; moveHand(G.k + 1);
        if (Math.random() < 0.5) addPart({ type: 'leaf', x: G.hx, y: G.hy, vx: rand(-60, 60), vy: rand(-60, 10), life: 0.5, max: 0.5, col: v.leaf, r: 3, rot: rand(0, 6), vr: 6, g: 300 });
      }
    }
    G.angle = Math.atan2(G.hx - G.x, -(G.hy - G.y));
    G.moveHand = moveHand;
    if (!holdHang) release();
    else if (playing) {
      G.hangT += dt;
      // zwaaigeluid: een zoef bij elke doorgang door het laagste punt (niet voor Kiwi, die zie je meestal niet)
      const side = Math.sign(Math.sin(G.th));
      if (side && G.swSide && side !== G.swSide && !G.slack && !aiWorld()) Sfx.swing(Math.abs(G.om * G.R), G.om > 0);
      if (side) G.swSide = side;
      if (v.type === 'rotten') {
        if (G.hangT > v.snapAt) snapVine(v);
        else if (G.hangT > v.snapAt - 0.45 && Math.random() < 0.3) addPart({ x: p[1].x, y: p[1].y, vx: rand(-40, 40), vy: 0, life: 0.6, max: 0.6, col: '#7b5b36', r: 2.5 });
      } else if (v.type === 'icy') {
        // ijs is spiegelglad: Andy glijdt continu omlaag
        G.iceT += dt;
        if (G.iceT > 0.1 * (1 + 0.5 * lvl('vinewise'))) {
          G.iceT = 0;
          if (G.k < p.length - 1) {
            G.moveHand(G.k + 1);
            addPart({ type: 'star', x: G.hx, y: G.hy, vx: rand(-60, 60), vy: rand(-60, 0), life: 0.4, max: 0.4, col: '#ffffff', r: 3, rot: 0, vr: 5 });
          } else {
            release(false);
            floatText(G.x, G.y - 50, 'Weggegleden!', '#d8f3ff');
          }
        }
      } else if (v.type === 'turbo' && Math.random() < 0.3) {
        addPart({ type: 'star', x: G.x + rand(-10, 10), y: G.y + rand(-10, 10), vx: rand(-40, 40), vy: rand(-80, -20), life: 0.5, max: 0.5, col: '#ffd23f', r: 3, rot: 0, vr: 6, g: 0 });
      }
    }
  } else if (G.state === 'stand') {
    G.vx = 0; G.vy = 0; G.angle *= 0.85; G.diving = false; G.standT += dt;
    // opnieuw springen vanaf de rots (met een nieuwe druk op de knop)
    if (playing && input.down && input.presses !== G.standPress) jump();
  } else if (G.state === 'air') {
    const sp0 = Math.hypot(G.vx, G.vy); // vaart vóór de krachten van deze stap (voor de topsnelheid hieronder)
    G.airT += dt;
    if (G.noDive && G.airT > 1.2) G.noDive = false;
    // duiken: meteen merkbaar (een duw omlaag en een zoef), en hoe langer je vasthoudt, hoe harder
    const diveHold = holdAir && !G.noDive;
    if (diveHold && G.diveT === 0) {
      G.vy = Math.max(G.vy + 260, Math.min(G.vy, 0) + 320);
      Sfx.dive();
      for (let i = 0; i < 6; i++) addPart({ type: 'streak', x: G.x + rand(-14, 14), y: G.y - rand(10, 30), vx: 0, vy: -rand(200, 400), life: 0.25, max: 0.25, col: 'rgba(255,255,255,.8)', r: 2.5, g: 0 });
    }
    G.diveT = diveHold ? G.diveT + dt : 0;
    const e = diveHold ? 0.45 + 0.55 * clamp(G.diveT / 0.35, 0, 1) : 0;
    G.dive += (e - G.dive) * Math.min(1, dt * (diveHold ? 30 : 12));
    G.diving = G.dive > 0.25;
    const falling = G.vy > 0 && G.dive < 0.1, wing = lvl('wingsuit');
    const glide = falling ? 1 - 0.07 * wing : 1;
    const space = run.space && G.y < SPACE_Y;
    G.vy += AIR_G * glide * (space ? 0.45 : 1) * (1 + 2.8 * G.dive) * dt;
    // ook zonder wingsuit-upgrade drijft Andy een klein beetje naar voren: zo kom je nooit hulpeloos
    // recht naar beneden vast te zitten tussen twee lianen in
    G.vx += 55 * dt;
    // wingsuit: een deel van de valsnelheid wordt voorwaartse vaart
    if (wing && falling && G.vx > 0) { const dv = Math.min(G.vy, 700) * 0.32 * wing * dt; G.vy -= dv; G.vx += dv * 0.85; }
    const maxFall = MAX_FALL * glide * (1 + 1.1 * G.dive);
    if (G.vy > maxFall) G.vy += (maxFall - G.vy) * Math.min(1, dt * 6);
    G.vx -= G.vx * 0.015 * dt;
    const sp = Math.hypot(G.vx, G.vy), maxS = maxSpeed() * (G.turboT > 0 ? 1.4 : 1) * (space ? 1.3 : 1) * (1 + 0.5 * G.dive); // duiken remt je voorwaartse vaart niet af
    // Boven de topsnelheid: een overschot dat je meekreeg (goed getimede zwaai, turbo, trampoline) ebt snel
    // weg (~0,3 s) in plaats van er meteen af te gaan, zodat het heel even echt sneller voelt. Zwaartekracht
    // en duiken tijdens de vlucht kunnen het plafond niet verhogen: anders blijf je bij elke val te snel.
    G.maxS = maxS;
    if (sp > maxS) {
      const to = Math.min(sp, maxS + Math.max(0, sp0 - maxS) * Math.exp(-3.5 * dt), maxS * 1.5);
      G.vx *= to / sp; G.vy *= to / sp;
    }
    const prevFeet = G.y + FEET, prevX = G.x;
    G.x += G.vx * dt; G.y += G.vy * dt;
    for (const P of portals) { // door de voorkant van een blauw portaal vliegen
      if (G.vx > 0 && prevX < P.bx && G.x >= P.bx && Math.abs(G.y - P.by) < PORTAL_RY - 6) { enterPortal(P); break; }
    }
    if (G.x < WALL_X) { G.x = WALL_X; G.vx = Math.abs(G.vx) * 0.4; }
    // de startrots is massief: erop landen of ertegen botsen
    if (G.x > ROCK.x0 - 10 && G.x - G_R * 0.6 < ROCK.x1) {
      if (G.vy > 0 && prevFeet <= ROCK.top + 4 && G.y + FEET >= ROCK.top) {
        G.y = ROCK.top - FEET; G.state = 'stand'; G.vx = 0; G.vy = 0; G.standPress = input.presses;
        addPart({ type: 'ring', x: G.x, y: ROCK.top, vx: 0, vy: 0, life: 0.35, max: 0.35, col: 'rgba(255,255,255,.7)', r: 8, grow: 30, g: 0, flat: true });
      } else if (G.y + FEET > ROCK.top + 6) { G.x = ROCK.x1 + G_R * 0.6; G.vx = Math.abs(G.vx) * 0.3; }
    }
    const target = clamp(G.vx * 0.0004 + G.dive * 0.6 + clamp(G.vy * 0.0003, -0.2, 0.3), -0.7, 1.1);
    G.angle += (target - G.angle) * Math.min(1, dt * 8);
    updateTrick(dt, holdAir);
    // lucht-trampolines
    for (const t of tramps) {
      const ty = t.y + Math.sin(time * 1.5 + t.ph) * 6;
      // raak je hem van welke kant dan ook, dan schiet hij je omhoog (korte pauze zodat hij niet dubbel afgaat)
      const dx = (G.x - t.x) / (t.w / 2 + G_R), dy = (G.y - ty) / (G_R + 26);
      if (time > (t.cd || 0) && dx * dx + dy * dy < 1) {
        t.cd = time + 0.4;
        if (G.y > ty - FEET) G.y = Math.min(G.y, ty + 10);
        G.vy = -Math.max(1350, Math.abs(G.vy) * 1.1) * (1 + 0.05 * lvl('shroom')); G.vx = Math.max(Math.abs(G.vx), 560); t.sq = 1;
        G.airT = 0.35; G.airX = G.x; G.noDive = false;
        floatText(t.x, ty - 40, 'Boing!', '#ffffff', 24);
        starBurst(t.x, ty, 10, '#7fd3ff');
        Sfx.tramp(); shake(3, 0.12);
      }
    }
    // snelheidsspoor: pas bij echte vaart, en dichter naarmate je harder gaat (of boven de topsnelheid schiet)
    const fast = (sp - maxSpeed() * 0.8) / (maxSpeed() * 0.4);
    if (fast > 0 && Math.random() < Math.min(1, 0.25 + fast)) addPart({ type: 'streak', x: G.x + rand(-12, 12), y: G.y + rand(-14, 14), vx: G.vx * 0.2, vy: G.vy * 0.2, life: 0.25, max: 0.25, col: 'rgba(255,255,255,.7)', r: 2, g: 0 });
    if (G.turboT > 0) addPart({ x: G.x - G.vx * 0.02, y: G.y - G.vy * 0.02, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.35, max: 0.35, col: Math.random() < 0.5 ? '#ffd23f' : '#ff8a1a', r: rand(3, 6), g: 0 });
    if (holdAir) tryGrab();
    if (G.state === 'air') {
      for (const s of shrooms) {
        if (G.vy > 0 && Math.abs(G.x - s.x) < s.w / 2 + 14 && prevFeet <= SHROOM_TOP + 10 && G.y + FEET >= SHROOM_TOP) {
          const sl = lvl('shroom');
          G.y = SHROOM_TOP - FEET; G.vy = -rand(1250, 1350) * (1 + 0.07 * sl); G.vx = Math.max(G.vx, 380 + 70 * sl); s.sq = 1;
          floatText(s.x, SHROOM_TOP - 40, 'Boing!', '#ffffff', 24);
          starBurst(s.x, SHROOM_TOP, 10, BIOMES[s.bi].shroom);
          Sfx.boing(); shake(3, 0.15);
        }
      }
      if (G.y + G_R * 0.5 > HAZARD_Y) hitHazard();
    }
  } else if (G.state === 'rocket') {
    G.x += G.vx * dt;
    let sum = 0, cnt = 0;
    for (const v of vines) if (v.anchored && v.x > G.x + 150 && v.x < G.x + 700) { sum += v.pts[v.pts.length - 1].y; cnt++; }
    if (cnt) G.rocketY = clamp(sum / cnt - 40, CEIL_Y + 150, HAZARD_Y - 250);
    const ty = G.rocketY || 260; G.vy = (ty - G.y) * 2.5; G.y += G.vy * dt;
    G.angle += (0 - G.angle) * Math.min(1, dt * 6);
    addPart({ x: G.x - 40, y: G.y + 22 + rand(-4, 4), vx: -rand(200, 500), vy: rand(-60, 60), life: 0.4, max: 0.4, col: Math.random() < 0.5 ? '#ffb020' : '#ff5a1f', r: rand(4, 8), g: 0 });
    if (G.x >= G.rocketEnd) {
      G.state = 'air'; G.vx = 800; G.vy = -300; G.invuln = 0.8; G.airT = 0; G.airX = G.x;
      burst(G.x - 30, G.y + 20, 16, '#bbbbbb', 250, 5);
    }
  } else if (G.state === 'dead') {
    G.deadT += dt;
    G.vy += AIR_G * dt;
    if (G.y > HAZARD_Y) { G.vy = Math.min(G.vy, 70); G.vx *= Math.pow(0.1, dt); }
    G.x += G.vx * dt; G.y += G.vy * dt; G.angle += G.spin * dt;
    if (G.deadT > 1.3 && game.mode === 'dying') gameOver();
  }

  if (playing && G.state !== 'dead' && game.career && G.x >= game.career.finishX) levelComplete();
  if (playing && G.state !== 'dead' && game.mp && game.mp.finishX && G.x >= game.mp.finishX) mpFinished();
  if (playing && G.state !== 'dead') {
    run.dist = Math.max(run.dist, (G.x - START_X) / PX_PER_M);
    if (run.dist >= run.nextMile) {
      floatText(G.x, G.y - 80, `${run.nextMile} m!`, '#ffffff', 30);
      confetti(G.x, G.y - 40, 30);
      Sfx.milestone();
      run.nextMile += 100;
      const rain = lvl('rain');
      if (rain) { // appelregen
        const gc = goldChance(lvl('golden'));
        for (let i = 0; i < 3 + rain * 3; i++) apples.push({ x: G.x + rand(120, 620), y: camY - rand(20, 260), rel: rand(120, 620), vy: rand(40, 140), rain: true, gold: Math.random() < gc, t: 0 });
        floatText(G.x + 200, G.y - 110, 'Appelregen! 🌧️', '#bfe6ff', 24);
      }
    }
    const bi = biomeIndexAt(run.dist);
    if (bi > run.biome && !game.career) {
      run.biome = bi; Music.biome = bi;
      const b = BIOMES[bi];
      showBanner(b.name, `Elke appel ×${fmtNum(applesPerPick(bi))}`);
      floatText(G.x, G.y - 70, '🍎 Appels meer waard!', '#ffe46b', 24);
      confetti(G.x + 200, G.y - 200, 90);
      flashT = 0.35;
      if (!aiWorld()) Sfx.biome(bi);
    }
  }
}

function updateFoes(dt) {
  const alive = G.state === 'hang' || G.state === 'air';
  for (let i = foes.length - 1; i >= 0; i--) {
    const f = foes[i];
    if (f.x < camX - 400 || (f.fleeT !== undefined && f.fleeT > 2.5)) { foes.splice(i, 1); continue; }
    if (f.fleeT !== undefined) { // wegvluchten na een diefstal
      f.fleeT += dt; f.x += 260 * dt; f.y -= 320 * dt; f.t = (f.t || 0) + dt;
      continue;
    }
    if (f.type === 'wasp') {
      f.t += dt;
      f.x = f.x0 + Math.sin(f.t * 1.4) * f.ax;
      f.y = f.y0 + Math.sin(f.t * 2.3) * f.ay;
    } else if (f.type === 'fire') {
      if (f.wait > 0) { f.wait -= dt; f.y = HAZARD_Y + 40; if (f.wait <= 0) { f.vy = -rand(1000, 1450); splash(f.x, 5, true); } }
      else {
        f.vy += GRAVITY * 0.8 * dt; f.y += f.vy * dt;
        if (f.y > HAZARD_Y + 40 && f.vy > 0) { f.wait = rand(0.7, 1.7); f.done = false; }
        if (Math.random() < 0.5) addPart({ x: f.x + rand(-6, 6), y: f.y + rand(-6, 6), vx: rand(-30, 30), vy: -f.vy * 0.1, life: 0.35, max: 0.35, col: f.bi >= 5 ? '#7fd0ff' : '#ffb020', r: rand(2, 5), g: 0 });
      }
    } else if (f.type === 'bird') {
      f.t += dt;
      if (!f.active && f.x < camX + viewW + 450) f.active = true;
      if (f.active) f.x += f.vx * dt;
      f.y = f.y0 + Math.sin(f.t * 3) * 18;
    }
    if (alive && game.mode === 'playing' && !f.done) {
      if (f.type === 'fire' && f.wait > 0) continue;
      const dx = f.x - G.x, dy = f.y - G.y, rr = f.r + G_R * 0.8;
      if (dx * dx + dy * dy < rr * rr) {
        hitFoe(f);
        if (f.type === 'fire') { delete f.fleeT; } // vuurbal vliegt gewoon door
      }
    }
  }
}

function updateApples(dt) {
  const mr = magnetR(lvl('magnet'));
  const alive = game.mode === 'playing' && (G.state === 'hang' || G.state === 'air' || G.state === 'rocket');
  for (let i = apples.length - 1; i >= 0; i--) {
    const a = apples[i];
    a.t += dt;
    if (a.x < camX - 250) { apples.splice(i, 1); continue; }
    if (a.vine) { const q = a.vine.pts[a.idx]; a.x = q.x + 9; a.y = q.y + 4; }
    if (a.rain) { // de regen vliegt met Andy mee (ook op topsnelheid) en komt langzaam naar hem toe
      a.rel = Math.max(0, a.rel - 170 * dt); a.x += (G.x + a.rel - a.x) * Math.min(1, dt * 4); a.vy = Math.min(a.vy + 220 * dt, 260); a.y += a.vy * dt; if (a.y > HAZARD_Y + 20) { apples.splice(i, 1); continue; } }
    if (a.loose) { // weggeslagen appels vallen naar beneden
      a.grace -= dt; a.vy += GRAVITY * 0.7 * dt; a.x += a.vx * dt; a.y += a.vy * dt;
      if (a.y > HAZARD_Y + 20) { apples.splice(i, 1); continue; }
      if (a.grace > 0) continue;
    }
    if (!alive) continue;
    const dx = G.x - a.x, dy = G.y - a.y, d = Math.hypot(dx, dy);
    if (d < G_R + 16) { collect(a); apples.splice(i, 1); continue; }
    if (mr && d < mr) { const s = Math.min(d, (520 + (mr - d) * 6) * dt); a.x += dx / d * s; a.y += dy / d * s; if (a.vine) a.vine = null; }
  }
}
function collect(a) {
  run.combo = time - run.lastPick < comboWin(lvl('combo')) ? run.combo + 1 : 1;
  run.lastPick = time;
  let val;
  if (a.loose) val = 1; // teruggepakte appel
  else {
    const n = a.gold ? 5 : 1;
    run.picked += n;
    if (a.gold) run.golden++;
    val = n * applesPerPick(biomeIndexAt((a.x - START_X) / PX_PER_M));
  }
  run.earned += val;
  starBurst(a.x, a.y, a.gold ? 12 : 6, a.gold ? '#ffd23f' : '#ff6b5b');
  addPart({ type: 'ring', x: a.x, y: a.y, vx: 0, vy: 0, life: 0.3, max: 0.3, col: a.gold ? 'rgba(255,220,80,.9)' : 'rgba(255,255,255,.8)', r: 8, grow: 22, g: 0 });
  floatText(a.x, a.y - 16, '+' + fmtNum(val), a.gold ? '#ffe46b' : '#ffffff', a.gold ? 22 : 18);
  Sfx.apple(a.gold, run.combo);
  if (run.combo >= 10 && run.combo % 10 === 0) {
    const bonus = run.combo / 2 * (1 + lvl('combo'));
    run.earned += bonus;
    floatText(G.x, G.y - 70, `Combo ×${run.combo}! +${bonus}🍎`, '#ffe46b', 26);
    confetti(G.x, G.y - 30, 24);
    Sfx.combo();
  }
}

const maxSpeed = () => 1600 + 130 * lvl('launch'); // topsnelheid in de lucht: ruimte om momentum op te bouwen
// ---- Trucs: bij een lange luchtvlucht doet Andy vanzelf salto's en andere kunstjes ----
const TRICKS = [
  { id: 'salto', name: 'Salto!', dur: 0.62, rot: -Math.PI * 2 },
  { id: 'back', name: 'Achterwaartse salto!', dur: 0.7, rot: Math.PI * 2 },
  { id: 'screw', name: 'Kurkentrekker!', dur: 0.7, rot: 0 },
  { id: 'star', name: 'Sterrensprong!', dur: 0.55, rot: 0 },
  { id: 'super', name: 'Superaap!', dur: 0.65, rot: 0 },
];
function updateTrick(dt, holdAir) {
  if (game.mode !== 'playing') return;
  if (G.trick) {
    if (G.dive > 0.3) { G.trick = null; G.trickRot = 0; return; } // duiken breekt de truc af
    G.trickT += dt;
    const k = Math.min(1, G.trickT / G.trick.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    G.trickRot = G.trick.rot * e;
    if (k >= 1) {
      G.chain++; run.tricks++;
      const bonus = 2 * G.chain;
      run.earned += bonus;
      floatText(G.x, G.y - 60, `${G.chain > 1 ? G.chain + '× ' : ''}${G.trick.name} +${bonus}🍎`, '#ffe46b', 22 + Math.min(8, G.chain * 2));
      starBurst(G.x, G.y, 10 + G.chain * 3, '#ffe46b');
      Sfx.trick(G.chain);
      G.trick = null; G.trickRot = 0; G.trickCool = 0.12;
    }
    return;
  }
  G.trickCool = (G.trickCool || 0) - dt;
  const needT = G.chain ? 0 : 0.5;
  if (G.airT > needT && G.trickCool <= 0 && !holdAir && G.dive < 0.1 && !G.noDive && Math.hypot(G.vx, G.vy) > 300) {
    // is er genoeg tijd voordat Andy een liaan raakt? (grof: niet te dicht boven de bodem)
    if (G.y < HAZARD_Y - 220) { G.trick = TRICKS[(Math.random() * TRICKS.length) | 0]; G.trickT = 0; }
  }
}
// ---- Ruimte ----
// Een ballonpad (SPACE_PATH gouden ballonnen op volgorde) lanceert Andy de ruimte in. Daar is bijna geen zwaartekracht,
// hangen sterrenlianen aan zwevende planetoïden, kun je van losse planetoïden stuiteren en vliegt er een ufo rond.
const SPACE_PATH = 3, SPACE_Y = -3000, SPACE_G = 0.6;
function checkSpaceLaunch(v) {
  const b = v.balloon;
  // alleen als alle ballonnen van dit pad op volgorde zijn gepakt
  const path = vines.filter(w => w.balloon && w.balloon.path === b.path).sort((p, q) => p.balloon.step - q.balloon.step);
  if (b.step !== SPACE_PATH - 1 || !path.every(w => w.balloon.visited)) return;
  G.vx = Math.max(G.vx, 700); G.vy = -1750; G.turboT = 1.5; G.noDive = true; G.airT = 0; run.launchT = 6;
  floatText(G.x, G.y - 70, 'LANCERING! 🚀', '#ffe46b', 30);
  confetti(G.x, G.y, 60); shake(8, 0.4); Sfx.rocket(); Sfx.turbo();
}
// Ruimtelianen horen niet bij de (gedeelde) wereld: ze krijgen een negatief id, gebruiken Math.random en laten
// vineSeq en genRandom ongemoeid, zodat de wereld van andere spelers met dezelfde seed gelijk blijft.
let spaceVineId = -1;
function addSpaceVine(x, ay) {
  const sr = genRandom, sq = vineSeq;
  genRandom = Math.random;
  let v;
  try { v = makeVine(x, ay, rand(260, 340), 'space', run.biome); } finally { genRandom = sr; vineSeq = sq; }
  v.id = spaceVineId--; v.space = { r: rand(26, 38), ph: rand(0, 6), col: ['#8a7f9e', '#9e8a7a', '#7a8a9e'][(Math.random() * 3) | 0] };
  vines.push(v);
}
function spawnSpace() {
  const x0 = G.x, y0 = G.y;
  // sterrenlianen aan zwevende planetoïden, in een golvend spoor vooruit
  for (let i = 0; i < 12; i++) addSpaceVine(x0 + 350 + i * 430 + rand(-40, 40), y0 - 330 - Math.sin(i * 0.9) * 180 - rand(0, 120));
  // losse planetoïden om van te stuiteren
  for (let i = 0; i < 7; i++) spaceObjs.push({ type: 'rock', x: x0 + 600 + i * 700 + rand(-100, 100), y: y0 - rand(0, 900), r: rand(34, 56), ph: rand(0, 6), spin: rand(-0.6, 0.6), cd: 0 });
  // een ufo die met je meevliegt (aanraken = bonus) en een paar satellieten
  spaceObjs.push({ type: 'ufo', x: x0 + 900, y: y0 - 500, t: 0, done: false });
  for (let i = 0; i < 3; i++) spaceObjs.push({ type: 'sat', x: x0 + 1200 + i * 1500 + rand(-200, 200), y: y0 - rand(200, 800), ph: rand(0, 6) });
}
function updateSpace(dt) {
  for (let i = spaceObjs.length - 1; i >= 0; i--) { // opruimen wat ver achter je ligt
    const o = spaceObjs[i];
    if (o.x < camX - 900 || (o.type === 'ufo' && o.t > 40)) spaceObjs.splice(i, 1);
  }
  if (game.mode !== 'playing') return;
  run.launchT = (run.launchT || 0) - dt;
  const inSpace = G.y < SPACE_Y - 200;
  if (inSpace && !run.space && run.launchT > 0) {
    run.space = true; run.spaceVisits++;
    run.earned += 25;
    showBanner('🚀 In de ruimte!', 'Slinger aan de sterrenlianen, stuiter op planetoïden en pak de sterappels! +25 🍎');
    confetti(G.x + 150, G.y - 100, 80); flashT = 0.4; Sfx.jingle(5);
    // sterappels (goud) in een grote boog vooruit
    for (let i = 0; i < 24; i++) { const t = i / 23; apples.push({ x: G.x + 250 + t * 2000, y: G.y - 250 - Math.sin(t * Math.PI) * 900 + t * 900, gold: true, t: Math.random() * 6 }); }
    spawnSpace();
  } else if (run.space && G.y > SPACE_Y + 400) {
    run.space = false;
    floatText(G.x, G.y - 60, 'Terug naar de jungle!', '#ffffff', 24);
  }
  const alive = G.state === 'air' || G.state === 'hang';
  for (const o of spaceObjs) {
    if (o.type === 'rock') {
      o.ph += o.spin * dt; o.cd -= dt;
      // stuiteren: je vliegt weg van het midden van de planetoïde, altijd een beetje naar voren
      const dx = G.x - o.x, dy = G.y - o.y, d = Math.hypot(dx, dy);
      if (G.state === 'air' && o.cd <= 0 && d < o.r + G_R * 0.9 && d > 1) {
        const nx = dx / d, ny = dy / d, sp = Math.max(900, Math.hypot(G.vx, G.vy) * 1.05);
        G.vx = Math.max(nx * sp, 520); G.vy = ny * sp; G.x = o.x + nx * (o.r + G_R); G.y = o.y + ny * (o.r + G_R);
        G.airT = 0.3; G.airX = G.x; G.noDive = false; o.cd = 0.35;
        floatText(o.x, o.y - o.r - 20, 'Boing!', '#e2d6ff', 22); starBurst(o.x + nx * o.r, o.y + ny * o.r, 10, '#c8b8ff');
        Sfx.tramp(); shake(3, 0.12);
      }
    } else if (o.type === 'ufo') {
      o.t += dt;
      // blijft een eind voor je uit zweven en schommelt op en neer; na een tijdje vliegt hij weg
      const tx = G.x + 520 + Math.sin(o.t * 0.7) * 160, ty = (o.t > 30 ? o.y - 400 * dt : Math.min(G.y - 140, SPACE_Y - 300) + Math.sin(o.t * 1.3) * 90);
      o.x += (tx - o.x) * Math.min(1, dt * (o.t > 30 ? 0 : 1.2)) + (o.t > 30 ? 900 * dt : 0); o.y += (ty - o.y) * Math.min(1, dt * 1.2);
      if (!o.done && alive && Math.hypot(G.x - o.x, G.y - o.y) < 70) {
        o.done = true; o.t = Math.max(o.t, 30);
        reward(o.x, o.y - 50, 'Buitenaards bezoek! 👽', 15, '#b6ff8a');
        confetti(o.x, o.y, 40);
      }
    } else o.ph += dt;
  }
}
// Papegaaimaatje: vliegt mee en plukt af en toe een appel in de buurt
function updateParrot(dt) {
  const B = G.parrot;
  if (!B) return;
  B.t += dt; B.cd -= dt;
  if (B.target && !apples.includes(B.target)) B.target = null;
  if (!B.target && B.cd <= 0 && game.mode === 'playing' && G.state !== 'dead') {
    let best = null, bd = 260;
    for (const a of apples) { if (a.loose && a.grace > 0) continue; const d = Math.hypot(a.x - G.x, a.y - G.y); if (d < bd && a.x > G.x - 60) { bd = d; best = a; } }
    B.target = best; if (!best) B.cd = 0.3;
  }
  if (B.target) {
    const dx = B.target.x - B.x, dy = B.target.y - B.y, d = Math.hypot(dx, dy), s = 950 * dt;
    if (d < 18) { const i = apples.indexOf(B.target); if (i >= 0) { apples.splice(i, 1); collect(B.target); } B.target = null; B.cd = parrotCd(lvl('parrot')); }
    else { B.x += dx / d * Math.min(d, s); B.y += dy / d * Math.min(d, s); }
  } else {
    const k = Math.min(1, dt * 7);
    B.x += (G.x - 38 - B.x) * k; B.y += (G.y - 62 + Math.sin(B.t * 3) * 6 - B.y) * k;
  }
}
