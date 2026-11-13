// (v4.3) 목표 창 · 자동 이동 — the words of the goal window and the walk (한국어 + English).
// Its own table (like geumbang/strings.js) so the shared strings.js stays as it is; gt() fills {slots} and the Korean
// particles the same way t() does ({place|(으)로}, "…을(를)").

import { getLang, josa } from '../../data/strings.js';

export const GOAL_STR = {
  ko: {
    g_btn: '목표',
    g_title: '마을 목표',
    g_progress: '큰 목표 {done} / {all}',
    g_now: '지금 할 일',
    g_next: '다음 목표',
    g_side: '해 볼 수 있는 일 (선택)',
    g_done: '끝낸 목표 {n}개',
    g_more: '그 밖에 {n}개 더',
    g_go: '가기',
    g_here: '여기예요',
    g_tapHint: '목표를 누르면 촌장님이 그곳으로 걸어가요',
    g_none: '지금은 남은 목표가 없어요 · 마을을 마음껏 꾸며요',
    g_sideNone: '지금 고를 수 있는 일은 없어요',
    // the kinds of goal (names built from the game's own words)
    g_zone: '{name} 열기',
    g_build: '{name} 짓기',
    g_tower: '{name} 세우기',
    g_fedMiners: '광부들에게 식량 주기',
    g_firstTrain: '첫 기차 맞이하기',
    g_townVisit: '솔방울 마을 다녀오기',
    g_shops: '이웃 가게 {n}곳 열기',
    g_people: '주민 {n}명 모으기',
    g_rank: '읍으로 승격하기',
    g_house43: '첫 집 짓기 {n}',
    // the state line under a name
    g_cost: '{coins} 코인',
    g_costItems: '{coins} 코인 + {items}',
    g_building: '짓는 중 · 재료 {got}/{need}',
    g_waiting: '기다리면 저절로 돼요',
    g_have: '{have} / {need}',
    g_afford: '지금 살 수 있어요',
    g_lockedSub: '앞의 목표를 먼저 해요',
    g_lockedTag: '{text} · 잠김',
    g_noPlot: '빈 땅이 생기면 지을 수 있어요',
    g_fedSub: '빵이나 고기를 광산 식량 상자에',
    // taps and the walk
    g_walk: '「{place}」 그곳으로 걸어가요 · 만지면 멈춰요',
    g_walkObs: '관망을 끄고 걸어가요 · 「{place}」',
    g_arrived: '도착했어요 · {place}',
    g_cancel: '자동 이동을 멈췄어요 · 직접 조종해요',
    g_gone: '「{place}」 목표가 이미 끝나서 멈췄어요',
    g_stuck: '길이 막혔어요 · 화살표를 따라 직접 가 볼까요?',
    g_locked: '아직 열리지 않았어요 · 먼저 「{cur}」부터 해요',
    g_passive: '이 목표는 기다리면 저절로 이뤄져요',
    g_noWay: '지금은 갈 수 없는 곳이에요',
    g_already: '벌써 여기 있어요 · {place}',
    g_tutorial: '튜토리얼을 마치면 볼 수 있어요',
    g_busy: '지금은 걸어갈 수 없어요',

    // ==== (v4.3 step B, B0b) ko: G adds its keys ONLY between its start / end lines (the same pair in en)
    // >>> v43B:G start (post-depot goals: GOALS43 row names, banners, sub lines g43_*; postdepot_addendum.md §3.7)
    // (물류창고 다음 목표: 목표 창의 이름 (차례대로), 알림, 이름 아래 작은 줄)
    g43_staff: '물류창고 직원 {n}명 뽑기',
    g43_fork: '물류창고에 지게차 들이기',
    g43_st2: '가공소 2단 하나 더',
    g43_st2n: '가공소 2단 {n}곳 더',
    g43_deco: '마을 꾸미기 {n}곳 더',
    g43_house: '첫 집 두 채 짓기',
    g43_dlv: '이웃 마을 정기 납품 {n}번',
    g43_train: '기차로 짐 {n}번 보내기',
    g43_shop: '가게 키우기: 3단 「눈꽃 시장」과 고기 점원',
    g43_s4: '가게 4단 「눈꽃마을 시장」',
    g43_taste: '읍장 취임 맛보기',
    g43_openBanner: '물류창고 다음 목표가 생겼어요',
    g43_openSub: '목표 창에서 차례대로 볼 수 있어요',
    g43_doneBanner: '목표 달성: {name}',
    g43_doneSub: '+{n} 코인 · 다음: {next}',
    g43_doneSubEnd: '+{n} 코인',
    g43_doneToast: '목표 달성: {name} +{n}',
    g43_half: '반값',
    g43_st2Wait: '셋째 일꾼을 뽑으면 2단이 열려요',
    g43_st2Slot: '다른 제안을 먼저 정하면 2단 발판이 나와요',
    g43_st2Gate: '{name|을/를} 먼저 뽑아요 · {coins} 코인',
    g43_houseWait: '빈 방이 차면 지을 수 있어요',
    g43_shopWait: '고기가 처음 팔리면 열려요',
    g43_dlvItem: '{have} / {need} · {item} {got}/{all}',
    g43_readyBanner: '마을회관 앞에서 작은 축하가 기다려요',
    g43_readySub: '회관 앞 발판에 서 보세요',
    // <<< v43B:G end
  },
  en: {
    g_btn: 'Goals',
    g_title: 'Village goals',
    g_progress: 'Main goals {done} / {all}',
    g_now: 'Do this now',
    g_next: 'Up next',
    g_side: 'You could also (optional)',
    g_done: '{n} goals done',
    g_more: '{n} more',
    g_go: 'Go',
    g_here: 'Here',
    g_tapHint: 'Tap a goal and the chief walks there',
    g_none: 'No goals left right now · decorate your village',
    g_sideNone: 'Nothing optional to pick right now',
    g_zone: 'Open the {name}',
    g_build: 'Build the {name}',
    g_tower: 'Raise the {name}',
    g_fedMiners: 'Bring the miners food',
    g_firstTrain: 'Welcome the first train',
    g_townVisit: 'Visit Pinecone Village',
    g_shops: 'Open {n} neighbour shops',
    g_people: 'Reach {n} villagers',
    g_rank: 'Become a town',
    g_house43: 'Build first house {n}',
    g_cost: '{coins} coins',
    g_costItems: '{coins} coins + {items}',
    g_building: 'Building · materials {got}/{need}',
    g_waiting: 'This comes by itself',
    g_have: '{have} / {need}',
    g_afford: 'You can buy it now',
    g_lockedSub: 'Finish the goal before it first',
    g_lockedTag: '{text} · locked',
    g_noPlot: 'Needs a free plot first',
    g_fedSub: "Bread or meat to the mine's food box",
    g_walk: 'Walking there: {place} · touch to stop',
    g_walkObs: 'Watching off · walking there: {place}',
    g_arrived: 'Arrived: {place}',
    g_cancel: 'Auto-walk stopped · you have control',
    g_gone: 'Stopped: "{place}" is already done',
    g_stuck: 'The way is blocked · follow the line yourself?',
    g_locked: 'Not open yet · first: "{cur}"',
    g_passive: 'This goal comes by itself — just wait',
    g_noWay: "Can't get there right now",
    g_already: 'Already here: {place}',
    g_tutorial: 'Available after the tutorial',
    g_busy: "Can't walk there right now",

    // ==== (v4.3 step B, B0b) en: G adds its keys ONLY between its start / end lines (the same pair in ko)
    // >>> v43B:G start (post-depot goals: GOALS43 row names, banners, sub lines g43_*; postdepot_addendum.md §3.7)
    g43_staff: 'Hire {n} depot hands',
    g43_fork: 'Get the depot a forklift',
    g43_st2: 'One more workshop at level 2',
    g43_st2n: '{n} more workshops at level 2',
    g43_deco: 'Decorate {n} more spots',
    g43_house: 'Build both first houses',
    g43_dlv: 'Regular deliveries ×{n}',
    g43_train: 'Send goods by train ×{n}',
    g43_shop: 'Grow the shop: stage 3 and its meat clerk',
    g43_s4: 'Shop stage 4',
    g43_taste: 'A taste of the inauguration',
    g43_openBanner: 'New goals after the depot',
    g43_openSub: 'See them in order in the goal window',
    g43_doneBanner: 'Goal done: {name}',
    g43_doneSub: '+{n} coins · next: {next}',
    g43_doneSubEnd: '+{n} coins',
    g43_doneToast: 'Goal done: {name} +{n}',
    g43_half: 'half price',
    g43_st2Wait: 'Hire a third worker to unlock level 2',
    g43_st2Slot: 'The level-2 pad shows once another offer is taken',
    g43_st2Gate: 'Hire {name} first · {coins} coins',
    g43_houseWait: 'You can build once the empty rooms fill',
    g43_shopWait: 'Opens after your first meat sale',
    g43_dlvItem: '{have} / {need} · {item} {got}/{all}',
    g43_readyBanner: 'A small celebration waits at the town hall',
    g43_readySub: 'Stand on the pad in front of the hall',
    // <<< v43B:G end
  },
};

/** the goal window's words with {slots} filled ({k|이/가} particle slots and "…을(를)" as in strings.t) */
export function gt(key, params) {
  const lang = getLang();
  const L = GOAL_STR[lang] || GOAL_STR.ko;
  let s = L[key];
  if (s === undefined) s = GOAL_STR.ko[key];
  if (s === undefined) return key;
  if (params) {
    for (const k in params) {
      const v = String(params[k]);
      if (s.indexOf('{' + k + '|') >= 0) s = s.replace(new RegExp('\\{' + k + '\\|([^}]+)\\}', 'g'), (m, pair) => v + josa(v, pair));
      s = s.split('{' + k + '}').join(v);
    }
  }
  if (s.indexOf(')') >= 0) s = s.replace(/([가-힣A-Za-z0-9])(이\(가\)|을\(를\)|은\(는\)|와\(과\)|\(으\)로)/g, (m, ch, p) => ch + josa(ch, { '이(가)': '이/가', '을(를)': '을/를', '은(는)': '은/는', '와(과)': '과/와', '(으)로': '(으)로' }[p]));
  return s;
}
