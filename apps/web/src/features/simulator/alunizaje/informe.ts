// @ts-nocheck — escena imperativa, como caminata.ts.
// Informe final de la misión: lo planificado frente a lo que pasó en el alunizaje y en la caminata, y un veredicto.
//
// Las cifras planificadas son las del plan que llegó del Planificador: la ruta (su largo sobre el terreno) y los tiempos del
// prototipo del Planificador (prototipos/lunar-map/mission.js: 2,2 km/h y 20 min por parada, ida y vuelta). Las reales
// salen de la simulación (motor de descenso validado y traje del simulador). Veredicto:
//   · Cumplida: alunizaje nominal y caminata completa (todas las muestras y de vuelta en el módulo).
//   · Cumplida con incidentes: igual, pero con alunizaje duro o inclinado, salidas de ruta o pulso por encima de 150 lpm.
//   · Perdida: la nave volcó o se destruyó, o el astronauta se quedó sin consumibles.
import { tr } from '@/shared/i18n';
import { retosHtml } from './retos';

const WALK_KMH = 2.2, STOP_MIN = 20; // prototipos/lunar-map/mission.js
const fmt = (n, d = 0) => Number(n).toLocaleString(tr('en-US', 'es-ES'), { minimumFractionDigits: d, maximumFractionDigits: d });
const hm = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; };

/** Largo (m) de una polilínea en el plano. */
const largo = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);

export function datosDelInforme(view, cam) {
  const al = view.alunizaje ?? null, t = cam.tasks, s = cam.s, st = cam.stats ?? {};
  const ruta = largo(t.ruta ?? []), paradas = t.samples.length;
  const planM = 2 * ruta, planS = (planM / 1000 / WALK_KMH) * 3600 + paradas * STOP_MIN * 60;
  const muestras = t.samples.filter((m) => m.taken).length;
  const perdida = !al || al.kind === 'tip' || al.kind === 'crash' || cam.lost;
  const completa = t.done && muestras === paradas;
  const incidentes = [];
  if (al && al.kind !== 'ok') incidentes.push(al.kind === 'hard' ? tr('hard landing', 'alunizaje duro') : tr('tilted lander', 'nave inclinada'));
  if (st.salidasRuta) incidentes.push(tr(`${st.salidasRuta} times off the route`, `${st.salidasRuta} salidas de la ruta`));
  if (st.hrMax > 150) incidentes.push(tr(`heart rate up to ${fmt(st.hrMax)} bpm`, `pulso hasta ${fmt(st.hrMax)} lpm`));
  if (st.crateres) incidentes.push(tr(`${st.crateres} crater alerts`, `${st.crateres} alertas de cráter`));
  const veredicto = perdida ? 'perdida' : completa ? (incidentes.length ? 'incidentes' : 'cumplida') : 'incompleta';
  const cons = { o2: s.o2 / 0.82, agua: s.water / 3.86, co2: 1 - s.lioh / 8870, bat: s.batt / 279 };
  return { perdida, completa, al, ruta: view.plan?.ruta ?? 'cientifica', planM, planS, realM: cam.walked, realS: s.t, paradas, muestras, cons, st, incidentes, veredicto, recargas: cam.lm?.recharges ?? 0, sitio: view.siteName ?? '' };
}

const TITULO = {
  cumplida: () => tr('Mission accomplished', 'Misión cumplida'),
  incidentes: () => tr('Accomplished, with incidents', 'Cumplida, con incidentes'),
  incompleta: () => tr('Mission incomplete', 'Misión incompleta'),
  perdida: () => tr('Mission lost', 'Misión perdida'),
};
const RUTA = { cientifica: () => tr('science route (CR-02)', 'ruta científica (CR-02)'), segura: () => tr('safe route', 'ruta segura'), corta: () => tr('short route', 'ruta corta') };

/** Muestra el informe sobre la escena. `acciones`: { volar, planificador } */
export function mostrarInforme(view, d, acciones = {}) {
  document.querySelector('.sim-informe')?.remove();
  const el = document.createElement('div');
  el.className = 'sim-informe ' + d.veredicto;
  const fila = (k, plan, real, ok) => `<tr${ok === false ? ' class="mal"' : ''}><th>${k}</th><td>${plan}</td><td>${real}</td></tr>`;
  const al = d.al, KIND = { ok: tr('nominal', 'nominal'), hard: tr('hard', 'duro'), tilt: tr('tilted', 'inclinado'), tip: tr('tipped over', 'volcado'), crash: tr('destroyed', 'destruido') };
  const barra = (n, f) => `<div class="sim-inf-bar"><span>${n}</span><i><b style="width:${Math.max(0, Math.min(100, f * 100))}%"></b></i><em>${fmt(f * 100)} %</em></div>`;
  el.innerHTML = `
    <small>${tr('MISSION REPORT', 'INFORME DE MISIÓN')} · ${d.sitio}</small>
    <b>${TITULO[d.veredicto]()}</b>
    ${d.incidentes.length ? `<p>${tr('Incidents', 'Incidentes')}: ${d.incidentes.join(' · ')}</p>` : ''}
    <table><thead><tr><th></th><th>${tr('Planned', 'Planificado')}</th><th>${tr('Flown', 'Real')}</th></tr></thead><tbody>
      ${al ? fila(tr('Landing', 'Alunizaje'), tr('nominal, on target', 'nominal, en el objetivo'), `${KIND[al.kind] ?? al.kind} · ${fmt(al.miss)} m`, al.kind === 'ok') : ''}
      ${al ? fila(tr('Contact speed', 'Velocidad de contacto'), '< 3 m/s', `${fmt(al.touchV, 1)} m/s`, al.touchV < 3) : ''}
      ${al ? fila(tr('Fuel left', 'Combustible restante'), '> 0 s', `${fmt(Math.max(0, al.fuelS))} s`, al.fuelS > 0) : ''}
      ${fila(tr('Route', 'Ruta'), RUTA[d.ruta]?.() ?? d.ruta, d.completa ? tr('completed', 'completada') : tr('not completed', 'sin completar'), d.completa)}
      ${fila(tr('Distance', 'Distancia'), `${fmt(d.planM)} m`, `${fmt(d.realM)} m`, null)}
      ${fila(tr('EVA time', 'Tiempo de EVA'), hm(d.planS), hm(d.realS), null)}
      ${fila(tr('Samples', 'Muestras'), String(d.paradas), String(d.muestras), d.muestras === d.paradas)}
      ${fila(tr('Off-route events', 'Salidas de ruta'), '0', String(d.st.salidasRuta ?? 0), !d.st.salidasRuta)}
      ${fila(tr('Max heart rate', 'Pulso máximo'), tr('≤ 150 bpm', '≤ 150 lpm'), `${fmt(d.st.hrMax ?? 0)} ${tr('bpm', 'lpm')}`, (d.st.hrMax ?? 0) <= 150)}
      ${fila(tr('Suit recharges', 'Recargas del traje'), '—', String(d.recargas), null)}
    </tbody></table>
    <div class="sim-inf-cons"><span class="lbl">${tr('Suit left at the end', 'Traje al terminar')}</span>
      ${barra('O₂', d.cons.o2)}${barra(tr('Water', 'Agua'), d.cons.agua)}${barra('LiOH', d.cons.co2)}${barra(tr('Battery', 'Batería'), d.cons.bat)}</div>
    ${d.perdida ? '' : retosHtml(d)}
    <p class="nota">${tr('Planned figures: the route and times of the Planner (2.2 km/h, 20 min per stop, out and back). Flown: this simulation.', 'Planificado: la ruta y los tiempos del Planificador (2,2 km/h, 20 min por parada, ida y vuelta). Real: esta simulación.')}</p>
    <div class="sim-lfp-end-acts">
      <button type="button" data-act="volar">${tr('Fly the mission again', 'Volar la misión otra vez')}</button>
      <button type="button" data-act="plan" class="sec">${tr('Back to planning', 'Volver a planificar')}</button>
      <button type="button" data-act="copiar" class="sec">${tr('Copy report', 'Copiar informe')}</button>
      <button type="button" data-act="cerrar" class="sec">${tr('Keep walking', 'Seguir caminando')}</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const a = e.target.closest?.('button')?.dataset.act; if (!a) return;
    if (a === 'volar') { el.remove(); acciones.volar?.(); }
    if (a === 'plan') acciones.planificador?.();
    if (a === 'cerrar') el.remove();
    if (a === 'copiar') {
      const txt = `${TITULO[d.veredicto]()} · ${d.sitio}\n` + [...el.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent).join(' | ')).join('\n') + (d.incidentes.length ? `\n${d.incidentes.join(' · ')}` : '');
      navigator.clipboard?.writeText(txt).then(() => { e.target.textContent = tr('Copied', 'Copiado'); }, () => {});
    }
  });
  document.body.append(el); // fuera del lienzo: así queda por encima de EVA (que vive en la capa de la app)
  if (document.pointerLockElement) document.exitPointerLock?.();
  return el;
}
