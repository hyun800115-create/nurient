// =====================================================================
//  Title screen settings — the ONE place for the game's name and the title-screen knobs.
//  (게임 이름은 여기 한 곳에서만 바꿉니다. `node tools/title/apply_name.mjs --write` 가 index.html,
//   manifest.webmanifest, strings.js 의 이름도 같은 값으로 맞춰 줍니다.)
// =====================================================================

/** the game's name, everywhere the title modules show it */
export const TITLE_NAME = {
  ko: '행복한 눈꽃마을 이야기',     // full Korean title (logo, store)
  koShort: '눈꽃마을',               // home-screen / short name
  en: 'Snowbloom Village',           // English store title
  enShort: 'Snowbloom',
  // how the built-in text logo (used until / unless assets/title has the 3D logo) splits the name:
  // a small line on top, the big chunky word, and the word on the little wooden sign
  logo: {
    ko: { top: '행복한', main: '눈꽃마을', sign: '이야기' },
    en: { top: '', main: 'Snowbloom', sign: 'Village' },
  },
  tagline: { ko: '작은 캠프가 눈꽃 도시가 되기까지', en: 'From a tiny camp to a snowy city' },
};

/** name for a language ('ko' | 'en'); `short` for the compact form */
export function titleName(lang, short) {
  if (lang === 'en') return short ? TITLE_NAME.enShort : TITLE_NAME.en;
  return short ? TITLE_NAME.koShort : TITLE_NAME.ko;
}

/** title-only texts (the game's strings.js is not touched) */
export const TITLE_TEXT = {
  ko: { tap: '터치하여 시작', click: '클릭하여 시작', skip: '탭하면 건너뛰어요', skipClick: '클릭하면 건너뛰어요', sound: '탭하면 소리가 켜져요',
    soundClick: '클릭하면 소리가 켜져요', again: '한 번 더 탭하면 건너뛰어요', againClick: '한 번 더 클릭하면 건너뛰어요', skipBtn: '건너뛰기', stages: ['', '개척', '마을', '읍', '도시'],
    stageLong: ['', '작은 개척지', '눈꽃 마을', '기찻길 읍내', '반짝이는 도시'], grew: '마을이 자랐어요!', settings: '설정',
    sfx: '효과음', music: '음악', lang: '언어', intro: '오프닝', on: '켜짐', off: '꺼짐', replay: '오프닝 다시 보기', close: '닫기',
    introModes: { first: '처음 한 번', always: '항상', never: '안 보기' } },
  en: { tap: 'Tap to start', click: 'Click to start', skip: 'Tap to skip', skipClick: 'Click to skip', sound: 'Tap for sound',
    soundClick: 'Click for sound', again: 'Tap again to skip', againClick: 'Click again to skip', skipBtn: 'Skip', stages: ['', 'Camp', 'Village', 'Town', 'City'],
    stageLong: ['', 'A tiny camp', 'Snowbloom village', 'Railway town', 'Twinkling city'], grew: 'Your village grew!', settings: 'Settings',
    sfx: 'Sound', music: 'Music', lang: 'Language', intro: 'Opening', on: 'On', off: 'Off', replay: 'Replay opening', close: 'Close',
    introModes: { first: 'Once', always: 'Always', never: 'Never' } },
};

export const TITLE_CFG = {
  // where the baked diorama lives (tools/title/bake_title.mjs writes it). Move the folder and change
  // this one path if the build should ship it under assets/ (see docs/build_reports/title_code.md).
  bakeBase: 'src/title/bake/',
  bakeManifest: 'title_bake.json',
  // optional art from the title_art agent (logo, backdrop, fx). Missing files = built-in fallbacks.
  artBase: 'assets/title/',
  artManifest: 'manifest.json',

  // first-run intro (seconds from the first frame). A tap skips to the logo.
  intro: {
    stageStart: [0.35, 2.6, 5.0, 7.5],     // when each growth stage begins (1..4)
    logoAt: 9.9,                           // logo drop-in
    tapAt: 10.9,                           // "터치하여 시작" appears
    end: 11.6,                             // hand over to the idle title
    maxWaitSec: 2.5,                       // a stage whose pictures are late holds the clock at most this long
  },
  // 'first' = the intro plays once (then the idle title), 'always', 'never'. The player's own choice
  // (TitlePrefs.data.intro) and ?intro=1 / ?intro=0 in the address win over this.
  introMode: 'first',
  // growth shown on the idle title when the save reached a stage the title has not shown yet
  growSec: 2.4,
  // idle title time of day: 'auto' (a warm dusk with the first lights for the camp and the village, the
  // starry night for the town and the city) | 'night' | 'dusk' | 'day'
  idleTime: 'auto',
  // localStorage key of the title's own little memory (intro seen, last stage shown). Never the save.
  prefsKey: 'frostVillage.title.v1',
  // phones that report little memory (navigator.deviceMemory <= 2) never load stages above this
  lowMemStageCap: 3,
  // the sounds of the intro (first key that exists is played; all are optional)
  cues: {
    pop: ['sfx_build_done', 'sfx_build', 'sfx_unlock'],
    popSmall: ['sfx_click'],
    stage: ['sfx_unlock', 'sfx_levelup'],
    train: ['sfx_steam_whistle'],
    bus: ['sfx_bus_horn'],
    ship: ['sfx_ship_horn_big'],
    gull: ['sfx_seagull_1'],
    logo: ['sfx_levelup', 'sfx_unlock'],
    whoosh: ['sfx_whoosh'],
  },
  // late (v4) sounds the title fetches itself, in the background, after its pictures (~70 KB, the game
  // reuses them from the cache): fragment -> keys
  lateCues: { audio3: ['sfx_steam_whistle', 'sfx_bus_horn'], audio4: ['sfx_ship_horn_big', 'sfx_seagull_1'] },
};

/** screen layout of the title (fractions of the logical screen; safe-area insets are added) */
export const TITLE_LAYOUT = {
  logoY: 0.165,          // centre of the logo
  horizonY: 0.40,        // sea horizon (the near mountains' foot)
  focusY: 0.615,         // where the camera's focus point sits on screen
  tapY: 0.885,           // centre of the start pill
  chipsY: 0.815,         // stage chips during the intro
};
