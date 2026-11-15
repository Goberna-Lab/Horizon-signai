// @ts-nocheck — portado de nuestro simulador NASA (tareas.js, JavaScript); el tipado estricto queda pendiente.
// Mini misiones de la caminata, con objetivos reales de una EVA de Artemis: revisar la nave, instalar un sismómetro lejos
// del módulo, desplegar un panel donde de verdad dé el Sol, muestrear regolito iluminado y en sombra (posible hielo) y
// volver. Las muestras, el sismómetro, el panel y la bandera son objetos de la escena; el HUD señala el objetivo con un
// marcador y en el radar. También deja huellas de bota en el regolito.
import * as THREE from 'three';
import { avisarEva } from '@/shared/eva';
import { tr } from '@/shared/i18n';

const MAX_HUELLAS = 600;
const SEIS_MIN_M = 90; // el polvo del despegue taparía el sismómetro más cerca del módulo
const num = (x, d = 2) => tr(x.toFixed(d), x.toFixed(d).replace('.', ','));

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

/** Bandera de la misión: azul noche con la Luna y el nombre del proyecto (no la de ningún país). */
function texturaBandera() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 200; const g = c.getContext('2d');
  g.fillStyle = '#0d1b3d'; g.fillRect(0, 0, 300, 200);
  g.fillStyle = '#C8102E'; g.fillRect(0, 168, 300, 32);
  g.fillStyle = '#e8e4da'; g.beginPath(); g.arc(150, 80, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0d1b3d'; g.beginPath(); g.arc(170, 66, 40, 0, Math.PI * 2); g.fill(); // creciente
  g.fillStyle = '#ffffff'; g.font = '700 22px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillText('HORIZON', 150, 158);
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
    this.samples = []; this.panel = null; this.seis = null; this.flag = null; this.started = false; this.i = 0; this.done = false;
  }

  /** Borra la caminata anterior (muestras, instrumentos, bandera y huellas) para empezar otra. */
  reset() {
    for (const o of [...this.group.children]) if (o !== this.prints) { this.group.remove(o); o.traverse((x) => { x.geometry?.dispose(); x.material?.map?.dispose(); x.material?.dispose?.(); }); }
    this.samples = []; this.panel = null; this.seis = null; this.flag = null; this.started = false; this.i = 0; this.done = false;
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

  /** Busca alrededor del módulo un punto con la condición pedida, lo más cerca posible dentro del rango. */
  _find(cx, cz, rMin, rMax, want) {
    for (let r = rMin; r <= rMax; r += 12) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + r * 0.013, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (want(x, z)) return new THREE.Vector3(x, this.view.groundY(x, z), z);
    }
    return null;
  }

  _dLM() { const c = this.cam, lm = c.lmPos ?? this.home; return Math.hypot(c.pos.x - lm.x, c.pos.z - lm.z); }

  /** Objetivos de la EVA, como los de una salida real de Artemis: revisar la nave, instalar instrumentos, muestrear y volver. */
  start(lmObj) {
    if (this.started) return; this.started = true;
    const c = this.cam, lmP = c.lmPos ?? c.pos.clone(), cx = lmP.x, cz = lmP.z;
    this.home = c.pos.clone();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1, flatShading: true });
    const rock = (pos, name) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat); m.position.copy(pos); m.position.y += 0.1; m.rotation.set(1.1, pos.x, 0.4); m.scale.set(1.2, 0.8, 1); m.castShadow = true; this.group.add(m); this.samples.push({ name, mesh: m, taken: false }); };
    // Muestra iluminada a 40–90 m y muestra en sombra (posible hielo) a 60–320 m, donde el relieve de verdad tapa el Sol
    rock(this._find(cx, cz, 40, 90, (x, z) => this.lit(x, z)) ?? this._find(cx, cz, 40, 90, () => true), 'sol');
    const dark = this._find(cx, cz, 60, 320, (x, z) => !this.lit(x, z));
    this.darkReal = !!dark; rock(dark ?? this._find(cx, cz, 120, 160, () => true), 'sombra');
    // Sismómetro: a más de 90 m del módulo, en una zona con luz
    this.seisSpot = this._find(cx, cz, 110, 170, (x, z) => this.lit(x, z)) ?? this._find(cx, cz, 110, 170, () => true);
    const pad = lmObj ? lmObj.localToWorld(new THREE.Vector3(0, 0, -4.3)) : null; // pata trasera del módulo
    const lm = () => c.lmPos ?? this.home;
    this.steps = [
      ...(pad ? [{ text: (d) => tr(`Inspect the rear landing leg: check it rests well and is not damaged · ${d} m`, `Revisa la pata trasera del módulo: comprueba que apoya bien y no hay daños · ${d} m`),
        target: () => pad, ok: () => c.pos.distanceTo(pad) < 3.2, msg: tr('Landing legs in good shape: the lander is stable', 'Patas en buen estado: la nave está estable'), kind: 'pata' }] : []),
      { seis: true, text: (d) => (this.seis ? tr('Seismometer deployed', 'Sismómetro instalado') : this._dLM() < SEIS_MIN_M ? tr(`Carry the seismometer more than 90 m from the lander (launch dust would bury it) · ${d} m`, `Lleva el sismómetro a más de 90 m del módulo (el polvo del despegue lo cubriría) · ${d} m`) : tr('This spot works: press B to deploy the seismometer', 'Aquí sirve: pulsa B para instalar el sismómetro')),
        target: () => this.seisSpot, ok: () => !!this.seis, msg: tr('Seismometer deployed and listening', 'Sismómetro instalado y escuchando'), kind: 'seis' },
      { text: () => tr('Deploy the solar panel where the Sun really shines (here the relief may block it) · press B', 'Despliega el panel solar donde dé el Sol de verdad (aquí el relieve puede taparlo) · pulsa B'),
        ok: () => !!this.panel, msg: () => tr(`Panel deployed: ${num(this.panel.userData.kw)} kW for the instruments`, `Panel desplegado: ${num(this.panel.userData.kw)} kW para los instrumentos`), kind: 'panel' },
      { text: (d) => (this._near(0) ? tr('Sunlit sample within reach · press E', 'Muestra iluminada a tu alcance · pulsa E') : tr(`Collect a sample of sunlit regolith · ${d} m`, `Toma una muestra de regolito iluminado · ${d} m`)),
        target: () => this.samples[0].mesh.position, ok: () => this.samples[0].taken, msg: tr('Sunlit sample stowed', 'Muestra iluminada guardada'), kind: 'sampleSol' },
      { text: (d) => (this._near(1) ? (c.lamps || !this.darkReal ? tr('Shadow sample within reach · press E', 'Muestra en sombra a tu alcance · pulsa E') : tr('No sunlight here: turn on the lamps (L) to see the sample', 'Aquí no llega el Sol: enciende las lámparas (L) para ver la muestra')) : tr(`Collect a sample from the shadow, where there may be ice · ${d} m`, `Toma una muestra en la sombra: ahí puede haber hielo · ${d} m`)),
        target: () => this.samples[1].mesh.position, ok: () => this.samples[1].taken, msg: tr('Shadow sample stowed: a candidate for water ice', 'Muestra de la zona en sombra guardada: candidata a contener hielo'), kind: 'sampleSombra' },
      { text: (d) => tr(`Return to the lander with consumables to spare · ${d} m`, `Vuelve al módulo con margen de consumibles · ${d} m`), target: lm, ok: () => this._dLM() < 6, msg: tr('Back at the lander: EVA complete', 'De vuelta en el módulo: EVA completada') },
    ];
  }

  _near(k) { const s = this.samples[k]; return s && !s.taken && this.cam.pos.distanceTo(s.mesh.position) < 2.6; }
  get step() { return this.started && !this.done ? this.steps[this.i] : null; }
  /** Posición del objetivo actual en el mundo (o null si la tarea no tiene lugar). */
  get target() { return this.step?.target?.() ?? null; }
  text() {
    if (!this.started) return null;
    if (this.done) return tr(`EVA complete · ${Math.round(this.cam.walked)} m walked, 2 samples, seismometer and panel running`, `EVA completada · ${Math.round(this.cam.walked)} m recorridos, 2 muestras, sismómetro y panel en marcha`);
    const t = this.target, d = t ? Math.round(this.cam.pos.distanceTo(t)) : 0;
    return `${this.i + 1}/${this.steps.length} · ${this.step.text(d)}`;
  }

  /** Tecla E: recoger la muestra que esté a tu alcance (la de sombra solo se ve con lámparas). */
  interact() {
    const c = this.cam;
    for (let k = 0; k < this.samples.length; k++) if (this._near(k)) {
      if (k === 1 && this.darkReal && !c.lamps) { c.notice = tr('Too dark: turn on the helmet lamps (L)', 'Está demasiado oscuro: enciende las lámparas del casco (L)'); c.sonido?.blip(); return; }
      const s = this.samples[k]; s.taken = true; s.mesh.visible = false; c.sonido?.blip(true);
      if (s.name === 'sombra') avisarEva('muestra-sombra');
      return;
    }
    c.notice = tr('Nothing within reach', 'No hay nada a tu alcance');
  }

  /** Tecla B: instala lo que pida la tarea actual (sismómetro o panel solar). */
  deploy() {
    const st = this.step;
    if (st && st.seis && !this.seis) return this._deploySeis();
    return this._deployPanel();
  }

  _deploySeis() {
    const c = this.cam, v = this.view;
    if (this._dLM() < SEIS_MIN_M) { c.notice = tr('Too close to the lander: launch dust would bury the seismometer. Go beyond 90 m.', 'Demasiado cerca del módulo: el polvo del despegue taparía el sismómetro. Aléjate a más de 90 m.'); c.sonido?.blip(); return; }
    const f = c.forward(), x = c.pos.x + f.x * 1.6, z = c.pos.z + f.z * 1.6, g = new THREE.Group(); g.position.set(x, v.groundY(x, z), z);
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a23a, metalness: 1, roughness: 0.35 }), gray = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.5, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.32, 16), gold); body.position.y = 0.2; body.castShadow = true;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 24), gold); skirt.position.y = 0.02;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), gray); mast.position.y = 0.6;
    g.add(body, skirt, mast); this.group.add(g); this.seis = g; c.sonido?.blip(true);
  }

  /** Panel solar unos metros por delante, de cara al Sol. Solo sirve donde el relieve no tapa el Sol. */
  _deployPanel() {
    const c = this.cam, v = this.view, now = v.now;
    if (this.panel) { c.notice = tr('The panel is already deployed', 'El panel ya está desplegado'); return; }
    const f = c.forward(), x = c.pos.x + f.x * 3.2 - f.z * 1.3, z = c.pos.z + f.z * 3.2 + f.x * 1.3, y = v.groundY(x, z), D = Math.PI / 180;
    if (!now || !this.lit(x, z)) { c.notice = tr('The relief blocks the Sun here: a panel in shadow generates nothing. Find a sunlit spot.', 'Aquí el relieve tapa el Sol: un panel en la sombra no genera nada. Busca una zona iluminada.'); c.sonido?.blip(); return; }
    const g = new THREE.Group(); g.position.set(x, y, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.5 })); leg.position.y = 0.65; leg.castShadow = true;
    const cells = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.03), new THREE.MeshStandardMaterial({ color: 0x0b1530, metalness: 0.4, roughness: 0.35 })); cells.position.y = 1.35; cells.castShadow = true;
    const sun = new THREE.Vector3(Math.cos(now.sun.el * D) * Math.sin(now.sun.az * D), Math.sin(now.sun.el * D), -Math.cos(now.sun.el * D) * Math.cos(now.sun.az * D));
    cells.lookAt(sun.multiplyScalar(10).add(new THREE.Vector3(x, y + 1.35, z))); // de cara al Sol (en el polo: casi vertical)
    g.add(leg, cells); g.userData.kw = 0.3 * now.sun.frac; // panel portátil de ~1,4 m²
    this.group.add(g); this.panel = g; c.sonido?.blip(true);
  }

  /** Tecla F: planta la bandera de la misión un paso por delante (o la mueve si ya está plantada). */
  plantFlag() {
    const c = this.cam, v = this.view;
    if (!this.flag) {
      const flag = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.4 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.2, 8), metal); pole.position.y = 1.1;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 8), metal); bar.rotation.z = Math.PI / 2; bar.position.set(0.47, 2.15, 0); // barra horizontal: sin viento, la tela no ondea
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: texturaBandera(), side: THREE.DoubleSide, roughness: 0.9 })); cloth.position.set(0.47, 1.84, 0);
      for (const o of [pole, bar, cloth]) { o.castShadow = true; flag.add(o); }
      this.flag = flag; this.group.add(flag);
      avisarEva('bandera');
    }
    const f = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading)), p = c.pos.clone().addScaledVector(f, 1.4);
    p.y = v.groundY(p.x, p.z) - 0.15;
    this.flag.position.copy(p); this.flag.rotation.y = c.heading + Math.PI / 2;
    c.notice = tr('Flag planted', 'Bandera plantada');
  }

  update() {
    const s = this.step; if (!s || !s.ok()) return;
    const c = this.cam, link = !!this.view.now?.earth.visible, msg = typeof s.msg === 'function' ? s.msg() : s.msg;
    c.notice = link ? tr(`Houston: ${msg}. Copy.`, `Houston: ${msg}. Te copiamos.`) : tr(`${msg} (no link: logged in the suit)`, `${msg} (sin enlace: queda grabado en el traje)`);
    c.sonido?.blip(true); if (!link) c.sonido?.staticNoise(0.3);
    this.i++; if (this.i >= this.steps.length) this.done = true;
    avisarEva('tarea-hecha');
  }

  dispose() { this.reset(); this.prints.geometry.dispose(); this.prints.material.map?.dispose(); this.prints.material.dispose(); this.group.removeFromParent(); }
}
