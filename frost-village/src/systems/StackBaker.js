// (v4.2 P0, docs/v42_plan.md §13.3) pile baking: the item towers that lie on pads (collection piles, station inputs /
// outputs, shelves, cash piles, the warehouse door, the boathouse catch, the food box, the restaurant pantry, the
// dock crates) are drawn as ONE picture per stack instead of one picture per item. A full village had ~850 item
// pictures in the display list; now each baked stack is a single Image showing its slot of one shared 1024 x 1024
// DynamicTexture (4 MiB, `fv_stackbake`). The items are data ({ type, x, y }); a sprite exists only while an item
// flies in or out (ItemStack.pop() makes one at the item's place, push() hands the flown-in one back to the pool).
//
//   StackBaker.of(scene)                 the scene's baker (made on first use)
//   baker.slotFor(stack, w, h, ox, oy)   reserve a w x h slot (shelf packing); null when the texture is full: the
//                                        stack then simply keeps one sprite per item (the v4.1 way)
//   baker.bake(stack)                    erase the slot and draw the stack's items into it (called by ItemStack.layout
//                                        when the stack changed and is near the view)
// Canvas and WebGL alike (DynamicTexture.erase + batchDraw). Items whose atlas arrives later are re-baked.

import { Assets } from '../core/Assets.js';

const SIZE = 1024;
const PAD = 2;

export class StackBaker {
  static of(scene) {
    if (!scene || !scene.textures) return null;
    if (scene.__stackBaker && scene.__stackBaker.scene === scene) return scene.__stackBaker;
    try { scene.__stackBaker = new StackBaker(scene); } catch (e) { scene.__stackBaker = null; }
    return scene.__stackBaker;
  }

  constructor(scene) {
    this.scene = scene;
    this.key = 'fv_stackbake';
    if (scene.textures.exists(this.key)) scene.textures.remove(this.key);
    this.dt = scene.textures.addDynamicTexture(this.key, SIZE, SIZE);
    if (!this.dt) throw new Error('no dynamic texture');
    this.sky = new Int32Array(SIZE / 4);              // skyline packer: the filled height of every 4 px column
    this.rowY = 0;
    this.n = 0;
    this.stacks = [];
    this.bakes = 0;
    // a stamper for the items (scale + origin) and an eraser (a white rectangle stretched over a slot)
    this.stamp = scene.make.image({ x: 0, y: 0, key: '__WHITE', add: false });
    this.eraser = scene.make.image({ x: 0, y: 0, key: '__WHITE', add: false }).setOrigin(0, 0);
    this.onArrive = () => { for (const s of this.stacks) s.bakeDirty = true; };
    Assets.arrivals.push(this.onArrive);
    scene.events.once('shutdown', () => this.destroy());
  }

  /** reserve a slot for `stack` (w x h px, the stack's base point at (ox, oy) inside it) */
  slotFor(stack, w, h, ox, oy) {
    w = Math.ceil(w) + PAD * 2; h = Math.ceil(h) + PAD * 2;
    if (w > SIZE || h > SIZE) return null;
    // skyline: the lowest place this w-wide slot fits (bottom-left rule)
    const sky = this.sky, cw = Math.ceil(w / 4), nCol = sky.length;
    let bestX = -1, bestY = Infinity;
    for (let c = 0; c + cw <= nCol; c++) {
      let top = 0;
      for (let k = c; k < c + cw; k++) if (sky[k] > top) top = sky[k];
      if (top + h <= SIZE && top < bestY) { bestY = top; bestX = c; }
    }
    if (bestX < 0) return null;
    for (let k = bestX; k < bestX + cw; k++) sky[k] = bestY + h;
    this.rowY = Math.max(this.rowY, bestY + h);
    const slot = { x: bestX * 4 + PAD, y: bestY + PAD, w: w - PAD * 2, h: h - PAD * 2, ox, oy, name: 's' + (this.n++) };
    this.dt.add(slot.name, 0, slot.x, slot.y, slot.w, slot.h);
    this.stacks.push(stack);
    return slot;
  }

  /** draw the stack's items (their layout positions relative to the base point) into its slot */
  bake(stack) {
    const s = stack.slot, dt = this.dt;
    if (!s) return;
    this.bakes++;
    const er = this.eraser;
    er.setScale(s.w / Math.max(1, er.width), s.h / Math.max(1, er.height));
    dt.erase(er, s.x, s.y);
    const st = this.stamp, items = stack.items, bx = stack.bx, by = stack.by;
    let any = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.spr) continue;                 // a live sprite (flying in) draws itself
      if (!any) { dt.beginDraw(); any = true; }
      const r = Assets.sprite(it.type);
      if (!r || r.ph || r.pending) continue;
      if (st.__k !== it.type) { st.setTexture(r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]); st.__k = it.type; }
      st.setScale(it.sx || stack.scale, it.sy || stack.scale);
      dt.batchDraw(st, s.x + s.ox + (it.x - bx), s.y + s.oy + (it.y - by));
    }
    if (any) dt.endDraw();
  }

  destroy() {
    const i = Assets.arrivals.indexOf(this.onArrive);
    if (i >= 0) Assets.arrivals.splice(i, 1);
    try { this.stamp.destroy(); this.eraser.destroy(); } catch (e) { /* */ }
    this.stacks.length = 0;
    if (this.scene.__stackBaker === this) this.scene.__stackBaker = null;
  }
}
