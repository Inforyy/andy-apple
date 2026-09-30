#!/usr/bin/env node
// Rooktest: opent index.html (via file://) in een headless Chromium, klikt door de menu's, speelt een stukje
// Eindeloos, een Carrière-level, split-screen en tegen Kiwi, en faalt bij elke JavaScript-fout.
// Geen npm-pakketten nodig: praat direct met Chromium via het DevTools-protocol (Node 18+).
//
//   node tools/smoke.mjs                 (zoekt zelf chromium / google-chrome)
//   CHROME=/pad/naar/chrome node tools/smoke.mjs
//   ANDY_URL=http://localhost:8000/ node tools/smoke.mjs   (via een server, zoals GitHub Pages)
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = process.env.ANDY_URL || pathToFileURL(join(ROOT, 'index.html')).href;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable']) {
    try { return execSync(`command -v ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { /* volgende */ }
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) if (existsSync(p)) return p;
  throw new Error('Geen Chrome/Chromium gevonden; zet CHROME=/pad/naar/chrome');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'andy-smoke-'));
const chrome = spawn(findChrome(), ['--headless=new', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=1024,640',
  // als root (bijv. in een container) start Chromium alleen zonder sandbox
  ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });

const errors = [];
let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
// Voert JS uit in de pagina; gooit bij een fout
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}\n  -> ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}
// Wacht tot een voorwaarde in de pagina waar is (peilt elke 50 ms) in plaats van een vaste tijd: zo gaat de test
// meteen door zodra het spel zover is. Geeft false na de timeout (de check erna faalt dan met een duidelijke melding).
async function until(expr, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(`!!(${expr})`)) return true; await sleep(50); }
  return false;
}
const esc = () => js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))`);
// spel-tijd versnellen (debug-snelheid, max 2,5×) voor stukken waar de test op het spel moet wachten
const speed = k => js(`DBG.speed = ${k}`);
// aftellen (3, 2, 1, GO!) in de lokale modi overslaan
const skipCount = async () => { await until('__andy.LOCAL.on', 2000); await js('__andy.LOCAL.count = 0.4'); return until(`__andy.game.mode === 'playing'`, 3000); };
function check(ok, what) {
  if (!ok) throw new Error('Mislukt: ' + what);
  console.log('  ok  ' + what);
}

async function main() {
  // wachten tot Chromium zijn debugpoort heeft opgeschreven
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(100); }
  }
  if (!port) throw new Error('Chromium start niet');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    // netwerkfouten van externe bronnen (Supabase, CDN) hangen af van de omgeving (offline, proxy): die tellen niet
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '') &&
      !(/net::ERR_/.test(m.params.entry.text) && /^https?:/.test(m.params.entry.url || ''))) errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: PAGE });
  await until('typeof window.__andy === "object" && __andy.curScreen === "menu"', 8000);

  console.log('Opstarten');
  check(await js('typeof window.__andy === "object"'), '__andy-haak bestaat');
  check(await js('__andy.curScreen') === 'menu', 'hoofdmenu staat open');

  console.log('Menu\'s');
  // de schermen wisselen direct bij een klik: geen wachttijd nodig
  for (const [open, back, screen] of [['btnShop', 'btnShopBack', 'shop'],
    ['btnSettings', 'btnSettingsBack', 'settings'], ['btnCareer', 'btnCareerBack', 'career'], ['btnMulti', 'btnModesBack', 'modes']]) {
    await js(`document.getElementById('${open}').click()`);
    check(await js('__andy.curScreen') === screen, `${open} opent '${screen}'`);
    await js(`document.getElementById('${back}').click()`);
  }
  // Spelmodi: elk blok opent de juiste kamer, terug gaat naar Spelmodi en daarna naar het menu
  for (const [btn, title, modes] of [['btnModeOnline', 'Multiplayer', null], ['btnModeDuo', 'Duel', 'mpModeRace,mpModeEnd'],
    ['btnModeKiwi', 'Tegen Kiwi', ''], ['btnModeChase', 'Achtervolging', 'mpModeChase']]) {
    await js(`document.getElementById('btnMulti').click(); document.getElementById('${btn}').click()`); await sleep(50);
    const got = await js(`[__andy.curScreen, document.getElementById('mpTitle').textContent,
      ['mpModeRace', 'mpModeEnd', 'mpModeChase'].filter(id => !document.getElementById(id).classList.contains('hidden')).join(',')].join('|')`);
    const [scr, t, shown] = got.split('|');
    check(scr === 'mp' && t === title && (modes === null || shown === modes), `${btn}: '${title}'${modes === null ? '' : ` met modi [${modes}]`}`);
    await js(`document.getElementById('btnMpBack').click()`);
    check(await until(`__andy.curScreen === 'modes'`, 1000), `${btn}: terug naar Gamemodes`);
    await js(`document.getElementById('btnModesBack').click()`);
  }
  check(await js('__andy.curScreen') === 'menu', 'Gamemodes: terug naar het menu');
  await js(`document.getElementById('btnSettings').click(); document.getElementById('btnDebug').click()`);
  check(await js('__andy.curScreen') === 'debug', 'debugscherm opent');
  await js(`document.getElementById('btnDebugBack').click(); document.getElementById('btnSettingsBack').click()`);

  // De beslissing per meetvenster van 2 s, met nep-metingen (in het menu meet de echte lus niet mee)
  console.log('Automatische kwaliteit');
  const qw = (frac, avg) => js(`__andy.qualityWindow(${frac}, ${avg})`);
  const qFrom = l => js(`__andy.setQualityChoice(1); __andy.setQualityChoice(0); __andy.perfReset(); __andy.setQuality(${l})`);
  const qp = () => js('__andy.perf');
  await qFrom(3);
  await qw(1, 33.4); await qw(1, 33.4); await qw(1, 33.4);
  let p = await qp();
  check(p.quality === 3 && p.capped && p.max === 4, 'begrensd op 30 fps: stap omlaag hielp niet, dus terug en niet verder omlaag');
  await qFrom(3);
  await qw(1, 40); await qw(0, 15); await qw(0, 15); await qw(0, 15);
  p = await qp();
  check(p.quality === 2 && p.max === 2 && !p.capped, 'echt te zwaar: stap omlaag hielp en blijft staan');
  await qFrom(3);
  await qw(1, 60);
  check((await qp()).quality === 1, 'zwaar haperen: twee stappen tegelijk omlaag');
  await qFrom(2);
  await qw(0, 10); await qw(0, 10);
  check((await qp()).quality === 3, 'soepel: na twee vensters een stap omhoog');
  await qFrom(3);

  // Houdt de knop in/los in een vast ritme: grijpen, zwaaien, loslaten
  const swing = (pressFn, unpressFn, secs) => js(`(async () => {
    const end = performance.now() + ${secs * 1000};
    while (performance.now() < end) { ${pressFn}; await new Promise(r => setTimeout(r, 700)); ${unpressFn}; await new Promise(r => setTimeout(r, 250)); }
  })()`);

  console.log('Eindeloos');
  await js('__andy.startReady(null)'); await sleep(100);
  await js('__andy.press()'); await sleep(150);
  await esc();
  check(await js('__andy.game.paused === true'), 'Esc pauzeert');
  await js(`document.getElementById('btnResume').click()`);
  check(await js('__andy.game.paused === false'), 'verder spelen');
  await js('__andy.unpress()');
  await speed(2);
  await swing('__andy.press()', '__andy.unpress()', 2);
  await speed(1);
  check(await js('__andy.run && __andy.run.dist > 0'), `Andy komt vooruit (${Math.round(await js('__andy.run ? __andy.run.dist : 0'))} m)`);
  check(await js('__andy.vines.length > 5'), 'lianen worden gegenereerd');
  // nog onderweg: via pauze stoppen; al gevallen: het eindscherm komt na de valanimatie
  if (await js('__andy.curScreen') !== 'over' && await js(`__andy.game.mode !== 'dying'`)) { await esc(); await js(`document.getElementById('btnQuit').click()`); }
  check(await until(`__andy.curScreen === 'over'`, 5000), 'eindscherm na de run');
  await js(`document.getElementById('btnOverMenu').click()`);
  check(await js('__andy.curScreen') === 'menu', 'terug naar het menu');

  console.log('Head-start');
  await js('__andy.save.apples = 100; __andy.startReady(null)');
  check(await until(`!document.getElementById('headStart').classList.contains('hidden')`, 2000), 'head-start-knoppen staan klaar');
  await js(`document.querySelector('[data-hs="0"]').click()`);
  check(await until('__andy.G.state === "rocket" && __andy.save.apples === 40', 2000), 'head-start gekocht: Andy vliegt');
  await sleep(300); // even raketvlucht tekenen
  console.log('Ruimte');
  await js(`(() => { const G = __andy.G; G.state = 'air'; G.vine = null; G.y = -3300; G.vy = -1250; G.vx = 700; __andy.run.launchT = 6; })()`);
  check(await until('__andy.run.space && __andy.vines.some(v => v.space) && __andy.spaceObjs.length > 0', 3000), 'in de ruimte: sterrenlianen en planetoïden');
  await swing('__andy.press()', '__andy.unpress()', 1);
  await esc(); await js(`document.getElementById('btnQuit').click()`);

  console.log('Straaljager');
  await js('__andy.startReady(null)'); await sleep(100);
  await js('__andy.press()'); await sleep(1500); // eerst een stuk van de rots af slingeren
  await js('__andy.spawnJet()');
  await until('__andy.vines.some(v => v.jet)', 2000); await sleep(400); // het touw van de straaljager moet eerst uithangen
  check(await js(`(() => { const v = __andy.vines.find(v => v.jet); const G = __andy.G; if (!v) return false; if (G.state === 'hang') __andy.release(); const q = v.pts[22]; G.x = q.x; G.y = q.y + 5; G.vx = 800; G.vy = 0; G.state = 'air'; G.releaseT = 0; __andy.press(); return true; })()`), 'straaljager vliegt langs');
  check(await until('!!(__andy.G.vine && __andy.G.vine.jet)', 2000), 'aan de straaljager gegrepen');
  await speed(2.5);
  check(await until('__andy.vines.some(v => v.jet && v.jetDone)', 9000), 'straaljager laat je na ~5 s los');
  await speed(1);
  await js('__andy.unpress()');
  await esc(); await js(`document.getElementById('btnQuit').click()`);

  console.log('Matrix-geheim');
  await js('__andy.startReady(null)'); await sleep(100);
  await js('__andy.press()');
  await until(`__andy.G.state === 'hang'`, 3000);
  await js(`(() => { const G = __andy.G; G.hangT = 2; G.vx = -1100; G.vy = -200; __andy.release(); __andy.unpress(); })()`);
  check(await until('!!__andy.run.matrix', 3000), 'hard naar achter van de eerste liaan: de Matrix in');
  for (let i = 0; i < 14 && await js('!!__andy.run.matrix'); i++) { await js('__andy.press(); __andy.unpress()'); await sleep(250); }
  check(await until(`!__andy.run.matrix && __andy.G.state === 'stand' && __andy.save.matrixSeen === 1`, 4000), 'Kiwi stuurt je terug naar de startrots');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))`); await sleep(150);
  await js(`document.getElementById('btnQuit').click()`); await sleep(300);

  console.log('Start-animatie, kist kopen, resetten en slowmotion');
  await js(`(() => { toMenu(); document.getElementById('btnPlay').click(); })()`);
  check(await js(`document.getElementById('menu').classList.contains('leaving') || __andy.game.mode === 'ready'`), 'Eindeloos: start-animatie');
  check(await until(`__andy.game.mode === 'ready' && __andy.curScreen === null`, 3000), 'na de start-animatie begint de run');
  check(await js(`(() => { const s = __andy.save, a = s.apples = 600, b = s.boxes; document.getElementById('btnCrates').click(); document.getElementById('btnCrBuy').click(); const ok = s.boxes === b + 1 && s.apples === a - CRATE_PRICE; document.getElementById('btnCrBack').click(); return ok; })()`), 'kist gekocht voor appels');
  check(await js(`(() => { const s = __andy.save; s.upgrades.grip = 7; const b = document.querySelector('[data-reset=upgrades]'); b.click(); b.click(); return s.upgrades.grip === 0 && upSteps('grip') === 0; })()`), 'resetmenu: upgrades terug naar 0');
  check(await js(`(() => { __andy.startReady(20); const t0 = timeScale(); givePow('slow', __andy.G.x, __andy.G.y); const ok = Math.abs(timeScale() - t0 * SLOWMO) < 1e-6; __andy.run.pow = null; return ok; })()`), 'slowmotion-power-up: alles half zo snel');
  check(await js(`(() => { const u = UP_BY_ID.grip; return u.steps === 15 && upCost(u, 14) <= Math.round(u.base * UP_PRICE * Math.pow(u.growth, u.max - 1) / 5) * 5; })()`), 'upgrades in stapjes, zonder duurdere aankopen');

  console.log('Nieuwe biome, onder water en kisten');
  await js('__andy.startReady(null)'); await sleep(100);
  await js('__andy.press()');
  await until(`__andy.G.state === 'hang'`, 3000);
  await js(`(() => { const G = __andy.G; __andy.release(); __andy.unpress(); G.state = 'air'; G.x = START_X + BIOMES[2].start * PX_PER_M - TRANS.span - 400; G.y = -100; G.vx = 900; G.vy = -500; })()`);
  check(await until('!!__andy.G.auto', 1000), 'biomegrens: Andy grijpt vanzelf de reuzenliaan');
  check(await until('!!__andy.run.cine && __andy.run.biome === 2', 6000), 'over de afgrond: filmische overgang naar de Savanne');
  check(await until('!__andy.G.auto && __andy.G.state === "air" && __andy.G.vx > 1200', 8000), 'over de reuzenlianen en losgelaten met extra vaart');
  check(await js('biomeSeg(CYCLE_START + 100).i !== biomeSeg(CYCLE_START + CYCLE_LEN + 100).i && biomeSeg(CYCLE_START + 100).i < BIOMES.length'), 'na de laatste biome komen de biomes terug');
  await js('__andy.press()');
  await js(`(() => { const G = __andy.G; G.state = 'air'; G.x = START_X + 1500 * PX_PER_M; G.y = HAZARD_Y + 20; G.vy = 300; enterUnder(); loot.push({ x: G.x + 4, y: G.y, t: 0 }); })()`);
  check(await until(`__andy.G.state === 'swim' && __andy.run.under && __andy.run.loot === 1`, 3000), 'onder water, kist opgepakt');
  // naar het luchtgat zetten (een paar keer: de zwemstap kan Andy er net naast laten drijven); eerst moet er een zijn
  await until('__andy.run.under && __andy.run.under.exits.length > 0', 3000);
  for (let i = 0; i < 6 && await js('!!__andy.run.under'); i++) { await js(`(() => { const G = __andy.G, U = __andy.run.under; G.x = U.exits[0]; G.y = UNDER_TOP + 40; G.vx = 0; })()`); await until('!__andy.run.under', 300); }
  check(await until(`__andy.G.state === 'air' && !__andy.run.under`, 1000), 'via een luchtgat weer boven water');
  await esc(); await js(`document.getElementById('btnQuit').click()`);
  check(await until('__andy.save.boxes >= 1', 1000), 'kist na de run bewaard');
  await js(`document.getElementById('btnOverCrates').click()`); await sleep(100);
  await js(`document.getElementById('btnCrOpen').click()`); await sleep(100);
  check(await until(`__andy.crate.spinning === false && document.querySelector('.cr-card.win') !== null`, 9000), 'kist geopend');
  await js(`document.getElementById('btnCrBack').click()`);

  console.log('Carrière');
  // wereldkaart: het eerste bezoek speelt het intro-filmpje (wereld 1, pad naar level 1)
  await js(`(() => { const c = __andy.save.career; c.unlocked = 1; c.anim = 0; c.at = 1; __andy.openCareer(); })()`);
  check(await until(`__andy.curScreen === 'career' && !!__andy.MAP.cine`, 1500), 'wereldkaart opent met het intro-filmpje');
  check(await until('__andy.save.career.anim === 1 && !__andy.MAP.cine && !__andy.MAP.walk', 9000), 'pad naar level 1 gevuld, Andy staat erbij');
  // wereld voltooid: filmpje met de overtocht naar wereld 2
  await js(`(() => { const c = __andy.save.career; c.unlocked = 9; c.anim = 8; c.at = 8; __andy.openCareer(); })()`);
  check(await until('__andy.save.career.anim === 9 && __andy.MAP.at === 9', 12000), 'wereld 1 voltooid: overtocht naar wereld 2');
  await js(`document.getElementById('btnMapPlay').click()`);
  check(await until('!!__andy.MAP.load', 2500), 'level gekozen: inzoomen, dan het laadscherm');
  check(await until('__andy.game.career && __andy.game.career.n === 9 && __andy.curScreen === null', 5000), 'level 2-1 start na het laadscherm');
  // oude carrière (5 levels per wereld) wordt omgezet
  check(await js(`(() => { const s = normalizeSave({ career: { unlocked: 13, anim: 13, at: 12, stars: [3, 3, 3, 3, 2, 1, 1, 1, 1, 1, 1, 1] } }).career; return s.unlocked === 19 && s.stars[7] === 2 && s.stars[4] === 0 && s.stars[8] === 1 && s.lpw === LEVELS_PER_WORLD; })()`), 'oude carrière-voortgang omgezet naar 8 levels per wereld');
  // moeilijkheid schaalt mee met de upgrades
  check(await js(`(() => { const u = __andy.save.upgrades, keep = Object.assign({}, u); const a = levelInfo(20); for (const x of UPGRADES) u[x.id] = x.steps; const b = levelInfo(20); Object.assign(u, keep); return b.diff > a.diff + 0.2 && b.time < a.time; })()`), 'met alle upgrades is een level zwaarder en krapper');
  // baasgevecht met tijdslimiet en harten
  await js('__andy.startReady(16)');
  check(await js('!!__andy.run.boss && __andy.run.hearts === 3 && __andy.run.timeLeft > 0'), 'baasgevecht: baas, 3 harten en een tijdslimiet');
  await swing('__andy.press()', '__andy.unpress()', 1.5);
  await js(`__andy.careerFail('Tijd op!', 'test')`);
  check(await until(`__andy.curScreen === 'over' && document.getElementById('overTitle').textContent === 'Tijd op!'`, 4000), 'mislukt level: eigen eindtekst');
  await js('__andy.startReady(1)');
  check(await until('__andy.game.career && __andy.game.career.n === 1', 1000), 'level 1 start');
  await swing('__andy.press()', '__andy.unpress()', 1);
  for (const n of [57, 65, 73, 81, 89, 97, 105, 113]) { // de stijl-biomes (blokjes, Paint, 3D, snoep) en de nieuwe (woestijn, paddenstoelen, wolken, neon)
    await js(`__andy.startReady(${n})`);
    await swing('__andy.press()', '__andy.unpress()', 0.6);
    check(await js(`__andy.game.career.n === ${n}`), `level ${n} (${await js(`BIOMES[__andy.game.career.bi].name`)}) tekent zonder fouten`);
  }

  console.log('Op één scherm');
  await js(`__andy.localStart({ mode: 'race', len: 500 }, null)`); await skipCount();
  await swing('__andy.localPress(0); __andy.localPress(1)', '__andy.localUnpress(0); __andy.localUnpress(1)', 1.5);
  check(await js('__andy.LOCAL.on && __andy.LOCAL.worlds.length === 2'), 'twee werelden actief');
  check(await js(`(() => { const [a, b] = __andy.LOCAL.worlds; __andy.useWorld(0); return a.vines !== b.vines && a.G !== b.G && a.gen !== b.gen && __andy.G && __andy.G !== b.G; })()`), 'de werelden zijn los van elkaar');

  console.log('Tegen Kiwi');
  await js(`__andy.localStart({ mode: 'endurance' }, 3)`); await skipCount();
  await speed(2.5);
  await swing('__andy.localPress(0)', '__andy.localUnpress(0)', 1);
  await until('__andy.LOCAL.worlds[1].G && __andy.LOCAL.worlds[1].G.x > 700', 6000);
  await speed(1);
  check(await js('!!__andy.LOCAL.ai && __andy.LOCAL.worlds[1].G.x > 700'), `Kiwi komt vooruit (x = ${Math.round(await js('__andy.LOCAL.worlds[1].G ? __andy.LOCAL.worlds[1].G.x : 0'))})`);
  console.log('Achtervolging');
  await js(`__andy.localStart({ mode: 'chase' }, 3)`); await skipCount();
  check(await js(`__andy.LOCAL.cfg.mode === 'chase'`), 'achtervolging start');
  await speed(2.5);
  check(await until('__andy.LOCAL.result === 1', 15000), 'Kiwi pakt je'); // Kiwi (Expert) haalt een stilstaande Andy in
  await speed(1);
  await js(`document.getElementById('btnMpLeave').click()`); await sleep(100);
  await js('__andy.startReady(null)'); await sleep(100);
  check(await js('!__andy.LOCAL.on'), 'terug naar één speler');

  if (errors.length) throw new Error('JavaScript-fouten:\n  ' + errors.join('\n  '));
  console.log('Geen fouten.');
}

async function done(code) {
  const exited = new Promise(r => chrome.once('exit', r));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chromium ruimt nog op */ }
  process.exit(code);
}
main().then(() => done(0), e => {
  console.error(String(e.message || e));
  if (errors.length) console.error('JavaScript-fouten:\n  ' + errors.join('\n  '));
  done(1);
});
