// Speech bubbles (ui_chat_bubble 9-slice + ui_chat_tail + text + optional emote) and emote bubbles
// (ui_emote_bubble + emote) over characters' heads. Everything is pooled: no objects are created
// once the pool is warm. Bubbles follow their character and pop in / out.

import { Assets } from '../core/Assets.js';
import { DEPTH } from './DepthSort.js';
import { FONT } from '../data/strings.js';
import { panel } from '../core/Panel.js';

const MAX_CHAT = 5;
const MAX_EMOTE = 10;
const CHAT_W_MAX = 300;

export class Bubbles {
  constructor(gs) {
    this.gs = gs;
    this.chatPool = [];
    this.emotePool = [];
    this.active = [];      // { kind, c (container), who, t, dur, k, ... }
  }

  // ---------------------------------------------------------------- chat
  makeChat() {
    const gs = this.gs;
    const c = gs.add.container(0, 0).setDepth(DEPTH.BUBBLE + 20).setVisible(false);
    const body = panel(gs, 0, 0, Assets.pick('ui_chat_bubble', 'ui_panel'), 120, 56).setOrigin(0.5, 1);
    const tail = Assets.image(gs, 0, -20, Assets.pick('ui_chat_tail', 'ui_bubble_tail')).setOrigin(0.5, 0);
    const icon = Assets.image(gs, 0, 0, 'emote_heart').setOrigin(0.5, 0.5);
    const text = gs.add.text(0, 0, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '800', color: '#2b2f3a', align: 'center', lineSpacing: 2, resolution: 2, wordWrap: { width: CHAT_W_MAX - 30, useAdvancedWrap: true } }).setOrigin(0.5, 0.5);
    c.add([body, tail, icon, text]);
    return { kind: 'chat', c, body, tail, icon, text };
  }

  /**
   * speech bubble over character `who` with `text` (and an emote icon) for `dur` seconds.
   * (v4-C2) every bubble is spoken in 눈꽃말 by the speaker's own voice (VillageVoice, docs/build_reports/voice.md §7);
   * opts.silent: a card that is not speech (the townsperson info card)
   */
  chat(who, text, emote, dur = 2.6, opts) {
    if (!who || !who.alive) return null;
    // one bubble per character: replace its current one
    this.clear(who, 'chat');
    let n = 0;
    for (const b of this.active) if (b.kind === 'chat') n++;
    if (n >= MAX_CHAT) {
      // drop the oldest chat
      const old = this.active.find((b) => b.kind === 'chat');
      if (old) this.release(old);
    }
    const b = this.chatPool.pop() || this.makeChat();
    b.text.setText(text || '');
    const hasIcon = !!(emote && Assets.has(emote));
    if (hasIcon) { Assets.apply(b.icon, emote); b.icon.setOrigin(0.5, 0.5).setScale(34 / Math.max(1, b.icon.frame.realWidth)); }
    b.icon.setVisible(hasIcon);
    const tw = Math.min(CHAT_W_MAX - 30, b.text.width), th = b.text.height;
    const w = Math.max(80, Math.min(CHAT_W_MAX, tw + 30 + (hasIcon ? 38 : 0)));
    const h = Math.max(56, th + 30);
    b.body.setSize(w, h);
    // content box: inset l12 r12 t8 b18 (manifest conventions)
    const cy = -h + 8 + (h - 26) / 2;
    if (hasIcon) { b.icon.setPosition(-w / 2 + 12 + 19, cy); b.text.setPosition(19, cy); }
    else b.text.setPosition(0, cy);
    b.tail.setPosition(0, -20);
    b.who = who; b.t = 0; b.dur = dur; b.k = 0;
    // ((v4 review) a name card stays on screen, clear of the HUD chips: b.cw / b.ch its size)
    b.card = !!(opts && opts.card); b.cw = w; b.ch = h;
    b.tail.setVisible(true);
    b.c.setVisible(true).setAlpha(1).setScale(0.2);
    this.active.push(b);
    const vv = this.gs.voice;
    if (vv && !(opts && opts.silent)) { try { vv.speakBubble(text, who, emote); } catch (e) { /* the bubble stays */ } }
    return b;
  }

  // ---------------------------------------------------------------- emote
  makeEmote() {
    const gs = this.gs;
    const c = gs.add.container(0, 0).setDepth(DEPTH.BUBBLE + 10).setVisible(false);
    const hasBubble = Assets.has('ui_emote_bubble');
    const bg = hasBubble ? Assets.image(gs, 0, 0, 'ui_emote_bubble') : null;
    const icon = Assets.image(gs, 0, 0, 'emote_heart').setOrigin(0.5, 0.5);
    if (bg) c.add(bg);
    c.add(icon);
    return { kind: 'emote', c, bg, icon };
  }

  /** emote (in a round bubble) over `who` */
  emote(who, key, dur = 1.6) {
    if (!who || !who.alive || !key) return null;
    this.clear(who, 'emote');
    let n = 0;
    for (const b of this.active) if (b.kind === 'emote') n++;
    if (n >= MAX_EMOTE) { const old = this.active.find((b) => b.kind === 'emote'); if (old) this.release(old); }
    const b = this.emotePool.pop() || this.makeEmote();
    if (Assets.has(key)) Assets.apply(b.icon, key);
    const bs = 0.75;
    if (b.bg) {
      const d = Assets.def('ui_emote_bubble');
      const cc = d.contentCenter || [0, -54];
      b.bg.setScale(bs);
      b.icon.setOrigin(0.5, 0.5).setPosition(cc[0] * bs, cc[1] * bs).setScale((64 / Math.max(1, b.icon.frame.realWidth)) * bs * 0.95);
    } else b.icon.setOrigin(0.5, 1).setPosition(0, 0).setScale(48 / Math.max(1, b.icon.frame.realWidth));
    b.who = who; b.t = 0; b.dur = dur; b.k = 0;
    b.c.setVisible(true).setAlpha(1).setScale(0.2);
    this.active.push(b);
    return b;
  }

  /** remove `who`'s bubbles (kind: 'chat' | 'emote' | undefined = both) */
  clear(who, kind) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      if (b.who === who && (!kind || b.kind === kind)) this.release(b);
    }
  }

  release(b) {
    const i = this.active.indexOf(b);
    if (i >= 0) this.active.splice(i, 1);
    b.who = null;
    b.c.setVisible(false);
    (b.kind === 'chat' ? this.chatPool : this.emotePool).push(b);
  }

  hasChat(who) { for (const b of this.active) if (b.kind === 'chat' && b.who === who) return true; return false; }

  /** (v4 review) a name card inside the view: clear of the left / right edges, and below the HUD chips at the top
   *  (when there is no room above the head it hangs below the feet, without its tail) */
  keepOnScreen(b, w) {
    const gs = this.gs, v = gs.cameras.main.worldView;
    const hud = v.height * (gs.ui && gs.ui.hudBottomFrac ? gs.ui.hudBottomFrac() : 0.24);
    const half = b.cw / 2 + 10;
    const x = Math.max(v.x + half, Math.min(v.right - half, b.c.x));
    let y = b.c.y;
    const flip = y - b.ch - 24 < v.y + hud;
    if (flip) y = Math.min(v.bottom - 20, w.y + b.ch + 34);
    if (b.tail.visible === flip) b.tail.setVisible(!flip);
    b.c.setPosition(x, y);
  }

  update(dt) {
    const gs = this.gs;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      const w = b.who;
      b.t += dt;
      if (!w || !w.alive || b.t >= b.dur + 0.18) { this.release(b); continue; }
      // pop in, hold, shrink out
      const out = b.t > b.dur ? (b.t - b.dur) / 0.18 : 0;
      b.k += ((out > 0 ? 0 : 1) - b.k) * Math.min(1, dt * 14);
      const sc = out > 0 ? Math.max(0.01, 1 - out) : Math.min(1.08, b.k * 1.08);
      const vis = w.sprite.visible && gs.isOnScreen(w.x, w.y, 60);
      if (b.c.visible !== vis) b.c.setVisible(vis);
      if (!vis) continue;
      const head = w.y + w.headTop * (w.sprite.scaleY || 1) + (w.sitDy || 0);
      if (b.kind === 'chat') b.c.setPosition(w.x, head - 10 + Math.sin(gs.time.now / 320 + w.x) * 1.5);
      else b.c.setPosition(w.x + (b.dx || 0), head - 6 + Math.sin(gs.time.now / 280 + w.y) * 2);
      if (b.card) this.keepOnScreen(b, w);
      b.c.setScale(sc);
      // nearer the camera = drawn on top
      const d = (b.kind === 'chat' ? DEPTH.BUBBLE + 20 : DEPTH.BUBBLE + 10) + w.y * 0.001;
      if (b.c.depth !== d) b.c.setDepth(d);
    }
  }
}
