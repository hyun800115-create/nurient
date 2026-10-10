// The 2nd -> 3rd industry chains (pure): the 가구 공방 (planks 3 -> 1 furniture, 6 s) and the 가전 공장
// (ingots 3 -> 1 appliance, 8 s). Village work buildings on M plots (Civic catalog, P27): porters / the chief bring
// planks or ingots to the input pad, the operator works the machine, finished pieces pile up on the output pad and
// the centre's van picks them up for the racks. What to make next follows demand (a house waiting for its 살림살이,
// the centre's lowest stock) so the chain never makes only chairs.

export const CHAIN_IN = { furniture: 'item_plank', appliance: 'item_ingot' };

export class Producer {
  /** o: { id, kind: 'furniture'|'appliance', inQ, outQ, made, rot } ; cfg = tuning[kind] */
  constructor(o, cfg) {
    this.id = o.id;
    this.kind = o.kind;
    this.cfg = cfg;
    this.input = CHAIN_IN[o.kind];
    this.inQ = Math.max(0, Math.floor(o.inQ || 0));
    this.outQ = Array.isArray(o.outQ) ? o.outQ.filter((k) => cfg.makes.includes(k)).slice(0, cfg.outMax) : [];
    this.made = Math.max(0, Math.floor(o.made || 0));
    this.rot = Math.max(0, Math.floor(o.rot || 0));     // rotation pointer when nothing is wanted
    this.making = null; this.t = 0;
    this.idleT = 0;                                      // s since the out pile last changed (a pickup timer)
    this.pickup = false;                                 // a van is on its way for the pile
  }
  need() { return Number(this.cfg.recipe[this.input]) || 3; }
  room() { return Math.max(0, (this.cfg.inMax || 30) - this.inQ); }
  /** planks / ingots in; returns how many were taken */
  feed(n) { const q = Math.max(0, Math.min(this.room(), Math.floor(n) || 0)); this.inQ += q; return q; }
  working() { return !!this.making; }

  /**
   * one step. choose(list) picks the next piece among cfg.makes (the model's demand rule).
   * Returns the piece finished in this step (or null).
   */
  update(dt, choose) {
    let done = null;
    if (!this.making && this.inQ >= this.need() && this.outQ.length < this.cfg.outMax) {
      this.inQ -= this.need();
      this.making = choose(this.cfg.makes, this) || this.cfg.makes[this.rot++ % this.cfg.makes.length];
      this.t = Number(this.cfg.make) || 6;
    }
    if (this.making) {
      this.t -= dt;
      if (this.t <= 0) { this.outQ.push(this.making); this.made++; done = this.making; this.making = null; this.idleT = 0; }
    }
    if (this.outQ.length) this.idleT += dt;
    return done;
  }
  /** the van takes the whole pile */
  takeAll() { return this.take(() => true); }
  /** the van takes what the racks have room for (fits(item) is asked in pile order); the rest waits on the pad */
  take(fits) { const out = {}, keep = []; for (const k of this.outQ) { if (fits(k)) out[k] = (out[k] || 0) + 1; else keep.push(k); } this.outQ = keep; this.idleT = 0; return out; }
  /** a pickup is due: enough pieces, or some pieces waiting long enough */
  due() { return !this.pickup && (this.outQ.length >= this.cfg.pickupAt || (this.outQ.length > 0 && this.idleT >= this.cfg.idlePickupS)); }
  serialize() { return { id: this.id, kind: this.kind, inQ: this.inQ + (this.making ? this.need() : 0), outQ: this.outQ.slice(), made: this.made, rot: this.rot }; }
}
