// 이야기 모듈이 쓰는 자리 (docs/v5_v8_plan.md §4.2). 게임에 넣을 때 WORLD.v5 로 옮겨요 (P19).
// 좌표는 v4 의 L4 격자: L(i, j) = (3120 + 64·(i + j), 1315 + 32·(i − j)).

export const L4 = (i, j) => ({ x: 3120 + 64 * (i + j), y: 1315 + 32 * (i - j) });

export const STORY_LAYOUT = {
  // 기억의 정원: 줄 D 의 조용한 서쪽 끝, 집들 뒤 (도시 사람들도 걸어서 와요)
  memorialGarden: { id: 'v5_memorial', key: 'memorial_garden', lattice: [23.95, -19.54], px: L4(23.95, -19.54) },
  // 신문 아이콘: 화면 왼쪽 가장자리 (UI 칩 자리, P12)
  newsChip: { id: 'news', icon: 'ui_icon_newspaper' },
  // 이야기 카드: 화면 왼쪽 아래 520 × 120 (P12)
  storyCard: { w: 520, h: 120 },
};
