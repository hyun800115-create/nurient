// Living water (CONTRACT_V7 §V) — a standalone WebGL sea for Phaser 3.90 (GLSL ES 1.0, WebGL1-safe).
//
// NOT imported by the game yet: see docs/build_reports/water.md for the integration into Ground.js.
//
// What it draws (one Water = one region of sea, lake or pool):
//   * body  (depth opts.depth, default DEPTH.WATER, below everything): long swells rolling toward the shore
//     (4 directional Gerstner-like waves + one shore-parallel wave whose crests follow the coastline and
//     bunch up as they shoal — both light the surface), two scrolling FFT ripple normal layers, fresnel sky
//     reflection with a soft shoulder, small soft sun glints, depth colour from a palette LUT over a sea bed
//     baked into the shoreline field, moving caustics, fish schools UNDER the surface, ripple rings
//     (splashes / wakes), contact foam + shadow around hulls and posts (addContact), soft whitecap streaks
//     riding the swell crests, and the foam of HARD shores (rock / breakwater slap collar that travels along
//     the wall with the swell, quay lapping line + contact shadow).
//   * shore (depth opts.shoreDepth, default DEPTH.GROUND + 5, i.e. just above the baked land tiles and
//     below floors / decals / pads / characters): the SOFT shores — breaking crest lines in the surf zone,
//     a white roll at the waterline on every crest, foam lace that rolls up the shore and recedes (swash)
//     along the LOCAL shore normal, leaving a darker wet band that dries; slush riding up a snow bank.
// Both are Phaser `Extern` game objects with their own GL program and a static mesh that only covers
// the water (body; plus an open-sea skirt past region edges that lie in open water) or the shore band
// (shore), so they composite at their depth, follow camera scroll / zoom (0.45 .. 1.7 x View.k) and render
// at the canvas resolution (devicePixelRatio) for free.
//
// Coordinates: world px (screen space of the game). "G space" = (x, 2y) relative to the region origin
// = the iso ground plane seen from above (metric, 64 G px per metre). Every texture and every wave is
// defined in G space, so the waves are foreshortened 2:1 like the ground.
//
// Shoreline field (built once in JS, or baked offline with tools/fx/gen_water_field.mjs): the land / water
// mask on a grid of 8 x 4 world px (8 x 8 G px) cells (2 x coarser for big regions) -> signed distance
// (8SSEDT) + wave distance (to the coasts that make waves) + sea-bed depth + per-cell shore parameters ->
// two RGBA8 textures:  A = distance, wave distance, run-up, depth;  B = coast direction (x, y), edge kind, snow.
//
// JS mirrors the wave maths (heightAt / slopeAt) on the SAME 8-bit field and the SAME packed ripple rings
// the shader draws, so boats, buoys and swimmers bob in sync with the pixels. No per-frame allocations.
//
// Canvas renderer (or a failed shader compile): the old look — a scrolling `water_sea` tileSprite.

import { DEPTH } from './DepthSort.js';

const TAU = Math.PI * 2;
export const PPU = 64;                       // G px per metre
export const HEIGHT_PX_PER_M = 55.43;        // screen px per metre of height (64 * cos 30°)
export const WATER_PX = 30;                  // sea surface below land (screen px), like assets/harbor
const SLOPE_K = PPU / HEIGHT_PX_PER_M;       // height px per G px -> dimensionless slope
const DM = 768;                              // distance range stored in the field (G px)
const CELL_X = 8, CELL_Y = 4;                // fine field cell in world px (= 8 x 8 G px)
const CELL_G = 8;
const FIELD_FINE_MAX = 300000;               // more fine cells than this: the field is built 2x coarser (opts.fieldScale)
const FIELD_VERSION = 3;                     // bump when the field maths change (baked fields are re-checked)
const RUNUP_MAX = 150;                       // swash run-up (G px) for runup 1 (sand)
const SWASH_UP = 0.3;                        // part of a wave cycle the uprush takes
const DRY_T = 2.6;                           // seconds for fresh wet sand to fade
const RINGS_HIGH = 12, RINGS_LOW = 6;        // rings the shader draws (the strongest live ones near the view)
const RING_POOL = 64;                        // rings remembered on the CPU
const RING_LIFE = 4;                         // s
const CONTACTS_HIGH = 16, CONTACTS_LOW = 8, CONTACT_POOL = 48;
const DEPTH_ENC = 3.0;                       // field A.a = 1 - exp(-depth_m / 3)
const DEEP_M = 12;                           // sea-bed depth with no coast that shapes it
const HARD_W = 48;                           // hard structures change the sea bed within this many G px
const OPEN_SKIRT = 3000;                     // open-sea skirt past region edges in open water (world px)
const G_ACC = 9.81 * PPU;                    // G px / s^2

// ------------------------------------------------------------------------------------------------ data
/**
 * per shore material (stored in the field; the shader derives the rest):
 *   runup  swash run-up of SOFT shores (sand 1, snow bank 0.42) -> surf zone width, swash lace, wet band
 *   edge   kind of HARD edge: 0 calm (none), 0.5 quay wall (deep, lapping line, contact shadow),
 *          1 rock / breakwater (slap collar + spray events)
 *   wave   does the coast make the shore-parallel swell? (beaches / snow banks / rocky coasts yes; thin
 *          structures like breakwaters, quays, piers no — the waves pass them and slap against them)
 *   snow   snow-bank look (colder foam, slush riding the swash)
 *   bed    sea-bed slope parameter of a wave-making coast (1 gentle sand .. 0.25 rock); -1 = the structure
 *          does not shape the sea bed (quays / breakwaters only change it within HARD_W of their wall)
 */
export const SHORE_TYPES = {
  sand: { runup: 1.0, edge: 0, wave: true, snow: 0, bed: 1.0 },
  snowbank: { runup: 0.42, edge: 0, wave: true, snow: 1, bed: 0.75 },
  rock: { runup: 0.0, edge: 1, wave: true, snow: 0, bed: 0.25 },
  breakwater: { runup: 0.0, edge: 1, wave: false, snow: 0, bed: -1 },
  quay: { runup: 0.0, edge: 0.5, wave: false, snow: 0, bed: -1 },
  none: { runup: 0.0, edge: 0, wave: false, snow: 0, bed: -1 },
};

const TYPE_NAMES = Object.keys(SHORE_TYPES);

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
  normalBoost: 3.3,          // the swell is drawn a little steeper than it bobs (readable bands, no plateaus)
  ripple: 1.0,               // ripple normal strength
};

// alongshore variation (identical in GLSL): phase offset nu(g) and amplitude av(g, t)
const NU = [0.9, 0.0029, 0.0017, 0.6, 0.0061, -0.0037, 1.7];
const AV = [0.82, 0.18, 0.0021, 0.0033, 0.21, 0.12, 0.0047, -0.0026, -0.13, 2.1];
// whitecap streaks: rates (rad / s) of the two streak patterns (lifetime ~ pi / 1.9 s)
const WC_RATE = [1.9, -1.3];

/* PALETTES (keep identical to tools/fx/gen_water.py PALETTES; check_water.py compares them) */
export const DEFAULT_PALETTES = {
  winter_sea: {
    row: 0, depthScale: 2.2,
    lut: [[0.00, '#A2C2CE', 0.30], [0.10, '#7FAFC0', 0.60], [0.24, '#4D8DB0', 0.86],
      [0.45, '#2D6CA6', 0.97], [0.70, '#21589A', 1.0], [1.00, '#1A4884', 1.0]],
    skyHi: '#3F6E9E', skyLo: '#9DB6CC', sun: '#FFF6E6', sss: '#3E97B4',
    foam: '#FFFFFF', foamShade: '#B3C7D6', bottom: '#8A9DAA', caustic: 0.35,
    wet: '#7A8DA4', film: '#C4D6DF', slush: 1.0,
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
  winter_sea: { refl: 1.0, glint: 1.0, whitecap: 0.75, swell: 1.0, surf: 1.0, ripple: 0.6 },
  harbor: { refl: 1.0, glint: 0.9, whitecap: 0.0, swell: 0.45, surf: 0.5, ripple: 0.5 },
  tropical: { refl: 0.9, glint: 1.15, whitecap: 0.3, swell: 0.8, surf: 1.0, ripple: 0.55 },
  pool: { refl: 0.9, glint: 1.0, whitecap: 0.0, swell: 0.0, surf: 0.0, ripple: 0.35 },
};

const TEX = { a: 'water_waves_a', b: 'water_waves_b', foam: 'water_foam', lut: 'water_lut' };
const TILE_A = 512, TILE_B = 192, TILE_FOAM = 640, TILE_LACE = 180;

/**
 * Effect sheets of assets/water are loaded on demand: systems say what they need (want) and the Game's lazy
 * gate lets only those through (`Assets.gate` -> `WaterSheets.allowed(key)`), so the village does not decode
 * beach-only sheets (docs/build_reports/water.md §6.1).
 */
export const WaterSheets = {
  wanted: new Set(),
  want(key) { if (key) this.wanted.add(key); return key; },
  allowed(key) { return this.wanted.has(key); },
  /** V-wake sheet for a heading (S, SE, E, NE, N; SW / W / NW = flipX of SE / E / NE): asks for it -> { key, flip } */
  wake(dir) {
    const m = { S: ['fx_wake_v2_s', false], SE: ['fx_wake_v2', false], E: ['fx_wake_v2_e', false], NE: ['fx_wake_v2_ne', false],
      N: ['fx_wake_v2_n', false], SW: ['fx_wake_v2', true], W: ['fx_wake_v2_e', true], NW: ['fx_wake_v2_ne', true] }[dir] || ['fx_wake_v2', false];
    this.want(m[0]);
    return { key: m[0], flip: m[1] };
  },
};

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
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** field A.r / A.g: signed distance, sqrt-encoded over +-DM (same formula in GLSL decodeD) */
const decodeD = (v) => { const s = v * 2 - 1; return Math.sign(s) * s * s * DM; };
const encodeD = (v) => Math.round((0.5 + 0.5 * Math.sign(v) * Math.sqrt(Math.min(DM, Math.abs(v)) / DM)) * 255);
/** sea-bed depth (m) at dm metres from a coast with bed slope parameter s (1 sand .. 0 steep) */
const bedProfile = (dm, s) => 2.6 * (1 - s) * (1 - s) * (1 - Math.exp(-dm * 2.5)) + dm * (0.9 + (0.12 - 0.9) * s);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------------------------------------------ GLSL
const VERT = `
precision highp float;
attribute vec2 aPos;
uniform mat3 uView;
uniform mat4 uProj;
uniform vec4 uOrg;      // region origin x, y (world px), 1 / field width, 1 / field height (world px)
uniform vec2 uCam;      // camera centre (world px, whole px): G coordinates are relative to it
uniform vec4 uRotA;     // cos, sin, 1 / tile, -   (vertex stage only: the fragment stage has uRotAf)
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

// NOTE: no uniform is shared between the vertex and the fragment stage (GLSL ES 1.0 requires shared
// uniforms to have the same precision, and the fragment stage may be mediump-only).
const FRAG_COMMON = `
#ifdef FORCE_MEDIUMP
precision mediump float;
#else
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#endif
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
uniform sampler2D uField;
uniform vec4 uShore;    // k (rad / G px), shore phase (wrapped), amp (px), reach (G px)
uniform vec4 uShoal;    // shoalA, shoalD, swell normal boost, ripple strength
uniform vec4 uAlong;    // alongshore phase constants (camera relative)
uniform vec4 uMisc;     // zoom (canvas px per world px), glint, reflection, fish refraction
uniform vec4 uPal;      // lut v, depthScale, caustic, whitecap
uniform vec4 uLight;    // glint x, reflection x, crest glow x, darkness (night)
uniform vec4 uSwDir;    // swell direction in G (unit, toward the shore), 1 / lace tile, cycle period (s)
uniform vec3 uSky0;
uniform vec3 uSky1;
uniform vec3 uSun;
uniform vec3 uFoamC;
uniform vec3 uFoamS;
const vec3 LGT = ${v3(LIGHT_DIR)};
const vec3 VIEW = ${v3(VIEW_DIR)};
const vec3 HALF = ${v3(HALF_DIR)};
float decodeD(float r) { float s = r * 2.0 - 1.0; return sign(s) * s * s * ${DM.toFixed(1)}; }
float depthM(float a) { return -${DEPTH_ENC.toFixed(1)} * log(max(1.0 - a, 0.002)); }
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
#ifndef LOW
uniform sampler2D uField2;
uniform sampler2D uWB;
uniform sampler2D uFoam;
uniform sampler2D uLut;
#endif
#ifdef FISH
uniform sampler2D uFish;
#endif
uniform vec4 uSw[4];        // swell: k.x, k.y (rad / G px), phase (camera relative, wrapped), amp (px)
uniform vec4 uRing[NRING];  // ring: G x, y (camera relative), age (s), strength
uniform vec4 uRingN;        // count, speed (G px / s), base width (G px), 1 / total swell amplitude
uniform vec4 uCon[NCON];    // contact: G x, y (camera relative), radius (G px), floor(shadow * 100) + foam
uniform vec4 uConN;         // count, -, -, -
uniform vec4 uRotAf;        // ripple layer rotations (cos, sin) for the slopes
uniform vec4 uRotBf;
uniform vec4 uWc;           // whitecap streak phases (camera relative, wrapped), travelling hard-shore phase, 1 / |k0|
uniform vec4 uWcA;          // whitecap streak wave vectors P1.xy, P2.xy (G)
uniform vec4 uFishK;        // alpha layer 1, alpha layer 2, -, -
uniform vec4 uBand1;        // fish layer 1 band: y0, y1 (region-local screen px), fade (px), -
uniform vec4 uBand2;
uniform vec3 uSss;
uniform vec3 uBed;
#ifdef LOW
uniform vec3 uLow0;         // LOW: shallow colour
uniform vec3 uLow1;         // LOW: mid colour
uniform vec3 uLow2;         // LOW: deep colour
uniform vec4 uLowA;         // LOW: lut u of the mid stop, opacity at the shore, -, -
#endif
void main() {
  vec4 fld = texture2D(uField, vA.zw);
  float d = decodeD(fld.r);
  float dw = max(decodeD(fld.g), 0.0);
  float ru = fld.b;
  float depth = depthM(fld.a);
  float soft = smoothstep(0.02, 0.10, ru);
  float hard = 1.0 - soft;
#ifdef LOW
  vec2 cdir = uSwDir.xy;
  float ek = hard;                                   // LOW: every hard edge slaps (no quay line)
#else
  vec4 fl2 = texture2D(uField2, vA.zw);
  vec2 cdir = fl2.rg * 2.0 - 1.0;                    // toward the coast (crests run across it)
  float ek = fl2.b;
#endif
  float sp = mix(ek < 0.5 ? mix(0.0, 0.22, ek * 2.0) : mix(0.22, 1.0, ek * 2.0 - 1.0), 0.3 - 0.18 * ru, soft);
  float quay = (1.0 - abs(ek * 2.0 - 1.0)) * hard;
  vec2 g = vA.xy;
  float dpos = max(d, 0.0);
  // ---- long swell (directional); wave 0 also carries the whitecap streaks
  vec4 w0 = uSw[0];
  float ph0 = dot(w0.xy, g) + w0.z;
  float s0 = sin(ph0);
  float h = w0.w * s0;
  vec2 dh = w0.xy * (w0.w * cos(ph0));
  for (int i = 1; i < 4; i++) {
    vec4 w = uSw[i];
    float ph = dot(w.xy, g) + w.z;
    h += w.w * sin(ph);
    dh += w.xy * (w.w * cos(ph));
  }
  float wDir = mix(0.45, 1.0, smoothstep(0.0, uShore.w, dpos));
  h *= wDir;
  dh *= wDir;
  // ---- shore-parallel swell: crests follow the coast and bunch up while shoaling (and light the surface)
  float nu = alongNu(g);
  float av = alongAv(g);
  float ex = exp(-dw / uShoal.y);
  float psi = dw + uShoal.x * uShoal.y * (1.0 - ex);
  float phS = uShore.x * psi + uShore.y + nu;
  float wS = 1.0 - smoothstep(uShore.w * 0.45, uShore.w, dw);
  float aS = uShore.z * av * wS;
  float hS = aS * sin(phS);
  h += hS;
  dh -= cdir * (aS * cos(phS) * uShore.x * (1.0 + uShoal.x * ex));
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
#ifdef DEBUG_H
  float hd = clamp((h + 16.0) / 32.0, 0.0, 1.0) * 255.0;
  gl_FragColor = vec4(floor(hd) / 255.0, fract(hd), 0.0, 1.0);
  return;
#endif
  // ---- ripples (the fine layer fades out when zoomed far out: no salt noise)
  float zm = uMisc.x;
  float zf = smoothstep(0.45, 1.05, zm);
  vec3 ta = texture2D(uWA, vB.xy).rgb;
  vec2 sa = texSlope(ta.xy * 2.0 - 1.0);
  sa = vec2(uRotAf.x * sa.x + uRotAf.y * sa.y, -uRotAf.y * sa.x + uRotAf.x * sa.y);
  float rip = uShoal.w * (0.7 + 0.5 * av) * (0.55 + 0.45 * smoothstep(0.0, 140.0, dpos));
  float dep = max(depth - h * 0.01, 0.0);
  float u = 1.0 - exp(-dep / uPal.y);
#ifdef LOW
  sl += sa * rip * (0.8 + 0.25 * zf);
  vec3 N = normalize(vec3(-sl, 1.0));
  vec3 wcol = mix(uLow0, uLow1, smoothstep(0.0, uLowA.x, u));
  wcol = mix(wcol, uLow2, smoothstep(uLowA.x, 1.0, u));
  float op = mix(uLowA.y, 1.0, smoothstep(0.0, uLowA.x, u));
  vec3 col = mix(uBed * (0.9 + 0.25 * ta.b * (1.0 - u)), wcol, op);
  float fishA = 0.0;
  vec3 fo = vec3(ta.b, ta.b, 0.5);
#else
  vec3 tb = texture2D(uWB, vB.zw).rgb;
  vec2 sb = texSlope(tb.xy * 2.0 - 1.0);
  sb = vec2(uRotBf.x * sb.x + uRotBf.y * sb.y, -uRotBf.y * sb.x + uRotBf.x * sb.y);
  sl += (sa * 0.9 + sb * 0.38 * (0.3 + 0.7 * zf)) * rip;
  vec3 N = normalize(vec3(-sl, 1.0));
  vec3 fo = texture2D(uFoam, vC.xy).rgb;
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
  // ---- light: swell faces, moving crest-lit / trough-dark gradient, crest glow
  float ndl = dot(N, LGT);
  col *= 0.80 + 0.34 * ndl;
  float hn = clamp(h * uRingN.w, -1.0, 1.0);
  col *= 1.0 + 0.10 * hn;
  float crestLine = pow(max(sin(phS), 0.0), 8.0) * wS * smoothstep(20.0, 90.0, dw) * smoothstep(10.0, 60.0, dpos) * uShore.z * 0.45;
  col += uSss * uLight.z * (clamp(hS * 0.22 + h * 0.06, 0.0, 1.0) * 0.12 + crestLine * 0.16 + max(hn, 0.0) * 0.04) * (0.35 + 0.65 * u);
#if defined(FISH) && !defined(LOW)
  // fish swim under the surface: refracted, tinted by the water above them, below reflections / glints / foam
  col = mix(col, fishC, fa1);
#endif
  // ---- sky reflection (soft shoulder: gradients, never a flat plateau)
  vec3 R = reflect(vec3(0.0, -0.8660254, -0.5), N);
  float ndv = max(dot(N, VIEW), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 sky = mix(uSky1, uSky0, smoothstep(0.05, 0.85, R.z));
  float rf = fres * uMisc.z * uLight.y;
  rf = 0.5 * (1.0 - exp(-rf * 2.0));
  col = mix(col, sky, rf * (1.0 - 0.7 * fishA));
  // ---- sun glints: small, soft, tinted sparkles in drifting patches (broader + fainter when zoomed out)
  float ndh = max(dot(N, HALF), 0.0);
  float shin = mix(140.0, 480.0, smoothstep(0.5, 1.4, zm));
  float gate = 0.35 + 0.65 * smoothstep(0.3, 0.72, fo.b);
  float gl = uMisc.y * uLight.x * gate * (pow(ndh, shin) * 0.75 + pow(ndh, shin * 4.0) * 0.7) * mix(0.5, 1.0, zf);
  gl = 0.8 * (1.0 - exp(-gl * 1.7));
  col += mix(uSun, sky, 0.3) * gl * (1.0 - 0.6 * fishA) + uSun * (pow(ndh, 24.0) * 0.035 * uLight.x);
  // ---- hard shores: slap collar bursting when a crest arrives (shore swell where it reaches, else the
  //      swell travelling along the wall), quay: lapping line + contact shadow along the wall
  float cycS = fract((phS - 1.5708) * 0.15915494);
  float cycH = fract((uWc.z - uShore.x * dot(g, uSwDir.xy) + uShore.y + nu - 1.5708) * 0.15915494);
  float bS = exp(-cycS * 4.5) + 0.35 * exp(-(1.0 - cycS) * 18.0);
  float bH = exp(-cycH * 4.5) + 0.35 * exp(-(1.0 - cycH) * 18.0);
  float burst = mix(bH, bS, wS);
  float collar = 5.0 + 36.0 * burst * av * sp * max(uShore.z, 0.4) / 2.2;
  float pot = (1.0 - smoothstep(0.0, collar, dpos)) * hard * sp * (0.55 + 0.5 * burst) * (0.55 + 0.7 * fo.b);
  float lapW = 6.0 + 4.0 * burst;
  float lapLine = quay * (1.0 - smoothstep(lapW * 0.45, lapW, dpos)) * (0.6 + 0.4 * burst);
  col *= 1.0 - quay * 0.30 * (1.0 - smoothstep(0.0, 36.0, dpos));
  col += quay * 0.05 * cos(uShore.x * dpos * 2.0 - uShore.y) * exp(-dpos / 70.0);
  // ---- contacts: hulls, posts, floaters (foam collar breathing with the swell + a soft shadow)
  float shade = 0.0;
  for (int i = 0; i < NCON; i++) {
    if (float(i) >= uConN.x) break;
    vec4 c = uCon[i];
    float cd = length(g - c.xy) - c.z;
    shade = max(shade, floor(c.w) * 0.01 * (1.0 - smoothstep(-c.z * 0.5, 24.0, cd)));
    float cw = 7.0 + 4.0 * clamp(h * 0.35, -1.0, 1.0);
    pot = max(pot, fract(c.w) * exp(-max(cd, 0.0) / cw) * smoothstep(-6.0, 0.0, cd));
  }
  col *= 1.0 - shade;
  pot = max(pot, ringFoam);
  // ---- whitecaps: short soft streaks riding the swell crests offshore, born and fading (~1.5 s);
  //      the shore swell's crest line rolling in gets the same soft white horses
  float sn = 0.55 * sin(dot(g, uWcA.xy) + uWc.x) + 0.45 * sin(dot(g, uWcA.zw) + uWc.y);
  float life = smoothstep(0.38, 0.92, sn);
  float wCore = smoothstep(0.962, 0.999, s0);
  float wc = (wCore * 0.95 + smoothstep(0.75, 0.99, s0) * 0.22) * life * smoothstep(80.0, 260.0, dpos) * (0.6 + 0.4 * av) * wDir;
  wc = max(wc, crestLine * 1.5 * smoothstep(0.2, 0.85, sn) * (0.6 + 0.4 * av));
  float wcA = clamp(wc * uPal.w * (0.72 + 0.3 * fo.g + 0.12 * fo.r), 0.0, 0.85);
  col = mix(col, mix(uFoamS, uFoamC, 0.45 + 0.55 * wCore), wcA);
  // ---- lace foam (hard shores, rings, contacts)
  float aa = 0.06 + 0.10 / clamp(zm, 0.4, 3.0);
  float foam = smoothstep(1.0 - pot - aa, 1.0 - pot + aa, fo.r);
  float fshade = smoothstep(1.0 - pot, 1.0 - pot + 0.3, fo.r);
  float rim = smoothstep(1.0 - pot - 0.16, 1.0 - pot, fo.r) * (1.0 - foam);
  col *= 1.0 - rim * 0.18 * step(0.001, pot);
  col = mix(col, mix(uFoamS, uFoamC, fshade), clamp(foam * 0.96 + lapLine * 0.8, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---- shore: soft-shore surf, swash, wet sand, slush (premultiplied alpha, over the land) ---------------
const FRAG_SHORE = `
uniform sampler2D uFoam;
#ifndef LOW
uniform sampler2D uField2;
uniform sampler2D uWB;
#endif
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
#ifdef LOW
  vec2 cdir = uSwDir.xy;
  float snow = 1.0 - smoothstep(0.55, 0.8, ru);
#else
  vec4 fl2 = texture2D(uField2, vA.zw);
  vec2 cdir = fl2.rg * 2.0 - 1.0;
  float cl = length(cdir);
  cdir = cl > 0.2 ? cdir / cl : uSwDir.xy;            // the LOCAL shore normal (up the beach)
  float snow = fl2.a;
#endif
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
  vec2 uvl = (g - cdir * (e * 0.9)) * uSwDir.z + uLaceOff.xy;
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
  // the white roll at the waterline as each crest arrives (a curl of slushy foam on snow banks)
  float roll = (1.0 - smoothstep(0.0, 8.0 + 10.0 * ru, abs(d - 3.0 + e * 0.35))) * exp(-cyc * 5.0) * (0.75 + 0.25 * snow);
  potW = max(potW, roll);
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
  // ---- slush (snow banks): ice bits in a band that rides up with the swash and slides back
  float slushBand = uPal2.x * snow * (1.0 - smoothstep(10.0, 34.0, abs(d - 6.0 + e * 0.7)));
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
  float gl = pow(max(dot(nf, HALF), 0.0), 160.0) * uMisc.y * uLight.x;
  vec3 filmC = uFilm + uSun * gl;
#endif
  float filmA = cov * (0.20 + 0.40 * sqrt(thick)) * soft;
  // compose back to front, premultiplied
  vec4 o = vec4(uWet, 1.0) * (wet * 0.45 * soft);
  o.rgb += uSky1 * (gloss * 0.22 * soft * uLight.y);
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
  'uField', 'uField2', 'uShore', 'uShoal', 'uAlong', 'uMisc', 'uPal', 'uLight', 'uSwDir', 'uSky0', 'uSky1', 'uSun', 'uFoamC', 'uFoamS',
  'uWA', 'uWB', 'uFoam', 'uLut', 'uFish', 'uSw', 'uRing', 'uRingN', 'uCon', 'uConN', 'uRotAf', 'uRotBf', 'uWc', 'uWcA',
  'uFishK', 'uBand1', 'uBand2', 'uSss', 'uBed', 'uLow0', 'uLow1', 'uLow2', 'uLowA', 'uLaceOff', 'uWet', 'uFilm', 'uPal2'];

/** the lines of a shader source left after its #ifdef / #if defined() blocks (for the static cost counts) */
function activeLines(src) {
  const defs = new Map();
  const stack = [];
  let on = true;
  const out = [];
  const evalIf = (expr) => expr.split('&&').every((t) => {
    const m = t.trim().match(/^(!?)\s*defined\((\w+)\)$/);
    return m ? (m[1] ? !defs.has(m[2]) : defs.has(m[2])) : true;
  });
  for (const line of src.split('\n')) {
    const l = line.trim();
    let m;
    if ((m = l.match(/^#define\s+(\w+)(?:\s+(\S+))?/))) { if (on) defs.set(m[1], m[2]); continue; }
    if ((m = l.match(/^#ifdef\s+(\w+)/))) { stack.push(on); on = on && defs.has(m[1]); continue; }
    if ((m = l.match(/^#ifndef\s+(\w+)/))) { stack.push(on); on = on && !defs.has(m[1]); continue; }
    if ((m = l.match(/^#if\s+(.*)$/))) { stack.push(on); on = on && evalIf(m[1]); continue; }
    if (l.startsWith('#else')) { on = stack[stack.length - 1] && !on; continue; }
    if (l.startsWith('#endif')) { on = stack.pop(); continue; }
    if (on) out.push(l);
  }
  return { lines: out, defs };
}

/** texture fetches per pixel of a variant: texture2D calls left after the #ifdef blocks */
function countFetches(src) {
  return activeLines(src).lines.reduce((n, l) => n + (l.match(/texture2D\(/g) || []).length, 0);
}

/** uniform vectors the fragment stage of a variant declares (vec4 / vec3 / vec2 / float = 1 each, arrays x N) */
function countUniformVectors(src) {
  const { lines, defs } = activeLines(src);
  let n = 0;
  for (const l of lines) {
    const m = l.match(/^uniform\s+(?:(?:lowp|mediump|highp)\s+)?(vec4|vec3|vec2|float|mat3|mat4)\s+\w+(?:\[(\w+)\])?\s*;/);
    if (!m) continue;
    const per = m[1] === 'mat4' ? 4 : m[1] === 'mat3' ? 3 : 1;
    const len = m[2] ? (+m[2] || +(defs.get(m[2]) || 1)) : 1;
    n += per * len;
  }
  return n;
}

const VARIANTS = {
  body_high: `#define NRING ${RINGS_HIGH}\n#define NCON ${CONTACTS_HIGH}\n#define FISH\n`,
  body_high_nofish: `#define NRING ${RINGS_HIGH}\n#define NCON ${CONTACTS_HIGH}\n`,
  body_low: `#define NRING ${RINGS_LOW}\n#define NCON ${CONTACTS_LOW}\n#define LOW\n`,
  shore_high: '',
  shore_low: '#define LOW\n',
};

/** fragment source of a variant ('body_high', ..., + '|dbg' debug height, + '|mp' forced mediump) */
function fragSource(variant) {
  const [base, ...flags] = variant.split('|');
  const defs = VARIANTS[base] + (flags.indexOf('dbg') >= 0 ? '#define DEBUG_H\n' : '') + (flags.indexOf('mp') >= 0 ? '#define FORCE_MEDIUMP\n' : '');
  return defs + FRAG_COMMON + (base.indexOf('body') === 0 ? FRAG_BODY : FRAG_SHORE);
}

function program(renderer, variant) {
  const s = shared(renderer);
  if (s.programs[variant]) return s.programs[variant];
  const gl = renderer.gl;
  const fsrc = fragSource(variant);
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
  const prog = { p, u, aPos: gl.getAttribLocation(p, 'aPos'), variant, fetches: countFetches(fsrc), fragUniformVectors: countUniformVectors(fsrc) };
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

/** RGBA bytes of a loaded image / canvas / Phaser texture key (baked fields) */
function imageBytes(scene, src) {
  const img = typeof src === 'string' ? (scene && scene.textures.exists(src) ? scene.textures.get(src).getSourceImage() : null) : src;
  if (!img || !img.width || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, px: new Uint8Array(ctx.getImageData(0, 0, img.width, img.height).data.buffer) };
}

// ------------------------------------------------------------------------------------------------ masks
function inPoly(p, x, y) {
  const bb = p.__bb || polyBox(p);
  if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return false;        // (same answer, much cheaper)
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** cached bounding box of a flat polygon [x0, y0, x1, y1, ...] */
function polyBox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  const bb = [x0, y0, x1, y1];
  try { Object.defineProperty(p, '__bb', { value: bb, enumerable: false }); } catch (e) { /* frozen array: recompute */ }
  return bb;
}

/**
 * normalise opts.mask to fn(x, y) -> true where the WATER-LEVEL point (x, y) shows water.
 * ONE convention: the mask describes the land at z 0 (footprints); every structure whose wall face shows
 * (quay, breakwater, pier deck on a wall) is seen `waterPx` lower at the water plane, so it is tested at
 * (x, y - waterPx). The region's waterPx is the default for every land polygon; give a polygon
 * {poly, waterPx: 0} only for land drawn down to the waterline itself (a sand / snow polygon whose edge IS the
 * waterline).
 */
function maskFn(mask, wp) {
  if (typeof mask === 'function') return (x, y) => mask(x, y - wp);
  if (mask && typeof mask.shoreY === 'function') {
    const f = mask.shoreY;
    const fn = (x, y) => y - wp < f(x);
    fn.curve = f; fn.wp = wp;                    // the field build evaluates the curve once per sample column
    return fn;
  }
  if (mask && (mask.water || mask.land)) {
    const norm = (p) => (Array.isArray(p) ? { poly: p, waterPx: wp } : { poly: p.poly, waterPx: p.waterPx !== undefined ? p.waterPx : wp });
    const water = mask.water ? mask.water.map(norm) : null, land = (mask.land || []).map(norm);
    const fn = (x, y) => {
      if (water) { let w = false; for (const p of water) if (inPoly(p.poly, x, y)) { w = true; break; } if (!w) return false; }
      for (const p of land) if (inPoly(p.poly, x, y - p.waterPx)) return false;
      return true;
    };
    fn.polys = { water, land };
    return fn;
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

// 32-bit FNV-1a over numbers (rounded to 1/8) -> hex: signature of a field's inputs (baked fields)
function fnv(nums) {
  let h = 0x811c9dc5;
  for (let i = 0; i < nums.length; i++) {
    let v = Math.round(nums[i] * 8) | 0;
    for (let k = 0; k < 4; k++) { h ^= v & 255; h = Math.imul(h, 0x01000193) >>> 0; v >>= 8; }
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

// 8SSEDT: nearest seed offset (ox, oy in cells) for every cell (seed cells: flag 1). Two raster passes;
// the neighbour test is written out inline (no closures: ~5x faster in JS than the textbook version).
const EDT_INF = 30000;
function edt(nx, ny, seed, ox, oy) {
  const INF = EDT_INF;
  for (let i = 0; i < nx * ny; i++) { if (seed[i]) { ox[i] = 0; oy[i] = 0; } else { ox[i] = INF; oy[i] = INF; } }
  let j, cx, cy, ci;
  for (let y = 0; y < ny; y++) {
    const row = y * nx, up = y > 0;
    for (let x = 0; x < nx; x++) {
      const i = row + x;
      ci = ox[i] * ox[i] + oy[i] * oy[i];
      if (x > 0) { j = i - 1; if (ox[j] < INF) { cx = ox[j] - 1; cy = oy[j]; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; ci = cx * cx + cy * cy; } } }
      if (up) {
        j = i - nx; if (ox[j] < INF) { cx = ox[j]; cy = oy[j] - 1; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; ci = cx * cx + cy * cy; } }
        if (x > 0) { j = i - nx - 1; if (ox[j] < INF) { cx = ox[j] - 1; cy = oy[j] - 1; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; ci = cx * cx + cy * cy; } } }
        if (x < nx - 1) { j = i - nx + 1; if (ox[j] < INF) { cx = ox[j] + 1; cy = oy[j] - 1; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; } } }
      }
    }
    for (let x = nx - 2; x >= 0; x--) {
      const i = row + x;
      j = i + 1;
      if (ox[j] < INF) { cx = ox[j] + 1; cy = oy[j]; if (cx * cx + cy * cy < ox[i] * ox[i] + oy[i] * oy[i]) { ox[i] = cx; oy[i] = cy; } }
    }
  }
  for (let y = ny - 1; y >= 0; y--) {
    const row = y * nx, dn = y < ny - 1;
    for (let x = nx - 1; x >= 0; x--) {
      const i = row + x;
      ci = ox[i] * ox[i] + oy[i] * oy[i];
      if (x < nx - 1) { j = i + 1; if (ox[j] < INF) { cx = ox[j] + 1; cy = oy[j]; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; ci = cx * cx + cy * cy; } } }
      if (dn) {
        j = i + nx; if (ox[j] < INF) { cx = ox[j]; cy = oy[j] + 1; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; ci = cx * cx + cy * cy; } }
        if (x > 0) { j = i + nx - 1; if (ox[j] < INF) { cx = ox[j] - 1; cy = oy[j] + 1; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; ci = cx * cx + cy * cy; } } }
        if (x < nx - 1) { j = i + nx + 1; if (ox[j] < INF) { cx = ox[j] + 1; cy = oy[j] + 1; if (cx * cx + cy * cy < ci) { ox[i] = cx; oy[i] = cy; } } }
      }
    }
    for (let x = 1; x < nx; x++) {
      const i = row + x;
      j = i - 1;
      if (ox[j] < INF) { cx = ox[j] - 1; cy = oy[j]; if (cx * cx + cy * cy < ox[i] * ox[i] + oy[i] * oy[i]) { ox[i] = cx; oy[i] = cy; } }
    }
  }
}

/** separable Gaussian (clamped edges), in place; tmp = scratch of the same size */
function blur(src, nx, ny, sigma, tmp) {
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const xa = Math.min(r, nx), xb = Math.max(xa, nx - r);
  for (let y = 0; y < ny; y++) {
    const row = y * nx;
    for (let x = 0; x < xa; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += src[row + Math.min(nx - 1, Math.max(0, x + i))] * k[i + r];
      tmp[row + x] = a;
    }
    for (let x = xa; x < xb; x++) {
      let a = 0;
      const o = row + x - r;
      for (let i = 0; i <= 2 * r; i++) a += src[o + i] * k[i];
      tmp[row + x] = a;
    }
    for (let x = xb; x < nx; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += src[row + Math.min(nx - 1, Math.max(0, x + i))] * k[i + r];
      tmp[row + x] = a;
    }
  }
  const acc = blur.acc && blur.acc.length >= nx ? blur.acc : (blur.acc = new Float64Array(nx));
  for (let y = 0; y < ny; y++) {
    acc.fill(0, 0, nx);
    for (let i = -r; i <= r; i++) {
      const o = Math.min(ny - 1, Math.max(0, y + i)) * nx, kk = k[i + r];
      for (let x = 0; x < nx; x++) acc[x] += tmp[o + x] * kk;
    }
    const row = y * nx;
    for (let x = 0; x < nx; x++) src[row + x] = acc[x];
  }
}

// ------------------------------------------------------------------------------------------------ Water
export class Water {
  /**
   * @param {Phaser.Scene} scene  (null: headless — field only; used by the bake tool and node tests)
   * @param {object} opts
   *   region     {x, y, w, h}  world px rectangle the water may cover (the field / meshes live inside it)
   *   mask       fn(x, y) -> true where (land level) is water | {shoreY: fn(x)} (water above the curve) |
   *              {water: [poly], land: [poly | {poly, waterPx}]} (flat [x0, y0, x1, y1, ...] world px polygons)
   *   waterPx    sea surface below land (screen px): 0 for beaches / snow banks drawn to the waterline,
   *              30 (WATER_PX) where quay / breakwater walls show their face (the mask is the land at z 0)
   *   shoreTypes 'sand' | fn(x, y) -> type | [{type, rect | poly | x: [x0, x1]}]; types: SHORE_TYPES
   *   defaultShore  type for unmatched shore cells (default 'snowbank')
   *   palette    'winter_sea' | 'harbor' | 'tropical' | 'pool' (or a palette object, see DEFAULT_PALETTES)
   *   quality    'high' | 'low'
   *   swellDir   [gx, gy] direction the swell travels in G space (default: toward the shore, from the field)
   *   swell, surf, ripple  multipliers (default from the palette look)
   *   fish       [{y0, y1, alpha, scale, speed, offset: [x, y], wobble}] (world px) up to 2 school bands drawn under
   *              the surface (high quality); key opts.fishKey (default 'fish_school')
   *   depth, shoreDepth   draw depths (default DEPTH.WATER, DEPTH.GROUND + 5)
   *   openSea    extend the body past region edges that lie in open water (default true): no background
   *              shows past the sea edge when the camera is free (zoomed out / overview)
   *   onCrash    fn(x, y, strength, behind) for spray on rock / breakwater (default: plays fx_wave_crash if loaded;
   *              sprays behind a structure draw at opts.crashDepthBehind, default DEPTH.GROUND + 10)
   *   baked      { image: key | image, meta } a field baked by tools/fx/gen_water_field.mjs
   *              (used when meta.sig matches this region / mask / types; otherwise the field is built here)
   *   async      build the field over several frames in update() (old sea meanwhile); default false
   *   manifest   assets/water manifest.json object (palettes); fallbackKey (default 'water_sea'); fieldScale 1 | 2
   *   precision  'mediump' forces the fragment stage to mediump (lab test of mediump-only GPUs)
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
    this.phaseOff = 0;                             // shore-swell phase shift (s), syncPhase()
    this.quality = opts.quality === 'low' ? 'low' : 'high';
    this.palettes = Object.assign({}, DEFAULT_PALETTES, (opts.manifest && opts.manifest.palettes) || {});
    this.alive = true;
    this.lost = false;
    this.ready = false;
    this.isShader = false;
    this.debug = null;
    this.stats = { fetchesBody: 0, fetchesShore: 0, fragUniformVectors: 0, textureBytes: 0, fieldCells: 0, bodyVerts: 0, shoreVerts: 0, buildMs: 0, fieldFrom: 'built' };
    // preallocated uniform / state storage
    this._view = new Float32Array(9); this._view[8] = 1;
    this._sw = new Float32Array(16);
    this._ring = new Float32Array(RINGS_HIGH * 4);   // packed for the shader (camera relative)
    this._rl = new Float32Array(RING_POOL * 4);      // CPU ring list: gx, gy (region G), t0, strength
    this._rlN = 0;
    this._rlUsed = new Uint8Array(RING_POOL);
    this._pk = new Float32Array(RINGS_HIGH * 4);     // packed set (region G): the shader AND heightAt use it
    this._pkN = 0; this._pkDirty = true;
    this._vr = new Float32Array(4); this._vrOk = false;   // last camera world view (packing / culling)
    this._con = new Float32Array(CONTACT_POOL * 4);  // world x, y, radius (G px), packed foam / shadow
    this._conOn = new Uint8Array(CONTACT_POOL);
    this._conPk = new Float32Array(CONTACTS_HIGH * 4);
    this._ringLow = this._ring.subarray(0, RINGS_LOW * 4);   // (views made once: no per-frame allocation)
    this._conLow = this._conPk.subarray(0, CONTACTS_LOW * 4);
    this._light = { glint: 1, refl: 1, sss: 1, dark: 0 };
    this._col = new Float32Array(3 * 14);
    this._sky = new Float32Array(6);
    this._lowA = new Float32Array(4);
    this._fishLayers = [];
    this._sprites = [];
    this._slopeOut = { x: 0, y: 0 };
    this._onCrashEvt = (x, y, st) => this._crashEvt(x, y, st);

    const t0 = now();
    const isWater = maskFn(opts.mask, this.waterPx);
    const typeAt = typeFn(opts.shoreTypes || opts.defaultShore || 'snowbank', opts.defaultShore || 'snowbank');
    this.sig = this._signature(isWater);
    const baked = opts.baked && this._useBaked(opts.baked);
    if (baked) {
      this.stats.fieldFrom = 'baked';
      this._finishField(baked);
      this._afterField(t0);
    } else if (opts.async && scene) {
      this._pending = this._buildField(isWater, typeAt);
      this._pendingT0 = t0;
      this.stats.fieldFrom = 'async';
      this._initFallback();
    } else {
      const it = this._buildField(isWater, typeAt);
      while (!it.next().done) { /* run every step now */ }
      this._afterField(t0);
    }
    if (scene && scene.events) {
      this._onShutdown = () => this.destroy();
      scene.events.once('shutdown', this._onShutdown);
      scene.events.once('destroy', this._onShutdown);
    }
  }

  /** everything after the field: waves, palette, meshes, crash points, GL (or the old sea) */
  _afterField(t0) {
    this._setupWaves(this.opts.swellDir);
    this.setPalette(this.opts.palette || 'winter_sea');
    if (this.opts.fish) this.setFish(this.opts.fish, this.opts.fishKey);
    this._buildMeshes();
    this._buildCrashPoints();
    this._F = null;                                // build-time arrays: dropped (the 8-bit field stays)
    this.stats.buildMs = Math.round((now() - t0) * 10) / 10;
    this.ready = true;
    const scene = this.scene;
    if (!scene) return;
    const renderer = scene.sys && scene.sys.renderer;
    if (renderer && renderer.gl && typeof Phaser !== 'undefined' && renderer.type === Phaser.WEBGL) {
      try { this._initGL(renderer); this.isShader = true; } catch (e) {
        if (typeof console !== 'undefined') console.warn('[Water] WebGL water unavailable, using the tileSprite sea:', e && e.message);
        this._freeGL();
      }
    }
    if (this.isShader && this.fallback) { this.fallback.destroy(); this.fallback = null; }
    if (!this.isShader && !this.fallback) this._initFallback();
    if (this.crashPoints.length) WaterSheets.want('fx_wave_crash');
  }

  // ------------------------------------------------------------------ field
  /** signature of everything the field depends on (a baked field is used only when it matches) */
  _signature(isWater) {
    const R = this.region, o = this.opts, nums = [FIELD_VERSION, R.x, R.y, R.w, R.h, this.waterPx, o.fieldScale || 0];
    const tj = JSON.stringify([typeof o.shoreTypes === 'function' ? 'fn' : o.shoreTypes || null, o.defaultShore || null, SHORE_TYPES]);
    for (let i = 0; i < tj.length; i++) nums.push(tj.charCodeAt(i) / 8);
    if (isWater.curve) {
      for (let x = R.x; x <= R.x + R.w; x += CELL_X / 2) nums.push(isWater.curve(x));
    } else if (isWater.polys) {
      for (const g of [isWater.polys.water || [], isWater.polys.land]) for (const p of g) { nums.push(p.waterPx); for (const v of p.poly) nums.push(v); }
    } else {
      for (let y = R.y; y <= R.y + R.h; y += 16) for (let x = R.x; x <= R.x + R.w; x += 32) nums.push(isWater(x, y) ? 1 : 0);
    }
    return fnv(nums);
  }

  /**
   * a baked field usable here? { image: key | image, meta } (or { rgb: bytes, meta }) -> field | null.
   * The image is opaque RGB, three bands stacked vertically (exact through a 2D canvas: no alpha):
   * rows [0, fny) = d, wave distance, run-up; [fny, 2 fny) = depth, edge kind, snow; [2 fny, 3 fny) = coast dir x, y
   */
  _useBaked(bk) {
    const m = bk.meta;
    if (!m || m.sig !== this.sig || m.version !== FIELD_VERSION) {
      if (typeof console !== 'undefined' && m) console.warn('[Water] baked field does not match this region (re-run tools/fx/gen_water_field.mjs); building it now');
      return null;
    }
    let src = bk.rgb, st = 3;                       // raw RGB bytes (node / tests) or the decoded image (RGBA)
    if (!src) {
      const im = imageBytes(this.scene, bk.image);
      if (!im || im.w !== m.fnx || im.h !== m.fny * 3) return null;
      src = im.px; st = 4;
    }
    const N = m.fnx * m.fny, pxA = new Uint8Array(N * 4), pxB = new Uint8Array(N * 4);
    if (src.length < N * 3 * st) return null;
    for (let i = 0; i < N; i++) {
      const o = i * 4, a = i * st, b = (N + i) * st, c = (2 * N + i) * st;
      pxA[o] = src[a]; pxA[o + 1] = src[a + 1]; pxA[o + 2] = src[a + 2]; pxA[o + 3] = src[b];
      pxB[o] = src[c]; pxB[o + 1] = src[c + 1]; pxB[o + 2] = src[b + 1]; pxB[o + 3] = src[b + 2];
    }
    return { fnx: m.fnx, fny: m.fny, s: m.s, pxA, pxB, autoDir: m.autoDir };
  }

  /**
   * the field build, as a generator (yields between the heavy passes: opts.async steps it from update()):
   * coverage (2 x 2 samples per fine cell, land at z 0 seen waterPx lower) -> field grid (fine, or 2 x
   * coarser for big regions) -> distances, wave distance, shore parameters, sea-bed depth, coast direction
   */
  * _buildField(isWater, typeAt) {
    const R = this.region;
    const nx = Math.max(2, Math.ceil(R.w / CELL_X)), ny = Math.max(2, Math.ceil(R.h / CELL_Y));
    const N = nx * ny;
    const cov = new Float32Array(N);
    if (isWater.curve) {
      const f = isWater.curve, wp = isWater.wp, fc = new Float64Array(nx * 2);
      for (let x = 0; x < nx; x++) for (let sx = 0; sx < 2; sx++) fc[x * 2 + sx] = f(R.x + (x + 0.25 + sx * 0.5) * CELL_X);
      for (let y = 0; y < ny; y++) {
        const wy0 = R.y + (y + 0.25) * CELL_Y - wp, wy1 = R.y + (y + 0.75) * CELL_Y - wp;
        for (let x = 0; x < nx; x++) {
          const f0 = fc[x * 2], f1 = fc[x * 2 + 1];
          cov[y * nx + x] = ((wy0 < f0) + (wy0 < f1) + (wy1 < f0) + (wy1 < f1)) / 4;
        }
      }
    } else if (isWater.polys) {
      // polygon masks: scanline rasterisation of the same 2 x 2 samples per cell (even-odd, like inPoly)
      const SX = nx * 2, SY = ny * 2, wet = new Uint8Array(SX * SY);
      const { water, land } = isWater.polys;
      const xs = [];
      const fill = (p, wp, val) => {
        const bb = p.__bb || polyBox(p);
        for (let j = 0; j < SY; j++) {
          const yy = R.y + (j + 0.5) * CELL_Y / 2 - wp;
          if (yy < bb[1] || yy > bb[3]) continue;
          xs.length = 0;
          for (let i = 0, k = p.length - 2; i < p.length; k = i, i += 2) {
            const xi = p[i], yi = p[i + 1], xk = p[k], yk = p[k + 1];
            if ((yi > yy) !== (yk > yy)) xs.push(((xk - xi) * (yy - yi)) / (yk - yi) + xi);
          }
          xs.sort((a, b) => a - b);
          for (let q = 0; q + 1 < xs.length; q += 2) {
            // samples with xs[q] <= x < xs[q + 1] are inside (an odd number of crossings to their right)
            const i0 = Math.max(0, Math.ceil((xs[q] - R.x) / (CELL_X / 2) - 0.5)), i1 = Math.min(SX - 1, Math.ceil((xs[q + 1] - R.x) / (CELL_X / 2) - 0.5) - 1);
            for (let i = i0; i <= i1; i++) wet[j * SX + i] = val;
          }
        }
      };
      if (water) for (const p of water) fill(p.poly, p.waterPx, 1); else wet.fill(1);
      for (const p of land) fill(p.poly, p.waterPx, 0);
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const a = (2 * y) * SX + 2 * x, b = a + SX;
        cov[y * nx + x] = (wet[a] + wet[a + 1] + wet[b] + wet[b + 1]) / 4;
      }
    } else {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          let c = 0;
          for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
            if (isWater(R.x + (x + 0.25 + sx * 0.5) * CELL_X, R.y + (y + 0.25 + sy * 0.5) * CELL_Y)) c++;
          }
          cov[y * nx + x] = c / 4;
        }
        if ((y & 63) === 63) yield;
      }
    }
    yield;
    const s = this.opts.fieldScale || (N > FIELD_FINE_MAX ? 2 : 1);
    let fnx = nx, fny = ny, fcov = cov;
    if (s !== 1) {
      fnx = Math.ceil(nx / s); fny = Math.ceil(ny / s);
      fcov = new Float32Array(fnx * fny);
      for (let Y = 0; Y < fny; Y++) for (let X = 0; X < fnx; X++) {
        let a = 0, n = 0;
        for (let yy = Y * s; yy < Math.min(ny, Y * s + s); yy++) for (let xx = X * s; xx < Math.min(nx, X * s + s); xx++) { a += cov[yy * nx + xx]; n++; }
        fcov[Y * fnx + X] = a / n;
      }
    }
    this.stats.fieldCells = N;
    yield* this._fieldCore(fcov, fnx, fny, s, typeAt);
  }

  * _fieldCore(cov, nx, ny, s, typeAt) {
    const R = this.region, N = nx * ny;
    const cX = CELL_X * s, cY = CELL_Y * s, cG = CELL_G * s;
    const water = new Uint8Array(N);
    for (let i = 0; i < N; i++) water[i] = cov[i] >= 0.5 ? 1 : 0;
    // shore cells: land cells next to water; their type decides the look of that stretch of coast
    const seedL = new Uint8Array(N), seedW = new Uint8Array(N), seedV = new Uint8Array(N);
    const tp = new Uint8Array(N);                 // shore cells: 1 + index in TYPE_NAMES
    const defT = SHORE_TYPES[this.opts.defaultShore] ? this.opts.defaultShore : 'snowbank';
    let anyWave = false, anyLand = false;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      if (water[i]) { seedW[i] = 1; continue; }
      anyLand = true;
      if (!((x > 0 && water[i - 1]) || (x < nx - 1 && water[i + 1]) || (y > 0 && water[i - nx]) || (y < ny - 1 && water[i + nx]))) continue;
      seedL[i] = 1;
      const wx = R.x + (x + 0.5) * cX, wy = R.y + (y + 0.5) * cY;
      let ty = typeAt(wx, wy);
      if ((!ty || ty === defT) && this.waterPx) ty = typeAt(wx, wy - this.waterPx);
      ty = SHORE_TYPES[ty] ? ty : defT;
      tp[i] = 1 + TYPE_NAMES.indexOf(ty);
      if (SHORE_TYPES[ty].wave) { seedV[i] = 1; anyWave = true; }
    }
    const ox = new Int16Array(N), oy = new Int16Array(N);
    const ox2 = new Int16Array(N), oy2 = new Int16Array(N);
    edt(nx, ny, seedL, ox, oy);                 // every cell -> nearest shore (land) cell
    yield;
    edt(nx, ny, seedW, ox2, oy2);               // land cells -> nearest water cell
    yield;
    const d = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (water[i]) {
        const dd = anyLand && ox[i] < EDT_INF ? Math.sqrt(ox[i] * ox[i] + oy[i] * oy[i]) * cG - cG * 0.5 : DM;
        d[i] = Math.min(DM, Math.max(0.5, dd));
      } else {
        const dd = ox2[i] < EDT_INF ? Math.sqrt(ox2[i] * ox2[i] + oy2[i] * oy2[i]) * cG - cG * 0.5 : DM;
        d[i] = -Math.min(DM, Math.max(0.5, dd));
      }
      if (cov[i] > 0 && cov[i] < 1 && Math.abs(d[i]) < cG) d[i] = (cov[i] - 0.5) * cG;   // sub-cell shoreline
    }
    const tmp = new Float32Array(N);
    blur(d, nx, ny, 1.25 / s, tmp);
    yield;
    // wave distance: to the coasts that make the shore swell only (crests pass around breakwaters / quays),
    // smoothed harder so the crest lines stay round. Land cells take their nearest WATER cell's value first,
    // so the blur never drags land distances into the water next to a breakwater.
    const w = new Float32Array(N);
    let ox3 = null, oy3 = null;
    if (anyWave) {
      ox3 = new Int16Array(N); oy3 = new Int16Array(N);
      edt(nx, ny, seedV, ox3, oy3);
      yield;
      for (let i = 0; i < N; i++) {
        if (!water[i]) continue;
        w[i] = ox3[i] < EDT_INF ? Math.min(DM, Math.max(0, Math.sqrt(ox3[i] * ox3[i] + oy3[i] * oy3[i]) * cG - cG * 0.5)) : DM;
      }
      for (let i = 0; i < N; i++) {
        if (water[i]) continue;
        const j = ox2[i] < EDT_INF ? i + oy2[i] * nx + ox2[i] : -1;
        w[i] = j >= 0 && j < N && water[j] ? (seedV[i] ? 0 : w[j]) : (seedV[i] ? 0 : DM);
      }
      blur(w, nx, ny, 3.0 / s, tmp);
      yield;
    } else w.fill(DM);
    // shore parameters from the nearest shore cell's type
    const pR = new Float32Array(N), pE = new Float32Array(N), pS = new Float32Array(N), hardK = new Uint8Array(N);
    const def = SHORE_TYPES[defT];
    for (let i = 0; i < N; i++) {
      let st = def;
      if (ox[i] < EDT_INF) {
        const j = i + oy[i] * nx + ox[i];
        if (j >= 0 && j < N && tp[j]) st = SHORE_TYPES[TYPE_NAMES[tp[j] - 1]];
      }
      pR[i] = st.runup; pE[i] = st.edge; pS[i] = st.snow;
      hardK[i] = st.bed < 0 ? (st.edge >= 0.75 ? 2 : st.edge > 0.25 ? 1 : 0) : 0;
    }
    blur(pR, nx, ny, 2.0 / s, tmp); blur(pE, nx, ny, 2.0 / s, tmp); blur(pS, nx, ny, 3.0 / s, tmp);
    yield;
    // sea bed: the profile of the nearest WAVE-making coast (its slope blurred wide: no crisp arcs where the
    // nearest coast changes), measured along the wave distance; quays / breakwaters only within HARD_W
    const depth = new Float32Array(N);
    const bedS = new Float32Array(N);
    if (anyWave) {
      for (let i = 0; i < N; i++) {
        let b = 1;
        if (ox3[i] < EDT_INF) {
          const j = i + oy3[i] * nx + ox3[i];
          if (j >= 0 && j < N && tp[j]) b = Math.max(0, SHORE_TYPES[TYPE_NAMES[tp[j] - 1]].bed);
        }
        bedS[i] = b;
      }
      blur(bedS, nx, ny, 8.0 / s, tmp);
      yield;
    }
    for (let i = 0; i < N; i++) {
      const dS = anyWave ? bedProfile(Math.max(0, w[i]) / PPU, bedS[i]) : DEEP_M;
      let dep = dS;
      const k = hardK[i];
      if (k) {
        const dd = Math.max(0, d[i]);
        const hw = 1 - smooth(0, HARD_W, dd);
        const dH = k === 1 ? Math.max(dS, 4.0) : Math.min(dS, 0.35 + 1.1 * dd / PPU);
        dep = dS + (dH - dS) * hw;
      }
      depth[i] = dep;
    }
    blur(depth, nx, ny, 1.5 / s, tmp);
    yield;
    // default swell direction: mean gradient of the wave distance near the coast (toward the shore)
    let gxs = 0, gys = 0;
    const src = anyWave ? w : d;
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      const i = y * nx + x;
      if (!water[i] || src[i] <= 0 || src[i] > 500) continue;
      gxs += src[i + 1] - src[i - 1]; gys += src[i + nx] - src[i - nx];
    }
    const L = Math.hypot(gxs, gys);
    const autoDir = L > 1e-6 ? [-gxs / L, -gys / L] : [0, 1];
    // coast direction (toward the land): -grad(wave distance) in the water, -grad(d) on land (up the beach)
    const cx = new Float32Array(N), cy = new Float32Array(N), q = new Float32Array(N);
    for (let i = 0; i < N; i++) q[i] = water[i] && anyWave ? w[i] : d[i];
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      const xa = x > 0 ? i - 1 : i, xb = x < nx - 1 ? i + 1 : i, ya = y > 0 ? i - nx : i, yb = y < ny - 1 ? i + nx : i;
      const gx = (q[xb] - q[xa]) / (((xb - xa) || 1) * cG), gy = (q[yb] - q[ya]) / (((yb - ya) / nx || 1) * cG);
      const gl = Math.hypot(gx, gy);                // per G px (a distance field: ~1)
      if (gl > 0.25) { cx[i] = -gx / gl; cy[i] = -gy / gl; } else { cx[i] = autoDir[0]; cy[i] = autoDir[1]; }
    }
    blur(cx, nx, ny, 1.0, tmp); blur(cy, nx, ny, 1.0, tmp);
    yield;
    // pack: A = d, wave distance (sqrt-encoded +-DM), run-up, depth;  B = coast dir x, y, edge kind, snow
    const pxA = new Uint8Array(N * 4), pxB = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      pxA[i * 4] = encodeD(d[i]);
      pxA[i * 4 + 1] = encodeD(w[i]);
      pxA[i * 4 + 2] = Math.round(clamp01(pR[i]) * 255);
      pxA[i * 4 + 3] = Math.round((1 - Math.exp(-depth[i] / DEPTH_ENC)) * 255);
      const l = Math.hypot(cx[i], cy[i]) || 1;
      pxB[i * 4] = Math.round((0.5 + 0.5 * cx[i] / l) * 255);
      pxB[i * 4 + 1] = Math.round((0.5 + 0.5 * cy[i] / l) * 255);
      pxB[i * 4 + 2] = Math.round(clamp01(pE[i]) * 255);
      pxB[i * 4 + 3] = Math.round(clamp01(pS[i]) * 255);
    }
    this._finishField({ fnx: nx, fny: ny, s, pxA, pxB, autoDir });
  }

  /** install a field (built or baked): 8-bit textures + the decoded build-time arrays */
  _finishField(f) {
    this.fnx = f.fnx; this.fny = f.fny; this.fieldScale = f.s;
    this.fcx = CELL_X * f.s; this.fcy = CELL_Y * f.s;
    this.fieldPx = f.pxA; this.fieldPx2 = f.pxB;
    this.autoDir = f.autoDir || [0, 1];
    if (!this.stats.fieldCells) this.stats.fieldCells = Math.ceil(this.region.w / CELL_X) * Math.ceil(this.region.h / CELL_Y);
    // decoded per cell (meshes, crash points; dropped after the build)
    const N = f.fnx * f.fny, d = new Float32Array(N), w = new Float32Array(N), ru = new Float32Array(N), ek = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      d[i] = decodeD(f.pxA[i * 4] / 255); w[i] = Math.max(0, decodeD(f.pxA[i * 4 + 1] / 255));
      ru[i] = f.pxA[i * 4 + 2] / 255; ek[i] = f.pxB[i * 4 + 2] / 255;
    }
    this._F = { d, w, ru, ek };
  }

  /** bilinear sample (0..1) of channel ch of field A at world (x, y) — the same texels the shader filters */
  _sampleA(ch, x, y) {
    const fx = (x - this.region.x) / this.fcx - 0.5, fy = (y - this.region.y) / this.fcy - 0.5;
    const nx = this.fnx, ny = this.fny, px = this.fieldPx;
    const x0 = Math.max(0, Math.min(nx - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(ny - 1, Math.floor(fy)));
    const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = px[(y0 * nx + x0) * 4 + ch], b = px[(y0 * nx + x1) * 4 + ch], c = px[(y1 * nx + x0) * 4 + ch], e = px[(y1 * nx + x1) * 4 + ch];
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty) / 255;
  }

  /** signed distance to the shoreline (G px, + = water) at world (x, y) */
  shoreDistance(x, y) { return this.fieldPx ? decodeD(this._sampleA(0, x, y)) : DM; }

  /** distance (G px) to the coasts that make the shore swell (its crests follow this field) */
  waveDistance(x, y) { return this.fieldPx ? Math.max(0, decodeD(this._sampleA(1, x, y))) : DM; }

  /** sea-bed depth (m) under world (x, y) */
  seaDepth(x, y) { return this.fieldPx ? -DEPTH_ENC * Math.log(Math.max(1 - this._sampleA(3, x, y), 0.002)) : DEEP_M; }

  /** the baked form of this field (tools/fx/gen_water_field.mjs): { meta, rgb } (rgb = the stacked RGB image bytes) */
  bakeData() {
    const N = this.fnx * this.fny, A = this.fieldPx, B = this.fieldPx2, rgb = new Uint8Array(N * 9);
    for (let i = 0; i < N; i++) {
      const a = i * 4;
      rgb.set([A[a], A[a + 1], A[a + 2]], i * 3);
      rgb.set([A[a + 3], B[a + 2], B[a + 3]], (N + i) * 3);
      rgb.set([B[a], B[a + 1], 0], (2 * N + i) * 3);
    }
    return { meta: { version: FIELD_VERSION, sig: this.sig, fnx: this.fnx, fny: this.fny, s: this.fieldScale, autoDir: this.autoDir.slice(),
      region: this.region, waterPx: this.waterPx }, rgb };
  }

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
    // whitecap streak wave vectors: P1 mostly along the crests of wave 0, P2 rotated (differs crest to crest)
    const k0 = this.waves[0], kl = Math.hypot(k0.kx, k0.ky);
    const ux = k0.kx / kl, uy = k0.ky / kl, c5 = Math.cos(0.87), s5 = Math.sin(0.87);
    this._wcA = [-uy * 0.021 + ux * 0.004, ux * 0.021 + uy * 0.004, (ux * c5 - uy * s5) * 0.013, (ux * s5 + uy * c5) * 0.013];
    this._k0inv = 1 / kl;
  }

  _nu(gx, gy) { return NU[0] * Math.sin(NU[1] * gx + NU[2] * gy) + NU[3] * Math.sin(NU[4] * gx + NU[5] * gy + NU[6]); }
  _av(gx, gy, t) { return AV[0] + AV[1] * Math.sin(AV[2] * gx + AV[3] * gy + AV[4] * t) + AV[5] * Math.sin(AV[6] * gx + AV[7] * gy + AV[8] * t + AV[9]); }

  /**
   * surface height (screen px, + = up) at world (x, y) and time t (s; default now) — the same maths, the
   * same 8-bit field and the same packed rings as the shader, so floating sprites can use y = waterY - h.
   */
  heightAt(x, y, t) {
    if (!this.ready) return 0;
    if (this._pkDirty) this._packRings();
    return this._height(x, y, t === undefined ? this.t : t);
  }

  /**
   * surface slope at world (x, y): out.x = dh/dx, out.y = dh/dy (screen px of height per screen px), central
   * differences of heightAt at +-1 px (exactly the derivative of what the boats bob on). Tilt a boat by it.
   */
  slopeAt(x, y, t, out) {
    const o = out || this._slopeOut;
    if (!this.ready) { o.x = 0; o.y = 0; return o; }
    if (this._pkDirty) this._packRings();
    const tt = t === undefined ? this.t : t;
    o.x = (this._height(x + 1, y, tt) - this._height(x - 1, y, tt)) * 0.5;
    o.y = (this._height(x, y + 1, tt) - this._height(x, y - 1, tt)) * 0.5;
    return o;
  }

  _height(x, y, t) {
    const gx = x - this.region.x, gy = 2 * (y - this.region.y);
    const sw = this.swellAmp, dpos = Math.max(0, this.shoreDistance(x, y));
    let h = 0;
    const wDir = 0.45 + 0.55 * smooth(0, this.shore.reach, dpos);
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      h += w.amp * sw * wDir * Math.sin(w.kx * gx + w.ky * gy - wrap(w.w * t));
    }
    const S = this.shore;
    const nu = this._nu(gx, gy), av = this._av(gx, gy, t);
    const dw = this.waveDistance(x, y);
    const psi = dw + S.shoalA * S.shoalD * (1 - Math.exp(-dw / S.shoalD));
    const phS = S.k * psi + wrap(S.w * (t + this.phaseOff)) + nu;
    const wS = 1 - smooth(S.reach * 0.45, S.reach, dw);
    h += S.amp * this.surfAmp * av * wS * Math.sin(phS);
    // ripple rings: exactly the packed set the shader draws
    const pk = this._pk;
    for (let i = 0; i < this._pkN; i++) {
      const o = i * 4;
      const age = t - pk[o + 2];
      if (age < 0 || age >= RING_LIFE) continue;
      const dist = Math.hypot(gx - pk[o], gy - pk[o + 1]);
      const wr = 10 + age * 12;
      const xx = (dist - age * 110) / wr;
      if (Math.abs(xx) >= 3) continue;
      h += pk[o + 3] * Math.exp(-age * 1.3) * Math.exp(-xx * xx * 1.6) * Math.sin(xx * 5) * 1.5;
    }
    return h;
  }

  /**
   * swash / shore-swell cycle (0..1) at world (x, y): 0 = a crest reaches the waterline here (foam starts up
   * the beach — the moment for sfx_wave_wash), 0.3 = top of the uprush, then the backwash. Same phase as the
   * shader's surf and swash; one cycle = SWELL.shore.period (6 s).
   */
  swashPhase(x, y, t) {
    const gx = x - this.region.x, gy = 2 * (y - this.region.y);
    return fract((wrap(this.shore.w * ((t === undefined ? this.t : t) + this.phaseOff)) + this._nu(gx, gy) - Math.PI / 2) / TAU);
  }

  /**
   * keep the shore-swell crests in step with an ambience bed (audio5 amb_sea_waves / amb_beach): cyc = the
   * bed's crest cycle at its play position, fract((seek - swellPhase) / swellPeriod); (x, y) = the reference
   * shore point (near the camera). Corrects at most maxStep seconds per call (no visible jumps).
   */
  syncPhase(cyc, x, y, maxStep = 0.05) {
    let diff = cyc - this.swashPhase(x, y);
    diff -= Math.round(diff);
    this.phaseOff += Math.max(-maxStep, Math.min(maxStep, diff * this.shore.period));
    return diff;
  }

  /** where to seek an ambience bed so its crests land with the water's at (x, y): seconds into the loop */
  bedSeek(x, y, swellPhase, swellPeriod, duration) {
    const s = swellPhase + this.swashPhase(x, y) * swellPeriod;
    return ((s % duration) + duration) % duration;
  }

  /** the water surface point (screen px) under world (x, y) at the land level: y + waterPx - height */
  surfaceY(x, y, t) { return y + this.waterPx - this.heightAt(x, y, t); }

  /**
   * add a ripple ring (splash, swimmer stroke, wake puff) at world (x, y); strength ~0.3 .. 2.
   * t0 = birth time (default now; captures pass it explicitly). The CPU keeps up to 64 rings; each frame the
   * strongest live ones near the view (12 high / 6 low) are packed for the shader AND for heightAt.
   */
  ripple(x, y, strength = 1, t0) {
    const L = this._rl, tt = t0 === undefined ? this.t : t0;
    let o = this._rlN;
    if (o >= RING_POOL) {
      // replace the weakest (dead rings first)
      let best = 0, bw = Infinity;
      for (let i = 0; i < RING_POOL; i++) {
        const age = this.t - L[i * 4 + 2];
        const w = age >= RING_LIFE || age < -RING_LIFE ? -1 : L[i * 4 + 3] * Math.exp(-1.3 * Math.max(0, age));
        if (w < bw) { bw = w; best = i; }
      }
      o = best;
    } else this._rlN++;
    L[o * 4] = x - this.region.x; L[o * 4 + 1] = 2 * (y - this.region.y);
    L[o * 4 + 2] = tt; L[o * 4 + 3] = Math.max(0, Math.min(3, strength));
    this._pkDirty = true;
    return this;
  }

  /** forget every ripple ring */
  clearRipples() { this._rlN = 0; this._pkN = 0; this._pkDirty = true; return this; }

  /** pick the rings the shader draws (and heightAt sums): strongest strength * e^(-1.3 age), near the view */
  _packRings() {
    const L = this._rl, P = this._pk, used = this._rlUsed, t = this.t, R = this.region;
    const max = this.quality === 'low' ? RINGS_LOW : RINGS_HIGH;
    const v = this._vr, cull = this._vrOk, M = 220;
    used.fill(0, 0, this._rlN);
    let n = 0;
    for (; n < max; n++) {
      let best = -1, bw = 0;
      for (let i = 0; i < this._rlN; i++) {
        if (used[i]) continue;
        const o = i * 4, age = t - L[o + 2];
        if (age < 0 || age >= RING_LIFE) continue;
        if (cull) {
          const wx = L[o] + R.x, wy = L[o + 1] * 0.5 + R.y;
          if (wx < v[0] - M || wx > v[2] + M || wy < v[1] - M || wy > v[3] + M) continue;
        }
        const w = L[o + 3] * Math.exp(-1.3 * age) + 1e-6;
        if (w > bw) { bw = w; best = i; }
      }
      if (best < 0) break;
      used[best] = 1;
      P[n * 4] = L[best * 4]; P[n * 4 + 1] = L[best * 4 + 1]; P[n * 4 + 2] = L[best * 4 + 2]; P[n * 4 + 3] = L[best * 4 + 3];
    }
    this._pkN = n;
    this._pkDirty = false;
  }

  // ------------------------------------------------------------------ contacts
  /**
   * a thing in the water (hull, post, ice chunk, swimmer): a foam collar that breathes with the swell + a soft
   * shadow on the water, drawn by the shader. Circle on the WATER PLANE: (x, y) = world px at the waterline,
   * r = radius in world px along x (shows as a 2:1 ellipse; use two contacts for a long hull).
   * opts: { foam 0..0.99 (default 0.7), shadow 0..0.5 (default 0.22) }. Returns an id for moveContact /
   * removeContact. Up to 16 (high) / 8 (low) contacts near the view are drawn.
   */
  addContact(x, y, r = 20, o = {}) {
    let id = -1;
    for (let i = 0; i < CONTACT_POOL; i++) if (!this._conOn[i]) { id = i; break; }
    if (id < 0) return -1;
    this._conOn[id] = 1;
    const foam = Math.max(0, Math.min(0.99, o.foam !== undefined ? o.foam : 0.7));
    const shadow = Math.max(0, Math.min(0.5, o.shadow !== undefined ? o.shadow : 0.22));
    const c = this._con;
    c[id * 4] = x; c[id * 4 + 1] = y; c[id * 4 + 2] = r; c[id * 4 + 3] = Math.round(shadow * 100) + foam;
    return id;
  }

  /** move contact id to world (x, y) (radius optional) */
  moveContact(id, x, y, r) {
    if (id < 0 || id >= CONTACT_POOL || !this._conOn[id]) return this;
    this._con[id * 4] = x; this._con[id * 4 + 1] = y;
    if (r !== undefined) this._con[id * 4 + 2] = r;
    return this;
  }

  removeContact(id) { if (id >= 0 && id < CONTACT_POOL) this._conOn[id] = 0; return this; }
  clearContacts() { this._conOn.fill(0); return this; }

  // ------------------------------------------------------------------ palette / quality / fish / light
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
    this._pkDirty = true;
    if (this.isShader) this._pickPrograms();
    if (this.scene && this.scene.events) this.scene.events.emit('water:quality', this.quality, this);
    return this;
  }

  /**
   * night / weather: { dark 0..1 (DayClock overlay alpha), glint, refl, sss multipliers }. The DayClock's
   * MULTIPLY overlay darkens everything; this keeps the water's own light (sun glints, sky reflection, crest
   * glow) from staying daytime-bright under it.
   */
  setLighting(o = {}) {
    const L = this._light;
    if (o.dark !== undefined) L.dark = clamp01(o.dark);
    L.glint = (o.glint !== undefined ? o.glint : 1) * (1 - 0.85 * L.dark);
    L.refl = (o.refl !== undefined ? o.refl : 1) * (1 - 0.45 * L.dark);
    L.sss = (o.sss !== undefined ? o.sss : 1) * (1 - 0.7 * L.dark);
    return this;
  }

  /** debug output: 'height' draws the surface height (lab readback test) | null */
  setDebug(mode) { this.debug = mode === 'height' ? 'height' : null; if (this.isShader) this._pickPrograms(); return this; }

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
    if (this._pending) { this._stepBuild(); return; }
    this.t += Math.min(0.1, Math.max(0, dt || 0));
    this._pkDirty = true;
    this._tick();
  }

  /** async build: run field steps for ~6 ms per frame, then finish */
  _stepBuild() {
    const a = now(), budget = this.opts.buildBudgetMs || 6;
    while (now() - a < budget) {
      if (this._pending.next().done) { this._pending = null; this._afterField(this._pendingT0); return; }
    }
  }

  /** set the water clock (deterministic captures / tests) */
  setTime(t) { this.t = t; this._tPrev = t; this._pkDirty = true; this._tick(true); }

  _tick(jump) {
    if (this.fallback) {
      this.fallback.tilePositionX = this.t * 6;
      this.fallback.tilePositionY = Math.sin(this.t * 0.4) * 6;
    }
    if (!jump && this.ready) this._crashes();
  }

  // ------------------------------------------------------------------ crash spray (rock / breakwater)
  /**
   * crash points: hard-shore cells at the visible wall foot whose face looks INTO the swell
   * (dot(outward normal, -swellDir) > 0.3: the sheltered side of a breakwater never sprays)
   */
  _buildCrashPoints() {
    const pts = [];
    const F = this._F, nx = this.fnx, ny = this.fny, R = this.region, sd = this.swellDir, S = this.shore;
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      const i = y * nx + x;
      const d = F.d[i];
      if (d < 1 || d > 14 + this.fcx || F.ek[i] < 0.75 || F.ru[i] > 0.05) continue;
      const gx = F.d[i + 1] - F.d[i - 1], gy = F.d[i + nx] - F.d[i - nx], gl = Math.hypot(gx, gy);
      if (gl < 1e-3) continue;
      const expo = -(gx * sd[0] + gy * sd[1]) / gl;
      if (expo < 0.3) continue;
      const wx = R.x + (x + 0.5) * this.fcx, wy = R.y + (y + 0.5) * this.fcy;
      let ok = true;
      for (const p of pts) if (Math.hypot(p.x - wx, 2 * (p.y - wy)) < 96) { ok = false; break; }
      if (!ok) continue;
      const dw = F.w[i];
      const g = [wx - R.x, 2 * (wy - R.y)];
      const wS = 1 - smooth(S.reach * 0.45, S.reach, dw);
      // the phase the shader's slap burst uses: shore swell where it reaches, else the swell along the wall
      const k = wS > 0.5 ? S.k * (dw + S.shoalA * S.shoalD * (1 - Math.exp(-dw / S.shoalD))) : -S.k * (g[0] * sd[0] + g[1] * sd[1]);
      // a face looking away from the camera: its foot is hidden behind the structure -> the spray draws behind it
      pts.push({ x: wx, y: wy, g, k, expo: +expo.toFixed(3), behind: gy / gl < -0.25 });
    }
    this.crashPoints = pts;
  }

  /**
   * crash-spray events (rock / breakwater shores) whose swell crest arrives in (t0, t1]: calls
   * fn(x, y, strength, t, behind) for each (deterministic: the same phase the shader's slap burst uses; the
   * bursts travel along a breakwater with the swell; behind = the foot is hidden behind the structure, draw the
   * spray under the structure's tiles so it rises over its top). update() feeds these to opts.onCrash or plays
   * fx_wave_crash.
   */
  crashEvents(t0, t1, fn) {
    const pts = this.crashPoints;
    if (!pts || !pts.length || this.surfAmp <= 0 || !(t1 > t0)) return 0;
    const S = this.shore, off = this.phaseOff;
    let n = 0;
    for (let ci = 0; ci < pts.length; ci++) {
      const p = pts[ci];
      const base = p.k + this._nu(p.g[0], p.g[1]) - Math.PI / 2;    // phase(t) = base + w (t + off); a crest = 2 pi m
      for (let m = Math.floor((base + S.w * (t0 + off)) / TAU) + 1; ; m++) {
        const tc = (m * TAU - base) / S.w - off;
        if (tc > t1) break;
        if (tc <= t0) continue;
        const av = this._av(p.g[0], p.g[1], tc);
        if (av < 0.74) continue;                 // only the bigger waves of a set throw spray
        fn(p.x, p.y, Math.min(1.4, (av - 0.56) * 2.2) * Math.max(0.5, this.surfAmp) * (0.6 + 0.4 * p.expo), tc, p.behind);
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

  _crashEvt(x, y, strength, t, behind) {
    const cam = this.scene && this.scene.cameras && this.scene.cameras.main;
    const v = cam && cam.worldView;
    if (v && (x < v.x - 80 || x > v.right + 80 || y < v.y - 120 || y > v.bottom + 60)) return;
    if (this.opts.onCrash) this.opts.onCrash(x, y, strength, behind);
    else this._spray(x, y, strength, behind);
  }

  _spray(x, y, s, behind) {
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
    const dB = this.opts.crashDepthBehind !== undefined ? this.opts.crashDepthBehind : DEPTH.GROUND + 10;
    sp.setPosition(x, y).setVisible(true).setDepth(behind ? dB : y + 2).setScale(0.75 + 0.3 * s).setFlipX(((x * 7 + y * 13) | 0) % 2 === 0);
    const def = this.opts.crashAnchor || [0.5, 0.86];
    sp.setOrigin(def[0], def[1]);
    sp.play({ key: 'fx_wave_crash', repeat: 0 });
  }

  // ------------------------------------------------------------------ meshes
  _buildMeshes() {
    const F = this._F, nx = this.fnx, ny = this.fny, R = this.region, d = F.d, ru = F.ru, cX = this.fcx, cY = this.fcy;
    const body = [], shore = [];
    const rect = (arr, x0, y0, x1, y1) => arr.push(x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1);
    // body: blocks of 64 x 32 px that hold any water (+ a cell of margin under the land edge)
    const B = Math.max(1, Math.round(64 / cX));
    const nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B);
    for (let by = 0; by < nby; by++) {
      let run = -1;
      const flush = (bx) => {
        if (run < 0) return;
        rect(body, R.x + run * B * cX, R.y + by * B * cY, Math.min(R.x + R.w, R.x + bx * B * cX), Math.min(R.y + R.h, R.y + (by + 1) * B * cY));
        run = -1;
      };
      for (let bx = 0; bx < nbx; bx++) {
        let any = false;
        for (let y = Math.max(0, by * B - 1); y < Math.min(ny, by * B + B + 1) && !any; y++) {
          for (let x = Math.max(0, bx * B - 1); x < Math.min(nx, bx * B + B + 1); x++) if (d[y * nx + x] > -24) { any = true; break; }
        }
        if (any) { if (run < 0) run = bx; } else flush(bx);
      }
      flush(nbx);
    }
    // open sea: a skirt past every region edge whose border cells are open water (far from any coast)
    this.openEdges = { top: 0, bottom: 0, left: 0, right: 0 };
    if (this.opts.openSea !== false) {
      const M = OPEN_SKIRT, reach = this.shore ? this.shore.reach : 560;
      const open = (i) => d[i] > 300 && (F.w[i] >= reach * 0.92);
      const x1R = R.x + R.w, y1R = R.y + R.h;
      const edgeRuns = (count, idx, emit) => {
        let run = -1;
        for (let k = 0; k <= count; k++) {
          const ok = k < count && open(idx(k));
          if (ok && run < 0) run = k;
          if (!ok && run >= 0) { emit(run, k); run = -1; }
        }
      };
      edgeRuns(nx, (k) => k, (a, b) => { rect(body, R.x + a * cX, R.y - M, Math.min(x1R, R.x + b * cX), R.y); this.openEdges.top += b - a; });
      edgeRuns(nx, (k) => (ny - 1) * nx + k, (a, b) => { rect(body, R.x + a * cX, y1R, Math.min(x1R, R.x + b * cX), y1R + M); this.openEdges.bottom += b - a; });
      edgeRuns(ny, (k) => k * nx, (a, b) => { rect(body, R.x - M, R.y + a * cY, R.x, Math.min(y1R, R.y + b * cY)); this.openEdges.left += b - a; });
      edgeRuns(ny, (k) => k * nx + nx - 1, (a, b) => { rect(body, x1R, R.y + a * cY, x1R + M, Math.min(y1R, R.y + b * cY)); this.openEdges.right += b - a; });
      const corner = (i, x0, y0, x1, y1) => { if (open(i)) rect(body, x0, y0, x1, y1); };
      corner(0, R.x - M, R.y - M, R.x, R.y);
      corner(nx - 1, x1R, R.y - M, x1R + M, R.y);
      corner((ny - 1) * nx, R.x - M, y1R, R.x, y1R + M);
      corner(ny * nx - 1, x1R, y1R, x1R + M, y1R + M);
    }
    // shore: blocks of 32 x 16 px near soft shores
    const S = Math.max(1, Math.round(32 / cX));
    const nsx = Math.ceil(nx / S), nsy = Math.ceil(ny / S);
    for (let by = 0; by < nsy; by++) {
      let run = -1;
      const flush = (bx) => {
        if (run < 0) return;
        rect(shore, R.x + run * S * cX, R.y + by * S * cY, Math.min(R.x + R.w, R.x + bx * S * cX), Math.min(R.y + R.h, R.y + (by + 1) * S * cY));
        run = -1;
      };
      for (let bx = 0; bx < nsx; bx++) {
        let any = false;
        for (let y = Math.max(0, by * S - 1); y < Math.min(ny, by * S + S + 1) && !any; y++) {
          for (let x = Math.max(0, bx * S - 1); x < Math.min(nx, bx * S + S + 1); x++) {
            const i = y * nx + x, r = ru[i];
            if (r > 0.02 && d[i] > -(r * RUNUP_MAX * 1.2 + 60) && d[i] < 40 + 210 * r) { any = true; break; }
          }
        }
        if (any) { if (run < 0) run = bx; } else flush(bx);
      }
      flush(nsx);
    }
    this.meshBody = new Float32Array(body);
    this.meshShore = new Float32Array(shore);
    this.stats.bodyVerts = body.length / 2;
    this.stats.shoreVerts = shore.length / 2;
  }

  // ------------------------------------------------------------------ GL
  _fieldTexture(gl, px) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    const prev = setUnpack(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.fnx, this.fny, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    restoreUnpack(gl, prev);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

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
    this.fieldTex = this._fieldTexture(gl, this.fieldPx);
    this.fieldTex2 = this._fieldTexture(gl, this.fieldPx2);
    this.vboBody = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBody);
    gl.bufferData(gl.ARRAY_BUFFER, this.meshBody, gl.STATIC_DRAW);
    this.vboShore = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboShore);
    gl.bufferData(gl.ARRAY_BUFFER, this.meshShore, gl.STATIC_DRAW);
    this._pickPrograms();
    this._lutDirty = false;
    if (this.pal && this.pal.row === undefined) this._uploadLutRow(this.pal);
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
        this.lost = false; this._shared = null; this.fieldTex = null; this.fieldTex2 = null; this.vboBody = null; this.vboShore = null;
        try { this._initGL(renderer); } catch (e) { console.warn('[Water] restore failed', e); }
      };
      renderer.on('losewebgl', this._onLost);
      renderer.on('restorewebgl', this._onRestore);
    }
    let bytes = this.fnx * this.fny * 8;
    for (const k in s.textures) bytes += s.textures[k].bytes;
    this.stats.textureBytes = Math.round(bytes);
  }

  _pickPrograms() {
    const r = this._renderer;
    if (!r) return;
    const high = this.quality === 'high';
    const fl = (this.debug === 'height' ? '|dbg' : '') + (this.opts.precision === 'mediump' ? '|mp' : '');
    this.progBody = program(r, (high ? (this._fishLayers.length && this._fishTex ? 'body_high' : 'body_high_nofish') : 'body_low') + fl);
    this.progShore = program(r, (high ? 'shore_high' : 'shore_low') + (this.opts.precision === 'mediump' ? '|mp' : ''));
    this.stats.fetchesBody = this.progBody.fetches;
    this.stats.fetchesShore = this.progShore.fetches;
    this.stats.fragUniformVectors = Math.max(this.progBody.fragUniformVectors, this.progShore.fragUniformVectors);
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
      if (this.fieldTex2) gl.deleteTexture(this.fieldTex2);
      if (this.vboBody) gl.deleteBuffer(this.vboBody);
      if (this.vboShore) gl.deleteBuffer(this.vboShore);
    }
    this.fieldTex = null; this.fieldTex2 = null; this.vboBody = null; this.vboShore = null;
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
    if (sc && sc.textures.exists(key)) {
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
    // the camera view (ring / contact culling); repack the rings when it moved
    const wv = camera.worldView, vr = this._vr;
    if (!this._vrOk || vr[0] !== wv.x || vr[1] !== wv.y || vr[2] !== wv.right || vr[3] !== wv.bottom) {
      vr[0] = wv.x; vr[1] = wv.y; vr[2] = wv.right; vr[3] = wv.bottom; this._vrOk = true; this._pkDirty = true;
    }
    if (this._pkDirty) this._packRings();
    gl.useProgram(prog.p);
    const m = calc.matrix, V = this._view;
    V[0] = m[0]; V[1] = m[1]; V[3] = m[2]; V[4] = m[3]; V[6] = m[4]; V[7] = m[5];
    gl.uniformMatrix3fv(u.uView, false, V);
    gl.uniformMatrix4fv(u.uProj, false, renderer.projectionMatrix.val);
    // camera-relative G origin keeps every interpolated value small (mediump-safe)
    const cx = Math.round(wv.centerX), cy = Math.round(wv.centerY);
    const gcx = cx - R.x, gcy = 2 * (cy - R.y);
    gl.uniform4f(u.uOrg, R.x, R.y, 1 / (this.fnx * this.fcx), 1 / (this.fny * this.fcy));
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
    const sh = this.shore, sd = this.swellDir, Lt = this._light;
    gl.uniform4f(u.uShore, sh.k, wrap(sh.w * (t + this.phaseOff)), sh.amp * this.surfAmp, sh.reach);
    gl.uniform4f(u.uShoal, sh.shoalA, sh.shoalD, SWELL.normalBoost, SWELL.ripple * this.rippleAmp);
    gl.uniform4f(u.uAlong, wrap(NU[1] * gcx + NU[2] * gcy), wrap(NU[4] * gcx + NU[5] * gcy + NU[6]),
      wrap(AV[2] * gcx + AV[3] * gcy + AV[4] * t), wrap(AV[6] * gcx + AV[7] * gcy + AV[8] * t + AV[9]));
    gl.uniform4f(u.uMisc, camera.zoom, this.look.glint, this.look.refl, 0.035);
    gl.uniform4f(u.uPal, this.lutV, this.pal.depthScale, this.pal.caustic, this.look.whitecap);
    gl.uniform4f(u.uLight, Lt.glint, Lt.refl, Lt.sss, Lt.dark);
    gl.uniform4f(u.uSwDir, sd[0], sd[1], 1 / TILE_LACE, sh.period);
    const c = this._col, sky = this._sky, dk = Lt.dark;
    // night: the reflected sky cools and darkens (the DayClock overlay multiplies on top)
    for (let k = 0; k < 6; k++) sky[k] = c[k] * (1 - dk * 0.55) + (k % 3 === 2 ? 0.16 : 0.06) * dk;
    gl.uniform3f(u.uSky0, sky[0], sky[1], sky[2]); gl.uniform3f(u.uSky1, sky[3], sky[4], sky[5]); gl.uniform3f(u.uSun, c[6], c[7], c[8]);
    gl.uniform3f(u.uFoamC, c[9], c[10], c[11]); gl.uniform3f(u.uFoamS, c[12], c[13], c[14]);
    this._unit = 0;
    this._bind(gl, u.uField, this.fieldTex);
    this._bind(gl, u.uField2, this.fieldTex2);
    if (!isShore) {
      const sw = this._sw;
      let ampSum = sh.amp * this.surfAmp;
      for (let i = 0; i < 4; i++) {
        const w = this.waves[i];
        sw[i * 4] = w.kx; sw[i * 4 + 1] = w.ky;
        sw[i * 4 + 2] = wrap(w.kx * gcx + w.ky * gcy - w.w * t);
        sw[i * 4 + 3] = w.amp * this.swellAmp;
        ampSum += sw[i * 4 + 3];
      }
      gl.uniform4fv(u.uSw, sw);
      // rings: the packed set (camera relative)
      const rg = this._ring, pk = this._pk;
      let n = 0;
      for (let i = 0; i < this._pkN; i++) {
        const o = i * 4, age = t - pk[o + 2];
        if (age < 0 || age >= RING_LIFE) continue;
        rg[n * 4] = pk[o] - gcx; rg[n * 4 + 1] = pk[o + 1] - gcy; rg[n * 4 + 2] = age; rg[n * 4 + 3] = pk[o + 3];
        n++;
      }
      gl.uniform4fv(u.uRing, this.quality === 'low' ? this._ringLow : rg);
      gl.uniform4f(u.uRingN, n, 110, 10, 1 / Math.max(0.5, ampSum * 0.6));
      // contacts near the view
      const cp = this._conPk, cs = this._con, cmax = this.quality === 'low' ? CONTACTS_LOW : CONTACTS_HIGH;
      let nc = 0;
      for (let i = 0; i < CONTACT_POOL && nc < cmax; i++) {
        if (!this._conOn[i]) continue;
        const x = cs[i * 4], y = cs[i * 4 + 1];
        if (x < vr[0] - 120 || x > vr[2] + 120 || y < vr[1] - 80 || y > vr[3] + 80) continue;
        cp[nc * 4] = x - R.x - gcx; cp[nc * 4 + 1] = 2 * (y - R.y) - gcy; cp[nc * 4 + 2] = cs[i * 4 + 2]; cp[nc * 4 + 3] = cs[i * 4 + 3];
        nc++;
      }
      gl.uniform4fv(u.uCon, this.quality === 'low' ? this._conLow : cp);
      gl.uniform4f(u.uConN, nc, 0, 0, 0);
      gl.uniform4f(u.uRotAf, ca, sa, 0, 0);
      gl.uniform4f(u.uRotBf, cb, sb, 0, 0);
      const wa = this._wcA;
      gl.uniform4f(u.uWc, wrap(wa[0] * gcx + wa[1] * gcy + WC_RATE[0] * t), wrap(wa[2] * gcx + wa[3] * gcy + WC_RATE[1] * t),
        wrap(-sh.k * (gcx * sd[0] + gcy * sd[1])), this._k0inv);
      gl.uniform4f(u.uWcA, wa[0], wa[1], wa[2], wa[3]);
      gl.uniform4f(u.uFishK, fl[0] ? fl[0].alpha : 0, fl[1] ? fl[1].alpha : 0, 0, 0);
      gl.uniform4f(u.uBand1, fl[0] ? fl[0].y0 - R.y : 0, fl[0] ? fl[0].y1 - R.y : 0, 26, 0);
      gl.uniform4f(u.uBand2, fl[1] ? fl[1].y0 - R.y : 0, fl[1] ? fl[1].y1 - R.y : 0, 26, 0);
      gl.uniform3f(u.uSss, c[15], c[16], c[17]); gl.uniform3f(u.uBed, c[18], c[19], c[20]);
      gl.uniform3f(u.uLow0, c[27], c[28], c[29]); gl.uniform3f(u.uLow1, c[30], c[31], c[32]); gl.uniform3f(u.uLow2, c[33], c[34], c[35]);
      gl.uniform4fv(u.uLowA, this._lowA);
      this._bind(gl, u.uWA, this.tex.a.t);
      this._bind(gl, u.uWB, this.tex.b.t);
      this._bind(gl, u.uFoam, this.tex.foam.t);
      this._bind(gl, u.uLut, this.tex.lut.t);
      if (this._fishTex) this._bind(gl, u.uFish, this._fishTex.t);
    } else {
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

  /** human-readable cost summary (texture fetches per pixel, uniform vectors, memory, mesh sizes) */
  info() {
    return Object.assign({ shader: this.isShader, ready: this.ready, quality: this.quality, palette: this.paletteName, field: [this.fnx, this.fny],
      fieldScale: this.fieldScale || 1, crashPoints: this.crashPoints ? this.crashPoints.length : 0, drawsFish: this.drawsFish,
      ringsPacked: this._pkN, openEdges: this.openEdges, sig: this.sig }, this.stats);
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this._pending = null;
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

/** static cost of every shader variant (no GL needed): texture fetches and fragment uniform vectors */
export function waterShaderCosts() {
  const out = {};
  for (const v of Object.keys(VARIANTS)) {
    const src = fragSource(v);
    out[v] = { fetches: countFetches(src), fragUniformVectors: countUniformVectors(src) };
  }
  return out;
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
