// Update 0.9.9 — the shared database co-op talks to, cut down to what Firebase's Realtime Database
// does: paths like 'rooms/K7Q2M/players/abc', JSON values, null = delete. Two versions:
//   memoryStore.ts — the stand-in (tests, and tabs of one browser until Firebase is set up)
//   (to come) firebaseStore.ts — the real one; the room code (room.ts) doesn't know which it has.
export type Unsubscribe = () => void;

export interface Store {
  /** This player's id (Firebase: the anonymous sign-in's uid). */
  readonly uid: string;
  /** True for the stand-in: rooms only reach other tabs of this browser. */
  readonly local: boolean;
  get(path: string): Promise<unknown>;
  /** Replace what's at path (null deletes it). */
  set(path: string, value: unknown): Promise<void>;
  /** Write a few children of path at once; a null child is deleted. */
  update(path: string, patch: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  /** Write value only if path is empty (or already holds this same plain value). True if it's ours. */
  claim(path: string, value: unknown): Promise<boolean>;
  /** Called now with what's there, then after every change. */
  watch(path: string, cb: (value: unknown) => void): Unsubscribe;
  /** If this player drops off (tab closed, connection lost), delete path. */
  removeOnDisconnect(path: string): Promise<void>;
  /** Forget the removeOnDisconnect for path (a clean leave does its own deleting). */
  cancelOnDisconnect(path: string): Promise<void>;
  /** The server's clock in ms, so a countdown ends at the same moment for everyone. */
  now(): number;
  /** Leave: runs the removeOnDisconnect deletes and stops every watch. */
  close(): void;
}
