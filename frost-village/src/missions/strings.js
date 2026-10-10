// 미션 · 명성 · 은행 화면의 글자 (한국어 ko / 영어 en). {n} 같은 칸은 게임이 숫자·이름으로 채워요.
// (게임에 넣을 때 strings.js 에 그대로 합쳐져요: docs/v5_v8_plan.md P20. 미션 이름과 주민 말은 data/catalog.js 에 있어요.)

export const MSTR = {
  ko: {
    m_panel: '촌장 미션', m_tab_active: '진행 중', m_tab_board: '게시판', m_tab_today: '오늘', m_tab_week: '이번 주', m_tab_titles: '칭호',
    m_accept: '받기', m_later: '나중에', m_swap: '다른 미션', m_go: '보러 가기', m_close: '닫기',
    m_empty_active: '받은 미션이 없어요.\n주민 머리 위 하트 말풍선을 눌러 보세요!', m_empty_board: '곧 새 미션이 걸려요!',
    m_kind_request: '부탁', m_kind_drive: '배달 운전', m_kind_event: '행사', m_kind_goal: '생산 목표', m_kind_explore: '탐험', m_kind_daily: '오늘의 미션', m_kind_weekly: '이번 주 목표',
    m_due: '{h} 까지', m_due_soon: '곧 마감!', m_left: '{n} 남음', m_got: '{got}/{need}', m_reward: '보상', m_parked: '보관함 {n}', wk_req_done: '주민 부탁 들어주기', wk_riders: '버스·썰매로 손님 태우기', wk_celebrate: '결혼식·아기 축하·생일 잔치 함께하기', wk_export: '항구에서 수출하기', wk_beach_guest: '해변 손님 맞이하기', wk_settle: '물류 센터 정산하기', m_board_note: '게시판 미션은 받지 않아도 돼요. 마을 일을 하다 보면 저절로 채워져요.\n{n}분이 지나면 다른 미션으로 바꿀 수 있어요.',
    m_from: '{giver}의 부탁', m_to: '→ {to}', m_bag: '가방',
    m_done: '미션 완료!', m_req_done: '부탁을 들어줬어요!', m_new_req: '새 부탁이 생겼어요', m_full: '부탁은 3개까지 받을 수 있어요',
    m_new_event: '새 행사 미션!', m_expired: '{title} — 다음에 또 도와줘요!', m_gone: '{title} — 이제 괜찮대요',
    m_daily_title: '오늘의 미션', m_daily_all: '세 개 다 하면 +{coins} · 명성 +{fame}', m_daily_reset: '내일 새벽 5시에 바뀌어요',
    m_daily_done: '오늘의 미션 완료!', m_daily_all_done: '오늘의 미션 모두 완료!',
    m_streak: '연속 {n}일째', m_streak_none: '오늘부터 연속 달성!', m_shield_free: '눈사람 방패: 이번 주 1번 쓸 수 있어요', m_shield_used: '눈사람 방패: 이번 주는 썼어요',
    m_week_title: '이번 주 목표', m_week_stage: '{s}/3 단계', m_week_decor: '3단계까지 하면 "{decor}" 장식!', m_week_done: '이번 주 목표 완료!',
    m_fame: '명성', m_fame_n: '명성 {n}', m_next_title: '다음 칭호까지 {n}', m_title_max: '최고 칭호예요!',
    m_title_up: '{title}이 되었어요!', m_reward_got: '"{reward}"이(가) 생겼어요!',
    m_combo: '착한 촌장 콤보!', m_driver: '베스트 드라이버!', m_crown: '연속 7일! 왕관 배지',
    t_1: '새내기 촌장', t_2: '믿음직한 촌장', t_3: '존경받는 촌장', t_4: '명예로운 촌장', t_5: '전설의 촌장',
    tr_1: '모든 촌장님은 여기서 시작해요', tr_2: '마을 악단: 저녁 6시에 광장에서 음악회', tr_3: '눈꽃 아치: 마을회관 앞 사진 명소', tr_4: '랜턴 거리: 밤에 반짝이는 길', tr_5: '도시 입구 문 "서리시" + 금 왕관',
    tx_1: '', tx_2: '이주민이 더 자주 와요 · 은행을 지을 수 있어요', tx_3: '도시가 되는 조건이에요', tx_4: '관광객 +20 %', tx_5: '',
    d_wedding_arch: '눈꽃 아치', d_lantern_string: '랜턴 거리', d_igloo: '이글루 쉼터', d_snow_fort: '눈 요새 놀이터', d_kids_swing: '그네', d_deco_flowers: '꽃밭',
    d_music_stand: '마을 악단', d_bench_seats: '악단 의자', d_flower_stand: '꽃 화분', d_town_gate_x: '도시 입구 문',
    i_item_bouquet: '꽃다발', i_item_cake: '케이크', i_item_gift_box: '선물 상자', i_item_letter: '편지',
    // 운전 · 데려가기 · 함께 가기 · 짐 · 후원 (critique C-2)
    m_drive_go: '출발', m_drive_sled: '개썰매 출발', m_drive_truck: '트럭 출발', m_drive_busy: '벌써 운전하고 있어요', m_drive_cant: '지금은 출발할 수 없어요',
    m_drive_hint: '화물장 발판이나 출발 버튼으로 떠나요',
    m_pay_btn: '후원 {n}', m_pay_short: '코인이 {n} 필요해요', m_paid: '불꽃놀이를 후원했어요!',
    m_found_puppy: '강아지를 찾았어요! 게시판 앞 주인에게 데려다줘요', m_found_penguin: '뽀삐를 찾았어요! 농장 집에 데려다줘요', m_found: '찾았어요!',
    m_home_puppy: '강아지가 주인 품으로 쏙!', m_home_penguin: '뽀삐가 집에 왔어요!',
    m_esc_hello: '같이 가 줘요? 고마워요, 촌장님!', m_esc_follow: '함께 가요', m_carry_pick: '상자를 들었어요', m_fish_got: '희귀 물고기를 받았어요! 수족관으로 가요',
    m_identify: '찾았다! 포스터의 그 얼굴이에요!', m_wish: '소원: {wish}', m_ask_hint: '아무 주민에게나 말을 걸어 보세요',
    m_gift_need: '물건 {n}개가 필요해요', i_tomorrow: '내일 또 피어요', m_secs: '{n}초', m_cake_from: '빵 {n} → 케이크', m_buy_bouquet: '꽃다발 {n}',
    m_order_card: '역 주문판', m_order_sub: '역 주문 칩과 같은 주문이에요', m_elder: '{name} 어르신', m_hall_btn: '촌장 미션 보기',
    // 은행
    b_name: '서리 은행', b_counter: '은행 창구', b_deposit: '저금하기', b_withdraw: '꺼내기', b_passbook: '통장', b_all: '전부', b_half: '절반',
    b_savings: '저금', b_interest: '이자 (하루 {p} %)', b_cap: '한도 {n}', b_loan: '대출', b_loan_left: '갚을 돈 {n}', b_loan_none: '대출 없음',
    b_loan_note: '버는 돈의 10 %로 저절로 갚아요', b_loan_paused: '천천히 갚아도 돼요 · 저금하면 갚아져요', b_loan_first: '저금하면 대출부터 갚아요',
    b_offer_title: '은행에서 빌릴까요?', b_offer_line: '{n} 빌리기 (수수료 {p} %)', b_offer_sav: '저금에서 {n} 꺼내기', b_borrow: '빌리기', b_no: '안 빌릴래요', b_use_savings: '꺼내 쓰기',
    b_offer_fee: '수수료 {n} · 갚을 돈 {t}', b_offer_part: '부족한 {s} 중 {n}까지 빌려줄 수 있어요',
    b_ticket: '{n}번 손님!', b_open: '서리 은행 개업!', b_closed: '은행 문은 아침 9시에 열어요', b_vault: '금고 문이 빙글!',
    b_col_date: '날짜', b_col_item: '내용', b_col_amt: '금액', b_col_bal: '잔액', b_day: '{n}일',
    b_op_deposit: '저금', b_op_withdraw: '꺼냄', b_op_interest: '이자', b_op_loan: '대출', b_op_repay: '갚음', b_op_premium: '보험료', b_op_claim: '보험금',
    b_op_savings: '모은 돈', b_chief: '촌장님', b_book_of: '{name}의 통장', b_neighbours: '이웃 통장', b_res_savings: '저금 {n}', b_res_loan: '대출 {n}', b_res_none: '빚 없음',
    b_repaid: '대출을 다 갚았어요!', b_restructure: '은행이 수수료를 깎아 줬어요', b_saved: '{n} 저금했어요', b_repay_by_deposit: '{n}만큼 대출을 갚았어요',
    b_insure: '화재 보험', b_insured: '보험 가입됨', b_insure_title: '화재 보험 들기', b_insure_line: '하루 {n}코인 · 불이 나도 다시 짓는 돈을 모두 받아요',
    b_insure_join: '가입', b_insure_none: '보험을 들 수 있는 건물이 아직 없어요', b_insure_lapsed: '보험료가 밀렸어요', b_insure_paid: '{name} 화재 보험 가입!',
    b_insure_full: '보험은 {n}곳까지 들 수 있어요',
  },
  en: {
    m_panel: 'Chief\'s Missions', m_tab_active: 'Active', m_tab_board: 'Board', m_tab_today: 'Today', m_tab_week: 'Week', m_tab_titles: 'Titles',
    m_accept: 'Accept', m_later: 'Later', m_swap: 'Another', m_go: 'Go watch', m_close: 'Close',
    m_empty_active: 'No missions yet.\nTap a heart bubble over a resident!', m_empty_board: 'New missions are on their way!',
    m_kind_request: 'Request', m_kind_drive: 'Delivery drive', m_kind_event: 'Event', m_kind_goal: 'Goal', m_kind_explore: 'Explore', m_kind_daily: 'Daily', m_kind_weekly: 'Weekly',
    m_due: 'by {h}', m_due_soon: 'Due soon!', m_left: '{n} left', m_got: '{got}/{need}', m_reward: 'Reward', m_parked: 'Saved {n}', wk_req_done: 'help residents', wk_riders: 'carry riders by bus and sled', wk_celebrate: 'weddings, new babies and birthday parties', wk_export: 'export from the harbor', wk_beach_guest: 'welcome beach guests', wk_settle: 'settle logistics bills', m_board_note: 'No need to accept board missions: they fill up as the village works.\nAfter {n} min you can swap one for another.',
    m_from: 'From {giver}', m_to: '→ {to}', m_bag: 'Bag',
    m_done: 'Mission complete!', m_req_done: 'Request done!', m_new_req: 'Someone needs help', m_full: 'You can hold 3 requests at a time',
    m_new_event: 'New event!', m_expired: '{title} — maybe next time!', m_gone: '{title} — all sorted now',
    m_daily_title: 'Today\'s missions', m_daily_all: 'All three: +{coins} · fame +{fame}', m_daily_reset: 'New ones at 5 a.m.',
    m_daily_done: 'Daily done!', m_daily_all_done: 'All dailies done!',
    m_streak: '{n}-day streak', m_streak_none: 'Start a streak today!', m_shield_free: 'Snowman shield ready this week', m_shield_used: 'Snowman shield used this week',
    m_week_title: 'This week', m_week_stage: 'Stage {s}/3', m_week_decor: 'Finish all 3 for "{decor}"!', m_week_done: 'Weekly goal done!',
    m_fame: 'Fame', m_fame_n: 'Fame {n}', m_next_title: '{n} to the next title', m_title_max: 'The highest title!',
    m_title_up: 'You are now {title}!', m_reward_got: 'New: "{reward}"!',
    m_combo: 'Kind-chief combo!', m_driver: 'Best driver!', m_crown: '7 days in a row! Crown badge',
    t_1: 'Newcomer Chief', t_2: 'Trusted Chief', t_3: 'Respected Chief', t_4: 'Honoured Chief', t_5: 'Legendary Chief',
    tr_1: 'Every chief starts here', tr_2: 'Village band: a concert at 6 p.m.', tr_3: 'Snowflake arch: a photo spot at the hall', tr_4: 'Lantern street: lights at night', tr_5: 'The "Seori City" gate + gold crown',
    tx_1: '', tx_2: 'Settlers come more often · the bank can be built', tx_3: 'Needed for City', tx_4: 'Tourists +20 %', tx_5: '',
    d_wedding_arch: 'Snowflake arch', d_lantern_string: 'Lantern street', d_igloo: 'Igloo shelter', d_snow_fort: 'Snow fort', d_kids_swing: 'Swing', d_deco_flowers: 'Flower bed',
    d_music_stand: 'Village band', d_bench_seats: 'Band benches', d_flower_stand: 'Flower stand', d_town_gate_x: 'City gate',
    i_item_bouquet: 'Bouquet', i_item_cake: 'Cake', i_item_gift_box: 'Gift box', i_item_letter: 'Letter',
    m_drive_go: 'Go', m_drive_sled: 'Sled: go', m_drive_truck: 'Truck: go', m_drive_busy: 'Already driving', m_drive_cant: 'Cannot set off right now',
    m_drive_hint: 'Leave from the yard pad or the Go button',
    m_pay_btn: 'Fund {n}', m_pay_short: 'You need {n} coins', m_paid: 'You funded the fireworks!',
    m_found_puppy: 'Found the puppy! Take it to its owner by the board', m_found_penguin: 'Found Ppoppi! Take her home to the farm', m_found: 'Found it!',
    m_home_puppy: 'The puppy jumps into its owner\'s arms!', m_home_penguin: 'Ppoppi is home!',
    m_esc_hello: 'You\'ll come with me? Thank you, Chief!', m_esc_follow: 'Walking together', m_carry_pick: 'Picked up a box', m_fish_got: 'Got the rare fish! Off to the aquarium',
    m_identify: 'That\'s the face on the poster!', m_wish: 'Wish: {wish}', m_ask_hint: 'Talk to any resident',
    m_gift_need: 'Bring {n} goods', i_tomorrow: 'More tomorrow', m_secs: '{n} s', m_cake_from: '{n} bread → cake', m_buy_bouquet: 'Bouquet {n}',
    m_order_card: 'Station orders', m_order_sub: 'The same order as the station chip', m_elder: '{name}', m_hall_btn: 'Chief\'s missions',
    b_name: 'Seori Bank', b_counter: 'Bank counter', b_deposit: 'Deposit', b_withdraw: 'Withdraw', b_passbook: 'Passbook', b_all: 'All', b_half: 'Half',
    b_savings: 'Savings', b_interest: 'Interest ({p} % a day)', b_cap: 'Limit {n}', b_loan: 'Loan', b_loan_left: 'Owed {n}', b_loan_none: 'No loan',
    b_loan_note: '10 % of what you earn pays it back', b_loan_paused: 'No rush · deposits pay it back', b_loan_first: 'Deposits repay the loan first',
    b_offer_title: 'Borrow from the bank?', b_offer_line: 'Borrow {n} ({p} % fee)', b_offer_sav: 'Take {n} from savings', b_borrow: 'Borrow', b_no: 'Not now', b_use_savings: 'Use savings',
    b_offer_fee: 'Fee {n} · to repay {t}', b_offer_part: 'Short {s}: the bank can lend {n}',
    b_ticket: 'Number {n}, please!', b_open: 'Seori Bank is open!', b_closed: 'The bank opens at 9 a.m.', b_vault: 'The vault door spins!',
    b_col_date: 'Day', b_col_item: 'Entry', b_col_amt: 'Amount', b_col_bal: 'Balance', b_day: 'Day {n}',
    b_op_deposit: 'Deposit', b_op_withdraw: 'Withdrawal', b_op_interest: 'Interest', b_op_loan: 'Loan', b_op_repay: 'Repaid', b_op_premium: 'Premium', b_op_claim: 'Claim',
    b_op_savings: 'Savings', b_chief: 'Chief', b_book_of: '{name}\'s book', b_neighbours: 'Neighbours\' books', b_res_savings: 'Saved {n}', b_res_loan: 'Loan {n}', b_res_none: 'No debts',
    b_repaid: 'Loan paid off!', b_restructure: 'The bank waived the fee', b_saved: 'Saved {n}', b_repay_by_deposit: 'Repaid {n} of the loan',
    b_insure: 'Fire insurance', b_insured: 'Insured', b_insure_title: 'Fire insurance', b_insure_line: '{n} coins a day · a fire pays the whole rebuild',
    b_insure_join: 'Insure', b_insure_none: 'No buildings to insure yet', b_insure_lapsed: 'Premium overdue', b_insure_paid: '{name} is insured!',
    b_insure_full: 'Up to {n} buildings can be insured',
  },
};

/** a string in `lang` with {params} filled (falls back to Korean, then the key) */
export function mt(lang, key, params) {
  const tb = MSTR[lang] || MSTR.ko;
  let s = tb[key];
  if (s === undefined) s = MSTR.ko[key];
  if (s === undefined) return key;
  if (params) for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
  return s;
}

/** thousands separators (1,800) */
export function fmtN(n) { const v = Math.floor(Math.abs(Number(n) || 0)); return (n < 0 ? '-' : '') + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/** a clock label for a game hour (12 → '12:00', 10.5 → '10:30') */
export function hourLabel(h) { const hh = Math.floor(((h % 24) + 24) % 24), mm = Math.round((h - Math.floor(h)) * 60); return hh + ':' + String(mm >= 60 ? 0 : mm).padStart(2, '0'); }

/** a template title with {name} / {to} / {from} filled from people names */
export function titleOf(tpl, lang, names = {}) {
  let s = (tpl.title && (tpl.title[lang] || tpl.title.ko)) || tpl.id;
  for (const k of ['name', 'to', 'from']) s = s.split('{' + k + '}').join(names[k] || (lang === 'en' ? 'a neighbour' : '이웃'));
  s = s.split('{elder}').join(names.elder || elderName(names.name, lang));
  return s;
}

/** an elder as the village says it: story names already carry 할머니 / 할아버지 ('순자 할머니'); a bare name gets
 *  '어르신' (never a guessed gender, critique M-5) */
export function elderName(name, lang) {
  if (!name) return lang === 'en' ? 'An elder' : '어르신';
  if (lang === 'en') return name;
  return /(할머니|할아버지|어르신)$/.test(name) ? name : mt('ko', 'm_elder', { name });
}
