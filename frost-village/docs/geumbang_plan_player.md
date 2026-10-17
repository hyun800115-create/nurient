# 금방 온라인 마켓: player and designer proposal (v4.3)

Status: **proposal** from the player/designer side, written for the lead's binding plan. It changes no game code, art or
data; it only adds this file.

Designer idea (verbatim): "재고를 빨리 소진하기 위해 온라인 마켓도 만들까? 시민들이 온라인 마켓으로 주문하면 온라인 마켓
물류센터에서 배달차로 시민 집까지 배달? 어때? 배달 회사는 쿠팡이 아닌 금방 ㅋㅋ 금방 뭐가 왔지? ㅋㅋ 금방 대형 물류창고,
금방물류 배달 차량, 배달 기사, 물류창고 직원들 어때?"

Inputs (all read-only):
- plans: `docs/v42_plan.md` (binding v4.2, §4 overflow, §4.4 서리 물류창고, §6 office, §7 관망, §8 HUD), `docs/v42_plan_player.md`,
  `docs/기획서_v4_2_촌장.md`, `docs/v5_v8_plan.md` (§6.3 vehicles, §6.6 logistics), `docs/CONTRACT_V8.md` §AA;
- build reports: `logistics.md`, `logistics_runtime.md`, `vehicles_runtime.md`, `cityfolk.md`, `v42_officefolk.md`, `v42_code1.md`;
- manifests: `assets/logistics`, `assets/cityfolk`, `assets/vehicles`, `assets/town`, `assets/buildings`, `assets/officefolk`,
  `assets/ui3`, `assets/ui5`, `assets/life2`, audio1–7;
- code as it stands now: `src/systems/depot/*`, `src/entities/DepotBuilding.js`, `CargoSleigh.js`, `House.js`,
  `src/systems/RoadNet.js`, `src/data/{balance,world,items,strings}.js`, `src/vehicles/layout.js`.

Numbers marked *estimate* are starting guesses for the census bot to tune. Everything the designer would edit is named
as a `balance.js` key with a Korean comment (§10.4).

---

## 0. 대표님용 요약 (쉬운 말)

- **좋은 생각이에요. 그리고 지금 게임에 딱 필요한 자리예요.** v4.2 를 재 보니, 마을이 만드는 물건은 가게가 잘 팔아요. 그런데
  **남는 것**(광석·고기·생선 원료, 장작, 넘친 음식)이 물류창고와 역 짐 싣는 곳에 쌓여요. 지금 물류창고의 손님은 걸어오는
  **솔방울 상인**뿐이고, 1분에 34코인어치밖에 못 팔아요. **금방**은 이 남는 물건을 **시민의 집 문 앞까지** 팔아 줘요.
- **언제:** v4.3. 서리 물류창고(읍 다음, 약 53분)가 서고 하루쯤 지나면, 솔방울 아파트 **정 할머니 편지**가 와요:
  "집 앞까지 갖다 주면 안 될까요?" → `금방 시작하기`.
- **어디서:** 새 땅을 찾지 않아요. **서리 물류창고 건물이 그대로 "금방 물류센터"가 돼요.** 간판 글자만 "금방 물류센터"로
  바뀌고, v4.2 에서 닫혀 있던 **1번 하역장(밴 자리)**이 금방 밴 자리로 열려요. 지붕을 투명하게 하면 직원이 선반에서
  물건을 꺼내고 → 컨베이어를 타고 → 포장대에서 상자에 담겨 **"찌익" 테이프**를 붙이고 → 밴에 실리는 게 다 보여요.
  **선반 높이가 진짜 재고라서, 금방이 팔수록 선반이 눈에 띄게 낮아져요.** (대표님이 원하신 "재고 소진"이 눈에 보이는 곳)
- **배달:** 꿀빛 금색 **금방 밴**이 마을 길을 달려요. 지붕 위에 "금방" 간판. 집 앞에 서면 기사님이 상자를 안고 내려서
  **"띵동~ 택배요! 금방이에요!"** → 주민이 나와서 받고 하트 뿅 → "방금 시켰는데 벌써요?". 집에 아무도 없으면 **문 앞에 상자를
  두고 사진**을 찍어요. 차가 못 들어가는 서리마을 옛 동네 골목은 **허스키 개썰매**가 배달해요.
- **주문은 저절로:** 시민들이 하루 한 번쯤 폰으로 주문해요 (머리 위에 작은 장바구니 말풍선). **가게가 먼저예요:** 금방은
  물류창고 선반에 있는 **남는 물건만** 팔고, 판매대가 비어 가는 물건은 "가게 먼저 · 잠깐 품절"로 쉬어요. 많이 남은 물건은
  "오늘의 특가"가 돼서 더 많이 팔려요.
- **금방 앱:** 왼쪽 위 **금방 칩**을 누르면 폰 모양 화면: 오늘 주문 · 배달 · 줄어든 재고 · 번 돈, 주문마다
  **주문 → 고르기 → 포장 → 배달 중 → 도착** 5칸 추적, `따라가기`를 누르면 카메라가 그 상자를 따라가요. 후기 탭엔 주민들의
  웃긴 별점 후기.
- **돈:** 배달하면 주민이 내는 돈이 물류 금고로 → 딸랑이가 수금해서 은행에 입금 (통장에 "금방" 막대가 생겨요). 수입은 약 +3~5 %
  (*추정*). v4.2 수입이 이미 목표보다 높아서, 값 비율(`priceRate`)을 대표님이 정해 주세요.
- **업그레이드:** 금방 밴 2·3대, 개썰매 2, 포장대 2단, **새벽배송** (밤에 헤드라이트 켜고 조용히, 아침에 문 앞에 상자),
  **금방 보관함** (광장·아파트 앞, 문이 딸깍), 돌아오는 길에 수출 상자 싣기.
- **농담과 말:** "금방 뭐가 왔지?" "금방이 왔지!" · 슬로건 **"금방 왔지?"** · 부제 **"방금 시키면 금방 와요"** · 센터장 이름은
  **방금순** 팀장 ("방금"을 뒤집으면 "금방"). 늦으면 아이가 "오늘은 금방이 아니라 조금방이네~".
- **하지 않을 것:** 쿠팡을 비롯한 실제 회사의 이름·로고·색·마스코트·문구 (로켓, 와우, 샛별, 쓱, 스마일배송 같은 말),
  배민 민트색, 우체국 빨강+제비, 컬리 보라색, 아마존 웃는 화살표. 기사님이 지치거나 혼나는 장면도 넣지 않아요 (밤엔 따로
  밤 기사님, 쉬는 시간도 보여요).
- **대표님이 정해 주실 것 (§17.3):** 간판을 "금방 물류센터"로 바꿀지 · 밴 색 (새 꿀금색 추천) · 슬로건 · 값 비율 ·
  옛 동네를 개썰매로 할지 보관함으로 할지.

---

## 1. Decisions at a glance

| # | Topic | Proposal | Why |
|---|---|---|---|
| 1 | When | **v4.3**, after the v4.2 서리 물류창고 stands (읍 + 창고 + se land, ≈ 53 min) **and** one game day has passed or its racks were ≥ 60 % for 2 min. Unlock by letter (소복이 hired) or banner + arrow (not hired). | It needs the depot's racks as its stock. Nothing changes before 읍, so the first 20 minutes and all v4.2 pacing gates stay as they are. |
| 2 | Where | **The v4.2 depot building becomes 금방 물류센터** (option A). Only the name lettering changes (the art has a separate nameplate layer), and the unused **dock 1 (van bay)** becomes the 금방 van bay. The 솔방울 상인 keep coming to the front door. Option B (a second building) waits for v8's new town. | v4.2 measured the depot spot as the only free 11 × 8 m place on the map. A second identical building would read as copy-paste to a sharp eye. |
| 3 | What sells | **Only what is already surplus**: the depot racks (and, with an upgrade, the station dock's waiting crates). Never shelves, pantries, the food box or the v3 창고 buffer. Items whose shop is short pause ("가게 먼저"). | "Drain the surplus fast without starving the shops", by construction, not by tuning. |
| 4 | Who orders | Every household: 서리마을 houses, station-district homes (H1–H5), 솔방울 apartments and shop-houses. ≈ 60 households (*estimate*), each about once per 1.2 game days, more when the racks are full. | ≈ 5 orders per minute × 4 items ≈ 20 items per minute: about the surplus the depot receives (§5.5). |
| 5 | Drive | **금방 밴** on the v4 drive streets (main, back, ave, bank_st, ave_s, lgx_dock), stopping at the kerb nearest each door. **금방 개썰매** (existing `dog_sled` art) on the village roads for the old village, which has no drive streets. | Every vehicle in the game has 2 drawn directions + mirrors, so vans stay on the axis-aligned streets; v5 already plans dog sleds on village roads. |
| 6 | Door | Doorbell, handover with hearts, or a **doorstep parcel + photo** when nobody is home. Apartments: the driver goes in and comes out empty-handed. | The emotional moment the designer asked for, at a size that reads on a phone. |
| 7 | Phone UI | **금방 chip** under the 업무 chip; a non-pausing **금방 앱** panel drawn as the chief's phone: 오늘 · 주문 · 상품 · 기사님 · 후기, a 5-step tracker per order and a **follow camera**. | The designer sees the drain (racks going down) and the joy (reviews) in one place. |
| 8 | Brand | Name **금방** (app "금방 마켓", delivery arm "금방물류"). Colour **honey gold + cream + deep navy lettering**. Mascot **금방이** (a running cardboard box with a scarf). Slogan **"금방 왔지?"**, tagline **"방금 시키면 금방 와요"**. | Gold = 금. The colour avoids mint (배민), red (우체국, 요기요), blue + rainbow (쿠팡), purple (컬리). |
| 9 | Van livery | New **gold van** re-render of the existing van model, with a mirror-safe 금방이 face emblem and **no lettering on the body**; the word "금방" lives on a **camera-facing roof sign** sprite. | Vans are drawn mirrored for SW/NW, so body text would read backwards half the time. |
| 10 | Money | Paid on delivery at `priceRate` 0.8 × shop price (raw goods at a fixed low price) into the existing 물류 금고; 딸랑이 collects; 통장 bar "금방". | Reuses the v4.2 coin loop. Income +3–5 % (*estimate*): a designer decision given the v4.2 +30 % cap discussion. |
| 11 | Upgrades | Offered by measured need: 밴 2 · 밴 3 · 개썰매 2 · 포장대 2단 · 새벽배송 · 광장/아파트 보관함 · 돌아오는 길 짐 싣기, plus the free "오늘의 특가" button. | Same "offer when the numbers say so" rule as 짐꾼 2 and 화물칸 크게. |
| 12 | Avoid | No real brand imitation (§14), no overworked-driver jokes, no 1-star reviews, no nagging. | The joke must stay "금방" and nothing else. |

---

## 2. Guardrails

1. **After 읍 only.** No 금방 code path runs, and no 금방 file loads, before the depot exists. The request log of the first 20
   minutes is unchanged, and the v4.2 pacing gates (village complete, 5 shops, 읍) are untouched.
2. **Shops first, always.** 금방 sells only depot rack stock (+ dock surplus with the backhaul upgrade). A rule in the
   catalogue (§5.4) pauses any item whose shop is short. Gate: no shop-empty rate in the census gets worse by more than
   2 points.
3. **Read-only modules.** `src/{story,missions,bank,vehicles,harbor,beach,city}/**` are not edited. Where a later module
   takes over (v5 vehicles drive the vans, v8 logistics owns the centre), 금방 keeps its data in a shape that module can
   adopt (§18).
4. **Existing art is not edited.** New art lands in a new folder (`assets/geumbang/`), and the depot's nameplate is a
   new patch drawn instead of the old one. CODE-1 can run on placeholders (blue van, code-drawn roof sign, code text on the
   manifest's `nameBoard`).
5. **File and memory budget.** The artifact is near its file limit; the whole feature should add ≤ 8 files (§15).
   Vans, sleds, drivers and parcels are drawn only near the camera; far deliveries resolve on paper.
6. **Cosy rules.** No failure states, no penalties for late parcels, nothing spends coins without the player, and every
   number sits in `balance.js` with a Korean comment.

---

## 3. The arc: when 금방 arrives

### 3.1 Timeline (smart-bot minutes; v4.2 reference in brackets)

| t (min) | Event | Cost | Notes |
|---|---|---|---|
| [≈ 53] | 서리 물류창고 built (v4.2) | 6,000 + 40 판자 + 20 주괴 | sleigh, forklift, 3 depot workers |
| ≈ 58–63 | **정 할머니's letter** (or a banner if 소복이 is not hired) | — | trigger: 1 game day after the depot opened, or racks ≥ 60 % for 2 min |
| +0:15 | **금방 개업** pad at the depot door → ribbon → sign swap | 4,000 + 20 판자 + 10 주괴, 15 s | comes with van 1 + driver, dog sled + rider, the 3 depot workers take 금방 jobs, 방금순 팀장 |
| +0:20 | **첫 주문 따라가기** (60 s, skippable) | — | §3.3 |
| ≈ 65–75 | first offers: 포장대 2단, 밴 2, 개썰매 2 | 1,200 / 2,500 / 1,500 | only when the numbers ask (§11) |
| ≈ 75–90 | 광장 보관함, 아파트 보관함, 새벽배송, 돌아오는 길 짐 싣기, 밴 3 | §11 | one offer at a time |

### 3.2 The letter and the opening

**Letter** (소복이 brings it; mailbox flag pops):

> **보낸 사람: 솔방울 아파트 2동 정 할머니**
> 촌장님, 요즘 역까지 장 보러 가기가 힘들어요. 물류창고에 물건이 그렇게 많다던데, 집 앞까지 갖다 주면 안 될까요?
>
> *셈이 메모: 촌장님, 물류창고 선반이 거의 꽉 찼어요! 이름은 '금방' 어때요? 방금 시키면 금방 가니까요.*
>
> `금방 시작하기 · 4,000` / `조금 더 생각해 볼게요`

`금방 시작하기` puts the **금방 개업** pad at the depot's front door (the v4.2 site flow: pay pad, 15 s, ribbon). If 소복이
is not hired, the same pad appears with the banner `물류창고에서 온라인 마켓을 열 수 있어요` and the tutorial arrow.

**Opening ceremony** (≈ 6 s, on the v4 ribbon flow):
1. The chief cuts the ribbon at the door. `sfx_unlock`, confetti (existing ribbon FX).
2. The old lettering fades out and **"금방 물류센터"** fades in with a sparkle (the nameplate is its own layer, so only the
   letters change).
3. A gold **금방 banner** unrolls beside dock 1 and starts to sway.
4. Dock 1's roller door rolls up (`dock_door` anim, unused since v4.2) and the **gold van** backs in. Its roof sign blinks once.
5. Banner: **금방 물류센터가 문을 열었어요!** / sub `방금 시키면 금방 와요`.
6. The 3 depot workers put on gold beanies (redress, one sparkle each) and walk to their new spots: picker, packer, dock
   hand. 방금순 팀장 takes the counter with a phone at her ear.

### 3.3 첫 주문 따라가기 (the showcase, ≈ 60 s, any touch skips)

The first order is forced: 정 할머니, `장작 4 · 빵 2`. The camera follows the parcel; a caption chip names each step.

| s | What the designer sees | Sound | Caption |
|---|---|---|---|
| 0 | Toast slides in: gold header, 금방이 icon, `띵동! 첫 주문 · 정 할머니 · 장작 4 · 빵 2` | `sfx_gb_jingle` | 주문 받음 |
| 2 | Camera at the depot; the roof and front wall fade (cutaway). 방금순 at the counter: "네~ 금방입니다!" | `amb_warehouse` up | — |
| 4 | Picker 쏙쏙이 walks to the materials rack, takes logs (the log stack there goes down a step) and carries them to the belt | steps | 고르는 중 |
| 8 | The logs ride the conveyor; the belt animation runs | belt hum | — |
| 11 | Packer 척척이: a cardboard box pops onto the table, the items hop in, gold tape "찌익", a 금방이 sticker | `sfx_tape` | 포장 중 |
| 14 | The box hops onto the 출고 floor bay by dock 1; dock hand 영차 carries it to the van's rear door | `sfx_box_drop` | — |
| 17 | Door rolls down, the van pulls out, roof sign bobbing; the camera follows | `sfx_truck_engine` | 배달 출발! |
| 17–40 | The van drives bank_st → ave_s → 중앙로 → 뒷길 and stops at the kerb by 아파트 2동 | `sfx_brakes` | 도착까지 20초 |
| 41 | 쌩쌩이 hops out, takes the box from the rear, walks to the entrance | — | — |
| 44 | Bell bubble over the entrance, "띵동~"; 정 할머니 steps out (for this first order she comes down to the entrance; later apartment deliveries follow §8.4) | `sfx_doorbell`, `sfx_door` | 도착 |
| 46 | The box hops into her arms; hearts; bubble **"아이고, 방금 시켰는데 벌써 왔네! 진짜 금방이구먼."** Coins `+22` float up | `sfx_customer_happy`, `sfx_coin` | 배달 완료 |
| 49 | 쌩쌩이 waves, runs back, drives off | — | — |
| 52 | Camera back to the chief. Banner `첫 배달 완료! 왼쪽 위 금방 앱에서 주문을 볼 수 있어요`; the 금방 chip bounces in | — | — |

### 3.4 Old saves

A v4.2 save with the depot built gets the letter after one game day (or the banner at once if 소복이 is not hired). A save
without the depot gets 금방 only after building it. The "새로워진 것" card (v4.2 §8.4 pattern) adds one line once:
`물류창고에서 온라인 마켓 "금방"을 열 수 있어요`.

---

## 4. The brand

### 4.1 The name and the joke

- **금방** means "right away / in a moment". The company name makes every ordinary sentence a pun:
  - **"금방 뭐가 왔지?"** (What came just now?) → **"금방이 왔지!"** (금방 came!), the designer's own joke. It is used at the door
    (§8.3), in the app splash and in the newspaper ad.
  - **방금 ↔ 금방**: "방금" (just now) is "금방" backwards. Tagline: **"방금 시키면 금방 와요"** (order 방금, get it 금방).
- **Founder: 방금순 팀장**, the young depot clerk whose name is "방금" and who answers every call with "네~ 금방입니다!". The
  kids call her **금방 언니**. She is the centre's manager at the counter (staffRoles `clerk`).
- **Brand family:** **금방 마켓** (the app and shop), **금방물류** (the delivery arm, used on uniforms, the van roof sign
  reads just "금방"), **금방 물류센터** (the building), **금방 보관함** (lockers), **금방 기사님** (drivers).

### 4.2 Slogans (pick one main + one tagline)

| Option | Korean | English | Use |
|---|---|---|---|
| **A (recommended main)** | **금방 왔지?** | Here already, right? | banner, app splash, van rear, news ad. The designer's own line. |
| **B (recommended tagline)** | **방금 시키면 금방 와요** | Order now, here in a moment | app header subtitle, opening banner |
| C | 눈길도 금방 | Even on snowy roads, right away | dog sled pennant, snow days |
| D | 안전하게, 그래도 금방 | Safely, and still quick | driver lines, van rear (a gentle safety joke) |
| E | 서리마을 온라인 마켓, 금방 | Frost Village's online market | the opening banner sub-line (alternative) |
| Q&A | 금방 뭐가 왔지? · 금방이 왔지! | What came just now? · 금방 did! | locker screen, ad, kids at the door |

### 4.3 Mascot: 금방이

A small cardboard box with stubby legs, **running**, a navy scarf flying behind, round black eyes, rosy cheeks and a round
"o" mouth (calling "금방!"). A tiny snowflake sticker on its side. Three poses: idle (standing, waving), run, bow.

Rules: no curved-arrow smile (Amazon), no rocket, no wings (the existing 솔방울 vans carry a winged parcel and the 우체국
mark is a swallow), no lightning bolt (a speed cliché used by many real brands). The face is symmetric, so it survives the
mirrored van directions.

### 4.4 Colours

| Role | Colour | Note |
|---|---|---|
| Main | **꿀금색 honey gold** ≈ `#F2B33D` | 금 = gold. The van lower body, banner, app header, tape. Close to the delivery cap gold `#F2C14E` already in the cityfolk palette. |
| Base | **크림** ≈ `#F4F1EA` | the van roof band (as on every retro van in the game), app cards |
| Lettering | **짙은 남색** ≈ `#2B3A67` | the word "금방", the mascot scarf. Small areas only: no big blue + yellow blocks. |
| Crew | polo **청록** `#2E6E8A` (existing `delivery` palette) + cap gold `#F2C14E` (existing) | a code preset pins these colours; no new paper-doll art |

Colours deliberately **not** used as the main colour: mint (배달의민족), red/orange (우체국, 요기요, 롯데), bright blue with a
rainbow wordmark (쿠팡), purple (마켓컬리), big blue + yellow blocks (IKEA-like).

### 4.5 Where the brand shows

| Place | What | Art |
|---|---|---|
| Building sign | **금방 물류센터** (ko) / **Geumbang Centre** (en), raised navy letters on the existing cream board | new nameplate patch (the old ko/en patches stay in the atlas) |
| Dock 1 | vertical gold banner with 금방이 + "금방 왔지?", sways | new prop, 4 frames |
| Vans | honey-gold body, cream top, 금방이 face emblem on the side (replaces the winged parcel) | gold re-render of the existing van model |
| Van roof | **"금방"** roof sign facing the camera (like a taxi top light); glows at night | new small sprite, never mirrored |
| Dog sled | small gold pennant "금방" on the handle bar | new overlay sprite at a handle point |
| Crew | teal polo + gold cap (drivers), gold beanie (warehouse) | code presets on existing parts |
| Parcels | the existing cardboard boxes s/m/l + gold tape stripe + 금방이 sticker | 3 small overlays |
| Lockers | gold frame, navy doors, tiny screen "금방" | new prop |
| App | phone frame, gold header, mascot | new UI page |

### 4.6 The mirroring rule (important for a sharp eye)

Every vehicle in the game is drawn in SE and NE only; SW and NW are the same pictures **flipped**. Any word painted on a
van side would read backwards half the time. So: **no text on vehicle bodies**. The word "금방" appears only on sprites
the game never flips (roof sign, banner, locker, building sign, UI). The emblem on the van side is the symmetric 금방이
face, which looks right both ways.

---

## 5. What citizens order

### 5.1 Who orders

| Group | Where | Households (*estimate*) | Reached by |
|---|---|---|---|
| 서리마을 옛 동네 | v3 houses (house_a/b/c, 2–4 people) around the plaza | 10–14 | **개썰매** on the village roads (no drive streets there) |
| 역앞 마을 | lots H1–H5 (S homes) on 집 앞길 | ≤ 5 | van, kerb on 뒷길 |
| 솔방울 아파트 | `t_apt1–4` (≈ 8 households each, per the town art) | ≈ 32 | van, kerb on 뒷길 / 중앙로; driver goes to the entrance |
| 솔방울 가게 집 | shop-houses on 솔방울 큰길 (cafe, bookstore, toy, clothing, flower, hair, restaurant, hall, fire station) | ≈ 10 | van, kerb on 큰길 |

Each household gets a seeded **taste** that picks its basket, so the town feels like people, not a number:

| Taste | Likes | Example line when ordering |
|---|---|---|
| 할머니네 | 장작, 밀, 생선 | "장작이 똑 떨어졌네" |
| 아이 있는 집 | 빵, 통조림 | "엄마, 빵 시켜도 돼?" |
| 신혼집 | 훈제 고기, 판자 | "판자로 새집 만들어 볼까?" |
| 광부네 | 생고기, 빵 | "고기 먹고 힘내야지!" |
| 가게 집 | 판자, 통조림, 도구 | "가게 선반 고칠 판자가 필요해요" |
| 어부네 (village) | 빵만 | "생선은 내가 잡으니까…" |

### 5.2 What: the 금방 catalogue (current items only)

| Item (id) | Shop price | Depot rack | **금방 price** | App name | Note |
|---|---|---|---|---|---|
| 빵 `item_bread` | 7 | food | 6 | 갓 구운 빵 | |
| 훈제 고기 `item_meat_cooked` | 12 | food | 10 | 훈제 고기 한 팩 | **guarded** (§5.4: the meat shelf is borderline in v4.2) |
| 구운 생선 `item_fish_cooked` | 4 | food | 3 | 생선구이 | |
| 통조림 `item_can` | 12 | goods | 10 | 통조림 세트 | |
| 판자 `item_plank` | 5 | materials | 4 | DIY 판자 | "새집 만들기" bundle |
| 도구 `item_axe` … `item_bow` | 40 | tools | 32 | 새 도끼 / 새 낚싯대 … | rare, at most 1 per order |
| 생선 `item_fish_raw` | (raw 1) | food | 2 | 오늘 잡은 생선 | raw surplus |
| 고기 `item_meat_raw` | (raw 3) | food | 5 | 집에서 굽는 생고기 | raw surplus |
| 통나무 `item_log` | (raw 1) | materials | 2 | 장작 한 묶음 | raw surplus; a winter village burns wood |
| 밀 `item_wheat` | (raw 1) | materials | 2 | 밀 한 자루 | raw surplus; "집에서 빵 굽기" |
| 주괴 `item_ingot` | 10 | materials | — | — | not a household good; stays with the 교역소 and trains |
| 광석 `item_ore` | (raw 2) | materials | — | — | not a household good (§5.5: ore needs the smelter and trains) |

Later versions add their items automatically (the depot catalogue already knows cake, cocoa, scarves, toys, sleds,
furniture and appliances from v8), so the 금방 shelf grows with the game.

Bundles: an order is one parcel of 2–6 items from 1–3 lines. Box size follows the count: 2–3 → `cardboard_box_s`, 4–5 →
`_m`, 6 or a tool → `_l`.

### 5.3 How often

- **Base:** each household orders about once per `orderEveryDays` 1.2 game days (12 min real time).
- **Hour curve** (game hours, 25 s each): 07–09 ×1.2 (breakfast), 12–13 ×1.0, **18–22 ×1.6** (evening "phone time"),
  22–02 ×0.8, 02–06 ×0.2, other hours ×0.9.
- **Stock:** a category at ≥ 60 % of its rack cap makes its items **오늘의 특가** (×1.5); under 25 % ×0.5; 0 → not offered.
- **Snow day** (the 06:00 paper's weather says snow): ×1.3 "눈 오는 날은 집에서 주문".
- **The 특가 button** (free, from the office 재고 tab's blue 남음 rows or the app): ×2 for one item for one game day.
- Result at ≈ 60 households: about **one order every 12 s** on average, in waves around the evening.

### 5.4 From which stock (the shops-first rules)

| Rule | Detail |
|---|---|
| Source | The **depot racks** only (they hold what `Surplus` already sent away because nothing local wanted it). With the backhaul upgrade the vans also bring the **station dock's surplus crates** to the depot on their way back. |
| Never | Shop shelves, the 교역소, the 큰 식당 pantry, the miners' food box, workshop inputs, the v3 창고 (the village buffer). |
| 가게 먼저 | An item pauses while any of its shelves is **부족** or **길 막힘** in the v4.2 ledger, or that shelf is under 50 %. It comes back after 60 s at 적당 / 남음. App label: `가게 먼저 · 잠깐 품절`. |
| 훈제 고기 guard | Sells only while the meat shelf has been ≥ 75 % for 60 s (the v4.2 census shows the meat shelf close to its gate). |
| Reserve | An order reserves its items when it is placed, so the 솔방울 상인 never buy the same crate. |
| 상인 share | After 금방 opens, the walk-in 솔방울 상인 buy only from categories ≥ 50 % full (금방 has first call; the traders take the rest). |
| Floor | The racks keep `keepFloor` 4 of each item, so the cutaway never looks completely bare. |

### 5.5 The drain math (*estimates*; the census bot measures the real ones)

| Flow | Per minute | Source |
|---|---|---|
| Surplus arriving at the depot (sleigh) | ≈ 10–20 items | v4.2 code-1 report: exports 625 in 60 min, depot sales ≈ 34 coins/min at 0.6 × price or raw 1–3 |
| Depot sales today (솔방울 상인) | ≈ 34 coins | v4.2 census `dep` field |
| **금방 demand at 개업** | ≈ 5 orders × 4 items ≈ **20 items** (30 when 특가) | §5.3 |
| 금방 delivery capacity, 1 van + 1 sled, days only | ≈ 10 items | van ≈ 8 parcels / 150 s ≈ 13 items/min; sled ≈ 4 / 180 s ≈ 5; × 58 % of the day |
| … 3 vans + 2 sleds + 새벽배송 | ≈ 45–50 items | capacity then exceeds demand; deliveries become demand-limited |

What this means for the designer:
- At 개업, orders outrun the single van, so the app shows a queue and the first upgrades (밴 2, 포장대 2단) are offered
  within minutes: growth feels earned.
- With the upgrades the depot racks fall to ≈ 25–40 %. When they run low, demand drops by itself (×0.5), so 품절 stays
  rare and short.
- The drain then moves **upstream**: an emptier depot lets the sleigh take more from the station dock, which lets the
  역 짐꾼 carry more from the full raw piles. **Ore** is the exception: no household buys ore, so the ore pile stays a
  smelter / gatherer / train lever (v4.2 §4.5).

### 5.6 What the player sees when someone orders

- If the household's resident or doll is on screen: a small **장바구니 bubble** (cart icon + the main item icon) pops over
  their head for 2 s; town dolls dressed in cityfolk parts play `phone`, village residents play `talk`. One line from §5.1
  shows in their speech bubble.
- The 금방 chip's number goes up by one.
- A toast only for: the first order of the day, an order from a named village resident, or 1 per 30 s at most
  (setting `금방 알림`, §9.5).

---

## 6. The 금방 물류센터

### 6.1 Where: option A (recommended) vs option B

| | **A: the v4.2 depot becomes 금방 물류센터** | B: a separate 금방 hub |
|---|---|---|
| Map | none: L(28.4, −27.4) = (3184, 3101), already built | v4.2 found no other 11 × 8 m spot; needs v8's world growth (`WORLD.height` 3450 → 4600) |
| Art | 1 nameplate patch + 1 banner; dock 1 already exists and is shut in v4.2 | the same building twice (or a full recolour re-render) |
| Story | "물류창고가 온라인 마켓을 열었어요": the player's own company | a second company next to the first |
| Stock | the same racks: every 금방 sale visibly lowers them | needs its own stock flow |
| Later | in v8 the brand can grow a big hub in the new town (§18) | — |

**Recommendation: A.** In the 재고 tab and the panels the row reads **금방 물류센터 (서리 물류창고)** for one game day after
the opening, then **금방 물류센터**.

### 6.2 Outside

- **Sign:** the new **금방 물류센터** nameplate patch replaces the old lettering (drawn with the shell's alpha, like the
  original). Side note: in v4.2 the sign still shows the art's baked **솔방울 물류센터** while the UI says 서리 물류창고 (§19).
- **Dock 1 (front, "van bay"):** the 금방 vans. **Dock 2 (back)** stays with the pony cargo sleigh, as in v4.2.
- **Apron traffic:** the `lgx_dock` lane is one lane, and the sleigh U-turns on the apron. Rule: **one vehicle moving on
  the apron at a time**; the others wait at the bank_st corner with their engine idling (`idle` anim, exhaust puffs).
  Vans back into dock 1 from the lane (`dockVehiclePoints.delivery_van[0]` = (3453, 3331)).
- **금방 banner** beside dock 1, swaying.
- **출고 sign:** when parcels wait, a small floating label `출고 대기 6` over dock 1 (same style as the v4.2 dock labels).

### 6.3 Inside: the picking and packing loop (all on the existing cutaway points)

The cutaway (`revealPoly` tap or the chief at the door) shows the whole loop. Inside layers exist only while revealed, as
in v4.2.

| Beat | Who / where (manifest) | Anim | What you see | Sound |
|---|---|---|---|---|
| Order in | 방금순 팀장, `staffRoles` clerk (counter) | `phone` (cityfolk) / `talk` | "네~ 금방입니다!" bubble; an order slip appears on the back-wall board | `sfx_gb_jingle` (only when revealed) |
| Pick | 쏙쏙이, `picker` spots between the racks | `carry_box` with the real item drawn at `boxPoint` | walks to the `rackSlots` slot of the item; that stack drops one step (real stock) | steps |
| Belt | conveyor `start` → `end` (`heightM` 0.85) | conveyor patch plays only while orders are being packed | the item icon rides the belt | belt hum (`amb_warehouse` up) |
| Pack | 척척이, `packer` at the packing table | `idle` + hop tweens | a box pops (s/m/l by count), items hop in, the lid shuts, gold tape + sticker | `sfx_tape` "찌익" |
| Stage | the floor bay nearest dock 1 | — | boxes stack on the 출고 bay (up to 8 visible) | `sfx_box_drop` |
| Load | 영차, `dockhand` | `carry_box` | carries boxes to the van's `rearDoorPoint`, one per 0.6 s; ≥ 6 boxes → the forklift brings `pallet_boxes` instead (its existing loop already visits dock 1) | `sfx_forklift_beep` |
| Leave | dock 1 door | `dock_door` reversed | the van pulls out, the door rolls down | `sfx_truck_engine` |

Nothing waits for the camera: off screen the same steps run on timers (pick 0.9 s per item, pack 2.2 s + 0.18 s per
item, as the v8 logistics module already tunes them).

### 6.4 The order board

The back wall's notice board (`_back` layer) shows **one paper slip per open order** (up to 12), drawn by code like the
office's live wall board: white = 고르는 중, gold = 포장 중, navy = 배달 중. A slip flies off when its parcel leaves. At
night the board's slips stay, so the designer can see the morning's work waiting.

### 6.5 The crew

| Name | Job | Look (existing parts, code preset) | Notes |
|---|---|---|---|
| **방금순 팀장** | centre manager, takes orders | cityfolk `warehouse_worker`, gold cap, glasses | founder joke; "네~ 금방입니다!" |
| **쏙쏙이** | picker | `warehouse_worker`, gold beanie | was a v4.2 depot worker |
| **척척이** | packer | `warehouse_worker`, gold beanie | was a v4.2 depot worker |
| **영차** | dock hand | `warehouse_worker` or `forklift_driver` | was a v4.2 depot worker |
| **쌩쌩이** | van 1 driver | `delivery_driver`, teal polo + gold cap | "이름만 쌩쌩, 운전은 천천히" |
| **부릉이 / 씽씽이** | van 2 / 3 drivers | same | come with the upgrades |
| **뽀득이** | dog-sled rider | `delivery_driver` + scarf | 뽀득 = the sound of steps on snow |
| **반짝이 / 살금이** | 새벽 night crew | same, darker cap | only with 새벽배송 |

- The v4.2 workers keep their seeds; on the opening they are redressed once (sparkle) into the 금방 look.
- **Shifts:** day crew 07:00–21:00; night crew 21:00–07:00 (only after 새벽배송). Shift change at 21:00 at dock 1:
  "수고하셨어요!" / "다녀오겠습니다!".
- **Breaks:** after every 3 runs a driver stands 10 s by the office-corner heater (the baked sleeping cat is there) with a
  breath puff. Nobody works around the clock.
- If the cityfolk work page is not resident (memory), the staff fall back to the officefolk `depot_worker` look with
  `hand_over` / `note`, and items hop by tween instead of being carried.

---

## 7. On the road

### 7.1 금방 밴

| Topic | Proposal |
|---|---|
| Streets | v4 drive streets: 역앞 거리 / 솔방울 큰길 (main), 뒷길 (back), 중앙로 (ave), plus the v4.2 lanes `bank_st`, `ave_s`, `lgx_dock`. Routed with the existing `RoadNet.route(…, { mode: 'drive' })`, right-hand lanes. |
| Run | Leaves when it holds 8 parcels **or** the oldest waiting parcel is 2 game hours (50 s) old. Visits stops in nearest-next order. |
| Kerb rule | Each home gets a **하차 지점**: the nearest drive-lane point within 400 px of its door. The van stops there with its tail lights blinking (hazards); the driver walks the last bit on the footpath. |
| Speed | 140 px/s like the v8 module's vans; 0.6× while backing; turns snap to the 4 drawn directions on the axis-aligned streets. |
| Manners | Stops 1.5 m before a walker (the v5 rule), a single soft `sfx_car_honk` after 2 s; waits behind the sleigh on the apron; slows at the rail crossing and never crosses while `Rail.blocking`. |
| Return | Back to dock 1 by the shortest drive route (with the backhaul upgrade, via the station dock, §7.3). |
| On screen | ≤ 3 vans; each draws only within view + 900 px; far vans move on paper (position along the route), like the v4.2 courier. |

### 7.2 금방 개썰매 (the old village)

The old village has no drive streets, only the free-form village roads, and v5 already plans dog sleds there.

- **Base:** a small 금방 stand at the west end of the station square / 역앞 거리 (the exact spot by a layout check; the cargo
  sleigh stop is at L(5.0, −5.0)). Two huskies wait, panting (`idle`).
- **Handover:** a van whose run passes 역앞 거리 drops the village parcels into the sled basket (boxes hop; huskies wag).
  If no van passes for 3 min while village parcels wait, a van makes a short trip just for them.
- **Run:** up to 4 parcels stacked on the red blanket, along the village roads (`Roads.route`, nearest drawn heading), to
  the road point nearest each house door. 뽀득이 hops off with `carry_box`.
- **Sound:** `sfx_sleigh_bells` + an occasional `sfx_dog_bark`; 콩이 sometimes runs alongside for a few seconds (if near).
- **Without the sled** (cut list, §17): the old village is served by the 광장 보관함 only.

### 7.3 돌아오는 길 짐 싣기 (backhaul upgrade)

A van returning from a run stops at the station's 짐 싣는 곳 (the cargo-sleigh stop) and loads up to 16 waiting surplus
crates for the depot ("빈 차로 안 와요"). It helps the sleigh; the train still loads first (v4.2 F7 rule).

### 7.4 Night and 새벽배송

- **Without 새벽배송:** vans and sleds stop at 21:00; orders placed later show `내일 아침 도착` and leave at 07:00.
- **With 새벽배송:** the night crew drives 21:00–07:00. Headlights and tail lights (manifest `lightPoints`, `tailPoints`),
  the roof sign glows. **No doorbell at night** (21:00–08:00): every parcel is a doorstep parcel with a photo and the
  line `문 앞에 두었어요` in the app. Drivers walk, they do not run, at night.
- **Morning:** 06:00–08:00, residents step out and find their boxes: bubble **"어? 자는 사이에 금방이 다녀갔네!"**.

### 7.5 Off-screen and far

Deliveries far from the camera finish on paper: the coins, the review and the doorstep parcel (if nobody is home) appear
as if they had been watched. Only on-screen deliveries play the doorbell scene. Nothing is skipped or lost.

---

## 8. At the door

### 8.1 Doorbell and handover (a house)

| Beat | Time | Driver | Resident | Sound / FX |
|---|---|---|---|---|
| Park | 0 s | stops at the kerb, hops out at `doorPoints[0]` | — | `sfx_brakes` |
| Take | 1 s | walks to `rearDoorPoint`, the box appears in hands (`carry_box`, box at `boxPoint`) | — | rear door clunk |
| Walk | 2–4 s | to the house `doorPoint` (+ a small offset so he does not stand in the door) | — | steps (snow) |
| Ring | 4.5 s | stops (hold a `carry_box` frame) | — | **bell bubble + "띵동~"**, `sfx_doorbell` |
| Door | 5.5 s | "택배요~ 금방이에요!" | appears at the door (fade in), faces the driver | `sfx_door` |
| Hand | 6.5 s | — | the box hops into their arms (0.4 s arc) | — |
| Joy | 7–9 s | `wave` | `happy` + hearts; one line from §8.3 | `sfx_customer_happy`, coin pop `+18` |
| Back | 9 s | `run` back to the van (`walk` at night), drives on | goes inside (fade at the door) or opens the box (§8.3) | — |

About 10–12 s per stop. Bubbles keep a constant screen size at every zoom (like the v5 honk bubbles), so they read at
zoom 0.6 on a 390-px phone.

### 8.2 Nobody home: the doorstep parcel

- If the household's resident is out (or it is night), the driver sets the box down at the door (box hops to the step,
  `sfx_box_drop`), plays `phone` for 1.5 s: **"문 앞에 두고 갈게요~"**, and leaves.
- The app gets a **photo**: a 128 × 80 render-texture snapshot of the doorstep (the VillageNews photo technique). Only the
  last 3 photos are kept; older ones show the mascot picture.
- The box stays on the step with a soft shadow and the gold tape (≈ 16–20 CSS px at zoom 0.6: readable). After 4 game
  hours outside it gets a **tiny snow cap** (a code-drawn white dome): "눈 맞은 택배".
- **Pick-up:** when a member of the household next passes within 200 px of the door, at their evening return, or at 07:00
  — whichever comes first. The resident stops, picks the box up and carries it in (`carry_walk` for village residents; a
  "쏙" hop for town dolls). Never longer than one game day.
- **콩이:** if the dog roams within 300 px of a doorstep box, he may trot over and sniff it (one `DogPlay` sniff beat).
- Cap: ≤ 16 doorstep boxes in the world; above that, the next ones are handed to a neighbour ("옆집에 맡겼어요").

### 8.3 Reactions and unboxing

Lines at the handover (random, by taste; ko first, en in the copy book §13):

| Situation | Line |
|---|---|
| any | "방금 시켰는데 벌써요? 진짜 금방이네!" |
| kid at home | (from inside) "엄마, 금방 뭐가 왔어?" · mother: "금방이 왔지~!" |
| elder | "아이고, 무거운 걸 여기까지. 고마워요, 기사님." |
| late (> 6 game hours) | kid: "오늘은 금방이 아니라 조금방이네~" · driver: "죄송해요, 눈길이 미끄러워서요!" |
| snow day | "눈길을 뚫고 왔네! 대단해요!" |
| the chief nearby | "촌장님 덕분에 이렇게 편해졌어요!" |

**Unboxing** (30 % of on-screen handovers, village residents only, by day): the resident sets the box down by the door,
the lid flaps open (box hop + scale), the item icons pop out in an arc and land back inside, the resident plays
`surprised` then `dance` or `laugh` (their own villagers anims; town dolls would use townfolk2 `clap`) and carries the box
in (`carry_walk`). If the household has a **cat** (`pet_cat`), the cat jumps into the empty box
instead, and the box stays 5 s with the cat in it: **"고양이는 상자가 더 좋대요."** (once per household per game day.)

### 8.4 Apartments

The driver walks to the apartment entrance (`doorPoint`, "entrance steps"), plays the bell, and **goes in** (fade), 4 s,
then comes out empty-handed. App: `아파트 2동 · 문 앞 배송 완료` + photo of the entrance. One stop can serve several
households of the same block (one walk, several boxes stacked in his arms: 2–3 boxes drawn).

### 8.5 금방 보관함 (lockers)

- **Spots** (candidates, a layout check decides): **서리 광장** south side (village residents pass it most), and **솔방울 아파트
  앞길** between `t_apt2` and `t_apt3`.
- **Fill:** the sled (plaza) or a van (apartments) drops every parcel for that area in **one stop**: boxes hop into the
  doors one by one, door lights blink gold. This makes the village round several times faster.
- **Pick-up:** residents walking by stop, a door pops open (`open` 4 frames, `sfx_switch_clack` or the locker click), the box
  hops out, the door shuts. Bubble: **"딸깍! 금방 왔네."** Residents chat in front of it now and then (a free VillageLife
  chat spot: "보관함 앞에서 이웃끼리 인사해요").
- Cap 12 boxes per locker; when full, deliveries for that area go to doors again.

---

## 9. The 금방 앱 (phone UI)

Phone 390 × 844 CSS; logical = CSS × 720/390 (v4.2 rule). Tap targets ≥ 44 CSS px; body text ≥ 15 CSS px; statuses always
use an icon **and** a word, never colour alone.

### 9.1 HUD chip and toasts

| Element | Where | Size | Shows | Tap |
|---|---|---|---|---|
| **금방 chip** | left column under the 업무 chip: CSS (60, 270) → logical (111, 499); if it collides with the v4 order chip, it becomes a gold badge on the 업무 chip instead | 120 × 44 | 금방이 icon + `배달 중 3` (or `주문 5` while none is on the road); a gold dot when something new happened | opens the app |
| Toast | top centre, under the clock row | ≤ 300 × 48 | gold left edge, icon, one line: `띵동! 새 주문 · 민지네 · 빵 3` | opens that order |

Toast rules: the first order of each game day, named village residents, upgrades offered, the first 새벽배송 morning;
otherwise ≤ 1 per 30 s, and none while another panel is open or during a ceremony.

### 9.2 The panel

Non-pausing (like the v4.2 office panel), 720 × 1100 logical, drawn as **the chief's phone**: a rounded dark bezel, a
little speaker slot at the top, the gold app inside. Tap outside or the ✕ closes it.

```
┌───────────────────────────────────────┐
│ ▪ 금방이  금방 마켓                 ✕ │  gold header, mascot runs in on open
│   방금 시키면 금방 와요                │
├───────────────────────────────────────┤
│  오늘 │ 주문 │ 상품 │ 기사님 │ 후기     │  tabs (new-content dot)
├───────────────────────────────────────┤
│  (tab content, scrolls)               │
│                                       │
└───────────────────────────────────────┘
```

### 9.3 Tabs

**오늘** (the drain at a glance)
- Four big numbers: `주문 42` · `배달 38` · `줄어든 재고 −214` · `+1,240코인`.
- **물류센터 선반** bars per category (materials / food / goods / tools), with yesterday's level as a faint line: the
  designer sees the racks go down.
- `지금 특가` row: up to 4 items on 특가 (icon + "남음").
- One line from the newest review.

**주문** (live orders)
- Cards, newest first, ≤ 12 open + the last 6 done:
  ```
  솔방울 아파트 2동 · 정 할머니           배달 중
  장작 4 · 빵 2                         +22
  ●━━━●━━━●━━━◉━━━○   출발! 약 20초 뒤 도착
  [따라가기]
  ```
  Steps (icons + words): **주문** → **고르기** → **포장** → **배달 중** → **도착**. Done cards show the doorstep photo
  thumbnail (or the mascot) and the review stars.
- `따라가기`: the camera follows the parcel wherever it is now (rack → belt → bay → van → door), with a caption chip;
  any touch on the village hands the camera back (the 관망 hand-back rule).

**상품** (catalogue)
- One row per item: icon, app name, stock in the centre, 금방 price, a status chip: **특가** (gold) · **판매 중** · **가게
  먼저** (paused, with the shop's name) · **품절**.
- A **팔기 / 쉬기** toggle per item (the player can keep anything out of 금방), and the **특가** button (free, one item, one
  game day).

**기사님** (fleet)
- One row per vehicle: driver portrait (doll head), `쌩쌩이 · 배달 중 3/8 · 뒷길`, or `포장 기다림`, `돌아오는 중`,
  `쉬는 중 (난롯가)`, `퇴근`.
- Offered upgrades appear here as cards with their price and one line why (`주문이 12개 기다려요`). Buying moves the camera to
  the pad at the depot (the v4.2 "camera hop + arrow" pattern); nothing is bought inside the panel.

**후기** (reviews)
- The last 12 reviews, always 4–5 stars, each with a name, the item icon and one line (§12.3). A new review gives the tab a
  dot.

### 9.4 Where else the app opens

Tapping a 금방 van or sled (its orders), the 출고 label at dock 1, the office 재고 tab's 금방 row, or a toast.

### 9.5 Settings (tab 놀이, after the v4.2 rows)

| Row | Values | Default |
|---|---|---|
| 금방 알림 | 켬 / 조용히 (no toasts, chip only) / 끔 | 켬 |
| 금방 문 앞 장면 | 켬 / 끔 (no doorbell scenes or unboxing; deliveries still happen) | 켬 |

---

## 10. Earnings and numbers

### 10.1 Prices

`금방 price = round(shop price × priceRate)`, `priceRate` 0.8; raw goods at fixed prices (생선 2, 고기 5, 통나무 2, 밀 2), all
above the 솔방울 상인's 0.6 × price and raw 1–3, so every surplus item earns a bit more through 금방. A typical parcel is
worth 15–25 coins.

### 10.2 Money flow

1. On delivery the household pays: a coin pop `+18` at the door (only on screen).
2. The coins go to the existing **물류 금고** at the depot forecourt (no new till), tagged as source `gb`.
3. **딸랑이** collects it on his round (v4.2 rule: the 물류 금고 is always on the round) and deposits it at the bank.
4. The 통장 tab gets an income bar **금방**; the morning paper prints yesterday's 금방 numbers.

### 10.3 Income impact (a designer decision)

At ≈ 5 parcels a minute × ≈ 20 coins, 금방 adds ≈ 80–120 coins a minute, **+3–5 %** of a late village's ≈ 2,500 (*estimate*).
v4.2 already sits at +29–37 % against a +30 % cap (code-1 report §3.3). Options for 대표님:
- keep `priceRate` 0.8 (금방 is a reward for building the depot);
- lower it to 0.5 (금방 is about clearing stock, not coins);
- or count part of the reward as happiness instead (each household with ≥ 3 deliveries gets +1 happiness once, inside the
  existing `happyCap`).

### 10.4 Proposed `balance.js` block (names are suggestions; Korean comments for 대표님)

```js
  // =====================================================================
  //  (v4.3) 금방 — 물류창고의 온라인 마켓 (docs/geumbang_plan_player.md)
  // =====================================================================
  geumbang: {
    // ── 언제 열려요: 물류창고가 생기고 dayAfter 일이 지나거나, 선반이 fullAt 이상으로 fullForS 초 → 편지 / 알림
    gate: { dayAfter: 1, fullAt: 0.6, fullForS: 120 },
    // ── 개업 값 (코인 + 자재), 준비 시간(초)
    open: { coins: 4000, item_plank: 20, item_ingot: 10, time: 15 },
    // ── 주문: 한 집이 everyDays 일에 한 번쯤, 한 번에 itemsMin~itemsMax 개 (상자 하나)
    //    hot / low = 선반이 이만큼(0~1) 넘으면 특가(hotMult 배), 이보다 적으면 lowMult 배, snowMult = 눈 오는 날
    orders: { everyDays: 1.2, itemsMin: 2, itemsMax: 6, hot: 0.6, hotMult: 1.5, low: 0.25, lowMult: 0.5, snowMult: 1.3,
              dealMult: 2, keepFloor: 4, maxOpen: 24,
              hours: [[7, 9, 1.2], [12, 13, 1.0], [18, 22, 1.6], [22, 26, 0.8], [26, 30, 0.2]] },   // [시작, 끝, 배율] (26 = 새벽 2시)
    // ── 가게 먼저: 판매대가 shelfMin 아래거나 부족·길 막힘이면 그 물건은 쉬어요, resumeS 초 괜찮으면 다시 팔아요
    //    meatShelf = 훈제 고기는 판매대가 이만큼 찬 채로 meatForS 초 있어야 팔아요, traderMin = 상인은 이만큼 찬 종류만 사요
    guard: { shelfMin: 0.5, resumeS: 60, meatShelf: 0.75, meatForS: 60, traderMin: 0.5 },
    // ── 값: 가게 값 × priceRate, 원료는 따로
    priceRate: 0.8, rawPrice: { item_fish_raw: 2, item_meat_raw: 5, item_log: 2, item_wheat: 2 },
    // ── 밴: 한 번에 cap 상자, 가장 오래 기다린 상자가 waitH 게임 시간이면 덜 차도 출발, 속도(px/초), 하차 지점 거리(px)
    van: { cap: 8, waitH: 2, speed: 140, kerbPx: 400, hours: [7, 21], breakEvery: 3, breakS: 10 },
    // ── 개썰매: 옛 동네 담당
    sled: { cap: 4, speed: 136, waitS: 180 },
    // ── 문 앞: 문 앞 상자 최대 개수, 눈 쌓이는 시간(게임 시간), 고양이·언박싱 확률
    door: { maxDoorstep: 16, snowCapH: 4, unboxChance: 0.3, quietFrom: 21, quietTo: 8 },
    // ── 업그레이드 값과 제안 조건 (§11)
    up: { van2: 2500, van3: 4000, sled2: 1500, pack2: 1200, lockerPlaza: 1800, lockerApt: 1500, dawn: 5000, backhaul: 800,
          offerWait: 10, offerS: 90, packQueue: 6, packS: 60, dawnNights: 3, dawnWaiting: 8, backhaulDock: 60, backhaulS: 120 },
    // ── 보관함: 상자 최대 개수
    locker: { cap: 12 },
  },
```

### 10.5 What the build should measure (census bot, the v4.2 saves + a fresh 90-min game)

| Measure | Gate |
|---|---|
| Depot average fill | ≤ 40 % (measure v4.2 first), never full for > 2 min |
| Shop shelf empty rates (빵 / 훈제 고기 / 구운 생선 / 판자 / 주괴) | no worse than v4.2 + 2 points |
| Deliveries per game day | 40–80 at 개업; 100–150 with all upgrades |
| Order → door, median | ≤ 3 game hours (75 s) at 개업; ≤ 1.5 h (40 s) with 3 vans |
| Doorstep boxes | ≤ 16 at once; none older than 1 game day |
| Coins | delivered value = coins in the till + collected (conservation, also across a reload) |
| Income | +2–6 % (designer decision, §10.3) |
| Pacing | unchanged up to 읍; first 20 minutes byte-identical request log |
| Phone | ≤ +60 display objects near the depot/town; textures ≤ +12 MiB in those views; nothing loaded before the depot |

---

## 11. Upgrades

Offered one at a time, by measured need, as pads at the depot (the v4.2 pattern), each with a banner once and a card in
the app's 기사님 tab.

| Upgrade | Offered when | Cost | Effect | What you see |
|---|---|---|---|---|
| **포장대 2단** | ≥ 6 parcels waiting to be packed for 60 s | 1,200 | packing ×1.5, a second packer at the belt end | two packers, tape sounds in rhythm |
| **금방 밴 2** | ≥ 10 orders waiting for 90 s (by day) | 2,500 | +1 van, driver 부릉이 | the second gold van rolls out of dock 1 |
| **금방 밴 3** | the same, after van 2 | 4,000 | +1 van, driver 씽씽이 | three vans on the town streets at the evening peak |
| **개썰매 2** | ≥ 6 village parcels waiting for 90 s | 1,500 | +1 sled team | a second pair of huskies (seeded coat tints) |
| **광장 금방 보관함** | sled bought + 2 game days, or a village letter (§12.1) | 1,800 + 6 주괴 | one-stop fill for the village; residents pick up | gold locker on the plaza, doors pop |
| **아파트 금방 보관함** | van 2 bought | 1,500 + 6 주괴 | one-stop fill for the apartments | locker on 아파트 앞길 |
| **새벽배송** | after 3 game days with ≥ 8 orders waiting overnight | 5,000 | night crew of 2, vans and sleds run 21:00–07:00 | headlights, glowing roof signs, boxes on doorsteps at dawn |
| **돌아오는 길 짐 싣기** | ≥ 2 vans and the station dock surplus ≥ 60 for 2 min | 800 | returning vans carry ≤ 16 surplus crates to the depot | crates hop into the van's rear at the station |
| **오늘의 특가** (tool, free) | always (app 상품 tab, office 재고 tab's 남음 rows) | free | ×2 orders for one item for one game day | gold 특가 ribbon on that item |

Anti-softlock: every price is producible by lines the player already has; nothing here gates anything else.

---

## 12. Story hooks

### 12.1 Letters (the v4.2 letter system; ≤ 1 금방 letter per game day)

| From | Trigger | Body (ko) | Buttons |
|---|---|---|---|
| 솔방울 아파트 정 할머니 (+ 셈이 메모) | the gate (§3.2) | §3.2 | `금방 시작하기 · 4,000` / `조금 더 생각해 볼게요` |
| 서리마을 주민 (a named village resident) | 2 game days after 개업, no plaza locker | "광장에 금방 보관함이 있으면 산책길에 찾아갈게요. 문 앞까지 안 와도 괜찮아요!" | `보관함 자리 보기` / `나중에` |
| 민지 (9살) | first delivery to a household with a kid | "상자가 너무 커서 그 안에 들어가 봤어요! 상자 썰매도 탔어요." | `답장 보내기` (happiness +1) |
| 금방 쌩쌩이 기사 | 새벽배송 bought | "밤에는 초인종 안 누르고 살금살금 다닐게요. 문 앞에 두고 사진 찍어 둘게요!" | `고마워요` |
| 솔방울역 역무원 | backhaul offered | "금방 밴이 돌아갈 때 수출 상자도 실어 가면 어때요? 빈 차로 가기 아깝잖아요." | `돌아오는 길 짐 싣기 · 800` / `알겠어요` |
| 방금순 팀장 | 100th delivery | "촌장님, 벌써 100번째 배달이에요! 다들 '진짜 금방이네' 해요." | `축하해요!` (the crew cheers at the counter once) |

### 12.2 The morning paper (서리 소식, `news_*` templates)

- `금방, 어제 {n}집에 배달 · "방금 시켰는데 벌써 왔어요"`
- `물류창고 선반이 어제보다 {p}% 가벼워졌어요`
- `새벽배송 시작! 아침마다 문 앞에 작은 선물이`
- `금방 보관함 앞에서 이웃끼리 인사해요`
- The paper's ad slot: **금방 마켓 · 금방 뭐가 왔지? 금방이 왔지!**

### 12.3 Reviews (후기 tab; always 4–5 stars)

| Stars | Who | Review |
|---|---|---|
| ★★★★★ | 정 할머니 | 장작이 무거웠는데 이젠 문 앞까지 와요. 고마워요, 금방! |
| ★★★★★ | 민지 (9살) | 택배 아저씨가 손 흔들어 줬어요! 상자로 썰매 탔어요. |
| ★★★★★ | 광부 영감 | 고기가 싱싱하구먼. 방금 잡은 것 같아. |
| ★★★★★ | 솔방울 카페 사장 | 빵 떨어진 줄 알았는데 금방 왔네요. |
| ★★★★☆ | 장난꾸러기 | 상자가 물건보다 더 재밌어요. |
| ★★★★★ | 신혼부부 | 판자로 새집을 만들었더니 진짜 새가 이사 왔어요! |
| ★★★★★ | 고양이 집사 | 고양이가 상자에서 안 나와요. |
| ★★★★★ | 새벽배송 손님 | 자고 일어났더니 문 앞에 와 있었어요. 요정인가요? |
| ★★★★★ | 어부 아저씨 | 생선은 내가 잡으니까… 빵만 시켰어요. |
| ★★★★★ | 늦은 날 | 오늘은 금방이 아니라 조금방이었지만, 웃으면서 주셔서 좋았어요. |
| ★★★★★ | 눈 오는 날 | 눈길을 뚫고 개썰매가 왔어요. 멍멍이들 최고! |
| ★★★★★ | 보관함 | 보관함 문이 딸깍 열릴 때 기분이 좋아요. |

### 12.4 관망 mode and the office

- **관망 activity 금방 구경** (score 20, +20 when the first van of the day leaves and he is within 1,500 px): the chief walks
  to the depot door (cutaway opens), watches the belt 15–25 s, waves at the van leaving.
- **Camera director cuts** (v4.2 rules, ≤ 1 per 45 s): `첫 배달 출발`, `새벽배송 출발` (21:00), `보관함이 열렸어요`,
  `고양이가 상자에 쏙`.
- **Office:** 재고 tab row `금방 마켓 · 오늘 주문 42 · 배달 38 · 선반 −214`; 직원 tab lists the 금방 crew with what they do now;
  통장 bar `금방`.

### 12.5 Optional player toys (nice to have)

- **촌장님 선물하기:** in the app, send a parcel to a named resident (the chief pays the 금방 price). It arrives in a
  `item_gift_box` (life2) with a bow; the reaction is bigger ("촌장님이 보내셨다고요?!") and counts as a reply to a letter
  (happiness +1, inside `happyCap`). It also drains surplus.
- **촌장님 특급:** the chief can take one parcel from the 출고 bay (bag) and deliver it himself; the navigator points to the
  door; review `★★★★★ 촌장님이 직접 오셨어요!`.

---

## 13. Copy book (ko / en)

| Key (suggested) | 한국어 | English |
|---|---|---|
| `gb_name` | 금방 | Geumbang |
| `gb_app` | 금방 마켓 | Geumbang Market |
| `gb_centre` | 금방 물류센터 | Geumbang Centre |
| `gb_slogan` | 금방 왔지? | Here already, right? |
| `gb_tagline` | 방금 시키면 금방 와요 | Order now, here in a moment |
| `gb_qa` | 금방 뭐가 왔지? · 금방이 왔지! | What came just now? · Geumbang did! |
| `gb_open_pad` | 금방 개업 | Open Geumbang |
| `gb_open_banner` | 금방 물류센터가 문을 열었어요! | Geumbang Centre is open! |
| `gb_toast_order` | 띵동! 새 주문 · {who} · {items} | Ding-dong! New order · {who} · {items} |
| `gb_step_1..5` | 주문 · 고르기 · 포장 · 배달 중 · 도착 | Ordered · Picking · Packing · On the way · Delivered |
| `gb_eta` | 약 {s}초 뒤 도착 | Arriving in about {s} s |
| `gb_follow` | 따라가기 | Follow |
| `gb_clerk` | 네~ 금방입니다! | Hello, Geumbang here! |
| `gb_ring` | 택배요~ 금방이에요! | Delivery! It's Geumbang! |
| `gb_thanks_1` | 방금 시켰는데 벌써요? 진짜 금방이네! | I just ordered! That really was quick! |
| `gb_kid_q` / `gb_kid_a` | 엄마, 금방 뭐가 왔어? / 금방이 왔지~! | Mum, what just came? / Geumbang did! |
| `gb_doorstep` | 문 앞에 두고 갈게요~ | I'll leave it at the door! |
| `gb_doorstep_done` | 문 앞에 두었어요 | Left at your door |
| `gb_neighbour` | 옆집에 맡겼어요 | Left with a neighbour |
| `gb_morning` | 어? 자는 사이에 금방이 다녀갔네! | Oh! Geumbang came while I slept! |
| `gb_late_kid` | 오늘은 금방이 아니라 조금방이네~ | Not so quick today, huh? |
| `gb_late_driver` | 죄송해요, 눈길이 미끄러워서요! | Sorry, the snow was slippery! |
| `gb_locker_open` | 딸깍! 금방 왔네. | Click! It's here. |
| `gb_shop_first` | 가게 먼저 · 잠깐 품절 | Shops first · back soon |
| `gb_soldout` | 품절 | Sold out |
| `gb_deal` | 오늘의 특가 | Today's deal |
| `gb_tomorrow` | 내일 아침 도착 | Arrives tomorrow morning |
| `gb_waiting` | 출고 대기 {n} | Waiting to go {n} |
| `gb_cat` | 고양이는 상자가 더 좋대요 | The cat likes the box better |
| `gb_shift` | 수고하셨어요! / 다녀오겠습니다! | Good work today! / Off we go! |
| `gb_driver_safe` | 안전하게, 그래도 금방! | Safely, and still quick! |
| `gb_up_van` | 금방 밴 한 대 더 | One more van |
| `gb_up_dawn` | 새벽배송 | Dawn delivery |
| `gb_up_locker` | 금방 보관함 | Parcel locker |
| `gb_up_pack` | 포장대 2단 | Packing level 2 |
| `gb_up_backhaul` | 돌아오는 길 짐 싣기 | Load on the way back |
| `gb_why_wait` | 주문이 {n}개 기다려요 | {n} orders are waiting |
| `gb_row_office` | 금방 마켓 · 오늘 주문 {o} · 배달 {d} · 선반 −{s} | Geumbang · orders {o} · delivered {d} · racks −{s} |
| `gb_inc` | 금방 | Geumbang |

English uses "Geumbang" as a proper name (no attempt to translate the pun); the en slogan keeps the meaning.

---

## 14. What to avoid

**Real brands (never, in any language, in art, copy, UI or sound):**
- Names: 쿠팡, 쿠팡이츠, 배달의민족 / 배민, 마켓컬리 / 컬리, 요기요, SSG / 쓱, G마켓, 11번가, 네이버, 우체국, CJ대한통운, 한진,
  롯데택배, Amazon, DHL, FedEx, UPS.
- Their delivery and membership words: 로켓배송, 로켓프레시, 로켓와우, 와우 회원, 샛별배송, 쓱배송, 스마일배송, 오늘도착,
  쿠팡맨 / 쿠팡친구. Generic words are fine: 택배, 새벽배송, 당일배송, 무료배송, 문 앞 배송.
- Their marks and looks: no rocket (icon, shape, sticker), no rainbow-letter wordmark, no mint-and-white rider, no purple
  and white, no red-orange swallow, no brown box with a curved-arrow smile, no wings on 금방 parcels, no imitation of any
  real app's layout or mascot.
- Sounds: no real jingles; the 금방 jingle is three original notes.

**People and work:**
- No jokes about exhausted, overworked or scolded drivers; no "실패" or penalty when a parcel is late; no driver ratings
  that can go down; nobody works day and night (the night crew is separate, breaks are visible).
- Drivers obey the walker and crossing rules; they never speed through the plaza.
- Reviews are always kind; no 1–3 star reviews.

**Design pitfalls:**
- No text on vehicle bodies (mirroring, §4.6).
- No selling from shelves, the 창고 buffer or workshop inputs (§5.4).
- No toast spam (§9.1); no forced follow camera except the first order (skippable).
- No new world space in v4.3; no new item ids in the save for v4.3 (parcels are bundles of existing items).
- No mint for 금방 vans in later versions either: keep gold exclusive to 금방 (v8's shop-owner vans are red / blue / mint).

---

## 15. Art, sound and the file budget

### 15.1 Reused (no new files)

| Need | Existing asset |
|---|---|
| The centre, cutaway, dock doors, conveyor, lamp, racks, stock, forklift, pallet jack | `assets/logistics` `logistics_center`, `forklift`, `pallet_jack` |
| Parcels, pallet of boxes, items on the belt and in unboxing | `cardboard_box_s/m/l`, `pallet_boxes`, `lgx_items`, item icons |
| Gift parcel | `assets/life2` `item_gift_box` |
| Dog sled | `assets/vehicles` `dog_sled` |
| Placeholder van (CODE-1 only) | `delivery_van_blue` |
| Drivers, warehouse crew | `assets/cityfolk` presets `delivery_driver` (carry_box, run, walk, phone), `warehouse_worker`, `forklift_driver` |
| Residents' reactions | village residents (villagers art): `happy`, `surprised`, `laugh`, `dance`, `wave`, `carry_walk`, `bow` (villagers2); town dolls: townfolk `happy`, `wave`, `talk`, townfolk2 `clap`; the cat `pet_cat` |
| FX | hearts / music notes (emotes), sparkle, ribbon confetti |
| Icons | ui3 `ui_icon_delivery`, `ui_icon_timer`, `ui_icon_night`, `ui_icon_heart_pair`; ui5 `ui_icon_depot`, `ui_icon_route`, `ui_icon_sleigh` |
| Sounds | `sfx_door`, `sfx_box_drop`, `sfx_box`, `sfx_truck_engine`, `sfx_brakes`, `sfx_car_honk`, `sfx_sleigh_bells`, `sfx_dog_bark`, `sfx_customer_happy`, `sfx_coin`, `sfx_forklift_beep`, `sfx_switch_clack`, `amb_warehouse`; `sfx_ticket_chime` as the CODE-1 doorbell |

### 15.2 New (one art job `assets/geumbang/`, one audio job; ≤ 8 files)

| Key | What | Notes |
|---|---|---|
| `gb_van` | honey-gold re-render of the existing delivery-van model; 금방이 face emblem; idle 2 + move 4 frames, SE / NE + mirrors | same `cargoPoint`, `rearDoorPoint`, `seats`, `lightPoints` data as the existing van |
| `gb_roofsign` | camera-facing "금방" roof sign, day + lit night frame; `roofPoint` per van dir | never mirrored |
| `logistics_center_nameplate_gb_ko` / `_en` | "금방 물류센터" / "Geumbang Centre", same anchor and pass as the original nameplates | optional extra: a "서리 물류창고" patch to fix the v4.2 mismatch (§19) |
| `gb_banner` | vertical dock-1 banner, sway 4 frames | |
| `gb_locker` | 12-door parcel locker, `open` 4 frames, night glow | ≈ 1.8 × 0.6 m |
| `gb_tape_s/m/l` | gold tape + 금방이 sticker overlays for the 3 boxes | or taped box variants |
| `gb_sled_flag` | small pennant overlay for the dog sled | |
| `ui_gb_*` | app header 9-slice, phone bezel, mascot (idle / run / bow), 5 step icons, van / sled / locker / moon icons, HUD chip icon, photo frame | one UI page |
| `sfx_doorbell` (2 variants), `sfx_tape`, `sfx_gb_jingle` | soft two-tone 띵동, packing-tape 찌익, three-note app ping | one audio sprite |

Optional polish job: officefolk-style `hand_over` + `bow` coverage for the delivery polo and cap, so drivers hand the box
over with both hands and bow ("감사합니다~").

---

## 16. Save and reload (what the player is promised)

- Open orders, parcels in vans and sleds, doorstep boxes, locker contents, upgrades, today's numbers, the last reviews and
  photos' captions survive a reload. Parcels that were on the road go back to the 출고 bay and leave again; nothing is
  lost or delivered twice; coins are conserved.
- Photos themselves are not saved (they are retaken on the next delivery); the cards show the mascot meanwhile.
- A suggested slice `geumbang` (≤ 1.5 KB worst case): `{ v, st, up, orders ≤ 24, door ≤ 16, lockers, today, days ≤ 10,
  reviews ≤ 12, seeds }`, sanitized like the v4.2 slices.

---

## 17. Order of work, cut list, open questions

### 17.1 Order of value (if the lead must cut)

1. **Minimum lovable 금방:** gate + letter + 개업 (sign swap, dock 1) · orders with the shops-first rules · picking and
   packing in the cutaway · 1 van + kerb stops · doorbell / handover / doorstep · app tabs 오늘 + 주문 · money to the 물류
   금고.
2. Old village: 개썰매 (or the plaza locker as its fallback).
3. Upgrades: 포장대 2단, 밴 2 / 3.
4. 새벽배송.
5. Lockers.
6. Backhaul, 상품 / 기사님 / 후기 tabs polish, gifts, chief 특급, unboxing and the cat.

### 17.2 Cut list

- If the sled is cut: one **역앞 보관함** at the west end of 역앞 거리 serves the old village; residents walk there.
- If the gold van art is late: the blue van with the roof sign ships for one version (not mint, not red).
- If the cutaway loop is too costly on phones: keep the belt, the packing pop and the dock; drop the carrying pickers
  (items hop by tween).

### 17.3 Questions for 대표님

1. **Sign:** change the depot's sign to **금방 물류센터** (recommended), or keep 서리 물류창고 and add only the 금방 banner?
2. **Van colour:** new **honey-gold** van (recommended), or reuse an existing colour (mint reads as 배민, red as 우체국)?
3. **Slogan:** main **"금방 왔지?"** + tagline **"방금 시키면 금방 와요"**? Or another from §4.2?
4. **Income:** `priceRate` 0.8 (≈ +3–5 % income), 0.5, or part of it as happiness (§10.3)?
5. **Old village:** husky **개썰매** at 개업 (recommended), or only a locker?
6. **Names:** 방금순 팀장, 쏙쏙이, 척척이, 영차, 쌩쌩이, 부릉이, 씽씽이, 뽀득이, 반짝이, 살금이: keep or rename?
7. **Player toys:** include 촌장님 선물하기 and 촌장님 특급 (§12.5) in v4.3, or later?

---

## 18. Later versions (so v4.3 does not paint itself into a corner)

| Version | What changes for 금방 |
|---|---|
| v5 vehicles | The VehicleSim takes over driving: 금방 vans become traffic participants (`dispatch('delivery_van', to)`), with traffic lights at 도시. The 금방 data (routes, kerb points, fleet count) is handed over, not redrawn. A mission template "금방 아르바이트" (the chief drives a 금방 round in his truck, par stars, never fails) fits the v5 driving missions. |
| v5 missions / story | 금방 deliveries emit `delivered` events; the story engine's newspaper can replace the v4.3 금방 headlines; residents can gossip about parcels ("민지네 또 택배 왔대!"). |
| v6 harbour | "산지직송": fresh fish from the auction straight into 금방 (a 특가 source). |
| v7 beach | Deliveries to the resort hotel and beach shops on the same van rules. |
| v8 logistics | v8's 솔방울 물류센터 is B2B (shops' restocks); 금방 stays B2C. Options: 금방 grows a **대형 허브** in the new town (a gold re-render of the centre's shell, option B of §6.1); v8's 살림살이 furniture and appliances, now delivered off stage, can arrive in 금방 vans ("새 소파가 금방으로 왔다!"); 금방 deliveries could count toward the 큰 도시 "deliveries per day" bar (a v8 decision). Keep gold vans exclusive to 금방. |

---

## 19. Side findings (for the v4.2 / v8 owners; nothing changed here)

1. **v4.2 depot sign mismatch.** `DepotBuilding` draws the manifest's baked nameplate (`logistics_center_nameplate_ko` =
   "솔방울 물류센터"), while every v4.2 string calls the building **서리 물류창고**. A designer with a sharp eye will see it
   in the v4.2 screenshots. Two fixes exist without new art: the manifest's `nameBoard` supports a custom code-drawn
   name; or the 금방 art job adds a baked "서리 물류창고" patch.
2. **Van colours across versions.** v8's module paints shop-owner vans red / blue / mint by shop. If 금방 is gold, gold
   should stay exclusive to 금방 when v8 is integrated.
3. **Mint.** The existing mint van and any mint branding read as 배달의민족 to Korean players; avoid mint for anything
   delivery-branded.
4. **Mirrored vehicles.** Every vehicle has SE / NE drawn and SW / NW mirrored; any future vehicle lettering (bus line
   names, shop vans) needs camera-facing sprites, not body text.
