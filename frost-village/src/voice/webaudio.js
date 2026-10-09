// 눈꽃말 voices — Web Audio playback backend for VillageVoice (browser / Phaser WebAudio).
//
//   clip source (playbackRate) -> [clip gain] -> channel gain (distance, fade) -> voice bus (volume x duck) -> destination
// Channels and the bus are made once; per clip one AudioBufferSourceNode (+ a GainNode when the clip
// gain is not 1) is created when it is handed to the audio clock — per word, never per frame.
// Memory: browsers decode at the context rate (48 kHz float on most phones, ~4.5 MB per voice sprite). The
// voices have nothing above ~10 kHz, so each decoded sprite is kept at HALF that rate (a 7-tap half-band
// filter + 2:1 decimation, once, a few ms): about 2.3 MB per voice; `release(key)` lets the owner drop
// the full-rate original (Phaser: game.cache.audio.remove).
// mp3 decoders that ignore the LAME gapless tag put ~25 ms of silence before the audio: the backend finds
// the first sound of each decoded sprite and, if it came late, shifts every marker by that much.

/**
 * Decoder start delay of a decoded sprite, in seconds: the first sound in the file is at manifest
 * `onset`; a decoder that ignores the mp3 gapless tag puts it ~25 ms later (and a Vorbis decoder that
 * ignores the end trim only adds silence at the END, which is harmless). Measured once per buffer.
 */
const ONSET_THR = 0.02;     // -34 dBFS: above codec pre-echo, below the first word's attack

export function startShift(buf, a) {
  if (!a || !(a.onset > 0) || !buf.getChannelData) return 0;
  const x = buf.getChannelData(0), sr = buf.sampleRate;
  const n = Math.min(x.length, Math.floor(sr * (a.onset + 0.12)));
  for (let i = 0; i < n; i++) {
    if (x[i] > ONSET_THR || x[i] < -ONSET_THR) {
      const d = i / sr - a.onset;
      return d > 0.012 && d < 0.08 ? d : 0;   // a real decoder delay is >= 25 ms; smaller = codec smoothing
    }
  }
  return 0;
}

const HALF_BAND = [-0.0322, 0, 0.2822, 0.5, 0.2822, 0, -0.0322];

/** a decoded sprite at half its sample rate (when that stays >= 20 kHz), or the buffer itself */
export function compactBuffer(ctx, buf) {
  if (!buf || !buf.getChannelData || buf.sampleRate < 40000 || buf.numberOfChannels !== 1) return buf;
  const sr = buf.sampleRate / 2, n = Math.floor(buf.length / 2);
  let out = null;
  try { out = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr }); } catch (e) {
    try { out = ctx.createBuffer(1, n, sr); } catch (e2) { return buf; }
  }
  const x = buf.getChannelData(0), y = out.getChannelData(0), L = x.length;
  for (let i = 0; i < n; i++) {
    const c = 2 * i;
    let s = 0.5 * x[c];
    if (c - 1 >= 0) s += 0.2822 * x[c - 1];
    if (c + 1 < L) s += 0.2822 * x[c + 1];
    if (c - 3 >= 0) s -= 0.0322 * x[c - 3];
    if (c + 3 < L) s -= 0.0322 * x[c + 3];
    y[i] = s;
  }
  return out;
}

export class WebAudioVoiceBackend {
  /**
   * ctx: AudioContext; destination: AudioNode (Phaser: game.sound.destination, so mute / master volume apply);
   * getBuffer(key) -> decoded AudioBuffer or null; manifest: the voice fragment (for samples / mp3StartPad)
   */
  constructor(ctx, destination, getBuffer, manifest, opts = {}) {
    this.ctx = ctx;
    this.getBuffer = getBuffer;
    this.compact = opts.compact !== false;          // keep sprites at half rate (half the memory)
    this.release = opts.release || null;            // fn(key): the full-rate original may be dropped
    this.bufs = {};
    this.audio = (manifest && manifest.audio) || {};
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);
    this.ch = [];
    this.shift = {};
  }

  now() { return this.ctx.currentTime; }

  chan(i) {
    while (this.ch.length <= i) {
      const g = this.ctx.createGain();
      g.connect(this.bus);
      this.ch.push(g);
    }
    return this.ch[i];
  }

  buffer(key) {
    let b = this.bufs[key];
    if (b) return b;
    b = this.getBuffer(key);
    if (!b) return null;
    if (this.shift[key] === undefined) this.shift[key] = startShift(b, this.audio[key]);
    if (this.compact) {
      const c = compactBuffer(this.ctx, b);
      if (c !== b) { this.bufs[key] = c; if (this.release) { try { this.release(key); } catch (e) { /* keep it */ } } return c; }
    }
    return b;
  }

  has(key) { return !!this.buffer(key); }

  play(key, offset, dur, when, rate, gain, ch) {
    const b = this.buffer(key);
    if (!b) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    let out = src;
    if (Math.abs(gain - 1) > 0.001) {
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      out = g;
    }
    out.connect(this.chan(ch));
    const off = Math.max(0, Math.min(b.duration - 0.01, offset + this.shift[key]));
    try { src.start(Math.max(when, ctx.currentTime), off, dur + 0.004); } catch (e) { return null; }
    src.onended = () => { try { out.disconnect(); if (out !== src) src.disconnect(); } catch (e) { /* gone */ } };
    return src;
  }

  stop(h, when) { if (h) { try { h.stop(Math.max(when, this.ctx.currentTime)); } catch (e) { /* not started / done */ } } }

  ramp(param, v, rampS) {
    const t = this.ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(v, t + Math.max(0.002, rampS));
    } catch (e) { param.value = v; }
  }

  setChannelGain(ch, g, rampS) { this.ramp(this.chan(ch).gain, g, rampS); }
  setBusGain(g, rampS) { this.ramp(this.bus.gain, g, rampS); }

  /** bytes held by decoded sprites (for memory budgets / tests) */
  memory() { let n = 0; for (const k in this.bufs) n += this.bufs[k].length * 4; return n; }

  dispose() { try { this.bus.disconnect(); } catch (e) { /* */ } this.bufs = {}; }
}
