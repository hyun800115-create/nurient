"""
cf_presets.py - cityfolk palettes, presets, combination rules and the per-anim CAST (which body parts get
frames in which anim) - CONTRACT_V8 AD.  Pure python; cf_pack copies these into assets/cityfolk/manifest.json.

Texture memory: rendering every body part of every age in all twelve new anims would cost ~40 Mpx
(~160 MB of GPU memory).  The cast keeps the common everyday wardrobe of each age in the anims ordinary
residents play (run, shock, point, think, phone, argue ...), the job outfits in the anims their jobs need
(firefighter + spray_hose, burglar + flee / arrested_walk, movers + carry_box ...), and a small 'mini'
wardrobe elsewhere so every base can play every anim.  A person whose outfit is not cast for an anim plays
the anim's fallback (cityfolk.animFallback, e.g. flee -> run -> walk, carry_box -> carry_walk) - the
compositor's canPlay() / pickAnim() handle it.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
TF_MANIFEST = os.path.join(GAME, 'assets', 'townfolk', 'manifest.json')

RENDER_BASES = ['child_slim', 'adult_slim', 'elder_slim']
AGE_OF = {'child_slim': 'child', 'adult_slim': 'adult', 'elder_slim': 'elder'}

# =========================================================================== palettes (sRGB)
PALETTES3 = {
    'fire_coat': ['#C9A25E', '#2E3B5C', '#3A3A40', '#B8863A'],
    'fire_helmet': ['#D9483B', '#F2C230', '#2A2A30', '#F4F1EA'],
    'police_navy': ['#22305A', '#2B3A5E', '#1E2A44'],
    'hivis': ['#D8F040', '#F28A2A', '#F2C230'],
    'stripes_base': ['#F4EDE0', '#F7F5F0', '#ECEAE4'],
    'stripes_ink': ['#2B2F3A', '#2B3A5E', '#C8343A'],
    'suit': ['#2B2F3A', '#3B3F52', '#2B3A5E', '#4A4A52', '#5A4A3A'],
    'teller_vest': ['#2F5E48', '#5A3A4A', '#3B3F52', '#7A5C40', '#2B3A5E'],
    'shirt_pale': ['#F7F5F0', '#DCEBF7', '#F2ECDC'],
    'work': ['#B8925A', '#6E7A4A', '#3F5675', '#8A5A3A', '#5A6070'],
    'cord': ['#5A3A26', '#3B2A20', '#6B4A2E'],
    'delivery': ['#7A4A2A', '#D9483B', '#2E6E8A', '#E07A2A'],
    'mover': ['#2B3A5E', '#3D6FA8', '#4A5A6A', '#5A3A2A'],
    'trench': ['#C8A878', '#B8956A', '#8A7A60', '#6A6A70'],
    'plaid': ['#8A6A4A', '#6B5A3A', '#7A5C40'],
    'brace': ['#2B2F3A', '#3D6FB8', '#C8343A'],
    'workglove': ['#A88A68', '#C9A030', '#6B4A2E', '#3B3F4A'],
    'phone': ['#D9483B', '#3D7CC9', '#2B2F3A', '#F2C230', '#5E9A4A', '#F59AB8'],
}
SLOT_PALETTE3 = {}            # no new tint slots
# precomputed tints for colours the presets use on existing slots (added to tintTable[slot])
EXTRA_TINTS3 = {
    'top': (PALETTES3['fire_coat'] + PALETTES3['police_navy'] + PALETTES3['stripes_base'] + PALETTES3['suit'] +
            PALETTES3['teller_vest'] + PALETTES3['work'] + PALETTES3['delivery'] + PALETTES3['hivis'] +
            PALETTES3['trench']),
    'top2': (PALETTES3['hivis'] + PALETTES3['stripes_ink'] + PALETTES3['shirt_pale'] + PALETTES3['cord'] +
             ['#F4F1EA', '#C8343A', '#F2C14E', '#2B2F3A', '#E8B0C0', '#9CC7E6']),
    'bottom': PALETTES3['fire_coat'] + PALETTES3['mover'] + PALETTES3['suit'] + ['#2B2F3A', '#3B3F52'],
    'hat': PALETTES3['fire_helmet'] + PALETTES3['plaid'] + PALETTES3['delivery'] + ['#2A2A30', '#3A3040', '#F28A2A'],
    'hat2': ['#4A3A2A', '#3B2A20', '#C8A878', '#F4F1EA', '#2B2F3A'],
    'acc': PALETTES3['brace'] + PALETTES3['hivis'],
    'acc2': PALETTES3['phone'],
    'bag': ['#8A5A33', '#6B4A2E', '#3B2A20'],
    'hands': PALETTES3['workglove'] + ['#2A2A30', '#22242C'],
}

# =========================================================================== combination rules
EXCLUDE3 = [
    ['acc_eye_mask', 'family:glasses'], ['acc_eye_mask', 'acc_earmuffs'],
    ['acc_visor', 'tag:tall'], ['acc_visor', 'tag:big'],
    ['held_loot_sack', 'held_bouquet'], ['held_loot_sack', 'family:bag'],
    ['acc_air_tank', 'family:bag'], ['acc_air_tank', 'acc_scarf'], ['top_fire_coat', 'acc_scarf'],
    ['top_fire_coat', 'family:neck'], ['acc_camera', 'det_tie'], ['acc_camera', 'det_bow'],
    ['acc_back_brace', 'top_coat'], ['acc_back_brace', 'top_trench'], ['acc_back_brace', 'tag:dress'],
    ['acc_back_brace', 'bot_overalls'], ['acc_toolbelt', 'tag:dress'], ['acc_toolbelt', 'top_coat'],
    ['acc_toolbelt', 'top_trench'], ['acc_toolbelt', 'acc_back_brace'],
    ['bot_mover_overalls', 'tag:dress'], ['bot_mover_overalls', 'top_coat'], ['bot_mover_overalls', 'top_trench'],
    ['bot_mover_overalls', 'top_fire_coat'], ['top_suit_3pc', 'acc_scarf'], ['top_suit_3pc', 'acc_backpack'],
    ['top_teller_vest', 'acc_scarf'], ['top_police_v2', 'acc_scarf'], ['top_police_v2', 'det_hivis'],
    ['top_hivis_jacket', 'det_hivis'], ['top_trench', 'det_hivis'], ['top_stripes', 'det_tie'],
]

# =========================================================================== named presets
# same format as tf_presets.PRESETS ('extra' parts always added when they fit; '=slot' copies a colour)
PRESETS3 = {
    'firefighter': {'label': {'ko': '소방관', 'en': 'firefighter'},
                    'bases': {'adult_slim': 3, 'adult_round': 2},
                    'tops': ['top_fire_coat'], 'bottoms': ['bot_fire_pants'], 'shoes': ['shoe_rubber'],
                    'hats': ['hat_fire_helmet'], 'hatChance': 1.0, 'extra': ['acc_air_tank'], 'neck': None,
                    'bag': None, 'headAcc': None, 'glassesChance': 0.05, 'facialHairChance': 0.2,
                    'hair': {'hair_short': 3, 'hair_buzz': 2, 'hair_sidepart': 1, 'hair_bob': 1, 'hair_ponytail': 1},
                    'colors': {'top': ['#C9A25E', '#C9A25E', '#2E3B5C', '#3A3A40'], 'bottom': ['=top'],
                               'hat': ['#D9483B', '#D9483B', '#F2C230', '#2A2A30'], 'shoes': ['#2A2A30'],
                               'hands': ['#A88A68', '#3B3F4A', '#6B4A2E']}},
    'police_officer': {'label': {'ko': '경찰관', 'en': 'police officer'},
                       'bases': {'adult_slim': 3, 'adult_round': 2},
                       'tops': ['top_police_v2'], 'bottoms': ['bot_pants'], 'shoes': {'shoe_shoes': 1, 'shoe_boots': 1},
                       'hats': ['hat_police'], 'hatChance': 1.0, 'extra': ['det_police'], 'neck': None, 'bag': None,
                       'headAcc': None, 'glassesChance': 0.08, 'facialHairChance': 0.15,
                       'colors': {'top': ['#22305A', '#2B3A5E'], 'top2': ['#D8F040'], 'fur': ['#3B3F52', '#E6DCCB'],
                                  'hat': ['=top'], 'bottom': ['#22305A', '#2B3A5E'], 'shoes': ['#1E1E26'],
                                  'hands': ['#22242C', 'skin']}},
    'detective': {'label': {'ko': '탐정', 'en': 'detective'},
                  'bases': {'adult_slim': 3, 'adult_round': 1, 'elder_slim': 1, 'elder_round': 1},
                  'tops': ['top_trench'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'],
                  'hats': {'hat_deerstalker': 3, 'hat_fedora': 1}, 'hatChance': 0.9, 'neck': None, 'bag': None,
                  'headAcc': None, 'glasses': {'acc_glasses': 1, 'acc_glasses_sq': 1}, 'glassesChance': 0.35,
                  'facialHairChance': 0.4,
                  'colors': {'top': 'trench', 'hat': 'plaid', 'hat2': ['#4A3A2A', '#3B2A20', '#C8A878'],
                             'bottom': ['#4A3830', '#3B3F52', '#5A4A3A'], 'shoes': ['#3B2A20', '#6B4A2E'],
                             'hands': ['skin', '#6B4A2E']}},
    'burglar': {'label': {'ko': '좀도둑', 'en': 'petty thief'},
                'bases': {'adult_slim': 3, 'adult_round': 2},
                'tops': ['top_stripes'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'],
                'hats': ['hat_burglar_beanie'], 'hatChance': 1.0, 'extra': ['acc_eye_mask', 'held_loot_sack'],
                'neck': None, 'bag': None, 'headAcc': None, 'glassesChance': 0.0, 'facialHairChance': 0.35,
                'colors': {'top': ['#F4EDE0', '#F7F5F0'], 'top2': ['#2B2F3A', '#2B2F3A', '#2B3A5E'],
                           'hat': ['#3B3F4A', '#3A3040', '#4A4A52'], 'bottom': ['#2B2F3A', '#3B3F52'],
                           'shoes': ['#2A2A30'], 'hands': ['#2A2A30', '#3B3F4A']}},
    'banker': {'label': {'ko': '은행장', 'en': 'banker'},
               'bases': {'adult_slim': 2, 'adult_round': 3, 'elder_slim': 1, 'elder_round': 2},
               'tops': ['top_suit_3pc'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'], 'hats': {'hat_fedora': 1},
               'hatChance': 0.2, 'extra': ['det_tie'], 'neck': None, 'bag': None, 'headAcc': None,
               'glasses': {'acc_glasses': 1, 'acc_glasses_sq': 2}, 'glassesChance': 0.5, 'facialHairChance': 0.45,
               'colors': {'top': 'suit', 'top2': ['#C8343A', '#2B3A5E', '#F2C14E', '#5E9A4A'], 'bottom': ['=top'],
                          'shoes': ['#2A2A30', '#3B2A20'], 'hat': ['#2B2F3A', '#3B3F52'], 'hat2': ['#2B2F3A'],
                          'hands': ['skin']}},
    'bank_teller': {'label': {'ko': '은행 창구 직원', 'en': 'bank teller'},
                    'bases': {'adult_slim': 4, 'adult_round': 2},
                    'tops': ['top_teller_vest'], 'bottoms': {'bot_pants': 3, 'bot_skirt': 1}, 'shoes': ['shoe_shoes'],
                    'hats': ['acc_visor'], 'hatChance': 0.55, 'extra': {'det_bow': 1, 'det_tie': 1}, 'neck': None,
                    'bag': None, 'headAcc': None, 'glassesChance': 0.3, 'facialHairChance': 0.1,
                    'colors': {'top': 'teller_vest', 'top2': 'shirt_pale', 'bottom': ['#3B3F52', '#2B2F3A', '#4A3830'],
                               'shoes': ['#2A2A30', '#3B2A20'], 'hands': ['skin']}},
    'warehouse_worker': {'label': {'ko': '물류센터 직원', 'en': 'warehouse worker'},
                         'bases': {'adult_slim': 3, 'adult_round': 3},
                         'tops': ['top_work_jacket'], 'bottoms': ['bot_pants'],
                         'shoes': ['shoe_boots'], 'hats': {'hat_beanie': 2, 'hat_cap': 1}, 'hatChance': 0.5,
                         'extra': ['acc_gloves'], 'neck': None, 'bag': None, 'headAcc': None, 'gloveChance': 1.0,
                         'colors': {'top': 'work', 'top2': 'cord', 'bottom': ['#3F5675', '#3B3F52', '#4A3830'],
                                    'shoes': ['#3B2A20', '#6B4A2E'], 'hat': ['#F28A2A', '#3D6FB8', '#5E7A3A'],
                                    'hat2': ['=hat'], 'hands': 'workglove'}},
    'forklift_driver': {'label': {'ko': '지게차 기사', 'en': 'forklift driver'},
                        'bases': {'adult_slim': 3, 'adult_round': 3},
                        'tops': ['top_work_jacket'], 'bottoms': ['bot_overalls'], 'shoes': ['shoe_boots'],
                        'hats': ['hat_hardhat'], 'hatChance': 1.0, 'extra': ['det_hivis', 'acc_gloves'], 'neck': None,
                        'bag': None, 'headAcc': None,
                        'colors': {'top': 'work', 'top2': 'cord', 'acc': ['#F28A2A', '#D8F040'],
                                   'hat': ['#F2C230', '#F4F1EA'], 'bottom': ['#3D6FA8', '#4A5A6A'],
                                   'shoes': ['#3B2A20', '#2E3440'], 'hands': 'workglove'}},
    'delivery_driver': {'label': {'ko': '택배 기사', 'en': 'delivery driver'},
                        'bases': {'adult_slim': 4, 'adult_round': 2},
                        'tops': ['top_delivery_polo'], 'bottoms': ['bot_pants'], 'shoes': {'shoe_shoes': 1, 'shoe_boots': 2},
                        'hats': ['hat_delivery_cap'], 'hatChance': 0.9, 'neck': None, 'bag': {'acc_satchel': 1},
                        'bagChance': 0.3, 'headAcc': None, 'gloveChance': 0.3,
                        'colors': {'top': ['#7A4A2A', '#D9483B', '#2E6E8A'], 'top2': ['#F2C14E', '#F4F1EA', '#E8DCC0'],
                                   'hat': ['=top'], 'hat2': ['=top2'], 'bottom': ['#3B3F52', '#4A3830', '#2B2F3A'],
                                   'shoes': ['#3B2A20', '#2A2A30'], 'bag': ['#8A5A33', '#3B2A20']}},
    'mover': {'label': {'ko': '이삿짐 일꾼', 'en': 'mover'},
              'bases': {'adult_slim': 2, 'adult_round': 4},
              'tops': {'top_sweater': 3, 'top_work_jacket': 1}, 'bottoms': ['bot_mover_overalls'],
              'shoes': ['shoe_boots'], 'hats': {'hat_beanie': 2, 'hat_cap': 1}, 'hatChance': 0.6,
              'extra': ['acc_back_brace', 'acc_gloves'], 'neck': None, 'bag': None, 'headAcc': None,
              'colors': {'top': ['#F4EDE0', '#D9483B', '#5E9A4A', '#8A6A4A', '#3D7CC9'], 'top2': 'cord',
                         'bottom': 'mover', 'acc': 'brace', 'hat': ['#2B3A5E', '#D9483B', '#3B3F52'],
                         'hat2': ['=hat'], 'shoes': ['#3B2A20', '#6B4A2E'], 'hands': 'workglove'}},
    'construction_worker': {'label': {'ko': '공사장 인부', 'en': 'construction worker'},
                            'bases': {'adult_slim': 3, 'adult_round': 3},
                            'tops': ['top_hivis_jacket'], 'bottoms': {'bot_pants': 2, 'bot_overalls': 1},
                            'shoes': ['shoe_boots'], 'hats': ['hat_hardhat'], 'hatChance': 1.0,
                            'extra': ['acc_toolbelt', 'acc_gloves'], 'neck': None, 'bag': None, 'headAcc': None,
                            'colors': {'top': ['#D8F040', '#F28A2A'], 'hat': ['#F2C230', '#F2C230', '#F4F1EA'],
                                       'bottom': ['#3F5675', '#4A5A6A', '#3B3F52'], 'bag': ['#8A5A33', '#6B4A2E'],
                                       'shoes': ['#3B2A20', '#6B4A2E'], 'hands': 'workglove'}},
    'demolition_worker': {'label': {'ko': '철거 작업자', 'en': 'demolition worker'},
                          'bases': {'adult_slim': 2, 'adult_round': 4},
                          'tops': ['top_work_jacket'], 'bottoms': {'bot_pants': 1, 'bot_overalls': 1},
                          'shoes': ['shoe_boots'], 'hats': ['hat_hardhat'], 'hatChance': 1.0,
                          'extra': ['det_hivis', 'acc_gloves', 'acc_toolbelt'], 'neck': None, 'bag': None,
                          'headAcc': None,
                          'colors': {'top': ['#5A6070', '#6E7A4A', '#3F5675'], 'top2': 'cord',
                                     'acc': ['#F28A2A'], 'hat': ['#F28A2A', '#F4F1EA'], 'bag': ['#6B4A2E'],
                                     'bottom': ['#4A5A6A', '#3B3F52'], 'shoes': ['#2E3440', '#3B2A20'],
                                     'hands': 'workglove'}},
    'reporter': {'label': {'ko': '기자', 'en': 'reporter'},
                 'bases': {'adult_slim': 4, 'adult_round': 2, 'elder_slim': 1},
                 'tops': {'top_coat': 2, 'top_cardigan': 1, 'top_parka': 1, 'top_trench': 1},
                 'bottoms': {'bot_pants': 3, 'bot_skirt': 1}, 'shoes': {'shoe_shoes': 2, 'shoe_boots': 1},
                 'hats': {'hat_flatcap': 2, 'hat_beret': 1}, 'hatChance': 0.5,
                 'extra': ['acc_camera', 'held_notepad'], 'neck': None, 'bag': {'acc_satchel': 1}, 'bagChance': 0.4,
                 'headAcc': None, 'glasses': {'acc_glasses': 1, 'acc_glasses_sq': 1}, 'glassesChance': 0.45,
                 'colors': {'top': ['#7A5C40', '#3B3F52', '#C8A878', '#5E7A3A', '#8A6A4A'],
                            'top2': ['#F4EDE0', '#F7F5F0'], 'hat': ['#3B3F52', '#7A6A58', '#C8463D'],
                            'bottom': ['#3B3F52', '#4A3830', '#2E3440'], 'bag': ['#8A5A33', '#3B2A20']}},
}

# =========================================================================== cast (coverage)
JOB_V4 = {'top_uniform', 'top_labcoat', 'top_tunic', 'det_police', 'det_station', 'det_stethoscope', 'det_lanyard',
          'det_apron', 'det_apron_salon', 'det_hivis', 'acc_mailbag'}
CORE = {
    'child': {'top_puffer', 'top_parka', 'top_hoodie', 'top_duffle', 'top_sweater', 'top_dress', 'top_coat',
              'bot_pants', 'bot_snowpants', 'bot_skirt', 'bot_overalls', 'bot_tights',
              'shoe_boots', 'shoe_furboots', 'shoe_rubber', 'shoe_shoes', 'acc_scarf', 'acc_backpack'},
    'adult': {'top_parka', 'top_puffer', 'top_sweater', 'top_coat', 'top_cardigan', 'top_hoodie', 'top_duffle',
              'top_vest', 'bot_pants', 'bot_skirt', 'bot_snowpants', 'bot_longskirt', 'bot_tights', 'bot_overalls',
              'shoe_boots', 'shoe_furboots', 'shoe_rubber', 'shoe_shoes', 'acc_scarf', 'acc_satchel'},
    'elder': {'top_cardigan', 'top_coat', 'top_parka', 'top_sweater', 'top_vest', 'top_puffer', 'top_duffle',
              'bot_pants', 'bot_longskirt', 'bot_snowpants', 'bot_skirt', 'bot_tights',
              'shoe_boots', 'shoe_furboots', 'shoe_rubber', 'shoe_shoes', 'acc_scarf', 'acc_satchel'},
}
MINI = {
    'child': {'top_puffer', 'top_parka', 'top_hoodie', 'bot_pants', 'bot_snowpants', 'shoe_boots', 'shoe_furboots',
              'acc_scarf'},
    'adult': {'top_parka', 'top_puffer', 'top_coat', 'top_sweater', 'bot_pants', 'bot_snowpants', 'shoe_boots',
              'shoe_shoes', 'acc_scarf'},
    'elder': {'top_cardigan', 'top_coat', 'top_parka', 'bot_pants', 'bot_longskirt', 'shoe_shoes', 'shoe_boots',
              'acc_scarf'},
}
TINY = {
    'child': {'top_puffer', 'bot_snowpants', 'shoe_furboots', 'acc_scarf'},
    'adult': {'top_parka', 'bot_pants', 'shoe_boots', 'acc_scarf'},
    'elder': {'top_coat', 'bot_pants', 'shoe_shoes', 'acc_scarf'},
}
STUDENT = {'top_blazer', 'det_tie', 'det_bow', 'bot_pleated'}
FIRE = ['top_fire_coat', 'bot_fire_pants', 'acc_air_tank', 'shoe_rubber']
POLICE = ['top_police_v2', 'det_police', 'bot_pants', 'shoe_shoes', 'shoe_boots']
BURGLAR = ['top_stripes', 'held_loot_sack', 'bot_pants', 'shoe_shoes']
BANK = ['top_suit_3pc', 'top_teller_vest', 'det_tie', 'det_bow']
WORK = ['top_work_jacket', 'acc_gloves', 'det_hivis', 'bot_overalls', 'top_delivery_polo', 'bot_mover_overalls',
        'acc_back_brace', 'top_hivis_jacket', 'acc_toolbelt', 'top_sweater', 'top_hoodie']
PRESS = ['acc_camera', 'held_notepad', 'top_trench', 'top_coat']
CF_CIVIC = FIRE + POLICE + BURGLAR + BANK + PRESS + ['top_work_jacket', 'top_delivery_polo', 'top_hivis_jacket',
                                                     'bot_mover_overalls', 'acc_gloves', 'acc_toolbelt',
                                                     'acc_back_brace']

# per new anim: v4 wardrobe tier per age ('all' | 'core' | 'mini' | 'none') + extra parts (any age they exist for)
MOVERS = ['top_work_jacket', 'acc_gloves', 'top_delivery_polo', 'bot_mover_overalls', 'acc_back_brace', 'top_sweater']
SITE = ['top_hivis_jacket', 'top_work_jacket', 'acc_toolbelt', 'acc_gloves', 'det_hivis', 'bot_overalls']
CAST3 = {
    # run is the everyday hurry / play / rush-to-see anim -> the core wardrobe; flee (arms-up panic) keeps the mini
    # wardrobe and everybody else falls back flee -> run with the 'panic' face (still reads as fleeing)
    'run':           ({'child': 'core', 'adult': 'core', 'elder': 'core'}, FIRE + POLICE + BURGLAR),
    'flee':          ({'child': 'mini', 'adult': 'mini', 'elder': 'mini'}, BURGLAR),
    'arrested_walk': ({'child': 'tiny', 'adult': 'tiny', 'elder': 'tiny'}, BURGLAR),
    'carry_box':     ({'child': 'tiny', 'adult': 'tiny', 'elder': 'tiny'}, MOVERS),
    'argue':         ({'child': 'core', 'adult': 'core', 'elder': 'core'}, BURGLAR),
    'fight':         ({'child': 'tiny', 'adult': 'tiny', 'elder': 'tiny'}, BURGLAR),
    'point':         ({'child': 'core', 'adult': 'core', 'elder': 'core'},
                      FIRE + POLICE + ['top_trench', 'acc_camera', 'top_hivis_jacket', 'acc_toolbelt']),
    'think':         ({'child': 'core', 'adult': 'core', 'elder': 'core'},
                      ['top_trench', 'top_suit_3pc', 'det_tie', 'top_police_v2', 'det_police', 'acc_camera']),
    'shocked':       ({'child': 'core', 'adult': 'core', 'elder': 'core'},
                      BURGLAR + ['top_suit_3pc', 'det_tie', 'top_teller_vest', 'det_bow', 'acc_camera']),
    'phone':         ({'child': 'core', 'adult': 'core', 'elder': 'core'},
                      ['top_trench', 'top_suit_3pc', 'det_tie', 'top_teller_vest', 'det_bow', 'top_police_v2',
                       'det_police', 'acc_camera', 'top_delivery_polo']),
    'sweep':         ({'child': 'tiny', 'adult': 'tiny', 'elder': 'mini'}, ['det_apron', 'det_apron_salon'] + SITE),
    'spray_hose':    ({'child': 'tiny', 'adult': 'tiny', 'elder': 'tiny'}, FIRE),
}
# the new parts in the v4 / v5 anims (anims not listed: none -> fallback)
NEW_WEAR = ['top_fire_coat', 'bot_fire_pants', 'acc_air_tank', 'top_police_v2', 'top_stripes', 'held_loot_sack',
            'top_suit_3pc', 'top_teller_vest', 'top_work_jacket', 'acc_gloves', 'top_delivery_polo',
            'bot_mover_overalls', 'acc_back_brace', 'top_hivis_jacket', 'acc_toolbelt', 'acc_camera', 'held_notepad',
            'top_trench']
WORK_NEW = ['top_work_jacket', 'acc_gloves', 'top_delivery_polo', 'bot_mover_overalls', 'acc_back_brace']
OLD_CAST3 = {
    'idle': NEW_WEAR, 'walk': NEW_WEAR, 'talk': NEW_WEAR,
    'wave': ['top_fire_coat', 'bot_fire_pants', 'acc_air_tank', 'top_police_v2'],
    'happy': ['top_fire_coat', 'bot_fire_pants', 'acc_air_tank', 'top_police_v2'],
    'carry_walk': WORK_NEW,
    'sit': ['top_stripes', 'top_suit_3pc'],
    'sad': ['top_stripes'],
}
ANIM_FALLBACK = {
    'run': ['walk'], 'flee': ['run', 'walk'], 'arrested_walk': ['walk'], 'carry_box': ['carry_walk', 'walk'],
    'argue': ['talk', 'idle'], 'fight': ['argue', 'talk', 'idle'], 'point': ['talk', 'idle'],
    'think': ['idle'], 'shocked': ['idle'], 'phone': ['talk', 'idle'], 'sweep': ['idle'], 'spray_hose': ['idle'],
    'wave': ['talk', 'idle'], 'happy': ['idle'], 'carry_walk': ['walk'], 'sit': ['idle'], 'sad': ['idle'],
    'clap': ['happy', 'idle'], 'push': ['walk'], 'talk': ['idle'],
}
# face to show when an anim falls back (so the mood still reads)
FALLBACK_FACE = {'flee': 'panic', 'arrested_walk': 'sheepish', 'argue': 'angry', 'fight': 'angry',
                 'shocked': 'shocked', 'think': 'thinking', 'point': 'shocked', 'spray_hose': 'determined'}


def v4_base_parts():
    with open(TF_MANIFEST, encoding='utf-8') as f:
        T = json.load(f)['townfolk']
    return {b: set(T['bases'][b]['parts']) for b in RENDER_BASES}


def part_ages(pn):
    import tf_parts as tp
    P = tp.PARTS.get(pn)
    return None if P is None else P.ages


def cast_parts(anim, base, v4parts=None):
    """Body parts (v4 + cityfolk wearables, no anim items) rendered for `anim` on render base `base`:
    the v4 tier of that age (only parts assets/townfolk packs for the base) + the anim's extra parts."""
    import tf_parts as tp
    age = AGE_OF[base]
    v4 = (v4parts or v4_base_parts())[base]
    v4names = _v4_names()
    out = set()
    if anim in CAST3:
        tiers, extra = CAST3[anim]
        tier = tiers.get(age, 'none')
        out |= {'all': v4, 'core': CORE[age] & v4, 'mini': MINI[age] & v4, 'tiny': TINY[age] & v4, 'none': set()}[tier]
    else:
        extra = OLD_CAST3.get(anim, [])
    for pn in extra:
        P = tp.PARTS.get(pn)
        if P is None or P.space != 'body' or (P.ages and age not in P.ages):
            continue
        if pn in v4names and pn not in v4:
            continue                    # v4 part not packed for this base in assets/townfolk
        if anim in getattr(P, 'no_anims', ()) or (getattr(P, 'only_anims', None) and anim not in P.only_anims):
            continue                    # hand-held item with busy hands in this anim
        out.add(pn)
    return sorted(out)


_V4 = None


def _v4_names():
    global _V4
    if _V4 is None:
        with open(TF_MANIFEST, encoding='utf-8') as f:
            _V4 = set(json.load(f)['townfolk']['parts'])
    return _V4


# =========================================================================== look-dev
LOOK = [
    dict(name='firefighter', base='adult_slim', face='bold', nose='dot',
         parts=['hair_short', 'top_fire_coat', 'bot_fire_pants', 'shoe_rubber', 'hat_fire_helmet', 'acc_air_tank',
                'fh_moustache'],
         colors=dict(skin='#E8B48C', hair='#3A2A22', top='#C9A25E', bottom='#C9A25E', shoes='#2A2A30',
                     hat='#D9483B', sleeve='#C9A25E', hands='#A88A68')),
    dict(name='burglar', base='adult_slim', face='std', nose='button',
         parts=['hair_short', 'top_stripes', 'bot_pants', 'shoe_shoes', 'hat_burglar_beanie', 'acc_eye_mask',
                'held_loot_sack'],
         colors=dict(skin='#F2C29A', hair='#6B4026', top='#F4EDE0', top2='#2B2F3A', bottom='#2B2F3A',
                     shoes='#2A2A30', hat='#3B3F4A', sleeve='#F4EDE0', hands='#3B3F4A')),
    dict(name='resident', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bob', 'top_parka', 'bot_pants', 'shoe_boots', 'acc_scarf'],
         colors=dict(skin='#F6CFAE', hair='#8A5232', top='#3D7CC9', fur='#F4F1EA', bottom='#3B3F52',
                     shoes='#6B4A2E', acc='#F2C230', acc2='#D9483B', sleeve='#3D7CC9', hands='#F6CFAE')),
    dict(name='kid', base='child_slim', face='kid', nose='button',
         parts=['hair_spiky', 'top_puffer', 'bot_snowpants', 'shoe_furboots', 'acc_scarf'],
         colors=dict(skin='#E8B48C', hair='#3A2A22', top='#D9483B', fur='#F4F1EA', bottom='#3B3F52',
                     shoes='#8A5A33', acc='#F2C230', acc2='#3D7CC9', sleeve='#D9483B', hands='#C8463D')),
    dict(name='grandma', base='elder_slim', face='elder', nose='big',
         parts=['hair_lowbun', 'top_cardigan', 'bot_longskirt', 'shoe_shoes', 'acc_glasses'],
         colors=dict(skin='#F2C29A', hair='#BEBCB8', top='#C98C8C', top2='#F4EDE0', bottom='#5A4A6A',
                     shoes='#3B2A20', glasses='#8A5A33', sleeve='#C98C8C', hands='#F2C29A')),
    dict(name='police', base='adult_slim', face='std', nose='dot',
         parts=['hair_sidepart', 'top_police_v2', 'det_police', 'bot_pants', 'shoe_shoes', 'hat_police'],
         colors=dict(skin='#F2C29A', hair='#2A2228', top='#22305A', top2='#D8F040', fur='#3B3F52', hat='#22305A',
                     bottom='#22305A', shoes='#1E1E26', sleeve='#22305A', hands='#22242C')),
    dict(name='banker', base='adult_slim', face='bold', nose='big',
         parts=['hair_sidepart', 'top_suit_3pc', 'det_tie', 'bot_pants', 'shoe_shoes', 'acc_glasses_sq', 'fh_handlebar'],
         colors=dict(skin='#F2C29A', hair='#6A625C', top='#2B3A5E', top2='#C8343A', bottom='#2B3A5E',
                     shoes='#2A2A30', glasses='#2B2F3A', sleeve='#2B3A5E', hands='#F2C29A')),
    dict(name='teller', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bun', 'top_teller_vest', 'det_bow', 'bot_skirt', 'shoe_shoes', 'acc_visor'],
         colors=dict(skin='#F6CFAE', hair='#3A2A22', top='#2F5E48', top2='#F7F5F0', bottom='#3B3F52',
                     bottom2='#2E3440', shoes='#3B2A20', sleeve='#F7F5F0', hands='#F6CFAE')),
    dict(name='warehouse', base='adult_slim', face='std', nose='button',
         parts=['hair_short', 'top_work_jacket', 'acc_gloves', 'det_hivis', 'bot_pants', 'shoe_boots', 'hat_beanie'],
         colors=dict(skin='#D9A07A', hair='#3A2A22', top='#B8925A', top2='#5A3A26', acc='#F28A2A', bottom='#3F5675',
                     shoes='#3B2A20', hat='#3D6FB8', sleeve='#B8925A', hands='#C9A030')),
    dict(name='delivery', base='adult_slim', face='lash', nose='dot',
         parts=['hair_ponytail', 'top_delivery_polo', 'bot_pants', 'shoe_boots', 'hat_delivery_cap'],
         colors=dict(skin='#F6CFAE', hair='#5A3A26', top='#7A4A2A', top2='#F2C14E', hat='#7A4A2A', hat2='#F2C14E',
                     bottom='#3B3F52', shoes='#3B2A20', sleeve='#F2C14E', hands='#F6CFAE')),
    dict(name='mover', base='adult_slim', face='bold', nose='big',
         parts=['hair_buzz', 'top_sweater', 'bot_mover_overalls', 'acc_back_brace', 'acc_gloves', 'shoe_boots',
                'fh_beard'],
         colors=dict(skin='#C98E6A', hair='#2A2228', top='#D9483B', top2='#F4EDE0', bottom='#2B3A5E', acc='#2B2F3A',
                     shoes='#3B2A20', sleeve='#D9483B', hands='#A88A68')),
    dict(name='construction', base='adult_slim', face='std', nose='dot',
         parts=['hair_short', 'top_hivis_jacket', 'acc_toolbelt', 'acc_gloves', 'bot_pants', 'shoe_boots',
                'hat_hardhat'],
         colors=dict(skin='#E8B48C', hair='#8A5232', top='#F28A2A', hat='#F2C230', bottom='#3F5675', bag='#8A5A33',
                     shoes='#3B2A20', sleeve='#F28A2A', hands='#C9A030')),
    dict(name='reporter', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bob_long', 'top_coat', 'acc_camera', 'held_notepad', 'bot_pants', 'shoe_shoes', 'hat_beret'],
         colors=dict(skin='#F2C29A', hair='#2A2228', top='#7A5C40', bottom='#3B3F52', shoes='#3B2A20',
                     hat='#C8463D', sleeve='#7A5C40', hands='#F2C29A')),
    dict(name='detective', base='elder_slim', face='elder', nose='big',
         parts=['hair_short', 'top_trench', 'bot_pants', 'shoe_shoes', 'hat_deerstalker', 'fh_moustache'],
         colors=dict(skin='#F2C29A', hair='#9A948E', top='#C8A878', hat='#8A6A4A', hat2='#4A3A2A', bottom='#4A3830',
                     shoes='#3B2A20', sleeve='#C8A878', hands='#F2C29A')),
]
SOC = [('think', 'S', 0), ('think', 'SE', 2), ('shocked', 'S', 0), ('shocked', 'E', 1), ('phone', 'S', 0),
       ('phone', 'SE', 2), ('point', 'S', 1), ('point', 'E', 2), ('sweep', 'S', 1), ('sweep', 'SE', 3),
       ('argue', 'S', 0), ('argue', 'E', 2), ('fight', 'S', 0), ('fight', 'SE', 1)]
LOOK_FRAMES = {
    'firefighter': [('spray_hose', 'S', 0), ('spray_hose', 'SE', 1), ('spray_hose', 'E', 0), ('spray_hose', 'NE', 0),
                    ('run', 'S', 2), ('run', 'SE', 3), ('run', 'E', 5), ('run', 'N', 1), ('point', 'SE', 1),
                    ('idle', 'S', 0), ('walk', 'SE', 2), ('happy', 'S', 2)],
    'burglar': [('flee', 'S', 1), ('flee', 'SE', 3), ('flee', 'E', 5), ('flee', 'NE', 2), ('flee', 'N', 6),
                ('run', 'SE', 1), ('arrested_walk', 'S', 2), ('arrested_walk', 'SE', 4), ('arrested_walk', 'E', 1),
                ('arrested_walk', 'NE', 3), ('arrested_walk', 'N', 5), ('walk', 'SE', 2), ('carry_box', 'S', 1),
                ('carry_box', 'E', 5), ('carry_box', 'N', 2), ('idle', 'S', 0)],
    'resident': SOC + [('run', 'S', 1), ('flee', 'SE', 2)],
    'kid': [('run', 'S', 1), ('run', 'E', 3), ('flee', 'S', 2), ('carry_box', 'SE', 1), ('shocked', 'S', 1),
            ('argue', 'SE', 0), ('fight', 'S', 1), ('point', 'SE', 1), ('think', 'S', 0), ('phone', 'SE', 0),
            ('sweep', 'S', 0), ('spray_hose', 'SE', 0)],
    'grandma': [('run', 'S', 1), ('run', 'SE', 3), ('flee', 'S', 2), ('carry_box', 'SE', 1), ('shocked', 'S', 1),
                ('argue', 'SE', 0), ('sweep', 'SE', 1), ('think', 'S', 0), ('phone', 'SE', 0), ('point', 'S', 2),
                ('spray_hose', 'S', 0), ('arrested_walk', 'SE', 2)],
    'police': [('idle', 'S', 0), ('walk', 'SE', 2), ('run', 'SE', 3), ('point', 'S', 1), ('phone', 'SE', 0),
               ('run', 'N', 2)],
    'banker': [('idle', 'S', 0), ('walk', 'SE', 2), ('talk', 'E', 0), ('think', 'SE', 0), ('shocked', 'S', 1),
               ('flee', 'S', 1)],
    'teller': [('idle', 'S', 0), ('walk', 'SE', 2), ('talk', 'SE', 0), ('phone', 'S', 1), ('flee', 'SE', 2),
               ('idle', 'N', 0)],
    'warehouse': [('idle', 'S', 0), ('walk', 'SE', 2), ('carry_box', 'SE', 3), ('carry_box', 'S', 0),
                  ('carry_walk', 'S', 0), ('sweep', 'E', 2)],
    'delivery': [('idle', 'S', 0), ('walk', 'SE', 2), ('run', 'E', 2), ('carry_box', 'SE', 2), ('phone', 'S', 0),
                 ('idle', 'N', 0)],
    'mover': [('idle', 'S', 0), ('walk', 'SE', 2), ('carry_box', 'S', 2), ('carry_box', 'E', 4), ('carry_walk', 'SE', 1),
              ('idle', 'N', 0)],
    'construction': [('idle', 'S', 0), ('walk', 'SE', 2), ('sweep', 'SE', 2), ('carry_box', 'SE', 1), ('point', 'S', 1),
                     ('idle', 'N', 0)],
    'reporter': [('idle', 'S', 0), ('walk', 'SE', 2), ('talk', 'SE', 0), ('run', 'SE', 3), ('phone', 'S', 0),
                 ('point', 'SE', 2)],
    'detective': [('idle', 'S', 0), ('walk', 'SE', 2), ('think', 'S', 0), ('think', 'E', 2), ('point', 'SE', 2),
                  ('idle', 'N', 0)],
}
