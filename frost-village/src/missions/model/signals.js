// GameFeed events (docs/v5_v8_plan.md §5.4) → mission counters ("signals"). One place, so a new game event only
// needs a line here. Each entry returns [[sig, n], …]. Payload fields are optional: an event without its v5
// detail (before patch P8/P9) still counts what it can (a sale without an item counts a customer).

const n1 = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, 1e5) : 1; };
const nOr0 = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, 1e5) : 0; };

const MAP = {
  sold: (e) => (e.item ? [['cust', 1], ['sold:' + e.item, n1(e.n)]] : [['cust', 1]]),
  storeSold: (e) => (e.item ? [['cust', 1], ['sold:' + e.item, n1(e.n)]] : [['cust', 1]]),
  shopSold: (e) => (e.item ? [['sold:' + e.item, n1(e.n)]] : []),            // founded shops (Growth inland sales)
  traded: (e) => (e.item ? [['traded:' + e.item, n1(e.n)]] : []),
  restMeal: (e) => (e.combo ? [['cust', 1], ['combo', 1]] : [['cust', 1]]),
  produced: (e) => (e.item ? [['made:' + e.item, n1(e.n)]] : []),
  crafted: (e) => (e.item ? [['made:' + e.item, n1(e.n)]] : []),
  boatHome: (e) => { const out = []; if (e.catch && typeof e.catch === 'object') for (const k in e.catch) { const n = nOr0(e.catch[k]); if (n) out.push(['catch:' + k, n]); } return out; },
  visitorDone: () => [['visitor', 1]],
  train: (e) => {
    const out = [];
    if (e.ev === 'arrive' && nOr0(e.n)) out.push(['riders', nOr0(e.n)]);
    if (e.ev === 'ride' && e.chief) { out.push(['chief_ride', 1]); out.push(['ride:' + (e.line || 'main'), 1]); }
    return out;
  },
  'veh:arrive': (e) => (nOr0(e.riders) ? [['riders', nOr0(e.riders)], ['bus_riders', nOr0(e.riders)]] : []),
  'veh:ride': (e) => (e.chief ? [['chief_ride', 1], ['ride:' + (e.line || 'bus'), 1]] : []),
  wholesale: (e) => [['wholesale', n1(e.n)]],
  dogAct: (e) => (e.kind ? [['dog:' + e.kind, 1]] : []),
  tap: (e) => (e.talk ? [['chat', 1]] : []),
  chat: () => [['chat', 1]],
  collect: (e) => (e.pad === 'tax' ? [['tax', 1]] : []),
  flower: () => [['flower', 1]],
  paperRead: () => [['paper_read', 1]],
  'harbor:auction': () => [['auction', 1]],
  'harbor:export': (e) => [['export', n1(e.n)]],
  'beach:arrive': (e) => [['beach_guest', n1(e.n)]],
  'beach:checkin': (e) => [['hotel_guest', n1(e.n)]],
  'lgx:settle': () => [['settle', 1]],
  'lgx:produced': (e) => (e.kind === 'furniture' || e.kind === 'appliance' ? [['made:' + e.kind, n1(e.n)]] : []),
};

/** the signals of one feed event ([] when it means nothing to missions) */
export function signalsOf(ev) {
  const f = ev && MAP[ev.t];
  if (!f) return [];
  try { return f(ev) || []; } catch (e) { return []; }
}

/** every feed event type the counters listen to (the GameFeed test checks each one is emitted somewhere) */
export const SIGNAL_EVENTS = Object.keys(MAP);
