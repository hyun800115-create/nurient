// (v4.3) 마을 주민 창 — the residents' data and rules, Node only (no browser):
//   node tools/test/residents.test.mjs
// settler identities are fixed by (save id, number) and plausible; the named villagers' table matches the chat persona
// cards it was copied from; every job has a wage (the story engine's where it has one); the 가치 추구 scoring
// reproduces the spec's tables; every string exists in ko and en; every row of the 지금 하는 일 mapping (spec §4) is
// reached by a synthetic resident / event / operator / clerk / settler hour; homes and families follow the rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const imp = (p) => import(path.join(ROOT, p));
const { settlerIdentity, partnerOf, fnv } = await imp('src/systems/residents/identity.js');
const { NAMED, FAMILY, FRIENDS, JOB, SETTLER_JOBS, VALUES, AREA } = await imp('src/systems/residents/data.js');
const { RES_STR, rt } = await imp('src/systems/residents/strings.js');
const { Roster, scoreValues } = await imp('src/systems/residents/roster.js');
const { PERSONAS, RELATIONS } = await imp('src/chat/personas.js');
const { JOBS } = await imp('src/story/engine/data/places.js');
const { WORLD } = await imp('src/data/world.js');
const { CAST } = await imp('src/voice/cast.js');
const { Assets } = await imp('src/core/Assets.js');
const { setLang } = await imp('src/data/strings.js');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

// the characters' manifests (names, roles, traits, portraits) as the game merges them
for (const f of ['characters', 'villagers', 'villagers2', 'villagers3']) {
  try { Object.assign(Assets.m.characters, JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', f, 'manifest.json'), 'utf8')).characters); } catch (e) { /* */ }
}
const MOVED = [];
for (const id in WORLD.life.moveIns) for (const k of WORLD.life.moveIns[id]) if (!/^pet_/.test(k)) MOVED.push(k);

console.log('settler identities');
{
  const a = settlerIdentity('22kf49zwtx09', 3), b = settlerIdentity('22kf49zwtx09', 3);
  ok(a === b && a.name === '홍혜원' && a.age === 39 && a.sex === 'f' && a.job === 'cook', 'the same settler twice, and the spec\'s s:3 홍혜원 (여 39, 요리사)', a);
  // across processes
  const out = execFileSync(process.execPath, ['-e', `import(${JSON.stringify(path.join(ROOT, 'src/systems/residents/identity.js'))}).then(m => process.stdout.write(JSON.stringify(m.settlerIdentity('abc123', 17))))`], { encoding: 'utf8' });
  ok(out === JSON.stringify(settlerIdentity('abc123', 17)), 'the same identity in another process');
  const spec = [['s:1', '최연주', 'f', 41, 'dock'], ['s:2', '안창민', 'm', 43, 'hall_clerk'], ['s:4', '오정우', 'm', 35, 'shopkeeper'], ['s:5', '김정은', 'f', 51, 'hunter'], ['s:7', '변나연', 'f', 39, 'miner']];
  ok(spec.every(([pid, n, sx, ag, jb]) => { const s = settlerIdentity('22kf49zwtx09', +pid.slice(2)); return s.name === n && s.sex === sx && s.age === ag && s.job === jb; }), 'the 46-min fixture\'s settlers are the spec\'s (§1.4 table)');
  let uniq = true, couples = true, ages = true, looks = true, en = true;
  for (const cid of ['22kf49zwtx09', 'abc123', 'zzzz', 'q1', 'village']) {
    const seen = new Set();
    for (let i = 1; i <= 200; i++) {
      const s = settlerIdentity(cid, i);
      if (seen.has(s.name)) uniq = false;
      seen.add(s.name);
      if (s.age < 23 || s.age > 61) ages = false;
      if (s.look !== (s.sex === 'f' ? 'villager_a' : 'villager_b')) looks = false;
      if (!/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(s.nameEn)) en = false;
      if (i % 2 === 0) { const p = settlerIdentity(cid, i - 1); if (p.sex === s.sex || Math.abs(p.age - s.age) > 6 || s.partner !== i - 1) couples = false; }
    }
  }
  ok(uniq, 'names are unique within 200 settlers (5 villages)');
  ok(couples, 'couples (2k-1, 2k) are a woman and a man at most 6 years apart');
  ok(ages, 'settlers are 23–61');
  ok(looks, 'women wear villager_a, men villager_b');
  ok(en, 'every English name is "Given Surname"');
  ok(partnerOf(1, 1) === 0 && partnerOf(1, 2) === 2 && partnerOf(2, 2) === 1 && partnerOf(3, 4) === 4, 'household partners (an odd last one lives alone)');
  ok(SETTLER_JOBS.length === 18 && SETTLER_JOBS.filter((j) => j[0] === 'none').length === 1, 'the settler job table has 18 rows, one of them none');
}

console.log('named villagers = the persona cards');
{
  let same = true, bad = [];
  for (const k of MOVED) {
    const d = NAMED[k], p = PERSONAS[k];
    if (!d || !p) { same = false; bad.push(k + ' missing'); continue; }
    for (const f of ['name', 'short', 'job', 'home']) if (d.ko[f] !== p[f]) { same = false; bad.push(k + '.' + f); }
    for (const f of ['traits', 'likes']) if (JSON.stringify(d.ko[f]) !== JSON.stringify(p[f])) { same = false; bad.push(k + '.' + f); }
    if (d.en.traits.length !== d.ko.traits.length || d.en.likes.length !== d.ko.likes.length) { same = false; bad.push(k + ' en counts'); }
  }
  ok(same, 'every moved-in villager\'s name / short / job / home / traits / likes equal personas.js', bad);
  const full = MOVED.every((k) => { const d = NAMED[k]; return d && d.age > 0 && /^[fm]$/.test(d.sex) && JOB[d.jobId] && Array.isArray(d.homeAt) && d.homeAt.length && d.values.length === 2; });
  ok(full, 'each has an age, a sex, a job with a wage row, a home point and two values');
  const FEM = /^(adult_f|elder_f|kid_girl|sweet)$/;
  const sexes = MOVED.filter((k) => { const d = NAMED[k], p = PERSONAS[k]; const want = p.sex || (CAST[k] ? (FEM.test(CAST[k]) ? 'f' : 'm') : d.sex); return d.sex !== want; });
  ok(!sexes.length, 'sexes agree with the persona card or the voice cast', sexes);
  ok(MOVED.every((k) => !PERSONAS[k].age || PERSONAS[k].age === NAMED[k].age), 'ages agree with the persona card where it has one');
  const fams = FAMILY.concat(FRIENDS).every(([a, b]) => NAMED[a] && NAMED[b]);
  ok(fams, 'family and friend ties are between named villagers');
  const rel = FRIENDS.every(([a, b]) => RELATIONS.some((r) => ((r[0] === a && r[1] === b) || (r[0] === b && r[1] === a)) && r[2] >= 60));
  ok(rel, 'every 친한 사이 is a RELATIONS pair with affinity ≥ 60');
  ok(RELATIONS.some((r) => r[0] === 'npc_grandma' && r[1] === 'npc_grandpa' && r[3] === '부부'), 'grandpa and grandma are married in the chat too');
}

console.log('wages');
{
  const ids = new Set(Object.values(NAMED).map((d) => d.jobId).concat(SETTLER_JOBS.map((j) => j[0])));
  ok([...ids].every((id) => JOB[id] && Number.isFinite(JOB[id].day)), 'every job a person can have has a daily wage row', [...ids].filter((id) => !JOB[id]));
  const backed = Object.keys(JOB).filter((id) => JOBS[id] && JOB[id].pay === 'salary');
  ok(backed.every((id) => JOB[id].day === JOBS[id].wage), 'salaries the story engine knows equal its JOBS table (' + backed.length + ' jobs)', backed.filter((id) => JOB[id].day !== JOBS[id].wage));
  ok(JOB.retired.day === 12 && JOB.retired.pay === 'pension' && JOB.student.day === 2 && JOB.student.pay === 'pocket', 'pension 12 a day, pocket money 2 a day (econ.js nightly)');
  ok(JOB.doctor.day === 48 && JOB.captain.day === 40 && JOB.hunter.day === 32 && JOB.herbalist.day === 28 && JOB.model.day === 26, 'the spec\'s added jobs (captain 40, hunter 32, herbalist 28, model 26)');
  ok(SETTLER_JOBS.every(([id]) => id === 'none' || (JOB[id].h && JOB[id].at)), 'every settler job has working hours and a workplace');
}

console.log('가치 추구');
{
  const want = { 's:1': ['friendship', 'diligence'], 's:2': ['friendship', 'adventure'], 's:3': ['food', 'adventure'], 's:4': ['family', 'diligence'], 's:5': ['nature', 'money'], 's:6': ['art', 'nature'], 's:7': ['adventure', 'food'] };
  const R = new Roster(fakeGs({ settlers: 7 }));
  const got = {};
  for (let i = 1; i <= 7; i++) got['s:' + i] = R.values(R.get('s:' + i));
  ok(JSON.stringify(got) === JSON.stringify(want), 'the 46-min fixture\'s settlers score the spec\'s values (§7.2)', got);
  ok(VALUES.length === 9 && VALUES.every((v) => v.ko && v.en && v.line.ko && v.line.en && v.kw.length), 'nine values, each with ko / en names and a line');
  ok(Object.values(NAMED).every((d) => d.values.every((v) => VALUES.some((q) => q.id === v))), 'every hand-assigned value exists');
  ok(JSON.stringify(scoreValues('s:9', ['x'])) === JSON.stringify(scoreValues('s:9', ['x'])), 'ties break the same way every time');
}

console.log('strings');
{
  const ko = Object.keys(RES_STR.ko), en = Object.keys(RES_STR.en);
  ok(ko.length === en.length && ko.every((k) => k in RES_STR.en), 'every key in ko is in en (' + ko.length + ')', ko.filter((k) => !(k in RES_STR.en)));
  const src = fs.readFileSync(path.join(ROOT, 'src/systems/residents/roster.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/scenes/ResidentsPanel.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/systems/residents/Follow.js'), 'utf8');
  const used = [...new Set([...src.matchAll(/rt\('([a-z0-9_]+)'/g)].map((m) => m[1]))].filter((k) => !k.endsWith('_'));
  ok(used.every((k) => k in RES_STR.ko), 'every rt() key used exists (' + used.length + ')', used.filter((k) => !(k in RES_STR.ko)));
  const work = SETTLER_JOBS.map((j) => j[0]).filter((j) => j !== 'none');
  ok(work.every((j) => ('act_w_' + j) in RES_STR.ko && ('wp_' + JOB[j].at) in RES_STR.ko), 'every settler job has its working text and workplace name');
  ok(Object.keys(AREA).every((a) => WORLD.life.areas[a] || /^west_/.test(a)), 'area names are life areas');
  setLang('ko');
  ok(rt('act_chat', { name: '하린' }) === '하린과 수다 떠는 중' && rt('act_chat', { name: '준' }) === '준과 수다 떠는 중' && rt('act_chat', { name: '할머니' }) === '할머니와 수다 떠는 중', 'particles follow the name (하린과 · 할머니와)');
  ok(rt('act_go', { area: '광장' }) === '광장으로 가는 중' && rt('act_go', { area: '놀이터' }) === '놀이터로 가는 중', '(으)로 after an area');
}

console.log('지금 하는 일 — every row of the mapping');
{
  setLang('ko');
  const gs = fakeGs({ settlers: 4 });
  const R = new Roster(gs);
  const life = gs.life;
  const A = { key: '' };
  const act = (p) => R.action(p, {}).key;
  const named = (k) => R.get('v:' + k);
  const mk = (k, o) => { const r = Object.assign({ key: k, alive: true, x: 100, y: 100, state: 'idle', animName: 'idle', event: null, job: null, seat: null, area: null, extraFx: null }, o); life.byKey[k] = r; return r; };
  const cases = [];
  const ev = (kind, extra, members) => Object.assign({ kind, members: members || [] }, extra);
  const aunt = named('npc_aunt'), kid = named('npc_kid_girl');
  const other = mk('npc_kid_girl', {});
  // events
  let r = mk('npc_aunt', {}); r.event = ev('party'); cases.push(['party', act(aunt), 'act_party']);
  const con = ev('concert', { phase: 'go' }); con.bard = r; r.event = con; cases.push(['bard go', act(aunt), 'act_bard_go']);
  con.phase = 'play'; cases.push(['bard play', act(aunt), 'act_bard_play']);
  con.phase = 'bow'; cases.push(['bard bow', act(aunt), 'act_bard_bow']);
  con.bard = other; r.seat = {}; cases.push(['concert seat', act(aunt), 'act_concert_seat']);
  r.seat = null; r.state = 'move'; cases.push(['concert go', act(aunt), 'act_concert_go']);
  r.state = 'idle'; r.animName = 'dance'; cases.push(['concert dance', act(aunt), 'act_concert_dance']);
  r.animName = 'idle'; cases.push(['concert listen', act(aunt), 'act_concert']);
  const chat = ev('chat', {}, [r, other]); r.event = chat; other.event = chat;
  cases.push(['chat', act(aunt), 'act_chat']);
  ok(R.action(aunt, {}).text === '하린과 수다 떠는 중', 'a chat names the other one: 「하린과 수다 떠는 중」', R.action(aunt, {}).text);
  other.event = null;
  const sb = ev('snowball', { phase: 'chase', th: r, tg: other }); r.event = sb; cases.push(['snow run', act(aunt), 'act_snow_run']);
  sb.th = other; sb.tg = r; cases.push(['snow chase', act(aunt), 'act_snow_chase']);
  sb.phase = 'hit'; cases.push(['snowball', act(aunt), 'act_snowball']);
  const tg = ev('tag', { it: r }); r.event = tg; cases.push(['tag it', act(aunt), 'act_tag_it']);
  tg.it = other; cases.push(['tag', act(aunt), 'act_tag']);
  r.event = ev('snowman'); cases.push(['snowman', act(aunt), 'act_snowman']);
  r.event = ev('snowmanBreak'); cases.push(['snowman break', act(aunt), 'act_snowman_break']);
  r.event = null;
  // jobs
  r.job = { kind: 'arrive', house: {} }; r.state = 'move'; cases.push(['arrive house', act(aunt), 'act_arrive_house']);
  r.job = { kind: 'arrive', phase: 'hello' }; cases.push(['hello', act(aunt), 'act_hello']);
  r.job = { kind: 'arrive' }; r.state = 'idle'; cases.push(['arrive', act(aunt), 'act_arrive']);
  const area = life.areas.beach_w;
  r.area = area;
  r.job = { kind: 'stay', phase: 'sitting' }; r.seat = {}; r.extraFx = {}; cases.push(['doze', act(aunt), 'act_doze']);
  r.extraFx = null; cases.push(['sit', act(aunt), 'act_sit']);
  r.seat = null; r.job = { kind: 'stay', phase: 'toSeat' }; cases.push(['to seat', act(aunt), 'act_to_seat']);
  r.job = { kind: 'stay', phase: 'walk', warm: { x: 0, y: 0 } }; r.state = 'move'; cases.push(['warm go', act(aunt), 'act_warm_go']);
  r.job = { kind: 'stay', phase: 'walk', read: {} }; cases.push(['read', act(aunt), 'act_read']);
  r.job = { kind: 'stay', phase: 'here' }; r.state = 'move'; r.animName = 'skate'; cases.push(['skate', act(aunt), 'act_skate']);
  r.state = 'act'; r.animName = 'shiver'; cases.push(['shiver', act(aunt), 'act_shiver']);
  r.animName = 'wave'; cases.push(['wave', act(aunt), 'act_wave']);
  r.animName = 'idle'; r.state = 'idle'; r.x = area.fire.x + 60; r.y = area.fire.y + 10; cases.push(['warm', act(aunt), 'act_warm']);
  r.x = 900; r.y = 900; r.job = { kind: 'stay', phase: 'travel' }; r.state = 'move'; cases.push(['go', act(aunt), 'act_go']);
  ok(R.action(aunt, {}).text === '바닷가 모닥불로 가는 중', '…with the area\'s name: 「바닷가 모닥불로 가는 중」', R.action(aunt, {}).text);
  r.job = { kind: 'stay', phase: 'walk' }; cases.push(['stroll', act(aunt), 'act_stroll']);
  r.state = 'idle'; r.job = { kind: 'stay', phase: 'here' }; cases.push(['relax', act(aunt), 'act_relax']);
  r.job = { kind: 'idle' }; cases.push(['idle', act(aunt), 'act_break']);
  r.job = null; cases.push(['no job', act(aunt), 'act_break']);
  // operator / clerk bodies (she took the job: her Resident is gone)
  r.alive = false;
  delete life.byKey.npc_aunt;
  gs.keysInUse.add('npc_aunt');
  const st = { id: 'bakery', working: true, inStack: { full: false }, outStack: { full: false } };
  const op = { key: 'npc_aunt', alive: true, state: 'go', x: 1392, y: 1207 };
  st.op = { id: 'bakery', operator: op, station: st };
  gs.stationList.push(st);
  cases.push(['op go', act(aunt), 'act_op_go']);
  op.state = 'post'; cases.push(['op working', act(aunt), 'act_op_bakery']);
  ok(R.jobText(aunt) === '빵집 · 제빵사', 'an operator\'s job is the station: 「빵집 · 제빵사」', R.jobText(aunt));
  st.working = false; st.inStack.full = true; st.outStack.full = true; cases.push(['op full', act(aunt), 'act_op_full']);
  st.inStack.full = false; cases.push(['op wait', act(aunt), 'act_op_wait']);
  gs.stationList.length = 0;
  const reg = { clerkKeys: ['npc_aunt'], clerk: { key: 'npc_aunt', alive: true, state: 'go', x: 1, y: 1 }, seller: { payTarget: () => null } };
  gs.market = { register: reg, stock: { count: 0 } };
  R.regsT = -1;
  cases.push(['clerk go', act(aunt), 'act_clerk_go']);
  reg.clerk.state = 'post'; cases.push(['clerk wait', act(aunt), 'act_clerk_wait']);
  reg.seller.payTarget = () => ({ x: 0, y: 0 }); cases.push(['clerk serve', act(aunt), 'act_clerk_serve']);
  gs.market = { x: 1500, y: 900, stock: { count: 5 } }; R.regsT = -1; gs.keysInUse.clear();
  // no body
  life.queue.push({ key: 'npc_aunt' }); cases.push(['soon', act(aunt), 'act_soon']);
  life.queue.length = 0;
  gs.v4.clock.h = 14; cases.push(['home', act(aunt), 'act_home']);
  gs.v4.clock.h = 23; cases.push(['night', act(aunt), 'act_sleep']);
  ok(R.action(aunt, {}).where === '집에서 자는 중', 'a bodiless villager at night: the chip says 「집에서 자는 중」');
  // settlers: s:3 cook 10-20, s:4 shopkeeper 9-18 (hall + restaurant + market built), s:1 dock 7-16 (warehouse not built)
  const s3 = R.get('s:3'), s1 = R.get('s:1');
  gs.v4.clock.h = 3; cases.push(['settler 3 h', act(s3), 'act_sleep']);
  gs.v4.clock.h = 7; cases.push(['settler 7 h breakfast', act(s3), 'act_breakfast']);
  gs.v4.clock.h = 9; cases.push(['settler 9 h home', act(s3), 'act_home']);
  gs.v4.clock.h = 11; cases.push(['settler at work', act(s3), 'act_w_cook']);
  ok(R.action(s3, {}).where === '큰 식당 안에서 일하는 중', 'the follow chip: 「큰 식당 안에서 일하는 중」', R.action(s3, {}).where);
  gs.v4.clock.h = 12.5; cases.push(['settler lunch', act(s3), 'act_lunch_rest']);
  gs.v4.clock.h = 11; cases.push(['settler no workplace', act(s1), 'act_seek']);
  ok(R.jobText(s1) === '아직 일자리를 찾는 중', 'a settler whose workplace is not built: 「아직 일자리를 찾는 중」');
  const eve = new Set();
  for (let d = 0; d < 40; d++) { gs.v4.clock.d = d; gs.v4.clock.h = 20.5; eve.add(act(s3)); }
  ok(['act_eve_market', 'act_eve_dinner', 'act_eve_fire', 'act_home'].every((k) => eve.has(k)), 'evenings: market, dinner, campfire, home over 40 days', [...eve]);
  gs.v4.clock.d = 2; gs.v4.clock.h = 20.5;
  ok(act(s3) === act(s3), 'an evening plan is stable within the evening');
  gs.v4.clock.on = false;
  cases.push(['no clock: 11 h', act(s3), 'act_w_cook']);
  gs.v4.clock.on = true;
  const bad = cases.filter((c) => c[1] !== c[2]);
  ok(!bad.length, cases.length + ' cases map to the spec\'s rows', bad);
  const keys = new Set(cases.map((c) => c[2]));
  ok([...keys].every((k) => k in RES_STR.ko && k in RES_STR.en), 'each of them has ko and en words');
}

console.log('homes, families, happiness, profile words');
{
  setLang('ko');
  const gs = fakeGs({ settlers: 7, houses: [['w_s3', 'house_c', 2], ['w_s1', 'house_c', 2], ['w_s2', 'house_a', 3]] });
  const R = new Roster(gs);
  const h = (pid) => R.homeText(R.get(pid));
  ok(h('s:1') === '뾰족집 1호' && h('s:2') === '뾰족집 1호' && h('s:3') === '통나무집 1호' && h('s:4') === '통나무집 1호' && h('s:5') === '뾰족집 2호' && h('s:6') === '뾰족집 2호' && h('s:7') === '통나무집 1호',
    'the 46-min fixture\'s settlers live where the spec says (houses by plot id, couples together)', [1, 2, 3, 4, 5, 6, 7].map((i) => h('s:' + i)));
  ok(R.family(R.get('s:2')).map((q) => q.p.pid).join() === 's:1' && R.family(R.get('s:7')).length === 0, 's:2\'s spouse is s:1; s:7 has no partner yet');
  ok(R.housemates(R.get('s:7')).map((q) => q.pid).sort().join() === 's:3,s:4', 's:7 shares 통나무집 1호 with s:3 and s:4');
  const gp = R.get('v:npc_grandpa');
  ok(R.homeText(gp) === '천막 마당' && R.get('v:npc_grandma').home === gp.home, 'before the first houses the tent family lives in a tent; grandma lives with grandpa');
  ok(R.family(gp).map((q) => q.p.pid + ':' + q.rel).join() === 'v:npc_grandma:배우자 (아내),v:npc_kid_prankster:손자,v:npc_kid_boy:손자', 'grandpa\'s family: wife, grandsons', R.family(gp).map((q) => q.p.pid + ':' + q.rel));
  const gs2 = fakeGs({ settlers: 2, houses: [['h43_2', 'house_a', 3], ['w_s1', 'house_c', 2]] });
  const R2 = new Roster(gs2);
  ok(R2.homeText(R2.get('v:npc_grandpa')) === '통나무집 (첫 집)' && R2.homeText(R2.get('s:1')) === '뾰족집 1호', 'the first house holds its family (and grandma: 4 in 3 beds), settlers go to the next house');
  const hap = R.happiness(R.get('s:1'), {});
  ok(hap.score >= 5 && hap.score <= 99 && hap.reasons.length >= 2 && hap.reasons.length <= 3, 'happiness 5–99 with 2–3 reasons (' + hap.score + ': ' + hap.reasons.map((k) => R.reasonText(k)).join(' · ') + ')');
  ok(JSON.stringify(R.happiness(R.get('s:1'), {})) === JSON.stringify(hap), 'happiness is the same for the same state');
  gs.market.stock.count = 0;
  const hap2 = R.happiness(R.get('s:1'), {});
  ok(hap2.score === hap.score - 18 && hap2.reasons.indexOf('h_hungry') >= 0, 'no food anywhere: −18 and 「먹을 게 떨어져서 배가 고파요」 among the reasons', hap2);
  const w = R.wage(R.get('s:3'), {});
  ok(w.pay === 'salary' && w.day === 34 && w.month === 1020, 's:3 (요리사): 1,020 coins a month, 34 a day');
  ok(R.wage(R.get('v:npc_grandpa'), {}).pay === 'pension' && R.wage(R.get('v:npc_kid_girl'), {}).pay === 'pocket' && R.wage(R.get('v:npc_yellow'), {}).pay === 'none', 'grandpa a pension, Harin pocket money, the yellow parka no wage');
  ok(R.taxPerDay() === 12, 'with the hall: 12 coins of tax a day (1.2 a minute × 10 minutes)');
  ok(R.movedText(R.get('v:npc_aunt')) === '처음부터 이 마을에 살았어요' && R.movedText(R.get('v:npc_bard')) === '나무꾼을 고용한 뒤에 이사 왔어요' && R.movedText(R.get('s:2')) === '2번째 이주민 · 빈 집으로 이사 왔어요', '이사 온 때');
  ok(R.chiefText(R.get('v:npc_grandpa')) === '아는 사이' && R.chiefText(R.get('v:npc_aunt')) === '처음 본 사이' && R.chiefText(R.get('s:1')) === '아직 인사만 한 사이', '촌장님과의 사이 without a chat record (elder 18, others 12)');
  R.chatRec = { npc_aunt: { a: 40, t: 3 } };
  ok(R.chiefText(R.get('v:npc_aunt')) === '친구 · 수다 3번', '…and with one: 「친구 · 수다 3번」');
  ok(R.scheduleText(R.get('s:3')) === '10–20시 큰 식당에서 일해요', 's:3\'s day: 「10–20시 큰 식당에서 일해요」', R.scheduleText(R.get('s:3')));
  ok(R.list().length === 25 + 7, 'the list: 25 named + 7 settlers');
  const people = R.list().length;
  gs.civic.settlers = 9;
  ok(R.list().length === people + 2 && R.get('s:9'), 'two more settlers: the list grows at once');
  setLang('en');
  ok(R.shortName(R.get('s:1')) === 'Yeonju Choi' && R.shortName(R.get('v:npc_kid_girl')) === 'Harin' && rt('r_title', { n: 3 }) === 'Villagers (3)', 'English names and words');
  setLang('ko');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// ------------------------------------------------------------------ a small fake game
function fakeGs(o) {
  const areas = {};
  for (const id in WORLD.life.areas) { const a = WORLD.life.areas[id]; areas[id] = { id, x: a.at[0], y: a.at[1], r: a.r || 120, fire: a.fire ? { x: a.fire[0], y: a.fire[1] } : null }; }
  const moved = MOVED.slice();
  const houses = (o.houses || []).map(([id, key, n]) => ({ key, people: n, x: 0, y: 0, door: { x: 10, y: 20 }, site: { id } }));
  const clock = { on: true, h: 11, d: 0, hour() { return this.h; }, day() { return this.d; }, dayLen() { return 600; } };
  return {
    cid: '22kf49zwtx09',
    player: { x: 1000, y: 900 },
    time: { now: 1000 },
    life: { moved, byKey: {}, residents: [], queue: [], areas, areaOpen: () => true, isPetKey: (k) => /^pet_/.test(k), props: {} },
    civic: { settlers: o.settlers || 0, hall: { x: -780, y: 1880 }, restaurant: { x: -480, y: 924, pantry: { count: 0 } }, popBonus: () => 6, happyBonus: () => 8, amenities: [] },
    houses,
    keysInUse: new Set(),
    stationList: [], workshops: [], stations: {}, piles: {}, sites: {},
    market: { x: 1500, y: 900, stock: { count: 5 } },
    progress: { met: (g) => ({ 'b:big_restaurant': true, 'b:town_hall': true, hire_clerk_market: true, zone_forest: true, zone_farm: true, zone_mine: true, zone_hunt: true })[g] || false },
    v4: { clock },
    decorById: {},
  };
}
