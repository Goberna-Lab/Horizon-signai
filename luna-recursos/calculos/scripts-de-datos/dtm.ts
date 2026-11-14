// E6: recorta el relieve real alrededor del módulo lunar del Apollo 17 desde el NAC DTM de LROC (2 m/píxel)
// y lo guarda en src/data/relieve-apollo17.json con su procedencia. Se corre a mano:
//
//   bun run scripts/dtm.ts
//
// El archivo completo pesa 952 MB, pero no está comprimido: se piden por HTTP Range solo las filas del recorte
// (~19 MB), sin GDAL. Formato según la etiqueta PDS (NAC_DTM_APOLLO17_2M.LBL): float32 little-endian (PC_REAL),
// 12049 columnas × 19760 filas, filas de 48196 bytes desde el byte 158752 (contando desde 1), proyección
// equirectangular con paralelo de referencia 20°, esfera de 1737,4 km, coordenadas planetocéntricas, este positivo.

const BASE = 'https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_2M'
const TIF = `${BASE}/NAC_DTM_APOLLO17_2M.TIF`
const LBL = `${BASE}/NAC_DTM_APOLLO17_2M.LBL`

/**
 * Centro: módulo lunar del Apollo 17, 20,1911° N, 30,7723° E, −2626 m, incertidumbre 3,5 m
 * (LROC Science Operations Team, "Coordinates of Lunar Anthropogenic Targets", 28-jul-2016; Wagner et al., Icarus).
 */
const CENTRO = {
  nombre: 'Módulo lunar del Apollo 17',
  latitudGrados: 20.1911,
  longitudEsteGrados: 30.7723,
  elevacionM: -2626,
  incertidumbreM: 3.5,
  fuente:
    'LROC Science Operations Team (ASU), "Coordinates of Lunar Anthropogenic Targets", 28 de julio de 2016, https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf; Wagner et al., Icarus 283 (2017) 92–103',
}

/** Semilado del recorte en píxeles: 100 px × 2 m = 200 m → terreno de 400 m × 400 m (201 × 201 muestras). */
const SEMILADO_PX = 100

async function main() {
  const etiqueta = await (await fetch(LBL)).text()
  const valor = (clave: string) => {
    const m = etiqueta.match(new RegExp(`^\\s*${clave}\\s*=\\s*"?([^"<\\n]+)`, 'm'))
    if (!m) throw new Error(`La etiqueta no trae ${clave}`)
    return m[1].trim()
  }
  const num = (clave: string) => Number.parseFloat(valor(clave))
  const RECORD = num('RECORD_BYTES')
  const COLS = num('LINE_SAMPLES')
  const FILAS = num('LINES')
  const INICIO = Number.parseInt(etiqueta.match(/\^IMAGE\s*=\s*\("[^"]+",\s*(\d+)/)![1], 10) - 1
  const R = num('A_AXIS_RADIUS') * 1000
  const ESC = num('MAP_SCALE')
  const LAT_REF = (num('CENTER_LATITUDE') * Math.PI) / 180
  const LON0 = num('CENTER_LONGITUDE')
  const LOFF = num('LINE_PROJECTION_OFFSET')
  const SOFF = num('SAMPLE_PROJECTION_OFFSET')
  if (valor('SAMPLE_TYPE') !== 'PC_REAL' || num('SAMPLE_BITS') !== 32 || RECORD !== COLS * 4) {
    throw new Error('Formato inesperado: se esperaba float32 little-endian sin relleno.')
  }

  // Proyección equirectangular (convención PDS): x = R·(λ − λ0)·cos φref, y = R·φ;
  // muestra = SOFF + x/esc + 1, línea = LOFF − y/esc + 1 (contando desde 1).
  const rad = Math.PI / 180
  const y = R * CENTRO.latitudGrados * rad
  const x = R * (CENTRO.longitudEsteGrados - LON0) * rad * Math.cos(LAT_REF)
  const filaCentro = Math.round(LOFF - y / ESC + 1) - 1
  const colCentro = Math.round(SOFF + x / ESC + 1) - 1
  const f0 = filaCentro - SEMILADO_PX
  const c0 = colCentro - SEMILADO_PX
  const n = 2 * SEMILADO_PX + 1
  if (f0 < 0 || c0 < 0 || f0 + n > FILAS || c0 + n > COLS) throw new Error('El recorte sale del DTM.')

  const desde = INICIO + f0 * RECORD
  const hasta = INICIO + (f0 + n) * RECORD - 1
  const resp = await fetch(TIF, { headers: { Range: `bytes=${desde}-${hasta}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 Partial Content y llegó ${resp.status}`)
  const datos = new DataView(await resp.arrayBuffer())
  const alturas: number[] = []
  let sinDato = 0
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      const v = datos.getFloat32(f * RECORD + (c0 + c) * 4, true)
      if (!(v > -1e30)) sinDato++
      alturas.push(Number(v.toFixed(3)))
    }
  }
  if (sinDato) throw new Error(`El recorte tiene ${sinDato} píxeles sin dato.`)

  // Paso real sobre el suelo: 2 m en norte-sur; en este-oeste, 2 m · cos φ / cos φref (equirectangular).
  const pasoEsteM = (ESC * Math.cos(CENTRO.latitudGrados * rad)) / Math.cos(LAT_REF)
  const salida = {
    procedencia: {
      producto: valor('PRODUCT_ID'),
      fuente: 'LRO LROC NAC DTM (PDS, LRO-L-LROC-5-RDR-V1.0), Arizona State University / NASA',
      archivo: TIF,
      etiqueta: LBL,
      consultadoUTC: new Date().toISOString(),
      recorte: { filaInicio: f0, columnaInicio: c0, filas: n, columnas: n, filaCentro, columnaCentro: colCentro },
      notas: [
        'Alturas en metros respecto de la esfera de 1737,4 km (como el DTM); el motor las usa relativas al centro.',
        'Filas de norte a sur; columnas de oeste a este.',
        'Proyección equirectangular (paralelo de referencia 20°): el paso este-oeste en el sitio es pasoEsteM.',
      ],
    },
    centro: CENTRO,
    muestras: n,
    pasoNorteM: ESC,
    pasoEsteM: Number(pasoEsteM.toFixed(6)),
    alturasM: alturas,
  }
  const destino = new URL('../src/data/relieve-apollo17.json', import.meta.url)
  await Bun.write(destino, JSON.stringify(salida) + '\n')
  const min = Math.min(...alturas)
  const max = Math.max(...alturas)
  const centro = alturas[SEMILADO_PX * n + SEMILADO_PX]
  console.log(`Recorte ${n}×${n} (fila ${f0}, columna ${c0}); centro ${centro.toFixed(2)} m; relieve ${min.toFixed(1)}..${max.toFixed(1)} m.`)
  console.log(`Paso este ${pasoEsteM.toFixed(4)} m, norte ${ESC} m → ${destino.pathname}`)
}

await main()
