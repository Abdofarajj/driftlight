// Your journey, saved on this device: which islands are done, the keepsakes, stars and secrets you've found
// and your last checkpoint, so a closed tab (or a phone that reloads the page) picks up where you were.
// Only milestones are kept, never the middle of a moment (a half-charged lantern, a boat ride).
const KEY = 'driftlight-save-v1';

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.v === 1 ? s : null;
  } catch { return null; }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; } // private mode, storage full
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

const bits = (m) => { let n = 0; for (let x = m >>> 0; x; x &= x - 1) n++; return n; };

/** how far along a save is (islands done + keepsake stones filled), to never swap a longer journey for a shorter one */
export function progressOf(s) {
  if (!s) return -1;
  return (s.q === 31 ? 1 : 0) + bits(s.lk?.l ?? 0) + (s.ds?.d ? 1 : 0) + (s.hw?.ls === 2 ? 1 : 0) + (s.pk?.r ? 1 : 0) + (s.tw?.l ? 1 : 0) + bits(s.kx ?? 0);
}
