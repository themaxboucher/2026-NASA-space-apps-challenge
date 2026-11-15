import * as THREE from "three";

// How a wheeled rover sits on uneven ground, solved each frame without a physics engine (the way rover
// simulators do it for slow driving): find the ground under every wheel, fit the plane through those contact
// points (a rocker-bogie or sprung suspension averages them out much like this), and let the body follow that
// plane through a spring and damper, so it settles over bumps instead of snapping. Heading turns at a limited
// rate, as a real rover steers.
export class Chassis {
  y = NaN;
  vy = 0;
  tiltX = 0; // slope along the body's local x
  tiltZ = 0; // slope along the body's local z
  yaw = NaN;
  constructor(
    // Wheel contact points in the body's own frame (x, z), in metres.
    private wheels: [number, number][],
    // Spring stiffness and damping of the ride (higher = stiffer); tilt response in 1/s.
    private spring = 60,
    private damp = 14,
    private tiltRate = 10,
  ) {}

  update(ground: (x: number, z: number) => number, x: number, z: number, targetYaw: number, dt: number, turnRate = 1.2) {
    if (Number.isNaN(this.yaw)) this.yaw = targetYaw;
    const d = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), turnRate * dt);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    // Least-squares plane h = a + b*lx + e*lz through the wheel contacts (local coords).
    let n = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, sh = 0, sxh = 0, szh = 0;
    for (const [lx, lz] of this.wheels) {
      const h = ground(x + lx * c + lz * s, z - lx * s + lz * c);
      n++;
      sx += lx;
      sz += lz;
      sxx += lx * lx;
      szz += lz * lz;
      sxz += lx * lz;
      sh += h;
      sxh += lx * h;
      szh += lz * h;
    }
    const m = new THREE.Matrix3().set(n, sx, sz, sx, sxx, sxz, sz, sxz, szz).invert();
    const v = new THREE.Vector3(sh, sxh, szh).applyMatrix3(m);
    const [a, b, e] = [v.x, v.y, v.z];
    if (Number.isNaN(this.y)) this.y = a;
    // Spring-damper on height: bumps make the body rise and settle, not jump.
    this.vy += (this.spring * (a - this.y) - this.damp * this.vy) * dt;
    this.y += this.vy * dt;
    const k = 1 - Math.exp(-dt * this.tiltRate);
    this.tiltX += (Math.atan(b) - this.tiltX) * k;
    this.tiltZ += (Math.atan(e) - this.tiltZ) * k;
  }

  // Place an object: yaw, then tilt to the ground plane (raising +z by tiltZ, +x by tiltX).
  apply(obj: THREE.Object3D, x: number, z: number) {
    obj.position.set(x, this.y, z);
    obj.rotation.set(-this.tiltZ, this.yaw, this.tiltX, "YXZ");
  }
}
