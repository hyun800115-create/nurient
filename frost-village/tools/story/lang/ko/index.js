// Korean dialogue grammar: every topic file exports { ruleName: [alternatives] }; merged here.
import core from './core.js';
import rumor from './rumor.js';
import small from './small.js';
import social from './social.js';
import news from './news.js';
import extra from './extra.js';
import polish from './polish.js';

const parts = [core, rumor, small, social, news, extra, polish];
const KO = Object.create(null);
for (const p of parts) for (const k in p) { if (KO[k]) KO[k] = KO[k].concat(p[k]); else KO[k] = p[k].slice(); }
// 'why' questions about moving away: the same lines for a plan and for the move itself
for (const k of ['ask.why', 'ans.why', 'ans.dunno.why', 'answer.why']) if (KO[k + '.move_plan']) KO[k + '.move_out'] = KO[k + '.move_plan'];
// small-talk replies: when the line before was an invitation, saying yes fits better than any topic reply
const YES = ['?^invite =yes *20? [좋아, 같이 가자!|좋아요, 같이 가요!|좋지요, 함께 가요.]', '?^invite =yes *8? [완전 좋아! 몇 시에 갈까?|좋아요! 몇 시에 갈까요?|좋습니다. 몇 시에 뵐까요?]'];
for (const k in KO) if (/^small\.[a-z_]+\.re$/.test(k)) KO[k] = KO[k].concat(YES);
// thanks for congratulations: a visitor asking to come round gets a warm yes
const VISIT = ['?^visit *30? [그럼! 언제든 놀러 와!|그럼요! 언제든 놀러 오세요!|물론이지요. 언제든 오세요.]', '?^visit *10? [응! 아기가 손님 좋아해!|네! 아기가 손님을 좋아해요!|네, 꼭 들르세요.]'];
for (const k in KO) if (/^thanks\.good/.test(k)) KO[k] = KO[k].concat(VISIT);
export default KO;
