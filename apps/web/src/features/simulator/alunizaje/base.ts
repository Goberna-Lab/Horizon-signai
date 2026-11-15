// @ts-nocheck — escena three.js imperativa, como world.ts y landing.ts.
// Base Artemis: un destino para la caminata, a unos 230 m del punto de alunizaje y en el terreno menos inclinado de
// alrededor. Hábitats de demostración y el robot RASSOR de la NASA, y módulos, plataforma de aterrizaje, depósito,
// paneles, antena y rovers (CC0; un rover CC-BY 3.0). Modelos y créditos: public/simulador/modelos/ (CREDITOS.md).
// Cada modelo se escala a su tamaño real aproximado (la medida más larga, en m) y se apoya en el suelo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const DIR = '/simulador/modelos/';
const DIST_M = 230;
// [archivo, x (m, este), z (m, sur), giro (°), tamaño (m)] respecto del centro de la base
const PIEZAS = [
  ['nasa-habitat-demonstration-unit-part-1', 0, 0, 0, 9],
  ['nasa-habitat-demonstration-unit-part-2', 12, 2, 20, 9],
  ['poly-UyH95ZAeJ2', -15, -6, 90, 14], // Base Large
  ['poly-5TxCebwK2h', -4, 17, 0, 16], // Space Base Modules
  ['poly-cRtW9KaGs0', 18, -12, 35, 7], // Cargo Depot
  ['poly-yxbeci4pxl', -23, 14, 0, 9], // Space Platform
  ['poly-QpDGgpHcH2', 42, 10, 0, 28], // Landing Pad
  ['poly-TgOY580aMy', 42, 10, 15, 10], // Space Lander Base, sobre la plataforma
  ['poly-TVASj3JcDO', -38, -14, 40, 7], // Lander A
  ['poly-snXloZEimW', 6, -23, 0, 5], // Solar Panel Structure
  ['poly-snXloZEimW', 13, -25, 0, 5],
  ['poly-bvw2d4XUKR', -1, -27, 0, 5], // Flat Solar Panel
  ['poly-OuHQCigiUR', -11, -21, 0, 7], // Antenna
  ['nasa-regolith-advanced-surface-systems-operations-robot-rassor', 8, 15, -30, 2.5],
  ['poly-WRd1piJOfh', 25, 6, 60, 4], // Rover
  ['poly-ejdkcNgMpr', -2, 27, 200, 3], // Round Rover
  ['poly-dhLVA8z7cGo', 29, -4, 110, 4], // Space rover (CC-BY 3.0)
];

/** Elige dónde va la base: a DIST_M del sitio, en la dirección con menos pendiente. */
function lugar(groundY) {
  let best = null;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, x = Math.sin(a) * DIST_M, z = -Math.cos(a) * DIST_M, d = 30;
    const g = Math.hypot(groundY(x + d, z) - groundY(x - d, z), groundY(x, z + d) - groundY(x, z - d)) / (2 * d);
    if (!best || g < best.g) best = { x, z, g };
  }
  return new THREE.Vector3(best.x, groundY(best.x, best.z), best.z);
}

/** Monta la base en la escena (los modelos llegan en segundo plano). Devuelve { centro, dispose }. */
export function crearBase(scene, groundY) {
  const centro = lugar(groundY), grupo = new THREE.Group(); grupo.name = 'base-artemis'; scene.add(grupo);
  const loader = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
  let vivo = true;
  const cache = new Map();
  for (const [archivo, dx, dz, giro, tam] of PIEZAS) {
    if (!cache.has(archivo)) cache.set(archivo, loader.loadAsync(DIR + archivo + '.glb'));
    void cache.get(archivo).then((gltf) => {
      if (!vivo) return;
      const o = gltf.scene.clone(true);
      const caja = new THREE.Box3().setFromObject(o), med = caja.getSize(new THREE.Vector3());
      const k = tam / Math.max(med.x, med.y, med.z, 1e-3);
      o.scale.setScalar(k);
      const x = centro.x + dx, z = centro.z + dz;
      o.position.set(x - (caja.min.x + med.x / 2) * k, groundY(x, z) - caja.min.y * k - 0.05, z - (caja.min.z + med.z / 2) * k);
      o.rotation.y = (giro * Math.PI) / 180;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      grupo.add(o);
    }).catch(() => { /* sin ese modelo, la base sigue con los demás */ });
  }
  return {
    centro,
    dispose() {
      vivo = false; grupo.removeFromParent(); draco.dispose();
      grupo.traverse((m) => { m.geometry?.dispose(); for (const mt of [].concat(m.material ?? [])) { for (const t of Object.values(mt)) if (t?.isTexture) t.dispose(); mt.dispose(); } });
    },
  };
}
