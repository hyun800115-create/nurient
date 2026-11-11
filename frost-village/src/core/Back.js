// (v4.3) the back key: a stack of "close what is on top" handlers. The Android app asks the page first (MainActivity:
// window.__fvApp.back() — true = the game closed something, else the 「게임을 끝낼까요?」 dialog), Escape does the same on
// a computer (UI scene). A panel pushes its handler while it is open and pops it when it closes; the top handler returns
// true when it closed something. The app only asks while the stack is not empty (WebBridge.backOpen), so the exit
// dialog still comes at once when nothing is open.
//   Back.push(fn) / Back.pop(fn) / Back.handle() -> true when something closed

const stack = [];
let told = null;

function tell() {
  const open = stack.length > 0;
  if (open === told) return;
  told = open;
  try { const A = typeof window !== 'undefined' && window.SnowbloomAndroid; if (A && typeof A.backOpen === 'function') A.backOpen(open); } catch (e) { /* not the app */ }
}

export const Back = {
  push(fn) { if (typeof fn !== 'function') return; const i = stack.indexOf(fn); if (i >= 0) stack.splice(i, 1); stack.push(fn); tell(); },
  pop(fn) { const i = stack.lastIndexOf(fn); if (i >= 0) stack.splice(i, 1); tell(); },
  /** close the top thing; false when nothing was open */
  handle() {
    for (let i = stack.length - 1; i >= 0; i--) {
      let done = false;
      try { done = !!stack[i](); } catch (e) { done = false; }
      if (done) return true;
    }
    return false;
  },
  get size() { return stack.length; },
};

if (typeof window !== 'undefined') {
  const app = (window.__fvApp = window.__fvApp || {});
  app.back = () => Back.handle();
}
