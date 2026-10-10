// 청혼 (docs/v5_v8_plan.md §6.1 "First proposal" / "Proposal (later)"): in the crowd still gathered after the 읍
// ceremony (or at a pretty spot later) a young regular of ours steps up to their sweetheart with a bouquet — the art
// has no kneel, so they offer the flowers with a little bow — "결혼해 줄래요?" → "네!", hearts, the crowd claps.
// 8 s, skippable after 3 s (the director's camera grab only for the scripted first one).

/** data: { a, b (pids), crowd [pids], at: { x, y } , fast } */
export async function playProposal(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  const k = d.fast ? 0.6 : 1;
  if (!sh.hold(d.a) || !sh.hold(d.b)) return;
  const A = sh.body(d.a), B = sh.body(d.b);
  if (!A || !B) return;
  const at = d.at || { x: B.x, y: B.y };
  if (beat.camera) sh.focus(at.x, at.y - 60, 900);
  sh.reserve({ x: at.x - 120, y: at.y - 60, w: 240, h: 140 });
  // the sweetheart waits at the spot; the one who asks steps up from the crowd (from nearby when far away)
  if (Math.hypot(B.x - at.x, B.y - at.y) > 40) sh.place(d.b, at.x + 30, at.y - 15, 'SW');
  if (Math.hypot(A.x - at.x, (A.y - at.y) * 2) > 360) sh.place(d.a, at.x - 150, at.y + 60, 'NE');
  sh.anim(d.b, 'idle');
  sh.dress(d.a, null, { add: ['held_bouquet'] });
  // the crowd turns to watch
  const crowd = (d.crowd || []).filter((p) => p !== d.a && p !== d.b && sh.hold(p)).slice(0, 10);
  crowd.forEach((pid, i) => {
    // a half ring behind and beside the couple (north in screen space), so the camera sees the two of them
    const ang = Math.PI * (1.05 + 0.9 * (i / Math.max(1, crowd.length - 1))) + (i % 2 ? 0.08 : -0.08);
    const r = 130 + (i % 3) * 30;
    const x = at.x + Math.cos(ang) * r, y = at.y + Math.sin(ang) * r * 0.5 + 20;
    sh.walk(pid, x, y, { speed: 1.1 }).then(() => sh.faceTo(pid, at));
  });
  await sh.walk(d.a, at.x - 34, at.y + 2, { speed: 0.8 });
  sh.faceTo(d.a, d.b); sh.faceTo(d.b, d.a);
  // a little bow with the bouquet
  if (ctx.bow) ctx.bow(d.a);
  sh.anim(d.a, 'talk');
  sh.say(d.a, lang === 'en' ? 'Will you marry me?' : '결혼해 줄래요?', 'emote_love', 2.6);
  await sh.wait(2.6 * k);
  sh.emote(d.b, 'emote_exclaim', 0.9);
  await sh.wait(0.8 * k);
  sh.anim(d.b, 'happy');
  sh.say(d.b, lang === 'en' ? 'Yes!' : '네!', 'emote_love', 2.2);
  sh.fx('fx_hearts', (A.x + B.x) / 2, Math.min(A.y, B.y) - 90, { depth: Math.max(A.y, B.y) + 200 });
  sh.sfx('sfx_cheer', { volume: 0.55 });
  await sh.wait(0.5 * k);
  sh.anim(d.a, 'happy');
  sh.emote(d.a, 'emote_love', 2.2);
  crowd.forEach((pid, i) => { sh.anim(pid, i % 4 === 3 ? 'happy' : 'clap'); if (i % 3 === 0) sh.emote(pid, i % 2 ? 'emote_star' : 'emote_heart', 2); });
  await sh.wait(3.8 * k);
}
