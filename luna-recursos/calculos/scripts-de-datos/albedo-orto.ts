// E15.1: mapa de albedo real del sitio a partir de la ortofoto LROC NAC del Apollo 17 (0,6 m/píxel).
//
//   bun run scripts/albedo-orto.ts
//
// La foto trae "horneadas" la luz y las sombras del momento en que se tomó. Para obtener albedo (y no sombras dobles):
//   1) se lee por HTTP Range solo el recorte de 400 m (la ortofoto es de 740 MB, enteros de 16 bits sin comprimir);
//   2) se modela el brillo que tendría cada punto con albedo uniforme: Hapke del sitio (E12) con la normal del DTM (E6),
//      el Sol de la hora de la foto (JPL Horizons) y LRO mirando al nadir (supuesto: los pares NAC tienen poca inclinación);
//   3) albedo relativo = brillo medido / brillo modelado; se descartan los puntos en sombra propia o proyectada en la foto
//      y los de luz rasante (µ0 < 0,1) y se rellenan con sus vecinos;
//   4) se escala para que la media sea 0,085 (E8): los DN de la ortofoto no tienen escala radiométrica (SCALING_FACTOR 1),
//      así que de la foto solo se usan las VARIACIONES de albedo, no su valor absoluto.
// Formato según la etiqueta PDS adjunta: registros de 16264 bytes, 1 de etiqueta; LSB_INTEGER de 16 bits, 8132 × 47728;
// equirectangular, paralelo 20°, 0,6 m/píxel; nulos y saturados ≤ −32764.
import { W_SITIO, hapkeR } from '../src/engine/hapke'
import { LADO_ESTE_M, LADO_NORTE_M, alturaSuelo, dentroDelTerreno } from '../src/engine/terreno'

const IMG =
  'https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_1/NAC_DTM_APOLLO17_1_M134991788_60CM.IMG'
const PRODUCTO = 'NAC_DTM_APOLLO17_1_M134991788_60CM'
const TOMA_UTC = '2010-07-28T21:28:41'
/** Sol en el módulo a la hora de la foto (JPL Horizons, consultado el 2026-11-06): az 259,15°, elevación 25,33°. */
const SOL_TOMA = { azimutGrados: 259.152, elevacionGrados: 25.333 }

const RECORD = 16264
const LINEAS = 47728
const MUESTRAS = 8132
const R = 1_737_400
const ESC = 0.6
const LAT_REF = 20 * (Math.PI / 180)
const LOFF = 1032045.5
const SOFF = 7090555.5
const LON0 = 180
const LM = { lat: 20.1911, lon: 30.7723 }
/** D2: resolución nativa de la ortofoto (0,6 m/píxel sobre ~400 m): los cráteres pequeños reales, no sintéticos. */
const N = 667
const ALBEDO_MEDIO = 0.085

const rad = Math.PI / 180
const linea = (lat: number) => LOFF - (R * lat * rad) / ESC // 0-based, coordenada de centro de píxel
const muestra = (lon: number) => SOFF + (R * (lon - LON0) * rad * Math.cos(LAT_REF)) / ESC
const latDe = (z: number) => LM.lat + (-z / R) / rad
const lonDe = (x: number) => LM.lon + (x / (R * Math.cos(LM.lat * rad))) / rad

async function main() {
  // 1) Filas necesarias (con margen) y lectura por rango.
  const zs = [-LADO_NORTE_M / 2 - 5, LADO_NORTE_M / 2 + 5]
  const l0 = Math.max(0, Math.floor(Math.min(...zs.map((z) => linea(latDe(z))))) - 2)
  const l1 = Math.min(LINEAS - 1, Math.ceil(Math.max(...zs.map((z) => linea(latDe(z))))) + 2)
  const desde = RECORD * (1 + l0)
  const hasta = RECORD * (1 + l1 + 1) - 1
  const resp = await fetch(IMG, { headers: { Range: `bytes=${desde}-${hasta}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 y llegó ${resp.status}`)
  const buf = new DataView(await resp.arrayBuffer())
  const dn = (l: number, s: number) => {
    if (l < l0 || l > l1 || s < 0 || s >= MUESTRAS) return NaN
    const v = buf.getInt16((l - l0) * RECORD + s * 2, true)
    return v <= -32764 ? NaN : v
  }
  const dnBilineal = (lat: number, lon: number) => {
    const l = linea(lat)
    const s = muestra(lon)
    const li = Math.floor(l)
    const si = Math.floor(s)
    const tl = l - li
    const ts = s - si
    const a = dn(li, si)
    const b = dn(li, si + 1)
    const c = dn(li + 1, si)
    const d = dn(li + 1, si + 1)
    return (a * (1 - ts) + b * ts) * (1 - tl) + (c * (1 - ts) + d * ts) * tl
  }

  // 2) Geometría de la toma.
  const e = SOL_TOMA.elevacionGrados * rad
  const az = SOL_TOMA.azimutGrados * rad
  const sol = [Math.cos(e) * Math.sin(az), Math.sin(e), -Math.cos(e) * Math.cos(az)] // +X este, −Z norte
  const g = Math.acos(sol[1]) // fase con observador al nadir
  const enSombraProyectada = (x: number, z: number) => {
    const y0 = alturaSuelo(x, z)
    const tan = Math.tan(e)
    const h = Math.hypot(sol[0], sol[2])
    for (let d = 1; d <= 120; d += 1) {
      const xx = x + (sol[0] / h) * d
      const zz = z + (sol[2] / h) * d
      if (!dentroDelTerreno(xx, zz)) return false
      if (alturaSuelo(xx, zz) > y0 + d * tan) return true
    }
    return false
  }

  // 3) Albedo relativo por texel (filas de norte a sur, columnas de oeste a este, como el DTM).
  const razon = new Float64Array(N * N).fill(NaN)
  let validos = 0
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const x = -LADO_ESTE_M / 2 + ((c + 0.5) / N) * LADO_ESTE_M
      const z = -LADO_NORTE_M / 2 + ((f + 0.5) / N) * LADO_NORTE_M
      const medido = dnBilineal(latDe(z), lonDe(x))
      if (!(medido > 0)) continue
      const gx = (alturaSuelo(x + 1, z) - alturaSuelo(x - 1, z)) / 2
      const gz = (alturaSuelo(x, z + 1) - alturaSuelo(x, z - 1)) / 2
      const largo = Math.hypot(gx, 1, gz)
      const n = [-gx / largo, 1 / largo, -gz / largo]
      const mu0 = n[0] * sol[0] + n[1] * sol[1] + n[2] * sol[2]
      const mu = n[1]
      if (mu0 < 0.1 || enSombraProyectada(x, z)) continue
      razon[f * N + c] = medido / hapkeR(mu0, mu, g, W_SITIO)
      validos++
    }
  }
  // 4) Relleno de huecos con el promedio de vecinos válidos (varias pasadas) y escala a la media del sitio.
  for (let pasada = 0; pasada < 20; pasada++) {
    const copia = Float64Array.from(razon)
    let faltan = 0
    for (let f = 0; f < N; f++) {
      for (let c = 0; c < N; c++) {
        if (!Number.isNaN(copia[f * N + c])) continue
        let s = 0
        let k = 0
        for (let df = -1; df <= 1; df++) {
          for (let dc = -1; dc <= 1; dc++) {
            const ff = f + df
            const cc = c + dc
            if (ff < 0 || cc < 0 || ff >= N || cc >= N) continue
            const v = copia[ff * N + cc]
            if (!Number.isNaN(v)) {
              s += v
              k++
            }
          }
        }
        if (k) razon[f * N + c] = s / k
        else faltan++
      }
    }
    if (!faltan) break
  }
  let suma = 0
  let cuenta = 0
  for (const v of razon) if (!Number.isNaN(v)) { suma += v; cuenta++ }
  const media = suma / cuenta
  const albedo = new Uint16Array(N * N)
  let min = Infinity
  let max = -Infinity
  let s2 = 0
  for (let i = 0; i < N * N; i++) {
    const v = Number.isNaN(razon[i]) ? ALBEDO_MEDIO : Math.min(0.25, Math.max(0.03, (ALBEDO_MEDIO * razon[i]) / media))
    min = Math.min(min, v)
    max = Math.max(max, v)
    s2 += (v - ALBEDO_MEDIO) ** 2
    albedo[i] = Math.round(v * 10000)
  }
  await Bun.write(new URL('../src/data/albedo-apollo17.u16', import.meta.url), albedo)
  const procedencia = {
    producto: PRODUCTO,
    archivo: IMG,
    tomaUTC: TOMA_UTC,
    solEnLaToma: { ...SOL_TOMA, fuente: 'JPL Horizons, sitio del LM, consultado el 2026-11-06' },
    consultadoUTC: new Date().toISOString(),
    texeles: N,
    escala: 'albedo × 10000 en enteros sin signo de 16 bits; filas de norte a sur',
    metodo:
      'albedo = 0,085 · (DN / r_Hapke(µ0, µ, g)) / media; sin puntos en sombra propia o proyectada ni con µ0 < 0,1; ' +
      'LRO al nadir (supuesto); normales del DTM NAC de 2 m.',
    fraccionValida: Number((validos / (N * N)).toFixed(4)),
    minimo: min,
    maximo: max,
    desvio: Math.sqrt(s2 / (N * N)),
  }
  await Bun.write(new URL('../src/data/albedo-apollo17.json', import.meta.url), JSON.stringify(procedencia, null, 1) + '\n')
  console.log(procedencia)
}

await main()
