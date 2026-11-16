import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { tr } from "@/shared/i18n"
import { BITACORAS } from "@/shared/bitacoras"
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
 *  · `&fallos=1`: modo entrenamiento (fallo de altura al azar y rocas del suelo generado). Sin él, la misión planificada
 *    no se cae por lo inventado: el guiado esquiva el suelo generado y no hay fallo aleatorio.
 *  · `?bitacora=<id>`: una misión real guiada (@/shared/bitacoras, alunizaje/guiada.ts): su sitio, su fecha y EVA
 *    contando lo que pasó. Manda sobre lo demás.
 *  · `&guia=<nombre>` (con `&bateria=<h>&tierra=<%>`): la misión planificada, guiada: EVA cuenta paso a paso lo que el
 *    motor del Planificador calcula para ese lugar y esa fecha (alunizaje/planGuiado.ts). Con `?mission=`, `&guia=1`.
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
  // Lo que la misión hace fuera del módulo (tipo y salidas, del Planificador): la primera salida es la que se vuela
  const salida = mission?.outings?.[0]
  const RUTAS = { science: "cientifica", safe: "segura", short: "corta" } as const
  const ruta = params.get("ruta") ?? (salida ? RUTAS[salida.route] : undefined)
  const evaN = Number(params.get("eva"))
  const evaH = Number.isFinite(evaN) && evaN > 0 ? Math.min(evaN, 24 * 60) : salida && salida.afterH > 0 ? salida.afterH : undefined
  const tipoP = params.get("tipo")
  // Sin `&tipo=`, el de la misión; una misión guiada sin tipo es un módulo fijo (en las demás, como siempre: tripulada)
  const tipo = tipoP === "rover" || tipoP === "fija" ? tipoP : tipoP === "tripulada" ? undefined : mission?.kind === "rover" ? "rover" : mission && !mission.kind && params.get("guia") ? "fija" : undefined
  const num = (k: string, min: number, max: number) => { const n = Number(params.get(k)); return params.get(k) != null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined }
  const roverKmh = num("vel", 0.05, 5)
  const paradaH = num("parada", 0, 24)
  const panelM = num("panel", 0, 30) ?? mission?.panelHeightM
  const antenaM = num("antena", 0, 30) ?? mission?.antennaHeightM
  const estadiaH = num("estadia", 1, 24 * 60) ?? (mission ? mission.stayDays * 24 : undefined)
  const fallos = params.get("fallos") === "1"
  const bitacora = BITACORAS.find((b) => b.id === params.get("bitacora"))
  // Recorrido guiado de una misión planificada: el nombre que EVA usa y los requisitos con que el motor la evalúa
  const guiaP = params.get("guia")
  const guiaNombre = guiaP ? (guiaP === "1" ? (mission?.name ?? "") : guiaP).replace(/[^0-9A-Za-zÀ-ÿ .\-]/g, "").slice(0, 24) || undefined : undefined
  const bateriaH = num("bateria", 0, 720) ?? mission?.requirements.batteryH
  const tierraPct = num("tierra", 0, 100) ?? mission?.requirements.minEarthPct
  const salidasH = mission?.outings?.map((o) => o.afterH).join(",")

  useEffect(() => {
    let alive = true
    let dispose: (() => void) | undefined
    void import("./alunizaje/world").then(async ({ startLanding }) => {
      if (!alive || !host.current) return
      setSinPaquete(null)
      let stop: () => void
      try {
        stop = await startLanding(host.current, { siteId, ms: msOk, ruta, evaH, tipo, roverKmh, paradaH, panelM, antenaM, estadiaH, fallos, bitacora, guia: guiaNombre ? { nombre: guiaNombre, batteryH: bateriaH, minEarthPct: tierraPct, salidasH: salidasH ? salidasH.split(",").map(Number) : undefined } : undefined })
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
  }, [siteId, msOk, ruta, evaH, tipo, roverKmh, paradaH, panelM, antenaM, estadiaH, fallos, bitacora, guiaNombre, bateriaH, tierraPct, salidasH])

  return (
    <section className="screen sim-alz-screen">
      <div ref={host} className="sim-alz" aria-label={tr("Apollo landing simulation at the lunar south pole", "Simulación del alunizaje del Apollo en el polo sur lunar")} />
      {sinPaquete && (
        <p className="sim-sin-paquete" role="alert">
          {sinPaquete === "punto-propio"
            ? tr(
                "An own point from the Planner cannot be flown in 3D yet: the simulator only has the relief of the catalog sites. Its Sun and Earth figures are in the Planner, with the approximate horizon.",
                "Un punto propio del Planificador todavía no se puede volar en 3D: el simulador solo tiene el relieve de los sitios del catálogo. Sus cifras de Sol y Tierra están en el Planificador, con el horizonte aproximado.",
              )
            : tr(
                `The simulator does not have this site yet (${sinPaquete}): it needs its LOLA relief pack and its horizon in the Planner engine.`,
                `El simulador todavía no tiene este sitio (${sinPaquete}): le faltan su paquete de relieve LOLA y su horizonte en el motor del Planificador.`,
              )}
        </p>
      )}
    </section>
  )
}
