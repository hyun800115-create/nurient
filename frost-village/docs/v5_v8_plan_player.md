# v5–v8 plan, player and designer first: "the village becomes a city, and the people in it live whole lives"

Author role: design proposal for the LATER versions (v5 story life + missions + bank + vehicles, v6 harbour, v7 beach, v8 living city), written from the player's and the designer's side. No code was written and no existing file was changed; this file is the only output. Scratch checks (read-only scripts) live in `scratchpad/later_player/`.

Inputs read: `docs/기획서*.md` (v1–v8, 주민기획, 주민수다, 마을말, 타이틀), `docs/CONTRACT_V5.md … CONTRACT_V8.md`, `docs/v4_plan.md` (binding), `docs/v4_plan_player.md`, `docs/v4_plan_tech.md`, every report in `docs/build_reports/` (vehicles, roads_ui, life2, townfolk2, ships, harbor, beach, beach_bld, beachfolk, water, logistics, civic, cityfolk, fx_city, story, chat, voice, audio3–6, v4_build, v4_buildB, v4_build_C1, v4_build_C2, the three v4 reviews), `docs/story_samples.md`, and the current code (`src/data/{balance,world,strings}.js`, `src/systems/{Civic,Growth,Rank,Neighbours,TownSim}.js`, `src/scenes/UIv4.js`, `src/core/Save.js`, `tools/story/src/*`).

Status: **proposal**. Every system below is meant to be built as a standalone module first (§14) and wired into the game only after v4 ships. Numbers are starting points for the bots (§17), the same way v4's were.

---

## 0. TL;DR

1. **One spine for four versions.** After 읍 (v4, ≈ 49 min) the game climbs a visible ladder: **서리읍 → 서리시 (도시, v5) → 갈매기 항구 (v6) → 햇살 해변 (v7) → 큰 도시 (v8)**. Each version is about one hour of guided play with something new every ≤ 2 minutes. After that come endless loops: daily and weekly missions, weddings, babies, ships, beach days, the morning paper and small incidents.
2. **v5 opens with a proposal, not a menu.** Right after the 읍 ceremony, while the crowd is still there, a young townsman proposes to the café barista. "결혼해 줄래요?" → "네!" → hearts. The first mission card is **결혼식 준비**: the wedding is the next game day at 11:00 at our 마을회관. This one moment introduces missions, fame and life events together.
3. **Missions are the new heartbeat (§4.4, §5).** There are three board cards, plus request bubbles over residents' heads, 3 daily missions, 1 weekly goal and event missions. §5 has **98 templates in Korean and English** across 부탁 / 배달 운전 / 행사 / 생산 목표 / 탐험 / daily / weekly / streaks. Coin rewards are written as **"minutes of current income"**, so they stay meaningful from v5 to v8 without retuning. Fame (명성) builds **5 chief titles**, 새내기 → 믿음직한 → 존경받는 → 명예로운 → 전설의 촌장, and each title gives a visible reward.
4. **Vehicles change with the era, and you can ride them (§4.3).**
   - 읍: **말썰매 버스** on line A, 서리 광장 동문 ↔ 서리역 ↔ 솔방울 분수. It brings townsfolk straight to our plaza.
   - 읍: **증기 짐차** shuttles goods from a new **서리 화물장** to the station and shops ("짐꾼은 마을 안, 트럭은 마을 사이").
   - 읍: **개썰매** for the chief's first timed mail runs.
   - 도시: the ceremony swaps everything in one wipe to asphalt roads, retro buses, trucks, parked cars and the chief's own **촌장 트럭** for delivery missions.
   - Stops double as **fast travel**, which the growing map needs.
5. **Whole lives, gently (§6).** The story engine (`tools/story`) drives every beat: friendship → 단짝 → 연인 → wedding at the 마을회관 → baby (stroller walks, the chief picks the name) → first day of school → teen → adult → old age (the elder's three wishes) → a peaceful **"하늘나라 여행"** farewell in the new **기억의 정원**.
   - Settings → **"생애 이벤트: 켜기 / 끄기"**. Off keeps life up to old age and removes every farewell, exactly as the 기획서 asks.
   - Children age 1 year per 1.5 game days, adults 1 year per 4. A newborn starts school about 1¾ hours later and grows up in about 4½ hours: "한 번 플레이에 한 세대".
6. **The bank comes in v5 (§4.6).**
   - The chief can deposit (1 % interest per game day) and take **construction loans** of up to 15 minutes of income. This removes v4's worst flaw, the 5–9 minute waits while saving for a ceremony.
   - Residents save and borrow inside the story engine. Their passbooks show in a panel.
7. **v6 harbour (§7).** It is reached by extending the railway east past the "갈매기 항구 방면" sign.
   - **Layout:** every harbour building faces −Y (the sea must lie screen-down-left of the quay), so the harbour is built on a **breakwater mole in the north sea** with a sheltered basin between the coast and the mole. The camera sees, front to back: the train, then ships in the basin, then the harbour buildings, then the lighthouse.
   - **What the player does:** revive it in 7 steps: station, auction, lighthouse, ferry terminal, crane + customs, shipyard and trawlers, then the harbour stars.
   - **Ships:** ferries bring tourists, cargo ships bring export contracts and imports (설탕 → 케이크, 천 → 옷가게, 유리 → 집 2단계).
8. **v7 beach (§8).** It lies on the warm south coast of the same 갈매기 peninsula, "항구 남쪽" in the literal, on-screen sense.
   - It opens with a walk downhill where the snow melts into sand, then a beach clean-up.
   - Then come the lifeguard station, tourist-founded beach shops (v4's founding flow again), the 리조트 호텔 with stars, and events: 모래성 대회, 불꽃놀이 and the **북극곰 수영 대회** back at our snowy coast.
9. **v8 living city (§9).**
   - **Buildings:** a 물류 센터 whose roof fades when tapped to show racks, forklifts and the settlement desk; furniture and appliance chains; police and our own fire station.
   - **Life:** move-ins and move-outs with moving trucks, and the **솔방울 신문** every morning.
   - **Incidents:** a cute petty-crime and fire loop that the "사건·사고" toggle switches off, and in which nobody is ever hurt.
   - **Rank 4 "큰 도시"** closes the guided game at ≈ 270 min.
10. **Only existing art and audio.** Every feature lists the asset keys it uses. Where art is missing (no sugar icon, no sit anim for the chief, no glass-break sound), the plan works around it rather than asking for new art.
11. **Budgets stay honest (§16).**
    - **Texture memory:** the must stays ≤ 455 MiB in every view; per-view targets are in §16.2. Vehicle atlases are 140 MiB if loaded raw, so they load per type in view, capped at 5 resident.
    - **Artifact files:** the binding limit is the file count, 501 of 511 today. Every version must pack its fragments into pages and its sfx into audio sprites before it ships.
    - **Story save:** 0.55 MB, so it goes in its own storage key, written at the day change.
12. **For the designer:** every number is in `balance.js` (Korean comments), every mission in a plain list in `src/data/missions.js`, and every text in `strings.js` (ko/en). A hidden **"이야기 미리보기"** menu (tap the version label 5 times) plays any beat (wedding, baby, school, farewell, fire) at once, for reviewing on the phone.

> 한국어 요약은 맨 끝 부록 C 에 있어요 (대표님용, 쉬운 말).

---

## 1. Pillars and guardrails

| Pillar | What the designer should feel on the phone | Consequence in this plan |
|---|---|---|
| **People, not numbers** | "I know these people. I was at their wedding." | Every life beat names the people and can be visited ("보러 가기"). Missions come from residents' mouths (request bubbles), not from a menu. The story engine remembers what the chief did and residents bring it up later |
| **Cause → visible effect** (kept from v4) | "I built the road, and now the bus brings neighbours to my plaza" | Each purchase changes something on screen within 30 s: a bus arrives, a truck rolls in, a family moves in, a ship berths |
| **No dead time** | Something new every ~2 min, and never "what now?" | Guided steps interleave with missions. The mission chip always shows something doable. Bank loans remove saving gaps. Bots measure the longest gap (≤ 2.0 min smart, ≤ 2.5 arrow) |
| **Gentle and cozy** | Weddings make you smile; the farewell makes you warm, not sad | Farewells only for very old residents, at most one per 15 game days, never the named villagers, white flowers and a hopeful tune. A setting removes them. Incidents are comic, rare and switchable; nobody is ever hurt |
| **Alive, not noisy** | Bustle without clutter on a 390 px screen | Caps: 2 request bubbles on screen, 2 chat bubbles and 3 emotes (v4), 1 story card at a time, ≤ 1 cute happening at a time. Camera grabs only for the proposal, the first wedding (player-started), district reveals and ceremonies |
| **Believable materials and motion** | "It looks like a real wedding dress, a real harbour" | Each beat uses its dedicated outfits and anims (bride/groom/guests/mourners, lifeguard, bellhop, firefighter), real ship bobbing on the live water, steam and horse breath in the cold. Must-look screenshot lists per version (§17) |

**Carried over from v4 (still binding):**
- The first 20 minutes are unchanged.
- No v5+ request, system or tick happens before rank 읍; a save that is already at 읍 constructs v5 on load.
- Every v4 safety rule stays: the same-spot pad step-off, `waitingPay`, partial refunds, the ribbon auto-open, swap after idle, the invitation fallback and `balanceCheck` clamping.
- No softlock: every requirement is producible by lines the player already has, every timed event has a fallback, and every state has a hint.
- Designer-editable data lives in `balance.js`, `world.js`, `strings.js` and the new `missions.js`.
- All existing suites stay green.

**New guardrails:**
- No new art and no Blender. Missing pieces are worked around (Appendix B lists them).
- Every life and incident beat has an off switch and a fallback when the chief is absent.
- Story text never blocks play: talks are bubbles, never modal dialogs.
- No beat steals control longer than 3 s without a skip, and every ceremony is skippable after 3 s, as in v4.

---

## 2. The big picture

| Version | Game minutes (smart bot) | Rank / district | Era of vehicles and roads | New music and ambience | The feeling |
|---|---|---|---|---|---|
| v4 (done) | 20 → 49 | 마을 → **읍** | snow train, dirt → cobble | `amb_town`, `amb_night` | the world comes to me |
| **v5** | 49 → **≈ 104** | 읍 → **도시** (서리시) | 읍: 말썰매 버스, 증기 짐차, 개썰매 → 도시: 레트로 버스, 트럭, 자동차, asphalt and lanes | `bgm_wedding`, `bgm_farewell`, `sfx_sleigh_bells`, `sfx_horse_trot` | my people live real lives, and my village gets wheels |
| **v6** | 104 → ≈ 165 | 갈매기 항구 ★1–3 | train extended, harbour bus line C, ferries, cargo ships, trawlers | `bgm_harbor`, `amb_harbor`, gulls, horns | the world beyond the sea trades with me |
| **v7** | 165 → ≈ 215 | 햇살 해변 ★1–3 | beach shuttle, swan boats, banana boat | `bgm_beach`, `amb_beach`, waves | a dream holiday spot at the edge of a snow country |
| **v8** | 215 → ≈ 270 | **큰 도시** (rank 4) | police car, fire truck, ambulance, delivery vans, moving trucks, forklifts | `bgm_city`, `bgm_chase`, `amb_bank`, `amb_warehouse` | a city that lives without me, and tells me its stories every morning |
| endless | 270 → ∞ | rank 5 "전설의 도시" (P2) | — | — | daily life, new generations |

Think-bot timings run 6–12 % slower at each milestone (§17).

---

## 3. Map: where everything goes

### 3.1 Coordinates

v4's lattice is kept, extended east and south:

```
L(i, j) = (3120 + 64·(i + j),  1315 + 32·(i − j))        one cell = √2 m (128 × 64 diamond)
i: iso X, screen down-right (along the railway)   j: iso Y, screen up-right (+j = toward the north sea)
the railway = j 0;  the north coast ≈ j +5.9 east of x 2100 (shoreY slope 0.5);  buildings face −Y (screen down-left)
```

**The one geometric fact that shapes v6 and v7.** Every harbour building (`ferry_terminal`, `fish_auction`, `shipyard`, `harbor_crane`, …) faces **−Y with its quay edge in front**, and every beach building faces −Y (6 also have `_x` variants facing +X). Their water must lie **screen-down-left** of them. Our only sea lies screen-*up*-right of the coast, so a harbour placed "on the coast past the town", as v4 §3.8 assumed, would turn its back on the camera and the ships. This plan solves it twice:
- **v6:** the harbour stands on a **mole (방파제 부두)** built out into the north sea. The strip of sea between the coast and the mole is a sheltered **basin**, and the ships berth in it in front of the buildings.
- **v7:** the beach lies on a **new warm sea south of the 갈매기 peninsula**. The world grows downward, and the sand and water lie in front of the beachfront row.

### 3.2 World growth and regions

| Version | `WORLD.width` | `WORLD.height` | New regions (rects; open rule) |
|---|---|---|---|
| v5 | 6144 (same) | 3450 (same) | none. v5 uses open land: the rail region's south part (`서리 남부`), `west_s`, and a road through `east`/`se` |
| v6 | **11264** (11 × 1024) | **4096** | `harbor: [6144, 0, 11264, 3840]` (opens on the 철길 잇기 site) |
| v7 | 11264 | **5632** | `beach: [6144, 3840, 11264, 5632]` + `beach_w: [4150, 3450, 6144, 5632]` (`openWith: 'beach'`) |
| v8 | same | same | none (districts inside open land) |

- Nothing that exists moves. Positions are absolute and the world only grows to the right and down.
- `Ground`'s tile pool, the rect regions and the camera bounds already cope (v4 §3.8).
- The overview frames the chief's **area**; new areas are `harbour` (`harbor`) and `beach` (`beach` + `beach_w`).
- Border trees:
  - add `[6144, 3770, 11264, 3840, 115, 'harbor', 'beach']` (the harbour's south edge, gone when the beach opens);
  - add the beach's outer edges `[4150, 5560, 11264, 5632, 115, 'beach']` and `[11190, 3840, 11264, 5632, 100, 'beach']`;
  - the town's south edge `[4150, 3380, 6144, 3450]` gets `until: 'beach'`.

### 3.3 v5 additions (inside today's world)

Checked with a scratch script (`scratchpad/later_player/layout_check.mjs`) against every v4 lot, station, town building, street corridor, the ballast, all plots, towers and zones. The result was "no problems" apart from the intended overlap with v4's `link` footpath, which the road replaces.

| id | What | Lattice (i, j) or px | px anchor | Notes |
|---|---|---|---|---|
| `conn_w` | **서리 큰길** west section, 2 lanes + sidewalks | i −17…−5, j −5…−1 | centre (2224, 1059) | from the plaza's east gate (`east_gate` node −15.8, −4.4). Clears `tower_east` (−18.75, −4.06) by 1.2 cells, `e_m1` and `e_m2` by 0.4 |
| `conn_jog` | jog (Y street) | i −7…−3, j −8…−1 | (2512, 1299) | clears `tower_se` (−1.09, −2.81) by 1.2 cells |
| `conn_e` | east section, continuous with 역앞 거리 | i −3…8, j −8…−4 | (2896, 1587) | same lanes as the v4 main street (j −8…−4), so buses run plaza → town without a jog |
| decor moved | 4 east pines `[2620,1290] [2690,1360] [2590,1420] [2780,1420]`, 2 stumps, 2 lamp posts → sidewalk, signpost, firewood pile, snow pile | — | — | the pines are choppable region trees; 2 of the 6 stay |
| `S1` | stop **서리 광장 앞** (`sleigh_stop` → `bus_stop` at 도시) | (−15, −0.45) | (2131, 849) | +j sidewalk; 840 px (≈ 7 s walk) from the market |
| `S2` | stop **서리역** | (3.2, −3.6) | (3094, 1533) | south edge of the station square (the 승격식 pad is gone after 읍) |
| `S3` | stop **솔방울 분수** | existing `t_sled` (31.7, −1.9) | (5027, 2390) | the town's own sled stop |
| `S4` | stop **솔방울 학교** (pole stop: `road_sign_round`) | (37.0, −14.6) | (4554, 2966) | near-side pole: the bus heading SE stops on its right (−j) side |
| `yard` | **서리 화물장** (freight yard: pad + `crate_stack`; `fuel_depot` at 도시) | px (1814, 1072) | — | 120 px south of `east_gate`; 11 px clear of the farm diamond's NE edge (verify in the layout pass) |
| `south_road` | **남부길** (South Road), X, 2 lanes | i 19.5…34, j −28…−24 | (3168, 3003) | starts 1 cell east of plot `se_m1` |
| `ave_ext` | 솔방울 중앙로 extended south | i 30…34, j −28…−18 | (3696, 3075) | joins the south road |
| `SQ1` | **차고지** lot: `stable_depot` (읍) → `bus_depot` (도시) | (22.0, −21.0) | (3184, 2691) | faces −Y onto the south road |
| `SQ2` | XL lot (v5: apartment or bank; v8: police station) | (27.3, −21.0) | (3523, 2861) | 0.35 cell gap to SQ1 |
| `ws_x1` | XL plot, `west_s` | px (−930, 2800) | — | 학교 / 은행 / 병원 / 아파트 (player's choice) |
| `ws_x2` | XL plot | px (−420, 2800) | — | same menu |
| `ws_x3` | XL plot | px (−930, 3170) | — | same menu |
| `w_garden` | **기억의 정원** (`memorial_garden`, fixed spot) | px (−400, 3180) | — | quiet corner by the south-west forest; only the garden can go here |
| `board_plaza` | **광장 게시판** (`notice_board`, life_props) | `Z('plaza', 4.6, −2.6)` | (1080, 963) | the 기획서's "미션 게시판(광장 게시판)". The 마을회관 board (C1) shows the same missions |

### 3.4 v6 and v7 districts (lattice; inside the grown world)

```
 north sea (winter_sea / harbor palette)                                          ships come in from the east
   ┌──────────────── 방파제 (breakwater, j 20.5–21.5) ───────────── lighthouse (88, 16)
   │  2nd row: 항구 시장 · 해산물 식당 · 선원 숙소 · 항구 창고 · 세관 · 항구 사무소   (j 16.5–20)
   │  quay:   조선소 · 경매장 ·  여객선 터미널  · 크레인 + 컨테이너 야적장         (j 12–16)   ← mole i 48–89
   ≈≈≈≈≈≈≈≈≈ BASIN (j 5.9–12): trawler berth i 50–60 · ferry berth i 59–71 · cargo berth i 71.5–86.5 ≈≈≈≈≈
   ── coast quay (quay_x) ── 갈매기 다리 (pier_y, i 50–51) ──
   ═══ railway j 0 ═══ 갈매기역 (56, 2.03) ═══ buffer stop k 64 ═══
   ─── 해안 대로 (main road continues, j −8…−4, i 49.5–70) ─── station square i 52–58
        harbour back hill: 물류 단지 (v8, ≈ (56, −12.6)) · beach_pine · dune grass
        │ 해변길 (Y street, i 62–64, j −22…−8)  ↓  snow melts into sand
   ═══ beachfront row j −20: 리조트 호텔 · 카페 · 아이스크림 · 조개구이 · 기념품 · 수영복 · 서핑 · 편의점 · 수족관 ═══
   ─── boardwalk j −22.5…−23.5 ─── sand j −23.5…−31 (parasols, loungers, sandcastles, volleyball, lifeguard tower)
 ~~~~ warm south sea (tropical palette), shore j −31, buoy lines, swan boats, banana boat ~~~~
```

| id | What | Lattice | px anchor | Notes |
|---|---|---|---|---|
| rail k 46…64 | track extended | j 0 | (6096, 2803) → (7248, 3379) | buffer stop `rail_x_end_p` at k 64; crossing at k 61 |
| `stn_harbor` | **갈매기역** (`train_station`, a ruin to repair) | (56.0, 2.03) | (6834, 3042) | trackPoint as at ours |
| mole land | quay deck + 2nd row | i 48…89, j 12…20.5 | corners (6960, 2467), (7504, 2195), (10128, 3507), (9584, 3779) | Water mask `land`; default shore `quay` |
| breakwater | `breakwater_x` tiles | i 48…89, j 20.5…21.5 | — | shore type `breakwater` (crash spray) |
| basin | water | i 48…90, j 5.9…12 | — | open to the sea east of i 89 |
| bridge | `pier_y` tiles | i 50…51, j 5.9…12 | (6698, 2726) → (7152, 2563) | the only walk link to the mole; ships use the basin east of it |
| `shipyard` | | (51.5, 13.8) | — | dry dock on the quay edge |
| `fish_auction` | | (57.0, 13.6) | — | trawlers berth in front, i 50…60 |
| `ferry_terminal` | | (65.0, 13.6) | — | ferry anchor = terminal + `gangwayPoint` − `ferry.gangwayFarPoint[dir]` (ships report) |
| `harbor_crane` + containers | | (74.0, 13.4) | — | cargo ship berth i 71.5…86.5 |
| 2nd row | `harbor_market` (56, 17.5), `seafood_restaurant` (62, 17.5), `sailor_lodge` (66, 17.5), `harbor_warehouse` (72.5, 17.8), `customs_house` (79, 17.5), `harbor_office` (84, 17.5) | | | face −Y onto the mole street j 15.5 |
| `lighthouse` | | (88.0, 16.0) | (9776, 3619) | beams sweep the open sea at night |
| harbour road | 해안 대로 | i 49.5…70, j −8…−4 | — | continuous with 솔방울 큰길 (bus line C) |
| `logistics_lot` | v8 물류 센터 (11 × 8 m) | ≈ (56, −12.6) | ≈ (5898, 3510) | the back hill between the harbour road and the beach road (inside `beach_w`); it appears as a fenced "물류 센터 예정지" when the beach region opens in v7 |
| beach road | 해변길 (Y street) | i 62…64, j −22…−8 | (6640, 3587) → (5744, 4035) | ≈ 6 s walk; snow → sand transition kit along it |
| beachfront row | 9–12 buildings | j −20, i 61…95 | (5744, 3907) → (7920, 4995) | entirely below y 3840 (the beach region) |
| boardwalk | `boardwalk_x` | j −22.5…−23.5 | — | — |
| sand | `ground_sand`, wet band by Water | j −23.5…−31 | — | `sandKit`/`wetKit` edges |
| south sea | Water region, palette `tropical`, shore `sand` (rock headland at i 55–60) | j < −31 | down to y 5632 | open to the bottom and right edges |

The layout pass must add these rows to a `v6_layout.mjs` / `v7_layout.mjs` checker (the v4 `v4_layout.mjs` method) before any code lands.

---
## 4. v5 — 탈것의 시대, 촌장 미션과 명성, 주민의 일생, 은행 (읍 → 도시)

### 4.1 Minute by minute (smart bot, game minutes from a new game; think bot +6–10 min)

The v4 clock runs a 600 s day (1 game hour = 25 s). A v4 save reaches 읍 at a random hour, so every v5 "at hh:00" beat waits for the next such hour that is at least 4 game hours (100 s) away. All v5 timings below are bot targets (§17).

| t | Event | The player does | The player sees and hears |
|---|---|---|---|
| 49.0 | 읍 ceremony ends (v4) | — | The crowd is still gathered at the hall or station square |
| 49.2 | **The proposal** (scripted once, 8 s, skippable after 3 s) | Watch | A young townsman who has shopped with us ≥ 3 times (단골 ★) kneels in front of the 역앞 카페 barista (both townsfolk dolls). Bubbles: "결혼해 줄래요?" → "네!". `emote_love` and an `fx_heart` burst follow; the crowd plays `clap` (townfolk2, with `happy` + `emote_star` as the fallback). Banner **"첫 결혼식이 열려요!"** / "내일 11시 · 마을회관" |
| 49.4 | v5 HUD appears | — | The **mission chip** replaces v4's order chip, and the **fame chip** reads ★ 0 · 새내기 촌장, with a soft `sfx_fame_up`. The first card flips in: **결혼식 준비** (§5 C1) |
| 49.5 | **광장 게시판** pinned (paper-flutter tween, `sfx_mission_done` at 0.5) | Tap the chip or walk to the board | 3 board cards. The first request bubble rises over 빵집 아주머니: "할머니께 빵 좀 갖다 드릴래요?" (§5 A1) |
| 50 | **마구간 차고지** site (lot SQ1) | Stand on the pad (3,000) | Arrow and goal text "말썰매 버스를 들여와요". Porters and the station porter deliver 30 planks + 6 ingots |
| 51–53 | Wedding prep runs in parallel | Carry bread and fish to the **잔치 상** pad at the hall; pick flowers at a 꽃밭; give the aunt 12 bread for the cake | Each prep item shows on the hall's courtyard: chairs appear row by row (`wedding_chairs`), then the arch, then the cake table. **The village visibly gets ready** |
| 53 | Depot built | — | A **말썰매 버스** trots out of the depot (`sfx_horse_trot` + `sfx_sleigh_bells`, positional). The coachman (townsfolk `station` preset at `driverSeat`) tips his hat. For now line A runs only 서리역 ↔ 솔방울 분수 |
| 53.5 | **서리 큰길** site (5,000 + 40 planks + 10 ingots, 20 s) | Pay at the pad by the station square | Two builders (`factory` + hard hat) walk the road band. The road is painted cell by cell from the station toward the plaza (a `RoadNet.upgrade` wipe with `fx_dust` puffs) |
| 55.5 | Road done; stop **S1 서리 광장 앞** (600) | Pay | The first sleigh bus pulls into the plaza gate: **8 neighbours step off** and walk to the market. Banner "말썰매 버스가 서리 광장에 왔어요!" Kids run alongside the bus for a few metres |
| ≈ 54–60 | **Wedding** (next 11:00) at our 마을회관; at 솔방울 마을회관 if ours isn't built | Walk there (the story card's **보러 가기** offers a bus ride). Step on the **축사** pad when the couple reaches the arch | 60–90 s, skippable, staged in §6.3. Fame +30 (prepared) or +10. Coins +2 min of income as wedding gifts "from both families" |
| 60 | **증기 짐차** at the depot (4,000 + 20 ingots) and **서리 화물장** pad at the plaza gate (1,200) | Pay both | Goods porters drop surplus at the yard (a remote sink like v4's dock). The wagon puffs along the 큰길 to the station dock and the shops, and items fly from its bed to each shop's stock (wholesale 70 %, v4 rule) |
| 61 | **First 배달 운전**: the dog sled at the yard (§5 B1) | Tap **개썰매 타기**; steer with the joystick; 4 mailboxes | Two huskies run (`dog_sled`). The chief stands in the basket (idle frame at `seatsStand`, hull overlay over his legs). A timer chip shows ★★★ / ★★ / ★ |
| 64 | Title 1: **믿음직한 촌장** (150 fame) | — | `ui_icon_title` flies to the fame chip. Reward: **마을 악단**, a `music_stand` + `bench_seats` set placed at the plaza. The bard plays every evening at 18:00 and residents sit and dance (the v2 concert system, now on the clock) |
| 66 | XL plots `ws_x1–3` appear in the snowy south-west (`west_s`); card **"우리 마을에도 학교를!"** | Build 학교 (7,000 + 40 planks + 12 ingots) | Our kids start going to our school at 08:00. The bell (`sfx_school_bell`) rings in our village too |
| 70 | **은행** unlocked in the 마을 tab (XL plot or SQ2) | Build it (9,000 + 30 planks + 20 ingots) | A banker steps off the bus (townsfolk `top_blazer` + `det_tie`; the cityfolk `banker` look comes in v8). Ribbon pad, then **"서리 은행 개업!"**. The passbook UI opens (§4.6); the first mission is "첫 저금" |
| 72 | **Good news** (the first couple expects a baby; scripted for the first couple) | — | A `cradle` (rocking, 4 fps) appears by their front door. Story card "○○ 씨네 집에 기쁜 소식이 있대요!" Neighbours pass by with `emote_heart` |
| 75 | **아파트** (5,000 + 40 planks + 12 ingots → +24 beds) | Build on an XL plot | Settlers arrive **by sleigh bus with luggage** (3 per arrival while beds are empty) |
| 78 | Line B (2nd sleigh bus, 3,500): 서리역 → 솔방울 학교 → 아파트 앞 → back | Pay | Mornings: kids ride to school. Afternoons: elders ride to the fountain |
| 80 | **병원** (clinic, 4,500 + 20 planks + 10 ingots) on an XL plot | Build (optional: the town clinic works too) | — |
| ≈ 84 | **Baby born** (§6.4) | Pick a name from 3 chips | The couple walks into the clinic at dusk and, at dawn, walks out pushing a stroller (`l2_baby_stroller` / `_pink`). `sfx_baby_giggle`. Banner "아기 ○○ 탄생!". A gift-box mission follows |
| 86–95 | Missions, apartments filling, more buses | Daily rhythm | Title 2 **존경받는 촌장** at 400 fame |
| ≈ 92 | The elders' wish **"조용히 쉴 정원이 있으면 좋겠어요"** (§5 C7a) | Build **기억의 정원** at `w_garden` (2,500 + 10 planks) | Elders sit on its bench at 14:00–16:00 and feed the cat |
| ≈ 98 | 도시 bars full → **승격식** pad (24,000) | Pay. If the coins are short, the bank offers a loan (§4.6) | — |
| ≈ 100–104 | **도시 ceremony** (14 s, skippable after 3 s; §4.7) | Watch | The asphalt wipe, then lanes and crosswalks, then traffic lights. Sleigh buses roll into the depot and **retro buses** roll out. The steam wagon becomes a **truck**. Cars appear at level-2 houses. "서리읍 → 서리시!" |
| 105 | **첫 운전: 카페에 빵 배달** (§5 B3, tutorial drive) | Drive the 촌장 트럭 | The chief waves from the cab (`truck_cargo_chief` idle). A honk button "빵빵" replaces the whistle button |

**Longest wait for something new** (projection): ≤ 1.8 min. Missions fill every crack: the board refreshes 20 s after a completion and a new request bubble appears every 45–90 s.

### 4.2 Unlock order and costs (v5)

| # | Step | Unlocks after | Cost | Build | Effect |
|---|---|---|---|---|---|
| 1 | v5 HUD, 광장 게시판, request bubbles, daily missions | 읍 | — | — | §4.4 |
| 2 | 마구간 차고지 (SQ1) | 읍 | 3,000 + 30 planks + 6 ingots | 10 s | 1 sleigh bus, line A (station ↔ fountain) |
| 3 | 서리 큰길 (road) | step 2 | 5,000 + 40 planks + 10 ingots | 20 s | line A reaches the plaza; trucks can reach the yard |
| 4 | Stops (each) | step 3 | 600 | 3 s | S1 plaza, S2 station (free), S3 fountain (free), S4 school |
| 5 | 증기 짐차 | step 3 | 4,000 + 20 ingots | 6 s | freight shuttle, 30 items per trip |
| 6 | 서리 화물장 | step 5 | 1,200 | 4 s | remote sink at the plaza gate for goods porters |
| 7 | 개썰매 (mail runs) | step 6 | free | — | 배달 운전 era 2 |
| 8 | XL plots `ws_x1–3` + 학교 | fame 150, or 15 min after 읍 | 7,000 + 40 planks + 12 ingots | 14 s | our school day |
| 9 | 은행 (XL or SQ2) | fame 150 | 9,000 + 30 planks + 20 ingots | 14 s | §4.6 |
| 10 | 아파트 A / B | step 8 | 5,000 + 40 planks + 12 ingots | 14 s | +24 / +18 beds |
| 11 | 병원 | step 8 | 4,500 + 20 planks + 10 ingots | 12 s | births at our clinic (else the town's) |
| 12 | Sleigh bus 2 (line B) | step 4 | 3,500 | — | school line |
| 13 | 기억의 정원 | an elder turns 80 (mission C7a), or 40 min after 읍 | 2,500 + 10 planks | 8 s | garden; farewells (§6.8) |
| 14 | 도시 승격식 | bars full (§4.7) | 24,000 | 14 s ceremony | era 3 |

### 4.3 Vehicles by era

**What moves where**

| Era | Vehicle (art key) | Job | Route | Numbers |
|---|---|---|---|---|
| 읍 | 말썰매 버스 `horse_sleigh_bus` (8 seats + driver) | brings townsfolk to our plaza, takes ours to the town; fast travel for the chief | line A: S1 서리 광장 앞 ↔ S2 서리역 ↔ S3 솔방울 분수. Line B: S2 → S4 학교 → 아파트 앞 → S2 | 3.0 m/s (192 px/s), dwell 8 s, headway 70 s per bus |
| 읍 | 증기 짐차 `steam_wagon` | carries yard surplus to the dock, founded shops, house sites and the restaurant | yard → 큰길 → station dock → shop row A → (ave) → row B → back | 3.4 m/s, 30 items, load 4 s, unload 0.12 s per item |
| 읍 | 개썰매 `dog_sled` | chief's mail runs (timed) | any drivable cell + snow paths flagged `sled` | 5.5 m/s; the chief at `seatsStand` |
| 읍 | 짐수레 썰매 `cargo_sleigh` | the station porters' upgrade (decor plus capacity) | station square ↔ yard | capacity 12 → 20 |
| 도시 | 레트로 버스 `retro_bus` | lines A, B, later C (harbour) and D (beach) | as above | 5.0 m/s, 9 seats, dwell 6 s, headway 50 s |
| 도시 | 운송트럭 `truck_cargo` | replaces the steam wagon; inter-district freight | as above, plus the harbour from v6 | 5.5 m/s, 40 items |
| 도시 | 촌장 트럭 `truck_cargo_chief` | delivery missions | any drive lane | 6.0 m/s max; coasts to 0.6× on release |
| 도시 | 자동차 `car_a/b/c/d_*` (12 colourways) | residents' cars: life and traffic | home ↔ shops/work on the lane graph; park at houses (`garage_small`) and lots | ≤ 6 moving, ≤ 24 parked; ≤ 4 colourways resident at once (§16) |
| v8 | `police_car`, `fire_truck`, `ambulance`, `delivery_van`, `moving_truck`, `forklift`, `excavator`, `dump_truck` | incidents, logistics, moving, rebuilding | §9 | — |

**How they move.**
- Vehicles drive only along the two iso axes, on `RoadNet`'s right-hand lanes (built in v4 and unit-tested) with `drive` routes.
- At corners they swap heading (SE/NE frames, SW/NW mirrored).
- They stop 1.5 m before any walker on their lane (the train rule) and give a short honk (`sfx_car_honk_1`, or `sfx_bus_horn` for buses) every 3 s while blocked.
- They yield at crosswalks while anyone is on them.
- At 도시 the 큰길 × 중앙로 junction gets `traffic_light` × 2 (cycle 6 s green, 2 s yellow, 6 s red per axis) and drivers obey them. At night, headlights (`lightPoints`) glow through the DayClock glow pool.
- Shadows are soft ellipses (vehicles have none baked).
- Passengers are drawn at `seats` with `sit` frames (townfolk2 pages) or `idle` at `seatsStand`. Every moving vehicle has a driver doll, so none ever looks empty.

**Riding (fast travel).**
- Standing at a stop shows a chip: "다음 버스 12초 · 어디로?". A list of stops with small thumbnails appears; pick one.
- The chief boards (fades at the door, then appears at a seat waving) and the camera follows the bus. Joystick input cancels the ride at the next stop.
- Trains work the same at stations, which closes v4's P1 backlog item "chief rides the train".

**Era 3 traffic density** (cars that visibly move on screen, nearest first):

| Area | Cars moving | Buses | Trucks |
|---|---|---|---|
| Village gate / 큰길 | ≤ 2 | line A | 1–2 |
| Station district | ≤ 3 | lines A, B | 1–2 |
| Town | ≤ 4 | lines A, B, C | 1 |
| Harbour (v6) / beach (v7) | ≤ 3 | lines C, D | 1–2 |

### 4.4 Missions and fame: the system

**Sources** (all feed one `Missions` engine; §14):

| Source | Where the player meets it | Slots | Refresh |
|---|---|---|---|
| **Board cards** | 광장 게시판, 마을회관 board, the station 주문판 (which keeps v4's 정기 납품 as the "생산 목표" kind) | 3 | a new card 20 s after one completes; a free **"다른 미션"** swap after 120 s without progress **keeps the progress** (the card is parked and comes back later; fixes v4 review finding 5) |
| **Request bubbles** (부탁) | a `ui_icon_request` bubble over a resident's head | ≤ 2 visible on screen, ≤ 4 world-wide, ≤ 3 accepted | one new bubble every 45–90 s; an untouched bubble pops after 6 min |
| **Events** (행사) | story cards for weddings, babies, school days, festivals, ships | as they happen | fixed by the story engine and district timetables |
| **Daily** (오늘의 미션) | the mission panel's 오늘 tab | 3 | real calendar day, reset at 05:00 local time |
| **Weekly** (이번 주 목표) | 이번 주 tab | 1 (3 stages) | Monday 05:00 local time |
| **Streaks** | the streak counter on the 오늘 tab | — | §5 H |

**Accepting.**
- Tap a bubble, or walk within 90 px and stand still for 0.5 s. A card slides up with 받기 / 나중에.
- Board cards are active as soon as they appear: no accept step, as in v4.
- When an event needs the chief at a time and place, it shows a countdown on the chip.

**The chip** (replaces v4's order chip at `(28, top+212)`, 300 × 56):
- It shows the focus mission's icon, a 14-character title, a progress line, and a timer ring when there is a deadline.
- Focus rule: an event with a deadline under 3 game hours comes first, then an accepted request, then the board card with the most progress.
- Tap to open the panel. Its tabs are 진행 중 · 게시판 · 오늘 · 이번 주 · 칭호; the cards are `ui_mission_card` / `ui_mission_card_done` 9-slices.

**Arrows and hints** (added after v4's list in `Tutorial`):
1. An event whose start is under 1 game hour away and needs the chief: arrow to its pad.
2. Carrying what an accepted request needs: arrow to the recipient (the resident's live position, with an edge marker when off screen).
3. The focus mission's next physical step: the arrow or goal text names it ("빵 3개 더 → 할머니").
4. Idle with nothing doable: the arrow goes to the nearest request bubble.

The arrow-only player always has something to follow. This fixes v4's "arrow-only never reaches 읍" class of problem.

**Rewards.**
- **Coins:** `coins = max(payFloor, round10(pay × income))`.
  - `income` is the rolling 5-minute average of earned coins, excluding mission and loan money.
  - `pay` is per template (0.2–5).
  - Example at 1,800 coins/min: pay 0.5 = 900 coins; at 8,000/min in v7 the same card pays 4,000.
- **Fame:** a fixed number per template (4–60).
- **Driving:** stars multiply the coins (★ 0.6, ★★ 0.85, ★★★ 1.0) and add fame +5 for ★★★.
- **Materials are never a reward.** That keeps the production loop honest.
- **Passive fame**, so an arrow-only player still reaches the titles:
  - +1 per 25 bus or train riders;
  - +5 per wedding or birth in our village, even unattended;
  - +5 per new shop, house level or district star;
  - +2 per happening watched.
  - This is about 3–4 fame per minute; missions give the rest.

**Fame (명성) and titles** (`BALANCE.v5.fame.titles`):

| Title | Fame | Reward (existing art) | Also |
|---|---|---|---|
| 새내기 촌장 | 0 | — | — |
| 믿음직한 촌장 | 150 | **마을 악단**: `music_stand` + `bench_seats` at the plaza, bard concerts at 18:00 | settlers every 45 s → 40 s |
| 존경받는 촌장 | 400 | **눈꽃 아치**: a permanent `wedding_arch` with 2 `flower_stand`s at the hall, where couples take photos | needed for 도시 (§4.7) |
| 명예로운 촌장 | 900 | **랜턴 거리**: `lantern_string` along the plaza and 큰길, lit at night | ferry tourists +20 % (v6) |
| 전설의 촌장 | 2,000 | **도시 입구 문**: `town_gate_x` reading "서리시" at the 큰길 west end; a gold crown flair on the chip | rank 5 "전설의 도시" (P2) |

**Naming note.** v4 shows the village rank with `ui_badge_rank_N` (마을 1, 읍 2), although the ui3 manifest describes those badges as chief titles. This plan keeps the badges for the **rank** (도시 3, 큰 도시 4, 전설의 도시 5) and gives fame titles their own look: `ui_icon_title` plus 1–5 small stars. Residents keep calling the player **촌장님** after the rank titles 읍장 and 시장 ("다들 아직도 촌장님이라고 불러요"). It is warmer, and the fame titles stay consistent.

### 4.5 Life events in v5 (summary; full beats in §6)

- **Start:** `StoryLife` starts at 읍, or when a 읍 save loads.
- **Seeding:**
  - The story engine is seeded with the town (120), the district citizens, the settlers (who become individual townsfolk with homes; today they are a counter in `Civic`) and the named villagers (`keepNamed`).
  - It also gets a **chronicle** of the chief's deeds since the first train: station repaired, shops opened, the 읍 ceremony.
  - So on day one residents already say things like "촌장님이 역을 고쳐 주셔서 기차가 다니잖아요".
- **Frequency** (≈ 200 simulated people):
  - a wedding every 6–9 game days (60–90 min), the first one scripted;
  - a baby every 4–6 game days, the first ≈ 35 min after the first wedding;
  - birthdays at most 1 per game day;
  - farewells (if on) no earlier than 180 min into v5 and at most 1 per 15 game days.
- **The setting:** **생애 이벤트: 켜기 / 끄기**, default 켜기. 끄기 stops all farewells (elders stop aging at 85) but keeps romance, weddings, babies and growing up. This is the 기획서's "끄면 노년까지만, 이별 없음".

### 4.6 The bank (은행, v5)

| For | What | Numbers (`BALANCE.v5.bank`) |
|---|---|---|
| Chief: 저금 (deposit) | Stand on the 창구 pad and coins fly in. Shown in the passbook (`ui_passbook`) | 1.0 % interest per game day, paid at 06:00; deposit cap 50,000 (v6: 150,000) |
| Chief: 대출 (loan) | Offered on a construction pad when the coins are short: "은행에서 빌릴까요? 1,800 (수수료 5 %)" | Up to 15 minutes of current income; 5 % flat fee; repaid automatically from 10 % of income; one loan at a time |
| Residents | Savings, furniture loans, house loans, shop loans, rebuild loans (v8): the story engine's `bank` events | The passbook panel lists the 5 nearest residents' books (wallet, savings, loans) |
| Cute details | Teller dolls at the counters; the vault door turns (`spr:bank_vault:vault`) when the chief deposits ≥ 5,000; `sfx_coin_count`, `sfx_stamp`, `sfx_ticket_chime`. The roof fades when the chief walks in (cutaway, like the logistics centre) | the civic `bank` pages and these 3 audio6 one-shots load with the bank, ahead of v8 |

**Why v5:** loans make the 24,000 승격식 reachable the moment the bars fill (≤ 1 min wait), which v4's 11,000–14,000 ceremony never managed (gaps of 5–9 minutes). Interest gives idle players a small passive reward.

### 4.7 Rank 3 도시 (서리읍 → 서리시)

| Bar | Counts | Need |
|---|---|---|
| 인구 | village residents + district citizens + settlers + babies | **100** |
| 명성 | fame points (= title 존경받는 촌장) | **400** |
| 버스 승객 | bus riders in the last game day (rolling) | **120** |

- These three replace v4's people / shops / happiness. Happiness never mattered in v4 (finding 8), so it moves to the rank panel as information only.
- Expected path to 인구 100: 45 at 읍, +16 carpenter houses (H4, H5, B2, B3), +6–10 village houses, +24 / +18 apartments, +2–3 babies.
- **Pad:** 24,000 coins; the bank may lend up to 50 %.
- **Where:** in front of our 마을회관 (C1's venue), or on the bus-depot apron (SQ1, L(22, −23.5)) if the hall isn't built. It never goes on the station square, where stop S2 now stands.
- **Crowd:** the ceremony calls riders by bus to the venue (not only people within 900 px), which fixes v4 visual review HIGH 2, the empty hall ceremony.

**Ceremony** (14 s; any joystick input after 3 s skips to the end state):
1. Bells ×3 and the badge `ui_badge_rank_3`.
2. The **asphalt wipe**: `RoadNet.upgrade(main/back/ave/connector/south, 'asphalt')`, then curbs, `lane_x/_y`, `crosswalk_x/_y`, then the `traffic_light`s pop.
3. The sleigh buses drive into the depot, `stable_depot` swaps to `bus_depot`, and retro buses roll out (`sfx_bus_horn`).
4. The steam wagon becomes a truck, and the yard swaps to `fuel_depot`.
5. Cars appear at level-2 houses.
6. Banner **"서리읍 → 서리시!"** / "이제 시장님이에요 · 그래도 다들 촌장님이라고 불러요".

**Rewards:**
- era 3 vehicles;
- the 촌장 트럭 and driving missions;
- `parking_lot_s` builds (1,500, happiness +2, 4 cars park);
- `bgm` stays `bgm_village` by day, and `amb_town` gains `sfx_car_honk_*` sprinkles;
- the train gets a 3rd passenger coach (seats +8).

---
## 5. Chief mission catalogue (98 templates)

**Notation.**
- **pay** is in **minutes of current income** (§4.4): 0.5 = half a minute, never less than `payFloor` (100 × era).
- **fame** is fixed.
- **Unlock** names the first moment the template can be offered:
  - `읍` = v5 start, `도시` = rank 3;
  - `v6`, `v7`, `v8` = when that district or system is open;
  - `b:key` = a built building, `life` = needs the story engine's event, `toggle` = needs a setting on.
- **Repeat** is the cooldown before the same template can be offered again (game minutes; "once" = one-off).
- **Need** uses existing item art only. Four "crafted" items are new pickups made from existing art:
  - `item_bouquet`: stand 3 s at a 꽃밭 (`deco_flowers`) to pick 1, up to 6 per bed per game day; or buy at the 솔방울 꽃집 pad for 25.
  - `item_cake`: the 빵집 아주머니 bakes one from 12 bread in 20 s; from v6, sugar crates let the bakery make cakes as a product.
  - `item_gift_box`: put any 3 goods on the 잡화점's 선물 포장 pad.
  - `item_letter`: handed over by the request giver.
- Requests and events name the people involved using the story engine's names. The Korean titles below use placeholders, `○○` / `{name}`.

### A. 부탁 (requests) — 22

| # | id | 한국어 | English | Need / how | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| A1 | `req_bread_grandma` | 할머니께 빵 5개 갖다 드리기 | Bring Grandma 5 loaves | bread 5 → `npc_grandma` | 읍 | 0.3 | 5 | 20 |
| A2 | `req_fish_cat` | 고양이 나비에게 생선구이 3개 | Grilled fish for Nabi the cat | fish_cooked 3 → `pet_cat` (it purrs, `emote_heart`) | 읍 | 0.2 | 4 | 25 |
| A3 | `req_snowman_kids` | 아이들 눈사람 만들기 도와주기 | Help the kids build a snowman | stand at the snowman spot 20 s; the snowman grows a stage at a time | 읍 | 0.2 | 6 | 30 |
| A4 | `req_letter` | {name}에게 편지 전해 주기 | Deliver a letter to {name} | `item_letter` from giver to friend; the reader smiles and their affinity rises (story `report('chief')`) | 읍 | 0.3 | 6 | 15 |
| A5 | `req_bouquet_secret` | 몰래 꽃다발 전해 주기 | A secret bouquet | `item_bouquet` → the giver's crush; romance rises and may lead to sweethearts ♥ | 읍, life | 0.3 | 8 | 30 |
| A6 | `req_firewood_elder` | 할아버지 난로에 장작 10개 | Firewood for Grandpa's stove | log 10 → an elder's door | 읍 | 0.3 | 5 | 20 |
| A7 | `req_tools_newcomer` | 새 이웃에게 도구 선물하기 | A tool for the new neighbour | 1 of axe/pickaxe/sickle/rod → a settler's door | 읍 | 0.4 | 6 | 30 |
| A8 | `req_housewarming` | 집들이 선물 가져가기 | Housewarming gift | `item_gift_box` → a new house | 읍 | 0.4 | 8 | per new house |
| A9 | `req_lost_mitten` | 잃어버린 벙어리장갑 찾기 | Find the lost mitten | a sparkle in the snow within 600 px (`fx_spark` + `decal_footprints`) → the kid | 읍 | 0.2 | 5 | 30 |
| A10 | `req_bread_skaters` | 스케이트장 손님에게 빵 8개 | Bread for the skaters | bread 8 → the rink | b:deco_rink | 0.3 | 5 | 30 |
| A11 | `req_planks_carpenter` | 목수 아저씨에게 판자 30장 | 30 planks for the carpenter | plank 30 → 목공소 | 읍 | 0.6 | 6 | 20 |
| A12 | `req_birthday_meat` | {name} 생일 잔치에 훈제고기 10개 | Smoked meat for {name}'s birthday | meat_cooked 10 → the family's door (joins C9) | life | 0.5 | 10 | per birthday |
| A13 | `req_horse_wheat` | 말들에게 밀 한 줌 (6개) | A handful of wheat for the horses | wheat 6 → the depot; the horses nuzzle the chief (`emote_heart`) | b:depot | 0.2 | 5 | 30 |
| A14 | `req_penguin_fish` | 뽀삐가 생선이 먹고 싶대요 | Ppoppi wants a fish | fish_raw 3 → `pet_penguin` (it flaps, `emote_fish`) | 읍 | 0.2 | 4 | 25 |
| A15 | `req_school_lunch` | 학교 점심 빵 20개 (12시 전) | School lunch: 20 loaves before noon | bread 20 → our school door before 12:00 | b:school | 0.5 | 8 | 1 game day |
| A16 | `req_clinic_fish` | 병원 환자분들께 생선구이 15개 | Fish for the clinic | fish_cooked 15 → the clinic | b:clinic | 0.4 | 6 | 30 |
| A17 | `req_sailor_cans` | 선원들에게 통조림 12개 | Cans for the sailors | can 12 → `sailor_lodge` | v6 | 0.5 | 6 | 30 |
| A18 | `req_keeper_bread` | 등대지기에게 따뜻한 빵 6개 (저녁) | Warm bread for the lighthouse keeper | bread 6 → the lighthouse at 17–20 h | v6 | 0.3 | 8 | 1 game day |
| A19 | `req_tourist_photo` | 관광객 기념사진 같이 찍기 | Pose for a tourist photo | stand 5 s at the beach gate with a `beach_tourist` (camera flash `fx_glow`) | v7 | 0.2 | 6 | 20 |
| A20 | `req_lost_ring` | 잃어버린 튜브 찾아 주기 | Find the lost swim ring | a `swim_ring_*` drifting at the shore → the crying kid (`emote_tear` → `emote_star`) | v7 | 0.3 | 8 | 30 |
| A21 | `req_moving_boxes` | 이삿짐 상자 3개 날라 주기 | Help carry 3 moving boxes | `cardboard_box_*` from the `moving_truck` to the door | v8 | 0.4 | 8 | per move-in |
| A22 | `req_owner_settle` | 가게 주인 정산 심부름 | Settle a shop's bill | walk the receipt to the logistics office pad (stamp `sfx_stamp`) | v8 | 0.3 | 5 | 20 |

### B. 배달 운전 (driving) — 12

Par time = route length ÷ (0.6 × vmax) + 8 s per stop. Stars: ★★★ ≤ par, ★★ ≤ 1.3 × par, ★ ≤ 2 × par; otherwise it still completes with ★. A run can never fail: it only ends early if the player quits.

| # | id | 한국어 | English | Route | Unlock | pay | fame (★/★★/★★★) | Repeat |
|---|---|---|---|---|---|---|---|---|
| B1 | `drv_sled_mail` | 개썰매 편지 배달 | Dog-sled mail run | 4 mailboxes (village doors and the district), par ≈ 70 s | b:yard | 0.8 | 8/12/18 | 15 |
| B2 | `drv_sled_herbs` | 약초꾼 약초 배달 | Herbs for the clinic | 서쪽 숲마을 → clinic, par ≈ 60 s | b:clinic | 0.6 | 8/12/18 | 20 |
| B3 | `drv_first_truck` | 첫 운전: 카페에 빵 배달 | First drive: bread to the café | yard → 역앞 카페, 1 stop (tutorial, generous par) | 도시 | 0.5 | 15 (fixed) | once |
| B4 | `drv_shop_round` | 가게 한 바퀴 배달 | Shop round | 3–5 founded shops; owners run out, items fly from the bed, "감사합니다!" | 도시 | 1.2 | 10/15/22 | 10 |
| B5 | `drv_lunch_rush` | 점심 러시: 식당 두 곳에 생선구이 20 | Lunch rush | 큰 식당 + 솔방울 식당 between 11:30 and 12:40 | 도시 | 1.2 | 10/15/22 | 1 game day |
| B6 | `drv_wedding_cake` | 웨딩 케이크 조심조심 배달 | Wedding-cake delivery | bakery → hall before 10:30. Speed is capped at 0.7 × and the cake wobbles on bumps ("천천히!"); no damage | 도시, life | 0.8 | 15/20/28 | per wedding |
| B7 | `drv_export_load` | 수출 화물선에 짐 싣기 | Load the export ship | 3 trips cannery/warehouse → crane yard before the ship leaves | v6 | 2.0 | 15/20/30 | per cargo ship |
| B8 | `drv_auction_fresh` | 경매장에 싱싱한 생선 배달 | Fresh fish to the auction | fish 30 within 1 game hour of a trawler's return | v6 | 1.2 | 10/14/20 | per trawler trip |
| B9 | `drv_icecream_supply` | 해변 아이스크림 수레 보급 | Restock the ice-cream cart | sugar crate + bread 20 → `icecream_cart` | v7 | 1.0 | 10/14/20 | 15 |
| B10 | `drv_hotel_luggage` | 호텔 손님 짐 배달 | Hotel luggage run | ferry terminal → `resort_hotel` door (bellhop waves) | v7 | 1.0 | 10/14/20 | per ferry |
| B11 | `drv_logistics_round` | 물류 센터 배송 | Logistics run | load at a dock bay (forklift loads the bed), 4 shop stops, stamp | v8 | 1.5 | 12/18/25 | 10 |
| B12 | `drv_furniture_home` | 새 집에 가구 배달 | Furniture for a new home | sofa + bed + fridge → a moving-in family | v8 | 1.2 | 12/18/25 | per move-in |

### C. 행사 (events) — 16

| # | id | 한국어 | English | Need / how | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| C1 | `evt_wedding_prep` | 결혼식 준비: 잔치 음식 · 꽃 · 케이크 | Get the wedding ready | bread 20 + fish_cooked 20 + meat_cooked 10 to the 잔치 상 pad, 6 bouquets, 1 cake; before 10:30 on the day | 읍, life | 2.0 | 30 | per wedding |
| C2 | `evt_wedding_speech` | 촌장님 축사 | The chief's speech | stand on the officiant pad when the couple reaches the arch | life | — | 10 | per wedding |
| C3 | `evt_baby_welcome` | 아기 탄생 축하 · 이름 지어 주기 | Welcome the baby and name them | 1 gift box to the family + pick 1 of 3 names | life | 0.5 | 15 | per baby |
| C4 | `evt_school_day` | 첫 등교 함께 가기 | Walk a child to their first school day | the child (and parent) follow the chief from home to the school gate before 08:00 | b:school, life | 0.3 | 15 | per child |
| C5 | `evt_welcome_party` | 새 이웃 환영회 | Welcome party for newcomers | when ≥ 6 settlers arrived today: picnic table pad + bread 15 at the plaza by 18:00; the bard plays | 읍 | 1.0 | 20 | 1 game day |
| C6 | `evt_snow_festival` | 눈꽃 축제 준비 | Snow festival | 3 snowman statues (`deco_snowman`, free from the mission), bread 40, fish_cooked 40; the festival night has lanterns and music | fame 400 | 3.0 | 40 | 7 game days |
| C7a | `evt_elder_garden` | 어르신들의 정원 만들기 | A quiet garden for the elders | build 기억의 정원 | an elder turns 80 | 0.5 | 15 | once |
| C7 | `evt_elder_wish` | {name} 할머니의 소원 (3가지) | Grandma {name}'s three wishes | e.g. "기차 타고 솔방울 분수 보기", "등대 불빛 보기" (v6), "따뜻한 바다에 발 담그기" (v7). Escort her by bus or train; she follows and smiles | life, age ≥ 82 | 0.3 each | 15 each | per elder |
| C8 | `evt_farewell` | 함께 배웅하기 | Saying goodbye together | optional: lay a white bouquet at the new memorial stone during the farewell | life, toggle | — | 10 | per farewell |
| C9 | `evt_birthday` | {name}의 생일 잔치 | {name}'s birthday party | a cake to the family; kids gather and sing (`emote_music`) | life | 0.4 | 10 | ≤ 1 per game day |
| C10 | `evt_harbour_festival` | 항구 축제 | Harbour festival | fish_cooked 60 + can 30 to the harbour market; all ships horn at 20:00, the lighthouse beams | v6 ★2 | 4.0 | 50 | 7 game days |
| C11 | `evt_sandcastle_contest` | 모래성 대회 | Sandcastle contest | 6 kids build (`sandcastle_build_0..3`); the chief taps the winner and gives a ribbon | v7 | 1.0 | 20 | 5 game days |
| C12 | `evt_fireworks` | 여름 불꽃놀이 | Summer fireworks | hotel ★2 + 2 min of income; at 21:00 bursts over the south sea | v7 ★2 | — | 40 | 7 game days |
| C13 | `evt_polar_swim` | 북극곰 수영 대회 | Polar-bear swim | at our snowy coast: residents in swimsuits run in, shiver (`emote_cold`) and cheer; bread 20 after | v7 (swimwear shop open) | 1.0 | 30 | 10 game days |
| C14 | `evt_fire_drill` | 소방 훈련 | Fire drill | the new fire station's first morning: practice smoke + hose at a hydrant | v8 | 0.5 | 20 | once |
| C15 | `evt_first_paper` | 솔방울 신문 창간 인터뷰 | The paper's first interview | stand by the reporter at the plaza for 5 s; tomorrow's front page quotes the chief | v8 | 0.5 | 15 | once |

### D. 생산 목표 (production goals) — 14

| # | id | 한국어 | English | Need | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| D1 | `goal_cans_today` | 오늘 통조림 30개 만들기 | Make 30 cans today | 30 produced within the current game day | 읍 | 1.0 | 10 | 1 game day |
| D2 | `goal_planks_trade` | 판자 50장 교역소에 납품 | 50 planks to the trade post | 50 sold at the trade post | 읍 | 0.8 | 8 | 10 |
| D3 | `goal_bread_town` | 이웃에게 빵 60개 팔기 | Sell 60 loaves to the neighbours | visitors + founded shops | 읍 | 1.0 | 10 | 10 |
| D4 | `goal_combo_meals` | 큰 식당 정식 20그릇 | Serve 20 set meals | restaurant combos | b:big_restaurant | 1.2 | 12 | 15 |
| D5 | `goal_ingots` | 주괴 40개 | 40 ingots | produced | 읍 | 0.8 | 8 | 10 |
| D6 | `goal_meat` | 훈제고기 30개 | 30 smoked meat | produced | 읍 | 0.8 | 8 | 10 |
| D7 | `goal_tuna` | 참치 10마리 잡기 | Catch 10 tuna | `item_fish_big` from boats/trawlers | b:boat_fishing | 1.0 | 10 | 15 |
| D8 | `goal_wholesale` | 도매로 300개 보내기 | Send 300 items wholesale | dock + shops + yard | 읍 | 1.5 | 12 | 20 |
| D9 | `goal_riders` | 오늘 버스 승객 80명 | 80 bus riders today | transit count | b:depot | 1.0 | 10 | 1 game day |
| D10 | `goal_export_contract` | 수출 계약: 통조림 60 + 판자 120 | Export contract | loaded before the ship leaves (2 game days) | v6 | 4.0 | 30 | per cargo ship |
| D11 | `goal_cakes` | 케이크 20개 (설탕 수입) | 20 cakes | baked from sugar crates | v6 import | 1.2 | 10 | 15 |
| D12 | `goal_hotel_guests` | 호텔 손님 40명 | 40 hotel guests | check-ins | v7 | 2.0 | 15 | 20 |
| D13 | `goal_furniture` | 가구 15개 | 15 pieces of furniture | furniture workshop output | v8 | 1.5 | 12 | 15 |
| D14 | `goal_appliances` | 가전 10개 | 10 appliances | appliance factory output | v8 | 1.8 | 14 | 15 |

### E. 탐험 (exploration) — 13

| # | id | 한국어 | English | How | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| E1 | `exp_lost_puppy` | 잃어버린 강아지 찾기 | Find the lost puppy | a puppy (`pet_dog` at 0.8 scale, its own colour tint) hides in a region; barks grow louder (`sfx` volume by distance); kids point with `emote_exclaim`; it follows the chief home | 읍 | 0.5 | 15 | 40 |
| E2 | `exp_tower_stars` | 망루에 올라 별 보기 | Stargazing from the watchtowers | stand at 3 watchtowers at night; a shooting star (`fx_star` streak + `fx_glow`, ADD) crosses the sky for 3 s at each (no title art is loaded in game) | 읍 | 0.3 | 10 | once |
| E3 | `exp_lost_penguin` | 길 잃은 뽀삐 데려오기 | Bring Ppoppi home | the penguin wandered to the station or town; find it and lead it back | 읍 | 0.3 | 10 | 40 |
| E4 | `exp_old_sign` | "갈매기 항구 방면" 표지판 조사 | The old harbour sign | walk to the buffer stop; a far ship horn and gulls; opens the v6 chain | 도시 | — | 10 | once |
| E5 | `exp_first_harbour_train` | 첫 기차 타고 항구로 | First train to the harbour | ride the first train east (§7) | v6 | 0.5 | 20 | once |
| E6 | `exp_lighthouse_top` | 등대 꼭대기에서 바다 보기 | Sea view from the lighthouse | stand at the lighthouse at night; the camera follows the beam over the sea for 4 s | v6 | 0.3 | 10 | once |
| E7 | `exp_south_coast` | 남쪽 해안 탐험 | Explore the south coast | walk the hill path from the harbour; the snow thins into sand; the warm sea appears (§8) | v7 | 0.5 | 25 | once |
| E8 | `exp_beach_cleanup` | 해변 청소 (12개) | Beach clean-up | tap/collect 12 seaweed and driftwood bits on the sand | v7 | 0.6 | 15 | once, then 7 game days |
| E9 | `exp_shells` | 조개껍데기 10개 모으기 | Collect 10 shells | `decal_shells` sparkles at low tide; give them to a kid or the aquarium | v7 | 0.3 | 8 | 15 |
| E10 | `exp_rare_fish` | 희귀 물고기 기증 | Donate a rare fish | a rare catch (1 in 25 boat trips) → `mini_aquarium` (it appears in the tank anim) | b:mini_aquarium | 1.0 | 20 | per fish |
| E11 | `exp_crab_count` | 꽃게 8마리 세기 | Count 8 crabs | tap walking `crab`s; they scuttle sideways | v7 | 0.2 | 6 | 20 |
| E12 | `exp_wanted` | 현상수배범을 찾아라 | Find the wanted thief | from a wanted poster: rumours name where they were seen; tap the right townsperson | v8, toggle | 1.0 | 20 | per poster |
| E13 | `exp_rumour_truth` | 소문의 진실 | The truth behind a rumour | ask 3 residents (tap); the story card shows how the rumour grew ("쿠키 두 개가 여섯 개가 됐대요!") | v8 | 0.3 | 10 | 20 |

### F. 오늘의 미션 (daily) — 12 in the pool, 3 drawn per real day

Each daily mission pays 0.5 and 5 fame. Finishing all three adds 1.0 and +15 fame, and counts for the streak.

| # | id | 한국어 | English | Need | Unlock |
|---|---|---|---|---|---|
| F1 | `day_customers` | 손님 60명 맞이하기 | Serve 60 customers | any seller | 읍 |
| F2 | `day_bread` | 빵 40개 팔기 | Sell 40 loaves | market / shops | 읍 |
| F3 | `day_ride` | 버스나 기차 한 번 타기 | Take one ride | transit | b:depot |
| F4 | `day_dog` | 콩이와 놀아 주기 (간식·공·쓰다듬기) | Play with Kongi | all three dog actions | 읍 |
| F5 | `day_chat` | 주민 3명과 수다 떨기 | Chat with 3 residents | C2 chat or tap-talk | 읍 |
| F6 | `day_tax` | 세금 상자 비우기 | Empty the tax box | hall tax pad | b:town_hall |
| F7 | `day_flowers` | 꽃밭에서 꽃 5송이 꺾기 | Pick 5 flowers | 꽃밭 | b:deco_flowers |
| F8 | `day_train_guests` | 기차 손님 30명 맞이하기 | Welcome 30 train visitors | visitors | 읍 |
| F9 | `day_auction` | 경매 한 번 참여하기 | Join an auction | auction pad | v6 |
| F10 | `day_swimmers` | 해변 손님 20명 | 20 beachgoers | beach count | v7 |
| F11 | `day_paper` | 아침 신문 읽기 | Read the morning paper | open the newspaper panel | v8 |
| F12 | `day_settle` | 물류 센터 정산 한 번 | One settlement at the logistics centre | stamp pad | v8 |

### G. 이번 주 목표 (weekly) — 6 (one per real week; 3 stages)

Stages pay 2 / 3 / 5 and give 20 / 30 / 50 fame. Finishing all three gives that week's special decor: 눈꽃 아치, 랜턴 거리 segment, 이글루 쉼터 (`igloo`), 눈 요새 놀이터 (`snow_fort`) or 그네 (`kids_swing`), in rotation.

| # | id | 한국어 | English | Stages |
|---|---|---|---|---|
| G1 | `wk_good_chief` | 착한 촌장 주간 | Kind-chief week | requests done 10 / 20 / 35 |
| G2 | `wk_transit` | 교통 왕 | Transit king | bus and train riders 200 / 500 / 1000 |
| G3 | `wk_celebrations` | 축하의 주간 | Week of celebrations | weddings, births or birthdays attended 1 / 3 / 5 |
| G4 | `wk_exports` | 수출 왕 (v6) | Export king | items exported 100 / 300 / 600 |
| G5 | `wk_beach` | 해변 지킴이 (v7) | Beach keeper | beach guests 100 / 300 / 600 |
| G6 | `wk_city` | 살아 있는 도시 (v8) | Living city | deliveries settled 30 / 80 / 150 |

### H. 연속 달성 (streaks) — 3

| # | id | 한국어 | English | Rule | Reward |
|---|---|---|---|---|---|
| H1 | `streak_daily` | 오늘의 미션 연속 달성 | Daily streak | all 3 dailies on consecutive real days. A **눈사람 방패** forgives 1 missed day per week (the chip's little snowman melts a bit instead of the streak breaking) | day 2: +10 fame · day 3: a free 꽃밭 · day 5: 3 min of income · day 7: +50 fame and a crown flair for 24 h, then the cycle repeats |
| H2 | `streak_requests` | 착한 촌장 콤보 | Kind-chief combo | 5 requests within 15 game minutes | +5 fame for each further request in the combo (a combo counter bubble over the chief) |
| H3 | `streak_drive` | 별 세 개 운전 연속 | Three-star streak | 3 ★★★ drives in a row | +20 fame and the title flair "베스트 드라이버" on the fame chip for 1 game day |

### 5.1 Data shape (designer-editable, `src/data/missions.js`)

```js
// 미션 목록 — 한 줄이 미션 하나예요. pay = '지금 1분 수입'의 몇 배, fame = 명성
export const MISSIONS = [
  { id: 'req_bread_grandma', kind: 'request',            // request|drive|event|goal|explore|daily|weekly|streak
    title: { ko: '할머니께 빵 5개 갖다 드리기', en: 'Bring Grandma 5 loaves' },
    giver: 'npc_aunt', obj: [{ t: 'deliver', items: { item_bread: 5 }, to: 'res:npc_grandma' }],
    unlock: 'rank:2', repeat: 20, pay: 0.3, fame: 5, weight: 3, icon: 'ui_icon_request',
    lines: { offer: 'm_bread_offer', thanks: 'm_bread_thanks' } },
  // obj types: deliver{items,to} · produce{item,n,window} · sell{item,n,where} · drive{route,stops,par} ·
  //            visit{place|region,stand} · find{kind,area,n} · host{event} · ride{line|any} · build{key} · stat{key,delta}
];
```

Instance (saved): `{ id, st: 'offered'|'active'|'parked'|'done'|'expired', got: {…}, t0, due, stars, who: [storyIds] }`.

---
## 6. Life events: the beats in detail

### 6.1 Who takes part, and pacing

- **Simulated:**
  - the 120 townsfolk;
  - district citizens (founder households, carpenter-house families);
  - **settlers, as individuals**: today `Civic.settlers` is only a number; v5 gives each settler household a doll look, a home and a story id;
  - babies born in v5+;
  - the named villagers (도윤, 하린, 빵집 아주머니 …) with `keepNamed`: they talk, remember, befriend and attend, but never marry, age, leave or bid farewell (they are fixed sprites).
- **Shown with story cards ("known" people):**
  - district and village people;
  - townsfolk the chief has tapped or served ≥ 3 times (단골 ★);
  - the families of anyone in an active mission.
  - Everyone else appears only through rumours, bubbles and (v8) the paper.
- **Cards:** one at a time; the queue holds 3; older cards go to the hall board's 마을 소식 list.
- **Aging** (engine patch, §14.3): `yearDaysKid` 1.5 for ages 0–18, `yearDaysAdult` 4 after that (the engine default is a single 6).

| Beat | Typical rate with ≈ 200 people (per real hour) | Hard caps |
|---|---|---|
| New friends / 단짝 | ambient (dozens; shown only in talk) | — |
| Sweethearts | ≈ 1 | — |
| Wedding | 0.7–1 | ≥ 6 game days apart; never two prep missions at once |
| Baby | ≈ 1 after the first | ≥ 3 game days after that couple's wedding |
| First school day | 0.3–0.5 | ≤ 1 per game day |
| Birthday party (known people) | ≤ 6 | ≤ 1 per game day |
| Elder's wishes offered | ≈ 0.5 | ≤ 1 elder at a time |
| Farewell (if 켜기) | ≤ 0.4 | never before v5 + 180 min; ≥ 15 game days apart; never within 5 game days of a birth in the same family; never named villagers |

### 6.2 Friendship → 단짝 → quarrels and making up

| What happens | On screen | Chief's part |
|---|---|---|
| Two people meet often (work, school, neighbours) | talk bubbles grow warmer; "우리 어제 눈싸움했잖아!" (memory lines) | — |
| Friends meet in the street | `emote_wave`, then `emote_heart` for best friends; they walk side by side (lane offset 0.3 m) on outings | A4 (letters) raises affinity |
| 단짝 (best friends) | tapping a person's name card shows "단짝: {name}" | — |
| A spat (rivalry) | `emote_anger` puff; they turn away (before v8: `idle` facing apart; v8: `argue` anim) | — |
| Making up (next day) | "어제는 미안했어" → `emote_heart`; rumours tell everyone | — |

### 6.3 Sweethearts → proposal → wedding at the 마을회관

**Sweethearts.**
- They sit together on benches (fountain, plaza, the garden) using `sit` (townfolk2, seat height 0.45 m) and take evening walks 19–20 h.
- `emote_love` when they meet.
- Card: "{a} 씨와 {b} 씨가 사귄대요!" (known people only).

**Proposal** (engine `engaged`):
- It happens at a pretty spot (the fountain, the plaza at dusk, the lighthouse in v6, the beach at sunset in v7), with hearts and onlookers clapping.
- Card: "{a} 씨 ♥ {b} 씨 · 모레 11시 마을회관 결혼식". Mission C1 opens with a 2-game-day deadline.

**Wedding staging** (life2 `layouts.wedding_town_hall` relative to the `town_hall` anchor; works at our hall or at 솔방울's):

| Clock | What happens | Art / anim / audio |
|---|---|---|
| prep (until 10:30) | Each prep item placed shows up: 잔치 음식 → the cake table gets plates; bouquets → `flower_stand`s at the arch and steps; cake → `item_cake` on `wedding_cake_table`. Chairs appear row by row as guests RSVP (story invitations) | `wedding_carpet` (ground), `wedding_arch`, `wedding_chairs` ×4, `ribbon_garland` on the hall (depth +1) |
| 10:30 | **Guests change clothes**: each invited friend goes home and comes out in `wedding_guest` (the door fade from v4 + a sparkle). Kids get `flower_crown` | townfolk2 presets; `sfx_door` |
| 10:55 | Guests sit (`seatPoints`, facing SW) or stand (`standPoints`) | `sit`, `idle` |
| 11:00 | The hall bell rings ×2; the music ducks; the flower girl walks the aisle first, scattering petals | `sfx_bell_hall`, `fx_leaf` tinted pink |
| 11:00:10 | **The bride** (`bride`: `wedding_dress` + `veil` + `held_bouquet`) walks out of the hall door down the carpet (`aislePoints`); the **groom** (`groom`: `groom_suit` + bow tie) waits at `couplePoints[1]` with `emote_sweat` | `bgm_wedding` starts |
| 11:00:30 | **The chief's speech** if he stands on the 축사 pad (`officiantPoint`): two bubbles with the couple's names (`wed_speech_1..8`, e.g. "{a} 씨, {b} 씨, 서로 아껴 주며 행복하게 사세요!"). Otherwise the hall clerk speaks | C2 +10 fame |
| 11:00:40 | Vows ("평생 아껴 줄게요." / "저도요!"), then hearts and petals at `fxPoints.heart`; everyone claps | `fx_heart`, `clap` |
| 11:00:50 | **Photo moment**: camera zoom ×1.25 for 2 s, a soft white flash (`fx_glow`, ADD), the card "결혼식 사진" | — |
| 11:01 | The couple walks to the cake table (`servePoints`); kids crowd the cake and won't leave (straight from the story samples) | `emote_star` |
| 11:01:30 | **First dance** in the snow: `happy` alternating facings; guests sway | `fx_snowflake` |
| 11:02 → 18:00 | Guests drift home; the props stay until 18:00 and vanish with `fx_poof` | — |

**Fallbacks:**
- Prep missing: the wedding still happens with one chair row and no cake. A story line says "케이크는 없었지만 둘은 정말 행복해 보였대요" (no penalty text).
- The chief absent: the card offers **보러 가기** (a bus or train ride to the hall). If ignored, it runs off screen in story only.

**Memory and cost.**
- Every guest stores the wedding (story `wedding` fact); talk refers to it for days.
- Texture: `life2_wedding` (1.6 MiB) and the townfolk2 pages needed (heads + adult/child bodies of the used parts, ≈ 25–35 MiB) are acquired 1 game hour before and released 60 s after.

### 6.4 Good news → baby → stroller walks

| Step | When | On screen |
|---|---|---|
| Good news | 3–5 game days after the wedding (the first couple: scripted at v5 + 23 min) | A rocking `cradle` (4 fps) beside their front door; neighbours `emote_heart` as they pass. Card "{a} 씨네 집에 기쁜 소식!" No pregnancy art; the cradle says it |
| To the clinic | 2–3 game days later (the first couple: 1 game day), at dusk | The couple walks (or takes the bus) to our clinic or 솔방울's; the clinic window glows all night (a DayClock light at its `lightPoints`) |
| **Birth** | next dawn | They walk out pushing a stroller (`push` anim; `l2_baby_stroller` or `_pink`, placed at pusher + `pushPoint` − `handlePoint`); `sfx_baby_giggle` (soft). Banner "아기 탄생!" |
| **Naming** (C3) | with the banner | A bottom sheet with 3 name chips from the engine's name pool for the parents' generation (e.g. 하윤 · 서진 · 우진), plus "부모님이 정할게요". The chosen name appears everywhere: bubbles, the paper, diaries |
| Gifts | same day | C3: a gift box at their door; other neighbours visit with `item_gift_box` on their heads (cute) |
| Stroller walks | daily 14:00–16:00 | Plaza, fountain, garden; `sfx_baby_giggle` when the chief is within 150 px (≤ 1 per 30 s); kids peek (`emote_love`) |
| First steps | age 4 (≈ 6 game days) | The stroller is gone and a small child doll appears: hair colour from one parent, skin from the other (seeded). It walks at 0.6 speed beside a parent. Card "{name}가 걸음마를 시작했어요!" |

### 6.5 First day of school → school life

- **07:00 on the day:** the child's look gains `acc_backpack`.
- **07:30:** parent and child walk to **our school** (if built) or ride bus line B from S2 to S4 (솔방울 학교).
- **At the gate:** the child waves (`wave`), walks in, turns once to look back (face S, `emote_star`), and the parent waves back. The bell rings. Card "{name}가 처음 학교에 가요!"; C4 lets the chief walk with them.
- **Our school day** mirrors the town's v4 set pieces: 08:00 bell, 10:30 recess (kids run, snowballs), 12:00 lunch (A15), 15:00 out (kids race to the rink, the plaza and the dog).
- **야외 수업 (outdoor class)** on clear days at 10:00: a teacher (townsfolk `teacher`) and two `school_desk_row` + `school_desk_row_front` in the yard, kids seated (`sit`, depth "between"). One of the most charming static scenes in the art set, and free.

### 6.6 Teen and adult

- **Teens** (13–18): hang out at the café and bookstore after school (v4 schedule). At 16 a **first part-time job** at one of our shops: the teen stands by the shop owner for an afternoon. Card "첫 아르바이트!".
- **Adults:** jobs (story `jobs`), savings at the bank (§4.6), sweethearts, house upgrades through loans, and in v8 moving and starting shops.

### 6.7 Old age and the elder's three wishes

- **Elders (65+):** benches, café, clinic visits (v4), grandparents walking with grandchildren, and memory talks ("옛날엔 이 마을에 기차도 없었단다…", from the chronicle and the engine's long-term memories).
- **Naps:** at the garden or on benches (`emote_zzz`) after 14:00.
- **Three wishes** (C7) from age 82, at most one elder at a time. Each wish is an escort: the elder follows the chief, slowly, onto a bus or train and to the place, and sits there with `emote_heart` for 20 s. Wishes come from the elder's likes (engine prefs: `sea`, `walks`, `gardening`, `baduk` …):

| Wish | 한국어 | Needs |
|---|---|---|
| see the fountain by sleigh bus | "말썰매 버스 타고 솔방울 분수 보고 싶어요" | v5 |
| look at the sea from the dock | "부두에서 바다를 보고 싶구나" | v5 |
| eat a cake at the café | "카페에서 케이크 한 조각 먹어 보고 싶어요" | v6 sugar |
| see the lighthouse beam | "등대 불빛을 한 번 보고 싶구나" | v6 |
| dip feet in the warm sea | "따뜻한 바다에 발 한번 담가 보고 싶어요" | v7 |
| visit the grandchild's school | "손주 학교에 가 보고 싶어요" | b:school |

Granted wishes are remembered by the whole family. That memory is the emotional payoff of the farewell (§6.8).

### 6.8 Peaceful farewell at 기억의 정원 (only when 생애 이벤트 = 켜기)

**Trigger** (engine): an elder aged ≥ 86 (daily chance 0.004 × (age − 85)). The game adds its gates: v5 + 180 min, 15 game days since the last farewell, not during another life beat, never a named villager.

| When | What happens | Art / audio |
|---|---|---|
| the last day | The elder visits favourite places (café, fountain, the sea; story `goTo`) and says gentle lines to family and the chief: "촌장님, 그동안 고마웠어요. 마을이 참 따뜻해졌어요." In the evening they sit on the garden bench at sunset | normal anims; no sad faces yet |
| that night | One warm window glows in their house | DayClock light |
| 09:00 | Card with a white flower icon: **"{name} 할머니가 하늘나라로 여행을 떠났어요."** / "가족과 이웃들이 기억의 정원에서 배웅해요 · 10시". The music softens | `ui_icon_flower`; `bgm_farewell` queued |
| 10:00 | **배웅** at the garden: family in `mourner_family` (`mourning_coat`, `black_hat`, white flower pin) and friends in `mourner`, each with a white `held_bouquet`. A new `memorial_stone` with a `flower_wreath` appears at the next free `stonePoints` slot, with the name on its plaque (game text). One by one they lay flowers (`layPoint`, `sad` with bowed head; the bouquet drops as an `item_bouquet` at the stone base) | life2 `memorial_*`, townfolk2 `sad`, `bgm_farewell` |
| 10:01 | The chief may lay a bouquet (C8, +10 fame). **콩이 comes and sits beside the chief.** Light snow; the garden tree glows softly (`fx_glow` at `fxPoints.tree`), the lantern too, and a few snowflakes drift **upward** ("하늘로") | `fx_snowflake` with negative gravity |
| 10:02 | People drift home with sad faces (`setFace('sad')`), normal again by evening | — |
| next 3 game days | Family members visit the stone (`gatherPoints`) and talk about the granted wishes: "할머니가 등대 불빛을 보시고 참 좋아하셨어." Buying bread: "할머니가 제일 좋아하시던 빵이에요." | story memory lines |

**Gentleness rules.**
- No illness, hospital or death words anywhere; only **"하늘나라 여행"**, **"배웅"**, **"기억"**.
- No farewell is ever forced on screen: the card has "보러 가기", and the event runs quietly if ignored.
- The six stone slots fill over many hours; a seventh name goes to the garden's panel "기억하는 사람들", and the oldest stone becomes a flower bed (`decal`).

**Setting** (`Settings.life` = `'on'` | `'nofarewell'`, label **"생애 이벤트: 켜기 / 끄기"**): 끄기 sets the story toggles `farewell: false` (lifeEvents stays true), cancels any queued farewell and freezes elders at 85. Existing stones stay (designer decision; §18).

### 6.9 Small daily beats

- **Birthdays (C9):** a cake on a picnic table by the house, friends sing (`emote_music`), "생일 축하해!" bubbles.
- **Housewarming (A8):** a `welcome_mat` (civic, v8 art) at the door from v8.
- **Memories of the chief:** at most once per resident per game day, someone thanks the chief for something he really did ("촌장님이 할머니께 빵 갖다 주셔서 고마웠어요" from A1). The engine's `talkTo` returns these when the chief taps people.

---
## 7. v6 — 갈매기 항구 (the harbour)

### 7.1 How it opens

1. **The call (도시 ceremony + 1 min).**
   - A deep, warm ship horn sounds far to the east (`sfx_ship_horn_big`, volume 0.25, panned right), then gulls (`sfx_seagull_1..3`).
   - Rumour lines start: "동쪽 바다 끝에 옛 항구가 있대!" / "갈매기가 많아서 갈매기 항구래".
   - The "갈매기 항구 방면 (공사 중)" signpost at the rail's end gets a sparkle, and mission E4 asks the chief to look at it.
2. **동쪽 철길 잇기.**
   - A site at the buffer stop (k 46): 12,000 + 80 planks + 40 ingots, 25 s.
   - Trucks bring materials along the 해안 대로. Builders lay rail tiles one by one into the fog (RoadPaint rails; snow drifts popping as in v4).
3. **The reveal.**
   - The fog over `harbor` clears and the camera rides the new rails east for 3 s, the v4 invitation move.
   - It shows a **sleepy, snowed-in harbour**:
     - a grey 갈매기역 ruin (v4 tint 0x9aa6b4);
     - a long stone mole with a dark lighthouse at its tip;
     - an old fish auction with three crates;
     - two village fishing boats bobbing in the basin;
     - gulls on bollards (`seagull` `idle` at `perchPoints`);
     - the ferry terminal tinted as a ruin.
   - Banner **"갈매기 항구를 찾았어요!"** / "항구를 살리면 바다 너머 사람과 물건이 와요". `bgm_harbor` and `amb_harbor` play while the chief is in the harbour area.

### 7.2 Reviving the harbour (항구 살리기)

| # | Step | Cost / build | What starts | Smart t |
|---|---|---|---|---|
| 1 | **갈매기역** repair | 8,000 + 40 planks + 20 ingots, 14 s | One train runs 서리 ↔ 솔방울 ↔ 갈매기: cycle ≈ 130 s, visitors per arrival ×2 so the rate stays the same. The first harbour folk (sailors, dock workers) ride to our village. E5 | 110 |
| 2 | **수산물 경매장** | 6,000 + 30 planks, 12 s | An auction every 2 game hours (50 s): the bell (`sfx_auction_bell`), the auctioneer's calls ("자, 싱싱한 참치 열 마리!"), buyers raising hands (`wave`). Fish dropped on the auction pad sell at **1.5×** price (tuna 30 each) | 115 |
| 3 | **등대 불 밝히기** | 3,000 + 10 ingots, 8 s | The lens turns and two beams sweep at night (`anims.light`, DayClock glow); ships also come at night; the keeper (`lighthouse_keeper`) waves from the cottage. E6 | 118 |
| 4 | **여객선 터미널** | 15,000 + 60 planks + 30 ingots, 18 s | The **ferry** every 4 game hours (100 s), dwelling 30 s. **8–20 tourists** (`tourist` preset: backpacks, colourful coats) come down the gangway (`boardPoints`), shop at the harbour market and seafood restaurant, ride the train to 솔방울 and our village, and leave 2 ferries later | 122 |
| 5 | **크레인 + 세관** | 20,000 + 40 planks + 40 ingots, 18 s | The **cargo ship** once per game day, dwelling 120 s. The crane swings crates (`anims.lift`, `hookPoints`; `sfx_crane`). It brings an **export contract** (D10, B7) and **imports** (§7.3); the customs stamp sounds (`sfx_stamp`) | 130 |
| 6 | **조선소** | 25,000 + 60 planks + 30 ingots, 20 s | Builds **원양어선** (`trawler_big`): 30,000 + 80 planks + 40 ingots each, 60 s on the slip (sparks), up to 3. Each trip lasts 3 game hours (75 s): it sails out east into the haze and returns with 8 tuna, playing `haul` near the basin mouth (heading NE) | 140 |
| 7 | **항구 ★2 → ★3** | — | ★2: 20 ships served + 200 items exported + 150 tourists. Rewards: C10 항구 축제, bus line C (솔방울 → 갈매기, retro bus), the tugboat (it nudges the cargo ship into its berth). ★3: 60 ships + 800 exports + 600 tourists. Rewards: sailboats and yachts cruise the basin and open sea; lantern string along the mole | 150 / 165 |

### 7.3 Exports and imports

- **Export contracts** come with each cargo ship. The deadline is the next ship (≈ 1–2 game days). Goods go to the crane-yard pad, delivered by trucks (B7), by station porters, or by the chief. Payment is **2.0 × price** per item plus the D10 mission reward.

| Harbour ★ | Contract (rotates) |
|---|---|
| ★1 | cans 60 + planks 120 · bread 80 + fish_cooked 60 · ingots 50 + tools 3 |
| ★2 | cans 120 + planks 200 + ingots 60 · tuna 20 + cans 80 |
| ★3 | furniture (v8) or any two of the above ×1.5 |

- **Imports** arrive as crates (`crate_stack` / `container_stack` on the quay; trucks carry `item_crate_produce`, `cardboard_box_m` or `crate_stack` with a text label chip). No new item icons are needed: what matters is what each import unlocks.

| Import | Unlocks | Visible result |
|---|---|---|
| 설탕 (sugar) | The bakery's 2nd recipe, **bread 2 + sugar 1 → `item_cake`** (price 18, 2.4 s). Cafés sell cakes; weddings get real cakes; the elders' cake wish | cakes on café shelves; D11 |
| 천 (cloth) | The **옷가게** founding card (`clothing_store` art) on harbour lot `HL1` (i 60, j −1.9, facing the 해안 대로); in v7 the 수영복 가게 | new shop, tourists in new coats (preset colour swap) |
| 유리 (glass) | **House level 2**: lit windows at night (glow table per house), a parked car at the door after 도시, happiness +1 per house (cap 12). Mission "유리창 달기" (10 houses) | the village at night is dotted with warm windows |

### 7.4 What the player does there, minute to minute

- **The main loop:** watch the ferry come in, guide tourists by restocking the harbour market, fill the export pad before the cargo ship's horn, sell tuna at the auction bell, launch trawlers, and ride the train between three stations.
- **Charm on the phone:**
  - ships really bob on the live water: `water.heightAt`, `slopeAt` and `addHull` (the water report's API);
  - V-wakes (`fx_wake_v2`) and gulls following the ferry and the trawler;
  - deck passengers waving (`deckPoints`);
  - the crane's crate swinging past the screen;
  - at night the lighthouse beam sweeping over the sea and the train's lamp crossing the coast.
- **Harbour people:** dock workers (`dock_worker`), sailors, the auctioneer, the lighthouse keeper, tourists (harbor presets); `npc_captain` (villagers2) on the ferry deck.
- **Missions:** A17, A18, B7, B8, C10, D7, D10, D11, E4–E6, F9, G4.

---

## 8. v7 — 햇살 해변 (Sunny Beach)

### 8.1 How it opens

1. **The rumour (harbour ★2 + v7).** Ferry tourists ask "따뜻한 바다는 어디예요?". The harbour master (`harbor_office`) shows an old map: "언덕 너머 남쪽엔 따뜻한 해류가 흘러서 눈이 안 쌓인대요."
2. **해변 가는 길.** A path site at the 해안 대로's south side (5,000 + 30 planks, 15 s).
3. **E7 남쪽 해안 탐험**, walking down the 해변길:
   - The snow thins (the `ground_sand_snow_edge_*` kit), pines turn into `beach_pine` and then palms (`palm_tree_a/b` swaying).
   - Snowfall FX stop at the beach region's edge, and `bgm_harbor` crossfades to `bgm_beach` over 6 s.
   - The fog over `beach` + `beach_w` clears and the camera pans along the shore: white sand, turquoise water with caustics (Water region, `tropical` palette, shore type `sand`), lace foam rolling up the sand and leaving a darker wet band, and crabs scuttling.
   - Banner **"햇살 해변을 찾았어요!"** / "따뜻한 해류 덕분에 눈이 녹은 바닷가예요".
4. **E8 해변 청소:** 12 bits of seaweed and driftwood. The `beach_gate` (board text "햇살 해변") pops up at the end of the 해변길.

### 8.2 Building the resort

| # | Step | Cost / build | What starts | Smart t |
|---|---|---|---|---|
| 1 | **인명구조대** (`lifeguard_station` + `lifeguard_tower`) | 6,000 + 30 planks + 6 ingots, 12 s | Swim buoy lines appear (`swim_buoy_line_x/_y` bobbing). Banner **"해수욕장 개장!"**. Tourists come by ferry → bus line D (갈매기역 → 해변 문), or on foot | 172 |
| 2 | **해변 주문판** (beach order board at the gate), v4's founding flow | free | 7 founding cards; tourist founders come by ferry; 25 s builds; ribbons | 174 |
| 3 | Beach shops (one card at a time, ≈ 3 min each) | goods at 70 % wholesale + bonus | see §8.3 | 176–200 |
| 4 | **리조트 호텔** (`resort_hotel`) | 40,000 + 120 planks + 60 ingots + 20 glass crates, 30 s | Tourists **stay 2 game days** and spend each day. Doorman, bellhop, receptionist and housekeeper (beachfolk presets) at `staffPoints`. Guests wave from balconies at night (`balconyPoints`) | 190 |
| 5 | Hotel ★2: **수영장** (`hotel_pool` deck over a Water `pool` region) | 20,000 + 40 ingots, 18 s | Swimmers in the pool (`swim`, `fx_swim_ripple`); sunbathers on deck loungers; `sfx_pool_splash` | 205 |
| 6 | **작은 수족관** (`mini_aquarium`) | 18,000 + 30 planks + 20 ingots, 14 s | Rare-fish donations (E10); kids press their noses to the glass (`emote_star`) | 210 |
| 7 | Hotel ★3 + beach ★3 | rooms 12 → 20 → 32 (two upgrades: 15,000 and 25,000) | C12 fireworks; the 햇살 해변 축제 week | 215 |

### 8.3 Beach shops (founding cards; the founder is a ferry tourist who moves in)

| Shop (art) | Card ("…보내 주시면 …을 열게요") | Rent / min | Sells |
|---|---|---|---|
| 파도 카페 (`beach_cafe`) | 빵 40 + 케이크 10 | 30 | bread, cake |
| 구름 아이스크림 (`icecream_shop`) | 설탕 상자 6 + 빵 20 | 35 | ice cream (there is no item art for it: buyers leave with `emote_star` and coins pop) |
| 조개구이집 (`seafood_bbq`) | 생선구이 40 + 훈제고기 20 | 35 | fish, meat (grill smoke from `fxPoints.smoke`) |
| 바닷가 편의점 (`convenience_store`) | 통조림 40 + 빵 30 | 40 | cans, bread |
| 기념품 가게 (`souvenir_shop`) | 판자 40 + 주괴 15 | 30 | souvenirs (abstract) |
| 수영복 가게 (`swimwear_shop`) | 천 상자 8 | 30 | unlocks swimwear for our own residents (C13 polar swim) |
| 서핑 가게 (`surf_shop`) | 판자 60 | 30 | surfers appear (`surf` anim, `surfboard_rack`) |

After ★2, three free extras appear with the hotel: `beach_bar` (코코넛 바, night glow), `pension` (family tourists), `beach_arcade` (lights anim).

### 8.4 Beach life (what moves on screen)

| Who / what | Anim / art | Rule |
|---|---|---|
| Swimmers | `swim` (waterline cut), `fx_swim_ripple`, `water.ripple()` about 1/s | inside the buoy lines; ≤ 12 live |
| Sunbathers | `sunbathe` on `decal_towel_*` and `sun_lounger` (`lyingFeetDirs`) | under parasols (`parasol_*`, flutter) |
| Kids | `dig` at `sandcastle_build_0..3` (a stage every 20 s), `splash_play` at the shore, `float` in swim rings | C11 contest |
| Volleyball | `ball_throw` / `ball_catch` at `volleyball_net` (`impactFrame`, `beach_ball_bounce`) | 4 players |
| Lifeguard | on the tower (`staffPoint`, `lookDir`); whistles (`sfx_lifeguard_whistle`) when someone swims past the buoys, and waves them back | ≤ 1 whistle per 40 s |
| Boats | `swan_pedal_boat` (tourists pedal in the shallows), `kayak_crew`, `banana_boat_crew` towed by a `yacht` | ≤ 4 on the water |
| Ice-cream cart | `icecream_cart` bell anim + `sfx_icecream_bell`; a queue of kids | B9 restock |
| Crabs, kites, gulls | `crab` walking sideways; `kite` over the dunes; gulls | E11 |
| Sounds | `amb_beach`, `sfx_wave_wash*`, `sfx_wave_crash_*` on the rock headland, `sfx_beach_kids_*`, `sfx_sand_step_*` for the chief on sand | — |
| Night | string lights (`string_lights_x/_y`), `bbld_glow` sheets at dusk, couples walking the boardwalk at sunset | — |

**C13 북극곰 수영 대회** happens back at our snowy village coast: residents in swimsuits run into the winter sea (`swim` with `emote_cold`), splash out shivering, and the crowd cheers. It is the designer's own idea, reusing the beach anims in the snow, and probably the funniest scene in v7.

---

## 9. v8 — 살아 있는 도시 (the living city)

### 9.1 How it opens

1. **The note.** After beach ★2: the bank manager's letter (`item_letter` mission). "가게들이 물건을 더 빨리 받고 싶어해요. 큰 물류 센터를 지으면 어떨까요?"
2. **물류 센터** on the harbour back hill (`logistics_lot`): 50,000 + 150 planks + 80 ingots, 30 s.
3. **The cutaway tutorial.** "건물을 눌러 보세요!": a tap (or hover on PC) inside `revealPoly` fades `_shell` and the dock leaves.
   - Inside: tall racks whose stock height follows the real stock (`rackSlots`, `itemFit`), a forklift on its loop beeping (`sfx_forklift_beep`), the conveyor (8 f), pickers and a packer.
   - The office clerk stamps a receipt at the settlement counter (`sfx_stamp`, `sfx_coin_count`).
   - Shop owners arrive in `delivery_van`s (3 colours) or by bus, queue at `customerPoints`, settle, and drive off loaded.
   - Settlement pays **wholesale + 15 %**.

### 9.2 Steps

| # | Step | Cost / build | What starts | Smart t |
|---|---|---|---|---|
| 1 | 물류 센터 | above | trucks and vans route via the centre (deliveries/day counter) | 222 |
| 2 | **가구 공방** (`furniture_workshop`, M plot) | 9,000 + 30 planks, 10 s | planks 3 → 1 furniture (chair 25, table 40, sofa 70, bed 80, wardrobe 90), 6 s | 225 |
| 3 | **가전 공장** (`appliance_factory`, M plot) | 12,000 + 30 ingots, 10 s | ingots 3 → 1 appliance (radio 50, stove 90, washer 110, fridge 120, TV 140), 8 s | 228 |
| 4 | **House level 3** ("살림살이") | furniture 3 + appliance 1 per house (B12) | happiness +2 per house (cap 16); diaries: "새 소파가 왔다!" | 230+ |
| 5 | **경찰서** (`police_station`, SQ2) | 15,000 + 60 planks + 30 ingots, 16 s | 2 officers patrol by car and on foot; the `wanted_board` appears at the plaza beside the mission board | 232 |
| 6 | **서리 소방서** (`fire_station`, XL plot) + **소화전** (`fire_hydrant`, 400 each) | 12,000 + 40 planks + 30 ingots, 14 s | the fire truck; C14 drill; every hydrant lowers the fire rate 5 % (cap −40 %) and halves the response time nearby | 235 |
| 7 | **솔방울 신문** | free (C15) | every game day at 07:00 (§9.3) | 238 |
| 8 | Moving in / out | — | moving trucks (§9.4) | 240 |
| 9 | Incidents (if 사건·사고 = 켜기) | — | §10 | 242+ |
| 10 | **Rank 4 큰 도시** | bars + 120,000 | §9.5 | ≈ 265–270 |

### 9.3 The story network made visible

- **솔방울 신문** (`ui_newspaper` panel; `sfx_newspaper`): a masthead, a headline, 3 articles and a sidebar, all from `story.newspaper(lang)`. Headlines cover weddings, births, new shops, ships, fires and arrests. Residents quote it ("오늘 신문 봤어? 조개구이집이 개업했대!").
- **Rumours:** a small `ui_icon_rumor` (ear) floats over gossiping pairs. Tapping one shows how the rumour changed along the chain (E13).
- **Questions:** `fx_question_mark` over someone asking ("새로 이사 온 사람 봤어?"); `fx_lightbulb_idea` when they learn the answer.
- **Memories of the chief:** a `fx_memory_sparkle` when someone remembers a deed of the chief.
- **The name card** (v4 P1, finished here): name, age, job, home, 단짝, spouse, children, likes, the last thing they remember about the chief, and the **수다 떨기** button (C2 chat).

### 9.4 Moving in and out

- **In:** a `moving_truck` pulls up (`unload` ramp), movers (`mover` preset, `carry_box` anim) carry `cardboard_box_*` to the door, a `welcome_mat` appears, and the card reads "{family}네가 이사 왔어요!". A21 and B12 hook in.
- **Out:** a `for_sale_sign` goes up, the family waves goodbye at the bus stop, and a `sold_sign` follows.
- **Driven by:** story `moves`, based on housing, jobs and happiness. Our population moves both ways, so the rank bar can dip a little; it never drops below the last rank's requirement.

### 9.5 Rank 4 큰 도시

| Bar | Need |
|---|---|
| 인구 (village + district + harbour + beach residents) | 220 |
| 물류 (deliveries settled per game day) | 150 |
| 안심 (incidents resolved within a game day and fires out before a ruin, rolling 10 game days; 100 % if 사건·사고 = 끄기) | 90 % |
| 명성 | 900 (명예로운 촌장) |

- **Ceremony:** 120,000 coins (the bank lends up to 50 %). Banner **"서리시가 큰 도시가 되었어요!"**.
- **Rewards:**
  - `bgm_city` by day in the station district;
  - a 4th coach;
  - bus headways halved;
  - window glows everywhere at night (the city skyline);
  - the rank badge `ui_badge_rank_4`;
  - the endless goal "전설의 도시" (rank 5, P2).

---

## 10. Cute incidents and happenings (how often, how gentle)

**Happenings (v5–v7)** are harmless little scenes with no crime, run by `Happenings.js`:
- at most 1 active at a time;
- at least 150 s apart, about one every 300 s on average;
- never during driving, ceremonies, weddings or farewells;
- only near the chief (within 900 px) or announced with a small toast that has a "보러 가기" button.

| # | Name | Version | What happens | Chief's part |
|---|---|---|---|---|
| P1 | 콩이의 빵 도둑질 | v5 | 콩이 snatches a loaf from the market shelf and trots off; kids chase, laughing (`emote_laugh`); the shopkeeper gives `emote_anger` and then laughs | whistle: 콩이 comes back with its head low (`emote_sweat`). +2 fame |
| P2 | 날아간 눈사람 모자 | v5 | wind blows a snowman's hat off; a kid runs after it | — (watch) |
| P3 | 지붕 위 고양이 | v5 | 나비 is stuck by a chimney (`emote_question`); kids gather | stand there 3 s: it jumps into the chief's arms (`emote_heart`). +3 fame |
| P4 | 배고픈 말 | v5 | the sleigh bus horses stop at a stop and nuzzle a passenger's bag | wheat 2 (A13 shortcut) |
| P5 | 증기 짐차 김 빠짐 | v5 | the wagon stops with a big `sfx_steam_whistle` hiss and a puff; kids push; it chugs on | — |
| P6 | 길 잃은 펭귄 | v5 | 뽀삐 waddles onto the bus (E3 shortcut) | lead it home |
| P7 | 갈매기의 생선구이 습격 | v6 | a gull swoops and takes a grilled fish from a tourist's hand; the tourist stares; the crowd laughs | — |
| P8 | 크레인 상자 흔들흔들 | v6 | a crate swings a little too far; dock workers shout `emote_exclaim`, then thumbs up | — |
| P9 | 꽃게에 물린 발가락 | v7 | a crab nips a sunbather; they hop (`splash_play`) with `emote_tear`, then laugh | — |
| P10 | 파도에 무너진 모래성 | v7 | a big wash flattens a sandcastle (stage 3 → 0); the kid shrugs and starts again | — |
| P11 | 날아간 비치볼 | v7 | the ball floats out past the buoys; the lifeguard whistles and paddles a `rescue_board` to get it | — |
| P12 | 바람에 날아간 파라솔 | v7 | a parasol rolls along the sand; two tourists chase it | stand in its path: it stops. +2 fame |

**Incidents (v8; story engine; toggle "사건·사고: 켜기 / 끄기", default 켜기).** The engine defaults were tuned for a headless 250-person month. The game sets one multiplier, `incidentRate: 0.4`, plus `fireRate: 0.05`, so no per-kind engine patch is needed:

| Incident | Engine default /day | **Game rate /day** (≈ 220 people) | On screen | Rules |
|---|---|---|---|---|
| 좀도둑 (빵·생선 슬쩍) | 0.6 | **0.24** | act → **chase** (`bgm_chase`, `run`/`flee`, the officer's whistle) → arrest (`arrested_walk`, `sfx_cuffs_click`) → station cell (door anim) → apology and release next morning. If not caught: a wanted poster → tip → arrest | culprits are teens or adults, never elders, police, firefighters, bank staff or the named villagers (engine rule) |
| 새치기 | 0.7 | **0.28** | `argue` in the queue → apology (`emote_sweat`) | — |
| 눈덩이 유리창 | 0.4 | **0.16** | a snowball hits a window (`fx_snowball` + `sfx_collapse_soft` at 0.3; there is no glass sfx) → next day, apology with a parent | kids only |
| 티격태격 | 0.3 | **0.12** | `fx_fight_cloud` (stars, fists) → police whistle → separate → reconcile next day | same age band only; elders never |
| 화재 | 0.18 | **0.05** (−5 % per hydrant, −40 % max; ≥ 4 game days apart) | smoke (`fx_smoke_column`) → a resident pulls the alarm (`fire_alarm_post`, `sfx_fire_alarm_bell`) → **everyone walks out and watches** → the fire truck (`sfx_siren_fire`) → hose (`spray_hose`, `fx_hose_stream`, `fx_water_mist`, `fx_steam_puff`) → out. Late: **ruin** (`ruin_*`, scorch decal, `insurance_sign`) → excavator + dump truck **demolition** → site → **rebuilt one level better** (insurance + bank loan) | **nobody is ever hurt**; the crowd claps when it's out (`sfx_crowd_cheer_small`); the first fire comes only after the fire drill; a happy city has fewer |
| 고양이 구조 | engine | 0.1 | the firefighters bring a ladder (`point`) and the cat comes down | +3 fame if watched |

The city-wide rate adds up to **≈ 0.95 visible-or-reported incidents per game day** (one per ≈ 10–11 real minutes), mostly comic. Fires average ≈ 1 per 20 game days (≈ 3.3 h). With 사건·사고 = 끄기, `incidents: false` cancels any scheduled incident and the 안심 bar reads 100 %.

---
## 11. Balance

### 11.1 Income model (to be measured by the bots; the plan is sized on these)

| Milestone (smart t) | Income I (coins/min, 5-min average, excluding missions and loans) | Main new sources |
|---|---|---|
| 읍 (49) | ≈ 1,800 | v3 lines, plaza + visitors, rent 145, restaurant, hall tax, wholesale |
| 도시 (≈ 100) | ≈ 3,500 | buses bring townsfolk to the plaza (+20–30 % retail), steam wagon → wholesale, bank interest, more rent |
| harbour ★2 (≈ 150) | ≈ 5,500 | ferry tourists, auction ×1.5, export contracts ×2.0 |
| beach ★3 (≈ 215) | ≈ 8,000 | hotel stays, 7 beach shops (rent + wholesale), aquarium |
| 큰 도시 (≈ 270) | ≈ 11,000 | settlement +15 %, furniture and appliances |

**Rule:** every guided purchase costs 0.8–4 minutes of the income at its moment; ceremonies cost 7–11 minutes, with the bank lending up to half. Mission coin rewards follow `I` automatically (§4.4).

### 11.2 `BALANCE.v5` (designer-facing comments in Korean, the house style)

```js
// =====================================================================
//  (v5) 탈것의 시대 · 촌장 미션과 명성 · 주민의 일생 · 은행 (docs/v5_v8_plan_player.md)
// =====================================================================
v5: {
  // ── 새 길·차고지·정류장: coins = 코인, item_* = 자재, time = 짓는 시간(초)
  depot:       { coins: 3000, item_plank: 30, item_ingot: 6, time: 10 },    // 마구간 차고지 (도시가 되면 버스 차고지로)
  road:        { coins: 5000, item_plank: 40, item_ingot: 10, time: 20 },   // 서리 큰길 (광장 동문 ↔ 서리역)
  stop:        { coins: 600, time: 3 },                                      // 정류장 하나
  freightYard: { coins: 1200, time: 4 },                                     // 서리 화물장 (짐꾼이 남는 물건을 두는 곳)
  // ── 탈것: speed = m/초 (1m = 64px), seats = 자리, dwell = 정류장에 서 있는 시간(초), headway = 같은 노선 버스 간격(초)
  sleighBus:  { coins: 3500, speed: 3.0, seats: 8, dwell: 8, headway: 70 },   // 말썰매 버스
  steamWagon: { coins: 4000, item_ingot: 20, speed: 3.4, capacity: 30, loadTime: 4 },   // 증기 짐차
  retroBus:   { coins: 6000, speed: 5.0, seats: 9, dwell: 6, headway: 50 },   // 레트로 버스 (도시)
  truck:      { coins: 7000, speed: 5.5, capacity: 40, loadTime: 3 },         // 운송트럭 (도시)
  chiefTruck: { speed: 6.0, coast: 0.6 },                                     // 촌장 트럭: 최고 속도, 손을 떼면 줄어드는 비율
  dogSled:    { speed: 5.5 },                                                 // 개썰매
  cars:       { maxMoving: 6, maxParked: 24, colours: 4 },                    // 주민 자동차 (한 화면 최대, 한 번에 쓰는 색 수)
  traffic:    { green: 6, yellow: 2, red: 6, blockAhead: 1.5, honkEvery: 3 }, // 신호등(초), 앞사람 앞 멈춤 거리(m), 경적 간격
  // ── 미션: board = 게시판 카드 수, refresh = 새 카드가 나오기까지(초), swapAfter = '다른 미션' 버튼(초, 진행은 안 사라져요)
  //    bubbles* = 부탁 말풍선 수(화면 / 전체), requestEvery = 새 부탁 간격(초), payFloor = 시대마다 최소 코인 보상 (× 시대)
  //    income.window = '지금 1분 수입'을 재는 시간(초)
  missions: { board: 3, refresh: 20, swapAfter: 120, bubblesOnScreen: 2, bubblesWorld: 4, acceptedMax: 3,
              requestEvery: [45, 90], bubbleLife: 360, payFloor: 100, income: { window: 300 } },
  daily:  { count: 3, pay: 0.5, fame: 5, allPay: 1.0, allFame: 15, resetHour: 5 },          // 오늘의 미션 (실제 하루, 새벽 5시에 바뀜)
  weekly: { pay: [2, 3, 5], fame: [20, 30, 50], resetDay: 1, resetHour: 5 },                 // 이번 주 목표 (월요일 새벽 5시)
  streak: { rewards: { 2: { fame: 10 }, 3: { decor: 'deco_flowers' }, 5: { pay: 3 }, 7: { fame: 50, flair: 'crown' } },
            shieldPerWeek: 1, comboRequests: 5, comboWindow: 900, comboFame: 5, driveStars: 3, driveFame: 20 },
  drive:  { par: { slackPerStop: 8, vmaxShare: 0.6 }, stars: [1.0, 1.3, 2.0], payByStars: [0.6, 0.85, 1.0], bonusFame3: 5 },
  // ── 명성과 칭호: 새내기 · 믿음직한 · 존경받는 · 명예로운 · 전설의 촌장
  fame: { titles: [0, 150, 400, 900, 2000], settlerBoost: [0, 0.1, 0.1, 0.2, 0.3], touristBoost: [0, 0, 0, 0.2, 0.3] },
  // ── 큰 부지에 짓는 공공 건물 (마을 탭)
  buildings: {
    school:          { coins: 7000, item_plank: 40, item_ingot: 12, time: 14, happy: 3 },
    bank:            { coins: 9000, item_plank: 30, item_ingot: 20, time: 14 },
    clinic:          { coins: 4500, item_plank: 20, item_ingot: 10, time: 12, happy: 2 },
    apartment_a:     { coins: 5000, item_plank: 40, item_ingot: 12, time: 14, people: 24 },
    apartment_b:     { coins: 4200, item_plank: 34, item_ingot: 10, time: 14, people: 18 },
    memorial_garden: { coins: 2500, item_plank: 10, item_ingot: 0, time: 8, happy: 2 },     // 기억의 정원
    parking_lot_s:   { coins: 1500, item_plank: 0, item_ingot: 4, time: 5, happy: 2 },      // 주차장 (도시)
  },
  craft: { bouquetStand: 3, bouquetsPerBed: 6, bouquetBuy: 25, cakeBread: 12, cakeTime: 20, giftItems: 3 },  // 꽃·케이크·선물 상자
  // ── 은행: 이자(하루에), 저금 한도, 대출 = 지금 1분 수입 × loanMinutes 까지, 수수료, 수입에서 갚는 비율
  bank: { interestPerDay: 0.01, depositCap: 50000, loanMinutes: 15, loanFee: 0.05, repayShare: 0.1, ceremonyShare: 0.5 },
  // ── 주민의 일생: yearDays* = 1살 먹는 데 걸리는 게임 날 수 (아이 / 어른), weddingEvery = 결혼식 간격(게임 날)
  //    farewell* = 하늘나라 여행 (설정 '생애 이벤트'를 끄면 없어요)
  life: { yearDaysKid: 1.5, yearDaysAdult: 4, weddingEvery: [6, 9], weddingNotice: 2, babyAfterWedding: [3, 5], babyEvery: [4, 6],
          clinicNight: true, schoolAge: 7, walkAge: 4, birthdaysPerDay: 1, wishAge: 82, wishes: 3,
          farewellMinAge: 86, farewellFirstAfter: 180, farewellGapDays: 15, freezeAgeWhenOff: 85, cardsQueue: 3 },
  // ── 도시 승격: people = 인구, fame = 명성, riders = 하루 버스 승객, coins = 승격식
  rank: { 3: { people: 100, fame: 400, riders: 120, coins: 24000 } },
  ceremony: { length: 14, skipAfter: 3 },
  happenings: { gapMin: 150, every: 300, maxActive: 1, range: 900 },          // 귀여운 해프닝 (도둑·불 아님)
},
```

### 11.3 `BALANCE.v6`, `v7`, `v8` (abridged; same style)

```js
v6: {   // ── 갈매기 항구
  railExt:   { coins: 12000, item_plank: 80, item_ingot: 40, time: 25 },  // 동쪽 철길 잇기
  station:   { coins: 8000,  item_plank: 40, item_ingot: 20, time: 14 },  // 갈매기역
  auction:   { coins: 6000,  item_plank: 30, time: 12, every: 50, premium: 1.5, tunaPrice: 30 },
  lighthouse:{ coins: 3000,  item_ingot: 10, time: 8 },
  terminal:  { coins: 15000, item_plank: 60, item_ingot: 30, time: 18 },
  ferry:     { every: 100, dwell: 30, tourists: [8, 20], wantMin: 2, wantMax: 5, stayFerries: 2 },
  crane:     { coins: 20000, item_plank: 40, item_ingot: 40, time: 18 },
  cargo:     { every: 600, dwell: 120, exportMult: 2.0, deadlineShips: 1 },
  imports:   { sugar: { crates: 6, cakeRecipe: { item_bread: 2, sugar: 1, time: 2.4 } }, cloth: { crates: 8 }, glass: { crates: 10, houseLv2: true } },
  shipyard:  { coins: 25000, item_plank: 60, item_ingot: 30, time: 20 },
  trawler:   { coins: 30000, item_plank: 80, item_ingot: 40, build: 60, trip: 75, catch: 8, max: 3 },
  stars:     { 2: { ships: 20, exports: 200, tourists: 150 }, 3: { ships: 60, exports: 800, tourists: 600 } },
  train:     { harbourCycle: 130, visitorsMult: 2 },
},
v7: {   // ── 햇살 해변
  path:      { coins: 5000, item_plank: 30, time: 15 },
  cleanup:   { pieces: 12 },
  lifeguard: { coins: 6000, item_plank: 30, item_ingot: 6, time: 12 },
  founding:  { order: ['beach_cafe', 'icecream_shop', 'seafood_bbq', 'convenience_store', 'souvenir_shop', 'swimwear_shop', 'surf_shop'],
               rent: { beach_cafe: 30, icecream_shop: 35, seafood_bbq: 35, convenience_store: 40, souvenir_shop: 30, swimwear_shop: 30, surf_shop: 30 } },
  hotel:     { coins: 40000, item_plank: 120, item_ingot: 60, glassCrates: 20, time: 30, rooms: [12, 20, 32], stayDays: 2, spendPerDay: [20, 45], up: [15000, 25000] },
  pool:      { coins: 20000, item_ingot: 40, time: 18 },
  aquarium:  { coins: 18000, item_plank: 30, item_ingot: 20, time: 14, rareChance: 0.04 },
  live:      { swimmers: 12, sunbathers: 16, boats: 4, crabs: 6 },
  stars:     { 2: { shops: 5, hotel: 1 }, 3: { shops: 7, pool: 1, aquarium: 1 } },
},
v8: {   // ── 살아 있는 도시
  logistics: { coins: 50000, item_plank: 150, item_ingot: 80, time: 30, settleBonus: 0.15, vans: 3 },
  furniture: { coins: 9000,  item_plank: 30, time: 10, recipe: { item_plank: 3 }, make: 6 },
  appliance: { coins: 12000, item_ingot: 30, time: 10, recipe: { item_ingot: 3 }, make: 8 },
  prices:    { item_chair: 25, item_table: 40, item_sofa: 70, item_bed: 80, item_wardrobe: 90,
               item_radio: 50, item_stove_iron: 90, item_washer: 110, item_fridge: 120, item_tv_retro: 140, item_cake: 18 },
  police:    { coins: 15000, item_plank: 60, item_ingot: 30, time: 16, officers: 2 },
  fire:      { coins: 12000, item_plank: 40, item_ingot: 30, time: 14 }, hydrant: { coins: 400, fireCut: 0.05, cutMax: 0.4 },
  incidents: { on: true, incidentRate: 0.4, fireRate: 0.05, fireGapDays: 4 },     // 사건 배율(이야기 엔진 기본값 × 0.4), 불(하루에), 불 사이 최소 날 수
  newspaper: { hour: 7 },
  rank:      { 4: { people: 220, deliveries: 150, safety: 90, fame: 900, coins: 120000 } },
},
```

### 11.4 Pacing targets (bots; §17)

| Milestone | Smart | Think / arrow | Pure arrow |
|---|---|---|---|
| 읍 (v4, unchanged) | 47.5–52 | ≤ 57 | ≤ 60 |
| first wedding | ≤ 59 | ≤ 64 | ≤ 66 |
| bus reaches the plaza | ≤ 57 | ≤ 62 | ≤ 64 |
| first baby | ≤ 86 | ≤ 94 | ≤ 98 |
| **도시** | **98–106** | ≤ 118 | ≤ 125 |
| harbour open / first ferry | ≤ 110 / ≤ 124 | ≤ 122 / ≤ 138 | — |
| harbour ★2 | ≤ 152 | ≤ 168 | — |
| beach open / hotel | ≤ 170 / ≤ 192 | ≤ 186 / ≤ 210 | — |
| **큰 도시** | **260–275** | ≤ 300 | ≤ 320 |
| longest wait for something new | ≤ 2.0 min | ≤ 2.5 min | ≤ 3.0 min |

**Tuning order** if a version runs fast or slow: (1) rank bars, (2) ceremony coins and the bank's ceremony share, (3) `requestEvery`, (4) build costs, (5) the age speeds (life beats only).

---

## 12. What makes each moment charming on a phone

**General rules (390 × 844 portrait, logical 720 wide):**
- **One thumb.** Every interaction is a walk-on pad, a tap on a person or bubble, or a big button (≥ 88 logical px). Driving uses the same joystick plus one honk button.
- **The 3-second promise.** Every action answers within 3 s with a sound and a motion: coins pop, someone waves, a door opens.
- **Short, warm text.** Korean banners under 16 characters with a 1-line sub-banner, in easy words ("결혼식이 열려요!", "아기 탄생!", "새 이웃이 왔어요"). English mirrors them.
- **The camera respects the player.** Scripted grabs (≤ 3 s each, skippable) only for the proposal, district reveals (rail, harbour, beach), ceremonies, and a wedding the player chose to watch. Everything else is a story card with **보러 가기**.
- **Density.** At most 2 request bubbles, 2 chat bubbles, 3 emotes and 1 story card on screen. A vehicle's horn plays at most once per 3 s.
- **Night.** v4's DayClock tint (darkness 0.45) plus glows from headlights, lit windows (glass, v6), the lighthouse beam, hotel balconies, string lights and lanterns. Each district has one signature night light.

**Signature moments, and why they work on a small screen:**

| Moment | The tiny details that sell it |
|---|---|
| The proposal | Happens in the crowd the player just gathered: one kneel, two bubbles, a burst of hearts |
| Sleigh bus arrival | Bells jingle as it nears; the horses breathe puffs in the cold (`steamPoint` + `fx_smoke`); passengers wave from their seats; kids run beside it; the coachman tips his hat |
| Steam wagon | Its toot at the yard; crates stacked on the bed shrink at each stop as items fly to the shelves |
| Wedding | Guests **change into their best clothes**; the groom sweats; the flower girl's petals; the bell; kids stuck to the cake; a snowy first dance; the "photo" flash |
| Baby | The rocking cradle by the door (no words needed); the stroller's giggle when the chief passes; picking the name |
| First school day | The backpack appears; the child looks back once at the gate |
| Outdoor class | Tiny desks in the snowy yard, kids seated, teacher at the front |
| Grandma's wish | She walks slowly behind the chief onto the bus and sits by the window |
| Farewell | 콩이 sits beside the chief; snowflakes drift *up*; family later say "할머니가 좋아하던 빵" |
| City wipe | Asphalt and white lane lines sweep outward; traffic lights blink on; the first car honks "빵빵" |
| Ferry | The deep horn, gulls following the wake, the deck crowded with waving tourists, the ship rocking on real waves |
| Crane | A crate swings across the screen; the stack grows on the quay |
| Lighthouse | Two beams sweeping over the dark sea while the train's lamp crosses the coast |
| Beach reveal | Snow thinning into sand underfoot, the music crossfade, turquoise water with dancing caustics |
| Beach day | Swimmers' ripples, the lifeguard's whistle at a kid past the buoys, the ice-cream bell and its queue, a crab nipping a toe |
| Polar-bear swim | Residents in swimsuits sprinting into the winter sea and sprinting out shivering |
| Logistics cutaway | Tap, and the roof fades: shelves full of real stock, the forklift beeping, a stamp *thunk* |
| Fire (rare) | Everyone outside watching safely; the hose's steam; applause; a better house rises later |
| Thief chase | Comic chase music, the burglar's loot sack, an apology the next morning with a bow |

---

## 13. HUD, panels and settings

| Element | Where (logical 720-wide, `top = 62 + safeTop`) | Shows | Tap |
|---|---|---|---|
| Mission chip (replaces v4's order chip) | (28, top+212), 300 × 56 | focus mission: icon, title (14 chars), progress line, timer ring | mission panel |
| Fame chip | (348, top+152), 130 × 50, right of the rank chip | `ui_icon_fame` + points; stars for the title; crown flair (streak) | 칭호 tab |
| Rank chip (v4) | (188, top+152) | badge `ui_badge_rank_N`, 3 mini bars for the next rank | rank panel |
| Clock (v4) | (W−62, top+92) | day/night | — |
| Transit chip | above the joystick when standing at a stop or station | "다음 버스 12초 · 어디로?" | destination list |
| Drive HUD | top centre while driving | timer, target stars, next stop arrow; a **빵빵** button in the whistle button's spot | honk |
| Story card | bottom-left, 520 × 120 (`ui_story_card` 9-slice from ui4) | life or district news, icon (`ui_icon_ring`, `ui_icon_baby`, `ui_icon_flower`, `ui_icon_heart_pair`, `ui_icon_newspaper` …), **보러 가기** | ride or peek |
| Request bubble | over a resident's head | `ui_icon_request` + the item icon | the request card |
| Passbook | from the bank pad or the rank panel | `ui_passbook`: balance, interest, loan, 5 nearby residents | — |
| Newspaper (v8) | from a story card at 07:00, or the hall board | `ui_newspaper` | — |

**Mission panel tabs:** 진행 중 · 게시판 · 오늘 · 이번 주 · 칭호. It is non-pausing, closes on a tap outside, and uses `ui_mission_card(_done)` and `ui_progress_*` tinted #e8a33d (v4).

**Settings rows added:**
- **생애 이벤트: 켜기 / 끄기** (v5; 끄기 = 노년까지만, 이별 없음)
- **사건·사고: 켜기 / 끄기** (v8)
- **미션 알림: 켜기 / 끄기** (story cards and mission toasts; off = chip only)

**Designer preview ("이야기 미리보기")** opens by tapping the version label 5 times in settings. It is a list:
- 청혼 보기, 결혼식 보기, 아기 탄생 보기, 첫 등교 보기, 할머니의 소원 보기, 이별 보기 (with a confirm line);
- 버스 타기, 개썰매 배달, 도시 승격식;
- 여객선 도착, 화물선 크레인, 해변 하루, 북극곰 수영, 물류 센터 열기, 도둑 추격, 불 끄기.

Each preview runs on a throwaway copy of the state and does not save. This is how the designer reviews every beat on the phone without waiting hours.

---
## 14. Module split (standalone first, wired after v4 ships)

**Pattern** (it worked for v4's RoadNet and for the story engine): every system is split into a **pure core**, plain JS with no Phaser or DOM, testable in Node, and a thin **Phaser glue** module.
- Each version has one **orchestrator**, like v4's `Neighbours.js`. It owns the lifecycle, prefetch, `serialize()`, `state()` and the `__FV.vN` test hooks, and constructs everything else.
- `Game.js` only constructs the orchestrator, ticks it and passes its save block through.
- Modules are developed standalone in their own folders. Wiring them into the game is the integration step listed in §19.

### 14.1 v5

| File | Kind | Owns | Key API | Node / browser test |
|---|---|---|---|---|
| `src/data/missions.js` | data | the 98 templates, daily pool, weeklies, streak rules (ko/en) | `MISSIONS`, `DAILY`, `WEEKLY`, `STREAKS` | `balanceCheck` covers every field |
| `src/systems/v5/MissionCore.js` | pure | eligibility (unlock, cooldown, weights), instances, objective progress from game events, reward formula, daily/weekly by local date, streak + shield, park/resume, serialize | `offer(now, ctx)`, `onEvent(kind, data)`, `accept(id)`, `swap(id)`, `focus()`, `rewards(id, income)`, `rollover(dateStr)` | `missions.test.mjs`: all 98 templates load; every objective type; rollover across midnight, DST and a clock moved backward; shield once per week; swap keeps progress; reward = max(floor, pay × I) |
| `src/systems/v5/Missions.js` | glue | request bubbles on residents and dolls, the boards (props + panel), event pads (잔치 상, 축사, 꽃밭 pick, cake order, gift wrap), game events → core, arrows and hints | `update(dt)`, `focusTarget()` (for Tutorial), `__FV.v5.mission(id, op)` | `v5.mjs` |
| `src/systems/v5/Fame.js` | pure | points, titles, reward unlocks, flairs | `add(n, src)`, `title()`, `on('title', fn)` | node |
| `src/systems/v5/TransitCore.js` | pure | lines, stops, phase clocks per bus (the Rail.js timetable idea), riders per game day, fast-travel booking | `lines`, `eta(stop)`, `book(from, to)`, `ridersToday()` | `transit.test.mjs` |
| `src/entities/v5/Vehicle.js` | Phaser | one vehicle: SE/NE frames + mirror, shadow ellipse, `over_*` overlay, seats with dolls, lights, horn, lane follower on `RoadNet.route(…, {mode:'drive'})`, yield/stop rules | `drive(route)`, `stopAt(pt, dir)`, `seat(doll, i)`, `honk()` | `vehicles.mjs`: no overlap, yields at crosswalks, obeys lights, depth by footprint |
| `src/systems/v5/Transit.js` | glue | spawns buses per line, stop sprites, boarding/alighting (TownSim riders, settlers with luggage), the chief's rides (train too) | `ride(from, to)` | `v5.mjs` |
| `src/systems/v5/Freight.js` | glue | 서리 화물장 remote sink; steam wagon / truck as a remote logistics carrier | — | `v5.mjs` |
| `src/systems/v5/Drive.js` | glue | the chief's driving: joystick → lane choice at junctions, coast, honk, par/stars, never fails | `start(routeSpec)`, `update(dt, input)` | `drive.mjs` |
| `src/systems/v5/StoryLife.js` | glue | creates and ticks `tools/story` (loaded as a lazy `story.js` chunk, like `chat.js`), maps story ids ↔ bodies (Resident / TownSim citizen / settler), plays talks through Bubbles, forwards game reports, emits life beats to LifeEvents, its own save key | per `build_reports/story.md` §6 | `story_bridge.mjs` |
| `src/systems/v5/LifeEvents.js` | glue | stages proposal, wedding, good news, birth, naming, first school day, outdoor class, wishes, farewell, birthdays; setting `life`; `preview(kind)` | `stage(ev)`, `preview(kind)` | `life_events.mjs` |
| `src/core/Townfolk2.js` | port | `tools/townfolk2_compose.js` merge rules, `setFace`, new presets; pages per anim group | `TF2.ready(group)` | parity test (1000 people, as v4) |
| `src/systems/v5/BankCore.js` + `Bank.js` | pure + glue | the chief's deposit, interest, loan and repayment; passbook data (chief + story residents); the cutaway on entry | `deposit(n)`, `loan(n)`, `tick(day)` | `bank.test.mjs` + `v5.mjs` |
| `src/systems/v5/Era.js` | glue | era state; the 도시 ceremony (RoadNet upgrades, vehicle swaps, depot swap, car spawn) | `promote(3)` | `v5.mjs` |
| `src/systems/v5/Happenings.js` | glue | the 12 cute happenings (§10), with gaps and caps | `update(dt)` | `v5.mjs` |
| `src/scenes/UIv5.js` | UI | mission chip and panel, fame chip, transit chip, drive HUD, story cards, passbook, settings rows, the preview menu | — | `shots_v5.mjs` |
| `src/systems/V5.js` | orchestrator | lifecycle (construct at rank ≥ 2), prefetch, serialize, `state()`, `__FV.v5` | `update(dt)`, `serialize()` | all |

### 14.2 v6, v7, v8

| Version | Files | Notes |
|---|---|---|
| v6 | `src/systems/V6.js` (orchestrator), `v6/ShipCore.js` (pure: ferry/cargo/trawler timetables, berth allocation, contracts), `entities/v6/Ship.js` (layered ship container, bobbing via `water.heightAt/slopeAt`, `addHull`, wake, deck passengers, cargo slots), `v6/Port.js` (export pad, imports, customs), `v6/Auction.js`, `v6/Shipyard.js`, `v6/Tourists.js` (TownSim kind `tourist`, ferry boarding), `v6/Lighthouse.js` | the harbour Water region (mole land mask + breakwater shore) is configured by `V6`, not by `Water.js` |
| v7 | `src/systems/V7.js`, `v7/BeachLife.js` (swim/sunbathe/dig/ball/boats as TownSim schedules + water-plane props), `v7/Resort.js` (hotel stays, stars, pool Water region), `v7/BeachShops.js` (v4 `Growth` founding reused with a second board), `v7/BeachEvents.js` | the south-sea Water region (palette `tropical`, shore `sand`, rock headland) |
| v8 | `src/systems/V8.js`, `entities/v8/LogisticsCentre.js` (cutaway layers, rack stock, forklift path, docks, settlement), `v8/Production3.js` (furniture / appliance producers on the v3 Workshop base), `v8/Safety.js` (police and fire staging from story incidents, `ack`), `v8/Rebuild.js` (ruin → demolition → site → better building), `v8/Moving.js`, `v8/Newspaper.js` (panel data), `v8/CityRank.js` | incidents come from the story engine's `incident` events; the game only stages them |

### 14.3 Story-engine patches needed (`tools/story`, exact)

1. **Two-speed aging** (`src/people.js`), replacing the single `yearDays` divide:
   ```js
   export function daysForAge(cfg, age) {
     const yk = cfg.yearDaysKid || cfg.yearDays, ya = cfg.yearDaysAdult || cfg.yearDays;
     return age <= 18 ? age * yk : 18 * yk + (age - 18) * ya;
   }
   export function ageFromDays(cfg, d) {
     const yk = cfg.yearDaysKid || cfg.yearDays, ya = cfg.yearDaysAdult || cfg.yearDays;
     const a = d < 18 * yk ? Math.floor(d / yk) : 18 + Math.floor((d - 18 * yk) / ya);
     return (!cfg.farewell && cfg.freezeAge && a > cfg.freezeAge) ? cfg.freezeAge : a;
   }
   // ageOf: return ageFromDays(e.cfg, (keepNamed ? r.arrived : e.clock.day) - r.birth)
   // makeResident: r.birth = e.clock.day - daysForAge(e.cfg, age) - rng.int(age < 18 ? yk : ya)
   // world.js:79  const grown = a >= daysForAge(e.cfg, 19)
   ```
   `DEFAULTS` gains `yearDaysKid: 0, yearDaysAdult: 0, freezeAge: 0` (0 = use `yearDays`). The serializer already saves every `DEFAULTS` key.
2. **Wedding timing and place** (`src/life.js` `engage()`):
   - `day = e.clock.day + (inDays ?? e.cfg.weddingInDays)` with `DEFAULTS.weddingInDays: 2`;
   - the hall is `e.world.first('town_hall', { prefer: 'ours' })`, so the game passes both halls and ours wins when built.
3. **Game-driven arrangements** (new `engine.arrange(op, data)`):
   - `propose { a, b, inDays }`: makes them sweethearts if needed, then engages; used for the scripted first proposal;
   - `nameBaby { id, name: {ko, en} }`;
   - wishes use the existing `report('fact', …)`.
4. **Incidents:** `incidentRate: 0.4`, `fireRate: 0.05`. `setToggles({ incidents, farewell })` already exists.
5. Re-run `node --test tools/story/test/*.test.mjs` plus a new `aging.test.mjs` (age milestones at the configured days; freeze when farewell is off; old saves keep their ages).

### 14.4 Data shapes the designer may meet

```js
// world.js — (v5) 새 길·정류장·부지 (격자 L(i, j), docs/v5_v8_plan_player.md §3.3)
WORLD.v5 = {
  streets: [
    { id: 'conn_w', axis: 'x', i: [-17, -5], j: [-5, -1], cls: 'dirt', upgrade: { 3: 'asphalt' }, name: 'st_conn' },
    { id: 'conn_jog', axis: 'y', i: [-7, -3], j: [-8, -1], cls: 'dirt', upgrade: { 3: 'asphalt' } },
    { id: 'conn_e', axis: 'x', i: [-3, 8], j: [-8, -4], cls: 'dirt', upgrade: { 3: 'asphalt' } },
    { id: 'south', axis: 'x', i: [19.5, 34], j: [-28, -24], cls: 'dirt', upgrade: { 3: 'asphalt' }, name: 'st_south' },
    { id: 'ave_ext', axis: 'y', i: [30, 34], j: [-28, -18], cls: 'cobble', upgrade: { 3: 'asphalt' } },
  ],
  stops: { S1: { i: -15, j: -0.45, art: 'sleigh_stop' }, S2: { i: 3.2, j: -3.6, art: 'sleigh_stop' }, S3: { town: 't_sled' }, S4: { i: 37, j: -14.6, art: 'road_sign_round' } },
  lines: { A: ['S1', 'S2', 'S3'], B: ['S2', 'S4', 'apts', 'S2'] },
  yard: { x: 1814, y: 1072 }, boardPlaza: { zone: 'plaza', mx: 4.6, my: -2.6 },
  lots: { SQ1: { i: 22.0, j: -21.0, only: 'depot' }, SQ2: { i: 27.3, j: -21.0, size: 'XL' } },
  plots: { ws_x1: { x: -930, y: 2800, size: 'XL' }, ws_x2: { x: -420, y: 2800, size: 'XL' }, ws_x3: { x: -930, y: 3170, size: 'XL' },
           w_garden: { x: -400, y: 3180, only: 'memorial_garden' } },
  removeDecor: [[2620, 1290], [2690, 1360], [2590, 1420], [2780, 1420], [2700, 1360], [2580, 1400], [1880, 1005], [2440, 1310], [2440, 1440]],
  moveDecor: [[2010, 905, 'sidewalk'], [2230, 1060, 'sidewalk']],
};
```

---

## 15. Save and migration

| Version | `SAVE_VERSION` | New block | Migration |
|---|---|---|---|
| v5 | 6 → **7** | `v5` | `MIGRATE[6] = s => ({ ...s, v: 7 })`. `sanitizeV5` passes the block through when V5 isn't constructed (v4's rule) |
| v6 | 8 | `v6` | same pattern |
| v7 | 9 | `v7` | same |
| v8 | 10 | `v8` | same |

**The `v5` block** (game save target ≤ 8 KB total, write ≤ 2 ms):

```js
v5: { v: 1, era: 2 | 3,
  fame: { pts, title: 0..4, flair: { crown: tEnd, driver: tEnd } },
  missions: { board: [inst] ≤ 3, active: [inst] ≤ 6, parked: [inst] ≤ 6, bubbles: [{ tpl, who, t }] ≤ 4,
              cool: { tplId: tUntil } ≤ 98,
              daily: { date: 'YYYY-MM-DD', ids: [3], got: [3], done: [3] }, weekly: { week: 'YYYY-Www', id, stage, got },
              streak: { n, last: 'YYYY-MM-DD', shieldWeek: 'YYYY-Www' }, combo: { n, t } },
  transit: { stops: ['S1', 'S4'], buses: { A: 1..3, B: 0..3 }, riders: [10 game days ring] },
  freight: { yard: bool, wagons: 0..3 }, lots: { SQ1: 'depot' | 'bus_depot', SQ2: key | null }, plots: { ws_x1: key | null, … },
  bank: { deposit, loan: { left, fee } | null, lastDay },
  life: { setting: 'on' | 'nofarewell', firstCouple: [idA, idB], seen: { proposal, wedding, baby, school, wish, farewell },
          names: [[storyId, ko, en]] ≤ 40, garden: [{ ko, en, day }] ≤ 6, gardenOld: n },
  happen: { last: t }, rank3: bool }
```

**Story save.**
- It is kept apart from the game save because it is about 0.55 MB after 30 game days and 0.7 MB after a year (story report): key `frostVillage.story.v1`, linked by the game save's `cid` (C2 chat's pattern).
- It is written at each day change (every 600 s) and when the page hides, and never on the 5 s autosave.
- If the key is missing or corrupt, the story regenerates from the seed and the chronicle. People keep their looks, homes and the named villagers; only memories reset. A card explains it gently: "주민들이 오늘 일을 조금 잊어버렸어요".
- On a quota error the engine's `memCap` drops from 40 to 30 and it retries.

**Old saves:**
- A v4 save already at 읍 constructs V5 on load and plays the proposal 5 s after the first frame (once, `progress.seen.v5intro`).
- Saves before 읍 never see v5 until the 읍 ceremony.
- Settlers saved as a number become individual settler households on load (seeded), up to the bed count.

---

## 16. Budgets

### 16.1 CPU (fixed-step bench, the v4 method; SwiftShader numbers are relative)

| Item | Budget (per frame unless noted) | Notes |
|---|---|---|
| Story engine | ≤ 0.05 ms per frame on average; a step ≤ 4 ms (desktop bench) | 0.36 ms per game second in visible mode (story report). Steps with p99 above 4 ms move the engine into a Web Worker: no DOM, plain events, a string save |
| Missions + Fame | ≤ 0.03 ms | event-driven |
| Transit + freight + cars (≤ 12 vehicles live) | ≤ 0.25 ms | lane followers; vehicles off screen are analytic (phase clocks) |
| Life staging | ≤ 0.1 ms during an event, 0 otherwise | — |
| Ships (≤ 6) with water sampling | ≤ 0.15 ms | `heightAt` / `slopeAt` once per ship per frame |
| Beach life (≤ 12 swimmers, 16 sunbathers) | ≤ 0.2 ms | swimmers' ripples about 1/s |
| **Logic per tick, worst view** | plaza ≤ 1.6 ms (v4 gate), town ≤ 2.1 ms, harbour ≤ 2.1 ms, beach ≤ 2.3 ms | — |
| Draw calls | ≤ 12 (v4 gate); ≤ 14 during a wedding (townfolk + townfolk2 = 20 textures > 16 units) | Culler from v4 |
| Display objects | v4 + ≤ 150 in any view | bus passengers drawn ≤ 4 per bus (lite rigs) |

### 16.2 Texture memory (MiB, source-sum; must ≤ 455 everywhere; v4 already misses the 300 target at 311–361)

| Asset group | Raw if loaded whole | Plan | Resident in a busy view |
|---|---|---|---|
| vehicles (27 atlases) | 140.4 | pages per vehicle type, acquired in view and released 10 s later; ≤ 5 types resident; ≤ 4 car colourways at a time; low tier: 2 colourways, no passengers | 20–35 |
| vehicle buildings (`veh_depots/street/lots/signs`) | ≈ 15 | by area | 6–10 |
| townfolk2 | 72.6 | pages per anim group (`sit`, `clap`, `sad`, `push`, wedding/mourning parts); only during events, plus `push` while a stroller is in view | 0 / 25–35 during a wedding |
| life2 | 4.5 | `life2_wedding` for weddings, `life2_memorial` near the garden, strollers in view | ≤ 3 |
| ships | 65.8 | by ship in view (layered ship pages) | 20–30 in the harbour |
| harbor | 45.5 | harbour area pages | 25–30 |
| beach + beach_bld (day) | 53.5 + 32 | beach area; `bbld_glow` at dusk only | 45–55 |
| beachfolk | 74.6 | loco + swim/sunbathe pages; social poses on demand | 30–40 |
| logistics | 63.8 | shell always; inside layers only while revealed | 15 / 35 revealed |
| civic | 37.4 | bank / police by area; ruins and demolition during a rebuild | 10–15 |
| cityfolk | 88.2 | pages by incident group (`rush` 30 MiB only during a chase) | 4–17, 47 in a chase |
| fx_city | 41.9 | lazy groups; fire sheets only during fires | 5 / 20 in a fire |

**Gates per stage:** must ≤ 455 (all views) and transient ≤ 480 (≤ 10 s).
- **Targets:** v5 plaza ≤ 340 and tour peak ≤ 395 (today: plaza 311, tour peak 361; v5 adds ≤ 35 in a busy view). Harbour ≤ 260, beach ≤ 280, city view ≤ 320.
- **Prerequisite:** v4's known issue first. `pack_pages.py` must split the 8.1–11.3 MiB v3 atlases and evict `props_buildings`/`bld_*` by area (≈ −40 MiB), which pays for v5.

### 16.3 Downloads and the artifact

| Version | New payload (disk) | Files after packing (pages + index + audio sprites) |
|---|---|---|
| v5 | vehicles 4.6 + townfolk2 4.9 + life2 0.9 + audio3 remainder ≈ 1.5 + `story.js` chunk ≈ 0.6 + missions ≈ 0.05 → **≈ 12.5 MB** | **≤ +20** |
| v6 | ships 3.5 + harbor 1.4 + audio4 2.6 → **≈ 7.5 MB** | ≤ +12 |
| v7 | beach 2.2 + beach_bld 1.6 + beachfolk 5.2 + audio5 remainder ≈ 3.0 → **≈ 12 MB** | ≤ +15 |
| v8 | logistics 1.8 + civic 2.0 + cityfolk 6.0 + fx_city 2.4 + audio6 3.9 → **≈ 16 MB** | ≤ +18 |

- **The binding limit is files, not megabytes:** 501 of 511 per version today, with 10 files of headroom.
- **Rule:** before v5 ships, the build must reclaim **≥ 60 files**:
  1. pack every audio fragment's one-shots into one audio sprite per fragment, keeping music and ambience loops as files. Today `audio`, `audio2` and `audio3` ship 87 files and `voice` 12;
  2. move the remaining per-atlas frame JSONs into `_packed/index.json`.
  - Each later version must stay within its row above.
- **Size:** ≈ 59.5 MB grows to ≈ 108 MB by v8. That fits the 256 MB version cap in ≥ 2 publishes (each ≤ 255 files and ≤ 64 MB), with boot files in the last publish (the v4 rule).

---

## 17. Tests and acceptance

### 17.1 New suites (all fixed-step; Playwright one browser at a time, nohup + poll; Node where pure)

| Suite | Asserts |
|---|---|
| `missions.test.mjs` (node) | §14.1 row; plus every template's unlock is reachable in a scripted progression; no template needs an item the player can't make at its unlock |
| `transit.test.mjs` (node) | headways, dwell, ETA, booking, riders count, 2 buses ⇒ ≥ 120 riders/day |
| `bank.test.mjs` (node) | interest at 06:00, caps, the loan limit (15 min of income), repayment share, ceremony share |
| `aging.test.mjs` (tools/story) | §14.3 |
| `vehicles.mjs` | lane following, yield, lights, never overlapping walkers, depth sort by footprint, mirrors, shadows, no placeholder |
| `drive.mjs` | par and stars, honk clears a crosswalk, a blocked lane waits, quit = ★, never a fail state |
| `v5.mjs` | from a v4 읍 fixture: the proposal plays once; prep pads; wedding with and without prep and without the chief; depot → road → bus at the plaza; yard + wagon wholesale; school, bank, apartment, clinic, garden; good news → birth → naming → stroller; first school day; wish escort; farewell gates and the toggle (no farewell when 끄기, ages freeze); rank 3 bars → ceremony (asphalt cells, depot swap, cars); reload mid-wedding / mid-drive / mid-ride; 0 page errors, 0 placeholders |
| `save_v5.mjs --browser` | v4 saves (before 읍 / at 읍 / mid-founding) load into v5 with nothing lost; story key missing or corrupt → regenerate + card; round trip of every `v5` field; 20 corrupted `v5` blocks boot |
| `v6.mjs`, `v7.mjs`, `v8.mjs` | each district's §7–§9 step table, timetables, contracts, founding, hotel stays, cutaway reveal, an incident through every phase with `ack`, fire → ruin → rebuild, moving in/out, the toggles |
| `texbudget.mjs` (extended) | §16.2 gates per stage, including a wedding, a chase and a fire |
| soak (20 min per version) | heap after GC flat (< 2 MB growth over the last 10 min), listeners, tweens and timers flat, story save size bounded |
| bots (`review_gameplay_sim.mjs --v5..--v8`) | §11.4 targets; 0 stuck, 0 errors; longest gap ≤ 2.0 min (smart). Policies: accept requests, carry for missions, attend weddings, ride buses, drive at ≥ ★★, build the offered buildings, take a loan when bars are full |

### 17.2 Must-look screenshots (390 × 844 + 360 × 640, ko + en; look at each)

- **v5:**
  1. the proposal;
  2. the mission panel;
  3. request bubbles;
  4. the sleigh bus at the plaza;
  5. the steam wagon unloading;
  6. guests changing clothes;
  7. the wedding vows;
  8. the cake crowd;
  9. the cradle by the door;
  10. the stroller walk;
  11. the naming sheet;
  12. the first school day at the gate;
  13. outdoor class;
  14. a grandma riding the bus;
  15. the farewell at the garden (and the same moment with 끄기: no card);
  16. the 도시 asphalt wipe;
  17. the chief's truck drive HUD;
  18. night traffic with headlights.
- **v6:**
  1. the sleepy harbour reveal;
  2. the auction;
  3. the lighthouse at night;
  4. the ferry arriving with deck passengers;
  5. tourists at the harbour market;
  6. the crane swinging;
  7. the export pad;
  8. a trawler launch;
  9. the harbour festival.
- **v7:**
  1. snow turning into sand;
  2. the beach reveal;
  3. swimmers and the lifeguard whistle;
  4. sandcastles;
  5. volleyball;
  6. the ice-cream queue;
  7. a beach shop ribbon;
  8. the hotel;
  9. the pool;
  10. the polar-bear swim;
  11. fireworks;
  12. the night beach.
- **v8:**
  1. the logistics cutaway;
  2. the forklift;
  3. settlement;
  4. the furniture workshop;
  5. a moving truck;
  6. the newspaper;
  7. a rumour chip;
  8. the thief chase and apology;
  9. a fire with the crowd watching;
  10. demolition;
  11. the rebuilt house;
  12. the 큰 도시 ceremony.

---

## 18. Risks and open questions

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| The farewell upsets some players | medium / high | Very old residents only; ≥ 15 game days apart; no illness or death words; the hopeful `bgm_farewell`; 콩이 beside the chief; the wishes come first; the 생애 이벤트 switch. **The designer reviews it in the preview menu before it ships** |
| Story save size and phone storage | medium / medium | Separate key, written per game day; a quota fallback (`memCap` 30); regenerate gracefully |
| Story-engine spikes on old phones | medium / medium | ≤ 4 ms per step gate; the Web Worker fallback is designed in |
| Texture memory with vehicles + townfolk2 + ships | medium / high | Pages per type and anim group, event-only loading, caps on colourways; the v4 big-atlas split first |
| Artifact file count (10 files of headroom) | high / high | Reclaim ≥ 60 files (audio sprites, frame index) before v5 code lands; a per-version file budget |
| Geography: the harbour on a mole and the beach on a new south sea | medium / medium | Needs Water land masks + a re-baked shoreline field for the widened sea (`gen_water_field.mjs` presets), rect regions with `openWith`, and a layout checker per version. Fallback for v6: shorter basin (cargo berth only at ★2) |
| Mission overload on a small screen | medium / medium | Caps (§4.4), the 미션 알림 switch, the focus rule; bots measure bubbles on screen |
| Real-day dailies and clock changes | low / low | Local date strings, no double count on clock rollback, at most one rollover per launch |
| Arrow-only players stall on fame | medium / medium | Passive fame (§4.4), the hint list, the board always offering one doable card |
| Townsfolk2 doubles textures during a wedding (20 > 16 units) | high / low | Accept ≤ 14 draw calls during events only |
| Ships occlude mole buildings | medium / low | The basin is 6 cells deep, so ships sit low on screen; occlusion fade (v4) for ships in front of the terminal |
| Name confusion (badges = rank, ui3 notes = titles; 촌장 vs 시장) | low / low | §4.4 decision; residents keep saying 촌장님 |

**Open questions for the designer** (asked in Korean in Appendix C):
1. The default of **생애 이벤트**: 켜기 (as written in the 기획서) or 끄기?
2. When 생애 이벤트 is turned off after a farewell, should existing memorial stones **stay** (proposed) or hide?
3. **오늘의 미션** by the real calendar day (proposed) or every game day (10 min)?
4. May the chief **name babies** (proposed: yes, 3 choices + "부모님이 정할게요")?
5. City name **서리시** and rank 4 name **큰 도시**: OK?
6. The harbour **on a breakwater mole** with ships between the train and the buildings (proposed): OK, or would you rather have the harbour on the new south sea next to the beach?
7. 사건·사고 default 켜기 (proposed) or 끄기?

### 18.1 Reconciliation with the tech plan (`docs/v5_v8_plan_tech.md`, written in parallel)

Both plans found the same −Y facing problem but solved the map differently. The lead should pick one geography for both documents.

| Topic | This plan | Tech plan | Player-side view |
|---|---|---|---|
| Harbour | on a mole in the **north** sea; basin between the coast and the mole; the train runs in front of the ships | on a new **south** coast east of the town: quay j −12 (i 55–86), a breakwater at j −22 shelters the basin | Both read well on a phone. North mole: the train → ships → buildings → lighthouse layering, and a literal "항구 남쪽 해변". South quay: one warm sea for harbour and beach and a simpler Water setup, but the beach sits east of the harbour rather than south |
| Beach | south coast, beachfront j −20 (i 61–95), shore j −31 | waterline j −19 (i 90–120), east of the harbour | equal; both use the same art and beats |
| Coastal train | one train extended to 갈매기역 (cycle ≈ 130 s, visitors ×2 per arrival) | a second line, town-east halt ↔ 항구역 ↔ 해변역 (≈ 117 s); the v4 shuttle untouched | the tech plan's second line protects v4's tuned economy; adopt it |
| v5 places | depot and police on the 남부길 (SQ1/SQ2); school, bank, clinic and apartments on XL plots in `west_s`; 기억의 정원 in a quiet south-west corner | a "row D" in the station district (j −18…−22): memorial garden, stable depot, bank, bus depot | Row D keeps life events near the action; this plan's `west_s` plots give the player a choice of where civic buildings go. The two layouts overlap at SQ1, so use one of them |

**What does not change** whichever geography is chosen: §4–§13 (beats, missions, progression, balance, charm, HUD). Only §3.3–§3.4 coordinates and a few place words change, e.g. E6's lighthouse "on the mole" vs "on the rocky point", and the "train in front of the ships" line in §7.4.

---

## 19. Integration (seams in shared code; described, not done)

Nothing below was changed. These are the exact seams the integrating builders need once v4 ships.

| File | Change |
|---|---|
| `src/scenes/Game.js` | after the `v4` construction: `if (rank ≥ 2) this.v5 = new V5(this, sv.v5)`, else subscribe to `rank`; tick `this.v5.update(dt)` after `this.v4`; serialize `v5: this.v5 ? this.v5.serialize() : (this.saved && this.saved.v5)`; `__FV.v5`. The same pattern for v6–v8 (each constructed by its trigger) |
| `src/core/Save.js` | `SAVE_VERSION` 7; `MIGRATE[6]`; `sanitizeV5` pass-through; `Settings.data` gains `life: 'on'`, `incidents: true`, `missionToasts: true` (validated like `daynight`) |
| `src/core/Assets.js` | fragments `vehicles`, `townfolk2` (custom, like townfolk), the rest of `life2` and `audio3`; lazy gates per §16.2. v6: `ships`, `harbor`, `audio4`. v7: `beach`, `beach_bld`, `beachfolk`, the rest of `audio5`. v8: `logistics`, `civic`, `fx_city`, `cityfolk`, `audio6` |
| `tools/build/pack_pages.py`, `build_artifact.mjs` | pages for the new fragments; one audio sprite per fragment; the file reclaim of §16.3 |
| `src/data/balance.js` + `balanceCheck.js` | the `v5`–`v8` blocks of §11, every key clamped |
| `src/data/world.js` | `WORLD.v5` (§14.4); `WORLD.v6`/`v7` districts (§3.4); `width` 11264 and `height` 4096 → 5632 at v6/v7; regions `harbor`, `beach`, `beach_w`; border trees with `until` |
| `src/data/strings.js` | ko/en keys: banners (`proposalTitle`, `weddingSoon`, `babyBorn`, `schoolFirst`, `farewellCard`, `cityUp`, `harbourFound`, `beachFound`, `bigCity` …), mission titles via `missions.js`, speech lines `wed_speech_1..8`, wishes, settings rows, preview menu |
| `src/systems/RoadNet.js` | read `WORLD.v5.streets`; `upgrade(id, 'asphalt')` with lane and crosswalk markings (RoadPaint already has the city class, v4 §10.3) |
| `src/systems/Civic.js` | `settlersArrive(n)` → also `town.addDistrictHome(house, n, { kind: 'settler' })` and story residents; keep the `settlers` number for old saves |
| `src/systems/Growth.js` | emit `cardDone` and `shopOpened` events for MissionCore; v7 reuses the founding flow with a second board id `beach` |
| `src/systems/Rank.js` | bars and ceremony data-driven from `BALANCE.vN.rank[level]` (keys `people`, `fame`, `riders`, `deliveries`, `safety`); a ceremony hook `onCeremony(level)` → `gs.v5.era.promote(level)` |
| `src/scenes/UIv4.js` | hide the order chip when `gs.v5` exists (UIv5 puts the mission chip in the same spot) |
| `src/systems/Tutorial.js` | `v5Hint(set, idle)` after `v4Hint` (§4.4 priorities) |
| `src/systems/TownSim.js` | kinds `settler`, `tourist`, the beach kinds; bus riders (like train riders); passenger materialisation at seats |
| `src/systems/Ground.js` / `VillageSea.js` | v6: widen the sea to x 11264, add the mole and breakwater land masks, re-bake the shoreline field; v7: a second Water region for the south sea |
| `tools/story/src/{people,life,engine,world}.js` | §14.3 |

---

## Appendix A. What the designer edits

- `src/data/balance.js` → `v5`, `v6`, `v7`, `v8`: every cost, speed, rate, age speed, rank bar, bank number and incident rate (Korean comments, §11).
- `src/data/missions.js`: every mission (title ko/en, need, reward in "minutes of income", fame, unlock, repeat). Adding a mission is one line.
- `src/data/world.js` → `WORLD.v5` … `v7`: stops, lines, lots, plots and districts as lattice `(i, j)` numbers.
- `src/data/strings.js`: every banner, card, speech line and wish (ko + en).
- Settings: 생애 이벤트, 사건·사고, 미션 알림. Preview menu: version label tapped 5 times.

## Appendix B. Art and audio used per version (no new art)

| Version | Art fragments | Audio |
|---|---|---|
| v5 | vehicles (era 2 + 3 + buildings), roads (lanes, crosswalks, curbs), ui3 (mission cards, icons, badges 3), civic (`bank` cutaway layers only), ui4 (`ui_passbook`, `ui_story_card`, bank icons), life2 (wedding, memorial, decor, strollers, items), townfolk2 (wedding/mourning parts, sit/clap/sad/push), town (school, clinic, apartments, hall, playground), life_props (notice_board, music_stand, bench_seats, picnic_table, lantern_string, igloo, snow_fort, kids_swing), fx, emotes | audio3: `bgm_wedding`, `bgm_farewell`, `sfx_sleigh_bells`, `sfx_horse_trot`, `sfx_steam_whistle`, `sfx_bus_horn`, `sfx_truck_engine`, `sfx_car_honk_1/2`, `sfx_brakes`, `sfx_door`, `sfx_bell_hall`, `sfx_school_bell`, `sfx_baby_giggle`, `sfx_mission_done`, `sfx_fame_up`, `amb_town`, `amb_night` |
| v6 | ships (ferry, cargo_ship, trawler_big, tugboat, sailboat, yacht, seagull), harbor (all), water (harbour palette, wakes, splashes), harbour townsfolk presets | audio4: `bgm_harbor`, `amb_harbor`, `sfx_ship_horn_big`, `sfx_ferry_bell`, `sfx_seagull_1..3`, `sfx_crane`, `sfx_auction_bell`, `sfx_rope_creak` |
| v7 | beach (ground kits, props, boats, crab), beach_bld (all + glows), beachfolk (swim/float/sunbathe/dig/ball/splash/surf + jobs), water (tropical, pool) | audio5: `bgm_beach`, `amb_beach`, `sfx_wave_*`, `sfx_splash_*`, `sfx_lifeguard_whistle`, `sfx_icecream_bell`, `sfx_beachball_bounce`, `sfx_hotel_bell`, `sfx_pool_splash`, `sfx_sand_step_*`, `sfx_beach_kids_*` |
| v8 | logistics (centre cutaway, producers, items, forklift, vans, moving truck), civic (bank, police, ruins, demolition, hydrants, wanted board, moving props), fx_city (fire, smoke, hose, mist, fight cloud, sirens, question/idea/memory), ui4 (newspaper, passbook, story card, wanted poster, icons), cityfolk (all incident roles + run/flee/argue/arrested/spray/point/think/shocked/phone/carry_box/sweep), vehicles (police_car, fire_truck, ambulance) | audio6: `bgm_city`, `bgm_chase`, sirens, fire, hose, steam, collapse, excavator, demolition, bank, warehouse, police, crowd, moving, newspaper, ticket chime |

**Known gaps worked around:**
- no sugar, cloth or glass icons (imports are labelled crates);
- no `sit` anim for the chief (`idle` at `seatsStand` + overlay);
- no glass-break sfx (`sfx_collapse_soft` at low volume);
- no ice-cream item (`emote_star`);
- no fireworks sheet (`fx_spark` / `fx_star` / `fx_glow` bursts, ADD);
- cityfolk roles in v5 (drivers use townfolk `station` / `factory` presets until v8).

## Appendix C. 대표님께 — 한눈에 보는 v5~v8 (쉬운 말)

- **v5 (읍 → 도시)**
  - 승격식이 끝나면 광장에서 **청혼**이 일어나요. 다음 날 11시에 우리 **마을회관에서 첫 결혼식**이 열려요. 촌장님이 축사를 하고, 하객들은 예쁜 옷으로 갈아입고 와요.
  - **미션 게시판**과 주민 머리 위 **부탁 말풍선**이 생겨요. 미션을 하면 코인과 **명성**을 받아요. 명성이 쌓이면 칭호가 올라가요: 새내기 → 믿음직한 → 존경받는 → 명예로운 → 전설의 촌장.
  - **말썰매 버스**가 솔방울 마을 사람들을 우리 광장까지 태워 와요. 촌장님도 정류장에서 타고 다닐 수 있어요.
  - **증기 짐차**가 물건을 실어 날라요. **개썰매**로 편지 배달 경주도 해요.
  - **학교·은행·병원·아파트·기억의 정원**을 지어요.
  - 은행에 저금하면 이자가 붙어요. 큰 공사는 **대출**을 받을 수 있어서 오래 기다리지 않아요.
  - 결혼한 부부에게 **아기**가 생겨요 (이름은 촌장님이 골라 줄 수 있어요). 유모차 산책 → 걸음마 → 첫 등교 → 청소년 → 어른 → 할머니·할아버지로 자라요.
  - 오래 사신 어르신은 **세 가지 소원**을 들어 드린 뒤, 아주 가끔 **"하늘나라 여행"**을 떠나요. 기억의 정원에서 흰 꽃으로 배웅해요.
  - 설정의 **"생애 이벤트: 끄기"**를 고르면 노년까지만 나오고 이별은 없어요.
  - 인구 100 · 명성 400 · 하루 버스 승객 120명이 되면 **도시 승격식**을 해요.
  - 승격식을 하면 길이 아스팔트로 바뀌고, 신호등이 생기고, 레트로 버스·트럭·자동차가 다녀요. 촌장님 트럭으로 **배달 운전 미션**도 해요.
- **v6 갈매기 항구**
  - 철길을 동쪽으로 이으면 바다 위 방파제에 있는 **잠든 항구**가 나와요.
  - 역 → 경매장 → 등대 → 여객선 터미널 → 크레인·세관 → 조선소 순서로 항구를 살려요.
  - **여객선**은 관광객을 데려와요. **화물선**은 수출 주문과 설탕·천·유리를 가져와요 (케이크, 옷가게, 불 켜진 창문). **원양어선**은 참치를 잡아 와요.
- **v7 햇살 해변**
  - 항구 남쪽 언덕을 내려가면 눈이 녹아 **하얀 모래 해변**이 나와요 (따뜻한 해류 덕분이에요).
  - 해변 청소 → 인명구조대 → 관광객이 여는 가게 7곳 → **리조트 호텔**(수영장) → 수족관 순서로 키워요.
  - 모래성 대회, 여름 불꽃놀이, 우리 마을 앞바다의 **북극곰 수영 대회**도 열려요.
- **v8 살아 있는 도시**
  - **물류 센터**(누르면 지붕이 투명해져서 안이 보여요), 가구 공방·가전 공장, 경찰서·소방서가 생겨요.
  - 이사 트럭이 오가고, 매일 아침 **솔방울 신문**이 나와요.
  - 귀여운 **사건**(좀도둑 추격, 새치기, 불 끄기)이 가끔 일어나요. 다치는 사람은 한 명도 없어요. **"사건·사고: 끄기"**도 있어요.
  - 다 이루면 **큰 도시**가 돼요.
- **새 그림은 하나도 없어요.** 이미 만든 그림과 소리만 써요.
- 숫자는 `balance.js`, 미션은 `missions.js`, 글자는 `strings.js` 에서 고칠 수 있어요.
- 설정 화면의 버전 글자를 **5번 누르면 "이야기 미리보기"**가 열려요. 결혼식·아기·첫 등교·이별·화재 같은 장면을 바로 볼 수 있어요.

**대표님께 여쭤볼 것**
1. "생애 이벤트"는 처음에 켜 둘까요, 꺼 둘까요?
2. 이별을 끈 뒤에도 정원의 기억 비석은 그대로 둘까요?
3. "오늘의 미션"은 진짜 하루(새벽 5시에 바뀜)로 할까요, 게임 하루(10분)로 할까요?
4. 아기 이름을 촌장님이 골라 주는 것, 괜찮으세요?
5. 도시 이름은 "서리시", 그다음 등급은 "큰 도시", 괜찮으세요?
6. 항구를 바다 위 방파제에 두는 모양(기차 → 배 → 항구 건물 → 등대 순서로 보여요), 괜찮으세요? 아니면 해변 옆 남쪽 바다에 둘까요?
7. "사건·사고"는 처음에 켜 둘까요?
