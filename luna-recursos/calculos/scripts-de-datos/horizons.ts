// E5: descarga efemérides reales del Sol y la Tierra vistas desde el sitio del Apollo 17 (JPL Horizons)
// y las guarda en src/data/efemerides-apollo17.json, con su procedencia. Se corre a mano:
//
//   bun run scripts/horizons.ts                        (6 días lunares desde la última salida antes del 2026-11-06 00:00 UTC)
//   bun run scripts/horizons.ts "2026-12-01 00:00" 3   (otra fecha de referencia, UTC, y otra cantidad de días)
//   LUNA_SITIO=connecting-ridge bun run scripts/horizons.ts   (E20: otro sitio de src/engine/sitio.ts)
//
// E18: guarda N días lunares seguidos (N + 1 salidas del Sol) en una sola tabla horaria, sin cortes, para que el reloj
// corra de un día al siguiente con la libración y la fase de la Tierra reales de cada mes.
//
// La API de Horizons no envía cabeceras CORS: el navegador no puede consultarla, por eso los datos
// se descargan aquí y la app solo lee el JSON. Documentación: https://ssd-api.jpl.nasa.gov/doc/horizons.html
// Cita pedida por JPL: "NASA/JPL Horizons On-Line Ephemeris System", J. D. Giorgini y JPL Solar System
// Dynamics Group, con la fecha de consulta.

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'

/**
 * Sitio: módulo lunar del Apollo 17, 20,1911° N, 30,7723° E, ±3,5 m (LROC, "Coordinates of Lunar Anthropogenic
 * Targets", 2016; Wagner et al., Icarus 283). NSSDCA da 20.19 N, 30.77 E, con precisión de ~300 m.
 * Altitud 0 respecto de la esfera de 1737,4 km: los 2,6 km bajo la esfera cambian la dirección del Sol en
 * menos de 0,0001° y no importan aquí.
 */
import { SITIO_ACTIVO } from '../src/engine/sitio'

const SITIO =
  SITIO_ACTIVO.id === 'apollo17'
    ? {
        nombre: 'Apollo 17, módulo lunar (Taurus-Littrow)',
        latitudGrados: 20.1911,
        longitudEsteGrados: 30.7723,
        altitudKm: 0,
        fuente:
          'LROC Science Operations Team (ASU), "Coordinates of Lunar Anthropogenic Targets", 28 de julio de 2016; Wagner et al., Icarus 283 (2017) 92–103',
      }
    : {
        // E20: sitios de src/engine/sitio.ts; altitud 0 sobre la esfera de 1737,4 km, como el Apollo 17.
        nombre: SITIO_ACTIVO.nombre,
        latitudGrados: SITIO_ACTIVO.latitudGrados,
        longitudEsteGrados: SITIO_ACTIVO.longitudEsteGrados,
        altitudKm: 0,
        fuente: SITIO_ACTIVO.fuenteCoordenadas,
      }

const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS
const MARGEN_H = 3
/** E18: filas por consulta. La salida de Horizons tiene un límite de líneas; se consulta por tramos de ~83 días. */
const TRAMO_FILAS = 2000
/** E18: días lunares seguidos por defecto. */
const DIAS_LUNARES = 6

type Fila = { ms: number; az: number; el: number; illu: number; diamArcsec: number; distAu: number }

const MESES: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

/** "2026-Nov-05 22:00" (UTC) → milisegundos. */
function fechaHorizons(texto: string): number {
  const m = texto.trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})$/)
  if (!m) throw new Error(`Fecha de Horizons inesperada: "${texto}"`)
  return Date.UTC(Number(m[1]), MESES[m[2]], Number(m[3]), Number(m[4]), Number(m[5]))
}

/** milisegundos → "2026-11-05 22:00" para la consulta. */
function fechaConsulta(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

async function consultar(cuerpo: '10' | '399', inicioMs: number, finMs: number, cantidades: string) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${cuerpo}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${SITIO.longitudEsteGrados},${SITIO.latitudGrados},${SITIO.altitudKm}'`,
    START_TIME: `'${fechaConsulta(inicioMs)}'`,
    STOP_TIME: `'${fechaConsulta(finMs)}'`,
    STEP_SIZE: "'1 h'",
    QUANTITIES: `'${cantidades}'`,
    ANG_FORMAT: "'DEG'",
    CSV_FORMAT: "'YES'",
    // E7 (FA cap. 11.4, pp. 255–256): escala de tiempo explícita; las filas son UT (UTC desde 1962).
    TIME_TYPE: "'UT'",
  })
  const url = `${API}?${params}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Horizons respondió ${resp.status} para ${url}`)
  const json = (await resp.json()) as { result?: string; error?: string }
  if (json.error || !json.result) throw new Error(`Horizons: ${json.error ?? 'sin resultado'}`)
  const texto = json.result
  const ini = texto.indexOf('$$SOE')
  const fin = texto.indexOf('$$EOE')
  if (ini < 0 || fin < 0) throw new Error(`Horizons: tabla no encontrada.\n${texto.slice(0, 1500)}`)
  // Columnas (CSV, cantidades 4,10,13,20): fecha, bandera solar, bandera de cuerpo interferente,
  // azimut, elevación, iluminación %, diámetro angular ″, distancia au, velocidad radial km/s.
  const filas: Fila[] = texto
    .slice(ini + 5, fin)
    .trim()
    .split('\n')
    .map((linea) => {
      const c = linea.split(',').map((x) => x.trim())
      return {
        ms: fechaHorizons(c[0]),
        az: Number(c[3]),
        el: Number(c[4]),
        illu: Number(c[5]),
        diamArcsec: Number(c[6]),
        distAu: Number(c[7]),
      }
    })
  const linea = (clave: string) => texto.match(new RegExp(`^${clave}.*$`, 'm'))?.[0].trim() ?? ''
  const cabecera = [
    'Target body name',
    'Center body name',
    'Center geodetic',
    'Center pole/equ',
    'Center radii',
    'Target radii',
    'Start time',
    'Atmos refraction',
    'Rel. light bend',
    'Vis. interferer',
    'EOP file',
    ' Date__\\(UT\\)',
  ].map(linea)
  return { url, filas, cabecera }
}

/**
 * E18: la misma consulta, partida en tramos de hasta TRAMO_FILAS filas sobre una rejilla horaria continua. Comprueba
 * que las filas unidas no tengan huecos ni repetidos.
 */
async function consultarPorTramos(cuerpo: '10' | '399', inicioMs: number, finMs: number, cantidades: string) {
  const total = Math.round((finMs - inicioMs) / HORA_MS) + 1
  const tramos = Math.ceil(total / TRAMO_FILAS)
  const porTramo = Math.ceil(total / tramos)
  const filas: Fila[] = []
  const urls: string[] = []
  let cabecera: string[] = []
  for (let k = 0; k < tramos; k++) {
    const a = inicioMs + k * porTramo * HORA_MS
    const b = Math.min(a + (porTramo - 1) * HORA_MS, finMs)
    const r = await consultar(cuerpo, a, b, cantidades)
    filas.push(...r.filas)
    urls.push(r.url)
    if (k === 0) cabecera = r.cabecera
  }
  filas.forEach((f, i) => {
    if (f.ms !== inicioMs + i * HORA_MS) throw new Error(`Tramos de Horizons con hueco o repetido en la fila ${i}.`)
  })
  if (filas.length !== total) throw new Error(`Se esperaban ${total} filas y llegaron ${filas.length}.`)
  return { urls, filas, cabecera }
}

/**
 * Límites de día (ms), interpolados entre filas. 'salida': la elevación del centro del Sol cruza 0° hacia arriba.
 * 'medianoche' (E20): el azimut del Sol cruza el antimeridiano (0° en el hemisferio norte, 180° en el sur), es decir,
 * el paso inferior por el meridiano (FA cap. 11.4, pp. 252–254).
 */
function cruces(filas: Fila[]): number[] {
  const salida: number[] = []
  const antimeridiano = SITIO.latitudGrados >= 0 ? 0 : 180
  const relativo = (az: number) => ((((az - antimeridiano + 540) % 360) + 360) % 360) - 180
  for (let i = 1; i < filas.length; i++) {
    const a = filas[i - 1]
    const b = filas[i]
    if (SITIO_ACTIVO.definicionDia === 'salida') {
      if (a.el <= 0 && b.el > 0) salida.push(a.ms + ((0 - a.el) / (b.el - a.el)) * (b.ms - a.ms))
    } else {
      const fa = relativo(a.az)
      const fb = relativo(b.az)
      if (Math.abs(fa) < 90 && Math.abs(fb) < 90 && (fa < 0) !== (fb < 0)) salida.push(a.ms + (fa / (fa - fb)) * (b.ms - a.ms))
    }
  }
  return salida
}

async function main() {
  const referencia = process.argv[2] ?? '2026-11-06 00:00'
  const refMs = Date.parse(referencia.replace(' ', 'T') + ':00Z')
  if (Number.isNaN(refMs)) throw new Error(`Fecha de referencia inválida: ${referencia}`)
  const nDias = Number(process.argv[3] ?? DIAS_LUNARES)
  if (!Number.isInteger(nDias) || nDias < 1) throw new Error(`Cantidad de días lunares inválida: ${process.argv[3]}`)

  // 1) Última salida del Sol antes de la referencia (un día lunar dura ~29,5 días).
  const previa = await consultar('10', refMs - 32 * 24 * HORA_MS, refMs, '4')
  const salidas = cruces(previa.filas)
  if (!salidas.length) throw new Error('No se encontró una salida del Sol en los 32 días previos.')
  const salidaMs = salidas[salidas.length - 1]

  // 2) E18: Sol con margen holgado (30,5 d por día lunar) para encontrar las N salidas siguientes. La rejilla es la
  //    misma de la consulta previa (horas enteras), así que la primera salida se reproduce exactamente.
  const inicioMs = Math.floor(salidaMs / HORA_MS) * HORA_MS - MARGEN_H * HORA_MS
  const holgado = await consultarPorTramos('10', inicioMs, inicioMs + Math.ceil(nDias * 30.5) * DIA_MS, '4,10,13,20')
  const todas = cruces(holgado.filas)
  if (todas.length < nDias + 1) throw new Error(`Solo se encontraron ${todas.length} salidas del Sol; se necesitan ${nDias + 1}.`)
  if (Math.abs(todas[0] - salidaMs) > 1) throw new Error('La primera salida no coincide con la de la consulta previa.')
  const salidasMs = todas.slice(0, nDias + 1)
  const proximaMs = salidasMs[nDias]

  // 3) Tabla horaria del Sol y la Tierra para los N días lunares, con margen a cada lado.
  const finMs = Math.ceil(proximaMs / HORA_MS) * HORA_MS + MARGEN_H * HORA_MS
  const filasTabla = Math.round((finMs - inicioMs) / HORA_MS) + 1
  const sol = { ...holgado, filas: holgado.filas.slice(0, filasTabla) }
  const tierra = await consultarPorTramos('399', inicioMs, finMs, '4,10,13,20')
  if (sol.filas.length !== tierra.filas.length || sol.filas[0].ms !== inicioMs || tierra.filas[0].ms !== inicioMs) {
    throw new Error('Las tablas del Sol y la Tierra no coinciden en tiempo.')
  }

  const r = (x: number, d: number) => Number(x.toFixed(d))
  const datos = {
    procedencia: {
      fuente: 'NASA/JPL Horizons On-Line Ephemeris System (J. D. Giorgini y JPL Solar System Dynamics Group)',
      api: API,
      consultadoUTC: new Date().toISOString(),
      notas: [
        'Azimut y elevación aparentes, sin atmósfera (cantidad 4); azimut desde el norte hacia el este; elevación respecto del plano perpendicular a la normal de la esfera de referencia, sin relieve local.',
        'Cantidad 10: fracción iluminada (%). Cantidad 13: diámetro angular (″). Cantidad 20: distancia (au).',
      ],
      cabeceraSol: sol.cabecera,
      cabeceraTierra: tierra.cabecera,
      // E18: una URL por tramo. Las del Sol cubren más días que la tabla: se recortan a la última salida + margen.
      consultasSol: sol.urls,
      consultasTierra: tierra.urls,
      referenciaUTC: referencia,
      diasLunares: nDias,
    },
    sitio: SITIO,
    /** E18/E20: cómo se cortan los días ('salida' o 'medianoche', src/engine/sitio.ts). */
    definicionDia: SITIO_ACTIVO.definicionDia,
    /** N + 1 límites: el día k va de limitesDiaUTC[k] a limitesDiaUTC[k + 1]. */
    limitesDiaUTC: salidasMs.map((ms) => new Date(ms).toISOString()),
    inicioTablaUTC: new Date(inicioMs).toISOString(),
    pasoS: 3600,
    sol: {
      azimutGrados: sol.filas.map((f) => r(f.az, 6)),
      elevacionGrados: sol.filas.map((f) => r(f.el, 6)),
      diametroArcsec: sol.filas.map((f) => r(f.diamArcsec, 3)),
      distanciaAu: sol.filas.map((f) => r(f.distAu, 9)),
    },
    tierra: {
      azimutGrados: tierra.filas.map((f) => r(f.az, 6)),
      elevacionGrados: tierra.filas.map((f) => r(f.el, 6)),
      iluminadaPorciento: tierra.filas.map((f) => r(f.illu, 5)),
      diametroArcsec: tierra.filas.map((f) => r(f.diamArcsec, 3)),
      distanciaAu: tierra.filas.map((f) => r(f.distAu, 11)),
    },
  }
  const destino = new URL(`../src/data/efemerides-${SITIO_ACTIVO.id}.json`, import.meta.url)
  await Bun.write(destino, JSON.stringify(datos, null, 1) + '\n')
  salidasMs.slice(1).forEach((ms, k) => {
    console.log(`Día ${k + 1}: ${datos.limitesDiaUTC[k]} → ${datos.limitesDiaUTC[k + 1]} (${((ms - salidasMs[k]) / DIA_MS).toFixed(4)} d)`)
  })
  console.log(`${sol.filas.length} filas por cuerpo → ${destino.pathname}`)
}

await main()
