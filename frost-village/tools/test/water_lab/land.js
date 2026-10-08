// Land for the water lab: baked once into canvas textures like src/systems/Ground.js does.
// bakeVillageLand() is a copy of Ground.bakeChunk's shoreline part (snow fill, shallow band, icy rim,
// shore_foam strip) so mode=old reproduces today's coast exactly and mode=new shows the coast with the
// Water module (no baked shallow band / foam strip / water-side rim stroke — Water draws those live).

const GROUND = -15000;   // DEPTH.GROUND

function pattern(ctx, scene, key, scale = 1, ox = 0, oy = 0) {
  if (!key || !scene.textures.exists(key)) return null;
  const img = scene.textures.get(key).getSourceImage();
  const p = ctx.createPattern(img, 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(ox, oy).scale(scale));
  return p;
}

let n = 0;
function canvasTex(scene, w, h) {
  const key = 'lab_land_' + (n++);
  const ct = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  return { key, ct, ctx: ct.context };
}

/** the village coast: land below shoreY(x) inside `view` */
export function bakeVillageLand(scene, view, shoreY, o) {
  const { key, ct, ctx } = canvasTex(scene, view.w, view.h);
  const x0 = view.x, y0 = view.y, w = view.w, h = view.h;
  ctx.save();
  ctx.translate(-x0, -y0);
  const xa = x0 - 16, xb = x0 + w + 16;
  const land = () => {
    ctx.beginPath();
    ctx.moveTo(xa, shoreY(xa));
    for (let x = xa; x <= xb; x += 8) ctx.lineTo(x, shoreY(x));
    ctx.lineTo(xb, shoreY(xb)); ctx.lineTo(xb, y0 + h + 10); ctx.lineTo(xa, y0 + h + 10); ctx.closePath();
  };
  if (o.shallow) {
    // Ground.drawShallow: water_shallow pattern masked by a 130 px gradient band above the shore
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.translate(-x0, -y0);
    g.fillStyle = pattern(g, scene, 'water_shallow') || 'rgba(120,200,230,1)';
    g.fillRect(x0, y0, w, h);
    const m = document.createElement('canvas');
    m.width = w; m.height = h;
    const mg = m.getContext('2d');
    mg.translate(-x0, -y0);
    const band = 130;
    for (let x = x0 - 6; x < x0 + w + 6; x += 6) {
      const sy = shoreY(x + 3);
      const gr = mg.createLinearGradient(0, sy - band, 0, sy + 6);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0.85)');
      mg.fillStyle = gr;
      mg.fillRect(x, sy - band, 6, band + 6);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(m, 0, 0);
    ctx.drawImage(c, x0, y0);
  }
  ctx.fillStyle = pattern(ctx, scene, 'ground_snow') || '#eef3f9';
  land(); ctx.fill();
  // icy rim + wet edge (Ground.bakeShore)
  ctx.save();
  ctx.lineJoin = 'round';
  const line = (off) => { ctx.beginPath(); for (let x = xa - 8; x <= xb + 8; x += 8) { const y = shoreY(x) + off; if (x <= xa - 8) ctx.moveTo(x, y); else ctx.lineTo(x, y); } };
  ctx.strokeStyle = 'rgba(201,214,232,0.9)'; ctx.lineWidth = 12; line(6); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 7; line(1); ctx.stroke();
  if (o.rimWater) { ctx.strokeStyle = 'rgba(156,199,230,0.55)'; ctx.lineWidth = 5; line(-6); ctx.stroke(); }
  ctx.restore();
  if (o.foam && scene.textures.exists('shore_foam')) {
    const img = scene.textures.get('shore_foam').getSourceImage();
    const fw = img.width, fh = img.height, lip = 0.69 * fh, seg = 32;
    const s0 = Math.floor(xa / seg) * seg - seg;
    for (let x = s0; x < xb + seg; x += seg) {
      const y1 = shoreY(x), y2 = shoreY(x + seg);
      const ang = Math.atan2(y2 - y1, seg);
      ctx.save();
      ctx.translate(x, y1 + 4);
      ctx.rotate(ang);
      const sx = x + seg;
      const u = ((sx % fw) + fw) % fw;
      const sw = Math.min(seg + 1, fw - u);
      ctx.drawImage(img, u, 0, sw, fh, 0, -lip, sw + 0.6, fh);
      ctx.restore();
    }
  }
  ctx.restore();
  ct.refresh();
  return scene.add.image(x0, y0, key).setOrigin(0, 0).setDepth(GROUND);
}

/** a land polygon (flat world px array) filled with a ground texture (or a generated sand), soft rim */
export function bakeTexturedLand(scene, poly, texKey, o = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1]); }
  if (o.region) { x0 = Math.max(x0, o.region.x); y0 = Math.max(y0, o.region.y); x1 = Math.min(x1, o.region.x + o.region.w); y1 = Math.min(y1, o.region.y + o.region.h); }
  x0 = Math.floor(x0) - 4; y0 = Math.floor(y0) - 4; x1 = Math.ceil(x1) + 4; y1 = Math.ceil(y1) + 4;
  const { key, ct, ctx } = canvasTex(scene, x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(-x0, -y0);
  const path = () => { ctx.beginPath(); for (let i = 0; i < poly.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, poly[i], poly[i + 1]); ctx.closePath(); };
  let fill = pattern(ctx, scene, texKey, 1, 0, 0);
  if (!fill && o.sandRamp) fill = ctx.createPattern(sandCanvas(scene), 'repeat');
  ctx.fillStyle = fill || '#eef3f9';
  path(); ctx.fill();
  if (o.sandRamp || /sand/.test(texKey || '')) {
    // a band of permanently damp sand along the waterline (the live wet band comes from Water.js)
    ctx.save();
    path(); ctx.clip();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(176,146,104,0.22)'; ctx.lineWidth = 46; path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,128,88,0.20)'; ctx.lineWidth = 20; path(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ct.refresh();
  return scene.add.image(x0, y0, key).setOrigin(0, 0).setDepth(GROUND);
}

/** fallback sand texture (until assets/beach ground_sand exists): ramp colours + fine grain + ripples */
function sandCanvas(scene) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const id = g.createImageData(S, S);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const base = [243, 230, 203], dark = [222, 202, 164];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const rip = 0.5 + 0.5 * Math.sin((x + 2 * y) * (Math.PI * 2 / 64) + Math.sin(y * Math.PI * 2 / 128) * 1.5);
    const n = rnd();
    const t = Math.min(1, Math.max(0, rip * 0.35 + (n - 0.5) * 0.35));
    const i = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) id.data[i + k] = Math.round(base[k] * (1 - t) + dark[k] * t + (n > 0.985 ? 18 : 0));
    id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  void scene;
  return c;
}
