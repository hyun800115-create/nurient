// A template's objectives flattened into "units": one counter each (a deliver of bread 20 + fish 20 is two units).
// Progress is saved as a plain array of numbers aligned with these units, so it survives a reload compactly.

const CACHE = new Map();

/**
 * units of a template: [{ oi, t, need, item?, any?, sig?, how?, at?, secs?, win?, hours?, night?, to?, seq }]
 * `seq` = steps of one template run in order (A9: find, then return)
 */
export function unitsOf(tpl) {
  if (!tpl) return [];
  let u = CACHE.get(tpl);
  if (u) return u;
  u = [];
  (tpl.obj || []).forEach((o, oi) => {
    const base = { oi, t: o.t, hours: o.hours || null, night: !!o.night, to: o.to || null };
    if (o.t === 'deliver') {
      if (o.items) for (const k in o.items) u.push({ ...base, item: k, need: Math.max(1, o.items[k] | 0) });
      else u.push({ ...base, any: (o.any || []).slice(), need: Math.max(1, o.n | 0) });
    } else if (o.t === 'count') u.push({ ...base, sig: o.sig, need: Math.max(1, o.n | 0), win: o.win || null });
    else if (o.t === 'step') u.push({ ...base, how: o.how, at: o.at || null, secs: o.secs || 0, need: Math.max(1, o.n | 0), what: o.what || null, seq: true, o });
    else if (o.t === 'build') u.push({ ...base, key: o.key, need: 1 });
  });
  CACHE.set(tpl, u);
  return u;
}

/** a fresh progress array */
export function zeroes(tpl) { return unitsOf(tpl).map(() => 0); }

/** 0..1 progress of an instance */
export function fraction(tpl, g) {
  const u = unitsOf(tpl);
  let need = 0, got = 0;
  for (let i = 0; i < u.length; i++) { need += u[i].need; got += Math.min(u[i].need, (g && g[i]) || 0); }
  return need ? got / need : 0;
}

export function isDone(tpl, g) {
  const u = unitsOf(tpl);
  for (let i = 0; i < u.length; i++) if (((g && g[i]) || 0) < u[i].need) return false;
  return u.length > 0;
}

/** is the hour inside [a, b) (wrapping past midnight when a > b) */
export function inHours(h, w) {
  if (!w) return true;
  const [a, b] = w;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

/** night = 19:00 … 06:00 (the street lamps' hours) */
export function isNight(h) { return h >= 19 || h < 6; }
