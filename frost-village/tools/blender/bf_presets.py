"""
bf_presets.py - beachfolk palettes, colour slots, per-part anim sets, rules and presets (CONTRACT_V7 Y).
Pure python; bf_pack copies these into assets/beachfolk/manifest.json (block beachfolk).

Presets (same format as tf_presets.PRESETS / tf2_presets.PRESETS2, plus the beachfolk keys below):
  swimmer, sunbather, family_beach (parent / kid), lifeguard, bellhop, receptionist, doorman, housekeeper,
  icecream_vendor, beach_bar_staff, surfer, beach_tourist
  ('beach_tourist' = the contract's "tourist": assets/harbor/townfolk_presets.json already defines a winter
  harbour 'tourist', so the beach one gets its own key and both can be loaded together.)

Beachfolk preset keys (read by beachfolk_compose.generate3, ignored by the v4 / v5 generators):
  addOns  [[{part: weight}, chance], ...]   optional extra parts picked in order after the v4 generator
  anims   the anims this preset is made for (a person can also play every anim canPlay() allows)
"""

# --------------------------------------------------------------------------- tint slots
# New tint slots (render albedo in layer mode).  Near-white so light swimwear colours tint without clamping.
TINT_REF3 = {'swim': '#F7F7F7', 'swim2': '#F7F7F7', 'ring': '#F7F7F7', 'ring2': '#F7F7F7', 'float': '#F7F7F7',
             'board': '#F7F7F7', 'board2': '#F7F7F7', 'toy': '#F7F7F7'}
# inflatables / boards / lycra are glossy: no extra sky-sheen term on top of the tint
TINT_MODEL_SLOTS3 = {'ring': [0.01, 0.011, 0.014], 'ring2': [0.01, 0.011, 0.014], 'float': [0.01, 0.011, 0.014],
                     'board': [0.01, 0.011, 0.014], 'board2': [0.01, 0.011, 0.014], 'toy': [0.01, 0.011, 0.014]}
BEACH_SLOTS = ['swim', 'swim2', 'ring', 'ring2', 'float', 'board', 'board2', 'toy']

PALETTES3 = {
    'swim': ['#E8524A', '#F2C230', '#3D7CC9', '#2E8A8A', '#F59AB8', '#8A63C9', '#F08A3A', '#5E9A4A', '#2B3A5E',
             '#3FB8C8', '#E83E7A', '#2B2F3A', '#C8343A'],
    'swim2': ['#F7F5F0', '#F2C230', '#2B3A5E', '#E8524A', '#3FB8C8', '#F59AB8', '#F7F5F0'],
    'swim_kid': ['#F59AB8', '#F2C230', '#3FB8C8', '#F08A3A', '#5E9A4A', '#E8524A', '#8A63C9', '#3D7CC9'],
    'swim_elder': ['#2B3A5E', '#3D7CC9', '#8A63C9', '#2E8A8A', '#C8343A', '#2B2F3A', '#5A4A6A', '#E8524A'],
    'ring': ['#E8524A', '#F2C230', '#3FB8C8', '#F59AB8', '#5E9A4A', '#F08A3A', '#8A63C9', '#3D7CC9'],
    'ring2': ['#F7F5F0', '#F7F5F0', '#F2C230', '#3D7CC9'],
    'float': ['#F08A3A', '#F2C230', '#E8524A', '#F59AB8', '#3FB8C8'],
    'board': ['#F7F5F0', '#F2C230', '#3FB8C8', '#E8524A', '#F59AB8', '#5E9A4A', '#F08A3A', '#F4E8C8'],
    'board2': ['#E8524A', '#3D7CC9', '#2B3A5E', '#F2C230', '#2E8A8A', '#F59AB8'],
    'toy': ['#E8524A', '#F2C230', '#3D7CC9', '#5E9A4A', '#F59AB8', '#F08A3A'],
    'aloha': ['#E8524A', '#3D7CC9', '#2E8A8A', '#F2C230', '#5E9A4A', '#F59AB8', '#3FB8C8', '#F08A3A', '#2B3A5E'],
    'aloha_print': ['#F7F5F0', '#F2C230', '#F59AB8', '#E8524A', '#F7F5F0'],
    'shorts': ['#C8A878', '#3F5675', '#E8DCC0', '#5E7A3A', '#7A5C40', '#3B3F52', '#3FB8C8', '#E8524A'],
    'sunhat': ['#F4E8C8', '#F7F5F0', '#F7C8D8', '#E8D8A8', '#BFE3EA', '#F2DCA0'],
    'hatband': ['#E8524A', '#2B3A5E', '#3FB8C8', '#F59AB8', '#2E8A8A', '#F2C230', '#2B2F3A'],
    'swimcap': ['#F7F5F0', '#F59AB8', '#3FB8C8', '#F2C230', '#E8524A', '#8A63C9', '#5E9A4A', '#3D7CC9'],
    'flipflop': ['#E8524A', '#F2C230', '#3FB8C8', '#F59AB8', '#2B3A5E', '#5E9A4A', '#F08A3A'],
    'wetsuit': ['#2B2F3A', '#2E3440', '#2B3A5E', '#2B2F3A'],
    'wetsuit2': ['#3FB8C8', '#F2C230', '#E8524A', '#5E9A4A', '#F08A3A', '#8A63C9'],
    'towel': ['#E8524A', '#3FB8C8', '#F2C230', '#F59AB8', '#5E9A4A', '#3D7CC9', '#F08A3A', '#F7F5F0'],
    'sunglasses': ['#2B2F3A', '#E8524A', '#F2C230', '#F59AB8', '#3FB8C8', '#F7F5F0', '#C9A045'],
    'rash': ['#3D7CC9', '#2B3A5E', '#E8524A', '#2E8A8A', '#F59AB8', '#3FB8C8', '#F2C230', '#5E9A4A', '#2B2F3A'],
    'rash2': ['#F7F5F0', '#F2C230', '#3FB8C8', '#E8524A', '#2B3A5E'],
    'hotel': ['#8A2432', '#2B3A5E', '#1F4A3A', '#5A2440'],
    'pastel': ['#F7C8D8', '#BFE3EA', '#F4E8C8', '#D8EAC8', '#E0D0F0'],
}
SLOT_PALETTE3 = {'swim': 'swim', 'swim2': 'swim2', 'ring': 'ring', 'ring2': 'ring2', 'float': 'float',
                 'board': 'board', 'board2': 'board2', 'toy': 'toy'}
# extra colours for existing tint slots (precomputed tints added to tintTable[slot])
EXTRA_TINTS = {
    'top': PALETTES3['aloha'] + PALETTES3['rash'] + PALETTES3['wetsuit'] + PALETTES3['hotel'] + PALETTES3['pastel']
    + ['#D8302A', '#F7F5F0', '#2B2F3A'],
    'top2': PALETTES3['aloha_print'] + PALETTES3['rash2'] + PALETTES3['wetsuit2'] + ['#F7F5F0', '#F59AB8', '#BFE3EA'],
    'bottom': PALETTES3['shorts'] + ['#2B2F3A', '#F2C230', '#D8302A'],
    'shoes': PALETTES3['flipflop'],
    'hat': PALETTES3['sunhat'] + PALETTES3['swimcap'] + PALETTES3['hotel'] + ['#D8302A', '#2B2F3A'],
    'hat2': PALETTES3['hatband'] + ['#C9A045', '#F7F5F0'],
    'acc': PALETTES3['towel'] + ['#F7F5F0', '#F59AB8', '#3FB8C8', '#2B2F3A', '#F4EDE0'],
    'acc2': PALETTES3['towel'] + ['#F7F5F0', '#C8343A', '#2B3A5E'],
    'glasses': PALETTES3['sunglasses'],
}

# --------------------------------------------------------------------------- anim sets per part
# carry_walk is NOT rendered for any beach part: the v4 runtime / pack_pages drop it for dolls (they carry on the head
# while walking), so its frames were 4 MiB of GPU memory nobody would load.
LAND_CORE = ['idle', 'walk', 'talk', 'wave', 'happy', 'sit']
LAND_FULL = ['idle', 'walk', 'talk', 'wave', 'happy', 'sad', 'clap', 'sit', 'push']
BEACH = ['dig', 'ball_throw', 'ball_catch', 'splash_play', 'sunbathe']
WATER = ['swim', 'float', 'surf']
SWIMWEAR = LAND_CORE + BEACH + WATER
ALL_ANIMS = ['idle', 'walk', 'carry_walk', 'talk', 'wave', 'happy', 'sad', 'clap', 'sit', 'push'] + BEACH + WATER
# Job outfits only carry the anims their job uses (GPU budget: every anim of a layered outfit is ~0.1-0.2 Mpx of
# atlas per base); the v4 / v5 generator never gives these parts to anyone else.
JOB_CORE = ['idle', 'walk', 'talk', 'wave', 'happy']
# Hotel / shop staff do not jump for joy on duty (GPU budget: 'happy' was ~2.5 MiB of uniform frames); a staff member
# asked for 'happy' falls back to idle (pickAnim / cityfolk animFallback happy -> idle).
STAFF_CORE = ['idle', 'walk', 'talk', 'wave']
LAND_CASUAL = [a for a in LAND_FULL if a not in ('push', 'sad')]          # beach casual: no pushing / moping
LIFEGUARD = JOB_CORE + ['sit', 'swim', 'splash_play', 'ball_throw', 'ball_catch']
# PART_ANIMS = the anims a beach body part HAS FRAMES for (what bf_render renders and bf_pack packs)
PART_ANIMS = {
    'bare_skin': [a for a in LAND_FULL if a not in ('sad', 'push')] + BEACH + WATER,   # nobody pushes bare-legged
    'bare_arms': [a for a in LAND_FULL if a != 'sad'] + BEACH + WATER,
    'no_top': [a for a in LAND_FULL if a != 'sad'] + BEACH + WATER,
    'swimsuit_one': SWIMWEAR, 'swim_trunks': SWIMWEAR, 'rash_guard': SWIMWEAR,
    'wetsuit': LAND_CORE + ['splash_play'] + WATER,                      # surfers: no sandcastles / ball games
    'flip_flops': LAND_CORE + ['dig', 'ball_throw', 'ball_catch', 'sunbathe'],
    'towel_shoulder': list(JOB_CORE),
    # the ring stays on for chatting / waving / cheering (no popping on and off between anims); ring wearers do not
    # sit, dig, play ball or sunbathe (canPlay false there -> pickAnim idle)
    'swim_ring_worn': ['idle', 'walk', 'talk', 'wave', 'happy', 'splash_play', 'float'],
    'arm_floaties': LAND_CORE + BEACH + ['swim', 'float'],
    'aloha_shirt': LAND_CASUAL + BEACH,
    'beach_shorts': [a for a in LAND_FULL if a not in ('sad', 'push')] + BEACH,
    'tourist_camera': LAND_CORE + ['clap'],
    'lifeguard_top': list(LIFEGUARD), 'whistle': list(LIFEGUARD),
    # tube on the back on land / in the shallows / at ball games, TOWED on its leash while swimming
    'rescue_tube': LAND_CORE + ['swim', 'splash_play', 'ball_throw', 'ball_catch'],
    'bellhop_jacket': STAFF_CORE + ['push'],                             # luggage trolley
    'hotel_vest': STAFF_CORE + ['clap'],                                 # front desk; claps at ceremonies
    'doorman_coat': STAFF_CORE + ['clap'],
    'housekeeper_dress': STAFF_CORE + ['push'],                          # linen cart
    'cleaning_caddy': ['idle', 'walk', 'talk', 'wave'],                  # left hand; on the cart while pushing
    'vendor_shirt': STAFF_CORE + ['push'],                               # ice-cream cart
    'bar_apron': list(STAFF_CORE),
    'surfboard': ['surf'], 'toy_spade': ['dig'],
}
# Accessories that are simply put down / taken off in the anims they have no frames for (nothing drawn there).
# Manifest: parts[p].anims = every anim (they never block canPlay) and parts[p].noAnims = the anims without frames,
# so ANY townfolk compositor that honours anims + noAnims (beachfolk, cityfolk, townfolk2) agrees on canPlay.
DROP_PARTS = ['towel_shoulder', 'flip_flops', 'tourist_camera', 'rescue_tube', 'arm_floaties', 'cleaning_caddy']
# The swim ring is NOT dropped: wearers cannot swim / surf / dig / play ball / sunbathe (canPlay false there);
# swim falls back to float (animFallback) - a kid "swims" bobbing in the ring.
ANIM_FALLBACK = {'swim': ['float'], 'surf': ['swim', 'float']}
# parts drawn automatically in an anim even when the person does not wear them (anim props)
ANIM_PARTS = {'float': ['swim_ring_worn'], 'surf': ['surfboard'], 'dig': ['toy_spade']}
# parts still defined in bf_parts but not packed any more (no preset uses them): the white dotted housekeeping kerchief
# read as a shower cap (polish pass) - the housekeeper wears townfolk's hat_headband instead
RETIRED = ['kerchief']

# Hats hidden per anim (taken off for swimming, put down while sunbathing).  A full hat that is hidden also stops
# squashing the hair (hair draws its normal layer, not ~hat).  Lists are filled in by bf_pack from every hat of
# townfolk + townfolk2 + beachfolk:  swim / surf: every hat but the swim caps;  float: every hat but swim caps, sun
# hats, the visor and the two v4 beach hats (a sun hat in a ring is cute; job hats never float);  sunbathe: every hat
# but the swim caps and the two wide-brim hats (laid over the face).
HEAD_KEEP = {'swim': ['swim_cap', 'swim_cap_flower'], 'surf': ['swim_cap', 'swim_cap_flower'],
             'float': ['swim_cap', 'swim_cap_flower', 'straw_hat', 'sun_hat_wide', 'sun_visor', 'hat_cap',
                       'hat_bucket'],
             'sunbathe': ['swim_cap', 'swim_cap_flower', 'straw_hat', 'sun_hat_wide']}

# --------------------------------------------------------------------------- rules
EXCLUDE3 = [
    ['swimsuit_one', 'family:bottom'], ['wetsuit', 'family:bottom'], ['wetsuit', 'family:shoes'],
    ['swim_cap', 'tag:long'], ['swim_cap', 'tag:tall'], ['swim_cap', 'tag:big'],
    ['swim_cap_flower', 'tag:long'], ['swim_cap_flower', 'tag:tall'], ['swim_cap_flower', 'tag:big'],
    ['snorkel_mask', 'family:glasses'], ['snorkel_mask', 'straw_hat'], ['snorkel_mask', 'sun_hat_wide'],
    ['snorkel_mask', 'hat_cap'], ['snorkel_mask', 'hat_bucket'], ['snorkel_mask', 'sun_visor'],
    ['towel_shoulder', 'tourist_camera'], ['towel_shoulder', 'whistle'],
    ['rescue_tube', 'swim_ring_worn'],
]

# --------------------------------------------------------------------------- presets
_SKIN = ['bare_skin', 'bare_arms']
_KIDS = {'child_slim': 1}
_HAIR_TIDY = {'hair_bun': 3, 'hair_lowbun': 3, 'hair_bob': 2, 'hair_short': 2, 'hair_sidepart': 3, 'hair_ponytail': 2,
              'hair_buzz': 1}
_BEACH_COLORS = {'swim': 'swim', 'swim2': 'swim2', 'shoes': 'flipflop', 'acc': 'towel', 'acc2': 'towel',
                 'glasses': 'sunglasses', 'hat': 'sunhat', 'hat2': 'hatband', 'hands': ['skin']}

PRESETS3 = {
    'swimmer': {'label': {'ko': '수영객', 'en': 'swimmer'},
                'bases': {'child_slim': 4, 'child_round': 3, 'adult_slim': 5, 'adult_round': 3, 'elder_slim': 1,
                          'elder_round': 2},
                'tops': {'A': {'swimsuit_one': 6, 'rash_guard': 2}, 'B': {'no_top': 6, 'rash_guard': 2}},
                'bottoms': ['swim_trunks'], 'shoes': ['flip_flops'], 'shoesChance': 0.3,
                'hats': {'swim_cap': 4, 'swim_cap_flower': 1, 'hat_cap': 1}, 'hatChance': 0.3,
                'glasses': {'sunglasses': 1}, 'glassesChance': 0.1,
                'headAcc': {'snorkel_mask': 1}, 'headAccChance': 0.14,
                'neck': {'towel_shoulder': 1}, 'neckChance': 0.12, 'bag': None, 'extra': list(_SKIN),
                'gloveChance': 0.0, 'facialHairChance': 0.12,
                'addOns': [[{'arm_floaties': 1}, 0.45], [{'swim_ring_worn': 1}, 0.28]],
                'anims': ['idle', 'walk', 'talk', 'wave', 'happy', 'sit', 'swim', 'float', 'splash_play', 'dig',
                          'ball_throw', 'ball_catch', 'sunbathe'],
                'colors': dict(_BEACH_COLORS, top='rash', top2='rash2', hat='swimcap')},
    'sunbather': {'label': {'ko': '일광욕객', 'en': 'sunbather'},
                  'bases': {'adult_slim': 5, 'adult_round': 4, 'elder_slim': 2, 'elder_round': 3, 'child_slim': 1},
                  'tops': {'A': {'swimsuit_one': 5, 'rash_guard': 1}, 'B': {'no_top': 5, 'rash_guard': 1}},
                  'bottoms': ['swim_trunks'], 'shoes': ['flip_flops'], 'shoesChance': 0.55,
                  'hats': {'straw_hat': 3, 'sun_hat_wide': 3, 'hat_bucket': 1}, 'hatChance': 0.45,
                  'glasses': {'sunglasses': 1}, 'glassesChance': 0.7, 'headAcc': None,
                  'neck': {'towel_shoulder': 1}, 'neckChance': 0.2, 'bag': None, 'extra': list(_SKIN),
                  'gloveChance': 0.0,
                  'anims': ['sunbathe', 'idle', 'walk', 'talk', 'wave', 'happy', 'sit', 'swim', 'float'],
                  'colors': dict(_BEACH_COLORS, top='rash', top2='rash2')},
    'family_beach': {'label': {'ko': '가족 피서객', 'en': 'beach family'},
                     'bases': {'child_slim': 5, 'child_round': 3, 'adult_slim': 4, 'adult_round': 3, 'elder_slim': 1,
                               'elder_round': 1},
                     'tops': {'A': {'swimsuit_one': 5, 'rash_guard': 3}, 'B': {'no_top': 4, 'rash_guard': 3}},
                     'bottoms': ['swim_trunks'], 'shoes': ['flip_flops'], 'shoesChance': 0.5,
                     'hats': {'sun_hat_wide': 3, 'straw_hat': 2, 'hat_bucket': 2, 'hat_cap': 2, 'swim_cap': 1},
                     'hatChance': 0.5, 'glasses': {'sunglasses': 1}, 'glassesChance': 0.25, 'headAcc': None,
                     'neck': {'towel_shoulder': 1}, 'neckChance': 0.15, 'bag': None, 'extra': list(_SKIN),
                     'gloveChance': 0.0,
                     'addOns': [[{'arm_floaties': 1}, 0.4], [{'swim_ring_worn': 1}, 0.25]],
                     'anims': ['idle', 'walk', 'talk', 'wave', 'happy', 'sit', 'dig', 'ball_throw', 'ball_catch',
                               'splash_play', 'swim', 'float', 'sunbathe'],
                     'colors': dict(_BEACH_COLORS, top='rash', top2='rash2', swim='swim_kid')},
    'lifeguard': {'label': {'ko': '인명구조요원', 'en': 'lifeguard'},
                  'bases': {'adult_slim': 5, 'adult_round': 2},
                  'tops': ['lifeguard_top'], 'bottoms': ['swim_trunks'],
                  'shoes': ['flip_flops'], 'shoesChance': 0.5,
                  # no yellow dome caps (a Korean kindergarten cap): a straw lifeguard hat, a red visor or a red cap
                  'hats': {'straw_hat': 3, 'sun_visor': 3, 'hat_cap': 1}, 'hatChance': 0.75,
                  'glasses': {'sunglasses': 1}, 'glassesChance': 0.8, 'headAcc': None,
                  'neck': ['whistle'], 'neckChance': 1.0, 'bag': {'rescue_tube': 1}, 'bagChance': 1.0,
                  'extra': list(_SKIN), 'gloveChance': 0.0, 'facialHairChance': 0.2,
                  'hair': {'hair_short': 3, 'hair_sidepart': 2, 'hair_ponytail': 3, 'hair_bun': 2, 'hair_buzz': 1,
                           'hair_curly': 1, 'hair_spiky': 1},
                  'anims': list(LIFEGUARD),
                  # red tank over NAVY (or yellow) trunks - red-on-red read as a girl in a red dress
                  'colors': {'top': ['#D8302A'], 'swim': ['#2B3A5E', '#2B3A5E', '#F2C230'],
                             'swim2': ['#D8302A', '#F7F5F0'], 'bottom': ['#2B3A5E'], 'hat': ['#D8302A'],
                             'hat2': ['#D8302A', '#F7F5F0', '#2B3A5E'], 'shoes': ['#D8302A', '#2B2F3A'],
                             'glasses': ['#2B2F3A', '#2B2F3A', '#D8302A'], 'hands': ['skin']}},
    'bellhop': {'label': {'ko': '벨보이', 'en': 'bellhop'},
                'bases': {'adult_slim': 5, 'adult_round': 2},
                'tops': ['bellhop_jacket'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'],
                'hats': ['bellhop_cap'], 'hatChance': 1.0, 'neck': None, 'bag': None, 'headAcc': None,
                'glassesChance': 0.05, 'facialHairChance': 0.05, 'gloveChance': 0.0, 'hair': _HAIR_TIDY,
                'anims': STAFF_CORE + ['push'],
                'colors': {'top': ['#8A2432', '#8A2432', '#2B3A5E', '#1F4A3A'], 'hat': ['=top'], 'bottom': ['#2B2F3A'],
                           'shoes': ['#1E1E26'], 'hands': ['skin']}},
    'receptionist': {'label': {'ko': '호텔 안내원', 'en': 'hotel receptionist'},
                     'bases': {'adult_slim': 5, 'adult_round': 2},
                     'tops': ['hotel_vest'], 'bottoms': {'bot_pants': 2, 'bot_skirt': 2}, 'shoes': ['shoe_shoes'],
                     'hats': None, 'neck': None, 'bag': None, 'headAcc': None, 'glasses': {'acc_glasses_sq': 1},
                     'glassesChance': 0.2, 'facialHairChance': 0.05, 'gloveChance': 0.0, 'hair': _HAIR_TIDY,
                     'anims': STAFF_CORE + ['clap'],
                     'colors': {'top': 'hotel', 'top2': ['#F7F5F0'], 'acc2': ['#C9A045', '#D8302A', '#3FB8C8'],
                                'bottom': ['#2B2F3A', '#3B3F52'], 'bottom2': ['#2E3440'], 'shoes': ['#1E1E26'],
                                'hands': ['skin']}},
    'doorman': {'label': {'ko': '도어맨', 'en': 'doorman'},
                'bases': {'adult_slim': 4, 'adult_round': 3},
                'tops': ['doorman_coat'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'],
                'hats': ['doorman_hat'], 'hatChance': 1.0, 'neck': None, 'bag': None, 'headAcc': None,
                'glassesChance': 0.05, 'facialHairChance': 0.45, 'gloveChance': 0.0,
                'hair': {'hair_short': 3, 'hair_sidepart': 3, 'hair_bald': 1, 'hair_buzz': 1, 'hair_lowbun': 1},
                'anims': STAFF_CORE + ['clap'],
                'colors': {'top': ['#8A2432', '#2B3A5E', '#1F4A3A'], 'hat': ['=top'], 'bottom': ['#2B2F3A'],
                           'shoes': ['#1E1E26'], 'hands': ['skin']}},
    'housekeeper': {'label': {'ko': '객실 청소원', 'en': 'housekeeper'},
                    'bases': {'adult_slim': 4, 'adult_round': 3},
                    # dark hotel tunic (navy / charcoal / wine / pine) + white collar & apron, a dark headband and
                    # a cleaning caddy: no pastel smock + white dotted kerchief (= the townfolk nurse at 0.6x)
                    'tops': ['housekeeper_dress'], 'shoes': ['shoe_shoes'], 'hats': ['hat_headband'],
                    'hatChance': 0.75, 'neck': None, 'bag': None, 'headAcc': None, 'glassesChance': 0.1,
                    'facialHairChance': 0.0, 'gloveChance': 0.0,
                    'hair': {'hair_bun': 3, 'hair_lowbun': 3, 'hair_bob': 2, 'hair_short': 2, 'hair_ponytail': 1},
                    'addOns': [[{'cleaning_caddy': 1}, 0.85]],
                    'anims': STAFF_CORE + ['push'],
                    'colors': {'top': ['#2E3A55', '#2E3A55', '#3B3F4A', '#6A2A3A', '#2F4A44'],
                               'hat': ['#2B2F3A', '#2E3A55', '=top'], 'bottom2': ['#2E3440', '#3B3F4A'],
                               'acc2': ['#F2C230', '#3FB8C8', '#E8524A', '#5E9A4A'],
                               'shoes': ['#1E1E26'], 'hands': ['skin']}},
    'icecream_vendor': {'label': {'ko': '아이스크림 장수', 'en': 'ice-cream vendor'},
                        'bases': {'adult_slim': 4, 'adult_round': 4, 'elder_slim': 1, 'elder_round': 2},
                        'tops': ['vendor_shirt'], 'bottoms': ['bot_pants'],
                        'shoes': ['shoe_shoes'], 'hats': ['paper_cap'], 'hatChance': 0.9, 'neck': None, 'bag': None,
                        'headAcc': None, 'glassesChance': 0.15, 'facialHairChance': 0.45, 'gloveChance': 0.0,
                        'extra': ['bare_arms'],
                        'anims': STAFF_CORE + ['push'],
                        # bold candy stripes + a saturated apron (the pastel lilac version merged with the
                        # housekeeper and the nurse at 0.6x); garrison cap piped in the stripe colour
                        'colors': {'top': ['#F7F5F0'], 'top2': ['#E8524A', '#E8524A', '#2E8A8A', '#3D7CC9'],
                                   'hat': ['#F7F5F0'], 'hat2': ['=top2'],
                                   'acc': ['#2B3A5E', '#E8524A', '#2E8A8A', '#C8343A'],
                                   'acc2': ['#E8524A', '#2B3A5E', '#F2C230'],
                                   'bottom': ['#F7F5F0', '#F7F5F0', '#2B3A5E', '#3F5675'],   # classic white trousers
                                   'shoes': ['#F7F5F0', '#2B2F3A'], 'hands': ['skin']}},
    'beach_bar_staff': {'label': {'ko': '비치바 직원', 'en': 'beach bar staff'},
                        'bases': {'adult_slim': 5, 'adult_round': 3},
                        'tops': ['aloha_shirt'], 'bottoms': ['beach_shorts'], 'shoes': {'flip_flops': 2, 'shoe_shoes': 1},
                        'hats': {'straw_hat': 1, 'hat_cap': 1}, 'hatChance': 0.35, 'neck': None, 'bag': None,
                        'headAcc': None, 'glasses': {'sunglasses': 1}, 'glassesChance': 0.2, 'gloveChance': 0.0,
                        'extra': ['bare_skin', 'bare_arms', 'bar_apron'],
                        'anims': list(STAFF_CORE),
                        'colors': {'top': 'aloha', 'top2': 'aloha_print', 'bottom': 'shorts',
                                   'acc': ['#2B2F3A', '#F7F5F0', '#3F5675', '#7A5C40'], 'shoes': 'flipflop',
                                   'hat2': 'hatband', 'glasses': 'sunglasses', 'hands': ['skin']}},
    'surfer': {'label': {'ko': '서퍼', 'en': 'surfer'},
               'bases': {'adult_slim': 6, 'adult_round': 2, 'child_slim': 1},
               'tops': ['wetsuit'], 'shoes': None, 'hats': None, 'neck': None, 'bag': None, 'headAcc': None,
               'glasses': {'sunglasses': 1}, 'glassesChance': 0.15, 'gloveChance': 0.0, 'facialHairChance': 0.3,
               'extra': ['bare_skin'],
               'hair': {'A': {'hair_long': 3, 'hair_wavy': 3, 'hair_ponytail': 2, 'hair_bun': 1, 'hair_bob_long': 1},
                        'B': {'hair_wavy': 3, 'hair_spiky': 2, 'hair_short': 2, 'hair_curly': 2, 'hair_buzz': 1}},
               'anims': ['surf', 'swim', 'idle', 'walk', 'talk', 'wave', 'happy', 'sit', 'splash_play', 'float'],
               'colors': {'top': 'wetsuit', 'top2': 'wetsuit2', 'board': 'board', 'board2': 'board2',
                          'glasses': 'sunglasses', 'hair': ['#C89A52', '#8A5232', '#3A2A22', '#C8B07A', '#2A2228'],
                          'hands': ['skin']}},
    'beach_tourist': {'label': {'ko': '해변 관광객', 'en': 'beach tourist'},
                      'bases': {'adult_slim': 5, 'adult_round': 5, 'elder_slim': 3, 'elder_round': 3},
                      'tops': ['aloha_shirt'], 'bottoms': ['beach_shorts'], 'shoes': ['flip_flops'],
                      'hats': {'sun_hat_wide': 3, 'straw_hat': 3, 'hat_bucket': 2, 'hat_cap': 1}, 'hatChance': 0.75,
                      'glasses': {'sunglasses': 3, 'acc_glasses': 1}, 'glassesChance': 0.55,
                      'neck': {'tourist_camera': 1}, 'neckChance': 0.7, 'bag': None, 'headAcc': None,
                      'extra': list(_SKIN), 'gloveChance': 0.0, 'facialHairChance': 0.35,
                      'anims': ['idle', 'walk', 'talk', 'wave', 'happy', 'sit', 'clap',
                                'dig', 'ball_throw', 'ball_catch', 'splash_play', 'sunbathe'],
                      'colors': {'top': 'aloha', 'top2': 'aloha_print', 'bottom': 'shorts', 'shoes': 'flipflop',
                                 'hat': 'sunhat', 'hat2': 'hatband', 'glasses': 'sunglasses', 'hands': ['skin']}},
}


def family_parts():
    return [p for pr in PRESETS3.values() for p in pr.get('extra', [])]


# =========================================================================== look-dev outfits
# full Blender renders (bf_render.py --mode full --combos look) compared with the paper-doll composites
LOOK = [
    dict(name='swimsuit_kid', base='child_slim', face='kidlash', nose='button',
         parts=['hair_twintails', 'bare_skin', 'bare_arms', 'swimsuit_one', 'arm_floaties', 'swim_ring_worn'],
         colors=dict(skin='#F6CFAE', hair='#5A3A26', swim='#F59AB8', swim2='#F7F5F0', float='#F08A3A',
                     ring='#3FB8C8', ring2='#F7F5F0', sleeve='#F6CFAE', hands='#F6CFAE', acc2='#F2C230')),
    dict(name='trunks_dad', base='adult_slim', face='std', nose='dot',
         parts=['hair_short', 'bare_skin', 'bare_arms', 'no_top', 'swim_trunks', 'flip_flops', 'sunglasses',
                'towel_shoulder'],
         colors=dict(skin='#E8B48C', hair='#2A2228', swim='#3D7CC9', swim2='#F7F5F0', shoes='#E8524A',
                     glasses='#2B2F3A', acc='#F2C230', acc2='#E8524A', sleeve='#E8B48C', hands='#E8B48C')),
    dict(name='rash_mum', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bob', 'bare_skin', 'bare_arms', 'rash_guard', 'swim_trunks', 'sun_hat_wide', 'flip_flops'],
         colors=dict(skin='#F2C29A', hair='#8A5232', top='#2E8A8A', top2='#F7F5F0', swim='#2B3A5E', swim2='#F7F5F0',
                     hat='#F4E8C8', hat2='#E8524A', shoes='#F59AB8', sleeve='#2E8A8A', hands='#F2C29A')),
    dict(name='lifeguard', base='adult_slim', face='bold', nose='dot',
         parts=['hair_short', 'bare_skin', 'bare_arms', 'lifeguard_top', 'swim_trunks', 'whistle', 'straw_hat',
                'sunglasses', 'rescue_tube'],
         colors=dict(skin='#C98E6A', hair='#2A2228', top='#D8302A', swim='#2B3A5E', swim2='#D8302A', hat='#D8302A',
                     hat2='#D8302A', glasses='#2B2F3A', sleeve='#C98E6A', hands='#C98E6A')),
    dict(name='elder_swim', base='elder_slim', face='elder', nose='big',
         parts=['hair_lowbun', 'bare_skin', 'bare_arms', 'swimsuit_one', 'swim_cap_flower'],
         colors=dict(skin='#F2C29A', hair='#BEBCB8', swim='#2B3A5E', swim2='#F7F5F0', hat='#F7F5F0', hat2='#F59AB8',
                     sleeve='#F2C29A', hands='#F2C29A')),
    dict(name='straw_sunbather', base='adult_slim', face='std', nose='dot',
         parts=['hair_sidepart', 'bare_skin', 'bare_arms', 'no_top', 'swim_trunks', 'straw_hat', 'sunglasses'],
         colors=dict(skin='#F6CFAE', hair='#6B4026', swim='#E8524A', swim2='#F7F5F0', hat2='#2B3A5E',
                     glasses='#E8524A', sleeve='#F6CFAE', hands='#F6CFAE')),
]
LOOK_FRAMES = [('idle', 'S', 0), ('walk', 'SE', 2), ('idle', 'N', 1), ('swim', 'S', 2), ('swim', 'SE', 5),
               ('swim', 'E', 1), ('swim', 'N', 3), ('float', 'S', 1), ('float', 'SE', 2), ('sunbathe', 'SE', 0),
               ('sunbathe', 'NE', 1), ('dig', 'SE', 2), ('ball_throw', 'S', 3), ('ball_catch', 'SE', 2),
               ('splash_play', 'S', 2), ('surf', 'SE', 1), ('surf', 'NE', 0), ('wave', 'S', 2)]

LOOK_JOBS = [
    dict(name='bellhop', base='adult_slim', face='std', nose='dot',
         parts=['hair_sidepart', 'bellhop_jacket', 'bot_pants', 'shoe_shoes', 'bellhop_cap'],
         colors=dict(skin='#F2C29A', hair='#3A2A22', top='#8A2432', hat='#8A2432', bottom='#2B2F3A', shoes='#1E1E26',
                     sleeve='#8A2432', hands='#F2C29A')),
    dict(name='receptionist', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bun', 'hotel_vest', 'bot_skirt', 'shoe_shoes', 'acc_glasses_sq'],
         colors=dict(skin='#F6CFAE', hair='#2A2228', top='#2B3A5E', top2='#F7F5F0', acc2='#C9A045', bottom='#2B2F3A',
                     bottom2='#2E3440', shoes='#1E1E26', glasses='#2B2F3A', sleeve='#F7F5F0', hands='#F6CFAE')),
    dict(name='doorman', base='adult_slim', face='bold', nose='big',
         parts=['hair_short', 'fh_moustache', 'doorman_coat', 'bot_pants', 'shoe_shoes', 'doorman_hat'],
         colors=dict(skin='#E8B48C', hair='#5A3A26', top='#1F4A3A', hat='#1F4A3A', bottom='#2B2F3A', shoes='#1E1E26',
                     sleeve='#1F4A3A', hands='#E8B48C')),
    dict(name='housekeeper', base='adult_slim', face='lash', nose='button',
         parts=['hair_lowbun', 'housekeeper_dress', 'bot_tights', 'shoe_shoes', 'hat_headband', 'cleaning_caddy'],
         colors=dict(skin='#D9A07A', hair='#3A2A22', top='#2E3A55', hat='#2E3A55', acc2='#F2C230', bottom2='#2E3440',
                     shoes='#1E1E26', sleeve='#2E3A55', hands='#D9A07A')),
    dict(name='icecream', base='adult_slim', face='std', nose='dot',
         parts=['hair_curly', 'bare_skin', 'bare_arms', 'vendor_shirt', 'beach_shorts', 'shoe_shoes', 'paper_cap'],
         colors=dict(skin='#F6CFAE', hair='#8A5232', top='#F7F5F0', top2='#E8524A', hat='#F7F5F0', hat2='#E8524A',
                     acc='#2B3A5E', acc2='#F2C230', bottom='#3F5675', shoes='#F7F5F0', sleeve='#F6CFAE',
                     hands='#F6CFAE')),
    dict(name='barstaff', base='adult_slim', face='std', nose='dot',
         parts=['hair_wavy', 'bare_skin', 'bare_arms', 'aloha_shirt', 'beach_shorts', 'bar_apron', 'flip_flops'],
         colors=dict(skin='#C98E6A', hair='#2A2228', top='#2E8A8A', top2='#F7F5F0', bottom='#C8A878', acc='#2B2F3A',
                     shoes='#F2C230', sleeve='#C98E6A', hands='#C98E6A')),
    dict(name='surfer', base='adult_slim', face='std', nose='dot',
         parts=['hair_long', 'bare_skin', 'wetsuit'],
         colors=dict(skin='#E8B48C', hair='#C89A52', top='#2B2F3A', top2='#3FB8C8', board='#F2C230', board2='#3D7CC9',
                     sleeve='#2B2F3A', hands='#E8B48C')),
    dict(name='tourist', base='elder_slim', face='elder', nose='big',
         parts=['hair_bald', 'bare_skin', 'bare_arms', 'aloha_shirt', 'beach_shorts', 'flip_flops', 'tourist_camera',
                'sun_hat_wide', 'sunglasses', 'fh_moustache'],
         colors=dict(skin='#F2C29A', hair='#BEBCB8', top='#E8524A', top2='#F2C230', bottom='#E8DCC0', shoes='#3FB8C8',
                     hat='#F4E8C8', hat2='#2B3A5E', glasses='#C9A045', sleeve='#F2C29A', hands='#F2C29A')),
    dict(name='snorkel_kid', base='child_slim', face='kid', nose='dot',
         parts=['hair_short', 'bare_skin', 'bare_arms', 'rash_guard', 'swim_trunks', 'snorkel_mask', 'swim_cap'],
         colors=dict(skin='#E8B48C', hair='#3A2A22', top='#3FB8C8', top2='#F2C230', swim='#2B3A5E', swim2='#F2C230',
                     acc='#F08A3A', hat='#F2C230', hat2='#3D7CC9', sleeve='#3FB8C8', hands='#E8B48C')),
]
LOOK_JOB_FRAMES = [('idle', 'S', 0), ('walk', 'SE', 2), ('idle', 'N', 1), ('talk', 'E', 0), ('wave', 'S', 2),
                   ('carry_walk', 'SE', 1), ('push', 'S', 3), ('sit', 'SE', 0), ('surf', 'SE', 2), ('swim', 'S', 3),
                   ('dig', 'S', 1), ('splash_play', 'SE', 1)]
