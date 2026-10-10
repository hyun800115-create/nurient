// The chief's chronicle (docs/v5_v8_plan.md §5.6): what the chief already did before v5, seeded into the story as
// facts on the first v5 boot, so residents can say "촌장님이 역을 고쳐 주셔서 기차가 다니잖아요" on day one. Pure.
//
//   chronicleFacts({ flags, rank, built, shops, people }) -> [{ what, target: { ko, en }, place }]   (engine report('chief', …))

const BUILT = {
  // key -> [what, ko, en, story place id hint]
  town_hall: ['built', '마을회관', 'the town hall', null], big_restaurant: ['built', '큰 식당', 'the big restaurant', null],
  memorial_garden: ['built', '기억의 정원', 'the memorial garden', null], school: ['built', '학교', 'a school', null], clinic: ['built', '병원', 'a clinic', null],
  watchtower: ['built', '망루', 'a watchtower', null], warehouse: ['built', '창고', 'a warehouse', null], cannery: ['built', '통조림 공장', 'the cannery', null],
  boathouse: ['built', '보트 창고', 'the boathouse', null],
};

export function chronicleFacts(state = {}) {
  const out = [];
  const f = state.flags || {};
  if (f.firstTrain) out.push({ what: 'repair', target: { ko: '기차역', en: 'the railway station' }, place: 't_station' });
  if (f.townVisit || f.townInvite) out.push({ what: 'welcome', target: { ko: '솔방울 마을 손님들', en: 'the visitors from Pinecone Town' }, place: 't_station' });
  for (const k of state.built || []) { const b = BUILT[k]; if (b) out.push({ what: b[0], target: { ko: b[1], en: b[2] }, place: b[3] || undefined }); }
  for (const s of (state.shops || []).slice(0, 6)) out.push({ what: 'built', target: { ko: s.ko || s, en: s.en || s.ko || s }, place: s.id || undefined });
  if ((state.rank || 1) >= 2) out.push({ what: 'rank', target: { ko: '읍', en: 'town' } });
  if ((state.rank || 1) >= 3) out.push({ what: 'rank', target: { ko: '도시', en: 'city' } });
  return out;
}
