// Item lists the code shares (what each seller takes, which items are tools / food / materials),
// and price lookups that read balance.js at the moment of use (so test overrides apply).

import { BALANCE } from './balance.js';

export const FOODS = ['item_fish_cooked', 'item_bread', 'item_meat_cooked'];
export const GOODS = ['item_plank', 'item_ingot'];
export const TOOLS = ['item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'];
// the general store (v3) sells cans and tools
export const STORE_GOODS = ['item_can'].concat(TOOLS);
// what miners eat (v3)
export const MINER_FOOD = ['item_bread', 'item_meat_cooked'];
// building materials (v3)
export const MATERIALS = ['item_plank', 'item_ingot'];
export const FISH = ['item_fish_raw', 'item_fish_big'];
// every item a save may hold
export const ITEMS = ['item_fish_raw', 'item_fish_cooked', 'item_log', 'item_plank', 'item_wheat', 'item_bread', 'item_ore', 'item_ingot', 'item_meat_raw', 'item_meat_cooked',
  'item_can', 'item_fish_big'].concat(TOOLS);

// the worker each tool lets you hire a second time
export const TOOL_OF = { lumberjack: 'item_axe', miner: 'item_pickaxe', fisherman: 'item_rod', farmer: 'item_sickle', hunter: 'item_bow' };

/** coins for one item (balance.js prices, then prices3) */
export function priceOf(type) {
  const p = (BALANCE.prices && BALANCE.prices[type]) || (BALANCE.prices3 && BALANCE.prices3[type]);
  const n = Math.floor(Number(p));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
