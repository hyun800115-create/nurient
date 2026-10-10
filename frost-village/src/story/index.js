// story_runtime module descriptor (docs/v5_v8_plan.md §5.2, §6.1). ModuleHost (src/kit, lead-owned) constructs
// the module when its gate opens (읍), ticks it, saves its slice and passes the slice through untouched while it
// is not constructed. The view (Phaser) is attached lazily so Node tests and the worker never load Phaser.

import { StoryHost } from './host.js';
import { sanitizeSlice, SLICE_KEY, SLICE_CAP, SLICE_VERSION } from './save.js';
import { STORY_TUNING } from './tuning.js';

// ---------------------------------------------------------------- late art per set piece (critique H8, M1)
// townfolk2 pages hold one age group each (head_0: faces, hats, crowns and veils for every age). A set piece asks only
// for the age groups it dresses or animates with townfolk2 (sit / clap / sad / push, wedding and mourning clothes),
// most important first, within the texture headroom the kit gives it; people of other ages stay in their everyday
// look and v4 anims (the view's plain fallback: sit → idle, clap → happy, sad → idle, push → walk).
export const TF2_PAGES = {
  head: ['tf2_head_0'],
  child: ['tf2_child_slim_0', 'tf2_child_slim_1'],
  adult: ['tf2_adult_slim_0', 'tf2_adult_slim_1', 'tf2_adult_slim_2'],
  elder: ['tf2_elder_slim_0', 'tf2_elder_slim_1', 'tf2_elder_slim_2'],
};
/** RGBA MiB of each group's pages (assets/townfolk2 page sizes × 4 bytes) */
export const TF2_MIB = { head: 4.9, child: 12.8, adult: 31.2, elder: 23.5 };
/** the age groups each set piece dresses with townfolk2, in order of importance (the couple, the family first) */
export const BEAT_AGES = {
  proposal: ['adult'], wedding: ['adult', 'child', 'elder'], farewell: ['adult', 'elder'], lastday: ['elder'], wish: ['elder'],
  birth: ['adult'], stroller: ['adult'], outdoor: ['child'], birthday: ['adult', 'child'], date: ['adult'],
};
/** the other late files of a set piece (life2 props and items, the stroller atlases, bgm) and their RGBA MiB */
const LATE = {
  proposal: { list: [['life2', { only: ['life2_items'] }]], mib: 0.03 },
  wedding: { list: [['life2', { only: ['life2_wedding', 'life2_decor', 'life2_items'] }], ['audio3', { audio: ['bgm_wedding'] }]], mib: 1.96 },
  farewell: { list: [['life2', { only: ['life2_memorial', 'life2_items'] }], ['audio3', { audio: ['bgm_farewell'] }]], mib: 0.47 },
  birth: { list: [['life2', { only: ['life2_decor', 'life2_items', 'l2_baby_stroller', 'l2_baby_stroller_pink'] }]], mib: 2.43 },
  stroller: { list: [['life2', { only: ['l2_baby_stroller', 'l2_baby_stroller_pink'] }]], mib: 2.1 },
  goodnews: { list: [['life2', { only: ['life2_decor'] }]], mib: 0.3 },
  school: { list: [['life2', { only: ['life2_decor'] }]], mib: 0.3 },
  outdoor: { list: [['life2', { only: ['life2_decor'] }]], mib: 0.3 },
  birthday: { list: [['life2', { only: ['life2_items'] }]], mib: 0.03 },
  wish: { list: [], mib: 0 }, lastday: { list: [], mib: 0 },
};

/**
 * the late files a set piece needs: { list: [[fragment, { only, audio }]], ages: [granted age groups], mib }.
 * opts.ages: the age groups of the cast (default: the kind's BEAT_AGES); opts.budgetMiB: the texture headroom the kit
 * has (Residency: must − 10 − resident). Ages are granted in order while they fit; a set piece with none plays in
 * everyday clothes.
 */
export function beatPlan(kind, opts = {}) {
  const want = (Array.isArray(opts.ages) ? opts.ages : BEAT_AGES[kind] || []).filter((a, i, l) => TF2_PAGES[a] && a !== 'head' && l.indexOf(a) === i);
  const late = LATE[kind] || { list: [], mib: 0 };
  const budget = Number.isFinite(opts.budgetMiB) ? opts.budgetMiB : 40;          // plan §6.1: transient ≤ +40 MiB
  let mib = late.mib;
  const ages = [];
  for (const a of want) {
    const add = TF2_MIB[a] + (ages.length ? 0 : TF2_MIB.head);
    if (mib + add > budget) continue;
    ages.push(a); mib += add;
  }
  const pages = ages.length ? TF2_PAGES.head.concat(...ages.map((a) => TF2_PAGES[a])) : [];
  const list = late.list.slice();
  if (pages.length) list.push(['townfolk2', { only: pages }]);
  return { list, ages, mib: Math.round(mib * 10) / 10 };
}

// what the pictures and sounds of the story need, as Assets.loadFragment(scene, name, { only, audio }) calls
export const FRAGMENTS = {
  /** near 읍: the story card, the newspaper, the person card icons, the everyday sounds */
  gate: [
    ['fx_city', { only: ['ui4_icons', 'ui_story_card', 'ui_story_card_news', 'ui_newspaper', 'ui_newspaper_masthead', 'ui_newspaper_logo', 'ui_newspaper_logo_en',
      'ui_newspaper_column', 'ui_newspaper_photo', 'ui_newspaper_divider', 'fx_memory_sparkle'] }],
    ['life2', { only: ['life2_items'] }],
    ['audio6', { audio: ['sfx_newspaper'] }],
    ['audio3', { audio: ['sfx_bell_hall', 'sfx_school_bell', 'sfx_baby_giggle'] }],
  ],
  small: [],
};
for (const k of Object.keys(LATE)) FRAGMENTS[k] = beatPlan(k).list;

export const MODULE = {
  id: 'story', version: SLICE_VERSION,
  saveKey: SLICE_KEY, capBytes: SLICE_CAP,
  needs: [],
  /** v5 starts at 읍 (rank 2): the proposal, the HUD, the life arc */
  gate: (gs) => !!(gs && gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2),
  /** fragments the story wants near its gate; the set pieces ask for theirs per beat (beatPlan) */
  prefetch: (gs, assets) => { if (assets && assets.fragment) for (const [name, o] of FRAGMENTS.gate) assets.fragment(name, o); },
  /** the late files a set piece needs (the kit acquires them when the beat is booked, releases ~60 s after it ends) */
  beatAssets: (kind, opts) => (FRAGMENTS[kind] && !opts ? FRAGMENTS[kind] : beatPlan(kind, opts).list),
  beatPlan,
  /** ports: the kit's Ports (see ports.js); saved: the slice; opts.view: a view factory (scene, art) -> StoryLife */
  create: (ports, saved, opts = {}) => {
    const host = new StoryHost(ports, saved, Object.assign({ tuning: (opts.balance && opts.balance.story) || STORY_TUNING }, opts));
    host.start().catch((e) => host.emit('error', { msg: String(e && e.stack || e) }));
    if (opts.view) host.attachView(opts.view(host));
    return host;
  },
  sanitize: sanitizeSlice,
  /**
   * the designer preview menu (이야기 미리보기, §5.8, the version label tapped 5 times): each entry finds its own cast
   * near the camera, takes the ceremony slot, plays the real scene in preview mode (no stone kept, no cards, no saves,
   * no module events) and resolves when it ends (false when it could not play: nobody around, the stage busy).
   */
  previews: {
    proposal: (host) => (host.view ? host.view.preview('proposal') : Promise.resolve(false)),
    wedding: (host) => (host.view ? host.view.preview('wedding') : Promise.resolve(false)),
    baby: (host) => (host.view ? host.view.preview('birth') : Promise.resolve(false)),
    school: (host) => (host.view ? host.view.preview('school') : Promise.resolve(false)),
    wish: (host) => (host.view ? host.view.preview('wish') : Promise.resolve(false)),
    farewell: (host) => (host.view ? host.view.preview('farewell') : Promise.resolve(false)),
  },
};

export { StoryHost };
