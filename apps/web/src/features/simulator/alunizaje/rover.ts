// @ts-nocheck — escena three.js imperativa, como caminata.ts.
// Misión con rover: después del alunizaje se despliega un rover que recorre la ruta del plan (de ida, sin volver) y mide en
// cada parada. Lo que es del plan: la ruta (tareas.ts, las del Planificador), la velocidad máxima y las horas por parada
// (`?vel=` y `?parada=`, las pone quien planifica; referencia: VIPER de NASA, hasta 0,8 km/h). Lo que es del lugar y la
// fecha: la luz, las sombras y si la Tierra está sobre el horizonte (motor del Planificador). Un rover lunar se conduce
// desde la Tierra: sin enlace directo, se detiene. El tiempo se puede acelerar (T), porque a 0,8 km/h un kilómetro son 75 min.
// El modelo es un rover genérico (cuerpo, cuatro ruedas, mástil con cámaras, antena y panel), no la réplica de uno real.
import * as THREE from 'three';
import { avisarEva } from '@/shared/eva';
import { tr } from '@/shared/i18n';
import { Tareas } from './tareas';
import { datosRover, mostrarInforme } from './informe';

const ESCALAS = [1, 10, 60, 240];
const PENDIENTE_AVISO = 15, PENDIENTE_TOPE = 25; // 15°: límite del Planificador; más de 25°, las ruedas patinan y no sube
const fmt = (n, d = 0) => Number(n).toLocaleString(tr('en-US', 'es-ES'), { minimumFractionDigits: d, maximumFractionDigits: d });
const hm = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; };
const enCampo = (e) => !!e.target?.closest?.('input,select,textarea,button,[contenteditable="true"]');

function modeloRover() {
  const g = new THREE.Group();
  const blanco = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, metalness: 0.3, roughness: 0.6 });
  const oro = new THREE.MeshStandardMaterial({ color: 0xc9a23a, metalness: 0.9, roughness: 0.35 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.4, roughness: 0.6 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x14244a, metalness: 0.6, roughness: 0.3 });
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 2.0), blanco); cuerpo.position.y = 0.85; g.add(cuerpo);
  const manta = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 2.02), oro); manta.position.y = 0.6; g.add(manta);
  const pan = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 1.6), panel); pan.position.set(0, 1.16, -0.1); g.add(pan);
  const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), blanco); mastil.position.set(0, 1.7, 0.75); g.add(mastil);
  const cabeza = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.2), negro); cabeza.position.set(0, 2.28, 0.78); g.add(cabeza);
  const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.05, 0.12, 16), blanco); antena.position.set(-0.5, 1.4, 0.6); antena.rotation.x = -0.5; g.add(antena);
  const ruedas = [];
  for (const [x, z] of [[-0.8, 0.75], [0.8, 0.75], [-0.8, -0.75], [0.8, -0.75]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 18), negro); r.rotation.z = Math.PI / 2; r.position.set(x, 0.32, z); g.add(r); ruedas.push(r);
  }
  const luz = new THREE.SpotLight(0xfff1d6, 0, 40, 0.5, 0.5, 1.2); luz.position.set(0, 1.0, 1.05); luz.target.position.set(0, 0, 8); g.add(luz, luz.target);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, ruedas, luz };
}

export class Rover {
  constructor(view, { onSalir, sonido } = {}) {
    this.view = view; this.onSalir = onSalir; this.sonido = sonido;
    this.active = false; this.pos = new THREE.Vector3(); this.heading = 0; this.vel = 0; this.lamps = true; this.walked = 0;
    this.keys = new Set(); this.escala = 0;
    const m = modeloRover(); this.obj = m.g; this.ruedas = m.ruedas; this.luz = m.luz; this.obj.visible = false; view.scene.add(this.obj);
    this.sinRegreso = true; this.alcance = 4; this.tasks = new Tareas(this);
    this.hud = document.createElement('div'); this.hud.className = 'sim-rover-hud'; this.hud.hidden = true; view.host.append(this.hud);
    this._kd = (e) => {
      if (!this.active || enCampo(e)) return;
      this.keys.add(e.code); if (/^(Arrow|Key[WASD]$)/.test(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyT') { this.escala = (this.escala + 1) % ESCALAS.length; }
      if (e.code === 'KeyE') this.tasks.interact();
      if (e.code === 'KeyL') this.lamps = !this.lamps;
      if (e.code === 'KeyQ') this.onSalir?.();
      if (e.code === 'KeyI' && this.tasks.started) this._informe();
    };
    this._ku = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku);
  }

  /** Despliega el rover junto al módulo (`lmPos`), mirando hacia `heading`. */
  start(lmPos, heading, { lm = null } = {}) {
    const v = this.view, p = v.plan ?? {};
    this.vmax = Math.max(0.05, (p.roverKmh ?? 0.8) / 3.6); this.paradaH = p.paradaH ?? 2;
    this.lmPos = lmPos.clone(); this.heading = heading;
    this.pos.set(lmPos.x + Math.sin(heading) * 18, 0, lmPos.z + Math.cos(heading) * 18); // bajó por la rampa y se apartó del módulo this.pos.y = v.groundY(this.pos.x, this.pos.z);
    this.active = true; this.vel = 0; this.walked = 0; this.escala = 1; this.notice = null; this._informeVisto = false; this._lejos = false;
    this.s = { t: 0 }; this.stats = { salidasRuta: 0, sinEnlaceS: 0, pendienteMax: 0 };
    this.obj.visible = true; this.hud.hidden = false;
    this.tasks.reset(); this.tasks.start(lm);
    this.notice = tr(`Rover deployed. Plan: up to ${fmt(p.roverKmh ?? 0.8, 1)} km/h and ${fmt(this.paradaH, 1)} h per stop. W/S drive, A/D steer, T speeds up time.`, `Rover desplegado. Plan: hasta ${fmt(p.roverKmh ?? 0.8, 1)} km/h y ${fmt(this.paradaH, 1)} h por parada. W/S avanza, A/D gira, T acelera el tiempo.`);
    avisarEva('tarea-hecha');
    this._camPos = null;
  }

  stop() { this.active = false; this.obj.visible = false; this.hud.hidden = true; this.keys.clear(); this.luz.intensity = 0; }

  /** Pendiente (°) del terreno en (x, z), con diferencias a ±1,5 m. */
  _pend(x, z) { const g = this.view.groundY, e = 1.5; return (Math.atan(Math.hypot(g(x + e, z) - g(x - e, z), g(x, z + e) - g(x, z - e)) / (2 * e)) * 180) / Math.PI; }

  update(dtReal) {
    if (!this.active) return;
    const v = this.view, k = this.keys, esc = ESCALAS[this.escala], dt = Math.min(0.05, dtReal) * esc;
    this.s.t += dt;
    const enlace = !!v.now?.earth.visible;
    // Mando: acelerar hacia la velocidad del plan; sin enlace con la Tierra no hay órdenes y el rover se para
    const quiere = enlace ? ((k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 0.5 : 0)) * this.vmax : 0;
    this.vel += Math.max(-0.3 * dt, Math.min(0.3 * dt, quiere - this.vel));
    if (!enlace) { this.stats.sinEnlaceS += dt; this.vel = 0; }
    const giro = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    if (enlace) this.heading += giro * 0.35 * Math.min(0.05, dtReal) * Math.min(esc, 10);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const nx = this.pos.x + fx * this.vel * dt, nz = this.pos.z + fz * this.vel * dt;
    const pend = this._pend(nx, nz), sube = v.groundY(nx, nz) > this.pos.y;
    if (pend > PENDIENTE_TOPE && sube) { this.vel = 0; this.notice = tr(`Slope of ${fmt(pend)}°: the wheels slip. Find another way.`, `Pendiente de ${fmt(pend)}°: las ruedas patinan. Busca otro camino.`); }
    else if (Math.abs(this.vel) > 1e-4) {
      this.walked += Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.pos.set(nx, v.groundY(nx, nz), nz);
      this.stats.pendienteMax = Math.max(this.stats.pendienteMax, pend);
    }
    // Apoyo sobre el terreno: el chasis sigue la normal del suelo
    const g = v.groundY, e = 1.0, n = new THREE.Vector3(g(this.pos.x - e, this.pos.z) - g(this.pos.x + e, this.pos.z), 2 * e, g(this.pos.x, this.pos.z - e) - g(this.pos.x, this.pos.z + e)).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    this.obj.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(q));
    this.obj.position.copy(this.pos);
    for (const r of this.ruedas) r.rotation.x += (this.vel * dt) / 0.32;
    this.luz.intensity = this.lamps ? 6 : 0;
    // Ruta y paradas (tareas.ts, sin el regreso)
    const lejos = this.tasks.lejosDeRuta; if (lejos && !this._lejos) this.stats.salidasRuta++; this._lejos = lejos;
    if (v.tSalida != null) v.cieloAl?.(v.tSalida + this.s.t * 1000); // el Sol y la Tierra avanzan con el reloj del recorrido
    this.tasks.update();
    if (this.tasks.done && !this._informeVisto) { this._informeVisto = true; setTimeout(() => this.active && this._informe(), 2000); }
    this._camara(Math.min(0.05, dtReal));
    this._hud(enlace, pend);
  }

  _informe() { mostrarInforme(this.view, datosRover(this.view, this), { volar: () => this.onSalir?.(), planificador: () => { location.href = /planificar-mision/.test(document.referrer) ? document.referrer : '/planificar-mision.html'; } }); }

  /** Cámara de persecución: detrás y por encima del rover, suave. */
  _camara(dt) {
    const v = this.view, c = v.camera, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const want = new THREE.Vector3(this.pos.x - fx * 7 + fz * 3, 0, this.pos.z - fz * 7 - fx * 3);
    want.y = Math.max(this.pos.y + 3.5, v.groundY(want.x, want.z) + 2);
    if (!this._camPos) this._camPos = want.clone(); else this._camPos.lerp(want, Math.min(1, dt * 3));
    c.position.copy(this._camPos); c.lookAt(this.pos.x + fx * 3, this.pos.y + 0.8, this.pos.z + fz * 3);
    if (c.fov !== 55) { c.fov = 55; c.updateProjectionMatrix(); }
  }

  _hud(enlace, pend) {
    const v = this.view, now = v.now, tarea = this.tasks.text() ?? '';
    const sol = now ? (now.sun.frac > 0.5 && this.tasks.lit(this.pos.x, this.pos.z)) : false;
    this.hud.innerHTML = `
      <div class="fila"><span>${tr('SPEED', 'VELOCIDAD')}</span><b>${fmt(Math.abs(this.vel) * 3.6, 2)} km/h</b><span>/ ${fmt(this.vmax * 3.6, 1)}</span></div>
      <div class="fila"><span>${tr('TIME', 'TIEMPO')}</span><b>${hm(this.s.t)}</b><span>×${ESCALAS[this.escala]}</span></div>
      <div class="fila"><span>${tr('DRIVEN', 'RECORRIDO')}</span><b>${fmt(this.walked)} m</b></div>
      <div class="fila ${enlace ? '' : 'mal'}"><span>${tr('EARTH', 'TIERRA')}</span><b>${enlace ? tr('LINK', 'ENLACE') : tr('NO LINK · STOPPED', 'SIN ENLACE · PARADO')}</b></div>
      <div class="fila ${sol ? '' : 'mal'}"><span>${tr('SUN', 'SOL')}</span><b>${sol ? tr('ON PANEL', 'EN EL PANEL') : tr('SHADOW', 'SOMBRA')}</b></div>
      <div class="fila ${pend > PENDIENTE_AVISO ? 'mal' : ''}"><span>${tr('SLOPE', 'PENDIENTE')}</span><b>${fmt(pend, 1)}°</b></div>
      <p class="tarea">${tarea}</p>${this.notice ? `<p class="aviso">${this.notice}</p>` : ''}
      <p class="teclas">W/S · A/D · E ${tr('measure', 'medir')} · L ${tr('lights', 'luces')} · T ${tr('time', 'tiempo')} · I ${tr('report', 'informe')} · Q ${tr('fly again', 'volver a volar')} · H EVA</p>`;
  }

  dispose() {
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku);
    this.tasks.dispose(); this.obj.removeFromParent(); this.hud.remove();
  }
}
