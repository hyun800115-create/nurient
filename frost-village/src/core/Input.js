// Movement input: floating virtual joystick (touch / mouse drag anywhere) + keyboard (WASD / arrows).
// The UI scene feeds pointer events in; the Game scene reads Input.vec each frame.

export const JOY_RADIUS = 78;   // px (UI space) knob travel

export const Input = {
  vec: { x: 0, y: 0, mag: 0 },
  joy: { active: false, id: -1, bx: 0, by: 0, kx: 0, ky: 0 },
  keys: null,
  override: null,             // test hook: { x, y }
  enabled: true,
  lastActivity: 0,

  attachKeyboard(scene) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({ up: K.W, down: K.S, left: K.A, right: K.D, up2: K.UP, down2: K.DOWN, left2: K.LEFT, right2: K.RIGHT }, false, false);
  },

  pointerDown(p) {
    if (this.joy.active || !this.enabled) return;
    this.joy.active = true;
    this.joy.id = p.id;
    this.joy.bx = p.x; this.joy.by = p.y;
    this.joy.kx = p.x; this.joy.ky = p.y;
  },
  pointerMove(p) {
    if (!this.joy.active || p.id !== this.joy.id) return;
    let dx = p.x - this.joy.bx, dy = p.y - this.joy.by;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      // floating base follows the finger when dragged far (feels better on phones)
      const over = d - JOY_RADIUS;
      this.joy.bx += (dx / d) * over; this.joy.by += (dy / d) * over;
      dx = p.x - this.joy.bx; dy = p.y - this.joy.by;
    }
    this.joy.kx = p.x; this.joy.ky = p.y;
  },
  pointerUp(p) {
    if (!this.joy.active || (p && p.id !== this.joy.id)) return;
    this.joy.active = false; this.joy.id = -1;
  },
  release() { this.joy.active = false; this.joy.id = -1; },

  update(now) {
    let x = 0, y = 0;
    if (this.override) { x = this.override.x; y = this.override.y; }
    else if (this.enabled) {
      if (this.joy.active) {
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
        if (kx || ky) { const d = Math.hypot(kx, ky); x = kx / d; y = ky / d; }
      }
    }
    const mag = Math.min(1, Math.hypot(x, y));
    this.vec.x = x; this.vec.y = y; this.vec.mag = mag;
    if (mag > 0.05) this.lastActivity = now;
    return this.vec;
  },
};
