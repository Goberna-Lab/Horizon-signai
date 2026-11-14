// E23: envolvente del horizonte cercano en el centro del sitio, desde el DTM de 2 m (src/data/relieve-<sitio>.json), para el
// planificador. El horizonte de E10/E20 empieza a 250 m; lo más cercano lo pone el relieve local, que la escena mira con
// tapadoPorRelieve (E19). El planificador no carga el DTM: usa esta envolvente, que da el mismo horizonte desde cualquier
// altura (E21). Se corre a mano, una vez por sitio:
//
//   bun run scripts/horizonte-cercano.ts
//   LUNA_SITIO=connecting-ridge bun run scripts/horizonte-cercano.ts
//
// Agrega "envolventeCercana" al archivo horizonte-<sitio>.json, con la misma rejilla de azimut. Rayos desde el centro con
// pasos de 1 m hasta el borde del recorte (200–283 m), interpolación bilineal (alturaSuelo, src/engine/terreno.ts).
import { alturaSuelo, dentroDelTerreno } from '../src/engine/terreno'
import { SITIO_ACTIVO } from '../src/engine/sitio'
import { envolventeSuperior } from './polar'

const RAD = Math.PI / 180
const ruta = new URL(`../src/data/horizonte-${SITIO_ACTIVO.id}.json`, import.meta.url)
const horizonte = JSON.parse(await Bun.file(ruta).text())
const paso = horizonte.pasoAzimutGrados as number
const n = Math.round(360 / paso)
const h0 = alturaSuelo(0, 0)
const envolventeCercana: number[][] = []
for (let i = 0; i < n; i++) {
  const az = i * paso * RAD
  // Ejes de la escena: +X este, −Z norte.
  const ux = Math.sin(az)
  const uz = -Math.cos(az)
  const puntos: Array<[number, number]> = []
  for (let s = 1; ; s += 1) {
    const x = ux * s
    const z = uz * s
    if (!dentroDelTerreno(x, z)) break
    puntos.push([s, alturaSuelo(x, z) - h0])
  }
  envolventeCercana.push(envolventeSuperior(puntos, 0, 3))
}
horizonte.envolventeCercana = envolventeCercana
horizonte.procedencia.metodoCercano =
  'E23: envolvente convexa superior de los rayos desde el centro sobre el DTM de 2 m del sitio (pasos de 1 m hasta el borde del recorte, interpolación bilineal); x en m desde el centro, y en m respecto del suelo en el centro.'
await Bun.write(ruta, JSON.stringify(horizonte) + '\n')
const vertices = envolventeCercana.reduce((a, v) => a + v.length / 2, 0) / n
const maxima = Math.max(...envolventeCercana.map((v) => Math.max(...v.filter((_, k) => k % 2 === 1).map((y, k) => Math.atan2(y - 0.01, v[2 * k]) / RAD))))
console.log(`${SITIO_ACTIVO.id}: ${n} azimuts, ${vertices.toFixed(1)} vértices por rayo, horizonte cercano máximo ${maxima.toFixed(2)}°`)
