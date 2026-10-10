// A stand-in for the game's Ground (src/systems/Ground.js) in the beach lab: 512² canvas tiles baked around the view
// with the same order — the snow pattern, the streets, then the bake hooks (fn(ctx, x0, y0, w, h) in world px after
// ctx.translate(-x0, -y0), exactly like Ground.bakeChunk) — and `invalidate(rect)` re-bakes tiles in place.

const TILE = 512;

export class LabGround {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.hooks = [];
    this.tiles = new Map();         // "tx,ty" -> { key, img, dirty }
    this.max = opts.max || 40;
    this.streets = opts.streets || [];    // [{ poly: [x, y ...], key }]
    this.land = opts.land || null;        // [poly] the land (snow) polygons
    this.baked = 0;
    this.n = 0;
  }
  addBakeHook(fn, rect) { const h = { fn, rect }; this.hooks.push(h); this.invalidate(rect); return h; }
  removeBakeHook(h) { const k = this.hooks.indexOf(h); if (k >= 0) this.hooks.splice(k, 1); this.invalidate(h.rect); }
  invalidate(rect) {
    for (const [id, t] of this.tiles) {
      const x = t.tx * TILE, y = t.ty * TILE;
      if (rect && (x > rect.x + rect.w || x + TILE < rect.x || y > rect.y + rect.h || y + TILE < rect.y)) continue;
      t.dirty = true;
    }
  }
  pattern(ctx, key) {
    const tex = this.scene.textures.exists(key) ? this.scene.textures.get(key) : null;
    return tex ? ctx.createPattern(tex.getSourceImage(), 'repeat') : '#eef3f9';
  }
  bake(t) {
    const S = this.scene;
    // 1 px of overlap on every side: no hairline seams between tiles under linear filtering at odd zooms
    if (!t.canvas) { t.key = 'labg_' + (this.n++); t.canvas = S.textures.createCanvas(t.key, TILE + 2, TILE + 2); t.img = S.add.image(t.tx * TILE - 1, t.ty * TILE - 1, t.key).setOrigin(0, 0).setDepth(-15000); }
    const ctx = t.canvas.context, x0 = t.tx * TILE - 1, y0 = t.ty * TILE - 1, TS = TILE + 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TS, TS);
    ctx.save();
    ctx.translate(-x0, -y0);
    // the land only (the seas are Water.js regions under the ground, like Ground.bakeChunk's land polygon)
    if (this.land) { ctx.beginPath(); for (const poly of this.land) { ctx.moveTo(poly[0], poly[1]); for (let k = 2; k < poly.length; k += 2) ctx.lineTo(poly[k], poly[k + 1]); ctx.closePath(); } ctx.clip(); }
    ctx.fillStyle = this.pattern(ctx, 'ground_snow');
    ctx.fillRect(x0, y0, TS, TS);
    for (const s of this.streets) {
      ctx.beginPath(); ctx.moveTo(s.poly[0], s.poly[1]); for (let k = 2; k < s.poly.length; k += 2) ctx.lineTo(s.poly[k], s.poly[k + 1]); ctx.closePath();
      ctx.fillStyle = s.key ? this.pattern(ctx, s.key) : s.color; ctx.fill();
      if (s.edge) { ctx.strokeStyle = s.edge; ctx.lineWidth = 3; ctx.stroke(); }
    }
    for (const h of this.hooks) {
      const r = h.rect;
      if (r && (x0 > r.x + r.w || x0 + TS < r.x || y0 > r.y + r.h || y0 + TS < r.y)) continue;
      ctx.save(); h.fn(ctx, x0, y0, TS, TS); ctx.restore();
    }
    ctx.restore();
    t.canvas.refresh();
    t.dirty = false;
    this.baked++;
  }
  /** bake every tile the view (+ margin) needs; drop far ones */
  update(view, all = false) {
    const m = 256, tx0 = Math.floor((view.x - m) / TILE), tx1 = Math.floor((view.x + view.width + m) / TILE);
    const ty0 = Math.floor((view.y - m) / TILE), ty1 = Math.floor((view.y + view.height + m) / TILE);
    let budget = all ? 999 : 3;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = tx + ',' + ty;
        let t = this.tiles.get(id);
        if (!t) { t = { tx, ty, dirty: true }; this.tiles.set(id, t); }
        t.used = this.scene.time.now;
        if (t.dirty && budget > 0) { this.bake(t); budget--; }
      }
    }
    if (this.tiles.size > this.max) {
      const list = Array.from(this.tiles.entries()).sort((a, b) => (a[1].used || 0) - (b[1].used || 0));
      while (this.tiles.size > this.max) { const [id, t] = list.shift(); if (t.img) { t.img.destroy(); this.scene.textures.remove(t.key); } this.tiles.delete(id); }
    }
  }
  bakeAll(view) { this.update(view, true); }
  textureMiB() { let n = 0; for (const t of this.tiles.values()) if (t.canvas) n++; return n * (TILE + 2) * (TILE + 2) * 4 / 1048576; }
}
