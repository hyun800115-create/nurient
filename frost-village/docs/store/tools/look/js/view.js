// a = { x, y, z (canvas px per world px), hour, run (s), hide (labels), rigs }
(a) => {
  const F = window.__FV, gs = F.scene, B = window.__B;
  if (a.rigs) { B.v4.perf.maxRigs = a.rigs; B.v4.perf.maxLite = a.rigs * 2; B.v4.perf.margin = 400; B.v4.perf.near = 3000; B.v4.perf.maxGlows = 400; }
  if (a.pool) gs.ground.pool = a.pool;
  if (a.noOcc && !gs.__occOff) { gs.__occOff = true; gs.occlusion.update = () => {}; }
  if (a.chief) F.teleport(a.chief[0], a.chief[1]);
  if (a.hour !== undefined) window.__day(a.hour);
  F.camera(a.x, a.y, 0.5);
  const cam = gs.cameras.main; cam.removeBounds(); gs._freeCam = true;
  gs.zoomCur = gs.zoomTarget = a.z / window.__View.k; cam.setZoom(a.z);
  gs.camTarget.x = a.x; gs.camTarget.y = a.y; cam.centerOn(a.x, a.y);
  if (a.run) window.__run(a.run);
  if (a.settle && gs.v4 && gs.v4.clock) { const ck = gs.v4.clock, t = ck.target(ck.hour()); ck.cur = { r: (t.color >> 16) & 255, g: (t.color >> 8) & 255, b: t.color & 255, a: t.a }; window.__run(0.1); ck.ligT = 1e6; window.__run(0.1); }
  cam.setZoom(a.z); cam.centerOn(a.x, a.y);
  for (let i = 0; i < 6; i++) window.__draw();
  const c = cam, z = c.zoom, w = c.width / z, h = c.height / z, x = c.midPoint.x, y = c.midPoint.y;
  try { if (gs.ground && gs.ground.ensure) gs.ground.ensure({ x: x - w / 2 - 200, y: y - h / 2 - 200, right: x + w / 2 + 200, bottom: y + h / 2 + 200 }, Infinity, 400); } catch (e) { /* */ }
  for (let i = 0; i < 40; i++) window.__draw();
  if (gs.__occOff) for (const o of (gs.occluders || [])) { o.a = 1; o.want = 1; if (o.img) o.img.setAlpha(1); }
  const hidden = [];
  if (a.hide) {
    const keep = /^(서리역|솔방울 마을|솔방울역)$/;
    const hasLabel = (o) => o.list && o.list.some((q) => q.type === 'Text' || q.type === 'NineSlice' || hasLabel(q));
    for (const o of gs.children.list) {
      if (!o.visible || o.__hid) continue;
      let h = false;
      if (o.type === 'Container' && hasLabel(o)) h = true;
      else if (o.type === 'Text' && !keep.test(o.text)) h = true;
      else if (o.type === 'NineSlice') h = true;
      else if (a.hideKeys && o.texture && a.hideKeys.some((k) => (o.texture.key + ':' + (o.frame && o.frame.name)).indexOf(k) >= 0)) h = true;
      else if (a.hideAbove !== undefined && o.texture && o.texture.key === 'props_items' && o.y < a.hideAbove) h = true;
      if (h) { o.willRender = () => false; hidden.push(o); }
    }
    window.__hidden = (window.__hidden || []).concat(hidden);
  }
  for (let i = 0; i < 3; i++) window.__draw();
  return { mid: [Math.round(c.midPoint.x), Math.round(c.midPoint.y)], zoom: c.zoom, wv: [Math.round(c.worldView.x), Math.round(c.worldView.y), Math.round(c.worldView.width), Math.round(c.worldView.height)], hidden: hidden.length, clock: gs.v4 && gs.v4.clock.state() };
}
