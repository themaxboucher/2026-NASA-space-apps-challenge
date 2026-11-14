"use client";

import { useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect } from "react";
import * as THREE from "three";
import { TRAVEL_SUN } from "../plans";
import { tour, type SceneDesc } from "../state";
import { Planet, Stars, Streaks, SunGlow } from "./Space";

// Mounts once Earth's texture has loaded, which is when the start screen is ready to go.
function Ready() {
  useEffect(() => {
    if (!tour.get().sceneReady) tour.set({ sceneReady: true });
  }, []);
  return null;
}

// Space between the worlds: stars, the Sun, and the planets we are leaving and heading for.
export function TravelScene({ desc }: { desc: Extract<SceneDesc, { kind: "travel" }> }) {
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.005;
    cam.far = 3000;
    cam.updateProjectionMatrix();
    gl.toneMappingExposure = 1.0;
    scene.background = new THREE.Color("#000000");
    return () => {
      scene.background = null;
    };
  }, [gl, scene, camera]);

  return (
    <>
      <Stars radius={900} count={3200} />
      <Streaks />
      <SunGlow dir={TRAVEL_SUN} distance={800} size={240} intensity={1.15} />
      <directionalLight position={TRAVEL_SUN.clone().multiplyScalar(30)} intensity={3} color="#fff6ec" />
      <ambientLight intensity={0.03} />
      {desc.bodies.map((b) => (
        // Keyed by body, so Earth stays mounted when the start screen turns into the trip to the Moon.
        <group key={b.key} position={b.pos} rotation={[0, b.rotY, 0]}>
          <Suspense fallback={null}>
            <Planet kind={b.key} sun={TRAVEL_SUN} spin={b.spin} />
            {b.key === "earth" && <Ready />}
          </Suspense>
        </group>
      ))}
    </>
  );
}
