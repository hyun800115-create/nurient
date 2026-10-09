// Kinds of facts (things that happened) the residents can see, do, remember and talk about.
//   imp:  base importance 0..100 (how long it is remembered, how juicy it is to tell)
//   v:    valence -2..2 (how good / bad it is)
//   news: 0 not in the paper, 1 small item, 2 article, 3 front-page material
//   who:  what a / b / c mean (for the docs and the realizer)

export const FACT_KINDS = {
  meet: { imp: 18, v: 1, news: 0, who: 'a met b for the first time' },
  friend: { imp: 32, v: 2, news: 0, who: 'a and b became friends' },
  bestfriend: { imp: 42, v: 2, news: 0, who: 'a and b became best friends' },
  crush: { imp: 40, v: 1, news: 0, who: 'a likes b (secret)' },
  sweetheart: { imp: 62, v: 2, news: 1, who: 'a and b are dating' },
  confess_no: { imp: 38, v: -1, news: 0, who: 'a confessed to b, b said let us stay friends' },
  engaged: { imp: 72, v: 2, news: 2, who: 'a proposed to b' },
  wedding: { imp: 92, v: 2, news: 3, who: 'a and b married at p' },
  baby: { imp: 86, v: 2, news: 3, who: 'a and b had baby c' },
  grow: { imp: 28, v: 1, news: 1, who: 'a started school / grew up' },
  first_job: { imp: 34, v: 2, news: 1, who: 'a got a first job at p' },
  retire: { imp: 40, v: 1, news: 1, who: 'a retired' },
  farewell: { imp: 95, v: -1, news: 3, who: 'a passed away peacefully (gentle farewell)' },
  memorial: { imp: 60, v: 0, news: 1, who: 'memorial for a at p' },
  move_in: { imp: 56, v: 1, news: 2, who: 'a (household) moved into p' },
  move_plan: { imp: 46, v: -1, news: 0, who: 'a plans to move away' },
  move_out: { imp: 56, v: -1, news: 2, who: 'a (household) moved away' },
  move_within: { imp: 30, v: 1, news: 0, who: 'a moved to p' },
  shop_plan: { imp: 40, v: 1, news: 0, who: 'a wants to open a shop (kind n)' },
  shop_open: { imp: 72, v: 2, news: 3, who: 'a opened shop p' },
  new_job: { imp: 36, v: 1, news: 1, who: 'a got a job at p' },
  big_buy: { imp: 30, v: 1, news: 0, who: 'a bought item i' },
  deposit: { imp: 12, v: 1, news: 0, who: 'a saved n coins' },
  loan: { imp: 42, v: 0, news: 0, who: 'a took a loan of n for purpose s' },          // private: not in the paper
  loan_paid: { imp: 56, v: 2, news: 0, who: 'a paid off a loan' },
  bank_help: { imp: 36, v: 1, news: 0, who: 'the bank eased a’s loan' },
  theft: { imp: 76, v: -2, news: 3, who: 'a pinched item i from b at p' },
  chase: { imp: 60, v: 0, news: 0, who: 'police c chased a' },
  arrest: { imp: 80, v: 1, news: 3, who: 'police c caught a (ref theft)' },
  apology: { imp: 56, v: 1, news: 2, who: 'a apologised to b' },
  wanted: { imp: 78, v: -1, news: 3, who: 'a is on a wanted poster' },
  tip: { imp: 50, v: 1, news: 2, who: 'b tipped the police about a' },
  queue_jump: { imp: 44, v: -1, news: 1, who: 'a cut in line at p, b was annoyed' },
  window: { imp: 56, v: -1, news: 2, who: 'kid a broke b’s window with a snowball' },
  scuffle: { imp: 66, v: -2, news: 2, who: 'a and b scuffled at p' },
  reconcile: { imp: 50, v: 2, news: 1, who: 'a and b made up' },
  fire: { imp: 92, v: -2, news: 3, who: 'building p caught fire (cause n)' },
  fire_out: { imp: 72, v: 2, news: 3, who: 'firefighters c put out the fire at p' },
  ruin: { imp: 86, v: -2, news: 3, who: 'building p burnt down' },
  cat_rescue: { imp: 62, v: 2, news: 2, who: 'firefighter c rescued a cat at p' },
  demolish: { imp: 48, v: 0, news: 2, who: 'the ruin at p was demolished' },
  rebuilt: { imp: 72, v: 2, news: 3, who: 'p was rebuilt (better)' },
  housewarming: { imp: 46, v: 2, news: 1, who: 'a held a housewarming at p' },
  chief: { imp: 62, v: 2, news: 3, who: 'the chief did s' },
  pet: { imp: 36, v: 1, news: 1, who: 'pet n did something funny at p' },
  train: { imp: 30, v: 1, news: 1, who: 'train news n' },
  weather: { imp: 42, v: 0, news: 2, who: 'weather event n' },
  snowman: { imp: 30, v: 1, news: 1, who: 'a built a big snowman at p' },
  concert: { imp: 36, v: 2, news: 1, who: 'a played music at p' },
  delivery: { imp: 34, v: 1, news: 1, who: 'a big delivery of item i arrived at the logistics centre' },
  price: { imp: 34, v: 0, news: 2, who: 'price of item i changed by n' },
  lost_found: { imp: 46, v: 2, news: 1, who: 'a lost item i, b found it' },
  prank: { imp: 34, v: 0, news: 0, who: 'a pranked b' },
  gift: { imp: 36, v: 2, news: 0, who: 'a gave b item i' },
  help: { imp: 32, v: 2, news: 0, who: 'a helped b' },
  slip: { imp: 30, v: 0, news: 0, who: 'a slipped at p (funny)' },
  bigcatch: { imp: 46, v: 2, news: 2, who: 'a caught a giant fish' },
  burnt_food: { imp: 28, v: -1, news: 0, who: 'a burnt item i' },
  outing: { imp: 30, v: 2, news: 0, who: 'a and b went out to p' },
  sale: { imp: 30, v: 1, news: 1, who: 'shop p has a sale' },
};

export const KIND_LIST = Object.keys(FACT_KINDS);
export const KIND_IDX = Object.create(null);
KIND_LIST.forEach((k, i) => { KIND_IDX[k] = i; });

// fire causes (cute, nobody hurt)
export const FIRE_CAUSES = [
  ['stove', '난로를 켜 둔 채 외출해서', 'a stove left on'],
  ['chimney', '굴뚝에 그을음이 잔뜩 끼어서', 'a sooty chimney'],
  ['cooking', '요리하다 기름이 튀어서', 'spattering cooking oil'],
  ['sweetpotato', '군고구마를 굽다가 깜빡 잠들어서', 'falling asleep while roasting sweet potatoes'],
  ['candle', '촛불을 켜 놓고 잠들어서', 'a candle left burning'],
  ['mouse', '쥐가 전선을 갉아 먹어서', 'a mouse chewing a wire'],
  ['toaster', '토스터에 빵이 끼어서', 'bread stuck in the toaster'],
  ['lights', '장식 전구가 너무 많아서', 'too many fairy lights'],
];

// pets of the village (the game's pets) for small talk and pet facts
export const PETS = [
  ['콩이', 'Kongi', '강아지'], ['나비', 'Nabi', '고양이'], ['뽀삐', 'Ppoppi', '펭귄'],
];
