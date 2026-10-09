// 눈꽃말 voices — Web Audio playback backend for VillageVoice (browser / Phaser WebAudio).
//
//   clip source (playbackRate) -> [clip gain] -> channel gain (distance, fade) -> voice bus (volume x duck) -> destination
// Channels and the bus are made once; per clip one AudioBufferSourceNode (+ a GainNode when the clip
// gain is not 1) is created when it is handed to the audio clock — per word, never per frame.
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

export class WebAudioVoiceBackend {
  /**
   * ctx: AudioContext; destination: AudioNode (Phaser: game.sound.destination, so mute / master volume apply);
   * getBuffer(key) -> decoded AudioBuffer or null; manifest: the voice fragment (for samples / mp3StartPad)
   */
  constructor(ctx, destination, getBuffer, manifest) {
    this.ctx = ctx;
    this.getBuffer = getBuffer;
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
    const b = this.getBuffer(key);
    if (b && this.shift[key] === undefined) this.shift[key] = startShift(b, this.audio[key]);
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

  dispose() { try { this.bus.disconnect(); } catch (e) { /* */ } }
}
