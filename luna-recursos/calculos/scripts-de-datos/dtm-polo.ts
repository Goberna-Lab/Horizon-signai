// E20: relieve local del sitio polar (400 m alrededor del centro, muestras cada 2 m), desde el DTM de 5 m de LOLA de
// PGDA, "Site01: Connecting ridge" (Barker et al. 2021, Planet. Space Sci. 203, 105119). Se corre a mano:
//
//   LUNA_SITIO=connecting-ridge bun run scripts/dtm-polo.ts
//
// El GeoTIFF es float32 sin comprimir, una fila por bloque (12 800 bytes), estereográfica polar sur (PixelIsArea, esquina
// superior izquierda en x = −19 000 m, y = −4000 m, 5 m por píxel): se leen por rangos solo las filas necesarias.
// La cuadrícula estereográfica está girada respecto del norte local (en el polo, el ángulo es la longitud), así que se
// remuestrea a la cuadrícula este/sur de la escena con interpolación bilineal. Las muestras de 2 m sobremuestrean el
// producto de 5 m: no agregan detalle, solo mantienen la malla y el mapa de sombras de E6 (declarado).
import { SITIO_ACTIVO } from '../src/engine/sitio'
import { desdeLocal, estereo, leerFilasGeoTiff } from './polar'

const BASE = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01'
const ALTURAS = `${BASE}/Site01_final_adj_5mpp_surf.tif`
const ERROR = `${BASE}/Site01_final_adj_5mpp_toterr.tif`
const X0 = -19_000
const Y0 = -4_000
const PASO = 5
const ANCHO = 3200
const BYTES_FILA = ANCHO * 4
const MUESTRAS = 201
const PASO_M = 2

async function main() {
  if (SITIO_ACTIVO.id !== 'connecting-ridge') throw new Error('Este script es para LUNA_SITIO=connecting-ridge.')
  const { latitudGrados: lat, longitudEsteGrados: lon } = SITIO_ACTIVO
  const medio = (MUESTRAS - 1) / 2
  // Coordenadas estereográficas de cada muestra local; filas de norte a sur, columnas de oeste a este (como E6).
  const xy: Array<[number, number]> = []
  for (let f = 0; f < MUESTRAS; f++) {
    for (let c = 0; c < MUESTRAS; c++) xy.push(estereo(...desdeLocal(lat, lon, (c - medio) * PASO_M, (medio - f) * PASO_M)))
  }
  const col = (x: number) => (x - X0) / PASO - 0.5
  const fil = (y: number) => (Y0 - y) / PASO - 0.5
  const filas = xy.map(([, y]) => fil(y))
  const f0 = Math.floor(Math.min(...filas)) - 1
  const f1 = Math.ceil(Math.max(...filas)) + 1
  const [vh, ve] = await Promise.all([leerFilasGeoTiff(ALTURAS, f0, f1, BYTES_FILA), leerFilasGeoTiff(ERROR, f0, f1, BYTES_FILA)])
  const bilineal = (dv: DataView, x: number, y: number) => {
    const c = col(x)
    const f = fil(y)
    const ci = Math.floor(c)
    const fi = Math.floor(f)
    const tc = c - ci
    const tf = f - fi
    const px = (ff: number, cc: number) => {
      const v = dv.getFloat32((ff - f0) * BYTES_FILA + cc * 4, true)
      if (Number.isNaN(v)) throw new Error(`Píxel sin dato en fila ${ff}, columna ${cc}.`)
      return v
    }
    return (px(fi, ci) * (1 - tc) + px(fi, ci + 1) * tc) * (1 - tf) + (px(fi + 1, ci) * (1 - tc) + px(fi + 1, ci + 1) * tc) * tf
  }
  const alturas = xy.map(([x, y]) => Number(bilineal(vh, x, y).toFixed(3)))
  const centro = medio * MUESTRAS + medio
  const [xc, yc] = xy[centro]
  const errorCentro = bilineal(ve, xc, yc)
  const datos = {
    procedencia: {
      producto: 'LOLA 5 m/pix LDEM, Site01: Connecting ridge (PGDA; Barker et al. 2021, Planet. Space Sci. 203, 105119)',
      fuente: 'NASA GSFC Planetary Geology, Geophysics and Geochemistry Laboratory (PGDA), autor M. K. Barker',
      archivo: ALTURAS,
      archivoError: ERROR,
      consultadoUTC: new Date().toISOString(),
      recorte: { filaInicio: f0, filaFin: f1, columnas: ANCHO },
      notas: [
        'Alturas en metros respecto de la esfera de 1737,4 km (como el producto); el motor las usa relativas al centro.',
        'Filas de norte a sur; columnas de oeste a este, en el plano tangente del sitio (remuestreo bilineal desde la estereográfica polar).',
        'Muestras cada 2 m desde un producto de 5 m: sobremuestreo, sin detalle nuevo.',
      ],
    },
    centro: {
      nombre: SITIO_ACTIVO.nombre,
      latitudGrados: lat,
      longitudEsteGrados: lon,
      elevacionM: Number(alturas[centro].toFixed(1)),
      incertidumbreM: Number(errorCentro.toFixed(2)),
      fuente: SITIO_ACTIVO.fuenteCoordenadas,
    },
    muestras: MUESTRAS,
    pasoNorteM: PASO_M,
    pasoEsteM: PASO_M,
    alturasM: alturas,
  }
  const destino = new URL(`../src/data/relieve-${SITIO_ACTIVO.id}.json`, import.meta.url)
  await Bun.write(destino, JSON.stringify(datos) + '\n')
  const rel = alturas.map((h) => h - alturas[centro])
  console.log(`Centro: ${alturas[centro].toFixed(1)} m (error total RMS ${errorCentro.toFixed(2)} m). Relieve ${Math.min(...rel).toFixed(1)}..${Math.max(...rel).toFixed(1)} m. Filas leídas ${f0}–${f1} (${(((f1 - f0 + 1) * BYTES_FILA * 2) / 1e6).toFixed(1)} MB).`)
}

await main()
