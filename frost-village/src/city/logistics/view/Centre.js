// Centre — the cutaway building drawn the manifest's way (assets/logistics conventions.cutaway):
//   every layer and patch at the building anchor, depth = D + depthOffset (D = the anchor's y);
//   always drawn: _apron, _props (dock bumpers), the dock door leaves, one nameplate, the outdoor props;
//   the inside (back, floor, interior, lamp, racks, interior_front, conveyor, stub) only while the shell is see-through
//   or a dock door is open (they are hidden behind the opaque shell otherwise: fill-rate saved).
// Reveal: the shell + door leaves + nameplate fade to 0 and _shadow_open to 1 over fadeMs (and back).

import { def, spriteFrame, frameOf, spriteImage } from './art.js';

const INSIDE = ['back', 'floor', 'interior', 'interior_racks', 'interior_front', 'stub'];

export class Centre {
  constructor(view, man) {
    this.v = view;
    const sc = this.scene = view.scene;
    const C = this.C = man.sprites.logistics_center;
    this.bx = view.bx; this.by = view.by; this.D = view.D;
    this.layers = {};
    this.lang = view.lang;
    const put = (key) => {
      const d = def(key); const f = spriteFrame(key, d && d.frame);
      if (!d || !f) return null;
      const im = sc.add.sprite(this.bx, this.by, f.tex, f.frame).setOrigin(d.anchor[0], d.anchor[1]).setDepth(this.D + (d.depthOffset || 0));
      im.lgxKey = key;
      return im;
    };
    for (const n of Object.keys(C.layers)) {
      if (n === 'nameplate_ko' || n === 'nameplate_en') continue;
      this.layers[n] = put(C.layers[n]);
    }
    this.nameplate = put(C.nameplates[this.lang === 'en' ? 'en' : 'ko']);
    if (this.layers.shell_cut) this.layers.shell_cut.setAlpha(0).setVisible(false);
    if (this.layers.shadow_open) this.layers.shadow_open.setAlpha(0);
    this.patch = {};
    for (const [n, key] of Object.entries(C.patches)) this.patch[n] = put(key);
    this.doorFrames = {};
    for (const b of [1, 2]) {
      const d = def(C.patches['dock' + b]);
      this.doorFrames[b] = d && d.anims && d.anims.dock_door ? d.anims.dock_door.frames : [];
    }
    const conv = def(C.patches.conveyor);
    this.convFrames = conv && conv.anims && conv.anims.conveyor ? conv.anims.conveyor.frames : [];
    const lamp = def(C.patches.lamp);
    this.lampFrames = lamp && lamp.anims && lamp.anims.office_lamp ? lamp.anims.office_lamp.frames : [];
    this.convT = 0; this.convI = 0; this.lampT = 0; this.lampI = 0;
    // the outdoor props: y-sorted sprites with their own ground anchors
    this.props = [];
    for (const op of C.outdoorProps || []) {
      const im = spriteImage(sc, op.sprite, this.bx + op.point[0], this.by + op.point[1]);
      if (im) { im.setDepth(view.outside(this.bx + op.point[0], this.by + op.point[1])); this.props.push(im); }
    }
    this.shellA = 1;            // the reveal (1 = closed)
    this.tween = null;
    this.insideOn = true;
    this.setInside(false);
  }

  all() { return Object.values(this.layers).concat(Object.values(this.patch), [this.nameplate], this.props).filter(Boolean); }

  /** fade the shell to see-through (on) or back (off) */
  reveal(on, ms) {
    const target = on ? 0 : 1;
    if (this.tween) { this.tween.stop(); this.tween = null; }
    const o = { a: this.shellA };
    this.tween = this.scene.tweens.add({ targets: o, a: target, duration: ms, ease: 'Sine.easeInOut', onUpdate: () => this.setShell(o.a), onComplete: () => { this.setShell(target); this.tween = null; } });
  }
  setShell(a) {
    this.shellA = a;
    const L = this.layers;
    for (const im of [L.shell, this.nameplate, this.patch.dock1, this.patch.dock2]) if (im) im.setAlpha(a);
    if (L.shadow_open) L.shadow_open.setAlpha(1 - a);
  }

  setInside(on, force) {
    if (on === this.insideOn && !force) return;
    this.insideOn = on;
    const vis = on && this.shown !== false;
    for (const n of INSIDE) if (this.layers[n]) this.layers[n].setVisible(vis);
    for (const n of ['conveyor', 'lamp']) if (this.patch[n]) this.patch[n].setVisible(vis);
  }

  /** per frame: inside visibility, door frames, conveyor + lamp loops */
  update(dt, info) {
    const doorsOpen = info.doors[1] > 0 || info.doors[2] > 0;
    this.setInside(this.shellA < 0.999 || doorsOpen);
    for (const b of [1, 2]) {
      const p = this.patch['dock' + b], fr = this.doorFrames[b];
      if (!p || !fr.length) continue;
      const name = fr[Math.max(0, Math.min(fr.length - 1, info.doors[b]))];
      if (p.frame.name !== name) { const f = frameOf(def(this.C.patches['dock' + b]).atlas, name); if (f) p.setTexture(f.tex, f.frame); }
    }
    if (!this.insideOn) return;
    // the belt runs while goods are being picked / packed (frame 0 when paused)
    if (info.conveyor && this.convFrames.length) {
      this.convT += dt;
      if (this.convT >= 1 / 8) { this.convT -= 1 / 8; this.convI = (this.convI + 1) % this.convFrames.length; this.setPatch('conveyor', this.convFrames[this.convI]); }
    }
    // the office desk lamp glows softly (warmer while the clerk works)
    if (this.lampFrames.length) {
      this.lampT += dt;
      if (this.lampT >= 0.25) { this.lampT = 0; this.lampI = (this.lampI + 1) % this.lampFrames.length; this.setPatch('lamp', this.lampFrames[this.lampI]); }
    }
  }
  setPatch(n, name) { const p = this.patch[n]; if (!p || p.frame.name === name) return; const f = frameOf(def(this.C.patches[n]).atlas, name); if (f) p.setTexture(f.tex, f.frame); }

  setVisible(on) {
    this.shown = on;
    for (const im of this.all()) im.setVisible(on);
    if (this.layers.shell_cut) this.layers.shell_cut.setVisible(false);
    this.setInside(this.insideOn, true);
  }
  destroy() { for (const im of this.all()) im.destroy(); }
}
