// Playwright run of the chat lab artifact page (dist/chat_lab/index.html) at 390x844:
//   * offline (no window.claude): village, chat, memory tab, gossip spreading, story log, dark mode
//   * with a mocked window.claude.use("sample") (streaming JSON replies, a rate_limited error)
// The page is wrapped in a minimal artifact-like skeleton first (the real host adds one too).
// Screenshots -> docs/previews/chat_*.png ; prints a JSON summary of checks.
//
//   node tools/test/chat_lab.mjs            (build first: node tools/chat_lab/build.mjs)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './pw.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const shots = path.join(root, 'docs', 'previews');
const scratch = process.env.CHAT_SCRATCH || path.join(os.tmpdir(), 'frost_chat_lab');
fs.mkdirSync(scratch, { recursive: true });
const page0 = fs.readFileSync(path.join(root, 'dist', 'chat_lab', 'index.html'), 'utf8');
const wrapped = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf8}img{max-width:100%}[hidden]{display:none!important}</style>'
  + '</head><body>' + page0 + '</body></html>';
const file = path.join(scratch, '_wrapped_test.html');
fs.writeFileSync(file, wrapped);
const url = 'file://' + file;

// a browser-side fake of claude.use("sample"): streams one JSON object per reply
const MOCK = `
(() => {
  const sleep = (ms, sig) => new Promise((res, rej) => { const t = setTimeout(res, ms); if (sig) sig.addEventListener('abort', () => { clearTimeout(t); rej(new Error('abort')); }, { once: true }); });
  const pick = (last) => {
    if (window.__mockDeny) return { error: 'not_granted' };
    if (/에러/.test(last)) return { error: 'rate_limited' };
    if (/길게/.test(last)) return { slow: true, reply: '음~ 그러니까 이야기가 아주 길어요. 옛날 옛적에 서리마을에 눈이 아주 많이 왔는데요, 그날 광장에서는 다들 눈사람을 만들었고요, 빵집에서는 크림빵을 구웠어요~', emote: 'music', mood: 'calm', affinity: 0, memory: '촌장님한테 옛날이야기를 해 줬다', facts: [], importance: 1, topics: ['이야기'], gossip: [], lines: [], favor: null };
    if (/생선/.test(last)) return { reply: '우와, 생선을 열 마리나요? 촌장님 낚시 솜씨 대단해요! 오늘 저녁은 생선구이겠네요~', emote: 'sparkle', mood: 'excited', affinity: 2, memory: '촌장님이 생선을 열 마리 잡았다고 자랑했다', facts: ['촌장님은 낚시를 잘한다'], importance: 3, topics: ['생선', '낚시'], gossip: ['촌장님이 오늘 생선을 열 마리나 잡았대'], lines: ['촌장님, 오늘도 낚시 다녀오셨어요? 저번엔 열 마리나 잡으셨잖아요!'], favor: null };
    if (/고양이/.test(last)) return { reply: '촌장님도 고양이 좋아하세요? 저도요! 나비가 계산대 위에서 자는 거 보셨어요?', emote: 'love', mood: 'happy', affinity: 1, memory: '촌장님이 고양이를 좋아한다고 했다', facts: ['촌장님은 고양이를 좋아한다'], importance: 3, topics: ['동물'], gossip: ['촌장님이 고양이를 엄청 좋아한대', '점원 미소랑 촌장님이 고양이 얘기로 한참 수다를 떨었대'], lines: ['촌장님, 오늘 나비 봤어요? 또 계산대 위에서 자요!'], favor: null };
    if (/소문/.test(last)) return { reply: '음~ 요즘 제일 핫한 건 촌장님 얘기죠! 다들 촌장님이 낚시왕이래요~', emote: 'exclaim', mood: 'excited', affinity: 1, memory: '촌장님한테 마을 소문을 전해 줬다', facts: [], importance: 1, topics: ['소문'], gossip: [], lines: [], favor: null };
    return { reply: '헤헤, 촌장님이랑 얘기하니까 기분이 좋아요! 요즘 마을이 점점 북적북적해서 신나요~', emote: 'heart', mood: 'happy', affinity: 1, memory: '촌장님이랑 즐겁게 수다를 떨었다', facts: [], importance: 1, topics: ['마을'], gossip: [], lines: [], favor: null };
  };
  async function run(input, opts, json) {
    window.__sampleCalls = (window.__sampleCalls || []).concat([{ turns: input.length, last: input[input.length - 1].content, tier: opts.modelTier, cache: opts.cache }]);
    await Promise.resolve();
    const last = input[input.length - 1].content;
    const step = pick(last);
    await sleep(900, opts.signal).catch(() => { throw { code: 'cancelled' }; });
    if (step.error) throw { code: step.error, message: 'mock' };
    const full = JSON.stringify(Object.assign({}, step, { slow: undefined }));
    const n = step.slow ? 40 : 7, size = Math.ceil(full.length / n);
    let sofar = '';
    for (let i = 0; i < n; i++) {
      const d = full.slice(i * size, (i + 1) * size); if (!d) break;
      sofar += d;
      if (opts.onText) opts.onText({ text: sofar, delta: d });
      try { await sleep(step.slow ? 260 : 140, opts.signal); } catch (e) { throw { code: 'cancelled', text: sofar }; }
    }
    return json ? JSON.parse(full) : { text: full, truncated: false, modelTierApplied: 'quick' };
  }
  const sample = (i, o) => run(i, o || {}, false);
  sample.json = (i, o) => run(i, o || {}, true);
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
})();
`;

const result = { checks: {}, errors: [], shots: [] };
const check = (name, ok, info) => { result.checks[name] = ok ? 'ok' : 'FAIL' + (info ? ' ' + info : ''); };

async function snap(page, name) {
  const p = path.join(shots, name);
  await page.screenshot({ path: p });
  result.shots.push(path.relative(root, p));
}

async function newPage(browser, { mock = false, dark = false, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR', colorScheme: dark ? 'dark' : 'light' });
  if (mock) await ctx.addInitScript(MOCK);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) result.errors.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 6000))]));
  await page.waitForFunction(() => window.__lab && document.querySelectorAll('.card').length === 8, null, { timeout: 20000 });
  await sleep(400);
  return { ctx, page };
}

const lastReply = (page) => page.evaluate(() => { const b = [...document.querySelectorAll('.fc-them .fc-text')]; return b.length ? b[b.length - 1].textContent : ''; });
async function waitIdle(page) {
  await page.waitForFunction(() => !document.querySelector('.fc-typing-row') && !document.querySelector('.fc-send.fc-stop'), null, { timeout: 20000 });
  await sleep(900);
}
async function say(page, text) {
  await page.fill('#fc-input', text);
  await page.click('.fc-send');
  await waitIdle(page);
}
async function chip(page, text) { await page.click('.fc-chip:has-text("' + text + '")'); await waitIdle(page); }

const browser = await launch();
try {
  // ------------------------------------------------------------ offline
  {
    const { ctx, page } = await newPage(browser);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check('no horizontal scroll (village)', sw <= 390, String(sw));
    check('offline pill', (await page.textContent('#mode-pill')).includes('마을 말투'));
    await snap(page, 'chat_01_village.png');

    await page.click('.card[data-key="npc_aunt"]');
    await page.waitForSelector('.fc-them .fc-text', { timeout: 8000 });
    await sleep(1500);
    await snap(page, 'chat_02_open_offline.png');
    await say(page, '안녕하세요! 오늘 생선 많이 잡았어요');
    await chip(page, '무슨 소문 있어?');
    await page.click('.fc-chip:has-text("선물 줄게")');
    await page.click('.fc-tray-item:has-text("빵")');
    await waitIdle(page);
    await say(page, '아주머니 정말 최고예요!');
    const r = await lastReply(page);
    check('offline reply in Korean', /[가-힣]/.test(r), r);
    const inputBox = await page.locator('#fc-input').boundingBox();
    check('input visible', inputBox && inputBox.y + inputBox.height <= 844, JSON.stringify(inputBox));
    const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
    check('no horizontal scroll (chat)', sw2 <= 390, String(sw2));
    await snap(page, 'chat_03_offline_talk.png');

    await page.click('#fc-tab-mem');
    await sleep(300);
    check('memory tab lists episodes', (await page.locator('.fc-mitem').count()) > 0);
    await snap(page, 'chat_04_memory.png');

    await page.click('.fc-close');
    await sleep(700);
    const spreadShown = await page.evaluate(() => !document.getElementById('spread').hidden);
    check('spread moment after chat', spreadShown);
    await snap(page, 'chat_05_spread.png');

    await page.click('#tab-log');
    await sleep(400);
    check('story log has entries', (await page.locator('.entry').count()) > 0);
    await snap(page, 'chat_06_log.png');
    // persistence: reload keeps the memories
    const before = await page.evaluate(() => window.__lab.village.mem('npc_aunt').talks);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab && document.querySelectorAll('.card').length === 8, null, { timeout: 20000 });
    const after = await page.evaluate(() => window.__lab.village.mem('npc_aunt').talks);
    check('state survives reload', after === before && before > 0, before + ' -> ' + after);
    await ctx.close();
  }
  // ------------------------------------------------------------ dark
  {
    const { ctx, page } = await newPage(browser, { dark: true });
    await page.click('.card[data-key="npc_kid_prankster"]');
    await page.waitForSelector('.fc-them .fc-text', { timeout: 8000 });
    await sleep(1200);
    await say(page, '준아, 눈싸움하자!');
    await snap(page, 'chat_07_dark.png');
    await ctx.close();
  }
  // ------------------------------------------------------------ AI (mocked sample)
  {
    const { ctx, page } = await newPage(browser, { mock: true });
    await page.waitForFunction(() => document.getElementById('mode-pill').dataset.mode === 'ai', null, { timeout: 15000 });
    check('AI pill lights up', true);
    await page.click('.card[data-key="npc_clerk_a"]');
    await page.waitForSelector('.fc-note', { timeout: 8000 });
    check('consent note before first AI message', (await page.textContent('.fc-list')).includes('확인 창'));
    await sleep(1300);
    await page.fill('#fc-input', '나 오늘 생선 열 마리 잡았어!');
    await page.click('.fc-send');
    await page.waitForSelector('.fc-typing-row', { timeout: 3000 });
    check('stop button while thinking', await page.locator('.fc-send.fc-stop').count() === 1);
    await snap(page, 'chat_08_ai_thinking.png');
    await waitIdle(page);
    const r1 = await lastReply(page);
    check('AI reply shown', r1.includes('열 마리'), r1);
    await say(page, '나 고양이 진짜 좋아해');
    check('new story note', (await page.textContent('.fc-list')).includes('새 이야기'));
    await snap(page, 'chat_09_ai_reply.png');
    const calls = await page.evaluate(() => window.__sampleCalls);
    check('sample called with quick + cache:false', calls.every((c) => c.tier === 'quick' && c.cache === false), JSON.stringify(calls));
    check('player text delimited', calls.every((c) => c.last.includes('<촌장님_말>')));
    await say(page, '에러 나는 말');
    check('rate_limited note + retry', (await page.locator('.fc-note-btn:has-text("다시 보내기")').count()) > 0);
    await snap(page, 'chat_11_rate_limited.png');
    // Stop while a long answer streams: the partial stays, marked, and a calm note appears
    await sleep(2200);                                   // the cooldown after the last call
    const nBefore = await page.locator('.fc-them .fc-text').count();
    await page.fill('#fc-input', '길게 얘기해 줘');
    await page.click('.fc-send');
    await page.waitForFunction((n) => { const b = [...document.querySelectorAll('.fc-them .fc-text')]; return b.length > n && b[b.length - 1].textContent.length > 12; }, nBefore, { timeout: 8000 });
    await page.click('.fc-send.fc-stop');
    await waitIdle(page);
    check('stop keeps the partial and says so', (await page.textContent('.fc-list')).includes('대답을 멈췄어요') && (await page.locator('.fc-cut').count()) > 0);
    await snap(page, 'chat_13_stopped.png');
    await page.click('#fc-tab-mem');
    await sleep(300);
    check('AI chats are remembered (memory tab)', (await page.locator('.fc-tag:has-text("AI 수다")').count()) > 0);
    await snap(page, 'chat_14_ai_memory.png');
    await page.click('#fc-tab-chat');
    await page.click('.fc-close');
    await sleep(600);
    await snap(page, 'chat_05b_spread_ai.png');
    // the rumour reaches a friend; switch AI off and ask her
    await page.evaluate(() => { const lab = window.__lab; const v = lab.village; v.advance(); v.advance(); v.advance(); v.advance(); lab.save(); lab.render(); });
    await page.click('#ai-toggle');
    await sleep(200);
    await page.click('.card[data-key="npc_teen_girl"]');
    await page.waitForSelector('.fc-them .fc-text', { timeout: 8000 });
    await sleep(1500);
    await chip(page, '무슨 소문 있어?');
    const relay = await page.textContent('.fc-list');
    check('offline resident relays AI-learned gossip', /미소|고양이|생선/.test(relay), relay.slice(-160));
    await snap(page, 'chat_10_gossip_relay.png');
    await page.click('.fc-close');
    await page.click('#tab-log');
    await sleep(500);
    await snap(page, 'chat_06b_log_ai.png');
    await ctx.close();
  }
  // ------------------------------------------------------------ AI declined (not_granted): quietly offline
  {
    const { ctx, page } = await newPage(browser, { mock: true });
    await page.waitForFunction(() => document.getElementById('mode-pill').dataset.mode === 'ai', null, { timeout: 15000 });
    await page.evaluate(() => { window.__mockDeny = true; });
    await page.click('.card[data-key="npc_kid_girl"]');
    await page.waitForSelector('.fc-them .fc-text', { timeout: 8000 });
    await sleep(1200);
    await say(page, '하린아 안녕!');
    const t = await page.textContent('.fc-list');
    check('not_granted -> offline note, still answered', t.includes('마을 말투로') && (await lastReply(page)).length > 0, t.slice(-120));
    await say(page, '요즘 어때?');
    const calls = await page.evaluate(() => (window.__sampleCalls || []).length);
    check('not_granted is never asked again', calls === 1, String(calls));
    check('mode pill shows offline after decline', (await page.locator('.fc-mode[data-mode="offline"]').count()) === 1);
    await snap(page, 'chat_15_not_granted.png');
    await ctx.close();
  }
  // ------------------------------------------------------------ short screen (keyboard-like height)
  {
    const { ctx, page } = await newPage(browser, { height: 520 });
    await page.click('.card[data-key="npc_grandma"]');
    await page.waitForSelector('.fc-them .fc-text', { timeout: 8000 });
    await sleep(1200);
    await page.focus('#fc-input');
    await page.keyboard.type('할머니 안녕하세요');
    const box = await page.locator('#fc-input').boundingBox();
    check('input visible at 520px height', box && box.y + box.height <= 520, JSON.stringify(box));
    await snap(page, 'chat_12_short_screen.png');
    await ctx.close();
  }
} catch (e) {
  result.errors.push('test: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close();
  try { fs.unlinkSync(file); } catch (e) { /* */ }
}
result.ok = !result.errors.length && Object.values(result.checks).every((v) => v === 'ok');
fs.writeFileSync(path.join(scratch, '_last_run.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
