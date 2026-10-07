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
    'wrap': ['#F7F3EC', '#F4EDE0', '#F7E4EA', '#DCE6EC', '#C8A878', '#3B3F52'],
    'formal': ['#2B2F3A', '#3B3F52', '#2B3A5E', '#4A4A52', '#5A4A3A', '#7A6A58'],
    'mourning': ['#2B2F3A', '#2E3440', '#3A3040', '#3B3F52', '#2A2228', '#4A4A52'],
    'bowtie': ['#2B2F3A', '#C8343A', '#2B3A5E', '#E8B0C0', '#5E9A4A', '#E0B24A'],
    'party': ['#F59AB8', '#EEBCCB', '#9CC7E6', '#F2C230', '#C8A0E0', '#5E9A4A', '#F08A3A', '#3D7CC9', '#D9483B'],
}
SLOT_PALETTE2 = {'gown': 'gown', 'flower': 'flower', 'flower2': 'flower', 'wrap': 'wrap'}
# extra colours for v4 tint slots (precomputed tints added to tintTable[slot])
EXTRA_TINTS = {
    'top': PALETTES2['formal'] + PALETTES2['mourning'] + PALETTES2['party'],
    'top2': PALETTES2['bowtie'] + ['#ECEAE4'],
    'bottom': PALETTES2['formal'] + PALETTES2['mourning'],
    'hat': ['#2B2F3A', '#2A2228', '#3A3040', '#3B3F52'],
    'hat2': ['#2B2F3A', '#3B3F52', '#4A4A52', '#2A2228'],
    'acc2': ['#E8B0C0', '#EEBCCB', '#9CC7E6', '#E0B24A', '#C8A0E0', '#E8E2D6'],
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
              'colors': {'gown': ['#FAF8F3', '#FAF8F3', '#F7EEDF', '#F7E4EA'], 'acc2': ['#E8B0C0', '#EEBCCB', '#9CC7E6',
                                                                                    '#E0B24A', '#C8A0E0'],
                         'bottom2': ['#F4F1EA'], 'shoes': ['#E6E0D6', '#C8A878'],
                         'flower': ['#F59AB8', '#F7C8D8', '#FAF6F2', '#C8A0E0', '#F2C230'],
                         'flower2': ['#FAF6F2', '#F7C8D8', '#F2E6B8'], 'wrap': ['#F7F3EC', '#F7E4EA', '#DCE6EC']}},
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
                      'colors': {'top': 'party', 'top2': ['#E8E2D6', '#ECEAE4', '#E0B24A'], 'acc2': 'party',
                                 'flower': ['#F59AB8', '#F2C230', '#FAF6F2', '#C8A0E0', '#9CC7E6'],
                                 'flower2': ['#FAF6F2', '#F7C8D8']}},
    'flower_girl': {'label': {'ko': '화동', 'en': 'flower girl'},
                    'bases': {'child_slim': 3, 'child_round': 1}, 'look': 'A',
                    'tops': ['top_dress'], 'shoes': ['shoe_shoes', 'shoe_furboots'], 'hats': None, 'neck': None,
                    'bag': None, 'headAcc': ['flower_crown'], 'headAccChance': 1.0, 'extra': ['held_bouquet'],
                    'colors': {'top': ['#EEBCCB', '#E6E4DE', '#D8E2EA', '#F59AB8'], 'top2': ['#E8E2D6'],
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


# =========================================================================== look-dev / proof outfits
# full Blender renders of these (tf2_render.py --mode full --combos look) are compared with the paper-doll
# composites in docs/previews/townfolk2_proof.png (tf2_preview.py proof)
LOOK = [
    dict(name='bride', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bun', 'wedding_dress', 'bot_tights', 'shoe_shoes', 'veil', 'flower_crown', 'held_bouquet'],
         colors=dict(skin='#F6CFAE', hair='#3A2A22', gown='#FAF8F3', acc2='#F2B8C8', bottom2='#F4F1EA',
                     shoes='#E8E2D8', sleeve='#F6CFAE', hands='#F6CFAE', flower='#F59AB8', flower2='#FAF6F2',
                     wrap='#F7F3EC', top='#FAF8F3')),
    dict(name='groom', base='adult_slim', face='std', nose='dot',
         parts=['hair_sidepart', 'groom_suit', 'bot_pants', 'shoe_shoes'],
         colors=dict(skin='#E8B48C', hair='#2A2228', top='#2B2F3A', top2='#C8343A', bottom='#2B2F3A',
                     shoes='#2A2A30', sleeve='#2B2F3A', hands='#E8B48C')),
    dict(name='mourner', base='elder_slim', face='elder', nose='big',
         parts=['hair_lowbun', 'mourning_coat', 'bot_longskirt', 'shoe_shoes', 'black_hat', 'held_bouquet'],
         colors=dict(skin='#F2C29A', hair='#C8C2BC', top='#2E3440', bottom='#2B2F3A', shoes='#2A2A30',
                     hat='#2A2228', hat2='#3B3F52', sleeve='#2E3440', hands='#F2C29A', flower='#FAF6F2',
                     flower2='#F2E6B8', wrap='#F4EDE0')),
    dict(name='kid', base='child_slim', face='kidlash', nose='button',
         parts=['hair_twintails', 'top_dress', 'bot_tights', 'shoe_furboots', 'flower_crown'],
         colors=dict(skin='#F6CFAE', hair='#8A5232', top='#F59AB8', top2='#F4EDE0', bottom2='#F4F1EA',
                     shoes='#C8463D', fur='#F4F1EA', sleeve='#F59AB8', hands='#F6CFAE', flower='#F2C230',
                     flower2='#FAF6F2', acc2='#F4EDE0')),
]
LOOK_FRAMES = [('sad', 'S', 0), ('sad', 'SE', 2), ('clap', 'S', 2), ('clap', 'E', 0), ('sit', 'S', 0),
               ('sit', 'SE', 1), ('sit', 'E', 2), ('push', 'S', 1), ('push', 'SE', 3), ('push', 'E', 5),
               ('push', 'N', 2), ('idle', 'S', 0), ('walk', 'SE', 2), ('happy', 'S', 2), ('wave', 'E', 1),
               ('idle', 'N', 1)]
