// (v4.2.0.1, the designer's "건물 안쪽에 있는 것들이 있는데 나중에 물건 쌓이거나 사람들이 있으면 안 보여") every paid pad
// — the pads that take the chief's coins: unlock / hire / 점원 / 짐꾼 / upgrades (가방 · 신발 · 가공소 2단 · 테이블 늘리기) /
// 사무실 직원 / 망루 / 배 / 승격식 / 화물칸 — can be seen wherever and whenever it stands:
//   - its name label and its price are fully readable at every sampled moment (nothing of the world drawn over them:
//     people, piles, buildings, the fog of a closed land, another pad's label)
//   - at least 75 % of its floor diamond shows at the worst sampled moment, counting everything that STAYS there
//     (buildings, props, crops, fences, trees, item piles at their size, a customer line, seated diners, a waiting
//     porter, the fog); a walker passing over it is not counted there (only in the mean, which is reported)
//   - its centre is walkable, and two paid pads standing at the same time never overlap (16 px apart)
//   - no pad's name label (its real text) lies on another pad's label or price, the pads still to come included
//   ('place:<pad>' rows: a pad's place measured in a save where it was bought already — the office's next hire pad,
//    the big restaurant's staff pad, the store clerk, the boat pad, the 승격식 at the hall — in that busier world)
// Where: a fresh game through the tutorial (the market clerk → the grill line → the forest → the 작업대 upgrades,
// pads as they appear) and every late save in fixtures/ (the pads standing there + every pad still to come whose place
// already exists, at that place: the same spot the game would give it). The game runs on the fixed-step clock; each
// group of pads is sampled every second for --samples seconds with the chief parked away from them.
//   node tools/test/padvis.mjs [--root <a frost-village dir>] [--only fresh,v42_village_late] [--samples 8] [--json out.json]
// (--root: run it against another build, e.g. a checkout of 4.2.0 — the layout this test was written to catch fails)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = arg('--root') ? path.resolve(arg('--root')) : undefined;
const N = Math.max(3, Number(arg('--samples')) || 8);
const ONLY = arg('--only') ? arg('--only').split(',') : null;
const LATE = ['v35_save_21min', 'v35_save_38min', 'v41_save_pure_25min', 'v41_save_pure_45min', 'v41_save_smart_25min', 'v41_save_smart_35min', 'v41_save_smart_46min', 'v42_save_office_ttal', 'v42_village_late'];
const SCEN = ['fresh'].concat(LATE, ['wait']).filter((s) => !ONLY || ONLY.includes(s));
// (the mean cover counts passers-by too: reported above meanWarn, never a failure — a lane crossing a pad is allowed,
//  its price and label stay on top)
const LIMIT = { decalWorst: 0.25, labelWorst: 0, priceWorst: 0, meanWarn: 0.15, gap: 16 };

let pass = 0, fail = 0;
const fails = [];
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; fails.push(msg); console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); } };

// ------------------------------------------------------------------------------------------------ page side
const PAGE = () => {
  const P = {};
  const G = (ax, ay, bx, by) => Math.hypot(ax - bx, 2 * (ay - by));
  const ids = new WeakMap();
  let nid = 1;
  const idOf = (o) => { let v = ids.get(o); if (!v) { v = nid++; ids.set(o, v); } return v; };
  P.last = new Map();       // object id -> [x, y] at the previous sample

  /** every paid pad standing now (the same list the game uses, or the 4.2.0 one) */
  P.livePads = () => {
    const gs = window.__FV.scene, out = [], pr = gs.progress, V = gs.v42;
    if (gs.paidPads) return gs.paidPads().filter((p) => p && p.active);
    for (const id in pr.pads) out.push(pr.pads[id]);
    for (const k in pr.upPads) out.push(pr.upPads[k]);
    if (V && V.lines) for (const id in V.lines.pads) out.push(V.lines.pads[id]);
    if (V && V.office && V.office.hirePad) out.push(V.office.hirePad);
    return out.filter((p) => p && p.active);
  };

  /** where every pad still to come stands in this world (its place exists): the game's own helpers (4.2.0.1) or the
   *  4.2.0 formulas */
  P.specs = async () => {
    const gs = window.__FV.scene, pr = gs.progress, V = gs.v42, LU = V && V.lines;
    const { WORLD, L4 } = await import('/fv/src/data/world.js');
    const PR = await import('/fv/src/systems/Progression.js');
    const { Porter } = await import('/fv/src/entities/Worker.js');
    const { DEPTH } = await import('/fv/src/systems/DepthSort.js');
    const isNew = !!DEPTH.PAD_PRICE;
    const out = [];
    const add = (id, p, o) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out.push(Object.assign({ id, x: Math.round(p.x), y: Math.round(p.y), sizeM: 1.9 }, o || {})); };
    const auto = new Set([].concat(...Object.values(PR.COMES_WITH || {})));
    for (const s of PR.STEPS) {
      if (pr.done[s.id] || auto.has(s.id)) continue;
      let p = null;
      try { p = pr.spotOf ? pr.spotOf(s) : (WORLD.pads[s.id] || (WORLD.pads2 && WORLD.pads2[s.id]) || (WORLD.pads35 && WORLD.pads35[s.id]) || gs.padSpot(s)); } catch (e) { p = null; }
      const la = pr.labelAtOf ? pr.labelAtOf(s) : s.type === 'stationPorter' ? ((WORLD.v4.square.labels && WORLD.v4.square.labels.porter) || [0, 64]) : s.type === 'restStaff' ? [150, 6] : undefined;
      add(s.id, p, { sizeM: s.type === 'rank' ? 2.1 : 1.9, labelAt: la });
    }
    const F = V && V.freight, Gr = gs.v4 && gs.v4.growth, R = gs.civic && gs.civic.restaurant;
    if (LU) {
      for (const line of ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse', 'toolsmith', 'cannery', 'dock']) {
        const src = gs.sourceById ? gs.sourceById(line) : gs.stations[line];
        if (!src || LU.p2.indexOf(line) >= 0) continue;
        if (LU.spotOf) add('p2_' + line, LU.spotOf('p2', line), { labelAt: (LU.spotOf('p2', line) || {}).labelAt });
        else if (src.outPad) { const h = Porter.homeFor(gs, src); add('p2_' + line, { x: h[0] + 34, y: h[1] + 30 }); }
      }
      for (const line of ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse']) {
        const st = gs.stations[line];
        if (!st || LU.up[line]) continue;
        if (LU.spotOf) add('st2_' + line, LU.spotOf('st2', line), { labelAt: (LU.spotOf('st2', line) || {}).labelAt });
        else add('st2_' + line, { x: st.x + (st.cfg.in[0] < 0 ? -1 : 1) * 30, y: st.y + 118 });
      }
      if (Gr && Gr.dock && F && !F.big) add('bigcar', LU.spotOf ? LU.spotOf('big') : { x: Gr.dock.x + 96, y: Gr.dock.y + 84 }, { labelAt: LU.spotOf ? (LU.spotOf('big') || {}).labelAt : undefined });
      const Dp = V.depot;
      if (Dp && Dp.built && Dp.sleighN < 2) { const st = (WORLD.v42.depot && WORLD.v42.depot.sleighStop) || [5, -5]; const [sx, sy] = L4(st[0] - 1.2, st[1] - 1.1); add('sleigh2', { x: sx, y: sy }); }
      if (R && R.enabled && R.setTables && R.tableLevel < R.maxTableLevel) add('tables' + (R.tableLevel + 1), R.tablesPadPos());
      if (R && R.enabled && !R.server2 && R.server2PadPos) add('srv2', R.server2PadPos());
    }
    // (v4.2.1 고기 통조림 기계: its pad beside the cannery's input, once that build has it)
    const MC = V && V.meatcan;
    if (MC && !MC.on && MC.cannery && MC.cannery() && MC.padPos) add('mcan', MC.padPos());
    const O = V && V.office;
    if (O && O.building && O.nextRole && O.nextRole()) add('staff_' + O.nextRole(), O.building.spots.hire);
    // the places of pads already bought here that come back or stood there earlier, measured in this (busier) world:
    // the office's hire pad, the big restaurant's staff pad, the store clerk's pad, the boat pad, the 승격식 at the hall
    if (O && O.building) add('place:staff_hire', O.building.spots.hire);
    if (R) add('place:rest_staff', R.hirePadPos ? R.hirePadPos() : R.staffSpot, { labelAt: isNew ? undefined : [150, 6] });
    if (gs.store) add('place:hire_clerk_store', gs.padSpot({ type: 'clerk', seller: 'store', id: 'hire_clerk_store' }));
    if (gs.boathouse) add('place:boat', gs.boathouse.boatPad);
    const H = gs.civic && gs.civic.hall;
    if (H) add('place:rank_eup', H.rankPadPos ? H.rankPadPos() : H.venue('rank'), { sizeM: 2.1 });
    // the same spot for several pads (a line's hire pads, 짐꾼 2 / 2단 sharing it): one entry
    const merged = [];
    for (const s of out) { const m = merged.find((q) => Math.abs(q.x - s.x) < 3 && Math.abs(q.y - s.y) < 3); if (m) m.id += '+' + s.id; else merged.push(s); }
    return { isNew, specs: merged, depth: { label: DEPTH.PAD_LABEL, price: DEPTH.PAD_PRICE || DEPTH.PAD_TEXT } };
  };

  /** the pads to sample: the live ones (their real label and price) + the specs not standing now */
  P.prepare = async (withSpecs) => {
    const gs = window.__FV.scene;
    const live = P.livePads();
    const S = withSpecs ? await P.specs() : { specs: [], isNew: !!(await import('/fv/src/systems/DepthSort.js')).DEPTH.PAD_PRICE };
    const D = (await import('/fv/src/systems/DepthSort.js')).DEPTH;
    const pads = [];
    for (const p of live) pads.push({ id: p.id, live: true, x: Math.round(p.x), y: Math.round(p.y), hw: p.pad.w / 2, ref: p });
    for (const s of S.specs) {
      if (pads.some((q) => Math.abs(q.x - s.x) < 3 && Math.abs(q.y - s.y) < 3)) continue;
      const la = s.labelAt || [0, -62];
      pads.push({ id: s.id, live: false, x: s.x, y: s.y, hw: 45.25 * s.sizeM, la, labelDepth: S.isNew ? D.PAD_LABEL + s.y * 0.1 : s.y + 2000, priceDepth: S.isNew ? D.PAD_PRICE : D.PAD_TEXT });
    }
    P.pads = pads;
    P.isNew = S.isNew;
    // live pads overlapping each other (one live paid pad per spot)
    const over = [];
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j], g = Math.abs(a.x - b.x) + 2 * Math.abs(a.y - b.y) - a.pad.w / 2 - b.pad.w / 2;
      if (g < 16) over.push(a.id + '~' + b.id + ' gap ' + Math.round(g));
    }
    return { n: pads.length, live: live.map((p) => p.id), over, blocked: pads.filter((p) => gs.collision.blocked(p.x, p.y, 16)).map((p) => p.id), isNew: S.isNew };
  };

  /** the real name labels (their text width) and prices of every pad in P.pads — a pad still to come is made for a
   *  moment at its spot and removed — : a label lying on another pad's label or price (pads at different spots) */
  P.labelClash = async () => {
    const gs = window.__FV.scene;
    const { UnlockPad } = await import('/fv/src/entities/UnlockPad.js');
    const { t } = await import('/fv/src/data/strings.js');
    const boxes = [], tmp = [], n0 = gs.padSpots ? gs.padSpots.length : 0;
    const box = (id, u) => { const b = u.label.getBounds(), c = u.costText.getBounds(), d = u.costCoin.getBounds(); boxes.push({ id, x: u.x, y: u.y, lab: [b.x, b.y, b.right, b.bottom], price: [Math.min(c.x, d.x), Math.min(c.y, d.y), Math.max(c.right, d.right), Math.max(c.bottom, d.bottom)] }); };
    for (const p of P.pads) {
      if (p.live) { box(p.id, p.ref); continue; }
      const id = p.id.split('+')[0];
      if (/^place:/.test(id)) continue;          // (the place of a pad bought here already: not standing with the others)
      const line = id.replace(/^(p2|st2)_/, '');
      const fn = /^p2_/.test(id) ? () => t('p2_pad', { item: t('p2Name_' + line) }) : /^st2_/.test(id) ? () => t('st2_pad', { st: t('line_' + line) })
        : id === 'bigcar' ? () => t('bigCar_pad') : id === 'sleigh2' ? () => t('sleigh2_pad') : /^tables/.test(id) ? () => t('tables_pad') : id === 'srv2' ? () => t('rest_server2') : id === 'mcan' ? () => t('mcan_pad')
          : /^staff_/.test(id) ? () => t('role_' + id.slice(6)) : null;
      const u = new UnlockPad(gs, '__pv_' + id, p.x, p.y, Object.assign({ kind: 'hire', cost: 1000, paid: 0, icon: 'ui_icon_lock', iconSize: 48, labelAt: p.la, sizeM: p.hw / 45.25 }, fn ? { labelFn: fn } : { label: id }));
      u.refresh(); tmp.push(u); box(p.id, u);
    }
    for (const u of tmp) { try { u.destroy(); } catch (e) { /* */ } }
    if (gs.padSpots) gs.padSpots.length = n0;     // (the spots they added to the residents' no-stand list: gone again)
    const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const out = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3) continue;
      const ll = ov(a.lab, b.lab), lp = ov(a.lab, b.price) + ov(a.price, b.lab);
      if (ll > 60 || lp > 0) out.push(`${a.id} ~ ${b.id}: label on label ${Math.round(ll)} px², label on price ${Math.round(lp)} px²`);
    }
    return out;
  };

  /** (final review) a label the game pulls in at the screen edge (UnlockPad keeps it on screen) never lands on another
   *  standing pad's label or price: the camera is held with each live pad just inside / just past the left and right
   *  edges, two frames run, and every pulled label is checked against the others (their real bounds) */
  P.pullClash = () => {
    const gs = window.__FV.scene, F = window.__FV, cam = gs.cameras.main;
    const live = P.livePads().filter((u) => u.label && u.labelBg);
    const out = new Set();
    const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const priceOf = (u) => { const c = u.costText.getBounds(), d = u.costCoin.getBounds(); const x = Math.min(c.x, d.x), y = Math.min(c.y, d.y); return { x, y, right: Math.max(c.right, d.right), bottom: Math.max(c.bottom, d.bottom) }; };
    for (const p of live) {
      for (const side of [-1, 1]) for (const e of [-30, 20, 90]) {
        const vw = cam.worldView.width;
        const cx = side > 0 ? p.x + e - vw / 2 : p.x - e + vw / 2;
        F.camera(cx, p.y);
        window.__step.frame(); window.__step.frame();
        const v = cam.worldView;
        const on = live.filter((u) => u.active && u.label.visible && u.x > v.x - 300 && u.x < v.right + 300);
        for (const a of on) {
          if (Math.abs(a.label.x - (a.x + (a.labelDx || 0))) < 1) continue;        // (not pulled)
          const la = a.label.getBounds();
          for (const b of on) {
            if (b === a || (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3)) continue;
            const ll = ov(la, b.label.getBounds()), lp = b.costText.visible ? ov(la, priceOf(b)) : 0;
            if (ll > 60 || lp > 0) out.add(`${a.id} (pulled ${Math.round(a.label.x - a.x - (a.labelDx || 0))} px) ~ ${b.id}: label on label ${Math.round(ll)} px², on price ${Math.round(lp)} px²`);
          }
        }
      }
    }
    F.camera();
    return [...out];
  };

  /** the boxes and sample points of a pad: floor diamond (25 points), price (15), label (21) */
  const geom = (p) => {
    const hw = p.hw, hh = hw / 2, decal = [];
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const dx = (i / 4) * hw, dy = (j / 4) * hh; if (Math.abs(dx) / hw + Math.abs(dy) / hh <= 0.95) decal.push([p.x + dx, p.y + dy]); }
    let pb, lb, pd, ld;
    if (p.live) {
      const u = p.ref;
      if (u.costText.visible) { const a = u.costText.getBounds(), b = u.costCoin.getBounds(); pb = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.right, b.right), Math.max(a.bottom, b.bottom)]; pd = Math.min(u.costText.depth, u.costCoin.depth); }
      const c = u.label.getBounds(); lb = [c.x, c.y, c.right, c.bottom]; ld = u.label.depth;
    } else {
      pb = [p.x - 48, p.y - 16, p.x + 48, p.y + 18]; pd = p.priceDepth;
      const lx = p.x + p.la[0], ly = p.y + p.la[1]; lb = [lx - 100, ly - 30, lx + 100, ly + 30]; ld = p.labelDepth;
    }
    const grid = (b, nx, ny, inset) => { const o = []; if (!b) return o; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) o.push([b[0] + inset + (b[2] - b[0] - 2 * inset) * (nx > 1 ? i / (nx - 1) : 0.5), b[1] + inset + (b[3] - b[1] - 2 * inset) * (ny > 1 ? j / (ny - 1) : 0.5)]); return o; };
    return { decal, price: grid(pb, 5, 3, 5), label: grid(lb, 7, 3, 6), pd, ld, box: [Math.min(p.x - hw, lb[0], pb ? pb[0] : 1e9), Math.min(p.y - hh, lb[1]), Math.max(p.x + hw, lb[2]), Math.max(p.y + hh, pb ? pb[3] : -1e9)] };
  };

  /** one sample: per pad, what covers its decal / price / label right now (and whether it stayed where it was) */
  P.sample = (score, only) => {
    const gs = window.__FV.scene, occ = gs.occlusion;
    const own = new Map();       // a pad's own pictures (label, price, badge, ring, the tool brought to it) -> its id
    for (const u of P.livePads().concat(gs.progress ? Object.values(gs.progress.upPads || {}) : [])) {
      for (const o of [u.label, u.costText, u.costCoin, u.maxBadge, u.pad && u.pad.img, u.pad && u.pad.icon, u.ring, u.ringBg, u.sparkle]) if (o && o !== 'none') own.set(o, u);
      if (u.itemStack) for (const it of u.itemStack.items || []) if (it.spr) own.set(it.spr, u);
    }
    const labels = new Map();
    for (const u of P.livePads()) labels.set(u.label, u.id);
    const dollImgs = new Set();
    const pool = gs.dollPool;
    if (pool) for (const d of pool.dolls) { const r = d.rig; if (r && r.imgs) for (const im of r.imgs) dollImgs.add(im); if (r && r.dot) dollImgs.add(r.dot); }
    const chief = gs.player && gs.player.sprite;
    const carried = new Set(((gs.player && gs.player.stack && gs.player.stack.items) || []).map((it) => it.spr).filter(Boolean));
    const G = P.pads.filter((p) => !only || only.includes(p.id)).map((p) => ({ p, g: geom(p) }));
    const X0 = Math.min(...G.map((q) => q.g.box[0])), Y0 = Math.min(...G.map((q) => q.g.box[1])), X1 = Math.max(...G.map((q) => q.g.box[2])), Y1 = Math.max(...G.map((q) => q.g.box[3]));
    const objs = [];
    for (const o of gs.children.list) {
      if (!o || !o.visible || dollImgs.has(o) || o === chief || carried.has(o)) continue;
      if (o.alpha !== undefined && o.alpha < 0.3) continue;
      const d = o.depth;
      if (!(d > -10000) || d >= 30000) continue;          // floor decals, shadows / flying items, FX, the night, bubbles, the HUD
      if (o.type === 'Graphics' || !o.getBounds) continue;
      const k = o.texture ? o.texture.key : '';
      if (/^fx_/.test(k)) continue;
      let b; try { b = o.getBounds(); } catch (e) { continue; }
      if (!b || !(b.width > 0) || b.right < X0 || b.x > X1 || b.bottom < Y0 || b.y > Y1) continue;
      objs.push({ o, b, d, id: idOf(o), x: o.x, y: o.y, lab: labels.get(o) || null, own: own.get(o) || null });
    }
    for (const dl of (pool ? pool.dolls : [])) {
      if (!(dl._visible && dl._alpha > 0.3 && dl.active)) continue;
      const w = 40 * dl.scaleX, h = 100 * dl.scaleY, lift = dl.lift || 0;
      const b = { x: dl.x - w / 2, y: dl.y - h - lift, right: dl.x + w / 2, bottom: dl.y - lift };
      if (b.right < X0 || b.x > X1 || b.bottom < Y0 || b.y > Y1) continue;
      objs.push({ o: null, b, d: dl.y, id: idOf(dl), x: dl.x, y: dl.y, doll: dl.key || 'person' });
    }
    const solid = (e, x, y) => {
      const b = e.b;
      if (x < b.x || x > b.right || y < b.y || y > b.bottom) return false;
      const o = e.o;
      if (o && (o.type === 'Image' || o.type === 'Sprite') && occ && occ.solid) { try { return occ.solid(o, x, y); } catch (er) { return true; } }
      return true;
    };
    const name = (e) => { if (e.doll) return 'person:' + e.doll; const o = e.o; if (e.lab) return 'label:' + e.lab; if (o.type === 'Text') return 'text:' + String(o.text).slice(0, 14); if (o.type === 'Container') { const c = (o.list || []).find((q) => q.texture); return 'tag:' + (c ? c.texture.key : ''); } const f = o.frame && o.frame.name !== '__BASE' ? '/' + o.frame.name : ''; return (o.texture ? o.texture.key : o.type) + f; };
    const res = {};
    for (const { p, g } of G) {
      let stay = 0, all = 0, pc = 0, lc = 0;
      const dc = new Array(g.decal.length).fill(0), ds = new Array(g.decal.length).fill(0), pcv = new Array(g.price.length).fill(0), lcv = new Array(g.label.length).fill(0);
      const by = {};
      for (const e of objs) {
        // (its own pictures; a pad still to come that appeared meanwhile on its spot is that pad)
        if (e.own && (e.own.id === p.id || (Math.abs(e.own.x - p.x) < 3 && Math.abs(e.own.y - p.y) < 3))) continue;
        const prev = P.last.get(e.id), still = !!prev && Math.abs(prev[0] - e.x) < 6 && Math.abs(prev[1] - e.y) < 6;
        // the floor diamond: things standing on / in front of it (drawn above the floor; labels are checked below)
        if (!e.lab) {
          let n = 0;
          g.decal.forEach((q, i) => { if (solid(e, q[0], q[1])) { dc[i] = 1; if (still) ds[i] = 1; n++; } });
          if (n) { const k = name(e); const r = by[k] || (by[k] = { n: 0, still: 0 }); r.n = Math.max(r.n, n); if (still) r.still = Math.max(r.still, n); }
        }
        // price and label: anything of the world drawn over them
        if (g.price.length && e.d > g.pd) g.price.forEach((q, i) => { if (solid(e, q[0], q[1])) { if (!pcv[i]) pc++; pcv[i] = 1; const k = 'price<' + name(e); by[k] = by[k] || { n: 1, still: 0 }; } });
        if (e.d > g.ld && e.lab !== p.id) g.label.forEach((q, i) => { if (solid(e, q[0], q[1])) { if (!lcv[i]) lc++; lcv[i] = 1; const k = 'label<' + name(e); by[k] = by[k] || { n: 1, still: 0 }; } });
      }
      all = dc.reduce((s, v) => s + v, 0) / dc.length; stay = ds.reduce((s, v) => s + v, 0) / ds.length;
      res[p.id] = { all, stay, price: g.price.length ? pc / g.price.length : 0, label: lc / g.label.length, by };
    }
    P.last = new Map(objs.map((e) => [e.id, [e.x, e.y]]));
    return score ? res : null;
  };
  window.__padVis = P;
};

// ------------------------------------------------------------------------------------------------ node side
const srv = await start(0, { prefix: '/fv/', root: ROOT });
const browser = await launch();
const report = { root: ROOT || 'this checkout', samples: N, scenarios: {} };

async function boot(save) {
  const keys = save ? (save.keys ? save.keys : { 'frostVillage.save.v1': JSON.stringify(save) }) : {};
  const INIT = `try { if (!sessionStorage.getItem('__pvInit')) { sessionStorage.setItem('__pvInit', '1'); localStorage.clear(); const K = ${JSON.stringify(keys)}; for (const k in K) localStorage.setItem(k, K[k]); } } catch (e) {}`;
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 412, height: 915 }, dpr: 1, init: INIT });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 240000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 240000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await page.evaluate(`(${PAGE.toString()})()`);
  await advance(page, 1);
  await page.evaluate(() => { try { window.__FV.cull(false); } catch (e) { /* */ } });
  return { page, log };
}

/** sample every pad of the world now (groups of nearby pads, the chief parked away from each group) */
async function measure(page, tag, withSpecs) {
  const info = await page.evaluate((w) => window.__padVis.prepare(w), withSpecs);
  const pads = await page.evaluate(() => window.__padVis.pads.map((p) => ({ id: p.id, live: p.live, x: p.x, y: p.y })));
  // groups: pads within 520 px (iso) of the group's first pad
  const groups = [];
  for (const p of pads.slice().sort((a, b) => a.x - b.x)) { const g = groups.find((q) => Math.hypot(q[0].x - p.x, 2 * (q[0].y - p.y)) < 520); if (g) g.push(p); else groups.push([p]); }
  const acc = {};
  for (const g of groups) {
    const cx = g.reduce((s, p) => s + p.x, 0) / g.length, cy = g.reduce((s, p) => s + p.y, 0) / g.length;
    const park = await page.evaluate(([cx2, cy2, ps]) => {
      const gs = window.__FV.scene;
      // (above the pads first: the chief parked below a group would stand in front of it)
      for (const r of [300, 380, 460, 560]) for (const [dx, dy] of [[0, -1], [0.7, -0.5], [-0.7, -0.5], [1, 0], [-1, 0], [0, 1], [0.7, 0.5], [-0.7, 0.5]]) {
        const x = cx2 + dx * r, y = cy2 + dy * r * 0.5;
        if (ps.every((p) => Math.hypot(p.x - x, 2 * (p.y - y)) > 240) && !gs.collision.blocked(x, y, 16)) return [x, y];
      }
      return [cx2, cy2 + 300];
    }, [cx, cy, g]);
    await page.evaluate((q) => { window.__FV.teleport(q[0], q[1]); window.__FV.setInput(0, 0); window.__FV.clearStack(); }, park);
    for (let k = 0; k < 4; k++) { await page.evaluate(() => { window.__step.run(0.5); window.__step.frame(); }); await sleep(120); }
    const gid = g.map((p) => p.id);
    await page.evaluate((q) => window.__padVis.sample(false, q), gid);
    for (let s = 0; s < N; s++) {
      await page.evaluate(() => { window.__step.run(1); window.__step.frame(); });
      await page.evaluate((q) => { const p = window.__FV.scene.player; if (Math.hypot(p.x - q[0], p.y - q[1]) > 30) window.__FV.teleport(q[0], q[1]); }, park);
      const r = await page.evaluate((q) => window.__padVis.sample(true, q), gid);
      for (const p of g) {
        const v = r[p.id]; if (!v) continue;
        const a = acc[p.id] || (acc[p.id] = Object.assign({ n: 0, mean: 0, stayMax: 0, priceMax: 0, labelMax: 0, by: {} }, p));
        a.n++; a.mean += v.all; a.stayMax = Math.max(a.stayMax, v.stay); a.priceMax = Math.max(a.priceMax, v.price); a.labelMax = Math.max(a.labelMax, v.label);
        for (const k in v.by) { const b = a.by[k] || (a.by[k] = { seen: 0, n: 0, still: 0 }); b.seen++; b.n = Math.max(b.n, v.by[k].n); b.still = Math.max(b.still, v.by[k].still); }
      }
    }
  }
  const rows = [];
  for (const id in acc) {
    const a = acc[id]; a.mean /= Math.max(1, a.n);
    const top = Object.entries(a.by).sort((x, y) => (y[1].still - x[1].still) || (y[1].seen - x[1].seen)).slice(0, 4).map(([k, v]) => `${k} ${v.seen}x${v.n}${v.still ? '/' + v.still : ''}`).join('; ');
    const bad = [];
    if (a.stayMax > LIMIT.decalWorst) bad.push(`floor ${Math.round(100 * a.stayMax)}% hidden by things that stay`);
    if (a.priceMax > LIMIT.priceWorst) bad.push(`price ${Math.round(100 * a.priceMax)}% covered`);
    if (a.labelMax > LIMIT.labelWorst) bad.push(`label ${Math.round(100 * a.labelMax)}% covered`);
    if (info.blocked.includes(id)) bad.push('centre not walkable');
    rows.push({ id, live: a.live, x: a.x, y: a.y, n: a.n, mean: +a.mean.toFixed(3), stayMax: +a.stayMax.toFixed(3), priceMax: +a.priceMax.toFixed(3), labelMax: +a.labelMax.toFixed(3), top, bad });
    ok(!bad.length, `${tag} ${a.live ? 'live' : 'to come'} ${id} (${a.x},${a.y}): floor worst ${Math.round(100 * a.stayMax)}% · mean ${Math.round(100 * a.mean)}% · price ${Math.round(100 * a.priceMax)}% · label ${Math.round(100 * a.labelMax)}%` + (bad.length ? ' — ' + bad.join(', ') + ' | ' + top : ''));
    if (!bad.length && a.mean > LIMIT.meanWarn) console.log(`       (note: ${id} mean cover ${Math.round(100 * a.mean)}% — passers-by: ${top})`);
  }
  ok(!info.over.length, `${tag} live paid pads never overlap (≥ ${LIMIT.gap} px apart)`, info.over);
  const clash = await page.evaluate(() => window.__padVis.labelClash());
  ok(!clash.length, `${tag} no pad's name label lies on another pad's label or price`, clash);
  const pulled = await page.evaluate(() => window.__padVis.pullClash());
  ok(!pulled.length, `${tag} a label pulled in at the screen edge never lies on another pad's label or price`, pulled);
  return { live: info.live, over: info.over, rows, pulled };
}

/** ('wait') one live paid pad per spot: a pad whose spot is taken waits and comes with its part payment; a part-paid
 *  line offer waiting for its spot keeps its slot (final review F2); a tool-gated side hire with nothing paid (어부 2 / 3)
 *  gives its spot to a 짐꾼 2 offer due there instead of hiding it until a fishing rod is made (final review F1) */
async function waitRules() {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'v42_village_late.json'), 'utf8'));
  const mk = (mut) => { const s = JSON.parse(raw.keys['frostVillage.save.v1']); mut(s); const k = Object.assign({}, raw.keys); k['frostVillage.save.v1'] = JSON.stringify(s); return { keys: k }; };
  const errs = (log) => log.errors.filter((e) => !/favicon|ERR_|net::/.test(e));
  // (F2) 구운 생선 짐꾼 not bought yet (40 paid) on the grill's line spot, 화덕 2단 part-paid (300) behind it
  {
    const { page, log } = await boot(mk((s) => { s.progress.done.porter_grill = false; s.progress.paid = Object.assign({}, s.progress.paid, { porter_grill: 40 }); s.v42.offerPaid = { st2_grill: 300 }; }));
    await advance(page, 3);
    const lu = () => page.evaluate(() => { const gs = window.__FV.scene, pr = gs.progress, LU = gs.v42.lines, u = LU.pads.st2_grill, p = gs.player; return { porter: pr.pads.porter_grill ? pr.pads.porter_grill.paid : (pr.done.porter_grill ? 'done' : null), offers: Object.keys(LU.pads).filter((id) => !/^(tables|srv2|p2_)/.test(id)), st2: u ? { paid: u.paid, cost: u.cost, needsLeave: !!u.needsLeave, under: u.pad.contains(p.x, p.y) } : null, up: !!LU.up.grill, coins: gs.economy.coins }; });
    const a = await lu();
    ok(a.porter === 40 && !a.st2 && a.offers.length <= 2, 'wait: 화덕 2단 (300 paid) waits behind 구운 생선 짐꾼 (40 paid) on its spot and keeps its slot (≤ 2 other offers stand)', a);
    const spot = await page.evaluate(() => { const u = window.__FV.scene.progress.pads.porter_grill; return { x: u.x, y: u.y }; });
    await page.evaluate((q) => { window.__FV.teleport(q.x, q.y); window.__FV.setInput(0, 0); window.__FV.clearStack(); }, spot);
    await advance(page, 5);
    const b = await lu();
    await advance(page, 3);
    const c = await lu();
    ok(b.porter === 'done' && c.st2 && c.st2.paid === 300 && c.st2.needsLeave, 'wait: once 구운 생선 짐꾼 is bought, 화덕 2단 appears on that spot with its 300 kept, and drains nothing while the chief still stands there', { b, c });
    await page.evaluate((q) => window.__FV.teleport(q.x + 260, q.y + 60), spot); await advance(page, 1);
    await page.evaluate((q) => window.__FV.teleport(q.x, q.y), spot); await advance(page, 6);
    const d = await lu();
    ok(d.up && !d.st2, 'wait: stepping off and on again pays the rest of 화덕 2단', d);
    ok(!errs(log).length, 'wait (F2): no page errors', errs(log).slice(0, 3));
    await page.context().close();
  }
  // (F1) 어부 2 / 3 not hired (no fishing rod anywhere), the grill's output full, 생선 짐꾼 2 part-paid (450)
  {
    const { page, log } = await boot(mk((s) => { s.progress.done.hire2_fisherman = false; s.progress.done.hire3_fisherman = false; s.v42.full = Object.assign({}, s.v42.full, { grill: 300 }); s.v42.offerPaid = { p2_grill: 450 }; }));
    await advance(page, 5);
    const st = () => page.evaluate(() => { const gs = window.__FV.scene, pr = gs.progress, LU = gs.v42.lines, h = pr.pads.hire2_fisherman, q = LU.pads.p2_grill; return { hire2: h ? { x: h.x, y: h.y, active: h.active } : null, p2: q ? { x: q.x, y: q.y, paid: q.paid, cost: q.cost, active: q.active } : null, p2done: LU.p2.indexOf('grill') >= 0, waiting: !!pr.waiting }; });
    const a = await st();
    ok(!a.hire2 && a.p2 && a.p2.active && a.p2.paid === 450 && a.waiting, 'wait: 생선 짐꾼 2 (450 paid) takes the grill line spot; the 어부 2 pad (no rod, nothing paid) waits there', a);
    await page.evaluate((q) => { window.__FV.teleport(q.x, q.y); window.__FV.setInput(0, 0); window.__FV.clearStack(); }, a.p2 || { x: 0, y: 0 });
    await advance(page, 6);
    await page.evaluate((q) => window.__FV.teleport(q.x + 300, q.y + 80), a.p2 || { x: 0, y: 0 });
    await advance(page, 3);
    const b = await st();
    ok(b.p2done && b.hire2 && b.hire2.active && a.p2 && Math.abs(b.hire2.x - a.p2.x) < 3 && Math.abs(b.hire2.y - a.p2.y) < 3, 'wait: once 생선 짐꾼 2 is bought, the 어부 2 pad comes back on that spot', b);
    // (F4) the office letters' camera jumps go to where the pads stand now
    const jumps = [];
    for (const [act, id, kind, line, sec] of [['st2:bakery', 'st2_bakery', 'st2', 'bakery', 0.2], ['st2:smokehouse', 'st2_smokehouse', 'st2', 'smokehouse', 0.2], ['p2:grill', 'p2_grill', 'p2', 'grill', 1.6], ['bigcar', 'bigcar', 'big', null, 1.8]]) {
      await page.evaluate((q) => { const gs = window.__FV.scene; gs.camFocus = null; gs.v42.office.letterAction(q); }, act);
      await advance(page, sec);
      jumps.push(await page.evaluate(([id2, kind2, line2, act2]) => { const gs = window.__FV.scene, LU = gs.v42.lines, f = gs.camFocus, u = LU.pads[id2], q = u || LU.spotOf(kind2, line2); return { act: act2, focus: f ? [Math.round(f.x), Math.round(f.y)] : null, pad: q ? [Math.round(q.x), Math.round(q.y)] : null }; }, [id, kind, line, act]));
    }
    ok(jumps.every((j) => j.focus && j.pad && Math.abs(j.focus[0] - j.pad[0]) < 2 && Math.abs(j.focus[1] - j.pad[1]) < 2), 'wait: the office letters jump the camera to the pad (가공소 2단, 짐꾼 2, 화물칸 크게) where it stands now', jumps);
    ok(!errs(log).length, 'wait (F1): no page errors', errs(log).slice(0, 3));
    await page.context().close();
  }
}

const step = async (page, fn, arg2, sec) => { await page.evaluate(fn, arg2); await advance(page, sec || 1.5); await page.evaluate(() => window.__step.frame()); };

try {
  for (const sc of SCEN) {
    console.log(`\n== ${sc}`);
    const t0 = Date.now();
    if (sc === 'wait') { await waitRules(); continue; }
    const save = sc === 'fresh' ? null : JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', sc + '.json'), 'utf8'));
    const { page, log } = await boot(save);
    const out = report.scenarios[sc] = { stages: {} };
    if (sc === 'fresh') {
      // the tutorial's pads one after another, as the player meets them (paid at once through the test hooks)
      const done = (id) => step(page, (q) => window.__FV.completeStep(q), id, 1.5);
      await step(page, () => window.__FV.scene.progress.setFlag('firstSale'), null, 2);
      out.stages.clerk = await measure(page, 'fresh/1 점원', false);
      await done('hire_clerk_market');
      out.stages.op = await measure(page, 'fresh/2 요리사', false);
      await done('op_grill');
      out.stages.fisher = await measure(page, 'fresh/3 어부', false);
      await done('hire_fisherman');
      out.stages.forest = await measure(page, 'fresh/4 숲·생선 짐꾼', false);
      await done('raw_grill'); await done('zone_forest');
      await step(page, () => window.__FV.scene.progress.setFlag('firstTrade'), null, 2.5);
      out.stages.trade = await measure(page, 'fresh/5 교역소 점원·구운 생선 짐꾼·제재공', false);
      await done('porter_grill'); await done('op_sawmill'); await done('hire_lumberjack');
      await advance(page, 2.5);
      out.stages.bench = await measure(page, 'fresh/6 작업대 (가방·신발)', false);
      // (final review F3) the 교역소 점원 pad stands apart from 가방: both can be bought, in either order
      ok(['hire_clerk_trade', 'up_capacity', 'up_speed'].every((id) => out.stages.bench.live.includes(id)), 'fresh/6 교역소 점원, 가방 and 신발 pads all stand at once', out.stages.bench.live);
      await done('hire_clerk_trade');
      await advance(page, 1.5);
      out.stages.bench2 = await measure(page, 'fresh/7 교역소 점원 뒤 가방', false);
    } else {
      out.stages.all = await measure(page, sc, true);
    }
    const errs = log.errors.filter((e) => !/favicon|ERR_|net::/.test(e));
    ok(!errs.length, `${sc}: no page errors`, errs.slice(0, 3));
    console.log(`   (${sc}: ${Math.round((Date.now() - t0) / 1000)} s)`);
    await page.context().close();
  }
} catch (e) { console.error(e); fail++; fails.push(String(e)); }
finally {
  await browser.close(); await srv.close();
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
  console.log(`\npadvis: ${pass} ok, ${fail} failed` + (fails.length ? '\n  ' + fails.slice(0, 40).join('\n  ') : ''));
  process.exitCode = fail ? 1 : 0;
}
