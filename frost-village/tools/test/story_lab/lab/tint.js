// The lab's copy of the game's day / night look (src/systems/DayClock.js target(): white by day, a warm orange then
// lilac dusk, night blue, a peach dawn; a MULTIPLY overlay never darker than the readability floor; ADD glows on
// the street lamps from 19:00 to 06:30). Same numbers as BALANCE.v4.day.

const D = { darkness: 0.45, dawn: 6, dayStart: 8, dusk: 17, night: 20, lightsOn: 19, lightsOff: 6.5 };
const NIGHT = 0x5a6aa8, DUSK0 = 0xffb070, DUSK1 = 0x7d88c8, DAWN = 0xffd6b0;

function lerpColor(a, b, f) {
  const ch = (s) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export function tintAt(h) {
  const dk = D.darkness;
  if (h >= D.dayStart && h < D.dusk) return { color: 0xffffff, a: 0 };
  if (h >= D.dusk && h < D.night) { const f = (h - D.dusk) / (D.night - D.dusk); return { color: lerpColor(DUSK0, DUSK1, f), a: 0.16 + (dk - 0.16) * f }; }
  if (h >= D.dawn && h < D.dayStart) { const f = (h - D.dawn) / (D.dayStart - D.dawn); return { color: lerpColor(NIGHT, DAWN, Math.min(1, f * 2)), a: dk * (1 - f) + 0.15 * f * (1 - f) * 2 }; }
  return { color: NIGHT, a: dk };
}

export class DayTint {
  /** lamps: [{ x, y }] glowing points */
  constructor(scene, art, lamps) {
    this.scene = scene; this.art = art; this.lamps = lamps;
    this.overlay = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0).setDepth(5e5).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);
    this.glows = lamps.map((p) => { const g = art.image(scene, p.x, p.y, 'fx_glow'); if (g) g.setBlendMode(Phaser.BlendModes.ADD).setDepth(5e5 + 1).setTint(0xffd9a0).setScale(1.5).setVisible(false); return g; }).filter(Boolean);
  }
  update(hour) {
    const t = tintAt(hour), a = t.a, o = this.overlay;
    if (a < 0.004) o.setVisible(false);
    else {
      // the camera's worldView is only refreshed when it renders: cover the view from its scroll + zoom instead
      const cam = this.scene.cameras.main, w = cam.width / cam.zoom, h = cam.height / cam.zoom, m = 160;
      const x = cam.scrollX + cam.width / 2 - w / 2, y = cam.scrollY + cam.height / 2 - h / 2;
      const mix = (ch) => Math.round(255 * (1 - a) + ch * a);
      o.setVisible(true).setPosition(x - m, y - m).setDisplaySize(w + m * 2, h + m * 2)
        .setTint((mix((t.color >> 16) & 255) << 16) | (mix((t.color >> 8) & 255) << 8) | mix(t.color & 255));
    }
    const on = (hour >= D.lightsOn || hour < D.lightsOff) && a > 0.05;
    for (const g of this.glows) g.setVisible(on).setAlpha(Math.min(0.75, a * 2.2));
  }
}
