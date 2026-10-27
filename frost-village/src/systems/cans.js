// (v4.2.1 고기 통조림, docs/build_reports/v421_l0.md §10) which can the cannery makes next — a pure rule, no Phaser
// (tools/test/cans.test.mjs). A batch is 3 fish units (a tuna counts as 3) or 3 raw meat, and 1 ingot each.
//   - only one batch is ready → that one: the cannery never waits for one input while the other has a full batch
//   - both ready → the input holding more whole batches goes first; on a tie, not the kind made last (they alternate)
//   - the meat recipe only once the meat-can line was bought (meatOn)
// s = { fishUnits, meat, ingot, meatOn, last ('fish' | 'meat' | null), fishIn = 3, meatIn = 3 } → 'fish' | 'meat' | null

export function pickCanKind(s) {
  const fishIn = Math.max(1, Math.floor(Number(s.fishIn) || 3)), meatIn = Math.max(1, Math.floor(Number(s.meatIn) || 3));
  const ingot = Math.max(0, Number(s.ingot) || 0);
  const fu = Math.max(0, Number(s.fishUnits) || 0), mt = Math.max(0, Number(s.meat) || 0);
  const fish = fu >= fishIn && ingot >= 1;
  const meat = !!s.meatOn && mt >= meatIn && ingot >= 1;
  if (fish && !meat) return 'fish';
  if (meat && !fish) return 'meat';
  if (!fish && !meat) return null;
  const fb = Math.floor(fu / fishIn), mb = Math.floor(mt / meatIn);
  if (fb !== mb) return fb > mb ? 'fish' : 'meat';
  return s.last === 'fish' ? 'meat' : 'fish';
}
