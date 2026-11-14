// E23: compara el planificador (tabla global de E22 + máscara del centro) con el resumen del motor de la escena
// (resumenDia, E19: tablas de Horizons por sitio + horizonte lejano + marcha de rayos sobre el DTM) en el día lunar 1.
import meta from '../src/data/efemerides-luna.json'
import { crearTablaLuna, prepararSitio } from '../src/engine/efemeridesLuna'
import { mascaraDeArchivo, perfilDesde } from '../src/engine/mascara'
import { barrer } from '../src/engine/planificador'
import { SITIO_ACTIVO } from '../src/engine/sitio'
import { dia, estado } from '../src/engine/simulation'
import { PASO_RESUMEN_S, resumenDia } from '../src/engine/evaluacion'

export async function planificadorFrenteAMotor(alturaM: number) {
  const tabla = crearTablaLuna(await Bun.file(new URL('../src/data/efemerides-luna.f32', import.meta.url)).arrayBuffer(), meta)
  const horizonte = (await import(`../src/data/horizonte-${SITIO_ACTIVO.id}.json`)).default
  const punto = { sitio: prepararSitio(SITIO_ACTIVO.latitudGrados, SITIO_ACTIVO.longitudEsteGrados), perfil: perfilDesde(mascaraDeArchivo(horizonte, ''), alturaM) }
  const d = dia(0)
  const n = Math.ceil(d.duracion / PASO_RESUMEN_S)
  const desde = Date.parse(estado(d.inicio).fechaUTC)
  const b = barrer(tabla, punto, desde, desde + (n - 1) * PASO_RESUMEN_S * 1000, PASO_RESUMEN_S * 1000)
  let sol = 0
  let tierra = 0
  // Mismo criterio que resumenDia: el centro del disco sobre el horizonte.
  for (let k = 0; k < b.n; k++) {
    if (b.solSobreHorizonte[k] > 0) sol++
    if (b.tierraSobreHorizonte[k] > 0) tierra++
  }
  const r = resumenDia(d, 0, 0, alturaM)
  return { plan: { sol: sol / b.n, tierra: tierra / b.n }, motor: { sol: r.fraccionSol, tierra: r.fraccionTierra } }
}
