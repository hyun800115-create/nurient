// A stand-in piece of world for the story lab and the Node tests: a small town square (our 마을회관, a school, a
// clinic, a café, the fountain, a playground, homes, the memorial garden) and ~130 people with TownSim-like days
// (the same act names, place ids 'bld:spot', 25 s clock hours), plus the named villagers. Pure: no Phaser, no
// Node-only modules (the lab page imports it too). Positions are lab-world px.
import { TOWN_NAMES } from '../../../src/data/strings.js';
import { PERSONAS, RELATIONS } from '../../../src/chat/personas.js';

export const HOUR = 25, DAY = 600;

/** the stand-in buildings (key = the real asset key, x / y = lab px of the sprite anchor) */
export const BUILDINGS = [
  { id: 'v_hall', key: 'town_hall', role: 'hall', x: 1180, y: 760, ours: true },
  { id: 't_school', key: 'school', role: 'school', x: 2060, y: 700 },
  { id: 't_clinic', key: 'clinic', role: 'clinic', x: 2620, y: 1000 },
  { id: 't_cafe', key: 'cafe', role: 'shop', x: 1900, y: 1250 },
  { id: 't_book', key: 'bookstore', role: 'shop', x: 2350, y: 1450 },
  { id: 't_fountain', key: 'park_fountain', role: 'park', x: 1460, y: 1330 },
  { id: 't_play', key: 'playground', role: 'play', x: 900, y: 1500 },
  { id: 't_apt1', key: 'apartment_a', role: 'home', x: 520, y: 900 },
  { id: 't_apt2', key: 'apartment_b', role: 'home', x: 3000, y: 1350 },
  { id: 't_th1', key: 'townhouse_a', role: 'home', x: 650, y: 1900 },
  { id: 't_th2', key: 'townhouse_b', role: 'home', x: 1150, y: 2050 },
  { id: 't_th3', key: 'townhouse_c', role: 'home', x: 2750, y: 1850 },
  { id: 'v_garden', key: 'memorial_garden', role: 'memorial', x: 2050, y: 1880, ours: true },
];
export const BYID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
/** our village's VillageLife areas as the kit reports them (patch S7: { id: 'va:<area>', key: 'village_area' }), far from
 *  the town square: the named villagers spend the day here when `villagers: 'village'` (the game's real situation, H9) */
export const VILLAGE_AREAS = [
  { id: 'va:plaza_s', key: 'village_area', role: 'plaza', x: -2400, y: 1210, ours: true },
  { id: 'va:notice', key: 'village_area', role: 'plaza', x: -2870, y: 870, ours: true },
  { id: 'va:green_fire', key: 'village_area', role: 'plaza', x: -2610, y: 1610, ours: true },
];

const VILLAGERS = ['npc_aunt', 'npc_kid_girl', 'npc_kid_prankster', 'npc_teen_girl', 'npc_uncle', 'npc_grandma', 'npc_grandpa', 'npc_clerk_a', 'npc_blacksmith', 'npc_kid_boy',
  'npc_bard', 'npc_doctor', 'npc_postman', 'npc_chef'];
const COUNTS = { student: 22, teen: 8, shopkeeper: 6, civic: 12, adult: 46, elder: 26, builder: 3 };
const CIVIC = ['teacher', 'teacher', 'teacher', 'police', 'police', 'postal', 'doctor', 'nurse', 'fire', 'mayor', 'station', 'teacher'];
const WORK = { teacher: 't_school', police: 'v_hall', postal: 'v_hall', doctor: 't_clinic', nurse: 't_clinic', fire: 'v_hall', mayor: 'v_hall', station: 'v_hall' };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** the stand-in town: { buildings, spots, roster, relations, citizens, whereabouts(T, out), chronicle } */
export function makeStandInTown(opts = {}) {
  const seed = opts.seed || 2611;
  const r = mulberry32(seed);
  const scale = opts.scale || 1;
  const citizens = [];
  const homes = ['t_apt1', 't_apt2', 't_th1', 't_th2', 't_th3'];
  const cap = { t_apt1: 46, t_apt2: 40, t_th1: 14, t_th2: 14, t_th3: 14 };
  let id = 0;
  const kinds = [];
  for (const [k, n] of Object.entries(COUNTS)) for (let i = 0; i < Math.round(n * scale); i++) kinds.push(k);
  let civK = 0, shopK = 0;
  // household-ish placement: walk the homes round-robin so families can form (adults, then kids)
  const order = kinds.slice().sort((a, b) => ['adult', 'elder', 'shopkeeper', 'civic', 'builder', 'student', 'teen'].indexOf(a) - ['adult', 'elder', 'shopkeeper', 'civic', 'builder', 'student', 'teen'].indexOf(b));
  let hk = 0;
  for (const kind of order) {
    const c = { id: id++, kind, role: null, name: TOWN_NAMES.ko[id % 120], nameEn: TOWN_NAMES.en[id % 120], age: 30, home: null, work: null, jit: r() };
    if (kind === 'student') c.age = 7 + Math.floor(r() * 6);
    else if (kind === 'teen') c.age = 13 + Math.floor(r() * 5);
    else if (kind === 'elder') c.age = 66 + Math.floor(r() * 22);
    else if (kind === 'shopkeeper') { c.age = 28 + Math.floor(r() * 30); c.work = shopK++ % 2 ? 't_book' : 't_cafe'; }
    else if (kind === 'civic') { c.role = CIVIC[civK++ % CIVIC.length]; c.work = WORK[c.role]; c.age = 26 + Math.floor(r() * 34); }
    else if (kind === 'builder') c.age = 30 + Math.floor(r() * 25);
    else c.age = 22 + Math.floor(r() * 40);
    // a few very old elders (wishes, the gentle farewell)
    if (kind === 'elder' && id % 7 === 0) c.age = 82 + Math.floor(r() * 5);
    let h = null;
    for (let k = 0; k < homes.length; k++) { const cand = homes[(hk + k) % homes.length]; if (cap[cand] > 0) { h = cand; break; } }
    hk++;
    c.home = h || 't_apt1'; cap[c.home]--;
    c.sex = null;
    citizens.push(c);
  }
  const roster = [];
  for (const key of VILLAGERS) { const p = PERSONAS[key]; if (p) roster.push({ pid: 'v:' + key, kind: 'villager', key, persona: { name: p.name, short: p.short, en: p.en, group: p.group, sex: p.sex, age: p.age, job: p.job }, home: 'v_hall' }); }
  for (const c of citizens) roster.push({ pid: 't:' + c.id, kind: 'citizen', townKind: c.kind, role: c.role, name: c.name, nameEn: c.nameEn, age: c.age, home: c.home, work: c.work, workKind: c.work === 't_cafe' ? 'cafe' : c.work === 't_book' ? 'bookstore' : null, sex: c.sex });
  const spots = [];
  const inVillage = opts.villagers === 'village';
  const extras = [];                 // story children's bodies (TownSim nb.extra in the game)
  const gone = new Set();            // people who left for good (TownSim nb.gone)
  return {
    buildings: BUILDINGS, spots, roster, relations: RELATIONS, citizens, extras, gone,
    villageAreas: inVillage ? VILLAGE_AREAS : [],
    /** a story child's body (S6 addCitizen): the pid the story asked for, kept in the roster across a reload */
    addStoryChild(spec) {
      const pid = spec.pid || ('k:' + spec.sid);
      if (roster.some((r) => r.pid === pid)) return pid;
      const like = spec.home && spec.home.like ? roster.find((r) => r.pid === spec.home.like) : null;
      const row = { pid, kind: 'citizen', townKind: spec.townKind || (spec.age < 7 ? 'toddler' : 'student'), name: '아이', nameEn: 'Kid', age: spec.age, home: like ? like.home : 't_apt1', sid: spec.sid };
      roster.push(row);
      extras.push(row);
      return pid;
    },
    /** moved away or departed: the body is gone for good (and stays gone after a reload) */
    retire(pid) {
      gone.add(pid);
      const i = roster.findIndex((r) => r.pid === pid);
      if (i >= 0) roster.splice(i, 1);
    },
    chronicle: { flags: { firstTrain: true, townVisit: true }, rank: 2, built: ['town_hall'], shops: [{ ko: '눈꽃 카페', en: 'Snowflake Café', id: 't_cafe' }] },
    /** where every citizen is at T: rows [pid, building | null, act, state, busy] (TownSim-like) */
    whereabouts(T, out) {
      const h = ((T / HOUR) % 24 + 24) % 24;
      for (const c of citizens) {
        if (gone.has('t:' + c.id)) continue;
        const seg = segmentOf(c, h);
        out.push(['t:' + c.id, seg[1], seg[0], seg[2], null]);
      }
      // story children: home, the playground in the afternoon
      for (const r of extras) if (!gone.has(r.pid)) out.push(h >= 13 && h < 17 ? [r.pid, 't_play', 'play', 'out', null] : [r.pid, r.home, h < 8 || h >= 20 ? 'sleep' : 'home', 'in', null]);
      const day = h >= 8 && h < 20;
      if (inVillage) {
        // our village: the named villagers spend the day in the village areas (S7 rows), at home at night
        for (const key of VILLAGERS) out.push(['v:' + key, day ? VILLAGE_AREAS[key.length % 3].id : null, day ? 'bench' : 'sleep', day ? 'out' : 'in', null]);
        return out;
      }
      // the named villagers stay around the square in the daytime
      for (const key of VILLAGERS) out.push(['v:' + key, day ? (key.length % 3 === 0 ? 't_fountain' : key.length % 3 === 1 ? 't_cafe' : 'v_hall') : 'v_hall', day ? 'bench' : 'sleep', day ? 'out' : 'in', null]);
      return out;
    },
  };
}

/** [act, building, state] for citizen c at hour h (TownSim-like routines, simplified) */
export function segmentOf(c, h) {
  const j = c.jit * 0.4;
  const home = c.home;
  const walk = (s) => h - s < 0.25;
  const at = (act, bld, st, s) => [act, walk(s) ? null : bld, walk(s) ? 'walk' : st];
  switch (c.kind) {
    case 'student': case 'teen':
      if (h < 7.2 + j * 0.3) return ['sleep', home, 'in'];
      if (h < 8) return at('school', 't_school', 'out', 7.2 + j * 0.3);
      if (h < 10.5) return ['class', 't_school', 'in'];
      if (h < 11) return ['recess', 't_school', 'out'];
      if (h < 15) return ['class', 't_school', 'in'];
      if (h < 17.5 + j) return at('play', c.kind === 'teen' ? 't_cafe' : (c.id % 2 ? 't_play' : 't_fountain'), 'out', 15);
      return at('home', home, 'in', 17.5 + j);
    case 'shopkeeper':
      if (h < 7.6 + j * 0.2) return ['sleep', home, 'in'];
      if (h < 18) return at('work', c.work, 'out', 7.6 + j * 0.2);
      return at('home', home, 'in', 18);
    case 'civic':
      if (h < 8.2 + j * 0.2) return ['sleep', home, 'in'];
      if (h < 16.8) return at('work', c.work, c.role === 'teacher' || c.role === 'doctor' ? 'in' : 'out', 8.2 + j * 0.2);
      if (h < 17.6) return at('walk', 't_fountain', 'out', 16.8);
      return at('home', home, 'in', 17.6);
    case 'elder':
      if (h < 7.5 + j) return ['sleep', home, 'in'];
      if (h < 10.5) return at('bench', c.id % 2 ? 't_fountain' : 'v_garden', 'out', 7.5 + j);
      if (h < 11.5) return at('cafe', 't_cafe', 'out', 10.5);
      if (h < 12.3 && c.id % 5 === 0) return at('clinic', 't_clinic', 'out', 11.5);
      if (h < 16 + j) return at('bench', 't_fountain', 'out', 12.3);
      if (h < 17) return at('errand', 't_book', 'out', 16 + j);
      return at('home', home, 'in', 17);
    default: {
      if (h < 7 + j) return ['sleep', home, 'in'];
      if (h < 10) return ['home', home, 'in'];
      if (h < 11.5) return at('cafe', c.id % 3 ? 't_cafe' : 't_book', 'out', 10);
      if (h < 14) return at('home', home, 'in', 11.5);
      if (h < 16 + j) return at('walk', c.id % 2 ? 't_fountain' : 't_play', 'out', 14);
      if (h < 19.5) return at('errand', c.id % 3 ? 't_cafe' : 'v_hall', 'out', 16 + j);
      return at('home', home, 'in', 19.5);
    }
  }
}
