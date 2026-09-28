#!/usr/bin/env node
// Prestatiemeting: opent index.html in een headless Chromium en meet per kwaliteitsniveau en per biome hoe zwaar
// een beeld is, plus hoeveel geheugen de achtergrondtegels innemen. Zelfde opzet als smoke.mjs (geen npm nodig).
//
//   node tools/perf.mjs                  (zoekt zelf chromium / google-chrome)
//   CHROME=/pad/naar/chrome node tools/perf.mjs
//
// Headless Chromium tekent meestal zonder grafische kaart (SwiftShader). De absolute getallen zijn dus die van een
// trage machine; vergelijk vooral vóór/na een wijziging op dezelfde machine.
// Kolommen: fps en p95 (ms) van de beeldtijd; step/render = rekenwerk per beeld (ms); bg = het samenstellen van de
// achtergrondbuffer (ms, het zwaarste deel van render); tegels/s = nieuw getekende achtergrondtegels per seconde.
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
const profile = mkdtempSync(join(tmpdir(), 'andy-perf-'));
const chrome = spawn(findChrome(), ['--headless=new', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1920,1080',
  ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}\n  -> ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

// Meethaken in de pagina: tijd per functie, en de tijd van de drawImage die de achtergrondbuffer op het beeld zet
// (daar rastert de browser alle uitgestelde tekenopdrachten van die buffer).
const HOOKS = `(() => {
  Sfx.init = () => {};
  window.__T = { step: 0, render: 0, bg: 0 };
  for (const n of ['step', 'render']) { const f = window[n]; window[n] = function () { const a = performance.now(); try { return f.apply(this, arguments); } finally { __T[n] += performance.now() - a; } }; }
  const di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img) {
    if (img !== bgCanvas) return di.apply(this, arguments);
    const a = performance.now(); try { return di.apply(this, arguments); } finally { __T.bg += performance.now() - a; }
  };
})()`;
// Andy vliegt steeds rechtdoor door de lucht (valt nooit), zodat de camera en de generator gelijkmatig doorlopen
const fly = (m, vx) => `(async () => {
  __andy.startReady(null); await new Promise(r => setTimeout(r, 200));
  __andy.press(); await new Promise(r => setTimeout(r, 300)); __andy.release();
  const G = __andy.G; G.x = START_X + ${m} * PX_PER_M;
  clearInterval(window.__fly);
  window.__fly = setInterval(() => { const G = __andy.G; if (!G || G.state === 'dead') return; G.state = 'air'; G.vine = null; G.y = 300; G.vy = -200; G.vx = ${vx}; }, 50);
})()`;
const stop = `(() => { clearInterval(window.__fly); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); document.getElementById('btnQuit').click(); })()`;
async function measure(secs) {
  await js(`(() => { for (const k in __T) __T[k] = 0; window.__fr = []; window.__on = true; window.__t0 = performance.now(); window.__tb = __andy.perf.tiles;
    let l = performance.now(); requestAnimationFrame(function f(n) { __fr.push(n - l); l = n; if (__on) requestAnimationFrame(f); }); })()`);
  await sleep(secs * 1000);
  return js(`(() => { __on = false; const dt = performance.now() - __t0, fr = __fr.slice(2).sort((a, b) => a - b), n = fr.length;
    return { fps: n * 1000 / dt, p95: fr[Math.floor(n * 0.95)], step: __T.step / n, render: __T.render / n, bg: __T.bg / n, tiles: (__andy.perf.tiles - __tb) * 1000 / dt }; })()`);
}
const cacheMB = () => js(`(() => { let px = 0; for (const k in layerCaches) for (const T of layerCaches[k].map.values()) if (T.c) px += T.c.width * T.c.height;
  for (const c of tilePool) px += c.width * c.height; return px * 4 / 1e6; })()`);

const BIOME_M = [['Jungle', 100], ['IJsbergen', 2000], ['Vulkaan', 3000], ['Portaalwoud', 5300], ['3D-wereld', 8600], ['Snoepland', 9800]];
const f1 = v => v.toFixed(1).padStart(6), f2 = v => v.toFixed(2).padStart(6);

async function main() {
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
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(1500);
  await js(HOOKS);
  const w = await js(`document.getElementById('game').width + '×' + document.getElementById('game').height`);
  console.log(`Beeld ${w} · ${PAGE}\n`);
  console.log('kwaliteit  biome           fps    p95   step render     bg tegels/s');
  for (const q of [4, 2, 0]) {
    await js(`__andy.setQualityChoice(1); __andy.setQuality(${q})`);
    for (const [name, m] of BIOME_M) {
      await js(fly(m, 700)); await sleep(2000);
      const r = await measure(2.5);
      console.log(`${String(q).padEnd(10)} ${name.padEnd(12)} ${f1(r.fps)} ${f1(r.p95)} ${f2(r.step)} ${f2(r.render)} ${f2(r.bg)} ${f1(r.tiles)}`);
      await js(stop); await sleep(200);
    }
  }
  // geheugen van de tegelcache na een flink stuk hardlopen (door meerdere biomes heen)
  await js(`__andy.setQuality(4)`);
  await js(fly(100, 2500)); await sleep(30000);
  const dist = await js('Math.round(__andy.run.dist)');
  console.log(`\nTegelcache na 30 s (kwaliteit 4, ${dist} m): ${(await cacheMB()).toFixed(0)} MB`);
  await js(stop);
}

async function done(code) {
  const exited = new Promise(r => chrome.once('exit', r));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chromium ruimt nog op */ }
  process.exit(code);
}
main().then(() => done(0), e => { console.error(String(e.message || e)); done(1); });
