// The lab's Residency stand-in for incidents_runtime's art groups (`incident:<art>`, patch P4): the cityfolk pages
// (cfPages), the fx_city lazy sheets and the civic / vehicles / logistics atlases each group lists (model/scripts.js
// ART) are fetched when a group is wanted and taken out of GPU memory when no wanted group needs them any more
// (the director drops a group 15 s after its scene ends). A baseline stays resident (cityfolk head + loco pages, the
// fx_city core sheets, the civic props / police atlases, ui4). Every change is logged with the module's MiB.

import { Assets } from '../../../src/core/Assets.js';
import { ART } from '../../../src/city/incidents/model/scripts.js';

const BASE_PAGES = ['head', 'loco'];
const BASE_TEX = ['civ_props', 'civ_police', 'ui4_icons', 'fx_alarm_flash', 'fx_siren_glow_red', 'fx_siren_glow_blue', 'fx_question_mark'];

export class LabArt {
  constructor(scene, man, LAB) {
    this.scene = scene;
    this.man = man;                 // merged townfolk manifest (atlases + townfolk.cfPages)
    this.LAB = LAB;
    this.want = new Map();          // art -> count
    this.pages = new Set(BASE_PAGES);
    this.loading = 0;
    this.log = [];
    const P = man.townfolk.cfPages || { groups: {} };
    this.groups = P.groups;
  }

  /** a page is usable for a body base when the atlases holding that base's frames are in (a group may leave out an
   *  elder-only atlas: model/scripts.js ART[].cfSkip) */
  resident(page, base) { return this.pages.has(page) && this.groupLoaded(page, base); }
  groupLoaded(page, base) {
    const g = this.groups[page];
    if (!g) return true;
    const need = g.atlases.filter((a) => !base || !g.bases || !g.bases[a] || g.bases[a].includes(base));
    return need.every((a) => this.scene.textures.exists(a));
  }

  /** the textures an art group needs: cityfolk atlases + sheet / atlas keys */
  texOf(art) {
    const A = ART[art];
    if (!A) return { cf: [], keys: [] };
    const cf = [];
    const skip = new Set(A.cfSkip || []);
    for (const p of A.cityfolk || []) for (const a of (this.groups[p] || { atlases: [] }).atlases) if (!skip.has(a)) cf.push(a);
    return { cf, keys: (A.fx || []).concat(A.atlases || []) };
  }

  needed() {
    const cf = new Set(), keys = new Set(BASE_TEX);
    for (const p of BASE_PAGES) for (const a of (this.groups[p] || { atlases: [] }).atlases) cf.add(a);
    for (const [art, n] of this.want) if (n > 0) { const t = this.texOf(art); t.cf.forEach((a) => cf.add(a)); t.keys.forEach((k) => keys.add(k)); }
    return { cf, keys };
  }

  wantArt(art) { this.want.set(art, (this.want.get(art) || 0) + 1); this.sync('want', art); }
  dropArt(art) { this.want.set(art, Math.max(0, (this.want.get(art) || 0) - 1)); this.sync('drop', art); }

  sync(op, art) {
    const S = this.scene, L = S.load, M = Assets.m;
    const { cf, keys } = this.needed();
    // pages a sprite may use
    this.pages = new Set(BASE_PAGES);
    for (const [a, n] of this.want) if (n > 0) for (const p of (ART[a] && ART[a].cityfolk) || []) this.pages.add(p);
    // load what is missing
    let queued = 0;
    for (const a of cf) if (!S.textures.exists(a)) { const at = this.man.atlases.find((x) => x.key === a); if (at) { L.image(a, 'assets/' + at.png); L.json(a + '#tfatlas', 'assets/' + at.json); queued++; } }
    for (const k of keys) {
      if (S.textures.exists(k)) continue;
      const sh = M.spritesheets[k], at = M.atlases[k];
      if (sh) { L.spritesheet(k, 'assets/' + sh.png, { frameWidth: sh.frameWidth, frameHeight: sh.frameHeight }); queued++; }
      else if (at) { L.atlas(k, 'assets/' + at.png, 'assets/' + at.json); queued++; }
    }
    // free what nobody needs (like Residency.evictArea: the anims made from those pictures go too, they are made
    // again when the pictures come back; a live sprite still on a freed picture is a residency bug -> LAB.errors)
    const free = new Set();
    for (const a of this.man.atlases) if (/^cf_/.test(a.key) && !cf.has(a.key) && S.textures.exists(a.key)) free.add(a.key);
    for (const art2 of Object.keys(ART)) for (const k of this.texOf(art2).keys) if (!keys.has(k) && S.textures.exists(k)) free.add(k);
    const freed = Array.from(free);
    if (freed.length) {
      const inUse = new Set();
      const walk = (list) => { for (const o of list) { if (o.visible !== false && o.active !== false && o.texture && free.has(o.texture.key)) inUse.add(o.texture.key); if (o.list) walk(o.list); } };
      for (const sc of S.game.scene.getScenes(true)) walk(sc.children.list);
      for (const k of inUse) this.LAB.errors.push('freed while shown: ' + k + ' (' + op + ' ' + art + ')');
      const drop = [];
      S.game.anims.anims.each((key, a) => { if (a.frames.some((f) => free.has(f.textureKey))) drop.push(key); });
      for (const key of drop) { const a = S.game.anims.get(key); if (a && a.destroy) a.destroy(); else S.game.anims.remove(key); }
      for (const k of freed) S.textures.remove(k);
      Assets.cache.clear();
    }
    this.log.push({ t: Math.round((this.LAB.T || 0) * 10) / 10, op, art, queued, freed: freed.length });
    if (!queued) return;
    this.loading++;
    L.once('complete', () => {
      this.loading--;
      // install the tfatlas frames of new cityfolk pages; anims of new sheets; sprite anims of new atlases
      const install = { atlases: this.man.atlases.filter((a) => cf.has(a.key)) };
      for (const a of install.atlases) {
        const data = S.cache.json.get(a.key + '#tfatlas');
        if (!data) continue;
        const tex = S.textures.get(a.key), [fw, fh] = data.frameSize;
        for (const [prefix, groups] of Object.entries(data.frames)) for (const [g, v] of Object.entries(groups)) {
          const add = (name, r) => { if (!r || tex.has(name)) return; const f = tex.add(name, 0, r[0], r[1], r[2], r[3]); f.setTrim(fw, fh, r[4], r[5], r[2], r[3]); };
          if (!v.some(Array.isArray)) add(`${prefix}/${g}`, v); else v.forEach((r, i) => add(`${prefix}/${g}_${i}`, r));
        }
        S.cache.json.remove(a.key + '#tfatlas');
      }
      for (const k of keys) if (M.spritesheets[k]) Assets.sheetAnims(S.game, k);
      for (const k in M.sprites) { const d = M.sprites[k]; if (d && d.atlas && keys.has(d.atlas)) Assets.spriteAnims(S.game, k); }
      Assets.cache.clear();
      if (this.onReady) this.onReady(art);
    });
    L.start();
  }
}
