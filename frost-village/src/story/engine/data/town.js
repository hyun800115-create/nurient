// The default town for the headless runner (the game passes its real buildings instead):
// civic buildings, shops, outdoor spots, the logistics centre, the bank, police and fire stations,
// enough homes for the population plus a few empty ones, and free plots for new shops.
// Coordinates are in a 0..120 grid (only used for travel times: fire trucks, chases).

export function defaultTown(nResidents) {
  const places = [];
  const P = (id, kind, x, y, extra) => places.push(Object.assign({ id, kind, x, y }, extra || {}));
  // centre
  P('plaza', 'plaza', 60, 60); P('park', 'park', 72, 48); P('playground', 'playground', 48, 70); P('ice_rink', 'ice_rink', 40, 52);
  P('beach_fire', 'beach_fire', 60, 18); P('harbor', 'harbor', 82, 14); P('forest', 'forest', 18, 40); P('farm', 'farm', 92, 66);
  P('mine', 'mine', 14, 92); P('memorial', 'memorial', 98, 40);
  P('town_hall', 'town_hall', 62, 54); P('school', 'school', 50, 80); P('clinic', 'clinic', 70, 72); P('police', 'police', 56, 66);
  P('fire_station', 'fire_station', 76, 62); P('bank', 'bank', 64, 64); P('post_office', 'post_office', 58, 58); P('station', 'station', 30, 66);
  P('logistics', 'logistics', 84, 84); P('furniture_workshop', 'furniture_workshop', 90, 80); P('appliance_factory', 'appliance_factory', 96, 88);
  P('library', 'library', 46, 58); P('newspaper', 'newspaper', 54, 52); P('builder_yard', 'builder_yard', 80, 92);
  // shops on the high street
  const shops = [['bakery', 2], ['cafe', 2], ['restaurant', 2], ['grocer', 1], ['fishmonger', 1], ['stall', 2], ['hardware', 1], ['furniture_store', 1],
    ['appliance_store', 1], ['bookstore', 1], ['florist', 1], ['toy_shop', 1], ['clothing', 1], ['general', 1], ['salon', 1]];
  let sx = 0;
  for (const [kind, n] of shops) for (let i = 0; i < n; i++) { P(kind + (n > 1 ? '_' + (i + 1) : ''), kind, 44 + (sx % 8) * 4, 60 + Math.floor(sx / 8) * 6, { shopSeed: sx }); sx++; }
  // homes in four neighbourhoods
  const homes = Math.ceil(nResidents / 2.55) + 6;
  for (let i = 0; i < homes; i++) {
    const nb = i % 4;
    const bx = [20, 96, 24, 100][nb], by = [20, 24, 104, 108][nb];
    const k = Math.floor(i / 4);
    P('home_' + (i + 1), 'home', bx + (k % 6) * 4, by + Math.floor(k / 6) * 4, { cap: [2, 3, 3, 4, 4, 5, 2, 3][i % 8], nb });
  }
  const plots = [];
  for (let i = 0; i < 8; i++) plots.push({ id: 'plot_' + (i + 1), size: i % 3 === 0 ? 'L' : 'M', x: 36 + i * 6, y: 96 });
  return { places, plots };
}
