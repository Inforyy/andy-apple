'use strict';
// Andy Apples · geluid en muziek
// Geluidseffecten en procedurele muziek met WebAudio (geen geluidsbestanden).

// =====================================================================
//  Geluidseffecten (WebAudio, geen bestanden nodig)
//  Mix: elk geluid -> (panner) -> sfx-bus -> master -> onderwaterfilter -> limiter -> luidsprekers.
//  Een deel gaat via een send naar een gedeelde galm; de muziek heeft een eigen bus.
//  Elk effect varieert een beetje in toonhoogte en volume (vary), zodat herhaalde geluiden niet
//  eentonig worden, en is opgebouwd uit lagen: een aanzet (tik), een lichaam en een staart.
// =====================================================================
const Sfx = {
  ac: null, noiseBuf: null, pinkBuf: null, bus: null, musicBus: null, verbIn: null, under: null,
  pv: 1, gv: 1, pan: 0, pp: null, last: {}, isUnder: false, resetQ: false,
  init() {
    if (!this.ac) {
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ac = null; }
      if (this.ac) this.build();
    }
    if (this.ac && this.ac.state === 'suspended' && !document.hidden) this.ac.resume();
    Music.start();
  },
  // de mixer en de ruisbuffers (eenmalig)
  build() {
    const ac = this.ac, n = ac.sampleRate;
    this.noiseBuf = ac.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // roze ruis (Paul Kellet): voller en minder sissend dan wit, fijn voor wind, water en gerommel
    this.pinkBuf = ac.createBuffer(1, n * 2, n);
    const p = this.pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < p.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    // limiter: vangt pieken op als veel geluiden tegelijk klinken (geen gekraak)
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
    // onderwaterfilter: staat normaal helemaal open
    this.under = ac.createBiquadFilter(); this.under.type = 'lowpass'; this.under.frequency.value = 20000; this.under.Q.value = 0;
    const master = ac.createGain();
    master.connect(this.under).connect(lim).connect(ac.destination);
    this.bus = ac.createGain(); this.bus.connect(master);
    this.musicBus = ac.createGain(); this.musicBus.connect(master);
    // galm: een zelfgemaakte impulsrespons (ruis die wegsterft en steeds doffer wordt), zoals een open bos
    const len = Math.floor(n * 1.3), ir = ac.createBuffer(2, len, n);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len, a = 0.5 - 0.42 * k; // hoe verder, hoe doffer
        lp += a * ((Math.random() * 2 - 1) - lp);
        ch[i] = i < n * 0.012 ? 0 : lp * Math.pow(1 - k, 3.2);
      }
    }
    const verb = ac.createConvolver(); verb.buffer = ir;
    this.verbIn = ac.createGain(); this.verbIn.gain.value = 0.55;
    this.verbIn.connect(verb).connect(this.bus);
    this.setVolume();
  },
  // volume uit de instellingen (kwadratisch: voelt gelijkmatiger aan dan lineair)
  setVolume() {
    if (!this.bus) return;
    const t = this.ac.currentTime;
    this.bus.gain.setTargetAtTime(1.5 * save.sfxVol * save.sfxVol, t, 0.03);
    this.musicBus.gain.setTargetAtTime(1.5 * save.musicVol * save.musicVol, t, 0.03);
  },
  // onder water: alles (ook de muziek) klinkt gedempt
  setUnder(on) {
    if (!this.under || this.isUnder === on) return;
    this.isUnder = on;
    this.under.frequency.setTargetAtTime(on ? 650 : 20000, this.ac.currentTime, on ? 0.08 : 0.15);
  },
  ok() { return save.sound && this.ac && this.bus && !this.quiet; }, // quiet: de host rekent een aap door (mp-online.js)
  // variatie voor het effect dat nu start: toonhoogte ±p en volume ±db (in dB). Na dit beeld weer neutraal.
  vary(p = 0.04, db = 2) {
    this.pv = 1 + (Math.random() * 2 - 1) * p;
    this.gv = Math.pow(10, (Math.random() * 2 - 1) * db / 20);
    this.later();
  },
  // stereo naar de plek in de wereld (alleen met één speler; in split-screen bepaalt de speler de kant)
  at(x) {
    if (x == null || LOCAL.on || !viewW) return;
    this.pp = clamp(((x - camX) / viewW - 0.5) * 0.8, -0.4, 0.4);
    this.later();
  },
  later() {
    if (this.resetQ) return;
    this.resetQ = true;
    queueMicrotask(() => { this.pv = this.gv = 1; this.pp = null; this.resetQ = false; });
  },
  // voice limiting: hetzelfde geluid niet vaker dan eens per gap seconden
  gate(name, gap) {
    if (!this.ac) return false;
    const now = this.ac.currentTime;
    if (now - (this.last[name] ?? -9) < gap) return false;
    this.last[name] = now; return true;
  },
  // uitgang van één geluid: panner, droog naar de bus en een deel naar de galm
  route(node, send = 0) {
    const ac = this.ac, pan = this.pp ?? this.pan;
    let out = node;
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node.connect(p); out = p; }
    out.connect(this.bus);
    if (send > 0) { const s = ac.createGain(); s.gain.value = send; out.connect(s).connect(this.verbIn); }
  },
  // Eén toon. f -> f2 (glijden), zachte aanzet a, optioneel een filter (lp -> lp2), FM (fm = verhouding,
  // fmd = diepte, klinkt als bel/hout/metaal), wobbel (wob = [snelheid, cent]) en galm (send).
  voice(o) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + (o.delay || 0), d = o.d, f = o.f * this.pv;
    const v = Math.max(0.0002, o.v * this.gv), att = Math.min(o.a ?? 0.005, d * 0.5), glide = o.glide || d;
    const osc = ac.createOscillator(), g = ac.createGain(), nodes = [osc];
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * this.pv, t + glide);
    if (o.det) osc.detune.value = o.det;
    if (o.fm) {
      const m = ac.createOscillator(), mg = ac.createGain(), dep = f * (o.fmd || 1);
      m.frequency.setValueAtTime(f * o.fm, t);
      if (o.f2) m.frequency.exponentialRampToValueAtTime(o.f2 * this.pv * o.fm, t + glide);
      mg.gain.setValueAtTime(dep, t); mg.gain.exponentialRampToValueAtTime(dep * 0.04 + 0.01, t + d * (o.fmDec || 0.6));
      m.connect(mg).connect(osc.frequency); nodes.push(m);
    }
    if (o.wob) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = o.wob[0]; lg.gain.setValueAtTime(o.wob[1], t); lg.gain.linearRampToValueAtTime(0, t + d);
      l.connect(lg).connect(osc.detune); nodes.push(l);
    }
    let head = osc;
    if (o.lp) {
      const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = o.q ?? 1;
      flt.frequency.setValueAtTime(o.lp, t);
      if (o.lp2) flt.frequency.exponentialRampToValueAtTime(o.lp2, t + d);
      head.connect(flt); head = flt;
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    head.connect(g); this.route(g, o.send || 0);
    for (const nd of nodes) { nd.start(t); nd.stop(t + d + 0.05); }
  },
  // oude vorm (f, duur, golfvorm, volume, glijden-naar, vertraging); krijgt een klein beetje galm
  tone(f, d, type = 'sine', v = 0.1, f2 = 0, delay = 0) { this.voice({ f, d, type, v, f2, delay, send: 0.12 }); },
  // ruis door een filter (standaard lowpass); o: type, f2 (filter glijdt), q, a (aanzet), pink, send
  noise(d, v = 0.2, freq = 900, delay = 0, o = {}) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = o.pink ? this.pinkBuf : this.noiseBuf; src.loop = true;
    const flt = ac.createBiquadFilter(); flt.type = o.type || 'lowpass'; flt.Q.value = o.q ?? 1;
    flt.frequency.setValueAtTime(freq * this.pv, t);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2 * this.pv, t + d);
    const g = ac.createGain(), att = Math.min(o.a ?? 0.003, d * 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * this.gv), t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(flt).connect(g); this.route(g, o.send || 0);
    src.start(t, Math.random() * 0.5); src.stop(t + d + 0.03);
  },
  // Zoef: roze ruis door een bandfilter dat van f0 naar f1 schuift, met een zachte aanzet (zwaaien, overgangen)
  whoosh(d, f0, f1, v, delay = 0, q = 1.4, att = 0.3, send = 0.1) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = this.pinkBuf; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0 * this.pv, t); bp.frequency.exponentialRampToValueAtTime(f1 * this.pv, t + d);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * this.gv * 1.6, t + d * att); g.gain.exponentialRampToValueAtTime(0.0001, t + d); // *1.6: roze ruis is zachter dan wit
    src.connect(bp).connect(g); this.route(g, send);
    src.start(t, Math.random() * 1.5); src.stop(t + d + 0.05);
  },
  // ---- bouwstenen ----
  // bel/pling: FM met een snel wegstervende boventoon
  bell(f, d, v, delay = 0, send = 0.25, ratio = 3.5) {
    this.voice({ f, d, v, delay, send, fm: ratio, fmd: 0.9, fmDec: 0.3 });
    this.voice({ f: f * 2, d: d * 0.45, v: v * 0.3, delay });
  },
  // houtige tik (menu, kist, liaan)
  tick(f, v, delay = 0) {
    this.noise(0.03, v, f, delay, { type: 'bandpass', q: 2 });
    this.voice({ f: f * 0.5, d: 0.035, v: v * 0.9, delay, a: 0.001, fm: 1.41, fmd: 0.6 });
  },
  // veer: toon schiet omhoog en wiebelt na
  spring(f0, f1, d, v, delay = 0) {
    this.voice({ f: f0, f2: f1, glide: d * 0.35, d, v, delay, a: 0.004, wob: [13, 55], send: 0.12 });
    this.voice({ f: f0 * 2, f2: f1 * 2, glide: d * 0.3, d: d * 0.6, v: v * 0.25, delay, type: 'triangle', lp: 2500 });
  },
  // bubbeltjes: korte stijgende sinusjes op willekeurige momenten
  bubbles(n, t0, span, v) {
    for (let i = 0; i < n; i++) {
      const f = rand(350, 1100);
      this.voice({ f, f2: f * rand(1.5, 2.2), d: rand(0.04, 0.08), v: v * rand(0.5, 1), delay: t0 + Math.random() * span, a: 0.004 });
    }
  },
  arp(base, semis, gap, v, d = 0.18, delay = 0, send = 0.22) {
    semis.forEach((s, i) => this.bell(base * Math.pow(2, s / 12), d, v, delay + i * gap, send));
  },

  // =====================================================================
  //  De effecten
  // =====================================================================
  // appel: een glazen "pling" die met de combo meeklimt, plus een krokant hapje
  apple(gold, combo = 1, x) {
    if (!this.gate('apple', 0.025)) return;
    this.vary(0.012, 1.5); this.at(x);
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
    const f = 740 * Math.pow(2, steps[Math.min(combo - 1, steps.length - 1)] / 12);
    this.noise(0.03, 0.06, 3400, 0, { type: 'bandpass', q: 1.6 });
    if (gold) {
      [1, 1.25, 1.5, 2].forEach((m, i) => this.bell(f * m, 0.35, 0.05, i * 0.05, 0.35, 2));
      this.noise(0.45, 0.025, 8000, 0.12, { type: 'highpass', a: 0.05, send: 0.4 });
    } else {
      this.voice({ f, d: 0.22, v: 0.07, fm: 2, fmd: 1.4, fmDec: 0.25, send: 0.18 });
      this.voice({ f: f * 2, d: 0.07, v: 0.022, delay: 0.015 });
    }
  },
  // liaan vastpakken: doffe plof in de hand, houtige tik en wat geritsel van blaadjes
  grab() {
    if (!this.gate('grab', 0.05)) return;
    this.vary(0.07, 2);
    this.voice({ f: 150, f2: 90, d: 0.1, v: 0.17, fm: 1.5, fmd: 0.7, fmDec: 0.25 });
    this.noise(0.028, 0.07, rand(2300, 3000), 0, { type: 'bandpass', q: 3 });
    this.noise(0.16, 0.028, 5200, 0.01, { type: 'highpass', a: 0.025 });
  },
  // loslaten: een luchtige zoef, hoger en harder bij meer vaart
  release(speed = 400) {
    this.vary(0.08, 2);
    const k = clamp((speed - 200) / 900, 0, 1);
    this.whoosh(0.16 + 0.1 * k, 600 + 400 * k, 1800 + 2200 * k, 0.07 + 0.07 * k, 0, 1.2, 0.3);
    this.noise(0.02, 0.035, 4200, 0, { type: 'bandpass', q: 4 });
  },
  boing()   { this.vary(0.05, 1.5); this.spring(180, 620, 0.4, 0.15); this.noise(0.08, 0.1, 350); },
  boingy()  { this.vary(0.06, 1.5); this.spring(140, 420, 0.3, 0.1); },
  tramp()   { this.vary(0.05, 1.5); this.spring(150, 560, 0.38, 0.17); this.noise(0.09, 0.12, 320); this.voice({ f: 300, f2: 900, d: 0.2, v: 0.04, delay: 0.02, type: 'triangle', lp: 3000 }); },
  // plons: klap op het water, dalend gebruis, een lage plof en bubbels
  splash(x) {
    this.vary(0.1, 2); this.at(x);
    this.noise(0.12, 0.22, 2200, 0, { f2: 700 });
    this.noise(0.75, 0.2, 1500, 0.02, { pink: true, f2: 220, a: 0.015, send: 0.2 });
    this.voice({ f: 120, f2: 55, d: 0.3, v: 0.1 });
    this.bubbles(6, 0.1, 0.45, 0.04);
  },
  // gestolen appel: een cartooneske "wah-wah"
  steal() {
    this.vary(0.04, 1.5);
    this.voice({ f: 520, f2: 300, d: 0.18, v: 0.07, type: 'sawtooth', lp: 2000, lp2: 500, send: 0.12 });
    this.voice({ f: 390, f2: 190, d: 0.28, v: 0.065, delay: 0.13, type: 'sawtooth', lp: 1600, lp2: 350, wob: [7, 40], send: 0.12 });
  },
  // schild: metalen "ting" van een afketsende aanval
  shield() {
    this.vary(0.05, 1.5);
    this.bell(950, 0.5, 0.08, 0, 0.4, 1.41);
    this.noise(0.08, 0.08, 4000, 0, { type: 'highpass' });
    this.voice({ f: 520, f2: 260, d: 0.16, v: 0.06, type: 'triangle', lp: 2500 });
  },
  // brekende tak: een paar knappende splinters en een doffe klap
  crack() {
    this.vary(0.08, 1.5);
    this.noise(0.02, 0.22, 3000, 0, { type: 'bandpass', q: 2 });
    this.noise(0.025, 0.18, 2200, 0.035, { type: 'bandpass', q: 2 });
    this.noise(0.02, 0.12, 2700, 0.06, { type: 'bandpass', q: 2 });
    this.noise(0.28, 0.12, 1500, 0.05, { f2: 280, send: 0.15 });
    this.voice({ f: 110, f2: 50, d: 0.22, v: 0.09, type: 'triangle' });
  },
  balloon() { this.vary(0.05, 1.5); this.voice({ f: 300, f2: 900, d: 0.45, v: 0.1, type: 'triangle', lp: 2200, wob: [18, 40], send: 0.15 }); this.noise(0.05, 0.05, 2500, 0, { type: 'bandpass' }); },
  // turbo-liaan loslaten: een straalmotor-zoef met een glinsterend loopje
  turbo() {
    this.vary(0.03, 1);
    this.whoosh(0.7, 400, 3800, 0.18, 0, 0.8, 0.2);
    this.voice({ f: 110, f2: 55, d: 0.6, v: 0.08, type: 'sawtooth', lp: 900, lp2: 250 });
    this.voice({ f: 220, f2: 1100, d: 0.4, v: 0.04, type: 'sawtooth', lp: 1200, lp2: 4000 });
    this.noise(0.3, 0.07, 7000, 0.05, { type: 'highpass' });
    this.arp(660, [0, 4, 7, 12, 16], 0.04, 0.045, 0.14, 0, 0.3);
  },
  // turbo-liaan vastpakken: een oplaadgeluid (zaagtand waarvan het filter opengaat)
  turboCharge() {
    this.vary(0.03, 1);
    this.voice({ f: 130, f2: 520, d: 0.5, v: 0.05, type: 'sawtooth', lp: 400, lp2: 4500, a: 0.05 });
    this.voice({ f: 130, f2: 520, d: 0.5, v: 0.04, type: 'sawtooth', lp: 400, lp2: 4500, a: 0.05, det: 14 });
    this.noise(0.4, 0.04, 5000, 0.05, { type: 'highpass', a: 0.2 });
    this.arp(880, [0, 7, 12], 0.07, 0.045, 0.14, 0.12, 0.3);
  },
  // raket: gerommel met knetters en een aanzwellende motortoon
  rocket() {
    this.vary(0.05, 1);
    this.noise(1.2, 0.24, 450, 0, { pink: true, f2: 1100, a: 0.08, send: 0.15 });
    this.voice({ f: 60, f2: 180, d: 1.0, v: 0.07, type: 'sawtooth', lp: 500, lp2: 1200, a: 0.1 });
    for (let i = 0; i < 6; i++) this.noise(0.02, 0.08, rand(1500, 4000), 0.05 + Math.random() * 0.8, { type: 'bandpass', q: 2 });
  },
  // gekocht: muntjes-rinkel (twee metalen tikjes) en een opgewekt loopje
  buy()       { this.vary(0.01, 1); this.bell(2600, 0.12, 0.035, 0, 0.2, 1.41); this.bell(3100, 0.14, 0.03, 0.05, 0.2, 1.41); this.arp(523, [0, 4, 7, 12], 0.07, 0.07, 0.18, 0.05, 0.25); },
  combo()     { this.vary(0.01, 1); this.arp(784, [0, 4, 7, 12], 0.05, 0.06, 0.2, 0, 0.3); },
  milestone() { this.vary(0.01, 1); this.arp(523, [0, 7, 12], 0.08, 0.08, 0.3, 0, 0.35); this.noise(0.4, 0.03, 7000, 0.2, { type: 'highpass', a: 0.1, send: 0.4 }); },
  bigjump()   { this.vary(0.02, 1); [659, 880, 1318].forEach((f, i) => this.voice({ f, d: 0.14, v: 0.05, delay: i * 0.06, type: 'triangle', lp: 3500, send: 0.2 })); },
  // portaal: een opstijgende zoef met een zwevende toon en glinstering
  portal() {
    this.vary(0.03, 1);
    this.whoosh(0.6, 200, 2600, 0.12, 0, 1, 0.5, 0.3);
    this.voice({ f: 260, f2: 1400, d: 0.45, v: 0.1, wob: [9, 60], send: 0.4 });
    this.arp(1320, [0, 7, 12], 0.06, 0.03, 0.3, 0.2, 0.5);
  },
  // Vrolijk riedeltje bij een overwinning; elke biome klinkt een toon hoger, de donkere biomes in mineur
  jingle(bi) {
    if (!this.ok()) return;
    this.vary(0, 0);
    const root = 392 * Math.pow(2, ((bi % 7) * 2) / 12), minor = !!(BIOMES[bi] && BIOMES[bi].minor);
    const n = semi => root * Math.pow(2, semi / 12);
    const third = minor ? 3 : 4, b = 0.14;
    const melody = [[0, 1], [third, 1], [7, 1], [12, 2], [7, 1], [12, 1], [14, 1], [12 + third, 3]];
    let t = 0;
    for (const [semi, len] of melody) {
      this.voice({ f: n(semi), d: b * len + 0.08, v: 0.11, delay: t, type: 'triangle', lp: 4000, send: 0.25 });
      this.bell(n(semi + 12), b * len * 0.8, 0.03, t, 0.25, 2);
      t += b * len;
    }
    [[-12, 0, 4], [-5, 4, 4], [-12, 8, 3]].forEach(([semi, at, len]) => this.voice({ f: n(semi), d: b * len, v: 0.08, delay: at * b, type: 'triangle', lp: 900 }));
    for (let i = 0; i < 11; i += 2) this.noise(0.05, i % 4 ? 0.04 : 0.09, i % 4 ? 6000 : 1200, i * b, { type: i % 4 ? 'highpass' : 'lowpass' });
    this.bell(n(24 + third), 0.6, 0.04, t - b, 0.5);
  },
  // duiken: korte, dalende zoef
  dive() { this.vary(0.06, 1.5); this.whoosh(0.28, 1600, 450, 0.08, 0.02, 1.2, 0.2); this.voice({ f: 700, f2: 220, d: 0.22, v: 0.04, type: 'triangle', lp: 1500 }); },
  // =====================================================================
  //  Andy's stem: formantsynthese
  //  Een stembron (een glottispuls met natuurlijk aflopende boventonen, plus een suboctaaf voor een
  //  brommerige borststem) gaat door vijf parallelle klinkerfilters (formanten), zoals in een echte keel.
  //  Adem, jitter (toonhoogte-onrust), shimmer (volume-onrust), vibrato en een ruw randje (drive) maken
  //  het levendig. Een roep is een reeks lettergrepen:
  //    { t: start, d: duur, f: [toon-van, toon-naar], p: piek halverwege, vo: klinker(s) 'a e i o u w',
  //      v: luidheid, h: adem bij de aanzet (h-klank), yod: [snelheid, halve tonen] = jodelen }
  //  Speler 2 en Kiwi hebben een iets hogere stem (voiceK/formK, zie player()).
  // =====================================================================
  voiceK: 1, formK: 1, voiceEnd: [0, 0], lastCall: -1,
  VOWELS: {
    a: [[730, 1090, 2440, 3400, 4200], [0, -5, -14, -20, -26]],
    e: [[530, 1840, 2480, 3400, 4200], [0, -9, -12, -20, -26]],
    i: [[300, 2250, 3000, 3500, 4200], [0, -12, -10, -18, -26]],
    o: [[570, 840, 2410, 3400, 4200], [0, -3, -18, -24, -30]],
    u: [[320, 800, 2240, 3400, 4200], [0, -8, -22, -28, -34]],
    w: [[280, 600, 2200, 3300, 4200], [0, -10, -24, -30, -36]],
  },
  // speler i (0/1) bepaalt stereo en stem; -1 = weer neutraal
  player(i) {
    this.pan = i < 0 ? 0 : i ? 0.6 : -0.6;
    this.voiceK = i === 1 ? 1.16 : 1; this.formK = i === 1 ? 1.07 : 1;
  },
  driveCurve(k) {
    const n = 1024, c = new Float32Array(n), a = 1 + k * 5, norm = Math.tanh(a);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * a) / norm; }
    return c;
  },
  say(syls, o = {}) {
    if (!this.ok()) return;
    const ac = this.ac, now = ac.currentTime;
    const who = this.voiceK === 1 ? 0 : 1;
    if (now < this.voiceEnd[who] - 0.05 && !o.force) return; // één stem tegelijk per speler: Andy heeft maar één mond
    if (!this.glottal) {
      const n = 40, re = new Float32Array(n), im = new Float32Array(n);
      for (let h = 1; h < n; h++) im[h] = Math.pow(h, -1.25) * (h % 2 ? 1 : 0.8);
      this.glottal = ac.createPeriodicWave(re, im);
    }
    const t0 = now + 0.01, k = (o.k || 1) * this.voiceK * this.pv, fk = (o.fk || 1) * this.formK;
    const dur = Math.max(...syls.map(s => s.t + s.d)), end = t0 + dur + 0.06;
    this.voiceEnd[who] = end;
    // uitgang: borstresonantie -> ruw randje -> volume -> panner/galm
    const out = ac.createGain(); out.gain.value = (o.v ?? 0.16) * this.gv;
    const chest = ac.createBiquadFilter(); chest.type = 'peaking'; chest.frequency.value = 200 * fk; chest.Q.value = 0.9; chest.gain.value = 5;
    const sum = ac.createGain(); sum.gain.value = 1.8;
    sum.connect(chest);
    if (o.drive) { const ws = ac.createWaveShaper(); ws.curve = this.driveCurve(o.drive); ws.oversample = '2x'; chest.connect(ws).connect(out); }
    else chest.connect(out);
    this.route(out, o.send ?? 0.22);
    // vijf formanten
    const F = [0, 1, 2, 3, 4].map(i => {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
      const g = ac.createGain();
      bp.connect(g).connect(sum);
      return { bp, g, bw: [90, 110, 170, 220, 280][i] };
    });
    const src = ac.createGain(); src.gain.value = 1;
    for (const f of F) src.connect(f.bp);
    // stembron + suboctaaf (growl)
    const osc = ac.createOscillator(); osc.setPeriodicWave(this.glottal);
    const sub = ac.createOscillator(); sub.type = 'triangle';
    const subG = ac.createGain(); subG.gain.value = o.growl || 0;
    const voice = ac.createGain(); voice.gain.value = 0;
    const shim = ac.createGain(); shim.gain.value = 1;
    osc.connect(voice); sub.connect(subG).connect(voice); voice.connect(shim).connect(src);
    const nodes = [osc, sub];
    // jitter en shimmer: langzame ruis op de toonhoogte en het volume
    const mkNoise = (lp, amt, dest) => {
      const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const l = ac.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
      const g = ac.createGain(); g.gain.value = amt;
      s.connect(l).connect(g); for (const d of dest) g.connect(d); nodes.push(s); s.start(t0, Math.random() * 0.8);
    };
    mkNoise(16, o.jit ?? 900, [osc.detune, sub.detune]);
    mkNoise(40, (o.rough ?? 0.25) * 2, [shim.gain]);
    // vibrato dat aanzwelt in lange klanken
    const vib = ac.createOscillator(); vib.frequency.value = 5.5 + Math.random() * 1.5;
    const vg = ac.createGain(); vg.gain.setValueAtTime(0, t0); vg.gain.linearRampToValueAtTime(o.vib ?? 30, t0 + dur);
    vib.connect(vg); vg.connect(osc.detune); vg.connect(sub.detune); nodes.push(vib);
    // adem (aspiratie) door dezelfde formanten, plus een klein beetje ongefilterd gesis
    const nz = ac.createBufferSource(); nz.buffer = this.pinkBuf; nz.loop = true;
    const breath = ac.createGain(); breath.gain.value = 0; nz.connect(breath).connect(src); nodes.push(nz);
    const hiss = ac.createBiquadFilter(); hiss.type = 'highpass'; hiss.frequency.value = 2500;
    const hissG = ac.createGain(); hissG.gain.value = 0.25; breath.connect(hiss).connect(hissG).connect(out);
    // toonhoogte zetten op de hoofdtoon en het suboctaaf tegelijk
    const fp = [[osc.frequency, 1], [sub.frequency, 0.5]];
    const fSet = (v, t) => { for (const [p, m] of fp) p.setValueAtTime(v * m, t); };
    const fLin = (v, t) => { for (const [p, m] of fp) p.linearRampToValueAtTime(v * m, t); };
    const fExp = (v, t) => { for (const [p, m] of fp) p.exponentialRampToValueAtTime(v * m, t); };
    // klinker op tijdstip t: formantfrequenties en -sterktes; F1 schuift mee omhoog met een hoge toon
    const vowel = (name, f0, t, ramp) => {
      const [fr, db] = this.VOWELS[name] || this.VOWELS.a;
      F.forEach((f, i) => {
        const hz = i === 0 ? Math.max(fr[0] * fk, f0 * 1.1) : fr[i] * fk, g = Math.pow(10, db[i] / 20);
        if (ramp) { f.bp.frequency.linearRampToValueAtTime(hz, t); f.g.gain.linearRampToValueAtTime(g, t); f.bp.Q.linearRampToValueAtTime(hz / f.bw, t); }
        else { f.bp.frequency.setValueAtTime(hz, t); f.g.gain.setValueAtTime(g, t); f.bp.Q.setValueAtTime(hz / f.bw, t); }
      });
    };
    fSet(syls[0].f[0] * k, t0);
    for (const s of syls) {
      const a = t0 + s.t, e = a + s.d, amp = s.v ?? 1, h = s.h || 0, von = a + (h ? 0.035 : 0);
      const v0 = Array.isArray(s.vo) ? s.vo[0] : s.vo || 'a', v1 = Array.isArray(s.vo) ? s.vo[1] : v0;
      const f0 = s.f[0] * k, f1 = s.f[1] * k;
      // toonhoogte: een klein aanloopje van onderen, dan (via een piek) naar de eindtoon
      fSet(f0 * 0.9, von); fLin(f0, von + 0.035);
      if (s.yod) { // jodelen: snel wisselen tussen borst- en kopstem
        const [rate, semi] = s.yod, step = 1 / rate, up = Math.pow(2, semi / 12);
        let x = von + 0.035, j = 0;
        while (x + step < e) {
          const base = f0 + (f1 - f0) * ((x - a) / s.d), tgt = j++ % 2 ? base : base * up;
          fLin(tgt, x + 0.03); fSet(tgt, x + step - 0.001); x += step;
        }
        fLin(f1, e);
      } else if (s.p) { fLin(s.p * k, a + s.d * 0.3); fExp(f1, e); }
      else fExp(f1, e);
      // klinkers: van v0 naar v1
      vowel(v0, f0, a, false); vowel(v1, s.p ? s.p * k : f1, a + s.d * 0.6, true);
      // volume-envelop (met een h-klank ervoor als er adem is)
      const rel = Math.min(0.1, s.d * 0.4);
      voice.gain.setValueAtTime(0.0001, a); voice.gain.setValueAtTime(0.0001, von);
      voice.gain.linearRampToValueAtTime(amp, von + 0.03);
      voice.gain.setValueAtTime(amp * 0.9, e - rel); voice.gain.linearRampToValueAtTime(0.0001, e);
      breath.gain.setValueAtTime(0.0001, a);
      breath.gain.linearRampToValueAtTime(amp * (0.12 + h * 0.8), a + 0.015);
      breath.gain.linearRampToValueAtTime(amp * (0.06 + h * 0.08), von + 0.06);
      breath.gain.linearRampToValueAtTime(0.0001, e);
    }
    for (const nd of [osc, sub, vib]) nd.start(t0);
    nz.start(t0, Math.random());
    for (const nd of nodes) nd.stop(end);
  },
  // WOOHOO! bij een flinke zwaai: vijf soorten roepen, nooit twee keer dezelfde achter elkaar.
  // Hoe harder Andy gaat, hoe uitbundiger de roep (en heel af en toe de Tarzan-kreet).
  CALLS: {
    // "Hoe-hoe-WOE-HOEEE!"
    hoehoe: [[
      { t: 0.00, d: 0.10, f: [330, 400], vo: 'u', v: 0.45, h: 0.4 },
      { t: 0.13, d: 0.10, f: [390, 470], vo: 'u', v: 0.55, h: 0.4 },
      { t: 0.27, d: 0.17, f: [400, 590], vo: ['w', 'o'], v: 0.75 },
      { t: 0.47, d: 0.55, f: [680, 420], p: 730, vo: ['u', 'o'], v: 1.0, h: 0.3 },
    ], { growl: 0.15 }],
    // "Wie-HOEEE!"
    wiehoe: [[
      { t: 0.00, d: 0.16, f: [380, 520], vo: ['w', 'i'], v: 0.7 },
      { t: 0.20, d: 0.62, f: [540, 380], p: 740, vo: ['u', 'o'], v: 1.0, h: 0.6 },
    ], {}],
    // "Jie-HAA!"
    jiehaa: [[
      { t: 0.00, d: 0.26, f: [330, 560], vo: ['i', 'e'], v: 0.8 },
      { t: 0.30, d: 0.58, f: [600, 330], p: 690, vo: 'a', v: 1.0, h: 0.5 },
    ], { drive: 0.25, growl: 0.1 }],
    // "Wa-HOE!"
    wahoe: [[
      { t: 0.00, d: 0.22, f: [290, 420], vo: ['w', 'a'], v: 0.8 },
      { t: 0.25, d: 0.5, f: [560, 600], p: 780, vo: 'u', v: 1.0, h: 0.55 },
    ], {}],
    // chimpansee-roep: steeds snellere hoe-hoe's die overgaan in gillen
    pant: [[
      { t: 0.00, d: 0.09, f: [260, 300], vo: 'u', v: 0.35, h: 0.9 },
      { t: 0.14, d: 0.09, f: [300, 360], vo: 'o', v: 0.45, h: 0.8 },
      { t: 0.26, d: 0.08, f: [340, 420], vo: 'u', v: 0.5, h: 0.8 },
      { t: 0.36, d: 0.08, f: [400, 480], vo: 'o', v: 0.6, h: 0.7 },
      { t: 0.45, d: 0.07, f: [460, 560], vo: 'u', v: 0.7, h: 0.6 },
      { t: 0.55, d: 0.24, f: [700, 820], vo: 'a', v: 1.0 },
      { t: 0.83, d: 0.36, f: [800, 560], p: 860, vo: ['a', 'e'], v: 1.0 },
    ], { drive: 0.55, rough: 0.4, growl: 0.1 }],
    // Tarzan: "AaaAA-aaAA-aaAAaa!" (jodelend tussen borst- en kopstem)
    tarzan: [[
      { t: 0.00, d: 0.22, f: [250, 290], vo: 'a', v: 0.8, h: 0.5 },
      { t: 0.25, d: 1.05, f: [290, 270], vo: ['a', 'o'], v: 1.0, yod: [6.5, 9] },
      { t: 1.36, d: 0.5, f: [380, 240], vo: ['a', 'o'], v: 0.85 },
    ], { drive: 0.3, growl: 0.35, v: 0.13, vib: 45 }],
  },
  call(name, extra = {}) {
    const [syls, o] = this.CALLS[name];
    this.vary(0.05, 1);
    this.say(syls, { ...o, ...extra });
  },
  woohoo(speed = 500) {
    const pool = speed > 1000 ? ['hoehoe', 'wiehoe', 'jiehaa', 'wahoe', 'pant'] : ['wiehoe', 'wahoe', 'hoehoe'];
    if (speed > 1100 && Math.random() < 0.1) { this.call('tarzan'); return; }
    let n;
    do n = pool[(Math.random() * pool.length) | 0]; while (n === this.lastCall && pool.length > 1);
    this.lastCall = n;
    // een stuk lager en voller dan de roep zelf (k 0,72 ≈ 6 halve tonen omlaag): hoog klonk schel
    const o = this.CALLS[n][1];
    this.call(n, { k: 0.72, fk: 0.95, growl: (o.growl || 0) + 0.25, v: 0.055 + 0.02 * clamp((speed - 750) / 700, 0, 1), send: 0.15 });
  },
  tarzan() { this.call('tarzan', { force: true }); },
  // de jumpscare (10× op de appel in het hoofdmenu): een schelle gil, een klap en een diep gebrul tegelijk
  scare() {
    if (!this.ok()) return;
    this.pv = 1; this.gv = 1; this.pp = 0;
    this.noise(0.5, 0.5, 3200, 0, { type: 'bandpass', q: 0.7, f2: 900, a: 0.002 });
    this.noise(0.9, 0.45, 180, 0, { pink: true, f2: 60, a: 0.002 });
    for (const [f, det] of [[880, 0], [932, 30], [1244, -20], [620, 12]]) this.voice({ f, f2: f * 0.55, glide: 1.1, d: 1.2, v: 0.09, type: 'sawtooth', det, a: 0.004, wob: [23, 90], lp: 5000, lp2: 1600 });
    this.voice({ f: 70, f2: 38, d: 1.3, v: 0.35, type: 'sawtooth', a: 0.01, lp: 400, wob: [9, 60] });
  },
  // korte reacties van Andy
  hup()   { this.vary(0.06, 1); this.say([{ t: 0, d: 0.13, f: [210, 150], vo: 'u', v: 0.8, h: 0.8 }], { growl: 0.4, v: 0.11, vib: 0 }); },
  hey()   { this.vary(0.05, 1); this.say([{ t: 0, d: 0.3, f: [290, 450], vo: 'e', v: 1, h: 0.9 }], { v: 0.14, drive: 0.2 }); },
  whoa()  { this.vary(0.05, 1); this.say([{ t: 0, d: 0.55, f: [400, 290], p: 540, vo: ['w', 'a'], v: 1 }], { v: 0.14, growl: 0.15 }); },
  phew()  { this.vary(0.05, 1); this.say([{ t: 0, d: 0.5, f: [330, 210], vo: ['e', 'u'], v: 0.7, h: 1 }], { v: 0.12, vib: 0, jit: 500 }); },
  // in het water gevallen: een geschrokken "oewaa!" (de plons klinkt er doorheen)
  fall()  { this.vary(0.05, 1); this.say([{ t: 0, d: 0.12, f: [420, 520], vo: 'u', v: 0.8 }, { t: 0.13, d: 0.45, f: [600, 260], vo: ['a', 'o'], v: 1 }], { v: 0.15, drive: 0.35, force: true }); },
  // verdronken: gorgelende "blub… blub…" met bubbels
  blub()  {
    this.vary(0.05, 1);
    this.say([{ t: 0, d: 0.16, f: [240, 200], vo: ['o', 'u'], v: 0.8 }, { t: 0.4, d: 0.2, f: [220, 170], vo: ['o', 'u'], v: 0.7 }], { v: 0.13, rough: 0.9, jit: 1500, force: true });
    this.bubbles(8, 0.05, 0.7, 0.05);
  },
  // opgewonden chimpansee-roepje (combo, mijlpaal)
  cheer() { this.vary(0.05, 1); this.say([{ t: 0, d: 0.08, f: [360, 420], vo: 'u', v: 0.5, h: 0.7 }, { t: 0.12, d: 0.08, f: [420, 500], vo: 'u', v: 0.6, h: 0.6 }, { t: 0.24, d: 0.3, f: [640, 520], p: 720, vo: 'a', v: 1 }], { v: 0.12, drive: 0.35 }); },
  // afzet van de startrots: een veerkrachtige sprong met wat gruis
  jump() { this.vary(0.05, 1.5); this.voice({ f: 200, f2: 430, d: 0.16, v: 0.12, a: 0.01, glide: 0.1 }); this.noise(0.1, 0.06, 1600, 0, { type: 'bandpass' }); this.noise(0.09, 0.05, 800, 0.01, { pink: true }); },
  // straaljager: een aanzwellend, laag gebrul (zaagtand waarvan het filter opengaat) met een fluitende zoef
  jet() {
    this.vary(0.04, 1);
    this.whoosh(1.6, 200, 2400, 0.2, 0, 0.8, 0.55, 0.2);
    this.voice({ f: 90, f2: 160, d: 1.6, v: 0.06, type: 'sawtooth', lp: 400, lp2: 1400, a: 0.3 });
    this.voice({ f: 90, f2: 160, d: 1.6, v: 0.04, type: 'sawtooth', lp: 400, lp2: 1400, a: 0.3, det: 15 });
    this.voice({ f: 1800, f2: 900, d: 1.2, v: 0.025, delay: 0.2, a: 0.2, send: 0.2 });
    this.noise(1.4, 0.14, 900, 0.1, { pink: true, f2: 400, a: 0.3 });
  },
  // kist opgepakt: een glinsterend loopje
  lootPick() { this.vary(0.01, 1); this.arp(700, [0, 4, 7, 12, 16], 0.045, 0.06, 0.16, 0, 0.35); this.noise(0.3, 0.03, 7500, 0.05, { type: 'highpass', a: 0.08, send: 0.4 }); },
  // onder water: een diepe plons met bubbels; boven komen: een opstijgende zoef
  underIn() { this.vary(0.05, 1); this.whoosh(0.9, 1200, 160, 0.2, 0, 0.8, 0.1); this.voice({ f: 140, f2: 50, d: 0.8, v: 0.12 }); this.bubbles(9, 0.15, 0.7, 0.05); },
  underOut() { this.vary(0.05, 1); this.whoosh(0.7, 300, 3000, 0.2, 0, 0.9, 0.5); this.noise(0.25, 0.12, 2400, 0, { f2: 900 }); this.arp(520, [0, 4, 7, 12], 0.06, 0.06, 0.16, 0.2, 0.3); },
  // bijna geen lucht meer: een dringend piepje (twee bij de laatste seconden)
  airBeep(n) {
    this.vary(0, 0);
    const f = n <= 2 ? 1320 : 990;
    this.voice({ f, d: 0.1, v: 0.07, type: 'triangle', fm: 1, fmd: 0.5 });
    if (n <= 2) this.voice({ f, d: 0.1, v: 0.06, delay: 0.14, type: 'triangle', fm: 1, fmd: 0.5 });
  },
  // kist openen: tik per voorbijschietende kaart, en een onthulling per zeldzaamheid
  crateTick() { if (!this.gate('crate', 0.02)) return; this.vary(0.06, 1.5); this.tick(3600, 0.11); },
  crateReveal(r) {
    this.vary(0, 0);
    const n = { common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 7 }[r] || 2;
    this.arp(523, [0, 4, 7, 12, 16, 19, 24].slice(0, n), 0.07, 0.08, 0.25, 0, 0.3);
    if (r === 'epic' || r === 'legendary') { this.whoosh(1.2, 300, 5000, 0.12, 0, 1, 0.6, 0.3); this.voice({ f: 130, d: 1.2, v: 0.05, delay: 0.1, type: 'sawtooth', lp: 600, lp2: 2000, a: 0.2 }); }
    if (r === 'legendary') this.arp(1046, [0, 4, 7, 12], 0.12, 0.06, 0.7, 0.6, 0.5);
  },
  // Zwaaigeluid: een luchtige zoef als Andy door het laagste punt van zijn zwaai gaat; harder en hoger bij meer vaart
  swing(speed, fwd) {
    const k = clamp((speed - 350) / 1100, 0, 1);
    if (k <= 0 || !this.gate('swing', 0.12)) return;
    this.vary(0.06, 1.5);
    const f = 380 + 900 * k;
    this.whoosh(0.2 + 0.14 * k, f * 0.55, f * (fwd ? 1.9 : 1.3), 0.05 + 0.12 * k, 0, 1.1, 0.45);
    this.voice({ f: 95 + 70 * k, f2: 60 + 40 * k, d: 0.16 + 0.1 * k, v: 0.02 + 0.035 * k, a: 0.04 }); // het touw zoemt zacht mee
    if (k > 0.75) this.whoosh(0.12, 2600, 5200, 0.03, 0.05, 2.5, 0.3);                  // fluittoontje bij topsnelheid
  },
  // Een nieuwe biome: een opstijgende zoef, een glinsterend akkoord in de toonsoort van de biome,
  // een eigen "handtekening" per stijl en tot slot een kort fanfaretje
  biome(bi) {
    if (!this.ok()) return;
    this.vary(0, 0);
    const B = BIOMES[bi] || BIOMES[0], root = 330 * Math.pow(2, (B.key % 12) / 12), third = B.minor ? 3 : 4;
    const n = semi => root * Math.pow(2, semi / 12);
    this.whoosh(0.9, 180, 3200, 0.16, 0, 0.9, 0.7, 0.3);
    [0, third, 7, 12, 12 + third, 19].forEach((s, i) => this.bell(n(s), 0.6, 0.045, 0.35 + i * 0.045, 0.4, 2));
    const st = B.particle === 'firefly' && B.style === 'jungle' ? 'portal' : B.style, at = 0.7; // Portaalwoud heeft de jungle-stijl maar een eigen geluid
    if (st === 'jungle') { for (let i = 0; i < 4; i++) this.tone(2300 + i * 180, 0.09, 'sine', 0.04, 3400, at + i * 0.11); [0, 0.12, 0.3].forEach((d, i) => this.tone(i === 2 ? 170 : 240, 0.14, 'sine', 0.14, 110, at + d)); }
    else if (st === 'swamp') { [0, 0.22].forEach(d => { this.voice({ f: 95, f2: 70, d: 0.18, v: 0.07, delay: at + d, type: 'square', lp: 700 }); this.voice({ f: 140, f2: 90, d: 0.12, v: 0.05, delay: at + d + 0.05, type: 'square', lp: 900 }); }); }
    else if (st === 'savanne') { [7, 12, 9, 7].forEach((s, i) => this.voice({ f: n(s + 12), f2: n(s + 12) * 0.985, d: 0.22, v: 0.07, delay: at + i * 0.16, type: 'triangle', lp: 3000, send: 0.3 })); this.noise(0.5, 0.04, 900, at, { pink: true }); }
    else if (st === 'ice') { [24, 28, 31, 36].forEach((s, i) => this.bell(n(s), 1.0, 0.045, at + i * 0.09, 0.6, 3.5)); }
    else if (st === 'volcano') { this.voice({ f: 70, f2: 38, d: 1.1, v: 0.08, delay: at - 0.2, type: 'sawtooth', lp: 400 }); this.noise(1.2, 0.22, 220, at - 0.2, { pink: true }); }
    else if (st === 'night') { [12, 19, 24, 31, 28].forEach((s, i) => this.bell(n(s), 0.8, 0.04, at + i * 0.13, 0.6, 2)); }
    else if (st === 'blocky') { [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => this.voice({ f: n(s + 12), d: 0.08, v: 0.045, delay: at + i * 0.065, type: 'square', a: 0.002 })); } // bewust 8-bit
    else if (st === 'paint') { for (let i = 0; i < 5; i++) this.whoosh(0.09, 1400 + i * 300, 3800 - i * 200, 0.07, at + i * 0.1, 6, 0.2); this.voice({ f: 600, f2: 1500, d: 0.1, v: 0.1, delay: at + 0.55 }); }
    else if (st === 'poly3d') { [0, third, 7, 11].forEach(s => { this.voice({ f: n(s), d: 0.9, v: 0.025, delay: at, type: 'sawtooth', lp: 2500, lp2: 700, send: 0.3 }); this.voice({ f: n(s), d: 0.9, v: 0.025, delay: at, type: 'sawtooth', lp: 2500, lp2: 700, det: 14, send: 0.3 }); }); [0.3, 0.6].forEach((d, i) => this.bell(n(19), 0.3, 0.04 / (i + 1), at + d, 0.5)); }
    else if (st === 'desert') { [0, 1, 4, 5, 7, 8, 7, 4].forEach((s, i) => this.voice({ f: n(s + 12), d: 0.12, v: 0.05, delay: at + i * 0.08, type: 'triangle', lp: 2600, wob: [6, 18], send: 0.3 })); this.noise(0.6, 0.05, 700, at, { pink: true }); } // slangenbezweerder
    else if (st === 'shroom') { [0, 0.14, 0.28].forEach((d, i) => this.spring(200 + i * 90, 700 + i * 200, 0.22, 0.09, at + d)); [24, 31].forEach((s, i) => this.bell(n(s), 0.6, 0.04, at + 0.5 + i * 0.12, 0.5, 2.5)); }
    else if (st === 'cloud') { [12, 16, 19, 24, 28, 31].forEach((s, i) => this.voice({ f: n(s), d: 0.7, v: 0.035, delay: at + i * 0.07, type: 'triangle', lp: 5000, send: 0.6 })); this.whoosh(0.8, 300, 900, 0.06, at, 0.8, 0.5, 0.5); } // harp en een zuchtje wind
    else if (st === 'neon') { [0, 7, 12, 19, 12, 7, 0, 7].forEach((s, i) => this.voice({ f: n(s + 12), d: 0.09, v: 0.04, delay: at + i * 0.07, type: 'sawtooth', lp: 3200, det: 10, send: 0.35 })); this.voice({ f: n(-12), d: 0.6, v: 0.06, delay: at, type: 'square', lp: 500 }); } // synthwave
    else if (st === 'candy') { [24, 31, 28, 36].forEach((s, i) => this.bell(n(s), 0.25, 0.07, at + i * 0.08, 0.3, 2)); [0.4, 0.55].forEach(d => this.spring(400, 900, 0.1, 0.1, at + d)); }
    else { this.voice({ f: 260, f2: 1400, d: 0.5, v: 0.1, delay: at, wob: [9, 60], send: 0.4 }); this.voice({ f: 520, f2: 2100, d: 0.4, v: 0.05, delay: at + 0.05, type: 'triangle', send: 0.4 }); } // portaalwoud
    // fanfare
    [[0, 0.12], [7, 0.12], [12, 0.34]].forEach(([s, len], i) => { this.voice({ f: n(s), d: len + 0.1, v: 0.13, delay: 1.35 + i * 0.13, type: 'triangle', lp: 4000, send: 0.25 }); this.bell(n(s + 12), len, 0.025, 1.35 + i * 0.13, 0.25, 2); });
  },
  // trick: een loopje dat per trick in de reeks hoger wordt
  trick(chain) { this.vary(0.01, 1); const b = 660 * Math.pow(2, Math.min(chain - 1, 6) * 2 / 12); [0, 4, 7, 12].forEach((s, i) => this.voice({ f: b * Math.pow(2, s / 12), d: 0.12, v: 0.045, delay: i * 0.045, type: 'triangle', fm: 2, fmd: 0.4, send: 0.2 })); },
  slide() { if (!this.gate('slide', 0.08)) return; this.vary(0.06, 1.5); this.voice({ f: 900, f2: 500, d: 0.12, v: 0.045 }); this.noise(0.12, 0.04, 4000, 0, { type: 'highpass', a: 0.02 }); },
  // multiplayer: aftellen (3, 2, 1, GO!), verliezen en onweer
  countdown(c) {
    this.vary(0, 0);
    if (c > 0) this.voice({ f: 520, d: 0.18, v: 0.08, type: 'triangle', fm: 2, fmd: 0.5, send: 0.2 });
    else { this.bell(1040, 0.45, 0.07, 0, 0.3, 2); this.bell(1560, 0.4, 0.04, 0.02, 0.3, 2); }
  },
  lose(delay = 0) { this.vary(0, 0); [392, 330, 262].forEach((f, i) => this.voice({ f, d: i === 2 ? 0.55 : 0.26, v: 0.1, delay: delay + i * 0.22, type: 'triangle', lp: 1800, send: 0.3 })); },
  storm() { this.vary(0.1, 2); this.noise(0.04, 0.12, 2200, 0, { type: 'bandpass', q: 1.5 }); this.noise(0.9, 0.2, 320, 0.02, { pink: true, f2: 110, a: 0.03, send: 0.3 }); },
  // menu: een zachte houtige tik (en een iets lagere voor terug)
  click() { if (!this.gate('click', 0.03)) return; this.vary(0.08, 1.5); this.tick(2800, 0.13); },
  back()  { if (!this.gate('click', 0.03)) return; this.vary(0.08, 1.5); this.tick(2000, 0.13); this.voice({ f: 700, f2: 480, d: 0.06, v: 0.035 }); },
  // einde van een run: een zacht dalend loopje, of een fanfaretje bij een nieuw record
  gameOver() { this.vary(0, 0); [[440, 0], [370, 0.16], [294, 0.32]].forEach(([f, d], i) => this.voice({ f, d: i === 2 ? 0.6 : 0.24, v: 0.08, delay: d, type: 'triangle', lp: 1600, send: 0.35 })); this.voice({ f: 147, d: 0.7, v: 0.06, delay: 0.32 }); },
  record() {
    this.vary(0, 0);
    [[0, 0.12], [4, 0.12], [7, 0.12], [12, 0.45]].forEach(([s, len], i) => { const f = 523 * Math.pow(2, s / 12); this.voice({ f, d: len + 0.1, v: 0.11, delay: i * 0.12, type: 'triangle', lp: 4000, send: 0.3 }); this.bell(f * 2, len + 0.1, 0.03, i * 0.12, 0.3, 2); });
    this.noise(0.6, 0.03, 7000, 0.36, { type: 'highpass', a: 0.1, send: 0.5 });
  },
};

// =====================================================================
//  Achtergrondmuziek: procedurele jungle-groove (marimba, conga's, shaker, bas)
// =====================================================================
const Music = {
  timer: null, master: null, next: 0, step: 0, phrase: null, key: 0, minor: false, biome: 0, bpm: 118,
  start() {
    const ac = Sfx.ac;
    if (!ac || !save.music || this.timer) return;
    this.master = ac.createGain();
    this.master.gain.setValueAtTime(0, ac.currentTime);
    this.master.gain.linearRampToValueAtTime(this.level(), ac.currentTime + 1.5);
    this.master.connect(Sfx.musicBus); // eigen volume, en mee door het onderwaterfilter en de limiter
    this.next = ac.currentTime + 0.1; this.step = 0; this.phrase = null;
    this.timer = setInterval(() => this.tick(), 30);
  },
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = null;
    const m = this.master, ac = Sfx.ac;
    m.gain.setTargetAtTime(0, ac.currentTime, 0.15);
    setTimeout(() => m.disconnect(), 1200);
  },
  level() { return game.paused ? 0.22 : 0.5; },
  duck() { if (this.master) this.master.gain.setTargetAtTime(this.level(), Sfx.ac.currentTime, 0.2); },
  tick() {
    const ac = Sfx.ac;
    if (ac.state !== 'running') return;
    if (this.next < ac.currentTime - 0.25) this.next = ac.currentTime + 0.05; // na een hapering niet inhalen
    const sd = 60 / this.bpm / 4;
    while (this.next < ac.currentTime + 0.15) {
      this.play(this.step, this.next + (this.step % 2 ? sd * 0.14 : 0), sd); // lichte shuffle
      this.next += sd; this.step++;
    }
  },
  makePhrase() {
    const scale = this.minor ? [0, 3, 5, 7, 10, 12, 15, 17, 19] : [0, 2, 4, 7, 9, 12, 14, 16, 19];
    let idx = 4;
    const bars = [];
    for (let b = 0; b < 2; b++) {
      const bar = [];
      for (let s = 0; s < 16; s++) {
        const p = s % 4 === 0 ? 0.75 : s % 2 === 0 ? 0.45 : 0.18;
        if (Math.random() < p) {
          idx = clamp(idx + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0], 0, scale.length - 1);
          bar.push(scale[idx]);
        } else bar.push(null);
      }
      bars.push(bar);
    }
    bars[1][14] = null; bars[1][15] = null; bars[1][12] = scale[Math.random() < 0.5 ? 0 : 5]; // frase eindigt op de grondtoon
    this.phrase = bars;
  },
  play(step, t, sd) {
    const s = step % 16, bar = Math.floor(step / 16);
    if (s === 0 && bar % 4 === 0) {
      // nieuwe toonsoort per biome (op een frase-grens)
      const bi = this.biome;
      const B = BIOMES[bi] || BIOMES[0];
      this.key = B.key; this.minor = B.minor;
      if (bar % 8 === 0 || !this.phrase) this.makePhrase();
    }
    const prog = this.minor ? [0, -4, 3, -2] : [0, -3, 5, 7];
    const root = this.key + prog[bar % 4];
    const hz = semi => 261.63 * Math.pow(2, semi / 12);
    // bas
    const bass = { 0: 0, 6: 0, 8: 7, 11: 0, 14: 7 };
    if (s in bass) this.bass(hz(root - 24 + bass[s]), t, s === 0 ? 0.2 : 0.14);
    // marimba-melodie
    const note = this.phrase[bar % 2][s];
    if (note !== null) this.marimba(hz(this.key + note + (bar % 8 >= 4 && s % 8 === 0 ? 0 : 0)), t, 0.1);
    // akkoord-stoten op de tel "en"
    if (s === 4 || s === 12) {
      const third = this.minor || (bar % 4 === 1) ? 3 : 4;
      [0, third, 7].forEach(iv => this.marimba(hz(root - 12 + iv), t, 0.035));
    }
    // percussie
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.kick(t);
    if (s === 6 || s === 14) this.conga(t, 190, 0.18);
    if (s === 3 || s === 7 || s === 11 || s === 15) this.conga(t, 290, 0.12);
    if (s === 10) this.conga(t, 240, 0.15);
    if (s % 2 === 0) this.shaker(t, s % 4 === 2 ? 0.06 : 0.035);
    if ([0, 3, 6, 10, 12].includes(s) && bar % 2 === 0) this.clave(t);
    // af en toe een vogeltje
    if (s === 5 && Math.random() < 0.3) this.chirp(t + Math.random() * sd * 6);
  },
  env(t, v, dec) { const g = Sfx.ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec); g.connect(this.master); return g; },
  osc(type, f, t, dur, dest) { const o = Sfx.ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; },
  marimba(f, t, v) { this.osc('sine', f, t, 0.6, this.env(t, v, 0.55)); this.osc('sine', f * 3.93, t, 0.1, this.env(t, v * 0.28, 0.07)); },
  bass(f, t, v) { const g = this.env(t, v, 0.28); const lp = Sfx.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(g); this.osc('triangle', f, t, 0.3, lp); },
  kick(t) { const o = this.osc('sine', 120, t, 0.2, this.env(t, 0.3, 0.18)); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); },
  conga(t, f, v) { const o = this.osc('sine', f * 1.2, t, 0.25, this.env(t, v, 0.22)); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); this.noiseHit(t, v * 0.3, 2500, 0.02, 'bandpass'); },
  shaker(t, v) { this.noiseHit(t, v, 6500, 0.05, 'highpass'); },
  clave(t) { this.osc('triangle', 1900, t, 0.05, this.env(t, 0.05, 0.05)); },
  noiseHit(t, v, f, dec, type) {
    const src = Sfx.ac.createBufferSource(); src.buffer = Sfx.noiseBuf;
    const flt = Sfx.ac.createBiquadFilter(); flt.type = type; flt.frequency.value = f;
    src.connect(flt).connect(this.env(t, v, dec)); src.start(t, Math.random() * 0.5); src.stop(t + dec + 0.02);
  },
  chirp(t) {
    const o = this.osc('sine', 2400, t, 0.25, this.env(t, 0.035, 0.22));
    o.frequency.exponentialRampToValueAtTime(3600, t + 0.06); o.frequency.exponentialRampToValueAtTime(2700, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(3800, t + 0.18);
  },
};
