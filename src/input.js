// Keyboard + mouse on PC, virtual joystick + buttons on touch. Produces one simple state object.
export class Input {
  constructor(el) {
    this.move = { x: 0, y: 0 }; // x right, y forward (camera space), length <= 1
    this.jumpHeld = false;
    this.jumpPressed = false;
    this.handsHeld = false;
    this.camDX = 0; // accumulated camera drag (pixels)
    this.camDY = 0;
    this.keys = new Set();
    this.touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.camTouch = { id: null, x: 0, y: 0 };
    this.el = el;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'KeyF') this.handsPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // mouse drag rotates the camera
    let drag = false;
    el.addEventListener('mousedown', () => (drag = true));
    addEventListener('mouseup', () => (drag = false));
    addEventListener('mousemove', (e) => { if (drag) { this.camDX += e.movementX; this.camDY += e.movementY; } });

    // touch: left half = joystick, right half = camera drag
    const joy = document.getElementById('joy');
    const knob = document.getElementById('knob');
    this.joyEl = joy; this.knobEl = knob;
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.5 && this.touch.id === null) {
          this.touch = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          joy.style.left = `${t.clientX}px`; joy.style.top = `${t.clientY}px`; joy.classList.add('on');
        } else if (this.camTouch.id === null) {
          this.camTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.id) { this.touch.x = t.clientX; this.touch.y = t.clientY; }
        if (t.identifier === this.camTouch.id) {
          this.camDX += (t.clientX - this.camTouch.x) * 1.2; this.camDY += (t.clientY - this.camTouch.y) * 1.2;
          this.camTouch.x = t.clientX; this.camTouch.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.id) { this.touch.id = null; joy.classList.remove('on'); joy.style.left = ''; joy.style.top = ''; knob.style.transform = ''; }
        if (t.identifier === this.camTouch.id) this.camTouch.id = null;
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);

    const btn = (id, on, off) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.addEventListener('touchstart', (e) => { on(); b.classList.add('down'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      b.addEventListener('touchend', (e) => { off(); b.classList.remove('down'); e.preventDefault(); });
      b.addEventListener('mousedown', (e) => { on(); b.classList.add('down'); e.stopPropagation(); });
      b.addEventListener('mouseup', () => { off(); b.classList.remove('down'); });
    };
    this.btnJump = false; this.btnHands = false;
    btn('bjump', () => { this.btnJump = true; this.jumpPressed = true; }, () => (this.btnJump = false));
    btn('bhands', () => { this.btnHands = true; this.handsPressed = true; }, () => (this.btnHands = false));
    this.handsPressed = false;
    this.run = false;
    this.camActive = 0; // seconds since the player last moved the camera by hand
  }

  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    let joyRun = false;
    if (this.touch.id !== null) {
      const R = 52;
      let dx = this.touch.x - this.touch.ox, dy = this.touch.y - this.touch.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      x = dx / R; y = -dy / R;
      joyRun = Math.hypot(dx, dy) > R * 0.93; // push the stick all the way to run
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
    this.jumpHeld = k.has('Space') || this.btnJump;
    this.run = k.has('ShiftLeft') || k.has('ShiftRight') || joyRun;
  }

  consumeHands() { const h = this.handsPressed; this.handsPressed = false; return h; }
  consumeJump() { const j = this.jumpPressed; this.jumpPressed = false; return j; }
  consumeCam() { const d = [this.camDX, this.camDY]; this.camDX = 0; this.camDY = 0; return d; }
}
