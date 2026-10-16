"""
of_presets.py - officefolk presets, cover (which body parts get frames in which anim), palettes and the
look-dev combos (CONTRACT_V42 AJ).  Pure python; of_pack copies these into assets/officefolk/manifest.json.

Cover: every acting anim (13) is rendered for the contract wardrobe on both render bases (adult_slim -> adult_slim
+ adult_round, elder_slim -> elder_slim + elder_round), limited by each part's ages; carry_sack only for the
courier's wardrobe on adult_slim.  The fragment also renders a few EXTENDED layers in the v4 anims so the presets
look right while they walk about: det_bow / acc_sleeves / acc_bell_pin on adults (townfolk packs det_bow for
children only) and top_blazer + det_tie on elders (townfolk packs neither for elders) - bases[b].ofExt lists those
(part -> anims) and canPlay refuses the other v4 / v5 anims for them (they fall back).

top_blazer's townfolk ages are child / adult: the generator never gives it to an elder.  The bank manager preset
therefore lists it under 'force' (appended after generation when missing, no rng drawn) - other presets (an elder
teacher ...) are untouched, so loading officefolk never changes anybody else's look.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
TF_MANIFEST = os.path.join(GAME, 'assets', 'townfolk', 'manifest.json')

RENDER_BASES = ['adult_slim', 'elder_slim']
AGE_OF = {'adult_slim': 'adult', 'elder_slim': 'elder'}
BASES4 = ['adult_slim', 'adult_round', 'elder_slim', 'elder_round']

COVER_TOPS = ['top_cardigan', 'top_sweater', 'top_blazer', 'top_vest', 'top_duffle', 'top_coat', 'top_parka',
              'top_uniform']
COVER_BOTTOMS = ['bot_pants', 'bot_longskirt', 'bot_skirt', 'bot_tights']
COVER_SHOES = ['shoe_shoes', 'shoe_boots', 'shoe_furboots']
COVER_ACC = ['acc_scarf', 'acc_satchel', 'acc_mailbag', 'det_tie', 'det_bow', 'det_lanyard', 'det_hivis']
NEW_WEAR = ['acc_sleeves', 'acc_bell_pin', 'acc_bowtie']
COVER = COVER_TOPS + COVER_BOTTOMS + COVER_SHOES + COVER_ACC + NEW_WEAR
COURIER_COVER = ['top_duffle', 'bot_pants', 'shoe_furboots', 'acc_satchel', 'acc_bell_pin']
# parts the townfolk generator would refuse for an age (part ages) that this fragment renders anyway
AGE_EXT = {'elder': ['top_blazer']}

# v4 anims (townfolk) rendered for the extended layers - so the presets keep their look while walking about, and
# (polish M1) wave / happy too: the contract fallbacks bow -> wave and scoop -> happy then play for every preset
OLD_ANIMS_ADULT = ['idle', 'walk', 'talk', 'wave', 'happy']
OLD_CAST = {
    'adult_slim': {'det_bow': OLD_ANIMS_ADULT, 'acc_sleeves': OLD_ANIMS_ADULT, 'acc_bell_pin': OLD_ANIMS_ADULT,
                   'acc_bowtie': OLD_ANIMS_ADULT},
    'elder_slim': {'top_blazer': OLD_ANIMS_ADULT, 'det_tie': OLD_ANIMS_ADULT},
}
# page of those old-anim frames: the always-resident 'sack' page for what roams (the courier's bell, the aide's bow,
# the tellers' bow tie, the manager's tie); the office / bank pages for office wear (셈이's cuff sleeves come off
# outdoors, the manager's blazer stays at the bank) - when such a page is not resident the person is simply drawn
# without that layer (Officefolk.pickAnim keeps the anim: no fallback, no walking in place)
OLD_PAGE = {'adult_slim': {'acc_sleeves': 'desk'}, 'elder_slim': {'top_blazer': 'desk'}}
OLD_PAGE_DEFAULT = 'sack'


def old_page(base, pn):
    return OLD_PAGE.get(base, {}).get(pn, OLD_PAGE_DEFAULT)


# (polish M1) roaming acts on the always-resident page: the aide (총총이) takes notes wherever the chief chats, so the
# frames of 'note' that HER wardrobe draws (+ the adult limbs and the notebook) live on 'sack'; everybody else's note
# frames stay on 'errand'.  pageNeeded(person, 'note') is then 'sack' for her and 'errand' for others.  (The courier's
# scoop (+0.27 MiB) and her hand_over (+0.13 MiB) do not fit the 1.5 MiB sack cap: they fall back per the contract.)
ROAM = {'note': {'adult_slim': ['arm_R', 'arm_L', 'hand_R', 'hand_L', 'top_blazer', 'det_bow', 'bot_skirt',
                                'bot_tights', 'shoe_shoes', 'held_notebook']}}


def anim_page(anim, base, layer, page):
    """page of the officefolk frames of `layer` (layer name without @base) in `anim` on render base `base`"""
    if layer.split('.')[0] in ROAM.get(anim, {}).get(base, ()):
        return 'sack'
    return page

# =========================================================================== palettes / colours (sRGB)
PALETTES4 = {
    'cardigan_office': ['#D9A43A', '#C99A3A', '#9DB07E', '#8AA06C'],       # mustard / sage
    'sweater_office': ['#E7A1B0', '#E295A6', '#8FC1E3', '#82B4D9'],        # rose / sky
    'blazer_aide': ['#6A3A5E', '#5E3456', '#6A3A5E', '#33416A'],           # plum (mostly) / navy
    'duffle_courier': ['#C8343A', '#B8302F', '#2F7A4A', '#2A6E44'],        # red / green
    'vest_teller_g': ['#2F5E48', '#2A5642'],                                # bottle green
    'vest_teller_r': ['#6A2E3A', '#5E2834'],                                # burgundy
    'blazer_bank': ['#3A3D45', '#34373F'],                                  # charcoal
    'parka_depot': ['#5A6A7A', '#52616F', '#6E7A4A', '#65703F'],            # slate / olive
    'hivis_depot': ['#D8F040', '#F28A2A'],
    'shirt_office': ['#E6EDF5', '#F2EBDC'],                                   # pale blue-white / ecru shirts
    'sleeves_office': ['#3B4A6B', '#4A4E58', '#2E3B4E'],                   # navy / charcoal cuff sleeves
}

# =========================================================================== presets (townfolk preset format)
PRESETS4 = {
    'office_a': {'label': {'ko': '장부 담당 (셈이)', 'en': 'ledger clerk (Semi)'},
                 'bases': {'adult_round': 1}, 'look': 'A',
                 'tops': ['top_cardigan'], 'bottoms': ['bot_longskirt'], 'shoes': ['shoe_shoes'],
                 'hats': None, 'hatChance': 0.0, 'hair': ['hair_bob'],
                 'glasses': ['acc_glasses_sq'], 'glassesChance': 1.0,
                 'extra': ['det_lanyard', 'acc_sleeves'], 'neck': None, 'bag': None, 'headAcc': None,
                 'facialHairChance': 0.0,
                 'colors': {'top': 'cardigan_office', 'top2': ['#F7F2E6', '#F4EDE0'],
                            'bottom': ['#5A4A6A', '#3B3F52', '#7A5C40'], 'shoes': ['#6B4A2E', '#3B2A20'],
                            'acc': 'sleeves_office', 'glasses': ['#8A5A33', '#2B2F3A'], 'hands': ['skin']}},
    'office_b': {'label': {'ko': '소식·편지 담당 (소복이)', 'en': 'news & letters clerk (Sobok)'},
                 'bases': {'adult_slim': 1}, 'look': 'A',
                 'tops': ['top_sweater'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                 'hats': None, 'hatChance': 0.0, 'hair': ['hair_ponytail'],
                 'neck': ['acc_scarf'], 'neckChance': 1.0, 'bag': None, 'headAcc': None, 'glassesChance': 0.0,
                 'facialHairChance': 0.0,
                 'colors': {'top': 'sweater_office', 'top2': ['#F4EDE0'], 'bottom': ['#3B3F52', '#2B3A5E', '#4A4E58'],
                            'shoes': ['#8A5A33', '#6B4A2E'], 'acc': ['#F4EDE0', '#F2C230'],
                            'acc2': ['#D9483B', '#2E8A8A'], 'hands': ['skin']}},
    'secretary': {'label': {'ko': '수행비서 (총총이)', 'en': "chief's aide (Chongchong)"},
                  'bases': {'adult_slim': 1}, 'look': 'A',
                  'tops': ['top_blazer'], 'bottoms': ['bot_skirt'], 'shoes': ['shoe_shoes'],
                  'hats': None, 'hatChance': 0.0, 'hair': ['hair_bun'],
                  'extra': ['det_bow', 'bot_tights'], 'neck': None, 'bag': None, 'headAcc': None,
                  'glassesChance': 0.0, 'facialHairChance': 0.0,
                  'colors': {'top': 'blazer_aide', 'top2': ['#F2C27A', '#E88A9A', '#D9483B'],
                             'bottom': ['#3A3D45', '#5A5E6A'], 'bottom2': ['#3A3440', '#C9A48A'],
                             'shoes': ['#2A2A30', '#6A2E3A'], 'hands': ['skin']}},
    'courier': {'label': {'ko': '수금원 (딸랑이)', 'en': 'coin courier (Ttalang)'},
                'bases': {'adult_round': 1},
                'tops': ['top_duffle'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_furboots'],
                'hats': ['hat_beanie'], 'hatChance': 1.0,
                'hair': {'hair_short': 3, 'hair_bob': 2, 'hair_curly': 2, 'hair_sidepart': 1, 'hair_buzz': 1},
                'bag': ['acc_satchel'], 'bagChance': 1.0, 'extra': ['acc_bell_pin'], 'neck': None, 'headAcc': None,
                'glassesChance': 0.0, 'facialHairChance': 0.2,
                'colors': {'top': 'duffle_courier', 'bottom': ['#4A3830', '#2E3440'], 'shoes': ['#6B4A2E', '#8A5A33'],
                           'fur': ['#F4F1EA', '#E6DCCB'], 'hat': ['#F2C230', '#F2C230', '#2B3A5E'],
                           'bag': ['#8A5A33', '#6B4A2E'], 'hands': ['skin', '#6B4A2E']}},
    'teller_a': {'label': {'ko': '은행 창구 직원', 'en': 'bank teller'},
                 'bases': {'adult_slim': 1}, 'look': 'B',
                 'tops': ['top_vest'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_shoes'],
                 'hats': None, 'hatChance': 0.0, 'extra': ['acc_bowtie'], 'neck': None, 'bag': None, 'headAcc': None,
                 'hair': {'hair_sidepart': 3, 'hair_short': 2, 'hair_lowbun': 1, 'hair_bob': 1},
                 'glassesChance': 0.25, 'facialHairChance': 0.15,
                 'colors': {'top': 'vest_teller_g', 'top2': 'shirt_office', 'acc2': ['#8A2B3A', '#B8302F'],
                            'bottom': ['#3B3F4A', '#4A4E58'],
                            'shoes': ['#2A2A30', '#3B2A20'], 'hands': ['skin']}},
    'teller_b': {'label': {'ko': '은행 창구 직원', 'en': 'bank teller'},
                 'bases': {'adult_round': 1}, 'look': 'A',
                 'tops': ['top_vest'], 'bottoms': ['bot_skirt'], 'shoes': ['shoe_shoes'],
                 'hats': None, 'hatChance': 0.0, 'extra': ['acc_bowtie'], 'neck': None, 'bag': None, 'headAcc': None,
                 'hair': {'hair_lowbun': 3, 'hair_bun': 2, 'hair_bob': 2, 'hair_wavy': 1},
                 'glassesChance': 0.25, 'facialHairChance': 0.0,
                 'colors': {'top': 'vest_teller_r', 'top2': 'shirt_office', 'acc2': ['#2B3A5E', '#C9A045'],
                            'bottom': ['#3B3F4A', '#4A4E58'],
                            'bottom2': ['#3A3440', '#2E3440'], 'shoes': ['#2A2A30', '#3B2A20'], 'hands': ['skin']}},
    'bank_manager': {'label': {'ko': '은행장', 'en': 'bank manager'},
                     'bases': {'elder_round': 1}, 'look': 'B',
                     'tops': ['top_blazer'], 'force': ['top_blazer'], 'bottoms': ['bot_pants'],
                     'shoes': ['shoe_shoes'], 'hats': None, 'hatChance': 0.0,
                     'hair': {'hair_sidepart': 3, 'hair_bald': 3, 'hair_short': 2},
                     'glasses': ['acc_glasses'], 'glassesChance': 1.0, 'extra': ['det_tie'], 'neck': None,
                     'bag': None, 'headAcc': None, 'facialHair': ['fh_moustache'], 'facialHairChance': 0.6,
                     'colors': {'top': 'blazer_bank', 'top2': ['#7A2E3A', '#2B3A5E', '#C9A045'], 'bottom': ['=top'],
                                'shoes': ['#2A2A30', '#3B2A20'], 'glasses': ['#C9A045', '#2B2F3A'],
                                'hands': ['skin']}},
    'depot_worker': {'label': {'ko': '물류창고 직원', 'en': 'depot worker'},
                     'bases': {'adult_slim': 1, 'adult_round': 1},
                     'tops': ['top_parka'], 'bottoms': ['bot_pants'], 'shoes': ['shoe_boots'],
                     'hats': ['hat_beanie'], 'hatChance': 1.0, 'extra': ['det_hivis'], 'neck': None, 'bag': None,
                     'headAcc': None, 'glassesChance': 0.05,
                     'hair': {'hair_short': 3, 'hair_bob': 2, 'hair_curly': 2, 'hair_buzz': 1, 'hair_sidepart': 1},
                     'colors': {'top': 'parka_depot', 'fur': ['#E6DCCB', '#F4F1EA'], 'acc': 'hivis_depot',
                                'bottom': ['#3B3F52', '#4A3830'], 'shoes': ['#3B2A20', '#6B4A2E'],
                                'hat': ['#F28A2A', '#2B4F7E', '#E8642A'], 'hands': ['skin', '#6B4A2E']}},
}
PRESET_ORDER = ['office_a', 'office_b', 'secretary', 'courier', 'teller_a', 'teller_b', 'bank_manager',
                'depot_worker']
ACTING = ['sit_idle', 'desk_type', 'desk_write', 'desk_phone', 'desk_read', 'desk_count', 'file', 'point_board',
          'stamp_stand', 'bow', 'note', 'hand_over', 'scoop']
# what each preset is guaranteed to play (checker + JS generator)
V4 = ['idle', 'walk', 'talk', 'wave', 'happy']
PROMISE = {
    'office_a': ACTING + V4,
    'office_b': ACTING + V4,
    'secretary': ACTING + V4,
    'courier': ACTING + ['carry_sack'] + V4,
    'teller_a': ACTING + V4,
    'teller_b': ACTING + V4,
    'bank_manager': ACTING + V4,
    'depot_worker': ACTING + V4,
}
SIGNATURE = {'office_a': ['desk_write', 'point_board', 'desk_count'],
             'office_b': ['desk_type', 'desk_phone', 'file'],
             'secretary': ['note', 'hand_over', 'bow'],
             'courier': ['carry_sack', 'scoop', 'desk_count'],
             'teller_a': ['stamp_stand', 'hand_over', 'desk_count'],
             'teller_b': ['stamp_stand', 'bow', 'hand_over'],
             'bank_manager': ['desk_write', 'desk_read', 'bow'],
             'depot_worker': ['hand_over', 'note', 'bow']}

ANIM_FALLBACK4 = {
    'sit_idle': ['sit', 'idle'],
    'desk_type': ['sit_idle', 'sit', 'idle'], 'desk_write': ['sit_idle', 'sit', 'idle'],
    'desk_phone': ['sit_idle', 'sit', 'idle'], 'desk_read': ['sit_idle', 'sit', 'idle'],
    'desk_count': ['sit_idle', 'sit', 'idle'],
    'file': ['idle'], 'point_board': ['point', 'talk', 'idle'], 'stamp_stand': ['talk', 'idle'],
    'bow': ['wave', 'idle'], 'note': ['idle'], 'hand_over': ['talk', 'idle'], 'scoop': ['happy', 'idle'],
    'carry_sack': ['walk'],
}


def v4_base_parts():
    with open(TF_MANIFEST, encoding='utf-8') as f:
        T = json.load(f)['townfolk']
    return {b: set(T['bases'][b]['parts']) for b in BASES4}


def _ages(pn):
    import tf_parts as tp
    P = tp.PARTS.get(pn)
    return None if P is None else P.ages


def cover_parts(anim, base):
    """Body parts (no items) rendered for `anim` on render base `base`."""
    age = AGE_OF[base]
    if anim == 'carry_sack':
        return sorted(p for p in COURIER_COVER if age == 'adult')
    out = []
    for pn in COVER:
        ages = _ages(pn)
        if ages and age not in ages and pn not in AGE_EXT.get(age, []):
            continue
        out.append(pn)
    return sorted(out)


def old_cast(base):
    return OLD_CAST.get(base, {})


def extended_parts(base):
    """{part: [anims]} of townfolk parts this fragment adds to a render base (bases[b].ofExt)."""
    v4 = v4_base_parts()[base]
    out = {}
    for pn, anims in old_cast(base).items():
        if pn in v4:
            continue
        out[pn] = list(anims)
    return out


# =========================================================================== look-dev combos (full renders)
LOOK = [
    dict(name='courier', base='adult_slim', face='std', nose='button',
         parts=['hair_short', 'top_duffle', 'bot_pants', 'shoe_furboots', 'hat_beanie', 'acc_satchel', 'acc_bell_pin'],
         colors=dict(skin='#F2C29A', hair='#3A2A22', top='#C8343A', bottom='#4A3830', shoes='#6B4A2E',
                     fur='#F4F1EA', hat='#F2C230', bag='#8A5A33', sleeve='#C8343A', hands='#F2C29A')),
    dict(name='office_a', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bob', 'top_cardigan', 'bot_longskirt', 'shoe_shoes', 'acc_glasses_sq', 'det_lanyard',
                'acc_sleeves'],
         colors=dict(skin='#F6CFAE', hair='#5A3A26', top='#D9A43A', top2='#F7F2E6', bottom='#5A4A6A',
                     shoes='#6B4A2E', acc='#3B4A6B', glasses='#8A5A33', sleeve='#D9A43A', hands='#F6CFAE')),
    dict(name='secretary', base='adult_slim', face='lash', nose='dot',
         parts=['hair_bun', 'top_blazer', 'det_bow', 'bot_skirt', 'bot_tights', 'shoe_shoes'],
         colors=dict(skin='#F2C29A', hair='#2A2228', top='#6A3A5E', top2='#F2C27A', bottom='#3A3D45',
                     bottom2='#3A3440', shoes='#2A2A30', sleeve='#6A3A5E', hands='#F2C29A')),
    dict(name='teller', base='adult_slim', face='std', nose='dot',
         parts=['hair_sidepart', 'top_vest', 'acc_bowtie', 'bot_pants', 'shoe_shoes'],
         colors=dict(skin='#E8B48C', hair='#3A2A22', top='#2F5E48', top2='#E6EDF5', acc2='#8A2B3A', bottom='#3B3F4A',
                     shoes='#2A2A30', sleeve='#E6EDF5', hands='#E8B48C')),
    dict(name='manager', base='elder_slim', face='elder', nose='big',
         parts=['hair_sidepart', 'top_blazer', 'det_tie', 'bot_pants', 'shoe_shoes', 'acc_glasses', 'fh_moustache'],
         colors=dict(skin='#F2C29A', hair='#BEBCB8', top='#3A3D45', top2='#7A2E3A', bottom='#3A3D45',
                     shoes='#2A2A30', glasses='#C9A045', sleeve='#3A3D45', hands='#F2C29A')),
    dict(name='office_b', base='adult_slim', face='lash', nose='dot',
         parts=['hair_ponytail', 'top_sweater', 'bot_pants', 'shoe_boots', 'acc_scarf'],
         colors=dict(skin='#F6CFAE', hair='#8A5232', top='#E7A1B0', top2='#F4EDE0', bottom='#3B3F52',
                     shoes='#8A5A33', acc='#F4EDE0', acc2='#D9483B', sleeve='#E7A1B0', hands='#F6CFAE')),
]
LOOK_FRAMES = {
    'courier': [('carry_sack', 'S', 1), ('carry_sack', 'SE', 2), ('carry_sack', 'E', 3), ('carry_sack', 'NE', 5),
                ('carry_sack', 'N', 6), ('scoop', 'SE', 2), ('scoop', 'S', 5), ('desk_count', 'SE', 0)],
    'office_a': [('desk_write', 'S', 0), ('desk_write', 'SE', 3), ('desk_write', 'SE', 4), ('desk_write', 'E', 1),
                 ('desk_type', 'SE', 0), ('point_board', 'NE', 1), ('point_board', 'E', 0), ('sit_idle', 'SE', 0)],
    'secretary': [('note', 'SE', 1), ('desk_phone', 'SE', 2), ('bow', 'SE', 2), ('hand_over', 'E', 2),
                  ('hand_over', 'SE', 3), ('sit_idle', 'S', 0)],
    'teller': [('stamp_stand', 'SE', 2), ('stamp_stand', 'SE', 3), ('stamp_stand', 'S', 3), ('bow', 'S', 3)],
    'manager': [('desk_read', 'SE', 0), ('desk_write', 'SE', 4), ('sit_idle', 'S', 0)],
    'office_b': [('file', 'NE', 2), ('file', 'N', 1), ('desk_phone', 'S', 0), ('desk_type', 'S', 4)],
}
