// The 금방 port adapter over the CURRENT v4.2 objects (plan §12.1 "ports_v4.js"; the kit's Ports replace it at v5).
// The one module file that knows v4.2 internals: the model, host and views only ever see `ports`. It is also the v4.2
// system the integration adds (Integration G-P1: one line in src/systems/v42/index.js SYSTEMS):
//   ['gb', (gs, v, s, sv) => new GeumbangSystem(gs, v, s, sv)]
//   sys.update(dt) · sys.slices() -> { geumbang } · sys.state() · sys.hooks(H) (window.__FV.v42.gb) · sys.destroy()
//   gs.v43.gb = the module api (plan §12.2) once the depot stands
// Nothing runs before the gate (the v4.2 depot built): the saved slice is carried through untouched until then.
// Without the other patches it still runs — what each missing patch costs is written next to the port that needs it
// (docs/build_reports/geumbang_module.md, Integration).
//
// Ports (the contract the host / view use; tools/test/geumbang_lab/lab.js makePorts is the same shape):
//   clock { T, hour, day, dark } · lang · roads { net, village } · town { homes, home, passer, walkers }
//   depot { count, pick, restock, level, fill, sleighBusy, surplus, dockSurplus, takeSurplus, building, reveal, stock,
//           staff } · coins { till, spend } · growth { happy } · ledger { shelf } · price · weather { snow }
//   settings { alerts, scenes } · world { scene } · ui { scene, toast, banner, busy, toasted, hidePill }
//   view { onScreen, lookAt, release } · input { onTap } · dolls { make, resident, hub } · fx { sheet, burst, floatText }
//   sound { at, play } · letters { offer } · emit(e)

import { WORLD } from '../data/world.js';
import { BALANCE } from '../data/balance.js';
import { priceOf } from '../data/items.js';
import { getLang, t } from '../data/strings.js';
import { Settings } from '../core/Save.js';
import { Audio } from '../core/Audio.js';
import { Assets } from '../core/Assets.js';
import { TF, mulberry32 } from '../core/Townfolk.js';
import { Residency } from '../core/Residency.js';
import { View } from '../core/View.js';
import { DollSprite } from '../entities/DollSprite.js';
import { UnlockPad } from '../entities/UnlockPad.js';
import { LINES } from '../systems/StockLedger.js';
import { GeumbangHost } from './host.js';
import { GbView } from './view/GbView.js';
import { gbTuning } from './tuning.js';
import { gbLayout, L } from './layout.js';
import { gt } from './strings.js';
import { FRAGMENTS } from './index.js';
import { homeSets, townSignature, villageGraphOf, keepRight } from './townRead.js';

const HOUR = 25;
const sum = (o) => { let n = 0; for (const k in o || {}) n += Number(o[k]) || 0; return n; };
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const ROLE_KIND = { home: 'apt', shop: 'shop', hall: 'hall', fire: 'fire' };
const PERSON_KIND = { student: 'child', teen: 'child', elder: 'elder', shopkeeper: 'keeper', keeper: 'keeper' };

// ====================================================================================================== the world
/**
 * The AddressBook entries from the v4.2 town (plan §5.1): the town buildings with homes (WORLD.v4.town.buildings, not
 * the station), the district lots someone lives on, the old village's v3 houses (G1b, the sled). Households are the
 * TownSim citizens of that home (an apartment: runs of 1–3 people by citizen id; a shop / house: one household).
 * 정 할머니 (the letter's sender) is the first elder of 솔방울 아파트 2동: her household is `first`.
 */
export function townEntries(gs) {
  const nb = gs.v4, rn = nb && nb.roadNet, T = nb && nb.town, V = WORLD.v4 || {};
  if (!rn) return [];
  const byHome = new Map();
  if (T) for (const c of T.citizens) { if (!c || !c.home) continue; let l = byHome.get(c.home); if (!l) byHome.set(c.home, (l = [])); l.push(c); }
  const doorOf = (id) => { const s = rn.doorSpur && rn.doorSpur[id]; return s && Number.isFinite(s.x) ? { x: s.x, y: s.y } : null; };
  const out = [];
  let jeong = false;
  const households = (id, kind, ps) => {
    const list = ps.slice().sort((a, b) => a.id - b.id);
    const hh = [];
    const person = (c) => ({ pid: 'c' + c.id, cid: c.id, name: c.name, kind: PERSON_KIND[c.kind] || 'adult', fav: c.fav });
    if (kind === 'apt') {
      for (let i = 0; i < list.length;) {
        const n = 1 + ((list[i].id * 7) % 3);
        const run = list.slice(i, i + n).map(person);
        hh.push({ hid: id + ':' + list[i].id, people: run, name: run[0].name });
        i += n;
      }
    } else if (list.length) hh.push({ hid: id + ':' + list[0].id, people: list.map(person), name: list[0].name });
    // 정 할머니 (the letter's sender, the first order): a story household of 솔방울 아파트 2동, always at home
    if (id === 't_apt2' && !jeong) {
      jeong = true;
      hh.unshift({ hid: 't_apt2:jeong', people: [{ pid: 'jeong', name: gt('gb_jeong', null, getLang()), kind: 'elder', fav: 'item_bread' }], name: gt('gb_jeong', null, getLang()), first: true });
    }
    return hh;
  };
  for (const b of (V.town && V.town.buildings) || []) {
    if (!b.home || b.role === 'station') continue;
    const door = doorOf(b.id);
    if (!door) continue;
    const kind = ROLE_KIND[b.role] || 'house';
    const ps = byHome.get(b.id) || [];
    if (!ps.length) continue;
    out.push({ aid: b.id, kind, name: 'gb_' + b.id, door, households: households(b.id, kind, ps) });
  }
  for (const id of Object.keys(V.lots || {}).sort()) {
    const ps = byHome.get(id);
    if (!ps || !ps.length) continue;                         // a lot is an address once someone lives there
    const door = doorOf(id);
    if (!door) continue;
    const kind = ps.some((c) => c.kind === 'keeper') ? 'shop' : 'house';
    out.push({ aid: id, kind, name: id, door, households: households(id, kind, ps) });
  }
  // the old village (G1b): each finished v3 house is one household, named after a villager (VillageLife)
  const res = (gs.life && gs.life.residents) || [];
  (gs.houses || []).forEach((h, k) => {
    if (!h || h.enabled === false || !h.door || !h.site || !h.site.id) return;
    const r = res.length ? res[k % res.length] : null;
    const name = r && r.name ? String(r.name) : '';
    out.push({ aid: h.site.id, kind: 'village', name: 'gb_village', door: { x: h.door.x, y: h.door.y }, households: [{ hid: h.site.id + ':0', people: [{ pid: 'v' + k, name, kind: 'adult' }], name }] });
  });
  return out;
}

/**
 * The sled's road graph (G1b) in the model's format { nodes: { id: [x, y] }, edges: [[a, b]], stand }: the drawn old
 * village roads of WORLD.roads (open zones / regions only, `via` corners kept), cut into ≤ 150 px steps (an address is in
 * the sled zone when a node is ≤ sled.doorMaxM from its door), plus the 역앞 금방 정류장 joined to the nearest node.
 */
export function villageGraph(gs, lay) {
  const zoneOpen = (z) => !z || !!(gs.zones && gs.zones[z] && gs.zones[z].unlocked);
  const regionOpen = (r) => !r || !gs.territory || gs.territory.isOpen(r);
  return villageGraphOf(WORLD.roads, L(lay.sledStand[0], lay.sledStand[1]), (z, r) => zoneOpen(z) && regionOpen(r));
}

// ====================================================================================================== the dolls
/** a DollSprite that can leave out the anim's own item layers (the module draws its parcel at parcelPoint) */
class GbDoll extends DollSprite {
  refresh() {
    // (a frame this look cannot draw must never throw inside the shared DollPool: idle, facing S, instead)
    try { return this.draw(); } catch (e) { this.anim = 'idle'; this.baseDir = 'S'; this.frame = 0; this.flipX = false; try { return this.draw(); } catch (e2) { this.dirty = false; return undefined; } }
  }
  draw() {
    if (!this.noItems || !TF.gb) return super.refresh();
    const f = TF.layersInto;
    TF.layersInto = function (p, a, d, i, out) { return f.call(this, p, a, d, i, out, NO_ITEMS); };
    try { return super.refresh(); } finally { TF.layersInto = f; }
  }
}
const DIRS = new Set(['S', 'SE', 'E', 'NE', 'N', 'SW', 'W', 'NW']);
const NO_ITEMS = { noItems: true };
/** geumbangfolk's animFallback, for a doll runtime without the merge (G-P7) */
const FALLBACK = { carry_parcel: ['walk'], ring_doorbell: ['talk', 'idle'], hand_parcel: ['talk', 'idle'], scan: ['idle'], sort_parcel: ['idle'], tape_box: ['idle'] };

/** the view's rig over the game's doll runtime (DollPool tiers, residency): the lab_dolls.js Rig contract */
class V4Rig {
  constructor(gs, person) {
    this.gs = gs; this.person = person;
    this.d = new GbDoll(gs, 'tf:' + person.base, person, -9999, -9999);
    this.d.noFade = true;                 // (a courier / crew member never fades in mid-scene when the pool hands it a rig)
    this.req = ''; this.anim = 'idle'; this.dir = 'S'; this.alphaV = 1; this.shown = false;
    this.d.setVisible(false);
  }
  get alpha() { return this.alphaV; }
  play(anim, dir, o) {
    if (!DIRS.has(dir)) dir = this.dir || 'S';
    const ni = !!(o && o.noItems);
    if (this.d.noItems !== ni) { this.d.noItems = ni; this.d.dirty = true; }
    const k = anim + '|' + dir;
    if (k === this.req) return;
    this.req = k; this.want = anim; this.dir = dir; this.pickT = 0.5;
    this.anim = this.resolve(anim);
    const base = { SW: 'SE', W: 'E', NW: 'NE' }[dir];
    this.d.setFlipX(!!base);
    this.d.anims.play({ key: 'tf:' + this.person.base + ':' + this.anim + ':' + (base || dir) });
  }
  /** what plays now: TF.pick (the crew pages load on demand through Residency; scan / sort_parcel / tape_box -> idle
   *  until then), or — before the geumbangfolk merge (G-P7) — the contract's fallbacks on plain townsfolk anims */
  resolve(anim) {
    const T = TF.T;
    if (T && T.anims[anim]) {
      const vis = this.shown && this.gs.isOnScreen(this.d.x, this.d.y, 260);
      const q = TF.pick ? TF.pick(this.person, anim, (g) => { if (vis && TF.ofAtlas && TF.ofAtlas[g]) Residency.want(TF.ofAtlas[g]); }) : null;
      return (q && q.anim) || anim;
    }
    for (const f of FALLBACK[anim] || []) if (T && T.anims[f]) return f;
    return 'idle';
  }
  place(x, y, depth, alpha = 1) { this.d.setPosition(Math.round(x), Math.round(y)).setDepth(depth); this.alphaV = alpha; this.d.setAlpha(alpha); }
  visible(on) { this.shown = !!on; this.d.setVisible(this.shown); }
  /** the DollPool advances the clock and draws (gs.dollPool.update); a fallback looks again for its page */
  update(dt) {
    if (this.want && this.anim !== this.want && (this.pickT -= dt) <= 0) {
      this.pickT = 1;
      const a = this.resolve(this.want);
      if (a !== this.anim) { this.anim = a; const base = { SW: 'SE', W: 'E', NW: 'NE' }[this.dir]; this.d.anims.play({ key: 'tf:' + this.person.base + ':' + a + ':' + (base || this.dir) }); }
    }
  }
  frame() { return this.d.frame || 0; }
  boxPoint() { const G = TF.gb; return G ? G.parcelPoint(this.person, this.anim, this.dir, this.frame()) : null; }
  parcelPoint() { const q = this.boxPoint(); return q ? [q[2], q[3]] : null; }
  handPoint() { const G = TF.gb; return G ? G.handPointOf(this.person, this.anim, this.dir, this.frame()) : null; }
  bellPoint() { const G = TF.gb; return G && this.anim === 'ring_doorbell' ? G.bellPoint(this.person, this.dir, this.frame()) : null; }
  parcelDepth() { const G = TF.gb; return G ? G.parcelDepth(this.anim, this.dir) : null; }
  layers() { const r = this.d.rig; return this.shown && r ? r.n || 1 : 0; }
  destroy() { this.d.destroy(); }
}

function dollsPort(gs, sys) {
  /** a seeded look: a generator preset (the crew's gb_* presets after G-P7), or an age ('elder' / 'child' / 'adult':
   *  rerolled like TownSim does until the base has that age) */
  const person = (preset, seed, age) => {
    if (!TF.ok) return null;
    const rng = mulberry32(seed >>> 0 || 7);
    const P = TF.T && TF.T.generator && TF.T.generator.presets;
    try {
      let p = TF.person(rng, preset && P && P[preset] ? preset : null);
      for (let k = 0; age && k < 12 && TF.age(p.base) !== age; k++) p = TF.person(rng, null);
      return p;
    } catch (e) { return null; }
  };
  return {
    make(look) {
      const p = look && look.base && look.parts ? look : person(look && look.preset, (look && look.seed) || 7, 'adult');
      return p ? new V4Rig(gs, p) : null;
    },
    /** the household member who opens the door: the citizen's own look (TownSim), else a seeded one by age */
    resident(aid, hid) {
      const T = gs.v4 && gs.v4.town, e = sys.entry(aid);
      const hh = e ? (e.households.find((h) => h.hid === hid) || e.households[0]) : null;
      const who = hh && hh.people ? hh.people[0] : null;
      const c = who && Number.isFinite(who.cid) && T ? T.get(who.cid) : null;
      if (c && c.person) return new V4Rig(gs, c.person);
      const kind = who && who.kind;
      const p = person(null, hashStr(String(hid || aid)), kind === 'elder' ? 'elder' : kind === 'child' ? 'child' : 'adult');
      return p ? new V4Rig(gs, p) : null;
    },
    hub() { return (TF.T && TF.T.hub) || {}; },
  };
}

// ====================================================================================================== helpers
/** the cargo sleigh as three ground points (centre and ±1.1 m along its heading) for the vans' yield test (M4) */
function sleighPoints(sl) {
  if (!sl || !Number.isFinite(sl.x) || sl.state === 'wait' || sl.state === 'load') return [];
  const p = sl.at ? sl.at(sl.s) : null;
  if (!p) return [{ x: sl.x, y: sl.y }];
  const di = p.di || 0, dj = p.dj || 0, k = 0.78;          // 1.1 m = 0.78 cells
  const dx = 64 * (di + dj) * k, dy = 32 * (di - dj) * k;
  return [{ x: sl.x, y: sl.y, sleigh: true }, { x: sl.x + dx, y: sl.y + dy, sleigh: true }, { x: sl.x - dx, y: sl.y - dy, sleigh: true }];
}

/** n items off a v3.5 collection pile; on screen they hop towards `to` (the sled's basket) and are released there */
function takeFromPile(gs, p, n, to) {
  if (!p || !p.stack || !(n > 0)) return 0;
  const fx = gs.effects, show = !!(to && gs.isOnScreen && gs.isOnScreen(p.x, p.y, 200));
  let got = 0;
  for (let k = 0; k < Math.floor(n); k++) {
    const it = p.stack.pop(p.item);
    if (!it) break;
    got++;
    const spr = it.spr;
    if (!spr) continue;
    if (show && k < 8 && gs.tweens) {
      spr.setVisible(true).setDepth(Math.max(p.y, to.y) + 1);
      gs.tweens.add({ targets: spr, x: to.x + (k % 3) * 8 - 8, y: to.y - 6 - Math.floor(k / 3) * 6, duration: 420 + k * 70, delay: k * 70, ease: 'Quad.easeInOut', onComplete: () => { if (fx && fx.releaseItem) fx.releaseItem(spr); } });
    } else if (fx && fx.releaseItem) fx.releaseItem(spr);
  }
  return got;
}

// ====================================================================================================== the ports
export function makeV4Ports(gs, sys) {
  const V = () => gs.v42 || {};
  const D = () => V().depot || null;
  const S = () => { const d = D(); return d && d.model ? d.model.stock : null; };
  const nb = () => gs.v4 || null;
  const clock = () => { const c = nb() && nb().clock; return c && c.on ? c : null; };
  const lay = sys.lay;
  // the cargo sleigh holds ave_s · bank_st · the apron (one lane with the van spur, G-P2b): from j −18 on 중앙로 to bay 2
  const sleighJoin = () => {
    if (sys._sj !== undefined) return sys._sj;
    const pts = (WORLD.v42 && WORLD.v42.sleighRoute) || [];
    let s = 0, at = null;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (at === null && a[0] === b[0] && Math.min(a[1], b[1]) <= -18 && Math.max(a[1], b[1]) >= -18) at = s + Math.abs(-18 - a[1]);
      s += len;
    }
    sys._sj = at === null ? s * 0.75 : at;
    return sys._sj;
  };
  const sleighHold = () => sleighJoin() - 3.2;
  const ports = {
    clock: {
      T: () => { const c = clock(); return c ? c.T : sys.t; },
      hour: () => { const c = clock(); return c ? c.hour() : 12; },
      day: () => { const c = clock(); return c ? c.day() : 0; },
      dark: () => { const c = clock(); return c && c.cur ? Number(c.cur.a) || 0 : 0; },
    },
    lang: () => getLang(),
    roads: { net: () => (nb() ? nb().roadNet : null), village: () => villageGraph(gs, lay), avoid: () => (sys.p2c ? null : ((WORLD.v42 && WORLD.v42.sleighRoute) || []).map(([i, j]) => L(i, j))) },
    town: {
      homes: () => { sys.entries = townEntries(gs); sys.entryById = null; return sys.entries; },
      /** someone of that household is at home now (TownSim state; the analytic LOD keeps `place` current) */
      home: (aid, hid) => sys.homeNow(aid, hid),
      /** a household member came home and passes the box on the step */
      passer: (aid, box) => !!box && box.age > HOUR * 0.5 && sys.homeNow(aid, null),
      /** who a van yields to near (x, y): the chief, TownSim bodies, (L8) porters / workers / customers (gs.agents),
       *  visitors, the dog, and (critique M4) the cargo sleigh — its body as three points along its heading */
      walkers: (x, y, r) => {
        const out = [], T = nb() && nb().town, p = gs.player;
        const near = (q) => q && Math.abs(q.x - x) < r && Math.abs(q.y - y) < r;
        if (near(p)) out.push(p);
        if (T) for (const b of T.bodies) if (b && b.c && b.sprite && b.sprite.visible && near(b)) out.push(b);
        for (const a of gs.agents || []) if (a && a.alive !== false && a.visible !== false && near(a)) out.push(a);
        const vis = nb() && nb().visitors;
        if (vis) for (const v of vis) if (v && v.alive !== false && near(v)) out.push(v);
        const dog = gs.dog && gs.dog.r;            // 콩이 (DogPlay.r: the VillageLife pet_dog)
        if (dog && near(dog)) out.push(dog);
        const d = D();
        if (d && d.sleighs) for (const sl of d.sleighs) for (const q of sleighPoints(sl)) if (near(q)) out.push(q);
        return out.length ? out : null;
      },
    },
    depot: {
      count: (k) => { const s = S(); return s ? s.count(k) : 0; },
      /** the hub's pickers take from the racks (what is there): { item: n } -> { item: n } */
      pick: (items) => { const s = S(), got = {}; if (!s) return got; for (const k in items || {}) { const q = s.take(k, items[k]); if (q > 0) got[k] = q; } return got; },
      /** a parcel that comes back (address gone, skipped twice): what does not fit is refused */
      restock: (items) => {
        const d = D(), s = S(), refused = {};
        for (const k in items || {}) {
          const n = Math.max(0, Math.floor(items[k]) || 0);
          const fit = d && d.model ? Math.min(n, d.model.room(k)) : 0;
          if (fit > 0) s.add(k, fit);
          if (n - fit > 0) refused[k] = n - fit;
        }
        return refused;
      },
      level: (c) => { const s = S(); return s ? s.level(c) : 0; },
      fill: () => { const d = D(); return d && d.built ? d.total() / Math.max(1, d.capTotal()) : 0; },
      /** the sleigh is on (or about to enter) the stretch it shares with the van spur: from holdS() on (M4: a held
       *  sleigh waits ≥ 4.5 m back from a van entering the jog, so the stretch starts there) */
      sleighBusy: () => { const d = D(); if (!d) return false; const h = sleighHold() + 0.1; return d.sleighs.some((s) => (s.state === 'go' && s.s >= h) || s.state === 'unload' || (s.state === 'back' && s.s > h)); },
      /** (M8) where a sleigh holds while a van has the spur (G-P2b reads it): 3.2 cells before the join */
      holdS: () => sleighHold(),
      surplus: (items) => { const F = V().freight; if (F) for (const k in items || {}) F.addSurplus(k, items[k]); },
      dockSurplus: () => { const F = V().freight; return F ? F.dockCount() : 0; },
      takeSurplus: (n) => {
        const F = V().freight, d = D();
        if (!F || !d || !d.model) return null;
        const got = F.takeSurplus(n, (ty) => d.model.room(ty));
        const o = {};
        for (const q of got) o[q.ty] = (o[q.ty] || 0) + q.n;
        return sum(o) ? o : null;
      },
      /** (H2) n of one item off the station dock's surplus (정 할머니's opening stock) */
      dockTake: (item, n) => {
        const F = V().freight;
        if (!F || !(n > 0)) return 0;
        let got = 0;
        for (const q of F.takeSurplus(n, (ty) => (ty === item ? n : 0)) || []) got += q.n;
        return got;
      },
      /** (C1, 금방 집하) the village collection piles the sleds may load from */
      piles: () => {
        const out = [];
        for (const id in gs.piles || {}) {
          const p = gs.piles[id];
          if (!p || !p.shown || !p.enabled || !p.stack) continue;
          out.push({ id, item: p.item, x: p.x, y: p.y, n: p.stack.count, max: p.stack.max });
        }
        return out;
      },
      /** n crates off a pile (they hop towards the sled when the pile is on screen) -> how many */
      takePile: (id, n, to) => takeFromPile(gs, gs.piles && gs.piles[id], n, to),
      pileTake: (item, n) => { for (const id in gs.piles || {}) { const p = gs.piles[id]; if (p && p.item === item && p.stack && p.stack.count > 0) return takeFromPile(gs, p, n, null); } return 0; },
      /** room at the 짐 싣는 곳 for 금방 집하 crates of an item (the train's + the depot's room, ≤ collect.dockMax waiting) */
      dockRoom: (item) => {
        const F = V().freight;
        if (!F) return 0;
        const C = sys.tune.collect || {};
        return Math.max(0, Math.min(F.surplusRoom(item), (Number(C.dockMax) || 60) - F.dockCount()));
      },
      dockDrop: (items) => { const F = V().freight; if (F) for (const k in items || {}) if (items[k] > 0) F.addSurplus(k, items[k]); },
      building: () => { const d = D(); return d && d.building && d.building.ready ? d.building : null; },
      reveal: (on) => { const d = D(); if (d) d.camReveal = !!on; },
      stock: () => S(),
      /** the 3 v4.2 depot workers step aside for the 금방 crew (DepotBuilding reads gbStaffOff: G-P3) */
      staff: (on) => { const d = D(); if (d && d.building) d.building.gbStaffOff = !on; },
    },
    coins: {
      /** order money: into the 물류 금고 (딸랑이's round or the 15 s flush takes it on). (critique M6) the 통장's
       *  income bars: its own '금방' bar once G-P16 is in (the inc_gb string tells), else inside 물류창고 */
      till: (n) => {
        const d = D(), b = d && d.building;
        n = Math.max(0, Math.floor(n) || 0);
        if (!n) return;
        if (b && b.till) b.till.value += n; else if (gs.economy) gs.economy.add(n);
        const O = V().office;
        const key = t('inc_gb') !== 'inc_gb' ? 'gb' : 'depot';
        if (O && O.income) O.income[key] = (O.income[key] || 0) + n;
      },
      /** an upgrade: coins + items. (critique L2) the items come from the depot racks, then the station dock's
       *  surplus (ingots rarely sit on the racks in v4.2), and what is still missing is paid in coins at
       *  2 × the item's price — never more than there is, all or nothing */
      spend: (cost) => {
        const c = typeof cost === 'number' ? { coins: cost } : cost || {}, E = gs.economy, s = S(), F = V().freight;
        let coins = Math.max(0, Math.floor(Number(c.coins) || 0));
        if (!E) return false;
        const plan = [];
        for (const k in c) {
          if (k === 'coins') continue;
          const need = Math.max(0, Math.floor(Number(c[k]) || 0));
          const rack = s ? Math.min(need, s.count(k)) : 0;
          const dock = F && F.dock ? Math.min(need - rack, Math.max(0, F.dock[k] || 0)) : 0;
          const short = need - rack - dock;
          coins += short * 2 * (priceOf(k) || 10);
          plan.push([k, rack, dock]);
        }
        if (E.coins < coins) return false;
        if (coins) E.spend(coins);
        for (const [k, rack, dock] of plan) {
          if (rack && s) s.take(k, rack);
          if (dock && F) F.takeSurplus(dock, (ty) => (ty === k ? dock : 0));
        }
        return true;
      },
      /** what spend(cost) would charge in coins now (the app's button shows it when items are short) */
      price: (cost) => {
        const c = typeof cost === 'number' ? { coins: cost } : cost || {}, s = S(), F = V().freight;
        let coins = Math.max(0, Math.floor(Number(c.coins) || 0));
        for (const k in c) {
          if (k === 'coins') continue;
          const need = Math.max(0, Math.floor(Number(c[k]) || 0));
          const have = (s ? s.count(k) : 0) + (F && F.dock ? Math.max(0, F.dock[k] || 0) : 0);
          coins += Math.max(0, need - have) * 2 * (priceOf(k) || 10);
        }
        return coins;
      },
    },
    growth: { happy: (f) => { const G = nb() && nb().growth; if (G && G.addSatisfaction) G.addSatisfaction(f); } },
    ledger: {
      /** the shop shelves of an item: [{ level, status }] (the v4.2 재고 statuses for the goods lines) */
      shelf: (item) => {
        const Lg = V().ledger;
        if (!Lg) return null;
        const line = LINES.find((q) => q.product === item);
        const status = line ? Lg.status(line.id) : 'ok';
        const out = [];
        for (const o of Lg.list) if (o.kind === 'shelf' && o.item === item) out.push({ level: o.cap > 0 ? Math.min(1, (o.count || 0) / o.cap) : 1, status });
        return out.length ? out : null;
      },
    },
    price: (k) => priceOf(k) || 1,
    weather: { snow: () => false },                       // (v4.2 has no weather; the ambient snowfall is constant)
    settings: {
      alerts: () => (Settings.data.gbAlerts === 'quiet' || Settings.data.gbAlerts === 'off' ? Settings.data.gbAlerts : 'on'),
      scenes: () => (Settings.data.gbScenes === false ? 'off' : 'on'),
      // (critique L6) the app's 기사님 tab sets them too (Settings keeps them once G-P13 is in; before that they last
      //  until the page reloads)
      setAlerts: (v) => { Settings.data.gbAlerts = v === 'quiet' || v === 'off' ? v : 'on'; try { Settings.save(); } catch (e) { /* storage off */ } },
      setScenes: (on) => { Settings.data.gbScenes = !!on; try { Settings.save(); } catch (e) { /* storage off */ } },
    },
    world: { scene: gs },
    ui: {
      get scene() { const u = gs.ui; return u && u.s ? u.s : null; },
      toast: (m) => { if (gs.ui) gs.ui.toast(m); },
      banner: (m, s) => { if (gs.ui) gs.ui.banner(m, s); },
      busy: () => { const u = gs.ui, R = nb() && nb().rank; return !!(u && (u.panelOpen || u.buildOpen || u.v4PanelOpen || u.v42PanelOpen)) || !!(R && R.ceremonyOn); },
      toasted: () => {},
      hidePill: () => {},
      // the game's big banner (금방 개업 …) is up: the 따라가기 caption waits under it (same band of the screen)
      bannerOn: () => { const u = gs.ui, s = u && (u.s || u); return !!(s && s.bannerBox && s.bannerBox.visible); },
    },
    view: {
      onScreen: (x, y, m) => gs.isOnScreen(x, y, m),
      /** 따라가기: the game's own camera focus (CameraDirector uses the same), the zoom put back on release */
      lookAt: (x, y, z) => {
        if (sys.zoom0 === null || sys.zoom0 === undefined) sys.zoom0 = gs.zoomTarget;
        gs.focusCamera(x, y, 500);
        // near the camera bound (the 솔방울 아파트 stand by the world's bottom edge) the view cannot centre the door:
        // closer in, so the doorstep is not left under the HUD's bottom row
        const cam = gs.cameras.main, r = gs.territory && gs.territory.camRect, k = View.k || 1;
        let want = z || 0;
        if (r && cam) {
          const ry = Math.min(r.y + r.h - y, y - r.y), rx = Math.min(r.x + r.w - x, x - r.x);
          if (ry > 0) want = Math.max(want, cam.height / (2 * k * Math.max(60, ry - 40)));
          if (rx > 0) want = Math.max(want, cam.width / (2 * k * Math.max(60, rx - 40)));
        }
        const zmax = Math.min(1.5, (BALANCE.camera && BALANCE.camera.zoomMax) || 1.7);   // (closer, but the street stays in view)
        want = Math.min(zmax, want);
        if (want && gs.zoomTarget !== undefined && gs.zoomTarget < want) gs.zoomTarget = want;
      },
      release: () => { gs.camFocus = null; if (sys.zoom0 !== null && sys.zoom0 !== undefined) gs.zoomTarget = sys.zoom0; sys.zoom0 = null; },
      /** where the chief stands (the door line "촌장님 덕분에…" when he is near) */
      chief: () => (gs.player ? { x: gs.player.x, y: gs.player.y } : null),
    },
    dolls: dollsPort(gs, sys),
    fx: {
      sheet: (k, x, y, o) => gs.effects.sheet(k, x, y, o),
      burst: (n, x, y, q) => gs.effects.burst(n, x, y, q),
      floatText: (x, y, t, c, s) => gs.effects.floatText(x, y, t, c, s),
    },
    sound: {
      at: (k) => { if (Audio.exists(k)) Audio.play(k); },
      play: (k) => { if (Audio.exists(k)) Audio.play(k); },
    },
    /** 정 할머니's letter (G-P11 adds the template to VillageNews; until then the host shows a banner) */
    letters: {
      offer: (id) => { const N = V().news; if (N && N.offerLetter) return N.offerLetter(id); if (gs.ui) gs.ui.banner(gt('gb_open_ready', null, getLang()), gt('gb_letter_from', null, getLang())); return false; },
    },
    /** the module's events to the game (missions / story / news / 관망 listen on gs.events 'gb') */
    emit: (e) => { if (gs.events) gs.events.emit('gb', e); },
  };
  return ports;
}

// ====================================================================================================== the system
export class GeumbangSystem {
  constructor(gs, v42, savedV42, sv) {
    this.gs = gs; this.v42 = v42;
    this.saved = sv && sv.geumbang && typeof sv.geumbang === 'object' ? sv.geumbang : null;
    this.lay = gbLayout(WORLD);
    this.tune = gbTuning(BALANCE);
    this.host = null; this.ports = null; this.pad = null;
    this.t = 0; this.artT = 0; this.homeT = 0; this.homes = new Map();
    this.entries = []; this.entryById = null;
    this.zoom0 = null;
    gs.v43 = gs.v43 || {};
    gs.v43.gb = null;
  }

  /** D2: the v4.2 depot stands (its cutaway built), the town and its streets exist */
  gateOpen() {
    const d = this.v42.depot, nb = this.gs.v4;
    return !!(d && d.built && d.building && d.building.ready && nb && nb.roadNet && nb.town);
  }

  entry(aid) {
    if (!this.entryById) { this.entryById = new Map(); for (const e of this.entries) this.entryById.set(e.aid, e); }
    return this.entryById.get(aid) || null;
  }

  /** who is home (rebuilt once a second): address -> Set of household ids with someone in */
  homeNow(aid, hid) {
    if (hid === 't_apt2:jeong') return true;   // 정 할머니 is always in
    const set = this.homes.get(aid);
    if (!set) return true;                   // a village house / unknown: someone answers
    return hid ? set.has(hid) : set.size > 0;
  }
  /** (critique H1) TownSim keeps where a citizen is in `placeObj` ('t_apt2:in'), never in `place`: townRead.js */
  refreshHomes() {
    const T = this.gs.v4 && this.gs.v4.town;
    this.homes = T ? homeSets(this.entries, (cid) => T.get(cid)) : new Map();
  }

  /** (critique H3) who lives where changed (a district home founded, newcomers, a village house finished): the
   *  AddressBook rebuilds (≤ once per 2 s, host.touch) */
  townSig() {
    const T = this.gs.v4 && this.gs.v4.town, V = WORLD.v4 || {};
    let lots = 0;
    for (const id in V.lots || {}) lots++;
    const houses = (this.gs.houses || []).filter((h) => h && h.enabled !== false && h.door && h.site).length;
    return townSignature(T ? T.citizens : [], lots + ':' + houses + ':' + ((this.gs.zones && Object.values(this.gs.zones).filter((z) => z && z.unlocked).length) || 0));
  }

  start() {
    const gs = this.gs;
    this.ports = makeV4Ports(gs, this);
    this.host = new GeumbangHost(this.ports, this.saved, { tuning: this.tune, layout: this.lay, seed: 20261017 });
    gs.v43.gb = this.host.api;
    // the cargo sleigh holds before ave_s while a van holds the spur (CargoSleigh reads it: G-P2b)
    const d = this.v42.depot;
    if (d) {
      d.gbSpurBusy = () => !!(this.host && this.host.model.spurBusy());
      // (critique M8) the sleigh's hold point comes from the same rule the vans use (G-P2b reads it)
      d.gbHoldS = () => this.ports.depot.holdS();
      // (critique M4, G-P2c) a 금방 van stopped or driving ahead of the sleigh in its lane: the sleigh waits behind it
      d.gbVanAhead = (sl) => {
        // (G-P2c is in: the sleigh waits behind a van in its lane, so the curbs need not keep off its lane — the
        //  AddressBook rebuilds without the module-only rule, which cost the vans 25–45 % in delivery time)
        if (!this.p2c) { this.p2c = true; if (this.host) { this.host.model.avoid = null; this.host.touch(); } }
        return this.vanAhead(sl);
      };
      // (critique M4, G-P2c) keep right: the sleigh is drawn in the right-hand lane of the street it drives on
      d.gbLaneOffset = (sl, p, dt) => this.laneOffset(sl, p, dt);
    }
    // (critique H3) a finished building / house: the AddressBook rebuilds
    this.onBuilt = () => { if (this.host) this.host.touch(); };
    if (gs.events) gs.events.on('built', this.onBuilt);
    this.sigT = 2; this.sig = this.townSig();
    // the late art (plan §10.4): the core page + the resident ui6 icons + the sounds now, the van page with the first van
    Assets.loadFragment(gs, 'geumbang', { only: FRAGMENTS.geumbang.core.concat(FRAGMENTS.geumbang.van) });
    Assets.loadFragment(gs, 'ui6', { only: FRAGMENTS.ui6.resident });
    // the crew's anims (G-P7): the manifest merged into the doll runtime; its two pages then load on demand through
    // TF.pick -> Residency.want (TF.ofAtlas 'road' / 'hub'). Without G-P7 nothing is fetched: plain townsfolk looks.
    if (TF.mergeGeumbangfolk) Assets.loadFragment(gs, 'geumbangfolk', {}, () => { if (Assets.lateManifest && Assets.lateManifest.geumbangfolk) TF.mergeGeumbangfolk(Assets.lateManifest.geumbangfolk); });
    Assets.loadFragment(gs, 'audio8', { audio: ['sfx_gb_doorbell', 'sfx_gb_doorbell_2', 'sfx_gb_horn', 'sfx_gb_chime', 'sfx_gb_thump', 'sfx_gb_thump_2', 'sfx_gb_jingle', 'sfx_gb_tape', 'sfx_gb_tape_2', 'sfx_gb_scan', 'sfx_gb_locker'] });
    Assets.loadFragment(gs, 'vehicles', { only: ['veh_dog_sled'] });
    this.paintGround();
  }

  /** the bay-1 apron and the S-jog in the street dirt (a ground bake hook, like RoadPaint.addV42Streets; G-P9 moves
   *  these two rects into WORLD.v43.gb.paint + addV42Streets and this goes) */
  paintGround() {
    const gs = this.gs, P = gs.v4 && gs.v4.paint, G = gs.ground, rects = this.lay.paint || [];
    if (!P || !P.pattern || !G || !G.addBakeHook || !rects.length || this.paintHook || P.gbPainted) return;   // (G-P9 in: RoadPaint paints them)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const quad = (r) => [L(r.i[0], r.j[0]), L(r.i[1], r.j[0]), L(r.i[1], r.j[1]), L(r.i[0], r.j[1])];
    for (const r of rects) for (const q of quad(r)) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const rect = { x: x0 - 40, y: y0 - 40, w: x1 - x0 + 80, h: y1 - y0 + 80 };
    this.paintHook = G.addBakeHook((ctx) => {
      const pat = P.pattern(ctx, 'road_dirt');
      for (const r of rects) {
        const c = quad(r);
        ctx.save(); ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (const q of c) ctx.lineTo(q.x, q.y); ctx.closePath();
        ctx.fillStyle = pat || '#b9a68c'; ctx.globalAlpha = pat ? 1 : 0.7; ctx.fill(); ctx.restore();
      }
    }, rect);
    G.invalidate(rect);
  }

  /** the view once its pages are in (or after 20 s with the code stand-ins) and the UI scene is up */
  maybeView(dt) {
    const h = this.host;
    if (!h || h.view || !this.ports.ui.scene) return;
    this.artT += dt;
    const art = Assets.has && Assets.has('gb_sign') && Assets.texOf && Assets.texOf(Assets.def('gb_sign').atlas, Assets.def('gb_sign').frame);
    if (art || this.artT > 20) {
      if (this.artT > 20 && !art) console.warn('[gb] the 금방 pages are late: code stand-ins');
      h.attachView(GbView);
    }
  }

  /** (M4, G-P2c) a 금방 van in the sleigh's lane within 2.6 m ahead of it (not one waiting for the sleigh) */
  vanAhead(sl) {
    const m = this.host && this.host.model;
    if (!m || !m.disp || !sl || !sl.at) return false;
    const p = sl.at(sl.s), back = sl.state === 'back';
    const di = (p.di || 0) * (back ? -1 : 1), dj = (p.dj || 0) * (back ? -1 : 1);
    // ground direction of travel (metres frame: x = (dx), y = 2·dy over 64 px)
    const hx = 64 * (di + dj), hy = 64 * (di - dj), hl = Math.hypot(hx, hy) || 1, ux = hx / hl, uy = hy / hl;
    for (const v of m.disp.vans) {
      // (a van waiting at the apron gate waits FOR the sleigh: never hold behind it — no deadlock)
      if (v.st === 'bay' || v.st === 'load' || v.st === 'break' || (v.st === 'wait' && v.waitFor === 'apron') || v.st === 'pivot' || v.st === 'reverse') continue;
      const dx = (v.x - sl.x) / 64, dy = ((v.y - sl.y) * 2) / 64;
      const a = dx * ux + dy * uy, lat = Math.abs(-dx * uy + dy * ux);
      if (a > 0.3 && a < 5.5 && lat < 1.1) return true;
    }
    return false;
  }

  /**
   * (M4, G-P2c) keep right: the cargo sleigh's route (WORLD.v42.sleighRoute) runs on 역앞 거리's centre line (j −5)
   * and on 중앙로's −j lane (i 31) both ways — so it met the vans head-on in their lane. Moving on a RoadNet drive
   * edge, it is drawn in that edge's right-hand lane (RoadNet.laneLattice's rule: +i at J − off, −i at J + off, +j at
   * I + off, −j at I − off); off the streets (the depot apron, the spur) it keeps its route. Eased (≈ 0.4 s) so it
   * changes lanes instead of jumping. Returns the lattice offset { i, j } (cells) to add to the route point.
   */
  laneOffset(sl, p, dt) {
    const o = sl.gbOff || (sl.gbOff = { i: 0, j: 0 });
    const back = sl.state === 'back', moving = sl.state === 'go' || back;
    const rn = this.gs.v4 && this.gs.v4.roadNet;
    const tg = moving && rn ? keepRight(rn.driveEdges, p, back) : { i: 0, j: 0 }, ti = tg.i, tj = tg.j;
    const k = Math.min(1, (Number.isFinite(dt) && dt > 0 ? dt : 1 / 60) * 3);
    o.i += (ti - o.i) * k; o.j += (tj - o.j) * k;
    if (Math.abs(o.i) < 0.005) o.i = 0;
    if (Math.abs(o.j) < 0.005) o.j = 0;
    return o;
  }

  /** the 금방 개업 pad by the depot door once the letter came: 4,000 coins + 판자 20 · 주괴 10 brought by the porters or
   *  the chief (UnlockPad items, the v4 site flow; critique L1). Partly paid coins and items are kept in the slice (H4). */
  updatePad(dt) {
    const gs = this.gs, m = this.host.model;
    const due = m.st === 0 && m.letterDue();
    if (due && !this.pad) {
      const p = L(this.lay.openPad[0], this.lay.openPad[1]), O = this.tune.open || {};
      const saved = m.pad || { paid: this.padPaid || 0, got: this.padGot || {} };
      const items = {};
      for (const k of ['item_plank', 'item_ingot']) if (O[k] > 0) items[k] = O[k];
      this.pad = new UnlockPad(gs, 'gb_open', p.x, p.y, {
        kind: 'unlock', cost: O.coins || 4000, paid: saved.paid || 0, items: Object.keys(items).length ? items : null, got: saved.got || {},
        labelFn: () => gt('gb_open_pad', null, getLang()), icon: Assets.pick('ui_icon_gb', 'ui_icon_box', 'ui_icon_delivery'), iconSize: 48,
        onComplete: (pad) => {
          pad.vanish();
          this.pad = null; this.padPaid = 0; this.padGot = null; m.pad = null;
          this.host.api.open({});
        },
      });
      if (gs.player && this.pad.pad && this.pad.pad.contains(gs.player.x, gs.player.y)) this.pad.needsLeave = true;
      if (gs.popIn) gs.popIn(this.pad);
    }
    if (this.pad) {
      if (!due) { this.padPaid = this.pad.paid; this.padGot = Object.assign({}, this.pad.got); this.pad.vanish(); this.pad = null; }
      else { this.pad.update(dt); if (this.pad) m.pad = { paid: this.pad.paid, got: Object.assign({}, this.pad.got) }; }
    }
  }

  update(dt) {
    this.t += dt;
    if (!this.host) { if (!this.gateOpen()) return; this.start(); }
    this.homeT -= dt;
    if (this.homeT <= 0) { this.homeT = 1; this.refreshHomes(); }
    this.sigT -= dt;
    if (this.sigT <= 0) { this.sigT = 2; const sg = this.townSig(); if (sg !== this.sig) { this.sig = sg; this.host.touch(); } }
    this.maybeView(dt);
    this.updatePad(dt);
    this.host.update(dt);
  }

  /** the module slice (plan §9): the saved one is carried through untouched until the gate opens */
  slices() {
    if (this.host) return { geumbang: this.host.serialize() };
    return this.saved ? { geumbang: this.saved } : {};
  }
  state() { return this.host ? Object.assign({ on: true, ms: +(this.host.ms || 0).toFixed(3), msModel: +(this.host.msModel || 0).toFixed(3), view: !!this.host.view }, this.host.state()) : { on: false, gate: this.gateOpen() }; }
  settingsChanged() { /* the ports read Settings.data each time */ }
  hooks(H) {
    H.gb = (o) => {
      if (!this.host && this.gateOpen()) this.start();
      const h = this.host;
      if (!h) return { on: false };
      if (o && o.open) h.api.open(o.open === true ? {} : o.open);
      if (o && o.follow) h.api.follow(o.follow);
      if (o && o.app && h.view && h.view.openApp) h.view.openApp(o.app);
      return this.state();
    };
  }
  destroy() { if (this.onBuilt && this.gs.events) this.gs.events.off('built', this.onBuilt); this.onBuilt = null; if (this.pad) this.pad.destroy(); if (this.paintHook && this.gs.ground && this.gs.ground.removeBakeHook) this.gs.ground.removeBakeHook(this.paintHook); this.paintHook = null; if (this.host) this.host.destroy(); this.host = null; if (this.gs.v43) this.gs.v43.gb = null; }
}
