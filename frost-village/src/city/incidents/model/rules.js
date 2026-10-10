// Who may play which part (docs/v5_v8_plan.md §6.7 "Rules"), the same rules as the story engine
// (src/story/engine/src/incidents.js canMisbehave / sameBand) so a scripted incident (previews, the lab, the fallback
// source) and a story incident cast the same kind of people. Pure.
//
//   person = { pid, age, role?, named?, kept? }      pid 'v:<key>' = a named villager (never a culprit)

export const BAND = { kid: 0, teen: 1, adult: 2, elder: 3 };
export function bandOf(age) { const a = Number(age) || 0; return a < 13 ? BAND.kid : a < 20 ? BAND.teen : a < 65 ? BAND.adult : BAND.elder; }

/** the town's helpers never turn into culprits */
export const ROLE_MODEL = /^(police|police_officer|detective|firefighter|teacher|doctor|nurse|banker|bank_teller|teller|bank_clerk)$/;
const isNamed = (p) => !!(p && (p.named || p.kept || /^v:/.test(String(p.pid || ''))));

/** may this person misbehave at all (never elders, helpers or the game's named villagers) */
export function canMisbehave(p) {
  if (!p) return false;
  if (bandOf(p.age) === BAND.elder) return false;
  if (p.role && ROLE_MODEL.test(p.role)) return false;
  return !isNamed(p);
}

/** may p be the culprit of `kind` */
export function canCulprit(p, kind) {
  if (!canMisbehave(p)) return false;
  const b = bandOf(p.age);
  if (kind === 'theft') return b === BAND.teen || b === BAND.adult;
  if (kind === 'window') return b === BAND.kid;
  if (kind === 'queue') return b >= BAND.teen;
  if (kind === 'scuffle') return b <= BAND.adult;
  return true;
}

/** two people of the same age band (grown-ups within 18 years), never grandparents */
export function sameBand(a, b) {
  const x = bandOf(a.age), y = bandOf(b.age);
  if (x !== y || x === BAND.elder) return false;
  return x < BAND.adult || Math.abs((a.age || 0) - (b.age || 0)) <= 18;
}

/** a scuffle pair is allowed */
export const canScuffle = (a, b) => !!(a && b && a.pid !== b.pid && canMisbehave(a) && canMisbehave(b) && sameBand(a, b));

/** the cityfolk preset a part is dressed in when the game has no body for that person */
export const ROLE_PRESET = { officer: 'police_officer', crew: 'firefighter', builder: 'construction_worker', demolisher: 'demolition_worker', mover: 'mover', culprit: 'burglar' };
