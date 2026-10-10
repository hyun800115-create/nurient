// The lab's `ports.dolls`: paper-doll rigs on the merged townfolk + townfolk2 + beachfolk manifest through the
// beachfolk compositor (tools/beachfolk_compose.js — canPlay, pickAnim, animHideHead, sunbatheDirFor live there). In
// the game the same contract is a DollSprite after patch P5. Rigs are pooled (taken apart sprites are re-used), and the
// lab counts which atlas frames people really used (for the page-class texture estimate in the report).

import { BeachfolkSprite, nearestDir } from '../../beachfolk_compose.js';
import { MIRROR } from '../../townfolk_compose.js';

export class LabDolls {
  constructor(scene, bf) {
    this.scene = scene;
    this.bf = bf;
    this.free = [];
    this.live = 0;
    this.used = new Map();         // atlas -> Set(frame)
    this.track = true;
    this.ms = 0;                   // compositor time (show / at / update) — the DollSprite share of the view cost
  }

  rig(person, id) {
    const S = this.scene, bf = this.bf, self = this;
    let spr = this.free.pop();
    if (spr) { spr.person = person; spr.anim = 'idle'; spr.dir = 'S'; spr.frame = 0; spr.t = 0; spr._key = ''; spr.refresh(true); }
    else spr = new BeachfolkSprite(S, bf, person, -9999, -9999);
    this.live++;
    let depth = 0, x = 0, y = 0, shown = true, pinned = false, alive = true;
    let px = NaN, py = NaN, pd = NaN, ps = null, pk = null;     // what place() last wrote
    const place = () => {
      px = x; py = y; pd = depth; ps = shown; pk = spr._key;
      for (let j = 0; j < spr.visibleCount; j++) {
        const s = spr.sprites[j];
        s.setPosition(Math.round(x + s._dx), Math.round(y + s._dy)).setDepth(depth + s._z * 1e-4).setVisible(shown);
      }
    };
    const origRefresh = spr.refresh.bind(spr);
    // the compositor's refresh early-outs on an unchanged anim|dir|frame key; only a real change re-notes and re-places
    spr.refresh = (force) => { const k0 = spr._key; origRefresh(force); if (force || spr._key !== k0) { if (self.track) self.note(spr); place(); } };
    spr.place = place;
    const rig = {
      id,
      get anim() { return spr.anim; },
      get dir() { return spr.dir; },
      get frame() { return spr.frame; },
      show(anim, dir, frame) {
        const t0 = performance.now();
        const T = bf.T;
        const a = bf.pickAnim(person, anim).anim;
        const A = T.anims[a] || T.anims.idle;
        const d = nearestDir(A.dirs, dir || 'S');
        if (a !== spr.anim) { spr.anim = a; spr.frame = 0; spr.t = 0; }
        spr.dir = d;
        if (frame !== undefined) { pinned = true; spr.frame = Math.max(0, Math.min(A.frames - 1, frame)); } else pinned = false;
        spr.refresh();
        self.ms += performance.now() - t0;
      },
      at(nx, ny, d) { x = nx; y = ny; depth = d === undefined ? ny : d; if (Math.round(x) !== Math.round(px) || Math.round(y) !== Math.round(py) || depth !== pd || shown !== ps || spr._key !== pk) place(); },
      visible(on) { if (on !== shown) { shown = !!on; place(); } },
      alpha(a) { for (const s of spr.sprites) s.setAlpha(a); },
      update(ms) { if (!pinned && shown) { const t0 = performance.now(); spr.update(ms); self.ms += performance.now() - t0; } },
      layers() { return spr.visibleCount; },
      ballPoint(anim, d, i) { return bf.ballPoint(person, anim, d, i); },
      splashPoint(d) { try { return bf.splashPoint(person, d); } catch (e) { return null; } },
      lieShadow(d) { try { return bf.lieShadow(person, d); } catch (e) { return null; } },
      bodyK() { const B = bf.T.bases[person.base]; return (B && B.bodyK) || (/^child/.test(person.base) ? 0.7 : 1); },
      release() {
        if (!alive) return;
        alive = false; self.live--;
        shown = false; place();
        for (const s of spr.sprites) s.setVisible(false);
        spr.refresh = origRefresh;
        if (self.free.length < 24) self.free.push(spr); else spr.destroy();
      },
    };
    return rig;
  }

  note(spr) {
    for (let j = 0; j < spr.visibleCount; j++) {
      const s = spr.sprites[j], k = s.texture.key;
      let set = this.used.get(k);
      if (!set) this.used.set(k, (set = new Set()));
      set.add(s.frame.name);
    }
  }

  /** MiB of the frames people really drew (trimmed rects, RGBA) per atlas */
  usedMiB() {
    const out = {};
    let tot = 0;
    for (const [k, set] of this.used) {
      const tex = this.scene.textures.get(k);
      let px = 0;
      for (const f of set) { const fr = tex.get(f); if (fr) px += fr.cutWidth * fr.cutHeight; }
      out[k] = +(px * 4 / 1048576).toFixed(2);
      tot += px * 4;
    }
    return { per: out, total: +(tot / 1048576).toFixed(1) };
  }
}
void MIRROR;
