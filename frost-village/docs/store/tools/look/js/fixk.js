(a) => {
  const F = window.__FV, game = F.game, V = window.__View;
  V.forceK = 0; V.k = a.k;
  game.scale.setGameSize(Math.round(V.W * a.k), Math.round(V.H * a.k));
  game.scale.refresh();
  for (let i = 0; i < 3; i++) window.__draw();
  return { k: V.k, W: V.W, H: V.H, size: [game.scale.gameSize.width, game.scale.gameSize.height], camZoom: F.scene.cameras.main.zoom, water: F.water && F.water().quality };
}
