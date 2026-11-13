// Objectives panel: a short list under the star counter. Tap a row to expand its details.
// Finished objectives get a tick, glow for a moment, then fade out and are removed.
// The panel never reaches down over the touch joystick (`limit`): on a short screen (phone in landscape)
// it shows as many rows as fit plus a "+N more" chip that pages through the rest, and an opened row
// is shown on its own so its details fit too.
const GAP = 5;
export class Objectives {
  constructor(root, { instant = false, limit = null } = {}) {
    this.root = root;
    this.instant = instant; // capture shots: no fade-in
    this.limit = limit;     // element the panel must stay above (the joystick)
    this.items = new Map();
    this.open = null; // id of the expanded row
    this.page = 0;
    this.more = document.createElement('button');
    this.more.className = 'more'; this.more.type = 'button'; this.more.tabIndex = -1;
    root.appendChild(this.more);
    root.addEventListener('click', (e) => {
      if (e.target.closest('.more')) { e.stopPropagation(); this.more.blur(); this.page++; this.layout(); return; }
      const row = e.target.closest('.obj');
      if (!row) return;
      e.stopPropagation();
      row.blur(); // so Space (jump) doesn't re-press the focused row
      this.setOpen(this.open === row.dataset.id ? null : row.dataset.id);
    });
    addEventListener('resize', () => { this.limitTop = null; this.layout(); });
    addEventListener('orientationchange', () => setTimeout(() => { this.limitTop = null; this.layout(); }, 300));
    // keep taps on the panel from reaching the game (joystick / camera)
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'mousedown']) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  }

  add(id, { title, detail, progress }) {
    if (this.items.has(id)) return;
    const el = document.createElement('button');
    el.className = this.instant ? 'obj' : 'obj new';
    el.dataset.id = id;
    el.type = 'button';
    el.tabIndex = -1;
    el.innerHTML = '<span class="dot"></span><span class="t"></span><span class="p"></span><span class="chev">›</span><span class="d"></span>';
    this.root.insertBefore(el, this.more);
    const it = { el, title, detail, progress, done: false };
    this.items.set(id, it);
    this.render(it);
    this.layout();
    if (!this.instant) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('new')));
  }

  update(id, patch) {
    const it = this.items.get(id);
    if (!it || it.done) return;
    Object.assign(it, patch);
    this.render(it);
  }

  complete(id) {
    const it = this.items.get(id);
    if (!it || it.done) return;
    it.done = true;
    it.el.classList.add('done');
    setTimeout(() => it.el.classList.add('gone'), 1600);
    setTimeout(() => { it.el.remove(); this.items.delete(id); if (this.open === id) this.open = null; this.layout(); }, 2300);
  }

  has(id) { const it = this.items.get(id); return !!it && !it.done; }

  setOpen(id) {
    this.open = id;
    for (const [k, it] of this.items) { it.el.classList.toggle('open', k === id); it.el.setAttribute('aria-expanded', String(k === id)); }
    this.layout();
  }

  /** where the panel has to stop: just above the joystick's resting place (or the bottom of the screen) */
  bottomLimit() {
    const j = this.limit;
    if (!j || getComputedStyle(j).display === 'none') return innerHeight;
    if (!j.classList.contains('on')) this.limitTop = j.getBoundingClientRect().top; // while you hold it, it follows your thumb: use where it rests
    return this.limitTop ?? innerHeight;
  }

  /** show only what fits above the joystick */
  layout() {
    const rows = [...this.items.values()].filter((it) => !it.done);
    const done = [...this.items.values()].filter((it) => it.done);
    const top = this.root.getBoundingClientRect().top;
    const avail = this.bottomLimit() - top - 8;
    const rowH = Math.max(24, rows[0]?.el.offsetHeight || 30);
    const fit = Math.max(1, Math.floor((avail + GAP) / (rowH + GAP)));
    const openIt = this.open && this.items.get(this.open);
    // an open row needs about three more rows of room for its details
    const solo = !!openIt && rows.length + 3 > fit;
    this.root.classList.toggle('solo', solo);
    let show = rows, chip = '';
    if (solo) show = [openIt];
    else if (rows.length > fit) {
      const per = Math.max(1, fit - 1), pages = Math.ceil(rows.length / per);
      this.page %= pages;
      show = rows.slice(this.page * per, this.page * per + per);
      const left = rows.length - (this.page * per + show.length);
      chip = left > 0 ? `+${left} more` : '‹ back to the first';
    } else this.page = 0;
    for (const it of rows) it.el.classList.toggle('hid', !show.includes(it));
    for (const it of done) it.el.classList.toggle('hid', solo); // a finished row still plays its tick
    this.more.textContent = chip;
    this.more.classList.toggle('on', !!chip);
    for (const it of this.items.values()) it.el.querySelector('.d').style.maxHeight = solo && it === openIt ? `${Math.max(40, avail - rowH - 10)}px` : '';
  }

  /** debug: what's on screen */
  list() { return [...this.items].map(([id, it]) => ({ id, progress: it.progress ?? null, done: it.done, open: this.open === id })); }

  render(it) {
    it.el.querySelector('.t').textContent = it.title;
    it.el.querySelector('.p').textContent = it.progress ?? '';
    it.el.querySelector('.d').textContent = it.detail;
    it.el.setAttribute('aria-expanded', String(this.open === it.el.dataset.id));
  }
}
