// (v4.2, docs/v42_plan.md §7.2–7.3) 관망: where each activity sends the chief (pure helpers over the game state).
//   isPayTarget(gs, x, y)   a pay / hire / upgrade pad or a building plot there (the pilot never goes to spend)
//   urgentTarget(gs)        the tutorial's own target (the arrow) when it is not a pay target: an unstaffed register,
//                           a ribbon, a station to work, a site missing what he carries, the food box …
//   workTarget(gs)          carry what is in the bag where it goes (Tutorial.destination), else fetch a load: the
//                           fullest station output / pile nobody carries, a shelf's empty item from the 창고
//   cashTarget(gs, min)     the fullest till (≥ min coins)
//   restSpot(gs, rng)       a bench, a campfire, the shore
//   chatMate(gs, x, y, recent, now, maxD)   a resident at a spot (not walking, moving in or in an event) within maxD px
//                                (600; 1,500 during a chore break) not chatted with in 5 min

import { gdist } from '../../core/Iso.js';
import { Settings } from '../../core/Save.js';

/** a staff / porter hire pad (never a building, upgrade, boat or tool pad) */
export function isHirePad(pad) { return !!(pad && pad.kind === 'hire' && !(pad.opts && pad.opts.items) && !/^boat/.test(pad.id || '')); }

/** ((gameplay review M4) 관망 중 돈 쓰기 = 고용만: the nearest hire pad he can pay in full now, else null */
export function hireTarget(gs) {
  if (Settings.data.observeSpend !== 'hire') return null;
  const p = gs.player, coins = gs.economy ? gs.economy.coins : 0;
  let best = null, bd = Infinity;
  const consider = (pad) => {
    if (!isHirePad(pad) || pad.done || pad.maxed || pad.active === false || !(pad.remaining > 0) || coins < pad.remaining) return;
    if (pad.pad && pad.pad.img && pad.pad.img.visible === false) return;
    const d = gdist(p.x, p.y, pad.x, pad.y);
    if (d < bd) { bd = d; best = pad; }
  };
  const pr = gs.progress;
  for (const id in (pr && pr.pads) || {}) consider(pr.pads[id]);
  const v = gs.v42;
  if (v && v.lines) for (const id in v.lines.pads) consider(v.lines.pads[id]);
  if (v && v.office) consider(v.office.hirePad);
  return best ? { x: best.x, y: best.y, kind: 'hire', pad: best, key: 'hire' } : null;
}

export function isPayTarget(gs, x, y) {
  const near = (o) => o && Math.abs(o.x - x) < 40 && Math.abs(o.y - y) < 40;
  const pr = gs.progress;
  for (const id in pr.pads || {}) if (near(pr.pads[id])) return true;
  const v = gs.v42;
  if (v && v.lines) for (const id in v.lines.pads) if (near(v.lines.pads[id])) return true;
  if (v && v.office && v.office.hirePad && near(v.office.hirePad)) return true;
  for (const id in gs.sites || {}) { const s = gs.sites[id]; if (s.state === 'plot' && (near(s) || near({ x: s.dropX, y: s.dropY }))) return true; }
  const rk = gs.v4 && gs.v4.rank;
  if (rk && rk.pad && near(rk.pad)) return true;
  return false;
}

export function urgentTarget(gs) {
  const T = gs.tutorial;
  if (!T || T.inTutorial) return null;
  const tg = T.target;
  if (!tg) return null;
  if (isPayTarget(gs, tg.x, tg.y)) return null;
  const k = T.textKey || '';
  if (/^obj_(unlock|clerk|porter|operator|raw|tower|boat|next)/.test(k)) return null;
  return { x: tg.x, y: tg.y, key: k };
}

export function workTarget(gs) {
  const p = gs.player, T = gs.tutorial;
  if (!p) return null;
  if (p.stack.count > 0 && T && T.destination) {
    for (let i = p.stack.items.length - 1; i >= 0; i--) {
      const ty = p.stack.items[i].type, d = T.destination(ty);
      if (d && d.pad) return { x: d.pad.x, y: d.pad.y, kind: 'carry', item: ty, place: d.label || d.key || null, lp: d.lp || null };
    }
    // ((gameplay review M1) nowhere takes the bag right now: no chore (the trash pad ignores him while he is piloted);
    //  he does something else and delivers once a place has room)
    return null;
  }
  if (p.room <= 0) return null;
  // the fullest output nobody's porter keeps up with, then a full pile
  let best = null;
  const goes = (ty) => !!(T && T.destination && T.destination(ty));
  for (const st of gs.stationList || []) {
    if (!st.enabled || st.outStack.count < 4) continue;
    if (!goes(st.cfg.output)) continue;          // ((gameplay review M1) its product has somewhere to go
    const f = st.outStack.count / Math.max(1, st.outStack.max);
    if (!best || f > best.f) best = { f, x: st.outPad.x, y: st.outPad.y, kind: 'take', item: st.cfg.output, st };
  }
  for (const id in gs.piles || {}) {
    const pl = gs.piles[id];
    if (!pl.shown || pl.count < pl.stack.max * 0.8 || !goes(pl.item)) continue;
    const f = pl.count / Math.max(1, pl.stack.max) - 0.1;
    if (!best || f > best.f) best = { f, x: pl.pad.x, y: pl.pad.y, kind: 'take', item: pl.item, pile: pl };
  }
  return best && best.f >= 0.3 ? best : null;
}

export function cashTarget(gs, min) {
  // (the till worth the walk: coins per distance, so a near full pad beats a far fuller one)
  let best = null, bs = -1;
  const tills = gs.tills || [], p = gs.player;
  for (const c of tills) {
    if (!c || c.enabled === false || c.value < min) continue;
    const s = c.value / (1 + (p ? gdist(p.x, p.y, c.x, c.y) : 0) / 800);
    if (s > bs) { bs = s; best = c; }
  }
  return best ? { x: best.x, y: best.y, kind: 'cash', till: best } : null;
}

export function restSpot(gs, r) {
  const out = [];
  for (const c of gs.campfires || []) out.push({ x: c.x + 60, y: c.y + 40, kind: 'fire' });
  for (const b of gs.benches || []) out.push({ x: b.x, y: b.y + 24, kind: 'bench' });
  if (gs.market) out.push({ x: gs.market.x - 220, y: gs.market.y - 120, kind: 'sea' });
  if (!out.length) return null;
  return out[Math.floor(r() * out.length) % out.length];
}

export function chatMate(gs, x, y, recent, now, maxD) {
  const L = gs.life;
  let best = null, bd = maxD || 600;
  for (const r of (L && L.residents) || []) {
    // (a resident almost always has a VillageLife job — staying at a spot, sitting: those can chat; not one who is
    //  walking somewhere, moving in, in an event or a pet)
    if (!r || !r.sprite || r.lod || r.isPet || r.event) continue;
    const j = r.job;
    if (j && (j.kind === 'arrive' || j.kind === 'pet' || (j.kind === 'stay' && (j.phase === 'travel' || j.phase === 'walk')))) continue;
    const k = r.key || r.id;
    if (recent[k] && now - recent[k] < 300) continue;
    const d = gdist(x, y, r.x, r.y);
    if (d < bd) { bd = d; best = { ch: r, key: k }; }
  }
  return best;
}
