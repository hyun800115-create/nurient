// (v4.3 perf) Android 8-10 phones that never updated their WebView run Chrome 58-77: the few built-ins the game uses
// that are newer than that, added only where missing (each the plain spec behaviour, nothing more). The APK's game.js
// is built for chrome58 (tools/build/build_artifact.mjs), so the newer syntax is already rewritten; these are the
// library functions a syntax build cannot add. Imported first by src/main.js.
//   Object.fromEntries (Chrome 73) · Array.prototype.flat / flatMap (69) · String.prototype.matchAll (73) ·
//   String.prototype.trimStart / trimEnd (66) · Promise.prototype.finally (63) · globalThis (71)
/* eslint-disable no-extend-native */

function define(obj, name, fn) {
  if (obj[name]) return;
  try { Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true, enumerable: false }); } catch (e) { obj[name] = fn; }
}

define(Object, 'fromEntries', function fromEntries(it) {
  const o = {};
  if (it == null) throw new TypeError('Object.fromEntries needs an iterable');
  for (const e of it) o[e[0]] = e[1];
  return o;
});

function flatInto(out, arr, depth) {
  for (let i = 0; i < arr.length; i++) {
    if (!(i in arr)) continue;
    const v = arr[i];
    if (depth > 0 && Array.isArray(v)) flatInto(out, v, depth - 1);
    else out.push(v);
  }
  return out;
}
define(Array.prototype, 'flat', function flat(depth) {
  const d = depth === undefined ? 1 : Math.floor(Number(depth)) || 0;
  return flatInto([], this, d);
});
define(Array.prototype, 'flatMap', function flatMap(fn, thisArg) {
  const out = [];
  for (let i = 0; i < this.length; i++) {
    if (!(i in this)) continue;
    const v = fn.call(thisArg, this[i], i, this);
    if (Array.isArray(v)) { for (let j = 0; j < v.length; j++) if (j in v) out.push(v[j]); } else out.push(v);
  }
  return out;
});

define(String.prototype, 'matchAll', function matchAll(re) {
  const src = String(this);
  let rx;
  if (re instanceof RegExp) {
    if (re.flags.indexOf('g') < 0) throw new TypeError('matchAll needs a global RegExp');
    rx = new RegExp(re.source, re.flags);
    rx.lastIndex = re.lastIndex;
  } else rx = new RegExp(re, 'g');
  const out = [];
  let m;
  while ((m = rx.exec(src)) !== null) {
    out.push(m);
    if (m[0] === '') rx.lastIndex++;
  }
  return out[Symbol.iterator]();
});

define(String.prototype, 'trimStart', String.prototype.trimLeft || function trimStart() { return String(this).replace(/^\s+/, ''); });
define(String.prototype, 'trimEnd', String.prototype.trimRight || function trimEnd() { return String(this).replace(/\s+$/, ''); });

if (typeof Promise !== 'undefined') {
  define(Promise.prototype, 'finally', function fin(fn) {
    const P = this.constructor || Promise;
    return this.then((v) => P.resolve(fn()).then(() => v), (e) => P.resolve(fn()).then(() => { throw e; }));
  });
}

if (typeof globalThis === 'undefined') {
  try { (typeof window !== 'undefined' ? window : self).globalThis = (typeof window !== 'undefined' ? window : self); } catch (e) { /* */ }
}
