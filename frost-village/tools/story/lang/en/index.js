// English dialogue grammar (same rule names and slots as the Korean one).
import core from './core.js';

const parts = [core];
const EN = Object.create(null);
for (const p of parts) for (const k in p) { if (EN[k]) EN[k] = EN[k].concat(p[k]); else EN[k] = p[k].slice(); }
export default EN;
