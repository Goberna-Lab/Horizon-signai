/* Genera data/ventanas.js: las ventanas de aterrizaje de la campaña de ejemplo para Missions (inicio.html).
 *
 * Para cada zona candidata y cada día desde el 15 nov 2026 (182 días), si se puede alunizar ese día a las 09:00 UTC con
 * la regla del plan de CR-01: estadía de 3 días, panel y antena a 2 m, batería de 24 h, Tierra al menos el 40 % de la
 * estadía, y Sol y Tierra sobre el horizonte al alunizar. Es el mismo cálculo que el planificador (engine.js, scanDates
 * y dateWindows) con las mismas efemérides (JPL Horizons DE441) y los mismos horizontes (data/zonas.js).
 *
 * Código por día: G se puede alunizar · S hay Sol pero la Tierra no alcanza (oculta al alunizar o menos del 40 %) ·
 * N sin Sol al alunizar o una noche más larga que la batería.
 * También guarda, de cada zona, sus medias de Mazarico (2011) y, de los alunizajes de la campaña (CR-01 y SR-05), el Sol
 * y la Tierra al contacto y la noche más larga de la estadía.
 *
 * Uso (desde la raíz del repo):  node prototipos/lunar-map/tools/ventanas-aterrizaje.js
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
const DESDE = Date.UTC(2026, 10, 15, 9), DIAS = 182, DIA = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const r1 = (x) => Math.round(x * 10) / 10;

const zonas = {};
for (const z of Object.keys(Z)) {
  const st = E.station(Z[z], REGLA.panelM, REGLA.antennaM);
  const dias = E.scanDates(T, st, { landingMs: DESDE, stayDays: REGLA.stayDays, requirements: REGLA.requirements }, 0, DIAS - 1);
  const codigos = dias.map((d) => {
    if (d.ok) return 'G';
    const c = Object.fromEntries(d.checks.map((k) => [k.id, k.ok]));
    return !c.sunAtLanding || !c.battery ? 'N' : 'S';
  }).join('');
  const m = Z[z].mazarico || {};
  zonas[z] = {
    nombre: Z[z].nombre,
    sol: m.sol == null ? null : m.sol,
    tierra: m.tierra == null ? null : m.tierra,
    abiertas: Math.round(100 * (codigos.match(/G/g) || []).length / codigos.length),
    ventanas: E.dateWindows(dias).map((w) => [iso(w.fromMs), iso(w.toMs)]),
    dias: codigos
  };
}

function contacto(z, ms) {
  const e = E.evaluate(T, E.station(Z[z], REGLA.panelM, REGLA.antennaM), { landingMs: ms, stayDays: REGLA.stayDays, requirements: REGLA.requirements });
  return { zona: z, fecha: new Date(ms).toISOString().slice(0, 16) + 'Z', ok: e.ok, sol: r1(e.landing.sunAboveDeg), tierra: r1(e.landing.earthAboveDeg), nocheH: r1(e.figures.longestNightH), tierraPct: Math.round(e.figures.earthPct) };
}

const out = {
  desde: iso(DESDE), dias: DIAS,
  regla: '09:00 UTC · 3-day stay · panel and antenna 2 m · battery 24 h · Earth ≥ 40%',
  zonas,
  contactos: { 'CR-01': contacto('A', Date.UTC(2026, 11, 18, 9)), 'SR-05': contacto('C', Date.UTC(2027, 4, 5, 9)) }
};

const destino = path.join(AQUI, 'data', 'ventanas.js');
fs.writeFileSync(destino,
  '/* Lunar Map · ventanas de aterrizaje de la campaña de ejemplo (Missions). Lo genera tools/ventanas-aterrizaje.js con el\n' +
  ' * motor del planificador (engine.js) y data/zonas.js. Código por día desde «desde»: G se puede alunizar, S Sol pero sin\n' +
  ' * Tierra suficiente, N sin Sol o noche más larga que la batería. */\n' +
  'window.LunarData = window.LunarData || {};\nLunarData.ventanas = ' + JSON.stringify(out) + ';\n');
console.log('->', destino, fs.statSync(destino).size, 'bytes');
for (const z of ['A', 'B', 'C', 'D']) console.log(z, zonas[z].abiertas + '%', zonas[z].ventanas.slice(0, 3).map((w) => w.join('..')).join(' '));
console.log(JSON.stringify(out.contactos));
