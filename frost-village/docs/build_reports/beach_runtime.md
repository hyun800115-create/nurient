# beach_runtime (v7 햇살 해변) — build report

Standalone module for docs/v5_v8_plan.md §6.5 (layout §4.4, architecture §5, saves §8, budgets §9, patches §10).
Nothing in the game runs it yet: the lead wires it in with the patches in **Integration** below. No file outside
`src/beach/**`, `tools/test/beach_lab/**`, `docs/previews/beach_lab_*` and this report was created or changed;
`assets/**` was only read.

## 1. What it does

- **Opening.** One minute after harbour ★2 a ferry tourist asks "따뜻한 바다는 어디예요?". The harbour master answers
  with the old map. Then the 해변 가는 길 site is offered (`blvd_b`: 5,000 coins, 30 planks, 15 s).
- **Reveal (E7).** The chief walks east past the lighthouse point. The snow thins into sand through the
  `sandKit`/`wetKit` edge pieces. The fog over `beach` clears (`ports.world.reveal('beach')`) and music crossfades to
  `bgm_beach`. The camera pans along the shore and the banner 햇살 해변을 찾았어요! appears.
- **Clean-up (E8).** There are 12 bits of seaweed and driftwood. The chief picks one up by walking within 56 px. Then
  the `beach_gate` (햇살 해변) pops up.
- **The resort, in order.** The order is `path → reveal → cleanup → lifeguard → board → hotel → pool → aquarium →
  up2 → up3`. Every build step is a site offered through `ports.sites.offer` (the game's Site flow, P29).
  - The 인명구조대 step (해수욕장 개장) opens the beach: buoy lines, the lifeguard on the tower, and tourists.
  - The second founding board brings the 7 shops, one card at a time (P32). It runs standalone in the lab.
  - 리조트 호텔: 12 → 20 → 32 rooms, 2-day stays, daily spend; doorman, bellhop, receptionist and housekeeper at their
    staff points; guests wave from the balconies 19–23 h.
  - 수영장: a Water `pool` region, pool swimmers and deck sunbathers. The free extras `beach_bar`, `pension` and
    `beach_arcade` come with it.
  - 작은 수족관: ticket income and rare-fish donations from `harbor:rare`.
  - Beach ★1 / ★2 / ★3, then the 햇살 해변 축제 week.
- **Beach life.** At most 60 people are present, and the ≤ 30 nearest the view are drawn as paper-doll rigs.
  - Sources: ferry tourists through the coast train or on foot, village day-trippers, and hotel guests.
  - Activities: swim and float (ring wearers float), sunbathe (feet direction from `sunbatheDirFor`, lie-shadow
    ellipse), sit, dig sandcastles (`sandcastle_build_0..3`, one stage every 20 s), splash_play (`fx_splash_small` on
    the impact frame), volleyball (2v2, `ball_throw`/`ball_catch` impact frames carry a real `beach_ball`), the
    ice-cream cart queue (served kids hop with a star), shop queues, the shower, kites, photos, surfing on two lanes,
    swan boats, kayak, and a banana boat towed by the yacht.
  - Caps: 12 in the water, 16 lying down, 4 boats, 6 crabs.
  - The lifeguard whistles at most once per 40 s when a swimmer drifts past the buoys. The swimmer swims back.
  - Swimmers sit on the sea surface (`Water.heightAt`), with `fx_swim_ripple` one depth below and
    `water.ripple(x, y, 0.55)` about once a second.
- **Shops buy village goods.**
  - Shelves empty as visitors buy. Below 40 % a shop asks for village goods (bread, cake, grilled fish, smoked meat,
    cans, planks, ingots, sugar and cloth crates).
  - Delivered goods pay wholesale × (1 + bonus) = price × 0.7 × 1.3. Rent per minute follows the plan table.
- **Night.** Each lit building adds its `<key>_glow` (ADD) and `lightPoints` → `clock.addLight`. The `bbld_glow`
  atlas is requested lazily at dusk. String lights glow, balcony guests appear, and board texts lift above the glow.
- **Events** (`api.event(kind)` → Promise; each one takes the ceremony slot of a stage, never two at once):
  - 모래성 대회 (C11): 6 kids build three castles. Judging opens, then the chief picks a castle (`api.pick`), or the
    tallest castle wins automatically after 12 s. Banner `{n}번 모래성이 1등이에요!`.
  - 여름 불꽃놀이 at 21:00: 26 rockets over the sea, watchers on the beach.
  - 북극곰 수영 대회 (C13) at the village's snowy coast: 6 residents in swimsuits run into the winter sea and splash out
    shivering while a crowd claps. It needs the swimwear shop.
  - 햇살 해변 축제 week: crowd × 1.5 and fireworks every night.
- **Happenings P9–P12.**
  - P9: a crab pinches a sunbather.
  - P10: a wave flattens a sandcastle.
  - P11: a beach ball flies out to sea; the lifeguard paddles out on the `rescue_board`.
  - P12: a parasol flies off; if the chief stands in its path, they catch it for +2 fame.
  - When the story engine is present they are registered with its HappeningClock (`ports.story.happenings`).
    Otherwise the beach runs its own sparse clock.
- **Mission hooks.** Through `ports.missions.report`:
  - `{ how: 'stand', code: 'E7' }` at the reveal
  - `{ how: 'choose', code: 'C11' }` when the chief picks the contest winner
  - `{ how: 'tap', what: 'crab' }`
  - `api.findSpot('litter')` lists the clean-up bits
  - `api.places()` lists named spots (`p:beach_gate`, `p:sandcastles`, `p:hotel`, …)
  - 잃어버린 튜브 can use `api.findSpot`/`api.places` (spawning the tube itself is a missions-side prop)

## 2. Files

| File | Layer | Lines | Purpose |
|---|---|---|---|
| `src/beach/index.js` | module | 42 | `BEACH_MODULE` descriptor (§5.2): `id, version, saveKey, capBytes, needs, gate (harbour ★2), prefetch, create, sanitize, previews`, plus the `FRAGMENTS` list |
| `src/beach/host.js` | host | 253 | `BeachHost`: ports → model → view; sites, call, drain (toasts / banners / coins / missions / feed), `onFeed`, `api`, `serialize`, standalone porter |
| `src/beach/tuning.js` | data | 100 | `BEACH_TUNING` (Korean comments; becomes `BALANCE.v7.beach` verbatim), `beachTuning(BALANCE)`, `STEPS`, `SITE_STEPS` |
| `src/beach/layout.js` | data | 237 | lattice helpers, sea line `waterJ(i)`, sand cells, `blvd_b`, rows 1–2, gate, props, boardwalk, buoys, swim/splash/surf zones, boat loops, aisles, places, clean-up bits, sea region and land mask |
| `src/beach/strings.js` | data | 78 | `BSTR` ko + en, `bt(lang, key, vars)` |
| `src/beach/save.js` | data | 70 | slice `beach` v1, `sanitizeBeach` (never throws), `fitBeach` (≤ 2 KB) |
| `src/beach/looks.js` | data | 25 | `looksFrom(beachfolk)`: presets → persons, `pickAnim`, `canPlay` (beachfolk compositor rules) |
| `src/beach/model/BeachModel.js` | model | 360 | steps, stars, clean-up, castles, staff, balconies, happenings data, update loop (4 Hz scripts), `serialize` |
| `src/beach/model/activities.js` | model | 175 | slots built from the manifests (`lyingPoints/lyingFeetDirs`, `seatPoints/seatDirs`, `swimPoints`, `playPoints/ballDirs`, `customerPoints`, `workPoints`) with depth rules, exclusivity, `SlotTable` |
| `src/beach/model/crowd.js` | model | 585 | groups, entries, walks along aisles, act scripts, volleyball court, cart queue, drift/whistle, invariants `check()` |
| `src/beach/model/resort.js` | model | 174 | hotel stays and spend, founding card, shelves, restock, wholesale, aquarium, rent |
| `src/beach/model/events.js` | model | 167 | contest, fireworks, polar swim, week, happenings clock P9–P12 |
| `src/beach/model/sea.js` | model | 99 | boats (loops, mooring, tow), crabs |
| `src/beach/model/stage.js`, `rng.js`, `time.js` | model | 70 | local stage-slot copy, seeded streams, `hourOf/dayOf/nextAt` |
| `src/beach/view/BeachView.js` | view | 180 | orchestration, `onModel`, ambience, sea and pool Water, previews |
| `src/beach/view/Sand.js` | view | 131 | sand + wet band bake hook (`ground_sand`, `ground_sand_wet`, kit pieces, decals, boardwalk), clipped to land |
| `src/beach/view/Beach.js` | view | 189 | buildings + overlays d+1, board texts, props and loops, buoys, castles, shower, clean-up bits |
| `src/beach/view/Beachgoers.js` | view | 277 | rigs for the nearest ≤ 30, staff, balconies, ripples, splash, volleyball ball, flash overrides |
| `src/beach/view/Boats.js` | view | 170 | water-plane boats with riders, overlays, wakes, yacht tow + rope, crabs |
| `src/beach/view/Night.js` | view | 56 | glows, lights, lazy `bbld_glow`, board texts over the glow |
| `src/beach/view/Fx.js` | view | 124 | sheet pool, puffs, emotes, coin pops, flash, fireworks |
| `src/beach/view/Happenings.js`, `PolarSwim.js`, `Reveal.js`, `art.js` | view | 336 | P9–P12, the polar swim, the reveal pan, art helpers |
| `tools/test/beach_lab/beach.test.mjs`, `env.mjs` | test | 511 | 19 Node tests |
| `tools/test/beach_lab/lab.html`, `lab.js`, `lab_dolls.js`, `lab_ground.js`, `run_lab.mjs` | lab | 916 | Phaser 3.90 lab + Playwright runner |

The model files import no Phaser code. The view files import only the shared, already-existing `DepthSort.js` and
`Water.js` (through ports).

## 3. Public API (`gs.later.beach` = `host.api`)

| Call | Returns |
|---|---|
| `open()` | beach open (lifeguard built) |
| `star()` | 0–3 |
| `hotel()` | `{ level, rooms, booked, occupancy }` |
| `crowd()` | `{ present, swimmers, lying, today, total, arrived, left }` |
| `event(kind)` | Promise → `{ ok, kind, winner, why }`; kinds `contest`, `fireworks` (21:00), `polar`, `week` |
| `pick(castle)` | the chief picks the contest winner (`castle_1..3`) |
| `step()`, `steps()` | next step id, done steps |
| `shops()`, `card()`, `deliverCard(items)` | founding board, standalone mode only (Growth owns it in the game) |
| `donate()` | a rare fish for the aquarium |
| `places()`, `findSpot('litter')`, `staff()`, `happenings()`, `happening(id)`, `economy()`, `cleanup()`, `hour()` | mission, story and debug helpers |

**Host:** `host.update(dt)`, `host.onFeed(ev)`, `host.built(siteId)`, `host.serialize()`, `host.state()`,
`host.objects()`, `host.destroy()`.

## 4. Events

**Out** (through `ports.emit`, payloads JSON):

- `beach:call`
- `beach:site { step, id }`
- `beach:step { step, … }`
- `beach:arrive|leave { n }`
- `beach:checkin { n }`
- `beach:shop { id, op: open|restock|sold, need? }`
- `beach:event { kind, op: start|judge|winner|end|cancel, … }`
- `beach:star { n }`
- `beach:happening { id, op }`
- `beach:whistle { vid }`
- `beach:clean { n, max }`

**In** (`host.onFeed`):

| Event | Effect |
|---|---|
| `harbor:ship {kind:'ferry', op:'arrive', n}` / `harbor:tourists {n}` | tourists come (½ to the beach, 35–80 s later) |
| `train {ev:'arrive', stop:'beach', line:'coast', n}` | riders walk in from 해변역 |
| `built {siteId:'b_step_<step>'}` | the step is done |
| `shopOpen {id, board:'beach'}` | a Growth beach shop opened |
| `delivered {pad:'bshop:<id>', item, n}` / `veh:freight {to:'b_…', items}` | goods for a beach shop |
| `harbor:rare` | an aquarium donation |
| `stage:open {slot:'ceremony', kind}` | a wedding needs the stage, so the running beach event ends cleanly |
| `tap {what:'crab'}` | mission report |

Day and hour come from `ports.clock.T()`, so `day` / `hour` feed events are not needed.

## 5. Save slice (§8)

The key is `beach`, version 1, cap 2,048 bytes of JSON. A full ★3 beach after a day measures **437 bytes**:

```
{"v":1,"open":1,"steps":{"path":1,"reveal":1,"cleanup":1,"lifeguard":1,"board":1,"hotel":1,"pool":1,"aquarium":1,"up2":1,"up3":1},
 "hotel":{"level":3,"guests":[[15,4],[5,5]]},"shops":[…7 ids…],"stars":{"n":3},"events":{"last":{"week":2,"fireworks":2},"week":[2,9]},
 "crowd":{"today":22,"total":141,"day":3},"sd":3,"facilities":{"extras":1}}
```

- **Extra fields beyond §6.5:**
  - `clean`: a bitmask of picked bits, kept only until the clean-up is done.
  - `card`: founding-card progress, standalone only.
  - `fish`, `events.week`, `events.happen`, `crowd`, `sd` (crowd seed day).
  - `shops`: only a mirror. In the game Growth owns the beach shops and this list is ignored once `ports.shops.growth`
    exists.
- **sanitizeBeach behaviour:**
  - It never throws.
  - It drops unknown keys and clamps every number.
  - It removes steps that skip a predecessor, and caps hotel guests to the level's room count.
  - It returns `null` (a fresh beach) for non-objects or another version.
- **fitBeach** drops crowd counters, the card and `happen`, then the oldest hotel parties, until the slice fits.
- **Tests:** a round trip keeps the beach; 200 fuzzed slices never throw and stay sane.

## 6. Tuning (`BALANCE.v7.beach` ← `src/beach/tuning.js`)

These are the plan's literal values, plus the extras the module needs. All are documented in Korean in the file.

| Item | Value |
|---|---|
| path / lifeguard / hotel / pool / aquarium | 5,000+30p 15 s / 6,000+30p+6i 12 s / 40,000+120p+60i+20 glass 30 s / 20,000+40i 18 s / 18,000+30p+20i 14 s |
| hotel | rooms 12/20/32, ups 15,000 / 25,000, stay 2 days, spend 20–45 per room-day, check-in share 0.35 |
| founding | order and cards as §6.5; rent 30/35/35/40/30/30/30 per minute; build time 25 s |
| shops | shelf 20, restock below 40 %, wholesale 0.7, bonus 0.3 |
| live caps | present 60, rigs 30, swimmers 12, sunbathers 16, boats 4, crabs 6, busy 10–17 h |
| events | contest 6 kids / 80 s / every 5 days; fireworks 21:00 / 40 s / 7 days / 26 bursts; polar 6 swimmers / 46 s / 10 days; week 7 days |
| lifeguard | whistleGap 40 s, driftChance 0.05 |

## 7. Numbers

### 7.1 Logic (Node, `tools/test/beach_lab/beach.test.mjs`, a busy ★3 day 12:24–17:12, 54.8 present)

| | avg | p95 | p99 | max |
|---|---|---|---|---|
| model + host per 60 fps tick | **0.0040 ms** | 0.0062 | 0.028 | 3.5 ms (one GC / a group arriving) |

The budget is ≤ 0.15 ms (§9.2). In the lab (Chromium, nice 15) the model averages 0.010–0.011 ms per frame.

### 7.2 Lab (Chromium, phone 390 × 844 DPR 3 unless noted; `docs/previews/beach_lab_numbers.json`)

| View | Crowd (present / rigs) | Model ms | View ms (own + doll compositor) | Draw calls | World objects (module) | Module textures MiB |
|---|---|---|---|---|---|---|
| ★3 day, zoom 1.0 | 58 / 30 | 0.011 | 0.56 (0.24 + 0.32) | 18 | 1,243 (1,043) | 99.5 |
| ★3 day, zoom 0.6 | — | — | — | 19.4 | 1,295 | 99.5 |
| night, fireworks | 15 / 10 | 0.007 | 0.30 (0.14 + 0.16) | 17 | 869 (630) | 106.2 (+6.7 `bbld_glow`) |
| desktop 1280 × 800 DPR 1 | 48 / 28 | 0.010 | 0.46 (0.21 + 0.25) | 16 | 1,145 (990) | 99.5 |

- **View split, day.** Beachgoers' own work 0.09, boats 0.10, beach 0.05, others ≈ 0. The doll compositor (the
  lab's beachfolk rig; DollSprite in the game) is 0.32 ms for 30 rigs + staff.
- **Two view optimisations went in during the lab work:**
  - The rig set is re-chosen 5× a second, not every frame.
  - `rig.show` is called only when anim, dir or frame changes.
  - Together they took the view from 0.64 to 0.56 ms.
- **Static display objects:** 116 (buildings, overlays, props, board texts, clean-up bits); the budget is ≤ 400.
  The boardwalk and the sand are baked into the ground.
- **Module textures** are the raw lab atlases: beach 45, beach_bld 32.2, `ship_yacht` 9.0, water fx sheets 9.5,
  ground sand 2. That is ≤ 120 MiB per district (§9.1), and dusk adds +6.7 against the +7 budget.
- **People:** the frames people actually drew total 14.3 MiB (trimmed RGBA). The lab loads the whole raw
  townfolk + townfolk2 + beachfolk atlases (251.8 MiB), which the game does not do (page classes + residency, P24 / P4).
  The lab's total of 385 MiB is therefore not the game's number.
- **Draw-call breakdown** (day, measured by hiding groups):
  - Water: 5 (sea body + shore band + pool body, and the batch breaks around them).
  - Lab ground tiles: ≈ 1.5.
  - The rest: 11 multi-texture batches. About 41 distinct textures are in view on 16 texture units: raw beach atlases,
    7+ doll pages, and 5 Text canvases.
  - See Known issues 2.
- **Water** (`tropical` sea): field 475 × 425, 202k cells, built at runtime in 288 ms. The pool field is 48 × 48 and
  takes 2.6 ms. Water texture bytes are 3.7 MB (sea) and 2.1 MB (pool).

### 7.3 Economy (one ★3 game day = 10 min, Node)

Rent 2,300 + hotel 161 + aquarium 50 + wholesale 217 = **2,728 per day ≈ 273 coins/min**, with 150 hotel guests.
See Known issues 1.

## 8. Lab

```
nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=day            # each group < 75 s
  groups: day · swim · fun · pool · night · reveal · stages · polar · happen · english · desktop   [--no-gif]
nice -n 15 node --test tools/test/beach_lab/beach.test.mjs              # 19 tests, 2 s
```

- **Page.** `tools/test/beach_lab/lab.html` is Phaser 3.90 with the game's View/scale config and real manifests and
  atlases. It uses the real `Water.js` and `DayClock.js`.
- **Stand-in world:**
  - `LabGround`: 512² canvas tiles in the same order as `Ground.bakeChunk`, plus bake hooks.
  - The lighthouse, pines, a cobble `blvd_b`, and a village coast for the polar swim.
  - Fog puffs.
  - Camera bounds of the v7 world, 11,264 × 5,888.
- **Dolls.** `LabDolls` implements the rig contract on `BeachfolkSprite` (`tools/beachfolk_compose.js`).
- **Runner (fixed-step clock):**
  - Stills are taken on a DPR-3 page, GIFs on a DPR-1 page. Each phase replays the other's capture time as game
    time.
  - Phaser tweens (which run on wall time since 3.60) are driven by the step delta.
  - Black swiftshader captures are retaken.
- **Captures,** all under `docs/previews/`, every one looked at:

| File | What |
|---|---|
| `beach_lab_day_z10.png`, `_z06.png`, `_z12.png`, `beach_lab_day.gif` | ★3 beach by day at zoom 1.0 / 0.6 / 1.2 |
| `beach_lab_swim_whistle.gif` | swimmers inside the buoys, a drift, the whistle, the swan boats, the tow passing far out |
| `beach_lab_volley.png`, `.gif` | 2v2 rally with the ball on the impact frames |
| `beach_lab_icecream.gif` | the cart queue, vendor, served kids |
| `beach_lab_contest_start.png`, `beach_lab_contest.gif`, `beach_lab_contest_winner.png` | 모래성 대회: banner, castles growing, the chief's pick and banner |
| `beach_lab_pool.png`, `.gif` | hotel pool (Water `pool`), deck loungers, slide |
| `beach_lab_dusk.png`, `beach_lab_night.png`, `beach_lab_fireworks.png`, `.gif` | lights on, lit hotel sign, balcony guests, fireworks |
| `beach_lab_reveal.gif`, `beach_lab_reveal_after.png`, `beach_lab_cleanup.png` | snow → sand walk, fog clears, banner, pan; the empty beach with the clean-up bits |
| `beach_lab_stage_open.png`, `beach_lab_stage_shops.png` | right after 해수욕장 개장; with the first shops |
| `beach_lab_polar.gif`, `beach_lab_polar_end.png` | 북극곰 수영 대회 at the snowy village coast |
| `beach_lab_p11_ball.gif`, `beach_lab_p12_parasol.gif`, `beach_lab_p9_crab.gif` | happenings |
| `beach_lab_english.png`, `beach_lab_desktop.png` | English strings; desktop (portrait FIT like the game) |
| `beach_lab_numbers.json` | all measurements above |

- **Fixed while iterating on the captures:**
  - The Water land mask ended at j −2 and i 125, which drew a shore band across the snow. The mask now covers all
    land past the region.
  - The banana-boat loop crossed the swans; it moved 1.7 cells out.
  - Moored boats were shown on the dry sand with riders; they now sit empty in the shallows.
  - The volleyball was drawn ~10 px; it is now sized from the trimmed frame per the beachfolk `radiusPx`.
  - Swimmers clustered near the camps; they now fan out along the buoys.
  - The hotel and gate sign texts were washed out by the night glow.
  - The slanted notice board had text on it; the text was removed, and so was the duplicate text on the gate signpost.
  - The contest had no winner banner; one was added.
  - The fireworks palette was more saturated, and a 1-px seam between lab ground tiles was removed.

## 9. Decisions and deviations

- **Row 1 sits 1.6 cells east of §4.4.** The cafe is at (93.76, −11.13) and the rest follow; the aquarium is at
  (119.83, −11.06). This keeps a 3.6 m passage between the lighthouse (i 87.1–89.7) and the cafe for the path and gate
  at i 91. Row 2 keeps §4.4. `lifeguard_station`, `beach_arcade` and `restroom` continue row 2 at front j −3.2…−3.4.
  All of this is documented at the top of `layout.js`, and the overlap, region and street tests pass.
- **Bounded crowd.** The model keeps up to 60 people analytically: positions come from segment times, scripts tick at
  4 Hz, and nobody steps per frame. The view draws only the nearest 30.
- **Stage slots.** `model/stage.js` is a local copy of the story module's `StageDirector` API (`request/end/busy`).
  `ports.stage` replaces it in the game. Events take `ceremony`; happenings take `happening`.
- **Shops in the game are Growth's** (P32). With `ports.shops.growth` present the module stops collecting rent and
  only drives visitors and restock asks.

## 10. Known issues

1. **Economy is far below plan §3.3.** Beach ★3 should lift income from ≈ 5,500 to ≈ 8,000 coins/min (+2,500). The
   binding §6.5 numbers give +273 coins/min.
   - Suggested `BALANCE.v7.beach` tuning: rent ×5 (150–200/min per shop, +1,150/min), hotel `spendPerDay [200, 450]`
     (+1,000/min at 32 rooms), aquarium `ticket: 20`.
   - These numbers were not changed here because they are the plan's.
2. **Draw calls are 16–19 in the lab against ≤ 12.** Levers, in order:
   - packed pages (P24) cut distinct textures (raw lab atlases now);
   - `renderer.maxTextures` 32 where the GPU allows it (swiftshader reports 32; Phaser uses 16);
   - the pool as the `hotel_pool_water` sprite instead of a second Water region (−1 to 2; the fallback code exists:
     omit `ports.water.region` for the pool);
   - board texts baked into one canvas.
3. **View CPU is 0.46–0.56 ms per frame** on this desktop-class CPU. More than half of it is the doll compositor
   (frame refreshes of ~30 rigs). On phones expect about 2–3×. Levers: `live.rigs` 30 → 20 (the tuning knob), or lite
   rigs for far people (DollPool tiers already exist in v4).
4. **The Water sea field is built at runtime** (288 ms on desktop). Bake it with `tools/fx/gen_water_field.mjs` for
   `seaRegion()` + `landPoly()` (the sig is printed by `water.info().sig`) and pass `baked` at integration.
5. **World bottom.** v7 `WORLD.height` 5,888 clips the beach's south-east end: the shore at i ≥ 123 lies at
   y ≥ 5,860. Nothing important is placed past i 122.4, but the camera cannot show the sea there. Raising the height
   to 6,016 would show it.
6. **Fireworks read as soft rings and stars** over the bright tropical palette. The game's darker DayClock night helps.
7. **Cosmetic:** the beachfolk generator can give volleyball players a swim ring.
8. `ship_yacht` (9 MiB) is loaded only for the banana-boat tow. It can share the harbour's residency, or the tow can
   be dropped at the half tier.
9. **The lab is a stand-in.** The ground, dolls, fog, boulevard and the polar-swim village coast are lab copies;
   swiftshader timings (≈ 0.6 s per frame) do not reflect GPU cost.

## 11. Integration (file by file; anchors by content; v4 is still changing these files — re-anchor at merge time)

All patches keep v4 behaviour when the module is absent. In the descriptions below, "the module" means `src/beach/**`.

**`src/scenes/Game.js` (P1, P29).** Add `BEACH_MODULE` (from `src/beach/index.js`) to `LATER_MODULES`. ModuleHost
builds it once the gate (harbour ★2) passes and gives it these ports (implement on `gs`):

```js
{
  world: { scene: gs, reveal: (region) => gs.territory.reveal(region) },     // P16: clear fog of 'beach'
  lang: () => Settings.data.lang || 'ko',
  clock: { T: () => gs.clock.T, glow: () => (gs.clock.lightsOn ? Math.min(1, gs.clock.cur.a / 0.45) : 0),
           addLight: (x, y, k, o) => gs.clock.addLight(x, y, k, o) },
  emit: (ev) => gs.later.feed(ev),                                          // GameFeed out
  coins: { add: (n, x, y, fly, tag) => gs.addCoins(n, x, y, fly, tag) },
  ui: { toast: (m, ms) => gs.ui.toast(m, ms), banner: (a, b) => gs.ui.banner(a, b) },
  sites: { offer: (def) => gs.addModuleSite(def.id, def, 'beach') },       // P29; report `built` back with siteId = def.id
  chief: { x: () => gs.player.x, y: () => gs.player.y },
  dolls: { rig: (person, id) => dollRig(gs, person, id), looks: beachLooks },   // see Townfolk.js below
  ground: { bakeHook: (fn, r) => gs.ground.addBakeHook(fn, r), invalidate: (r) => gs.ground.invalidate(r),
            removeHook: (h) => gs.ground.removeBakeHook(h) },
  water: { region: (o) => new Water(gs, Object.assign({ manifest: gs.cache.json.get('manifest_water') }, o)),
           village: () => gs.villageSea, owned: true },                    // P23
  view: { rect: …worldView…, onScreen: (x, y, m) => …, focus: (x, y, ms) => gs.cameraFocus(x, y, ms) },
  sound: { play, at, amb, area: (a) => Audio.setAreaMusic(a), music: (a, s) => Audio.setAreaMusic(a, s),
           group: (k) => Assets.audioGroup(k) },                            // P15
  assets: { fragment: (name, o) => Assets.mergeLate(gs, name, o), defs: () => Assets.m.sprites },
  missions: gs.later.missions && { report: (r) => gs.later.missions.report(r) },
  story: gs.later.story && { happenings: (list, start) => gs.later.story.registerHappenings('beach', list, start) },
  stage: gs.later.stage,                                                    // request/end/busy (kit)
  shops: { growth: true, restock: (id, need) => gs.growth.requestRestock('beach', id, need) },   // P32
  harbor: gs.later.harbor, warehouse: gs.warehouse,
}
```

Feed `host.onFeed` with:
- `harbor:ship` / `harbor:tourists` / `harbor:rare` from harbor_runtime;
- `train` from Neighbours (P14), with `stop: 'beach', line: 'coast'`;
- `built {siteId}` from Site;
- `shopOpen {id, board: 'beach'}` from Growth;
- `delivered` / `veh:freight` from logistics;
- `stage:open`;
- `tap`.

`host.update(dt)` runs every frame. When the chief is far, the view culls itself, while the model keeps simulating
(0.004 ms).

**`src/core/Save.js` (P2).** Add `{ key: 'beach', sanitize: sanitizeBeach }` (from `src/beach/save.js`) to
`LATER_SLICES`. The slice is ≤ 2,048 bytes, and missing or invalid data means a fresh beach.

**`src/core/Assets.js` (P3).** Add `LATE_FRAGMENTS += ['beach', 'beach_bld', 'beachfolk', 'audio5']`. Route
`beachfolk` through `mergeTownfolkFragments` before `TF.init`. The module asks for the files listed in
`FRAGMENTS` (index.js) through `ports.assets.fragment(name, { only })`. `prefetch` loads the sand, palms and
`bgm_beach` when the path site is offered, and `bbld_glow` is requested at dusk only. The water fx sheets
(`fx_swim_ripple`, `fx_splash_*`, `fx_wake_v2*`, `fx_sparkle_water`) come from the existing `water` fragment, and
`ship_yacht` from `ships` (v6).

**`src/core/Residency.js` (P4).** `addArea({ id: 'beach', rect: [5200, 4600, 11264, 5888] })` with the beach
atlases above. Add class `dollBeach` for the `bf_*` pages (ttl 10 s, the usual hysteresis).

**`src/core/Townfolk.js` (P5).**
- `AGE_SHEETS` must match `/^(tf|tf2|bf)_/`.
- Port `animHideHead`, `animFallback` (`swim → float` for ring wearers) and `pickAnim(person, anim)`.
- `sunbatheDirFor` lives in `tools/beachfolk_compose.js`.
- The module only needs this rig contract (implemented on `DollSprite` + `DollPool`):

```js
function dollRig(gs, person, id) {                          // Game.js helper (P1 block)
  const d = new DollSprite(gs, 'bch:' + id, person, -9999, -9999);
  const B = () => TF.T.bases[person.base] || {};
  const pt = (v, dir) => (v ? (MIRROR[dir] ? [-v[0], ...v.slice(1)] : v.slice()) : null);   // as beachfolk_compose._pt
  return {
    get anim() { return d.anim; }, get dir() { return d.baseDir; }, get frame() { return d.frame; },
    show(anim, dir, frame) { const a = TF.pickAnim(person, anim).anim; d.setAnim(a, dir || 'S', frame || 0); if (frame !== undefined) { d.anims.stop(); d.frame = frame; d.dirty = true; } else d.anims.isPlaying = true; },
    at(x, y, depth) { d.setPosition(x, y).setDepth(depth === undefined ? y : depth); },
    visible(on) { d.setVisible(on); }, alpha(a) { d.setAlpha(a); },
    update() {},                                             // DollPool animates materialised dolls
    release() { d.destroy(); },
    layers() { return d.rig ? d.rig.images.length : 0; },
    ballPoint: (anim, dir, i) => { const bp = (B().ballPoint || {})[anim]; return bp ? pt(bp[MIRROR[dir] || dir][i], dir) : null; },
    splashPoint: (dir) => pt((B().splashPoint || {})[MIRROR[dir] || dir], dir),
    lieShadow: (dir) => { const s = (B().lieShadow || {})[MIRROR[dir] || dir]; return s && MIRROR[dir] ? { ...s, center: [-s.center[0], s.center[1]], angleDeg: -s.angleDeg } : s; },
    bodyK: () => B().bodyK || (/^child/.test(person.base) ? 0.7 : 1),
  };
}
```

`beachLooks` = `looksFrom(new Beachfolk(TF.T))` from `src/beach/looks.js` (after `TF.init` has merged beachfolk).

**`src/systems/Ground.js` / `VillageSea.js` (P23).**
- `addBakeHook(fn, rect)` and `invalidate(rect)` are used as they exist in v4. The sand hook paints only the sand
  cells, clipped to `landPoly()`.
- Two conditions are needed:
  - The ground must not paint snow over the warm sea south of `waterJ(i)` for i ≥ 86. Use `WORLD.southSea` (P19) in
    the land polygon of `bakeChunk`, as harbour v6 does.
  - The sea `Water` must be created at `DEPTH.WATER` under the ground.

**`src/systems/DayClock.js`.** Nothing changes. The module uses `addLight`, `lightsOn` and `cur.a` through the
`clock` port.

**`src/systems/Collision.js` (P7).** `seaAt` must include the beach sea, south of `layout.waterJ(i)` for
i ∈ [86, 140] (the existing `WORLD.southSea` + 0.72-cell margin covers it if `southSea` uses the same line).

**`src/systems/Territory.js` (P16).** Region `beach` `[5200, 4600, 11264, 5888]` with fog until the reveal.
`areaOf → 'beach'` drives `Audio.setAreaMusic` (the module also calls `sound.area('beach'|null)` when the chief
enters or leaves).

**`src/systems/Neighbours.js` (P14).** The coast-line train arrival at 해변역 emits
`train {ev:'arrive', stop:'beach', line:'coast', n}`. The station itself (`b_station` at (94.00, 2.03)) belongs to
the harbour or coast-line module; the beach does not draw it.

**`src/systems/Growth.js` (P32).**
- Second founding board `board: 'beach'`, with order, cards and rent from `BALANCE.v7.beach.founding`.
- Shop lots are the row-1 and row-2 positions in `layout.js` (`ROW1`/`ROW2`, with `shop:` ids).
- On open, emit `shopOpen {id, board:'beach'}`.
- Expose `requestRestock('beach', id, need)` so the beach can ask for goods; on arrival, emit
  `delivered {pad:'bshop:'+id, item, n}`.

**`src/data/world.js` (P19).**
- Append `blvd_b` to `WORLD.v4.streets`.
- `WORLD.v7 = { buildings: ROW1/ROW2/GATE, props: PROPS, boardwalk: BOARDWALK, sea: SEA }` from `src/beach/layout.js`.
- `WORLD.width` 11,264 and `height` 5,888 (see Known issues 5).
- Territory rect as above.

**`src/data/balance.js` + `balanceCheck.js` + `strings.js` (P20).**
- Copy `BEACH_TUNING` verbatim as `BALANCE.v7.beach` (Korean comments kept). `beachTuning(BALANCE)` reads it first.
- Ranges for `balanceCheck`: all costs > 0, `rooms` increasing, `0 < wholesale ≤ 1`, `restockBelow` in (0, 1),
  caps ≥ 1.
- The module's strings stay in `src/beach/strings.js` (ko + en) unless the lead prefers the global table.

**`src/core/Audio.js` (P15).** `setAreaMusic('beach')` crossfades to `bgm_beach`. `amb_beach` is driven by the
module, with volume by distance to the shore. One-shots are `sfx_lifeguard_whistle`, `sfx_icecream_bell`,
`sfx_beachball_bounce`, `sfx_splash_*`, `sfx_pool_splash`, `sfx_hotel_bell`, `sfx_wave_*`, `sfx_beach_kids_*` and
`sfx_sand_step_*`.

**`tools/build/pack_pages.py` (P24).** Add `TF_FRAGS += ['beachfolk']`, beach and beach_bld pages (§9.3: beach ~6,
beach_bld ~5, beachfolk ~5), and `bbld_glow` as its own page so it stays lazy.

**Cross-module notes (not v4 files):**
- **harbor_runtime.** `src/harbor/layout.js` `shoreAt(i)` returns `'snowbank'` for i ≥ 90. The harbour Water region
  `{4400, 3330, 5600, 1600}` overlaps the beach region `{7100, 4300, 3800, 1700}` around i 86–94 at the coast. When the
  beach is revealed:
  - the harbour mask should add the land polygon east of the rock point (i ≥ 88), so the beach's `tropical` region
    alone draws that water;
  - or `shoreAt` should return `'sand'` there.
- **story_runtime.** `registerHappenings('beach', BEACH_HAPPENINGS, start)` (P9–P12 descriptors with `toastKo/En`;
  `start(id)` returns false when the beach cannot run it now).
- **missions_bank.** Codes E7 (stand), C11 (choose) and C13 (polar), plus `tap: crab`. `api.places()` and
  `api.findSpot('litter')` give targets.

## 12. 기획자용 요약 (쉬운 말)

- 항구가 ★2가 되면 1분 뒤 관광객이 "따뜻한 바다는 어디예요?" 하고 물어요. 그다음 '해변 가는 길'을 지을 수 있어요.
- 등대를 지나 동쪽으로 걸어가면 눈이 점점 모래로 바뀌어요. 안개가 걷히면서 햇살 해변이 나타나요.
- 해변에 떨어진 미역과 나무 조각 12개를 주우면 해변 문이 생겨요.
- 그다음 순서대로 지어요: 인명구조대(해수욕장 개장) → 해변 주문판(가게 7곳) → 호텔 → 수영장 → 수족관 → 호텔 2·3등급.
- 해변에는 한 번에 60명까지 놀러 오고, 화면에 가까운 30명을 자세히 그려요.
  - 사람들은 수영, 튜브 타기, 일광욕, 모래성 쌓기, 물장구, 배구, 아이스크림 줄 서기, 서핑, 오리배, 카약, 바나나보트를 해요.
- 부표 밖으로 나간 사람이 있으면 구조요원이 호루라기를 불어요. 호루라기는 40초에 한 번까지만 불어요.
- 해변 가게는 마을 물건(빵, 생선구이, 훈제고기, 통조림, 설탕·천 상자 등)을 사 가요. 보내 주면 도매값에 덤을 얹어 줘요.
- 밤에는 가게와 호텔에 불이 켜지고, 호텔 발코니에서 손님이 손을 흔들어요.
- 행사는 네 가지예요: 모래성 대회(촌장님이 1등 성을 골라요), 밤 9시 불꽃놀이, 마을 앞 겨울 바다의 북극곰 수영 대회, 축제 주간.
- 귀여운 일도 일어나요. 꽃게가 발가락을 물고, 파도가 모래성을 무너뜨리고, 비치볼이 바다로 날아가고, 파라솔이 날아가요.
  - 날아가는 파라솔 앞에 서 있으면 촌장님이 잡아요(명성 +2).
- 숫자는 모두 `src/beach/tuning.js`에 한국어 설명과 함께 있어요.
  - 지금 숫자로는 해변이 1분에 약 273코인을 벌어요.
  - 계획표의 목표(1분에 +2,500)보다 많이 적어요. 월세 ×5, 호텔 하루 지출 200~450, 수족관 입장료 20을 추천해요.
