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
      uniforms: { uMap: { value: map }, uNormal: { value: normalMap }, uSun: { value: sun.clone().normalize() }, uAlpha: { value: 1 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vT;
        void main() {
          vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          // Tangent toward increasing u (east), for the crater normal map.
          vT = normalize(mat3(modelMatrix) * vec3(position.z, 0.0, -position.x));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform sampler2D uMap; uniform sampler2D uNormal; uniform vec3 uSun; uniform float uAlpha;
        varying vec2 vUv; varying vec3 vN; varying vec3 vT;
        void main() {
          vec3 n = normalize(vN);
          vec3 t = normalize(vT - n * dot(vT, n));
          vec3 b = cross(n, t);
          vec3 tn = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
          vec3 nn = normalize(t * tn.x * 0.8 + b * tn.y * 0.8 + n * tn.z);
          float light = max(dot(nn, uSun), 0.0);
          // Soft edge at the terminator, a faint earthshine on the night side.
          float edge = smoothstep(-0.05, 0.12, dot(n, uSun));
          vec3 albedo = texture2D(uMap, vUv).rgb;
          vec3 col = albedo * (0.025 + 1.25 * light * edge);
          gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), uAlpha);
        }`,
      transparent: true,
      toneMapped: false,
      depthTest: !overlay,
      depthWrite: !overlay,
    });
  }, [map, normalMap, sun, overlay]);
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
