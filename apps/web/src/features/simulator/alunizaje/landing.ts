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
// mensajes de Houston no llegan. EVA (voz.ts) avisa en voz alta del arranque, del terreno en P66 y del resultado.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import lmUrl from './data/lunar-module.glb?url';
import { SoftParticles } from './particles';
import { LM_APOLLO11 } from './engine/descenso';
import { descensoNominal } from './engine/plan';
import { planTouchdown, outcome, hazardAt, gravedad, ROCK_SMALL, ROCK_BIG } from './aterrizaje';

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

const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
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
    // Tramo superior de la escalera: en el modelo queda un hueco entre el porche y el primer peldaño
    const white = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.2, roughness: 0.6 });
    const A = new THREE.Vector3(0, 1.93, 2.15), B = new THREE.Vector3(0, 2.34, 2.02); // de la escalera al borde del porche (unidades del modelo)
    const seg = (p, q, r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, p.distanceTo(q) * S, 8), white);
      m.position.copy(p).add(q).multiplyScalar(0.5 * S); m.quaternion.setFromUnitVectors(UP, q.clone().sub(p).normalize()); m.castShadow = true; this.lm.add(m); };
    for (const x of [-0.225, 0.135]) seg(A.clone().setX(x), B.clone().setX(x), 0.016);
    for (const t of [0.33, 0.72]) { const c = A.clone().lerp(B, t); seg(c.clone().setX(-0.225), c.clone().setX(0.135), 0.013); }
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
    hud.className = 'lander-hud';
    hud.innerHTML = `
      <div class="lh-title">APOLLO · ALUNIZAJE</div>
      <div class="lh-phase" data-k="phase"></div>
      <div class="lh-grid">
        <span>Altitud</span><b data-k="alt"></b>
        <span>Vel. vertical</span><b data-k="vs"></b>
        <span>Vel. horizontal</span><b data-k="hs"></b>
        <span>Empuje</span><b data-k="thr"></b>
        <span>Combustible</span><b data-k="fuel"></b>
        <span>Tiempo</span><b data-k="time"></b>
      </div>
      <div class="lh-ctx" data-k="ctx"></div>
      <div class="lh-ctrl">
        <button data-speed="1">x1</button><button data-speed="2">x2</button><button data-speed="4">x4</button>
        <button data-act="skip">Saltar al contacto</button><button data-act="exit">Salir</button>
      </div>`;
    const log = document.createElement('div');
    log.className = 'lander-log';
    const banner = document.createElement('div');
    banner.className = 'lander-banner';
    host.append(hud, log, banner);
    this.hud = hud; this.log = log; this.banner = banner;
    // Primera persona: lecturas del descenso dentro del visor (el panel normal se oculta con el casco puesto)
    const lfp = document.createElement('div'); lfp.className = 'lfp'; lfp.hidden = true;
    lfp.innerHTML = `<div class="lfp-top"><small data-f="sub">APOLLO · POWERED DESCENT</small><b data-f="phase"></b></div>
      <div class="lfp-map"><small>DESCENT MAP</small><div class="mp"><canvas width="220" height="220"></canvas><svg viewBox="0 0 220 220"></svg></div><small>SPEED</small><svg class="pf vf" viewBox="0 0 220 74"></svg></div>
      <div class="lfp-prof"><small>ALTITUDE PROFILE · DISTANCE TO SITE</small><svg viewBox="0 0 1200 190"></svg></div>
      <div class="lfp-alt"><small>ALTITUDE</small><b data-f="alt">—</b><i class="lfp-tape"><u data-f="altbar"></u></i></div>
      <div class="lfp-r"><p><small>VERTICAL SPEED</small><b data-f="vs">—</b></p><p><small>HORIZONTAL SPEED</small><b data-f="hs">—</b></p>
        <p><small>THRUST</small><b data-f="thr">—</b></p><p data-f="fuelp"><small>FUEL</small><b data-f="fuel">—</b></p></div>
      <div class="lfp-haz" data-f="haz" hidden></div><div class="lfp-flash" data-f="flash"></div><div class="lfp-radio" data-f="radio"></div>
      <div class="lfp-keys"><span class="orb"><b>Drag</b>orbit the lander</span><span class="orb"><b>Wheel</b>zoom</span><span class="orb"><b>Enter</b>skip to touchdown</span></div>`;
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
    const linked = this.view.now?.earth.visible;
    const li = document.createElement('div');
    if (houston && !linked) {
      li.className = 'nolink';
      li.textContent = `[${clock(this.t)}] Houston: — no signal (the Earth is below this site's horizon) —`;
    } else {
      li.className = houston ? 'houston' : '';
      li.textContent = `[${clock(this.t)}] ${who}: ${text}`;
    }
    this.log.append(li);
    while (this.log.children.length > 7) this.log.firstChild.remove();
    if (this.fp && this.lfp) { // radio en el visor
      const r = this.lfp.querySelector('[data-f=radio]');
      r.textContent = li.textContent.replace(/^\[[^\]]+\]\s*/, ''); r.className = 'lfp-radio show ' + li.className;
      clearTimeout(this.radT); this.radT = setTimeout(() => r.classList.remove('show'), 5200);
      this.view.eva?.sfx?.radio(true);
    }
    if (this.cine) { // subtítulo
      const sub = this.cineEl.querySelector('.cine-sub');
      sub.textContent = li.textContent.replace(/^\[[^\]]+\]\s*/, '');
      sub.className = 'cine-sub show ' + li.className;
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
    this.phases = [{ name: 'P64 · Approach', t0: tA, T: tB - tA }, { name: 'P66 · Final descent', t0: tB, T: tC - tB }];
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
      this.title('Polo sur de la Luna', v.siteName ?? '', 5000);
    }
    this.say('Houston', 'Eagle, you are go for powered descent.', true);
    v.voz?.say(`Powered descent initiated toward ${v.siteName ?? 'the landing site'}. The guidance will fly us down the planned trajectory. I will warn you of any hazard.`, { prio: 1, key: 'start', cooldownS: 5 });
    if (this.cine) { /* el contexto va en los subtítulos y en el plano final */ }
    else if (!v.now.earth.visible) this.flash('From this site the Earth is below the horizon: no direct link with Houston', 6000);
    else if (v.now.sun.frac < 0.5) this.flash('The site is in shadow right now: landing without sunlight', 5000);
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
    v.voz?.stop();
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
    const dt = dtReal * (this.state === 'eva' ? 1 : this.speed);
    this.t += dt;
    const v = this.view;

    if (this.state === 'descent') this._descent(dt);
    else if (this.state === 'fall') this._fall(dt);
    else if (this.state === 'settle') this._settle(dt);
    else if (this.state === 'egress') this._egress(dt);

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
      } else if (this.state !== 'eva') {
        const own = this._cineCam(dtReal);
        if (!own && Math.abs(v.camera.fov - 38) > 0.01) { v.camera.fov = 38; v.camera.updateProjectionMatrix(); }
        const tele = this.cineEl.querySelector('[data-c=tele]');
        tele.textContent = this.state === 'descent' || this.state === 'fall' ? `ALT ${fmt(Math.max(0, this.altitude()), this.altitude() < 20 ? 1 : 0)} m · V ${fmt(this.vel.y, 1)} m/s · COMB ${fmt(this.fuel)} s` : 'EN LA SUPERFICIE';
      }
    } else if (this.fp && this.state !== 'eva') {
      this._fpCam(dtReal);
    } else if (this.state !== 'eva' && this.state !== 'egress') {
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
      this._lfp(`CHASE CAMERA · ${fmt(dist)} m FROM THE LANDER`);
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
    this._lfp('APOLLO · SALIDA');
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
      const html = `<small>BELOW THE LANDER</small><b>${fmt(hz.tilt, 1)}°</b><span>${hz.rock > ROCK_SMALL ? `${Math.round(hz.rock * 200)} cm boulder` : 'no large rocks'} · ${c === 'ok' ? 'good spot' : c === 'warn' ? 'would land tilted' : 'would tip over'}</span>`;
      if (hzEl._h !== html) { hzEl._h = html; hzEl.className = 'lfp-haz ' + c; hzEl.innerHTML = html; }
    }
    this._map();
    q('phase').textContent = this.state === 'descent' ? this.phases[this.phase].name : this.state === 'fall' ? 'Contact light · engine stop' : this.state === 'settle' ? (this.result?.kind === 'tip' ? 'Tipping over' : 'On the surface') : this.state === 'lost' ? 'Lander tipped over' : 'Egress';
    q('alt').textContent = `${fmt(alt, alt < 20 ? 1 : 0)} m`; q('altbar').style.transform = `scaleY(${Math.min(1, alt / 500).toFixed(3)})`;
    q('vs').textContent = `${fmt(this.vel.y, 1)} m/s`; q('hs').textContent = `${fmt(this._hspeed(), 1)} m/s`;
    q('thr').textContent = this.state === 'descent' ? `${fmt(this.throttle * 100)} %` : 'off';
    q('fuel').textContent = `${fmt(this.fuel)} s`; q('fuelp').classList.toggle('bad', this.fuel < 30);
    this.lfp.classList.toggle('egress', this.state === 'egress' || this.state === 'settle');
  }

  /** Mapa del descenso (vista desde arriba con el relieve real) y perfil de altura, con la nave en movimiento. */
  _map() {
    const now = performance.now(); if (now - (this._mapT || 0) < 90) return; this._mapT = now;
    const el = this.lfp.querySelector('.lfp-map'), v = this.view, pts = this.pathPts; if (!pts) return;
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
      for (let d = 0; d <= dTop; d += 250) grid += `<line x1="${bx(d)}" x2="${bx(d)}" y1="${T}" y2="${T + PH}" class="g"/><text x="${bx(d)}" y="${H - 10}" text-anchor="middle">${d ? (d >= 1000 ? fmt(d / 1000, d % 1000 ? 2 : 0) + ' km' : d + ' m') : 'SITE'}</text>`;
      const terr = pts.map((q) => `${bx(dist(q)).toFixed(1)},${by(Math.max(-hTop * 0.05, v.groundY(q.x, q.z) - this.target.y)).toFixed(1)}`);
      const bl = pts.map((q) => this._bp(q).map((r) => r.toFixed(1)).join(',')).join(' ');
      this.lfp.querySelector('.lfp-prof svg').innerHTML = `${grid}
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
    const pr = this.lfp.querySelector('.lfp-prof svg'), here = this.state === 'descent' || this.state === 'fall' ? p : this.target;
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
    el.querySelector('.vf .now').textContent = `${fmt(spd, 1)} m/s now`;
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
    const tl = label('— TOUCHDOWN'); tl.material.color.set(amber); tl.position.set(this.target.x, ty + 14, this.target.z); g.add(tl);
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
    card.className = 'lfp-end ' + R.kind;
    card.innerHTML = `<small>${R.kind === 'tip' ? 'MISSION LOST' : 'TOUCHDOWN'} · ${v.siteName ?? ''}</small><b>${R.kind === 'ok' ? 'The Eagle has landed' : R.title}</b>
      ${R.kind === 'ok' ? '' : `<p>${R.why}</p>`}${R.real ? `<p class="real">${R.real}</p>` : ''}
      ${R.kind === 'tip' ? `<p class="why2">${P.lit ? 'The lander followed the trajectory down to where the guidance took it, and the ground there would not hold it.' : 'The site was in shadow: without light there was no way to see the ground below.'}</p>` : ''}
      <dl><div><dt>Contact speed</dt><dd>${fmt(this.touchV ?? 0, 1)} m/s</dd></div><div><dt>Footpad tilt</dt><dd>${fmt(this.tiltDeg ?? 0, 1)}°</dd></div>
      <div><dt>Off target</dt><dd>${fmt(miss)} m</dd></div><div><dt>Fuel left</dt><dd>${fmt(Math.max(0, this.fuelKg ?? 0))} kg · ${fmt(Math.max(0, this.fuel ?? 0))} s</dd></div>
      <div><dt>Powered descent</dt><dd>${clock(this.t)}</dd></div><div><dt>Earth link</dt><dd>${v.now?.earth.visible ? 'direct' : 'below the horizon'}</dd></div></dl>
      <button type="button">Fly the descent again</button>`;
    card.querySelector('button').addEventListener('click', () => this.start());
    v.host.append(card); this.endEl = card;
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
      this.flash('CONTACT LIGHT · ENGINE STOP');
      this.say('Aldrin', 'Contact light.');
      this.say('Armstrong', 'Shutdown.');
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
    if (this.t > 6) ev('alarm', () => { this.say('Armstrong', 'Program alarm. It\'s a 1202.'); this.flash('ALARM 1202', 2500); });
    if (this.t > 12) ev('go', () => this.say('Houston', 'We\'re go on that alarm.', true));
    if (this.phase === 1) ev('p66', () => {
      // Aviso del terreno donde nos va a dejar el guiado (sin control manual: solo se informa)
      const P = this.plan, a = P.final.hz, g = gravedad(a), what = a.rock > ROCK_SMALL ? `${Math.round(a.rock * 200)} cm boulders` : `a ${fmt(a.tilt, 1)}° slope`;
      if (!P.lit) { this.say('Aldrin', 'We\'re in shadow: no view of the ground, only the laser altimeter.'); this.flash('P66 · NO SUNLIGHT · LANDING BLIND', 3500); }
      else { this.say('Armstrong', g ? `The landing point has ${what}. Staying on the trajectory.` : 'Clear ground below. Continuing down.'); this.flash('P66 · FINAL DESCENT', 2500); }
      this.view.voz?.say(!P.lit ? 'We are in shadow. I cannot see the ground, only the laser altimeter.'
        : g === 2 ? `Danger. The landing point has ${a.rock > ROCK_BIG ? 'a large boulder' : `a ${Math.round(a.tilt)} degree slope`}. We could tip over.`
        : g === 1 ? `Caution. We will land tilted about ${Math.round(a.tilt)} degrees.` : 'Landing zone is clear below.', { prio: g === 2 ? 2 : 1, key: 'p66', cooldownS: 5 });
      this._zc = P.lit ? g : null;
    });
    // Durante P66, si cambia lo que hay justo debajo, EVA lo dice (solo informa: aquí no hay nada que pilotar)
    const hz = this.hzNow, voz = this.view.voz;
    if (hz && voz && this.phase === 1 && this.plan.lit && this._zc != null && alt < 120) {
      const zc = gravedad(hz);
      if (zc !== this._zc) {
        if (zc === 2) voz.say(`Danger. Below us there is ${hz.rock > ROCK_BIG ? 'a large boulder' : `a ${Math.round(hz.tilt)} degree slope`}. We would tip over.`, { prio: 2, key: 'haz2', cooldownS: 10 });
        else if (zc === 1) voz.say(`Caution. Here we would land tilted ${Math.round(hz.tilt)} degrees.`, { prio: 1, key: 'haz1', cooldownS: 14 });
        else voz.say('Clear ground below.', { prio: 0, key: 'haz0', cooldownS: 12 });
        this._zc = zc;
      }
    }
    if (this.fuel < 60) ev('f60', () => this.say('Houston', '60 seconds.', true));
    if (this.fuel < 30) ev('f30', () => this.say('Houston', '30 seconds.', true));
    if (alt < 35) ev('dust', () => this.say('Aldrin', 'Picking up some dust.'));
    for (const h of [300, 150, 80, 40, 20, 10]) {
      if (alt < h) ev('alt' + h, () => this.say('Aldrin', `${h} meters, down at ${fmt(-this.vel.y, 1)} m/s, ${fmt(this._hspeed(), 1)} forward.`));
    }
  }

  _fall(dt) {
    this.vel.y -= G * dt;
    this.pos.addScaledVector(this.vel, dt);
    const ground = this.target.y;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.touchV = -this.vel.y; this.touchH = Math.hypot(this.vel.x, this.vel.z);
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
      const R = (this.result = outcome(hz, this.touchV, this.touchH));
      this.q0 = this.lm.quaternion.clone();
      const down = new THREE.Vector3(-hz.gx, 0, -hz.gz); if (down.lengthSq() < 1e-6) down.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      this.tipAxis = new THREE.Vector3().crossVectors(UP, down.normalize()).normalize();
      this.tiltDeg = Math.min(hz.tilt, 25);
      if (R.kind === 'tip') { this.say('Aldrin', 'We\'re going over!'); this.flash('THE LANDER IS TIPPING OVER', 4000); }
      const msg = { ok: 'Nominal landing. Welcome to the lunar south pole.', tilt: `We are down, but tilted ${Math.round(this.tiltDeg)} degrees. Panels and antenna are misaligned.`, hard: `Hard landing, at ${this.touchV.toFixed(1)} meters per second. The landing gear may be damaged.`, tip: 'The lander is tipping over. Mission lost.' }[R.kind];
      v.voz?.say(msg, { prio: R.kind === 'ok' ? 1 : 2, key: 'res', cooldownS: 5 });
    }
    const R = this.result;
    if (R.kind === 'tip') {
      const k = Math.min(1, this.settleT / 4);
      this.lm.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(this.tipAxis, k * k * 1.3).multiply(this.q0));
      this.lm.position.y = this.target.y + Math.sin(k * 1.3) * 1.6;
      if (this.settleT > 6 && !this.tipped) {
        this.tipped = true; this.state = 'lost';
        this.say('Telemetry', 'Lander tipped over. Panels and antenna off-pointed. Mission lost.');
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
      const site = this.view.siteName || 'the site';
      if (R.kind === 'ok') { this.say('Armstrong', `Houston, ${site} Base here. The Eagle has landed.`); this.flash('THE EAGLE HAS LANDED', 4000); }
      else { this.say('Armstrong', `Houston, we're down at ${site}, but ${R.kind === 'hard' ? 'that was a hard hit' : `we're tilted ${fmt(this.tiltDeg, 1)}°`}.`); this.flash(R.title.toUpperCase(), 4000); }
    });
    ev('reply', 4, () => this.say('Houston', R.kind === 'ok' ? 'Roger. You got a bunch of guys about to turn blue. We\'re breathing again.' : `Roger. ${R.why}`, true));
    ev('summary', 5.5, () => this.say('Telemetry', `Contact at ${fmt(this.touchV, 1)} m/s, footpads at ${fmt(this.tiltDeg, 1)}°, with ${fmt(Math.max(0, this.fuelKg), 0)} kg of fuel (${fmt(Math.max(0, this.fuel), 0)} s of hover).`));
    if (this.settleT > 7 && !this.ended) { this.ended = true; this.lmPos = this.lm.position.clone(); this._end(); }
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
    const phase = { descent: this.phases[this.phase].name, fall: 'Luz de contacto · caída libre', settle: 'On the surface',
      egress: 'Salida (EVA)', eva: 'Actividad extravehicular', lost: 'Nave volcada · misión perdida' }[this.state];
    q('phase').textContent = phase;
    q('alt').textContent = `${fmt(Math.max(0, this.altitude()), this.altitude() < 20 ? 1 : 0)} m`;
    q('vs').textContent = `${fmt(this.vel.y, 1)} m/s`;
    q('hs').textContent = `${fmt(this._hspeed(), 1)} m/s`;
    q('thr').textContent = this.state === 'descent' ? `${fmt(this.throttle * 100)} %` : 'off';
    q('fuel').textContent = `${fmt(this.fuel)} s`;
    q('fuel').classList.toggle('warn', this.fuel < 30);
    q('time').textContent = clock(this.t);
    if (n) {
      q('ctx').innerHTML = `<b>${this.view.siteName ?? ''}</b><br>
        Sol ${fmt(n.sun.el, 1)}° · ${fmt(n.sun.frac * 100)} % visible<br>
        Tierra ${fmt(n.earth.el, 1)}° · ${n.earth.visible ? '<span class="ok">enlace directo con Houston</span>' : '<span class="bad">sin enlace directo</span>'}`;
    }
  }
}
