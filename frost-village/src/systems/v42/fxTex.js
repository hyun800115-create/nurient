// (v4.2 CODE-1) generated placeholder textures for the chief's halo and the navigator (docs/v42_plan.md §3.1, §3.4).
// CODE-2 swaps them for the chief_fx art (CONTRACT_V42 AG) by key: every user asks art(key, fallback) first.
//   fv_halo / fv_halo_gold / fv_halo_rank2   192 x 96 (rank2 216 x 108) iso ellipse rings
//   fv_halo_glow                             160 x 192 radial back glow (광채)
//   fv_halo_mote                             16 x 16 four-point sparkle
//   fv_halo_pin                              72 x 88 teal badge with a gold star (the 별 표시)
//   fv_nav_chevron                           16 frames 64 x 40 (frame k points at screen angle k x 22.5°, ground-projected)
//   fv_nav_dot                               2 frames 28 x 14 (normal, highlight)
//   fv_nav_ring                              160 x 80 dashed ground ring
//   fv_nav_edge                              80 x 80 round edge badge with an arrow notch on its right

import { Assets } from '../../core/Assets.js';

const TAU = Math.PI * 2;

/** a CanvasTexture drawn once (or reused) */
function canvasTex(scene, key, w, h, draw) {
  const T = scene.textures;
  if (T.exists(key)) return key;
  const c = T.createCanvas(key, w, h);
  if (!c) return null;
  try { draw(c.context, w, h, c); } catch (e) { /* a blank texture is still a texture */ }
  c.refresh();
  return key;
}

/** the real art when it is there, else the generated stand-in (made on first use) */
export function art(scene, key, fallback) {
  try { if (Assets.has(key)) return { key, art: true }; } catch (e) { /* manifest not merged */ }
  makeAll(scene);
  return { key: fallback, art: false };
}

function ring(ctx, cx, cy, rx, ry, width, stroke) {
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke();
}

function haloRing(ctx, w, h, colors, gold, glowA) {
  const cx = w / 2, cy = h / 2, rx = w / 2 - 10, ry = h / 2 - 6;
  // soft outer glow
  ctx.save();
  ctx.shadowColor = colors[0]; ctx.shadowBlur = 8;
  for (let i = 0; i < 3; i++) ring(ctx, cx, cy, rx + 2, ry + 1, 6, 'rgba(255,255,255,' + glowA + ')');
  ctx.restore();
  // dark teal rim so it reads on snow
  ring(ctx, cx, cy, rx + 2.5, ry + 1.5, 1.4, 'rgba(31,143,134,0.55)');
  // the ring: a gradient travelling round (mint -> sky -> lilac)
  const g = ctx.createLinearGradient(0, 0, w, 0);
  colors.forEach((c, i) => g.addColorStop(i / Math.max(1, colors.length - 1), c));
  ring(ctx, cx, cy, rx, ry, 3.4, g);
  // warm inner line
  ring(ctx, cx, cy, rx - 2.6, ry - 1.6, 1, gold);
  // six tiny stars on the ring
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    star4(ctx, x, y, 3.2, 1);
  }
}

function star4(ctx, x, y, r, inner) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
function star5(ctx, x, y, r, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

/** make every placeholder (cheap: a few small canvases) */
export function makeAll(scene) {
  if (!scene || !scene.textures || scene.textures.exists('fv_nav_edge')) return;
  canvasTex(scene, 'fv_halo', 192, 96, (ctx, w, h) => haloRing(ctx, w, h, ['#43E0C6', '#7FB2FF', '#B79CFF', '#43E0C6'], 'rgba(255,211,106,0.6)', 0.25));
  canvasTex(scene, 'fv_halo_gold', 192, 96, (ctx, w, h) => {
    haloRing(ctx, w, h, ['#FFC84A', '#FFE9A0', '#FFC84A'], 'rgba(255,255,255,0.7)', 0.4);
    // sun-ray ticks
    ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = 2;
    const cx = w / 2, cy = h / 2;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (w / 2 - 7), cy + Math.sin(a) * (h / 2 - 4)); ctx.lineTo(cx + Math.cos(a) * (w / 2 - 1), cy + Math.sin(a) * (h / 2 - 1)); ctx.stroke(); }
  });
  canvasTex(scene, 'fv_halo_rank2', 216, 108, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ring(ctx, cx, cy, w / 2 - 4, h / 2 - 3, 2, 'rgba(255,200,74,0.95)');
    ring(ctx, cx, cy, w / 2 - 9, h / 2 - 5.5, 1, 'rgba(255,233,160,0.9)');
  });
  canvasTex(scene, 'fv_halo_glow', 160, 192, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, w / 2);
    g.addColorStop(0, 'rgba(255,231,163,0.55)'); g.addColorStop(0.45, 'rgba(200,240,220,0.25)'); g.addColorStop(0.75, 'rgba(183,156,255,0.12)'); g.addColorStop(1, 'rgba(183,156,255,0)');
    ctx.save(); ctx.translate(w / 2, h * 0.55); ctx.scale(1, h / w); ctx.translate(-w / 2, -h * 0.55);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
  });
  canvasTex(scene, 'fv_halo_mote', 16, 16, (ctx) => { ctx.fillStyle = 'rgba(255,236,170,1)'; star4(ctx, 8, 8, 7.5, 1.8); ctx.fillStyle = '#ffffff'; star4(ctx, 8, 8, 4, 1); });
  canvasTex(scene, 'fv_halo_pin', 72, 88, (ctx) => {
    ctx.fillStyle = 'rgba(31,51,84,0.35)'; ctx.beginPath(); ctx.arc(37, 36, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2CB7A8'; ctx.beginPath(); ctx.arc(36, 33, 29, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(26, 56); ctx.lineTo(36, 86); ctx.lineTo(46, 56); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(36, 33, 27.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#FFD36A'; star5(ctx, 36, 34, 18, 7.5);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(36, 6, 5, 4, 0, 0, TAU); ctx.fill();
  });
  // ground chevrons: 16 frames, frame k points at screen angle k x 22.5° (0 = right, clockwise), squashed onto the ground
  canvasTex(scene, 'fv_nav_chevron', 64 * 16, 40, (ctx, w, h, c) => {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, tg = Math.atan2(2 * Math.sin(a), Math.cos(a));
      const ox = k * 64 + 32, oy = 20;
      const P = (u, v) => [ox + (u * Math.cos(tg) - v * Math.sin(tg)), oy + (u * Math.sin(tg) + v * Math.cos(tg)) * 0.5];
      const chev = (du) => [P(-8 + du, -14), P(6 + du, 0), P(-8 + du, 14), P(-14 + du, 14), P(0 + du, 0), P(-14 + du, -14)];
      for (const du of [-6, 10]) {
        const pts = chev(du);
        ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
        ctx.fillStyle = '#2CB7A8'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }
      c.add('c' + k, 0, k * 64, 0, 64, 40);
    }
  });
  canvasTex(scene, 'fv_nav_dot', 56, 14, (ctx, w, h, c) => {
    for (let k = 0; k < 2; k++) {
      const ox = k * 28 + 14;
      ctx.fillStyle = k ? '#FFD36A' : '#2CB7A8'; ctx.beginPath(); ctx.ellipse(ox, 7, 12, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = k ? '#ffffff' : 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(ox, 7, 6, 3, 0, 0, TAU); ctx.fill();
      c.add('d' + k, 0, k * 28, 0, 28, 14);
    }
  });
  canvasTex(scene, 'fv_nav_ring', 160, 80, (ctx, w, h) => {
    ctx.lineWidth = 5;
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * TAU, a1 = a0 + TAU / 24;
      ctx.strokeStyle = k % 2 ? '#FFD36A' : '#2CB7A8';
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2 - 6, h / 2 - 4, 0, a0, a1); ctx.stroke();
    }
  });
  // HUD icons until ui5 lands (96 x 96, soft-toy style: dark rim, light top-left)
  const icon = (key, draw) => canvasTex(scene, key, 96, 96, (ctx) => { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; draw(ctx); });
  const blob = (ctx, path, fill, rim) => { ctx.beginPath(); path(ctx); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = rim; ctx.stroke(); };
  icon('fv_icon_binoculars', (ctx) => {
    for (const x of [30, 66]) blob(ctx, (c) => c.ellipse(x, 58, 19, 22, 0, 0, TAU), '#2CB7A8', '#165f5a');
    blob(ctx, (c) => c.rect(38, 34, 20, 18), '#1f8f86', '#165f5a');
    for (const x of [30, 66]) { blob(ctx, (c) => c.ellipse(x, 60, 11, 13, 0, 0, TAU), '#d9f4ff', '#165f5a'); }
    ctx.fillStyle = '#ffffff'; star4(ctx, 26, 55, 6, 1.5);
  });
  icon('fv_icon_hand', (ctx) => {
    blob(ctx, (c) => { c.moveTo(28, 86); c.lineTo(24, 46); c.quadraticCurveTo(26, 34, 34, 40); c.lineTo(36, 26); c.quadraticCurveTo(42, 16, 48, 26); c.lineTo(50, 22); c.quadraticCurveTo(57, 14, 62, 26); c.lineTo(64, 34); c.quadraticCurveTo(72, 30, 74, 40); c.lineTo(72, 66); c.quadraticCurveTo(66, 86, 50, 88); }, '#ffffff', '#6b7c93');
    ctx.fillStyle = '#FFD36A'; star4(ctx, 72, 18, 9, 2.2);
  });
  icon('fv_icon_office', (ctx) => {
    blob(ctx, (c) => c.rect(20, 44, 56, 38), '#fff3dc', '#8a6a4a');
    blob(ctx, (c) => { c.moveTo(12, 48); c.lineTo(48, 18); c.lineTo(84, 48); }, '#2f8f8a', '#1d5c58');
    blob(ctx, (c) => c.rect(40, 58, 16, 24), '#2f8f8a', '#1d5c58');
    ctx.fillStyle = '#FFD36A'; ctx.fillRect(24, 52, 12, 10); ctx.fillRect(60, 52, 12, 10);
  });
  canvasTex(scene, 'fv_nav_edge', 80, 80, (ctx) => {
    ctx.fillStyle = 'rgba(31,51,84,0.3)'; ctx.beginPath(); ctx.arc(41, 43, 32, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2CB7A8'; ctx.beginPath(); ctx.arc(40, 40, 32, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(66, 26); ctx.lineTo(79, 40); ctx.lineTo(66, 54); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(40, 40, 30.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(40, 40, 22, 0, TAU); ctx.fill();
  });
}
