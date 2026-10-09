// How big does the chat save get? Runs simulated long play through the real ChatEngine with a fake
// AI that invents new gossip / lines / facts on every reply (the worst case for growth), and prints
// the save size after 10 … 1,000 conversations, for the 8 lab residents and for all 32 residents.
//
//   node tools/test/chat_size.mjs [--total 1000] [--json out.json]

import fs from 'node:fs';
import { simulate } from './chat/sim.mjs';
import { PERSONAS, LAB_RESIDENTS } from '../../src/chat/personas.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const total = Number(arg('--total', 1000));
const marks = [10, 50, 100, 250, 500, 750, 1000, 1500, 2000].filter((m) => m <= total);
const out = {};
for (const [name, roster] of [['lab8', LAB_RESIDENTS], ['all32', Object.keys(PERSONAS)]]) {
  const t0 = Date.now();
  const r = await simulate({ total, marks, roster, seed: 5 });
  const ser = r.village.serialize();
  out[name] = {
    residents: roster.length, conversations: total, aiCalls: r.calls, ms: Date.now() - t0, curve: r.curve,
    parts: { memories: Buffer.byteLength(JSON.stringify(ser.m)), corpus: Buffer.byteLength(JSON.stringify(ser.c)), other: Buffer.byteLength(JSON.stringify(Object.assign({}, ser, { m: 0, c: 0 }))) },
  };
  console.log('\n' + name + ' (' + roster.length + ' residents, ' + r.calls + ' AI replies, ' + out[name].ms + ' ms)');
  console.log('  conversations   save size   gossip  lines  episodes+summaries');
  for (const c of r.curve) console.log('  ' + String(c.convs).padStart(13) + '   ' + (c.bytes / 1024).toFixed(1).padStart(7) + ' KB   ' + String(c.gossip).padStart(6) + '  ' + String(c.lines).padStart(5) + '  ' + String(c.episodes).padStart(6));
  console.log('  parts: memories ' + (out[name].parts.memories / 1024).toFixed(1) + ' KB, corpus ' + (out[name].parts.corpus / 1024).toFixed(1) + ' KB, other ' + (out[name].parts.other / 1024).toFixed(1) + ' KB');
}
const j = arg('--json', null);
if (j) fs.writeFileSync(j, JSON.stringify(out, null, 2));
