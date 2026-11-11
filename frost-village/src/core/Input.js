// Movement input: floating virtual joystick (touch / mouse drag anywhere) + keyboard (WASD / arrows).
// The UI scene feeds pointer events in; the Game scene reads Input.vec each frame.
// ((v4.3) 관망: while Input.watch() is true the same finger / mouse drag looks around the village instead (Input.pan:
//  CameraDirector moves the camera by it), the keys pan too (Input.panKeys), no joystick shows and nothing a human does
//  on the village ends 관망 — only the 관망 button does)

import { View } from './View.js';

export const JOY_RADIUS = 78;   // px (UI space) knob travel
const HAND_MS = 110;          // ((v4.2 fix) a finger on the village tells the pilot after this long (a pinch's second finger cancels)
export const PAN_SLOP = 16;   // ((v4.3) logical px a 관망 finger moves before it pans: a tap stays a tap (UI's tap slop is < 16)

export const Input = {
  vec: { x: 0, y: 0, mag: 0 },
  joy: { active: false, id: -1, bx: 0, by: 0, kx: 0, ky: 0 },
  keys: null,
  override: null,             // test hook: { x, y }
  pilot: null,                // (v4.2) 관망: fn() -> { x, y } while the pilot drives (null = off)
  onHuman: null,              // (v4.2) called when a human moves the chief / taps the village (outside 관망: the countdown stops)
  watch: null,                // (v4.3) 관망: fn() -> true while 관망 is on (a finger pans, the keys pan)
  // (v4.3) the 관망 look-around finger: dx / dy = logical px dragged since CameraDirector last took them; flick = the
  //  finger that moved was lifted (only then may the camera glide on: a second finger landing — a pinch — or a panel
  //  taking the touch (release) stops it where it is)
  pan: { active: false, id: -1, x0: 0, y0: 0, lx: 0, ly: 0, moved: false, dx: 0, dy: 0, flick: false },
  panKeys: { x: 0, y: 0 },    // (v4.3) the arrow keys / WASD while 관망 is on (unit vector)
  lastTouch: 0,
  enabled: true,
  lastActivity: 0,

  attachKeyboard(scene) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    // capture = true: arrow keys / space must not scroll the host page when the game is embedded
    this.keys = kb.addKeys({ up: K.W, down: K.S, left: K.A, right: K.D, up2: K.UP, down2: K.DOWN, left2: K.LEFT, right2: K.RIGHT }, true, false);
    kb.addCapture([K.SPACE]);
  },

  /** (v4.3) is 관망 on (the village looks around instead of steering)? */
  watching() { return !!(this.watch && this.watch()); },

  pointerDown(p) {
    if (this.joy.active || this.pan.active || !this.enabled) return;
    this.touchPending = true;
    const x = View.toLogical(p.x), y = View.toLogical(p.y);
    // ((v4.3) 관망: the finger looks around the village (after PAN_SLOP px; a tap stays a tap: a resident still chats)
    if (this.watching()) {
      const q = this.pan;
      q.active = true; q.id = p.id; q.x0 = q.lx = x; q.y0 = q.ly = y; q.moved = false; q.flick = false;
      return;
    }
    // ((v4.2) a touch on the village: the idle clock restarts and the 관망 countdown stops)
    // ((v4.2 fix, gameplay L1) …after HAND_MS, unless a second finger makes it a pinch (UI calls release()))
    this.handReq = !!this.onHuman;
    this.joy.active = true;
    this.joy.id = p.id;
    this.joy.bx = x; this.joy.by = y;
    this.joy.kx = x; this.joy.ky = y;
  },
  pointerMove(p) {
    const q = this.pan;
    if (q.active) {
      if (p.id !== q.id) return;
      const x = View.toLogical(p.x), y = View.toLogical(p.y);
      // (past the slop the whole way from where the finger landed counts: the village stays under the finger)
      if (!q.moved && Math.hypot(x - q.x0, y - q.y0) > PAN_SLOP) { q.moved = true; q.lx = q.x0; q.ly = q.y0; }
      if (q.moved) { q.dx += x - q.lx; q.dy += y - q.ly; q.lx = x; q.ly = y; }
      return;
    }
    if (!this.joy.active || p.id !== this.joy.id) return;
    const px = View.toLogical(p.x), py = View.toLogical(p.y);
    let dx = px - this.joy.bx, dy = py - this.joy.by;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      // floating base follows the finger when dragged far (feels better on phones)
      const over = d - JOY_RADIUS;
      this.joy.bx += (dx / d) * over; this.joy.by += (dy / d) * over;
      dx = px - this.joy.bx; dy = py - this.joy.by;
    }
    this.joy.kx = px; this.joy.ky = py;
  },
  pointerUp(p) {
    const q = this.pan;
    if (q.active) {
      if (p && p.id !== q.id) return;
      // (a real lift of a finger that panned: the camera may glide on with its speed)
      q.flick = q.moved;
      q.active = false; q.id = -1; q.moved = false;
      return;
    }
    if (!this.joy.active || (p && p.id !== this.joy.id)) return;
    this.joy.active = false; this.joy.id = -1;
  },
  release() {
    this.joy.active = false; this.joy.id = -1; this.handAt = 0; this.handReq = false;
    // ((v4.3 review F1) a pinch's second finger / a panel: the look-around stops here — no glide with the speed the
    //  first finger had)
    const q = this.pan;
    q.active = false; q.id = -1; q.moved = false; q.dx = q.dy = 0; q.flick = false;
  },

  update(now) {
    let x = 0, y = 0;
    if (this.touchPending) { this.touchPending = false; this.lastTouch = now; }
    const watching = !this.override && this.watching();
    const pk = this.panKeys;
    pk.x = pk.y = 0;
    if (this.override) { x = this.override.x; y = this.override.y; }
    else if (this.enabled) {
      if (this.joy.active && !watching) {
        const dx = this.joy.kx - this.joy.bx, dy = this.joy.ky - this.joy.by;
        const d = Math.hypot(dx, dy);
        if (d > 8) { const m = Math.min(1, d / (JOY_RADIUS * 0.75)); x = (dx / d) * m; y = (dy / d) * m; }
      }
      const k = this.keys;
      if (k) {
        let kx = 0, ky = 0;
        if (k.left.isDown || k.left2.isDown) kx -= 1;
        if (k.right.isDown || k.right2.isDown) kx += 1;
        if (k.up.isDown || k.up2.isDown) ky -= 1;
        if (k.down.isDown || k.down2.isDown) ky += 1;
        if (kx || ky) {
          const d = Math.hypot(kx, ky);
          // ((v4.3) 관망: the keys look around the village (CameraDirector), the pilot keeps the chief)
          if (watching) { pk.x = kx / d; pk.y = ky / d; this.lastActivity = now; }
          else { x = kx / d; y = ky / d; }
        }
      }
    }
    let mag = Math.min(1, Math.hypot(x, y));
    // ((v4.2) override (tests) > a human > the pilot; (v4.3) during 관망 a human only looks around: the pilot drives)
    if (watching) { this.handReq = false; this.handAt = 0; }
    if (this.handReq) { this.handReq = false; this.handAt = now || 1; }
    if (this.handAt && (mag > 0.05 || (now || 0) - this.handAt >= HAND_MS)) { this.handAt = 0; if (this.onHuman) { try { this.onHuman('touch'); } catch (e) { /* */ } } }
    if (mag > 0.05) { this.lastActivity = now; if (!this.override && this.onHuman) { try { this.onHuman('move'); } catch (e) { /* */ } } }
    else if (this.pilot && !this.override && !this.handAt) { const v = this.pilot(); if (v) { x = v.x; y = v.y; mag = Math.min(1, Math.hypot(x, y)); } }
    this.vec.x = x; this.vec.y = y; this.vec.mag = mag;
    return this.vec;
  },
};
