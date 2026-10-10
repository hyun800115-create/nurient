// 사건·사고 자리표 (incidents_runtime layout, docs/v5_v8_plan.md §4.5 / §6.7). 게임에 붙일 때 WORLD.v8 로 옮겨져요 (P19).
//   경찰서는 새 시가지 c_police, 소방서는 솔방울 마을 t_fire (레벨이 올라가요), 현상수배 게시판은 광장 미션 게시판 옆.
//   격자 L(i, j) = (3120 + 64·(i + j), 1315 + 32·(i − j))  (한 칸 = √2 m, 건물은 모두 −Y = 화면 왼쪽 아래를 바라봐요)
//   (P19 전에 tools/test/later/layout.mjs 검사기로 겹침을 꼭 확인해요: 게시판·소화전·경보기 자리는 v4 소품만 피했어요)

export const G = [3120, 1315];
/** lattice (i, j) -> px [x, y] */
export const L = (i, j) => [Math.round(G[0] + 64 * (i + j)), Math.round(G[1] + 32 * (i - j))];
/** px -> lattice { i, j } */
export const px2L = (x, y) => { const a = (x - G[0]) / 64, b = (y - G[1]) / 32; return { i: (a + b) / 2, j: (a - b) / 2 }; };
/** the village plaza zone (world.js ZONES.plaza: centre [990, 800]) */
export const Zp = (mx, my) => [Math.round(990 + 45.25 * (mx + my)), Math.round(800 + 22.63 * (mx - my))];
const at = (o) => { const [x, y] = L(o.i, o.j); return Object.assign(o, { x, y }); };

// ── 경찰서 (새 시가지, §4.5): 15,000 코인 + 판자 60 + 주괴 30, 16초. 경찰차는 carBayPoint 에 서요
//   자리는 두 가지예요. 'plan' = 기획서의 c_police (43.15, −32.17). 'A' = 물류센터 배치 A (logistics_runtime 의 기본값)
//   에서 센터 뒤 (51.17, −26.97): 기획서 자리는 물류센터와 겹쳐서, 두 모듈이 같이 들어가면 'A' 를 써요 (기본값).
export const POLICE_PLACES = {
  plan: { i: 43.15, j: -32.17, hydrant: [41.8, -33.6], exit: [[40.2, -33.0]] },
  A: { i: 51.17, j: -26.97, hydrant: [49.3, -28.85], exit: [[51.2, -29.2], [53.5, -29.2], [53.5, -37.4], [38.0, -37.4]] },
};
export const POLICE = at({ id: 'c_police', key: 'police_station', i: POLICE_PLACES.A.i, j: POLICE_PLACES.A.j, site: 'inc_police', placement: 'A' });
// ── 솔방울 소방서 (t_fire): 레벨 2·3 공사 발판은 소방서 앞 큰길 쪽 (뒷길 j −11.6)
export const FIRE_STATION = at({ id: 't_fire', key: 'fire_station', i: 49.9, j: -10.5 });
export const FIRE_PAD = at({ i: 49.9, j: -12.4, sites: ['inc_fire2', 'inc_fire3'] });
// ── 현상수배 게시판: 광장 게시판(Z 4.6, −2.6) 옆, 광장 남동쪽 가장자리 (보러 오는 사람은 gatherPoints 에 서요)
export const WANTED_BOARD = (() => { const [x, y] = Zp(6.3, -1.4); return { id: 'inc_wanted', key: 'wanted_board', x, y, mission: Zp(4.6, -2.6) }; })();

// ── 소화전 자리 (하나에 400 코인, 불이 5% 줄어요; 최대 24개). 보도 위, 가로등·벤치를 피해서
export const HYDRANT_SPOTS = [
  [34.2, -3.3], [39.2, -3.3], [44.6, -3.3], [49.0, -3.3],       // 솔방울 큰길 보도 (가게 줄 앞)
  [37.4, -11.7], [42.0, -11.7], [48.3, -11.7],                  // 뒷길 (학교·마을회관·소방서 앞)
  [19.5, -16.6], [26.8, -16.6], [33.0, -16.6], [40.3, -16.6],   // 집 앞길 · 아파트 앞길
  [36.6, -23.0], POLICE_PLACES.A.hydrant,                       // 은행길 · 경찰서 앞
].map(([i, j], n) => at({ id: 'inc_hydrant_' + n, i, j }));
/** the village hydrant spots (around the plaza and the house rows; zone px) */
export const HYDRANT_SPOTS_VILLAGE = [Zp(-6.2, -3.0), Zp(3.0, -6.4), Zp(6.4, 2.4)].map(([x, y], n) => ({ id: 'inc_hydrant_v' + n, x, y }));

// ── 화재 경보기 (주민이 와서 땡땡 울려요): 큰길 · 뒷길 모퉁이, 광장
export const ALARM_POSTS = [at({ i: 36.6, j: -3.2 }), at({ i: 46.4, j: -3.2 }), at({ i: 45.3, j: -11.6 }), (() => { const [x, y] = Zp(-6.6, 1.8); return { x, y }; })()];

// ── 경찰관 순찰길 (TownSim 의 police 종류 계획, P6): 경찰서 → 은행길 → 솔방울 큰길 → 돌아오기
const LOOP = [[38.0, -26.0], [38.0, -18.6], [33.0, -13.0], [33.0, -4.6], [45.0, -4.6], [49.0, -13.0], [38.0, -26.0]];
const patrolOf = (P) => P.exit.concat(LOOP, P.exit.slice().reverse()).map(([i, j]) => L(i, j));
export const PATROL = patrolOf(POLICE_PLACES.A);

/** switch the police station to the plan's c_police ('plan') or logistics placement A ('A'); call before the host is made */
export function setPolicePlacement(name) {
  const P = POLICE_PLACES[name];
  if (!P) return false;
  at(Object.assign(POLICE, { i: P.i, j: P.j, placement: name }));
  const h = HYDRANT_SPOTS[HYDRANT_SPOTS.length - 1];
  at(Object.assign(h, { i: P.hydrant[0], j: P.hydrant[1] }));
  PATROL.length = 0; PATROL.push(...patrolOf(P));
  return true;
}

/** in front of a building at lattice (i, j): d cells towards the street (−Y) */
export const frontOf = (i, j, d) => L(i, j - d);
