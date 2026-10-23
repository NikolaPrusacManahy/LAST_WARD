// Keyboard + pointer-locked mouse. Uses KeyboardEvent.code so WASD works on any layout.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;

  constructor(
    private el: HTMLElement,
    private debug = false,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouse);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked) return;
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'F2', 'F3'].includes(e.code)) e.preventDefault();
    // Update 0.4.2 — Ctrl is crouch: stop Ctrl+S / Ctrl+D / Ctrl+A etc. from reaching the browser.
    // (Ctrl+W can't be blocked by any page; the leave-page guard in Game catches that one.)
    if (e.ctrlKey) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.down.delete(e.code);
  private onBlur = () => this.down.clear();
  private onMouse = (e: MouseEvent) => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  get locked() {
    return this.debug || document.pointerLockElement === this.el;
  }

  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  /** True once per key press. */
  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  clear() {
    this.down.clear();
    this.endFrame();
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouse);
  }
}
