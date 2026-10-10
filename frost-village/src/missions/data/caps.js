// What a mission needs from the village ("capabilities"), so the board never offers a dead end.
// Every template's requirements = its unlock + need + what its objectives imply (items it asks for must be
// producible, places must exist, counters must have a source). The model asks the game (env.has) for each of
// them before offering; tools/test/missions_lab/missions.test.mjs proves statically that every implied requirement
// is covered by the template's declared unlock / need under CLOSURE (so no template can be offered half-possible).
//
// Fact names (the host answers env.has(name), docs/build_reports/missions_bank.md "Facts"):
//   rank:N · b:<building> · item:<item> (producible now) · craft:bouquet|cake|gift · p:<place> · sig:<counter source>
//   life · paper · toggle:farewell|incidents · v6 · v6:star2 · v7 · v7:star2 · v8 · import:sugar · veh:sled|truck
//   fame:N (answered by the model itself) · shops:N · towers:N · pet:<key> · v:<key>   (counts: env.count)
//   step:<how> — a step another module performs (drive: vehicles_runtime, contract: harbour, choose / tap: beach) is
//   offered only while that module is wired: the host answers it (critique C-2), never the static closure.

/** items the v4 village makes (the chief can carry them) → the fact that says they can be made now */
export const V4_ITEMS = ['item_fish_raw', 'item_fish_cooked', 'item_log', 'item_plank', 'item_wheat', 'item_bread', 'item_ore', 'item_ingot',
  'item_meat_raw', 'item_meat_cooked', 'item_can', 'item_fish_big', 'item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'];

/** mission items (life2 art) that live in the mission bag, not in the v4 stack: how the chief gets one */
export const BAG_ITEMS = {
  item_bouquet: 'craft:bouquet',   // stand 3 s at a 꽃밭, or buy at the town's 꽃집 (25)
  item_cake: 'craft:cake',         // the 빵집 아주머니 bakes one from 12 bread (20 s)
  item_gift_box: 'craft:gift',     // any 3 goods on the 잡화점's 선물 포장 pad
  item_letter: null,               // handed over by the giver when the request is accepted
};

/** places a mission sends the chief to → the fact that says the place exists */
export const PLACE_CAP = {
  'p:snowman': 'p:snowman', 'p:plaza': 'p:plaza', 'p:board': 'p:board', 'p:farm': 'p:farm', 'p:auction': 'v6', 'p:picnic': 'p:picnic', 'p:feast': 'p:feast', 'p:officiant': 'p:officiant',
  'p:statue': 'p:statue', 'p:festival': 'p:festival', 'p:carpenter': 'p:carpenter', 'p:school_gate': 'p:school_gate',
  'p:towers': 'p:towers', 'p:rink': 'b:deco_rink', 'p:depot': 'b:depot', 'p:school': 'b:school', 'p:clinic': 'b:clinic',
  'p:memorial': 'b:memorial', 'p:reporter': 'paper', 'p:old_sign': 'p:old_sign',
  'p:sailor_lodge': 'v6', 'p:lighthouse': 'v6', 'p:harbor_market': 'v6',
  'p:beach_gate': 'v7', 'p:warm_coast': 'v7', 'p:polar': 'v7', 'p:sandcastles': 'v7', 'p:aquarium': 'b:mini_aquarium',
  'p:logistics_office': 'v8', 'p:hydrant': 'v8',
};

/** counter signals → the fact that says something can produce them */
export function sigCap(sig) {
  if (sig.startsWith('sold:') || sig.startsWith('traded:')) return 'item:' + sig.slice(sig.indexOf(':') + 1);
  if (sig === 'made:item_cake') return 'import:sugar';
  if (sig === 'made:furniture' || sig === 'made:appliance') return 'v8';
  if (sig.startsWith('made:')) return 'item:' + sig.slice(5);
  if (sig.startsWith('catch:')) return 'item:' + sig.slice(6);
  if (sig.startsWith('dog:')) return 'dog';
  return ({
    cust: 'rank:2', wholesale: 'rank:2', visitor: 'rank:2', riders: 'rank:2', chat: 'rank:2', req_done: 'rank:2',
    combo: 'b:big_restaurant', bus_riders: 'b:depot', chief_ride: 'b:depot', tax: 'b:town_hall', flower: 'b:deco_flowers',
    celebrate: 'life', paper_read: 'paper', auction: 'v6', export: 'v6', 'ride:coast': 'v6',
    beach_guest: 'v7', hotel_guest: 'v7', settle: 'v8', deposit: 'b:bank',
  })[sig] || ('sig:' + sig);
}

/** step kinds → what has to run for the host to stage them */
export function stepCaps(o) {
  const out = [];
  // steps another module performs: only while it runs (step:<how> is answered by the host from the wired modules)
  if (o.how === 'drive') out.push(o.vehicle === 'dog_sled' ? 'veh:sled' : 'veh:truck', 'step:drive');
  if (o.how === 'contract') out.push('v6', 'step:contract');
  if (o.how === 'choose' && !o.soft) out.push('step:choose');
  if (o.how === 'tap') out.push('v7', 'step:tap');
  // steps the missions host stages itself (stand, speech, find, return, lead, escort, carry, identify, ask, pay)
  if (o.how === 'escort') out.push('life');
  if (o.how === 'ask') out.push('paper');
  if (o.how === 'carry' || o.how === 'identify') out.push('v8');
  if (o.how === 'find' && ['swim_ring', 'litter', 'shell'].indexOf(o.what) >= 0) out.push('v7');
  if (o.at && PLACE_CAP[o.at]) out.push(PLACE_CAP[o.at]);
  if (o.to && PLACE_CAP[o.to]) out.push(PLACE_CAP[o.to]);
  return out;
}

/** step kinds the missions host performs by itself (the rest come from other modules: report / feed) */
export const HOST_STEPS = ['stand', 'speech', 'find', 'return', 'lead', 'escort', 'carry', 'identify', 'ask', 'pay'];

/** every requirement of a template (declared + implied), as fact names */
export function requirements(t) {
  const req = new Set();
  for (const c of t.unlock || []) req.add(c);
  for (const c of t.need || []) req.add(c);
  for (const o of t.obj || []) {
    if (o.t === 'deliver') {
      const items = o.items ? Object.keys(o.items) : (o.any || []);
      for (const k of items) {
        if (k in BAG_ITEMS) { if (BAG_ITEMS[k]) req.add(BAG_ITEMS[k]); }
        else req.add('item:' + k);
      }
      if (o.to && PLACE_CAP[o.to]) req.add(PLACE_CAP[o.to]);
    } else if (o.t === 'count') req.add(sigCap(o.sig));
    else if (o.t === 'step') for (const c of stepCaps(o)) req.add(c);
    else if (o.t === 'build') req.add('site:' + o.key);
  }
  if (t.kind === 'weekly' && t.sig) req.add(sigCap(t.sig));
  return req;
}

/** facts that are dynamic only (counts, people, running modules): checked at offer time, never implied */
export function isDynamic(cap) { return /^(shops|towers):\d+$/.test(cap) || /^(pet|v|veh|step):/.test(cap) || /^fame:\d+$/.test(cap); }

// ---------------------------------------------------------------------------------------------------------------
// CLOSURE: what an unlock fact guarantees in the game as it is designed (v4 rules + docs/v5_v8_plan.md §2–§4).
// 읍 (rank 2) needs all five founded shops (cafe after zone_farm, restaurant after zone_hunt, carpenter after
// zone_forest, hardware after b:toolsmith, supermarket after b:cannery), so every v4 line runs; the town (with its
// 꽃집, 학교, 병원) is open; 콩이 is there; the plaza has its snowman, notice board and picnic space.
const RANK2 = ['rank:2', 'dog', 'p:snowman', 'p:plaza', 'p:board', 'p:farm', 'p:picnic', 'p:feast', 'p:officiant', 'p:statue', 'p:festival', 'p:carpenter',
  'p:school_gate', 'p:towers', 'craft:bouquet', 'craft:cake', 'site:memorial', 'b:station', 'b:toolsmith', 'b:cannery']
  .concat(V4_ITEMS.filter((k) => k !== 'item_fish_big').map((k) => 'item:' + k));
export const CLOSURE = {
  'rank:2': RANK2,
  'rank:3': ['rank:2', 'p:old_sign'],
  'life': ['rank:2'],                       // the story (and so every life beat) runs from v5 = 읍
  'paper': ['life'],                        // the paper starts the morning after the first wedding
  'b:boat_fishing': ['item:item_fish_big'],
  'b:deco_flowers': ['craft:bouquet'],
  'b:store': ['craft:gift'],
  'v6': ['rank:3', 'p:sailor_lodge', 'p:lighthouse', 'p:harbor_market'],   // the harbour opens after 도시
  'v6:star2': ['v6'],
  'import:sugar': ['v6'],
  'v7': ['v6', 'p:beach_gate', 'p:warm_coast', 'p:polar', 'p:sandcastles'],  // the beach opens at harbour ★2
  'v7:star2': ['v7'],
  'b:mini_aquarium': ['v7'],
  'b:swimwear_shop': ['v7'],
  'v8': ['v7', 'p:logistics_office', 'p:hydrant'],
};

/** the facts implied by a list of unlock / need facts (transitive) */
export function closureOf(caps) {
  const out = new Set();
  const add = (c) => { if (out.has(c)) return; out.add(c); for (const x of CLOSURE[c] || []) add(x); };
  for (const c of caps) add(c);
  return out;
}
