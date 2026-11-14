// E26.1: luz en el alunizaje del Apollo 11, para validar el criterio de luz del descenso contra TN D-6846 (pp. 10–11: el
// Sol a 10,9° nominal y 13,6° como máximo, con la línea de vista de ~16° por encima). Se corre a mano:
//
//   bun run scripts/luz-apollo11.ts
//
// Sitio: LM del Apollo 11, 0,67416° N, 23,47314° E (LROC-COORD 2016). Hora: 1969-07-20 20:17:40 UT (NSSDCA, LM del
// Apollo 11, 1969-059C). Horizons (DE441), azimut y elevación aparentes del Sol, cada minuto alrededor de esa hora.
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const sitio = { latitudGrados: 0.67416, longitudEsteGrados: 23.47314 }
const params = new URLSearchParams({
  format: 'json', COMMAND: "'10'", OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'", CENTER: "'coord@301'",
  COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${sitio.longitudEsteGrados},${sitio.latitudGrados},0'`, START_TIME: "'1969-07-20 20:17'",
  STOP_TIME: "'1969-07-20 20:18'", STEP_SIZE: "'1 m'", QUANTITIES: "'4'", ANG_FORMAT: "'DEG'", CSV_FORMAT: "'YES'", TIME_TYPE: "'UT'",
})
const url = `${API}?${params}`
const t = ((await (await fetch(url)).json()) as { result: string }).result
const filas = t.slice(t.indexOf('$$SOE') + 5, t.indexOf('$$EOE')).trim().split('\n').map((l) => l.split(',').map((x) => x.trim()))
const [a, b] = filas.map((c) => ({ az: Number(c[3]), el: Number(c[4]) }))
const f = 40 / 60
const datos = {
  procedencia: { fuente: 'NASA/JPL Horizons (DE441), cantidad 4', consulta: url, consultadoUTC: new Date().toISOString(), sitio: 'LROC-COORD 2016', hora: 'NSSDCA 1969-059C: "landed at 20:17:40 UT"' },
  sitio,
  contactoUTC: '1969-07-20T20:17:40Z',
  sol: { azimutGrados: a.az + (b.az - a.az) * f, elevacionGrados: a.el + (b.el - a.el) * f },
}
await Bun.write(new URL('../src/data/luz-apollo11.json', import.meta.url), JSON.stringify(datos, null, 1) + '\n')
console.log(datos.sol)
