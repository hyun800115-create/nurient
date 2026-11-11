// (v4.3) 주민 따라가기 — the profile's 「따라가기」: the windows close, the camera glides to the resident (≤ 0.6 s) and keeps
// on them; a chip at the top says 「👀 {이름} 따라가는 중 ✕」 (spec §6).
//   ends     ✕ · a human move (joystick, keys, a test input: Input.lastActivity — never the 관망 pilot or a goal walk)
//            · a 관망 look-around drag (with the free camera, Input.pan) · the overview map · a ceremony, the tutorial's
//            replay tour or another panel · the person gone (no body any more, off the map, out of the roster). Then
//            the camera glides back to the chief (a look-around drag: it stays where the finger has it)
//   bodies   a Resident, or the job body wearing their look (re-found at 2 Hz: a resident who takes a job is followed to
//            the operator); a person without a body is followed to their place (home, workplace) and the chip says so
//   관망      following wins over its camera (the hook runs after camFocus / camPan); its idle clock is held (lastTouch)
//            so it never starts on its own mid-follow; the chief keeps doing what he does (stands without input)
// Game.update calls frame() in its camera block (one call, no allocation); the UI scene calls update() for the chip.
// Nothing is saved: a reload starts with the camera on the chief.

import { Assets } from '../../core/Assets.js';
import { Audio } from '../../core/Audio.js';
import { Input } from '../../core/Input.js';
import { View } from '../../core/View.js';
import { Back } from '../../core/Back.js';
import { panel } from '../../core/Panel.js';
import { FONT } from '../../data/strings.js';
import { rt } from './strings.js';

const TXT = (size, color, weight) => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight || '800', color, resolution: 2 });
const GLIDE = 0.6;          // s of the glide in
const K_GLIDE = 0.09, K_TRACK = 0.25, K_BACK = 0.09;

export class Follow {
  constructor(ui, panelRef) {
    this.ui = ui;
    this.panel = panelRef;
    this.on = false;
    this.back = false;
    this.p = null;
    this.px = 0; this.py = 0;
    this.t = 0;
    this.t0 = 0;
    this.hadBody = false;
    this.reT = 0;
    this.chipKey = '';
    this.placeX = 0; this.placeY = 0;
    this.act = { key: '', text: '', dot: 0, x: 0, y: 0, where: '', body: null, params: null };
    this.onBack = () => { if (!this.on) return false; this.stop('back'); return true; };
    this.c = null;
  }

  get gs() { return this.ui.gs; }
  get roster() { return this.panel.roster; }

  // ---------------------------------------------------------------- start / stop
  start(p) {
    const gs = this.gs;
    if (!p || !gs || !gs.player) return false;
    if (this.on) this.stop('switch', false);
    Input.release();
    if (gs.overview && gs.toggleOverview) gs.toggleOverview();
    // (goals_wt) a goal walk drives the chief through Input.pilot: stop it
    const gw = gs.v42 && gs.v42.goalwalk;
    if (gw && typeof gw.stop === 'function') { try { gw.stop('follow', true); } catch (e) { /* */ } }
    // (watch_wt) 관망's free look-around camera: back with the director (following wins over it from here)
    const P = gs.v42 && gs.v42.pilot, C = P && P.cam;
    if (C && C.free && typeof C.attach === 'function') { try { C.attach(); } catch (e) { /* */ } }
    if (gs.camGlide) gs.camGlide = false;
    this.p = p;
    this.on = true; this.back = false;
    this.t = 0; this.reT = 0;
    this.t0 = Input.lastActivity || 0;
    this.place();
    this.hadBody = !!p.bodyRef;
    this.point();
    gs.resFollow = this;
    Back.push(this.onBack);
    this.buildChip();
    this.refreshChip(true);
    if (window.__FV && window.__FV.residents) window.__FV.residents.following = p.pid;
    return true;
  }

  /** why: 'x' | 'move' | 'pan' | 'gone' | 'busy' | 'overview' | 'back' | 'switch' | 'reset'; glide: back to the chief */
  stop(why, glide) {
    if (!this.on) return;
    const gs = this.gs, p = this.p;
    this.on = false;
    Back.pop(this.onBack);
    if (why === 'pan') {
      // 관망's look-around took the camera: it stays where it is (CameraDirector.detach) and the finger pans from there
      const P = gs && gs.v42 && gs.v42.pilot, C = P && P.cam;
      if (C && typeof C.detach === 'function') { try { C.detach(); } catch (e) { /* */ } }
      glide = false;
    }
    if (glide !== false) {
      // (watch_wt) the free camera's own glide back when it is there, else ours (Game camera block)
      if (gs && 'camGlide' in gs) { gs.camGlide = true; this.back = false; } else this.back = true;
    } else this.back = false;
    if (why === 'gone' && p && this.ui.toast) this.ui.toast(rt('f_gone', { name: this.roster.shortName(p) }));
    this.p = null;
    this.hideChip();
    if (window.__FV && window.__FV.residents) window.__FV.residents.following = null;
  }

  // ---------------------------------------------------------------- the camera (Game.update, every frame)
  /** where the camera goes: the body, else the person's place (found at 2 Hz: placeX / placeY) — px / py */
  point() {
    const p = this.p, b = p && p.bodyRef;
    if (b && b.alive !== false) { this.px = b.x; this.py = b.y - 30; return true; }
    this.px = this.placeX; this.py = this.placeY - 30;
    return false;
  }

  /** the person's place and words now (2 Hz; resolves the body too) */
  place() {
    const a = this.act;
    this.roster.action(this.p, a);
    this.placeX = a.x || 0; this.placeY = a.y || 0;
  }

  /**
   * the camera block's hook: returns the follow speed k (and px / py while following); ends the follow on a human
   * move / a 관망 drag / a panel / the overview. ct: the camera target, fx / fy: where the camera would go without us
   */
  frame(ct, fx, fy, delta, k) {
    const gs = this.gs;
    if (this.on) {
      this.t += delta / 1000;
      const ui = this.ui;
      const R = gs.v4 && gs.v4.rank, ob = gs.onboard;
      if ((Input.lastActivity || 0) > this.t0) this.stop('move');
      else if (Input.pan && Input.pan.active && Input.pan.moved) this.stop('pan');
      else if (gs.overview) this.stop('overview');
      else if ((R && R.ceremonyOn) || (ob && ob.mode === 'tour') || ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.adminOpen || ui.moveOpen
        || (ui.v42PanelOpen && !this.panel.isOpen())) this.stop('busy');
      else {
        const b = this.p.bodyRef;
        if (b && (b.alive === false || (b.sprite && !b.sprite.active))) { this.roster.resolve(this.p); if (!this.p.bodyRef && this.hadBody) { this.stop('gone'); } }
      }
      if (this.on) {
        Input.lastTouch = gs.time.now;     // 관망's idle clock is held: it does not start on its own mid-follow
        this.point();
        const cr = gs.territory && gs.territory.camRect;
        if (cr && (this.px < cr.x - 40 || this.px > cr.x + cr.w + 40 || this.py < cr.y - 40 || this.py > cr.y + cr.h + 40)) this.stop('gone');
      }
      if (this.on) return 1 - Math.pow(1 - (this.t < GLIDE ? K_GLIDE : K_TRACK), delta / 16.67);
    }
    if (this.back) {
      if (Math.abs(fx - ct.x) < 120 && Math.abs(fy - ct.y) < 120) { this.back = false; return k; }
      return 1 - Math.pow(1 - K_BACK, delta / 16.67);
    }
    return k;
  }

  // ---------------------------------------------------------------- 2 Hz (UI scene)
  update(dt) {
    if (!this.on) return;
    const p = this.p;
    this.reT -= dt;
    if (this.reT > 0) return;
    this.reT = 0.5;
    // (a panel that pauses the village — the settings — stops the camera hook too: checked here as well)
    const ui = this.ui;
    if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.adminOpen || ui.moveOpen) { this.stop('busy'); return; }
    if (!this.roster.get(p.pid)) { this.stop('gone'); return; }
    this.place();
    if (p.bodyRef) this.hadBody = true;
    else if (this.hadBody) { this.stop('gone'); return; }
    this.refreshChip(false);
  }

  // ---------------------------------------------------------------- the chip
  buildChip() {
    const ui = this.ui;
    if (this.c) return;
    const c = this.c = ui.add.container(0, 0).setDepth(64);
    this.bg = panel(ui, 0, 0, 'ui_panel', 420, 64).setOrigin(0.5).setAlpha(0.95);
    this.eye = this.eyeIcon(ui);
    this.name = ui.add.text(0, 0, '', TXT(24, '#2b2f3a', '900')).setOrigin(0, 0.5);
    this.sub = ui.add.text(0, 0, '', TXT(20, '#6b7686', '800')).setOrigin(0, 0.5);
    this.x = ui.makeIconButton(0, 0, 'ui_icon_close', 48, () => this.stop('x'));
    this.hit = ui.add.zone(0, 0, 300, 64).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.hit.on('pointerup', () => { if (this.on && this.p) { Audio.play('sfx_click', { volume: 0.4 }); this.panel.open('chip', this.p.pid); } });
    c.add([this.bg, this.hit, this.eye, this.name, this.sub, this.x]);
    c.setVisible(false);
  }

  eyeIcon(ui) {
    if (Assets.has('ui_icon_binoculars') && !Assets.pending('ui_icon_binoculars')) {
      const im = Assets.image(ui, 0, 0, 'ui_icon_binoculars').setOrigin(0.5);
      im.setScale(30 / Math.max(1, im.frame.realWidth, im.frame.realHeight));
      return im;
    }
    const g = ui.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillEllipse(0, 0, 30, 18);
    g.lineStyle(3, 0x2b2f3a, 1); g.strokeEllipse(0, 0, 30, 18);
    g.fillStyle(0x2b2f3a, 1); g.fillCircle(0, 0, 5);
    return g;
  }

  hideChip() { if (this.c) { this.c.destroy(); this.c = null; } this.chipKey = ''; }

  refreshChip(force) {
    if (!this.c || !this.p) return;
    const p = this.p, a = this.act;
    const nm = rt('f_chip', { name: this.roster.shortName(p) });
    const sub = p.bodyRef ? '' : a.where;
    const key = nm + '|' + sub;
    if (!force && key === this.chipKey) { const y = this.chipY(); if (this.c.y !== y) this.c.y = y; return; }
    this.chipKey = key;
    if (this.name.text !== nm) this.name.setText(nm);
    if (this.sub.text !== sub) this.sub.setText(sub);
    this.layout();
  }

  layout() {
    if (!this.c) return;
    const ui = this.ui, W = ui.W;
    const two = !!this.sub.text;
    const h = two ? 88 : 64;
    const tw = Math.max(this.name.width, two ? this.sub.width : 0);
    const w = Math.max(300, Math.min(W - 40, 30 + 14 + tw + 24 + 48 + 28));
    this.c.setPosition(W / 2, this.chipY());
    this.bg.setSize(w, h);
    const L = -w / 2 + 22;
    this.eye.setPosition(L + 15, 0);
    this.name.setPosition(L + 38, two ? -16 : 1);
    this.sub.setPosition(L + 38, 20);
    // (a long name on a narrow screen: the text shrinks to the room left of ✕)
    const room = w - 22 - 38 - 24 - 48 - 16;
    const s = Math.min(1, room / Math.max(1, tw));
    this.name.setScale(s); this.sub.setScale(s);
    this.x.setPosition(w / 2 - 34, 0);
    this.hit.setPosition(-24, 0).setSize(w - 70, h);
    if (this.hit.input && this.hit.input.hitArea) this.hit.input.hitArea.setTo(0, 0, w - 70, h);
    this.c.setVisible(true);
  }

  /** the chip's place: the 관망 caption's slot, lower while the caption or a banner is up (they would cover it) */
  chipY() {
    const ui = this.ui, h = ui.hud42;
    const cap = h && h.obsCap && h.obsCap.visible;
    // ((v4.3 HUD review) the band sits under the right-hand column (UI.centreBandY: a long name or a sub-line covered
    //  마을 진도); with the caption up, 72 under wherever the caption is (under a banner too)
    const band = ui.centreBandY ? ui.centreBandY() : 62 + View.safeTop + 300;
    let y = cap ? (h.capAt != null ? h.capAt : band) + 72 : band;
    const bb = ui.bannerBox;
    if (bb && bb.visible && Math.abs(bb.y - y) < 130) y = bb.y + 150;
    return y;
  }

  state() {
    if (!this.on) return { on: false, back: this.back };
    return { on: true, pid: this.p.pid, chip: this.c ? this.name.text : null, sub: this.c ? this.sub.text : null, body: !!this.p.bodyRef, bodyKind: this.p.bodyKind, x: Math.round(this.px), y: Math.round(this.py), t: +this.t.toFixed(2) };
  }
}
