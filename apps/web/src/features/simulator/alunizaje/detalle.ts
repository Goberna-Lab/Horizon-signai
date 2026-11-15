// @ts-nocheck — portado de nuestro simulador NASA (fx.js, JavaScript); el tipado estricto queda pendiente.
// El suelo de cerca del sitio: relieve fino procedural, cráteres pequeños (90, de 0,8 a ~14 m de radio, muchos chicos y
// pocos grandes) y rocas (520, ley de potencias). El relieve fino NO es dato real: LOLA llega a 10 m por punto en este
// sitio; lo de menor escala se genera, determinista por sitio. Los cráteres los usa la caminata (alarma al cruzarlos) y
// las rocas, la simulación del contacto (aterrizaje.ts).
import * as THREE from 'three';

/* ---------------- Detalle del suelo ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi, s) * (1 - u) + hash(xi + 1, yi, s) * u) * (1 - v) + (hash(xi, yi + 1, s) * (1 - u) + hash(xi + 1, yi + 1, s) * u) * v;
}

export const DETAIL_HALF = 125; // el parche mide 250 × 250 m

/** Devuelve { height(x,z), craters } para un sitio (determinista por semilla). */
export function makeDetail(seedStr) {
  let seed = 7; for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const r = rng(seed);
  const craters = [];
  for (let i = 0; i < 90; i++) {
    const rad = 0.8 + Math.pow(r(), 2.6) * 13; // muchos pequeños, pocos grandes
    const x = (r() * 2 - 1) * (DETAIL_HALF - 25), z = (r() * 2 - 1) * (DETAIL_HALF - 25);
    craters.push({ x, z, rad, depth: rad * (0.12 + r() * 0.08) });
  }
  const s = seed % 97;
  const height = (x, z) => {
    const edge = Math.min(1, (DETAIL_HALF - Math.max(Math.abs(x), Math.abs(z))) / 22);
    if (edge <= 0) return 0;
    let h = (vnoise(x * 0.045, z * 0.045, s) - 0.5) * 1.1 + (vnoise(x * 0.16, z * 0.16, s + 1) - 0.5) * 0.36 + (vnoise(x * 0.6, z * 0.6, s + 2) - 0.5) * 0.09;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.rad;
      if (d < 1) h -= c.depth * (1 - d * d) * (1 - d * d) * 1.6;        // cuenco
      if (d > 0.75 && d < 1.7) { const t = (d - 1.05) / 0.38; h += c.depth * 0.32 * Math.exp(-t * t); } // borde levantado
    }
    // Sin zona aplanada: la nave se posa sobre el terreno tal cual (+4 cm para quedar sobre la malla gruesa)
    const e = edge * edge * (3 - 2 * edge);
    return (h + 0.04) * e;
  };
  return { height, craters, seed };
}

/** Malla de detalle (0,625 m por vértice) y rocas instanciadas. base(x,z) = altura LOLA interpolada. */
export function buildDetail(detail, base, material) {
  const N = 401, size = DETAIL_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, base(x, z) + detail.height(x, z)); }
  geo.computeVertexNormals();
  const mat = material.clone();
  mat.map = material.map.clone(); mat.map.repeat.set(size / 8, size / 8); mat.map.needsUpdate = true;
  mat.bumpMap = mat.map;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.castShadow = false; // recibe sombras de rocas, nave y astronauta; no proyecta

  // Rocas: icosaedros deformados, tamaños en ley de potencias (muchas piedras, pocos bloques)
  const r = rng(detail.seed + 99);
  const rg = new THREE.IcosahedronGeometry(1, 1);
  const rp = rg.attributes.position;
  const seen = new Map();
  for (let i = 0; i < rp.count; i++) { // misma deformación para vértices duplicados
    const key = `${rp.getX(i).toFixed(3)},${rp.getY(i).toFixed(3)},${rp.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.72 + r() * 0.5);
    const k = seen.get(key); rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * 0.75, rp.getZ(i) * k);
  }
  rg.computeVertexNormals();
  const COUNT = 520;
  const rocks = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0x8f8d88, roughness: 1, flatShading: true }), COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  detail.rocks = []; // dónde está cada roca y su radio (m): lo usa la simulación del aterrizaje
  for (let i = 0; i < COUNT; i++) {
    let x, z;
    x = (r() * 2 - 1) * (DETAIL_HALF - 12); z = (r() * 2 - 1) * (DETAIL_HALF - 12);
    const sc = 0.08 + Math.pow(r(), 5) * 1.5 + (Math.hypot(x, z) < 40 ? r() * 0.12 : 0);
    e.set(r() * 6.28, r() * 6.28, r() * 6.28); q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, base(x, z) + detail.height(x, z) + sc * 0.25, z), q, new THREE.Vector3(sc, sc, sc));
    rocks.setMatrixAt(i, m); detail.rocks.push({ x, z, r: sc });
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  rocks.instanceMatrix.needsUpdate = true;
  const group = new THREE.Group();
  group.add(mesh, rocks);
  return group;
}

/** Libera la malla de detalle y las rocas. */
export function disposeDetail(group) {
  group.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
}

