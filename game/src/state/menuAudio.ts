// Update 0.5.2 — when the menu ambience plays, and how loud. Pure (tested).

export const MENU_AMBIENCE = {
  gain: 0.6, // × master volume; a touch under the in-game ambience (0.7) so the menu stays calm
  fadeIn: 2.5,
  fadeOut: 0.8,
};

/** The credit screen and main menu (incl. its settings) play it; a run has its own ambience. */
export function wantsMenuAmbience(screen: 'menu' | 'game'): boolean {
  return screen === 'menu';
}
