// Coin-pile inspection helpers for browser tests (ghostcoins.mjs and the ghost-coin probes).
//   await installCoinScan(page)     window.__coins in the page:
//     __coins.tills()               [{ name, x, y, value, count, incoming }] every village CashPad
//     __coins.till(name)            the CashPad itself ('market' | 'trade' | 'store' | 'rest' | 'tax' | 'station' | 'depot')
//     __coins.ink(stack)            what the stack's baked picture really holds: { px, meanA } opaque pixels of its slot in
//                                   the shared bake texture (read back from the GPU / canvas), null when it has no slot
//     await __coins.scan(name, r)   every display object within r px of that pad that shows a coin: loose coin sprites
//                                   (item_coin, fx_coin_spin, ...) and the baked pile picture, with alpha / visible / depth /
//                                   owner (+ the picture's ink); `ghost` = coins drawn while the till holds nothing
//     __coins.screen(x, y)          world point -> CSS px of the page (for screenshot clips)

export async function installCoinScan(page) {
  await page.evaluate(() => {
    if (window.__coins) return;
    const gs = () => window.__FV.scene;
    const list = () => {
      const g = gs(), out = [];
      const add = (name, till) => { if (till && typeof till.value === 'number' && till.pile) out.push({ name, till }); };
      if (g.market) add('market', g.market.cash);
      if (g.trade) add('trade', g.trade.cash);
      if (g.store) add('store', g.store.cash);
      // ((v4.3 step B, S6) a3's 빵집 stall has its own till (V42.villageTills 'bakery'): 딸랑이 empties it on his rounds, so the
      //  matrix's late scenario looked it up here and crashed on a name it did not know)
      if (g.bakery && g.bakery.built && g.bakery.stall) add('bakery', g.bakery.stall.cash);
      const C = g.civic;
      if (C && C.restaurant) add('rest', C.restaurant.cash);
      if (C && C.hall) add('tax', C.hall.tax);
      const G = g.v4 && g.v4.growth;
      if (G && G.till) add('station', G.till);
      const D = g.v42 && g.v42.depot;
      if (D && D.till) add('depot', D.till);
      return out;
    };
    // (read straight from the bake texture: a WebGL render target keeps texture row y at framebuffer row y — Phaser's
    //  own DynamicTexture.snapshotArea reads the mirrored rows of a render target — and a Canvas one is a canvas)
    const ink = (stack) => {
      const s = stack && stack.slot, B = stack && stack.baker;
      if (!s || !B || !B.dt) return null;
      const dt = B.dt, r = gs().renderer;
      let d = null;
      try {
        if (r.gl && dt.renderTarget) {
          const gl = r.gl, prev = r.currentFramebuffer;
          r.setFramebuffer(dt.renderTarget.framebuffer);
          d = new Uint8Array(s.w * s.h * 4);
          gl.readPixels(s.x, s.y, s.w, s.h, gl.RGBA, gl.UNSIGNED_BYTE, d);
          r.setFramebuffer(prev || null);
        } else if (dt.context) d = dt.context.getImageData(s.x, s.y, s.w, s.h).data;
      } catch (e) { return { px: -1, meanA: 0, err: String(e) }; }
      if (!d) return { px: -1, meanA: 0, err: 'no pixels' };
      let n = 0, a = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) { n++; a += d[i]; }
      return { px: n, meanA: n ? Math.round(a / n) : 0, slot: [s.x, s.y, s.w, s.h] };
    };
    window.__coins = {
      tills: () => list().map(({ name, till }) => ({ name, x: Math.round(till.x), y: Math.round(till.y), value: till.value, count: till.pile.count, incoming: till.pile.incoming, enabled: till.enabled !== false })),
      till: (name) => { const q = list().find((t) => t.name === name); return q ? q.till : null; },
      ink,
      async scan(name, r = 200) {
        const g = gs(), q = list().find((t) => t.name === name);
        if (!q) return null;
        const till = q.till, owners = new Map();
        for (const t of list()) { if (t.till.pile.bakeImg) owners.set(t.till.pile.bakeImg, t.name + '.pile(baked)'); if (t.till.spin) owners.set(t.till.spin, t.name + '.spin'); }
        const objs = [];
        for (const o of g.children.list) {
          if (!o || !o.texture) continue;
          const key = o.texture.key, fr = o.frame ? String(o.frame.name) : '';
          const own = owners.get(o);
          const coinish = own || o.__type === 'item_coin' || /coin/i.test(key) || /coin/i.test(fr);
          if (!coinish) continue;
          if (Math.hypot(o.x - till.x, o.y - till.y) > r) continue;
          const row = { owner: own || (o.__type ? 'loose ' + o.__type : 'other'), key, frame: fr.slice(0, 40), x: Math.round(o.x), y: Math.round(o.y), alpha: +o.alpha.toFixed(3), visible: o.visible, depth: +o.depth.toFixed(3) };
          if (o.__baked) {
            const st = list().map((t) => t.till.pile).find((p) => p.bakeImg === o);
            row.ink = st ? ink(st) : null;
            row.items = st ? st.items.length : null;
          }
          objs.push(row);
        }
        const pileInk = till.pile.bakeImg ? ink(till.pile) : null;
        // ghost: the till is empty (no value, no coins, none flying in) but coins still show near it
        const empty = till.value <= 0 && till.pile.count === 0 && till.pile.incoming === 0;
        // (an 'other' coin picture — a till's coin icon label — is listed, not counted)
        const shown = objs.filter((o) => o.visible && o.alpha > 0.02 && (o.owner.endsWith('(baked)') ? o.ink && o.ink.px > 0 : o.owner !== 'other'));
        return { name, value: till.value, count: till.pile.count, incoming: till.pile.incoming, bake: !!till.pile.bakeImg, pileInk, objs, ghost: empty && shown.length > 0, zeroValueCoins: till.value <= 0 && till.pile.count > 0 };
      },
      screen(x, y) {
        const g = gs(), cam = g.cameras.main, cv = g.game.canvas, rc = cv.getBoundingClientRect();
        const gx = (x - cam.worldView.x) * cam.zoom, gy = (y - cam.worldView.y) * cam.zoom;
        return { x: rc.left + gx * rc.width / cv.width, y: rc.top + gy * rc.height / cv.height, k: rc.width / cv.width * cam.zoom };
      },
    };
  });
}
