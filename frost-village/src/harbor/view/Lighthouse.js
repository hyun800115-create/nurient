// 등대 (harbor_runtime view): after step 3, at night the lantern turns (the manifest's 8 light frames, 22.5° each,
// two opposite beams) and two long soft beams sweep the sea from the lens — ADD wedges on the ground plane at lens
// height (a container squashed 2:1), in step with the frame on the tower. The lens glows; the keeper waves from
// the door. By day: the idle frame, the keeper potters about.

import { BLD } from '../layout.js';
import { sdef, tex, beamTex, DEPTH } from './art.js';

const DEG = Math.PI / 180;
const SPEED = 90 * DEG;           // rad / s: one turn in 4 s (the art's 8 fps would be 2 s, too hurried for a lighthouse)
const PHASE = 3;                  // the frame whose near beam points screen-east (lighthouse_work_3)
const LENGTH = 1300;              // px: the beam's reach on the ground plane
const BEAM_ALPHA = 0.55;

export class Lighthouse {
  constructor(view) {
    this.v = view;
    this.sc = view.scene;
    this.b = BLD.h_lighthouse;
    this.def = sdef('lighthouse');
    this.frame = -2;
    this.ang = 0;
    this.beam = null;
    this.keeper = null;
    this.on = 0;                  // 0..1 (fades with the dusk)
  }

  img() { const r = this.v.statics.building('h_lighthouse'); return r && r.img; }
  lens() { const p = (this.def && this.def.fxPoints && this.def.fxPoints.light) || [0, -333]; return [this.b.x + p[0], this.b.y + p[1]]; }

  makeBeam() {
    const sc = this.sc, key = beamTex(sc);
    if (!key) return null;
    const [lx, ly] = this.lens();
    const c = sc.add.container(lx, ly).setDepth(DEPTH.FX - 28);
    c.setScale(1, 0.5);
    const mk = () => sc.add.image(0, 0, key).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setScale(LENGTH / 512, 1.7);
    c.add([mk(), mk()]);
    c.setVisible(false);
    return c;
  }

  update(dt) {
    const v = this.v, im = this.img();
    if (!im || !this.def) return;
    const alive = v.model.has('lighthouse');
    const want = alive ? Math.max(0, Math.min(1, (v.dark - 0.12) / 0.2)) : 0;
    this.on += (want - this.on) * Math.min(1, dt * 1.5);
    const lit = this.on > 0.02;
    this.ang = (this.ang + SPEED * dt) % (Math.PI * 2);
    // tower frame: the lantern turns in step with the beams
    const f = lit ? ((Math.floor(this.ang / (22.5 * DEG)) + PHASE) % 8 + 8) % 8 : -1;
    if (f !== this.frame) {
      const name = f < 0 ? 'lighthouse' : 'lighthouse_work_' + f;
      const tk = tex(this.def.atlas, name);
      if (tk) { im.setTexture(tk, name); this.frame = f; }
    }
    if (!v.near(this.b.x, this.b.y, LENGTH + 200)) { if (this.beam) this.beam.setVisible(false); this.keeperOff(); return; }
    if (lit) {
      if (!this.beam) this.beam = this.makeBeam();
      if (this.beam) {
        // CCW on screen (the art's sense): screen angle of the near beam = -(ang) (frame PHASE = east)
        const a = -this.ang;
        this.beam.list[0].setRotation(a);
        this.beam.list[1].setRotation(a + Math.PI);
        this.beam.setAlpha(BEAM_ALPHA * this.on).setVisible(true);
      }
      const [lx, ly] = this.lens();
      v.glow(lx, ly, 1.5, this.on);
    } else if (this.beam) this.beam.setVisible(false);
    this.keeperUpdate(lit);
  }

  keeperUpdate(lit) {
    const v = this.v;
    if (!v.model.has('lighthouse') || !v.dollsOn()) { this.keeperOff(); return; }
    const sp = (this.def.staffPoints && this.def.staffPoints[0]) || [-96, 20];
    if (!this.keeper) this.keeper = v.takeRig({ who: 'keeper', look: { preset: 'lighthouse_keeper', seed: 881 } });
    if (!this.keeper) return;
    const x = this.b.x + sp[0], y = this.b.y + sp[1];
    const wave = lit ? (Math.floor(v.t / 1.6) % 3 === 0) : (Math.floor(v.t / 3) % 4 === 0);
    this.keeper.play(wave ? 'wave' : 'idle', 'SW');
    this.keeper.place(x, y, this.b.y + 1);
  }
  keeperOff() { if (this.keeper) { this.v.dropRig(this.keeper); this.keeper = null; } }

  destroy() { if (this.beam) this.beam.destroy(); this.keeperOff(); }
}
