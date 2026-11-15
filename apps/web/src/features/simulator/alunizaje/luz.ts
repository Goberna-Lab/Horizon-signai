// @ts-nocheck — escena three.js imperativa, como world.ts.
// Luz del polo sur: el Sol va rasante (en el sitio por defecto, menos de 2° sobre el horizonte) y sin atmósfera no hay
// luz difusa: lo que no ve el Sol queda casi negro. El mapa de sombras de three.js solo cubre unos metros alrededor de
// la nave, así que las sombras del relieve se precalculan: para cada punto, ¿algún relieve entre él y el Sol tapa el
// disco? (recorriendo el terreno hacia el Sol, con la curvatura de la Luna ya en groundY).
// El resultado se pinta como color de vértice de las mallas del terreno: 1 al Sol, ~0,05 en sombra (el rebote del
// regolito y, si se ve, la Tierra).
import * as THREE from 'three';

const SOMBRA = 0.05;

/** ¿Ve el Sol el punto (x, z)? 0 en sombra, 1 al Sol, con borde suave de medio disco solar. */
export function verSol(groundY, sd, x, z, alcance = 6000, paso0 = 4) {
  const el = Math.asin(Math.max(-1, Math.min(1, sd.y)));
  if (el < -0.01) return 0;
  const hx = sd.x / Math.hypot(sd.x, sd.z), hz = sd.z / Math.hypot(sd.x, sd.z), tan = Math.tan(el);
  const y0 = groundY(x, z) + 0.3;
  let peor = Infinity; // margen angular (rad) del rayo sobre el relieve
  for (let t = paso0, p = paso0; t < alcance; t += p, p = Math.min(80, p * 1.08)) {
    const m = (y0 + t * tan - groundY(x + hx * t, z + hz * t)) / t;
    if (m < peor) peor = m;
    if (peor < -0.006) return 0;
  }
  return Math.max(0, Math.min(1, 0.5 + peor / 0.0094)); // 0,0094 rad: el diámetro aparente del Sol
}

/** Rejilla de luz (x, z en m, lado 2·half, paso en m) para muestrearla con interpolación bilineal. */
export function rejillaDeLuz(groundY, sd, half, paso, alcance) {
  const n = Math.round((2 * half) / paso) + 1, v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = verSol(groundY, sd, -half + i * paso, -half + j * paso, alcance, paso * 0.5);
  return (x, z) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + half) / paso)), fz = Math.min(n - 1.001, Math.max(0, (z + half) / paso));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, o = iz * n + ix;
    return (v[o] * (1 - tx) + v[o + 1] * tx) * (1 - tz) + (v[o + n] * (1 - tx) + v[o + n + 1] * tx) * tz;
  };
}

/** Pinta la luz en los vértices de una malla de terreno (su material pasa a usar color de vértice). */
export function pintarLuz(mesh, luz) {
  const g = mesh.geometry, p = g.attributes.position, c = new Float32Array(p.count * 3);
  mesh.updateMatrixWorld();
  const w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    w.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mesh.matrixWorld);
    const k = SOMBRA + (1 - SOMBRA) * luz(w.x, w.z);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  mesh.material.vertexColors = true; mesh.material.needsUpdate = true;
}
