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
  // who the story is about (X = the main person of the fact), more listener facts
  'x_kid', 'x_adult', 'x_plural_kids', 'l_shy', 'l_elder_rel', 'first_talk', 'chief_talk', 'x_police', 'x_newcomer', 'housemate',
  // what an apology was for (the fact it refers to)
  'ref_theft', 'ref_queue', 'ref_window', 'ref_scuffle',
  // the fact happened at the speaker's own home
  'myhome',
  // the fact is a sad one (a gentle farewell): no 'big news!' openers
  'grave',
  // talking in a café, restaurant or food stall (no 'did you come grocery shopping?')
  'atcafe',
  // the speaker's version lost the place ('somewhere, a fire!')
  'noplace',
  // the listener is about to ask 'who told you?': the teller does not name the source first
  'srcq',
  // a child under seven (kindergarten age): '유치원 다녀요', not '학교 다녀요'
  'little',
  // the story is from today or yesterday ('오늘 신문 봤어?' only about this morning's paper)
  'recent',
  // 14:00-17:00 ('학교 끝났어?' after school, not at nine in the morning)
  'afternoon',
  // which pet the story is about (the dog is the default): the cat does not pull sleds, the penguin has no tail to wag
  'pet_cat', 'pet_peng',
];

if (CONDS.length > 160) throw new Error('story: too many condition flags (' + CONDS.length + ' > 160)');

// Conversation tags: an alternative can mark what it said ('=meal' — it asked whether you have eaten) and
// the next line can require ('^meal') or forbid ('!^meal') it, so replies answer what was actually said.
// '@paper' / '!@paper' test the tags already set earlier in the same line (no double "in the paper").
export const TAGS = [
  'q', 'meal', 'how', 'where', 'busy', 'doing', 'sleepq', 'praise', 'play', 'go', 'snowman', 'snowfight', 'sled',
  'cold', 'snowy', 'sunny', 'windy', 'foggy', 'mild', 'miss', 'tired', 'hungry', 'happy', 'sad', 'hw', 'work',
  'paper', 'newsq', 'visited', 'plansq', 'taste', 'why', 'age', 'live', 'likeq', 'joke', 'thanks', 'sorry',
  'bung', 'cocoa', 'taller', 'sick', 'price', 'save', 'news', 'icicle', 'stars', 'dog', 'train', 'shopq',
  'late', 'again', 'long', 'newq', 'back', 'food', 'hobby', 'invite', 'dream', 'oldq', 'gift', 'help',
  'often', 'tongue', 'angel', 'igloo', 'scarf', 'cheap', 'pricey', 'chiefq', 'chiefdo', 'petsaw', 'petplay', 'trainq',
  'traveldream', 'driver', 'shopnew', 'shopnice', 'tired_work', 'police_kid', 'firecheck', 'bankkid', 'loanbusy',
  'logibusy', 'customers', 'newmenu', 'teacher', 'doctor', 'harvest', 'build', 'reporter', 'retired', 'jobless',
  'whyfight', 'differ', 'doubt', 'dinner', 'day',
  'how2', 'meal2', 'plans2', 'age2', 'hurtq', 'firetruck', 'ring',
  'newsq2',  // 'not yet — what did the paper say?'
  'visit',   // 'can I come and see the baby?'
  'yes',     // 'sure, let's go!' (an invitation accepted)
  'hair',    // 'did you get a haircut?'
  'newfam',  // 'what are the new neighbours like?'
  'leave',   // a goodbye that already says 'I have to go' (no second 'I have to go' in the same line)
  'wish',    // a goodbye that wishes the listener well ('잘 가!', '감기 조심해!'): the reply may wish back ('{V}도 잘 가!')
  'goq',     // 'leaving already?' said to the one who is leaving
  'errand',  // 'I'm going shopping — shall I get you anything?'
  'clothes', // a compliment on something one wears ('목도리 예쁘다!' — '응! 어제 샀어.')
]; 
if (TAGS.length > 128) throw new Error('story: too many conversation tags (' + TAGS.length + ' > 128)');
export const TAG = Object.create(null);
TAGS.forEach((n, i) => { TAG[n] = i; });

export const COND = Object.create(null);
CONDS.forEach((n, i) => { COND[n] = i; });

/** set flag `name` in the 4-word mask array */
export function setFlag(mask, name) {
  const i = COND[name];
  if (i === undefined) throw new Error('story: unknown condition ' + name);
  mask[i >> 5] |= 1 << (i & 31);
}
