// 행복한 눈꽃마을 이야기 · Snowbloom Village (Frost Village) — build the claude.ai Artifact package.
//
// (v4-C2) PUBLISH WITH capabilities: { sample: {} } — the resident chat (주민과 수다 떨기) asks the viewer's Claude for
// replies through the `sample` capability when the page declares it (it falls back to the offline village voice
// when it is not declared or the viewer says no). artifact_files.json carries the same `capabilities` field.
//
//   cd frost-village/tools/build && npm install          (once: installs esbuild locally)
//   node frost-village/tools/build/build_artifact.mjs [--no-minify] [--mp3-only] [--inline] [--webp]
//
// Output: frost-village/dist/artifact/
//   index.html        body-only page (the Artifact host adds <!doctype><html><head><body> itself):
//                     <title>, inline <style>, the game container, lib/phaser.min.js, game.js
//   game.js           src/main.js + every module it imports, bundled by esbuild into ONE classic
//                     script (IIFE, ES2019) — no ES modules, no import(), no module workers
//   lib/              phaser.min.js (+ its licence)
//   assets/           copy of frost-village/assets (manifests, atlases, images, audio)
// and frost-village/dist/artifact_files.json — the list of supporting files to pass to the
// Artifact tool as `files` (with `root` = frost-village/dist/artifact).
//
// Host limits checked here: <= 255 files, <= 64 MB in total, <= 16 MB per file, page file without
// doctype/html/head/body tags. If the file count would exceed 255, the .ogg copies are dropped and
// the audio manifest is rewritten to point at the .mp3 files only (also forced by --mp3-only).
//
// --inline (fallback, output: frost-village/dist/artifact_inline/): for a host whose frame has an
//   opaque origin AND serves the files without CORS headers, where the normal build cannot load a
//   single asset (Phaser loads everything with XMLHttpRequest). Every asset is embedded into
//   packs/assets_N.js classic scripts (images as data: URIs, JSON as objects, audio as base64 mp3)
//   and inline_loader.js re-routes Phaser's loader to them: no XHR/fetch at all, so it also works
//   with connect-src 'self'. Bigger download (+33 % base64), so use it only if the normal build fails.
//
// --webp (optional, needs python3 + Pillow): re-encode the big PNGs of the COPY as WebP (q90,
//   lossless alpha) when that saves > 40 %, and rewrite the copied manifests. assets/ is untouched.
//   About -3 MB (7.6 -> 4.7 MB of images). Works with --inline too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');            // frost-village/
const args = process.argv.slice(2);
const MINIFY = !args.includes('--no-minify');
const INLINE = args.includes('--inline');
const WEBP = args.includes('--webp');
const FORCE_MP3_ONLY = args.includes('--mp3-only') || INLINE;   // mp3 plays everywhere; one format is enough

const OUT = path.join(ROOT, 'dist', INLINE ? 'artifact_inline' : 'artifact');
const LIST_OUT = path.join(ROOT, 'dist', INLINE ? 'artifact_inline_files.json' : 'artifact_files.json');
const PACK_MAX = 4 * 1024 * 1024;          // bytes of source data per packs/assets_N.js

// one Artifact publish: <= 255 files / 64 MB; one version may hold up to 511 files / 256 MB when it is
// sent in several publishes to the same url (artifact_files.json lists the batches)
// (v4 review M6) 64 MB is the limit of ONE publish (each batch below), 256 MB of the whole version
const LIMITS = { files: 255, maxFiles: 511, total: 64 * 1024 * 1024, version: 256 * 1024 * 1024, perFile: 16 * 1024 * 1024 };
// Media types the host serves (anything else is skipped with a warning).
const WEB_TYPES = new Set(['.html', '.js', '.json', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ogg', '.mp3', '.m4a', '.wav', '.css', '.txt', '.md', '.woff2']);
const NEVER_LOADED = /^assets\/[^/]+\/bgm_spring\./;
const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\..*)$|\.(py|pyc|blend|blend1|psd|kra|xcf|aup3)$/i;

function loadEsbuild() {
  const require = createRequire(import.meta.url);
  try { return require('esbuild'); } catch (e) {
    console.error('\n[build] esbuild is not installed. Run this once:\n    cd ' + path.relative(process.cwd(), HERE) + ' && npm install\n');
    process.exit(1);
  }
}

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const rel = (p) => path.relative(OUT, p).split(path.sep).join('/');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// ------------------------------------------------------------------ page (body content only)
const PAGE = `<title>행복한 눈꽃마을 이야기</title>
<style>
  /* One-screen game: a portrait canvas centred on a deep, snowy night sky.
     Single dark look on purpose (no light theme), so every colour is set here explicitly. */
  :root {
    color-scheme: dark;
    --night: #0f1a2c;          /* page ground */
    --night-high: #1d3150;     /* glow behind the game */
    --frost: #eaf2fb;          /* text */
    --frost-dim: #9fb6d3;      /* secondary text */
    --ice: #7cc0ff;            /* snowflake accent */
    --panel: #fff8ec;          /* error card (game UI cream) */
    --panel-ink: #2b2f3a;
    --font: Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif;
  }
  html, body {
    margin: 0; width: 100%; height: 100%;
    overflow: hidden; overscroll-behavior: none;
    touch-action: none; -webkit-touch-callout: none;
    -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  body {
    color: var(--frost);
    font-family: var(--font);
    background-color: var(--night);
    background-image:
      radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,.55) 50%, transparent 51%),
      radial-gradient(1px 1px at 78% 9%, rgba(255,255,255,.45) 50%, transparent 51%),
      radial-gradient(2px 2px at 64% 72%, rgba(255,255,255,.35) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 28% 84%, rgba(255,255,255,.4) 50%, transparent 51%),
      radial-gradient(1px 1px at 90% 46%, rgba(255,255,255,.5) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 6% 58%, rgba(255,255,255,.35) 50%, transparent 51%),
      radial-gradient(ellipse 70% 60% at 50% 45%, var(--night-high) 0%, var(--night) 100%);
    background-size: 220px 260px, 180px 200px, 260px 240px, 240px 300px, 200px 220px, 300px 280px, 100% 100%;
  }
  /* The host pads :root by the phone's safe-area insets; a fixed layer ignores that, so add them here. */
  #game {
    position: fixed; left: 0; right: 0;
    top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px);
  }
  #game canvas { display: block; touch-action: none; outline: none; }
  #fv-loading {
    position: fixed; inset: 0; z-index: 2; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    background: inherit; color: var(--frost);
    font-weight: 800; font-size: 22px; letter-spacing: 0.02em;
    pointer-events: none; transition: opacity .35s ease;
  }
  #fv-loading .flake { font-size: 44px; line-height: 1; color: var(--ice); animation: fvspin 2.4s linear infinite; }
  #fv-loading small { font-weight: 600; font-size: 13px; color: var(--frost-dim); letter-spacing: 0.08em; }
  #fv-loading.hide { opacity: 0; }
  @keyframes fvspin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { #fv-loading .flake { animation: none; } }
  #fv-error {
    display: none; position: fixed; z-index: 3; left: 16px; right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px)); padding: 12px 14px;
    border-radius: 12px; background: var(--panel); color: var(--panel-ink);
    font: 600 14px/1.45 var(--font); box-shadow: 0 4px 16px rgba(0,0,0,.35);
  }
  #fv-error small { display: block; margin-top: 4px; font-weight: 500; font-size: 12px; color: #5d6b80; word-break: break-all; }
  #fv-error button {
    margin: 10px 8px 0 0; padding: 9px 14px; border: 0; border-radius: 10px; font: 800 14px var(--font);
    color: #fff; background: #3d8be0; cursor: pointer;
  }
  #fv-error button.gray { background: #8e99a8; }
  /* landscape phone: ask to rotate (the game is portrait) */
  #fv-rotate {
    display: none; position: fixed; inset: 0; z-index: 4; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; background: var(--night); color: var(--frost); font-weight: 800; font-size: 20px; text-align: center;
  }
  #fv-rotate .phone { font-size: 46px; animation: fvrot 1.8s ease-in-out infinite; }
  #fv-rotate small { font-weight: 600; font-size: 13px; color: var(--frost-dim); }
  @keyframes fvrot { 0%, 30% { transform: rotate(-90deg); } 60%, 100% { transform: rotate(0deg); } }
  @media (orientation: landscape) and (max-height: 500px) and (pointer: coarse) { #fv-rotate { display: flex; } }
</style>
<div id="game"></div>
<div id="fv-loading"><div class="flake">❄</div><div>행복한 눈꽃마을 이야기</div><small>SNOWBLOOM VILLAGE · 불러오는 중…</small></div>
<div id="fv-rotate"><div class="phone">📱</div><div>휴대폰을 세로로 돌려 주세요</div><small>Please rotate your phone to portrait</small></div>
<div id="fv-error" role="alert"></div>
<script>
  // Friendly messages: registered first and in the capture phase so a failed <script> load is seen too.
  // After boot only errors that actually stopped the game loop are reported (with Reload / Start over).
  (function () {
    var box = document.getElementById('fv-error'), shown = false;
    function show(msg, detail, crash) {
      if (shown || !box) return;
      shown = true;
      box.innerHTML = '';
      var p = document.createElement('div'); p.textContent = msg; box.appendChild(p);
      if (detail) { var d = document.createElement('small'); d.textContent = detail; box.appendChild(d); }
      var b = document.createElement('button'); b.textContent = '새로고침 · Reload'; b.onclick = function () { location.reload(); }; box.appendChild(b);
      if (crash) {
        var f = document.createElement('button'); f.className = 'gray'; f.textContent = '처음부터 하기 · Start over';
        f.onclick = function () {
          window.__FV_NO_SAVE = true;   // the crashed game must not write its state back while the page unloads
          try { var k = 'frostVillage.save.v1', v = localStorage.getItem(k); if (v) localStorage.setItem(k + '.bad', v); localStorage.removeItem(k); localStorage.removeItem(k + '.chat'); } catch (e) { /* */ }
          location.reload();
        };
        box.appendChild(f);
      }
      box.style.display = 'block';
    }
    window.__FV_SHOW_ERROR = show;
    function checkAlive(detail) {
      var g = window.__FV && window.__FV.game;
      if (!g || !g.loop) return;
      var f = g.loop.frame;
      setTimeout(function () {
        if (g.loop.frame === f && g.loop.running && document.visibilityState === 'visible') show('문제가 생겨서 게임이 멈췄어요. 새로고침 해 주세요.', detail, true);
      }, 1500);
    }
    window.addEventListener('error', function (e) {
      var el = e && e.target, isScript = el && el.tagName === 'SCRIPT';
      if (!isScript && !(e && e.message)) return;
      var detail = (e && e.message) || ('could not load ' + String(el && el.src).split('/').pop());
      if (!window.__FV_BOOTED) show('게임을 불러오지 못했어요. 새로고침 해 주세요.', detail);
      else checkAlive(detail);
    }, true);
    window.addEventListener('unhandledrejection', function (e) { if (window.__FV_BOOTED) checkAlive(String(e && e.reason)); });
    setTimeout(function () {
      if (!window.__FV_BOOTED) show('게임을 불러오지 못했어요. 새로고침 해 주세요.', 'The game files could not be loaded (blocked or offline).');
    }, 20000);
  })();
</script>
<script src="lib/phaser.min.js"></script>
<script src="game.js"></script>
`;

// ------------------------------------------------------------------ --inline: Phaser loader shim
// Runs after lib/phaser.min.js and the packs, before game.js. ES5 on purpose.
const INLINE_LOADER = `/* Frost Village inline-asset loader (generated by tools/build/build_artifact.mjs --inline).
   Phaser normally loads every file with XMLHttpRequest. Here the files come from window.__FV_PACK
   (packs/assets_N.js): JSON as objects, images as data: URIs, audio decoded from base64. */
(function () {
  var P = window.__FV_PACK;
  if (!P || !window.Phaser || !Phaser.Loader || !Phaser.Loader.FileTypesManager) return;
  var L = Phaser.Loader, FTM = L.FileTypesManager, orig = {};
  FTM.install(orig);
  var own = Object.prototype.hasOwnProperty;
  function has(u) { return typeof u === 'string' && own.call(P, u); }
  function res(u) { return has(u) ? P[u] : u; }
  FTM.register('json', function (key, url, dataKey, xhr) {
    return orig.json.call(this, key, typeof key === 'string' ? res(url) : url, dataKey, xhr);
  });
  FTM.register('image', function (key, url, xhr) {
    return orig.image.call(this, key, typeof key === 'string' ? res(url) : url, xhr);
  });
  FTM.register('spritesheet', function (key, url, cfg, xhr) {
    return orig.spritesheet.call(this, key, typeof key === 'string' ? res(url) : url, cfg, xhr);
  });
  FTM.register('atlas', function (key, tex, atlas, tx, ax) {
    if (typeof key === 'string') { tex = res(tex); atlas = res(atlas); }
    return orig.atlas.call(this, key, tex, atlas, tx, ax);
  });

  // Audio: decode the embedded mp3 with the game's AudioContext (works before the first tap).
  var InlineAudio = new Phaser.Class({
    Extends: L.File,
    initialize: function InlineAudio(loader, key, uri) {
      L.File.call(this, loader, { type: 'audio', cache: loader.cacheManager.audio, extension: 'mp3', key: key, url: 'inline/' + key + '.mp3' });
      this.uri = uri;
    },
    load: function () {
      var file = this, loader = this.loader, done = false;
      var sm = loader.systems.game.sound, ctx = sm && sm.context;
      this.state = L.FILE_LOADING;
      function ok(buf) { if (done) return; done = true; file.data = buf; file.state = L.FILE_LOADED; loader.nextFile(file, true); }
      function fail(e) { if (done) return; done = true; console.warn('[FrostVillage] could not decode audio ' + file.key, e && e.message); loader.nextFile(file, false); }
      try {
        var bin = atob(this.uri.slice(this.uri.indexOf(',') + 1)), n = bin.length, u8 = new Uint8Array(n);
        for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
        var pr = ctx.decodeAudioData(u8.buffer, ok, fail);
        if (pr && pr.then) pr.then(ok, fail);
      } catch (e) { fail(e); }
    },
    onProcess: function () { this.state = L.FILE_PROCESSING; this.onProcessComplete(); }
  });
  FTM.register('audio', function (key, urls, config, xhr) {
    var sm = this.systems && this.systems.game && this.systems.game.sound;
    if (typeof key === 'string' && sm && sm.context) {
      var list = Array.isArray(urls) ? urls : [urls];
      for (var i = 0; i < list.length; i++) {
        if (has(list[i]) && String(P[list[i]]).indexOf('data:audio/') === 0) { this.addFile(new InlineAudio(this, key, P[list[i]])); return this; }
      }
    }
    return orig.audio.call(this, key, urls, config, xhr);
  });
})();
`;

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

/** move every file under OUT/assets into packs/assets_N.js; returns the pack paths (relative) */
function writePacks() {
  const files = walk(path.join(OUT, 'assets')).sort();
  const packs = [];
  let parts = [], bytes = 0;
  const flush = () => {
    if (!parts.length) return;
    const name = `packs/assets_${packs.length + 1}.js`;
    const body = '/* Frost Village assets (generated by tools/build/build_artifact.mjs --inline) */\n(function (P) {\n' + parts.join('\n') + '\n})(window.__FV_PACK = window.__FV_PACK || {});\n';
    fs.mkdirSync(path.join(OUT, 'packs'), { recursive: true });
    fs.writeFileSync(path.join(OUT, name), body);
    packs.push(name);
    parts = []; bytes = 0;
  };
  for (const f of files) {
    const r = rel(f), ext = path.extname(f).toLowerCase();
    const buf = fs.readFileSync(f);
    let val;
    if (ext === '.json') val = JSON.stringify(JSON.parse(buf.toString('utf8')));
    else if (MIME[ext]) val = JSON.stringify('data:' + MIME[ext] + ';base64,' + buf.toString('base64'));
    else { console.log('  (inline) skipped ' + r); continue; }
    if (bytes && bytes + buf.length > PACK_MAX) flush();
    parts.push('P[' + JSON.stringify(r) + ']=' + val + ';');
    bytes += buf.length;
  }
  flush();
  fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
  return packs;
}

/** asset folders the game loads: the FRAGMENTS list in src/core/Assets.js (only the ones that exist) */
function gameFragments() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'Assets.js'), 'utf8');
  const m = src.match(/export\s+const\s+FRAGMENTS\s*=\s*\[([^\]]*)\]/);
  let list = m ? (m[1].match(/['"]([a-z0-9_-]+)['"]/gi) || []).map((s) => s.slice(1, -1)) : [];
  if (!list.length) list = ['characters', 'props', 'fx', 'ui', 'ground', 'audio'];
  // a fragment still being made (no manifest yet) is left out of the package AND of the page's
  // fragment list (window.__FV_FRAGMENTS), so the published game never asks for a missing file
  return list.filter((f) => fs.existsSync(path.join(ROOT, 'assets', f, 'manifest.json')));
}

/** (v4) fragments the game fetches late, while the village plays (LATE_FRAGMENTS in src/core/Assets.js):
 *  packaged like the others, but never in the boot list (window.__FV_FRAGMENTS) */
function lateFragments() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'Assets.js'), 'utf8');
  const m = src.match(/export\s+const\s+LATE_FRAGMENTS\s*=\s*\[([^\]]*)\]/);
  const list = m ? (m[1].match(/['"]([a-z0-9_-]+)['"]/gi) || []).map((s) => s.slice(1, -1)) : [];
  return list.filter((f) => fs.existsSync(path.join(ROOT, 'assets', f, 'manifest.json')));
}

/**
 * (v4-C2) leave out what the game never loads (src/core/Assets.js):
 *  - USED_ONLY {fragment: [keys]}: fragments of which only some keys are used yet (audio5 = amb_sea_waves, audio4 =
 *    the title's ferry horn + gull, water = its data textures + the sheets the village plays);
 *  - OLD_TITLE: the old title screen's pictures;
 *  - title: entries the title never loads (loadAtTitle: false) and the app icons (not used by the page).
 * The copied manifests are rewritten and the files of the dropped entries removed.
 */
function assetsConst(name) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'Assets.js'), 'utf8');
  if (name === 'USED_ONLY') {
    const m = src.match(/export\s+const\s+USED_ONLY\s*=\s*(\{[^\n]*\});/);
    try { return m ? JSON.parse(m[1]) : {}; } catch (e) { console.log('[build] USED_ONLY could not be read: ' + e.message); return {}; }
  }
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*/(.+)/;'));
  return m ? new RegExp(m[1]) : null;
}
function pruneUnusedKeys(frags, skipped) {
  const USED = assetsConst('USED_ONLY'), OLD = assetsConst('OLD_TITLE');
  for (const f of frags) {
    const mp = path.join(OUT, 'assets', f, 'manifest.json');
    if (!fs.existsSync(mp)) continue;
    const j = JSON.parse(fs.readFileSync(mp, 'utf8'));
    const only = USED[f] ? new Set(USED[f]) : null;
    const drop = (key, entry) => (only && !only.has(key)) || (OLD && OLD.test(key)) || (f === 'title' && entry && entry.loadAtTitle === false);
    const gone = [];
    let changed = false;
    for (const kind of ['atlases', 'images', 'spritesheets']) {
      if (!Array.isArray(j[kind])) continue;
      j[kind] = j[kind].filter((a) => { if (!a || !drop(a.key, a)) return true; gone.push(a.png, a.json); changed = true; return false; });
    }
    if (j.audio) for (const k of Object.keys(j.audio)) if (drop(k, j.audio[k])) { gone.push(...(j.audio[k].files || [])); delete j.audio[k]; changed = true; }
    if (j.audioGroups) for (const g of Object.keys(j.audioGroups)) {
      const keep = (j.audioGroups[g] || []).filter((k) => j.audio && j.audio[k]);
      if (keep.length) j.audioGroups[g] = keep; else delete j.audioGroups[g];
    }
    if (j.sprites && only) for (const k of Object.keys(j.sprites)) if (!only.has(k) && !(j.images || []).some((a) => a.key === k)) delete j.sprites[k];
    for (const p of gone.filter(Boolean)) { const fp = path.join(OUT, 'assets', p); if (fs.existsSync(fp)) { fs.rmSync(fp); skipped.push('assets/' + p + ' (not used by the game yet)'); } }
    if (f === 'title') { const ic = path.join(OUT, 'assets', 'title', 'icon'); if (fs.existsSync(ic)) { fs.rmSync(ic, { recursive: true }); skipped.push('assets/title/icon/ (app icons: not used by the page)'); } }
    if (changed) fs.writeFileSync(mp, JSON.stringify(j));
  }
}

/**
 * (v4-C2) the 511-file limit of one artifact version: a frame list (atlas .json up to EMBED_FRAME_JSON bytes) whose
 * picture loads at boot (or whose fragment is a late one, fetched with its manifest) goes into its manifest as `data`
 * (Assets.queueAssets passes it to Phaser instead of a URL), so it costs no extra download. Lazy fragments' lists stay
 * separate files (they would make the boot manifest heavier). The title bake's stage frame lists go into
 * title_bake.json (src/title/TitleAssets.js reads `data` the same way).
 */
const EMBED_FRAME_JSON = 64000;
// (v4 review M6) small frame lists of the after-title fragments ride inside their manifests too, up to this many bytes
// in all (each costs a file of the 511 a version may hold; their manifests load at boot, so the total stays small)
const EMBED_LAZY_TOTAL = 160000;
function embedFrameLists(frags, late, skipped) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'Assets.js'), 'utf8');
  const lm = src.match(/export\s+const\s+LAZY_FRAGMENTS\s*=\s*\[([^\]]*)\]/);
  const lazy = lm ? (lm[1].match(/['"]([a-z0-9_-]+)['"]/gi) || []).map((x) => x.slice(1, -1)) : [];
  const em = src.match(/const\s+EAGER_KEYS\s*=\s*new Set\(\[([^\]]*)\]\)/);
  const eager = new Set(em ? (em[1].match(/['"]([a-z0-9_-]+)['"]/gi) || []).map((x) => x.slice(1, -1)) : []);
  const out = { n: 0, bytes: 0 };
  let lazyBytes = 0;
  for (const f of frags.concat(late)) {
    const mp = path.join(OUT, 'assets', f, 'manifest.json');
    if (!fs.existsSync(mp)) continue;
    const j = JSON.parse(fs.readFileSync(mp, 'utf8'));
    let changed = false;
    for (const a of j.atlases || []) {
      if (!a || !a.json || a.data || a.format === 'tfatlas') continue;
      const jp = path.join(OUT, 'assets', a.json);
      if (!fs.existsSync(jp) || fs.statSync(jp).size > EMBED_FRAME_JSON) continue;
      if (lazy.includes(f) && !eager.has(a.key)) { if (lazyBytes + fs.statSync(jp).size > EMBED_LAZY_TOTAL) continue; lazyBytes += fs.statSync(jp).size; }
      // (another manifest pointing at the same file keeps it)
      if (frags.concat(late).some((g) => g !== f && fs.existsSync(path.join(OUT, 'assets', g, 'manifest.json')) && fs.readFileSync(path.join(OUT, 'assets', g, 'manifest.json'), 'utf8').includes('"' + a.json + '"'))) continue;
      a.data = JSON.parse(fs.readFileSync(jp, 'utf8'));
      out.bytes += fs.statSync(jp).size;
      fs.rmSync(jp);
      skipped.push('assets/' + a.json + ' (embedded in ' + f + '/manifest.json)');
      delete a.json;
      changed = true;
      out.n++;
    }
    if (changed) fs.writeFileSync(mp, JSON.stringify(j));
  }
  // the title diorama's stage atlases
  const tb = path.join(OUT, 'assets', 'title_bake', 'title_bake.json');
  if (fs.existsSync(tb)) {
    const j = JSON.parse(fs.readFileSync(tb, 'utf8'));
    let changed = false;
    for (const k in j.files || {}) {
      const fe = j.files[k];
      if (!fe || !fe.json) continue;
      const jp = path.join(OUT, 'assets', 'title_bake', fe.json);
      if (!fs.existsSync(jp) || fs.statSync(jp).size > EMBED_FRAME_JSON) continue;
      fe.data = JSON.parse(fs.readFileSync(jp, 'utf8'));
      out.bytes += fs.statSync(jp).size;
      fs.rmSync(jp);
      skipped.push('assets/title_bake/' + fe.json + ' (embedded in title_bake.json)');
      delete fe.json;
      changed = true; out.n++;
    }
    if (changed) fs.writeFileSync(tb, JSON.stringify(j));
  }
  return out;
}

/** (v3.5) drop the atlas / image entries (and their files) of the copied manifests that the game never loads */
function pruneOverridden(frags, skipped) {
  const mans = {};
  for (const f of frags) { const mp = path.join(OUT, 'assets', f, 'manifest.json'); if (fs.existsSync(mp)) mans[f] = JSON.parse(fs.readFileSync(mp, 'utf8')); }
  const winner = {};          // 'atlases:key' -> fragment (the last one listing it)
  const chars = {}, sprites = {};
  for (const f of frags) {
    const j = mans[f]; if (!j) continue;
    for (const kind of ['atlases', 'images']) for (const a of j[kind] || []) if (a && a.key) winner[kind + ':' + a.key] = f;
    Object.assign(chars, j.characters || {});
    Object.assign(sprites, j.sprites || {});
  }
  const used = new Set();
  for (const k in chars) if (chars[k] && chars[k].atlas) used.add(chars[k].atlas);
  for (const k in sprites) if (sprites[k] && sprites[k].atlas) used.add(sprites[k].atlas);
  for (const f of frags) {
    const j = mans[f]; if (!j) continue;
    let changed = false;
    for (const kind of ['atlases', 'images']) {
      if (!Array.isArray(j[kind])) continue;
      j[kind] = j[kind].filter((a) => {
        const lost = winner[kind + ':' + a.key] !== f;
        const unused = kind === 'atlases' && /^(vil_|wkr_|char_)/.test(a.key) && !used.has(a.key);
        if (!lost && !unused) return true;
        for (const p of [a.png, a.json]) {
          if (!p) continue;
          // (the same file may be listed by the winning fragment too: keep it then)
          const keep = frags.some((g) => g !== f && mans[g] && (mans[g][kind] || []).some((b) => b.png === p || b.json === p));
          const fp = path.join(OUT, 'assets', p);
          if (!keep && fs.existsSync(fp)) fs.rmSync(fp);
        }
        skipped.push('assets/' + (a.png || a.key) + (lost ? ' (replaced by assets/' + winner[kind + ':' + a.key] + ')' : ' (no character uses it)'));
        changed = true;
        return false;
      });
    }
    if (changed) fs.writeFileSync(path.join(OUT, 'assets', f, 'manifest.json'), JSON.stringify(j));
  }
}

/** fragments whose pictures the game does not use yet (manifest data only): MANIFEST_ONLY_FRAGMENTS */
function manifestOnlyFragments() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'Assets.js'), 'utf8');
  const m = src.match(/export\s+const\s+MANIFEST_ONLY_FRAGMENTS\s*=\s*\[([^\]]*)\]/);
  return m ? (m[1].match(/['"]([a-z0-9_-]+)['"]/gi) || []).map((s) => s.slice(1, -1)) : [];
}

/** the shipped fragment list, set before the game starts.
 *  ((v4 review L4) it rides at the top of game.js, not in the page: the page goes out with the FIRST publish of a
 *  multi-publish update, game.js with the LAST, so a page opened in between keeps the old code with its own old list) */
function pageWithFragments(page) { return page; }
function stampFragments(frags) {
  const f = path.join(OUT, 'game.js');
  fs.writeFileSync(f, 'window.__FV_FRAGMENTS = ' + JSON.stringify(frags) + ';\n' + fs.readFileSync(f, 'utf8'));
}

/**
 * (v3.5) split the supporting files into publishes of <= `size` files. The files the page boots from
 * (game.js, lib/, every manifest.json) go in the LAST publish: a page opened between two publishes then
 * runs the previous version with its own manifests (an update in place) instead of new manifests that
 * point at pictures still missing, or old code with new manifests. An atlas .png and its .json (same
 * name) always travel together, so a picture never meets the frame list of another build.
 */
function publishBatches(files, size) {
  // ((v4 review L4) chat.js and the title's bake list load at boot too: they travel with game.js)
  const isBoot = (p) => p === 'game.js' || p === 'chat.js' || p.startsWith('lib/') || /(^|\/)manifest\.json$/.test(p) || p === 'assets/_packed/index.json' || p === 'assets/title_bake/title_bake.json';
  const boot = files.filter(isBoot);
  const groups = new Map();
  for (const p of files.filter((f) => !isBoot(f))) { const k = p.replace(/\.[^./]+$/, ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const batches = [[]];
  for (const g of groups.values()) {
    if (batches[batches.length - 1].length + g.length > size) batches.push([]);
    batches[batches.length - 1].push(...g);
  }
  if (batches[batches.length - 1].length + boot.length > size) batches.push([]);
  batches[batches.length - 1].push(...boot);
  return batches.filter((b) => b.length);
}

/**
 * (v4-B, docs/v4_plan.md §11.3a) ship the packed pages (assets/_packed, tools/build/pack_pages.py) instead of the
 * raw atlases they were made from: the copied manifests keep the atlas key (Assets.applyPages needs it) without
 * its files, the raw files are left out, the pages and a filtered index.json go in.
 */
// (v4-B) page frame lists up to this size (bytes) are embedded in _packed/index.json, up to EMBED_TOTAL in all:
// the package has to stay within two publishes (<= 510 files)
const EMBED_PAGE_JSON = 24000, EMBED_TOTAL = 900000;
const embedded = { n: 0, bytes: 0 };
function shipPacked(frags, skipped, copied) {
  const idxPath = path.join(ROOT, 'assets', '_packed', 'index.json');
  if (!fs.existsSync(idxPath)) return 0;
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const out = { version: idx.version, tool: idx.tool, atlases: {} };
  const mans = {};
  let n = 0;
  for (const key in idx.atlases || {}) {
    const e = idx.atlases[key];
    if (!frags.includes(e.frag)) continue;
    const mp = path.join(OUT, 'assets', e.frag, 'manifest.json');
    if (!fs.existsSync(mp)) continue;
    const j = mans[e.frag] || (mans[e.frag] = JSON.parse(fs.readFileSync(mp, 'utf8')));
    const a = (j.atlases || []).find((x) => x && x.key === key);
    if (!a || !a.png) continue;
    if (!e.pages.every((pg) => fs.existsSync(path.join(ROOT, 'assets', pg.png)) && fs.existsSync(path.join(ROOT, 'assets', pg.json)))) continue;
    for (const p of [a.png, a.json]) { const fp = path.join(OUT, 'assets', p); if (fs.existsSync(fp)) fs.rmSync(fp); }
    skipped.push('assets/' + a.png + ' (shipped as ' + e.pages.length + ' packed pages)');
    delete a.png; delete a.json; a.packed = true;
    const e2 = Object.assign({}, e, { pages: e.pages.map((pg) => Object.assign({}, pg)) });
    for (const pg of e2.pages) {
      // (v4-B, the 511-file limit) a small page's frame list rides inside index.json instead of its own file
      const jp = path.join(ROOT, 'assets', pg.json);
      const jb = fs.statSync(jp).size;
      if (jb <= EMBED_PAGE_JSON && embedded.bytes + jb <= EMBED_TOTAL) { pg.data = JSON.parse(fs.readFileSync(jp, 'utf8')); delete pg.json; embedded.n++; embedded.bytes += jb; }
      for (const p of [pg.png, pg.json]) {
        if (!p) continue;
        const dst = path.join(OUT, 'assets', p);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(ROOT, 'assets', p), dst);
        copied.push(dst);
      }
    }
    out.atlases[key] = e2;
    n++;
  }
  for (const f in mans) fs.writeFileSync(path.join(OUT, 'assets', f, 'manifest.json'), JSON.stringify(mans[f]));
  if (n) { fs.writeFileSync(path.join(OUT, 'assets', '_packed', 'index.json'), JSON.stringify(out)); copied.push(path.join(OUT, 'assets', '_packed', 'index.json')); }
  if (embedded.n) console.log(`[build] packed pages: ${embedded.n} small frame lists embedded in _packed/index.json (${(embedded.bytes / 1024).toFixed(0)} KB)`);
  return n;
}

// ------------------------------------------------------------------ build
async function main() {
  const t0 = Date.now();
  const esbuild = loadEsbuild();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1) bundle the game into one classic script
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'main.js')],
    outfile: path.join(OUT, 'game.js'),
    bundle: true,
    format: 'iife',
    target: 'es2019',
    platform: 'browser',
    minify: MINIFY,
    legalComments: 'none',
    charset: 'ascii',            // Korean text as \\u escapes: safe whatever charset the host serves .js with
    logLevel: 'warning',
    banner: { js: '/* Snowbloom Village (Frost Village) - generated from src/ by tools/build/build_artifact.mjs. Do not edit this file: change src/ and rebuild. Phaser is loaded separately (lib/phaser.min.js, MIT licence). */' },
    // (v4-C2) the bundle loads the resident-chat code as its own script (chat.js) the first time a chat opens
    define: { __FV_BUNDLED__: 'true' },
    metafile: true,
  });
  if (res.errors.length) throw new Error('esbuild failed');
  const bundled = Object.keys(res.metafile.inputs).length;
  // (v4-C2) chat.js: src/chat (~200 KB) is not needed at first paint; src/systems/ResidentChat.js adds this script on
  // the first 수다 떨기 (it sets window.__FV_CHAT_MOD)
  const resChat = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'chat', 'index.js')],
    outfile: path.join(OUT, 'chat.js'),
    bundle: true, format: 'iife', globalName: '__FV_CHAT_MOD', target: 'es2019', platform: 'browser',
    minify: MINIFY, legalComments: 'none', charset: 'ascii', logLevel: 'warning',
    banner: { js: '/* Snowbloom Village resident chat (src/chat) - generated by tools/build/build_artifact.mjs. */' },
    metafile: true,
  });
  if (resChat.errors.length) throw new Error('esbuild (chat.js) failed');
  // the game bundle must not contain the chat modules (they would be shipped twice)
  const inGame = Object.keys(res.metafile.inputs).filter((f) => /src\/chat\//.test(f));
  if (inGame.length) throw new Error('game.js bundles src/chat (' + inGame.join(', ') + '): import it only through ResidentChat.loadChatModule');

  // 2) copy lib/ and assets/
  const copied = [];
  const skipped = [];
  const copy = (src) => {
    const r = path.relative(ROOT, src).split(path.sep).join('/');
    if (JUNK.test(r)) { skipped.push(r + ' (not a game file)'); return; }
    // (v3.5 review) made for a later version and never requested by the game (Assets.js V3_ONLY)
    if (NEVER_LOADED.test(r)) { skipped.push(r + ' (not loaded by the game yet)'); return; }
    if (!WEB_TYPES.has(path.extname(src).toLowerCase())) { skipped.push(r + ' (unsupported type)'); return; }
    const dst = path.join(OUT, r);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied.push(dst);
  };
  copy(path.join(ROOT, 'lib', 'phaser.min.js'));
  if (fs.existsSync(path.join(ROOT, 'lib', 'PHASER_LICENSE.md'))) copy(path.join(ROOT, 'lib', 'PHASER_LICENSE.md'));
  // only the asset folders the game actually loads (FRAGMENTS in src/core/Assets.js): folders that are
  // still being made (new characters, emotes, ...) stay out of the package until the game uses them
  const frags = gameFragments();
  const late = lateFragments();
  const manifestOnly = manifestOnlyFragments();
  for (const frag of frags.concat(late)) {
    const dir = path.join(ROOT, 'assets', frag);
    if (!fs.existsSync(dir)) continue;
    if (manifestOnly.includes(frag)) {
      // manifest data only: copy the manifest without its picture lists
      const j = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      delete j.atlases; delete j.images; delete j.spritesheets; delete j.audio; delete j.audioGroups; delete j.characters;
      fs.mkdirSync(path.join(OUT, 'assets', frag), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'assets', frag, 'manifest.json'), JSON.stringify(j));
      copied.push(path.join(OUT, 'assets', frag, 'manifest.json'));
      skipped.push('assets/' + frag + '/ pictures (not used by the game yet)');
      continue;
    }
    for (const f of walk(dir)) copy(f);
  }
  // (v3.5) pictures a later fragment replaced (same atlas / image key: villagers3's chef, aunt and
  // blacksmith) or that no character uses any more (the old dog atlas, pets2 has the new one) are never
  // loaded by the game (Assets.mergeManifests: the later fragment wins key by key): leave them out
  pruneUnusedKeys(frags.concat(late), skipped);
  pruneOverridden(frags, skipped);
  const packedN = shipPacked(frags.concat(late), skipped, copied);
  // (v4-C2, the 511-file limit) small frame lists that load with their manifest anyway ride inside it
  const emb = embedFrameLists(frags, late, skipped);
  if (emb.n) console.log(`[build] ${emb.n} small frame lists embedded in their manifests (${(emb.bytes / 1024).toFixed(0)} KB, no extra download: they load with the manifest anyway)`);
  if (packedN) console.log(`[build] packed pages: ${packedN} atlases shipped as pages (assets/_packed)`);
  const notLoaded = fs.readdirSync(path.join(ROOT, 'assets'), { withFileTypes: true }).filter((e) => e.isDirectory() && !frags.includes(e.name) && !late.includes(e.name)).map((e) => 'assets/' + e.name + '/');
  if (notLoaded.length) skipped.push(...notLoaded.map((d) => d + ' (not loaded by the game yet)'));

  // 2b) optional WebP re-encode of the copy
  if (WEBP) {
    try {
      const out = execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(HERE, 'webp_assets.py'), OUT, '90'], { encoding: 'utf8' });
      const r = JSON.parse(out.trim().split('\n').pop());
      if (r.error) throw new Error(r.error);
      console.log(`[build] --webp: ${r.converted} images as WebP, ${mb(r.png_bytes)} -> ${mb(r.webp_bytes)}`);
    } catch (e) {
      console.log('[build] --webp skipped (needs python3 with Pillow): ' + String(e.message || e).split('\n')[0]);
    }
  }

  // 3) the page (written in step 5 for --inline, once the packs exist)
  stampFragments(frags);
  if (!INLINE) fs.writeFileSync(path.join(OUT, 'index.html'), pageWithFragments(PAGE));

  // 4) file-count limit: drop .ogg and point the audio manifest at .mp3 only
  let files = walk(OUT);
  let mp3Only = FORCE_MP3_ONLY;
  if (files.length > LIMITS.files) { mp3Only = true; console.log(`[build] ${files.length} files > ${LIMITS.files}: dropping .ogg copies`); }
  if (mp3Only) for (const frag of frags.concat(late)) {
    const manPath = path.join(OUT, 'assets', frag, 'manifest.json');
    if (!fs.existsSync(manPath)) continue;
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    if (!man.audio) continue;
    for (const k in man.audio || {}) {
      const a = man.audio[k];
      const mp3 = (a.files || []).filter((f) => /\.mp3$/i.test(f));
      if (mp3.length) a.files = mp3;
    }
    fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
  }
  if (mp3Only) { for (const f of files) if (/\.ogg$/i.test(f)) fs.rmSync(f); files = walk(OUT); }

  // 5) checks: every manifest path exists, nothing absolute, no leftovers
  const problems = [];
  const referenced = new Set();
  for (const frag of gameFragments().concat(lateFragments())) {
    const mp = path.join(OUT, 'assets', frag, 'manifest.json');
    if (!fs.existsSync(mp)) { problems.push('missing assets/' + frag + '/manifest.json'); continue; }
    referenced.add('assets/' + frag + '/manifest.json');
    const j = JSON.parse(fs.readFileSync(mp, 'utf8'));
    const paths = [];
    for (const kind of ['atlases', 'images', 'spritesheets']) for (const a of j[kind] || []) paths.push(a.png, a.json);
    for (const k in j.audio || {}) paths.push(...(j.audio[k].files || []));
    for (const p of paths.filter(Boolean)) {
      if (NEVER_LOADED.test('assets/' + p)) continue;     // listed, but never requested by the game
      if (/^(\/|[a-z]+:)/i.test(p)) problems.push(`absolute URL in ${frag}/manifest.json: ${p}`);
      const fp = path.join(OUT, 'assets', p);
      referenced.add('assets/' + p);
      if (!fs.existsSync(fp)) problems.push(`assets/${p} is listed in ${frag}/manifest.json but missing`);
    }
  }
  // (v4-B) the packed pages listed by assets/_packed/index.json
  const pidx = path.join(OUT, 'assets', '_packed', 'index.json');
  if (fs.existsSync(pidx)) {
    referenced.add('assets/_packed/index.json');
    const j = JSON.parse(fs.readFileSync(pidx, 'utf8'));
    for (const key in j.atlases || {}) for (const pg of j.atlases[key].pages || []) for (const p of [pg.png, pg.json].filter(Boolean)) {
      referenced.add('assets/' + p);
      if (!fs.existsSync(path.join(OUT, 'assets', p))) problems.push(`assets/${p} is listed in _packed/index.json but missing`);
    }
  }
  const unreferenced = files.map(rel).filter((r) => r.startsWith('assets/') && !referenced.has(r));
  if (INLINE) {   // (after the manifest checks, which need the loose files)
    const packs = writePacks();
    fs.writeFileSync(path.join(OUT, 'inline_loader.js'), INLINE_LOADER);
    const tags = packs.map((p) => `<script src="${p}"></script>`).concat('<script src="inline_loader.js"></script>', '<script src="chat.js"></script>', '<script src="game.js"></script>').join('\n');
    fs.writeFileSync(path.join(OUT, 'index.html'), pageWithFragments(PAGE).replace('<script src="game.js"></script>', tags));
    files = walk(OUT);
    console.log(`[build] --inline: assets embedded into ${packs.length} pack scripts`);
  }
  const page = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(page)) problems.push('index.html contains doctype/html/head/body tags');
  if (!/^<title>[^<]+<\/title>/.test(page)) problems.push('index.html must start with <title>');
  const gameJs = fs.readFileSync(path.join(OUT, 'game.js'), 'utf8');
  if (/\bimport\s*\(|\bimport\.meta\b|^\s*(import|export)\s/m.test(gameJs)) problems.push('game.js still contains import/export syntax');
  const chatJs = fs.existsSync(path.join(OUT, 'chat.js')) ? fs.readFileSync(path.join(OUT, 'chat.js'), 'utf8') : '';
  if (!chatJs) problems.push('chat.js is missing');
  else if (/\bimport\s*\(|\bimport\.meta\b|^\s*(import|export)\s/m.test(chatJs) || !/__FV_CHAT_MOD/.test(chatJs)) problems.push('chat.js is not a classic script that sets __FV_CHAT_MOD');

  // 6) report
  const sizes = files.map((f) => ({ p: rel(f), s: fs.statSync(f).size })).sort((a, b) => b.s - a.s);
  const total = sizes.reduce((n, x) => n + x.s, 0);
  for (const x of sizes) if (x.s > LIMITS.perFile) problems.push(`${x.p} is ${mb(x.s)} (> 16 MB per file)`);
  if (sizes.length > LIMITS.maxFiles) problems.push(`${sizes.length} files (> ${LIMITS.maxFiles})`);
  if (total > LIMITS.version) problems.push(`total ${mb(total)} (> 256 MB a version)`);

  const supporting = sizes.map((x) => x.p).filter((p) => p !== 'index.html').sort();
  // each publish (the page + one batch) within 64 MB
  {
    const sz = new Map(sizes.map((x) => [x.p, x.s]));
    const pageB = sz.get('index.html') || 0;
    const bs = supporting.length > LIMITS.files - 5 ? publishBatches(supporting, 250) : [supporting];
    bs.forEach((b, i) => { const n = b.reduce((a, p) => a + (sz.get(p) || 0), pageB); if (n > LIMITS.total) problems.push(`publish ${i + 1}: ${mb(n)} (> 64 MB one publish)`); });
  }
  fs.writeFileSync(LIST_OUT, JSON.stringify({
    page: path.relative(path.dirname(ROOT), path.join(OUT, 'index.html')).split(path.sep).join('/'),
    root: path.relative(path.dirname(ROOT), OUT).split(path.sep).join('/'),
    files: supporting,
    // more than one publish's worth of files: send batch 1 with the page, then the next batches to the same url
    // (the boot files — game.js, lib/, the manifests — are in the last batch: see publishBatches)
    batches: supporting.length > LIMITS.files - 5 ? publishBatches(supporting, 250) : undefined,
    // (v4-C2) the resident chat asks the viewer's Claude through the `sample` capability: publish with this declaration
    capabilities: { sample: {} },
    note: 'Publish: Artifact({ file_path: page, root, files, capabilities: { sample: {} } }) - the capabilities declaration lets residents chat with AI (offline village voice without it). Supporting paths are relative to root.' + (supporting.length > LIMITS.files - 5 ? ' Too many files for one publish: publish batches[0] with the page, then each next batch with url = the returned link, in order. The LAST batch holds game.js, lib/ and every manifest.json: until it is published the link keeps running the previous version (an update), or shows the loading error (a brand-new link) — never a mix of old code and new manifests.' : ''),
  }, null, 1));

  const byExt = {};
  for (const x of sizes) { const e = path.extname(x.p) || x.p; (byExt[e] = byExt[e] || { n: 0, s: 0 }).n++; byExt[e].s += x.s; }
  // bytes a browser actually downloads: one audio format, not both
  const audioUsed = mp3Only ? 0 : (byExt['.mp3'] ? byExt['.mp3'].s : 0);
  const downloaded = total - audioUsed - (byExt['.md'] ? byExt['.md'].s : 0);

  console.log(`\n[build] Frost Village artifact -> ${path.relative(process.cwd(), OUT) || OUT}`);
  console.log(`  game.js: ${bundled} source modules bundled (${MINIFY ? 'minified' : 'readable'}), ${mb(fs.statSync(path.join(OUT, 'game.js')).size)}`);
  console.log(`  audio: ${mp3Only ? '.mp3 only (manifest rewritten)' : '.ogg + .mp3 (browser picks one)'}`);
  console.log('  by type: ' + Object.entries(byExt).sort((a, b) => b[1].s - a[1].s).map(([e, v]) => `${e} ${v.n} (${mb(v.s)})`).join(', '));
  console.log('  biggest files:');
  for (const x of sizes.slice(0, 10)) console.log(`    ${mb(x.s).padStart(9)}  ${x.p}`);
  if (skipped.length) console.log('  skipped: ' + skipped.join(', '));
  if (unreferenced.length) console.log('  copied but not listed in any manifest: ' + unreferenced.join(', '));
  console.log(`\n  FILES: ${sizes.length} (limit ${LIMITS.files} a publish, ${LIMITS.maxFiles} a version)   TOTAL: ${mb(total)} (limit 64 MB a publish, 256 MB a version)   largest: ${mb(sizes[0].s)} (limit 16 MB)`);
  console.log(`  every game file once (one audio format): ${mb(downloaded)} — a first visit loads only part of it before the title; the rest arrives while playing, as the village needs it`);
  console.log(`  file list for the Artifact tool: ${path.relative(process.cwd(), LIST_OUT)}`);
  if (problems.length) {
    console.log('\n[build] PROBLEMS:\n  - ' + problems.join('\n  - '));
    process.exit(2);
  }
  console.log(`[build] OK in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => { console.error('[build] FAILED:', e && e.stack || e); process.exit(1); });
