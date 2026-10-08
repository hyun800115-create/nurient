// Living water (CONTRACT_V7 §V) — a standalone WebGL sea for Phaser 3.90 (GLSL ES 1.0, WebGL1-safe).
//
// NOT imported by the game yet: see docs/build_reports/water.md for the integration into Ground.js.
//
// What it draws (one Water = one region of sea, lake or pool):
//   * body  (depth opts.depth, default DEPTH.WATER, below everything): long swells rolling toward the shore
//     (4 directional Gerstner-like waves + one shore-parallel wave whose crests follow the coastline and
//     bunch up as they shoal), two scrolling FFT ripple normal layers, fresnel sky reflection, sun glints,
//     depth colour from a palette LUT, the sea bed seen through clear water with moving caustics, fish
//     schools UNDER the surface (refracted, tinted by depth), ripple rings (splashes / wakes), and the foam
//     of HARD shores (rock / breakwater slap collar, quay lapping line).
//   * shore (depth opts.shoreDepth, default DEPTH.GROUND + 5, i.e. just above the baked land tiles and
//     below floors / decals / pads / characters): the SOFT shores — breaking crest lines in the surf zone,
//     foam lace that rolls up a sand beach and recedes (swash) leaving a darker wet band that dries, the
//     small slushy foam of a snow bank.
// Both are Phaser `Extern` game objects with their own GL program and a static mesh that only covers
// the water (body) or the shore band (shore), so they composite at their depth, follow camera scroll /
// zoom (0.45 .. 1.7 x View.k) and render at the canvas resolution (devicePixelRatio) for free.
//
// Coordinates: world px (screen space of the game). "G space" = (x, 2y) relative to the region origin
// = the iso ground plane seen from above (metric, 64 G px per metre). Every texture and every wave is
// defined in G space, so the waves are foreshortened 2:1 like the ground.
//
// Shoreline: the land / water mask is evaluated once on a grid of 8 x 4 world px (8 x 8 G px) cells →
// signed distance field (two 8SSEDT passes + a small blur) + per-cell shore parameters copied from the
// nearest shore cell (slope = depth profile, runup = swash, slap = hard-shore foam) → one RGBA texture.
//
// JS mirrors the wave maths (heightAt / slopeAt) so boats, buoys and swimmers bob in sync with the
// pixels. No per-frame allocations: every uniform lives in preallocated typed arrays.
//
// Canvas renderer (or a failed shader compile): the old look — a scrolling `water_sea` tileSprite.

import { DEPTH } from './DepthSort.js';

const TAU = Math.PI * 2;
export const PPU = 64;                       // G px per metre
export const HEIGHT_PX_PER_M = 55.43;        // screen px per metre of height (64 * cos 30°)
export const WATER_PX = 30;                  // sea surface below land (screen px), like assets/harbor
const SLOPE_K = PPU / HEIGHT_PX_PER_M;       // height px per G px -> dimensionless slope
const DM = 768;                              // distance range stored in the field (G px)
const CELL_X = 8, CELL_Y = 4;                // field cell in world px (= 8 x 8 G px)
const CELL_G = 8;
const RUNUP_MAX = 150;                       // swash run-up (G px) for runup 1 (sand)
const SWASH_UP = 0.3;                        // part of a wave cycle the uprush takes
const DRY_T = 2.6;                           // seconds for fresh wet sand to fade
const RINGS = 12;
const G_ACC = 9.81 * PPU;                    // G px / s^2

// ------------------------------------------------------------------------------------------------ data
/**
 * per shore material (stored in the field: B = runup, A = edge; the shader derives the rest):
 *   runup  swash run-up of SOFT shores (sand 1, snow bank 0.16) -> surf, swash lace, wet band (shore layer)
 *   edge   kind of HARD edge: 0 calm (none), 0.5 quay wall (deep, lapping line), 1 rock / breakwater (slap + spray)
 *   wave   does the coast make the shore-parallel swell? (beaches / snow banks / rocky coasts yes; thin
 *          structures like breakwaters, quays, piers no — the waves pass them and slap against them)
 *   (derived: sea-bed slope sand 1 / snow bank 0.75 / rock 0.25 / quay 0; slap foam rock 1 / snow 0.27 / quay 0.22)
 */
export const SHORE_TYPES = {
  sand: { runup: 1.0, edge: 0, wave: true },
  snowbank: { runup: 0.16, edge: 0, wave: true },
  rock: { runup: 0.0, edge: 1, wave: true },
  breakwater: { runup: 0.0, edge: 1, wave: false },
  quay: { runup: 0.0, edge: 0.5, wave: false },
  none: { runup: 0.0, edge: 0, wave: false },
};

/**
 * Swell constants shared by the shader (uniforms) and heightAt() / slopeAt().
 * waves: directional, `rot` degrees from the region's swell direction, `len` wavelength in G px,
 * `amp` height in screen px. Deep-water dispersion (omega = sqrt(g k)) slowed by `timeScale`.
 * shore: crests follow the coastline (phase = k * psi(distance) + omega t), period in s, shoaling
 * psi(d) = d + shoalA * shoalD * (1 - exp(-d / shoalD)) bunches the crests near the shore.
 */
export const SWELL = {
  timeScale: 0.42,
  waves: [
    { rot: 0, len: 460, amp: 3.0 },
    { rot: 23, len: 300, amp: 1.8 },
    { rot: -34, len: 196, amp: 1.0 },
    { rot: 61, len: 124, amp: 0.5 },
  ],
  shore: { len: 330, period: 6.0, amp: 2.2, reach: 560, shoalA: 0.9, shoalD: 170 },
  normalBoost: 6.0,          // the swell is drawn steeper than it bobs (readable bands)
  ripple: 1.0,               // ripple normal strength
};

// alongshore variation (identical in GLSL): phase offset nu(g) and amplitude av(g, t)
const NU = [0.9, 0.0029, 0.0017, 0.6, 0.0061, -0.0037, 1.7];
const AV = [0.82, 0.18, 0.0021, 0.0033, 0.21, 0.12, 0.0047, -0.0026, -0.13, 2.1];

/* PALETTES (keep identical to tools/fx/gen_water.py PALETTES; check_water.py compares them) */
export const DEFAULT_PALETTES = {
  winter_sea: {
    row: 0, depthScale: 2.2,
    lut: [[0.00, '#A9DCE6', 0.30], [0.10, '#78C7D8', 0.62], [0.24, '#45A3C9', 0.86],
      [0.45, '#2C7DBA', 0.97], [0.70, '#2468B0', 1.0], [1.00, '#1C559C', 1.0]],
    skyHi: '#4A86C8', skyLo: '#A9CDEC', sun: '#FFF8E8', sss: '#3FB4D2',
    foam: '#FFFFFF', foamShade: '#B9D7EC', bottom: '#8FA8B8', caustic: 0.55,
    wet: '#7C93AE', film: '#BFE6F0', slush: 1.0,
  },
  harbor: {
    row: 1, depthScale: 1.6,
    lut: [[0.00, '#A8D8CF', 0.35], [0.12, '#6DB9B6', 0.70], [0.28, '#3B98A8', 0.90],
      [0.50, '#2A7A9E', 0.98], [0.75, '#21628F', 1.0], [1.00, '#1A4C78', 1.0]],
    skyHi: '#557FAA', skyLo: '#B4D0DD', sun: '#FFF6E2', sss: '#46B3B0',
    foam: '#FFFFFF', foamShade: '#B4D3DC', bottom: '#7E8E86', caustic: 0.35,
    wet: '#6D7F86', film: '#BFE2E2', slush: 0.0,
  },
  tropical: {
    row: 2, depthScale: 2.8,
    lut: [[0.00, '#E6F7F0', 0.00], [0.08, '#B4F0E6', 0.22], [0.20, '#5FDCD6', 0.55],
      [0.36, '#26C2CC', 0.80], [0.56, '#14A3BC', 0.94], [0.78, '#1186A8', 1.0],
      [1.00, '#0F6C93', 1.0]],
    skyHi: '#4A9AD4', skyLo: '#C4EAF4', sun: '#FFFBEA', sss: '#4FE3D6',
    foam: '#FFFFFF', foamShade: '#BDE6EC', bottom: '#EBD9B4', caustic: 0.9,
    wet: '#BFA27A', film: '#C8F4EE', slush: 0.0,
  },
  pool: {
    row: 3, depthScale: 1.2,
    lut: [[0.00, '#D8F8FF', 0.15], [0.25, '#8EE3F4', 0.50], [0.55, '#45C6EA', 0.78],
      [1.00, '#1F9AD6', 0.92]],
    skyHi: '#62AADF', skyLo: '#D8F2FB', sun: '#FFFFFF', sss: '#6FE6F4',
    foam: '#FFFFFF', foamShade: '#C4E8F4', bottom: '#CDEFF7', caustic: 1.0,
    wet: '#9DB4C0', film: '#D8F6FF', slush: 0.0,
  },
};
/* END PALETTES */
const LUT_ROWS = 8;

/** per-palette look knobs that are not colours (reflection strength, glints, whitecaps, swell size) */
const LOOK = {
  winter_sea: { refl: 1.25, glint: 1.4, whitecap: 0.3, swell: 1.0, surf: 1.0, ripple: 0.6 },
  harbor: { refl: 1.2, glint: 1.2, whitecap: 0.0, swell: 0.45, surf: 0.5, ripple: 0.5 },
  tropical: { refl: 1.1, glint: 1.6, whitecap: 0.12, swell: 0.8, surf: 1.0, ripple: 0.55 },
  pool: { refl: 1.0, glint: 1.4, whitecap: 0.0, swell: 0.0, surf: 0.0, ripple: 0.35 },
};

const TEX = { a: 'water_waves_a', b: 'water_waves_b', foam: 'water_foam', lut: 'water_lut' };
const TILE_A = 512, TILE_B = 192, TILE_FOAM = 640, TILE_LACE = 180;

function hex3(h, out, o) {
  const n = parseInt(String(h).replace('#', ''), 16);
  out[o] = ((n >> 16) & 255) / 255; out[o + 1] = ((n >> 8) & 255) / 255; out[o + 2] = (n & 255) / 255;
  return out;
}
const fract = (v) => v - Math.floor(v);
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const LIGHT_DIR = norm3([-0.42, -0.62, 0.66]);          // sun from the screen upper-left (house light)
const VIEW_DIR = [0, 0.8660254, 0.5];                   // toward the eye: 2:1 iso = 30 deg elevation
const HALF_DIR = norm3([LIGHT_DIR[0] + VIEW_DIR[0], LIGHT_DIR[1] + VIEW_DIR[1], LIGHT_DIR[2] + VIEW_DIR[2]]);
const v3 = (v) => 'vec3(' + v.map((x) => x.toFixed(5)).join(', ') + ')';
const wrap = (v) => v - TAU * Math.floor(v / TAU);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ GLSL
const VERT = `
precision highp float;
attribute vec2 aPos;
uniform mat3 uView;
uniform mat4 uProj;
uniform vec4 uOrg;      // region origin x, y (world px), 1 / field width, 1 / field height (world px)
uniform vec2 uCam;      // camera centre (world px, whole px): G coordinates are relative to it
uniform vec4 uRotA;     // cos, sin, 1 / tile, -
uniform vec4 uRotB;
uniform vec4 uOffAB;    // uv offsets of ripple layers A, B (wrapped, camera relative)
uniform vec4 uFoamUV;   // 1 / tile, offset (wrapped), -
uniform vec4 uFish1;    // fish layer 1: uv scale x, y, offset x, y
uniform vec4 uFish2;
varying vec4 vA;        // G (camera relative), field uv
varying vec4 vB;        // uv ripple A, uv ripple B
varying vec4 vC;        // uv foam, region-local screen px
varying vec4 vD;        // uv fish 1, uv fish 2
void main() {
  vec3 c = uView * vec3(aPos, 1.0);
  gl_Position = uProj * vec4(c.xy, 0.0, 1.0);
  vec2 l = aPos - uOrg.xy;
  vec2 lc = aPos - uCam;
  vec2 g = vec2(lc.x, 2.0 * lc.y);
  vA = vec4(g, l * uOrg.zw);
  vec2 ga = vec2(uRotA.x * g.x - uRotA.y * g.y, uRotA.y * g.x + uRotA.x * g.y) * uRotA.z;
  vec2 gb = vec2(uRotB.x * g.x - uRotB.y * g.y, uRotB.y * g.x + uRotB.x * g.y) * uRotB.z;
  vB = vec4(ga + uOffAB.xy, gb + uOffAB.zw);
  vC = vec4(g * uFoamUV.x + uFoamUV.yz, l);
  vD = vec4(lc * uFish1.xy + uFish1.zw, lc * uFish2.xy + uFish2.zw);
}`;

const FRAG_COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
uniform sampler2D uField;
uniform vec4 uShore;    // k (rad / G px), phase at the shore (wrapped), amp (px), reach (G px)
uniform vec4 uShoal;    // shoalA, shoalD, swell normal boost, ripple strength
uniform vec4 uAlong;    // alongshore phase constants (camera relative)
uniform vec4 uMisc;     // zoom (canvas px per world px), glint, reflection, fish refraction
uniform vec4 uPal;      // lut v, depthScale, caustic, whitecap
uniform vec3 uSky0;
uniform vec3 uSky1;
uniform vec3 uSun;
uniform vec3 uFoamC;
uniform vec3 uFoamS;
const vec3 LGT = ${v3(LIGHT_DIR)};
const vec3 VIEW = ${v3(VIEW_DIR)};
const vec3 HALF = ${v3(HALF_DIR)};
float decodeD(float r) { float s = r * 2.0 - 1.0; return sign(s) * s * s * ${DM.toFixed(1)}; }
float alongNu(vec2 g) {
  return ${NU[0]} * sin(dot(vec2(${NU[1]}, ${NU[2]}), g) + uAlong.x) + ${NU[3]} * sin(dot(vec2(${NU[4]}, ${NU[5]}), g) + uAlong.y);
}
float alongAv(vec2 g) {
  return ${AV[0]} + ${AV[1]} * sin(dot(vec2(${AV[2]}, ${AV[3]}), g) + uAlong.z) + ${AV[5]} * sin(dot(vec2(${AV[6]}, ${AV[7]}), g) + uAlong.w);
}
vec2 texSlope(vec2 n) { return -n * inversesqrt(max(1.0 - dot(n, n), 0.05)); }
`;

// ---- body: the sea itself (opaque) -----------------------------------------------------------------
const FRAG_BODY = `
uniform sampler2D uWA;
uniform sampler2D uWB;
uniform sampler2D uFoam;
uniform sampler2D uLut;
uniform sampler2D uFish;
uniform vec4 uSw[4];        // swell: k.x, k.y (rad / G px), phase (camera relative, wrapped), amp (px)
uniform vec4 uRing[${RINGS}];   // ring: G x, y (camera relative), age (s), strength
uniform vec4 uRingN;        // count, speed (G px / s), base width (G px), -
uniform vec4 uRotA;
uniform vec4 uRotB;
uniform vec4 uFishK;        // alpha layer 1, alpha layer 2, -, -
uniform vec4 uBand1;        // fish layer 1 band: y0, y1 (region-local screen px), fade (px), -
uniform vec4 uBand2;
uniform vec3 uSss;
uniform vec3 uBed;
uniform vec3 uLow0;         // LOW: shallow colour
uniform vec3 uLow1;         // LOW: mid colour
uniform vec3 uLow2;         // LOW: deep colour
uniform vec4 uLowA;         // LOW: lut u of the mid stop, opacity at the shore, -, -
void main() {
  vec4 fld = texture2D(uField, vA.zw);
  float d = decodeD(fld.r);
  float dw = max(decodeD(fld.g), 0.0);
  float ru = fld.b;
  float ek = fld.a;
  float soft = smoothstep(0.02, 0.10, ru);
  float slp = mix(ek < 0.5 ? mix(0.5, 0.0, ek * 2.0) : mix(0.0, 0.25, ek * 2.0 - 1.0), 0.7 + 0.3 * ru, soft);
  float sp = mix(ek < 0.5 ? mix(0.0, 0.22, ek * 2.0) : mix(0.22, 1.0, ek * 2.0 - 1.0), 0.3 - 0.18 * ru, soft);
  float quay = (1.0 - abs(ek * 2.0 - 1.0)) * (1.0 - soft);
  vec2 g = vA.xy;
  float dpos = max(d, 0.0);
  // ---- long swell (directional)
  float h = 0.0;
  vec2 dh = vec2(0.0);
  for (int i = 0; i < NSW; i++) {
    vec4 w = uSw[i];
    float ph = dot(w.xy, g) + w.z;
    h += w.w * sin(ph);
    dh += w.xy * (w.w * cos(ph));
  }
  float wDir = mix(0.45, 1.0, smoothstep(0.0, uShore.w, dpos));
  h *= wDir;
  dh *= wDir;
  // ---- shore-parallel swell: crests follow the coast and bunch up while shoaling
  float nu = alongNu(g);
  float av = alongAv(g);
  float psi = dw + uShoal.x * uShoal.y * (1.0 - exp(-dw / uShoal.y));
  float phS = uShore.x * psi + uShore.y + nu;
  float wS = 1.0 - smoothstep(uShore.w * 0.45, uShore.w, dw);
  float hS = uShore.z * av * wS * sin(phS);
  h += hS;
  vec2 sl = dh * (${SLOPE_K.toFixed(4)} * uShoal.z);
  // ---- ripple rings (splashes, wakes, swimmers)
  float ringFoam = 0.0;
  for (int i = 0; i < NRING; i++) {
    if (float(i) >= uRingN.x) break;
    vec4 r = uRing[i];
    vec2 dv = g - r.xy;
    float dist = length(dv);
    float wr = uRingN.z + r.z * 12.0;
    float x = (dist - r.z * uRingN.y) / wr;
    if (abs(x) < 3.0) {
      float env = r.w * exp(-r.z * 1.3) * exp(-x * x * 1.6);
      float wv = sin(x * 5.0);
      h += env * wv * 1.5;
      sl += (dv / max(dist, 1.0)) * (env * cos(x * 5.0) * 5.0 / wr) * 3.0;
      ringFoam += env * smoothstep(0.35, 1.0, wv) * 0.55;
    }
  }
  // ---- ripples
  vec3 ta = texture2D(uWA, vB.xy).rgb;
  vec2 sa = texSlope(ta.xy * 2.0 - 1.0);
  sa = vec2(uRotA.x * sa.x + uRotA.y * sa.y, -uRotA.y * sa.x + uRotA.x * sa.y);
  float rip = uShoal.w * (0.7 + 0.5 * av) * (0.55 + 0.45 * smoothstep(0.0, 140.0, dpos));
#ifdef LOW
  sl += sa * rip * 1.05;
  vec3 N = normalize(vec3(-sl, 1.0));
  float dm = dpos / 64.0;
  float depth = 2.6 * (1.0 - slp) * (1.0 - slp) * (1.0 - exp(-dm * 2.5)) + dm * mix(0.9, 0.12, slp) - h * 0.01;
  float u = 1.0 - exp(-max(depth, 0.0) / uPal.y);
  vec3 wcol = mix(uLow0, uLow1, smoothstep(0.0, uLowA.x, u));
  wcol = mix(wcol, uLow2, smoothstep(uLowA.x, 1.0, u));
  float op = mix(uLowA.y, 1.0, smoothstep(0.0, uLowA.x, u));
  vec3 col = mix(uBed * (0.9 + 0.25 * ta.b * (1.0 - u)), wcol, op);
  float caus = 0.0;
  float fishA = 0.0;
  vec3 fo = vec3(ta.b, ta.b, 0.5);
#else
  vec3 tb = texture2D(uWB, vB.zw).rgb;
  vec2 sb = texSlope(tb.xy * 2.0 - 1.0);
  sb = vec2(uRotB.x * sb.x + uRotB.y * sb.y, -uRotB.y * sb.x + uRotB.x * sb.y);
  sl += (sa * 0.9 + sb * 0.38) * rip;
  vec3 N = normalize(vec3(-sl, 1.0));
  vec3 fo = texture2D(uFoam, vC.xy).rgb;
  float dm = dpos / 64.0;
  float depth = 2.6 * (1.0 - slp) * (1.0 - slp) * (1.0 - exp(-dm * 2.5)) + dm * mix(0.9, 0.12, slp) - h * 0.01;
  float u = 1.0 - exp(-max(depth, 0.0) / uPal.y);
  vec4 lut = texture2D(uLut, vec2(u, uPal.x));
  float caus = ta.b * (0.35 + 0.85 * tb.b);
  vec3 bed = uBed * (0.86 + 0.28 * fo.b) + uPal.z * caus * (1.0 - u) * (1.0 - u) * vec3(1.0, 0.97, 0.86);
  vec3 col = mix(bed, lut.rgb, lut.a);
#ifdef FISH
  // ONE fetch for both school layers: layer 1 inside its band, layer 2 elsewhere (bands fade at their edges)
  float yl = vC.w;
  float b1 = smoothstep(uBand1.x, uBand1.x + uBand1.z, yl) * (1.0 - smoothstep(uBand1.y - uBand1.z, uBand1.y, yl));
  float b2 = smoothstep(uBand2.x, uBand2.x + uBand2.z, yl) * (1.0 - smoothstep(uBand2.y - uBand2.z, uBand2.y, yl));
  float l1 = step(0.001, b1);
  vec4 f1 = texture2D(uFish, mix(vD.zw, vD.xy, l1) + sl * uMisc.w);
  float vis = smoothstep(0.03, 0.22, u);
  float fa1 = clamp(f1.a * mix(uFishK.y * b2, uFishK.x * b1, l1) * vis * 1.9, 0.0, 1.0);
  vec3 fishC = mix(f1.rgb * mix(0.85, 0.8, l1), lut.rgb * mix(0.38, 0.3, l1), mix(0.4, 0.2, l1));
  float fishA = fa1;
#else
  float fishA = 0.0;
#endif
#endif
  // ---- light: swell faces, crest glow, sky reflection, sun glints
  float ndl = dot(N, LGT);
  col *= 0.70 + 0.50 * ndl;
  float crestLine = pow(max(sin(phS), 0.0), 8.0) * wS * smoothstep(20.0, 90.0, dw) * smoothstep(10.0, 60.0, dpos) * uShore.z * 0.45;
  col += uSss * (clamp(hS * 0.22 + h * 0.06, 0.0, 1.0) * 0.14 + crestLine * 0.16) * (0.35 + 0.65 * u);
#if defined(FISH) && !defined(LOW)
  // fish swim under the surface: refracted, tinted by the water above them, below reflections / glints / foam
  col = mix(col, fishC, fa1);
#endif
  vec3 R = reflect(vec3(0.0, -0.8660254, -0.5), N);
  float ndv = max(dot(N, VIEW), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 sky = mix(uSky1, uSky0, smoothstep(0.05, 0.85, R.z));
  col = mix(col, sky, clamp(fres * uMisc.z, 0.0, 0.55) * (1.0 - 0.7 * fishA));
  float ndh = max(dot(N, HALF), 0.0);
  float shin = mix(320.0, 760.0, clamp(uMisc.x - 0.4, 0.0, 1.0));
  col += uSun * (pow(ndh, shin) * uMisc.y * 1.5 + pow(ndh, 24.0) * 0.05) * (1.0 - 0.6 * fishA);
  // ---- foam: hard shores (rock / breakwater slap, quay lap), whitecaps, ring crests
  float hard = 1.0 - soft;
  float cyc = fract((phS - 1.5708) * 0.15915494);                 // 0 = the swell crest is here now
  float burst = exp(-cyc * 4.5) + 0.35 * exp(-(1.0 - cyc) * 18.0);
  float collar = 5.0 + 36.0 * burst * av * sp * max(uShore.z, 0.4) / 2.2;
  float pot = (1.0 - smoothstep(0.0, collar, dpos)) * hard * sp * (0.55 + 0.5 * burst) * (0.55 + 0.7 * fo.b);
  float lapLine = quay * (1.0 - smoothstep(1.0, 4.0 + 2.5 * (0.5 + 0.5 * sin(uShore.y + nu)), dpos));
  col += quay * 0.06 * cos(uShore.x * dpos * 2.0 - uShore.y) * exp(-dpos / 70.0);
  float crestN = clamp(h / (uShore.z + 4.0), 0.0, 1.0);
  pot = max(pot, uPal.w * smoothstep(0.55, 1.0, crestN) * (1.0 - wS * 0.5));
  // the shore swell's crest rolling in: a bright glassy line with white horses breaking along it
  pot = max(pot, crestLine * uPal.w * 1.3 * (0.6 + 0.4 * av));
  pot = max(pot, ringFoam);
  float aa = 0.06 + 0.10 / clamp(uMisc.x, 0.4, 3.0);
  float foam = smoothstep(1.0 - pot - aa, 1.0 - pot + aa, fo.r);
  float fshade = smoothstep(1.0 - pot, 1.0 - pot + 0.3, fo.r);
  float rim = smoothstep(1.0 - pot - 0.16, 1.0 - pot, fo.r) * (1.0 - foam);
  col *= 1.0 - rim * 0.18 * step(0.001, pot);
  col = mix(col, mix(uFoamS, uFoamC, fshade), clamp(foam * 0.96 + lapLine * 0.75, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---- shore: soft-shore surf, swash, wet sand, slush (premultiplied alpha, over the land) ---------------
const FRAG_SHORE = `
uniform sampler2D uWB;
uniform sampler2D uFoam;
uniform vec4 uSwDir;        // swell direction in G (unit, toward the shore), 1 / lace tile, cycle period (s)
uniform vec4 uLaceOff;      // lace uv offset (wrapped), slush drift
uniform vec3 uWet;
uniform vec3 uFilm;
uniform vec4 uPal2;         // slush amount, -, -, -
void main() {
  vec4 fld = texture2D(uField, vA.zw);
  float ru = fld.b;
  float soft = smoothstep(0.02, 0.10, ru);
  if (soft <= 0.0) discard;
  float d = decodeD(fld.r);
  float dw = max(decodeD(fld.g), 0.0);
  vec2 g = vA.xy;
  float nu = alongNu(g);
  float av = alongAv(g);
  float ph0 = uShore.y + nu;
  float cyc = fract((ph0 - 1.5708) * 0.15915494);          // 0 = a crest reaches the waterline
  float R = ru * ${RUNUP_MAX.toFixed(1)} * av;
  float up = ${SWASH_UP.toFixed(3)};
  float e = cyc < up ? R * sin(1.5708 * cyc / up) : R * pow(1.0 - (cyc - up) / (1.0 - up), 1.5);
  float x = -d;
  // lace rides up with the swash (continuous over the cycle: e(0) = e(1) = 0)
  vec2 uvl = (g - uSwDir.xy * (e * 0.9)) * uSwDir.z + uLaceOff.xy;
  vec3 fo = texture2D(uFoam, uvl).rgb;
  float aa = 0.06 + 0.10 / clamp(uMisc.x, 0.4, 3.0);
  // ---- surf zone (water side): breaking crest + the foam it leaves behind + waterline collar
  float dpos = max(d, 0.0);
  float wat = step(0.0, d);
  float psi = dw + uShoal.x * uShoal.y * (1.0 - exp(-dw / uShoal.y));
  float q = fract((uShore.x * psi + ph0 - 1.5708) * 0.15915494);
  float surfW = 30.0 + 200.0 * ru;
  float surf = wat * (1.0 - smoothstep(surfW * 0.5, surfW, dpos)) * smoothstep(0.0, 18.0, dpos + 6.0);
  float front = smoothstep(0.90, 0.995, q);
  float trail = exp(-q * 6.0);
  float potW = surf * (front * 0.95 + trail * 0.75) * (0.55 + 0.45 * av);
  potW = max(potW, wat * (1.0 - smoothstep(0.0, 10.0 + 14.0 * ru, dpos)) * (0.75 + 0.25 * (1.0 - cyc)));
  // ---- swash (land side): water sheet, foam lace at its edge, wet band left behind
  float land = step(0.0, x);
  float cov = land * (1.0 - smoothstep(e - 2.0, e + 2.0, x));
  float thick = clamp(1.0 - x / max(e, 1.0), 0.0, 1.0);
  float back = smoothstep(up, 1.0, cyc);
  float edgeF = exp(-max(e - x, 0.0) / (6.0 + 12.0 * ru));
  float potL = cov * (edgeF * (1.0 - 0.6 * back) + 0.22 * (1.0 - thick) * (1.0 - back));
  float xr = x / max(R, 1.0);
  float sUnc = up + (1.0 - up) * (1.0 - pow(clamp(xr, 0.0, 1.0), 0.6667));
  float dry = fract(cyc - sUnc) * uSwDir.w;
  float bare = land * (1.0 - cov);
  float inReach = 1.0 - smoothstep(0.98, 1.02, xr);
  float wet = bare * inReach * exp(-dry / ${DRY_T.toFixed(2)});
  wet = max(wet, bare * 0.32 * (1.0 - smoothstep(R * 0.85, R * 1.3 + 22.0, x)));
  float gloss = bare * inReach * exp(-dry / 0.45);
  // ---- slush (snow banks): ice bits bobbing in a narrow band around the waterline
  float slushy = uPal2.x * (1.0 - smoothstep(0.25, 0.5, ru));
  float slushBand = slushy * (1.0 - smoothstep(10.0, 38.0, abs(d - 6.0)));
  float ice = smoothstep(0.35, 0.6, fo.g) * slushBand;
  // ---- foam coverage
  float pot = clamp(max(potW, potL), 0.0, 1.0) * soft;
  float foam = smoothstep(1.0 - pot - aa, 1.0 - pot + aa, fo.r);
  float fshade = smoothstep(1.0 - pot, 1.0 - pot + 0.3, fo.r);
  float rim = smoothstep(1.0 - pot - 0.18, 1.0 - pot, fo.r) * (1.0 - foam) * step(0.001, pot);
#ifdef LOW
  vec3 filmC = uFilm;
#else
  vec3 tb = texture2D(uWB, vB.zw).rgb;
  vec3 nf = normalize(vec3(texSlope(tb.xy * 2.0 - 1.0) * -0.9, 1.0));
  float gl = pow(max(dot(nf, HALF), 0.0), 160.0) * uMisc.y;
  vec3 filmC = uFilm + uSun * gl;
#endif
  float filmA = cov * (0.20 + 0.40 * sqrt(thick)) * soft;
  // compose back to front, premultiplied
  vec4 o = vec4(uWet, 1.0) * (wet * 0.45 * soft);
  o.rgb += uSky1 * (gloss * 0.22 * soft);
  o = vec4(filmC, 1.0) * filmA + o * (1.0 - filmA);
  o = vec4(0.10, 0.22, 0.34, 1.0) * (rim * 0.16) + o * (1.0 - rim * 0.16);
  float fa = clamp(max(foam * 0.97, ice * 0.9), 0.0, 1.0);
  vec3 fc = mix(uFoamS, uFoamC, max(fshade, ice * 0.8));
  o = vec4(fc, 1.0) * fa + o * (1.0 - fa);
  gl_FragColor = o;
}`;

// ------------------------------------------------------------------------------------------------ GL cache
// Programs and the shared textures live once per renderer (several Water regions share them).
const SHARED = new WeakMap();

function shared(renderer) {
  let s = SHARED.get(renderer);
  if (!s) { s = { programs: {}, textures: {}, refs: 0, gl: renderer.gl }; SHARED.set(renderer, s); }
  if (s.gl !== renderer.gl || s.stale) { s.programs = {}; s.textures = {}; s.gl = renderer.gl; s.refs = 0; s.stale = false; }
  return s;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Water shader: ' + log);
  }
  return sh;
}

const UNIFORMS = ['uView', 'uProj', 'uOrg', 'uCam', 'uRotA', 'uRotB', 'uOffAB', 'uFoamUV', 'uFish1', 'uFish2',
  'uField', 'uShore', 'uShoal', 'uAlong', 'uMisc', 'uPal', 'uSky0', 'uSky1', 'uSun', 'uFoamC', 'uFoamS',
  'uWA', 'uWB', 'uFoam', 'uLut', 'uFish', 'uSw', 'uRing', 'uRingN', 'uFishK', 'uBand1', 'uBand2', 'uSss', 'uBed',
  'uLow0', 'uLow1', 'uLow2', 'uLowA', 'uSwDir', 'uLaceOff', 'uWet', 'uFilm', 'uPal2'];

/** texture fetches per pixel of a variant: texture2D calls left after the #ifdef / #if defined() blocks */
function countFetches(src) {
  const defs = new Set();
  const stack = [];
  let on = true, n = 0;
  const evalIf = (expr) => expr.split('&&').every((t) => {
    const m = t.trim().match(/^(!?)\s*defined\((\w+)\)$/);
    return m ? (m[1] ? !defs.has(m[2]) : defs.has(m[2])) : true;
  });
  for (const line of src.split('\n')) {
    const l = line.trim();
    let m;
    if ((m = l.match(/^#define\s+(\w+)/))) { if (on) defs.add(m[1]); continue; }
    if ((m = l.match(/^#ifdef\s+(\w+)/))) { stack.push(on); on = on && defs.has(m[1]); continue; }
    if ((m = l.match(/^#ifndef\s+(\w+)/))) { stack.push(on); on = on && !defs.has(m[1]); continue; }
    if ((m = l.match(/^#if\s+(.*)$/))) { stack.push(on); on = on && evalIf(m[1]); continue; }
    if (l.startsWith('#else')) { on = stack[stack.length - 1] && !on; continue; }
    if (l.startsWith('#endif')) { on = stack.pop(); continue; }
    if (on) n += (l.match(/texture2D\(/g) || []).length;
  }
  return n;
}

function program(renderer, variant) {
  const s = shared(renderer);
  if (s.programs[variant]) return s.programs[variant];
  const gl = renderer.gl;
  const defs = {
    body_high: '#define NSW 4\n#define NRING ' + RINGS + '\n#define FISH\n',
    body_high_nofish: '#define NSW 4\n#define NRING ' + RINGS + '\n',
    body_low: '#define NSW 2\n#define NRING 4\n#define LOW\n',
    shore_high: '',
    shore_low: '#define LOW\n',
  }[variant];
  const body = variant.indexOf('body') === 0;
  const fsrc = defs + FRAG_COMMON + (body ? FRAG_BODY : FRAG_SHORE);
  const p = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('Water program: ' + gl.getProgramInfoLog(p));
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const u = {};
  for (const n of UNIFORMS) u[n] = gl.getUniformLocation(p, n);
  const prog = { p, u, aPos: gl.getAttribLocation(p, 'aPos'), variant, fetches: countFetches(fsrc) };
  s.programs[variant] = prog;
  return prog;
}

function setUnpack(gl) {
  const prev = [gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL), gl.getParameter(gl.UNPACK_ALIGNMENT)];
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  return prev;
}
function restoreUnpack(gl, prev) {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prev[0]);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prev[1]);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, prev[2]);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, prev[3]);
}

/** GL texture from a loaded Phaser texture key (REPEAT + mipmaps when power of two) */
function imageTexture(renderer, scene, key, repeat) {
  const s = shared(renderer);
  if (s.textures[key]) return s.textures[key];
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage();
  if (!src || !src.width) return null;
  const gl = renderer.gl;
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, t);
  const prev = setUnpack(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  restoreUnpack(gl, prev);
  const pot = (src.width & (src.width - 1)) === 0 && (src.height & (src.height - 1)) === 0;
  const rep = repeat && pot;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (rep) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  const tex = { t, w: src.width, h: src.height, bytes: src.width * src.height * 4 * (rep ? 4 / 3 : 1) };
  s.textures[key] = tex;
  return tex;
}

// ------------------------------------------------------------------------------------------------ masks
function inPoly(p, x, y) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * normalise opts.mask to fn(x, y) -> true where the WATER-LEVEL point (x, y) shows water.
 * The mask itself describes the land at z 0; land drawn as a wall over the water is seen `waterPx`
 * lower at the water plane, so land polygons / curves are tested at (x, y - waterPx).
 * Polygon entries may carry their own waterPx ({poly, waterPx: 0} for a breakwater whose slopes reach the water).
 */
function maskFn(mask, wp) {
  if (typeof mask === 'function') return (x, y) => mask(x, y - wp);
  if (mask && typeof mask.shoreY === 'function') { const f = mask.shoreY; return (x, y) => y - wp < f(x); }
  if (mask && (mask.water || mask.land)) {
    const norm = (p) => (Array.isArray(p) ? { poly: p, waterPx: wp } : { poly: p.poly, waterPx: p.waterPx !== undefined ? p.waterPx : wp });
    const water = mask.water ? mask.water.map(norm) : null, land = (mask.land || []).map(norm);
    return (x, y) => {
      if (water) { let w = false; for (const p of water) if (inPoly(p.poly, x, y)) { w = true; break; } if (!w) return false; }
      for (const p of land) if (inPoly(p.poly, x, y - p.waterPx)) return false;
      return true;
    };
  }
  return () => true;
}

/** normalise opts.shoreTypes to fn(x, y) -> type name */
function typeFn(st, def) {
  if (typeof st === 'string') return () => st;
  if (typeof st === 'function') return (x, y) => st(x, y) || def;
  if (Array.isArray(st)) {
    return (x, y) => {
      for (const s of st) {
        if (s.rect && x >= s.rect[0] && x <= s.rect[2] && y >= s.rect[1] && y <= s.rect[3]) return s.type;
        if (s.poly && inPoly(s.poly, x, y)) return s.type;
        if (s.x && x >= s.x[0] && x <= s.x[1]) return s.type;
      }
      return def;
    };
  }
  return () => def;
}

// 8SSEDT: nearest seed offset for every cell (seed cells: flag 1). Returns squared distances (cells^2).
function edt(nx, ny, seed, ox, oy) {
  const INF = 30000;
  for (let i = 0; i < nx * ny; i++) { if (seed[i]) { ox[i] = 0; oy[i] = 0; } else { ox[i] = INF; oy[i] = INF; } }
  const d2 = (i) => ox[i] * ox[i] + oy[i] * oy[i];
  const cmp = (i, x, y, dx, dy) => {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) return;
    const j = yy * nx + xx;
    if (ox[j] >= INF) return;
    const cx = ox[j] + dx, cy = oy[j] + dy;
    if (cx * cx + cy * cy < d2(i)) { ox[i] = cx; oy[i] = cy; }
  };
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) { const i = y * nx + x; cmp(i, x, y, -1, 0); cmp(i, x, y, 0, -1); cmp(i, x, y, -1, -1); cmp(i, x, y, 1, -1); }
    for (let x = nx - 1; x >= 0; x--) cmp(y * nx + x, x, y, 1, 0);
  }
  for (let y = ny - 1; y >= 0; y--) {
    for (let x = nx - 1; x >= 0; x--) { const i = y * nx + x; cmp(i, x, y, 1, 0); cmp(i, x, y, 0, 1); cmp(i, x, y, -1, 1); cmp(i, x, y, 1, 1); }
    for (let x = 0; x < nx; x++) cmp(y * nx + x, x, y, -1, 0);
  }
}

function blur(src, nx, ny, sigma, tmp) {
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += src[y * nx + Math.min(nx - 1, Math.max(0, x + i))] * k[i + r];
    tmp[y * nx + x] = a;
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += tmp[Math.min(ny - 1, Math.max(0, y + i)) * nx + x] * k[i + r];
    src[y * nx + x] = a;
  }
}

// ------------------------------------------------------------------------------------------------ Water
export class Water {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   *   region     {x, y, w, h}  world px rectangle the water may cover (the field / meshes live inside it)
   *   mask       fn(x, y) -> true where (land level) is water | {shoreY: fn(x)} (water above the curve) |
   *              {water: [poly], land: [poly]} (flat [x0, y0, x1, y1, ...] world px polygons)
   *   waterPx    sea surface below land (screen px): 0 for beaches / snow banks drawn to the waterline,
   *              30 (WATER_PX) where quay walls show their face (the mask is the land at z 0)
   *   shoreTypes 'sand' | fn(x, y) -> type | [{type, rect | poly | x: [x0, x1]}]; types: SHORE_TYPES
   *   defaultShore  type for unmatched shore cells (default 'snowbank')
   *   palette    'winter_sea' | 'harbor' | 'tropical' | 'pool' (or a palette object, see DEFAULT_PALETTES)
   *   quality    'high' | 'low'
   *   swellDir   [gx, gy] direction the swell travels in G space (default: toward the shore, from the field)
   *   swell, surf, ripple  multipliers (default from the palette look)
   *   fish       [{y0, y1, alpha, scale, speed, offset: [x, y], wobble}] (world px) up to 2 school bands drawn under
   *              the surface (high quality); key opts.fishKey (default 'fish_school')
   *   depth, shoreDepth   draw depths (default DEPTH.WATER, DEPTH.GROUND + 5)
   *   onCrash    fn(x, y, strength) for spray on rock / breakwater (default: plays fx_wave_crash if loaded)
   *   manifest   assets/water/manifest.json object (palettes); fallbackKey (default 'water_sea')
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts = opts;
    const r = opts.region || { x: 0, y: 0, w: 1024, h: 512 };
    this.region = { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.w), h: Math.ceil(r.h) };
    this.waterPx = opts.waterPx || 0;
    this.depth = opts.depth !== undefined ? opts.depth : DEPTH.WATER;
    this.shoreDepth = opts.shoreDepth !== undefined ? opts.shoreDepth : DEPTH.GROUND + 5;
    this.t = opts.time || 0;
    this.quality = opts.quality === 'low' ? 'low' : 'high';
    this.palettes = Object.assign({}, DEFAULT_PALETTES, (opts.manifest && opts.manifest.palettes) || {});
    this.alive = true;
    this.lost = false;
    this.stats = { fetchesBody: 0, fetchesShore: 0, textureBytes: 0, fieldCells: 0, bodyVerts: 0, shoreVerts: 0, buildMs: 0 };
    // preallocated uniform storage
    this._view = new Float32Array(9); this._view[8] = 1;
    this._sw = new Float32Array(16);
    this._ring = new Float32Array(RINGS * 4);
    this._rings = new Float32Array(RINGS * 4);     // world: gx, gy (region G), t0, strength
    this._ringN = 0; this._ringHead = 0;
    this._v4 = new Float32Array(4);
    this._col = new Float32Array(3 * 14);
    this._lowA = new Float32Array(4);
    this._fishLayers = [];
    this._sprites = [];
    this._onCrashEvt = (x, y, st) => this._crashEvt(x, y, st);

    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._buildField(maskFn(opts.mask, this.waterPx), typeFn(opts.shoreTypes || opts.defaultShore || 'snowbank', opts.defaultShore || 'snowbank'));
    this._setupWaves(opts.swellDir);
    this.setPalette(opts.palette || 'winter_sea');
    if (opts.fish) this.setFish(opts.fish, opts.fishKey);
    this._buildMeshes();
    this._buildCrashPoints();
    this.stats.buildMs = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) * 10) / 10;

    const renderer = scene.sys.renderer;
    this.isShader = false;
    if (renderer && renderer.gl && typeof Phaser !== 'undefined' && renderer.type === Phaser.WEBGL) {
      try { this._initGL(renderer); this.isShader = true; } catch (e) {
        if (typeof console !== 'undefined') console.warn('[Water] WebGL water unavailable, using the tileSprite sea:', e && e.message);
        this._freeGL();
      }
    }
    if (!this.isShader) this._initFallback();
    this._onShutdown = () => this.destroy();
    scene.events.once('shutdown', this._onShutdown);
    scene.events.once('destroy', this._onShutdown);
  }

  // ------------------------------------------------------------------ field
  _buildField(isWater, typeAt) {
    const R = this.region;
    const nx = Math.max(2, Math.ceil(R.w / CELL_X)), ny = Math.max(2, Math.ceil(R.h / CELL_Y));
    this.nx = nx; this.ny = ny;
    const N = nx * ny;
    this.stats.fieldCells = N;
    // coverage (2 x 2 samples per cell) at the water level (land at z 0 seen waterPx lower)
    const cov = new Float32Array(N);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      let c = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const wx = R.x + (x + 0.25 + sx * 0.5) * CELL_X, wy = R.y + (y + 0.25 + sy * 0.5) * CELL_Y;
        if (isWater(wx, wy)) c++;
      }
      cov[y * nx + x] = c / 4;
    }
    const water = new Uint8Array(N);
    for (let i = 0; i < N; i++) water[i] = cov[i] >= 0.5 ? 1 : 0;
    // shore cells: land cells next to water; their type decides the look of that stretch of coast
    const seedL = new Uint8Array(N), seedW = new Uint8Array(N), seedV = new Uint8Array(N);
    const tp = new Array(N);
    const defT = SHORE_TYPES[this.opts.defaultShore] ? this.opts.defaultShore : 'snowbank';
    let anyWave = false;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      if (water[i]) { seedW[i] = 1; continue; }
      const nb = (xx, yy) => (xx < 0 || yy < 0 || xx >= nx || yy >= ny) ? 0 : water[yy * nx + xx];
      if (!(nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1))) continue;
      seedL[i] = 1;
      const wx = R.x + (x + 0.5) * CELL_X, wy = R.y + (y + 0.5) * CELL_Y;
      let ty = typeAt(wx, wy);
      if ((!ty || ty === defT) && this.waterPx) ty = typeAt(wx, wy - this.waterPx);
      ty = SHORE_TYPES[ty] ? ty : defT;
      tp[i] = ty;
      if (SHORE_TYPES[ty].wave) { seedV[i] = 1; anyWave = true; }
    }
    const ox = new Int16Array(N), oy = new Int16Array(N);
    const ox2 = new Int16Array(N), oy2 = new Int16Array(N);
    edt(nx, ny, seedL, ox, oy);                 // every cell -> nearest shore (land) cell
    edt(nx, ny, seedW, ox2, oy2);               // land cells -> nearest water cell
    let anyLand = false;
    for (let i = 0; i < N; i++) if (!water[i]) { anyLand = true; break; }
    const d = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (water[i]) {
        const dd = anyLand && ox[i] < 30000 ? Math.hypot(ox[i], oy[i]) * CELL_G - CELL_G * 0.5 : DM;
        d[i] = Math.min(DM, Math.max(0.5, dd));
      } else {
        const dd = ox2[i] < 30000 ? Math.hypot(ox2[i], oy2[i]) * CELL_G - CELL_G * 0.5 : DM;
        d[i] = -Math.min(DM, Math.max(0.5, dd));
      }
      // sub-cell shoreline from the coverage of boundary cells
      if (cov[i] > 0 && cov[i] < 1 && Math.abs(d[i]) < CELL_G) d[i] = (cov[i] - 0.5) * CELL_G;
    }
    const tmp = new Float32Array(N);
    blur(d, nx, ny, 1.25, tmp);
    // wave distance: to the coasts that make the shore swell only (crests pass around breakwaters / quays),
    // smoothed harder so the crest lines stay round (no medial-axis kinks)
    const w = new Float32Array(N);
    if (anyWave) {
      const ox3 = new Int16Array(N), oy3 = new Int16Array(N);
      edt(nx, ny, seedV, ox3, oy3);
      for (let i = 0; i < N; i++) {
        if (!water[i]) { w[i] = d[i]; continue; }
        w[i] = ox3[i] < 30000 ? Math.min(DM, Math.hypot(ox3[i], oy3[i]) * CELL_G - CELL_G * 0.5) : DM;
      }
      blur(w, nx, ny, 3.0, tmp);
    } else w.fill(DM);
    // shore parameters from the nearest shore cell's type
    const pR = new Float32Array(N), pE = new Float32Array(N);
    const def = SHORE_TYPES[defT];
    for (let i = 0; i < N; i++) {
      let st = def;
      if (ox[i] < 30000) {
        const x = (i % nx) + ox[i], y = ((i / nx) | 0) + oy[i];
        const j = y * nx + x;
        if (j >= 0 && j < N && tp[j]) st = SHORE_TYPES[tp[j]];
      }
      pR[i] = st.runup; pE[i] = st.edge;
    }
    blur(pR, nx, ny, 2.0, tmp); blur(pE, nx, ny, 2.0, tmp);
    this.fieldD = d; this.fieldW = w; this.fieldR = pR; this.fieldE = pE;
    // RGBA8 texture: R = d, G = wave distance (sqrt-encoded, +-DM), B = runup, A = edge kind
    const px = new Uint8Array(N * 4);
    const enc = (v) => Math.round((0.5 + 0.5 * Math.sign(v) * Math.sqrt(Math.min(DM, Math.abs(v)) / DM)) * 255);
    for (let i = 0; i < N; i++) {
      px[i * 4] = enc(d[i]);
      px[i * 4 + 1] = enc(w[i]);
      px[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, pR[i])) * 255);
      px[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, pE[i])) * 255);
    }
    this.fieldPx = px;
    // mean gradient of the wave distance near the coast -> default swell direction (toward the shore)
    let gx = 0, gy = 0;
    const src = anyWave ? w : d;
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      const i = y * nx + x;
      if (!water[i] || src[i] <= 0 || src[i] > 500) continue;
      gx += src[i + 1] - src[i - 1]; gy += src[i + nx] - src[i - nx];
    }
    const L = Math.hypot(gx, gy);
    this.autoDir = L > 1e-6 ? [-gx / L, -gy / L] : [0, 1];
  }

  /** bilinear sample of a field array at world (x, y) */
  _sample(arr, x, y) {
    const fx = (x - this.region.x) / CELL_X - 0.5, fy = (y - this.region.y) / CELL_Y - 0.5;
    const nx = this.nx, ny = this.ny;
    const x0 = Math.max(0, Math.min(nx - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(ny - 1, Math.floor(fy)));
    const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = arr[y0 * nx + x0], b = arr[y0 * nx + x1], c = arr[y1 * nx + x0], e = arr[y1 * nx + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
  }

  /** signed distance to the shoreline (G px, + = water) at world (x, y) */
  shoreDistance(x, y) { return this._sample(this.fieldD, x, y); }

  /** distance (G px) to the coasts that make the shore swell (its crests follow this field) */
  waveDistance(x, y) { return Math.max(0, this._sample(this.fieldW, x, y)); }

  // ------------------------------------------------------------------ waves
  _setupWaves(dir) {
    const d = dir ? [dir[0], dir[1]] : this.autoDir;
    const L = Math.hypot(d[0], d[1]) || 1;
    this.swellDir = [d[0] / L, d[1] / L];
    const base = Math.atan2(this.swellDir[1], this.swellDir[0]);
    this.waves = SWELL.waves.map((w) => {
      const a = base + (w.rot * Math.PI) / 180;
      const k = TAU / w.len;
      return { kx: Math.cos(a) * k, ky: Math.sin(a) * k, w: Math.sqrt(G_ACC * k) * SWELL.timeScale, amp: w.amp };
    });
    const sh = SWELL.shore;
    this.shore = { k: TAU / sh.len, w: TAU / sh.period, amp: sh.amp, reach: sh.reach, shoalA: sh.shoalA, shoalD: sh.shoalD, period: sh.period };
  }

  _nu(gx, gy) { return NU[0] * Math.sin(NU[1] * gx + NU[2] * gy) + NU[3] * Math.sin(NU[4] * gx + NU[5] * gy + NU[6]); }
  _av(gx, gy, t) { return AV[0] + AV[1] * Math.sin(AV[2] * gx + AV[3] * gy + AV[4] * t) + AV[5] * Math.sin(AV[6] * gx + AV[7] * gy + AV[8] * t + AV[9]); }

  /**
   * surface height (screen px, + = up) at world (x, y) and time t (s; default now) — the same maths as the
   * shader (directional swell + shore swell + ripple rings), so floating sprites can use y = waterY - h.
   */
  heightAt(x, y, t) { this._surface(x, y, t === undefined ? this.t : t, null); return this._h; }

  /** surface slope at world (x, y): out.x = dh/dx, out.y = dh/dy (screen px per screen px). Tilt a boat by it. */
  slopeAt(x, y, t, out) {
    const o = out || this._slopeOut || (this._slopeOut = { x: 0, y: 0 });
    this._surface(x, y, t === undefined ? this.t : t, o);
    return o;
  }

  _surface(x, y, t, out) {
    const gx = x - this.region.x, gy = 2 * (y - this.region.y);
    const sw = this.swellAmp, d = this.shoreDistance(x, y), dpos = Math.max(0, d);
    let h = 0, sx = 0, sy = 0;
    const wDir = 0.45 + 0.55 * smooth(0, this.shore.reach, dpos);
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      const ph = w.kx * gx + w.ky * gy - wrap(w.w * t);
      const a = w.amp * sw * wDir;
      h += a * Math.sin(ph);
      if (out) { const c = a * Math.cos(ph); sx += w.kx * c; sy += w.ky * c; }
    }
    const S = this.shore;
    const nu = this._nu(gx, gy), av = this._av(gx, gy, t);
    const dw = this.waveDistance(x, y);
    const psi = dw + S.shoalA * S.shoalD * (1 - Math.exp(-dw / S.shoalD));
    const phS = S.k * psi + wrap(S.w * t) + nu;
    const wS = 1 - smooth(S.reach * 0.45, S.reach, dw);
    const hs = S.amp * this.surfAmp * av * wS * Math.sin(phS);
    h += hs;
    if (out && wS > 0) {
      // the shore swell's slope runs along the wave-distance gradient
      const e = 6;
      const dx = (this.waveDistance(x + e, y) - this.waveDistance(x - e, y)) / (2 * e);
      const dy = (this.waveDistance(x, y + e / 2) - this.waveDistance(x, y - e / 2)) / e;   // per G px
      const dpsi = 1 + S.shoalA * Math.exp(-dw / S.shoalD);
      const c = S.amp * this.surfAmp * av * wS * Math.cos(phS) * S.k * dpsi * (d > 0 ? 1 : 0);
      sx += c * dx; sy += c * dy;
    }
    // ripple rings
    for (let i = 0; i < this._ringN; i++) {
      const o = i * 4;
      const age = t - this._rings[o + 2];
      if (age < 0 || age > 4) continue;
      const dvx = gx - this._rings[o], dvy = gy - this._rings[o + 1];
      const dist = Math.hypot(dvx, dvy);
      const wr = 10 + age * 12;
      const xx = (dist - age * 110) / wr;
      if (Math.abs(xx) >= 3) continue;
      const env = this._rings[o + 3] * Math.exp(-age * 1.3) * Math.exp(-xx * xx * 1.6);
      h += env * Math.sin(xx * 5) * 1.5;
      if (out && dist > 1) { const c = env * Math.cos(xx * 5) * 7.5 / wr; sx += (dvx / dist) * c; sy += (dvy / dist) * c; }
    }
    this._h = h;
    if (out) { out.x = sx; out.y = 2 * sy; }       // G y = 2 screen y
  }

  /** the water surface point (screen px) under world (x, y) at the land level: y + waterPx - height */
  surfaceY(x, y, t) { return y + this.waterPx - this.heightAt(x, y, t); }

  /**
   * add a ripple ring (splash, swimmer stroke, wake puff) at world (x, y); strength ~0.3 .. 2.
   * t0 = birth time (default now; captures pass it explicitly). Ring buffer of 12: the oldest goes first.
   */
  ripple(x, y, strength = 1, t0) {
    const o = this._ringHead * 4;
    this._rings[o] = x - this.region.x; this._rings[o + 1] = 2 * (y - this.region.y);
    this._rings[o + 2] = t0 === undefined ? this.t : t0; this._rings[o + 3] = Math.max(0, Math.min(3, strength));
    this._ringHead = (this._ringHead + 1) % RINGS;
    this._ringN = Math.min(RINGS, this._ringN + 1);
  }

  /** forget every ripple ring */
  clearRipples() { this._ringN = 0; this._ringHead = 0; return this; }

  // ------------------------------------------------------------------ palette / quality / fish
  /** switch the colour palette ('winter_sea' | 'harbor' | 'tropical' | 'pool' | palette object) */
  setPalette(p) {
    const pal = typeof p === 'string' ? this.palettes[p] : p;
    if (!pal) return this;
    this.paletteName = typeof p === 'string' ? p : (pal.name || 'custom');
    this.pal = pal;
    const look = LOOK[this.paletteName] || LOOK.winter_sea;
    this.look = look;
    const o = this.opts;
    this.swellAmp = (o.swell !== undefined ? o.swell : look.swell);
    this.surfAmp = (o.surf !== undefined ? o.surf : look.surf);
    this.rippleAmp = (o.ripple !== undefined ? o.ripple : look.ripple);
    const c = this._col;
    hex3(pal.skyHi, c, 0); hex3(pal.skyLo, c, 3); hex3(pal.sun, c, 6); hex3(pal.foam, c, 9); hex3(pal.foamShade, c, 12);
    hex3(pal.sss, c, 15); hex3(pal.bottom, c, 18); hex3(pal.wet, c, 21); hex3(pal.film, c, 24);
    // LOW quality: three colour stops instead of the LUT
    const lut = pal.lut;
    const at = (u) => { let i = 0; while (i < lut.length - 2 && lut[i + 1][0] < u) i++; return lut[i + 1][0] - u < u - lut[i][0] ? lut[i + 1] : lut[i]; };
    hex3(lut[0][1], c, 27); hex3(at(0.3)[1], c, 30); hex3(lut[lut.length - 1][1], c, 33);
    this._lowA[0] = 0.3; this._lowA[1] = lut[0][2] !== undefined ? lut[0][2] : 0.3;
    this._lutRow = pal.row !== undefined ? pal.row : 0;
    if (this.isShader && this._lutDirty !== undefined) this._uploadLutRow(pal);
    this.lutV = (this._lutRow + 0.5) / LUT_ROWS;
    return this;
  }

  /** 'high' (full shader, fish under the surface) | 'low' (2 texture fetches, no caustics / fish) */
  setQuality(q) {
    this.quality = q === 'low' ? 'low' : 'high';
    if (this.isShader) this._pickPrograms();
    if (this.scene && this.scene.events) this.scene.events.emit('water:quality', this.quality, this);
    return this;
  }

  /** does this Water draw the fish schools itself? (high quality + fish layers) — else keep the tileSprites */
  get drawsFish() { return !!(this.isShader && this.quality === 'high' && this._fishLayers.length && this._fishTex); }

  /**
   * fish schools under the surface: [{y0, y1, alpha, scale, speed: [vx, vy], offset: [x, y], wobble: [amp, freq]}]
   * (world px; like Ground.js: band 1 y 40..240 alpha 0.55 speed 22, band 2 y 150..350 alpha 0.35 scale 0.8)
   */
  setFish(layers, key) {
    this._fishKey = key || this._fishKey || 'fish_school';
    this._fishLayers = (layers || []).slice(0, 2).map((l) => Object.assign({ y0: 0, y1: 200, alpha: 0.5, scale: 1, speed: [22, 0], offset: [0, 0], wobble: [5, 0.7] }, l));
    if (this.isShader && this._renderer) this._fishTex = imageTexture(this._renderer, this.scene, this._fishKey, true);
    if (this.isShader) this._pickPrograms();
    return this;
  }

  // ------------------------------------------------------------------ time
  /** advance the water clock (seconds) — call from the scene update */
  update(dt) {
    if (!this.alive) return;
    this.t += Math.min(0.1, Math.max(0, dt || 0));
    this._tick();
  }

  /** set the water clock (deterministic captures / tests) */
  setTime(t) { this.t = t; this._tPrev = t; this._tick(true); }

  _tick(jump) {
    // (rings expire by age in _draw / _surface; the buffer itself only wraps)
    if (this.fallback) {
      this.fallback.tilePositionX = this.t * 6;
      this.fallback.tilePositionY = Math.sin(this.t * 0.4) * 6;
    }
    if (!jump) this._crashes();
  }

  // ------------------------------------------------------------------ crash spray (rock / breakwater)
  _buildCrashPoints() {
    const pts = [];
    const nx = this.nx, ny = this.ny, R = this.region;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      const d = this.fieldD[i];
      if (d < 2 || d > 16 || this.fieldE[i] < 0.75 || this.fieldR[i] > 0.05) continue;
      const wx = R.x + (x + 0.5) * CELL_X, wy = R.y + (y + 0.5) * CELL_Y;
      let ok = true;
      for (const p of pts) if (Math.hypot(p.x - wx, 2 * (p.y - wy)) < 110) { ok = false; break; }
      if (ok) {
        const dw = this.fieldW[i];
        const S = this.shore;
        pts.push({ x: wx, y: wy, cyc: -1, g: [wx - R.x, 2 * (wy - R.y)], k: S.k * (dw + S.shoalA * S.shoalD * (1 - Math.exp(-dw / S.shoalD))) });
      }
    }
    this.crashPoints = pts;
  }

  /**
   * crash-spray events (rock / breakwater shores) whose swell crest arrives in (t0, t1]: calls
   * fn(x, y, strength, t) for each (deterministic: the same phase the shader's slap burst uses).
   * update() feeds these to opts.onCrash or plays fx_wave_crash; captures / tests can call it directly.
   */
  crashEvents(t0, t1, fn) {
    const pts = this.crashPoints;
    if (!pts.length || this.surfAmp <= 0 || !(t1 > t0)) return 0;
    const S = this.shore;
    let n = 0;
    for (let ci = 0; ci < pts.length; ci++) {
      const p = pts[ci];
      const base = p.k + this._nu(p.g[0], p.g[1]) - Math.PI / 2;    // phase(t) = base + w t; a crest = 2 pi m
      for (let m = Math.floor((base + S.w * t0) / TAU) + 1; ; m++) {
        const tc = (m * TAU - base) / S.w;
        if (tc > t1) break;
        if (tc <= t0) continue;
        const av = this._av(p.g[0], p.g[1], tc);
        if (av < 0.78) continue;                 // only the bigger waves of a set throw spray
        fn(p.x, p.y, Math.min(1.4, (av - 0.6) * 2.2) * Math.max(0.5, this.surfAmp), tc);
        n++;
      }
    }
    return n;
  }

  _crashes() {
    const t0 = this._tPrev === undefined ? this.t : this._tPrev;
    this._tPrev = this.t;
    if (this.t - t0 > 1) return;                 // a jump (tab was hidden): no burst of old crashes
    this.crashEvents(t0, this.t, this._onCrashEvt);
  }

  _crashEvt(x, y, strength) {
    const cam = this.scene.cameras && this.scene.cameras.main;
    const v = cam && cam.worldView;
    if (v && (x < v.x - 80 || x > v.right + 80 || y < v.y - 120 || y > v.bottom + 60)) return;
    if (this.opts.onCrash) this.opts.onCrash(x, y, strength);
    else this._spray(x, y, strength);
  }

  _spray(x, y, s) {
    const sc = this.scene;
    if (!sc.textures.exists('fx_wave_crash') || !sc.anims.exists('fx_wave_crash')) return;
    let sp = null;
    for (let i = 0; i < this._sprites.length; i++) if (!this._sprites[i].visible) { sp = this._sprites[i]; break; }
    if (!sp) {
      if (this._sprites.length >= 6) return;
      sp = sc.add.sprite(0, 0, 'fx_wave_crash').setVisible(false);
      sp.on('animationcomplete', () => sp.setVisible(false));
      this._sprites.push(sp);
    }
    sp.setPosition(x, y).setVisible(true).setDepth(y + 2).setScale(0.75 + 0.35 * s).setFlipX(Math.random() < 0.5);
    const def = this.opts.crashAnchor || [0.5, 0.82];
    sp.setOrigin(def[0], def[1]);
    sp.play({ key: 'fx_wave_crash', repeat: 0 });
  }

  // ------------------------------------------------------------------ meshes
  _buildMeshes() {
    const nx = this.nx, ny = this.ny, R = this.region, d = this.fieldD, ru = this.fieldR;
    const body = [], shore = [];
    // body: 8 x 8 cell blocks (64 x 32 px) that hold any water (+ a cell of margin under the land edge)
    const B = 8;
    for (let by = 0; by < Math.ceil(ny / B); by++) {
      let run = -1;
      const flush = (bx) => {
        if (run < 0) return;
        const x0 = R.x + run * B * CELL_X, x1 = Math.min(R.x + R.w, R.x + bx * B * CELL_X);
        const y0 = R.y + by * B * CELL_Y, y1 = Math.min(R.y + R.h, R.y + (by + 1) * B * CELL_Y);
        body.push(x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1);
        run = -1;
      };
      for (let bx = 0; bx < Math.ceil(nx / B); bx++) {
        let any = false;
        for (let y = Math.max(0, by * B - 1); y < Math.min(ny, by * B + B + 1) && !any; y++) {
          for (let x = Math.max(0, bx * B - 1); x < Math.min(nx, bx * B + B + 1); x++) if (d[y * nx + x] > -24) { any = true; break; }
        }
        if (any) { if (run < 0) run = bx; } else flush(bx);
      }
      flush(Math.ceil(nx / B));
    }
    // shore: 4 x 4 cell blocks (32 x 16 px) near soft shores
    const S = 4;
    for (let by = 0; by < Math.ceil(ny / S); by++) {
      let run = -1;
      const flush = (bx) => {
        if (run < 0) return;
        const x0 = R.x + run * S * CELL_X, x1 = Math.min(R.x + R.w, R.x + bx * S * CELL_X);
        const y0 = R.y + by * S * CELL_Y, y1 = Math.min(R.y + R.h, R.y + (by + 1) * S * CELL_Y);
        shore.push(x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1);
        run = -1;
      };
      for (let bx = 0; bx < Math.ceil(nx / S); bx++) {
        let any = false;
        for (let y = Math.max(0, by * S - 1); y < Math.min(ny, by * S + S + 1) && !any; y++) {
          for (let x = Math.max(0, bx * S - 1); x < Math.min(nx, bx * S + S + 1); x++) {
            const i = y * nx + x, r = ru[i];
            if (r > 0.02 && d[i] > -(r * RUNUP_MAX * 1.2 + 60) && d[i] < 40 + 210 * r) { any = true; break; }
          }
        }
        if (any) { if (run < 0) run = bx; } else flush(bx);
      }
      flush(Math.ceil(nx / S));
    }
    this.meshBody = new Float32Array(body);
    this.meshShore = new Float32Array(shore);
    this.stats.bodyVerts = body.length / 2;
    this.stats.shoreVerts = shore.length / 2;
  }

  // ------------------------------------------------------------------ GL
  _initGL(renderer) {
    this._renderer = renderer;
    const gl = renderer.gl;
    const sc = this.scene;
    const s = shared(renderer);
    s.refs++;
    this._shared = s;
    this.tex = {
      a: imageTexture(renderer, sc, TEX.a, true), b: imageTexture(renderer, sc, TEX.b, true),
      foam: imageTexture(renderer, sc, TEX.foam, true), lut: imageTexture(renderer, sc, TEX.lut, false),
    };
    if (!this.tex.a || !this.tex.b || !this.tex.foam || !this.tex.lut) throw new Error('water textures not loaded (assets/water)');
    if (this._fishLayers.length) this._fishTex = imageTexture(renderer, sc, this._fishKey, true);
    // the field
    this.fieldTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    const prev = setUnpack(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.fieldPx);
    restoreUnpack(gl, prev);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // meshes
    this.vboBody = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBody);
    gl.bufferData(gl.ARRAY_BUFFER, this.meshBody, gl.STATIC_DRAW);
    this.vboShore = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboShore);
    gl.bufferData(gl.ARRAY_BUFFER, this.meshShore, gl.STATIC_DRAW);
    this._pickPrograms();
    this._lutDirty = false;
    if (this.pal && this.pal.row === undefined) this._uploadLutRow(this.pal);
    // the two Extern game objects
    if (!this.body) {
      this.body = sc.add.extern();
      this.body.setDepth(this.depth);
      this.body.render = (r, cam, calc) => this._draw(r, cam, calc, false);
      this.shoreObj = sc.add.extern();
      this.shoreObj.setDepth(this.shoreDepth);
      this.shoreObj.render = (r, cam, calc) => this._draw(r, cam, calc, true);
      this.shoreObj.setVisible(this.meshShore.length > 0);
      this._onLost = () => { this.lost = true; const sh = SHARED.get(renderer); if (sh) sh.stale = true; };
      this._onRestore = () => {
        // every GL object died with the context: forget the handles (nothing to delete) and rebuild
        this.lost = false; this._shared = null; this.fieldTex = null; this.vboBody = null; this.vboShore = null;
        try { this._initGL(renderer); } catch (e) { console.warn('[Water] restore failed', e); }
      };
      renderer.on('losewebgl', this._onLost);
      renderer.on('restorewebgl', this._onRestore);
    }
    this.stats.fetchesBody = this.progBody.fetches;
    this.stats.fetchesShore = this.progShore.fetches;
    let bytes = this.nx * this.ny * 4;
    for (const k in s.textures) bytes += s.textures[k].bytes;
    this.stats.textureBytes = Math.round(bytes);
  }

  _pickPrograms() {
    const r = this._renderer;
    if (!r) return;
    const high = this.quality === 'high';
    this.progBody = program(r, high ? (this._fishLayers.length && this._fishTex ? 'body_high' : 'body_high_nofish') : 'body_low');
    this.progShore = program(r, high ? 'shore_high' : 'shore_low');
    this.stats.fetchesBody = this.progBody.fetches;
    this.stats.fetchesShore = this.progShore.fetches;
  }

  /** write a custom palette into a spare LUT row (rows 4..7) */
  _uploadLutRow(pal) {
    if (!this.isShader && !this._renderer) return;
    const s = this._shared, gl = this._renderer.gl;
    if (pal.row === undefined) pal.row = 4 + ((s.nextRow = ((s.nextRow || 0) + 1) % 4));
    if (pal.row < 4) return;
    const row = new Uint8Array(256 * 4), c = new Float32Array(3);
    for (let i = 0; i < 256; i++) {
      const u = (i + 0.5) / 256, L = pal.lut;
      let j = 0; while (j < L.length - 2 && L[j + 1][0] < u) j++;
      const a = L[j], b = L[j + 1], f = Math.min(1, Math.max(0, (u - a[0]) / Math.max(1e-6, b[0] - a[0])));
      const ca = hex3(a[1], new Float32Array(3), 0), cb = hex3(b[1], c, 0);
      for (let k = 0; k < 3; k++) row[i * 4 + k] = Math.round((ca[k] * (1 - f) + cb[k] * f) * 255);
      row[i * 4 + 3] = Math.round(((a[2] !== undefined ? a[2] : 1) * (1 - f) + (b[2] !== undefined ? b[2] : 1) * f) * 255);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.lut.t);
    const prev = setUnpack(gl);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, pal.row, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
    restoreUnpack(gl, prev);
    this._lutRow = pal.row;
    this.lutV = (pal.row + 0.5) / LUT_ROWS;
  }

  _freeGL(keepObjects) {
    const r = this._renderer;
    if (r && r.gl && !r.gl.isContextLost()) {
      const gl = r.gl;
      if (this.fieldTex) gl.deleteTexture(this.fieldTex);
      if (this.vboBody) gl.deleteBuffer(this.vboBody);
      if (this.vboShore) gl.deleteBuffer(this.vboShore);
    }
    this.fieldTex = null; this.vboBody = null; this.vboShore = null;
    if (this._shared) {
      this._shared.refs--;
      if (this._shared.refs <= 0 && r && r.gl && !r.gl.isContextLost()) {
        for (const k in this._shared.textures) r.gl.deleteTexture(this._shared.textures[k].t);
        for (const k in this._shared.programs) r.gl.deleteProgram(this._shared.programs[k].p);
        this._shared.textures = {}; this._shared.programs = {};
      }
      if (keepObjects && this._shared.refs <= 0) { this._shared.textures = {}; this._shared.programs = {}; }
      this._shared = null;
    }
    if (!keepObjects) {
      if (this.body) { this.body.destroy(); this.body = null; }
      if (this.shoreObj) { this.shoreObj.destroy(); this.shoreObj = null; }
      if (r && this._onLost) { r.off('losewebgl', this._onLost); r.off('restorewebgl', this._onRestore); }
    }
  }

  _initFallback() {
    const sc = this.scene, R = this.region, key = this.opts.fallbackKey || 'water_sea';
    if (sc.textures.exists(key)) {
      this.fallback = sc.add.tileSprite(R.x, R.y, R.w, R.h, key).setOrigin(0, 0).setDepth(this.depth);
    }
  }

  /** the per-frame uniforms + draw call of one pass (no allocations) */
  _draw(renderer, camera, calc, isShore) {
    if (!this.alive || this.lost || !this.fieldTex) return;
    const prog = isShore ? this.progShore : this.progBody;
    const vbo = isShore ? this.vboShore : this.vboBody;
    const count = (isShore ? this.meshShore.length : this.meshBody.length) / 2;
    if (!prog || !count) return;
    const gl = renderer.gl, u = prog.u, R = this.region, t = this.t;
    gl.useProgram(prog.p);
    const m = calc.matrix, V = this._view;
    V[0] = m[0]; V[1] = m[1]; V[3] = m[2]; V[4] = m[3]; V[6] = m[4]; V[7] = m[5];
    gl.uniformMatrix3fv(u.uView, false, V);
    gl.uniformMatrix4fv(u.uProj, false, renderer.projectionMatrix.val);
    // camera-relative G origin keeps every interpolated value small (mediump-safe)
    const wv = camera.worldView;
    const cx = Math.round(wv.centerX), cy = Math.round(wv.centerY);
    const gcx = cx - R.x, gcy = 2 * (cy - R.y);
    gl.uniform4f(u.uOrg, R.x, R.y, 1 / (this.nx * CELL_X), 1 / (this.ny * CELL_Y));
    gl.uniform2f(u.uCam, cx, cy);
    // ripple layers: rotation + scroll (offsets wrapped, camera relative)
    const ca = 0.9563, sa = 0.2924, cb = 0.8572, sb = -0.5150;        // 17 deg, -31 deg
    const ax = (ca * gcx - sa * gcy) / TILE_A + t * 0.0105, ay = (sa * gcx + ca * gcy) / TILE_A + t * 0.0061;
    const bx = (cb * gcx - sb * gcy) / TILE_B - t * 0.0172, by = (sb * gcx + cb * gcy) / TILE_B + t * 0.0228;
    gl.uniform4f(u.uRotA, ca, sa, 1 / TILE_A, 0);
    gl.uniform4f(u.uRotB, cb, sb, 1 / TILE_B, 0);
    gl.uniform4f(u.uOffAB, fract(ax), fract(ay), fract(bx), fract(by));
    gl.uniform4f(u.uFoamUV, 1 / TILE_FOAM, fract(gcx / TILE_FOAM + t * 0.004), fract(gcy / TILE_FOAM + t * 0.0025), 0);
    // fish layers (screen px, like the old tileSprites)
    const fl = this._fishLayers;
    for (let i = 0; i < 2; i++) {
      const L = fl[i];
      const uf = i ? u.uFish2 : u.uFish1;
      if (!L || !this._fishTex) { gl.uniform4f(uf, 0, 0, 0, 0); continue; }
      const tw = this._fishTex.w * L.scale, th = this._fishTex.h * L.scale;
      const tx = L.offset[0] + t * L.speed[0], ty = L.offset[1] + t * L.speed[1] + Math.sin(t * L.wobble[1]) * L.wobble[0];
      gl.uniform4f(uf, 1 / tw, 1 / th, fract((cx + tx * L.scale) / tw), fract((cy - L.y0 + ty * L.scale) / th));
    }
    // waves
    const sh = this.shore;
    gl.uniform4f(u.uShore, sh.k, wrap(sh.w * t), sh.amp * this.surfAmp, sh.reach);
    gl.uniform4f(u.uShoal, sh.shoalA, sh.shoalD, SWELL.normalBoost, SWELL.ripple * this.rippleAmp);
    gl.uniform4f(u.uAlong, wrap(NU[1] * gcx + NU[2] * gcy), wrap(NU[4] * gcx + NU[5] * gcy + NU[6]),
      wrap(AV[2] * gcx + AV[3] * gcy + AV[4] * t), wrap(AV[6] * gcx + AV[7] * gcy + AV[8] * t + AV[9]));
    gl.uniform4f(u.uMisc, camera.zoom, this.look.glint, this.look.refl, 0.035);
    gl.uniform4f(u.uPal, this.lutV, this.pal.depthScale, this.pal.caustic, this.look.whitecap);
    const c = this._col;
    gl.uniform3f(u.uSky0, c[0], c[1], c[2]); gl.uniform3f(u.uSky1, c[3], c[4], c[5]); gl.uniform3f(u.uSun, c[6], c[7], c[8]);
    gl.uniform3f(u.uFoamC, c[9], c[10], c[11]); gl.uniform3f(u.uFoamS, c[12], c[13], c[14]);
    this._unit = 0;
    this._bind(gl, u.uField, this.fieldTex);
    if (!isShore) {
      const sw = this._sw;
      for (let i = 0; i < 4; i++) {
        const w = this.waves[i];
        sw[i * 4] = w.kx; sw[i * 4 + 1] = w.ky;
        sw[i * 4 + 2] = wrap(w.kx * gcx + w.ky * gcy - w.w * t);
        sw[i * 4 + 3] = w.amp * this.swellAmp;
      }
      gl.uniform4fv(u.uSw, sw);
      const rg = this._ring;
      let n = 0;
      for (let i = 0; i < this._ringN; i++) {
        const o = i * 4, age = t - this._rings[o + 2];
        if (age < 0 || age > 4) continue;
        rg[n * 4] = this._rings[o] - gcx; rg[n * 4 + 1] = this._rings[o + 1] - gcy; rg[n * 4 + 2] = age; rg[n * 4 + 3] = this._rings[o + 3];
        n++;
      }
      gl.uniform4fv(u.uRing, rg);
      gl.uniform4f(u.uRingN, n, 110, 10, 0);
      gl.uniform4f(u.uFishK, fl[0] ? fl[0].alpha : 0, fl[1] ? fl[1].alpha : 0, 0, 0);
      gl.uniform4f(u.uBand1, fl[0] ? fl[0].y0 - R.y : 0, fl[0] ? fl[0].y1 - R.y : 0, 26, 0);
      gl.uniform4f(u.uBand2, fl[1] ? fl[1].y0 - R.y : 0, fl[1] ? fl[1].y1 - R.y : 0, 26, 0);
      gl.uniform3f(u.uSss, c[15], c[16], c[17]); gl.uniform3f(u.uBed, c[18], c[19], c[20]);
      gl.uniform3f(u.uLow0, c[27], c[28], c[29]); gl.uniform3f(u.uLow1, c[30], c[31], c[32]); gl.uniform3f(u.uLow2, c[33], c[34], c[35]);
      gl.uniform4fv(u.uLowA, this._lowA);
      gl.uniform4f(u.uRotA, ca, sa, 1 / TILE_A, 0);
      this._bind(gl, u.uWA, this.tex.a.t);
      this._bind(gl, u.uWB, this.tex.b.t);
      this._bind(gl, u.uFoam, this.tex.foam.t);
      this._bind(gl, u.uLut, this.tex.lut.t);
      if (this._fishTex) this._bind(gl, u.uFish, this._fishTex.t);
    } else {
      const sd = this.swellDir;
      gl.uniform4f(u.uSwDir, sd[0], sd[1], 1 / TILE_LACE, sh.period);
      gl.uniform4f(u.uLaceOff, fract(gcx / TILE_LACE + t * 0.003), fract(gcy / TILE_LACE - t * 0.002),
        fract(gcx * 0.0071 + t * 0.011), fract(gcy * 0.0071 + Math.sin(t * 0.5) * 0.01));
      gl.uniform3f(u.uWet, c[21], c[22], c[23]); gl.uniform3f(u.uFilm, c[24], c[25], c[26]);
      gl.uniform4f(u.uPal2, this.pal.slush || 0, 0, 0, 0);
      this._bind(gl, u.uWB, this.tex.b.t);
      this._bind(gl, u.uFoam, this.tex.foam.t);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.disableVertexAttribArray(0);
    gl.activeTexture(gl.TEXTURE0);
  }

  _bind(gl, loc, tex) {
    if (!loc || !tex) return;
    gl.activeTexture(gl.TEXTURE0 + this._unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, this._unit);
    this._unit++;
  }

  // ------------------------------------------------------------------ misc
  /** hide / show both layers */
  setVisible(v) {
    if (this.body) this.body.setVisible(v);
    if (this.shoreObj) this.shoreObj.setVisible(v && this.meshShore.length > 0);
    if (this.fallback) this.fallback.setVisible(v);
    return this;
  }

  /** human-readable cost summary (texture fetches per pixel, memory, mesh sizes) */
  info() {
    return Object.assign({ shader: this.isShader, quality: this.quality, palette: this.paletteName, field: [this.nx, this.ny],
      crashPoints: this.crashPoints.length, drawsFish: this.drawsFish }, this.stats);
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (this.scene && this.scene.events) {
      this.scene.events.off('shutdown', this._onShutdown);
      this.scene.events.off('destroy', this._onShutdown);
    }
    this._freeGL(false);
    if (this.fallback) { this.fallback.destroy(); this.fallback = null; }
    for (const s of this._sprites) s.destroy();
    this._sprites.length = 0;
  }
}

/** helpers for building masks */
export const WaterMask = {
  /** water above the curve y = f(x) (the village coast: shoreY from data/world.js) */
  shoreY(f) { return { shoreY: f }; },
  /** iso rectangle (w x h metres around cx, cy) as a flat polygon, for quays / beaches / pools */
  isoRect(cx, cy, w, h) {
    const AX = [45.2548, 22.6274], AY = [45.2548, -22.6274];
    const p = (mx, my) => [cx + AX[0] * mx + AY[0] * my, cy + AX[1] * mx + AY[1] * my];
    return [...p(-w / 2, -h / 2), ...p(-w / 2, h / 2), ...p(w / 2, h / 2), ...p(w / 2, -h / 2)];
  },
};
