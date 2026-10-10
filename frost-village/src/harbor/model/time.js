// Game time helpers (docs/v5_v8_plan.md §5.5): one clock, DayClock.T in game seconds; a day is 600 s, an hour 25 s;
// T = 0 is midnight of day 0 (the game starts at T = 200 = 08:00).

export const DAY = 600;
export const HOUR = DAY / 24;
export const dayOf = (T) => Math.floor(T / DAY);
export const hourOf = (T) => (((T % DAY) + DAY) % DAY) / HOUR;
/** T of hour h on day d */
export const at = (d, h) => d * DAY + h * HOUR;
/** the harbour day starts at 04:00 (the night trawler leaves at 05:00, the first ferry docks at 06:30) */
export const HARBOR_DAY_START = 4;
export const harborDayOf = (T) => Math.floor((T - HARBOR_DAY_START * HOUR) / DAY);
export const harborDayT0 = (hd) => hd * DAY + HARBOR_DAY_START * HOUR;
export const isNight = (T) => { const h = hourOf(T); return h >= 19 || h < 6.5; };
