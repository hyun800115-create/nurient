// Game time helpers (docs/v5_v8_plan.md §5.5): one clock, DayClock.T in game seconds; a day is 600 s, an hour 25 s.

export const DAY = 600;
export const HOUR = 25;
export const dayOf = (T) => Math.floor((Number(T) || 0) / DAY);
export const hourOf = (T) => ((((Number(T) || 0) % DAY) + DAY) % DAY) / HOUR;
/** T of hour h on day d */
export const atHour = (d, h) => d * DAY + h * HOUR;
