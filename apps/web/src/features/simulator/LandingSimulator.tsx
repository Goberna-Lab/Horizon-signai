import { useEffect, useMemo, useRef, type ChangeEvent } from "react"
import { useSearchParams } from "react-router"
import { tr, lang } from "@/shared/i18n"
import { sites, useMissions } from "@/shared/planning"
import "./alunizaje/alunizaje.css"

const SITIO_POR_DEFECTO = "connecting-ridge-roi-6"
const fecha = (ms: number) => new Date(ms).toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/**
 * Alunizaje del Apollo en el polo sur: descenso real desde 500 m con el motor del equipo, contacto con el terreno,
 * caminata con el casco. Motor sin React (three.js imperativo, como el vuelo de la landing); este componente solo lo
 * monta, lo desmonta y elige dónde y cuándo:
 *  · `?mission=<id>`: el sitio y la fecha de aterrizaje de esa misión del Planificador (las mismas cifras de Sol y Tierra).
 *  · `?sitio=<id>&fecha=<ISO>`: cualquier sitio del Planificador en una fecha.
 *  · Sin nada: Connecting Ridge · RoI 6 (el único con relieve fino a 10 m), el 15 de noviembre de 2026.
 */
export function LandingSimulator() {
  const host = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()
  const missions = useMissions()
  const mission = missions.find((m) => m.id === params.get("mission")) ?? null
  const siteId = mission?.siteId ?? params.get("sitio") ?? SITIO_POR_DEFECTO
  const fechaParam = params.get("fecha")
  const ms = mission?.landingMs ?? (fechaParam ? Date.parse(fechaParam) : undefined)
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

  const valor = mission ? `m:${mission.id}` : `s:${siteId}`
  const elegir = (e: ChangeEvent<HTMLSelectElement>) => {
    const [tipo, id] = [e.target.value.slice(0, 1), e.target.value.slice(2)]
    const p = new URLSearchParams(params)
    p.delete("mission")
    p.delete("sitio")
    if (tipo === "m") p.set("mission", id)
    else p.set("sitio", id)
    setParams(p)
  }
  const sitiosOrden = useMemo(() => [...sites].sort((a, b) => a.name.localeCompare(b.name)), [])

  return (
    <section className="screen sim-alz-screen">
      <div ref={host} className="sim-alz" aria-label={tr("Apollo landing simulation at the lunar south pole", "Simulación del alunizaje del Apollo en el polo sur lunar")} />
      <label className="sim-elegir">
        <span>{tr("Landing site", "Sitio de alunizaje")}</span>
        <select value={valor} onChange={elegir}>
          {missions.length > 0 && (
            <optgroup label={tr("Planner missions", "Misiones del Planificador")}>
              {missions.map((m) => (
                <option key={m.id} value={`m:${m.id}`}>
                  {m.name} · {fecha(m.landingMs)}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={tr("Sites", "Sitios")}>
            {sitiosOrden.map((s) => (
              <option key={s.id} value={`s:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
    </section>
  )
}
