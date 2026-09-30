'use strict';
// Andy Apples · online multiplayer
// Lobbies voor 2 tot 20 spelers via WebRTC (ster rond de host).

// =====================================================================
//  Multiplayer (online): lobbies voor 2 tot 20 spelers
//  Het netwerk is een ster: elke gast heeft één directe WebRTC-verbinding met de host, en de host
//  stuurt de standen van iedereen door naar de rest. Iedereen speelt in precies dezelfde wereld
//  (dezelfde seed), simuleert zijn eigen Andy en stuurt zijn positie; de anderen worden als extra
//  gorilla's getekend. Supabase wordt gebruikt om lobbies te vinden en om de verbinding op te zetten.
//  Elke verbinding wordt tegelijk direct én via de server (een eigen Supabase-kanaal, zie relayOpen) opgezet:
//  wat het eerst werkt, wordt gebruikt, en zodra direct werkt gaat alles direct. Op hetzelfde netwerk lukt
//  direct vaak niet; dan blijft het via de server gaan.
// =====================================================================
const MP_NAME_KEY = 'andyApples.name';
const MP_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const MP_MAX = 20;          // maximaal aantal spelers in een lobby (host meegeteld)
const RACE_GRACE = 20;
const MP_STALE = 6000;      // ms: stuurt een speler in een potje zo lang geen stand, dan is hij weg (bijv. tabblad weggeklikt)
const MP_AFK = 30;          // s: wie in een potje zo lang niets doet, doet niet meer mee (anders blijft het potje hangen)
const MP_MODE_NAME = { race: 'Race', endurance: 'Endurance', br: 'Battle royale', king: 'Koning', waves: 'Overleven', ctf: 'Vlag' };
const botsOk = mode => mode === 'race' || mode === 'endurance' || mode === 'waves'; // apen doen mee met race, endurance en overleven
const mpModeOf = m => MP_MODE_NAME[m] ? m : 'race';      // race: na de eerste finish krijgen de anderen nog zoveel seconden (bij 3+ spelers)
// De eerste lianen zijn niet gekoppeld: aan het begin hangt iedereen aan dezelfde lianen, en als die bij jou naar de hand
// van een ander worden getrokken, grijp je mis en val je meteen. Pas vanaf liaan nummer MP_FREE_VINES buigt een liaan mee.
// (Ruimtelianen hebben een negatief id en worden dus ook nooit gekoppeld.)
const MP_FREE_VINES = 10;
const randHex = n => { const b = new Uint8Array(n); try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < n; i++) b[i] = Math.random() * 256; } return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); };
const CLIENT_ID = randHex(8); // per tabblad: wie is wie
const RELAY_MS = 100;       // via de server worden berichten per 0,1 s gebundeld (minder berichten voor Supabase)
const MP = { role: null, busy: false, local: false, aiLvl: null, inRoom: false, myId: CLIENT_ID,
  links: new Map(),   // host: id -> verbinding met een gast
  link: null,         // gast: verbinding met de host
  players: new Map(), // alle andere spelers in de lobby: id -> speler
  hostName: '', hostSig: null, preIce: [], sig: null, lobby: null, joinId: null, joinTimer: 0,
  sel: { mode: 'race', len: 1000 }, cfg: null, match: null, sendAcc: 0, hideTimer: 0, wins: 0, games: 0,
  bots: { n: 0, lvl: 1 }, botRun: [], botQ: [],   // apen (bots) in een eigen lobby: de host speelt ze
  pub: false, pubTs: 0, pubReady: false, pubBad: new Map(), pubAt: 0, pubLast: '', votes: new Map(), myVote: '', joinSent: 0 }; // openbare lobby
let ghostPin = { v: null, k: 0, x: 0, y: 0, more: [] }; // more: nog meer spelers die elk aan een eigen liaan hangen
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
// Multiplayer zonder account en zonder zelfgekozen naam: één vaste, willekeurige naam (bijv. WildeAap42) in plaats van steeds 'Andy'
const NAME_ADJ = ['Wilde', 'Snelle', 'Rappe', 'Gekke', 'Stoere', 'Slimme', 'Blije', 'Coole', 'Dolle', 'Vlotte', 'Sterke', 'Kleine', 'Grote', 'Gouden'];
const NAME_DIER = ['Aap', 'Kiwi', 'Panda', 'Tijger', 'Koala', 'Gekko', 'Lemur', 'Jaguar', 'Toekan', 'Gibbon', 'Makaak', 'Ara', 'Uil', 'Vos'];
function randomName() {
  const pick = a => a[(Math.random() * a.length) | 0];
  let n; do n = pick(NAME_ADJ) + pick(NAME_DIER); while (n.length > 10);
  return n + (10 + ((Math.random() * 90) | 0));
}
function myName() {
  if (ACC.user && ACC.username) return ACC.username; // ingelogd: altijd je gebruikersnaam
  let n = '';
  try { n = cleanName(localStorage.getItem(MP_NAME_KEY) || ''); } catch (e) { /* geen opslag */ }
  if (!n) { n = randomName(); try { localStorage.setItem(MP_NAME_KEY, n); } catch (e) { /* geen opslag */ } }
  return n;
}
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- verbindingen ----
// ICE-servers: STUN is genoeg tussen twee verschillende netwerken. Op hetzelfde netwerk lukt een directe verbinding
// vaak niet (browsers verbergen het lokale adres achter een .local-naam die veel netwerken en Android niet oplossen,
// en veel routers sturen verkeer naar hun eigen publieke adres niet terug naar binnen). Dan gaat het via de server
// (relayOpen hieronder); met een eigen TURN-server in CONFIG.turn lukt direct vaker (optioneel).
const ICE = { list: null, ts: 0, p: null };
function mpIce() {
  const t = CONFIG.turn;
  if (Array.isArray(t)) return Promise.resolve(MP_ICE.concat(t));
  if (typeof t !== 'string' || !t) return Promise.resolve(MP_ICE);
  if (ICE.list && Date.now() - ICE.ts < 30 * 60e3) return Promise.resolve(ICE.list); // tijdelijke inloggegevens: af en toe vernieuwen
  if (!ICE.p) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 5000);
    ICE.p = fetch(t, ctl ? { signal: ctl.signal } : {}).then(r => r.ok ? r.json() : null).then(j => {
      const l = Array.isArray(j) ? j : j && Array.isArray(j.iceServers) ? j.iceServers : j && j.iceServers && j.iceServers.urls ? [j.iceServers] : [];
      const ok = l.filter(x => x && (typeof x.urls === 'string' || Array.isArray(x.urls)));
      if (ok.length) { ICE.list = MP_ICE.concat(ok); ICE.ts = Date.now(); }
      return ICE.list || MP_ICE;
    }).catch(() => ICE.list || MP_ICE).finally(() => { clearTimeout(to); ICE.p = null; }); // lukt het niet: dan maar alleen STUN
  }
  return ICE.p;
}
// ---- versie ----
// Online spelen kan alleen met dezelfde versie (GAME_VERSION uit js/version.js, gemaakt door tools/version.mjs).
// version.json op de server zegt wat de nieuwste versie is: wie een oudere heeft (een open tabblad van gisteren,
// een oude app), krijgt een melding en kan geen lobby maken of meedoen. De host van een lobby is dus altijd bij,
// en de openbare lobby heeft per versie een eigen kanaal. Bij het meedoen controleert de host ook nog de versie.
const VER = { latest: null, checked: 0, p: null };
const verUrl = () => /^https?:$/.test(location.protocol) && !IN_APP ? 'version.json' : CONFIG.siteUrl ? CONFIG.siteUrl.replace(/\/?$/, '/') + 'version.json' : '';
function verCheck(force) {
  const url = verUrl();
  if (!url) return Promise.resolve(null);
  if (VER.p) return VER.p;
  if (!force && VER.checked && Date.now() - VER.checked < 120000) return Promise.resolve(VER.latest);
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 5000);
  VER.p = fetch(url + '?t=' + Date.now(), Object.assign({ cache: 'no-store' }, ctl ? { signal: ctl.signal } : {}))
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && typeof j.v === 'string' && /^[0-9a-f]{6,40}$/.test(j.v)) VER.latest = j.v; }, () => { /* offline: dan weten we het niet */ })
    .then(() => { clearTimeout(to); VER.checked = Date.now(); VER.p = null; verRender(); return VER.latest; });
  return VER.p;
}
// true = er staat een nieuwere versie online (onbekend, bijv. offline, telt als bij)
const verOld = () => !!VER.latest && VER.latest !== GAME_VERSION;
// vóór een lobby maken of meedoen: eerst (kort) controleren
async function verGate() {
  await verCheck();
  if (!verOld()) return true;
  mpMsg(IN_APP ? 'Je app is verouderd. Download de nieuwe versie om online te spelen.' : 'Je speelt een oude versie. Klik op Bijwerken om online te spelen.', false);
  mpRender();
  return false;
}
function verUpdate() {
  if (IN_APP || !/^https?:$/.test(location.protocol)) { if (IN_APP ? CONFIG.apkUrl : CONFIG.siteUrl) location.href = IN_APP ? CONFIG.apkUrl : CONFIG.siteUrl; return; }
  // de pagina zelf vers ophalen (de scripts hebben ?v=versie in hun adres, dus die komen dan ook vers)
  fetch(location.pathname, { cache: 'reload' }).catch(() => { /* */ }).then(() => location.reload());
}
function verRender() {
  const old = verOld(), el = $('mpUpdate');
  if (!el) return;
  el.classList.toggle('hidden', !old);
  $('mpUpdateTxt').textContent = IN_APP ? 'Er is een nieuwe versie van de app. Download die om online te spelen.' : 'Er is een nieuwe versie van Andy Apples. Werk bij om online te spelen.';
  $('btnMpUpdate').textContent = IN_APP ? 'Downloaden' : !/^https?:$/.test(location.protocol) ? 'Naar de site' : 'Bijwerken';
  if (curScreen === 'mp') mpRender(); else if (curScreen === 'mpRes') mpAgainRender();
}

// Een "link" is één WebRTC-verbinding: bij de host één per gast, bij een gast alleen die met de host.
function newLink(id, name) { return { id, name: name || 'Speler', pc: null, dc: null, open: false, iceQ: [], lastMsg: performance.now(), lastSent: 0, timer: 0, rch: null, rOk: false, viaR: false, out: [], ot: 0 }; }
// rch = kanaal via de server, rOk = dat werkt aan beide kanten, viaR = het laatste bericht kwam via de server
const dcOpen = link => !!(link.dc && link.dc.readyState === 'open');
function linkPc(link, onIce, iceServers) {
  if (typeof RTCPeerConnection !== 'function') throw new Error('Deze browser ondersteunt geen multiplayer (WebRTC).');
  const pc = new RTCPeerConnection({ iceServers: iceServers || MP_ICE });
  link.pc = pc;
  if (onIce) pc.onicecandidate = e => { if (e.candidate) onIce(e.candidate.toJSON()); };
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState !== 'failed' || link.pc !== pc) return;
    dropPc(link); // direct lukt niet (meer): dan blijft alleen de weg via de server over
    if (link.open && !link.rOk) linkDown(link, 'De verbinding is weggevallen.');
  });
  return pc;
}
function bindDc(link, dc) {
  link.dc = dc;
  dc.onopen = () => {
    if (!link.open) linkUp(link); // anders: vanaf nu direct in plaats van via de server
    if (link === MP.link && !MP.pub) sigClose(); // gast: klaar met verbinden
    mpRender();
  };
  dc.onclose = () => { if (link.dc !== dc) return; link.dc = null; if (!link.rOk) linkDown(link, 'De verbinding is verbroken.'); }; // anders verder via de server
  dc.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } link.lastMsg = performance.now(); link.viaR = false; onLinkMsg(link, m); };
}
function addIce(link, c) {
  if (!link || !c) return;
  if (link.pc && link.pc.remoteDescription) link.pc.addIceCandidate(c).catch(() => { /* ongeldige kandidaat */ });
  else link.iceQ.push(c);
}
function flushIce(link) { const q = link.iceQ.splice(0); for (const c of q) addIce(link, c); }
function closeLink(link, delay) {
  clearTimeout(link.timer);
  const { pc, dc } = link, ch = link.rch;
  if (ch) relayFlush(link); // laatste berichten (zoals 'bye') nog versturen
  link.open = false; link.pc = null; link.dc = null; link.rch = null;
  setTimeout(() => {
    try { if (dc) dc.close(); } catch (e) { /* */ } try { if (pc) pc.close(); } catch (e) { /* */ }
    if (ch && sbClient) { try { sbClient.removeChannel(ch); } catch (e) { /* */ } }
  }, (delay || 0) + (ch ? 400 : 0));
}
function sendLink(link, m) {
  if (!link) return;
  const t = typeof m === 'string' ? m : JSON.stringify(m);
  link.lastSent = performance.now();
  if (dcOpen(link)) { try { link.dc.send(t); } catch (e) { /* negeren */ } return; } // direct als dat kan
  if (!link.rch || !link.rOk) return;
  link.out.push(t);
  if (!link.ot) link.ot = setTimeout(() => relayFlush(link), RELAY_MS);
}

// ---- via de server (tegelijk met direct; blijft over als direct niet lukt of wegvalt) ----
// Host en gast delen dan een eigen Realtime-kanaal; berichten gaan gebundeld (elke RELAY_MS) als één broadcast.
const relayName = (hostId, guestId) => `andy-relay-${hostId}-${guestId}`;
function relayFlush(link) {
  clearTimeout(link.ot); link.ot = 0;
  const b = link.out.splice(0);
  if (b.length && link.rch) link.rch.send({ type: 'broadcast', event: 'm', payload: { b } }).catch(() => { /* */ });
}
function relayChan(name, link) {
  return getSb().then(sb => new Promise((res, rej) => {
    const ch = sb.channel(name, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'm' }, msg => {
      if (link.rch !== ch || !msg || !msg.payload || !Array.isArray(msg.payload.b)) return;
      link.lastMsg = performance.now(); link.viaR = true; link.rOk = true; // host: het eerste bericht van de gast = via de server verbonden
      if (!link.open) linkUp(link);
      for (const t of msg.payload.b) { let m; try { m = JSON.parse(t); } catch (x) { continue; } onLinkMsg(link, m); }
    });
    const to = setTimeout(() => rej(new Error('Geen verbinding met de server.')), 10000);
    link.rch = ch;
    ch.subscribe(st => {
      if (st === 'SUBSCRIBED') {
        clearTimeout(to);
        if (link.rch === ch) res(ch);
        else { try { sb.removeChannel(ch); } catch (e) { /* */ } rej(new Error('Verbinding gesloten.')); } // intussen afgesloten
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
        clearTimeout(to); if (link.rch === ch) { link.rch = null; try { sb.removeChannel(ch); } catch (e) { /* */ } }
        rej(new Error('Geen verbinding met de server.'));
      }
    });
  }));
}
function dropPc(link) {
  const { pc, dc } = link;
  link.pc = null; link.dc = null; link.iceQ = [];
  try { if (dc) { dc.onclose = null; dc.close(); } } catch (e) { /* */ } try { if (pc) pc.close(); } catch (e) { /* */ }
}
// host: meteen ook een kanaal via de server openen (tegelijk met direct)
function relayOpen(link) {
  relayChan(relayName(CLIENT_ID, link.id), link).then(() => {
    if (MP.links.get(link.id) === link) sigSend({ t: 'relay', to: link.id });
  }, () => { /* dan alleen direct */ });
}
// gast: de host heeft een kanaal via de server klaarstaan
async function guestRelay(from) {
  if (!MP.hostSig) MP.hostSig = from;
  const link = MP.link || guestLink();
  if (link.rch) return;
  try { await relayChan(relayName(MP.hostSig, CLIENT_ID), link); } catch (e) { return; } // dan alleen direct
  if (MP.link !== link) return;
  link.rOk = true;
  if (!link.open) linkUp(link); // stuurt 'hello': daaraan ziet de host dat we er zijn
}
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
    sendLink(link, { type: 'welcome', you: link.id, host: MP.myId, hostName: myName(), mode: MP.sel.mode, len: MP.sel.len, bots: MP.bots, playing: M && !M.result ? 1 : 0 });
    rosterSend(); lobbyTrack(); pubAnnounce();
    Sfx.buy();
  } else if (link === MP.link) {
    clearTimeout(MP.joinTimer);
    // het kanaal blijft nog open zolang direct verbinden bezig is (in de openbare lobby altijd: daarmee kiezen we een nieuwe host)
    if (!MP.pub) setTimeout(() => { if (MP.link === link && !dcOpen(link)) { dropPc(link); sigClose(); } }, 15000);
    sendLink(link, { type: 'hello', name: myName() });
  }
  mpRender();
}
function linkDown(link, reason) {
  if (MP.role === 'host') {
    if (MP.links.get(link.id) !== link) return;
    MP.links.delete(link.id);
    MP.votes.delete(link.id);
    closeLink(link);
    const P = MP.players.get(link.id);
    if (P) {
      P.inRoster = false;
      const M = MP.match;
      if (M && !M.result && M.ids.includes(P.id)) { P.left = true; showBanner(`${P.name} is weg`, ''); mpCheck(); }
      else MP.players.delete(P.id);
    }
    rosterSend(); lobbyTrack(); pubAnnounce(); mpRender();
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
  const list = [{ id: MP.myId, name: myName(), host: 1 }].concat(openLinks().map(l => ({ id: l.id, name: MP.players.has(l.id) ? MP.players.get(l.id).name : l.name })),
    [...MP.players.values()].filter(P => P.bot && P.inRoster).map(P => ({ id: P.id, name: P.name, bot: 1 })));
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
    const P = playerFor(r.id, r.name); P.inRoster = true; P.host = !!r.host; P.bot = !!r.bot;
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
      case 's': case 'ev': case 'quit': case 'br': case 'ar':
        if (m.type === 's' && MP.players.has(link.id)) MP.players.get(link.id).relayIn = link.viaR;
        onPlayerMsg(link.id, m);
        mpSend(Object.assign({}, m, { from: link.id }, link.viaR && m.type === 's' ? { rl: 1 } : null), link); // doorsturen naar de rest
        break;
      case 'vote': if (MP.pub && MP_MODE_NAME[m.mode]) { MP.votes.set(link.id, m.mode); pubAnnounce(); mpRender(); } break;
      case 'bye': linkDown(link, ''); break;
    }
    return;
  }
  if (link !== MP.link) return;
  switch (m.type) {
    case 'welcome':
      MP.myId = String(m.you || CLIENT_ID); MP.hostName = cleanName(m.hostName) || MP.hostName || 'Host';
      MP.inRoom = true; MP.busy = false;
      if (m.mode) MP.sel = { mode: mpModeOf(m.mode), len: [500, 1000, 2000].includes(m.len) ? m.len : 1000 };
      if (m.bots) MP.bots = { n: clamp(m.bots.n | 0, 0, BOT_MAX), lvl: clamp(m.bots.lvl | 0, 0, AI_LV.length - 1) };
      mpMsg(m.playing ? 'Er loopt nog een potje. Je doet mee in de volgende ronde.' : '', true);
      Sfx.buy(); mpRender();
      break;
    case 'roster': applyRoster(m.list); break;
    case 'lobby':
      MP.sel = { mode: mpModeOf(m.mode), len: [500, 1000, 2000].includes(m.len) ? m.len : 1000 };
      if (m.bots) MP.bots = { n: clamp(m.bots.n | 0, 0, BOT_MAX), lvl: clamp(m.bots.lvl | 0, 0, AI_LV.length - 1) };
      if (m.pub) MP.pubInfo = { at: m.pub.at > 0 ? Date.now() + Math.min(60000, +m.pub.at) : 0, votes: m.pub.votes && typeof m.pub.votes === 'object' ? m.pub.votes : {}, busy: !!m.pub.busy, n: clamp(m.pub.n | 0, 1, MP_MAX) };
      mpRender(); if (curScreen === 'mpRes') mpAgainRender();
      break;
    case 'start': if (Array.isArray(m.ids) && m.ids.includes(MP.myId)) mpStartMatch(m); break;
    case 's': case 'ev': case 'quit': case 'br': case 'ar': if (typeof m.from === 'string') onPlayerMsg(m.from, m); break;
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
    P.lastS = performance.now();
    P.relay = !!m.rl || !!P.relayIn; // komt via de server: schokkeriger, dus iets verder in het verleden tekenen
    if (P.snaps.length && +m.t < P.snaps[P.snaps.length - 1].t) return; // bij het overschakelen naar direct kan een oude stand later binnenkomen
    P.snaps.push(m); if (P.snaps.length > 40) P.snaps.shift();
    P.t = Math.max(P.t, +m.t || 0); P.dist = +m.d || 0; P.apples = m.ap | 0; P.falls = m.f | 0;
  } else if (m.type === 'ev') {
    if (P.ev) return;
    P.ev = { t: +m.t || 0, d: +m.d || 0, by: typeof m.by === 'string' ? m.by : null };
    if (M.mode === 'br') brOut(P.id, P.ev.by);
    if (!M.result && game.mode === 'playing' && !M.myEv) {
      if (M.mode === 'race' && !opps(M).some(o => o !== P && o.ev)) showBanner(`${P.name} is bij de finish!`, 'Snel!');
      else if (M.mode === 'endurance') showBanner(`${P.name} is af!`, '');
    }
  } else if (m.type === 'br') { brMsg(P, m); return; }
  else if (m.type === 'ar') { arenaMsg(P, m); return; }
  else if (m.type === 'quit') P.left = true;
  mpCheck();
}

// ---- Lobbylijst (Supabase Realtime presence) ----
// Iedereen in het multiplayermenu luistert naar het kanaal "andy-lobbies". Een host meldt zijn lobby
// daar aan (naam, aantal spelers, modus) en verschijnt zo in de lijst van de anderen.
const LOBBY = { ch: null, status: 'off', list: [], tracked: false, ready: null, pubN: 0 };
function lobbyInfo() {
  const M = MP.match;
  return { lobby: MP.lobby.id, name: MP.pub ? 'Openbare lobby' : myName(), n: roomCount(), max: MP_MAX, mode: MP.sel.mode, st: M && !M.result ? 1 : 0, ts: MP.lobby.ts, v: 2, ver: GAME_VERSION };
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
      LOBBY.pubN = 0;
      for (const k in st) {
        for (const p of st[k]) if (p && p.lobby === PUB_ID && p.ver === GAME_VERSION) LOBBY.pubN = Math.max(LOBBY.pubN, clamp(p.n | 0, 0, MP_MAX)); // de openbare lobby staat altijd bovenaan
        if (k === CLIENT_ID) continue;
        for (const p of st[k]) if (p && typeof p.lobby === 'string' && p.lobby !== PUB_ID && !seen.has(p.lobby)) {
          seen.add(p.lobby);
          list.push({ id: p.lobby, name: cleanName(p.name) || 'Andy', n: clamp(p.n | 0 || 1, 1, MP_MAX), max: clamp(p.max | 0 || 2, 2, MP_MAX), mode: mpModeOf(p.mode), st: !!p.st, ts: +p.ts || 0, ver: typeof p.ver === 'string' ? p.ver : '' });
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
  if (!sbOn()) ul.innerHTML = empty('Online lobbies zijn nog niet ingesteld. Speel op dit apparaat.');
  else if (LOBBY.status === 'loading' || LOBBY.status === 'off') ul.innerHTML = empty('Lobbies zoeken…');
  else if (LOBBY.status === 'err') ul.innerHTML = empty('Geen verbinding met de server. Heb je internet?');
  else {
    const n = LOBBY.pubN, old = verOld();
    ul.innerHTML = `<li class="pub"><span>🌍 Openbare lobby <small>${n ? `${n} speler${n === 1 ? '' : 's'}` : 'nog leeg'} · altijd open</small></span>` +
      `<button class="btn green sm" data-lobby="${PUB_ID}"${n >= MP_MAX || old ? ' disabled' : ''}>${n >= MP_MAX ? 'Vol' : 'Meedoen'}</button></li>` + LOBBY.list.map(l => {
      const full = l.n >= l.max, other = l.ver !== GAME_VERSION; // een andere versie: meedoen kan niet
      return `<li${other ? ' class="old"' : ''}><span>${escHtml(l.name)} <small>${l.n}/${l.max} · ${MP_MODE_NAME[l.mode]}${l.st ? ' · bezig' : ''}</small></span>` +
        `<button class="btn green sm" data-lobby="${escHtml(l.id)}"${full || other || old ? ' disabled' : ''}>${other ? 'Andere versie' : full ? 'Vol' : 'Meedoen'}</button></li>`;
    }).join('');
    for (const bt of ul.querySelectorAll('button')) on(bt, () => { const l = LOBBY.list.find(x => x.id === bt.dataset.lobby); mpLobbyJoin(bt.dataset.lobby, l && l.name); });
  }
  $('btnMpHost').disabled = !sbOn() || LOBBY.status !== 'on' || verOld();
}

// ---- signalering: per lobby een eigen kanaal ----
// De openbare lobby gebruikt op dit kanaal ook presence: daarmee ziet iedereen wie er is en wie de host is.
function sigOpen(id, pub) {
  return getSb().then(sb => new Promise((res, rej) => {
    const ch = sb.channel('andy-lobby-' + id, { config: pub ? { broadcast: { self: false }, presence: { key: CLIENT_ID } } : { broadcast: { self: false } } });
    MP.sig = ch;
    ch.on('broadcast', { event: 'sig' }, msg => { if (MP.sig === ch && msg && msg.payload) sigOnMsg(msg.payload); });
    if (pub) ch.on('presence', { event: 'sync' }, () => {
      if (MP.sig !== ch) return;
      if (MP.pubReady) { pubSync(); return; }
      MP.pubReady = true; MP.pubReadyAt = performance.now(); setTimeout(() => { if (MP.sig === ch) pubSync(); }, 800); // eerst iedereen die er al is binnenkrijgen
    });
    const t = setTimeout(() => rej(new Error('Geen verbinding met de server.')), 12000);
    ch.subscribe(st => {
      if (st === 'SUBSCRIBED') { clearTimeout(t); if (pub) ch.track({ ts: MP.pubTs, host: 0 }).catch(() => { /* */ }); res(ch); }
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
  link.timer = setTimeout(() => { if (!link.open) linkDown(link, ''); }, 15000); // lukt het allebei niet: plek weer vrij
  relayOpen(link); // tegelijk via de server en direct: wat het eerst werkt, wordt gebruikt
  try {
    const ice = await mpIce();
    if (MP.links.get(from) !== link) return;
    const pc = linkPc(link, c => sigSend({ t: 'ice', to: from, c }), ice);
    bindDc(link, pc.createDataChannel('andy', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    if (link.pc === pc) sigSend({ t: 'offer', to: from, sdp: pc.localDescription.sdp });
  } catch (e) { dropPc(link); } // direct lukt niet: via de server kan nog
  mpRender();
}
// gast: de host stuurt zijn aanbod
function guestLink() {
  const link = MP.link = newLink('host', MP.hostName), id = MP.joinId;
  clearTimeout(MP.joinTimer);
  MP.joinTimer = setTimeout(() => { if (MP.joinId === id && !MP.inRoom) joinFail('Verbinden is mislukt. Probeer het opnieuw.'); }, 20000);
  return link;
}
async function guestOffer(m) {
  if (MP.link && MP.link.pc) return;
  MP.hostSig = m.from;
  const link = MP.link || guestLink();
  link.iceQ = MP.preIce.splice(0).concat(link.iceQ); // kandidaten die vóór het aanbod binnenkwamen
  try {
    const ice = await mpIce();
    if (MP.link !== link) return;
    const pc = linkPc(link, c => sigSend({ t: 'ice', to: m.from, c }), ice);
    pc.ondatachannel = e => bindDc(link, e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
    flushIce(link);
    await pc.setLocalDescription(await pc.createAnswer());
    if (MP.link === link) sigSend({ t: 'answer', to: m.from, sdp: pc.localDescription.sdp });
  } catch (e) { if (MP.link === link) dropPc(link); } // direct lukt niet: via de server kan nog
  mpRender();
}
function sigOnMsg(m) {
  if (!m || typeof m.from !== 'string' || (m.to && m.to !== CLIENT_ID)) return;
  if (MP.role === 'host' && MP.lobby) {
    const link = MP.links.get(m.from);
    if (m.t === 'join') {
      if (link) return; // al bezig
      if (m.ver !== GAME_VERSION) { sigSend({ t: 'ver', to: m.from, v: GAME_VERSION }); return; } // alleen dezelfde versie
      if (roomCount() + [...MP.links.values()].filter(l => !l.open).length >= MP_MAX) { sigSend({ t: 'full', to: m.from }); return; }
      hostAccept(m.from, m.name);
    } else if (!link || !link.pc) return;
    else if (m.t === 'answer' && typeof m.sdp === 'string') link.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).then(() => flushIce(link), () => linkDown(link, ''));
    else if (m.t === 'ice') addIce(link, m.c);
  } else if (MP.role === 'guest') {
    if (MP.hostSig && m.from !== MP.hostSig) return;
    if (m.t === 'ver') verCheck(true).then(() => mpJoinFail(verOld() ? 'Je speelt een oude versie. Werk het spel bij om mee te doen.' : 'Deze lobby draait een andere versie van het spel.'));
    else if (m.t === 'full') joinFail('Deze lobby is vol.');
    else if (m.t === 'offer' && typeof m.sdp === 'string') guestOffer(m);
    else if (m.t === 'relay') guestRelay(m.from);
    else if (m.t === 'ice') { if (MP.link) addIce(MP.link, m.c); else if (m.c && MP.preIce.length < 50) MP.preIce.push(m.c); }
  }
}
async function mpLobbyHost() {
  if (MP.busy || !await verGate()) return; // de host moet de nieuwste versie hebben
  mpClose(false);
  try { const b = JSON.parse(localStorage.getItem('andyApples.bots') || 'null'); if (b) MP.bots = { n: clamp(b.n | 0, 0, BOT_MAX), lvl: clamp(b.lvl | 0, 0, AI_LV.length - 1) }; } catch (e) { /* */ }
  MP.role = 'host'; MP.busy = true; MP.lobby = { id: randHex(5), ts: Date.now() };
  const id = MP.lobby.id;
  mpMsg(''); mpRender();
  try {
    if (!(await lobbyWatch())) throw new Error('Geen verbinding met de server. Heb je internet?');
    await sigOpen(id);
  } catch (e) { if (MP.lobby && MP.lobby.id === id) { mpClose(false); mpMsg(e.message, false); } mpRender(); return; }
  if (!MP.lobby || MP.lobby.id !== id) return;
  MP.busy = false; MP.inRoom = true;
  botsSync();
  lobbyTrack();
  mpRender();
}
async function mpLobbyJoin(id, name) {
  if (id === PUB_ID) { pubEnter(); return; }
  if (!/^[0-9a-f]{6,16}$/.test(id || '') || !await verGate()) return;
  mpClose(false);
  MP.role = 'guest'; MP.busy = true; MP.joinId = id; MP.hostName = cleanName(name) || 'de host';
  mpMsg(''); mpRender();
  try { await sigOpen(id); } catch (e) { if (MP.joinId === id) mpJoinFail(e.message); return; }
  if (MP.joinId !== id) return;
  sigSend({ t: 'join', name: myName(), ver: GAME_VERSION });
  // geen antwoord binnen 8 s: de lobby is gesloten (daarna krijgt het verbinden zelf 20 s)
  MP.joinTimer = setTimeout(() => { if (MP.joinId === id && !MP.inRoom && !MP.link) mpJoinFail('Deze lobby is niet meer beschikbaar.'); }, 8000);
}
function mpJoinFail(msg) { mpClose(false); mpMsg(msg, false); mpRender(); }
// verbinden met de host mislukt; in de openbare lobby proberen we het met een andere host
function joinFail(msg) {
  if (!MP.pub || /vol/.test(msg)) { mpJoinFail(msg); return; }
  if (MP.hostSig) MP.pubBad.set(MP.hostSig, Date.now() + 30000);
  pubDrop(false); pubSync();
}
// via uitnodiging(.html): die pagina heeft een eigen link-preview ("Je bent uitgenodigd!") en stuurt meteen door naar het spel.
// Zonder .html: de server (en GitHub Pages) vindt uitnodiging.html ook zo, en een .html-adres zou eerst worden doorgestuurd.
function mpInviteLink() {
  const base = CONFIG.siteUrl || (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : '');
  const dir = base.replace(/index\.html$/, '').replace(/\/?$/, '/');
  const id = MP.pub ? PUB_ID : MP.lobby && MP.lobby.id;
  return base && id ? `${dir}uitnodiging#join=${id}` : '';
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

// ---- sluiten ----
// alle verbindingen en spelers weg (het signaleringskanaal blijft)
function mpReset(sayBye) {
  if (sayBye) mpSend({ type: 'bye' });
  for (const l of MP.links.values()) closeLink(l, sayBye ? 300 : 0);
  if (MP.link) closeLink(MP.link, sayBye ? 300 : 0);
  MP.links = new Map(); MP.link = null; MP.players.clear();
  MP.role = null; MP.busy = false; MP.inRoom = false; MP.myId = CLIENT_ID;
  MP.lobby = null; MP.joinId = null; MP.hostSig = null; MP.preIce = []; MP.wins = 0; MP.games = 0;
  MP.botRun = []; MP.botQ = []; MP.round = null; MP.votes.clear(); MP.myVote = ''; MP.pubAt = 0; MP.pubInfo = null;
  clearTimeout(MP.joinTimer);
}
function mpClose(sayBye) {
  const pubCh = MP.pub && MP.sig;
  mpReset(sayBye);
  MP.hostName = ''; MP.pub = false; MP.pubReady = false;
  if (pubCh) pubCh.untrack().catch(() => { /* */ });
  sigClose();
  lobbyTrack();
}
const mpActive = () => !!(MP.role || MP.sig || MP.link || MP.links.size || MP.pub);
// Bij het opstarten (vanuit main.js)
function mpInit() {
  // melding over een slechte verbinding: tik om weg te halen (zonder dat het spel die tik als sprong ziet)
  for (const ev of ['pointerdown', 'touchstart', 'mousedown']) $('mpWarn').addEventListener(ev, e => e.stopPropagation(), { passive: true });
  $('mpWarn').addEventListener('click', pingWarnHide);
  // venster dicht of weg: meteen laten weten dat je weg bent (anders duurt het tot de time-out)
  window.addEventListener('pagehide', () => {
    if (!MP.inRoom) return;
    mpSend({ type: 'bye' });
    for (const l of MP.links.values()) if (l.rch) relayFlush(l);
    if (MP.link && MP.link.rch) relayFlush(MP.link);
  });
  setInterval(mpTick, 500);
}
// wie in een potje geen standen meer stuurt (tabblad weg, telefoon op slot), telt niet meer mee; de host haalt hem uit de lobby
function mpStale(R) {
  const now = performance.now();
  for (const P of opps(R)) {
    if (P.ev || P.left || P.bot || now - (P.lastS || 0) < MP_STALE) continue;
    const l = MP.role === 'host' && MP.links.get(P.id);
    if (l) { linkDown(l, ''); continue; }
    P.left = true;
    if (game.mp === R && game.mode === 'playing') showBanner(`${P.name} is weg`, '');
  }
  mpCheck();
}
// twee keer per seconde: verbindingen in leven houden, stilgevallen spelers, en de openbare lobby
function mpTick() {
  // de ronde volgen tot iedereen klaar is, ook als je zelf al klaar bent of opgaf (de openbare lobby wacht daarop)
  const R = MP.round;
  if (R && R.ar && MP.role === 'host') arenaHostTick(R); // Koning en Vlag: punten, tijd en de stand
  if (R && !R.done && MP.inRoom) {
    mpStale(R);
    if (R.result && mpOver(R)) R.done = true;
  }
  const now = performance.now();
  // elke verbinding: een teken van leven als er even niets verstuurd is, en weg na 15 s stilte
  const keep = (l, lost) => {
    if (!l.open) return;
    if (now - l.lastMsg > 15000) lost(); else if (now - l.lastSent > 3000) sendLink(l, { type: 'ping' });
  };
  for (const l of [...MP.links.values()]) keep(l, () => linkDown(l, ''));
  if (MP.link) keep(MP.link, () => mpLost('De host reageert niet meer.'));
  pingTick(now);
  if (MP.pub) pubTick();
  if ((MP.role || MP.pub || curScreen === 'mp') && Date.now() - VER.checked > 120000) verCheck(); // af en toe kijken of er een nieuwe versie is
}
// ping-meter rechtsboven, de hele tijd dat je in online multiplayer zit (lobby én potje): je eigen ping naar de
// server (Supabase Realtime, een heartbeat heen en terug), met een kleur per niveau. Blijft het antwoord uit, dan
// loopt het getal gewoon op, zodat je een haperende verbinding meteen ziet.
// Is de ping een hele tijd hoog, dan komt er (één keer per sessie) een melding rechtsboven.
const PING = { ms: 0, sent: 0, last: 0, tick: 0, bad: 0, warned: false };
const PING_BAD_MS = 100, PING_WARN_AFTER = 20, PING_WARN_SHOW = 10000; // hoog = boven 100 ms; na 20 s slecht; melding 10 s
function pingTick(now) {
  const el = $('mpPing'), on = mpActive() || !!game.mp;
  el.classList.toggle('hidden', !on);
  if (!on) { PING.ms = 0; PING.sent = 0; PING.bad = 0; PING.tick = 0; pingWarnHide(); return; }
  const sock = sbClient && sbClient.realtime && sbClient.realtime.socketAdapter && sbClient.realtime.socketAdapter.socket;
  if (!PING.sent && now - PING.last >= 1000 && sock && typeof sock.ping === 'function') {
    PING.last = now;
    const t0 = now;
    if (sock.ping(rtt => { if (PING.sent !== t0) return; PING.sent = 0; PING.ms = PING.ms ? PING.ms + (rtt - PING.ms) * 0.4 : rtt; }) !== false) PING.sent = t0;
    else PING.ms = 0; // niet met de server verbonden
  }
  if (PING.sent && now - PING.sent > 10000) PING.sent = 0; // nooit antwoord gekregen: opnieuw proberen
  const ms = PING.sent && now - PING.sent > PING.ms ? Math.max(PING.ms, now - PING.sent) : PING.ms; // wachten op antwoord telt mee
  el.textContent = ms ? `${Math.round(ms)} ms` : '– ms';
  el.dataset.q = !ms ? '' : ms <= 50 ? 'good' : ms <= 80 ? 'ok' : ms <= 100 ? 'meh' : 'bad';
  // slechte tijd optellen; gaat het even goed, dan zakt de teller half zo snel terug (een enkel goed moment wist hem niet)
  const dt = PING.tick ? Math.min(2, (now - PING.tick) / 1000) : 0; PING.tick = now;
  PING.bad = ms > PING_BAD_MS ? PING.bad + dt : Math.max(0, PING.bad - dt * 0.5);
  if (!PING.warned && PING.bad >= PING_WARN_AFTER) { PING.warned = true; pingWarn(); }
}
function pingWarn() {
  const w = $('mpWarn');
  w.classList.remove('hidden', 'out'); void w.offsetWidth; w.classList.add('in');
  clearTimeout(w._t); w._t = setTimeout(() => pingWarnHide(), PING_WARN_SHOW);
}
function pingWarnHide() {
  const w = $('mpWarn');
  if (w.classList.contains('hidden')) return;
  clearTimeout(w._t); w.classList.remove('in'); w.classList.add('out');
  setTimeout(() => w.classList.add('hidden'), 300);
}
// verbinding kwijt: tijdens een potje eindigt dat zonder winnaar
function mpLost(reason) {
  const was = MP.inRoom || MP.role, M = MP.match, pub = MP.pub;
  if (pub) { pubDrop(false); setTimeout(pubSync, 1500); } // openbare lobby: een nieuwe host zoeken (of zelf host worden)
  else mpClose(false);
  if (M && !M.result && game.mp === M) mpEnd(pub ? 'De host is weg. We zoeken een nieuwe host.' : reason, 'conn');
  else if (curScreen === 'mpRes') mpAgainRender();
  if (was && reason && !pub) mpMsg(reason, false);
  mpRender();
}

// =====================================================================
//  Openbare lobby: altijd open, voor iedereen
//  Er is geen server die het spel draait, dus één van de spelers is de host. Wie er als eerste is, wordt
//  host (presence op het kanaal "andy-lobby-pub"); gaat die weg, dan neemt de volgende het over. De host
//  start vanzelf een ronde zodra er 2 spelers zijn. Iedereen kan stemmen op de spelmodus; zonder stemmen
//  kiest het spel een willekeurige modus.
// =====================================================================
const PUB_ID = 'pub';
const PUB_WAIT = 15000;   // ms tussen de rondes (en na binnenkomst van de tweede speler)
const PUB_MODES = ['race', 'endurance', 'br', 'king', 'waves', 'ctf'];
async function pubEnter() {
  if (MP.busy || !await verGate()) return;
  mpClose(false);
  MP.pub = true; MP.busy = true; MP.pubTs = Date.now(); MP.pubReady = false; MP.pubBad = new Map(); MP.hostName = 'Openbare lobby';
  mpMsg(''); mpRender();
  try {
    if (!(await lobbyWatch())) throw new Error('Geen verbinding met de server. Heb je internet?');
    await sigOpen(PUB_ID + '-' + GAME_VERSION, true); // per versie een eigen openbare lobby
  } catch (e) { if (MP.pub) { mpClose(false); mpMsg(e.message, false); mpRender(); } }
}
// wie is de host? Wie al host is, blijft het (een nieuwe speler met een verkeerd klokje neemt het niet over).
// Anders (of bij twee hosts tegelijk) wint wie er het eerst was.
function pubLeader() {
  const st = MP.sig ? MP.sig.presenceState() : {}, now = Date.now(), all = [];
  for (const k in st) {
    const p = st[k] && st[k][0];
    if (!p || k === CLIENT_ID || (MP.pubBad.get(k) || 0) > now) continue;
    all.push({ id: k, ts: +p.ts || 0, host: !!p.host });
  }
  all.push({ id: CLIENT_ID, ts: MP.pubTs, host: MP.role === 'host' });
  const hosts = all.filter(x => x.host), pool = hosts.length ? hosts : all;
  pool.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  return pool[0].id;
}
function pubSync() {
  if (!MP.pub || !MP.sig || !MP.pubReady) return;
  const lead = pubLeader();
  if (lead === CLIENT_ID) {
    if (MP.role === 'host') return;
    // zie ik (nog) niemand anders? De rest van de lobby komt soms pas even later binnen: dan eerst nog even wachten
    const wait = 2500 - (performance.now() - (MP.pubReadyAt || 0)), alone = Object.keys(MP.sig.presenceState()).every(k => k === CLIENT_ID);
    if (alone && wait > 0) { clearTimeout(MP.pubWait); MP.pubWait = setTimeout(pubSync, wait); return; }
    pubHost();
  }
  else if (MP.role === 'host') { pubDrop(true); pubJoin(lead); } // er is al een andere host: overstappen
  else if (MP.hostSig !== lead) pubJoin(lead);
}
// verbindingen weg, maar in de openbare lobby blijven
function pubDrop(sayBye) {
  const wasHost = MP.role === 'host';
  mpReset(sayBye);
  MP.busy = true;
  if (wasHost && MP.sig) MP.sig.track({ ts: MP.pubTs, host: 0 }).catch(() => { /* */ });
  lobbyTrack();
}
function pubHost() {
  pubDrop(false);
  MP.role = 'host'; MP.busy = false; MP.inRoom = true; MP.lobby = { id: PUB_ID, ts: MP.pubTs };
  if (MP.sig) MP.sig.track({ ts: MP.pubTs, host: 1 }).catch(() => { /* */ });
  lobbyTrack(); mpRender();
}
function pubJoin(lead) {
  if (MP.role) pubDrop(false);
  MP.role = 'guest'; MP.busy = true; MP.hostSig = lead; MP.joinId = PUB_ID; MP.hostName = 'Openbare lobby';
  MP.joinSent = performance.now();
  sigSend({ t: 'join', to: lead, name: myName(), ver: GAME_VERSION });
  const id = lead;
  MP.joinTimer = setTimeout(() => { if (MP.pub && MP.hostSig === id && !MP.inRoom && !MP.link) joinFail('De host reageert niet.'); }, 12000);
  mpRender();
}
// host: aftellen naar de volgende ronde en de stemmen naar iedereen
function pubTick() {
  if (MP.role === 'guest' && !MP.link && MP.hostSig && performance.now() - MP.joinSent > 2500) { // de host was misschien nog niet klaar: opnieuw vragen
    MP.joinSent = performance.now(); sigSend({ t: 'join', to: MP.hostSig, name: myName(), ver: GAME_VERSION });
  }
  if (MP.role === 'host') {
    const busy = pubBusy();
    if (busy || roomCount() < 2 || verOld()) { if (MP.pubAt) { MP.pubAt = 0; pubAnnounce(); mpRender(); } }
    else if (!MP.pubAt) { MP.pubAt = Date.now() + PUB_WAIT; pubAnnounce(); mpRender(); }
    else if (Date.now() >= MP.pubAt) { MP.pubAt = 0; pubRound(); }
    if (MP.pubKey !== `${MP.pubAt}|${pubBusy()}|${roomCount()}`) { pubAnnounce(); mpRender(); } // er veranderde iets: iedereen laten weten
  }
  pubTimerRender();
}
// host: loopt er nog een ronde? (pas klaar als iedereen klaar is, ook als de host zelf al opgaf)
const pubBusy = () => MP.round && !MP.round.done ? 1 : 0;
function pubTally() {
  const t = {}; for (const m of PUB_MODES) t[m] = 0;
  for (const [id, m] of MP.votes) if ((id === MP.myId || MP.players.has(id)) && t[m] != null) t[m]++;
  return t;
}
// host: aftellen, stemmen, of er een ronde loopt en hoeveel spelers er zijn, naar iedereen
function pubAnnounce() {
  if (!MP.pub || MP.role !== 'host') return;
  const busy = pubBusy(), n = roomCount();
  MP.pubInfo = { at: MP.pubAt, votes: pubTally(), busy, n };
  MP.pubKey = `${MP.pubAt}|${busy}|${n}`;
  mpSend({ type: 'lobby', mode: MP.sel.mode, len: MP.sel.len, pub: { at: MP.pubAt ? MP.pubAt - Date.now() : 0, votes: MP.pubInfo.votes, busy, n } });
}
function pubVote(mode) {
  if (!MP.pub || !MP_MODE_NAME[mode]) return;
  MP.myVote = mode;
  if (MP.role === 'host') { MP.votes.set(MP.myId, mode); pubAnnounce(); } else mpSend({ type: 'vote', mode });
  mpRender(); if (curScreen === 'mpRes') mpAgainRender();
}
// de meeste stemmen wint (gelijk: loten); geen stemmen: een willekeurige andere modus dan de vorige keer
function pubRound() {
  const t = pubTally(), best = Math.max(...Object.values(t));
  const pool = best ? PUB_MODES.filter(m => t[m] === best) : PUB_MODES.filter(m => m !== MP.pubLast);
  const mode = pool[Math.floor(Math.random() * pool.length)];
  MP.pubLast = mode; MP.votes.clear(); MP.myVote = '';
  mpHostStart({ mode, len: [500, 1000, 1000, 2000][Math.floor(Math.random() * 4)] });
}
// de stemmen zoals de host ze doorgaf (bij de host: zelf geteld)
const pubTally0 = () => MP.role === 'host' ? pubTally() : Object.assign(Object.fromEntries(PUB_MODES.map(m => [m, 0])), MP.pubInfo && MP.pubInfo.votes);
const pubSecs = () => { const I = MP.pubInfo; return I && I.at ? Math.max(0, Math.ceil((I.at - Date.now()) / 1000)) : 0; };
function pubStatus() {
  if (verOld()) return 'Nieuwe versie: werk bij om verder te spelen';
  if (!MP.inRoom) return 'Verbinden…';
  const M = MP.match;
  if (M && !M.result && game.mp === M) return '';
  const s = pubSecs();
  if (s) return `Volgende ronde over ${s} s`;
  // wat de host zegt (de host weet of de ronde nog loopt en wie er nog is)
  const I = MP.pubInfo || {}, host = MP.role === 'host';
  const n = host ? roomCount() : I.n || 1 + [...MP.players.values()].filter(P => P.inRoster).length;
  if (n < 2) return 'Wachten op nog een speler…';
  return (host ? pubBusy() : I.busy) ? 'De ronde is nog bezig…' : 'De volgende ronde begint zo…';
}
function pubTimerRender() {
  if (curScreen === 'mp') setText('mpGuestWait', pubStatus());
  if (curScreen === 'mpRes') mpAgainRender();
}

// =====================================================================
//  Apen (bots) in een eigen lobby
//  De host kiest hoeveel apen er meedoen (0-5) en hoe goed ze zijn. De host speelt ze zelf: elke aap
//  heeft een eigen wereld met dezelfde seed (net als Kiwi op één scherm) en stuurt zijn stand zoals een
//  echte speler. Voor de anderen is een aap gewoon een speler. Bij battle royale doen ze niet mee.
// =====================================================================
const BOT_MAX = 5;
const BOT_NAMES = ['Kiwi', 'Mango', 'Coco', 'Bonzo', 'Loeki'];
let botSim = null; // de aap die nu wordt gesimuleerd (geen geluid, geen banners)
function mpSetBots(n, lvl) {
  if (MP.role !== 'host' || MP.pub) return;
  if (n != null) MP.bots.n = clamp(n | 0, 0, BOT_MAX);
  if (lvl != null) MP.bots.lvl = clamp(lvl | 0, 0, AI_LV.length - 1);
  try { localStorage.setItem('andyApples.bots', JSON.stringify(MP.bots)); } catch (e) { /* */ }
  botsSync();
  mpSend({ type: 'lobby', mode: MP.sel.mode, len: MP.sel.len, bots: MP.bots });
}
// host: precies zoveel apen in de lobby als gekozen
function botsSync() {
  if (MP.role !== 'host') return;
  const M = MP.match, n = MP.pub ? 0 : MP.bots.n;
  BOT_NAMES.forEach((nm, i) => {
    const id = 'bot' + i;
    if (i < n) { const P = playerFor(id, nm); P.bot = true; P.inRoster = true; return; }
    const P = MP.players.get(id);
    if (!P) return;
    P.inRoster = false;
    if (M && !M.result && M.ids.includes(id)) { P.left = true; mpSend({ type: 'quit', id: M.seed, from: id }); }
    else MP.players.delete(id);
  });
  rosterSend(); lobbyTrack(); mpRender();
}
function botIn(B) { B.home = grabWorld(); putWorld(B.w); botSim = B; }
function botOut(B) { B.w = grabWorld(); putWorld(B.home); B.home = null; botSim = null; }
// host, bij de start van een potje: elke aap een eigen wereld
function botsStart(M) {
  MP.botRun = []; MP.botQ = [];
  for (const id of M.ids) {
    const P = MP.players.get(id);
    if (!P || !P.bot) continue;
    const bm = { mode: M.mode, len: M.len, seed: M.seed, ids: M.ids, t: 0, myEv: null, falls: 0, result: null, stormX: START_X - 1100, bolt: 0, boltX: 0, bot: P };
    const w = {};
    for (const k in WORLD_VARS) w[k] = WORLD_VARS[k][2]();
    w.mp = bm;
    const B = { P, M: bm, w, ai: { lvl: MP.bots.lvl }, home: null };
    botIn(B); try { resetWorld(); if (ARENA[M.mode]) arenaStart(bm); } finally { botOut(B); }
    MP.botRun.push(B);
  }
}
// host, elk beeld: de apen evenveel stappen laten zetten als jij
function mpBotsStep(n, gdt) {
  const M = game.mp;
  if (!MP.botRun.length || !M || M !== MP.match || M.result) return;
  const q = Sfx.quiet; Sfx.quiet = true;
  for (const B of MP.botRun) {
    if (B.P.left || (B.M.myEv && B.M.t - B.M.myEv.t > 3)) continue; // klaar: nog even doorvliegen, dan stilzetten
    botIn(B);
    try {
      for (let k = 0; k < n; k++) { if (B.M.ar) waveBotThink(B.ai); else aiThink(B.ai); step(DT); }
      interpBegin(true); updateCamera(gdt); interpEnd();
      genUntil(Math.max(camX + viewW + 900, G.x + 2600)); // de aap kijkt tot 1700 px vooruit
      parts.length = 0; texts.length = 0; // effecten ziet niemand
    } finally { botOut(B); }
  }
  Sfx.quiet = q;
  botFlush();
}
// wat de apen deden (finish, af) pas verwerken als jouw eigen wereld weer is ingeladen
function botFlush() {
  for (const m of MP.botQ.splice(0)) { onPlayerMsg(m.from, m); mpSend(m); }
}
function botsSendState() {
  for (const B of MP.botRun) {
    if (B.P.left || (B.M.myEv && B.M.t - B.M.myEv.t > 3)) continue;
    botIn(B);
    let m;
    try { m = stateMsg(B.M, B.P.id); } finally { botOut(B); }
    onPlayerMsg(B.P.id, m); mpSend(m);
  }
}

// ---- lobby-scherm ----
function mpMsg(text, ok) { const el = $('mpMsg'); el.textContent = text || ''; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
const MP_MODE_DESC = {
  race: 'Eerst bij de finish wint. Val je, dan kom je terug, maar verlies je tijd.',
  br: 'Een kleine arena: pak fruitwapens, richt met de muis en klik om te schieten (SPATIE of rechtermuisknop = grijpen; op een telefoon: links = grijpen, rechts tikken = schieten). Zwaaien kan alle kanten op. De storm maakt de arena kleiner; wie als laatste overblijft, wint.',
  endurance: 'Wie het langst volhoudt, wint. Een storm jaagt je op.',
  king: 'Hang aan de gouden liaan: 1 punt per seconde. Beuk de koning eraf door er met vaart tegenaan te zwaaien. Eerst 60 punten, of de meeste na 3 minuten.',
  waves: 'Elke 10 seconden een nieuwe wave gevaren, steeds zwaarder. Je hebt 1 leven; wie af is, wordt een geest en gooit appels. Kan ook alleen.',
  ctf: 'Twee teams. Steel de vlag van de ander en breng hem naar je eigen basis. Beuk vlagdragers eraf, knip lianen door (X) en leg bananenschillen (C). Eerst 3 punten, of wie na 5 minuten voorstaat.',
  kiwi: 'Race naar de finish tegen Kiwi.',
  chase: 'Kiwi zit je achterna en wordt steeds sneller. Hoe lang blijf je hem voor?',
};
function mpRender() {
  const loc = !!MP.local, vsAi = loc && MP.aiLvl != null, host = MP.role === 'host', guest = MP.role === 'guest', pub = !loc && MP.pub;
  const room = loc || MP.inRoom, busy = !room && (!!MP.role || pub);
  const chase = vsAi && MP.sel.mode === 'chase';
  $('mpTitle').textContent = chase ? 'Achtervolging' : vsAi ? 'Tegen Kiwi' : loc ? 'Duel' : pub ? 'Openbare lobby' : room ? (host ? 'Jouw lobby' : `Lobby van ${MP.hostName || 'de host'}`) : 'Multiplayer';
  $('mpHome').classList.toggle('hidden', room || busy);
  $('mpBusy').classList.toggle('hidden', !busy);
  $('mpBusyTxt').textContent = pub ? (MP.link ? 'Verbinden met de openbare lobby…' : 'Openbare lobby binnengaan…')
    : guest ? (MP.link ? `Verbinden met de lobby van ${MP.hostName}…` : `Lobby van ${MP.hostName} zoeken…`) : 'Lobby openen…';
  $('mpRoom').classList.toggle('hidden', !room);
  $('btnMpCancel').classList.toggle('hidden', loc || !(MP.role || pub)); // lokaal doet ← hetzelfde
  $('btnMpCancel').textContent = room ? (host && !pub ? 'Lobby sluiten' : 'Lobby verlaten') : 'Annuleren';
  $('mpMe').classList.toggle('hidden', loc && !vsAi);
  lobbyRender();
  if (!room) { $('btnMpStart').classList.add('hidden'); return; } // de startknop staat onderaan, buiten de lobby-kaart
  // spelers (bij Duel meteen met de besturing erbij)
  const list = loc ? (vsAi ? [{ name: myName(), col: '#e8322b', me: 1 }, { name: 'Kiwi', col: GCK.band }]
    : [{ name: 'Speler 1', col: '#e8322b', keys: '<kbd>SPATIE</kbd> of links/boven tikken' }, { name: 'Speler 2', col: '#2f7fe0', keys: '<kbd>↑</kbd> <kbd>ENTER</kbd> of rechts/onder tikken' }])
    : [{ name: myName(), col: '#e8322b', me: 1, host }].concat([...MP.players.values()].filter(P => P.inRoster).map(P => ({ name: P.name, col: P.col, host: guest && P.host, bot: P.bot })));
  const enough = loc || list.length >= 2 || (MP.sel.mode === 'waves' && !pub); // overleven kan ook alleen
  $('mpPlayers').classList.toggle('stack', loc && !vsAi);
  $('mpPlayers').innerHTML = list.map(p => `<li class="${p.me ? 'me' : ''}"><i style="background:${p.col}"></i><b>${escHtml(p.name)}</b>${p.me && !loc ? ' <small>jij</small>' : ''}${p.host ? ' <small>host</small>' : ''}${p.bot ? ' <small>aap</small>' : ''}${p.keys ? `<span class="keys">${p.keys}</span>` : ''}</li>`).join('')
    + (enough ? '' : `<li class="empty">${pub ? 'Wachten op nog een speler…' : 'Wachten op andere spelers… (of voeg apen toe)'}</li>`);
  $('mpCountTxt').textContent = loc ? '' : `${list.length}/${MP_MAX}`;
  $('btnMpShare').classList.toggle('hidden', !((host && MP.lobby) || pub));
  // modus: achtervolging alleen tegen Kiwi; tegen Kiwi verder alleen race (geen keuze), endurance alleen met twee spelers
  if (MP.sel.mode === 'chase' && !vsAi) MP.sel.mode = 'race';
  if ((MP.sel.mode === 'br' || ARENA[MP.sel.mode]) && loc) MP.sel.mode = 'race'; // battle royale en de arena-modi alleen online
  for (const id of ['mpModeBr', 'mpModeKing', 'mpModeWaves', 'mpModeCtf']) $(id).classList.toggle('hidden', loc);
  if (vsAi && MP.sel.mode === 'endurance') MP.sel.mode = 'race';
  $('mpModeRow').classList.toggle('hidden', vsAi);
  $('mpModeChase').classList.toggle('hidden', !chase);
  $('mpModeRace').classList.toggle('hidden', vsAi);
  $('mpModeEnd').classList.toggle('hidden', vsAi);
  $('mpModeDesc').textContent = pub ? 'Stem op de spelmodus van de volgende ronde. Zonder stemmen kiest het spel er zelf een.' + (MP.myVote ? ' ' + MP_MODE_DESC[MP.myVote] : '')
    : MP_MODE_DESC[chase ? 'chase' : vsAi ? 'kiwi' : MP.sel.mode];
  const canPick = (host && !pub) || loc, tally = pub ? pubTally0() : null;
  $('mpModeWho').textContent = pub ? 'iedereen stemt' : canPick ? '' : 'de host kiest';
  for (const b of document.querySelectorAll('#mpModeRow [data-mode]')) {
    const md = b.dataset.mode;
    b.classList.toggle('sel', pub ? md === MP.myVote : md === MP.sel.mode); b.disabled = !canPick && !pub;
    if (MP_MODE_NAME[md]) b.innerHTML = MP_MODE_NAME[md] + (pub && tally[md] ? ` <i class="vc">${tally[md]}</i>` : ''); // aantal stemmen
  }
  $('mpLens').classList.toggle('hidden', MP.sel.mode !== 'race' || pub);
  for (const b of document.querySelectorAll('[data-len]')) { b.classList.toggle('sel', +b.dataset.len === MP.sel.len); b.disabled = !canPick; }
  $('mpAiLvls').classList.toggle('hidden', !vsAi);
  for (const b of document.querySelectorAll('[data-ai]')) b.classList.toggle('sel', +b.dataset.ai === MP.aiLvl);
  // apen: alleen in een eigen online lobby; de host kiest
  const bots = !loc && !pub;
  const br = !botsOk(MP.sel.mode); // apen doen alleen mee met race, endurance en overleven: anders ook geen knoppen
  $('mpBots').classList.toggle('hidden', !bots || br);
  $('mpBotLvls').classList.toggle('hidden', !bots || br || !MP.bots.n);
  for (const b of document.querySelectorAll('[data-bots]')) { b.classList.toggle('sel', +b.dataset.bots === MP.bots.n); b.disabled = !host; }
  for (const b of document.querySelectorAll('[data-botlvl]')) { b.classList.toggle('sel', +b.dataset.botlvl === MP.bots.lvl); b.disabled = !host; }
  $('mpBotNote').textContent = bots && MP.bots.n && br ? 'Apen doen alleen mee met race, endurance en overleven.' : '';
  // start (openbare lobby: vanzelf)
  $('btnMpStart').classList.toggle('hidden', !canPick);
  $('btnMpStart').disabled = !enough || (!loc && verOld()); // de host moet de nieuwste versie hebben
  $('mpGuestWait').classList.toggle('hidden', canPick);
  $('mpGuestWait').textContent = pub ? pubStatus() : 'Wachten tot de host start…';
}
function openMp() {
  localExit();
  game.mp = null; MP.match = null;
  for (const P of [...MP.players.values()]) if (!P.inRoster) MP.players.delete(P.id);
  if (game.mode !== 'menu') { game.career = null; resetWorld(); game.mode = 'menu'; }
  $('mpName').value = myName();
  $('mpName').readOnly = !!(ACC.user && ACC.username); // je gebruikersnaam pas je aan bij Account
  $('mpName').title = $('mpName').readOnly ? 'Je gebruikersnaam; aan te passen bij Account' : '';
  mpRender();
  showScreen('mp');
  lobbyWatch(); mpIce(); verCheck(true); // TURN-gegevens alvast ophalen, dan hoeft meedoen daar niet op te wachten
}
function mpSelect(mode, len) {
  if (MP.pub && !MP.local) { if (mode) pubVote(mode); return; } // openbare lobby: stemmen
  if (MP.role !== 'host' && !MP.local) return;
  if (mode) MP.sel.mode = mode;
  if (len) MP.sel.len = len;
  if (MP.role === 'host') { mpSend({ type: 'lobby', mode: MP.sel.mode, len: MP.sel.len }); lobbyTrack(); }
  mpRender();
}
function mpHostStart(cfg) {
  if (MP.role !== 'host') return;
  if (cfg.mode === 'chase') cfg = { mode: 'race', len: cfg.len }; // achtervolging is alleen tegen Kiwi
  const bots = !botsOk(cfg.mode) ? [] : [...MP.players.values()].filter(P => P.bot && P.inRoster).map(P => P.id); // apen doen mee met race, endurance en overleven
  const ids = [MP.myId].concat(openLinks().map(l => l.id).filter(id => MP.players.has(id)), bots).slice(0, MP_MAX);
  if (ids.length < 2 && cfg.mode !== 'waves') return; // overleven kan ook alleen
  MP.pubAt = 0;
  const c = { type: 'start', mode: cfg.mode, len: cfg.len, seed: 1 + ((Math.random() * 2147483000) | 0), ids };
  mpSend(c);
  mpStartMatch(c);
}

// ---- een potje ----
const opps = M => [...MP.players.values()].filter(P => M.ids.includes(P.id));
// hoe vaak per seconde je je stand verstuurt: met veel spelers wat minder vaak (minder dataverkeer voor de host)
const sendEvery = M => { const n = M ? M.ids.length : 2; return n <= 4 ? 0.05 : n <= 8 ? 0.1 : 0.15; };
function mpStartMatch(c) {
  const mode = mpModeOf(c.mode);
  MP.cfg = { mode, len: [500, 1000, 2000].includes(c.len) ? c.len : 1000 };
  MP.sel = Object.assign({}, MP.cfg);
  const ids = (Array.isArray(c.ids) ? c.ids : []).filter(id => typeof id === 'string').slice(0, MP_MAX);
  const M = { mode, len: mode === 'race' ? MP.cfg.len : 0, seed: c.seed | 0, t: 0, count: 3.5, lastCount: 99, ids,
    myEv: null, falls: 0, result: null, reason: '', rank: null, place: 0, stormX: START_X - 1100, bolt: 0, boltX: 0 };
  for (const P of MP.players.values()) Object.assign(P, { snaps: [], rt: null, ghost: null, ev: null, left: !ids.includes(P.id) || !P.inRoster, t: 0, dist: 0, apples: 0, falls: 0, lastMsg: performance.now(), lastS: performance.now() });
  for (const l of MP.links.values()) l.lastMsg = performance.now();
  if (MP.link) MP.link.lastMsg = performance.now();
  MP.match = M; MP.round = M; MP.sendAcc = 0; MP.myVote = '';
  ghostPin.v = null;
  game.paused = false; game.career = null; game.mp = M;
  resetWorld();
  if (mode === 'br') brStart(M); else brStop();
  if (ARENA[mode]) arenaStart(M); else arenaStop();
  if (MP.role === 'host') botsStart(M); else MP.botRun = [];
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
  if (mode === 'king') showBanner(`Koning van de liaan${who}`, 'Hang aan de gouden liaan · beuk de koning eraf');
  else if (mode === 'waves') showBanner(`Overleven${who}`, 'Elke 10 seconden een nieuwe wave');
  else if (mode === 'ctf') showBanner(`Vlag veroveren · jij bent ${ctfTeam(M, MP.myId) ? 'rood' : 'blauw'}`, 'X = lianen knippen · C = bananenschil');
  else if (mode === 'br') showBanner(`Battle royale${who}`, IS_MOBILE ? 'Links = grijpen · rechts tikken = schieten' : 'Richt met de muis, klik = schieten · SPATIE = grijpen');
  else showBanner(mode === 'race' ? `Race · ${M.len} m${who}` : `Endurance${who}`, mode === 'race' ? 'Eerst bij de finish wint' : 'Blijf de storm voor');
}
// eigen gebeurtenis: finish (race) of af (endurance)
function mpFinished() {
  const M = game.mp;
  if (!M || M.myEv || M.result) return;
  M.myEv = { t: M.t, d: run.dist };
  if (M.bot) { MP.botQ.push({ type: 'ev', id: M.seed, t: M.t, d: run.dist, from: M.bot.id }); return; } // een aap van de host
  mpSend({ type: 'ev', id: M.seed, t: M.t, d: run.dist, from: MP.myId });
  confetti(G.x + 100, G.y - 150, 100); flashT = 0.3;
  if (!M.local && opps(M).some(P => !P.ev && !P.left)) showBanner('Finish!', 'Even wachten op de anderen…');
  mpCheck();
}
function mpDied() {
  const M = game.mp;
  if (M.ar && arenaDied(M)) return; // arena: terugkomen (Koning, Vlag) of een extra leven (Overleven)
  if (M.mode === 'race' || M.mode === 'chase') {
    M.falls++;
    floatText(G.x, G.y - 70, 'Plons! Even terug…', '#ffffff', 24);
    return;
  }
  if (M.myEv) return;
  if (M.bot) { M.myEv = { t: M.t, d: run.dist }; MP.botQ.push({ type: 'ev', id: M.seed, t: M.t, d: run.dist, from: M.bot.id }); return; }
  if (M.ar) { M.myEv = { t: M.t, d: run.dist }; mpSend({ type: 'ev', id: M.seed, t: M.t, d: run.dist, from: MP.myId }); showBanner('Je bent af!', '👻 Je bent nu een geest: tik om appels te gooien'); mpCheck(); return; }
  M.myEv = { t: M.t, d: run.dist, by: M.mode === 'br' ? brKiller(M) : null };
  mpSend({ type: 'ev', id: M.seed, t: M.t, d: run.dist, from: MP.myId, by: M.myEv.by });
  if (M.mode === 'br') brOut(MP.myId, M.myEv.by);
  if (M.local) floatText(G.x, G.y - 110, 'AF!', '#ffffff', 34);
  else showBanner('Je bent af!', 'Even kijken wie het langst volhoudt…');
  mpCheck();
}
// Is het potje klaar? Iedereen meet zijn eigen tijd vanaf zijn eigen GO; de uitslag volgt uit die tijden.
function mpCheck() {
  const M = game.mp;
  if (!M || M.local || M.bot || M.result || game.mode !== 'playing') return;
  if (mpOver(M)) mpEnd();
}
// is de ronde voor iedereen klaar?
function mpOver(M) {
  const all = [{ me: 1, ev: M.myEv, left: !!M.quit, t: M.t }].concat(opps(M).map(P => ({ ev: P.ev, left: P.left, bot: P.bot, t: P.ev ? Math.max(P.t, P.ev.t) : P.t })));
  const busy = all.filter(x => !x.ev && !x.left);
  const ao = M.ar ? arenaOver(M, all, busy) : null;
  if (ao != null) return ao;
  if (M.mode === 'race') {
    const evs = all.filter(x => x.ev).map(x => x.ev.t), first = evs.length ? Math.min(...evs) : null;
    const grace = all.length <= 2 ? 0 : RACE_GRACE;
    return !busy.length || (first !== null && busy.every(x => x.t > first + grace));
  }
  // endurance en battle royale: klaar als er nog één over is, of als alleen apen nog leven (goede apen houden het bijna eindeloos vol)
  const dead = all.filter(x => x.ev).map(x => x.ev.t), last = dead.length ? Math.max(...dead) : 0;
  return !busy.length || (busy.length === 1 && all.length > 1 && busy[0].t > last) || busy.every(x => x.bot); // alleen apen over: die hielden het langer vol
}
// eindstand: race = finishtijd (daarna afstand), endurance = wie het langst volhield
function mpRanking(M, forfeit) {
  if (M.ar) return arenaRank(M, forfeit);
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
  if (kind === 'forfeit') M.quit = true; else M.done = true; // opgegeven: de ronde loopt voor de anderen nog door
  if (game.mp === M) game.mode = 'mpend';
  mpSendState(); // laatste stand meteen versturen
  // de host geeft op: zijn apen stoppen ook (anders wachten de anderen op ze)
  if (kind === 'forfeit') for (const B of MP.botRun) if (!B.M.myEv && !B.P.left) { B.P.left = true; mpSend({ type: 'quit', id: M.seed, from: B.P.id }); }
  lobbyTrack();
  if (kind === 'conn') {
    M.result = 'conn'; M.reason = reason || 'De verbinding is verbroken.';
    showBanner('Verbinding verbroken', M.reason);
  } else {
    M.rank = mpRanking(M, kind === 'forfeit');
    M.place = M.rank.findIndex(r => r.me) + 1;
    M.result = M.place === 1 && kind !== 'forfeit' ? 'win' : 'lose'; // opgeven is nooit winnen
    const w = M.rank[0], n = M.rank.length;
    M.reason = reason || (M.mode === 'race'
      ? (w.ev ? `${w.me ? 'Jij was' : w.name + ' was'} als eerste bij de finish.` : `${w.me ? 'Jij kwam' : w.name + ' kwam'} het verst.`)
      : `${w.me ? 'Jij hield' : w.name + ' hield'} het langst vol.`);
    if (M.ar) { const R = arenaResult(M); if (R.result) M.result = R.result; M.title = R.title; if (!reason) M.reason = R.reason; }
    if (kind === 'forfeit') { M.result = 'lose'; M.title = 'Opgegeven'; }
    save.mpGames++; MP.games++;
    if (M.result === 'win') { save.mpWins++; MP.wins++; }
    persist();
    if (M.result === 'win') { showBanner('Gewonnen!', M.reason); confetti(G.x + 60, G.y - 160, 140); Sfx.jingle(2); flashT = 0.3; }
    else {
      showBanner(M.title || (n > 2 ? `${M.place}e van ${n}` : 'Verloren'), M.reason);
      Sfx.lose();
    }
  }
  setTimeout(() => { if (MP.match === M && game.mp === M) mpShowResult(); }, kind === 'conn' ? 1200 : 2200);
}
function mpShowResult() {
  const M = MP.match;
  arenaStop();
  $('mpHud').classList.add('hidden');
  $('mpCount').textContent = '';
  const n = M.rank ? M.rank.length : 0;
  $('mpResTitle').textContent = M.result === 'conn' ? 'Verbinding verbroken' : M.title || (M.result === 'win' ? 'Gewonnen!' : n > 2 ? `${M.place}e plaats` : 'Verloren');
  $('mpResSub').textContent = M.reason;
  const fmt = t => fmtTime(t);
  const val = r => r.val ? `${r.left && !r.ev ? 'weg · ' : ''}${r.val}` : M.mode === 'br' ? `${r.left && !r.ev ? 'weg · ' : ''}🎯 ${brKills(r.id)}` : r.left && !r.ev ? 'weg' : M.mode === 'race' ? (r.ev ? fmt(r.ev.t) : `${Math.floor(Math.min(M.len, r.dist))} m`) : (r.ev ? fmt(r.ev.t) : `${Math.floor(r.dist)} m`);
  $('mpResTable').innerHTML = M.rank ? `<ol class="rank">${M.rank.map((r, i) => `<li class="${r.me ? 'me' : ''}"><b>${i + 1}</b><i style="background:${r.col}"></i><span>${escHtml(r.name)}${r.me ? ' (jij)' : ''}</span><span>${val(r)}</span></li>`).join('')}</ol>` : '';
  $('mpResScore').textContent = MP.games ? `Jij won ${MP.wins} van ${MP.games} potje${MP.games === 1 ? '' : 's'} in deze lobby.` : '';
  mpAgainRender();
  showScreen('mpRes');
}
function mpAgainRender() {
  const b = $('btnMpAgain');
  if (LOCAL.on) { $('mpResVote').classList.add('hidden'); b.disabled = false; b.textContent = 'Rematch'; return; }
  const pv = $('mpResVote');
  pv.classList.toggle('hidden', !MP.pub || LOCAL.on);
  if (MP.pub && !LOCAL.on) {
    const t = pubTally0();
    for (const x of pv.querySelectorAll('[data-vote]')) { x.classList.toggle('sel', x.dataset.vote === MP.myVote); x.innerHTML = MP_MODE_NAME[x.dataset.vote] + (t[x.dataset.vote] ? ` <i class="vc">${t[x.dataset.vote]}</i>` : ''); }
    b.disabled = true; b.textContent = pubStatus() || 'Wachten…';
    return;
  }
  if (!MP.inRoom) { b.disabled = true; b.textContent = 'Verbinding verbroken'; return; }
  if (MP.role === 'host') { const ok = roomCount() > 1 && !verOld(); b.disabled = !ok; b.textContent = verOld() ? 'Nieuwe versie: werk bij' : ok ? 'Nieuwe ronde' : 'Niemand meer in de lobby'; }
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
  // niets doen (niet drukken, in battle royale ook niet richten): na MP_AFK seconden doe je niet meer mee
  if (!M.bot && !M.local && !M.myEv && !M.result) {
    const act = input.presses + (M.br ? M.br.aim : 0);
    if (act !== M.act || input.down) { M.act = act; M.actT = M.t; } // ingedrukt houden (aan een liaan hangen) is ook iets doen
    else if (M.t - (M.actT || 0) > MP_AFK) { mpForfeit(`Je deed ${MP_AFK} seconden niets, dus je doet niet meer mee.`); return; }
  }
  if (M.mode === 'race' || M.mode === 'chase') {
    if (G.state === 'dead' && G.deadT > 1.2 && !M.myEv) mpRespawn();
  } else if (M.mode === 'br') brStep(dt);
  else if (M.ar) arenaStep(dt);
  else {
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
      if (G.x - M.stormX < 1400) { Sfx.storm(); shake(2, 0.15); }
    }
  }
  mpCheck();
}
// wordt elk beeld aangeroepen
function mpFrame(realDt, gdt) {
  const M = game.mp;
  const cur = M && M.br && (game.mode === 'playing' || game.mode === 'mpcount') && !curScreen ? 'crosshair' : '';
  if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
  if (!M) { ghostPin.v = null; return; }
  if (game.mode === 'mpcount') {
    M.count -= realDt;
    const c = Math.ceil(M.count - 0.5);
    if (c !== M.lastCount) {
      M.lastCount = c;
      const el = $('mpCount');
      el.textContent = c > 0 ? c : 'GO!';
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      Sfx.countdown(c);
      if (c <= 0) { game.mode = 'playing'; setTimeout(() => { if ($('mpCount').textContent === 'GO!') $('mpCount').textContent = ''; }, 800); }
    }
  }
  // eigen stand versturen
  MP.sendAcc += realDt;
  if (MP.sendAcc >= sendEvery(M)) { MP.sendAcc = 0; mpSendState(); if (MP.botRun.length && !M.result) botsSendState(); }
  // wie te lang niets van zich laat horen, is weg
  if (!M.result && MP.role !== 'host' && MP.link && performance.now() - MP.link.lastMsg > 8000) mpLost('De host reageert niet meer.');
  ghostPin.v = null; ghostPin.more = [];
  for (const P of opps(M)) mpGhost(P, gdt, M);
  mpHud();
}
function mpSendState() {
  const M = MP.match;
  if (!M || !G || !MP.inRoom) return;
  mpSend(stateMsg(M, MP.myId));
}
// de stand van de Andy die nu is ingeladen (jij, of een aap van de host)
function stateMsg(M, from) {
  const tr = G.trick;
  return { type: 's', id: M.seed, from, t: +M.t.toFixed(3), x: Math.round(G.x), y: Math.round(G.y), vx: Math.round(G.vx), vy: Math.round(G.vy),
    st: G.state, a: +(G.angle + (G.trickRot || 0)).toFixed(3), tr: tr ? tr.id : 0, tk: tr ? +Math.min(1, G.trickT / tr.dur).toFixed(3) : 0,
    hx: Math.round(G.hx), hy: Math.round(G.hy), dv: G.diving ? 1 : 0, sp: G.state === 'hang' ? Math.round(G.om * G.R) : 0, tu: G.turboT > 0 ? 1 : 0,
    vid: G.state === 'hang' && G.vine ? G.vine.id : -1, k: G.k, d: +run.dist.toFixed(1), ap: Math.max(0, Math.floor(run.earned)), f: M.falls,
    ...(M.br ? { hp: M.br.hp, w: M.br.w, am: +M.br.aim.toFixed(2) } : {}) };
}
const lerpAng = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };
// Andere spelers worden iets in het verleden getekend, tussen twee ontvangen standen in: zo bewegen ze vloeiend
function mpGhost(P, dt, M) {
  const S = P.snaps;
  if (!S.length) return;
  const late = P.relay || (MP.link && MP.link.viaR) ? 0.18 : 0; // via de server komen standen gebundeld binnen
  const newest = S[S.length - 1], target = newest.t - (0.07 + 1.5 * sendEvery(M) + late);
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
  if (M.mode === 'br') { g.brHp = +b.hp; g.brW = BR_WEAPONS[b.w] ? b.w : 'sling'; g.brAim = lerpAng(+a.am || 0, +b.am || 0, f); }
  // hangt hij aan een liaan? dan buigt die liaan bij jou ook mee (één tegelijk)
  if (g.state === 'hang' && s.vid >= 0) {
    const v = vines.find(w => w.id === s.vid);
    if (v && v.id >= MP_FREE_VINES && v !== G.vine && v.anchored && s.k < v.pts.length) {
      const an = v.pts[0], reach = s.k * SEG_LEN * (v.type === 'elastic' ? ELASTIC_STRETCH : 1) + 60;
      if (Math.hypot(g.hx - an.x, g.hy - an.y) < reach) {
        if (!ghostPin.v) { ghostPin.v = v; ghostPin.k = s.k; ghostPin.x = g.hx; ghostPin.y = g.hy; }
        else if (ghostPin.v !== v && !ghostPin.more.some(q => q.v === v)) ghostPin.more.push({ v, k: s.k, x: g.hx, y: g.hy });
      }
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
  } else if (M.ar) {
    info = arenaHud(M);
  } else if (M.mode === 'br') {
    info = `${tm} · 🎯 ${brKills(MP.myId)} · nog ${mpPlace(M)} van ${n} over`;
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
  if (!(M && M.local && M.idx === 1)) { const pal = GC; GC = myLook(); try { drawGorilla(); } finally { GC = pal; } return; } // jouw uiterlijk uit de kisten
  const pal = GC; GC = oppPal(); // speler 2 is altijd de blauwe (of Kiwi)
  try { drawGorilla(); } finally { GC = pal; }
}
// de andere gorilla's: op één scherm de gorilla van de andere speler, online die van iedereen in het potje
function mpOthers() {
  const M = game.mp;
  if (!M) return [];
  if (M.local) return [{ g: LOCAL.worlds[1 - M.idx].G, name: localName(1 - M.idx), pal: M.idx === 1 ? myLook() : oppPal(), tag: M.idx === 1 ? '#a8141c' : (LOCAL.ai ? '#2c6e18' : '#17498f'), local: true }];
  const col = P => M.mode === 'ctf' && M.ar ? CTF_COL[ctfTeam(M, P.id)] : P.col; // vlag: in de kleur van je team
  return opps(M).filter(P => P.ghost && !(P.left && !P.ev)).map(P => ({ g: P.ghost, name: P.name, pal: P.bot ? botPal(col(P)) : palOf(col(P)), tag: shade(col(P), -0.35) }));
}
// apen zijn oranje orang-oetans (zoals Kiwi), met een eigen bandanakleur
const botPal = col => Object.assign({}, palOf(col), { kiwi: true, fur: GCK.fur, furD: GCK.furD, furL: GCK.furL, skin: GCK.skin, skinD: GCK.skinD });
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
  if (M.br) { drawBr(); return; }
  if (M.ar) { arenaDraw(); return; }
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
  if (M.br) drawBrOverlay();
  if (M.ar) arenaOverlay();
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
  const chaseGap = M.chase === false && LOCAL.ai ? G.x - LOCAL.worlds[1].G.x : Infinity; // achtervolging: hoe dicht zit Kiwi achter je?
  if ((M.mode === 'endurance' || chaseGap < 900) && G.state !== 'dead' && game.mode === 'playing') {
    const gap = M.mode === 'endurance' ? G.x - M.stormX : chaseGap;
    if (gap < 900) {
      const a = (1 - gap / 900) * (0.55 + 0.45 * Math.sin(time * 10));
      const gr = cachedGrad('stormwarn' + Math.round(viewH), () => { const q = ctx.createLinearGradient(0, 0, 140, 0); q.addColorStop(0, 'rgba(150,60,255,.75)'); q.addColorStop(1, 'rgba(150,60,255,0)'); return q; });
      if (M.mode === 'chase') ctx.filter = 'hue-rotate(80deg)'; // oranjerood: Kiwi komt eraan
      ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = gr; ctx.fillRect(0, 0, 140, viewH); ctx.globalAlpha = 1; ctx.filter = 'none';
    }
  }
}
