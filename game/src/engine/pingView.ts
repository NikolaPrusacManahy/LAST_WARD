// Update 0.9.9 — ping markers (F): a ring with a mark in it and a line of text (who, what, how far), the
// same size on screen at any distance, seen through walls, fading out at the end. One per player.
import * as THREE from 'three';
import type { PingKind, PingMark } from '../world/ping';
import { PING, pingText } from '../world/ping';

const W = 320;
const H = 128;
const COLOR: Record<PingKind, string> = { enemy: '#e0524c', item: '#e3c26a', spot: '#d8d2bc' };

function draw(ctx: CanvasRenderingContext2D, kind: PingKind, text: string) {
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = COLOR[kind];
  ctx.fillStyle = COLOR[kind];
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, 36, 22, 0, Math.PI * 2);
  ctx.stroke();
  if (kind === 'enemy') {
    // An exclamation mark: it's here.
    ctx.fillRect(cx - 3, 22, 6, 18);
    ctx.fillRect(cx - 3, 44, 6, 6);
  } else {
    // A downward arrow: this, here.
    ctx.beginPath();
    ctx.moveTo(cx - 10, 30);
    ctx.lineTo(cx + 10, 30);
    ctx.lineTo(cx, 46);
    ctx.closePath();
    ctx.fill();
  }
  ctx.font = '24px "Special Elite", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f0e8d0';
  ctx.fillText(text, cx, 96);
}

interface Marker {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mark: PingMark;
  who: string | null;
  until: number;
  text: string;
}

export function createPingMarkers(scene: THREE.Scene) {
  const markers = new Map<string, Marker>();
  const make = (): Marker => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    sprite.scale.set(0.2, 0.08, 1);
    sprite.renderOrder = 21;
    scene.add(sprite);
    return { sprite, ctx, tex, mark: { kind: 'spot', label: '', pos: { x: 0, y: 0, z: 0 } }, who: null, until: 0, text: '' };
  };
  return {
    /** Show `id`'s ping (yours: `who` null) for PING.seconds from `now` (s). */
    show(id: string, mark: PingMark, who: string | null, now: number) {
      const m = markers.get(id) ?? make();
      markers.set(id, m);
      m.mark = mark;
      m.who = who;
      m.until = now + PING.seconds;
      m.text = '';
      m.sprite.position.set(mark.pos.x, mark.pos.y + 0.35, mark.pos.z);
    },
    /** Each frame: fade, and the distance from `eye`. */
    update(eye: { x: number; y: number; z: number }, now: number) {
      for (const m of markers.values()) {
        const left = m.until - now;
        m.sprite.visible = left > 0;
        if (left <= 0) continue;
        const d = Math.hypot(m.mark.pos.x - eye.x, m.mark.pos.y - eye.y, m.mark.pos.z - eye.z);
        const text = pingText(m.mark.label, d, m.who);
        if (text !== m.text) {
          m.text = text;
          draw(m.ctx, m.mark.kind, text);
          m.tex.needsUpdate = true;
        }
        (m.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, left / 0.8) * (m.mark.kind === 'enemy' ? 0.8 + 0.2 * Math.sin(now * 12) : 1);
      }
    },
    dispose() {
      for (const m of markers.values()) {
        scene.remove(m.sprite);
        m.tex.dispose();
        (m.sprite.material as THREE.SpriteMaterial).dispose();
      }
      markers.clear();
    },
  };
}
