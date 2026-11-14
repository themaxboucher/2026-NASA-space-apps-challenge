import * as THREE from "three";

// A tiny lighting environment for reflections: sky color above, ground color below, and a bright Sun.
// Without one, NASA's metal and foil materials render nearly black.
export function makeEnvironment(renderer: THREE.WebGLRenderer, sky: string, ground: string, sun: THREE.Vector3, sunPower = 40) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uSky: { value: new THREE.Color(sky) }, uGround: { value: new THREE.Color(ground) } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 uSky; uniform vec3 uGround; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(uGround, uSky, smoothstep(-0.08, 0.12, h)), 1.0); }",
    }),
  );
  scene.add(dome);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.94).multiplyScalar(sunPower) }));
  sunBall.position.copy(sun).normalize().multiplyScalar(8);
  scene.add(sunBall);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  dome.geometry.dispose();
  (dome.material as THREE.Material).dispose();
  sunBall.geometry.dispose();
  (sunBall.material as THREE.Material).dispose();
  return target;
}
