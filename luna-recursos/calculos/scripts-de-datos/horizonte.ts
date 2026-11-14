// E10: perfil del horizonte local visto desde el módulo lunar del Apollo 17 (elevación del horizonte por azimut),
// calculado con SLDEM2015 (LOLA + SELENE/Kaguya, 512 píxeles/grado, ~59 m). Se corre a mano:
//
//   bun run scripts/horizonte.ts
//
// El valle de Taurus-Littrow está entre macizos de 2000–2300 m con pendientes de 25° y tiene ~8 km de ancho
// (Lunar Sourcebook, cap. 3.3.4, pp. 33–34; p. 37): el Sol sale y se pone detrás de ellos, no en el horizonte
// astronómico. Técnica: mapa de horizonte por marcha de rayos (RTR cap. 11.4, pp. 465–466).
// Formato según la etiqueta PDS: float32 little-endian, km sobre la esfera de 1737,4 km, cilíndrica simple
// (CENTER_LATITUDE 0, CENTER_LONGITUDE 180), 512 px/grado, 23040 columnas × 15360 filas de 92160 bytes.

import { envolventeSuperior } from './polar'

const BASE = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/tiles/float_img'
const IMG = `${BASE}/sldem2015_512_00n_30n_000_045_float.img`
const LBL = `${BASE}/sldem2015_512_00n_30n_000_045_float.lbl`

/** Sitio: módulo lunar del Apollo 17 (LROC, Wagner et al. 2016). */
const SITIO = { latitudGrados: 20.1911, longitudEsteGrados: 30.7723 }
const RADIO_M = 1_737_400
/** Alcance de los rayos: los macizos están a pocos km; 30 km cubre el valle y sus bordes. */
const ALCANCE_M = 30_000
/** Primer punto del rayo: el relieve más cercano lo resuelve el mapa de sombras del recorte de 400 m (E6). */
const INICIO_M = 250
const PASO_M = 25
const PASO_AZIMUT = 0.5

async function main() {
  const etiqueta = await (await fetch(LBL)).text()
  const num = (clave: string) => {
    const m = etiqueta.match(new RegExp(`^\\s*${clave}\\s*=\\s*"?([-0-9.]+)`, 'm'))
    if (!m) throw new Error(`La etiqueta no trae ${clave}`)
    return Number.parseFloat(m[1])
  }
  const RECORD = num('RECORD_BYTES')
  const COLS = num('LINE_SAMPLES')
  const FILAS = num('LINES')
  const RES = num('MAP_RESOLUTION')
  const LOFF = num('LINE_PROJECTION_OFFSET')
  const SOFF = num('SAMPLE_PROJECTION_OFFSET')
  const LON0 = num('CENTER_LONGITUDE')
  const OFFSET_KM = num('OFFSET')
  if (RECORD !== COLS * 4 || !/SAMPLE_TYPE\s*=\s*PC_REAL/.test(etiqueta) || !/UNIT\s*=\s*KILOMETER/.test(etiqueta)) {
    throw new Error('Formato inesperado en la etiqueta de SLDEM2015.')
  }
  // Fila y columna (0-based, en coordenadas de centro de píxel) de una latitud y longitud.
  const fila = (lat: number) => LOFF - lat * RES
  const columna = (lon: number) => SOFF + (lon - LON0) * RES

  const margenGrados = ((ALCANCE_M + 2000) / RADIO_M) * (180 / Math.PI)
  const f0 = Math.max(0, Math.floor(fila(SITIO.latitudGrados + margenGrados)))
  const f1 = Math.min(FILAS - 1, Math.ceil(fila(SITIO.latitudGrados - margenGrados)))
  const resp = await fetch(IMG, { headers: { Range: `bytes=${f0 * RECORD}-${(f1 + 1) * RECORD - 1}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 y llegó ${resp.status}`)
  const buf = new DataView(await resp.arrayBuffer())
  const alturaPx = (f: number, c: number) => buf.getFloat32((f - f0) * RECORD + c * 4, true) * 1000 // m sobre 1737,4 km
  const altura = (lat: number, lon: number) => {
    const f = fila(lat)
    const c = columna(lon)
    const fi = Math.floor(f)
    const ci = Math.floor(c)
    const tf = f - fi
    const tc = c - ci
    return (
      (alturaPx(fi, ci) * (1 - tc) + alturaPx(fi, ci + 1) * tc) * (1 - tf) +
      (alturaPx(fi + 1, ci) * (1 - tc) + alturaPx(fi + 1, ci + 1) * tc) * tf
    )
  }

  const rad = Math.PI / 180
  const h0 = altura(SITIO.latitudGrados, SITIO.longitudEsteGrados)
  const elevaciones: number[] = []
  const distancias: number[] = []
  const envolvente: number[][] = []
  for (let az = 0; az < 360 - 1e-9; az += PASO_AZIMUT) {
    let mejor = -90
    let dMejor = 0
    // E21: puntos del rayo (x = d, y = h con la caída por curvatura, el mismo marco que la elevación de E10).
    const puntos: Array<[number, number]> = []
    for (let d = INICIO_M; d <= ALCANCE_M; d += PASO_M) {
      // Desplazamiento local (plano tangente) y caída por curvatura d²/2R.
      const norte = d * Math.cos(az * rad)
      const este = d * Math.sin(az * rad)
      const lat = SITIO.latitudGrados + (norte / RADIO_M) / rad
      const lon = SITIO.longitudEsteGrados + (este / (RADIO_M * Math.cos(SITIO.latitudGrados * rad))) / rad
      const h = altura(lat, lon) - h0 - (d * d) / (2 * RADIO_M)
      const e = Math.atan2(h, d) / rad
      puntos.push([d, h])
      if (e > mejor) {
        mejor = e
        dMejor = d
      }
    }
    elevaciones.push(Number(mejor.toFixed(4)))
    distancias.push(dMejor)
    envolvente.push(envolventeSuperior(puntos))
  }

  const salida = {
    procedencia: {
      producto: 'SLDEM2015_512_00N_30N_000_045_FLOAT (LRO LOLA + SELENE TC, PDS Geosciences Node)',
      archivo: IMG,
      etiqueta: LBL,
      consultadoUTC: new Date().toISOString(),
      metodo:
        'Marcha de rayos desde el módulo lunar (LROC, Wagner et al. 2016), de 250 m a 30 km en pasos de 25 m, ' +
        'interpolación bilineal, caída por curvatura d²/2R con R = 1737,4 km; observador a nivel del suelo.',
      alturaSitioM: Number(h0.toFixed(2)),
      referencia: `alturas en m sobre la esfera de ${OFFSET_KM} km`,
    },
    pasoAzimutGrados: PASO_AZIMUT,
    elevacionGrados: elevaciones,
    distanciaM: distancias,
    /** E21: por azimut, vértices [x, y, …] (m) de la envolvente superior del rayo; horizonte desde altura H = máx atan2(y − H, x). */
    envolvente,
  }
  const destino = new URL('../src/data/horizonte-apollo17.json', import.meta.url)
  await Bun.write(destino, JSON.stringify(salida) + '\n')
  const max = Math.max(...elevaciones)
  console.log(`Altura del sitio en SLDEM2015: ${h0.toFixed(1)} m. Horizonte: ${Math.min(...elevaciones).toFixed(2)}°..${max.toFixed(2)}° (máx. en az ${elevaciones.indexOf(max) * PASO_AZIMUT}°, a ${distancias[elevaciones.indexOf(max)]} m).`)
  for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const i = az / PASO_AZIMUT
    console.log(`  az ${az}°: ${elevaciones[i].toFixed(2)}° a ${(distancias[i] / 1000).toFixed(1)} km`)
  }
}

await main()
