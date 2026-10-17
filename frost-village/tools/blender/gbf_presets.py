"""
gbf_presets.py - geumbangfolk presets, cover (which body parts get frames in which anim), palettes and the look-dev
combos (CONTRACT_GEUMBANG AP).  Pure python; gbf_pack copies these into assets/geumbangfolk/manifest.json.

Cover (contract): the six crew anims are rendered for top_gb_jacket, top_parka, top_sweater, det_gb_vest, bot_pants,
shoe_boots, acc_scarf on the adult render base adult_slim (adult_round draws the slim frames stretched, townfolk
rule).  Head-space parts (hat_gb_cap, hat_beanie, acc_glasses, every hair) come from the head frames of the head poses
the anims use (loco / soc / nod / down) - no new head art; hat_gb_cap itself is rendered on all 20 head frames (17 v4 +
townfolk2's 3 'down').  The two new body parts (jacket, vest) are also rendered in the v4 anims idle / walk / talk /
wave / happy so the crew keeps its uniform while walking about.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
TF_MANIFEST = os.path.join(GAME, 'assets', 'townfolk', 'manifest.json')

RENDER_BASES = ['adult_slim']
AGE_OF = {'adult_slim': 'adult'}
BASES5 = ['adult_slim', 'adult_round']

COVER = ['top_gb_jacket', 'top_parka', 'top_sweater', 'det_gb_vest', 'bot_pants', 'shoe_boots', 'acc_scarf']
COVER_HEAD = ['hat_gb_cap', 'hat_beanie', 'acc_glasses', 'hair_*']
NEW_WEAR = ['top_gb_jacket', 'det_gb_vest']
OLD_ANIMS = ['idle', 'walk', 'talk', 'wave', 'happy']
OLD_CAST = {'adult_slim': {'top_gb_jacket': OLD_ANIMS, 'det_gb_vest': OLD_ANIMS}}

# =========================================================================== brand colours (sRGB)
BRAND = {'gold': '#F2B33D', 'goldDark': '#D9962A', 'cream': '#F4EDE0', 'charcoal': '#3B3F52', 'navy': '#2B4F7E'}
PALETTES5 = {
    'gb_gold': ['#F2B33D'],
    'gb_gold_dark': ['#D9962A'],
    'gb_navy': ['#2B4F7E'],
    'gb_charcoal': ['#3B3F52'],
    'gb_boots': ['#555A6E', '#4A4E60', '#5A5F73'],          # slate boots (never brown / black; never navy: the brand
                                                            # keeps navy <= 15 % of a sprite)
    'gb_hair': ['#2A2228', '#3A2A22', '#5A3A26', '#6B4026', '#8A5232'],
    # the team lead wears no hat: her (big) hair is one of the sprite's two largest colour areas next to the gold
    # jacket, so it is a cool ash / blue-black (a warm dark brown + gold is the UPS pair, plan 7.4)
    'gb_hair_ash': ['#2B2A31', '#36343C', '#45424A', '#55505A'],
}

# =========================================================================== presets (townfolk preset format)
_DRIVER_HAIR = {'hair_short': 3, 'hair_sidepart': 2, 'hair_bob': 2, 'hair_curly': 2, 'hair_buzz': 1, 'hair_lowbun': 1,
                'hair_ponytail': 1}
PRESETS5 = {
    'gb_driver': {'label': {'ko': '금방 기사님 (쌩쌩이 · 부릉이 · 씽씽이)', 'en': 'Geumbang driver'},
                  'bases': {'adult_slim': 3, 'adult_round': 2},
                  'tops': ['top_gb_jacket'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                  'hats': ['hat_gb_cap'], 'hatChance': 1.0, 'hair': dict(_DRIVER_HAIR),
                  'neck': None, 'bag': None, 'headAcc': None, 'glasses': ['acc_glasses'], 'glassesChance': 0.12,
                  'facialHair': ['fh_moustache'], 'facialHairChance': 0.1,
                  'colors': {'top': 'gb_gold', 'hat': 'gb_charcoal', 'hat2': 'gb_gold', 'bottom': 'gb_charcoal',
                             'shoes': 'gb_boots', 'glasses': ['#3B3F52', '#2B4F7E'], 'hair': 'gb_hair',
                             'hands': ['skin']}},
    'gb_picker': {'label': {'ko': '금방 피커 (쏙쏙이)', 'en': 'Geumbang picker'},
                  'bases': {'adult_slim': 3, 'adult_round': 1},
                  'tops': ['top_parka'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                  'extra': ['det_gb_vest'], 'hats': ['hat_beanie'], 'hatChance': 1.0,
                  'hair': {'hair_short': 2, 'hair_bob': 3, 'hair_ponytail': 2, 'hair_curly': 2, 'hair_lowbun': 2},
                  'neck': None, 'bag': None, 'headAcc': None, 'glassesChance': 0.1, 'glasses': ['acc_glasses'],
                  'facialHairChance': 0.0,
                  'colors': {'top': ['#F4EDE0'], 'fur': ['#FBF8F2', '#E6DCCB'], 'acc': 'gb_gold', 'hat': 'gb_gold',
                             'bottom': 'gb_charcoal', 'shoes': 'gb_boots', 'glasses': ['#3B3F52'], 'hair': 'gb_hair',
                             'hands': ['skin']}},
    'gb_packer': {'label': {'ko': '금방 포장 담당 (척척이)', 'en': 'Geumbang packer'},          # charcoal beanie (navy <= 15 %)
                  'bases': {'adult_round': 2, 'adult_slim': 1},
                  'tops': ['top_sweater'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                  'extra': ['det_gb_vest'], 'hats': ['hat_beanie'], 'hatChance': 1.0,
                  'hair': {'hair_short': 3, 'hair_buzz': 2, 'hair_sidepart': 2, 'hair_bob': 2, 'hair_curly': 1},
                  'neck': None, 'bag': None, 'headAcc': None, 'glassesChance': 0.15, 'glasses': ['acc_glasses'],
                  'facialHair': ['fh_moustache'], 'facialHairChance': 0.15,
                  'colors': {'top': ['#E3D3B4'], 'top2': ['#F4EDE0'], 'acc': 'gb_gold', 'hat': 'gb_charcoal',
                             'bottom': 'gb_charcoal', 'shoes': 'gb_boots', 'glasses': ['#3B3F52'], 'hair': 'gb_hair',
                             'hands': ['skin']}},
    'gb_sorter': {'label': {'ko': '금방 상하차 담당 (영차)', 'en': 'Geumbang dockhand'},
                  'bases': {'adult_round': 2, 'adult_slim': 1},
                  'tops': ['top_parka'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                  'extra': ['det_gb_vest'], 'hats': ['hat_gb_cap'], 'hatChance': 1.0,
                  'hair': {'hair_short': 3, 'hair_buzz': 2, 'hair_curly': 2, 'hair_sidepart': 1},
                  'neck': None, 'bag': None, 'headAcc': None, 'glassesChance': 0.0, 'facialHair': ['fh_moustache'],
                  'facialHairChance': 0.2,
                  'colors': {'top': 'gb_charcoal', 'fur': ['#F4F1EA', '#E6DCCB'], 'acc': 'gb_gold', 'hat': 'gb_charcoal',
                             'hat2': 'gb_gold', 'bottom': 'gb_charcoal', 'shoes': 'gb_boots', 'hair': 'gb_hair',
                             'hands': ['skin']}},
    'gb_dispatcher': {'label': {'ko': '방금순 팀장 (배차 담당)', 'en': 'Team lead Bang Geumsun (dispatcher)'},
                      'bases': {'adult_slim': 2, 'adult_round': 1}, 'look': 'A',
                      'tops': ['top_gb_jacket'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                      'hats': None, 'hatChance': 0.0,
                      'hair': {'hair_bob': 3, 'hair_lowbun': 3, 'hair_ponytail': 2, 'hair_bun': 2},
                      'glasses': ['acc_glasses'], 'glassesChance': 1.0, 'neck': None, 'bag': None, 'headAcc': None,
                      'facialHairChance': 0.0,
                      'colors': {'top': 'gb_gold', 'bottom': 'gb_charcoal', 'shoes': 'gb_boots',
                                 'glasses': ['#2B4F7E', '#3B3F52'], 'hair': 'gb_hair_ash', 'hands': ['skin']}},
    'gb_rider': {'label': {'ko': '금방 개썰매 기사 (뽀득이)', 'en': 'Geumbang sled rider'},
                 'bases': {'adult_slim': 2, 'adult_round': 1},
                 'tops': ['top_gb_jacket'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                 'hats': ['hat_beanie'], 'hatChance': 1.0, 'hair': dict(_DRIVER_HAIR),
                 'neck': ['acc_scarf'], 'neckChance': 1.0, 'bag': None, 'headAcc': None, 'glassesChance': 0.0,
                 'facialHairChance': 0.1, 'facialHair': ['fh_moustache'],
                 # the scarf: cream with navy stripes (a solid navy scarf under the gold jacket + gold beanie makes
                 # the sprite's two largest areas gold + blue = the IKEA-like pair, plan 7.4; navy stays an accent)
                 'colors': {'top': 'gb_gold', 'acc': ['#F4EDE0'], 'acc2': 'gb_navy', 'hat': 'gb_gold',
                            'bottom': 'gb_charcoal', 'shoes': 'gb_boots', 'hair': 'gb_hair', 'hands': ['skin']}},
    'gb_night': {'label': {'ko': '금방 밤 기사님 (반짝이 · 살금이)', 'en': 'Geumbang night driver'},
                 'bases': {'adult_slim': 3, 'adult_round': 2},
                 'tops': ['top_gb_jacket'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                 'hats': ['hat_gb_cap'], 'hatChance': 1.0, 'hair': dict(_DRIVER_HAIR),
                 'neck': None, 'bag': None, 'headAcc': None, 'glasses': ['acc_glasses'], 'glassesChance': 0.12,
                 'facialHair': ['fh_moustache'], 'facialHairChance': 0.1,
                 'colors': {'top': 'gb_gold_dark', 'hat': 'gb_charcoal', 'hat2': 'gb_gold', 'bottom': 'gb_charcoal',
                            'shoes': 'gb_boots', 'glasses': ['#3B3F52'], 'hair': 'gb_hair', 'hands': ['skin']}},
}
PRESET_ORDER = ['gb_driver', 'gb_picker', 'gb_packer', 'gb_sorter', 'gb_dispatcher', 'gb_rider', 'gb_night']
GB_ANIMS = ['carry_parcel', 'ring_doorbell', 'hand_parcel', 'scan', 'sort_parcel', 'tape_box']
V4 = ['idle', 'walk', 'talk', 'wave', 'happy']
PROMISE = {p: GB_ANIMS + V4 for p in PRESET_ORDER}
SIGNATURE = {'gb_driver': ['carry_parcel', 'ring_doorbell', 'hand_parcel'],
             'gb_picker': ['sort_parcel', 'carry_parcel', 'wave'],
             'gb_packer': ['tape_box', 'scan', 'happy'],
             'gb_sorter': ['carry_parcel', 'scan', 'sort_parcel'],
             'gb_dispatcher': ['scan', 'talk', 'hand_parcel'],
             'gb_rider': ['carry_parcel', 'ring_doorbell', 'hand_parcel'],
             'gb_night': ['carry_parcel', 'hand_parcel', 'idle']}
CREW_NAMES = {'gb_driver': ['쌩쌩이', '부릉이', '씽씽이'], 'gb_picker': ['쏙쏙이'], 'gb_packer': ['척척이'],
              'gb_sorter': ['영차'], 'gb_dispatcher': ['방금순 팀장'], 'gb_rider': ['뽀득이'],
              'gb_night': ['반짝이', '살금이']}

ANIM_FALLBACK5 = {
    'carry_parcel': ['walk'],
    'ring_doorbell': ['talk', 'idle'],
    'hand_parcel': ['talk', 'idle'],
    'scan': ['idle'], 'sort_parcel': ['idle'], 'tape_box': ['idle'],
}


def v4_base_parts():
    with open(TF_MANIFEST, encoding='utf-8') as f:
        T = json.load(f)['townfolk']
    return {b: set(T['bases'][b]['parts']) for b in BASES5}


def _ages(pn):
    import tf_parts as tp
    P = tp.PARTS.get(pn)
    return None if P is None else P.ages


def cover_parts(anim, base):
    """Body parts (no items) rendered for `anim` on render base `base`."""
    age = AGE_OF[base]
    out = []
    for pn in COVER:
        ages = _ages(pn)
        if ages and age not in ages:
            continue
        out.append(pn)
    return sorted(out)


def old_cast(base):
    return OLD_CAST.get(base, {})


# =========================================================================== look-dev combos (full renders)
SKIN = '#F2C29A'
LOOK = [
    dict(name='driver', base='adult_slim', face='std', nose='button',
         parts=['hair_short', 'top_gb_jacket', 'bot_pants', 'shoe_boots', 'hat_gb_cap'],
         colors=dict(skin=SKIN, hair='#3A2A22', top='#F2B33D', bottom='#3B3F52', shoes='#555A6E', hat='#2B4F7E',
                     hat2='#F2B33D', sleeve='#F2B33D', hands=SKIN)),
    dict(name='picker', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bob', 'top_parka', 'det_gb_vest', 'bot_pants', 'shoe_boots', 'hat_beanie'],
         colors=dict(skin='#F6CFAE', hair='#5A3A26', top='#F4EDE0', fur='#FBF8F2', acc='#F2B33D', bottom='#3B3F52',
                     shoes='#555A6E', hat='#F2B33D', sleeve='#F4EDE0', hands='#F6CFAE')),
    dict(name='packer', base='adult_slim', face='std', nose='big',
         parts=['hair_short', 'top_sweater', 'det_gb_vest', 'bot_pants', 'shoe_boots', 'hat_beanie'],
         colors=dict(skin='#D9A07A', hair='#2A2228', top='#E3D3B4', top2='#F4EDE0', acc='#F2B33D', bottom='#3B3F52',
                     shoes='#4A4E60', hat='#3B3F52', sleeve='#E3D3B4', hands='#D9A07A')),
    dict(name='sorter', base='adult_slim', face='bold', nose='button',
         parts=['hair_buzz', 'top_parka', 'det_gb_vest', 'bot_pants', 'shoe_boots', 'hat_gb_cap'],
         colors=dict(skin='#E8B48C', hair='#2A2228', top='#3B3F52', fur='#F4F1EA', acc='#F2B33D', bottom='#3B3F52',
                     shoes='#555A6E', hat='#2B4F7E', hat2='#F2B33D', sleeve='#3B3F52', hands='#E8B48C')),
    dict(name='dispatcher', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bob', 'top_gb_jacket', 'bot_pants', 'shoe_boots', 'acc_glasses'],
         colors=dict(skin='#F6CFAE', hair='#3A2A22', top='#F2B33D', bottom='#3B3F52', shoes='#555A6E',
                     glasses='#2B4F7E', sleeve='#F2B33D', hands='#F6CFAE')),
    dict(name='night', base='adult_slim', face='std', nose='dot',
         parts=['hair_sidepart', 'top_gb_jacket', 'bot_pants', 'shoe_boots', 'hat_gb_cap'],
         colors=dict(skin='#C98E6A', hair='#2A2228', top='#D9962A', bottom='#3B3F52', shoes='#4A4E60', hat='#2B4F7E',
                     hat2='#D9962A', sleeve='#D9962A', hands='#C98E6A')),
]
LOOK_FRAMES = {
    'driver': [('carry_parcel', 'S', 1), ('carry_parcel', 'SE', 2), ('carry_parcel', 'E', 3),
               ('carry_parcel', 'NE', 5), ('carry_parcel', 'N', 6), ('ring_doorbell', 'NE', 2),
               ('ring_doorbell', 'E', 2), ('ring_doorbell', 'N', 3), ('hand_parcel', 'SE', 2), ('hand_parcel', 'SE', 5),
               ('hand_parcel', 'E', 1), ('idle', 'S', 0), ('walk', 'SE', 2), ('idle', 'N', 0)],
    'picker': [('sort_parcel', 'SE', 1), ('sort_parcel', 'SE', 2), ('sort_parcel', 'SE', 4), ('sort_parcel', 'E', 3),
               ('sort_parcel', 'NE', 2), ('idle', 'S', 0), ('idle', 'N', 0)],
    'packer': [('tape_box', 'SE', 1), ('tape_box', 'SE', 3), ('tape_box', 'S', 2), ('tape_box', 'E', 0),
               ('idle', 'S', 0)],
    'sorter': [('carry_parcel', 'SE', 2), ('scan', 'SE', 2), ('idle', 'S', 0), ('idle', 'N', 0)],
    'dispatcher': [('scan', 'SE', 0), ('scan', 'SE', 2), ('scan', 'S', 3), ('scan', 'E', 1), ('talk', 'SE', 0)],
    'night': [('carry_parcel', 'SE', 2), ('idle', 'S', 0)],
}
