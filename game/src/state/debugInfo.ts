// Update 0.3 — text for the F2 debug panel. Pure so it's tested.
import type { EnemyMode } from '../world/enemyAI';

export interface DebugSnapshot {
  fps: number;
  cell: { col: number; row: number };
  enemyMode: EnemyMode;
  alert: number;
  windup: number;
  distance: number;
  seesYou: boolean;
  frozen: boolean;
  fuses: number;
  powered: boolean;
}

export function debugLines(d: DebugSnapshot): string[] {
  return [
    `FPS ${Math.round(d.fps)} · cell ${d.cell.col},${d.cell.row}`,
    `Patient: ${d.enemyMode.toUpperCase()}${d.windup > 0 ? ' (screaming)' : ''}${d.frozen ? ' · FROZEN' : ''}`,
    `alert ${Math.round(d.alert * 100)}% · ${d.distance.toFixed(1)} m · ${d.seesYou ? 'SEES YOU' : 'cannot see you'}`,
    `fuses ${d.fuses}/3 · power ${d.powered ? 'on' : 'off'}`,
    'F2 close · F3 freeze enemy',
  ];
}
