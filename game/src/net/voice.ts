// Update 0.9.9 — proximity voice chat. Your microphone goes straight to each teammate over WebRTC (with
// three of you, two connections each); the database only carries the handshake, under
// rooms/{code}/rtc/{to}/{from}: { o: offer, a: answer, c: { [n]: ICE candidate } }. Each voice that
// arrives goes into the game's audio, placed on the one talking (audio.ts addVoice). Of each pair, the
// player with the lower id calls. If a connection can't be made (some strict networks need a relay
// server this doesn't have), that pair just doesn't hear each other.
import type { Store, Unsubscribe } from './store';

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

let mic: MediaStream | null = null;
let micAsk: Promise<MediaStream | null> | null = null;

/** Ask for the microphone once per page (the lobby does it when you press Ready). Null: refused / none. */
export function getMic(): Promise<MediaStream | null> {
  if (mic) return Promise.resolve(mic);
  if (!micAsk) {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    micAsk = md?.getUserMedia
      ? md
          .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
          .then((s) => (mic = s))
          .catch(() => {
            micAsk = null; // you can say yes next time
            return null;
          })
      : Promise.resolve(null);
  }
  return micAsk;
}

/** The microphone if you already said yes (no prompt). */
export const currentMic = () => mic;

interface Peer {
  pc: RTCPeerConnection;
  /** Candidates we've sent / taken (by their number). */
  sent: number;
  took: Set<string>;
  /** Candidates that came before the offer / answer. */
  early: RTCIceCandidateInit[];
  ready: boolean;
  /** The offer we answered (a new one means they called again). */
  offer?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

export class VoiceChat {
  private peers = new Map<string, Peer>();
  private off: Unsubscribe | null = null;
  private base: string;
  private muted = false;

  constructor(
    private store: Store,
    code: string,
    private me: string,
    private mic: MediaStream | null,
    /** A teammate's voice arrived (or went: null). */
    private onVoice: (id: string, stream: MediaStream | null) => void,
  ) {
    this.base = `rooms/${code}/rtc`;
  }

  start() {
    const inbox = `${this.base}/${this.me}`;
    void this.store.removeOnDisconnect(inbox);
    this.off = this.store.watch(inbox, (raw) => {
      if (!isObj(raw)) return;
      for (const [from, msg] of Object.entries(raw)) if (isObj(msg)) void this.onSignal(from, msg);
    });
  }

  /** Who's in the run now: call the new ones (if it's on us), hang up on those who left. */
  setPeers(ids: string[]) {
    for (const id of ids) if (!this.peers.has(id) && this.me < id) void this.call(id);
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.hangUp(id);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  get isMuted() {
    return this.muted;
  }

  private outbox(to: string) {
    return `${this.base}/${to}/${this.me}`;
  }

  private open(id: string): Peer {
    this.hangUp(id);
    // A clean slate for what we send them (writes from one player arrive in order, so this goes first).
    void this.store.remove(this.outbox(id));
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer: Peer = { pc, sent: 0, took: new Set(), early: [], ready: false };
    this.peers.set(id, peer);
    if (this.mic) for (const t of this.mic.getAudioTracks()) pc.addTrack(t, this.mic);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = (e) => {
      if (e.candidate) void this.store.set(`${this.outbox(id)}/c/${peer.sent++}`, JSON.stringify(e.candidate.toJSON()));
    };
    pc.ontrack = (e) => this.onVoice(id, e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      // Lost: drop it; the caller's next setPeers calls again.
      if (pc.connectionState === 'failed' && this.peers.get(id)?.pc === pc) this.hangUp(id);
    };
    return peer;
  }

  private async call(id: string) {
    const peer = this.open(id);
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      await this.store.update(this.outbox(id), { o: offer.sdp });
    } catch (err) {
      console.warn('Voice: could not call', id, err);
    }
  }

  private async onSignal(from: string, msg: Record<string, unknown>) {
    try {
      if (typeof msg.o === 'string') {
        let peer = this.peers.get(from);
        if (!peer || peer.offer !== msg.o) {
          // They called (or called again): answer.
          peer = this.open(from);
          peer.offer = msg.o;
          await peer.pc.setRemoteDescription({ type: 'offer', sdp: msg.o });
          peer.ready = true;
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await this.store.update(this.outbox(from), { a: answer.sdp });
        }
      } else if (typeof msg.a === 'string') {
        const peer = this.peers.get(from);
        if (peer && !peer.ready && peer.pc.signalingState === 'have-local-offer') {
          await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.a });
          peer.ready = true;
        }
      }
      const peer = this.peers.get(from);
      if (!peer || !isObj(msg.c)) return;
      for (const [n, c] of Object.entries(msg.c)) {
        if (peer.took.has(n) || typeof c !== 'string') continue;
        peer.took.add(n);
        peer.early.push(JSON.parse(c));
      }
      if (peer.ready) for (const c of peer.early.splice(0)) await peer.pc.addIceCandidate(c);
    } catch (err) {
      console.warn('Voice: handshake with', from, 'failed', err);
    }
  }

  private hangUp(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.pc.close();
    this.onVoice(id, null);
  }

  stop() {
    this.off?.();
    this.off = null;
    for (const id of [...this.peers.keys()]) this.hangUp(id);
    void this.store.remove(`${this.base}/${this.me}`);
  }
}
