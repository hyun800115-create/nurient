// A found animal trots behind the chief until it is home (E1 the lost puppy, E3 Ppoppi): a villager-character sprite
// (pet_dog drawn a little smaller as a puppy, pet_penguin) that follows the chief's trail a few steps behind, runs
// to catch up, waddles when close, sits when he stops; at home it hops happily with a heart and trots off. When the
// game can lead a resident itself (ports.people.follow, e.g. the real 뽀삐), that resident follows instead and no
// extra sprite is made. World space, depth sorted by y.

import { Assets } from './ui.js';

const KEYS = { puppy: { key: 'pet_dog', scale: 0.78 }, penguin: { key: 'pet_penguin', scale: 1 } };
const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };

function dirOf(dx, dy) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  if (a > -22.5 && a <= 22.5) return 'E';
  if (a > 22.5 && a <= 67.5) return 'SE';
  if (a > 67.5 && a <= 112.5) return 'S';
  if (a > 112.5 && a <= 157.5) return 'SW';
  if (a > 157.5 || a <= -157.5) return 'W';
  if (a > -157.5 && a <= -112.5) return 'NW';
  if (a > -112.5 && a <= -67.5) return 'N';
  return 'NE';
}

export class Followers {
  constructor(host) {
    this.host = host;
    this.s = host.ports.world.scene;
    this.list = new Map();       // mission id → follower
    this.trail = [];             // the chief's recent positions (newest last)
  }

  has(id) { return this.list.has(id); }
  count() { let n = 0; for (const f of this.list.values()) n += f.spr ? 2 : 0; return n; }

  /** start following: kind 'puppy' | 'penguin'; pid = a resident the game can lead instead of a sprite */
  add(id, kind, x, y, pid) {
    if (this.list.has(id)) return;
    const P = this.host.ports;
    if (pid && P.people.follow && P.people.has && P.people.has(pid)) { P.people.follow(pid, true); this.list.set(id, { pid, kind }); return; }
    const k = KEYS[kind] || KEYS.puppy;
    let spr = null, shadow = null;
    try {
      const def = Assets.charDef(k.key);
      spr = this.s.add.sprite(x, y, '__DEFAULT').setOrigin(def.anchor[0], def.anchor[1]).setScale(k.scale);
      shadow = this.s.add.ellipse(x, y, ((def.shadow || [40, 16])[0]) * k.scale, ((def.shadow || [40, 16])[1]) * k.scale, 0x3a4a6a, 0.16);
    } catch (e) { spr = null; }
    const f = { kind, key: k.key, spr, shadow, x, y, dir: 'S', anim: '', homeAt: null, t: 0 };
    this.list.set(id, f);
    this.pose(f, 'happy', 'S');
    this.heart(x, y - 60);
  }

  pose(f, anim, dir) {
    if (!f.spr) return;
    if (!Assets.hasAnim || !Assets.hasAnim(f.key, anim)) anim = anim === 'run' ? 'walk' : 'idle';
    const base = MIRROR[dir] || dir;
    if (f.anim === anim && f.dir === dir) return;
    try { f.spr.play(Assets.charAnim(f.key, anim, base), true); } catch (e) { /* (no such clip: keep the last) */ }
    f.spr.setFlipX(!!MIRROR[dir]);
    f.anim = anim; f.dir = dir;
  }

  heart(x, y) {
    if (!Assets.has('emote_heart')) return;
    const e = Assets.image(this.s, x, y, 'emote_heart').setDepth(40001).setScale(0.1);
    this.s.tweens.add({ targets: e, scale: 0.6, y: y - 30, duration: 320, ease: 'Back.easeOut' });
    this.s.tweens.add({ targets: e, alpha: 0, delay: 1100, duration: 300, onComplete: () => e.destroy() });
  }

  /** home: run to (x, y), hop, a heart, then trot away and fade */
  home(id, x, y) {
    const f = this.list.get(id);
    if (!f) return;
    if (f.pid) { const P = this.host.ports; if (P.people.follow) P.people.follow(f.pid, false); if (P.people.react) P.people.react(f.pid, 'happy', 'emote_heart'); this.list.delete(id); return; }
    f.homeAt = { x: x + 26, y: y + 18 };
    f.t = 0;
  }

  remove(id) {
    const f = this.list.get(id);
    if (!f) return;
    this.list.delete(id);
    if (f.pid) { const P = this.host.ports; if (P.people.follow) P.people.follow(f.pid, false); return; }
    if (f.spr) f.spr.destroy();
    if (f.shadow) f.shadow.destroy();
  }

  update(dt) {
    if (!this.list.size) { this.trail.length = 0; return; }
    const ch = this.host.ports.chief, cx = ch.x(), cy = ch.y();
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - cx, last.y - cy) > 6) { this.trail.push({ x: cx, y: cy }); if (this.trail.length > 60) this.trail.shift(); }
    let k = 0;
    for (const [id, f] of this.list) {
      if (f.pid || !f.spr) continue;
      f.t += dt;
      let tx, ty, gap = 0;
      if (f.homeAt) { tx = f.homeAt.x; ty = f.homeAt.y; }
      else {
        // a point on the chief's trail ~70 px behind him (a second follower a little further back)
        const want = 70 + k * 46;
        let acc = 0, p = { x: cx, y: cy };
        for (let i = this.trail.length - 1; i > 0; i--) {
          const a = this.trail[i], b = this.trail[i - 1], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (acc + d >= want) { const r = (want - acc) / Math.max(1, d); p = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r }; break; }
          acc += d; p = b;
        }
        tx = p.x; ty = p.y; gap = 12;
      }
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
      if (d > gap) {
        const sp = Math.min(d / dt, (d > 160 ? 330 : d > 60 ? 230 : 130)) * dt;
        f.x += (dx / d) * sp; f.y += (dy / d) * sp;
        this.pose(f, d > 120 ? 'run' : 'walk', dirOf(dx, dy));
      } else if (f.homeAt) {
        // home: a happy hop, a heart, then off it goes
        if (f.anim !== 'happy') { this.pose(f, 'happy', 'S'); this.heart(f.x, f.y - 60); }
        if (f.t > 1.8 && !f.leaving) {
          f.leaving = true;
          this.s.tweens.add({ targets: [f.spr, f.shadow], alpha: 0, duration: 700, delay: 500, onComplete: () => this.remove(id) });
        }
      } else this.pose(f, ch.moving() ? 'walk' : (f.kind === 'puppy' ? 'sit' : 'idle'), f.dir);
      f.spr.setPosition(f.x, f.y).setDepth(f.y);
      if (f.shadow) f.shadow.setPosition(f.x, f.y).setDepth(f.y - 1);
      k++;
    }
  }

  destroy() { for (const id of Array.from(this.list.keys())) this.remove(id); this.trail.length = 0; }
}
