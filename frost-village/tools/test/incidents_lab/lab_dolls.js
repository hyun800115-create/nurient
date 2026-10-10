// The lab's `ports.dolls`: paper-doll rigs on the merged townfolk + townfolk2 + cityfolk manifest through the cityfolk
// compositor (tools/cityfolk_compose.js: canPlay, pickAnim with the page-residency predicate, nozzlePoint,
// groundSpeed). In the game the same contract is a DollSprite after patch P5. Rigs are pooled; the lab counts which
// atlas frames people drew (for the texture report).
//
// rig: play(anim, dir) · setFace(expr) · place(x, y, depth, alpha) · visible(on) · update(ms) · anim · frame ·
//      groundSpeed(anim, dir) · nozzle(dir, frame) · headTop · layers() · release()

import { CityfolkSprite } from '../../cityfolk_compose.js';
import { mulberry32 } from '../../townfolk_compose.js';

const KID = /^child/, ELDER = /^elder/;

export class LabDolls {
  constructor(scene, tf, pages) {
    this.scene = scene;
    this.tf = tf;
    this.pages = pages;           // { resident(group) -> bool }
    this.free = [];
    this.live = 0;
    this.people = new Map();
    this.used = new Map();
    const P = tf.T.cfPages;
    this.has = (anim, person) => { const g = person ? tf.pageNeeded(person, anim) : tf.pageOf(anim); return !g || pages.resident(g, person && person.base); };
    void P;
  }

  /** a person for a look { preset?, seed, age? } (kids / elders by rejection sampling over seeds) */
  person(look) {
    const key = (look.preset || '') + ':' + (look.seed >>> 0) + ':' + (look.age || '');
    let p = this.people.get(key);
    if (p) return p;
    const tf = this.tf;
    const want = look.age === undefined ? null : look.age < 13 ? 'kid' : look.age >= 65 ? 'elder' : 'adult';
    for (let k = 0; k < 40; k++) {
      const r = mulberry32(((look.seed >>> 0) + k * 7919) >>> 0);
      p = look.preset && tf.T.generator.presets[look.preset] ? tf.preset(look.preset, r) : tf.randomPerson(r);
      const b = p.base;
      const cls = KID.test(b) ? 'kid' : ELDER.test(b) ? 'elder' : 'adult';
      if (!want || cls === want || look.preset) break;
    }
    this.people.set(key, p);
    return p;
  }

  make(look) {
    const S = this.scene, tf = this.tf, self = this;
    const person = this.person(look || { seed: 1 });
    let spr = this.free.pop();
    if (spr) { spr.person = person; spr.anim = 'idle'; spr.dir = 'S'; spr.frame = 0; spr.t = 0; spr._key = ''; spr.face = null; spr.fallbackFace = null; spr.refresh(true); }
    else spr = new CityfolkSprite(S, tf, person, -9999, -9999);
    spr.has = this.has;
    this.live++;
    let x = -9999, y = -9999, depth = 0, alpha = 1, shown = true, alive = true;
    const place = () => {
      for (let j = 0; j < spr.visibleCount; j++) { const s = spr.sprites[j]; s.setPosition(Math.round(x + s._dx), Math.round(y + s._dy)).setDepth(depth + s._z * 1e-4).setAlpha(alpha).setVisible(shown && alpha > 0.01); }
      for (let j = spr.visibleCount; j < spr.sprites.length; j++) spr.sprites[j].setVisible(false);
    };
    const orig = spr.refresh.bind(spr);
    spr.refresh = (force) => { const k0 = spr._key; orig(force); if (force || spr._key !== k0) { self.note(spr); place(); } };
    spr.place = place;
    const B = tf.T.bases[person.base];
    const head = KID.test(person.base) ? -96 : ELDER.test(person.base) ? -122 : -132;
    return {
      get anim() { return spr.anim; },
      get frame() { return spr.frame; },
      headTop: head,
      play(anim, dir) { spr.play(anim, dir); },
      setFace(f) { spr.setFace(f); },
      place(nx, ny, d, a) { x = nx; y = ny; depth = d; alpha = a === undefined ? 1 : a; place(); },
      visible(on) { shown = !!on; place(); },
      update(ms) { if (shown) spr.update(ms); },
      groundSpeed(anim, dir) { try { const v = tf.groundSpeed(person, spr.anim === anim ? anim : anim, dir); return v ? v : null; } catch (e) { return null; } },
      nozzle(dir, i) { try { return spr.anim === 'spray_hose' ? tf.nozzlePoint(person, spr.dir, i) : null; } catch (e) { return null; } },
      layers() { return spr.sprites.slice(0, spr.visibleCount); },
      release() {
        if (!alive) return;
        alive = false; self.live--;
        for (const s of spr.sprites) s.setVisible(false);
        spr.refresh = orig;
        if (self.free.length < 30) self.free.push(spr); else spr.destroy();
      },
      person, base: B,
    };
  }

  note(spr) {
    for (let j = 0; j < spr.visibleCount; j++) {
      const s = spr.sprites[j], k = s.texture.key;
      let set = this.used.get(k);
      if (!set) this.used.set(k, (set = new Set()));
      set.add(s.frame.name);
    }
  }
}
