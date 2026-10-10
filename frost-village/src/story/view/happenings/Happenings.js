// 귀여운 일 (docs/v5_v8_plan.md §6.1.6): the v5 happenings on stage. P1 (콩이's bread heist) and P3 (the cat on the
// roof) are fully staged with the village pets; P2, P4–P6 need the snowman hat / the sleigh bus and wagon
// (vehicles_runtime) — until those run they come as a small toast with 보러 가기. One at a time, ≥ 150 s apart.

/** ctx: { sh (a Stagehand), spots: { market, plaza, house, chief }, pets: { dog, cat }, kids [pids], keeper (pid), keeperMale, lang } */
export async function playHappening(h, sh, ctx) {
  const lang = ctx.lang || 'ko';
  if (h.id === 'P1' && ctx.pets && ctx.pets.dog && ctx.spots.market) {
    const dog = ctx.pets.dog, m = ctx.spots.market, run = ctx.spots.plaza || { x: m.x - 260, y: m.y + 140 };
    sh.place(dog, m.x + 30, m.y + 20, 'SW');
    const loaf = sh.prop('item_bread', m.x + 34, m.y - 10, { pop: false });
    if (ctx.keeper && sh.hold(ctx.keeper)) { sh.faceTo(ctx.keeper, m); }
    await sh.wait(0.6);
    if (loaf) sh.scene.tweens.add({ targets: loaf, alpha: 0, duration: 150 });
    sh.anim(dog, 'run');
    // (critique L4) the village's own rule: no man says 어머
    sh.say(ctx.keeper, lang === 'en' ? 'Hey! My bread!' : ctx.keeperMale ? '어이쿠, 내 빵!' : '어머, 내 빵!', 'emote_anger', 1.8);
    const chase = (ctx.kids || []).filter((p) => sh.hold(p)).slice(0, 3);
    const dogRun = sh.walk(dog, run.x, run.y, { speed: 1.9 });
    chase.forEach((pid, i) => sh.wait(0.4 + i * 0.3).then(() => sh.walk(pid, run.x + 50 + i * 30, run.y + 30 - i * 12, { speed: 1.4 })).then(() => { sh.anim(pid, 'happy'); sh.emote(pid, 'emote_laugh', 1.8); }));
    await dogRun;
    sh.anim(dog, 'happy');
    await sh.wait(2.4);
    // the chief whistles: 콩이 comes back, head low
    if (ctx.spots.chief) { sh.emote(dog, 'emote_sweat', 2); await sh.walk(dog, ctx.spots.chief.x + 40, ctx.spots.chief.y + 20, { speed: 0.6 }); sh.anim(dog, 'sit'); }
    if (ctx.keeper) { sh.anim(ctx.keeper, 'happy'); sh.emote(ctx.keeper, 'emote_laugh', 2); }
    await sh.wait(2.4);
    return { fame: 2 };
  }
  if (h.id === 'P3' && ctx.pets && ctx.pets.cat && ctx.spots.house) {
    const cat = ctx.pets.cat, roof = ctx.spots.house;
    sh.place(cat, roof.x, roof.y, 'S');
    sh.anim(cat, 'sit');
    sh.emote(cat, 'emote_question', 3);
    const kids = (ctx.kids || []).filter((p) => sh.hold(p)).slice(0, 3);
    kids.forEach((pid, i) => sh.walk(pid, roof.x - 60 + i * 50, roof.y + 230 + (i % 2) * 12, { speed: 1.2 }).then(() => { sh.face(pid, 'N'); sh.emote(pid, 'emote_exclaim', 1.6); }));
    await sh.wait(4);
    if (ctx.spots.chief) {
      // the chief stands below for 3 s: Nabi jumps into the chief's arms
      sh.anim(cat, 'run');
      await sh.walk(cat, ctx.spots.chief.x + 18, ctx.spots.chief.y - 4, { speed: 1.6 });
      sh.anim(cat, 'happy');
      sh.emote(cat, 'emote_heart', 2);
      kids.forEach((pid) => sh.anim(pid, 'clap'));
    }
    await sh.wait(3);
    return { fame: 3 };
  }
  return { toast: true };
}
