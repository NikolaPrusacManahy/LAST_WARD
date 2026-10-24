// Update 0.9.8 — the little drawings in your slots: bone line work, each with its own touch of colour
// (the brick's clay, the bottle's green glass, the fuse's amber glow, the battery's charge, the red cross).
import type { CarryKind } from '../state/throwables';

interface Props {
  kind: CarryKind;
  /** A brick that's been thrown once. */
  half?: boolean;
}

export function ItemIcon({ kind, half }: Props) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" aria-hidden>
      {kind === 'brick' &&
        (half ? (
          <>
            <path d="M9 11h12v11H9z" fill="rgba(140, 58, 38, 0.55)" />
            <path d="M9 16.5h12M15 11v5.5" stroke="rgba(216, 210, 188, 0.55)" strokeWidth={1} />
            <path d="M21 11l1.5 2.5-1 2 1.2 2.6-1.7 3.9" strokeWidth={1} />
          </>
        ) : (
          <>
            <path d="M4 11h24v11H4z" fill="rgba(140, 58, 38, 0.55)" />
            <path d="M4 16.5h24M12 11v5.5M20 16.5V22" stroke="rgba(216, 210, 188, 0.55)" strokeWidth={1} />
          </>
        ))}
      {kind === 'bottle' && (
        <>
          <path d="M14 3h4v7c0 2 4 3 4 7v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V17c0-4 4-5 4-7z" fill="rgba(52, 104, 46, 0.6)" />
          <path d="M14 6h4" strokeWidth={1} />
          <path d="M12.5 19v6" stroke="rgba(216, 210, 188, 0.6)" strokeWidth={1} strokeLinecap="round" />
        </>
      )}
      {kind === 'fuse' && (
        <>
          <rect x="8" y="12" width="16" height="8" rx="1" fill="rgba(255, 138, 26, 0.55)" stroke="#ffb35c" />
          <path d="M4 11h4v10H4zM24 11h4v10h-4z" fill="rgba(160, 160, 160, 0.35)" />
          <path d="M11 16h10" stroke="#ffd29a" strokeWidth={1} strokeDasharray="1.5 1.5" />
        </>
      )}
      {kind === 'battery' && (
        <>
          <path d="M13 4h6v3h-6z" fill="rgba(216, 210, 188, 0.35)" />
          <rect x="9.5" y="7" width="13" height="21" rx="1.5" fill="rgba(10, 10, 10, 0.6)" />
          <path d="M12.5 23.5h7M12.5 20h7M12.5 16.5h7" stroke="#2dff6a" strokeWidth={2} />
        </>
      )}
      {kind === 'medkit' && (
        <>
          <path d="M12.5 9V6.5h7V9" />
          <rect x="4" y="9" width="24" height="18" rx="2" fill="rgba(216, 210, 188, 0.14)" />
          <path d="M14 12.5h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#b3201a" stroke="#d8d2bc" strokeWidth={0.8} />
        </>
      )}
    </svg>
  );
}
