import * as THREE from "three";
import { DEG, faceLonRotation, skyDir } from "./geo";
import type { Stop } from "../stops";

// The travel scene and a landing site's scene describe the same Moon in two coordinate frames:
//  - travel: the destination globe sits at (0, 0, -LEG) with radius r, turned so the site faces +z;
//  - site:   metres, the landing site at the origin, +x east, +y up, -z north.
// This maps one onto the other, so the trip can hand over from one scene to the other on an identical picture
// and keep flying down to the ground.
export const LEG = 40; // must match plans.ts
export const GLOBE_R = { moon: 0.6, mars: 0.75 } as const; // must match BODY_RADIUS in scene/Space.tsx
export const REAL_R = { moon: 1_737_400, mars: 3_389_500 } as const; // metres

export function siteFrame(stop: Stop) {
  const body = stop.body === "mars" ? "mars" : "moon";
  const r = GLOBE_R[body], R = REAL_R[body], K = R / r;
  const lat = (stop.site?.lat ?? 0) * DEG;
  const center = new THREE.Vector3(0, 0, -LEG);
  const up = new THREE.Vector3(0, Math.sin(lat), Math.cos(lat)); // site normal, travel frame
  const north = new THREE.Vector3(0, Math.cos(lat), -Math.sin(lat));
  const south = north.clone().negate();
  const east = new THREE.Vector3().crossVectors(up, south);
  const site = center.clone().addScaledVector(up, r);
  // Rows: east, up, south -> the site frame's x, y, z.
  const basis = new THREE.Matrix4().makeBasis(east, up, south);
  const rot = basis.clone().transpose(); // travel -> site (rotation only)
  const q = new THREE.Quaternion().setFromRotationMatrix(rot);
  const globeRotY = stop.site ? faceLonRotation(stop.site.lon, 1) : 0;
  return {
    r,
    R,
    K,
    q,
    toSite: (p: THREE.Vector3, out = new THREE.Vector3()) => out.copy(p).sub(site).applyMatrix4(rot).multiplyScalar(K),
    quatToSite: (qt: THREE.Quaternion, out = new THREE.Quaternion()) => out.copy(q).multiply(qt),
    // The globe as placed in the site scene: centre straight below, same turn as in the travel scene.
    globeInSite: {
      position: new THREE.Vector3(0, -R, 0),
      quaternion: q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), globeRotY)),
      scale: K,
    },
    // The site's real sun, expressed in the travel frame, so the globe is lit the same way in both scenes.
    sunTravel: () => skyDir(stop.setting.sun?.az ?? 90, stop.setting.sun?.el ?? 30).applyMatrix4(basis).normalize(),
    sunSite: () => skyDir(stop.setting.sun?.az ?? 90, stop.setting.sun?.el ?? 30),
  };
}
