// =====================================================================
//  (v5) 서리 은행 숫자표 (missions_bank 모듈) — 게임에 넣을 때 BALANCE.v5.bank 로 옮겨져요 (P20)
//  시간 단위: 게임 하루 = 600초. 이자는 매일 아침 6시에 붙어요.
// =====================================================================

export const BANK_TUNING = {
  // ── 은행 짓기: 칭호 '믿음직한 촌장'이 되거나 읍이 되고 afterMin 분이 지나면 공사장이 생겨요
  site: { coins: 9000, item_plank: 30, item_ingot: 20, time: 14, afterMin: 20 },
  interestPerDay: 0.01,     // 저금 이자: 하루에 1 % (아침 6시)
  interestHour: 6,          // 이자가 붙는 시각
  depositCap: 50000,        // 저금 한도 (이자는 이 한도까지만 붙어요 → 하루 최대 500)
  depositCapV6: 150000,     // 항구가 열리면 (v6) 저금 한도
  loanMinutes: 15,          // 대출 한도 = '지금 1분 수입' × 15
  loanFee: 0.05,            // 대출 수수료 5 % (한 번만, 이자는 없어요)
  repayShare: 0.1,          // 버는 돈의 10 % 로 저절로 갚아요 (코인이 0 밑으로 내려가는 일은 없어요)
  ceremonyShare: 0.5,       // 승격식 (도시·큰 도시) 은 비용의 절반까지 빌려줘요
  restructureDays: 6,       // 대출이 이만큼(게임 하루) 넘게 남아 있으면 수수료를 깎아 줘요 (두 번까지)
  restructures: 2,          //   그다음에는 천천히 갚아도 돼요 (자동으로 갚는 것을 멈춰요 — 저금하면 갚아져요)
  minLoan: 100,             // 이보다 적은 부족분은 빌려주지 않아요 (조금만 더 벌면 되니까요)
  // ── 은행 안 (창구와 번호표): 손님은 9시~17시에 와요
  branch: { open: 9, close: 17, windows: 3, queue: 3, seats: 2, serve: { deposit: 6, withdraw: 5, loan: 10, repay: 6, insurance: 7, other: 5 } },
  vaultAt: 5000,            // 촌장님이 한 번에 이만큼 넘게 저금하면 금고 문이 빙글 돌아요
  // ── (v8) 화재 보험: 건물 값의 0.4 % 를 매일 내면, 불타도 다시 짓는 돈을 100 % 받아요 (한 번 불에 한 번)
  insurance: { premiumPerDay: 0.004, cover: 1.0, rebuildLevelUp: 1 },
};

export function bankTuning(over) {
  const out = JSON.parse(JSON.stringify(BANK_TUNING));
  if (!over || typeof over !== 'object') return out;
  for (const k in out) {
    if (!(k in over)) continue;
    const a = out[k], b = over[k];
    if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object') Object.assign(a, b);
    else if (typeof b === typeof a) out[k] = b;
  }
  return out;
}
