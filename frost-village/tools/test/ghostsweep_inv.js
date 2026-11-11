// (v4.2.0.1) ghostsweep — per-frame "picture == goods" invariant checker for Frost Village (injected into the page after
// the Game scene is up: page.addScriptTag({ path }) then window.__inv.install()). Used by tools/test/ghostsweep.mjs.
// (Taken over from the ghost-sweep chains probe; truthPos follows ItemStack.towerLim — drawMax and a baked type tower's
// slot height.)
//
// For EVERY live ItemStack (found by wrapping ItemStack.prototype: layout / push / pop / clear / reserve) and every
// pooled item picture (Effects.takeItem sprites, __type) it checks, after a drawn frame (window.__step.frame()):
//   BAKED stacks (one picture in a slot of the shared fv_stackbake texture)
//     pic      the slot's pixels (read back from the GPU / canvas) == a fresh "truth" drawing of the stack's items
//              into a private shadow DynamicTexture, the item places recomputed from the stack's own tower rules
//              (cols / typeCols / alternate / perCol / drawMax) at its current base — independent of it.x / it.y, so
//              a stale picture (ghost / missing items) AND items collapsed to the wrong place are both caught.
//              Only judged when the stack is settled (not dirty, not queued) and its picture is in the camera view.
//     stale    an in-view baked stack that stays dirty (changed, never re-baked) for > staleFrames drawn frames
//     nopic    items without a sprite, stack visible, in view, but no baked picture at all (never laid out)
//     img      the picture's visible flag / place differs from the stack's
//     clip     an item drawn (partly) outside its slot (that part is never shown and never erased)
//   EVERY stack item that has a sprite (carried items, unbaked stacks, landed-not-yet-baked items)
//     deadRef  the sprite was released to the pool / destroyed while the item is still held (a real item, no picture)
//     hidden   stack visible (and its carrier visible) but the sprite is not
//     ghost    stack invisible (or its carrier gone / hidden) but the sprite shows
//     type     the sprite shows another item type than the item
//     shared   one sprite referenced by two items
//     frozen   a visible unbaked stack in view whose items changed while it is no longer laid out (owner stopped)
//   pool pictures on the display list
//     orphan   a visible, still item picture in view that belongs to no stack item, no running flight, no tween
//     pooled   a picture released to the pool that is still visible on the display list
//   owners whose count lives outside the stack (tills, 창고, food box, dock crates, freight dock): model vs picture
//
// Coverage: every push / pop / clear is logged per (stack, item type, path) — appear / grow / shrink / empty / cleared /
// arrive (an item that flew in) / take (an item popped to fly away) — and credited with the result of the next settled
// check of that stack, so the matrix says which (place, item, path) cells were exercised and whether they held.
(function () {
  if (window.__inv) return;
  const I = window.__inv = { installed: false, violations: [], vcount: {}, checks: 0, checked: 0, stacks: new Set(), flights: new Map(), labels: new Map(), notes: [] };
  const MAXV = 400;
  let gs, fx, A, St, SH, stamp;

  I.install = function (opts = {}) {
    if (I.installed) return 'already';
    gs = window.__FV.scene; fx = gs.effects; A = window.__FV.assets();
    I.gs = gs;
    St = gs.player.stack.constructor; I.St = St;
    const P = St.prototype;
    const now = () => gs.time.now;
    const reg = (st) => { if (!I.stacks.has(st)) { I.stacks.add(st); st.__iBorn = now(); } };
    const ev = (st, type, path) => {
      const m = st.__iEv || (st.__iEv = new Map());
      const k = type + '|' + path;
      let e = m.get(k);
      if (!e) { e = { n: 0, chk: 0, fail: 0, ex: null }; m.set(k, e); }
      e.n++;
      (st.__iPend || (st.__iPend = new Set())).add(k);
    };
    I.ev = ev;
    const wrap = (name, f) => { const o = P[name]; P[name] = function () { return f.call(this, o, arguments); }; };
    wrap('layout', function (o, a) { reg(this); this.__iLay = now(); return o.apply(this, a); });
    wrap('push', function (o, a) {
      reg(this);
      const n0 = this.items.length;
      const r = o.apply(this, a);
      ev(this, a[0], n0 === 0 ? 'appear' : 'grow');
      if (a[1]) ev(this, a[0], 'arrive');
      this.__iChg = now();
      return r;
    });
    wrap('pop', function (o, a) {
      reg(this);
      const it = o.apply(this, a);
      if (it) { ev(this, it.type, this.items.length === 0 ? 'empty' : 'shrink'); ev(this, it.type, 'take'); this.__iChg = now(); if (it.spr) it.spr.__iFrom = this; }
      return it;
    });
    wrap('clear', function (o, a) {
      reg(this);
      const types = Array.from(new Set(this.items.map((i) => i.type)));
      const r = o.apply(this, a);
      for (const t of types) ev(this, t, 'cleared');
      this.__iChg = now();
      return r;
    });
    wrap('reserve', function (o, a) { reg(this); return o.apply(this, a); });
    // carriers: Character.prototype.sync tags its stack with the character
    const CP = Object.getPrototypeOf(Object.getPrototypeOf(gs.player));
    let C = Object.getPrototypeOf(gs.player);
    while (C && !Object.prototype.hasOwnProperty.call(C, 'sync')) C = Object.getPrototypeOf(C);
    void CP;
    if (C) { const o = C.sync; C.sync = function () { if (this.stack) { this.stack.__iChar = this; reg(this.stack); } return o.apply(this, arguments); }; }
    // tag every existing character's stack now
    const chars = [gs.player].concat(gs.workers || [], gs.porters || [], gs.rawPorters || [], gs.agents || []);
    for (const ch of chars) if (ch && ch.stack) { ch.stack.__iChar = ch; reg(ch.stack); }
    // flights
    const oFly = fx.fly.bind(fx);
    fx.fly = function (spr, x0, y0, target, opts = {}) {
      const rec = { t0: now(), done: false, type: spr && spr.__type, tw: null };
      const o2 = Object.assign({}, opts, { onDone: (s) => { rec.done = true; I.flights.delete(spr); if (opts.onDone) opts.onDone(s); } });
      const tw = oFly(spr, x0, y0, target, o2);
      rec.tw = tw;
      if (spr) I.flights.set(spr, rec);
      return tw;
    };
    const oTake = fx.takeItem.bind(fx);
    fx.takeItem = function (type) { const s = oTake(type); s.__iT = now(); s.__iSite = site(); s.__iFrom = null; return s; };
    const oRel = fx.releaseItem.bind(fx);
    fx.releaseItem = function (s) { if (s && s.__pooled) I.note('doubleRelease', { type: s.__type, site: site() }); return oRel(s); };
    // gathering / hunting / moving entry points (coverage only)
    if (gs.spawnItemTo) { const o = gs.spawnItemTo.bind(gs); gs.spawnItemTo = function (type, x, y, ch) { const r = o.apply(gs, arguments); if (r && ch && ch.stack) { reg(ch.stack); if (ch.sprite) ch.stack.__iChar = ch; I.note('spawn', { type, to: ch.constructor.name + ':' + (ch.type || ch.key || '') }, true); } return r; }; }
    // the shadow (truth) texture and its stamp
    if (gs.textures.exists('inv_shadow')) gs.textures.remove('inv_shadow');
    SH = gs.textures.addDynamicTexture('inv_shadow', 1024, 1024);
    stamp = gs.make.image({ x: 0, y: 0, key: '__WHITE', add: false });
    I.cfg = Object.assign({ staleFrames: 24, orphanStillMs: 700, frozenMs: 1500, margin: 40, pxTol: 24, recheckMs: 1500, persistGapMs: 600 }, opts);
    I.installed = true;
    I.relabel();
    return 'ok';
  };

  const site = () => { const s = new Error().stack.split('\n'); return s.slice(3, 6).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\/fv\//, '').replace(/\?[^:)]*/, '')).join(' < '); };
  I.note = function (kind, data, quiet) { I.notesN = (I.notesN || 0) + 1; if (!quiet && I.notes.length < 200) I.notes.push(Object.assign({ t: +(gs.time.now / 1000).toFixed(2), kind }, data)); };

  // ------------------------------------------------------------------ labels (object-graph walk, cached)
  const SKIP = new Set(['sys', 'game', 'anims', 'cache', 'registry', 'sound', 'textures', 'events', 'cameras', 'add', 'make', 'scene', 'children', 'data', 'input', 'load', 'time', 'tweens', 'lights', 'physics', 'matter', 'scale', 'plugins', 'renderer', 'displayList', 'updateList', 'parentContainer', 'emitter', 'emitters', 'textPool', 'sheetPool', 'itemPool', 'baker', '__stackBaker', 'story', 'chat', 'voice', 'audio', 'ground', 'water', 'collision', 'roads', 'roadNet', 'grid', 'cells', 'paint', '__iChar', '__iEv', '__iPend', 'agents', 'interiors', 'occluders', 'culler', 'residentChat', 'life']);
  const isGO = (v) => v && typeof v === 'object' && typeof v.setVisible === 'function' && v.scene !== undefined && typeof v.destroy === 'function' && v.type !== undefined;
  I.walk = function (maxNodes = 200000, wantHeld) {
    const seen = new Set(), lab = new Map(), held = new Map();
    const q = [[gs, 'gs', 0]];
    let n = 0, h = 0;
    while (h < q.length && n < maxNodes) {
      const [v, path, d] = q[h++];
      if (!v || typeof v !== 'object' || seen.has(v)) continue;
      seen.add(v); n++;
      if (v instanceof St) { const a = lab.get(v) || []; if (a.length < 4) a.push(path); lab.set(v, a); if (!wantHeld) continue; }
      if (isGO(v)) { if (wantHeld && v.__type !== undefined) { const a = held.get(v) || []; a.push(path); held.set(v, a); } continue; }
      if (d > 9) continue;
      if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) continue;
      if (v instanceof Map) { let i = 0; for (const [k, x] of v) { if (i++ > 300) break; if (x && typeof x === 'object') q.push([x, path + '{' + String(k).slice(0, 16) + '}', d + 1]); } continue; }
      if (v instanceof Set) { let i = 0; for (const x of v) { if (i++ > 300) break; if (x && typeof x === 'object') q.push([x, path + '{}', d + 1]); } continue; }
      if (Array.isArray(v)) { const L = Math.min(v.length, 400); for (let i = 0; i < L; i++) { const x = v[i]; if (x && typeof x === 'object') q.push([x, path + '[' + i + ']', d + 1]); } continue; }
      if (v === window || (typeof Node !== 'undefined' && v instanceof Node)) continue;
      let keys; try { keys = Object.keys(v); } catch (e) { continue; }
      for (const k of keys) { if (SKIP.has(k)) continue; let x; try { x = v[k]; } catch (e) { continue; } if (x && typeof x === 'object') q.push([x, path + '.' + k, d + 1]); }
    }
    return { lab, held, n };
  };
  const best = (paths) => paths.slice().sort((a, b) => (a.split('[').length - b.split('[').length) || (a.length - b.length))[0];
  // canonical names of the known places (the object-graph path is the fallback)
  I.known = function () {
    const m = new Map(), add = (st, n) => { if (st && !m.has(st)) m.set(st, n); };
    for (const s of gs.stationList || []) { add(s.inStack, 'station:' + s.id + '.in'); add(s.outStack, 'station:' + s.id + '.out'); }
    for (const w of gs.workshops || []) { add(w.inStack, 'workshop:' + w.kind + '.in'); add(w.outStack, 'workshop:' + w.kind + '.out'); }
    for (const id in gs.piles || {}) add(gs.piles[id].stack, 'pile:' + id);
    for (const k of ['market', 'trade', 'store']) if (gs[k]) { add(gs[k].stock, k + '.shelf'); if (gs[k].cash) add(gs[k].cash.pile, k + '.till'); }
    // ((v4.3 밀밭 · 빵집) the bakery stall's bread case (data: drawn by its overlays) and its till
    if (gs.bakery) { add(gs.bakery.stall.stock, 'bakery.case'); add(gs.bakery.stall.cash.pile, 'bakery.till'); }
    if (gs.warehouse) add(gs.warehouse.pile, 'warehouse.pile');
    if (gs.boathouse) { add(gs.boathouse.outStack, 'boathouse.catch'); if (gs.boathouse.boat) add(gs.boathouse.boat.cargo, 'boat.cargo'); }
    if (gs.foodBox) add(gs.foodBox.stock, 'foodbox');
    const C = gs.civic;
    if (C && C.restaurant) { add(C.restaurant.pantry, 'restaurant.pantry'); add(C.restaurant.pass, 'restaurant.pass'); if (C.restaurant.cash) add(C.restaurant.cash.pile, 'restaurant.till'); }
    if (C && C.hall && C.hall.tax) add(C.hall.tax.pile, 'hall.tax');
    const G = gs.v4 && gs.v4.growth;
    if (G) { add(G.crates, 'station.crates'); if (G.till) add(G.till.pile, 'station.till'); for (const k in G.shops || {}) add(G.shops[k].shelf, 'townshop:' + G.shops[k].shop + '.shelf'); }
    const F = gs.v42 && gs.v42.freight;
    if (F && F.view) add(F.view.stack, 'freight.dock');
    const D = gs.v42 && gs.v42.depot;
    if (D && D.till) add(D.till.pile, 'depot.till');
    for (const id in gs.sites || {}) add(gs.sites[id].stock, 'site.stock');
    for (const id in (gs.progress && gs.progress.pads) || {}) add(gs.progress.pads[id].itemStack, 'hirepad:' + id);
    return m;
  };
  I.relabel = function () {
    const known = I.known();
    for (const [st, n] of known) I.labels.set(st, n);
    const w = I.walk();
    // (every stack reachable from the scene is checked, also one that is never laid out — e.g. an owner whose update
    //  is never called)
    for (const [st, paths] of w.lab) { if (!st.__iChar && !known.has(st)) I.labels.set(st, best(paths).replace(/^gs\./, '')); if (!I.stacks.has(st)) { I.stacks.add(st); st.__iBorn = gs.time.now; } }
    I.lastWalk = gs.time.now;
    return w.n;
  };
  const charName = (ch) => {
    const c = ch.constructor && ch.constructor.name || 'Char';
    let s = c;
    if (ch === gs.player) return 'chief';
    if (ch.type && typeof ch.type === 'string') s += ':' + ch.type;
    else if (ch.key && typeof ch.key === 'string') s += ':' + ch.key.replace(/^(npc_|villager_)/, '');
    const tgt = ch.station || ch.target;
    if (tgt && tgt.id) s += '@' + tgt.id;
    else if (ch.kind && typeof ch.kind === 'string') s += '@' + ch.kind;
    if (ch.market && ch.market.id) s += '@' + ch.market.id;
    return s;
  };
  I.label = function (st) {
    if (st.__iChar) return 'carry:' + charName(st.__iChar);
    let l = I.labels.get(st);
    if (!l && gs.time.now - (I.lastWalk || 0) > 4000) { I.relabel(); l = I.labels.get(st); }
    return l || ('?' + (st.__iSite || ''));
  };
  /** the place category of a stack label (for the matrix) */
  I.place = function (label) {
    const L = label;
    if (/^carry:chief/.test(L)) return 'carry: chief';
    if (/^carry:/.test(L)) return 'carry: ' + L.slice(6).replace(/#\d+/, '');
    return L.replace(/\[\d+\]/g, '[]');
  };

  // ------------------------------------------------------------------ pixels
  const readRect = (dt, x, y, w, h) => {
    const r = gs.renderer;
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    w = Math.max(1, Math.min(1024 - x, Math.ceil(w))); h = Math.max(1, Math.min(1024 - y, Math.ceil(h)));
    if (r.gl && dt.renderTarget) {
      const gl = r.gl, prev = r.currentFramebuffer;
      r.setFramebuffer(dt.renderTarget.framebuffer);
      const d = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
      r.setFramebuffer(prev || null);
      return d;
    }
    return dt.context.getImageData(x, y, w, h).data;
  };
  I.readRect = readRect;
  /** where the stack's own tower rules put each item now (independent of it.x / it.y) */
  const truthPos = (st) => {
    const items = st.items, n = items.length, bx = st.bx, by = st.by, xs = new Array(n), ys = new Array(n);
    const step = (ty) => { const d = A.def ? A.def(ty) : null; return ((d && d.stackStep) || 10) * st.scale; };
    if (st.typeCols) {
      const hs = [], cs = [], lim = st.towerLim ? st.towerLim() : (st.drawMax || Infinity);
      for (let i = 0; i < n; i++) {
        const it = items[i], col = st.typeCols[it.type] || 0, c = st.cols[col] || st.cols[0];
        hs[col] = hs[col] || 0; cs[col] = cs[col] || 0;
        xs[i] = bx + c[0]; ys[i] = by + c[1] - hs[col];
        if (++cs[col] < lim) hs[col] += step(it.type);
      }
    } else if (st.alternate) {
      const nc = st.cols.length, hs = new Array(nc).fill(0), lim = st.drawMax || Infinity;
      for (let i = 0; i < n; i++) {
        const it = items[i], col = i % nc, c = st.cols[col];
        xs[i] = bx + c[0]; ys[i] = by + c[1] - hs[col];
        if (i + nc < lim) hs[col] += step(it.type);
      }
    } else {
      let h = 0, col = 0, inCol = 0;
      for (let i = 0; i < n; i++) {
        if (inCol >= st.perCol && col < st.cols.length - 1) { col++; inCol = 0; h = 0; }
        const it = items[i], c = st.cols[col];
        xs[i] = bx + c[0]; ys[i] = by + c[1] - h;
        h += step(it.type); inCol++;
      }
    }
    return { xs, ys };
  };
  I.truthPos = truthPos;
  /** draw the items of `st` that have no sprite into the shadow, at places (xs, ys); returns { missing, clip } */
  const drawShadow = (st, xs, ys) => {
    const s = st.slot, items = st.items, bx = st.bx, by = st.by;
    SH.clear();
    let missing = 0, clip = 0, any = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.spr) continue;
      const r = A.sprite(it.type);
      if (!r || r.ph || r.pending) { missing++; continue; }
      if (!any) { SH.beginDraw(); any = true; }
      stamp.setTexture(r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]);
      const sx = it.sx || st.scale, sy = it.sy || st.scale;
      stamp.setScale(sx, sy);
      const px = s.x + s.ox + (xs[i] - bx), py = s.y + s.oy + (ys[i] - by);
      SH.batchDraw(stamp, px, py);
      // geometry: the drawn rect vs the slot
      const fw = stamp.frame.realWidth * sx, fh = stamp.frame.realHeight * sy;
      const l = px - r.anchor[0] * fw, t = py - r.anchor[1] * fh;
      if (l < s.x - 2 || t < s.y - 2 || l + fw > s.x + s.w + 2 || t + fh > s.y + s.h + 2) clip++;
    }
    if (any) SH.endDraw();
    return { missing, clip };
  };
  const cmp = (a, b) => {
    let diff = 0, pa = 0, pb = 0;
    const tol = I.cfg.pxTol;
    for (let i = 0; i < a.length; i += 4) {
      const A0 = a[i + 3], B0 = b[i + 3];
      if (A0 > 8) pa++;
      if (B0 > 8) pb++;
      if (Math.abs(A0 - B0) > tol || Math.abs(a[i] - b[i]) > tol * 2 || Math.abs(a[i + 1] - b[i + 1]) > tol * 2 || Math.abs(a[i + 2] - b[i + 2]) > tol * 2) diff++;
    }
    return { diff, real: pa, truth: pb };
  };
  /** the baked picture of `st` vs its items: { real, truth, diff, truthAtXY, diffXY, missing, clip } */
  I.picture = function (st) {
    const B = st.baker, s = st.slot;
    if (!B || !s) return null;
    const real = readRect(B.dt, s.x, s.y, s.w, s.h);
    const tp = truthPos(st);
    const g1 = drawShadow(st, tp.xs, tp.ys);
    const tr = readRect(SH, s.x, s.y, s.w, s.h);
    const c1 = cmp(real, tr);
    const res = { real: c1.real, truth: c1.truth, diff: c1.diff, missing: g1.missing, clip: g1.clip };
    if (c1.diff > 0) {
      // the same items at it.x / it.y (what a flush would draw now): tells a stale picture from collapsed places
      const g2 = drawShadow(st, st.items.map((it) => it.x), st.items.map((it) => it.y));
      const c2 = cmp(real, readRect(SH, s.x, s.y, s.w, s.h));
      res.diffXY = c2.diff; res.truthXY = c2.truth; void g2;
      let collapsed = 0;
      for (let i = 0; i < st.items.length; i++) if (Math.abs(st.items[i].x - tp.xs[i]) > 1 || Math.abs(st.items[i].y - tp.ys[i]) > 1) collapsed++;
      res.misplaced = collapsed;
    }
    return res;
  };

  // ------------------------------------------------------------------ the check
  const inView = (x, y, m) => { const v = gs.cameras.main.worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; };
  const bump = (kind) => { I.vcount[kind] = (I.vcount[kind] || 0) + 1; };
  // (deduped: the same kind at the same place is listed 3 times at most, then only counted in I.dup)
  I.dup = {};
  const viol = (kind, st, data) => {
    bump(kind);
    const v = Object.assign({ t: +(gs.time.now / 1000).toFixed(2), kind, where: st ? I.label(st) : null, n: st ? st.items.length : undefined, types: st ? typesOf(st) : undefined }, data);
    const key = kind + '|' + (v.where || v.owner || v.type || '?');
    const d = I.dup[key] = (I.dup[key] || 0) + 1;
    if (d <= 3 && I.violations.length < MAXV) I.violations.push(v);
    return v;
  };
  const typesOf = (st) => { const o = {}; for (const it of st.items) o[it.type.replace('item_', '')] = (o[it.type.replace('item_', '')] || 0) + 1; return o; };
  const credit = (st, ok, ex) => {
    if (!st.__iPend || !st.__iPend.size) return;
    for (const k of st.__iPend) { const e = st.__iEv.get(k); e.chk++; if (!ok) { e.fail++; if (!e.ex) e.ex = ex; } }
    st.__iPend.clear();
  };
  const charVisible = (ch) => ch && ch.alive !== false && ch.sprite && ch.sprite.visible && ch.sprite.alpha > 0.05 && (!ch.sprite.scene || true);

  I.check = function (opts = {}) {
    I.checks++;
    const t = gs.time.now, m = I.cfg.margin, B = gs.__stackBaker;
    const out = [];
    const owner = new Map();
    for (const st of I.stacks) {
      const ch = st.__iChar;
      const dead = ch && ch.alive === false;
      const lab = st.items.length ? null : null; void lab;
      const vis = st.visible && (!ch || charVisible(ch));
      // ---- sprites of items (carried, unbaked, landed-not-yet-baked)
      let bad = null;
      for (const it of st.items) {
        const s = it.spr;
        if (!s) continue;
        if (owner.has(s)) { out.push(viol('shared', st, { type: it.type, other: I.label(owner.get(s)) })); bad = bad || 'shared'; } else owner.set(s, st);
        const near = inView(s.x, s.y, m + 60);
        if (!near) continue;
        if (s.__pooled || !s.active) { if (!dead) { out.push(viol('deadRef', st, { type: it.type, pooled: !!s.__pooled, active: s.active, x: Math.round(s.x), y: Math.round(s.y) })); bad = bad || 'deadRef'; } continue; }
        if (s.__type !== it.type) { out.push(viol('type', st, { type: it.type, shows: s.__type })); bad = bad || 'type'; }
        if (dead && s.visible) { out.push(viol('ghost', st, { why: 'carrier gone', type: it.type, x: Math.round(s.x), y: Math.round(s.y) })); bad = bad || 'ghost'; continue; }
        if (!vis && s.visible && s.alpha > 0.05 && s.displayList) { out.push(viol('ghost', st, { why: ch ? 'carrier hidden' : 'stack hidden', type: it.type, x: Math.round(s.x), y: Math.round(s.y) })); bad = bad || 'ghost'; }
        if (vis && (!s.visible || s.alpha < 0.05)) { out.push(viol('hidden', st, { type: it.type, x: Math.round(s.x), y: Math.round(s.y), alpha: +s.alpha.toFixed(2) })); bad = bad || 'hidden'; }
        if (vis && s.visible && !s.displayList) { out.push(viol('offList', st, { type: it.type, x: Math.round(s.x), y: Math.round(s.y) })); bad = bad || 'offList'; }
      }
      // ---- an unbaked stack that is no longer laid out but changed since (its owner stopped)
      if (!st.bakeOn || !st.slot) {
        const any = st.items.find((it) => it.spr && it.spr.visible && !it.spr.__pooled && inView(it.spr.x, it.spr.y, m));
        if (any && st.__iChg !== undefined && (st.__iLay === undefined || st.__iChg > st.__iLay) && t - st.__iChg > I.cfg.frozenMs) { out.push(viol('frozen', st, { since: +((t - st.__iChg) / 1000).toFixed(1), laid: st.__iLay !== undefined ? +((t - st.__iLay) / 1000).toFixed(1) : null })); bad = bad || 'frozen'; }
      }
      // ---- baked picture
      if (st.bakeOn && !st.bakeFail) {
        const img = st.bakeImg;
        const noSpr = st.items.filter((it) => !it.spr).length;
        const baseIn = inView(st.bx, st.by, m + 60);
        if (!img) {
          // items without a picture at all
          if (noSpr > 0 && st.visible && (baseIn || (st.bx === 0 && st.by === 0))) {
            st.__iNoPic = (st.__iNoPic || 0) + 1;
            if (st.__iNoPic > 3) { out.push(viol('nopic', st, { items: noSpr, base: [Math.round(st.bx), Math.round(st.by)], laid: st.__iLay !== undefined ? +((t - st.__iLay) / 1000).toFixed(1) : null })); bad = bad || 'nopic'; }
          } else st.__iNoPic = 0;
          if (bad) credit(st, false, bad); else if (baseIn && st.visible && !st.items.length) credit(st, true);
          continue;
        }
        st.__iNoPic = 0;
        const imgIn = inView(img.x, img.y, m);
        if (imgIn) {
          if (img.visible !== st.visible) { out.push(viol('img', st, { why: 'visible', img: img.visible, stack: st.visible })); bad = bad || 'img'; }
          if (Math.abs(img.x - st.bx) > 0.5 || Math.abs(img.y - st.by) > 0.5) { out.push(viol('img', st, { why: 'place', img: [Math.round(img.x), Math.round(img.y)], base: [Math.round(st.bx), Math.round(st.by)] })); bad = bad || 'img'; }
          if (!img.displayList || !img.active) { out.push(viol('img', st, { why: 'offList' })); bad = bad || 'img'; }
        }
        const queued = B && B.dirty.has(st);
        if (imgIn && img.visible) {
          if (st.bakeDirty || queued) {
            st.__iDirtyN = (st.__iDirtyN || 0) + 1;
            if (st.__iDirtyN > I.cfg.staleFrames && !queued) { out.push(viol('stale', st, { frames: st.__iDirtyN })); bad = bad || 'stale'; }
          } else {
            st.__iDirtyN = 0;
            // (cost) a stack whose items did not change is re-read every recheckMs only (another stack's flush could
            //  still wipe its slot: the periodic re-read catches that)
            const fresh = st.__iPixT !== undefined && (st.__iChg === undefined || st.__iChg <= st.__iPixT) && t - st.__iPixT < I.cfg.recheckMs && !(st.__iPend && st.__iPend.size);
            if (opts.pixels !== false && !fresh) {
              st.__iPixT = t;
              const p = I.picture(st);
              I.checked++;
              if (p && (p.diff > Math.max(12, p.truth * 0.01))) { out.push(viol('pic', st, p)); bad = bad || 'pic'; }
              if (p && p.clip) { out.push(viol('clip', st, { clip: p.clip })); bad = bad || 'clip'; }
              if (bad) credit(st, false, bad); else credit(st, true);
            }
          }
        } else st.__iDirtyN = 0;
        if (bad && !(imgIn && img.visible && !st.bakeDirty)) credit(st, false, bad);
        continue;
      }
      // unbaked stacks: credit when in view
      if (st.items.length ? st.items.some((it) => it.spr && inView(it.spr.x, it.spr.y, m)) : (st.bx || st.by) && inView(st.bx, st.by, m)) credit(st, !bad, bad);
    }
    // ---- pictures legitimately held outside stacks: plates on the restaurant tables (a guest eating), the net's
    //      jumping fish, the dog's ball / gift coin
    const R = gs.civic && gs.civic.restaurant;
    if (R && R.guests) for (const g of R.guests) for (const s of g.plates || []) owner.set(s, 'plate');
    if (gs.net && gs.net.fish) for (const s of gs.net.fish) owner.set(s, 'net');
    const dg = gs.dog;
    if (dg) { if (dg.ball) owner.set(dg.ball, 'dog'); if (dg.carry) owner.set(dg.carry, 'dog'); }
    // ---- pool pictures on the display list
    const v = gs.cameras.main.worldView;
    const seen = I._still || (I._still = new WeakMap());
    for (const o of gs.children.list) {
      if (o.__type === undefined || !o.active) continue;
      if (!o.visible || o.alpha <= 0.02) continue;
      if (!(o.x > v.x - m && o.x < v.right + m && o.y > v.y - m && o.y < v.bottom + m)) continue;
      if (o.__pooled) { out.push(viol('pooled', null, { type: o.__type, x: Math.round(o.x), y: Math.round(o.y) })); continue; }
      if (owner.has(o)) continue;
      const fl = I.flights.get(o);
      if (fl && !fl.done) continue;
      if (gs.tweens.getTweensOf && gs.tweens.getTweensOf(o).length) continue;
      const key = Math.round(o.x) + ',' + Math.round(o.y);
      const p = seen.get(o);
      if (!p || p.key !== key) { seen.set(o, { key, t0: t }); continue; }
      if (t - p.t0 >= I.cfg.orphanStillMs) {
        if (!o.__iOrph) { o.__iOrph = true; out.push(viol('orphan', null, { type: o.__type, x: Math.round(o.x), y: Math.round(o.y), still: +((t - p.t0) / 1000).toFixed(1), born: o.__iSite || 'before-install', from: o.__iFrom ? I.label(o.__iFrom) : null })); }
      }
    }
    // ---- owners whose count lives outside the stack
    I.models(out);
    return out.length;
  };

  // owner models (persisting mismatches only)
  const persist = (key, bad, ms, mk) => {
    const P = I._pm || (I._pm = new Map()), t = gs.time.now;
    const MC = I.modelChecks || (I.modelChecks = {});
    const mk0 = key.replace(/\d+$/, '');
    MC[mk0] = MC[mk0] || { n: 0, bad: 0 };
    MC[mk0].n++; if (bad) MC[mk0].bad++;
    if (!bad) { P.delete(key); return null; }
    const p = P.get(key);
    // ((review INV-1) a mismatch must hold over CONTINUOUS samples: a gap since the last sample longer than the check
    //  cadence (no drawn frame checked in between) restarts its clock — two short glitches (two till drains) with an
    //  unsampled good spell between them were joined into one false '>= 3 s' violation)
    if (!p || t - p.last > I.cfg.persistGapMs) { P.set(key, { t0: t, last: t, done: false }); return null; }
    p.last = t;
    if (!p.done && t - p.t0 >= ms) { p.done = true; return mk(); }
    return null;
  };
  I.persist = persist;                       // (the checker's own test drives it)
  // an owner out of view is not sampled: its clock stops (a later mismatch starts a new one)
  const away = (key) => { if (I._pm) I._pm.delete(key); };
  I.models = function (out) {
    const tills = [];
    const add = (name, till) => { if (till && typeof till.value === 'number' && till.pile) tills.push([name, till]); };
    if (gs.market) add('market', gs.market.cash);
    if (gs.trade) add('trade', gs.trade.cash);
    if (gs.store) add('store', gs.store.cash);
    if (gs.bakery && gs.bakery.built) add('bakery', gs.bakery.stall.cash);
    const Cv = gs.civic;
    if (Cv && Cv.restaurant) add('rest', Cv.restaurant.cash);
    if (Cv && Cv.hall) add('tax', Cv.hall.tax);
    const G = gs.v4 && gs.v4.growth;
    if (G && G.till) add('station', G.till);
    const D = gs.v42 && gs.v42.depot;
    if (D && D.till) add('depot', D.till);
    for (const [name, till] of tills) {
      if (!inView(till.x, till.y, 200)) { away('till:' + name); continue; }
      const p = till.pile, has = p.count > 0, val = till.value > 0;
      const flying = p.incoming > 0;
      const r = persist('till:' + name, !flying && has !== val, 3000, () => viol('model', p, { owner: 'till:' + name, value: till.value, coins: p.count, incoming: p.incoming }));
      if (r) out.push(r);
    }
    const W = gs.warehouse;
    if (!(W && W.enabled && inView(W.outPad.x, W.outPad.y, 200))) away('warehouse');
    else {
      const r = persist('warehouse', (W.total > 0) !== (W.pile.count > 0), 1500, () => viol('model', W.pile, { owner: 'warehouse', total: W.total, pile: W.pile.count }));
      if (r) out.push(r);
    }
    const F = gs.v42 && gs.v42.freight;
    if (!(F && F.view && inView(F.view.x, F.view.y, 200))) away('freight');
    else {
      const st = F.view.stack, want = {}, have = {};
      let n = 0;
      for (const ty in F.dock) { want[ty] = F.dock[ty]; n += F.dock[ty]; }
      for (const it of st.items) have[it.type] = (have[it.type] || 0) + 1;
      const SHOWN = st.items.length + st.incoming;
      const comp = n <= SHOWN && n === st.items.length && Object.keys(want).some((k) => (have[k] || 0) !== want[k]);
      const r = persist('freight', (n > 0) !== (st.items.length > 0) || comp, 1500, () => viol('model', st, { owner: 'freight dock', dock: want, shown: have }));
      if (r) out.push(r);
    }
    if (!(G && G.crates && G.dock && inView(G.dock.x, G.dock.y, 200))) away('crates');
    else {
      const st = G.crates, want = {}, have = {};
      for (const ty of G.cargoTypes || []) want[ty] = (want[ty] || 0) + 1;
      for (const it of st.items) have[it.type] = (have[it.type] || 0) + 1;
      const n = (G.cargoTypes || []).length;
      const comp = n === st.items.length && Object.keys(want).concat(Object.keys(have)).some((k) => (have[k] || 0) !== (want[k] || 0));
      const r = persist('crates', ((G.cargo > 0) !== (st.items.length + st.incoming > 0)) || comp, 1500, () => viol('model', st, { owner: 'station crates', cargo: G.cargo, cargoTypes: want, shown: have }));
      if (r) out.push(r);
    }
    // ((v4.3 밀밭 · 빵집) the bakery stall's case: the overlay shown = the bracket of its bread (none / bread_1 / bread_2)
    const BKs = gs.bakery && gs.bakery.built ? gs.bakery.stall : null;
    if (!(BKs && inView(BKs.x, BKs.y, 150))) away('bakery_case');
    else {
      const n = BKs.stock.count, want = n <= 0 ? 0 : n < BKs.fullAt ? 1 : 2;
      const shown = BKs.breadImgs.findIndex((im) => im && im.visible) + 1;
      const r = persist('bakery_case', BKs.breadImgs.some(Boolean) && shown !== want, 500, () => viol('model', BKs.stock, { owner: 'bakery case', bread: n, shown, want }));
      if (r) out.push(r);
    }
    // the town's shops (v4): the shelf shows min(5, stock) of each sold item
    const shops = G && G.shops ? Object.values(G.shops) : [];
    for (const sh of shops) {
      if (!sh.shelf || !sh.inPt || !inView(sh.inPt.x, sh.inPt.y, 150)) { away('shop:' + sh.shop); continue; }
      const bad = (sh.sells || []).filter((ty) => sh.shelf.countWithIncoming(ty) !== Math.min(5, sh.stock[ty] || 0));
      const r = persist('shop:' + sh.shop, bad.length > 0, 1500, () => viol('model', sh.shelf, { owner: 'town shop ' + sh.shop, stock: Object.assign({}, sh.stock), shelf: bad.map((ty) => ty + ':' + sh.shelf.countWithIncoming(ty)) }));
      if (r) out.push(r);
    }
    // the fish net: one jumping fish per fish in stock
    const N = gs.net;
    if (!(N && N.fish && inView(N.x, N.y, 100))) away('net');
    else {
      const vis = N.fish.filter((f) => f.visible && !f.__pooled).length, want = N.enabled === false ? 0 : Math.min(N.fish.length, N.stock);
      const r = persist('net', vis !== want, 300, () => viol('model', null, { owner: 'fish net', stock: N.stock, fishShown: vis }));
      if (r) out.push(r);
    }
    // vehicles: the cargo sleighs' crates (one per 10 items) and the train's crate pictures vs their loads
    const Dp = gs.v42 && gs.v42.depot;
    if (Dp && Dp.sleighs) for (const s of Dp.sleighs) {
      if (!s.spr || !inView(s.x || 0, s.y || 0, 100)) { away('sleigh' + s.index); continue; }
      const vis = s.crates.filter((c) => c.visible).length, n = s.count();
      const want = s.spr.visible ? Math.min(6, Math.ceil(n / 10)) : 0;
      const r = persist('sleigh' + s.index, vis !== want, 500, () => viol('model', null, { owner: 'cargo sleigh ' + s.index, load: n, crates: vis, want, state: s.state }));
      if (r) out.push(r);
    }
    const tr = gs.v4 && gs.v4.train;
    if (tr && tr.cars && tr.cars.length) {
      let vis = 0, anyIn = false;
      for (const c of tr.cars) { if (c.spr && inView(c.spr.x, c.spr.y, 100)) anyIn = true; for (const k of c.crates || []) if (k.visible) vis++; }
      if (!anyIn) away('train');
      else {
        const r = persist('train', (tr.cargo || 0) === 0 && vis > 0, 500, () => viol('model', null, { owner: 'train cars', cargo: tr.cargo, cratesShown: vis }));
        if (r) out.push(r);
      }
    }
    const fb = gs.foodBox;
    if (!(fb && fb.active && inView(fb.x, fb.y, 200))) { away('foodbox'); away('foodboxLabel'); }
    else {
      const st = fb.stock;
      const off = st.items.length > 0 && (Math.abs(st.bx - fb.x) > 2 || Math.abs(st.by - (fb.y + 6)) > 2);
      const r = persist('foodbox', off, 500, () => viol('model', st, { owner: 'food box', box: [fb.x, fb.y], stackBase: [Math.round(st.bx), Math.round(st.by)], img: !!st.bakeImg }));
      if (r) out.push(r);
      // (v4.2.0.1) its label tells the count it holds
      const lt = fb.labelText && fb.labelText.text, want = st.count + '/' + fb.max;
      const r2 = persist('foodboxLabel', !!lt && !lt.endsWith(want), 500, () => viol('model', st, { owner: 'food box label', label: lt, count: st.count }));
      if (r2) out.push(r2);
    }
  };

  // ------------------------------------------------------------------ reports
  I.coverage = function () {
    const rows = [];
    for (const st of I.stacks) {
      if (!st.__iEv) continue;
      const lab = I.label(st), place = I.place(lab);
      for (const [k, e] of st.__iEv) { const [type, path] = k.split('|'); rows.push({ place, label: lab, type, path, n: e.n, chk: e.chk, fail: e.fail, ex: e.ex, baked: !!(st.bakeOn && st.slot) }); }
    }
    return rows;
  };
  I.summary = function () { return { modelChecks: Object.assign({}, I.modelChecks || {}), checks: I.checks, picChecks: I.checked, stacks: I.stacks.size, vcount: Object.assign({}, I.vcount), dup: Object.assign({}, I.dup), flights: I.flights.size, notes: I.notesN || 0 }; };
  I.inventory = function () {
    const out = [];
    for (const st of I.stacks) out.push({ label: I.label(st), n: st.items.length, inc: st.incoming, baked: !!(st.bakeOn && st.slot), bakeOn: st.bakeOn, fail: st.bakeFail, vis: st.visible, base: [Math.round(st.bx), Math.round(st.by)], types: typesOf(st) });
    return out;
  };
  /** holders of a pool sprite (object-graph paths) — diagnosis for orphans */
  I.holders = function (x, y, r = 30) {
    const w = I.walk(300000, true), res = [];
    for (const [s, paths] of w.held) if (Math.hypot(s.x - x, s.y - y) < r && s.visible) res.push({ type: s.__type, x: Math.round(s.x), y: Math.round(s.y), paths: paths.slice(0, 4), born: s.__iSite });
    return res;
  };
})();
