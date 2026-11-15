// @ts-nocheck — escena three.js imperativa, como caminata.ts.
// La caminata planificada (misión CR-02 del Planificador, «Science walk to the Shackleton rim · 2 stops»): la ruta
// científica del paso «Walk» de prototipos/lunar-map (terrain.js, ROUTES.science; mapa local de 4,7 m por píxel con el
// módulo en (430, 640) y el norte hacia arriba) con sus dos paradas y el regreso obligatorio en la parada 2
// (campaign.js: «Scientific route, with mandatory return at stop 2»).
//   1 · Lit rim: muestra de regolito iluminado.   2 · Permanent shadow: muestra en sombra, posible hielo (con lámparas).
//   Después, de vuelta al módulo por la ruta.
// Nada más: la simulación reproduce lo planificado. El relieve del Planificador es conceptual y el de aquí es LOLA real,
// así que cada muestra se pone en el punto con Sol (o en sombra) de verdad más cercano a su parada planificada.
// La ruta se ve en el suelo; el HUD señala la parada siguiente y avisa si te sales de la ruta.
import * as THREE from 'three';
import { avisarEva } from '@/shared/eva';
import { tr } from '@/shared/i18n';

const MAX_HUELLAS = 600;
const M_POR_PX = 4.7, MODULO_PX = { x: 430, y: 640 };
const RUTA_CIENTIFICA = 'M430 640 C 470 590, 510 540, 560 520 S 760 570, 860 600 S 885 520, 893 470 S 905 390, 1000 300';
const PARADAS_PX = [{ x: 560, y: 520 }, { x: 860, y: 600 }];
const FUERA_DE_RUTA_M = 40;

/** Muestrea un path SVG (M, L, C, S absolutos), como samplePath de prototipos/lunar-map/terrain.js. */
function muestrearRuta(d, n) {
  const tok = d.match(/[MLCS]|-?[\d.]+/g) || [];
  let i = 0, cur = null, last2 = null;
  const segs = [], num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { cur = { x: num(), y: num() }; last2 = null; }
    else if (c === 'L') { const p = { x: num(), y: num() }; segs.push([cur, cur, p, p]); cur = p; last2 = null; }
    else if (c === 'C') { const a = { x: num(), y: num() }, b = { x: num(), y: num() }, q = { x: num(), y: num() }; segs.push([cur, a, b, q]); last2 = b; cur = q; }
    else if (c === 'S') { const b = { x: num(), y: num() }, q = { x: num(), y: num() }, a = last2 ? { x: 2 * cur.x - last2.x, y: 2 * cur.y - last2.y } : cur; segs.push([cur, a, b, q]); last2 = b; cur = q; }
  }
  const pts = [];
  for (const sg of segs) for (let k = 0; k < n; k++) {
    const t = k / n, u = 1 - t;
    pts.push({ x: u * u * u * sg[0].x + 3 * u * u * t * sg[1].x + 3 * u * t * t * sg[2].x + t * t * t * sg[3].x, y: u * u * u * sg[0].y + 3 * u * u * t * sg[1].y + 3 * u * t * t * sg[2].y + t * t * t * sg[3].y });
  }
  if (cur) pts.push(cur);
  return pts;
}
/** Del mapa local del Planificador a la escena (m): x hacia el este, z hacia el sur, el módulo en el origen. */
const aEscena = (p, o) => ({ x: o.x + (p.x - MODULO_PX.x) * M_POR_PX, z: o.z + (p.y - MODULO_PX.y) * M_POR_PX });

function texturaHuella() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.62)'; g.beginPath(); g.ellipse(32, 64, 24, 58, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.55)';
  for (let y = 14; y < 118; y += 13) g.fillRect(8, y, 48, 5); // costillas de la suela de la bota lunar
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(150,146,138,.5)';
  for (let y = 14; y < 118; y += 13) g.fillRect(10, y, 44, 4);
  g.strokeStyle = 'rgba(150,146,138,.45)'; g.lineWidth = 3; g.beginPath(); g.ellipse(32, 64, 26, 60, 0, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Tareas {
  /** `cam`: la caminata (posición, rumbo, mirada, lámparas, avisos y sonido). */
  constructor(cam) {
    this.cam = cam; this.view = cam.view;
    this.group = new THREE.Group(); this.group.name = 'tareas'; this.view.scene.add(this.group);
    const geo = new THREE.PlaneGeometry(0.15, 0.33).rotateX(-Math.PI / 2);
    this.prints = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: texturaHuella(), roughness: 1, metalness: 0, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), MAX_HUELLAS);
    this.prints.count = 0; this.prints.frustumCulled = false; this.prints.renderOrder = 2; this.group.add(this.prints);
    this.o = new THREE.Object3D(); this.side = 1; this.nPrint = 0;
    this.samples = []; this.started = false; this.i = 0; this.done = false; this.ruta = [];
  }

  /** Borra la caminata anterior (ruta, muestras y huellas) para empezar otra. */
  reset() {
    for (const o of [...this.group.children]) if (o !== this.prints) { this.group.remove(o); o.traverse((x) => { x.geometry?.dispose(); x.material?.map?.dispose(); x.material?.dispose?.(); }); }
    this.samples = []; this.started = false; this.i = 0; this.done = false; this.ruta = [];
    this.nPrint = 0; this.prints.count = 0;
  }

  /** Una huella por apoyo del pie, alternando izquierda y derecha. */
  print() {
    const v = this.view, c = this.cam, h = c.heading, o = this.o;
    this.side = -this.side;
    const x = c.pos.x + Math.cos(h) * 0.13 * this.side, z = c.pos.z - Math.sin(h) * 0.13 * this.side;
    o.position.set(x, v.groundY(x, z) + 0.012, z); o.rotation.set(0, h + 0.12 * this.side, 0); o.updateMatrix();
    this.prints.setMatrixAt(this.nPrint % MAX_HUELLAS, o.matrix); this.nPrint++;
    this.prints.count = Math.min(this.nPrint, MAX_HUELLAS); this.prints.instanceMatrix.needsUpdate = true;
  }

  /** ¿Le da el Sol a este punto? Recorre el terreno hacia el Sol y mira si algún relieve tapa el disco (a la altura del pecho). */
  lit(x, z) {
    const v = this.view, n = v.now; if (!n || n.sun.frac < 0.05) return false;
    const D = Math.PI / 180, sx = Math.sin(n.sun.az * D), sz = -Math.cos(n.sun.az * D), tan = Math.tan(Math.max(0, n.sun.el) * D), y0 = v.groundY(x, z) + 1.2;
    for (let t = 6; t < 4000; t += t < 200 ? 6 : 25) if (v.groundY(x + sx * t, z + sz * t) > y0 + t * tan) return false;
    return true;
  }

  /** El punto más cercano a (cx, cz), hasta rMax, que cumple la condición (anillos de 10 m). */
  _cerca(cx, cz, rMax, want) {
    if (want(cx, cz)) return { x: cx, z: cz };
    for (let r = 10; r <= rMax; r += 10) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (want(x, z)) return { x, z };
    }
    return null;
  }

  _dLM() { const c = this.cam, lm = c.lmPos ?? this.home; return Math.hypot(c.pos.x - lm.x, c.pos.z - lm.z); }

  /** La ruta planificada desde el módulo, las dos paradas con sus muestras y los pasos de la EVA. */
  start() {
    if (this.started) return; this.started = true;
    const c = this.cam, v = this.view, o = c.lmPos ?? c.pos.clone();
    this.home = o.clone();
    // Ruta: del módulo a la parada 2 (ahí el regreso es obligatorio)
    const px = muestrearRuta(RUTA_CIENTIFICA, 24);
    let fin = 0, best = 1e9;
    px.forEach((p, k) => { const d = Math.hypot(p.x - PARADAS_PX[1].x, p.y - PARADAS_PX[1].y); if (d < best) { best = d; fin = k; } });
    this.ruta = px.slice(0, fin + 1).map((p) => aEscena(p, o));
    const linea = this.ruta.map((p) => new THREE.Vector3(p.x, v.groundY(p.x, p.z) + 0.15, p.z));
    const trazo = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linea), new THREE.LineDashedMaterial({ color: 0x9fe4f2, dashSize: 2.5, gapSize: 2, transparent: true, opacity: 0.85, depthWrite: false }));
    trazo.computeLineDistances(); trazo.renderOrder = 3; this.group.add(trazo);
    // Muestras en sus paradas, en el Sol (1) y en la sombra (2) de verdad más cercanos
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1, flatShading: true });
    const anillo = new THREE.MeshBasicMaterial({ color: 0x9fe4f2, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const parada = (pPx, name, want) => {
      const plan = aEscena(pPx, o), sitio = this._cerca(plan.x, plan.z, 150, want);
      const p = sitio ?? plan, y = v.groundY(p.x, p.z);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat); m.position.set(p.x, y + 0.1, p.z); m.rotation.set(1.1, p.x, 0.4); m.scale.set(1.2, 0.8, 1); m.castShadow = true;
      const r = new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 40).rotateX(-Math.PI / 2), anillo); r.position.set(p.x, y + 0.08, p.z);
      this.group.add(m, r); this.samples.push({ name, mesh: m, taken: false, real: !!sitio });
    };
    parada(PARADAS_PX[0], 'sol', (x, z) => this.lit(x, z));
    parada(PARADAS_PX[1], 'sombra', (x, z) => !this.lit(x, z));
    this.darkReal = this.samples[1].real;
    const dist = (t) => Math.round(this.cam.pos.distanceTo(t));
    this.steps = [
      { text: () => (this._near(0) ? tr('Stop 1 · Lit rim: sample within reach · press E', 'Parada 1 · Borde iluminado: muestra a tu alcance · pulsa E') : tr(`Follow the scientific route to stop 1 · Lit rim · ${dist(this.samples[0].mesh.position)} m`, `Sigue la ruta científica hasta la parada 1 · Borde iluminado · ${dist(this.samples[0].mesh.position)} m`)),
        target: () => this.samples[0].mesh.position, ok: () => this.samples[0].taken, msg: tr('Stop 1: sunlit sample stowed', 'Parada 1: muestra iluminada guardada'), kind: 'sampleSol' },
      { text: () => (this._near(1) ? (c.lamps || !this.darkReal ? tr('Stop 2 · Permanent shadow: sample within reach · press E', 'Parada 2 · Sombra permanente: muestra a tu alcance · pulsa E') : tr('No sunlight here: turn on the lamps (L) to see the sample', 'Aquí no llega el Sol: enciende las lámparas (L) para ver la muestra')) : tr(`Continue to stop 2 · Permanent shadow (possible ice) · ${dist(this.samples[1].mesh.position)} m`, `Sigue hasta la parada 2 · Sombra permanente (posible hielo) · ${dist(this.samples[1].mesh.position)} m`)),
        target: () => this.samples[1].mesh.position, ok: () => this.samples[1].taken, msg: tr('Stop 2: shadow sample stowed, a candidate for water ice', 'Parada 2: muestra en sombra guardada, candidata a contener hielo'), kind: 'sampleSombra' },
      { text: () => tr(`Mandatory return at stop 2: back to the lander along the route · ${Math.round(this._dLM())} m`, `Regreso obligatorio en la parada 2: vuelve al módulo por la ruta · ${Math.round(this._dLM())} m`),
        target: () => this.cam.lmPos ?? this.home, ok: () => this._dLM() < 6, msg: tr('Back at the lander: walk complete as planned', 'De vuelta en el módulo: caminata completada como se planificó') },
    ];
  }

  /** Distancia (m) de la posición a la ruta planificada. */
  fueraDeRuta() {
    if (!this.ruta.length) return 0;
    const c = this.cam.pos; let best = 1e9;
    for (let k = 1; k < this.ruta.length; k++) {
      const a = this.ruta[k - 1], b = this.ruta[k], dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / L));
      best = Math.min(best, Math.hypot(c.x - (a.x + t * dx), c.z - (a.z + t * dz)));
    }
    return best;
  }
  get lejosDeRuta() { return this.started && !this.done && this.fueraDeRuta() > FUERA_DE_RUTA_M; }

  _near(k) { const s = this.samples[k]; return s && !s.taken && this.cam.pos.distanceTo(s.mesh.position) < 2.6; }
  get step() { return this.started && !this.done ? this.steps[this.i] : null; }
  /** Posición del objetivo actual en el mundo (o null si la tarea no tiene lugar). */
  get target() { return this.step?.target?.() ?? null; }
  text() {
    if (!this.started) return null;
    if (this.done) return tr(`Walk complete · ${Math.round(this.cam.walked)} m walked, 2 samples`, `Caminata completada · ${Math.round(this.cam.walked)} m recorridos, 2 muestras`);
    return `${this.i + 1}/${this.steps.length} · ${this.step.text()}`;
  }

  /** Tecla E: recoger la muestra que esté a tu alcance (la de sombra solo se ve con lámparas). */
  interact() {
    const c = this.cam;
    for (let k = 0; k < this.samples.length; k++) if (this._near(k)) {
      if (k === 1 && this.darkReal && !c.lamps) { c.notice = tr('Too dark: turn on the helmet lamps (L)', 'Está demasiado oscuro: enciende las lámparas del casco (L)'); c.sonido?.blip(); return; }
      const s = this.samples[k]; s.taken = true; s.mesh.visible = false; c.sonido?.blip(true);
      return;
    }
    c.notice = tr('Nothing within reach', 'No hay nada a tu alcance');
  }

  update() {
    const s = this.step; if (!s || !s.ok()) return;
    const c = this.cam, link = !!this.view.now?.earth.visible, msg = s.msg;
    c.notice = link ? tr(`Houston: ${msg}. Copy.`, `Houston: ${msg}. Te copiamos.`) : tr(`${msg} (no link: logged in the suit)`, `${msg} (sin enlace: queda grabado en el traje)`);
    c.sonido?.blip(true); if (!link) c.sonido?.staticNoise(0.3);
    this.i++; if (this.i >= this.steps.length) this.done = true;
    // EVA comenta lo que acaba de hacer (eventos de guion.ts)
    const evento = { sampleSol: 'muestra-sol', sampleSombra: 'muestra-sombra' }[s.kind];
    avisarEva(this.done ? 'eva-completa' : evento ?? 'tarea-hecha', undefined, '.sim-vh-rim text.obj'); // apunta al objetivo nuevo
  }

  dispose() { this.reset(); this.prints.geometry.dispose(); this.prints.material.map?.dispose(); this.prints.material.dispose(); this.group.removeFromParent(); }
}
