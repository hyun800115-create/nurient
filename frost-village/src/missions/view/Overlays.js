// UI-scene overlays of the missions module:
//   AcceptCard  — the 받기 / 나중에 card of a request (giver's portrait, their words, the reward)
//   DoneStamp   — "미션 완료!" on a mint card with the rewards (sfx_mission_done)
//   TitleBanner — a new chief title: the badge pops with a glow, the ribbon, the reward line, falling stars, then the
//                 badge flies to the fame chip (sfx_fame_up)
//   EdgeMarker  — the focus target off screen: a round badge at the screen edge pointing to it (a moving recipient too)

import { TXT, COL, icon, reicon, fit, panel, button, has, Assets, KIND_ICON, titleBadge } from './ui.js';
import { mt, titleOf, fmtN } from '../strings.js';

const W0 = 720;

export class AcceptCard {
  constructor(host) { this.host = host; this.ui = host.ports.ui.scene; this.c = null; this.id = 0; }
  get W() { return this.ui.W || W0; }
  get H() { return this.ui.H || 1280; }
  isOpen() { return !!this.c; }

  show(id, why) {
    const h = this.host, m = h.model, i = m.get(id);
    if (!i || i.s !== 'o') return;
    if (this.c && this.id === id) return;
    this.hide(true);
    this.id = id; this.why = why || 'tap';
    const ui = this.ui, W = this.W, H = this.H, lang = h.lang(), t = m.template(i);
    const names = h.namesOf(i);
    // compact, and only its buttons take touches: a drag that starts on the card still walks the chief (critique M-4)
    const cw = Math.min(W - 40, 664), ch = 236;
    const cy = H - 316 - (h.ports.ui.safeBottom || 0);
    const c = this.c = ui.add.container(W / 2, cy).setDepth(66);
    const bg = panel(ui, 0, 0, has('ui_mission_card') ? 'ui_mission_card' : 'ui_panel', cw, ch).setOrigin(0.5);
    c.add(bg);
    const x0 = -cw / 2;
    // the giver's face (a portrait for named villagers and pets, else the request icon)
    const plate = ui.add.graphics();
    plate.fillStyle(0xfff3d6, 1); plate.fillCircle(x0 + 96, -36, 54);
    plate.lineStyle(5, 0xe35d8c, 1); plate.strokeCircle(x0 + 96, -36, 54);
    c.add(plate);
    const pk = h.ports.people.portrait ? h.ports.people.portrait(i.gv) : null;
    if (pk && has(pk)) c.add(icon(ui, x0 + 96, -38, [pk], 98));
    else c.add(icon(ui, x0 + 96, -36, [t.icon, 'ui_icon_request'], 68));
    c.add(icon(ui, x0 + 140, -80, ['ui_icon_request'], 38));
    const nm = ui.add.text(x0 + 172, -82, mt(lang, 'm_from', { giver: names.from }), TXT(23, COL.pink)).setOrigin(0, 0.5);
    fit(nm, cw - 210);
    c.add(nm);
    const line = t.say && (i.gv === i.nm && t.say.offerSelf ? t.say.offerSelf : t.say.offer);
    const say = line ? (line[lang] || line.ko) : titleOf(t, lang, names);
    const q = ui.add.text(x0 + 172, -36, '“' + fill(say, names) + '”', Object.assign(TXT(21, COL.ink, '#ffffff', 0, '800'), { lineSpacing: 4, wordWrap: { width: cw - 200, useAdvancedWrap: true } })).setOrigin(0, 0.5);
    fit(q, cw - 200, 80);
    c.add(q);
    const tt = ui.add.text(x0 + 40, 36, titleOf(t, lang, names), TXT(19, COL.soft, '#ffffff', 0, '900')).setOrigin(0, 0.5);
    fit(tt, cw - 80);
    c.add(tt);
    // the reward
    const coins = m.pay(t.pay);
    c.add(icon(ui, x0 + 56, 80, ['ui_icon_coin'], 34));
    c.add(ui.add.text(x0 + 78, 80, '+' + fmtN(coins), TXT(23, COL.gold)).setOrigin(0, 0.5));
    c.add(icon(ui, x0 + 200, 80, ['ui_icon_fame'], 34));
    c.add(ui.add.text(x0 + 222, 80, '+' + t.fame, TXT(23, '#c4517a')).setOrigin(0, 0.5));
    const snd = (k, o) => h.ports.sound.play(k, o);
    c.add(button(ui, cw / 2 - 300, 76, 150, 64, 'gray', mt(lang, 'm_later'), () => { m.later(id); this.hide(); h.declined(id); }, 24, snd));
    c.add(button(ui, cw / 2 - 118, 76, 196, 64, 'green', mt(lang, 'm_accept'), () => { h.accept(id); this.hide(); }, 27, snd));
    c.setAlpha(0).setY(cy + 60);
    ui.tweens.add({ targets: c, alpha: 1, y: cy, duration: 240, ease: 'Back.easeOut' });
    h.ports.sound.play('sfx_whoosh', { volume: 0.35 });
  }

  hide(immediate) {
    const c = this.c;
    if (!c) return;
    this.c = null; this.id = 0;
    if (immediate) { c.destroy(); return; }
    this.ui.tweens.add({ targets: c, alpha: 0, y: c.y + 50, duration: 160, onComplete: () => c.destroy() });
  }

  update() {
    if (!this.c) return;
    const i = this.host.model.get(this.id);
    if (!i || i.s !== 'o') { this.hide(); return; }
    // opened by standing near: walking away closes it again
    if (this.why === 'near' && i.gv) {
      const p = this.host.ports.people.pos(i.gv), ch = this.host.ports.chief;
      if (!p || Math.hypot(p.x - ch.x(), p.y - ch.y()) > this.host.cfg.acceptRange * 2.2) this.hide();
    }
  }

  destroy() { this.hide(true); }
}

/** {to} / {from} / {name} in a line */
export function fill(s, names) {
  for (const k of ['name', 'to', 'from']) s = s.split('{' + k + '}').join(names[k] || '');
  return s;
}

export class DoneStamp {
  constructor(host) { this.host = host; this.ui = host.ports.ui.scene; this.q = []; this.c = null; }
  get W() { return this.ui.W || W0; }

  push(d) { this.q.push(d); if (!this.c) this.next(); }

  next() {
    const d = this.q.shift();
    if (!d) return;
    const ui = this.ui, W = this.W, h = this.host, lang = h.lang();
    const y = 470 + (h.ports.ui.safeTop || 0);       // (below the chips, also when v4's order chip shows)
    const cw = 470, ch = 116;
    const c = this.c = ui.add.container(W / 2, y).setDepth(64);
    c.add(panel(ui, 0, 0, has('ui_mission_card_done') ? 'ui_mission_card_done' : 'ui_panel', cw, ch).setOrigin(0.5));
    c.add(icon(ui, -cw / 2 + 70, 0, [d.icon, 'ui_icon_mission'], 56));
    const t1 = ui.add.text(-cw / 2 + 112, -24, d.head || mt(lang, 'm_done'), TXT(25, COL.green)).setOrigin(0, 0.5);
    fit(t1, cw - 150);
    const t2 = ui.add.text(-cw / 2 + 112, 6, d.title || '', TXT(17, COL.soft, '#ffffff', 0, '800')).setOrigin(0, 0.5);
    fit(t2, cw - 150);
    c.add([t1, t2]);
    let rx = -cw / 2 + 112;
    if (d.coins > 0) { c.add(icon(ui, rx + 12, 36, ['ui_icon_coin'], 26)); const tc = ui.add.text(rx + 28, 36, '+' + fmtN(d.coins), TXT(19, COL.gold)).setOrigin(0, 0.5); c.add(tc); rx += 50 + tc.width; }
    if (d.fame > 0) { c.add(icon(ui, rx + 12, 36, ['ui_icon_fame'], 26)); c.add(ui.add.text(rx + 28, 36, '+' + d.fame, TXT(19, '#c4517a')).setOrigin(0, 0.5)); }
    if (d.stars) { const st = ui.add.text(cw / 2 - 26, -26, '★'.repeat(d.stars) + '☆'.repeat(3 - d.stars), TXT(24, '#ffb52e', '#ffffff', 4)).setOrigin(1, 0.5); c.add(st); }
    c.setScale(0.4).setAlpha(0);
    ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    ui.tweens.add({ targets: c, alpha: 0, y: y - 30, delay: 1900, duration: 300, onComplete: () => { c.destroy(); if (this.c === c) this.c = null; this.next(); } });
    if (d.sound !== false) h.ports.sound.play(d.sound || 'sfx_mission_done', { volume: 0.8 });
  }

  destroy() { if (this.c) this.c.destroy(); this.c = null; this.q = []; }
}

export class TitleBanner {
  constructor(host) { this.host = host; this.ui = host.ports.ui.scene; this.c = null; }
  get W() { return this.ui.W || W0; }
  get H() { return this.ui.H || 1280; }
  isOpen() { return !!this.c; }

  show(level, sub) {
    const ui = this.ui, W = this.W, H = this.H, h = this.host, lang = h.lang();
    if (this.c) this.c.destroy();
    const cy = H * 0.36;
    const c = this.c = ui.add.container(W / 2, cy).setDepth(80);
    const glow = has('fx_glow') ? Assets.image(ui, 0, 0, 'fx_glow') : null;
    if (glow) { glow.setScale(520 / Math.max(1, glow.frame.realWidth)).setTint(0xffd86b).setAlpha(0.85).setBlendMode(Phaser.BlendModes.ADD); c.add(glow); }
    const rays = ui.add.graphics();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      rays.fillStyle(k % 2 ? 0xfff2c4 : 0xffe08a, 0.55);
      rays.fillTriangle(0, 0, Math.cos(a - 0.12) * 300, Math.sin(a - 0.12) * 300, Math.cos(a + 0.12) * 300, Math.sin(a + 0.12) * 300);
    }
    rays.setAlpha(0.5);
    c.add(rays);
    // the chief-title badge: the crown with as many gold stars as the title (the village rank keeps its shield)
    const badge = titleBadge(ui, 0, -10, level, 230);
    const bs = 1;
    c.add(badge);
    const rib = ui.add.container(0, 150);
    const name = ui.add.text(0, -4, mt(lang, 't_' + level), TXT(44, '#ffffff', '#1f4f8f', 9)).setOrigin(0.5);
    fit(name, W - 140);
    rib.add(panel(ui, 0, 0, 'ui_button_blue', Math.max(380, name.displayWidth + 100), 96).setOrigin(0.5));
    rib.add(name);
    c.add(rib);
    if (sub) {
      const st = ui.add.text(0, 236, sub, Object.assign(TXT(25, '#ffffff', '#1f3354', 6, '800'), { align: 'center' })).setOrigin(0.5);
      fit(st, W - 80);
      const pg = ui.add.graphics();
      pg.fillStyle(0x1f3354, 0.62); pg.fillRoundedRect(-st.displayWidth / 2 - 24, 236 - 27, st.displayWidth + 48, 54, 27);
      c.add([pg, st]);
    }
    // pop
    badge.setScale(bs * 0.2); rib.setScale(0.3).setAlpha(0);
    ui.tweens.add({ targets: badge, scale: bs * 1.12, duration: 380, ease: 'Back.easeOut', onComplete: () => ui.tweens.add({ targets: badge, scale: bs, duration: 160 }) });
    ui.tweens.add({ targets: rib, scale: 1, alpha: 1, delay: 220, duration: 360, ease: 'Back.easeOut' });
    ui.tweens.add({ targets: rays, angle: 30, duration: 4000 });
    if (glow) ui.tweens.add({ targets: glow, alpha: 0.5, yoyo: true, repeat: 3, duration: 500 });
    // falling stars
    let em = null;
    const sf = has('fx_star') ? Assets.sprite('fx_star') : null;
    if (sf) {
      const fr = ui.textures.get(sf.tex).get(sf.frame);
      const base = 24 / Math.max(8, fr.width);
      const cfg = { x: { min: 0, max: W }, y: -30, lifespan: 3000, speedY: { min: 220, max: 420 }, speedX: { min: -70, max: 70 }, scale: { min: base * 0.7, max: base * 1.3 }, rotate: { start: 0, end: 540 }, frequency: 30, quantity: 2, tint: [0xffc83d, 0xff6f91, 0x3d8be0, 0x5cc86a, 0xffffff], duration: 2200 };
      if (sf.frame !== undefined) cfg.frame = sf.frame;
      em = ui.add.particles(0, 0, sf.tex, cfg).setDepth(79);
    }
    h.ports.sound.play('sfx_fame_up', { volume: 0.9 });
    // then the badge flies to the fame chip and everything else fades
    ui.time.delayedCall(3400, () => {
      if (this.c !== c) return;
      const tg = h.fameTarget ? h.fameTarget() : { x: W - 200, y: 220 };
      const lx = tg.x - c.x, ly = tg.y - c.y;
      ui.tweens.add({ targets: [rays, rib].concat(glow ? [glow] : []).concat(c.list.filter((o) => o !== badge && o !== rays && o !== rib && o !== glow)), alpha: 0, duration: 300 });
      ui.tweens.add({ targets: badge, x: lx, y: ly, scale: bs * (44 / 230), duration: 800, ease: 'Cubic.easeIn', onComplete: () => { c.destroy(); if (this.c === c) this.c = null; if (h.onBadgeLanded) h.onBadgeLanded(); } });
    });
    if (em) ui.time.delayedCall(6000, () => em.destroy());
  }

  destroy() { if (this.c) this.c.destroy(); this.c = null; }
}

export class EdgeMarker {
  constructor(host) {
    this.host = host;
    const ui = this.ui = host.ports.ui.scene;
    const c = this.c = ui.add.container(0, 0).setDepth(19).setVisible(false);
    const ptr = this.ptr = ui.add.graphics();
    ptr.fillStyle(0xe35d8c, 1); ptr.fillTriangle(40, 0, 27, -11, 27, 11);
    const g = ui.add.graphics();
    g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 4, 32);
    g.fillStyle(0xfff8ec, 0.97); g.fillCircle(0, 0, 32);
    g.lineStyle(5, 0xe35d8c, 1); g.strokeCircle(0, 0, 30);
    this.ic = icon(ui, 0, 0, ['ui_icon_request'], 40);
    c.add([ptr, g, this.ic]);
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const h = this.host, ui = this.ui;
    const tg = h.chipsVisible() && !h.panelOpen() ? h.focusTarget() : null;
    let show = false;
    if (tg) {
      const p = h.ports.view.toScreen(tg.x, tg.y - 60);
      const W = ui.W || W0, H = ui.H || 1280;
      if (p.x < -10 || p.x > W + 10 || p.y < 120 || p.y > H + 10) {
        const M = 58, cx = W / 2, cy = H / 2;
        const ex = Phaser.Math.Clamp(p.x, M, W - M), ey = Phaser.Math.Clamp(p.y, 360, H - 440 - (h.ports.ui.safeBottom || 0));
        const a = Math.atan2(p.y - cy, p.x - cx);
        const bob = Math.sin(this.t * 5) * 4;
        this.c.setPosition(ex - Math.cos(a) * bob, ey - Math.sin(a) * bob);
        this.ptr.setRotation(Math.atan2(p.y - ey, p.x - ex));
        reicon(this.ic, [tg.icon, 'ui_icon_request']);
        show = true;
      }
    }
    if (this.c.visible !== show) this.c.setVisible(show);
  }

  destroy() { this.c.destroy(); }
}
