// The title screen's own little memory (never the game save): has the intro been seen, which growth stage
// the title showed last time (so it can play "the village grew" once when the save moved on), and the
// player's intro choice. Every storage access is wrapped: private mode / full quota never break the title.
import { TITLE_CFG } from './config.js';

function store() { try { return window.localStorage || null; } catch (e) { return null; } }

export const TitlePrefs = {
  data: { introSeen: false, shown: 0, intro: null },

  load() {
    try {
      const st = store();
      const raw = st && st.getItem(TITLE_CFG.prefsKey);
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j === 'object') {
        this.data.introSeen = j.introSeen === true;
        this.data.shown = Number.isFinite(j.shown) ? Math.max(0, Math.min(4, Math.floor(j.shown))) : 0;
        this.data.intro = j.intro === 'always' || j.intro === 'never' || j.intro === 'first' ? j.intro : null;
      }
    } catch (e) { /* defaults */ }
    return this.data;
  },

  save() {
    try { const st = store(); if (st) st.setItem(TITLE_CFG.prefsKey, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },

  /** should the first-run intro play now? (?intro=1 / ?intro=0 > player's choice > TITLE_CFG.introMode) */
  wantIntro() {
    try {
      const q = new URLSearchParams(window.location.search).get('intro');
      if (q === '1') return true;
      if (q === '0') return false;
    } catch (e) { /* no URL */ }
    const mode = this.data.intro || TITLE_CFG.introMode;
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    return !this.data.introSeen;
  },

  /** the settings panel can offer "intro: once / always / never" with this */
  setIntroMode(mode) { this.data.intro = mode === 'always' || mode === 'never' ? mode : 'first'; this.save(); },
};

/** the OS / browser asks for less motion: static diorama, fades only */
export function prefersReducedMotion() {
  try {
    if (new URLSearchParams(window.location.search).get('motion') === '0') return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { return false; }
}

/** a phone that says it has little memory (Chrome / Android only report this) */
export function lowMemoryDevice() {
  try { const m = navigator.deviceMemory; return typeof m === 'number' && m > 0 && m <= 2; } catch (e) { return false; }
}
