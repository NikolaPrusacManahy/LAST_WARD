// Procedural canvas textures — no image files needed for the prototype.
// Swap these for real art later, keeping the same function names.
import * as THREE from 'three';
import { createRng } from '../world/rng';
import { layoutNoteText } from './noteLayout';

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function grime(ctx: CanvasRenderingContext2D, size: number, rng: () => number, count: number, color: string) {
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 6 + rng() * size * 0.12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rng: () => number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rng() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
}

export type WallVariant = 'plain' | 'stained' | 'blood' | 'writing';

/** Hospital wall: green tiles on the lower half, stained plaster above. */
export function wallTexture(variant: WallVariant, seed: number): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = createRng(seed);
  // Plaster.
  ctx.fillStyle = '#8a8c7e';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, rng, 6000, 0.08);
  // Tiles (lower 45%).
  const tileTop = S * 0.55;
  ctx.fillStyle = '#4f6b5c';
  ctx.fillRect(0, tileTop, S, S - tileTop);
  const tw = S / 8;
  ctx.strokeStyle = 'rgba(20,25,20,0.55)';
  ctx.lineWidth = 2;
  for (let y = tileTop; y < S; y += tw / 1.5) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
  for (let x = 0; x <= S; x += tw) {
    ctx.beginPath(); ctx.moveTo(x, tileTop); ctx.lineTo(x, S); ctx.stroke();
  }
  // Rail between tiles and plaster.
  ctx.fillStyle = '#2d332c';
  ctx.fillRect(0, tileTop - 8, S, 10);
  // Baseboard.
  ctx.fillStyle = '#1a1c18';
  ctx.fillRect(0, S - 18, S, 18);
  // Water damage running down from the ceiling.
  for (let i = 0; i < 5; i++) {
    const x = rng() * S;
    const w = 10 + rng() * 40;
    const h = 60 + rng() * 200;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(60,50,30,0.45)');
    g.addColorStop(1, 'rgba(60,50,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, h);
  }
  grime(ctx, S, rng, variant === 'plain' ? 10 : 22, 'rgba(30,25,15,0.35)');
  bloodAndWriting(ctx, S, rng, variant, 'IT HEARS YOU');
  return toTexture(c);
}

/** The blood smear, hand prints and scrawled line of the 'blood' / 'writing' wall variants. */
function bloodAndWriting(ctx: CanvasRenderingContext2D, S: number, rng: () => number, variant: WallVariant, text: string) {
  if (variant === 'blood' || variant === 'writing') {
    // Dragged smear + drips.
    ctx.fillStyle = 'rgba(90,8,8,0.85)';
    const y0 = S * (0.35 + rng() * 0.2);
    for (let x = S * 0.15; x < S * 0.85; x += 3) {
      const h = 10 + Math.sin(x * 0.05) * 6 + rng() * 8;
      ctx.fillRect(x, y0 + Math.sin(x * 0.02) * 20, 3, h);
      if (rng() < 0.04) ctx.fillRect(x, y0, 2, 40 + rng() * 120);
    }
    // Hand prints.
    for (let i = 0; i < 2; i++) {
      const hx = S * (0.2 + rng() * 0.6);
      const hy = S * (0.2 + rng() * 0.3);
      ctx.beginPath();
      ctx.ellipse(hx, hy, 16, 20, 0, 0, Math.PI * 2);
      for (let f = 0; f < 5; f++) {
        const a = -Math.PI / 2 + (f - 2) * 0.35;
        ctx.ellipse(hx + Math.cos(a) * 28, hy + Math.sin(a) * 30, 4, 11, a + Math.PI / 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  if (variant === 'writing') {
    ctx.save();
    ctx.translate(S / 2, S * 0.3);
    ctx.rotate(-0.06);
    ctx.font = 'bold 64px "Special Elite", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(110,10,10,0.9)';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

/**
 * Update 1.0.1 — the factory (Harrow Mill): red brick up to about a metre, a concrete sill on it, then
 * flaking grey-beige concrete with rust and water running down from the roof.
 */
export function factoryWallTexture(variant: WallVariant, seed: number): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = createRng(seed);
  // Concrete.
  ctx.fillStyle = '#857f72';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, rng, 9000, 0.1);
  grime(ctx, S, rng, 14, 'rgba(160,150,130,0.18)');
  // Formwork seams.
  ctx.strokeStyle = 'rgba(40,36,30,0.35)';
  ctx.lineWidth = 2;
  for (const y of [S * 0.22, S * 0.45]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
  // Brick (lower third), one course every 22 px, every other course shifted half a brick.
  const brickTop = S * 0.66;
  ctx.fillStyle = '#3b2620';
  ctx.fillRect(0, brickTop, S, S - brickTop);
  const bh = 22;
  const bw = 64;
  for (let y = brickTop, row = 0; y < S; y += bh, row++) {
    for (let x = row % 2 ? -bw / 2 : 0; x < S; x += bw) {
      const r = rng() < 0.15 ? 55 + rng() * 20 : 80 + rng() * 32;
      ctx.fillStyle = `rgb(${r | 0},${(r * 0.5) | 0},${(r * 0.4) | 0})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  grime(ctx, S, rng, 10, 'rgba(20,12,8,0.35)');
  // Sill between brick and concrete, and the dark foot of the wall.
  ctx.fillStyle = '#6d685d';
  ctx.fillRect(0, brickTop - 12, S, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, brickTop, S, 4);
  ctx.fillStyle = '#1c1915';
  ctx.fillRect(0, S - 10, S, 10);
  // Flaking patches (pale concrete showing through).
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(170,162,145,${0.25 + rng() * 0.25})`;
    ctx.beginPath();
    const px = rng() * S;
    const py = rng() * brickTop * 0.9;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const r = 10 + rng() * 26;
      ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.7);
    }
    ctx.fill();
  }
  // Rust and water running down from the roof.
  for (let i = 0; i < 6; i++) {
    const x = rng() * S;
    const w = 6 + rng() * 30;
    const h = 80 + rng() * 260;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const rust = rng() < 0.5;
    g.addColorStop(0, rust ? 'rgba(110,55,20,0.5)' : 'rgba(45,40,30,0.5)');
    g.addColorStop(1, 'rgba(60,40,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, h);
  }
  grime(ctx, S, rng, variant === 'plain' ? 5 : 11, 'rgba(25,20,12,0.3)');
  bloodAndWriting(ctx, S, rng, variant, 'LIGHTS OFF');
  return toTexture(c);
}

/** Update 1.0.1 — the factory floor: a stained concrete slab per tile, its joints cut along the edges. */
export function factoryFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = createRng(41);
  ctx.fillStyle = '#5d5952';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, rng, 14000, 0.14);
  grime(ctx, S, rng, 18, 'rgba(120,114,100,0.2)');
  // Oil and water stains.
  grime(ctx, S, rng, 7, 'rgba(18,15,10,0.3)');
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(15,12,10,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    let x = rng() * S;
    let y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rng() - 0.5) * 60;
      y += (rng() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Joints at the slab's edges.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, S, S);
  return toTexture(c);
}

/** Update 1.0.1 — the factory roof: corrugated sheet metal, rusting, a steel beam across each tile. */
export function factoryCeilingTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = createRng(17);
  ctx.fillStyle = '#4a4a46';
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, S);
  }
  grime(ctx, S, rng, 10, 'rgba(110,55,20,0.4)');
  speckle(ctx, S, rng, 3000, 0.12);
  ctx.fillStyle = '#26241f';
  ctx.fillRect(0, S / 2 - 10, S, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, S / 2 - 10, S, 3);
  return toTexture(c);
}

export function floorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = createRng(99);
  const n = 8;
  const t = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const light = (x + y) % 2 === 0;
      const v = light ? 120 + rng() * 15 : 52 + rng() * 10;
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
      ctx.fillRect(x * t, y * t, t, t);
    }
  }
  speckle(ctx, S, rng, 9000, 0.12);
  grime(ctx, S, rng, 30, 'rgba(25,20,10,0.4)');
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(S, i * t); ctx.stroke();
  }
  return toTexture(c);
}

export function ceilingTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = createRng(7);
  ctx.fillStyle = '#6e6c64';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, rng, 5000, 0.15);
  grime(ctx, S, rng, 6, 'rgba(50,40,20,0.4)');
  ctx.strokeStyle = '#3a3934';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, S, S);
  return toTexture(c);
}

export function noteTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#d8d2bc';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(40,40,60,0.6)';
  for (let y = 20; y < 120; y += 10) {
    ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(12 + 60 + ((y * 37) % 44), y); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(100,10,10,0.6)';
  ctx.fillRect(90, 90, 14, 20);
  return toTexture(c);
}

/** Update 0.6.3 — a torn page pinned to a wall, a short line scrawled on it (Special Elite, redrawn once the font loads).
 *  Update 0.9.9 — the line always fits the page: on two lines, smaller if need be (`layoutNoteText`), and
 *  nothing is drawn past the paper's edge ("It can hear you..." ran off both sides). */
export function wallNoteTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const font = (size: number) => `${size}px "Special Elite", "Courier New", monospace`;
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    // Paper with a ragged bottom edge.
    ctx.fillStyle = '#d8d2bc';
    ctx.beginPath();
    ctx.moveTo(8, 10);
    ctx.lineTo(376, 6);
    ctx.lineTo(372, 228);
    for (let x = 372; x > 10; x -= 18) ctx.lineTo(x - 9, 236 + ((x * 13) % 14) - 7);
    ctx.lineTo(10, 240);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Grime.
    ctx.fillStyle = 'rgba(70,55,30,0.18)';
    ctx.fillRect(10, 160, 362, 70);
    ctx.fillStyle = 'rgba(110,12,12,0.55)';
    ctx.beginPath(); ctx.arc(300, 200, 18, 0, Math.PI * 2); ctx.fill();
    // The line, as big as fits the page (18 px in from each edge), on two lines if it's long.
    const fit = layoutNoteText(text, 326, (s, size) => {
      ctx.font = font(size);
      return ctx.measureText(s).width;
    });
    ctx.fillStyle = '#2a1410';
    ctx.font = font(fit.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(192, 120);
    ctx.rotate(-0.05);
    const lead = fit.size * 1.1;
    fit.lines.forEach((line, i) => ctx.fillText(line, 0, (i - (fit.lines.length - 1) / 2) * lead));
    ctx.restore();
    // A pin.
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath(); ctx.arc(192, 22, 7, 0, Math.PI * 2); ctx.fill();
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.load('54px "Special Elite"').then(() => {
    draw();
    t.needsUpdate = true;
  }, () => undefined);
  return t;
}

export function signTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = color;
  ctx.font = 'bold 64px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Flashlight "cookie": bright core, a faint reflector ring and soft falloff, like a cheap torch. */
export function flashlightCookie(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(240,236,222,0.85)');
  g.addColorStop(0.5, 'rgba(170,165,150,0.5)');
  g.addColorStop(0.56, 'rgba(205,200,185,0.55)');
  g.addColorStop(0.64, 'rgba(120,116,105,0.3)');
  g.addColorStop(0.85, 'rgba(50,48,44,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Smudges on the lens.
  const rng = createRng(5);
  grime(ctx, S, rng, 8, 'rgba(0,0,0,0.18)');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
