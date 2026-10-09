// The Ground.js integration of src/systems/Water.js (CONTRACT_V7 section V), as exact text patches.
//
// docs/build_reports/water.md quotes these patches. `node tools/test/water_lab.mjs ingame` serves the
// PATCHED copies of the game files to a headless browser (Playwright route interception: the files in
// src/ are never written) and boots the real game with them, so the integration is proven in the real
// game (real camera, View.k / devicePixelRatio, zoom, lazy ground tiles, decor, depth sort).
//
// Each patch = [file, find, replace]. apply(file, src) returns { code, missing } (missing = anchors that
// were not found, e.g. after someone edited the file: the report then names them).

export const PATCHES = [
  // ---------------------------------------------------------------- Assets.js: load the water fragment
  ['src/core/Assets.js',
    `'ui2', 'audio2', 'workers', 'pets2'];`,
    `'ui2', 'audio2', 'workers', 'pets2', 'water'];`],
  // its effect sheets are after-title files, and the Game's lazy gate lets through only the ones a system
  // asked for (WaterSheets.want): the village never decodes the beach-only sheets
  ['src/core/Assets.js',
    `const LAZY_KEY = /^fx_(build_dust|build_done|wake|wake_ring|fire_big)$/;`,
    `const LAZY_KEY = /^fx_(build_dust|build_done|wake|wake_ring|fire_big|wave_crash|splash_small|splash_big|swim_ripple|wake_v2(_[a-z]+)?|sparkle_water|shore_wave_[xy])$/;`],

  // ---------------------------------------------------------------- Ground.js
  ['src/systems/Ground.js',
    `import { rng } from '../core/Placeholders.js';`,
    `import { rng } from '../core/Placeholders.js';
import { Water, WaterPresets, bakedField, suggestWaterQuality } from './Water.js';
import { Settings } from '../core/Save.js';

// the two fish-school bands of the old tileSprites (world px); Water draws them UNDER its surface
const FISH_BANDS = [
  { y0: 40, y1: 240, alpha: 0.55, scale: 1, speed: [22, 0], offset: [0, 0], wobble: [5, 0.7] },
  { y0: 150, y1: 350, alpha: 0.35, scale: 0.8, speed: [14, 0], offset: [130, 40], wobble: [0, 0] },
];`],
  ['src/systems/Ground.js',
    `    // --- sea (live, scrolling)
    const seaH = Math.ceil(maxShore + 40);
    this.sea = gs.add.tileSprite(0, -200, W, seaH + 200, Assets.sprite('water_sea').tex).setOrigin(0, 0).setDepth(DEPTH.WATER);
    this.fish1 = null; this.fish2 = null;
    const fs = Assets.sprite('fish_school');
    this.fish1 = gs.add.tileSprite(0, 40, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.55);
    this.fish2 = gs.add.tileSprite(0, 150, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.35).setTilePosition(130, 40);
    this.fish2.setTileScale(0.8, 0.8);
    this.t = 0;`,
    `    // --- sea (v7): living water (src/systems/Water.js) — swells, ripples, glints, depth colour, the fish
    // under the surface and the live shore foam. Its shoreline field is baked (assets/water/field_village.png,
    // tools/fx/gen_water_field.mjs). Canvas renderer / no water textures: Water falls back to the old
    // scrolling water_sea tileSprite (this.sea) and the fish stay tileSprites.
    const wm = gs.cache.json.exists('manifest_water') ? gs.cache.json.get('manifest_water') : null;
    this.water = new Water(gs, Object.assign(WaterPresets.village(W, shoreY), {
      quality: Settings.data.water || suggestWaterQuality(gs.sys.renderer && gs.sys.renderer.gl),   // '물결 품질'
      fish: FISH_BANDS,
      fishKey: Assets.sprite('fish_school').tex,
      manifest: wm,
      baked: bakedField(gs, wm, 'village'),
    }));
    this.sea = this.water.fallback || null;
    this.liveShore = this.water.isShader;       // the shallows + shore foam are drawn live, not baked
    this.fish1 = null; this.fish2 = null;
    this.syncFish();
    this.t = 0;`],
  ['src/systems/Ground.js',
    `  /** bake the tiles around the camera view (\`max\` per call; Infinity = all that are needed now) */`,
    `  /** fish schools: under the water surface (Water, high quality) or the old tileSprites over it */
  syncFish() {
    const want = !this.water.drawsFish;
    if (want && !this.fish1) {
      const fs = Assets.sprite('fish_school'), gs = this.gs, W = this.W;
      this.fish1 = gs.add.tileSprite(0, 40, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.55);
      this.fish2 = gs.add.tileSprite(0, 150, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.35).setTilePosition(130, 40);
      this.fish2.setTileScale(0.8, 0.8);
    } else if (!want && this.fish1) {
      this.fish1.destroy(); this.fish2.destroy();
      this.fish1 = null; this.fish2 = null;
    }
  }

  /** settings '물결 품질': 'high' | 'low' */
  setWaterQuality(q) {
    this.water.setQuality(q);
    this.syncFish();
  }

  /** bake the tiles around the camera view (\`max\` per call; Infinity = all that are needed now) */`],
  ['src/systems/Ground.js',
    `    if (y0 < tileShoreMax + 20) this.drawShallow(ctx, x0, y0, w, h);`,
    `    if (y0 < tileShoreMax + 20 && !this.liveShore) this.drawShallow(ctx, x0, y0, w, h);`],
  ['src/systems/Ground.js',
    `    ctx.strokeStyle = 'rgba(156,199,230,0.55)'; ctx.lineWidth = 5; line(-6); ctx.stroke();
    ctx.restore();`,
    `    if (!this.liveShore) { ctx.strokeStyle = 'rgba(156,199,230,0.55)'; ctx.lineWidth = 5; line(-6); ctx.stroke(); }
    ctx.restore();
    if (this.liveShore) return;                 // Water draws the foam lace, slush and wet edge live`],
  ['src/systems/Ground.js',
    `    this.sea.tilePositionX = this.t * 6;
    this.sea.tilePositionY = Math.sin(this.t * 0.4) * 6;`,
    `    this.water.update(dt);                      // (also scrolls the fallback tileSprite)`],

  // ---------------------------------------------------------------- Game.js: water sheets on demand
  ['src/scenes/Game.js',
    `import { Ground } from '../systems/Ground.js';`,
    `import { Ground } from '../systems/Ground.js';
import { WaterSheets } from '../systems/Water.js';`],
  ['src/scenes/Game.js',
    `    const pr = this.progress, f = Assets.fragOf[k];
    if (!pr) return true;`,
    `    const pr = this.progress, f = Assets.fragOf[k];
    if (f === 'water') return WaterSheets.allowed(k);     // (v7) only the water effect sheets a system asked for
    if (!pr) return true;`],
  // ---------------------------------------------------------------- Game.js: decor in the sea bobs with the swell
  ['src/scenes/Game.js',
    `      if ((key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10) {
        this.tweens.add(`,
    `      const wv = this.ground.water;
      if (key === 'dock_pier' && wv && wv.isShader) {
        // (v7) the pier's posts stand in the water: foam collars + the deck's shadow on the water
        for (const [mx, my] of [[-0.92, 0.7], [0.92, 0.7], [-0.92, 2.2], [0.92, 2.2]]) {
          const px = x + 45.25 * (mx + my), py = y + 22.63 * (mx - my);
          if (wv.shoreDistance(px, py) > 4) wv.addContact(px, py, 7, { foam: 0.85, shadow: 0.1 });
        }
        wv.addContact(x, y, 30, { foam: 0, shadow: 0.2 });
      }
      if ((key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10 && wv && wv.isShader) {
        (this.floaters = this.floaters || []).push({ img, x, y, tilt: key === 'boat_small' ? 0.3 : 0.15, rot: img.rotation || 0 });
        const s = (o && o.scale) || 1;
        if (key === 'boat_small') { wv.addContact(x - 34 * s, y - 17 * s, 32 * s, { foam: 0.75, shadow: 0.22 }); wv.addContact(x + 34 * s, y + 17 * s, 32 * s, { foam: 0.75, shadow: 0.22 }); }
        else wv.addContact(x, y + 2, 26 * s, { foam: 0.6, shadow: 0.12 });
      } else if ((key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10) {
        this.tweens.add(`],
  ['src/scenes/Game.js',
    `    this.ground.update(dt);
    p.update(dt, inp);`,
    `    this.ground.update(dt);
    if (this.floaters) {
      const wv = this.ground.water, sl = this._floatSlope || (this._floatSlope = { x: 0, y: 0 });
      for (const f of this.floaters) {
        if (!f.img.active || !this.isOnScreen(f.x, f.y, 120)) continue;
        wv.slopeAt(f.x, f.y, undefined, sl);
        f.img.setPosition(f.x, f.y - wv.heightAt(f.x, f.y)).setRotation(f.rot + Math.max(-0.12, Math.min(0.12, -sl.x * f.tilt)));
      }
    }
    p.update(dt, inp);`],
];

/** apply every patch of `file` to its source text */
export function apply(file, src) {
  const missing = [];
  let code = src;
  for (const [f, find, rep] of PATCHES) {
    if (f !== file) continue;
    if (code.indexOf(find) < 0) { missing.push(find.split('\n')[0].trim().slice(0, 90)); continue; }
    code = code.replace(find, rep);
  }
  return { code, missing };
}

export const FILES = [...new Set(PATCHES.map((p) => p[0]))];
