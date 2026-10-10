// 첫 등교 · 야외 수업 (docs/v5_v8_plan.md §6.1). At 7 a backpack appears; at 07:30 the child walks to the school gate
// with a parent, waves, walks in, looks back once (face S, emote_star) and the bell rings. On clear days the class
// has an outdoor lesson at 10:00 with the life2 desk rows (seated kids between the row and its front overlay).

/** first school day: data { child, parent (pids), school: building, fast } */
export async function playSchoolDay(sh, beat, ctx) {
  const d = beat.data || {};
  const lang = ctx.lang || 'ko';
  const k = d.fast ? 0.6 : 1;
  const sc = typeof d.school === 'object' && d.school ? d.school : sh.building(d.school || 'school');
  if (!sc || !sh.hold(d.child)) return;
  sh.hold(d.parent);
  sh.dress(d.child, null, { add: ['acc_backpack'] });
  const gate = sh.point('school', sc.x, sc.y, 'gatherPoints', 2) || { x: sc.x - 2, y: sc.y + 51 };
  const door = sh.point('school', sc.x, sc.y, 'doorPoint') || { x: sc.x - 120, y: sc.y + 21 };
  await Promise.all([sh.walk(d.child, gate.x, gate.y + 30, { speed: 0.75 }), d.parent ? sh.walk(d.parent, gate.x + 40, gate.y + 46, { speed: 0.75 }) : null].filter(Boolean));
  sh.faceTo(d.child, d.parent || { x: gate.x + 40, y: gate.y + 80 });
  sh.anim(d.child, 'wave');
  sh.say(d.child, lang === 'en' ? 'I’m off to school!' : '다녀오겠습니다!', 'emote_wave', 2.2);
  if (d.parent) { sh.anim(d.parent, 'wave'); sh.emote(d.parent, 'emote_love', 2); }
  await sh.wait(2.4 * k);
  await sh.walk(d.child, door.x + 18, door.y + 10, { speed: 0.7 });
  // a look back
  sh.face(d.child, 'S');
  sh.anim(d.child, 'happy');
  sh.emote(d.child, 'emote_star', 1.8);
  sh.sfx('sfx_school_bell', { volume: 0.7 });
  await sh.wait(1.8 * k);
  await sh.walk(d.child, door.x, door.y, { speed: 0.7 });
  if (ctx.hide) ctx.hide(d.child, true);
  await sh.wait(1.5 * k);
  if (ctx.hide) ctx.hide(d.child, false);
}

/** outdoor class: data { kids [pids], teacher (pid), school, rows: 2 } */
export async function playOutdoorClass(sh, beat, ctx) {
  const d = beat.data || {};
  const sc = typeof d.school === 'object' && d.school ? d.school : sh.building(d.school || 'school');
  if (!sc) return;
  const base = { x: sc.x + 190, y: sc.y + 150 };
  const rows = [];
  for (let r = 0; r < (d.rows || 2); r++) {
    const x = base.x - r * 66, y = base.y + r * 33;
    const row = sh.prop('school_desk_row', x, y, { depth: y });
    const front = sh.prop('school_desk_row_front', x, y, { depth: y + 1 });
    rows.push({ x, y, row, front });
  }
  const kids = (d.kids || []).filter((p) => sh.hold(p)).slice(0, rows.length * 3);
  kids.forEach((pid, i) => {
    const r = rows[Math.floor(i / 3)], s = sh.point('school_desk_row', r.x, r.y, 'seatPoints', i % 3);
    if (!s) return;
    sh.walk(pid, s.x, s.y + 24, { speed: 1 }).then(() => { sh.place(pid, s.x, s.y, s.dir || 'SW'); sh.anim(pid, 'sit', { dir: s.dir || 'SW', depth: r.y + 0.5 }); });
  });
  if (d.teacher && sh.hold(d.teacher)) { await sh.walk(d.teacher, base.x - 120, base.y - 40, { speed: 0.8 }); sh.face(d.teacher, 'SE'); sh.anim(d.teacher, 'talk'); }
  await sh.wait(12);
}
