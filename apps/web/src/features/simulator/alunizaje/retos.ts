// @ts-nocheck — como informe.ts.
// Mini misiones (modo educativo): retos de la caminata que dependen de cómo la haces, cada uno con el porqué científico.
// Se evalúan con los datos del informe final (informe.ts) y los logrados se guardan en este navegador.
// Los umbrales son los del simulador y del Planificador: ruta con margen de 40 m (tareas.ts), alerta de pulso a 150 lpm
// (caminata.ts), límite de regreso con la mitad del consumible más escaso (caminata.ts), lámparas para la sombra.
import { tr } from '@/shared/i18n';

const CLAVE = 'horizon.simulador.retos';

export const RETOS = [
  { id: 'ruta', titulo: () => tr('Stay on the route', 'Fiel a la ruta'), meta: () => tr('Finish the walk without leaving the planned route.', 'Termina la caminata sin salirte de la ruta planificada.'),
    porQue: () => tr('The route is planned around slopes over 15° and young craters. Off it, nobody has checked the ground.', 'La ruta se planifica esquivando pendientes de más de 15° y cráteres jóvenes. Fuera de ella, nadie revisó el terreno.'),
    ok: (d) => d.completa && !d.st.salidasRuta },
  { id: 'calma', titulo: () => tr('Steady heart', 'Corazón tranquilo'), meta: () => tr('Finish without going over 150 bpm.', 'Termina sin pasar de 150 lpm.'),
    porQue: () => tr('Effort burns oxygen and heats the suit: at 470 W you use the O₂ about 1.6 times faster than walking at 300 W.', 'El esfuerzo gasta oxígeno y calienta el traje: a 470 W el O₂ se acaba unas 1,6 veces más rápido que andando a 300 W.'),
    ok: (d) => d.completa && (d.st.hrMax ?? 0) <= 150 },
  { id: 'oxigeno', titulo: () => tr('Oxygen saver', 'Ahorro de oxígeno'), meta: () => tr('Get back to the lander with at least 70 % of the O₂.', 'Vuelve al módulo con al menos el 70 % del O₂.'),
    porQue: () => tr('The return limit is half of the scarcest consumable: whatever you save is margin for a problem on the way back.', 'El límite de regreso es la mitad del consumible más escaso: lo que ahorras es margen para un problema en la vuelta.'),
    ok: (d) => d.completa && d.cons.o2 >= 0.7 },
  { id: 'sombra', titulo: () => tr('Into the dark', 'A la oscuridad'), meta: () => tr('Collect the permanent-shadow sample with the helmet lamps on (science route).', 'Recoge la muestra de sombra permanente con las lámparas del casco (ruta científica).'),
    porQue: () => tr('Near the pole some hollows never see the Sun: LRO measured them below −200 °C, cold enough to keep water ice for billions of years.', 'Cerca del polo hay hondonadas que nunca ven el Sol: el LRO las midió por debajo de −200 °C, tan frías que pueden guardar hielo de agua durante miles de millones de años.'),
    ok: (d) => !!d.st.sombraConLuces },
  { id: 'crater', titulo: () => tr('Crater-wise', 'Ojo con los cráteres'), meta: () => tr('Finish the walk without a single crater alert.', 'Termina la caminata sin una sola alerta de cráter.'),
    porQue: () => tr('Crater walls are loose regolith on steep slopes: easy to slip, hard to climb out in a suit.', 'Las paredes de los cráteres son regolito suelto en pendiente: fácil resbalar y difícil salir con el traje.'),
    ok: (d) => d.completa && !d.st.crateres },
];

const leer = () => { try { return new Set(JSON.parse(localStorage.getItem(CLAVE) ?? '[]')); } catch { return new Set(); } };

/** Evalúa los retos con los datos del informe; guarda los logrados. Devuelve [{reto, ok, nuevo}] y cuántos lleva en total. */
export function evaluarRetos(d) {
  const antes = leer(), ahora = new Set(antes);
  const lista = RETOS.map((r) => { const ok = !!r.ok(d); if (ok) ahora.add(r.id); return { r, ok, nuevo: ok && !antes.has(r.id) }; });
  try { localStorage.setItem(CLAVE, JSON.stringify([...ahora])); } catch { /* sin almacenamiento: solo esta vez */ }
  return { lista, total: ahora.size };
}

/** Los retos como HTML para el informe. */
export function retosHtml(d) {
  const { lista, total } = evaluarRetos(d);
  return `<div class="sim-retos"><span class="lbl">${tr('Mini missions', 'Mini misiones')} · ${total}/${RETOS.length} ${tr('achieved so far', 'logradas en total')}</span>
    ${lista.map(({ r, ok, nuevo }) => `<details class="sim-reto${ok ? ' ok' : ''}"><summary><i>${ok ? '✓' : '·'}</i><b>${r.titulo()}</b>${nuevo ? `<em>${tr('new', 'nueva')}</em>` : ''}<span>${r.meta()}</span></summary><p>${r.porQue()}</p></details>`).join('')}</div>`;
}

/** Texto corto para el aviso del casco al empezar la caminata. */
export const avisoRetos = () => { const n = leer().size; return tr(`Mini missions: ${n}/${RETOS.length} achieved. They are scored in the final report.`, `Mini misiones: ${n}/${RETOS.length} logradas. Se puntúan en el informe final.`); };
