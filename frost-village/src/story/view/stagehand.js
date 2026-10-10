// Stagehand: the small toolbox every story set piece uses (view layer, Phaser through `ctx.scene` and `ctx.art`).
// Bodies are borrowed from the body layer (TownSim in the game, the lab town in the lab) through ports.town with a
// 'story' lease; props come from the finished art (life2, town, fx, emotes) through `art`; time is game time (the
// scene is driven by StoryLife.update(dt), so a paused game pauses the wedding too). Every set piece can be cancelled:
// cancel() releases the bodies, removes the props with a poof and settles the pending waits.

export const DIRS8 = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
/** townfolk2 anims and what a body without its townfolk2 pages plays instead (everyday look, critique H8) */
export const TF2_PLAIN = { sit: 'idle', clap: 'happy', sad: 'idle', push: 'walk' };
/** townfolk2 parts (assets/townfolk2 parts): the presets bride, groom, wedding_guest, flower_girl, mourner and
 *  mourner_family are made of them */
export const TF2_PARTS = { wedding_dress: 1, veil: 1, groom_suit: 1, flower_crown: 1, mourning_coat: 1, black_hat: 1, held_bouquet: 1 };
/** the 8-way direction of a screen vector (iso screen: y down) */
export function dirOf(dx, dy) {
  const a = Math.atan2(dy, dx);
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return DIRS8[i];
}

export class Stagehand {
  /** ctx: { scene, art, ports, life (StoryLife), registry } */
  constructor(ctx, name) {
    this.ctx = ctx;
    this.name = name;
    this.held = new Set();
    this.props = [];
    this.waits = [];
    this.t = 0;
    this.cancelled = false;
    this.music = null;
    this.extras = [];
    this.venues = new Set();
    this.dressAges = null;    // null: every age may be dressed (the lab loads all townfolk2 pages)
  }

  get scene() { return this.ctx.scene; }
  get art() { return this.ctx.art; }
  get town() { return this.ctx.ports.town || {}; }

  // ---------------------------------------------------------------- time
  update(dt) {
    this.t += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; if (this.t >= w.at) { this.waits.splice(i, 1); w.resolve(true); } }
  }
  /** a promise that resolves after `sec` game seconds (or at once when cancelled) */
  wait(sec) {
    if (this.cancelled) return Promise.resolve(false);
    return new Promise((resolve) => this.waits.push({ at: this.t + Math.max(0, sec), resolve }));
  }

  // ---------------------------------------------------------------- bodies
  body(pid) { return this.town.bodyOf ? this.town.bodyOf(pid) : null; }
  /** borrow a body for the story (registry lease 'story' + the body layer's hold); false when gameplay has it */
  hold(pid) {
    if (!pid || this.cancelled) return false;
    if (this.held.has(pid)) return true;
    // one set piece at a time per body (two scenes must never steer the same person)
    const H = this.ctx.holders;
    if (H && H.has(pid) && H.get(pid) !== this) return false;
    const reg = this.ctx.registry;
    if (reg && !reg.lease(pid, 'story')) return false;
    if (this.town.hold && this.town.hold(pid, 'story') === false) { if (reg) reg.release(pid, 'story'); return false; }
    this.held.add(pid);
    if (H) H.set(pid, this);
    return true;
  }
  release(pid) {
    if (!this.held.has(pid)) return;
    this.held.delete(pid);
    const H = this.ctx.holders;
    if (H && H.get(pid) === this) H.delete(pid);
    if (this.town.dress) this.town.dress(pid, null);
    if (this.town.release) this.town.release(pid);
    const reg = this.ctx.registry;
    if (reg) reg.release(pid, 'story');
  }
  releaseAll() { for (const pid of Array.from(this.held)) this.release(pid); }

  /** walk a borrowed body; resolves on arrival — or at once when the scene is cancelled (never hangs) */
  walk(pid, x, y, opts = {}) {
    if (this.cancelled || !this.town.walk || !pid) return Promise.resolve(false);
    return new Promise((resolve) => {
      const w = { resolve };
      this.walks = this.walks || new Set();
      this.walks.add(w);
      this.town.walk(pid, x, y, opts, () => { this.walks.delete(w); resolve(true); });
    });
  }
  place(pid, x, y, dir) { if (!this.cancelled && this.town.place) this.town.place(pid, x, y, dir); }
  face(pid, d) { if (!this.cancelled && this.town.face) this.town.face(pid, d); }
  faceTo(pid, other) { const a = this.body(pid), b = typeof other === 'object' && other && other.x !== undefined ? other : this.body(other); if (a && b) this.face(pid, dirOf(b.x - a.x, b.y - a.y)); }
  /** may this body wear townfolk2 clothes / play townfolk2 anims now (its age group's pages are resident)? The kit
   *  says which age groups it could page in for this set piece (ports.dressAges(kind), index.js beatPlan); null = all */
  canDress(pid) {
    if (!this.dressAges) return true;
    const g = this.ctx.ageGroup ? this.ctx.ageGroup(pid) : null;
    return !g || this.dressAges.indexOf(g) >= 0;
  }
  anim(pid, name, opts) {
    if (this.cancelled || !pid || !this.town.anim) return;
    this.town.anim(pid, TF2_PLAIN[name] && !this.canDress(pid) ? TF2_PLAIN[name] : name, opts || {});
  }
  dress(pid, preset, opts) {
    if (this.cancelled || !pid || !this.town.dress) return;
    const needs = !!preset || ((opts && opts.add) || []).some((p) => TF2_PARTS[p]);
    if (needs && !this.canDress(pid)) return;
    this.town.dress(pid, preset, opts || {});
  }
  /** a venue of ours is the stage (our 마을회관 hides its notice board and pads, P13 / critique M4) */
  stageVenue(id) { const W = this.ctx.ports.world; if (id && W && W.stage && !this.venues.has(id)) { W.stage(id, true, this.name); this.venues.add(id); } }
  say(pid, text, emote, dur = 2.6) { const P = this.ctx.ports; return !this.cancelled && pid && P.say ? P.say(pid, text, emote, dur, { story: true }) : false; }
  emote(pid, key, dur = 1.8) { const P = this.ctx.ports; return !this.cancelled && pid && P.emote ? P.emote(pid, key, dur) : false; }
  attach(pid, kind, opts) { return this.town.attach ? this.town.attach(pid, kind, opts || {}) : null; }
  /** keep a stage area clear of everyday walkers while the set piece runs (ports.town.reserve, optional) */
  reserve(rect) { if (this.town.reserve) { this.town.reserve(this.name, rect); this.reserved = true; } }
  /** a throwaway extra for previews / crowds (the lab town makes one; the game borrows a townsperson instead) */
  extra(spec) { const pid = this.town.spawn ? this.town.spawn(spec) : null; if (pid) this.extras.push(pid); return pid; }

  // ---------------------------------------------------------------- props and fx
  /** a finished-art prop at x, y (pops in); depth: 'ground' | number (default y-sorted) */
  prop(key, x, y, opts = {}) {
    if (this.cancelled) return null;
    const img = this.art.image(this.scene, x, y, key);
    if (!img) return null;
    if (opts.depth === 'ground') img.setDepth(-1e5 + y * 0.001);
    else img.setDepth(opts.depth !== undefined ? opts.depth : y + (opts.dz || 0));
    if (opts.flipX) img.setFlipX(true);
    if (opts.anim) this.art.play(img, key, opts.anim);
    if (opts.pop !== false && this.scene.tweens) {
      const sy = img.scaleY;
      img.setScale(img.scaleX * 0.6, sy * 0.2).setAlpha(0);
      this.scene.tweens.add({ targets: img, scaleX: img.scaleX / 0.6, scaleY: sy, alpha: opts.alpha === undefined ? 1 : opts.alpha, duration: 380, ease: 'Back.Out', delay: opts.delay || 0 });
    } else if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
    this.props.push(img);
    return img;
  }
  /** a one-shot (or looping) fx sheet at x, y */
  fx(key, x, y, opts = {}) {
    if (this.cancelled) return null;
    const s = this.art.sheet ? this.art.sheet(this.scene, x, y, key, opts) : null;
    if (s) { s.setDepth(opts.depth !== undefined ? opts.depth : y + 50); if (opts.keep) this.props.push(s); }
    return s;
  }
  /** remove the props (with a soft poof on the bigger ones) */
  clearProps(poof = true) {
    for (const p of this.props) {
      if (!p || !p.scene) continue;
      if (poof && p.displayHeight > 60 && this.art.sheet) this.fx('fx_poof', p.x, p.y, { depth: p.depth + 1 });
      if (this.scene.tweens) this.scene.tweens.add({ targets: p, alpha: 0, duration: 260, onComplete: () => p.destroy() });
      else p.destroy();
    }
    this.props = [];
  }

  // ---------------------------------------------------------------- sound and camera
  sfx(key, opts) { const S = this.ctx.ports.sound; if (S && S.play) S.play(key, opts || {}); }
  playMusic(key) { const S = this.ctx.ports.sound; if (S && S.music) { S.music(key); this.music = key; } }
  stopMusic() { const S = this.ctx.ports.sound; if (this.music && S && S.music) S.music(null); this.music = null; }
  focus(x, y, ms) { const V = this.ctx.ports.view; if (V && V.focus) V.focus(x, y, ms || 900); }

  // ---------------------------------------------------------------- places
  /** a building's anchor ({ x, y, key }) by id or by asset key */
  building(idOrKey) {
    const W = this.ctx.ports.world;
    const list = W && W.buildings ? W.buildings() : [];
    return list.find((b) => b.id === idOrKey) || list.find((b) => b.key === idOrKey && b.ours) || list.find((b) => b.key === idOrKey) || null;
  }
  /** a point of a sprite def ('doorPoint', 'seatPoints' i …) relative to an anchor at (ax, ay) */
  point(key, ax, ay, name, i = 0) {
    const d = this.art.def(key);
    if (!d || !d[name]) return null;
    const v = Array.isArray(d[name][0]) ? d[name][i % d[name].length] : d[name];
    const dirs = d[name.replace(/Points?$/, 'Dirs')] || d[name.replace(/Point$/, 'Dir')];
    return { x: ax + v[0], y: ay + v[1], dir: Array.isArray(dirs) ? dirs[i % dirs.length] : dirs || null };
  }

  // ---------------------------------------------------------------- end
  cancel() {
    this.cancelled = true;
    for (const w of this.waits) w.resolve(false);
    this.waits = [];
    if (this.walks) { for (const w of this.walks) w.resolve(false); this.walks.clear(); }
    this.end();
  }
  end() {
    if (this.reserved && this.town.reserve) { this.town.reserve(this.name, null); this.reserved = false; }
    const W = this.ctx.ports.world;
    if (W && W.stage) for (const id of this.venues) W.stage(id, false, this.name);
    this.venues.clear();
    this.releaseAll();
    this.stopMusic();
    this.clearProps(!this.cancelled && !this.noPoof);
    if (this.town.despawn) for (const pid of this.extras) this.town.despawn(pid);
    this.extras = [];
  }
}
