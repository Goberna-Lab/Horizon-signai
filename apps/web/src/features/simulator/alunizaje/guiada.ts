// @ts-nocheck — como world.ts.
// Misión real guiada (`/simulador?bitacora=<id>`): la bitácora de una misión que pasó de verdad (@/shared/bitacoras),
// contada por EVA paso a paso y sin que haya que saber nada antes. Corto y en orden:
//   1. Briefing (el descenso espera): qué misión es, por qué ese lugar y, si hace falta, que el relieve es de referencia.
//   2. Descenso: lo que pasó al bajar (en IM-1, los láseres que nunca se encendieron).
//   3. Contacto: lo que pasó de verdad (en IM-1, vuelca; no es «misión perdida», porque siguió operando).
//   4. Superficie: un hecho por tarjeta, con su día; el cielo pasa a esa fecha. «Por qué importa» lo explica EVA.
//   5. Fin: resumen, descargar la bitácora, volver a las misiones o planificar una propia.
// Cada texto es el de la bitácora, con sus fuentes. Lo único nuestro es el «por qué importa», y así se presenta.
import { avisarEva } from '@/shared/eva';
import { lang, tr } from '@/shared/i18n';
import { diaDeMision, fuentesDe } from '@/shared/bitacoras';
import { bitacoraMarkdown } from '@/shared/bitacoras/exportar';

const L = lang === 'es' ? 'es' : 'en';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MES = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] }[L];
const fecha = (iso) => `${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
/** El instante del hecho para el cielo: su hora, o el mediodía UTC si solo se sabe el día. */
const instante = (h) => (h.precision === 'minuto' ? Date.parse(h.utc) : Date.parse(h.utc) + 12 * 3600e3);
/** EVA va junto a la tarjeta, la señala y lo cuenta (así su globo no la tapa); un paso nuevo corta al anterior. */
const narrar = (texto) => avisarEva('bitacora', texto, '.sim-bitacora');
/** Los hechos que se cuentan mientras la nave baja (uno por misión): no van en la lista de la superficie. */
const EN_DESCENSO = ['laseres', 'luz'];

export class Guiada {
  constructor(view, bitacora) {
    this.v = view; this.b = bitacora; this.el = null; this.i = 0;
    this.pasos = bitacora.hechos.filter((h) => h.fase !== 'antes' && !EN_DESCENSO.includes(h.id));
    this.salir = null; // misión tripulada: la pone landing.ts para salir a caminar al terminar
  }

  /** En la bitácora, la nave volcó: el simulador la hace volcar aunque el relieve de referencia sea plano. */
  get vuelca() { return this.b.hechos.some((h) => h.id === 'de-lado'); }

  _tarjeta(html, clase = '') {
    this.el?.remove();
    const el = (this.el = document.createElement('div'));
    el.className = `sim-bitacora ${clase}`;
    el.setAttribute('role', 'dialog');
    el.innerHTML = html;
    this.v.host.appendChild(el);
    return el;
  }

  /** 1. Antes del descenso: la misión, el lugar y la nota del relieve. El descenso espera al botón. */
  briefing() {
    const b = this.b, antes = b.hechos.filter((h) => h.fase === 'antes');
    this.v.eva.briefing.open = true;
    const el = this._tarjeta(`
      <small>${b.plan ? tr('PLANNED MISSION', 'MISIÓN PLANIFICADA') : `${tr('REAL MISSION', 'MISIÓN REAL')} · ${esc(b.programa)}`} · ${fecha(b.contactoUtc)} · ${b.contactoUtc.slice(11, 16)} UTC</small>
      <b>${esc(b.nombre)} · ${esc(b.nave)}</b>
      <p>${esc(b.resumen[L])}</p>
      ${antes.map((h) => `<p><strong>${esc(h.titulo[L])}.</strong> ${esc(h.texto[L])}</p>`).join('')}
      ${b.simulador.nota ? `<p class="nota">${esc(b.simulador.nota[L])}</p>` : ''}
      <div class="acts"><button type="button" data-act="bajar">${tr('Start the descent', 'Empezar el descenso')}</button></div>`, 'centro');
    narrar(b.plan ? tr(`This is your plan for ${b.nombre}. It has not flown yet: I will show you what the engine says will happen, step by step.`, `Este es tu plan para ${b.nombre}. Todavía no ha volado: te voy a mostrar lo que el motor dice que va a pasar, paso a paso.`)
      : tr(`This is ${b.nombre}, a mission that really happened. Let's relive it.`, `Esta es ${b.nombre}, una misión que pasó de verdad. Vamos a revivirla.`) + ' ' + antes.map((h) => h.texto[L]).join(' '));
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="bajar"]')) { el.remove(); this.el = null; this.v.eva.briefing.open = false; this._descenso(); }
    });
  }

  /** 2. Durante el descenso: lo que pasó al bajar, en una tarjeta pequeña que no tapa la nave. */
  _descenso() {
    const h = this.b.hechos.find((x) => EN_DESCENSO.includes(x.id));
    if (!h) return;
    this._tarjeta(`<small>${tr('DESCENT', 'DESCENSO')} · ${fecha(h.utc)}</small><b>${esc(h.titulo[L])}</b><p>${esc(h.texto[L])}</p>${h.porQue ? `<p class="porque">${esc(h.porQue[L])}</p>` : ''}`, 'lateral');
    narrar(h.texto[L]);
  }

  /** 3 y 4. Tras el contacto: la superficie, un hecho por tarjeta. */
  superficie() {
    // La pantalla de vuelo (altura, velocidad, perfil) ya no dice nada en la superficie: queda la nave y la bitácora
    const hud = this.v.host.querySelector('.sim-lfp'); if (hud) hud.hidden = true;
    this.ir(0);
  }

  ir(i) {
    const b = this.b, h = this.pasos[i];
    if (!h) { this._fin(); return; }
    this.i = i;
    void this.v.cieloAl?.(instante(h));
    const d = diaDeMision(b, h), hasta = h.hastaUtc ? diaDeMision(b, { ...h, utc: h.hastaUtc }) : null;
    const el = this._tarjeta(`
      <small>${tr('DAY', 'DÍA')} ${d}${hasta ? `–${hasta}` : ''} · ${fecha(h.utc)}${h.precision === 'minuto' ? ` · ${h.utc.slice(11, 16)} UTC` : ''}<span class="paso">${i + 1}/${this.pasos.length}</span></small>
      <b>${esc(h.titulo[L])}</b>
      <p>${esc(h.texto[L])}</p>
      ${h.porQue ? `<details><summary>${tr('Why it matters', 'Por qué importa')}</summary><p class="porque">${esc(h.porQue[L])}</p></details>` : ''}
      <p class="fuentes">${tr('Sources', 'Fuentes')}: ${fuentesDe(b, h).map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.id)}</a>`).join(' · ')}</p>
      <div class="acts">${i ? `<button type="button" data-act="atras" class="sec">${tr('Back', 'Atrás')}</button>` : ''}<button type="button" data-act="sig">${i + 1 < this.pasos.length ? tr('Next', 'Siguiente') : tr('Finish', 'Terminar')}</button></div>`, 'lateral');
    narrar(h.texto[L]);
    el.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'sig') this.ir(i + 1);
      if (a === 'atras') this.ir(i - 1);
    });
    el.querySelector('details')?.addEventListener('toggle', (e) => { if (e.target.open) narrar(h.porQue[L]); });
  }

  /** 5. Fin: el resultado contra lo previsto, la bitácora para descargar y a dónde seguir. */
  _fin() {
    const b = this.b;
    const el = this._tarjeta(`
      <small>${b.plan ? tr('END OF THE PLAN', 'FIN DEL PLAN') : tr('END OF THE MISSION', 'FIN DE LA MISIÓN')} · ${esc(b.nombre)}</small>
      ${b.plan ? `<b class="${b.plan.cumple ? '' : 'mal'}">${esc(b.real[L])}</b><p>${esc(b.prevista[L])}</p>
      <p>${b.plan.cumple ? tr('This is a plan that holds. Change the date or the site in the Planner and see how fast that changes.', 'Este plan aguanta. Cambia la fecha o el lugar en el Planificador y mira lo rápido que eso cambia.') : tr('This plan does not hold as it is. In the Planner you can move the date, raise the panel or pick another site until it does.', 'Este plan no aguanta como está. En el Planificador puedes mover la fecha, subir el panel o elegir otro lugar hasta que cumpla.')}</p>`
      : `<b>${tr('Planned', 'Previsto')}: ${esc(b.prevista[L])}<br>${tr('Actual', 'Real')}: ${esc(b.real[L])}</b>
      <p>${tr('Now plan your own: choose a site, a date and a battery, and see whether your lander survives the night and keeps talking to Earth.', 'Ahora planifica la tuya: elige un lugar, una fecha y una batería, y mira si tu nave aguanta la noche y sigue hablando con la Tierra.')}</p>`}
      <div class="acts">
        ${b.plan ? (this.salir ? `<button type="button" data-act="caminar">${tr('Go out for the walk', 'Salir a caminar')}</button>` : '') : `<button type="button" data-act="bajar">${tr('Download the log', 'Descargar la bitácora')}</button>`}
        <button type="button" data-act="plan" class="${b.plan && !this.salir ? '' : 'sec'}">${b.plan ? tr('Open the Planner', 'Abrir el Planificador') : tr('Plan my mission', 'Planificar mi misión')}</button>
        <button type="button" data-act="otra" class="sec">${tr('Watch it again', 'Verla otra vez')}</button>
      </div>`, 'centro');
    narrar(b.plan ? b.real[L] + '. ' + (b.plan.cumple ? tr('That is the whole stay, and it holds.', 'Esa es toda la estadía, y aguanta.') : tr('That is why the Planner marks it. Let us fix it there.', 'Por eso el Planificador la marca. Vamos a arreglarlo ahí.'))
      : tr('Mission over. It did not last as long as planned, but it sent its data home. Now it is your turn to plan one.', 'Misión terminada. No duró lo previsto, pero mandó sus datos a casa. Ahora te toca planificar una.'));
    el.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'bajar') {
        const url = URL.createObjectURL(new Blob([bitacoraMarkdown(b, L)], { type: 'text/markdown;charset=utf-8' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: `${L === 'es' ? 'bitacora' : 'log'}-${b.id}.md` });
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (a === 'plan') location.href = '/planner';
      if (a === 'caminar') { const hud = this.v.host.querySelector('.sim-lfp'); if (hud) hud.hidden = false; this.dispose(); this.salir(); }
      if (a === 'otra') location.reload();
    });
  }

  dispose() { this.el?.remove(); this.el = null; }
}
