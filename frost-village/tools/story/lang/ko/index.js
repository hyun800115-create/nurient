// Korean dialogue grammar: every topic file exports { ruleName: [alternatives] }; merged here.
import core from './core.js';
import rumor from './rumor.js';
import small from './small.js';
import social from './social.js';
import news from './news.js';
import extra from './extra.js';

const parts = [core, rumor, small, social, news, extra];
const KO = Object.create(null);
for (const p of parts) for (const k in p) { if (KO[k]) KO[k] = KO[k].concat(p[k]); else KO[k] = p[k].slice(); }
export default KO;
