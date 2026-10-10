// Node side of the logistics tests: the real logistics manifest from disk (read only) and the fake town (sim_env.js)
// around a bare LgxModel or a headless LogisticsHost.
//   const E = makeEnv({ seed }); E.run(600); E.model.state()
//   const H = makeHost({ seed }); H.run(600); H.host.api.state()

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LgxModel } from '../../../src/city/logistics/model/LgxModel.js';
import { LogisticsHost } from '../../../src/city/logistics/host.js';
import { layoutFor } from '../../../src/city/logistics/layout.js';
import { LGX_TUNING } from '../../../src/city/logistics/tuning.js';
import { Sim, PRICES, SHOPS } from './sim_env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'logistics', 'manifest.json'), 'utf8'));
export const GEO = layoutFor().makeGeo(MAN);
const geoFor = (place) => (place ? layoutFor(place).makeGeo(MAN) : GEO);
export { PRICES, SHOPS };
export const price = (k) => LGX_TUNING.prices[k] || PRICES[k] || 5;

/** a model + the fake town; run(sec) steps both at 30 Hz */
export function makeEnv(o = {}) {
  const sim = new Sim(o);
  const model = new LgxModel({ tune: o.tune || LGX_TUNING, geo: geoFor(o.place), seed: o.seed || 7, price, saved: o.saved || null, deliver: (ord) => sim.deliver(ord.to.slice(5), ord.got) });
  const api = {
    open: () => model.open,
    inbound: (items, from) => model.inbound(items, from, 'truck_cargo'),
    producers: () => Array.from(model.producers.values()).map((p) => ({ id: p.id })),
    feedProducer: (id, n) => model.feedProducer(id, n),
  };
  const env = { get shops() { return sim.shopsList(); }, homes: sim.homes };
  const E = {
    model, sim, env, shops: sim.shops, homes: sim.homes, delivered: sim.delivered, T: o.T === undefined ? 600 * 2 + 25 * 7 : o.T, events: [], view: [],
    run(sec, dt = 1 / 30) {
      const n = Math.round(sec / dt);
      for (let i = 0; i < n; i++) {
        this.T += dt;
        sim.tick(dt, api);
        model.update(dt, this.T, env);
        for (const e of model.drain()) this.events.push(e);
        for (const e of model.drainView()) this.view.push(e);
      }
    },
  };
  if (o.open !== false) model.build(true);
  if (o.producers) { model.addProducer('furniture', 'pf'); model.addProducer('appliance', 'pa'); }
  return E;
}

/** a headless LogisticsHost behind fake ports (no View) */
export function makeHost(o = {}) {
  const sim = new Sim(o);
  const out = { toasts: [], banners: [], sites: [], coins: 0, emits: [] };
  let T = o.T === undefined ? 600 * 2 + 25 * 7 : o.T;
  const ports = {
    clock: { T: () => T },
    lang: () => o.lang || 'ko',
    coins: { add: (n) => { out.coins += n; } },
    ui: { toast: (m) => out.toasts.push(m), banner: (m, s) => out.banners.push(m + ' / ' + (s || '')) },
    sites: { offer: (d) => out.sites.push(d) },
    emit: (e) => out.emits.push(e),
    shops: { list: () => sim.shopsList(), deliver: (id, items) => sim.deliver(id, items) },
    homes: { list: () => sim.homesList() },
  };
  const host = new LogisticsHost(ports, o.saved || null, { man: MAN, seed: o.seed || 7, price, place: o.place });
  return {
    host, sim, out, ports,
    get T() { return T; },
    run(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { T += dt; sim.tick(dt, host.api); host.update(dt); } },
  };
}
