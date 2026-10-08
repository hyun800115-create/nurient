// English dialogue grammar (same rule names, slots, conditions and conversation tags as the Korean one).
import core from './core.js';
import rumor from './rumor.js';
import small from './small.js';
import social from './social.js';
import news from './news.js';

const parts = [core, rumor, small, social, news];
const EN = Object.create(null);
for (const p of parts) for (const k in p) { if (EN[k]) EN[k] = EN[k].concat(p[k]); else EN[k] = p[k].slice(); }
export default EN;
