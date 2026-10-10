// LabBubbles: the lab's copy of the game's speech / emote bubbles (src/systems/Bubbles.js: ui_chat_bubble 9-slice +
// ui_chat_tail + text + emote icon, ui_emote_bubble + emote), with the town caps the story respects (2 everyday chats,
// 3 emotes; story set pieces may always speak) and every chat line spoken in 눈꽃말 through VillageVoice.

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const CHAT_W_MAX = 300;
const DEPTH = 1e6;

export class LabBubbles {
  constructor(scene, art, opts = {}) {
    this.scene = scene; this.art = art;
    this.voice = opts.voice || null;
    this.caps = Object.assign({ chat: 2, emote: 3, storyChat: 5 }, opts.caps || {});
    this.active = [];
    this.stats = { chats: 0, emotes: 0, capped: 0, voiced: 0 };
  }

  chat(who, text, emote, dur = 2.6, opts = {}) {
    if (!who || !who.alive) return false;
    this.clear(who, 'chat');
    const story = !!(opts.story);
    const chats = this.active.filter((b) => b.kind === 'chat');
    if (!story && chats.filter((b) => !b.story).length >= this.caps.chat) { this.stats.capped++; return false; }
    if (chats.length >= this.caps.storyChat) this.release(chats[0]);
    const sc = this.scene, art = this.art;
    const c = sc.add.container(0, 0).setDepth(DEPTH + 20);
    const body = art.nine(sc, 0, 0, 'ui_chat_bubble', 120, 56).setOrigin(0.5, 1);
    const tail = art.image(sc, 0, -20, 'ui_chat_tail').setOrigin(0.5, 0);
    const txt = sc.add.text(0, 0, text || '', { fontFamily: FONT, fontSize: '20px', fontStyle: '800', color: '#2b2f3a', align: 'center', lineSpacing: 2, resolution: 2, wordWrap: { width: CHAT_W_MAX - 30, useAdvancedWrap: true } }).setOrigin(0.5, 0.5);
    const icon = emote && art.has(emote) ? art.image(sc, 0, 0, emote).setOrigin(0.5, 0.5) : null;
    if (icon) icon.setScale(34 / Math.max(1, icon.frame.realWidth));
    const tw = Math.min(CHAT_W_MAX - 30, txt.width), th = txt.height;
    const w = Math.max(80, Math.min(CHAT_W_MAX, tw + 30 + (icon ? 38 : 0))), h = Math.max(56, th + 30);
    body.setSize(w, h);
    const cy = -h + 8 + (h - 26) / 2;
    if (icon) { icon.setPosition(-w / 2 + 12 + 19, cy); txt.setPosition(19, cy); } else txt.setPosition(0, cy);
    c.add([body, tail].concat(icon ? [icon] : []).concat([txt]));
    c.setScale(0.2);
    this.active.push({ kind: 'chat', c, who, t: 0, dur, k: 0, story });
    this.stats.chats++;
    if (this.voice && !opts.silent) { try { if (this.voice.speakBubble(text, who, emote)) this.stats.voiced++; } catch (e) { /* the bubble stays */ } }
    return true;
  }

  emote(who, key, dur = 1.6, opts = {}) {
    if (!who || !who.alive || !key || !this.art.has(key)) return false;
    this.clear(who, 'emote');
    const em = this.active.filter((b) => b.kind === 'emote');
    if (!opts.story && em.length >= this.caps.emote) this.release(em[0]);
    const sc = this.scene, art = this.art;
    const c = sc.add.container(0, 0).setDepth(DEPTH + 10);
    const bg = art.image(sc, 0, 0, 'ui_emote_bubble');
    const icon = art.image(sc, 0, 0, key).setOrigin(0.5, 0.5);
    const bs = 0.75;
    if (bg) { const d = art.def('ui_emote_bubble'); const cc = d.contentCenter || [0, -54]; bg.setScale(bs); icon.setPosition(cc[0] * bs, cc[1] * bs).setScale((64 / Math.max(1, icon.frame.realWidth)) * bs * 0.95); c.add(bg); }
    c.add(icon);
    c.setScale(0.2);
    this.active.push({ kind: 'emote', c, who, t: 0, dur, k: 0, dx: 0 });
    this.stats.emotes++;
    return true;
  }

  clear(who, kind) { for (let i = this.active.length - 1; i >= 0; i--) { const b = this.active[i]; if (b.who === who && (!kind || b.kind === kind)) this.release(b); } }
  release(b) { const i = this.active.indexOf(b); if (i >= 0) this.active.splice(i, 1); b.c.destroy(); }
  count(kind) { return this.active.filter((b) => b.kind === kind).length; }

  update(dt, now) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i], w = b.who;
      b.t += dt;
      if (!w || !w.alive || b.t >= b.dur + 0.18) { this.release(b); continue; }
      const out = b.t > b.dur ? (b.t - b.dur) / 0.18 : 0;
      b.k += ((out > 0 ? 0 : 1) - b.k) * Math.min(1, dt * 14);
      const sc = out > 0 ? Math.max(0.01, 1 - out) : Math.min(1.08, b.k * 1.08);
      const vis = !w.hidden && !w.inside;
      b.c.setVisible(vis);
      if (!vis) continue;
      const head = w.y + w.dy + w.headTop + (w.rest === 'sit' && !w.path ? 18 : 0);
      if (b.kind === 'chat') b.c.setPosition(w.x, head - 10 + Math.sin(now / 320 + w.x) * 1.5);
      else b.c.setPosition(w.x, head - 6 + Math.sin(now / 280 + w.y) * 2);
      b.c.setScale(sc);
      b.c.setDepth((b.kind === 'chat' ? DEPTH + 20 : DEPTH + 10) + w.y * 0.001);
    }
  }
}
