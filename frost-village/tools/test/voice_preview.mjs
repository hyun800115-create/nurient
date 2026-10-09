// 눈꽃말 voices — browser test: the listening page (docs/previews/voice_preview.html) and the real
// Web Audio path (src/voice/webaudio.js + VillageVoice) in headless Chromium.
//   node tools/test/voice_preview.mjs [--shot]       (exit 0 = pass; --shot saves docs/previews/voice_preview.png)
// Checks: the page loads every sprite (ogg in Chromium) without errors; Chromium decodes ogg AND mp3 to the
// manifest length (or longer by the mp3 pad, which the backend shifts away); an OfflineAudioContext render
// of real lines through WebAudioVoiceBackend makes sound where the plan says, is silent after it, never
// clips, and two lines at once stay at most 2 voices; the backend keeps sprites at half rate (half the
// memory) and still sounds right; pause() / resume() silence a line mid-way and continue it; typing
// text + 말하기 speaks.
import { start } from './serve.mjs';
import { launch, openPage } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shot = process.argv.includes('--shot');
const { url, close } = await start(0);
const browser = await launch();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
try {
  const { page, log } = await openPage(browser, url + 'docs/previews/voice_preview.html', { viewport: { width: 420, height: 900 }, isMobile: false, hasTouch: false });
  await page.waitForFunction(() => window.__voice && document.getElementById('status').textContent.includes('준비'), null, { timeout: 60000 });
  ok(log.errors.length === 0, 'page loads without errors ' + JSON.stringify(log.errors.slice(0, 3)));
  const n = await page.evaluate(() => Object.keys(window.__voice.buffers).length);
  ok(n === 11, `11 voice sprites decoded (${n})`);

  // both formats decode to the expected length in Chromium (mp3 may carry the encoder pad: then shifted)
  const dec = await page.evaluate(async () => {
    const { man } = window.__voice;
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const out = [];
    for (const k of Object.keys(man.audio)) {
      const a = man.audio[k];
      for (const f of a.files) {
        const ab = await (await fetch('../../assets/' + f)).arrayBuffer();
        const b = await ctx.decodeAudioData(ab);
        const x = b.getChannelData(0); let i = 0; while (i < x.length && Math.abs(x[i]) <= 0.02) i++;
        out.push({ f, got: b.length, want: a.samples, pad: a.mp3StartPad, shift: i / 44100 - a.onset });
      }
    }
    return out;
  });
  // length: the sprite, plus at most a codec block of end padding (Chromium ignores the Vorbis end trim:
  // harmless silence after the last clip); start: the first sound where the manifest says (no shift needed)
  // (start offsets under 12 ms are codec smoothing of the first attack at 48 kbps, the same rule webaudio.js startShift uses)
  const bad = dec.filter((d) => !(d.got >= d.want - 64 && d.got <= d.want + 2400) || Math.abs(d.shift) > 0.012);
  ok(bad.length === 0, `Chromium decodes all ${dec.length} files: length ok, clips start on time ` +
    `(max end padding ${Math.max(...dec.map((d) => d.got - d.want))} smp, max start offset ${(Math.max(...dec.map((d) => Math.abs(d.shift))) * 1000).toFixed(2)} ms) ${JSON.stringify(bad.slice(0, 2))}`);

  // real Web Audio render of the runtime (OfflineAudioContext, stepped with suspend/resume like frames)
  const r = await page.evaluate(async () => {
    const { man, VillageVoice, WebAudioVoiceBackend } = window.__voice;
    const SR = 44100, T = 5;
    const ctx = new OfflineAudioContext(1, SR * T, SR);
    const bufs = {};
    for (const k of ['voice_kid_girl', 'voice_big_gruff', 'voice_chief']) {
      const ab = await (await fetch('../../assets/' + man.audio[k].files[0])).arrayBuffer();
      bufs[k] = await ctx.decodeAudioData(ab);
    }
    const vv = new VillageVoice({ manifest: man, backend: new WebAudioVoiceBackend(ctx, ctx.destination, (k) => bufs[k] || null, man), baseGain: 1 });
    const plans = [];
    let maxActive = 0;
    const step = 1 / 60;
    for (let t = step; t < T - 0.05; t += step) {
      ctx.suspend(t).then(() => {
        const now = ctx.currentTime;
        if (Math.abs(now - 0.1) < step / 2) { plans.push({ t: now, p: vv.plan('우와! 눈이 정말 많이 왔어요!', { voice: 'kid_girl', voiceId: 'a' }) }); vv.speak('우와! 눈이 정말 많이 왔어요!', { voice: 'kid_girl', voiceId: 'a' }); }
        if (Math.abs(now - 0.3) < step / 2) vv.speak('흥, 나무는 내가 다 할게.', { voice: 'big_gruff', voiceId: 'b' });
        if (Math.abs(now - 0.4) < step / 2) vv.speak('고마워요 여러분!', { voice: 'chief', voiceId: 'c' });
        vv.update(step);
        maxActive = Math.max(maxActive, vv.activeCount);
        ctx.resume();
      });
    }
    const buf = await ctx.startRendering();
    const x = buf.getChannelData(0);
    const rms = (a, b) => { let s = 0; const i0 = Math.floor(a * SR), i1 = Math.floor(b * SR); for (let i = i0; i < i1; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
    let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    const p = plans[0].p;
    const full = Object.values(bufs).reduce((s, b) => s + b.length * 4, 0);
    return { maxActive, peak, during: rms(0.15, 0.15 + p.duration), after: rms(4.2, 4.9), stats: vv.stats, dur: p.duration,
      mem: vv.backend.memory(), full, rate: Object.values(vv.backend.bufs).map((b) => b.sampleRate) };
  });
  // pause / resume through real Web Audio: a long line paused at 0.5 s for 1.5 s, then continued
  const pr = await page.evaluate(async () => {
    const { man, VillageVoice, WebAudioVoiceBackend } = window.__voice;
    const SR = 44100, T = 5;
    const ctx = new OfflineAudioContext(1, SR * T, SR);
    const ab = await (await fetch('../../assets/' + man.audio.voice_adult_f.files[0])).arrayBuffer();
    const b = await ctx.decodeAudioData(ab);
    const vv = new VillageVoice({ manifest: man, backend: new WebAudioVoiceBackend(ctx, ctx.destination, () => b, man), baseGain: 1 });
    const line = '촌장님, 오늘 생선 정말 많이 잡았어요. 빵도 많이 구웠고 마을이 따뜻해요!';
    const step = 1 / 60;
    let dur = 0;
    for (let t = step; t < T - 0.05; t += step) {
      ctx.suspend(t).then(() => {
        const now = ctx.currentTime;
        if (Math.abs(now - 0.1) < step / 2) { const u = vv.speak(line, { voice: 'adult_f', voiceId: 'p' }); dur = u.duration; }
        if (Math.abs(now - 0.5) < step / 2) vv.pause();
        if (Math.abs(now - 2.0) < step / 2) vv.resume();
        vv.update(step);
        ctx.resume();
      });
    }
    const x = (await ctx.startRendering()).getChannelData(0);
    const rms = (a, c) => { let s = 0; const i0 = Math.floor(a * SR), i1 = Math.floor(c * SR); for (let i = i0; i < i1; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
    return { before: rms(0.15, 0.5), paused: rms(1.3, 1.95), after: rms(2.05, 2.6), dur };
  });
  ok(r.during > 0.01 && r.after < 1e-4, `Web Audio render: sound while speaking (rms ${r.during.toFixed(4)}), silence after (${r.after.toExponential(1)})`);
  ok(r.peak < 0.99, `no clipping (peak ${r.peak.toFixed(3)})`);
  ok(r.maxActive <= 2, `at most 2 voices (max ${r.maxActive}; stats ${JSON.stringify(r.stats)})`);
  ok(r.mem > 0 && r.mem <= r.full * 0.51 && r.rate.every((x) => x === 22050), `sprites kept at half rate: ${(r.mem / 1e6).toFixed(2)} MB for ${(r.full / 1e6).toFixed(2)} MB decoded (${r.rate.join(', ')} Hz)`);
  ok(pr.before > 0.01 && pr.paused < 1e-4 && pr.after > 0.01, `pause / resume: rms ${pr.before.toFixed(4)} speaking, ${pr.paused.toExponential(1)} paused, ${pr.after.toFixed(4)} after resume (line ${pr.dur.toFixed(2)} s)`);

  // the UI: type a line, press 말하기
  await page.click('body');
  await page.fill('#text', '촌장님, 생선 사세요!');
  await page.selectOption('#voice', 'adult_f');
  await page.click('#speak');
  await page.waitForTimeout(150);
  const said = await page.textContent('#said');
  ok(/촌촌님|퓌뽈/.test(said), 'typed line is said in 눈꽃말: ' + said.trim());
  if (shot) {
    await page.setViewportSize({ width: 420, height: 1400 });
    await page.screenshot({ path: path.join(ROOT, 'docs/previews/voice_preview.png') });
    console.log('saved docs/previews/voice_preview.png');
  }
  ok(log.errors.length === 0, 'no page errors at the end ' + JSON.stringify(log.errors.slice(0, 3)));
} catch (e) {
  console.log('FAIL ' + (e && e.stack || e)); fail++;
} finally {
  await browser.close(); close();
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
