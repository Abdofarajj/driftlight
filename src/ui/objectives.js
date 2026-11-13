// Objectives panel: a short list under the star counter. Tap a row to expand its details.
// Finished objectives get a tick, glow for a moment, then fade out and are removed.
export class Objectives {
  constructor(root, { instant = false } = {}) {
    this.root = root;
    this.instant = instant; // capture shots: no fade-in
    this.items = new Map();
    this.open = null; // id of the expanded row
    root.addEventListener('click', (e) => {
      const row = e.target.closest('.obj');
      if (!row) return;
      e.stopPropagation();
      row.blur(); // so Space (jump) doesn't re-press the focused row
      this.setOpen(this.open === row.dataset.id ? null : row.dataset.id);
    });
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
    this.root.appendChild(el);
    const it = { el, title, detail, progress, done: false };
    this.items.set(id, it);
    this.render(it);
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
    setTimeout(() => { it.el.remove(); this.items.delete(id); if (this.open === id) this.open = null; }, 2300);
  }

  has(id) { const it = this.items.get(id); return !!it && !it.done; }

  setOpen(id) {
    this.open = id;
    for (const [k, it] of this.items) { it.el.classList.toggle('open', k === id); it.el.setAttribute('aria-expanded', String(k === id)); }
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
