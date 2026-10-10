// The lab's staged shots (used by lab.mjs and by hand from the console: await __LAB.shots.wedding()).
// Every shot runs the real module: the scripted first proposal comes from the rank event, the wedding from the
// engine's booking, the birth from the engine's expect / baby events, the last day and the farewell from the
// engine's gentle-farewell gates. Previews (the designer's 이야기 미리보기) are used only for beats that need a
// specific cast (stroller walk, first school day, outdoor class, an elder's wish).
// snap(name) / frame(name, i) are provided by the capture script (page.exposeFunction); without them they no-op.

import { DAY, HOUR } from '../standin.mjs';
import { LAB_BYID, pointOf } from './world.js';

const L = () => window.__LAB;
const snap = async (name, opts) => { if (window.labSnap && !L().quiet) { L().renderNow(); await window.labSnap(name, opts || {}); } };
const frame = async (name, i) => { if (window.labFrame) await window.labFrame(name, i); };
const run = (sec, step = 50, render = false) => L().advance(sec * 1000, step, render);
const log = (...a) => { (L().shotLog = L().shotLog || []).push(Math.round(performance.now() / 100) / 10 + 's ' + a.join(' ')); };

/** advance until cond() (or `max` game seconds); returns true when it happened */
async function until(cond, max = 60, step = 0.25) {
  for (let t = 0; t < max; t += step) { if (cond()) return true; await run(step); }
  return !!cond();
}
async function jump(day, hour, settleSec = 1.5) { L().setT(day * DAY + hour * HOUR); await run(settleSec); }
function lifeEvent(op) { return L().rec.events.filter((e) => e[0] === 'story:life' && e[1].op === op); }
/** GIF frames of `secs` game seconds; stills: [{ when: () => bool, after: frames, name }] snapped once each */
async function gif(name, secs, fps = 6, stills = []) {
  const n = Math.round(secs * fps);
  const st = stills.map((s) => Object.assign({ hit: -1, done: false }, s));
  for (let i = 0; i < n; i++) {
    await run(1 / fps, 50, true); await frame(name, i);
    for (const s of st) { if (s.done) continue; if (s.hit < 0 && s.when()) s.hit = i; if (s.hit >= 0 && i >= s.hit + (s.after || 0)) { s.done = true; await snap(s.name); } }
  }
}
const said = (re) => () => re.test(L().rec.lastSay || '');
const dayNow = () => Math.floor(L().clock.T / DAY);
/** let a set piece play to its end (the frame loop is stepped by hand) */
async function finish(p, max = 90) { let done = false; p.then(() => { done = true; }); await until(() => done, max); return done; }

async function peopleRows() { return (await L().q('people')) || []; }
const pidOf = (sid) => L().host.registry.pidOf(sid);
const bodyOk = (pid) => { const b = L().town.bodies.get(pid); return !!(b && b.kind === 'doll' && !b.extra); };

export const shots = {
  /** the town square at the zoom range (0.6 / 0.9 / 1.2) in the afternoon */
  async town() {
    await jump(2, 15.0, 3);
    for (const z of [0.6, 0.9]) { L().look(1250, 1350, z); await run(2.5); await snap('story_lab_town_z' + String(z).replace('.', '')); }
  },

  /** everyday talks at the fountain (bubbles + 눈꽃말 voice) in Korean, then English; a GIF */
  async talks() {
    await jump(2, 14.9, 2);
    L().look(1290, 1180, 1.2);
    await until(() => L().bubbles.count('chat') >= 2, 50);
    await snap('story_lab_talks_ko');
    await gif('story_lab_talks', 7, 6);
    L().setLang('en');
    await run(3);
    await until(() => L().bubbles.count('chat') >= 2, 50);
    await snap('story_lab_talks_en');
    L().setLang('ko');
  },

  /** the 읍 ceremony crowd at our hall, the rank event, the scripted first proposal (+ GIF) */
  async proposal(opts = {}) {
    await jump(2, 10.0, 1.5);
    const pairs = (await L().q('sweethearts', { n: 24 })) || [];
    const pair = pairs.map((p) => [pidOf(p.a), pidOf(p.b)]).find(([a, b]) => a && b && /^t:/.test(a) && /^t:/.test(b) && bodyOk(a) && bodyOk(b) && L().town.bodies.get(a).age === 'adult' && L().town.bodies.get(b).age === 'adult');
    const hall = pointOf(L().art, 'v_hall', 'gatherPoints', 0);
    const cx = hall.x + 60, cy = hall.y + 120;      // the open snow in front of the steps (StoryLife's scripted spot)
    const crowd = L().near(cx, cy, 30, 'adult', 4000).filter((p) => !pair || pair.indexOf(p) < 0).slice(0, 12).concat(L().near(cx, cy, 4, 'child', 4000));
    if (pair) crowd.splice(3, 0, pair[0]), crowd.splice(8, 0, pair[1]);
    L().gather(crowd, cx, cy - 10, 250, [Math.PI * 0.8, Math.PI * 2.2]);      // behind and beside the open spot
    L().look(cx, cy - 40, opts.zoom || 1.15);
    await run(1);
    L().feed({ t: 'rank', level: 2 });
    log('rank fed at', L().clock.T);
    log('pair', pair && pair.join(','));
    const ok = await until(() => L().life.active.has('proposal'), 30);
    log('proposal started', ok, L().clock.T);
    if (!ok) return false;
    if (opts.gif) await gif('story_lab_proposal', 10, 6, [{ when: said(/결혼해 줄래요|marry me/), after: 3, name: 'story_lab_proposal_ask' }, { when: said(/^(네!|Yes!)$/), after: 4, name: 'story_lab_proposal_yes' }]);
    else { await until(said(/^(네!|Yes!)$/), 20); await run(0.7); if (!opts.quiet) await snap('story_lab_proposal_yes'); }
    await until(() => lifeEvent('engaged').length > 0, 10);
    await until(() => !L().life.active.has('proposal'), 20);
    await run(0.8);
    if (opts.banner) await snap('story_lab_proposal_banner');
    for (const g of crowd) { const b = L().town.bodies.get(g); if (b) { b.ambientOff = false; b.goal = null; } }
    return true;
  },

  /** the booked wedding at our 마을회관 (life2 layout, townfolk2 outfits, bgm_wedding) + GIF of the aisle */
  async wedding(opts = {}) {
    const en = lifeEvent('engaged')[0];
    if (!en) return false;
    const { day, hour } = en[1];
    const H = LAB_BYID.v_hall;
    await jump(day, 10.3, 1);
    L().look(H.x - 235, H.y + 40, opts.zoom || 1.2);
    const ok = await until(() => L().life.active.has('wedding'), 30);
    log('wedding started', ok, 'day', day, 'hour', hour);
    if (!ok) return false;
    await run(13); await snap('story_lab_wedding_guests');
    await until(() => L().rec.music === 'bgm_wedding', 20);
    const stills = [{ when: () => true, after: 18, name: 'story_lab_wedding_aisle' }, { when: said(/평생 함께할게요|Together, always/), after: 3, name: 'story_lab_wedding_vows' },
      { when: said(/네! 평생이요|Always!/), after: 6, name: 'story_lab_wedding_hearts' }];
    if (opts.gif) await gif('story_lab_wedding', 17, 5, stills);
    else { await run(3.6); await snap('story_lab_wedding_aisle'); await until(said(/평생 함께할게요|Together, always/), 20); await run(0.6); await snap('story_lab_wedding_vows'); await until(said(/네! 평생이요|Always!/), 10); await run(1.2); await snap('story_lab_wedding_hearts'); }
    await run(5.5); await snap('story_lab_wedding_cake');
    await run(7); await snap('story_lab_wedding_dance');
    await until(() => !L().life.active.has('wedding'), 40);
    return true;
  },

  /** good news (a rocking cradle by the door) for the newly-weds, then the birth at the clinic and the naming sheet */
  async baby() {
    const w = lifeEvent('engaged')[0];
    let a, b;
    if (w) { a = w[1].a; b = w[1].b; }
    else { const rows = await peopleRows(); const m = rows.find((r) => (r[3] & 1) && r[2] < 40 && pidOf(r[0]) && /^t:/.test(pidOf(r[0]))); a = m && m[0]; const f = a !== undefined ? await L().q('family', { sid: a }) : null; b = f ? f.spouse : -1; }
    if (a === undefined || b < 0) return false;
    // the mother first (the engine's expect takes mom, dad)
    const rows = await peopleRows(); const male = (sid) => { const r = rows.find((x) => x[0] === sid); return r && (r[3] & 8); };
    if (male(a) && !male(b)) [a, b] = [b, a];
    const pa = pidOf(a), home = L().town.bodies.get(pa);
    await jump(dayNow(), 13.0, 1);
    if (home) L().look(home.x, home.y - 60, 1.1);
    await run(0.5);
    const r = await L().ask(L().host.arrange('expect', { a, b, inDays: 1 }));
    log('expect', JSON.stringify(r));
    const ok = await until(() => L().life.active.has('goodnews') || L().life.stats.beats > 0 && lifeEvent('goodnews').length > 0, 10);
    // the cradle appears at the couple's home door: follow it
    await run(0.4);
    const cam = L().world.cameras.main;
    const cr = L().world.children.list.find((o) => o.texture && o.frame && o.frame.name && /^cradle/.test(o.frame.name));
    if (cr) L().look(cr.x, cr.y - 40, 1.1);
    await run(3.2); await snap('story_lab_goodnews');
    // the birth: next day at 18:00, at the clinic (walk there at dusk, a warm window, out with the stroller)
    const C = pointOf(L().art, 't_clinic', 'doorPoint');
    await jump(dayNow() + 1, 17.6, 1);
    L().look(C.x - 60, C.y - 40, 1.1);
    const born = await until(() => L().life.active.has('birth'), 40);
    log('birth started', born);
    // the banner and the naming card come with the baby event; the parents walk to the clinic at dusk
    await until(() => L().life.cardView && L().life.cardView.c && L().life.cardView.card.kind === 'naming', 30);
    await run(1.2); await snap('story_lab_naming_card');
    await until(() => { const p = L().town.bodies.get(pa); return p && p.attached; }, 80);
    await run(2.0); await snap('story_lab_birth_stroller');
    return true;
  },

  /** the naming sheet (three names from the engine's pool) */
  async naming() {
    const card = L().rec.cards.filter((c) => c.kind === 'naming').pop();
    if (!card) return false;
    await L().ask(L().life.openNaming(card));
    await run(1.2);
    await snap('story_lab_naming_sheet');
    return true;
  },

  /** the morning paper: the edge icon pulses at 07:00, the NewsPanel (ko, en) */
  async news() {
    await jump(dayNow() + 1, 6.8, 1);
    L().look(1290, 1250, 1.0);
    await until(() => !!L().life.paperData, 20);
    await run(1.2); await snap('story_lab_news_chip');
    L().life.openNews();
    await run(1.2); await snap('story_lab_news_ko');
    L().life.news.close(); await run(0.5);
    L().setLang('en'); L().life.openNews(); await run(1.2); await snap('story_lab_news_en');
    L().life.news.close(); L().setLang('ko'); await run(0.5);
    return true;
  },

  /** a person card (a regular of ours) */
  async person() {
    L().look(1290, 1250, 1.1);
    const pid = L().near(1290, 1250, 1, 'adult', 600)[0] || L().folk(1, 'adult')[0];
    const R = L().host.registry; for (let i = 0; i < 4; i++) R.served(pid);
    L().host.refreshCard(pid);
    await run(1.5);
    const b = L().town.bodies.get(pid);
    const cam = L().world.cameras.main, k = L().VIEW.k;
    const at = { x: (b.x - cam.worldView.x) * cam.zoom / k, y: (b.y - cam.worldView.y) * cam.zoom / k };
    L().life.openPerson(pid, at); await run(1.2); await snap('story_lab_person_card');
    if (L().life.person) L().life.person.close();
    return true;
  },

  /** a stroller walk past the fountain (preview cast) — GIF */
  async stroller() {
    await jump(dayNow(), 15.2, 1);
    const F = LAB_BYID.t_fountain;
    L().look(F.x - 20, F.y + 330, 1.35);
    const pa = L().near(F.x - 200, F.y + 330, 1, 'adult', 1500)[0];
    L().ports.town.hold(pa);
    L().ports.town.place(pa, F.x - 250, F.y + 300, 'E');
    L().ports.town.place(L().chief, F.x + 40, F.y + 470, 'N');
    const p = L().preview('stroller', { a: pa, pink: true, chief: L().chief, path: [{ x: F.x - 90, y: F.y + 370 }, { x: F.x + 30, y: F.y + 400, pause: 2 }, { x: F.x + 240, y: F.y + 330 }] });
    await run(1.6); await snap('story_lab_stroller');
    await gif('story_lab_stroller', 7, 6);
    await finish(p); L().ports.town.release(pa);
    return true;
  },

  /** the first school day at 07:30 (backpack, wave, a look back, the bell) + an outdoor class */
  async school() {
    await jump(dayNow() + 1, 7.3, 1);
    const S = LAB_BYID.t_school;
    L().look(S.x - 60, S.y + 120, 1.15);
    const kid = L().folk(30, 'child').find((p) => L().town.bodies.get(p).inside === false) || L().folk(1, 'child')[0];
    const mom = L().folk(1, 'adult')[0];
    const gate = pointOf(L().art, 't_school', 'gatherPoints', 2);
    L().ports.town.hold(kid); L().ports.town.hold(mom);
    L().ports.town.place(kid, gate.x + 60, gate.y + 220, 'N'); L().ports.town.place(mom, gate.x + 110, gate.y + 240, 'N');
    const p = L().preview('school', { child: kid, parent: mom, school: 't_school' });
    await run(6.2); await snap('story_lab_school_wave');
    await run(5.2); await snap('story_lab_school_lookback');
    await finish(p);
    // an outdoor class at 10:00 on a clear day (life2 desk rows)
    await jump(dayNow(), 10.0, 1);
    L().look(S.x + 150, S.y + 200, 1.35);
    const kids = L().folk(6, 'child');
    kids.forEach((k, i) => L().ports.town.place(k, S.x + 60 + i * 30, S.y + 330, 'N'));
    const teacher = L().folk(2, 'adult')[1];
    L().ports.town.place(teacher, S.x - 20, S.y + 220, 'S');
    const q = L().preview('outdoor', { kids, teacher, school: 't_school' });
    await run(6); await snap('story_lab_outdoor_class');
    await finish(q);
    return true;
  },

  /** an elder's wish (C7, from the engine's wish card when there is one): the chief escorts them to the bench */
  async wish() {
    await jump(dayNow(), 11.0, 1);
    const F = LAB_BYID.t_fountain;
    const card = L().rec.cards.filter((c) => c.kind === 'wish').pop();
    let gm = card && card.pids && card.pids[0];
    if (!gm || !L().town.bodies.get(gm)) gm = Array.from(L().town.bodies.keys()).find((p) => L().town.bodies.get(p).villager === 'npc_grandma') || L().folk(1, 'elder')[0];
    log('wish elder', gm, card && card.ko);
    const seat = { x: F.x + 75, y: F.y + 23, dir: 'SE', depth: F.y + 24 };
    L().ports.town.hold(gm);
    L().ports.town.place(gm, F.x - 200, F.y + 300, 'NE');
    L().ports.town.place(L().chief, F.x - 140, F.y + 270, 'NE');
    L().look(F.x, F.y + 150, 1.2);
    const p = L().preview('wish', { elder: gm, chief: L().chief, to: seat });
    await run(4); await snap('story_lab_wish_walk');
    await until(() => L().town.bodies.get(gm).rest === 'sit', 40);
    await run(2.5); await snap('story_lab_wish_bench');
    await finish(p);
    if (card) L().feed({ t: 'mission:done', wish: card.wish, who: card.sids[0] });
    L().ports.town.release(gm);
    return true;
  },

  /** step day by day until the engine picks an elder's last day; stage the last day and the farewell */
  async farewell(opts = {}) {
    const G = LAB_BYID.v_garden;
    let last = null;
    for (let d = dayNow() + 1, end = dayNow() + 80; d < end && !last; d++) {
      await jump(d, 1.0, 1.5);
      last = lifeEvent('lastday').pop() || null;
    }
    log('lastday', last && JSON.stringify(last[1]), 'day', dayNow());
    if (!last) return false;
    // the afternoon of the last day: a thank-you to the chief, then the garden bench
    L().look(G.x, G.y - 20, 1.3);
    await jump(dayNow(), 14.9, 0.3);
    L().ports.town.place(L().chief, G.x + 150, G.y + 170, 'NW');
    const lastOk = await until(() => L().life.active.has('lastday'), 30);
    log('lastday beat', lastOk);
    if (lastOk) {
      L().rec.lastSay = '';
      const ld = L().life.active.get('lastday');
      const elder = ld && Array.from(ld.sh.held)[0];
      log('lastday elder', elder, JSON.stringify(elder && { x: Math.round(L().town.bodies.get(elder).x), y: Math.round(L().town.bodies.get(elder).y) }));
      if (await until(said(/고마웠어요|thank you for everything/i), 150, 0.1)) { const b = L().town.bodies.get(elder); if (b) L().look(b.x, b.y - 40, 1.3); await run(0.6); await snap('story_lab_lastday_thanks'); }
      if (await until(() => (L().town.bodies.get(elder) || {}).rest === 'sit', 150)) { L().look(G.x, G.y - 20, 1.3); await run(2); await snap('story_lab_lastday_bench'); }
      await until(() => !L().life.active.has('lastday'), 60);
    }
    // the next morning: the card at 09:00, the farewell at 10:00 in the memorial garden (no camera grab)
    await jump(dayNow() + 1, 8.8, 1);
    L().look(G.x, G.y - 20, 1.3);
    await until(() => L().life.cardView && L().life.cardView.card && L().life.cardView.card.kind === 'farewell', 40);
    await run(1.0); await snap('story_lab_farewell_card');
    const okF = await until(() => L().life.active.has('farewell'), 40);
    log('farewell beat', okF, 'T', L().clock.T);
    if (!okF) return false;
    await run(13); await snap('story_lab_farewell_gather');
    if (opts.gif) await gif('story_lab_farewell', 10, 5, [{ when: said(/좋은 여행 하세요|lovely journey/), after: 3, name: 'story_lab_farewell_flowers' }]);
    else { await until(said(/좋은 여행 하세요|lovely journey/), 30); await run(0.6); await snap('story_lab_farewell_flowers'); }
    await until(() => !L().life.active.has('farewell'), 60);
    await run(2); await snap('story_lab_farewell_after');
    return true;
  },

  /** the same village with 생애 이벤트 (farewells) switched off: no last day, no card, the elders stay (frozen at 85) */
  async farewellOff() {
    const G = LAB_BYID.v_garden;
    for (let d = dayNow() + 1, end = dayNow() + 50; d < end; d++) await jump(d, 1.0, 1.0);
    const rows = (await L().q('people')) || [];
    const oldest = rows.reduce((m, r) => (r[2] > (m ? m[2] : -1) ? r : m), null);
    log('farewell off: lastday events', lifeEvent('lastday').length, 'farewells', lifeEvent('farewell').length, 'oldest age', oldest && oldest[2], 'day', dayNow());
    await jump(dayNow(), 11.0, 1);
    L().look(G.x, G.y - 20, 1.1);
    await run(3); await snap('story_lab_farewell_off');
    return { lastday: lifeEvent('lastday').length, farewells: lifeEvent('farewell').length, oldest: oldest && oldest[2] };
  },
};
