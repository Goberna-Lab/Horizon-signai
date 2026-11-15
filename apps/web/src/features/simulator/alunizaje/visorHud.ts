// @ts-nocheck — portado de nuestro simulador NASA (visorHud.js, JavaScript); el tipado estricto queda pendiente.
// HUD del visor del casco durante la caminata: nada de paneles ni cajas. Todo sigue la curva del vidrio: brújula curva
// arriba, rumbo y reloj de la EVA, horizonte y escalera de inclinación, retícula, marcas sobre el vidrio (módulo lunar,
// Sol, Tierra), radar y una línea de estado. La geometría se calcula en píxeles a partir del tamaño real de la pantalla
// (superelipse del visor). Fase 1 de la caminata: sin los consumibles del traje (llegan con las mini misiones).
import { tr } from '@/shared/i18n';
import './visorHud.css';

const N = 3.4; // exponente de la superelipse que sigue la abertura del casco
const KEYS = [
  ['wasd', 'WASD', tr('Walk', 'Caminar')], ['shift', '⇧', tr('Lope', 'Galope')], ['sp', '␣', tr('Jump', 'Saltar')],
  ['g', 'G', tr('Sun visor', 'Visor solar')], ['r', 'R', tr('Fly again', 'Volver a volar')],
];

export class VisorHud {
  constructor(host) {
    const root = document.createElement('div');
    root.className = 'sim-vh'; root.hidden = true;
    root.innerHTML = `
      <svg class="sim-vh-compass" aria-hidden="true"><path class="tk"/><path class="tk2"/><g class="lb">${'<text></text>'.repeat(8)}</g></svg>
      <div class="sim-vh-head"><i></i><b data-k="hdg">000°</b><span><small>EVA</small> <em data-k="clock">00:00:00</em></span><span class="site" data-k="site"></span></div>
      <div class="sim-vh-feed"><header><small>${tr('STATUS', 'ESTADO')}</small><b data-k="estado">—</b></header><div class="sim-vh-alerts"></div></div>
      <div class="sim-vh-lens radar"><svg class="ring r1" viewBox="-70 -70 140 140"><circle r="67"/></svg><svg class="ring r2" viewBox="-70 -70 140 140"><circle r="62"/></svg>
        <svg class="ring r4" viewBox="-70 -70 140 140"><circle r="56" pathLength="360"/></svg><i class="sweep"></i>
        <svg class="scope" viewBox="-60 -60 120 120"><circle r="52"/><circle r="34"/><circle r="16"/><path d="M-52 0h104M0 -52v104"/><g class="blips"></g><path class="me" d="M0 -5L4 4L0 2L-4 4Z"/></svg></div>
      <div class="sim-vh-horizon"><i></i></div>
      <div class="sim-vh-ladder"><div>${[-60, -45, -30, -15, 15, 30, 45, 60].map((d) => `<i style="--d:${d}" class="${d < 0 ? 'neg' : ''}"><b>${Math.abs(d)}</b></i>`).join('')}</div></div>
      <div class="sim-vh-reticle"><svg class="a" viewBox="-50 -50 100 100"><circle r="34"/></svg><svg class="b" viewBox="-50 -50 100 100"><circle r="44"/></svg>
        <svg class="c" viewBox="-50 -50 100 100"><path d="M-48 0h12M36 0h12M0 -48v12M0 36v12"/><circle r="1.6"/></svg></div>
      <div class="sim-vh-marks">${['lm', 'sun', 'earth'].map((k) => `<div class="mk ${k}" data-t="${k}"><u></u><em></em><b></b></div>`).join('')}</div>
      <div class="sim-vh-keys">${KEYS.map(([k, g, n]) => `<span data-key="${k}"><b>${g}</b><i>${n}</i></span>`).join('')}</div>`;
    host.append(root);
    this.root = root; this.$ = (s) => root.querySelector(s);
    this.cache = {};
  }

  /* ---------- geometría del vidrio ---------- */
  pt(t, k = 1) {
    const r = (t * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), e = 2 / N;
    return [this.cx + this.a * k * Math.sign(c) * Math.abs(c) ** e, this.cy - this.b * k * Math.sign(s) * Math.abs(s) ** e];
  }
  /** x del contorno (escala k) a la altura y; lado −1 izquierda, +1 derecha. */
  edgeX(y, k, side) { const q = Math.min(0.999, Math.abs(this.cy - y) / (this.b * k)); return this.cx + side * this.a * k * (1 - q ** N) ** (1 / N); }

  resize(W, H) {
    if (W === this.W && H === this.H) return;
    Object.assign(this, { W, H, cx: W / 2, cy: H * 0.5, a: W * 0.462, b: H * 0.492 }); // la abertura del casco llega casi a los bordes
    const u = Math.min(H / 900, W / 1600); this.u = u;
    this.root.style.setProperty('--u', u.toFixed(3));
    for (const s of this.root.querySelectorAll(':scope > svg')) s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.cache = {};
    // Radar arriba a la izquierda y estado arriba a la derecha, apoyados en el vidrio
    const radar = this.$('.sim-vh-lens.radar');
    radar.style.left = this.cx - 0.63 * this.a + 'px'; radar.style.top = this.cy - 0.6 * this.b + 'px';
    const fy = this.cy - 0.74 * this.b, feed = this.$('.sim-vh-feed'); feed.style.top = fy + 'px'; feed.style.right = this.W - this.edgeX(fy + 60 * u, 0.9, 1) + 'px';
    // Teclas a lo largo del borde de abajo
    const keys = [...this.root.querySelectorAll('.sim-vh-keys span')];
    keys.forEach((el, i) => { const t = 252 + (36 * i) / Math.max(1, keys.length - 1), p = this.pt(t, 0.855), q = this.pt(t + 0.5, 0.855); el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px'; el.style.rotate = Math.atan2(q[1] - p[1], q[0] - p[0]) + 'rad'; });
    this.$('.sim-vh-head').style.top = this.pt(90, 0.9)[1] + 30 * u + 'px';
  }

  set(key, el, text) { if (this.cache[key] !== text) { this.cache[key] = text; el.textContent = text; } }

  /** Cada fotograma: brújula curva, horizonte, escalera, marcadores y pegado al vidrio. */
  frame({ yawDeg, pitch, ppr, marks, shift, compass, moving }) {
    this.root.style.translate = `${shift[0].toFixed(1)}px ${shift[1].toFixed(1)}px`;
    this.root.style.rotate = `${(shift[2] || 0).toFixed(4)}rad`;
    const py = pitch * ppr;
    this.$('.sim-vh-horizon i').style.transform = `translateY(${py}px)`;
    const lad = this.$('.sim-vh-ladder'), ppd = ((ppr * Math.PI) / 180).toFixed(2);
    if (this.cache.ppd !== ppd) { this.cache.ppd = ppd; lad.style.setProperty('--ppd', ppd); }
    lad.firstChild.style.transform = `translateY(${py}px)`;
    if (this.cache.mv !== moving) { this.cache.mv = moving; this.root.classList.toggle('mv', moving); }
    for (const el of this.root.querySelectorAll('.sim-vh-marks .mk')) {
      const m = marks[el.dataset.t];
      el.hidden = !m; if (!m) continue;
      el.style.transform = `translate(${m.x}px, ${m.y}px)`; this.set('mk' + el.dataset.t, el.lastChild, m.label);
    }
    // Brújula sobre el arco superior: 1° de rumbo = SPAN/FOV grados de arco
    const key = yawDeg.toFixed(1) + compass.map((c) => c.az.toFixed(0)).join();
    if (this.cache.cmp === key) return; this.cache.cmp = key;
    const FOV = 100, SPAN = 52, at = (dd, k) => this.pt(90 - (dd / (FOV / 2)) * (SPAN / 2), k);
    let d1 = '', d2 = '';
    const first = Math.ceil((yawDeg - FOV / 2) / 5) * 5;
    for (let az = first; az <= yawDeg + FOV / 2; az += 5) {
      const dd = az - yawDeg, big = ((az % 15) + 15) % 15 === 0, p = at(dd, 0.93), q = at(dd, big ? 0.885 : 0.905);
      const s = `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`; if (big) d2 += s; else d1 += s;
    }
    this.$('.sim-vh-compass .tk').setAttribute('d', d1); this.$('.sim-vh-compass .tk2').setAttribute('d', d2);
    const T = this.$('.sim-vh-compass .lb').children; let n = 0;
    for (const c of compass) {
      const dd = ((c.az - yawDeg + 540) % 360) - 180;
      if (Math.abs(dd) > FOV / 2 - 2 || n >= T.length) continue;
      const p = at(dd, 0.845), el = T[n++];
      el.setAttribute('x', p[0].toFixed(1)); el.setAttribute('y', p[1].toFixed(1)); el.setAttribute('class', c.cls);
      el.setAttribute('transform', `rotate(${(dd * 0.24).toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
      if (el.textContent !== c.label) el.textContent = c.label;
    }
    for (; n < T.length; n++) if (T[n].textContent) T[n].textContent = '';
  }

  /** Unas 12 veces por segundo: rumbo, reloj, sitio, radar, estado y teclas. */
  tick(D) {
    if (!this.W) return; // aún sin geometría (se calcula en el primer fotograma)
    this.set('hdg', this.$('[data-k="hdg"]'), String(Math.round(D.yawDeg) % 360).padStart(3, '0') + '°');
    this.set('clock', this.$('[data-k="clock"]'), D.clock);
    this.set('site', this.$('[data-k="site"]'), D.site);
    const c = this.cache;
    const blips = D.blips.map((b) => { const a = ((b.az - D.yawDeg) * Math.PI) / 180; return `<circle class="${b.cls}" cx="${(Math.sin(a) * b.r).toFixed(1)}" cy="${(-Math.cos(a) * b.r).toFixed(1)}" r="3"/>`; }).join('');
    if (c.blips !== blips) { c.blips = blips; this.$('.scope .blips').innerHTML = blips; }
    // Tablero: una línea por cosa que está pasando
    const list = this.$('.sim-vh-alerts'), html = D.alerts.map(([cl, t, sub]) => `<p class="${cl}"><b>${t}</b><small>${sub ?? ''}</small></p>`).join('');
    if (c.alerts !== html) { c.alerts = html; list.innerHTML = html; }
    this.set('estado', this.$('[data-k="estado"]'), D.estado[1]);
    if (c.est !== D.estado[0]) { c.est = D.estado[0]; this.$('.sim-vh-feed').className = 'sim-vh-feed ' + D.estado[0]; }
    for (const el of this.root.querySelectorAll('.sim-vh-keys span')) { const on = !!D.keys[el.dataset.key]; if (el._on !== on) { el._on = on; el.classList.toggle('on', on); } }
  }

  dispose() { this.root.remove(); }
}
