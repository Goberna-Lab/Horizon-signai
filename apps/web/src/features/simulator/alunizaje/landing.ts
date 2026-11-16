// @ts-nocheck — portado de nuestro simulador (JavaScript); el tipado estricto queda pendiente.
// Simulación de alunizaje estilo Apollo en el sitio seleccionado.
//
// Secuencia basada en el descenso real del Módulo Lunar (Apollo 11, 1969):
//   P64  Aproximación: el LM inclinado frena y avanza con el Sol a la espalda
//        (Apollo alunizaba con el Sol bajo detrás para ver las sombras de las rocas).
//   P66  Descenso final: baja casi en vertical (~1 m/s). Aquí no hay control manual: el guiado sigue la trayectoria
//        hasta el contacto y la nave se posa donde la deja, con su error de navegación (aterrizaje.ts).
//   Luz de contacto: las sondas de 1.7 m tocan el suelo -> se apaga el motor -> caída libre.
//   EVA: sale por la escotilla delantera, baja la escalera y da el primer paso.
// Física: gravedad lunar 1.62 m/s²; la trayectoria es una curva de Hermite por fase y el
// empuje necesario sale de la aceleración (a - g). El polvo vuela en línea recta: no hay aire.
//
// Contexto del reto: el LM baja en el sitio elegido, con el Sol y la Tierra calculados para ese momento; el resultado
// (nominal, inclinada, dura o vuelco) depende del terreno real bajo las patas. Si la Tierra no es visible, los
// mensajes de Houston no llegan. Quien habla es la EVA de toda la aplicación: se le avisa con `avisarEva` de
// `@/shared/eva` («aviso-critico» con el terreno en P66, el fallo de altura y los resultados malos; «aterrizaje-nominal»).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import lmUrl from './data/lunar-module.glb?url';
import { SoftParticles } from './particles';
import { LM_APOLLO11 } from './engine/descenso';
import { descensoNominal } from './engine/plan';
import { avisarEva } from '@/shared/eva';
import { tr } from '@/shared/i18n';
import { planTouchdown, outcome, hazardAt, gravedad, ROCK_SMALL, ROCK_BIG } from './aterrizaje';
import { datosFija, mostrarInforme } from './informe';

const G = 1.62;
const LM_SCALE = 1.4;          // el modelo NASA está a ~70 % del tamaño real (9.4 m entre patas)
const PROBE = 1.7;             // sondas de contacto bajo las patas (m)
const UP = new THREE.Vector3(0, 1, 0);

// Bajada: dónde van los pies del astronauta, en coordenadas del LM (frente = +z, metros).
// Medido en el modelo: porche y 2.21–2.46 / z 1.17–2.07; escalera de (y 1.95, z 2.14) a (y 0.58, z 2.80); plato en z 3.05.
const S = LM_SCALE;
const LX = -0.045 * S;
const EG = {
  hatch: [LX, 2.44 * S, 1.5 * S], porch: [LX, 2.44 * S, 2.02 * S],
  top: [LX, 1.93 * S, 2.17 * S], bottom: [LX, 0.62 * S, 2.8 * S], pad: [0, 0.27 * S, 3.05 * S],
};
const RUNGS = 8;
const EG_T = [3.2, 1.6, 7.6, 2.4, 2.2]; // porche, primer peldaño, escalera, salto al plato, paso al suelo
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Mapa de normales de lámina arrugada (Kapton / Mylar), generado. */
function crinkleMap() {
  const N = 256, h = new Float32Array(N * N);
  const rnd = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [f, a, sd] of [[8, 1, 1], [19, 0.55, 2], [41, 0.28, 3]]) { // pliegues: celdas con rampas (aristas duras)
      const u = (x / N) * f, w = (y / N) * f, iu = Math.floor(u), iw = Math.floor(w), fu = u - iu, fw = w - iw;
      const g = (i, j) => rnd((iu + i) % f, (iw + j) % f, sd);
      v += a * Math.abs((g(0, 0) * (1 - fu) + g(1, 0) * fu) * (1 - fw) + (g(0, 1) * (1 - fu) + g(1, 1) * fu) * fw - 0.5) * 2;
    }
    h[y * N + x] = v;
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * 3, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * 3;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.anisotropy = 4;
  return t;
}

function hermite(p0, v0, p1, v1, T, s) {
  const s2 = s * s, s3 = s2 * s;
  const h = [2 * s3 - 3 * s2 + 1, s3 - 2 * s2 + s, -2 * s3 + 3 * s2, s3 - s2];
  const d = [6 * s2 - 6 * s, 3 * s2 - 4 * s + 1, -6 * s2 + 6 * s, 3 * s2 - 2 * s];
  const dd = [12 * s - 6, 6 * s - 4, -12 * s + 6, 6 * s - 2];
  const comb = (k, div) => new THREE.Vector3()
    .addScaledVector(p0, k[0]).addScaledVector(v0, k[1] * T).addScaledVector(p1, k[2]).addScaledVector(v1, k[3] * T)
    .multiplyScalar(1 / div);
  return { p: comb(h, 1), v: comb(d, T), a: comb(dd, T * T) };
}

const fmt = (n, d = 0) => n.toLocaleString(tr('en-US', 'es-ES'), { minimumFractionDigits: d, maximumFractionDigits: d });
const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class LandingSim {
  constructor(view) {
    this.view = view;          // Scene3D
    this.active = false;
    this.locks = false;        // true mientras la simulación controla cámara y astronauta
    this.speed = 1;
  }

  async load() {
    if (this.lm) return;
    const loader = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(lmUrl);
    const lm = gltf.scene;
    lm.scale.setScalar(LM_SCALE);
    const crinkle = crinkleMap();
    this.bell = [];
    lm.traverse((o) => {
      if (!o.isMesh) return;
      if (/polySurfa1/.test(o.name)) { o.visible = false; return; } // la escalera del modelo: tramo suelto y con pocos peldaños; se rehace abajo
      o.castShadow = true; o.receiveShadow = true;
      // El modelo NASA solo trae colores planos. Materiales por código:
      //  etapa de descenso: lámina dorada arrugada (Kapton aluminizado) y paneles negros;
      //  etapa de ascenso: aluminio mate; tobera: metal oscuro que se pone incandescente.
      const m = o.material = o.material.clone();
      const c = m.color, uv = !!o.geometry.attributes.uv;
      if (/group13_pC/.test(o.name)) { m.color.set(0x2a2725); m.metalness = 0.9; m.roughness = 0.5; m.emissive = new THREE.Color(1, 0.35, 0.08); m.emissiveIntensity = 0; this.bell.push(m); }
      else if (c.r > 0.5 && c.g > 0.35 && c.b < c.r * 0.6) {
        m.color.set(0xd8a23a); m.metalness = 1; m.roughness = 0.3; m.envMapIntensity = 2.4;
        if (uv) { m.normalMap = crinkle; m.normalScale = new THREE.Vector2(0.9, 0.9); }
      } else if (c.r < 0.3 && c.g < 0.3) {
        m.color.set(0x141416); m.metalness = 0.55; m.roughness = 0.45; m.envMapIntensity = 1.2;
        if (uv) { m.normalMap = crinkle; m.normalScale = new THREE.Vector2(0.6, 0.6); }
      } else if (c.r > 0.85 && c.g > 0.85 && c.b > 0.85) { m.color.multiplyScalar(0.72); m.metalness = 0.1; m.roughness = 0.75; m.envMapIntensity = 0.6; } // blancos: escalera, antenas, mantas
      else {
        m.color.multiplyScalar(0.7); m.metalness = 0.5; m.roughness = 0.68; m.envMapIntensity = 1.0; m.flatShading = true;
        if (uv) { m.normalMap = crinkle; m.normalScale = new THREE.Vector2(0.18, 0.18); }
      }
    });
    this.lm = new THREE.Group();
    this.lm.add(lm);
    // Escalera: una sola pieza del borde del porche hasta encima del plato, a lo largo de la pata delantera, con
    // peldaños cada ~23 cm como la del LM (los pies del astronauta caen en ellos: EG.top → EG.bottom en RUNGS pasos).
    // La del modelo (polySurfa1) se oculta: dejaba un hueco bajo el porche y solo tenía tres peldaños.
    const white = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.35, roughness: 0.55 });
    const seg = (p, q, r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, p.distanceTo(q) * S, 10), white);
      m.position.copy(p).add(q).multiplyScalar(0.5 * S); m.quaternion.setFromUnitVectors(UP, q.clone().sub(p).normalize()); m.castShadow = true; m.receiveShadow = true; this.lm.add(m); };
    const LA = new THREE.Vector3(0, 2.3, 2.04), LB = new THREE.Vector3(0, 0.5, 2.835); // arriba (borde del porche) y abajo (unidades del modelo)
    const zEn = (y) => LA.z + ((LA.y - y) / (LA.y - LB.y)) * (LB.z - LA.z);
    const RX = [-0.225, 0.135];
    for (const x of RX) seg(LA.clone().setX(x), LB.clone().setX(x), 0.02);                       // largueros
    for (const x of RX) seg(new THREE.Vector3(x, 2.3, 2.04), new THREE.Vector3(x, 2.23, 1.9), 0.016); // anclaje al porche
    const paso = (EG.top[1] - EG.bottom[1]) / S / RUNGS;                                             // ~0,164 del modelo = 0,23 m
    for (let j = -1; j <= RUNGS; j++) { const y = EG.top[1] / S - j * paso + 0.02; seg(new THREE.Vector3(RX[0], y, zEn(y)), new THREE.Vector3(RX[1], y, zEn(y)), 0.014); }
    // Luz de seguimiento: destello blanco una vez por segundo
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(30, 30, 34) }));
    this.beacon.position.set(0, 4.0 * S, 1.66 * S);
    this.lm.add(this.beacon);

    // Brillo en la tobera (el escape en el vacío es casi transparente)
    const gc = document.createElement('canvas'); gc.width = gc.height = 128;
    const gx = gc.getContext('2d'), gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(0.25, 'rgba(255,200,140,.45)'); gr.addColorStop(1, 'rgba(255,170,100,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.material.color.setScalar(4); // HDR para el bloom
    this.glow.position.y = 0.35 * S;
    this.lm.add(this.glow);
    this.engineLight = new THREE.PointLight(0xffd6a0, 0, 60, 1.5);
    this.engineLight.position.y = 0.2;
    this.lm.add(this.engineLight);
    // Luz de relleno de cine (NO es física): la escotilla queda a contraluz, como en Apollo, y sin ella no se ve la salida
    this.fill = new THREE.DirectionalLight(0xcfd8ff, 0);
    this.lm.add(this.fill, this.fill.target);

    // Polvo (lámina rasante) y escape del motor: partículas suaves
    this.dustFx = new SoftParticles(5000, { color: 0xcfc7b6, opacity: 0.085 });
    this.exhaust = new SoftParticles(700, { color: new THREE.Color(3.2, 2.3, 1.4), opacity: 0.45, additive: true });
    this.dust = new THREE.Group();
    this.dust.add(this.dustFx.points, this.exhaust.points);

    this._buildHud();
  }

  /* ---------------- Interfaz ---------------- */
  _buildHud() {
    const host = this.view.host;
    const hud = document.createElement('div');
    hud.className = 'sim-lander-hud';
    hud.innerHTML = `
      <div class="sim-lh-title">${tr('APOLLO · LANDING', 'APOLLO · ALUNIZAJE')}</div>
      <div class="sim-lh-phase" data-k="phase"></div>
      <div class="sim-lh-grid">
        <span>${tr('Altitude', 'Altitud')}</span><b data-k="alt"></b>
        <span>${tr('Vertical speed', 'Vel. vertical')}</span><b data-k="vs"></b>
        <span>${tr('Horizontal speed', 'Vel. horizontal')}</span><b data-k="hs"></b>
        <span>${tr('Thrust', 'Empuje')}</span><b data-k="thr"></b>
        <span>${tr('Fuel', 'Combustible')}</span><b data-k="fuel"></b>
        <span>${tr('Time', 'Tiempo')}</span><b data-k="time"></b>
      </div>
      <div class="sim-lh-ctx" data-k="ctx"></div>
      <div class="sim-lh-ctrl">
        <button data-speed="1">x1</button><button data-speed="2">x2</button><button data-speed="4">x4</button>
        <button data-act="skip">${tr('Skip to touchdown', 'Saltar al contacto')}</button><button data-act="exit">${tr('Exit', 'Salir')}</button>
      </div>`;
    const log = document.createElement('div');
    log.className = 'sim-lander-log';
    const banner = document.createElement('div');
    banner.className = 'sim-lander-banner';
    host.append(hud, log, banner);
    this.hud = hud; this.log = log; this.banner = banner;
    // Primera persona: lecturas del descenso dentro del visor (el panel normal se oculta con el casco puesto)
    const lfp = document.createElement('div'); lfp.className = 'sim-lfp'; lfp.hidden = true;
    lfp.innerHTML = `<div class="sim-lfp-top"><small data-f="sub">${tr('APOLLO · POWERED DESCENT', 'APOLLO · DESCENSO PROPULSADO')}</small><b data-f="phase"></b></div>
      <div class="sim-lfp-map"><small>${tr('DESCENT MAP', 'MAPA DEL DESCENSO')}</small><div class="mp"><canvas width="220" height="220"></canvas><svg viewBox="0 0 220 220"></svg></div><small>${tr('SPEED', 'VELOCIDAD')}</small><svg class="pf vf" viewBox="0 0 220 74"></svg></div>
      <div class="sim-lfp-prof"><small>${tr('ALTITUDE PROFILE · DISTANCE TO SITE', 'PERFIL DE ALTURA · DISTANCIA AL SITIO')}</small><svg viewBox="0 0 1200 190"></svg></div>
      <div class="sim-lfp-alt"><small>${tr('ALTITUDE', 'ALTURA')}</small><b data-f="alt">—</b><i class="sim-lfp-tape"><u data-f="altbar"></u></i></div>
      <div class="sim-lfp-r"><p><small>${tr('VERTICAL SPEED', 'VELOCIDAD VERTICAL')}</small><b data-f="vs">—</b></p><p><small>${tr('HORIZONTAL SPEED', 'VELOCIDAD HORIZONTAL')}</small><b data-f="hs">—</b></p>
        <p><small>${tr('THRUST', 'EMPUJE')}</small><b data-f="thr">—</b></p><p data-f="fuelp"><small>${tr('FUEL', 'COMBUSTIBLE')}</small><b data-f="fuel">—</b></p></div>
      <div class="sim-lfp-haz" data-f="haz" hidden></div><div class="sim-lfp-flash" data-f="flash"></div><div class="sim-lfp-radio" data-f="radio"></div>
      <div class="sim-lfp-keys"><span class="orb"><b>${tr('Drag', 'Arrastrar')}</b>${tr('orbit the lander', 'girar alrededor de la nave')}</span><span class="orb"><b>${tr('Wheel', 'Rueda')}</b>${tr('zoom', 'acercar')}</span><span class="orb"><b>Enter</b>${tr('skip to touchdown', 'saltar al contacto')}</span></div>`;
    host.append(lfp); this.lfp = lfp;
    // Órbita alrededor de la nave durante el descenso: el ratón gira 360° (con el puntero capturado o arrastrando) y la rueda acerca o aleja
    this.orb = { az: 0, el: 0.16, zoom: 1 };
    window.addEventListener('mousemove', (e) => {
      if (!this.distant || !(document.pointerLockElement || e.buttons & 1)) return;
      this.orb.az += e.movementX * 0.005;  // como arrastrar la escena: mover a la derecha gira la vista hacia la derecha
      this.orb.el = Math.max(-0.12, Math.min(1.35, this.orb.el + e.movementY * 0.004));
    });
    host.addEventListener('wheel', (e) => { if (!this.distant) return; e.preventDefault(); this.orb.zoom = Math.max(0.35, Math.min(3, this.orb.zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
    hud.hidden = log.hidden = banner.hidden = true;
    hud.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.speed) this.setSpeed(Number(b.dataset.speed));
      if (b.dataset.act === 'skip') this.skip();
      if (b.dataset.act === 'exit') this.stop();
    });
  }

  setSpeed(v) {
    this.speed = v;
    this.hud.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === v));
  }

  say(who, text, houston = false) {
    // Misión robótica (rover o módulo fijo): no hay tripulación a bordo. Callan Armstrong y Aldrin y la nave es «el módulo».
    if ((this.view.plan?.tipo ?? 'tripulada') !== 'tripulada') {
      if (who === 'Armstrong' || who === 'Aldrin') return;
      text = text.replace(/\bEagle\b/g, 'Lander').replace(/\bÁguila\b/g, 'Módulo');
    }
    const linked = this.view.now?.earth.visible;
    const li = document.createElement('div');
    if (houston && !linked) {
      li.className = 'nolink';
      li.textContent = `[${clock(this.t)}] Houston: ${tr("— no signal (the Earth is below this site's horizon) —", '— sin señal (la Tierra está bajo el horizonte de este sitio) —')}`;
    } else {
      li.className = houston ? 'houston' : '';
      li.textContent = `[${clock(this.t)}] ${who}: ${text}`;
    }
    this.log.append(li);
    while (this.log.children.length > 7) this.log.firstChild.remove();
    if (this.fp && this.lfp) { // radio en el visor
      const r = this.lfp.querySelector('[data-f=radio]');
      r.textContent = li.textContent.replace(/^\[[^\]]+\]\s*/, ''); r.className = 'sim-lfp-radio show ' + li.className;
      clearTimeout(this.radT); this.radT = setTimeout(() => r.classList.remove('show'), 5200);
      this.view.eva?.sfx?.radio(true);
    }
    if (this.cine) { // subtítulo
      const sub = this.cineEl.querySelector('.sim-cine-sub');
      sub.textContent = li.textContent.replace(/^\[[^\]]+\]\s*/, '');
      sub.className = 'sim-cine-sub show ' + li.className;
      clearTimeout(this.subT); this.subT = setTimeout(() => sub.classList.remove('show'), 4800);
    }
  }

  flash(text, ms = 3500) {
    if (this.cine) { this.title(text, '', ms); return; }
    if (this.fp && this.lfp) { const f = this.lfp.querySelector('[data-f=flash]'); f.textContent = text; f.classList.add('show'); clearTimeout(this.flT); this.flT = setTimeout(() => f.classList.remove('show'), ms); }
    this.banner.textContent = text;
    this.banner.hidden = false;
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => { this.banner.hidden = true; }, ms);
  }

  /* ---------------- Cinemática ---------------- */




  async start(opts = {}) {
    await this.load();
    const v = this.view;
    if (!v.now) return;
    // Si la caminata anterior iluminó la escena con la hora de la EVA, el descenso vuelve a la del alunizaje
    v.rover?.stop(); v.estacion?.quitar(); document.querySelector('.sim-informe')?.remove();
    v.tSalida = null;
    if (this._luzEva || v.cieloMovido) { this._luzEva = false; v.cieloMovido = false; await v.iluminarEn?.(v.tAlunizaje); }
    this.stop(true);
    this.active = true; this.locks = true;
    this.cineOutro = 0; this.tipped = false; this.q0 = null;
    this.cine = false; this.ended = false;
    this.fp = true; // siempre la cámara lateral alrededor de la nave
    this.endEl?.remove(); this.endEl = null;
    this.camP = null; this.distant = false; if (this.orb) Object.assign(this.orb, { az: 0, el: 0.16, zoom: 1 });
    this.t = 0; this.events = new Set(); this.log.innerHTML = '';
    this.hud.hidden = this.log.hidden = false;
    this.setSpeed(this.speed);

    // Punto de alunizaje: el centro del sitio; aproximación con el Sol a la espalda
    const sunAz = v.now.sun.az * Math.PI / 180;
    const toSun = new THREE.Vector3(Math.sin(sunAz), 0, -Math.cos(sunAz));
    this.u = toSun.clone().negate();                                  // dirección de vuelo
    this.side = new THREE.Vector3().crossVectors(UP, this.u).normalize();
    // El LM queda apoyado: la base de los platos está 0,103 unidades sobre el origen del modelo; se hunden 2 cm en el regolito
    this.target = new THREE.Vector3(0, v.groundY(0, 0) - 0.103 * S - 0.02, 0);

    // Trayectoria: descenso nominal del Apollo 11 (motor del equipo, guiado R-695 / perfil TN D-6846).
    // La escena muestra el final: desde 500 m de altura (P64) hasta el contacto.
    const T0 = this.target;
    const D = this.desc = descensoNominal(), M = D.muestras;
    const tA = M.find((q) => q.alturaM <= 500).tS, tB = D.eventos.inicioP66, tC = D.eventos.contacto;
    this.phases = [{ name: tr('P64 · Approach', 'P64 · Aproximación'), t0: tA, T: tB - tA }, { name: tr('P66 · Final descent', 'P66 · Descenso final'), t0: tB, T: tC - tB }];
    // Dónde se posa de verdad: el guiado sigue la trayectoria hasta el contacto, sin desvío ni control manual, y deja la
    // nave donde la lleva su error de navegación; el resultado depende del terreno ahí (aterrizaje.ts)
    this.rocks = v.detail?.rocks ?? []; // esta escena no tiene rocas sueltas: solo cuenta el relieve LOLA
    this.plan = planTouchdown(v, this.rocks, { lit: (v.now?.sun.frac ?? 0) >= 0.5 });
    const A = this.plan.final;
    this.target = new THREE.Vector3(A.x, A.hz.y - 0.103 * S - 0.02, A.z);
    this.result = null; this.tiltDeg = 0; this.touchH = 0; this.hzNow = null; this._zc = null;
    for (const [i, ph] of this.phases.entries()) { const a0 = this._state(i, 0), a1 = this._state(i, 1); Object.assign(ph, { p0: a0.p, v0: a0.v, p1: a1.p, v1: a1.v }); }
    this.fuel = this._state(0, 0).fuelS;

    this.phase = 0; this.ps = 0;
    this.state = 'descent';
    this.pos = this.phases[0].p0.clone();
    this.vel = this.phases[0].v0.clone();
    v.scene.add(this.lm, this.dust);
    this._buildPath();
    if (this.fp) {
      this.lfp.hidden = false; v.eva.root.style.visibility = 'hidden';
      const d = this.target.clone().sub(this.pos); v.eva.yaw = Math.atan2(-d.x, -d.z); v.eva.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) * 0.8;
    }
    v.astro.object.visible = false;
    v.astro.dust.visible = false;
    this.lm.position.copy(this.pos);
    // Cámara de persecución
    v.controls.target.copy(this.pos);
    v.camera.position.copy(this.pos).addScaledVector(this.u, -28).addScaledVector(this.side, 14).addScaledVector(UP, 6);

    if (this.cine) {
      this.cineEl.querySelector('[data-c=place]').textContent = `${(v.siteName ?? '').toUpperCase()} · ${new Date(v.time ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
      this.title(tr('Lunar south pole', 'Polo sur de la Luna'), v.siteName ?? '', 5000);
    }
    this.say('Houston', tr('Eagle, you are go for powered descent.', 'Águila, tienen luz verde para el descenso propulsado.'), true);
    if (this.cine) { /* el contexto va en los subtítulos y en el plano final */ }
    else if (!v.now.earth.visible) this.flash(tr('From this site the Earth is below the horizon: no direct link with Houston', 'Desde este sitio la Tierra está bajo el horizonte: no hay enlace directo con Houston'), 6000);
    else if (v.now.sun.frac < 0.5) this.flash(tr('The site is in shadow right now: landing without sunlight', 'El sitio está en sombra ahora mismo: alunizaje sin luz solar'), 5000);
  }

  /** Estado del LM en la fase i y el avance s (0–1), interpolando las muestras del descenso real. */
  _state(i, s) {
    const ph = this.phases[i], M = this.desc.muestras, dtS = M[1].tS - M[0].tS;
    const f = Math.min(M.length - 1.001, Math.max(0, (ph.t0 + s * ph.T - M[0].tS) / dtS)), k = Math.floor(f), w = f - k;
    const L = (key) => M[k][key] * (1 - w) + M[k + 1][key] * w;
    const alt = L('alturaM') - this.desc.muestras.at(-1).alturaM + PROBE, rng = L('alcanceM') - M.at(-1).alcanceM;
    const p = this.target.clone().addScaledVector(this.u, rng).addScaledVector(UP, alt);
    const v = this.u.clone().multiplyScalar(L('vHorizontalMs')).addScaledVector(UP, L('vVerticalMs'));
    const inc = (L('inclinacionGrados') * Math.PI) / 180, masa = L('masaKg'), emp = L('empuje');
    // Empuje inclinado hacia atrás (frenando); a = F/m
    const aT = UP.clone().multiplyScalar(Math.cos(inc)).addScaledVector(this.u, -Math.sin(inc)).multiplyScalar((emp * LM_APOLLO11.empujeNominalN) / masa);
    const fuelKg = LM_APOLLO11.combustibleKg - (LM_APOLLO11.masaInicialKg - masa);
    // Segundos de vuelo estacionario que da el combustible restante: m·g / (Isp·g0) kg/s
    const fuelS = fuelKg / ((masa * G) / (LM_APOLLO11.impulsoEspecificoS * 9.80665));
    return { p, v, aT, thrust: aT.length(), throttle: emp, fuelKg, fuelS };
  }

  skip() {
    if (this.state !== 'descent') return;
    this.phase = this.phases.length - 1; this.ps = 0.999;
    for (const k of ['alarm', 'go', 'p66', 'f60', 'f30', 'dust', 'alt300', 'alt150', 'alt80', 'alt40', 'alt20', 'alt10']) this.events.add(k);
  }

  stop(silent) {
    const v = this.view;
    if (this.lm) { v.scene.remove(this.lm, this.dust); if (this.flag) v.scene.remove(this.flag); }
    this.flag = null;
    if (this.pathG) { v.scene.remove(this.pathG); this.pathG = null; }
    if (this.lfp) this.lfp.hidden = true;
    v.caminata?.stop(); v.sonido?.motor(0);
    this._clearBoom();
    if (this.fp && v.eva) v.eva.root.style.visibility = '';
    this.fp = false; this.distant = false;
    this.active = false; this.locks = false; this.state = null; this.tipped = false;
    this.cineOutro = 0;
    this.lmPos = null;
    if (this.hud) this.hud.hidden = this.log.hidden = this.banner.hidden = true;
    if (v.astro) {
      v.astro.object.visible = true; v.astro.dust.visible = true;
      if (v.astro.pose?.Left) Object.assign(v.astro.pose, { wave: false });
    }
    if (!silent) v.lookAt?.('sun', 35);
  }

  update(dtReal) {
    if (!this.active) return;
    if (this.fp && this.view.eva?.briefing?.open) return; // la ficha del sitio va antes del descenso
    const fuera = this.state === 'eva' || this.state === 'rover'; // en la superficie: la cámara es de la caminata o del rover
    const dt = dtReal * (fuera ? 1 : this.speed);
    this.t += dt;
    const v = this.view;

    if (this.state === 'descent') this._descent(dt);
    else if (this.state === 'fall') this._fall(dt);
    else if (this.state === 'settle') this._settle(dt);
    else if (this.state === 'egress') this._egress(dt);

    if (this.boom) this._boomTick(dt); // la explosión sigue aunque la misión ya esté perdida
    this._dust(dt);
    if (this.fill) {
      const want = this.cine && (this.state === 'egress' || this.state === 'eva' || (this.state === 'settle' && this.settleT > 2.5)) ? 0.5 : 0;
      this.fill.intensity += (want - this.fill.intensity) * Math.min(1, dtReal * 2);
      this.fill.position.copy(this.lm.worldToLocal(v.camera.position.clone())); // ilumina desde la cámara
    }
    // El astronauta sigue dentro de la nave hasta la salida (también si su modelo termina de cargar ahora)
    if (this.state !== 'egress' && this.state !== 'eva') { v.astro.object.visible = false; v.astro.dust.visible = false; }
    if (this.cine) {
      if (this.cineOutro > 0) { // plano final: el astronauta saluda y la cámara se aleja
        this.cineOutro -= dtReal;
        v.astro.update(dtReal, 0);
        this._cineCam(dtReal);
        if (this.cineOutro <= 0) { this.setCine(false); this._releaseEva(); }
      } else if (!fuera) {
        const own = this._cineCam(dtReal);
        if (!own && Math.abs(v.camera.fov - 38) > 0.01) { v.camera.fov = 38; v.camera.updateProjectionMatrix(); }
        const tele = this.cineEl.querySelector('[data-c=tele]');
        tele.textContent = this.state === 'descent' || this.state === 'fall' ? `ALT ${fmt(Math.max(0, this.altitude()), this.altitude() < 20 ? 1 : 0)} m · V ${fmt(this.vel.y, 1)} m/s · ${tr('FUEL', 'COMB')} ${fmt(this.fuel)} s` : tr('ON THE SURFACE', 'EN LA SUPERFICIE');
      }
    } else if (this.fp && !fuera) {
      this._fpCam(dtReal);
    } else if (!fuera && this.state !== 'egress') {
      // Cámara: sigue al LM (el usuario puede girarla con el ratón)
      const delta = this.lm.position.clone().sub(v.controls.target);
      v.controls.target.add(delta);
      v.camera.position.add(delta);
      v.controls.update();
    }
    this._hud();
    this._pathUpdate(dtReal);
  }

  /** Primera persona: ojos en la ventana del comandante durante el descenso; en la escalera, los ojos del astronauta. */
  _fpCam(dt) {
    const v = this.view, e = v.eva, cam = v.camera;
    let eye, wantYaw, wantPitch;
    if (this.state === 'egress') {
      const a = v.astro.object, h = a.rotation.y, f = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
      let t = this.eT, i = 0; while (i < EG_T.length - 1 && t > EG_T[i]) { t -= EG_T[i]; i++; }
      // Baja de cara a la escalera, viendo los peldaños; en el último paso se da la vuelta (la cabeza gira con el cuerpo)
      eye = a.position.clone().addScaledVector(UP, 1.6 - 0.9 * (v.astro.pose?.drop || 0)).addScaledVector(f, i < 4 ? -0.3 : 0.1); // un paso atrás para que los peldaños no queden pegados al vidrio
      wantYaw = h + Math.PI; wantPitch = [-0.2, -0.42, -0.32, -0.5, -0.1][i]; // porche, primer peldaño, escalera, salto al plato, vuelta y paso al suelo
    } else {
      // Descenso visto de costado: la cámara vuela al lado de la nave, un poco lejos y algo por encima, y baja con ella
      this.distant = true;
      const ship = this.lm.position.clone().addScaledVector(UP, 2.5), alt = Math.max(0, this.altitude());
      const D = THREE.MathUtils.lerp(48, 115, Math.min(1, alt / 400)) * this.orb.zoom;       // se acerca al final para ver el contacto
      // Posición en la órbita: azimut 0 = de costado; el ratón la gira 360° alrededor de la nave
      const a0 = this.orb.az - 0.29, ce = Math.cos(this.orb.el);
      const off = this.side.clone().multiplyScalar(Math.cos(a0) * ce).addScaledVector(this.u, Math.sin(a0) * ce).addScaledVector(UP, Math.sin(this.orb.el));
      const want = ship.clone().addScaledVector(off, D).addScaledVector(UP, 3);
      want.y = Math.max(want.y, v.groundY(want.x, want.z) + 4);
      if (!this.camP) this.camP = want.clone(); else this.camP.lerp(want, Math.min(1, dt * 7));   // sigue a la nave sin tirones
      cam.position.copy(this.camP);
      if (this.shake > 0.01) { cam.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(this.shake * 0.4)); this.shake *= Math.exp(-dt * 3.5); }
      const gnd = new THREE.Vector3(ship.x, v.groundY(ship.x, ship.z), ship.z);
      cam.up.set(0, 1, 0); cam.lookAt(ship.clone().addScaledVector(UP, -Math.min(alt * 0.45, 5)));  // la nave casi al centro y el suelo asomando debajo
      const dist = cam.position.distanceTo(ship), fov = cam.fov + (38 - cam.fov) * Math.min(1, dt * 2);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      e.root.style.visibility = 'hidden';
      this._lfp(tr(`CHASE CAMERA · ${fmt(dist)} m FROM THE LANDER`, `CÁMARA DE SEGUIMIENTO · A ${fmt(dist)} m DE LA NAVE`));
      return;
    }
    if (this.distant) { this.distant = false; cam.fov = 70; cam.updateProjectionMatrix(); } // se abre la escotilla: al casco
    // La vista se dirige sola al punto de alunizaje, salvo si el usuario mueve el ratón (le deja mirar 2,5 s)
    if (performance.now() - (e._lookT || 0) > 2500) {
      const k = Math.min(1, dt * 2.2), dy = ((wantYaw - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      e.yaw += dy * k; e.pitch += (wantPitch - e.pitch) * k;
    }
    if (this.shake > 0.01) { eye.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shake * 0.08)); this.shake *= Math.exp(-dt * 3.5); }
    if (this.state === 'descent' && this.throttle > 0) eye.y += Math.sin(this.t * 37) * 0.004 * this.throttle; // vibración del motor
    cam.position.copy(eye); cam.rotation.set(e.pitch, e.yaw, 0, 'YXZ');
    e.root.style.visibility = 'hidden';
    this._lfp(tr('APOLLO · EGRESS', 'APOLLO · SALIDA'));
  }

  /** Lecturas del descenso en pantalla. */
  _lfp(sub) {
    const q = (k) => this.lfp.querySelector(`[data-f="${k}"]`), alt = Math.max(0, this.altitude());
    q('sub').textContent = sub;
    // Lo que hay bajo la nave en P66: el riesgo del terreno justo debajo (solo se informa: no hay control manual)
    const hzEl = q('haz'), hz = this.state === 'descent' && this.phase === 1 ? this.hzNow : null;
    hzEl.hidden = !hz;
    if (hz) {
      const c = ['ok', 'warn', 'bad'][gravedad(hz)];
      const html = `<small>${tr('BELOW THE LANDER', 'BAJO LA NAVE')}</small><b>${fmt(hz.tilt, 1)}°</b><span>${hz.rock > ROCK_SMALL ? tr(`${Math.round(hz.rock * 200)} cm boulder`, `roca de ${Math.round(hz.rock * 200)} cm`) : tr('no large rocks', 'sin rocas grandes')} · ${c === 'ok' ? tr('good spot', 'buen sitio') : c === 'warn' ? tr('would land tilted', 'quedaría inclinada') : tr('would tip over', 'volcaría')}</span>`;
      if (hzEl._h !== html) { hzEl._h = html; hzEl.className = 'sim-lfp-haz ' + c; hzEl.innerHTML = html; }
    }
    this._map();
    q('phase').textContent = this.state === 'descent' ? this.phases[this.phase].name : this.state === 'fall' ? (this.plan?.fault ? tr('Altitude error · falling', 'Error de altura · cayendo') : tr('Contact light · engine stop', 'Luz de contacto · motor apagado')) : this.state === 'settle' ? (this.result?.kind === 'tip' ? tr('Tipping over', 'Volcando') : this.result?.kind === 'crash' ? tr('Impact', 'Impacto') : tr('On the surface', 'En la superficie')) : this.state === 'lost' ? (this.result?.kind === 'crash' ? tr('Lander destroyed', 'Nave destruida') : tr('Lander tipped over', 'Nave volcada')) : tr('Egress', 'Salida');
    q('alt').textContent = `${fmt(alt, alt < 20 ? 1 : 0)} m`; q('altbar').style.transform = `scaleY(${Math.min(1, alt / 500).toFixed(3)})`;
    q('vs').textContent = `${fmt(this.vel.y, 1)} m/s`; q('hs').textContent = `${fmt(this._hspeed(), 1)} m/s`;
    q('thr').textContent = this.state === 'descent' ? `${fmt(this.throttle * 100)} %` : tr('off', 'apagado');
    q('fuel').textContent = `${fmt(this.fuel)} s`; q('fuelp').classList.toggle('bad', this.fuel < 30);
    this.lfp.classList.toggle('egress', this.state === 'egress' || this.state === 'settle');
  }

  /** Mapa del descenso (vista desde arriba con el relieve real) y perfil de altura, con la nave en movimiento. */
  _map() {
    const now = performance.now(); if (now - (this._mapT || 0) < 90) return; this._mapT = now;
    const el = this.lfp.querySelector('.sim-lfp-map'), v = this.view, pts = this.pathPts; if (!pts) return;
    if (this._mapFor !== pts) { // una vez por alunizaje: encuadre, relieve sombreado y ruta completa
      this._mapFor = pts;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = Math.max(x1 - x0, z1 - z0) * 0.62 + 120;
      this._mb = { cx, cz, half }; const px = (x, z) => [110 + ((x - cx) / half) * 110, 110 + ((z - cz) / half) * 110];
      // Relieve: sombreado con el Sol del momento (datos LOLA de la escena)
      const cv = el.querySelector('canvas'), g = cv.getContext('2d'), N = 88, img = g.createImageData(N, N), D2 = Math.PI / 180, n = v.now;
      const sx = Math.cos(n.sun.el * D2) * Math.sin(n.sun.az * D2), sy = Math.sin(Math.max(4, n.sun.el) * D2), sz = -Math.cos(n.sun.el * D2) * Math.cos(n.sun.az * D2), st = (2 * half) / N;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = cx - half + (i + 0.5) * st, z = cz - half + (j + 0.5) * st;
        const dx = (v.groundY(x + st, z) - v.groundY(x - st, z)) / (2 * st), dz = (v.groundY(x, z + st) - v.groundY(x, z - st)) / (2 * st);
        const l = Math.hypot(dx, 1, dz), sh = Math.max(0, (-dx * sx + sy - dz * sz) / l), k = 18 + 150 * Math.min(1, sh * 2.2), o = (j * N + i) * 4;
        img.data[o] = k; img.data[o + 1] = k; img.data[o + 2] = k * 1.04; img.data[o + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = N; tmp.getContext('2d').putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, 220, 220);
      const line = pts.map((p) => px(p.x, p.z).map((q) => q.toFixed(1)).join(',')).join(' '), [tx, ty] = px(this.target.x, this.target.z);
      const kmPx = (1000 / half) * 110;
      el.querySelector('.mp svg').innerHTML = `<polyline class="all" points="${line}"/><polyline class="done" points=""/>
        <circle class="tg" cx="${tx}" cy="${ty}" r="7"/><circle class="tg" cx="${tx}" cy="${ty}" r="2.5"/>
        <g class="ship"><circle r="9" class="halo"/><path d="M0 -5L4 4L0 2L-4 4Z"/></g>
        <path class="sc" d="M${(110 - kmPx / 2).toFixed(1)} 198h${kmPx.toFixed(1)}"/><text x="110" y="191" text-anchor="middle">1 km</text><text x="110" y="20" text-anchor="middle">N</text>`;
      // Perfil: distancia al punto de alunizaje (derecha = contacto) contra altura
      const dist = (p) => this.target.clone().sub(p).dot(this.u), dMax = Math.max(...pts.map(dist)), hMax = Math.max(...pts.map((p) => p.y - this.target.y));
      this._pf = (p) => [8 + (1 - dist(p) / dMax) * 204, 66 - ((p.y - this.target.y) / hMax) * 58];
      const pl = pts.map((p) => this._pf(p).map((q) => q.toFixed(1)).join(',')).join(' ');
      // Velocidad: mismo eje horizontal que el perfil (distancia al sitio), de la velocidad inicial a casi cero al posarse
      const vMax = Math.max(...this.pathV), vy = (s) => 66 - (s / vMax) * 58;
      this._vf = (i) => [this._pf(pts[i])[0], vy(this.pathV[i])]; this._vy = vy;
      const vl = pts.map((_, i) => this._vf(i).map((q) => q.toFixed(1)).join(',')).join(' ');
      el.querySelector('.vf').innerHTML = `<path class="gnd" d="M8 66H212"/><polyline class="all" points="${vl}"/><polyline class="done" points=""/><circle class="dot" r="4"/>
        <text x="8" y="12">${fmt(vMax)} m/s</text><text x="212" y="12" text-anchor="end" class="now">—</text>`;
      // Perfil grande: cuadrícula de alturas y distancias, relieve real bajo la ruta, ruta planificada y el módulo lunar
      const W = 1200, H = 190, L = 54, Rr = 18, T = 14, B = 30, PW = W - L - Rr, PH = H - T - B;
      const hTop = Math.ceil((hMax * 1.08) / 100) * 100, dTop = Math.ceil(dMax / 250) * 250;
      const bx = (d) => L + (1 - d / dTop) * PW, by = (h) => T + PH * (1 - h / hTop);
      this._bp = (p) => [bx(dist(p)), by(p.y - this.target.y)]; this._by = by;
      let grid = '';
      for (let h = 0; h <= hTop; h += 100) grid += `<line x1="${L}" x2="${W - Rr}" y1="${by(h)}" y2="${by(h)}" class="${h ? 'g' : 'g0'}"/><text x="${L - 8}" y="${by(h) + 4}" text-anchor="end">${h} m</text>`;
      for (let d = 0; d <= dTop; d += 250) grid += `<line x1="${bx(d)}" x2="${bx(d)}" y1="${T}" y2="${T + PH}" class="g"/><text x="${bx(d)}" y="${H - 10}" text-anchor="middle">${d ? (d >= 1000 ? fmt(d / 1000, d % 1000 ? 2 : 0) + ' km' : d + ' m') : tr('SITE', 'SITIO')}</text>`;
      const terr = pts.map((q) => `${bx(dist(q)).toFixed(1)},${by(Math.max(-hTop * 0.05, v.groundY(q.x, q.z) - this.target.y)).toFixed(1)}`);
      const bl = pts.map((q) => this._bp(q).map((r) => r.toFixed(1)).join(',')).join(' ');
      this.lfp.querySelector('.sim-lfp-prof svg').innerHTML = `${grid}
        <polygon class="terr" points="${bx(dist(pts[0])).toFixed(1)},${T + PH} ${terr.join(' ')} ${bx(0).toFixed(1)},${T + PH}"/>
        <polyline class="all" points="${bl}"/><polyline class="done" points=""/>
        <g class="tgt" transform="translate(${bx(0)} ${by(0)})"><circle r="6"/><circle r="2"/></g>
        <line class="drop" x1="0" x2="0" y1="0" y2="0"/>
        <g class="lm"><path class="fl" d="M-3 6l3 9l3 -9z"/><path class="ds" d="M-9 -2h18v7h-18z"/><path class="as" d="M-6 -11h12l2 9h-16z"/><path class="lg" d="M-9 5l-6 8M9 5l6 8M-17 13h5M12 13h5"/></g>
        <text class="tag" x="0" y="0">—</text>`;
      this._px = px;
    }
    // Cada fotograma (a 11 Hz): nave, tramo ya volado y punto en el perfil
    const p = this.lm.position, [sx2, sy2] = this._px(p.x, p.z), hd = (Math.atan2(this.u.x, -this.u.z) * 180) / Math.PI;
    el.querySelector('.ship').setAttribute('transform', `translate(${sx2.toFixed(1)} ${sy2.toFixed(1)}) rotate(${hd.toFixed(0)})`);
    const cur = this.state === 'descent' ? Math.round(this.phase * (this.pathN + 1) + this.ps * this.pathN) : pts.length - 1, done = pts.slice(0, cur + 1);
    el.querySelector('.mp .done').setAttribute('points', done.map((q) => this._px(q.x, q.z).map((r) => r.toFixed(1)).join(',')).join(' '));
    const fx = this._pf(this.state === 'descent' ? p : this.target)[0];
    // Perfil grande: tramo recorrido, el módulo lunar (inclinado como la nave), su vertical al suelo y la etiqueta
    const pr = this.lfp.querySelector('.sim-lfp-prof svg'), here = this.state === 'descent' || this.state === 'fall' ? p : this.target;
    pr.querySelector('.done').setAttribute('points', done.map((q) => this._bp(q).map((r) => r.toFixed(1)).join(',')).join(' '));
    const [bx2, by2] = this._bp(here), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.lm.quaternion);
    const tilt = (Math.atan2(up.dot(this.u), up.y) * 180) / Math.PI, gy = this._by(Math.max(0, v.groundY(here.x, here.z) - this.target.y));
    pr.querySelector('.lm').setAttribute('transform', `translate(${bx2.toFixed(1)} ${(by2 - 6).toFixed(1)}) rotate(${tilt.toFixed(1)})`);
    pr.querySelector('.fl').style.opacity = this.state === 'descent' && this.throttle > 0 ? 0.4 + 0.6 * this.throttle : 0;
    const dr = pr.querySelector('.drop'); dr.setAttribute('x1', bx2.toFixed(1)); dr.setAttribute('x2', bx2.toFixed(1)); dr.setAttribute('y1', (by2 + 8).toFixed(1)); dr.setAttribute('y2', gy.toFixed(1));
    const tg = pr.querySelector('.tag'), right = bx2 > 1000;
    tg.setAttribute('x', (bx2 + (right ? -22 : 22)).toFixed(1)); tg.setAttribute('y', (by2 - 14).toFixed(1)); tg.setAttribute('text-anchor', right ? 'end' : 'start');
    tg.textContent = `${fmt(Math.max(0, this.altitude()))} m · ${fmt(this.vel.length(), 1)} m/s`;
    // Velocidad: tramo recorrido y la nave con su velocidad real en este momento
    const spd = this.vel.length(), vd = el.querySelector('.vf .dot');
    el.querySelector('.vf .done').setAttribute('points', done.map((_, i) => this._vf(i).map((r) => r.toFixed(1)).join(',')).join(' '));
    vd.setAttribute('cx', fx.toFixed(1)); vd.setAttribute('cy', this._vy(Math.min(spd, Math.max(...this.pathV))).toFixed(1));
    el.querySelector('.vf .now').textContent = tr(`${fmt(spd, 1)} m/s now`, `${fmt(spd, 1)} m/s ahora`);
  }

  /** La trayectoria planificada en el mundo: línea del descenso, su sombra en el suelo, marcas de altura y el punto de alunizaje. */
  _buildPath() {
    const v = this.view;
    if (this.pathG) v.scene.remove(this.pathG);
    const g = (this.pathG = new THREE.Group()); g.name = 'trayectoria';
    const N = 120, pts = [];
    this.pathV = [];
    for (let i = 0; i < this.phases.length; i++) for (let j = 0; j <= N; j++) { const r = this._state(i, j / N); pts.push(r.p); this.pathV.push(r.v.length()); }
    this.pathPts = pts; this.pathN = N;
    const ice = 0x7fe6ff, amber = 0xffab5e, base = { transparent: true, depthWrite: false, fog: false };
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const dot = document.createElement('canvas'); dot.width = dot.height = 32; const c = dot.getContext('2d');
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(127,230,255,.9)'); gr.addColorStop(1, 'rgba(127,230,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
    // La ruta como tubo con grosor real (una línea de 1 px se pierde vista desde lejos): el tramo recorrido queda atenuado y el que falta, brillante
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), segs = 400, R = 6;
    this.pathSegs = segs; this.pathRad = R;
    this.pathLen = [0]; for (let i = 1; i < pts.length; i++) this.pathLen.push(this.pathLen[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.pathTubeAll = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.32, R, false), new THREE.MeshBasicMaterial({ ...base, color: ice, opacity: 0.28 }));
    this.pathLine = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.42, R, false), new THREE.MeshBasicMaterial({ ...base, color: ice, opacity: 0.95 }));
    this.pathTubeAll.frustumCulled = this.pathLine.frustumCulled = false;
    this.pathDots = new THREE.Points(geo, new THREE.PointsMaterial({ ...base, color: 0xffffff, size: 7, sizeAttenuation: false, map: new THREE.CanvasTexture(dot) }));
    const gp = pts.map((p) => new THREE.Vector3(p.x, v.groundY(p.x, p.z) + 0.5, p.z));
    this.pathGround = new THREE.Line(new THREE.BufferGeometry().setFromPoints(gp), new THREE.LineDashedMaterial({ ...base, color: amber, opacity: 0.75, dashSize: 6, gapSize: 5 }));
    this.pathGround.computeLineDistances();
    // Punto de alunizaje: dos anillos en el suelo y una columna de luz
    const ty = v.groundY(this.target.x, this.target.z) + 0.2, ring = (r0, r1) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...base, color: amber, opacity: 0.9, side: THREE.DoubleSide })); m.position.set(this.target.x, ty, this.target.z); return m; };
    this.pathRing = ring(9, 10.4); const r2 = ring(3, 3.7);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(this.target.x, ty, this.target.z), new THREE.Vector3(this.target.x, ty + 160, this.target.z)]), new THREE.LineBasicMaterial({ ...base, color: amber, opacity: 0.8 }));
    g.add(this.pathTubeAll, this.pathLine, this.pathDots, this.pathGround, this.pathRing, r2, beam);
    // Marcas de altura sobre la línea
    this.pathMarks = []; this.pathSprites = [];
    const label = (txt) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d'); x.font = '600 34px "JetBrains Mono", monospace'; x.fillStyle = '#7fe6ff'; x.textBaseline = 'middle'; x.fillText(txt, 8, 32); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ ...base, map: new THREE.CanvasTexture(cv), sizeAttenuation: false })); sp.scale.set(0.09, 0.0225, 1); sp.center.set(0, 0.5); this.pathSprites.push(sp); return sp; };
    for (const h of [400, 300, 200, 100, 50, 20]) {
      const i = pts.findIndex((p) => p.y - this.target.y <= h); if (i < 0) continue;
      const sp = label(`— ${h} m`); sp.position.copy(pts[i]); g.add(sp); this.pathMarks.push({ sp, i });
    }
    const tl = label(tr('— TOUCHDOWN', '— CONTACTO')); tl.material.color.set(amber); tl.position.set(this.target.x, ty + 14, this.target.z); g.add(tl);
    v.scene.add(g);
  }

  /** Muestra solo el tramo que queda por delante y hace latir el punto de alunizaje. */
  _pathUpdate(dt) {
    if (!this.pathG || !this.pathG.visible) return;
    const n = this.pathPts.length, flying = this.state === 'descent', shown = flying || this.state === 'fall' || this.state === 'settle';
    const cur = flying ? Math.round(this.phase * (this.pathN + 1) + this.ps * this.pathN) + 2 : n;
    const start = Math.min(n - 2, cur);
    // Tubo: el tramo que falta se dibuja desde la posición de la nave (por longitud recorrida); el completo queda tenue debajo
    const seg = Math.min(this.pathSegs - 1, Math.floor((this.pathLen[Math.min(n - 1, start)] / this.pathLen[n - 1]) * this.pathSegs)), per = this.pathRad * 6;
    this.pathLine.geometry.setDrawRange(seg * per, (this.pathSegs - seg) * per);
    this.pathLine.visible = flying; this.pathTubeAll.visible = shown;
    for (const o of [this.pathDots, this.pathGround]) { o.visible = shown; o.geometry.setDrawRange(flying ? start : 0, flying ? n - start : n); }
    // Las etiquetas no deben crecer con el teleobjetivo: se escalan con el ángulo de visión de la cámara de seguimiento
    const kf = this.distant ? Math.tan((this.view.camera.fov * Math.PI) / 360) / Math.tan(Math.PI / 6) : 1;
    for (const sp of this.pathSprites) sp.scale.set(0.09 * kf, 0.0225 * kf, 1);
    let nMark = 0; for (const m of this.pathMarks) { const on = flying && m.i >= start && nMark < 1; m.sp.visible = on; if (on) nMark++; } // solo la próxima marca: si no, se amontonan a lo lejos
    const k = 1 + 0.08 * Math.sin(this.t * 4); this.pathRing.scale.set(k, 1, k);
    if (this.state === 'settle' && this.settleT > 3) this.pathG.visible = false;
  }

  /** Tarjeta final: contacto, combustible y tiempo; se puede volver a volar. */
  _end() {
    const v = this.view, card = document.createElement('div'), R = this.result, P = this.plan;
    const miss = Math.hypot(P.final.x - P.planned.x, P.final.z - P.planned.z);
    v.alunizaje = { kind: R.kind, touchV: this.touchV ?? 0, tilt: this.tiltDeg ?? 0, miss, fuelS: this.fuel ?? 0, fuelKg: this.fuelKg ?? 0, t: this.t }; // para el informe final
    card.className = 'sim-lfp-end ' + R.kind;
    card.innerHTML = `<small>${R.kind === 'tip' || R.kind === 'crash' ? tr('MISSION LOST', 'MISIÓN PERDIDA') : tr('TOUCHDOWN', 'CONTACTO')} · ${v.siteName ?? ''}</small><b>${R.kind === 'ok' ? ((v.plan?.tipo ?? 'tripulada') === 'tripulada' ? tr('The Eagle has landed', 'El Águila ha alunizado') : tr('The lander has landed', 'El módulo ha alunizado')) : R.title}</b>
      ${R.kind === 'ok' ? '' : `<p>${R.why}</p>`}${R.real ? `<p class="real">${R.real}</p>` : ''}
      ${R.kind === 'crash' ? `<p class="why2">${tr('The site was not to blame: the altitude calculation failed, and no landing gear survives that speed.', 'El sitio no tuvo la culpa: falló el cálculo de la altura, y a esa velocidad ningún tren de aterrizaje aguanta.')}</p>` : ''}
      ${R.kind === 'tip' ? `<p class="why2">${P.lit ? tr('The lander followed the trajectory down to where the guidance took it, and the ground there would not hold it.', 'La nave siguió la trayectoria hasta donde la llevó el guiado, y el terreno ahí no la sostuvo.') : tr('The site was in shadow: without light there was no way to see the ground below.', 'El sitio estaba en sombra: sin luz no había forma de ver el suelo.')}</p>` : ''}
      <dl><div><dt>${tr('Contact speed', 'Velocidad de contacto')}</dt><dd>${fmt(this.touchV ?? 0, 1)} m/s</dd></div><div><dt>${tr('Footpad tilt', 'Inclinación de las patas')}</dt><dd>${fmt(this.tiltDeg ?? 0, 1)}°</dd></div>
      <div><dt>${tr('Off target', 'Desvío del objetivo')}</dt><dd>${fmt(miss)} m</dd></div><div><dt>${tr('Fuel left', 'Combustible restante')}</dt><dd>${fmt(Math.max(0, this.fuelKg ?? 0))} kg · ${fmt(Math.max(0, this.fuel ?? 0))} s</dd></div>
      <div><dt>${tr('Powered descent', 'Descenso propulsado')}</dt><dd>${clock(this.t)}</dd></div><div><dt>${tr('Earth link', 'Enlace con la Tierra')}</dt><dd>${v.now?.earth.visible ? tr('direct', 'directo') : tr('below the horizon', 'bajo el horizonte')}</dd></div></dl>
      <div class="sim-lfp-end-acts">${R.kind === 'tip' || R.kind === 'crash' ? '' : v.plan?.tipo === 'rover' ? `<button type="button" data-act="rover">${tr('Deploy the rover', 'Desplegar el rover')}</button>` : v.plan?.tipo === 'fija' ? `<button type="button" data-act="equipo">${tr('Deploy panel and antenna', 'Desplegar panel y antena')}</button><button type="button" data-act="informe" class="sec">${tr('Mission report', 'Informe de la misión')}</button>` : `<button type="button" data-act="out">${tr('Step outside', 'Salir a caminar')}</button>`}
        <button type="button" data-act="again" class="${R.kind === 'tip' || R.kind === 'crash' ? '' : 'sec'}">${tr('Fly the descent again', 'Volar el descenso otra vez')}</button></div>`;
    card.addEventListener('click', (e) => {
      const act = e.target.closest?.('button')?.dataset.act;
      if (act === 'again') this.start();
      if (act === 'out') { card.remove(); this.endEl = null; this._startEgress(); }
      if (act === 'equipo') void v.estacion?.desplegar(this.lmPos.x + 8, this.lmPos.z + 8, v.tAlunizaje);
      if (act === 'rover') { card.remove(); this.endEl = null; this._startRover(); }
      if (act === 'informe') mostrarInforme(v, datosFija(v), { volar: () => this.start(), planificador: () => { location.href = /planificar-mision/.test(document.referrer) ? document.referrer : '/planificar-mision.html'; } });
    });
    v.host.append(card); this.endEl = card;
  }

  /* ---------------- Salida y primer paso ---------------- */

  /** Misión con rover: baja por la rampa y se conduce por la ruta del plan (rover.ts), a la luz de la hora planificada. */
  _startRover() {
    const v = this.view;
    this.state = 'rover'; this.locks = false; this.lfp.hidden = true;
    if (this.pathG) this.pathG.visible = false;
    if (this.fp && v.eva) v.eva.root.style.visibility = '';
    this.fp = false; this.distant = false;
    const h = v.plan?.evaH ?? 0;
    v.tSalida = v.tAlunizaje + h * 3600e3; // desde aquí corre el reloj de la EVA o del recorrido
    if (h > 0 && !this._luzEva && v.iluminarEn) { this._luzEva = true; void v.iluminarEn(v.tAlunizaje + h * 3600e3); }
    v.rover?.start(this.lmPos, Math.atan2(this.u.x, this.u.z), { lm: this.lm });
  }

  /** Abre la escotilla: el astronauta sale de espaldas al porche y baja la escalera (en primera persona). */
  _startEgress() {
    const v = this.view;
    this.state = 'egress'; this.eT = 0;
    // La EVA sale a la hora del plan: la escena pasa al Sol y la Tierra de ese momento (motor del Planificador)
    const h = v.plan?.evaH ?? 0;
    v.tSalida = v.tAlunizaje + h * 3600e3; // desde aquí corre el reloj de la EVA o del recorrido
    if (h > 0 && !this._luzEva && v.iluminarEn) {
      this._luzEva = true;
      this.flash(tr(`EVA as planned: ${h} h after landing. Light, Sun and Earth of that moment.`, `EVA según el plan: ${h} h después del alunizaje. Luz, Sol y Tierra de ese momento.`), 6000);
      void v.iluminarEn(v.tAlunizaje + h * 3600e3);
    }
    const m = new THREE.Matrix4().compose(this.lm.position, this.lm.quaternion, new THREE.Vector3(1, 1, 1));
    this.eg = Object.fromEntries(Object.entries(EG).map(([k, p]) => [k, new THREE.Vector3(...p).applyMatrix4(m)]));
    const g = new THREE.Vector3(0, 0, 3.05 * S + 1.15).applyMatrix4(m);
    g.y = v.groundY(g.x, g.z);
    this.eg.ground = g;
    this.path = [g]; // punto donde queda de pie al terminar
    v.astro.object.visible = !this.fp; v.astro.dust.visible = true; // en primera persona se baja con sus ojos: el cuerpo no se dibuja
    v.controls.target.copy(this.eg.hatch).add(new THREE.Vector3(0, 1, 0));
    v.camera.position.copy(v.controls.target).addScaledVector(this.u, 6.4).addScaledVector(this.side, 3.9).add(new THREE.Vector3(0, 0.3, 0));
    this.say('Armstrong', tr('Hatch open. Backing out onto the porch.', 'Escotilla abierta. Salgo de espaldas al porche.'));
  }

  /** Salida: porche (agachado, de espaldas) → escalera peldaño a peldaño → salto al plato → primer paso. */
  _egress(dt) {
    const v = this.view, a = v.astro, E = this.eg;
    this.eT += dt;
    let t = this.eT, i = 0;
    while (i < EG_T.length && t > EG_T[i]) { t -= EG_T[i]; i++; }
    if (i >= EG_T.length) { this._firstStep(); return; }
    const k = t / EG_T[i], e = k * k * (3 - 2 * k);
    const facing = Math.atan2(-this.u.x, -this.u.z); // de cara al LM, como bajaban en Apollo
    const once = (key, fn) => { if (!this.events.has(key)) { this.events.add(key); fn(); } };
    let p, head = facing, speed = 0;
    if (i === 0) p = E.hatch.clone().lerp(E.porch, e); // sale agachado por la escotilla
    else if (i === 1) { // baja el primer pie a la escalera, agarrado a los pasamanos
      p = E.porch.clone().lerp(E.top, e);
      once('eg1', () => this.say('Armstrong', tr('Going down the ladder.', 'Bajando por la escalera.')));
    } else if (i === 2) { // un peldaño cada vez
      const f = k * RUNGS, n = Math.min(RUNGS - 1, Math.floor(f)), c = f - n;
      p = E.top.clone().lerp(E.bottom, (n + sstep(0.2, 0.9, c)) / RUNGS);
      if (k > 0.55) once('eg2', () => this.say('Armstrong', tr("I'm at the foot of the ladder. The LM footpads are only sunk in a few centimeters.", 'Estoy al pie de la escalera. Las patas del LM se hundieron solo unos centímetros.')));
    } else if (i === 3) { // salto del último peldaño al plato (queda a casi un metro)
      const j = Math.min(1, k / 0.55), je = j * j * (3 - 2 * j);
      p = E.bottom.clone().lerp(E.pad, je);
      p.y += Math.sin(Math.PI * j) * 0.32;
      if (k > 0.7) once('eg3', () => this.say('Armstrong', tr("I'm going to step off the pad now.", 'Voy a bajar del plato ahora.')));
    } else { // primer paso sobre el regolito, dándose la vuelta
      p = E.pad.clone().lerp(E.ground, e);
      p.y += Math.sin(Math.PI * k) * 0.1;
      head = facing + Math.PI * sstep(0.35, 1, k);
      speed = 1.0;
    }
    a.object.position.copy(p);
    v.heading = head;
    a.object.rotation.y = head;
    a.update(dt, speed);
  }

  /** Primer paso: empieza la caminata con el casco (caminata.ts). */
  _firstStep() {
    const v = this.view;
    this.state = 'eva'; this.locks = false;
    this.lfp.hidden = true;
    if (this.pathG) this.pathG.visible = false;
    v.caminata?.start(this.path.at(-1), v.heading, this.lmPos, { lm: this.lm, result: this.result });
    this.say('Armstrong', tr("That's one small step for a man, one giant leap for mankind.", 'Es un pequeño paso para un hombre, un gran salto para la humanidad.'));
  }

  _orient(aT) {
    // Eje del LM = dirección del empuje (limitada a 40°); el frente mira hacia donde vuela
    let up = aT.lengthSq() > 1e-4 ? aT.clone().normalize() : UP.clone();
    const ang = up.angleTo(UP);
    if (ang > 0.7) up = UP.clone().lerp(up, 0.7 / ang).normalize();
    const fwd = this.u.clone().addScaledVector(up, -this.u.dot(up)).normalize();
    const x = new THREE.Vector3().crossVectors(up, fwd);
    this.lm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fwd));
  }

  _engine(throttle) {
    this.view.sonido?.motor(this.state === 'descent' ? throttle : 0); // el motor se oye por la estructura
    this.throttle = throttle;
    this.glow.visible = throttle > 0;
    this.glow.scale.setScalar(1.6 + 2.2 * throttle);
    this.engineLight.intensity = throttle > 0 ? 40 + 120 * throttle : 0;
    for (const m of this.bell) m.emissiveIntensity = throttle > 0 ? 1.5 + 4 * throttle : 0; // tobera incandescente
  }

  _descent(dt) {
    const ph = this.phases[this.phase];
    this.ps += dt / ph.T;
    if (this.ps >= 1) {
      if (this.phase < this.phases.length - 1) { this.phase++; this.ps = 0; return; }
      // Luz de contacto (posición exacta al final de la trayectoria, también al saltar)
      this.pos.copy(this.phases.at(-1).p1);
      this.lm.position.copy(this.pos);
      this.state = 'fall';
      this._engine(0);
      const F = this.plan?.fault;
      if (F) { // el guiado cree que ya tocó el suelo y apaga el motor alto
        this.flash(tr(`ALTITUDE ERROR · ENGINE CUT OFF AT ${Math.round(F.cutM)} m`, `ERROR DE ALTURA · MOTOR APAGADO A ${Math.round(F.cutM)} m`), 4000);
        this.say('Aldrin', tr('The engine shut down! We\'re still in the air!', '¡El motor se apagó! ¡Seguimos en el aire!'));
        this.view.eva?.sfx?.programAlarm?.();
        avisarEva('aviso-critico', tr(`Danger. Altitude error. The guidance shut down the engine at ${Math.round(F.cutM)} meters. We are falling.`, `Peligro. Error de altura. El guiado apagó el motor a ${Math.round(F.cutM)} metros. Estamos cayendo.`));
      } else {
        this.flash(tr('CONTACT LIGHT · ENGINE STOP', 'LUZ DE CONTACTO · MOTOR APAGADO'));
        this.say('Aldrin', tr('Contact light.', 'Luz de contacto.'));
        this.say('Armstrong', tr('Shutdown.', 'Apagado.'));
      }
      this.vel.set(0, -0.6, 0);
      this.pos.y += this.plan?.cutoffExtra ?? 0; // la luz de contacto llegó antes o después de lo debido
      this._orient(UP);
      return;
    }
    const r = this._state(this.phase, this.ps);
    this.pos.copy(r.p); this.vel.copy(r.v);
    if (this.phase === 1) this.hzNow = hazardAt(this.view, this.pos.x, this.pos.z, this.rocks); // lo que hay bajo la nave
    this.lm.position.copy(this.pos);
    this._orient(r.aT);
    this.fuel = r.fuelS; this.fuelKg = r.fuelKg;
    this._engine(r.throttle);

    // Eventos de radio (adaptados de la transcripción de Apollo 11)
    const alt = this.altitude();
    const ev = (k, fn) => { if (!this.events.has(k)) { this.events.add(k); fn(); } };
    if (this.t > 6) ev('alarm', () => { this.say('Armstrong', tr('Program alarm. It\'s a 1202.', 'Alarma de programa. Es una 1202.')); this.flash(tr('ALARM 1202', 'ALARMA 1202'), 2500); });
    if (this.t > 12) ev('go', () => this.say('Houston', tr('We\'re go on that alarm.', 'Seguimos adelante con esa alarma.'), true));
    if (this.phase === 1) ev('p66', () => {
      // Aviso del terreno donde nos va a dejar el guiado (sin control manual: solo se informa)
      const P = this.plan, a = P.final.hz, g = gravedad(a), rocks = a.rock > ROCK_SMALL;
      const what = tr(rocks ? `${Math.round(a.rock * 200)} cm boulders` : `a ${fmt(a.tilt, 1)}° slope`, rocks ? `rocas de ${Math.round(a.rock * 200)} cm` : `${fmt(a.tilt, 1)}° de inclinación`);
      if (!P.lit) { this.say('Aldrin', tr('We\'re in shadow: no view of the ground, only the laser altimeter.', 'Estamos en sombra: no vemos el suelo, solo el altímetro láser.')); this.flash(tr('P66 · NO SUNLIGHT · LANDING BLIND', 'P66 · SIN LUZ · DESCENSO A CIEGAS'), 3500); }
      else { this.say('Armstrong', g ? tr(`The landing point has ${what}. Staying on the trajectory.`, `El punto de alunizaje tiene ${what}. Seguimos la trayectoria.`) : tr('Clear ground below. Continuing down.', 'Suelo despejado debajo. Seguimos bajando.')); this.flash(tr('P66 · FINAL DESCENT', 'P66 · DESCENSO FINAL'), 2500); }
      // A EVA solo le llega lo que es un aviso de verdad: sombra, quedaría inclinada o volcaría ("aviso-critico")
      if (!P.lit) avisarEva('aviso-critico', tr('We are in shadow. I cannot see the ground, only the laser altimeter.', 'Estamos en sombra. No veo el suelo, solo el altímetro láser.'));
      else if (g === 2) avisarEva('aviso-critico', a.rock > ROCK_BIG ? tr('Danger. The landing point has a large boulder. We could tip over.', 'Peligro. En el punto de alunizaje hay una roca grande. Podríamos volcar.')
        : tr(`Danger. The landing point has a ${Math.round(a.tilt)} degree slope. We could tip over.`, `Peligro. El punto de alunizaje tiene ${Math.round(a.tilt)} grados de inclinación. Podríamos volcar.`));
      else if (g === 1) avisarEva('aviso-critico', tr(`Caution. We will land tilted about ${Math.round(a.tilt)} degrees.`, `Cuidado. Quedaremos inclinados unos ${Math.round(a.tilt)} grados.`));
      this._zc = P.lit ? g : null;
    });
    // Durante P66, si lo que hay justo debajo pasa a ser peligroso, EVA lo dice (solo informa: no hay nada que pilotar)
    const hz = this.hzNow;
    if (hz && this.phase === 1 && this.plan.lit && this._zc != null && alt < 120) {
      const zc = gravedad(hz);
      if (zc !== this._zc) {
        if (zc === 2) avisarEva('aviso-critico', hz.rock > ROCK_BIG ? tr('Danger. Below us there is a large boulder. We would tip over.', 'Peligro. Debajo hay una roca grande. Volcaríamos.')
          : tr(`Danger. Below us there is a ${Math.round(hz.tilt)} degree slope. We would tip over.`, `Peligro. Debajo hay ${Math.round(hz.tilt)} grados de pendiente. Volcaríamos.`));
        this._zc = zc;
      }
    }
    if (this.fuel < 60) ev('f60', () => this.say('Houston', tr('60 seconds.', '60 segundos.'), true));
    if (this.fuel < 30) ev('f30', () => this.say('Houston', tr('30 seconds.', '30 segundos.'), true));
    if (alt < 35) ev('dust', () => this.say('Aldrin', tr('Picking up some dust.', 'Estamos levantando algo de polvo.')));
    for (const h of [300, 150, 80, 40, 20, 10]) {
      if (alt < h) ev('alt' + h, () => this.say('Aldrin', tr(`${h} meters, down at ${fmt(-this.vel.y, 1)} m/s, ${fmt(this._hspeed(), 1)} forward.`, `${h} metros, bajando a ${fmt(-this.vel.y, 1)} m/s, ${fmt(this._hspeed(), 1)} adelante.`)));
    }
  }

  _fall(dt) {
    this.vel.y -= G * dt;
    this.pos.addScaledVector(this.vel, dt);
    const ground = this.target.y;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.touchV = -this.vel.y; this.touchH = Math.hypot(this.vel.x, this.vel.z);
      this.view.sonido?.golpe(Math.min(1, this.touchV / 3)); this.view.sonido?.motor(0);
      this.shake = 0.7; // sacudida de cámara en el contacto
      this.vel.set(0, 0, 0);
      this.state = 'settle'; this.settleT = 0;
    }
    this.lm.position.copy(this.pos);
  }

  _settle(dt) {
    this.settleT += dt;
    const v = this.view, hz = this.plan.final.hz;
    if (!this.result) { // el resultado lo deciden el terreno bajo las patas y la velocidad de contacto
      const R = (this.result = outcome(hz, this.touchV, this.touchH, this.plan.fault));
      if (R.kind === 'crash') { this._explode(); this.flash(tr('IMPACT · SIGNAL LOST', 'IMPACTO · SEÑAL PERDIDA'), 5000); }
      this.q0 = this.lm.quaternion.clone();
      const down = new THREE.Vector3(-hz.gx, 0, -hz.gz); if (down.lengthSq() < 1e-6) down.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      this.tipAxis = new THREE.Vector3().crossVectors(UP, down.normalize()).normalize();
      this.tiltDeg = Math.min(hz.tilt, 25);
      if (R.kind === 'tip') { this.say('Aldrin', tr('We\'re going over!', '¡Nos vamos de lado!')); this.flash(tr('THE LANDER IS TIPPING OVER', 'LA NAVE ESTÁ VOLCANDO'), 4000); }
      // EVA: el nominal con su festejo; lo demás, como aviso crítico (corta lo que esté diciendo)
      if (R.kind === 'ok') avisarEva('aterrizaje-nominal');
      else avisarEva('aviso-critico', {
        tilt: tr(`We are down, but tilted ${Math.round(this.tiltDeg)} degrees. Panels and antenna are misaligned.`, `Estamos abajo, pero inclinados ${Math.round(this.tiltDeg)} grados. Paneles y antena desalineados.`),
        hard: tr(`Hard landing, at ${this.touchV.toFixed(1)} meters per second. The landing gear may be damaged.`, `Aterrizaje duro, a ${this.touchV.toFixed(1).replace('.', ',')} metros por segundo. El tren de aterrizaje puede estar dañado.`),
        tip: tr('The lander is tipping over. Mission lost.', 'La nave está volcando. Misión perdida.'),
        crash: tr('Impact. The descent stage ruptured and the propellant ignited. Mission lost.', 'Impacto. La etapa de descenso se rompió y el propelente se encendió. Misión perdida.'),
      }[R.kind]);
    }
    const R = this.result;
    if (R.kind === 'crash') {
      if (this.settleT > 6 && !this.tipped) {
        this.tipped = true; this.state = 'lost';
        this.say(tr('Telemetry', 'Telemetría'), tr('No signal from the lander. Mission lost.', 'Sin señal de la nave. Misión perdida.'));
        this.ended = true; this._end();
      }
      return;
    }
    if (R.kind === 'tip') {
      const k = Math.min(1, this.settleT / 4);
      this.lm.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(this.tipAxis, k * k * 1.3).multiply(this.q0));
      this.lm.position.y = this.target.y + Math.sin(k * 1.3) * 1.6;
      if (this.settleT > 6 && !this.tipped) {
        this.tipped = true; this.state = 'lost';
        this.say(tr('Telemetry', 'Telemetría'), tr('Lander tipped over. Panels and antenna off-pointed. Mission lost.', 'Nave volcada. Paneles y antena sin orientación. Misión perdida.'));
        this.ended = true; this.lmPos = this.lm.position.clone(); this._end();
      }
      return;
    }
    // Se apoya sobre el terreno: se inclina como el plano de las patas y los amortiguadores rebotan
    const k0 = Math.min(1, this.settleT / 0.6);
    this.lm.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(this.tipAxis, (this.tiltDeg * Math.PI / 180) * k0).multiply(this.q0));
    const k = Math.exp(-this.settleT * 3) * Math.sin(this.settleT * 9) * 0.06 * Math.min(1, this.touchV / 2);
    this.lm.position.y = this.target.y - Math.abs(k);
    const ev = (key, at, fn) => { if (this.settleT > at && !this.events.has(key)) { this.events.add(key); fn(); } };
    ev('landed', 1.2, () => {
      const site = this.view.siteName || tr('the site', 'el sitio');
      if (R.kind === 'ok') { this.say('Armstrong', tr(`Houston, ${site} Base here. The Eagle has landed.`, `Houston, aquí Base ${site}. El Águila ha alunizado.`)); this.flash(tr('THE EAGLE HAS LANDED', 'EL ÁGUILA HA ALUNIZADO'), 4000); }
      else { this.say('Armstrong', R.kind === 'hard' ? tr(`Houston, we're down at ${site}, but that was a hard hit.`, `Houston, alunizamos en ${site}, pero el golpe fue fuerte.`) : tr(`Houston, we're down at ${site}, but we're tilted ${fmt(this.tiltDeg, 1)}°.`, `Houston, alunizamos en ${site}, pero estamos inclinados ${fmt(this.tiltDeg, 1)}°.`)); this.flash(R.title.toUpperCase(), 4000); }
    });
    ev('reply', 4, () => this.say('Houston', R.kind === 'ok' ? tr('Roger. You got a bunch of guys about to turn blue. We\'re breathing again.', 'Entendido. Nos tenían a punto de ponernos azules. Respiramos de nuevo.') : `${tr('Roger.', 'Entendido.')} ${R.why}`, true));
    ev('summary', 5.5, () => this.say(tr('Telemetry', 'Telemetría'), tr(`Contact at ${fmt(this.touchV, 1)} m/s, footpads at ${fmt(this.tiltDeg, 1)}°, with ${fmt(Math.max(0, this.fuelKg), 0)} kg of fuel (${fmt(Math.max(0, this.fuel), 0)} s of hover).`, `Contacto a ${fmt(this.touchV, 1)} m/s, patas a ${fmt(this.tiltDeg, 1)}°, con ${fmt(Math.max(0, this.fuelKg), 0)} kg de combustible (${fmt(Math.max(0, this.fuel), 0)} s de vuelo estacionario).`)));
    if (this.settleT > 7 && !this.ended) { this.ended = true; this.lmPos = this.lm.position.clone(); this._end(); }
  }

  /**
   * La nave se estrella: destello y bola de fuego de los propelentes (en el vacío dura un instante y no hace humo),
   * escombros que vuelan en trayectorias balísticas a 1/6 g y una nube de regolito que se abre en anillo.
   */
  _explode() {
    const v = this.view, c = this.lm.position.clone(), g = new THREE.Group(); g.name = 'explosion';
    const add = { transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending };
    const light = new THREE.PointLight(0xffb060, 0, 600, 2); light.position.copy(c).add(new THREE.Vector3(0, 4, 0));
    // Bola de fuego: resplandor suave (degradado radial en sprites), no una esfera de borde duro
    const glow = (stops) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [o, col] of stops) gr.addColorStop(o, col); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ ...add, map: glow([[0, 'rgba(255,214,150,1)'], [0.35, 'rgba(255,140,50,.75)'], [0.7, 'rgba(160,50,10,.25)'], [1, 'rgba(0,0,0,0)']]) }));
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ ...add, map: glow([[0, 'rgba(255,255,245,1)'], [0.5, 'rgba(255,230,180,.6)'], [1, 'rgba(0,0,0,0)']]) }));
    fire.position.copy(light.position); core.position.copy(light.position);
    // Escombros: lámina dorada, estructura gris y piezas quemadas
    const N = 160, deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.35, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.6 }), N);
    const cols = [new THREE.Color(0xc9a24a), new THREE.Color(0x8d8f93), new THREE.Color(0x2a2724)], ds = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, up = 0.15 + Math.random() * 0.85, sp = 4 + Math.random() ** 1.6 * 24, h = Math.sqrt(1 - up * up);
      ds.push({ p: c.clone().add(new THREE.Vector3(0, 1 + Math.random() * 3, 0)), v: new THREE.Vector3(Math.cos(a) * h * sp, up * sp, Math.sin(a) * h * sp),
        q: new THREE.Quaternion().random(), w: new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 8), s: 0.15 + Math.random() ** 2 * 1.4, rest: false });
      deb.setColorAt(i, cols[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0]);
    }
    deb.frustumCulled = false; // las instancias salen volando lejos de la caja del cubo original
    // Regolito levantado: se abre en anillo y vuelve a caer (sin aire que lo sostenga)
    const M = 900, pos = new Float32Array(M * 3), dv = [];
    for (let i = 0; i < M; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 16;
      pos.set([c.x, c.y + 0.5, c.z], i * 3); dv.push(new THREE.Vector3(Math.cos(a) * sp, 0.5 + Math.random() * 5, Math.sin(a) * sp));
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = glow([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xa49d92, size: 1.4, map: dot, transparent: true, opacity: 0.8, depthWrite: false }));
    dust.frustumCulled = false;
    // Mancha quemada donde estaba la nave
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(9, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0a09, transparent: true, opacity: 0, depthWrite: false }));
    scorch.position.set(c.x, v.groundY(c.x, c.z) + 0.12, c.z);
    g.add(light, fire, core, deb, dust, scorch); v.scene.add(g);
    this.boom = { g, light, fire, core, deb, ds, dust, dv, scorch, t: 0 };
    this.lm.visible = false; if (this.dust) this.dust.visible = false;
    this.shake = 2.2;
    const sfx = v.eva?.sfx; sfx?.boom?.(); this.boomT = setTimeout(() => sfx?.static?.(1.4), 700);
  }

  _boomTick(dt) {
    const b = this.boom, v = this.view, t = (b.t += dt), m = new THREE.Matrix4(), sc = new THREE.Vector3();
    b.light.intensity = 2.2e5 * Math.exp(-t * 3);
    const r = 2 * (4 + 26 * (1 - Math.exp(-t * 5)));   // los sprites miden el diámetro
    b.fire.scale.setScalar(r); b.fire.material.opacity = Math.max(0, 0.95 * (1 - t / 1.3));
    b.core.scale.setScalar(r * 0.5); b.core.material.opacity = Math.max(0, 1 - t / 0.45);
    b.fire.visible = t < 1.3; b.core.visible = t < 0.45;
    b.scorch.material.opacity = Math.min(0.7, t * 2);
    for (let i = 0; i < b.ds.length; i++) {
      const d = b.ds[i];
      if (!d.rest) {
        d.v.y -= G * dt; d.p.addScaledVector(d.v, dt);
        d.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(d.w.x * dt, d.w.y * dt, d.w.z * dt)));
        const gy = v.groundY(d.p.x, d.p.z) + d.s * 0.15;
        if (d.p.y < gy) { d.p.y = gy; d.v.multiplyScalar(0.35); d.v.y = Math.abs(d.v.y) * 0.4; d.w.multiplyScalar(0.4); if (d.v.length() < 0.6) d.rest = true; }
      }
      b.deb.setMatrixAt(i, m.compose(d.p, d.q, sc.setScalar(d.s)));
    }
    b.deb.instanceMatrix.needsUpdate = true;
    const P = b.dust.geometry.attributes.position;
    for (let i = 0; i < b.dv.length; i++) {
      const dv = b.dv[i]; dv.y -= G * dt;
      const x = P.getX(i) + dv.x * dt, z = P.getZ(i) + dv.z * dt, gy = v.groundY(x, z) + 0.1; let y = P.getY(i) + dv.y * dt;
      if (y < gy) { y = gy; dv.set(0, 0, 0); }
      P.setXYZ(i, x, y, z);
    }
    P.needsUpdate = true; b.dust.material.opacity = Math.max(0, 0.8 * (1 - t / 8));
  }

  /** Quita la explosión y libera geometrías, materiales y texturas (al salir y al volver a volar). */
  _clearBoom() {
    clearTimeout(this.boomT);
    if (!this.boom) return;
    this.boom.g.removeFromParent();
    this.boom.g.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    this.boom.deb.dispose?.();
    this.boom = null;
    if (this.lm) this.lm.visible = true;
    if (this.dust) this.dust.visible = true;
  }

  _dust(dt) {
    const v = this.view, L = this.lm.position;
    const alt = this.altitude();
    const on = this.state === 'descent' && this.throttle > 0;
    if (on) {
      // Escape: chorro corto y brillante desde la tobera
      const nozzle = this.lm.localToWorld(new THREE.Vector3(0, 0.3 * S, 0));
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.lm.quaternion);
      this.exAcc = (this.exAcc || 0) + 420 * this.throttle * dt;
      for (; this.exAcc >= 1; this.exAcc--) {
        const sp = 28 + Math.random() * 16, j = () => (Math.random() - 0.5) * 3.5;
        this.exhaust.emit(nozzle.x, nozzle.y, nozzle.z, down.x * sp + j() + this.vel.x, down.y * sp + j() + this.vel.y, down.z * sp + j() + this.vel.z,
          0.14 + Math.random() * 0.16, 0.9, 2.6);
      }
      // Polvo: el chorro barre el regolito en una lámina que sale a ras del suelo (sin aire no hay nubes)
      if (alt < 40) {
        const ground = v.groundY(L.x, L.z), k = Math.pow(1 - alt / 40, 1.5);
        this.duAcc = (this.duAcc || 0) + 1700 * k * this.throttle * dt;
        for (; this.duAcc >= 1; this.duAcc--) {
          const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 3, sp = 12 + Math.random() * 30;
          this.dustFx.emit(L.x + Math.cos(a) * r, ground + 0.15, L.z + Math.sin(a) * r, Math.cos(a) * sp, 0.2 + Math.random() * 1.6, Math.sin(a) * sp,
            1.1 + Math.random() * 1.6, 1.0 + Math.random(), 4.5 + Math.random() * 5);
        }
      }
    }
    // Propulsores de control (RCS): ráfagas cortas en los cuatro grupos durante el control manual
    if (this.state === 'descent' && this.phase === 1 && Math.random() < dt * 7) {
      const q = this.lm.localToWorld(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 1.28 * S, 3.35 * S, (Math.random() < 0.5 ? -1 : 1) * 1.38 * S));
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]], d = dirs[Math.floor(Math.random() * 6)];
      for (let n = 0; n < 14; n++) { const sp = 9 + Math.random() * 9, j = () => (Math.random() - 0.5) * 2;
        this.exhaust.emit(q.x, q.y, q.z, d[0] * sp + j() + this.vel.x, d[1] * sp + j() + this.vel.y, d[2] * sp + j() + this.vel.z, 0.08 + Math.random() * 0.1, 0.25, 0.9); }
    }
    const flying = this.state === 'descent' || this.state === 'fall';
    this.beacon.visible = flying && this.t % 1 < 0.09;
    const gy = this.target ? this.target.y : 0, H = v.renderer.domElement.height;
    this.dustFx.update(dt, v.camera, H, G, () => gy - 0.3);
    this.exhaust.update(dt, v.camera, H);
  }

  altitude() {
    if (!this.lm) return 0;
    return this.lm.position.y - this.view.groundY(this.lm.position.x, this.lm.position.z);
  }

  _hspeed() { return Math.hypot(this.vel.x, this.vel.z); }

  _hud() {
    const q = (k) => this.hud.querySelector(`[data-k="${k}"]`);
    const n = this.view.now;
    const phase = { descent: this.phases[this.phase].name, fall: this.plan?.fault ? tr('Altitude error · falling', 'Error de altura · cayendo') : tr('Contact light · free fall', 'Luz de contacto · caída libre'), settle: tr('On the surface', 'En la superficie'),
      egress: tr('Egress (EVA)', 'Salida (EVA)'), eva: tr('Extravehicular activity', 'Actividad extravehicular'), lost: this.result?.kind === 'crash' ? tr('Lander destroyed · mission lost', 'Nave destruida · misión perdida') : tr('Lander tipped over · mission lost', 'Nave volcada · misión perdida') }[this.state];
    q('phase').textContent = phase;
    q('alt').textContent = `${fmt(Math.max(0, this.altitude()), this.altitude() < 20 ? 1 : 0)} m`;
    q('vs').textContent = `${fmt(this.vel.y, 1)} m/s`;
    q('hs').textContent = `${fmt(this._hspeed(), 1)} m/s`;
    q('thr').textContent = this.state === 'descent' ? `${fmt(this.throttle * 100)} %` : tr('off', 'apagado');
    q('fuel').textContent = `${fmt(this.fuel)} s`;
    q('fuel').classList.toggle('warn', this.fuel < 30);
    q('time').textContent = clock(this.t);
    if (n) {
      q('ctx').innerHTML = `<b>${this.view.siteName ?? ''}</b><br>
        ${tr('Sun', 'Sol')} ${fmt(n.sun.el, 1)}° · ${fmt(n.sun.frac * 100)} % visible<br>
        ${tr('Earth', 'Tierra')} ${fmt(n.earth.el, 1)}° · ${n.earth.visible ? `<span class="ok">${tr('direct link with Houston', 'enlace directo con Houston')}</span>` : `<span class="bad">${tr('no direct link', 'sin enlace directo')}</span>`}`;
    }
  }
}
