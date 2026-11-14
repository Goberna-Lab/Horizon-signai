// E21: datos para validar la iluminación del sitio polar contra un producto científico publicado. Se corre a mano:
//
//   LUNA_SITIO=connecting-ridge bun run scripts/validar-iluminacion.ts
//
// 1) Referencia: mapas de visibilidad media del disco solar y del terrestre de Mazarico et al. (2011), Icarus 211,
//    1066–1081 (PGDA, producto 69; PDS LOLA EXTRAS), AVGVISIB_85S_060M_201608(_EARTH).IMG: "the percentage of timesteps
//    where each pixel was sunlit (by any fraction of the solar disc)", con pasos horarios durante 18,6 años, sobre el DEM
//    LOLA de 60 m. Se lee por rangos el píxel del sitio y sus vecinos.
// 2) Serie propia: azimut y elevación del Sol y la Tierra vistos desde el sitio (JPL Horizons, DE441) cada 3 h durante
//    18,6 años desde el 2026-11-06 (un ciclo de nutación, como la referencia; el intervalo exacto de Mazarico no se publica).
//    Se guarda en binario (Float32: az, el por fila) para que la prueba recalcule la visibilidad con el horizonte del motor.
import { SITIO_ACTIVO } from '../src/engine/sitio'
import { estereo } from './polar'

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const MAZARICO = 'http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG'
const INICIO = Date.UTC(2026, 10, 6)
const ANIOS = 18.6
const PASO_H = 3
const TRAMO = 10_000
const H_MS = 3_600_000

/** E24: exportada para validar el catálogo (scripts/validar-catalogo.ts). */
export async function pixelMazarico(producto: string, lat: number, lon: number) {
  const etiqueta = await (await fetch(`${MAZARICO}/${producto}.LBL`)).text()
  const num = (k: string) => Number.parseFloat(etiqueta.match(new RegExp(`^\\s*${k}\\s*=\\s*"?([-0-9.]+)`, 'm'))![1])
  const RECORD = num('RECORD_BYTES')
  const ESCALA = num('MAP_SCALE')
  const LOFF = num('LINE_PROJECTION_OFFSET')
  const SOFF = num('SAMPLE_PROJECTION_OFFSET')
  const FACTOR = num('SCALING_FACTOR')
  if (!/POLAR STEREOGRAPHIC/.test(etiqueta) || num('A_AXIS_RADIUS') !== 1737.4 || num('SAMPLE_BITS') !== 16) throw new Error('Etiqueta inesperada.')
  const [x, y] = estereo(lat, lon)
  const c = Math.round(x / ESCALA + SOFF)
  const f = Math.round(LOFF - y / ESCALA)
  const resp = await fetch(`${MAZARICO}/${producto}.IMG`, { headers: { Range: `bytes=${(f - 1) * RECORD}-${(f + 2) * RECORD - 1}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 y llegó ${resp.status}`)
  const dv = new DataView(await resp.arrayBuffer())
  const vecinos: number[] = []
  for (let df = 0; df < 3; df++) for (let dc = -1; dc <= 1; dc++) vecinos.push(dv.getInt16(df * RECORD + (c + dc) * 2, true) * FACTOR)
  return { producto, archivo: `${MAZARICO}/${producto}.IMG`, fila: f, columna: c, valor: vecinos[4], vecinos3x3: vecinos.map((v) => Number(v.toFixed(4))) }
}

async function serie(cuerpo: '10' | '399', filas: number) {
  const out = new Float32Array(filas * 2)
  const consultas: string[] = []
  for (let k = 0; k < filas; k += TRAMO) {
    const n = Math.min(TRAMO, filas - k)
    const a = new Date(INICIO + k * PASO_H * H_MS).toISOString().slice(0, 16).replace('T', ' ')
    const b = new Date(INICIO + (k + n - 1) * PASO_H * H_MS).toISOString().slice(0, 16).replace('T', ' ')
    const params = new URLSearchParams({
      format: 'json', COMMAND: `'${cuerpo}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
      CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'",
      SITE_COORD: `'${SITIO_ACTIVO.longitudEsteGrados},${SITIO_ACTIVO.latitudGrados},0'`,
      START_TIME: `'${a}'`, STOP_TIME: `'${b}'`, STEP_SIZE: `'${PASO_H} h'`, QUANTITIES: "'4'", ANG_FORMAT: "'DEG'",
      CSV_FORMAT: "'YES'", TIME_TYPE: "'UT'",
    })
    const url = `${API}?${params}`
    const json = (await (await fetch(url)).json()) as { result?: string; error?: string }
    if (json.error || !json.result) throw new Error(`Horizons: ${json.error ?? 'sin resultado'}`)
    const t = json.result
    const lineas = t.slice(t.indexOf('$$SOE') + 5, t.indexOf('$$EOE')).trim().split('\n')
    if (lineas.length !== n) throw new Error(`Se esperaban ${n} filas y llegaron ${lineas.length}.`)
    lineas.forEach((l, i) => {
      const c = l.split(',').map((x) => x.trim())
      out[(k + i) * 2] = Number(c[3])
      out[(k + i) * 2 + 1] = Number(c[4])
    })
    consultas.push(url)
  }
  return { out, consultas }
}

async function main() {
  if (SITIO_ACTIVO.id !== 'connecting-ridge') throw new Error('Este script es para LUNA_SITIO=connecting-ridge.')
  const { latitudGrados: lat, longitudEsteGrados: lon } = SITIO_ACTIVO
  const [sol, tierra] = await Promise.all([pixelMazarico('AVGVISIB_85S_060M_201608', lat, lon), pixelMazarico('AVGVISIB_85S_060M_201608_EARTH', lat, lon)])
  const filas = Math.floor((ANIOS * 365.25 * 24) / PASO_H)
  const s = await serie('10', filas)
  const e = await serie('399', filas)
  await Bun.write(new URL(`../src/data/serie-sol-${SITIO_ACTIVO.id}.f32`, import.meta.url), s.out)
  await Bun.write(new URL(`../src/data/serie-tierra-${SITIO_ACTIVO.id}.f32`, import.meta.url), e.out)
  const meta = {
    procedencia: {
      referencia: 'Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), "Illumination conditions of the lunar polar regions using LOLA topography", Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030; PGDA producto 69',
      definicion: 'Fracción de pasos horarios, durante 18,6 años, con alguna parte del disco (solar o terrestre) sobre el horizonte; DEM LOLA LDEM_85S_060M; altura del observador no publicada.',
      serie: 'JPL Horizons (DE441), cantidad 4 (azimut y elevación aparentes sin atmósfera), desde el sitio, cada 3 h durante 18,6 años desde 2026-11-06 00:00 UTC.',
      consultadoUTC: new Date().toISOString(),
      consultasSol: s.consultas,
      consultasTierra: e.consultas,
    },
    inicioUTC: new Date(INICIO).toISOString(),
    pasoH: PASO_H,
    filas,
    formato: 'Float32 little-endian, por fila: azimut (°), elevación (°)',
    mazaricoSol: sol,
    mazaricoTierra: tierra,
  }
  await Bun.write(new URL(`../src/data/validacion-iluminacion-${SITIO_ACTIVO.id}.json`, import.meta.url), JSON.stringify(meta, null, 1) + '\n')
  console.log(`Mazarico en el sitio: Sol ${(sol.valor * 100).toFixed(1)} % (vecinos ${sol.vecinos3x3.join(', ')}), Tierra ${(tierra.valor * 100).toFixed(1)} % (vecinos ${tierra.vecinos3x3.join(', ')}).`)
  console.log(`Serie: ${filas} filas por cuerpo.`)
}

if (import.meta.main) await main()
