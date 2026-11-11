// (v4.3 perf) raw DEFLATE (RFC 1951) decoding in plain JS, for 마을 옮기기 on an old WebView: a village code made on a
// new phone is compressed (CompressionStream 'deflate-raw', Chrome 103+); Android 10 / 11 phones that never updated
// their WebView (Chrome 74-102) have no DecompressionStream, so the code would not open there. Small and slow-ish (a
// few ms for a 6-60 KB village): it only runs when the browser cannot decompress by itself. Checked against Node's
// zlib.inflateRawSync by tools/test/inflate.test.mjs.

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** canonical Huffman code from code lengths: { count[len], symbol[] } (as in zlib's puff.c) */
function huffman(lengths, n) {
  const count = new Uint16Array(16), symbol = new Uint16Array(n), offs = new Uint16Array(16);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  let left = 1;
  for (let len = 1; len < 16; len++) { left <<= 1; left -= count[len]; if (left < 0) throw new Error('bad code'); }
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len];
  for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
  return { count, symbol };
}

/**
 * bytes (Uint8Array, raw deflate) -> Uint8Array. `limit`: the most output bytes allowed (throws 'too big' beyond).
 * Throws on damaged data.
 */
export function inflateRaw(src, limit = 64 * 1024 * 1024) {
  let pos = 0, bitBuf = 0, bitCnt = 0;
  let out = new Uint8Array(Math.max(1024, src.length * 4)), n = 0;
  const need = (k) => {
    if (n + k <= out.length) return;
    if (n + k > limit) throw new Error('too big');
    let sz = out.length * 2;
    while (sz < n + k) sz *= 2;
    const o = new Uint8Array(Math.min(sz, limit));
    o.set(out.subarray(0, n));
    out = o;
  };
  const bits = (k) => {
    while (bitCnt < k) {
      if (pos >= src.length) throw new Error('damaged');
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << k) - 1);
    bitBuf >>>= k;
    bitCnt -= k;
    return v;
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error('damaged');
  };
  const codes = (lit, dist) => {
    for (;;) {
      let sym = decode(lit);
      if (sym < 256) { need(1); out[n++] = sym; continue; }
      if (sym === 256) return;
      sym -= 257;
      if (sym >= 29) throw new Error('damaged');
      const len = LEN_BASE[sym] + bits(LEN_EXTRA[sym]);
      const ds = decode(dist);
      if (ds >= 30) throw new Error('damaged');
      const d = DIST_BASE[ds] + bits(DIST_EXTRA[ds]);
      if (d > n) throw new Error('damaged');
      need(len);
      for (let i = 0; i < len; i++, n++) out[n] = out[n - d];
    }
  };
  let fixedLit = null, fixedDist = null;
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;
      if (pos + 4 > src.length) throw new Error('damaged');
      const len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8);
      pos += 4;
      if (len !== (~nlen & 0xffff) || pos + len > src.length) throw new Error('damaged');
      need(len);
      out.set(src.subarray(pos, pos + len), n);
      n += len; pos += len;
    } else if (type === 1) {
      if (!fixedLit) {
        const l = new Uint8Array(288);
        for (let i = 0; i < 144; i++) l[i] = 8;
        for (let i = 144; i < 256; i++) l[i] = 9;
        for (let i = 256; i < 280; i++) l[i] = 7;
        for (let i = 280; i < 288; i++) l[i] = 8;
        fixedLit = huffman(l, 288);
        fixedDist = huffman(new Uint8Array(30).fill(5), 30);
      }
      codes(fixedLit, fixedDist);
    } else if (type === 2) {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) throw new Error('damaged');
      const cl = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) cl[CL_ORDER[i]] = bits(3);
      const clh = huffman(cl, 19);
      const lengths = new Uint8Array(nlen + ndist);
      for (let i = 0; i < nlen + ndist;) {
        const sym = decode(clh);
        if (sym < 16) { lengths[i++] = sym; continue; }
        let rep = 0, val = 0;
        if (sym === 16) { if (!i) throw new Error('damaged'); val = lengths[i - 1]; rep = 3 + bits(2); }
        else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (i + rep > nlen + ndist) throw new Error('damaged');
        while (rep--) lengths[i++] = val;
      }
      if (!lengths[256]) throw new Error('damaged');
      codes(huffman(lengths.subarray(0, nlen), nlen), huffman(lengths.subarray(nlen), ndist));
    } else throw new Error('damaged');
  }
  return out.slice(0, n);
}
