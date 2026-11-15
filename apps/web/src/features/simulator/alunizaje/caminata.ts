// @ts-nocheck — portado de nuestro simulador NASA (scene3d.js, eva.js, JavaScript); el tipado estricto queda pendiente.
// Caminata con el casco puesto, después del primer paso: el astronauta camina en primera persona sobre el relieve real
// del sitio, a 1/6 de gravedad, y ve el mundo a través del vidrio del casco (VisorCasco) con su HUD (VisorHud).
//
// Mandos: WASD / flechas caminar respecto a la mirada · Shift galope · Espacio salto · ratón mirar (clic captura el
// puntero, o arrastrando) · E recoger muestra · G visor solar · L lámparas ·
// R recargar el traje junto al LM (o reintentar si se perdió) · T tiempo ×1/×10/×60 · Q volver a volar el descenso.
//
// El traje (cifras de referencia de la PLSS del Apollo / xEMU, redondeadas): O₂ 0,82 kg, agua de refrigeración 3,86 kg
// (se sublima para disipar calor), cartucho de LiOH de 8870 kJ (absorbe el CO₂) y batería de 279 Wh. Se gastan según el
// esfuerzo (metabolismo de 120 W en reposo a 470 W al galope), el Sol o la sombra y las lámparas. El límite de regreso es
// la mitad de lo que dura el consumible más escaso caminando. Sin O₂ o con el cartucho saturado la vista se cierra en
// túnel y la misión se pierde. El módulo lunar guarda reservas para recargar; un aterrizaje duro rompe un tanque.
// La caminata es la planificada (misión CR-02: ruta científica, dos paradas, regreso obligatorio): tareas.ts. El
// límite de pendiente es el del Planificador (15°, SLOPE_LIMIT de prototipos/lunar-map/mission.js). EVA (la de toda la app) lo comenta con `avisarEva` y, mientras dura la caminata, vive dentro
// del visor como holograma (`evaEnCasco`): abajo a la derecha del vidrio, entre la retícula y las filas del traje.
import * as THREE from 'three';
import { avisarEva, evaEnCasco } from '@/shared/eva';
import { tr } from '@/shared/i18n';
import { VisorCasco, THETA_V, THETA_MAX, direccionAPantalla } from './casco/visorCasco';
import { VisorHud } from './visorHud';
import { Tareas } from './tareas';
import { datosDelInforme, mostrarInforme } from './informe';
import { avisoRetos } from './retos';

const G = 1.62;
const EYE = 1.68;        // altura de los ojos (m)
const LM_R = 2.9;        // radio del módulo lunar que no se puede atravesar (m)
const O2_KG = 0.82, WATER_KG = 3.86, LIOH_KJ = 8870, BATT_WH = 279;
const O2_PER_J = 1.43e-3 / 20100;   // kg de O₂ por julio metabólico
const SUBLIM_J_PER_KG = 2.83e6;     // calor que se lleva cada kg de agua al sublimarse
const RESERVE_S = 30 * 60;          // reserva de O₂ que no se cuenta para el regreso
const LM_O2_KG = 21.8, LM_WATER_KG = 151;
const PENDIENTE_LIMITE = 15; // grados: el límite de la ruta en el Planificador (SLOPE_LIMIT)
const CRATER_MIN_R = 2.5;  // cráteres que se avisan (radio, m): los más chicos se cruzan sin problema
const CRATER_BORDE = 1.2;  // el borde levantado llega a ~1,2 radios del centro (detalle.ts)
/** Límite de regreso (m) con el traje lleno, caminando a ~1 m/s: la mitad de lo que dura el consumible más escaso. */
const PASO_MS = 1.3; // velocidad de marcha (m/s): la de la tecla W, más abajo
// Límite de regreso con el traje lleno: la mitad de lo que dura el consumible más escaso (s), por la velocidad de marcha (m)
const WALKBACK_LLENO = Math.min((O2_KG - 120 * O2_PER_J * RESERVE_S) / (300 * O2_PER_J), WATER_KG / ((300 + 105) / SUBLIM_J_PER_KG), (BATT_WH * 3600) / 35, (LIOH_KJ * 1000) / 300) * 0.5 * PASO_MS;
const D2R = Math.PI / 180;
const dir = (az, el) => new THREE.Vector3(Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), -Math.cos(el * D2R) * Math.cos(az * D2R));
const fmt = (n, d = 0) => (Number.isFinite(n) ? n : 0).toLocaleString(tr('en-US', 'es-ES'), { minimumFractionDigits: d, maximumFractionDigits: d });
const hh = (t) => { t = Math.max(0, Math.floor(t)); return [t / 3600, (t % 3600) / 60, t % 60].map((x) => String(Math.floor(x)).padStart(2, '0')).join(':'); };
const hm = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; };
const enCampo = (e) => !!e.target?.closest?.('input,select,textarea,button,[contenteditable="true"]');

export class Caminata {
  constructor(view, { onSalir, sonido } = {}) {
    this.view = view; this.onSalir = onSalir; this.sonido = sonido;
    this.active = false;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.heading = 0; this.yaw = 0; this.pitch = -0.08;
    this.keys = new Set(); this.timeScale = 1; this.lamps = false;
    this.visor = new VisorCasco(); this.visor.exposicion = 2.6; // la escena usa un Sol de intensidad 3,2 (el paquete se ajustó para 12)
    this.hud = new VisorHud(view.host);
    this.tasks = new Tareas(this);
    // Lámparas del casco: dos focos que siguen la mirada
    this.lampGroup = new THREE.Group();
    for (const s of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff1d6, 0, 60, 0.42, 0.5, 1.2);
      l.position.set(0.18 * s, 0.12, 0); l.target.position.set(0.18 * s, -0.6, -6);
      this.lampGroup.add(l, l.target);
    }
    view.scene.add(this.lampGroup);
    this.el = view.renderer.domElement;
    let drag = false;
    this._on = [
      [window, 'keydown', (e) => this._key(e)],
      [window, 'keyup', (e) => this.keys.delete(e.code)],
      [window, 'blur', () => this.keys.clear()],
      [this.el, 'click', () => { if (this.active && document.pointerLockElement !== this.el) this.el.requestPointerLock?.()?.catch?.(() => {}); }],
      [this.el, 'pointerdown', () => { drag = true; }],
      [window, 'pointerup', () => { drag = false; }],
      [window, 'mousemove', (e) => {
        if (!this.active || this.lost || (document.pointerLockElement !== this.el && !drag)) return;
        this.yaw -= e.movementX * 0.0025;
        this.pitch = Math.max(-1.1, Math.min(1.0, this.pitch - e.movementY * 0.0025));
      }],
    ];
    for (const [t, ev, fn] of this._on) t.addEventListener(ev, fn);
  }

  _key(e) {
    if (!this.active || enCampo(e)) return;
    const once = !e.repeat;
    if (e.code === 'KeyQ' && once) { this.onSalir?.(); return; }
    if (this.lost) { if (e.code === 'KeyR' && once) this.retry(); return; }
    this.keys.add(e.code);
    if (e.code === 'Space' && once) { this._jumpReq = true; e.preventDefault(); }
    if (/^(Arrow|Key[WASD]$)/.test(e.code)) e.preventDefault();
    if (!once) return;
    if (e.code === 'KeyG') { this.visor.visor = this.visor.visor === 2 ? 1 : 2; this.sonido?.visor(); if (this.visor.visor !== 2) avisarEva('visor-solar'); } // visor solar: arriba ↔ abajo
    if (e.code === 'KeyL') { this.lamps = !this.lamps; if (this.lamps) avisarEva('luces'); }
    if (e.code === 'KeyE') this.tasks.interact();
    if (e.code === 'KeyR') this.recharge();
    if (e.code === 'KeyM') this.notice = this.sonido?.toggleMute() ? tr('Sound off (M)', 'Sonido apagado (M)') : tr('Sound on (M)', 'Sonido encendido (M)');
    if (e.code === 'KeyT') { this.timeScale = this.timeScale === 1 ? 10 : this.timeScale === 10 ? 60 : 1; if (this.timeScale > 1) avisarEva('tiempo'); }
  }

  /**
   * Empieza la caminata en `pos`, mirando hacia `heading`, junto al módulo (`lmPos`, `lm` su objeto 3D).
   * `result`: cómo se posó (un aterrizaje duro rompe un tanque: el módulo guarda la mitad de O₂ y agua para recargar).
   */
  start(pos, heading, lmPos, { lm = null, result = null } = {}) {
    const v = this.view;
    this.active = true; this.walked = 0; this.events = new Set(); this.lost = false; this.hypo = 0; this.fatigue = 0;
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.lmPos = lmPos?.clone() ?? null; this.result = result;
    this.heading = heading; this.yaw = heading + Math.PI; this.pitch = -0.08;
    this.jumpY = 0; this.jumpV = 0; this.fpPhase = 0; this.fpHop = 0; this.fpRun = 0; this._tickT = 0; this._litT = 0; this._crit = false;
    this.timeScale = 1; this.lamps = false; this.notice = null;
    this.stats = { hrMax: 72, salidasRuta: 0, crateres: 0 }; this._lejos = false; this._informeVisto = false; // para el informe final
    document.querySelector('.sim-informe')?.remove();
    this.s = { o2: O2_KG, water: WATER_KG, lioh: 0, batt: BATT_WH, hr: 72, met: 120, temp: 21, dose: 0, t: 0, press: 25.9 };
    const leak = result?.kind === 'hard' ? 0.5 : 1;
    this.lm = { o2: LM_O2_KG * leak, water: LM_WATER_KG * leak, recharges: 0 };
    this.visor.reiniciar(); this.visor.visor = 2;
    v.astro.object.visible = false; v.astro.dust.visible = true; // en primera persona el cuerpo no se ve; el polvo de los pasos sí
    v.camera.fov = 70; v.camera.updateProjectionMatrix();
    this.tasks.reset(); this.tasks.start(lm);
    this.hud.lost(null); this.hud.tunnel(0); this.hud.root.hidden = false; this.hud.root.classList.remove('nopower'); this.hud.boot();
    this._sinBateria = false; this.sonido?.casco(true); // ventilador del traje
    this.notice = avisoRetos();
    if (result?.kind === 'hard') this.notice = tr('The hard landing ruptured a lander tank: only half the O₂ and water are left to recharge the suit', 'El aterrizaje duro rompió un tanque del módulo: solo queda la mitad de O₂ y agua para recargar el traje');
  }

  stop() {
    document.querySelector('.sim-informe')?.remove();
    if (this.active || this._evaEn) { evaEnCasco(null); this._evaEn = null; } // EVA sale del casco y vuelve a volar
    this.active = false; this.keys.clear();
    this.hud.root.hidden = true;
    this.sonido?.casco(false);
    for (const o of this.lampGroup.children) if (o.isSpotLight) o.intensity = 0;
    this.sonido?.alarma(false);
    if (document.pointerLockElement === this.el) document.exitPointerLock?.();
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  _dLM() { return this.lmPos ? Math.hypot(this.pos.x - this.lmPos.x, this.pos.z - this.lmPos.z) : null; }

  /** Recarga junto al módulo (a menos de 6 m de la escalera): O₂, agua, cartucho de LiOH y batería nuevos. */
  recharge() {
    const d = this._dLM();
    if (d == null || d > 6) { this.notice = tr('To recharge, get within 6 m of the LM ladder', 'Para recargar acércate a menos de 6 m de la escalera del LM'); return; }
    if (this.lm.o2 < O2_KG - this.s.o2 || this.lm.water < WATER_KG - this.s.water) { this.notice = tr('The LM has no stores left for another recharge', 'El LM ya no tiene reservas para otra recarga'); this.sonido?.blip(); return; }
    this.lm.o2 -= O2_KG - this.s.o2; this.lm.water -= WATER_KG - this.s.water;
    Object.assign(this.s, { o2: O2_KG, water: WATER_KG, lioh: 0, batt: BATT_WH });
    this.lm.recharges++;
    this.notice = tr('Recharge complete: new O₂, water, LiOH cartridge and battery', 'Recarga completa: O₂, agua, cartucho de LiOH y batería nuevos'); this.sonido?.blip(true);
    avisarEva('recarga');
  }

  /** Reintentar tras perder la misión: traje lleno y de vuelta junto al módulo. */
  retry() {
    const lm = this.lmPos ?? this.pos;
    this.lost = false; this.hypo = 0; this.fatigue = 0;
    Object.assign(this.s, { o2: O2_KG, water: WATER_KG, lioh: 0, batt: BATT_WH, hr: 72, met: 120, temp: 21, press: 25.9 });
    this.pos.set(lm.x + 4, 0, lm.z + 4); this.vel.set(0, 0, 0);
    this.hud.lost(null); this.hud.tunnel(0); this.hud.boot();
    this.notice = tr('Suit recharged. Starting again next to the lander.', 'Traje recargado. Vuelves a empezar junto al módulo.');
  }

  update(dtReal) {
    if (!this.active) return;
    const v = this.view, dt0 = Math.min(0.05, dtReal), k = this.lost ? new Set() : this.keys;
    // Movimiento
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const lope = k.has('ShiftLeft') || k.has('ShiftRight');
    const vel = this.vel, want = new THREE.Vector3(), air = this.jumpY > 0;
    if (fwd || side) {
      const camDir = this.forward(), right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
      want.copy(camDir.multiplyScalar(fwd).add(right.multiplyScalar(side)).normalize()).multiplyScalar(lope ? 3.4 - 1.5 * this.fatigue : PASO_MS); // cansado se corre menos
    }
    if (!air) vel.lerp(want, Math.min(1, dt0 / (want.lengthSq() > vel.lengthSq() ? 0.4 : 0.7))); // en el aire no hay con qué empujar
    if (vel.lengthSq() < 1e-4 && !want.lengthSq()) vel.set(0, 0, 0);
    if (this._jumpReq && !air && !this.lost) { this.jumpV = 2.0; this.jumpY = 1e-4; }
    this._jumpReq = false;
    if (this.jumpY > 0) {
      this.jumpV -= G * dt0; this.jumpY += this.jumpV * dt0;
      if (this.jumpY <= 0) { const v0 = -this.jumpV; this.jumpY = 0; this.jumpV = 0; this.sonido?.golpe(Math.min(1, v0 / 2)); if (v0 > 1.4) avisarEva('salto'); }
    }
    const speed = vel.length();
    if (speed > 0) {
      const before = this.pos.clone();
      this.pos.addScaledVector(vel, dt0);
      if (this.lmPos) { // no atravesar el módulo lunar
        const dx = this.pos.x - this.lmPos.x, dz = this.pos.z - this.lmPos.z, d = Math.hypot(dx, dz);
        if (d < LM_R) { this.pos.x = this.lmPos.x + (dx / (d || 1)) * LM_R; this.pos.z = this.lmPos.z + (dz / (d || 1)) * LM_R; }
      }
      this.walked += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    }
    this.heading = this.yaw + Math.PI;
    this.pos.y = v.groundY(this.pos.x, this.pos.z) + this.jumpY;
    v.astro.object.position.copy(this.pos); v.astro.object.rotation.y = this.heading;
    v.astro.update(dt0, speed);
    // Ojos a 1,68 m con el rebote del paso lunar: en la Luna no se corre, se avanza a zancadas (cada una un pequeño vuelo)
    const ground = !air, ph0 = this.fpPhase;
    const run = Math.max(0, Math.min(1, (speed - 1.5) / 1.6)), sps = 1.55 - 0.5 * run; // apoyos por segundo
    this.fpPhase = ph0 + dt0 * Math.PI * sps * (speed > 0.15 && ground ? 1 : 0);
    if (Math.floor(this.fpPhase / Math.PI) !== Math.floor(ph0 / Math.PI)) { this.tasks.print(); this.sonido?.paso(Math.min(1, speed / 3.4)); } // una huella y un paso por apoyo
    const u = (this.fpPhase / Math.PI) % 1, hop = speed > 0.15 && ground ? 4 * u * (1 - u) : 0;
    this.fpHop += (hop - this.fpHop) * Math.min(1, dt0 * 18); this.fpRun = run;
    const cam = v.camera;
    cam.position.set(this.pos.x, this.pos.y + EYE + this.fpHop * (0.045 + 0.2 * run), this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); cam.updateMatrixWorld();
    this.lampGroup.position.copy(cam.position); this.lampGroup.quaternion.copy(cam.quaternion); this.lampGroup.updateMatrixWorld(true);
    this._mv = speed > 0.15;
    this._crater(speed);
    this._suit(dt0, speed, this._mv);
    if (v.tSalida != null) v.cieloAl?.(v.tSalida + this.s.t * 1000); // el Sol y la Tierra avanzan con el reloj de la EVA
    this.tasks.update();
    if (this.tasks.done && !this._informeVisto) { // caminata completa: el informe de la misión, planificado frente a real
      this._informeVisto = true;
      setTimeout(() => { if (this.active) mostrarInforme(this.view, datosDelInforme(this.view, this), { volar: () => this.onSalir?.(), planificador: () => { location.href = /planificar-mision/.test(document.referrer) ? document.referrer : '/planificar-mision.html'; } }); }, 2500);
    }
    this._eva(dt0);
    this._hud(dt0);
  }

  /**
   * Cráteres del suelo de detalle (detalle.ts): si caminas hacia uno grande y llegas al borde, precaución; si intentas
   * cruzarlo (ya dentro del borde y yendo hacia el centro), alarma y EVA te dice por qué lado rodearlo.
   */
  _crater(speed) {
    const craters = this.view.detail?.craters ?? [], v = this.vel;
    let best = null;
    if (speed > 0.25) for (const c of craters) {
      if (c.rad < CRATER_MIN_R) continue;
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z, d = Math.hypot(dx, dz);
      const borde = c.rad * CRATER_BORDE, hacia = (v.x * dx + v.z * dz) / (d || 1); // velocidad hacia el centro (m/s)
      if (d > borde + 4 || hacia < 0.25) continue;
      const k = d / borde;
      if (!best || k < best.k) best = { c, d, k, nivel: d < borde ? 'crit' : 'warn', izq: v.z * dx - v.x * dz < 0 };
    }
    this.crater = best;
    // Pendiente por delante (a 3 m en la dirección de la marcha) contra el límite del plan
    this.pendiente = null;
    if (speed > 0.25) {
      const g = this.view.groundY, dir = v.clone().setY(0).normalize(), x = this.pos.x + dir.x * 3, z = this.pos.z + dir.z * 3, e = 1.5;
      const s = (Math.atan(Math.hypot(g(x + e, z) - g(x - e, z), g(x, z + e) - g(x, z - e)) / (2 * e)) * 180) / Math.PI;
      if (s > PENDIENTE_LIMITE - 3) this.pendiente = { s, nivel: s > PENDIENTE_LIMITE ? 'crit' : 'warn' };
      if (this.pendiente?.nivel === 'crit') { const t = performance.now(); if (!this._pendT || t - this._pendT > 25000) { this._pendT = t; avisarEva('pendiente', undefined, '.sim-vh-feed'); } }
    }
    // Fuera de la ruta planificada
    const lejos = this.tasks.lejosDeRuta; if (lejos && !this._lejos) this.stats.salidasRuta++; this._lejos = lejos;
    if (this.tasks.lejosDeRuta) { const t = performance.now(); if (!this._rutaT || t - this._rutaT > 60000) { this._rutaT = t; avisarEva('fuera-de-ruta', undefined, '.sim-vh-lens.radar'); } }
    if (best?.nivel === 'crit') {
      const t = performance.now();
      if (!this._craterT || t - this._craterT > 20000) { this._craterT = t; this.stats.crateres++; avisarEva(best.izq ? 'crater-izquierda' : 'crater-derecha', undefined, '.sim-vh-feed'); }
    }
  }

  /** Consumibles del traje, cansancio, pulso y los fallos que se viven (túnel de hipoxia y misión perdida). */
  _suit(dtReal, speed, moving) {
    const s = this.s, now = this.view.now, dt = dtReal * this.timeScale;
    s.t += dt;
    const inSun = this._lit ?? (now ? now.sun.frac > 0.5 : true);
    const target = !moving ? 120 : speed > 2 ? 470 : 300;
    // Cansancio: unos 50 s de galope seguido agotan; andando casi no sube; quieto se recupera en ~1 min
    this.fatigue = Math.max(0, Math.min(1, this.fatigue + dtReal * (speed > 2 ? 1 / 50 : moving ? -1 / 240 : -1 / 60)));
    s.met += (target - s.met) * Math.min(1, dtReal * 0.8);
    s.hr += ((62 + (s.met - 120) * 0.2 + 45 * this.fatigue + (s.temp > 26 ? (s.temp - 26) * 4 : 0) + (this._crit ? 18 : 0) + 45 * this.hypo + (this.jumpY > 0 ? 10 : 0) + (inSun ? 0 : 4)) - s.hr) * Math.min(1, dtReal * 0.5);
    s.o2 = Math.max(0, s.o2 - s.met * O2_PER_J * dt - 1e-7 * dt);
    s.lioh = Math.min(LIOH_KJ, s.lioh + (s.met * dt) / 1000);
    const heat = Math.max(0, s.met + (inSun ? 70 : -40) + 35);
    if (s.water > 0) s.water = Math.max(0, s.water - (heat / SUBLIM_J_PER_KG) * dt);
    s.batt = Math.max(0, s.batt - ((35 + (this.lamps ? 12 : 0)) * dt) / 3600);
    const tTarget = s.water > 0 && s.batt > 0 ? (inSun ? 21 : 18) : inSun ? 38 : 4;
    s.temp += (tTarget - s.temp) * Math.min(1, dt / 600);
    s.press = s.o2 > 0 ? 25.9 : Math.max(0, s.press - dt * 0.05);
    s.dose += (57 / 3600) * dt; // µSv/h en la superficie lunar (Chang'e 4, LND)
    // Respiración: en reposo no se oye; aparece con el galope, el cansancio y la falta de aire. Empaña el vidrio al exhalar.
    const o2f = s.o2 / O2_KG, aire = Math.max(o2f < 0.25 ? 1 - o2f / 0.25 : 0, s.lioh / LIOH_KJ > 0.85 ? 0.7 : 0, this.hypo);
    const esfuerzo = this.lost ? 0 : Math.max(speed > 2 ? 0.55 : 0, this.fatigue * 0.95, aire);
    this.aliento = this.sonido?.respiracion(dtReal, esfuerzo, Math.min(46, 14 + 12 * (speed > 2 ? 1 : 0) + 16 * this.fatigue + 14 * aire), aire) ?? 0;
    // Sin batería el HUD se apaga (y queda así hasta recargar junto al módulo)
    const sinBat = s.batt <= 0;
    if (sinBat !== this._sinBateria) { this._sinBateria = sinBat; this.hud.root.classList.toggle('nopower', sinBat); if (sinBat) { this.sonido?.apagado(); this.sonido?.alarma(false); } }
    for (const o of this.lampGroup.children) if (o.isSpotLight) o.intensity = this.lamps && s.batt > 0 ? 30 : 0;
    // Fallos: sin O₂ o con el CO₂ saturado la vista se cierra en unos 9 s y la misión se pierde
    const cause = s.o2 <= 0 ? 'o2' : s.lioh >= LIOH_KJ ? 'co2' : null;
    this.hypo = Math.max(0, Math.min(1, this.hypo + (cause ? dtReal / 9 : -dtReal / 3)));
    this.hud.tunnel(this.hypo);
    if (this.hypo >= 1 && !this.lost) {
      this.lost = true; this.timeScale = 1; this.sonido?.alarma(false);
      const d = this._data(), far = d.dLM != null ? tr(`You were ${fmt(d.dLM)} m from the lander; with a full suit, the limit to walk back was ${fmt(WALKBACK_LLENO)} m.`, `Estabas a ${fmt(d.dLM)} m del módulo lunar; con el traje lleno, el límite para volver eran ${fmt(WALKBACK_LLENO)} m.`) : '';
      this.hud.lost(cause === 'o2' ? tr('You ran out of oxygen', 'Te quedaste sin oxígeno') : tr('CO₂ saturated the cartridge', 'El CO₂ saturó el cartucho'),
        `${far} ${tr(`You had walked for ${hm(s.t)} and ${fmt(this.walked)} m. On the Moon the margin to return is planned before stepping out: here it ran out.`, `Llevabas ${hm(s.t)} de caminata y ${fmt(this.walked)} m recorridos. En la Luna el margen de regreso se planifica antes de salir: aquí se agotó.`)}`);
      avisarEva('aviso-critico', cause === 'o2' ? tr('Oxygen depleted. Mission lost.', 'Oxígeno agotado. Misión perdida.') : tr('The CO2 cartridge is saturated. Mission lost.', 'El cartucho de CO2 está saturado. Misión perdida.'));
    }
  }

  /** Lo que EVA comenta (con sus reglas de frecuencia) y los avisos críticos del traje. */
  _eva(dt) {
    const once = (key, fn) => { if (!this.events.has(key)) { this.events.add(key); fn(); } };
    if (this.walked > 4) once('primeros', () => avisarEva('primeros-pasos'));
    // EVA con el HUD: te enseña el traje al salir y te señala la tecla cuando hace falta (eventos «guia» de guion.ts)
    if (this.s.t > 5) once('hud', () => avisarEva('casco-hud', undefined, '.sim-vh-rows.l'));
    const cerca = this.tasks._near(0) || this.tasks._near(1), oscuro = this.tasks._near(1) && this.tasks.darkReal && !this.lamps;
    const cada2 = (key, seg, fn) => { const t = performance.now(); this._guia ??= {}; if (!this._guia[key] || t - this._guia[key] > seg * 1000) { this._guia[key] = t; fn(); } };
    if (oscuro) cada2('luces', 30, () => avisarEva('necesitas-luces', undefined, '.sim-vh-keys [data-key="l"]'));
    else if (cerca) cada2('muestra', 30, () => avisarEva('muestra-cerca', undefined, '.sim-vh-keys [data-key="e"]'));
    if (this.visor.thetaSol < 0.4 && this.visor.visor === 2 && this._lit !== false) cada2('sol', 60, () => avisarEva('deslumbramiento', undefined, '.sim-vh-keys [data-key="g"]'));
    // Su sarcasmo con lo que haces (EVA ya se limita a un comentario cada 90 s; aquí, además, cada uno espera su turno)
    this._galope = this.fpRun > 0.5 ? (this._galope ?? 0) + dt : 0;
    this._quieta = this._mv || this.lost ? 0 : (this._quieta ?? 0) + dt;
    const cada = (key, seg, fn) => { const t = performance.now(); this._cada ??= {}; if (!this._cada[key] || t - this._cada[key] > seg * 1000) { this._cada[key] = t; fn(); } };
    if (this._galope > 6) cada('galope', 120, () => avisarEva('galope'));
    if (this._quieta > 40) { this._quieta = 0; cada('quieta', 180, () => avisarEva('quieta')); }
    if (this.fatigue > 0.8) once('agotado', () => avisarEva('agotado'));
    // ¿Le da el Sol al astronauta? (relieve real hacia el Sol, una vez por segundo)
    this._litT -= dt;
    if (this._litT <= 0) {
      this._litT = 1;
      const lit = this.tasks.lit(this.pos.x, this.pos.z);
      if (this._lit != null && lit !== this._lit && !lit) avisarEva('sombra');
      this._lit = lit;
      if (this.view.now?.earth.visible) once('tierra', () => avisarEva('tierra-a-la-vista'));
      const d = this._data();
      if (d.dLM != null && d.dLM > 300) once('lejos', () => avisarEva('lejos'));
    }
  }

  /** Todos los valores que muestra el visor. */
  _data() {
    const s = this.s, now = this.view.now, inSun = this._lit ?? (now ? now.sun.frac > 0.5 : true);
    const heatNow = Math.max(1, s.met + (inSun ? 70 : -40) + 35), draw = 35 + (this.lamps ? 12 : 0);
    const left = {
      o2: s.o2 / (s.met * O2_PER_J), co2: ((LIOH_KJ - s.lioh) * 1000) / s.met,
      h2o: s.water / (heatNow / SUBLIM_J_PER_KG), bat: (s.batt * 3600) / draw,
    };
    const o2Time = Math.max(0, (s.o2 - 120 * O2_PER_J * RESERVE_S) / (300 * O2_PER_J));
    // Límite de regreso (m): la mitad del tiempo que queda del consumible más escaso, andando a la velocidad de marcha
    const walkback = Math.min(o2Time, s.water / ((300 + 105) / SUBLIM_J_PER_KG), (s.batt * 3600) / draw, ((LIOH_KJ - s.lioh) * 1000) / 300) * 0.5 * PASO_MS;
    const dLM = this._dLM(), lm = this.lmPos;
    const bearingLM = lm ? ((Math.atan2(lm.x - this.pos.x, -(lm.z - this.pos.z)) * 180) / Math.PI + 360) % 360 : null;
    const yawDeg = ((((-this.yaw * 180) / Math.PI) % 360) + 360) % 360;
    return { now, inSun, left, aut: Math.min(...Object.values(left)), walkback, dLM, lm, bearingLM, yawDeg };
  }

  /** Dibuja la escena a través del vidrio del casco (sustituye a renderer.render). */
  render(dt) {
    const v = this.view, now = v.now;
    this.visor.render(v.renderer, v.scene, v.camera, dt, {
      giro: this.yaw, incl: this.pitch, dirSol: now ? dir(now.sun.az, now.sun.el) : null, solVisible: now ? now.sun.frac * (this._lit === false ? 0 : 1) : 0,
      fase: this.fpPhase, salto: this.fpHop, carrera: this.fpRun, aliento: Math.min(1, 0.15 + 0.85 * (this.aliento ?? 0) + this.hypo), calidad: 1,
    });
  }

  /** HUD: lo que se mueve con la vista cada fotograma y los textos unas 12 veces por segundo. */
  _hud(dt) {
    const v = this.view, cam = v.camera, W = v.host.clientWidth, H = v.host.clientHeight, vz = this.visor, d = this._data(), now = d.now, s = this.s;
    this.hud.resize(W, H);
    this._colocarEva();
    const lm = d.lm, tg = this.tasks.target;
    const T = {
      lm: lm ? [lm.clone().add(new THREE.Vector3(0, 4, 0)), `LM · ${fmt(d.dLM)} m`] : null,
      sun: now ? [cam.position.clone().addScaledVector(dir(now.sun.az, now.sun.el), 1000), `${tr('SUN', 'SOL')} · ${fmt(now.sun.frac * 100)} %`] : null,
      earth: now ? [cam.position.clone().addScaledVector(dir(now.earth.az, now.earth.el), 1000), now.earth.visible ? tr('EARTH · LINK', 'TIERRA · ENLACE') : tr('EARTH · HIDDEN', 'TIERRA · OCULTA')] : null,
      obj: tg ? [tg.clone().add(new THREE.Vector3(0, 1.1, 0)), `${tr('TARGET', 'OBJETIVO')} · ${fmt(this.pos.distanceTo(tg))} m`] : null,
      crater: this.crater ? [new THREE.Vector3(this.crater.c.x, v.groundY(this.crater.c.x, this.crater.c.z) + 0.5, this.crater.c.z), tr(`CRATER · Ø ${fmt(this.crater.c.rad * 2)} m`, `CRÁTER · Ø ${fmt(this.crater.c.rad * 2)} m`)] : null,
    };
    // Con el ojo de pez del casco, una dirección del mundo cae en pantalla según `direccionAPantalla`
    const sp = { x: 0, y: 0 }, marks = {};
    for (const key in T) {
      if (!T[key]) continue;
      const dv = T[key][0].clone().sub(cam.position).normalize(), th = direccionAPantalla(dv, vz.giro ?? this.yaw, vz.incl ?? this.pitch, sp);
      const x = W / 2 + sp.x * (H / 2), y = H / 2 - sp.y * (H / 2);
      if (th < THETA_MAX * 0.8 && Math.abs(x - W / 2) < W * 0.4 && Math.abs(y - H / 2) < H * 0.36) marks[key] = { x, y, label: T[key][1] };
    }
    const compass = [{ az: 0, label: 'N', cls: 'card' }, { az: 90, label: 'E', cls: 'card' }, { az: 180, label: 'S', cls: 'card' }, { az: 270, label: tr('W', 'O'), cls: 'card' }];
    if (now) compass.push({ az: now.sun.az, label: '☀', cls: now.sun.frac > 0.5 ? 'sun' : 'sun dim' }, { az: now.earth.az, label: '◐', cls: now.earth.visible ? 'earth' : 'earth dim' });
    if (lm) compass.push({ az: d.bearingLM, label: 'LM', cls: 'lm' });
    const ppr = H / 2 / THETA_V; // píxeles por radián en el centro (ojo de pez equidistante)
    this.hud.frame({ yawDeg: d.yawDeg, pitch: this.pitch, ppr, marks, compass, moving: !!this._mv, shift: [vz.desp.x * (H / 2), -vz.desp.y * (H / 2), vz.giroCasco] });
    // Latido del HUD al ritmo del pulso
    // Latido: el corazón del HUD late siempre al ritmo del pulso; el sonido, solo con esfuerzo, susto o falta de aire
    const tension = Math.max(this.hypo, this._crit ? 0.55 : 0, Math.max(0, (s.hr - 95) / 70), this.fatigue > 0.4 ? this.fatigue - 0.4 : 0);
    this._hb = (this._hb ?? 1) - dt; if (!this.lost && this._hb <= 0) { this.hud.beat(); if (tension > 0.08) this.sonido?.latido(Math.min(1, 0.25 + tension)); this._hb = 60 / Math.max(45, s.hr); }
    // Pulso alto: EVA lo dice apuntando a tu pulso en el HUD (no mata, pero cansa y gasta más oxígeno)
    if (s.hr > this.stats.hrMax) this.stats.hrMax = s.hr;
    if (s.hr > 150 && !this.lost) { const t = performance.now(); if (!this._pulsoT || t - this._pulsoT > 60000) { this._pulsoT = t; avisarEva('pulso-alto', undefined, '.sim-vh-rows [data-r="hr"]'); } }
    this._tickT -= dt; if (this._tickT > 0) return; this._tickT = 1 / 12;
    this._tick(d);
  }

  /** EVA dentro del vidrio: abajo a la derecha, sin tapar la retícula, las filas del traje ni las teclas. */
  _colocarEva() {
    const h = this.hud, r = this.view.host.getBoundingClientRect();
    if (!h.W) return;
    const x = Math.round(r.left + h.cx + 0.4 * h.a), y = Math.round(r.top + h.cy + 0.3 * h.b);
    if (this._evaEn && this._evaEn.x === x && this._evaEn.y === y) return;
    this._evaEn = { x, y };
    evaEnCasco(this._evaEn);
  }

  _tick(d) {
    const s = this.s, now = d.now, pct = (f) => fmt(Math.max(0, Math.min(1, f)) * 100) + ' %';
    const F = { o2: s.o2 / O2_KG, co2: 1 - s.lioh / LIOH_KJ, h2o: s.water / WATER_KG, bat: s.batt / BATT_WH };
    const ret = d.dLM == null ? null : 1 - d.dLM / Math.max(1, d.walkback), lmF = this.lm.o2 / LM_O2_KG;
    const gauges = {
      o2: { f: F.o2, value: pct(F.o2), sub: hm(d.left.o2) }, co2: { f: F.co2, value: pct(F.co2), sub: hm(d.left.co2) },
      h2o: { f: F.h2o, value: pct(F.h2o), sub: hm(d.left.h2o) }, bat: { f: F.bat, value: pct(F.bat), sub: hm(d.left.bat) },
      lmr: { f: lmF, value: pct(lmF), sub: tr(`${Math.floor(this.lm.o2 / O2_KG)} recharges`, `${Math.floor(this.lm.o2 / O2_KG)} recargas`) },
      sun: now ? { f: d.inSun ? now.sun.frac : 0, value: d.inSun ? pct(now.sun.frac) : tr('SHADOW', 'SOMBRA'), sub: `elev. ${fmt(now.sun.el, 1)}°`, color: d.inSun ? '#ffd25a' : '#ff5c70' } : { f: null, value: '—' },
      earth: now ? { f: now.earth.visible ? 1 : 0, value: now.earth.visible ? tr('LINK', 'ENLACE') : tr('HIDDEN', 'OCULTA'), sub: `elev. ${fmt(now.earth.el, 1)}°`, color: now.earth.visible ? '#6fb4ff' : '#ff5c70' } : { f: null, value: '—' },
      ret: ret == null ? { f: null, value: '—' } : { f: Math.max(0, ret), value: fmt(d.dLM) + ' m', sub: tr(`limit ${fmt(d.walkback)} m`, `límite ${fmt(d.walkback)} m`) },
    };
    const minis = {
      hr: tr(`${fmt(s.hr)} bpm · ${fmt(s.met)} W`, `${fmt(s.hr)} lpm · ${fmt(s.met)} W`), env: `${fmt(s.press, 1)} kPa · ${fmt(s.temp, 0)} °C`,
      fat: tr(`FATIGUE ${fmt(this.fatigue * 100)} %`, `CANSANCIO ${fmt(this.fatigue * 100)} %`), aut: tr(`AUTONOMY ${hm(d.aut)}`, `AUTONOMÍA ${hm(d.aut)}`),
      leva: tr(`SUN VISOR · ${this.visor.visor === 2 ? 'UP' : 'DOWN'}`, `VISOR SOLAR · ${this.visor.visor === 2 ? 'ARRIBA' : 'ABAJO'}`), lm: d.dLM == null ? 'LM —' : `LM ${fmt(d.dLM)} m · ${fmt(d.bearingLM)}°`,
      dose: tr(`DOSE ${fmt(s.dose, 1)} µSv`, `DOSIS ${fmt(s.dose, 1)} µSv`), walk: tr(`WALKED ${fmt(this.walked)} m`, `RECORRIDO ${fmt(this.walked)} m`),
    };
    const low = F.o2 < 0.25 || F.bat < 0.2;
    const objective = this.tasks.text() && !low ? this.tasks.text()
      : d.dLM > d.walkback ? tr(`Head back to the lander · you are ${fmt(d.dLM)} m away`, `Regresa al módulo lunar · estás a ${fmt(d.dLM)} m`)
        : low ? tr('Go back to the lander and recharge the suit (R)', 'Vuelve al módulo y recarga el traje (R)')
          : tr(`Explore · do not go farther than ${fmt(d.walkback)} m from the lander`, `Explora · no te alejes más de ${fmt(d.walkback)} m del módulo`);
    // Tablero de avisos: Sol y Tierra siempre; lo del traje cuando ocurre
    const alerts = [];
    if (now) {
      alerts.push(d.inSun ? ['ok', tr('Sun visible', 'Sol visible'), tr(`${fmt(now.sun.frac * 100)} % of the disk · elev. ${fmt(now.sun.el, 1)}°`, `${fmt(now.sun.frac * 100)} % del disco · elev. ${fmt(now.sun.el, 1)}°`)]
        : ['warn', tr('In shadow', 'En sombra'), tr('The relief blocks the Sun: cold, and the lamps help (L)', 'El relieve tapa el Sol: frío, y las lámparas ayudan (L)')]);
      alerts.push(now.earth.visible ? ['ok', tr('Earth link', 'Enlace con la Tierra'), tr('radio delay 1.3 s', 'retardo de radio 1,3 s')] : ['warn', tr('No Earth', 'Sin Tierra'), tr('The relief hides the Earth: no link with Houston', 'El relieve tapa la Tierra: sin enlace con Houston')]);
    }
    const cr = this.crater;
    if (cr) {
      const lado = cr.izq ? tr('go around it on the left', 'rodéalo por la izquierda') : tr('go around it on the right', 'rodéalo por la derecha');
      alerts.push(cr.nivel === 'crit' ? ['crit', tr('Crater: do not cross it', 'Cráter: no lo cruces'), tr(`Ø ${fmt(cr.c.rad * 2)} m, ${fmt(cr.c.depth * 1.6, 1)} m deep · ${lado}`, `Ø ${fmt(cr.c.rad * 2)} m y ${fmt(cr.c.depth * 1.6, 1)} m de hondo · ${lado}`), 'crater']
        : ['warn', tr('Crater ahead', 'Cráter delante'), tr(`Ø ${fmt(cr.c.rad * 2)} m · ${lado}`, `Ø ${fmt(cr.c.rad * 2)} m · ${lado}`)]);
    }
    const pe = this.pendiente;
    if (pe) alerts.push(pe.nivel === 'crit' ? ['crit', tr('Slope over the plan limit', 'Pendiente sobre el límite del plan'), tr(`${fmt(pe.s)}° ahead · limit 15° · go back to the route`, `${fmt(pe.s)}° por delante · límite 15° · vuelve a la ruta`), 'crater']
      : ['warn', tr('Steep slope ahead', 'Pendiente fuerte delante'), tr(`${fmt(pe.s)}° · limit 15°`, `${fmt(pe.s)}° · límite 15°`)]);
    if (this.tasks.lejosDeRuta) alerts.push(['warn', tr('Off the planned route', 'Fuera de la ruta planificada'), tr(`${fmt(this.tasks.fueraDeRuta())} m from the route`, `a ${fmt(this.tasks.fueraDeRuta())} m de la ruta`)]);
    if (this.visor.thetaSol < 0.5 && this.visor.visor === 2 && d.inSun) alerts.push(['warn', tr('Glare', 'Deslumbramiento'), tr('Lower the sun visor (G)', 'Baja el visor solar (G)')]);
    const suit0 = alerts.length;
    if (F.o2 < 0.25) alerts.push(['crit', tr('Low O₂ · back to the LM', 'O₂ bajo · vuelve al LM'), tr(`${hm(d.left.o2)} of oxygen left`, `Queda ${hm(d.left.o2)} de oxígeno`)]);
    if (s.lioh / LIOH_KJ > 0.85) alerts.push(['crit', tr('CO₂ · cartridge saturated', 'CO₂ · cartucho saturado'), tr('The scrubber no longer cleans the air', 'El depurador ya no limpia el aire del casco')]);
    if (d.dLM != null && d.dLM > d.walkback) alerts.push(['crit', tr('Past the walk-back limit', 'Fuera del límite de regreso'), tr(`You are ${fmt(d.dLM)} m away; the suit covers ${fmt(d.walkback)} m`, `Estás a ${fmt(d.dLM)} m; el traje alcanza para ${fmt(d.walkback)} m`)]);
    if (F.h2o < 0.2) alerts.push(['warn', tr('Low cooling water', 'Agua de refrigeración baja'), hm(d.left.h2o)]);
    if (F.bat < 0.2) alerts.push(['warn', tr('Low suit battery', 'Batería del traje baja'), hm(d.left.bat)]);
    if (s.hr > 150) alerts.push(['warn', tr('High heart rate', 'Pulso alto'), tr('Slow down', 'Reduce el ritmo')]);
    if (this.fatigue > 0.8) alerts.push(['warn', tr('Exhausted', 'Agotado'), tr('Walk, or stop and catch your breath', 'Camina o párate a recuperar el aliento')]);
    if (alerts.length === suit0) alerts.push(['ok', tr('Suit nominal', 'Traje nominal'), tr(`Autonomy ${hm(d.aut)}`, `Autonomía ${hm(d.aut)}`)]);
    if (this.notice) { alerts.push(['info', this.notice, '']); clearTimeout(this.nT); this.nT = setTimeout(() => { this.notice = null; }, 4500); }
    const rank = { crit: 0, warn: 1, info: 2, ok: 3 }; alerts.sort((a, b) => rank[a[0]] - rank[b[0]]);
    const crit = alerts.find((a) => a[0] === 'crit'), warn = alerts.some((a) => a[0] === 'warn');
    if (!!crit !== this._crit) { this._crit = !!crit; this.sonido?.alarma(!!crit && !this.lost && !this._sinBateria); }
    // Pitido por cada aviso nuevo del tablero
    const titulos = alerts.filter((a) => a[0] === 'warn' || a[0] === 'crit').map((a) => a[1]);
    if (this._titulos && titulos.some((t) => !this._titulos.includes(t))) this.sonido?.blip(!!crit);
    this._titulos = titulos;
    // Lo crítico, a EVA (la de toda la app), como aviso crítico; cada uno como mucho una vez cada 40 s
    if (crit && !this.lost && crit[3] !== 'crater') { // el cráter lo dice EVA con su voz grabada (en _crater)
      const k = 'crit:' + crit[1], t = performance.now(); this._critT ??= {};
      const fila = /O₂/.test(crit[1]) ? 'o2' : /CO₂/.test(crit[1]) ? 'co2' : 'ret';
      if (!this._critT[k] || t - this._critT[k] > 40000) { this._critT[k] = t; avisarEva('aviso-critico', `${crit[1]}. ${crit[2]}.`, `.sim-vh-rows [data-r="${fila}"]`); }
    }
    const estado = crit ? ['crit', tr('CRITICAL', 'CRÍTICO')] : warn ? ['warn', tr('CAUTION', 'PRECAUCIÓN')] : ['ok', 'NOMINAL'];
    const blips = [];
    const tg = this.tasks.target; if (tg) { const dd = this.pos.distanceTo(tg); blips.push({ az: ((Math.atan2(tg.x - this.pos.x, -(tg.z - this.pos.z)) * 180) / Math.PI + 360) % 360, r: Math.min(46, 6 + Math.log10(1 + dd) * 16), cls: 'obj' }); }
    if (now) blips.push({ az: now.sun.az, r: 48, cls: 'sun' }, { az: now.earth.az, r: 48, cls: now.earth.visible ? 'earth' : 'earth off' });
    if (d.lm) blips.push({ az: d.bearingLM, r: Math.min(44, 6 + Math.log10(1 + d.dLM) * 12), cls: 'lm' });
    const r = this.result, rightLevel = !r ? '' : r.kind === 'ok' ? 'ok' : 'warn';
    this.hud.tick({
      yawDeg: d.yawDeg, clock: hh(s.t), timeScale: this.timeScale, site: this.view.siteName ?? '', objective, gauges, minis, alerts: alerts.slice(0, 6), estado, blips,
      left: tr('APOLLO LM · SOUTH POLE', 'APOLLO LM · POLO SUR'), right: { text: r ? r.title : '', level: rightLevel },
      crit: crit ? crit[1] : '', boot: 1, bpm: (120 / Math.max(40, s.hr)).toFixed(2),
      keys: { e: this.tasks._near(0) || this.tasks._near(1), sp: this.jumpY > 0, g: this.visor.visor !== 2, l: this.lamps, r: d.dLM != null && d.dLM < 6, t: this.timeScale > 1, q: false },
    });
  }

  dispose() {
    this.stop();
    for (const [t, ev, fn] of this._on) t.removeEventListener(ev, fn);
    this.tasks.dispose(); this.visor.dispose(); this.hud.dispose();
    this.lampGroup.removeFromParent();
  }
}
