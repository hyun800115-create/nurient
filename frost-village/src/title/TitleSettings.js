// A small settings card for the title (the game's own settings panel lives in the UI scene, which does not
// run on the title). Sound, music, language, the intro choice and "오프닝 다시 보기". Used by the gear
// button when the lead does not pass an own hooks.onSettings.
import { FONT, setLang } from '../data/strings.js';
import { Settings } from '../core/Save.js';
import { Audio } from '../core/Audio.js';
import { TITLE_CFG, TITLE_TEXT } from './config.js';
import { TitlePrefs } from './prefs.js';

const D = 80;

export class TitleSettings {
  /** screen: the TitleScreen (for replayIntro / restart); put: UI camera filter */
  constructor(screen, put) {
    this.screen = screen; this.scene = screen.scene; this.put = put;
    this.open = false;
    this.objs = [];
  }

  text(x, y, str, size, color = '#2b2f3a', style = {}) {
    return this.scene.add.text(x, y, str, Object.assign({ fontFamily: FONT, fontSize: size + 'px', fontStyle: '800', color, resolution: 2 }, style));
  }

  add(o, d = D) { o.setDepth(d); this.put(o); this.objs.push(o); return o; }

  show() {
    if (this.open) return;
    this.open = true;
    const s = this.scene, W = this.screen.W, H = this.screen.H;
    const tx = TITLE_TEXT[this.screen.lang] || TITLE_TEXT.ko;
    Audio.start();                 // the gear tap is a user gesture: sound may start now
    Audio.play('sfx_click');
    // dim + swallow taps
    const dim = this.add(s.add.rectangle(W / 2, H / 2, W, H, 0x0b1430, 0.55).setInteractive());
    dim.on('pointerdown', () => this.hide());
    const cw = 560, ch = 660, cx = W / 2, cy = H / 2;
    const card = this.add(s.add.graphics(), D + 1);
    card.fillStyle(0x0d1d3d, 0.35); card.fillRoundedRect(cx - cw / 2, cy - ch / 2 + 10, cw, ch, 36);
    card.fillStyle(0xffffff, 1); card.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 36);
    card.fillStyle(0x2f78d0, 1); card.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, 96, { tl: 36, tr: 36, bl: 0, br: 0 });
    const blocker = this.add(s.add.zone(cx, cy, cw, ch).setInteractive(), D + 1);
    blocker.on('pointerdown', (p, x, y, e) => { if (e) e.stopPropagation(); });
    this.add(this.text(cx, cy - ch / 2 + 48, tx.settings, 38, '#ffffff', { stroke: '#173d7a', strokeThickness: 6 }).setOrigin(0.5), D + 2);
    const rows = [
      { label: tx.sound, get: () => (Settings.data.sound ? tx.on : tx.off), tap: () => { Audio.setSoundEnabled(!Settings.data.sound); } },
      { label: tx.music, get: () => (Settings.data.music ? tx.on : tx.off), tap: () => { Audio.setMusicEnabled(!Settings.data.music); } },
      { label: tx.lang, get: () => (this.screen.lang === 'en' ? 'English' : '한국어'), tap: () => this.switchLang() },
      { label: tx.intro, get: () => tx.introModes[TitlePrefs.data.intro || TITLE_CFG.introMode] || tx.introModes.first, tap: () => {
        const order = ['first', 'always', 'never'];
        const cur = TitlePrefs.data.intro || TITLE_CFG.introMode;
        TitlePrefs.setIntroMode(order[(order.indexOf(cur) + 1) % order.length]);
      } },
    ];
    let y = cy - ch / 2 + 150;
    for (const r of rows) {
      this.add(this.text(cx - cw / 2 + 44, y, r.label, 30).setOrigin(0, 0.5), D + 2);
      const pill = this.add(s.add.container(cx + cw / 2 - 130, y), D + 2);
      const g = s.add.graphics();
      const lb = this.text(0, 0, r.get(), 26, '#ffffff').setOrigin(0.5);
      const draw = () => { g.clear(); g.fillStyle(0x2f78d0, 1); g.fillRoundedRect(-95, -30, 190, 60, 30); lb.setText(r.get()); };
      draw();
      pill.add([g, lb]);
      pill.setSize(190, 60).setInteractive({ useHandCursor: true });
      pill.on('pointerdown', (p, x2, y2, e) => { if (e) e.stopPropagation(); r.tap(); Audio.play('sfx_click'); draw(); });
      y += 98;
    }
    // replay the intro / close
    const btn = (bx, by, label, color, fn) => {
      const c = this.add(s.add.container(bx, by), D + 2);
      const g = s.add.graphics();
      g.fillStyle(color, 1); g.fillRoundedRect(-120, -36, 240, 72, 36);
      const t = this.text(0, 0, label, 28, '#ffffff').setOrigin(0.5);
      c.add([g, t]);
      c.setSize(240, 72).setInteractive({ useHandCursor: true });
      c.on('pointerdown', (p, x2, y2, e) => { if (e) e.stopPropagation(); Audio.play('sfx_click'); fn(); });
    };
    btn(cx - 128, cy + ch / 2 - 70, tx.replay, 0xf0a43a, () => { this.hide(); this.screen.replayIntro(); });
    btn(cx + 128, cy + ch / 2 - 70, tx.close, 0x8e99a8, () => this.hide());
  }

  switchLang() {
    const next = this.screen.lang === 'en' ? 'ko' : 'en';
    Settings.data.lang = next; Settings.save(); setLang(next);
    // lay the title out again in the new language (no intro)
    this.hide();
    this.scene.scene.restart({ fromResize: true, title: this.scene.opts });
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
  }
}
