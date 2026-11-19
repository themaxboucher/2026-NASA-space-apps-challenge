"use client";

import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// A globe lit by its own sun direction (in world space), with no dependence on the scene's lights or exposure.
// The trip's Moon and the landing site's Moon use this same material, so the picture is identical when the
// trip hands over from one scene to the other.
export function LitGlobe({
  url,
  normalUrl,
  radius,
  sun,
  alpha,
  overlay = false,
}: {
  url: string;
  normalUrl: string;
  radius: number;
  sun: THREE.Vector3;
  // Optional per-frame opacity (the landing site fades its globe out near the ground); 1 when omitted.
  alpha?: () => number;
  // Drawn over everything else (no depth test): the landing site's globe covers the local ground until you're low.
  overlay?: boolean;
}) {
  const [map, normalMap] = useTexture([url, normalUrl]);
  const material = useMemo(() => {
    // Shared with the trip's other globes (sRGB, decoded to linear when sampled); this shader re-encodes at the end.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return new THREE.ShaderMaterial({
      // Mars' surface is smoother under its dust than the Moon's, so its made-up craters are fainter.
      uniforms: { uMap: { value: map }, uNormal: { value: normalMap }, uSun: { value: sun.clone().normalize() }, uAlpha: { value: 1 }, uDetail: { value: /mars/.test(url) ? 0.55 : 1 }, uMars: { value: /mars/.test(url) ? 1 : 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying float vDist; varying vec3 vWp; varying float vR;
        void main() {
          vUv = uv;
          // Distance to the camera in globe radii (scale-free, so it works at any size).
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWp = wp.xyz;
          vR = length(modelMatrix[0].xyz) * length(position);
          vDist = length(wp.xyz - cameraPosition) / vR;
          vN = normalize(mat3(modelMatrix) * normal);
          // Tangent toward increasing u (east), for the crater normal map.
          vT = normalize(mat3(modelMatrix) * vec3(position.z, 0.0, -position.x));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform sampler2D uMap; uniform sampler2D uNormal; uniform vec3 uSun; uniform float uAlpha; uniform float uDetail; uniform float uMars;
        varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying float vDist; varying vec3 vWp; varying float vR;
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }
        // A field of craters (bowls with a raised rim, random sizes, some cells empty), in cell units: 0 is flat ground.
        float craters(vec2 p, float density) {
          vec2 i = floor(p), f = fract(p);
          float h = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = hash2(i + g);
            if (hash(i + g + 5.7) > density) continue;
            float d = length(g + o - f) / (0.16 + 0.3 * o.y);
            h += d < 1.0 ? (d * d - 1.0) * 0.5 + 0.22 * smoothstep(0.75, 1.0, d) : 0.22 * (1.0 - smoothstep(1.0, 1.7, d));
          }
          return h;
        }
        void main() {
          vec3 n = normalize(vN);
          vec3 t = normalize(vT - n * dot(vT, n));
          vec3 b = cross(n, t);
          vec3 tn = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
          vec3 nn = normalize(t * tn.x * 0.8 + b * tn.y * 0.8 + n * tn.z);
          // Close up the 4096-pixel map is far too coarse (a few km per pixel), so made-up craters smaller than a map
          // pixel fill in: four sizes, from about 1.5 map pixels down to a fiftieth of one. Each size fades in only
          // once its craters cover a few screen pixels (so nothing shimmers) and is bump-lit by the sun.
          float px = 6.2832 * vR / 4096.0; // one map pixel, in world units
          float fw = fwidth(vUv.x) * 4096.0; // map pixels per screen pixel
          float H = 0.0, A = 0.0;
          for (int k = 0; k < 4; k++) {
            float cell = 1.5 / pow(4.0, float(k)); // in map pixels
            float w = (1.0 - smoothstep(0.12, 0.4, fw / cell)) * uDetail;
            if (w <= 0.0) continue;
            // Big craters are rare, small ones everywhere (as on the real Moon); all of them shallow.
            float c = craters(vUv * vec2(4096.0, 2048.0) / cell + float(k) * 31.7, 0.12 + 0.1 * float(k));
            H += w * c * cell * px * 0.035;
            A += w * c * 0.5;
          }
          if (A != 0.0) {
            // Bump mapping from screen-space derivatives (as three.js does for bump maps).
            vec3 dpx = dFdx(vWp), dpy = dFdy(vWp);
            vec3 r1 = cross(dpy, nn), r2 = cross(nn, dpx);
            float det = dot(dpx, r1);
            vec3 grad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
            nn = normalize(abs(det) * nn - grad);
          }
          float light = max(dot(nn, uSun), 0.0);
          // Soft edge at the terminator, a faint earthshine on the night side.
          float edge = smoothstep(-0.05, 0.12, dot(n, uSun));
          vec3 albedo = texture2D(uMap, vUv).rgb;
          // Mars: the orbital mosaic is a dark purple-brown, while the ground you land on is tan dust. Keep the map's
          // bright and dark patches but give them the ground's own sand colour (terrain.ts), so the planet, the
          // approach and the landing site all match.
          if (uMars > 0.5) albedo = vec3(0.7, 0.33, 0.145) * clamp(dot(albedo, vec3(0.2126, 0.7152, 0.0722)) / 0.113, 0.55, 1.6);
          albedo *= 1.0 + 0.06 * clamp(A, -1.0, 1.0);
          // Fine detail that only shows close up (where the map itself is blurry): two scales of soft noise.
          float nearC = 1.0 - smoothstep(0.0015, 0.004, vDist);
          float nearF = 1.0 - smoothstep(0.0004, 0.0012, vDist);
          float d = mix(0.5, vnoise(vUv * vec2(24000.0, 12000.0)), nearC) * 0.6 + mix(0.5, vnoise(vUv * vec2(160000.0, 80000.0)), nearF) * 0.4;
          albedo *= mix(1.0, 0.8 + 0.4 * d, nearC);
          vec3 col = albedo * (0.025 + 1.25 * light * edge);
          gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), uAlpha);
        }`,
      transparent: true,
      toneMapped: false,
      depthTest: !overlay,
      depthWrite: !overlay,
    });
  }, [map, normalMap, sun, overlay, url]);
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    if (!alpha) return;
    const a = alpha();
    material.uniforms.uAlpha.value = a;
    if (mesh.current) mesh.current.visible = a > 0.002;
  });
  return (
    <mesh ref={mesh} material={material} renderOrder={overlay ? 2000 : 0}>
      <sphereGeometry args={[radius, 256, 128]} />
    </mesh>
  );
}
