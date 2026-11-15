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
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// The grain texture is one 3 m tile. Read on its own it repeats in rows, so it is read three ways (as is, turned
// 34 degrees and scaled up, turned the other way and scaled down) and patches of each, a few metres across, are
// blended by noise. Far away the grain fades to its average, so what is left can't alias into a grid.
const mat2 gRotB = mat2(0.8290, 0.5592, -0.5592, 0.8290);
const mat2 gRotC = mat2(0.4161, -0.9093, 0.9093, 0.4161);
vec2 gUvB(vec2 uv) { return gRotB * uv * 1.37 + vec2(0.31, 0.77); }
vec2 gUvC(vec2 uv) { return gRotC * uv * 0.61 + vec2(0.53, 0.19); }
vec3 gWeights() {
  float b = smoothstep(0.35, 0.65, gNoise(vGround / 4.3) * 0.75 + gNoise(vGround / 1.6 + 5.0) * 0.25);
  float c = smoothstep(0.4, 0.7, gNoise(vGround / 7.9 + 11.0));
  return vec3((1.0 - b) * (1.0 - c), b * (1.0 - c), c);
}
float gFar() { return smoothstep(18.0, 140.0, length(vViewPosition)); }
vec4 groundMap(sampler2D t, vec2 uv) {
  vec3 w = gWeights();
  vec4 s = texture2D(t, uv) * w.x + texture2D(t, gUvB(uv)) * w.y + texture2D(t, gUvC(uv)) * w.z;
  return mix(s, textureLod(t, uv, 12.0), gFar() * 0.9);
}
// Normal-map texels from a turned lookup point along the turned axes, so turn them back.
vec3 groundNormal(sampler2D t, vec2 uv) {
  vec3 w = gWeights();
  vec3 a = texture2D(t, uv).xyz * 2.0 - 1.0;
  vec3 b = texture2D(t, gUvB(uv)).xyz * 2.0 - 1.0;
  vec3 c = texture2D(t, gUvC(uv)).xyz * 2.0 - 1.0;
  b.xy = b.xy * gRotB;
  c.xy = c.xy * gRotC;
  vec3 n = a * w.x + b * w.y + c * w.z;
  n.xy *= 1.0 - gFar() * 0.75;
  return n;
}
// Patches of darker and lighter soil at several sizes (10 m to 300 m), so no stretch of ground looks uniform,
// least of all from above on the way down.
float groundMacro() {
  vec2 p = vGround;
  return (gNoise(p / 11.0 + 7.0) - 0.5) * 0.07 + (gNoise(p / 37.0 + 3.1) - 0.5) * 0.12 + (gNoise(p / 130.0 - 4.7) - 0.5) * 0.14 + (gNoise(p / 420.0 + 9.3) - 0.5) * 0.1;
}
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
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= (1.0 - trodden(vGround)) * (1.0 + groundMacro());")
      .replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment.replace("texture2D( map, vMapUv )", "groundMap( map, vMapUv )"))
      .replace(
        "#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps.replaceAll("texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0", "groundNormal( normalMap, vNormalMapUv )"),
      )
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
