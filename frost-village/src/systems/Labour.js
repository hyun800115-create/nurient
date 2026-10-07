// Division of labour (v3.5, docs/기획서_v3_분업.md): every processing station only works while
// somebody OPERATES it.
//   - OperatorSpot: a pad next to the station. The chief stands on it to work the station himself
//     (he plays the station's work motion, fish he carries hops into the grill). Hiring an operator
//     (요리사 쿡, 제재공 산들, 빵집 아주머니, 대장장이 언니, 훈제사 연기, 도구 장인, 통조림 기술자 통통)
//     takes the spot over for good: the operator stands at the work spot facing the station and plays
//     `operate` (impactFrame / beats synced with sounds and particles), and waits with a little emote
//     when there is nothing to do.
//   - Pile: the collection pile of a production line (the fish crate at the net, the log pile, the wheat
//     pile, the ore pile, the meat rack). Gatherers drop there instead of at the station; the chief or a
//     raw porter carries the pile to the station's input.
// Numbers: balance.js `labour`; places: world.js `labour`; texts: strings.js.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { DIR_BASE, DIR_FLIP } from '../core/Iso.js';
import { DEPTH } from './DepthSort.js';
import { Pad } from '../entities/Pad.js';
import { ItemStack } from '../entities/ItemStack.js';
import { Character } from '../entities/Character.js';
import { panel } from '../core/Panel.js';

const DIR8 = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };

/** sounds / particles of each station's work: impact = the anim's impactFrame, beat = beats[1] */
const OP_FX = {
  grill:      { impact: { burst: 'flame', n: 2 }, beat: { sfx: 'sfx_sizzle', vol: 0.32, burst: 'smoke', n: 1 }, emote: 'emote_fish' },
  sawmill:    { impact: { sfx: 'sfx_saw_short', alt: 'sfx_saw', vol: 0.3, burst: 'wood', n: 5 }, beat: { burst: 'dust', n: 2 }, emote: 'emote_dots' },
  bakery:     { impact: { burst: 'flour', n: 5 }, beat: null, cycle: { sfx: 'sfx_oven', vol: 0.3, every: 3 }, emote: 'emote_bread' },
  smelter:    { impact: { sfx: 'sfx_hammer', vol: 0.32, burst: 'spark', n: 6 }, beat: { burst: 'spark', n: 2 }, emote: 'emote_dots' },
  smokehouse: { impact: { burst: 'smoke', n: 1 }, beat: { sfx: 'sfx_whoosh', vol: 0.22, burst: 'smoke', n: 2 }, emote: 'emote_dots' },
  toolsmith:  { impact: { sfx: 'sfx_hammer', vol: 0.32, burst: 'spark', n: 6 }, beat: null, emote: 'emote_idea' },
  cannery:    { impact: { sfx: 'sfx_smelt', vol: 0.22, burst: 'steam', n: 2 }, beat: { burst: 'spark', n: 1 }, emote: 'emote_fish' },
};

function sfxKey(k, alt) {
  if (!k) return null;
  if (Assets.audioDef(k) || Assets.audioGroup(k)) return k;
  if (alt && (Assets.audioDef(alt) || Assets.audioGroup(alt))) return alt;
  return null;
}

/** play one work cue (sfx + particles) at world point (x, y) */
function cue(gs, c, x, y, depth) {
  if (!c || !gs.isOnScreen(x, y, 80)) return;
  const k = sfxKey(c.sfx, c.alt);
  if (k) gs.sfxAt(k, x, y, { volume: c.vol || 0.3, throttle: 260 });
  if (c.burst) gs.effects.burst(c.burst, x, y, c.n || 2);
  void depth;
}

// ===================================================================== operator spot
export class OperatorSpot {
  /** station: a Station or Workshop; cfg: world.js labour.ops[id] (positions relative to the station) */
  constructor(gs, station, cfg) {
    this.gs = gs; this.station = station; this.cfg = cfg || {};
    this.id = station.id;
    const c = this.cfg;
    const pd = c.pad || [-70, 40];
    this.x = station.x + pd[0]; this.y = station.y + pd[1];
    // (v3.5 review) the "stand here" pad (two footprints, like the register spot) — not the red hammer
    // pad of a build plot; the station's product shows what working here makes
    const tex = Assets.pick('ui_pad_register', 'ui_pad_input');
    this.pad = new Pad(gs, this.x, this.y, 'input', 1.3, { tex, tint: tex === 'ui_pad_register' ? 0xfff2c0 : 0xffd27a });
    // small floating label "서서 굽기"
    const lab = gs.add.container(this.x, this.y - 48).setDepth(this.y + 1990);
    this.labelText = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '19px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0.5, 0.5);
    this.labelBg = panel(gs, 0, 0, 'ui_panel', 100, 40).setOrigin(0.5, 0.5).setAlpha(0.94);
    lab.add([this.labelBg, this.labelText]);
    this.label = lab;
    this.labelBaseY = this.y - 48;
    this.refresh();
    // where the operator stands and which way it faces
    const o = c.op || pd;
    this.post = { x: station.x + o[0], y: station.y + o[1] };
    this.dir = DIR8[c.dir] !== undefined ? DIR8[c.dir] : 7;
    this.chiefDir = DIR8[c.chiefDir] !== undefined ? DIR8[c.chiefDir] : null;
    this.who = c.who || null;
    this.operator = null;
    this.chief = false;
    this.feedT = 0;
    this.enabled = true;
    this.shown = true;
    this.fx = OP_FX[this.id] || {};
    this.cycles = 0;
    this.needT = 0;
  }

  refresh() {
    this.labelText.setText(t('opSpot_' + this.id));
    this.labelBg.setSize(Math.max(84, this.labelText.width + 30), 40);
  }

  /** someone works the station right now */
  get active() { return this.enabled && (this.chief || !!(this.operator && this.operator.ready)); }
  get hired() { return !!this.operator; }

  setEnabled(v) {
    this.enabled = v;
    const show = v && !this.operator;
    this.pad.setVisible(show); this.label.setVisible(show);
    if (this.operator) { this.operator.sprite.setVisible(v); this.operator.shadow.setVisible(v); }
  }

  revealObjects() { return this.operator ? [] : [this.pad.img, this.label]; }

  /** returns true while the chief stands on the spot */
  update(dt) {
    const gs = this.gs, p = gs.player, st = this.station;
    if (this.operator) { this.operator.update(dt); this.chief = false; return false; }
    if (!this.enabled || !st.enabled) { this.chief = false; return false; }
    const on = this.pad.contains(p.x, p.y);
    this.chief = on;
    this.label.y = this.labelBaseY + Math.sin(gs.time.now / 430 + this.x * 0.01) * 3;
    // the station waits for its worker: the label calls a little louder
    const waiting = !on && st.hasWork && st.hasWork();
    this.needT = waiting ? this.needT + dt : 0;
    const la = on ? 0 : 1;
    if (Math.abs(this.label.alpha - la) > 0.01) this.label.setAlpha(this.label.alpha + (la - this.label.alpha) * Math.min(1, dt * 10));
    const k = waiting ? 1 + Math.max(0, Math.sin(gs.time.now / 160)) * 0.08 : 1;
    if (this.label.scale !== k) this.label.setScale(k);
    if (on) {
      // the chief's input hops into the station from here (no need to stop at the input pad first)
      this.feedT -= dt;
      if (this.feedT <= 0 && st.feedFrom && st.acceptsFromChief && st.acceptsFromChief(p)) { if (st.feedFrom(p)) { this.feedT = BALANCE.player.padItemInterval; st.inPad.pulse(); } }
      if (p.vx === 0 && p.vy === 0) p.operating = this;
    }
    return on;
  }

  /** the motion and facing of the chief while he works here */
  chiefAnim() { return this.cfg.chiefAnim || 'idle'; }
  faceFor(ch) {
    if (this.chiefDir !== null) { if (ch.dir !== this.chiefDir) { ch.dir = this.chiefDir; ch.play(ch.animName, true); } return; }
    const fp = this.cfg.face ? { x: this.station.x + this.cfg.face[0], y: this.station.y + this.cfg.face[1] } : this.station;
    ch.faceTo(fp.x, fp.y);
  }

  /** the chief's work motion hit its impact frame: the station's cue at his hands */
  chiefImpact(ch) {
    if (!this.station.working) return;
    const ip = ch.impactPoint();
    cue(this.gs, this.fx.impact, ip.x, ip.y);
    if (this.fx.beat && this.fx.beat.sfx) cue(this.gs, { sfx: this.fx.beat.sfx, vol: this.fx.beat.vol }, ip.x, ip.y);
  }

  /** hire the operator: it walks from (x, y) to the work spot (instant: stands there already) */
  hire(instant, x, y) {
    if (this.operator) return this.operator;
    const gs = this.gs;
    const want = this.who && Assets.m.characters[this.who] ? this.who : 'villager_b';
    let key = want;
    if (!Assets.charReady(want)) key = Assets.charReady('villager_b') ? 'villager_b' : 'villager_a';
    const sx = instant || x === undefined ? this.post.x : x, sy = instant || y === undefined ? this.post.y : y;
    const op = new Operator(gs, this, key, sx, sy);
    op.wantKey = want !== key ? want : null;
    if (instant) op.arrive();
    else {
      gs.effects.sheet('fx_poof', op.x, op.y - 30, { size: 170 });
      gs.effects.burst('star', op.x, op.y - 40, 12);
      op.sprite.setScale(0.1);
      gs.tweens.add({ targets: op.sprite, scale: 1, duration: 420, ease: 'Back.easeOut' });
    }
    this.operator = op;
    gs.keysInUse.add(want);
    if (key !== want) gs.keysInUse.add(key);
    if (gs.life) { gs.life.release(want); if (key !== want) gs.life.release(key); }
    this.pad.setVisible(false); this.label.setVisible(false);
    this.chief = false;
    if (!this.station.enabled) { op.sprite.setVisible(false); op.shadow.setVisible(false); }
    return op;
  }
}

// ===================================================================== operator
export class Operator extends Character {
  constructor(gs, spot, key, x, y) {
    super(gs, key, x, y, { radius: 12, dir: spot.dir });
    this.spot = spot;
    this.state = 'go';
    this.noXray = true;         // standing behind a counter / at a machine is the intended look
    this.idleT = 0;
    this.emoteT = 3 + Math.random() * 3;
    this.checkT = 1;
    this.waveCd = 4;
    this.onImpact = () => this.impact();
    this.lastFrame = -1;
    this.cycleN = 0;
  }

  get ready() { return this.state === 'post'; }

  arrive() {
    const s = this.spot.post;
    this.x = s.x; this.y = s.y;
    this.state = 'post';
    this.vx = this.vy = 0;
    this.dir = this.spot.dir;
    this.play('idle', true);
    this.sync(0);
  }

  /** the work anim's impact frame (operate: the flip / hammer hit / push; a worker look: the swing) */
  impact() {
    if (this.state !== 'post' || !this.spot.station.working) return;
    const ip = this.impactPoint();
    cue(this.gs, this.spot.fx.impact, ip.x, ip.y);
  }

  /** beats[1] (catch sizzle, fan whoosh, the cut...) and a once-per-loop cue */
  _onFrame(anim, frame) {
    super._onFrame(anim, frame);
    if (this.state !== 'post' || this.animRes !== 'operate' || !this.spot.station.working) return;
    const ad = this.def.anims.operate;
    const idx = frame.index - 1;
    if (idx === this.lastFrame) return;
    this.lastFrame = idx;
    const b = ad && Array.isArray(ad.beats) && ad.beats[1];
    if (b && b.frame === idx && b.frame !== ad.impactFrame && this.spot.fx.beat) {
      const base = DIR_BASE[this.dir], flip = DIR_FLIP[this.dir];
      const pt = (b.point && b.point[base]) || [0, -30];
      cue(this.gs, this.spot.fx.beat, this.x + (flip ? -pt[0] : pt[0]), this.y + pt[1]);
    } else if (b && b.frame === idx && this.spot.fx.beat && this.spot.fx.beat.sfx) {
      cue(this.gs, { sfx: this.spot.fx.beat.sfx, vol: this.spot.fx.beat.vol }, this.x, this.y - 40);
    }
    const cy = this.spot.fx.cycle;
    if (cy && idx === 0 && ++this.cycleN % (cy.every || 3) === 0) cue(this.gs, cy, this.x, this.y - 40);
  }

  /** one operate loop lasts one station cycle (the art and the products keep the same beat) */
  syncSpeed() {
    const st = this.spot.station;
    const per = Math.max(0.2, Number(st.bal && st.bal.time) || 1);
    const ad = this.def.anims[this.animRes];
    if (!ad) return;
    const loop = (ad.frames || 8) / Math.max(1, ad.fps || 10);
    const k = Math.max(0.5, Math.min(2, loop / per));
    if (Math.abs(this.sprite.anims.timeScale - k) > 0.01) this.sprite.anims.timeScale = k;
  }

  update(dt) {
    const gs = this.gs, st = this.spot.station;
    // the real art arrived after the title: swap the stand-in look
    if (this.wantKey) {
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = 1;
        if (Assets.charReady(this.wantKey)) { gs.keysInUse.delete(this.key); this.reskin(this.wantKey); gs.keysInUse.add(this.wantKey); this.wantKey = null; }
      }
    }
    if (this.state === 'go') {
      const s = this.spot.post;
      const d = gdist(this.x, this.y, s.x, s.y);
      if (d > 110) gs.moveAgent(this, s.x, s.y, BALANCE.workers.speed, dt, 10);
      else {
        // the last steps up to the machine: no collision push-out
        const dx = s.x - this.x, dy = s.y - this.y, L = Math.hypot(dx, dy);
        const step = Math.min(L, BALANCE.workers.speed * 0.8 * dt);
        if (L > 0.5) { this.vx = (dx / L) * 100; this.vy = (dy / L) * 100; this.x += (dx / L) * step; this.y += (dy / L) * step; this.face(dx, dy); this.locomotion(true); }
        if (L - step < 2) { this.arrive(); this.dir = 2; this.play('wave', true); this.idleT = -1.2; }
      }
      this.sync(dt);
      return;
    }
    this.vx = this.vy = 0;
    if (st.working) {
      this.idleT = 0;
      if (this.dir !== this.spot.dir) this.dir = this.spot.dir;
      if (this.animName !== 'operate') { this.play('operate', true); this.lastFrame = -1; }
      else this.play('operate');
      this.syncSpeed();
    } else {
      if (this.sprite.anims.timeScale !== 1) this.sprite.anims.timeScale = 1;
      this.idleT += dt;
      if (this.idleT >= 0 && this.animName !== 'idle' && this.animName !== 'wave' && this.animName !== 'happy') { this.dir = this.spot.dir; this.play('idle', true); }
      if (this.idleT > 0 && (this.animName === 'wave' || this.animName === 'happy') && this.idleT > 1.4) { this.dir = this.spot.dir; this.play('idle', true); }
      // little signs of waiting: an emote now and then, a wave to the chief walking by
      this.emoteT -= dt;
      this.waveCd -= dt;
      const p = gs.player;
      const onScreen = gs.isOnScreen(this.x, this.y, 60);
      if (onScreen && this.waveCd <= 0 && gdist(p.x, p.y, this.x, this.y) < 150 && (p.vx || p.vy)) {
        this.waveCd = 18 + Math.random() * 10;
        this.faceTo(p.x, p.y);
        this.play('wave', true);
        this.idleT = 0.01;
      } else if (onScreen && this.emoteT <= 0 && gs.life) {
        this.emoteT = 7 + Math.random() * 6;
        const k = this.idleT > 25 ? 'emote_zzz' : (this.spot.fx.emote || 'emote_dots');
        gs.life.bubbles.emote(this, Assets.pick(k, 'emote_dots'), 1.8);
      }
    }
    this.sync(dt);
  }
}

// ===================================================================== collection pile
export class Pile {
  /** cfg: world.js labour.piles[id] — { x, y, item, station, worker, prop, propAt } */
  constructor(gs, id, cfg) {
    this.gs = gs; this.id = id; this.cfg = cfg;
    this.x = cfg.x; this.y = cfg.y;
    this.item = cfg.item;
    this.station = cfg.station;
    this.enabled = true;
    this.shown = false;
    const max = Math.max(4, Math.floor(Number(BALANCE.labour && BALANCE.labour.pileMax)) || 40);
    this.pad = new Pad(gs, this.x, this.y, 'output', 1.45, { icon: cfg.item, iconSize: 44, tint: 0xf3e2c4 });
    // (v3.5 review) a wide, low heap: 7 little towers, never drawn higher than 6 items (a full pile is not a skyscraper)
    this.stack = new ItemStack(gs, { scale: 0.9, cols: [[-30, -10], [0, -12], [30, -10], [-16, 2], [16, 2], [-30, 12], [30, 12]], alternate: true, max, drawMax: 42 });
    // the prop that marks the place (a fish crate / log pile / hay / ore crate / a meat rack)
    this.props = [];
    const pa = cfg.propAt || [0, -40];
    if (cfg.prop === 'rack') this.buildRack(this.x + pa[0], this.y + pa[1]);
    else if (cfg.prop) {
      const img = Assets.image(gs, this.x + pa[0], this.y + pa[1], cfg.prop).setDepth(this.y + pa[1]);
      if (cfg.propScale) img.setScale(cfg.propScale);
      this.props.push(img);
      this.obstacle = gs.collision.add(this.x + pa[0], this.y + pa[1], cfg.propR || 22, 'pile');
    }
    // label "그물 더미"
    const ly = Number(cfg.labelY) || -92;     // (v3.5 review) the meat rack's name floats above its beam
    const lab = gs.add.container(this.x, this.y + ly).setDepth(this.y + 1990);
    this.labelText = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '18px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0.5, 0.5);
    this.labelBg = panel(gs, 0, 0, 'ui_panel', 100, 38).setOrigin(0.5, 0.5).setAlpha(0.9);
    lab.add([this.labelBg, this.labelText]);
    this.label = lab;
    this.labelBaseY = this.y + ly;
    this.refresh();
    this.setShown(false);
  }

  /** a meat drying rack drawn from existing pieces: two posts, a log beam, hanging meat */
  buildRack(x, y) {
    const gs = this.gs;
    const a = Assets.image(gs, x - 40, y - 2, 'fence_post').setDepth(y - 2);
    const b = Assets.image(gs, x + 40, y + 2, 'fence_post').setDepth(y + 2);
    const beam = Assets.image(gs, x, y - 52, 'item_log').setDepth(y + 1);
    beam.setScale(2.0, 1.2).setAngle(-6);
    this.props.push(a, b, beam);
    this.hang = [];
    for (let i = 0; i < 3; i++) {
      const m = Assets.image(gs, x - 22 + i * 22, y - 36 + i * 0.6, 'item_meat_raw').setDepth(y + 1.5).setAngle(78).setScale(0.75);
      this.props.push(m); this.hang.push(m);
    }
    this.obstacle = gs.collision.add(x, y, 40, 'pile');
  }

  refresh() {
    this.labelText.setText(this.fullShown ? t('pile_' + this.id) + ' · ' + t('pileFull') : t('pile_' + this.id));
    this.labelBg.setSize(Math.max(84, this.labelText.width + 28), 38);
  }

  get room() { return this.stack.room; }
  get count() { return this.stack.count; }

  setShown(v, pop) {
    this.shown = v;
    const vis = v && this.enabled;
    this.pad.setVisible(vis); this.label.setVisible(vis);
    for (const o of this.props) o.setVisible(vis);
    this.stack.setVisible(vis);
    if (this.obstacle) this.obstacle.active = vis;
    if (vis && pop) {
      const gs = this.gs;
      for (const o of [this.pad.img, this.label].concat(this.props)) {
        const sx = o.scaleX, sy = o.scaleY;
        o.setScale(0.01);
        gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 420, ease: 'Back.easeOut' });
      }
      gs.effects.sheet('fx_poof', this.x, this.y - 20, { size: 150 });
    }
  }

  setEnabled(v) { this.enabled = v; this.setShown(this.shown); }
  revealObjects() { return this.shown ? [this.pad.img].concat(this.props) : []; }

  update(dt) {
    this.stack.layout(this.x, this.y + 6, this.y, 0, dt);
    if (!this.shown || !this.enabled) return false;
    const gs = this.gs;
    this.label.y = this.labelBaseY + Math.sin(gs.time.now / 470 + this.x * 0.02) * 3;
    if (this.hang) { const n = this.stack.count; for (let i = 0; i < this.hang.length; i++) this.hang[i].setVisible(n > i * 3); }
    const p = gs.player;
    const on = this.pad.contains(p.x, p.y);
    const la = on ? 0.3 : 0.92;
    if (Math.abs(this.label.alpha - la) > 0.01) this.label.setAlpha(this.label.alpha + (la - this.label.alpha) * Math.min(1, dt * 10));
    // a full pile (the gatherers wait) calls a little louder — only while the chief can do something
    // about it (no raw porter carries it yet and the station has room); the label says "가득"
    const full = this.needsHand();
    if (full !== this.fullShown) {
      this.fullShown = full;
      this.labelText.setText(full ? t('pile_' + this.id) + ' · ' + t('pileFull') : t('pile_' + this.id));
      this.labelText.setColor(full ? '#b8322a' : '#2b2f3a');
      this.labelBg.setSize(Math.max(84, this.labelText.width + 28), 38);
      if (this.labelBg.setTint) { if (full) this.labelBg.setTint(0xffd6cc); else this.labelBg.clearTint(); }
    }
    const k = full ? 1 + Math.max(0, Math.sin(gs.time.now / 160)) * 0.12 : 1;
    if (this.label.scale !== k) this.label.setScale(k);
    return on;
  }

  /** (v3.5 review) full, nobody carries it on, and the station could take it: the chief's job */
  needsHand() {
    if (this.stack.count < this.stack.max - 1) return false;
    const gs = this.gs;
    if (gs.rawPorters && gs.rawPorters.some((r) => r.pile === this)) return false;
    const st = gs.stations && gs.stations[this.station];
    return !!(st && st.enabled && st.inStack.room > 0);
  }

  /** a gatherer drops one item (true if one moved) */
  feedFrom(ch) {
    if (this.stack.room <= 0) return false;
    return this.gs.moveItem(ch.stack, this.stack, this.item, { dur: 240, height: 60, sfx: 'drop' });
  }

  /** the chief / a porter takes one item */
  takeTo(ch, capacity) {
    if (this.stack.count === 0) return false;
    if (ch.stack.count + ch.stack.incoming >= capacity) return false;
    return this.gs.moveItem(this.stack, ch.stack, this.item, { dur: 230, height: 55, sfx: 'pickup' });
  }

  serialize() { return this.stack.count + this.stack.incoming; }
  restore(n) {
    const fx = this.gs.effects;
    for (let k = 0; k < Math.min(Math.max(0, Math.floor(n) || 0), this.stack.max); k++) this.stack.push(this.item, null, fx);
  }
}

/** the line each gatherer / raw item belongs to (pile id) */
export const PILE_OF_WORKER = { fisherman: 'fish', lumberjack: 'log', farmer: 'wheat', miner: 'ore', hunter: 'meat' };
export const PILE_OF_STATION = { grill: 'fish', sawmill: 'log', bakery: 'wheat', smelter: 'ore', smokehouse: 'meat' };
export const OPERATED = ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse', 'toolsmith', 'cannery'];
