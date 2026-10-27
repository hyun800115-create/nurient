// (누리) the village dog is 누리 / Nuri, the designer's maltipoo — Node only:
//   node tools/test/nuri.test.mjs
// - every dog line says 누리 / Nuri (no 콩이 / Kongi left in the game text)
// - no person can be called 누리: the TownSim pool, the story pools (all generations), the baby-naming pool
// - an older save where a story resident was called 누리 loads with 도담 (the pools' replacement), and saves
//   without such a resident round-trip byte for byte (the save stays v7, nothing else changes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS, TOWN_NAMES, townName } from '../../src/data/strings.js';
import { GIVEN } from '../../src/story/engine/lang/names.js';
import { createStory } from '../../src/story/engine/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { if (c) pass++; else fail++; console.log((c ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

// 1. game text
for (const lang of ['ko', 'en']) {
  const S = STRINGS[lang];
  const want = lang === 'ko' ? '누리' : 'Nuri';
  for (const k of ['dogComing', 'dogGift', 'dogTrick', 'dogFar', 'dogFull', 'dogWhistleHint', 'news_dog', 'act_dog']) {
    ok(typeof S[k] === 'string' && S[k].includes(want), `${lang}.${k} names ${want}`, S[k]);
  }
}
const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else if (/\.(js|mjs|json)$/.test(f)) out.push(p);
  }
  return out;
};
const left = [];
for (const f of walk(path.join(ROOT, 'src')).concat(walk(path.join(ROOT, 'assets')).filter((p) => p.endsWith('manifest.json')))) {
  const s = fs.readFileSync(f, 'utf8');
  // 킹콩이(지요) is a King Kong joke, 콩콩이 the toddler's nickname: neither is the dog
  if (/(?<![콩킹])콩이|\bKongi\b|시바견/.test(s)) left.push(path.relative(ROOT, f));
}
ok(left.length === 0, 'no 콩이 / Kongi / 시바견 left in src or the asset manifests', left.join(', '));

// 2. name pools
ok(!TOWN_NAMES.ko.includes('누리') && !TOWN_NAMES.en.includes('Nuri'), 'TownSim names: no 누리 / Nuri');
ok(TOWN_NAMES.ko.length === TOWN_NAMES.en.length && TOWN_NAMES.ko.length === 120, 'TownSim names: still 120 ko/en pairs (ids keep their names)');
ok(TOWN_NAMES.ko[90] === '도담' && TOWN_NAMES.en[90] === 'Dodam', 'citizen #90 (was 누리) is 도담 / Dodam', townName(90));
const pools = [];
for (const g in GIVEN) for (const s in GIVEN[g]) pools.push(...GIVEN[g][s]);
ok(!pools.includes('누리'), 'story name pools (every generation, both sexes): no 누리');

// 3. story engine: babies and saves
const a = createStory({ seed: 11, population: 120, textMode: 'none' });
a.runDays(1.2);
const e = a.engine || a;
const people = (e.alive || []);
ok(people.length > 50, 'story town lives', String(people.length));
let pooled = new Set();
for (const p of people) for (const n of (e.namePool ? e.namePool(p.id, 3) : [])) pooled.add(n.ko);
ok(e.namePool ? !pooled.has('누리') : true, 'baby-naming suggestions never offer 누리', [...pooled].slice(0, 6).join(' '));
const s0 = a.serialize();
const b = createStory({ save: s0, textMode: 'none' });
ok(b.serialize() === s0, 'a save without 누리 round-trips byte for byte');
// an older save: one resident still called 누리
const victim = people.find((p) => p.alive);
const oldGiven = victim.given;
victim.given = '누리';
e.usedNames && e.usedNames.add('누리');
const s1 = a.serialize();
victim.given = oldGiven;
const c = createStory({ save: s1, textMode: 'none' });
const ce = c.engine || c;
const back = ce.people[victim.id];
ok(back && back.given === '도담', 'an older save: the resident called 누리 loads as 도담', back && back.given);
ok(!(ce.alive || []).some((p) => p.given === '누리'), 'after loading nobody is called 누리');
c.runDays(0.3);
ok(true, 'the loaded town keeps living');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
