'use strict';
// Andy Apples · online (Supabase)
// Optioneel: één Supabase-client voor lobbies, ranglijst en accounts (zie README: "Supabase instellen").

// ---- Supabase (optioneel): één client voor accounts, lobbies en de ranglijst ----
// De bibliotheek wordt pas geladen als het project is ingesteld (CONFIG.supabase).
const sbOn = () => !!(CONFIG.supabase.url && CONFIG.supabase.key);
const SB_LIBS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js', 'https://unpkg.com/@supabase/supabase-js@2.117.2/dist/umd/supabase.js'];
let sbClient = null, sbLoading = null;
function loadScript(src) {
  return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => { el.remove(); rej(new Error('laden mislukt')); }; document.head.appendChild(el); });
}
function getSb() {
  if (!sbOn()) return Promise.reject(new Error('Online spelen is nog niet ingesteld.'));
  if (sbClient) return Promise.resolve(sbClient);
  if (!sbLoading) sbLoading = (async () => {
    for (const src of SB_LIBS) {
      if (window.supabase && window.supabase.createClient) break;
      try { await loadScript(src); } catch (e) { /* volgende bron proberen */ }
    }
    if (!(window.supabase && window.supabase.createClient)) { sbLoading = null; throw new Error('Geen verbinding met de server. Heb je internet?'); }
    sbClient = window.supabase.createClient(CONFIG.supabase.url.replace(/\/+$/, ''), CONFIG.supabase.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: /^https?:$/.test(location.protocol), storageKey: 'andyApples.auth' },
      realtime: { params: { eventsPerSecond: 40 } }, // multiplayer via de server (zie relayOpen in mp-online.js) stuurt ~10 berichten per seconde
    });
    return sbClient;
  })();
  return sbLoading;
}


// =====================================================================
//  Ranglijst (Eindeloos): alleen spelers met een account en een gebruikersnaam (zie README)
// =====================================================================
// Scores worden alleen via een ingelogde sessie bewaard (functie submit_run); de openbare lijst is de view "leaderboard".
const LB_SENT_KEY = 'andyApples.lbSent2';
const lbOn = sbOn;
let lbReturn = 'menu';
const lbReady = () => !!(ACC.user && ACC.username); // mag deze speler op de ranglijst?
async function lbFetch(path, opt) {
  const { url, key } = CONFIG.supabase;
  const headers = Object.assign({ apikey: key, 'Content-Type': 'application/json' }, /^eyJ/.test(key) ? { Authorization: 'Bearer ' + key } : {}, opt && opt.headers);
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => ctl && ctl.abort(), 8000);
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/rest/v1/' + path, Object.assign({}, opt, { headers, signal: ctl && ctl.signal }));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } finally { clearTimeout(t); }
}
// stuurt je beste afstand naar de ranglijst (alleen ingelogd, met een gebruikersnaam, en alleen als er iets veranderd is)
async function lbSubmit(force) {
  if (!lbOn() || !lbReady() || save.lbBest < 1) return;
  let sent = {};
  try { sent = JSON.parse(localStorage.getItem(LB_SENT_KEY)) || {}; } catch (e) { /* niets verstuurd */ }
  if (!force && sent.u === ACC.user.id && sent.d >= save.lbBest) return;
  const { error } = await (await getSb()).rpc('submit_run', { p_dist: save.lbBest });
  if (error) throw error;
  try { localStorage.setItem(LB_SENT_KEY, JSON.stringify({ u: ACC.user.id, d: save.lbBest })); } catch (e) { /* negeren */ }
}
// jouw plek: het aantal spelers met een grotere afstand + 1
async function lbRank() {
  if (!lbOn() || !lbReady() || save.lbBest < 1) return 0;
  const r = await lbFetch(`leaderboard?select=name&dist=gt.${save.lbBest}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  const m = /\/(\d+)/.exec(r.headers.get('content-range') || '');
  return m ? +m[1] + 1 : 0;
}
async function lbShow() {
  const list = $('lbList'), me = ACC.username;
  $('lbSub').textContent = save.lbBest ? `Eindeloos · jouw record: ${save.lbBest} m` : 'Eindeloos · verste afstand';
  // runs met een aangepaste debug-snelheid tellen niet mee: zeg dat erbij als je 'echte' record daardoor lager is
  if (save.best > save.lbBest) $('lbSub').textContent += ` (${save.best} m telt niet mee: gespeeld met een aangepaste debug-snelheid)`;
  $('lbMsg').textContent = '';
  // nog niet op de ranglijst: zeg hoe je erop komt
  $('lbJoin').classList.toggle('hidden', !lbOn() || lbReady());
  $('lbJoinTxt').textContent = ACC.user ? 'Kies een gebruikersnaam om op de ranglijst te komen.' : 'Log in om met je gebruikersnaam op de ranglijst te komen.';
  if (!lbOn()) { list.innerHTML = '<li class="empty">De ranglijst is nog niet ingesteld.</li>'; return; }
  if (!list.children.length || list.querySelector('.empty')) list.innerHTML = '<li class="empty">Laden…</li>';
  try {
    await lbSubmit().catch(() => { /* versturen mislukt: de lijst toch laten zien */ });
    const rows = await (await lbFetch('leaderboard?select=name,dist&order=dist.desc,updated_at.asc&limit=50')).json();
    let mine = false;
    list.innerHTML = rows.length ? rows.map((r, i) => {
      const isMe = !mine && !!me && r.name.toLowerCase() === me.toLowerCase();
      if (isMe) mine = true;
      return `<li class="${isMe ? 'me' : ''}"><b>${i + 1}</b><span>${escHtml(r.name)}</span><span>${r.dist | 0} m</span></li>`;
    }).join('') : '<li class="empty">Nog niemand. Word de eerste!</li>';
    if (!mine && lbReady() && save.lbBest) { const rk = await lbRank().catch(() => 0); if (rk) { $('lbMsg').textContent = `Jij staat op #${rk}`; $('lbMsg').className = 'msg ok'; } }
  } catch (e) {
    list.innerHTML = /HTTP 404/.test(e.message) ? '<li class="empty">De ranglijst moet nog worden ingericht (zie README).</li>' : '<li class="empty">Kon de ranglijst niet laden. Heb je internet?</li>';
  }
}
function openLb(from) { lbReturn = from || 'menu'; showScreen('lb'); lbShow(); }
function setMyName(n) {
  n = cleanName(n);
  try { localStorage.setItem(MP_NAME_KEY, n); } catch (err) { /* negeren */ }
  return n;
}
// Bij het opstarten (vanuit main.js): knoppen van de ranglijst
function lbInit() {
  on('btnLb', () => openLb('menu'));
  on('btnOverLb', () => openLb('over'));
  on('btnLbBack', () => showScreen(lbReturn));
  on('btnLbPlay', () => startReady(null));
  on('btnLbAcc', () => openAccount('lb'));
}

// =====================================================================
//  Account: voortgang online bewaren (Supabase Auth + tabel "saves", zie README)
// =====================================================================
// De save blijft ook gewoon lokaal staan. Elke wijziging wordt na een paar seconden online bewaard.
// Bij het inloggen (of opstarten) wordt de online save opgehaald; zijn beide kanten gewijzigd, dan kies je zelf.
const SYNC_KEY = 'andyApples.sync';   // { uid, at: tijd van de laatst gesynchroniseerde online save, dirty }
const ACC = { user: null, username: null, rev: 0, timer: 0, applying: false, status: '', listening: false, back: 'menu' };
function syncState() { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } }
function setSync(o) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(o)); } catch (e) { /* negeren */ } }
const sameT = (a, b) => !!a && !!b && Date.parse(a) === Date.parse(b);
const saveSummary = sv => `level ${playerLevel(sv.xp).L}, ${sv.apples} appels, record ${sv.best} m`;
const hasProgress = sv => sv.xp > 0 || sv.apples > 0 || sv.runs > 0;
// aangeroepen bij elke persist(): markeer als gewijzigd en bewaar straks online
function cloudDirty() {
  if (ACC.applying || !ACC.user) return;
  ACC.rev++;
  const st = syncState();
  if (st.uid === ACC.user.id && !st.dirty) setSync(Object.assign(st, { dirty: true }));
  clearTimeout(ACC.timer);
  ACC.timer = setTimeout(() => cloudPush().catch(() => { ACC.status = 'Online opslaan lukte niet; wordt later opnieuw geprobeerd.'; accRender(); }), 4000);
}
function applyCloud(data, at) {
  ACC.applying = true;
  try { save = normalizeSave(data); persist(); } finally { ACC.applying = false; }
  setSync({ uid: ACC.user.id, at, dirty: false });
  refreshMenu();
  if (curScreen === 'shop') renderShop();
}
async function cloudPush(force) {
  const u = ACC.user;
  if (!u) return;
  clearTimeout(ACC.timer);
  const st = syncState();
  if (!force && st.uid === u.id && !st.dirty) return;
  const sb = await getSb(), rev = ACC.rev, at = new Date().toISOString();
  const { error } = await sb.from('saves').upsert({ user_id: u.id, data: JSON.parse(JSON.stringify(save)), updated_at: at });
  if (error) throw error;
  if (ACC.user !== u) return;
  setSync({ uid: u.id, at, dirty: ACC.rev !== rev }); // tijdens het versturen weer gewijzigd? dan blijft hij "dirty"
  ACC.status = 'Online bewaard om ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  accRender();
}
async function cloudPull() {
  const u = ACC.user;
  if (!u) return;
  ACC.status = 'Synchroniseren…'; accRender();
  try {
    const sb = await getSb();
    const { data, error } = await sb.from('saves').select('data, updated_at').eq('user_id', u.id).maybeSingle();
    if (error) throw error;
    if (ACC.user !== u) return;
    const st = syncState(), mine = st.uid === u.id;
    if (!data) await cloudPush(true);                                          // nieuw account: huidige voortgang uploaden
    else if (mine && !st.dirty) {                                               // hier niets gewijzigd: online versie nemen
      if (!sameT(data.updated_at, st.at)) applyCloud(data.data, data.updated_at);
      ACC.status = 'Voortgang is bijgewerkt.';
    } else if (mine && sameT(data.updated_at, st.at)) await cloudPush(true);   // alleen hier gewijzigd
    else {                                                                      // beide kanten gewijzigd (of eerste keer op dit apparaat)
      const cloud = normalizeSave(data.data);
      let useCloud;
      if (!hasProgress(save) || JSON.stringify(cloud) === JSON.stringify(save)) useCloud = true;
      else if (!hasProgress(cloud)) useCloud = false;
      else useCloud = confirm(`Er staat al voortgang online.\n\nOnline: ${saveSummary(cloud)}\nDit apparaat: ${saveSummary(save)}\n\nOK = online voortgang gebruiken\nAnnuleren = voortgang van dit apparaat houden (overschrijft online)`);
      if (useCloud) { applyCloud(data.data, data.updated_at); ACC.status = 'Online voortgang geladen.'; }
      else await cloudPush(true);
    }
  } catch (e) { if (ACC.user === u) ACC.status = 'Online opslaan lukt nu niet. Je voortgang blijft op dit apparaat bewaard.'; }
  accRender();
}
// Supabase laden en luisteren naar in- en uitloggen (ook een bewaarde sessie van een vorige keer)
async function accEnsure() {
  const sb = await getSb();
  if (!ACC.listening) {
    ACC.listening = true;
    sb.auth.onAuthStateChange((ev, session) => {
      const u = session ? session.user : null, prev = ACC.user;
      ACC.user = u;
      if (u && (!prev || prev.id !== u.id)) { ACC.username = null; setTimeout(() => { cloudPull(); loadProfile(); }, 0); } // niet binnen deze callback zelf (advies van Supabase)
      if (!u) { ACC.status = ''; ACC.username = null; }
      accRender(); refreshMenu();
    });
  }
  return sb;
}
function accErr(e) {
  const m = String((e && e.message) || e || '');
  if (/invalid login/i.test(m)) return 'Onjuist e-mailadres of wachtwoord.';
  if (/not confirmed/i.test(m)) return 'Bevestig eerst je e-mailadres via de link in je mail.';
  if (/already registered|already exists/i.test(m)) return 'Er bestaat al een account met dit e-mailadres. Log in.';
  if (/rate limit|too many/i.test(m)) return 'Te veel pogingen. Probeer het over een paar minuten opnieuw.';
  if (/password/i.test(m)) return 'Kies een sterker wachtwoord (minstens 6 tekens).';
  if (/fetch|network|internet/i.test(m)) return 'Geen verbinding met de server. Heb je internet?';
  return 'Er ging iets mis: ' + m;
}
// ---- Gebruikersnaam (tabel "profiles"): uniek, 3-16 tekens; nodig voor de ranglijst, en je naam in multiplayer ----
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
async function loadProfile() {
  const u = ACC.user;
  if (!u) return;
  try {
    const { data, error } = await (await getSb()).from('profiles').select('username').eq('user_id', u.id).maybeSingle();
    if (error) throw error;
    if (ACC.user !== u) return;
    ACC.username = data ? data.username : null;
    accRender();
    if (ACC.username) lbSubmit().catch(() => { /* later opnieuw */ });
  } catch (e) { /* offline of tabel nog niet ingericht: geen naam */ }
}
// voorstel voor een nieuwe naam: het begin van je e-mailadres, zonder rare tekens
const suggestName = email => String(email || '').split('@')[0].replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
async function saveUsername() {
  const u = ACC.user, name = $('accName').value.trim();
  if (!u) return;
  if (!USERNAME_RE.test(name)) { accMsg('Een gebruikersnaam heeft 3 tot 16 tekens: letters, cijfers of _.'); return; }
  if (name === ACC.username) { accMsg('Dat is al je gebruikersnaam.', true); return; }
  $('btnAccName').disabled = true;
  try {
    const { error } = await (await getSb()).from('profiles').upsert({ user_id: u.id, username: name, updated_at: new Date().toISOString() });
    if (error) {
      if (error.code === '23505') accMsg(`De naam "${name}" is al bezet. Kies een andere.`);
      else if (error.code === '23514') accMsg('Een gebruikersnaam heeft 3 tot 16 tekens: letters, cijfers of _.');
      else if (error.code === '42P01' || /could not find|does not exist/i.test(error.message || '')) accMsg('Gebruikersnamen zijn nog niet ingericht in de database (zie README).');
      else accMsg(accErr(error));
    } else {
      const first = !ACC.username;
      ACC.username = name; accRender();
      accMsg(first ? `Welkom op de ranglijst, ${name}!` : 'Gebruikersnaam aangepast.', true);
      lbSubmit(true).catch(() => { /* later opnieuw */ });
    }
  } catch (e) { accMsg(accErr(e)); }
  $('btnAccName').disabled = false;
}
function accMsg(t, ok) { const el = $('accMsg'); el.textContent = t || ''; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
function accRender() {
  const u = ACC.user;
  $('accOut').classList.toggle('hidden', !!u);
  $('accIn').classList.toggle('hidden', !u);
  $('accWho').textContent = u ? u.email || '' : '';
  const inp = $('accName');
  if (u && document.activeElement !== inp) inp.value = ACC.username || suggestName(u.email);
  $('accNameHint').textContent = u && !ACC.username ? 'Kies een gebruikersnaam om op de ranglijst te komen.' : 'Deze naam zie je op de ranglijst en in multiplayer.';
  $('accSync').textContent = ACC.status;
  $('mmAcc').textContent = u ? 'Ingelogd' : 'Account';
}
async function accLogin(signup) {
  const email = $('accEmail').value.trim(), password = $('accPass').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { accMsg('Vul een geldig e-mailadres in.'); return; }
  if (password.length < 6) { accMsg('Het wachtwoord moet minstens 6 tekens hebben.'); return; }
  $('btnAccLogin').disabled = $('btnAccSignup').disabled = true;
  accMsg(signup ? 'Account maken…' : 'Inloggen…', true);
  try {
    const sb = await accEnsure();
    const redirect = CONFIG.siteUrl || (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined);
    const r = signup ? await sb.auth.signUp({ email, password, options: redirect ? { emailRedirectTo: redirect } : {} })
      : await sb.auth.signInWithPassword({ email, password });
    if (r.error) accMsg(accErr(r.error));
    else if (signup && r.data.user && Array.isArray(r.data.user.identities) && !r.data.user.identities.length) accMsg('Er bestaat al een account met dit e-mailadres. Log in.');
    else if (signup && !r.data.session) accMsg('Bijna klaar: klik op de link in de e-mail die je net kreeg, en log daarna hier in.', true);
    else { $('accPass').value = ''; accMsg(''); }
  } catch (e) { accMsg(accErr(e)); }
  $('btnAccLogin').disabled = $('btnAccSignup').disabled = false;
}
function openAccount(from) {
  ACC.back = from || 'menu';
  accMsg(''); accRender(); showScreen('account');
  if (sbOn()) accEnsure().catch(e => accMsg(accErr(e)));
}
// Bij het opstarten (vanuit main.js): knoppen van het account
function accountInit() {
  on('btnAccount', () => openAccount('menu'));
  on('btnAccBack', () => { if (ACC.back === 'lb') { showScreen('lb'); lbShow(); } else showScreen('menu'); });
  on('btnAccName', saveUsername);
  $('accName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveUsername(); } });
  on('btnAccLogin', () => accLogin(false));
  on('btnAccSignup', () => accLogin(true));
  $('accPass').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); accLogin(false); } });
  on('btnAccSync', () => { accMsg(''); cloudPush(true).then(() => accMsg('Opgeslagen.', true), e => accMsg(accErr(e))); });
  on('btnAccLogout', async () => {
    try { await cloudPush(); } catch (e) { /* offline: lokaal blijft alles staan */ }
    try { await (await getSb()).auth.signOut(); } catch (e) { /* */ }
    ACC.user = null; ACC.username = null; setSync({}); accRender(); refreshMenu();
    accMsg('Uitgelogd. Je voortgang staat nog op dit apparaat.', true);
  });
  window.addEventListener('pagehide', () => { if (ACC.user && syncState().dirty) cloudPush().catch(() => { /* */ }); });
}
