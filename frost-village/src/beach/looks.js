// Looks adapter (pure): the beach model asks a townsfolk compositor that knows the beachfolk rules — the merged
// townfolk + townfolk2 + beachfolk manifest (P5) — for people and for what they can play. In the lab and the Node
// tests the compositor is tools/beachfolk_compose.js `Beachfolk`; in the game it is the ported `TF` (P5: animParts,
// partPlays, animHideHead, pickAnim / animFallback). Only the model-side questions live here:
//   make(preset, R) · family(R) · ageOf(person) · canPlay(person, anim) · pickAnim(person, anim) -> anim really played

/** looks from a Beachfolk-like compositor (preset(name, rngFn), beachFamily(rngFn), canPlay, pickAnim -> { anim }) */
export function looksFrom(bf) {
  const T = bf.T;
  const fn = (R) => (R && R.fn ? R.fn : R && typeof R.next === 'function' ? () => R.next() : R);
  return {
    make: (preset, R) => {
      const name = T.generator.presets[preset] ? preset : 'beach_tourist';
      const p = bf.preset(name, fn(R));
      p.preset = name;
      return p;
    },
    family: (R) => bf.beachFamily(fn(R)).map((p) => Object.assign(p, { preset: 'family_beach' })),
    /** an ordinary (winter-dressed) townsperson: the polar swim's crowd */
    townsperson: (R) => bf.randomPerson(fn(R)),
    ageOf: (p) => (T.bases[p.base] && T.bases[p.base].age) || 'adult',
    canPlay: (p, anim) => bf.canPlay(p, anim),
    pickAnim: (p, anim) => { const r = bf.pickAnim(p, anim); return r && r.anim ? r.anim : anim; },
  };
}
