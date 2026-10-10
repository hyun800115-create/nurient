// Cute happenings (docs/v5_v8_plan.md §6.1.6, v5 set P1–P6; the harbour and beach modules register theirs).
// At most one active, ≥ gapMin s apart, about every `every` s, never during driving, ceremonies, weddings or
// farewells; only within `range` px of the chief, or announced by a small toast with 보러 가기. Pure: the data and
// the scheduler; view/happenings/Happenings.js stages them.

export const HAPPENINGS = [
  { id: 'P1', key: 'bread_thief', ko: '콩이의 빵 도둑질', en: 'Kongi steals a loaf', where: 'market', pet: 'dog',
    toastKo: '콩이가 시장에서 빵을 물고 달아났어요!', toastEn: 'Kongi ran off with a loaf from the market!', chief: 'whistle', fame: 2, secs: 18 },
  { id: 'P2', key: 'snowman_hat', ko: '날아간 눈사람 모자', en: 'The snowman’s flying hat', where: 'snowman',
    toastKo: '바람에 눈사람 모자가 날아갔어요!', toastEn: 'The wind blew the snowman’s hat away!', chief: 'watch', fame: 2, secs: 14 },
  { id: 'P3', key: 'roof_cat', ko: '지붕 위 고양이', en: 'Cat on the roof', where: 'house', pet: 'cat',
    toastKo: '나비가 굴뚝 옆에서 못 내려오고 있어요!', toastEn: 'Nabi is stuck by a chimney!', chief: 'stand', fame: 3, secs: 22 },
  { id: 'P4', key: 'hungry_horse', ko: '배고픈 말', en: 'The hungry horse', where: 'bus_stop', need: 'bus',
    toastKo: '썰매버스 말이 승객 가방에 코를 박았어요!', toastEn: 'A sleigh-bus horse is nuzzling a passenger’s bag!', chief: 'wheat', fame: 2, secs: 16 },
  { id: 'P5', key: 'steam_wagon', ko: '증기 짐차 김 빠짐', en: 'The steam wagon sighs', where: 'road', need: 'wagon',
    toastKo: '증기 짐차가 푸슉 하고 멈췄어요. 아이들이 밀어 줘요!', toastEn: 'The steam wagon stopped with a big hiss. The kids push!', chief: null, fame: 0, secs: 16 },
  { id: 'P6', key: 'lost_penguin', ko: '길 잃은 펭귄', en: 'The lost penguin', where: 'bus_stop', pet: 'penguin', need: 'bus',
    toastKo: '뽀삐가 버스에 올라탔어요!', toastEn: 'Ppoppi waddled onto the bus!', chief: 'lead', fame: 2, secs: 20 },
];

export class HappeningClock {
  /** tuning: { gapMin, every, maxActive, range }; state: { last } (T of the last one) */
  constructor(tuning = {}, state = null, rng = null) {
    this.T = Object.assign({ gapMin: 150, every: 300, maxActive: 1, range: 900 }, tuning);
    this.last = state && Number.isFinite(state.last) ? state.last : -1e9;
    this.active = null;
    this.rng = rng || mulberry32(0x5eed);
    this.next = null;
  }

  /** due(T, ctx) -> a happening to start or null. ctx: { busy (ceremony / drive), open: { bus, wagon, … }, spots: { market: {x,y} … } } */
  due(T, ctx = {}) {
    if (this.active || ctx.busy) return null;
    if (this.next === null) this.next = Math.max(this.last + this.T.gapMin, T + this.T.every * (0.6 + this.rng() * 0.8));
    if (T < this.next) return null;
    const pool = HAPPENINGS.filter((h) => (!h.need || (ctx.open && ctx.open[h.need])) && (!ctx.spots || ctx.spots[h.where]));
    if (!pool.length) { this.next = T + this.T.every; return null; }
    const h = pool[Math.floor(this.rng() * pool.length) % pool.length];
    this.active = { h, T };
    this.last = T;
    this.next = null;
    return h;
  }

  end() { this.active = null; }
  state() { return { last: Math.round(this.last) }; }
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
