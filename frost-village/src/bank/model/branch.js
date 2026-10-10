// Inside the bank (pure): residents who come on business (story `bank` events, 09–17) take a numbered ticket
// (번호표), wait in the queue (3 spots) or on the red bench (2 seats), and are called to one of the 3 teller
// windows by number ("17번 손님!"). At most 8 people inside (civic report: more and the heads overlap); a resident who
// finds it full simply comes back another time (the story is not affected). Deterministic: no randomness at all.

export class Branch {
  /** cfg = bank tuning; account = the chief's Account (it keeps the ticket counter in the save) */
  constructor(cfg, account) {
    this.cfg = cfg;
    this.acct = account;
    this.v = [];               // visitors: { pid, op, amount, n, st: 'queue'|'seat'|'counter'|'leave', slot, w, until }
    this.shown = 0;            // the number on the display
    this.out = [];
  }

  emit(e) { this.out.push(e); }
  drain() { const o = this.out; this.out = []; return o; }

  isOpen(hour) { const B = this.cfg.branch; return hour >= B.open && hour < B.close; }
  inside() { let n = 0; for (const v of this.v) if (v.st !== 'leave') n++; return n; }

  freeSlot(st, max) {
    const used = new Set(this.v.filter((v) => v.st === st).map((v) => v.slot));
    for (let i = 0; i < max; i++) if (!used.has(i)) return i;
    return -1;
  }

  /** a resident arrives (returns the visitor, or null when closed / full / already inside) */
  arrive(pid, op, amount, T, hour) {
    const B = this.cfg.branch;
    if (!this.isOpen(hour) || this.v.some((v) => v.pid === pid && v.st !== 'leave')) return null;
    if (this.inside() >= B.windows + B.queue + B.seats) return null;
    const n = this.acct.ticket;
    this.acct.ticket = n >= 999 ? 1 : n + 1;
    let st = 'queue', slot = this.freeSlot('queue', B.queue);
    if (slot < 0) { st = 'seat'; slot = this.freeSlot('seat', B.seats); }
    if (slot < 0) return null;
    const v = { pid, op: String(op || 'other'), amount: Math.max(0, Math.floor(Number(amount) || 0)), n, st, slot, w: -1, until: 0, t0: T };
    this.v.push(v);
    this.emit({ t: 'branch:ticket', pid, n, st, slot });
    return v;
  }

  /** move people on: finished customers leave, free windows call the next number, the bench moves up */
  tick(T) {
    const B = this.cfg.branch;
    for (const v of this.v) {
      if (v.st === 'counter' && T >= v.until) { v.st = 'leave'; v.until = T + 2.5; this.emit({ t: 'branch:served', pid: v.pid, op: v.op, amount: v.amount, w: v.w }); }
    }
    for (let k = this.v.length - 1; k >= 0; k--) if (this.v[k].st === 'leave' && T >= this.v[k].until) this.v.splice(k, 1);
    // call the lowest waiting ticket to each free window (tickets wrap at 999: order by arrival)
    for (let w = 0; w < B.windows; w++) {
      if (this.v.some((v) => v.st === 'counter' && v.w === w)) continue;
      let next = null;
      for (const v of this.v) if ((v.st === 'queue' || v.st === 'seat') && (!next || v.t0 < next.t0 || (v.t0 === next.t0 && v.st === 'queue' && next.st === 'seat'))) next = v;
      if (!next) break;
      next.st = 'counter'; next.w = w; next.slot = w;
      next.until = T + (B.serve[next.op] || B.serve.other) + 1.5;       // (+ the walk to the window)
      this.shown = next.n;
      this.emit({ t: 'branch:call', pid: next.pid, n: next.n, w });
    }
    // the bench moves up into the queue
    for (;;) {
      const q = this.freeSlot('queue', B.queue);
      const s = this.v.filter((v) => v.st === 'seat').sort((a, b) => a.t0 - b.t0)[0];
      if (q < 0 || !s) break;
      s.st = 'queue'; s.slot = q;
      this.emit({ t: 'branch:move', pid: s.pid, st: 'queue', slot: q });
    }
  }

  /** closing time: everyone still waiting is served tomorrow (they just leave) */
  close(T) { for (const v of this.v) if (v.st !== 'leave') { v.st = 'leave'; v.until = T + 2.5; } }

  people() { return this.v.map((v) => ({ pid: v.pid, n: v.n, st: v.st, slot: v.slot, w: v.w, op: v.op })); }
}
