// (v4.3 step B, WP-T) 읍장 취임 맛보기: GOALS43 row 10. A free stand-on pad at the hall's 승격식 spot opens a 9–21 s scene
// (bells, residents gather, confetti, the 「읍장」 card with the badge flying to the HUD rank chip, then the teaser card
// 「다음 업데이트에서 열려요」 with 읍장 수업 1 and 지도에서 돌보기, [좋아요]). docs/redesign_v43/stepB/postdepot_addendum.md §5,
// BP-43 … BP-46, BP-51, BP-53, BP-57.
//
//   EupTaste.enabled            whether row 10 exists (BP-53): true while this build has the taste; v4.4 retires it
//                               (EupTaste.enabled = LV < 44, or the module goes)
//   EupTaste.attach(gs, info)   registered on the after-load seam by src/systems/v43/index.js (after G's). Makes
//                               gs.eupTaste (one per Game.build) which ticks from the scene's 'update' event and lets go
//                               of everything on the scene's 'shutdown' (no Game.js edit)
//   EupTaste.gate(gs)           may the pad stand now? (below)
//   EupTaste.place(gs)          the pad as a goal place { x, y, pad, ref } while it stands, else null (G's row 10, BP-52)
//
// The gate (§5.1): EupTaste.enabled, the village is 읍 (gs.v4.rank level 2), v43.seen.eup_taste not set, and the chain
// says the taste is next:
//   - v43.seen.g43ready (G writes it when the pad first shows: sticky, BP-43), or
//   - G's own rule: gs.goals43.tasteReady() (rows 1–9 settled; in a build without the mkt_s4 step rows 1–8, BP-53), or,
//     for a G without it, gs.goals43.current() being row 10 (G43.taste), or
//   - no G in this build (no gs.goals43): v43.seen.g43all (rows 1–8 all marked, BP-54)
//   Once shown in this session the pad stays until the taste is seen (also if a soft row gets its path back).
// The start (§5.1): the chief stands still on the pad for goals43.taste.standS (0.6 s), the TownHall board-pad rule,
// polled here (no Game.handlePlayerPads edit), with no panel open, no 승격식 / other hold, no onboarding act, no letter
// card, 관망 not driving and no free look. Leaving the pad and coming back re-arms it.
// The scene: gs.v4.rank.hold = 'taste' (Rank.js, BP-51: every `ceremonyOn` reader holds as for the 승격식 — goal window,
// GoalWalk, 관망 countdown and camera director, navigator line, carry pill, residents' follow, flag card — while Rank's
// own clock does not run and Rank.state().ceremony stays false), cleared at the end, at a skip and on the scene's
// 'shutdown'. The camera stays at the hall (Rank.hallFrame, no white cuts, BP-57). Skippable after skipAfter (3 s) with
// a joystick drag that was not held at the start; [좋아요] or cardAuto (20 s) ends it; len (21 s) at most.
// It gives nothing and changes nothing (BP-44): no coins, items, staff, rank, flags or x.mgmt; it writes only
// v43.seen.eup_taste (SEEN43.taste), at the end or a skip. Killed mid-scene: nothing written, the pad is back next time.
// The cards: src/scenes/EupTasteCard.js, made lazily in the UI scene (gs.ui is a UIProxy: no `add`).
// The v43 bus: taste { state: 'pad' | 'start' | 'title' | 'teaser' | 'end' | 'skip' } (P1 only listens).
// Test hooks: window.__FV43.taste = { state, gate, play, ok, skip } (texbudget's view hook: play()).

import { Assets } from '../../core/Assets.js';
import { Audio } from '../../core/Audio.js';
import { Input } from '../../core/Input.js';
import { BALANCE } from '../../data/balance.js';
import { WORLD } from '../../data/world.js';
import { t } from '../../data/strings.js';
import { SEEN43, EV43, G43 } from '../../data/ids43.js';
import { Pad } from '../../entities/Pad.js';
import { floatLabel } from '../../entities/Shop.js';
import { EupTasteCard } from '../../scenes/EupTasteCard.js';
import { Rank } from '../Rank.js';
import { emit } from './hooks.js';

const HOLD = 'taste';
const DEF = { standS: 0.6, len: 21, skipAfter: 3, cardAuto: 20 };
/** goals43.taste from balance.js (balanceCheck keeps it sane), with the addendum's numbers as the fallback */
function cfg() {
  const T = (BALANCE.goals43 && BALANCE.goals43.taste) || {};
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const len = n(T.len, DEF.len);
  return { standS: n(T.standS, DEF.standS), len, skipAfter: Math.min(n(T.skipAfter, DEF.skipAfter), len - 1), cardAuto: Math.min(n(T.cardAuto, DEF.cardAuto), len) };
}
/** the save's seen block, never cached across ticks (S's remap may replace gs.v43 at load); null when there is none */
const seenOf = (gs) => { const v = gs && gs.v43; return v && v.seen && typeof v.seen === 'object' ? v.seen : null; };

export const EupTaste = {
  enabled: true,

  /** after-load hook (src/systems/v43/hooks.js runAfterLoad): one run per Game.build */
  attach(gs, info) {
    if (!EupTaste.enabled || !gs || !gs.events) return;
    if (gs.eupTaste && gs.eupTaste.destroy) { try { gs.eupTaste.destroy(); } catch (e) { /* */ } }
    gs.eupTaste = new TasteRun(gs, info);
  },

  /** may the pad stand now (the village is 읍, the taste unseen, the chain says it is next)? */
  gate(gs) {
    if (!EupTaste.enabled || !gs) return false;
    const seen = seenOf(gs);
    if (seen && seen[SEEN43.taste]) return false;
    const R = gs.v4 && gs.v4.rank;
    if (!R || !(R.level >= 2)) return false;
    if (seen && seen[SEEN43.g43ready]) return true;
    const G = gs.goals43;
    if (G) {
      // G's own gate (tasteReady: rows before row 10 settled), else its current row
      try {
        if (typeof G.tasteReady === 'function') return !!G.tasteReady();
        if (typeof G.current === 'function') { const c = G.current(); return !!(c && c.id === G43.taste); }
      } catch (e) { return false; }
      return false;
    }
    return !!(seen && seen[SEEN43.g43all]);
  },

  /** the pad as a goal place (GoalBook row / Tutorial objective / GoalWalk target) while it stands */
  place(gs) {
    const T = gs && gs.eupTaste;
    const pad = T && T.pad;
    return pad ? { x: Math.round(pad.x), y: Math.round(pad.y), pad, ref: pad } : null;
  },
};

class TasteRun {
  constructor(gs, info) {
    this.gs = gs;
    this.remapped = !!(info && info.remapped);
    this.pad = null;             // the stand-on pad (entities/Pad), only while the gate is open
    this.label = null;           // its floatLabel 「읍장 취임 맛보기」
    this.shown = false;          // the pad stood in this session: it stays until the taste is seen
    this.stand = 0;              // seconds the chief stood still on it
    this.leave = false;          // he must step off before it can start again
    this.on = false;             // the scene runs
    this.t = 0;
    this.steps = [];
    this.gateT = 0;
    this.dead = false;
    this.stats = { starts: 0, ends: 0, skips: 0 };
    this.onUpdate = (time, delta) => {
      if (this.dead || gs._broken || gs.resetting || !gs.player) return;
      // (관리자 「시간 빠르게」: the village steps 2–4 times a frame; the scene keeps its pace with them)
      const n = gs.simSpeed > 1 ? Math.min(4, Math.floor(gs.simSpeed)) : 1;
      const dt = Math.min(0.05, (Number(delta) || 16.7) / 1000) * n;
      try { this.update(dt); } catch (e) { if (!this.errOnce) { this.errOnce = true; console.error('[v43] taste:', e); } }
    };
    this.onShutdown = () => this.destroy();
    gs.events.on('update', this.onUpdate);
    gs.events.once('shutdown', this.onShutdown);
    this.installHooks();
  }

  // ------------------------------------------------------------------ the pad
  /** where the pad stands: the hall's 승격식 pad spot; an old village with no hall: the station square's (Game.padSpot) */
  padPos() {
    const gs = this.gs, hall = gs.civic && gs.civic.hall;
    if (hall) return hall.rankPadPos ? hall.rankPadPos() : hall.venue('rank');
    const q = WORLD.v4 && WORLD.v4.square;
    return q && q.rank && gs.territory && gs.territory.isOpen('rail') ? { x: q.rank.x, y: q.rank.y } : null;
  }

  /** the place the scene is held at (the hall's venue; else the square) */
  venue() {
    const gs = this.gs, hall = gs.civic && gs.civic.hall;
    if (hall) return { x: hall.venue('rank').x, y: hall.venue('rank').y, hall: true };
    const p = this.padPos() || { x: gs.player.x, y: gs.player.y };
    return { x: p.x, y: p.y, hall: false };
  }

  showPad(pop) {
    const gs = this.gs, p = this.padPos();
    if (!p || this.pad) return;
    const icon = Assets.pick('ui_badge_rank_2', 'ui_icon_fame', 'ui_icon_lock_open');
    // (the 승격식 pad's size, 2.1 m, gold)
    this.pad = new Pad(gs, p.x, p.y, 'unlock', 2.1, { tint: 0xffd56a, icon, iconSize: 50 });
    this.label = floatLabel(gs, p.x, p.y - 74, icon);
    this.label.set(t('taste_pad'));
    if (gs.addPadSpot) gs.addPadSpot(p.x, p.y);           // (residents never stand on it)
    // (the chief already on the spot: he steps off and back on first, as on any pad that appears under him)
    if (gs.player && this.pad.contains(gs.player.x, gs.player.y)) this.leave = true;
    if (pop && gs.popIn) gs.popIn({ pad: this.pad, label: this.label.c, x: p.x, y: p.y });
    if (!this.shown) { this.shown = true; emit(EV43.taste, { state: 'pad' }); }
  }

  hidePad(poof) {
    const gs = this.gs;
    if (!this.pad) return;
    if (poof && gs.effects) gs.effects.sheet('fx_poof', this.pad.x, this.pad.y - 10, { size: 220 });
    try { gs.tweens.killTweensOf(this.pad.img); if (this.label) gs.tweens.killTweensOf(this.label.c); } catch (e) { /* */ }
    try { this.pad.img.destroy(); if (this.pad.icon) this.pad.icon.destroy(); } catch (e) { /* */ }
    try { if (this.label) this.label.destroy(); } catch (e) { /* */ }
    this.pad = null; this.label = null;
    this.stand = 0; this.leave = false;
  }

  /** may the scene start now (§5.1)? null = yes, else why not */
  blocked() {
    const gs = this.gs, R = gs.v4 && gs.v4.rank;
    if (!R || R.ceremonyOn) return 'ceremony';
    const U = gs.scene && gs.scene.get ? gs.scene.get('UI') : null;
    if (!U || !U.ready) return 'ui';
    if (U.panelOpen || U.buildOpen || U.v4PanelOpen || U.v42PanelOpen || U.adminOpen || U.moveOpen) return 'panel';
    if ((U.goals && U.goals.c) || (U.residents && U.residents.isOpen && U.residents.isOpen())) return 'panel';
    const ob = gs.onboard;
    if (ob && (ob.mode === 'act1' || ob.mode === 'act2' || ob.mode === 'tour' || ob.tip)) return 'onboarding';
    if (gs.tutorial && gs.tutorial.inTutorial) return 'onboarding';
    const seen = seenOf(gs);
    if ((U.renewal43 && U.renewal43.isOpen) || (this.remapped && !(seen && seen[SEEN43.letter]))) return 'letter';
    const P = gs.v42 && gs.v42.pilot;
    if ((P && P.on) || gs.camPan || gs.overview) return 'view';
    return null;
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const gs = this.gs;
    if (this.on) { this.tick(dt); return; }
    // the gate, twice a second (G's current() is the window's own reading; cheap)
    this.gateT -= dt;
    if (this.gateT <= 0) {
      this.gateT = 0.5;
      const seen = seenOf(gs);
      const want = EupTaste.enabled && !(seen && seen[SEEN43.taste]) && (this.shown ? !!(gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2) : EupTaste.gate(gs));
      if (want && !this.pad) this.showPad(true);
      else if (!want && this.pad) this.hidePad(false);
    }
    const pad = this.pad, p = gs.player;
    if (!pad || !p) return;
    if (this.label) this.label.bob(gs.time.now);
    if (pad.contains(p.x, p.y)) {
      if (!this.leave) {
        // (the 0.6 s count only while nothing holds it: closing a panel on the pad does not start the scene that instant)
        if (this.blocked()) this.stand = 0;
        else {
          this.stand += dt;
          if (this.stand >= cfg().standS && p.vx === 0 && p.vy === 0) { this.leave = true; this.start(); }
        }
      }
    } else { this.stand = 0; this.leave = false; }
  }

  // ------------------------------------------------------------------ the scene (§5.2)
  start() {
    const gs = this.gs, R = gs.v4 && gs.v4.rank;
    if (this.on || !R) return false;
    const C = cfg();
    this.on = true;
    this.t = 0;
    this.steps = [];
    this.len = C.len; this.skipAfter = C.skipAfter; this.cardAuto = C.cardAuto;
    this.teaserShown = false;
    this.inputAtStart = !!(Input.joy && Input.joy.active) || !!Input.override;
    this.stats.starts++;
    R.hold = HOLD;
    const v = this.venue();
    this.v = v;
    this.cx = v.x; this.cy = v.y - 40;
    // the pad poofs; the music ducks; the camera glides to the hall (the chief stands there already: no white cut)
    this.hidePad(true);
    this.duck(true);
    this.frame();
    const bell = Audio.exists('sfx_bell_hall') ? 'sfx_bell_hall' : 'sfx_unlock';
    this.at(0.3, () => Audio.play(bell, { volume: 0.9 }));
    this.at(1.5, () => Audio.play(bell, { volume: 0.9 }));
    // residents gather round the chief (from just off screen); our visitors from town come too (the town is far off)
    this.at(0.5, () => {
      if (gs.life) gs.life.party({ pull: 700 });
      const nb = gs.v4;
      if (nb && nb.gatherVisitors) nb.gatherVisitors(this.cx, this.cy + 40, this.len, 12);
    });
    this.at(1.2, () => gs.ui.banner(t('taste_banner'), t('taste_bannerSub'), { step: true }));
    // confetti + stars over the hall front: 6 bursts, every 0.5 s
    for (let i = 0; i < 6; i++) this.at(2 + i * 0.5, () => { const x = this.cx + (Math.random() - 0.5) * 560, y = this.cy - 160 - Math.random() * 300; gs.effects.burst('confetti', x, y, 22); gs.effects.burst('star', x, y, 12); });
    // the 「읍장」 card; the badge flies to the HUD rank chip
    this.at(3.0, () => {
      this.frame();
      const c = this.card();
      if (c) c.open('title');
      if (gs.ui.rankBadgeFly) gs.ui.rankBadgeFly(this.cx, this.cy - 20);
      emit(EV43.taste, { state: 'title' });
    });
    this.at(4.0, () => { if (gs.life) gs.life.cheer(); });
    // the teaser card in the same frame; it waits for [좋아요] (or cardAuto)
    this.at(8.0, () => {
      this.frame();
      const c = this.card();
      if (c) c.open('teaser');
      this.teaserShown = true;
      emit(EV43.taste, { state: 'teaser' });
    });
    emit(EV43.taste, { state: 'start' });
    return true;
  }

  /** the hall framing (Rank.hallFrame, the 승격식's) for the rest of the scene; the square's without a hall */
  frame() {
    const gs = this.gs, v = this.v;
    if (!v) return;
    const f = v.hall ? Rank.hallFrame(v) : { x: this.cx + 120, y: this.cy + 80 };
    gs.focusCamera(f.x, f.y, Math.max(1, this.len - this.t) * 1000);
  }

  at(s, fn) { this.steps.push({ s, fn, done: false }); }

  tick(dt) {
    this.t += dt;
    for (const st of this.steps) if (!st.done && this.t >= st.s) { st.done = true; try { st.fn(); } catch (e) { console.error(e); } }
    // (the card follows the HUD column; a layout error there must never keep the village held: the end checks below run)
    const c = this.card(false);
    if (c) { try { c.tick(); } catch (e) { if (!this.cardErr) { this.cardErr = true; console.error('[v43] taste card:', e); } } }
    // a joystick drag after skipAfter s jumps to the end (one held since the start counts only once let go)
    const moving = !!(Input.joy && Input.joy.active) || !!Input.override;
    if (!moving) this.inputAtStart = false;
    if (this.t > this.skipAfter && moving && !this.inputAtStart) { this.end(true); return; }
    if ((this.teaserShown && this.t >= this.cardAuto) || this.t >= this.len) this.end(false);
  }

  /** End / Skip: the cards close, the camera goes back to the chief, the village goes on; the marker is written */
  end(skipped) {
    if (!this.on) return;
    this.on = false;
    const gs = this.gs, R = gs.v4 && gs.v4.rank;
    const early = skipped && !this.teaserShown;
    this.steps = [];
    // (first the village goes on and the marker is written: nothing cosmetic below can leave the hold behind)
    if (R && R.hold === HOLD) R.hold = null;
    // the one thing the taste writes (BP-44); a save without a seen block gets one ({ lay: 0 } holder, §3.8)
    const v = gs.v43 || (gs.v43 = { lay: 0 });
    if (!v.seen || typeof v.seen !== 'object') v.seen = {};
    v.seen[SEEN43.taste] = 1;
    this.stats.ends++;
    if (skipped) this.stats.skips++;
    gs.camFocus = null;
    this.duck(false);
    try { const c = this.card(false); if (c) c.close(false); } catch (e) { console.error('[v43] taste card:', e); }
    // (a skip before the teaser showed: what its footer would have said, as a toast with a hold — the UI scene's own
    //  toast: gs.ui.toast drops the hold)
    if (early) { try { const U = gs.scene.get('UI'); if (U && U.ready && U.toast) U.toast(t('taste_end'), 1800); } catch (e) { /* */ } }
    emit(EV43.taste, { state: skipped ? 'skip' : 'end' });
    try { gs.save(true); } catch (e) { /* the marker goes with the next save */ }
  }

  /** the music down to a quarter for the scene and back after (Rank.duck's pattern, but back to the player's own music
   *  slider: Rank.duck goes back to the track's full volume, so a player who turned the music down or off on the slider
   *  heard it at full after the scene). `now`: at once, with no tween (a scene going down takes its tweens with it) */
  duck(on, now) {
    const m = Audio.music;
    if (!m || !Audio.musicKey) return;
    try {
      const full = Audio.baseVolume(Audio.musicKey) * (Audio.cat ? Audio.cat('music') : 1);
      const to = on ? full * 0.25 : full;
      if (now) m.setVolume(to); else Audio.fade(m, to, on ? 400 : 1200);
    } catch (e) { /* */ }
  }

  /** the cards in the UI scene (made on first use; null while the UI scene is not up) */
  card(make = true) {
    const U = this.gs.scene && this.gs.scene.get ? this.gs.scene.get('UI') : null;
    if (!U || !U.ready || !U.add) return null;
    if (U.eupTaste && !U.eupTaste.dead) { U.eupTaste.onOk = () => this.end(false); return U.eupTaste; }
    if (!make) return null;
    U.eupTaste = new EupTasteCard(U);
    U.eupTaste.onOk = () => this.end(false);
    return U.eupTaste;
  }

  // ------------------------------------------------------------------ teardown and test hooks
  destroy() {
    if (this.dead) return;
    const gs = this.gs;
    // (a scene restart mid-scene: no hold left behind, no card left open; nothing written: the pad is back next time)
    if (this.on) {
      this.on = false;
      const R = gs.v4 && gs.v4.rank;
      if (R && R.hold === HOLD) R.hold = null;
      // (the music back at once: the same track plays on after a restart (Audio.playMusic keeps it), it stayed ducked)
      this.duck(false, true);
      try { const c = this.card(false); if (c) c.close(true); } catch (e) { /* the UI scene is going down too */ }
    }
    this.dead = true;
    try { gs.events.off('update', this.onUpdate); } catch (e) { /* */ }
    try { gs.events.off('shutdown', this.onShutdown); } catch (e) { /* */ }
    this.hidePad(false);
    if (gs.eupTaste === this) gs.eupTaste = null;
  }

  state() {
    const gs = this.gs, R = gs.v4 && gs.v4.rank, c = this.card(false), seen = seenOf(gs);
    return {
      enabled: EupTaste.enabled, gate: EupTaste.gate(gs), pad: this.pad ? { x: Math.round(this.pad.x), y: Math.round(this.pad.y), r: Math.round(this.pad.r) } : null,
      shown: this.shown, stand: +this.stand.toFixed(2), leave: this.leave, blocked: this.blocked(),
      on: this.on, t: +this.t.toFixed(2), teaser: !!this.teaserShown, hold: R ? R.hold || null : null,
      seen: !!(seen && seen[SEEN43.taste]), card: c ? c.state() : null, stats: Object.assign({}, this.stats),
    };
  }

  installHooks() {
    if (typeof window === 'undefined') return;
    const H = window.__FV43 || (window.__FV43 = {});
    H.taste = {
      state: () => this.state(),
      gate: () => EupTaste.gate(this.gs),
      /** start the scene now (texbudget's view; tests): the pad's start rules are skipped */
      play: () => { if (this.on || !(this.gs.v4 && this.gs.v4.rank)) return false; return this.start(); },
      ok: () => { const c = this.card(false); if (c) c.ok(); return this.state(); },
      skip: () => { this.end(true); return this.state(); },
    };
  }
}
