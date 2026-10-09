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

import { Assets } from '../core/Assets.js';

const MARGIN = 300;          // px of world around the view that still draws
const BOUNDS_EVERY = 400;    // ms a container's measured bounds are reused (labels rarely change shape)
// ((v4 review M5) pictures of the props atlas — border pines, fences, rocks, and the item pictures of every pile,
//  shelf and cash stack: about 1600 of the 2500 display objects of a full village — are taken OFF the display list
//  while they are far outside that rect, and put back (same pass, right before the draw) as soon as they — or the
//  camera, a jump, the overview zoom — bring them near again. A pooled item picture that is reused somewhere near
//  comes back the same frame. Only plain Images of the boot `props` atlas (never evicted by Residency, which walks
//  the display list) are parked.)
const PARK_OUT = 450;        // px beyond the drawn rect (itself the view + 300): parked
const PARK_IN = 250;         // px beyond the drawn rect: back on the list (hysteresis)
const PARK_TALL = 400;       // extra px below the rect (pictures stand on their foot and reach up)

export class Culler {
  constructor(gs) {
    this.gs = gs;
    this.culled = 0;
    this.passes = 0;
    this.ms = 0;
    this.enabled = true;
    this.R = { x: 0, y: 0, right: 0, bottom: 0 };
    this.tmp = null;
    this.parked = [];
    this.parkOn = true;
    this.okKey = new Map();
    this.onPre = () => { try { this.pass(); } catch (e) { this.fail(); } };
    gs.events.on('prerender', this.onPre);
    gs.events.once('shutdown', () => {
      gs.events.off('prerender', this.onPre);
      // parked pictures are not on the display list, so the scene would not destroy them
      for (const img of this.parked) { try { if (img.scene) img.destroy(); } catch (e) { /* */ } }
      this.parked.length = 0;
    });
  }

  /** a picture that may leave the display list while far away (texture checked every time: pools retexture) */
  parkable(o) {
    if (o.type !== 'Image' || o.noCull || o.scrollFactorX !== 1 || o.scrollFactorY !== 1 || o.parentContainer || !o.texture) return false;
    const k = o.texture.key;
    let v = this.okKey.get(k);
    if (v === undefined) {
      const A = Assets.m && Assets.m.atlases, a = A ? A[k] : null;
      v = /^props/.test(k) && !(a && a.onDemand);
      this.okKey.set(k, v);
    }
    return v;
  }

  /** parked pictures that came near again (or every one, when culling is off) go back on the list */
  unpark(R, all) {
    const P = this.parked, gs = this.gs, DL = gs.sys && gs.sys.displayList;
    if (!P.length || !DL) return;
    const x0 = R.x - PARK_IN, x1 = R.right + PARK_IN, y0 = R.y - PARK_IN, y1 = R.bottom + PARK_IN + PARK_TALL;
    let w = 0, back = 0;
    for (let i = 0; i < P.length; i++) {
      const o = P[i];
      if (!o.scene || o.parentContainer) { o.__park = 0; continue; }   // destroyed / put in a container while parked
      if (all || (o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1) || o.displayList) {
        o.__park = 0;
        if (!o.displayList) {
          // (a picture whose page went while it was off the list shows nothing rather than a dead texture)
          if (!o.texture || !gs.textures.exists(o.texture.key)) { o.setTexture('__WHITE'); o.setVisible(false); }
          o.displayList = DL; DL.list.push(o); back++;
        }
        continue;
      }
      P[w++] = o;
    }
    P.length = w;
    // (Phaser sorts the list BEFORE the prerender event: sort now, so a picture that came back is in its place)
    if (back) { DL.queueDepthSort(); DL.depthSort(); }
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
    const park = this.enabled && this.parkOn;
    this.unpark(R, !park);
    const list = gs.children.list;
    const px0 = R.x - PARK_OUT, px1 = R.right + PARK_OUT, py0 = R.y - PARK_OUT, py1 = R.bottom + PARK_OUT + PARK_TALL;
    let parkN = 0;
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
      if (park && ty === 'Image' && (o.x < px0 || o.x > px1 || o.y < py0 || o.y > py1) && this.parkable(o)) { o.__park = 2; parkN++; }
    }
    if (parkN) {
      // one compaction of the list (not a splice per picture)
      let w = 0;
      for (let i = 0; i < list.length; i++) { const o = list[i]; if (o.__park === 2) { o.__park = 1; o.displayList = null; this.parked.push(o); } else list[w++] = o; }
      list.length = w;
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

  /** draw everything again / cull again (tests, a full-world capture): also puts every parked picture back */
  setEnabled(v) { this.enabled = !!v; this.pass(); }
}
