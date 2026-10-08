// Condition flags a template alternative can require ('?kid friend?') or forbid ('?!rival?').
// The realizer computes one bitmask per line (4 x 32 bits) and every compiled alternative carries
// its required / forbidden masks, so choosing a line costs a few integer ANDs per alternative.

export const CONDS = [
  // speaker age group, sex
  'toddler', 'kid', 'teen', 'adult', 'elder', 'male', 'female',
  // listener
  'l_kid', 'l_teen', 'l_adult', 'l_elder', 'l_chief', 'l_male', 'l_female', 'l_newcomer',
  // relationship (speaker -> listener)
  'stranger', 'acq', 'friend', 'best', 'sweet', 'spouse', 'family', 'rival', 'close', 'crush', 'parent', 'child',
  // speech level
  'ban', 'yo', 'hon',
  // traits of the speaker
  'chatty', 'shy', 'prank', 'kind', 'grumpy', 'curious', 'romantic', 'vain', 'thrifty', 'honest', 'gossip',
  'clumsy', 'diligent', 'funny', 'sleepy', 'foodie', 'brave',
  // mood / state
  'happy', 'sad', 'tired', 'hungry', 'married', 'haskids', 'newcomer', 'rich', 'poor', 'loan', 'owner',
  // time & weather
  'morning', 'noon', 'evening', 'night', 'weekend', 'snow', 'blizzard', 'sunny', 'cloudy', 'fog', 'cold', 'mild',
  // the fact / memory being talked about
  'ex1', 'ex2', 'ex3', 'anon', 'distort', 'self', 'lself', 'lvictim', 'seen', 'told', 'news', 'did', 'caught',
  'escaped', 'ruin', 'minor', 'known', 'old', 'fresh', 'plural', 'pos', 'neg',
  // jobs of the speaker
  'j_police', 'j_fire', 'j_bank', 'j_logi', 'j_teacher', 'j_doctor', 'j_food', 'j_reporter', 'j_student',
  'j_retired', 'j_builder', 'j_nature', 'j_none', 'j_shop',
  // where the conversation happens, and a few things about the listener
  'athome', 'atwork', 'atschool', 'atshop', 'outdoors', 'l_owner', 'l_police', 'l_fire', 'l_kidof', 'l_worried',
  'lkid', 'samejob', 'neighbor', 'cowork', 'classmate', 'grand', 'sibling', 'twice', 'many', 'big', 'self2', 'x_elder',
];

if (CONDS.length > 128) throw new Error('story: too many condition flags (' + CONDS.length + ' > 128)');

export const COND = Object.create(null);
CONDS.forEach((n, i) => { COND[n] = i; });

/** set flag `name` in the 4-word mask array */
export function setFlag(mask, name) {
  const i = COND[name];
  if (i === undefined) throw new Error('story: unknown condition ' + name);
  mask[i >> 5] |= 1 << (i & 31);
}
