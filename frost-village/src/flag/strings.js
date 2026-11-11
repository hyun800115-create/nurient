// (v4.3 마을 깃발) the flag's words, ko + en (its own table, like the 금방 / beach modules: src/data/strings.js untouched)
import { getLang } from '../data/strings.js';

export const FLAG_STRINGS = {
  ko: {
    flag_title: '우리 마을 깃발',
    flag_hint: '마음에 드는 모양과 색을 골라요 · 설정에서 언제든 바꿀 수 있어요',
    flag_tab_shape: '모양', flag_tab_pattern: '무늬', flag_tab_emblem: '그림',
    flag_bg: '바탕색', flag_pc: '무늬 색', flag_ec: '그림 색',
    flag_shuffle: '다시 섞기', flag_start: '이대로 시작', flag_done: '완료',
    flag_saved: '마을 깃발을 바꿨어요!',
    flag_card: '마을 깃발을 우리 마을답게\n바꿔 볼까요?', flag_card_sub: '설정 › 놀이에서도 언제든 바꿀 수 있어요',
    flag_make: '만들기', flag_later: '나중에',
    set_flag: '마을 깃발', set_flag_btn: '바꾸기',
    flag_wait: '튜토리얼이 끝나면 깃발을 바꿀 수 있어요', flag_busy: '지금은 깃발을 바꿀 수 없어요. 조금 뒤에 해 봐요',
    move_flag: '마을 깃발',
  },
  en: {
    flag_title: 'Our village flag',
    flag_hint: 'Pick a shape and colours you like · change it any time in Settings',
    flag_tab_shape: 'Shape', flag_tab_pattern: 'Pattern', flag_tab_emblem: 'Emblem',
    flag_bg: 'Flag colour', flag_pc: 'Pattern colour', flag_ec: 'Emblem colour',
    flag_shuffle: 'Shuffle', flag_start: 'Start with this', flag_done: 'Done',
    flag_saved: 'The new village flag is up!',
    flag_card: 'Shall we give the village\na flag of its own?', flag_card_sub: 'You can also change it any time in Settings › Play',
    flag_make: 'Make one', flag_later: 'Later',
    set_flag: 'Village flag', set_flag_btn: 'Change',
    flag_wait: 'You can change the flag after the tutorial', flag_busy: 'The flag cannot change right now. Try again soon',
    move_flag: 'Village flag',
  },
};

/** a flag string in the current language (Korean when the English one is missing) */
export function ft(key) {
  const L = FLAG_STRINGS[getLang() === 'en' ? 'en' : 'ko'];
  const s = L[key];
  return s !== undefined ? s : (FLAG_STRINGS.ko[key] !== undefined ? FLAG_STRINGS.ko[key] : key);
}
