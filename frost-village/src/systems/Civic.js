// Civic (v4-C, docs/기획서_v4_추가요청.md): what the village builds on its plots besides the v3 workshops —
// the 마을회관 (town hall), the 큰 식당 (big restaurant), houses that can always be built, decor that makes the
// village happier — and the settlers (이주민) who move into empty houses from the neighbour town and the road.
//
//   - the build menu's cards for a plot (`choices`): every card says what it does or what unlocks it
//   - houses are always buildable; only when `civic.settlers.maxVacant` beds already stand empty does a house wait
//     (the settlers fill them: one household every `settlers.every` s once the village is complete)
//   - big plots: houses and decor may use one as long as enough big plots stay free for the four big workshops
//     (counted over the land that opens before the general store: start, west, east, south)
//   - happiness: the decor and the hall add to the neighbours' happiness (v4 rank bar), halving for repeats, capped
//   - late art (the town hall, the restaurant, the park / street props, flower stands) is fetched when needed
// Numbers: balance.js `buildings` + `civic`; places: world.js `plots`; texts: strings.js.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { TF } from '../core/Townfolk.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { buildCost } from '../entities/Site.js';
import { Character } from '../entities/Character.js';
import { BUILD_UNLOCK } from './Progression.js';

// where a late picture lives: [fragment, atlas or 'atlas@page'] (the manifest arrives with the fragment)
export const ART_SRC = {
  town_hall: ['town', 'town_civic@hall'], restaurant: ['town', 'town_shops@b'],
  park_fountain: ['town', 'town_park'], playground: ['town', 'town_park'],
  bench_x: ['town', 'town_street'], bench_y: ['town', 'town_street'], streetlight: ['town', 'town_street'],
  flower_stand: ['life2', 'life2_wedding'],
};

/**
 * the build menu: cat = the tab, sizes = which plots offer it (S, M, L, X = XL), unique = one in the village,
 * thumb = the picture on the card (a late picture shows a hammer until it has arrived), art = late pictures it needs
 */
export const CATALOG = {
  toolsmith: { cat: 'work', sizes: 'ML', unique: true, thumb: 'station_toolsmith' },
  warehouse: { cat: 'work', sizes: 'ML', unique: true, thumb: 'warehouse' },
  cannery: { cat: 'work', sizes: 'ML', unique: true, thumb: 'station_cannery' },
  store: { cat: 'work', sizes: 'ML', unique: true, thumb: 'shop_general' },
  boathouse: { cat: 'work', sizes: '', unique: true, thumb: 'boathouse' },
  station: { cat: 'work', sizes: '', unique: true, thumb: 'train_station' },
  house_c: { cat: 'home', sizes: 'SML', thumb: 'house_c' },
  house_a: { cat: 'home', sizes: 'SML', thumb: 'house_a' },
  house_b: { cat: 'home', sizes: 'SML', thumb: 'house_b' },
  town_hall: { cat: 'civic', sizes: 'X', unique: true, thumb: 'town_hall', art: ['town_hall', 'notice_board'], waitIcon: 'notice_board' },
  // ((v4 review) waitIcon: the card's picture while the town art is on its way — a dish, not the hammer)
  big_restaurant: { cat: 'civic', sizes: 'X', unique: true, thumb: 'restaurant', art: ['restaurant'], waitIcon: 'item_fish_cooked' },
  deco_snowman: { cat: 'decor', sizes: 'S', thumb: 'snowman_3' },
  deco_bench: { cat: 'decor', sizes: 'S', thumb: 'bench' },
  deco_lamp: { cat: 'decor', sizes: 'S', thumb: 'lamp_post' },
  deco_flowers: { cat: 'decor', sizes: 'S', thumb: 'flower_stand', art: ['flower_stand'] },
  deco_rink: { cat: 'decor', sizes: 'ML', thumb: 'ice_rink' },
  deco_playground: { cat: 'decor', sizes: 'ML', thumb: 'playground', art: ['playground'] },
  deco_fountain: { cat: 'decor', sizes: 'ML', thumb: 'park_fountain', art: ['park_fountain'] },
};
/** the cards of each plot size, in this order (tabs: work, home, decor, civic) */
export const MENU = {
  S: ['house_c', 'house_a', 'house_b', 'deco_snowman', 'deco_bench', 'deco_lamp', 'deco_flowers'],
  M: ['toolsmith', 'warehouse', 'cannery', 'store', 'house_c', 'house_a', 'house_b', 'deco_rink', 'deco_playground', 'deco_fountain'],
  L: ['toolsmith', 'warehouse', 'cannery', 'store', 'house_c', 'house_a', 'house_b', 'deco_rink', 'deco_playground', 'deco_fountain'],
  XL: ['town_hall', 'big_restaurant'],
};
export const TABS = ['work', 'home', 'decor', 'civic'];
export const BIG_UNIQUES = ['toolsmith', 'warehouse', 'cannery', 'store'];
// the land that opens before the general store is needed (tower_se waits for the store: its plots do not count)
const PRE_STORE = new Set(['start', 'west', 'east', 'south']);
export const isDecor = (k) => /^deco_/.test(k);
export const isHouse = (k) => /^house_/.test(k);

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export class Civic {
  constructor(gs, saved) {
    this.gs = gs;
    const s = saved && typeof saved === 'object' ? saved : {};
    this.settlers = Math.max(0, Math.floor(num(s.settlers, 0)));     // people who moved into empty beds
    this.settleT = num(s.settleT, 0);
    this.saved = s;
    this.amenities = [];
    this.hall = null;
    this.restaurant = null;
    this.walkers = [];
    this.artWanted = new Set();
    this.artAsked = new Set();
    this.t = 0;
  }

  get C() { return BALANCE.civic || {}; }

  // ================================================================ late art
  /** is every late picture of `keys` here (manifest merged and file loaded)? */
  artReady(keys) {
    for (const k of keys || []) {
      if (!ART_SRC[k]) continue;
      if (!Assets.m.sprites[k] || Assets.pending(k) || !Assets.has(k)) return false;
    }
    return true;
  }
  /** fetch the late pictures of `keys` (their fragment's manifest first); cb() once the manifests are merged */
  needArt(keys, cb) {
    const gs = this.gs, byFrag = {};
    // (asked once: the build menu's cards ask on every look; a callback always asks again — the pages may have been
    // let go by Residency since)
    if (!cb) { keys = (keys || []).filter((k) => ART_SRC[k] && !this.artAsked.has(k)); if (!keys.length) return; }
    for (const k of keys || []) if (ART_SRC[k]) this.artAsked.add(k);
    for (const k of keys || []) {
      const src = ART_SRC[k];
      if (!src) continue;
      (byFrag[src[0]] = byFrag[src[0]] || new Set()).add(src[1]);
    }
    const frags = Object.keys(byFrag);
    if (!frags.length) { if (cb) cb(); return; }
    let left = frags.length;
    for (const f of frags) {
      const only = Array.from(byFrag[f]);
      for (const o of only) this.artWanted.add(o);
      Assets.loadFragment(gs, f, { only }, () => { if (--left === 0 && cb) cb(); });
    }
  }
  /** a card's picture key that can be drawn right now (the hammer while a late picture is on its way) */
  thumb(bkey) {
    const c = CATALOG[bkey] || {};
    const k = c.thumb || bkey;
    if (ART_SRC[k] && (!Assets.m.sprites[k] || Assets.pending(k) || !Assets.has(k))) return null;
    return k;
  }

  // ================================================================ the build menu
  /** the cards for a plot: [{ key, cost, locked, reason, text, cat }] (text: why it is locked / what unlocks it) */
  choices(site) {
    const gs = this.gs, pr = gs.progress;
    const keys = site.only ? [site.only] : (MENU[site.size] || MENU.M);
    const out = [];
    for (const k of keys) {
      const c = buildCost(k);
      const cat = (CATALOG[k] || {}).cat || 'work';
      let reason = null, text = null;
      const need = BUILD_UNLOCK[k];
      const unique = !!(CATALOG[k] && CATALOG[k].unique);
      if (need && !pr.met(need)) reason = 'lock_' + k;
      else if (unique && gs.isBuilt(k)) reason = 'lockBuilt';
      else if (unique && gs.isBuilding(k)) reason = 'lockBuilding';
      else if (isHouse(k) && this.vacantBeds() >= this.maxVacant()) { reason = 'lockVacant'; text = t('lockVacant', { n: this.vacantBeds() }); }
      else if ((isHouse(k) || isDecor(k)) && site.size !== 'S' && !site.only && this.bigPlotReserved(site)) {
        reason = 'lockBigPlot';
        const left = BIG_UNIQUES.filter((u) => !gs.isBuilt(u) && !gs.isBuilding(u)).map((u) => t('b_' + u));
        text = t('lockBigPlot2', { names: left.slice(0, 2).join(', ') + (left.length > 2 ? ' …' : '') });
      }
      out.push({ key: k, cost: c, locked: !!reason, reason, text: text || (reason ? t(reason) : null), cat, happy: Math.floor(num(c.happy, 0)) });
    }
    // (the late pictures of these cards are fetched by the build menu itself while it is open — UI.showBuildTab —
    // never by a mere look at the choices: the tutorial and the bots ask often, and texture memory is precious)
    out.sort((a, b) => (a.locked - b.locked));
    return out;
  }

  /**
   * (big plots) houses and decor may take a big plot as long as the big workshops still to come keep enough
   * big plots in the land that opens before the general store (else the store could find no plot: tower_se
   * waits for it)
   */
  bigPlotReserved(site) {
    const gs = this.gs;
    const left = BIG_UNIQUES.filter((u) => !gs.isBuilt(u) && !gs.isBuilding(u)).length;
    if (!left) return false;
    let free = 0;
    for (const id in gs.sites) {
      const st = gs.sites[id];
      if (st === site || st.kind !== 'plot' || st.state !== 'plot' || st.only || (st.size !== 'M' && st.size !== 'L')) continue;
      if (!PRE_STORE.has(st.region || 'start')) continue;
      free++;
    }
    return free < left;
  }

  // ================================================================ people
  maxVacant() { return Math.max(1, Math.floor(num((this.C.settlers || {}).maxVacant, 6))); }
  /** extra room in the village from the hall */
  popBonus() { return this.hall ? Math.max(0, Math.floor(num((this.C.hall || {}).people, 6))) : 0; }
  /**
   * empty house beds nobody will use: the houses' room (built and being built) minus the named residents who wait
   * or are still to come (they come first) and the settlers. The town hall's rooms do not count here (a new hall
   * never stops the houses)
   */
  vacantBeds() {
    const gs = this.gs, life = gs.life;
    if (!life) return 0;
    let building = 0;
    for (const id in gs.sites) { const st = gs.sites[id]; if (st.state !== 'plot' && st.state !== 'done' && isHouse(st.building)) building += Math.max(0, Math.floor(num((BALANCE.buildings[st.building] || {}).people, 0))); }
    return Math.max(0, gs.popCap() - this.popBonus() + building - life.people() - life.waiting.length - life.futurePeople());
  }
  /** beds settlers may move into now (built houses only) */
  freeBeds() {
    const gs = this.gs, life = gs.life;
    if (!life) return 0;
    return Math.max(0, gs.popCap() - life.people() - life.waiting.length - life.futurePeople());
  }

  /**
   * settlers: one household now and then while beds stand empty that no named resident needs (houses built beyond
   * the village's own people, the hall's rooms). From the first miner on (when houses can be built) — before that
   * the village has no spare beds anyway
   */
  updateSettlers(dt) {
    const gs = this.gs, S = this.C.settlers || {};
    if (!gs.progress || !gs.progress.met('hire_miner') || !gs.life) { this.settleT = 0; return; }
    const free = this.freeBeds();
    if (free <= 0) { this.settleT = 0; return; }
    const every = Math.max(5, num(S.every, 45)) / (1 + this.happyBonus() / 40);
    this.settleT += dt;
    if (this.settleT < every) return;
    this.settleT = 0;
    const lo = Math.max(1, Math.floor(num(S.householdMin, 1))), hi = Math.max(lo, Math.floor(num(S.householdMax, 2)));
    const n = Math.min(free, lo + Math.floor(Math.random() * (hi - lo + 1)));
    this.settlersArrive(n, false);
  }

  /** n settlers move in (instant: a test / restore, no walk) */
  settlersArrive(n, instant) {
    const gs = this.gs;
    n = Math.max(0, Math.floor(n));
    if (!n) return 0;
    this.settlers += n;
    gs.updatePopulation();
    gs.events.emit('settlers', n);
    if (instant) return n;
    const house = this.pickHouse();
    if (house) for (let i = 0; i < Math.min(2, n); i++) gs.time.delayedCall(i * 900, () => this.walkIn(house));
    gs.ui.toast(t('settlersCame', { n }));
    if (gs.life && Math.random() < 0.5) gs.life.cheer();
    return n;
  }

  pickHouse() {
    const hs = this.gs.houses;
    if (!hs.length) return null;
    // the newest houses first (their beds are the empty ones)
    return hs[hs.length - 1 - Math.floor(Math.random() * Math.min(3, hs.length))];
  }

  /** a newcomer walks in along the road from the west gate (or the station road) to a house door and goes in */
  walkIn(house) {
    const gs = this.gs;
    const from = this.entryPoint(house);
    const look = this.walkerLook();
    const w = new Character(gs, look.key, from.x, from.y, look.person ? { person: look.person, radius: 12 } : { radius: 12 });
    w.route = gs.roads.route(from.x, from.y, house.door.x, house.door.y + 20, []);
    w.ri = 0;
    w.house = house;
    w.t = 0;
    w.sprite.setAlpha(0); w.shadow.setAlpha(0);
    gs.tweens.add({ targets: [w.sprite, w.shadow], alpha: 1, duration: 400 });
    gs.agents.push(w);
    this.walkers.push(w);
  }

  entryPoint(house) {
    const gs = this.gs, R = gs.roads;
    // the nearest of the village's ways in that is off screen: the west gate, the south gate, the station road
    const ids = ['w_gate_n', 'w_gate_m', 'gate', gs.territory.isOpen('rail') ? 'v_link_w' : null].filter(Boolean);
    let best = null, bd = Infinity;
    for (const id of ids) {
      const n = R.byId[id];
      if (!n) continue;
      const d = gdist(n.x, n.y, house.x, house.y) + (gs.isOnScreen(n.x, n.y, 60) ? 2000 : 0);
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { x: best.x, y: best.y } : { x: house.x - 400, y: house.y + 200 };
  }

  walkerLook() {
    // a townsperson (once the neighbours' pictures are here), else a parka villager
    if (TF.ok && TF.readyFor(Assets, 'adult')) {
      const seed = (this.settlers * 7919 + 17) >>> 0;
      let s = seed || 1;
      const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
      try { const p = TF.person(rng); if (p && TF.age(p.base) === 'adult') return { key: 'tf:' + p.base, person: p }; } catch (e) { /* plain look */ }
    }
    const ks = ['villager_a', 'villager_b', 'villager_c'].filter((k) => Assets.charReady(k));
    return { key: ks.length ? ks[Math.floor(Math.random() * ks.length)] : 'villager_a', person: null };
  }

  updateWalkers(dt) {
    const gs = this.gs;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      w.t += dt;
      if (w.gone) continue;
      if (gs.followRoute(w, 80, dt, 14) || w.t > 70) {
        w.gone = true;
        gs.tweens.add({ targets: [w.sprite, w.shadow], alpha: 0, duration: 400, onComplete: () => this.dropWalker(w) });
        if (gs.isOnScreen(w.x, w.y, 100)) { Audio.play('sfx_door', { volume: 0.4, throttle: 300 }); if (gs.life) gs.life.bubbles.emote(w, 'emote_heart', 1.2); }
        continue;
      }
      w.sync(dt);
    }
  }

  dropWalker(w) {
    const i = this.walkers.indexOf(w);
    if (i >= 0) this.walkers.splice(i, 1);
    const a = this.gs.agents.indexOf(w);
    if (a >= 0) this.gs.agents.splice(a, 1);
    w.stack.clear(this.gs.effects);
    if (this.gs.life) this.gs.life.bubbles.clear(w);
    w.destroy();
  }

  // ================================================================ happiness
  /** decor and the hall: + happiness (a second copy of the same thing counts half, a third a quarter...), capped */
  happyBonus() {
    const seen = {};
    let h = 0;
    for (const a of this.amenities) {
      const k = a.key;
      const n = seen[k] = (seen[k] || 0) + 1;
      h += Math.max(0, num((BALANCE.buildings[k] || {}).happy, 0)) / Math.pow(2, n - 1);
    }
    if (this.hall) h += Math.max(0, num((this.C.hall || {}).happy, 8));
    return Math.min(Math.max(0, num(this.C.happyCap, 24)), Math.round(h));
  }

  // ================================================================ buildings
  addAmenity(a) { this.amenities.push(a); }

  update(dt) {
    this.t += dt;
    if (this.hall) this.hall.update(dt);
    if (this.restaurant) this.restaurant.update(dt);
    for (const a of this.amenities) a.update(dt);
    this.updateSettlers(dt);
    this.updateWalkers(dt);
  }

  /** the chief stands on one of the hall's / the restaurant's pads */
  playerPads(dt) {
    let on = false;
    if (this.hall && this.hall.playerPads(dt)) on = true;
    if (this.restaurant && this.restaurant.playerPads(dt)) on = true;
    return on;
  }

  serialize() {
    return {
      settlers: this.settlers, settleT: Math.round(this.settleT * 10) / 10,
      hall: this.hall ? this.hall.serialize() : (this.saved.hall || undefined),
      rest: this.restaurant ? this.restaurant.serialize() : (this.saved.rest || undefined),
    };
  }

  state() {
    return {
      settlers: this.settlers, vacant: this.vacantBeds(), free: this.freeBeds(), happy: this.happyBonus(),
      amenities: this.amenities.map((a) => a.key),
      hall: this.hall ? this.hall.state() : null,
      rest: this.restaurant ? this.restaurant.state() : null,
      walkers: this.walkers.length,
    };
  }
}
