// StageDirector (docs/v5_v8_plan.md §5.7) — the module's own copy of the kit's pure scheduler; at integration
// src/kit/stage.js takes over with the same API (the story only uses request / end / busy / camera).
//
// Slots: 'ceremony' (proposal, wedding, farewell, birthday party, rank ceremony, district reveal), 'happening' (cute
// happenings), 'incident' (v8). At most one beat per slot; no happening during a ceremony or a drive; no incident
// during a wedding or a farewell. A beat is staged on screen only when its venue is within `near` px of the view
// (or the chief accepted the card's 보러 가기); otherwise it plays off stage in the story only. Camera grabs (≤ 3 s,
// skippable) only for the proposal, district reveals, ceremonies and a wedding the player chose — never a farewell.

export const SLOT_OF = {
  proposal: 'ceremony', wedding: 'ceremony', farewell: 'ceremony', birthday: 'ceremony', rank: 'ceremony', reveal: 'ceremony', school: 'ceremony',
  happening: 'happening', incident: 'incident',
};
const CAMERA_OK = { proposal: 1, reveal: 1, rank: 1, wedding: 1 };

export class StageDirector {
  constructor(opts = {}) {
    this.near = opts.near || 1200;
    this.active = { ceremony: null, happening: null, incident: null };
    this.driving = false;
    this.log = [];
  }

  busy(slot) { return !!this.active[slot]; }
  ceremony() { return this.active.ceremony; }

  /**
   * ask for a slot. beat: { kind, venue: { x, y } | null, watch?: bool (the chief chose 보러 가기) }
   * view: { x, y, w, h } (world rect). Returns { ok, staged, camera, why }.
   */
  request(beat, view) {
    const slot = SLOT_OF[beat.kind] || 'ceremony';
    const cer = this.active.ceremony;
    if (this.active[slot]) return { ok: false, why: 'busy' };
    if (slot === 'happening' && (cer || this.driving)) return { ok: false, why: cer ? 'ceremony' : 'driving' };
    if (slot === 'incident' && cer && (cer.kind === 'wedding' || cer.kind === 'farewell')) return { ok: false, why: 'ceremony' };
    const staged = !!beat.watch || this.inRange(beat.venue, view);
    const camera = staged && !!CAMERA_OK[beat.kind] && (beat.kind !== 'wedding' || !!beat.watch);
    this.active[slot] = { kind: beat.kind, staged, since: beat.T || 0 };
    this.log.push([beat.kind, staged ? 1 : 0]);
    if (this.log.length > 50) this.log.shift();
    return { ok: true, staged, camera, slot };
  }

  end(kind) {
    const slot = SLOT_OF[kind] || 'ceremony';
    if (this.active[slot] && this.active[slot].kind === kind) this.active[slot] = null;
  }

  inRange(v, view) {
    if (!v || !view) return false;
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    const dx = Math.max(0, Math.abs(v.x - cx) - view.w / 2), dy = Math.max(0, Math.abs(v.y - cy) - view.h / 2);
    return Math.hypot(dx, dy) <= this.near;
  }
}
