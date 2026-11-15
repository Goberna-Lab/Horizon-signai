// @ts-nocheck — portado de nuestro simulador NASA (astronaut.js, JavaScript); el tipado estricto queda pendiente.
// Solo el astronauta procedural: sin modelos GLB (licencias y peso fuera del repo público).
// Astronauta: marcha de baja gravedad aplicada a un modelo con esqueleto Mixamo
// En Horizon, el astronauta procedural (sin modelo glb).
//
// Cómo camina un traje en la Luna (referencias Apollo / xEMU):
//  - Gravedad 1.62 m/s² (1/6 de la Tierra): cada paso tiene una fase de vuelo
//    más larga, el cuerpo rebota más alto y los pasos son más lentos.
//  - El traje presurizado (~4.3 psi) es rígido: rodillas y codos se doblan poco,
//    los brazos casi no se balancean y el torso se inclina hacia delante para
//    compensar la mochila de soporte vital (PLSS), que desplaza el centro de masa.
//  - A velocidad alta los astronautas pasaban a un "galope" (lope), con ambos
//    pies casi juntos, en lugar de correr como en la Tierra.
//  - Sin atmósfera, el polvo levantado sigue parábolas limpias y cae rápido, sin nubes.
//
// Convención: el personaje mira hacia +z, su izquierda es +x.
// Ángulos negativos alrededor de x = hacia delante.
import * as THREE from 'three';

const G_MOON = 1.62;

/* ------------------------------------------------------------------ */
/* Marcha: calcula los ángulos de cada articulación en cada fotograma  */
/* ------------------------------------------------------------------ */
export class Gait {
  constructor() { this.phase = 0; this.amp = 0; this.t = 0; this.lastSin = 0; }

  /** @returns pose {bounce, pitch, yaw, legs[2]{hip,knee,foot}, arms[2]{shoulder,elbow}, footDown} */
  update(dt, speed) {
    this.t += dt;
    const target = Math.min(speed / 1.4, 1.4);
    this.amp += (target - this.amp) * Math.min(1, dt * 5);
    const amp = Math.min(this.amp, 1); // amplitud articular limitada (el traje no deja doblar más)
    const lope = Math.min(1, Math.max(0, (speed - 2) / 1.5)); // 0 = paso, 1 = galope
    // Frecuencia de zancada más lenta que en la Tierra por la baja gravedad
    if (amp > 0.02) this.phase += dt * Math.PI * 2 * (0.75 + 0.25 * speed);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);

    const pose = {
      // Rebote con fase de vuelo larga (|sin|), mayor en galope; respiración en reposo
      bounce: amp * (0.06 + 0.07 * lope) * Math.abs(s) + 0.006 * Math.sin(this.t * 1.6),
      pitch: amp * (0.1 + 0.08 * lope), // inclinación hacia delante por la PLSS
      yaw: -amp * 0.06 * s * (1 - lope),
      legs: [], arms: [], footDown: -1,
    };
    for (let k = 0; k < 2; k++) {
      const sign = k === 0 ? 1 : -1;
      // Paso: piernas en oposición. Galope: casi juntas (desfase 0.5 rad).
      const legS = lope > 0.5 ? Math.sin(this.phase + k * 0.5) : sign * s;
      const fwd = lope > 0.5 ? Math.cos(this.phase + k * 0.5) : sign * c;
      const hip = -amp * 0.42 * legS;
      const knee = amp * (0.12 + (0.5 - 0.15 * lope) * Math.max(0, fwd)); // rodilla rígida
      pose.legs.push({ hip, knee, foot: -(hip + knee) * 0.6 });
      // Brazos casi quietos y opuestos a la pierna del mismo lado (el traje limita el balanceo)
      pose.arms.push({ shoulder: amp * 0.18 * legS * (1 - lope) - amp * 0.25 * lope, elbow: 0.35 + amp * 0.1 });
    }
    // Pisada: cuando el seno cruza cero, cae un pie
    if (this.amp > 0.2 && Math.sign(s) !== Math.sign(this.lastSin)) pose.footDown = s > 0 ? 0 : 1;
    this.lastSin = s;
    return pose;
  }
}

/* ------------------------------------------------------------------ */
/* Polvo lunar: partículas balísticas sin atmósfera                    */
/* ------------------------------------------------------------------ */
export function createDust(n = 240) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3).fill(-1e5);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb8b4aa, size: 0.035, transparent: true, opacity: 0.85 }));
  points.frustumCulled = false;
  const vel = new Float32Array(n * 3), ground = new Float32Array(n);
  let next = 0;
  return {
    points,
    kick(p, strength) {
      for (let k = 0; k < 14; k++) {
        const i = next; next = (next + 1) % n;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random() * 0.9) * strength;
        vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = (0.4 + Math.random() * 1.2) * strength; vel[i * 3 + 2] = Math.sin(a) * sp;
        ground[i] = p.y - 0.05;
      }
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        if (pos[i * 3 + 1] < -1e4) continue;
        vel[i * 3 + 1] -= G_MOON * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < ground[i]) pos[i * 3 + 1] = -1e5;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Astronauta procedural (respaldo si no hay glb)                      */
/* ------------------------------------------------------------------ */
function mats() {
  return {
    suit: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.85 }),
    joint: new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.6 }),
    visor: new THREE.MeshStandardMaterial({ color: 0xd9a531, metalness: 1, roughness: 0.12 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xd8502f, roughness: 0.6 }),
    light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c0, emissiveIntensity: 2 }),
  };
}

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);
  m.castShadow = true;
  return m;
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

/** Extremidad con dos segmentos. Devuelve {root, mid, end} (pivotes en articulaciones). */
function limb(r1, l1, r2, l2, M, endMesh) {
  const root = new THREE.Group();
  const upper = capsule(r1, l1, M.suit);
  upper.position.y = -l1 / 2 - r1 * 0.5;
  root.add(upper);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r1 * 0.95, r1 * 0.22, 8, 18), M.joint);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -l1 - r1 * 0.6;
  root.add(ring);
  const mid = new THREE.Group();
  mid.position.y = -l1 - r1;
  root.add(mid);
  const lower = capsule(r2, l2, M.suit);
  lower.position.y = -l2 / 2 - r2 * 0.4;
  mid.add(lower);
  const end = new THREE.Group();
  end.position.y = -l2 - r2;
  mid.add(end);
  if (endMesh) end.add(endMesh);
  return { root, mid, end };
}

export function createAstronaut() {
  const M = mats();
  const object = new THREE.Group();
  object.name = 'astronauta';

  const hips = new THREE.Group();
  hips.position.y = 1.0;
  object.add(hips);

  const pelvis = box(0.38, 0.2, 0.26, M.suit);
  hips.add(pelvis);
  const torso = new THREE.Group();
  torso.position.y = 0.08;
  hips.add(torso);
  const chest = capsule(0.25, 0.32, M.suit);
  chest.scale.set(1.1, 1, 0.85);
  chest.position.y = 0.36;
  torso.add(chest);
  const dcm = box(0.26, 0.14, 0.08, M.dark); // módulo de control en el pecho
  dcm.position.set(0, 0.32, 0.24);
  torso.add(dcm);
  const stripe = box(0.5, 0.04, 0.42, M.accent);
  stripe.position.y = 0.06;
  torso.add(stripe);

  const plss = box(0.5, 0.66, 0.26, M.suit); // mochila de soporte vital
  plss.position.set(0, 0.42, -0.3);
  torso.add(plss);
  const plssTop = box(0.44, 0.08, 0.2, M.joint);
  plssTop.position.set(0, 0.78, -0.3);
  torso.add(plssTop);

  const head = new THREE.Group();
  head.position.y = 0.78;
  torso.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), M.suit);
  helmet.castShadow = true;
  head.add(helmet);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.205, 32, 20, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.42), M.visor));
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.light);
    lamp.position.set(0.16 * s, 0.1, 0.1);
    head.add(lamp);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 24), M.joint);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.15;
  head.add(collar);

  // k = 0 izquierda (+x), k = 1 derecha (-x)
  const arms = [1, -1].map((s) => {
    const a = limb(0.085, 0.24, 0.075, 0.22, M, box(0.1, 0.13, 0.08, M.dark));
    a.root.position.set(0.34 * s, 0.56, 0);
    a.root.rotation.z = 0.12 * s;
    torso.add(a.root);
    return a;
  });
  const legs = [1, -1].map((s) => {
    const boot = box(0.15, 0.1, 0.3, M.dark);
    boot.position.z = 0.05;
    const l = limb(0.1, 0.32, 0.088, 0.33, M, boot);
    l.root.position.set(0.13 * s, -0.04, 0);
    hips.add(l.root);
    return l;
  });

  const gait = new Gait();
  const dust = createDust();
  const foot = new THREE.Vector3();
  function update(dt, speed) {
    const p = gait.update(dt, speed);
    hips.position.y = 1.0 + p.bounce;
    torso.rotation.x = p.pitch;
    torso.rotation.y = p.yaw;
    for (let k = 0; k < 2; k++) {
      legs[k].root.rotation.x = p.legs[k].hip;
      legs[k].mid.rotation.x = p.legs[k].knee;
      legs[k].end.rotation.x = p.legs[k].foot;
      arms[k].root.rotation.x = p.arms[k].shoulder;
      arms[k].mid.rotation.x = -p.arms[k].elbow;
    }
    if (p.footDown >= 0) {
      legs[p.footDown].end.getWorldPosition(foot);
      dust.kick(foot, 0.6 + gait.amp);
    }
    dust.update(dt);
  }

  function dispose() {
    object.traverse((o) => { o.geometry?.dispose(); });
    for (const m of Object.values(M)) m.dispose();
    dust.points.geometry.dispose(); dust.points.material.dispose();
  }
  return { object, update, dust: dust.points, height: 1.95, dispose };
}