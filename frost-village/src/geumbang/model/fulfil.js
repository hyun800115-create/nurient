// The hub loop (plan §5.4, pure): pickers take each line off its rack (hub.pickLineS per line, walk included), packers
// box it (hub.packS per parcel: the box pops, items hop in, tape), the parcel is staged on the outbound pile by dock 1
// (st 'ready'). Loading onto a van is the dispatcher's (dock hand, hub.loadEachS per parcel). The crew works the
// day hours (07–21); with 새벽배송 the night crew works through. A task in hand is always finished (never cut).
// Events: { t: 'pick', id, item, who } · { t: 'pack', id, who } · { t: 'ready', id }.

export class Hub {
  constructor(tune) {
    this.tune = tune;
    this.pickers = [];
    this.packers = [];
    this.setCrew(tune.hub.pickers, tune.hub.packers);
  }

  setCrew(np, nk) {
    while (this.pickers.length < np) this.pickers.push({ k: this.pickers.length, o: null, t: 0, line: 0 });
    while (this.packers.length < nk) this.packers.push({ k: this.packers.length, o: null, t: 0 });
  }

  /** dt step. book: OrderBook; working: the crew is on shift; ev: push events here */
  update(dt, book, working, ev) {
    const H = this.tune.hub;
    const busy = new Set();
    for (const p of this.pickers) if (p.o) busy.add(p.o.id);
    for (const p of this.packers) if (p.o) busy.add(p.o.id);
    // pickers
    for (const p of this.pickers) {
      if (!p.o && working) {
        const o = next(book.list, 'pick', busy);
        if (o) { p.o = o; p.t = 0; p.line = o.picked; busy.add(o.id); }
      }
      if (!p.o) continue;
      const o = p.o;
      if (o.st !== 'pick') { p.o = null; continue; }        // restocked meanwhile
      if (p.t === 0) ev.push({ t: 'pick', id: o.id, item: o.lines[o.picked] || o.lines[0], who: p.k, line: o.picked });
      p.t += dt;
      if (p.t >= H.pickLineS) {
        p.t = 0;
        o.picked++;
        if (o.picked >= o.lines.length) { o.st = 'pack'; busy.delete(o.id); p.o = null; }
      }
    }
    // packers
    for (const p of this.packers) {
      if (!p.o && working) {
        const o = next(book.list, 'pack', busy);
        if (o) { p.o = o; p.t = 0; busy.add(o.id); ev.push({ t: 'pack', id: o.id, who: p.k, size: o.size }); }
      }
      if (!p.o) continue;
      const o = p.o;
      if (o.st !== 'pack') { p.o = null; continue; }
      p.t += dt;
      if (p.t >= H.packS) { o.st = 'ready'; p.o = null; ev.push({ t: 'ready', id: o.id, size: o.size, aid: o.aid }); }
    }
  }

  /** what the crew is doing (the view stages them) */
  state() {
    return {
      pickers: this.pickers.map((p) => (p.o ? { id: p.o.id, item: p.o.lines[Math.min(p.o.picked, p.o.lines.length - 1)], t: p.t } : null)),
      packers: this.packers.map((p) => (p.o ? { id: p.o.id, size: p.o.size, t: p.t } : null)),
    };
  }

  /** unpicked lines still on the racks (the view draws them there until a picker takes them) */
  unpicked(book) {
    const out = {};
    for (const o of book.list) {
      if (o.st !== 'pick') continue;
      for (let k = o.picked; k < o.lines.length; k++) { const it = o.lines[k]; out[it] = (out[it] || 0) + (o.got[it] || 0); }
      // the line in a picker's hands is half way: it left the shelf when the picker reached it (p.t > half)
    }
    return out;
  }
}

/** the oldest order in state st that nobody holds (the forced first order first, tomorrow's orders last) */
function next(list, st, busy) {
  let best = null;
  for (const o of list) {
    if (o.st !== st || busy.has(o.id)) continue;
    if (!best || (o.first && !best.first) || (o.first === best.first && o.t0 < best.t0)) best = o;
  }
  return best;
}
