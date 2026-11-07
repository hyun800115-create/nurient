# Roadmap patch: fishery chain (2026-11-07)

Exact old → new text edits for three docs. **Do not apply before the 대표 approves `기획서_수산업.md`.** Nothing was applied; the repo is untouched.

- `docs/기획서_시장취임_로드맵.md` (K1–K11)
- `docs/roadmap_mayor/engineering_roadmap.md` (E1–E11)
- `docs/기획서_v6_항구도시.md` (H1–H4)

**How to apply**
- Base: HEAD `96bbe89` (the three docs are identical at `b14f0a4`).
- Each "old" block occurs **exactly once** in its file at the moment it is applied; apply in the order listed. `_tools/make_patch.py` checks this against the repo and writes the patched copies to `_tools/out/`.
- Old strings are kept as short as possible (a table cell, a line start, a heading substring), so they still match after the 돈과 복지 (econ_welfare) patch renumbers 탈것 → v5.3 and 안심 → v5.4 or appends text to the same lines.
- **Six edits touch the same numbers as the econ_welfare patch** (marked **[shared]**: K1a, K3, K5b, E1b, E2, E5b). If the econ patch was applied first, use **Part B** for those six instead. Part B was checked against the econ draft's own exact strings for those rows (its §14); if its final wording differs, apply the rule given with each Part B edit.
- Numbers follow the roadmap convention: planned sum × 1.08–1.26 per version (v4.6: 30.25 + 1.5 = 31.75 → 34–40); spans are sums of version ranges.
- After applying: move `기획서_수산업.md` → `docs/기획서_수산업.md`, `engineering_addendum.md` → `docs/roadmap_mayor/fishery_addendum.md`, and the two `_img/grilledfish_*.png` → `docs/previews/fishery/` (fix the two image links).

## Part A: on HEAD

### `docs/기획서_시장취임_로드맵.md`

**K1a [shared].** 버전 번호 표 (v4.6 줄)

Old:
~~~~text
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 33–38 |
~~~~
New:
~~~~text
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 34–40 |
~~~~

**K1b.** 버전 번호 표 (v6 줄, 아래에 v6.1 줄 넣기)

Old:
~~~~text
| v6 | 갈매기 항구 | 시장 | 150–200 | 25–35 |
~~~~
New:
~~~~text
| v6 | 갈매기 항구 | 시장 | 150–200 | 43–56 |
| v6.1 | 바다 식구들 | 시장 | 160–210 | 9–10 |
~~~~

**K1c.** 버전 번호 표 (v7 줄)

Old:
~~~~text
| v7 | 햇살 해변 | 시장 | 200–245 | 20–28 |
~~~~
New:
~~~~text
| v7 | 햇살 해변 | 시장 | 200–245 | 22–31 |
~~~~

**K2.** 「이 번호를 고른 까닭」 줄 (문장 하나 더하기)

Old:
~~~~text
v5는 한 번에 만들기엔 너무 커서 v5.0–v5.3 네 칸으로 나눴어요 (질문 24).
~~~~
New:
~~~~text
v5는 한 번에 만들기엔 너무 커서 v5.0–v5.3 네 칸으로 나눴어요 (질문 24). 항구 뒤에는 수산업의 둘째 절반을 담는 작은 버전 v6.1 「바다 식구들」이 생겨요 (수산 5).
~~~~

**K3 [shared].** 「모두 합치면」 줄

Old:
~~~~text
시장 취임(v5.0)까지 172–202일, 안심 마을(v5.3)까지 224–272일, v8까지 299–375일이에요.
~~~~
New:
~~~~text
시장 취임(v5.0)까지 173–204일, 안심 마을(v5.3)까지 225–274일, v8까지 329–411일이에요 (수산업 31–36일 포함, `기획서_수산업.md`).
~~~~

**K4a.** v4.3 「11월 7일에 새로 받은 요청」 (마을 주민 창 다음에 넣기)

Old:
~~~~text
  - **마을 주민 창:** 인구수를 누르면 주민 목록이 떠요. 이름, 나이, 성별, 직장, 지금 하는 일이 보이고, 많으면 쪽을 넘겨요. [자세히]를 누르면 가족 관계, 사는 곳, 기본 정보, 지금 행복도, 가치 추구, 직장, 월급 같은 상세 프로필이 나와요. 사진 아래 모서리의 [따라가기]를 누르면 화면이 그 주민에게 바로 가서 따라다녀요. v4.5 「주민 누르기」의 상태 카드와 따라가기를 목록 창으로 먼저 당겨 온 셈이에요. v4.5에서는 주민을 직접 눌렀을 때도 같은 카드가 떠요.
~~~~
New:
~~~~text
  - **마을 주민 창:** 인구수를 누르면 주민 목록이 떠요. 이름, 나이, 성별, 직장, 지금 하는 일이 보이고, 많으면 쪽을 넘겨요. [자세히]를 누르면 가족 관계, 사는 곳, 기본 정보, 지금 행복도, 가치 추구, 직장, 월급 같은 상세 프로필이 나와요. 사진 아래 모서리의 [따라가기]를 누르면 화면이 그 주민에게 바로 가서 따라다녀요. v4.5 「주민 누르기」의 상태 카드와 따라가기를 목록 창으로 먼저 당겨 온 셈이에요. v4.5에서는 주민을 직접 눌렀을 때도 같은 카드가 떠요.
  - **생선구이 그림:** 화덕에서 나온 '구운 생선'이 동그란 연어 스테이크라 고기처럼 보여요. 통째로 구운 생선 그림으로 바꿔요. 그림만 바뀌고 값과 규칙은 그대로예요 (수산 7).
~~~~

**K4b.** v4.3 요청 목록 끝 줄 (여섯 → 일곱; 그 사이 다른 요청이 더해졌으면 그 수에 하나를 더해요)

Old:
~~~~text
  - 이 여섯 가지가 끝나면
~~~~
New:
~~~~text
  - 이 일곱 가지가 끝나면
~~~~

**K5a.** v4.6 「새로 하는 것」

Old:
~~~~text
  - 주민 도감, 우편함과 보관함.
~~~~
New:
~~~~text
  - 주민 도감, 우편함과 보관함. 도감에는 「바다 친구들」 쪽도 생겨요: 읍이 된 뒤 낚시 좌대와 마을 배에서 고등어·명태·눈꽃무늬 물고기 모습이 올라와요. 물건과 값은 지금처럼 '생선' 하나예요. 처음 잡으면 도감 카드가 생기고, 고용한 어부가 잡아도 채워져요 (수산 6).
~~~~

**K5b [shared].** v4.6 「대략 개발 기간」

Old:
~~~~text
- **대략 개발 기간:** 33–38일. 늦어지면 새 손님과
~~~~
New:
~~~~text
- **대략 개발 기간:** 34–40일 (바다 친구들 1–2일 포함). 늦어지면 바다 친구들을 가장 먼저 빼고, 그다음 새 손님과
~~~~

**K6.** v5.1 「새로 하는 것」 (상태 카드 줄 다음에 넣기)

Old:
~~~~text
  - 상태 카드에 가족, 나이, 관계, 오늘 일정이 더해져요.
~~~~
New:
~~~~text
  - 상태 카드에 가족, 나이, 관계, 오늘 일정이 더해져요.
  - 선장 바다와 어부들이 '선장', '선원', '어부' 일자리로 주민 창에 보여요 (일터: 보트 창고, 낚시 좌대). 만드는 날은 범위 안이에요.
~~~~

**K7a.** v6–v8 제목

Old:
~~~~text
### v6 「갈매기 항구」 · v7 「햇살 해변」 · v8 「살아 있는 도시」 (시장, 새 동네)
~~~~
New:
~~~~text
### v6 「갈매기 항구」 · v6.1 「바다 식구들」 · v7 「햇살 해변」 · v8 「살아 있는 도시」 (시장, 새 동네)
~~~~

**K7b.** v6–v8 첫 문단

Old:
~~~~text
세 버전 모두 예전 계획의 내용을 그대로 써요.
~~~~
New:
~~~~text
세 버전 모두 예전 계획의 내용을 쓰고, 항구에는 수산업 (`기획서_수산업.md`)을 더해요.
~~~~

**K7c.** v6–v8 표 「새로 하는 것」 줄 (v6, v7 칸)

Old:
~~~~text
| 새로 하는 것 | 항구 동네, 해안 기차, 배들, 경매, 수출입, 관광객 | 해수욕장, 상가 7곳, 호텔과 수영장, 아쿠아리움 |
~~~~
New:
~~~~text
| 새로 하는 것 | 항구 동네, 해안 기차, 배들, 수출입, 관광객, 수산업 (연안 어선·원양어선 → 냉동차 → 수산물 경매 → 횟집·참치캔 공장·수출, 선장·선원·경매사·기사·공장 직원·요리사 일자리) | 해수욕장, 상가 7곳, 호텔과 수영장, 아쿠아리움, 조개 캐기 |
~~~~

**K7d.** v6–v8 표 「함께하기」 줄

Old:
~~~~text
| 함께하기 | 경매 | 모래성 대회 | 소방 연습 |
~~~~
New:
~~~~text
| 함께하기 | 큰 경매 [땡!] | 모래성 대회 | 소방 연습 |
~~~~

**K7e.** v6–v8 표 「쓰는 것」 줄 (v6 칸)

Old:
~~~~text
| 쓰는 것 | 항구 모듈과 그림 |
~~~~
New:
~~~~text
| 쓰는 것 | 항구 모듈과 그림, 이야기 엔진의 일자리 |
~~~~

**K7f.** v6–v8 표 「개발 기간」 줄

Old:
~~~~text
| 개발 기간 | 25–35일 | 20–28일 | 30–40일 |
~~~~
New:
~~~~text
| 개발 기간 | 43–56일 (중간 미리보기 두 번) | 22–31일 | 30–40일 |
~~~~

**K7g.** v6–v8 표 아래 (큰 도시 승격 줄 앞에 넣기)

Old:
~~~~text
- **큰 도시 승격 (v8):**
~~~~
New:
~~~~text
- **v6.1 「바다 식구들」 (9–10일, 봇 160–210분):** 오징어잡이 배 (밤 집어등), 조선소 미끄럼틀에서 배 짓기, 바다 장터, 횟집 메뉴 4가지, 일주일에 하루 「항구 쉬는 날」, 「대게 주간」, 배 타고 바다까지 따라가기, 바다 미션 4–6개. v6가 늦어지면 v6의 주민 부탁·이번 주 기록·다시 보기·가족 마중이 여기로 와요.
- **큰 도시 승격 (v8):**
~~~~

**K8a.** 주민 누르기 표 「따라가기」 줄 (v6–v8 칸)

Old:
~~~~text
| 배, 해변 |
~~~~
New:
~~~~text
| 배 (선원을 따라 항구 입구까지, v6.1부터 바다까지), 해변 |
~~~~

**K8b.** 주민 누르기 표 「함께하기」 줄 (v6–v8 칸)

Old:
~~~~text
| 경매, 모래성 |
~~~~
New:
~~~~text
| 큰 경매 [땡!], 모래성 |
~~~~

**K9.** 질문 24 다음 (수산업 질문 안내 넣기)

Old:
~~~~text
    → ★ 네. 예전 v5.0 한 덩어리는 만드는 날이 50일을 넘어서 테스터 판이 너무 늦어져요. 사건 장면은 경찰차 그림이 있어야 해서 탈것 뒤에 둬요.
~~~~
New:
~~~~text
    → ★ 네. 예전 v5.0 한 덩어리는 만드는 날이 50일을 넘어서 테스터 판이 너무 늦어져요. 사건 장면은 경찰차 그림이 있어야 해서 탈것 뒤에 둬요.

> **수산업 질문 (수산 1–14)**은 `기획서_수산업.md` 맨 끝에 따로 있어요. 정해 주실 것은 수산 1–6이고, 7–14는 추천대로 정해 둘게요.
~~~~

**K10.** 「바뀌는 예전 계획 목록」 (항구 분 줄 다음에 넣기)

Old:
~~~~text
| 항구 150분, 해변 215분, 큰 도시 270분 | 항구 150–200분, 해변 200–245분, 큰 도시 약 300분 (다시 재요) |
~~~~
New:
~~~~text
| 항구 150분, 해변 215분, 큰 도시 270분 | 항구 150–200분, 해변 200–245분, 큰 도시 약 300분 (다시 재요) |
| 항구 경매: 생선과 참치를 정해진 값에 한꺼번에 팔기 | 어종별 상자, 사 가는 곳 (횟집·참치캔 공장·수출·도매상), 하루 한 번 큰 경매 구경 (v6) |
| 항구 배: 원양어선만 | 연안 어선 2척과 원양어선 (v6), 오징어잡이 배 (v6.1). 통발 배는 연안 어선에 합쳐요 |
~~~~

**K11.** 부록 (v5–v8 줄 다음에 넣기)

Old:
~~~~text
- v5–v8: `docs/기획서_v5_v8_개발계획.md`, `docs/v5_v8_plan.md` (+ `_player`, `_tech`), `docs/기획서_v5_생활과미션.md`, `docs/기획서_v6_항구도시.md`, `docs/기획서_v7_해변.md`, `docs/기획서_v8_살아있는도시.md`
~~~~
New:
~~~~text
- v5–v8: `docs/기획서_v5_v8_개발계획.md`, `docs/v5_v8_plan.md` (+ `_player`, `_tech`), `docs/기획서_v5_생활과미션.md`, `docs/기획서_v6_항구도시.md`, `docs/기획서_v7_해변.md`, `docs/기획서_v8_살아있는도시.md`
- 수산업: `docs/기획서_수산업.md`, `docs/roadmap_mayor/fishery_addendum.md`
~~~~

### `docs/roadmap_mayor/engineering_roadmap.md`

**E1a.** §0 table, v4.6 headline

Old:
~~~~text
도감, mailbox, weekly goal + titles, 도시 bars
~~~~
New:
~~~~text
도감 (+ 바다 친구들 page), mailbox, weekly goal + titles, 도시 bars
~~~~

**E1b [shared].** §0 table, v4.6 days

Old:
~~~~text
| v8 + slices | 33–38 |
~~~~
New:
~~~~text
| v8 + slices | 34–40 |
~~~~

**E1c.** §0 table, v6 row (insert the v6.1 row below it)

Old:
~~~~text
| v6 | 갈매기 항구 | 시장 | 150–200 | harbour district | v9 (bump only if structural) | 25–35 |
~~~~
New:
~~~~text
| v6 | 갈매기 항구 | 시장 | 150–200 | harbour district + fishery core (species lots, coastal + trawler tiers, harbour reefer, lot auction with a daily 10-s show, 횟집 + tuna cannery, crews with a catch share, 「오늘의 바다」 card) | v9 (bump only if structural) | 43–56 |
| v6.1 | 바다 식구들 | 시장 | 160–210 | squid boat (night lamps), slip-yard builds, 바다 장터, 4-dish menu, 항구 쉬는 날, 대게 주간, ride-along, sea missions | v9 + `harbor` | 9–10 |
~~~~

**E1d.** §0 table, v7 row

Old:
~~~~text
| v7 | 햇살 해변 | 시장 | 200–245 | beach district | same | 20–28 |
~~~~
New:
~~~~text
| v7 | 햇살 해변 | 시장 | 200–245 | beach district + shellfish lots | same | 22–31 |
~~~~

**E2 [shared].** §0 Totals line

Old:
~~~~text
읍장 stage (v4.4–v4.6) 109–127; to 시장 취임 (v4.3 … v5.0 incl. prototype) **172–202**; to 안심 마을 (… v5.3) **224–272** (≈ 20–25 × step A); v6–v8 75–103; whole roadmap 299–375.
~~~~
New:
~~~~text
읍장 stage (v4.4–v4.6) 110–129; to 시장 취임 (v4.3 … v5.0 incl. prototype) **173–204**; to 안심 마을 (… v5.3) **225–274** (≈ 20–25 × step A); v6–v8 incl. v6.1 104–137; whole roadmap 329–411 (includes the fishery chain: 31–36 builder-days by its own sum, +30 to +36 after per-version rounding; `fishery_addendum.md`).
~~~~

**E3.** §1 (insert before the Retired bullet)

Old:
~~~~text
- **Retired:** v4.3.1–v4.3.4
~~~~
New:
~~~~text
- **v6.1 「바다 식구들」** is a planned sub-version (the fishery's second half, `fishery_addendum.md` §7 G). v6's fishery cut line folds into it.
- **Retired:** v4.3.1–v4.3.4
~~~~

**E4.** §4.1 designer requests (insert before the AAB bullet)

Old:
~~~~text
  - The same a3 commit is also built as a Play closed-test AAB
~~~~
New:
~~~~text
  - Grilled-fish icon (task #31, branch `local/v43-grilledfish`): `item_fish_cooked` is drawn as a salmon steak (`tools/blender/prop_assets.py:1926-1929`, `steak_model`) and reads as meat next to `item_meat_*`; repaint as a whole grilled fish with `fish_model(cooked=True)` (`:214`). Art only; carried stacks must stay readable (`prop_pack.py:422-433` `stackStep`).
  - The same a3 commit is also built as a Play closed-test AAB
~~~~

**E5a.** §4.4 v4.6 Scope, 도감 bullet

Old:
~~~~text
  - 도감 (`v44_plan.md` §3.4), mailbox/보관함 (§14), the weekly goal, fame titles (they keep the 촌장 names: they are what residents call the chief).
~~~~
New:
~~~~text
  - 도감 (`v44_plan.md` §3.4), mailbox/보관함 (§14), the weekly goal, fame titles (they keep the 촌장 names: they are what residents call the chief). The 도감 gets a 「바다 친구들」 page (fishery S1): after 읍, deck catch flights and boathouse unloads show 고등어 / 명태 / 눈꽃무늬 물고기 looks, re-skinned to `item_fish_raw` on landing; items and prices unchanged; species bits in `x.book.sea`.
~~~~

**E5b [shared].** §4.4 v4.6 Effort

Old:
~~~~text
- **Effort:** 33–38 (planned 30.25: 금방 G1 6,
~~~~
New:
~~~~text
- **Effort:** 34–40 (planned 31.75: 바다 친구들 1.5, 금방 G1 6,
~~~~

**E5c.** §4.4 v4.6 Cut line

Old:
~~~~text
- **Cut line:** L1b + G1b → v4.6.1 (−9 to −10).
~~~~
New:
~~~~text
- **Cut line:** 바다 친구들 first (−1.5 to −2); then L1b + G1b → v4.6.1 (−9 to −10).
~~~~

**E6.** §4.7 v5.1 (insert before the Farewell bullet)

Old:
~~~~text
- **Farewell (하늘나라 여행):**
~~~~
New:
~~~~text
- **Fishery jobs (S2, inside the range, 0.75 planned):** story `JOBS` `captain`/`sailor`; village story places for the boathouse (kind `boat`) and the deck (explicit `fisher` seats); `fillOpenings` lets an explicit `p.jobs` list bypass the kind check (`src/story/engine/src/jobs.js:58`).
- **Farewell (하늘나라 여행):**
~~~~

**E7a.** §4.10 heading (substring, so it survives a renumbered section)

Old:
~~~~text
v6 갈매기 항구 · v7 햇살 해변 · v8 살아 있는 도시
~~~~
New:
~~~~text
v6 갈매기 항구 · v6.1 바다 식구들 · v7 햇살 해변 · v8 살아 있는 도시
~~~~

**E7b.** §4.10 (insert before the v8 specifics bullet)

Old:
~~~~text
- **v8 specifics:**
~~~~
New:
~~~~text
- **Fishery chain** (`fishery_addendum.md`): v6 core = harbour-only species lots (no `ITEMS` change), coastal boats on the V1/V2 berths + trawlers at W, a harbour-local reefer (west yard → boulevard → hall back door; then 횟집 → cannery → export pile), lot auction with a half cap on internal buyers and a 25 % crew share from base value, one daily ≤ 10-s show from step 6, 횟집 and a cannery line in the harbour warehouse as village buyers, crews as story residents, 「오늘의 바다」 card, wish unlocks. v6.1 = squid boat, slip-yard builds, 바다 장터, 4-dish menu, 항구 쉬는 날, 대게 주간, ride-along. v7 = shellfish lots. Prerequisites: P24, C2, H1, H6. Harbour view ≈ 114–117 of 120 MiB after P24 (`boat_rowboat` dropped from the harbour). Two mid previews for v6; cut line (wishes, weekly record, replay, 15:50 families) → v6.1.
- **v8 specifics:**
~~~~

**E7c.** §4.10 Effort

Old:
~~~~text
- **Effort:** v6 25–35, v7 20–28, v8 30–40 (±40 %).
~~~~
New:
~~~~text
- **Effort:** v6 43–56 (25–35 + fishery core 18–21), v6.1 9–10, v7 22–31 (+ shellfish 2–3), v8 30–40 (±40 %).
~~~~

**E8a.** §5 save table, v4.6 row

Old:
~~~~text
`x.book`, `x.mail` | slices |
~~~~
New:
~~~~text
`x.book` (+ `sea` species bits), `x.mail` | slices |
~~~~

**E8b.** §5 save table, v6–v8 row

Old:
~~~~text
| v6–v8 | 9 → 10 only if structural | 60 / 70 / 80 | `harbor`, `beach`, `logistics` | slices |
~~~~
New:
~~~~text
| v6–v8 | 9 → 10 only if structural | 60 / 61 / 70 / 80 | `harbor` (fishery ≈ +170 B, worst ≈ 1.39 of 2 KB; no `ITEMS` append), `beach`, `logistics` | slices |
~~~~

**E9.** §8 table (insert before the logistics_plan row)

Old:
~~~~text
| `logistics_plan.md` §0, `기획서_물류수요개편.md` §4.2 |
~~~~
New:
~~~~text
| `기획서_v6_항구도시.md` §2, §4; `v5_v8_plan.md` §6.4; `src/harbor/tuning.js` auction/trawler | trawler-only fleet; fixed-price auction (raw/tuna × 1.5, boxes × 300) | changed | fishery addendum: species lots, coastal + trawler tiers, harbour reefer, daily show, 횟집 + cannery buyers, crew share (v6); squid boat, slip yard (v6.1) |
| `logistics_plan.md` §0, `기획서_물류수요개편.md` §4.2 |
~~~~

**E10.** §10 (insert before the Engineering heading)

Old:
~~~~text
**Engineering:**
~~~~
New:
~~~~text
**Fishery:** designer questions 수산 1–14 in `기획서_수산업.md` (1–6 to answer, 7–14 default to ★); engineering FE1–FE8 in `fishery_addendum.md` §13.

**Engineering:**
~~~~

**E11.** §11 Not verified (append after the last line)

Old:
~~~~text
- v5.0 effort is the critique's split estimate plus additions; v5.1–v8 effort has no prior estimate in the plan docs; ranges are rough.
~~~~
New:
~~~~text
- v5.0 effort is the critique's split estimate plus additions; v5.1–v8 effort has no prior estimate in the plan docs; ranges are rough.
- Fishery figures (prices, catches, paybacks, harbour MiB, effort) are arithmetic estimates; no bot or texture run (`fishery_addendum.md` §14).
~~~~

### `docs/기획서_v6_항구도시.md`

**H1.** §2 배 표 (원양어선 줄, 아래에 연안 어선 줄 넣기)

Old:
~~~~text
| **대형 어선(원양어선)** | 먼 바다에서 참치·연어를 대량으로 잡아 옴 → 수산물 경매장 |
~~~~
New:
~~~~text
| **대형 어선(원양어선)** | 먼 바다에서 참치를 대량으로 잡아 옴 (큰 참치도 가끔) → 냉동차 → 수산물 경매장 |
| **연안 어선** | 가까운 바다에서 고등어·명태·새우를, 통발로 대게·문어를 잡아 옴 (마을 어선과 같은 배). v6.1에 오징어잡이 배 (밤 집어등) |
~~~~

**H2.** §3 항구 건물

Old:
~~~~text
- 항구 시장, 해산물 식당, 선원 숙소, 항구 창고, 갈매기들
~~~~
New:
~~~~text
- 항구 시장, 해산물 식당 (→ 횟집), 선원 숙소, 항구 창고 (→ 참치캔 공장), 갈매기들
~~~~

**H3.** §4 게임에서 하는 일 (대형 어선 선단 줄)

Old:
~~~~text
- **대형 어선 선단**: 조선소에서 배를 만들어 원양 어업 → 경매장에서 이웃 마을·도시로 팔림
~~~~
New:
~~~~text
- **수산업 (바다에서 식탁까지)**: 연안 어선과 원양어선이 잡아 오면, 큰 참치는 냉동차가 경매장으로 날라요. 경매사가 「낙찰!」을 외치면 횟집, 참치캔 공장, 수출 배, 이웃 도시 도매상으로 가요. 하루 한 번 큰 경매를 10초 동안 구경해요. 원양어선은 조선소에서 만들어요. 자세한 건 `기획서_수산업.md` (2026-11-07)
~~~~

**H4.** §4 항구 일꾼 줄

Old:
~~~~text
- **항구 일꾼**: 부두 일꾼(크레인 기사), 선원, 경매사, 선장, 등대지기 (부품 조합 주민 + 직업복)
~~~~
New:
~~~~text
- **항구 일꾼**: 부두 일꾼(크레인 기사), 선장, 선원, 경매사, 냉동차 기사, 참치캔 공장 직원, 횟집 요리사, 등대지기 (부품 조합 주민 + 직업복). 선장과 선원은 잡은 값의 4분의 1을 몫으로 받아요
~~~~

## Part B: the six shared edits, if the econ_welfare patch was applied first

Use these instead of the Part A edits with the same id. All other Part A edits apply unchanged after the econ patch.

**K1a (B).** `docs/기획서_시장취임_로드맵.md`. Rule if the econ wording differs: econ v4.6 33–39 (planned 30.75) + 바다 친구들 1.5 planned → 32.25 × 1.08–1.26.

Old:
~~~~text
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 33–39 |
~~~~
New:
~~~~text
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 35–41 |
~~~~

**K3 (B).** `docs/기획서_시장취임_로드맵.md`. Rule if the econ wording differs: 시장 취임 and 안심 +2 / +2 (v4.6); v8: +31 / +36 (v4.6 +2/+2, v6 +18/+21, v6.1 +9/+10, v7 +2/+3).

Old:
~~~~text
시장 취임(v5.0)까지 187–220일, 안심 마을(v5.4)까지 270–326일, v8까지 345–429일이에요.
~~~~
New:
~~~~text
시장 취임(v5.0)까지 189–222일, 안심 마을(v5.4)까지 272–328일, v8까지 376–465일이에요 (수산업 31–36일 포함, `기획서_수산업.md`).
~~~~

**K5b (B).** `docs/기획서_시장취임_로드맵.md`. Rule if the econ wording differs: as K1a.

Old:
~~~~text
- **대략 개발 기간:** 33–39일. 늦어지면 새 손님과
~~~~
New:
~~~~text
- **대략 개발 기간:** 35–41일 (바다 친구들 2일 포함). 늦어지면 바다 친구들을 가장 먼저 빼고, 그다음 새 손님과
~~~~

**E1b (B).** `docs/roadmap_mayor/engineering_roadmap.md`. Rule if the econ wording differs: as K1a.

Old:
~~~~text
| v8 + slices | 33–39 |
~~~~
New:
~~~~text
| v8 + slices | 35–41 |
~~~~

**E2 (B).** `docs/roadmap_mayor/engineering_roadmap.md`. Rule if the econ wording differs: 읍장, 시장 취임, 안심 +2 / +2; v6–v8 +29 / +34; whole +31 / +36.

Old:
~~~~text
읍장 stage (v4.4–v4.6) 117–137; to 시장 취임 (v4.3 … v5.0 incl. prototype) **187–220**; to 안심 마을 (… v5.4) **270–326** (≈ 25–30 × step A); v6–v8 75–103; whole roadmap 345–429.
~~~~
New:
~~~~text
읍장 stage (v4.4–v4.6) 119–139; to 시장 취임 (v4.3 … v5.0 incl. prototype) **189–222**; to 안심 마을 (… v5.4) **272–328** (≈ 25–30 × step A); v6–v8 incl. v6.1 104–137; whole roadmap 376–465 (includes the fishery chain, 31–36 builder-days; `fishery_addendum.md`).
~~~~

**E5b (B).** `docs/roadmap_mayor/engineering_roadmap.md`. Rule if the econ wording differs: as K1a.

Old:
~~~~text
- **Effort:** 33–39 (planned 30.75: 
~~~~
New:
~~~~text
- **Effort:** 35–41 (planned 32.25: 바다 친구들 1.5, 
~~~~

## Not changed on purpose

- No edit to v5.2 「탈것의 시대」 or v5.3 「안심 마을」: the village reefer (draft S3) was dropped, so the fishery no longer touches either, whatever their numbers become.
- No edit to v8: the draft's cold storage and 금방 「오늘의 생선」 were dropped.
- `docs/v5_v8_plan.md` §6.4 and `docs/CONTRACT_V6.md` describe the trawler-only fleet and the fixed-price auction. They are superseded through the §8 row added by E9; rewrite them at the v6 plan review, not now.
