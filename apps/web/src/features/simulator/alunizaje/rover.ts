// @ts-nocheck — escena three.js imperativa, como caminata.ts.
// Misión con rover: después del alunizaje se despliega un rover que recorre la ruta del plan (de ida, sin volver) y mide en
// cada parada. Lo que es del plan: la ruta (tareas.ts, las del Planificador), la velocidad máxima y las horas por parada
// (`?vel=` y `?parada=`, las pone quien planifica; referencia: VIPER de NASA, hasta 0,8 km/h). Lo que es del lugar y la
// fecha: la luz, las sombras y si la Tierra está sobre el horizonte (motor del Planificador). Un rover lunar se conduce
// desde la Tierra: sin enlace directo, se detiene. El tiempo se puede acelerar (T), porque a 0,8 km/h un kilómetro son 75 min.
//
// Modelo: el Perseverance de NASA/JPL (Mars 2020), de NASA 3D Resources (github.com/nasa/NASA-3D-Resources, libre según
// las normas de uso de imágenes y medios de NASA), elegido por el equipo como rover de ejemplo. Es un rover de MARTE: se
// muestra a su tamaño real (3 m de largo) y la cámara va donde están sus NavCams, en el mástil. Si no carga, queda el de
// respaldo hecho aquí, inspirado en VIPER (1,5 × 1,5 × 2,5 m, paneles verticales en tres lados, NavCam a 2,0 m).
// Se maneja desde la cámara de navegación del mástil (NAVCAM), como lo haría el equipo en la Tierra; C cambia a la de
// seguimiento. Para que la misión se entienda sola: un briefing al empezar, el objetivo marcado en la imagen (o una flecha
// en el borde si está fuera de cuadro), un minimapa con la ruta y un aviso grande cuando se puede medir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import perseveranceUrl from './data/perseverance.glb?url';
import { avisarEva } from '@/shared/eva';
import { tr } from '@/shared/i18n';
import { Tareas } from './tareas';
import { datosRover, mostrarInforme } from './informe';

const ESCALAS = [1, 10, 60, 240];
const PENDIENTE_AVISO = 15, PENDIENTE_TOPE = 25; // 15°: límite del Planificador; más de 25°, las ruedas patinan y no sube
const NAVCAM_M = 2.0; // altura del cardán de las cámaras de navegación de VIPER (NASA)
const fmt = (n, d = 0) => Number(n).toLocaleString(tr('en-US', 'es-ES'), { minimumFractionDigits: d, maximumFractionDigits: d });
const hm = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; };
const enCampo = (e) => !!e.target?.closest?.('input,select,textarea,button,[contenteditable="true"]');
const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Rover de ejemplo inspirado en VIPER: +z es el frente, el origen está en el suelo bajo el centro. */
function modeloRover() {
  const g = new THREE.Group();
  const M = (o) => new THREE.MeshStandardMaterial(o);
  const gris = M({ color: 0xb9bcc1, metalness: 0.55, roughness: 0.45 }), blanco = M({ color: 0xe6e4df, metalness: 0.2, roughness: 0.55 });
  const azul = M({ color: 0x2c55a8, metalness: 0.3, roughness: 0.5 }), negro = M({ color: 0x1a1b1e, metalness: 0.4, roughness: 0.7 });
  const celdas = M({ color: 0x0f1d40, metalness: 0.75, roughness: 0.22 }), oro = M({ color: 0xc9a23a, metalness: 0.9, roughness: 0.35 });
  const caja = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  // Chasis: caja central gris con faldones azules, plataforma superior blanca (radiador)
  caja(1.2, 0.55, 1.3, gris, 0, 0.78, 0);
  caja(1.24, 0.18, 1.34, azul, 0, 0.56, 0);
  caja(1.1, 0.06, 1.2, blanco, 0, 1.08, 0);
  caja(0.5, 0.12, 0.4, oro, 0, 1.16, -0.35); // manta térmica de la electrónica
  // Paneles solares verticales en los dos costados y atrás
  for (const s of [-1, 1]) { caja(0.04, 0.85, 1.25, celdas, s * 0.66, 0.95, 0); caja(0.05, 0.9, 1.3, gris, s * 0.645, 0.95, 0).scale.set(0.4, 1, 1); }
  caja(1.25, 0.85, 0.04, celdas, 0, 0.95, -0.7);
  // Mástil con el cardán de las cámaras de navegación (2,0 m) y luces; antena de alta ganancia (2,3 m)
  const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.0, 10), blanco); mastil.position.set(0, 1.55, 0.45); g.add(mastil);
  const cabeza = caja(0.42, 0.16, 0.16, negro, 0, NAVCAM_M, 0.47);
  for (const s of [-1, 1]) { const ojo = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), M({ color: 0x0a0a0c, metalness: 0.9, roughness: 0.1 })); ojo.rotation.x = Math.PI / 2; ojo.position.set(s * 0.12, NAVCAM_M, 0.56); g.add(ojo); }
  caja(0.36, 0.06, 0.08, M({ color: 0xfff6e0, emissive: 0xfff1cf, emissiveIntensity: 0.6 }), 0, NAVCAM_M - 0.12, 0.52); // barra de luces del mástil
  const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), blanco); brazo.position.set(-0.35, 1.7, -0.45); g.add(brazo);
  const plato = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, 0.9), blanco); plato.position.set(-0.35, 2.3, -0.45); plato.rotation.x = -Math.PI / 3; g.add(plato);
  // Taladro (1 m) en el costado delantero
  const taladro = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), gris); taladro.position.set(0.45, 0.85, 0.7); g.add(taladro);
  const broca = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 10), oro); broca.rotation.x = Math.PI; broca.position.y = -0.55; taladro.add(broca);
  // Ruedas con suspensión
  const ruedas = [];
  for (const [x, z] of [[-0.68, 0.55], [0.68, 0.55], [-0.68, -0.55], [0.68, -0.55]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 20), negro); r.rotation.z = Math.PI / 2; r.position.set(x, 0.25, z); g.add(r); ruedas.push(r);
    const pata = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), gris); pata.position.set(x * 0.9, 0.45, z); g.add(pata);
  }
  // Luces: las del mástil siguen la mirada de la cámara; las del cuerpo iluminan delante de las ruedas
  const luz = new THREE.SpotLight(0xfff1d6, 0, 60, 0.45, 0.5, 1.2); luz.position.set(0, NAVCAM_M - 0.12, 0.55); luz.target.position.set(0, 0, 12); g.add(luz, luz.target);
  const luzCuerpo = new THREE.SpotLight(0xfff1d6, 0, 20, 0.8, 0.6, 1.4); luzCuerpo.position.set(0, 0.7, 0.7); luzCuerpo.target.position.set(0, 0, 5); g.add(luzCuerpo, luzCuerpo.target);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // Lo que es cuerpo del rover de respaldo va en su grupo (se oculta si carga el Perseverance); luces y taladro quedan fuera
  const respaldo = new THREE.Group(), fijos = new Set([luz, luz.target, luzCuerpo, luzCuerpo.target, taladro]);
  for (const o of [...g.children]) if (!fijos.has(o)) respaldo.add(o);
  g.add(respaldo);
  return { g, ruedas, luz, luzCuerpo, taladro, respaldo };
}

export class Rover {
  constructor(view, { onSalir, sonido } = {}) {
    this.view = view; this.onSalir = onSalir; this.sonido = sonido;
    this.active = false; this.pos = new THREE.Vector3(); this.heading = 0; this.vel = 0; this.lamps = true; this.walked = 0;
    this.keys = new Set(); this.escala = 0; this.vista = 'navcam'; this.briefing = false;
    const m = modeloRover(); Object.assign(this, { obj: m.g, ruedas: m.ruedas, luz: m.luz, luzCuerpo: m.luzCuerpo, taladro: m.taladro, respaldo: m.respaldo });
    this.pan = 0; this.tilt = 0; this.perfora = null;
    // Polvo de las ruedas: sin aire, cada grano sigue una parábola con la gravedad lunar (1,62 m/s²) y cae
    const NP = 160, pp = new Float32Array(NP * 3).fill(-1e5); this.polvo = { n: NP, i: 0, pos: pp, vel: new Float32Array(NP * 3), vida: new Float32Array(NP) };
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.polvoObj = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xb8b2a6, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false })); this.polvoObj.frustumCulled = false; view.scene.add(this.polvoObj);
    // Mirar con la cámara del mástil: arrastrar con el ratón (o el dedo) la gira; R la centra
    let arr = null; const el = view.renderer.domElement;
    this._pd = (e) => { if (this.active && !this.briefing && this.vista === 'navcam') arr = { x: e.clientX, y: e.clientY }; };
    this._pm = (e) => { if (!arr) return; this.pan = Math.max(-2.2, Math.min(2.2, this.pan - (e.clientX - arr.x) * 0.005)); this.tilt = Math.max(-0.6, Math.min(0.5, this.tilt - (e.clientY - arr.y) * 0.004)); arr = { x: e.clientX, y: e.clientY }; };
    this._pu = () => { arr = null; };
    el.addEventListener('pointerdown', this._pd); window.addEventListener('pointermove', this._pm); window.addEventListener('pointerup', this._pu); this.obj.visible = false; view.scene.add(this.obj);
    this.sinRegreso = true; this.alcance = 4; this.tasks = new Tareas(this);
    this.navcam = new THREE.Vector3(0, NAVCAM_M, 0.62); // en ejes del rover; con el Perseverance, donde están sus NavCams
    // Pantalla del operador: telemetría, imagen de la NAVCAM (marcos, brújula, objetivo), minimapa, avisos y briefing
    const r = (this.ui = document.createElement('div')); r.className = 'sim-rv'; r.hidden = true;
    r.innerHTML = `
      <div class="sim-rv-cam"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span class="cruz"></span></div>
      <div class="sim-rv-top"><span class="rec">●</span> <b data-r="cam"></b><span data-r="hora"></span></div>
      <div class="sim-rv-brujula"><div data-r="cinta"></div><i></i></div>
      <div class="sim-rv-obj" data-r="obj"><i></i><b></b><span></span></div>
      <div class="sim-rv-flecha" data-r="flecha"><i>➤</i><span></span></div>
      <div class="sim-rv-tele" data-r="tele"></div>
      <canvas class="sim-rv-mapa" width="220" height="220" data-r="mapa"></canvas>
      <div class="sim-rv-tarea" data-r="tarea"></div>
      <div class="sim-rv-medir" data-r="medir" hidden></div>
      <div class="sim-rv-aviso" data-r="aviso" hidden></div>
      <div class="sim-rv-brief" data-r="brief" hidden></div>`;
    view.host.append(r);
    this.$ = (k) => r.querySelector(`[data-r="${k}"]`);
    r.addEventListener('click', (e) => { if (e.target.closest?.('[data-act=empezar]')) this._cerrarBriefing(); });
    this._kd = (e) => {
      if (!this.active || enCampo(e)) return;
      if (this.briefing) { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyW') { e.preventDefault(); this._cerrarBriefing(); } return; }
      this.keys.add(e.code); if (/^(Arrow|Key[WASD]$|Space)/.test(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyT') this.escala = (this.escala + 1) % ESCALAS.length;
      if (e.code === 'KeyE') this._medir();
      if (e.code === 'KeyR') { this.pan = 0; this.tilt = 0; }
      if (e.code === 'KeyL') this.lamps = !this.lamps;
      if (e.code === 'KeyC') this.vista = this.vista === 'navcam' ? 'seguimiento' : 'navcam';
      if (e.code === 'KeyQ') this.onSalir?.();
      if (e.code === 'KeyI' && this.tasks.started) this._informe();
    };
    this._ku = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku);
  }

  /** El Perseverance de NASA: a 3 m de largo (su tamaño real), con el frente hacia +z (el lado de su mástil) y la cámara
   *  en sus NavCams. Mientras carga, o si falla, se ve el rover de respaldo. */
  _cargarModelo() {
    const loader = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
    loader.loadAsync(perseveranceUrl).then((gltf) => {
      const m = gltf.scene; m.updateMatrixWorld(true);
      let caja = new THREE.Box3().setFromObject(m);
      const tam = caja.getSize(new THREE.Vector3()), largo = Math.max(tam.x, tam.z), k = 3.0 / largo; // Perseverance: 3 m de largo
      const raiz = new THREE.Group(); raiz.add(m); m.scale.multiplyScalar(k); m.updateMatrixWorld(true);
      // Frente: el de sus cámaras de peligro delanteras (hazcams_front), respecto del centro, en el plano horizontal
      caja = new THREE.Box3().setFromObject(m); const centro = caja.getCenter(new THREE.Vector3());
      const nav = m.getObjectByName('NavCams'), frente = m.getObjectByName('hazcams_front') ?? nav;
      const pF = frente ? new THREE.Box3().setFromObject(frente).getCenter(new THREE.Vector3()) : null;
      if (pF) { const ang = Math.atan2(pF.x - centro.x, pF.z - centro.z); m.rotation.y -= ang; m.updateMatrixWorld(true); }
      caja = new THREE.Box3().setFromObject(m); const c2 = caja.getCenter(new THREE.Vector3());
      m.position.x -= c2.x; m.position.z -= c2.z; m.position.y -= caja.min.y; m.updateMatrixWorld(true);
      // En el modelo el mástil viene plegado (cabeza a ~1,2 m, como en el viaje). Desplegado, sus NavCams quedan a unos
      // 2 m del suelo: la cámara va a esa altura, sobre la cabeza del mástil.
      const cabeza = m.getObjectByName('head') ?? nav;
      if (cabeza) { const bb = new THREE.Box3().setFromObject(cabeza), q = bb.getCenter(new THREE.Vector3()); this.navcam.set(q.x, Math.max(NAVCAM_M, bb.max.y + 0.4), bb.max.z + 0.05); }
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.respaldo.visible = false; this.obj.add(raiz); this.modelo = raiz;
      // El taladro de la animación va al frente, donde el Perseverance lleva la torreta de su brazo
      this.taladro.position.set(0, 0.85, Math.min(1.7, caja.max.z - c2.z + 0.1));
    }).catch(() => { /* sin el modelo: se queda el de respaldo */ }).finally(() => draco.dispose());
  }

  /** Despliega el rover junto al módulo (`lmPos`), mirando hacia `heading`. */
  start(lmPos, heading, { lm = null } = {}) {
    const v = this.view, p = v.plan ?? {};
    if (!this._modeloPedido) { this._modeloPedido = true; this._cargarModelo(); } // 5 MB: solo en misiones con rover
    this.vmax = Math.max(0.05, (p.roverKmh ?? 0.8) / 3.6); this.paradaH = p.paradaH ?? 2;
    this.lmPos = lmPos.clone();
    // Bajó del módulo y se apartó: el punto más llano a 10–20 m (no se despliega en la ladera de un cráter)
    let mejor = null;
    for (let i = 0; i < 48; i++) { const r = 10 + (i % 6) * 2, a = heading + (Math.floor(i / 6) - 4) * 0.5, x = lmPos.x + Math.sin(a) * r, z = lmPos.z + Math.cos(a) * r, pe = this._pend(x, z); if (!mejor || pe < mejor.pe) mejor = { x, z, pe }; }
    this.pos.set(mejor.x, 0, mejor.z);
    this.pos.y = v.groundY(this.pos.x, this.pos.z);
    this.active = true; this.vel = 0; this.walked = 0; this.escala = 1; this.pan = 0; this.tilt = 0; this.perfora = null; this.taladro.position.y = 0.85; this.notice = null; this._informeVisto = false; this._lejos = false;
    this.s = { t: 0 }; this.stats = { salidasRuta: 0, sinEnlaceS: 0, pendienteMax: 0 }; this.vista = 'navcam'; this._camPos = null;
    this.obj.visible = true; this.ui.hidden = false;
    this.tasks.reset(); this.tasks.start(lm);
    // Arranca mirando hacia la primera parada
    const t0 = this.tasks.target; this.heading = t0 ? Math.atan2(t0.x - this.pos.x, t0.z - this.pos.z) : heading;
    this._briefing();
  }

  stop() { this.active = false; this.obj.visible = false; this.ui.hidden = true; this.keys.clear(); this.luz.intensity = 0; this.luzCuerpo.intensity = 0; this.briefing = false; }

  _briefing() {
    const p = this.view.plan ?? {}, t = this.tasks, n = t.samples.length;
    this.briefing = true;
    const b = this.$('brief'); b.hidden = false;
    b.innerHTML = `<small>${tr('ROVER MISSION · BRIEFING', 'MISIÓN DEL ROVER · BRIEFING')}</small>
      <b>${tr('Drive to each stop and collect the sample', 'Lleva el rover a cada parada y recoge la muestra')}</b>
      <ol>
        ${t.samples.map((m, i) => `<li>${tr(`Stop ${i + 1}`, `Parada ${i + 1}`)}: ${m.name === 'sombra' ? tr('in shadow, turn on the lights (L)', 'en sombra, enciende las luces (L)') : tr('in sunlight', 'al Sol')} · ${tr('press E: the drill takes the sample', 'pulsa E: el taladro saca la muestra')}</li>`).join('')}
        ${n ? '' : `<li>${tr('Reach the end of the route', 'Llega al final de la ruta')}</li>`}
        <li>${tr('The report appears at the end', 'Al terminar aparece el informe')}</li>
      </ol>
      <div class="teclas"><span><b>W</b> ${tr('forward', 'avanzar')}</span><span><b>S</b> ${tr('back', 'atrás')}</span><span><b>A D</b> ${tr('steer', 'girar')}</span><span><b>E</b> ${tr('collect', 'recoger')}</span><span><b>L</b> ${tr('lights', 'luces')}</span><span><b>C</b> ${tr('camera', 'cámara')}</span><span><b>🖱</b> ${tr('drag to look', 'arrastra para mirar')}</span><span><b>R</b> ${tr('center camera', 'centrar cámara')}</span><span><b>T</b> ${tr('time', 'tiempo')}</span><span><b>H</b> EVA</span></div>
      <p>${tr(`You drive from the mast navigation camera, as the team on Earth would. Plan: up to ${fmt(p.roverKmh ?? 0.8, 1)} km/h and ${fmt(this.paradaH, 1)} h per stop. Time runs ×10 (T changes it). Without an Earth link the rover stops.`, `Conduces desde la cámara de navegación del mástil, como lo haría el equipo en la Tierra. Plan: hasta ${fmt(p.roverKmh ?? 0.8, 1)} km/h y ${fmt(this.paradaH, 1)} h por parada. El tiempo corre ×10 (T lo cambia). Sin enlace con la Tierra el rover se para.`)}</p>
      <button type="button" data-act="empezar">${tr('Start driving (Enter)', 'Empezar a conducir (Enter)')}</button>`;
  }

  _cerrarBriefing() { this.briefing = false; this.$('brief').hidden = true; avisarEva('tarea-hecha', tr('Rover ready. Follow the marker to the first stop.', 'Rover listo. Sigue la marca hasta la primera parada.'), '.sim-rv-obj'); }

  /** E: si hay una parada al alcance, el rover se detiene y perfora con el taladro (TRIDENT de VIPER, 1 m) para sacar la
   *  muestra; si no, dice dónde está. La muestra en sombra pide las luces encendidas. */
  _medir() {
    if (this.perfora) return;
    const t = this.tasks, k = t.samples.findIndex((m, i) => !m.taken && t._near(i));
    if (k < 0) { this._avisar(tr('Nothing to collect here: follow the marker', 'Aquí no hay nada que recoger: sigue la marca')); return; }
    if (t.samples[k].name === 'sombra' && t.darkReal && !this.lamps) { this._avisar(tr('Too dark to drill: turn on the lights (L)', 'Muy oscuro para perforar: enciende las luces (L)')); return; }
    this.vel = 0; this.perfora = { k, t: 0 };
    this._avisar(tr('Drilling… the drill goes down to take the sample', 'Perforando… el taladro baja a sacar la muestra'), 'ok');
  }

  /** La perforación: baja 1 m (1,5 s), gira (1,2 s) y sube (1,3 s); al subir, la muestra queda guardada. */
  _perforar(dt) {
    const p = this.perfora, m = this.tasks.samples[p.k]; p.t += dt;
    const baja = Math.min(1, p.t / 1.5), sube = Math.max(0, Math.min(1, (p.t - 2.7) / 1.3));
    this.taladro.position.y = 0.85 - 0.95 * (baja - sube); // baja 1 m desde su base
    this.taladro.rotation.y += dt * 18 * (p.t > 1.2 && p.t < 3 ? 1 : 0);
    if (p.t > 1.4 && p.t < 2.8) this._levantar(this.obj.localToWorld(new THREE.Vector3(this.taladro.position.x, 0.05, this.taladro.position.z)), 3, 0.6); // polvo de la broca
    if (m && p.t > 2.0) m.mesh.scale.setScalar(Math.max(0.01, 1 - (p.t - 2.0) / 0.8));
    if (p.t >= 4.0) {
      this.taladro.position.y = 0.85; this.perfora = null;
      const antes = this.tasks.samples.filter((q) => q.taken).length;
      this.tasks.interact(); // la marca como recogida (tareas.ts)
      const n = this.tasks.samples.filter((q) => q.taken).length;
      if (n > antes) { this.s.t += this.paradaH * 3600; this._avisar(tr(`Sample ${n} collected · ${fmt(this.paradaH, 1)} h at the stop (plan)`, `Muestra ${n} recogida · ${fmt(this.paradaH, 1)} h en la parada (plan)`), 'ok'); }
    }
  }

  /** Granos de polvo desde `p`: sin aire, vuelan en parábola con la gravedad lunar y desaparecen al caer. */
  _levantar(p, n, fuerza) {
    const P = this.polvo;
    for (let j = 0; j < n; j++) {
      const i = P.i; P.i = (P.i + 1) % P.n;
      P.pos.set([p.x + (Math.random() - 0.5) * 0.2, p.y, p.z + (Math.random() - 0.5) * 0.2], i * 3);
      P.vel.set([(Math.random() - 0.5) * fuerza, Math.random() * fuerza * 1.2, (Math.random() - 0.5) * fuerza], i * 3); P.vida[i] = 1;
    }
  }

  _polvo(dt) {
    const P = this.polvo, g = this.view.groundY;
    for (let i = 0; i < P.n; i++) {
      if (P.vida[i] <= 0) continue;
      P.vel[i * 3 + 1] -= 1.62 * dt;
      for (let a = 0; a < 3; a++) P.pos[i * 3 + a] += P.vel[i * 3 + a] * dt;
      if (P.pos[i * 3 + 1] < g(P.pos[i * 3], P.pos[i * 3 + 2])) { P.vida[i] = 0; P.pos[i * 3 + 1] = -1e5; }
    }
    this.polvoObj.geometry.attributes.position.needsUpdate = true;
  }

  _avisar(txt, cls = '') { const a = this.$('aviso'); a.textContent = txt; a.className = 'sim-rv-aviso ' + cls; a.hidden = false; clearTimeout(this._avT); this._avT = setTimeout(() => (a.hidden = true), 3500); }

  /** Pendiente (°) del terreno en (x, z), con diferencias a ±1,5 m. */
  _pend(x, z) { const g = this.view.groundY, e = 1.5; return (Math.atan(Math.hypot(g(x + e, z) - g(x - e, z), g(x, z + e) - g(x, z - e)) / (2 * e)) * 180) / Math.PI; }

  update(dtReal) {
    if (!this.active) return;
    const v = this.view, k = this.keys, esc = this.briefing ? 0 : ESCALAS[this.escala], dt = Math.min(0.05, dtReal) * esc;
    this.s.t += dt;
    const enlace = !!v.now?.earth.visible;
    // Mando: acelerar hacia la velocidad del plan; sin enlace con la Tierra no hay órdenes y el rover se para
    if (this.perfora) this._perforar(Math.min(0.25, dtReal)); // por tiempo real: no depende de los cuadros por segundo
    const quiere = enlace && !this.perfora ? ((k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 0.5 : 0)) * this.vmax : 0;
    this.vel += Math.max(-0.3 * dt, Math.min(0.3 * dt, quiere - this.vel));
    if (!enlace) { this.stats.sinEnlaceS += dt; this.vel = 0; }
    const giro = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    // Giro suave (dirección derrapante: gira también parado); se suaviza con la inercia de la orden
    this._giro = (this._giro ?? 0) + ((enlace && !this.briefing && !this.perfora ? giro : 0) - (this._giro ?? 0)) * Math.min(1, dtReal * 6);
    this.heading += this._giro * 0.7 * Math.min(0.05, dtReal);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const nx = this.pos.x + fx * this.vel * dt, nz = this.pos.z + fz * this.vel * dt;
    const pend = this._pend(nx, nz), sube = v.groundY(nx, nz) > this.pos.y;
    if (pend > PENDIENTE_TOPE && sube) { this.vel = 0; this.notice = tr(`Slope of ${fmt(pend)}°: the wheels slip. Find another way.`, `Pendiente de ${fmt(pend)}°: las ruedas patinan. Busca otro camino.`); }
    else if (Math.abs(this.vel) > 1e-4) {
      this.walked += Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.pos.set(nx, v.groundY(nx, nz), nz);
      this.stats.pendienteMax = Math.max(this.stats.pendienteMax, pend);
    }
    // Apoyo en las cuatro ruedas: alto, cabeceo y balanceo salen del suelo bajo cada rueda (suave, como la suspensión)
    const g = v.groundY, fxh = Math.sin(this.heading), fzh = Math.cos(this.heading), lx = Math.cos(this.heading), lz = -Math.sin(this.heading); // lx,lz: lado +x del rover
    const en = (dxL, dzF) => g(this.pos.x + lx * dxL + fxh * dzF, this.pos.z + lz * dxL + fzh * dzF);
    const hFI = en(0.68, 0.55), hFD = en(-0.68, 0.55), hTI = en(0.68, -0.55), hTD = en(-0.68, -0.55);
    const alto = (hFI + hFD + hTI + hTD) / 4, cab = Math.atan2((hFI + hFD) - (hTI + hTD), 2 * 1.1), bal = Math.atan2((hFI + hTI) - (hFD + hTD), 2 * 1.36);
    const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-cab, this.heading, bal, 'YXZ'));
    if (this._qInit) this.obj.quaternion.slerp(qq, Math.min(1, dtReal * 8)); else { this.obj.quaternion.copy(qq); this._qInit = true; }
    this.obj.position.set(this.pos.x, alto, this.pos.z);
    // Polvo detrás de las ruedas al avanzar
    if (Math.abs(this.vel) > 0.05 && !this.briefing) { this._polvoT = (this._polvoT ?? 0) + dtReal; if (this._polvoT > 0.05) { this._polvoT = 0; for (const [x, z] of [[0.68, -0.55], [-0.68, -0.55]]) this._levantar(this.obj.localToWorld(new THREE.Vector3(x, 0.05, z)), 2, 0.5); } }
    this._polvo(Math.min(0.05, dtReal));
    for (const r of this.ruedas) r.rotation.x += (this.vel * dt) / 0.25;
    this.luz.intensity = this.lamps ? 7 : 0; this.luzCuerpo.intensity = this.lamps ? 4 : 0;
    // Ruta y paradas (tareas.ts, sin el regreso)
    const lejos = this.tasks.lejosDeRuta; if (lejos && !this._lejos) this.stats.salidasRuta++; this._lejos = lejos;
    if (v.tSalida != null) v.cieloAl?.(v.tSalida + this.s.t * 1000); // el Sol y la Tierra avanzan con el reloj del recorrido
    this.tasks.update();
    if (this.tasks.done && !this._informeVisto) { this._informeVisto = true; setTimeout(() => this.active && this._informe(), 2000); }
    this._camara(Math.min(0.05, dtReal));
    this._pantalla(enlace, pend);
  }

  _informe() { mostrarInforme(this.view, datosRover(this.view, this), { volar: () => this.onSalir?.(), planificador: () => { location.href = /planificar-mision/.test(document.referrer) ? document.referrer : '/planificar-mision.html'; } }); }

  /** NAVCAM: la cámara del mástil, a 2,0 m, mirando adelante y un poco abajo (sigue al chasis). Seguimiento: detrás y arriba. */
  _camara(dt) {
    const v = this.view, c = v.camera;
    if (this.perfora) { // mientras perfora: plano corto desde fuera, delante a la derecha, para ver bajar el taladro
      this.obj.updateMatrixWorld();
      const tz = this.taladro.position.z, tx = this.taladro.position.x;
      c.position.copy(this.obj.localToWorld(new THREE.Vector3(tx + 2.2, 1.4, tz + 2.2)));
      c.lookAt(this.obj.localToWorld(new THREE.Vector3(tx, 0.25, tz)));
      if (c.fov !== 50) { c.fov = 50; c.near = 0.05; c.updateProjectionMatrix(); }
      return;
    }
    if (this.vista === 'navcam') {
      this.obj.updateMatrixWorld();
      c.position.copy(this.obj.localToWorld(this.navcam.clone()));
      // El cardán del mástil gira la cámara
      const mira = new THREE.Vector3(this.navcam.x + Math.sin(this.pan) * 10, this.navcam.y - 1.4 + this.tilt * 10, this.navcam.z + Math.cos(this.pan) * 10);
      c.lookAt(this.obj.localToWorld(mira));
      this.luz.target.position.copy(mira).setY(0); this.luz.position.copy(this.navcam).add(new THREE.Vector3(0, -0.15, 0)); // las luces del mástil van con la cámara
      if (c.fov !== 62) { c.fov = 62; c.near = 0.05; c.updateProjectionMatrix(); }
      this._camPos = null;
    } else {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const want = new THREE.Vector3(this.pos.x - fx * 7 + fz * 3, 0, this.pos.z - fz * 7 - fx * 3);
      want.y = Math.max(this.pos.y + 3.5, v.groundY(want.x, want.z) + 2);
      if (!this._camPos) this._camPos = want.clone(); else this._camPos.lerp(want, Math.min(1, dt * 3));
      c.position.copy(this._camPos); c.lookAt(this.pos.x + fx * 3, this.pos.y + 0.8, this.pos.z + fz * 3);
      if (c.fov !== 55) { c.fov = 55; c.updateProjectionMatrix(); }
    }
  }

  _pantalla(enlace, pend) {
    const v = this.view, now = v.now, t = this.tasks, ui = this.ui;
    ui.classList.toggle('navcam', this.vista === 'navcam' && !this.perfora);
    const sol = now ? (now.sun.frac > 0.5 && t.lit(this.pos.x, this.pos.z)) : false;
    this.$('cam').textContent = this.perfora ? tr('OUTSIDE VIEW · DRILL', 'VISTA EXTERIOR · TALADRO') : this.vista === 'navcam' ? (this.modelo ? tr(`NAVCAM · PERSEVERANCE MAST ${fmt(this.navcam.y, 1)} m`, `NAVCAM · MÁSTIL DEL PERSEVERANCE ${fmt(this.navcam.y, 1)} m`) : tr('NAVCAM · MAST 2.0 m', 'NAVCAM · MÁSTIL 2,0 m')) : tr('CHASE CAMERA', 'CÁMARA DE SEGUIMIENTO');
    this.$('hora').textContent = v.time ? ' ' + new Date(v.time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
    // Brújula: rumbo del rover (0° = norte, sentido horario; x este, z sur)
    const rumbo = ((Math.atan2(Math.sin(this.heading), -Math.cos(this.heading)) * 180) / Math.PI + 360) % 360;
    this.$('cinta').innerHTML = Array.from({ length: 25 }, (_, i) => { const a = Math.round(rumbo / 15) * 15 + (i - 12) * 15, n = ((a % 360) + 360) % 360, dx = (a - rumbo) * 6; return `<span style="left:calc(50% + ${dx}px)">${n % 45 === 0 ? PUNTOS[n / 45] : n % 30 === 0 ? n : '·'}</span>`; }).join('');
    // Objetivo en la imagen (o flecha al borde)
    const obj = this.$('obj'), fl = this.$('flecha'), tg = t.target;
    if (tg && !t.done && !this.perfora) {
      const p = new THREE.Vector3(tg.x, (tg.y ?? v.groundY(tg.x, tg.z)) + 1, tg.z), d = Math.hypot(tg.x - this.pos.x, tg.z - this.pos.z);
      const s = p.clone().project(v.camera), W = ui.clientWidth, H = ui.clientHeight, dentro = s.z < 1 && Math.abs(s.x) < 0.92 && Math.abs(s.y) < 0.9;
      const nombre = t.step?.kind === 'sampleSombra' ? tr('SHADOW STOP', 'PARADA EN SOMBRA') : t.step?.kind === 'sampleSol' ? tr('LIT STOP', 'PARADA AL SOL') : tr('END OF ROUTE', 'FIN DE RUTA');
      if (dentro) { obj.hidden = false; fl.hidden = true; obj.style.left = ((s.x + 1) / 2) * W + 'px'; obj.style.top = ((1 - s.y) / 2) * H + 'px'; obj.querySelector('b').textContent = nombre; obj.querySelector('span').textContent = fmt(d) + ' m'; }
      else {
        obj.hidden = true; fl.hidden = false;
        const rel = Math.atan2(tg.x - this.pos.x, tg.z - this.pos.z) - this.heading, a = Math.atan2(Math.sin(rel), Math.cos(rel)); // + izquierda
        const izq = a > 0, atras = Math.abs(a) > 2.2;
        fl.className = 'sim-rv-flecha ' + (atras ? 'atras' : izq ? 'izq' : 'der');
        fl.querySelector('span').textContent = `${nombre} · ${fmt(d)} m · ${atras ? tr('behind you', 'detrás') : izq ? tr('turn left (A)', 'gira a la izquierda (A)') : tr('turn right (D)', 'gira a la derecha (D)')}`;
      }
      // Aviso de medir
      const cerca = t.samples.find((m, i) => !m.taken && t._near(i));
      const me = this.$('medir'); me.hidden = !cerca;
      if (this.perfora) { me.hidden = false; me.innerHTML = tr('Drilling…', 'Perforando…'); }
    else if (cerca) me.innerHTML = cerca.name === 'sombra' && t.darkReal && !this.lamps ? tr('Too dark: turn on the lights <b>L</b>', 'Está oscuro: enciende las luces <b>L</b>') : tr('Press <b>E</b> to drill and collect the sample', 'Pulsa <b>E</b> para perforar y recoger la muestra');
    } else { obj.hidden = true; fl.hidden = true; const me = this.$('medir'); me.hidden = !this.perfora; if (this.perfora) me.innerHTML = tr('Drilling…', 'Perforando…'); }
    // Telemetría
    this.$('tele').innerHTML = `
      <div><span>${tr('SPEED', 'VELOCIDAD')}</span><b>${fmt(Math.abs(this.vel) * 3.6, 2)}</b><i>/ ${fmt(this.vmax * 3.6, 1)} km/h</i></div>
      <div><span>${tr('TIME', 'TIEMPO')}</span><b>${hm(this.s.t)}</b><i>×${ESCALAS[this.escala]}</i></div>
      <div><span>${tr('DRIVEN', 'RECORRIDO')}</span><b>${fmt(this.walked)} m</b></div>
      <div class="${enlace ? 'ok' : 'mal'}"><span>${tr('EARTH', 'TIERRA')}</span><b>${enlace ? tr('LINK', 'ENLACE') : tr('NO LINK · STOPPED', 'SIN ENLACE · PARADO')}</b></div>
      <div class="${sol ? 'ok' : 'mal'}"><span>${tr('SUN', 'SOL')}</span><b>${sol ? tr('IN SUNLIGHT', 'AL SOL') : tr('SHADOW', 'SOMBRA')}</b></div>
      <div class="${pend > PENDIENTE_AVISO ? 'mal' : ''}"><span>${tr('SLOPE', 'PENDIENTE')}</span><b>${fmt(pend, 1)}°</b></div>
      <div><span>${tr('LIGHTS', 'LUCES')}</span><b>${this.lamps ? tr('ON', 'ENCENDIDAS') : tr('OFF', 'APAGADAS')}</b></div>`;
    this.$('tarea').textContent = t.text() ?? '';
    if (this.notice) { this._avisar(this.notice); this.notice = null; }
    this._mapa();
  }

  /** Minimapa: la ruta, las paradas, el módulo y el rover, con el norte arriba (hasta 400 m alrededor). */
  _mapa() {
    const c = this.$('mapa'), x = c.getContext('2d'), W = c.width, t = this.tasks;
    const pts = t.ruta ?? []; let R = 120;
    for (const q of pts) R = Math.max(R, Math.min(400, Math.hypot(q.x - this.pos.x, q.z - this.pos.z) * 0.8));
    const k = (W / 2 - 12) / R, P = (q) => [W / 2 + (q.x - this.pos.x) * k, W / 2 + (q.z - this.pos.z) * k];
    x.clearRect(0, 0, W, W); x.fillStyle = 'rgba(6,10,14,.72)'; x.fillRect(0, 0, W, W);
    x.strokeStyle = 'rgba(159,228,242,.85)'; x.lineWidth = 2; x.setLineDash([5, 4]); x.beginPath(); pts.forEach((q, i) => { const [a, b] = P(q); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke(); x.setLineDash([]);
    if (this.lmPos) { const [a, b] = P(this.lmPos); x.fillStyle = '#e6e4df'; x.fillRect(a - 4, b - 4, 8, 8); }
    t.samples.forEach((m, i) => { const [a, b] = P(m.mesh.position); x.fillStyle = m.taken ? '#4cc38a' : m.name === 'sombra' ? '#8f7cff' : '#ffd25a'; x.beginPath(); x.arc(a, b, 6, 0, 7); x.fill(); x.fillStyle = '#06090c'; x.font = 'bold 9px monospace'; x.textAlign = 'center'; x.fillText(String(i + 1), a, b + 3); });
    x.save(); x.translate(W / 2, W / 2); x.rotate(-this.heading + Math.PI); x.fillStyle = '#ff6b5e'; x.beginPath(); x.moveTo(0, -9); x.lineTo(6, 7); x.lineTo(0, 3); x.lineTo(-6, 7); x.closePath(); x.fill(); x.restore();
    x.fillStyle = 'rgba(230,244,250,.75)'; x.font = '10px monospace'; x.textAlign = 'left'; x.fillText('N ↑', 6, 14); x.textAlign = 'right'; x.fillText(`${fmt(R)} m`, W - 6, W - 6);
  }

  dispose() {
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku);
    this.tasks.dispose(); this.obj.removeFromParent(); this.polvoObj.removeFromParent(); this.ui.remove();
    const el = this.view.renderer.domElement; el.removeEventListener('pointerdown', this._pd); window.removeEventListener('pointermove', this._pm); window.removeEventListener('pointerup', this._pu);
  }
}
