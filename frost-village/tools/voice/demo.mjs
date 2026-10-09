// 눈꽃말 voices — demo script, played through the REAL runtime (src/voice/VillageVoice.js) on a recording
// backend: every clip the runtime hands to the audio clock (sprite, offset, length, start time, rate, gain,
// channel, stop) is written to tools/voice/_cache/demo_events.json; tools/voice/demo_mix.py renders it to
// docs/previews/voice_demo.mp3 (+ a transcript). Run:  node tools/voice/demo.mjs && python3 tools/voice/demo_mix.py
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VillageVoice, VOICE_TYPES } from '../../src/voice/VillageVoice.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/voice/manifest.json'), 'utf8'));

class RecordingBackend {
  constructor() { this.t = 0; this.plays = []; this.chan = []; this.bus = []; }
  now() { return this.t; }
  has() { return true; }
  play(key, off, dur, when, rate, gain, ch) { const p = { key, off, dur, when, rate, gain, ch, stop: null, line: this.line }; this.plays.push(p); return p; }
  stop(h, when) { if (h) h.stop = when; }
  setChannelGain(ch, g, ramp) { this.chan.push({ t: this.t, ch, g, ramp }); }
  setBusGain(g, ramp) { this.bus.push({ t: this.t, g, ramp }); }
}

// the cast of the scene: who, voice, stereo position (-1 left .. 1 right)
const P = {
  boy: { key: 'npc_kid_boy', voiceId: 'doyun', pan: -0.5 }, girl: { key: 'npc_kid_girl', voiceId: 'harin', pan: -0.3 },
  man: { key: 'npc_merchant', voiceId: 'merchant', pan: 0.35 }, young: { key: 'npc_young_man', voiceId: 'taeo', pan: 0.2 },
  aunt: { key: 'npc_aunt', voiceId: 'aunt', pan: -0.25 },
  grandpa: { key: 'npc_grandpa', voiceId: 'grandpa', pan: 0.55 }, grandma: { key: 'npc_grandma', voiceId: 'grandma', pan: 0.45 },
  chief: { voice: 'chief', voiceId: 'chief', pan: 0 }, uncle: { key: 'npc_uncle', voiceId: 'uncle', pan: 0.5 },
  sweet: { key: 'npc_herbalist', voiceId: 'herbalist', pan: -0.45 }, baby: { key: 'npc_toddler', voiceId: 'kongkong', pan: -0.1 },
};
// [time s, speaker, bubble text, opts]
const SCRIPT = [
  // ---- part 1: every voice says hello and something in character
  [0.6, 'boy', '안녕! 콩이랑 같이 놀자!'],
  [2.9, 'girl', '안녕~ 내 눈사람 귀엽지?'],
  [5.2, 'man', '안녕하세요! 오늘 생선 많이 잡았어요.'],
  [7.6, 'young', '안녕하세요~ 오늘 기차 타고 왔어요!'],
  [9.9, 'aunt', '어서 와요~ 갓 구운 빵 있어요!'],
  [12.3, 'grandpa', '허허, 안녕. 오늘 참 춥구먼…', { emotion: 'laugh', emote: 0 }],
  [15.0, 'grandma', '아이고 우리 강아지, 따뜻하게 입어라~'],
  [17.7, 'chief', '안녕하세요 여러분! 우리 마을 최고!', { priority: 2 }],
  [20.1, 'uncle', '흥! 나무는 내가 다 할게.'],
  [22.6, 'sweet', '고마워요… 정말 따뜻해요.'],
  [25.0, 'baby', '야호! 별이다 별!', { emotion: 'excited' }],
  // ---- part 2: a little scene in the snow (three neighbours chatting, the chief, the kids and the dog, grandpa)
  [28.2, 'aunt', '안녕하세요~ 오늘 눈 정말 많이 왔죠?'],
  [30.0, 'young', '그러게요! 아침엔 생선도 많이 잡았어요.'],
  [32.0, 'aunt', '어머, 들었어요? 할아버지네 강아지가 눈사람 코를 먹었대요!', { emotion: 'surprise' }],
  [34.6, 'young', 'ㅋㅋㅋ 정말요? 너무 웃겨요!'],
  [35.3, 'uncle', '하하하! 그 녀석 배가 고팠나 보네!', { emotion: 'laugh' }],
  [37.5, 'girl', '촌장님, 오늘 축제는 언제 해요?'],
  [39.4, 'chief', '저녁에요! 다 같이 와요!', { priority: 2, emotion: 'excited' }],
  [41.4, 'aunt', '촌장님, 빵 하나 드세요~'],
  [43.0, 'chief', '와, 고마워요! 정말 맛있어요!', { priority: 2, emotion: 'thanks' }],
  [45.3, 'boy', '우와! 콩이다!', { emotion: 'surprise' }],
  [45.6, 'girl', '야호! 콩이야 이리 와!', { emotion: 'excited' }],
  [46.0, 'baby', '꺄아! 귀여워!', { emotion: 'excited' }],
  [49.0, 'grandpa', '흥, 요즘 애들은 너무 시끄러워…', { emotion: 'grumpy' }],
  [51.4, 'grandpa', '허허허, 그래도 귀엽구먼.', { emotion: 'laugh' }],
  [53.8, 'grandma', '아이고, 미끄러질 뻔했네!', { emotion: 'oops' }],
  [55.7, 'girl', '할머니 괜찮아요?'],
  [57.3, 'chief', '자, 다들 잘 가요~ 내일 또 봐요!', { priority: 2 }],
  [59.5, 'boy', '잘 가요 촌장님!'],
];
const DOG = [45.45, 46.3, 47.1];                // the dog barks back (sfx_dog_bark, part of the mix only)

const b = new RecordingBackend();
const vv = new VillageVoice({ manifest: MAN, backend: b, maxVoices: 2, baseGain: 1, volume: 1 });
const lines = [];
let si = 0;
const dt = 1 / 120;
for (let t = 0; t < 63; t += dt) {
  b.t = t;
  while (si < SCRIPT.length && SCRIPT[si][0] <= t) {
    const [at, who, text, opts] = SCRIPT[si++];
    const sp = P[who];
    b.line = lines.length;
    const plan = vv.plan(text, sp, opts || {});
    const u = vv.speak(text, sp, opts || {});
    lines.push({ at, who, voice: plan && plan.voice, text, say: plan ? plan.say : '', mood: plan && plan.mood, spoken: !!u, queued: !!u && u.state === 'pending', pan: sp.pan });
  }
  vv.update(dt);
}
const out = { sampleRate: 44100, lines, plays: b.plays, chan: b.chan, bus: b.bus, dog: DOG, stats: vv.stats, voices: VOICE_TYPES };
const dst = path.join(ROOT, 'tools/voice/_cache/demo_events.json');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, JSON.stringify(out));
console.log(`demo: ${lines.length} lines, ${b.plays.length} clips, stats ${JSON.stringify(vv.stats)} -> ${path.relative(ROOT, dst)}`);
