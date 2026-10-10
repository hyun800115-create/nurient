// Personality axes (0..100) and the condition flags they produce, plus likes/hobbies.
//   soc sociable · kind kindness · mis mischief · cur curiosity · dil diligence · rom romance ·
//   thr thrift · hon honesty · clu clumsiness · hum humour · vain vanity · brave bravery

export const AXES = ['soc', 'kind', 'mis', 'cur', 'dil', 'rom', 'thr', 'hon', 'clu', 'hum', 'vain', 'brave'];
export const AX = Object.create(null);
AXES.forEach((a, i) => { AX[a] = i; });

// condition flag <- axis threshold
export const TRAIT_FLAGS = [
  ['chatty', 'soc', '>', 68], ['shy', 'soc', '<', 30], ['prank', 'mis', '>', 70], ['kind', 'kind', '>', 70], ['grumpy', 'kind', '<', 28],
  ['curious', 'cur', '>', 68], ['romantic', 'rom', '>', 70], ['vain', 'vain', '>', 72], ['thrifty', 'thr', '>', 70],
  ['honest', 'hon', '>', 72], ['gossip', 'hon', '<', 35], ['clumsy', 'clu', '>', 72], ['diligent', 'dil', '>', 72],
  ['funny', 'hum', '>', 70], ['sleepy', 'dil', '<', 25], ['brave', 'brave', '>', 72],
];

// Korean / English labels for the designer-facing docs and the game's resident card
export const TRAIT_LABEL = {
  chatty: ['수다쟁이', 'chatty'], shy: ['수줍음', 'shy'], prank: ['장난꾸러기', 'prankster'], kind: ['다정함', 'kind'],
  grumpy: ['투덜이', 'grumpy'], curious: ['호기심쟁이', 'curious'], romantic: ['낭만파', 'romantic'], vain: ['멋쟁이', 'vain'],
  thrifty: ['알뜰살뜰', 'thrifty'], honest: ['정직함', 'honest'], gossip: ['소문쟁이', 'gossip'], clumsy: ['덤벙이', 'clumsy'],
  diligent: ['성실함', 'diligent'], funny: ['웃음꾼', 'funny'], sleepy: ['잠꾸러기', 'sleepy'], brave: ['용감함', 'brave'],
  foodie: ['먹보', 'foodie'],
};

// likes: [id, ko noun, ko '하러' phrase, en noun, en activity]
export const LIKES = [
  ['skating', '스케이트', '스케이트 타러', 'skating', 'go skating'],
  ['sledding', '썰매', '썰매 타러', 'sledding', 'go sledding'],
  ['snowman', '눈사람 만들기', '눈사람 만들러', 'building snowmen', 'build a snowman'],
  ['snowball', '눈싸움', '눈싸움하러', 'snowball fights', 'have a snowball fight'],
  ['fishing', '얼음낚시', '얼음낚시하러', 'ice fishing', 'go ice fishing'],
  ['music', '음악', '노래 들으러', 'music', 'listen to music'],
  ['singing', '노래', '노래 부르러', 'singing', 'sing'],
  ['dancing', '춤', '춤추러', 'dancing', 'dance'],
  ['books', '책', '책 읽으러', 'books', 'read'],
  ['painting', '그림', '그림 그리러', 'painting', 'paint'],
  ['knitting', '뜨개질', '뜨개질하러', 'knitting', 'knit'],
  ['cooking', '요리', '요리하러', 'cooking', 'cook'],
  ['baking', '빵 굽기', '빵 구우러', 'baking', 'bake'],
  ['coffee', '커피', '커피 마시러', 'coffee', 'have coffee'],
  ['cocoa', '코코아', '코코아 마시러', 'hot cocoa', 'have hot cocoa'],
  ['sweetpotato', '군고구마', '군고구마 먹으러', 'roasted sweet potatoes', 'eat roasted sweet potatoes'],
  ['bungeoppang', '붕어빵', '붕어빵 먹으러', 'fish-shaped buns', 'grab some bungeoppang'],
  ['dogs', '강아지', '콩이 보러', 'dogs', 'see Kongi the dog'],
  ['cats', '고양이', '고양이 보러', 'cats', 'see the cats'],
  ['penguins', '펭귄', '펭귄 보러', 'penguins', 'see the penguins'],
  ['sea', '바다', '바다 보러', 'the sea', 'look at the sea'],
  ['stars', '별 보기', '별 보러', 'stargazing', 'look at the stars'],
  ['aurora', '오로라', '오로라 보러', 'the aurora', 'watch for the aurora'],
  ['trains', '기차', '기차 구경하러', 'trains', 'watch the trains'],
  ['flowers', '꽃', '꽃 구경하러', 'flowers', 'look at flowers'],
  ['gardening', '화분 가꾸기', '화분 가꾸러', 'potted plants', 'tend the plants'],
  ['puzzles', '퍼즐', '퍼즐 맞추러', 'puzzles', 'do puzzles'],
  ['yut', '윷놀이', '윷놀이하러', 'yut games', 'play yut'],
  ['baduk', '바둑', '바둑 두러', 'baduk', 'play baduk'],
  ['naps', '낮잠', '낮잠 자러', 'naps', 'take a nap'],
  ['walks', '산책', '산책하러', 'walks', 'go for a walk'],
  ['photos', '사진', '사진 찍으러', 'photos', 'take photos'],
  ['saunas', '찜질방', '찜질방 가러', 'saunas', 'go to the sauna'],
  ['jokes', '농담', '농담하러', 'jokes', 'tell jokes'],
  ['shopping', '구경', '가게 구경하러', 'window shopping', 'go window shopping'],
].map(([id, ko, koAct, en, enAct], idx) => ({ id, idx, ko, koAct, en, enAct }));
