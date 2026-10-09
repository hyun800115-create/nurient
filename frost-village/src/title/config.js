// =====================================================================
//  Title screen settings — the ONE place for the game's name and the title-screen knobs.
//  (게임 이름은 여기 한 곳에서만 바꿉니다. tools/title/apply_name.mjs 가 index.html,
//   manifest.webmanifest, strings.js 의 이름도 같은 값으로 맞춰 줍니다.)
// =====================================================================

/** the game's name, everywhere the title modules show it */
export const TITLE_NAME = {
  ko: '행복한 눈꽃마을 이야기',     // full Korean title (logo, store)
  koLines: ['행복한', '눈꽃마을 이야기'],   // how the text logo breaks it into two lines
  koShort: '눈꽃마을',               // home-screen / short name
  en: 'Snowbloom Village',           // English store title
  enLines: ['Snowbloom', 'Village'],
  enShort: 'Snowbloom',
  tagline: { ko: '작은 캠프가 눈꽃 도시가 되기까지', en: 'From a tiny camp to a snowy city' },
};

/** name for a language ('ko' | 'en'); `short` for the compact form */
export function titleName(lang, short) {
  if (lang === 'en') return short ? TITLE_NAME.enShort : TITLE_NAME.en;
  return short ? TITLE_NAME.koShort : TITLE_NAME.ko;
}

export const TITLE_CFG = {
  // where the baked diorama lives (tools/title/bake_title.mjs writes it). Move the folder and change
  // this one path if the build should ship it under assets/ (see docs/build_reports/title_code.md).
  bakeBase: 'src/title/bake/',
  bakeManifest: 'title_bake.json',
  // optional art from the title_art agent (logo, backdrop, fx). Missing files = built-in fallbacks.
  artBase: 'assets/title/',
  artManifest: 'manifest.json',

  // first-run intro (seconds). Tap skips to the logo.
  intro: {
    stageStart: [0.35, 2.55, 5.0, 7.55],   // when each growth stage begins
    logoAt: 9.85,                          // logo drop-in
    tapAt: 10.9,                           // "터치하여 시작" appears
    end: 11.6,                             // hand over to the idle title
    maxWaitSec: 2.5,                       // if a stage's pictures are late, wait at most this long
  },
  // growth shown on the idle title when the save reached a stage the title has not shown yet
  growSec: 2.6,
  // idle title time of day: 'night' | 'dusk' | 'day' | 'real' (the phone's clock)
  idleTime: 'night',
  // localStorage key of the title's own little memory (intro seen, last stage shown). Never the save.
  prefsKey: 'frostVillage.title.v1',
  // texture budget guard: stages above this are not loaded on phones that report little memory
  lowMemStageCap: 4,
};
