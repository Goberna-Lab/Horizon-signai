// ENV-009 (E11): rebote del relieve real del Apollo 17. Parches de 8 m (cada 4 muestras del recorte de 2 m, 51 × 51),
// vecinos hasta 120 m y horizonte por parche hasta 150 m (el resto lo ponen los macizos, E10).
// La prueba del cráter esférico (tests) da −9,5 % frente a la solución exacta con este tamaño de parche.
import { SUPERFICIE, faseEsferaLambert, luzTierraLlena, type Vec3 } from './environment'
import { elevacionHorizonte } from './horizonte'
import { calcularRebote, prepararRebote, type PreparacionRebote } from './rebote'
import { MUESTRAS, PASO_ESTE_M, PASO_NORTE_M, alturaMuestra } from './terreno'

const SALTO = 4
const N_PARCHES = (MUESTRAS - 1) / SALTO + 1
export const RADIO_REBOTE_M = 120

let preparacion: PreparacionRebote | null = null

/** Se prepara una sola vez, la primera vez que se necesita (~0,2 s). */
function preparar(): PreparacionRebote {
  preparacion ??= prepararRebote(
    {
      n: N_PARCHES,
      pasoEsteM: PASO_ESTE_M * SALTO,
      pasoNorteM: PASO_NORTE_M * SALTO,
      altura: (f, c) => alturaMuestra(f * SALTO, c * SALTO),
    },
    RADIO_REBOTE_M,
    150,
  )
  return preparacion
}

const azimut = ([x, , z]: Vec3) => ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360

/** Lo que el rebote necesita del instante (EstadoEscena lo cumple). */
export type EntradaRebote = {
  direccionSol: Vec3
  diametroSolGrados: number
  distanciaSolAu: number
  direccionTierra: Vec3
  diametroTierraGrados: number
  faseTierra: number
}

/**
 * Irradiancia de un rebote en cada VÉRTICE del recorte (201 × 201, filas de norte a sur), en unidades de
 * "Sol = 1 a 1 UA", interpolada bilinealmente desde los parches de 8 m.
 */
export function reboteEnVertices(e: EntradaRebote): Float32Array {
  const pre = preparar()
  const factor = 1 / (e.distanciaSolAu * e.distanciaSolAu)
  const { rebote } = calcularRebote(
    pre,
    [
      {
        direccion: e.direccionSol,
        irradiancia: factor,
        diametroGrados: e.diametroSolGrados,
        horizonteLejanoGrados: elevacionHorizonte(azimut(e.direccionSol)),
      },
      {
        direccion: e.direccionTierra,
        irradiancia: factor * luzTierraLlena(e.diametroTierraGrados) * faseEsferaLambert(e.faseTierra),
        diametroGrados: e.diametroTierraGrados,
        horizonteLejanoGrados: elevacionHorizonte(azimut(e.direccionTierra)),
      },
    ],
    SUPERFICIE.albedo,
  )
  const salida = new Float32Array(MUESTRAS * MUESTRAS)
  for (let f = 0; f < MUESTRAS; f++) {
    const pf = f / SALTO
    const f0 = Math.min(Math.floor(pf), N_PARCHES - 2)
    const tf = pf - f0
    for (let c = 0; c < MUESTRAS; c++) {
      const pc = c / SALTO
      const c0 = Math.min(Math.floor(pc), N_PARCHES - 2)
      const tc = pc - c0
      const v00 = rebote[f0 * N_PARCHES + c0]
      const v01 = rebote[f0 * N_PARCHES + c0 + 1]
      const v10 = rebote[(f0 + 1) * N_PARCHES + c0]
      const v11 = rebote[(f0 + 1) * N_PARCHES + c0 + 1]
      salida[f * MUESTRAS + c] = (v00 * (1 - tc) + v01 * tc) * (1 - tf) + (v10 * (1 - tc) + v11 * tc) * tf
    }
  }
  return salida
}
