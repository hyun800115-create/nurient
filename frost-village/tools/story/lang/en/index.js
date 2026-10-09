// English dialogue grammar (same rule names, slots, conditions and conversation tags as the Korean one).
import core from './core.js';
import rumor from './rumor.js';
import small from './small.js';
import social from './social.js';
import news from './news.js';

const parts = [core, rumor, small, social, news];
const EN = Object.create(null);
for (const p of parts) for (const k in p) { if (EN[k]) EN[k] = EN[k].concat(p[k]); else EN[k] = p[k].slice(); }
// 'why' questions about moving away: the same lines for a plan and for the move itself
for (const k of ['ask.why', 'ans.why', 'ans.dunno.why', 'answer.why']) if (EN[k + '.move_plan']) EN[k + '.move_out'] = EN[k + '.move_plan'];
// small-talk replies: when the line before was an invitation, saying yes fits better than any topic reply
const YES = ['?^invite =yes *20? [Sure, let’s go together!|Sounds great, let’s go!|I should like that.]', '?^invite =yes *8? [Yes! What time?|I’d love to! What time?|Delighted. At what time?]'];
for (const k in EN) if (/^small\.[a-z_]+\.re$/.test(k)) EN[k] = EN[k].concat(YES);
// thanks for congratulations: a visitor asking to come round gets a warm yes
const VISIT = ['?^visit *30? [Of course! Come any time!|Of course! Come round any time!|By all means, do visit.]', '?^visit *10? [Yes! The baby loves visitors!|Yes! The baby loves visitors!|Please do call round.]'];
for (const k in EN) if (/^thanks\.good/.test(k)) EN[k] = EN[k].concat(VISIT);
export default EN;
