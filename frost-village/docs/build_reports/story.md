# Story-network engine: build report (CONTRACT_V8 §AF, job "story") — after the polish pass

The story engine runs the residents' social life. Residents talk, remember things and pass on rumours, which change as they spread. They ask about things they don't know, become friends, fall in love, marry and have babies. They move in and out, save and borrow at the bank, and run into small incidents: petty theft, queue‑jumping, snowball windows, cartoon scuffles, and fires after which the building is rebuilt. A morning paper reports the news.

The engine is plain JavaScript (ES modules) with no Phaser or DOM. For a given seed it always produces the same town, and it can be saved and loaded. All dialogue comes from a data-driven Korean grammar with correct particles (josa), speech levels and forms of address. A matching English grammar uses the same rule names.

This is the builder's report, updated after the polish pass. Two critics reviewed the build: a Korean-language critic (66,126 conversations on seeds 5, 42 and 99, read line by line with speaker and listener ages) and an engine critic (long runs, save, frame-rate, incident, household and shop probes). The critics asked to keep the engine's design: the particle engine, text that never changes the simulation, and memories that carry their own version of a story. All of that is unchanged. Every high and medium issue that reproduced is fixed, and so are the cheap lows. §11 lists every issue and what happened to it.

The engine is complete and tested: **30 of 30 tests pass** (21 from the build and 9 new regression tests for the critics' findings). It is not wired into the game yet; that is planned for v5 (§6).

**At a glance** (seed 7, 250 residents, 30 game days)

- 18,788 conversations and 126,747 spoken lines, 30,319 of them different (23.9 %). The builder's run had 22,273 conversations: strangers now mostly nod instead of introducing themselves.
- 0 missing-rule lines in Korean or English.
- First meetings: 15 % of conversations (critic's run: 37.6 %); 10–17 % on every day after day 3, weekends included.
- On the critics' own check scripts, the Korean address and tone errors went from thousands to zero or near zero: '○○ 씨' to someone 15+ years older 2,158 → 0 real cases, '이 할머니' 943 → 0, men saying '어머' 1,912 → 0, '그쪽' to friends 438 → 0, cold replies to good news 504 → 0 (§11).
- 0.36 ms of CPU per game second in the game's text mode, the same as before the polish (A/B under the same machine load; budget 2 ms).
- A 549 KB save that restores exactly. Saving no longer changes the story, so autosave is safe.

**What changed in the polish pass**

- **Engine**
  - `serialize()` is pure.
  - `tick(dt)` keeps time at any frame rate.
  - Incident phases can wait for the game's pictures (`ackWait`).
  - The game's named villagers stay as drawn.
  - No household is left with only children.
  - Every shop has one living owner who restocks it.
  - Gentle loan defaults no longer loop.
  - Talk bubbles fit inside the time the story gives a talk.
- **Social simulation**
  - People mostly talk to people they know: coworkers, classmates, neighbours and old friends know each other from day 0, and strangers nod hello.
  - Housemates talk like housemates.
  - Nobody is told their own story or asked about it in the third person.
  - Gossip distortions say what differs.
- **Korean**
  - Forms of address: 씨, 선생님, 사장님, 할머니, 형님 and 언니, and 여보, 자기, 당신, 임자 or 영감 between spouses.
  - Men do not say '어머'.
  - Warm replies to good news.
  - Farewells, introductions, rumour openers and endings, the newspaper and diaries.
  - Pets behave as their species does.
  - Several words were replaced: '손모아장갑', '삼단 케이크', '오늘부터 1일'.

**Deliverables** (all under `frost-village/`)

- `tools/story/**`: the engine, data files, Korean and English grammars, tests, the `sim.mjs` runner and the `samples.mjs` sample writer.
- `docs/story_samples.md`: the Korean samples for the designer, regenerated after the polish. The engine wrote every line; none were written by hand. It contains:
  - 40 conversations between different pairs, each with what both people remembered at that moment;
  - 5 rumour chains;
  - 3 newspaper front pages;
  - a fire‑and‑rebuild story;
  - a theft → chase → arrest → apology story;
  - a love story;
  - one resident's 30‑day diary.
- `docs/build_reports/story.md`: this report.

Nothing outside these paths was touched. The runner writes to `tools/story/out/`, which `tools/story/.gitignore` keeps out of git.

---

## 1. Running it

```bash
cd frost-village/tools/story
node sim.mjs --days 30 --residents 250 --seed 7            # logs + metrics -> out/seed_7/
node sim.mjs --days 30 --residents 250 --seed 7 --perf     # + ms per game second in 3 text modes
node sim.mjs --days 30 --residents 250 --seed 7 --samples  # + docs/story_samples.md
node sim.mjs ... --lang en | --text visible|none | --no-incidents | --no-life | --out DIR | --quiet
node samples.mjs --seed 7 --days 30 --residents 250 [--out FILE]
node --test test/*.test.mjs                                 # (npm test) 30 tests
node --test test/polish.test.mjs                            # only the critics' regression tests
```

Each run writes four files to `out/seed_N/`:

| File | Contents |
|---|---|
| `metrics.json` | Everything in §8 |
| `talks.log` | Every line spoken, with day, clock, place and topics |
| `events.log` | Incidents, buildings, moves, life events, bank, shops, wanted posters, relationship changes |
| `news.md` | Every morning's paper |

---

## 2. Files

| Path | Role |
|---|---|
| `index.js` | Public entry point: `createStory`, `StoryEngine`, `DEFAULTS`, `CHIEF`, the josa helpers, `Grammar`, data tables |
| `src/engine.js` | `StoryEngine`: setup and population (with the relationships a town already has on day 0), the clock and `tick` / `step`, the day change split into small steps, facts and witnesses, clean-up of forgotten facts, the public API, `serialize` / `deserialize` |
| `src/rng.js` | Seeded sfc32 random generator (128‑bit state, saved exactly) |
| `src/bus.js` | Synchronous event bus that does not allocate |
| `src/world.js` | Places (outdoor, civic, shops, homes): state (ok, burning, ruin, demolish, build, damaged), who is present, stock, plots, prices; `headOf` and `nameOf` |
| `src/people.js` | Residents: identity, age groups, 12 personality axes, likes, job, home, household, money, needs and mood, plan, memory, questions, life log; `isKept` for the game's named villagers |
| `src/plans.js` | Daily plans (sleep, work or school, meals, errands, leisure by likes, dates, promised outings, the shop owner's trip to the logistics centre) and travel (`goTo` / `arrive` events) |
| `src/memory.js` | Episodic memory: one `Fact` per event, up to 40 memories per resident, each with source, strength, decay, consolidation, exaggeration and distortion |
| `src/relations.js` | Relationship graph: one record per pair plus adjacency lists, so no orphans are possible |
| `src/social.js` | Who meets whom (people one knows first; strangers nod), topic choice, rumours with distortion, questions and answers, congratulations and comfort, romance, quarrels and reconciliation, invitations, talk at home, small happenings |
| `src/econ.js` | Wages, pocket money, meals, purchases, the salon's haircuts, stock pick-up and settlement at the logistics centre (on account when cash is short), big buys, dream shops (bank loan → construction → opening), shop takeovers |
| `src/bank.js` | Deposits with daily interest; loans for shop, house, rebuild, furniture and personal needs, repaid in daily instalments; fire insurance; gentle handling of missed payments (up to two restructures, a pause, then the town fund forgives the rest) |
| `src/incidents.js` | Theft, queue‑jumping, snowball windows, scuffles and fires. Every one is cute and non-violent and ends happily. Culprits are chosen by age band, role and a cooldown. Phases can wait for the game (`ackWait`). The `incidents` toggle switches them off |
| `src/life.js` | Sweethearts, dates, proposals, weddings, babies, growing up, retiring, gentle farewells (own toggle), memorials, moving in, out and within town (a family moves together; no child is left alone), housewarmings, staying with friends after a fire |
| `src/jobs.js` | Job openings, first jobs, retirement; a new coworker is introduced to the others |
| `src/weather.js` | Daily winter weather (Markov chain) and special days (first big snowfall, aurora, blizzard) |
| `src/newspaper.js` | 솔방울 신문, compiled every morning at 05:00 (one article per story, children never named as culprits) |
| `src/dialogue.js` | Turns the planned lines into Korean or English text: speech level, forms of address, slots, conditions, tags, automatic answers, repetition guards, gendered interjections, the press style and diaries |
| `src/save.js` | Compact save: varints, a string table and base64; version 2 (reads version 1) |
| `src/metrics.js` | Runner metrics only (the game does not use it) |
| `lang/grammar.js` | The compiled template grammar, similar to Tracery (markup in §4) |
| `lang/josa.js` | Particles chosen by 받침, native counting words, romanization, English articles |
| `lang/conds.js` | Condition flags (153 of at most 160) and conversation tags (115 of at most 128) |
| `lang/names.js` | Name pools by generation and sex, and surnames weighted by how common they really are |
| `lang/ko/*.js` | Korean grammar, split into `core`, `rumor`, `small`, `social`, `news`, `extra` and `polish` (rules added in this pass) |
| `lang/en/*.js` | English grammar with the same rule names (including `polish`) |
| `data/facts.js` | The 60 fact kinds (importance, valence, newsworthiness), fire causes, pets |
| `data/items.js` | 61 goods, mapped to game item ids and shop assortments |
| `data/places.js` | Place kinds (game asset key, sociability, opening hours), jobs, staff |
| `data/traits.js` | Personality axes, trait flags with Korean/English labels, 35 likes |
| `data/town.js` | The default town for the headless runner. The game passes its real buildings instead |
| `sim.mjs`, `samples.mjs` | The runner and the designer-sample writer |
| `test/*.test.mjs` | 30 tests (§9) |

---

## 3. Architecture

```
          game ──tick(dt)──▶ StoryEngine.step() once per game second (time accumulator: no drift)
                                 │ day change: newDay/endOfDay queued as slices (≤ 40 residents per step)
     ┌───────────────┬───────────┼──────────────┬──────────────┬─────────────┐
   Plans          Social      Incidents       Life/Jobs     Econ/Bank     Newspaper
(where people   (who meets,   (theft, queue,  (romance,     (wages, buys, (05:00 digest)
 go: goTo)       what topic)   window, fight,  babies,       stock, loans,
     │              │          fire → ruin →   moves, aging) insurance)
     │              ▼          rebuild)             │             │
     │        beats (who says what about which      │             │
     │        fact, in which remembered version)    │             │
     │              │                                │             │
     │        Dialogue realizer ── lang/grammar.js + lang/ko|en + josa
     │              │  (only for talks the game shows: textMode 'visible')
     ▼              ▼
   events on the bus: goTo/arrive, talk, incident, build, move, life, bank, shop, news, wanted,
   gossip, relation, fact, day  ──▶ game renders them        ◀── ack(id) when a phase has been shown
```

- **The text never changes the simulation.**
  - All simulation state uses the main random stream (`e.rng`). Text uses a separate stream, reseeded for each talk from the seed and the talk id.
  - Language and text mode never change the simulation (tested). A run in Korean and a run in English are the same town.
  - The query helpers (`diary`, `newspaper`, `memories`, `relationship`, `rumorsAbout`) only read, and so does `serialize()` (tested: 1,440 autosaves leave the story identical).
  - `talkTo` (the chief tapping a resident) does change state. That is intended: telling the chief a rumour is part of the story.
- **Facts and memories.**
  - Each event is stored once as a `Fact`: who did it, to whom, where, the item, a count, a status, and a link to an earlier fact (arrest → theft).
  - A resident's memory points at the fact and records that resident's own version of it:
    - the source: seen / did / told by X / newspaper / asked;
    - how many hops it travelled;
    - strength from 0 to 1000;
    - exaggeration from 0 to 3;
    - distortion: wrong place, wrong item, forgot who, or a bigger number.
  - Every night, memories fade. Important ones, and ones heard twice, become long-term. Weak ones are forgotten.
  - A fact nobody remembers is deleted, and open questions about it go with it.
- **Who talks to whom.**
  - On day 0 the town already has its everyday ties: classmates of a similar age, coworkers, next-door neighbours, and old friends among the elders. A new hire is introduced to the people at work, and a child who starts school is introduced to the class.
  - After the first days people mostly talk to people they know. A crowd of strangers (a busy plaza at the weekend) cannot crowd out the people one knows.
  - Two strangers passing each other usually just nod ("안녕하세요!" / "네, 안녕하세요!"). Newcomers, the curious and the chatty introduce themselves properly, in 3–4 lines.
- **Rumours.**
  - A teller picks the juiciest fresh memory the listener doesn't already have, and the listener learns that version.
  - Nobody is told a story they were part of, and nobody is asked about their own story in the third person.
  - Gossipy, less honest tellers may exaggerate or distort the story.
  - The listener's reply depends on what they already know:
    - "나도 들었어";
    - "어? 난 쿠키 여섯 개를 가져갔다고 들었는데?", which says exactly how the listener's version differs (place, item, who, or a bigger or smaller number) and is laughed off;
    - a follow-up question (caught? who? when? why? name?).
  - Unanswered follow-ups become open questions that the resident asks someone else later.
- **Relationships.**
  - Familiarity, affinity and romance build up through talks and set the stage: acquaintance → friend → best friend → sweetheart → engaged → spouse.
  - Relationships can also carry flags for rivalry, crushes, family, coworkers, neighbours and classmates.
  - A pair who met only once more than 10 days ago and never spoke again is forgotten. This keeps the graph and the save small.
- **Households.**
  - When the last grown-up of a household leaves or moves, the children move with them, or a relative or guardian moves in.
  - When two households merge (a wedding), the spouse's children come along.
- **Shops.**
  - Every shop has one living owner.
  - A shop left without an owner (the founder moved away, retired or opened another) is taken over by a grown-up looking for work, together with its till.
  - Owners restock at the logistics centre after work. If cash is short, the centre lets them take some stock on account; half the bill is written off when a shop is stuck with empty shelves.
  - The salon earns from haircuts.
- **Incidents.** Culprits are chosen to keep the tone cozy:
  - thieves and queue-jumpers are teens or grown-ups, never elders, police, firefighters or bank staff, and never the game's named villagers;
  - scuffles happen only within an age band (children, teens, or grown-ups less than 18 years apart; elders never scuffle);
  - every resident has a cooldown before their next incident.
- **Speech.**
  - The speech level comes from age and relationship: 반말 among friends and children, 해요체 to acquaintances and older people, and 존댓말 to elders, the chief and in the newspaper.
  - How people are addressed depends on who is speaking (§4).
- **No allocation storms.** The per-step code allocates nothing large:
  - pooled memories, preallocated scratch arrays, bitmask conditions;
  - one ring of recent lines per pair and one per speaker;
  - beats are created only when a talk starts.
- **Everyday work is spread out.**
  - Plans are made over the evening.
  - The day change runs as a queue of small steps.
  - Nightly memory and money upkeep is done 40 residents per step. The night's bookkeeping always belongs to the day that ended, even when the slices run past midnight.
  - The grammar is compiled once (about 0.15–0.35 s) when the engine is created.

---

## 4. Dialogue generator and Korean grammar

**Size**

| | Rules | Templates | Template coverage in a 30-day run |
|---|---|---|---|
| Korean | 712 | 2,623 | 64.6 % |
| English | 701 | 2,353 | 64.7 % |

- Most Korean templates have three speech-level wordings, and many contain `<a|b>` choices and slots, so there are many times more surface forms than templates.
- In 30 days the Korean run produced **30,319 distinct lines** out of 126,747 (23.9 %; English: 24,033 of 127,025).
- 4.4 % of lines repeat word-for-word between the same speaker and listener (before: 3.2 %). The rise is expected: people now talk mostly to the same few people, such as housemates, coworkers and friends.

**Markup** (documented in `lang/grammar.js`)

| Markup | Meaning |
|---|---|
| `#rule#` | Expand another rule |
| `{X}` | A slot (see the slot list below) |
| `{X:이}` | A particle chosen by 받침 |
| `{:을}` | A particle for the text just before it |
| `[반말\|해요\|존댓]` | Pick by speech level |
| `<a\|b>` | Random pick |
| `?cond !cond *w =tag ^tag !^tag @tag?` | Header: required / forbidden condition flags, weight, conversation tags |

Slots are filled from the conversation's people, places, items and facts:

| Slots | Filled with |
|---|---|
| X, Y, C | The people in the fact |
| O | The other person |
| P, I | The place, the item |
| N, M | A count, an amount of money |
| E | A detail |
| H, A | Likes |
| D, T | The day, how long ago |
| G | A pet |
| S, L, V | The speaker's own name, how they name the listener, the vocative |
| Q | The listener's own version of a story (place or item) |
| F | A family word |
| DO | What a job is about ('빵을 구워') |

A few more are internal.

**Particles.** `lang/josa.js` handles:

- 이/가, 은/는, 을/를, 과/와, (으)로 (ㄹ exception: 서울로), 이에요/예요, 이랑/랑, 아/야, 이야/야, 이었/였, 이라고/라고 …
- digits read in Sino-Korean (3이, 10이);
- Latin letters (TV를);
- skipping punctuation before the particle;
- 나/저/너 + 이/가 → 내가/제가/네가 (and 니가 in speech).

`replaceYou` turns 반말 "너" into the right form of address for parents, older friends and spouses.

**Forms of address** (the polish pass rewrote these after the critic's review)

| Who is speaking to or about whom | To their face | About them |
|---|---|---|
| A grown-up to someone 12+ years older | '사장님' (an owner), '박 기사님' (a job title), '김 선생님' | The full name with 씨 ('김대현 씨'), so two '김 선생님's are never confused |
| A grown-up to an elder | '순이 할머니', '갑수 할아버지'; '김 선생님' when the gap is under 15 years | The same |
| An elder to an elder | '○○ 씨'; an older close friend of the same sex is '덕수 형님' / '말순 언니'; one of the other sex is '○○ 씨' | The same |
| A child to a grown-up | 30 or older: '진아 이모', '준영 삼촌', '소방관 아저씨'; younger: '형', '누나', '오빠', '언니'; teachers: '송 선생님' | The same |
| Spouses | 여보, 자기, 당신 (by age); 임자 and 영감 for elderly couples | '우리 아내', '우리 남편', '우리 영감' |
| Anyone speaking politely about a grown-up | | Always with 씨: '재훈 씨와 서희 씨 결혼식', never '재훈 씨와 서희 결혼식' |
| Two people with the same given name in one talk | | The one talked about gets the full name ('이명수가 소식통이야') |

- A surname that is also an everyday word (이, 나, 오, 도, 우, 하, 고, 구, 소, 한) is never used alone before a title: '이 할머니' would read as 'this grandma'. The full name or the given name is used instead (tested).
- '그쪽' is only for rivals in a quarrel. Otherwise it is '{L}은요?' ('명수 오빠는요?', '사장님은요?').
- Grown-ups introduce themselves to children the way the child will call them: '나는 진아 이모야!', '나는 두현 삼촌이야.'
- '어머', '어머나' and '호호' are only in alternatives for female speakers. A safety net turns any that slip through into '오', '세상에', '아이고' or '하하' for men and boys (tested).
- Children talk 반말 among themselves. Teens use 해요체 to clearly older teens they don't know well.

**Conversation tags make replies answer what was actually said.**

- An alternative can mark what it says, for example `=meal`, `=q`, `=invite`, `=sleepq`, `=clothes`, `=errand` or `=leave`.
- The next line can require or forbid the previous line's tags (`^meal`, `!^q`).
- When a question is not answered by the next beat, the asked person gets an inserted short answer from the `qa` rule (at most two per talk).
- A line never repeats a sentence of the line before it.
- Alternatives the same speaker used recently are weighted ×0.06.
- Some lines only make sense in reply to something specific, and are re-rolled otherwise:
  - '수진이도 안녕!' only answers a hello.
  - '{V}도 잘 가!' only answers someone else's goodbye, never someone who is leaving.
  - No one asks for a baby's name the teller has just said. When the listener is about to ask, the teller's line leaves the name out.

**Per-level slot needs.** A template like `[… {P} 쪽에 있어.|… {P} 쪽에 있어요.|반갑습니다.]` is only picked at the levels whose wording it can fill. This fixed "저는 ○○예요. 쪽에 있어요." when the place was missing.

**Topics**

| Group | Topics |
|---|---|
| Greetings | Greetings, a nod between passers-by, goodbyes, first introductions (name, job, what the job is about, shared likes, newcomers) |
| Rumours | Rumours about 50+ fact kinds (theft, arrest, wanted, fire, ruin, rebuild, wedding, baby, moves, new shops, the chief's deeds, the pets, the train, deliveries, big catches, snowmen, lost and found …) |
| Questions and answers | Who / where / when / why / caught / name / what / price / bank rate / how-are-you, answered from memory, "몰라요", or "○○한테 물어봐요" |
| Own news | Congratulations and comfort (an own move away gets "어? 정말? 너무 섭섭하다…", not "속상했겠다"), own news, shared memories (told to the people who were there in the second person) |
| Romance | Flirting, confession, proposal, married couples' talk (morning and evening lines by time of day) |
| Quarrels | Quarrels and reconciliation |
| Plans and fun | Invitations, jokes and puns |
| At home | Housemates talk about dinner, homework, firewood for the stove, the day, new furniture ('새 침대 어때? 푹신하지?') |
| Small talk (27 topics) | Weather, snow, prices, the chief, the pets, the train, shops, logistics, bank, food, plans, the newspaper, the town, health, school, play, old times, dreams, newcomers, seasons, sleep, money, fashion, music, work, hobbies, family |
| Chief and shouts | The chief's tap lines; incident shouts ("도둑이야!", "물러서세요! 소방관입니다!", "고마워요, 소방관님들!") |
| Written | Newspaper headlines, articles, colour sentences and sidebar; diary entries that say what the news was ('은영 씨한테서 소영 씨네 집에 아기 우진이가 태어났다는 이야기를 들었다') |

**English.** It uses the same rule names; a test checks that every Korean rule resolves in English. It handles a/an articles and capitalisation, and romanises Korean names.

**Earlier quality pass (builder).** The builder had already traced many oddities in the samples to their causes. Examples:

- Kid thieves.
- Nobody may congratulate the person they share the news with.
- Replies depend on how the speaker knows the story: saw it, did it, heard it, read it, or never heard of it.
- Date questions only about engagements.
- '수진아도' → '수진이도'.
- Children under seven go to 유치원.
- Diary lines depend on whether the writer took part.
- A save gives the same newcomer names as the original game.

Those fixes are still in place. The polish pass is listed in §11.

---

## 5. API

```js
import { createStory, CHIEF } from '../tools/story/index.js';
const story = createStory({
  seed: 7, lang: 'ko', dayLength: 600, population: 250, textMode: 'visible',
  incidents: true, lifeEvents: true, farewell: true,          // settings toggles
  world: { places: [{ id, kind, name?: {ko, en}, x, y, cap?, owner?, level? }], plots: [{ id, size, x, y }] },
  residents: [{ key: 'npc_aunt', given: '순자', sur: '김', title: '순자 이모', age: 58, male: false, job: 'baker', persona }],
  config: { ackWait: true, keepNamed: true, fireRate, incidentRate, babyRate, moveInRate, moveOutRate, memCap, talkRate, yearDays, ... },
});
const again = createStory({ save: story.serialize() });       // restores everything (rng, plans, memories, incidents, half-done night …)
```

**Options added in the polish pass**

| Option | Default | Effect |
|---|---|---|
| `ackWait` | `false` | The phases the game has to show wait for `ack(id)`: the theft chase, the fire truck on its way, the hose, and the dust cloud. Each waits at most three times its usual length, or its length plus 30 game seconds, whichever is longer, so a missing ack never stalls the town. The `incident` event of such a phase carries `ack: true`. The headless runner leaves it off |
| `keepNamed` | `true` | Residents passed in `residents` with a `key` (the game's drawn villagers) keep their age, job and home. They never move away, bid farewell, steal, jump queues or scuffle. They still talk, remember, befriend and gossip |

**Driving the engine**

| Call | Effect |
|---|---|
| `tick(dt)` | Game seconds; steps once per game second using an exact time accumulator (no drift at 30, 60, 120 or 144 Hz; at most 600 steps per call) |
| `runDays(n)` | Headless |
| `setVisible(id => bool)` | Which residents are on screen. In `textMode 'visible'` only their talks get text |
| `setLang('ko'\|'en')` | Switch language |
| `setToggles({ incidents, lifeEvents, farewell })` | "사건·사고 끄기" also cancels scheduled incidents |
| `setPrices({ item_bread: 7, … })` | The game's prices (no random drift once set) |
| `setWeather(kind, temp)` | The game's weather |
| `ack(incidentId)` | The game finished showing the current phase (the truck has arrived, the chase loop is done). The incident moves on right away; with `ackWait` it waits for this |
| `report(kind, data)` | The game tells the story what happened: `'chief'` {what, target:{ko,en}, place}, `'pet'`, `'train'`, `'fire'`, `'theft'`, `'fact'` |
| `talkTo(id, lang)` | The chief taps a resident; returns a talk of 1–2 polite lines to the chief (a rumour, a question, or small talk) |
| `serialize()` | The save string (version 2). It does not change the story, so it is safe to call at any time |

**Queries** (pure)

| Query | Returns |
|---|---|
| `resident(id)` | The resident |
| `relationship(a, b)` | stage, familiarity, affinity, romance, rival, family, talks, metDay |
| `friends(id, minStage)` | Friend ids |
| `memories(id, n)` | kind, day, source, from, strength, exaggeration, distortion, long-term, told, people, place |
| `rumorsAbout(id)` | What is being said about a resident |
| `newspaper(lang)` | masthead, date, headline, lead, articles[], sidebar[], byline |
| `diary(id, day, lang)` | Diary lines |
| `wantedBoard()` | The posters |
| `passbook(id)` | wallet, savings, loans with balance, instalment, missed, paused |
| `name(id, lang)` | Display name |
| `stats()` | Counters |
| `clock` | {day, minute, dow} |
| `weather.today` | Today's weather |

**Events** (`story.on(name, fn)`; payloads are plain objects)

| Event | Payload | Game shows |
|---|---|---|
| `talk` | `{ id, a, b, place, placeIdx, start, dur, topics[], lines: [{ who, to, text, emote, anim, dur, rule, topic }], shout?, chief? }`. The `dur` values of the lines always add up to at most the talk's `dur` | Bubbles in order, emotes, anims (`talk`, `wave`, `laugh`, `happy`, `sad`, `think`, `shocked`, `flee`, `run`, `clap`, `spray_hose` …). A `nod` talk is 1–2 short lines with `wave`. A `shout` is a one-line talk to nobody (incident cries, cheers) |
| `goTo` / `arrive` | `{ who, place, act, run, eta, reason }` | Walk or run to the place's door (reasons: work, school, shop, pickup, evacuate, flee, chase, fire, demolish, construct, wedding, memorial, surrender …) |
| `incident` | `{ id, kind, phase, place, building, culprit, victim, officers[], crew[], witnesses[], item, cause, outcome, ack? }` | See the incident table below |
| `build` | `{ op: construct\|done\|scorched\|repaired\|ruin\|demolish, place, kind, purpose, crew, level }` | Building states (civic ruins, excavator, site, rebuilt one level higher) |
| `move` | `{ op: plan\|in\|out\|within, household, members[], home, why }` | Moving truck, new or empty home |
| `life` | `{ op: sweetheart\|engaged\|wedding\|baby\|grow\|farewell\|memorial\|housewarming, … }` | Wedding arch, stroller, memorial garden (farewell only if its toggle is on) |
| `bank` | `{ op: deposit\|loan\|restructure\|paid_off\|forgiven\|insurance, … }` | Passbook UI, coins |
| `shop` | `{ op: sale\|pickup\|settle\|opened\|takeover, …, owed }` | Shop owners collecting goods and settling up at the logistics centre (`owed` = what is still on the shop's account); new shops; a new owner taking a shop over |
| `wanted` | `{ op: post\|remove, incident, slot, reward, item }` | Wanted board |
| `news` | `{ day, paper, text }` | Newspaper panel every morning |
| `gossip`, `relation`, `fact`, `day` | — | For the story card, achievements, debugging |

**Incident phases** (phases in **bold** wait for `ack` when `ackWait` is on)

| Incident | Phases |
|---|---|
| theft | act → **chase** → arrest → station → release, or → wanted → tipped (next morning) → arrest |
| fire | smoke → **dispatch** → **spray** → (repair \| ruin → demolish → construct → done) |
| queue | argue → apology |
| window | crash → apology the next day with a parent |
| scuffle | **fight** (dust cloud) → separate (police whistle) → apology / reconcile |

---

## 6. Integration plan (v5)

Add one new module, `src/systems/StoryLife.js`, owned by Game.js. No other system needs to depend on the engine's internals.

1. **Create and save** (`src/scenes/Game.js`):
   - Create the story:

     ```js
     this.story = createStory(sv.story ? { save: sv.story } : {
       seed, lang: Settings.lang, dayLength: BALANCE.v4.day.length /* 600 */,
       world: storyWorld(this), residents: namedVillagers(this),
       textMode: 'visible', config: { ackWait: true },
     });
     ```

     - `storyWorld` maps the buildings in `src/data/world.js` and the v4 TownSim places (bakery, café, school, station, bank, police, fire station, logistics centre, homes) to place kinds by id.
     - `namedVillagers` gives the v2 villagers (`npc_aunt` …) their names, titles, ages and jobs. With `keepNamed` they stay exactly as drawn.
   - Write `story: this.story.serialize()` next to `life:` in the save (Game.js ~l.1700). It is about 550 KB after 30 game days; round trips are exact (tested).
     - `serialize()` no longer changes the story, so it can run with the game's autosave.
     - It costs 13–35 ms on a busy desktop core. Save at the day change (`story.on('day')`) or at most every 30–60 s, not every few seconds.
   - The engine starts at 06:00 on day 0, and DayClock starts at 08:00. Tick the story once by the difference when it is created; after that both use the same 600 s day.
2. **Update loop**:
   - In `Game.update` (where `this.life.update(dt)` runs, ~l.1429), call `this.story.tick(dt)` with DayClock's dt (it respects pause and fast-forward). The accumulator keeps the two clocks together at any frame rate.
   - Then call `setVisible(id => bodyOf(id) && gs.isOnScreen(...))`.
3. **Bodies**:
   - Named villagers stay `Resident` entities (`src/entities/Resident.js`).
   - The townsfolk are TownSim citizens (`src/systems/TownSim.js`). Give each citizen a story id, or map `resident.key` to a townsfolk preset seed.
   - `goTo` → `Resident.goTo(x, y, {run})` or the TownSim route to the place's door point.
   - `arrive` → idle or job animation.
4. **Talk**:
   - StoryLife plays `talk.lines` one after another with `Bubbles.chat(body, line.text, line.emote, line.dur)` (`src/systems/Bubbles.js`; it already pools bubbles and caps how many show at once). It turns the two speakers to face each other and plays `line.anim`.
   - The bubbles fit inside `talk.dur`, and the speakers' next `goTo` comes after the talk ends.
   - This replaces TownSim's random `chatter()` lines (`line(cat)` from `src/data/strings.js`) whenever a story talk is on screen. strings.js stays as the fallback for the tutorial and for v2 job barks (`Resident.say('cold')` …).
   - Tapping a resident (`VillageLife.tap`, TownSim card) → `story.talkTo(id)` → the bubble lines to the chief.
5. **Incidents and buildings → v8 art, FX and audio**:

   | Event | Art, FX and audio |
   |---|---|
   | theft | Cityfolk burglar outfit; `shout` cries; `bgm_chase`; the officer's run/arrest anims; the police station from the civic set; wanted board slots (ui4 wanted poster) |
   | fire | smoke → `fx_city` smoke sheet on the building; dispatch → fire truck + siren (audio6); spray → hose, mist and steam sheets; ruin → civic `ruin_*` sprite; demolish → excavator + dump truck; construct → construction site; done → building `level` + 1 |
   | scuffle | Dust-cloud fight sheet; police whistle |
   | window | Glass sfx |

   With `ackWait` on, call `story.ack(incident.id)` when the game has finished showing a phase that has `ack: true`:
   - the chase loop is over;
   - the truck has parked;
   - the hose animation is done;
   - the dust cloud has cleared.

   The story then moves on at once. If the game never acks (the building is off screen), the phase ends by itself after the safety timeout.
6. **Moves, life, bank, shops, news**:
   - `move` → moving truck (logistics) and TownSim add/remove citizen; newcomers get a move-in banner (VillageLife already has `showMoveInBanner`).
   - `life` → wedding at the town hall with the life2 arch and `bgm_wedding`; baby → stroller; farewell → memorial garden and `bgm_farewell`, shown only when the farewell toggle is on.
   - `shop` pickup/settle → shop owners at the logistics centre's `customerPoints`.
   - `bank` → the passbook panel.
   - `news` → the ui4 newspaper panel each morning.
7. **Game → story**:
   - Progression and building completion → `report('chief', { what: 'built', target: {ko, en}, place })`.
   - `DogPlay` antics → `report('pet', …)`.
   - Train arrivals (`Rail.js` / `Neighbours`) → `report('train', …)`.
   - `Economy` → `setPrices(...)` once a day.
   - The settings toggles (`core/Save.js` Settings) → `setToggles`.
8. **Chat** (`src/chat/storyBridge.js`, already written by the chat job): it duck-types `story.newspaper()`, `story.diary(id, day)`, `story.relationship(a, b)`, `story.clock.day`, `story.weather.today.kind` and `on('talk')`. All of these exist with those shapes.
9. **Phones**:
   - Use `textMode 'visible'`; text is the most expensive part, and only on-screen talks need it.
   - If frame hitches show on low-end devices, run the engine in a Web Worker. It has no DOM, events are plain objects, and the save is a string, so it can be posted to the main thread.

---

## 7. Performance

All figures are for Node 22 on a shared 4-core container. During the polish pass other agents kept the load average at 20–30, so the wall-clock figures are inflated about 2–3×. CPU time (`process.cpuUsage`, per step) is the fairer figure.

To measure the polish itself, the builder's version and the polished version were run back to back under the same load. The runs used seed 7 with 250 residents for 10 game days (6,000 steps), and one resident in ten was on screen in `visible` mode.

| Text mode | Builder: CPU avg / p99 / max | Polished: CPU avg / p99 / max |
|---|---|---|
| `visible` (the game) | 0.366 / 6.1 / 26 ms | **0.364** / 5.5 / 18 ms |
| `all` (runner, samples) | 0.603 / 6.3 / 27 ms | 0.619 / 7.6 / 48 ms |
| `none` | 0.233 / 4.5 / 17 ms | 0.234 / 4.1 / 22 ms |

The two versions cost the same within the noise.

| Run | CPU per game second, average |
|---|---|
| 400 residents, 30 days, no text (two A/B rounds) | Builder 0.21–0.25 ms; polished 0.23–0.26 ms |
| 120 days, 250 residents, no text | 0.19 ms (engine critic: 0.19) |
| 365 days, 250 residents, no text | 0.14 ms (engine critic: 0.15) |
| 120 days, 400 residents, no text | 0.25 ms (engine critic: 0.23) |

The 400-resident town costs about 8 % more, from the relationships a town now has on day 0.

- **Budget.** The target is ≤ 2 ms per game second. The game's mode (`visible`) averages **0.36 ms of CPU per game second** under this load (the builder measured 0.31 ms at load 12–15). A mid-range phone is roughly 3–4× slower than one server core, which gives about 1.1–1.5 ms per game second. That is within budget. The unit test checks it.
- **Spikes.** The engine critic found the slow steps in `social` at crowded moments (a full plaza at lunch), at 10–20 ms. They are the same before and after the polish. On this machine one step in a hundred took 4–7 ms of CPU, and the worst took 18–48 ms; a quiet machine measured 0.5–0.7 ms p99 in the builder's run. On a slow phone the occasional step could reach 20 ms. If that shows as a hitch, run the engine in a Web Worker (§6, step 9).
- **Creation** takes about 0.15–0.35 s, almost all of it compiling the grammar.
- **Save** after 30 days: 562,084 characters (549 KB) for 255 residents and 1,632 facts; the builder's run was 630 KB. The loaded copy saves back identically.
  - Over 1,440 autosaves, saving took 13–34 ms on average depending on the machine load.
  - One save under the heaviest load took 159 ms, and loading took 93 ms.

---

## 8. Metrics (30 game days, 250 residents, seed 7)

Seed 7, Korean, every talk realised (`textMode 'all'`). The town ends the month with 255 residents.

**Talk and rumours**

| Metric | Value |
|---|---|
| Conversations | 18,788 (4.9 per resident per day), of which 1,196 are a passing nod |
| First introductions | 2,751 conversations (14.6 %) |
| Lines spoken | 126,747, of which 30,319 different (23.9 %) |
| Same line again between the same two people | 4.4 % |
| Missing-rule lines | 0 (Korean and English) |
| Big stories tracked | 170 |
| Reach of a big story | median 29 % of the town; a quarter of the town in 14.8 game hours |
| Longest learning chain | 4 hops |
| Exaggerations / distortions while retold | 1,140 / 137 |
| Questions asked / answered / "I don't know" | 3,622 / 1,260 / 2,362 |

**Relationships and life**

| Metric | Value |
|---|---|
| Pairs at month end | 2,016 acquaintances, 607 friends, 452 best friends, 74 married couples, 0 rival pairs |
| New couples / engagements / weddings | 1 / 5 / 5 |
| Babies | 6 |
| Residents who moved up an age group / first jobs | 42 / 16 |
| Households moved in / out / within town | 25 / 21 / 6 (54 new residents, 49 left) |
| Housewarmings / outings together | 3 / 518 |
| Gentle farewells | 1 |

**Incidents** (all non-violent; nobody is hurt)

| Metric | Value |
|---|---|
| Petty thefts | 9, all caught (3 wanted posters, 2 caught after a neighbour's tip) |
| Queue-jumping / snowball windows / dust-cloud scuffles | 12 / 7 / 5 |
| Fires | 9: 6 small, 3 burnt down and rebuilt (3 insurance pay-outs) |
| Cat rescues | 2 |
| Incidents resolved / still open at day 30 | 42 / 0 |

**Bank and shops**

| Metric | Value |
|---|---|
| Deposits / withdrawals | 308 (66,634 coins) / 255; savings at month end 109,418 coins |
| Loans | 27 (11,652 coins): furniture 12, shop 8, house 4, rebuild 3 |
| Paid off / restructured / paused / forgiven | 1 / 0 / 6 / 1 (most furniture loans were taken in the last week and run 12 days) |
| Missed instalments | 1 |
| Interest paid to savers | 2,164 coins |
| Shop sales | 7,945 (55,804 coins); 147 pick-ups at the logistics centre, 19 partly on account |

**Other seeds** (30 days, 250 residents)

| Seed | Residents | Thefts (caught) | Queue / window / scuffle | Fires (lost, rebuilt) | Couples / engaged / weddings | Babies | Households in / out | Loans (paid off) |
|---|---|---|---|---|---|---|---|---|
| 1 | 246 | 12 (11) | 6 / 2 / 9 | 5 (0, 0) | 1 / 3 / 3 | 4 | 11 / 14 | 32 (13) |
| 2 | 259 | 7 (6) | 9 / 3 / 11 | 2 (1, 1) | 0 / 2 / 2 | 5 | 18 / 15 | 30 (5) |
| 3 | 265 | 8 (8) | 13 / 6 / 5 | 7 (5, 4) | 0 / 3 / 3 | 2 | 21 / 17 | 32 (7) |
| 7 | 255 | 9 (9) | 12 / 7 / 5 | 9 (3, 3) | 1 / 5 / 5 | 6 | 25 / 21 | 27 (1) |
| 11 | 258 | 9 (8) | 12 / 7 / 5 | 5 (1, 1) | 1 / 3 / 3 | 3 | 18 / 17 | 28 (10) |
| 21 | 269 | 9 (9) | 11 / 5 / 9 | 4 (1, 1) | 0 / 3 / 3 | 8 | 16 / 12 | 31 (6) |
| 33 | 257 | 11 (11) | 11 / 9 / 9 | 8 (2, 1) | 2 / 5 / 5 | 8 | 21 / 20 | 30 (11) |

- Seed 21 in Korean: 19,803 conversations, 31,678 different lines (23.5 %), 4.5 % pair repeats, 0 missing-rule lines.
- In English, seed 7 has 24,033 different lines, 5.2 % pair repeats and 0 missing-rule lines.
- Scuffles are fewer than in the builder's runs (5–11 instead of 10–17) because of the age bands and cooldowns.

**Korean quality on the critic's own scripts** (seeds 5, 42 and 99, 30 days, 250 residents; 57,336 conversations and 387,114 lines)

| Check (critic's name) | Critic's run | Now |
|---|---|---|
| First-meeting conversations | 37.6 % (29 % on day 30, 50–57 % at weekends) | 15.0 % (10.2 % on day 30, 12–17 % at weekends) |
| '앞으로 잘 부탁' / '처음 뵙' in a conversation | 19.3 % / 17.4 % | 0.7 % / 6.3 % |
| `ssi_to_much_older` | 2,158 | 11. All are third-person mentions of someone else who shares the listener's given name (now with the full name, '장재훈 씨랑…') |
| `ambiguous_surname` | 943 | 0 |
| `male_eomeo` | 1,912 | 0 |
| `geujjok_to_close` | 438 | 0; 8 '흥, 또 그쪽이에요?' remain between rivals, as the critic asked |
| `spouse_vocative_uri` / `naedanjjak_uri` | 174 / 97 | 0 / 0 |
| `adult_given_to_kid` | 1,947 | 11. All are false hits on '나는 아직! 이따 먹을 거야.' |
| `tautology_job` | 671 | 0 |
| `danikka_first_tell` | 715 | 0 |
| `cold_reply_good_news` / `news_but_only_me` / `cold_reply_compliment` | 504 / 114 / 10 | 0 / 0 / 0 |
| `do_jalga_to_leaver` | 491 | 1 (to a 4-year-old who had said '살펴 가세요!' first) |
| `back_home_morning` / `tired_morning` / `bangawo_spouse` / `welcome_own_spouse` | 195 / 138 / 61 / 10 | 1 / 0 / 0 / 0 |
| `spouse_long_time` | 525 | 34. All ask a spouse about someone else ('철민이 요즘 어떻게 지내?') |
| `family_meet_tomorrow` / `spouse_meet_tomorrow` / `spouse_asks_likes` / `spouse_nice_chat` | 106 / 37 / 45 / 67 | 0 / 0 / 0 / 0 |
| `spouse_own_bigbuy` | 98 | 138. All are the critic's suggested replacement ('새 침대 들여놓으니까 집이 환하지?'), which the old regex still matches |
| `beongeori` / `cake_samcheung` / `1ilchae` | 356 / 226 / 16 | 0 / 0 / 0 |
| `toddler_reads_paper` / `work_q_to_student` / `price_q_to_kid` / `school_over_morning` | 261 / 139 / 86 / 41 | 0 / 0 / 0 / 0 |
| `thanks_neighbors_odd` / `theft_all_safe` / `si_to_kid` | 22 / 14 / 1 | 0 / 0 / 0 |
| `name_q_after_name` | 3 | 0 |
| Papers ending '훈훈한 이야기다.' | 83 of 90 | 0 of 90 |
| Diary lines that hide the news ('놀라운 소식을 들었다') | common | 0. 63–92 lines per seed now say what the story was |
| Thieves and queue-jumpers who are elders, police, firefighters or bank staff (critic's `culprits.mjs`, seeds 5/42/99/7) | 19 | 0 |
| Scuffles involving an elder / with an 18+ year gap / the same culprit again within 10 days | 7 / 7 / 11 | 0 / 0 / 0 |

---

## 9. Tests (`node --test test/*.test.mjs`): 30 of 30 pass

| File | What it checks |
|---|---|
| `josa.test.mjs` | Particles after a golden list of names and nouns; every name in the name pools; every item and place word; native counting words; grammar slots and 나/저/너 + 이/가; inline particles; speech levels; 반말 "너" → the right address for parents, older friends and spouses |
| `determinism.test.mjs` | Same seed → identical talk and save; a different seed → a different story; the text mode and the language do not change the simulation |
| `save.test.mjs` | Round trip is lossless and the restored town lives on identically (4.4 days, mid-conversation); a three-week round trip (forgetting, questions, moves); the save stays compact |
| `invariants.test.mjs` | Four weeks of life: no negative money, no orphan relationships, incidents resolve, households and homes stay consistent; "incidents off" stops crime, scuffles and fires; life-event toggles; `setToggles` mid-game |
| `grammar.test.mjs` | Both grammars compile and are large; every Korean rule resolves in English; a week of talk in Korean and in English has no misses and no leaked markup or double particles |
| `perf.test.mjs` | 250 residents cost well under 2 ms of CPU per game second |
| `polish.test.mjs` (new) | The critics' findings stay fixed (nine tests): |
| | - Autosaving every few steps leaves the story identical. |
| | - A save taken mid-night (half the bookkeeping done) continues identically. |
| | - `tick()` keeps the clock at 30, 60, 120 and 144 Hz. |
| | - With `ackWait` the fire truck waits for `ack` or a timeout. |
| | - In two months no household has only children, and every shop has one living owner with its till collected. |
| | - The named villagers keep their age, job and home and are never culprits. |
| | - Bubbles fit inside the talk. |
| | - Korean: no man says 어머, no '그쪽' outside a quarrel, no '이 할머니'-style names, no '우리 아내' to a spouse's face, no '○○ 씨' to someone 15+ years older, and first meetings stay under 25 % of talks. |
| | - The paper prints each story once and never names a child as a culprit. |

---

## 10. Tuning and known limits

- **Tuning.** The knobs are in `DEFAULTS` in `src/engine.js`. The settings toggles are `incidents` ("사건·사고 끄기"), `lifeEvents` and `farewell`.

  | Knob | Default |
  |---|---|
  | `yearDays` | 6 (a year of age every 6 game days) |
  | `fireRate` | 0.18 per day |
  | `fireRuinAfter` | 43 s |
  | Incident rates | Theft 0.6, queue 0.7, window 0.4, scuffle 0.3 per day, fewer when the town is happy |
  | `babyRate` | 0.006 |
  | `moveInRate` / `moveOutRate` | 0.12 / 0.0025 |
  | `memCap` | 40 |
  | `talkRate` | 0.045 |
  | `ackWait` / `keepNamed` | false / true |

- **Fast aging.** With `yearDays` = 6, children grow up visibly within a month of play.
  - Over a 365-day run the town lives through about 60 years. The average age goes from 31.6 to 51.7, elders from 21 to 94 of 265, and the married share from 69 % to 52 %, even though move-ins now favour the age groups the town is short of.
  - The designer may want `yearDays` of 30 or more for long saves.
- **Fires.** There are 2–9 fires per 30 days per seed (seed 7: 9, of which 6 were small). That may be more drama than a cozy month needs. The number of fires scales with `fireRate`, so 0.12 would give about two thirds as many. The game should lower `fireRate` when hydrants are built.
- **First meetings.** On days 1–2 about 40 % of conversations are first introductions, because everyone is new to the town. From day 4 it is 10–17 %. The game's named villagers could be passed with their existing friendships to lower this.
- **Speech to elders.** Children and teens speak to elders at the most respectful level, which reads stiff from a child ('글쎄요, 짐작만 갈 뿐이네요.' from an 11-year-old). Moving them to 해요체 would need honorific '-시-' forms in many templates. That is left for a later pass.
- **Same names.** The name pools follow real generations, so about one given name in ten repeats in a town of 250. Inside one talk a name twin is now given the full name, but two '재훈 씨's in different talks are still possible, as in a real town.
- **Small things the samples still show.**
  - A talk can touch the same story twice: someone tells their own news, and then the listener brings up a shared memory of the same event.
  - Some lines are generic ("응, 그거 이미 들었어!").
  - A teacher's diary is full of the pupils who became their friends; the lines now read as a grown-up's ("하윤이가 나를 제일 좋아한대. 헤헤, 기분 좋다.").
- **Long games.**
  - **Housing.** A town started with 400 residents settles at about 330–350, because the default town has homes for about that many. The game passes its own homes.
  - **Wealth.** Owners of busy shops get rich over a year (the richest resident has about 106,000 coins against a median of 493). The game may want money sinks such as house upgrades or donations.
  - **Restocking.** One or two shops may have empty shelves at the end of a day. The salon always shows 0 stock because it sells haircuts.
- **Save size.** About 0.55 MB as base64 after 30 days and about 0.7 MB after a year. It levels off because memories are capped and one-off acquaintances are forgotten. Packing 15 bits per UTF‑16 character would cut the character count by about 2.5× if localStorage becomes tight.
- **Not done here.** The game-side wiring (§6) is v5 work for the code agents. The engine was built against the current game code but does not import any of it.

---

## 11. Critic issues and what happened to them

Severity is the critic's. "Fixed" means the issue was reproduced with the critic's scripts or probes, fixed, and checked again on the same seeds (§8); most fixes also have a regression test (§9). Where the critic's issue list was cut off, the issues come from the critic's summary and evidence files.

**Korean critic**

| # | Sev. | Issue | Status | What was done / evidence now |
|---|---|---|---|---|
| K1 | high | First meetings take over the town (37.6 % of talks; 50–57 % at weekends; '앞으로 잘 부탁' in 19 %) | **Fixed** | Day-0 ties (classmates, coworkers, neighbours, old friends); new hires and new pupils introduced; people one knows are preferred, and stranger crowds are capped harder at weekends; strangers usually nod; intros are 3–4 lines. Now 15.0 % overall, 10–17 % after day 3 (weekends included), 10.2 % on day 30; '앞으로 잘 부탁' 0.7 % |
| K2 | high | '○○ 씨' to people 15+ years older (2,158); a 70-year-old called '할아버지' by an 83-year-old | **Fixed** | Address by job title, '사장님' or '김 선생님'; elders call each other '○○ 씨', '형님' or '언니'. 0 real cases left (11 are full-name mentions of name twins) |
| K3 | high | '이 할머니', '나 순경' (943), also in diaries | **Fixed** | '순이 할머니'; the full name when the surname is an everyday word; diaries use the same names. 0; tested |
| K4 | high | Men saying '어머' (1,912) | **Fixed** | Female-only alternatives plus a safety net for male speakers. 0; tested |
| K5 | high | '우리 아내' to a spouse's face; '내 단짝 우리 아내!' | **Fixed** | Spouse vocatives 여보, 자기, 당신, 임자, 영감; spouses excluded from best-friend lines. 0 / 0; tested |
| K6 | high | Spouses and housemates talk like neighbours ('요즘 어떻게 지내?', '나 왔어~' at 7 am, '내일 만날래?', '이사 온 거 환영해!') | **Fixed** | Housemate and time-of-day gates on greetings, invitations, 'tired' and 'back home' lines; new talk at home; own big buys told as '새 침대 어때?'; no welcome or congratulation for one's own household. The critic's 11 spouse and family counts are now 0–1 (the remaining hits are false positives) |
| K7 | high | Distortion replies are ungrammatical ('…에서 아니었어요?'), fire when nothing differs, and end flat | **Fixed** | `react.differs` fires only when the versions really differ, and says how ('어? 난 쿠키 여섯 개를 가져갔다고 들었는데?'); the teller laughs it off ('하하, 소문이 벌써 그렇게 부풀었어?'); the generic '바뀌었나 봐요' is gone |
| K8 | high | '식구가 108명이래요' (household id stored as the size) | **Fixed** | `move_in` stores the number of members; rumours at most double a family (+1). 0 |
| K9 | high | Elder, firefighter and banker thieves; elder dust-clouds; repeat culprits; 'hungry' motive; minors named in the paper; private loans printed | **Fixed** | Culprit pools by age band and role; elders never scuffle; per-person cooldowns; motive '너무 맛있어 보여서 그만…'; the paper writes '한 학생' for minors; loans are not news. 0 bad culprits in 129 incidents; tested |
| K10 | high | Cold replies to good news ('벌써 소문 다 났어', '응, 그래.' to compliments) | **Fixed** | Dismissive lines only for bad news; warm '나도 들었어! 진짜 경사다!'; '응, 그래.' blocked after praise, dinner or happiness; '나만 아는 줄' only for a told story. 504 / 114 / 10 → 0 |
| K11 | medium | '그쪽' to friends and from a 4-year-old (438) | **Fixed** | '{L}은요?' / '{V}도 조심히 가요'; '그쪽' only in rivals' quarrels. 0; tested |
| K12 | medium | '{V}도 잘 가!' to the person who is leaving (491) | **Fixed** | Leave-taking lines are tagged; the reply is '응, 잘 가!' / '조심히 가!'. 1 left (after a child's own '살펴 가세요') |
| K13 | medium | Adults introduce themselves to children by bare name (1,947); tautological job intros (671) | **Fixed** | '나는 진아 이모야!'; '저는 ○○예요. 마을의 불을 꺼요.' (name plus what the job is about). 0 real cases / 0 |
| K14 | medium | '-다니까요' as a first telling (715); '헐, 대박' before fires; '오늘 신문 봤어?' about old news | **Fixed** | Neutral endings for first tellings; excited openers only for good news; '오늘 신문' only for yesterday's stories. 0 |
| K15 | medium | The paper prints a story twice; '훈훈한 이야기다.' on 83 of 90 pages; a repeated wedding lead; headlines that repeat the body | **Fixed** | One article per story (tested); varied article bodies and colour lines. 0 of 90 |
| K16 | medium | Diaries never say what the news was | **Fixed** | '…다는 이야기를 들었다 / 전해 주었다' built from the fact; congratulations and comfort say what they were about. 0 vague lines |
| K17 | low | Pets ignore their species (a cat pulling a sled, a penguin wagging its tail) | **Fixed** | Antics per species (dog, cat, penguin), with no second place word in news ('광장에서 하루 종일 쿨쿨 낮잠만 잤다') |
| K18 | low | '벙어리장갑' (356) | **Fixed** | '손모아장갑' everywhere (item name too). 0 |
| K19 | low | '케이크가 삼 층' (226) | **Fixed** | '삼단 케이크'. 0 |
| K20 | low | '벌써 1일째래요' | **Fixed** | '오늘부터 1일이래요!'. 0 |
| K21 | low | Asking the baby's name right after hearing it (3) | **Fixed** | The teller leaves the name out when the listener will ask; a line guard checks the talk too. 0 |
| K22 | — | Found while reading the regenerated samples: a rumour told to the person it was about, or a question about someone asked of that person (about 0.5 % of rumour and question beats); recalling a fight, a wedding or an arrest in the third person to the person who was in it; '음… 글쎄?' to '잘 잤어?'; '속상했겠다' to someone moving away; a sunny reply on a snowy day; '꼭 놀러 오세요!' without a thank-you; polite speech mixing '재훈 씨와 서희'; a 4-year-old speaking 해요체 to a 7-year-old; a teacher's diary written like a child's | **Fixed** | Participants excluded from rumours and from third-person questions (0 on seeds 5/42/99); second-person recall lines; tag and weather gates; new replies for moving away; 씨 in polite speech; children use 반말 with each other; grown-up diary lines about child friends |
| K23 | — | Children speak to elders at the most formal level ('짐작만 갈 뿐이네요' from an 11-year-old) | **Won't fix now** | 해요체 would need honorific '-시-' forms in many templates; switching without them would sound rude to elders. Listed in §10 |

**Engine critic** (from its probe runs and check scripts)

| # | Sev. | Issue | Status | What was done / evidence now |
|---|---|---|---|---|
| E1 | high | `serialize()` changed the story: a run with autosaves differed from one without (`identicalToNoSaveRun: false`) | **Fixed** | `serialize()` no longer flushes queued work; the pending night slices, day queue, time accumulator, shop accounts and incident waits are saved (save v2, reads v1). 1,440 autosaves → identical; tested |
| E2 | high | `tick(dt)` drift: +12 s per 600 s day at 60 fps, −24 s at 120 Hz | **Fixed** | Exact accumulator. At most 1 s per day at 30/60/120/144 Hz; tested |
| E3 | medium | Incident phases run on fixed timers; the game cannot make the story wait for its pictures | **Fixed (opt-in)** | `ackWait`: chase, truck dispatch, hose and dust cloud wait for `ack(id)` with a safety timeout, and the event carries `ack: true`. Off by default so the headless runs are unchanged; tested |
| E4 | high | The game's named villagers (`residents`) age, can steal or scuffle, and can move away | **Fixed** | `keepNamed` (default on): fixed age, job and home; never culprits; never move out or say farewell; tested over 40 days |
| E5 | medium | Households with only children (`kidOnlyHH`) | **Fixed** | Children move with the last grown-up, or a guardian moves in; merged households keep children with their parent. 0 in 60-, 120- and 365-day runs; tested. One family was briefly homeless with no host for a day in the 365-day run, and had a home again the next day |
| E6 | medium | Shops: 11 of 27 without an owner by day 119, one owner with two shops, tills piling up to 139,664 coins, 13 empty shelves, owners never restocking | **Fixed** | Takeovers (with the till); one shop per owner; after-work pick-ups; stock on account and a write-off when stuck; the night's wages go to the right day; salon haircuts. At day 60 (seeds 7, 21 and 1): 0 ownerless shops, 0 double owners, tills collected; only the salon (a service) and at most one shop show empty shelves; tested |
| E7 | medium | Loans restructured up to 34 times (negative amortisation) | **Fixed** | At most two restructures, then a pause and then the town fund forgives the rest; shop loans only while the dream and a plot are still there. Max restructures 2. No loan grows in the 365-day run; in the 400-resident run one paused loan grew slightly for 5 days |
| E8 | medium | Talk bubbles outlast the talk (40 % of talks, up to 8.9 s); 505 walk-offs while still speaking | **Fixed** | The talk's length comes from its beats, and the bubbles are fitted into it. 0 of 2,228 talks; 6 walk-offs (incident calls); tested |
| E9 | low | Bank `withdrawals` counter always 0 | **Fixed** | Counted (255 in 30 days, seed 7) |
| E10 | low | Shop dreamers pile up when no plot is free (64 by day 119) | **Fixed** | A dream fades if no plot frees up for a long time (15–33 waiting) |
| E11 | medium | Slow steps (10–20 ms) in `social` at crowded moments | **Won't fix (not a regression)** | A/B: CPU p99 4–6 ms and max 18–48 ms on a machine at load 20–30, the same as the builder's version. On phones, use the Web Worker option (§6) |
| E12 | low | A 400-resident town shrinks to about 320–350 | **Won't fix** | The default town has homes for about 350; it now settles at 349 instead of 324. The game passes its own homes |
| E13 | — | Saves taken at 23:46, at 00:00 or at midday continue identically | **Not reproduced** | It was already exact and still is (`continue` probe, plus a new mid-night test) |
