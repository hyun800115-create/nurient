// (v4.2 CODE-2, docs/v42_plan.md §1 guardrail 1, §16.2) when the v4.2 art comes in — never at boot:
//   v42_core   the chief's halo / navigator art (assets/chief_fx) + the v4.2 HUD icons (assets/ui5), ONE packed page;
//              their manifests ride inside _packed/index.json, so after the FIRST SALE exactly one file is fetched
//              (until then the halo is the generated ring of minute 0: the first loop asks the server for exactly
//              what v4.1 asked for)
//   chief2     the chief's seated / social anims (assets/chief2): the manifest once the village is complete (관망,
//              촌장 응원) or the office stands; the sheet itself only while one of its anims plays (Residency, on demand)
// The train2 cars come with the station (Neighbours), the office art with its site and the officefolk staff with the
// office (Office), the audio7 sounds with what plays them.

import { Assets } from '../../core/Assets.js';

export class V42Art {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.core = false;
    this.chief2 = false;
    this.t = 0;
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const gs = this.gs, v = this.v42;
    // after the first sale (the economy's earned counter: the same mark the request-log guardrail test uses), or at
    // once in a save past the first loop (earned counts this session only)
    // ((CODE-2) 3 s after that sale: the coins fly first, and the one new file never races the sale's own frames)
    const pr = gs.progress;
    if (!this.core && gs.economy && this.saleT === undefined && (pr && pr.isDone && pr.isDone('hire_fisherman'))) this.saleT = 0;
    if (!this.core && gs.economy && this.saleT === undefined && (gs.economy.earned || 0) > 0) this.saleT = 3;
    if (!this.core && this.saleT !== undefined && (this.saleT -= 0.5) < 0) {
      this.core = true;
      Assets.loadFragment(gs, 'chief_fx', { only: ['chief_fx'] });
      Assets.loadFragment(gs, 'ui5', { only: ['ui5_icons'] });
    }
    if (!this.chief2 && (v.complete || (v.office && v.office.built))) {
      this.chief2 = true;
      Assets.loadFragment(gs, 'chief2', {});
    }
  }

  state() { return { core: this.core, coreArt: Assets.has('chief_halo'), icons: Assets.has('ui_icon_binoculars'), chief2: this.chief2, chief2Sheet: !!(this.gs.textures && this.gs.textures.exists('char_player_b')) }; }
}
