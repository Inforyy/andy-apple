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
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });

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
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
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

  console.log('Carrière');
  await js('__andy.startReady(1)'); await sleep(300);
  check(await js('__andy.game.career && __andy.game.career.n === 1'), 'level 1 start');
  await swing('__andy.press()', '__andy.unpress()', 2);

  console.log('Op één scherm');
  await js(`__andy.localStart({ mode: 'race', len: 500 }, null)`); await sleep(4200); // aftellen
  await swing('__andy.localPress(0); __andy.localPress(1)', '__andy.localUnpress(0); __andy.localUnpress(1)', 3);
  check(await js('__andy.LOCAL.on && __andy.LOCAL.worlds.length === 2'), 'twee werelden actief');
  check(await js(`(() => { const [a, b] = __andy.LOCAL.worlds; __andy.useWorld(0); return a.vines !== b.vines && a.G !== b.G && a.gen !== b.gen && __andy.G && __andy.G !== b.G; })()`), 'de werelden zijn los van elkaar');

  console.log('Tegen Kiwi');
  await js(`__andy.localStart({ mode: 'endurance' }, 3)`); await sleep(4200);
  await swing('__andy.localPress(0)', '__andy.localUnpress(0)', 5);
  check(await js('!!__andy.LOCAL.ai && __andy.LOCAL.worlds[1].G.x > 700'), `Kiwi komt vooruit (x = ${Math.round(await js('__andy.LOCAL.worlds[1].G ? __andy.LOCAL.worlds[1].G.x : 0'))})`);
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
