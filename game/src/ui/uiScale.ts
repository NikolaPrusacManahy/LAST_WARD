// Update 0.9.9 — the menu panels (everything but the title screen) are drawn up to twice their size
// (Nikola), as big as fits the window. Every panel is laid out to fit PANEL_BOX at 1×, so none of them
// ever scrolls: twice its size on a full 1080p screen, a little less in a smaller window.
export const PANEL_BOX = { w: 900, h: 540 };
export const UI_MAX = 2;
const UI_MIN = 0.5;

/** How big to draw the panels in a window `w` × `h` (CSS px), in steps of 0.05. */
export function uiScale(w: number, h: number): number {
  const fit = Math.min(UI_MAX, w / PANEL_BOX.w, h / PANEL_BOX.h);
  return Math.max(UI_MIN, Math.floor(fit * 20 + 1e-9) / 20);
}

/** Keep `--lw-ui` (the panels' zoom, theme-01) in step with the window. */
export function trackUiScale(): void {
  const apply = () => document.documentElement.style.setProperty('--lw-ui', String(uiScale(innerWidth, innerHeight)));
  apply();
  addEventListener('resize', apply);
  // (The page's own size too: not every change of window size comes with a resize event.)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(document.documentElement);
}
