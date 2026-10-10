// 기쁜 소식 · 아기 탄생 · 유모차 산책 · 첫걸음 (docs/v5_v8_plan.md §6.1). No pregnancy art: the good news is a rocking
// cradle by the door and hearts from the neighbours; the birth is a walk to the clinic at dusk, a warm window all
// night, and at dawn the parents come out pushing the stroller (townfolk2 push + life2 baby_stroller, giggles);
// stroller walks in the afternoon; at 4 the stroller is gone and a small child toddles beside a parent.

/** good news: data { a, b (pids), home: { x, y } door, fast } */
export async function playGoodNews(sh, beat, ctx) {
  const d = beat.data || {};
  const home = d.home || (sh.body(d.a) ? { x: sh.body(d.a).x + 40, y: sh.body(d.a).y } : null);
  if (!home) return;
  const k = d.fast ? 0.6 : 1;
  const cradle = sh.prop('cradle', home.x, home.y, { anim: 'rock' });
  for (const pid of [d.a, d.b]) if (pid && sh.hold(pid)) { const b = sh.body(pid); if (b) { sh.walk(pid, home.x + (pid === d.a ? -46 : 46), home.y + 18, { speed: 0.8 }).then(() => { sh.faceTo(pid, home); sh.anim(pid, 'happy'); }); } }
  await sh.wait(2.4 * k);
  sh.emote(d.a, 'emote_love', 2.2);
  if (cradle) { const bp = sh.art.def('cradle'); if (bp && bp.babyPoint) sh.fx('fx_hearts', home.x + bp.babyPoint[0], home.y + bp.babyPoint[1] - 30, { depth: home.y + 100 }); }
  for (const pid of d.neighbours || []) { if (sh.hold(pid)) { sh.faceTo(pid, home); sh.emote(pid, 'emote_heart', 2); sh.anim(pid, 'wave'); } }
  await sh.wait(6 * k);
}

/** birth, at dusk (the engine's baby event, 18:00): the parents walk to the clinic and go in, the window glows warm.
 *  They come out again at dawn with the stroller (playBirthDawn, 06:30 the next morning — critique L6).
 *  data { a (mother), b (father), clinic: { x, y } door, fast } */
export async function playBirth(sh, beat, ctx) {
  const d = beat.data || {};
  const k = d.fast ? 0.5 : 1;
  const door = d.clinic;
  if (!door || !sh.hold(d.a)) return;
  sh.hold(d.b);
  await Promise.all([sh.walk(d.a, door.x, door.y, { speed: 0.7 }), d.b ? sh.walk(d.b, door.x + 26, door.y + 10, { speed: 0.7 }) : null].filter(Boolean));
  if (ctx.hide) { ctx.hide(d.a, true); if (d.b) ctx.hide(d.b, true); }
  // the warm window (the clinic's sign glows) while the night comes
  const glow = sh.art.image(sh.scene, door.x + 40, door.y - 140, 'fx_glow');
  if (glow) { glow.setBlendMode(1).setDepth(door.y + 300).setTint(0xffe2a8).setAlpha(0.7).setScale(1.4); sh.props.push(glow); sh.scene.tweens.add({ targets: glow, alpha: 0.95, duration: 900, yoyo: true, repeat: -1 }); }
  await sh.wait(6 * k);
  // the parents stay the night (their bodies go back to their evening; the town sees them again at dawn)
  if (ctx.hide) { ctx.hide(d.a, false); if (d.b) ctx.hide(d.b, false); }
}

/** dawn after a birth (06:30): out of the clinic with the stroller, a giggle, home. data { a, b, clinic, home, pink, fast } */
export async function playBirthDawn(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  const k = d.fast ? 0.5 : 1;
  const door = d.clinic;
  if (!door || !sh.hold(d.a)) return;
  sh.hold(d.b);
  sh.place(d.a, door.x, door.y, 'S');
  const stroller = sh.attach(d.a, 'stroller', { pink: !!d.pink });
  sh.anim(d.a, 'push');
  sh.sfx('sfx_baby_giggle', { volume: 0.7 });
  sh.emote(d.a, 'emote_love', 2.2);
  if (d.b) { sh.place(d.b, door.x + 34, door.y + 12, 'S'); sh.anim(d.b, 'happy'); sh.say(d.b, lang === 'en' ? 'Our baby!' : '우리 아기예요!', 'emote_heart', 2.4); }
  await sh.wait(1.2 * k);
  const to = d.home || { x: door.x - 220, y: door.y + 110 };
  await Promise.all([sh.walk(d.a, to.x, to.y, { speed: 0.55, push: true }), d.b ? sh.walk(d.b, to.x + 36, to.y + 14, { speed: 0.55 }) : null].filter(Boolean));
  sh.fx('fx_hearts', to.x, to.y - 70);
  await sh.wait(2 * k);
  if (stroller && stroller.destroy) stroller.destroy();
}

/** stroller walk: data { a (pusher), path [{ x, y }…], pink, chief (pid, giggles when near), fast } */
export async function playStroller(sh, beat, ctx) {
  const d = beat.data || {};
  if (!sh.hold(d.a)) return;
  const stroller = sh.attach(d.a, 'stroller', { pink: !!d.pink });
  sh.anim(d.a, 'push');
  let giggle = -99;
  for (const p of d.path || []) {
    await sh.walk(d.a, p.x, p.y, { speed: 0.5, push: true });
    const me = sh.body(d.a), ch = d.chief ? sh.body(d.chief) : null;
    if (me && ch && Math.hypot(me.x - ch.x, me.y - ch.y) < 150 && sh.t - giggle > 30) { giggle = sh.t; sh.sfx('sfx_baby_giggle', { volume: 0.6 }); sh.emote(d.a, 'emote_music', 1.8); }
    if (p.pause) { sh.anim(d.a, 'idle'); await sh.wait(p.pause); }
  }
  if (stroller && stroller.destroy) stroller.destroy();
}

/** first steps: data { child, parent (pids), from, to, fast } */
export async function playFirstSteps(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  if (!sh.hold(d.child)) return;
  sh.hold(d.parent);
  const c = sh.body(d.child);
  if (!c) return;
  const to = d.to || { x: c.x + 160, y: c.y + 60 };
  sh.say(d.child, lang === 'en' ? 'Toddle toddle!' : '아장아장!', 'emote_star', 2.2);
  await Promise.all([sh.walk(d.child, to.x, to.y, { speed: 0.6 }), d.parent ? sh.walk(d.parent, to.x - 34, to.y - 10, { speed: 0.6 }) : null].filter(Boolean));
  sh.anim(d.child, 'happy');
  if (d.parent) { sh.faceTo(d.parent, d.child); sh.anim(d.parent, 'clap'); sh.emote(d.parent, 'emote_love', 2); }
  await sh.wait(3);
}
