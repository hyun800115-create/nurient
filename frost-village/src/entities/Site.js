// Construction site (v3). An empty plot (site_plot_S/M/L + a build pad): standing on the pad opens
// the build menu. Choosing a building pays its coins and lays the foundation; then planks / ingots
// have to arrive at the drop pad (porters carry them along the roads, or the chief brings them).
// With every material there, the scaffold goes up, two carpenters hammer away for a while and the
// finished building pops in. Watchtowers use the same site (their pad is paid on the spot).

import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';
import { MATERIALS } from '../data/items.js';
import { t } from '../data/strings.js';
import { DEPTH } from '../systems/DepthSort.js';
import { PRIO } from '../systems/Logistics.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { Character } from './Character.js';
import { panel } from '../core/Panel.js';

const DIR_IDX = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };
const SIZE_FALLBACK = { S: { dropPoint: [2, 64], workPoints: [[-81, 27], [79, 29]], workDirs: ['NE', 'NW'], footprint: [181, 91] },
  M: { dropPoint: [2, 87], workPoints: [[-111, 35], [107, 37], [-66, 60]], workDirs: ['NE', 'NW', 'NE'], footprint: [272, 136] },
  L: { dropPoint: [2, 110], workPoints: [[-140, 43], [135, 46], [-79, 76]], workDirs: ['NE', 'NW', 'NE'], footprint: [362, 181] } };

/** the cost table entry of a building key (balance.js buildings / towers) */
export function buildCost(bkey, siteId) {
  if (bkey === 'watchtower') return (BALANCE.towers && BALANCE.towers[siteId]) || { coins: 300, item_plank: 10, item_ingot: 0, time: 8 };
  return (BALANCE.buildings && BALANCE.buildings[bkey]) || { coins: 100, item_plank: 6, item_ingot: 0, time: 8 };
}

export class Site {
  /**
   * cfg: world.js plot / tower { x, y, size, region, after, only }; kind: 'plot' | 'tower'
   */
  constructor(gs, id, cfg, kind = 'plot') {
    this.gs = gs; this.id = id; this.cfg = cfg; this.kind = kind;
    this.x = cfg.x; this.y = cfg.y;
    this.size = cfg.size || (kind === 'tower' ? 'S' : 'M');
    this.only = kind === 'tower' ? 'watchtower' : (cfg.only || null);
    this.state = 'plot';          // plot -> foundation -> scaffold -> done
    this.building = null;         // building key chosen
    this.need = {};               // material -> count
    this.buildT = 0;
    this.buildTime = 8;
    this.shown = true;
    this.enabled = false;         // as a logistics sink: only while the foundation waits for materials
    this.isWarehouse = false;
    this.builders = [];
    this.built = null;            // the finished building object
    const d = Object.assign({}, SIZE_FALLBACK[this.size], Assets.def('site_plot_' + this.size));
    this.def = d;
    const dp = d.dropPoint || [2, 80];
    this.dropX = this.x + dp[0]; this.dropY = this.y + dp[1];
    this.ux = this.dropX + 34; this.uy = this.dropY + 22;     // where porters stand to unload
    this.img = null;
    this.pad = null; this.dropPad = null; this.label = null; this.ring = null;
    this.stock = new ItemStack(gs, { scale: 0.85, cols: [[-18, -3], [18, 6]], typeCols: { item_plank: 0, item_ingot: 1 }, max: 999 });
    this.leaveNeeded = false;
    this.standT = 0;
    this.labelKey = '';
    if (kind === 'plot') this.makePlot();
  }

  // ------------------------------------------------------------------ visuals
  sprite(stage) { return 'site_' + stage + '_' + this.size; }

  makeImg(stage) {
    const gs = this.gs;
    if (!this.img) {
      const r = Assets.sprite(this.sprite(stage));
      this.img = gs.add.image(this.x, this.y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(this.y);
    } else Assets.apply(this.img, this.sprite(stage));
    this.img.setVisible(this.shown);
  }

  makePlot() {
    const gs = this.gs;
    this.makeImg('plot');
    this.img.setDepth(DEPTH.GROUND_DECAL + 5);     // a staked-out plot lies flat on the snow
    this.pad = new Pad(gs, this.dropX, this.dropY, 'build', 1.6, { tex: Assets.pick('ui_pad_build', 'ui_pad_hire'), radiusK: 0.8 });
    this.makeLabel();
  }

  makeLabel() {
    const gs = this.gs;
    if (this.label) return;
    const lab = gs.add.container(this.dropX, this.dropY - 60).setDepth(this.dropY + 2000);
    const bg = panel(gs, 0, 0, 'ui_panel', 120, 52).setOrigin(0.5, 0.5);
    const icon = Assets.image(gs, 0, 0, Assets.pick('ui_icon_hammer', 'ui_icon_lock')).setOrigin(0.5, 0.5);
    icon.setScale(36 / Math.max(icon.frame.realWidth, 1));
    const txt = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '21px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0, 0.5);
    lab.add([bg, icon, txt]);
    this.label = lab; this.labelBg = bg; this.labelIcon = icon; this.labelText = txt;
    this.labelExtra = [];
    this.labelBaseY = this.dropY - 60;
    this.refreshLabel();
  }

  /** floating label: "빈 부지 (M)" on a plot, material counts on a foundation */
  refreshLabel() {
    if (!this.label) return;
    const gs = this.gs;
    if (this.state === 'plot') {
      const k = 'plot:' + (this.only || this.size);
      if (k === this.labelKey) return;
      this.labelKey = k;
      for (const o of this.labelExtra) o.destroy();
      this.labelExtra = [];
      this.labelText.setText(this.only ? t('plotOnly_' + this.only) : t('plot_' + this.size));
      const w = Math.max(120, this.labelText.width + 66);
      this.labelBg.setSize(w, 52);
      this.labelIcon.setPosition(-w / 2 + 26, 0).setVisible(true);
      this.labelText.setPosition(-w / 2 + 48, 0);
      return;
    }
    if (this.state !== 'foundation') { this.label.setVisible(false); return; }
    const parts = MATERIALS.filter((m) => this.need[m] > 0).map((m) => [m, Math.min(this.need[m], this.stock.countOf(m)), this.need[m]]);
    const k = 'f:' + parts.map((p) => p.join(',')).join('|');
    if (k === this.labelKey) return;
    this.labelKey = k;
    for (const o of this.labelExtra) o.destroy();
    this.labelExtra = [];
    this.labelIcon.setVisible(false);
    this.labelText.setText('');
    // [plank] 3/10  [ingot] 0/4
    const items = [];
    let w = 18;
    for (const [m, have, need] of parts) {
      const ic = Assets.image(gs, 0, 0, m).setOrigin(0.5, 0.6);
      ic.setScale(40 / Math.max(ic.frame.realWidth, ic.frame.realHeight, 1));
      const tx = gs.add.text(0, 0, have + '/' + need, { fontFamily: gs.font, fontSize: '22px', fontStyle: '900', color: have >= need ? '#2f8f4e' : '#2b2f3a', resolution: 2 }).setOrigin(0, 0.5);
      items.push([ic, tx]);
      w += 40 + tx.width + 16;
    }
    w = Math.max(110, w);
    this.labelBg.setSize(w, 54);
    let x = -w / 2 + 14;
    for (const [ic, tx] of items) {
      ic.setPosition(x + 18, 2); tx.setPosition(x + 40, 0);
      x += 40 + tx.width + 16;
      this.label.add([ic, tx]);
      this.labelExtra.push(ic, tx);
    }
  }

  // ------------------------------------------------------------------ state
  setShown(v) {
    this.shown = v;
    if (this.img) this.img.setVisible(v);
    if (this.pad) this.pad.setVisible(v);
    if (this.dropPad) this.dropPad.setVisible(v);
    if (this.label) this.label.setVisible(v && (this.state === 'plot' || this.state === 'foundation'));
    this.stock.setVisible(v);
    if (this.obstacle) this.obstacle.active = v && this.state !== 'plot';
    if (this.built && this.built.setEnabled) this.built.setEnabled(v);
  }
  setEnabled(v) { this.setShown(v); }
  revealObjects() { const o = []; if (this.img) o.push(this.img); if (this.pad) o.push(this.pad.img); if (this.label) o.push(this.label); if (this.built && this.built.revealObjects) o.push(...this.built.revealObjects()); return o; }

  get isPlot() { return this.state === 'plot'; }

  /**
   * a building was chosen (coins are paid by the caller): lay the foundation.
   * instant + got: restoring a save
   */
  start(bkey, opts = {}) {
    const gs = this.gs;
    this.building = bkey;
    const c = buildCost(bkey, this.id);
    this.need = {};
    for (const m of MATERIALS) { const n = Math.max(0, Math.floor(Number(c[m]) || 0)); if (n) this.need[m] = n; }
    this.buildTime = Math.max(1, Number(c.time) || 8);
    if (this.pad) { this.pad.img.destroy(); if (this.pad.icon) this.pad.icon.destroy(); this.pad = null; }
    this.state = 'foundation';
    this.makeImg('foundation');
    this.img.setDepth(this.y);
    const fp = this.def.footprint || [272, 136];
    if (!this.obstacle) this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.36, 'site');
    this.obstacle.active = this.shown;
    this.dropPad = new Pad(gs, this.dropX, this.dropY, 'input', 1.5, { icon: this.need.item_plank ? 'item_plank' : 'item_ingot', iconSize: 44 });
    this.dropPad.setVisible(this.shown);
    this.makeLabel();
    this.labelKey = '';
    if (opts.got) for (const m in this.need) for (let i = 0; i < Math.min(this.need[m], opts.got[m] || 0); i++) this.stock.push(m, null, gs.effects);
    this.refreshLabel();
    this.label.setVisible(this.shown);
    this.enabled = true;
    if (gs.logistics) gs.logistics.add(this);
    if (!opts.instant) {
      this.img.setScale(0.01);
      gs.tweens.add({ targets: this.img, scale: 1, duration: 420, ease: 'Back.easeOut' });
      gs.effects.sheet('fx_build_dust', this.x, this.y + 10, { size: fp[0] * 0.9 });
      gs.effects.sheet('fx_poof', this.x, this.y - 20, { size: fp[0] * 0.9 });
      gs.sfxAt('sfx_build', this.x, this.y, { volume: 0.8 }, true);
      gs.events.emit('siteStarted', this);
    }
    if (this.complete()) this.beginScaffold(opts.instant, opts.t);
  }

  /** every material has arrived */
  complete() {
    for (const m in this.need) if (this.stock.countOf(m) < this.need[m]) return false;
    return this.stock.incoming === 0;
  }

  missing(type) {
    if (this.state !== 'foundation' || !this.need[type]) return 0;
    return Math.max(0, this.need[type] - this.stock.countWithIncoming(type));
  }

  // logistics sink
  accepts(type) { return this.state === 'foundation' && !!this.need[type]; }
  room(type) { return this.missing(type); }
  prio() { return PRIO.SITE; }
  feed(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (this.missing(ty) > 0) return this.gs.moveItem(ch.stack, this.stock, ty, { dur: 240, height: 60, sfx: 'drop' });
    }
    return false;
  }

  // ------------------------------------------------------------------ scaffold + builders
  beginScaffold(instant, t0) {
    const gs = this.gs;
    if (this.state === 'scaffold') return;
    this.state = 'scaffold';
    this.enabled = false;
    if (gs.logistics) gs.logistics.remove(this);
    this.buildT = Math.max(0, Math.min(this.buildTime - 0.5, Number(t0) || 0));
    if (this.label) this.label.setVisible(false);
    // the delivered materials go into the frame
    const items = this.stock.items.slice();
    this.stock.items.length = 0;
    items.forEach((it, i) => {
      if (instant || !gs.isOnScreen(this.x, this.y, 200)) { gs.effects.releaseItem(it.spr); return; }
      gs.time.delayedCall(i * 45, () => gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: this.x + (Math.random() - 0.5) * 60, y: this.y - 40 }, { dur: 300, height: 70, scaleTo: 0.4, onDone: (s) => gs.effects.releaseItem(s) }));
    });
    const swap = () => {
      if (this.state !== 'scaffold') return;
      this.makeImg('scaffold');
      if (!instant) { this.img.setScale(0.9, 0.6); gs.tweens.add({ targets: this.img, scaleX: 1, scaleY: 1, duration: 380, ease: 'Back.easeOut' }); gs.effects.sheet('fx_build_dust', this.x, this.y + 10, { size: 220 }); }
    };
    if (instant) swap(); else gs.time.delayedCall(Math.min(1200, items.length * 45 + 300), swap);
    if (this.dropPad) { this.dropPad.img.destroy(); if (this.dropPad.icon) this.dropPad.icon.destroy(); this.dropPad = null; }
    if (!this.ring) {
      const top = (Assets.def(this.sprite('scaffold')).topPx || 160);
      this.ringY = this.y - top - 40;
      this.ringBg = Assets.image(gs, this.x, this.ringY, 'ui_ring_bg').setDepth(DEPTH.LABEL - 2);
      this.ringBg.setScale(58 / Math.max(this.ringBg.frame.realWidth, 1));
      this.ring = gs.add.graphics().setDepth(DEPTH.LABEL - 1);
      this.ringIcon = Assets.image(gs, this.x, this.ringY, Assets.pick('ui_icon_hammer', 'ui_icon_lock')).setDepth(DEPTH.LABEL);
      this.ringIcon.setScale(28 / Math.max(this.ringIcon.frame.realWidth, 1));
    }
    this.callBuilders(instant);
    gs.events.emit('scaffold', this);
  }

  callBuilders(instant) {
    const gs = this.gs;
    const wp = this.def.workPoints || [[-100, 30], [100, 30]];
    const wd = this.def.workDirs || ['NE', 'NW'];
    const n = Math.max(1, Math.min(wp.length, Math.floor(BALANCE.build.builders) || 2));
    for (let i = 0; i < n; i++) {
      const tx = this.x + wp[i][0], ty = this.y + wp[i][1];
      const side = wp[i][0] < 0 ? -1 : 1;
      const sx = instant ? tx : tx + side * 150, sy = instant ? ty : ty + 70;
      const b = new Builder(gs, this, sx, sy, tx, ty, DIR_IDX[wd[i]] !== undefined ? DIR_IDX[wd[i]] : 7, i);
      if (instant) b.arrive();
      this.builders.push(b);
    }
  }

  update(dt) {
    const gs = this.gs;
    if (this.state === 'plot') {
      if (!this.shown || !this.pad) return false;
      const p = gs.player;
      const on = this.pad.contains(p.x, p.y);
      this.label.y = this.labelBaseY + Math.sin(gs.time.now / 450 + this.x * 0.01) * 4;
      const la = on ? 0.3 : 1;
      if (Math.abs(this.label.alpha - la) > 0.01) this.label.setAlpha(this.label.alpha + (la - this.label.alpha) * Math.min(1, dt * 10));
      if (!on) { this.standT = 0; this.leaveNeeded = false; return false; }
      if (this.leaveNeeded) return true;
      this.standT += dt;
      if (this.standT >= (Number(BALANCE.player.padDelay) || 0.5) && p.vx === 0 && p.vy === 0) {
        this.leaveNeeded = true;
        gs.openBuildMenu(this);
      }
      return true;
    }
    if (this.state === 'foundation') {
      this.stock.layout(this.dropX, this.dropY + 6, this.dropY, 0, dt);
      if (this.label) { this.label.y = this.labelBaseY + Math.sin(gs.time.now / 450 + this.x * 0.01) * 4; this.refreshLabel(); }
      if (this.complete()) this.beginScaffold(false);
      const p = gs.player;
      return !!(this.dropPad && this.shown && this.dropPad.contains(p.x, p.y));
    }
    if (this.state === 'scaffold') {
      let working = 0;
      for (const b of this.builders) { b.update(dt); if (b.state === 'work') working++; }
      if (working) this.buildT += dt * Math.min(1, working / Math.max(1, this.builders.length) + 0.25);
      this.drawRing();
      if (this.buildT >= this.buildTime) this.finish(false);
    }
    if (this.state === 'done') for (let i = this.builders.length - 1; i >= 0; i--) { const b = this.builders[i]; b.update(dt); if (!b.alive) this.builders.splice(i, 1); }
    return false;
  }

  /** the chief stands on the drop pad: hand over the materials the site still needs */
  feedFromPlayer() {
    if (this.state !== 'foundation' || !this.dropPad) return false;
    if (this.feed(this.gs.player)) { this.dropPad.pulse(); return true; }
    return false;
  }

  drawRing() {
    const g = this.ring;
    if (!g) return;
    const pct = Math.min(1, this.buildT / this.buildTime);
    if (this._pct !== undefined && Math.abs(pct - this._pct) < 0.004) return;
    this._pct = pct;
    g.clear();
    g.lineStyle(8, 0xffb648, 1);
    g.beginPath();
    g.arc(this.x, this.ringY, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
    g.strokePath();
  }

  /** the building is finished (instant = restoring a save) */
  finish(instant) {
    const gs = this.gs;
    if (this.state === 'done') return;
    this.state = 'done';
    this.enabled = false;
    if (gs.logistics) gs.logistics.remove(this);
    if (this.ring) { this.ring.destroy(); this.ringBg.destroy(); this.ringIcon.destroy(); this.ring = null; }
    if (this.label) { this.label.destroy(); this.label = null; }
    if (this.dropPad) { this.dropPad.img.destroy(); if (this.dropPad.icon) this.dropPad.icon.destroy(); this.dropPad = null; }
    if (this.obstacle) { this.obstacle.active = false; }
    if (this.img) { this.img.destroy(); this.img = null; }
    this.stock.clear(gs.effects);
    for (const b of this.builders) b.leave(instant);
    if (instant) this.builders.length = 0;
    this.built = gs.makeBuilding(this.building, this, instant);
    if (!instant) {
      const fp = this.def.footprint || [272, 136];
      gs.effects.sheet('fx_build_done', this.x, this.y, { size: Math.max(200, fp[0] * 1.15), depth: DEPTH.FX });
      gs.time.delayedCall(250, () => gs.effects.burst('confetti', this.x, this.y - 120, 26));
      gs.sfxAt(Assets.audioDef('sfx_build_done') ? 'sfx_build_done' : 'sfx_unlock', this.x, this.y, { volume: 0.9 }, true);
      gs.effects.shake(180, 0.004);
      gs.events.emit('built', this.building, this);
    }
  }

  serialize() {
    if (this.state === 'plot') return null;
    const got = {};
    for (const m in this.need) got[m] = Math.min(this.need[m], this.stock.countWithIncoming(m));
    // materials a porter is carrying here count as delivered (the porter is not saved)
    if (this.gs.porters) for (const pr of this.gs.porters) if (pr.dest === this && pr.stack) for (const it of pr.stack.items) if (got[it.type] !== undefined) got[it.type] = Math.min(this.need[it.type], got[it.type] + 1);
    return { b: this.building, st: this.state, got, t: Math.round(this.buildT * 10) / 10 };
  }
}

// ------------------------------------------------------------------ carpenter
export class Builder extends Character {
  constructor(gs, site, x, y, tx, ty, dir, index) {
    super(gs, Assets.m.characters.lumberjack || !Assets.m.characters.miner ? 'lumberjack' : 'miner', x, y, { radius: 12, dir });
    this.site = site; this.tx = tx; this.ty = ty; this.workDir = dir; this.index = index;
    this.state = 'go';
    this.goT = 0;
    this.noXray = false;
    this.onImpact = () => this.hit();
    this.sprite.setAlpha(0); this.shadow.setAlpha(0);
    gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 1, duration: 400 });
    gs.agents.push(this);
  }

  arrive() {
    this.x = this.tx; this.y = this.ty;
    this.state = 'work';
    this.dir = this.workDir;
    this.vx = this.vy = 0;
    this.play('work', true);
    this.sprite.anims.setProgress(Math.random());
    this.sync(0);
  }

  hit() {
    if (this.state !== 'work') return;
    const gs = this.gs;
    if (!gs.isOnScreen(this.x, this.y, 120)) return;
    const ip = this.impactPoint();
    gs.effects.sheet('fx_build_dust', ip.x, ip.y + 18, { size: 96, depth: this.y + 1 });
    if (Math.random() < 0.5) gs.effects.burst('wood', ip.x, ip.y, 3);
    gs.sfxAt(Assets.audioGroup('sfx_hammer') ? 'sfx_hammer' : 'sfx_chop', this.x, this.y, { volume: 0.45, throttle: 90 });
  }

  update(dt) {
    const gs = this.gs;
    if (this.state === 'go') {
      this.goT += dt;
      if (gs.moveAgent(this, this.tx, this.ty, BALANCE.workers.speed, dt, 8) || this.goT > 6) this.arrive();
    } else if (this.state === 'work') {
      this.vx = this.vy = 0;
      if (this.dir !== this.workDir) { this.dir = this.workDir; }
      this.play('work');
    } else if (this.state === 'leave') {
      this.goT += dt;
      if (gs.moveAgent(this, this.lx, this.ly, BALANCE.workers.speed, dt, 10) || this.goT > 3.5) this.fade();
    }
    if (this.alive) this.sync(dt);
  }

  leave(instant) {
    if (instant) { this.remove(); return; }
    this.state = 'leave';
    this.goT = 0;
    const side = this.tx < this.site.x ? -1 : 1;
    this.lx = this.x + side * 170; this.ly = this.y + 90;
    this.play('happy', true);
  }

  fade() {
    if (this.state === 'gone') return;
    this.state = 'gone';
    this.gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 350, onComplete: () => this.remove() });
  }

  remove() {
    if (!this.alive) return;
    const i = this.gs.agents.indexOf(this);
    if (i >= 0) this.gs.agents.splice(i, 1);
    this.destroy();
  }
}

