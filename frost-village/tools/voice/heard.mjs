// 눈꽃말 voices — what the village actually HEARS: every Korean bubble line of the game (src/data/strings.js
// LINES.ko) planned through the real runtime for six speakers each (village lines by residents from the
// cast, town lines by citizens), then counted: clips heard (play-weighted), moods, how lines end,
// keyword hits, pace, gaps. tools/voice/check_voice.py uses it for the play-weighted language and variety
// checks; it is also handy after editing lexicon keywords or the runtime.
//   node tools/voice/heard.mjs            # summary
//   node tools/voice/heard.mjs --json     # JSON for check_voice.py
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VillageVoice, keywordsOf } from '../../src/voice/VillageVoice.js';
import { CAST } from '../../src/voice/cast.js';
import { LINES } from '../../src/data/strings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/voice/manifest.json'), 'utf8'));
class Silent { now() { return 0; } has() { return true; } play() { return {}; } stop() {} setChannelGain() {} setBusGain() {} }
const vv = new VillageVoice({ manifest: MAN, backend: new Silent() });

const TOWN = /^(town_|shopper_|regular|mayor_invite|founder_ask|builder|newcomer|station)/;
const residents = Object.keys(CAST).filter((k) => k !== 'player').map((k) => ({ key: k }));
const citizens = [];
for (let i = 0; i < 40; i++) citizens.push({ id: i, kind: ['student', 'teen', 'adult', 'elder', 'adult'][i % 5] });

const plays = {}, hangul = {}, roman = {}, kinds = {}, moods = {}, endings = {}, perVoice = {};
let lines = 0, dur = 0, syl = 0, items = 0, kwHeard = 0, kwMissed = 0, sound = 0;
const gaps = [];
for (const cat in LINES.ko) {
  for (const line of LINES.ko[cat]) {
    const pool = TOWN.test(cat) ? citizens : residents;
    for (let s = 0; s < 6; s++) {
      const sp = pool[(s * 7 + line.length) % pool.length];
      const p = vv.plan(line, sp);
      if (!p) continue;
      lines++; dur += p.duration;
      moods[p.mood] = (moods[p.mood] || 0) + 1;
      perVoice[p.voice] = (perVoice[p.voice] || 0) + 1;
      const M = MAN.audio[p.key].markers;
      let soundEnd = 0;
      for (let i = 0; i < p.items.length; i++) {
        const it = p.items[i], mk = M[it.id];
        items++;
        plays[p.voice + '|' + it.id] = (plays[p.voice + '|' + it.id] || 0) + 1;
        hangul[it.hangul] = (hangul[it.hangul] || 0) + 1;
        roman[it.hangul] = mk.roman || '';
        kinds[it.kind] = (kinds[it.kind] || 0) + 1;
        syl += mk.syl || 1;
        const s0 = it.at, s1 = it.at + (it.dur - it.tail) / it.rate;
        if (i) gaps.push(s0 - soundEnd);
        sound += Math.max(0, s1 - Math.max(s0, soundEnd));
        soundEnd = Math.max(soundEnd, s1);
      }
      const last = p.items[p.items.length - 1];
      const end = last.kind === 'word' || last.kind === 'babble' || last.kind === 'filler' ? '(word)' : last.hangul;
      endings[end] = (endings[end] || 0) + 1;
      const ks = keywordsOf(line, 8);
      for (const k of ks) { if (p.items.some((x) => x.id === k.id)) kwHeard++; else kwMissed++; }
    }
  }
}
gaps.sort((a, b) => a - b);
const q = (f) => gaps[Math.floor(f * (gaps.length - 1))];
const top = Object.entries(hangul).sort((a, b) => b[1] - a[1]);
const share = (c) => +(100 * c / items).toFixed(2);
const out = {
  lines, items, meanDur: +(dur / lines).toFixed(3), sylPerSec: +(syl / dur).toFixed(2),
  soundShare: +(sound / dur).toFixed(3),
  gapP10: +q(0.1).toFixed(3), gapMedian: +q(0.5).toFixed(3), gapP90: +q(0.9).toFixed(3),
  moods, kinds, perVoice,
  endings: Object.fromEntries(Object.entries(endings).sort((a, b) => b[1] - a[1]).map(([k, c]) => [k, +(100 * c / lines).toFixed(1)])),
  top: top.slice(0, 30).map(([h, c]) => [h, share(c)]),
  hangul, roman, plays,
  keywords: { heard: kwHeard, missed: kwMissed },
};
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(out));
} else {
  console.log(`${lines} planned lines (${Object.keys(LINES.ko).length} categories x 6 speakers): mean ${out.meanDur} s, ${out.sylPerSec} syllables/s, sound ${(out.soundShare * 100).toFixed(0)}% of each line`);
  console.log(`gaps between clips (s, after each clip's quiet tail): p10 ${out.gapP10} median ${out.gapMedian} p90 ${out.gapP90}`);
  console.log('moods', JSON.stringify(moods));
  console.log('kinds', JSON.stringify(kinds));
  console.log('line endings %', JSON.stringify(out.endings));
  console.log(`distinct clips heard ${top.length}; top 25 (% of plays): ` + out.top.slice(0, 25).map(([h, s]) => `${h} ${s}`).join(', '));
  console.log(`keyword words heard ${kwHeard}, not heard ${kwMissed} (${(100 * kwMissed / Math.max(1, kwHeard + kwMissed)).toFixed(1)}%)`);
}
