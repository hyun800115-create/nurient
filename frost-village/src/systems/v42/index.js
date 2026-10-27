// (v4.2) builds the orchestrator and every v4.2 system in order, and installs the window.__FV.v42 test hooks.
// Order matters only where a system reads another in its constructor (the office's sites before Game.restoreV3).

import { V42 } from '../V42.js';
import { Settings } from '../../core/Save.js';
import { PickupPolicy } from '../PickupPolicy.js';
import { ChiefAura } from '../../entities/ChiefAura.js';
import { Navigator } from '../Navigator.js';
import { Freight } from '../Freight.js';
import { Surplus } from '../Surplus.js';
import { LineUpgrades } from '../LineUpgrades.js';
import { WarehouseCrew } from '../WarehouseCrew.js';
import { MeatCan } from '../MeatCan.js';
import { Office } from '../office/Office.js';
import { VillageNews } from '../VillageNews.js';
import { ChiefPilot } from '../pilot/ChiefPilot.js';
import { DepotSystem } from '../depot/DepotSystem.js';
import { V42Art } from './art.js';

// [name, factory(gs, v42, savedV42, wholeSave)] — in construction order
const SYSTEMS = [
  ['art', (gs, v) => new V42Art(gs, v)],            // (CODE-2) when the v4.2 art comes in
  ['pickup', (gs, v) => new PickupPolicy(gs, v)],
  ['aura', (gs, v) => new ChiefAura(gs, v)],
  ['nav', (gs, v) => new Navigator(gs, v)],
  ['freight', (gs, v, s) => new Freight(gs, v, s)],
  ['surplus', (gs, v) => new Surplus(gs, v)],
  ['lines', (gs, v, s) => new LineUpgrades(gs, v, s)],
  ['crew', (gs, v, s) => new WarehouseCrew(gs, v, s)],          // (v4.2 touch) 창고 직원 grow with what the village makes
  ['meatcan', (gs, v) => new MeatCan(gs, v)],                  // (v4.2.1) 고기 통조림: the cannery's second recipe + its porters
  ['office', (gs, v, s) => new Office(gs, v, s)],
  ['news', (gs, v, s) => new VillageNews(gs, v, s)],
  ['depot', (gs, v, s) => new DepotSystem(gs, v, s)],
  ['pilot', (gs, v, s, sv) => new ChiefPilot(gs, v, sv)],
];

export function buildV42(gs, sv) {
  const v = new V42(gs, sv);
  for (const [name, make] of SYSTEMS) {
    try { v.add(name, make(gs, v, v.saved, sv)); } catch (e) { console.error('[v42] could not make ' + name + ':', e); }
  }
  installHooks(gs, v);
  return v;
}

function installHooks(gs, v) {
  const H = window.__FV || (window.__FV = {});
  H.v42 = {
    v,
    state: () => v.state(),
    ledger: () => ({ rows: v.ledger.rows(), stocks: v.ledger.stocks(), total: v.ledger.total() }),
    settings: (o) => { if (o) { Object.assign(Settings.data, o); Settings.save(); v.settingsChanged(); } return Object.assign({}, Settings.data); },
    save: () => v.serialize(),
  };
  // (each system adds its own hooks: H.v42.pilot, H.v42.office, ...)
  for (const { sys } of v.systems) if (sys.hooks) { try { sys.hooks(H.v42); } catch (e) { /* */ } }
}
