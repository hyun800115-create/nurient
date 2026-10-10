// What the logistics centre stores: every item id the game or the story engine uses, its rack category (the six
// rack categories of assets/logistics `rackCategories`) and the rack art that stands for it on the shelves.
// Pure data. Unknown items fall back to `goods` (a cardboard box) so nothing is ever refused for its name.

export const CATS = ['materials', 'food', 'goods', 'tools', 'furniture', 'appliances'];
export const FURNITURE = ['item_chair', 'item_table', 'item_sofa', 'item_bed', 'item_wardrobe'];
export const APPLIANCES = ['item_radio', 'item_stove_iron', 'item_washer', 'item_fridge', 'item_tv_retro'];

// item id -> [category, rack art key]
const T = {
  // materials (floor bays: pallets)
  item_log: ['materials', 'pallet_logs'], item_plank: ['materials', 'pallet_planks'], item_ore: ['materials', 'pallet_ore'],
  item_ingot: ['materials', 'pallet_ingots'], item_wheat: ['materials', 'pallet_boxes'], item_yarn: ['materials', 'pallet_boxes'],
  // food (crates)
  item_fish_raw: ['food', 'item_crate_food'], item_fish_big: ['food', 'item_crate_food'], item_fish_cooked: ['food', 'item_crate_food'],
  item_bread: ['food', 'item_crate_bread'], item_cake: ['food', 'item_crate_bread'], item_cookie: ['food', 'item_crate_bread'],
  item_meat_raw: ['food', 'item_crate_smoked'], item_meat_cooked: ['food', 'item_crate_smoked'],
  item_milk: ['food', 'item_crate_produce'], item_apple: ['food', 'item_crate_produce'], item_sweet_potato: ['food', 'item_crate_produce'],
  item_egg: ['food', 'item_crate_produce'], item_tteok: ['food', 'item_crate_produce'], item_bungeoppang: ['food', 'item_crate_bread'],
  item_cocoa: ['food', 'item_crate_cans'], item_coffee: ['food', 'item_crate_cans'], item_soup: ['food', 'item_crate_cans'],
  // goods (crates, cloth rolls, parcels)
  item_can: ['goods', 'item_crate_cans'], item_scarf: ['goods', 'item_cloth_rolls'], item_mittens: ['goods', 'item_cloth_rolls'],
  item_hat: ['goods', 'item_cloth_rolls'], item_cloth: ['goods', 'item_cloth_rolls'], item_sugar: ['goods', 'item_crate_jam'],
  item_jam: ['goods', 'item_crate_jam'], item_glass: ['goods', 'cardboard_box_l'], item_spice: ['goods', 'item_crate_jam'],
  item_book: ['goods', 'cardboard_box_s'], item_flower: ['goods', 'cardboard_box_m'], item_toy: ['goods', 'cardboard_box_m'],
  item_teddy: ['goods', 'cardboard_box_m'], item_candle: ['goods', 'cardboard_box_s'], item_sled: ['goods', 'cardboard_box_l'],
  item_skates: ['goods', 'cardboard_box_m'],
  // tools
  item_axe: ['tools', 'item_crate_tools'], item_pickaxe: ['tools', 'item_crate_tools'], item_sickle: ['tools', 'item_crate_tools'],
  item_rod: ['tools', 'item_toolbox'], item_bow: ['tools', 'item_toolbox'], item_toolbox: ['tools', 'item_toolbox'],
  item_shovel: ['tools', 'item_crate_tools'],
  // furniture / appliances (the items themselves)
  item_chair: ['furniture', 'item_chair'], item_table: ['furniture', 'item_table'], item_sofa: ['furniture', 'item_sofa'],
  item_bed: ['furniture', 'item_bed'], item_wardrobe: ['furniture', 'item_wardrobe'],
  item_radio: ['appliances', 'item_radio'], item_stove_iron: ['appliances', 'item_stove_iron'], item_washer: ['appliances', 'item_washer'],
  item_fridge: ['appliances', 'item_fridge'], item_tv_retro: ['appliances', 'item_tv_retro'],
};

const ID = /^item_[a-z0-9_]{1,24}$/;
/** is this a well-formed item id the centre can hold */
export const isItem = (k) => typeof k === 'string' && ID.test(k);
/** rack category of an item */
export function catOf(item) { const e = T[item]; return e ? e[0] : 'goods'; }
/** rack art key standing for this item on its shelf */
export function rackKeyOf(item) { const e = T[item]; return e ? e[1] : 'cardboard_box_m'; }
/** is the item furniture / an appliance (the 3rd-industry chains) */
export const kindOf = (item) => (FURNITURE.includes(item) ? 'furniture' : APPLIANCES.includes(item) ? 'appliance' : null);
export const KNOWN = Object.keys(T);
