# v4 reference layout (docs/v4_plan.md §3): every v4 object / street on the roads-kit lattice, validated.
#   python3 tools/test/v4_layout_ref.py [-v] [--json out.json]   -> prints problems (or "no problems")
# Self-contained: the shoreline below is WORLD.shore of src/data/world.js (keep in sync if that changes).
# world.js v4 data must match these numbers; tools/test/v4_layout.mjs (BUILD-A) re-checks world.js itself.
import json, math, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SHORE = {'base': 372, 'waves': [[16, 0.0052, 0.4], [7, 0.0165, 1.7], [3, 0.041, 0.2]], 'slope': {'from': 1880, 'knee': 220, 'k': 0.5}}
def shore(x):
    y = SHORE['base'] + sum(a * math.sin(x * f + ph) for a, f, ph in SHORE['waves'])
    sl = SHORE['slope']; d = x - sl['from']
    if d > 0: y += sl['k'] * d * d / (2 * sl['knee']) if d < sl['knee'] else sl['k'] * (d - sl['knee'] / 2)
    return y
G = (3120, 1315); S2 = math.sqrt(2)
def L(i, j): return (G[0] + 64 * (i + j), G[1] + 32 * (i - j))
def px2L(x, y): a = (x - G[0]) / 64; b = (y - G[1]) / 32; return ((a + b) / 2, (a - b) / 2)
WMAX, HMAX, INSET = 6144, 3450, 46
REG = {'rail': (3000, 0, 4150, HMAX), 'town': (4150, 0, WMAX, HMAX)}
MAN = json.load(open(os.path.join(HERE, '..', '..', 'assets', 'town', 'manifest.json')))['sprites']
def fpm(k):
    v = MAN[k]['footprintM']
    return (v[0], v[1]) if isinstance(v, list) else (0.6, 0.6)

objs = []
def add(name, key, i, j, region, kind='bld', X=None, Y=None, note=''):
    if X is None: X, Y = fpm(key)
    objs.append(dict(name=name, key=key, i=i, j=j, X=X, Y=Y, region=region, kind=kind, note=note))

# ------------------------------------------------------------------ rail region: 서리역 앞 (station district)
add('our_station', 'train_station', 2.5, 2.03, 'rail', 'station')
add('cargo_pad', 'pad', 4.1, -1.8, 'rail', 'pad', 1.6, 1.6, '짐 싣는 곳 (wholesale sink)')
add('order_board', 'notice_board', 2.6, -2.4, 'rail', 'prop', 1.4, 0.5, '주문판 (order cards)')
add('stn_cash', 'pad', 6.3, -1.6, 'rail', 'pad', 1.5, 1.5, '역 금고 (station cash: wholesale + bonus + rent)')
add('stn_porter_pad', 'pad', 6.0, -3.4, 'rail', 'pad', 1.4, 1.4, '역 짐꾼 hire pad (v4 review: clear of the cafe and the cargo label)')
add('rank_pad', 'pad', 4.0, -3.9, 'rail', 'pad', 1.6, 1.6, '승격식 pad (v4 review: front of the square, its price clear of the cargo label)')
for n, i in enumerate([9.65, 12.3, 14.95]): add('lotA%d' % (n + 1), 'cafe', i, -1.9, 'rail', 'lot', 3.4, 3.0)
for n, i in enumerate([12.8, 15.45, 18.1]): add('lotB%d' % (n + 1), 'cafe', i, -10.25, 'rail', 'lot', 3.4, 3.0)
add('lotB5', 'supermarket', 21.2, -10.25, 'rail', 'lot')
for n, i in enumerate([16.0, 18.4, 20.8, 25.5, 27.9]): add('lotH%d' % (n + 1), 'townhouse_a', i, -15.2, 'rail', 'lot')
# ------------------------------------------------------------------ town region: 솔방울 마을
add('town_station', 'train_station', 28.0, 2.03, 'town', 'station')
rowA = [('t_cafe', 'cafe', 21.0), ('t_book', 'bookstore', 23.5), ('t_play', 'playground', 26.4), ('t_fountain', 'park_fountain', 29.5),
        ('t_sled', 'sled_stop', 31.7), ('t_toy', 'toy_shop', 35.3), ('t_cloth', 'clothing_store', 37.9), ('t_flower', 'flower_shop', 40.5),
        ('t_hair', 'hair_salon', 43.1), ('t_rest', 'restaurant', 45.8)]
for n, k, i in rowA: add(n, k, i, -1.9, 'town')
rowB = [('t_post', 'post_office', 35.5), ('t_school', 'school', 39.3), ('t_hall', 'town_hall', 43.5), ('t_clinic', 'clinic', 46.8),
        ('t_fire', 'fire_station', 49.9)]
add('t_police', 'police_box', 31.6, 2.6, 'town', note='역전 파출소 (sea side, by the station)')
for n, k, i in rowB: add(n, k, i, -10.5, 'town')
rowC = [('t_apt1', 'apartment_a', 35.7), ('t_apt2', 'apartment_b', 38.95), ('t_apt3', 'apartment_a', 42.2), ('t_apt4', 'apartment_b', 45.45)]
for n, k, i in rowC: add(n, k, i, -15.3, 'town')
add('town_gate', 'town_gate', 18.05, -2.2, 'rail', 'gate', 4.6, 1.0, 'standing gate + board 솔방울 마을 beside 역앞 거리 at the town line (straddles the line on purpose)')

# ------------------------------------------------------------------ streets: (id, axis, i0, i1, j0, j1, cls, note)
#   corridor = cells kept free of buildings (v5 reserve); paint = cells painted in v4 (class)
streets = [
  # id          axis  i0    i1    j0    j1    v4 paint                 note
  ('link',      'x', -6.5,  2.0,  -1.5, -0.5, 'path',  None,          '역 가는 길: e_east -> square (soft path, v2 style)'),
  ('square',    'x',  2.0,  8.3,  -3.0, -0.75,'square', None,         '역 광장 (sidewalk texture)'),
  ('main',      'x',  8.0, 49.5,  -9.0, -3.0, 'dirt',  (-6.0, -4.0),  '역앞 거리 -> 솔방울 큰길: corridor 6 cells (walk 1 + road 4 + walk 1) kept free; v4 paints a 2-cell dirt track j -6..-4 (shop side)'),
  ('back',      'x', 13.0, 50.0, -14.0, -12.0,'dirt',  (-14.0, -12.0),'뒷길: one-lane track (2 cells)'),
  ('shopalley', 'y', 23.3, 24.3, -18.0, -9.0, 'path',  None,          '가게 골목 footpath: main street <-> 뒷길 <-> 집 앞길 (district)'),
  ('homes',     'x', 17.0, 30.0, -18.0, -17.0,'path',  None,          '집 앞길 footpath (district houses)'),
  ('ave',       'y', 30.0, 34.0, -18.0, -9.0, 'dirt',  (30.0, 34.0),  '솔방울 중앙로: two-lane (4 cells) Y street'),
  ('apts',      'x', 34.0, 47.0, -18.0, -17.0,'path',  None,          '아파트 앞길 footpath'),
  ('xing_ours', 'y',  8.0,  9.0,  -0.75, 1.0, 'xing',  None,          'pedestrian level crossing (rail_x_crossing at k=8)'),
  ('xing_town', 'y', 33.0, 34.0,  -0.75, 1.0, 'xing',  None,          'pedestrian level crossing (rail_x_crossing at k=33)'),
  ('platform_e','x', 30.5, 34.0,   0.75, 1.75,'path',  None,          'town platform east end -> crossing'),
  ('alley_t',   'y', 33.0, 34.0,  -3.0, -0.75,'path',  None,          'gap in town row A from the crossing to the main street'),
]
problems = []
def rect(o, m=0.0):
    hx = o['X'] / 2 / S2 + m; hy = o['Y'] / 2 / S2 + m
    return (o['i'] - hx, o['i'] + hx, o['j'] - hy, o['j'] + hy)
def corners(o):
    a, b, c, d = rect(o)
    return [L(a, c), L(b, c), L(b, d), L(a, d)]
for o in objs:
    r = REG[o['region']]
    for (x, y) in corners(o):
        if o['kind'] != 'gate' and not (r[0] + INSET <= x <= r[2] - INSET and y <= r[3] - INSET):
            problems.append((o['name'], 'outside region', round(x), round(y)))
        if y < shore(x) + 60: problems.append((o['name'], 'too close to sea', round(x), round(y), round(shore(x))))
for a in range(len(objs)):
    for b in range(a + 1, len(objs)):
        A, B = rect(objs[a], 0.12), rect(objs[b], 0.12)
        if A[0] < B[1] and B[0] < A[1] and A[2] < B[3] and B[2] < A[3]: problems.append((objs[a]['name'], 'overlaps', objs[b]['name']))
for s in streets:
    sid, ax, i0, i1, j0, j1 = s[:6]
    for o in objs:
        if o['kind'] in ('pad', 'prop') and sid == 'square': continue
        if o['kind'] == 'gate' and sid == 'main': continue
        if o['kind'] == 'station' and sid.startswith('platform'): continue
        A = rect(o, 0.0)
        if A[0] < i1 and i0 < A[1] and A[2] < j1 and j0 < A[3]: problems.append((o['name'], 'on street', sid))
    # streets inside the open land of their regions (every corner inside rail or town, or the old east land for the link)
    for (x, y) in (L(i0, j0), L(i1, j0), L(i1, j1), L(i0, j1)):
        if sid == 'link': continue
        if not (3000 + INSET <= x <= WMAX - INSET and y <= HMAX - INSET): problems.append((sid, 'street corner outside', round(x), round(y)))
        if y < shore(x) + 60: problems.append((sid, 'street near sea', round(x), round(y)))
for o in objs:
    if o['kind'] == 'station': continue
    A = rect(o, 0.0)
    if A[2] < 0.75 and -0.75 < A[3]: problems.append((o['name'], 'on track ballast'))
# train stops: engine on the village (NW) end; 3 cars now, 4 at rank 읍 (second coach)
CELL = S2  # metres per cell
def consist(i_car_a, coaches=1):
    sp = [2.34, 2.24]
    order = ['train_engine', 'train_car_a'] + (['train_car_a'] if coaches == 2 else []) + ['train_car_b']
    # engine NW of car_a by 2.34 m; further cars SE
    pos = {'train_engine': [i_car_a - sp[0] / CELL]}
    x = i_car_a; out = [('train_engine', i_car_a - sp[0] / CELL), ('train_car_a', x)]
    if coaches == 2: x += 2.24 / CELL; out.append(('train_car_a2', x))
    x += 2.24 / CELL; out.append(('train_car_b', x))
    ends = (out[0][1] - 1.3 / CELL, out[-1][1] + 1.15 / CELL)
    return out, ends
for st, ia, xing in (('ours', 2.5, 8.0), ('town', 28.0, 33.0)):
    for co in (1, 2):
        cars, ends = consist(ia, co)
        if ends[1] > xing - 0.4: problems.append(('train at ' + st, 'covers crossing', round(ends[1], 2), xing))
        if st == 'ours' and ends[0] < -0.6: problems.append(('train at ours', 'past buffer', round(ends[0], 2)))
# old world objects that the new streets / lots must not hit
for (name, x, y, r) in [('tower_se', 2870, 1370, 1.0)]:
    i, j = px2L(x, y)
    for s in streets:
        sid, ax, i0, i1, j0, j1 = s[:6]
        if i0 - r < i < i1 + r and j0 - r < j < j1 + r: problems.append((sid, 'near', name))
print('\n'.join(map(str, problems)) or 'no problems')
out = {'G': G, 'objs': [], 'streets': [], 'track': {'j': 0, 'from': -1, 'to': 47}}
for o in objs:
    x, y = L(o['i'], o['j'])
    out['objs'].append(dict(name=o['name'], key=o['key'], x=round(x), y=round(y), i=o['i'], j=o['j'], X=o['X'], Y=o['Y'],
                            poly=[[round(a), round(b)] for a, b in corners(o)], region=o['region'], kind=o['kind'], note=o['note']))
for s in streets:
    sid, ax, i0, i1, j0, j1, cls, paint, note = s
    pts = [L(i0, j0), L(i1, j0), L(i1, j1), L(i0, j1)]
    out['streets'].append(dict(id=sid, axis=ax, i=[i0, i1], j=[j0, j1], cls=cls, paint=paint, note=note, poly=[[round(a), round(b)] for a, b in pts]))
stops = {}
for st, ia in (('ours', 2.5), ('town', 28.0)):
    for co in (1, 2):
        cars, ends = consist(ia, co)
        stops['%s_%d' % (st, co)] = [(k, round(i, 2), [round(v) for v in L(i, 0)]) for k, i in cars] + [('ends', round(ends[0], 2), round(ends[1], 2))]
out['stops'] = stops
if '--json' in sys.argv: json.dump(out, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)
if '-v' in sys.argv:
    for o in out['objs']: print(f"{o['name']:15s} {o['key']:18s} L({o['i']},{o['j']})  px ({o['x']},{o['y']})  {o['region']}")
    for s in out['streets']: print(s['id'], s['poly'])
    for k, v in stops.items(): print(k, v)
