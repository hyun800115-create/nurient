// (v4.2) builds the orchestrator and every v4.2 system in order, and installs the window.__FV.v42 test hooks.
// Order matters only where a system reads another in its constructor (the office's sites before Game.restoreV3).

import { V42 } from '../V42.js';
import { Settings } from '../../core/Save.js';
import { PickupPolicy } from '../PickupPolicy.js';
import { ChiefAura } from '../../entities/ChiefAura.js';
import { Navigator } from '../Navigator.js';

// [name, factory(gs, v42, savedV42, wholeSave)] — in construction order
const SYSTEMS = [
  ['pickup', (gs, v) => new PickupPolicy(gs, v)],
  ['aura', (gs, v) => new ChiefAura(gs, v)],
  ['nav', (gs, v) => new Navigator(gs, v)],
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
