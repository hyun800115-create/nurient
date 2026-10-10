// The small everyday beats (docs/v5_v8_plan.md §6.1 life arc table): sweethearts' hearts, a date on a bench, a
// little gathering of friends, a birthday party, a housewarming, a first part-time job. Short, local, no slot.

/** hearts: data { a, b } — two sweethearts glance at each other */
export async function playHearts(sh, beat) {
  const [a, b] = beat.sids || [];
  const pa = beat.pids ? beat.pids[0] : a, pb = beat.pids ? beat.pids[1] : b;
  if (!sh.body(pa) || !sh.body(pb)) return;
  sh.faceTo(pa, pb); sh.faceTo(pb, pa);
  sh.emote(pa, 'emote_love', 2); await sh.wait(0.6); sh.emote(pb, 'emote_love', 2);
  await sh.wait(1.6);
}

/** a date: data { a, b, seat: [{x, y, dir}, {x, y, dir}] | null, spot: { x, y } } */
export async function playDate(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  if (!sh.hold(d.a) || !sh.hold(d.b) || !d.spot) return;
  // side by side (lane offset ≈ 0.3 m)
  await Promise.all([sh.walk(d.a, d.spot.x - 14, d.spot.y + 6, { speed: 0.7 }), sh.walk(d.b, d.spot.x + 14, d.spot.y - 2, { speed: 0.7 })]);
  if (d.seat && d.seat.length >= 2) {
    sh.place(d.a, d.seat[0].x, d.seat[0].y, d.seat[0].dir); sh.anim(d.a, 'sit', { dir: d.seat[0].dir, depth: d.seat[0].depth });
    sh.place(d.b, d.seat[1].x, d.seat[1].y, d.seat[1].dir); sh.anim(d.b, 'sit', { dir: d.seat[1].dir, depth: d.seat[1].depth });
  } else { sh.faceTo(d.a, d.b); sh.faceTo(d.b, d.a); sh.anim(d.a, 'talk'); }
  await sh.wait(1.2);
  sh.say(d.a, lang === 'en' ? 'What a lovely day.' : '오늘 정말 좋다.', 'emote_love', 2.4);
  await sh.wait(2.6);
  sh.emote(d.b, 'emote_love', 2.2);
  await sh.wait(6);
}

/** a little gathering of friends at a spot: data { who [pids], spot } */
export async function playGathering(sh, beat) {
  const d = beat.data || {};
  const who = (d.who || []).filter((p) => sh.hold(p)).slice(0, 5);
  if (who.length < 2 || !d.spot) return;
  await Promise.all(who.map((pid, i) => { const a = (i / who.length) * Math.PI * 2; return sh.walk(pid, d.spot.x + Math.cos(a) * 46, d.spot.y + Math.sin(a) * 23, { speed: 0.9 }); }));
  for (const pid of who) sh.faceTo(pid, d.spot);
  who.forEach((pid, i) => sh.anim(pid, i % 2 ? 'happy' : 'talk'));
  sh.emote(who[0], 'emote_laugh', 2);
  await sh.wait(8);
}

/** a birthday party: data { who (pid), friends [pids], spot } */
export async function playBirthday(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  if (!sh.hold(d.who) || !d.spot) return;
  await sh.walk(d.who, d.spot.x, d.spot.y, { speed: 0.8 });
  sh.face(d.who, 'S');
  sh.prop('item_cake', d.spot.x + 26, d.spot.y + 18);
  const fr = (d.friends || []).filter((p) => sh.hold(p)).slice(0, 5);
  await Promise.all(fr.map((pid, i) => { const a = Math.PI * (0.1 + 0.8 * i / Math.max(1, fr.length - 1)); return sh.walk(pid, d.spot.x + Math.cos(a) * 80, d.spot.y + Math.sin(a) * 40 + 10, { speed: 1 }).then(() => sh.faceTo(pid, d.spot)); }));
  fr.forEach((pid) => sh.anim(pid, 'clap'));
  if (fr[0]) sh.say(fr[0], lang === 'en' ? 'Happy birthday!' : '생일 축하해!', 'emote_star', 2.4);
  sh.anim(d.who, 'happy');
  sh.fx('fx_sparkle', d.spot.x, d.spot.y - 70);
  await sh.wait(6);
}

/** a housewarming: data { who (pid), friends [pids], door } */
export async function playHousewarming(sh, beat) {
  const d = beat.data || {};
  if (!d.door) return;
  if (sh.hold(d.who)) { sh.place(d.who, d.door.x, d.door.y, 'SW'); sh.anim(d.who, 'wave'); }
  const fr = (d.friends || []).filter((p) => sh.hold(p)).slice(0, 5);
  await Promise.all(fr.map((pid, i) => sh.walk(pid, d.door.x - 40 - i * 22, d.door.y + 24 + (i % 2) * 14, { speed: 1 }).then(() => { sh.faceTo(pid, d.door); sh.anim(pid, 'wave'); sh.emote(pid, 'emote_heart', 1.8); })));
  await sh.wait(5);
}

/** a first part-time job: data { teen, owner (pids), at: { x, y } } — stands beside the shop owner one afternoon */
export async function playFirstJob(sh, beat, ctx) {
  const d = beat.data || {};
  if (!sh.hold(d.teen) || !d.at) return;
  await sh.walk(d.teen, d.at.x + 30, d.at.y + 10, { speed: 0.9 });
  sh.face(d.teen, 'SW');
  sh.anim(d.teen, 'happy');
  sh.say(d.teen, (ctx.lang || 'ko') === 'en' ? 'My first job!' : '첫 아르바이트예요!', 'emote_star', 2.4);
  await sh.wait(10);
}
