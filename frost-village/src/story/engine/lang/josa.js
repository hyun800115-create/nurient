// Korean particles (조사) chosen by the final consonant (받침) of the word before them, native
// Korean counting words, Hangul -> Latin romanization (names for the English text) and a few helpers.
//
//   josa('지훈', '이')   -> '지훈이'      josa('민지', '이') -> '민지가'
//   josa('빵', '은')     -> '빵은'        josa('사과', '은') -> '사과는'
//   josa('서울', '으로') -> '서울로'      josa('집', '으로') -> '집으로'     josa('학교', '으로') -> '학교로'
//   josa('지훈', '아')   -> '지훈아'      josa('민지', '아') -> '민지야'
//   josa('빵', '이에요') -> '빵이에요'    josa('사과', '이에요') -> '사과예요'
//   josa('TV', '을')     -> 'TV를'        josa('3', '이') -> '3이'   josa('10', '이') -> '10이'
// The particle is always written in its after-consonant form ('이', '은', '을', '과', '아', '으로',
// '이랑', '이야', '이에요', '이었', '이라고' …); the vowel form is derived here.

const H0 = 0xac00, H1 = 0xd7a3;

// final sound of digits as read in Sino-Korean: 0 none, 1 consonant, 2 ㄹ
const DIGIT = { 0: 1 /* 영 */, 1: 2 /* 일 */, 2: 0, 3: 1, 4: 0, 5: 0, 6: 1, 7: 2, 8: 2, 9: 0 };
// letter names (English letters read in Korean): l 엘, m 엠, n 엔, r 알 end in a consonant
const LETTER = { l: 2, m: 1, n: 1, r: 2 };
const SKIP = /[\s.,!?~…'"’”)\]}>♪♡♥:;*\-ㅋㅎ^]/;

/** 0 = ends in a vowel, 1 = ends in a consonant (받침), 2 = ends in ㄹ */
export function finalKind(word) {
  if (!word) return 0;
  let i = word.length - 1;
  while (i > 0 && SKIP.test(word[i])) i--;
  const ch = word[i];
  const c = word.charCodeAt(i);
  if (c >= H0 && c <= H1) {
    const jong = (c - H0) % 28;
    return jong === 0 ? 0 : jong === 8 ? 2 : 1;
  }
  if (ch >= '0' && ch <= '9') {
    // trailing zeros: 10 십 (ㅂ), 100 백 (ㄱ), 1000 천 (ㄴ), 10000 만 (ㄴ)
    let z = 0, j = i;
    while (j >= 0 && (word[j] === '0' || word[j] === ',')) { if (word[j] === '0') z++; j--; }
    if (z === 0 || j < 0) return DIGIT[ch];
    if (z % 4 === 0) return 1;      // 만, 억
    return z % 4 === 1 ? 1 : z % 4 === 2 ? 1 : 1; // 십 백 천: all consonant-final
  }
  const lc = ch.toLowerCase();
  if (lc >= 'a' && lc <= 'z') return LETTER[lc] || 0;
  return 0;
}

export function hasBatchim(word) { return finalKind(word) !== 0; }

/** the particle form that fits after `word` (form given in its after-consonant spelling) */
export function particle(word, form) {
  const k = finalKind(word);
  return pick(form, k);
}

function pick(form, k) {
  if (k === 1) return form;
  // ㄹ: '(으)로' / '(으)면' drop the 으 (서울로, 살면); every other particle behaves like after a consonant
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

// 'ㄹ' words take '로' (서울로) — handled above; but for '이에요' ㄹ-final takes '이에요' (발이에요).
export function josa(word, form) { return word + particle(word, form); }

/** casual way to say a given name among friends: 지훈 -> 지훈이, 민지 -> 민지 (Korean habit) */
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
/** '빵 세 개', '생선 다섯 마리', 120 -> '120개' */
export function counted(n, counter) {
  if (n >= 100) return n + counter;
  return nativeCount(n) + ' ' + counter;
}
const SINO = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
/** 3 -> 삼, 1200 -> 천이백 (for 'N년', 'N퍼센트' style text) */
export function sino(n) {
  n = Math.floor(n);
  if (n === 0) return '영';
  const units = ['', '십', '백', '천'];
  let out = '';
  const man = Math.floor(n / 10000), rest = n % 10000;
  if (man) out += (man === 1 ? '' : sino(man)) + '만';
  const s = String(rest).padStart(4, '0');
  for (let i = 0; i < 4; i++) {
    const d = +s[i];
    if (!d) continue;
    const u = units[3 - i];
    out += (d === 1 && u ? '' : SINO[d]) + u;
  }
  return out;
}
export function commas(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// ---------------------------------------------------------------- romanization (Revised Romanization, simplified)
const INI = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MED = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FIN = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
const SURNAME = {
  김: 'Kim', 이: 'Lee', 박: 'Park', 최: 'Choi', 정: 'Jung', 강: 'Kang', 조: 'Cho', 윤: 'Yoon', 장: 'Jang', 임: 'Lim', 한: 'Han', 오: 'Oh',
  서: 'Seo', 신: 'Shin', 권: 'Kwon', 황: 'Hwang', 안: 'Ahn', 송: 'Song', 류: 'Ryu', 홍: 'Hong', 전: 'Jeon', 고: 'Ko', 문: 'Moon', 손: 'Son',
  양: 'Yang', 배: 'Bae', 백: 'Baek', 허: 'Heo', 남: 'Nam', 심: 'Shim', 노: 'Noh', 하: 'Ha', 곽: 'Kwak', 성: 'Sung', 차: 'Cha', 주: 'Joo',
  우: 'Woo', 구: 'Koo', 민: 'Min', 진: 'Jin', 나: 'Na', 지: 'Ji', 엄: 'Eom', 채: 'Chae', 원: 'Won', 천: 'Cheon', 방: 'Bang', 공: 'Kong',
  현: 'Hyun', 함: 'Ham', 변: 'Byun', 염: 'Yeom', 여: 'Yeo', 추: 'Choo', 도: 'Do', 소: 'So', 석: 'Seok', 선: 'Sun', 설: 'Seol', 마: 'Ma',
  길: 'Gil', 연: 'Yeon', 위: 'Wi', 표: 'Pyo', 명: 'Myung', 기: 'Ki', 반: 'Ban', 왕: 'Wang', 금: 'Geum', 옥: 'Ok', 인: 'In', 제: 'Je',
  모: 'Mo', 탁: 'Tak', 국: 'Kook', 은: 'Eun', 용: 'Yong', 봉: 'Bong', 단: 'Dan', 예: 'Ye', 범: 'Beom',
};
export function romanize(word, isSurname) {
  if (!word) return '';
  if (isSurname && SURNAME[word]) return SURNAME[word];
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i);
    if (c < H0 || c > H1) { out += word[i]; continue; }
    const s = c - H0;
    const ini = Math.floor(s / 588), med = Math.floor((s % 588) / 28), fin = s % 28;
    let ri = INI[ini];
    // ㄹ at the start of a word reads 'r', after a ㄹ final 'l'
    if (ini === 5 && out.endsWith('l')) ri = 'l';
    out += ri + MED[med];
    let rf = FIN[fin];
    // a final ㄹ before a vowel-initial syllable reads 'r' (하늘이 -> haneuri); keep 'l' otherwise
    if (fin === 8 && i + 1 < word.length) {
      const n2 = word.charCodeAt(i + 1) - H0;
      if (n2 >= 0 && Math.floor(n2 / 588) === 11) rf = 'r';
    }
    out += rf;
  }
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** 'a' / 'an' for English */
export function article(word) { return /^[aeiou]/i.test(word) && !/^(uni|use|one)/i.test(word) ? 'an' : 'a'; }
