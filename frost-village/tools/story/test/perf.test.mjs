// Budget (CONTRACT_V8 §AF): 250 residents within 2 ms per game second. Measured as CPU time per
// simulated game second in 'visible' text mode (the game's default: text only for on-screen residents).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory } from '../index.js';

test('250 residents cost well under 2 ms of CPU per game second', () => {
  const s = createStory({ seed: 7, population: 250, textMode: 'visible' });
  s.setVisible((id) => id % 10 === 0);
  s.runDays(0.5);                                    // warm up the JIT
  const steps = 600 * 3;
  const c0 = process.cpuUsage();
  for (let i = 0; i < steps; i++) s.step();
  const c = process.cpuUsage(c0);
  const ms = (c.user + c.system) / 1000 / steps;
  console.log(`story perf: ${ms.toFixed(3)} ms CPU per game second (250 residents, visible text)`);
  assert.ok(ms < 2, `${ms} ms per game second`);
});
