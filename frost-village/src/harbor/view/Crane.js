// The harbour crane and the import crates (harbor_runtime view): the crane's 8-frame loop follows the model's lift
// (model.craneFrame(): frame 0 hooks a crate on the ship, frame 5 sets it down on the quay; loading plays it
// backwards), drawn in front of the berthed cargo ship so the jib and the crate pass over its deck; the dock
// workers stand at the manifest's staff / work points and one of them carries every landed crate to the import
// pile by the warehouse; the pile shows what came in (labelled crates: 설탕, 천, 유리, 향신료).

import { BLD, SPOTS, LR } from '../layout.js';
import { sdef, tex, put, Chip, dirOf, DEPTH } from './art.js';
import { ht } from '../strings.js';

const KINDS = ['sugar', 'cloth', 'glass', 'spice'];
const WALK = 70;                  // px / s
const JIB_CUT = 112;              // px left of the crane's anchor: the jib's outer part (hook, crate) is drawn over the ship

export class Crane {
  constructor(view) {
    this.v = view;
    this.sc = view.scene;
    this.b = BLD.h_harbor_crane;
    this.def = sdef('harbor_crane');
    this.frame = -1;
    this.wob = 0;
    this.pile = [];               // { kind, img, chip }
    this.crew = [];               // { rig, home: [x, y], dir, job }
    this.jobs = 0;
  }

  img() { const r = this.v.statics.building('h_harbor_crane'); return r && r.img; }

  /** the crane's frame and depth this frame */
  update(dt) {
    const v = this.v, m = v.model, im = this.img();
    if (!im || !this.def) return;
    const alive = m.has('crane');
    const cf = alive ? m.craneFrame() : null;
    const want = cf ? Math.floor(cf.f) : -1;
    if (want !== this.frame) {
      const name = want < 0 ? 'harbor_crane' : 'harbor_crane_work_' + want;
      const tk = tex(this.def.atlas, name);
      if (tk) { im.setTexture(tk, name); this.frame = want; }
    }
    // the portal stands on the quay behind the berthed cargo ship (its bridge hides it), but the jib, the hook and
    // the crate work over the deck: a cropped copy of the jib's outer part is drawn in front of the ship
    const sp = m.crane.ship ? v.fleet.sprite(m.crane.ship) : null;
    if (sp && sp.on) {
      if (!this.front) this.front = this.sc.add.image(im.x, im.y, im.texture.key, im.frame.name).setOrigin(im.originX, im.originY);
      const F = this.front;
      if (F.texture.key !== im.texture.key || F.frame.name !== im.frame.name) F.setTexture(im.texture.key, im.frame.name);
      const fw = (this.def.frameSize && this.def.frameSize[0]) || im.frame.realWidth, fh = (this.def.frameSize && this.def.frameSize[1]) || im.frame.realHeight;
      F.setCrop(0, 0, Math.round(this.def.anchor[0] * fw) - JIB_CUT, fh);
      F.setPosition(im.x, im.y).setRotation(im.rotation).setDepth(sp.depth + 0.06).setVisible(true);
    } else if (this.front) this.front.setVisible(false);
    // P8: the wobbly crate (a little sway of the whole crane picture around its feet)
    if (this.wob > 0) { this.wob -= dt; im.setRotation(Math.sin(this.wob * 18) * 0.018 * Math.min(1, this.wob)); if (this.wob <= 0) im.setRotation(0); }
    if (alive && v.near(this.b.x, this.b.y, 500)) this.people(dt);
    else this.crewOff();
  }

  /** the signalman and two dock workers; one carries each landed import crate to the pile */
  people(dt) {
    const v = this.v;
    if (!v.dollsOn()) return;
    if (!this.crew.length) {
      const d = this.def, b = this.b;
      const spots = [[d.staffPoints[0], (d.staffDirs || ['N'])[0]], [d.workPoints[0], (d.workDirs || ['SW'])[0]], [d.workPoints[1], (d.workDirs || [, 'E'])[1] || 'E']];
      spots.forEach(([p, dir], k) => {
        const rig = v.takeRig({ who: 'crane:' + k, look: { preset: 'dock_worker', seed: 4100 + k * 13 } });
        if (rig) this.crew.push({ rig, home: [b.x + p[0], b.y + p[1]], dir, x: b.x + p[0], y: b.y + p[1], job: null, anim: 'idle' });
      });
    }
    const cf = v.model.craneFrame();
    for (const c of this.crew) {
      let anim = 'idle', dir = c.dir;
      if (c.job) {
        const j = c.job, tgt = j.pts[j.k];
        const dx = tgt[0] - c.x, dy = tgt[1] - c.y, L = Math.hypot(dx, dy * 2);
        const step = WALK * dt;
        if (L <= step) { c.x = tgt[0]; c.y = tgt[1]; j.k++; if (j.k === 1 && j.onDrop) { j.onDrop(); j.onDrop = null; } if (j.k >= j.pts.length) c.job = null; }
        else { c.x += dx * step / L; c.y += dy * step / L; }
        anim = j.k === 0 ? 'carry_walk' : 'walk';
        dir = dirOf(dx, dy);
      } else if (c === this.crew[0] && cf) { anim = (Math.floor(v.t * 1.5) % 2) ? 'wave' : 'idle'; dir = 'SW'; }
      c.rig.play(anim, dir);
      c.rig.place(c.x, c.y, c.y + 0.5);
    }
  }
  crewOff() { while (this.crew.length) this.v.dropRig(this.crew.pop().rig); }

  /** model events: 'crane' pick / drop / slot */
  onModel(ev) {
    const v = this.v;
    if (ev.t === 'harbor:import') { this.refreshPile(); return; }
    if (ev.t !== 'crane') return;
    if (ev.op === 'start' && v.near(this.b.x, this.b.y, 300)) v.sound('sfx_crane', this.b.x, this.b.y, { volume: 0.55 });
    if (ev.op === 'drop' && ev.dir === 'unload') {
      const [dx, dy] = LR(SPOTS.craneDrop.i, SPOTS.craneDrop.j);
      v.fx('fx_poof', dx, dy, 70, dy + 1);
      // the second worker carries it from the drop spot to the pile, then walks back
      const c = this.crew[1];
      const [px, py] = LR(SPOTS.importPile.i, SPOTS.importPile.j);
      if (c && !c.job) { c.x = dx; c.y = dy; c.job = { pts: [[px + 20, py + 12], c.home], k: 0, onDrop: () => this.refreshPile() }; }
      else this.refreshPile();
    }
  }

  /** the import pile: one labelled crate stack per kind on hand */
  refreshPile() {
    const v = this.v, st = v.model.trade.stock, lang = v.lang();
    const kinds = KINDS.filter((k) => (st[k] || 0) > 0);
    while (this.pile.length > kinds.length) { const p = this.pile.pop(); p.img.destroy(); p.chip.destroy(); }
    const [x0, y0] = LR(SPOTS.importPile.i, SPOTS.importPile.j);
    kinds.forEach((k, n) => {
      let p = this.pile[n];
      const x = x0 + n * 46, y = y0 + n * 23;
      if (!p) {
        const img = put(this.sc, 'crate_stack', x, y);
        if (!img) return;
        img.setScale(0.62);
        p = { img, chip: new Chip(this.sc, y + 40) };
        this.pile.push(p);
      }
      p.img.setPosition(x, y).setDepth(y);
      p.chip.set(x, y - 74, ht(lang, 'i_' + k) + ' ' + st[k], 0xfff4dc);
    });
  }

  wobble() { this.wob = 2.2; for (const c of this.crew) if (!c.job) { c.rig.play('happy', 'SW'); } }

  destroy() { if (this.front) this.front.destroy(); this.crewOff(); for (const p of this.pile) { p.img.destroy(); p.chip.destroy(); } this.pile = []; }
}
