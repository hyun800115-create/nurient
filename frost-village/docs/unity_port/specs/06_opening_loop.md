# 06 · Opening loop: fish → grill → stall → coins, first hires, tutorial arrow and first-run coach cards — Unity port spec

Source: Phaser 3.90 game at `/home/user/nurient/frost-village` (v4.3 tree). Target: Unity 6.3 LTS, URP 2D, C# 9, Android
portrait. Reader: a C# engineer who does not read JavaScript. Every number below was copied from the code or computed
from `world.js` with Node (the module itself, not by hand). File and line references are for audit only.

Tags: **SLICE** = needed for the go/no-go build. **SLICE-should** = cheap, visible in the first two minutes, build it if
time allows (the slice still passes without it). **LATER** = after the slice. **DROP** = Phaser workaround, not needed.

Sibling specs this one plugs into (do not duplicate them):

| Spec | What it owns that this spec uses |
|---|---|
| 01 core view | world px space, `JsRound`, camera (incl. the tutorial framing 3.3 and `focusCamera` 3.7), input (`Input.vec`, `lastActivity`, `lastTouch`), frame loop and `dt` rule (5.1–5.2) |
| 03 buildings/depth | pictures, pivots, depth values and Unity sorting for the deck, grill, stall, pads, stacks (`StackView`), labels, rings |
| 04 characters/nav | chief movement, `FramePlayer` (impact frames), gather call site (`Player.Update/Impact`, `FindGatherable`), `ItemStack` data + flights (`MoveItem`, `SpawnItemTo`), `moveAgent` steering, collision, customers' walking |

This spec owns the **rules**: the deck's fish pool, the grill and its work spot, every pad hand-over, the stall's line,
serving, paying, the till, coins and the coin counter, the first three paid pads (clerk, cook, fisher), the step/flag
machine for them, the tutorial arrow and objective text, the first-run coach cards (Act 1), the toasts and banners of
the first minutes, and the save fields of all of these.

---

## 0. Decisions (read first)

| # | Decision | Why |
|---|---|---|
| L1 | Port the loop as **plain C# simulation classes** in world px (y down), ticked from the one game loop of 01 §5. MonoBehaviours only draw. | Same reason as 01 D1 / 04 C6: every radius, offset and cadence is in px and seconds. |
| L2 | Keep Phaser's **variable-step tick**: `dt = min(0.05, smoothedDeltaMs / 1000)`, once per frame (01 §5.1). Do **not** move this to `FixedUpdate`. | Several cadences are frame-quantised (L3). Phaser players saw them at 60 fps. |
| L3 | Port the timers **exactly as written**, including the ones that reset to the interval instead of adding it (`padT = 0.075`, station `timer = 0`, deck `timer = 0`). | At 60 fps a pad hand-over is every 5 frames = 83.3 ms (not 75 ms) and a chief-cooked fish every 39 frames = 0.65 s (not 0.64 s). "Fixing" them makes the first sale faster than Phaser. |
| L4 | `delayedCall` and tweens (item flights, coin flights, the 200 ms pay delay, the 700 ms pad delay) run on a **game-time scheduler** advanced by the same tick (04 C8). No coroutines on real time. | Counts change when a flight lands (`Reserve` / `Arrive`). They must pause with the game. |
| L5 | Integer coins (`int`). Prices are read through one `PriceOf(type)` that floors and clamps to ≥ 1. | `Economy` floors everything; `priceOf` clamps. |
| L6 | The slice runs the loop **as Phaser does with `?onboard=0&flagmaker=0`**: no flag-maker modal, no finger demo; the old Tutorial arrow + objective panel guide the player. The Act 1 coach cards (§13) are SLICE-should on top of that. | That Phaser mode exists and is faithful (automated browsers get it). The designer compares with that URL in Chrome (the WebView app cannot take it); the full protocol (저사양 for the look pass, fresh profile for zoom 1.2, usual preset for the feel pass) is 00 §10.2. |
| L7 | One seeded `System.Random` per system (shop, customers, deck), injectable for tests. | Customer wants, spawn gaps and looks are random in Phaser too. Tests need seeds. |
| L8 | Pad hit tests use the **iso distance** `gdist(a, b) = sqrt(dx² + (2·dy)²)`. A pad is an ellipse twice as wide as tall on screen. | `Pad.contains` uses `gdist2 < r²`. A circle test would make pads too tall. |

---

## 1. What a brand-new player does (the first ~2 minutes)

Spawn (1130, 412), coins 0, bag capacity 6, 3 customers already waiting at the stall, deck full (6 fish), no paid pad.

| # | Player action | What happens (rules in §6–§11) | Phaser objective key (Act 1 step) |
|---|---|---|---|
| 1 | Walks ~1 m up-left onto his landing at the water's edge (reel spot (1089, 386)) and lets go | After 0.08 s still, he casts; one fish every 0.6 s (impact frame of `fish` anim) leaps to his bag, while the pool lasts (max 6, +1 per 1.1 s) | `obj_fish` (move → still) |
| 2 | Walks to the green 「서서 굽기」 pad (934, 625) beside the grill | His raw fish hop into the grill one per 0.075 s; the grill cooks one per 0.64 s (chief speed ×1.25) while he stands there | `obj_op_grill` / `obj_operating_grill` (toop → cook) |
| 3 | Walks to the grill's output pad (1101, 639) | Grilled fish hop into his bag one per 0.075 s (up to 6) | `obj_take` (take) |
| 4 | Walks to the stall's shelf pad (1314, 835) | Grilled fish hop onto the shelf one per 0.075 s | `obj_sell` (shelf) |
| 5 | (automatic) | The front customer takes one fish per 0.2 s until the order (1–3) is filled, then waits to pay | (coming) |
| 6 | Walks to the register pad (1415, 859) and stands | Each customer whose order is complete pays (0.35 s each); coins (4 per fish) fly to the till; first payment sets flag `firstSale` | `obj_register` / `obj_register_wait` (reg → regwait) |
| 7 | Walks onto the till (1216, 900) | All coins on it go to his coins at once; the HUD counter counts up | `obj_cash` (cash) |
| 8 | 0.7 s after the first sale the 「점원 고용」 pad (12 coins) pops up at (1525, 900); he stands on it | After 0.5 s the coins drain into it (≥ 12 coins/s); clerk walks to the stall and takes payments from now on | `obj_clerk` (pad → onpad → helpers) |
| 9 | Next pads at (925, 745): 「요리사 고용」 30, then 「어부 고용」 45 | Cook works the grill; fisher fishes into the crate (LATER) — the tutorial ends with the fisher | `obj_cook`, `obj_fisher` |

Measured in Phaser (docs/redesign_v43/engineering_plan.md §4, onboarding bot following the arrow, Act 1 on): **first sale
at 15.7–16.1 s of game time** after the village loads (median 15.8–15.9 s over 5 seeds). Use it as the acceptance band (§19).

---

## 2. Scope

| Feature | Tag | Notes |
|---|---|---|
| Deck fish pool (max 6, +1/1.1 s), reel spot reach 55, chief's line state, `Hit`, `FishPos` | SLICE | §6. Art/depth in 03 §4.6; call site in 04 §6.2–6.4 |
| Grill station: input (max 30) / output (max 36) stacks, cook timer, process flights | SLICE | §7 |
| Grill operator spot 「서서 굽기」: chief stands → feeds and cooks at ×1.25 | SLICE | §7.3 |
| Pad hand-overs: grill in/out pads, shelf pad; one shared 0.075 s cooldown | SLICE | §8 |
| Stall stage 1 「눈꽃 노점」: shelf (40 per kind), one line (max 10), 3 starting customers, spawn 1.6–2.4 s, want 1–3 grilled fish, serve 0.2 s/item | SLICE | §9 |
| Register: pay only while the chief (or clerk) is on it; chief 0.35 s, clerk 0.55 s per customer | SLICE | §9.6 |
| Till (cash pad): value, coin pile, collect on contact, coin flights to the HUD | SLICE | §9.7, §10 |
| Economy + HUD coin counter (count-up, delay, pop) | SLICE | §10 |
| Step/flag machine for the fish line; pads `hire_clerk_market` (12), `op_grill` (30), `hire_fisherman` (45): show, pay, complete | SLICE | §11. Completion effects: see next rows |
| Clerk hired → walks to the stall post, takes payments | SLICE-should | §11.6 (simple: one walker + `ready`) |
| Cook hired → stands at the grill post, grill works without the chief at ×1.0 | SLICE-should | §11.6 |
| Fisher hired → seated deck loop, deck tier 2 art, fish crate pile, `inTutorial` ends | LATER | §17. In the slice the pad completes, the banner shows, and `hire_fisherman` is marked done (tutorial ends) |
| Tutorial arrow (bouncing, world) + objective panel + edge arrow, 0.2 s evaluation, 0.6 s / 1.5 s debounce | SLICE | §12 |
| Act 1 coach cards (welcome, steps, ✓ beats, laps, 「코인이 조금 모자라요」, helpers card), pulse ring, skip chip, camera views | SLICE-should | §13 |
| Finger demo, spotlight, Act 2 assists, Act 3 HUD tips, replay tour, 「튜토리얼 다시 보기」 | LATER | §13.8 |
| Toasts `bagFull`, `stationFull`, `notEnoughCoins`; banners on hires (queued, held during Act 1) | SLICE | §14 |
| Save/load of coins, progress, grill stacks, shelf, till, chief's bag, `onb` | SLICE | §15 (the save module itself belongs to the save spec) |
| Logistics sinks (porters' priorities), raw/goods porters, trash pad, pickup modes 'still'/'off', 관망 pilot, goal window, navigator, shop stages 2–4, 자재 창구, bakery, flag maker, admin speed, cheer ×1.1, line upgrades | LATER | §17 |
| StackBaker, Residency, lazy art, placeholder art | DROP | 03 §7–8 |

---

## 3. Places and constants

### 3.1 Key points at a new game (world px; computed from `world.js` by Node)

| Name | Point | Source |
|---|---|---|
| Chief spawn | (1130, 412) | world.js 127 |
| Reel spot (deck `gather`) | (1089, 386) | `deck.reel = LD(0, −0.25)`, LAND_C (1100, 380) |
| Chief's float (`bobAt`) | (1168, 337) | `landing.bob [−0.2, 1.7]` |
| Deck centre (tier 1) | (1073, 299) | `DECK_C` |
| Deck rods (holder / float) | (1174,299)/(1232,299), (1138,317)/(1196,317), (1138,281)/(1196,281) | `deck.rods`, float = rod + (0.64, 0.64) m |
| Gangway foot | (890, 420) | `deck.foot` |
| Fish crate pile (LATER) | (1000, 440) | `labour.piles.fish` |
| Grill station | (1004, 590) | `Z('plaza', −4.5, 4.8)` |
| Grill input pad | (907, 541) | grill + `XOFF(−2.15)` = (−97, −49) |
| Grill output pad | (1101, 639) | grill + (97, 49) |
| Grill work spot pad 「서서 굽기」 | (934, 625) | grill + `labour.ops.grill.pad [−70, 35]` |
| Cook's post | (1061, 562), faces SW | grill + `op [57, −28]` |
| Stall anchor (stage 1) | (1207, 782) | `Z('plaza', 2.0, 2.8)` |
| Shelf pad | (1314, 835) | stall + (107, 53) |
| Till (cash pad) | (1216, 900) | stall + (9, 118) |
| Register pad (seat A) | (1415, 859) | stall + (208, 77) |
| Clerk's post (stage 1) | (1236, 776), dir SW, step lift 7 px | art `market_s1_back.staffPoints [[29, −6]]` |
| Line slots 0–9 | (1107,798) (1066,818) (1025,838) (984,858) (943,878) (902,898) (943,918) (984,938) (1025,958) (1066,978) | §9.3 |
| Customers face | (1247, 762) | stall + `faceTo [40, −20]` |
| Customer entry path | (990,2200) → (990,1260) → (1080,1080) | `market.entry` |
| Customer exit path | (1080,1080) → (990,1260) → (990,2200) | `market.exit` |
| Pad `hire_clerk_market` | (1525, 900) | `WORLD.pads` |
| Pads `op_grill` (label below: [0, 64]), `hire_fisherman`, `raw_grill`, `porter_grill` | (925, 745) (same spot, one at a time) | `LINE('grill')` = grill + (−79, 155) |
| Trash pad (LATER) | (−45, 585), fire (−45, 489) | `WORLD.trash` |
| Tutorial camera view | (985, 600) | `tutorialView` |
| Act 1 views | register (1215, 760), pad (1320, 800) | `onboard.views` |

Walking distances (straight line, px): reel→work spot 285, work spot→output 168, output→shelf 289, shelf→register 104,
register→till 203, till→clerk pad 309. The grill stands between the reel and the work spot: Phaser's walk there takes
1.4–1.5 s.

### 3.2 Pad hit radii (`Pad`: `w = 90.5 · sizeM`, `r = (w/2) · radiusK`, default `radiusK = 0.78`; test `gdist2 < r²`)

| Pad | sizeM | radiusK | r (gdist px) |
|---|---|---|---|
| Grill input / output, fish pile | 1.45 | 0.78 | 51.178 |
| Work spot, register | 1.3 | 0.78 | 45.884 |
| Shelf | 1.6 | 0.78 | 56.472 |
| Till | 1.5 | 0.78 | 52.943 |
| Unlock / hire pad | 1.9 | 0.8 | 68.78 |
| Deck "stand here" mat (visual only; reach is the 55 rule) | 0.62 | 0.78 | 21.883 |
| Trash (LATER) | 1.35 | 0.78 | 47.648 |

`Contains(px, py, extra = 0)`: `r' = r + extra; gdist2(px, py, x, y) < r'²`.

### 3.3 Balance constants used by the loop (balance.js; copy these numbers)

| Key | Value | Meaning |
|---|---|---|
| `start.coins` | 0 | coins at a new game |
| `start.firstCustomers` | 3 | customers placed in slots 0..2 at every load (new or saved) |
| `player.speed` / `verticalFactor` | 255 px/s / 0.74 | chief (04) |
| `player.gatherRange` | 78 | `FindGatherable` range (the deck uses its own 55 rule) |
| `player.stillDelay` | 0.08 s | still time before gathering starts |
| `player.padDelay` | 0.5 s | standing time before a paid pad drains coins |
| `player.trashDelay` | 0.6 s | (LATER) |
| `player.padItemInterval` | 0.075 s | hand-over cooldown on pads |
| `upgrades.capacity.values` | [6, 10, 14, 18, 22, 26] | bag size by level (level 0 at start → 6) |
| `upgrades.speed.values` | [1.0, 1.15, 1.3, 1.45, 1.6] | (bench opens after `hire_lumberjack`: LATER) |
| `prices.item_fish_cooked` | 4 | coins per grilled fish |
| `costs.hire_clerk_market` / `op_grill` / `hire_fisherman` | 12 / 30 / 45 | first three pads |
| `costs.raw_grill` / `porter_grill` / `zone_forest` | 70 / 100 / 90 | next pads (LATER) |
| `payDuration` | 1.6 s | a pad drains at `max(12, cost / 1.6)` coins/s |
| `stations.grill` | time 0.8, inputMax 30, outputMax 36 | grill |
| `labour.chiefSpeed` | 1.25 | the chief cooks ×1.25 faster than the cook |
| `resources.net` | max 6, refill 1.1 s | deck fish pool |
| `deck.reelS` | 0.6 | (kept for the old `reel` anim; with the landing the chief loops `fish`) |
| `customers.spawnEvery` / `spawnEveryLate` | 2.0 / 1.3 s | spawn gap (×0.8–1.2); "late" only after `hire_hunter` |
| `customers.maxQueue` | 10 | customers in line incl. those walking in |
| `customers.wantMin` / `wantMax` / `wantMaxLate` | 1 / 3 / 5 | order size |
| `customers.takeInterval` | 0.2 s | one item per 0.2 s to the front customer |
| `customers.speed` | 120 px/s | × (0.88 + rnd·0.24) per customer |
| `customers.shelfMax` | 40 | per kind (stage 1; `market43.shelfMax[0]` = 40 too) |
| `market43.spawnMul[0]`, `lineShow` | 1, 6 | stage 1 multiplier; slots before the line bends |
| `register.chiefPayTime` / `clerkPayTime` | 0.35 / 0.55 s | per customer |
| `cash.pileVisualMax` / `collectInterval` | 48 / 0.03 s | coin pile pictures; one pile coin flies per 0.03 s |
| `autosaveEvery` | 5 s | (save spec) |
| `workers.speed` | 150 px/s | clerk / cook walking to their post |
| `onboard.*` | arrowBig 1.3, idleDrag 3, idleDragLight 5, dragRepeat 12, assistIdle 5, assistGap 20, assistMax 3, dwell 1.5, beat 0.7, tipGap 45, tipShow 7, settingsTipAfter 480, stuckSec 45, act1Max 360 | §13 (`dwellComing` 2.8, `resumeSettle` 1.5, `praiseSec` 3, `stuckPush` 1.2 are code defaults, not in balance.js) |
| `v42.pickup` | stillS 0.35, stillSpeed 20, gatherStillS 0.35, tipSpeed 0.6 | only for pickup modes 'still'/'off' (LATER); the tutorial forces 'auto' |

`balanceCheck.js` replaces bad values with safe ones at boot (LATER: hard-code the values above for the slice).

---

## 4. Time model and tick order (this subsystem's part)

**Model:** one variable step per rendered frame (01 §5). `dt = min(0.05, delta_ms/1000)`. `nowMs` = scene clock (ms,
pauses with the game). Timers are float seconds that accumulate `dt`. One-shots (`delayedCall`) and tweens are in ms on
the same clock. Nothing in the loop uses wall-clock time.

Order inside `Game.tick(time, delta)` (Game.js 2170–2305), loop parts only:

```
1  vec = Input.Update(nowMs)                                      // 01
2  walkClock += dt
3  player.Update(dt, vec)                                         // 04: movement, gathering, operating anim
4  onPad  = progression.Update(dt)                                // §11: unlock/hire pads (pay, complete)
5  padT  -= dt
6  onPad |= HandlePlayerPads(dt)                                  // §8: grill in/out, shelf, till/register flags
7  onPad |= UpdateLabour(dt)                                      // §7.3: work spots (chief on → feeds), piles (LATER)
8  playerOnPad = onPad                                            // read by step 3 next frame (blocks gathering)
9  deck.Update(dt)                                                // §6: refill, line, mat alpha
10 foreach station: station.Update(dt)                            // §7: cook timer
11 shop.Update(dt)                                                // §9: till collect, registers, spawn, lanes, leavers
12 workers / residents / dog …                                    // 04 (residents), LATER (fisher)
13 tutorial.Update(dt)                                            // §12 (evaluates every 0.2 s)
14 onboarding.Update(dt)                                          // §13
15 occlusion, zoom, camera target                                 // 03, 01
16 autosave timer (+= dt; ≥ 5 → save)                             // save spec
UI scene (after Game): coin counter, toast/banner queues, objective panel, edge arrow, coach card   // §10, §12–§14
Scheduler: advance delayedCalls and tweens by delta (Phaser does this before the scene update)
```

Phaser runs the tween/timer managers **before** `Scene.update` each frame, so a flight that completes this frame has
already called its `onDone` when the tick runs. Keep that order: `Scheduler.Advance(deltaMs)` then `Tick(dt)`.

---

## 5. Data shapes (C#)

```csharp
// Item stacks: data API and flights are in 04 §7.1 / §7.3. Fields used here:
//   Items (list of {Type}), Count, Incoming, InTypes, Max, Room = Max - Count - Incoming, Full = Count + Incoming >= Max,
//   CountOf(t), CountWithIncoming(t), HasAny(types), Pop(type | types | null) (topmost match), Push(t),
//   Reserve(t) (Incoming++, InTypes.Add), Arrive(t) (Incoming--, InTypes.Remove first)

public sealed class PadArea {                 // Pad.js
    public float X, Y, W, R;                  // W = 90.5*sizeM, R = W/2*radiusK
    public bool Contains(float px, float py, float extra = 0) { float r = R + extra; float dx = px - X, dy = (py - Y) * 2; return dx*dx + dy*dy < r*r; }
    public void Pulse();                       // view: scale ×1.08 → back over 220 ms (Quad.easeOut)
}

public sealed class FishingDeck {              // FishingDeck.js
    public const string Kind = "net", Item = "item_fish_raw", PlayerAnim = "harvest", ChiefAnim = "fish";
    public int Max = 6, Stock = 6; public float Timer;          // pool
    public Vector2 Gather = new(1089, 386), BobAt = new(1168, 337);
    public CastState Cast;                                       // Off | Out | In | Back, t, from, bob (current float point)
    public int Tier = 1;                                         // 1..3 (LATER: 2, 3)
}

public sealed class Station {                  // Station.js (grill only in the slice)
    public string Id = "grill", Input = "item_fish_raw", Output = "item_fish_cooked";
    public float X = 1004, Y = 590, Time = 0.8f; public int InputMax = 30, OutputMax = 36;
    public PadArea InPad, OutPad; public ItemStackData InStack, OutStack;
    public float Timer, IdleT; public bool Working, Enabled = true;
    public OperatorSpot Op;
}

public sealed class OperatorSpot {             // Labour.js 58–185
    public Station Station; public PadArea Pad; public Vector2 Post; public int Dir;      // grill: post (1061,562), dir SW
    public int? ChiefDir;                     // grill: SE
    public string ChiefAnimName = "give"; public Operator OperatorNpc;                    // null until op_grill
    public bool Chief, Enabled = true; public float FeedT, NeedT;
    public bool Active => Enabled && (Chief || (OperatorNpc != null && OperatorNpc.Ready));
}

public sealed class Shop {                     // StageMarket (stage 1 only in the slice)
    public int Stage = 1; public float X = 1207, Y = 782;
    public PadArea Shelf; public ItemStackData Stock;            // typeCols: fish 0, bread 1, meat 2
    public int MaxPerType = 40;
    public CashPad Cash; public Register SeatA;                   // seats M, B, M2 exist but are disabled at stage 1
    public Lane Food;                                            // the only open lane at stage 1
    public List<Customer> Leaving = new(); public float SpawnT = 1.0f; public List<string> LastKeys = new();
}

public sealed class Lane {                     // Seller.js 917–1007
    public string Id = "food"; public string[] Types = { "item_fish_cooked", "item_meat_cooked" };
    public List<Customer> Queue = new(); public Register Register;
    public Vector2 QueueStart = new(-100, 16), QueueStep = new(-41, 20), QueueStep2 = new(41, 20); public int QueueTurn = 6;
    public Vector2 FaceTo = new(40, -20);
    public float ServeT, PayT, WaitPayT, EmptyT, IdleT;
}

public sealed class Customer : CharacterSim {  // Seller.js 558–728 (radius 13, carry capacity 10)
    public Lane Market; public (string Type, int Count) Want; public int Need, Got, Value;
    public List<string> Bought = new(), Flying = new();
    public CustomerState State = CustomerState.Arrive;   // Arrive, Wait, Happy, Leave, Fade
    public List<Vector2> Path; public bool Arrived, PayWait, BubbleShown; public float Speed, HappyT, LeaveT; public int Slot = -1;
    public Vector2? Home;
}

public sealed class Register {                 // Register.js 13–168
    public float X, Y; public PadArea Pad; public Vector2 Staff; public Clerk Clerk; public bool Chief, Enabled = true; public float OnT;
    public bool Staffed => Enabled && (Chief || (Clerk != null && Clerk.Ready));
}

public sealed class CashPad {                  // Seller.js 23–148
    public float X, Y; public PadArea Pad; public int Value; public ItemStackData Pile;   // Pile.Max = 48
    public float CollectT; public int ToChief; public bool Enabled = true;
}

public sealed class UnlockPad {                // UnlockPad.js
    public string Id, Kind;                    // Kind: "hire" | "unlock" | "upgrade"
    public float X, Y; public PadArea Pad;     // sizeM 1.9, radiusK 0.8
    public int Cost, Paid; public bool NeedsLeave, Done, Maxed, Active = true;
    public float StandT, Acc, CoinT, TickT; public bool Warned;
    public Dictionary<string,int> Items, Got; // null for the first three pads
    public int Remaining => Math.Max(0, Cost - Paid);
    public Action<UnlockPad> OnComplete;
}

public sealed class Progression {              // Progression.js
    public Dictionary<string,bool> Done = new(); public Dictionary<string,int> Paid = new();
    public Dictionary<string,bool> Flags = new(), Hints = new(), Seen = new();
    public Dictionary<string, Dictionary<string,int>> Got = new();
    public (int Capacity, int Speed) Up;       // upgrade levels, 0 at start
    public bool Celebrated, Celebrated3;
    public Dictionary<string, UnlockPad> Pads = new();
    public int Capacity() => UpgradesCapacity[Up.Capacity];      // 6 at start
    public bool InTutorial => !IsDone("hire_fisherman");
}

public sealed class Economy { public int Coins; public long Earned; public bool Unlimited; }   // Economy.js
```

---

## 6. The fishing deck (the first "station")

### 6.1 Pool (FishingDeck.js 391–433)

```
Ready()            = Enabled && Stock > 0
Update(dt):
    if Stock < Max: Timer += dt; if Timer >= 1.1 { Timer = 0; Stock++; splash fx at the rod float of fish #Stock (cosmetic, only on screen) }
    (then: mat alpha §6.4, rods drawing (03), chief line §6.3)
Hit(by):
    if !Ready() return null
    Stock--
    mine = by is the chief && Cast.St == In
    (x, y) = mine ? Cast.Bob : position of rod fish #Stock (or Gather)
    if mine: splash ring at (x, y)
    fx: fx_splash sheet at (x, y+10) size 70; splash burst 3; water ripple (01/02)
    sfx: sfx_reel at Gather vol (chief 0.55 / others 0.3) throttle 120 ms; sfx_splash at (x, y) vol 0.6 / 0.35
    return "item_fish_raw"
FishPos(by):
    if by is chief && Cast.St in {Out, In}: return (Cast.Bob.x, Cast.Bob.y - 2, leap: 50)    // landing.leap
    else: position of rod fish #max(0, Stock)
Reel(by):  reelT = 0.6; if by is chief: ChiefCast(by)
```

Not saved: a reload starts with a full pool (`Stock = 6`, `Timer = 0`).

### 6.2 The chief's gather contract (who calls what — implementation in 04 §6.2–6.4)

```
FindGatherable(x, y, 78): at a new game the only candidate is the deck:
    if gdist(x, y, 1073, 299) < 78 and Ready → candidate (never true from the landing)
    if gdist(x, y, Gather) < 55 and Ready → return deck          // the reel reach: 110 px wide ellipse
Player (still, stillT > 0.08, !playerOnPad, node == null):
    n = FindGatherable(...)
    if n != null && !FishCapped(n):                              // §13.6: min(4, capacity) on Act 1 lap 1, else none
        if Room <= 0:                     WarnFull()              // toast bagFull, throttled 2.5 s (suppressed in Act 1)
        else if StationBlocked(n.Item):   FullToast()             // grill input AND output full → toast stationFull (2.5 s throttle)
        else: node = n; n.Reel(this)                              // casts the line
    while node set: play `fish` (loop) facing BobAt; every impact frame → Impact():
        if Room <= 0 or FishCapped → nothing
        item = deck.Hit(chief); from = deck.FishPos(chief)
        SpawnItemTo(item, from, chief, isPlayer: true, delay 0, fo: (height 50, spin −330))   // 300 ms flight
        vibrate 8 ms
    node cleared when: chief moves; !deck.Ready(); Room <= 0 (WarnFull); FishCapped
```

Cadence: `fish` = 6 frames at 10 fps (0.6 s loop), impact frame index 3 → first fish 0.3 s after the anim starts, then
one per 0.6 s, capped by the pool (6, then one per 1.1 s). `StationBlocked(item)` = the station whose input is `item`
(grill) is enabled and `InStack.Full && OutStack.Full`.

### 6.3 The chief's line (FishingDeck.js 178–275) — SLICE (cosmetic, but `Cast.Bob` is the fish start point)

```
ChiefHere(p) = !p.Seat && !p.Action && collision.InLand(p) && gdist(p, Gather) < 55 && p.vx² + p.vy² < 25
LineHeld(p)  = !p.FishCapped(deck) && p.Room > 0 && pickupPolicy.KeepGathering(p)      // KeepGathering = true in 'auto'
HoldsChief(p)= Cast.St in {In, Out} && p is chief && ChiefHere(p) && LineHeld(p)         // he keeps the `fish` anim, no catch
ChiefCast(p): if Cast.St in {Out, In} return; St = Out; t = 0; from = rod tip; sfx_reel 0.4 at Gather (forced)
UpdateChiefLine(dt):
  here = Enabled && ChiefHere(p) && (p.node == deck || (St in {In,Out} && LineHeld(p)))
  if !here && St in {Out, In}: St = Back; t = 0; from = Bob
  t += dt; rings age (drop at 0.7 s)
  Out:  u = min(1, t/0.25); bob = lerp(from, BobAt, u) - (0, sin(u·π)·26); at u = 1 → St = In, ring (k 1.1), splash 3
  In:   bob = BobAt + (sin(now·1.3)·1.5, sin(now·3.1)·1.4 + (frame 1 or 2 of `fish` ? 3 + frame : 0)); every 1.3 s a small ring (k 0.5)
  Back: u = min(1, t/0.2); bob = lerp(from, tip + (0, 8), u) - (0, sin(u·π)·10); u = 1 → St = Off
```

Drawing the line/float (03 owns depth): 8-segment line from the rod tip (anim `tipPoints` NE per frame; fallback
offset (24, −66) from the feet) to the float, sag `10·(1 − tension)` (tension Out/Back 1; In: frame 3 → 1, frames 2/4 →
0.6, else 0.25), width 1.3, colour #F4F7FB α 0.95. Float: white circle r 3.4 at (bx, by − 1), red #E8433A r 3.4 at
(bx, by − 3.4), shadow ellipse 9×4 #0B2A44 α 0.25 while In. Rings: ellipse radius `(5 + 17u)·k`, height half, line 1.6
white α `0.75(1 − u)`.

### 6.4 The mat under the reel spot (FishingDeck.js 440–451)

Target alpha: `0.12` when the chief is on the mat (r 21.883) and his line is out; `1` when on it otherwise; else `0.85`.
`a += (target − a) · min(1, dt·8)` (snap when within 0.01); icon alpha `= a · 0.65`.

---

## 7. The grill and its work spot

### 7.1 Station update (Station.js 88–125)

```
Update(dt):
    (views: InStack layout at (inPad.x, inPad.y+6), OutStack at (outPad.x, outPad.y+6) — 03 §4.4)
    if !Enabled return
    if CanWork():
        IdleT = 0; SetWorking(true)                                   // work anim + fire loop visible (03 §4.8)
        k = (Op != null && Op.Chief && Op.OperatorNpc == null) ? 1.25 : 1      // labour.chiefSpeed
        Timer += dt * k * cheer(=1) ; if Timer >= 0.8 * timeMult(=1) { Timer = 0; Process(); }
    else:
        IdleT += dt; if IdleT > 0.35: SetWorking(false)              // Timer is kept (partial progress survives a pause)
    while Working: every 0.5–0.9 s (on screen ±150): smoke burst (x ± 30, y − 40) ×1, flame burst (x ± 35, y − 28) ×2
CanWork() = Op.Active && InStack.Count > 0 && OutStack.Count + OutStack.Incoming < 36
HasWork() = InStack.Count > 0 && OutStack.Count + OutStack.Incoming < OutStack.Max
```

At 60 fps: chief 39 frames (0.65 s) per fish, cook 48–49 frames (0.80–0.82 s).

### 7.2 Process (Station.js 130–155)

```
Process():
    it = InStack.Pop("item_fish_raw"); if it == null return
    Fly(it, it.pos → (x, y − 40), 240 ms, height 50, scaleTo 0.4, onDone: release)
    OutStack.Reserve("item_fish_cooked")                     // counts against the 36 now
    after 260 ms:
        spr = take "item_fish_cooked" at scale 0.5
        Fly(spr, (x, y − 50) → OutStack.NextPos(), 300 ms, height 60, scaleTo 1,
            onDone: OutStack.Arrive; OutStack.Push; sfx_drop at outPad vol 0.35 rate 1.1–1.3 throttle 60 (if on screen))
        sfx_sizzle at station vol (cook hired ? 0.22 : 0.45) throttle 400 ms (if chief within 520 px box)
        station picture squash pop (03 §4.8)
```

A grilled fish is takeable ≈ 560 ms after its timer fired.

### 7.3 Work spot 「서서 굽기」 (Labour.js 116–156)

```
OperatorSpot.Update(dt):                        // runs in UpdateLabour, AFTER player.Update, BEFORE station.Update
    if OperatorNpc != null { OperatorNpc.Update(dt); Chief = false; return false }
    if !Enabled || !Station.Enabled { Chief = false; return false }
    on = Pad.Contains(chief); Chief = on
    label.y = (y − 48) + sin(now/430 + x·0.01)·3
    waiting = !on && Station.HasWork();  NeedT = waiting ? NeedT + dt : 0
    label alpha → (on ? 0 : 1) at min(1, dt·10); label scale = waiting ? 1 + max(0, sin(now/160))·0.08 : 1
    if on:
        FeedT -= dt
        if FeedT <= 0 && chief.Stack.CountOf("item_fish_raw") > 0 && Station.InStack.Room > 0:
            if Station.FeedFrom(chief) { FeedT = 0.075; Station.InPad.Pulse() }
        if chief.vx == 0 && chief.vy == 0: chief.Operating = this          // chief plays `give` facing SE while Working (04 §6.5)
    return on
Station.FeedFrom(ch) = InStack.Room > 0 && MoveItem(ch.Stack → InStack, "item_fish_raw", 240 ms, height 60, sfx "drop")
ChiefImpact (each `give` impact frame while Working): flame burst ×2 + sfx_sizzle 0.32 at his impact point (cosmetic)
```

Label text `opSpot_grill` (서서 굽기 / Stand: grill), container at (934, 577), hidden once the cook is hired.

---

## 8. Pad hand-overs (Game.handlePlayerPads 2366–2451, slice subset)

```
HandlePlayerPads(dt):                                   // returns "the chief stands on a pad"
    p = chief; on = false; ready = padT <= 0; cap = p.Capacity
    took() => { padT = 0.075 }                           // (+ PickupPolicy.Took: tip toast, LATER)
    foreach station s (grill) where s.Enabled:
        if s.InPad.Contains(p):
            on = true
            if ready && p.Stack.CountOf(s.Input) > 0:
                if s.FeedFrom(p) { padT = 0.075; s.InPad.Pulse() } else FullToast()
        else if s.OutPad.Contains(p):
            on = true
            if ready:                                    // PickupPolicy.MayTake = true in 'auto' (forced in the tutorial)
                if s.TakeTo(p, cap) took()
                else if s.OutStack.Count > 0 && p.Room <= 0: p.WarnFull()
    if shop.Shelf.Contains(p):
        on = true
        if ready && p.Stack.HasAny(FOODS) && shop.FeedFrom(p) { padT = 0.075; shop.Shelf.Pulse() }
    if shop.Cash.Pad.Contains(p): on = true
    if shop.ChiefOnAnyRegister(): on = true              // Register.Chief from last shop.Update
    (LATER: 자재 shelf, bakery stall, sites, workshops, warehouse, food box, store, boathouse, trash, dock, civic)
    return on

Station.TakeTo(ch, cap) = OutStack.Count > 0 && ch.Stack.Count + ch.Stack.Incoming < cap
                          && MoveItem(OutStack → ch.Stack, any type, 230 ms, height 55, sfx "pickup")
Shop.FeedFrom(ch): for i from top of ch.Stack down:
                       t = item i type; if t ∈ {item_fish_cooked, item_meat_cooked} && Stock.CountWithIncoming(t) < 40:
                           return MoveItem(ch.Stack → Stock, t, 240 ms, height 60, sfx "drop")
                   return false
FullToast(): if (nowMs − lastFullMs > 2500) { lastFullMs = nowMs; toast t("stationFull") }   // not while 관망 drives
WarnFull():  if fullWarnT > 0 return; fullWarnT = 2.5; toast t("bagFull"); sfx_error 0.4    // fullWarnT -= dt in Player.Update
```

`FOODS = [item_fish_cooked, item_bread, item_meat_cooked]` (the shelf only accepts fish and meat). One cooldown `padT`
is shared by all pads; the work spot has its own `FeedT`. `MoveItem` and flights: 04 §7.3 (the item counts at the
destination when the flight lands; `Reserve` holds the room meanwhile). The chief's bag limit is `Capacity` (6), not
`Stack.Max` (99).

---

## 9. The stall, stage 1 「눈꽃 노점」

### 9.1 Build (Seller.js 1175–1250, `setStage(1, instant)` 1289–1418)

- Picture, front overlay, sign, collider: 03 §4.7 / §5.6.
- `Shelf = Pad('input', 1.6)` at (1314, 835). `MaxPerType = 40`. Stock towers: fish column 0 [−28, −2], bread 1 [0, 10],
  meat 2 [28, −2], scale 0.95, draw max 18 per tower (03 §4.4).
- `Cash = CashPad` at (1216, 900).
- Seat A register at (1415, 859), clerk post (1236, 776). Seats M, B, M2 disabled.
- Lane `food`: open; `Register = seatA`; queue config §9.3. Lanes `fish`, `meat` closed.

### 9.2 Shop.Update(dt) (Seller.js 1755–1782)

```
Stock layout (view); if !Enabled return
Cash.Update(dt)                                     // §9.7 (collect)
foreach enabled seat: seat.Update(dt)               // §9.6 sets Register.Chief
(자재 창구 update: closed at stage 1)
SpawnT -= dt
if SpawnT <= 0:
    late = Progression.IsDone("hire_hunter") ? 1.3 : null
    SpawnT = max(0.3, late ?? 2.0) * (0.8 + rnd·0.4) / spawnMul[stage-1](=1)
    if TotalQueueCount < 10 && trainVisitorsWaiting(=0) < 2: SpawnCustomer()
Food.Update(dt)                                     // §9.5
foreach c in Leaving (backwards): if c.Alive c.Update(dt, -1); if !c.Alive remove
```

`SpawnT` starts at 1.0 s. Expect the line to fill to 10 within ~15 s if nobody sells.

### 9.3 Slots (Market.slotPos 325–336, stage-1 lane config)

```
SlotPos(i): turn = 6                                  // max(2, floor(market43.lineShow = 6))
    a = min(i, turn − 1); b = max(0, i − (turn − 1))
    x = 1207 + (−100) + (−41)·a + 41·b
    y =  782 +   16   +   20·a  + 20·b
```

Slots 0..9 = the list in §3.1.

### 9.4 Customers (Seller.js 1642–1697, 400–419, 558–728)

```
MakeWant():
    foods = ["item_fish_cooked"] (+ "item_meat_cooked" once zone_hunt is done)
    lanes = served lanes, else [primary(=food)];   pick = foods sold by those lanes (fallback primary's first type)
    type = pick[rnd]; if pick.Length > 1 && rnd < 0.25: type = last of pick
    lo = 1; maxW = max(lo, min(5, 3 + floor(zonesOpen/2)))          // 3 at the start (zonesOpen = done zone_* count)
    count = lo + floor(rnd · (maxW − lo + 1))                          // 1..3
    lane = the lane selling type (stage 1: food)
    (if that lane has no stock and another served lane has: go there — never at stage 1)
SpawnCustomer(atSlot?):
    key: pool = customerKeys − LastKeys (or ≠ last, or all); key = pool[rnd]; LastKeys.Add(key); keep last min(4, max(1, n−2))
         customerKeys = villager_a, villager_b, villager_c + every loaded `villager*` look not matching ^npc_(clerk|porter|toddler)
                        and not in keysInUse (clerk/cook looks)
    if atSlot given: w = MakeWant(); (x, y) = lane.SlotPos(atSlot)
    else:            sp = SpawnPoint(); (x, y) = (sp.x + (rnd − 0.5)·30, sp.y); w = MakeWant()
    c = new Customer(key, x, y, want = w, pathFrom = sp.next or 1, home = atSlot ? null : (x, y))
    lane.Queue.Add(c)
    if atSlot: c.State = Wait; c.Path.Clear(); c.Arrived = true; face lane face point; show bubble
    else if sp.visible: fade in 450 ms
SpawnPoint(): for i = last index down to 1: walk from entry[i] toward entry[i−1] in 24 px steps; the first point NOT on
    screen (last drawn camera view grown by 80 px on each side) → (x, y, next = i, visible false) — the customer then walks
    to entry[i] (the segment end nearer the stall) and on; all points on screen → (990, 2200, next 1, visible true)
IsOnScreen(x, y, m) = view.x − m < x < view.right + m && view.y − m < y < view.bottom + m        // last drawn frame's view
IsNear(x, y, d) = |chief.x − x| < d && |chief.y − y| < d                                          // the "within N box" of sfx gates
EntryPath(from) = entry[max(1, from)..] each jittered (±20 x, ±10 y)
ExitPath(c): side = (rnd − 0.5)·70; exit points + (side + (rnd − 0.5)·20, (rnd − 0.5)·16)

Customer constructor: radius 13; Speed = 120·(0.88 + rnd·0.24); sizeK = 0.96 + rnd·0.08 (sprite scale); Need = Want.Count
Customer.Update(dt, slot):
    Arrive / Wait:
        target = Path.Count > 0 ? Path[0] : Market.SlotPos(slot)
        arrived = MoveAgent(this, target, Speed, dt, arrive: Path.Count > 0 ? 30 : 6)         // 04 §11
        if arrived:
            if Path.Count > 0: Path.RemoveAt(0)
            else: if State == Arrive → Wait; Arrived = true; vx = vy = 0; face (1247, 762); play idle;
                  if !BubbleShown && slot <= 2: show bubble
        else Arrived = false
    Happy: vx = vy = 0; HappyT -= dt
        if HappyT <= 0: State = Leave; LeaveT = 0; push up to 6 bought items (or want type) onto his own stack (carried home);
                        Path = ExitPath(); Speed *= 0.95 + rnd·0.2
    Leave: LeaveT += dt; t = Path[0]
        if t == null || LeaveT > 30 || y > 3450 − 70 || (LeaveT > 1.2 && !on screen (+90)): FadeOut()
        else if MoveAgent(this, t, Speed·1.1, dt, 30): Path.RemoveAt(0)
    Fade: vx = vy = 0
    bubble: scale eases (k = min(1, dt·12)) to 0.9 / 0.72 / 0.62 for slot 0 / 1 / ≥2 (stage 1); punch decays dt·6 (×(1 + punch·0.18));
            depth BUBBLE + 50 − max(0, slot); y bob sin(now/300 + x)·2; pulses when PayWait && slot == 0 && register not staffed
FadeOut(): State = Fade; off screen (+60) → Despawn now; else alpha → 0 over 350 ms then Despawn; hide carried stack
Despawn(): Alive = false; clear stack; hide bubble; remove from agents
```

Bubble content: want icon + `"x" + (Count − Got)`; when complete, a coin icon (`ui_icon_coin`, else check) and no text.

### 9.5 Lane.Update(dt) — serving and paying (Seller.js 956–1006, 1716–1738)

```
front = Queue[0]
if front != null && front.State == Wait && front.Arrived:
    if !front.BubbleShown: show bubble
    if front.Need > 0 && Stock.CountOf(front.Want.Type) == 0:
        foreach t in Types: if Stock.CountOf(t) > 0 { front.SetWant(t); break }        // never stall the line
    ServeT -= dt
    if ServeT <= 0 && front.Need > 0 && Stock.CountOf(front.Want.Type) > 0:
        ServeT = 0.2
        HandOver(front)
    if Queue[0] == front && front.Got >= front.Want.Count && front.Flying.Count == 0:
        WaitPayT += dt
        if !front.PayWait { front.PayWait = true; refresh bubble (coin) }
        if Register.Staffed:
            PayT -= dt
            if PayT <= 0:
                PayT = Register.Clerk != null ? 0.55 : 0.35
                Register.OnPay(front)
                shop.Complete(front, this)
        else PayT = min(PayT, 0.25)                    // first payment ≤ 0.25 s after someone steps on
    else WaitPayT = 0
else WaitPayT = 0
(empty-rack and unserved-line moves to another lane: no-ops at stage 1, LATER)
remove dead customers; foreach i: Queue[i].Update(dt, i)

HandOver(c):
    type = c.Want.Type; it = Stock.Pop(type); c.Need--; c.Flying.Add(type)
    Fly(it, it.pos → c.BubblePos (re-read every frame) , 280 ms, height 60, scaleTo 0.5,
        onDone: release; c.Flying.Remove(type); c.Got++; c.Value += PriceOf(type); c.Bought.Add(type); bubble pop;
                sfx_pickup 0.4 rate 1 + Got·0.08 throttle 40 (chief within 600))
    BubblePos = (c.x − 12 + bubbleDX(0 at stage 1), c.y + headTop − 40)
```

### 9.6 Register (Register.js 115–168)

```
Register.Update(dt):
    if Clerk != null: Clerk.Update(dt)
    if !Enabled || Clerk != null { Chief = false; return false }
    on = Pad.Contains(chief); Chief = on
    label.y = (y − 46) + sin(now/430 + 2.1)·3; label alpha → (on ? 0 : 1) at min(1, dt·10)
    if on: OnT += dt; if payTarget (lane front, arrived) && chief still && not gathering: chief faces it
    else OnT = 0
    return on
OnPay(who):
    if Clerk ready: Clerk.Serve(who)               // serve anim; ring sfx at its impact frame + coin burst ×2
    else: Pad.Pulse(); sfx_register (fallback sfx_cash) 0.55 at the pad, throttle 200
```

Label text `register` (계산대 / Register), container at (1415, 813), hidden once a clerk is hired (pad hidden too).

### 9.7 Complete and the till (Seller.js 1784–1802, 47–135)

```
Shop.Complete(c, lane):
    if c.State not in {Wait, Arrive} return
    lane.Queue.Remove(c); Leaving.Add(c)
    value = c.Value > 0 ? c.Value : PriceOf(c.Want.Type) * c.Want.Count
    hide bubble; State = Happy; HappyT = 0.9; play happy (force); heart burst ×3 at head; sfx_customer_happy 0.7
    after 200 ms: Cash.Add(value, c.x, c.y − 50); sfx_cash 0.55 throttle 250 (chief within 650 box)
    emit Sold(value, c)                     // → Progression.SetFlag("firstSale") (Game.js 296); later: firstMeatSale (LATER)

CashPad.Add(amount, fx, fy):
    Value += amount
    n = min(6, max(1, JsRound(amount / 3)))
    for i in 0..n−1, after i·55 ms:
        if Pile.Count + Pile.Incoming >= 48: coin burst ×1 at (x, y − 30); continue
        spr = take item_coin; Pile.Incoming++
        Fly(spr, (fx, fy) → Pile.NextPos(), 340 ms, height 70, scaleTo pile scale 0.85,
            onDone: Pile.Incoming--;
                    if Value <= 0 && chief not on the pad: release; coin burst ×1; return   // till emptied mid-flight
                    Pile.Push(coin); sfx_coin 0.4 rate 0.95–1.15 throttle 50 (chief within 500))

CashPad.Update(dt):
    (pile layout at (x, y + 4); spin `fx_coin_spin` visible while Value > 0 at y − 74 − Pile.Count·0.8 + sin(now/300)·5)
    if !Enabled return
    on = Pad.Contains(chief)
    if ToChief > Pile.Count: ToChief = Pile.Count
    if (Value > 0 && on) || (Pile.Count > 0 && (on || Value <= 0 || ToChief > 0)):
        if Value > 0 && on:
            v = Value; Value = 0; ToChief = Pile.Count
            economy.Add(v, chief.x, chief.y − 60, fly: true)                // §10
            FloatText(chief.x, chief.y − 100, "+" + v, #FFD84A, 34 px)
            sfx_coins_many 0.9; vibrate 15 ms; Pad.Pulse()
        CollectT -= dt
        while CollectT <= 0 && Pile.Count > 0 && (on || Value <= 0 || ToChief > 0):
            CollectT += 0.03; if ToChief > 0: ToChief--
            coin = Pile.Pop(); Fly(coin → (chief.x, chief.y − 50) re-read, 240 ms, height 60, scaleTo 0.5,
                                   onDone: release; ui.CoinFly(chief.x, chief.y − 50, 1))
Restore(v): Value = max(0, floor(v)); push min(48, ceil(v/3)) coins with no flight
```

The coins are credited the moment he touches the till; the pile pictures then stream to him.

---

## 10. Coins: Economy and the HUD counter

```
Economy.Add(n, wx?, wy?, fly = false):                 // Economy.js
    n = floor(n); if n <= 0 return
    Coins += n; Earned += n
    if fly && wx given: ui.CoinFly(wx, wy, min(10, max(3, JsRound(n / 4))))
    ui.SetCoins(Coins, fly ? 380 : 0)
Economy.Spend(n): n = min(Coins, floor(n)); if !Unlimited Coins -= n; ui.SetCoins(Coins, 0); return n
```

HUD (UI.js 58–63, 229–235, 544–548, 584–614, 1350–1361), logical 720 × H px, origin top-left (01 D4):

| Item | Value |
|---|---|
| `top` | 62 + safeTop |
| Coin bar | 9-slice `ui_coin_bar`, origin (0, 0.5), at (26, top), size (max(170, textWidth + 128), 74) |
| Coin icon | `ui_icon_coin` scaled to 64 px wide, origin centre, at (64, top); base scale remembered for the pop |
| Coin text | at (104, top + 2), origin (0, 0.5), 40 px, weight 900, white, stroke #2B2F3A 7 px, font Pretendard → Apple SD Gothic Neo → Noto Sans KR |
| Number format | `fmt(n)` = floor, thousands separated by "," (`12,345`) |

```
SetCoins(v, delayMs): target = v; if delayMs > 0: coinDelay = max(coinDelay, delayMs/1000); if v < display: display = v   // spends snap down
UI.Tick(dt):
    if coinDelay > 0: coinDelay -= dt
    else if display != target:
        diff = target − display; step = max(1, ceil(|diff| · min(1, dt·10))); display += sign(diff) · min(|diff|, step)
    text = fmt(display); if changed: set text; resize bar; re-place the population chip (04/other)
CoinFly(wx, wy, n):                                   // world point → coin icon
    s = WorldToScreen(wx, wy)
    for i in 0..n−1: coin (pooled `ui_icon_coin`, 40 px wide, depth 40) starts at s + ((rnd−0.5)·40, (rnd−0.5)·30)
        control point m = start + ((rnd−0.5)·160, −60 − rnd·80); end = coin icon position
        tween 0→1 over 520 + i·40 ms, delay i·45 ms, ease Sine.easeIn, quadratic Bézier start→m→end
        onComplete: hide/pool; PopCoin(); sfx_coin 0.35 rate 1–1.3 throttle 45
PopCoin(): kill tweens on the icon; scale = base·1.25; tween to base over 200 ms Back.easeOut
WorldToScreen(wx, wy) (UI.js 578–582): z = cam.zoom; vx = scrollX + camW·0.5·(1 − 1/z); vy = scrollY + camH·0.5·(1 − 1/z)
    → ((wx − vx)·z / k, (wy − vy)·z / k)                // k = render scale (01); in Unity use Camera.WorldToScreenPoint → logical px
```

---

## 11. Steps, flags and paid pads (Progression.js, UnlockPad.js)

### 11.1 The fish-line rows of `STEPS` (Progression.js 67–80) — the "first goal rows"

| id | type | after | flag | side | cost | pad spot | banner on completion (ko / en) |
|---|---|---|---|---|---|---|---|
| `hire_clerk_market` | clerk (seller market) | — | `firstSale` | no | 12 | (1525, 900) | 점원 합류! + 이제 점원이 손님 돈을 받아요 / Clerk joined! + The clerk takes payments now |
| `op_grill` | operator (grill) | hire_clerk_market | — | no | 30 | (925, 745), label below [0, 64] | 요리사 쿡 합류! + 이제 쿡이 생선을 구워요 / Chef Cook joined! + Cook grills the fish now |
| `hire_fisherman` | hire (fisherman) | op_grill | — | no | 45 | (925, 745) | 어부 합류! / Fisher joined! |
| `raw_grill` | raw porter (LATER) | hire_fisherman | — | yes | 70 | (925, 745) | 생선 짐꾼 합류! + rawSub |
| `porter_grill` | goods porter (LATER) | raw_grill | — | yes | 100 | (925, 745) | 판매 짐꾼 … |
| `zone_forest` | zone (LATER) | hire_fisherman | — | no | 90 | (760, 1130) | 소나무 숲 열림! |

`COMPLETE_AFTER = hire_hunter`, `BENCH_AFTER = hire_lumberjack` (LATER). The goal window (목표 창) is hidden until
`hire_fisherman` (LATER).

### 11.2 Rules

```
Met(cond): null → true; "f:x" → Flags[x]; "b:x" → building done (LATER); "r:x" → land open (LATER); else Done[cond]
VisibleSteps() = STEPS where !Done[id] && Met(after) && (flag == null || Flags[flag]) && (also == null || Met(also))
SetFlag(f): if Flags[f] return; Flags[f] = true; after 700 ms: SyncPads(); emit Flag(f)
Init() (after the world is built, before Restore):
    new game: Flags["shop43"] = Flags["bakery43"] = true (old-save fix-ups: LATER)
    foreach STEPS s in order where Done[s]: ApplyStep(s, instant: true)
    SyncPads()
Update(dt): every 1 s: if waiting SyncPads() (+ bench aside, LATER); on = any pad.Update(dt); return on
AffordablePad(coins) = cheapest active, !done pad with 0 < Remaining <= coins
NextPad() = first non-side STEPS row that has a pad now
```

### 11.3 SyncPads (Progression.js 457–524; slice subset)

```
steps = VisibleSteps() sorted part-paid first
foreach s: if Pads has s.id continue
    cfg = spot of s (WORLD.pads / pads35); if none continue
    (LATER: line-offer yield; "one paid pad per spot" check — the first three never share a spot at the same time)
    cost = CostOf(s)
    price = SanePrice(cost); if Paid[s] > price: give back Paid[s] − price coins; Paid[s] = price
    icon: hire → portrait_<worker look>; operator → portrait_npc_chef; clerk → portrait_npc_clerk_a (fallback ui_icon_clerk / ui_icon_worker)
    kind = "hire"; padTex: clerk/operator → ui_pad_clerk (fallback ui_pad_hire); else default ui_pad_hire
    pad = new UnlockPad(id, cfg, kind, cost, paid: Paid[s] ?? 0, label key = s.id, icon, iconSize 54, labelAt = cfg.labelAt,
                        onComplete: p => CompleteStep(s, p))
    if pad.Pad.Contains(chief): pad.NeedsLeave = true
    PopIn(pad): pad picture and label scale 0.01 → full over 380 ms Back.easeOut; fx_sparkle sheet at (x, y − 10) size 120
SanePrice(v) = floor(v) if finite and ≥ 1, else 1
```

### 11.4 UnlockPad.Update(dt) (UnlockPad.js 176–278)

```
if !Active || Done return false
(items: none for these three pads)
onPad = Pad.Contains(chief) && labelAt.x == 0 && label above the pad        // a label set below (op_grill [0, 64]) stays put
lift += ((onPad ? 1 : 0) − lift) · min(1, dt·8); label.y = labelBaseY − lift·74 + sin(now/420 + x·0.01)·4
label x clamped into the camera view (±(labelW/2 + 8)) while the pad is near the view (cosmetic)
afford = !Maxed && Remaining > 0 && coins >= Remaining
    afford: sparkle loop `fx_sparkle` at (x, y − 30) size 150; pad scale × (1 + sin(now/180)·0.035)
on = Pad.Contains(chief)                                   // (관망 block: LATER)
label alpha → (on && !(NeedsLeave && afford)) ? 0.3 : 1 at min(1, dt·10)
if !on || Maxed: StandT = 0; Warned = false; if !on NeedsLeave = false; hide ring; return on
if NeedsLeave return true
StandT += dt; if StandT < 0.5 return true                  // padDelay
if Remaining <= 0: Complete(); return true
draw ring (§11.5)
if coins > 0:
    rate = max(12, Cost / 1.6); Acc += rate·dt; amt = floor(Acc)
    if amt >= 1:
        Acc −= amt; amt = min(amt, Remaining, coins); economy.Spend(amt); Paid += amt; refresh price text; redraw ring
        CoinT −= dt; if CoinT <= 0 { CoinT = 0.06; coin flies chief (x, y − 60) → pad, 220 ms, height 40, scale 0.7 → 0.35 }
        TickT −= dt; if TickT <= 0 { TickT = 0.07; sfx_pad_fill 0.5 rate 0.85 + 0.7·Paid/Cost throttle 60 }
    if Remaining <= 0: Complete()
else if Remaining > 0 && StandT > 0.55 && !Warned: Warned = true; toast t("notEnoughCoins"); sfx_error 0.5
return true

Complete(): Done = true; hide sparkle/ring; fx_unlock sheet at (x, y − 20) size 260; star burst 18; sfx_hire (kind hire) 1.0;
            camera shake 160 ms 0.005; vibrate 40 ms; OnComplete(this)
```

Times: clerk (12) drains in 1.0 s, cook (30) and fisher (45) in 1.6 s, after the 0.5 s delay.

### 11.5 Pad visuals that carry information (03 §5.7 has positions/depths)

Price on the floor: coin icon + `fmt(Remaining)` (30 px, weight 900, white, stroke #2B2F3A 6), the pair centred on the
pad (`tw = textWidth + 42`; coin at x − tw/2 + 15, text at x − tw/2 + 38). Label: icon + `t(id)` on a panel
(width max(120, textW + iconW + 34), height 60). Ring: background `ui_ring_bg` 64 px at (x, y − 118); arc radius 23,
width 9, colour 0x5CC86A, from −90° clockwise by `360°·Paid/Cost`.

### 11.6 CompleteStep and ApplyStep (Progression.js 526–611)

```
CompleteStep(s, pad):
    Done[s] = true; Paid.Remove(s); Pads.Remove(s); pad.Vanish()          // alpha → 0 over 300 ms, then destroy
    ApplyStep(s, instant: false, pad.x, pad.y)
    banner (always shown, also during Act 1: opts.step):
        clerk:    t("hired", name = t("w_clerk")), sub t("clerkSub")
        operator: t("hired", name = t("opName_grill")), sub t("opSub_grill")
        hire:     t("hired", name = t("w_fisherman"))
    emit Step(s.id)
    after 600 ms: SyncPads()                                               // next pad pops up
    save(force)
ApplyStep(s, instant, x?, y?):
    clerk    → shop.SeatA.HireClerk(instant, x, y)
    operator → grill.Op.Hire(instant, x, y); if !instant: focusCamera(1004, 550, 1600 ms); after 900 ms emote thumbs/heart over him
    hire     → (LATER) Worker fisherman seated on the deck; deck tier = number of fishermen (01: art); fish crate pile shows
```

Clerk (Register.js 145–286) — SLICE-should:

```
HireClerk(instant, x, y): look = "npc_clerk_a" (fallback "villager_c"); keysInUse.Add(look)
    start = instant ? Staff : (x, y); state = Go; if instant: Arrive()
    else: fx_poof at (x, y − 30) size 170; scale 0.1 → 1 over 420 ms Back.easeOut
    hide the register pad and label
Clerk.Update(dt):
    Go: d = gdist(pos, Staff); if d > 120: MoveAgent(this, Staff, 150, dt, 10)
        else: step = min(L, 150·0.8·dt) straight (no collision), face, walk anim; if L − step < 2: Arrive(); play wave; serveT = 1.2
    Post: idle; after serve anim: face front; every 5–12 s: wave (35 %) or bow (20 %)
Ready = State == Post; Arrive(): pos = Staff (1236, 776); face the front customer (or front offset (−60, 30)); draw 7 px higher (step), depth shop.y + 0.5
```

Cook (Labour.js 158–310) — SLICE-should: look `npc_chef` (fallback villager_b / villager_a); same walk-in rule (150 px/s,
straight for the last 110 px), post (1061, 562) dir SW; `Ready` when at the post. While the grill works it loops
`operate` with timeScale `clamp(loop/0.8, 0.5, 2)` (loop = frames/fps); idle: emote `emote_fish` every 7–13 s, waves at
the chief passing within 150 px (cooldown 18–28 s). The work spot pad and label hide.

---

## 12. Tutorial arrow and objective panel (Tutorial.js) — SLICE

### 12.1 Evaluation (every 0.2 s: `evalT -= dt; if evalT <= 0 { Evaluate(); evalT = 0.2 }`)

```
Evaluate():                                                    // inTutorial = !Done["hire_fisherman"]
    target = null; textKey = null
    pad = AffordablePad(coins)
    if pad != null && !pad.Pad.Contains(chief):
        key = pad.id == "op_grill" ? "obj_cook" : pad.id == "hire_clerk_market" ? "obj_clerk" : pad.id == "hire_fisherman" ? "obj_fisher" : "obj_unlock"
        h = UnderOpSpot(pad) ? (pad.labelAt.y > 0 ? 44 : 98) : 112
        Set(pad.x, pad.y, h, key); return
    if StepOffHint(pad) return
    if pad != null return                                      // standing on an affordable pad: no arrow, no text
    if inTutorial { FirstLoop(); return }
    (after the tutorial: register/cash/upgrade/zone/labour/... hints and "next goal" text — LATER)
UnderOpSpot(pad) = a work spot with no operator and its label visible has |o.x − pad.x| < 60 and 60 < pad.y − o.y < 170
    // op_grill pad (925,745) vs spot (934,625): true → h 44 (label below)
StepOffHint(pad): on = (pad?.NeedsLeave && pad on chief) ? pad
                       : first active, !done pad with NeedsLeave && 0 < Remaining <= coins && on chief
    if on: target = (on.x, on.y + 118), h 34, key "obj_step_off"; return true
```

### 12.2 FirstLoop (Tutorial.js 580–622)

```
grill, m = shop (lane food), raw = bag count of item_fish_raw, cooked = bag count of item_fish_cooked, next = NextPad()
front = m.Queue[0]
paysSoon = front && front.Arrived && front.Got > 0 && front.Need > 0 && m.Stock.Count >= front.Need
if m.SeatA.Clerk == null && cooked == 0 && (m.WaitingPay || paysSoon):
    if !register pad on chief: Set(1415, 859, 46, "obj_register") else textKey = "obj_register_wait"
    return
if m.Cash.Value > 0 && cooked == 0 && (coins + m.Cash.Value >= (next?.Remaining ?? 0) || (raw == 0 && grill.OutStack.Count == 0)):
    if !till on chief: Set(1216, 900, 40, "obj_cash")
    return
if cooked > 0: Set(1314, 835, 60, "obj_sell"); return
op = grill.Op; cook = op == null || op.OperatorNpc != null
if raw > 0 && (chief.Room <= 0 || !deck.Ready() || raw >= min(4, capacity)):
    if cook: Set(907, 541, 50, "obj_grill")
    else if op pad on chief: textKey = "obj_operating_grill"
    else Set(934, 625, 50, "obj_op_grill")
    return
if !cook && grill.InStack.Count > 0 && raw == 0:
    if op pad on chief { textKey = "obj_operating_grill"; return }
    if grill.OutStack.Count < 6 || chief.Room <= 0 { Set(934, 625, 50, "obj_op_grill"); return }
if (grill.OutStack.Count > 0 || grill.InStack.Count > 0) && raw == 0: Set(1101, 639, 80, "obj_take"); return
if gdist(chief, Gather) < 55: textKey = "obj_fish"; return     // fishing: text only, no arrow over him
Set(1089, 376, 6, "obj_fish")                                 // (gather.x, gather.y − 10), low arrow
WaitingPay (shop) = some open lane's front: State Wait && Arrived && Got >= Want.Count
```

### 12.3 Shown objective (debounce, Tutorial.js 1009–1027) and drawing (966–1000)

```
Shown(dt): id = textKey's first two ':' parts (or "#" + text, or "-")
    S.age += dt
    first call: take it
    same id: follow live (target point, text)
    else: if id != cand { cand = id; candT = 0 }; candT += dt
          need = (id == S.prev && S.age < 4) ? 1.5 : 0.6
          if candT >= need && S.age >= 1.5: prev = S.id; S.id = id; age = 0; take it
Update(dt): t += dt; evaluate (12.1)
    bounce = |sin(t·4.2)|·16
    if onboarding owns (Act 1, §13): arrow scale = base·1.3; target = onboarding.Target;
        none → hide arrow, objective(null); else arrow at (tg.x, tg.y − tg.h − bounce·1.2); objective(null, tg, null) (panel hidden)
        return
    restore base scale; sh = Shown(dt)
    no target → hide arrow; objective(sh.key, null, sh.text)
    else arrow at (tg.x, tg.y − tg.h − bounce); objective(sh.key, tg, sh.text)
```

- Arrow: `ui_arrow` scaled to 58 px wide, world depth ARROW (45000) — Unity layer per 03.
- Objective panel (UI.js 95–98, 792–806): container at (W/2, top + 88), 9-slice `ui_panel` 400 × 62 → width
  `textW·k + 60`, text 26 px weight 800, colour #2B2F3A. On a new key: text = `text ?? t(key)`, shown with scale
  0.8 → 1 over 220 ms Back.easeOut. `k = max(0.6, min(1, (room − 60) / textW))` shrinks a long text.
- Edge arrow (UI.js 1370–1385): while the tutorial has a live target (or Act 1 owns the arrow and has one) and the
  target's screen point `(tg.x, tg.y − h/2)` is outside x ∈ [−10, W + 10] or y ∈ [120, H + 10]: `ui_arrow` 50 px wide at
  (clamp(x, 64, W − 64), clamp(y, 190, H − 64)), pulled back along the angle by `sin(now/160)·6`, rotation = angle − 90°.

---

## 13. First-run coach cards, Act 1 (Onboarding.js) — SLICE-should

### 13.1 When it runs

New village (no save, not a quarantine restart) → `bits = NEW (1)`, mode `act1`. A save carries `onb` bits only if it
began with the tutorial; an old save never runs it. `ONB = { NEW 1, ACT1 2, ACT2 4, SKIP 8, T1 16 … T6 512 }`. Start
rule on load: ACT1 bit missing → if `hire_clerk_market` done → set ACT1, start Act 2; else Act 1 (resumed: `moved` and
`hiDone` true, 1.5 s settle). ACT1 set and ACT2 missing → Act 2 (LATER: treat as off). Act 1 never pauses the game and
never blocks input. While Act 1 runs: banners without `step` are held (max 6) and replayed 4 s apart afterwards; the
toasts `bagFull` and `customersWaiting` are dropped.

### 13.2 Steps

| step | place | arrow h | card keys (l1/l2) | kind | view | ✓ beat when left forward (lap 1) |
|---|---|---|---|---|---|---|
| hi | — | — | onb_hi_1/2 | — | — | — |
| move | reel | 4 | onb_move_1/2 (after moving: onb_moved_1 for 3 s, then onb_net_1; l2 onb_moved_2; desktop l2 pcHint) | walk | — | — |
| still | reel | 4 (stand: no arrow) | onb_still_1 / onb_still_2 {n}/{k} | stand | — | onb_fishok |
| toop | work spot | 50 | onb_toop_1/2 | walk | — | — |
| cook | work spot | — | onb_cook_1/2 | stand | — | onb_nice |
| cookaway | work spot | 50 | onb_cookaway_1/2 | walk | — | — |
| take | output pad | 80 | onb_take_1/2 | walk | — | onb_nice |
| shelf | shelf | 60 | onb_shelf_1/2 | walk | — | onb_nice |
| coming | — | — | onb_coming (one line, top slot) | — | — | — |
| reg | register | 46 | onb_reg_1/2 | walk | register | — |
| regwait | register | — | onb_regwait_1/2 | stand | register | onb_nice |
| cash | till | 40 | onb_cash_1/2 | walk | register | onb_cashok |
| short | — | — | onb_short_1/2 | — | register | — |
| pad | clerk pad | 112 | onb_pad_1 / onb_pad_2 {n = Remaining} | walk | pad | — |
| onpad | clerk pad | — | onb_onpad_1/2 | stand | pad | — |
| stepoff | clerk pad | (x, y + 118) h 34 | onb_stepoff_1/2 | — | pad | — |
| helpers | — | — | onb_helpers_1/2 | — | — | — |

`ORDER = hi, move, still, toop, cook, cookaway, take, shelf, coming, reg, regwait, cash, short, pad, onpad, stepoff, helpers`.
Places: reel (1089, 386), work spot (934, 625), output (1101, 639), shelf (1314, 835), register (1415, 859), till
(1216, 900), clerk pad (1525, 900) while active and not done. Arrow target = (place.x, place.y − 10) for move/still,
else the place; none for "stand" steps and for `move` while he already fishes at his spot.

### 13.3 Derive (Onboarding.js 270–315) — the step the world asks for

```
k = min(4, capacity); raw, cooked = bag counts; m = shop; g = Gather; op = grill.Op
if Done["hire_clerk_market"] return helpers
hp = pad hire_clerk_market
if hp active && !done && hp.Remaining > 0:
    on = hp on chief
    if on && hp.NeedsLeave && hp.Remaining <= coins return stepoff
    if on && !hp.NeedsLeave && coins > 0 return onpad
    if hp.Remaining <= coins return pad
front = m.Queue[0]; paysSoon = front && Arrived && Got > 0 && Need > 0 && Stock.Count >= Need
onReg = register pad on chief
enough = hp active && !done && Cash.Value > 0 && coins + Cash.Value >= hp.Remaining
if no clerk && cooked == 0 && !enough && (m.WaitingPay || paysSoon) return onReg ? regwait : reg
if no clerk && cooked == 0 && !enough && onReg && cur ∈ {reg, regwait} && front &&
   (front.Flying.Count > 0 || (front.Need > 0 && Stock.Count >= front.Need) || (front.Got > 0 && front.Need <= 0)) return regwait
next = NextPad()
if Cash.Value > 0 && cooked == 0 && (coins + Cash.Value >= (next?.Remaining ?? 0) || (raw == 0 && grill.OutStack.Count == 0)) return cash
if cooked > 0 return (output pad on chief && grill.OutStack.Count > 0 && Room > 0) ? take : shelf
if op != null && op.OperatorNpc == null:
    onOp = op pad on chief; far = gdist(chief, g) > 120
    if raw > 0 && (Room <= 0 || !deck.Ready() || raw >= k || far) return onOp ? cook : toop
    if grill.InStack.Count > 0 && raw == 0:
        if onOp return cook
        if grill.OutStack.Count < 6 || Room <= 0 return cur ∈ {cook, cookaway} ? cookaway : toop
if (grill.OutStack.Count > 0 || grill.InStack.Count > 0) && raw == 0 return take
if cooked == 0 && raw == 0 && front && no clerk && (cur == shelf || cur == null || (cur == coming && sameT < 8))
   && (front.Flying.Count > 0 || (Stock.Count > 0 && front.Need > 0 && Stock.Count >= front.Need) || (!front.Arrived && Stock.Count > 0)) return coming
if !moved return move
if raw > 0 || gdist(chief, g) < 55 return still
return move
```

### 13.4 Act 1 frame (Onboarding.js 317–475)

```
UpdateAct1(dt):
    a1T += dt; shownT += dt; sameT += dt
    if a1T > 360 { EndAct1(); return }                             // act1Max
    if !moved && Input.vec.mag > 0.05: moveT += dt; if moveT >= 0.2 { moved = true; movedAt = t; stepAt = now }
    if a1T < settle return                                         // 0 for a new game, 1.5 s for a resume
    welcome: if !hiDone:
        if a1T < 0.6 return
        first time: card hi; cur = hi; shownT = 0
        if shownT >= 2 || (shownT > 0.2 && touched since the card) || moved: hiDone = true; ring/spot off
        else { ring at the chief (w 110); return }
    if helpersT >= 0 { UpdateHelpers(dt); return }
    beat timer: beat.t −= dt; beat ends at 0
    evalT −= dt; if evalT <= 0:
        evalT = 0.2; want = Derive()
        if want == helpers: helpersT = 0; cur = helpers; clear card/target/ring; return
        if cur == cash && IDX[want] <= IDX[coming] && shownT >= 1.5 && hp && hp.Remaining > coins + Cash.Value: want = short; shortT = 2.5
        if cur == short: shortT −= 0.2; if shortT > 0: want = short
        back = cur != null && IDX[want] < IDX[cur] && cur ∉ {short, hi}
        backT = back ? (backWant == want ? backT + 0.2 : 0) : 0; backWant = back ? want : null
        dwell = cur == coming ? 2.8 : 1.5
        if want != cur && (shownT >= dwell || cur == hi || cur == null) && (!back || backT >= 1.2): Enter(want)
    Act1Frame(dt)
Enter(step):
    back = IDX[step] < IDX[prev]
    if back && prev ∈ {cash, short} && IDX[step] <= IDX[take]: lap++
    if STEP[prev].beat && !back && step != short && lap == 1 && !(prev == regwait && step == reg):
        beat = (t(STEP[prev].beat), 0.7 s); emote thumbs (or heart) over the chief 1.0 s; sfx_pickup 0.4 rate 1.25
    cur = step; shownT = sameT = 0; collapsed = false; stepAt = now
Act1Frame: view = STEP.view (camera, 01 §3.3); ring at place (w 110 for the reel, else 150); arrow target (13.2)
    card l1 = t(l + "_1"), l2 = t(l + "_2") (one-line steps: l1 only); still: l2 = onb_still_2 with n = min(raw, k), k
    pad: l2 = onb_pad_2 with n = hp.Remaining; lap > 1 and IDX ≤ short: no l2
    stuck pushing (stick held, speed < 25 px/s for 1.2 s) on a walk step: l2 = onb_around for 6 s
    collapse: sameT > 45 && idle < 1 → one line in the top slot; 5 s idle restores
    beat active → card = ✓ + beat text (one line)
UpdateHelpers: wait while a banner is up (≤ 8 s) and at least 0.6 s; then focusCamera(1415, 819, 2200 ms);
    card onb_helpers; sfx; end after 3.5 s, or after 1.5 s on a touch → EndAct1
EndAct1: bits |= ACT1; clear; release held banners; Act 2 (LATER: mode off, Tutorial takes over)
Skip (「건너뛰기 ›」 chip at (W/2, H − 70 − safeBottom), 150 × 52 drawn, 200 × 84 hit area): bits |= SKIP|ACT1|ACT2; mode off;
    release banners; toast onb_skipped
```

`idle` = seconds since max(Input.lastActivity, Input.lastTouch, stepAt). Pulse ring (`ui_tap_ripple`, fallback
`ui_ring_fill`, tint 0xFFE27A, depth PAD + 50, α 0.85): width `w·(1.025 + sin(t·2π/0.9)·0.125)`, height half.

### 13.5 Coach card (OnboardOverlay.js 305–392)

Panel `ui_panel`; line 1: 30 px weight 900 #2B2F3A (26 px when collapsed); line 2: 24 px weight 800 #4C5A6E; width
`min(520, max(300, textW + 56))` (top slot: `min(W − 48, max(200, …))`), height `max(76, 26 + h1 + 8 + h2)`; text wider
than the room shrinks to 0.85 then wraps. ✓ icon `ui_icon_check` 40 px left of line 1 for beats. Slot: bottom
(y = H − 280 − safeBottom) unless the card would cover the target (+40 px) or, on stand steps, the chief → top
(y = top + 96); the slot flips after 0.5 s of overlap. Fade 0.15 s; new card pops 0.86 → 1 in 200 ms. Skip chip 150 × 52
(`ui_button_gray` α 0.9, text `onb_skip` 22 px white, stroke #4A5361 5) at (W/2, H − 70 − safeBottom), shown Acts 1–2.

### 13.6 `FishCap()` (Onboarding.js 392)

`mode == act1 && lap == 1 ? min(4, capacity) : ∞`. The chief takes no more fish (and reels in) once his bag holds or
is receiving that many raw fish. With Act 1 off it is ∞ (he fills his bag to 6).

### 13.7 Camera

Act 1 publishes `View` = (1215, 760) for register/regwait/cash/short and (1320, 800) for pad/onpad/stepoff, else
null; the camera framing (01 §3.3) uses it in place of (985, 600).

### 13.8 LATER

Finger demo (drag / lift / step-off, ghost joystick, `via()` A* hint), spotlight, card wiggle, Act 2 (finger assists after
5 s idle, max 3 per objective, cards for the cook/fisher pads and 「생선을 화덕 발판에 놓아요」, closing card
「이제 마을을 키워 봐요!」), Act 3 HUD tips (whistle, 길 안내, zoom, map, settings, 관망), replay and tour.

---

## 14. Toasts, banners and strings

Toast (UI.js 112–115, 617–647): box at (W/2, H − 230 − safeBottom) (above a bottom-slot coach card), dark panel
0x2B2F3A α 0.88, text 28 px weight 800 white; width max(260, textW + 70), height max(64, textH + 26); too wide → scale
to fit (≥ 0.85) then wrap; appears scale 0.7 → 1 (200 ms Back), holds 1500 ms, fades 350 ms; a new toast replaces
the old one. Banner (UI.js 118–123, 653–704): box at (W/2, 0.27·H), `ui_button_blue` panel (width max(360, textW + 90),
height 104), title 50 px white stroke #1F4F8F 10, sub 26 px on a rounded strip 0x1F3354 α 0.62 at y + 80; scale 0.3 → 1
(420 ms Back); holds 1700 ms (3200 with a sub), fades 400 ms while rising to 0.25·H. Banners queue (max 6, gap 400 ms,
dropped after 8 s in the queue).

Strings (strings.js; `t(key, params)` replaces `{name}`; missing en → ko; missing key → the key). Copy `t()`, `josa()`
and `fmt()` exactly (strings.js 1248–1281, 1431); none of the slice strings below need the particle rules.

| key | ko | en |
|---|---|---|
| bagFull | 가방이 가득 찼어요! | Your bag is full! |
| stationFull | 가득 찼어요! | It's full! |
| notEnoughCoins | 코인이 부족해요 | Not enough coins |
| customersWaiting | 손님이 계산을 기다려요! | Customers are waiting to pay! |
| max (MAX float text) | MAX | MAX |
| obj_fish | 물가의 촌장님 자리에 서서 물고기를 낚으세요 | Stand on the chief's spot to fish |
| obj_op_grill | 화덕 앞에 서서 생선을 구우세요 | Stand at the grill to cook the fish |
| obj_operating_grill | 굽는 중… 다 구울 때까지 서 있어요 | Grilling… stay until it is all done |
| obj_grill | 생선을 화덕 발판에 내려놓으세요 | Drop the fish on the grill pad |
| obj_take | 구운 생선을 가져가세요 | Pick up the grilled fish |
| obj_sell | 구운 생선을 판매대에 놓으세요 | Put the grilled fish on the counter |
| obj_register | 계산대에 서서 손님에게 돈을 받으세요 | Stand at the register to take payment |
| obj_register_wait | 계산하는 중… 손님이 모두 낼 때까지 서 있어요 | Taking payment… stay until everyone has paid |
| obj_cash | 손님이 낸 코인을 주우세요 | Collect the coins |
| obj_clerk | 점원을 고용하면 계산을 대신 해 줘요 | Hire a clerk to take payments for you |
| obj_cook | 요리사를 고용해 봐요 | Hire a cook |
| obj_fisher | 어부를 고용해 봐요 | Hire a fisher |
| obj_unlock | 코인을 들고 발판 위에 서 보세요 | Stand on the pad with your coins |
| obj_step_off | 새 발판! 한 걸음 나왔다가 다시 올라서세요 | New pad! Step off, then back on |
| hire_clerk_market / op_grill / hire_fisherman (pad labels) | 점원 고용 / 요리사 고용 / 어부 고용 | Hire Clerk / Hire a cook / Hire Fisher |
| hired | {name} 합류! | {name} joined! |
| w_clerk / opName_grill / w_fisherman | 점원 / 요리사 쿡 / 어부 | Clerk / Chef Cook / Fisher |
| clerkSub / opSub_grill | 이제 점원이 손님 돈을 받아요 / 이제 쿡이 생선을 구워요 | The clerk takes payments now / Cook grills the fish now |
| register / opSpot_grill / deck_reel | 계산대 / 서서 굽기 / 촌장님 자리 | Register / Stand: grill / Chief's spot |
| sign_market_1 | 눈꽃 노점 | Snowbloom Stall |
| item_fish_raw / item_fish_cooked | 생선 / 구운 생선 | fish / grilled fish |
| onb_hi_1 / _2 | 어서 오세요, 촌장님! / 눈꽃마을의 첫날이에요 | Welcome, Chief! / It's your first day here |
| onb_move_1 / _2 | 손가락으로 화면을 끌어 봐요 / 끄는 쪽으로 촌장님이 걸어요 | Drag on the screen / The chief walks that way |
| onb_moved_1 / onb_net_1 / onb_moved_2 | 잘했어요! 물가의 촌장님 자리로 가요 / 물가의 촌장님 자리로 가요 / 멈추면 물고기를 낚아요 | Nice! Walk to your spot by the water / Walk to your spot by the water / Stop there to catch fish |
| pcHint | WASD · 방향키 · 마우스 드래그로 이동 | Move with WASD · arrow keys · mouse drag |
| onb_still_1 / _2 | 손을 떼고 가만히 있어요 / 물고기가 가방에 쏙쏙! {n}/{k} | Let go and stand still / Fish hop into your bag! {n}/{k} |
| onb_fishok / onb_nice / onb_cashok | 물고기를 모았어요! / 잘했어요! / 코인이 모였어요! | Got the fish! / Nice! / Coins collected! |
| onb_toop_1 / _2 | ‘서서 굽기’ 발판으로 가요 / 화덕 앞 초록 발판이에요 | Go to the 'Stand: grill' pad / The green pad by the grill |
| onb_cook_1 / _2 | 서 있으면 생선이 구워져요 / 다 구울 때까지 기다려요 | Stand here to grill the fish / Wait until they're all done |
| onb_cookaway_1 / _2 | 아직 굽는 중이에요 / 발판으로 돌아와 줘요 | Still grilling! / Come back to the pad |
| onb_take_1 / _2 | 다 구웠어요! 가지러 가요 / 화덕 오른쪽 발판에 서요 | All done! Go grab them / Stand on the pad to the right |
| onb_shelf_1 / _2 | 판매대 발판에 놓아요 / 손님들이 사 갈 거예요 | Put them on the counter pad / Customers will buy them |
| onb_coming | 손님이 오고 있어요 | A customer is on the way |
| onb_reg_1 / _2 | 계산대에 서 주세요 / 손님이 여기서 돈을 내요 | Stand at the register / Customers pay you here |
| onb_regwait_1 / _2 | 모두 낼 때까지 서 있어요 / 코인은 옆에 쌓여요 | Stay until everyone pays / Coins pile up next to you |
| onb_cash_1 / _2 | 코인을 주우러 가요 / 손님이 낸 코인이에요 | Go pick up the coins / Your customers paid these |
| onb_short_1 / _2 | 코인이 조금 모자라요 / 생선을 한 번 더 팔아요 | Not quite enough coins / Sell some more fish |
| onb_pad_1 / _2 | ‘점원 고용’ 발판으로 가요 / 코인 {n}개가 있으면 돼요 | Go to the 'Hire Clerk' pad / You need {n} coins |
| onb_onpad_1 / _2 | 가만히 서 있어요 / 코인이 발판으로 들어가요 | Stand still / Your coins go into the pad |
| onb_stepoff_1 / _2 | 한 걸음 나왔다가 / 다시 올라서 주세요 | Step off once / then step back on |
| onb_helpers_1 / _2 | 일꾼이 일을 대신 해 줘요 / 코인을 모아 더 고용해요 | Helpers work for you / Save coins to hire more |
| onb_around | 막히면 옆으로 돌아가요 | Stuck? Walk around it |
| onb_skip / onb_skipped | 건너뛰기 › / 설정 › 놀이에서 다시 볼 수 있어요 | Skip › / Replay it any time in Settings › Play |

Language: `detectLang()` → ko when the device language starts with "ko", else en (the settings panel can override:
other spec).

Sounds the loop triggers (all optional for the go/no-go, names from the audio manifests): sfx_pickup, sfx_drop,
sfx_sizzle, sfx_reel, sfx_splash, sfx_coin, sfx_coins_many, sfx_cash, sfx_register, sfx_customer_happy, sfx_pad_fill,
sfx_hire, sfx_error.

---

## 15. Save / load (fields owned here; the save module is another spec)

| Field | New-game value | Written (Game.serialize 2466–2635) | Read (Game.build / restore 2645–2689) |
|---|---|---|---|
| `coins` | (absent → 0) | `economy.Coins` | `economy = Economy(sv.coins ?? 0)` |
| `progress` | — | `{ done, paid, up{capacity,speed}, celebrated, hints, seen, flags, got, celebrated3 }`; `paid` = current partial payments of standing pads | `Progression(sv.progress)`: levels clamped to the table length; then `Init()` replays done steps instantly (clerk at her post, cook at his post, fisher seated) |
| `stations.grill` | — | `{ i: InStack.Count + Incoming, o: OutStack.Count + Incoming }` (+ raw carried by porters, LATER) | push min(i, 30) raw and min(o, 36) cooked fish with no flight |
| `market` | — | `{ stock: { item_fish_cooked, item_bread, item_meat_cooked }, cash }`; stock = CountWithIncoming + what waiting customers got but did not pay for (the queue itself is not saved) − over-max | stock: fish/meat up to 40 each (bread → bakery, LATER); till `Value` = market.cash + trade.cash |
| `trade` | — | `{ stock: { item_plank, item_ingot }, cash: 0 }` | LATER (자재 창구) |
| `player` | spawn (1130, 412) | `{ x, y (JsRound), stack: bag types + types in flight }` | position rule in 04 §6.6; push the first `capacity` stack types |
| `labour.piles.fish` | — | crate count (LATER) | LATER |
| `onb` | 1 (NEW) | bits, only if > 0 | §13.1 |

Always on load (new or saved): `shop.RestoreQueue(3)` → three customers standing in slots 0..2 with fresh wants. The deck
pool, the line, the tutorial's debounce and the Act 1 lap/step are not saved (Act 1 resumes by `Derive`).

Old v4.x saves past the tutorial: all three fish-line steps are done, so no fish-line pad shows; the clerk and the cook
(SLICE-should) stand at their posts at once. If the slice skips the fisher (LATER), fish come only from the chief. If the
save's shop is stage 2–3 (`zone_forest` / `mkt_s3` done), the layout spec draws that stage; the slice may run this
spec's stage-1 rules on the stage's shelf, till and food register points (stage 2: shelf (1415, 886), till (1302, 934),
food register (1272, 871); stage 3: fish register (1181, 826)) until stages are ported (LATER, open question Q3).

---

## 16. Per-event sequences (end to end)

**A. Fish caught** — chief still 0.08 s within 55 of (1089, 386) → `Reel` (cast 0.25 s) → `fish` impact (0.3 s, then
every 0.6 s) → `Hit` (Stock − 1) → `SpawnItemTo` reserves bag room, fish leaps 300 ms from the float → lands: bag +1,
sfx_pickup, MAX at 6. Pool +1 every 1.1 s while below 6.

**B. Cooking by hand** — chief on (934, 625): `OperatorSpot.Update` sets `Chief`, moves one raw fish per ≥ 0.075 s
(240 ms flight) → `Station.Update` (same tick, after) cooks while `Chief` and input > 0 and output room: every 0.64 s
(0.65 s at 60 fps) `Process` → raw flies into the grill (240 ms), cooked flies out at +260 ms and lands at +560 ms on the
output stack.

**C. Taking and selling** — chief on (1101, 639): every 83 ms one cooked fish moves into his bag (230 ms flight) up to 6
→ on (1314, 835): every 83 ms one moves to the shelf (240 ms) → the lane's front customer (state Wait, arrived) gets one
per 0.2 s (280 ms flight; on landing Got +1, Value +4).

**D. Paying** — order complete and nothing flying → customer waits (coin bubble pulses) → chief on (1415, 859) →
within ≤ 0.25 s the first pays, then one per 0.35 s (next customers must first walk up and be served) → `Complete`:
happy 0.9 s, leaves by the exit path; +200 ms: till `Value += value`, up to 6 coin pictures fly to the pile → `Sold`
→ flag `firstSale` (first time) → +700 ms `SyncPads` → clerk pad pops at (1525, 900).

**E. Collecting** — chief on (1216, 900): `Value` → `Economy.Add(v, fly)` at once: "+v" float, coins fly to the HUD,
counter waits 380 ms then counts up (10 %/frame-rate rule); pile coins stream to him one per 0.03 s.

**F. Hiring the clerk** — chief on (1525, 900) with ≥ 1 coin: after 0.5 s coins drain at 12/s (counter snaps down)
→ paid 12 → `Complete` (fx, shake) → `CompleteStep`: banner 「점원 합류!」, clerk poofs in at the pad and walks
(150 px/s) to (1236, 776); payments then take 0.55 s each with no chief; +600 ms `op_grill` pad at (925, 745); save.

---

## 17. LATER summaries (enough to plan, not to build)

| Feature | Phaser facts |
|---|---|
| Fisher on the deck | Walks to the gangway foot (890, 420), then a scripted lane onto the deck (collision off), sits on stool 1 facing NE. Loop: cast `castS` 0.6 → wait 1.0–2.8 s → bite 0.25 → reel 0.6 → rest 0.15; each reel = `fishPerReel` 2 fish flying 520 ms (height 120) to the crate pile (max 40); waits when full. Deck grows to tier 2/3 with hire2/hire3 (Worker.js `updateDeck`). |
| Fish crate pile | (1000, 440); shown with the first fisher; the chief takes from it like an output pad (shared `padT`); raw porter carries it to the grill (`labour.rawCapacity` 8). |
| Porters | `raw_grill` 70: crate → grill input; `porter_grill` 100: grill output → shelf (capacity 14); logistics priorities (`v42.porters`). |
| Trash pad | Enabled after `hire_fisherman`, or early when the bag is full and nothing takes any carried type (checked every 0.5 s). Stand 0.6 s → one item per 0.1 s flies into the fire. |
| Pickup modes | Settings 자동 줍기 'still' (stand ≥ 0.35 s below 20 px/s) and 'off' (button); the tutorial forces 'auto'. |
| Tutorial after the first loop | register/cash/upgrade/zone/labour hints, idle "next action", `obj_next` text, goal window, navigator (`Tutorial.destination` is the shared resolver). |
| Shop stages 2–4, 자재 창구, meat lane, lane switching (`switchS` 4 s) | Seller.js 900–1175, 1289–1600. |

---

## 18. Porting risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Frame-quantised cadences.** `padT = 0.075` and station `timer = 0` reset to a fixed value, so hand-overs happen every 5 frames (83.3 ms) at 60 fps, every 3 frames (100 ms) at 30 fps. Writing `padT += interval` or carrying the station remainder speeds the loop up by ~10 %. | Port literally (L3). Unit-test at dt = 1/60: 6 items take 0.417 s; 4 chief-cooked fish take 2.60 s. |
| R2 | **Gathering is animation-driven.** One fish per `fish` impact frame (index 3 of 6 at 10 fps). If the `FramePlayer` skips frames on a long dt, fires impacts twice, or resets the loop on every `Play`, the catch rate changes. | `FramePlayer` must fire the impact once per loop when crossing frame 3, keep phase when `Play` is called with the same key, and step multiple frames per tick when dt is long (04 §4.5). |
| R3 | **Reserved capacity.** Counts, room checks, "order complete" and saves all depend on `Reserve`/`Arrive` and `Flying` lists. Moving items instantly or forgetting the reserve overfills bags and shelves. | Port 04 §7.3 exactly; tests for "bag never exceeds 6 incl. in-flight". |
| R4 | **Tick order.** The work spot must update after the chief and before the station; registers before lanes; pads before stations; scheduler before the tick. Different order shifts first-frame behaviour (e.g. first payment delay). | Keep §4 order in one `GameLoop.Tick`. |
| R5 | Iso pad test: `gdist` doubles dy. A circle test makes pads twice too tall and the reel reach wrong. | `PadArea.Contains` as in §5 (L8). |
| R6 | Payment rules: payment only while `Staffed`; `PayT = min(PayT, 0.25)` while unstaffed; first payment immediate after stepping on if `PayT ≤ 0`. | Port verbatim; test "stand on register with a waiting customer → pays within 0.25 s". |
| R7 | Random wants and spawn gaps make runs differ. | Seeded RNG (L7); compare medians over 5 seeds, as the Phaser team did. |
| R8 | Coins credited on contact but pictures stream later; the HUD counter has a 380 ms delay and a ≥ 1/frame step. Using a tween on the number instead changes the feel. | Port `SetCoins`/`Tick` rule (§10). |
| R9 | Korean text: fonts and 9-slice panels sized from measured text width. | TextMeshPro with a Korean SDF font (Pretendard or Noto Sans KR), sizes in logical px; measure `preferredWidth` the same way. |
| R10 | Act 1 is a long rule set with debounces; partial ports look broken (flashing steps). | Ship either none (L6: Tutorial panel only) or all of §13.2–13.4 with the dwell/back/short rules. |
| R11 | Banners/toasts are held or dropped during Act 1. Without Act 1 they must not be held. | Gate on `onboarding.Owns`. |
| R12 | Saving mid-flight. | Use `CountWithIncoming` / `InTypes` as in §15; never save a raw `Count`. |
| R13 | `StationBlocked` only checks the grill's in AND out full; a full output alone still lets the chief fish. | Port literally. |
| R14 | JS numbers are doubles. Accumulators compared with thresholds (station timer vs 0.8, pad cooldowns, pool timer) can land one frame apart with C# `float`. | Use `double` for simulation timers and coins maths; frame counts in A4–A7 allow ±1 frame. |

---

## 19. Acceptance checks (EditMode tests + on device)

| # | Check | Expected |
|---|---|---|
| A1 | New game state | coins 0; deck Stock 6; grill 0/0; shelf 0; till 0; 3 customers at (1107,798), (1066,818), (1025,838), each wanting 1–3 `item_fish_cooked`, bubbles shown; no paid pad; `onb` = 1 if Act 1 is built |
| A2 | Arrow at start (Act 1 off) | key `obj_fish`, target (1089, 376) h 6 → arrow drawn at y = 370 − bounce |
| A3 | Spawn reach | gdist((1130,412), (1089,386)) = 66.2 > 55: no fishing until he moves ≥ ~12 px toward the spot |
| A4 | Fishing cadence (dt 1/60, stand at (1089, 386) from t = 0) | fish land at ≈ 0.08 + 0.3 + 0.3 = 0.68 s, then +0.6 s each; 6 fish by ≈ 3.7 s (Act 1 off) / 4 by ≈ 2.5 s (Act 1 lap 1); bag never > 6 |
| A5 | Pool refill | the pool timer runs only while Stock < 6 and resets to 0 at each refill: with the chief taking one per 0.6 s from t0 (first take), refills land at t0 + 1.1, + 2.2, + 3.3 s …; the pool never runs dry during the first 6-fish bag |
| A6 | Cooking by hand | 4 raw fish, chief on (934, 625): inputs move every 5 frames; one cooked fish per 39 frames; 4th cooked fish lands on the output ≈ 2.60 + 0.56 s after the first raw fish landed in the grill input |
| A7 | Cook hired | same with no chief: one per 48–49 frames |
| A8 | Sale | a customer wanting 3 pays 12 coins into the till 200 ms after `Complete`; `firstSale` set at the first `Complete`; clerk pad visible 700 ms later at (1525, 900) |
| A9 | Register rules | waiting customer, chief steps on: pays within ≤ 0.25 s; the next one ≥ 0.35 s later; chief steps off → nobody pays |
| A10 | Till | chief steps on a till of 20: coins 20 at once, "+20" float, HUD shows 20 after 0.38 s + count-up; the pile empties at one coin / 0.03 s |
| A11 | Pad payment | 12 coins on the clerk pad: nothing for 0.5 s, then 12 coins/s; pad done after 1.0 s; `op_grill` pad 600 ms later; leaving and re-entering during payment keeps the partial `Paid` |
| A12 | needsLeave | a pad that pops up under the chief does not drain until he steps off and back on; arrow shows `obj_step_off` at (x, y + 118) |
| A13 | Line cap | with no sales, the line holds at 10 customers (slots per §3.1) |
| A14 | Save/load round trip mid-loop | bag, grill i/o (incl. in flight), shelf (incl. fish handed to an unpaid customer), till, coins and partial `Paid` survive; queue rebuilt with 3 fresh customers; deck back to 6 |
| A15 | First-sale timing (bot following the arrow, Act 1 on, 5 seeds) | median within 15.8 ± 1.0 s of game time from the village load (Phaser 15.7–16.1 s). With Act 1 off compare with Phaser `?onboard=0` measured the same way (not measured here; see Q2) |
| A16 | Strings | ko/en tables of §14 render without missing glyphs at 720-px logical width; the objective text shrinks rather than overflowing |

---

## 20. Source index (Phaser files and line ranges)

| File | Lines | What |
|---|---|---|
| `src/scenes/Game.js` | 155–445 | build order (economy 247, progression/tutorial/onboarding 255–268, `sold` → firstSale 296, pad spots 304–330) |
| `src/scenes/Game.js` | 935–964, 969–976, 1009–1027, 1040–1053 | stations, labour, operator hire, `updateLabour`, sellers |
| `src/scenes/Game.js` | 1716–1724, 1779–1787 | `focusCamera`, `popIn` |
| `src/scenes/Game.js` | 2020–2091, 2093–2158 | `findGatherable`, `moveItem`, `spawnItemTo`, `moveAgent` |
| `src/scenes/Game.js` | 2161–2305 | `update` / `tick` order, tutorial camera framing 2238–2262 |
| `src/scenes/Game.js` | 2366–2464 | `handlePlayerPads`, `stationBlocked`, `fullToast` |
| `src/scenes/Game.js` | 2466–2689 | `serialize`, `save`, `restore` (`restoreQueue(firstCustomers)` 2688) |
| `src/entities/FishingDeck.js` | 45–100, 178–275, 391–453 | deck setup, chief line, pool (`ready`/`reel`/`hit`/`fishPos`/`update`) |
| `src/entities/Player.js` | 64–193, 213–248 | capacity/room, gathering, operating, `fishCapped`, `warnFull`, `impact` |
| `src/entities/Station.js` | 14–180 | grill station |
| `src/systems/Labour.js` | 58–185, 188–310 | `OperatorSpot`, `Operator` (cook) |
| `src/entities/Pad.js` | 1–36 | pad radius and `contains` |
| `src/entities/Seller.js` | 23–148 | `CashPad` |
| `src/entities/Seller.js` | 205–556, 558–728 | `Market` helpers (slotPos, feedFrom, spawnPoint, entry/exit), `Customer` |
| `src/entities/Seller.js` | 900–1007, 1175–1418, 1600–1803 | lanes, `StageMarket` build/`setStage`/makeWant/spawn/handOver/update/complete |
| `src/entities/Register.js` | 13–286 | register, clerk |
| `src/entities/UnlockPad.js` | 1–334 | paid pads |
| `src/systems/Progression.js` | 22–45, 67–80, 237–370, 457–611, 678–730 | costs, fish-line steps, state, `syncPads`, `completeStep`, `applyStep`, update/affordable/next/serialize |
| `src/systems/Economy.js` | 1–26 | coins |
| `src/systems/Tutorial.js` | 46–157, 206–213, 580–622, 966–1031 | arrow state, evaluate, step-off, firstLoop, update/shown |
| `src/systems/Onboarding.js` | 29–110, 148–520, 883–910 | ONB bits, steps, start, Act 1, helpers, ring |
| `src/scenes/OnboardOverlay.js` | 28–46, 305–392 | coach card, skip chip |
| `src/scenes/UI.js` | 58–123, 229–251, 544–614, 617–704, 792–806, 1347–1385 | coin HUD, layout, coins, coin flights, toast, banners, objective, tick + edge arrow |
| `src/systems/PickupPolicy.js` | 1–136 | 'auto' forced in the tutorial |
| `src/data/balance.js` | 14–35, 51–125, 127–176, 177–181, 219–232, 247–253, 319–323, 607, 717 | numbers of §3.3 |
| `src/data/world.js` | 27–36, 45–76, 91–95, 127–157, 287–318, 330–380, 795–823 | places of §3.1 |
| `src/data/strings.js` | ko 6–644, en 645–1233, 1238–1281, 1431 | strings, `t`, `josa`, `fmt` |
| `src/data/items.js` | 1–40 | item lists, `priceOf` |
| `assets/deck43/manifest.json`, `assets/characters/manifest.json`, `assets/market/manifest.json` | — | `fish`/`reel` 6 frames 10 fps impact 3; `harvest`, `give` 6 @ 10 impact 3; stall staff/customer points |
| `tools/test/onboarding.mjs` 120–260, `docs/redesign_v43/engineering_plan.md` §4 | — | the arrow-following bot and the first-sale measurements |

---

## 21. Open questions for the lead

| # | Question | Default if nobody answers |
|---|---|---|
| Q1 | Build the Act 1 coach cards for the go/no-go, or ship with the old objective panel (Phaser `?onboard=0`)? | Objective panel first; Act 1 if time allows (it is all-or-nothing, R10) |
| Q2 | The first-sale gate (A15) was measured with Act 1 on. Should the Phaser team measure `?onboard=0` so the slice has a reference? | Use 15.8 s ± 1.5 s as a loose band without Act 1 |
| Q3 | v4.x saves past the forest open the shop at stage 2–3. Port the lanes/자재 창구 now, or run stage-1 rules on the stage's points? | Stage-1 rules on the stage's points (§15) |
| Q4 | Fisher hire in the slice: real seated loop (LATER work) or a stub that only marks the step done? | Stub: pad, banner, step done, tutorial ends; deck tier stays 1. **Revision:** then `SliceEnd` (00 WP-8): one banner 「여기까지가 시험판이에요」 and no later pads (`raw_grill` 70, `porter_grill` 100, `zone_forest` 90 would show and do nothing) |
| Q5 | The new-game flag maker modal (pauses the game before the tutorial). Skip in the slice? | Skip (L6) |
