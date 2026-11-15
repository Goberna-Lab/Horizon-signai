import { useEffect, useRef } from "react"
import { tr } from "@/shared/i18n"
import { montarNavegador } from "./navegador"
import "./navegador.css"

/** Vistas de planificación del navegador (las del navegador de NASA, sin el 3D). */
export type VistaNav = "guide" | "descent" | "map" | "horizon" | "compare"

type Props = {
  vista: VistaNav
  /** Sitio y fecha de la dirección (`?sitio=`, `?fecha=`): se eligen al montar, si son válidos. */
  sitio: string | null
  fecha: number | null
  /** Abrir el alunizaje 3D en ese sitio y ese instante. */
  onIr3d: (destino: { siteId: string; ms: number }) => void
}

/**
 * Navegador de sitios: misión guiada, descenso, mapa, horizonte y comparación. Motor sin React (`navegador.ts`, portado
 * del navegador de NASA); este componente solo lo monta, le cambia la vista y lo desmonta.
 */
export function Navegador({ vista, sitio, fecha, onIr3d }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const nav = useRef<ReturnType<typeof montarNavegador> | null>(null)
  const ir3d = useRef(onIr3d)
  ir3d.current = onIr3d
  const inicial = useRef({ vista, sitio, fecha })

  useEffect(() => {
    if (!host.current) return
    const { vista: v, sitio: s, fecha: f } = inicial.current
    const n = montarNavegador(host.current, { vista: v, sitio: s, fecha: f, ir3d: (d: { siteId: string; ms: number }) => ir3d.current(d) })
    nav.current = n
    return () => {
      nav.current = null
      n.destroy()
    }
  }, [])

  useEffect(() => {
    nav.current?.setView(vista)
  }, [vista])

  return <div ref={host} className="sim-nav-host" aria-label={tr("Landing site navigator", "Navegador de sitios de alunizaje")} />
}
