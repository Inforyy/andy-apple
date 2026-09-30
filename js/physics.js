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
    a.y = v.ay + Math.sin(time * 0.9 + b.bob) * (v.jet ? 4 : 12);
    a.px = a.x; a.py = a.y;
  }
  // de scheefhang-kracht werkt niet op de liaan waar Andy aan hangt: die zou zijn zwaai afremmen
  const wind = (Math.sin(time * 0.7 + v.phase) * 0.6 + Math.sin(time * 1.9 + v.phase * 2) * 0.4) * 60 + (hang ? 0 : v.jet ? JET_DRAG : brOn() ? 0 : VINE_TILT); // battle royale: lianen hangen recht (vrije richting) // achter een straaljager wappert de liaan ver naar achteren
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
  const g = (v.space ? GRAVITY * SPACE_G : GRAVITY) * modGrav(), elastic = v.type === 'elastic'; // modifier: zware Andy / maan
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
  if (v.jet) { alpha += (JET_DRAG * 0.8 / G.R) * Math.cos(G.th); G.om *= Math.pow(0.45, dt); } // fartwind: aan een straaljager hang je naar achteren
  if (game.mode !== 'dying') { // "pompen": Andy zwaait zelf mee
    const vt = G.om * G.R, c = Math.cos(G.th);
    if (brOn() && game.mp.br && c > 0.25 && Math.abs(vt) <= 15) alpha += Math.sign(Math.cos(game.mp.br.aim) || 1) * pumpA(0) / G.R; // battle royale: vanuit stilstand zwaai je naar waar je richt
    if (c > 0.25 && Math.abs(vt) > 15 && Math.abs(vt) < swingCap()) {
      const s = Math.sign(G.om), fwd = s * c > 0;
      alpha += s * pumpA(lvl('swing')) * (fwd || brOn() ? 1 : 0.55) / G.R; // battle royale: naar achter zwaaien even sterk
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
  const R = gripR(lvl('grip')) * modGrip();
  let best = null, bk = 0, bd = R * R;
  for (const v of vines) {
    if (!v.anchored || Math.abs(v.x - G.x) > 640) continue;
    if (v === G.lastVine && G.releaseT > 0) continue;
    if (v.jetDone) continue; // een straaljager die je al losliet, kun je niet opnieuw grijpen
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
  if (G.trick) G.trick = null; // truc onderbroken: de draaiing loopt vanzelf af (zie updateGorilla), geen sprong terug
  G.state = 'hang'; G.vine = v; G.k = k; G.hangT = 0; G.iceT = 0; G.diveT = 0; G.dive = 0; G.noDive = false; G.chain = 0; G.swSide = 0;
  G.sq = 0.24; // even uitrekken bij het grijpen (zie de rek-en-krimpveer in updateGorilla)
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
  if (brOn() && Math.abs(vt) > 60) dir = Math.sign(vt); // battle royale: je zwaait gewoon door in de richting waarin je ging
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
    } else if (v.jet) { reward(G.x, G.y - 60, 'Straaljager! ✈️ Hou vast!', 8, '#bfe6ff'); Sfx.jet(); }
    else reward(G.x, G.y - 60, 'Luchtballon!', 5, '#ffe46b');
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
  // Geheim: vanaf de allereerste liaan met volle vaart naar ACHTEREN loslaten (en ver genoeg vliegen, zie
  // checkMatrix) brengt je in de Matrix. Zo'n harde zwaai naar achter gebeurt niet per ongeluk.
  const matrixShot = voluntary && v.first && run.firstJump && G.vx < -MATRIX_VX && G.hangT > 1.2 && matrixOpen();
  if (matrixShot) {
    G.vx *= m; G.vy = G.vy * m - 120; G.lastVine = v; G.releaseT = 0.3; G.vine = null; G.state = 'air'; G.airT = 0; G.airX = G.x; G.slack = false;
    G.matrixShot = true; Sfx.release(sp0); Sfx.whoa();
    return;
  }
  if (sp0 > 70 && !brOn()) { // (battle royale: vrije richting, geen bijsturen)
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
  else if (brOn()) vx -= 60;
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
  G.sq = 0.2; // wegschieten: even uitgerekt
  if (playing && voluntary && v.balloon && v.balloon.path) checkSpaceLaunch(v);
  if (playing) {
    Sfx.release(Math.hypot(vx, vy));
    for (let i = 0; i < 5; i++) addPart({ x: G.x, y: G.y + 10, vx: -vx * rand(0.05, 0.2) + rand(-40, 40), vy: rand(-40, 40), life: 0.4, max: 0.4, col: 'rgba(255,255,255,.6)', r: rand(3, 6), g: 0 });
    // WOOHOO! bij een flinke zwaai (niet vaker dan eens per 0,7 s)
    // alleen bij een echt flinke zwaai, niet vaker dan eens per 4 s en ook dan niet altijd: zo blijft het leuk
    if (voluntary && Math.hypot(vx, vy) > 750 && time - run.lastWoo > 4 && Math.random() < 0.5) { run.lastWoo = time; Sfx.woohoo(Math.hypot(vx, vy)); }
  }
}
// ---- Spoor (uiterlijk uit kisten): volgt Andy als hij hard gaat ----
function cosmTrail() {
  const sp = Math.hypot(G.vx, G.vy);
  if (sp < 420 || Math.random() > 0.35 + sp / 3000) return;
  const t = save.cosm.trail, x = G.x - G.vx * 0.03 + rand(-8, 8), y = G.y - G.vy * 0.03 + rand(-8, 8), vx = -G.vx * 0.1 + rand(-30, 30), vy = rand(-40, 40);
  if (t === 'trail_hearts') addPart({ type: 'glyph', ch: '♥', x, y, vx, vy: vy - 40, life: 0.7, max: 0.7, col: Math.random() < 0.5 ? '#ff4f8b' : '#ff9ec7', r: rand(9, 14), g: -30 });
  else if (t === 'trail_stars') addPart({ type: 'star', x, y, vx, vy, life: 0.6, max: 0.6, col: Math.random() < 0.5 ? '#ffe14f' : '#ffffff', r: rand(2.5, 4), rot: rand(0, 6), vr: 6, g: 0 });
  else if (t === 'trail_fire') addPart({ x, y, vx, vy: vy - 60, life: 0.45, max: 0.45, col: ['#ffd23f', '#ff8a1a', '#ff4a1a'][(Math.random() * 3) | 0], r: rand(3, 7), g: -120 });
  else if (t === 'trail_rainbow') addPart({ x, y, vx: vx * 0.3, vy: 0, life: 0.6, max: 0.6, col: `hsl(${(time * 240) % 360},90%,62%)`, r: 6, g: 0 });
  else if (t === 'trail_binary') addPart({ type: 'glyph', ch: Math.random() < 0.5 ? '0' : '1', x, y, vx, vy: vy + 30, life: 0.8, max: 0.8, col: Math.random() < 0.3 ? '#d8ffe0' : '#79c143', r: rand(15, 22), g: 40 });
}
// ---- Het Matrix-geheim ----
// Wie vanaf de allereerste liaan hard naar achteren loslaat en tegen de wand achter de startrots vliegt, belandt in
// de Matrix: vallende groene code, en Kiwi die in een paar tekstballonnen uitlegt dat je de verkeerde kant op ging.
// Daarna sta je weer op de startrots. De wereld staat ondertussen stil.
const MATRIX_VX = 820;
// Per bezoek andere tekst (ook in latere runs, zie save.matrixSeen). Na het laatste bezoek gaat de Matrix op slot:
// dan gebeurt er niets meer en vlieg je gewoon tegen de wand. Nooit in multiplayer, split-screen of tegen Kiwi.
const MATRIX_VISITS = [[
  'Hé… jij daar. Wat doe jij hier?',
  'Dit is de Matrix. Hier is niks. Alleen maar code.',
  'Geen appels, geen lianen, geen avontuur. Die zitten allemaal díe kant op ➜',
  'Je bent de verkeerde kant op gezwaaid, Andy.',
  'Ik stuur je terug. En deze keer: naar vóren zwaaien, oké?',
], [
  'Jij alweer?!',
  'Ik heb nog eens goed gekeken: hier zijn echt nog steeds geen appels.',
  'Alleen maar enen en nullen. En een beetje stof.',
  'Weet je hoeveel moeite het kost om jou steeds terug te sturen?',
  'Laatste keer, hoor. Naar vóren. Dáár ➜',
], [
  'Serieus. Voor de DERDE keer.',
  'Oké, je hebt gewonnen: je bent officieel de koppigste gorilla van de jungle.',
  'Maar ik doe de Matrix nu op slot. 🔒',
  'Probeer je het nog eens, dan vlieg je gewoon tegen de muur.',
  'Doei Andy! Veel plezier met je appels. 🍎',
]];
const matrixOpen = () => (save.matrixSeen || 0) < MATRIX_VISITS.length && !game.career && !game.mp && !LOCAL.on;
function checkMatrix() {
  if (!G.matrixShot) return;
  if (G.state !== 'air' || !matrixOpen()) { G.matrixShot = false; return; }
  if (G.x < WALL_X + 40 && G.y < ROCK.top - 60) {
    G.matrixShot = false;
    run.matrix = { t: 0, line: 0, lineT: 0, press: input.presses, out: 0, lines: MATRIX_VISITS[save.matrixSeen || 0] };
    document.body.classList.add('matrix'); // HUD en hints even weg
    flashT = 0.6; shake(8, 0.5); Sfx.portal();
  }
}
function updateMatrix(dt) {
  const M = run.matrix;
  if (game.mp || LOCAL.on) { run.matrix = null; document.body.classList.remove('matrix'); return; } // nooit in multiplayer
  M.t += dt; M.lineT += dt;
  if (M.out) { if ((M.out += dt) > 0.6) matrixDone(); return; }
  const full = M.lines[M.line].length / 28 + 0.3; // tijd om de regel uit te typen
  // tikken: eerst de regel afmaken, dan de volgende
  if (input.presses !== M.press && M.t > 0.6) { M.press = input.presses; if (M.lineT < full) M.lineT = full; else nextMatrixLine(M); }
  if (M.lineT > full + 2.6) nextMatrixLine(M);
  if (Math.random() < 0.25) Sfx.tick(1800 + Math.random() * 900, 0.015);
}
function nextMatrixLine(M) {
  if (M.line < M.lines.length - 1) { M.line++; M.lineT = 0; Sfx.tick(1200, 0.05); }
  else { M.out = 0.001; Sfx.portal(); }
}
function matrixDone() {
  run.matrix = null;
  document.body.classList.remove('matrix');
  G.state = 'stand'; G.x = 250; G.y = ROCK.top - FEET; G.vx = 0; G.vy = 0; G.angle = 0; G.standT = 0; G.standPress = input.presses;
  run.firstJump = true;
  flashT = 0.5; confetti(G.x, G.y - 40, 50);
  const seen = save.matrixSeen || 0;
  save.matrixSeen = Math.min(MATRIX_VISITS.length, seen + 1);
  if (!seen) { save.apples += 25; floatText(G.x, G.y - 80, 'Geheim gevonden! +25 🍎', '#7dff8a', 26); }
  else if (save.matrixSeen >= MATRIX_VISITS.length) floatText(G.x, G.y - 80, 'De Matrix is op slot 🔒', '#7dff8a', 24);
  else floatText(G.x, G.y - 80, 'Terug uit de Matrix!', '#7dff8a', 24);
  persist();
  Sfx.cheer();
}
// Sprong vanaf de startrots naar de eerste liaan
function jump() {
  G.state = 'air'; G.vx = 690; G.vy = -770; G.airT = 0; G.airX = G.x; G.noDive = true; G.lastVine = null;
  floatText(G.x, G.y - 60, 'Hup!', '#ffffff', 26);
  for (let i = 0; i < 10; i++) addPart({ x: G.x + rand(-14, 14), y: ROCK.top, vx: rand(-120, 60), vy: rand(-120, -20), life: 0.5, max: 0.5, col: 'rgba(210,190,160,.8)', r: rand(3, 6), g: 300 });
  Sfx.jump(); Sfx.hup();
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
  Sfx.crack(); Sfx.whoa();
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
    Sfx.balloon(); Sfx.phew();
  } else if (powOn('wings')) { // power-up vleugels: je stuitert van het water weer omhoog
    G.y = HAZARD_Y - G_R; G.vy = -1300; G.vx = Math.max(G.vx, 520);
    splash(G.x, 12); floatText(G.x, G.y - 60, '🪽 Wiek!', '#bfefff', 22); Sfx.boing();
  } else if (modBounce()) { /* modifier stuiterwater */ }
  else if (canGoUnder()) enterUnder();
  else die();
}
// Vijanden kunnen Andy NOOIT laten vallen of doodgaan: ze stelen alleen appels.
function hitFoe(f) {
  if (G.invuln > 0 || G.state === 'rocket' || f.done || powOn('star') || G.auto) return;
  f.done = true;
  G.invuln = 1.4;
  if (run.under && (f.type === 'jelly' || f.type === 'puffer')) { // onder water kost een steek je lucht
    run.under.t -= UNDER_STING; G.vx = -260; G.vy = f.y > G.y ? -300 : 300;
    floatText(G.x, G.y - 55, `-${UNDER_STING} s lucht!`, '#ff8080', 24); starBurst(f.x, f.y, 12, '#ffb0e0');
    Sfx.crack(); Sfx.hey(); shake(4, 0.2); f.fleeT = 0;
    return;
  }
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
    Sfx.steal(); Sfx.hey();
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
    splash(G.x, 30); Sfx.splash(G.x); Sfx.fall(); shake(7, 0.35);
    if (game.mode === 'playing') mpDied();
    return;
  }
  if (game.mode === 'done') { // al gefinisht: gewoon een plons, geen game over
    if (G.state === 'hang') { freeHand(G.vine, G.k); G.vine = null; }
    G.state = 'dead'; G.deadT = 0; splash(G.x, 20); return;
  }
  if (G.state === 'hang') { freeHand(G.vine, G.k); G.vine = null; }
  G.state = 'dead'; game.mode = 'dying'; run.reason = run.reason || 'fall'; // 'drown' blijft staan G.deadT = 0;
  G.vx *= 0.25; G.vy = Math.min(G.vy, 200);
  G.splashed = true; splash(G.x, 30); Sfx.splash(G.x); shake(7, 0.35);
  if (run.reason === 'drown') Sfx.blub(); else Sfx.fall();
}

// =====================================================================
//  Update
// =====================================================================
function step(dt) {
  if (run && run.matrix) { updateMatrix(dt); return; } // in de Matrix staat de wereld stil
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
    if (v === G.vine || v === ghostPin.v || v.jet || (v.x > x0 && v.x < x1 && v.ay < y1 && v.rest[3] > y0 - 200)) simVine(v, dt);
  }

  updateGorilla(dt, holdHang, holdAir);
  updateLoot(dt);
  updateParrot(dt);
  updateFoes(dt);
  updateApples(dt);
  for (const s of shrooms) s.sq *= Math.pow(0.02, dt);
  for (const t of tramps) t.sq *= Math.pow(0.03, dt);
  if (tramps.length && tramps[0].x < camX - KEEP_BEHIND) tramps.shift();
  if (portals.length && portals[0].ox < camX - 700) portals.shift();
  updateSpace(dt);
  updateJets(dt);
  if (game.mp) mpStep(dt);
  if (game.career) updateCareer(dt);
}

function updateGorilla(dt, holdHang, holdAir) {
  G.invuln = Math.max(0, G.invuln - dt);
  G.balloonT = Math.max(0, G.balloonT - dt);
  G.turboT = Math.max(0, G.turboT - dt);
  G.releaseT -= dt;
  const playing = game.mode === 'playing';
  // rek-en-krimpveer: bij grijpen, loslaten, landen en stuiteren rekt Andy even uit of krimpt hij in, en veert terug
  G.sqv = (G.sqv || 0) + (-(G.sq || 0) * 520 - G.sqv * 14) * dt; G.sq = (G.sq || 0) + G.sqv * dt;
  // een onderbroken truc (grijpen, duiken) draait via de kortste weg rustig terug in plaats van in één beeld terug te springen
  if (!G.trick && G.trickRot) { G.trickRot = wrapA(G.trickRot) * Math.exp(-dt * 11); if (Math.abs(G.trickRot) < 0.01) G.trickRot = 0; }
  if (!G.auto) checkTrans(); // biomegrens: vanzelf de reuzenliaan grijpen
  if (G.matrixShot) checkMatrix();
  if (save.cosm.trail && playing && !aiWorld() && (G.state === 'air' || G.state === 'hang')) cosmTrail();

  if (G.auto) autoSwing(dt);
  else if (G.state === 'hang') {
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
      if (v.jet && G.hangT > JET_HOLD * GAME_SPEED * BASE_SPEED) { // JET_HOLD in (ongeveer) echte seconden // na een paar seconden laat de straaljager je los, met al zijn vaart
        v.jetDone = true; release(false); G.vx = Math.max(G.vx, v.balloon.vx * 0.8); G.vy = Math.min(G.vy, -450);
        floatText(G.x, G.y - 60, 'Losgelaten!', '#bfe6ff', 24);
      } else if (v.jet && G.hangT > (JET_HOLD - 1.5) * GAME_SPEED * BASE_SPEED && Math.random() < 0.3) addPart({ x: G.hx, y: G.hy, vx: rand(-60, 60), vy: rand(-60, 20), life: 0.4, max: 0.4, col: '#bfe6ff', r: 2.5 });
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
            floatText(G.x, G.y - 50, 'Weggegleden!', '#d8f3ff'); Sfx.whoa();
          }
        }
      } else if (v.type === 'turbo' && Math.random() < 0.3) {
        addPart({ type: 'star', x: G.x + rand(-10, 10), y: G.y + rand(-10, 10), vx: rand(-40, 40), vy: rand(-80, -20), life: 0.5, max: 0.5, col: '#ffd23f', r: 3, rot: 0, vr: 6, g: 0 });
      }
    }
  } else if (G.state === 'stand') {
    G.vx = 0; G.vy = 0; G.angle *= 0.85; G.diving = false; G.standT += dt;
    // opnieuw springen vanaf de rots (met een nieuwe druk op de knop)
    if (playing && input.down && input.presses !== G.standPress) { if (towerOn()) towerJump(); else jump(); }
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
    // in de ruimte: bijna gewichtloos, en een zachte kracht houdt je in de ruimteband (tot je duikt of de tijd op is)
    const space = run.space && G.y < SPACE_Y + 600, float = space && run.spaceT < SPACE_TIME && G.dive < 0.25;
    G.vy += AIR_G * modGrav() * glide * (space ? 0.16 : 1) * (1 + 2.8 * G.dive) * dt;
    if (float && G.y > SPACE_Y - 250) G.vy -= Math.min(900, (G.y - (SPACE_Y - 250)) * 1.6) * dt + G.vy * Math.min(1, dt * 1.2) * (G.vy > 0 ? 1 : 0);
    // ook zonder wingsuit-upgrade drijft Andy een klein beetje naar voren: zo kom je nooit hulpeloos
    // recht naar beneden vast te zitten tussen twee lianen in
    if (!brOn()) G.vx += 55 * dt;
    // wingsuit: een deel van de valsnelheid wordt voorwaartse vaart
    if (wing && falling && G.vx > 0) { const dv = Math.min(G.vy, 700) * 0.32 * wing * dt; G.vy -= dv; G.vx += dv * 0.85; }
    const maxFall = MAX_FALL * glide * (1 + 1.1 * G.dive) * Math.sqrt(modGrav());
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
        G.y = ROCK.top - FEET; G.state = 'stand'; G.vx = 0; G.vy = 0; G.standPress = input.presses; G.sq = -0.3; // neerploffen
        addPart({ type: 'ring', x: G.x, y: ROCK.top, vx: 0, vy: 0, life: 0.35, max: 0.35, col: 'rgba(255,255,255,.7)', r: 8, grow: 30, g: 0, flat: true });
      } else if (G.y + FEET > ROCK.top + 6) { G.x = ROCK.x1 + G_R * 0.6; G.vx = Math.abs(G.vx) * 0.3; }
    }
    if (towerOn() && G.state === 'air' && towerLand(prevFeet)) return; // toren: op een ring geland
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
        G.vy = -Math.max(1350, Math.abs(G.vy) * 1.1) * (1 + 0.05 * lvl('shroom')); G.vx = Math.max(Math.abs(G.vx), 560); t.sq = 1; G.sq = -0.3;
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
          G.y = SHROOM_TOP - FEET; G.vy = -rand(1250, 1350) * (1 + 0.07 * sl); G.vx = Math.max(G.vx, 380 + 70 * sl); s.sq = 1; G.sq = -0.3;
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
  } else if (G.state === 'swim') {
    updateSwim(dt, playing && input.down);
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
    run.dist = Math.max(run.dist, towerOn() ? (TW_G - G.y - FEET) / PX_PER_M : (G.x - START_X) / PX_PER_M); // toren: hoe hoog je bent
    if (run.dist >= run.nextMile) {
      floatText(G.x, G.y - 80, `${run.nextMile} m!`, '#ffffff', 30);
      confetti(G.x, G.y - 40, 30);
      Sfx.milestone();
      run.nextMile += 100;
      const rain = Math.round(lvl('rain') * 3) / 3;
      if (rain) { // appelregen
        const gc = goldChance(lvl('golden'));
        for (let i = 0; i < 3 + rain * 3; i++) apples.push({ x: G.x + rand(120, 620), y: camY - rand(20, 260), rel: rand(120, 620), vy: rand(40, 140), rain: true, gold: Math.random() < gc, t: 0 });
        floatText(G.x + 200, G.y - 110, 'Appelregen! 🌧️', '#bfe6ff', 24);
      }
    }
    const S = biomeSeg(run.dist);
    if (S.n > run.biomeN && !game.career) enterBiome(S);
  }
}

function updateFoes(dt) {
  const alive = G.state === 'hang' || G.state === 'air' || G.state === 'swim';
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
    } else if (f.type === 'jelly') { // kwal onder water: deint op en neer
      f.t += dt; f.y = f.y0 + Math.sin(f.t * 1.3) * 40; f.x = f.x0 + Math.sin(f.t * 0.6) * 25;
    } else if (f.type === 'puffer') { // kogelvis: zwemt langzaam op je af en blaast zich elke paar tellen op
      f.t += dt; const puff = Math.max(0, Math.sin(f.t * 1.4)); f.r = 16 + puff * 20;
      if (Math.abs(f.x - G.x) < 700) { f.x += Math.sign(G.x - f.x) * 60 * dt; f.y += clamp(G.y - f.y, -80, 80) * dt * 0.8; }
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
  // op hoge snelheid reikt de magneet verder (tot 2× bij 1500 px/s), anders vlieg je er in een paar frames langs
  const sm = powOn('magnet'), ml = sm ? 5 : lvl('magnet'); // power-up supermagneet: even de sterkste magneet, extra ver
  const mr = magnetR(ml) * (sm ? 1.8 : 1) * (1 + 0.5 * clamp(Math.hypot(G.vx, G.vy) / 1600, 0, 1)), pull = magnetPull(ml) * (sm ? 1.6 : 1);
  const alive = game.mode === 'playing' && (G.state === 'hang' || G.state === 'air' || G.state === 'rocket' || G.state === 'swim');
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
    if (d < G_R + APPLE_PICK) { collect(a); apples.splice(i, 1); continue; }
    // Magneet: een gevangen appel beweegt met Andy mee (anders haalt hij Andy op topsnelheid nooit in) en komt
    // daarbij snel dichterbij. Eenmaal gevangen blijft hij tot een ruimer bereik vastzitten, ook als Andy er net voorbij is.
    if (mr && (d < mr || (a.mag && d < mr * 2.5))) {
      a.mag = true; if (a.vine) a.vine = null;
      a.x += G.vx * dt; a.y += G.vy * dt;
      const s = Math.min(d, (pull + (mr - Math.min(d, mr)) * 10) * dt);
      a.x += dx / d * s; a.y += dy / d * s;
    }
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
    const m = (a.x - START_X) / PX_PER_M;
    val = n * applesPerPick(biomeIndexAt(m), m);
  }
  run.earned += val;
  starBurst(a.x, a.y, a.gold ? 12 : 6, a.gold ? '#ffd23f' : '#ff6b5b');
  addPart({ type: 'ring', x: a.x, y: a.y, vx: 0, vy: 0, life: 0.3, max: 0.3, col: a.gold ? 'rgba(255,220,80,.9)' : 'rgba(255,255,255,.8)', r: 8, grow: 22, g: 0 });
  floatText(a.x, a.y - 16, '+' + fmtNum(val), a.gold ? '#ffe46b' : '#ffffff', a.gold ? 22 : 18);
  Sfx.apple(a.gold, run.combo, a.x);
  if (run.combo >= 10 && run.combo % 10 === 0) {
    const bonus = run.combo / 2 * (1 + lvl('combo'));
    run.earned += bonus;
    floatText(G.x, G.y - 70, `Combo ×${run.combo}! +${bonus}🍎`, '#ffe46b', 26);
    confetti(G.x, G.y - 30, 24);
    Sfx.combo(); Sfx.cheer();
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
    if (G.dive > 0.3) { G.trick = null; return; } // duiken breekt de truc af (de draaiing loopt vanzelf af)
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
      G.trick = null; G.trickRot = 0; G.trickCool = 0.12; G.sq = 0.25; // en weer uitstrekken
      addPart({ type: 'ring', x: G.x, y: G.y, vx: 0, vy: 0, life: 0.35, max: 0.35, col: 'rgba(255,228,107,.85)', r: 18, grow: 60, g: 0 });
    }
    return;
  }
  G.trickCool = (G.trickCool || 0) - dt;
  const needT = G.chain ? 0 : 0.5;
  if (G.airT > needT && G.trickCool <= 0 && !holdAir && G.dive < 0.1 && !G.noDive && Math.hypot(G.vx, G.vy) > 300) {
    // is er genoeg tijd voordat Andy een liaan raakt? (grof: niet te dicht boven de bodem)
    if (G.y < HAZARD_Y - 220) { G.trick = TRICKS[(Math.random() * TRICKS.length) | 0]; G.trickT = 0; G.sq = -0.22; } // eerst even inveren
  }
}
// ---- Nieuwe biome: over de afgrond aan twee reuzenlianen ----
// Op elke biomegrens houdt de wereld op: een klif, dan een diepe leegte zonder achtergrond of grond, en aan de
// andere kant de klif van de nieuwe biome. Boven de leegte hangen TRANS.n reuzenlianen (zie transVineX en
// drawBiomeCliffs). Komt Andy in de buurt, dan grijpt hij de eerste vanzelf, zwaait, springt naar de volgende,
// en wordt na de laatste met extra vaart de nieuwe biome in geslingerd. De speler hoeft niets te doen.
// Tijdens de zwaai verschijnen filmbalken en een titelkaart (zie drawCinematic). TRANS en transVineX staan in data.js.
const CINE_DUR = 2.6;
// de biomegrens (x) waar Andy nu in de buurt is, of null
function transBoundary(x) {
  if (game.career) return null;
  const S = biomeSeg((x - START_X) / PX_PER_M), bn = START_X + S.nextStart * PX_PER_M, bs = START_X + S.start * PX_PER_M;
  const a = TRANS.span + TRANS.before, b = TRANS.span + TRANS.after;
  if (x > bn - a && x < bn + b) return bn;
  if (S.start > 0 && x > bs - a && x < bs + b) return bs;
  return null;
}
function checkTrans() {
  if (game.mode !== 'playing' || run.space || run.under || (G.state !== 'air' && G.state !== 'hang')) return;
  const bx = transBoundary(G.x);
  if (bx === null || run.transDone === bx) return;
  if (G.state === 'hang') release(false);
  G.state = 'air';
  let k = 0; // kom je pas halverwege aan (bijvoorbeeld met een raket), dan grijp je de liaan die nog vóór je hangt
  while (k < TRANS.n - 1 && G.x > transVineX(bx, k) + TRANS.R * Math.sin(TRANS.th1) * 0.5) k++;
  G.auto = { bx, k, t: 0, fly: false, th0: transTh0(bx, k, G.x), sx: G.x, sy: G.y };
  run.transDone = bx;
  G.trick = null; G.trickT = 0; G.dive = 0; G.diving = false;
  if (!aiWorld()) { Sfx.grab(); Sfx.tarzan(); }
}
const transTh0 = (bx, k, x) => clamp(Math.asin(clamp((x - transVineX(bx, k)) / TRANS.L, -1, 1)), -0.95, 0.4);
// de hoek aan reuzenliaan k op tijd t van de zwaai: traag bij de uitslag, snel door het laagste punt
// (en bij het loslaten nog genoeg vaart voor de sprong naar de volgende)
function transAngle(A, t) {
  const u = clamp(t / TRANS.swing, 0, 1), K = 0.8, f = (Math.sin(Math.PI * K * (u - 0.5)) / Math.sin(Math.PI * K / 2) + 1) / 2;
  return A.th0 + (TRANS.th1 - A.th0) * f;
}
// waar Andy hangt bij hoek th aan liaan k
function transPos(A, th) {
  const s = Math.sin(th), c = Math.cos(th), x = transVineX(A.bx, A.k);
  return { hx: x + TRANS.L * s, hy: TRANS.ay + TRANS.L * c, px: x + TRANS.R * s, py: TRANS.ay + TRANS.R * c };
}
function autoSwing(dt) {
  const A = G.auto, rdt = dt / (GAME_SPEED * Math.max(0.05, timeScale()));
  A.t += rdt;
  let nx, ny;
  if (A.fly) { // de sprong tussen twee lianen: een vloeiende boog (Hermite) van loslaten naar vastpakken
    const s = clamp(A.t / TRANS.fly, 0, 1), T = TRANS.fly, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    nx = h00 * A.p0x + h10 * T * A.v0x + h01 * A.p1x + h11 * T * A.v1x;
    ny = h00 * A.p0y + h10 * T * A.v0y + h01 * A.p1y + h11 * T * A.v1y;
    G.angle = -TRANS.th1 + 2 * TRANS.th1 * s * s * (3 - 2 * s);
    G.hx = nx; G.hy = ny - TRANS.hang;
    if (A.t >= TRANS.fly) { A.fly = false; A.t = 0; A.k++; A.th0 = -TRANS.th1; A.sx = nx; A.sy = ny; A.grabbed = true; if (!aiWorld()) Sfx.grab(); }
  } else {
    const th = transAngle(A, A.t), P = transPos(A, th);
    // eerst naar het uiteinde van de liaan toe (vastpakken), daarna hangt hij er gewoon aan
    const k = A.grabbed ? 1 : clamp(A.t / TRANS.grab, 0, 1), e = k * k * (3 - 2 * k);
    nx = A.sx + (P.px - A.sx) * e; ny = A.sy + (P.py - A.sy) * e;
    G.hx = P.hx + (nx - P.px); G.hy = P.hy + (ny - P.py);
    G.angle += (-th - G.angle) * Math.min(1, rdt * 14);
    if (A.t >= TRANS.swing) {
      if (A.k < TRANS.n - 1) { // loslaten en naar de volgende reuzenliaan springen
        const e2 = 1e-3, P2 = transPos(A, transAngle(A, A.t - e2));
        A.p0x = P.px; A.p0y = P.py; A.v0x = (P.px - P2.px) / e2; A.v0y = (P.py - P2.py) / e2;
        const B = { bx: A.bx, k: A.k + 1, th0: -TRANS.th1 }, Q0 = transPos(B, transAngle(B, 0)), Q1 = transPos(B, transAngle(B, e2));
        A.p1x = Q0.px; A.p1y = Q0.py; A.v1x = (Q1.px - Q0.px) / e2; A.v1y = (Q1.py - Q0.py) / e2;
        A.fly = true; A.t = 0;
        if (!aiWorld()) Sfx.whoosh(0.35, 300, 900, 0.06);
      }
    }
  }
  G.vx = (nx - G.x) / dt; G.vy = (ny - G.y) / dt; // voor de camera en het uitzoomen
  G.x = nx; G.y = ny;
  G.airT = 0; G.airX = G.x;
  if (Math.random() < 0.5) addPart({ type: 'streak', x: G.x + rand(-14, 14), y: G.y + rand(-14, 14), vx: -G.vx * 0.05, vy: -G.vy * 0.05, life: 0.3, max: 0.3, col: 'rgba(255,255,255,.75)', r: 2.5, g: 0 });
  if (!A.fly && A.k === TRANS.n - 1 && A.t >= TRANS.swing) { // loslaten: met extra vaart de nieuwe biome in
    G.auto = null;
    G.vx = 1900; G.vy = -520; G.turboT = 0.9; G.noDive = true; G.airT = 0; G.airX = G.x;
    if (!aiWorld()) { floatText(G.x, G.y - 70, 'Wiiieee!', '#ffffff', 30); Sfx.woohoo(1900); Sfx.whoosh(0.5, 400, 1600, 0.1); }
    starBurst(G.x, G.y, 18, BIOMES[run.biome].c.sun); shake(5, 0.3);
  }
}
function enterBiome(S) {
  run.biomeN = S.n; run.biome = S.i; Music.biome = S.i;
  const b = BIOMES[S.i], mult = `Elke appel ×${fmtNum(applesPerPick(S.i, run.dist))}`;
  if (game.mp) { showBanner(b.name, mult); flashT = 0.35; confetti(G.x + 200, G.y - 200, 60); if (!aiWorld()) Sfx.biome(S.i); return; }
  run.cine = { t: 0, bi: S.i, sub: mult, lap: S.n >= BIOMES.length };
  confetti(G.x + 150, G.y - 220, 120); confetti(G.x + 450, G.y - 260, 80);
  starBurst(G.x, G.y, 30, b.c.sun);
  flashT = 0.35; shake(4, 0.4);
  Sfx.biome(S.i);
}
// tempo tijdens de overgang: een heel kort vertraagd moment op het hoogste punt boven de klif, verder gewoon op snelheid
function cineSlow() {
  const C = run && run.cine;
  if (!C || game.mp) return 1;
  const t = C.t;
  return t < 0.15 ? 1 - t / 0.15 * 0.35 : t < 0.45 ? 0.65 : t < 0.8 ? 0.65 + (t - 0.45) / 0.35 * 0.35 : 1;
}

// ---- Kisten (loot-boxes): oppakken tijdens het spelen, openen na afloop (zie game.js) ----
const LOOT_REACH = 110, LOOT_PULL = 300; // oppakbereik (bovenop Andy's straal) en vanaf waar de kist naar je toe komt
function updateLoot(dt) {
  if (!loot.length) return;
  const alive = game.mode === 'playing' && (G.state === 'hang' || G.state === 'air' || G.state === 'rocket' || G.state === 'swim');
  for (let i = loot.length - 1; i >= 0; i--) {
    const L = loot[i];
    L.t += dt;
    if (L.x < camX - 400) { loot.splice(i, 1); continue; }
    const d = Math.hypot(G.x - L.x, G.y - L.y);
    // ruim oppakbereik; wie in de buurt komt trekt de kist naar zich toe
    if (alive && d < LOOT_PULL && d > 1) { const k = Math.min(1, dt * (4 + 10 * (1 - d / LOOT_PULL))); L.x += (G.x - L.x) * k; L.y += (G.y - L.y) * k; }
    if (alive && d < G_R + LOOT_REACH) {
      loot.splice(i, 1);
      run.loot++;
      floatText(L.x, L.y - 30, '📦 Kist!', '#ffd76b', 26);
      starBurst(L.x, L.y, 18, '#ffd76b');
      addPart({ type: 'ring', x: L.x, y: L.y, vx: 0, vy: 0, life: 0.4, max: 0.4, col: 'rgba(255,215,107,.9)', r: 10, grow: 50, g: 0 });
      Sfx.lootPick();
    }
  }
}

// ---- Onder water ----
// Val je in het water (niet in lava, niet online), dan is er UNDER_CHANCE kans dat Andy niet verdrinkt maar ondergaat:
// een onderwaterwereld met rotswanden (sommige schuiven op en neer), tegenstromingen, kwallen, kogelvissen en parels.
// Een sterke stroming houdt je onder water, behalve bij een luchtgat (een bellenzuil), en die liggen ver uit elkaar.
// Haal je er binnen UNDER_TIME seconden geen, dan verdrinkt Andy. Een kwal of kogelvis kost je lucht (UNDER_STING).
// Het moet voelen als een tweede kans die je moet verdienen.
const UNDER_CHANCE = 0.2, UNDER_TIME = 22, UNDER_STING = 3, UNDER_FLOOR = HAZARD_Y + 1000, UNDER_TOP = HAZARD_Y + 45;
function canGoUnder() {
  return !game.mp && !castleOn() && !towerOn() && game.mode === 'playing' && !run.under && BIOMES[biomeIndexAt(run.dist)].style !== 'volcano' && Math.random() < UNDER_CHANCE;
}
function enterUnder() {
  if (G.state === 'hang') { freeHand(G.vine, G.k); G.vine = null; }
  const U = run.under = { t: UNDER_TIME, x0: G.x, exits: [], walls: [], currents: [], genX: G.x + 500, nextExit: G.x + rand(2800, 3300), beep: 99, visits: (run.underVisits || 0) + 1 };
  run.underVisits = U.visits;
  G.state = 'swim'; G.vy = clamp(G.vy, 200, 500); G.vx = Math.max(200, Math.min(G.vx, 700));
  G.trick = null; G.trickRot = 0; G.dive = 0; G.diveT = 0; G.diving = false; G.airT = 0;
  genUnder(U, G.x + 3600);
  splash(G.x, 30); Sfx.splash(G.x); Sfx.underIn(); shake(5, 0.3);
  showBanner('Tweede kans! 🫧', `Zoek binnen ${UNDER_TIME} s een luchtgat. Pas op voor kwallen, kogelvissen en de stroming!`);
}
// stukje onderwaterwereld erbij (Math.random: dit is alleen voor jou, geen gedeelde wereld)
function genUnder(U, xMax) {
  while (U.genX < xMax) {
    const x = U.genX;
    if (x >= U.nextExit) { U.exits.push(x + 100); U.nextExit = x + rand(2600, 3400); U.genX += 420; continue; }
    // rotswand: van de bodem omhoog of van boven omlaag, met altijd een (krappe) doorgang; soms schuift hij op en neer
    if (Math.random() < 0.95) {
      const fromTop = Math.random() < 0.45, gap = rand(230, 320), amp = Math.random() < 0.35 ? rand(60, 130) : 0;
      const W0 = fromTop ? { x, w: rand(60, 110), y0: UNDER_TOP - 60, y1: UNDER_FLOOR - gap - rand(0, 250) } : { x, w: rand(60, 110), y0: UNDER_TOP + gap + rand(0, 250), y1: UNDER_FLOOR + 40 };
      W0.by0 = W0.y0; W0.by1 = W0.y1; W0.amp = amp; W0.ph = rand(0, 6); W0.sp = rand(0.8, 1.4);
      U.walls.push(W0);
    }
    // tegenstroming: een zone die je terugduwt (zwem er snel doorheen of eromheen)
    if (Math.random() < 0.3) { const y = rand(UNDER_TOP + 120, UNDER_FLOOR - 260); U.currents.push({ x0: x + 120, x1: x + rand(420, 560), y0: y, y1: y + rand(140, 220) }); }
    // kogelvis: zwemt op je af en blaast zich af en toe op
    if (Math.random() < 0.3) { const y = rand(UNDER_TOP + 150, UNDER_FLOOR - 150), px2 = x + rand(250, 420); foes.push({ type: 'puffer', x: px2, y, y0: y, t: rand(0, 6), r: 18, bi: 0 }); }
    { // parels in een groepje: een golvend rijtje of een bosje
      const cx = x + rand(180, 360), cy = rand(UNDER_TOP + 140, UNDER_FLOOR - 140), row = Math.random() < 0.6;
      const pts = row ? [0, 1, 2, 3, 4].map(i => [(i - 2) * 42, Math.sin(i * 1.2) * 18]) : [[0, 0], ...[0, 1, 2, 3, 4].map(k => [Math.cos(k * 1.257) * 34, Math.sin(k * 1.257) * 34])];
      for (const [ox, oy] of pts) apples.push({ x: cx + ox, y: cy + oy, gold: Math.random() < 0.12, pearl: true, t: Math.random() * 6 });
    }
    if (Math.random() < 0.75) { const y = rand(UNDER_TOP + 150, UNDER_FLOOR - 150), jx = x + rand(200, 380); foes.push({ type: 'jelly', x0: jx, y0: y, x: jx, y, t: rand(0, 6), r: 20, bi: 0, hue: rand(260, 340) }); }
    if (!game.mp && Math.random() < 0.12) addLoot(x + rand(150, 400), rand(UNDER_TOP + 150, UNDER_FLOOR - 120));
    U.genX += rand(480, 600);
  }
}
function updateSwim(dt, hold) {
  const U = run.under, realDt = dt / (GAME_SPEED * BASE_SPEED); // de lucht telt in (ongeveer) echte seconden
  if (!U) { G.state = 'air'; return; }
  if (game.mode === 'playing') U.t -= realDt;
  genUnder(U, G.x + 3600);
  // zwemmen: ingedrukt = een slag omhoog en vooruit; los = je zakt langzaam
  G.vy += (hold ? -1400 : 300) * dt;
  G.vx += ((hold ? 540 : 320) - G.vx) * Math.min(1, dt * 1.6);
  for (const c of U.currents) if (G.x > c.x0 && G.x < c.x1 && G.y > c.y0 && G.y < c.y1) { G.vx -= 1500 * dt; G.vy += Math.sin(time * 3) * 200 * dt; } // tegenstroming
  for (const w of U.walls) if (w.amp) { const o = Math.sin(time * w.sp + w.ph) * w.amp; w.y0 = w.by0 + o; w.y1 = w.by1 + o; } // schuivende wanden
  G.vy *= Math.pow(0.3, dt); G.vy = clamp(G.vy, -560, 460);
  const px = G.x;
  G.x += G.vx * dt; G.y += G.vy * dt;
  for (const w of U.walls) {
    if (Math.abs(G.x - w.x) < w.w / 2 + G_R * 0.8 && G.y > w.y0 - G_R * 0.7 && G.y < w.y1 + G_R * 0.7) {
      G.x = px <= w.x ? w.x - w.w / 2 - G_R * 0.8 : w.x + w.w / 2 + G_R * 0.8; G.vx = -60;
    }
  }
  const ex = U.exits.find(e => Math.abs(G.x - e) < 90);
  if (ex !== undefined && G.y < UNDER_TOP + 220 && game.mode === 'playing') { leaveUnder(ex); return; }
  if (ex !== undefined) G.vy -= 700 * dt; // de bellenzuil tilt je op
  if (G.y < UNDER_TOP) { G.y = UNDER_TOP; G.vy = Math.max(G.vy, 90); } // de stroming duwt je terug
  if (G.y > UNDER_FLOOR - 40) { G.y = UNDER_FLOOR - 40; G.vy = -Math.abs(G.vy) * 0.4; }
  G.angle += (clamp(G.vy * 0.0012, -0.6, 0.6) + 0.25 - G.angle) * Math.min(1, dt * 6);
  if (Math.random() < 0.08) addPart({ x: G.x + 12, y: G.y - 18, vx: rand(-20, 20), vy: -rand(60, 120), life: 1.2, max: 1.2, col: 'rgba(210,240,255,.7)', r: rand(2, 4), g: -40 });
  if (game.mode !== 'playing') return;
  const left = Math.ceil(U.t);
  if (U.t < 6 && left !== U.beep) { U.beep = left; Sfx.airBeep(left); }
  if (U.t <= 0) { run.reason = 'drown'; U.drowned = true; floatText(G.x, G.y - 60, 'Blub… blub…', '#d8f3ff', 26); die(); }
}
function leaveUnder(ex) {
  const U = run.under;
  run.under = null;
  G.state = 'air'; G.x = ex; G.y = HAZARD_Y - 30; G.vy = -1500; G.vx = Math.max(G.vx, 650);
  G.airT = 0; G.airX = G.x; G.noDive = true; G.invuln = 1; G.angle = 0;
  camY = Math.min(camY, baseTop()); // de camera springt mee terug naar boven
  splash(G.x, 26); Sfx.underOut();
  reward(G.x, G.y - 70, `Tweede kans gegrepen! (${Math.max(0, Math.ceil(U.t))} s over)`, 15 + 2 * Math.ceil(Math.max(0, U.t)), '#bfefff');
  for (let i = foes.length - 1; i >= 0; i--) if (foes[i].type === 'jelly' || foes[i].type === 'puffer') foes.splice(i, 1);
  for (let i = apples.length - 1; i >= 0; i--) if (apples[i].pearl) apples.splice(i, 1);
}

// ---- Straaljager ----
// Heel af en toe (Eindeloos, niet online) scheurt een straaljager van achteren over je heen, met een lange liaan die
// ver naar achteren wappert. Grijp hem en je wordt JET_HOLD seconden meegesleurd, daarna laat hij je met vaart los.
// Math.random en een eigen id: hij hoort niet bij de (gedeelde) wereld, net als de ruimtelianen.
const JET_HOLD = 5, JET_DRAG = -3400, JET_EVERY = [35, 70];
let jetId = -100000;
function updateJets(dt) {
  if (game.mode !== 'playing' || game.mp || game.career || !run) return;
  for (let i = vines.length - 1; i >= 0; i--) { // weggevlogen straaljagers opruimen
    const v = vines[i];
    if (v.jet && v !== G.vine && v.x > camX + viewW + 3000) vines.splice(i, 1);
  }
  if (run.jetT === undefined) run.jetT = rand(JET_EVERY[0], JET_EVERY[1]);
  if (run.dist < 150 || G.state === 'dead' || run.under || run.space) return;
  run.jetT -= dt;
  if (run.jetT > 0) return;
  run.jetT = rand(JET_EVERY[0], JET_EVERY[1]);
  if (Math.random() < 0.45) return; // lang niet elke keer
  spawnJet();
}
function spawnJet() {
  const sr = genRandom, sq = vineSeq;
  genRandom = Math.random;
  let v;
  try { v = makeVine(camX - 700, clamp(G.y - 520, CEIL_Y - 200, 60), 560, 'balloon', run.biome); } finally { genRandom = sr; vineSeq = sq; }
  v.id = jetId--; v.jet = true;
  v.balloon = { vx: Math.max(1500, Math.abs(G.vx) + 650), hue: 210, bob: rand(0, 6) };
  for (const q of v.pts) { q.x -= (q.y - v.ay) * 1.3; q.px = q.x; } // meteen al naar achteren wapperend
  vines.push(v);
  floatText(G.x, G.y - 90, '✈️ Straaljager!', '#bfe6ff', 26);
  Sfx.jet();
}

// ---- Ruimte ----
// Een ballonpad (SPACE_PATH gouden ballonnen op volgorde) lanceert Andy de ruimte in; wie zonder ballonnen heel hoog
// komt (boven SPACE_ENTER_Y) wordt er ook in getrokken. Daar is bijna geen zwaartekracht en houdt een zachte kracht
// je in de ruimteband (SPACE_Y), tot SPACE_TIME seconden om zijn of tot je duikt. Er hangen steeds nieuwe
// sterrenlianen aan zwevende planetoïden, je kunt van losse planetoïden stuiteren en er vliegt een ufo rond.
const SPACE_PATH = 3, SPACE_Y = -3000, SPACE_G = 0.35, SPACE_ENTER_Y = -1900, SPACE_TIME = 35;
function checkSpaceLaunch(v) {
  const b = v.balloon;
  // alleen als alle ballonnen van dit pad op volgorde zijn gepakt
  const path = vines.filter(w => w.balloon && w.balloon.path === b.path).sort((p, q) => p.balloon.step - q.balloon.step);
  if (b.step !== SPACE_PATH - 1 || !path.every(w => w.balloon.visited)) return;
  G.vx = Math.max(G.vx, 700); G.vy = -1750; G.turboT = 1.5; G.noDive = true; G.airT = 0; run.launchT = 6;
  floatText(G.x, G.y - 70, 'LANCERING! 🚀', '#ffe46b', 30);
  confetti(G.x, G.y, 60); shake(8, 0.4); Sfx.rocket(); Sfx.turbo(); Sfx.tarzan();
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
  run.spaceX = x0 + 350;
  spaceMore(Math.min(y0, SPACE_Y - 300));
  // een ufo die met je meevliegt (aanraken = bonus)
  spaceObjs.push({ type: 'ufo', x: x0 + 900, y: y0 - 500, t: 0, done: false });
}
// het volgende stuk ruimte vooruit: sterrenlianen, planetoïden, een satelliet en sterappels
function spaceMore(yc) {
  const x0 = run.spaceX;
  for (let i = 0; i < 8; i++) addSpaceVine(x0 + i * 430 + rand(-40, 40), yc - Math.sin((x0 / 430 + i) * 0.9) * 200 - rand(0, 120));
  for (let i = 0; i < 4; i++) spaceObjs.push({ type: 'rock', x: x0 + 250 + i * 850 + rand(-100, 100), y: yc + rand(-500, 400), r: rand(34, 56), ph: rand(0, 6), spin: rand(-0.6, 0.6), cd: 0 });
  spaceObjs.push({ type: 'sat', x: x0 + 1600 + rand(-300, 300), y: yc - rand(200, 700), ph: rand(0, 6) });
  for (let i = 0; i < 10; i++) { const t = i / 9; apples.push({ x: x0 + 300 + t * 2800, y: yc + 150 - Math.sin(t * Math.PI) * 450, gold: true, t: Math.random() * 6 }); }
  run.spaceX = x0 + 8 * 430;
}
function updateSpace(dt) {
  for (let i = spaceObjs.length - 1; i >= 0; i--) { // opruimen wat ver achter je ligt
    const o = spaceObjs[i];
    if (o.x < camX - 900 || (o.type === 'ufo' && o.t > 40)) spaceObjs.splice(i, 1);
  }
  if (game.mode !== 'playing') return;
  run.launchT = (run.launchT || 0) - dt;
  // heel hoog gekomen zonder ballonpad: de ruimte trekt je de rest van de weg omhoog
  if (!run.space && !run.under && !game.career && G.state === 'air' && G.y < SPACE_ENTER_Y && G.vy < 0 && run.launchT <= 0) {
    G.vy = Math.min(G.vy, -1600); G.noDive = true; run.launchT = 4;
    floatText(G.x, G.y - 70, 'Zó hoog! De ruimte trekt je omhoog! 🌌', '#e2d6ff', 26);
    shake(5, 0.3); Sfx.rocket();
  }
  const inSpace = G.y < SPACE_Y - 200;
  if (run.space) run.spaceT += dt;
  if (inSpace && !run.space && run.launchT > 0) {
    run.space = true; run.spaceVisits++; run.spaceT = 0;
    run.earned += 25;
    showBanner('🚀 In de ruimte!', 'Slinger aan de sterrenlianen, stuiter op planetoïden en pak de sterappels! +25 🍎');
    confetti(G.x + 150, G.y - 100, 80); flashT = 0.4; Sfx.jingle(5);
    // sterappels (goud) in een grote boog vooruit
    for (let i = 0; i < 24; i++) { const t = i / 23; apples.push({ x: G.x + 250 + t * 2000, y: G.y - 250 - Math.sin(t * Math.PI) * 900 + t * 900, gold: true, t: Math.random() * 6 }); }
    spawnSpace();
  } else if (run.space && G.y > SPACE_Y + 1100) {
    run.space = false;
    floatText(G.x, G.y - 60, 'Terug naar beneden!', '#ffffff', 24);
  }
  if (run.space && run.spaceT < SPACE_TIME && run.spaceX < G.x + 2600) spaceMore(SPACE_Y - 350); // steeds meer ruimte vooruit
  if (run.space && run.spaceT >= SPACE_TIME && !run.spaceBye) { run.spaceBye = true; floatText(G.x, G.y - 70, 'Je zuurstof is op! Terug naar beneden 🪂', '#ffffff', 24); }
  if (!run.space) run.spaceBye = false;
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
