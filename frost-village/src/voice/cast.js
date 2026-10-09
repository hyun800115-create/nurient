// 눈꽃말 voices — who speaks with which voice (pure data + helpers, no Phaser).
// A resident keeps one voice type for life; residents that share a type still differ a little
// (VillageVoice derives a small pitch / tempo offset from the speaker id).

export const VOICE_TYPES = ['kid_boy', 'kid_girl', 'adult_m', 'adult_f', 'elder_m', 'elder_f', 'chief', 'big_gruff', 'sweet', 'squeaky'];

/** character key (assets villagers / villagers2 / villagers3 / workers) -> voice type */
export const CAST = {
  player: 'chief',
  npc_kid_boy: 'kid_boy', npc_kid_girl: 'kid_girl', npc_kid_prankster: 'kid_boy', npc_teen_girl: 'kid_girl',
  npc_young_man: 'adult_m', npc_aunt: 'adult_f', npc_uncle: 'big_gruff', npc_grandma: 'elder_f', npc_grandpa: 'elder_m',
  npc_merchant: 'adult_m', npc_herbalist: 'sweet', npc_bard: 'adult_m', npc_blacksmith: 'adult_f', npc_fashion: 'sweet',
  npc_yellow: 'adult_m', npc_red: 'adult_f', npc_blue: 'adult_m',
  npc_clerk_a: 'sweet', npc_clerk_b: 'adult_m', npc_porter_a: 'big_gruff', npc_porter_b: 'kid_boy',
  npc_captain: 'elder_m', npc_chef: 'big_gruff', npc_postman: 'adult_m', npc_doctor: 'adult_f', npc_painter: 'sweet',
  npc_guard: 'big_gruff', npc_skater: 'kid_girl', npc_toddler: 'squeaky',
  npc_sawyer: 'adult_m', npc_smoker: 'adult_m', npc_cannery: 'adult_f',
  fisherman: 'adult_m', lumberjack: 'big_gruff', farmer: 'adult_f', miner: 'adult_m', hunter: 'adult_m',
  fisherman_b: 'elder_m', fisherman_c: 'sweet', lumberjack_b: 'big_gruff', lumberjack_c: 'adult_m',
  farmer_b: 'elder_m', farmer_c: 'adult_f', miner_b: 'elder_m', miner_c: 'adult_m', hunter_b: 'big_gruff', hunter_c: 'adult_f',
  villager_a: 'adult_f', villager_b: 'adult_m', villager_c: 'kid_girl',
};

/** a few personas speak in a slightly different register (semitones added to the speaker offset) */
export const PERSONA_PITCH = { prankster: 1.2, teen: -1.6, showoff: 0.6, grumpy: -0.8, shy: 0.8, vain: 0.8, toddler: 1.5 };

/** FNV-1a 32-bit hash of a string (stable across browsers / Node) */
export function hashStr(s, h = 0x811c9dc5) {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * voice type for anything that can talk:
 *   'kid_girl'                        a voice type itself
 *   { voice: 'adult_f', id }          explicit
 *   a Resident ({ key, role })        CAST by character key, else by role (kid / teen / elder / adult)
 *   a town citizen ({ kind, id }) or its TownBody ({ c: citizen })   by kind (student / teen / elder / adult ...),
 *                                     gender picked by hash
 * Pets (role 'pet') -> null: they do not speak 눈꽃말.
 */
export function voiceFor(sp) {
  if (!sp) return 'adult_m';
  if (typeof sp === 'string') return VOICE_TYPES.indexOf(sp) >= 0 ? sp : (CAST[sp] || 'adult_m');
  if (sp.voice && VOICE_TYPES.indexOf(sp.voice) >= 0) return sp.voice;
  if (sp.isPet || sp.role === 'pet') return null;
  const key = sp.key || sp.charKey;
  if (key && CAST[key]) return CAST[key];
  // a town citizen's body (TownSim TownBody / Neighbours Actor / Visitor: key 'tf:<base>' is shared)
  const cz = sp.c || sp.citizen;                                   // TownBody / Actor: .c, Visitor: .citizen
  const role = cz && cz.kind ? cz.kind : (sp.role || sp.kind || 'adult');
  const h = hashStr(String(speakerId(sp)));
  if (role === 'kid' || role === 'student' || role === 'child') return (h & 1) ? 'kid_girl' : 'kid_boy';
  if (role === 'teen') return (h & 1) ? 'kid_girl' : 'adult_m';
  if (role === 'elder') return (h & 1) ? 'elder_f' : 'elder_m';
  if (role === 'toddler' || role === 'baby') return 'squeaky';
  const r = h % 10;
  return r < 4 ? 'adult_f' : r < 8 ? 'adult_m' : r < 9 ? 'sweet' : 'big_gruff';
}

/** a stable id for per-resident offsets (Resident: key; citizen: 'c' + id; plain strings as they are) */
export function speakerId(sp) {
  if (!sp) return '?';
  if (typeof sp === 'string') return sp;
  if (sp.voiceId !== undefined) return String(sp.voiceId);
  const cz = sp.c || sp.citizen;                                   // town citizen body / actor / visitor:
  if (cz && cz.id !== undefined) return 'c' + cz.id;               // the person, not the shared doll key
  if (sp.key) return sp.key;
  if (sp.id !== undefined) return (sp.kind ? 'c' : '') + sp.id;
  return '?';
}

/** persona pitch tweak (semitones) */
export function personaPitch(sp) {
  return sp && typeof sp === 'object' && sp.persona && PERSONA_PITCH[sp.persona] ? PERSONA_PITCH[sp.persona] : 0;
}
