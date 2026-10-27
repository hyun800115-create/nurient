// portrait store shot staging: a = { x, y, z (game zoom), hour, run, settle, hideWorld, hideKeys, hideAbove, noOcc, chief, rigs, pool, hud: { hide: [regex strings] } }
(a) => {
  const F = window.__FV, gs = F.scene, B = window.__B, game = F.game;
  if (a.rigs) { B.v4.perf.maxRigs = a.rigs; B.v4.perf.maxLite = a.rigs * 2; }
  if (a.pool) gs.ground.pool = a.pool;
  if (a.noOcc && !gs.__occOff) { gs.__occOff = true; gs.occlusion.update = () => {}; }
  if (a.chief) F.teleport(a.chief[0], a.chief[1]);
  if (a.hour !== undefined) window.__day(a.hour);
  if (a.x !== undefined) F.camera(a.x, a.y, a.z);
  if (a.run) window.__run(a.run);
  if (a.settle && gs.v4 && gs.v4.clock) { const ck = gs.v4.clock, t = ck.target(ck.hour()); ck.cur = { r: (t.color >> 16) & 255, g: (t.color >> 8) & 255, b: t.color & 255, a: t.a }; window.__run(0.1); ck.ligT = 1e6; window.__run(0.1); }
  if (a.x !== undefined) F.camera(a.x, a.y, a.z);
  for (let i = 0; i < 6; i++) window.__draw();
  const c = gs.cameras.main, z = c.zoom, w = c.width / z, h = c.height / z, x = c.midPoint.x, y = c.midPoint.y;
  try { if (gs.ground && gs.ground.ensure) gs.ground.ensure({ x: x - w / 2 - 200, y: y - h / 2 - 200, right: x + w / 2 + 200, bottom: y + h / 2 + 200 }, Infinity, 400); } catch (e) { /* */ }
  for (let i = 0; i < (a.noFade ? 8 : 40); i++) window.__draw();
  if (gs.__occOff) for (const o of (gs.occluders || [])) { o.a = 1; o.want = 1; if (o.img) o.img.setAlpha(1); }
  // restore anything hidden by an earlier call, then hide again for this view
  for (const o of (window.__hidden || [])) { delete o.willRender; }
  window.__hidden = [];
  const hidden = window.__hidden;
  if (a.hideWorld) {
    const keep = /^(서리역|솔방울 마을|솔방울역)$/;
    const hasLabel = (o) => o.list && o.list.some((q) => q.type === 'Text' || q.type === 'NineSlice' || hasLabel(q));
    for (const o of gs.children.list) {
      if (!o.visible) continue;
      let hh = false;
      if (o.type === 'Container' && hasLabel(o)) hh = true;
      else if (o.type === 'Text' && !keep.test(o.text)) hh = true;
      else if (o.type === 'NineSlice') hh = true;
      else if (a.hideKeys && o.texture && a.hideKeys.some((k) => (o.texture.key + ':' + (o.frame && o.frame.name)).indexOf(k) >= 0)) hh = true;
      else if (a.hideAbove !== undefined && o.texture && o.texture.key === 'props_items' && o.y < a.hideAbove) hh = true;
      if (hh) { o.willRender = () => false; hidden.push(o); }
    }
  }
  if (a.noDog && gs.dog && gs.dog.r) { for (const o of [gs.dog.r.sprite, gs.dog.r.shadow]) if (o) { o.willRender = () => false; hidden.push(o); } }
  if (a.noDog) {
    const dogs = gs.children.list.filter((o) => o.texture && /pet_dog|pets2_pet_dog/.test(o.texture.key));
    for (const d of dogs) {
      d.willRender = () => false; hidden.push(d);
      for (const o of gs.children.list) if (o.texture && o.texture.key === 'fv_shadow' && Math.abs(o.x - d.x) < 26 && Math.abs(o.y - d.y) < 16) { o.willRender = () => false; hidden.push(o); }
    }
  }
  const ui = game.scene.getScene('UI');
  if (a.coins) { const e = gs.economy; F.give(a.coins - e.coins); }
  // transient UI: toasts, banners, the what's-new card, open panels
  try { const v = F.v42 && F.v42.v; if (v && !v.seen.whatsNew) { v.seen.whatsNew = 1; if (ui.hud42 && ui.hud42.closeCard) ui.hud42.closeCard(); } } catch (e) { /* */ }
  try { if (ui.hud42 && ui.hud42.closeTrainCard) ui.hud42.closeTrainCard(); } catch (e) { /* */ }
  if (!a.keepBanner && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); }
  if (ui.toastBox && ui.toastBox.visible) { ui.tweens.killTweensOf(ui.toastBox); ui.toastBox.setVisible(false); }
  if (!a.noFade) window.__run(1.2);
  const uiHidden = [];
  if (a.hud && a.hud.keys) { const walkU = (list) => { for (const o of list) { if (!o.visible) continue; if (o.texture && a.hud.keys.some((k) => (o.texture.key + ':' + (o.frame && o.frame.name)).indexOf(k) >= 0)) { o.willRender = () => false; hidden.push(o); uiHidden.push('key:' + o.texture.key + ':' + (o.frame && o.frame.name)); } else if (o.list) walkU(o.list); } }; walkU(ui.children.list); }
  if (a.hud && a.hud.offscreen) { for (const o of ui.children.list) { if (!o.visible || o.type !== 'Container') continue; const t = o.list.map((q) => q.text).filter(Boolean).join('|'); if (/^\d+m$/.test(t)) { o.willRender = () => false; hidden.push(o); uiHidden.push('off:' + t); } } }
  if (a.hud && a.hud.obj) for (const n of a.hud.obj) { const o = ui[n]; if (o) { o.willRender = () => false; hidden.push(o); uiHidden.push(n); } }
  if (a.hud && a.hud.hide) {
    const res = a.hud.hide.map((s) => new RegExp(s));
    for (const o of ui.children.list) {
      if (!o.visible) continue;
      const t = o.text || (o.list ? o.list.map((q) => q.text).filter(Boolean).join('|') : '');
      if (t && res.some((r) => r.test(t))) { o.willRender = () => false; hidden.push(o); uiHidden.push(t.slice(0, 30)); }
    }
  }
  if (a.follow) { const p = gs.player; F.camera(p.x + (a.follow[0] || 0), p.y + (a.follow[1] || 0), a.z); for (let i = 0; i < 30; i++) window.__draw(); }
  for (let i = 0; i < 4; i++) window.__draw();
  return { mid: [Math.round(c.midPoint.x), Math.round(c.midPoint.y)], zoom: +c.zoom.toFixed(3), hidden: hidden.length, uiHidden, clock: gs.v4 && gs.v4.clock.state() };
}
