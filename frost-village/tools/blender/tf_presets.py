"""
tf_presets.py - townfolk palettes, combination rules, generator weights and named job
presets (CONTRACT_V4 J).  Pure python: tf_pack copies these into the manifest.
"""

# --------------------------------------------------------------------------- tint slots
# Render albedo per tint slot (sRGB hex) in mode='layer'.  The game tint for a wanted colour
# C follows TINT_MODEL below (townfolk_compose.tint_for; the manifest also lists precomputed
# tints for every palette colour).  'skin' renders with the lightest skin tone so the
# default skin is exact (tint 0xFFFFFF).
TINT_REF = {
    'skin': '#F6CFAE',       # lightest skin tone -> default skin is exact
    'hands': '#F6CFAE',      # bare hands share the skin tone; gloves tint darker
    'fur': '#F4F1EA',        # cream / white fur trims
    'hair': '#C8C2BC',       # hair is rendered diffuse-only (gloss is the separate 'sheen' layer)
    'default': '#E6E6E6',    # every cloth / accessory slot
}
# Tint transfer (game side): T = clamp01( sRGB(K*lin(C) + S) / sRGB(K*lin(ref) + S) ) per channel.
# K = typical irradiance, S = additive sky specular of cloth (fitted on the proof renders;
# per-slot S overrides: skin / hands / fur / hair have no additive term).
TINT_MODEL = {'K': 1.0, 'S': [0.020, 0.022, 0.028],
              'slotS': {'skin': [0, 0, 0], 'hands': [0, 0, 0], 'hair': [0, 0, 0], 'fur': [0, 0, 0]}}
# hair gloss: '<sub>.sheen' layers (specular-only render) become white with
# alpha = gain * S_lin ** pow  (drawn with normal alpha right above the hair sub)
SHEEN = {'gain': 1.6, 'pow': 0.8}


# --------------------------------------------------------------------------- base bodies
# P = vil_body.BODY-style proportions.  Head is 1.0 for every base so head-space layers
# are shared by all bases.  ch = values tf_anim reads (age, hunch, arm_out).
BASES = {
    'child_slim':  dict(age='child', build='slim', hunch=0.0, arm_out=0.0, shadow=[36, 14],
                        P=dict(torso=(0.84, 0.86, 0.70), head=1.0, arm=(0.90, 0.88), hand=0.96,
                               leg=(0.88, 0.66, 0.72), hip_w=0.86)),
    'child_round': dict(age='child', build='round', hunch=0.0, arm_out=4.0, shadow=[40, 15],
                        P=dict(torso=(1.0, 0.98, 0.70), head=1.0, arm=(1.0, 0.88), hand=1.0,
                               leg=(1.0, 0.64, 0.70), hip_w=1.0)),
    'adult_slim':  dict(age='adult', build='slim', hunch=0.0, arm_out=0.0, shadow=[46, 18],
                        P=dict(torso=(0.97, 0.97, 1.0), head=1.0, arm=(0.97, 1.0), hand=1.0,
                               leg=(0.96, 1.04, 1.03), hip_w=0.96)),
    'adult_round': dict(age='adult', build='round', hunch=0.0, arm_out=5.0, shadow=[54, 21],
                        P=dict(torso=(1.22, 1.17, 0.98), head=1.0, arm=(1.10, 0.98), hand=1.06,
                               leg=(1.14, 0.90, 0.95), hip_w=1.22)),
    'elder_slim':  dict(age='elder', build='slim', hunch=11.0, arm_out=0.0, shadow=[46, 18],
                        P=dict(torso=(0.98, 0.98, 0.92), head=1.0, arm=(0.98, 0.96), hand=0.96,
                               leg=(0.98, 0.88, 0.92), hip_w=0.98)),
    'elder_round': dict(age='elder', build='round', hunch=8.0, arm_out=5.0, shadow=[52, 20],
                        P=dict(torso=(1.18, 1.14, 0.92), head=1.0, arm=(1.08, 0.96), hand=1.04,
                               leg=(1.10, 0.86, 0.90), hip_w=1.16)),
}
BASE_ORDER = ['child_slim', 'child_round', 'adult_slim', 'adult_round', 'elder_slim', 'elder_round']


FACE_SETS = {
    # vil_face spec keys (see vil_face.build_face) + extras
    'std':    dict(),
    'lash':   dict(lashes=True, eye_w=0.046, eye_h=0.064),
    'kid':    dict(eye_w=0.049, eye_h=0.067, blush='#F48A8A'),
    'kidlash': dict(eye_w=0.049, eye_h=0.067, blush='#F48A8A', lashes=True),
    'elder':  dict(eye_w=0.042, eye_h=0.054, brow_thick=0.0165, mouth_v=-0.100, blush='#F2A0A0', lines=True),
    'bold':   dict(brow_thick=0.0165, eye_w=0.044, eye_h=0.060, mouth_v=-0.112),
}



PROOF_COLORS = [
    dict(skin='#F6CFAE', hair='#3A2A22', top='#3D7CC9', top2='#F2C14E', fur='#F4F1EA', bottom='#3B3F52',
         shoes='#6B4A2E', sleeve='#3D7CC9', hands='#F6CFAE', acc2='#F08A8A'),
    dict(skin='#E0A982', hair='#8A5232', top='#D9483B', top2='#F4EDE0', fur='#E6DCCB', bottom='#4A3830',
         shoes='#3B2A20', sleeve='#D9483B', hands='#3B3F4A', acc2='#3D7CC9'),
    dict(skin='#F2C29A', hair='#D9A85A', top='#5E9A4A', top2='#F4EDE0', fur='#F4F1EA', bottom='#2E3440',
         shoes='#8A5A33', sleeve='#5E9A4A', hands='#F2C29A', acc2='#F2C14E'),
]
PROOF_FRAMES = [('idle', 'S', 0), ('idle', 'N', 2), ('walk', 'SE', 2), ('walk', 'E', 5), ('walk', 'NE', 1),
                ('carry_walk', 'S', 3), ('carry_walk', 'E', 0), ('talk', 'E', 0), ('wave', 'S', 2),
                ('wave', 'SE', 1), ('happy', 'S', 2), ('happy', 'E', 3)]


def proof_combos():
    out = []
    k = 0
    for base in ('adult_slim', 'child_round'):
        for hi, hair in enumerate(('hair_short', 'hair_bob', 'hair_ponytail')):
            for ti, top in enumerate(('top_puffer', 'top_parka', 'top_sweater')):
                cols = PROOF_COLORS[(hi + ti) % 3]
                out.append(dict(name=f'{base}__{hair}__{top}', base=base, face='kid' if base.startswith('child') else 'std',
                                nose='dot', parts=[hair, top, 'bot_pants', 'shoe_boots'], colors=cols,
                                frames=PROOF_FRAMES))
                k += 1
    return out




# =========================================================================== palettes (sRGB)
# 머리색 8색 + 노인 회색 계열, 피부 7톤, 상의 12색 ...  (designer-editable)
PALETTES = {
    'skin': ['#F6CFAE', '#F2C29A', '#E8B48C', '#D9A07A', '#C98E6A', '#A8714E', '#7A4E32'],
    'hair': ['#2A2228', '#3A2A22', '#5A3A26', '#6B4026', '#8A5232', '#B5652E', '#D9A85A', '#E8C890'],
    'hair_elder': ['#C8C6C2', '#F2F0EA', '#BDB6AA', '#9A948E', '#6A625C', '#3A2A22'],
    'hair_fun': ['#8A2A4A', '#E8A0B4', '#5A6EC8', '#2E8A8A', '#D9A85A', '#2A2228'],
    'cloth': ['#3D7CC9', '#D9483B', '#F2C230', '#5E9A4A', '#8A63C9', '#F08A3A', '#F59AB8', '#2E8A8A',
              '#7A5C40', '#F4EDE0', '#3B3F52', '#C8A878'],
    'muted': ['#7A5C40', '#5E7A3A', '#C98C8C', '#3B3F52', '#8A6A4A', '#4F6E8A', '#9A6A48', '#6A5A7A'],
    'accent': ['#F4EDE0', '#D9483B', '#F2C14E', '#3D7CC9', '#2B2F3A', '#5E9A4A', '#F59AB8'],
    'pants': ['#3B3F52', '#4A3830', '#2E3440', '#5A4A6A', '#3F5675', '#6A6A70', '#7A5C40', '#2B3A5E'],
    'skirt': ['#C8463D', '#3B3F52', '#5A4A6A', '#2E8A8A', '#7A5C40', '#E8A0B4', '#3D7CC9'],
    'tights': ['#2E3440', '#F4F1EA', '#C8463D', '#3B3F52', '#E8A0B4', '#6A5A7A'],
    'shoes': ['#6B4A2E', '#3B2A20', '#8A5A33', '#2A2A30', '#C8463D', '#F2C230', '#5A3A4A'],
    'knit': ['#D9483B', '#3D7CC9', '#F2C230', '#F4EDE0', '#5E9A4A', '#8A63C9', '#F08A3A', '#2E8A8A',
             '#F59AB8', '#7A6A58'],
    'felt': ['#7A6A58', '#3A3040', '#5A4A3A', '#2B3A5E', '#8A5A3A', '#4A4A52'],
    'fur': ['#F4F1EA', '#E6DCCB', '#D9C3A0', '#B8A890', '#8A6A4A'],
    'leather': ['#8A5A33', '#6B4A2E', '#3B2A20', '#C8A878', '#9A5A2E', '#3D7CC9', '#C8463D'],
    'metal': ['#2B2F3A', '#C9A045', '#8A5A33', '#C8463D', '#5A4A6A'],
    'gloves': ['#3B3F4A', '#6B4A2E', '#C8463D', '#F4EDE0', '#3D7CC9', '#F2C230'],
}

# which palette feeds which tint slot by default (the generator can override per look / preset)
SLOT_PALETTE = {'skin': 'skin', 'hair': 'hair', 'top': 'cloth', 'top2': 'accent', 'fur': 'fur',
                'bottom': 'pants', 'bottom2': 'tights', 'shoes': 'shoes', 'hat': 'knit', 'hat2': 'accent',
                'acc': 'knit', 'acc2': 'accent', 'bag': 'leather', 'glasses': 'metal'}

# =========================================================================== combination rules
# Pairs that never appear together ('family:x' / 'tag:y' / part name).  The generator drops
# the later pick; presets are written to respect them.
EXCLUDE = [
    ['family:headacc', 'family:hat'],          # earmuffs / bows / clips are for bare heads
    ['tag:tall', 'hat_beret'], ['tag:tall', 'hat_headband'], ['tag:tall', 'hat_nurse'],
    ['tag:big', 'hat_beret'], ['tag:big', 'hat_headband'], ['tag:big', 'hat_nurse'],
    ['bot_overalls', 'tag:dress'], ['bot_overalls', 'top_labcoat'], ['bot_overalls', 'top_uniform'],
    ['bot_overalls', 'top_coat'], ['bot_overalls', 'top_duffle'],
    ['acc_scarf', 'det_stethoscope'], ['acc_scarf', 'det_tie'], ['acc_scarf', 'det_bow'],
    ['acc_necklace', 'det_tie'], ['acc_necklace', 'det_bow'],
    ['acc_glasses', 'acc_glasses_sq'],
    ['acc_satchel', 'acc_backpack'], ['acc_mailbag', 'acc_satchel'], ['acc_mailbag', 'acc_backpack'],
]
UNDER_DRESS = ['bot_tights']

# =========================================================================== random townsfolk
# weights per age and per 'look' (A = softer / long hair / skirts allowed, B = short hair /
# trousers / facial hair).  Pure data: townfolk_compose.generate() and the game read it 1:1.
BASE_WEIGHTS = {'child_slim': 14, 'child_round': 9, 'adult_slim': 30, 'adult_round': 17, 'elder_slim': 15,
                'elder_round': 15}
GEN = {
    'child': {
        'faces': {'A': {'kidlash': 3, 'kid': 1}, 'B': {'kid': 1}},
        'noses': {'dot': 3, 'button': 2},
        'hair': {'A': {'hair_twintails': 3, 'hair_twintails_long': 2, 'hair_bob': 3, 'hair_ponytail': 2,
                       'hair_bob_long': 2, 'hair_braids': 1, 'hair_curly': 1, 'hair_long': 1},
                 'B': {'hair_short': 3, 'hair_spiky': 2, 'hair_buzz': 1, 'hair_curly': 2, 'hair_sidepart': 1,
                       'hair_bob': 1}},
        'hairPalette': 'hair',
        'hats': {'hat_pompom': 4, 'hat_beanie': 2, 'hat_earflap': 3, 'hat_ushanka': 2, 'hat_stocking': 2,
                 'hat_cap': 2, 'hat_bucket': 1, 'hat_headband': 1}, 'hatChance': 0.55,
        'tops': {'A': {'top_puffer': 3, 'top_parka': 3, 'top_dress': 2, 'top_duffle': 2, 'top_sweater': 1,
                       'top_hoodie': 1, 'top_cardigan': 1},
                 'B': {'top_puffer': 3, 'top_parka': 2, 'top_hoodie': 3, 'top_bomber': 2, 'top_sweater': 2,
                       'top_duffle': 1, 'top_vest': 1}},
        'bottoms': {'A': {'bot_skirt': 3, 'bot_snowpants': 2, 'bot_pants': 2, 'bot_pleated': 1, 'bot_overalls': 1},
                    'B': {'bot_pants': 3, 'bot_snowpants': 3, 'bot_overalls': 1}},
        'shoes': {'shoe_furboots': 3, 'shoe_boots': 3, 'shoe_rubber': 2, 'shoe_shoes': 1},
        'glasses': {'acc_glasses': 1}, 'glassesChance': 0.08,
        'neck': {'acc_scarf': 1}, 'neckChance': 0.4,
        'bag': {'acc_backpack': 3, 'acc_satchel': 1}, 'bagChance': 0.3,
        'headAcc': {'A': {'acc_earmuffs': 3, 'acc_ribbon': 3, 'acc_hairclip': 2}, 'B': {'acc_earmuffs': 1}},
        'headAccChance': 0.35, 'gloveChance': 0.6,
        'facialHair': {}, 'facialHairChance': 0.0,
    },
    'adult': {
        'faces': {'A': {'lash': 3, 'std': 1}, 'B': {'std': 3, 'bold': 2}},
        'noses': {'dot': 4, 'button': 2, 'big': 1},
        'hair': {'A': {'hair_long': 3, 'hair_long_xl': 1, 'hair_bob': 3, 'hair_bob_long': 3, 'hair_ponytail': 2,
                       'hair_ponytail_long': 2, 'hair_bun': 2, 'hair_lowbun': 2, 'hair_braids': 1, 'hair_wavy': 2,
                       'hair_curly': 1, 'hair_afro': 1, 'hair_twintails': 1},
                 'B': {'hair_short': 3, 'hair_sidepart': 3, 'hair_spiky': 1, 'hair_buzz': 2, 'hair_curly': 2,
                       'hair_wavy': 1, 'hair_afro': 1, 'hair_bald': 1}},
        'hairPalette': 'hair',
        'hats': {'hat_beanie': 3, 'hat_pompom': 2, 'hat_ushanka': 2, 'hat_flatcap': 2, 'hat_cap': 2,
                 'hat_bucket': 2, 'hat_beret': 2, 'hat_earflap': 1, 'hat_stocking': 1, 'hat_fedora': 1,
                 'hat_headband': 1}, 'hatChance': 0.42,
        'tops': {'A': {'top_coat': 2, 'top_parka': 2, 'top_puffer': 2, 'top_cardigan': 2, 'top_dress': 2,
                       'top_duffle': 2, 'top_sweater': 2, 'top_hoodie': 1, 'top_vest': 1},
                 'B': {'top_coat': 2, 'top_parka': 3, 'top_puffer': 3, 'top_sweater': 2, 'top_bomber': 2,
                       'top_hoodie': 2, 'top_vest': 2, 'top_duffle': 1, 'top_cardigan': 1}},
        'bottoms': {'A': {'bot_skirt': 3, 'bot_longskirt': 2, 'bot_pants': 3, 'bot_snowpants': 1},
                    'B': {'bot_pants': 5, 'bot_snowpants': 2, 'bot_overalls': 1}},
        'shoes': {'shoe_boots': 4, 'shoe_furboots': 2, 'shoe_shoes': 3, 'shoe_rubber': 1},
        'glasses': {'acc_glasses': 2, 'acc_glasses_sq': 2}, 'glassesChance': 0.25,
        'neck': {'acc_scarf': 4, 'acc_necklace': 1}, 'neckChance': 0.35,
        'bag': {'acc_satchel': 2, 'acc_backpack': 1}, 'bagChance': 0.25,
        'headAcc': {'A': {'acc_earmuffs': 2, 'acc_hairclip': 1}, 'B': {'acc_earmuffs': 1}}, 'headAccChance': 0.1,
        'gloveChance': 0.35,
        'facialHair': {'B': {'fh_moustache': 3, 'fh_beard': 3, 'fh_handlebar': 1}}, 'facialHairChance': 0.3,
    },
    'elder': {
        'faces': {'A': {'elder': 1}, 'B': {'elder': 1}},
        'noses': {'big': 3, 'dot': 2, 'button': 1},
        'hair': {'A': {'hair_lowbun': 3, 'hair_bun': 2, 'hair_bob': 2, 'hair_curly': 2, 'hair_wavy': 1,
                       'hair_short': 1},
                 'B': {'hair_bald': 4, 'hair_short': 2, 'hair_sidepart': 2, 'hair_buzz': 1, 'hair_curly': 1}},
        'hairPalette': 'hair_elder',
        'hats': {'hat_flatcap': 3, 'hat_fedora': 2, 'hat_beanie': 2, 'hat_ushanka': 2, 'hat_beret': 2,
                 'hat_bucket': 1, 'hat_earflap': 1}, 'hatChance': 0.5,
        'tops': {'A': {'top_cardigan': 4, 'top_coat': 3, 'top_dress': 2, 'top_sweater': 2, 'top_parka': 2,
                       'top_duffle': 1, 'top_puffer': 1},
                 'B': {'top_coat': 3, 'top_vest': 3, 'top_cardigan': 2, 'top_sweater': 2, 'top_parka': 2,
                       'top_puffer': 1, 'top_duffle': 1}},
        'bottoms': {'A': {'bot_longskirt': 4, 'bot_skirt': 1, 'bot_pants': 2},
                    'B': {'bot_pants': 5, 'bot_overalls': 1}},
        'shoes': {'shoe_shoes': 3, 'shoe_boots': 3, 'shoe_furboots': 2, 'shoe_rubber': 1},
        'glasses': {'acc_glasses': 3, 'acc_glasses_sq': 1}, 'glassesChance': 0.5,
        'neck': {'acc_scarf': 3, 'acc_necklace': 1}, 'neckChance': 0.45,
        'bag': {'acc_satchel': 1}, 'bagChance': 0.12,
        'headAcc': {'A': {'acc_hairclip': 1}, 'B': {}}, 'headAccChance': 0.05,
        'gloveChance': 0.3,
        'facialHair': {'B': {'fh_moustache': 3, 'fh_longbeard': 2, 'fh_beard': 2, 'fh_handlebar': 1}},
        'facialHairChance': 0.45,
        'colors': {'top': 'muted'},
    },
}

# =========================================================================== named job presets
# Each preset: bases + fixed / weighted part picks + colours ('#hex' fixed, [list] = pick one,
# palette name = pick from that palette).  Anything left out falls back to GEN for that age.
PRESETS = {
    'teacher': {'label': {'ko': '선생님', 'en': 'teacher'},
                'bases': {'adult_slim': 3, 'adult_round': 2, 'elder_slim': 1},
                'tops': {'top_cardigan': 3, 'top_blazer': 2}, 'bottoms': {'bot_longskirt': 2, 'bot_pants': 2},
                'shoes': ['shoe_shoes'], 'hats': None, 'glasses': {'acc_glasses': 1, 'acc_glasses_sq': 1},
                'glassesChance': 0.7, 'extra': ['det_lanyard'], 'neck': None, 'bag': None, 'headAcc': None,
                'colors': {'top': ['#7A5C40', '#5E7A3A', '#C98C8C', '#3B3F52', '#8A6A4A'],
                           'top2': ['#F7F5F0', '#F4EDE0', '#E8DCC0'], 'bottom': ['#3B3F52', '#5A4A6A', '#6A6A70']}},
    'student': {'label': {'ko': '학생', 'en': 'student'},
                'bases': {'child_slim': 3, 'child_round': 2},
                'tops': ['top_blazer'], 'bottoms': {'bot_pleated': 1, 'bot_pants': 1}, 'shoes': ['shoe_shoes'],
                'hats': None, 'neck': None, 'bag': ['acc_backpack'], 'bagChance': 0.9,
                'extra': {'det_tie': 1, 'det_bow': 1},
                'colors': {'top': ['#2B3A5E'], 'top2': ['#C8343A', '#2F5E48'], 'bottom': ['#2B3A5E', '#3B4A6B'],
                           'bottom2': ['#2E3440', '#F4F1EA'], 'shoes': ['#3B2A20', '#2A2A30'],
                           'bag': ['#C8463D', '#3D7CC9', '#F2C230', '#5E9A4A']}},
    'police': {'label': {'ko': '경찰', 'en': 'police officer'},
               'bases': {'adult_slim': 3, 'adult_round': 2},
               'tops': ['top_uniform'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'], 'hats': ['hat_police'],
               'hatChance': 1.0, 'extra': ['det_police'], 'neck': None, 'bag': None, 'glassesChance': 0.05,
               'headAcc': None, 'facialHairChance': 0.15,
               'colors': {'top': ['#2B3A5E'], 'top2': ['#1E2A44'], 'hat': ['#2B3A5E'], 'bottom': ['#2B3A5E'],
                          'shoes': ['#1E1E26'], 'hands': ['#F4F1EA', 'skin']}},
    'postal': {'label': {'ko': '우체부', 'en': 'postal worker'},
               'bases': {'adult_slim': 3, 'adult_round': 1, 'elder_slim': 1},
               'tops': ['top_uniform'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'], 'hats': ['hat_postal'],
               'hatChance': 1.0, 'bag': ['acc_mailbag'], 'bagChance': 1.0, 'neck': None, 'headAcc': None,
               'colors': {'top': ['#3D6FB8'], 'top2': ['#D23A32'], 'hat': ['#D23A32'], 'bottom': ['#2B3A5E'],
                          'bag': ['#9A5A2E'], 'shoes': ['#3B2A20']}},
    'doctor': {'label': {'ko': '의사', 'en': 'doctor'},
               'bases': {'adult_slim': 3, 'adult_round': 1, 'elder_slim': 1, 'elder_round': 1},
               'tops': ['top_labcoat'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'], 'hats': None,
               'glasses': {'acc_glasses': 1, 'acc_glasses_sq': 1}, 'glassesChance': 0.6,
               'extra': ['det_stethoscope'], 'neck': None, 'bag': None, 'headAcc': None,
               'colors': {'top': ['#F7F7F4'], 'top2': ['#3F7A8A', '#A8324A', '#5E7A3A', '#3B3F52'],
                          'bottom': ['#4A4A52', '#3B3F52']}},
    'nurse': {'label': {'ko': '간호사', 'en': 'nurse'},
              'bases': {'adult_slim': 3, 'adult_round': 1},
              'tops': ['top_tunic'], 'bottoms': ['bot_tights'], 'shoes': ['shoe_shoes'], 'hats': ['hat_nurse'],
              'hatChance': 0.8, 'hair': {'hair_bob': 2, 'hair_lowbun': 2, 'hair_ponytail': 1, 'hair_short': 1,
                                         'hair_bob_long': 1},
              'neck': None, 'bag': None, 'headAcc': None, 'glassesChance': 0.15, 'facialHairChance': 0.0,
              'colors': {'top': ['#F7F7F4', '#F7DCE4', '#DCEBF7'], 'bottom2': ['#F4F1EA'], 'shoes': ['#F4F1EA']}},
    'hairdresser': {'label': {'ko': '미용사', 'en': 'hairdresser'},
                    'bases': {'adult_slim': 4, 'adult_round': 1},
                    'tops': {'top_sweater': 2, 'top_cardigan': 1}, 'bottoms': {'bot_pants': 2, 'bot_skirt': 1},
                    'shoes': ['shoe_shoes'], 'hats': None, 'extra': ['det_apron_salon'], 'neck': None, 'bag': None,
                    'hair': {'hair_bob': 2, 'hair_wavy': 2, 'hair_afro': 1, 'hair_bun': 2, 'hair_ponytail_long': 1,
                             'hair_sidepart': 1, 'hair_spiky': 1},
                    'colors': {'hair': 'hair_fun', 'top': ['#2B2F3A', '#F4EDE0', '#8A63C9'], 'top2': ['#2B2F3A'],
                               'acc': ['#2B2F3A', '#5A4A6A'], 'bottom': ['#2B2F3A', '#3B3F52']}},
    'barista': {'label': {'ko': '바리스타', 'en': 'barista'},
                'bases': {'adult_slim': 4, 'adult_round': 2},
                'tops': {'top_sweater': 2, 'top_hoodie': 1}, 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'],
                'hats': {'hat_cap': 1, 'hat_beret': 1}, 'hatChance': 0.5, 'extra': ['det_apron'], 'neck': None,
                'bag': None, 'headAcc': None,
                'colors': {'top': ['#F4EDE0', '#3B3F52', '#7A5C40'], 'top2': ['#F4EDE0'],
                           'acc': ['#2F5E48', '#6B4A2E', '#2B2F3A'], 'hat': ['#2F5E48', '#2B2F3A'],
                           'hat2': ['#2F5E48', '#2B2F3A'], 'bottom': ['#2B2F3A', '#3B3F52']}},
    'station': {'label': {'ko': '역무원', 'en': 'station attendant'},
                'bases': {'adult_slim': 3, 'adult_round': 2, 'elder_slim': 1},
                'tops': ['top_uniform'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'], 'hats': ['hat_station'],
                'hatChance': 1.0, 'extra': ['det_station'], 'neck': None, 'bag': None, 'headAcc': None,
                'colors': {'top': ['#2F5E48', '#22305A'], 'top2': ['#C8343A'], 'hat': ['#2F5E48', '#22305A'],
                           'bottom': ['#22305A'], 'shoes': ['#1E1E26'], 'hands': ['#F4F1EA']}},
    'factory': {'label': {'ko': '공장 노동자', 'en': 'factory worker'},
                'bases': {'adult_slim': 3, 'adult_round': 3, 'elder_round': 1},
                'tops': {'top_sweater': 2, 'top_hoodie': 1, 'top_puffer': 1}, 'bottoms': ['bot_overalls'],
                'shoes': {'shoe_rubber': 1, 'shoe_boots': 2}, 'hats': ['hat_hardhat'], 'hatChance': 1.0,
                'extra': ['det_hivis'], 'neck': None, 'bag': None, 'headAcc': None, 'gloveChance': 0.9,
                'colors': {'hat': ['#F2C230', '#F28A2A', '#F4F1EA'], 'acc': ['#F28A2A', '#C8E83A'],
                           'bottom': ['#3D6FA8', '#6A6A70', '#4A5A6A'], 'top': 'muted',
                           'shoes': ['#2E3440', '#3B2A20', '#F2C230']}},
}
