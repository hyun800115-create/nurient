async (a) => {
  const F = window.__FV, game = F.game, gs = F.scene;
  const base = location.href.replace(/index\.html.*$/, '');
  const { BALANCE } = await import(base + 'src/data/balance.js');
  const { View } = await import(base + 'src/core/View.js');
  window.__B = BALANCE; window.__View = View;
  game.loop.sleep();
  let T = game.loop.time || performance.now(); let D = Date.now(); Date.now = () => D; const DT = 1000 / 60;
  window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; D += DT; game.headlessStep(T, DT); } };
  window.__draw = () => { T += DT; D += DT; game.step(T, DT); };
  window.__day = (h = 10) => { const nb = gs.v4; if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(h); } };
  const ui = game.scene.getScene('UI'); if (a && a.hideUI) ui.sys.setVisible(false);
  if (a && a.w) { game.scale.setGameSize(a.w, a.h); gs.cameras.main.setSize(a.w, a.h); }
  return { k: View.k, size: [game.scale.gameSize.width, game.scale.gameSize.height], cam: [gs.cameras.main.width, gs.cameras.main.height] };
}
