// 이야기 숫자표 (docs/v5_v8_plan.md §6.1 "Data tables"). 게임에 넣을 때 이 블록이 그대로 balance.js 의
// BALANCE.v5.story 로 옮겨져요 (주석도 그대로). 모듈은 BALANCE 를 먼저 읽고, 없으면 여기 값을 써요.

export const STORY_TUNING = {
  worker: true,                       // 이야기 엔진을 뒷방(워커)에서 돌려요 (안 되면 저절로 같은 방에서)
  tickEvery: 0.25,                    // 엔진에 시간을 보내는 간격(초)
  maxResidents: 400,                  // 이야기 속 주민 최대 수
  inlineCatch: 8,                     // 같은 방에서 돌 때 한 번에 따라잡는 게임 시간(초) — 화면이 버벅이지 않게
  life: { yearDaysKid: 1.5, yearDaysAdult: 4,      // 1살 먹는 데 걸리는 게임 날 수 (아이 / 어른)
          weddingInDays: 2, weddingHour: 11, weddingGapDays: 6, firstWeddingInDays: 1,
          babyAfterWedding: [3, 5], firstBabyAfterMin: 23, clinicNight: true,
          schoolAge: 7, walkAge: 4, firstJobAge: 16, birthdaysPerDay: 1,
          wishAge: 82, wishes: 3, farewellMinAge: 86, farewellFirstAfterMin: 180, farewellGapDays: 15,
          farewellBirthGapDays: 5, freezeAgeWhenOff: 85, stones: 6, cardsQueue: 3, knownServed: 3,
          firstProposalAfterSec: 12,  // 읍 승격식이 끝나고 몇 초 뒤에 첫 청혼을 할까요
          birthAfterNews: 2.5,        // 기쁜 소식 → 아기 탄생까지 게임 날 수
          birthHour: 18,              // 병원에 가는 시각 (저녁 6시), 새벽에 유모차를 밀고 나와요
          babyRate: 0.012,            // 부부가 하루에 아기 소식을 들을 확률 (아기가 너무 많으면 낮춰요)
          memorialHour: 10,           // 배웅식 시각 (아침 10시)
          lastDayHour: 15 },          // 마지막 하루: 오후 3시에 촌장님께 인사하고 정원 벤치에 앉아요
  talk: { maxDist: 220, chatCap: 2, emoteCap: 3 },  // 말풍선: 두 사람 사이 거리(px), 화면에 말풍선 / 이모티콘 최대 수
  paper: { hour: 7, firstAfterWedding: true },      // 솔방울 신문: 아침 7시, 첫 결혼식 다음 날부터
  happenings: { gapMin: 150, every: 300, maxActive: 1, range: 900 },   // 귀여운 일: 최소 간격(초), 평균 간격(초), 동시에 1개, 촌장님과의 거리(px)
  save: { capChars: 450000, hardChars: 600000 },    // 이야기 따로 저장: 보통 45만 글자, 최대 60만 글자
  rates: { fireRate: 0, incidentRate: 0, moveInRate: 0, moveOutRate: 0.0015, talkRate: 0.045 },   // v5: 사건·사고 없음, 이사 오기는 게임이 정해요
};

/** the engine config the runtime asks for (defaults of the engine copy keep the old behaviour) */
export function engineConfig(T = STORY_TUNING, opts = {}) {
  const L = T.life;
  return {
    externalPlans: true, keepNamed: true, ackWait: true, textMode: 'visible',
    incidents: false, lifeEvents: opts.lifeEvents !== false, farewell: opts.farewell !== false,
    yearDaysKid: L.yearDaysKid, yearDaysAdult: L.yearDaysAdult, freezeAgeWhenOff: L.freezeAgeWhenOff,
    weddingInDays: L.weddingInDays, weddingHour: L.weddingHour, weddingGapDays: L.weddingGapDays,
    babyAfterWeddingDays: L.babyAfterWedding[0], birthAfterNews: L.birthAfterNews, birthHour: L.birthHour, babyRate: L.babyRate,
    farewellNeedsGarden: true, farewellFromDay: opts.farewellFromDay || 0, farewellGapDays: L.farewellGapDays,
    farewellBirthGapDays: L.farewellBirthGapDays, farewellLastDay: true, memorialHour: L.memorialHour,
    fireRate: T.rates.fireRate, incidentRate: T.rates.incidentRate, moveInRate: T.rates.moveInRate, moveOutRate: T.rates.moveOutRate, talkRate: T.rates.talkRate,
  };
}
