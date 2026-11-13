// (v4.3 step B, M — build_plan §3.9) helpers for the suites that open the shop's stage 4 「눈꽃마을 시장」.
//
// The mkt_s4 step row is P's (Progression.js STEPS, the §2 contract as amended by postdepot_addendum BP-41; P marks it v4,
// an after-읍 step, so the tests' unlockAll leaves it alone as it does the 승격식):
//   { id: 'mkt_s4', type: 'shop', level: 4, after: 'f:rankEup', flag: 'g43s4', also: 'mkt_s3', side: true, v4: true }
// M was built in parallel with P, so a suite that needs stage 4 adds that row in the page when the tree has none yet
// (STEP4_ROW, addStage4Row) — once P is merged the row is there and nothing is added. The pad shows when the village is
// 읍 (flags.rankEup), stage 3 is done (also) and G's flag g43s4 is set (GOALS43 row 9, or 읍 with goals43.s4Early):
// openStage4Pad sets the two flags by hook, as the addendum says M's and H's suites do.
//
//   addStage4Row(page)       -> { added, row }   (call it before the village is built: on the title, or before a reload)
//   openStage4Pad(page)      -> the pad { x, y, cost, items } or null (mkt_s3 must be done)
//   buildStage4(page)        -> completes mkt_s4 through its pad (materials + coins), the shop at stage 4
//   forceStage4(page)        -> 읍 + g43s4 by hook and mkt_s4 marked done at once (doneStep: the shop at stage 4, no pad) —
//                               for views that need a stage-4 village after unlockAll / unlockV3 (which leave a v4 step alone)

export const STEP4_ROW = { id: 'mkt_s4', type: 'shop', level: 4, after: 'f:rankEup', flag: 'g43s4', also: 'mkt_s3', side: true, v4: true };

/** the mkt_s4 row in STEPS (after hire_clerk_s3) when the tree has none (P not merged yet) */
export async function addStage4Row(page) {
  return page.evaluate(async (row) => {
    const P = await import(new URL('src/systems/Progression.js', location.href).href);
    const S = P.STEPS;
    const have = S.find((s) => s.id === row.id);
    if (have) return { added: false, row: have };
    const at = S.findIndex((s) => s.id === 'hire_clerk_s3');
    S.splice(at >= 0 ? at + 1 : S.length, 0, Object.assign({}, row));
    return { added: true, row };
  }, STEP4_ROW);
}

/** 읍 + G's flag (by hook): the 눈꽃마을 시장 pad appears once the pads sync. (A 읍 village has long had its east watchtower;
 *  a test village that skipped it gets it first: the tower's unlock pad (1662, 909) is near enough to the shop pads' spot
 *  (1525, 900) that the one-pad-per-spot rule (Game.paidPadNear) keeps the stage-4 pad waiting behind it) */
export async function openStage4Pad(page) {
  return page.evaluate(() => {
    const g = window.__FV.scene, pr = g.progress;
    if (!pr.done.tower_east && pr.pads.tower_east) window.__FV.doneStep('tower_east');
    pr.flags.rankEup = true;
    pr.flags.g43s4 = true;
    pr.syncPads();
    const p = pr.pads.mkt_s4;
    return p ? { x: Math.round(p.x), y: Math.round(p.y), cost: p.cost, items: p.items ? Object.assign({}, p.items) : null, paid: p.paid } : null;
  });
}

/** 읍 + g43s4 and stage 4 at once (doneStep; stage 3 first when it is not done) */
export async function forceStage4(page) {
  return page.evaluate(() => {
    const F = window.__FV, pr = F.scene.progress;
    pr.flags.rankEup = true; pr.flags.g43s4 = true;
    if (!pr.done.mkt_s3) F.doneStep('mkt_s3');
    if (!pr.done.mkt_s4) F.doneStep('mkt_s4');
    return { stage: F.scene.market.stage, done: !!pr.done.mkt_s4 };
  });
}

/** buy stage 4 through its pad (coins and materials put in by hook) */
export async function buildStage4(page) {
  return page.evaluate(() => { window.__FV.give(5000); return window.__FV.completeStep('mkt_s4'); });
}
