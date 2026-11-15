import { useSearchParams } from "react-router"
import { tr } from "@/shared/i18n"
import { LandingSimulator } from "./LandingSimulator"
import { Navegador, type VistaNav } from "./navegador/Navegador"
import { estadoNavegador } from "./navegador/navegador"
import "./navegador/navegador.css"

type Vista = "guia" | "descenso" | "mapa" | "horizonte" | "comparar" | "3d"
const PESTANAS: Array<{ id: Vista; nav: VistaNav | null; texto: string }> = [
  { id: "guia", nav: "guide", texto: tr("Guided mission", "Misión guiada") },
  { id: "descenso", nav: "descent", texto: tr("Descent", "Descenso") },
  { id: "mapa", nav: "map", texto: tr("Map", "Mapa") },
  { id: "horizonte", nav: "horizon", texto: tr("Horizon", "Horizonte") },
  { id: "comparar", nav: "compare", texto: tr("Compare", "Comparar") },
  { id: "3d", nav: null, texto: "3D" },
]

/**
 * /simulador: el navegador de sitios (planificación, cinco pestañas que comparten sitio, periodo y tiempo) y el
 * alunizaje 3D. `?vista=guia|descenso|mapa|horizonte|comparar|3d`; sin `vista`, el 3D (el recorrido de EVA lo espera).
 * La pestaña 3D abre el alunizaje en el sitio y el instante del navegador (`?sitio=<id>&fecha=<ISO>`).
 */
export function SimulatorPage() {
  const [params, setParams] = useSearchParams()
  const pedida = params.get("vista")
  const actual = PESTANAS.find((p) => p.id === pedida) ?? PESTANAS[PESTANAS.length - 1]
  const fechaParam = params.get("fecha")
  const fecha = fechaParam ? Date.parse(fechaParam) : NaN

  const ir3d = ({ siteId, ms }: { siteId: string; ms: number }) => {
    const p = new URLSearchParams(params)
    p.delete("mission")
    p.set("vista", "3d")
    p.set("sitio", siteId)
    p.set("fecha", new Date(ms).toISOString())
    setParams(p)
  }

  const elegir = (id: Vista) => {
    if (id === actual.id) return
    if (id === "3d") {
      ir3d(estadoNavegador())
      return
    }
    const p = new URLSearchParams(params)
    p.set("vista", id)
    setParams(p)
  }

  return (
    <div className={`screen sim-nav-page ${actual.nav ? "sim-nav-plan" : "sim-nav-en3d"}`}>
      <header className="sim-nav-head">
        {actual.nav && (
          <div className="sim-nav-brand">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="9" cy="10" r="1.6" fill="currentColor" /><circle cx="14.5" cy="14" r="2.2" fill="currentColor" /><circle cx="15" cy="8" r="1" fill="currentColor" /></svg>
            <h1>{tr("Lunar Landing Site Navigator", "Navegador de Sitios de Aterrizaje Lunar")}</h1>
          </div>
        )}
        <nav className="sim-nav-tabs" role="tablist" aria-label={tr("Simulator views", "Vistas del simulador")}>
          {PESTANAS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === actual.id} className={p.id === actual.id ? "sim-nav-active" : ""} onClick={() => elegir(p.id)}>
              {p.texto}
            </button>
          ))}
        </nav>
      </header>
      {actual.nav ? <Navegador vista={actual.nav} sitio={params.get("sitio")} fecha={Number.isFinite(fecha) ? fecha : null} onIr3d={ir3d} /> : <LandingSimulator />}
    </div>
  )
}
