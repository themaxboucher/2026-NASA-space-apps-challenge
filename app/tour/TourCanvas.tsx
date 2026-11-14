"use client";

import { useTexture } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { useStore } from "./lib/store";
import { AdaptiveFov, Director } from "./scene/Director";
import { SpaceScene } from "./scene/SpaceStop";
import { SurfaceScene } from "./scene/Surface";
import { TravelScene } from "./scene/Travel";
import { preloadModel } from "./scene/useModel";
import { tour } from "./state";

// Start fetching what the first minute of the trip needs.
useTexture.preload("/tex/earth.jpg");
useTexture.preload(["/tex/moon.jpg", "/tex/moon-normal.jpg"]);
preloadModel("/models/apollo-lm.gltf.json");

export default function TourCanvas() {
  const scene = useStore(tour, (s) => s.scene);

  useEffect(() => {
    useTexture.preload(["/tex/mars.jpg", "/tex/mars-normal.jpg"]);
  }, []);

  return (
    <Canvas
      className="tour-canvas"
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 50, near: 0.01, far: 3000, position: [0, 0, 3.4] }}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.ACESFilmicToneMapping;
        if (process.env.NODE_ENV !== "production") Object.assign(window, { __tour: { tour, state } });
      }}
    >
      <Director />
      <AdaptiveFov />
      <Suspense fallback={null}>
        {scene.kind === "travel" && <TravelScene desc={scene} />}
        {scene.kind === "surface" && <SurfaceScene key={scene.key} index={scene.stop} />}
        {scene.kind === "space" && <SpaceScene key={scene.key} index={scene.stop} />}
      </Suspense>
    </Canvas>
  );
}
