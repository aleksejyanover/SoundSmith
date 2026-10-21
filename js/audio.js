/* ============ SoundSmith — аудио-движок ============ */
"use strict";

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToMidi(n) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  let semi = NOTE_BASE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return semi + (parseInt(m[3], 10) + 1) * 12;
}
function noteFreq(n) {
  return 440 * Math.pow(2, (noteToMidi(n) - 69) / 12);
}

const Audio = {
  ctx: null,
  master: null,
  melodyBus: null,
  drumBus: null,
  pianoBus: null,
  delaySend: null,
  delay: null,
  delayFb: null,

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);

    this.melodyBus = this.ctx.createGain();
    this.drumBus = this.ctx.createGain();
    this.pianoBus = this.ctx.createGain();
    this.melodyBus.connect(this.master);
    this.drumBus.connect(this.master);
    this.pianoBus.connect(this.master);

    // эхо (delay + feedback), отдельные посылы для мелодии и пианино
    this.delaySend = this.ctx.createGain();       // посыл мелодии
    this.pianoSend = this.ctx.createGain();       // посыл пианино
    this.delay = this.ctx.createDelay(1.5);
    this.delayFb = this.ctx.createGain();
    this.delaySend.connect(this.delay);
    this.pianoSend.connect(this.delay);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.master);
    this.delay.delayTime.value = 0.28;
    this.delayFb.gain.value = 0.35;

    this.melodyBus.connect(this.delaySend);
    this.pianoBus.connect(this.pianoSend);

    return this.ctx;
  },

  resume() {
    const c = this.init();
    if (c.state === "suspended") c.resume();
    return c;
  },

  setMix(m) {
    if (!this.ctx) return;
    this.melodyBus.gain.value = m.melody;
    this.drumBus.gain.value = m.drums;
    this.pianoBus.gain.value = m.piano;
    this.master.gain.value = m.master;
    this.delaySend.gain.value = m.melodyDelay != null ? m.melodyDelay : m.delay;
    this.pianoSend.gain.value = m.delay;
  },

  /* --- голос синтезатора --- */
  note(freq, time, dur, opts) {
    const ctx = opts.ctx || this.ctx;
    const dest = opts.dest;
    const wf = opts.wave || "sawtooth";
    const vol = opts.vol == null ? 0.3 : opts.vol;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = Math.min(9000, freq * 6 + 900);

    osc.type = wf;
    osc.frequency.value = freq;

    const a = 0.012;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + a);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.05);
    return osc;
  },

  /* --- барабаны --- */
  drum(kind, time, dest, ctxArg) {
    const ctx = ctxArg || this.ctx;
    const out = dest || this.drumBus;

    if (kind === "kick") {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(150, time);
      o.frequency.exponentialRampToValueAtTime(42, time + 0.13);
      g.gain.setValueAtTime(1.0, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.32);
      o.connect(g); g.connect(out);
      o.start(time); o.stop(time + 0.36);
      return;
    }

    if (kind === "snare" || kind === "clap") {
      const len = kind === "clap" ? 0.16 : 0.2;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = kind === "clap" ? "bandpass" : "highpass";
      hp.frequency.value = kind === "clap" ? 1200 : 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(kind === "clap" ? 0.55 : 0.6, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + len);
      src.connect(hp); hp.connect(g); g.connect(out);
      src.start(time);

      if (kind === "snare") {
        const t = ctx.createOscillator(), tg = ctx.createGain();
        t.type = "triangle";
        t.frequency.value = 190;
        tg.gain.setValueAtTime(0.35, time);
        tg.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        t.connect(tg); tg.connect(out);
        t.start(time); t.stop(time + 0.14);
      }
      return;
    }

    // hi-hat
    const len = 0.06;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + len);
    src.connect(hp); hp.connect(g); g.connect(out);
    src.start(time);
  }
};

/* ============ экспорт в WAV ============ */
function encodeWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  let pos = 0;

  const wstr = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)); };
  const w32 = (v) => { view.setUint32(pos, v, true); pos += 4; };
  const w16 = (v) => { view.setUint16(pos, v, true); pos += 2; };

  wstr("RIFF"); w32(len - 8); wstr("WAVE");
  wstr("fmt "); w32(16); w16(1); w16(numCh);
  w32(buffer.sampleRate);
  w32(buffer.sampleRate * numCh * 2);
  w16(numCh * 2); w16(16);
  wstr("data"); w32(len - 8);

  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
