// @ts-nocheck — partículas suaves (polvo y escape), portadas de nuestro simulador.
import * as THREE from 'three';

/* ---------------- Partículas suaves ---------------- */
export class SoftParticles {
  constructor(n, { color = 0xffffff, opacity = 0.1, additive = false } = {}) {
    this.n = n; this.next = 0;
    this.pos = new Float32Array(n * 3).fill(1e6);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e3);
    this.life = new Float32Array(n).fill(1);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.aAlpha = new Float32Array(n); this.aSize = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uScale: { value: 600 } },
      vertexShader: `attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = min(900.0, aSize * uScale / max(0.1, -mv.z)); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a;
          gl_FragColor = vec4(uColor, a * vA * uOpacity); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.g = g;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
  }

  /** gravity en m/s² (hacia abajo); floor(x,z) opcional para que el polvo no atraviese el suelo. */
  update(dt, camera, viewportH, gravity = 0, floor = null) {
    const { pos, vel, age, life, n } = this;
    for (let i = 0; i < n; i++) {
      if (age[i] >= life[i]) { this.aAlpha[i] = 0; continue; }
      age[i] += dt;
      vel[i * 3 + 1] -= gravity * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (floor) { const gy = floor(pos[i * 3], pos[i * 3 + 2]) + 0.05; if (pos[i * 3 + 1] < gy) { pos[i * 3 + 1] = gy; vel[i * 3 + 1] = 0; } }
      const k = age[i] / life[i];
      this.aAlpha[i] = Math.min(1, k * 8) * (1 - k) * (1 - k);
      this.aSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
    }
    this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const a of ['position', 'aAlpha', 'aSize']) this.g.attributes[a].needsUpdate = true;
  }

  clear() { this.age.fill(1e3); }
}
