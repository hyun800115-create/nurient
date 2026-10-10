// The missions_bank job's two module entries for the ModuleHost (docs/v5_v8_plan.md §5.2). Nothing here runs until the
// lead's P1 block constructs them; v4 behaves exactly as today without it.
//   MISSIONS_MODULE — the board, request bubbles, events, daily / weekly / streaks, fame and titles   (slice 3 KB)
//   BANK_MODULE     — 서리 은행: savings, loans, the passbook, the counter queue, (v8) insurance      (slice 1 KB)

import { BALANCE } from '../data/balance.js';
import { MissionsHost } from './host.js';
import { sanitizeMissions, MISSIONS_SLICE } from './save.js';
import { BankHost } from '../bank/host.js';
import { sanitizeBank, BANK_SLICE } from '../bank/save.js';

const v5 = () => (BALANCE && BALANCE.v5) || {};
const rank2 = (gs) => !!(gs && gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2);

/** art and sound the module needs (late fragments: only these files) */
export const FRAGMENTS = {
  missions: { ui3: ['ui3_icons', 'ui_mission_card', 'ui_mission_card_done', 'ui_mission_board', 'ui_progress_bg', 'ui_progress_fill'], life2: ['life2_items', 'life2_decor'], audio3: ['sfx_mission_done', 'sfx_fame_up'] },
  bank: { civic: ['civ_bank'], fx_city: ['ui4_icons', 'ui_passbook', 'ui_passbook_row'], audio6: ['sfx_coin_count', 'sfx_stamp', 'sfx_ticket_chime', 'sfx_vault_door', 'amb_bank'] },
};

export const MISSIONS_MODULE = {
  id: 'missions', version: 1, saveKey: MISSIONS_SLICE.key, capBytes: MISSIONS_SLICE.cap,
  needs: ['story?', 'bank?', 'vehicles?'],
  gate: rank2,                                             // v5 starts at 읍
  prefetch: (gs, assets) => { for (const f in FRAGMENTS.missions) assets.fragment(f, { only: FRAGMENTS.missions[f].filter((k) => !/^sfx_/.test(k)), audio: FRAGMENTS.missions[f].filter((k) => /^sfx_/.test(k)) }); },
  create: (ports, saved) => new MissionsHost(ports, saved, { tuning: v5().missions }),
  sanitize: sanitizeMissions,
  previews: {
    // 이야기 미리보기: a request bubble at the nearest villager, and the title-up ceremony
    request: (host) => { const id = host.api.offer({ code: 'A1', key: 'preview' + Date.now() }); return id; },
    title: (host) => { if (host.banner) host.banner.show(2, 'Preview'); },
  },
};

export const BANK_MODULE = {
  id: 'bank', version: 2, saveKey: BANK_SLICE.key, capBytes: BANK_SLICE.cap,
  needs: ['missions?', 'story?'],
  gate: rank2,                                             // the account exists from v5; the building opens when built (P29)
  prefetch: (gs, assets) => { for (const f in FRAGMENTS.bank) assets.fragment(f, { only: FRAGMENTS.bank[f].filter((k) => !/^(sfx|amb)_/.test(k)), audio: FRAGMENTS.bank[f].filter((k) => /^(sfx|amb)_/.test(k)) }); },
  create: (ports, saved) => new BankHost(ports, saved, { tuning: v5().bank }),
  sanitize: sanitizeBank,
  previews: {
    loan: (host) => host.loanSheet && host.loanSheet.ask({ withdraw: 0, amount: 1800, fee: 90, total: 1890, short: 1800, covered: true }),
    vault: (host) => host.building && host.building.vault(),
  },
};

/** tick order of the plan: story → bank → missions → … */
export const MODULES = [BANK_MODULE, MISSIONS_MODULE];
