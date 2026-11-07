# 촌장 → 읍장 → 시장: engineering roadmap (for review, 2026-11-07)

Companion to the designer document `기획서_시장취임_로드맵.md` (same folder). Same version names, minutes, effort ranges and question numbers.

- **Status:** on 2026-11-07 the lead designer agreed to the direction (발로 뛰는 촌장 → 배우는 읍장 → 경영하는 시장). That approves the direction only. Building starts now on v4.3 step B alone; every later version waits for its own plan review (§2 principle 4).
- **Base:** work branch HEAD `b418595` (v4.3.0-a2 preview), `SAVE_VERSION` 8. Nothing under the repo was changed for this plan.
- **Sources:** today's progress/fun and overseer reviews; two critique passes over this roadmap; `docs/redesign_v43/engineering_plan.md`; `docs/v44_plan.md`; `docs/v5_v8_plan.md`; `docs/geumbang_plan.md`; `docs/logistics_plan.md`; `docs/build_reports/missions_bank.md`; the code anchors cited below.
- **Minutes** are pacing-bot game minutes from a new game. Humans: × 1.3–1.5 (estimate, never measured).
- **Effort** is builder-days for one builder, art in parallel. Step A was planned at 9 and took ≈ 11, so every range is the planned sum × 1.08–1.26. Uncertainty ≈ ±30 % (v5.1–v8: ±40 %).

## 0. Summary

| Ver | Name | Stage | Bot min | Headline | Save | Days |
|---|---|---|---|---|---|---|
| v4.3 | 마을 새 단장 | 촌장 | 0–45 | step B + F0/`lv`/S1 + structural remap + texture task + play log v1 | v8, `lv` 43 | 19–22 |
| v4.4 | 읍장 취임 | 읍장 | 45–65 | hand-over: tap-select/tap-open, pan, remote pay, step C, 세금 날, act-4 lessons, catch-up ceremony, A/B | v8 + `x` | 42–49 |
| v4.5 | 주민의 부탁 | 읍장 | 50–80 + daily | kit-lite + F8b ports, 4 needs, requests/board/fame, card + 따라가기 + 함께하기, deliver job, daily loop, 청혼 scene. **Public launch** | v8 + slices | 34–40 |
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 금방 G1, L1a remainder, L1b, 도감, mailbox, weekly goal + titles, 도시 bars + 시청 공사 scene | v8 + slices | 33–38 |
| proto | 시장 시험판 | — | from a bundled 읍 save | in-app sandbox: needs/facilities/conflict cards/tax rate | own keys | 10–13 |
| v5.0 | 시장 취임 | 시장 | 100–150 | full kit, households, welfare + needs, tax rate, rank 3 + scripted wedding, balance pass | **v9** | 34–40 |
| v5.1 | 주민의 일생 | 시장 | 105–150 | story host, life beats (farewell sub-gate, off), conflict cards, card v2 | v9 + side key | 20–28 |
| v5.2 | 탈것의 시대 | 시장 | 115–150 | vehicles era 2/3, asphalt, bank deposit + loans, 금방 G2 | v9 + slices | 18–24 |
| v5.3 | 안심 마을 | 시장 | 110–150 | incidents via ScriptedSource at a village 방범 초소, hydrants, cityfolk merge | v9 + slice | 14–18 |
| v6 | 갈매기 항구 | 시장 | 150–200 | harbour district | v9 (bump only if structural) | 25–35 |
| v7 | 햇살 해변 | 시장 | 200–245 | beach district | same | 20–28 |
| v8 | 살아 있는 도시 | 시장 | 245–300, then endless | logistics centre, police/fire stations, full incidents, rank 4 | same | 30–40 |

**Totals:** launch candidate (v4.3–v4.5) **95–111**; 읍장 stage (v4.4–v4.6) 109–127; to 시장 취임 (v4.3 … v5.0 incl. prototype) **172–202**; to 안심 마을 (… v5.3) **224–272** (≈ 20–25 × step A); v6–v8 75–103; whole roadmap 299–375. Tester windows (≈ 3–5 weeks to launch; 1–2 weeks per version after it) come on top.

**Calendar:** builder-days measure work, not calendar time. With parallel agent work, step A (≈11 builder-days) landed in ≈2–3 calendar days (plan 2026-11-01, build commits 2026-11-06, merged 2026-11-07). Calendar time will be dominated by designer review stops and tester windows (Play's 12-testers × 14-days rule, 1–2 weeks of testing per version). A naive single-builder, 5-days-a-week reading would put public launch in April–May 2027, v5.0 in late July–September 2027 and v8 in H1 2028; treat that as an upper bound, not a schedule.

The previous draft said 76–90 to launch. The critique found unbudgeted work: newer-save protection and the structural remap, a texture task, gates kept in v4.3, the catch-up ceremony, stand-to-open panels, the missions ports (F8b), a deliver job, the balance pass and a v5 that held four integration phases. The overseer's "staged hybrid ≈ 40–50 days" covered the management layer only.

## 1. Version numbering (designer question 1)

- **v4.3 = steps A + B** (as in `engineering_plan.md` and the shipped preview label v4.3.0-a2).
- **v4.4–v4.6 = the 읍장 stage.** These slots keep the themes the v4.4 plan gave them where possible: the daily loop stays v4.5 and 도감 stays v4.6 (`v44_plan.md` §0).
- **v5.0–v5.3 = the 시장 core** (시장 취임, 주민의 일생, 탈것의 시대, 안심 마을; question 24). **v6, v7, v8 keep their names and order** from `v5_v8_plan.md` §0 D1.
- **Retired:** v4.3.1–v4.3.4 (금방 / 시험 도구 / L1a / L1b in `engineering_plan.md` §1.2, `logistics_plan.md` §0, `v44_plan.md` §0) and v4.4.1 (이야기). This settles the 금방 v4.3 vs v4.3.1 conflict (`engineering_plan.md` §13 Q2).
- Hotfixes use the 4th digit (4.3.0.1), as 4.2.0.1/4.2.0.2 did. A cut line slips to x.y.1 (e.g. v4.6.1).

Why: the two ends are already "known" numbers (a shipped preview, and eight v5–v8 documents the designer refers to by number); only the disputed middle sub-numbers change. v5 is split because one v5.0 would have been ≈ 54–68 builder-days with no tester build.

## 2. Principles

1. **Before 읍, nothing changes beyond v4.3 B except a short list of deliberate additions:** the read-only ledger door (D9) and the name prompt at game start (v4.4, question 20); attendance from day 1, away earnings after village complete and the ch. 1–5 hands-on quests (v4.5, question 19). Each version that adds one re-runs `onboarding.mjs`, G1 and 읍 ±5 %; from v4.5 also a "returns after 3 h at minute 25" bot case. No new purchase before 읍; every management tool unlocks at `f:rankEup`.
2. **One generic path per foundation:** one hit-test registry, one remote-pay method, one buy card, one objective-mode switch (`self` / `send` / `either`).
3. **No save-version bump for new state, but every build writes a content level `lv`.** `SAVE_VERSION` moves only on a structural change (v9 in v5.0). `lv` (43, 44, 45, 46, 50 …) lets an older build refuse a newer village instead of truncating it (F0s).
4. **Three review stops per version** (this answers "is per-version review requested?" — yes, always):
   - **Plan review** by 대표 (lead designer) before any code, always with two documents: a Korean 쉬운 계획서 and this version's build plan. The next version's plan review is held at the current version's mid-version preview, so the builder never idles.
   - **Mid-version designer preview** on the phone, in the separate preview app with its own village, never the Play village. v4.4 gets two: hand-over done (≈ day 15) and step C done (≈ day 30).
   - **Release review** before the Play upload: suite/gate results, phone shots, what changed vs plan.
   - No answer, no start; after a week without an answer the builder asks once more.
   - Plus two go/no-go meetings: the v4.4 hand-over A/B readout and the 시장 prototype readout.
5. **Hands-on stays optional, never required.** No objective that gates a bar needs the chief's body after 읍. The 촌장님 need is met remotely (card [인사]/[수다], a letter reply) or by the autopilot's greetings, as well as by 함께하기; its weight is ≤ 15/100. 함께하기 rewards are non-coin. Gates: a zero-joystick tap-bot fills the happiness bar by bot 100; payday of a send-only bot and a together-only bot differ by ≤ 3 %.
6. **Gentle by rule:** no penalties, nobody hurt; coins, buildings and items are never lost. Incidents keep the off switch (`v5_v8_plan.md` §8 settings `incidents`); the farewell scene has its own sub-gate, default off. Happiness never drops at a ceremony or on update.

## 3. Foundation pieces

| ID | Piece | Anchor (HEAD) | Needs | Ver | Planned d |
|---|---|---|---|---|---|
| F0 | Slice container `x` for the roadmap's own state: total ≈ 4 KB, per-key caps (mgmt 256 B, needs 1 KB, daily 512 B, rewards 512 B, book 1 KB, mail 512 B, log 512 B), trims oldest entries first, never throws. Pass-through keep-rules in v4.3's `sanitizeSave` for the top-level module slices the roadmap adds (`missions`, `geumbang`, `haul`, `demand`: copied verbatim when a plain object within its cap). Whole-save size gate | `sanitizeSave` builds a fresh object from known keys only (`Save.js:144`); unreadable/future saves are already copied aside (`Save.js:554-561`) | — | v4.3 | 1.75 |
| F0s | Content level `lv` written by every build; `Transfer.dryRun` returns `newerSave` when `lv > LV`; S1 write guard: compare `max(v, lv)`, keep the stored value byte-identical, no autosave, an "update first" card | today only `raw.v > SAVE_VERSION` is refused (`Transfer.js:193`); no `staleSave`/`onStale` exists in `src`; S1 was planned inside 금방 (`v44_plan.md` §3.1, B1) | F0 | v4.3 | 0.75 |
| R43 | Step-B remap keyed on structure: marker `v43.lay = 2`; idempotent `remap43()` + `keepPre43` copy + `check43` + failure card whenever the marker is missing, for v7 and v8 saves alike | `engineering_plan.md` §6 (`keepPre43` fires only for `raw.v === 7`, line 502) | F0 | v4.3 | 0.75 |
| TX | Texture task: area eviction of `props_buildings`/`bld_*`, split one 8–11 MiB v3 atlas; exit full-v4 GL total ≤ 445 MiB | `Residency.js`; texbudget2 (§4.1) | — | v4.3 | 1.25 |
| P1 | Opt-in play log v1 + export code (no network); compiled in, off and hidden behind a build flag in production | new; export like 마을 옮기기 (`MovePanel.js`) | F0 | v4.3 (cut → v4.4) | 1.75 |
| F1 | Tap-select: one depth-ordered hit-test (resident > pad > building > plot) | `UI.js` up-handler; taps reach `life.tap`; resident tap opens chat (`Game.js:307`) | — | v4.4 | 3 |
| F1o | Tap = open for every stand-to-open panel: office desk pad (`Office.js:455`), hall board pad (`TownHall.js:121`), bank 창구 pad (`BankBuilding42` `standT`), 솔방울 order board (`Growth.js:668`), `TrashPad`, `CashPads`; camera-anchored occlusion (`Occlusion.js:76, 103`) and cutaway reveal (`revealPx` 260, `balance.js:642-644`) in manage mode | 42 core files reference the player; the audit list goes to the v4.4 plan review | F1, F3 | v4.4 | 2.5 |
| F2 | Manage-mode camera: drag to pan, detached from the chief, clamped to open regions. Enabled in no build (preview included) before the full v3 atlas split lands | `Input.js:28-41` (any touch starts the joystick), camera follow `Game.js:337-339` | F1, TX + atlas split | v4.4 | 2.5 |
| F3 | Residency, overview and ambient sound follow the camera; fast-pan guard; area eviction (`v5_v8_plan.md` §9.1 lever) | `Residency.js:179`, `:468`; `Game.js:2097, 2123` | F2 | v4.4 | 3 |
| F4 | Remote pay/build: `UnlockPad.payRemote()`, `Site.openRemote()`, one buy card for ≈ 40 pads; porters still deliver items | `UnlockPad.js:222-287` (`pad.contains(player)`), `Site.js:326-342` | F1 | v4.4 | 3.5 |
| F5 | Hand-over: `x.mgmt`; ChiefPilot as persistent autopilot (today it switches off on reload, never pays); CameraDirector off only while the player pans or taps, 관망 tour resumes after 60 s idle; 직접 걷기 button; no manage-mode touch calls `onHuman` or starts the joystick | `ChiefPilot.js:14, 73`; `Input.js:13-14, 83`; `UI.js:131-154` | F0, F2 | v4.4 | 2.75 |
| F6 | Office fix buttons that act (open the buy card, send 알바, reopen) | `OfficePanel.js:156, 183-185`; `Office.js:382-394` | F4, C | v4.4 | 1.5 |
| F7 | Act-4 lessons (읍장 수업 1–4) with the sequenced ceremony and invitation; arrow and 길 안내 get a camera-pin mode; lesson gaps ≥ 3 min | `Onboarding.js`, `OnboardOverlay.js`, `Navigator.js` | F1–F5 | v4.4 | 2.75 |
| CU | Catch-up ceremony for saves already past 읍 (§4.2) | post-load step, `x.mgmt` absent and rank ≥ 2 | F5, F7, AB | v4.4 | 1.25 |
| C | Step C: ledger tab, toggles + drain + lend + pause-aware hints, labour office + `Jobs` slice + 알바 | `engineering_plan.md` §4.8–4.10, §12 | F0 | v4.4 | 8 |
| F12a | 세금 날 payday at game dawn replaces the capped tax box; no double count with 딸랑이's till rounds | `TownHall.js:79-95`; `V42.js:17-31`; `balance.js:395` (`day.length` 600, `startHour` 8) | F0 | v4.4 | 1.5 |
| AB | Hand-over A/B group (random per install, in `x.mgmt`), admin view of both; the group sets the default-mode timing only | admin mode (shipped 4.2.0.2) | F5 | v4.4 | 1 |
| T | Tap-playing bot (no joystick), act-4 bot; test hook `__FV.mgmt.force('walk'\|'manage')`, existing suites pinned to `walk`, new suites in both modes | `tools/test` pacing/econ bots; 84 of 132 suites reference the chief | F1, F4, F5 | v4.4 | 3 |
| F8 | kit-lite: GameFeed, IncomeMeter, Ports subset, ModuleHost, slice registry | new `src/kit` (`v44_plan.md` §5.2; `v5_v8_plan.md` §5.9) | F0 | v4.5 | 2.5 |
| F8b | Ports kit-lite leaves for v5 but missions needs: `people` (pick/pos/portrait/nearby/follow), `places`, `chief`, `orders`, `facts` over VillageLife + TownSim, plus UI host P12, hall board P13, feed patches P8–P11 | `v44_plan.md` §5.2 "Left for v5"; `missions_bank.md` §12.1–12.2 | F8 | v4.5 | 3.5 |
| J | "Deliver to resident" job for porters/알바 (fetch item → walk to resident): the `send` variant of the 25 deliver objectives | `Jobs` slice from C | C, F8b | v4.5 | 1.5 |
| F9 | Resident needs (4 now, 7 by v5.3) + need bubbles; bonuses only; named villagers + pets, settlers one aggregate row until households (v5.0); 촌장님 need met by card greeting/chat, letter reply, 함께하기 or autopilot greetings; a new need counts only after its first facility is built and ramps in | `v44_plan.md` §15; settlers are a count (`Civic.js:77`) | F8 | v4.5 | 3.25 |
| F10 | Resident card v1 (job, home, mood, needs, current activity, wish, hearts, friends), 따라가기, 함께하기 v1 (pilot ↔ joystick ↔ mini task hand-off) | `Game.js:307`; chat affinity `src/chat/village.js:108-127` | F1, F3, F5, F9 | v4.5 | 4.5 |
| F11 | Requests + square board + fame from `missions_bank` sub-gates; objective modes `self`/`send`/`either`; titles in v4.6 | ≈ 66 of ≈ 101 catalogue objectives need the chief's body (`src/missions/data/catalog.js`); sub-gates `v44_plan.md` D4 | F8b, J | v4.5 | 4.25 |
| F12b | Tax rate 낮게/보통/높게: low = settlers faster, high = bigger payday and settlers a bit slower; a neutral 「아껴 쓰는 중」 face, no grumpy faces | `TownHall.js`, `Civic.js:205-216` | F12a, F9 | v5.0 | 1.5 |
| F13 | Story host (worker + mirror), people registry, conflict cards, card v2 | `src/story` (`v5_v8_plan.md` §6.1, D4, D5) | full Ports, households | v5.1 | — (in v5.1) |
| F14 | Incidents via ScriptedSource; `sites.offer` becomes a remote offer; POLICE retargeted to a village 방범 초소 | `src/city/incidents/host.js:9-11, 64, 85-95`; `layout.js:22` | F4, F8, vehicles | v5.3 | — (in v5.3) |

**Dependency order:** F0 → {F0s, R43, P1} → F1 → {F2 (needs the atlas split) → F3, F4} → F1o → F5 → {F6 needs C, F7, AB, T} → CU → F8 → F8b → {F9, J} → {F10, F11} → F12b → F13 → F14. C can be built in parallel with F1–F4 once F0 lands; F12a needs only F0; TX lands before stage 4 in step B.

## 4. Versions

### 4.1 v4.3 「마을 새 단장」 = steps A + B (first internal/closed build)

- **Scope:** step B exactly as `engineering_plan.md` §3 (fixed plots, office ≈ 16 side goal, hall at village complete, 눈꽃 큰길, shop stage 4, ceremony at the hall, station cash by train, meat-can retune, migration complete with failure path) + F0 + F0s + R43 + TX + P1.
- **Changes to the v4.3 plan:**
  - Step C moves to v4.4 through its own cut line (`engineering_plan.md` §0, D13). **G3 and G7 stay in v4.3:** G3 (fresh25 + pacing bots, per-step income bands) checks step B's reorder (hall ≈ 22 min earlier and 1,200 cheaper, staff after 읍, station cash by train); G7 checks plaza draw calls and display objects with three shop lines and merchants, plus the 10-min soak. Only G7's "ledger open on 물건별" part moves to v4.4.
  - **Office staff (D3) is a step-B change, not today's behaviour.** Today 셈이 (500), 딸랑이 (900) and 소복이 (700) are hired before 읍 as soon as the office stands (`v42_office` after `b:town_hall`); only 총총이 (900) waits for rank ≥ 2 (`Office.js:4-5`, `:132-140`). Step B keeps today's hire pads and only hides them before 읍; after 읍 they show as today (no new pad work). Moving 딸랑이's till rounds after 읍 can slow 읍, so G2 gets an explicit 읍 ±5 % check of D3. In v4.4 the pads give way to the inauguration gift (CU for older villages).
  - **Labour plot:** `d_labour.after = 'f:rankEup'` (was `b:warehouse`, `engineering_plan.md` §4.5.1 line 326), plot hidden until v4.4 code exists, so v4.3 has no dead pad. `labour_office` stays in `BUILDINGS`/`UNIQ` (§6.3) so a v4.4 village survives a v4.3 load.
  - **One home for v4.3 state:** step B's own top-level `v43` block (`toggles`, `seen`, `refunds43`, plus `lay`). v4.3's `sanitizeSave` accepts `v43.toggles` booleans from day one, although nothing writes them until v4.4.
  - The office stays at ≈ 16 min as the 촌장 사무실 (ledger door, 관망 spot). D3-B (office at ≈ 45) stays rejected: it needs a new plot table and discards the hut work.
  - The walk-length targets (§4.6) still apply: play before 읍 stays hands-on.
- **Save:** `SAVE_VERSION` 8, `lv` 43.
  - `MIGRATE[7]` stays the v7 → v8 number step (`Save.js:134`, the meat-can pass-through that 4.2.0.x saves still need).
  - **Step-B remaps are keyed on structure (R43), not on the version number.** The working branch has written v8 since `977f02e` (4.2.0.1/4.2.0.2 at `e5b27fa`/`38c233c` write v7). The a1/a2 preview is a separate package that keeps its own village (`21e3ef4`), so it holds v8 step-A villages. A version-keyed `MIGRATE[7]` would skip them: `restoreV3` drops sites on missing plot ids, `sanitizeSave` drops buildings whose plot `only` no longer matches, and `check43`/the failure card never run. `remap43()` therefore runs whenever `v43.lay` is missing, for v7 and v8 alike. (Alternative considered: bump to 9 with `MIGRATE[8]` = remaps, making v5.0 v10. Rejected: it spends a structural bump on a layout pass the marker already handles.)
  - **Newer saves (F0s):** a v4.4–v4.6 village carries `x` keys, top-level slices and new building/plot kinds that a v4.3 build cannot keep. With `lv`, `Transfer.dryRun` refuses it (`newerSave`) and S1 keeps the stored value byte-identical. This is the same reason the meat-can bump exists (`Save.js:131-134`).
  - **Slices (F0):** `x` holds the roadmap's own small state (≈ 4 KB with per-key caps). Module slices stay top-level with pass-through keep-rules added to v4.3's `sanitizeSave` now (the v4.2 `bank`/`logistics` pattern): `missions` (v4.5), `geumbang`, `haul`, `demand` (v4.6).
- **Gates:** G1, G2 (+ the D3 읍 ±5 % check), G3, G4, G5 (minus the step C suites), G6, G7 (plaza draw calls, display objects, 10-min soak), G8 (`engineering_plan.md` §7.3), plus:
  - **4.2.0.2 fixtures** (none exist: `tools/test/fixtures` has v35/v41/v42 only, none carrying `onb`, `adminUses`/`adminInf` or the stage-1 stall): fresh after the tutorial, ≈ 25 min, ≈ 46 min with admin mode used. Added to `save_v43.mjs` and G8;
  - **a2 preview village fixture** (v8 step A, no marker): `remap43` runs once, a second load is a no-op, `check43` passes;
  - **newer-save refusal:** a v4.6-shaped code (`lv` 46, `x` + top-level slices + new building kinds) loaded into a v4.3 build is refused, not truncated; S1 leaves the stored value byte-identical;
  - **F0 fuzz:** random `x` payloads survive load → save byte-identical; an over-cap key is trimmed oldest-first with a warning, never the save; **whole-save size with every slice at its cap: warn at 16 KB, fail at 24 KB** (`v5_v8_plan.md` §8 budget);
  - **same-level pass-through:** `x` keys and keep-rule slices written by a later build of the same `lv`, or by a module that is switched off, survive load → save byte-identical;
  - re-measure and fix the step-A village-complete regression (21.2–24 min vs 20.2; G2 allows +1.0);
  - G1 decision is open (onboarding bot 15.9 s vs 15.75 s limit: waive, or move the grill pads);
  - P1: export code round trip; the APK boot test still reports no outbound request; a release test asserts P1 is off and hidden with the production flag.
- **Texture:** the hard gate is nearly full. "Full v4, GL total (textures + render targets) ≤ 455 MiB" measures 451.8–452.9 MiB on the latest runs (2026-11-06, scratchpad `v43/verify/final/texbudget2.json` peak 452.7 at "full v4 plaza +5s", `suitesA` 452.9; render targets 33.7), ≈ 2–3 MiB of room. v4.3 adds stage 4 and loads the hall page (`town_civic`, 2008×2004 ≈ 15.4 MiB RGBA) earlier. TX (≈ 1–1.5 d) therefore lands before stage 4: area eviction of `props_buildings`/`bld_*` and a split of one 8–11 MiB v3 atlas; exit full-v4 GL total ≤ 445. The soft targets stay missed (plaza 349–369 MiB vs 300; tour peak 416; title 157 vs 90). The full v3 atlas split starts in the art pipeline (parallel) and must land before F2 is enabled anywhere. **From here on every texture gate means GL total (textures + render targets) incl. transients ≤ 455 MiB.**
- **Effort:** 19–22 (planned 17.75: step B 9, gates incl. G3/G7 2, F0 1.75, F0s 0.75, R43 + a2 fixture 0.75, TX 1.25, 4.2.0.2 fixtures 0.5, P1 1.75).
- **Risks:** migration on 63 testers' villages and on preview villages (G8, R43, forced failures, the designer's village code, §13 Q4); G2 regression (staff after 읍); texture headroom; play-log policy (E5 before the closed track carries P1).
- **Cut line:** P1 → v4.4.
- **Review stops:** plan (this roadmap + `기획서_마을새단장.md` §11 remaining choices, the C move, P1 contents and survey notice); mid (preview); release.
- **Designer requests added 2026-11-07 (in flight before step B, outside the 19–22 days; preview v4.3.0-a3):**
  - Wheat field / bakery split: field with farmers, a 농막 and props; a separate bakery building with baker animation (knead, oven in/out), its own sales stall + clerk, wheat and bread porters with routes. Branch `local/v43-bakery`. Step B's plot table and the shop's stage-3/4 counters must be re-checked against it (bread leaves the central shop).
  - 관망 free pan: drag pans the camera during 관망, only the 관망 button ends it, a 「촌장님 보기」 chip re-attaches; residency follows the camera. Branch `local/v43-watchpan`. This is an early slice of F-pan for v4.4's 지도에서 돌보기.
  - Graphics presets 자동/고사양/중사양/저사양, auto-detect + one-step-down, perf overlay, old-WebView (Android 11 and older) compatibility and shell hardening. Branch `local/v43-perf`. The low preset's texture cut helps TX but does not replace it (the hard gate is measured on the default preset).
  - Goal status window (remaining main/side goals), tap a goal → the chief auto-walks there (reuses the pilot's routing; any joystick input cancels), clearer navigator line that ends exactly at the target pad. Branch `local/v43-goals`.

### 4.2 v4.4 「읍장 취임」 (읍장 1): the 읍 ceremony hands the village over

- **Scope:** F1, F1o, F2–F7, CU, C, F12a, AB, T, 읍장 title + name (`v44_plan.md` §9.1–9.2, now titled by stage; name asked at game start with [나중에] and again at the ceremony if still unset, question 20), 읍장 수업 1–4, hub shell (`Shell.js` brought forward per `logistics_plan.md` LD13).
- **Design changes:**
  - **Labour office unlocks at `f:rankEup`** (was after `b:warehouse`, ≈ 26 min, §4.9). Toggles follow it, so D8's rule holds (the warehouse exists long before 읍). Before 읍, 창고 crew and station porters keep their pads (§4.9 "before that their pads stay where they are").
  - **Ledger read access (D9)** stays: desk door from the hut, popBox made always visible from `zone_forest` (≈ 8 min), a one-time OnboardOverlay finger (`engineering_plan.md` §4.10). Listed as a deliberate pre-읍 change (read-only); its buttons act only after 읍. The name prompt at game start is the other one. Both re-run `onboarding.mjs`, G1 and 읍 ±5 %.
  - Toggles also open by tapping the building (F1).
  - **Office staff:** the four hires (셈이 500, 딸랑이 900, 소복이 700, 총총이 900; `Office.js:4`) arrive together at the ceremony as the inauguration gift. Lesson 1 needs 딸랑이 on day one. Post-읍 income re-baselined (E8).
  - Lesson 2's first remote build is the labour office (900 + 14 planks + 4 ingots).
  - **Stand-to-open audit (F1o):** every panel that opens only when the chief stands at it gets tap = open; occlusion and cutaway reveal anchor to the camera in manage mode. The audit list of entry points is attached to the v4.4 plan review.
- **Modes:** three ways to play: walk (joystick), manage (map), 관망 (watch).
  - **Ceremony sequence:** celebration → the four staff walk in → lesson 1. For group H lesson 1 ends with the invitation 「이제 지도에서 마을을 돌볼까요? [해 볼게요] [조금 더 걸을래요]」.
  - **Group H** ('경영 먼저'): manage becomes the default after lesson 2 or on [해 볼게요]. **Group O** ('걷기 먼저'): the same invitation inside the office; joystick default. The AB group changes the default timing, not a forced switch.
  - 직접 걷기 is always one tap. In manage mode the CameraDirector is off only while the player pans or taps; after 60 s without a touch 관망 starts with its camera tour. No manage-mode pan or tap calls `onHuman` or starts the joystick (today any village touch does: `Input.js:83`, `UI.js:131-154`).
  - The group and the mode live in `x.mgmt`.
- **Catch-up for villages already past 읍 (CU):** most 4.2 tester villages and the designer's are past 읍 (≈ 44 bot min) and would never see the v4.4 ceremony.
  - Post-load step for any rank ≥ 2 save without `x.mgmt`: after the 「새로워진 것」 card a short 취임식 plays once at the hall (no cost, bars untouched).
  - Unhired staff arrive free. Staff already bought are not refunded by default; each brings a thank-you letter (designer question 21; precedent D21).
  - Lessons 1–4 queue from that point. The AB group is assigned at that moment. P1 records 「취임식 다시 보기」 so "minutes after the ceremony" counts from it.
  - Suite: old 읍 save → replay once, staff = 4, no double gift, coins unchanged. Fixtures: `v41_save_smart_46min`, `v42_village_late`, the 4.2.0.2 ≈ 46-min fixture.
  - The readout splits into "fresh 읍" and "catch-up" cohorts.
- **Save:** `x.mgmt` (mode, pilot flag, AB group, lessons seen, catch-up flag, name/title), `v43.toggles`, `x.log`. `lv` 44. (`v44_plan.md` §6.2's 7 → 8 bump in v4.4 is obsolete.)
- **Gates:**
  - **Before 읍:** G1, G2, 읍 ±5 %, `onboarding.mjs` (ledger door + name prompt are the only pre-읍 changes); no new purchase before 읍.
  - **Suites:** tap-select at 360×640 and 412×915 over overlapping iso sprites; tap = open for every audited panel; gesture matrix (tap/drag/pinch/joystick) in both modes; a unit test that no manage-mode pan or tap fires `onHuman` or the joystick; 관망 resumes after 60 s idle; remote pay per pad kind + ghostcoins; reload in manage mode keeps the autopilot; 세금 날 rollover and single counting; catch-up suite; step C suites (ledger invariant vs ghostsweep census, pause-aware hints, G7 perf with the ledger open on 물건별).
  - **Test hook:** `__FV.mgmt.force('walk'|'manage')`; existing suites pinned to `walk`, new suites run both.
  - **Bots:** tap-bot reaches 읍 + 30 min with zero joystick; hand-over income ≥ 0.8 × walk-bot (expect 0.84–0.87); 10-min pan soak; act-4 bot finishes lessons 1–4 with gaps ≥ 3 min; re-baseline G3 and pacing after 읍 only.
- **Texture:** the full v3 atlas split (≈ −40 MiB, `v5_v8_plan.md` §9.1) is a precondition for enabling F2 in any build, the mid preview included. New UI on existing atlases; the labour office adds one page. Risk is churn while panning (`Residency.js:468` already records two districts piling up after long camera moves); F3 skips acquires during fast pans and evicts by area. Gate: the pan soak keeps GL total ≤ 455 incl. transients; soft: plaza `MiB` ≤ 340 after the split.
- **Effort:** 42–49 (planned 38.75: C 8, F1 3, F1o 2.5, F2 2.5, F3 3, F4 3.5, F5 2.75, F6 1.5, F7 2.75, T 3, F12a 1.5, AB 1, title/name 1.5, Shell 0.75, CU 1.25, pre-읍 re-runs 0.25). The longest stretch without a tester build; two mid previews (≈ day 15 after F1–F5, ≈ day 30 after C). The v4.5 plan review is held at the second one.
- **Risks:** the hand-over feels like losing control (invitation first, 직접 걷기 visible, 관망 kept); hit-testing overlapping sprites; two control schemes to test; pilot/joystick edge cases on reload; the 42 player-referencing files.
- **Cut line:** name entry → v4.5 (−1.5–2).
- **Readout (sets v4.5's default mode):** minutes after the ceremony, next-day return (relative H vs O only; no daily loop yet), voluntary joystick share, alerts acted on and time to act (office letters, fix prompts, lesson prompts, logged by P1; request cards arrive in v4.5); thresholds in §6. It lands 7–10 days after v4.4 ships, so v4.5 starts with mode-independent work (F8, F8b, F9, daily loop) and the default mode is a config value flipped after the readout.

### 4.3 v4.5 「주민의 부탁」 (읍장 2): public launch build

- **Scope:** F8, F8b, F9 (4 needs: 먹거리, 집, 즐길 거리, 촌장님), J, F10, F11, daily loop, attendance (`v44_plan.md` §13.1, days counted, nothing lost), away earnings (§13.3: 4 %, ≤ 3 h/day as a daily credit, shown as 셈이's 「장부 정리했어요」), 수첩 chapters over existing goals + the ch. 1–5 hands-on quests (question 19) + lesson replay, 읍장 수업 5–6, happiness → payday × ≤ 1.3 and settler speed, a scripted 청혼 scene (chat module, no story engine, reuses the wedding art; question 22), the 「도시의 꿈」 letter at the end of content, the bank-manager letter text (`기획서_v4_2_촌장.md:366` 「곧 저금과 대출 창구도 열 예정이에요」 → 「저금과 대출 창구는 서리시가 된 뒤에 열 거예요」).
- **Moved to v4.6 by default:** the weekly goal and fame titles.
- **Ports:** kit-lite leaves `people`, `places`, `town`, `roads`, `water`, `sites.offer` and residency for v5 (`v44_plan.md` §5.2). The missions module needs `people`, `places`, `chief`, `orders`, `facts`, `rewards`, `sites.offer`, UI host P12, hall board P13 and feed patches P8–P11/E1–E8 (`missions_bank.md` §12.1–12.2). F8b builds the first five over VillageLife + TownSim plus P8–P13.
- **Who has a card:** the 22 named villagers and pets. Settlers are a count (`Civic.js:77`, `Save.js:427`) until households arrive in v5.0; they show as one aggregate row. The card shows current activity, not a schedule (schedule needs the story people registry, v5.1).
- **촌장님 need:** met by the card's [인사]/[수다], a letter reply, any 함께하기, or the autopilot's greetings; no walking; weight ≤ 15/100. (`v44_plan.md:1388` required greeting each resident within 2 game days: a walking chore with 60+ residents. Dropped.)
- **Pre-읍 changes (deliberate):** attendance from day 1, away earnings after village complete, ch. 1–5 quests (guidance, small rewards). Re-run `onboarding.mjs`, G1, 읍 ±5 %, plus the "returns after 3 h at minute 25" bot case.
- **Daily loop:** 오늘의 부탁 × 3; 2–3 wishes accrue overnight and never decay; away earnings once per real day with a cap; 05:00 rollover; no push.
- **Rewards rule:** request pay (coins, fame) is identical for `send` and `together`. 함께하기 adds only affinity/hearts, a letter, a memory line (the 촌장님 need is met by the remote routes too). A test diffs the two reward tables.
- **Missions module:** board, bubbles and fame switch on through sub-gates (`v44_plan.md` D4, `v5Parts`); body-bound objectives get `send` variants (deliver → J) or become 함께하기 side stories that never gate a bar.
- **Save:** `missions` (top-level module format, 3 KB cap, keep-rule from v4.3), `x.needs`, `x.rewards`, `x.daily`. `lv` 45.
- **Gates:**
  - tax + rent ≥ 12 % of income at bot 90 (today ≈ 7 %; ≥ 20 % and payday as the largest source move to v5.0's balance pass), total income within ±10 % of the v4.4 walk-bot curve, no double counting with IncomeMeter;
  - payday of a send-only bot vs a together-only bot differs by ≤ 3 %; a zero-joystick tap-bot reaches the 도시 happiness threshold by bot 100 (re-checked in v4.6 with the final metric);
  - something new every ≤ 3 min from 45 to 80; content ends with the 「도시의 꿈」 letter (no date, no promise);
  - 30-day anti-softlock in manage mode; ≤ 2 bubbles on screen; needs ≤ 0.05 ms/tick with 60 residents; card fits 360×640; rollover tests;
  - pre-읍 re-runs listed above.
- **Texture:** small (icons); card portraits reuse existing character frames; the 청혼 scene reuses wedding art (measure its view).
- **Effort:** 34–40 (planned 31.75: F8 2.5, F8b 3.5, F9 3.25, F10 4.5, F11 4.25, J 1.5, daily 1.5, attendance 1, away 1.5, 수첩 + ch. 1–5 quests 2.5, payday link + light retune 1.5, 청혼 scene 1.25, letters 0.25, gates 2.75).
- **Risks:** too many cards on a portrait screen; 함께하기 control hand-off bugs; tax retune vs income bands; sub-gate leaks from `missions_bank`; port coverage over VillageLife/TownSim.
- **Cut line:** 청혼 scene → v4.6 (−1.25–1.5).
- **A/B:** 3 vs 5 requests a day. (The launch draft's "함께하기 plus a few coins" arm is dropped: it contradicts the emotional-rewards rule.) The card rows of the old v4.4 table (answer time, ignored cards) are read here.

### 4.4 v4.6 「읍내 장날」 (읍장 3)

- **Scope:**
  - **금방 G1** (`geumbang_plan.md` §2–3): patches G-P1…G-P17 re-anchored on the v4.5 tree (the build report checked 47 anchors against v4.2 files only; its Node tests: 47, 46 pass, 1 skipped until wiring, `geumbang_module.md:35, :37`). Its opening and upgrade pads go through F4; doorstep help is a 함께하기.
  - **G1b** (sled, lockers, 새벽배송): cut line.
  - **L1a remainder** on top of step C's `Jobs` slice: `HaulBoard` (§5.5), 자재창고 (§5.3), 이직 per slot + 알아서 배치 (§7), depot move (D20).
  - **L1b** (`logistics_plan.md` §6.2): D1 포장마차, D3 저녁 잔치, D4 난로, D5 용광로 3단.
  - 도감 (`v44_plan.md` §3.4), mailbox/보관함 (§14), the weekly goal, fame titles (they keep the 촌장 names: they are what residents call the chief).
  - **도시 bars** on a data-driven rank panel (`v5_v8_plan.md` P17): people 100 · fame 400 · happy residents (share of residents with every need ≥ 60 is ≥ 70 %, or happiness ≥ 85; the number is fixed with bots at the plan review, cared-for vs neglected village). No coin cost. When full: a 「시청 공사 시작」 scene (scaffold on the hall/시청 site using existing site art; exact spot at the plan review), a letter 「서리시가 되려면 시청이 다 지어져야 해요. 조금만 기다려 주세요!」 and a small decoration gift. The 24,000 cost and the ceremony arrive in v5.0.
- **Unlock change:** L1b consumers and 이직 switch on after 읍, not after village complete (`logistics_plan.md` §0).
- **Save:** `geumbang` (≤ 1,400 B, `geumbang_plan.md` §9), `haul` (≤ 768 B), `demand` (≤ 1 KB) (`logistics_plan.md` LD21), all top-level with v4.3's keep-rules; `x.book`, `x.mail`. `lv` 46.
- **Gates:** logistics G2 (share of time any raw pile is ≥ 90 % full: 93 % → ≤ 65 %, ≤ 50 % after 용광로 3단); G9 income bands (L1a Δ +3–10, L1b Δ +1–6, 용광로 Δ +5–12 points); 금방 gates re-run after L1a and after L1b (G16: `gb_drain`, income, stock, order waits); new-thing gap ≤ 3 min from 60 to 100; 도시 bars full at bot 98–106; a zero-joystick tap-bot fills the happiness bar by bot 100; after the bars fill, every day still offers requests, 도감 and 금방 work; 30-day manage-mode soak with toggles + 금방 orders, no softlock; whole-save size gate with every slice at its cap.
- **Texture:** 금방 pages (van, hub cutaway, nameplate; up to +16 MiB per view, `geumbang_plan.md` §11), `stall_eomuk`, depot cutaway. Gate: GL total ≤ 455 incl. transients in the station district and depot views with 금방 running.
- **Effort:** 33–38 (planned 30.25: 금방 G1 6, G1b 3, L1a remainder 7, L1b 5.5, 도감 2.5, mailbox 1.5, bars + 시청 공사 scene + letter 1.5, weekly goal + titles 1.25, gates 2). The overrun factor applies to all parts; the L1a/L1b figures include review and fix but not overrun.
- **Risks:** 금방 patches drift after v4.3–v4.5; the depot move vs step B plots; three new sources/sinks at once (income bands); station-district texture.
- **Cut line:** L1b + G1b → v4.6.1 (−9 to −10).

### 4.5 시장 prototype (before committing v5.0)

- **When:** after the v4.4 go/no-go; built during v4.5's 14-day closed window; shipped to testers only after v4.5's first 7 days of readout, so it does not confound the 3-vs-5 requests A/B or the launch decision.
- **Form:** an in-app 「시장 시험판」 sandbox in a closed-only build (4.5.0.x with the prototype build flag on), opened from 설정 › 놀이. Separate storage keys (`frostVillage.proto.*`) that never touch `SAVE_KEY` and are excluded from Transfer; it starts from a bundled 읍 save. Production gets the flag-off v4.5 binary that was closed-tested. Prototype code is kept apart and reused in v5.0 only if it passes review. (Alternative not chosen: sideloading the preview package to testers; a big ask and a second app.)
- **Scope:** 4 needs (건강, 배움, 안심, 즐길 거리); 4 facilities with existing art (clinic, school, watch house on the police art, rink or stage); need bubbles + coverage overlay; 6 conflict cards; 세금 날 + rate; the v4.4 fix buttons; the same play log and survey.
- **Tests:** prototype saves never touch the main slot (and the main slot never loads a prototype key); a release test asserts the flag is off in the production build.
- **Effort:** 10–13 (the sandbox, keys, flag and tests add ≈ 1 d to the old 9–12).
- **Commit v5.0 as planned if:** ≥ 70 % of testers play ≥ 20 min; 「키우는 느낌」 ≥ 4; ≥ 70 % of cards answered; ≥ 60 % of need bubbles met by the right facility within 5 min.
- **Plan changes on other results:** > 50 % cards ignored or 「바쁨」 ≥ 4 → v5.1's conflicts become ≤ 1 story scene a day. Need-to-facility link unclear → overlay first, start with 2 needs. Everyone picks one rate → drop the rate, keep 세금 날. Joystick > 60 % or play time drops → 시장 stays light; effort moves to 함께하기 and districts. Low-end phones miss budgets → the story engine (v5.1) waits; scripted scenes only.

### 4.6 v5.0 「시장 취임」 (도시 at ≈ 100)

- **Scope:** full Ports + ModuleHost (`v5_v8_plan.md` §11.2 kit patches); settlers become households (v9); clinic + school + apartments on the v5 XL plots (`v5_v8_plan.md` D9, §4.2); needs 건강/배움 + coverage overlay; F12b; rank 3 ceremony (P17) with the 시장 title (residents keep saying 촌장님, `기획서_v5_v8_개발계획.md:33`), 시청 completion for 24,000 coins and a scripted wedding of the v4.5 couple as its first event (question 22); settler households get cards; balance pass (tax per person, rent cap and rate, payday multiplier, selected sale prices; re-run pacing/econ bots and G3 bands); policy window only if question 10 = B (+3–4 d, not in the range).
- **New-need rule:** a new need counts toward happiness only after its first facility is built, and ramps in over a few game days; before that it shows only as a 「새 소원」. (Counting from when its plot opens would still drop happiness at the ceremony, which opens the plots.)
- **Not in v5.0:** story host, life beats, conflict cards, card v2 (v5.1); asphalt and buses (v5.2); library (no art).
- **Before starting:** re-check every module layout against the plots v4.2 and v4.3 B moved (`v5_v8_plan.md` §4.6 checker); a bottom-up per-patch estimate at the plan review.
- **Rank 3 bars:** `v5_v8_plan.md` §3.2 uses bus riders 120/day, which needs v5.2. Now: people 100 · fame 400 · happy residents (v4.6 bars) + 24,000 coins (designer question 8). This reverses "happiness leaves the bars" (v4 finding 8) because needs now drive it, and replaces a mean-happiness 70 % that would pass almost by itself (`v44_plan.md` §15.2: a new village with food and homes sits at 65–75, floors keep a neglected one near 45; M7, §15.3). Loans do not exist yet (v5.2), so the coin bar must not stall a full-bar village.
- **Save:** **v9.** Settlers become households, XL plots. `MIGRATE[8]` is structural and uses the v4.3 pattern (pre-v9 copy, check, card, no autosave). This is the first migration that reaches public players. `lv` 50.
- **Gates:** 도시 at bot 98–106; after the bars fill, 24,000 coins within ≤ 3 bot min (else lower the cost); happiness never drops at a ceremony or on update (fixture: full v4.6 bars → load in v5.0 → bars still full); tax + rent ≥ 20 % and payday the largest single income by bot 150 (number set with bots at plan review); steady GL total ≤ 415 in the ceremony view and the wedding transient ≤ +40 MiB for ≤ 60 s (total ≤ 455); v5 plaza `MiB` ≤ 340 steady; v9 fixtures incl. forced failure; whole-save size gate (E11).
- **Effort:** 34–40 (planned ≈ 31.75: the critique's split estimate of ≈ 28 planned for kit + households/v9 + facilities/needs/tax rate + rank 3, plus the scripted wedding 1, the balance pass 2.5, the no-drop fixture 0.25). Rescoped after the prototype.
- **Risks:** layouts vs moved plots; v9 on public saves; balance pass vs income bands; save size at caps.

### 4.7 v5.1 「주민의 일생」

- **Scope:** F13 story host (worker + mirror) and people registry over households; life beats (`v5_v8_plan.md` phase P2: baby → first school day → elders' three wishes → farewell), newspaper, memorial garden; conflict cards with no penalty option; resident card v2 (relationships, family, age, today's schedule); remaining story missions.
- **Farewell (하늘나라 여행):** its own sub-gate (setting 「생애 이벤트」, default off) so v5.1 can ship with it off; the designer previews it first (`기획서_v5_v8_개발계획.md:444`); designer question 23 (recommend: in v5.1, off by default).
- **Save:** story side key (pack15, ≤ 450 K chars; `v5_v8_plan.md` §8). `lv` 51.
- **Gates:** story ≤ 0.1 ms on the main thread, 0 long tasks; side save ≤ 450 K after a 30-day fast-forward; no conflict-card option lowers any stat; farewell off → never fires in a 30-day run; re-run the content-rating questionnaire (conflict cards, farewell).
- **Effort:** 20–28 (±40 %).
- **Risks:** story worker on low-end phones (desktop p99 6.8 ms, ≈ 3–4× on a phone); tone of the farewell.

### 4.8 v5.2 「탈것의 시대」

- **Scope:** vehicles era 2 → 3 (sleigh bus, steam wagon, dog sled, cargo sleigh → retro bus, trucks, cars), 서리 큰길, stops, freight yard, asphalt wipe; chief driving as optional 함께하기 (same coins as sending a driver, stars give badges only; the 12 driving objectives get `send` variants); bank deposit + construction loans through remote offers (`v5_v8_plan.md` P28), covering up to half of the v8 큰 도시 ceremony (the 도시 ceremony is v5.0, before loans); 금방 G2 (vans move to `VehicleSim`, `geumbang_plan.md` §2).
- **Gates:** vehicles ≤ 0.15 ms; ≤ 8 vehicle texture keys; vehicle suites; station district GL total ≤ 455 at 도시 (vehicles are 140 MiB source-sum: 4 colourways per page).
- **Save:** `vehicles` (1.5 KB), `bank` (existing top-level slice). `lv` 52. **Effort:** 18–24 (±40 %).

### 4.9 v5.3 「안심 마을」

- **Why after vehicles:** the incidents module depends on v5.2 and v8 content. Theft's `station`/`release` phases target `POLICE` = new-town `c_police` (`incidents/host.js:64`, `layout.js:22`), and the new town is v8's world. The crime and fire scenes load `veh_police_car`/`veh_fire_truck` (the v5.2 vehicles fragment) and listen for `veh:dispatch` (`host.js:112`). They use cityfolk pages, whose merge is a v8 phase in `v5_v8_plan.md` §11.2. `drillFirst: true` blocks fire until mission C14 is done (`tuning.js:21`).
- **Scope:** F14 (ScriptedSource first); `POLICE` retargeted to a village 방범 초소 placement on the police art; the cityfolk merge pulled forward from v8; hydrants (400, −5 % each, ≤ −40 %); small incidents (theft → cocoa at the 방범 초소 → apology, queue-jumping, broken window, scuffle → handshake), with the police car from v5.2; a rare chimney scare answered by a walk-in volunteer crew with the hydrant hose (fire truck and fire station stay v8), scorched house rebuilt nicer; 「찾습니다」 posters on the 방범 초소 board → resident tips → fame; C14 handled by a first scripted drill scene (or a `send` variant); the 안심 need (counts after the first facility); the off switch.
- **Rates:** module tuning (small ≈ 0.8 per game day, ≈ every 12 min; fire ≈ 1 per 20 game days), `src/city/incidents/tuning.js:11-21`.
- **Gates:** incident views steady GL total ≤ 380 (the scripts' own ART tables sum to 74.5 MiB crime and 72.2 MiB fire, `src/city/incidents/model/scripts.js:36-50`), transient ≤ +75 for ≤ 90 s, total ≤ 455; off switch → zero incidents in a 30-day run; nobody-hurt invariants (module tests); re-run the content-rating questionnaire (`console_answers_ko.md` ⑧ excluded the dormant modules; expected rating today is all ages, line 59).
- **Save:** `incidents` slice. `lv` 53. **Effort:** 14–18 (the old 10–13 plus ≈ 3.5 planned for the POLICE retarget, the cityfolk merge and C14 handling, with overrun).

### 4.10 v6 갈매기 항구 · v7 햇살 해변 · v8 살아 있는 도시

- **Content:** as `v5_v8_plan.md` §2, §4.3–4.5, §6.4–6.7, §11.2. Each district brings residents with needs; every module offer becomes a remote offer with `send` variants.
- **v8 specifics:** police station (15,000; theft's `station` phase may move there), fire station levels and the fire truck, full fire → ruin → demolition → rebuild, moving trucks, logistics centre, rank 4 bars (people 220 · deliveries 150/day · 안심 90 % · fame 900; 120,000, half loanable).
- **Ladder (re-measure):** harbour ≈ 150–200, beach ≈ 200–245, 큰 도시 ≈ 300 bot min (was ≤ 152 / ≤ 215 / 260–275 in §3.1).
- **Save:** bump only on a structural change (v6's world growth is the likely one; decided at its plan review, E7).
- **Review stops:** each version's plan review covers that district's plan, whether the save changes, and one 함께하기.
- **Effort:** v6 25–35, v7 20–28, v8 30–40 (±40 %).

## 5. Saves across the roadmap

| Ver | `SAVE_VERSION` | `lv` | New state | How |
|---|---|---|---|---|
| v4.3 | 8 | 43 | plot remaps (`v43.lay` = 2), office/hall, stage 4, `v43` block (toggles accepted), `x` container, keep-rules for `missions`/`geumbang`/`haul`/`demand` | `remap43` for v7 and v8 + failure path; `MIGRATE[7]` stays the number step |
| v4.4 | 8 | 44 | `x.mgmt`, `v43.toggles`, `x.log` | slices |
| v4.5 | 8 | 45 | `missions` (top-level), `x.needs`, `x.rewards`, `x.daily` | slices |
| v4.6 | 8 | 46 | `geumbang`, `haul`, `demand` (top-level), `x.book`, `x.mail` | slices |
| v5.0 | 9 | 50 | households, XL plots | `MIGRATE[8]` + failure path |
| v5.1 | 9 | 51 | story side key | side key |
| v5.2 | 9 | 52 | `vehicles`, `bank` | slices |
| v5.3 | 9 | 53 | `incidents` | slice |
| v6–v8 | 9 → 10 only if structural | 60 / 70 / 80 | `harbor`, `beach`, `logistics` | slices |

- **Size budget:** the 24 KB ceiling is v4's 5.7 KB + 14.6 KB of module slice caps + headroom (`v5_v8_plan.md` §8). The main save is already ≈ 6–9.4 KB. At caps through v4.6: main ≈ 9.4 + `missions` 3 + `geumbang` 1.4 + `haul` 0.75 + `demand` 1 + `x` ≈ 4.3 + existing `bank`/`logistics` ≈ 20–21 KB: under the 24 KB fail line, over the 16 KB warning. v5.0+ (households, vehicles, incidents) needs its own budget (E11).
- Superseded: `v5_v8_plan.md` §8's chain 6 → 7 → 8 → 9 → 10 and `v44_plan.md` §6.2 (7 → 8 in v4.4).

## 6. Validation infrastructure

- **Play log (P1):** off by default. Records days since install (no dates), session minutes, stage reached, ceremony (incl. 「취임식 다시 보기」), joystick vs map time, alerts and cards shown/acted on/ignored and seconds to act, 함께하기 starts, migration result. Never: chat text, names, device IDs. Exported as a text code the tester pastes into the survey; the app sends nothing. Compiled into every build, off and hidden behind a build flag in production, with a release test asserting it is off, so the closed-tested binary equals the production binary.
- **Data safety:** Play's Data safety form is one per app, not per track, so a "declare during closed, revert for production" plan cannot overlap a production rollout. Treat P1 like 마을 옮기기: the app transmits nothing (`console_answers_ko.md` §7: 수집 = the app sends data off the phone), and the survey's own notice covers what testers paste. The form stays 「수집 안 함」. Confirm against the Play help page (E5) before v4.3 goes to closed; add a privacy-policy line only if that check asks for one.
- **Survey:** same 3 questions per build (키우는 느낌, 다음 할 일, 지루함↔바쁨 target 3), one comment box, testers 14+, no emails, a notice at the top describing what the pasted code contains.
- **v4.4 hand-over go/no-go (H = '경영 먼저' vs O = '걷기 먼저'):**

| Metric | Go | Rethink |
|---|---|---|
| Minutes after the ceremony | H ≥ 0.9 × O, median ≥ 25 | H < 0.75 × O |
| Next-day return | H ≥ O (relative only; the ≥ 40 % absolute target moves to v4.5) | H ≥ 10 points below O |
| Voluntary joystick after hand-over | 10–50 % | > 60 % → hands-on default, management optional |
| Joystick < 5 % with fewer minutes | — | hands-on fun lost → bring 함께하기 forward, management optional |
| Alerts acted on (office letters, fix prompts, lesson prompts) | ≥ 70 %, median time to act ≤ 60 s | < 50 % or > 3 min → fewer or clearer alerts |
| 「다음 할 일」 | ≥ 3.5 | ≤ 2.5 → more lessons |
| Migration failures | 0 | any → release blocked |

- Thresholds are fixed before any log is read. Each arm has ≈ 10–17 active testers, so a difference of one or two testers counts as equal; results are directional. "Fresh 읍" and "catch-up" cohorts are read separately.
- **v4.5 readout:** next-day return ≥ 40 %; card answer time (median ≤ 60 s, rethink > 3 min); ignored cards (≤ 30 %, rethink > 50 % → fewer cards); 3 vs 5 requests; first-day total minutes median ≥ 60 (launch gate).

## 7. Release sequence and timing

1. Now: 4.2.0.2 to review; run the 12-tester/14-day clock on it; apply for production access when eligible; publish nothing yet.
2. v4.3: internal → designer phone → closed (testers open old villages).
3. v4.4: two mid previews → internal → closed 7–10 days with A/B → go/no-go. The v4.5 plan review happens at v4.4's second mid preview.
4. v4.5: build (mode-independent work first) → internal → closed 14 days; day 7 readout; then the closed-only 4.5.0.x build with the prototype flag on → launch checklist (listing ko/en with the 관망 line kept plus 「읍이 되면 지도에서 손가락 하나로 마을을 돌봐요」, screenshots 01/06 + title stall replaced, new shots of 취임식/map build/resident card, data safety still 「수집 안 함」, rating, countries) → production with the flag-off binary.
5. v4.6 next; prototype readout → v5.0 plan review.
6. After launch: internal → closed ≥ 7 days (≥ 14 for v9) → production.

Launch candidate: 95–111 builder-days + ≈ 3–5 weeks of tester windows not fully overlapped. Calendar in §0.

## 8. Old plan docs → new status

| Doc § | Item | Status | Where now |
|---|---|---|---|
| `redesign_v43/engineering_plan.md` §3 step B | districts, migration | kept, changed (remap keyed on `v43.lay`, not on v7) | v4.3 |
| same §3 step C, §4.8–4.10 | ledger, toggles, labour office | moved, changed (labour office at `f:rankEup`) | v4.4 |
| same §4.5.1 (line 326) | `d_labour` after `b:warehouse` | changed | `after = 'f:rankEup'`, plot hidden in v4.3 |
| same §6.3 | `BUILDINGS`/`UNIQ` += `labour_office`; top-level `v43` block | kept | v4.3 (so v4.4 villages survive a v4.3 load); `v43.toggles` accepted from v4.3 |
| same §7.3 | G3, G7 as step C exits | changed | G3 and G7 stay in v4.3; only "ledger open on 물건별" → v4.4 |
| same §1.2 | renumbering 금방 → v4.3.1 etc. | superseded | §1 here |
| same D3 | office ≈ 16; staff after 읍 | kept (step-B change from today) | v4.3 (+ G2 읍 ±5 % check) / gift v4.4 |
| same D8, D9 | toggles with labour office; ledger doors | kept | v4.4 (D9 listed as a deliberate pre-읍 change) |
| same D20 | depot move | moved | v4.6 (with L1a + 금방) |
| same D21 | no refund, thank-you letter | precedent | catch-up staff (question 21) |
| `v44_plan.md` §3.1, `기획서_금방마켓.md`, `geumbang_plan*.md` §2 | 금방 = v4.3 | moved | G1 v4.6, G1b v4.6/4.6.1, G2 v5.2, G3 v8 |
| `v44_plan.md` §3.1 (B1) | S1 newer-save guard inside 금방 | moved | built in v4.3 (F0s) with `lv` |
| `v44_plan.md` §3.1b, `기획서_v4_4_촌장성장.md` §1–3 | 시험 도구 v4.3.1 | split | admin shipped 4.2.0.2; name/settings → v4.4 (name also at game start); 저장 코드 → covered by 마을 옮기기 (4.2.0) |
| `v44_plan.md` §5.2 | kit-lite in v4.4 | moved | v4.5 (F8) + F8b ports |
| `v44_plan.md` §6.2 | save 7 → 8 in v4.4 | dropped | slices + `lv` (§5) |
| `v44_plan.md` §9, `기획서_v4_4_촌장성장.md` §4 (`:236`) | chief XP/levels; "XP only for the chief's own actions" (`v44_plan.md:754`) | dropped | progress = people, needs met, thanks; question 10 |
| `v44_plan.md` §9.2 | title by rank | changed | 촌장 → 읍장 (v4.4) → 시장 (v5.0); residents say 촌장님 |
| `v44_plan.md` §10, `기획서_v4_4_촌장성장.md` §5 | skills, Lv ring | open | question 10 (recommend 정책 창: points from ceremonies, fame, thank-you letters; 뚝딱 건축/알뜰 건축/설득력/인기도; v4.6 or v5.0, 3–4 d) |
| `v44_plan.md` §11, `기획서_v4_4_촌장성장.md` §6 | 68 quests (v4.4.1) | changed | 수첩 chapters over existing goals (v4.5); ch. 1–5 hands-on quests kept (question 19); no quest XP; ch. 6–7 → 읍장 수업, 8–11 → 시장 story chapters |
| `v44_plan.md` §12 | daily/weekly/monthly | changed | 3 daily requests (v4.5); weekly (v4.6); monthly after launch (question 18) |
| `v44_plan.md` §13.1 / §13.2 / §13.3 | attendance / play-time gifts / offline | kept / replaced by attendance (question 17) / kept | v4.5 / — / v4.5 (deliberate pre-읍 changes) |
| `v44_plan.md` §14 | mailbox, storage, coupons | moved | mailbox + storage v4.6; coupons after launch |
| `v44_plan.md` §15, `기획서_v4_4_촌장성장.md` §10.1 | per-resident happiness (v4.6) | moved earlier, split | 4 needs v4.5; +건강/배움 v5.0; +안심 v5.3; new needs count after their first facility |
| `v44_plan.md:1388` | greet each resident within 2 game days | dropped | remote 촌장님 need (card, letter, 함께하기, autopilot) |
| `v44_plan.md` §16 | 지역 자원 + 해결하러 가기 | changed | hub 현황 with acting buttons (v4.4) |
| `v44_plan.md` §3.4 | 도감 / 업적 / 사진 모드 | kept / later / later | 도감 v4.6 |
| `v44_plan.md` §17, `기획서_v4_4_촌장성장.md` §11 | login, cloud save | kept separate | not a launch blocker |
| `기획서_v4_2_촌장.md:366` | bank manager 「곧 저금과 대출 창구도 열 예정이에요」 | changed | v4.5 text 「저금과 대출 창구는 서리시가 된 뒤에 열 거예요」 |
| `store/listing_ko.md:59` | 관망 line | kept | + 「읍이 되면 지도에서 손가락 하나로 마을을 돌봐요」 |
| `v5_v8_plan.md` §2 (v5 row) | v5 contents | split | requests/board/fame v4.5; welfare/rank 3 v5.0; story/life/conflicts v5.1; vehicles/bank v5.2; safety v5.3 |
| `기획서_v5_v8_개발계획.md` §3 (49–84 min) | 청혼 → 결혼 → 아기 after 읍 | changed | 청혼 v4.5 (scripted); wedding at the v5.0 ceremony; baby/school v5.1 (question 22) |
| `기획서_v5_v8_개발계획.md:105, :444` | 하늘나라 여행 (switch), preview first | kept | v5.1 sub-gate, default off (question 23) |
| `기획서_v5_v8_개발계획.md:131-135` | fame titles 믿음직한 촌장 … | kept | v4.6, names unchanged |
| `v5_v8_plan.md` §3.1 | ladder | changed | 도시 ≈ 100 kept; harbour/beach/큰 도시 later (§4.10) |
| `v5_v8_plan.md` §3.2 | rank 3 bars | changed | question 8 (bars v4.6, coins v5.0) |
| `v5_v8_plan.md` §8 | save chain | superseded | §5 here |
| `v5_v8_plan.md` §9.1 | texture levers | pulled forward | TX in v4.3, atlas split before F2 |
| `v5_v8_plan.md` §11.2 | cityfolk merge (v8 phase) | moved | v5.3 |
| `v5_v8_plan.md` D14 | incidents v8 only | split | small incidents + safety v5.3; police station/fire/moving v8 |
| `기획서_v5_생활과미션.md` §1–4 | vehicles, missions, life, facilities | redistributed | v5.2; v4.5 + v5.0; v5.1; v5.0 |
| `기획서_v6_항구도시.md`, `기획서_v7_해변.md`, `기획서_v8_살아있는도시.md` | districts | kept | v6–v8, via the same tools; wanted posters → 「찾습니다」 at the 방범 초소 (v5.3) |
| `logistics_plan.md` §0, `기획서_물류수요개편.md` §4.2 | L1a + L1b = v4.3.2 | split | Jobs/알바/현황/hub shell v4.4 (step C); board/자재창고/이직/depot v4.6; L1b v4.6 (cut → v4.6.1); "after village complete" → "after 읍" |
| `기획서_마을새단장.md` §7–9 | toggles, 인력 사무소, 장부 | moved | v4.4 (labour office at 읍) |
| `store/플레이스토어_진행상황.md`, `store/console_answers_ko.md` | Play steps, data safety, rating | kept; updated per §6–7 | data safety stays 「수집 안 함」 (E5) |

## 9. Conflicts between the three drafts, resolved

1. **Numbering:** player draft had one v5 and a v4.6; engineering draft had no v4.6 and a v5.1. → v4.6 kept; v5 split into v5.0–v5.3 (question 24).
2. **Names:** 「읍장 취임」 and 「주민의 부탁」 (player) over 「사무실이 일해요」 and 「주민의 목소리」 (engineering).
3. **금방:** v4.6 (player) vs after v5.1 (engineering). The DECISION text lists geumbang among mayor-stage content. → v4.6, because it was designed to open after 읍 + warehouse, is built, shares the depot work with L1a, and fills minutes 80–100. Designer question 7.
4. **Labour office:** building at ≈ 26 with buttons at 읍 (player) vs unlock at 읍 (engineering). → at 읍; principle 1.
5. **Ledger access:** office ≈ 16 (player) vs forest (engineering). → D9 unchanged (desk door from the hut, popBox from the forest), listed as a deliberate read-only pre-읍 change.
6. **세금 날:** v4.4 (player) vs v4.5 (engineering) → v4.4 (F12a), at game dawn. **Tax rate:** v4.5 (engineering) vs v5 (player, DECISION) → v5.0 (F12b), checked in the prototype.
7. **Resident card + 따라가기:** v4.4 (player) vs v4.5 (engineering) → v4.5, built once with needs and wishes; v4.4 is already the largest version.
8. **Play log:** v4.3 (launch) vs v4.4 (engineering) → v4.3 as a cut-line item; it is the only way to log migration results on testers' villages.
9. **함께하기 coin arm in the v4.5 A/B** (launch) → dropped (emotional-rewards rule). A/B is 3 vs 5 requests.
10. **Safety:** v6 (player) vs v5.1 (engineering) → v5.3, after vehicles, because the incidents module needs the police car (v5.2), the cityfolk merge and a village POLICE placement (§4.9); police station, fire truck and full fire stay v8.
11. **Bank loans / vehicles:** v5 (player) vs "after v5.1" (engineering) → v5.2. Loans serve the v8 ceremony; the v5.0 ceremony is gated on coins without a loan (≤ 3 bot min after full bars).
12. **Tax share target:** v4.5 gate ≥ 20 % at 90 (engineering) vs a v5 target (player) → staged: v4.5 ≥ 12 % with total income ±10 %; v5.0 ≥ 20 % and payday the largest source by 150, after a balance pass.
13. **Rating:** launch draft said "stays 13+". The content rating is expected all ages (`console_answers_ko.md:59`); 13+ is the target-audience setting (`:67`). Re-run the questionnaire when conflict cards, the farewell or incidents ship.
14. **Effort:** engineering draft's 108–132 to 시장 + safety left out v4.6, the prototype, 세금 날, A/B, title, attendance and away earnings; the critique added more (§0) → 224–272.

## 10. Open questions

**For the designer (Korean doc "대표님이 정해 주실 것", same numbering; ★ = recommendation):**
1 numbering (★ yes); 2 step C → v4.4 (★ yes); 3 labour office at 읍 (★ yes); 4 hand-over via A/B (★ yes); 5 launch at (A★) v4.5 or (B) v4.4 with v4.5 as first update (≈ 7–8 weeks sooner, no next-day reason); 6 Play clock now, apply early (★ yes); 7 금방 in v4.6 (★); 8 rank-3 bars: people 100 · fame 400 · happy residents 70 % in v4.6, 24,000 coins in v5.0 (★ yes); 9 함께하기 non-coin rewards (★ yes); 10 skill window: (A) none, (B★) 읍장·시장 정책 창, (C) chief levels for 0–45 then policies; 11 prototype before v5.0 (★ yes); 12 tax rate in 시장 (★ yes); 13 small incidents in v5.3 (★ yes); 14 opt-in play log, data safety stays 「수집 안 함」 (★ yes); 15 office staff as the inauguration gift (★ yes); 16 library art later (★); 17 drop play-time gifts, attendance instead (★ yes); 18 monthly stamp board after launch (★ yes); 19 keep the ch. 1–5 hands-on quests (★ yes); 20 name at game start with [나중에] and again at the ceremony (★ yes); 21 refund staff bought before v4.4: (A★) no, thank-you letter (D21) or (B) refund; 22 marriage/baby: (A) all after 도시, (B★) scripted 청혼 in v4.5, wedding at the v5.0 ceremony, baby/school v5.1, (C) right after 읍 as before; 23 farewell: (A★) v5.1, off by default, preview first, (B) v8, (C) cut; 24 split v5 into v5.0–v5.3 with safety after vehicles (★ yes).

**Engineering:**
- E1. Slice homes: **resolved.** `x` (≈ 4 KB, per-key caps) for the roadmap's own small state; module slices top-level with keep-rules added to v4.3's `sanitizeSave` now; `lv` refusal for everything an older build cannot keep.
- E2. Preview storage: **closed.** The preview is a separate package with its own village (`21e3ef4`); its saves are v8 step-A and need the remap (R43, a2 fixture).
- E3. G1: waive 15.9 s vs 15.75 s, or move the grill pads.
- E4. Step-A village-complete regression: re-measure on the current tree before step B tuning.
- E5. Play data-safety wording for codes that testers paste by hand: confirm "not collected" before v4.3 goes to closed.
- E6. Production access: any deadline to publish after approval?
- E7. Does v6's world growth need a save bump?
- E8. Post-읍 balance with the four office staff free at the ceremony and the payday multiplier.
- E9. 함께하기 "play as the resident" (v6+): scope and controls.
- E10. Payday time of day: with `day.length` 600 s and `startHour` 8 (`balance.js:395`), game dawns fall near bot 49 and 59 if the clock never pauses; lesson 4 then waits for the ≈ 59 payday. Measure with the act-4 bot (ceremony pauses may shift it).
- E11. v5.0+ save budget: households, vehicles and incidents at caps push past 24 KB; decide at the v5.0 plan review (side keys like story, or a measured higher ceiling).
- E12. Play track mechanics for the closed-only 4.5.0.x prototype build (version codes; production promoted from the flag-off binary while closed testers stay on the higher code).
- E13. Where the 「시청 공사 시작」 scaffold stands (hall vs a 시청 site) and which site art it reuses.

## 11. Not verified

- Human minutes (× 1.3–1.5) and the step-A village-complete regression were not re-measured; no bots or browsers were run for this plan.
- Texture figures come from the 2026-11-06 runs in the scratchpad (`v43/verify/final`), not from a fresh measurement.
- Lesson and payday minutes are derived from `day.length`/`startHour`, not from a bot run (E10).
- 금방's 47 patch anchors were checked against v4.2 files, not against HEAD.
- Play policy points in §6–7 (data safety per app, track mechanics) come from judgement, not today's help pages (E5, E12).
- v5.0 effort is the critique's split estimate plus additions; v5.1–v8 effort has no prior estimate in the plan docs; ranges are rough.
