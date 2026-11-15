/* Genera data/zonas.js: las 13 candidatas del polo sur que muestra la Bitácora de misión (mapa 3D, categoría «candidata»
 * de apps/web/scripts/mapa-3d/sitios.json), cada una con su máscara de horizonte, para elegirlas en el planificador.
 *
 * - A, B, C: las tres RoI de siempre (Barker et al. 2021), sin cambios (se copian del data/zonas.js actual). Son las
 *   regiones elegidas dentro de Connecting Ridge, Peak near Shackleton y Shackleton Rim.
 * - D a J: el resto de sitios del catálogo de Horizon Signal, con su envolvente detallada (DTM de 5 m de PGDA hasta 4 km
 *   y LOLA 240/960 m hasta 150 km): luna-recursos/datos/horizonte-catalogo-<id>.json; Mazarico (2011) de
 *   validacion-catalogo.json cuando está.
 * - K, L, M: los tres sitios de LROC sin DTM de PGDA (Mons Mouton, Mons Mouton Plateau, Peak near Cabeus B): máscara
 *   APROXIMADA sobre el relieve polar de LOLA, con el mismo motor que el «punto propio» (engine.js, mascaraPolar).
 *
 * Uso (desde la raíz del repo):  node prototipos/lunar-map/tools/zonas-candidatas.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const AQUI = path.resolve(__dirname, '..');
const REPO = path.resolve(AQUI, '..', '..');
const DATOS = path.join(REPO, 'luna-recursos', 'datos');

/* el motor y el relieve polar se cargan como en la página: scripts que cuelgan de window */
const ctx = { atob: (s) => Buffer.from(s, 'base64').toString('binary') };
ctx.window = ctx; /* en la página, window es el objeto global: LunarData se usa también sin «window.» */
vm.createContext(ctx);
const cargar = (f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
cargar(path.join(AQUI, 'engine.js'));
cargar(path.join(AQUI, 'data', 'zonas.js'));
cargar(path.join(AQUI, 'data', 'dem-polo.js'));
const E = ctx.window.Lunar.Engine;
const actuales = ctx.window.LunarData.zonas;

const sitios = JSON.parse(fs.readFileSync(path.join(REPO, 'apps/web/scripts/mapa-3d/sitios.json'), 'utf8')).sitios;
const sitio = (id) => { const s = sitios.find((x) => x.id === id); if (!s) throw new Error('falta ' + id); return s; };
const validacion = JSON.parse(fs.readFileSync(path.join(DATOS, 'validacion-catalogo.json'), 'utf8')).sitios;
const mazarico = (id) => {
  const v = validacion.find((x) => x.id === id);
  return v ? { sol: Math.round(v.mazaricoSol.valor * 100), tierra: Math.round(v.mazaricoTierra.valor * 100) } : null;
};

/* letra → sitio de la Bitácora; catalogo = id del horizonte detallado, o null para calcularlo sobre el relieve de LOLA */
const NUEVAS = [
  ['D', 'cand-de-gerlache', 'de Gerlache Rim 2', 'de-gerlache-rim'],
  ['E', 'cand-haworth', 'Haworth', 'haworth'],
  ['F', 'cand-malapert', 'Malapert Massif', 'malapert-massif'],
  ['G', 'cand-nobile-1', 'Nobile Rim 1', 'nobile-rim-1'],
  ['H', 'cand-nobile-2', 'Nobile Rim 2', 'nobile-rim-2'],
  ['I', 'cand-leibnitz-beta', 'Leibnitz Beta', 'leibnitz-beta'],
  ['J', 'cand-shoemaker', 'Shoemaker', 'shoemaker'],
  ['K', 'cand-mons-mouton', 'Mons Mouton', null],
  ['L', 'cand-mons-mouton-plateau', 'Mons Mouton Plateau', null],
  ['M', 'cand-cabeus-b', 'Peak near Cabeus B', null],
];

/* sitio = id en la Bitácora de misión (sitios.json): el mapa 3D lo manda como site=… al abrir el planificador */
const zonas = {
  A: { ...actuales.A, nombre: 'Connecting Ridge · RoI 6', sitio: 'cand-connecting-ridge' },
  B: { ...actuales.B, nombre: 'Peak near Shackleton · RoI 2', sitio: 'cand-peak-shackleton' },
  C: { ...actuales.C, nombre: 'Shackleton rim · RoI 4', sitio: 'cand-shackleton-rim' },
};
for (const [letra, idSitio, nombre, catalogo] of NUEVAS) {
  const s = sitio(idSitio);
  if (catalogo) {
    const h = JSON.parse(fs.readFileSync(path.join(DATOS, `horizonte-catalogo-${catalogo}.json`), 'utf8'));
    if (h.pasoAzimutGrados !== 0.5 || h.envolvente.length !== 720) throw new Error('formato inesperado en ' + catalogo);
    zonas[letra] = { id: catalogo, sitio: idSitio, nombre, lat: s.lat, lon: s.lon, mazarico: mazarico(catalogo), paso: 0.5, v: h.envolvente };
  } else {
    const t0 = Date.now();
    const dem = E.crearDem(ctx.window.LunarData.demPolar);
    const m = E.mascaraPolar(dem, s.lat, s.lon);
    zonas[letra] = { id: idSitio.replace(/^cand-/, ''), sitio: idSitio, nombre, lat: s.lat, lon: s.lon, mazarico: null, paso: 0.5, v: m.v, alturaM: Math.round(m.alturaM), aproximado: true };
    console.log(letra, nombre, 'máscara LOLA en', Date.now() - t0, 'ms');
  }
}

const cabecera = `/* Lunar Map · las 13 zonas candidatas del polo sur (las mismas de la Bitácora de misión) con su máscara de horizonte: por
 * azimut, la envolvente convexa superior del terreno (x m desde el pie, y m sobre el suelo). El horizonte desde una altura
 * H es máx atan2(y − H, x) (mascara.ts).
 * A, B, C: RoI de Barker et al. (2021). D–J: sitios del catálogo de Horizon Signal (LOLA + DTM de 5 m de PGDA). K, L, M:
 * sitios de LROC sin DTM de PGDA, horizonte aproximado sobre LOLA 240 m (aproximado: true). Mazarico (2011): medias a ras
 * del suelo sobre el DEM de 60 m, de validacion-catalogo.json. Lo genera tools/zonas-candidatas.js. */
`;
const salida = path.join(AQUI, 'data', 'zonas.js');
fs.writeFileSync(salida, cabecera + 'window.LunarData = window.LunarData || {};\nLunarData.zonas = ' + JSON.stringify(zonas) + ';\n');
console.log('->', salida, (fs.statSync(salida).size / 1024).toFixed(0), 'KB,', Object.keys(zonas).length, 'zonas');

/* data/candidatas.js: solo las posiciones (para el radar de Missions, que no necesita los horizontes) */
const posiciones = Object.entries(zonas).map(([z, v]) => ({ z, nombre: v.nombre, lat: v.lat, lon: v.lon, sitio: v.sitio, aproximado: !!v.aproximado }));
const salida2 = path.join(AQUI, 'data', 'candidatas.js');
fs.writeFileSync(salida2, '/* Lunar Map · posiciones de las 13 zonas candidatas (las de data/zonas.js, sin horizontes). Lo genera tools/zonas-candidatas.js. */\n' +
  'window.LunarData = window.LunarData || {};\nLunarData.candidatas = ' + JSON.stringify(posiciones) + ';\n');
console.log('->', salida2, (fs.statSync(salida2).size / 1024).toFixed(1), 'KB');
