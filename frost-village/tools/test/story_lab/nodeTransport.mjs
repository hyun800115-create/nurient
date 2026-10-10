// A StoryHost transport over a Node worker thread (tools/test/story_lab/node_worker.mjs).
import { Worker } from 'node:worker_threads';

export class NodeWorkerTransport {
  constructor() {
    this.mode = 'worker';
    this.inbox = [];
    this.failed = false;
    this.onwake = null;
    this.onsaved = null;
    this.w = new Worker(new URL('./node_worker.mjs', import.meta.url));
    // as WorkerTransport: a side save is written the moment it arrives, without waiting for a frame
    this.w.on('message', (m) => { if (m && m.t === 'saved' && this.onsaved) { this.onsaved(m); return; } this.inbox.push(m); if (this.onwake) this.onwake(); });
    this.w.on('error', (e) => { this.failed = true; this.error = String(e); });
  }
  post(m, transfer) { this.w.postMessage(m, transfer || []); }
  close() { return this.w.terminate(); }
}

/** wait until the worker has answered everything sent so far (a round trip) */
export function settle(host) {
  return host.query('clock').then(() => host.drain());
}
