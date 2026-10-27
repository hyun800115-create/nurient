() => {
  const F = window.__FV, gs = F.scene, R = gs.civic.restaurant;
  R.R.spawnEvery = 2.2; F.restFood({ item_fish_cooked: 30, item_bread: 30, item_meat_cooked: 30 }); F.clearStack(); F.teleport(R.x - 260, R.y + 300);
  window.__day(12); R.setTables(2, true); R.hire('server2', true);
  window.__run(60);
  let n = 0;
  for (let i = 0; i < 50; i++) { window.__run(1); n++; const g = R.guests, eat = g.filter((q) => q.state === 'eat').length, sit = eat + g.filter((q) => q.state === 'seated').length; if (eat >= 4 && sit >= 10) break; }
  const g = R.guests;
  return { x: R.x, y: R.y, n, eat: g.filter((q) => q.state === 'eat').length, seated: g.filter((q) => q.state === 'seated').length };
}
