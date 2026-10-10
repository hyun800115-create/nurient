// The shared stage (docs/v5_v8_plan.md §5.7), the beach's own copy of the kit's pure StageDirector so the module runs
// alone. In the game `ports.stage` is the story's director (gs.later.story.stage / endStage) or src/kit/stage.js —
// the beach only uses request / end / busy. Slots: 'ceremony' (the beach events and the reveal use it too: never
// two set pieces at once), 'happening' (cute happenings: never during a ceremony or a drive), 'incident' (v8).

export const SLOT_OF = { reveal: 'ceremony', contest: 'ceremony', fireworks: 'ceremony', polar: 'ceremony', week: 'ceremony', happening: 'happening', incident: 'incident' };

export class LocalStage {
  constructor() { this.active = { ceremony: null, happening: null, incident: null }; this.driving = false; this.log = []; }
  busy(slot) { return !!this.active[slot]; }
  request(beat) {
    const slot = SLOT_OF[beat.kind] || 'ceremony';
    if (this.active[slot]) return { ok: false, why: 'busy' };
    if (slot === 'happening' && (this.active.ceremony || this.driving)) return { ok: false, why: this.active.ceremony ? 'ceremony' : 'driving' };
    this.active[slot] = { kind: beat.kind, since: beat.T || 0 };
    this.log.push(beat.kind);
    if (this.log.length > 40) this.log.shift();
    return { ok: true, staged: true, slot };
  }
  end(kind) { const slot = SLOT_OF[kind] || 'ceremony'; if (this.active[slot] && this.active[slot].kind === kind) this.active[slot] = null; }
}
