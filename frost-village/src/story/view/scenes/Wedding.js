// 결혼식 (docs/v5_v8_plan.md §6.1 "Wedding"): our 마을회관 dressed with the life2 wedding layout; at 10:30 the guests
// change into their best (wedding_guest, kids flower_crown) with a sparkle and take the chairs; at 11:00 two bells,
// bgm_wedding, the bride walks the aisle while the groom waits sweating; vows, hearts, everyone claps, a photo flash;
// the couple cuts the cake with the kids stuck to the table; a first dance in the snow; the props vanish with a poof.
// 60–90 game seconds. The chief stands at the officiant point (C2 speech).

const LAYOUT = 'wedding_town_hall';

/** opts: { a, b (pids), guests [pids], kids [pids], chief (pid), hall: { x, y } | building id, fast (lab: shorter waits) } */
export async function playWedding(sh, beat, ctx) {
  const art = sh.art, lang = ctx.lang || 'ko';
  const d = beat.data || {};
  const hall = typeof d.hall === 'object' && d.hall ? d.hall : sh.building(d.hall || 'town_hall');
  if (!hall) return;
  const L = (art.layout && art.layout(LAYOUT)) || null;
  const k = d.fast ? 0.5 : 1;
  const H = { x: hall.x, y: hall.y };
  // ---- the props (life2 layout, offsets from the town hall anchor)
  let arch = null, carpet = null, cake = null;
  const chairs = [];
  const items = L ? L.items : [];
  items.forEach((it, i) => {
    const x = H.x + it.px[0], y = H.y + it.px[1];
    const opts = { delay: i * 70 };
    if (it.layer === 'ground') opts.depth = 'ground';
    if (it.sprite === 'ribbon_garland') opts.depth = (hall.depth || H.y) + 1;
    const img = sh.prop(it.sprite, x, y, opts);
    if (it.sprite === 'wedding_arch') arch = { x, y };
    if (it.sprite === 'wedding_carpet') carpet = { x, y };
    if (it.sprite === 'wedding_cake_table') cake = { x, y };
    if (it.sprite === 'wedding_chairs') chairs.push({ x, y, img });
  });
  if (!arch) arch = { x: H.x - 324, y: H.y + 162 };
  if (!carpet) carpet = { x: H.x - 215, y: H.y + 107 };
  if (!cake) cake = { x: H.x - 138, y: H.y + 218 };
  const seats = [];
  for (const c of chairs) for (let s = 0; s < 3; s++) { const p = sh.point('wedding_chairs', c.x, c.y, 'seatPoints', s); if (p) seats.push(Object.assign(p, { depth: c.y + 1 + s * 0.01 })); }
  seats.sort((p, q) => p.y - q.y);
  const stand = (L && L.standPoints ? L.standPoints : []).map((v, i) => ({ x: H.x + v[0], y: H.y + v[1], dir: (L.standDirs || [])[i] || 'SW' }));
  const door = sh.point('town_hall', H.x, H.y, 'doorPoint') || { x: H.x - 127, y: H.y + 63 };
  const aisle0 = sh.point('wedding_carpet', carpet.x, carpet.y, 'aislePoints', 0), aisle1 = sh.point('wedding_carpet', carpet.x, carpet.y, 'aislePoints', 1);
  const cp0 = sh.point('wedding_arch', arch.x, arch.y, 'couplePoints', 0), cp1 = sh.point('wedding_arch', arch.x, arch.y, 'couplePoints', 1);
  const off = sh.point('wedding_arch', arch.x, arch.y, 'officiantPoint') || { x: arch.x, y: arch.y - 30 };
  const heart = sh.point('wedding_arch', arch.x, arch.y, 'fxPoints') || null;
  const heartXY = { x: arch.x, y: arch.y - 116 };
  // the wedding ground stays clear of everyday walkers (layout items + stand points, with a margin)
  { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of items.map((it) => ({ x: H.x + it.px[0], y: H.y + it.px[1] })).concat(stand)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (x1 > x0) sh.reserve({ x: x0 - 60, y: y0 - 40, w: x1 - x0 + 120, h: y1 - y0 + 110 }); }

  // ---- 10:30: the guests come in their best clothes and sit down
  const guests = (d.guests || []).filter((p) => p !== d.a && p !== d.b && sh.hold(p));
  const kids = new Set(d.kids || []);
  const seated = [], standing = [];
  guests.forEach((pid, i) => { if (seats[i]) seated.push([pid, seats[i]]); else if (stand[i - seats.length]) standing.push([pid, stand[i - seats.length]]); });
  const enter = async ([pid, spot], i, sit) => {
    await sh.wait(0.35 * i * k);
    const b = sh.body(pid);
    if (!b) return;
    sh.place(pid, door.x - 30 + (i % 3) * 14, door.y + 6 + (i % 2) * 8, 'SW');
    sh.dress(pid, kids.has(pid) ? 'flower_girl' : 'wedding_guest');
    sh.fx('fx_sparkle', door.x, door.y - 40);
    await sh.walk(pid, spot.x, spot.y + (sit ? 26 : 0), { speed: 1.1 });
    if (sit) { sh.place(pid, spot.x, spot.y, spot.dir || 'SW'); sh.anim(pid, 'sit', { dir: spot.dir || 'SW', depth: spot.depth }); }
    else { sh.face(pid, spot.dir || 'SW'); sh.anim(pid, 'idle'); }
  };
  const all = seated.map((s, i) => enter(s, i, true)).concat(standing.map((s, i) => enter(s, seated.length + i, false)));
  // the groom waits at the arch, a little nervous
  if (d.b && sh.hold(d.b)) { sh.place(d.b, cp1.x + 40, cp1.y + 30, 'NW'); sh.dress(d.b, 'groom'); sh.walk(d.b, cp1.x, cp1.y, { speed: 0.8 }).then(() => { sh.face(d.b, cp1.dir || 'W'); sh.anim(d.b, 'idle'); }); }
  if (d.chief) { sh.place(d.chief, off.x, off.y, 'S'); sh.anim(d.chief, 'idle', { dir: 'S' }); }
  await Promise.race([Promise.all(all), sh.wait(14 * k)]);
  sh.emote(d.b, 'emote_sweat', 2.4);

  // ---- 11:00: bells, the march, the bride walks the aisle
  sh.sfx('sfx_bell_hall', { volume: 0.8 });
  await sh.wait(1.6 * k);
  sh.sfx('sfx_bell_hall', { volume: 0.7 });
  sh.playMusic('bgm_wedding');
  if (d.a && sh.hold(d.a)) {
    sh.dress(d.a, 'bride');
    sh.place(d.a, door.x, door.y, 'SW');
    sh.fx('fx_sparkle', door.x, door.y - 50);
    await sh.walk(d.a, aisle0.x, aisle0.y, { speed: 0.7 });
    // a flower girl walks ahead scattering petals
    const fg = guests.find((p) => kids.has(p));
    if (fg) { sh.walk(fg, aisle1.x - 20, aisle1.y + 18, { speed: 0.75 }); petals(sh, fg, 5.5 * k); }
    await sh.walk(d.a, cp0.x, cp0.y, { speed: 0.55 });
    sh.face(d.a, cp0.dir || 'E');
    sh.anim(d.a, 'idle');
  }
  // ---- vows, hearts, everyone claps
  await sh.wait(0.8 * k);
  if (d.chief) { sh.say(d.chief, lang === 'en' ? 'Congratulations to you both!' : '두 분의 결혼을 진심으로 축하합니다!', 'emote_heart', 2.6); await sh.wait(2.4 * k); }
  sh.anim(d.a, 'talk'); sh.say(d.a, lang === 'en' ? 'Together, always.' : '평생 함께할게요.', 'emote_love', 2.4);
  await sh.wait(2.2 * k);
  sh.anim(d.b, 'talk'); sh.say(d.b, lang === 'en' ? 'Always!' : '네! 평생이요!', 'emote_love', 2.2);
  await sh.wait(1.8 * k);
  sh.fx('fx_hearts', heartXY.x, heartXY.y, { depth: arch.y + 200 });
  sh.emote(d.a, 'emote_love', 2.5); sh.emote(d.b, 'emote_love', 2.5);
  sh.anim(d.a, 'happy'); sh.anim(d.b, 'happy');
  for (const [pid] of standing) sh.anim(pid, 'clap');
  seated.forEach(([pid], i) => { if (i % 3 === 0) sh.emote(pid, i % 2 ? 'emote_heart' : 'emote_star', 2); });
  sh.sfx('sfx_cheer', { volume: 0.5 });
  // the photo
  await sh.wait(1.6 * k);
  if (ctx.flash) ctx.flash(beat.camera ? 1.25 : 1);
  sh.sfx('sfx_click', { volume: 0.7 });
  await sh.wait(2.2 * k);
  // ---- the cake, kids stuck to the table
  const sp0 = sh.point('wedding_cake_table', cake.x, cake.y, 'servePoints', 0), sp1 = sh.point('wedding_cake_table', cake.x, cake.y, 'servePoints', 1);
  const toCake = [d.a && sp0 ? sh.walk(d.a, sp0.x, sp0.y, { speed: 0.8 }) : null, d.b && sp1 ? sh.walk(d.b, sp1.x, sp1.y, { speed: 0.8 }) : null].filter(Boolean);
  const kidList = guests.filter((p) => kids.has(p)).slice(0, 3);
  kidList.forEach((pid, i) => sh.walk(pid, cake.x - 36 + i * 36, cake.y + 34 + (i % 2) * 8, { speed: 1.2 }).then(() => { sh.face(pid, 'N'); sh.anim(pid, 'happy'); sh.emote(pid, 'emote_star', 2); }));
  await Promise.race([Promise.all(toCake), sh.wait(6 * k)]);
  if (d.a) sh.face(d.a, 'S'); if (d.b) sh.face(d.b, 'S');
  sh.anim(d.a, 'happy'); sh.anim(d.b, 'happy');
  sh.fx('fx_sparkle', cake.x, cake.y - 70);
  await sh.wait(3 * k);
  // ---- a first dance in the snow, in front of the arch
  const cx = arch.x + 10, cy = arch.y + 90;
  for (let step = 0; step < 6 && !sh.cancelled; step++) {
    const a1 = (step / 6) * Math.PI * 2;
    const ax = cx + Math.cos(a1) * 34, ay = cy + Math.sin(a1) * 17, bx = cx - Math.cos(a1) * 34, by = cy - Math.sin(a1) * 17;
    if (step === 0) sh.fx('fx_music_notes', cx, cy - 90, { depth: cy + 300 });
    await Promise.all([d.a ? sh.walk(d.a, ax, ay, { speed: 0.55 }) : null, d.b ? sh.walk(d.b, bx, by, { speed: 0.55 }) : null].filter(Boolean));
  }
  if (d.a && d.b) { sh.faceTo(d.a, d.b); sh.faceTo(d.b, d.a); sh.anim(d.a, 'happy'); sh.anim(d.b, 'happy'); }
  await sh.wait(4 * k);
  // (18:00) the props vanish with a poof; the guests stand up and go back to their day
  sh.stopMusic();
}

/** soft petals behind a walking flower girl (fx_heart / fx_spark particles) */
function petals(sh, pid, secs) {
  const scene = sh.scene;
  let t = 0;
  const ev = scene.time && scene.time.addEvent ? scene.time.addEvent({ delay: 260, loop: true, callback: () => {
    t += 0.26;
    const b = sh.body(pid);
    if (!b || t > secs || sh.cancelled) { ev.remove(false); return; }
    const p = sh.art.image(scene, b.x + (Math.random() - 0.5) * 16, b.y - 6, Math.random() < 0.5 ? 'fx_heart' : 'fx_spark');
    if (!p) return;
    p.setScale(0.35).setDepth(b.y - 1).setTint(Math.random() < 0.5 ? 0xffb7c9 : 0xffffff);
    scene.tweens.add({ targets: p, y: p.y + 10, alpha: 0, angle: 90, duration: 1600, onComplete: () => p.destroy() });
  } }) : null;
}
