import { use } from "react";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

// One promise per model, shared by preloading, rendering and the Director's "is it loaded yet?" check.
const loads = new Map<string, Promise<GLTF>>();
let loader: GLTFLoader | null = null;

function load(url: string) {
  let p = loads.get(url);
  if (!p) {
    // NASA's models are Draco-compressed; the decoder is served from /public so nothing loads from a CDN.
    loader ??= new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/vendor/draco-gltf/"));
    const q = loader.loadAsync(url);
    // React's `use` reads these fields, so a model that has already loaded renders without suspending.
    q.then(
      (value) => Object.assign(q, { status: "fulfilled", value }),
      (reason) => Object.assign(q, { status: "rejected", reason }),
    );
    loads.set(url, (p = q));
  }
  return p;
}

export function useModel(url: string) {
  return use(load(url));
}

export function preloadModel(url: string) {
  load(url);
}

// Loaded (or failed, so the tour never hangs on a broken file).
export function modelSettled(url: string) {
  const s = (loads.get(url) as { status?: string } | undefined)?.status;
  return s === "fulfilled" || s === "rejected";
}
