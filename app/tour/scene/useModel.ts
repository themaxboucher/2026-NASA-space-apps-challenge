import { useLoader } from "@react-three/fiber";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// NASA's models are Draco-compressed; the decoder is served from /public so nothing loads from a CDN.
let draco: DRACOLoader | null = null;
function extend(loader: GLTFLoader) {
  if (!draco) draco = new DRACOLoader().setDecoderPath("/vendor/draco-gltf/");
  loader.setDRACOLoader(draco);
}

export function useModel(url: string) {
  return useLoader(GLTFLoader, url, extend);
}

export function preloadModel(url: string) {
  useLoader.preload(GLTFLoader, url, extend);
}
