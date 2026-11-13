// (v4.3) 관망 둘러보기, fixed-step clock — the designer's 「관망모드시 내가 도시를 자유롭게 움직이게 해줘 관망모드 아이콘누르면
// 해제되고」:
//   node tools/test/watchpan.mjs [--shots DIR] [--no-desktop] [--no-en]
// A  phone 412 x 915 ko, the v4.1 46-min save (village complete), real touches (synthetic TouchEvents on the canvas):
//    the 관망 button turns it on (lit, a ring, 「관망 끄기」) with the one-time hint; one finger drags the camera 1:1 over the
//    village (no joystick, 관망 stays on, the chief keeps his own walk) and detaches it (「촌장님 보기」 chip); a 볼거리 and
//    another system's focusCamera do not move it; it stops at the camera bounds (150 px over the sea's top edge) and comes
//    back at once; a tap on a resident still reaches them (no pan); a pinch zooms and 관망 stays on; Residency's areas,
//    the ground tiles and the view culling follow the free camera; the chip glides the camera back to the chief (no jump);
//    the 관망 button (the only way out) ends it and the camera glides back; then a finger is the joystick again; the hint
//    shows once; the auto-start countdown still stops at a touch, and an auto-started 관망 is not ended by a tap.
//    ((v4.3 review) + the chief is steered by the pilot, never by the finger (Input.vec = the pilot's every frame); a
//    pinch whose first finger already panned 30 px does not slide the camera; a drag shorter than the slop and one that
//    starts on the zoom button do not pan; fast pans (3,000 px / s at zoom 1.2 and 0.7) leave ≤ 5 % of the frames with
//    unbaked ground in view, ≤ 4 tiles baked a frame; a rank ceremony that starts while the camera looks around shows
//    its square.)
// B  desktop 1280 x 800 (mouse, keys): a mouse drag pans, the arrow keys pan (the chief is not steered by them), the
//    wheel zooms, a click on the chip and on the button.
// C  phone 360 x 640 en: the button label, the chip and the hint fit the screen; a tap on the 「Stop watching」 pill ends 관망.
// D  ((v4.3 review) phone 412 x 915 ko, the v4.2 office save: the chief seated at his desk, the camera looks around far
//    away — his chief2 sheet (3 MiB) is let go though he sits in it, not reloaded while the view wobbles between 600 and
//    900 px from him, asked for again before he is on screen; back with him he sits (no standing in the desk), 0 errors.
// --shots DIR: 412x915 ko + 360x640 en (deviceScaleFactor 1) — on / panned far + chip / after the chip / after 관망.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, render } from './fv_step.mjs';
import { asStepB } from './v43_helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SHOTS = opt('--shots', '');
// ((v4.3 step B, S6 — the B0 suite audit, BP-21: asStepB) 관망's free camera and the core edge on the saved villages: the fixtures carry
//  the step-B marker, so the R43 remap (workshops to their d_* plots, the chief back at the hut door) is no part of it
const SAVE = asStepB(fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8'));
const OFFICE_SAVE = asStepB(fs.readFileSync(path.join(HERE, 'fixtures', 'v42_save_office_ttal.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined && process.env.FV_VERBOSE ? '  ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const t0 = Date.now();
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

async function boot(o) {
  const { page, ctx, log } = await openPage(browser, srv.url + 'index.html', { viewport: o.viewport, dpr: 1, locale: o.lang === 'en' ? 'en-US' : 'ko-KR', isMobile: o.mobile !== false, hasTouch: o.mobile !== false });
  await page.evaluate((x) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', x.save); localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ lang: x.lang })); } catch (e) { /* */ } }, { save: o.save || SAVE, lang: o.lang });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  if (o.mobile === false) {
    const c = await (await page.$('canvas')).boundingBox();
    for (let i = 0; i < 10; i++) {
      await page.mouse.click(c.x + c.width / 2, c.y + c.height * 0.6);
      if (await page.waitForFunction(() => !window.__FV.game.scene.isActive('Title'), null, { timeout: 3000, polling: 100 }).then(() => true).catch(() => false)) break;
    }
  } else await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => {
    try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    const ui = window.__FV.game.scene.getScene('UI');
    if (ui.hud42 && ui.hud42.card) ui.hud42.closeCard(true);
    // in-page helpers: logical UI px -> client px, synthetic touches, a probe
    const g = window.__FV.game, cv = g.canvas;
    const cl = (x, y) => { const r = cv.getBoundingClientRect(); return [r.left + x * r.width / ui.W, r.top + y * r.height / ui.H]; };
    const pts = {};
    const mk = (id) => new Touch({ identifier: id, target: cv, clientX: pts[id][0], clientY: pts[id][1], pageX: pts[id][0], pageY: pts[id][1], radiusX: 2, radiusY: 2, force: 1 });
    const fire = (type, changed) => { const touches = Object.keys(pts).map(Number).filter((i) => !(type === 'touchend' && changed.includes(i))).map(mk); cv.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: changed.map(mk), bubbles: true, cancelable: true })); if (type === 'touchend') changed.forEach((i) => delete pts[i]); };
    window.__T = {
      cl,
      down(id, x, y) { pts[id] = cl(x, y); fire('touchstart', [id]); },
      move(id, x, y) { pts[id] = cl(x, y); fire('touchmove', [id]); },
      up(id) { fire('touchend', [id]); },
      /** one finger along a line in `n` moves, one game frame after each (like a real drag) */
      drag(x0, y0, x1, y1, n = 20, keep) {
        const ui2 = window.__FV.game.scene.getScene('UI');
        let joy = false, steer = 0, joyActive = false;
        // (review F12) every frame: is the chief steered by the pilot (Input.vec = the pilot's vector) or by the finger?
        const look = () => { const I = window.__FV_Input, P = window.__FV.scene.v42.pilot; if (!I) return; joyActive = joyActive || I.joy.active; if (P.on) steer = Math.max(steer, Math.hypot(I.vec.x - P.vec.x, I.vec.y - P.vec.y)); };
        this.down(9, x0, y0); window.__step.run(1 / 60); look();
        for (let i = 1; i <= n; i++) { this.move(9, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); window.__step.run(1 / 60); look(); joy = joy || ui2.joyBase.visible; }
        if (!keep) { window.__step.run(4 / 60); look(); this.up(9); }
        return { joy, steer: +steer.toFixed(3), joyActive };
      },
    };
    // game time with drawn frames (the camera's scroll, its world view, the culling and the residents' LOD follow drawn frames)
    window.__settle = (sec) => { for (let i = 0; i < Math.round(sec * 10); i++) { window.__step.run(0.1); window.__step.frame(); } };
    window.__probe = () => {
      const gs = window.__FV.scene, P = gs.v42.pilot, cam = gs.cameras.main, ct = gs.camTarget, p = gs.player, hud = ui.hud42.state();
      const z = cam.zoom || 1;
      return { on: P.on, free: P.cam.free ? { x: Math.round(P.cam.free.x), y: Math.round(P.cam.free.y) } : null, ct: { x: +ct.x.toFixed(1), y: +ct.y.toFixed(1) }, scroll: { x: Math.round(cam.scrollX + cam.width / 2), y: Math.round(cam.scrollY + cam.height / 2) },
        view: { x: Math.round(cam.scrollX + cam.width / 2 - cam.width / z / 2), y: Math.round(cam.scrollY + cam.height / 2 - cam.height / z / 2), w: Math.round(cam.width / z), h: Math.round(cam.height / z) },
        chief: { x: Math.round(p.x), y: Math.round(p.y) }, zoom: +gs.zoomTarget.toFixed(3), zoomCur: +gs.zoomCur.toFixed(3), camFocus: !!gs.camFocus, camGlide: !!gs.camGlide, cuts: P.cam.cuts, blocked: P.cam.blocked, panned: Math.round(P.cam.panned),
        hud: { obs: hud.obs, obsOn: hud.obsOn, stop: hud.obsStop, hint: hud.hint, panHint: hud.panHint, back: hud.back, caption: hud.caption, count: hud.count }, joy: ui.joyBase.visible, joyActive: window.__FV_Input ? window.__FV_Input.joy.active : null,
        countdown: +P.countdown.toFixed(2), camRect: gs.territory.camRect, toast: ui.toastBox.visible ? ui.toastText.text : null };
    };
  });
  await page.evaluate(async () => { window.__FV_Input = (await import(new URL('src/core/Input.js', location.href).href)).Input; window.__FV_Res = (await import(new URL('src/core/Residency.js', location.href).href)).Residency; window.__FV_Assets = (await import(new URL('src/core/Assets.js', location.href).href)).Assets; });
  return { page, ctx, log };
}
const pr = (page) => page.evaluate(() => window.__probe());
const run = (page, s) => page.evaluate((x) => window.__step.run(x), s);
const tapL = (page, x, y) => page.evaluate(([a, b]) => { window.__T.down(8, a, b); window.__step.run(2 / 60); window.__T.up(8); window.__step.run(2 / 60); }, [x, y]);
const shot = async (page, name) => { if (!SHOTS) return; await render(page, 3); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); console.log('  shot ' + name); };
const hudXY = (page, k) => page.evaluate((key) => { const h = window.__FV.game.scene.getScene('UI').hud42, o = h[key]; return { x: o.x, y: o.y, v: o.visible }; }, k);
const near = (a, b, d) => Math.abs(a - b) <= d;

// ===================================================================================== A: phone, ko
async function phoneFlow(o) {
  const tag = o.tag;
  const { page, log } = await boot(o);
  try {
    const s0 = await page.evaluate(() => { const gs = window.__FV.scene, P = gs.v42.pilot; return { avail: P.available, on: P.on, hint: window.__FV.v42.settings().obsPanHint }; });
    ok(s0.avail && !s0.on && s0.hint === false, `[${tag}] the 46-min village: 관망 available, off, the hint not seen yet`, s0);
    await run(page, 0.5);
    // ---- the 관망 button turns it on
    const b = await hudXY(page, 'obsBtn');
    ok(b.v, `[${tag}] the 관망 button shows`, b);
    await tapL(page, b.x, b.y);
    await run(page, 0.5);
    let s = await pr(page);
    ok(s.on && s.hud.obsOn && s.hud.stop === o.stop, `[${tag}] the button: 관망 on, the button lit with 「${o.stop}」 under it`, s.hud);
    ok(s.hud.panHint === o.panHint && s.hud.hint === o.hint, `[${tag}] the one-time look-around hint at the bottom; the caption says how 관망 ends`, s.hud);
    await shot(page, tag + '_1_on');
    // ---- one finger drags the camera
    await run(page, 1);
    s = await pr(page);
    const ct0 = s.ct, ch0 = s.chief, z = s.zoomCur;
    const dr = await page.evaluate(() => window.__T.drag(560, 1000, 260, 700, 20));
    await run(page, 0.1);
    const s1 = await pr(page);
    // the finger moved -300, -300 logical: the camera +300/zoom world px each way (a flick may glide on a little)
    const ex = 300 / z;
    const mvx = s1.free ? s1.free.x - ct0.x : 0, mvy = s1.free ? s1.free.y - ct0.y : 0;
    ok(s1.on && s1.free && mvx >= ex * 0.9 && mvy >= ex * 0.9 && mvx <= ex * 1.6 && mvy <= ex * 1.6, `[${tag}] a one-finger drag moves the camera with the finger (${Math.round(mvx)}, ${Math.round(mvy)} world px for ${Math.round(ex)}), 관망 stays on`, { s1, ct0, ex });
    ok(!dr.joy && !s1.joy, `[${tag}] no joystick during the 관망 drag`, dr);
    ok(s1.hud.back === o.back && s1.hud.panHint === null, `[${tag}] 「${o.back}」 shows once the camera is the player's (the hint has done its job)`, s1.hud);
    // more strokes: far from the chief
    for (let k = 0; k < 3; k++) await page.evaluate(() => window.__T.drag(600, 1100, 150, 750, 16));
    await run(page, 1.5);
    const s2 = await pr(page);
    const far = Math.hypot(s2.ct.x - s2.chief.x, s2.ct.y - s2.chief.y);
    ok(s2.on && far > 900 && s2.free && near(s2.ct.x, s2.free.x, 1) && near(s2.ct.y, s2.free.y, 1), `[${tag}] panned far from the chief (${Math.round(far)} px), the camera follows the free point 1:1`, s2);
    // ((review F12) the chief walks on his own (the pilot): every frame of the drag his input is the pilot's vector (a
    //  frame's turn at most), never the finger's, and no joystick; he moved less than the camera did
    const chMoved = Math.hypot(s1.chief.x - ch0.x, s1.chief.y - ch0.y), camMoved = Math.hypot(mvx, mvy);
    ok(dr.steer < 0.2 && !dr.joyActive && chMoved < camMoved, `[${tag}] the chief is steered by the pilot, not by the finger (Input.vec within ${dr.steer} of the pilot's every frame; he moved ${Math.round(chMoved)} px, the camera ${Math.round(camMoved)})`, { dr, chMoved, camMoved });
    await shot(page, tag + '_2_panned');
    if (o.full) {
      // ---- the director and other systems do not take the camera
      const d = await page.evaluate(() => {
        const gs = window.__FV.scene, P = gs.v42.pilot, p = gs.player, ct = gs.camTarget;
        const before = { x: ct.x, y: ct.y, cuts: P.cam.cuts };
        P.cam.nextCut = 0;
        gs.events.emit('built', 'test', { x: p.x, y: p.y + 40 });
        gs.focusCamera(p.x, p.y, 5000);
        window.__step.run(2);
        return { moved: Math.hypot(ct.x - before.x, ct.y - before.y), cuts: P.cam.cuts - before.cuts, focus: !!gs.camFocus, blocked: P.cam.blocked };
      });
      ok(d.moved < 1 && d.cuts === 0 && !d.focus, `[${tag}] a 볼거리 and another focusCamera leave the panned camera alone (moved ${d.moved.toFixed(1)} px, held back ${d.blocked})`, d);
      // a jump the player asks for (the office panel's 「보러 가기」: focusCamera(…, mine)) glides the look-around point there
      const hop = await page.evaluate(() => {
        const gs = window.__FV.scene, P = gs.v42.pilot, m = gs.market, f0 = { x: P.cam.free.x, y: P.cam.free.y };
        gs.focusCamera(m.x, m.y, 2200, true);
        window.__step.run(4 / 60);
        const mid = Math.hypot(P.cam.free.x - f0.x, P.cam.free.y - f0.y);
        window.__step.run(2);
        return { mid, d: Math.hypot(P.cam.free.x - m.x, P.cam.free.y - m.y), whole: Math.hypot(m.x - f0.x, m.y - f0.y), free: !!P.cam.free, on: P.on };
      });
      ok(hop.free && hop.on && hop.d < 30 && hop.mid > 0 && hop.mid < hop.whole * 0.5, `[${tag}] a jump the player asked for glides the free camera there (${Math.round(hop.whole)} px, ${Math.round(hop.d)} px off after 2 s)`, hop);
      // ---- the bounds: far up-left stops at the camera rect (150 px over the sea's top edge), back at once
      for (let k = 0, last = null; k < 16; k++) {
        await page.evaluate(() => window.__T.drag(150, 500, 700, 1300, 12));
        await run(page, 0.6);
        const f = (await pr(page)).free;
        if (last && f && Math.abs(f.x - last.x) < 1 && Math.abs(f.y - last.y) < 1) break;
        last = f;
      }
      await render(page, 2);
      const e = await pr(page);
      const R = e.camRect;
      ok(e.view.y >= R.y - 2 && e.view.y <= R.y + 4 && e.view.x >= R.x - 2 && e.view.x <= R.x + 4 && R.y === -150, `[${tag}] the camera stops at the bounds' top-left (view ${e.view.x}, ${e.view.y}; bounds ${R.x}, ${R.y} — 150 px over the sea)`, { view: e.view, R, free: e.free });
      const fy0 = e.free.y;
      await page.evaluate(() => window.__T.drag(360, 900, 360, 820, 8));
      await run(page, 0.05);
      const e2 = await pr(page);
      ok(e2.free.y - fy0 > 40, `[${tag}] and comes back at once (no dead zone past the edge: +${e2.free.y - fy0} px)`, { fy0, now: e2.free });
      // ---- residency, ground baking and culling follow the free camera
      const rg = await page.evaluate(() => {
        const gs = window.__FV.scene, ct = gs.camTarget, P = gs.v42.pilot, cam = gs.cameras.main;
        // the depot area (Residency REGIONS: [2700, 2850, 3700, 3420]) seen from the camera vs from the chief
        const D = [2700, 2850, 3700, 3420];
        const gap = (cx, cy) => { const z = Math.max(0.05, cam.zoom || 1), w = cam.width / z, h = cam.height / z; const v = { x: cx - w / 2, right: cx + w / 2, y: cy - h / 2, bottom: cy + h / 2 }; return Math.max(Math.max(0, D[0] - v.right, v.x - D[2]), Math.max(0, D[1] - v.bottom, v.y - D[3])); };
        window.__FV.v42.pilotCam('to', 3200, 3100);
        window.__settle(3);
        const st = window.__FV.texStats(), G = gs.ground, cu = gs.culler;
        const TW = 510, cx = ct.x, cy = ct.y;
        const baked = G.slots.some((q) => { if (q.id < 0) return false; const T = TW << q.lv; return q.tx * T <= cx && cx < (q.tx + 1) * T && q.ty * T <= cy && cy < (q.ty + 1) * T; });
        const R = cu.R;
        const areas = st.areas || {};
        const rep = areas.depot ? Number((areas.depot.match(/gap (\d+)/) || [])[1]) : -1;
        return { ct: { x: Math.round(ct.x), y: Math.round(ct.y) }, chief: { x: Math.round(gs.player.x), y: Math.round(gs.player.y) }, baked, cull: R.x < cx && R.right > cx && R.y < cy && R.bottom > cy, rep, fromCam: Math.round(gap(ct.x, ct.y)), fromChief: Math.round(gap(gs.player.x, gs.player.y - 30)), depot: areas.depot || null, free: P.cam.free };
      });
      ok(rg.baked && rg.cull, `[${tag}] the ground under the free camera is baked and the culling rect covers it`, rg);
      ok(rg.rep >= 0 && Math.abs(rg.rep - rg.fromCam) <= 8 && Math.abs(rg.fromChief - rg.fromCam) > 300, `[${tag}] Residency measures its areas from the free camera (the depot's gap ${rg.rep}: ${rg.fromCam} from the camera, ${rg.fromChief} from the chief)`, rg);
      // the chief's seated / social sheet (chief2) is let go while the camera is far from him, asked for again near him
      const sh = await page.evaluate(() => {
        const R = window.__FV_Res, P = window.__FV.scene.v42.pilot, k = P.sheetKey(), tex = window.__FV.game.textures;
        const far = { k, pinned: k ? R.pinned(k) : null, loaded: k ? tex.exists(k) : null, seat: !!window.__FV.scene.player.seat };
        return far;
      });
      ok(!sh.k || (!sh.pinned && (!sh.loaded || sh.seat)), `[${tag}] far from the chief his chief2 sheet is not pinned (and gone unless he sits in it)`, sh);
      // ---- a tap on a resident still reaches them (and does not pan)
      const tr = await page.evaluate(() => {
        const gs = window.__FV.scene, ui = window.__FV.game.scene.getScene('UI'), L = gs.life;
        const vis = (r) => !r.lod && r.sprite.visible && !r.isPet && r.key !== 'pet_dog';
        const pick = () => L.residents.find((r) => { if (!vis(r)) return false; const sp = ui.worldToScreen(r.x, r.y + (r.headTop || -60) / 2); return sp.x > 120 && sp.x < ui.W - 160 && sp.y > 560 && sp.y < ui.H - 380; });
        let r = pick();
        if (!r) {
          // (look around to where people are: the one nearest the chief; the residents far from the view rest in LOD)
          const p = gs.player;
          const c = L.residents.filter((q) => !q.isPet && q.key !== 'pet_dog').sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0];
          if (!c) return { none: true, n: L.residents.length };
          window.__FV.v42.pilotCam('to', c.x, c.y - 40);
          window.__settle(1.5);
          r = pick();
        }
        if (!r) return { none: true };
        const sp = ui.worldToScreen(r.x, r.y + (r.headTop || -60) / 2);
        const real = L.tap.bind(L);
        window.__tapped = null;
        L.tap = (x, y) => { const got = real(x, y); window.__tapped = got ? got.key || got.name || 'yes' : null; return got; };
        return { key: r.key, sp };
      });
      if (tr.none) ok(false, `[${tag}] a resident on screen to tap`, tr);
      else {
        const c0 = (await pr(page)).ct;
        await tapL(page, tr.sp.x, tr.sp.y);
        const after = await page.evaluate(() => ({ tapped: window.__tapped, on: window.__FV.scene.v42.pilot.on, ct: window.__FV.scene.camTarget }));
        ok(after.tapped === tr.key && after.on && near(after.ct.x, c0.x, 1) && near(after.ct.y, c0.y, 1), `[${tag}] a tap on a resident still reaches them (${tr.key}); 관망 stays on, the camera does not move`, { tr, after, c0 });
        // ((v4.3 step B, TX-a) the 「수다 떨기」 pill a resident with a persona card shows under their feet goes too (UI's, not
        //  ResidentChat's: there is no residentChat.hide), at once: else the pinch's first finger below can land on it, open
        //  the chat sheet and pause the village — every check after it then failed on a still game (npc_kid_boy, 11 FAILs))
        await page.evaluate(() => { const gs = window.__FV.scene, ui = window.__FV.game.scene.getScene('UI'); if (gs.residentChat && gs.residentChat.hide) try { gs.residentChat.hide(); } catch (e) { /* */ } if (ui && ui.hideChatButton) try { ui.hideChatButton(); if (ui.chatBtn) ui.chatBtn.setVisible(false); } catch (e) { /* */ } });
      }
      // ---- a pinch zooms, 관망 stays on, the leftover finger does not pan until lifted
      const pz = await page.evaluate(() => {
        const gs = window.__FV.scene, z0 = gs.zoomTarget, T = window.__T;
        T.down(1, 300, 900); T.down(2, 420, 900); window.__step.run(1 / 60);
        for (let i = 1; i <= 10; i++) { T.move(1, 300 - 8 * i, 900); T.move(2, 420 + 8 * i, 900); window.__step.run(1 / 60); }
        const z1 = gs.zoomTarget, ct1 = { x: gs.camTarget.x, y: gs.camTarget.y };
        T.up(1); window.__step.run(1 / 60);
        T.move(2, 200, 700); window.__step.run(5 / 60);
        const ct2 = { x: gs.camTarget.x, y: gs.camTarget.y };
        T.up(2); window.__step.run(5 / 60);
        return { z0, z1, on: gs.v42.pilot.on, leftover: Math.hypot(ct2.x - ct1.x, ct2.y - ct1.y) };
      });
      ok(pz.z1 > pz.z0 * 1.2 && pz.on, `[${tag}] a pinch zooms during 관망 (${pz.z0.toFixed(2)} -> ${pz.z1.toFixed(2)}), 관망 stays on`, pz);
      ok(pz.leftover < 2, `[${tag}] the finger left after a pinch does not pan until lifted`, pz);
      // ((review F1) the first finger panned 30 px, then the second lands and both hold still: no slide (it was 48-139 px)
      const pd = await page.evaluate(() => {
        const gs = window.__FV.scene, P = gs.v42.pilot, T = window.__T, S = window.__step, ct = gs.camTarget;
        T.down(1, 300, 900); S.run(1 / 60);
        for (let i = 1; i <= 3; i++) { T.move(1, 300 - 10 * i, 900); S.run(1 / 60); }
        const c0 = { x: ct.x, y: ct.y }, panned = !!P.cam.free;
        T.down(2, 520, 900);
        for (let i = 0; i < 30; i++) S.run(1 / 60);
        const c1 = { x: ct.x, y: ct.y };
        T.up(1); T.up(2); S.run(0.3);
        const c2 = { x: ct.x, y: ct.y };
        return { panned, still: +Math.hypot(c1.x - c0.x, c1.y - c0.y).toFixed(2), afterLift: +Math.hypot(c2.x - c1.x, c2.y - c1.y).toFixed(2), on: P.on };
      });
      ok(pd.panned && pd.on && pd.still < 2 && pd.afterLift < 2, `[${tag}] a pinch after the first finger panned 30 px: the camera holds still (${pd.still} px in 0.5 s, ${pd.afterLift} px after the lift)`, pd);
      // ((review F12) a drag shorter than the slop is a tap (no pan); a drag that starts on the zoom button does not pan
      const sb = await page.evaluate(() => {
        const gs = window.__FV.scene, P = gs.v42.pilot, T = window.__T, S = window.__step, ui = window.__FV.game.scene.getScene('UI');
        P.cam.attach(); S.run(1.5);
        T.down(3, 360, 1000); S.run(1 / 60); T.move(3, 372, 1000); S.run(1 / 60); T.up(3); S.run(0.2);
        const shortPanned = !!P.cam.free;
        const zb = ui.zoomInBtn;
        let joy = false;
        T.down(4, zb.x, zb.y); S.run(1 / 60);
        for (let i = 1; i <= 10; i++) { T.move(4, zb.x - 30 * i, zb.y - 20 * i); S.run(1 / 60); joy = joy || ui.joyBase.visible; }
        T.up(4); S.run(0.2);
        return { shortPanned, hudPanned: !!P.cam.free, joy, on: P.on };
      });
      ok(!sb.shortPanned && !sb.hudPanned && !sb.joy && sb.on, `[${tag}] a 12 px drag is a tap and a drag from the zoom button looks nowhere (no pan, no joystick)`, sb);
      // ((review F2) fast pans: the ground keeps up (frames drawn every step; the share of frames with an unbaked tile in
      //  view, the worst share of the view missing, the tiles baked in one frame)
      const fg = await page.evaluate(() => {
        const gs = window.__FV.scene, P = gs.v42.pilot, S = window.__step, G = gs.ground, cam = gs.cameras.main, TW = 510;
        // (the tiles baked in one update of the ground — one frame — and their cost here; SwiftShader on a shared CPU is
        //  far slower than a phone's GPU upload, so the count is the measure, the ms are for the record)
        const realB = G.bakeInto, realU = G.update;
        let n = 0, ms = 0, maxN = 0, maxMs = 0, sumMs = 0, bakes = 0, upd = 0;
        G.bakeInto = function (...a) { const t0 = performance.now(); const r = realB.apply(this, a); ms += performance.now() - t0; n++; return r; };
        G.update = function (dt) { n = 0; ms = 0; const r = realU.call(this, dt); maxN = Math.max(maxN, n); maxMs = Math.max(maxMs, ms); sumMs += ms; bakes += n; upd++; return r; };
        const missing = () => {
          const z = Math.max(0.05, cam.zoom || 1), w = cam.width / z, h = cam.height / z;
          const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
          const v = { x: Math.max(G.X0, cx - w / 2), right: Math.min(G.W, cx + w / 2), y: Math.max(0, cy - h / 2), bottom: Math.min(G.H, cy + h / 2) };
          const lv = G.level, T = TW << lv, have = new Set();
          for (const s of G.slots) if (s.id >= 0 && s.lv === lv) have.add(s.tx + ',' + s.ty);
          let need = 0, miss = 0;
          for (let ty = Math.floor(v.y / T); ty * T < v.bottom; ty++) for (let tx = Math.floor(v.x / T); tx * T < v.right; tx++) { need++; if (!have.has(tx + ',' + ty)) miss++; }
          return need ? miss / need : 0;
        };
        const res = [];
        for (const [sp, z, y] of [[3000, 1.2, 1500], [3000, 0.7, 1700]]) {
          window.__FV.zoom(z); P.cam.attach(); S.run(0.5);
          window.__FV.v42.pilotCam('to', 300, y);
          for (let i = 0; i < 30; i++) { S.run(0.1); S.frame(); }
          let frames = 0, holes = 0, worst = 0;
          maxN = 0; maxMs = 0; sumMs = 0; bakes = 0; upd = 0;
          for (let i = 0; i < 160; i++) {
            const f = P.cam.free, x0 = f.x;
            // (one game frame: the finger's move, then a drawn frame)
            window.__FV.v42.pilotCam('by', sp / 60, 0);
            S.frame();
            const m = missing();
            frames++; if (m > 0) holes++; worst = Math.max(worst, m);
            if (f.x - x0 < 0.5) break;
          }
          res.push({ sp, z, frames, holes, share: +(holes / frames).toFixed(3), worst: +worst.toFixed(2), bakes, maxBakesAFrame: maxN, bakesAFrame: +(bakes / Math.max(1, upd)).toFixed(2), msABake: +(sumMs / Math.max(1, bakes)).toFixed(1), slots: G.slots.length });
        }
        G.bakeInto = realB; G.update = realU;
        window.__FV.zoom(0.9); P.cam.attach(); S.run(1);
        return res;
      });
      for (const r of fg) {
        ok(r.frames >= 60 && r.share <= 0.05 && r.maxBakesAFrame <= 2, `[${tag}] a ${r.sp} px/s pan at zoom ${r.z}: unbaked ground in ${r.holes} of ${r.frames} frames (worst ${Math.round(r.worst * 100)} % of the view); at most ${r.maxBakesAFrame} tiles in one frame (the walking ceiling), ${r.bakesAFrame} a frame on average (${r.bakes} tiles, ${r.msABake} ms a tile on this machine)`, r);
      }
      // back out a little (the pinch zoomed in) and pan far again for the chip
      await page.evaluate(() => { window.__FV.zoom(0.9); window.__step.run(0.5); window.__FV.v42.pilotCam('to', window.__FV.scene.player.x + 1400, window.__FV.scene.player.y + 900); window.__step.run(0.5); });
    }
    // ---- 「촌장님 보기」 glides back to the chief
    const c = await hudXY(page, 'backChip');
    ok(c.v, `[${tag}] the chip is there to tap`, c);
    const g0 = await pr(page);
    const dist0 = Math.hypot(g0.ct.x - g0.chief.x, g0.ct.y - (g0.chief.y - 30));
    await tapL(page, c.x, c.y);
    const g1 = await pr(page);
    const dist1 = Math.hypot(g1.ct.x - g1.chief.x, g1.ct.y - (g1.chief.y - 30));
    ok(!g1.free && g1.on && g1.camGlide && g1.hud.back === null && g1.hud.panHint === null, `[${tag}] 「${o.back}」: the camera is the chief's again, 관망 stays on (no hint again)`, g1);
    ok(dist1 > dist0 * 0.55 && dist1 < dist0, `[${tag}] it glides (after 4 frames ${Math.round(dist1)} of ${Math.round(dist0)} px still to go: no jump)`, { dist0, dist1 });
    await run(page, 2.5);
    const g2 = await pr(page);
    const dist2 = Math.hypot(g2.ct.x - g2.chief.x, g2.ct.y - (g2.chief.y - 30));
    ok(dist2 < 90 || g2.camFocus, `[${tag}] …and is with the chief after 2.5 s (${Math.round(dist2)} px)`, g2);
    const sh2 = await page.evaluate(() => { const R = window.__FV_Res, P = window.__FV.scene.v42.pilot, k = P.sheetKey(); return { k, pinned: k ? R.pinned(k) : null }; });
    ok(!sh2.k || sh2.pinned, `[${tag}] back with the chief his chief2 sheet is pinned again`, sh2);
    await shot(page, tag + '_3_after_chip');
    // ---- the 관망 button ends it (pan away first: the camera glides back)
    await page.evaluate(() => { for (let k = 0; k < 2; k++) window.__T.drag(600, 1100, 200, 700, 14); window.__step.run(0.6); });
    const h0 = await pr(page);
    const hd0 = Math.hypot(h0.ct.x - h0.chief.x, h0.ct.y - (h0.chief.y - 30));
    await tapL(page, b.x, b.y);
    const h1 = await pr(page);
    const hd1 = Math.hypot(h1.ct.x - h1.chief.x, h1.ct.y - (h1.chief.y - 30));
    ok(!h1.on && !h1.free && !h1.hud.obsOn && h1.hud.stop === null && h1.toast === o.backToast, `[${tag}] the 관망 button ends 관망: unlit, no 「${o.stop}」, toast 「${o.backToast}」`, h1);
    ok(h0.free && hd1 > hd0 * 0.55 && hd1 < hd0, `[${tag}] the camera glides back to the chief (${Math.round(hd1)} of ${Math.round(hd0)} px to go after 4 frames)`, { hd0, hd1 });
    await run(page, 2.5);
    const h2 = await pr(page);
    const hd2 = Math.hypot(h2.ct.x - h2.chief.x, h2.ct.y - (h2.chief.y - 30));
    ok(hd2 < 90, `[${tag}] …and follows the chief again (${Math.round(hd2)} px)`, h2);
    await shot(page, tag + '_4_ended');
    if (o.full) {
      // ---- after 관망 a finger steers the chief again
      const j = await page.evaluate(() => { const gs = window.__FV.scene, p = gs.player, x0 = p.x, y0 = p.y; const r = window.__T.drag(360, 1000, 460, 1000, 10, true); window.__step.run(0.5); const moved = Math.hypot(p.x - x0, p.y - y0); window.__T.up(9); window.__step.run(0.1); return { joy: r.joy, moved }; });
      ok(j.joy && j.moved > 40, `[${tag}] after 관망 the finger is the joystick again (the chief walked ${Math.round(j.moved)} px)`, j);
      // ---- the hint shows once
      await tapL(page, b.x, b.y);
      await run(page, 0.3);
      const k2 = await pr(page);
      ok(k2.on && k2.hud.hint === o.hint && k2.hud.panHint === null, `[${tag}] the second 관망: no look-around hint (it was once)`, k2.hud);
      await tapL(page, b.x, b.y);
      await run(page, 0.3);
      // ---- the auto-start countdown: any touch stops it; an auto-started 관망 is not ended by a tap
      const a = await page.evaluate(() => { window.__FV_PILOT_AUTO = true; window.__FV.v42.settings({ observeAfter: 30 }); window.__step.run(31); const P = window.__FV.scene.v42.pilot; return { cd: P.countdown, on: P.on }; });
      const a1 = await pr(page);
      ok(a.cd > 0 && !a.on && a1.hud.count, `[${tag}] 30 s untouched: the countdown chip`, { a, count: a1.hud.count });
      await tapL(page, 360, 1000);
      const a2 = await pr(page);
      ok(a2.countdown === 0 && !a2.on && !a2.hud.count, `[${tag}] a touch stops the countdown`, a2);
      await run(page, 35);
      const a3 = await pr(page);
      ok(a3.on, `[${tag}] untouched again: 관망 starts by itself`, a3);
      await tapL(page, 360, 1000);
      await page.evaluate(() => window.__T.drag(500, 1000, 300, 900, 10));
      const a4 = await pr(page);
      ok(a4.on, `[${tag}] an auto-started 관망: a tap and a drag on the village do not end it`, a4);
      await tapL(page, b.x, b.y);
      const a5 = await pr(page);
      ok(!a5.on, `[${tag}] only the button does`, a5);
      await page.evaluate(() => { window.__FV_PILOT_AUTO = false; window.__FV.v42.settings({ observeAfter: 60 }); });
      // ((review F5) a rank ceremony that starts while the camera looks around: the camera comes back and shows its square
      //  (before, its focus was dropped and the camera glided to the chief, 1,400 px from the hall)
      await tapL(page, b.x, b.y);
      const cer = await page.evaluate(() => {
        const gs = window.__FV.scene, P = gs.v42.pilot, S = window.__step, R = gs.v4 && gs.v4.rank;
        if (!R || !R.ceremony) return { none: true };
        window.__FV.v42.pilotCam('to', gs.player.x + 1800, gs.player.y + 900);
        S.run(0.3);
        const wasFree = !!P.cam.free;
        R.level = 1; R.ceremony(false);
        S.run(3);
        const ct = gs.camTarget, fx = R.atHall ? R.cx + 60 : R.cx + 120, fy = R.atHall ? R.cy - 160 : R.cy + 80;
        const r = { wasFree, on: P.on, free: !!P.cam.free, focus: !!gs.camFocus, toSquare: Math.round(Math.hypot(ct.x - fx, ct.y - fy)), atHall: R.atHall };
        // (to its end: the hall half then the station half)
        S.run(R.cLen + 1);
        r.over = !R.ceremonyOn;
        return r;
      });
      ok(cer.none || (cer.wasFree && cer.on && !cer.free && cer.focus && cer.toSquare < 150 && cer.over), `[${tag}] a rank ceremony while looking around: the camera shows its square (${cer.toSquare} px from it after 3 s)`, cer);
      await tapL(page, b.x, b.y);
    }
    if (o.fit) {
      // ---- the labels fit a small screen
      const f = await page.evaluate(() => {
        const ui = window.__FV.game.scene.getScene('UI'), h = ui.hud42, P = window.__FV.scene.v42.pilot;
        P.start('test'); window.__FV.v42.pilotCam('by', 600, 400); window.__step.run(0.3);
        h.update(0);
        const bw = h.backBg.displayWidth, cw = h.obsBg.displayWidth, btn = h.obsBtn, hw = h.hintBg.displayWidth;
        // (the pill's own rect: a container's bounds count its text only, not the drawn pill)
        const L = h.obsLab, lx = btn.x + L.x, ly = btn.y + L.y;
        const lab = { left: lx - L.width / 2, right: lx + L.width / 2, top: ly - L.height / 2, bottom: ly + L.height / 2, centerX: lx, centerY: ly };
        const zin = ui.zoomInBtn.getBounds();
        const r = { W: ui.W, back: [h.backChip.x - bw / 2, h.backChip.x + bw / 2], cap: [h.obsCap.x - cw / 2, h.obsCap.x + cw / 2], hint: [h.hintChip.x - hw / 2, h.hintChip.x + hw / 2], lab: [lab.left, lab.right, lab.bottom, lab.top], zoomInTop: zin.top, btn: [btn.x, btn.y], labFont: parseInt(h.obsLabText.style.fontSize, 10), labC: [lab.centerX, lab.centerY] };
        return r;
      });
      ok(f.back[0] >= 0 && f.back[1] <= f.W && f.cap[0] >= 0 && f.cap[1] <= f.W && f.hint[0] >= 0 && f.hint[1] <= f.W && f.lab[0] >= 0 && f.lab[1] <= f.btn[0] - 44 && f.lab[2] < f.zoomInTop, `[${tag}] the chip, the hint, the caption and 「${o.stop}」 (left of the button) fit the screen and clear the zoom button`, f);
      ok(f.labFont >= 22 && f.lab[2] - f.lab[3] >= 38, `[${tag}] 「${o.stop}」 reads on a phone (${f.labFont} px on a ${Math.round(f.lab[2] - f.lab[3])} px pill)`, f);
      // ((review F7) the pill is a way out too)
      await tapL(page, f.labC[0], f.labC[1]);
      const pill = await pr(page);
      ok(!pill.on && !pill.free, `[${tag}] a tap on 「${o.stop}」 ends 관망`, pill);
    }
    ok(log.errors.length === 0, `[${tag}] 0 page errors`, log.errors.slice(0, 4));
    errors.push(...log.errors);
  } finally { await page.context().close(); }
}

// ===================================================================================== B: desktop
async function desktopFlow() {
  const tag = 'desktop';
  const { page, log } = await boot({ viewport: { width: 1280, height: 800 }, lang: 'ko', mobile: false });
  try {
    const css = (x, y) => page.evaluate(([a, b]) => window.__T.cl(a, b), [x, y]);
    const b = await hudXY(page, 'obsBtn');
    let [bx, by] = await css(b.x, b.y);
    await page.mouse.click(bx, by);
    await run(page, 0.5);
    const s0 = await pr(page);
    ok(s0.on && s0.hud.obsOn, `[${tag}] a click on the 관망 button turns it on`, s0.hud);
    // mouse drag
    const ct0 = s0.ct, z = s0.zoomCur;
    const [x0, y0] = await css(500, 700), [x1, y1] = await css(300, 600);
    await page.mouse.move(x0, y0); await page.mouse.down(); await run(page, 1 / 60);
    for (let i = 1; i <= 16; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 16, y0 + (y1 - y0) * i / 16); await run(page, 1 / 60); }
    await run(page, 4 / 60); await page.mouse.up(); await run(page, 0.1);
    const s1 = await pr(page);
    const dx = s1.free ? s1.free.x - ct0.x : 0, ex = 200 / z;
    ok(s1.on && s1.free && dx >= ex * 0.9 && dx <= ex * 1.7 && !s1.joy, `[${tag}] a mouse drag pans (${Math.round(dx)} world px for ${Math.round(ex)}), no joystick, 관망 on`, { s1, ex });
    // arrow keys pan; the chief is not steered by them
    const k = await page.evaluate(async () => { const P = window.__FV.scene.v42.pilot; return { x: P.cam.free.x, pv: [P.vec.x, P.vec.y] }; });
    await page.keyboard.down('ArrowRight');
    await run(page, 0.5);
    const kv = await page.evaluate(() => { const I = window.__FV_Input, P = window.__FV.scene.v42.pilot; return { vec: [I.vec.x, I.vec.y], pilot: [P.vec.x, P.vec.y], keys: [I.panKeys.x, I.panKeys.y], x: P.cam.free.x, on: P.on }; });
    await page.keyboard.up('ArrowRight');
    await run(page, 0.1);
    const zk = (await pr(page)).zoomCur;
    const kdx = kv.x - k.x, kex = 900 / zk * 0.5;
    ok(kv.on && kdx > kex * 0.7 && kdx < kex * 1.3, `[${tag}] the arrow key pans (${Math.round(kdx)} world px in 0.5 s, about ${Math.round(kex)}), 관망 stays on`, { k, kv, kex });
    // (Input.vec is the pilot's vector of the frame before: within a frame's turn of his)
    ok(kv.keys[0] === 1 && Math.abs(kv.vec[0] - kv.pilot[0]) < 0.15 && Math.abs(kv.vec[1] - kv.pilot[1]) < 0.15, `[${tag}] the key goes to the look-around; the chief is steered by the pilot, not by the key`, kv);
    // wheel zoom
    const zw0 = (await pr(page)).zoom;
    const [wx, wy] = await css(360, 700);
    await page.mouse.move(wx, wy);
    await page.mouse.wheel(0, -200);
    await run(page, 0.3);
    const zw1 = await pr(page);
    ok(zw1.zoom > zw0 && zw1.on, `[${tag}] the wheel zooms during 관망 (${zw0} -> ${zw1.zoom})`, zw1);
    // the chip and the button by mouse
    const c = await hudXY(page, 'backChip');
    const [cx, cy] = await css(c.x, c.y);
    await page.mouse.click(cx, cy);
    await run(page, 0.1);
    const s2 = await pr(page);
    ok(c.v && !s2.free && s2.on, `[${tag}] a click on 「촌장님 보기」 brings the camera back`, s2);
    [bx, by] = await css(b.x, b.y);
    await page.mouse.click(bx, by);
    await run(page, 0.2);
    const s3 = await pr(page);
    ok(!s3.on, `[${tag}] a click on the 관망 button ends it`, s3);
    ok(log.errors.length === 0, `[${tag}] 0 page errors`, log.errors.slice(0, 4));
    errors.push(...log.errors);
  } finally { await page.context().close(); }
}

// ===================================================================================== D: the chief seated, far away
// ((v4.3 review F3) his chief2 sheet (3 MiB, 관망's seated / social anims) while the player looks around far from him:
//  let go even though he sits in it (Residency.evict(k, true): his sprite far off the view is not 'shown'), kept gone
//  while the view wobbles 600 – 900 px from him, asked for again before he is on screen; back with him he sits again)
async function seatedFlow() {
  const tag = 'seated';
  const { page, log } = await boot({ viewport: { width: 412, height: 915 }, lang: 'ko', save: OFFICE_SAVE });
  // game time with drawn frames (the camera's scroll — what isNearView reads — moves on drawn frames) and real time
  // between chunks (an on-demand sheet arrives through the loader)
  const settle = async (sec, fn, arg) => {
    for (let t = 0; t < sec; t += 0.5) {
      const r = await page.evaluate(([f, a]) => { window.__settle(0.5); const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return f ? (0, eval)('(' + f + ')')(a) : false; }, [fn ? fn.toString() : null, arg]);
      if (r) return r;
      await sleep(120);
    }
    return fn ? page.evaluate(([f, a]) => (0, eval)('(' + f + ')')(a), [fn.toString(), arg]) : null;
  };
  try {
    const set = await page.evaluate(() => {
      const gs = window.__FV.scene, P = gs.v42.pilot, S = window.__step;
      let B = gs.v42.office && gs.v42.office.building;
      if (!B) { window.__FV.v42.office({ build: true }); window.__settle(1); B = gs.v42.office && gs.v42.office.building; }
      if (!B || !B.cw || !P.available) return { none: true, office: !!B, avail: P.available };
      P.start('test'); S.run(0.5);
      P.begin('office');
      window.__FV.teleport(B.spots.deskPad.x, B.spots.deskPad.y);
      P.ri = P.route.length; P.arrived = true; P.pose(P.act);
      // (he stays at his desk for the test: the chooser holds off — its own minimum time is shorter than this case)
      P.decT = 1e9;
      window.__seat = () => {
        const R = window.__FV_Res, p = gs.player, k = P.sheetKey(), st = P.state(), tex = window.__FV.game.textures;
        return { k, act: P.act && P.act.act, seat: !!p.seat, sits: /^(sit|doze)/.test(p.animRes || ''), anim: p.animRes, loaded: k ? tex.exists(k) : null, asked: k ? window.__FV_Assets.demanded.has(k) : null, pinned: k ? R.pinned(k) : null, away: st.sheetAway, drops: st.sheetDrops, loads: R.loads, onScreen: gs.isOnScreen(p.x, p.y, 0), free: !!P.cam.free,
          officeOpen: !!B.cw.revealed, inside: tex.exists('office_bld@inside') };
      };
      return { k: P.sheetKey(), act: P.act && P.act.act, seat: !!gs.player.seat };
    });
    if (set.none) { ok(false, `[${tag}] the v4.2 office save: the office and 관망`, set); return; }
    const s0 = await settle(20, () => { const s = window.__seat(); return s.loaded && s.sits ? s : false; });
    ok(s0 && s0.seat && s0.sits && s0.loaded, `[${tag}] 관망: the chief sits at his office desk in his chief2 sheet (${set.k})`, s0 || (await page.evaluate(() => window.__seat())));
    // the camera far away (2,600 px east, 1,400 south): the sheet goes though he still sits in it
    await page.evaluate(() => { const p = window.__FV.scene.player; window.__FV.v42.pilotCam('to', p.x + 2600, p.y + 1400); });
    const s1 = await settle(6, () => { const s = window.__seat(); return !s.loaded ? s : false; });
    ok(s1 && s1.seat && s1.away && !s1.loaded && !s1.pinned && s1.drops >= 1, `[${tag}] looking around far away: his chief2 sheet is let go though he sits in it (3 MiB back)`, s1 || (await page.evaluate(() => window.__seat())));
    // ((v4.3) the office nobody sees closes and its inside page goes too (it kept ~12 MiB open around him)
    const o1 = await settle(4, () => { const s = window.__seat(); return !s.officeOpen && !s.inside ? s : false; });
    ok(o1 && !o1.officeOpen && !o1.inside, `[${tag}] …and the office nobody sees is closed, its inside page gone`, o1 || (await page.evaluate(() => window.__seat())));
    // the view wobbles 650 – 850 px from him (between ask-again 600 and let-go 900): the sheet stays away
    const w = await page.evaluate(() => {
      const gs = window.__FV.scene, P = gs.v42.pilot, p = gs.player, cam = gs.cameras.main, R = window.__FV_Res;
      const hw = cam.width / Math.max(0.05, cam.zoom) / 2;
      // (his sheet only: other areas' pages may come and go as the view moves)
      const k0 = P.sheetKey(), A = window.__FV_Assets, tex = window.__FV.game.textures;
      let asked = 0;
      for (let k = 0; k < 12; k++) { window.__FV.v42.pilotCam('to', p.x + hw + (k % 2 ? 650 : 850), p.y); for (let i = 0; i < 5; i++) { window.__settle(0.1); if (A.demanded.has(k0) || tex.exists(k0)) asked++; } }
      return Object.assign(window.__seat(), { askedSteps: asked, hw: Math.round(hw), gap: Math.round(Math.abs(P.cam.free.x - p.x) - hw) });
    });
    ok(w.away && !w.loaded && !w.asked && w.askedSteps === 0, `[${tag}] the view wobbling 650 – 850 px from him (6 s) never asks for his sheet again (${w.askedSteps} of 60 steps)`, w);
    // 550 px from him (not yet on screen): asked for at once
    const s2 = await page.evaluate(() => { const gs = window.__FV.scene, p = gs.player, cam = gs.cameras.main, hw = cam.width / Math.max(0.05, cam.zoom) / 2; window.__FV.v42.pilotCam('to', p.x + hw + 550, p.y); window.__settle(0.3); return window.__seat(); });
    ok(!s2.away && !s2.onScreen && (s2.asked || s2.loaded), `[${tag}] 550 px from him, before he is on screen: the sheet is asked for again`, s2);
    // 「촌장님 보기」: back with him, he sits (never standing inside the desk)
    await page.evaluate(() => window.__FV.v42.pilotCam('attach'));
    const s3 = await settle(15, () => { const s = window.__seat(); return s.loaded && s.sits && s.onScreen && s.officeOpen && s.inside ? s : false; });
    ok(s3 && s3.seat && s3.sits && s3.officeOpen && s3.inside, `[${tag}] back with the chief: he sits at his desk again in his sheet, the office open with its inside`, s3 || (await page.evaluate(() => window.__seat())));
    ok(log.errors.length === 0, `[${tag}] 0 page errors`, log.errors.slice(0, 4));
    errors.push(...log.errors);
  } finally { await page.context().close(); }
}

try {
  if (!args.includes('--no-seated')) { console.log('D: the chief seated far away (v4.2 office save)'); await seatedFlow(); }
  console.log('A: phone 412 x 915, ko');
  await phoneFlow({ tag: 'ko412', viewport: { width: 412, height: 915 }, lang: 'ko', full: true, fit: true, stop: '관망 끄기', back: '촌장님 보기', panHint: '손가락으로 마을을 둘러보세요 · 쌍안경을 누르면 끝나요', hint: '쌍안경을 누르면 관망이 끝나요', backToast: '다시 조종해요' });
  if (!args.includes('--no-desktop')) { console.log('B: desktop 1280 x 800, mouse and keys'); await desktopFlow(); }
  if (!args.includes('--no-en')) {
    console.log('C: phone 360 x 640, en');
    await phoneFlow({ tag: 'en360', viewport: { width: 360, height: 640 }, lang: 'en', full: false, fit: true, stop: 'Stop watching', back: 'Find the chief', panHint: 'Drag to look around the village · tap the binoculars to stop', hint: 'Tap the binoculars to stop watching', backToast: 'You have control' });
  }
} catch (e) { fail++; console.log('FATAL', (e && e.stack) || e); }
console.log(`\nwatchpan: ${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
