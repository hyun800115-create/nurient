// (v4.2, docs/v42_plan.md §6.4) 사무실 · 은행 · 물류창고 직원들의 옷차림 (townfolk 의 옷 조각으로 만든 코드 preset).
// TF.addPresets() 로 townfolk 생성기에 더해져요 (manifest 에 같은 이름이 있으면 그쪽이 이겨요 — CODE-2 officefolk).
//   bases = 체형 비율, tops / hats / extra / neck / bag / headAcc = 옷 조각, colors = 색 (없으면 기본 팔레트)
// 이름표의 이름 (셈이 · 소복이 · 총총이 · 딸랑이) 은 strings.js 에 있어요.

export const STAFF_LOOKS = {
  // 셈이 (장부 담당): 가디건 + 네모 안경 + 목걸이 이름표
  office_a: {
    label: { ko: '사무직 (장부)', en: 'clerk (ledger)' },
    bases: { adult_round: 1 }, tops: ['top_cardigan'], bottoms: ['bot_pants'], shoes: ['shoe_shoes'],
    hats: null, hatChance: 0, headAcc: ['acc_glasses_sq'], headAccChance: 1, extra: ['det_lanyard'], neck: null, bag: null,
    colors: { top: ['#7C9A6E'], top2: ['#F4EDE0'], bottom: ['#3B3F52'] },
  },
  // 소복이 (소식 · 편지 담당): 스웨터 + 목도리
  office_b: {
    label: { ko: '사무직 (소식)', en: 'clerk (news)' },
    bases: { adult_slim: 1 }, tops: ['top_sweater'], bottoms: ['bot_pants'], shoes: ['shoe_shoes'],
    hats: null, hatChance: 0, neck: ['acc_scarf'], neckChance: 1, bag: null, headAcc: null,
    colors: { top: ['#E8B4B0'], acc: ['#C0504D'], bottom: ['#4A4F63'] },
  },
  // 총총이 (수행비서): 블레이저 + 나비 리본
  secretary: {
    label: { ko: '수행비서', en: 'aide' },
    bases: { adult_slim: 1 }, tops: ['top_blazer'], bottoms: ['bot_pants'], shoes: ['shoe_shoes'],
    hats: null, hatChance: 0, extra: ['det_bow'], neck: null, bag: null, headAcc: null,
    colors: { top: ['#2F4A6E'], bottom: ['#2B2F3A'] },
  },
  // 딸랑이 (수금원): 더플코트 + 비니 + 가방
  courier: {
    label: { ko: '수금원', en: 'coin courier' },
    bases: { adult_round: 1 }, tops: ['top_duffle'], bottoms: ['bot_pants'], shoes: ['shoe_boots'],
    hats: ['hat_beanie'], hatChance: 1, bag: ['acc_satchel'], bagChance: 1, neck: null, headAcc: null,
    colors: { top: ['#C9853A'], hat: ['#D23A32'], bag: ['#7A4A28'], bottom: ['#3B3F52'] },
  },
  // 은행 창구 직원 둘: 조끼 + 나비 리본
  teller_a: {
    label: { ko: '은행 창구', en: 'teller' },
    bases: { adult_slim: 1, adult_round: 1 }, tops: ['top_vest'], bottoms: ['bot_pants'], shoes: ['shoe_shoes'],
    hats: null, hatChance: 0, extra: ['det_bow'], neck: null, bag: null, headAcc: null,
    colors: { top: ['#7A2E3A'], top2: ['#F4EDE0'], bottom: ['#2B2F3A'] },
  },
  teller_b: {
    label: { ko: '은행 창구', en: 'teller' },
    bases: { adult_round: 1, adult_slim: 1 }, tops: ['top_vest'], bottoms: ['bot_pants'], shoes: ['shoe_shoes'],
    hats: null, hatChance: 0, extra: ['det_bow'], neck: null, bag: null, headAcc: null,
    colors: { top: ['#2F5E48'], top2: ['#F4EDE0'], bottom: ['#2B2F3A'] },
  },
  // 은행장: 블레이저 + 넥타이 + 안경 (어르신)
  bank_manager: {
    label: { ko: '은행장', en: 'bank manager' },
    bases: { elder_round: 1, elder_slim: 1 }, tops: ['top_blazer'], bottoms: ['bot_pants'], shoes: ['shoe_shoes'],
    hats: null, hatChance: 0, extra: ['det_tie'], headAcc: ['acc_glasses'], headAccChance: 1, neck: null, bag: null,
    colors: { top: ['#3B3F52'], bottom: ['#2B2F3A'] },
  },
  // 물류창고 일꾼: 파카 + 형광 조끼 + 비니
  depot_worker: {
    label: { ko: '물류창고 일꾼', en: 'depot worker' },
    bases: { adult_round: 2, adult_slim: 1 }, tops: ['top_parka'], bottoms: ['bot_pants'], shoes: ['shoe_boots'],
    hats: ['hat_beanie'], hatChance: 1, extra: ['det_hivis'], neck: null, bag: null, headAcc: null,
    colors: { top: ['#3D6FB8', '#5F7F3A'], hat: ['#E0A030', '#D23A32'], bottom: ['#2B3A5E'] },
  },
};

/** the preset of each staff role */
export const STAFF_PRESET = { sem: 'office_a', bok: 'office_b', chong: 'secretary', ttal: 'courier', teller0: 'teller_a', teller1: 'teller_b', manager: 'bank_manager', depot: 'depot_worker' };
