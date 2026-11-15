// @ts-nocheck — como world.ts.
// Lo que EVA «ve» del simulador: el estado de la misión en texto, con las cifras que muestra la pantalla (descenso, casco,
// rover, informe). Va a la IA como contexto de cada pregunta, igual que `LunarPlanner.text()` en el planificador
// (features/assistant/eva/acciones.ts lo lee de `window.HorizonSimulador`): el modelo no calcula, explica estas cifras.
// También la tecla H (y el botón EVA en el celular): suelta el ratón y le abre el panel para hablarle o escribirle.
import { tr } from '@/shared/i18n';

const f = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const hm = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const RUTA = { cientifica: 'science route (CR-02: stop 1 lit rim, stop 2 permanent shadow, mandatory return at stop 2)', segura: 'safe route (1 stop)', corta: 'short route (no stops)' };

/** El estado de la misión en texto (inglés: el modelo responde en el idioma de la persona). */
export function estadoSimulador(view, sim, caminata, rover) {
  const p = view.plan ?? {}, now = view.now, L = [];
  L.push(`SCREEN: Horizon mission simulator (/simulador). Site: ${view.siteName ?? '?'}. Mission type: ${p.tipo ?? 'tripulada'}${p.tipo === 'rover' ? ` (rover up to ${f(p.roverKmh, 1)} km/h, ${f(p.paradaH, 1)} h per stop)` : ''}. Route: ${RUTA[p.ruta] ?? p.ruta ?? '-'}. EVA starts ${f(p.evaH ?? 0)} h after landing.`);
  if (view.time) L.push(`Mission clock (UTC): ${new Date(view.time).toISOString().slice(0, 16).replace('T', ' ')}.`);
  if (now) L.push(`Sky (Planner engine): Sun azimuth ${f(now.sun.az, 1)}°, elevation ${f(now.sun.el, 2)}°, ${f(now.sun.frac * 100)}% of the disc above the real horizon. Earth elevation ${f(now.earth.el, 1)}°, ${now.earth.visible ? 'visible: direct link with Earth' : 'below the horizon: no direct link'}.`);
  const st = sim?.state;
  if (st === 'descent' || st === 'fall') {
    L.push(`DESCENT: phase ${sim.phases?.[sim.phase]?.name ?? '?'}, altitude ${f(Math.max(0, sim.altitude()))} m, vertical speed ${f(sim.vel.y, 1)} m/s, fuel ${f(sim.fuel)} s of hover. Guidance: Apollo 11 nominal descent (team engine: R-695 guidance, TN D-6846 profile). No manual control.`);
  }
  const al = view.alunizaje;
  if (al) L.push(`LANDING RESULT: ${al.kind} (ok = nominal, hard, tilt, tip, crash), contact speed ${f(al.touchV, 1)} m/s, footpad tilt ${f(al.tilt, 1)}°, ${f(al.miss)} m off target, fuel left ${f(al.fuelS)} s. Thresholds: tilted from 6°, tip-over from 12°, hard above 3 m/s, crash from 5 m/s.`);
  if (caminata?.active) {
    const c = caminata, s = c.s, d = c._data(), t = c.tasks;
    L.push(`WALK (suit HUD): EVA time ${hm(s.t)} (time x${c.timeScale}), walked ${f(c.walked)} m, ${d.dLM != null ? f(d.dLM) + ' m from the lander' : ''}. Walk-back limit ${f(d.walkback)} m (half of the scarcest consumable, walking 1.3 m/s)${d.dLM > d.walkback ? ' — PAST THE LIMIT' : ''}.`);
    L.push(`Suit: O2 ${f((s.o2 / 0.82) * 100)}% (${hm(d.left.o2)} left), CO2 cartridge ${f((1 - s.lioh / 8870) * 100)}% (${hm(d.left.co2)}), water ${f((s.water / 3.86) * 100)}% (${hm(d.left.h2o)}), battery ${f((s.batt / 279) * 100)}% (${hm(d.left.bat)}); autonomy ${hm(d.aut)}. Heart rate ${f(s.hr)} bpm, metabolic ${f(s.met)} W, fatigue ${f(c.fatigue * 100)}%. Lamps ${c.lamps ? 'on' : 'off'}. ${d.inSun ? 'Astronaut in sunlight.' : 'Astronaut in shadow.'}`);
    L.push(`Lander stores for suit recharges: ${f(c.lm.o2, 1)} kg O2, ${f(c.lm.water)} kg water (${c.lm.recharges} recharges used).`);
    if (t.started) L.push(`Task: ${t.text() ?? '-'}. Samples ${t.samples.filter((m) => m.taken).length}/${t.samples.length}. ${t.lejosDeRuta ? `OFF THE PLANNED ROUTE (${f(t.fueraDeRuta())} m away).` : 'On the planned route.'}`);
    if (c.pendiente) L.push(`Slope ahead ${f(c.pendiente.s)}° (plan limit 15°).`);
    if (c.lost) L.push('MISSION LOST: the astronaut ran out of consumables.');
  }
  if (rover?.active) {
    const r = rover, t = r.tasks;
    L.push(`ROVER: traverse time ${hm(r.s.t)}, driven ${f(r.walked)} m, speed ${f(Math.abs(r.vel) * 3.6, 2)} of ${f(r.vmax * 3.6, 1)} km/h. ${now?.earth.visible ? 'Earth link: driving allowed.' : 'No Earth link: the rover is stopped.'} Max slope crossed ${f(r.stats.pendienteMax, 1)}°. Task: ${t.text() ?? '-'}. Measurements ${t.samples.filter((m) => m.taken).length}/${t.samples.length}.`);
  }
  const eq = view.equipo;
  if (eq) L.push(`PANEL AND ANTENNA DEPLOYED (Planner engine, rest of the stay, ${f(eq.horas)} h): panel at ${eq.panelM} m sees the Sun ${f(eq.sunPct)}% of the time (${f(eq.sunH)} h), ${f(eq.energiaKWhM2, 1)} kWh/m² reach it (mean ${f(eq.meanPanelWm2)} W/m², vertical panel turning to the Sun), longest night ${f(eq.longestNightH, 1)} h; antenna at ${eq.antenaM} m sees the Earth ${f(eq.earthPct)}% (${f(eq.earthH)} h), longest link gap ${f(eq.longestSilenceH, 1)} h; Sun and Earth together ${f(eq.bothPct)}%.`);
  const inf = document.querySelector('.sim-informe');
  if (inf) L.push(`MISSION REPORT ON SCREEN: ${inf.querySelector('b')?.textContent ?? ''}. ` + [...inf.querySelectorAll('tbody tr')].map((r) => [...r.children].map((x) => x.textContent).join(': ')).join('; ') + '.');
  return L.join('\n');
}

/** Suelta el ratón y abre el panel de EVA (si no está abierto). Sin tocar su código: pulsa su cuerpo como lo haría Enter. */
export function abrirEva() {
  if (document.pointerLockElement) document.exitPointerLock?.();
  const el = document.querySelector('.eva-cuerpo');
  if (!el) return false;
  if (el.getAttribute('aria-expanded') !== 'true') el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); // sin `code`: el simulador no lo toma por su Enter
  setTimeout(() => document.querySelector('.eva-panel__form input')?.focus?.(), 200);
  return true;
}

export const avisoHablar = () => tr('H: talk to EVA', 'H: hablar con EVA');
