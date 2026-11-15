// Planificación del descenso: lo que el informe de la NASA usaba para decidir (TN D-6846, Bennett 1972).
// Portado de engine/plan.js del navegador de NASA, sobre el mismo motor del descenso que usa el 3D.
import { tr } from "@/shared/i18n"
import { LM_APOLLO11, PERFIL_APOLLO11, luzDelDescenso, rumboApollo, type LuzDescenso } from "../alunizaje/engine/descenso"
import { descensoNominal } from "../alunizaje/engine/plan"

export { descensoNominal }

const NMI = 1852
/** Criterio de luz: «sun angle (10.9° nominal to 13.6° maximum)» (TN D-6846, p. 10). */
export const CRITERIO_LUZ = { minGrados: 10.9, maxGrados: 13.6, fuente: "NASA TN D-6846, p. 10" }
/** Elipse del Apollo 11: «± 3.6 n. mi. in-plane by ± 1.3 n. mi. cross range» (TN D-6846, fig. 11). */
export const ELIPSE_APOLLO11 = { semiRumboM: 3.6 * NMI, semiCruzadoM: 1.3 * NMI, fuente: "NASA TN D-6846, fig. 11" }
/** Aterrizaje de precisión propuesto para el Apollo 12: radio de 1 km (TN D-6846, p. 27). */
export const PRECISION_M = 1000

export type Hito = { nombre: string; modeloS: number; referenciaS: number }

/** Hitos del modelo frente al perfil premisión publicado (TN D-6846, tabla I). */
export function hitos(): Hito[] {
  const d = descensoNominal(), P = PERFIL_APOLLO11
  const filas: Array<[string, number, number]> = [
    [tr("Throttle recovery", "Recuperación del regulador"), d.eventos.recuperacionRegulador, P.recuperacionRegulador.tS],
    [tr("High gate (start of P64)", "Puerta alta (inicio de P64)"), d.eventos.puertaAlta, P.puertaAlta.tS],
    [tr("Low gate", "Puerta baja"), d.eventos.puertaBaja, P.puertaBaja.tS],
    [tr("Touchdown", "Contacto"), d.eventos.contacto, P.contacto.tS],
  ]
  return filas.map(([nombre, modeloS, referenciaS]) => ({ nombre, modeloS, referenciaS }))
}

export type Criterio = { nombre: string; valor: string; estado: "ok" | "bad" | "na"; nota?: string; fuente: string }
export type EvaluacionDescenso = { rumbo: number; luz: LuzDescenso; sobraKg: number; deltaV: number; deltaVRef: number; enBanda: boolean; criterios: Criterio[] }

/** Evaluación del descenso para un sitio con el Sol y la Tierra en el instante del contacto. */
export function evaluarDescenso(sol: { az: number; el: number; frac: number }, earth: { visible: boolean }): EvaluacionDescenso {
  const d = descensoNominal()
  const rumbo = rumboApollo(sol.az)
  const luz = luzDelDescenso(d, sol.el, sol.az, rumbo)
  const sobra = LM_APOLLO11.combustibleKg - d.combustibleUsadoKg
  const enBanda = sol.el >= CRITERIO_LUZ.minGrados && sol.el <= CRITERIO_LUZ.maxGrados
  const horizonte = tr("Site horizon (PGDA 5 m DTM + LOLA)", "Horizonte del sitio (DTM de 5 m de PGDA + LOLA)")
  return {
    rumbo, luz, sobraKg: sobra, deltaV: d.deltaVMs, deltaVRef: PERFIL_APOLLO11.deltaVMs, enBanda,
    criterios: [
      { nombre: tr("Fuel at touchdown", "Combustible al contacto"), valor: tr(`${Math.round(sobra)} kg left of ${Math.round(LM_APOLLO11.combustibleKg)} kg`, `sobran ${Math.round(sobra)} kg de ${Math.round(LM_APOLLO11.combustibleKg)} kg`), estado: sobra > 0 ? "ok" : "bad", fuente: tr("TN D-6846, table II (available propellant)", "TN D-6846, tabla II (combustible disponible)") },
      { nombre: tr("Pilot's line of sight above the Sun line", "Línea de vista del piloto sobre la línea del Sol"), valor: tr(`${luz.lineaDeVistaMinimaGrados.toFixed(1)}° vs Sun at ${sol.el.toFixed(1)}°`, `${luz.lineaDeVistaMinimaGrados.toFixed(1)}° frente a Sol a ${sol.el.toFixed(1)}°`), estado: luz.margenSobreSolGrados > 0 ? "ok" : "bad", fuente: tr("TN D-6846, p. 10: below the Sun line the terrain looks washed out", "TN D-6846, p. 10: bajo la línea del Sol el relieve se ve lavado") },
      { nombre: tr("Sun inside the Apollo band (10.9°–13.6°)", "Sol dentro de la banda del Apollo (10,9°–13,6°)"), valor: tr(`Sun at ${sol.el.toFixed(1)}°`, `Sol a ${sol.el.toFixed(1)}°`), estado: enBanda ? "ok" : "na",
        nota: enBanda ? "" : tr("Does not apply to the south pole: there the Sun never rises above ~2°. The criterion was set for equatorial sites in 1969.", "No aplica al polo sur: allí el Sol no pasa de ~2°. El criterio se fijó para sitios ecuatoriales en 1969."), fuente: CRITERIO_LUZ.fuente },
      { nombre: tr("Sun visible at touchdown", "Sol visible en el contacto"), valor: sol.frac > 0 ? tr(`${Math.round(sol.frac * 100)} % of the disk above the terrain`, `${Math.round(sol.frac * 100)} % del disco sobre el relieve`) : tr("hidden behind the terrain", "oculto tras el relieve"), estado: sol.frac > 0 ? "ok" : "bad", fuente: horizonte },
      { nombre: tr("Earth visible at touchdown (live tracking)", "Tierra visible en el contacto (seguimiento en vivo)"), valor: earth.visible ? tr("visible", "visible") : tr("hidden behind the terrain", "oculta tras el relieve"), estado: earth.visible ? "ok" : "bad", fuente: horizonte },
    ],
  }
}
