'use strict';
// Andy Apples · spelverloop en interface
// Spelverloop (start, game over, XP), menuschermen, invoer en HUD.

// =====================================================================
//  Spelverloop
// =====================================================================
let curScreen = null, shopReturn = 'menu', bannerTimer = 0;
function showScreen(id) {
  curScreen = id;
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
  $('hud').classList.toggle('hidden', !(game.mode === 'ready' || game.mode === 'playing' || game.mode === 'dying' || game.mode === 'done' || game.mode === 'mpcount' || game.mode === 'mpend'));
}
function showBanner(big, small) {
  const b = $('banner');
  b.querySelector('.big').textContent = big;
  b.querySelector('.small').textContent = small || '';
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 2800);
}
function mpLeaveMatch() {
  game.mp = null; MP.match = null; ghostPin.v = null;
  $('mpHud').classList.add('hidden'); $('mpCount').textContent = '';
}
function toMenu() {
  game.paused = false; Music.duck();
  game.career = null;
  localExit(); MP.local = false;
  mpLeaveMatch();
  if (mpActive()) mpClose(true);
  lobbyUnwatch();
  resetWorld();
  game.mode = 'menu';
  refreshMenu();
  showScreen('menu');
}
// level = null: eindeloze modus; anders een carrière-level
function startReady(level) {
  game.paused = false; Music.duck();
  game.career = typeof level === 'number' ? levelInfo(level) : null;
  if (mpActive()) mpClose(true);
  lobbyUnwatch();
  localExit(); MP.local = false;
  mpLeaveMatch();
  resetWorld();
  game.mode = 'ready';
  input.down = false;
  showScreen(null);
  const C = game.career;
  if (C) showBanner(`Level ${C.n}`, `${BIOMES[C.bi].name} · ${C.L} m`);
  else if (save.runs < 3) showBanner('Jungle', 'Houd ingedrukt om te springen');
}
function retry() { startReady(game.career ? game.career.n : null); }
function begin() {
  game.mode = 'playing';
  if (lvl('rocket') > 0 && !game.career) startRocket(); else jump();
}
// XP: vooral afstand, plus wat voor trucs en appels
function awardXp(extra) {
  const before = playerLevel(save.xp).L;
  const gain = Math.floor(run.dist) + run.tricks * 5 + Math.floor(run.picked / 2) + (extra || 0);
  save.xp += gain;
  const after = playerLevel(save.xp).L;
  const fresh = UPGRADES.filter(u => u.unlock && u.unlock > before && u.unlock <= after);
  return { gain, levelUp: after > before, level: after, fresh };
}
function xpHtml(res) {
  const P = playerLevel(save.xp);
  let h = `<div class="xp"><div class="xp-top"><b>Level ${P.L}</b><span>+${res.gain} XP</span></div><div class="xp-bar"><i style="width:${Math.round(P.into / P.need * 100)}%"></i></div></div>`;
  if (res.levelUp) h += `<div class="record">Level ${res.level}!${res.fresh.length ? ' Nieuw: ' + res.fresh.map(u => u.name).join(', ') : ''}</div>`;
  return h;
}
function levelComplete() {
  const C = game.career;
  game.mode = 'done';
  const fromApples = Math.max(0, Math.floor(run.earned + 1e-6));
  const ratio = run.appleTotal ? run.picked / run.appleTotal : 1;
  const stars = 1 + (ratio >= 0.35 ? 1 : 0) + (ratio >= 0.65 ? 1 : 0);
  const prev = save.career.stars[C.n - 1];
  const bonus = prev ? 5 : 15 + C.n * 5;
  const earned = fromApples + bonus;
  save.apples += earned; save.totalApples += run.picked; save.runs++;
  save.career.stars[C.n - 1] = Math.max(prev, stars);
  if (C.n < LEVELS) save.career.unlocked = Math.max(save.career.unlocked, C.n + 1);
  const xp = awardXp(20 + C.n * 4);
  persist();
  confetti(G.x + 100, G.y - 150, 120); flashT = 0.3; Sfx.jingle(C.bi);
  $('doneTitle').textContent = `Level ${C.n} gehaald!`;
  $('doneStars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
  $('dnApples').textContent = `${run.picked} / ${run.appleTotal}`;
  $('dnEarned').textContent = fromApples;
  $('dnBonus').textContent = bonus + (prev ? ' (herhaling)' : '');
  $('dnTotal').textContent = '+' + earned + ' 🍎';
  $('dnBank').textContent = save.apples;
  $('dnXp').innerHTML = xpHtml(xp);
  $('btnNextLevel').style.display = C.n < LEVELS ? '' : 'none';
  setTimeout(() => { if (game.mode === 'done') { showScreen('done'); $('hint').textContent = ''; } }, 900);
}
function gameOver(quit) {
  game.mode = 'over';
  const fromApples = Math.max(0, Math.floor(run.earned + 1e-6));
  const dist = Math.floor(run.dist);
  const fromDist = Math.floor(dist / 20);
  const earned = fromApples + fromDist;
  const record = !game.career && dist > save.best;
  save.apples += earned;
  if (!game.career) save.best = Math.max(save.best, dist);
  save.totalApples += run.picked;
  save.totalDistance += dist;
  save.runs++;
  if (!game.career) save.maxBiome = Math.max(save.maxBiome, biomeIndexAt(dist));
  const ranked = !game.career && DBG.speed === 1; // runs met een aangepaste debug-snelheid tellen niet mee
  if (ranked) save.lbBest = Math.max(save.lbBest, dist);
  const xp = awardXp();
  persist();
  $('btnOverLb').style.display = game.career || !lbOn() ? 'none' : '';
  $('ovRank').classList.add('hidden');
  if (ranked && lbOn()) {
    lbSubmit().then(() => lbRank()).then(r => {
      if (curScreen !== 'over' || !r) return;
      $('ovRank').textContent = `Ranglijst: #${r} met ${save.lbBest} m`;
      $('ovRank').classList.remove('hidden');
    }).catch(() => { /* offline: wordt later verstuurd */ });
  }
  $('ovXp').innerHTML = xpHtml(xp);
  $('btnOverLevels').style.display = game.career ? '' : 'none';
  $('ovDistLabel').textContent = game.career ? `Afstand (finish ${game.career.L} m)` : 'Afstand';

  const hz = BIOMES[biomeIndexAt(run.dist)].hazardName;
  const [title, reason] = quit ? ['Run gestopt', 'Je appels zijn bewaard.'] : ['Plons!', `Andy viel in ${hz}.`];
  $('overTitle').textContent = title;
  $('overReason').textContent = reason;
  $('ovDist').textContent = dist + ' m';
  $('ovApples').textContent = fromApples;
  $('ovStolen').textContent = '−' + run.stolen;
  $('ovStolenRow').style.display = run.stolen > 0 ? '' : 'none';
  $('ovBD').textContent = fromDist;
  $('ovTotal').textContent = '+' + earned + ' 🍎';
  $('overRecord').classList.toggle('hidden', !record || dist < 5);
  setBadge($('btnOverShop'), affordableCount());
  $('hint').textContent = '';
  showScreen('over');
}
function pauseGame() {
  const multi = !!game.mp && !game.mp.local; // op één scherm mag je gewoon pauzeren
  $('pauseTitle').textContent = multi ? 'Menu' : 'Pauze';
  $('pauseSub').textContent = multi ? 'Het potje loopt door!' : '';
  $('btnResume').textContent = '▶ Doorgaan';
  $('btnQuit').textContent = multi ? 'Opgeven' : 'Stoppen';
  if (multi) { // in multiplayer kun je niet pauzeren
    if (game.mode !== 'playing' || game.mp.result) return;
    input.down = false;
    showScreen('pause');
    return;
  }
  if (game.mode !== 'playing' && game.mode !== 'ready') return;
  if (game.paused) return;
  game.paused = true;
  input.down = false;
  Music.duck();
  showScreen('pause');
}
function resumeGame() {
  game.paused = false;
  Music.duck();
  if (G.state === 'hang' && game.mode === 'playing' && !game.mp) game.holdLock = true;
  input.down = false;
  showScreen(null);
}

// =====================================================================
//  UI
// =====================================================================
function affordableCount() {
  let n = 0;
  for (const u of UPGRADES) { const l = lvl(u.id); if (unlocked(u) && l < u.max && save.apples >= upCost(u, l)) n++; }
  return n;
}
function setBadge(btn, n) {
  let b = btn.querySelector('.badge');
  if (n > 0) { if (!b) { b = document.createElement('span'); b.className = 'badge'; btn.appendChild(b); } b.textContent = n; }
  else if (b) b.remove();
}
function statsHtml() {
  const b = BIOMES[save.maxBiome];
  return `<div class="stat">🍎 ${save.apples}</div><div class="stat">Record ${save.best} m</div>` +
    `<div class="stat">${save.totalApples} geplukt</div><div class="stat">${b.name}</div>` +
    `<div class="stat">${save.runs} runs</div>` + (save.mpGames ? `<div class="stat">${save.mpWins} / ${save.mpGames} gewonnen</div>` : '');
}
function refreshMenu() {
  const PL = playerLevel(save.xp);
  $('mmApples').textContent = save.apples;
  $('mmLevel').textContent = PL.L;
  $('mmXp').textContent = `${PL.into} / ${PL.need} XP`;
  $('mmRing').style.setProperty('--p', Math.round(PL.into / PL.need * 100));
  const stars = save.career.stars.reduce((a, b) => a + b, 0);
  const next = Math.min(save.career.unlocked, LEVELS);
  $('mmCareer').textContent = `Level ${next} · ★ ${stars} / ${LEVELS * 3}`;
  $('mmEndless').textContent = save.best ? `Record: ${save.best} m` : 'Kom zo ver mogelijk';
  $('mmMulti').textContent = save.mpGames ? `${save.mpWins} van ${save.mpGames} gewonnen` : 'Tegen een vriend';
  $('menuStats').innerHTML = statsHtml();
  $('btnRotate').textContent = rotPref ? 'Staand spelen' : 'Liggend spelen';
  $('btnFullscreen').textContent = isFullscreen() ? 'Volledig scherm uit' : 'Volledig scherm';
  $('btnFullscreen').classList.toggle('hidden', !canFullscreen || IN_APP);
  $('btnRotate').classList.toggle('hidden', IN_APP);
  renderQuality();
  $('saveStats').innerHTML = statsHtml();
  setBadge($('btnShop'), affordableCount());
  $('btnLb').classList.toggle('hidden', !lbOn());
  $('btnAccount').classList.toggle('hidden', !sbOn());
  const snd = save.sound ? 'Geluid aan' : 'Geluid uit';
  const mus = save.music ? 'Muziek aan' : 'Muziek uit';
  $('btnSound').textContent = snd; $('btnPauseSound').textContent = snd;
  $('btnMusic').textContent = mus; $('btnPauseMusic').textContent = mus;
}
// schuifje grafische kwaliteit (Instellingen); bij Auto staat erbij welk niveau het spel nu gebruikt
function renderQuality() {
  const c = qualityChoice(), r = $('qualRange');
  r.value = c; r.style.setProperty('--p', c / 3 * 100);
  $('qualNow').textContent = qAuto ? `nu: ${QUALITY_NAMES[qLevel]}` : '';
  for (const t of document.querySelectorAll('.qual-ticks [data-q]')) t.classList.toggle('on', +t.dataset.q === c);
}
function renderShop() {
  $('shopBank').textContent = save.apples;
  const PL = playerLevel(save.xp);
  $('shopLvl').textContent = `Level ${PL.L} · ${PL.into} / ${PL.need} XP`;
  const grid = $('shopGrid');
  grid.innerHTML = '';
  const locked = [];
  for (const u of UPGRADES) {
    if (!unlocked(u)) { locked.push(u); continue; }
    const l = lvl(u.id), maxed = l >= u.max, cost = maxed ? 0 : upCost(u, l);
    const card = document.createElement('div');
    card.className = 'card' + (maxed ? ' maxed' : '');
    card.title = `${u.info}\n${u.fx(l)}${maxed ? '' : ' → ' + u.fx(l + 1)}`;
    let pips = '';
    for (let i = 0; i < u.max; i++) pips += `<i class="${i < l ? 'on' : ''}"></i>`;
    card.innerHTML = `<span class="ic">${u.icon}</span><div class="card-mid"><b>${u.name}</b><small>${u.info}</small><div class="pips">${pips}</div></div>`;
    const b = document.createElement('button');
    const can = !maxed && save.apples >= cost;
    b.className = 'btn buy' + (can ? ' green' : '');
    b.disabled = !can;
    b.textContent = maxed ? 'MAX' : `🍎 ${cost}`;
    b.addEventListener('click', () => buy(u));
    card.appendChild(b);
    grid.appendChild(card);
  }
  locked.sort((x, y) => x.unlock - y.unlock);
  $('shopLocks').innerHTML = locked.map(u => `<span title="${escHtml(u.info)}">🔒 Level ${u.unlock}: ${u.name}</span>`).join('');
}
function buy(u) {
  const l = lvl(u.id);
  if (l >= u.max || !unlocked(u)) return;
  const c = upCost(u, l);
  if (save.apples < c) return;
  save.apples -= c;
  save.upgrades[u.id] = l + 1;
  persist();
  Sfx.buy();
  renderShop();
  refreshMenu();
  if (game.mode === 'over') setBadge($('btnOverShop'), affordableCount());
}
function renderCareer() {
  const st = save.career.stars;
  $('carStars').textContent = st.reduce((a, b) => a + b, 0) + ' / ' + LEVELS * 3;
  const grid = $('levelGrid'); grid.innerHTML = '';
  for (let n = 1; n <= LEVELS; n++) {
    const I = levelInfo(n), open = n <= save.career.unlocked, b = document.createElement('button');
    b.className = 'lv' + (open ? '' : ' locked');
    b.style.background = open ? `linear-gradient(${BIOMES[I.bi].c.skyTop}, ${BIOMES[I.bi].c.mid})` : '';
    b.innerHTML = open ? `<b>${n}</b><span>${[0, 1, 2].map(i => i < st[n - 1] ? '★' : '☆').join('')}</span>` : `<b>🔒</b><small>${n}</small>`;
    b.disabled = !open;
    b.addEventListener('click', () => { Sfx.init(); startReady(n); });
    grid.appendChild(b);
  }
}
function openCareer() { renderCareer(); showScreen('career'); }
function openShop(from) { shopReturn = from; renderShop(); showScreen('shop'); }
function saveMsg(text, ok) { const m = $('saveMsg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'err'); }
function afterImport() {
  refreshMenu();
  renderShop();
  saveMsg('Save geïmporteerd.', true);
  Sfx.buy();
}
function on(id, fn) {
  (typeof id === 'string' ? $(id) : id).addEventListener('click', e => { Sfx.init(); e.currentTarget.blur(); fn(e); });
}


// ---- Debug-instellingen: zoom en snelheid, achter een wachtwoord ----
function renderDbg() {
  $('dbgLock').classList.toggle('hidden', DBG.open);
  $('dbgBox').classList.toggle('hidden', !DBG.open);
  $('dbgZoom').value = DBG.zoom; $('dbgSpeed').value = DBG.speed;
  $('dbgZoomV').textContent = Math.round(DBG.zoom * 100) + '%';
  $('dbgSpeedV').textContent = Math.round(DBG.speed * 100) + '%';
  $('btnDbgFps').textContent = DBG.fps ? 'FPS-meter uit' : 'FPS-meter aan';
}
function dbgUnlock() {
  if (checksum('andy-debug:' + $('dbgPass').value) === DBG_HASH) { DBG.open = true; dbgPersist(); $('dbgMsg').textContent = ''; renderDbg(); }
  else { $('dbgMsg').textContent = 'Onjuist wachtwoord.'; $('dbgMsg').className = 'msg err'; }
  $('dbgPass').value = '';
}

// Bij het opstarten (vanuit main.js): alle menuknoppen en schermen
function uiInit() {
  on('btnDebug', () => { $('dbgPass').value = ''; $('dbgMsg').textContent = ''; renderDbg(); showScreen('debug'); if (!DBG.open) setTimeout(() => $('dbgPass').focus(), 50); });
  on('btnDbgUnlock', dbgUnlock);
  $('dbgPass').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dbgUnlock(); } });
  $('dbgZoom').addEventListener('input', e => { DBG.zoom = clamp(+e.target.value || 1, 0.4, 2.5); dbgPersist(); resize(); renderDbg(); });
  $('dbgSpeed').addEventListener('input', e => { DBG.speed = clamp(+e.target.value || 1, 0.25, 2.5); dbgPersist(); renderDbg(); });
  on('btnDbgReset', () => { DBG.zoom = 1; DBG.speed = 1; dbgPersist(); resize(); renderDbg(); });
  on('btnDbgFps', () => { DBG.fps = !DBG.fps; dbgPersist(); renderDbg(); });
  on('btnDbgLock', () => { DBG.open = false; DBG.zoom = 1; DBG.speed = 1; DBG.fps = false; dbgPersist(); resize(); renderDbg(); });
  $('qualRange').addEventListener('input', e => { setQualityChoice(+e.target.value); renderQuality(); });
  for (const t of document.querySelectorAll('.qual-ticks [data-q]')) t.addEventListener('click', () => { setQualityChoice(+t.dataset.q); renderQuality(); });
  on('btnDebugBack', () => { refreshMenu(); showScreen('settings'); });

  on('btnPlay', () => startReady(null));
  on('btnMulti', openMp);
  on('btnMpBack', toMenu);
  on('btnMpSetup', () => showScreen('mpSetup'));
  on('btnMpSetupBack', () => { mpRender(); showScreen('mp'); });
  on('btnMpHost', () => { MP.local = false; mpLobbyHost(); });
  on('btnMpShare', mpShare);
  on('btnMpManualHost', () => { MP.local = false; mpHost(); });
  on('btnMpJoin', () => { MP.local = false; mpJoinStart(); });
  on('btnMpLocal', () => { mpClose(false); MP.local = true; MP.aiLvl = null; mpMsg(''); mpRender(); });
  const AI_KEY = 'andyApples.aiLevel';
  on('btnMpAi', () => { mpClose(false); MP.local = true; let l = 1; try { l = clamp(+(localStorage.getItem(AI_KEY) || 1), 0, 3); } catch (e) { /* */ } MP.aiLvl = l; mpMsg(''); mpRender(); });
  for (const b of document.querySelectorAll('[data-ai]')) on(b, () => { MP.aiLvl = +b.dataset.ai; try { localStorage.setItem(AI_KEY, MP.aiLvl); } catch (e) { /* */ } mpRender(); });
  on('btnMpConnect', mpConnect);
  on('btnMpMakeAnswer', mpMakeAnswer);
  on('btnMpCopyOffer', () => mpCopy('mpOffer'));
  on('btnMpCopyAnswer', () => mpCopy('mpAnswer'));
  on('btnMpCancel', () => { if (MP.local) { MP.local = false; MP.aiLvl = null; } else mpClose(MP.inRoom); mpMsg(''); mpRender(); });
  on('mpModeRace', () => mpSelect('race'));
  on('mpModeEnd', () => mpSelect('endurance'));
  for (const b of document.querySelectorAll('[data-len]')) on(b, () => mpSelect(null, +b.dataset.len));
  on('btnMpStart', () => MP.local ? localStart(MP.sel, MP.aiLvl) : mpHostStart(MP.sel));
  on('btnMpAgain', mpAgain);
  on('btnMpLobby', () => { mpLeaveMatch(); openMp(); });
  on('btnMpLeave', toMenu);
  $('mpName').addEventListener('input', e => {
    const n = setMyName(e.target.value);
    if (MP.role === 'host') { rosterSend(); lobbyTrack(); } else mpSend({ type: 'hello', name: n || 'Andy' });
    if (MP.inRoom) mpRender();
  });
  on('btnCareer', openCareer);
  on('btnCareerBack', toMenu);
  on('btnNextLevel', () => startReady(game.career.n + 1));
  on('btnDoneRetry', retry);
  on('btnDoneLevels', () => { toMenu(); openCareer(); });
  on('btnDoneShop', () => openShop('done'));
  on('btnOverLevels', () => { toMenu(); openCareer(); });
  on('btnShop', () => openShop('menu'));
  on('btnSaves', () => { $('saveMsg').textContent = ''; refreshMenu(); showScreen('saves'); });
  on('btnHelp', () => showScreen('help'));
  on('btnSettings', () => { refreshMenu(); showScreen('settings'); });
  on('btnSettingsBack', () => showScreen('menu'));
  on('btnFullscreen', () => { toggleFullscreen().then(refreshMenu); refreshMenu(); });
  on('btnRotate', () => { toggleRotate().then(refreshMenu); refreshMenu(); });
  document.addEventListener('fullscreenchange', refreshMenu);
  document.addEventListener('webkitfullscreenchange', refreshMenu);
  on('btnHelpBack', () => showScreen('menu'));
  const toggleSound = () => { save.sound = !save.sound; persist(); refreshMenu(); };
  const toggleMusic = () => { save.music = !save.music; persist(); refreshMenu(); if (save.music) Music.start(); else Music.stop(); };
  on('btnSound', toggleSound);
  on('btnPauseSound', toggleSound);
  on('btnMusic', toggleMusic);
  on('btnPauseMusic', toggleMusic);
  on('btnShopBack', () => { if (shopReturn === 'done') $('dnBank').textContent = save.apples; if (shopReturn === 'over') setBadge($('btnOverShop'), affordableCount()); refreshMenu(); showScreen(shopReturn); });
  on('btnShopPlay', () => (shopReturn === 'done' || shopReturn === 'over') ? retry() : startReady(null));
  on('btnSavesBack', () => showScreen('menu'));
  on('btnRetry', retry);
  on('btnOverShop', () => openShop('over'));
  on('btnOverMenu', toMenu);
  on('btnResume', resumeGame);
  on('btnQuit', () => { if (game.mp && game.mp.local) { game.paused = false; Music.duck(); openMp(); return; } if (game.mp) { showScreen(null); mpForfeit('Je hebt opgegeven.'); return; } game.paused = false; Music.duck(); if (game.mode === 'ready') toMenu(); else gameOver(true); });
  $('btnPause').addEventListener('click', e => { e.currentTarget.blur(); pauseGame(); });
  $('btnPause').addEventListener('pointerdown', e => e.stopPropagation());

  on('btnExport', () => {
    const fname = `andy-apples-save-${new Date().toISOString().slice(0, 10)}.json`;
    if (IN_APP) { AndroidBridge.saveFile(fname, JSON.stringify(makeExport(), null, 2)); saveMsg('Kies waar je het save-bestand wilt bewaren…', true); return; }
    try {
      const blob = new Blob([JSON.stringify(makeExport(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      saveMsg('Save-bestand gedownload.', true);
    } catch (e) { saveMsg('Exporteren mislukt: ' + e.message, false); }
  });
  on('btnImport', () => $('fileImport').click());
  $('fileImport').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { if (importObject(parseSaveText(reader.result))) afterImport(); else saveMsg('Importeren geannuleerd.', false); }
      catch (err) { saveMsg('Kon dit bestand niet lezen: ' + err.message, false); }
    };
    reader.onerror = () => saveMsg('Kon het bestand niet openen.', false);
    reader.readAsText(file);
  });
  on('btnCopyCode', () => {
    const code = 'AA1:' + toB64(JSON.stringify(makeExport()));
    const ta = $('saveCode');
    ta.value = code; ta.focus(); ta.select();
    const done = () => saveMsg('Code gekopieerd.', true);
    if (IN_APP) { AndroidBridge.copy(code); done(); }
    else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { document.execCommand('copy'); done(); });
    else { try { document.execCommand('copy'); done(); } catch (e) { saveMsg('Selecteer en kopieer de code handmatig.', true); } }
  });
  on('btnLoadCode', () => {
    try { if (importObject(parseSaveText($('saveCode').value))) afterImport(); else saveMsg('Importeren geannuleerd.', false); }
    catch (err) { saveMsg('Ongeldige code: ' + err.message, false); }
  });
  on('btnReset', () => {
    if (!confirm('Weet je zeker dat je ALLE voortgang wilt wissen? Dit kan niet ongedaan worden gemaakt.')) return;
    if (!confirm('Echt zeker? Exporteer eventueel eerst een back-up.')) return;
    save = normalizeSave(null);
    persist();
    refreshMenu();
    saveMsg('Voortgang gewist.', true);
  });

  $('helpBiomes').innerHTML = BIOMES.map(b => `<div><b>${b.name}</b> <small>${b.start} m</small><br><small>${b.tip}</small></div>`).join('');

  // Save wordt in een ander tabblad aangepast
  window.addEventListener('storage', e => { if (e.key === SAVE_KEY) { save = loadSave(); refreshMenu(); if (curScreen === 'shop') renderShop(); } });
}

// =====================================================================
//  Invoer
// =====================================================================
function press() {
  Sfx.init();
  if (input.down) return;
  input.down = true; input.presses++;
  game.holdLock = false;
  if (game.mode === 'ready' && !curScreen && !game.paused) begin();
}
function unpress() { input.down = false; }
const pointers = new Set();
// Bij het opstarten (vanuit main.js): aanraken, muis en toetsenbord
function inputInit() {
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (curScreen) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* negeren */ }
    if (LOCAL.on) { // op één scherm: elke speler tikt op zijn eigen helft
      const p = localSide(...toGame(e.clientX, e.clientY));
      localPointers.set(e.pointerId, p);
      localPress(p);
      return;
    }
    pointers.add(e.pointerId);
    press();
  });
  const pointerEnd = e => {
    if (localPointers.has(e.pointerId)) {
      const p = localPointers.get(e.pointerId);
      localPointers.delete(e.pointerId);
      if (![...localPointers.values()].includes(p)) localUnpress(p);
      return;
    }
    pointers.delete(e.pointerId); if (pointers.size === 0) unpress();
  };
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    const typing = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
    if (typing) return;
    if (LOCAL.on && !curScreen) {
      const p = localKey(e.code);
      if (p >= 0) { e.preventDefault(); if (!e.repeat) localPress(p); return; }
    }
    if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (e.repeat) return;
      Sfx.init();
      if (curScreen === 'menu' || curScreen === 'settings') { if (e.code === 'Space' && curScreen === 'menu') startReady(null); return; }
      if (curScreen === 'over') { if (e.code === 'Space') retry(); return; }
      if (curScreen === 'done') { if (e.code === 'Space') { if (game.career.n < LEVELS) startReady(game.career.n + 1); else retry(); } return; }
      if (curScreen === 'pause') { if (e.code === 'Space') resumeGame(); return; }
      if (curScreen === 'mpRes') { if (e.code === 'Space') mpAgain(); return; }
      if (!curScreen) press();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (curScreen === 'pause') resumeGame();
      else if (!curScreen) pauseGame();
      else if (curScreen === 'mpSetup') { mpRender(); showScreen('mp'); }
      else if (curScreen === 'mp') toMenu();
      else if (curScreen === 'lb') showScreen(lbReturn);
      else if (curScreen === 'account') showScreen('menu');
      else if (curScreen === 'debug') showScreen('settings');
      else if (curScreen === 'shop' || curScreen === 'saves' || curScreen === 'help' || curScreen === 'career' || curScreen === 'settings') {
        if (curScreen === 'shop') $('btnShopBack').click(); else showScreen('menu');
      }
    } else if (e.code === 'Enter' && (curScreen === 'menu' || curScreen === 'over')) {
      e.preventDefault(); Sfx.init(); curScreen === 'over' ? retry() : startReady(null);
    }
  });
  window.addEventListener('keyup', e => { if (LOCAL.on) { const p = localKey(e.code); if (p >= 0) { localUnpress(p); return; } } if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'ArrowUp') unpress(); });
  window.addEventListener('blur', () => { pointers.clear(); if (LOCAL.on) { localPointers.clear(); localUnpress(0); localUnpress(1); } else unpress(); if (game.mode === 'playing' && (!game.mp || game.mp.local)) pauseGame(); });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(MP.hideTimer);
    if (document.hidden) {
      if (game.mode === 'playing' && (!game.mp || game.mp.local)) pauseGame();
      // multiplayer: wie te lang wegklikt, geeft op
      if (game.mp && !game.mp.local && !game.mp.result) MP.hideTimer = setTimeout(() => { if (document.hidden) mpForfeit('Je klikte het spel weg.'); }, 4000);
      if (Sfx.ac) Sfx.ac.suspend();
    }
    else if (Sfx.ac && (save.sound || save.music)) Sfx.ac.resume();
  });
  window.addEventListener('pagehide', persist);
}

// =====================================================================
//  HUD
// =====================================================================
const hudCache = {};
function setText(id, txt) { if (hudCache[id] !== txt) { hudCache[id] = txt; $(id).textContent = txt; } }
function updateHud() {
  if (!run) return;
  const M = game.mp;
  if (M && M.local) {
    setText('hint', game.mode === 'mpcount' ? (LOCAL.ai ? 'Houd bij GO! ingedrukt om meteen te springen' : 'Speler 1: SPATIE (of links tikken) · Speler 2: ↑ of ENTER (of rechts tikken)') : '');
    $('hint').classList.toggle('pulse', game.mode === 'mpcount');
    return;
  }
  if (M) {
    setText('hudDist', M.mode === 'race' ? `${Math.min(M.len, Math.floor(run.dist))} / ${M.len} m` : Math.floor(run.dist) + ' m');
    setText('hudApples', '🍎 ' + Math.max(0, Math.floor(run.earned + 1e-6)));
    setText('hudValue', M.mode === 'race' ? 'Race' : 'Endurance'); $('hudValue').style.display = '';
    setText('hudItems', ''); $('hudItems').style.display = 'none';
    setText('hint', game.mode === 'mpcount' ? 'Houd bij GO! ingedrukt om meteen te springen' : game.mode === 'playing' && G.state === 'stand' ? 'Druk om te springen!' : game.holdLock && G.state === 'hang' ? 'Druk opnieuw en laat los om verder te gaan' : '');
    $('hint').classList.toggle('pulse', game.mode === 'mpcount');
    return;
  }
  setText('hudDist', game.career ? `${Math.min(game.career.L, Math.floor(run.dist))} / ${game.career.L} m` : Math.floor(run.dist) + ' m');
  setText('hudApples', '🍎 ' + Math.max(0, Math.floor(run.earned + 1e-6)));
  setText('hudValue', game.career ? `Level ${game.career.n}` : '');
  $('hudValue').style.display = game.career ? '' : 'none';
  let items = '';
  if (G.helmets > 0) items += '⛑️×' + G.helmets + ' ';
  if (G.balloons > 0) items += '🎈×' + G.balloons;
  setText('hudItems', items.trim());
  $('hudItems').style.display = items ? '' : 'none';
  let hint = '';
  if (game.mode === 'ready') hint = 'Houd SPATIE of het scherm ingedrukt om naar de liaan te springen';
  else if (game.mode === 'playing' && save.runs < 3 && run.dist < 120) {
    if (G.state === 'stand') hint = 'Druk opnieuw om te springen';
    else if (G.state === 'hang') hint = G.vx > 150 ? 'Laat nu los om te springen!' : 'Blijf vasthouden… wacht op de zwaai naar voren';
    else if (G.state === 'air') hint = 'Houd ingedrukt om te duiken en een liaan te grijpen';
  }
  setText('hint', hint);
  $('hint').classList.toggle('pulse', game.mode === 'ready');
}
