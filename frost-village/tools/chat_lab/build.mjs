// Build the chat lab artifact page: dist/chat_lab/index.html
//   node tools/chat_lab/build.mjs [--no-minify]
// 1. crops portraits / emotes / icons into tools/chat_lab/gen/assets.js (python3 + Pillow)
// 2. bundles tools/chat_lab/lab.js + src/chat/** into one IIFE with esbuild (tools/build/node_modules)
// 3. inlines it into tools/chat_lab/template.html (no <html>/<head>/<body>: the artifact host adds them)

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const out = path.join(root, 'dist', 'chat_lab', 'index.html');
const minify = !process.argv.includes('--no-minify');

execFileSync('python3', [path.join(here, 'make_assets.py')], { stdio: 'inherit' });

const require = createRequire(path.join(root, 'tools', 'build', 'package.json'));
let esbuild;
try { esbuild = require('esbuild'); } catch (e) { console.error('esbuild missing: cd tools/build && npm i'); process.exit(1); }

const res = await esbuild.build({
  entryPoints: [path.join(here, 'lab.js')],
  bundle: true, format: 'iife', target: ['es2019', 'safari14'], minify, write: false, legalComments: 'none', charset: 'utf8',
});
let js = res.outputFiles[0].text.replace(/<\/(script)/gi, '<\\/$1');
const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(tpl)) throw new Error('template must not contain document skeleton tags');
const html = tpl.replace('<!--SCRIPT-->', '<script>\n' + js + '\n</script>');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('wrote', path.relative(root, out), kb(Buffer.byteLength(html)), '(script', kb(Buffer.byteLength(js)) + ')');
