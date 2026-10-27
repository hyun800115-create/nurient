(names) => { const F = window.__FV; const out = {}; for (const n of names) { try { out[n] = F.lifeEvent(n); } catch (e) { out[n] = 'err ' + e.message; } } return out; }
