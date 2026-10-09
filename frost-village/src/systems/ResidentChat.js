// (v4-C2) 주민과 수다 떨기 — the resident chat of src/chat in the game (docs/build_reports/chat.md, "Integration plan").
//
//   tap a resident -> their name bubble + a "수다 떨기" button under their feet (UI scene) -> the ChatPanel bottom sheet
//   (DOM: Korean IME on phones). The village pauses while the sheet is open; closing it resumes the village, and the
//   friends who heard a new rumour show it (hearts / "!").
//
// The chat code (src/chat, ~200 KB) is not needed for the first paint, so it is loaded the first time someone opens a
// chat: the artifact build ships it as its own script (chat.js, a global __FV_CHAT_MOD); in the dev tree it is the
// ES module src/chat/index.js. The offline village brain always answers; the claude.ai `sample` capability lights up
// AI replies when the page declares it (capabilities: { sample: {} }) and the viewer allows it.
//
// Save: the chat village (each resident's memory of the chief, the shared rumours / lines, relations, the chat day) is
// part of the game save — Save.js ChatSave: a versioned record next to the game save (key frostVillage.save.v1.chat),
// tied to it by the save's chat id (`cid`), validated / migrated by ChatVillage.deserialize when the chat code loads,
// written only when a chat changed it (never on the 10 s autosave: the 6 KB / 2 ms budget of the game save holds).
// A reset or "start over" drops it with the game save.
import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { ChatSave } from '../core/Save.js';
import { t } from '../data/strings.js';

/** the residents with a persona card (src/chat/personas.js PERSONAS; tools/test/chat_game.mjs checks they match) */
export const CHAT_KEYS = ['npc_aunt', 'npc_kid_girl', 'npc_kid_prankster', 'npc_teen_girl', 'npc_uncle', 'npc_grandma', 'npc_clerk_a',
  'npc_blacksmith', 'npc_kid_boy', 'npc_young_man', 'npc_grandpa', 'npc_merchant', 'npc_herbalist', 'npc_bard', 'npc_fashion', 'npc_yellow',
  'npc_red', 'npc_blue', 'npc_captain', 'npc_chef', 'npc_postman', 'npc_doctor', 'npc_painter', 'npc_guard', 'npc_skater', 'npc_toddler',
  'npc_clerk_b', 'npc_porter_a', 'npc_porter_b', 'npc_sawyer', 'npc_smoker', 'npc_cannery'];
const CHAT_SET = new Set(CHAT_KEYS);

const PART_OF = { dawn: 0, day: 1, dusk: 2, night: 3 };
/** 을 / 를 after a Korean word (batchim test on its last syllable) */
function objParticle(w) { const c = String(w).charCodeAt(String(w).length - 1) - 0xac00; return c >= 0 && c < 11172 ? (c % 28 ? '을' : '를') : '을(를)'; }
const PART_SEC = 90;                 // before the v4 day clock runs: one chat "part of day" per 90 s of play (a day = 6 min)
const EMOTE = { heart: 'emote_heart', love: 'emote_love', laugh: 'emote_laugh', sparkle: 'emote_sparkle', tear: 'emote_tear', anger: 'emote_anger',
  sweat: 'emote_sweat', zzz: 'emote_zzz', music: 'emote_music', question: 'emote_question', exclaim: 'emote_exclaim', star: 'emote_star',
  idea: 'emote_idea', bread: 'emote_bread', fish: 'emote_fish', cold: 'emote_cold', thumbs: 'emote_thumbs', wave: 'emote_wave', dots: 'emote_dots' };
const ICON = { rumor: 'emote_dots', memory: 'emote_idea', story: 'emote_star', question: 'emote_question', day: 'ui_icon_day', night: 'ui_icon_night' };
// the game's page locks touch scrolling and text selection on <html> / <body>: the sheet needs both back while open
const HOST_CSS = 'html.fc-lock,html.fc-lock body{touch-action:auto!important}.fc-root,.fc-root *{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}.fc-root button{-webkit-user-select:none;user-select:none}.fc-root [hidden]{display:none!important}';

let modPromise = null;
/** the chat code: the artifact's chat.js script, or the dev tree's ES module */
export function loadChatModule() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.__FV_CHAT_MOD) return Promise.resolve(window.__FV_CHAT_MOD);
  if (modPromise) return modPromise;
  modPromise = new Promise((resolve, reject) => {
    const done = () => { if (window.__FV_CHAT_MOD) resolve(window.__FV_CHAT_MOD); else reject(new Error('chat code missing')); };
    const s = document.createElement('script');
    // eslint-disable-next-line no-undef
    if (typeof __FV_BUNDLED__ !== 'undefined' && __FV_BUNDLED__) {
      s.src = 'chat.js';
      s.onload = done;
    } else {
      // dev tree: an inline module script imports src/chat/index.js (kept out of the bundled game.js text on purpose)
      const url = new URL('src/chat/index.js', document.baseURI).href;
      s.type = 'module';
      window.addEventListener('fv-chat-ready', done, { once: true });
      s.textContent = 'imp' + 'ort * as M from ' + JSON.stringify(url) + '; window.__FV_CHAT_MOD = M; window.dispatchEvent(new Event("fv-chat-ready"));';
    }
    s.onerror = () => { modPromise = null; reject(new Error('chat code could not load')); };
    document.head.appendChild(s);
  });
  return modPromise;
}

export class ResidentChat {
  constructor(gs) {
    this.gs = gs;
    this.cid = gs.cid;
    this.mod = null;
    this.village = null;
    this.engine = null;
    this.panel = null;
    this.loading = false;
    this.dirty = false;
    this.playT = 0;
    this.lastPart = -1;
    this.lastDay = -1;
    this.deeds = [];             // what the chief did before the chat code was there (newest 4)
    this.portraits = new Map();  // key -> data URL
    this.icons = new Map();
    this.opened = 0;
    this.sampleAsked = false;
    this.onBuilt = (k) => { const n = t('b_' + k); if (n && n !== 'b_' + k && !/^deco_/.test(k)) this.deed(n + objParticle(n) + ' 지었다'); };
    this.onRegion = (id, instant) => { if (!instant) this.deed('새 땅을 열었다'); };
    this.onRank = () => this.deed('서리마을을 읍으로 키웠다');
    this.onSettlers = (n) => { if (n > 0) this.deed('새 이웃을 맞이했다'); };
    gs.events.on('built', this.onBuilt);
    gs.events.on('region', this.onRegion);
    gs.events.on('v4:rankUp', this.onRank);
    gs.events.on('settlers', this.onSettlers);
    gs.events.once('shutdown', () => this.destroy());
  }

  /** may this resident chat? (a resident with a persona card, not a pet, living here) */
  canChat(r) { return !!(r && !r.isPet && CHAT_SET.has(r.key) && r.alive !== false); }

  /** a resident was tapped: offer the chat button */
  offer(r) {
    if (!this.canChat(r) || !this.gs.ui) return;
    const ui = this.gs.game.scene.getScene('UI');
    if (ui && ui.showChatButton) ui.showChatButton(r);
  }

  /** the resident keys living in the village that have a persona */
  roster() {
    const out = [];
    for (const r of (this.gs.life && this.gs.life.residents) || []) if (CHAT_SET.has(r.key) && out.indexOf(r.key) < 0) out.push(r.key);
    return out;
  }

  // ---------------------------------------------------------------- the chat code + village
  /** load the chat code and the saved chat village (once) */
  ensure() {
    if (this.village) return Promise.resolve(this);
    return loadChatModule().then((M) => {
      if (this.village) return this;
      this.mod = M;
      const roster = this.roster();
      const raw = ChatSave.load(this.cid);
      const v = M.ChatVillage.deserialize(raw, { roster: roster.length ? roster : M.LAB_RESIDENTS.slice() });
      v.roster = roster.length ? roster : v.roster;
      for (const d of this.deeds) v.addDeed(d);
      this.deeds.length = 0;
      this.village = v;
      this.engine = new M.ChatEngine({ village: v });
      this.engine.setSample(null);            // offline until the viewer's Claude answers (if the page may ask)
      this.askSample();
      this.syncWorld(true);
      return this;
    });
  }

  /** the claude.ai `sample` capability (null: offline village voice only) */
  askSample() {
    if (this.sampleAsked) return;
    this.sampleAsked = true;
    try {
      const c = typeof window !== 'undefined' && window.claude;
      if (!c || typeof c.use !== 'function') return;
      Promise.resolve(c.use('sample')).then((s) => { if (this.engine) this.engine.setSample(s || null); }, () => { if (this.engine) this.engine.setSample(null); });
    } catch (e) { /* offline */ }
  }

  /** something the chief did that residents may bring up */
  deed(text) {
    if (!text) return;
    if (this.village) { this.village.addDeed(text); this.dirty = true; return; }
    this.deeds.push(String(text).slice(0, 60));
    if (this.deeds.length > 4) this.deeds.shift();
  }

  /** the chat day / part of day from the game clock (the v4 DayClock when it runs, else play time) */
  clockNow() {
    const ck = this.gs.v4 && this.gs.v4.clock;
    if (ck && ck.on) return { day: ck.day(), part: PART_OF[ck.phase()] || 0 };
    return { day: Math.floor(this.playT / (PART_SEC * 4)), part: Math.floor(this.playT / PART_SEC) % 4 };
  }

  /** world -> chat village: time of day, new days (rumours spread overnight), parts (a little spreading) */
  syncWorld(first) {
    const v = this.village;
    if (!v) return;
    const { day, part } = this.clockNow();
    if (first) {
      // days that passed while the chat code was not loaded: one morning (spreading + the paper)
      if (day > v.day) { v.setWorld({ day: day - 1 }); v.newDay(); this.dirty = true; }
      v.setWorld({ day: Math.max(day, v.day), part });
      this.lastDay = v.day; this.lastPart = part;
      return;
    }
    if (day !== this.lastDay && day > v.day) { v.setWorld({ day: day - 1 }); v.newDay(); v.setWorld({ part }); this.dirty = true; }
    else if (part !== this.lastPart) { v.setWorld({ part }); v.spreadTick(2); this.dirty = true; }
    this.lastDay = day; this.lastPart = part;
  }

  update(dt) {
    this.playT += dt;
    this.syncT = (this.syncT || 0) - dt;
    if (this.syncT > 0) return;
    this.syncT = 2;
    if (this.village && !(this.panel && this.panel.isOpen)) {
      const ro = this.roster();
      if (ro.length && ro.join() !== this.village.roster.join()) this.village.roster = ro;
      this.syncWorld(false);
    }
  }

  // ---------------------------------------------------------------- the sheet
  /** open the chat with resident r (loads the chat code the first time) */
  open(r) {
    if (!this.canChat(r) || this.loading) return false;
    if (this.panel && this.panel.isOpen) return false;
    const gs = this.gs;
    this.loading = true;
    this.pauseGame(true);
    this.ensure().then(() => {
      this.loading = false;
      if (!this.panel) this.makePanel();
      if (!this.village.roster.includes(r.key)) this.village.roster.push(r.key);
      this.who = r;
      this.opened++;
      this.panel.open(r.key);
      if (gs.voice) gs.voice.stop(r, true);
    }).catch((e) => {
      this.loading = false;
      this.pauseGame(false);
      console.warn('[FrostVillage] chat unavailable:', e && e.message);
      if (gs.ui) gs.ui.toast(t('chatOff'));
    });
    return true;
  }

  makePanel() {
    const M = this.mod;
    if (typeof document !== 'undefined' && !document.getElementById('fv-chat-host')) {
      const s = document.createElement('style');
      s.id = 'fv-chat-host';
      s.textContent = M.ChatPanel.tokensCss() + HOST_CSS;
      document.head.appendChild(s);
    }
    this.panel = new M.ChatPanel({
      engine: this.engine,
      assets: { portrait: (k) => this.portrait(k), emote: (n) => this.icon(EMOTE[n] || 'emote_' + n), icon: (n) => this.icon(ICON[n] || null) },
      onClose: (key, spread) => this.onClose(key, spread),
      onChange: (what) => { if (what === 'message') this.dirty = true; },
    });
  }

  onClose(key, spread) {
    this.dirty = true;
    this.save();
    this.pauseGame(false);
    const gs = this.gs, life = gs.life;
    // the friends who heard the newest rumour: a "!" and a few hearts over them (on screen only)
    let n = 0;
    for (const e of spread || []) {
      const r = life && life.residents.find((x) => x.key === e.to && x.alive && !x.lod);
      if (!r || n >= 3) continue;
      n++;
      gs.time.delayedCall(300 + n * 450, () => {
        if (!r.alive) return;
        if (r.emote) r.emote(Assets.pick('emote_exclaim', 'emote_heart'), 1.6);
        if (gs.isOnScreen(r.x, r.y, 40)) gs.effects.sheet('fx_hearts', r.x, r.y + (r.headTop || -80), { size: 80 });
      });
    }
    const r = this.who;
    if (r && r.alive && r.emote) r.emote('emote_heart', 1.4);
    this.who = null;
    void key;
  }

  /** the village waits while the sheet is open (like the settings panel); the keyboard is the sheet's */
  pauseGame(on) {
    const gs = this.gs, sm = gs.game.scene;
    const kb = gs.game.input && gs.game.input.keyboard;
    if (on) {
      Input.release();
      if (!sm.isPaused('Game')) { sm.pause('Game'); this.paused = true; }
      if (kb) kb.enabled = false;
      const ui = sm.getScene('UI');
      if (ui && ui.hideChatButton) ui.hideChatButton();
    } else {
      if (kb) kb.enabled = true;
      const ui = sm.getScene('UI');
      const other = ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen);
      if (this.paused && !other && sm.isPaused('Game')) sm.resume('Game');
      this.paused = false;
      Audio.resume();
    }
  }

  get isOpen() { return !!(this.panel && this.panel.isOpen) || this.loading; }

  // ---------------------------------------------------------------- pictures for the sheet
  /** a round head-and-shoulders picture of a resident, cut from their idle frame (data URL, cached) */
  portrait(key) {
    if (this.portraits.has(key)) return this.portraits.get(key);
    let url = null;
    try {
      const g = this.gs.game, ak = Assets.charAnim(key, 'idle', 'S'), an = g.anims.get(ak);
      const fr = an && an.frames && an.frames[0] && an.frames[0].frame;
      if (fr && !Assets.charDef(key)._placeholder) {
        const def = Assets.charDef(key);
        const W = fr.realWidth, H = fr.realHeight;
        const ax = W * (def.anchor ? def.anchor[0] : 0.5), ay = H * (def.anchor ? def.anchor[1] : 0.8125);
        const head = ay + (def.headTop || -84);           // top of the head in frame px
        const size = Math.round(H * 0.5), sx = Math.round(ax - size / 2), sy = Math.round(head - size * 0.06);
        const c = document.createElement('canvas');
        c.width = c.height = 112;
        const ctx = c.getContext('2d');
        const k = 112 / size;
        ctx.setTransform(k, 0, 0, k, -sx * k, -sy * k);
        ctx.drawImage(fr.source.image, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, fr.x, fr.y, fr.cutWidth, fr.cutHeight);
        url = c.toDataURL('image/png');
        c.width = c.height = 1;
      }
    } catch (e) { url = null; }
    if (url) this.portraits.set(key, url);
    return url;
  }

  /** an emote / icon picture as a data URL (cached) */
  icon(key) {
    if (!key) return null;
    if (this.icons.has(key)) return this.icons.get(key);
    let url = null;
    try {
      if (Assets.has(key)) {
        const s = Assets.source(key), f = s.frame;
        const c = document.createElement('canvas');
        c.width = f.cutWidth; c.height = f.cutHeight;
        c.getContext('2d').drawImage(s.img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
        url = c.toDataURL('image/png');
        c.width = c.height = 1;
      }
    } catch (e) { url = null; }
    if (url) this.icons.set(key, url);
    return url;
  }

  // ---------------------------------------------------------------- save
  /** write the chat village when a chat changed it (Game.save calls this too) */
  save() {
    if (!this.village || !this.dirty) return true;
    this.dirty = false;
    let ok = false;
    try { ok = ChatSave.write(this.cid, this.village.serialize()); } catch (e) { ok = false; }
    return ok;
  }

  /** test / debug state */
  state() {
    const v = this.village;
    return {
      loaded: !!v, open: !!(this.panel && this.panel.isOpen), opened: this.opened, mode: this.engine ? this.engine.mode : null,
      roster: v ? v.roster.length : this.roster().length, day: v ? v.day : null, part: v ? v.part : null,
      talks: v ? Object.keys(v.mems).reduce((n, k) => n + (v.mems[k].talks || 0), 0) : 0,
      gossip: v ? v.corpus.e.filter((x) => x.k === 'g').length : 0, deeds: v ? v.world.deeds.slice() : this.deeds.slice(),
      bytes: ChatSave.bytes(),
    };
  }

  destroy() {
    const gs = this.gs;
    gs.events.off('built', this.onBuilt);
    gs.events.off('region', this.onRegion);
    gs.events.off('v4:rankUp', this.onRank);
    gs.events.off('settlers', this.onSettlers);
    try { this.save(); } catch (e) { /* teardown */ }
    if (this.panel && this.panel.isOpen) { try { this.panel.close(true); } catch (e) { /* */ } }
    const kb = gs.game.input && gs.game.input.keyboard;
    if (kb) kb.enabled = true;
  }
}
