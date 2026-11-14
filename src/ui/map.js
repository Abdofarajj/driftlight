// The world map: the round map button (or Tab) opens a painted map of the islands you've found so far,
// the bridges between them, both of you on it, and your next goal glowing. The next island you haven't
// reached yet shows as a faint outline with a question mark. Tap anywhere, Tab or Esc to close.
import { PAL } from '../look/palette.js';

const css = (c, a = 1) => { const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255); return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`; };
const INK = '#8a6670';

/** a wobbly round outline, so islands look painted rather than drawn with a compass */
function blob(ctx, x, y, r, seed, wob = 0.08) {
  ctx.beginPath();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wob * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2.3) * 0.4);
    const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class WorldMap {
  /**
   * state(): { islands: [{ id, name, x, z, r, known, next, look }], links: [{ a: [x, z], b: [x, z], kind }],
   *   me: { x, z, kind }, friend: { x, z, kind, here }, goal: { x, z, text } | null }
   */
  constructor({ state, partnerName }) {
    this.state = state; this.partnerName = partnerName;
    this.btn = document.getElementById('bmap');
    this.el = document.getElementById('map');
    this.cv = document.getElementById('map-c');
    this.cap = document.getElementById('map-cap');
    this.isOpen = false;
    const tap = (el, fn) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
      el.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    };
    tap(this.btn, () => this.toggle());
    tap(this.el, () => this.close());
    for (const ev of ['touchstart', 'touchmove', 'mousedown']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) this.toggle(); }
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
    addEventListener('resize', () => { if (this.isOpen) this.draw(performance.now() / 1000); });
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() {
    this.isOpen = true; this.el.classList.add('on'); this.btn.classList.add('on');
    const loop = () => { if (!this.isOpen) return; this.draw(performance.now() / 1000); requestAnimationFrame(loop); };
    loop();
  }
  close() { this.isOpen = false; this.el.classList.remove('on'); this.btn.classList.remove('on'); }

  draw(t) {
    const S = this.state();
    this.cap.textContent = S.goal ? `Next: ${S.goal.text}` : '';
    const cv = this.cv, dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // fit everything you know about (and the next island) on the page, north up
    const shown = S.islands.filter((i) => i.known || i.next);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const i of shown) { x0 = Math.min(x0, i.x - i.r); x1 = Math.max(x1, i.x + i.r); z0 = Math.min(z0, i.z - i.r); z1 = Math.max(z1, i.z + i.r); }
    const pad = 34, s = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2 - 40) / (z1 - z0));
    const ox = (w - (x1 - x0) * s) / 2 - x0 * s, oy = (h - 40 - (z1 - z0) * s) / 2 - z0 * s;
    const P = (x, z) => [ox + x * s, oy + z * s];

    // paper, with a few soft cloud washes
    ctx.fillStyle = '#fbeedd'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const cx = (Math.sin(i * 12.9) * 0.5 + 0.5) * w, cy = (Math.sin(i * 7.7 + 1) * 0.5 + 0.5) * h, r = 40 + (i % 4) * 30;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, css(PAL.cloud[1], 0.14)); gr.addColorStop(1, css(PAL.cloud[1], 0));
      ctx.fillStyle = gr; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // bridges and the wind current, under the islands
    ctx.lineCap = 'round';
    for (const l of S.links) {
      const [ax, ay] = P(...l.a), [bx, by] = P(...l.b);
      ctx.beginPath();
      if (l.kind === 'wind') { ctx.setLineDash([3, 7]); ctx.strokeStyle = 'rgba(255,170,190,0.9)'; ctx.lineWidth = 2.5; ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 20, bx, by); }
      else if (l.kind === 'clouds') { ctx.setLineDash([2, 6]); ctx.strokeStyle = css(PAL.cloud[1], 0.95); ctx.lineWidth = 5; ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
      else { ctx.setLineDash([]); ctx.strokeStyle = css(PAL.glowHalo, 0.9); ctx.lineWidth = 4; ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // islands
    ctx.textAlign = 'center';
    S.islands.forEach((isl, k) => {
      if (!isl.known && !isl.next) return;
      const [x, y] = P(isl.x, isl.z), r = isl.r * s;
      if (!isl.known) { // the next island: a faint dashed outline and a question mark
        blob(ctx, x, y, r, k + 1); ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(138,102,112,0.45)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(138,102,112,0.5)'; ctx.font = `800 ${Math.max(16, r * 0.7)}px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif`; ctx.fillText('?', x, y + Math.max(6, r * 0.25));
        return;
      }
      const L = isl.look;
      blob(ctx, x, y + r * 0.12, r * 1.02, k + 1); ctx.fillStyle = css(PAL.cliff[1], 0.35); ctx.fill(); // soft shadow below
      blob(ctx, x, y, r, k + 1); ctx.fillStyle = css(L.edge); ctx.fill();
      blob(ctx, x, y - r * 0.04, r * 0.9, k + 3, 0.06);
      const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
      gr.addColorStop(0, css(L.top[0])); gr.addColorStop(1, css(L.top[1]));
      ctx.fillStyle = gr; ctx.fill();
      if (L.water) { blob(ctx, ...P(L.water[0], L.water[1]), L.water[2] * s, k + 5, 0.05); ctx.fillStyle = 'rgba(190,196,236,0.95)'; ctx.fill(); }
      for (const d of L.dots || []) { const [dx, dy] = P(d[0], d[1]); ctx.beginPath(); ctx.arc(dx, dy, Math.max(2, d[2] * s), 0, Math.PI * 2); ctx.fillStyle = d[3]; ctx.fill(); }
      if (isl.name) {
        ctx.font = `800 ${r > 30 ? 14 : 12}px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif`;
        // under the island, or beside it on the left where something else sits below (labelLeft)
        const [lx, ly] = isl.labelLeft ? [x - r - 6, y + 5] : [x, y + r + 16];
        ctx.textAlign = isl.labelLeft ? 'right' : 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(251,238,221,0.9)'; ctx.strokeText(isl.name, lx, ly);
        ctx.fillStyle = INK; ctx.fillText(isl.name, lx, ly);
        ctx.textAlign = 'center';
      }
    });

    // the next goal: a warm pulsing glow
    if (S.goal) {
      const [gx, gy] = P(S.goal.x, S.goal.z), pr = 15 + Math.sin(t * 3) * 4;
      const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, pr * 1.6);
      gr.addColorStop(0, 'rgba(255,246,200,1)'); gr.addColorStop(0.35, css(PAL.glowHalo, 0.75)); gr.addColorStop(1, css(PAL.glowHalo, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, pr * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); // a little four-point star in the middle
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 2.5 : 7; ctx.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = '#fffaf0'; ctx.fill();
    }

    // the two of you
    const dot = (x, y, col) => {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff7ea'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = css(col); ctx.fill();
    };
    const label = (text, x, y) => {
      ctx.font = '800 12px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(251,238,221,0.9)'; ctx.strokeText(text, x, y);
      ctx.fillStyle = INK; ctx.fillText(text, x, y);
    };
    const cape = (kind) => (kind === 'him' ? PAL.capeBlue[0] : PAL.capeRed[0]);
    let [mx, my] = P(S.me.x, S.me.z);
    if (S.friend.here) {
      let [fx, fy] = P(S.friend.x, S.friend.z);
      if (Math.hypot(fx - mx, fy - my) < 22) { // together: two dots side by side under one label
        const cx = (mx + fx) / 2, cy = (my + fy) / 2;
        mx = cx - 6; fx = cx + 6; my = fy = cy;
        dot(fx, fy, cape(S.friend.kind)); dot(mx, my, cape(S.me.kind));
        label(`you & ${this.partnerName}`, cx, cy - 12);
        return;
      }
      dot(fx, fy, cape(S.friend.kind)); label(this.partnerName, fx, fy - 12);
    }
    dot(mx, my, cape(S.me.kind)); label('you', mx, my - 12);
  }
}
