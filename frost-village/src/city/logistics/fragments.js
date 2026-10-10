// The art and sound the logistics module uses (late fragments; pages per Residency class, see the build report §7).

export const FRAGMENTS = {
  // the shell + apron are needed whenever the centre is near; the inside pages while revealed or a dock door is open
  logistics: { always: ['lgx_center_a', 'lgx_center_d', 'lgx_items'], inside: ['lgx_center_b', 'lgx_center_c'],
               vehicles: ['lgx_forklift', 'lgx_forklift_loaded', 'lgx_delivery_van_red', 'lgx_delivery_van_blue', 'lgx_delivery_van_mint'],
               producers: ['lgx_producers'] },
  vehicles: ['veh_truck_cargo'],
  cityfolk: ['cf_head_0', 'cf_loco_0', 'cf_work_0', 'cf_social_0', 'cf_crowd_0'],     // cfPages.incidents.logistics (+ crowd: point / think / phone)
  fx_city: ['ui4_icons'],
  audio6: ['amb_warehouse', 'sfx_forklift_beep', 'sfx_stamp', 'sfx_coin_count', 'sfx_box_drop', 'sfx_box_drop_2', 'sfx_box_drop_3'],
};

