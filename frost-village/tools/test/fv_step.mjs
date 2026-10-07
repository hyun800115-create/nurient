// Fixed-step clock for Frost Village browser tests: the game loop is put to sleep and advanced in
// exact 60 fps steps (Date.now follows, so tweens / timers stay in sync). Game time then does not
// depend on how slow headless rendering is (SwiftShader on shared CPUs).
//   await installStepper(page); await advance(page, 2.5); await render(page); await page.screenshot(...)

export async function installStepper(page) {
  await page.evaluate(() => {
    if (window.__step) return;
    const game = window.__FV.game;
    game.loop.sleep();
    const realNow = Date.now.bind(Date);
    let D = realNow();
    let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    window.__step = {
      t: 0,
      /** advance `sec` seconds of game time without drawing (fast); optional per-step hook */
      run(sec, hook) {
        const n = Math.max(1, Math.round(sec * 60));
        for (let i = 0; i < n; i++) { if (hook) hook(DT / 1000); T += DT; D += DT; this.t += DT / 1000; game.headlessStep(T, DT); }
      },
      /** one full frame including drawing */
      frame() { T += DT; D += DT; this.t += DT / 1000; game.step(T, DT); },
      /** time `n` update-only steps (ms per step): logic cost */
      bench(n) {
        const gs = window.__FV.scene;
        const out = [];
        for (let i = 0; i < n; i++) { const a = performance.now(); T += DT; D += DT; this.t += DT / 1000; game.headlessStep(T, DT); out.push(performance.now() - a); }
        out.sort((x, y) => x - y);
        const avg = out.reduce((s, x) => s + x, 0) / out.length;
        return { avg: +avg.toFixed(3), p50: +out[Math.floor(n * 0.5)].toFixed(3), p95: +out[Math.floor(n * 0.95)].toFixed(3), max: +out[n - 1].toFixed(3), objs: gs.children.length };
      },
    };
  });
}

/** advance game time in chunks (keeps the page responsive) */
export async function advance(page, sec) {
  let left = sec;
  while (left > 0) {
    const c = Math.min(left, 5);
    await page.evaluate((s) => window.__step.run(s), c);
    left -= c;
  }
}

/** step the game until fn() (in the page) is true or `maxSec` of game time passed; real time passes too (file loads) */
export async function until(page, fn, maxSec = 30, arg) {
  for (let t = 0; t < maxSec; t += 0.5) {
    if (await page.evaluate(fn, arg)) return true;
    await page.evaluate(() => window.__step.run(0.5));
    await new Promise((r) => setTimeout(r, 150));
  }
  return !!(await page.evaluate(fn, arg));
}

/** draw a couple of frames so a screenshot shows the current state */
export async function render(page, n = 3) {
  await page.evaluate((k) => { for (let i = 0; i < k; i++) window.__step.frame(); }, n);
}

/** joystick walk in game time (like pw.mjs walkTo, but stepping the fixed clock) */
export async function walkStep(page, target, opts = {}) {
  const tol = opts.tol || 22;
  const maxSec = (opts.timeout || 12000) / 1000;
  let last = null, stuck = 0;
  for (let t = 0; t < maxSec; t += 0.1) {
    const s = await page.evaluate(() => window.__FV.state().player);
    const dx = target.x - s.x, dy = target.y - s.y;
    const d = Math.hypot(dx, dy * 2);
    if (d < tol) break;
    const k = Math.min(1, d / 60), n = Math.hypot(dx, dy) || 1;
    await page.evaluate(([x, y]) => { window.__FV.setInput(x, y); window.__step.run(0.1); }, [(dx / n) * k, (dy / n) * k]);
    if (last && Math.hypot(s.x - last.x, s.y - last.y) < 1.5) { if (++stuck > 12) break; } else stuck = 0;
    last = s;
  }
  await page.evaluate(() => { window.__FV.setInput(0, 0); window.__step.run(1 / 60); });
  const s = await page.evaluate(() => window.__FV.state().player);
  if (Math.hypot(target.x - s.x, (target.y - s.y) * 2) > tol * 1.6 && opts.teleport !== false) {
    await page.evaluate(([x, y]) => window.__FV.teleport(x, y), [target.x, target.y]);
    return false;
  }
  return true;
}

/** waitFor-like (throws on timeout) but in game time */
export async function waitStep(page, fn, ms = 10000, arg) {
  if (await until(page, fn, ms / 1000, arg)) return true;
  throw new Error('waitStep timeout');
}
