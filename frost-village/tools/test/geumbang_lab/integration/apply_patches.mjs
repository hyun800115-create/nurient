// Applies the 금방 Integration patches (docs/build_reports/geumbang_module.md) to a SCRATCH copy of the game:
//   node tools/test/geumbang_lab/integration/apply_patches.mjs <repo> <scratchRoot>   (scratchRoot: OUTSIDE the repo, e.g. a temp dir)
// The scratch root gets a fresh copy of src/ + index.html + manifest.webmanifest, symlinks to assets/ and lib/,
// then every patch is applied as an exact old -> new replacement that must match exactly once (a miss = exit 1).
import fs from 'node:fs';
import path from 'node:path';

const [REPO0, ROOT0] = process.argv.slice(2);
if (!REPO0 || !ROOT0) { console.error('usage: apply_patches.mjs <repo> <scratchRoot>'); process.exit(2); }
const REPO = path.resolve(REPO0), ROOT = path.resolve(ROOT0);
// (the scratch root is wiped first: never the repo, never inside it, never a parent of it)
if (ROOT === REPO || ROOT.startsWith(REPO + path.sep) || REPO.startsWith(ROOT + path.sep) || !fs.existsSync(path.join(REPO, 'src', 'geumbang'))) { console.error('scratchRoot must be outside the repo (and <repo> the frost-village checkout)'); process.exit(2); }
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
fs.cpSync(path.join(REPO, 'src'), path.join(ROOT, 'src'), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(REPO, f), path.join(ROOT, f));
for (const d of ['assets', 'lib']) fs.symlinkSync(path.join(REPO, d), path.join(ROOT, d));

let n = 0, bad = 0;
function patch(file, pairs) {
  const fp = path.join(ROOT, file);
  let s = fs.readFileSync(fp, 'utf8');
  for (const [a, b] of pairs) {
    const k = s.split(a).length - 1;
    if (k !== 1) { console.error(`MISS ${file}: anchor found ${k}x:\n  ${a.slice(0, 140)}`); bad++; continue; }
    s = s.replace(a, () => b);
    n++;
  }
  fs.writeFileSync(fp, s);
}

// ---- G-P1 the system + the Game.serialize fallback
patch('src/systems/v42/index.js', [
  ["import { DepotSystem } from '../depot/DepotSystem.js';\n",
   "import { DepotSystem } from '../depot/DepotSystem.js';\nimport { GeumbangSystem } from '../../geumbang/ports_v4.js';   // (금방, docs/geumbang_plan.md §12)\n"],
  ["  ['depot', (gs, v, s) => new DepotSystem(gs, v, s)],\n",
   "  ['depot', (gs, v, s) => new DepotSystem(gs, v, s)],\n  ['gb', (gs, v, s, sv) => new GeumbangSystem(gs, v, s, sv)],   // (금방) after the depot it serves, before 관망\n"],
]);
patch('src/scenes/Game.js', [
  ["{ v42: this.saved && this.saved.v42, bank: this.saved && this.saved.bank, logistics: this.saved && this.saved.logistics }",
   "{ v42: this.saved && this.saved.v42, bank: this.saved && this.saved.bank, logistics: this.saved && this.saved.logistics, geumbang: this.saved && this.saved.geumbang }"],
]);

// ---- G-P2b / G-P2c the cargo sleigh: holds before the van spur at the module's hold point (critique M8), waits behind
//      a 금방 van in its lane and drives in the right-hand lane of the street it is on (critique M4)
patch('src/entities/CargoSleigh.js', [
  ["      case 'go': { this.s += v * dt; if (this.s >= this.len) { this.s = this.len; this.state = 'unload'; this.t = 0; } break; }",
   "      case 'go': {\n        // (금방 G-P2b) one lane with the 금방 van spur: hold at the module's hold point (depot.gbHoldS) while a van has it\n        // (금방 G-P2c) and wait behind a 금방 van stopped or driving ahead in the same lane\n        const S = this.sys, hold = S.gbHoldS ? S.gbHoldS() : 38.4;\n        if (S.gbVanAhead && S.gbVanAhead(this)) break;\n        const ns = this.s + v * dt;\n        this.s = S.gbSpurBusy && S.gbSpurBusy() && this.s <= hold ? Math.min(hold, ns) : ns;\n        if (this.s >= this.len) { this.s = this.len; this.state = 'unload'; this.t = 0; }\n        break;\n      }"],
  ["      case 'back': {\n        this.s -= v * dt;\n",
   "      case 'back': {\n        if (!(this.sys.gbVanAhead && this.sys.gbVanAhead(this))) this.s -= v * dt;   // (금방 G-P2c) behind a 금방 van in its lane\n"],
  ["    const [x, y] = L4(p.i - (queued ? 1.4 : 0), p.j);\n",
   "    // (금방 G-P2c) keep right: on a street the sleigh drives in its right-hand lane (src/geumbang/townRead.js keepRight)\n    const ko = this.sys.gbLaneOffset ? this.sys.gbLaneOffset(this, p, gs.game.loop.delta / 1000) : null;\n    const [x, y] = L4(p.i - (queued ? 1.4 : 0) + (ko ? ko.i : 0), p.j + (ko ? ko.j : 0));\n"],
]);

// ---- G-P3 the depot's workers step aside; the racks show 금방's unpicked lines
patch('src/entities/DepotBuilding.js', [
  ["    if (this.alpha > 0.05 && this.rackT <= 0) { this.rackT = 0.5; if (this.sys.model.stock.ver !== this.rackVer) this.drawRacks(); }",
   "    if (this.alpha > 0.05 && this.rackT <= 0) { this.rackT = 0.5; const S = this.shownFn ? this.shownFn() : null; if ((S || this.sys.model.stock).ver !== this.rackVer) this.drawRacks(S); }"],
  ["    const vis = this.alpha > 0.3;\n",
   "    const vis = this.alpha > 0.3 && !this.gbStaffOff;     // (금방 G-P3) the 금방 crew works here instead\n"],
  ["  drawRacks() {\n    const gs = this.gs, def = this.def, M = this.sys.model;\n    this.rackVer = M.stock.ver;\n",
   "  /** (금방 G-P3) what the racks show (count / of / ver like rack.js Stock): 금방's ordered lines stay on the rack until a picker lifts them */\n  setShown(fn) { this.shownFn = typeof fn === 'function' ? fn : null; this.rackVer = -1; }\n\n  drawRacks(S) {\n    const gs = this.gs, def = this.def, M = this.sys.model, stock = S || M.stock;\n    this.rackVer = stock.ver;\n"],
  ["    const fill = rackFill(geo, M.stock);\n", "    const fill = rackFill(geo, stock);\n"],
]);

// ---- G-P5 the save slice survives a load
{
  const src = fs.readFileSync(path.join(REPO, 'src/geumbang/save.js'), 'utf8').split('\n');
  const a = src.findIndex((l) => l.startsWith('export const GEUMBANG_SLICE'));
  const b = src.findIndex((l) => l.startsWith('/** the slice\'s byte size'));
  const body = src.slice(a, b).join('\n').replace(/^export (const|function) /gm, '$1 ').trimEnd();
  const block = "/**\n * (금방) a LOCAL copy of src/geumbang/save.js keep-rules (slice `geumbang` v1, cap 1,400 B): lines from GEUMBANG_SLICE\n * through mergeGot, `export` dropped, closed over so its helpers (int, bit, ID …) stay private.\n * tools/test/geumbang_lab/geumbang.test.mjs 'G-P5 parity' checks it keeps exactly what sanitizeGeumbang keeps.\n */\nexport const keepGeumbang = (() => {\n" + body.split('\n').map((l) => (l ? '  ' + l : l)).join('\n') + "\n  return sanitizeGeumbang;\n})();\n\n";
  patch('src/core/Save.js', [
    ["  const lgx = keepLogistics(raw.logistics);\n  if (lgx) s.logistics = lgx;\n",
     "  const lgx = keepLogistics(raw.logistics);\n  if (lgx) s.logistics = lgx;\n  // (금방) the geumbang slice: a local copy of the module's keep-rules (keepGeumbang below)\n  const gb = keepGeumbang(raw.geumbang);\n  if (gb) s.geumbang = gb;\n"],
    ["/** (v4-C) the civic block: counts clamped", block + "/** (v4-C) the civic block: counts clamped"],
  ]);
}

// ---- G-P6 the late fragments, the dog sled picture
patch('src/core/Assets.js', [
  ['"vehicles": ["veh_cargo_sleigh"]', '"vehicles": ["veh_cargo_sleigh", "veh_dog_sled"]'],
  ["'officefolk', 'chief2', 'audio7'];", "'officefolk', 'chief2', 'audio7', 'geumbang', 'geumbangfolk', 'ui6', 'audio8'];"],
]);

// ---- G-P7 the 금방 crew anims in the doll runtime
fs.copyFileSync(path.join(REPO, 'tools/geumbangfolk_compose.js'), path.join(ROOT, 'src/core/folk/geumbangfolk_compose.js'));
patch('src/core/Townfolk.js', [
  ["import { mergeOfficefolk, installOfficefolkRuntime } from './folk/officefolk_compose.js';\n",
   "import { mergeOfficefolk, installOfficefolkRuntime } from './folk/officefolk_compose.js';\nimport { mergeGeumbangfolk, installGeumbangfolkRuntime } from './folk/geumbangfolk_compose.js';   // (금방 G-P7)\n"],
  ["      this.ofResident = (this.T.ofPages && this.T.ofPages.resident) || 'sack';\n      return true;\n    } catch (e) { console.error('[TF] officefolk merge', e); return false; }\n  },\n",
   "      this.ofResident = (this.T.ofPages && this.T.ofPages.resident) || 'sack';\n      if (this.gb) installGeumbangfolkRuntime(this);     // (금방 G-P7) the crew rules again over the new block\n      return true;\n    } catch (e) { console.error('[TF] officefolk merge', e); return false; }\n  },\n\n" +
   "  /**\n   * (금방 G-P7, assets/geumbangfolk) the 금방 crew's anims (carry_parcel, ring_doorbell, hand_parcel, scan, sort_parcel,\n   * tape_box) join the running townsfolk runtime the way mergeOfficefolk does (src/core/folk/geumbangfolk_compose.js is a\n   * byte-identical copy of tools/geumbangfolk_compose.js). TF.gb = its Geumbangfolk; TF.ofAtlas gets the road / hub pages.\n   */\n" +
   "  mergeGeumbangfolk(gm) {\n    if (!this.T || !gm || !gm.geumbangfolk || this.gb) return !!this.gb;\n    try {\n      const merged = mergeGeumbangfolk({ atlases: this.sheets.map((k) => ({ key: k })), townfolk: this.T }, gm);\n      this.T = merged.townfolk;\n      this.tf = new Townfolk(this.T);\n      this._defs = {};\n      this._frames.clear();\n      if (this.assets) for (const k in this.assets.charCache) if (k.startsWith('tf:')) delete this.assets.charCache[k];\n      installGeumbangfolkRuntime(this);\n      return true;\n    } catch (e) { console.error('[TF] geumbangfolk merge', e); return false; }\n  },\n"],
]);

// ---- G-P8 the 금방 places in WORLD (what the game itself reads: the paint; gbLayout takes the rest from its defaults)
patch('src/data/world.js', [
  ["  treeGaps: [[6000, 2450, 6150, 2850], [3300, 3300, 3700, 3460]],\n};\n",
   "  treeGaps: [[6000, 2450, 6150, 2850], [3300, 3300, 3700, 3460]],\n};\n\n// ── (금방, docs/geumbang_plan.md §4) 금방 자리: src/geumbang/layout.js GB_LAYOUT 위에 덮어써요 (gbLayout). paint = 1번 문 앞마당\n//    (lgx_dock 을 j −27.6 → −29.6 로 넓혀요) + 밴 샛길이 중앙로로 들어가는 S자 (RoadPaint.addV42Streets 가 흙길로 칠해요)\nWORLD.v43 = { gb: { paint: [{ i: [32.3, 36.3], j: [-29.6, -27.6] }, { i: [30.0, 34.0], j: [-19.8, -18.0] }], openPad: [26.0, -32.2] } };\n"],
]);

// ---- G-P9 RoadPaint paints them with the depot's streets
patch('src/systems/RoadPaint.js', [
  ["    const walk = (S.find((q) => q.axis === 'path') || {}).pts || [];\n",
   "    // (금방 G-P9) the bay-1 apron and the van spur's S-jog onto 중앙로 (WORLD.v43.gb.paint): the module's own bake hook steps aside\n    const GBP = (WORLD.v43 && WORLD.v43.gb && WORLD.v43.gb.paint) || [];\n    for (const r of GBP) rects.push({ i: r.i, j: r.j, key: 'road_dirt' });\n    if (GBP.length) this.gbPainted = true;\n    const walk = (S.find((q) => q.axis === 'path') || {}).pts || [];\n"],
]);

// ---- G-P10 the balance block
{
  const t = fs.readFileSync(path.join(REPO, 'src/geumbang/tuning.js'), 'utf8');
  const a = t.indexOf('export const GB_TUNING = {'), b = t.indexOf('\n};\n', a);
  const lit = t.slice(a + 'export const GB_TUNING = '.length, b + 2).split('\n').map((l, i) => (i ? '    ' + l : l)).join('\n');
  patch('src/data/balance.js', [
    ["    train: { speed: 3.4, curve: 2.2, accel: 0.7, brake: 0.8, dwellOurs: 12, dwellTown: 8, coachSeats: 16, labels: 3 },\n  },\n};\n",
     "    train: { speed: 3.4, curve: 2.2, accel: 0.7, brake: 0.8, dwellOurs: 12, dwellTown: 8, coachSeats: 16, labels: 3 },\n  },\n  // ── (금방, docs/geumbang_plan.md §8.1) 온라인 마켓 · 배달. src/geumbang/tuning.js GB_TUNING 과 같은 값 (gbTuning 이 기본값 위에\n  //    덮어써요: 빠진 값은 기본값, 타입이 다른 값은 무시)\n  v43: {\n    gb: " + lit + ",\n  },\n};\n"],
  ]);
}

// ---- G-P11 the letter (VillageNews template + strings) and its button
patch('src/systems/VillageNews.js', [
  ["      case 'banker': return [{ k: 'lt_banker_b1', act: 'reply' }];\n",
   "      case 'banker': return [{ k: 'lt_banker_b1', act: 'reply' }];\n      case 'geumbang': return [{ k: 'lt_geumbang_b1', act: 'gb:open' }, { k: 'lt_geumbang_b2', act: 'later' }];   // (금방 G-P11)\n"],
  ["  /** a new letter (from the mailbox) */\n  deliver(tpl) {",
   "  /** (금방 G-P11) a module's own letter, once (src/geumbang/ports_v4.js letters.offer('geumbang')) */\n  offerLetter(tpl) { if (this.once.has(tpl)) return true; return !!this.deliver(tpl); }\n\n  /** a new letter (from the mailbox) */\n  deliver(tpl) {"],
]);
patch('src/systems/office/Office.js', [
  ["    else if (act === 'depot') { const s = gs.sites && gs.sites.v42_depot; if (s) hop(s.x, s.y); }\n",
   "    else if (act === 'depot') { const s = gs.sites && gs.sites.v42_depot; if (s) hop(s.x, s.y); }\n    else if (act === 'gb:open') { const p = v.gb && v.gb.pad, D = v.depot && v.depot.building; if (p) hop(p.x, p.y); else if (D) hop(D.x, D.y); }   // (금방 G-P11) the 금방 개업 pad\n"],
]);
patch('src/data/strings.js', [
  ["    lt_cafe_b1: '물류창고 터 보기', lt_cafe_b2: '고마워요',\n",
   "    lt_cafe_b1: '물류창고 터 보기', lt_cafe_b2: '고마워요',\n    // (금방 G-P11 / G-P13)\n    lt_geumbang_from: '솔방울 아파트 2동 정 할머니', lt_geumbang_body: '촌장님, 요즘 역까지 장 보러 가기가 힘들어요. 물류창고에 물건이 그렇게 많다던데, 집 앞까지 갖다 주면 안 될까요? — 셈이: 이름은 \\'금방\\' 어때요? 방금 시키면 금방 가니까요.',\n    lt_geumbang_b1: '금방 개업 자리 보기', lt_geumbang_b2: '조금 더 생각해 볼게요',\n    set_gbAlerts: '금방 알림', gbAlerts_on: '켬', gbAlerts_quiet: '조용히', gbAlerts_off: '끔',\n    // (금방 G-P16 / G-P17)\n    inc_gb: '금방', news_gb_day: '금방, 어제 {a}집에 배달했어요', news_gb_racks: '물류창고 선반이 어제보다 {a}% 가벼워졌어요',\n    ad_gb: '광고 · 금방 마켓 · 금방 뭐가 왔지? 금방이 왔지!', pact_gb: '금방 구경하는 중',\n"],
  ["    lt_cafe_b1: 'See the depot site', lt_cafe_b2: 'Thank you',\n",
   "    lt_cafe_b1: 'See the depot site', lt_cafe_b2: 'Thank you',\n    // (Geumbang G-P11 / G-P13)\n    lt_geumbang_from: 'Grandma Jeong, Pinecone Apartments 2', lt_geumbang_body: 'Chief, the walk to the station shops is getting hard for me. They say the depot is full of goods. Could they bring things to my door? — Sem: How about calling it \"Geumbang\"? Order now, here in a moment.',\n    lt_geumbang_b1: 'See the Geumbang pad', lt_geumbang_b2: 'Let me think about it',\n    set_gbAlerts: 'Geumbang alerts', gbAlerts_on: 'On', gbAlerts_quiet: 'Quiet', gbAlerts_off: 'Off',\n    // (Geumbang G-P16 / G-P17)\n    inc_gb: 'Geumbang', news_gb_day: 'Geumbang delivered to {a} homes yesterday', news_gb_racks: 'The depot racks are {a}% lighter than the day before',\n    ad_gb: 'Ad · Geumbang Market · What came just now? Geumbang did!', pact_gb: 'watching Geumbang',\n"],
]);

// ---- G-P12 관망: a van at a door is a cut; no cut while 따라가기 has the camera
patch('src/systems/pilot/CameraDirector.js', [
  ["    this.onBuilt = (k, site) => { if (site) push('cut_ribbon', site.x, site.y - 60); };\n",
   "    this.onBuilt = (k, site) => { if (site) push('cut_ribbon', site.x, site.y - 60); };\n    this.onGb = (e) => { if (e && e.t === 'gb:arrive' && Number.isFinite(e.x)) push('cut_gb', e.x, e.y - 40); };   // (금방 G-P12)\n"],
  ["    gs.events.on('built', this.onBuilt);\n", "    gs.events.on('built', this.onBuilt);\n    gs.events.on('gb', this.onGb);\n"],
  ["    gs.events.off('built', this.onBuilt);\n", "    gs.events.off('built', this.onBuilt);\n    gs.events.off('gb', this.onGb);\n"],
  ["    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) return;\n",
   "    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) return;\n    const GB = gs.v43 && gs.v43.gb; if (GB && GB.following && GB.following()) return;   // (금방 G-P12) 따라가기 has the camera\n"],
]);

// ---- G-P13 the HUD: the 길 안내 badge clears the 금방 chip; Settings keeps gbAlerts / gbScenes; the 놀이 tab row
patch('src/scenes/UIv42.js', [
  ["ey = Phaser.Math.Clamp(p.y, ex < ui.W * 0.45 ? 480 : 220, ui.H - 240 - View.safeBottom);",
   "gbOn = !!(ui.gs && ui.gs.v43 && ui.gs.v43.gb && ui.gs.v43.gb.isOpen()), ey = Phaser.Math.Clamp(p.y, ex < ui.W * 0.45 ? (gbOn ? 550 + (View.safeTop || 0) : 480) : 220, ui.H - 240 - View.safeBottom);   // (금방 G-P13: below the 금방 chip)"],
]);
patch('src/core/Save.js', [
  ["    pickup: 'auto', nav: true, halo: true, observeAfter: 60, observeEvents: true, observeSpend: 'none' },\n",
   "    pickup: 'auto', nav: true, halo: true, observeAfter: 60, observeEvents: true, observeSpend: 'none',\n    // (금방 G-P13) 금방 알림 'on' | 'quiet' | 'off' · 금방 문 앞 장면 (첫 주문 따라가기 / 띵동 장면)\n    gbAlerts: 'on', gbScenes: true },\n"],
  ["      this.data.observeSpend = s.observeSpend === 'hire' ? 'hire' : 'none';\n",
   "      this.data.observeSpend = s.observeSpend === 'hire' ? 'hire' : 'none';\n      this.data.gbAlerts = s.gbAlerts === 'quiet' || s.gbAlerts === 'off' ? s.gbAlerts : 'on';     // (금방 G-P13)\n      this.data.gbScenes = s.gbScenes !== false;\n"],
]);
patch('src/scenes/UI.js', [
  ["    add(this.add.text(cx, Y(6) + 6, t('set_playHint'), Object.assign(TXT(21, '#5b6676', '#ffffff', 0, '700'), { align: 'center', wordWrap: { width: 480 } })).setOrigin(0.5));\n",
   "    // (금방 G-P13) once 금방 is open its 알림 row takes the hint's place (the tab has room for 7 rows)\n    const GB = this.gs.v43 && this.gs.v43.gb;\n    if (GB && GB.isOpen && GB.isOpen()) {\n      const ga = S.gbAlerts === 'quiet' || S.gbAlerts === 'off' ? S.gbAlerts : 'on';\n      row(Y(6), t('set_gbAlerts'), t('gbAlerts_' + ga), ga === 'on' ? 'green' : ga === 'quiet' ? 'blue' : 'gray', () => { S.gbAlerts = ga === 'on' ? 'quiet' : ga === 'quiet' ? 'off' : 'on'; redo(); }, Assets.pick('ui_icon_gb', 'ui_icon_bell', 'ui_icon_settings'));\n    } else add(this.add.text(cx, Y(6) + 6, t('set_playHint'), Object.assign(TXT(21, '#5b6676', '#ffffff', 0, '700'), { align: 'center', wordWrap: { width: 480 } })).setOrigin(0.5));\n"],
]);

// ---- G-P16 the office, the 통장 and 서리 소식 (critique M6): the 물류창고 tab's 금방 row, its own income bar, the paper's
//      lines and every other paper's ad (strings in G-P11's block; the module writes O.income.gb once inc_gb exists)
patch('src/scenes/OfficePanel.js', [
  ["    const inc = O.income, keys = ['market', 'trade', 'store', 'rest', 'tax', 'station', 'export', 'depot'];\n",
   "    const GBo = this.gs.v43 && this.gs.v43.gb;   // (금방 G-P16) its own bar once it is open\n    const inc = O.income, keys = ['market', 'trade', 'store', 'rest', 'tax', 'station', 'export', 'depot'].concat(inc.gb || (GBo && GBo.isOpen()) ? ['gb'] : []);\n"],
  ["    Dp.sleighs.forEach((sl, i) => this.text(B.x0 + 40, y0 + 190 + i * 40, '🛷 ' + t(sl.stateText()) + ' · ' + sl.count(), 20, '#5b6676'));\n",
   "    Dp.sleighs.forEach((sl, i) => this.text(B.x0 + 40, y0 + 190 + i * 40, '🛷 ' + t(sl.stateText()) + ' · ' + sl.count(), 20, '#5b6676'));\n    // (금방 G-P16) 금방 마켓 · 오늘 주문 · 배달 · 선반 −\n    const GBd = this.gs.v43 && this.gs.v43.gb;\n    if (GBd && GBd.isOpen()) this.text(B.x0 + 40, y0 + 190 + Dp.sleighs.length * 40 + 12, GBd.officeRow(), 20, '#8a5a2a');\n"],
  ["      case 'depot': { const Dp = v.depot; return Dp && Dp.built ? Dp.model.stock.ver + ':' + Dp.sleighs.map((x) => x.state + x.count()).join(',') : 'none'; }",
   "      case 'depot': { const Dp = v.depot, GBk = this.gs.v43 && this.gs.v43.gb; return Dp && Dp.built ? Dp.model.stock.ver + ':' + Dp.sleighs.map((x) => x.state + x.count()).join(',') + ':' + (GBk && GBk.isOpen() ? GBk.officeRow() : '') : 'none'; }"],
  ["    this.text(B.x0 + 44, B.top + 300 + p.lines.length * 70 + 10, t('ad_' + (p.day % 4)), 18, '#8a5a2a');\n",
   "    const GBn = this.gs.v43 && this.gs.v43.gb, gbAd = !!(GBn && GBn.isOpen() && p.day % 2 === 1);   // (금방 G-P16) every other paper\n    this.text(B.x0 + 44, B.top + 300 + p.lines.length * 70 + 10, t(gbAd ? 'ad_gb' : 'ad_' + (p.day % 4)), 18, '#8a5a2a');\n"],
]);
patch('src/systems/office/Office.js', [
  ["    if (n > 0) this.income[q.name] = (this.income[q.name] || 0) + n;\n",
   "    // (금방 G-P16) the 물류 금고's coins are counted when they come in (DepotSystem's sales, 금방's orders): not again here\n    if (n > 0 && q.name !== 'depot') this.income[q.name] = (this.income[q.name] || 0) + n;\n"],
]);
patch('src/systems/VillageNews.js', [
  ["    if (T.visitors > 0) H.push(['news_visitors', T.visitors, 0]);\n",
   "    if (T.visitors > 0) H.push(['news_visitors', T.visitors, 0]);\n    // (금방 G-P16) yesterday's 금방: the homes it delivered to, the racks it lightened (src/geumbang/host.js newsLines)\n    const GB = this.gs.v43 && this.gs.v43.gb;\n    if (GB && GB.news) for (const h of GB.news()) H.push(h);\n"],
]);

// ---- G-P17 관망 "금방 구경" (critique M6, optional): the chief walks over to a 금방 van at a door / loading in bay 1 / a
//      sled at a pile within 1,500 px and waves — once a day before the afternoon chores, else a leisure act
patch('src/systems/pilot/agenda.js', [
  ["export const ACTS = ['urgent', 'lunch', 'work', 'evening', 'collect', 'train', 'chat', 'office', 'rest', 'dog'];",
   "export const ACTS = ['urgent', 'lunch', 'work', 'evening', 'collect', 'train', 'chat', 'office', 'rest', 'dog', 'gb'];   // (금방 G-P17: gb last)"],
  ["rest: [20, 40], dog: [15, 15] };", "rest: [20, 40], dog: [15, 15], gb: [12, 25] };"],
  ["rest: 60, dog: 90 };", "rest: 60, dog: 90, gb: 240 };"],
  ["export const HANDS_FREE = new Set(['lunch', 'evening', 'train', 'chat', 'office', 'rest', 'dog']);",
   "export const HANDS_FREE = new Set(['lunch', 'evening', 'train', 'chat', 'office', 'rest', 'dog', 'gb']);"],
  ["    case 'dog': return c.dog ? 15 + ((c.dogIdle || 0) >= 600 ? 20 : 0) : null;\n",
   "    case 'dog': return c.dog ? 15 + ((c.dogIdle || 0) >= 600 ? 20 : 0) : null;\n    // (금방 G-P17) 금방 구경: a 금방 van at a door / loading nearby — the day's first one before the afternoon chores\n    case 'gb': return c.gb ? 22 + (c.gbToday ? 0 : 20) : null;\n"],
]);
patch('src/systems/pilot/ChiefPilot.js', [
  ["      dog: !!(gs.dog && gs.dog.r && gdist(p.x, p.y, gs.dog.r.x, gs.dog.r.y) < (dogIdle >= 600 ? 1400 : 800)),\n",
   "      dog: !!(gs.dog && gs.dog.r && gdist(p.x, p.y, gs.dog.r.x, gs.dog.r.y) < (dogIdle >= 600 ? 1400 : 800)),\n      // (금방 G-P17) something 금방 to watch near him (src/geumbang/host.js watchSpot); the running watch keeps its target\n      gb: doing === 'gb' ? !!(this.act && this.act.target) : !!(gs.v43 && gs.v43.gb && gs.v43.gb.watchSpot && gs.v43.gb.watchSpot(p.x, p.y, 1500)),\n      gbToday: this.gbDay === today && doing !== 'gb',\n"],
  ["      case 'dog': { const d = gs.dog && gs.dog.r; if (d) st.target = { x: d.x + 50, y: d.y + 20 }; this.dogPrev = this.lastDog; this.lastDog = this.t; break; }\n",
   "      case 'dog': { const d = gs.dog && gs.dog.r; if (d) st.target = { x: d.x + 50, y: d.y + 20 }; this.dogPrev = this.lastDog; this.lastDog = this.t; break; }\n      case 'gb': {   // (금방 G-P17)\n        const w = gs.v43 && gs.v43.gb && gs.v43.gb.watchSpot ? gs.v43.gb.watchSpot(p.x, p.y, 1500) : null;\n        if (w) st.target = { x: w.x, y: w.y, fx: w.fx, fy: w.fy };\n        const ck = gs.v4 && gs.v4.clock;\n        this.gbDay = ck && ck.on ? ck.day() : -1;\n        break;\n      }\n"],
  ["      case 'dog': return t('act_dog');\n", "      case 'dog': return t('act_dog');\n      case 'gb': return t('pact_gb');   // (금방 G-P17)\n"],
  ["    if (a.act === 'train') {", "    if (a.act === 'gb' && a.target && Number.isFinite(a.target.fx)) { p.doAction('wave', 6, a.target.fx, a.target.fy); return; }   // (금방 G-P17) waves to the 금방 crew\n    if (a.act === 'train') {"],
]);

console.log(JSON.stringify({ applied: n, missed: bad }));
process.exit(bad ? 1 : 0);
