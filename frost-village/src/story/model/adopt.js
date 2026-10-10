// Adoption (docs/v5_v8_plan.md §5.6): the game's people become story people on the first v5 boot — the same path
// for new games and old saves. Pure and deterministic (seeded hash, no Math.random).
//
//   const A = adoptRoster(roster, { seed, relations })
//   A.households -> [{ key, building, size }]      (for places.js: one story home each)
//   A.specs      -> engine addResident specs (gid = the game's pid), in roster order per household
//   A.rels       -> [[i, j, kind]] indices into specs ('spouse' | 'parent' | 'sibling' | 'grand' | 'best' | 'friend' | …)
//
// roster rows (from the game, see host.js / ports.people.roster()):
//   { pid: 'v:npc_aunt', kind: 'villager', key, persona: { name, short, en, group, sex, age, job, home } , home }
//   { pid: 't:12', kind: 'citizen', townKind: 'adult'|'student'|'teen'|'elder'|'shopkeeper'|'civic'|'builder'|'keeper'|'resident',
//     role, name, nameEn, age, home, work, sex: 'm'|'f'|null (doll look), workKey }
//   { pid: 's:3', kind: 'settler', home, age, sex, name, body: true }   (skipped while the settler has no body in the game)
//   { pid: 'k:203', kind: 'citizen', townKind: 'toddler'|'student', sid: 203, age, home, … }   (a story child's body, P6)
//   any row may carry visits (TownSim c.visits: the v4 regulars) and sid (the engine id the body was made for)
// Households are inferred from shared homes: adult pairs within 12 years -> couple; students / teens with the first
// adults of their home -> children; two elders -> couple; everyone else lives alone. TownSim given names are kept,
// a surname is drawn from the pid; a wife keeps her own surname, children take the father's.

import { SURNAMES } from '../engine/lang/names.js';

// TownSim names (src/data/strings.js TOWN_NAMES) that are boys' / men's names; the others are girls' / women's
const MALE_NAMES = new Set(('서준 도윤 예준 시우 주원 지호 준우 도현 건우 우진 선우 현우 유준 정우 승우 지훈 민준 태윤 은우 시윤 이준 민재 준서 연우 지환 승민 '
  + '하준 준혁 태민 재윤 동하 영호 정수 광수 덕배 춘식 만석 봉구 용수 철수 길동 한결 가람 온유 바다 누리 겨울 산들 태호 경민 상우 동건 재석 성민 '
  + '현수 창민 기태 동욱').split(' '));

/** civic role -> engine job */
const CIVIC_JOB = { teacher: 'teacher', police: 'police', postal: 'postal', doctor: 'doctor', nurse: 'nurse', fire: 'firefighter', mayor: 'hall_clerk', station: 'station' };
/** shop kind -> the owner's engine job */
const SHOP_JOB = { bakery: 'baker', cafe: 'barista', restaurant: 'cook', stall: 'stall_keeper', salon: 'hairdresser', grocer: 'grocer', fishmonger: 'fishmonger' };
/** named villager key -> engine persona */
const PERSONA = { npc_kid_prankster: 'prankster', npc_teen_girl: 'teen', npc_aunt: 'kind', npc_uncle: 'grumpy', npc_grandma: 'gentle', npc_grandpa: 'gentle',
  npc_bard: 'bard', npc_fashion: 'vain', npc_chef: 'chef', npc_guard: 'guard', npc_herbalist: 'shy', npc_captain: 'hearty', npc_kid_girl: 'kid', npc_kid_boy: 'kid',
  npc_skater: 'kid', npc_toddler: 'kid', npc_young_man: 'showoff', npc_smoker: 'grumpy', npc_merchant: 'sly', npc_painter: 'gentle', npc_doctor: 'kind' };
/** a named villager's job words -> engine job */
const VILLAGER_JOB = [[/빵/, 'baker'], [/의사/, 'doctor'], [/요리/, 'cook'], [/우체/, 'postal'], [/선장|어부|낚시/, 'fisher'], [/학생|초등/, 'student'], [/점원|가게|상인/, 'shopkeeper'],
  [/경비/, 'police'], [/짐꾼|제재|훈제|통조림|기술|대장/, 'builder'], [/화가/, 'painter'], [/음유|시인|가수/, 'musician']];
const GROUP_AGE = { toddler: 2, kid: 9, teen: 16, adult: 36, elder: 74 };

/** FNV-1a */
export function hash(s, h = 0x811c9dc5) {
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const SUR_TOTAL = SURNAMES.reduce((a, s) => a + s[1], 0);
/** a surname drawn by real frequency from a seed string */
export function surnameFor(seedStr) {
  let x = hash(seedStr) % SUR_TOTAL;
  for (const [s, w] of SURNAMES) { x -= w; if (x < 0) return s; }
  return '김';
}

/** sex of a doll from its parts (skirts, dresses, long hair -> 'f'; facial hair -> 'm'), or null */
export function lookSex(person) {
  if (!person || !person.parts) return null;
  let f = 0, m = 0;
  for (const p of person.parts) {
    if (/^fh_/.test(p)) m += 3;
    else if (/skirt|pleated|dress|tunic|wedding_dress|veil/.test(p)) f += 2;
    else if (/hair_(long|ponytail|twintails|braids|bun|lowbun|bob_long)|acc_ribbon|acc_hairclip|acc_necklace/.test(p)) f += 1;
    else if (/hair_(buzz|spiky)|groom_suit/.test(p)) m += 1;
  }
  return f > m ? 'f' : m > f ? 'm' : null;
}

/** the story's sex for a roster row: the doll's look first, then the name, then a hash */
export function sexOf(row) {
  if (row.sex === 'm' || row.sex === 'f') return row.sex;
  const nm = baseName(row.name);
  if (nm) return MALE_NAMES.has(nm) ? 'm' : 'f';
  return hash(row.pid) & 1 ? 'm' : 'f';
}

/** '민지 2' -> '민지' (TownSim numbers repeated names) */
export function baseName(n) { return n ? String(n).replace(/\s+\d+$/, '') : ''; }

function villagerSpec(row) {
  const p = row.persona || {};
  const key = row.key || String(row.pid).slice(2);
  const group = p.group || 'adult';
  const age = Number.isFinite(p.age) ? p.age : GROUP_AGE[group] || 36;
  let job;
  for (const [re, j] of VILLAGER_JOB) if (re.test(p.job || '')) { job = j; break; }
  if (age < 19 && age >= 4) job = 'student';
  if (group === 'elder') job = 'retired';
  // a title without a given name ('빵집 아주머니') or a given name ('하린', '민호')
  const short = p.short || p.name || key;
  const isGiven = /^[가-힣]{1,3}$/.test(short) && !/(아주머니|아저씨|할머니|할아버지|선생님|대장|소녀|씨)$/.test(short);
  const spec = { gid: row.pid, key, kept: true, age, male: (p.sex || row.sex) === 'm' || (!p.sex && /아저씨|할아버지|선장|대장/.test(p.name || '')),
    job, role: 'villager', persona: PERSONA[key] || 'plain', hh: row.pid };
  if (isGiven) { spec.given = short; spec.sur = surnameFor('v' + key); }
  else { spec.title = p.name || short; spec.titleEn = p.en || null; }
  if (p.sex === 'f') spec.male = false;
  return spec;
}

function citizenJob(row, age) {
  const k = row.townKind || 'adult';
  if (age < 4) return undefined;
  if (age < 19 && (k === 'student' || k === 'teen' || k === 'resident')) return 'student';
  if (k === 'elder' || age >= 65) return 'retired';
  if (k === 'civic') return CIVIC_JOB[row.role] || 'hall_clerk';
  if (k === 'builder') return 'builder';
  if (k === 'shopkeeper' || k === 'keeper') return SHOP_JOB[row.workKind] || 'shopkeeper';
  return undefined;                                  // fillOpenings gives grown-ups a job in town
}

/**
 * roster -> households, specs, rels. opts: { seed, relations: [[keyA, keyB, aff, labelA, labelB]] (chat personas) }
 */
export function adoptRoster(roster, opts = {}) {
  const seed = String(opts.seed || 1);
  const specs = [], rels = [], households = [];
  const idx = Object.create(null);               // pid -> spec index
  // ---- named villagers: each lives alone (a married pair from the relations lives together)
  const vill = roster.filter((r) => r.kind === 'villager');
  const married = new Map();
  for (const [a, b, aff, la] of opts.relations || []) if (la === '부부' || aff >= 90) { married.set('v:' + a, 'v:' + b); married.set('v:' + b, 'v:' + a); }
  for (const row of vill) {
    const s = villagerSpec(row);
    const partner = married.get(row.pid);
    if (partner && idx[partner] !== undefined) s.hh = specs[idx[partner]].hh;
    else households.push({ key: s.hh, building: row.home || 'village', size: partner ? 2 : 1 });
    idx[row.pid] = specs.length;
    s.home = s.hh;                                // the host maps hh keys to story homes (places.js homeOf)
    specs.push(s);
  }
  for (const [a, b, aff, la] of opts.relations || []) {
    const i = idx['v:' + a], j = idx['v:' + b];
    if (i === undefined || j === undefined) continue;
    const kind = la === '부부' ? 'spouse' : aff >= 60 ? 'best' : aff >= 35 ? 'friend' : 'acquaint';
    rels.push([i, j, kind]);
  }
  // ---- townsfolk, district households and settlers: households by shared home
  // (critique M13) v4 settlers are a count, not people: a settler row is adopted only once the game gives it a body
  const others = roster.filter((r) => r.kind !== 'villager' && !(r.kind === 'settler' && !r.body));
  const byHome = new Map();
  for (const row of others) {
    const h = row.home || 'town';
    if (!byHome.has(h)) byHome.set(h, []);
    byHome.get(h).push(row);
  }
  const homes = Array.from(byHome.keys()).sort();
  for (const home of homes) {
    const rows = byHome.get(home).slice().sort((a, b) => pidNum(a.pid) - pidNum(b.pid));
    const person = rows.map((row) => ({ row, age: Number.isFinite(row.age) ? Math.max(0, Math.round(row.age)) : 30, sex: sexOf(row), hh: null }));
    const adults = person.filter((p) => p.age >= 19 && p.age < 65);
    const elders = person.filter((p) => p.age >= 65);
    const kids = person.filter((p) => p.age < 19);
    const groups = [];
    const pairUp = (list, gap) => {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.hh) continue;
        let mate = null;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (b.hh || b.sex === a.sex || Math.abs(b.age - a.age) > gap) continue;
          mate = b; break;
        }
        if (mate) { const g = { members: [a, mate], couple: true, kids: [] }; a.hh = mate.hh = g; groups.push(g); }
      }
    };
    pairUp(adults, 12);
    pairUp(elders, 12);
    for (const p of adults.concat(elders)) if (!p.hh) { const g = { members: [p], couple: false, kids: [] }; p.hh = g; groups.push(g); }
    // children: the first grown-ups of the home who are old enough to be their parents
    for (const k of kids) {
      let best = null;
      for (const g of groups) {
        if (g.kids.length >= 3) continue;
        const young = Math.min(...g.members.map((m) => m.age));
        if (young - k.age < 18 || young >= 65) continue;
        if (!best || (g.couple && !best.couple) || (g.couple === best.couple && g.kids.length < best.kids.length)) best = g;
      }
      if (!best) best = groups.find((g) => g.kids.length < 4) || null;            // grandparents look after them
      if (!best) { best = { members: [], couple: false, kids: [] }; groups.push(best); }
      best.kids.push(k); k.hh = best;
    }
    let n = 0;
    for (const g of groups) {
      const all = g.members.concat(g.kids);
      if (!all.length) continue;
      const key = 'h:' + home + ':' + (++n);
      households.push({ key, building: home, size: all.length });
      const dad = g.members.find((m) => m.sex === 'm') || g.members[0] || g.kids[0];
      const famSur = surnameFor(seed + ':' + key + ':' + dad.row.pid);
      const base = specs.length;
      for (const m of all) {
        const isKid = g.kids.indexOf(m) >= 0;
        const sur = isKid || m === dad ? famSur : surnameFor(seed + ':' + m.row.pid);
        const sp = { gid: m.row.pid, given: baseName(m.row.name) || undefined, sur, age: m.age, male: m.sex === 'm', hh: key, home: key,
          role: m.row.kind === 'settler' ? 'settler' : m.row.townKind || 'adult', job: citizenJob(m.row, m.age) };
        if (m.row.work) { sp.work = m.row.work; if (m.row.townKind === 'shopkeeper' || m.row.townKind === 'keeper') sp.owner = true; }
        if (m.row.newcomer) sp.newcomer = true;
        idx[m.row.pid] = specs.length;
        specs.push(sp);
      }
      const at = (m) => base + all.indexOf(m);
      if (g.couple) rels.push([at(g.members[0]), at(g.members[1]), 'spouse']);
      for (const k of g.kids) {
        for (const p of g.members) {
          const gap = p.age - k.age;
          rels.push([at(p), at(k), gap >= 18 && gap < 50 ? 'parent' : gap >= 50 ? 'grand' : 'family']);
        }
      }
      for (let i = 0; i < g.kids.length; i++) for (let j = i + 1; j < g.kids.length; j++) rels.push([at(g.kids[i]), at(g.kids[j]), 'sibling']);
    }
  }
  return { households, specs, rels, index: idx };
}

function pidNum(pid) { const m = /(\d+)$/.exec(String(pid)); return m ? +m[1] : 0; }
