import * as THREE from "three";
import type { Stop } from "../stops";
import { groundTextures } from "./textures";

// The ground's material: the tiling grain and normal map, plus two things a plain material cannot do.
// 1. The opposition effect. Lunar soil is a loose, porous "fairy castle" of grains, so it shines back toward the Sun:
//    looking down-sun the ground glows (the surge right around your own shadow's head), looking up-sun it goes dim.
//    Mars dust does this too, more weakly.
// 2. Disturbed soil. Boot prints and the rover's wheel tracks crush that structure, so they look darker.
const FRAG_HEAD = /* glsl */ `
uniform float uOpp; uniform float uPrints; uniform float uTracks; varying vec2 vGround;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float trodden(vec2 p) {
  float dark = 0.0;
  if (uPrints > 0.0) {
    // Boot prints (about 32 x 13 cm) scattered around the machine, thinning out with distance.
    vec2 cell = floor(p / 0.6);
    float dens = uPrints * 0.5 * (1.0 - smoothstep(5.0, 24.0, length(p)));
    if (gHash(cell) < dens) {
      float a = gHash(cell + 7.1) * 6.2832;
      vec2 o = (fract(p / 0.6) - 0.5) * 0.6 - (vec2(gHash(cell + 3.3), gHash(cell + 5.5)) - 0.5) * 0.25;
      vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * o;
      float e = length(q / vec2(0.16, 0.065));
      float tread = 0.7 + 0.3 * step(0.5, fract(q.x / 0.035));
      dark = max(dark, (1.0 - smoothstep(0.8, 1.0, e)) * 0.35 * tread);
    }
  }
  if (uTracks > 0.0 && p.x > -1.3) {
    // The rover's last drive: two 23 cm tracks, 1.83 m apart, curving away behind its rear wheels.
    float u = max(p.x - 1.15, 0.0);
    float d = abs(abs(p.y - 0.006 * u * u) - 0.915);
    float chevron = 0.65 + 0.35 * step(0.5, fract((p.x + d * 1.4) / 0.11));
    dark = max(dark, (1.0 - smoothstep(0.09, 0.125, d)) * 0.35 * chevron * (1.0 - smoothstep(20.0, 80.0, u)));
  }
  return dark;
}
`;

export function groundMaterial(stop: Stop) {
  const moon = stop.setting.kind === "moon";
  const { map, normalMap } = groundTextures(moon ? "moon" : "mars");
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    normalMap,
    normalScale: new THREE.Vector2(1, 1).multiplyScalar(moon ? 1 : 0.75),
    roughness: 1,
    metalness: 0,
  });
  const uniforms = {
    uOpp: { value: moon ? 1 : 0.35 },
    uPrints: { value: moon ? 1 : 0 },
    uTracks: { value: stop.model.kind === "lrv" ? 1 : 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = position.xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_HEAD)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - trodden(vGround);")
      .replace(
        "#include <lights_fragment_end>",
        /* glsl */ `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          // cos of the phase angle (Sun - ground - eye). 1 = looking straight down-sun.
          float cp = dot(normalize(vViewPosition), directionalLights[0].direction);
          float ph = acos(clamp(cp, -1.0, 1.0));
          float phase = 0.95 + 0.55 * cp * max(cp, 0.0) - 0.35 * max(-cp, 0.0) + 0.45 * exp(-ph / 0.06);
          reflectedLight.directDiffuse *= mix(1.0, phase, uOpp);
        }
        #endif
        // Dust has no glossy sheen: even at grazing angles it does not mirror the Sun or sky.
        reflectedLight.directSpecular *= 1.0 - 0.85 * uOpp;
        reflectedLight.indirectSpecular *= 1.0 - 0.85 * uOpp;`,
      );
  };
  return mat;
}
