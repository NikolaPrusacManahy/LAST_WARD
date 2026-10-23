// Screen effects: film grain, vignette, fear-driven chromatic aberration,
// red flash on death and white fade on escape.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFear: { value: 0 },
    uGrain: { value: 1 },
    uRed: { value: 0 },
    uInjured: { value: 0 },
    uLids: { value: 0 }, // Update 0.6.1 — eyelids closing as you black out (0 open, 1 shut) // Update 0.6 — red creeping in from the edges after losing a life
    uWhite: { value: 0 },
    uBlack: { value: 0 },
    uClean: { value: 0 }, // Update 0.3 — F2 debug view: no grain / vignette / aberration
    uNight: { value: 0 }, // Update 0.9.3 — Easy: night vision goggles
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFear, uGrain, uRed, uWhite, uBlack, uClean, uInjured, uLids, uNight;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    // Update 0.6.1 — eyelids: top and bottom lids close toward the middle in a curve (the centre stays
    // open longest), with a soft warm-dark edge and the whole view dimming as they close.
    vec3 applyLids(vec3 col, vec2 uv) {
      if (uLids < 0.001) return col;
      float x = (uv.x - 0.5) * 2.0;
      float curve = 1.0 - 0.5 * x * x;
      float open = (1.0 - uLids) * 0.62 * curve - 0.05 * uLids;
      float lid = smoothstep(open - 0.05, open + 0.03, abs(uv.y - 0.5));
      col *= mix(1.0, 0.55, uLids);
      return mix(col, vec3(0.05, 0.008, 0.006), lid);
    }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      if (uClean > 0.5) {
        vec3 clean = texture2D(tDiffuse, uv).rgb;
        clean = mix(clean, vec3(0.55, 0.0, 0.0), uRed);
        clean = mix(clean, vec3(1.0), uWhite);
        clean = mix(clean, vec3(0.0), uBlack);
        gl_FragColor = vec4(applyLids(clean, uv), 1.0);
        return;
      }
      // Fear warps the edges and splits colour channels.
      float ab = 0.0015 + uFear * 0.006;
      float wob = sin(uTime * 7.0 + uv.y * 30.0) * 0.0015 * uFear;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab + vec2(wob, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab - vec2(wob, 0.0)).b;
      // Slight desaturation, cold tint.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(0.92, 1.0, 1.02), 0.35);
      // Update 0.9.3 — night vision: brightness as phosphor green, lifted shadows, a goggle edge and
      // its own sparkle of noise.
      if (uNight > 0.0) {
        float nl = dot(col, vec3(0.299, 0.587, 0.114));
        nl = pow(clamp(nl, 0.0, 1.0), 0.75) * 1.25 + 0.02;
        vec3 nv = vec3(0.16, 1.0, 0.3) * nl;
        nv += (rand(uv * vec2(1280.0, 720.0) + fract(uTime * 23.0)) - 0.5) * 0.09 * vec3(0.3, 1.0, 0.4);
        float tube = smoothstep(0.78, 0.5, length(c * vec2(1.25, 1.0)) * 1.25);
        col = mix(col, nv * mix(0.15, 1.0, tube), uNight);
      }
      // Vignette tightens with fear.
      float v = 1.0 - smoothstep(0.25, 0.85 - uFear * 0.25, length(c) * 1.25);
      col *= mix(0.25, 1.0, v);
      // Injured: the edges go blood red, pulsing slowly like a heartbeat.
      float edge = smoothstep(0.3, 0.95, length(c) * 1.3);
      float pulse = 0.85 + 0.15 * sin(uTime * 2.4);
      col = mix(col, col * vec3(1.0, 0.25, 0.2) + vec3(0.38, 0.0, 0.0) * edge, clamp(uInjured * edge * pulse, 0.0, 1.0));
      // Grain + faint scanlines.
      float g = rand(uv * vec2(1920.0, 1080.0) + fract(uTime * 37.0)) - 0.5;
      col += g * (0.06 + uFear * 0.05) * uGrain;
      col *= 1.0 - 0.025 * uGrain * sin(uv.y * 900.0 + uTime * 40.0);
      col = mix(col, vec3(0.55, 0.0, 0.0) * (0.6 + l), uRed);
      col = mix(col, vec3(1.0), uWhite);
      col = mix(col, vec3(0.0), uBlack);
      gl_FragColor = vec4(applyLids(col, uv), 1.0);
    }
  `,
};

export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Tone mapping + sRGB first, so grain and vignette work in display space.
  composer.addPass(new OutputPass());
  const horror = new ShaderPass(HorrorShader);
  composer.addPass(horror);
  const u = horror.uniforms;
  return {
    composer,
    set(v: { time?: number; fear?: number; grain?: number; red?: number; white?: number; black?: number; clean?: boolean; injured?: number; lids?: number; night?: number }) {
      if (v.night !== undefined) u.uNight.value = v.night;
      if (v.injured !== undefined) u.uInjured.value = v.injured;
      if (v.lids !== undefined) u.uLids.value = v.lids;
      if (v.clean !== undefined) u.uClean.value = v.clean ? 1 : 0;
      if (v.time !== undefined) u.uTime.value = v.time;
      if (v.fear !== undefined) u.uFear.value = v.fear;
      if (v.grain !== undefined) u.uGrain.value = v.grain;
      if (v.red !== undefined) u.uRed.value = v.red;
      if (v.white !== undefined) u.uWhite.value = v.white;
      if (v.black !== undefined) u.uBlack.value = v.black;
    },
    render: () => composer.render(),
    setSize: (w: number, h: number) => composer.setSize(w, h),
    dispose: () => composer.dispose(),
  };
}

export type PostFx = ReturnType<typeof createPostFx>;
