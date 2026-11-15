import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router"
import { tr } from "@/shared/i18n"
import { useMissions } from "@/shared/planning"
import "./alunizaje/alunizaje.css"

/**
 * Alunizaje del Apollo en el polo sur y la caminata planificada: descenso real desde 500 m con el motor del equipo,
 * contacto con el terreno, caminata con el casco. Motor sin React (three.js imperativo, como el vuelo de la landing);
 * este componente solo lo monta y lo desmonta. Dónde y cuándo lo decide la planificación, no el simulador:
 *  · `?mission=<id>`: el sitio y la fecha de aterrizaje de esa misión del Planificador.
 *  · `?sitio=<id>&fecha=<ISO>`: un sitio del Planificador en una fecha (por ejemplo, desde un enlace del Planificador).
 *  · Sin nada: el plan de la misión CR-01 (Connecting Ridge · RoI 6, 18 de diciembre de 2026, 09:00 UTC).
 */
export function LandingSimulator() {
  const host = useRef<HTMLDivElement>(null)
  const [params] = useSearchParams()
  const missions = useMissions()
  const mission = missions.find((m) => m.id === params.get("mission")) ?? null
  const siteId = mission?.siteId ?? params.get("sitio") ?? undefined
  const fecha = params.get("fecha")
  const ms = mission?.landingMs ?? (fecha ? Date.parse(fecha) : undefined)
  const msOk = ms != null && Number.isFinite(ms) ? ms : undefined

  useEffect(() => {
    let alive = true
    let dispose: (() => void) | undefined
    void import("./alunizaje/world").then(async ({ startLanding }) => {
      if (!alive || !host.current) return
      const stop = await startLanding(host.current, { siteId, ms: msOk })
      if (alive) dispose = stop
      else stop()
    })
    return () => {
      alive = false
      dispose?.()
    }
  }, [siteId, msOk])

  return (
    <section className="screen sim-alz-screen">
      <div ref={host} className="sim-alz" aria-label={tr("Apollo landing simulation at the lunar south pole", "Simulación del alunizaje del Apollo en el polo sur lunar")} />
    </section>
  )
}
