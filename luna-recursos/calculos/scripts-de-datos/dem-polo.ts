// E24: DEM del polo sur para el navegador, para calcular el horizonte de cualquier punto dentro de ~190 km del polo
// (coordenadas propias, decisión de Estephano del 2026-11-07: "solo dentro del polo sur"). Fuente: LOLA LDEM_75S_240M
// (PDS Geosciences Node; estereográfica polar sur, 240 m/píxel, float32 en km sobre la esfera de 1737,4 km). Se corre a
// mano:
//
//   bun run scripts/dem-polo.ts
//
// Escribe dos rejillas de alturas en metros enteros (int16, sobre la esfera de 1737,4 km):
//   - cerca: 240 m/píxel (los píxeles de LOLA tal cual) hasta 195 km del polo (~83,6° S), 5,3 MB;
//   - lejos: 960 m/píxel (promedio de bloques de 4 × 4) hasta 340 km (~78,8° S), para el horizonte lejano de los puntos
//     del borde (rayos de 150 km, como E20).
// Se lee por rangos solo la franja de filas necesaria (~43 MB de 58 MB).

const BASE = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img'
const IMG = `${BASE}/ldem_75s_240m_float.img`
const LBL = `${BASE}/ldem_75s_240m_float.lbl`
const RADIO_CERCA_M = 195_000
const RADIO_LEJOS_M = 340_000
const BLOQUE = 4

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
  const ESCALA = num('MAP_SCALE') // m/píxel
  const LOFF = num('LINE_PROJECTION_OFFSET')
  const SOFF = num('SAMPLE_PROJECTION_OFFSET')
  if (RECORD !== COLS * 4 || !/POLAR STEREOGRAPHIC/.test(etiqueta) || num('CENTER_LATITUDE') !== -90 || num('A_AXIS_RADIUS') !== 1737.4) {
    throw new Error('Formato inesperado en la etiqueta de LDEM_75S_240M.')
  }
  if (Math.abs(ESCALA - 240) > 1e-6) throw new Error(`Escala inesperada: ${ESCALA} m`)
  // PDS (LOLA GDR polar, igual que scripts/polo-lola.ts): columna(x) = x/escala + SOFF, fila(y) = LOFF − y/escala (0-based).
  const xDeColumna = (c: number) => (c - SOFF) * ESCALA
  const yDeFila = (f: number) => (LOFF - f) * ESCALA
  const f0 = Math.max(0, Math.floor(LOFF - RADIO_LEJOS_M / ESCALA) - BLOQUE)
  const f1 = Math.min(FILAS - 1, Math.ceil(LOFF + RADIO_LEJOS_M / ESCALA) + BLOQUE)
  console.log(`Leyendo filas ${f0}–${f1} de ${FILAS} (${(((f1 - f0 + 1) * RECORD) / 1e6).toFixed(1)} MB)…`)
  const resp = await fetch(IMG, { headers: { Range: `bytes=${f0 * RECORD}-${(f1 + 1) * RECORD - 1}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 y llegó ${resp.status}`)
  const buf = new DataView(await resp.arrayBuffer())
  const px = (f: number, c: number) => buf.getFloat32((f - f0) * RECORD + c * 4, true) * 1000

  // Cerca: los píxeles de LOLA cuyo centro cae en |x|, |y| ≤ RADIO_CERCA_M.
  const c0 = Math.ceil(SOFF - RADIO_CERCA_M / ESCALA)
  const c1 = Math.floor(SOFF + RADIO_CERCA_M / ESCALA)
  const fc0 = Math.ceil(LOFF - RADIO_CERCA_M / ESCALA)
  const nCerca = c1 - c0 + 1
  const cerca = new Int16Array(nCerca * nCerca)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < nCerca; i++) {
    for (let j = 0; j < nCerca; j++) {
      const h = px(fc0 + i, c0 + j)
      min = Math.min(min, h)
      max = Math.max(max, h)
      cerca[i * nCerca + j] = Math.round(h)
    }
  }
  if (min < -32000 || max > 32000) throw new Error('Alturas fuera del rango de int16.')

  // Lejos: promedio de bloques de 4 × 4 píxeles; el centro del bloque es el promedio de los centros.
  const l0 = Math.ceil(SOFF - RADIO_LEJOS_M / ESCALA)
  const nLejos = Math.floor((2 * RADIO_LEJOS_M) / ESCALA / BLOQUE)
  const fl0 = Math.ceil(LOFF - RADIO_LEJOS_M / ESCALA)
  const lejos = new Int16Array(nLejos * nLejos)
  for (let i = 0; i < nLejos; i++) {
    for (let j = 0; j < nLejos; j++) {
      let s = 0
      for (let a = 0; a < BLOQUE; a++) for (let b = 0; b < BLOQUE; b++) s += px(fl0 + i * BLOQUE + a, l0 + j * BLOQUE + b)
      lejos[i * nLejos + j] = Math.round(s / (BLOQUE * BLOQUE))
    }
  }

  const meta = {
    procedencia: {
      producto: 'LOLA LDEM_75S_240M_FLOAT (LRO LOLA GDR polar, PDS Geosciences Node)',
      archivo: IMG,
      etiqueta: LBL,
      consultadoUTC: new Date().toISOString(),
      metodo:
        'Alturas en metros enteros sobre la esfera de 1737,4 km. "cerca": los píxeles de 240 m tal cual; "lejos": promedio de bloques de 4 × 4 (960 m). Estereográfica polar sur con escala 1 en el polo: x = ρ·sin λ, y = ρ·cos λ, ρ = 2R·tan(c/2).',
    },
    cerca: { archivo: 'dem-polo-240m.i16', n: nCerca, pasoM: ESCALA, x0M: xDeColumna(c0), y0M: yDeFila(fc0) },
    lejos: { archivo: 'dem-polo-960m.i16', n: nLejos, pasoM: ESCALA * BLOQUE, x0M: xDeColumna(l0) + ((BLOQUE - 1) / 2) * ESCALA, y0M: yDeFila(fl0) - ((BLOQUE - 1) / 2) * ESCALA },
    alturaMinM: Math.round(min),
    alturaMaxM: Math.round(max),
  }
  await Bun.write(new URL('../src/data/dem-polo-240m.i16', import.meta.url), cerca.buffer)
  await Bun.write(new URL('../src/data/dem-polo-960m.i16', import.meta.url), lejos.buffer)
  await Bun.write(new URL('../src/data/dem-polo.json', import.meta.url), JSON.stringify(meta, null, 1) + '\n')
  console.log(`cerca ${nCerca}² (${(cerca.byteLength / 1e6).toFixed(1)} MB), lejos ${nLejos}² (${(lejos.byteLength / 1e6).toFixed(1)} MB); alturas ${meta.alturaMinM} a ${meta.alturaMaxM} m`)
}

await main()
