// 하늘나라 여행 배웅 (docs/v5_v8_plan.md §6.1 "Farewell", life2 layouts.farewell_garden). Gentle and warm, never
// sad-scary: a new memorial_stone appears at the next stone slot with a flower_wreath, the family in mourner_family
// clothes stand at the stone, friends in mourner clothes hold white bouquets at the gather points; one by one they
// step to the stone and lay their flowers; light snow drifts upward, the blossom tree glows, 콩이 sits beside the
// chief, bgm_farewell plays. No camera grab, ever. The words are only 하늘나라 여행, 배웅, 기억.

/** data: { slot, nameKo, nameEn, family [pids], friends [pids], chief (pid), dog (pid), garden (id | {x, y}), fast } */
export async function playFarewell(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  const g = typeof d.garden === 'object' && d.garden ? d.garden : sh.building(d.garden || 'memorial_garden');
  if (!g) return;
  const k = d.fast ? 0.55 : 1;
  const slot = Math.max(0, Math.min(5, d.slot | 0));
  const gdepth = g.depth !== undefined ? g.depth : g.y;
  const st = sh.point('memorial_garden', g.x, g.y, 'stonePoints', slot) || { x: g.x, y: g.y - 13 };
  sh.reserve({ x: g.x - 220, y: g.y - 140, w: 440, h: 300 });
  sh.playMusic('bgm_farewell');
  // the new stone and its wreath
  sh.prop('memorial_stone', st.x, st.y, { depth: gdepth + 1 + st.y * 0.001 });
  const wr = sh.point('memorial_stone', st.x, st.y, 'wreathPoint') || { x: st.x, y: st.y - 18 };
  sh.prop('flower_wreath', st.x + 34, st.y + 4, { depth: gdepth + 1.2 + st.y * 0.001, delay: 400 });
  if (ctx.nameplate) ctx.nameplate(st.x, st.y - 14, lang === 'en' ? d.nameEn : d.nameKo, gdepth + 2);
  // the tree glows softly, snow drifts upward
  const tree = sh.point('memorial_garden', g.x, g.y, 'fxPoints') || null;
  const T = sh.art.def('memorial_garden');
  if (T && T.fxPoints && T.fxPoints.tree) glow(sh, g.x + T.fxPoints.tree[0], g.y + T.fxPoints.tree[1], gdepth + 3);
  if (T && T.fxPoints && T.fxPoints.lantern) glow(sh, g.x + T.fxPoints.lantern[0], g.y + T.fxPoints.lantern[1], gdepth + 3, 0.5, 0xffe2a8);
  upSnow(sh, g.x, g.y, 34 * k);
  // the chief at the garden gate, 콩이 sitting beside
  const gate = sh.point('memorial_garden', g.x, g.y, 'doorPoint') || { x: g.x, y: g.y + 62 };
  if (d.chief) { sh.place(d.chief, gate.x + 26, gate.y + 30, 'N'); sh.anim(d.chief, 'idle', { dir: 'N' }); }
  if (d.dog) { sh.place(d.dog, gate.x + 64, gate.y + 40, 'NW'); sh.anim(d.dog, 'sit', { dir: 'NW' }); }
  // the family at the stone, friends at the gather points
  const fam = (d.family || []).filter((p) => sh.hold(p)).slice(0, 2);
  const friends = (d.friends || []).filter((p) => sh.hold(p)).slice(0, 6);
  const mp = [sh.point('memorial_stone', st.x, st.y, 'mournerPoints', 0), sh.point('memorial_stone', st.x, st.y, 'mournerPoints', 1)];
  const arrive = [];
  fam.forEach((pid, i) => {
    const p = mp[i] || mp[0];
    sh.dress(pid, 'mourner_family');
    sh.place(pid, gate.x - 20 + i * 30, gate.y + 20, 'N');
    arrive.push(sh.walk(pid, p.x, p.y, { speed: 0.6 }).then(() => { sh.face(pid, p.dir || (i ? 'W' : 'E')); sh.anim(pid, 'sad', { face: 'sad' }); }));
  });
  const spots = [];
  for (let i = 0; i < 6; i++) { const p = sh.point('memorial_garden', g.x, g.y, 'gatherPoints', i); if (p) spots.push(p); }
  friends.forEach((pid, i) => {
    const p = spots[i % spots.length];
    sh.dress(pid, 'mourner');
    sh.place(pid, gate.x + (i % 3) * 18 - 18, gate.y + 30 + Math.floor(i / 3) * 14, 'N');
    arrive.push(sh.wait(0.6 * i * k).then(() => sh.walk(pid, p.x, p.y + 14, { speed: 0.6 })).then(() => { sh.face(pid, 'N'); sh.anim(pid, 'idle', { face: 'sad' }); }));
  });
  await Promise.race([Promise.all(arrive), sh.wait(12 * k)]);
  // gentle words
  if (fam[0]) { sh.say(fam[0], lang === 'en' ? 'We love you. We will remember.' : '사랑해요. 꼭 기억할게요.', 'emote_heart', 3); await sh.wait(3 * k); }
  // one by one, the flowers are laid at the stone
  const lay = sh.point('memorial_stone', st.x, st.y, 'layPoint') || { x: st.x, y: st.y + 16 };
  for (let i = 0; i < friends.length && !sh.cancelled; i++) {
    const pid = friends[i], back = spots[i % spots.length];
    await sh.walk(pid, lay.x + (i % 2 ? 10 : -10), lay.y + 10, { speed: 0.55 });
    sh.face(pid, 'N');
    sh.anim(pid, 'sad', { face: 'sad' });
    await sh.wait(1.3 * k);
    sh.prop('item_bouquet', st.x - 16 + i * 7, st.y + 10, { depth: gdepth + 1.1 + st.y * 0.001 + i * 0.0001 });
    sh.dress(pid, 'mourner', { remove: ['held_bouquet'] });
    if (i === 1) sh.say(pid, lang === 'en' ? 'Have a lovely journey.' : '좋은 여행 하세요.', 'emote_heart', 2.4);
    await sh.walk(pid, back.x, back.y + 14, { speed: 0.6 });
    sh.face(pid, 'N'); sh.anim(pid, 'idle', { face: 'sad' });
  }
  // warm hearts float up from the stone, a quiet moment
  sh.fx('fx_hearts', st.x, st.y - 30, { depth: gdepth + 4 });
  if (d.chief) sh.emote(d.chief, 'emote_heart', 2.4);
  await sh.wait(6 * k);
  sh.stopMusic();
  // the stone stays (StoryLife keeps the garden's stones); everything else is cleared without a poof
  const stone = sh.props.shift();
  if (stone && ctx.keepStone) ctx.keepStone(stone, slot);
}

/** a soft warm shimmer (small: on snow a big additive glow reads as fog) */
function glow(sh, x, y, depth, s = 1, tint = 0xffd9e6) {
  const img = sh.art.image(sh.scene, x, y, 'fx_glow');
  if (!img) return;
  img.setDepth(depth).setBlendMode(1).setScale(0.75 * s).setAlpha(0.22).setTint(tint);
  sh.props.push(img);
  sh.scene.tweens.add({ targets: img, alpha: 0.42, scale: 0.9 * s, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
}

/** light snow drifting upward over the garden (soft, slow, fading) */
function upSnow(sh, x, y, secs) {
  const scene = sh.scene;
  let t = 0;
  if (!scene.time) return;
  const ev = scene.time.addEvent({ delay: 320, loop: true, callback: () => {
    t += 0.32;
    if (t > secs || sh.cancelled) { ev.remove(false); return; }
    const f = sh.art.image(scene, x + (Math.random() - 0.5) * 300, y + 40 - Math.random() * 60, 'fx_snowflake');
    if (!f) return;
    f.setDepth(y + 400).setScale(0.1 + Math.random() * 0.1).setAlpha(0);
    scene.tweens.add({ targets: f, y: f.y - 150 - Math.random() * 80, x: f.x + (Math.random() - 0.5) * 40, alpha: { from: 0.85, to: 0 }, angle: 120, duration: 4200 + Math.random() * 1800, onComplete: () => f.destroy() });
  } });
}
