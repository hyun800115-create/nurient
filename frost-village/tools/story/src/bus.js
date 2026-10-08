// Tiny synchronous event bus. Handlers are stored per event name in plain arrays; emit() does not
// allocate (the payload object is created by the caller). '*' handlers receive (name, payload).

export class Bus {
  constructor() { this.h = Object.create(null); this.any = []; }
  on(name, fn, ctx) {
    if (name === '*') { this.any.push(fn, ctx); return this; }
    (this.h[name] || (this.h[name] = [])).push(fn, ctx);
    return this;
  }
  off(name, fn, ctx) {
    const list = name === '*' ? this.any : this.h[name];
    if (!list) return this;
    for (let i = list.length - 2; i >= 0; i -= 2) if (list[i] === fn && (ctx === undefined || list[i + 1] === ctx)) list.splice(i, 2);
    return this;
  }
  has(name) { const l = this.h[name]; return (l && l.length > 0) || this.any.length > 0; }
  emit(name, payload) {
    const l = this.h[name];
    if (l) for (let i = 0; i < l.length; i += 2) l[i].call(l[i + 1], payload);
    const a = this.any;
    for (let i = 0; i < a.length; i += 2) a[i].call(a[i + 1], name, payload);
  }
  clear() { this.h = Object.create(null); this.any = []; }
}
