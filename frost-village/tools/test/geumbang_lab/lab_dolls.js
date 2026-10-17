// The lab's `ports.dolls`: paper-doll rigs on the merged townfolk + officefolk + geumbangfolk manifest (the v4.3 set)
// through tools/geumbangfolk_compose.js (canPlay, pickAnim fallbacks, boxPoint / handPoint / bellPoint, parcelDepth).
// In the game the same contract is the v4 DollSprite runtime after installGeumbangfolkRuntime (Integration G-P5).
// Rig: play(anim, dir, { noItems }) · place(x, y, depth, alpha) · visible(on) · update(dt s) · parcelPoint() [bx, by]
//      · boxPoint() [cx, cy, bx, by] · handPoint() · bellPoint() · parcelDepth() · alpha · layers() · destroy()
// resident(aid, hid): a seeded household member (elder / child / adult by the household's people), so 정 할머니 is
// a grandmother at the door. Nothing here is game code.

import { Geumbangfolk, GeumbangfolkSprite } from '../../geumbangfolk_compose.js';
import { mulberry32 } from '../../townfolk_compose.js';

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

class Rig {
  constructor(dolls, person) {
    this.d = dolls; this.person = person;
    this.spr = new GeumbangfolkSprite(dolls.scene, dolls.gb, person, -9999, -9999);
    this.spr.has = () => true;
    this.shown = true; this.alphaV = 1; this.req = ''; this.count = -1;
    this.visible(false);
  }
  get alpha() { return this.alphaV; }
  play(anim, dir, o) {
    const s = this.spr, ni = !!(o && o.noItems);
    if (!!s.noItems !== ni) { s.noItems = ni; s._key = ''; }
    const k = anim + '|' + dir;
    if (k !== this.req) { this.req = k; s.play(anim, dir); }
    else if (s._key === '') s.refresh();
    this.sync();
  }
  /** after any refresh: hidden layers stay hidden, alpha holds */
  sync() {
    const s = this.spr;
    if (s.visibleCount !== this.count || !this.shown) {
      this.count = s.visibleCount;
      for (let j = 0; j < s.sprites.length; j++) s.sprites[j].setVisible(this.shown && j < s.visibleCount).setAlpha(this.alphaV);
    }
  }
  place(x, y, depth, alpha = 1) {
    const s = this.spr;
    s.x = Math.round(x); s.y = Math.round(y); s.depthBase = depth;
    if (alpha !== this.alphaV) { this.alphaV = alpha; for (const im of s.sprites) im.setAlpha(alpha); }
    s.place();
  }
  visible(on) {
    on = !!on;
    if (on === this.shown) return;
    this.shown = on;
    const s = this.spr;
    for (let j = 0; j < s.sprites.length; j++) s.sprites[j].setVisible(on && j < s.visibleCount);
  }
  update(dt) {
    if (!this.shown) return;
    const t0 = performance.now();
    this.spr.update(dt * 1000);
    this.sync();
    this.d.ms += performance.now() - t0;
  }
  boxPoint() { const s = this.spr; return this.d.gb.parcelPoint(this.person, s.anim, s.dir, s.frame); }
  parcelPoint() { const q = this.boxPoint(); return q ? [q[2], q[3]] : null; }
  handPoint() { const s = this.spr; return this.d.gb.handPointOf(this.person, s.anim, s.dir, s.frame); }
  bellPoint() { const s = this.spr; return s.anim === 'ring_doorbell' ? this.d.gb.bellPoint(this.person, s.dir, s.frame) : null; }
  parcelDepth() { const s = this.spr; return this.d.gb.parcelDepth(s.anim, s.dir); }
  layers() { return this.shown ? this.spr.visibleCount : 0; }
  destroy() { this.spr.destroy(); this.d.live.delete(this); }
}

export class LabDolls {
  constructor(scene, man, entries) {
    this.scene = scene;
    this.T = man.townfolk;
    const G = this.T.generator.presets;
    G.__elder = G.__elder || { bases: { elder_slim: 1, elder_round: 1 } };
    G.__child = G.__child || { bases: { child_slim: 1, child_round: 1 } };
    G.__adult = G.__adult || { bases: { adult_slim: 1, adult_round: 1 } };
    this.gb = new Geumbangfolk(this.T);
    this.entries = entries || [];
    this.live = new Set();
    this.ms = 0;
  }
  setEntries(e) { this.entries = e || []; }
  hub() { return this.T.hub || {}; }

  /** look: { preset, seed } | a person */
  make(look) {
    let p;
    if (look && look.base && look.parts) p = look;
    else p = this.gb.preset(look && look.preset && this.T.generator.presets[look.preset] ? look.preset : '__adult', mulberry32((look && look.seed) || 7));
    const r = new Rig(this, p);
    this.live.add(r);
    return r;
  }

  /** the household member who opens the door */
  resident(aid, hid) {
    const e = this.entries.find((q) => q.aid === aid);
    const hh = e ? (e.households.find((h) => h.hid === hid) || e.households[0]) : null;
    const who = hh && hh.people ? hh.people[0] : null;
    const kind = who ? who.kind : 'adult';
    const preset = kind === 'elder' ? '__elder' : kind === 'child' ? '__child' : '__adult';
    const r = new Rig(this, this.gb.preset(preset, mulberry32(hashStr(String(hid || aid)))));
    this.live.add(r);
    return r;
  }

  count() { let n = 0; for (const r of this.live) n += r.layers(); return n; }
}
