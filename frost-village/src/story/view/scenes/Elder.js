// 할머니의 소원 · 마지막 하루 (docs/v5_v8_plan.md §6.1 "Three wishes", "Farewell"). The wish is an escort: the elder
// follows the chief slowly to the wished-for place (a bus or train ride in the game) and sits there 20 s with hearts.
// The last day is gentle: favourite places, a thank-you to the chief, the sunset on the garden bench.

/** wish: data { elder, chief (pids), to: { x, y, dir } (a seat point), fast } */
export async function playElderWish(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  const k = d.fast ? 0.5 : 1;
  if (!sh.hold(d.elder) || !d.to) return;
  const chief = d.chief ? sh.body(d.chief) : null;
  // the chief leads, the elder follows slowly a step behind
  const lead = d.chief ? sh.walk(d.chief, d.to.x + 46, d.to.y + 26, { speed: 0.55 }) : Promise.resolve();
  await sh.wait(0.6 * k);
  sh.say(d.elder, lang === 'en' ? 'Slowly, slowly… thank you, Chief.' : '천천히, 천천히… 고마워요, 촌장님.', 'emote_heart', 2.6);
  await sh.walk(d.elder, d.to.x, d.to.y + 22, { speed: 0.4 });
  await lead;
  sh.place(d.elder, d.to.x, d.to.y, d.to.dir || 'S');
  sh.anim(d.elder, 'sit', { dir: d.to.dir || 'S', depth: d.to.depth });
  if (d.chief) { sh.faceTo(d.chief, d.to); sh.anim(d.chief, 'idle'); }
  await sh.wait(1 * k);
  sh.say(d.elder, lang === 'en' ? 'Ah… this is lovely.' : '아… 참 좋다.', 'emote_heart', 2.8);
  for (let i = 0; i < 4 && !sh.cancelled; i++) { await sh.wait(4.5 * k); sh.emote(d.elder, i % 2 ? 'emote_heart' : 'emote_love', 2.2); }
  if (chief && d.chief) sh.emote(d.chief, 'emote_heart', 2);
  await sh.wait(2 * k);
}

/** the last day: data { elder, chief (pid), bench: { x, y, dir }, fast } */
export async function playLastDay(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  if (!sh.hold(d.elder)) return;
  const ch = d.chief ? sh.body(d.chief) : null, me = sh.body(d.elder);
  if (ch && me && Math.hypot(ch.x - me.x, ch.y - me.y) < 1400) {
    // a slow walk up to the chief (never all the way: a polite step away)
    // side by side with the chief (never hidden behind them)
    const side = me.x >= ch.x ? 1 : -1;
    if (Math.hypot(me.x - ch.x, me.y - ch.y) > 80) await sh.walk(d.elder, ch.x + side * 70, ch.y + 6, { speed: 0.5 });
    sh.faceTo(d.elder, d.chief);
    sh.faceTo(d.chief, d.elder);
    sh.anim(d.elder, 'talk');
    sh.say(d.elder, lang === 'en' ? 'Chief, thank you for everything. The village has grown so warm.' : '촌장님, 그동안 고마웠어요. 마을이 참 따뜻해졌어요.', 'emote_heart', 3.6);
    await sh.wait(3.8);
  }
  if (d.bench) {
    await sh.walk(d.elder, d.bench.x, d.bench.y + 22, { speed: 0.4 });
    sh.place(d.elder, d.bench.x, d.bench.y, d.bench.dir || 'S');
    sh.anim(d.elder, 'sit', { dir: d.bench.dir || 'S', depth: d.bench.depth });
    await sh.wait(8);
    sh.emote(d.elder, 'emote_heart', 2.4);
    await sh.wait(4);
  }
}
