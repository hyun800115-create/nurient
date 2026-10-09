// Goods the residents buy, sell, stock, steal (petty, cute) and talk about. Ids follow the game's
// item ids where they exist (src/data/items.js, assets/logistics items). Prices are defaults; the
// game overrides them with engine.setPrices({...}).
//   cat: food | materials | goods | furniture | tools | appliances   (logistics rack categories)
//   ctr: Korean counter word, petty: can be pinched by a petty thief

export const ITEMS = [
  // food
  ['item_bread', '빵', 'bread', '개', 'food', 7, 1],
  ['item_fish_cooked', '구운 생선', 'grilled fish', '마리', 'food', 4, 1],
  ['item_meat_cooked', '훈제 고기', 'smoked meat', '덩이', 'food', 12, 1],
  ['item_can', '통조림', 'canned fish', '개', 'food', 12, 1],
  ['item_fish_raw', '생선', 'fish', '마리', 'food', 3, 1],
  ['item_fish_big', '참치', 'tuna', '마리', 'food', 20, 0],
  ['item_cake', '케이크', 'cake', '개', 'food', 15, 1],
  ['item_cookie', '쿠키', 'cookies', '개', 'food', 3, 1],
  ['item_milk', '우유', 'milk', '병', 'food', 4, 1],
  ['item_apple', '사과', 'apples', '개', 'food', 3, 1],
  ['item_sweet_potato', '군고구마', 'roasted sweet potatoes', '개', 'food', 3, 1],
  ['item_bungeoppang', '붕어빵', 'fish-shaped buns', '개', 'food', 2, 1],
  ['item_cocoa', '코코아', 'hot cocoa', '잔', 'food', 4, 0],
  ['item_coffee', '커피', 'coffee', '잔', 'food', 5, 0],
  ['item_soup', '어묵탕', 'fishcake soup', '그릇', 'food', 6, 0],
  ['item_tteok', '떡', 'rice cakes', '개', 'food', 5, 1],
  ['item_egg', '달걀', 'eggs', '개', 'food', 1, 1],
  // materials
  ['item_log', '통나무', 'logs', '개', 'materials', 2, 0],
  ['item_plank', '판자', 'planks', '장', 'materials', 5, 0],
  ['item_ore', '광석', 'ore', '개', 'materials', 3, 0],
  ['item_ingot', '주괴', 'ingots', '개', 'materials', 10, 0],
  ['item_wheat', '밀', 'wheat', '단', 'materials', 2, 0],
  ['item_yarn', '털실', 'yarn', '뭉치', 'materials', 4, 1],
  // goods
  ['item_scarf', '목도리', 'scarf', '개', 'goods', 10, 1],
  ['item_mittens', '손모아장갑', 'mittens', '켤레', 'goods', 8, 1],
  ['item_hat', '털모자', 'woolly hat', '개', 'goods', 12, 1],
  ['item_book', '책', 'book', '권', 'goods', 9, 0],
  ['item_flower', '꽃다발', 'bouquet', '개', 'goods', 12, 1],
  ['item_toy', '장난감 기차', 'toy train', '개', 'goods', 15, 1],
  ['item_teddy', '곰 인형', 'teddy bear', '개', 'goods', 18, 1],
  ['item_candle', '양초', 'candles', '개', 'goods', 2, 1],
  ['item_sled', '썰매', 'sled', '대', 'goods', 35, 0],
  ['item_skates', '스케이트', 'skates', '켤레', 'goods', 30, 0],
  // tools
  ['item_axe', '도끼', 'axe', '자루', 'tools', 40, 0],
  ['item_pickaxe', '곡괭이', 'pickaxe', '자루', 'tools', 40, 0],
  ['item_rod', '낚싯대', 'fishing rod', '대', 'tools', 40, 0],
  ['item_toolbox', '공구함', 'toolbox', '개', 'tools', 30, 0],
  ['item_shovel', '눈삽', 'snow shovel', '자루', 'tools', 15, 1],
  // furniture
  ['item_chair', '의자', 'chair', '개', 'furniture', 25, 0],
  ['item_table', '식탁', 'dining table', '개', 'furniture', 60, 0],
  ['item_sofa', '소파', 'sofa', '개', 'furniture', 120, 0],
  ['item_bed', '침대', 'bed', '개', 'furniture', 150, 0],
  ['item_wardrobe', '옷장', 'wardrobe', '개', 'furniture', 110, 0],
  // appliances
  ['item_fridge', '냉장고', 'fridge', '대', 'appliances', 200, 0],
  ['item_stove_iron', '무쇠 난로', 'iron stove', '대', 'appliances', 140, 0],
  ['item_washer', '세탁기', 'washing machine', '대', 'appliances', 180, 0],
  ['item_radio', '라디오', 'radio', '대', 'appliances', 50, 0],
  ['item_tv_retro', '텔레비전', 'television', '대', 'appliances', 220, 0],
].map(([id, ko, en, ctr, cat, price, petty], idx) => ({ id, idx, ko, en, ctr, cat, price, petty: !!petty }));

export const ITEM_BY_ID = Object.create(null);
for (const it of ITEMS) ITEM_BY_ID[it.id] = it;

// what each kind of shop sells (shop kind -> item ids), used for errands, stock and settlement
export const SHOP_SELLS = {
  bakery: ['item_bread', 'item_cake', 'item_cookie'],
  cafe: ['item_coffee', 'item_cocoa', 'item_cake', 'item_cookie'],
  restaurant: ['item_fish_cooked', 'item_meat_cooked', 'item_soup'],
  grocer: ['item_can', 'item_milk', 'item_apple', 'item_egg', 'item_tteok', 'item_sweet_potato'],
  fishmonger: ['item_fish_raw', 'item_fish_big', 'item_can'],
  stall: ['item_bungeoppang', 'item_sweet_potato', 'item_cocoa'],
  hardware: ['item_toolbox', 'item_shovel', 'item_axe', 'item_pickaxe', 'item_candle'],
  furniture_store: ['item_chair', 'item_table', 'item_sofa', 'item_bed', 'item_wardrobe'],
  appliance_store: ['item_fridge', 'item_stove_iron', 'item_washer', 'item_radio', 'item_tv_retro'],
  bookstore: ['item_book'],
  florist: ['item_flower'],
  toy_shop: ['item_toy', 'item_teddy', 'item_sled', 'item_skates'],
  clothing: ['item_scarf', 'item_mittens', 'item_hat', 'item_yarn'],
  general: ['item_can', 'item_candle', 'item_yarn', 'item_shovel', 'item_rod'],
};
