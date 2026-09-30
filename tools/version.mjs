#!/usr/bin/env node
// Versie van het spel: een vingerafdruk (hash) van index.html, css/ en js/.
// Schrijft js/version.js (GAME_VERSION, voor het spel zelf), version.json (wat de server als nieuwste versie
// meldt) en zet ?v=<versie> achter elke script- en stylesheet-link in index.html, zodat een browser na een
// update nooit oude, gecachte bestanden gebruikt.
//
//   node tools/version.mjs           bijwerken (doe dit vóór elke commit die het spel verandert)
//   node tools/version.mjs --check   alleen controleren (exit 1 als de versie niet klopt)
//
// Online spelen kan alleen met dezelfde versie (zie "Versie" in js/mp-online.js).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => readFileSync(join(ROOT, f), 'utf8');
const norm = s => s.replace(/\r\n/g, '\n');
const stripV = html => html.replace(/(\b(?:src|href)="(?:js|css)\/[^"?]+)\?v=[^"]*"/g, '$1"');

export function computeVersion() {
  const files = ['index.html']
    .concat(readdirSync(join(ROOT, 'css')).filter(f => f.endsWith('.css')).sort().map(f => 'css/' + f))
    .concat(readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'version.js').sort().map(f => 'js/' + f));
  const h = createHash('sha1');
  for (const f of files) h.update(f + '\0' + norm(f === 'index.html' ? stripV(rd(f)) : rd(f)) + '\0');
  return h.digest('hex').slice(0, 10);
}
const versionJs = v => `'use strict';\n// Andy Apples · versie (automatisch gemaakt door tools/version.mjs, niet met de hand aanpassen)\nconst GAME_VERSION = '${v}';\n`;
const versionJson = v => JSON.stringify({ v }) + '\n';
const stamp = (html, v) => stripV(html).replace(/(\b(?:src|href)="(?:js|css)\/[^"?]+)"/g, `$1?v=${v}"`);

const v = computeVersion();
const want = { 'js/version.js': versionJs(v), 'version.json': versionJson(v), 'index.html': stamp(rd('index.html'), v) };
const stale = Object.keys(want).filter(f => { try { return norm(rd(f)) !== norm(want[f]); } catch (e) { return true; } });
if (process.argv.includes('--check')) {
  if (stale.length) { console.log(`Versie klopt niet (${stale.join(', ')}). Draai: node tools/version.mjs`); process.exit(1); }
  console.log('Versie ' + v);
} else {
  for (const f of stale) writeFileSync(join(ROOT, f), want[f]);
  console.log(`Versie ${v}${stale.length ? ` (bijgewerkt: ${stale.join(', ')})` : ' (al goed)'}`);
}
