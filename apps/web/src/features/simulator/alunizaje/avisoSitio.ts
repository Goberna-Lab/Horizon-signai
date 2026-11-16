// @ts-nocheck — como world.ts.
// Aviso antes del descenso: si el relieve REAL (LOLA, sin el suelo de detalle, que es generado) bajo el punto de
// alunizaje está más inclinado de lo que el módulo tolera, se dice antes de bajar, con la pendiente y la razón.
// Pasa en los sitios del catálogo que son el centro de un mosaico de relieve (PGDA) y no una zona de aterrizaje
// elegida (RoI): Shackleton rim (~31°) o Nobile Rim 1 (~16°). Ahí la nave vuelca de verdad; no es un fallo al azar.
// Se mira el centro y un círculo de 50 m (el doble del error de navegación, NAV_SIGMA_M de aterrizaje.ts).
import { siteById, sites } from '@/shared/planning';
import { tr } from '@/shared/i18n';
import { gravedad, hazardAt, TIP_DEG } from './aterrizaje';

const RADIO_M = 50;
const fmt = (n) => n.toLocaleString(tr('en-US', 'es-ES'), { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Pendiente real bajo las patas en el centro y la peor a ≤ 50 m; `grav` 0 bien · 1 inclinada · 2 vuelca. */
export function pendienteReal(baseY) {
  const v = { groundY: baseY };
  const centro = hazardAt(v, 0, 0).tilt;
  let peor = centro;
  for (let r = 10; r <= RADIO_M; r += 10) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    peor = Math.max(peor, hazardAt(v, Math.cos(a) * r, Math.sin(a) * r).tilt);
  }
  // Decide el punto: alrededor, el guiado ya busca un sitio limpio a menos de 30 m (planTouchdown)
  return { centro, peor, grav: gravedad({ tilt: centro, rock: 0 }) };
}

/**
 * Si el sitio es peligroso, pausa el descenso (`view.eva.briefing.open`, que LandingSim respeta) y muestra la ficha.
 * Devuelve una función que la quita.
 */
export function avisarSitio(host, view, siteId) {
  const p = pendienteReal(view.baseY);
  if (p.grav === 0) return () => {};
  const site = siteById.get(siteId);
  const esCentro = site?.kind === 'site';
  const zona = sites.find((s) => s.kind === 'roi' && s.parent === siteId);
  const vuelca = p.grav === 2;
  const el = document.createElement('div');
  el.className = 'sim-aviso-sitio';
  el.setAttribute('role', 'alertdialog');
  el.innerHTML = `
    <small>${tr('BEFORE THE DESCENT', 'ANTES DEL DESCENSO')} · ${view.siteName ?? ''}</small>
    <b>${vuelca ? tr('The lander will tip over here', 'Aquí la nave volcará') : tr('The lander will come to rest tilted here', 'Aquí la nave quedará inclinada')}</b>
    <p>${tr(
      `Real slope under the footpads: ${fmt(p.centro)}° at the point${p.peor > p.centro + 0.5 ? `, up to ${fmt(p.peor)}° within ${RADIO_M} m` : ''} (LOLA terrain). The lander tolerates about ${TIP_DEG}°.`,
      `Pendiente real bajo las patas: ${fmt(p.centro)}° en el punto${p.peor > p.centro + 0.5 ? `, hasta ${fmt(p.peor)}° a menos de ${RADIO_M} m` : ''} (relieve LOLA). La nave tolera unos ${TIP_DEG}°.`,
    )}</p>
    ${esCentro ? `<p>${tr(
      'This point is the center of a NASA terrain map (PGDA), not a landing zone chosen for being flat. The landing zones are the RoIs.',
      'Este punto es el centro de un mapa de relieve de la NASA (PGDA), no una zona de aterrizaje elegida por ser plana. Las zonas de aterrizaje son las RoI.',
    )}</p>` : ''}
    <div class="sim-lfp-end-acts">
      ${zona ? `<button type="button" data-act="zona">${tr(`Land at ${zona.name}`, `Alunizar en ${zona.name}`)}</button>` : ''}
      <button type="button" data-act="bajar" class="${zona ? 'sec' : ''}">${tr('Descend anyway', 'Descender de todos modos')}</button>
      <button type="button" data-act="plan" class="sec">${tr('Back to the Planner', 'Volver al Planificador')}</button>
    </div>`;
  const quitar = () => { el.remove(); view.eva.briefing.open = false; };
  el.addEventListener('click', (e) => {
    const a = e.target.closest?.('button')?.dataset.act;
    if (a === 'bajar') quitar();
    if (a === 'plan') location.href = '/planner';
    if (a === 'zona') {
      const q = new URLSearchParams(location.search);
      q.delete('mission'); q.set('sitio', zona.id);
      if (view.time) q.set('fecha', new Date(view.time).toISOString());
      location.search = q.toString();
    }
  });
  view.eva.briefing.open = true;
  host.appendChild(el);
  return quitar;
}
