import { useEffect, useRef } from "react"
import { tr } from "@/shared/i18n"
import "./alunizaje/alunizaje.css"

/**
 * Alunizaje del Apollo 11 en el polo sur (Connecting Ridge · RoI 6): descenso real desde 500 m con el motor del equipo,
 * cámara que orbita la nave, ruta en 3D, mapa, perfil de altura y velocidad. Motor sin React (three.js imperativo,
 * como el vuelo de la landing); este componente solo lo monta y lo desmonta.
 */
export function LandingSimulator() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    let dispose: (() => void) | undefined
    void import("./alunizaje/world").then(async ({ startLanding }) => {
      if (!alive || !host.current) return
      const stop = await startLanding(host.current)
      if (alive) dispose = stop
      else stop()
    })
    return () => {
      alive = false
      dispose?.()
    }
  }, [])
  return (
    <section className="screen sim-alz-screen">
      <div ref={host} className="sim-alz" aria-label={tr("Apollo landing simulation at the lunar south pole", "Simulación del alunizaje del Apollo en el polo sur lunar")} />
    </section>
  )
}
