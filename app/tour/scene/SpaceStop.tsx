"use client";

import { useThree } from "@react-three/fiber";
import { Suspense, useCallback, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { skyDir } from "../lib/geo";
import { STOPS } from "../stops";
import { makeEnvironment } from "./environment";
import { HotspotTracker } from "./Hotspots";
import { GltfMachine, type Anchors } from "./Machine";
import { SiteReplay } from "./replays";
import { BODY_RADIUS, Planet, Stars, SunGlow } from "./Space";
import { Walker } from "./Walker";

// Saturn fills the sky behind Cassini, as it did during the Grand Finale dives.
const SATURN_AT = new THREE.Vector3(-0.66, -0.3, -0.69).normalize().multiplyScalar(1500);
const SATURN_R = 560;

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
      <SiteReplay stop={stop} />
      <HotspotTracker stop={stop} anchors={anchors} />
      <Walker stop={stop} mode="float" center={[0, 0, 0]} />
    </>
  );
}
