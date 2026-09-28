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
const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720',
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
  await sleep(1500);

  console.log('Opstarten');
  check(await js('typeof window.__andy === "object"'), '__andy-haak bestaat');
  check(await js('__andy.curScreen') === 'menu', 'hoofdmenu staat open');

  console.log('Menu\'s');
  for (const [open, back, screen] of [['btnShop', 'btnShopBack', 'shop'], ['btnSaves', 'btnSavesBack', 'saves'], ['btnHelp', 'btnHelpBack', 'help'],
    ['btnSettings', 'btnSettingsBack', 'settings'], ['btnCareer', 'btnCareerBack', 'career'], ['btnMulti', 'btnMpBack', 'mp']]) {
    await js(`document.getElementById('${open}').click()`); await sleep(150);
    check(await js('__andy.curScreen') === screen, `${open} opent '${screen}'`);
    await js(`document.getElementById('${back}').click()`); await sleep(100);
  }
  await js(`document.getElementById('btnSettings').click(); document.getElementById('btnDebug').click()`); await sleep(100);
  check(await js('__andy.curScreen') === 'debug', 'debugscherm opent');
  await js(`document.getElementById('btnDebugBack').click(); document.getElementById('btnSettingsBack').click()`);

  // Houdt de knop in/los in een vast ritme: grijpen, zwaaien, loslaten
  const swing = (pressFn, unpressFn, secs) => js(`(async () => {
    const end = performance.now() + ${secs * 1000};
    while (performance.now() < end) { ${pressFn}; await new Promise(r => setTimeout(r, 700)); ${unpressFn}; await new Promise(r => setTimeout(r, 250)); }
  })()`);

  console.log('Eindeloos');
  await js('__andy.startReady(null)'); await sleep(300);
  await js('__andy.press()'); await sleep(300);
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))`); await sleep(150);
  check(await js('__andy.game.paused === true'), 'Esc pauzeert');
  await js(`document.getElementById('btnResume').click()`); await sleep(100);
  check(await js('__andy.game.paused === false'), 'verder spelen');
  await js('__andy.unpress()');
  await swing('__andy.press()', '__andy.unpress()', 4);
  check(await js('__andy.run && __andy.run.dist > 0'), `Andy komt vooruit (${Math.round(await js('__andy.run ? __andy.run.dist : 0'))} m)`);
  check(await js('__andy.vines.length > 5'), 'lianen worden gegenereerd');
  // nog onderweg: via pauze stoppen; al gevallen: het eindscherm staat er al
  if (await js('__andy.curScreen') !== 'over') {
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))`); await sleep(150);
    await js(`document.getElementById('btnQuit').click()`);
  }
  await sleep(2500); // eindscherm verschijnt na de valanimatie
  check(await js('__andy.curScreen') === 'over', 'eindscherm na de run');
  await js(`document.getElementById('btnOverMenu').click()`); await sleep(150);
  check(await js('__andy.curScreen') === 'menu', 'terug naar het menu');

  console.log('Head-start');
  await js('__andy.save.apples = 100; __andy.startReady(null)'); await sleep(300);
  check(await js(`!document.getElementById('headStart').classList.contains('hidden')`), 'head-start-knoppen staan klaar');
  await js(`document.querySelector('[data-hs="0"]').click()`); await sleep(1500);
  check(await js('__andy.G.state === "rocket" && __andy.save.apples === 40'), 'head-start gekocht: Andy vliegt');
  console.log('Ruimte');
  await js(`(() => { const G = __andy.G; G.state = 'air'; G.vine = null; G.y = -3300; G.vy = -1250; G.vx = 700; __andy.run.launchT = 6; })()`); await sleep(1000);
  check(await js('__andy.run.space && __andy.vines.some(v => v.space) && __andy.spaceObjs.length > 0'), 'in de ruimte: sterrenlianen en planetoïden');
  await swing('__andy.press()', '__andy.unpress()', 2);
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))`); await sleep(150);
  await js(`document.getElementById('btnQuit').click()`); await sleep(300);

  console.log('Nieuwe biome, onder water en kisten');
  await js('__andy.startReady(null)'); await sleep(200);
  await js('__andy.press()'); await sleep(800);
  await js(`(() => { const G = __andy.G; __andy.release(); G.state = 'air'; G.x = START_X + 1095 * PX_PER_M; G.y = -100; G.vx = 900; G.vy = -500; })()`); await sleep(600);
  check(await js('!!__andy.run.cine && __andy.run.biome === 2'), 'filmische overgang naar de Savanne');
  check(await js('biomeSeg(11500).i !== biomeSeg(12700).i && biomeSeg(11500).i < BIOMES.length'), 'na de laatste biome komen de biomes terug');
  await js(`(() => { const G = __andy.G; G.state = 'air'; G.x = START_X + 1500 * PX_PER_M; G.y = HAZARD_Y + 20; G.vy = 300; enterUnder(); loot.push({ x: G.x + 4, y: G.y, t: 0 }); })()`); await sleep(1500);
  check(await js(`__andy.G.state === 'swim' && __andy.run.under && __andy.run.loot === 1`), 'onder water, kist opgepakt');
  await js(`(() => { const G = __andy.G, U = __andy.run.under; G.x = U.exits[0]; G.y = HAZARD_Y + 150; })()`); await sleep(500);
  check(await js(`__andy.G.state === 'air' && !__andy.run.under`), 'via een luchtgat weer boven water');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))`); await sleep(150);
  await js(`document.getElementById('btnQuit').click()`); await sleep(300);
  check(await js('__andy.save.boxes >= 1'), 'kist na de run bewaard');
  await js(`document.getElementById('btnOverCrates').click()`); await sleep(200);
  await js(`document.getElementById('btnCrOpen').click()`); await sleep(6200);
  check(await js(`__andy.crate.spinning === false && document.querySelector('.cr-card.win') !== null`), 'kist geopend');
  await js(`document.getElementById('btnCrBack').click()`); await sleep(200);

  console.log('Carrière');
  await js('__andy.startReady(1)'); await sleep(300);
  check(await js('__andy.game.career && __andy.game.career.n === 1'), 'level 1 start');
  await swing('__andy.press()', '__andy.unpress()', 2);
  for (const n of [36, 41, 46, 51]) { // de stijl-biomes (blokjes, Paint, 3D, snoep)
    await js(`__andy.startReady(${n})`); await sleep(200);
    await swing('__andy.press()', '__andy.unpress()', 1);
    check(await js(`__andy.game.career.n === ${n}`), `level ${n} (${await js(`BIOMES[__andy.game.career.bi].name`)}) tekent zonder fouten`);
  }

  console.log('Op één scherm');
  await js(`__andy.localStart({ mode: 'race', len: 500 }, null)`); await sleep(4200); // aftellen
  await swing('__andy.localPress(0); __andy.localPress(1)', '__andy.localUnpress(0); __andy.localUnpress(1)', 3);
  check(await js('__andy.LOCAL.on && __andy.LOCAL.worlds.length === 2'), 'twee werelden actief');
  check(await js(`(() => { const [a, b] = __andy.LOCAL.worlds; __andy.useWorld(0); return a.vines !== b.vines && a.G !== b.G && a.gen !== b.gen && __andy.G && __andy.G !== b.G; })()`), 'de werelden zijn los van elkaar');

  console.log('Tegen Kiwi');
  await js(`__andy.localStart({ mode: 'endurance' }, 3)`); await sleep(4200);
  await swing('__andy.localPress(0)', '__andy.localUnpress(0)', 5);
  check(await js('!!__andy.LOCAL.ai && __andy.LOCAL.worlds[1].G.x > 700'), `Kiwi komt vooruit (x = ${Math.round(await js('__andy.LOCAL.worlds[1].G ? __andy.LOCAL.worlds[1].G.x : 0'))})`);
  console.log('Achtervolging');
  await js(`__andy.localStart({ mode: 'chase' }, 3)`); await sleep(4200);
  check(await js(`__andy.LOCAL.cfg.mode === 'chase'`), 'achtervolging start');
  await sleep(12000); // Kiwi (Expert) haalt een stilstaande Andy in
  check(await js(`__andy.LOCAL.result === 1`), 'Kiwi pakt je');
  await js(`document.getElementById('btnMpLeave').click()`); await sleep(200);
  await js('__andy.startReady(null)'); await sleep(200);
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
