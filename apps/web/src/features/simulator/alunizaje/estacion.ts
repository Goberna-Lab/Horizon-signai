// @ts-nocheck — escena three.js imperativa, como caminata.ts.
// Panel solar y antena: se despliegan en la superficie (tecla P en la caminata; botón en el módulo fijo) a las alturas del
// plan (`?panel=` y `?antena=`, las del Planificador: 2, 5, 10, 15, 20 o 30 m) y dan su informe con el motor del
// Planificador (`equipoEn` en sitio.ts): cuánto Sol recibe el panel y cuánta energía le llega por m², cuánto tiempo ve
// la Tierra la antena, y la noche y el corte de enlace más largos, desde ahora hasta el fin de la estadía (`?estadia=`).
// El panel gira hacia el Sol y la antena apunta a la Tierra, como en el modelo del Planificador.
import * as THREE from 'three';
import { avisarEva } from '@/shared/eva';
import { tr } from '@/shared/i18n';
import { equipoEn } from './sitio';

const fmt = (n, d = 0) => Number(n).toLocaleString(tr('en-US', 'es-ES'), { minimumFractionDigits: d, maximumFractionDigits: d });
const horas = (h) => (h >= 48 ? `${fmt(h / 24, 1)} d` : `${fmt(h, h < 10 ? 1 : 0)} h`);
const D2R = Math.PI / 180;
const dir = (az, el) => new THREE.Vector3(Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), -Math.cos(el * D2R) * Math.cos(az * D2R));

function modelo(panelM, antenaM) {
  const g = new THREE.Group();
  const gris = new THREE.MeshStandardMaterial({ color: 0xbfbcb5, metalness: 0.5, roughness: 0.5 });
  const celdas = new THREE.MeshStandardMaterial({ color: 0x18264f, metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide });
  const blanco = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
  // Mástil del panel (la altura es la del borde inferior del panel, como en el Planificador)
  const mp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, panelM + 1.6, 8), gris); mp.position.y = (panelM + 1.6) / 2; g.add(mp);
  const giro = new THREE.Group(); giro.position.y = panelM + 0.8; g.add(giro);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.04), celdas); giro.add(panel);
  // Mástil de la antena, a 3 m del panel
  const ma = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, antenaM, 8), gris); ma.position.set(3, antenaM / 2, 0); g.add(ma);
  const plato = new THREE.Group(); plato.position.set(3, antenaM, 0); g.add(plato);
  const disco = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 8, 0, Math.PI * 2, 0, 0.9), blanco); disco.rotation.x = Math.PI / 2; plato.add(disco);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, giro, plato };
}

export class Estacion {
  constructor(view) { this.view = view; this.obj = null; this.datos = null; this.card = null; }

  /** Despliega panel y antena en (x, z) en el instante de misión `t` (ms); calcula su informe hasta el fin de la estadía. */
  async desplegar(x, z, t) {
    const v = this.view, p = v.plan ?? {};
    const panelM = p.panelM ?? 2, antenaM = p.antenaM ?? 2, fin = v.tAlunizaje + (p.estadiaH ?? 168) * 3600e3;
    this.quitar();
    const m = modelo(panelM, antenaM); this.obj = m.g; this.giro = m.giro; this.plato = m.plato;
    this.obj.position.set(x, v.groundY(x, z), z); v.scene.add(this.obj);
    this._orientar();
    this._tarjeta(null, panelM, antenaM);
    try {
      this.datos = await equipoEn(v.sitio, t, fin, panelM, antenaM);
      v.equipo = this.datos;
      this._tarjeta(this.datos, panelM, antenaM);
      avisarEva('tarea-hecha', tr(`Panel at ${panelM} m and antenna at ${antenaM} m deployed. The report is on screen.`, `Panel a ${panelM} m y antena a ${antenaM} m desplegados. El informe está en pantalla.`), '.sim-equipo');
    } catch (e) {
      this._tarjeta({ error: true }, panelM, antenaM);
    }
  }

  quitar() { this.obj?.removeFromParent(); this.obj = null; this.datos = null; this.view.equipo = null; this.card?.remove(); this.card = null; }

  /** El panel mira al Sol (vertical, gira en azimut) y el plato apunta a la Tierra. */
  _orientar() {
    const n = this.view.now; if (!n || !this.obj) return;
    this.giro.rotation.y = -n.sun.az * D2R; // la cara del panel hacia el azimut del Sol
    const e = dir(n.earth.az, n.earth.el); this.plato.lookAt(this.plato.getWorldPosition(new THREE.Vector3()).add(e));
  }

  update() { if (this.obj) this._orientar(); }

  _tarjeta(d, panelM, antenaM) {
    this.card?.remove();
    const c = (this.card = document.createElement('div')); c.className = 'sim-equipo';
    const fila = (k, val, sub = '') => `<div><dt>${k}</dt><dd>${val}${sub ? `<small>${sub}</small>` : ''}</dd></div>`;
    c.innerHTML = !d ? `<small>${tr('PANEL AND ANTENNA', 'PANEL Y ANTENA')}</small><b>${tr('Deploying…', 'Desplegando…')}</b>`
      : d.error ? `<small>${tr('PANEL AND ANTENNA', 'PANEL Y ANTENA')}</small><b>${tr('No ephemeris for this date', 'Sin efemérides para esta fecha')}</b>`
      : `<small>${tr('PANEL AND ANTENNA · DEPLOYED', 'PANEL Y ANTENA · DESPLEGADOS')}</small>
      <b>${tr(`Next ${horas(d.horas)} of the stay`, `Próximas ${horas(d.horas)} de la estadía`)}</b>
      <dl>
        ${fila(tr(`Panel at ${panelM} m · Sun`, `Panel a ${panelM} m · Sol`), `${fmt(d.sunPct)} %`, tr(`${horas(d.sunH)} in sunlight`, `${horas(d.sunH)} al Sol`))}
        ${fila(tr('Energy reaching the panel', 'Energía que llega al panel'), `${fmt(d.energiaKWhM2, 1)} kWh/m²`, tr(`mean ${fmt(d.meanPanelWm2)} W/m²`, `media ${fmt(d.meanPanelWm2)} W/m²`))}
        ${fila(tr('Longest night', 'Noche más larga'), horas(d.longestNightH), tr('what the battery must cover', 'lo que debe cubrir la batería'))}
        ${fila(tr(`Antenna at ${antenaM} m · Earth`, `Antena a ${antenaM} m · Tierra`), `${fmt(d.earthPct)} %`, tr(`${horas(d.earthH)} with a direct link`, `${horas(d.earthH)} con enlace directo`))}
        ${fila(tr('Longest link gap', 'Corte de enlace más largo'), horas(d.longestSilenceH))}
        ${fila(tr('Sun and Earth together', 'Sol y Tierra a la vez'), `${fmt(d.bothPct)} %`)}
        ${fila(tr('Right now', 'Ahora mismo'), `${d.ahora.sol > 0 ? tr('Sun', 'Sol') : tr('no Sun', 'sin Sol')} · ${d.ahora.tierra > 0 ? tr('Earth', 'Tierra') : tr('no Earth', 'sin Tierra')}`, `${fmt(d.ahora.wm2)} W/m²`)}
      </dl>
      <p>${tr('Planner engine (JPL DE441 ephemeris and this site\'s horizon), every 10 min: the Sun seen from the panel height, the Earth from the antenna height, at the same ground point. Vertical panel turning towards the Sun (Planner assumption); energy per m² reaching it, not electrical output.', 'Motor del Planificador (efemérides DE441 de JPL y el horizonte de este sitio), cada 10 min: el Sol visto desde la altura del panel y la Tierra desde la de la antena, en el mismo punto del terreno. Panel vertical que gira hacia el Sol (supuesto del Planificador); energía que le llega por m², no la eléctrica.')}</p>
      <div class="sim-lfp-end-acts"><button type="button" data-act="ok">${tr('Close', 'Cerrar')}</button></div>`;
    c.addEventListener('click', (e) => { if (e.target.closest?.('[data-act=ok]')) c.remove(); });
    this.view.host.append(c);
  }

  dispose() { this.quitar(); }
}
