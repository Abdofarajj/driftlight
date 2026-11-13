// "Play together" button and invite card. Opening it starts hosting; the link it shows carries the room
// code and which traveler your partner plays. On iPhone "Share link" opens the share sheet (Messages etc.).
export class Invite {
  constructor({ net, partner, partnerHer, linkFor, toast }) {
    Object.assign(this, { net, partner, partnerHer, linkFor, toast });
    this.btn = document.getElementById('btogether');
    this.sheet = document.getElementById('sheet');
    this.msg = document.getElementById('sheet-msg');
    this.link = document.getElementById('sheet-link');
    this.btns = document.getElementById('sheet-btns');
    this.wait = document.getElementById('sheet-wait');
    this.shareBtn = document.getElementById('sheet-share');
    this.copyBtn = document.getElementById('sheet-copy');
    this.state = 'idle'; // idle | starting | hosting | failed
    if (!net) { this.btn.style.display = 'none'; return; }
    const tap = (el, fn) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
      el.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    };
    tap(this.btn, () => this.open());
    tap(document.getElementById('sheet-x'), () => this.close());
    tap(this.shareBtn, () => this.share());
    tap(this.copyBtn, () => this.copy());
    this.sheet.addEventListener('click', (e) => { if (e.target === this.sheet) this.close(); });
    for (const ev of ['touchstart', 'touchmove', 'mousedown']) this.sheet.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    if (!navigator.share) { this.shareBtn.hidden = true; this.copyBtn.className = 'main'; this.copyBtn.textContent = 'Copy link'; }
    this.refresh();
  }

  async open() {
    this.sheet.classList.add('on');
    const { net } = this;
    if (!net.role || this.state === 'failed') {
      this.state = 'starting'; this.refresh();
      try { await net.host(); this.state = 'hosting'; } catch (e) { this.state = 'failed'; net.session.leave(); net.session.role = null; }
    }
    this.refresh();
  }

  close() { this.sheet.classList.remove('on'); }

  get url() { return this.net.code ? this.linkFor(this.net.code) : ''; }

  async share() {
    try { await navigator.share({ title: 'DriftLight', text: 'Come drift with me ✦', url: this.url }); } catch { /* closed the share sheet */ }
  }

  async copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(this.url); ok = true; } catch {
      this.link.hidden = false; this.link.select(); try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    }
    this.copyBtn.textContent = ok ? 'Copied ✦' : 'Select & copy';
    setTimeout(() => { this.copyBtn.textContent = navigator.share ? 'Copy' : 'Copy link'; }, 1600);
  }

  refresh(errorType) {
    const { net, partner } = this;
    if (!net) return;
    const she = partner === 'her' ? 'she' : 'he';
    this.btn.classList.toggle('on', net.online);
    let msg, showLink = false, wait = '';
    if (net.online) msg = `You're playing together ✦<br>Hold hands to light the lanterns.`;
    else if (this.state === 'starting') msg = 'Making your invite link…';
    else if (this.state === 'failed' || (errorType && !net.online && net.role === 'host' && this.state !== 'hosting')) msg = 'Couldn\'t reach the online service. Check your connection and tap the button again.';
    else if (net.role === 'host') { msg = `Send this link to ${partner}. When ${she} opens it, ${she} appears right beside you.`; showLink = true; wait = `Waiting for ${partner}…`; }
    else if (net.role === 'guest') msg = `Connecting to ${this.partnerHer} world…`;
    else msg = '';
    this.msg.innerHTML = msg;
    this.link.value = this.url;
    this.link.hidden = !showLink;
    this.btns.hidden = !showLink;
    this.wait.textContent = wait;
  }
}
