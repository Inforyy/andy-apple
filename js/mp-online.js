'use strict';
// Andy Apples · online multiplayer
// Lobbies voor 2 tot 20 spelers via WebRTC (ster rond de host).

// =====================================================================
//  Multiplayer (online): lobbies voor 2 tot 20 spelers
//  Het netwerk is een ster: elke gast heeft één directe WebRTC-verbinding met de host, en de host
//  stuurt de standen van iedereen door naar de rest. Iedereen speelt in precies dezelfde wereld
//  (dezelfde seed), simuleert zijn eigen Andy en stuurt zijn positie; de anderen worden als extra
//  gorilla's getekend. Supabase (optioneel) wordt alleen gebruikt om lobbies te vinden en om de
//  verbinding op te zetten; zonder Supabase kun je nog met z'n tweeën handmatig codes uitwisselen.
// =====================================================================
const MP_NAME_KEY = 'andyApples.name';
const MP_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const MP_MAX = 20;          // maximaal aantal spelers in een lobby (host meegeteld)
const RACE_GRACE = 20;      // race: na de eerste finish krijgen de anderen nog zoveel seconden (bij 3+ spelers)
const randHex = n => { const b = new Uint8Array(n); try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < n; i++) b[i] = Math.random() * 256; } return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); };
const CLIENT_ID = randHex(8); // per tabblad: wie is wie
const MP = { role: null, manual: false, busy: false, local: false, aiLvl: null, inRoom: false, myId: CLIENT_ID,
  links: new Map(),   // host: id -> verbinding met een gast
  link: null,         // gast: verbinding met de host
  players: new Map(), // alle andere spelers in de lobby: id -> speler
  hostName: '', hostSig: null, sig: null, lobby: null, joinId: null, joinTimer: 0, manLink: null,
  sel: { mode: 'race', len: 1000 }, cfg: null, match: null, sendAcc: 0, hideTimer: 0, wins: 0, games: 0 };
let ghostPin = { v: null, k: 0, x: 0, y: 0 };
const GC1 = GC;
const GC2 = Object.assign({}, GC, { band: '#2f7fe0', bandD: '#17498f', fur: '#4a3a30', furD: '#30251d', furL: '#7a6452' });
// Kiwi (de AI-tegenstander): een oranje orang-oetan met groene bandana en een kiwischijfje
const GCK = Object.assign({}, GC, { kiwi: true, fur: '#b5561d', furD: '#7f3a12', furL: '#e8894a', skin: '#e9c39b', skinD: '#c0936c', band: '#4caf2e', bandD: '#2c6e18', cape: '#4caf2e', capeD: '#2c6e18' });
const oppPal = () => LOCAL.ai ? GCK : GC2;
// elke online speler krijgt een eigen bandanakleur (rood is voor jezelf)
const MP_COLS = ['#2f7fe0', '#8e44ad', '#16a085', '#f39c12', '#e84393', '#00a8b5', '#6c5ce7', '#27ae60', '#d35400', '#34495e', '#c0392b', '#1abc9c', '#9b59b6', '#f1c40f', '#2980b9', '#e67e22', '#7f8c8d', '#ff6b81', '#10ac84', '#5f27cd'];
const colorOf = id => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return MP_COLS[h % MP_COLS.length]; };
const palCache = new Map();
const palOf = col => { let p = palCache.get(col); if (!p) { p = Object.assign({}, GC2, { band: col, bandD: shade(col, -0.35) }); palCache.set(col, p); } return p; };
const cleanName = n => String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 12);
function myName() { let n = ''; try { n = localStorage.getItem(MP_NAME_KEY) || ''; } catch (e) { /* geen opslag */ } return cleanName(n) || 'Andy'; }
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- codes: sessiebeschrijving -> (gecomprimeerde) tekst om te kopiëren ----
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
async function packCode(desc) {
  // overbodige regels weg: korter = makkelijker kopiëren
  const sdp = desc.sdp.split('\r\n').filter(l => l && !/^a=(extmap-allow-mixed|msid-semantic)/.test(l)).join('\r\n') + '\r\n';
  const bytes = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: sdp }));
  if (typeof CompressionStream === 'function') {
    try {
      const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
      return 'AAMP1z' + b64u(new Uint8Array(buf));
    } catch (e) { /* dan maar ongecomprimeerd */ }
  }
  return 'AAMP1j' + b64u(bytes);
}
async function unpackCode(code) {
  const m = /^AAMP1([zj])([A-Za-z0-9_-]+)$/.exec(String(code || '').replace(/\s+/g, ''));
  if (!m) throw new Error('Dit is geen geldige code. Kopieer de hele code en probeer het opnieuw.');
  let bytes;
  try { bytes = unb64u(m[2]); } catch (e) { throw new Error('De code is beschadigd. Kopieer hem opnieuw.'); }
  if (m[1] === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('Deze browser is te oud voor multiplayer. Probeer een recente Chrome, Edge, Firefox of Safari.');
    try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
    catch (e) { throw new Error('De code is onvolledig. Kopieer de hele code opnieuw.'); }
  }
  const o = JSON.parse(new TextDecoder().decode(bytes));
  if (!o || (o.t !== 'offer' && o.t !== 'answer') || typeof o.s !== 'string') throw new Error('Dit is geen geldige code.');
  return { type: o.t, sdp: o.s };
}
function waitIce(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 3500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

// ---- verbindingen ----
// Een "link" is één WebRTC-verbinding: bij de host één per gast, bij een gast alleen die met de host.
function newLink(id, name) { return { id, name: name || 'Speler', pc: null, dc: null, open: false, iceQ: [], lastMsg: performance.now(), timer: 0 }; }
function linkPc(link, onIce) {
  if (typeof RTCPeerConnection !== 'function') throw new Error('Deze browser ondersteunt geen multiplayer (WebRTC).');
  const pc = new RTCPeerConnection({ iceServers: MP_ICE });
  link.pc = pc;
  if (onIce) pc.onicecandidate = e => { if (e.candidate) onIce(e.candidate.toJSON()); };
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') linkDown(link, link.open ? 'De verbinding is weggevallen.' : 'Verbinden is mislukt. Tip: zet de apparaten op hetzelfde wifi-netwerk en probeer het opnieuw.');
  });
  return pc;
}
function bindDc(link, dc) {
  link.dc = dc;
  dc.onopen = () => linkUp(link);
  dc.onclose = () => linkDown(link, 'De verbinding is verbroken.');
  dc.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } link.lastMsg = performance.now(); onLinkMsg(link, m); };
}
function addIce(link, c) {
  if (!link || !c) return;
  if (link.pc && link.pc.remoteDescription) link.pc.addIceCandidate(c).catch(() => { /* ongeldige kandidaat */ });
  else link.iceQ.push(c);
}
function flushIce(link) { const q = link.iceQ.splice(0); for (const c of q) addIce(link, c); }
function closeLink(link, delay) {
  clearTimeout(link.timer);
  const { pc, dc } = link;
  link.open = false; link.pc = null; link.dc = null;
  setTimeout(() => { try { if (dc) dc.close(); } catch (e) { /* */ } try { if (pc) pc.close(); } catch (e) { /* */ } }, delay || 0);
}
function sendLink(link, m) { const dc = link && link.dc; if (dc && dc.readyState === 'open') { try { dc.send(typeof m === 'string' ? m : JSON.stringify(m)); } catch (e) { /* negeren */ } } }
// host: naar alle gasten (behalve "except"); gast: naar de host
function mpSend(m, except) {
  if (MP.role === 'host') { const t = JSON.stringify(m); for (const l of MP.links.values()) if (l.open && l !== except) sendLink(l, t); }
  else if (MP.link) sendLink(MP.link, m);
}
const openLinks = () => [...MP.links.values()].filter(l => l.open);
function linkUp(link) {
  link.open = true; link.lastMsg = performance.now();
  clearTimeout(link.timer);
  if (MP.role === 'host') {
    MP.inRoom = true; MP.busy = false;
    playerFor(link.id, link.name).inRoster = true;
    const M = MP.match;
    sendLink(link, { type: 'welcome', you: link.id, host: MP.myId, hostName: myName(), mode: MP.sel.mode, len: MP.sel.len, playing: M && !M.result ? 1 : 0 });
    rosterSend(); lobbyTrack();
    Sfx.buy();
  } else if (link === MP.link) {
    clearTimeout(MP.joinTimer);
    sigClose();
    sendLink(link, { type: 'hello', name: myName() });
  }
  mpRender();
}
function linkDown(link, reason) {
  if (MP.role === 'host') {
    if (MP.links.get(link.id) !== link) return;
    MP.links.delete(link.id);
    closeLink(link);
    if (link === MP.manLink) MP.manLink = null;
    const P = MP.players.get(link.id);
    if (P) {
      P.inRoster = false;
      const M = MP.match;
      if (M && !M.result && M.ids.includes(P.id)) { P.left = true; showBanner(`${P.name} is weg`, ''); mpCheck(); }
      else MP.players.delete(P.id);
    }
    if (!MP.lobby && !MP.links.size) { mpLost(reason || 'De andere speler is weg.'); return; } // handmatig: alleen die ene gast
    rosterSend(); lobbyTrack(); mpRender();
  } else if (link === MP.link) mpLost(MP.inRoom ? 'De verbinding met de host is weg.' : reason);
}

// ---- spelers ----
function playerFor(id, name) {
  let P = MP.players.get(id);
  if (!P) { P = { id, name: 'Speler', col: colorOf(id), snaps: [], rt: null, ghost: null, t: 0, dist: 0, apples: 0, falls: 0, ev: null, left: false, inRoster: true, lastMsg: performance.now() }; MP.players.set(id, P); }
  if (name) P.name = cleanName(name) || P.name;
  return P;
}
// host: de lijst met spelers naar iedereen sturen
function rosterSend() {
  if (MP.role !== 'host') return;
  const list = [{ id: MP.myId, name: myName(), host: 1 }].concat(openLinks().map(l => ({ id: l.id, name: MP.players.has(l.id) ? MP.players.get(l.id).name : l.name })));
  mpSend({ type: 'roster', list });
}
// gast: de lijst van de host overnemen
function applyRoster(list) {
  if (!Array.isArray(list)) return;
  const ids = new Set(), M = MP.match;
  for (const r of list) {
    if (!r || typeof r.id !== 'string') continue;
    ids.add(r.id);
    if (r.host) MP.hostName = cleanName(r.name) || MP.hostName;
    if (r.id === MP.myId) continue;
    const P = playerFor(r.id, r.name); P.inRoster = true; P.host = !!r.host;
  }
  for (const P of [...MP.players.values()]) {
    if (ids.has(P.id)) continue;
    P.inRoster = false;
    if (M && !M.result && M.ids.includes(P.id)) { if (!P.left) { P.left = true; showBanner(`${P.name} is weg`, ''); } mpCheck(); }
    else MP.players.delete(P.id);
  }
  mpRender();
}
const roomCount = () => 1 + [...MP.players.values()].filter(P => P.inRoster).length;

// ---- berichten ----
function onLinkMsg(link, m) {
  if (!m || typeof m.type !== 'string') return;
  if (MP.role === 'host') {
    if (!MP.links.has(link.id)) return;
    switch (m.type) {
      case 'hello': link.name = cleanName(m.name) || 'Speler'; playerFor(link.id, link.name); rosterSend(); lobbyTrack(); mpRender(); break;
      case 's': case 'ev': case 'quit':
        onPlayerMsg(link.id, m);
        mpSend(Object.assign({}, m, { from: link.id }), link); // doorsturen naar de rest
        break;
      case 'bye': linkDown(link, ''); break;
    }
    return;
  }
  if (link !== MP.link) return;
  switch (m.type) {
    case 'welcome':
      MP.myId = String(m.you || CLIENT_ID); MP.hostName = cleanName(m.hostName) || MP.hostName || 'Host';
      MP.inRoom = true; MP.busy = false;
      if (m.mode) MP.sel = { mode: m.mode === 'endurance' ? 'endurance' : 'race', len: [500, 1000, 2000].includes(m.len) ? m.len : 1000 };
      mpMsg(m.playing ? 'Er loopt nog een potje. Je doet mee in de volgende ronde.' : '', true);
      Sfx.buy(); mpRender();
      break;
    case 'roster': applyRoster(m.list); break;
    case 'lobby': MP.sel = { mode: m.mode === 'endurance' ? 'endurance' : 'race', len: [500, 1000, 2000].includes(m.len) ? m.len : 1000 }; mpRender(); break;
    case 'start': if (Array.isArray(m.ids) && m.ids.includes(MP.myId)) mpStartMatch(m); break;
    case 's': case 'ev': case 'quit': if (typeof m.from === 'string') onPlayerMsg(m.from, m); break;
    case 'full': mpJoinFail('Deze lobby is vol.'); break;
    case 'bye': mpLost('De host heeft de lobby gesloten.'); break;
  }
}
function onPlayerMsg(id, m) {
  const M = MP.match, P = MP.players.get(id);
  if (!P) return;
  P.lastMsg = performance.now();
  if (!M || m.id !== M.seed || !M.ids.includes(id)) return;
  if (m.type === 's') {
    P.snaps.push(m); if (P.snaps.length > 40) P.snaps.shift();
    P.t = Math.max(P.t, +m.t || 0); P.dist = +m.d || 0; P.apples = m.ap | 0; P.falls = m.f | 0;
  } else if (m.type === 'ev') {
    if (P.ev) return;
    P.ev = { t: +m.t || 0, d: +m.d || 0 };
    if (!M.result && game.mode === 'playing' && !M.myEv) {
      if (M.mode === 'race' && !opps(M).some(o => o !== P && o.ev)) showBanner(`${P.name} is bij de finish!`, 'Snel!');
      else if (M.mode === 'endurance') showBanner(`${P.name} is af!`, '');
    }
  } else if (m.type === 'quit') P.left = true;
  mpCheck();
}

// ---- Lobbylijst (Supabase Realtime presence) ----
// Iedereen in het multiplayermenu luistert naar het kanaal "andy-lobbies". Een host meldt zijn lobby
// daar aan (naam, aantal spelers, modus) en verschijnt zo in de lijst van de anderen.
const LOBBY = { ch: null, status: 'off', list: [], tracked: false, ready: null };
function lobbyInfo() {
  const M = MP.match;
  return { lobby: MP.lobby.id, name: myName(), n: roomCount(), max: MP_MAX, mode: MP.sel.mode, st: M && !M.result ? 1 : 0, ts: MP.lobby.ts, v: 2 };
}
function lobbyWatch() {
  if (!sbOn()) { LOBBY.status = 'off'; lobbyRender(); return Promise.resolve(false); }
  if (LOBBY.ch) return LOBBY.ready || Promise.resolve(LOBBY.status === 'on');
  LOBBY.status = 'loading'; lobbyRender();
  LOBBY.ready = (async () => {
    let sb;
    try { sb = await getSb(); } catch (e) { LOBBY.status = 'err'; lobbyRender(); LOBBY.ready = null; return false; }
    if (LOBBY.ch) return LOBBY.status === 'on';
    const ch = sb.channel('andy-lobbies', { config: { presence: { key: CLIENT_ID } } });
    LOBBY.ch = ch;
    ch.on('presence', { event: 'sync' }, () => {
      if (LOBBY.ch !== ch) return;
      const st = ch.presenceState(), seen = new Set(), list = [];
      for (const k in st) {
        if (k === CLIENT_ID) continue;
        for (const p of st[k]) if (p && typeof p.lobby === 'string' && !seen.has(p.lobby)) {
          seen.add(p.lobby);
          list.push({ id: p.lobby, name: cleanName(p.name) || 'Andy', n: clamp(p.n | 0 || 1, 1, MP_MAX), max: clamp(p.max | 0 || 2, 2, MP_MAX), mode: p.mode === 'endurance' ? 'endurance' : 'race', st: !!p.st, ts: +p.ts || 0 });
        }
      }
      LOBBY.list = list.sort((x, y) => (x.n >= x.max) - (y.n >= y.max) || y.n - x.n || y.ts - x.ts);
      lobbyRender();
    });
    return new Promise(res => {
      ch.subscribe(status => {
        if (LOBBY.ch !== ch) return;
        if (status === 'SUBSCRIBED') { LOBBY.status = 'on'; LOBBY.tracked = false; lobbyTrack(); res(true); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { LOBBY.status = 'err'; LOBBY.tracked = false; res(false); }
        lobbyRender();
      });
    });
  })();
  return LOBBY.ready;
}
function lobbyUnwatch() {
  const ch = LOBBY.ch;
  LOBBY.ch = null; LOBBY.ready = null; LOBBY.list = []; LOBBY.status = 'off'; LOBBY.tracked = false;
  if (ch && sbClient) { try { sbClient.removeChannel(ch); } catch (e) { /* */ } }
}
// eigen lobby aan-, bij- of afmelden in de lijst
function lobbyTrack() {
  const ch = LOBBY.ch, want = !!(MP.lobby && MP.role === 'host');
  if (!ch || LOBBY.status !== 'on') return;
  if (want) { LOBBY.tracked = true; ch.track(lobbyInfo()).catch(() => { /* */ }); }
  else if (LOBBY.tracked) { LOBBY.tracked = false; ch.untrack().catch(() => { /* */ }); }
}
function lobbyRender() {
  const ul = $('mpLobbies');
  if (!ul) return;
  const empty = t => `<li class="empty">${t}</li>`;
  if (!sbOn()) ul.innerHTML = empty('Online lobbies zijn nog niet ingesteld. Speel op dit apparaat of verbind handmatig.');
  else if (LOBBY.status === 'loading' || LOBBY.status === 'off') ul.innerHTML = empty('Lobbies zoeken…');
  else if (LOBBY.status === 'err') ul.innerHTML = empty('Geen verbinding met de server. Heb je internet?');
  else if (!LOBBY.list.length) ul.innerHTML = empty('Nog geen open lobbies. Maak er zelf een!');
  else {
    ul.innerHTML = LOBBY.list.map(l => {
      const full = l.n >= l.max;
      return `<li><span>${escHtml(l.name)} <small>${l.n}/${l.max} · ${l.mode === 'race' ? 'Race' : 'Endurance'}${l.st ? ' · bezig' : ''}</small></span>` +
        `<button class="btn green sm" data-lobby="${escHtml(l.id)}"${full ? ' disabled' : ''}>${full ? 'Vol' : 'Meedoen'}</button></li>`;
    }).join('');
    for (const bt of ul.querySelectorAll('button')) on(bt, () => { const l = LOBBY.list.find(x => x.id === bt.dataset.lobby); mpLobbyJoin(bt.dataset.lobby, l && l.name); });
  }
  $('btnMpHost').disabled = !sbOn() || LOBBY.status !== 'on';
}

// ---- signalering: per lobby een eigen kanaal ----
function sigOpen(id) {
  return getSb().then(sb => new Promise((res, rej) => {
    const ch = sb.channel('andy-lobby-' + id, { config: { broadcast: { self: false } } });
    MP.sig = ch;
    ch.on('broadcast', { event: 'sig' }, msg => { if (MP.sig === ch && msg && msg.payload) sigOnMsg(msg.payload); });
    const t = setTimeout(() => rej(new Error('Geen verbinding met de server.')), 12000);
    ch.subscribe(st => {
      if (st === 'SUBSCRIBED') { clearTimeout(t); res(ch); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); rej(new Error('Geen verbinding met de server.')); }
    });
  }));
}
function sigClose() {
  const ch = MP.sig;
  MP.sig = null;
  if (ch && sbClient) setTimeout(() => { try { sbClient.removeChannel(ch); } catch (e) { /* */ } }, 500);
}
function sigSend(m) {
  const ch = MP.sig;
  if (ch) ch.send({ type: 'broadcast', event: 'sig', payload: Object.assign({ from: CLIENT_ID }, m) }).catch(() => { /* */ });
}
// host: iemand wil meedoen -> een eigen verbinding voor die speler opzetten
async function hostAccept(from, name) {
  const link = newLink(from, cleanName(name) || 'Speler');
  MP.links.set(from, link);
  link.timer = setTimeout(() => { if (!link.open) linkDown(link, ''); }, 20000); // lukt het niet: plek weer vrij
  try {
    const pc = linkPc(link, c => sigSend({ t: 'ice', to: from, c }));
    bindDc(link, pc.createDataChannel('andy', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    if (link.pc === pc) sigSend({ t: 'offer', to: from, sdp: pc.localDescription.sdp });
  } catch (e) { linkDown(link, ''); }
  mpRender();
}
// gast: de host stuurt zijn aanbod
async function guestOffer(m) {
  if (MP.link) return;
  MP.hostSig = m.from;
  const link = MP.link = newLink('host', MP.hostName), id = MP.joinId;
  clearTimeout(MP.joinTimer);
  MP.joinTimer = setTimeout(() => { if (MP.joinId === id && !MP.inRoom) mpJoinFail('Verbinden is mislukt. Tip: zet de apparaten op hetzelfde wifi-netwerk.'); }, 20000);
  try {
    const pc = linkPc(link, c => sigSend({ t: 'ice', to: m.from, c }));
    pc.ondatachannel = e => bindDc(link, e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
    flushIce(link);
    await pc.setLocalDescription(await pc.createAnswer());
    if (MP.link === link) sigSend({ t: 'answer', to: m.from, sdp: pc.localDescription.sdp });
  } catch (e) { mpJoinFail('Verbinden is mislukt.'); }
  mpRender();
}
function sigOnMsg(m) {
  if (!m || typeof m.from !== 'string' || (m.to && m.to !== CLIENT_ID)) return;
  if (MP.role === 'host' && MP.lobby) {
    const link = MP.links.get(m.from);
    if (m.t === 'join') {
      if (link) return; // al bezig
      if (roomCount() + [...MP.links.values()].filter(l => !l.open).length >= MP_MAX) { sigSend({ t: 'full', to: m.from }); return; }
      hostAccept(m.from, m.name);
    } else if (!link || !link.pc) return;
    else if (m.t === 'answer' && typeof m.sdp === 'string') link.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).then(() => flushIce(link), () => linkDown(link, ''));
    else if (m.t === 'ice') addIce(link, m.c);
  } else if (MP.role === 'guest' && !MP.manual) {
    if (MP.hostSig && m.from !== MP.hostSig) return;
    if (m.t === 'full') mpJoinFail('Deze lobby is vol.');
    else if (m.t === 'offer' && typeof m.sdp === 'string') guestOffer(m);
    else if (m.t === 'ice') addIce(MP.link, m.c);
  }
}
async function mpLobbyHost() {
  if (MP.busy) return;
  mpClose(false);
  MP.role = 'host'; MP.busy = true; MP.lobby = { id: randHex(5), ts: Date.now() };
  const id = MP.lobby.id;
  mpMsg(''); mpRender();
  try {
    if (!(await lobbyWatch())) throw new Error('Geen verbinding met de server. Heb je internet?');
    await sigOpen(id);
  } catch (e) { if (MP.lobby && MP.lobby.id === id) { mpClose(false); mpMsg(e.message, false); } mpRender(); return; }
  if (!MP.lobby || MP.lobby.id !== id) return;
  MP.busy = false; MP.inRoom = true;
  lobbyTrack();
  mpRender();
}
async function mpLobbyJoin(id, name) {
  if (!/^[0-9a-f]{6,16}$/.test(id || '')) return;
  mpClose(false);
  MP.role = 'guest'; MP.busy = true; MP.joinId = id; MP.hostName = cleanName(name) || 'de host';
  mpMsg(''); mpRender();
  try { await sigOpen(id); } catch (e) { if (MP.joinId === id) mpJoinFail(e.message); return; }
  if (MP.joinId !== id) return;
  sigSend({ t: 'join', name: myName() });
  // geen antwoord binnen 8 s: de lobby is gesloten (daarna krijgt het verbinden zelf 20 s)
  MP.joinTimer = setTimeout(() => { if (MP.joinId === id && !MP.inRoom && !MP.link) mpJoinFail('Deze lobby is niet meer beschikbaar.'); }, 8000);
}
function mpJoinFail(msg) { mpClose(false); mpMsg(msg, false); mpRender(); }
function mpInviteLink() {
  const base = CONFIG.siteUrl || (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : '');
  return base && MP.lobby ? `${base}#join=${MP.lobby.id}` : '';
}
function mpShare() {
  const link = mpInviteLink();
  if (!link) { mpMsg('Vraag je vrienden om je lobby in de lijst te kiezen.', true); return; }
  const text = `Speel Andy Apples met mij! ${link}`;
  const done = () => mpMsg('Uitnodiging gekopieerd. Plak hem in een bericht.', true);
  if (IN_APP) { AndroidBridge.copy(text); done(); return; }
  if (navigator.share && IS_MOBILE) { navigator.share({ title: 'Andy Apples', text: 'Speel Andy Apples met mij!', url: link }).catch(() => { /* geannuleerd */ }); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => mpMsg(link, true));
  else mpMsg(link, true);
}

// ---- handmatig verbinden (zonder server): twee codes uitwisselen, alleen met z'n tweeën ----
async function mpHost() {
  if (MP.busy) return;
  mpClose(false);
  MP.role = 'host'; MP.busy = true; MP.manual = true;
  $('mpManual').open = true;
  $('mpOffer').value = ''; $('mpAnswerIn').value = ''; $('btnMpCopyOffer').disabled = true;
  mpMsg(''); mpRender();
  try {
    const link = MP.manLink = newLink('m' + randHex(4), 'Speler');
    MP.links.set(link.id, link);
    const pc = linkPc(link);
    bindDc(link, pc.createDataChannel('andy', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    if (link.pc !== pc) return;
    $('mpOffer').value = await packCode(pc.localDescription);
    $('btnMpCopyOffer').disabled = false;
  } catch (e) { mpClose(false); mpMsg('Hosten mislukt: ' + e.message, false); }
  MP.busy = false; mpRender();
}
async function mpConnect() {
  const link = MP.manLink, pc = link && link.pc;
  if (!pc || MP.role !== 'host') return;
  try {
    const d = await unpackCode($('mpAnswerIn').value);
    if (d.type !== 'answer') throw new Error('Dit is een uitnodigingscode. Je hebt de ANTWOORDcode van je vriend nodig.');
    if (pc.signalingState !== 'have-local-offer') throw new Error('Deze uitnodiging is al gebruikt. Klik op Annuleren en begin opnieuw.');
    await pc.setRemoteDescription(d);
    mpMsg('Verbinden…', true);
    mpRender();
  } catch (e) { mpMsg(e.message, false); }
}
function mpJoinStart() {
  mpClose(false); MP.role = 'guest'; MP.manual = true;
  $('mpOfferIn').value = ''; $('mpAnswer').value = '';
  mpMsg(''); mpRender();
  setTimeout(() => $('mpOfferIn').focus(), 50);
}
async function mpMakeAnswer() {
  if (MP.busy) return;
  let d;
  try {
    d = await unpackCode($('mpOfferIn').value);
    if (d.type !== 'offer') throw new Error('Dit is een antwoordcode. Je hebt de UITNODIGINGScode van de host nodig.');
  } catch (e) { mpMsg(e.message, false); return; }
  mpClose(false);
  MP.role = 'guest'; MP.busy = true; MP.manual = true; MP.hostName = 'de host';
  $('mpAnswer').value = ''; $('btnMpCopyAnswer').disabled = true;
  mpMsg(''); mpRender();
  try {
    const link = MP.link = newLink('host', 'Host');
    const pc = linkPc(link);
    pc.ondatachannel = e => bindDc(link, e.channel);
    await pc.setRemoteDescription(d);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    if (link.pc !== pc) return;
    $('mpAnswer').value = await packCode(pc.localDescription);
    $('btnMpCopyAnswer').disabled = false;
  } catch (e) { mpClose(false); MP.role = 'guest'; MP.manual = true; mpMsg('Antwoordcode maken mislukt: ' + e.message, false); }
  MP.busy = false; mpRender();
}
function mpCopy(id) {
  const ta = $(id), code = ta.value;
  if (!code) return;
  ta.focus(); ta.select();
  const done = () => mpMsg('Gekopieerd! Plak de code in een bericht aan je vriend.', true);
  if (IN_APP) { AndroidBridge.copy(code); done(); }
  else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { try { document.execCommand('copy'); done(); } catch (e) { mpMsg('Selecteer en kopieer de code handmatig.', true); } });
  else { try { document.execCommand('copy'); done(); } catch (e) { mpMsg('Selecteer en kopieer de code handmatig.', true); } }
}

// ---- sluiten ----
function mpClose(sayBye) {
  if (sayBye) mpSend({ type: 'bye' });
  for (const l of MP.links.values()) closeLink(l, sayBye ? 300 : 0);
  if (MP.link) closeLink(MP.link, sayBye ? 300 : 0);
  MP.links = new Map(); MP.link = null; MP.manLink = null; MP.players.clear();
  MP.role = null; MP.manual = false; MP.busy = false; MP.inRoom = false; MP.myId = CLIENT_ID;
  MP.lobby = null; MP.joinId = null; MP.hostSig = null; MP.hostName = ''; MP.wins = 0; MP.games = 0;
  clearTimeout(MP.joinTimer);
  sigClose();
  lobbyTrack();
}
const mpActive = () => !!(MP.role || MP.sig || MP.link || MP.links.size);
// Bij het opstarten (vanuit main.js)
function mpInit() {
  // venster dicht of weg: meteen laten weten dat je weg bent (anders duurt het tot de time-out)
  window.addEventListener('pagehide', () => { if (MP.inRoom) mpSend({ type: 'bye' }); });
}
// verbinding kwijt: tijdens een potje eindigt dat zonder winnaar
function mpLost(reason) {
  const was = MP.inRoom || MP.role, M = MP.match;
  mpClose(false);
  if (M && !M.result && game.mp === M) mpEnd(reason, 'conn');
  else if (curScreen === 'mpRes') mpAgainRender();
  if (was && reason) mpMsg(reason, false);
  mpRender();
}

// ---- lobby-scherm ----
function mpMsg(text, ok) { const el = $('mpMsg'); el.textContent = text || ''; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
function mpRender() {
  const loc = !!MP.local, vsAi = loc && MP.aiLvl != null, host = MP.role === 'host', guest = MP.role === 'guest', man = MP.manual;
  const room = loc || MP.inRoom, busy = !room && !!MP.role && !man;
  $('mpTitle').textContent = vsAi ? 'Tegen Kiwi' : loc ? 'Op één scherm' : room ? (host ? 'Jouw lobby' : `Lobby van ${MP.hostName || 'de host'}`) : 'Multiplayer';
  $('mpHome').classList.toggle('hidden', room || busy);
  $('mpOnline').classList.toggle('hidden', man);
  $('mpDevice').classList.toggle('hidden', man);
  $('mpManPick').classList.toggle('hidden', !!MP.role);
  $('mpManHost').classList.toggle('hidden', !(host && man));
  $('mpManJoin').classList.toggle('hidden', !(guest && man));
  $('mpAnswerStep').classList.toggle('hidden', !guest || (!MP.busy && !$('mpAnswer').value));
  $('mpBusy').classList.toggle('hidden', !busy);
  $('mpBusyTxt').textContent = guest ? (MP.link ? `Verbinden met de lobby van ${MP.hostName}…` : `Lobby van ${MP.hostName} zoeken…`) : 'Lobby openen…';
  $('mpRoom').classList.toggle('hidden', !room);
  $('btnMpCancel').classList.toggle('hidden', !room && !MP.role);
  $('btnMpCancel').textContent = loc ? 'Andere modus' : room ? (host ? 'Lobby sluiten' : 'Lobby verlaten') : 'Annuleren';
  document.querySelector('.mp-top .mp-name').classList.toggle('hidden', loc && !vsAi);
  lobbyRender();
  if (!room) return;
  // spelers
  const list = loc ? (vsAi ? [{ name: myName(), col: '#e8322b', me: 1 }, { name: 'Kiwi', col: GCK.band }] : [{ name: 'Speler 1', col: '#e8322b' }, { name: 'Speler 2', col: '#2f7fe0' }])
    : [{ name: myName(), col: '#e8322b', me: 1, host }].concat([...MP.players.values()].filter(P => P.inRoster).map(P => ({ name: P.name, col: P.col, host: guest && P.host })));
  $('mpPlayers').innerHTML = list.map(p => `<li class="${p.me ? 'me' : ''}"><i style="background:${p.col}"></i>${escHtml(p.name)}${p.me ? ' <small>(jij)</small>' : ''}${p.host ? ' <small>host</small>' : ''}</li>`).join('');
  $('mpCountTxt').textContent = loc ? '' : `${list.length} / ${MP_MAX}`;
  $('mpShareRow').classList.toggle('hidden', !(host && MP.lobby));
  // modus
  const canPick = host || loc;
  $('mpModeWho').textContent = canPick ? '' : 'de host kiest';
  $('mpModeRace').classList.toggle('sel', MP.sel.mode === 'race');
  $('mpModeEnd').classList.toggle('sel', MP.sel.mode === 'endurance');
  $('mpModeRace').disabled = $('mpModeEnd').disabled = !canPick;
  $('mpLens').classList.toggle('hidden', MP.sel.mode !== 'race');
  for (const b of document.querySelectorAll('[data-len]')) { b.classList.toggle('sel', +b.dataset.len === MP.sel.len); b.disabled = !canPick; }
  $('mpAiLvls').classList.toggle('hidden', !vsAi);
  for (const b of document.querySelectorAll('[data-ai]')) b.classList.toggle('sel', +b.dataset.ai === MP.aiLvl);
  $('mpLocalKeys').classList.toggle('hidden', !loc || vsAi);
  // start
  const enough = loc || list.length >= 2;
  $('btnMpStart').classList.toggle('hidden', !canPick);
  $('btnMpStart').disabled = !enough;
  $('btnMpStart').textContent = enough ? 'Start' : 'Wachten op spelers…';
  $('mpGuestWait').classList.toggle('hidden', canPick);
}
function openMp() {
  localExit();
  game.mp = null; MP.match = null;
  for (const P of [...MP.players.values()]) if (!P.inRoster) MP.players.delete(P.id);
  if (game.mode !== 'menu') { game.career = null; resetWorld(); game.mode = 'menu'; }
  $('mpName').value = myName();
  mpRender();
  showScreen('mp');
  lobbyWatch();
}
function mpSelect(mode, len) {
  if (MP.role !== 'host' && !MP.local) return;
  if (mode) MP.sel.mode = mode;
  if (len) MP.sel.len = len;
  if (MP.role === 'host') { mpSend({ type: 'lobby', mode: MP.sel.mode, len: MP.sel.len }); lobbyTrack(); }
  mpRender();
}
function mpHostStart(cfg) {
  if (MP.role !== 'host' || !openLinks().length) return;
  const ids = [MP.myId].concat(openLinks().map(l => l.id).filter(id => MP.players.has(id)));
  const c = { type: 'start', mode: cfg.mode, len: cfg.len, seed: 1 + ((Math.random() * 2147483000) | 0), ids };
  mpSend(c);
  mpStartMatch(c);
}

// ---- een potje ----
const opps = M => [...MP.players.values()].filter(P => M.ids.includes(P.id));
// hoe vaak per seconde je je stand verstuurt: met veel spelers wat minder vaak (minder dataverkeer voor de host)
const sendEvery = M => { const n = M ? M.ids.length : 2; return n <= 4 ? 0.05 : n <= 8 ? 0.1 : 0.15; };
function mpStartMatch(c) {
  const mode = c.mode === 'endurance' ? 'endurance' : 'race';
  MP.cfg = { mode, len: [500, 1000, 2000].includes(c.len) ? c.len : 1000 };
  MP.sel = Object.assign({}, MP.cfg);
  const ids = (Array.isArray(c.ids) ? c.ids : []).filter(id => typeof id === 'string').slice(0, MP_MAX);
  const M = { mode, len: mode === 'race' ? MP.cfg.len : 0, seed: c.seed | 0, t: 0, count: 3.5, lastCount: 99, ids,
    myEv: null, falls: 0, result: null, reason: '', rank: null, place: 0, stormX: START_X - 1100, bolt: 0, boltX: 0 };
  for (const P of MP.players.values()) Object.assign(P, { snaps: [], rt: null, ghost: null, ev: null, left: !ids.includes(P.id) || !P.inRoster, t: 0, dist: 0, apples: 0, falls: 0, lastMsg: performance.now() });
  for (const l of MP.links.values()) l.lastMsg = performance.now();
  if (MP.link) MP.link.lastMsg = performance.now();
  MP.match = M; MP.sendAcc = 0;
  ghostPin.v = null;
  game.paused = false; game.career = null; game.mp = M;
  resetWorld();
  game.mode = 'mpcount';
  input.down = false;
  Music.duck();
  mpMsg('');
  showScreen(null);
  // HUD: een stip per speler op de racebalk
  const tr = $('mpTrack');
  for (const d of tr.querySelectorAll('.dot.opp')) d.remove();
  for (const P of opps(M)) {
    const d = document.createElement('div');
    d.className = 'dot opp'; d.style.background = P.col; d.title = P.name;
    if (ids.length <= 4) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = P.name; d.appendChild(t); }
    tr.insertBefore(d, $('mpDotMe')); P.dot = d;
  }
  $('mpHud').classList.remove('hidden');
  tr.classList.toggle('hidden', mode !== 'race');
  lobbyTrack();
  const who = ids.length > 2 ? ` · ${ids.length} spelers` : '';
  showBanner(mode === 'race' ? `Race · ${M.len} m${who}` : `Endurance${who}`, mode === 'race' ? 'Eerst bij de finish wint' : 'Blijf de storm voor');
}
// eigen gebeurtenis: finish (race) of af (endurance)
function mpFinished() {
  const M = game.mp;
  if (!M || M.myEv || M.result) return;
  M.myEv = { t: M.t, d: run.dist };
  mpSend({ type: 'ev', id: M.seed, t: M.t, d: run.dist, from: MP.myId });
  confetti(G.x + 100, G.y - 150, 100); flashT = 0.3;
  if (!M.local && opps(M).some(P => !P.ev && !P.left)) showBanner('Finish!', 'Even wachten op de anderen…');
  mpCheck();
}
function mpDied() {
  const M = game.mp;
  if (M.mode === 'race') {
    M.falls++;
    floatText(G.x, G.y - 70, 'Plons! Even terug…', '#ffffff', 24);
    return;
  }
  if (M.myEv) return;
  M.myEv = { t: M.t, d: run.dist };
  mpSend({ type: 'ev', id: M.seed, t: M.t, d: run.dist, from: MP.myId });
  if (M.local) floatText(G.x, G.y - 110, 'AF!', '#ffffff', 34);
  else showBanner('Je bent af!', 'Even kijken wie het langst volhoudt…');
  mpCheck();
}
// Is het potje klaar? Iedereen meet zijn eigen tijd vanaf zijn eigen GO; de uitslag volgt uit die tijden.
function mpCheck() {
  const M = game.mp;
  if (!M || M.local || M.result || game.mode !== 'playing') return;
  const all = [{ me: 1, ev: M.myEv, left: false, t: M.t }].concat(opps(M).map(P => ({ ev: P.ev, left: P.left, t: P.ev ? Math.max(P.t, P.ev.t) : P.t })));
  const busy = all.filter(x => !x.ev && !x.left);
  if (M.mode === 'race') {
    const evs = all.filter(x => x.ev).map(x => x.ev.t), first = evs.length ? Math.min(...evs) : null;
    const grace = all.length <= 2 ? 0 : RACE_GRACE;
    if (!busy.length || (first !== null && busy.every(x => x.t > first + grace))) mpEnd();
  } else {
    const dead = all.filter(x => x.ev).map(x => x.ev.t), last = dead.length ? Math.max(...dead) : 0;
    if (!busy.length || (busy.length === 1 && all.length > 1 && busy[0].t > last)) mpEnd();
  }
}
// eindstand: race = finishtijd (daarna afstand), endurance = wie het langst volhield
function mpRanking(M, forfeit) {
  const rows = [{ id: MP.myId, name: myName(), col: '#e8322b', me: true, ev: M.myEv, left: !!forfeit, dist: run.dist, apples: Math.max(0, Math.floor(run.earned)), falls: M.falls, t: M.t }]
    .concat(opps(M).map(P => ({ id: P.id, name: P.name, col: P.col, ev: P.ev, left: P.left, dist: P.ev ? Math.max(P.ev.d, P.dist) : P.dist, apples: P.apples, falls: P.falls, t: P.t })));
  const tie = (a, b) => a.id < b.id ? -1 : 1;
  const key = r => M.mode === 'race'
    ? (r.ev ? [0, r.ev.t] : [r.left ? 2 : 1, -r.dist])
    : (!r.ev && !r.left ? [0, -r.dist] : r.ev ? [1, -r.ev.t] : [2, -r.dist]);
  return rows.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || tie(a, b); });
}
function mpEnd(reason, kind) {
  const M = MP.match;
  if (!M || M.result) return;
  M.endT = M.t;
  if (game.mp === M) game.mode = 'mpend';
  mpSendState(); // laatste stand meteen versturen
  lobbyTrack();
  if (kind === 'conn') {
    M.result = 'conn'; M.reason = reason || 'De verbinding is verbroken.';
    showBanner('Verbinding verbroken', M.reason);
  } else {
    M.rank = mpRanking(M, kind === 'forfeit');
    M.place = M.rank.findIndex(r => r.me) + 1;
    M.result = M.place === 1 ? 'win' : 'lose';
    const w = M.rank[0], n = M.rank.length;
    M.reason = reason || (M.mode === 'race'
      ? (w.ev ? `${w.me ? 'Jij was' : w.name + ' was'} als eerste bij de finish.` : `${w.me ? 'Jij kwam' : w.name + ' kwam'} het verst.`)
      : `${w.me ? 'Jij hield' : w.name + ' hield'} het langst vol.`);
    save.mpGames++; MP.games++;
    if (M.result === 'win') { save.mpWins++; MP.wins++; }
    persist();
    if (M.result === 'win') { showBanner('Gewonnen!', M.reason); confetti(G.x + 60, G.y - 160, 140); Sfx.jingle(2); flashT = 0.3; }
    else {
      showBanner(n > 2 ? `${M.place}e van ${n}` : 'Verloren', M.reason);
      Sfx.tone(392, 0.25, 'triangle', 0.1); Sfx.tone(330, 0.25, 'triangle', 0.1, 0, 0.22); Sfx.tone(262, 0.5, 'triangle', 0.1, 0, 0.44);
    }
  }
  setTimeout(() => { if (MP.match === M && game.mp === M) mpShowResult(); }, kind === 'conn' ? 1200 : 2200);
}
function mpShowResult() {
  const M = MP.match;
  $('mpHud').classList.add('hidden');
  $('mpCount').textContent = '';
  const n = M.rank ? M.rank.length : 0;
  $('mpResTitle').textContent = M.result === 'conn' ? 'Verbinding verbroken' : M.result === 'win' ? 'Gewonnen!' : n > 2 ? `${M.place}e plaats` : 'Verloren';
  $('mpResSub').textContent = M.reason;
  const fmt = t => fmtTime(t);
  const val = r => r.left && !r.ev ? 'weg' : M.mode === 'race' ? (r.ev ? fmt(r.ev.t) : `${Math.floor(Math.min(M.len, r.dist))} m`) : (r.ev ? fmt(r.ev.t) : `${Math.floor(r.dist)} m`);
  $('mpResTable').innerHTML = M.rank ? `<ol class="rank">${M.rank.map((r, i) => `<li class="${r.me ? 'me' : ''}"><b>${i + 1}</b><i style="background:${r.col}"></i><span>${escHtml(r.name)}${r.me ? ' (jij)' : ''}</span><span>${val(r)}</span></li>`).join('')}</ol>` : '';
  $('mpResScore').textContent = MP.games ? `Jij won ${MP.wins} van ${MP.games} potje${MP.games === 1 ? '' : 's'} in deze lobby.` : '';
  mpAgainRender();
  showScreen('mpRes');
}
function mpAgainRender() {
  const b = $('btnMpAgain');
  if (LOCAL.on) { b.disabled = false; b.textContent = 'Rematch'; return; }
  if (!MP.inRoom) { b.disabled = true; b.textContent = 'Verbinding verbroken'; return; }
  if (MP.role === 'host') { const ok = openLinks().length > 0; b.disabled = !ok; b.textContent = ok ? 'Nieuwe ronde' : 'Niemand meer in de lobby'; }
  else { b.disabled = true; b.textContent = 'Wachten op de host…'; }
}
function mpAgain() {
  if (LOCAL.on) { localStart(LOCAL.cfg, LOCAL.ai ? LOCAL.ai.lvl : null); return; }
  if (MP.role === 'host') mpHostStart(MP.cfg || MP.sel);
}
function mpForfeit(reason) {
  const M = game.mp;
  if (!M || M.result || M.local) return;
  mpSend({ type: 'quit', id: M.seed, from: MP.myId });
  mpEnd(reason || 'Je hebt opgegeven.', 'forfeit');
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2).replace('.', ',');
}

// race: na een val kom je terug op een (veilige) liaan vlak achter de plek waar je viel
function mpRespawn() {
  const fx = G.x;
  let best = null, bd = Infinity;
  for (const v of vines) {
    if (!v.anchored || v.balloon || v.type === 'rotten' || v.type === 'icy' || v.type === 'elastic') continue;
    if (v.x > fx + 60 || v.ay < CEIL_Y + 50) continue;
    const d = Math.abs(v.x - (fx - 150)) + Math.abs(v.ay - LANES[1]) * 0.3;
    if (d < bd) { bd = d; best = v; }
  }
  if (!best) best = vines.find(v => v.anchored && !v.balloon) || vines[0];
  const p = best.pts, k = Math.round(p.length * 0.55);
  Object.assign(G, { x: p[k].x, y: p[k].y + ARM_LEN, px: p[k].x, py: p[k].y + ARM_LEN, vx: 0, vy: 0, angle: 0, trick: null, trickRot: 0,
    dive: 0, diveT: 0, airT: 0, airX: p[k].x, splashed: false, invuln: 1, lastVine: null, releaseT: 0 });
  G.state = 'air';
  attach(best, k);
  game.holdLock = true; // blijft hangen tot je opnieuw drukt
  floatText(G.x, G.y - 70, 'Terug in de race!', '#ffffff', 24);
  starBurst(G.x, G.y, 14, '#ffffff');
}

// wordt elke physics-stap aangeroepen
function mpStep(dt) {
  const M = game.mp;
  if (game.mode !== 'playing') return;
  M.t += dt;
  if (M.mode === 'race') {
    if (G.state === 'dead' && G.deadT > 1.2 && !M.myEv) mpRespawn();
  } else {
    // de storm komt na een paar tellen op gang en gaat steeds sneller; hij blijft nooit te ver achter
    const sp = M.t < 4 ? 0 : Math.min(1500, 250 + 8 * (M.t - 4));
    M.stormX = Math.max(M.stormX + sp * dt, M.t > 4 && G.state !== 'dead' ? G.x - 2700 : -1e9);
    for (const v of vines) if (v.anchored && v.x < M.stormX - 30) { // lianen in de storm breken af
      v.anchored = false; v.pts[0].im = 1;
      if (G.vine === v) release(false);
    }
    if (G.state !== 'dead' && G.x < M.stormX) {
      floatText(G.x, G.y - 70, 'De storm heeft je!', '#e0d0ff', 26);
      die();
    }
    M.bolt = Math.max(0, M.bolt - dt);
    if (M.bolt === 0 && M.stormX > camX - 200 && Math.random() < dt * 0.6) {
      M.bolt = 0.14; M.boltX = M.stormX - rand(40, 260); M.boltSeed = Math.random() * 1000;
      if (G.x - M.stormX < 1400) { Sfx.noise(0.5, 0.18, 300); shake(2, 0.15); }
    }
  }
  mpCheck();
}
// wordt elk beeld aangeroepen
function mpFrame(realDt, gdt) {
  const M = game.mp;
  if (!M) { ghostPin.v = null; return; }
  if (game.mode === 'mpcount') {
    M.count -= realDt;
    const c = Math.ceil(M.count - 0.5);
    if (c !== M.lastCount) {
      M.lastCount = c;
      const el = $('mpCount');
      el.textContent = c > 0 ? c : 'GO!';
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      if (c > 0) Sfx.tone(520, 0.15, 'square', 0.07); else Sfx.tone(1040, 0.35, 'square', 0.08);
      if (c <= 0) { game.mode = 'playing'; setTimeout(() => { if ($('mpCount').textContent === 'GO!') $('mpCount').textContent = ''; }, 800); }
    }
  }
  // eigen stand versturen
  MP.sendAcc += realDt;
  if (MP.sendAcc >= sendEvery(M)) { MP.sendAcc = 0; mpSendState(); }
  // wie te lang niets van zich laat horen, is weg
  if (!M.result) {
    const now = performance.now();
    if (MP.role === 'host') { for (const l of openLinks()) if (M.ids.includes(l.id) && now - l.lastMsg > 8000) linkDown(l, ''); }
    else if (MP.link && now - MP.link.lastMsg > 8000) mpLost('De host reageert niet meer.');
  }
  ghostPin.v = null;
  for (const P of opps(M)) mpGhost(P, gdt, M);
  mpHud();
}
function mpSendState() {
  const M = MP.match;
  if (!M || !G || !MP.inRoom) return;
  const tr = G.trick;
  mpSend({ type: 's', id: M.seed, from: MP.myId, t: +M.t.toFixed(3), x: Math.round(G.x), y: Math.round(G.y), vx: Math.round(G.vx), vy: Math.round(G.vy),
    st: G.state, a: +(G.angle + (G.trickRot || 0)).toFixed(3), tr: tr ? tr.id : 0, tk: tr ? +Math.min(1, G.trickT / tr.dur).toFixed(3) : 0,
    hx: Math.round(G.hx), hy: Math.round(G.hy), dv: G.diving ? 1 : 0, sp: G.state === 'hang' ? Math.round(G.om * G.R) : 0, tu: G.turboT > 0 ? 1 : 0,
    vid: G.state === 'hang' && G.vine ? G.vine.id : -1, k: G.k, d: +run.dist.toFixed(1), ap: Math.max(0, Math.floor(run.earned)), f: M.falls });
}
const lerpAng = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };
// Andere spelers worden iets in het verleden getekend, tussen twee ontvangen standen in: zo bewegen ze vloeiend
function mpGhost(P, dt, M) {
  const S = P.snaps;
  if (!S.length) return;
  const newest = S[S.length - 1], target = newest.t - (0.07 + 1.5 * sendEvery(M));
  if (P.rt === null || Math.abs(P.rt - target) > 0.6) P.rt = target;
  else P.rt += dt + (target - P.rt) * 0.08;
  while (S.length > 2 && S[1].t <= P.rt) S.shift();
  const a = S[0], b = S[1] || a;
  let f = b.t > a.t ? clamp((P.rt - a.t) / (b.t - a.t), 0, 1) : 1;
  if (Math.hypot(b.x - a.x, b.y - a.y) > 500) f = f < 0.5 ? 0 : 1; // teruggezet na een val: niet schuiven
  const s = f < 0.5 ? a : b, L = (p, q) => p + (q - p) * f;
  const g = P.ghost || (P.ghost = { balloonT: 0, invuln: 0, standT: 0, deadT: 0, trickRot: 0, R: 1, om: 0, turboT: 0, trick: null, trickT: 0 });
  g.x = L(a.x, b.x); g.y = L(a.y, b.y); g.vx = L(a.vx, b.vx); g.vy = L(a.vy, b.vy);
  // hand alleen interpoleren als hij in beide standen aan dezelfde liaan hangt (anders is de oude handpositie verouderd)
  if (a.st === 'hang' && b.st === 'hang' && a.vid === b.vid) { g.hx = L(a.hx, b.hx); g.hy = L(a.hy, b.hy); } else { g.hx = s.hx; g.hy = s.hy; }
  g.angle = lerpAng(a.a, b.a, f);
  if (g.state !== s.st) { g.standT = 0; g.deadT = 0; }
  g.state = s.st; g.standT += dt; g.deadT += dt;
  g.diving = !!s.dv; g.turboT = s.tu ? 1 : 0; g.om = s.sp; g.R = 1;
  g.trick = s.tr ? { id: s.tr, dur: 1 } : null; g.trickT = L(a.tk, b.tk);
  // hangt hij aan een liaan? dan buigt die liaan bij jou ook mee (één tegelijk)
  if (!ghostPin.v && g.state === 'hang' && s.vid >= 0) {
    const v = vines.find(w => w.id === s.vid);
    if (v && v !== G.vine && v.anchored && s.k < v.pts.length) {
      const an = v.pts[0], reach = s.k * SEG_LEN * (v.type === 'elastic' ? ELASTIC_STRETCH : 1) + 60;
      if (Math.hypot(g.hx - an.x, g.hy - an.y) < reach) { ghostPin.v = v; ghostPin.k = s.k; ghostPin.x = g.hx; ghostPin.y = g.hy; }
    }
  }
}
// jouw plek op dit moment (race: wie het verst is; endurance: hoeveel er nog over zijn)
function mpPlace(M) {
  const O = opps(M);
  if (M.mode === 'race') {
    const score = (ev, d) => ev ? 1e6 - ev.t : Math.min(M.len, d);
    const me = score(M.myEv, run.dist);
    return 1 + O.filter(P => !P.left && score(P.ev, P.dist) > me).length;
  }
  return O.filter(P => !P.ev && !P.left).length + (M.myEv ? 0 : 1);
}
function mpHud() {
  const M = game.mp;
  if (!M) return;
  const tm = '⏱ ' + fmtTime(M.result ? M.endT : M.t).slice(0, -1), n = M.ids.length;
  let info;
  if (M.mode === 'race') {
    $('mpDotMe').style.left = (clamp(run.dist / M.len, 0, 1) * 100).toFixed(1) + '%';
    for (const P of opps(M)) if (P.dot) { P.dot.style.left = (clamp((P.ev ? M.len : P.dist) / M.len, 0, 1) * 100).toFixed(1) + '%'; P.dot.style.opacity = P.left ? 0.3 : 1; }
    info = n > 2 ? `${tm} · plek ${mpPlace(M)} van ${n}` : tm;
  } else {
    const gap = Math.max(0, Math.floor((G.x - M.stormX) / PX_PER_M));
    info = `${tm} · 🌩️ ${G.state === 'dead' ? '—' : gap + ' m'} · nog ${mpPlace(M)} van ${n} over`;
  }
  setText('mpInfo', info);
}

// ---- tekenen ----
const localName = i => LOCAL.ai ? (i ? 'Kiwi' : 'Jij') : `Speler ${i + 1}`;
function drawOwnGorilla() {
  const M = game.mp;
  if (!(M && M.local && M.idx === 1)) { drawGorilla(); return; }
  const pal = GC; GC = oppPal(); // speler 2 is altijd de blauwe (of Kiwi)
  try { drawGorilla(); } finally { GC = pal; }
}
// de andere gorilla's: op één scherm de gorilla van de andere speler, online die van iedereen in het potje
function mpOthers() {
  const M = game.mp;
  if (!M) return [];
  if (M.local) return [{ g: LOCAL.worlds[1 - M.idx].G, name: localName(1 - M.idx), pal: M.idx === 1 ? GC1 : oppPal(), tag: M.idx === 1 ? '#a8141c' : (LOCAL.ai ? '#2c6e18' : '#17498f'), local: true }];
  return opps(M).filter(P => P.ghost && !(P.left && !P.ev)).map(P => ({ g: P.ghost, name: P.name, pal: palOf(P.col), tag: shade(P.col, -0.35) }));
}
function drawGhost() {
  const list = mpOthers(), many = list.length > 6;
  for (const o of list) {
    const g = o.g;
    if (!g || g.x < camX - 200 || g.x > camX + viewW + 200) continue;
    const me = G, pal = GC, ip = o.local && ipApply(g); // op één scherm: ook de andere gorilla vloeiend
    G = g; GC = o.pal;
    if (many) ctx.globalAlpha = 0.85;
    try { drawGorilla(); } finally { G = me; GC = pal; if (ip) ipRestore(g); ctx.globalAlpha = 1; }
    if (g.state === 'dead' && g.y > HAZARD_Y + 60) continue;
    // naamkaartje
    ctx.font = '900 17px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(o.name).width + 18, y = g.y - 72;
    ctx.fillStyle = o.tag; ctx.globalAlpha = 0.88;
    ctx.beginPath(); ctx.moveTo(g.x - w / 2 + 10, y - 12); ctx.arcTo(g.x + w / 2, y - 12, g.x + w / 2, y + 12, 10); ctx.arcTo(g.x + w / 2, y + 12, g.x - w / 2, y + 12, 10);
    ctx.arcTo(g.x - w / 2, y + 12, g.x - w / 2, y - 12, 10); ctx.arcTo(g.x - w / 2, y - 12, g.x + w / 2, y - 12, 10); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillText(o.name, g.x, y + 1);
  }
}
function drawStorm() {
  const M = game.mp;
  if (M.mode !== 'endurance') return;
  const sx = M.stormX;
  if (sx < camX - 120) return;
  const y0 = camY - 30, y1 = camY + viewH + 30, x0 = camX - 30, x1 = Math.min(sx + 90, camX + viewW + 30);
  const gr = ctx.createLinearGradient(sx - 520, 0, sx + 90, 0);
  gr.addColorStop(0, 'rgba(18,10,34,.96)'); gr.addColorStop(0.7, 'rgba(38,22,66,.86)'); gr.addColorStop(1, 'rgba(38,22,66,0)');
  ctx.fillStyle = gr; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // kolkende wolken langs de rand
  for (let i = 0; i < 9; i++) {
    const yy = camY + (i + 0.5) / 9 * viewH + Math.sin(time * 1.1 + i) * 24, r = 64 + 22 * Math.sin(time * 1.7 + i * 1.9);
    ctx.fillStyle = i % 2 ? 'rgba(60,38,98,.8)' : 'rgba(44,28,76,.85)';
    circ(sx - 40 + Math.sin(time * 1.5 + i * 2.3) * 22, yy, r);
  }
  // bliksem
  if (M.bolt > 0) {
    let x = M.boltX, y = camY - 20, s = M.boltSeed;
    ctx.strokeStyle = 'rgba(255,250,210,.95)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y);
    while (y < camY + viewH) { s = (s * 9301 + 49297) % 233280; x += (s / 233280 - 0.5) * 90; y += 50; ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = `rgba(220,210,255,${M.bolt})`; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}
// in beeldcoördinaten: pijlen naar spelers buiten beeld (de dichtstbijzijnde drie), stormwaarschuwing
function drawMpOverlay() {
  const M = game.mp;
  const off = mpOthers().filter(o => o.g && !(o.g.state === 'dead' && o.g.y > HAZARD_Y + 60) && (o.g.x - camX < -20 || o.g.x - camX > viewW + 20))
    .sort((a, b) => Math.abs(a.g.x - G.x) - Math.abs(b.g.x - G.x)).slice(0, 3);
  for (const o of off) {
    const g = o.g, left = g.x - camX < -20;
    const y = clamp(g.y - camY, 70, viewH - 70), x = left ? 34 : viewW - 34, dir = left ? -1 : 1;
    const dm = Math.round((g.x - G.x) / PX_PER_M);
    ctx.fillStyle = o.tag; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(x + dir * 22, y); ctx.lineTo(x - dir * 8, y - 18); ctx.lineTo(x - dir * 8, y + 18); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = '900 14px Trebuchet MS, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = left ? 'left' : 'right';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 3;
    const txt = `${o.name} ${dm > 0 ? '+' : ''}${dm} m`, tx = x - dir * 14;
    ctx.strokeText(txt, tx, y - 28); ctx.fillText(txt, tx, y - 28);
  }
  if (M.mode === 'endurance' && G.state !== 'dead' && game.mode === 'playing') {
    const gap = G.x - M.stormX;
    if (gap < 900) {
      const a = (1 - gap / 900) * (0.55 + 0.45 * Math.sin(time * 10));
      const gr = cachedGrad('stormwarn' + Math.round(viewH), () => { const q = ctx.createLinearGradient(0, 0, 140, 0); q.addColorStop(0, 'rgba(150,60,255,.75)'); q.addColorStop(1, 'rgba(150,60,255,0)'); return q; });
      ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = gr; ctx.fillRect(0, 0, 140, viewH); ctx.globalAlpha = 1;
    }
  }
}
