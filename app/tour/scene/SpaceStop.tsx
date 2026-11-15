"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { skyDir } from "../lib/geo";
import { STOPS } from "../stops";
import { solids } from "../state";
import { makeEnvironment } from "./environment";
import { HotspotTracker } from "./Hotspots";
import { GltfMachine, type Anchors } from "./Machine";
import { SiteReplay } from "./replays";
import { BODY_RADIUS, Planet, Stars, SunGlow } from "./Space";
import { Walker } from "./Walker";

// Saturn fills the sky behind Cassini, as it did during the Grand Finale dives.
const SATURN_AT = new THREE.Vector3(-0.66, -0.3, -0.69).normalize().multiplyScalar(1500);
const SATURN_R = 560;

// Real reflections for Cassini's gold foil: once Saturn and its rings have loaded, a 360° picture of the scene is
// rendered on the GPU from where Cassini sits (with Cassini itself hidden) and used as the environment, so the
// foil mirrors the actual planet, rings, Sun and stars. The foil is also made shinier here.
function CaptureReflections() {
  const { gl, scene } = useThree();
  const frames = useRef(0);
  const done = useRef<{ rt: THREE.WebGLCubeRenderTarget; env: THREE.Texture } | null>(null);
  useFrame(() => {
    if (done.current || ++frames.current < 45) return; // let Saturn's textures arrive first
    const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    const cube = new THREE.CubeCamera(0.5, 20000, rt);
    const hidden = [...solids].filter((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    cube.update(gl, scene);
    hidden.forEach((o) => (o.visible = true));
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromCubemap(rt.texture).texture;
    pm.dispose();
    scene.environment = env;
    scene.environmentIntensity = 1.1;
    for (const o of solids)
      o.traverse((m) => {
        const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!(m as THREE.Mesh).isMesh || !mat?.isMeshStandardMaterial) return;
        if (/^foil/i.test(mat.name)) {
          mat.metalness = 0.92;
          mat.roughness = 0.24;
          mat.envMapIntensity = 2.2;
        } else if (/aluminum|plastic_white|dish/i.test(mat.name)) {
          mat.metalness = Math.max(mat.metalness, 0.35);
          mat.roughness = Math.min(mat.roughness, 0.4);
        }
        mat.needsUpdate = true;
      });
    done.current = { rt, env };
  });
  useEffect(
    () => () => {
      done.current?.rt.dispose();
      done.current?.env.dispose();
    },
    [],
  );
  return null;
}

export function SpaceScene({ index }: { index: number }) {
  const stop = STOPS[index];
  const { gl, scene, camera } = useThree();
  const sun = useMemo(() => skyDir(stop.setting.sun.az, stop.setting.sun.el), [stop]);
  const saturn = stop.setting.backdrop === "saturn";
  const [anchors, setAnchors] = useState<Anchors>({});
  const onAnchors = useCallback((a: Anchors) => setAnchors(a), []);

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.05;
    cam.far = 12000;
    cam.updateProjectionMatrix();
    gl.toneMappingExposure = saturn ? 1.05 : 1.2;
    const env = makeEnvironment(gl, "#020204", saturn ? "#3b3122" : "#040406", sun, saturn ? 40 : 18);
    scene.environment = env.texture;
    scene.environmentIntensity = saturn ? 0.7 : 0.5;
    scene.background = new THREE.Color("#000000");
    return () => {
      scene.environment = null;
      scene.background = null;
      env.dispose();
    };
  }, [gl, scene, camera, saturn, sun]);

  return (
    <>
      <Stars radius={6000} count={3000} />
      <SunGlow dir={sun} distance={5000} size={stop.setting.sunSize ?? (saturn ? 260 : 90)} intensity={saturn ? 1.3 : 1.8} />
      <directionalLight position={sun.clone().multiplyScalar(50)} intensity={saturn ? 2.8 : 2.2} color="#fff6ea" />
      <ambientLight intensity={saturn ? 0.05 : 0.08} />
      {saturn && (
        <>
          {/* Saturn's glow lights Cassini softly from below. */}
          <directionalLight position={SATURN_AT.clone().normalize().multiplyScalar(50)} intensity={0.35} color="#e8c991" />
          <Suspense fallback={null}>
            <group position={SATURN_AT} scale={SATURN_R / BODY_RADIUS.saturn}>
              <Planet kind="saturn" sun={sun} />
            </group>
          </Suspense>
        </>
      )}
      <Suspense fallback={null}>
        <GltfMachine stop={stop} onAnchors={onAnchors} />
      </Suspense>
      {saturn && <CaptureReflections />}
      <SiteReplay stop={stop} />
      <HotspotTracker stop={stop} anchors={anchors} />
      <Walker stop={stop} mode="float" center={[0, 0, 0]} />
    </>
  );
}
