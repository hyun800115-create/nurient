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
# K = typical irradiance, S = additive sky specular of cloth (fitted on the proof renders).
TINT_MODEL = {'K': 0.85, 'S': [0.030, 0.033, 0.040]}


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
         shoes='#6B4A2E', sleeve='#3D7CC9', hands='#F6CFAE'),
    dict(skin='#E0A982', hair='#8A5232', top='#D9483B', top2='#F4EDE0', fur='#E6DCCB', bottom='#4A3830',
         shoes='#3B2A20', sleeve='#D9483B', hands='#3B3F4A'),
    dict(skin='#F2C29A', hair='#D9A85A', top='#5E9A4A', top2='#F4EDE0', fur='#F4F1EA', bottom='#2E3440',
         shoes='#8A5A33', sleeve='#5E9A4A', hands='#F2C29A'),
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


