// story_runtime module descriptor (docs/v5_v8_plan.md §5.2, §6.1). ModuleHost (src/kit, lead-owned) constructs
// the module when its gate opens (읍), ticks it, saves its slice and passes the slice through untouched while it
// is not constructed. The view (Phaser) is attached lazily so Node tests and the worker never load Phaser.

import { StoryHost } from './host.js';
import { sanitizeSlice, SLICE_KEY, SLICE_CAP, SLICE_VERSION } from './save.js';
import { STORY_TUNING } from './tuning.js';

// what the pictures and sounds of the story need, as Assets.loadFragment(scene, name, { only, audio }) calls
const TF2 = ['tf2_head_0', 'tf2_child_slim_0', 'tf2_child_slim_1', 'tf2_adult_slim_0', 'tf2_adult_slim_1', 'tf2_adult_slim_2', 'tf2_elder_slim_0', 'tf2_elder_slim_1', 'tf2_elder_slim_2'];
export const FRAGMENTS = {
  /** near 읍: the story card, the newspaper, the person card icons, the everyday sounds */
  gate: [
    ['fx_city', { only: ['ui4_icons', 'ui_story_card', 'ui_story_card_news', 'ui_newspaper', 'ui_newspaper_masthead', 'ui_newspaper_logo', 'ui_newspaper_logo_en',
      'ui_newspaper_column', 'ui_newspaper_photo', 'ui_newspaper_divider', 'fx_memory_sparkle'] }],
    ['life2', { only: ['life2_items'] }],
    ['audio6', { audio: ['sfx_newspaper'] }],
    ['audio3', { audio: ['sfx_bell_hall', 'sfx_school_bell', 'sfx_baby_giggle'] }],
  ],
  proposal: [['townfolk2', { only: TF2 }]],
  wedding: [['life2', { only: ['life2_wedding', 'life2_decor', 'life2_items'] }], ['townfolk2', { only: TF2 }], ['audio3', { audio: ['bgm_wedding'] }]],
  farewell: [['life2', { only: ['life2_memorial', 'life2_items'] }], ['townfolk2', { only: TF2 }], ['audio3', { audio: ['bgm_farewell'] }]],
  lastday: [['townfolk2', { only: TF2 }]],
  birth: [['life2', { only: ['life2_decor', 'life2_items'] }], ['townfolk2', { only: TF2 }]],
  stroller: [['townfolk2', { only: TF2 }]],
  school: [['life2', { only: ['life2_decor'] }]],
  small: [],
};

export const MODULE = {
  id: 'story', version: SLICE_VERSION,
  saveKey: SLICE_KEY, capBytes: SLICE_CAP,
  needs: [],
  /** v5 starts at 읍 (rank 2): the proposal, the HUD, the life arc */
  gate: (gs) => !!(gs && gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2),
  /** fragments the story wants near its gate; the set pieces ask for theirs per beat (FRAGMENTS below) */
  prefetch: (gs, assets) => { if (assets && assets.fragment) for (const [name, o] of FRAGMENTS.gate) assets.fragment(name, o); },
  /** the late files a set piece needs (the kit acquires them when the beat is booked, releases ~60 s after it ends) */
  beatAssets: (kind) => FRAGMENTS[kind] || FRAGMENTS.small,
  /** ports: the kit's Ports (see ports.js); saved: the slice; opts.view: a view factory (scene, art) -> StoryLife */
  create: (ports, saved, opts = {}) => {
    const host = new StoryHost(ports, saved, Object.assign({ tuning: (opts.balance && opts.balance.story) || STORY_TUNING }, opts));
    host.start().catch((e) => host.emit('error', { msg: String(e && e.stack || e) }));
    if (opts.view) host.attachView(opts.view(host));
    return host;
  },
  sanitize: sanitizeSlice,
  /** the designer preview menu (이야기 미리보기, §5.8): each plays a beat on a throwaway copy, never saves */
  previews: {
    proposal: (host) => host.view && host.view.preview('proposal'),
    wedding: (host) => host.view && host.view.preview('wedding'),
    baby: (host) => host.view && host.view.preview('birth'),
    school: (host) => host.view && host.view.preview('school'),
    wish: (host) => host.view && host.view.preview('wish'),
    farewell: (host) => host.view && host.view.preview('farewell'),
  },
};

export { StoryHost };
