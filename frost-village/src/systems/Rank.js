// Rank (v4-B, docs/v4_plan.md §9): 마을 -> 읍. Three bars — people (village residents + station-district
// citizens), founded shops open, happiness — and, when all three are full, the 승격식 pad (a Progression step,
// balance.js v4.rank.2.coins, 10000) on the station square. Paying it starts a 12 s ceremony (bells, confetti, the badge flying to the
// HUD, the main street repaved to cobble tile by tile, new streetlights) and the rewards (§9.4): auto rent, a
// second coach, the town grows to 120, new house lots, a bigger delivery bonus, the title 읍장.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { BALANCE } from '../data/balance.js';
import { WORLD, L4 } from '../data/world.js';
import { t } from '../data/strings.js';
import { TownBuilding } from '../entities/TownBuilding.js';

// new streetlights of 역앞 거리 at 읍 (every 4 cells on the +j sidewalk, j −3.5), clear of the lots' doors
const EUP_LIGHTS = [[9.0, -3.5], [13.0, -3.5], [17.0, -3.5]];

export class Rank {
  constructor(nb, saved) {
    this.nb = nb;
    this.gs = nb.gs;
    const s = saved && typeof saved === 'object' ? saved : {};
    this.level = s.rank === 2 || nb.gs.progress.flags.rankEup ? 2 : 1;
    this.ceremonyOn = false;
    this.lights = [];
    this.applied = false;
  }

  need() { return (BALANCE.v4.rank && BALANCE.v4.rank[2]) || { people: 45, shops: 5, happy: 70, coins: 10000 }; }
  /** village residents + the station district's citizens */
  people() { const gs = this.gs; return (gs.life ? gs.life.people() : 0) + (this.nb.districtPeople ? this.nb.districtPeople() : 0); }
  shops() { return this.nb.growth ? this.nb.growth.openShopCount() : 0; }
  happy() { return this.nb.growth ? this.nb.growth.happiness() : 100; }

  /** the three bars: [{ key, v, need, full }] */
  bars() {
    const N = this.need();
    const b = [
      { key: 'people', v: this.people(), need: N.people },
      { key: 'shops', v: this.shops(), need: N.shops },
      { key: 'happy', v: this.happy(), need: N.happy },
    ];
    for (const x of b) x.full = x.v >= x.need;
    return b;
  }
  ready() { return this.level < 2 && this.bars().every((x) => x.full); }

  update(dt) {
    const gs = this.gs;
    this.checkT = (this.checkT || 0) - dt;
    if (this.checkT <= 0) {
      this.checkT = 1;
      // (sticky: once the bars were full the pad stays, even if happiness dips for a moment)
      if (this.level < 2 && !gs.progress.flags.rankReady && this.ready()) gs.progress.setFlag('rankReady');
    }
    if (this.level >= 2 && !this.applied && this.nb.ready) this.applyRewards(true);
    if (this.ceremonyOn) this.tickCeremony(dt);
  }

  // ------------------------------------------------------------------ the ceremony (§9.3)
  /** Progression step rank_eup paid (instant = restoring a save) */
  ceremony(instant) {
    const gs = this.gs;
    if (this.level >= 2 && !instant) return;
    this.level = 2;
    gs.progress.flags.rankEup = true;
    if (instant) { this.applyRewards(true); return; }
    const Q = WORLD.v4.square;
    const C = BALANCE.v4.ceremony;
    this.ceremonyOn = true;
    this.cT = 0;
    this.cLen = Math.max(3, Number(C.length) || 12);
    this.cSkip = Math.max(0, Number(C.skipAfter) || 3);
    this.cx = Q.rank.x; this.cy = Q.rank.y - 40;
    this.steps = [];
    this.inputAtStart = !!(Input.joy && Input.joy.active);
    gs.focusCamera(this.cx + 120, this.cy + 80, this.cLen * 1000);
    // everyone comes: the village (the party ring around the chief) and the townsfolk nearby
    if (gs.life) gs.life.party();
    if (this.nb.town && this.nb.town.gather) this.nb.town.gather(this.cx, this.cy + 60, 900, 24, this.cLen + 2);
    // bells, music ducks
    const bell = Audio.exists('sfx_bell_hall') ? 'sfx_bell_hall' : 'sfx_unlock';
    this.duck(true);
    this.at(0.2, () => Audio.play(bell, { volume: 0.9 }));
    this.at(1.4, () => Audio.play(bell, { volume: 0.9 }));
    this.at(2.6, () => Audio.play(bell, { volume: 0.9 }));
    this.at(0.6, () => { gs.ui.banner(t('rankUp'), t('rankUpSub')); if (gs.ui.rankBadgeFly) gs.ui.rankBadgeFly(this.cx, this.cy - 60); });
    // confetti + 10 star bursts (the celebrate3 pattern)
    for (let i = 0; i < 10; i++) this.at(1 + i * 0.32, () => { const x = this.cx + (Math.random() - 0.5) * 560, y = this.cy - 160 - Math.random() * 300; gs.effects.burst('confetti', x, y, 22); gs.effects.burst('star', x, y, 12); });
    this.at(1.2, () => gs.effects.shake(260, 0.005));
    // the repave wipe outward from the square (+ fx_poof at the front), then the streetlights pop up
    this.at(3.0, () => this.repave(false), true);
    this.at(6.4, () => this.addLights(false), true);
    // the rewards, one toast after another
    const toasts = ['rewardCobble', 'rewardRent', 'rewardCoach', 'rewardTown', 'rewardLots', 'rewardOrders', 'rewardTitle'];
    toasts.forEach((k, i) => this.at(4 + i * 1.1, () => gs.ui.toast(t(k), 1000)));
    this.at(this.cLen, () => this.endCeremony());
    gs.events.emit('v4:rankUp', 2);
    gs.save(true);
  }

  /** a ceremony step at `s` s; `essential` steps (the repave, the lights) also run when the ceremony is skipped */
  at(s, fn, essential) { this.steps.push({ s, fn, done: false, essential: !!essential }); }

  tickCeremony(dt) {
    this.cT += dt;
    for (const st of this.steps) if (!st.done && this.cT >= st.s) { st.done = true; try { st.fn(); } catch (e) { console.error(e); } }
    // a touch on the joystick after `skipAfter` s jumps to the end state
    const moving = !!(Input.joy && Input.joy.active) || !!Input.override;
    if (!moving) this.inputAtStart = false;
    if (this.cT > this.cSkip && moving && !this.inputAtStart && this.ceremonyOn) this.endCeremony(true);
  }

  endCeremony(skipped) {
    if (!this.ceremonyOn) return;
    this.ceremonyOn = false;
    const gs = this.gs;
    // (skipped: the steps that change the world still happen, at once; banners / toasts / fx are dropped)
    for (const st of this.steps) if (!st.done && st.essential) { st.done = true; try { st.fn(); } catch (e) { console.error(e); } }
    void skipped;
    this.steps = [];
    gs.camFocus = null;
    this.duck(false);
    this.applyRewards(false);
    gs.save(true);
  }

  duck(on) {
    const m = Audio.music;
    if (!m) return;
    try { const base = Audio.baseVolume(Audio.musicKey); Audio.fade(m, on ? base * 0.25 : base, on ? 400 : 1200); } catch (e) { /* */ }
  }

  /** the main street, 뒷길 and 중앙로 become cobble; the footpaths sidewalks; tile by tile outward when animated */
  repave(instant) {
    const gs = this.gs, nb = this.nb;
    const rn = gs.roadNet || nb.roadNet;
    if (rn && rn.upgrade) { for (const id of ['main', 'back', 'ave']) rn.upgrade(id, 'cobble'); for (const id of ['shopalley', 'homes', 'apts', 'alley_t']) rn.upgrade(id, 'sidewalk'); }
    if (nb.paint && nb.paint.setRank) nb.paint.setRank(2, !instant);
    if (instant || !nb.paint || !nb.paint.wipeRects) return;
    // the wipe: re-bake the street tiles nearest the square first, one ring every 0.25 s, with a poof at the front
    const rects = nb.paint.wipeRects(this.cx, this.cy);
    rects.forEach((r, i) => gs.time.delayedCall(i * 250, () => {
      gs.ground.invalidate(r.rect);
      if (gs.isOnScreen(r.x, r.y, 200)) gs.effects.sheet('fx_poof', r.x, r.y, { size: 200 });
    }));
  }

  /** new streetlights along 역앞 거리 (our district) */
  addLights(instant) {
    const gs = this.gs, nb = this.nb;
    if (this.lights.length) return;
    EUP_LIGHTS.forEach(([i, j], k) => {
      const [x, y] = L4(i, j);
      const go = () => {
        const tb = new TownBuilding(gs, { id: 'eup_light_' + k, key: 'streetlight', x, y, i, j, role: 'light' }, { occluder: false });
        gs.territory.add('rail', tb.img);
        this.lights.push(tb);
        const fp = (Assets.def('streetlight').fxPoints || {}).light;
        if (fp && nb.clock && nb.clock.addLight) nb.clock.addLight(x + fp[0], y + fp[1], 1, Math.abs(x - 3410));
        if (!instant) { const o = tb.img, sy = o.scaleY; o.setScale(o.scaleX, 0.01); gs.tweens.add({ targets: o, scaleY: sy, duration: 420, ease: 'Back.easeOut' }); gs.effects.sheet('fx_poof', x, y - 20, { size: 140 }); }
      };
      if (instant) go(); else gs.time.delayedCall(k * 350, go);
    });
  }

  /** the end state of 읍 (also on load) */
  applyRewards(instant) {
    if (this.applied) return;
    const nb = this.nb;
    if (!nb.ready) return;
    this.applied = true;
    this.level = 2;
    this.gs.progress.flags.rankEup = true;
    if (instant) { this.repave(true); this.addLights(true); }
    nb.addCoach();
    const T = BALANCE.v4.town;
    if (nb.town && nb.town.growTo) nb.town.growTo(T.peopleRank2 || 120, instant);
    else nb.growPending = T.peopleRank2 || 120;
    if (!instant) this.gs.ui.toast(t('newcomers', { n: Math.max(0, (T.peopleRank2 || 120) - (T.people || 100)) }), 1800);
    if (nb.growth) nb.growth.houseCheck(instant);
    this.gs.events.emit('v4:rank', 2);
  }

  state() { return { level: this.level, bars: this.bars().map((b) => [b.key, b.v, b.need]), ready: this.ready(), ceremony: this.ceremonyOn }; }
}
