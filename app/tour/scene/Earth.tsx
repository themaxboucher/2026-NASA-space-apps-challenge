"use client";

import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { live } from "../state";

// Earth textures, all NASA imagery (public domain):
// - earth.jpg (4096x2048): Blue Marble: Next Generation, November 2004, topography + bathymetry. NASA Earth Observatory
//   (Reto Stöckli, NASA GSFC). https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/
// - earth-clouds.jpg (4096x2048, from cloud_combined_8192.tif): Blue Marble clouds, Terra MODIS, 29 July 2001. NASA
//   Earth Observatory / GSFC. https://visibleearth.nasa.gov/images/57747/blue-marble-clouds
// - earth-night.jpg (4096x2048, city lights isolated from BlackMarble_2016_3km.jpg): Earth at Night (Black Marble) 2016,
//   Suomi NPP VIIRS. NASA Earth Observatory (Joshua Stevens, Miguel Román, NASA GSFC).
//   https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg
// - earth-water.jpg (2048x1024): ocean mask derived here from the Blue Marble day map (for the sun glint).
const DAY = "/tex/earth.jpg";
const EXTRA = { night: "/tex/earth-night.jpg", clouds: "/tex/earth-clouds.jpg", water: "/tex/earth-water.jpg" };
type Extra = Record<keyof typeof EXTRA, THREE.Texture>;

const TILT = THREE.MathUtils.degToRad(23.4);
const DAY_SPIN = (Math.PI * 2) / 140; // one turn every 140 s of tour time
const CLOUD_DRIFT = DAY_SPIN * 0.06; // clouds slide slowly over the ground

// The night, cloud and water layers are fetched once, after the first frame, so the title screen isn't held up.
let extraPromise: Promise<Extra> | null = null;
function loadExtra(): Promise<Extra> {
  if (!extraPromise) {
    const loader = new THREE.TextureLoader();
    extraPromise = Promise.all(Object.values(EXTRA).map((u) => loader.loadAsync(u))).then(([night, clouds, water]) => {
      night.colorSpace = THREE.SRGBColorSpace;
      return { night, clouds, water };
    });
    extraPromise.catch(() => (extraPromise = null));
  }
  return extraPromise;
}

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blank.needsUpdate = true;

export function Earth({ radius, sun, spin = false }: { radius: number; sun: THREE.Vector3; spin?: boolean }) {
  const day = useTexture(DAY);
  const { gl } = useThree();
  const [extra, setExtra] = useState<Extra | null>(null);
  const ground = useRef<THREE.Group>(null);
  const sky = useRef<THREE.Group>(null);

  useEffect(() => {
    let alive = true;
    const id = requestAnimationFrame(() => loadExtra().then((e) => alive && setExtra(e), () => {}));
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, []);

  useLayoutEffect(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    day.colorSpace = THREE.SRGBColorSpace;
    for (const t of [day, extra?.night, extra?.clouds]) {
      if (!t || t.anisotropy === aniso) continue;
      t.anisotropy = aniso;
      t.needsUpdate = true;
    }
  }, [day, extra, gl]);

  const uniforms = useMemo(
    () => ({
      uNight: { value: blank as THREE.Texture },
      uClouds: { value: blank as THREE.Texture },
      uWater: { value: blank as THREE.Texture },
      uSunView: { value: new THREE.Vector3() },
      uCloudShift: { value: 0 },
    }),
    [],
  );
  useEffect(() => {
    uniforms.uNight.value = extra?.night ?? blank;
    uniforms.uClouds.value = extra?.clouds ?? blank;
    uniforms.uWater.value = extra?.water ?? blank;
  }, [extra, uniforms]);

  const surface = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: day, roughness: 1, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader =
        "uniform sampler2D uNight, uClouds, uWater; uniform vec3 uSunView; uniform float uCloudShift;\n" +
        shader.fragmentShader
          .replace(
            "#include <map_fragment>",
            /* glsl */ `#include <map_fragment>
            float water = texture2D(uWater, vMapUv).r;
            float cloud = texture2D(uClouds, vMapUv + vec2(uCloudShift, 0.0)).r;
            // Open ocean seen from space is an even deep blue: tone down the painted sea-floor relief.
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006, 0.016, 0.045), water * 0.6);
            diffuseColor.rgb *= 1.0 - 0.3 * cloud; // the cloud layer's faint shadow`,
          )
          .replace(
            "#include <roughnessmap_fragment>",
            // Smooth water catches a glint of sunlight; land and cloud-covered sea stay matte.
            "#include <roughnessmap_fragment>\n roughnessFactor = mix(1.0, 0.32, water * (1.0 - cloud));",
          )
          .replace(
            "#include <emissivemap_fragment>",
            /* glsl */ `#include <emissivemap_fragment>
            float dark = smoothstep(0.08, -0.18, dot(normalize(vNormal), uSunView));
            vec3 lights = max(texture2D(uNight, vMapUv).rgb - 0.02, 0.0);
            totalEmissiveRadiance += lights * dark * (1.0 - 0.7 * cloud) * 2.2;`,
          );
    };
    m.customProgramCacheKey = () => "earth-surface";
    return m;
  }, [day, uniforms]);

  const clouds = useMemo(
    () =>
      extra &&
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        alphaMap: extra.clouds,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        // Seen from the Moon, Earth is 3 km away and the layers are depth-buffer neighbours: keep the clouds on top.
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    [extra],
  );

  useFrame(({ camera }) => {
    const turn = spin ? live.time * DAY_SPIN : 0;
    const drift = turn + live.time * CLOUD_DRIFT;
    if (ground.current) ground.current.rotation.y = turn;
    if (sky.current) sky.current.rotation.y = drift;
    uniforms.uCloudShift.value = (turn - drift) / (Math.PI * 2);
    uniforms.uSunView.value.copy(sun).transformDirection(camera.matrixWorldInverse);
  });

  return (
    // Earth's axis leans 23.4 degrees.
    <group rotation={[0, 0, TILT]}>
      <group ref={ground}>
        <mesh material={surface}>
          <sphereGeometry args={[radius, 128, 64]} />
        </mesh>
      </group>
      <group ref={sky}>
        {clouds && (
          <mesh material={clouds} scale={1.006}>
            <sphereGeometry args={[radius, 128, 64]} />
          </mesh>
        )}
      </group>
    </group>
  );
}
