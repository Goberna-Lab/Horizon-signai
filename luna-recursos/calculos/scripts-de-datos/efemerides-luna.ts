// E22: efemérides para cualquier punto de la Luna y cualquier fecha de 2026 a 2030 (misiones próximas, decisión de
// Estephano del 2026-11-07). En vez de una tabla por sitio (E5, E18), una sola tabla con el punto subsolar y el punto
// sub-Tierra en ejes fijos a la Luna (MOON_ME, el sistema "Mean Earth/polar axis" de Horizons) y las distancias. De ahí
// sale la dirección del Sol y de la Tierra desde cualquier latitud y longitud (src/engine/efemeridesLuna.ts), con el
// paralaje del sitio. Se corre a mano:
//
//   bun run scripts/efemerides-luna.ts
//
// Consultas (JPL Horizons, DE441): objetivo la Luna (301), observador el centro del Sol (500@10) o de la Tierra
// (500@399), cantidades 14 (punto sub-observador, aparente), 20 (distancia) y 21 (tiempo de luz). El punto sub-observador
// es el de la Luna en el instante en que salió la luz, t − tiempo de luz; por eso cada fila se corre a ese instante y
// luego se vuelve a muestrear en una rejilla regular de 3 h. Comprobado contra las tablas por sitio (Apollo 17 y
// Connecting Ridge): ≤ 0,006°, con la aberración anual (~20″) como residuo, porque el observador de Horizons está en el
// centro del Sol o de la Tierra y no en la superficie de la Luna.
//
// La API de Horizons no envía cabeceras CORS: el navegador no puede consultarla, por eso la tabla se guarda aquí.
// Cita pedida por JPL: "NASA/JPL Horizons On-Line Ephemeris System", J. D. Giorgini y JPL Solar System Dynamics Group.

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
/** UA en km (IAU 2012, resolución B2). */
const UA_KM = 149_597_870.7
const HORA_MS = 3_600_000
const PASO_MS = 3 * HORA_MS
const INICIO_MS = Date.UTC(2026, 0, 1)
const FIN_MS = Date.UTC(2031, 0, 1)
/** Filas por consulta (la salida de Horizons tiene un límite de líneas). */
const TRAMO_FILAS = 2000
const MESES = 'JanFebMarAprMayJunJulAugSepOctNovDec'

type Fila = { tau: number; lon: number; lat: number; distanciaKm: number }

const fechaConsulta = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

async function consultar(centro: '500@10' | '500@399', inicioMs: number, finMs: number) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: "'301'",
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: `'${centro}'`,
    START_TIME: `'${fechaConsulta(inicioMs)}'`,
    STOP_TIME: `'${fechaConsulta(finMs)}'`,
    STEP_SIZE: "'3 h'",
    QUANTITIES: "'14,20,21'",
    ANG_FORMAT: "'DEG'",
    CSV_FORMAT: "'YES'",
    TIME_TYPE: "'UT'",
    EXTRA_PREC: "'YES'",
  })
  const url = `${API}?${params}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Horizons respondió ${resp.status}`)
  const json = (await resp.json()) as { result?: string; error?: string }
  if (json.error || !json.result) throw new Error(`Horizons: ${json.error ?? 'sin resultado'}`)
  const texto = json.result
  const ini = texto.indexOf('$$SOE')
  const fin = texto.indexOf('$$EOE')
  if (ini < 0 || fin < 0) throw new Error(`Horizons: tabla no encontrada.\n${texto.slice(0, 1500)}`)
  if (!/Target pole\/equ : MOON_ME/.test(texto)) throw new Error('Horizons no usó el sistema MOON_ME para la Luna.')
  // Columnas: fecha, bandera solar, bandera de cuerpo, sub-lon, sub-lat, delta (au), deldot, tiempo de luz (min).
  const filas: Fila[] = texto
    .slice(ini + 5, fin)
    .trim()
    .split('\n')
    .map((linea) => {
      const c = linea.split(',').map((x) => x.trim())
      const m = c[0].match(/^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})$/)
      if (!m) throw new Error(`Fecha de Horizons inesperada: "${c[0]}"`)
      const ms = Date.UTC(Number(m[1]), MESES.indexOf(m[2]) / 3, Number(m[3]), Number(m[4]), Number(m[5]))
      return { tau: ms - Number(c[7]) * 60_000, lon: Number(c[3]), lat: Number(c[4]), distanciaKm: Number(c[5]) * UA_KM }
    })
  const linea = (clave: string) => texto.match(new RegExp(`^${clave}.*$`, 'm'))?.[0].trim() ?? ''
  const cabecera = ['Target body name', 'Center body name', 'Target pole/equ', 'Target radii', 'Rel. light bend', ' Date__\\(UT\\)'].map(linea)
  return { url, filas, cabecera }
}

async function consultarTodo(centro: '500@10' | '500@399') {
  // Un paso de margen a cada lado: el corrimiento por el tiempo de luz (8,3 min para el Sol) deja la primera fila después
  // de INICIO_MS.
  const desde = INICIO_MS - PASO_MS
  const hasta = FIN_MS + PASO_MS
  const filas: Fila[] = []
  const urls: string[] = []
  let cabecera: string[] = []
  for (let a = desde; a <= hasta; a += TRAMO_FILAS * PASO_MS) {
    const b = Math.min(a + (TRAMO_FILAS - 1) * PASO_MS, hasta)
    const r = await consultar(centro, a, b)
    filas.push(...r.filas)
    urls.push(r.url)
    if (!cabecera.length) cabecera = r.cabecera
  }
  const esperadas = Math.round((hasta - desde) / PASO_MS) + 1
  if (filas.length !== esperadas) throw new Error(`Se esperaban ${esperadas} filas y llegaron ${filas.length}.`)
  for (let i = 1; i < filas.length; i++) if (!(filas[i].tau > filas[i - 1].tau)) throw new Error(`Filas desordenadas en ${i}.`)
  return { filas, urls, cabecera }
}

const RAD = Math.PI / 180
const unitario = (lon: number, lat: number): [number, number, number] => [
  Math.cos(lat * RAD) * Math.cos(lon * RAD),
  Math.cos(lat * RAD) * Math.sin(lon * RAD),
  Math.sin(lat * RAD),
]

/** Vuelve a muestrear en la rejilla regular: vector unitario interpolado y normalizado, distancia lineal. */
function remuestrear(filas: Fila[], ms: number, cursor: { i: number }): [number, number, number, number] {
  while (cursor.i < filas.length - 2 && filas[cursor.i + 1].tau <= ms) cursor.i++
  const i = cursor.i
  const a = filas[i]
  const b = filas[i + 1]
  if (ms < a.tau || ms > b.tau) throw new Error(`Sin filas alrededor de ${new Date(ms).toISOString()}.`)
  const f = (ms - a.tau) / (b.tau - a.tau)
  const ua = unitario(a.lon, a.lat)
  const ub = unitario(b.lon, b.lat)
  const v = ua.map((x, k) => x + (ub[k] - x) * f)
  const n = Math.hypot(v[0], v[1], v[2])
  return [v[0] / n, v[1] / n, v[2] / n, a.distanciaKm + (b.distanciaKm - a.distanciaKm) * f]
}

async function main() {
  const sol = await consultarTodo('500@10')
  const tierra = await consultarTodo('500@399')
  const n = Math.round((FIN_MS - INICIO_MS) / PASO_MS) + 1
  const tabla = new Float32Array(n * 8)
  const cs = { i: 0 }
  const ct = { i: 0 }
  for (let k = 0; k < n; k++) {
    const ms = INICIO_MS + k * PASO_MS
    tabla.set(remuestrear(sol.filas, ms, cs), k * 8)
    tabla.set(remuestrear(tierra.filas, ms, ct), k * 8 + 4)
  }
  const meta = {
    procedencia: {
      fuente: 'NASA/JPL Horizons On-Line Ephemeris System (J. D. Giorgini y JPL Solar System Dynamics Group), DE441',
      api: API,
      consultadoUTC: new Date().toISOString(),
      notas: [
        'Objetivo: la Luna (301). Observador: centro del Sol (500@10) para el punto subsolar y centro de la Tierra (500@399) para el punto sub-Tierra.',
        'Cantidad 14: longitud y latitud aparentes del punto sub-observador en MOON_ME (este positivo). Cantidad 20: distancia. Cantidad 21: tiempo de luz.',
        'Cada fila se corrió a t − tiempo de luz (la Luna en el instante en que la luz la alcanza) y se volvió a muestrear cada 3 h.',
      ],
      cabeceraSol: sol.cabecera,
      cabeceraTierra: tierra.cabecera,
      consultasSol: sol.urls,
      consultasTierra: tierra.urls,
    },
    inicioUTC: new Date(INICIO_MS).toISOString(),
    finUTC: new Date(FIN_MS).toISOString(),
    pasoS: PASO_MS / 1000,
    filas: n,
    /** Por fila, float32: Sol (x, y, z unitario en MOON_ME; distancia km), Tierra (ídem). */
    columnas: ['solX', 'solY', 'solZ', 'solKm', 'tierraX', 'tierraY', 'tierraZ', 'tierraKm'],
    archivo: 'efemerides-luna.f32',
  }
  await Bun.write(new URL('../src/data/efemerides-luna.f32', import.meta.url), tabla.buffer)
  await Bun.write(new URL('../src/data/efemerides-luna.json', import.meta.url), JSON.stringify(meta, null, 1) + '\n')
  console.log(`${n} filas (${meta.inicioUTC} → ${meta.finUTC}, cada 3 h), ${(tabla.byteLength / 1024).toFixed(0)} KB`)
}

await main()
