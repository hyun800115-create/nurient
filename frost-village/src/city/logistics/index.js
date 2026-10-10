// logistics_runtime module entry for the ModuleHost (docs/v5_v8_plan.md §5.2 / §6.6). Nothing runs until the lead's
// P1 block constructs it; v4 behaves exactly as today without it.
//   LOGISTICS_MODULE — 솔방울 물류센터: the bank manager's letter after beach ★2, the cutaway centre at c_logistics
//   (tap / hover reveals real stock on the racks, the forklift, pickers, the packer, the clerk), shop owners settling
//   with a stamp, freight in and out at the two dock bays, the furniture workshop and the appliance factory, and the
//   살림살이 deliveries to homes (slice `logistics`, 2 KB).

import { LogisticsHost } from './host.js';
import { LgxView } from './view/LgxView.js';
import { sanitizeLogistics, LOGISTICS_SLICE } from './save.js';

import { FRAGMENTS } from './fragments.js';

export { FRAGMENTS };

const beachStar2 = (gs) => !!(gs && gs.later && gs.later.beach && typeof gs.later.beach.star === 'function' && gs.later.beach.star() >= 2);

export const LOGISTICS_MODULE = {
  id: 'logistics', version: 1, saveKey: LOGISTICS_SLICE.key, capBytes: LOGISTICS_SLICE.cap,
  needs: ['vehicles?', 'story?', 'missions?', 'beach?'],
  gate: beachStar2,                                          // the letter comes after beach ★2 (a save with the slice opens it at once)
  prefetch: (gs, assets) => {
    assets.fragment('logistics', { only: FRAGMENTS.logistics.always });
    assets.fragment('audio6', { audio: ['sfx_stamp', 'sfx_coin_count'] });
  },
  // ports.place: 'A' (default: passes the plan's layout checker with the v6 south sea) | 'plan' (see the build report)
  // ports.balance: the game's BALANCE (its v8.logistics table wins over tuning.js)
  create: (ports, saved) => new LogisticsHost(ports, saved, { View: LgxView, place: ports && ports.place, BALANCE: ports && ports.balance }),
  sanitize: sanitizeLogistics,
  previews: {
    // 이야기 미리보기 (designer menu, §5.8): 물류 센터 열기
    open: (host) => host.preview(),
  },
};

export const MODULES = [LOGISTICS_MODULE];
