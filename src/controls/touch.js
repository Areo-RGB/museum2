/** Pointer events support simultaneous joystick movement and drag-to-look. */
export class TouchControls {
  constructor(player, { available, onUse, onTour, onPause }) {
    this.player = player;
    this.root = document.getElementById('touchControls');
    this.stick = document.getElementById('moveStick');
    this.knob = document.getElementById('moveKnob');
    this.visible = false;
    this.setAvailable(available);
    this.use = document.getElementById('touchUse');
    this.use.addEventListener('click', onUse);
    document.getElementById('touchTour').addEventListener('click', onTour);
    document.getElementById('touchPause').addEventListener('click', onPause);

    this.stick.addEventListener('pointerdown', e => {
      if (!this.visible || this.moveId != null) return;
      this.moveId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.move(e);
    });
    this.stick.addEventListener('pointermove', e => { if (e.pointerId === this.moveId) this.move(e); });
    const releaseMove = e => {
      if (e.pointerId !== this.moveId) return;
      this.moveId = null;
      player.touchMove.x = player.touchMove.z = 0;
      this.knob.style.transform = '';
    };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) this.stick.addEventListener(event, releaseMove);

    player.canvas.addEventListener('pointerdown', e => {
      if (!this.visible || this.lookId != null) return;
      this.lookId = e.pointerId;
      this.lookX = e.clientX; this.lookY = e.clientY;
      player.canvas.setPointerCapture(e.pointerId);
    });
    player.canvas.addEventListener('pointermove', e => {
      if (!this.visible || e.pointerId !== this.lookId) return;
      player.onMouseMove({ movementX: (e.clientX - this.lookX) * 1.7, movementY: (e.clientY - this.lookY) * 1.7 });
      this.lookX = e.clientX; this.lookY = e.clientY;
    });
    const releaseLook = e => { if (e.pointerId === this.lookId) this.lookId = null; };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) player.canvas.addEventListener(event, releaseLook);
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  setAvailable(available) {
    this.available = available;
    this.player.touchEnabled = available;
    document.body.classList.toggle('touch-mode', available);
    if (!available) this.setVisible(false);
  }

  move(e) {
    const rect = this.stick.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2, dz = e.clientY - rect.top - rect.height / 2;
    const radius = rect.width * 0.34;
    const length = Math.hypot(dx, dz);
    const scale = Math.max(radius, length);
    this.player.touchMove.x = length < 5 ? 0 : dx / scale;
    this.player.touchMove.z = length < 5 ? 0 : dz / scale;
    this.knob.style.transform = `translate(${this.player.touchMove.x * radius}px, ${this.player.touchMove.z * radius}px)`;
  }

  reset() {
    if (this.moveId != null && this.stick.hasPointerCapture(this.moveId)) this.stick.releasePointerCapture(this.moveId);
    if (this.lookId != null && this.player.canvas.hasPointerCapture(this.lookId)) this.player.canvas.releasePointerCapture(this.lookId);
    this.moveId = this.lookId = null;
    this.player.clearInput();
    this.knob.style.transform = '';
  }

  setVisible(visible) {
    visible = visible && this.available;
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.classList.toggle('hidden', !visible);
    if (!visible) this.reset();
  }
}
