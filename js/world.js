'use strict';
// Andy Apples · wereld
// De wereldstatus (gedeelde variabelen) en de wereldgenerator.

// =====================================================================
//  Wereldstatus
// =====================================================================
let vines = [], apples = [], shrooms = [], foes = [], parts = [], texts = [], fishes = [], tramps = [], portals = [];
let spaceObjs = []; // de ruimte: planetoïden (stuiteren), een ufo en satellieten
let lootLastX = -Infinity; // x van de laatst neergezette kist (zie addLoot)
let pups = [];      // power-ups in carrièrelevels, zie career.js
let loot = [];      // kisten (loot-boxes) om op te pakken, zie physics.js en game.js
let gen = { x: 0, special: 0 };
let run = null;
let camX = 0, camY = 0, lastCamX = 0, shakeT = 0, shakeAmp = 0, flashT = 0;
let time = 0;
let G = null;
const game = { mode: 'menu', paused: false, holdLock: false, career: null, mp: null };
let vineSeq = 0; // volgnummer van lianen: in multiplayer bij beide spelers hetzelfde
let input = { down: false, presses: 0 };

// Alles wat per wereld apart bestaat: [lezen, schrijven, beginwaarde]. Op één scherm en tegen Kiwi heeft elke speler
// een eigen wereld, en mp-local.js wisselt die door deze variabelen in en uit te laden (grabWorld/putWorld/freshWorld).
// Nieuwe variabele die per wereld hoort? Zet hem hier bij, anders delen de spelers hem ongemerkt.
// (Een deel staat in andere bestanden: genRandom in util.js, zoomK in view.js, amb/life in effects.js,
// layerCaches in render-bg.js en ghostPin in mp-online.js.)
const WORLD_VARS = {
  vines:       [() => vines,         v => { vines = v; },         () => []],
  apples:      [() => apples,        v => { apples = v; },        () => []],
  shrooms:     [() => shrooms,       v => { shrooms = v; },       () => []],
  foes:        [() => foes,          v => { foes = v; },          () => []],
  parts:       [() => parts,         v => { parts = v; },         () => []],
  texts:       [() => texts,         v => { texts = v; },         () => []],
  fishes:      [() => fishes,        v => { fishes = v; },        () => []],
  tramps:      [() => tramps,        v => { tramps = v; },        () => []],
  portals:     [() => portals,       v => { portals = v; },       () => []],
  spaceObjs:   [() => spaceObjs,     v => { spaceObjs = v; },     () => []],
  loot:        [() => loot,          v => { loot = v; },          () => []],
  pups:        [() => pups,          v => { pups = v; },          () => []],
  gen:         [() => gen,           v => { gen = v; },           () => ({ x: 0, special: 0 })],
  run:         [() => run,           v => { run = v; },           () => null],
  camX:        [() => camX,          v => { camX = v; },          () => 0],
  camY:        [() => camY,          v => { camY = v; },          () => 0],
  lastCamX:    [() => lastCamX,      v => { lastCamX = v; },      () => 0],
  shakeT:      [() => shakeT,        v => { shakeT = v; },        () => 0],
  shakeAmp:    [() => shakeAmp,      v => { shakeAmp = v; },      () => 0],
  flashT:      [() => flashT,        v => { flashT = v; },        () => 0],
  zoomK:       [() => zoomK,         v => { zoomK = v; },         () => 0],
  time:        [() => time,          v => { time = v; },          () => 0],
  G:           [() => G,             v => { G = v; },             () => null],
  vineSeq:     [() => vineSeq,       v => { vineSeq = v; },       () => 0],
  genRandom:   [() => genRandom,     v => { genRandom = v; },     () => Math.random],
  input:       [() => input,         v => { input = v; },         () => ({ down: false, presses: 0 })],
  holdLock:    [() => game.holdLock, v => { game.holdLock = v; }, () => false],
  mp:          [() => game.mp,       v => { game.mp = v; },       () => null],
  amb:         [() => amb,           v => { amb = v; },           () => makeAmb()],
  life:        [() => life,          v => { life = v; },          () => makeLife()],
  layerCaches: [() => layerCaches,   v => { layerCaches = v; },   () => ({})],
  ghostPin:    [() => ghostPin,      v => { ghostPin = v; },      () => ({ v: null, k: 0, x: 0, y: 0 })],
};

function restSeg(x, ay, len, type) {
  const L = len * (type === 'elastic' ? 1.2 : 1);
  return [x, ay, x - Math.sin(VINE_SLANT) * L, ay + Math.cos(VINE_SLANT) * L];
}
function makeVine(x, ay, len, type, bi) {
  const n = Math.max(6, Math.round(len / SEG_LEN));
  const off = -VINE_SLANT; // schuin naar linksonder, zoals in Benji Bananas
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const px = x + Math.sin(off) * i * SEG_LEN, py = ay + Math.cos(off) * i * SEG_LEN;
    pts.push({ x: px, y: py, px, py, im: i === 0 ? 0 : 1 });
  }
  const look = VINE_LOOK[type] || { col: BIOMES[bi].c.vine, leaf: BIOMES[bi].c.leaf };
  const flowers = ['#ff7eb6', '#7ec8ff', '#ffd23f', '#ffffff'];
  return { id: vineSeq++, x, ay, pts, type, bi, col: look.col, dark: shade(look.col, -0.38), light: shade(look.col, 0.3), leaf: look.leaf,
    phase: genRandom() * 6.28, anchored: true, snapAt: type === 'rotten' ? grand(0.8, 1.2) * (1 + 0.4 * lvl('vinewise')) : 0,
    rest: restSeg(x, ay, n * SEG_LEN, type),
    // tak waaraan de liaan hangt
    bl: grand(30, 46), tilt: grand(-0.12, 0.12),
    flower: genRandom() < 0.45 ? flowers[(genRandom() * flowers.length) | 0] : null };
}

// Andy en de run opnieuw laten beginnen, op de startrots. Los van resetWorld, zodat startReady de wereld
// achter het hoofdmenu kan houden (anders verspringt alles bij de start).
function resetRunner() {
  const C = game.career;
  const sx = 250, sy = ROCK.top - FEET;
  G = { x: sx, y: sy, px: sx, py: sy, vx: 0, vy: 0, im: 0.012,
    state: 'stand', vine: null, k: 0, slideTo: 0, slideT: 0, th: 0, om: 0, R: 100, R0: 100, vr: 0, slack: false, hx: 0, hy: 0,
    trick: null, trickT: 0, trickRot: 0, chain: 0, standT: 0, hangT: 0, iceT: 0, angle: 0, diveT: 0, dive: 0, noDive: false,
    lastVine: null, releaseT: 0, invuln: 0, balloonT: 0, turboT: 0, deadT: 0, spin: 0, splashed: false, diving: false,
    airT: 0, airX: 0, standPress: -1, helmets: lvl('helmet'), balloons: lvl('balloon'), rocketEnd: 0,
    parrot: lvl('parrot') ? { x: sx - 40, y: sy - 60, cd: 1, target: null, t: 0 } : null };
  // biomeN: volgnummer van het biome-stuk (zie biomeSeg); cine: de filmische overgang naar een nieuwe biome;
  // under: onder water (zie physics.js); loot: opgepakte kisten
  run = { picked: 0, earned: 0, stolen: 0, golden: 0, dist: 0, biome: 0, biomeN: 0, reason: '', lastWoo: 0,
    combo: 0, lastPick: -9, firstJump: true, nextMile: 100, tricks: 0, space: false, spaceVisits: 0, appleTotal: 0,
    cine: null, under: null, loot: 0 };
  if (C) { run.biome = C.bi; C.finishX = START_X + C.L * PX_PER_M; }
  if (game.mp) game.mp.finishX = game.mp.len ? START_X + game.mp.len * PX_PER_M : 0;
}
function resetWorld() {
  vines = []; apples = []; shrooms = []; foes = []; parts = []; texts = []; fishes = []; tramps = []; portals = []; spaceObjs = []; loot = []; pups = []; lootLastX = -Infinity;
  time = 0;
  const C = game.career;
  // carrière en multiplayer: vaste seed, zodat de wereld elke keer (en bij beide spelers) hetzelfde is
  genRandom = C ? mulberry32(1000 + C.n * 7919) : game.mp ? mulberry32(game.mp.seed) : Math.random;
  vineSeq = 0;
  // Andy staat op de startrots; de eerste liaan hangt binnen springbereik
  const v0 = makeVine(FIRST_VINE.x, FIRST_VINE.ay, FIRST_VINE.len, 'normal', 0);
  vines.push(v0);
  gen = { x: FIRST_VINE.x, lastPortal: -1e9, lastPath: 0, special: 0, col: 0, low: FIRST_VINE.ay + FIRST_VINE.len, tips: [null, null, FIRST_VINE.ay + FIRST_VINE.len * TIP_F] };
  resetRunner();
  zoomK = 0; applyZoom(); // elke run begint volledig ingezoomd
  camX = Math.max(-100, G.x - viewW * 0.32); camY = baseTop(); lastCamX = camX;
  genUntil(camX + viewW + 900);
  game.holdLock = false;
  Music.biome = C ? C.bi : 0;
}

// =====================================================================
//  Wereldgenerator
// =====================================================================
function genUntil(xMax) { while (gen.x < xMax) genNext(); }
// Past de lengte van een liaan aan zodat hij (ook uitgerekt) niet in de bodem hangt
function fitVine(ay, len, stretch) {
  const maxLen = (HAZARD_Y - VINE_CLEAR - ay) / stretch;
  if (len > maxLen) {
    len = Math.max(150, maxLen);
    ay = Math.min(ay, HAZARD_Y - VINE_CLEAR - len * stretch);
  }
  return [ay, len];
}
function pickType(F, d) {
  const hazardous = { rotten: F.rotten * (1 + 0.3 * d), icy: F.icy * (1 + 0.3 * d) };
  const opts = [['rotten', hazardous.rotten], ['icy', hazardous.icy], ['turbo', F.turbo * (1 + 0.35 * lvl('vinewise'))], ['elastic', F.elastic], ['fruit', F.fruit]];
  let r = genRandom(), type = 'normal';
  for (const [t, p] of opts) { if (r < p) { type = t; break; } r -= p; }
  // nooit drie lastige lianen achter elkaar
  if ((type === 'rotten' || type === 'icy') && gen.special >= 2) type = 'normal';
  gen.special = (type === 'rotten' || type === 'icy') ? gen.special + 1 : 0;
  return type;
}
// kortste afstand tussen twee lijnstukken
function segDist(a, b) {
  const d = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1; const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1); return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); };
  const cr = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const [x1, y1, x2, y2] = a, [x3, y3, x4, y4] = b;
  if (cr(x1, y1, x2, y2, x3, y3) * cr(x1, y1, x2, y2, x4, y4) < 0 && cr(x3, y3, x4, y4, x1, y1) * cr(x3, y3, x4, y4, x2, y2) < 0) return 0;
  return Math.min(d(x1, y1, x3, y3, x4, y4), d(x2, y2, x3, y3, x4, y4), d(x3, y3, x1, y1, x2, y2), d(x4, y4, x1, y1, x2, y2));
}
// Lianen mogen nooit in of te dicht tegen elkaar spawnen
function vineFits(x, ay, len, type) {
  const seg = restSeg(x, ay, Math.max(6, Math.round(len / SEG_LEN)) * SEG_LEN, type);
  for (const v of vines) {
    if (Math.abs(v.rest[0] - x) > 700) continue; // rest[0]: vaste plek (luchtballonnen drijven weg)
    // rest[0] en niet v.x: een luchtballon drijft alleen weg zolang hij in beeld gesimuleerd wordt, en dat verschilt
    // per speler (en per schermgrootte). Met v.x zou de wereld van twee spelers met dezelfde seed uit elkaar lopen.
    if (segDist(seg, v.rest) < 75 || Math.hypot(v.rest[0] - x, v.ay - ay) < 130) return false;
  }
  for (const P of portals) if (segDist(seg, portalSeg(P.bx, P.by, 0)) < 105 || segDist(seg, portalSeg(P.ox, P.oy, P.oa)) < 105) return false;
  return true;
}
function addVine(x, ay, len, type, bi, force) {
  [ay, len] = fitVine(ay, len, type === 'elastic' ? ELASTIC_STRETCH : 1);
  // probeer een paar kleine verschuivingen/inkortingen als hij te dicht bij een andere liaan hangt
  const tries = [[0, 0, 1], [0, -70, 1], [0, 70, 1], [50, 0, 1], [-50, 0, 0.8], [0, 0, 0.65], [90, -40, 0.75], [90, 60, 0.7]];
  if (force) for (const dx of [-60, -20, 30, 80, 130, 180]) for (const dy of [-150, -60, 30, 110]) tries.push([dx, dy, 0.85]);
  let ok = false;
  for (const [dx, dy, lf] of tries) {
    const ty = type === 'balloon' ? ay + dy : clamp(ay + dy, CEIL_Y, ANCHOR_LOW), tl = Math.max(150, len * lf);
    const [fy, fl] = fitVine(ty, tl, type === 'elastic' ? ELASTIC_STRETCH : 1);
    if (vineFits(x + dx, fy, fl, type)) { x += dx; ay = fy; len = fl; ok = true; break; }
  }
  if (!ok && !force) return null;
  const v = makeVine(x, ay, len, type, bi);
  if (!ok) v.forced = 1;
  vines.push(v);
  if (type === 'fruit') {
    const n = v.pts.length, gc = goldChance(lvl('golden'));
    for (let i = Math.floor(n * 0.35); i < n; i += 4) { const a = { x: v.pts[i].x, y: v.pts[i].y, vine: v, idx: i, gold: genRandom() < gc, t: genRandom() * 6 }; apples.push(a); countApple(a); }
  }
  return v;
}
// Lianen hangen in een vast patroon: kolommen op regelmatige afstand, met in elke kolom drie
// "banen" (hoog, midden, laag) die in een rustige golf op en neer lopen. Zo liggen de lianen altijd
// op logische sprongafstand van elkaar. Hoe verder je komt, hoe groter de afstand en hoe vaker er
// een bovenste baan ontbreekt; de laagste baan is er altijd, zodat je nooit vastloopt.
const LANES = [-1000, -540, -80];
function genNext() {
  const m = (gen.x - START_X) / PX_PER_M;
  const d = diffAt(m), dc = Math.min(1, d), dx = Math.min(1.8, d); // dx: carrière gaat verder dan 1 (zie levelInfo)
  const bi = biomeIndexAt(m), C = game.career;
  let F = features(bi);
  if (C && C.ch.includes('rotten')) F = Object.assign({}, F, { rotten: F.rotten + 0.22, icy: F.icy + 0.14 }); // uitdaging: rotte boel
  // eindeloze modus: hoe sneller Andy gaat, hoe ruimer de lianen staan (anders wordt het te druk)
  const fast = !game.career && !game.mp && G ? clamp((Math.abs(G.vx) - 700) / 900, 0, 1) : 0;
  // meer upgrades = grotere gaten en vaker een ontbrekende liaan; rond een biomegrens juist even rustig (buffer)
  const up = upgradePower(), calm = inBiomeBuffer(m);
  const x = gen.x + grand(470, 520) + dx * grand(40, 140) + fast * grand(140, 260) + (calm ? 0 : up * grand(60, 170));
  const vbi = biomeIndexAt((x - START_X) / PX_PER_M);
  gen.col++;

  const col = [], laneTips = [];
  const tip = v => v.ay + v.pts.length * SEG_LEN * TIP_F;
  for (let li = LANES.length - 1; li >= 0; li--) {
    const lowest = li === LANES.length - 1;
    if (!lowest && m > 12 && !calm && genRandom() < 0.08 + 0.3 * dx + 0.25 * fast + 0.22 * up) { laneTips[li] = null; continue; }
    let ay = LANES[li] + Math.sin(gen.col * 0.55 + li * 2.1) * 70 + grand(-15, 15);
    let len = grand(470, 540);
    if (lowest) { // haalbaarheid: het uiteinde moet bereikbaar zijn vanaf de laagste liaan ervoor
      const minTip = gen.low - 170;
      if (ay + len * TIP_F < minTip) ay = minTip - len * TIP_F;
    }
    const type = m < 8 || calm ? 'normal' : pickType(F, d);
    const v = addVine(x + grand(-12, 12), clamp(ay, CEIL_Y, ANCHOR_LOW), len, type, vbi, lowest);
    laneTips[li] = v ? tip(v) : null;
    if (v) col.push(v);
  }
  let low = -Infinity;
  for (const v of col) low = Math.max(low, v.ay + v.pts.length * SEG_LEN * (v.type === 'elastic' ? 1.2 : 1));

  // Geregeld een ballonpad naar de ruimte: een trapje van gouden ballonlianen die steeds hoger hangen.
  // Wie ze achter elkaar pakt en van de laatste loslaat, wordt de ruimte in gelanceerd.
  if (!game.career && m > 150 && m - gen.lastPath > 450 && genRandom() < 0.35) {
    gen.lastPath = m;
    const pid = genRandom();
    for (let i = 0; i < SPACE_PATH; i++) {
      const bv = addVine(x + 330 + i * 400, CEIL_Y - 120 - i * 440, 300, 'balloon', vbi, true);
      bv.balloon = { vx: 0, hue: 45, bob: grand(0, 6), path: pid, step: i };
    }
      }
  // Heel af en toe: een luchtballon boven het plafond met een liaan eronder
  else if (m > 40 && genRandom() < 0.07 && !vines.some(v => v.balloon && v.rest[0] > x - 1500)) { // rest[0]: zie vineFits
    const bv = addVine(x + grand(0, 100), CEIL_Y - 190, 300, 'balloon', vbi);
    if (bv) bv.balloon = { vx: grand(60, 90), hue: (genRandom() * 360) | 0, bob: grand(0, 6) };
  }

  // Portaalwoud: af en toe een portaalpaar. Blauw hangt in het gat tussen twee kolommen,
  // oranje een flink stuk verder (en meestal hoger). Nooit meer dan één paar tegelijk in beeld.
  if (F.portals && m > 8 && gen.x - gen.lastPortal > 2300 && genRandom() < F.portals) {
    const bx = (gen.x + x) / 2 + grand(-30, 30);
    for (const by of [grand(-200, 200), grand(-320, 280), grand(-420, 120)]) {
      const s = portalSeg(bx, by, 0);
      if (!vines.every(v => Math.abs(v.rest[0] - bx) > 700 || segDist(s, v.rest) > 105)) continue;
      const P = { bx, by, ox: bx + grand(1150, 1500), oy: grand(-650, -250), oa: grand(-0.45, -0.15), ph: genRandom() * 6, used: 0 };
      portals.push(P); gen.lastPortal = bx;
      break;
    }
  }
  const x0 = gen.x, x1 = x - 250 * Math.sin(VINE_SLANT);
  // lucht-trampolines tussen de kolommen, op een plek waar geen liaan hangt
  if (m > 25 && genRandom() < 0.2 + 0.1 * lvl('shroom')) {
    for (let t = 0; t < 6; t++) {
      const tx = (gen.x + x) / 2 + grand(-60, 60), ty = grand(CEIL_Y + 250, HAZARD_Y - 230), seg = [tx - 75, ty - 40, tx + 75, ty + 40];
      if (vines.every(v => Math.abs(v.rest[0] - tx) > 700 || segDist(seg, v.rest) > 70) && portals.every(P => Math.hypot(P.bx - tx, P.by - ty) > 220 && Math.hypot(P.ox - tx, P.oy - ty) > 220)) { tramps.push({ x: tx, y: ty, w: 120, sq: 0, bi: vbi, ph: grand(0, 6) }); break; }
    }
  }
  if (m > 20 && genRandom() < 0.16 * (1 - 0.6 * dc) * (1 + 0.4 * lvl('shroom'))) shrooms.push({ x: (gen.x + x) / 2 + grand(-40, 40), w: 180, bi: vbi, sq: 0 });
  if (game.career && gen.x > game.career.finishX) { gen.x = x; gen.low = low; gen.tips = laneTips; return; } // voorbij de finish: alleen lianen
  // appels langs de banen: een boog van de ene liaan naar de volgende in dezelfde baan
  // liever duidelijke groepjes met af en toe een leeg stuk dan overal een paar losse appels
  const lanes = [0, 1, 2].filter(li => laneTips[li] != null && gen.tips[li] != null);
  for (let g = genRandom() < 0.3 ? 0 : genRandom() < 0.2 ? 2 : 1; g > 0 && lanes.length; g--) {
    const li = lanes.splice((genRandom() * lanes.length) | 0, 1)[0];
    placeApples(x0, Math.max(x0 + 120, x1), d, gen.tips[li] - 40, laneTips[li] - 40);
  }

  const mid = (x0 + x1) / 2, ym = LANES[(genRandom() * 3) | 0] + grand(250, 420);
  // af en toe een kist (niet in multiplayer). Math.random: de kisten horen niet bij de vaste wereld van een level.
  if (!game.mp && m > 60 && !calm && Math.random() < LOOT_CHANCE) addLoot(mid + rand(-60, 60), clamp(LANES[(Math.random() * 3) | 0] + rand(260, 420), CEIL_Y + 80, HAZARD_Y - 170));
  if (calm) { gen.x = x; gen.low = low; gen.tips = laneTips; return; } // buffer rond een biomegrens: geen vijanden
  // carrière: tijdelijke power-ups (vaste plekken per level: hash, geen genRandom, zodat de wereld gelijk blijft)
  if (C && m > 40 && x < C.finishX - 400 && hash(gen.col * 7.31 + C.n * 13.7) < (C.boss ? 0.16 : 0.1)) {
    const types = C.boss ? ['star', 'star', 'wings', 'clock', 'magnet'] : ['star', 'magnet', 'wings', 'turbo', 'clock'];
    pups.push({ x: mid, y: clamp(LANES[(hash(gen.col * 3.7) * 3) | 0] + 330, CEIL_Y + 100, HAZARD_Y - 180), type: types[(hash(gen.col * 1.9 + C.n) * types.length) | 0], t: 0 });
  }
  const fk = (1 + 0.6 * d) * (C && C.ch.includes('swarm') ? 2.5 : 1);
  const fy = y => clamp(y, CEIL_Y, HAZARD_Y - 160);
  if (genRandom() < F.wasps * fk) foes.push({ type: 'wasp', x0: mid + grand(-40, 40), y0: fy(ym), x: mid, y: ym, t: grand(0, 6), ax: grand(20, 60), ay: grand(30, 80), r: 15, bi: vbi });
  if (genRandom() < F.fire * fk) foes.push({ type: 'fire', x: (gen.x + x) / 2 + grand(-50, 50), y: HAZARD_Y + 40, vy: 0, wait: grand(0.2, 1.6), r: 16, bi: vbi });
  if (genRandom() < F.birds * fk) { const y = fy(grand(CEIL_Y, HAZARD_Y - 200)); foes.push({ type: 'bird', x: x + grand(300, 700), y0: y, y, t: grand(0, 3), vx: -grand(170, 260), r: 16, bi: vbi, active: false }); }
  gen.x = x; gen.low = low; gen.tips = laneTips;
}
// een kist neerzetten, maar nooit vlak na de vorige (ook niet als die al gepakt is)
function addLoot(x, y) {
  if (Math.abs(x - lootLastX) < LOOT_GAP) return false;
  lootLastX = x; loot.push({ x, y, t: rand(0, 6) });
  return true;
}
// telt de appels vóór de finish, voor de sterren in de carrière
function countApple(a) { if (game.career && run && a.x < game.career.finishX) run.appleTotal += a.gold ? 5 : 1; }
function placeApples(x0, x1, d, y0, y1) {
  const gc = goldChance(lvl('golden'));
  const add = (x, y) => {
    const a = { x, y: clamp(y, CEIL_Y - 120, HAZARD_Y - 90), gold: genRandom() < gc, t: genRandom() * 6 };
    apples.push(a); countApple(a);
  };
  const r = genRandom(), SP = 46; // SP: afstand tussen appels in een groepje
  if (r < 0.5) {
    // boog: een dicht spoor van appels in het midden van de sprong
    const w = Math.min(x1 - x0, 520), n = clamp(Math.round(w / SP) - Math.round(d * 2), 5, 10), h = grand(80, 200), dy = grand(-40, 80);
    const cx = (x0 + x1) / 2, sx = cx - (n - 1) * SP / 2;
    for (let i = 0; i < n; i++) { const x = sx + i * SP, t = clamp((x - x0) / (x1 - x0), 0, 1); add(x, lerp(y0, y1, t) + dy - Math.sin(Math.PI * t) * h); }
  } else if (r < 0.72) {
    // tros: een compact bosje (7 in een zeshoek, of 5 in een plusje)
    const cx = (x0 + x1) / 2 + grand(-60, 60), cy = (y0 + y1) / 2 - grand(60, 180), big = genRandom() < 0.6 - d * 0.3;
    add(cx, cy);
    for (let k = 0; k < (big ? 6 : 4); k++) { const a = k * Math.PI * 2 / (big ? 6 : 4) + (big ? 0 : Math.PI / 4); add(cx + Math.cos(a) * 36, cy + Math.sin(a) * 36); }
  } else if (r < 0.9) {
    // rechte rij, of licht schuin
    const n = clamp(Math.round(grand(5, 8) - d * 2), 4, 8), cx = (x0 + x1) / 2, y = (y0 + y1) / 2 - grand(0, 140), slope = genRandom() < 0.5 ? 0 : grand(-0.5, 0.5);
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * SP; add(cx + o, y + o * slope); }
  } else {
    // ring om doorheen te zwaaien
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - grand(80, 180);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; add(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62); }
  }
}
