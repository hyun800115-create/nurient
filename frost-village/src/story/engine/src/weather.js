// Winter weather of the snowy town, one roll per day (a little Markov chain), unless the game sets it.
//   kinds: clear, sunny, cloudy, light (light snow), snow, heavy, blizzard, fog, mild
// Special days: the first heavy snowfall, an aurora night, a blizzard warning -> 'weather' facts.

const KINDS = ['clear', 'sunny', 'cloudy', 'light', 'snow', 'heavy', 'blizzard', 'fog', 'mild'];
const NEXT = {
  clear: [['clear', 3], ['sunny', 3], ['cloudy', 2], ['light', 2], ['fog', 1], ['mild', 1]],
  sunny: [['sunny', 3], ['clear', 2], ['cloudy', 2], ['light', 1], ['mild', 1]],
  cloudy: [['cloudy', 2], ['light', 3], ['snow', 2], ['clear', 1], ['fog', 1]],
  light: [['light', 2], ['snow', 3], ['cloudy', 2], ['clear', 1]],
  snow: [['snow', 2], ['heavy', 2], ['light', 2], ['cloudy', 1], ['clear', 1]],
  heavy: [['heavy', 1], ['blizzard', 1], ['snow', 2], ['clear', 2]],
  blizzard: [['heavy', 2], ['snow', 1], ['clear', 3], ['sunny', 1]],
  fog: [['cloudy', 2], ['clear', 2], ['light', 1]],
  mild: [['mild', 1], ['sunny', 2], ['cloudy', 2], ['light', 1]],
};
const TEMP = { clear: [-14, -6], sunny: [-10, -3], cloudy: [-9, -3], light: [-8, -2], snow: [-10, -4], heavy: [-14, -6], blizzard: [-22, -12], fog: [-6, -1], mild: [-2, 3] };

export class Weather {
  constructor(e) {
    this.e = e;
    this.today = { kind: 'snow', temp: -6, first: false, aurora: false };
    this.forced = null;
    this.heavyDays = 0;
  }

  roll() {
    const e = this.e, rng = e.rng;
    const prev = this.today.kind;
    let kind;
    if (this.forced) { kind = this.forced.kind; }
    else { const opts = NEXT[prev] || NEXT.clear; kind = opts[rng.weighted(opts.map((o) => o[1]))][0]; }
    const t = TEMP[kind] || TEMP.clear;
    const temp = this.forced && this.forced.temp !== undefined ? this.forced.temp : t[0] + rng.int(t[1] - t[0] + 1);
    const first = (kind === 'heavy' || kind === 'blizzard') && this.heavyDays === 0;
    if (kind === 'heavy' || kind === 'blizzard') this.heavyDays++;
    const aurora = (kind === 'clear' || kind === 'sunny') && temp <= -10 && rng.chance(0.25);
    this.today = { kind, temp, first, aurora };
    this.forced = null;
    if (first || aurora || kind === 'blizzard') {
      const f = e.fact('weather', { n: aurora ? 2 : kind === 'blizzard' ? 1 : 0, i: temp });
      for (const r of e.alive) if (rng.chance(0.5)) e.learn(r, f, 0);
    }
  }

  set(kind, temp) { if (KINDS.indexOf(kind) >= 0) this.forced = { kind, temp }; }
}

export { KINDS as WEATHER_KINDS };
