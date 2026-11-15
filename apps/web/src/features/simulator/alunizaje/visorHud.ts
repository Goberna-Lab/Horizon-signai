// @ts-nocheck — portado de nuestro simulador NASA (visorHud.js, JavaScript); el tipado estricto queda pendiente.
// HUD del visor del casco durante la caminata: nada de paneles ni cajas. Todo sigue la curva del vidrio: una pista recorre
// el borde, los indicadores del traje son tramos de arco pegados al contorno, los textos se apoyan en la curva y los únicos
// elementos cerrados son lentes circulares (radar). La geometría se calcula en píxeles a partir del tamaño real de la
// pantalla (superelipse del visor). Sin dependencias: el encendido es una animación CSS.
import { tr } from '@/shared/i18n';
import './visorHud.css';

const N = 3.4; // exponente de la superelipse que sigue la abertura del casco
const lvl = (f) => (f > 0.5 ? '#6dffc0' : f > 0.25 ? '#ffc04d' : '#ff5c70');
const KEYS = [
  ['e', 'E', tr('Collect', 'Recoger')], ['b', 'B', tr('Deploy', 'Instalar')], ['f', 'F', tr('Flag', 'Bandera')], ['sp', '␣', tr('Jump', 'Saltar')],
  ['g', 'G', tr('Sun visor', 'Visor solar')], ['l', 'L', tr('Lamps', 'Luces')], ['r', 'R', tr('Recharge', 'Recarga')], ['t', 'T', tr('Time', 'Tiempo')],
  ['q', 'Q', tr('Fly again', 'Volver a volar')],
];
const LEFT = [['o2', 'O₂'], ['co2', 'CO₂'], ['h2o', 'H₂O'], ['bat', tr('BAT', 'BAT')]];
const RIGHT = [['lmr', tr('LM STORES', 'RESERVAS LM')], ['sun', tr('SUN', 'SOL')], ['earth', tr('EARTH', 'TIERRA')], ['ret', tr('RETURN', 'REGRESO')]];
const SEG = 10; // divisiones de cada tramo de arco
const BOOT = [tr('PRESSURE', 'PRESIÓN'), tr('OXYGEN', 'OXÍGENO'), tr('CO₂ SCRUBBER', 'DEPURADOR CO₂'), tr('COOLING', 'REFRIGERACIÓN'), tr('POWER', 'ENERGÍA'), tr('NAVIGATION', 'NAVEGACIÓN')];

export class VisorHud {
  constructor(host) {
    const root = document.createElement('div');
    root.className = 'sim-vh'; root.hidden = true;
    root.innerHTML = `
      <svg class="sim-vh-rim" aria-hidden="true"><defs></defs><g class="st"></g>
        <text class="cv tl"><textPath href="#sim-vh-p-tl" startOffset="50%"></textPath></text>
        <text class="cv tr"><textPath href="#sim-vh-p-tr" startOffset="50%"></textPath></text>
        <text class="cv obj"><textPath href="#sim-vh-p-obj" startOffset="50%"></textPath></text>
        <text class="cv alarm"><textPath href="#sim-vh-p-warn" startOffset="50%"></textPath></text></svg>
      <svg class="sim-vh-compass" aria-hidden="true"><path class="tk"/><path class="tk2"/><g class="lb">${'<text></text>'.repeat(9)}</g></svg>
      <div class="sim-vh-head"><i></i><b data-k="hdg">000°</b><span><small>EVA</small> <em data-k="clock">00:00:00</em> <u data-k="ts"></u></span><span class="site" data-k="site"></span></div>
      <div class="sim-vh-feed"><header><small>${tr('STATUS', 'ESTADO')}</small><b data-k="estado">—</b></header><div class="sim-vh-alerts"></div></div>
      <svg class="sim-vh-g" aria-hidden="true"><g class="bars"></g></svg>
      <div class="sim-vh-rows l">${LEFT.map(([k, n]) => `<p data-r="${k}"><b>${n}</b><em>—</em><small></small></p>`).join('')}
        <p class="mini" data-r="hr"><i class="heart">♥</i><svg viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M0 12h14l3-2 3 2h5l2-9 3 16 3-7h7l3-3 3 3h14 M60 12h14l3-2 3 2h5l2-9 3 16 3-7h7l3-3 3 3h14"/></svg><em>—</em></p>
        <p class="mini" data-r="env"><em>—</em></p><p class="mini" data-r="fat"><em>—</em></p><p class="mini" data-r="aut"><em>—</em></p></div>
      <div class="sim-vh-rows r">${RIGHT.map(([k, n]) => `<p data-r="${k}"><b>${n}</b><em>—</em><small></small></p>`).join('')}
        <p class="mini" data-r="leva"><em>—</em></p><p class="mini" data-r="lm"><em>—</em></p><p class="mini" data-r="dose"><em>—</em></p><p class="mini" data-r="walk"><em>—</em></p></div>
      <div class="sim-vh-lens radar"><svg class="ring r1" viewBox="-70 -70 140 140"><circle r="67"/></svg><svg class="ring r2" viewBox="-70 -70 140 140"><circle r="62"/></svg>
        <svg class="ring r4" viewBox="-70 -70 140 140"><circle r="56" pathLength="360"/></svg><i class="sweep"></i><i class="ping"></i><i class="ping p2"></i>
        <svg class="scope" viewBox="-60 -60 120 120"><circle r="52"/><circle r="34"/><circle r="16"/><path d="M-52 0h104M0 -52v104"/><g class="blips"></g><path class="me" d="M0 -5L4 4L0 2L-4 4Z"/></svg></div>
      <div class="sim-vh-horizon"><i></i></div>
      <div class="sim-vh-ladder"><div>${[-60, -45, -30, -15, 15, 30, 45, 60].map((d) => `<i style="--d:${d}" class="${d < 0 ? 'neg' : ''}"><b>${Math.abs(d)}</b></i>`).join('')}</div></div>
      <div class="sim-vh-reticle"><svg class="a" viewBox="-50 -50 100 100"><circle r="34"/></svg><svg class="b" viewBox="-50 -50 100 100"><circle r="44"/></svg>
        <svg class="c" viewBox="-50 -50 100 100"><path d="M-48 0h12M36 0h12M0 -48v12M0 36v12"/><circle r="1.6"/></svg><i class="pulse"></i></div>
      <div class="sim-vh-marks">${['lm', 'sun', 'earth', 'obj'].map((k) => `<div class="mk ${k}" data-t="${k}"><u></u><em></em><b></b></div>`).join('')}</div>
      <div class="sim-vh-keys">${KEYS.map(([k, g, n]) => `<span data-key="${k}"><b>${g}</b><i>${n}</i></span>`).join('')}</div>
      <div class="sim-vh-tunnel"></div>
      <div class="sim-vh-lost" hidden><small>${tr('MISSION LOST', 'MISIÓN PERDIDA')}</small><b></b><p></p><em>${tr('Press <u>R</u> to try again · <u>Q</u> to fly the descent again', 'Pulsa <u>R</u> para reintentar · <u>Q</u> para volver a volar el descenso')}</em></div>
      <div class="sim-vh-boot"><b>${tr('SUIT SYSTEMS', 'SISTEMAS DEL TRAJE')}</b>${BOOT.map((t, i) => `<span style="--i:${i}">${t}<u>OK</u></span>`).join('')}<em>${tr('ONLINE', 'EN LÍNEA')}</em></div>`;
    host.append(root);
    this.root = root; this.$ = (s) => root.querySelector(s);
    this.rows = Object.fromEntries([...root.querySelectorAll('.sim-vh-rows p')].map((p) => [p.dataset.r, p]));
    this.cache = {};
  }

  /** Vuelve a encender el HUD (secuencia de arranque en CSS). */
  boot() { this.root.classList.remove('boot'); void this.root.offsetWidth; this.root.classList.add('boot'); }

  /* ---------- geometría del vidrio ---------- */
  pt(t, k = 1) {
    const r = (t * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), e = 2 / N;
    return [this.cx + this.a * k * Math.sign(c) * Math.abs(c) ** e, this.cy - this.b * k * Math.sign(s) * Math.abs(s) ** e];
  }
  arc(t1, t2, k, n = 48) { let d = ''; for (let i = 0; i <= n; i++) { const p = this.pt(t1 + ((t2 - t1) * i) / n, k); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d; }
  /** x del contorno (escala k) a la altura y; lado −1 izquierda, +1 derecha. */
  edgeX(y, k, side) { const q = Math.min(0.999, Math.abs(this.cy - y) / (this.b * k)); return this.cx + side * this.a * k * (1 - q ** N) ** (1 / N); }
  /** Tramo de contorno entre dos alturas (para los indicadores laterales), de abajo hacia arriba. */
  sideArc(y1, y2, k, side, n = 14) { let d = ''; for (let i = 0; i <= n; i++) { const y = y1 + ((y2 - y1) * i) / n; d += (i ? 'L' : 'M') + this.edgeX(y, k, side).toFixed(1) + ' ' + y.toFixed(1); } return d; }

  resize(W, H) {
    if (W === this.W && H === this.H) return;
    Object.assign(this, { W, H, cx: W / 2, cy: H * 0.5, a: W * 0.462, b: H * 0.492 }); // la abertura del casco llega casi a los bordes
    const u = Math.min(H / 900, W / 1600); this.u = u;
    this.root.style.setProperty('--u', u.toFixed(3));
    for (const s of this.root.querySelectorAll(':scope > svg')) s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // Rutas para los textos curvos del borde
    this.$('.sim-vh-rim defs').innerHTML = `<path id="sim-vh-p-tl" d="${this.arc(206, 239, 0.9)}"/><path id="sim-vh-p-tr" d="${this.arc(301, 334, 0.9)}"/><path id="sim-vh-p-obj" d="${this.arc(238, 302, 0.74)}"/><path id="sim-vh-p-warn" d="${this.arc(122, 58, (this.cy - (this.pt(90, 0.9)[1] + 158 * u)) / this.b)}"/>`;
    // Indicadores laterales: un tramo de arco por fila, pegado al contorno
    const rowH = 62 * u, y0 = this.cy - 1.75 * rowH; let bars = '';
    for (const [side, list] of [[-1, LEFT], [1, RIGHT]]) {
      list.forEach(([k], i) => {
        const yb = y0 + (i + 1) * rowH - 7 * u, yt = y0 + i * rowH + 7 * u;
        bars += `<path class="bg" d="${this.sideArc(yb, yt, 0.93, side)}" pathLength="100"/><path class="fg" data-b="${k}" d="${this.sideArc(yb, yt, 0.93, side)}" pathLength="100"/><path class="thin" d="${this.sideArc(yb, yt, 0.905, side)}"/>`;
        this._place(this.rows[k], (yb + yt) / 2, side, 0.885);
      });
      const minis = side < 0 ? ['hr', 'env', 'fat', 'aut'] : ['leva', 'lm', 'dose', 'walk'];
      minis.forEach((k, i) => this._place(this.rows[k], y0 + 4 * rowH + (i + 0.6) * 30 * u, side, 0.905));
    }
    this.$('.sim-vh-g .bars').innerHTML = bars;
    this.cache = {};
    // Radar arriba a la izquierda y estado arriba a la derecha, apoyados en el vidrio
    const radar = this.$('.sim-vh-lens.radar');
    radar.style.left = this.cx - 0.63 * this.a + 'px'; radar.style.top = this.cy - 0.6 * this.b + 'px';
    const fy = this.cy - 0.74 * this.b, feed = this.$('.sim-vh-feed'); feed.style.top = fy + 'px'; feed.style.right = this.W - this.edgeX(fy + 60 * u, 0.9, 1) + 'px';
    // Teclas a lo largo del borde de abajo
    const keys = [...this.root.querySelectorAll('.sim-vh-keys span')];
    keys.forEach((el, i) => { const t = 246 + (48 * i) / (keys.length - 1), p = this.pt(t, 0.855), q = this.pt(t + 0.5, 0.855); el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px'; el.style.rotate = Math.atan2(q[1] - p[1], q[0] - p[0]) + 'rad'; });
    this.$('.sim-vh-head').style.top = this.pt(90, 0.9)[1] + 30 * u + 'px';
  }
  _place(el, y, side, k) {
    const x = this.edgeX(y, k, side);
    el.style.top = y + 'px';
    if (side < 0) { el.style.left = x + 12 * this.u + 'px'; el.style.right = 'auto'; } else { el.style.right = this.W - x + 12 * this.u + 'px'; el.style.left = 'auto'; }
  }

  /** Un latido: el corazón del HUD da un golpe. */
  beat() { const h = this.$('.heart'); h.classList.remove('b'); void h.offsetWidth; h.classList.add('b'); }

  /** Hipoxia: la vista se cierra en túnel (0 abierta … 1 cerrada). */
  tunnel(k) {
    const v = k.toFixed(2); if (this.cache.tun === v) return; this.cache.tun = v;
    const el = this.$('.sim-vh-tunnel'); el.style.opacity = Math.min(1, k * 1.6).toFixed(2); el.style.transform = `scale(${(2.6 - 2.25 * k).toFixed(2)})`;
  }
  /** Pantalla final: qué pasó y por qué. Con título nulo se quita. */
  lost(title, why = '') {
    const el = this.$('.sim-vh-lost'); el.hidden = !title; this.root.classList.toggle('is-lost', !!title);
    if (title) { el.children[1].textContent = title; el.children[2].textContent = why; }
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

  /** Unas 12 veces por segundo: valores, textos y estados. */
  tick(D) {
    if (!this.W) return; // aún sin geometría (se calcula en el primer fotograma)
    const c = this.cache, bk = D.boot;
    this.set('hdg', this.$('[data-k="hdg"]'), String(Math.round(D.yawDeg) % 360).padStart(3, '0') + '°');
    this.set('clock', this.$('[data-k="clock"]'), D.clock); this.set('ts', this.$('[data-k="ts"]'), D.timeScale > 1 ? '×' + D.timeScale : '');
    this.set('site', this.$('[data-k="site"]'), D.site);
    this.set('tl', this.$('.cv.tl textPath'), D.left); this.set('tr', this.$('.cv.tr textPath'), D.right.text);
    if (c.trc !== D.right.level) { c.trc = D.right.level; this.$('.cv.tr').setAttribute('class', 'cv tr ' + D.right.level); }
    this.set('obj', this.$('.cv.obj textPath'), '▸ ' + D.objective);
    this.set('warn', this.$('.cv.alarm textPath'), D.crit ? '▲  ' + D.crit + '  ▲' : '');
    // Tramos de arco + filas de texto
    for (const k in D.gauges) {
      const g = D.gauges[k], q = g.f == null ? null : Math.max(0, Math.min(1, g.f * bk)), n = q == null ? 0 : Math.round(q * SEG);
      const col = g.f == null ? 'var(--hx2)' : g.color ?? lvl(g.f), key = n + col;
      if (c['b' + k] !== key) {
        c['b' + k] = key;
        const el = this.$(`.sim-vh-g [data-b="${k}"]`), seg = 100 / SEG;
        el.setAttribute('stroke-dasharray', `${(seg - 1.6).toFixed(2)} 1.6 `.repeat(n) + '0 200'); el.style.stroke = col;
        this.rows[k].style.setProperty('--c', col);
      }
      const r = this.rows[k]; this.set('v' + k, r.children[1], g.value); this.set('s' + k, r.children[2], g.sub ?? '');
      const bad = g.f != null && g.f <= 0.25; if (c['x' + k] !== bad) { c['x' + k] = bad; r.classList.toggle('bad', bad); }
    }
    for (const k in D.minis) this.set('m' + k, this.rows[k].lastElementChild, D.minis[k]);
    if (c.bpm !== D.bpm) { c.bpm = D.bpm; this.rows.hr.style.setProperty('--bpm', D.bpm + 's'); }
    // Radar
    const blips = D.blips.map((b) => { const a = ((b.az - D.yawDeg) * Math.PI) / 180; return `<circle class="${b.cls}" cx="${(Math.sin(a) * b.r).toFixed(1)}" cy="${(-Math.cos(a) * b.r).toFixed(1)}" r="3"/>`; }).join('');
    if (c.blips !== blips) { c.blips = blips; this.$('.scope .blips').innerHTML = blips; }
    // Tablero: una línea por cosa que está pasando
    const html = D.alerts.map(([cl, t, sub]) => `<p class="${cl}"><b>${t}</b><small>${sub ?? ''}</small></p>`).join('');
    if (c.alerts !== html) { c.alerts = html; this.$('.sim-vh-alerts').innerHTML = html; }
    this.set('estado', this.$('[data-k="estado"]'), D.estado[1]);
    if (c.est !== D.estado[0]) { c.est = D.estado[0]; this.$('.sim-vh-feed').className = 'sim-vh-feed ' + D.estado[0]; }
    if (c.crit !== !!D.crit) { c.crit = !!D.crit; this.root.classList.toggle('crit', !!D.crit); }
    for (const el of this.root.querySelectorAll('.sim-vh-keys span')) { const on = !!D.keys[el.dataset.key]; if (el._on !== on) { el._on = on; el.classList.toggle('on', on); } }
    this.set('kt', this.$('[data-key="t"] i'), `${tr('Time', 'Tiempo')} ×${D.timeScale}`);
  }

  dispose() { this.root.remove(); }
}
