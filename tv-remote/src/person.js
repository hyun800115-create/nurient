/* Field worker figure for the intro film. Feet at (x, y), about 128 units tall at s = 1.
   view: "front" | "back" | "side" (side faces right; flip: true faces left).
   Angles: 0 points straight down, positive swings toward +x (forward in side view).
   legL/armL are the screen-left limbs in front view and the far limbs in side view. */
const PC = {
  skin: "#f1c6a2", skinS: "#d79d7b", skinL: "#9a5a44", hair: "#2a2420", hairS: "#1a1512",
  shirt: "#2e3c5e", shirtS: "#212b45", shirtF: "#1a2238", pants: "#2a3552", pantsS: "#1d2640", pantsF: "#161d31",
  vest: "#f47725", vestS: "#d35d13", tape: "#eef2f6", tapeS: "#bcc5cf",
  helm: "#fbfbf8", helmS: "#d6d6cf", cap: "#ea002c", capS: "#b5001f",
  glove: "#f2c230", gloveS: "#cd9a13", gloveF: "#a77c0e",
  boot: "#2b2623", bootS: "#181412", sole: "#0d0c0b", cover: "#9ccbee", coverS: "#78acd6",
  gaiter: "#9098a5", gaiterS: "#6c7482", harness: "#ffcf3a", harnessS: "#c4930f", metal: "#c9cfd6", metalS: "#8d949d",
  red: "#ea002c"
};
function pCap(c, x1, y1, r1, x2, y2, r2){
  const a = Math.atan2(y2 - y1, x2 - x1);
  c.beginPath(); c.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2); c.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2); c.closePath();
}
/* Fill a shape with a darker crescent on its lower-right (light from the upper left). */
function pShade(c, path, base, shade, dx, dy){
  c.save(); path(); c.fillStyle = shade; c.fill(); c.clip();
  c.translate(-dx, -dy); path(); c.fillStyle = base; c.fill(); c.restore();
}
function pPt(p, a, l){ return [p[0] + Math.sin(a) * l, p[1] + Math.cos(a) * l]; }

function person(c, x, y, s, o){
  o = o || {};
  const view = o.view || "front", side = view === "side", back = view === "back";
  const g = Object.assign({ helmet: true, cap: false, alarm: false, harness: false, vest: true, gloves: true, gaiters: false, covers: false, badge: false }, o.gear || {});
  const t = o.t || 0, hipY = o.hipY == null ? -55 : o.hipY, lean = o.lean || 0;
  const sx = o.flip ? -s : s;
  c.save(); c.translate(x, y); c.scale(sx, s);
  c.lineCap = "round"; c.lineJoin = "round";
  if (o.shadow !== false){ c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.ellipse(side ? 2 : 0, 1.2, side ? 19 : 16, 3, 0, 0, 7); c.fill(); }

  const legL = o.legL || (side ? [-0.12, 0.02] : [-0.04, 0]);
  const legR = o.legR || (side ? [0.14, -0.04] : [0.04, 0]);
  const footL = o.footL || 0, footR = o.footR || 0;
  const thighR = side ? [6.9, 5.1] : [6.4, 4.8], shinR = side ? [4.9, 3.6] : [4.6, 3.4];

  function boot(A, fa, far){
    c.save(); c.translate(A[0], A[1]); c.rotate(fa);
    const base = g.covers ? PC.cover : (far ? PC.bootS : PC.boot), shade = g.covers ? PC.coverS : PC.bootS;
    if (side){
      const path = () => { c.beginPath(); c.moveTo(-4.8, -3.4); c.lineTo(3, -3.4); c.quadraticCurveTo(6.4, -1.4, 9.6, 0); c.quadraticCurveTo(12, 1.2, 11.4, 3.3); c.lineTo(-4.8, 3.3); c.quadraticCurveTo(-5.8, 0, -4.8, -3.4); c.closePath(); };
      pShade(c, path, base, shade, 0, 1.4);
      if (!g.covers){ c.fillStyle = PC.sole; c.fillRect(-4.8, 2.5, 16.2, 1.5); }
    } else {
      const path = () => { c.beginPath(); c.moveTo(-4.6, -3.6); c.lineTo(4.6, -3.6); c.quadraticCurveTo(6.2, 1, 5.4, 3.4); c.lineTo(-5.4, 3.4); c.quadraticCurveTo(-6.2, 1, -4.6, -3.6); c.closePath(); };
      pShade(c, path, base, shade, 1.6, 0.6);
      if (!g.covers){ c.fillStyle = PC.sole; c.fillRect(-5.5, 2.7, 11, 1.4); }
    }
    c.restore();
  }
  function leg(hip, a, fa, far){
    const K = pPt(hip, a[0], 27), A = pPt(K, a[1], 25);
    const base = far ? PC.pantsS : PC.pants, shade = far ? PC.pantsF : PC.pantsS;
    pShade(c, () => pCap(c, hip[0], hip[1], thighR[0], K[0], K[1], thighR[1]), base, shade, 1.9, 1);
    pShade(c, () => pCap(c, K[0], K[1], shinR[0], A[0], A[1], shinR[1]), base, shade, 1.6, .8);
    if (g.gaiters){
      const P = [K[0] + (A[0] - K[0]) * .38, K[1] + (A[1] - K[1]) * .38], Q = [K[0] + (A[0] - K[0]) * .97, K[1] + (A[1] - K[1]) * .97];
      pShade(c, () => pCap(c, P[0], P[1], shinR[0] + .8, Q[0], Q[1], shinR[1] + .9), far ? PC.gaiterS : PC.gaiter, PC.gaiterS, 1.4, .6);
      const ang = Math.atan2(A[1] - K[1], A[0] - K[0]) + Math.PI / 2;
      c.strokeStyle = far ? "#545b67" : PC.gaiterS; c.lineWidth = 1.3;
      [.58, .8].forEach(q => { const M = [K[0] + (A[0] - K[0]) * q, K[1] + (A[1] - K[1]) * q], r = shinR[0] + .6;
        c.beginPath(); c.moveTo(M[0] - Math.cos(ang) * r, M[1] - Math.sin(ang) * r); c.lineTo(M[0] + Math.cos(ang) * r, M[1] + Math.sin(ang) * r); c.stroke(); });
    }
    boot(A, fa, far);
    return { K, A };
  }
  function hand(W, a, far){
    const base = g.gloves ? (far ? PC.gloveS : PC.glove) : (far ? PC.skinS : PC.skin);
    const shade = g.gloves ? (far ? PC.gloveF : PC.gloveS) : PC.skinS;
    const C = pPt(W, a, 3.6);
    c.save(); c.translate(C[0], C[1]); c.rotate(-a);
    pShade(c, () => { c.beginPath(); c.ellipse(0, 0, 3.2, 4.3, 0, 0, 7); }, base, shade, 1.1, .5);
    c.fillStyle = shade; c.beginPath(); c.ellipse(-2.9, -1.2, 1.25, 2.3, .5, 0, 7); c.fill();
    c.restore();
  }
  function arm(S, a, far){
    const E = pPt(S, a[0], 21), W = pPt(E, a[1], 19);
    const base = far ? PC.shirtS : PC.shirt, shade = far ? PC.shirtF : PC.shirtS;
    pShade(c, () => pCap(c, S[0], S[1], 4.6, E[0], E[1], 3.9), base, shade, 1.5, .8);
    pShade(c, () => pCap(c, E[0], E[1], 3.8, W[0], W[1], 3.1), base, shade, 1.3, .7);
    const Cf = pPt(W, a[1], -2.2);
    c.fillStyle = shade; pCap(c, Cf[0], Cf[1], 3.4, W[0], W[1], 3.3); c.fill();
    hand(W, a[1], far);
    return { E, W };
  }

  // legs (far/left first)
  const hipL = side ? [-1, hipY] : [-6.5, hipY], hipR = side ? [1.5, hipY] : [6.5, hipY];
  const LL = leg(hipL, legL, footL, side), LR = leg(hipR, legR, footR, false);

  // upper body in a frame at the hip, rotated by lean
  c.save(); c.translate(0, hipY); c.rotate(lean);
  const armL = o.armL || (side ? [-0.15, 0.05] : [-0.14, -0.05]);
  const armR = o.armR || (side ? [0.2, 0.1] : [0.14, 0.05]);
  const shL = side ? [0.5, -35.5] : [-13.2, -35.5], shR = side ? [2.2, -35.5] : [13.2, -35.5];
  let AL = null, AR = null;
  if (side) AL = arm(shL, armL, true);

  const torso = side
    ? () => { c.beginPath(); c.moveTo(-4.5, -41); c.quadraticCurveTo(-9.6, -39.5, -10.6, -33); c.quadraticCurveTo(-11.6, -24, -10.2, -15); c.quadraticCurveTo(-9.2, -7, -10.6, 2); c.lineTo(9.6, 2); c.quadraticCurveTo(10.6, -6, 9.6, -12); c.quadraticCurveTo(11.6, -20, 10.6, -28); c.quadraticCurveTo(9.6, -36, 4.6, -40.6); c.quadraticCurveTo(0, -42, -4.5, -41); c.closePath(); }
    : () => { c.beginPath(); c.moveTo(-5, -40.6); c.quadraticCurveTo(-11, -40.2, -15.4, -36.6); c.quadraticCurveTo(-17.2, -32.6, -14, -26); c.quadraticCurveTo(-11, -17, -11.6, -8); c.quadraticCurveTo(-13.2, -2, -12.6, 2.2); c.lineTo(12.6, 2.2); c.quadraticCurveTo(13.2, -2, 11.6, -8); c.quadraticCurveTo(11, -17, 14, -26); c.quadraticCurveTo(17.2, -32.6, 15.4, -36.6); c.quadraticCurveTo(11, -40.2, 5, -40.6); c.quadraticCurveTo(0, back ? -41.5 : -38.4, -5, -40.6); c.closePath(); };
  pShade(c, torso, PC.shirt, PC.shirtS, 3.4, 0);
  c.save(); torso(); c.clip();
  c.fillStyle = PC.pants; c.fillRect(-20, -2.2, 40, 6);
  if (g.vest){
    c.save(); c.beginPath(); c.rect(-20, -38.6, 40, 32.4); c.clip();
    pShade(c, torso, PC.vest, PC.vestS, 3.2, 0);
    c.fillStyle = PC.tape; c.fillRect(-20, -22.5, 40, 3.2); c.fillRect(-20, -14.5, 40, 3.2);
    c.fillStyle = PC.tapeS; c.fillRect(side ? 4 : 8, -22.5, 14, 3.2); c.fillRect(side ? 4 : 8, -14.5, 14, 3.2);
    if (!side && !back){ c.fillStyle = PC.shirt; c.beginPath(); c.moveTo(-5.6, -40); c.lineTo(0, -29.5); c.lineTo(5.6, -40); c.closePath(); c.fill();
      c.strokeStyle = PC.vestS; c.lineWidth = .9; c.beginPath(); c.moveTo(0, -29.5); c.lineTo(0, -6.4); c.stroke(); }
    if (side){ c.strokeStyle = PC.vestS; c.lineWidth = .9; c.beginPath(); c.moveTo(8.8, -33); c.lineTo(9, -6.4); c.stroke(); }
    c.restore();
  } else if (g.badge && !back){
    c.fillStyle = "#f4f6f8"; c.fillRect(side ? 4.5 : -10.5, -30, 5.5, 7); c.fillStyle = PC.red; c.fillRect(side ? 4.5 : -10.5, -30, 5.5, 1.8);
  }
  c.fillStyle = "#1b1b1b"; c.fillRect(-20, -6, 40, 3.8);
  if (!back){ c.fillStyle = PC.metal; c.fillRect(side ? 7 : -2.2, -6.4, 4.4, 4.6); }
  c.restore();

  if (g.harness){
    const strap = (pts) => { c.strokeStyle = PC.harnessS; c.lineWidth = 3.6; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke();
      c.strokeStyle = PC.harness; c.lineWidth = 2.3; c.stroke(); };
    if (side){
      strap([[-1.5, -40.5], [6.5, -31], [9.4, -12]]); strap([[-3, -40.5], [-9.6, -30], [-9.8, -12]]);
      strap([[-10.4, -8.2], [10, -8.2]]);
      c.strokeStyle = PC.metal; c.lineWidth = 1.5; c.beginPath(); c.arc(-11.2, -30.5, 2.6, 0, 7); c.stroke();
    } else {
      strap([[-11.6, -37], [9.8, -7.2]]); strap([[11.6, -37], [-9.8, -7.2]]); strap([[-12.6, -8.2], [12.6, -8.2]]);
      if (back){ c.strokeStyle = PC.metal; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -24.5, 3, 0, 7); c.stroke(); }
      else { c.fillStyle = PC.metal; c.fillRect(-2.6, -24.6, 5.2, 4.6); c.fillStyle = PC.metalS; c.fillRect(-2.6, -21.2, 5.2, 1.2); }
    }
  }

  // neck, collar and head
  const N0 = side ? [1.4, -38.5] : [0, -38.5], N1 = side ? [2.6, -46.5] : [0, -46.5];
  pShade(c, () => pCap(c, N0[0], N0[1], 3.7, N1[0], N1[1], 3.6), PC.skin, PC.skinS, 1.2, 0);
  if (!back){
    c.fillStyle = PC.shirt;
    if (side){ c.beginPath(); c.moveTo(-3.8, -40.6); c.lineTo(0.5, -44.2); c.lineTo(5.4, -40.2); c.quadraticCurveTo(1, -38.8, -3.8, -40.6); c.fill(); }
    else { c.beginPath(); c.moveTo(-5.4, -40.4); c.lineTo(-3.4, -44.3); c.lineTo(0, -39.6); c.lineTo(3.4, -44.3); c.lineTo(5.4, -40.4); c.quadraticCurveTo(0, -38, -5.4, -40.4); c.fill(); }
  }
  if (!side) AL = arm(shL, armL, false);

  if (side){
    const head = () => { c.beginPath(); c.moveTo(-7.6, -60); c.bezierCurveTo(-7.6, -66, -1, -67.6, 3, -66.6); c.bezierCurveTo(6.6, -65.6, 8.1, -62.6, 8.3, -59.6);
      c.lineTo(10.4, -55.9); c.lineTo(8.5, -54.6); c.bezierCurveTo(8.9, -53, 8.7, -51.5, 8.1, -50.5); c.bezierCurveTo(7.7, -48.2, 6.1, -46.3, 3.1, -46.3);
      c.bezierCurveTo(0, -46.5, -2, -48, -3, -50); c.bezierCurveTo(-6.6, -51, -7.9, -55, -7.6, -60); c.closePath(); };
    pShade(c, head, PC.skin, PC.skinS, -1.4, 1.2);
    c.fillStyle = PC.hair; c.beginPath(); c.moveTo(-7.7, -60.5); c.bezierCurveTo(-8.2, -55.5, -6.6, -52.2, -3.6, -51.4); c.lineTo(-2.6, -58.5); c.lineTo(1.6, -61.5); c.lineTo(-1, -63); c.closePath(); c.fill();
    c.fillStyle = PC.skinS; c.beginPath(); c.ellipse(-0.6, -56.4, 1.9, 2.8, .1, 0, 7); c.fill();
    c.strokeStyle = PC.skinL; c.lineWidth = .7; c.beginPath(); c.arc(-0.5, -56.4, 1.1, -1.2, 1.4); c.stroke();
    c.fillStyle = PC.hair; c.beginPath(); c.ellipse(5.6, -57.9, .95, 1.3, 0, 0, 7); c.fill();
    c.strokeStyle = PC.hair; c.lineWidth = 1.1; c.beginPath(); c.moveTo(4.1, -60.4); c.lineTo(7.3, -60.8); c.stroke();
    c.strokeStyle = PC.skinL; c.lineWidth = .9; c.beginPath(); c.moveTo(8.2, -51.8); c.lineTo(6.3, -51.5); c.stroke();
  } else {
    const head = () => { c.beginPath(); c.moveTo(0, -66.6); c.bezierCurveTo(6.6, -66.6, 8.9, -61, 8.7, -57); c.bezierCurveTo(8.5, -52, 5.6, -46.8, 0, -45.9);
      c.bezierCurveTo(-5.6, -46.8, -8.5, -52, -8.7, -57); c.bezierCurveTo(-8.9, -61, -6.6, -66.6, 0, -66.6); c.closePath(); };
    [-1, 1].forEach(k => { c.fillStyle = PC.skinS; c.beginPath(); c.ellipse(k * 8.7, -56.4, 1.9, 2.9, 0, 0, 7); c.fill(); });
    if (back){
      pShade(c, head, PC.hair, PC.hairS, 1.6, 0);
      c.fillStyle = PC.skinS; c.beginPath(); c.ellipse(0, -47.6, 5.2, 1.6, 0, 0, 7); c.fill();
    } else {
      pShade(c, head, PC.skin, PC.skinS, 1.8, .6);
      c.fillStyle = PC.hair; [-1, 1].forEach(k => { c.beginPath(); c.moveTo(k * 8.6, -61.5); c.quadraticCurveTo(k * 9.2, -58, k * 8.2, -55.8); c.lineTo(k * 7.2, -60.2); c.closePath(); c.fill(); });
      c.strokeStyle = PC.hair; c.lineWidth = 1.15;
      c.beginPath(); c.moveTo(-5.4, -59.6); c.quadraticCurveTo(-3.6, -60.6, -1.9, -60.1); c.moveTo(1.9, -60.1); c.quadraticCurveTo(3.6, -60.6, 5.4, -59.6); c.stroke();
      c.fillStyle = PC.hair; [-1, 1].forEach(k => { c.beginPath(); c.ellipse(k * 3.5, -57.2, 1.05, 1.35, 0, 0, 7); c.fill(); });
      c.fillStyle = "#fff"; [-1, 1].forEach(k => { c.beginPath(); c.arc(k * 3.5 + .35, -57.7, .35, 0, 7); c.fill(); });
      c.strokeStyle = PC.skinS; c.lineWidth = .95; c.beginPath(); c.moveTo(.3, -56.4); c.quadraticCurveTo(1.7, -53.6, .1, -52.9); c.stroke();
      c.strokeStyle = "#9b4a3c"; c.lineWidth = 1; c.beginPath(); c.arc(0, -51.9, 2.5, .35, Math.PI - .35); c.stroke();
      c.fillStyle = "rgba(232,120,100,.2)"; [-1, 1].forEach(k => { c.beginPath(); c.arc(k * 5.2, -53.4, 1.8, 0, 7); c.fill(); });
    }
  }

  // headwear (or hair when bare-headed)
  if (!g.helmet && !g.cap){
    c.fillStyle = PC.hair;
    if (side){ c.beginPath(); c.moveTo(-8, -58); c.bezierCurveTo(-9, -66, -3, -69.4, 2.6, -68.6); c.bezierCurveTo(7, -68, 9, -65, 8.6, -61.4); c.quadraticCurveTo(5, -63.6, 1.6, -62.4); c.lineTo(-2.6, -58.4); c.lineTo(-4.6, -54); c.closePath(); c.fill(); }
    else { c.beginPath(); c.moveTo(-8.9, -56); c.bezierCurveTo(-9.8, -66, -5, -69.4, 0, -69.4); c.bezierCurveTo(5, -69.4, 9.8, -66, 8.9, -56); c.quadraticCurveTo(8, -61.6, 4, -62.6); c.quadraticCurveTo(0, -61, -4, -62.6); c.quadraticCurveTo(-8, -61.6, -8.9, -56); c.closePath(); c.fill(); }
  }
  if (g.helmet){
    if (side){
      const dome = () => { c.beginPath(); c.moveTo(-10.4, -60.4); c.bezierCurveTo(-10.6, -69.4, -4, -73.6, 1.6, -73.6); c.bezierCurveTo(7.6, -73.6, 11.2, -69, 11.1, -62);
        c.lineTo(16.8, -60.8); c.quadraticCurveTo(17.4, -59.4, 15.6, -59.2); c.lineTo(-10.9, -59.4); c.quadraticCurveTo(-11.9, -59.9, -10.4, -60.4); c.closePath(); };
      pShade(c, dome, PC.helm, PC.helmS, -1.4, 1.6);
      c.save(); dome(); c.clip(); c.strokeStyle = PC.red; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-10.5, -63); c.bezierCurveTo(-8, -74.5, 8, -75, 11.5, -63.5); c.stroke(); c.restore();
      c.strokeStyle = "#3a3a3a"; c.lineWidth = .8; c.beginPath(); c.moveTo(-1.6, -59.4); c.lineTo(4.4, -46.6); c.stroke();
      if (g.alarm) alarm(-4.6, -66.4);
    } else {
      const dome = () => { c.beginPath(); c.moveTo(-10.9, -60.4); c.bezierCurveTo(-10.9, -69.2, -6, -73.4, 0, -73.4); c.bezierCurveTo(6, -73.4, 10.9, -69.2, 10.9, -60.4); c.closePath(); };
      pShade(c, dome, PC.helm, PC.helmS, 2.4, 0);
      c.save(); dome(); c.clip(); c.fillStyle = PC.red; c.fillRect(-1.6, -74, 3.2, 14); c.restore();
      c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.ellipse(-5, -68.6, 2.2, 1.2, -.6, 0, 7); c.fill();
      const brim = () => { c.beginPath(); c.moveTo(-13, -61); c.quadraticCurveTo(0, back ? -58.6 : -57, 13, -61); c.quadraticCurveTo(0, -59.8, -13, -61); c.closePath(); };
      pShade(c, brim, PC.helm, PC.helmS, 0, -1);
      if (!back){ c.strokeStyle = "#3a3a3a"; c.lineWidth = .8; c.beginPath(); c.moveTo(-8.4, -59.6); c.quadraticCurveTo(-6.4, -48.6, 0, -46.2); c.quadraticCurveTo(6.4, -48.6, 8.4, -59.6); c.stroke(); }
      if (g.alarm) alarm(back ? -12.4 : 8.6, -68.4);
    }
  } else if (g.cap){
    if (side){
      pShade(c, () => { c.beginPath(); c.moveTo(-9.4, -60.8); c.bezierCurveTo(-9.6, -68.4, -3.6, -71.6, 1.6, -71.4); c.bezierCurveTo(6.6, -71.2, 9.8, -67.6, 9.4, -61.4); c.closePath(); }, PC.cap, PC.capS, -1.2, 1.4);
      c.fillStyle = PC.capS; c.beginPath(); c.moveTo(5, -61.4); c.quadraticCurveTo(12.6, -62.8, 16, -60.6); c.quadraticCurveTo(12.4, -59.4, 5, -60.2); c.closePath(); c.fill();
    } else {
      pShade(c, () => { c.beginPath(); c.moveTo(-9.7, -60.6); c.bezierCurveTo(-9.7, -68.6, -5, -71.6, 0, -71.6); c.bezierCurveTo(5, -71.6, 9.7, -68.6, 9.7, -60.6); c.closePath(); }, PC.cap, PC.capS, 2, 0);
      if (!back){ c.fillStyle = PC.capS; c.beginPath(); c.ellipse(0, -60.2, 10.6, 2.6, 0, 0, Math.PI); c.fill(); }
    }
  }

  if (side) AR = arm(shR, armR, false); else AR = arm(shR, armR, false);

  // leg loops of the harness sit on the thighs
  c.restore();
  if (g.harness){
    [[hipL, legL, side], [hipR, legR, false]].forEach(([hp, a, far]) => {
      const M = pPt(hp, a[0], 8), ang = a[0], r = thighR[0] - .1;
      const px = Math.cos(ang), py = -Math.sin(ang), dx = Math.sin(ang) * 2.4, dy = Math.cos(ang) * 2.4;
      c.strokeStyle = far ? PC.harnessS : PC.harness; c.lineWidth = 2.3;
      c.beginPath(); c.moveTo(M[0] - px * r, M[1] - py * r); c.quadraticCurveTo(M[0] + dx, M[1] + dy, M[0] + px * r, M[1] + py * r); c.stroke();
    });
  }
  c.restore();

  function alarm(ax, ay){
    c.fillStyle = "#23262b"; c.beginPath(); c.moveTo(ax - 2.4, ay - 2.4); c.lineTo(ax + 2.6, ay - 2.4); c.lineTo(ax + 2.6, ay + 2.6); c.lineTo(ax - 2.4, ay + 2.6); c.closePath(); c.fill();
    const on = Math.floor(t * 4) % 2 === 0;
    c.fillStyle = on ? "#ff3b30" : "#5a1a16"; c.beginPath(); c.arc(ax + .1, ay + .1, 1.3, 0, 7); c.fill();
    if (on){ c.strokeStyle = "rgba(255,59,48,.7)"; c.lineWidth = .9; for (let k = 1; k <= 2; k++){ c.beginPath(); c.arc(ax, ay, 3.2 + k * 2.6, -2.2, -.6); c.stroke(); } }
  }

  // anchor points in stage coordinates
  const fig = (p) => [x + p[0] * sx, y + p[1] * s];
  const up = (p) => { const cs = Math.cos(lean), sn = Math.sin(lean); return fig([p[0] * cs - p[1] * sn, hipY + p[0] * sn + p[1] * cs]); };
  return {
    head: up(side ? [1.5, -57] : [0, -57]), helmet: up([0, -68]), alarm: up(side ? [-4.6, -66.4] : [8.6, -68.4]),
    chest: up(side ? [6, -24] : [0, -22.5]), back: up([-11.2, -30.5]), waist: up([side ? 9.6 : 0, -8]),
    shoulderTop: up(side ? [-3.5, -39.5] : [-9, -39]), hipFront: up(side ? [9.4, -4] : [8, -4]),
    handL: up(pPt(AL.W, (o.armL || [0, 0])[1], 3.6)), handR: up(pPt(AR.W, (o.armR || [0, 0])[1], 3.6)),
    shin: fig([(LL.K[0] + LL.A[0]) / 2, (LL.K[1] + LL.A[1]) / 2]), foot: fig(LR.A), footL: fig(LL.A), knee: fig(LR.K), hip: fig([0, hipY])
  };
}
