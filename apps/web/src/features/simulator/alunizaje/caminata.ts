// @ts-nocheck — portado de nuestro simulador NASA (scene3d.js y eva.js, JavaScript); el tipado estricto queda pendiente.
// Caminata con el casco puesto, después del primer paso: el astronauta camina en primera persona sobre el relieve real
// del sitio, a 1/6 de gravedad, y se ve el mundo a través del vidrio del casco (VisorCasco) con su HUD (VisorHud).
//  · WASD / flechas: caminar respecto a la mirada · Shift: galope · Espacio: salto (~1,2 m y 2,5 s en el aire)
//  · Ratón: mirar (clic para capturar el puntero, o arrastrando) · G: visor solar dorado.
//  · Cuesta arrancar y frenar (no hay con qué empujar en el aire) y no se atraviesa el módulo lunar.
//  · EVA (la de toda la app) lo comenta con `avisarEva`: primeros pasos, un salto alto, alejarse del módulo.
// Fase 1: sin los consumibles del traje ni las tareas (llegan con las mini misiones).
import * as THREE from 'three';
import { avisarEva } from '@/shared/eva';
import { tr } from '@/shared/i18n';
import { VisorCasco, THETA_V, THETA_MAX, direccionAPantalla } from './casco/visorCasco';
import { VisorHud } from './visorHud';

const G = 1.62;
const EYE = 1.68;        // altura de los ojos (m)
const LM_R = 2.9;        // radio del módulo lunar que no se puede atravesar (m)
const LEJOS_M = 150;     // a partir de aquí EVA avisa de que estamos lejos del módulo
const D2R = Math.PI / 180;
const dir = (az, el) => new THREE.Vector3(Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), -Math.cos(el * D2R) * Math.cos(az * D2R));
const fmt = (n, d = 0) => n.toLocaleString(tr('en-US', 'es-ES'), { minimumFractionDigits: d, maximumFractionDigits: d });
const hh = (t) => { t = Math.max(0, Math.floor(t)); return [t / 3600, (t % 3600) / 60, t % 60].map((x) => String(Math.floor(x)).padStart(2, '0')).join(':'); };
const enCampo = (e) => !!e.target?.closest?.('input,select,textarea,button,[contenteditable="true"]');

export class Caminata {
  constructor(view, { onSalir } = {}) {
    this.view = view; this.onSalir = onSalir;
    this.active = false;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.heading = 0; this.yaw = 0; this.pitch = -0.08;
    this.keys = new Set();
    this.visor = new VisorCasco(); this.visor.exposicion = 2.6; // la escena usa un Sol de intensidad 3,2 (el paquete se ajustó para 12)
    this.hud = new VisorHud(view.host);
    this.el = view.renderer.domElement;
    let drag = false;
    this._on = [
      [window, 'keydown', (e) => {
        if (!this.active || enCampo(e)) return;
        this.keys.add(e.code);
        if (e.code === 'Space' && !e.repeat) { this._jumpReq = true; e.preventDefault(); }
        if (e.code === 'KeyG' && !e.repeat) this.visor.visor = this.visor.visor === 2 ? 1 : 2; // visor solar: arriba ↔ abajo
        if (e.code === 'KeyR' && !e.repeat) this.onSalir?.();
        if (/^(Arrow|Key[WASD]$)/.test(e.code)) e.preventDefault();
      }],
      [window, 'keyup', (e) => this.keys.delete(e.code)],
      [window, 'blur', () => this.keys.clear()],
      [this.el, 'click', () => { if (this.active && document.pointerLockElement !== this.el) this.el.requestPointerLock?.()?.catch?.(() => {}); }],
      [this.el, 'pointerdown', () => { drag = true; }],
      [window, 'pointerup', () => { drag = false; }],
      [window, 'mousemove', (e) => {
        if (!this.active || (document.pointerLockElement !== this.el && !drag)) return;
        this.yaw -= e.movementX * 0.0025;
        this.pitch = Math.max(-1.1, Math.min(1.0, this.pitch - e.movementY * 0.0025));
      }],
    ];
    for (const [t, ev, fn] of this._on) t.addEventListener(ev, fn);
  }

  /** Empieza la caminata en `pos`, mirando hacia `heading` (rumbo del cuerpo), junto al módulo en `lmPos`. */
  start(pos, heading, lmPos) {
    const v = this.view;
    this.active = true; this.t = 0; this.walked = 0; this.events = new Set();
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.lmPos = lmPos?.clone() ?? null;
    this.heading = heading; this.yaw = heading + Math.PI; this.pitch = -0.08;
    this.jumpY = 0; this.jumpV = 0; this.fpPhase = 0; this.fpHop = 0; this.fpRun = 0; this._tickT = 0;
    this.visor.reiniciar(); this.visor.visor = 2;
    v.astro.object.visible = false; v.astro.dust.visible = true; // en primera persona el cuerpo no se ve; el polvo de los pasos sí
    v.camera.fov = 70; v.camera.updateProjectionMatrix();
    this.hud.root.hidden = false; this.hud.root.classList.remove('boot'); void this.hud.root.offsetWidth; this.hud.root.classList.add('boot');
  }

  stop() {
    this.active = false; this.keys.clear();
    this.hud.root.hidden = true;
    if (document.pointerLockElement === this.el) document.exitPointerLock?.();
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  update(dtReal) {
    if (!this.active) return;
    const v = this.view, dt = Math.min(0.05, dtReal), k = this.keys;
    this.t += dt;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const lope = k.has('ShiftLeft') || k.has('ShiftRight');
    // Gravedad lunar: cuesta arrancar y frenar, y los saltos son lentos y altos
    const vel = this.vel, want = new THREE.Vector3(), air = this.jumpY > 0;
    if (fwd || side) {
      const camDir = this.forward(), right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
      want.copy(camDir.multiplyScalar(fwd).add(right.multiplyScalar(side)).normalize()).multiplyScalar(lope ? 3.4 : 1.3);
    }
    if (!air) vel.lerp(want, Math.min(1, dt / (want.lengthSq() > vel.lengthSq() ? 0.4 : 0.7))); // en el aire no hay con qué empujar
    if (vel.lengthSq() < 1e-4 && !want.lengthSq()) vel.set(0, 0, 0);
    if (this._jumpReq && !air) { this.jumpV = 2.0; this.jumpY = 1e-4; }
    this._jumpReq = false;
    if (this.jumpY > 0) {
      this.jumpV -= G * dt; this.jumpY += this.jumpV * dt;
      if (this.jumpY <= 0) { const v0 = -this.jumpV; this.jumpY = 0; this.jumpV = 0; if (v0 > 1.4) avisarEva('salto'); }
    }
    const speed = vel.length();
    if (speed > 0) {
      const before = this.pos.clone();
      this.pos.addScaledVector(vel, dt);
      if (this.lmPos) { // no atravesar el módulo lunar
        const dx = this.pos.x - this.lmPos.x, dz = this.pos.z - this.lmPos.z, d = Math.hypot(dx, dz);
        if (d < LM_R) { this.pos.x = this.lmPos.x + (dx / (d || 1)) * LM_R; this.pos.z = this.lmPos.z + (dz / (d || 1)) * LM_R; }
      }
      this.walked += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    }
    this.heading = this.yaw + Math.PI;
    this.pos.y = v.groundY(this.pos.x, this.pos.z) + this.jumpY;
    v.astro.object.position.copy(this.pos); v.astro.object.rotation.y = this.heading;
    v.astro.update(dt, speed);
    // Ojos a 1,68 m con el rebote del paso lunar: en la Luna no se corre, se avanza a zancadas (cada una un pequeño vuelo)
    const ground = !air, ph0 = this.fpPhase;
    const run = Math.max(0, Math.min(1, (speed - 1.5) / 1.6)), sps = 1.55 - 0.5 * run; // apoyos por segundo
    this.fpPhase = ph0 + dt * Math.PI * sps * (speed > 0.15 && ground ? 1 : 0);
    const u = (this.fpPhase / Math.PI) % 1, hop = speed > 0.15 && ground ? 4 * u * (1 - u) : 0;
    this.fpHop += (hop - this.fpHop) * Math.min(1, dt * 18); this.fpRun = run;
    const cam = v.camera;
    cam.position.set(this.pos.x, this.pos.y + EYE + this.fpHop * (0.045 + 0.2 * run), this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // EVA (la de toda la app): lo comenta con sus propias reglas de frecuencia
    const once = (key, fn) => { if (!this.events.has(key)) { this.events.add(key); fn(); } };
    if (this.walked > 4) once('primeros', () => avisarEva('primeros-pasos'));
    const dLM = this.lmPos ? Math.hypot(this.pos.x - this.lmPos.x, this.pos.z - this.lmPos.z) : null;
    if (dLM != null && dLM > LEJOS_M) once('lejos', () => avisarEva('lejos'));
    this._mv = speed > 0.15;
    this._hud(dt, dLM);
  }

  /** Dibuja la escena a través del vidrio del casco (sustituye a renderer.render). */
  render(dt) {
    const v = this.view, now = v.now;
    this.visor.render(v.renderer, v.scene, v.camera, dt, {
      giro: this.yaw, incl: this.pitch, dirSol: now ? dir(now.sun.az, now.sun.el) : null, solVisible: now ? now.sun.frac : 0,
      fase: this.fpPhase, salto: this.fpHop, carrera: this.fpRun, aliento: null, calidad: 1,
    });
  }

  /** HUD: lo que se mueve con la vista cada fotograma y los textos unas 12 veces por segundo. */
  _hud(dt, dLM) {
    const v = this.view, cam = v.camera, now = v.now, W = v.host.clientWidth, H = v.host.clientHeight, vz = this.visor;
    this.hud.resize(W, H);
    const lm = this.lmPos;
    const T = {
      lm: lm ? [lm.clone().add(new THREE.Vector3(0, 4, 0)), `LM · ${fmt(dLM)} m`] : null,
      sun: now ? [cam.position.clone().addScaledVector(dir(now.sun.az, now.sun.el), 1000), `${tr('SUN', 'SOL')} · ${fmt(now.sun.frac * 100)} %`] : null,
      earth: now ? [cam.position.clone().addScaledVector(dir(now.earth.az, now.earth.el), 1000), now.earth.visible ? tr('EARTH · LINK', 'TIERRA · ENLACE') : tr('EARTH · HIDDEN', 'TIERRA · OCULTA')] : null,
    };
    // Con el ojo de pez del casco, una dirección del mundo cae en pantalla según `direccionAPantalla`
    const sp = { x: 0, y: 0 }, marks = {};
    for (const key in T) {
      if (!T[key]) continue;
      const dv = T[key][0].clone().sub(cam.position).normalize(), th = direccionAPantalla(dv, vz.giro ?? this.yaw, vz.incl ?? this.pitch, sp);
      const x = W / 2 + sp.x * (H / 2), y = H / 2 - sp.y * (H / 2);
      if (th < THETA_MAX * 0.8 && Math.abs(x - W / 2) < W * 0.4 && Math.abs(y - H / 2) < H * 0.36) marks[key] = { x, y, label: T[key][1] };
    }
    const yawDeg = ((((-this.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const bearingLM = lm ? ((Math.atan2(lm.x - this.pos.x, -(lm.z - this.pos.z)) * 180) / Math.PI + 360) % 360 : null;
    const compass = [{ az: 0, label: 'N', cls: 'card' }, { az: 90, label: 'E', cls: 'card' }, { az: 180, label: 'S', cls: 'card' }, { az: 270, label: tr('W', 'O'), cls: 'card' }];
    if (now) compass.push({ az: now.sun.az, label: '☀', cls: now.sun.frac > 0.5 ? 'sun' : 'sun dim' }, { az: now.earth.az, label: '◐', cls: now.earth.visible ? 'earth' : 'earth dim' });
    if (lm) compass.push({ az: bearingLM, label: 'LM', cls: 'lm' });
    const ppr = H / 2 / THETA_V; // píxeles por radián en el centro (ojo de pez equidistante)
    this.hud.frame({ yawDeg, pitch: this.pitch, ppr, marks, compass, moving: !!this._mv, shift: [vz.desp.x * (H / 2), -vz.desp.y * (H / 2), vz.giroCasco] });
    this._tickT -= dt; if (this._tickT > 0) return; this._tickT = 1 / 12;
    const blips = [];
    if (now) blips.push({ az: now.sun.az, r: 48, cls: 'sun' }, { az: now.earth.az, r: 48, cls: now.earth.visible ? 'earth' : 'earth off' });
    if (lm) blips.push({ az: bearingLM, r: Math.min(44, 6 + Math.log10(1 + dLM) * 12), cls: 'lm' });
    const alerts = [['', `LM ${fmt(dLM ?? 0)} m · ${fmt(bearingLM ?? 0)}°`, tr(`walked ${fmt(this.walked)} m`, `recorrido ${fmt(this.walked)} m`)]];
    if (now && !now.earth.visible) alerts.push(['warn', tr('No Earth link', 'Sin enlace con la Tierra'), tr('Earth below the horizon', 'Tierra bajo el horizonte')]);
    if (dLM != null && dLM > LEJOS_M) alerts.push(['warn', tr('Far from the LM', 'Lejos del LM'), tr('head back', 'regresa')]);
    if (vz.thetaSol < 0.5 && vz.visor === 2 && now?.sun.frac > 0.3) alerts.push(['warn', tr('Glare', 'Deslumbramiento'), tr('lower the sun visor (G)', 'baja el visor solar (G)')]);
    const estado = alerts.some((a) => a[0] === 'warn') ? ['warn', tr('CHECK', 'REVISA')] : ['ok', tr('NOMINAL', 'NOMINAL')];
    this.hud.tick({
      yawDeg, clock: hh(this.t), site: v.siteName ?? '', blips, alerts, estado,
      keys: { wasd: this._mv, shift: this.fpRun > 0.2, sp: this.jumpY > 0, g: vz.visor !== 2, r: false },
    });
  }

  dispose() {
    this.stop();
    for (const [t, ev, fn] of this._on) t.removeEventListener(ev, fn);
    this.visor.dispose(); this.hud.dispose();
  }
}
