// (v4.3 마을 깃발) the village flag as data + its drawing (pure: no Phaser, no DOM beyond a canvas 2D context).
//
//   flag = { s, b, p, pc, e, ec }  (small ints; + mk: 1 while the new-game maker is still open)
//     s   모양      0 네모 · 1 제비꼬리 · 2 세모 페넌트 · 3 아래가 뾰족한 배너 · 4 물결 끝
//     b   바탕색    COLORS index
//     p   무늬      0 없음 · 1 가로 두 줄 · 2 세로 두 줄 · 3 대각선 · 4 십자 · 5 테두리
//     pc  무늬 색   COLORS index
//     e   그림      0 없음 · 1 동그라미 (the classic disc) · 2 눈송이 · 3 별 · 4 해 · 5 달 · 6 하트 · 7 물고기 · 8 나무 · 9 산 ·
//                   10 집 · 11 밀 이삭 · 12 닻 · 13 왕관
//     ec  그림 색   COLORS index
//   CLASSIC = today's flag (red with a yellow disc): what an old village keeps until its player makes one.
//
// drawFlag(ctx, flag, x, y, w, h, opts) draws it with canvas 2D (the shape clips the field, the pattern and the emblem;
// opts.skew bakes the world's iso lean in). The same code draws the shared world texture, the maker's preview and option
// icons, the settings / card icon and the 마을 옮기기 chip.

export const COLORS = [
  { k: 'red', hex: '#d6463b' }, { k: 'orange', hex: '#f08a32' }, { k: 'yellow', hex: '#f4c23e' }, { k: 'lime', hex: '#9fcb4c' },
  { k: 'green', hex: '#3b9a5d' }, { k: 'teal', hex: '#25a3a0' }, { k: 'sky', hex: '#66b8ec' }, { k: 'blue', hex: '#3571d4' },
  { k: 'navy', hex: '#273d87' }, { k: 'purple', hex: '#8b5cc7' }, { k: 'pink', hex: '#f185b3' }, { k: 'white', hex: '#fbf7ee' },
];
export const SHAPES = ['rect', 'swallow', 'pennant', 'banner', 'wavy'];
export const PATTERNS = ['none', 'hbars', 'vbars', 'diag', 'cross', 'border'];
export const EMBLEMS = ['none', 'disc', 'snow', 'star', 'sun', 'moon', 'heart', 'fish', 'tree', 'mountain', 'house', 'wheat', 'anchor', 'crown'];
export const CLASSIC = Object.freeze({ s: 0, b: 0, p: 0, pc: 11, e: 1, ec: 2 });
const FIELDS = [['s', SHAPES.length], ['b', COLORS.length], ['p', PATTERNS.length], ['pc', COLORS.length], ['e', EMBLEMS.length], ['ec', COLORS.length]];

const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : (typeof v === 'string' && /^\d{1,3}$/.test(v) ? Number(v) : NaN));

/** a stored / pasted flag -> a clean one ({ s, b, p, pc, e, ec } + mk: 1 when set), or null when it is not a flag at all.
 *  A part that is missing or out of range takes the classic part (an edited save never breaks the village). */
export function sanitizeFlag(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = {};
  let any = false;
  for (const [k, n] of FIELDS) {
    const x = int(v[k]);
    if (x >= 0 && x < n) { o[k] = x; any = true; } else o[k] = CLASSIC[k];
  }
  if (!any) return null;
  if (v.mk === 1 || v.mk === true) o.mk = 1;
  return o;
}

/** the six parts only (no mk) */
export function plain(f) { const o = {}; for (const [k] of FIELDS) o[k] = f[k]; return o; }
export function sameFlag(a, b) { if (!a || !b) return false; for (const [k] of FIELDS) if (a[k] !== b[k]) return false; return true; }
export function flagKey(f) { return FIELDS.map(([k]) => f[k]).join('.'); }

// ------------------------------------------------------------------ colours
const rgbOf = (i) => { const h = COLORS[i] ? COLORS[i].hex : '#ffffff'; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export function luminance(i) { const [r, g, b] = rgbOf(i); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
/** WCAG-style contrast ratio of two palette colours (1 .. 21) */
export function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
export function hexOf(i) { return COLORS[i] ? COLORS[i].hex : '#ffffff'; }
/** a colour mixed toward another rgb ([r, g, b]) by f -> css */
function mix(i, rgb, f) { const a = rgbOf(i); return `rgb(${Math.round(a[0] + (rgb[0] - a[0]) * f)},${Math.round(a[1] + (rgb[1] - a[1]) * f)},${Math.round(a[2] + (rgb[2] - a[2]) * f)})`; }

// ------------------------------------------------------------------ a pleasant random flag
function pickW(rng, weights) {
  let s = 0;
  for (const w of weights) s += w;
  let r = rng() * s;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}
const pickOf = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/** the flag's own random numbers (xorshift32, seeded from the clock): a shuffle never draws from Math.random, so a test
 *  that seeds Math.random (the first-sale bots) plays the same village with or without the maker */
let RS = 0;
export function flagRng() {
  if (!RS) { const t = (typeof performance !== 'undefined' && performance.now ? performance.now() * 1000 : 0) + Date.now(); RS = (Math.floor(t) ^ 0x9e3779b9) >>> 0 || 1; }
  RS ^= RS << 13; RS >>>= 0; RS ^= RS >>> 17; RS ^= RS << 5; RS >>>= 0;
  return RS / 4294967296;
}

/** a random flag that reads well: the pattern and the emblem stand out from the field (and the emblem from a pattern
 *  that runs under it). rng: () => [0, 1) */
export function randomFlag(rng = flagRng) {
  const s = pickW(rng, [30, 20, 14, 14, 22]);
  const b = pickW(rng, [10, 9, 8, 7, 10, 9, 9, 10, 10, 9, 8, 6]);
  const p = pickW(rng, [30, 14, 13, 12, 13, 18]);
  const all = COLORS.map((c, i) => i);
  let pcs = all.filter((i) => i !== b && contrast(i, b) >= 1.45);
  if (!pcs.length) pcs = [b === 11 ? 8 : 11];
  const pc = pickOf(rng, pcs);
  const e = rng() < 0.05 ? 0 : 1 + pickW(rng, [5, 10, 10, 9, 9, 9, 9, 9, 9, 8, 9, 9, 9]);
  // the emblem sits on the pattern too: a cross always, bars / the diagonal partly
  const under = p === 4 ? 2.0 : p === 3 ? 1.5 : 0;
  let ecs = all.filter((i) => i !== b && contrast(i, b) >= 2.1 && (!under || (i !== pc && contrast(i, pc) >= under)));
  if (!ecs.length) ecs = all.filter((i) => i !== b && contrast(i, b) >= 2.1);
  if (!ecs.length) ecs = [luminance(b) > 0.4 ? 8 : 11];
  const ec = pickOf(rng, ecs);
  return { s, b, p, pc, e, ec };
}

// ------------------------------------------------------------------ geometry (unskewed, hoist at x = 0)
/** the shape's outline as the current path (w x h box, origin top-left) */
export function shapePath(ctx, s, w, h) {
  ctx.beginPath();
  switch (SHAPES[s] || 'rect') {
    case 'swallow':
      ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w * 0.72, h * 0.5); ctx.lineTo(w, h); ctx.lineTo(0, h); break;
    case 'pennant':
      ctx.moveTo(0, 0); ctx.lineTo(w, h * 0.5); ctx.lineTo(0, h); break;
    case 'banner':
      ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.56); ctx.lineTo(w * 0.5, h); ctx.lineTo(0, h * 0.56); break;
    case 'wavy': {
      const x0 = w * 0.84;
      ctx.moveTo(0, 0); ctx.lineTo(x0, 0);
      for (let i = 0; i < 3; i++) { const y0 = (h * i) / 3, y1 = (h * (i + 1)) / 3; ctx.quadraticCurveTo(w * 1.16, (y0 + y1) / 2, x0, y1); }
      ctx.lineTo(0, h); break;
    }
    default:
      ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, h);
  }
  ctx.closePath();
}

/** where the emblem goes (its centre and size) for a shape */
export function emblemSpot(s, w, h) {
  switch (SHAPES[s]) {
    case 'pennant': return { x: w * 0.3, y: h * 0.5, r: h * 0.2 };
    case 'swallow': return { x: w * 0.4, y: h * 0.5, r: h * 0.27 };
    case 'banner': return { x: w * 0.5, y: h * 0.42, r: h * 0.25 };
    case 'wavy': return { x: w * 0.44, y: h * 0.5, r: h * 0.28 };
    default: return { x: w * 0.5, y: h * 0.5, r: h * 0.29 };
  }
}

function drawPattern(ctx, f, w, h) {
  const P = PATTERNS[f.p] || 'none';
  if (P === 'none') return;
  ctx.fillStyle = hexOf(f.pc);
  ctx.strokeStyle = hexOf(f.pc);
  const sp = emblemSpot(f.s, w, h);
  switch (P) {
    case 'hbars': ctx.fillRect(-2, h * 0.11, w + 4, h * 0.15); ctx.fillRect(-2, h * 0.74, w + 4, h * 0.15); break;
    case 'vbars': {
      const L = f.s === 2 ? [0.06, 0.16] : [0.1, 0.2];
      ctx.fillRect(w * L[0], -2, w * (L[1] - L[0]), h + 4);
      if (f.s !== 2) ctx.fillRect(w * 0.7, -2, w * 0.1, h + 4);
      else ctx.fillRect(w * 0.5, -2, w * 0.08, h + 4);
      break;
    }
    case 'diag': {
      ctx.save();
      ctx.translate(0, h);
      ctx.rotate(-Math.atan2(h, w));
      ctx.fillRect(-w, -h * 0.13, w * 3, h * 0.26);
      ctx.restore();
      break;
    }
    case 'cross': ctx.fillRect(-2, h * 0.4, w + 4, h * 0.2); ctx.fillRect(sp.x - h * 0.1, -2, h * 0.2, h + 4); break;
    case 'border': ctx.lineWidth = h * 0.22; ctx.lineJoin = 'round'; shapePath(ctx, f.s, w, h); ctx.stroke(); break;
    default: break;
  }
}

/** an arc of circle (cx, cy, r) from angle a0 to a1 that passes through angle `via` */
function arcVia(ctx, cx, cy, r, a0, a1, via) {
  const norm = (a) => { a %= Math.PI * 2; return a < 0 ? a + Math.PI * 2 : a; };
  // clockwise (increasing angle) from a0 to a1: does it pass `via`?
  const cw = norm(via - a0) <= norm(a1 - a0);
  ctx.arc(cx, cy, r, a0, a1, !cw);
}

/** the emblem `e` centred at (cx, cy), size r, in colour `ink`; `bg` (css) for cut-outs (the fish's eye, the house door) */
export function drawEmblem(ctx, e, cx, cy, r, ink, bg) {
  const E = EMBLEMS[e] || 'none';
  if (E === 'none') return;
  ctx.save();
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r))); ctx.closePath(); ctx.fill(); };
  const line = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(cx + x0 * r, cy + y0 * r); ctx.lineTo(cx + x1 * r, cy + y1 * r); ctx.stroke(); };
  switch (E) {
    case 'disc': ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fill(); break;
    case 'snow': {
      ctx.lineWidth = r * 0.17;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
        line(0, 0, ca * 0.95, sa * 0.95);
        for (const s of [-1, 1]) { const b = a + s * 0.75; line(ca * 0.55, sa * 0.55, ca * 0.55 + Math.cos(b) * 0.3, sa * 0.55 + Math.sin(b) * 0.3); }
      }
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.17, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'star': {
      const pts = [];
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, q = k % 2 ? 0.44 : 1.02; pts.push([Math.cos(a) * q, Math.sin(a) * q + 0.06]); }
      poly(pts);
      break;
    }
    case 'sun': {
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = r * 0.15;
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; line(Math.cos(a) * 0.7, Math.sin(a) * 0.7, Math.cos(a) * 0.98, Math.sin(a) * 0.98); }
      break;
    }
    case 'moon': {
      // a crescent: the big circle's far side, back along the small circle's inner side
      const R = r * 0.86, dx = r * 0.4, dy = -r * 0.26, r2 = r * 0.7, d = Math.hypot(dx, dy);
      const a = (R * R - r2 * r2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, R * R - a * a));
      const ux = dx / d, uy = dy / d, bx = ux * a, by = uy * a;
      const p1 = [bx - uy * hh, by + ux * hh], p2 = [bx + uy * hh, by - ux * hh];
      const ang = (p, ox, oy) => Math.atan2(p[1] - oy, p[0] - ox), dir = Math.atan2(dy, dx);
      ctx.beginPath();
      arcVia(ctx, cx, cy, R, ang(p1, 0, 0), ang(p2, 0, 0), dir + Math.PI);
      arcVia(ctx, cx + dx, cy + dy, r2, ang(p2, dx, dy), ang(p1, dx, dy), dir + Math.PI);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.86);
      ctx.bezierCurveTo(cx - r * 1.45, cy + r * 0.05, cx - r * 0.72, cy - r * 1.0, cx, cy - r * 0.38);
      ctx.bezierCurveTo(cx + r * 0.72, cy - r * 1.0, cx + r * 1.45, cy + r * 0.05, cx, cy + r * 0.86);
      ctx.closePath(); ctx.fill();
      break;
    case 'fish':
      ctx.beginPath(); ctx.ellipse(cx - r * 0.14, cy, r * 0.72, r * 0.44, 0, 0, Math.PI * 2); ctx.fill();
      poly([[0.42, 0], [1.0, -0.46], [0.9, 0], [1.0, 0.46]]);
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx - r * 0.5, cy - r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill();
      break;
    case 'tree':
      poly([[0, -1.0], [0.42, -0.36], [-0.42, -0.36]]);
      poly([[0, -0.66], [0.62, 0.12], [-0.62, 0.12]]);
      poly([[0, -0.3], [0.82, 0.6], [-0.82, 0.6]]);
      ctx.fillRect(cx - r * 0.13, cy + r * 0.56, r * 0.26, r * 0.36);
      break;
    case 'mountain': {
      poly([[-1.02, 0.72], [-0.16, -0.78], [0.66, 0.72]]);
      poly([[0.02, 0.72], [0.56, -0.2], [1.06, 0.72]]);
      ctx.fillStyle = bg;
      poly([[-0.16, -0.78], [-0.4, -0.36], [-0.27, -0.42], [-0.16, -0.3], [-0.04, -0.42], [0.08, -0.36]]);
      break;
    }
    case 'house':
      ctx.fillRect(cx + r * 0.32, cy - r * 0.78, r * 0.2, r * 0.42);
      poly([[-0.86, -0.02], [0, -0.82], [0.86, -0.02]]);
      ctx.fillRect(cx - r * 0.62, cy - r * 0.1, r * 1.24, r * 0.84);
      ctx.fillStyle = bg; ctx.fillRect(cx - r * 0.15, cy + r * 0.26, r * 0.3, r * 0.48);
      break;
    case 'wheat': {
      ctx.lineWidth = r * 0.11;
      line(0.12, 1.0, -0.04, -0.6);
      const g = (x, y, rot) => { ctx.save(); ctx.translate(cx + x * r, cy + y * r); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.13, r * 0.27, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
      for (let k = 0; k < 4; k++) { const y = -0.62 + k * 0.3, x = -0.03 + k * 0.02; g(x - 0.17, y, -0.6); g(x + 0.17, y, 0.6); }
      g(-0.05, -0.86, 0);
      break;
    }
    case 'anchor':
      ctx.lineWidth = r * 0.16;
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.74, r * 0.17, 0, Math.PI * 2); ctx.stroke();
      line(0, -0.56, 0, 0.84);
      line(-0.44, -0.34, 0.44, -0.34);
      ctx.beginPath(); ctx.arc(cx, cy + r * 0.16, r * 0.68, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
      poly([[0.76, 0.12], [0.9, 0.42], [0.56, 0.4]]);
      poly([[-0.76, 0.12], [-0.9, 0.42], [-0.56, 0.4]]);
      break;
    case 'crown':
      poly([[-0.82, 0.56], [0.82, 0.56], [0.88, -0.42], [0.42, 0.0], [0, -0.68], [-0.42, 0.0], [-0.88, -0.42]]);
      for (const [x, y] of [[-0.88, -0.48], [0, -0.76], [0.88, -0.48]]) { ctx.beginPath(); ctx.arc(cx + x * r, cy + y * r, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = bg; ctx.fillRect(cx - r * 0.62, cy + r * 0.3, r * 1.24, r * 0.1);
      break;
    default: break;
  }
  ctx.restore();
}

/**
 * the whole flag into a canvas 2D context, its top-left (hoist top) at (x, y), w x h before the lean.
 * opts.skew: px down per px along (the world's iso lean); opts.edge: a thin darker outline (default true);
 * opts.parts: 'all' | 'shape' (the field only: shape icons) | 'pattern' (no emblem) | 'emblem' (the emblem alone on a
 * transparent box, centred in w x h)
 */
export function drawFlag(ctx, f, x, y, w, h, opts = {}) {
  const fl = sanitizeFlag(f) || CLASSIC;
  const parts = opts.parts || 'all';
  ctx.save();
  ctx.translate(x, y);
  if (opts.skew) ctx.transform(1, opts.skew, 0, 1, 0, 0);
  if (parts === 'emblem') {
    drawEmblem(ctx, fl.e, w / 2, h / 2, Math.min(w, h) * 0.42, hexOf(fl.ec), opts.bg || 'rgba(0,0,0,0)');
    ctx.restore();
    return;
  }
  shapePath(ctx, fl.s, w, h);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hexOf(fl.b);
  ctx.fillRect(-2, -2, w + 4, h + 4);
  // a soft fold of light down the cloth (reads as cloth on the flat icons too)
  const gr = ctx.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.10)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.04)');
  if (parts !== 'shape') drawPattern(ctx, fl, w, h);
  if (parts === 'all') { const sp = emblemSpot(fl.s, w, h); drawEmblem(ctx, fl.e, sp.x, sp.y, sp.r, hexOf(fl.ec), hexOf(fl.b)); }
  ctx.fillStyle = gr;
  ctx.fillRect(-2, -2, w + 4, h + 4);
  ctx.restore();
  if (opts.edge !== false) {
    shapePath(ctx, fl.s, w, h);
    ctx.lineWidth = Math.max(1, h * 0.035);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = mix(fl.b, [30, 34, 48], 0.55);
    ctx.globalAlpha = 0.7;
    ctx.stroke();
  }
  ctx.restore();
}

/** names (for tests / the maker's state) */
export function describe(f) {
  const fl = sanitizeFlag(f) || CLASSIC;
  return { shape: SHAPES[fl.s], bg: COLORS[fl.b].k, pattern: PATTERNS[fl.p], patternColor: COLORS[fl.pc].k, emblem: EMBLEMS[fl.e], emblemColor: COLORS[fl.ec].k };
}
