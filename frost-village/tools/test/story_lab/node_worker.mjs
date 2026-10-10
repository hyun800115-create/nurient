// The story core in a Node worker thread (worker_threads), speaking the same protocol as src/story/model/worker.js
// does in the browser: the parity and perf tests run the host against a real thread boundary (structured clone).
import { parentPort } from 'node:worker_threads';
import { StoryCore } from '../../../src/story/model/core.js';

const core = new StoryCore((msg, transfer) => parentPort.postMessage(msg, transfer || []), { maxCatch: 600 });
parentPort.on('message', (m) => core.handle(m));
