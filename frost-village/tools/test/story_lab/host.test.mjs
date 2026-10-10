// story_runtime host tests: adoption, registry, life arc, gates, saves, worker ↔ inline parity, perf.
//   nice -n 15 node --test tools/test/story_lab/host.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { StoryHost, InlineTransport } from '../../../src/story/host.js';
import { PersonRegistry } from '../../../src/story/model/registry.js';
import { adoptRoster, lookSex, baseName } from '../../../src/story/model/adopt.js';
import { sanitizeSlice, makeSlice, SLICE_CAP, StorySideStore } from '../../../src/story/save.js';
import { MODULE } from '../../../src/story/index.js';
import { makeFakePorts, run, MemStorage, DAY, HOUR } from './fakePorts.mjs';
import { NodeWorkerTransport } from './nodeTransport.mjs';
import { createChatBridge } from '../../../src/story/chatBridge.js';
import { StoryBridge } from '../../../src/chat/storyBridge.js';
import { makeStandInTown } from './standin.mjs';

async function boot(opts = {}) {
  const F = makeFakePorts(opts);
  const host = new StoryHost(F.ports, opts.saved, Object.assign({ transport: opts.transport || 'inline' }, opts.hostOpts || {}));
  const r = await host.start();
  return Object.assign(F, { host, start: r });
}

test('adoption: every game person gets one story person, TownSim names are kept, households are valid', async () => {
  const { host, town, start } = await boot({ rank: 1 });
  assert.equal(start.mode, 'inline');
  assert.equal(host.registry.size, town.roster.length);
  const pids = new Set(town.roster.map((r) => r.pid));
  const sids = new Set();
  for (const pid of pids) { const sid = host.registry.sidOf(pid); assert.ok(sid >= 0, 'bound ' + pid); assert.ok(!sids.has(sid), 'one sid each'); sids.add(sid); assert.equal(host.registry.pidOf(sid), pid); }
  const cards = await host.query('cards', { sids: Array.from(sids) });
  for (const row of town.roster.filter((r) => r.kind === 'citizen')) {
    const c = cards[host.registry.sidOf(row.pid)];
    assert.ok(c.name.endsWith(baseName(row.name)), `name kept: ${row.name} -> ${c.name}`);
    assert.equal(c.age, row.age, 'age kept');
  }
  // named villagers are kept (never age, marry, leave)
  const aunt = cards[host.registry.sidOf('v:npc_aunt')];
  assert.ok(aunt.kept && /빵집/.test(aunt.name), aunt.name);
  const fam = await host.query('family', { sid: host.registry.sidOf('v:npc_grandma') });
  assert.equal(fam.spouse, host.registry.sidOf('v:npc_grandpa'), 'grandma and grandpa stay married');
  // households from shared homes: couples, children with parents ≥ 18 years older
  const A = adoptRoster(town.roster, { seed: 2611, relations: town.relations });
  const ages = new Map(A.specs.map((s, i) => [i, s.age]));
  for (const [i, j, k] of A.rels) if (k === 'parent') assert.ok(ages.get(i) - ages.get(j) >= 18);
  assert.ok(A.rels.filter((r) => r[2] === 'spouse').length >= 10, 'couples');
  assert.ok(A.rels.filter((r) => r[2] === 'parent').length >= 10, 'children with parents');
  host.destroy();
});

test('lookSex reads the doll: skirts and long hair, beards', () => {
  assert.equal(lookSex({ parts: ['hair_long', 'bot_longskirt', 'top_coat'] }), 'f');
  assert.equal(lookSex({ parts: ['hair_short', 'fh_beard', 'bot_pants'] }), 'm');
  assert.equal(lookSex({ parts: ['hair_short', 'bot_pants'] }), null);
});

test('the life arc runs with no dead ends: proposal -> wedding -> good news -> birth -> naming -> first steps -> school; cards and the paper', async () => {
  const { host, clock, rec } = await boot({ rank: 2, visible: 30, scale: 1.2 });
  const ops = {};
  host.on('story:life', (d) => { ops[d.op] = (ops[d.op] || 0) + 1; });
  const named = [];
  host.on('ui:card', (c) => { if (c.sheet === 'naming' && c.sids) named.push(c.sids[0]); });
  // 16 game days (2.7 real hours): enough for the first couple's baby to walk at 4 (6 days later)
  await run(host, clock, DAY * 16, { onStep: (i) => { if (i % 2400 === 0) for (const sid of named.splice(0)) host.query('namePool', { sid }).then((p) => p && p[0] && host.nameBaby(sid, p[0])); } });
  console.log('  life ops in 16 days:', JSON.stringify(ops), 'cards', rec.cards.length, 'banners', rec.banners.length, 'papers', rec.chips.length);
  assert.ok(host.director.s.seen.proposal && ops.engaged >= 1, 'the first proposal');
  assert.ok(ops.wedding >= 1, 'a wedding');
  assert.ok(ops.goodnews >= 1, 'good news');
  assert.ok(ops.baby >= 1, 'a baby');
  assert.ok(ops.named >= 1, 'the chief named a baby');
  assert.ok(rec.chips.some((c) => c[0] === 'news'), 'the morning paper after the first wedding');
  assert.ok(rec.banners.some((b) => /결혼식/.test(b.ko)), 'the wedding banner');
  assert.ok(rec.banners.some((b) => /아기/.test(b.ko)), 'the baby banner');
  assert.ok((ops.birthday || 0) > 50, 'birthdays (two-speed aging)');
  const slice = host.serialize();
  assert.ok(JSON.stringify(slice).length <= SLICE_CAP, 'slice ≤ 1 KB');
  assert.ok(slice.life.seen.wedding && slice.life.seen.baby);
  host.destroy();
});

test('gentle farewell: not before the garden or v5 + 180 min, spaced, a card at 09:00 and the garden at 10:00; switched off -> none', async () => {
  const { host, clock, rec } = await boot({ rank: 1 });
  const fw = [];
  host.on('ui:card', (c) => { if (c.kind === 'farewell') fw.push([clock.T, c.ko]); });
  const beats = [];
  host.on('beatEnd', (b) => { if (b.kind === 'farewell') beats.push(clock.T); });
  await run(host, clock, DAY * 45);
  const from = host.farewellFromDay();
  console.log('  farewells:', fw.map(([T, t]) => Math.floor(T / DAY) + 'd ' + ((T % DAY) / HOUR).toFixed(1) + 'h ' + t).join(' | '));
  assert.ok(fw.length >= 1, 'a gentle farewell happened');
  for (const [T, text] of fw) {
    assert.ok(Math.floor(T / DAY) >= from, 'not before v5 + 180 min');
    assert.ok(Math.abs(((T % DAY) / HOUR) - 9) < 0.1, 'the card comes at 09:00');
    assert.ok(/하늘나라로 여행을 떠났어요/.test(text), text);
    assert.ok(!/죽|사망|장례|병/.test(text), 'no death words');
  }
  for (let i = 1; i < fw.length; i++) assert.ok(fw[i][0] - fw[i - 1][0] >= 15 * DAY - HOUR, 'spaced ≥ 15 days');
  assert.equal(beats.length, fw.length, 'a garden farewell beat for each');
  host.destroy();
  const off = await boot({ rank: 1, settings: { lifeFarewell: false } });
  const n = [];
  off.host.on('ui:card', (c) => { if (c.kind === 'farewell') n.push(c); });
  await run(off.host, off.clock, DAY * 45);
  assert.equal(n.length, 0, 'switched off: no farewell card');
  const elders = (await off.host.query('people')).filter((r) => r[2] > 85 && !(r[3] & 4));
  assert.equal(elders.length, 0, 'switched off: the elders stay at 85');
  off.host.destroy();
  const nog = await boot({ rank: 1, garden: false });
  const m = [];
  nog.host.on('ui:card', (c) => { if (c.kind === 'farewell') m.push(c); });
  await run(nog.host, nog.clock, DAY * 40);
  assert.equal(m.length, 0, 'no memorial garden: no farewell');
  nog.host.destroy();
});

test('settlers move in: adopted into a new household, story:move { op: in } names a grown-up by pid', async () => {
  const { host } = await boot({ rank: 2 });
  const moves = [];
  host.on('story:move', (d) => moves.push(d));
  const rows = [
    { pid: 't:s1', kind: 'citizen', townKind: 'adult', name: '한서준', nameEn: 'Han Seojun', age: 36, home: 'h:new1', sex: 'm' },
    { pid: 't:s2', kind: 'citizen', townKind: 'adult', name: '한지유', nameEn: 'Han Jiyu', age: 34, home: 'h:new1', sex: 'f' },
    { pid: 't:s3', kind: 'citizen', townKind: 'student', name: '한하준', nameEn: 'Han Hajun', age: 8, home: 'h:new1', sex: 'm' },
  ];
  const before = host.registry.size;
  host.onFeed({ t: 'settlers', pids: rows.map((r) => r.pid), rows });
  for (let i = 0; i < 50 && !moves.length; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(host.registry.size, before + 3);
  for (const r of rows) assert.ok(host.registry.sidOf(r.pid) >= 0, 'bound ' + r.pid);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].op, 'in');
  assert.ok(moves[0].whoPid === 't:s1' || moves[0].whoPid === 't:s2', 'a grown-up: ' + moves[0].whoPid);
  assert.deepEqual(moves[0].membersPid.slice().sort(), rows.map((r) => r.pid).sort());
  host.destroy();
});

test('chat memory bridge: the StoryBridge of the chat reads the mirror (weather, day, the diary of yesterday) through the registry', async () => {
  const { host, clock } = await boot({ rank: 2 });
  await run(host, clock, DAY * 2 + HOUR * 2);
  const added = {};
  let world = null;
  const village = { setWorld: (w) => { world = w; }, mem: (key) => ({ add: (m) => { (added[key] || (added[key] = [])).push(m); return true; } }), personas: {} };
  const bridge = createChatBridge(StoryBridge, host, village, { decorate: false });
  const w = bridge.syncWorld();
  assert.equal(world, w);
  assert.ok(Number.isFinite(w.day) && w.day >= 2, 'day ' + w.day);
  assert.ok(typeof w.weather === 'string' && w.weatherKo, 'weather ' + JSON.stringify(w));
  // ids go chat key -> pid 'v:<key>' -> sid and back
  assert.equal(bridge.idOf('npc_aunt'), host.registry.sidOf('v:npc_aunt'));
  assert.equal(bridge.keyOf(host.registry.sidOf('v:npc_aunt')), 'npc_aunt');
  assert.equal(bridge.idOf('nobody'), null);
  let n = 0;
  for (const key of ['npc_aunt', 'npc_uncle', 'npc_grandma', 'npc_grandpa', 'npc_blacksmith', 'npc_clerk_a', 'npc_teen_girl']) n += bridge.syncMemories(key);
  assert.ok(n >= 1, 'diary lines of yesterday became chat memories: ' + n);
  for (const list of Object.values(added)) for (const m of list) { assert.equal(m.k, 'saw'); assert.ok(m.s.length <= 60 && !/[{}<>]/.test(m.s), m.s); }
  assert.equal(bridge.syncMemories('npc_aunt'), 0, 'once per game day');
  host.destroy();
});

test('setting 인생 이야기 off: no proposal, wedding, baby or farewell, the elders stop at 85; back on -> the first proposal comes', async () => {
  const { host, clock, ports } = await boot({ rank: 2, settings: { lifeEvents: false }, hostOpts: { tuning: { life: { farewellFirstAfterMin: 0 } } } });
  const ops = {};
  host.on('story:life', (d) => { ops[d.op] = (ops[d.op] || 0) + 1; });
  assert.equal(host.farewellOn(), false, 'farewell follows life events');
  await run(host, clock, DAY * 6);
  for (const op of ['sweetheart', 'engaged', 'wedding', 'goodnews', 'baby', 'lastday', 'farewell']) assert.ok(!ops[op], op + ' while life events are off');
  assert.ok(!host.director.s.seen.proposal, 'no scripted proposal');
  const cards = await host.query('cards', { sids: Array.from({ length: host.registry.size }, (_, i) => i) });
  assert.ok(Object.keys(cards || {}).length >= 100, 'cards for everyone');
  const elders = Object.values(cards).filter((c) => c && !c.kept && c.age >= 80);
  assert.ok(elders.length >= 3, 'elders in town: ' + elders.length);
  for (const c of elders) assert.ok(c.age <= 86, 'frozen elders: ' + c.name + ' ' + c.age);
  ports.settingsTable.lifeEvents = true;
  host.onFeed({ t: 'settings' });
  await run(host, clock, 30);
  assert.ok(host.director.s.seen.proposal && ops.engaged >= 1, 'the first proposal after switching back on');
  host.destroy();
});

test('one owner per body: gameplay leases take people out of the story beats and give them back', async () => {
  const { host, clock, ports, town } = await boot({ rank: 1 });
  // the first 20 townsfolk ride the train to our village (gameplay owns their bodies)
  const ride = new Set(town.roster.filter((r) => r.kind === 'citizen').slice(0, 20).map((r) => r.pid));
  const W = ports.town.whereabouts;
  let phase = 1;
  ports.town.whereabouts = (out) => { W(out); if (phase) for (const row of out) if (ride.has(row[0])) row[4] = 'gameplay'; };
  const casts = [];
  host.on('story:life', (d) => { for (const k of ['aPid', 'bPid', 'whoPid']) if (d[k] && ride.has(d[k]) && d.op === 'wedding') casts.push(d); });
  await run(host, clock, DAY);
  for (const pid of ride) { assert.equal(host.registry.owner(pid), 'gameplay'); assert.ok((await host.query('card', { sid: host.registry.sidOf(pid) })).leased); }
  phase = 0;
  await run(host, clock, 2);
  for (const pid of ride) assert.equal(host.registry.owner(pid), 'town');
  assert.equal(host.registry.lease('t:0', 'story'), true);
  assert.equal(host.registry.lease('t:0', 'gameplay'), false, 'a body has exactly one owner');
  host.registry.release('t:0', 'story');
  host.destroy();
});

test('saves: the side record round-trips (packed, ≤ 450 K); a lost record regenerates gently; a corrupt one too', async () => {
  const storage = new MemStorage();
  const a = await boot({ rank: 2, storage });
  await run(a.host, a.clock, DAY * 3);
  const sv = await a.host.saveSide(true);
  assert.equal(sv.result, 'ok');
  assert.ok(sv.chars > 1000 && sv.chars < 450000, 'side record ' + sv.chars + ' chars');
  const slice = a.host.serialize();
  const people = a.host.registry.size;
  const st0 = await a.host.query('stats');
  a.host.destroy();
  // a reload: the same people, the same day, the life milestones kept
  const b = await boot({ rank: 2, storage, saved: slice, T0: a.clock.T });
  assert.equal(b.start.restored, true);
  assert.equal(b.host.registry.size, people);
  const st1 = await b.host.query('stats');
  assert.equal(st1.residents, st0.residents);
  assert.equal(st1.day, st0.day);
  assert.ok(b.host.director.s.seen.proposal, 'the proposal is not replayed');
  await run(b.host, b.clock, DAY);
  b.host.destroy();
  // the side record lost: regenerated from the seed, a gentle card
  const c = await boot({ rank: 2, storage: new MemStorage(), saved: slice, T0: a.clock.T });
  assert.equal(c.start.restored, false);
  assert.ok(c.rec.cards.some((x) => x.kind === 'forgot' && /잊어버렸어요/.test(x.ko)));
  c.host.destroy();
  // corrupt record: not read, regenerated
  const bad = new MemStorage();
  bad.setItem('frostVillage.save.v1.story', '{"v":1,"cid":"labsave1","T":1,"day":1,"reg":[],"eng":"退garbage"}');
  const d = await boot({ rank: 2, storage: bad, saved: slice, T0: a.clock.T });
  assert.equal(d.start.restored, false);
  assert.ok(d.host.registry.size > 100);
  d.host.destroy();
});

test('slice sanitizer: 300 fuzzed slices never throw and stay under 1 KB; the module accepts its own output', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const junk = () => { const k = Math.floor(rnd() * 7); return [null, 'x'.repeat(Math.floor(rnd() * 3000)), -5, 1e12, [1, 'a', {}], { v: 1 }, true][k]; };
  for (let i = 0; i < 300; i++) {
    const raw = { v: rnd() < 0.8 ? 1 : junk(), day: junk(), life: { seen: { wedding: rnd() < 0.5, x: junk() }, names: Array.from({ length: Math.floor(rnd() * 80) }, () => ['t:' + i, '우진'.repeat(1 + Math.floor(rnd() * 3)), 'Ujin']), garden: [junk(), { ko: '순자 할머니', en: 'Grandma', day: 3 }], gardenOld: ['a'.repeat(100)], wishes: { 3: 2, x: 9 } }, happen: junk() };
    const s = sanitizeSlice(raw);
    if (s) assert.ok(JSON.stringify(s).length <= SLICE_CAP);
  }
  const own = makeSlice({ day: 4, ok: true, chars: 1000, life: { seen: { wedding: true }, names: Array.from({ length: 40 }, (_, i) => ['t:' + i, '서아', 'Seoa']), garden: [], gardenOld: [], wishes: {} }, happen: { last: 5 } });
  assert.deepEqual(sanitizeSlice(JSON.parse(JSON.stringify(own))), own);
  assert.equal(MODULE.sanitize(own).v, 1);
  assert.equal(MODULE.saveKey, 'story');
});

test('worker ↔ inline parity: the same messages give the same event stream over 3 game days', async () => {
  const hash = async (transport) => {
    const F = makeFakePorts({ rank: 1, visible: 24 });
    const host = new StoryHost(F.ports, undefined, { transport });
    await host.start();
    const h = crypto.createHash('sha1');
    let n = 0;
    const orig = host.dispatch.bind(host);
    host.dispatch = (ev) => { n++; h.update(JSON.stringify([ev.e, ev.op, ev.a, ev.b, ev.who, ev.id, ev.lines ? ev.lines.map((l) => l.text) : null])); return orig(ev); };
    await run(host, F.clock, DAY * 3, { yieldEvery: transport === 'inline' ? 0 : 1 });
    // let the core finish what it was sent (the last tick's events are still in the inbox in both modes)
    host.drain();
    for (let k = 0; k < 50 && host.transport.mode === 'worker'; k++) { await new Promise((r) => setTimeout(r, 20)); host.drain(); }
    const perf = host.perf();
    if (host.transport.close) await host.transport.close();
    return { digest: h.digest('hex'), n, perf };
  };
  const a = await hash('inline');
  const b = await hash(new NodeWorkerTransport());
  console.log(`  parity: ${a.n} events; main thread per frame: inline ${a.perf.avgMs.toFixed(3)} ms (max ${a.perf.maxMs.toFixed(1)}), worker ${b.perf.avgMs.toFixed(3)} ms (max ${b.perf.maxMs.toFixed(1)})`);
  assert.ok(a.n > 300);
  assert.equal(b.n, a.n);
  assert.equal(b.digest, a.digest);
  assert.ok(b.perf.avgMs < 0.1, 'worker mode: main thread ≤ 0.1 ms per frame on average');
  assert.equal(b.perf.long, 0, 'no long tasks from the story on the main thread');
});

test('perf: 150+ people, engine CPU per game second and the side save size after 30 game days', async () => {
  const { host, clock } = await boot({ rank: 2, scale: 1.25, visible: 24 });
  await run(host, clock, DAY * 30);
  const st = await host.query('stats');
  const sv = await host.saveSide(true);
  console.log(`  30 days: ${st.residents} residents, core ${st.core.avgMs.toFixed(3)} ms per 0.25 s tick (max ${st.core.maxMs.toFixed(1)}), ${(st.core.avgMs * 4).toFixed(3)} ms per game second; side save ${sv.chars} chars (${sv.ms} ms, compacted ${sv.compacted})`);
  assert.ok(st.residents >= 150);
  assert.ok(st.core.avgMs * 4 < 2, '≤ 2 ms per game second');
  assert.ok(sv.chars < 450000);
  host.destroy();
});
