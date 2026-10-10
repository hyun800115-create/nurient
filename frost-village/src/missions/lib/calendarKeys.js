// Calendar keys for 오늘의 미션 / 이번 주 목표 (pure; no Date objects inside, so tests can feed any local time).
// A "day" starts at resetHour (05:00) local time: 04:59 still belongs to yesterday. Keys are plain integers
// (days since 1970-01-01), so a clock moved backward is easy to recognise (smaller key) and DST changes do not
// matter (the key only depends on the local calendar date and hour).

const DAY_MS = 86400000;

/**
 * day key of a local time { y, m (1-12), d, h (0-24, may be fractional) } with the day starting at resetHour
 * @returns {number}
 */
export function dayKey(lt, resetHour = 5) {
  if (!lt || !Number.isFinite(lt.y) || !Number.isFinite(lt.m) || !Number.isFinite(lt.d)) return 0;
  const n = Math.floor(Date.UTC(lt.y, lt.m - 1, lt.d) / DAY_MS);
  return (Number(lt.h) || 0) < resetHour ? n - 1 : n;
}

/** 0 = Monday … 6 = Sunday for a day key (1970-01-01 was a Thursday) */
export function weekday(key) { return (((key + 3) % 7) + 7) % 7; }

/** week key = the day key of that week's reset day (Monday by default: resetDay 1 = Monday … 7 = Sunday) */
export function weekKey(key, resetDay = 1) {
  const startIdx = ((resetDay - 1) % 7 + 7) % 7;
  const off = ((weekday(key) - startIdx) % 7 + 7) % 7;
  return key - off;
}

/** { m, d } calendar date of a day key (for labels such as "10월 9일") */
export function dateOf(key) {
  const dt = new Date(key * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** the local time of a JS Date as plain fields (the host calls this; models never see a Date) */
export function localFields(date) {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), h: date.getHours() + date.getMinutes() / 60 };
}
