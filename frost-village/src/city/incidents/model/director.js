// Director (docs/v5_v8_plan.md §6.7 model/director.js): the story engine's incident phases -> what the game stages.
// Pure: time comes in as T (game seconds), the world as a small `env` of functions the host fills in.
//
// - one staged incident at a time (the StageDirector 'incident' slot); every other incident plays off stage, in the
//   story only (its building states, posters and the 안심 bar still change)
// - a staged phase the engine waits for (ackWait: theft chase, fire dispatch + spray, scuffle fight) is acked when the
//   view has shown it (`shown(id, phase)`, after minShow) or at the latest after ackTimeout — the story never stalls;
//   an off-stage phase is acked after the engine's natural length (offAck)
// - an incident whose venue comes into view half way through is promoted onto the stage at its current phase; a staged
//   one the chief walks far away from leaves the stage (and continues in the story)
// - every incident ends (outcome from the story, or 'lost' when the story went quiet for too long: no dead ends)
//
//   env = { inRange(venue) -> bool, far(venue) -> bool, slotFree() -> bool, person(ref) -> { pid, age, role, named } | null }
//   venue = { place, building }   (story place ids; the host maps them to world positions)

import { KIND, stageable, GOOD_OUTCOMES } from './scripts.js';
import { canCulprit, canScuffle } from './rules.js';
import { DAY } from './time.js';

const STALE = { wanted: 14 * DAY, construct: 3 * DAY, ruin: 2 * DAY, demolish: 2 * DAY, wait: 2 * DAY, tipped: 2 * DAY };
const STALE_DEFAULT = 2 * DAY;

export class Director {
  constructor(cfg) {
    this.cfg = cfg;
    this.inc = new Map();           // id -> incident record
    this.staged = 0;                // id of the incident on stage (0 = none)
    this.scene = null;              // { id, kind, until } the open scene (its tail runs after the incident's stage phases)
    this.out = [];                  // module events
    this.cmds = [];                 // host commands: ack, scene, art
    this.artUntil = new Map();      // art group -> T to drop it
    this.stats = { started: 0, ended: 0, staged: 0, promoted: 0, unstaged: 0, acks: 0, ackTimeouts: 0, offAcks: 0, lost: 0, ruleBreaks: 0, ignored: 0, maxStaged: 0 };
  }

  emit(ev) { this.out.push(ev); }
  cmd(c) { this.cmds.push(c); }
  active() { return Array.from(this.inc.values()); }
  get(id) { return this.inc.get(id) || null; }

  // ------------------------------------------------------------------------------------------ story events
  /** a story 'incident' event (engine shape, see scripts.js); returns the record or null */
  onIncident(ev, T, env) {
    const id = ev && Number(ev.id);
    if (!Number.isInteger(id) || id <= 0 || !KIND[ev.kind] || typeof ev.phase !== 'string') { this.stats.ignored++; return null; }
    let I = this.inc.get(id);
    if (!I) {
      if (ev.phase === 'done') { this.stats.ignored++; return null; }   // the end of something we never saw (a reload)
      I = {
        id, kind: ev.kind, src: ev.src || 'story', phase: '', phaseT: T, startT: T, lastT: T, place: ev.place || null, building: ev.building || null,
        cast: {}, staged: false, everStaged: false, ack: null, shown: {}, outcome: null, ended: false, item: ev.item || null, cause: ev.cause || null,
      };
      this.inc.set(id, I);
      this.stats.started++;
      this.checkRules(I, ev, env);
    }
    if (I.ended) return I;
    this.castOf(I, ev);
    if (ev.place) I.place = ev.place;
    if (ev.building) I.building = ev.building;
    if (ev.item) I.item = ev.item;
    if (ev.cause) I.cause = ev.cause;
    I.lastT = T;
    if (ev.phase === 'done') { this.end(I, ev.outcome || I.outcome || 'done', T, env); return I; }
    const prev = I.phase;
    I.phase = ev.phase; I.phaseT = T;
    if (ev.outcome) I.outcome = ev.outcome;
    this.emit({ t: 'inc:phase', id, kind: I.kind, phase: I.phase, prev, staged: I.staged, place: I.place, building: I.building, outcome: I.outcome });
    // the engine waits for our ack in this phase
    I.ack = null;
    if (ev.ack) this.armAck(I, T);
    if (I.kind === 'fire' && I.phase === 'ruin') I.ruined = true;
    // stage it now, or tell the open scene about the new phase (after its stage phases the scene plays its tail:
    // the arrest walk, the poster going up, the cheer or the collapse, then it closes)
    if (I.staged) {
      this.cmd({ t: 'scene', op: 'phase', id, kind: I.kind, phase: I.phase, inc: this.snap(I) });
      if (!stageable(I.kind, I.phase)) this.closeSoon(I, T);
    } else if (stageable(I.kind, I.phase)) this.tryStage(I, T, env, false);
    else if (this.isApology(I) && !this.staged && env && env.slotFree() && env.inRange(this.venue(I))) this.stageApology(I, T);
    return I;
  }

  isApology(I) { return I.kind === 'theft' ? I.phase === 'release' : false; }

  castOf(I, ev) {
    const C = I.cast;
    const pidOf = (k) => (typeof ev[k + 'Pid'] === 'string' ? ev[k + 'Pid'] : null);
    for (const k of ['culprit', 'victim']) if (ev[k] !== undefined && ev[k] !== -1) C[k] = { sid: ev[k], pid: pidOf(k) || C[k] && C[k].pid || null };
    for (const k of ['officers', 'crew', 'witnesses']) if (Array.isArray(ev[k])) { const pids = Array.isArray(ev[k + 'Pid']) ? ev[k + 'Pid'] : []; C[k] = ev[k].slice(0, 8).map((sid, i) => ({ sid, pid: pids[i] || null })); }
  }

  /** the story never casts an elder / a helper / a named villager as a culprit; count it if it ever does */
  checkRules(I, ev, env) {
    if (!env || !env.person) return;
    const ref = (k) => env.person(typeof ev[k + 'Pid'] === 'string' ? ev[k + 'Pid'] : ev[k]);
    const c = ev.culprit !== undefined && ev.culprit !== -1 ? ref('culprit') : null;
    if (!c) return;
    if (I.kind === 'scuffle') { const v = ref('victim'); if (v && !canScuffle(c, v)) this.stats.ruleBreaks++; }
    else if (I.kind !== 'fire' && !canCulprit(c, I.kind)) this.stats.ruleBreaks++;
  }

  armAck(I, T) {
    const key = I.kind + ':' + I.phase;
    const C = this.cfg;
    I.ack = { phase: I.phase, T0: T, due: T + ((C.offAck && C.offAck[key]) || 15), timeout: T + ((C.ackTimeout && C.ackTimeout[key]) || 40), minAt: T + ((C.minShow && C.minShow[key]) || 0), shown: false };
  }

  sendAck(I, why) {
    if (!I.ack) return;
    I.ack = null;
    this.stats.acks++;
    if (why === 'timeout') this.stats.ackTimeouts++;
    if (why === 'off') this.stats.offAcks++;
    this.cmd({ t: 'ack', id: I.id, phase: I.phase, why });
  }

  /** the view has shown phase `phase` of incident `id` (truck parked, chase loop done, dust cloud played) */
  shown(id, phase, T) {
    const I = this.inc.get(id);
    if (!I || !I.ack || I.ack.phase !== phase) return false;
    I.ack.shown = true;
    if (T >= I.ack.minAt) this.sendAck(I, 'shown');
    return true;
  }

  // ------------------------------------------------------------------------------------------ the stage
  venue(I) { return { place: I.place, building: I.building, kind: I.kind, phase: I.phase }; }

  tryStage(I, T, env, promote) {
    if (I.staged || this.staged || !env) return false;
    if (!env.slotFree() || !env.inRange(this.venue(I))) return false;
    I.staged = true; I.everStaged = true;
    this.staged = I.id;
    this.scene = { id: I.id, kind: I.kind, until: 0 };
    this.stats.staged++;
    if (promote) this.stats.promoted++;
    this.stats.maxStaged = Math.max(this.stats.maxStaged, this.countStaged());
    // an ack that was running off stage now waits for the pictures (but never longer than the timeout)
    if (I.ack) { const key = I.kind + ':' + I.phase; I.ack.timeout = T + ((this.cfg.ackTimeout && this.cfg.ackTimeout[key]) || 40); I.ack.minAt = T + ((this.cfg.minShow && this.cfg.minShow[key]) || 0); }
    this.want(KIND[I.kind].art, T);
    this.emit({ t: 'stage:open', slot: 'incident', kind: I.kind, id: I.id });
    this.emit({ t: 'inc:stage', id: I.id, kind: I.kind, phase: I.phase, place: I.place, building: I.building, promoted: !!promote });
    this.cmd({ t: 'scene', op: 'start', id: I.id, kind: I.kind, phase: I.phase, inc: this.snap(I) });
    return true;
  }

  /** a short apology beat (theft release at the station door, the window kid next morning) */
  stageApology(I, T) {
    this.staged = I.id; I.staged = true; I.everStaged = true;
    this.scene = { id: I.id, kind: 'apology', until: T + (this.cfg.tail.apology || 7) };
    this.want('crowd', T);
    this.emit({ t: 'stage:open', slot: 'incident', kind: 'apology', id: I.id });
    this.cmd({ t: 'scene', op: 'start', id: I.id, kind: 'apology', phase: I.phase, inc: this.snap(I) });
  }

  countStaged() { let n = 0; for (const I of this.inc.values()) if (I.staged) n++; return n; }

  closeSoon(I, T) {
    if (!this.scene || this.scene.id !== I.id) return;
    if (!this.scene.until) this.scene.until = T + ((this.cfg.tail && this.cfg.tail[this.scene.kind === 'apology' ? 'apology' : I.kind]) || 6);
  }

  closeScene(T, why) {
    const S = this.scene;
    if (!S) return;
    const I = this.inc.get(S.id);
    if (I) I.staged = false;
    this.scene = null;
    this.staged = 0;
    this.cmd({ t: 'scene', op: 'end', id: S.id, kind: S.kind, why });
    this.emit({ t: 'stage:close', slot: 'incident', kind: S.kind, id: S.id, why });
    this.drop(KIND[S.kind] ? KIND[S.kind].art : 'crowd', T);
  }

  want(art, T) { if (!art) return; if (!this.artUntil.has(art)) this.cmd({ t: 'art', op: 'want', art }); this.artUntil.set(art, Infinity); }
  drop(art, T) { if (this.artUntil.has(art)) this.artUntil.set(art, T + (this.cfg.releaseAfter || 15)); }

  // ------------------------------------------------------------------------------------------ the end
  end(I, outcome, T, env) {
    if (I.ended) return;
    I.ended = true; I.outcome = outcome; I.phase = 'done'; I.ack = null;
    const within = T - I.startT <= ((this.cfg.safety && this.cfg.safety.resolveWithin) || DAY);
    const ok = !!GOOD_OUTCOMES[outcome] && within && !(I.kind === 'fire' && I.ruined);
    I.ok = ok;
    this.stats.ended++;
    if (outcome === 'lost') this.stats.lost++;
    this.emit({ t: 'inc:end', id: I.id, kind: I.kind, outcome, ok, staged: I.staged, everStaged: I.everStaged, secs: Math.round(T - I.startT) });
    if (I.staged) { this.cmd({ t: 'scene', op: 'phase', id: I.id, kind: I.kind, phase: 'done', inc: this.snap(I) }); this.closeSoon(I, T); }
    else if (this.isApologyEnd(I) && !this.staged && env && env.slotFree() && env.inRange(this.venue(I))) this.stageApology(I, T);
    this.inc.delete(I.id);
    this.endedList = this.endedList || [];
    this.endedList.push(I);
  }
  isApologyEnd(I) { return I.kind === 'window' && I.outcome === 'apology'; }

  /** take the incidents that ended since the last call */
  takeEnded() { const l = this.endedList || []; this.endedList = []; return l; }

  // ------------------------------------------------------------------------------------------ frame
  update(T, env) {
    for (const I of this.inc.values()) {
      const A = I.ack;
      if (A) {
        if (I.staged) { if ((A.shown && T >= A.minAt) || T >= A.timeout) this.sendAck(I, A.shown ? 'shown' : 'timeout'); }
        else if (T >= A.due) this.sendAck(I, 'off');
      }
      // the story went quiet: never a dead end
      const lim = STALE[I.phase] || STALE_DEFAULT;
      if (T - I.lastT > lim) this.end(I, 'lost', T, env);
    }
    if (env) {
      const S = this.scene;
      // the chief walked far away from the staged incident: it leaves the stage (the story goes on)
      // (not in its tail: the story may already have moved the incident on — the arrest walk plays where it was
      // staged while the incident's venue is the police station)
      if (S && S.kind !== 'apology' && !S.until) {
        const I = this.inc.get(S.id);
        if (I && env.far(this.venue(I))) {
          if (I.ack) I.ack.due = Math.max(T, I.ack.T0 + (I.ack.due - I.ack.T0));
          this.stats.unstaged++;
          this.closeScene(T, 'far');
        }
      }
      // a scene whose incident ended (or left its stage phases) closes after its tail
      if (this.scene && this.scene.until && T >= this.scene.until) this.closeScene(T, 'tail');
      // an incident seen half way through comes on stage
      if (!this.scene && env.slotFree()) {
        for (const I of this.inc.values()) {
          if (!I.staged && stageable(I.kind, I.phase) && env.inRange(this.venue(I))) { this.tryStage(I, T, env, true); break; }
        }
      }
    }
    for (const [art, t] of this.artUntil) if (T >= t) { this.artUntil.delete(art); this.cmd({ t: 'art', op: 'drop', art }); }
  }

  /** plain copy of what the view needs to set the scene */
  snap(I) {
    return { id: I.id, kind: I.kind, phase: I.phase, place: I.place, building: I.building, item: I.item, cause: I.cause, outcome: I.outcome, cast: JSON.parse(JSON.stringify(I.cast)), since: I.phaseT };
  }

  /** forget everything on stage (a load: staged scenes are not saved, they resolve off stage) */
  clearStage(T) { if (this.scene) this.closeScene(T, 'reset'); }
}
