/* Genera data/bitacoras-campana.js: la bitácora PLANIFICADA de cada misión de la campaña de ejemplo (Missions, inicio.html)
 * que ya tiene fecha, para descargarla y para abrir su simulación.
 *
 * No son hechos que pasaron: es lo que el motor del planificador (engine.js) calcula para ese lugar y esa fecha con la
 * regla del plan de CR-01 (estadía de 3 días, panel y antena a 2 m, batería de 24 h, Tierra al menos el 40 %): el Sol y
 * la Tierra al contacto, cada salida y puesta del Sol y de la Tierra tras el relieve durante la estadía, la noche y el
 * silencio más largos y los requisitos. Mismas efemérides (JPL Horizons DE441) y horizontes (data/zonas.js) que el
 * planificador. Las misiones sin fecha (PS-03, DG-04) no tienen bitácora: no hay nada que calcular todavía.
 * CR-02 es la caminata de CR-01: misma estadía, con la salida marcada y cuánto falta ahí para que cambie el Sol o la Tierra.
 *
 * Uso (desde la raíz del repo):  node prototipos/lunar-map/tools/bitacoras-campana.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const AQUI = path.resolve(__dirname, '..');
const ctx = { atob: (s) => Buffer.from(s, 'base64').toString('binary') };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data/efemerides-luna.js', 'data/zonas.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(AQUI, f), 'utf8'), ctx, { filename: f });

const E = ctx.Lunar.Engine, Z = ctx.LunarData.zonas, T = E.tabla(ctx.LunarData.efemerides);
const REGLA = { stayDays: 3, panelM: 2, antennaM: 2, requirements: { batteryH: 24, minEarthPct: 40, sunAtLanding: true, earthAtLanding: true } };
const H = 3600000;
const CONTACTO_CR01 = Date.UTC(2026, 11, 18, 9), EVA_CR02 = Date.UTC(2026, 11, 19, 10);
/* Las de la campaña (campaign.js) que tienen fecha */
const MISIONES = [
  { id: 'CR-01', nombre: { en: 'Landing at Connecting Ridge', es: 'Alunizaje en Connecting Ridge' }, zona: 'A', ms: CONTACTO_CR01 },
  { id: 'CR-02', nombre: { en: 'Science walk to the Shackleton rim', es: 'Caminata científica al borde de Shackleton' }, zona: 'A', ms: CONTACTO_CR01, evaMs: EVA_CR02, ruta: 'cientifica' },
  { id: 'SR-05', nombre: { en: 'Landing at the Shackleton rim', es: 'Alunizaje en el borde de Shackleton' }, zona: 'C', ms: Date.UTC(2027, 4, 5, 9) }
];

const MES = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] };
const two = (n) => String(n).padStart(2, '0');
const cuando = (ms, l) => { const d = new Date(ms); return d.getUTCDate() + ' ' + MES[l][d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ' UTC'; };
const num = (x, d, l) => { const s = x.toFixed(d); return l === 'es' ? s.replace('.', ',') : s; };
const horas = (h, l) => (h >= 48 ? num(h / 24, 1, l) + ' d' : num(h, h < 10 ? 1 : 0, l) + ' h');
const grados = (x, l) => (x >= 0 ? '+' : '−') + num(Math.abs(x), 1, l) + '°';

const TXT = {
  en: {
    plan: 'Planned log', aviso: 'This is a plan, not a record: nothing here has happened. Every line is computed by the Horizon Signai planner engine for this place and date (JPL Horizons DE441 ephemeris, LOLA horizon). The mission is part of the example campaign.',
    sitio: 'Site', contacto: 'Contact', estadia: 'Stay', equipo: 'Gear', regla: (r) => `panel and antenna at ${r.panelM} m, battery ${r.requirements.batteryH} h, Earth at least ${r.requirements.minEarthPct}% of the stay`,
    dias: (n) => `${n} days`, veredicto: 'Verdict', cumple: 'Meets every requirement', noCumple: 'Does not meet the requirements',
    cifras: 'Figures of the stay', sol: 'Sunlight', tierra: 'Earth visible', ambos: 'Sun and Earth together', noche: 'Longest night', silencio: 'Longest gap without Earth', nada: 'none',
    req: 'Requirements', ok: 'ok', falla: 'FAILS',
    c: { sunAtLanding: (c, l, a) => `Sun at contact: ${grados(a.sunAboveDeg, l)} over the terrain`, earthAtLanding: (c, l, a) => `Earth at contact: ${grados(a.earthAboveDeg, l)} over the terrain`, battery: (c, l) => (c.value > 0 ? `Longest night ${horas(c.value, l)} against a ${c.limit} h battery` : `No night during the stay (battery ${c.limit} h)`), earthContact: (c, l) => `Earth visible ${Math.round(c.value)}% of the stay (minimum ${c.limit}%)` },
    linea: 'Timeline', dia: 'Day',
    e: {
      contacto: (s, t, l) => `Contact. Sun ${grados(s, l)} and Earth ${grados(t, l)} over the terrain.`,
      solSale: 'The Sun rises over the terrain: the panel has power again.', solPone: 'The Sun sets behind the terrain: the lander runs on its battery.',
      tierraSale: 'Earth rises over the terrain: direct link with mission control.', tierraPone: 'Earth sets behind the terrain: no direct link.',
      eva: (s, t, v) => `The walk leaves the lander (scientific route). ${s == null ? (v.solVis ? 'The Sun stays up' : 'The Sun stays hidden') + ' for the rest of the stay' : 'The Sun ' + s}; ${t == null ? (v.tierraVis ? 'Earth stays in view' : 'Earth stays hidden') + ' for the rest of the stay' : 'Earth ' + t}.`,
      cambia: (vis, h, l) => `${vis ? 'sets' : 'rises'} in ${horas(h, l)}`,
      fin: 'End of the planned stay.'
    }
  },
  es: {
    plan: 'Bitácora planificada', aviso: 'Esto es un plan, no un registro: nada de esto ha pasado. Cada línea la calcula el motor del planificador de Horizon Signai para este lugar y esta fecha (efemérides JPL Horizons DE441, horizonte LOLA). La misión es de la campaña de ejemplo.',
    sitio: 'Sitio', contacto: 'Contacto', estadia: 'Estadía', equipo: 'Equipo', regla: (r) => `panel y antena a ${r.panelM} m, batería de ${r.requirements.batteryH} h, Tierra al menos el ${r.requirements.minEarthPct} % de la estadía`,
    dias: (n) => `${n} días`, veredicto: 'Veredicto', cumple: 'Cumple todos los requisitos', noCumple: 'No cumple los requisitos',
    cifras: 'Cifras de la estadía', sol: 'Sol', tierra: 'Tierra a la vista', ambos: 'Sol y Tierra a la vez', noche: 'Noche más larga', silencio: 'Mayor tiempo sin Tierra', nada: 'no hay',
    req: 'Requisitos', ok: 'cumple', falla: 'NO CUMPLE',
    c: { sunAtLanding: (c, l, a) => `Sol al contacto: ${grados(a.sunAboveDeg, l)} sobre el relieve`, earthAtLanding: (c, l, a) => `Tierra al contacto: ${grados(a.earthAboveDeg, l)} sobre el relieve`, battery: (c, l) => (c.value > 0 ? `Noche más larga de ${horas(c.value, l)} contra una batería de ${c.limit} h` : `Sin noche durante la estadía (batería de ${c.limit} h)`), earthContact: (c, l) => `Tierra a la vista el ${Math.round(c.value)} % de la estadía (mínimo ${c.limit} %)` },
    linea: 'Línea de tiempo', dia: 'Día',
    e: {
      contacto: (s, t, l) => `Contacto. Sol ${grados(s, l)} y Tierra ${grados(t, l)} sobre el relieve.`,
      solSale: 'El Sol sale sobre el relieve: el panel vuelve a tener energía.', solPone: 'El Sol se oculta tras el relieve: el módulo vive de su batería.',
      tierraSale: 'La Tierra sale sobre el relieve: enlace directo con el control de misión.', tierraPone: 'La Tierra se oculta tras el relieve: sin enlace directo.',
      eva: (s, t, v) => `La caminata sale del módulo (ruta científica). ${s == null ? (v.solVis ? 'El Sol sigue a la vista' : 'El Sol sigue oculto') + ' el resto de la estadía' : 'El Sol ' + s}; ${t == null ? (v.tierraVis ? 'la Tierra sigue a la vista' : 'la Tierra sigue oculta') + ' el resto de la estadía' : 'la Tierra ' + t}.`,
      cambia: (vis, h, l) => `${vis ? 'se oculta' : 'sale'} en ${horas(h, l)}`,
      fin: 'Fin de la estadía planificada.'
    }
  }
};

function bitacora(m) {
  const zona = Z[m.zona], st = E.station(zona, REGLA.panelM, REGLA.antennaM);
  const ev = E.evaluate(T, st, { landingMs: m.ms, stayDays: REGLA.stayDays, requirements: REGLA.requirements });
  /* eventos: [ms, clave, datos] */
  const eventos = [[ev.fromMs, 'contacto']];
  for (const [a, b] of ev.windows.sun) { if (a > ev.fromMs) eventos.push([a, 'solSale']); if (b < ev.toMs) eventos.push([b, 'solPone']); }
  for (const [a, b] of ev.windows.earth) { if (a > ev.fromMs) eventos.push([a, 'tierraSale']); if (b < ev.toMs) eventos.push([b, 'tierraPone']); }
  let eva = null;
  if (m.evaMs) {
    /* al salir: ¿se ven el Sol y la Tierra, y cuánto falta para que cambien dentro de la estadía? */
    const dentro = (w) => w.some(([a, b]) => m.evaMs >= a && m.evaMs < b);
    const sig = (w) => { let t = null; for (const [a, b] of w) for (const x of [a, b]) if (x > m.evaMs && x < ev.toMs && (t == null || x < t)) t = x; return t; };
    eva = { solVis: dentro(ev.windows.sun), tierraVis: dentro(ev.windows.earth), solMs: sig(ev.windows.sun), tierraMs: sig(ev.windows.earth) };
    eventos.push([m.evaMs, 'eva']);
  }
  eventos.push([ev.toMs, 'fin']);
  eventos.sort((x, y) => x[0] - y[0]);

  const md = {};
  for (const l of ['en', 'es']) {
    const t = TXT[l], f = ev.figures;
    const linea = (ms, k) => {
      const dia = Math.floor((ms - ev.fromMs) / (24 * H)) + 1;
      let txt = t.e[k];
      if (k === 'contacto') txt = t.e.contacto(ev.landing.sunAboveDeg, ev.landing.earthAboveDeg, l);
      if (k === 'eva') txt = t.e.eva(eva.solMs == null ? null : t.e.cambia(eva.solVis, (eva.solMs - m.evaMs) / H, l), eva.tierraMs == null ? null : t.e.cambia(eva.tierraVis, (eva.tierraMs - m.evaMs) / H, l), eva);
      return `- **${t.dia} ${dia} · ${cuando(ms, l)}** — ${txt}`;
    };
    md[l] = [
      `# ${m.id} · ${m.nombre[l]}`, '', `**${t.plan}.** ${t.aviso}`, '',
      `- **${t.sitio}:** ${zona.nombre} · ${num(Math.abs(zona.lat), 2, l)}° S, ${num(zona.lon, 2, l)}° E`,
      `- **${t.contacto}:** ${cuando(m.ms, l)}`,
      `- **${t.estadia}:** ${t.dias(REGLA.stayDays)}`,
      `- **${t.equipo}:** ${t.regla(REGLA)}`,
      `- **${t.veredicto}:** ${ev.ok ? t.cumple : t.noCumple}`, '',
      `## ${t.req}`, '', ...ev.checks.map((c) => `- ${t.c[c.id](c, l, ev.landing)} — **${c.ok ? t.ok : t.falla}**`), '',
      `## ${t.cifras}`, '',
      `- ${t.sol}: ${Math.round(f.sunPct)} %`, `- ${t.tierra}: ${Math.round(f.earthPct)} %`, `- ${t.ambos}: ${Math.round(f.bothPct)} %`,
      `- ${t.noche}: ${f.longestNightH > 0 ? horas(f.longestNightH, l) : t.nada}`, `- ${t.silencio}: ${f.longestSilenceH > 0 ? horas(f.longestSilenceH, l) : t.nada}`, '',
      `## ${t.linea}`, '', ...eventos.map(([ms, k]) => linea(ms, k)), ''
    ].join('\n');
  }
  const q = new URLSearchParams({ sitio: zona.id, fecha: new Date(m.ms).toISOString().slice(0, 19) + 'Z', estadia: String(REGLA.stayDays * 24), panel: String(REGLA.panelM), antena: String(REGLA.antennaM) });
  if (m.evaMs) { q.set('eva', String(Math.round((m.evaMs - m.ms) / H))); q.set('ruta', m.ruta); }
  return { sim: '/simulador?' + q.toString(), ok: ev.ok, eventos: eventos.length, markdown: md };
}

const out = {};
for (const m of MISIONES) out[m.id] = bitacora(m);

const destino = path.join(AQUI, 'data', 'bitacoras-campana.js');
fs.writeFileSync(destino,
  '/* Lunar Map · bitácora planificada de las misiones con fecha de la campaña de ejemplo (Missions). Lo genera\n' +
  ' * tools/bitacoras-campana.js con el motor del planificador (engine.js) y data/zonas.js: es un plan calculado, no un registro. */\n' +
  'window.LunarData = window.LunarData || {};\nLunarData.bitacorasPlan = ' + JSON.stringify(out) + ';\n');
console.log('->', destino, fs.statSync(destino).size, 'bytes');
for (const id of Object.keys(out)) console.log(id, out[id].ok ? 'cumple' : 'no cumple', out[id].eventos, 'eventos', out[id].sim);
console.log('\n' + out['CR-02'].markdown.es);
