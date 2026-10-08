// Korean helpers for resident chat: particles (조사), speech levels (반말 / 존댓말) and a tiny
// template language for the offline lines.
//
// Particles follow the same rules and API as the story engine (tools/story/lang/josa.js):
//   josa('하린', '이') -> '하린이'   josa('서아', '이') -> '서아가'   josa('빵', '을') -> '빵을'
//   josa('코코아', '을') -> '코코아를'   josa('물', '으로') -> '물로'   josa('사과', '이에요') -> '사과예요'
// The particle is always written in its after-consonant spelling ('이', '은', '을', '과', '아', '으로',
// '이랑', '이야', '이에요', '이라고' …) and the vowel form is derived. A parity test
// (tools/test/chat/ko.test.mjs) checks this file against the story engine when it is present, so the
// game can later swap in tools/story's josa without changing a single line.
//
// Template language (lines.js):
//   {x}        value of slot x               {x:을}   value + particle      {x:이다}  copula: 이야/야 · 이에요/예요
//   ~          '요' when polite, '' when casual (구웠어~ -> 구웠어 / 구웠어요)
//   [a|b]      a when casual (반말), b when polite (존댓말)
//   {chief}    the way this resident calls the chief (촌장님)

const H0 = 0xac00, H1 = 0xd7a3;
const DIGIT = { 0: 1, 1: 2, 2: 0, 3: 1, 4: 0, 5: 0, 6: 1, 7: 2, 8: 2, 9: 0 };
const LETTER = { l: 2, m: 1, n: 1, r: 2 };
const SKIP = /[\s.,!?~…'"’”)\]}>♪♡♥:;*\-ㅋㅎ^]/;

/** 0 = ends in a vowel, 1 = ends in a consonant (받침), 2 = ends in ㄹ */
export function finalKind(word) {
  if (!word) return 0;
  word = String(word);
  let i = word.length - 1;
  while (i > 0 && SKIP.test(word[i])) i--;
  const ch = word[i];
  const c = word.charCodeAt(i);
  if (c >= H0 && c <= H1) {
    const jong = (c - H0) % 28;
    return jong === 0 ? 0 : jong === 8 ? 2 : 1;
  }
  if (ch >= '0' && ch <= '9') {
    let z = 0, j = i;
    while (j >= 0 && (word[j] === '0' || word[j] === ',')) { if (word[j] === '0') z++; j--; }
    if (z === 0 || j < 0) return DIGIT[ch];
    return 1;                                   // 십 백 천 만: consonant-final
  }
  const lc = ch.toLowerCase();
  if (lc >= 'a' && lc <= 'z') return LETTER[lc] || 0;
  return 0;
}

export function hasBatchim(word) { return finalKind(word) !== 0; }

function pick(form, k) {
  if (k === 1) return form;
  if (k === 2) return form.charAt(0) === '으' ? form.slice(1) : form;
  switch (form) {
    case '이': return '가';
    case '은': return '는';
    case '을': return '를';
    case '과': return '와';
    case '아': return '야';
    case '이에요': return '예요';
  }
  if (form.charAt(0) === '으') return form.slice(1);
  if (form.startsWith('이에')) return '예' + form.slice(2);
  if (form.startsWith('이었')) return '였' + form.slice(2);
  if (form.startsWith('이어')) return '여' + form.slice(2);
  if (form.startsWith('이여')) return '여' + form.slice(2);
  if (form.startsWith('이')) return form.slice(1);
  if (form.startsWith('은')) return '는' + form.slice(1);
  if (form.startsWith('을')) return '를' + form.slice(1);
  if (form.startsWith('과')) return '와' + form.slice(1);
  if (form.startsWith('아')) return '야' + form.slice(1);
  return form;
}

/** the particle that fits after `word` (form given in its after-consonant spelling) */
export function particle(word, form) { return pick(form, finalKind(word)); }

/** word + the fitting particle */
export function josa(word, form) { return word + particle(word, form); }

/** casual way to say a given name among friends: 하린 -> 하린이, 서아 -> 서아 */
export function casualName(given) { return hasBatchim(given) ? given + '이' : given; }

// ---------------------------------------------------------------- numbers
const NATIVE1 = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE10 = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
/** native Korean number used before a counter: 1 -> 한, 20 -> 스무, 23 -> 스물세; >= 100 digits */
export function nativeCount(n) {
  n = Math.floor(n);
  if (n <= 0) return '0';
  if (n >= 100) return String(n);
  const t = Math.floor(n / 10), o = n % 10;
  if (t === 2 && o === 0) return '스무';
  return NATIVE10[t] + NATIVE1[o];
}
/** '빵 세 개' style: counted(3, '개') -> '세 개', counted(120, '개') -> '120개' */
export function counted(n, counter) { return n >= 100 ? n + counter : nativeCount(n) + ' ' + counter; }

// ---------------------------------------------------------------- speech level
export const CASUAL = 'casual';   // 반말 (해체)
export const POLITE = 'polite';   // 존댓말 (해요체)

const END_PUNCT = /([\s.!?~…♪♡ㅎㅋ^]*)$/;

/**
 * Re-level a finished spoken sentence (used for rumours that came from somewhere else).
 * polite: 했대 -> 했대요, 빵이야 -> 빵이에요, 거야 -> 거예요 · casual: the reverse. Unknown endings
 * are left alone (the line still reads fine, just in the other register).
 */
export function levelize(text, level) {
  if (!text) return '';
  const parts = String(text).split(/(?<=[.!?…~])\s+/);
  return parts.map((s) => levelOne(s, level)).join(' ');
}

function levelOne(s, level) {
  const m = s.match(END_PUNCT);
  const tail = m ? m[1] : '';
  let body = s.slice(0, s.length - tail.length);
  if (!body) return s;
  if (level === POLITE) {
    if (/(요|니다|니까|세요|죠)$/.test(body)) return s;
    if (/이야$/.test(body) && hasBatchim(body.slice(0, -2))) body = body.slice(0, -2) + '이에요';
    else if (/야$/.test(body) && !/[가-힣]아야$/.test(body)) body = body.slice(0, -1) + '예요';
    else if (/[대래어아지네게걸데해봐줘워와까군나]$/.test(body)) body += '요';
    else return s;
    return body + tail;
  }
  // casual
  if (/이에요$/.test(body)) body = body.slice(0, -3) + '이야';
  else if (/예요$/.test(body)) body = body.slice(0, -2) + '야';
  else if (/세요$/.test(body)) body = body.slice(0, -2) + '셔';
  else if (/죠$/.test(body)) body = body.slice(0, -1) + '지';
  else if (/[대래어아지네게걸데해봐줘워와까군나]요$/.test(body)) body = body.slice(0, -1);
  else return s;
  return body + tail;
}

// ---------------------------------------------------------------- templates
const TOKEN = /\{([a-zA-Z_][\w]*)(?::([^}]+))?\}|\[([^\]|]*)\|([^\]]*)\]|~/g;

/**
 * Render a template with slots at a speech level. Missing slots render as '' and are reported in
 * `out.missing` (the caller picks another template when one is missing).
 */
export function render(tpl, slots, level, out) {
  const polite = level === POLITE;
  let missing = 0;
  const txt = tpl.replace(TOKEN, (all, key, form, cas, pol) => {
    if (all === '~') return polite ? '요' : '';
    if (cas !== undefined) return polite ? pol : cas;
    let v = slots ? slots[key] : undefined;
    if (v === undefined || v === null || v === '') { missing++; return ''; }
    v = String(v);
    if (!form) return v;
    if (form === '이다') return josa(v, polite ? '이에요' : '이야');
    return josa(v, form);
  });
  if (out) out.missing = missing;
  return tidy(txt);
}

/** collapse doubled spaces and spaces before punctuation */
export function tidy(s) {
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?~…])/g, '$1').replace(/^\s+|\s+$/g, '');
}

// ---------------------------------------------------------------- text checks
/** Hangul share of the letters in a string (0..1) */
export function hangulRatio(s) {
  let h = 0, l = 0;
  for (const ch of String(s || '')) {
    const c = ch.charCodeAt(0);
    if (c >= H0 && c <= H1) { h++; l++; } else if (/[A-Za-z]/.test(ch)) l++;
  }
  return l ? h / l : 0;
}

/** strip particles from the end of a word (for matching names inside player text) */
export function stem(word) { return String(word).replace(/(이랑|랑|한테|에게|께서|이가|이는|이를|이도|이야|은|는|이|가|을|를|도|야|아|와|과|의|로|으로)$/, ''); }
