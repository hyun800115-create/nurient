// Game time (docs/v5_v8_plan.md §5.5): one clock, DayClock.T in game seconds; a day is 600 s, an hour 25 s;
// T = 0 is midnight of day 0 (a new game starts at T = 200 = 08:00). The beach never keeps a wall clock.

export const DAY = 600;
export const HOUR = DAY / 24;
export const dayOf = (T) => Math.floor(T / DAY);
export const hourOf = (T) => (((T % DAY) + DAY) % DAY) / HOUR;
/** T of hour h on day d */
export const at = (d, h) => d * DAY + h * HOUR;
/** the next T (≥ T) at which the clock shows hour h */
export function nextAt(T, h) { const d = dayOf(T); const t = at(d, h); return t >= T ? t : t + DAY; }
/** sunlight 0 (night) .. 1 (day): the beach crowd follows it */
export function daylight(h) { if (h < 6 || h >= 21) return 0; if (h < 9) return (h - 6) / 3; if (h < 18) return 1; return (21 - h) / 3; }
