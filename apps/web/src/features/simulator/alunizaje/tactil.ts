// @ts-nocheck — escena imperativa, como caminata.ts.
// Controles táctiles para celular y tableta: el simulador se juega con teclado y ratón; aquí la pantalla los imita.
//   · Palanca (abajo a la izquierda): W/A/S/D. Caminando avanza y gira; con el rover acelera y dobla.
//   · Arrastrar en el resto de la pantalla: mirar alrededor (caminata).
//   · Botones (abajo a la derecha): las teclas de cada momento (E recoger o medir, salto, luces, visor solar, tiempo, volver).
//   · En el descenso: «Saltar» (Enter) y nada más, como en el escritorio.
// Cada botón manda la misma tecla que el teclado (KeyboardEvent en window), así la lógica es una sola.
import { tr } from '@/shared/i18n';

export const esTactil = () => window.matchMedia?.('(pointer: coarse)').matches || new URLSearchParams(location.search).has('tactil');

const tecla = (code, tipo) => window.dispatchEvent(new KeyboardEvent(tipo, { code, key: code, bubbles: true }));
const pulsar = (code) => { tecla(code, 'keydown'); setTimeout(() => tecla(code, 'keyup'), 60); };

export class Tactil {
  constructor(view, { sim, caminata, rover }) {
    this.view = view; this.sim = sim; this.caminata = caminata; this.rover = rover;
    const r = (this.root = document.createElement('div')); r.className = 'sim-tactil';
    r.innerHTML = `
      <div class="sim-tc-palanca" data-z="palanca"><i></i></div>
      <div class="sim-tc-botones" data-z="botones"></div>
      <button type="button" class="sim-tc-saltar" data-k="Enter">${tr('Skip ⏭', 'Saltar ⏭')}</button>`;
    view.host.append(r); view.host.classList.add('sim-es-tactil');
    this.palanca = r.querySelector('.sim-tc-palanca'); this.pomo = this.palanca.querySelector('i');
    this.botones = r.querySelector('.sim-tc-botones'); this.saltar = r.querySelector('.sim-tc-saltar');
    this.apretadas = new Set(); this.modo = '';
    // Palanca
    let id = null, c0 = null;
    const mover = (e) => {
      const dx = Math.max(-1, Math.min(1, (e.clientX - c0.x) / 50)), dy = Math.max(-1, Math.min(1, (e.clientY - c0.y) / 50));
      this.pomo.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
      const quiero = new Set();
      if (dy < -0.3) quiero.add('KeyW'); if (dy > 0.3) quiero.add('KeyS'); if (dx < -0.35) quiero.add('KeyA'); if (dx > 0.35) quiero.add('KeyD');
      for (const k of this.apretadas) if (!quiero.has(k)) { tecla(k, 'keyup'); this.apretadas.delete(k); }
      for (const k of quiero) if (!this.apretadas.has(k)) { tecla(k, 'keydown'); this.apretadas.add(k); }
    };
    const soltar = () => { id = null; this.pomo.style.transform = ''; for (const k of this.apretadas) tecla(k, 'keyup'); this.apretadas.clear(); };
    this.palanca.addEventListener('pointerdown', (e) => { id = e.pointerId; const b = this.palanca.getBoundingClientRect(); c0 = { x: b.left + b.width / 2, y: b.top + b.height / 2 }; this.palanca.setPointerCapture(id); mover(e); e.preventDefault(); });
    this.palanca.addEventListener('pointermove', (e) => { if (e.pointerId === id) mover(e); });
    this.palanca.addEventListener('pointerup', soltar); this.palanca.addEventListener('pointercancel', soltar);
    // Mirar: arrastrar sobre la escena (no sobre los controles)
    let mirar = null;
    this._down = (e) => { if (e.pointerType !== 'touch' || !this.caminata.active || e.target.closest?.('.sim-tactil button, .sim-tc-palanca, .sim-informe')) return; mirar = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
    this._move = (e) => {
      if (!mirar || e.pointerId !== mirar.id) return;
      const c = this.caminata; c.yaw -= (e.clientX - mirar.x) * 0.005; c.pitch = Math.max(-1.1, Math.min(1.0, c.pitch - (e.clientY - mirar.y) * 0.005));
      mirar.x = e.clientX; mirar.y = e.clientY;
    };
    this._up = (e) => { if (mirar && e.pointerId === mirar.id) mirar = null; };
    window.addEventListener('pointerdown', this._down); window.addEventListener('pointermove', this._move); window.addEventListener('pointerup', this._up);
    r.addEventListener('click', (e) => { const b = e.target.closest?.('button[data-k]'); if (b) pulsar(b.dataset.k); });
  }

  /** Qué se muestra en cada momento: descenso, caminata, rover o nada (tarjetas e informe usan sus propios botones). */
  update() {
    const camina = this.caminata.active && !this.caminata.lost, rueda = this.rover.active, baja = this.sim.state === 'descent';
    const modo = camina ? 'caminata' : rueda ? 'rover' : baja ? 'descenso' : '';
    if (modo === this.modo) return;
    this.modo = modo;
    this.palanca.hidden = !(camina || rueda); this.saltar.hidden = !baja;
    const B = (k, txt) => `<button type="button" data-k="${k}">${txt}</button>`;
    this.botones.innerHTML = camina ? B('KeyE', tr('Collect', 'Recoger')) + B('Space', tr('Jump', 'Saltar')) + B('KeyL', tr('Lights', 'Luces')) + B('KeyG', tr('Visor', 'Visor')) + B('KeyR', tr('Recharge', 'Recargar')) + B('KeyT', tr('Time', 'Tiempo')) + B('KeyQ', tr('Fly again', 'Volar')) + B('KeyH', 'EVA')
      : rueda ? B('KeyE', tr('Measure', 'Medir')) + B('KeyL', tr('Lights', 'Luces')) + B('KeyT', tr('Time', 'Tiempo')) + B('KeyI', tr('Report', 'Informe')) + B('KeyQ', tr('Fly again', 'Volar')) + B('KeyH', 'EVA') : '';
  }

  dispose() {
    window.removeEventListener('pointerdown', this._down); window.removeEventListener('pointermove', this._move); window.removeEventListener('pointerup', this._up);
    this.root.remove(); this.view.host.classList.remove('sim-es-tactil');
  }
}
