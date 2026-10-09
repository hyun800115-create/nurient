#!/usr/bin/env node
// Headless runner for the story engine.
//
//   node tools/story/sim.mjs --days 30 --residents 250 --seed 7
//        [--lang ko|en] [--text all|visible|none] [--out DIR] [--no-incidents] [--no-life] [--perf] [--quiet]
//        [--samples [FILE]]   also write the Korean designer samples (default docs/story_samples.md, see samples.mjs)
//
// Writes DIR/metrics.json, DIR/talks.log (every line said, by day / time / place), DIR/events.log
// (incidents, moves, life events, bank, shops, buildings), DIR/news.md (every morning's paper) and
// prints a summary. Default DIR: tools/story/out/seed_<N>.
// --perf also times the simulation in all three text modes ('all', 'visible' with ~10 % of residents
// on screen, 'none') and reports ms per game second (avg / p99 / max).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryEngine } from './src/engine.js';
import { Metrics } from './src/metrics.js';
import { CHIEF } from './src/dialogue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const DAYS = +arg('days', 30), N = +arg('residents', 250), SEED = +arg('seed', 7), LANG = arg('lang', 'ko'), TEXT = arg('text', 'all');
const OUT = path.resolve(arg('out', path.join(HERE, 'out', 'seed_' + SEED)));
const quiet = flag('quiet');

function clock(e, sec) {
  const L = e.cfg.dayLength, d = Math.floor(sec / L), m = Math.floor(((sec - d * L) * 1440) / L);
  return 'D' + String(d + 1).padStart(2, '0') + ' ' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export function runSim(opts) {
  const metrics = new Metrics();
  const e = new StoryEngine({ seed: opts.seed, population: opts.residents, lang: opts.lang, textMode: opts.text, incidents: opts.incidents, lifeEvents: opts.life, metrics });
  const talkLog = [], eventLog = [], news = [];
  const nm = (id) => (id === CHIEF ? (opts.lang === 'en' ? 'Chief' : '촌장') : id >= 0 && e.people[id] ? e.name(id, opts.lang) : '-');
  const pl = (id) => { const p = typeof id === 'number' ? e.world.places[id] : e.world.byId[id]; return p ? e.world.nameOf(p, opts.lang) : '-'; };
  e.on('talk', (t) => {
    if (!t.lines || !opts.logs) return;
    const head = clock(e, t.start) + ' [' + (t.placeIdx >= 0 ? pl(t.placeIdx) : '-') + '] ' + (t.topics || []).join(',');
    talkLog.push(head + '\n' + t.lines.map((l) => '  ' + nm(l.who) + ': ' + l.text).join('\n'));
  });
  const ev = (name) => (p) => { if (opts.logs) eventLog.push(clock(e, e.now) + ' ' + name + ' ' + JSON.stringify(p, (k, v) => (k === 'paper' ? undefined : v))); };
  for (const n of ['incident', 'build', 'move', 'life', 'wanted', 'shop', 'relation']) e.on(n, ev(n));
  e.on('bank', (p) => { if (p.op !== 'deposit') ev('bank')(p); });
  e.on('news', (p) => { if (p.text) news.push(p.text); });
  const times = [];
  const steps = Math.round((opts.days * e.cfg.dayLength) / e.cfg.step);
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    const a = performance.now();
    e.step();
    times.push(performance.now() - a);
  }
  const total = performance.now() - t0;
  return { e, metrics, talkLog, eventLog, news, times, total };
}

export function perfStats(times) {
  const a = Float64Array.from(times).sort();
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  return { avgMs: +avg.toFixed(4), p50Ms: +a[Math.floor(a.length * 0.5)].toFixed(4), p99Ms: +a[Math.floor(a.length * 0.99)].toFixed(4), maxMs: +a[a.length - 1].toFixed(3) };
}

function paperMd(p) {
  const out = ['## ' + p.masthead + ' — ' + p.date + ' (제' + p.no + '호)', '', '### ' + p.headline, '', p.lead, ''];
  for (const a of p.articles) out.push('- **' + a.title + '** ' + a.body);
  out.push('', '> ' + p.sidebar.join('  \n> '), '', p.byline ? '*' + p.byline + '*' : '', '');
  return out.join('\n');
}

async function main() {
  const opts = { days: DAYS, residents: N, seed: SEED, lang: LANG, text: TEXT, incidents: !flag('no-incidents'), life: !flag('no-life'), logs: true };
  const r = runSim(opts);
  const perf = perfStats(r.times);
  const summary = r.metrics.summary(r.e, { seed: SEED, lang: LANG, textMode: TEXT, perfThisRun: perf, totalSeconds: +(r.total / 1000).toFixed(2) });
  const g = r.e.dialogue.grammar(LANG).stats();
  summary.grammar = { [LANG]: g };
  if (flag('perf')) {
    summary.perf = {};
    for (const mode of ['all', 'visible', 'none']) {
      const metrics = new Metrics({ keepLines: false });
      const e = new StoryEngine({ seed: SEED, population: N, lang: LANG, textMode: mode, metrics });
      if (mode === 'visible') e.setVisible((id) => id % 10 === 0);
      const days = Math.min(DAYS, 10);
      const times = [];
      for (let i = 0; i < days * e.cfg.dayLength; i++) { const a = performance.now(); e.step(); times.push(performance.now() - a); }
      summary.perf[mode] = Object.assign(perfStats(times), { days, residents: e.alive.length });
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, 'talks.log'), r.talkLog.join('\n'));
  fs.writeFileSync(path.join(OUT, 'events.log'), r.eventLog.join('\n'));
  fs.writeFileSync(path.join(OUT, 'news.md'), r.news.map(paperMd).join('\n---\n\n'));
  if (flag('samples')) {
    const { buildSamples } = await import('./samples.mjs');
    const i = args.indexOf('--samples');
    const target = i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--') ? path.resolve(args[i + 1]) : path.join(HERE, '..', '..', 'docs', 'story_samples.md');
    fs.writeFileSync(target, buildSamples({ seed: SEED, days: DAYS, residents: N }).md);
    if (!quiet) console.log('  samples: ' + target);
  }
  if (!quiet) {
    const s = summary;
    console.log(`story sim: seed ${SEED}, ${s.days} days, ${s.residents} residents (${LANG}, text ${TEXT})`);
    console.log(`  talks ${s.talks} (${s.talksPerResidentPerDay}/resident/day), lines ${s.lines}, unique ${s.uniqueLines} (${(s.uniqueRatio * 100).toFixed(1)} %), pair repeats ${s.pairRepeats} (${s.pairRepeatRate})`);
    console.log(`  grammar ${LANG}: ${g.rules} rules, ${g.alternatives} templates, ${g.variants} inline variants; coverage ${JSON.stringify(s.templateCoverage[LANG])}; topics ${s.topics.distinct}`);
    console.log(`  gossip: tracked ${s.gossip.trackedFacts}, median reach ${s.gossip.medianReachPct} %, to 25 % in ${s.gossip.medianHoursTo25pct} h, max hop ${s.gossip.maxHop}, distortions ${s.gossip.distortions}, exaggerations ${s.gossip.exaggerations}`);
    console.log(`  relationships ${JSON.stringify(s.relationships.byStage)} rivals ${s.relationships.rivals}`);
    console.log(`  life ${JSON.stringify(s.life)}`);
    console.log(`  incidents ${JSON.stringify(s.incidents)}`);
    console.log(`  bank ${JSON.stringify(s.bank)}`);
    console.log(`  dialogue misses ${s.dialogue.misses} ${JSON.stringify(s.dialogue.missRules).slice(0, 400)}`);
    console.log(`  perf (this run, text ${TEXT}): ${JSON.stringify(perf)} ms per game second; total ${s.totalSeconds} s`);
    if (s.perf) console.log('  perf by text mode: ' + JSON.stringify(s.perf));
    console.log('  out: ' + OUT);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
