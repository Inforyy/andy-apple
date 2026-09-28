'use strict';
// Andy Apples · geluid en muziek
// Geluidseffecten en procedurele muziek met WebAudio (geen geluidsbestanden).

// =====================================================================
//  Geluidseffecten (WebAudio, geen bestanden nodig)
// =====================================================================
const Sfx = {
  ac: null, noiseBuf: null,
  init() {
    if (!this.ac) {
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ac = null; }
      if (this.ac) {
        const n = this.ac.sampleRate;
        this.noiseBuf = this.ac.createBuffer(1, n, n);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
    }
    if (this.ac && this.ac.state === 'suspended' && !document.hidden) this.ac.resume();
    Music.start();
  },
  tone(f, d, type = 'sine', v = 0.1, f2 = 0, delay = 0) {
    if (!save.sound || !this.ac) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + d + 0.03);
  },
  noise(d, v = 0.2, freq = 900, delay = 0) {
    if (!save.sound || !this.ac) return;
    const t = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource(); src.buffer = this.noiseBuf;
    const flt = this.ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = freq;
    const g = this.ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(flt).connect(g).connect(this.ac.destination); src.start(t, Math.random() * 0.5); src.stop(t + d + 0.02);
  },
  // appel: de toonhoogte klimt mee met de combo
  apple(gold, combo = 1) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
    const f = 740 * Math.pow(2, steps[Math.min(combo - 1, steps.length - 1)] / 12);
    if (gold) { [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(f * m, 0.12, 'square', 0.045, 0, i * 0.05)); }
    else { this.tone(f, 0.09, 'square', 0.045, f * 1.5); this.tone(f * 2, 0.06, 'sine', 0.03, 0, 0.02); }
  },
  grab()    { this.tone(180, 0.08, 'triangle', 0.16, 120); this.noise(0.05, 0.06, 2000); },
  release() { this.noise(0.18, 0.07, 1400); },
  boing()   { this.tone(200, 0.35, 'sine', 0.18, 700); },
  splash()  { this.noise(0.6, 0.3, 700); this.tone(300, 0.3, 'sine', 0.06, 80); },
  steal()   { this.tone(520, 0.12, 'square', 0.07, 260); this.tone(390, 0.18, 'square', 0.06, 180, 0.08); },
  shield()  { this.tone(520, 0.2, 'triangle', 0.14, 260); this.noise(0.1, 0.1, 3000); },
  crack()   { this.noise(0.25, 0.25, 2500); this.tone(90, 0.2, 'square', 0.06, 50); },
  balloon() { this.tone(300, 0.5, 'sine', 0.14, 900); },
  // turbo-liaan loslaten: een straalmotor-zoef
  turbo()   { this.tone(110, 0.6, 'sawtooth', 0.08, 55); this.tone(220, 0.4, 'sawtooth', 0.06, 1100); this.noise(0.6, 0.22, 2500); this.noise(0.3, 0.1, 8000, 0.05); [0, 4, 7, 12, 16].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.1, 'triangle', 0.06, 0, 0.04 * i)); },
  boingy()  { this.tone(140, 0.25, 'sine', 0.12, 420); },
  buy()     { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.1, 0, i * 0.07)); },
  rocket()  { this.noise(1.2, 0.2, 500); this.tone(90, 1.0, 'sawtooth', 0.05, 200); },
  combo()   { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.08, 0, i * 0.05)); },
  milestone() { [523, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, 0, i * 0.08)); this.noise(0.3, 0.05, 6000, 0.2); },
  bigjump() { [659, 880, 1318].forEach((f, i) => this.tone(f, 0.12, 'square', 0.04, 0, i * 0.06)); },
  // Vrolijk riedeltje bij een nieuwe biome; elke biome klinkt een toon hoger, de donkere biomes in mineur
  portal() { this.tone(260, 0.4, 'sine', 0.12, 1400); this.tone(520, 0.3, 'triangle', 0.05, 2100, 0.05); this.noise(0.3, 0.07, 2600); },
  jingle(bi) {
    if (!save.sound || !this.ac) return;
    const root = 392 * Math.pow(2, (bi * 2) / 12), minor = bi >= 4;
    const n = semi => root * Math.pow(2, semi / 12);
    const third = minor ? 3 : 4, b = 0.14;
    const melody = [[0, 1], [third, 1], [7, 1], [12, 2], [7, 1], [12, 1], [14, 1], [12 + third, 3]];
    let t = 0;
    for (const [semi, len] of melody) {
      this.tone(n(semi), b * len + 0.08, 'triangle', 0.17, 0, t);
      this.tone(n(semi + 12), b * len * 0.8, 'square', 0.025, 0, t);
      t += b * len;
    }
    [[-12, 0, 4], [-5, 4, 4], [-12, 8, 3]].forEach(([semi, at, len]) => this.tone(n(semi), b * len, 'square', 0.05, 0, at * b));
    for (let i = 0; i < 11; i += 2) this.noise(0.05, i % 4 ? 0.05 : 0.1, i % 4 ? 5000 : 1200, i * b);
    this.tone(n(24 + third), 0.5, 'sine', 0.05, 0, t - b);
  },
  // "Hoe-hoe-WOE-HOEEE!": een apenroep. Een stembron met natuurlijke boventonen, adem, toonhoogte-jitter
  // en een ruw randje gaat door klinkerfilters (formanten); de lettergrepen stijgen zoals bij een echte aap.
  // duiken: korte, dalende zoef
  dive() { this.noise(0.25, 0.08, 1800, 0.02); this.tone(700, 0.22, 'triangle', 0.05, 220); },
  woohoo() {
    if (!save.sound || !this.ac) return;
    const ac = this.ac, t0 = ac.currentTime + 0.01, k = 0.93 + Math.random() * 0.15, end = t0 + 1.1;
    if (!this.glottal) {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let h = 1; h < n; h++) im[h] = Math.pow(h, -1.35) * (h % 2 ? 1 : 0.75);
      this.glottal = ac.createPeriodicWave(re, im);
    }
    const out = ac.createGain(); out.gain.value = 0.12; out.connect(ac.destination);
    const bus = ac.createGain();
    const F = [[1.0, 7], [0.6, 9], [0.22, 11]].map(([g, q]) => {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      const gg = ac.createGain(); gg.gain.value = g * 2.6;
      bus.connect(bp).connect(gg).connect(out);
      return bp.frequency;
    });
    const osc = ac.createOscillator(); osc.setPeriodicWave(this.glottal);
    const voice = ac.createGain(); voice.gain.value = 0;
    const rough = ac.createGain(); rough.gain.value = 0.8;
    osc.connect(voice).connect(rough).connect(bus);
    const am = ac.createOscillator(); am.frequency.value = 42; const amG = ac.createGain(); amG.gain.value = 0.22; am.connect(amG).connect(rough.gain);
    // toonhoogte-jitter en vibrato (via detune)
    const jit = ac.createBufferSource(); jit.buffer = this.noiseBuf; jit.loop = true;
    const jlp = ac.createBiquadFilter(); jlp.type = 'lowpass'; jlp.frequency.value = 18;
    const jg = ac.createGain(); jg.gain.value = 1500; jit.connect(jlp).connect(jg).connect(osc.detune);
    const vib = ac.createOscillator(); vib.frequency.value = 7; const vg = ac.createGain(); vg.gain.setValueAtTime(0, t0); vg.gain.linearRampToValueAtTime(35, t0 + 0.9); vib.connect(vg).connect(osc.detune);
    // adem door dezelfde klinkerfilters
    const nz = ac.createBufferSource(); nz.buffer = this.noiseBuf; nz.loop = true;
    const breath = ac.createGain(); breath.gain.value = 0; nz.connect(breath).connect(bus);
    const f = osc.frequency, v = voice.gain, br = breath.gain;
    const syl = [ // start, duur, toon-van, toon-naar, luidheid, klinker
      [0.00, 0.10, 330, 400, 0.4, 'u'],
      [0.13, 0.10, 390, 470, 0.5, 'u'],
      [0.27, 0.17, 400, 590, 0.75, 'w'],
      [0.47, 0.55, 680, 420, 1.0, 'o'],
    ];
    v.setValueAtTime(0, t0); br.setValueAtTime(0, t0); f.setValueAtTime(syl[0][2] * k, t0);
    for (const [st, d, fa, fb, amp, vow] of syl) {
      const a = t0 + st, e = a + d;
      f.setValueAtTime(fa * k * 0.9, a); f.linearRampToValueAtTime(fa * k, a + 0.03);
      if (d > 0.3) { f.linearRampToValueAtTime(fa * k * 1.07, a + d * 0.22); f.exponentialRampToValueAtTime(fb * k, e); }
      else f.linearRampToValueAtTime(fb * k, e);
      v.setValueAtTime(0.0001, a); v.linearRampToValueAtTime(amp, a + 0.025);
      v.setValueAtTime(amp * 0.9, e - Math.min(0.1, d * 0.4)); v.linearRampToValueAtTime(0.0001, e);
      br.setValueAtTime(0.0001, a); br.linearRampToValueAtTime(amp * 0.55, a + 0.012); br.linearRampToValueAtTime(amp * 0.14, a + 0.06); br.linearRampToValueAtTime(0.0001, e);
      // de eerste formant volgt de toonhoogte, zodat ook de hoge uithaal vol klinkt
      F[0].setValueAtTime(Math.max(vow === 'w' ? 260 : 310, fa * k * 0.95), a); F[1].setValueAtTime(vow === 'w' ? 560 : vow === 'o' ? 1100 : 780, a); F[2].setValueAtTime(2400, a);
      F[0].linearRampToValueAtTime(Math.max(vow === 'o' ? 440 : 340, fb * k * 0.95), e); F[1].linearRampToValueAtTime(vow === 'o' ? 920 : 860, e);
    }
    for (const node of [osc, am, jit, vib, nz]) { node.start(t0); node.stop(end); }
  },
  jump() { this.tone(220, 0.15, 'triangle', 0.14, 440); this.noise(0.1, 0.08, 1500); },
  // turbo-liaan vastpakken: een oplaadgeluid
  turboCharge() { this.tone(260, 0.45, 'sawtooth', 0.045, 1200); this.tone(520, 0.45, 'triangle', 0.06, 2000); this.noise(0.4, 0.05, 5000, 0.05); [0, 7, 12].forEach((s, i) => this.tone(880 * Math.pow(2, s / 12), 0.12, 'sine', 0.05, 0, 0.1 + i * 0.07)); },
  tramp() { this.tone(160, 0.3, 'sine', 0.2, 620); this.tone(320, 0.2, 'triangle', 0.06, 900, 0.02); },
  trick(chain) { const b = 660 * Math.pow(2, Math.min(chain - 1, 6) * 2 / 12); [0, 4, 7, 12].forEach((s, i) => this.tone(b * Math.pow(2, s / 12), 0.1, 'square', 0.035, 0, i * 0.045)); },
  slide() { this.tone(900, 0.12, 'sine', 0.05, 500); this.noise(0.1, 0.05, 4000); },
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
    this.master.connect(ac.destination);
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
      this.key = [0, -3, 2, 5, -2, -5, 3][bi]; this.minor = bi >= 4;
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
