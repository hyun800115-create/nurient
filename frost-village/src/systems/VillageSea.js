// (v4-C2) The village sea as a Water.js region (docs/build_reports/water.md §6.2), shared by the game
// (Ground.makeSea) and the field bake tool (tools/fx/gen_water_field.mjs), so the baked shoreline field's
// signature matches the region the game asks for.
//
// It is WaterPresets.village (the old sea rectangle: y -200 down to the lowest shore + 40, the snow-bank coast,
// the winter palette), widened to the west strip of v4-C (world.js WORLD.left < 0: the land and its coast go on
// at negative x, so the sea must too).
import { WaterPresets } from './Water.js';
import { WORLD, shoreY } from '../data/world.js';

/** world x where the map starts (the west strip lies at negative x) */
export function worldLeft() { return Math.min(0, Math.floor(Number(WORLD.left) || 0)); }

/** the Water options of the village sea (region, mask, shore type, palette) */
export function villageSeaPreset() {
  const p = WaterPresets.village(WORLD.width, shoreY);
  const X0 = worldLeft();
  if (X0 < 0) {
    // the preset scans the shore from x 0; the west strip's coast stays above the eastern bay's lowest point,
    // but take it into account anyway
    let maxShore = 0;
    for (let x = X0; x <= WORLD.width; x += 8) maxShore = Math.max(maxShore, shoreY(x));
    const h = Math.max(p.region.h, Math.ceil(maxShore + 40) + 200);
    p.region = { x: X0, y: p.region.y, w: WORLD.width - X0, h };
  }
  return p;
}

/** the two fish-school bands of the old tileSprites (world px); Water draws them UNDER its surface */
export const FISH_BANDS = [
  { y0: 40, y1: 240, alpha: 0.55, scale: 1, speed: [22, 0], offset: [0, 0], wobble: [5, 0.7] },
  { y0: 150, y1: 350, alpha: 0.35, scale: 0.8, speed: [14, 0], offset: [130, 40], wobble: [0, 0] },
];
