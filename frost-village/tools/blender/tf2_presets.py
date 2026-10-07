"""
tf2_presets.py - townfolk v5 palettes, colour slots and life-event presets (CONTRACT_V5 Q).
Pure python; tf2_pack copies these into assets/townfolk2/manifest.json (block townfolk2.generator).

Presets (same format as tf_presets.PRESETS; the merged generator handles them like the v4 jobs):
  bride          adult, wedding_dress + veil + flower_crown + held_bouquet, festive colours
  groom          adult, groom_suit (dark), bow tie, trousers matching the suit
  wedding_guest  any age: pretty clothes, suits for some adults, flower crowns / ribbons for some
  flower_girl    child, dress + flower crown + small bouquet
  mourner        any age: mourning_coat, dark clothes, some black hats, a white bouquet
  mourner_family close family at a farewell: mourning_coat + black_hat for adults, no bouquet colour change
"""

# new colour slots the v4 generator does not fill (townfolk2_compose.generate2 fills them from the preset)
EXTRA_SLOTS = ['gown', 'flower', 'flower2', 'wrap']

PALETTES2 = {
    'gown': ['#FAF8F3', '#F7EEDF', '#F7E4EA', '#E8F0F7', '#F4E8D0'],
    'flower': ['#FAF6F2', '#F59AB8', '#F7C8D8', '#F2C230', '#E8524A', '#C8A0E0', '#F2E6B8', '#9CC7E6', '#F08A3A'],
    'flower_white': ['#FAF6F2', '#F4EDE0', '#F2E6B8'],
    'wrap': ['#F7F3EC', '#F4EDE0', '#F7E4EA', '#E8F0F7', '#C8A878', '#3B3F52'],
    'formal': ['#2B2F3A', '#3B3F52', '#2B3A5E', '#4A4A52', '#5A4A3A', '#7A6A58'],
    'mourning': ['#2B2F3A', '#2E3440', '#3A3040', '#3B3F52', '#2A2228', '#4A4A52'],
    'bowtie': ['#2B2F3A', '#C8343A', '#2B3A5E', '#F2B8C8', '#5E9A4A', '#F2C14E'],
    'party': ['#F59AB8', '#F7C8D8', '#9CC7E6', '#F2C230', '#C8A0E0', '#5E9A4A', '#F08A3A', '#3D7CC9', '#D9483B'],
}
SLOT_PALETTE2 = {'gown': 'gown', 'flower': 'flower', 'flower2': 'flower', 'wrap': 'wrap'}
# extra colours for v4 tint slots (precomputed tints added to tintTable[slot])
EXTRA_TINTS = {
    'top': PALETTES2['formal'] + PALETTES2['mourning'] + PALETTES2['party'],
    'top2': PALETTES2['bowtie'] + ['#F7F5F0'],
    'bottom': PALETTES2['formal'] + PALETTES2['mourning'],
    'hat': ['#2B2F3A', '#2A2228', '#3A3040', '#3B3F52'],
    'hat2': ['#2B2F3A', '#3B3F52', '#4A4A52', '#2A2228'],
    'acc2': ['#F2B8C8', '#F7C8D8', '#9CC7E6', '#F2C14E', '#C8A0E0', '#F4EDE0'],
}

EXCLUDE2 = [
    ['veil', 'family:hat'], ['veil', 'acc_earmuffs'], ['flower_crown', 'acc_earmuffs'],
    ['wedding_dress', 'acc_backpack'], ['wedding_dress', 'acc_satchel'], ['wedding_dress', 'acc_mailbag'],
    ['groom_suit', 'acc_backpack'], ['groom_suit', 'det_tie'], ['groom_suit', 'det_bow'], ['groom_suit', 'acc_scarf'],
    ['mourning_coat', 'acc_backpack'], ['mourning_coat', 'det_hivis'],
]

PRESETS2 = {
    'bride': {'label': {'ko': '신부', 'en': 'bride'},
              'bases': {'adult_slim': 4, 'adult_round': 2}, 'look': 'A',
              'tops': ['wedding_dress'], 'shoes': ['shoe_shoes'], 'hats': None, 'neck': None, 'bag': None,
              'glassesChance': 0.1, 'facialHairChance': 0.0,
              'hair': {'hair_bun': 3, 'hair_lowbun': 3, 'hair_long': 2, 'hair_wavy': 2, 'hair_bob_long': 2,
                       'hair_ponytail_long': 1, 'hair_braids': 1, 'hair_curly': 1},
              'headAcc': ['flower_crown'], 'headAccChance': 1.0, 'extra': ['veil', 'held_bouquet'],
              'gloveChance': 0.0,
              'colors': {'gown': ['#FAF8F3', '#FAF8F3', '#F7EEDF', '#F7E4EA'], 'acc2': ['#F2B8C8', '#F7C8D8', '#9CC7E6',
                                                                                    '#F2C14E', '#C8A0E0'],
                         'bottom2': ['#F4F1EA'], 'shoes': ['#E6E0D6', '#C8A878'],
                         'flower': ['#F59AB8', '#F7C8D8', '#FAF6F2', '#C8A0E0', '#F2C230'],
                         'flower2': ['#FAF6F2', '#F7C8D8', '#F2E6B8'], 'wrap': ['#F7F3EC', '#F7E4EA', '#E8F0F7']}},
    'groom': {'label': {'ko': '신랑', 'en': 'groom'},
              'bases': {'adult_slim': 4, 'adult_round': 2}, 'look': 'B',
              'tops': ['groom_suit'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'], 'hats': None, 'neck': None,
              'bag': None, 'headAcc': None, 'glassesChance': 0.15, 'facialHairChance': 0.2, 'gloveChance': 0.0,
              'hair': {'hair_sidepart': 4, 'hair_short': 3, 'hair_curly': 1, 'hair_wavy': 1, 'hair_buzz': 1},
              'colors': {'top': ['#2B2F3A', '#2B2F3A', '#3B3F52', '#2B3A5E', '#4A4A52'], 'top2': 'bowtie',
                         'bottom': ['=top'], 'shoes': ['#2A2A30', '#3B2A20']}},
    'wedding_guest': {'label': {'ko': '하객', 'en': 'wedding guest'},
                      'bases': {'child_slim': 2, 'child_round': 1, 'adult_slim': 5, 'adult_round': 3, 'elder_slim': 2,
                                'elder_round': 2},
                      'tops': {'groom_suit': 2, 'top_dress': 3, 'top_cardigan': 2, 'top_coat': 1, 'top_sweater': 1,
                               'top_blazer': 1},
                      'hats': {'hat_beret': 1, 'hat_fedora': 1}, 'hatChance': 0.15, 'neck': None, 'bag': None,
                      'headAcc': {'flower_crown': 2, 'acc_ribbon': 1, 'acc_hairclip': 1}, 'headAccChance': 0.35,
                      'gloveChance': 0.1,
                      'colors': {'top': 'party', 'top2': ['#F4EDE0', '#F7F5F0', '#F2C14E'], 'acc2': 'party',
                                 'flower': ['#F59AB8', '#F2C230', '#FAF6F2', '#C8A0E0', '#9CC7E6'],
                                 'flower2': ['#FAF6F2', '#F7C8D8']}},
    'flower_girl': {'label': {'ko': '화동', 'en': 'flower girl'},
                    'bases': {'child_slim': 3, 'child_round': 1}, 'look': 'A',
                    'tops': ['top_dress'], 'shoes': ['shoe_shoes', 'shoe_furboots'], 'hats': None, 'neck': None,
                    'bag': None, 'headAcc': ['flower_crown'], 'headAccChance': 1.0, 'extra': ['held_bouquet'],
                    'colors': {'top': ['#F7C8D8', '#FAF8F3', '#E8F0F7', '#F59AB8'], 'top2': ['#F4EDE0'],
                               'bottom2': ['#F4F1EA'], 'flower': ['#F59AB8', '#F2C230', '#FAF6F2'],
                               'flower2': ['#FAF6F2'], 'wrap': ['#F7F3EC', '#F7E4EA']}},
    'mourner': {'label': {'ko': '조문객', 'en': 'mourner'},
                'bases': {'child_slim': 2, 'child_round': 1, 'adult_slim': 5, 'adult_round': 3, 'elder_slim': 3,
                          'elder_round': 3},
                'tops': ['mourning_coat'], 'bottoms': {'bot_pants': 4, 'bot_longskirt': 2, 'bot_skirt': 1},
                'shoes': ['shoe_shoes', 'shoe_boots'], 'hats': ['black_hat'], 'hatChance': 0.35, 'neck': None,
                'bag': None, 'headAcc': None, 'extra': ['held_bouquet'],
                'colors': {'top': 'mourning', 'bottom': ['#2B2F3A', '#2E3440', '#3B3F52'], 'bottom2': ['#2E3440'],
                           'hat': ['#2B2F3A', '#2A2228'], 'hat2': ['#3B3F52', '#4A4A52'],
                           'shoes': ['#2A2A30', '#3B2A20'], 'flower': 'flower_white', 'flower2': ['#FAF6F2'],
                           'wrap': ['#F4EDE0', '#F7F3EC'], 'hands': ['skin', 'skin', 'skin', '#3B3F4A', '#6B4A2E'],
                           'acc': ['#3B3F52', '#2B2F3A'], 'acc2': ['#F4EDE0']}},
    'mourner_family': {'label': {'ko': '유가족', 'en': 'bereaved family'},
                       'bases': {'child_slim': 2, 'child_round': 1, 'adult_slim': 5, 'adult_round': 3, 'elder_slim': 2,
                                 'elder_round': 2},
                       'tops': ['mourning_coat'], 'bottoms': {'bot_pants': 4, 'bot_longskirt': 2},
                       'shoes': ['shoe_shoes'], 'hats': ['black_hat'], 'hatChance': 0.6, 'neck': None, 'bag': None,
                       'headAcc': None, 'extra': ['held_bouquet'],
                       'colors': {'top': ['#2B2F3A', '#2A2228'], 'bottom': ['#2B2F3A'], 'bottom2': ['#2E3440'],
                                  'hat': ['#2B2F3A', '#2A2228'], 'hat2': ['#2B2F3A'], 'shoes': ['#2A2A30'],
                                  'flower': ['#FAF6F2'], 'flower2': ['#FAF6F2', '#F2E6B8'], 'wrap': ['#F4EDE0'],
                                  'hands': ['skin', 'skin', '#3B3F4A']}},
}
