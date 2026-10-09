// 눈꽃말 voices — the Phaser glue (src/voice/phaser.js) in a real Phaser game, headless Chromium.
//   node tools/test/voice_phaser.mjs        (exit 0 = pass)
// docs/previews/voice_phaser_test.html boots Phaser with a Game scene that has the game's late-file hook;
// this test checks: the voice fragment's manifest arrives late (Assets.loadFragment), a resident is NOT
// ready before its sprite is decoded (so the game would keep its old chatter for that line) and asking
// fetches only that voice; once decoded it speaks, the sprite is kept at half rate and Phaser's full-rate
// copy is dropped from the cache; scene pause / resume pause / resume the voices; no page errors.
import { start } from './serve.mjs';
import { launch, openPage } from './pw.mjs';

const { url, close } = await start(0);
const browser = await launch();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const until = async (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
try {
  const { page, log } = await openPage(browser, url + 'docs/previews/voice_phaser_test.html', { isMobile: false, hasTouch: false });
  await until(page, () => window.__vt && window.__vt.vv && window.__vt.vv.backend);
  const m = await page.evaluate(() => ({ types: Object.keys(window.__vt.vv.voices).length, late: !!(window.__vt.Assets.lateManifest || {}).voice }));
  ok(m.late && m.types === 11, `voice fragment merged late: ${m.types} voice types`);
  // a resident whose voice is not loaded: not ready, asks for its sprite (only that one)
  const r0 = await page.evaluate(() => {
    const { vv } = window.__vt;
    const aunt = { key: 'npc_aunt', x: 0, y: 0 };
    const first = vv.ready(aunt);
    const u = vv.speak('안녕하세요 촌장님!', aunt);
    return { first, spoke: !!u, asked: Object.keys(vv.requested), queued: [...window.__vt.Assets.lateAudio] };
  });
  ok(!r0.first && !r0.spoke && r0.asked.join() === 'adult_f' && r0.queued.join() === 'voice_adult_f',
    `not ready before decode -> old chatter for this line; asked for ${r0.asked} (${r0.queued})`);
  await until(page, () => window.__vt.vv.ready({ key: 'npc_aunt' }));
  const r1 = await page.evaluate(() => {
    const { vv, game } = window.__vt;
    const u = vv.speak('안녕하세요 촌장님! 오늘 빵 사러 오세요~', { key: 'npc_aunt', x: 0, y: 0 });
    const b = vv.backend.bufs.voice_adult_f;
    return { spoke: !!u, rate: b && b.sampleRate, ctxRate: vv.backend.ctx.sampleRate, inCache: game.cache.audio.exists('voice_adult_f'),
      mem: vv.backend.memory(), others: Object.keys(vv.backend.bufs) };
  });
  ok(r1.spoke && r1.rate === r1.ctxRate / 2 && !r1.inCache && r1.others.join() === 'voice_adult_f',
    `speaks once decoded; sprite at ${r1.rate} Hz (context ${r1.ctxRate}), ${(r1.mem / 1e6).toFixed(2)} MB, Phaser's full-rate copy dropped: ${!r1.inCache}`);
  // scene pause / resume (menus pause the Game scene)
  const r2 = await page.evaluate(async () => {
    const { scene, vv } = window.__vt;
    vv.speak('촌장님, 오늘 생선 정말 많이 잡았어요. 같이 먹어요!', { key: 'npc_aunt', x: 0, y: 0 });
    scene.scene.pause();
    await new Promise((r) => setTimeout(r, 50));
    const p = vv.paused;
    scene.scene.resume();
    await new Promise((r) => setTimeout(r, 50));
    return { paused: p, resumed: !vv.paused, active: vv.activeCount };
  });
  ok(r2.paused && r2.resumed, `scene pause -> voices paused (${r2.paused}), resume -> playing again (${r2.resumed}, ${r2.active} active)`);
  ok(log.errors.length === 0, 'no page errors ' + JSON.stringify(log.errors.slice(0, 3)));
} catch (e) {
  console.log('FAIL ' + (e && e.stack || e)); fail++;
} finally {
  await browser.close(); close();
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
