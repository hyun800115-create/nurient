// (v4-B) View culling for the Game scene. Phaser draws every visible object of the display list, wherever it is:
// with the town, the rail strip and the whole v3 village in one list, a frame touched ~100 different textures
// and the batch had to flush every time its 16 texture units were full (17-22 draw calls on SwiftShader).
// Pictures well outside the camera are now left out of the draw through their camera filter — the game's own
// `visible` flags (fog, piles, pools, x-ray) are never touched, so nothing else has to know about it.
//   - plain Images / Sprites and Containers (labels, bubbles: each has its own text texture) that scroll with
//     the world; loose texts, graphics and particles keep drawing
//   - decided right before every drawn frame (the scene's PRE_RENDER), so a pooled picture that just moved into
//     view (a flying item, an effect, a ground tile) is never a frame late; headless steps cost nothing
//   - the view is the union of where the camera is, where it is going (camTarget / centerOn) and the zoom it
//     glides to, plus a margin

const MARGIN = 300;          // px of world around the view that still draws
const BOUNDS_EVERY = 400;    // ms a container's measured bounds are reused (labels rarely change shape)

export class Culler {
  constructor(gs) {
    this.gs = gs;
    this.culled = 0;
    this.passes = 0;
    this.ms = 0;
    this.enabled = true;
    this.R = { x: 0, y: 0, right: 0, bottom: 0 };
    this.tmp = null;
    this.onPre = () => { try { this.pass(); } catch (e) { this.fail(); } };
    gs.events.on('prerender', this.onPre);
    gs.events.once('shutdown', () => gs.events.off('prerender', this.onPre));
  }

  /** the world rect that has to draw */
  rect() {
    const gs = this.gs, cam = gs.cameras.main, R = this.R;
    let z = Math.max(0.05, cam.zoom || 1);
    // the zoom the camera glides to (overview, pinch): use the wider of the two
    if (Number.isFinite(gs.zoomTarget) && Number.isFinite(gs.zoomCur) && gs.zoomCur > 0) z = Math.min(z, z * gs.zoomTarget / gs.zoomCur);
    const hw = cam.width / z / 2 + MARGIN, hh = cam.height / z / 2 + MARGIN;
    // where the camera is (scroll is current after centerOn), was last drawn (worldView) and is going (camTarget)
    const sx = cam.scrollX + cam.width / 2, sy = cam.scrollY + cam.height / 2;
    let x0 = sx - hw, y0 = sy - hh, x1 = sx + hw, y1 = sy + hh;
    const add = (cx, cy) => { x0 = Math.min(x0, cx - hw); y0 = Math.min(y0, cy - hh); x1 = Math.max(x1, cx + hw); y1 = Math.max(y1, cy + hh); };
    const wv = cam.worldView;
    if (wv && wv.width > 0) add(wv.centerX, wv.centerY);
    if (gs.camTarget) add(gs.camTarget.x, gs.camTarget.y);
    if (gs.camFocus) add(gs.camFocus.x, gs.camFocus.y);
    R.x = x0; R.y = y0; R.right = x1; R.bottom = y1;
    return R;
  }

  pass() {
    const gs = this.gs;
    if (!gs.cameras || !gs.cameras.main) return;
    const t0 = performance.now();
    const cam = gs.cameras.main, id = cam.id;
    const R = this.rect();
    const list = gs.children.list;
    const on = this.enabled;
    const now = gs.time ? gs.time.now : t0;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const ty = o.type;
      const box = ty === 'Image' || ty === 'Sprite';
      if (!box && ty !== 'Container') continue;
      let out = false;
      if (on && o.visible && !o.noCull && o.scrollFactorX === 1 && o.scrollFactorY === 1) {
        if (box) {
          const w = Math.abs(o.displayWidth), h = Math.abs(o.displayHeight);
          const l = o.x - w * o.originX, t = o.y - h * o.originY;
          out = l > R.right || l + w < R.x || t > R.bottom || t + h < R.y;
        } else if (o.list.length) {
          // a name label / bubble / sign: its children's bounds, measured now and then, kept relative to it
          let c = o.__cullB;
          if (!c || now - c.t > BOUNDS_EVERY) {
            let b = null;
            try { b = o.getBounds(this.tmp || (this.tmp = new Phaser.Geom.Rectangle())); } catch (e) { b = null; }
            c = o.__cullB = (b && Number.isFinite(b.x) && Number.isFinite(b.width)) ? { dx: b.x - o.x, dy: b.y - o.y, w: b.width, h: b.height, t: now } : { dx: 0, dy: 0, w: -1, h: -1, t: now };
          }
          if (c.w >= 0) { const l = o.x + c.dx, t = o.y + c.dy; out = l > R.right || l + c.w < R.x || t > R.bottom || t + c.h < R.y; }
        }
      }
      if (out) { if (!(o.cameraFilter & id)) o.cameraFilter |= id; n++; }
      else if (o.cameraFilter & id) o.cameraFilter &= ~id;
    }
    this.culled = n;
    this.passes++;
    this.ms = this.ms * 0.95 + (performance.now() - t0) * 0.05;
  }

  /** something went wrong: draw everything again and stop culling */
  fail() {
    this.enabled = false;
    try { this.pass(); } catch (e) { /* */ }
    this.gs.events.off('prerender', this.onPre);
  }

  /** draw everything again / cull again (tests, a full-world capture) */
  setEnabled(v) { this.enabled = !!v; this.pass(); }
}
