// E20: horizonte real y valle 3D del sitio polar desde LOLA LDEM_75S_120M (PDS Geosciences Node; estereográfica polar sur,
// 120 m/píxel, 7624 × 7624, float32 en km sobre la esfera de 1737,4 km). SLDEM2015 solo cubre ±60°. Se corre a mano:
//
//   LUNA_SITIO=connecting-ridge bun run scripts/polo-lola.ts
//
// Se lee por rangos solo la franja de filas necesaria. Escribe el mismo formato que E10 (horizonte-<sitio>.json) y E16
// (valle-<sitio>-alturas.i16, -horizontes.u8 y .json), con dos diferencias:
//   - elevación con la esfera exacta, atan2((R + h)·cos θ − (R + h0), (R + h)·sin θ), porque a 150 km la caída por
//     curvatura (6,5 km) no es pequeña;
//   - alturas del valle en pasos de 0,5 m (escalaAlturasM), porque Shackleton baja varios km y no cabe en decímetros.
// Técnica: mapa de horizonte por marcha de rayos (RTR cap. 11.4, pp. 465–466).
import { SITIO_ACTIVO } from '../src/engine/sitio'
import { R, desdeLocal, destino, elevacion, envolventeSuperior, estereo, leerFilasGeoTiff } from './polar'

const BASE = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img'
const IMG = `${BASE}/ldem_75s_120m_float.img`
const LBL = `${BASE}/ldem_75s_120m_float.lbl`
const ALCANCE_M = 150_000
const PASO_AZIMUT = 0.5
const SEMILADO_M = 25_000
const PASO_VALLE_M = 125
const N = Math.round((2 * SEMILADO_M) / PASO_VALLE_M) + 1
const AZIMUTS = 8
const ESCALA_ALTURAS_M = 0.5
/**
 * Cerca del sitio manda el DTM de 5 m de PGDA (Site01, el mismo de scripts/dtm-polo.ts): con el Sol a ±2° del horizonte,
 * la resolución de 120 m no alcanza para el relieve a pocos cientos de metros. Mosaico de 3200 × 3200 píxeles de 5 m con
 * la esquina en x = −19 000 m, y = −4000 m (PixelIsArea).
 */
const PGDA = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif'
const PGDA_X0 = -19_000
const PGDA_Y0 = -4_000
const PGDA_N = 3200

async function main() {
  if (SITIO_ACTIVO.id !== 'connecting-ridge') throw new Error('Este script es para LUNA_SITIO=connecting-ridge.')
  const { latitudGrados: lat, longitudEsteGrados: lon } = SITIO_ACTIVO
  const etiqueta = await (await fetch(LBL)).text()
  const num = (clave: string) => {
    const m = etiqueta.match(new RegExp(`^\\s*${clave}\\s*=\\s*"?([-0-9.]+)`, 'm'))
    if (!m) throw new Error(`La etiqueta no trae ${clave}`)
    return Number.parseFloat(m[1])
  }
  const RECORD = num('RECORD_BYTES')
  const COLS = num('LINE_SAMPLES')
  const ESCALA = num('MAP_SCALE')
  const LOFF = num('LINE_PROJECTION_OFFSET')
  const SOFF = num('SAMPLE_PROJECTION_OFFSET')
  if (RECORD !== COLS * 4 || !/POLAR STEREOGRAPHIC/.test(etiqueta) || num('CENTER_LATITUDE') !== -90 || num('A_AXIS_RADIUS') !== 1737.4) {
    throw new Error('Formato inesperado en la etiqueta de LDEM_75S_120M.')
  }
  // PDS (LOLA GDR polar): x = (muestra − SOFF − 1)·escala, y = (1 − línea + LOFF)·escala, con muestra y línea desde 1.
  const columna = (x: number) => x / ESCALA + SOFF // 0-based
  const fila = (y: number) => LOFF - y / ESCALA // 0-based
  const [, ys] = estereo(lat, lon)
  const margen = ALCANCE_M + 5000
  const f0 = Math.max(0, Math.floor(fila(ys + margen)))
  const f1 = Math.min(COLS - 1, Math.ceil(fila(ys - margen)))
  const resp = await fetch(IMG, { headers: { Range: `bytes=${f0 * RECORD}-${(f1 + 1) * RECORD - 1}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 y llegó ${resp.status}`)
  const buf = new DataView(await resp.arrayBuffer())
  const px = (f: number, c: number) => buf.getFloat32((f - f0) * RECORD + c * 4, true) * 1000
  const alturaGeo = (la: number, lo: number) => {
    const [x, y] = estereo(la, lo)
    const c = columna(x)
    const f = fila(y)
    const ci = Math.floor(c)
    const fi = Math.floor(f)
    const tc = c - ci
    const tf = f - fi
    return (px(fi, ci) * (1 - tc) + px(fi, ci + 1) * tc) * (1 - tf) + (px(fi + 1, ci) * (1 - tc) + px(fi + 1, ci + 1) * tc) * tf
  }
  const h120 = alturaGeo(lat, lon)
  // DTM de 5 m entero (41 MB) para la parte cercana de los rayos.
  const pgda = await leerFilasGeoTiff(PGDA, 0, PGDA_N - 1, PGDA_N * 4)
  const alturaPgda = (la: number, lo: number) => {
    const [x, y] = estereo(la, lo)
    const c = (x - PGDA_X0) / 5 - 0.5
    const f = (PGDA_Y0 - y) / 5 - 0.5
    if (c < 0 || f < 0 || c >= PGDA_N - 1 || f >= PGDA_N - 1) return NaN
    const ci = Math.floor(c)
    const fi = Math.floor(f)
    const tc = c - ci
    const tf = f - fi
    const p = (ff: number, cc: number) => pgda.getFloat32((ff * PGDA_N + cc) * 4, true)
    return (p(fi, ci) * (1 - tc) + p(fi, ci + 1) * tc) * (1 - tf) + (p(fi + 1, ci) * (1 - tc) + p(fi + 1, ci + 1) * tc) * tf
  }
  const altura = (la: number, lo: number) => {
    const h = alturaPgda(la, lo)
    return Number.isNaN(h) ? alturaGeo(la, lo) : h
  }
  const h0 = altura(lat, lon)

  // 1) Horizonte desde el sitio: pasos de 25 m hasta 5 km y de 120 m (un píxel) después.
  const elevaciones: number[] = []
  const distancias: number[] = []
  const envolvente: number[][] = []
  for (let az = 0; az < 360 - 1e-9; az += PASO_AZIMUT) {
    let mejor = -90
    let dMejor = 0
    // E21: puntos del rayo en el plano vertical del azimut, con la esfera exacta: x = (R + h)·sin θ, y = (R + h)·cos θ − (R + h0).
    const puntos: Array<[number, number]> = []
    for (let d = 250; d <= ALCANCE_M; d += d < 5000 ? 25 : 120) {
      const h = altura(...destino(lat, lon, az, d))
      const e = elevacion(h0, h, d)
      const th = d / R
      puntos.push([(R + h) * Math.sin(th), (R + h) * Math.cos(th) - (R + h0)])
      if (e > mejor) {
        mejor = e
        dMejor = d
      }
    }
    elevaciones.push(Number(mejor.toFixed(4)))
    distancias.push(dMejor)
    envolvente.push(envolventeSuperior(puntos))
  }
  const horizonte = {
    procedencia: {
      producto: 'LOLA LDEM_75S_120M_FLOAT (LRO LOLA GDR polar, PDS Geosciences Node)',
      archivo: IMG,
      etiqueta: LBL,
      consultadoUTC: new Date().toISOString(),
      metodo:
        'Marcha de rayos por círculo máximo desde el sitio, de 250 m a 150 km (pasos de 25 m hasta 5 km y de 120 m después), ' +
        'interpolación bilineal, elevación con la esfera exacta de R = 1737,4 km; observador a nivel del suelo. ' +
        'Dentro del mosaico de 16 km se usa el DTM de 5 m de PGDA (Site01, Barker et al. 2021); fuera, LDEM_75S_120M.',
      productoCercano: PGDA,
      alturaSitioM: Number(h0.toFixed(2)),
      alturaSitio120mM: Number(h120.toFixed(2)),
      referencia: 'alturas en m sobre la esfera de 1737,4 km',
    },
    pasoAzimutGrados: PASO_AZIMUT,
    elevacionGrados: elevaciones,
    distanciaM: distancias,
    /** E21: por azimut, vértices [x, y, …] (m) de la envolvente superior del rayo; horizonte desde altura H = máx atan2(y − H, x). */
    envolvente,
  }
  await Bun.write(new URL(`../src/data/horizonte-${SITIO_ACTIVO.id}.json`, import.meta.url), JSON.stringify(horizonte) + '\n')

  // 2) Valle: malla local de ±25 km cada 125 m (como E16), alturas relativas al sitio con la caída por curvatura.
  const malla = new Float32Array(N * N)
  const alturas = new Int16Array(N * N)
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const x = -SEMILADO_M + c * PASO_VALLE_M
      const z = -SEMILADO_M + f * PASO_VALLE_M
      const h = altura(...desdeLocal(lat, lon, x, -z)) - h0 - (x * x + z * z) / (2 * R)
      malla[f * N + c] = h
      alturas[f * N + c] = Math.round(h / ESCALA_ALTURAS_M)
    }
  }
  const enMalla = (x: number, z: number) => {
    const cc = (x + SEMILADO_M) / PASO_VALLE_M
    const ff = (z + SEMILADO_M) / PASO_VALLE_M
    if (cc < 0 || ff < 0 || cc > N - 1 || ff > N - 1) return NaN
    const c0 = Math.min(Math.floor(cc), N - 2)
    const r0 = Math.min(Math.floor(ff), N - 2)
    const tc = cc - c0
    const tr = ff - r0
    const m = (r: number, c: number) => malla[r * N + c]
    return (m(r0, c0) * (1 - tc) + m(r0, c0 + 1) * tc) * (1 - tr) + (m(r0 + 1, c0) * (1 - tc) + m(r0 + 1, c0 + 1) * tc) * tr
  }
  const rad = Math.PI / 180
  const horizontes = new Uint8Array(N * N * AZIMUTS)
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const x0 = -SEMILADO_M + c * PASO_VALLE_M
      const z0 = -SEMILADO_M + f * PASO_VALLE_M
      const y0 = malla[f * N + c]
      for (let a = 0; a < AZIMUTS; a++) {
        const az = (a * 360) / AZIMUTS
        const ex = Math.sin(az * rad)
        const ez = -Math.cos(az * rad)
        let mejor = -10
        for (let d = PASO_VALLE_M; d <= SEMILADO_M; d += PASO_VALLE_M) {
          const h = enMalla(x0 + ex * d, z0 + ez * d)
          if (Number.isNaN(h)) break
          const e = Math.atan2(h - y0, d) / rad
          if (e > mejor) mejor = e
        }
        horizontes[(f * N + c) * AZIMUTS + a] = Math.round(((Math.min(Math.max(mejor, -10), 50) + 10) / 60) * 255)
      }
    }
  }
  await Bun.write(new URL(`../src/data/valle-${SITIO_ACTIVO.id}-alturas.i16`, import.meta.url), alturas)
  await Bun.write(new URL(`../src/data/valle-${SITIO_ACTIVO.id}-horizontes.u8`, import.meta.url), horizontes)
  const meta = {
    producto: 'LOLA LDEM_75S_120M_FLOAT (LRO LOLA GDR polar, PDS Geosciences Node)',
    archivo: IMG,
    consultadoUTC: new Date().toISOString(),
    muestras: N,
    pasoM: PASO_VALLE_M,
    semiladoM: SEMILADO_M,
    azimuts: AZIMUTS,
    escalaAlturasM: ESCALA_ALTURAS_M,
    codificacion: 'alturas: Int16 × escalaAlturasM (m), relativas al sitio, con caída por curvatura; horizontes: Uint8 = (h + 10°)/60°·255',
    alturaSitioM: Number(h0.toFixed(2)),
    notas: 'Dentro del mosaico de 16 km, alturas del DTM de 5 m de PGDA (Site01); fuera, LDEM_75S_120M.',
  }
  await Bun.write(new URL(`../src/data/valle-${SITIO_ACTIVO.id}.json`, import.meta.url), JSON.stringify(meta, null, 1) + '\n')
  let min = Infinity
  let max = -Infinity
  for (const v of malla) {
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  const mx = Math.max(...elevaciones)
  console.log(`Sitio: ${h0.toFixed(1)} m (5 m de PGDA) y ${h120.toFixed(1)} m (LDEM_75S_120M). Filas ${f0}–${f1} (${(((f1 - f0 + 1) * RECORD) / 1e6).toFixed(0)} MB).`)
  console.log(`Horizonte ${Math.min(...elevaciones).toFixed(2)}°..${mx.toFixed(2)}° (máx. en az ${elevaciones.indexOf(mx) * PASO_AZIMUT}°, a ${(distancias[elevaciones.indexOf(mx)] / 1000).toFixed(1)} km).`)
  for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) console.log(`  az ${az}°: ${elevaciones[az / PASO_AZIMUT].toFixed(2)}° a ${(distancias[az / PASO_AZIMUT] / 1000).toFixed(1)} km`)
  console.log(`Valle ${N}×${N}: ${min.toFixed(0)}..${max.toFixed(0)} m respecto del sitio.`)
}

await main()
