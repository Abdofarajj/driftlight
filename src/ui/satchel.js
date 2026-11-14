// The satchel: the bag button (or B) opens a little card of what you've gathered. One row per island you've
// reached, with its keepsakes (lit once picked up) and a tick once they rest in the island's stone, then
// your stars and the secrets you've found, by name. The next island shows as a faint "?" row.
import { SECRETS_TEXT } from '../world/jokes.js';

const ISLES = { forest: 'Lantern Forest', lake: 'Crystal Lake', desert: 'Sunset Desert', hollow: 'Whispering Hollow', peak: 'Snowy Peak', tower: 'Cloud Kingdom' };

// one small painted icon per keepsake (lit or faded with CSS)
const ICON = {
  forest: '<svg viewBox="0 0 24 24"><path d="M9 3.5h6v2.2c2.2 1 3.5 3 3.5 5.5v6.3A3.5 3.5 0 0 1 15 21H9a3.5 3.5 0 0 1-3.5-3.5v-6.3c0-2.5 1.3-4.5 3.5-5.5z" fill="#cfe7e0" fill-opacity=".7" stroke="#8a6670" stroke-width="1.4"/><circle cx="12" cy="14" r="3.2" fill="#ffd36e"/><circle cx="12" cy="14" r="1.6" fill="#fff6d0"/><rect x="8.5" y="2.5" width="7" height="2" rx="1" fill="#c99a78"/></svg>',
  lake: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" fill="#e9e3f7" stroke="#a593c4" stroke-width="1.4"/><circle cx="9.5" cy="9.5" r="2.4" fill="#fff"/><path d="M15.5 15.5a5 5 0 0 1-4 1.6" stroke="#c7b8e6" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>',
  desert: '<svg viewBox="0 0 24 24"><path d="M12 2.5l6 6.5-6 12.5L6 9z" fill="#ffbf7a" stroke="#d98a52" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 9h12M12 2.5V21.5" stroke="#fff0cf" stroke-width="1.1"/></svg>',
  hollow: '<svg viewBox="0 0 24 24"><path d="M10 17.5V5l9-2v12" fill="none" stroke="#9f8fd6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="7.5" cy="17.5" rx="3" ry="2.3" fill="#c7bdf2" stroke="#9f8fd6" stroke-width="1.2"/><ellipse cx="16.5" cy="15" rx="3" ry="2.3" fill="#c7bdf2" stroke="#9f8fd6" stroke-width="1.2"/></svg>',
  peak: '<svg viewBox="0 0 24 24"><path d="M19 3C11 4 6 9.5 5.5 17.5L5 21" fill="none" stroke="#8a6670" stroke-width="1.4" stroke-linecap="round"/><path d="M19 3c.5 7-3.5 13-13.5 14.5C7 10 12 5 19 3z" fill="#b9ecd9" stroke="#7fc4b8" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 14.5l4-1M10 11.5l4-1.2M12.5 8.5l3.5-1.2" stroke="#e6c8f2" stroke-width="1.1" stroke-linecap="round"/></svg>',
  tower: ['<svg viewBox="0 0 24 24"><path d="M12 20.5C7 16.5 3.5 13.5 3.5 9.3A4.3 4.3 0 0 1 12 7.6z" fill="#9cc6f2" stroke="#d6a64e" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M12 20.5c5-4 8.5-7 8.5-11.2A4.3 4.3 0 0 0 12 7.6z" fill="#f29ca6" stroke="#d6a64e" stroke-width="1.5" stroke-linejoin="round"/></svg>'],
};

export class Satchel {
  /** keepsakes: the Keepsakes system; secrets, stars: their systems; reached(id): has this island opened? */
  constructor({ keepsakes, secrets, stars, reached }) {
    Object.assign(this, { keepsakes, secrets, stars, reached });
    this.btn = document.getElementById('bbag');
    this.el = document.getElementById('satchel');
    this.body = document.getElementById('satchel-body');
    this.isOpen = false;
    const tap = (el, fn) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
      el.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    };
    tap(this.btn, () => this.toggle());
    tap(document.getElementById('satchel-x'), () => this.close());
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.el.addEventListener('touchend', (e) => { if (e.target === this.el) { e.preventDefault(); this.close(); } });
    for (const ev of ['touchstart', 'touchmove', 'mousedown']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && !e.repeat) this.toggle();
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() { this.isOpen = true; this.render(); this.el.classList.add('on'); this.btn.classList.add('on'); this.btn.classList.remove('new'); }
  close() { this.isOpen = false; this.el.classList.remove('on'); this.btn.classList.remove('on'); }
  /** something new went in the bag: a little dot on the button until you look */
  ping() { if (this.isOpen) this.render(); else this.btn.classList.add('new'); }

  render() {
    const K = this.keepsakes, rows = [];
    let shownNext = false;
    for (const s of K.sets) {
      if (!this.reached(s.id)) {
        if (!shownNext) rows.push(`<div class="isle unknown"><div class="n">? ? ?</div><div class="w">An island you haven't reached yet</div><div class="ks"></div></div>`);
        shownNext = true;
        continue;
      }
      const its = K.items.filter((it) => it.set === s);
      const n = its.filter((it) => it.got).length, whole = n === its.length;
      const icons = its.map((it, i) => `<span class="${it.got ? 'on' : 'off'}">${Array.isArray(ICON[s.id]) ? ICON[s.id][i % 2] : ICON[s.id]}</span>`).join('');
      const tick = s.placed ? '<span class="tick">✓</span>' : '';
      let w;
      if (s.placed) w = s.noStone ? 'Whole again, and the beacon is lit ♡' : 'Resting in the stone';
      else if (whole) w = s.noStone ? 'Whole again: take it to the beacon together' : `Bring them to the stone ${s.where}`;
      else w = `${s.name}: ${n} of ${its.length} found`;
      rows.push(`<div class="isle"><div class="n">${ISLES[s.id] ?? s.name}</div><div class="w">${w}</div><div class="ks">${icons}${tick}</div></div>`);
    }
    const S = this.secrets, st = this.stars;
    const found = S.items.filter((it) => it.found);
    const hidden = S.items.length - found.length;
    const chips = found.map((it) => `<span class="chip">${SECRETS_TEXT[it.id]?.title ?? it.id}</span>`).join('')
      + (hidden ? `<span class="chip q">${hidden} still hidden ✦</span>` : '');
    this.body.innerHTML = rows.join('')
      + `<div class="sec">★ Stars ${st.count} / ${st.items.length} &nbsp;·&nbsp; ✦ Secrets ${found.length} / ${S.items.length}</div>`
      + `<div class="chips">${chips}</div>`;
  }
}
