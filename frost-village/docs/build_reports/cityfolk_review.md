# cityfolk — 비평·다듬기 기록

## critiques

[
 {
  "verdict": "polish",
  "summary": "Adversarial art review of cityfolk. I worked read-only on the repo; my scratch folder is S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v8_cityfolk_critic_art.\n\n**What I ran**\n- A 101-character Phaser 3.90 scene in a phone frame (390x844 CSS, DPR 3, so k=1.6 and a 1152x2493 canvas) at zoom 0.6 and 1.0. It mixes 89 cityfolk/townfolk, the chief, the fisherman and 10 villagers. Harness: S/scripts/crowd.mjs; screenshots: S/shots/crowd_z0.6.png, S/shots/crowd_z1.png, S/shots/crowd_z0.6_css.png and S/shots/seq_chase.gif.\n- Frame strips of all 12 new anims in all 8 directions: S/strips/strip_*.png, made by S/scripts/strips.py.\n- A hat x long-hair grid: S/crops/hat_hair_0..3.png.\n- Coverage and fallback statistics for 3000 random residents.\n- Contact-foot stride tracking.\n- Tint clamping.\n- Atlas area split by anim.\n- I re-ran parity and --jsgen. Both pass: 1200/1200 draw lists match, and 0 core frames are missing.\n\n**What already works**\n- At zoom 1.0 the crowd is charming and sits naturally next to the villagers and the chief.\n- The firefighter, police officer, burglar and a generic hard-hat worker all read at 0.6x.\n- The burglar is cute, not scary.\n- Payload is confirmed at 6.84 MB. GPU memory is confirmed at 85.1 MiB.\n\n**What blocks shipping to the designer**\n- Integration traps against the real v4 runtime:\n  - The packed townfolk pages drop carry_walk. 96% of residents fall back carry_box -> carry_walk, so in game they would lose their bodies.\n  - The 85 MiB load is one indivisible group. Every sheet mixes all anims, so it cannot be paged per incident under the 256 MiB budget.\n- Most residents cannot play the story beats the designer asked for:\n  - Only 19% can flee; 26% walk calmly away from a fire with a panic face.\n  - Only 3% can fight and 3-4% can play arrested_walk.\n  - About 26% of residents cannot play any crowd anim.\n- About half the jobs do not read at 0.6x. The bank teller (navy waistcoat over a white puff-sleeved blouse with a bow tie) is a clear \"kindergarten uniform\" risk, and the delivery driver and warehouse worker read as random residents.\n- Animation and layering errors:\n  - The sweep broom looks like a wooden spoon and floats at hip height in E.\n  - The hose in S/SE is a disconnected red tab.\n  - The burglar's sack covers his face in flee SE/E/SW/W.\n  - Ponytails and twin-tail ties poke out through the tops of every full job hat.\n  - Angry/shout blush turns glasses into red glowing eyes.\n  - Run reads like walk from S/N and slides at the game's run speeds.\n\nNone of this needs a rework of the pipeline; it is preset, palette, part and pack-level polish plus a manifest fix.\n\n**Not covered by this job**\nThe user's actual latest request is still open: buildings can't be deleted in the newly opened area, existing buildings show as inactive with \"no residents\", the starting area should widen to the left, and they want a town hall and a big restaurant. That needs src/** and town-art work by other agents; this art review does not address it.",
  "issues": [
   {
    "severity": "high",
    "area": "merge/runtime: carry_box fallback",
    "problem": "carry_box falls back to carry_walk, an anim the real v4 runtime deliberately does not load. The packed townfolk pages drop carry_walk and the game's DollSprite skips it. In game, 96% of residents asked to carry a box would draw only their head plus whatever cityfolk pieces exist, i.e. a floating head. The mover and warehouse_worker presets also promise carry_walk, and about 2% of cityfolk atlas area is carry_walk frames the runtime never uses.",
    "fix": "Set cityfolk.animFallback.carry_box = ['walk'] and let the game show its own head-carry (Character). Alternatively, give pickAnim(person, anim, {has}) a runtime availability predicate so it skips anims whose frames are not resident. Remove carry_walk from the cf_presets promises and from CAST3, which saves about 1.7 MiB. Add a check in cf_check that every animFallback target appears in pack_pages' kept anims.",
    "evidence": "tools/build/pack_pages.py:52 (TF_DROP_ANIMS = {'carry_walk'}); src/core/Townfolk.js:332 (\"carry_walk: not loaded in v4\"); assets/_packed/index.json reports 120 to 1192 frames dropped per tf sheet; tools/blender/cf_presets.py:272 ('carry_box': ['carry_walk','walk']). My 3000-resident run: carry_box -> carry_walk 96%, carry_box 4%. Atlas area: carry_walk 2%."
   },
   {
    "severity": "high",
    "area": "GPU memory / residency",
    "problem": "The 85.1 MiB of cityfolk can only be loaded all at once. Every one of the 8 sheets mixes run, walk, carry_box, talk and the other anims. Together with townfolk loco (39) and social (48.6), people alone take about 173 MiB of the v4 hard budget of 256 MiB for any view. A fire, a bank visit or a moving day each needs only 30 to 66% of the frames. pack_pages.py only knows the 'townfolk' fragment, so the v4 Residency cannot page cityfolk at all, and there is no half-res tier for zoom below 0.85.",
    "fix": "Re-pack per age group x incident group instead of per base:\n- loco: idle/walk/run/flee + heads\n- fire: spray_hose, shocked, point, phone, think\n- crime: arrested_walk, argue, fight\n- work: carry_box, sweep\n- job-social: talk, wave, happy, sit, sad\nAdd a 0.5-scale half tier like the townfolk loco pages, and add cityfolk (and townfolk2) to TF_FRAGS in pack_pages. Estimated residents per incident: fire about 56 MiB, bank about 31, logistics about 31, down from 85; the half tier quarters that at zoom 0.6.",
    "evidence": "PIL: 22.30 Mpx = 85.1 MiB over 8 sheets. Per-sheet anim split I measured, e.g. cf_adult_slim_0 is run 22%, carry_box 14%, walk 13%, talk 8%; overall run 24, walk 11, carry_box 9, flee 8, talk 7, arrested 6. docs/v4_plan_tech.md section 8.2: hard 256 MiB any view. tools/build/pack_pages.py:62 TF_FRAGS = ['townfolk']."
   },
   {
    "severity": "high",
    "area": "crowd anim coverage (living-city story beats)",
    "problem": "Ordinary residents mostly cannot perform the beats the designer asked for, and the fallbacks look wrong:\n- flee: only 19% of residents. 54% run, and 26% walk calmly away from a burning house with a panic face.\n- fight: 3%. Scuffles of two random residents almost always become argue (71%) or plain talk (26%) inside the dust cloud.\n- arrested_walk 3-4% and carry_box 4%.\n- About 26% of residents fail every crowd anim (run, point, shocked, phone, think, argue) and just stand idle during a fire.\nIn my Phaser scene, 5 of 5 random fleers and 2 of 2 random fighters fell back (S/crowd.log).",
    "fix": "1. Free win: run and flee share identical lower-body images (lowerShare runlegs). Add every lower-body part covered by run to cfCover.flee as frame aliases, and do the same both ways between carry_box and arrested_walk (slowlegs). I measured flee rising from 19.5% to 36.8% and carry_box from 3.7% to 6.5% with zero new pixels.\n2. Make acc_necklace (and satchel/backpack in flee) a 'drop' accessory instead of a blocker.\n3. Render the top 5 run blockers: top_dress, top_bomber, acc_backpack, bot_pleated, plus the necklace drop. Run would then reach about 95%.\n4. Change animFallback.flee to ['run'] only, and if run is impossible use idle with the panic face plus fx_fight-style dust, never a calm walk.\n5. Document that the game should use fx_fight_cloud simple mode (which bakes in both fighters) whenever either resident cannot fight.",
    "evidence": "S/scripts coverage run on 3000 residents: run 74%/walk 26%; flee 19%/run 54%/walk 26%; fight 3%; arrested_walk 3%; carry_box 4%; argue, point, think, shocked and phone all 74%. Run blockers: acc_necklace 181, top_dress 145, top_bomber 125, acc_backpack 122, bot_pleated 101 (out of 752 blocked). Flee is missing bot_skirt, bot_tights, bot_longskirt, bot_overalls, shoe_furboots and shoe_rubber even though run covers them (cfCover for adult_slim). S/crowd.log shows the fallbacks."
   },
   {
    "severity": "high",
    "area": "bank_teller look ('kindergarten uniform')",
    "problem": "The teller is a navy, green or brown waistcoat cut like a flared pinafore, over a puff-sleeved white blouse with a bow tie and white cuffs, on a chibi body. It reads as a school or kindergarten uniform, which is exactly what the designer complained about with the fisherman. The green eyeshade, the only bank cue, appears on just 55% of tellers; all 3 tellers in docs/previews/cityfolk_jobs.png lack it.",
    "fix": "- Cut the waistcoat short and pointed at the waist so the trousers or skirt break clearly.\n- Use a pale-blue pinstripe or grey shirt instead of a white puff blouse.\n- Make the sleeve garters a contrasting red or brass.\n- Add a name badge, a pen behind the ear or a coin-counter visor.\n- Set the acc_visor hatChance to 1.0.\n- Avoid the navy/white combination; use bottle green or burgundy with a brass trim.",
    "evidence": "S/crops/detective_teller_3x.png (columns 4-5); S/crops/z06_lineup_device2x.png (row 2, 6th character); tools/blender/cf_presets.py:125 hatChance 0.55; docs/기획서_v4_이웃마을.md:52 (어부: 유치원 우비 느낌)."
   },
   {
    "severity": "medium",
    "area": "job readability at 0.6x (warehouse, delivery, forklift/construction/demolition, reporter, mover, banker)",
    "problem": "In the device-pixel lineup at zoom 0.6, only the firefighter, police officer, burglar and a generic hard-hat worker read at a glance.\n- warehouse_worker: a plain work jacket, sometimes a beanie, no gear. Reads as a random resident (the long-haired one looks like a schoolgirl in a duffle coat).\n- delivery_driver: brown polo plus brown cap (cap colour '=top') on darker skin becomes a brown blob. The logo is 24 px on the cap and 11 px on the polo.\n- forklift_driver, construction_worker and demolition_worker: all are hard hat plus orange or lime hi-vis, and cannot be told apart.\n- reporter: the camera (about 18x29 px including the strap) and the 41-px notepad vanish. The notepad is also suppressed in 5 of its 7 signature anims.\n- mover: red beanie, green sweater and red overalls reads as a Christmas elf; a cream sweater with a black brace reads as the burglar's stripes.\n- banker: a young banker with a bob and a navy suit with a red tie reads as a Korean school uniform; twin-tails with ribbons appear in 1.25% of bankers.",
    "fix": "- warehouse: a company hi-vis tabard or apron in the logistics brand colour, plus a hand scanner or lanyard.\n- delivery: drop brown (#7A4A2A) from its palette; use the cap in top2 contrast; make the logo at least 4x bigger, or add a parcel satchel.\n- forklift: a bump cap with ear defenders instead of a hard hat.\n- demolition: an orange hard hat with face shield plus dust mask, and a sledgehammer prop.\n- construction: keep the yellow hard hat with the lime jacket.\n- reporter: a fedora with a PRESS card, a bigger camera with a flash unit, and a press armband.\n- mover: exclude the cream sweater and the red-beanie-plus-green-sweater combo; make the brace a bright contrasting colour.\n- banker: restrict hair to grown-up styles (no twintails or ribbons) and raise the elder and glasses weights.",
    "evidence": "S/crops/z06_lineup_device2x.png and S/crops/z06_css_glance_2x.png (zoom 0.6, phone pixels and CSS size); S/crops/faces_jobs_3x.png (delivery seed 3, warehouse seed 2); docs/previews/cityfolk_jobs.png; prop sizes from tf.src: acc_camera 155 px, held_notepad 41 px, hat_delivery_cap.logo 24 px, top_delivery_polo.logo 11 px."
   },
   {
    "severity": "medium",
    "area": "layer order: hair through full hats",
    "problem": "The ponytail's back and tie subs are noclip. Under every full hat, the tie and root show as a brown knob above the crown in S, a loop above the brim in SE, and a ponytail arcing out of the hat top in run E. Twin-tail ties poke over the brim too. This affects the new hat_fire_helmet, hat_burglar_beanie, hat_delivery_cap and hat_deerstalker as well as hat_police and hat_hardhat. It is visible at 0.6x on the police officer in my lineup and on the detective's think E frames. Frequency per preset: about 13% of firefighters, 8% of police, 9% of burglars and 6% of detectives.",
    "fix": "Either add exclude rules for ponytail, ponytail_long and twintails with each full job hat, or render the back and tie subs with a '~hat' variant that lowers the root below the brim (drop noclip under hats). Re-run the grid S/scripts/hathair.py as a regression image.",
    "evidence": "S/crops/hat_hair_0.png, hat_hair_1.png and hat_hair_2.png (rows ponytail / ponytail_long / twintails); S/crops/z06_lineup_device2x.png (police cap knob); S/crops/social4_sig.png (detective E); assets/townfolk manifest hair_ponytail subs back/tie noclip:true; preset statistics from the 400-person sample."
   },
   {
    "severity": "medium",
    "area": "sweep anim / held_broom",
    "problem": "The broom reads as a wooden spoon or lollipop: a thin stick with a small orange oval head. The ping-pong travel is about 10 px. In E the bristles never reach the snow: sweepPoint E has y = -13.6 to -17.8, i.e. 14-18 px above the feet. Because held_broom has a constant z of 45.8, the head is drawn in front of the coat at hip height while it is meant to be on the far side.",
    "fix": "- Model a push-broom or besom with straw-yellow bristles at least 10 px wide and darker binding.\n- Sweep in front of and beside the near foot, so sweepPoint y is about 0 to +4 in E and SE.\n- Use a per-direction z (behind the legs when on the far side) or hold out the body.\n- Widen the arc to at least 16 px and add a 1-px lift at the ends.",
    "evidence": "S/crops/sweep_E_points_4x.png (magenta = sweepPoint); S/crops/sweep_sig_2x.png; manifest bases.adult_slim.sweepPoint.sweep.E; cf_anim.py:441-452 p_sweep."
   },
   {
    "severity": "medium",
    "area": "spray_hose S/SE hose line",
    "problem": "In S and SE the hose 'line' sub is a short red tab hanging vertically from the belt. It is not connected to the nozzle or the ground, so it reads as a red necktie or tongue. Only E and NE show the nice hose lying on the snow. In S the grey nozzle on the tan coat with tan gloves almost disappears.",
    "fix": "In S and SE, render the line from the nozzle tail down past the hip to the ground and trailing back, as E and NE do. Give the nozzle brass or black contrast, and keep the gloves darker than the coat (drop #A88A68 from the firefighter hands palette).",
    "evidence": "S/crops/spray_S_SE_zoom4x.png; S/crops/spray_hose_sig_2x.png; presets.firefighter colors.hands includes #A88A68."
   },
   {
    "severity": "medium",
    "area": "burglar flee / arrested_walk readability",
    "problem": "In flee SE, E, SW and W, the loot sack sits in front of the lower face, so the eye mask, panic face and the 'over the shoulder' idea are all lost; it looks like he is eating a bun. On darker skin tones the black eye mask merges with the face. With the low docker beanie and the head-down arrested_walk, the face becomes a dark blob with two pink cheeks.",
    "fix": "- Put the sack over the far shoulder, behind the head in SE and E (z below head), or swing it low at the side.\n- Give the mask a 1-px light rim and white eye holes, or a mid-tone navy mask with a highlight.\n- Raise the beanie brim 2-3 px.\n- In arrested_walk, tilt the head down less in S and SE.",
    "evidence": "S/crops/flee_burglar_SE_E_3x.png; S/crops/flee_burglar_8dirs_1x.png; S/crops/arrested_burglar_S_SE_4x.png; S/crops/faces_jobs_3x.png (columns 3-4); S/crops/z1_chase.png (burglar fleeing W)."
   },
   {
    "severity": "medium",
    "area": "run timing / foot sliding",
    "problem": "The run reads like a walk in S and N: frame-to-frame motion is lower than walk's, and the body bobs 3-4 px against walk's 3-5. The legs use walk's model with amplitude 42 degrees at 14 fps, while the villager run uses 50 degrees at 16 fps. Contact-foot tracking in E gives natural ground speeds of about 49 px/s for walk, 79 for run and 30 for carry_box (arrested_walk about 27). The game moves villager runners at 150 px/s (balance runSpeed) and TownSim runs at 1.25-1.4x of 60-90 px/s, so cityfolk runners would slide by up to about 1.9x. The manifest gives the game no speed hint.",
    "fix": "Raise run to 16 fps with amplitude 48-50 degrees, a real 6-8 px flight bob and wider elbows in S and N. Publish groundSpeed (px/s per anim, per base and per direction class) in the manifest so the game scales fps to its movement speed, or moves at the documented speed.",
    "evidence": "S/crops/run_vs_walk_vs_villager.png; motion table (S/scripts/motion.py): police S diff run 3.48 vs walk 3.93, bob 3 vs 3; contact rows walk E x 74->53.5 over 5 frames at 12 fps, run 75.5->53 over 4 frames at 14 fps; cf_anim.py:177 amp 42; villagers manifest run fps 16; src/data/balance.js:172 runSpeed 150."
   },
   {
    "severity": "medium",
    "area": "merge compatibility with the live runtime and beachfolk",
    "problem": "1. Parity only proves tools/cityfolk_compose.js against the Python version. The game's own runtime (src/core/Townfolk.js) still has TOWNFOLK2=false and its own layersInto, and cityfolk requires townfolk2, so no runtime path exists yet.\n2. The beachfolk compositor, polished in parallel, now has animHideHead, headHidden and a canonical partPlays rule. Cityfolk.layers and canPlay ignore animHideHead (hats would be drawn on swimmers once the new beachfolk manifest lands). partPlays treats parts without an 'anims' key as playable in all v4+v5 anims, which is wrong for cityfolk parts.\n3. The Python tooling auto-loads assets/beachfolk and crashed with FileNotFoundError on bf_child_slim_0.json while beachfolk was mid-repack during this review.",
    "fix": "- Import headHidden and partPlays from beachfolk_compose.js and use them in Cityfolk.layers and canPlay, or delegate beach anims (animFragment === 'beachfolk') to Beachfolk.layers.\n- Give cityfolk parts an explicit per-base anims list (from cfCover) or a 'fragment: cityfolk' tag that partPlays respects.\n- Guard fragment loading so an incomplete fragment folder is skipped with a warning.\n- Hand the integrator a port plan: add TOWNFOLK2 and cityfolk to src Townfolk.layersInto with a parity test against tools/cityfolk_compose.js.",
    "evidence": "src/core/Townfolk.js:246 TOWNFOLK2 = false; tools/beachfolk_compose.js:21, 49-60 and 104 (animHideHead, partPlays, headHidden); tools/cityfolk_compose.js:123-238 (no animHideHead); the FileNotFoundError traceback from Cityfolk.from_assets() during this review."
   },
   {
    "severity": "medium",
    "area": "faces: angry/shout with glasses",
    "problem": "The angry and shout cheek flush sits inside the glasses lenses. Anyone wearing glasses gets red glowing eyes, which is creepy for a family audience. This is common because glasses are frequent on bankers (50%), reporters (45%) and residents. A related minor artefact: the angry brow peeks through the fringe parting like a scar.",
    "fix": "Move the flush 2-3 px lower and outward, below the lens rim, or have the glasses layer mask the flush, and lower its saturation. Clip the angry brow under the hair (z 63 is already below the hair; trim the brow shape that reaches above the fringe line).",
    "evidence": "S/crops/angry_glasses_6x.png; S/crops/faces_new_exprs_3x.png (rows 2-3, columns angry and shout)."
   },
   {
    "severity": "medium",
    "area": "hat_deerstalker",
    "problem": "The bold hat2 grid of latitude and longitude lines makes the deerstalker read as a globe, basketball or waffle cage. The front and back peaks and the tied ear flaps, which identify a deerstalker, are barely visible at 1x, so the detective often reads as 'man in a coat'.",
    "fix": "Use a subtle low-contrast tweed check with small cells (hat2 within about 15% of the hat value), exaggerate the front and back peaks, and add a visible bow on top. Alternatively give the detective a magnifying glass prop in think and point.",
    "evidence": "S/crops/hat_hair_2.png (right half); S/crops/detective_teller_3x.png (columns 1-3); docs/previews/cityfolk_jobs.png (detective row)."
   },
   {
    "severity": "low",
    "area": "anim loops: shocked / spray_hose / think",
    "problem": "- shocked uses keys [0,1,1,1] at 8 fps, looped, so the jolt repeats every 0.5 s and looks like hiccups.\n- spray_hose uses [0,1,0,1] at 10 fps with 0.4-0.9 px nozzle motion, a 5 Hz sub-pixel shimmer rather than recoil.\n- think at 3 fps moves the head every frame, which looks choppy.",
    "fix": "shocked: a one-shot intro jolt then hold, via loopFrom: 1 or separate shocked_in and shocked_hold. spray_hose: either hold still or use a 2-3 px recoil at 6 fps. think: 6 fps with eased head keys.",
    "evidence": "tools/blender/cf_anim.py:75 ('shocked': [0, 1, 1, 1]) and :78 ('spray_hose': [0, 1, 0, 1]); manifest anims fps; nozzlePoint spray_hose E [33.3,-28.5] vs [32.8,-28.8]."
   },
   {
    "severity": "low",
    "area": "palette / tint clamping / small look notes",
    "problem": "- Whites clamp against tintRef #E6E6E6 by up to 16.6/255: burglar stripes base, shirts, white hard hats and white helmets come out greyish on snow; hi-vis lime loses 9.7/255 on G.\n- Black fire helmets (#2A2A30) read as police or a pirate hat.\n- The police jacket's dark fur hem reads as a rubber ring or tutu at 1x.\n- The 56-colour dither makes cityfolk grainier than the villagers beside them (same trade-off as townfolk).",
    "fix": "- Render white and hi-vis subs untinted, or with a #FFFFFF tintRef per slot.\n- Restrict fire helmets to red and yellow.\n- Give top_police_v2 a straight navy hem without fur.\n- Optionally use a 64-colour palette for the jobs sheets only (+~3% payload).",
    "evidence": "Tint computation (S/scripts inline): #F7F5F0 clamps 16.6, #F4F1EA 13.7, #D8F040 9.7; S/crops/faces_jobs_3x.png (black helmet); S/crops/z1_chase.png (police hem); S/crops/z06_lineup_device2x.png (grain next to the villagers)."
   }
  ],
  "keep": [
   "Firefighter outfit: tan or navy turnout coat with lime and silver bands, the air tank, the big comb helmet with brass front, and the hose rope lying on the snow in E and NE. It reads instantly at 0.6x and is charming next to the villagers (S/crops/z1_fire.png).",
   "Burglar concept: stripes, docker beanie, eye mask and loot sack. Cute, comic, not scary (S/crops/z06_lineup_device2x.png).",
   "Police: navy cap plus lime hi-vis vest reads at a glance, and the arrested_walk pairing with a walking officer works (S/crops/z1_chase.png).",
   "New faces shocked, panic and sheepish: clear and cute on every face set (S/crops/faces_new_exprs_3x.png).",
   "The pickAnim, animFallback and fallbackFace mechanism, and setItems(false) with boxPoint for carrying real logistics items.",
   "nozzlePoint, boxPoint and sweepPoint data, including the pre-scaled round-base tables and correct mirroring in _pt().",
   "mergeTownfolkFragments with the redefinition guard. Python/JS parity re-verified at 1200/1200, and --jsgen at 0 core-frame misses and 0 promise failures.",
   "lowerShare aliasing (840 pairs) and the palette anchors that rescued the red hose and hi-vis trims.",
   "follow / zfrontFollow on sleeve bands, garters, cuffs, the phone and the loot sack.",
   "Overall scale, outline and lighting consistency with the townfolk, villagers and chief at zoom 1.0 (S/shots/crowd_z1.png), and the builder's staged scene docs/previews/cityfolk_crowd.png.",
   "Payload of 6.84 MB under the 7 MB limit."
  ]
 }
]

## polish

# cityfolk build report (polish pass)

The cityfolk fragment (CONTRACT_V8 §AD) has been polished against the art critic's review. Every high and medium issue reproduced. All were fixed, except a few props listed as "won't fix" in the issue table below, each with its reason. All tests pass on the re-packed fragment:

- **Checker (`cf_check.py`):** 0 errors. It reports 5 warnings, all about the reporter's notepad, which the body hides in some E and NE frames; this is unchanged. New checks cover:
  - no `animFallback` target is an anim the v4 runtime drops (`carry_walk`, read from `tools/build/pack_pages.py`);
  - each part's `anims` list equals `cfCover`;
  - `groundSpeed` is present;
  - each atlas belongs to exactly one page.
- **Python/JS parity:** 1200 of 1200 draw lists are identical, with 0 `pickAnim` / `canPlay` mismatches and 0 point mismatches. All four fragments were merged: townfolk, townfolk2, beachfolk and cityfolk. The generic merge of v4 + v5 still gives exactly `mergeTownfolk`.
- **JS generator (`--jsgen`):**
  - 1690 preset people keep every promise of their preset.
  - It checked 4,775,234 layer frames and found 0 missing head, face or brow frames.
  - For 3000 random residents:
    - every anim `pickAnim()` returns is playable;
    - **0 fall back to `carry_walk`**;
    - **0 flee with a calm walk**.
- **Phaser 3.90 test:** 46 people and 794 sprites, with townfolk, townfolk2, beachfolk and cityfolk loaded together (37 textures, 16 texture units). It runs at **2 draw calls per frame** and checked 218,316 layer frames: 0 missing frames, 0 page errors.
- **Phaser incident test (`--incident fire`):** only the fire pages are loaded, **59.8 MiB of cityfolk instead of 88.2**. The scene has 20 people, runs at 1 draw call per frame and has 0 missing frames. Anims whose page is not loaded fall back through `pickAnim({has})`.
- **beachfolk cross-check:** `Beachfolk` and `Cityfolk` were compared on beach people over 9000 checks: 0 `canPlay` and 0 draw-list mismatches.

**Payload and GPU:**
- **Payload:** 6.96 MB (limit 7 MB).
- **GPU:** all pages together take 88.2 MiB in 10 atlases. They are now split into pages, so a scene only loads what its incident needs, 36.7 to 67.0 MiB; see *GPU memory*.

The game merges this fragment after `assets/townfolk` and `assets/townfolk2`, with beachfolk in between or not loaded, using `mergeTownfolkFragments()` in `tools/cityfolk_compose.js`.

**Your latest request is still open.** This job did not cover deleting buildings in a newly opened area, existing buildings shown as inactive with "no residents", widening the starting area to the left, or the town hall and big restaurant. That is game code under `src/**`, owned by the v4 code agents, plus town art. Nothing outside the cityfolk files was touched.

## Critic issues → result
| # | Sev | Issue | Result | What was done / why not |
|---|---|---|---|---|
| 1 | high | carry_box falls back to `carry_walk`, which v4 never loads (floating heads) | **fixed** | `animFallback.carry_box = ['walk']`.<br>`carry_walk` removed from CAST3, the promises and the old-anim cast (saves its frames).<br>`pickAnim(person, anim, {has})` skips anims the runtime cannot show.<br>`cf_check` reads `TF_DROP_ANIMS` from pack_pages and fails if any fallback names one.<br>jsgen: 0 carry_walk picks in 3000 residents. |
| 2 | high | 85 MiB in one group that can't be split; no paging, no half tier | **fixed (cityfolk side)**; half tier and pack_pages hookup **won't fix here** | Re-packed into 7 anim pages plus a head page (`cfPages`), with one `frameAtlasExt` entry per page. `cfPages.incidents` lists each scene's pages:<br>• fire 59.8 MiB<br>• crime 67.0 MiB<br>• rebuild 40.0 MiB<br>• bank 36.9 MiB<br>• logistics 36.7 MiB<br>The `--incident fire` Phaser test proves it.<br>The half-res tier and `TF_FRAGS` live in `tools/build/pack_pages.py`, which belongs to the v4-B agent; see the port plan. |
| 3 | high | Most residents can't flee, fight or play the crowd anims; 26 % flee with a calm walk | **fixed** for run, flee and crowd; **won't fix** the work anims fully | Run and crowd anims went from 74 % to 94 %.<br>Flee went from 19 % to 75 %; another 21 % run with the panic face, 5 % stand in panic, and **0 % walk**.<br>The necklace (and the satchel and backpack in the work and flee anims) are drop accessories now.<br>The run blockers were rendered: dress, adult bomber, pleated skirt, backpack.<br>Flee gets every run bottom and shoe as free aliases.<br>fight, arrested_walk and carry_box are at 5-6 % (were 3-4 %). Each everyday outfit costs ~1-2 MiB per anim, and the payload is at 6.96 / 7 MB. Use the presets, and `fx_fight_cloud` simple mode for a scuffle (merge rule 8). |
| 4 | high | Bank teller reads as a kindergarten uniform; visor on 55 % | **fixed** | Short waistcoat with pointed fronts, cut above the waistband, in bottle green, burgundy or brown.<br>Pale-blue, grey or cream shirt.<br>Red sleeve garters, a white name badge with a red stripe and a brass frame, a black bow tie and a pen.<br>Visor on 100 %, grown-up hair, grey trousers or skirt.<br>Re-rendered. |
| 5 | med | Job presets don't read at 0.6× | **fixed**, except 3 props **won't fix** | **Warehouse:** sky-blue logistics tabard (`det_lgx_vest`) with a yellow band and a parcel logo, plus brand-colour caps.<br>**Delivery:** no brown; the cap uses the polo's contrast colour. The cap logo is about 2.8× its old area, the chest logo sits on a white patch about 7× its old area, and there is a bigger patch on the back.<br>**Forklift:** `hat_bump_cap` with red ear defenders and an orange hi-vis.<br>**Demolition:** orange `hat_demo_helmet` with a face shield, plus `acc_dust_mask` (70 %).<br>**Construction:** keeps the yellow hard hat and lime jacket.<br>**Reporter:** `hat_press_fedora` with a PRESS card, and a bigger camera with a flash.<br>**Mover:** no cream sweater, no red hat, a bright brace.<br>**Banker:** grown-up hair, more elders, glasses 65 %.<br>Not added: the sledgehammer, scanner/lanyard and press armband. Each would be a prop drawn in every anim of its job (~1 MiB each) with the payload at the limit; the new hats carry the job instead. |
| 6 | med | Ponytail and twin-tail ties poke through full job hats | **fixed** | Generator excludes: tied hair × job hats. The job hats are the `jobhat` tag (fire helmet, burglar beanie, delivery cap, deerstalker, the 3 new hats), plus police, hard hat, station, postal and fedora. Both generators apply them (parity). |
| 7 | med | Broom looks like a spoon and floats at hip height in E | **fixed** | Korean besom: the straw fan is 2.2× longer and fuller, with 9 twig streaks, dark binding and a thicker handle.<br>Wider back-and-forth sweeping arc, with a lift at both ends.<br>The broom is on the near side in every rendered dir, so no per-dir z is needed.<br>`sweepPoint` E is now y +7..+16, in front of the feet (was −18..−14). |
| 8 | med | Hose in S/SE is a red tab hanging from the belt | **fixed** | The line now runs from the nozzle tail past the hip to the snow and trails back, in every dir.<br>Black nozzle with a brass band.<br>Gloves use a dark `firegloves` palette. |
| 9 | med | Burglar's sack covers his face in flee; mask merges on dark skin | **fixed**; arrested head tilt **not reproduced** | The sack has a flee-only sub over the far shoulder, behind the head, and hangs low at his side elsewhere.<br>Navy mask with light rims and a slimmer band; the beanie brim is raised.<br>arrested_walk uses the same head pose as walk. The "dark blob" came from the mask and beanie, which are fixed. |
| 10 | med | Run reads like a walk; feet slide at game speeds | **fixed** | New keyed cartoon run:<br>• hips placed so the planted foot stays on the ground;<br>• 16 fps;<br>• hips ±42°, knee up to 112°;<br>• 5-7 px flight bob (adult);<br>• arms pump opposite the legs, with wider elbows.<br>Flee shares the legs.<br>`bases[b].groundSpeed[anim][dir]` is published in px/s; adult E: run 131.8, walk 62.1. |
| 11 | med | Merge with the live runtime and beachfolk | **fixed (tools)**; editing `src/core/Townfolk.js` **won't fix** (not owned) | Both compositors import `partPlays` / `headHidden` from beachfolk_compose.<br>Cityfolk parts carry per-base `anims` lists, and worn hand items carry `noAnims`.<br>The Python loader skips incomplete fragment folders with a warning.<br>Port plan for the integrator below. |
| — | (summary) | Angry/shout blush turns glasses into red eyes | **fixed** | New `cheek_angry` flush, lower than the glasses line, for angry and shout on every face set. |

Also in this pass: `cityfolk_proof.png` now shows the runtime fallback, labelled, instead of a blank cell. I also found a stray-pixel bug in townfolk / townfolk2; it is not ours and is not fixed here, see *Known issues*.

## Paths (under `frost-village/`)
- **Assets:** `assets/cityfolk/` holds `manifest.json` (block `cityfolk`) and 10 atlases in the `tfatlas` v1 format. Together they are 23.12 Mpx and hold 24,696 frames plus 8,552 aliases. Each atlas holds one page:

  | Atlas | Size |
  |---|---|
  | `cf_head_0` | 2048×504 |
  | `cf_loco_0` | 2048×1648 |
  | `cf_rush_0` | 2048×1472 |
  | `cf_rush_1` | 2048×1452 |
  | `cf_rush_2` | 2048×916 |
  | `cf_crowd_0` | 2048×1496 |
  | `cf_scuffle_0` | 2048×1088 |
  | `cf_work_0` | 2048×1472 |
  | `cf_fire_0` | 2048×164 |
  | `cf_social_0` | 2048×1076 |
- **Scripts:**
  - `tools/blender/cf_anim.py`, `cf_parts.py`, `cf_presets.py`, `cf_render.py`, `cf_pack.py`, `cf_check.py`, `cf_preview.py`.
  - They import `tf_*` and `tf2_*` and never edit them.
- **Compositors:**
  - `tools/cityfolk_compose.py` is the Python reference.
  - `tools/cityfolk_compose.js` is the JS port. It imports `townfolk_compose.js`, `townfolk2_compose.js` and `beachfolk_compose.js` (`partPlays`, `headHidden`) unchanged.
- **Test:** `tools/test/cityfolk_phaser.mjs` has four modes: the Phaser scene (no flag), `--parity cases.json`, `--jsgen` and `--incident fire`.
- **Render cache:** `/tmp/fv_cache/cityfolk`, about 320 MB.
  - `old_pass1*` (~105 MB) holds first-pass layer backups and can be deleted.
  - `old_assets` holds the first-pass atlases used by `cityfolk_polish.png`.

## New anims (all 6 bases; round bases reuse the slim renders, as in townfolk)
| Anim | Frames, fps | Dirs | What it does |
|---|---|---|---|
| `run` | 8, **16**, loop | S SE E NE N | Keyed cartoon run with real flight frames, a forward lean and arms pumping opposite the legs. Police chases, rushing to a fire, kids playing. |
| `flee` | 8, **16**, loop | S SE E NE N | Same legs as run (shared images), both arms up, `panic` face. The burglar carries the loot sack over his far shoulder. |
| `arrested_walk` | 8, 9, loop | S SE E NE N | Hands behind the back, head down, `sheepish` face, short shuffling steps. |
| `carry_box` | 8, 10, loop | S SE E NE N | Hugs a big cardboard box (`held_box`). Gives `boxPoint`. |
| `argue` | 6, 8, loop | S SE E | Wagging finger (`hand_point`), a stomp, `angry` face. |
| `fight` | 6, 12, loop | S SE E | Comic windmill flail with little hops, made for use inside `fx_fight_cloud_back` / `_front`. |
| `point` | 6, 8, loop | S SE E | Raise, point, jab. |
| `think` | 4, 3, loop | S SE E | Taps the chin, `thinking` face. |
| `shocked` | 4, 8, loop | S SE E | A jolt, then mittens on the cheeks. |
| `phone` | 4, 5, loop | S SE E | Phone at the ear (`held_phone`), free hand gesturing. |
| `sweep` | 6, 8, loop | S SE E | Besom swept back and forth in a wide arc in front of the near foot, lifting at the ends. Gives `sweepPoint`. |
| `spray_hose` | 4, 10, loop | S SE E NE | Braced stance, black and brass nozzle in both mittens. The hose runs past the hip to the snow and trails back. `determined` face. Gives `nozzlePoint`. |

- SW, W and NW are mirrored. `CityfolkSprite.play()` falls back automatically (rule 8).
- **Faces:** 7 expressions on every head pose and face set: `shocked`, `panic`, `angry`, `shout`, `thinking`, `determined`, `sheepish`, plus an `angry` brow. Angry and shout use the lower `cheek_angry` flush, so glasses stay clear.

### Anim points and speeds (manifest `bases[b]`; mirrored dirs negate x and the x direction)
- **`nozzlePoint.spray_hose[dir][i]`** = `[x, y, ux, uy]`: the nozzle tip in px from the anchor, plus the unit screen direction of the water. Start fx_city `fx_hose_rope` / `fx_hose_stream` there.
- **`boxPoint.carry_box[dir][i]`** = `[cx, cy, bx, by]`: the box centre and bottom-centre. For a real logistics item, call `setItems(false)` and draw the item at the bottom-centre:
  - depth = person depth + 0.0045 in S, SE and E;
  - depth = person depth − 0.0001 in NE and N.
- **`sweepPoint.sweep[dir][i]`** = `[x, y]`: where the bristles touch the snow. Puff snow or `fx_demolish_dust` there.
- **`groundSpeed[anim][dir]`** (new): px/s at the anim's fps for walk, run, flee, carry_box and arrested_walk. It is measured from the planted foot, per base and per rendered dir; mirrored dirs use their source dir.
  - Move the sprite at that speed, or scale the fps by `gameSpeed / groundSpeed`.

  | px/s, E | walk | run / flee | carry_box | arrested_walk |
  |---|---|---|---|---|
  | adult_slim | 62.1 | 131.8 | 39.1 | 35.2 |
  | adult_round | 75.8 | 161.1 | 47.7 | 42.9 |
  | child_slim | 53.1 | 79.3 | 35.4 | 31.8 |
  | elder_slim | 40.6 | 74.1 | 28.6 | 25.8 |

  N and S are slower because the iso view foreshortens movement in those directions.

## New parts (29 wearables + 5 anim items, all tinted through the townfolk tint model)
The existing parts are reused: `hat_police`, `det_police`, `hat_hardhat`, `det_hivis`, `hat_fedora`, `hat_beanie`, `hat_cap`, `hat_flatcap`, `hat_beret`, plus the trousers, shoes, sweaters and coats.
- **Fire:**
  - `top_fire_coat`: turnout coat with lime and silver bands.
  - `bot_fire_pants`.
  - `acc_air_tank`.
  - `hat_fire_helmet`: comb ridge, long back brim, leather front shield, lime band.
- **Police:** `top_police_v2`, a winter jacket with a hi-vis vest, patch and radio.
- **Petty thief:**
  - `top_stripes`: the striped shirt, adults only.
  - `acc_eye_mask`: navy domino mask with light rims.
  - `hat_burglar_beanie`: docker beanie with a raised brim.
  - `held_loot_sack`: low at his side in his calm anims, over the far shoulder in flee.
- **Bank:**
  - `top_suit_3pc`: three-piece suit with its own tie and a watch chain.
  - `top_teller_vest`: short pointed waistcoat, pale shirt, red garters, name badge, bow tie and pen.
  - `acc_visor`: green eyeshade.
- **Logistics and moving:**
  - `top_work_jacket`, `acc_gloves`.
  - `det_lgx_vest` (new): sky-blue logistics tabard with a yellow band and a navy parcel logo.
  - `hat_bump_cap` (new): bump cap with red ear defenders.
  - `hat_delivery_cap`, `top_delivery_polo`: bigger parcel logos, on white patches front and back.
  - `bot_mover_overalls`, `acc_back_brace`.
- **Building sites:**
  - `top_hivis_jacket`, `acc_toolbelt`.
  - `hat_demo_helmet` (new): orange helmet with a clear face shield.
  - `acc_dust_mask` (new).
- **Press and detective:**
  - `acc_camera`: bigger, with a flash and a red press tag.
  - `held_notepad`, `top_trench`, `hat_deerstalker`.
  - `hat_press_fedora` (new): fedora with a PRESS card in the band.
- **Anim items** (`animItems`, added for their anim only; `noItems` skips them):
  - `held_box` (carry_box);
  - `held_hose` (spray_hose);
  - `held_broom` (sweep; now a Korean besom);
  - `held_phone` (phone);
  - `hand_point` (point, argue).

**Part metadata (new):**
- Every cityfolk body part carries an `anims` list per base (equal to `cfCover`).
- Worn hand items (sack, notepad) carry `noAnims` for the anims they have no frames in.
- Subs can carry `onlyAnims` / `noAnims`; the sack's `main` and `flee` subs use this.
- `det_tie` stays a children's part in assets/townfolk, so the suit and the waistcoat carry their own ties.

**Palette:** each sheet is reduced to a fixed palette after an anchor pass. Small saturated items (hose, hi-vis, brass, logos, the helmet shield) get anchor pixels so they keep their colour. Bodies use 50 colours and heads 96. The `PALETTE` lines in the pack log list each anchored layer.

## Presets (`generator.presets`)
| Preset (ko) | Outfit | Anims it is guaranteed to play (checker PROMISE + JS generator) |
|---|---|---|
| `firefighter` 소방관 | turnout coat and trousers; helmet (red, yellow or black); air tank; rubber boots; dark gloves; no ponytails | spray_hose, run, point, idle, walk, talk, happy, wave |
| `police_officer` 경찰관 | `top_police_v2`, `hat_police`, `det_police` | run, point, phone, think, walk, talk |
| `detective` 탐정 | trench coat; deerstalker or fedora (adult or elder) | think, point, phone, walk, talk, run |
| `burglar` 좀도둑 | stripes, navy eye mask, docker beanie, loot sack | flee, run, arrested_walk, walk, idle, fight, argue, sad, sit |
| `banker` 은행장 | three-piece suit; grown-up hair; mostly elders; glasses 65 % | walk, talk, think, shocked, phone, sit |
| `bank_teller` 은행 창구 직원 | short teller waistcoat (green, burgundy or brown); pale shirt; visor always; grey trousers or skirt | walk, talk, phone, shocked, idle |
| `warehouse_worker` 물류센터 직원 | work jacket, sky-blue `det_lgx_vest`, gloves, brand-colour beanie or cap | carry_box, walk, sweep, idle, talk, point |
| `forklift_driver` 지게차 기사 | work jacket, overalls, `hat_bump_cap`, orange hi-vis, gloves | carry_box, walk, talk, idle |
| `delivery_driver` 택배 기사 | courier polo (red, teal or green) with a contrasting cap | carry_box, run, walk, phone |
| `mover` 이삿짐 일꾼 | sweater or work jacket, mover overalls, bright back brace, gloves | carry_box, walk, idle, talk |
| `construction_worker` 공사장 인부 | lime hi-vis jacket, yellow hard hat, tool belt | sweep, carry_box, point, walk |
| `demolition_worker` 철거 작업자 | work jacket, orange `hat_demo_helmet`, orange hi-vis, dust mask (70 %), tool belt | sweep, carry_box, point, walk |
| `reporter` 기자 | coat, `hat_press_fedora` (or flat cap or beret), big camera, notepad | run, phone, point, talk, walk, think, shocked |

**Random townsfolk** play the crowd anims in their everyday clothes. These are the jsgen numbers for 3000 residents:

| Anim | Plays it | Otherwise |
|---|---|---|
| run, argue, point, think, shocked, phone | 94 % (was 74 %) | walk / talk / idle with the anim's face |
| flee | 75 % (was 19 %) | run 21 % or idle 5 %, both with the `panic` face; never walk |
| sweep | 11 % | idle |
| carry_box | 6 % | walk |
| arrested_walk | 5 % | walk (sheepish) |
| fight | 5 % | argue (angry) |
| spray_hose | 5 % | idle (determined) |

The bank staff (banker and teller) never run or flee: flee gives idle with the `panic` face, and run gives walk. They play `shocked` and `phone` in a robbery.

## Merge rules (manifest `cityfolk.merge`; implemented in both compositors)
1. **Merge order:** `townfolk` ← `townfolk2` ← (`beachfolk`) ← `cityfolk`, through one generic `mergeTownfolkFragments(man, ...fragments)`. For v4 + v5 it gives exactly `mergeTownfolk`.
   - Concatenate the atlas lists.
   - The Python loader skips a fragment folder that is incomplete or whose requirements are not met, with a warning.
2. **No redefinitions:** `anims`, `timeline`, `headPoses`, `parts`, `z`, `tintRef`, `palettes`, `frameAtlas` and `presets` only add keys. The merge throws on a redefinition.
3. **New frames for existing layers:** `frameAtlasExt` (one entry per page, with a `page` key) routes them to `frameAtlasAnim[anim][layer@base]`. Body frames resolve as `frameAtlasAnim[anim]?.[layer@base] ?? frameAtlas[layer@base]`.
4. **Faces:** `faceExprs` is a union per head pose; `exprBrow` adds entries.
5. **Bases:**
   - `headOffset` gets the new anims and `parts` is a union.
   - `cfCover`, `nozzlePoint`, `boxPoint`, `sweepPoint` and `groundSpeed` are new keys.
6. **Generator:**
   - `presets` and `slotPalette` add entries; `exclude` is concatenated, including the new tied-hair × job-hat rules; `extraSlots` is a union.
   - Unknown generator keys from other fragments are merged generically.
7. **Other top-level keys** are copied; objects are shallow-merged and arrays concatenated: `animItems`, `animFallback`, `fallbackFace`, `cfDrop`, `cfPages`, `cfParts`, `cityfolkAnims`, `lowerShare`.
8. **Draw and play rules (`Cityfolk.layers`, `canPlay`, `pickAnim`):**
   - **Parts with an `anims` list** (beachfolk and cityfolk parts) follow `beachfolk_compose.partPlays`, the canonical rule. Worn hand items are not drawn in their `noAnims`. Subs follow their own `onlyAnims` / `noAnims`.
   - **Hidden head parts** (`beachfolk_compose.headHidden`, e.g. a swimmer's hat) are not drawn, and a hidden full hat no longer squashes the hair.
   - **v4 and v5 parts in a cityfolk anim** need `bases[b].cfCover[anim]`.
   - **`cfDrop[part]`** lists the cityfolk anims where a v4 accessory is simply not drawn; it never blocks the anim. This covers the necklace in all of them, and the satchel and backpack in flee, fight, arrested_walk, carry_box, sweep and spray_hose.
   - **`animItems`** are added unless `noItems` is set.
   - **`pickAnim(person, anim, {has})`** walks `animFallback[anim]` and returns `{anim, face: fallbackFace[anim]}`. `has(anim, person) = false` skips anims the runtime cannot show right now (page not resident). The last resort is idle, else walk.

     | Requested | Falls back to | Face |
     |---|---|---|
     | flee | run → idle | panic |
     | carry_box | walk (never `carry_walk`) | |
     | fight | argue → talk → idle | angry |
     | argue | talk → idle | angry |
     | arrested_walk | walk | sheepish |
     | point | talk → idle | shocked |
     | phone | talk → idle | |
     | think | idle | thinking |
     | shocked | idle | shocked |
     | spray_hose | idle | determined |
     | sweep | idle | |
   - **Scuffles:** when either resident cannot play `fight`, use `fx_fight_cloud` in its simple mode, which draws both fighters itself, instead of two dolls.
9. **Shared lower bodies (`lowerShare`):**
   - run and flee share their legs; 1447 lower-body frame pairs are one rect each.
   - Flee gets every bottom and shoe cast in run as free aliases (`LOWER_PARTNER`).
   - arrested_walk and carry_box share the same leg images, but live on different pages, so they are stored twice.
   - The standing anims share their planted stance.
10. **Pages (`cfPages`):**
    - Every atlas holds one page of `cfPages.groups`, with its anims, atlases, bases and MiB.
    - `cfPages.incidents[name].pages` lists what a scene needs.
    - `Cityfolk.pageOf(anim)` and `pageNeeded(person, anim)` give the page a frame lives in. `pageNeeded` is null when the person draws only from townfolk / townfolk2.

## How the game uses it
```js
import { mergeTownfolkFragments, Cityfolk, CityfolkSprite } from './cityfolk_compose.js';
import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
const man = mergeTownfolkFragments(manTownfolk, manTownfolk2, /* manBeachfolk, */ manCityfolk);
const cf = new Cityfolk(man.townfolk);
const P = man.townfolk.cfPages;
// a fire starts: make P.groups[g].atlases resident for g of P.incidents.fire.pages (Residency), drop them afterwards
const resident = new Set(P.incidents.fire.pages);
const has = (a, p) => { const g = p ? cf.pageNeeded(p, a) : cf.pageOf(a); return !g || resident.has(g); };
const ff = cf.preset('firefighter', rng);                        // or cf.randomPerson(rng) for a resident
const s = new CityfolkSprite(scene, cf, ff, x, y); s.has = has;
s.play('spray_hose', 'NE');                                      // falls back (with a face) if needed
const [nx, ny, ux, uy] = cf.nozzlePoint(ff, s.dir, s.frame);     // aim the fx_city hose
const v = cf.groundSpeed(ff, 'run', 'E');                        // px/s: move at v, or scale fps by speed / v
```
- **Fire (`incidents.fire`):**
  - Firefighters play `spray_hose` with `nozzlePoint` → `fx_hose_rope` / `fx_hose_stream`, and `run` from the truck.
  - The crowd plays `shocked`, `point`, `phone` and `think`.
  - Residents of the burning house play `flee`; nobody is hurt.
- **Crime (`incidents.crime`):**
  - The burglar flees with the sack; police run after him and point.
  - After the catch: `arrested_walk` with an officer walking beside him.
  - Scuffles are two `fight` dolls in `fx_fight_cloud_back` / `_front`, or simple mode (rule 8).
- **Logistics / moving (`incidents.logistics`):**
  - `carry_box` for movers, warehouse crew and couriers.
  - `setItems(false)` + `boxPoint` to carry a real item.
- **Bank (`incidents.bank`):** banker and teller staff the counters (`talk`, `phone`, `think`, `shocked`).
- **Clean-up and rebuild (`incidents.rebuild`):** construction and demolition workers sweep; `sweepPoint` puffs dust.
- **Story network:** reporters `phone`, `run` and `point`; detectives `think`. Any resident can take a story face (`s.setFace('thinking')`).

**Port plan for the integrator (v4 code owns these files):**
1. **Runtime layers:** `src/core/Townfolk.js` still has `TOWNFOLK2 = false` and its own `layersInto`. Either:
   - port `Cityfolk.layers`, `canPlay` and `pickAnim` with `{has}` from `tools/cityfolk_compose.js` into it (that module already imports the townfolk2 and beachfolk rules); or
   - call `tools/cityfolk_compose.js` directly.

   Then run `node tools/test/cityfolk_phaser.mjs --parity` against the ported module.
2. **Packed pages:** add `townfolk2` and `cityfolk` to `TF_FRAGS` in `tools/build/pack_pages.py`, and map each `cfPages` group to a Residency group.
3. **Half tier:** add the 0.5 tier for zoom < 0.85, as for the townfolk loco pages. It quarters every MiB number below.
4. **Speeds:** use `groundSpeed` when moving cityfolk sprites. Villager runners move at 150 px/s: close to the adult round run (161), and 1.1× the adult slim run (132).

## GPU memory and payload
- **Payload:** 6.96 MB (limit 7 MB): 50-colour body sheets, 96-colour heads, dither 0.5, palette anchors.
- **GPU, all pages:** 88.2 MiB (23.12 Mpx) in 10 textures, up from 85.1 MiB.
  - The new coverage renders (run and crowd now reach 94 % of residents) and the 5 new job parts added memory.
  - Dropping the `carry_walk` frames took some back.
- **Pages:**

  | Page | Anims | MiB |
  |---|---|---|
  | head | new hats, masks, faces (loaded with any page) | 3.9 |
  | loco | job outfits in idle / walk | 12.9 |
  | rush | run, flee | 30.0 |
  | crowd | point, think, shocked, phone | 11.7 |
  | scuffle | argue, fight, arrested_walk | 8.5 |
  | work | carry_box, sweep | 11.5 |
  | fire | spray_hose | 1.3 |
  | social | job outfits in talk / wave / happy / sit / sad | 8.4 |
- **Incidents** (what has to be resident):

  | Incident | Pages | MiB |
  |---|---|---|
  | fire | head, loco, rush, crowd, fire | 59.8 |
  | crime | head, loco, rush, crowd, scuffle | 67.0 |
  | rebuild | head, loco, work, crowd | 40.0 |
  | bank | head, loco, social, crowd | 36.9 |
  | logistics | head, loco, work, social | 36.7 |

  With the half tier at zoom 0.6 these drop to about 9-17 MiB.
- **What was traded** (`cf_presets.CAST3`):
  - **core** wardrobe: run and the crowd anims, all ages; flee for adults.
  - **mini**: flee for children and elders, with every run bottom and shoe aliased in for free.
  - **tiny**: arrested_walk, carry_box and fight.
  - The job outfits are only in the anims their jobs need.
  - Left out to stay under 7 MB (about 5 % of residents, who fall back): child bombers, vests and cardigans, and elder overalls.

## Previews (`docs/previews/`)
- **`cityfolk_crowd.png` (1x, + `cityfolk_crowd_2x.png`):** 79 people (33 cityfolk presets, 46 random townsfolk) on a town street around a house fire, staged with the real town, vehicle, civic and fx_city assets. It shows:
  - firefighters aiming hoses from `nozzlePoint`;
  - residents fleeing, and a shocked, pointing and phoning crowd;
  - a police chase, an arrest and a scuffle;
  - movers, sweepers and walkers.
- **`cityfolk_jobs.png`:** every preset × 3 people, as idle S, walk SE, the signature anim and idle N. All 13 signature anims play without fallback.
- **`cityfolk_lineup.png` (new):** a phone-zoom 0.6 lineup in device pixels: 13 presets × 2 plus 8 residents, and the same at CSS size. Every job reads by its hat and colour block.
- **`cityfolk_polish.png` (new):** each critic issue, first pass next to this pass, at 2×. It covers the teller, warehouse, forklift, delivery, demolition, reporter, burglar flee, hose S/SE, sweep, angry-with-glasses and run S.
- **`cityfolk_anims.png`:** the 12 anims on all 6 bases.
- **GIFs:**
  - `cityfolk_run.gif`, `_flee`, `_argue`, `_fight`, `_arrested_walk`, `_point`, `_think`, `_shocked`, `_phone`, `_carry_box`.
  - `_spray_hose`, with a stand-in water arc from `nozzlePoint`.
  - `_sweep`, with a white snow puff at `sweepPoint`.
- **`cityfolk_proof.png`:** full Blender renders next to the layered composites. Over 122 frames, the mean difference is 17.9/255 over the whole silhouette and 14.0/255 inside it; the gap is the ink outline, which only the composites have (townfolk measured 14). Outfit and anim pairs the cast does not cover now show their runtime fallback, labelled "not cast → …".
- **`cityfolk_phaser.png`:** the headless Phaser scene.

## Known issues
- **Work anims for everyday clothes:** fight, arrested_walk and carry_box reach only 5-6 % of random residents, spray_hose 5 % and sweep 11 %.
  - Use the presets (burglar, mover, firefighter and so on).
  - For scuffles, use `fx_fight_cloud` simple mode when either side cannot `fight`.
  - Raising this costs ~1-2 MiB per outfit per anim, and the payload is at the limit.
- **Bank staff** stand in panic instead of fleeing; this is by design, see *Presets*.
- **Waiting on v4 code** (not owned here):
  - the runtime port to `src/core/Townfolk.js`;
  - the `pack_pages` hookup and the half tier.

  Until then the game has no runtime path for cityfolk, and the v4 Residency cannot page it. The page split is ready in the manifest (`cfPages`).
- **Teller at 0.6×:** the burgundy and brown waistcoats with pale sleeves still look a little like a uniform. The visor (100 %) and the name badge make them read as bank staff. Green reads clearest; switch to green only if you still see a school uniform.
- **The reporter's notepad** is hidden by the body in some E and NE frames (the 5 checker warnings). It is still visible in its signature anims, and the camera and press fedora carry the job.
- **arrested_walk and carry_box legs** are the same images on two pages (scuffle and work), so they are stored twice. Sharing them would force both pages to load together.
- **Upstream bug, not cityfolk:** some townfolk / townfolk2 body frames carry a 2-px sliver at the very top of the frame (rect `oy = 0`, `h = 114`).
  - Affected: `bot_longskirt.main@elder_slim` in 33 townfolk frames (walk_E 5-7, walk_SE 6-7, …), and `wedding_dress.main` / `bot_longskirt.main` in 104 townfolk2 frames.
  - It shows as a short red line floating above a walking elder in a long skirt; I saw it in `cityfolk_phaser.png`.
  - Cityfolk's own atlases have 0 such frames.
  - The fix belongs to the townfolk owners: clear rows 0-1 of those frames or re-trim them.
- **`hair_bun.tie`** is never packed in assets/townfolk. It is harmless; the layer is skipped.
- **Elders' mittens in run N** pump in front of the torso and are hidden on half the frames (`HIDDEN_LIMBS`, expected).
- **Round bodies** are stretched slim renders, as in townfolk; their `groundSpeed` in E is scaled to match.
- **Palette:** the red hose still shows slight dither speckle (not visible at 1×), and a few pale tints clip, as in townfolk.

## Rebuild
Rendering resumes where it stopped: only missing layer PNGs render. Run one Blender process at a time with `--threads 2`, and keep ≥ 3 GB RAM free.
1. **Heads:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode head`
2. **Anim metadata:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode meta --bases all`. This writes the head offsets, points and the foot tracks behind `groundSpeed`; run it after any anim change.
3. **Bodies:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode body --pass lower|upper|old --bases child_slim|adult_slim|elder_slim [--anims run,flee,runlegs] [--force]`
4. **Proof renders:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode full --combos look --out /tmp/fv_cache/cityfolk/look_proof`
5. **Pack:** `python3 tools/blender/cf_pack.py`. The defaults are 50 body colours and 96 head colours; `--colors N`, `--head-colors N` and `--dither D` override them.
6. **Check:** `python3 tools/blender/cf_check.py --dump /tmp/fv_cache/cityfolk/review/cityfolk_cases.json`
7. **Tests:**
   - `node tools/test/cityfolk_phaser.mjs --parity /tmp/fv_cache/cityfolk/review/cityfolk_cases.json`
   - `node tools/test/cityfolk_phaser.mjs --jsgen`
   - `node tools/test/cityfolk_phaser.mjs` (the Phaser scene)
   - `node tools/test/cityfolk_phaser.mjs --incident fire`
8. **Previews:** `python3 tools/blender/cf_preview.py` builds jobs, anims, crowd, gifs, proof, polish and lineup; name any subset to build only those.

Files are in `/home/user/nurient/frost-village`:
- docs/build_reports/cityfolk.md
- assets/cityfolk/
- tools/blender/cf_anim.py, cf_parts.py, cf_presets.py, cf_render.py, cf_pack.py, cf_check.py, cf_preview.py
- tools/cityfolk_compose.js
- tools/cityfolk_compose.py
- tools/test/cityfolk_phaser.mjs
- docs/previews/cityfolk_*
