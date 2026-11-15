import { useEffect, useRef, useState } from "react"
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
 *  · `&ruta=segura|corta|cientifica&eva=<h>`: la ruta de la caminata y cuántas horas después del alunizaje sale la EVA
 *    (la escena pasa entonces al Sol y la Tierra de ese momento). Sin ruta, la científica de CR-02.
 *  · `&tipo=tripulada|rover|fija`: con rover, `&vel=<km/h>&parada=<h>` (velocidad máxima y horas por parada del plan);
 *    el módulo fijo termina en el alunizaje, con su informe.
 *  · `&panel=<m>&antena=<m>&estadia=<h>`: alturas del panel solar y la antena (tecla P los despliega) y estadía, para su informe.
 *  · Sin nada: el plan de la misión CR-01 (Connecting Ridge · RoI 6, 18 de diciembre de 2026, 09:00 UTC).
 */
export function LandingSimulator() {
  const host = useRef<HTMLDivElement>(null)
  const [sinPaquete, setSinPaquete] = useState<string | null>(null)
  const [params] = useSearchParams()
  const missions = useMissions()
  const mission = missions.find((m) => m.id === params.get("mission")) ?? null
  const siteId = mission?.siteId ?? params.get("sitio") ?? undefined
  const fecha = params.get("fecha")
  const ms = mission?.landingMs ?? (fecha ? Date.parse(fecha) : undefined)
  const msOk = ms != null && Number.isFinite(ms) ? ms : undefined
  const ruta = params.get("ruta") ?? undefined
  const evaN = Number(params.get("eva"))
  const evaH = Number.isFinite(evaN) && evaN > 0 ? Math.min(evaN, 24 * 60) : undefined
  const tipoP = params.get("tipo")
  const tipo = tipoP === "rover" || tipoP === "fija" ? tipoP : undefined
  const num = (k: string, min: number, max: number) => { const n = Number(params.get(k)); return params.get(k) != null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined }
  const roverKmh = num("vel", 0.05, 5)
  const paradaH = num("parada", 0, 24)
  const panelM = num("panel", 0, 30)
  const antenaM = num("antena", 0, 30)
  const estadiaH = num("estadia", 1, 24 * 60)

  useEffect(() => {
    let alive = true
    let dispose: (() => void) | undefined
    void import("./alunizaje/world").then(async ({ startLanding }) => {
      if (!alive || !host.current) return
      setSinPaquete(null)
      let stop: () => void
      try {
        stop = await startLanding(host.current, { siteId, ms: msOk, ruta, evaH, tipo, roverKmh, paradaH, panelM, antenaM, estadiaH })
      } catch (e) {
        if (alive && String(e).includes("sitio-sin-paquete")) setSinPaquete(siteId ?? "?")
        return
      }
      if (alive) dispose = stop
      else stop()
    })
    return () => {
      alive = false
      dispose?.()
    }
  }, [siteId, msOk, ruta, evaH, tipo, roverKmh, paradaH, panelM, antenaM, estadiaH])

  return (
    <section className="screen sim-alz-screen">
      <div ref={host} className="sim-alz" aria-label={tr("Apollo landing simulation at the lunar south pole", "Simulación del alunizaje del Apollo en el polo sur lunar")} />
      {sinPaquete && (
        <p className="sim-sin-paquete" role="alert">
          {tr(
            `The simulator does not have this site yet (${sinPaquete}): it needs its LOLA relief pack and its horizon in the Planner engine.`,
            `El simulador todavía no tiene este sitio (${sinPaquete}): le faltan su paquete de relieve LOLA y su horizonte en el motor del Planificador.`,
          )}
        </p>
      )}
    </section>
  )
}
