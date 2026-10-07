// Save / settings persistence. Every localStorage access is wrapped in try/catch
// (private mode, sandboxed iframes and full quotas must never crash the game).

export const SAVE_KEY = 'frostVillage.save.v1';
export const SETTINGS_KEY = 'frostVillage.settings.v1';

function getStore() {
  try { return window.localStorage || null; } catch (e) { return null; }
}

export function readJSON(key) {
  try {
    const st = getStore();
    if (!st) return null;
    const raw = st.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function writeJSON(key, obj) {
  try {
    const st = getStore();
    if (!st) return false;
    st.setItem(key, JSON.stringify(obj));
    return true;
  } catch (e) { return false; }
}

export function removeKey(key) {
  try { const st = getStore(); if (st) st.removeItem(key); } catch (e) { /* ignore */ }
}

export const Save = {
  load() {
    const s = readJSON(SAVE_KEY);
    if (!s || typeof s !== 'object' || s.v !== 1) return null;
    return s;
  },
  write(state) { return writeJSON(SAVE_KEY, Object.assign({ v: 1, t: Date.now() }, state)); },
  clear() { removeKey(SAVE_KEY); },
};

export const Settings = {
  data: { sound: true, music: true, lang: null },
  load() {
    const s = readJSON(SETTINGS_KEY);
    if (s && typeof s === 'object') Object.assign(this.data, s);
    return this.data;
  },
  save() { writeJSON(SETTINGS_KEY, this.data); },
};
