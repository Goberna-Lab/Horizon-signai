// E16: el valle de Taurus-Littrow en 3D para el fondo de la escena (±25 km alrededor del módulo lunar), desde SLDEM2015
// (LOLA + SELENE TC, 512 px/grado, ~59 m), con muestras cada 125 m. Reemplaza la "pared" de E10, que no se veía como
// montañas. Por cada vértice guarda:
//   - altura relativa al LM, con la caída por curvatura d²/2R ya restada (decímetros, Int16);
//   - horizonte local en 8 azimuts (0°, 45°, …), para que las montañas se sombreen solas (marcha de rayos hasta 25 km;
//     RTR cap. 11.4, pp. 465–466), codificado en Uint8 como (h + 10°)/60° · 255.
//
//   bun run scripts/valle.ts
//
// Mismo producto y formato que scripts/horizonte.ts (ver ahí la etiqueta PDS).

const BASE = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/tiles/float_img'
const IMG = `${BASE}/sldem2015_512_00n_30n_000_045_float.img`
const SITIO = { latitudGrados: 20.1911, longitudEsteGrados: 30.7723 }
const R = 1_737_400
const RECORD = 92160
const RES = 512
const LOFF = 15359.5
const SOFF = 92159.5
const LON0 = 180
const SEMILADO_M = 25_000
const PASO_M = 125
const N = Math.round((2 * SEMILADO_M) / PASO_M) + 1 // 401
const AZIMUTS = 8
const ALCANCE_M = 25_000
const PASO_RAYO_M = 125

const rad = Math.PI / 180
const fila = (lat: number) => LOFF - lat * RES
const columna = (lon: number) => SOFF + (lon - LON0) * RES
const latDe = (zSur: number) => SITIO.latitudGrados + (-zSur / R) / rad
const lonDe = (xEste: number) => SITIO.longitudEsteGrados + (xEste / (R * Math.cos(SITIO.latitudGrados * rad))) / rad

async function main() {
  const margen = ((SEMILADO_M + 3000) / R) / rad
  const f0 = Math.floor(fila(SITIO.latitudGrados + margen))
  const f1 = Math.ceil(fila(SITIO.latitudGrados - margen))
  const resp = await fetch(IMG, { headers: { Range: `bytes=${f0 * RECORD}-${(f1 + 1) * RECORD - 1}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 y llegó ${resp.status}`)
  const buf = new DataView(await resp.arrayBuffer())
  const px = (f: number, c: number) => buf.getFloat32((f - f0) * RECORD + c * 4, true) * 1000
  const alturaGeo = (lat: number, lon: number) => {
    const f = fila(lat)
    const c = columna(lon)
    const fi = Math.floor(f)
    const ci = Math.floor(c)
    const tf = f - fi
    const tc = c - ci
    return (px(fi, ci) * (1 - tc) + px(fi, ci + 1) * tc) * (1 - tf) + (px(fi + 1, ci) * (1 - tc) + px(fi + 1, ci + 1) * tc) * tf
  }
  const h0 = alturaGeo(SITIO.latitudGrados, SITIO.longitudEsteGrados)
  // Altura en la escena (relativa al LM y con la caída por curvatura) en cualquier (x, z).
  const altura = (x: number, z: number) => alturaGeo(latDe(z), lonDe(x)) - h0 - (x * x + z * z) / (2 * R)

  const alturas = new Int16Array(N * N)
  const malla = new Float32Array(N * N)
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const h = altura(-SEMILADO_M + c * PASO_M, -SEMILADO_M + f * PASO_M)
      malla[f * N + c] = h
      alturas[f * N + c] = Math.round(h * 10)
    }
  }
  // Horizonte por vértice, sobre la propia malla (bilineal) para que sea consistente con lo que se dibuja.
  const enMalla = (x: number, z: number) => {
    const cc = (x + SEMILADO_M) / PASO_M
    const ff = (z + SEMILADO_M) / PASO_M
    if (cc < 0 || ff < 0 || cc > N - 1 || ff > N - 1) return NaN
    const c0 = Math.min(Math.floor(cc), N - 2)
    const r0 = Math.min(Math.floor(ff), N - 2)
    const tc = cc - c0
    const tr = ff - r0
    const m = (r: number, c: number) => malla[r * N + c]
    return (m(r0, c0) * (1 - tc) + m(r0, c0 + 1) * tc) * (1 - tr) + (m(r0 + 1, c0) * (1 - tc) + m(r0 + 1, c0 + 1) * tc) * tr
  }
  const horizontes = new Uint8Array(N * N * AZIMUTS)
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const x0 = -SEMILADO_M + c * PASO_M
      const z0 = -SEMILADO_M + f * PASO_M
      const y0 = malla[f * N + c]
      for (let a = 0; a < AZIMUTS; a++) {
        const az = (a * 360) / AZIMUTS
        const ex = Math.sin(az * rad)
        const ez = -Math.cos(az * rad)
        let mejor = -10
        for (let d = PASO_RAYO_M; d <= ALCANCE_M; d += PASO_RAYO_M) {
          const h = enMalla(x0 + ex * d, z0 + ez * d)
          if (Number.isNaN(h)) break
          const e = Math.atan2(h - y0, d) / rad
          if (e > mejor) mejor = e
        }
        horizontes[(f * N + c) * AZIMUTS + a] = Math.round(((Math.min(Math.max(mejor, -10), 50) + 10) / 60) * 255)
      }
    }
  }
  await Bun.write(new URL('../src/data/valle-apollo17-alturas.i16', import.meta.url), alturas)
  await Bun.write(new URL('../src/data/valle-apollo17-horizontes.u8', import.meta.url), horizontes)
  const meta = {
    producto: 'SLDEM2015_512_00N_30N_000_045_FLOAT (LRO LOLA + SELENE TC, PDS Geosciences Node)',
    archivo: IMG,
    consultadoUTC: new Date().toISOString(),
    muestras: N,
    pasoM: PASO_M,
    semiladoM: SEMILADO_M,
    azimuts: AZIMUTS,
    codificacion: 'alturas: Int16 en decímetros, relativas al LM, con caída por curvatura; horizontes: Uint8 = (h + 10°)/60°·255',
    alturaSitioM: Number(h0.toFixed(2)),
  }
  await Bun.write(new URL('../src/data/valle-apollo17.json', import.meta.url), JSON.stringify(meta, null, 1) + '\n')
  let min = Infinity
  let max = -Infinity
  for (const v of malla) {
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  console.log(`Valle ${N}×${N} a ${PASO_M} m: alturas ${min.toFixed(0)}..${max.toFixed(0)} m respecto del LM (con curvatura).`)
}

await main()
