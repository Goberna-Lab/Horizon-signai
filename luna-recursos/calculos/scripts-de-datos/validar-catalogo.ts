// E24: validación del horizonte calculado en el navegador (LOLA 240 m, src/engine/demPolar.ts) contra los mapas de
// visibilidad media de Mazarico et al. (2011), en los sitios del catálogo dentro de su cobertura (85–90° S). Se corre a
// mano:
//
//   bun run scripts/validar-catalogo.ts
//
// Lee por rangos el píxel de cada sitio (y sus 8 vecinos) en AVGVISIB_85S_060M_201608(_EARTH) y guarda los valores en
// src/data/validacion-catalogo.json. La prueba (tests/catalogo.test.ts) recalcula lo nuestro con la tabla de 2026–2030 de
// E22: el promedio de 4 años difiere del de 18,6 años en ≤ 1,2 puntos en Connecting Ridge (comprobado con la serie de E21).
import catalogo from '../src/data/catalogo-polo.json'
import { pixelMazarico } from './validar-iluminacion'

const sitios = catalogo.sitios.filter((s) => s.latitudGrados <= -85)
const resultados = []
for (const s of sitios) {
  const [sol, tierra] = await Promise.all([
    pixelMazarico('AVGVISIB_85S_060M_201608', s.latitudGrados, s.longitudEsteGrados),
    pixelMazarico('AVGVISIB_85S_060M_201608_EARTH', s.latitudGrados, s.longitudEsteGrados),
  ])
  resultados.push({ id: s.id, nombre: s.nombre, mazaricoSol: sol, mazaricoTierra: tierra })
  console.log(`${s.nombre.padEnd(26)} Mazarico Sol ${(sol.valor * 100).toFixed(1)} %, Tierra ${(tierra.valor * 100).toFixed(1)} %`)
}
await Bun.write(
  new URL('../src/data/validacion-catalogo.json', import.meta.url),
  JSON.stringify(
    {
      procedencia: {
        referencia: 'Mazarico et al. (2011), Icarus 211, 1066–1081; PGDA producto 69; AVGVISIB_85S_060M_201608 y _EARTH (60 m, 18,6 años, alguna parte del disco)',
        consultadoUTC: new Date().toISOString(),
      },
      sitios: resultados,
    },
    null,
    1,
  ) + '\n',
)
