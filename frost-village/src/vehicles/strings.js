// 탈것 글자 (vehicles_runtime strings, ko + en). 게임에 붙일 때 src/data/strings.js 로 옮겨져요 (P20).

export const VSTR = {
  // ---- 정류장 · 타기
  nextBus:     { ko: '다음 버스 {s}초', en: 'Next bus {s}s' },
  nextBusNow:  { ko: '버스가 와 있어요', en: 'The bus is here' },
  noBus:       { ko: '버스가 아직 없어요', en: 'No bus yet' },
  whereTo:     { ko: '어디로 갈까요?', en: 'Where to?' },
  rideTo:      { ko: '{stop} 가기', en: 'To {stop}' },
  rideWait:    { ko: '버스를 기다려요 · {s}초', en: 'Waiting for the bus · {s}s' },
  riding:      { ko: '{stop}까지 가는 중 · 움직이면 다음 정류장에서 내려요', en: 'Riding to {stop} · move to get off at the next stop' },
  rideOff:     { ko: '{stop}에 내렸어요', en: 'Got off at {stop}' },
  cancel:      { ko: '안 탈래요', en: 'Never mind' },
  // ---- 버스 · 짐차 소식
  firstBus:    { ko: '말썰매 버스가 이웃 손님을 태우고 와요!', en: 'The sleigh bus brings neighbours over!' },
  busPlaza:    { ko: '버스가 우리 광장 앞에 섰어요 · 손님 {n}명', en: 'The bus stopped by our plaza · {n} visitors' },
  freightOut:  { ko: '증기 짐차가 짐 {n}개를 싣고 떠나요', en: 'The steam wagon leaves with {n} goods' },
  truckOut:    { ko: '트럭이 짐 {n}개를 싣고 떠나요', en: 'The truck leaves with {n} goods' },
  shopFilled:  { ko: '{shop} 선반이 가득 찼어요', en: '{shop} shelves are full again' },
  // ---- 운전 미션
  driveStart:  { ko: '배달 시작! 우체통을 지나가면 저절로 서요', en: 'Off you go! Pass a drop-off and you stop by itself' },
  driveStartT: { ko: '배달 시작! 가게 앞을 지나가면 저절로 서요', en: 'Off you go! Pass a shop and you stop by itself' },
  time:        { ko: '시간', en: 'Time' },
  par:         { ko: '기준 {s}초', en: 'Par {s}s' },
  next:        { ko: '다음: {name}', en: 'Next: {name}' },
  left:        { ko: '{n}곳 남았어요', en: '{n} to go' },
  honk:        { ko: '빵빵', en: 'Beep' },
  bell:        { ko: '딸랑딸랑', en: 'Ding-ding' },
  toot:        { ko: '빵!', en: 'Toot!' },
  dropDone:    { ko: '배달 완료!', en: 'Delivered!' },
  driveDone:   { ko: '배달 끝! {s}초', en: 'All delivered! {s}s' },
  driveBest:   { ko: '새 기록!', en: 'New best!' },
  late:        { ko: '조금 늦었지만 다들 고마워해요', en: 'A little late, but everyone is grateful' },
  slowCake:    { ko: '천천히! 케이크가 흔들려요', en: 'Slowly! The cake wobbles' },
  redLight:    { ko: '빨간 불이에요', en: 'Red light' },
  giveWay:     { ko: '차가 지나가요 · 잠깐만요', en: 'Letting traffic pass' },
  noRoom:      { ko: '여기선 못 돌아요 · 조금 더 가요', en: 'No room to turn here · drive on a bit' },
  walker:      { ko: '사람이 지나가요', en: 'Someone is crossing' },
  railBlocked: { ko: '기차가 지나가요', en: 'A train is passing' },
  stopNear:    { ko: '여기서 내려 드릴게요', en: 'Dropping off here' },
  // ---- 시대 · 승격식
  eraCity:     { ko: '서리읍 → 서리시!', en: 'Frost Town → Frost City!' },
  eraCitySub:  { ko: '이제 시장님이에요 · 그래도 다들 촌장님이라고 불러요', en: "You're the mayor now · everyone still calls you chief" },
  eraTown:     { ko: '말썰매 버스와 증기 짐차의 시대!', en: 'The age of sleigh buses and steam wagons!' },
  // ---- 지을 것
  b_depot:     { ko: '마구간 차고지', en: 'Stable depot' },
  b_road:      { ko: '서리 큰길', en: 'Frost Avenue' },
  b_stop:      { ko: '{stop} 정류장', en: '{stop} stop' },
  b_yard:      { ko: '서리 화물장', en: 'Frost freight yard' },
  b_wagon:     { ko: '증기 짐차', en: 'Steam wagon' },
  b_bus:       { ko: '말썰매 버스', en: 'Sleigh bus' },
  b_retro:     { ko: '레트로 버스', en: 'Retro bus' },
  b_truck:     { ko: '운송트럭', en: 'Cargo truck' },
  b_lot:       { ko: '주차장', en: 'Parking lot' },
  b_fuel:      { ko: '주유소 (겨울엔 연료 창고)', en: 'Fuel depot' },
  b_busDepot:  { ko: '버스 차고지', en: 'Bus depot' },
  line:        { ko: '{n}번 버스', en: 'Bus {n}' },
};

/** text in the language with {placeholders} */
export function vt(lang, key, vars) {
  const e = VSTR[key];
  let s = e ? (e[lang] || e.ko) : key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
