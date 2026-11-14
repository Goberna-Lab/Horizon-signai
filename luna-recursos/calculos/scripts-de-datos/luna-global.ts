// E14: relieve y albedo globales de la Luna para la vista de la Luna completa. LOLA (LRO), 4 píxeles/grado:
//   LDEM_4: altura en km sobre la esfera de 1737,4 km.   LDAM_4: albedo normal a 1064 nm (Lemelin et al. 2016).
// Se guardan en media precisión (float16, 2 bytes por valor: 2 MB cada uno) en src/data/, con su procedencia.
//
//   bun run scripts/luna-global.ts
//
// Formato según las etiquetas PDS: float32 little-endian, 1440 columnas × 720 filas; fila 0 = latitud +90°,
// columna 0 = longitud 0° (este positivo); centros de píxel en (c + 0,5)/4 grados.
import { DataUtils } from 'three'

const BASE = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/float_img'
const PRODUCTOS = [
  { nombre: 'ldem_4_float', salida: 'luna-ldem4.f16', descripcion: 'LDEM_4: altura (km) sobre 1737,4 km' },
  { nombre: 'ldam_4_float', salida: 'luna-ldam4.f16', descripcion: 'LDAM_4: albedo normal a 1064 nm (LOLA; Lemelin et al. 2016)' },
]

async function main() {
  const procedencia: Record<string, unknown> = { consultadoUTC: new Date().toISOString(), columnas: 1440, filas: 720, productos: [] as unknown[] }
  for (const p of PRODUCTOS) {
    const etiqueta = await (await fetch(`${BASE}/${p.nombre}.lbl`)).text()
    if (!/LINE_SAMPLES\s*=\s*1440/.test(etiqueta) || !/LINES\s*=\s*720/.test(etiqueta) || !/SAMPLE_TYPE\s*=\s*PC_REAL/.test(etiqueta)) {
      throw new Error(`Formato inesperado en ${p.nombre}.lbl`)
    }
    const resp = await fetch(`${BASE}/${p.nombre}.img`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status} en ${p.nombre}.img`)
    const datos = new DataView(await resp.arrayBuffer())
    const n = 1440 * 720
    if (datos.byteLength !== n * 4) throw new Error(`Tamaño inesperado en ${p.nombre}: ${datos.byteLength}`)
    const medio = new Uint16Array(n)
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < n; i++) {
      const v = datos.getFloat32(i * 4, true)
      min = Math.min(min, v)
      max = Math.max(max, v)
      medio[i] = DataUtils.toHalfFloat(v)
    }
    await Bun.write(new URL(`../src/data/${p.salida}`, import.meta.url), medio)
    ;(procedencia.productos as unknown[]).push({
      archivo: `${BASE}/${p.nombre}.img`,
      etiqueta: `${BASE}/${p.nombre}.lbl`,
      descripcion: p.descripcion,
      salida: `src/data/${p.salida}`,
      minimo: min,
      maximo: max,
    })
    console.log(`${p.nombre}: ${min.toFixed(3)} .. ${max.toFixed(3)} → src/data/${p.salida}`)
  }
  await Bun.write(new URL('../src/data/luna-global.json', import.meta.url), JSON.stringify(procedencia, null, 1) + '\n')
}

await main()
