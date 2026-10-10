// The lab's stand-in piece of world with the real finished art: the same building ids / keys as standin.mjs (so the
// story adopts the same town), placed as a small snowy town square — our 마을회관 with room for the wedding layout
// in front, the fountain, the school, the clinic, the café, the bookstore, the playground, homes and our memorial
// garden — plus snowy pines, street lights, benches and drifts. Positions are lab world px (sprite anchors).

import { BUILDINGS } from '../standin.mjs';

const POS = {
  v_hall: [940, 760], t_fountain: [1290, 1210], t_school: [1960, 800], t_clinic: [2120, 1470], t_cafe: [520, 1500],
  t_book: [1500, 1830], t_play: [860, 1760], v_garden: [1040, 2190], t_apt1: [2620, 960], t_apt2: [2800, 1720],
  t_th1: [330, 2080], t_th2: [1820, 2400], t_th3: [2450, 2160],
};

export const LAB_BUILDINGS = BUILDINGS.map((b) => Object.assign({}, b, { x: POS[b.id][0], y: POS[b.id][1] }));
export const LAB_BYID = Object.fromEntries(LAB_BUILDINGS.map((b) => [b.id, b]));
export const WORLD_W = 3300, WORLD_H = 2800;

// decor: [key, x, y, flipX]
const DECOR = [
  ['tree_pine_snow', 150, 560], ['tree_pine_snow', 330, 470], ['tree_pine_a', 90, 820, 1], ['tree_pine_snow', 1420, 470], ['tree_pine_b', 1540, 560],
  ['tree_pine_snow', 3080, 640], ['tree_pine_snow', 3150, 1180, 1], ['tree_pine_snow', 100, 1500], ['tree_pine_a', 160, 1720], ['tree_pine_snow', 1180, 2540],
  ['tree_pine_snow', 640, 2420, 1], ['tree_pine_b', 2240, 2620], ['tree_pine_snow', 3100, 2350], ['tree_pine_snow', 1420, 2250],
  ['tree_pine_snow', 700, 2060, 1], ['tree_pine_a', 1330, 2140],
  ['streetlight', 1100, 1080], ['streetlight', 1520, 1360], ['streetlight', 760, 1290], ['streetlight', 1700, 1110],
  ['bench_x', 1520, 1160], ['bench_y', 1060, 1330], ['bench_x', 1260, 1560],
  ['bush_snow', 1180, 1040], ['bush_snow', 1440, 1050], ['bush_snow', 830, 2090], ['bush_snow', 1250, 2110],
  ['snow_pile_a', 1640, 1300], ['snow_pile_b', 600, 1100], ['snow_pile_a', 2400, 1250], ['snow_pile_b', 1980, 2050],
];
const DECALS = [
  ['decal_snow_drift_a', 1700, 1640], ['decal_snow_drift_b', 600, 1980], ['decal_footprints', 1180, 1440], ['decal_snow_drift_a', 2500, 1450],
  ['decal_footprints', 1680, 1060], ['decal_snow_drift_b', 350, 1200], ['decal_puddle_ice', 1500, 1450],
];
export const LAB_BENCHES = DECOR.filter((d) => /^bench_/.test(d[0])).map(([key, x, y]) => ({ key, x, y }));
export const LAMPS = DECOR.filter((d) => d[0] === 'streetlight').map(([, x, y]) => ({ x, y: y - 141 }));
export const DECOR_KEYS = [...new Set(DECOR.map((d) => d[0]).concat(DECALS.map((d) => d[0])))];

/** draw the ground, the buildings and the decor into the world scene */
export function buildWorld(scene, art) {
  // the snow ground: plain 512 px tiles (a TileSprite this size would allocate a 4100 x 3600 texture)
  for (let y = -400; y < WORLD_H + 400; y += 512) for (let x = -400; x < WORLD_W + 400; x += 512) scene.add.image(x, y, 'ground_snow').setOrigin(0, 0).setDepth(-2e6);
  for (const [k, x, y] of DECALS) { const d = art.image(scene, x, y, k); if (d) d.setDepth(-1e6 + y).setAlpha(0.9); }
  const out = { buildings: [], decor: [] };
  for (const b of LAB_BUILDINGS) {
    const img = art.image(scene, b.x, b.y, b.key);
    if (!img) continue;
    img.setDepth(b.y);
    const def = art.def(b.key);
    if (def && def.anims) { const an = Object.keys(def.anims)[0]; if (b.key === 'park_fountain' || b.key === 'school') art.play(img, b.key, def.anims.water ? 'water' : an); }
    out.buildings.push(img);
    b.depth = b.y;
  }
  for (const [k, x, y, flip] of DECOR) { const d = art.image(scene, x, y, k); if (d) { d.setDepth(y); if (flip) d.setFlipX(true); out.decor.push(d); } }
  return out;
}

/** a building's named point in world px ('doorPoint', 'gatherPoints' i …) */
export function pointOf(art, id, name, i = 0) {
  const b = LAB_BYID[id];
  if (!b) return null;
  const d = art.def(b.key);
  if (!d || !d[name]) return { x: b.x, y: b.y + 60 };
  const v = Array.isArray(d[name][0]) ? d[name][i % d[name].length] : d[name];
  return { x: b.x + v[0], y: b.y + v[1] };
}
