// Put the game's name (TITLE_NAME in src/title/config.js) everywhere the page / phone shows it.
//
//   node tools/title/apply_name.mjs           dry run: prints what would change
//   node tools/title/apply_name.mjs --write   writes the changes
//
// Touches: index.html (<title>, meta description, the "loading" text), manifest.webmanifest (name,
// short_name), src/data/strings.js (ko / en `title` + `subtitle`). The 3D logo is rendered from
// tools/blender/ttl_config.py (title_art); the title screen's built-in text logo reads config.js directly.
// Rename the game = edit config.js (and ttl_config.py), run this with --write, re-run tools/blender/ttl_build.sh.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITE = process.argv.includes('--write');
const { TITLE_NAME } = await import(pathToFileURL(path.join(ROOT, 'src', 'title', 'config.js')).href);
const ko = TITLE_NAME.ko, en = TITLE_NAME.en, koShort = TITLE_NAME.koShort;

const edits = [];
function edit(rel, fn) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) { console.log('skip (missing)', rel); return; }
  const before = fs.readFileSync(fp, 'utf8');
  const after = fn(before);
  if (after === before) { console.log('ok        ', rel); return; }
  edits.push([fp, after]);
  const a = before.split('\n'), b = after.split('\n');
  console.log('change    ', rel);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) console.log(`   - ${a[i] ?? ''}\n   + ${b[i] ?? ''}`);
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

edit('index.html', (s) => s
  .replace(/<title>[^<]*<\/title>/, `<title>${esc(ko)} · ${esc(en)}</title>`)
  .replace(/(<meta name="description" content=")[^"—]*—/, `$1${esc(ko)} —`)
  .replace(/(<div id="fv-loading"><div class="flake">❄<\/div><div>)[^<]*(<\/div>)/, `$1${esc(ko)}$2`));

edit('manifest.webmanifest', (s) => {
  const j = JSON.parse(s);
  j.name = `${ko} · ${en}`;
  j.short_name = koShort;
  return JSON.stringify(j, null, 2).replace(/\{\s+"src": ([^\n]+),\s+"sizes": ([^\n]+),\s+"type": ([^\n]+),\s+"purpose": ([^\n]+)\s+\}/g, '{ "src": $1, "sizes": $2, "type": $3, "purpose": $4 }') + '\n';
});

edit('src/data/strings.js', (s) => {
  // the first `title:` / `subtitle:` pair is ko, the second en (see STRINGS)
  let n = 0;
  return s.replace(/^(\s*)title: '[^']*',\n(\s*)subtitle: '[^']*',/gm, (m, a, b) => {
    n++;
    return n === 1 ? `${a}title: '${q(ko)}',\n${b}subtitle: '${q(en)}',` : `${a}title: '${q(en)}',\n${b}subtitle: '${q(ko)}',`;
  });
});

if (WRITE) { for (const [fp, txt] of edits) fs.writeFileSync(fp, txt); console.log(`wrote ${edits.length} file(s)`); }
else console.log(edits.length ? `dry run: ${edits.length} file(s) would change (add --write)` : 'everything already says ' + ko);
