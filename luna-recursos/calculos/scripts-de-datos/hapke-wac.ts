// E17: parámetros de Hapke MEDIDOS por LROC WAC en la celda de 1° del Apollo 17 (Sato et al. 2014, JGR Planets 119,
// 1775–1805; producto WAC_HAPKEPARAMMAP). Se guardan en src/data/hapke-wac-apollo17.json.
//
//   bun run scripts/hapke-wac.ts
//
// Formato (etiqueta PDS): registros de 1440 bytes, 4 de etiqueta; float32 little-endian; 9 bandas BSQ de 360 × 140
// (1°/píxel, 0°–360° E, 70° N–70° S; centro de la fila 0 en 69,5° N). Bandas: w, b, c, Bc0, hc, Bs0, hs, θ̄, φ.
// También se guardan c en algunos mares y tierras altas: es la evidencia de la convención de signo (ver hapke.ts).

const BASE = 'https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/WAC_HAPKEPARAMMAP'
const NOMBRES = ['w', 'b', 'c', 'Bc0', 'hc', 'Bs0', 'hs', 'theta', 'phi'] as const
const SITIO = { lat: 20.1911, lon: 30.7723 }
const MUESTRAS_CONVENCION: Record<string, [number, number]> = {
  'Mare Serenitatis': [28, 17],
  'Mare Tranquillitatis': [8, 31],
  'Mare Imbrium': [33, 345],
  'Tierras altas centrales': [-10, 10],
  'Tierras altas del sur': [-40, 20],
  'Cara oculta (tierras altas)': [10, 180],
}

async function main() {
  const salida: Record<string, unknown> = {
    fuente: 'LROC WAC Hapke parameter maps (Sato et al. 2014), ' + BASE,
    consultadoUTC: new Date().toISOString(),
    celda: 'píxel de 1° que contiene al sitio (centro 20,5° N, 30,5° E)',
    bandas: {} as Record<string, unknown>,
  }
  for (const banda of ['566NM', '643NM']) {
    const resp = await fetch(`${BASE}/WAC_HAPKEPARAMMAP_${banda}.IMG`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const dv = new DataView(await resp.arrayBuffer())
    const etiqueta = new TextDecoder().decode(new Uint8Array(dv.buffer, 0, 4 * 1440))
    if (!/LINES\s*=\s*140/.test(etiqueta) || !/LINE_SAMPLES\s*=\s*360/.test(etiqueta) || !/BANDS\s*=\s*9/.test(etiqueta)) {
      throw new Error(`Formato inesperado en ${banda}`)
    }
    const valor = (b: number, lat: number, lon: number) =>
      dv.getFloat32(4 * 1440 + ((b * 140 + Math.round(69.5 - lat)) * 360 + Math.round((((lon % 360) + 360) % 360) - 0.5)) * 4, true)
    const sitio = Object.fromEntries(NOMBRES.map((n, i) => [n, Number(valor(i, SITIO.lat, SITIO.lon).toFixed(5))]))
    const convencion = Object.fromEntries(
      Object.entries(MUESTRAS_CONVENCION).map(([n, [la, lo]]) => [n, { w: Number(valor(0, la, lo).toFixed(4)), c: Number(valor(2, la, lo).toFixed(4)) }]),
    )
    ;(salida.bandas as Record<string, unknown>)[banda] = { sitio, convencion }
  }
  await Bun.write(new URL('../src/data/hapke-wac-apollo17.json', import.meta.url), JSON.stringify(salida, null, 1) + '\n')
  console.log(JSON.stringify(salida.bandas, null, 1))
}

await main()
