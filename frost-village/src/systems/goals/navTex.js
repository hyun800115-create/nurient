// (v4.3) 길 안내's end marker, drawn once on two small canvases (≈ 0.2 MiB) so the marker is three pooled images a frame
// instead of Graphics ellipses (each strokeEllipse / fillCircle was rebuilt from ~ 35–100 points every frame):
//   fv_nav_end   176 x 106   the exact spot: an ellipse ring (ink outline + gold core) + a centre pin (ink disc, white dot)
//   fv_nav_fx    2 frames, white (tinted in play), 176 x 106 each:
//                  'ring'  a thin ring — the pulse going out (tinted gold)
//                  'glow'  a ring + the centre dot — drawn ADD above the night overlay after dark (tinted warm)
// Drawn at NAV_MARK_RES x: at scale 1 / NAV_MARK_RES the ring is rx 46 x ry 23 world px (the ground's 2:1).

export const NAV_MARK_RES = 1.5;
const W = 176, H = 106, TAU = Math.PI * 2;
const RX = 46 * NAV_MARK_RES, RY = 23 * NAV_MARK_RES;

function canvasTex(scene, key, w, h, draw) {
  const T = scene.textures;
  if (T.exists(key)) return;
  const c = T.createCanvas(key, w, h);
  if (!c) return;
  try { draw(c.context, c); } catch (e) { /* a blank texture is still a texture */ }
  c.refresh();
}

function ring(ctx, cx, cy, rx, ry, width, style) {
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();
}
function dot(ctx, cx, cy, r, style) { ctx.fillStyle = style; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); }

export function makeNavMarks(scene) {
  if (!scene || !scene.textures) return;
  const k = NAV_MARK_RES, cx = W / 2, cy = H / 2;
  canvasTex(scene, 'fv_nav_end', W, H, (ctx) => {
    ring(ctx, cx, cy, RX, RY, 21 * k, 'rgba(27,49,80,0.9)');      // ink outline (13 + 8 px, like the line)
    ring(ctx, cx, cy, RX, RY, 10.5 * k, '#FFC83D');                 // gold core
    dot(ctx, cx, cy, 12.5 * k, 'rgba(27,49,80,0.95)');              // the pin: ink disc …
    dot(ctx, cx, cy, 7.2 * k, '#FFFFFF');                           // … white centre
  });
  canvasTex(scene, 'fv_nav_fx', W * 2, H, (ctx, c) => {
    ring(ctx, cx, cy, RX, RY, 6.5 * k, '#FFFFFF');
    c.add('ring', 0, 0, 0, W, H);
    ring(ctx, W + cx, cy, RX, RY, 8 * k, '#FFFFFF');
    dot(ctx, W + cx, cy, 7.5 * k, '#FFFFFF');
    c.add('glow', 0, W, 0, W, H);
  });
}
