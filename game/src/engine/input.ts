// Keyboard + mouse buttons + pointer-locked mouse look. Uses KeyboardEvent.code so WASD works on any
// layout. Update 0.5 — mouse buttons are codes too ('Mouse0'..'Mouse4'), and gameplay asks for
// actions (state/bindings.ts) instead of raw keys, so everything can be rebound.
import { Action, Bindings, DEFAULT_BINDINGS, codesFor, mouseCode } from '../state/bindings';

/**
 * Update 0.9.9 — a mouse move no hand makes: a browser glitch (Chrome on Windows now and then reports one
 * move hundreds or thousands of pixels too big; ~2,860 px is a full turn), thrown away. It's one when it's
 * over `min` px and `ratio` times the biggest move in the last `window` s (`floor` px at least, from rest).
 * A real flick builds up over a few frames, so it never looks like one.
 */
export const MOUSE_SPIKE = { min: 350, ratio: 6, floor: 20, window: 0.1 };

/** `size`: this move (px); `recentMax`: the biggest kept move in the last `MOUSE_SPIKE.window` s. */
export function isMouseSpike(size: number, recentMax: number): boolean {
  return size > MOUSE_SPIKE.min && size > MOUSE_SPIKE.ratio * Math.max(recentMax, MOUSE_SPIKE.floor);
}

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  bindings: Bindings = DEFAULT_BINDINGS;

  constructor(
    private el: HTMLElement,
    private debug = false,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouse);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLock);
  }

  /** Update 0.9.9 — ?debug counts as locked only until the browser really locks the mouse; from then on it
   *  plays like the real thing (no keys taken while the pause menu is up). */
  private everLocked = false;
  /** Update 0.9.9 — the last moves kept (when, s; how big, px), to tell a glitch from a flick. */
  private recentMoves: { t: number; size: number }[] = [];
  private onLock = () => {
    if (document.pointerLockElement === this.el) this.everLocked = true;
  };

  private press(code: string) {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  private isBound(code: string) {
    return Object.values(this.bindings).some((b) => codesFor(b).includes(code));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked) return;
    this.press(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'F2', 'F3', 'Enter'].includes(e.code) || this.isBound(e.code)) e.preventDefault();
    // Update 0.4.2 — Ctrl is crouch: stop Ctrl+S / Ctrl+D / Ctrl+A etc. from reaching the browser.
    // (Ctrl+W can't be blocked by any page; the leave-page guard in Game catches that one.)
    if (e.ctrlKey) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.down.delete(e.code);
  private onBlur = () => this.down.clear();
  private onMouse = (e: MouseEvent) => {
    if (!this.locked) return;
    const t = e.timeStamp / 1000;
    const size = Math.hypot(e.movementX, e.movementY);
    this.recentMoves = this.recentMoves.filter((m) => t - m.t <= MOUSE_SPIKE.window);
    if (isMouseSpike(size, this.recentMoves.reduce((a, m) => Math.max(a, m.size), 0))) return;
    this.recentMoves.push({ t, size });
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    this.press(mouseCode(e.button));
    if (e.button >= 3) e.preventDefault(); // side buttons: no browser back/forward mid-run
  };
  private onMouseUp = (e: MouseEvent) => {
    this.down.delete(mouseCode(e.button));
    if (this.locked && e.button >= 3) e.preventDefault();
  };
  /** Right click is the flashlight: never open the browser menu over the game. */
  private onContextMenu = (e: MouseEvent) => {
    if (this.locked || e.target === this.el) e.preventDefault();
  };

  get locked() {
    return document.pointerLockElement === this.el || (this.debug && !this.everLocked);
  }

  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  /** True once per key press. */
  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  /** Held: the key bound to this action (either Shift/Ctrl/Alt counts). */
  action(a: Action) {
    return codesFor(this.bindings[a]).some((c) => this.down.has(c));
  }

  /** Pressed this frame: the key bound to this action. */
  actionPressed(a: Action) {
    return codesFor(this.bindings[a]).some((c) => this.pressed.has(c));
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
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLock);
  }
}
