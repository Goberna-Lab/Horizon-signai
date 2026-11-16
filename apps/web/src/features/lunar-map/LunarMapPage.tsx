import { useLocation } from "react-router"
import { lang, tr } from "@/shared/i18n"
import "./lunarMap.css"

/**
 * El Dashboard y el Planificador (prototipo estático de `prototipos/lunar-map/`, en inglés), a pantalla completa.
 *
 * Es HTML/CSS/JS sin dependencias que sirve la API en `/lunar-map/` (en dev, Vite lo reenvía). Esta pantalla es solo
 * el marco: un iframe de `/lunar-map/inicio.html`. La ruta de React (`/planner`) y la carpeta estática (`/lunar-map/`)
 * son distintas a propósito para que no choquen. No se copia a `public/`: la única fuente es `prototipos/lunar-map/`.
 *
 * `/planner` (y `/planner#missions`) abre "Missions", la campaña de ejemplo: el equipo decidió que "Open the planner" pase
 * primero por ahí (PR #15). El planificador de misiones (`/planificar-mision.html`) también se abre aquí, en el marco:
 * `/planner#plan?nueva&lang=es` con su dirección; `#landing`, `#walk` y los enlaces de escenario viejos abren su
 * formulario. Si esa página se abre suelta, ella misma vuelve aquí.
 */
export function LunarMapPage() {
  const { hash } = useLocation()
  // El planificador es el de misiones (`/planificar-mision.html`): se abre aquí, en el marco, con EVA y la app
  // alrededor. `#plan?nueva&lang=en` lleva su dirección; `#landing`, `#walk` y los escenarios viejos abren el formulario.
  const mission = (search: string) => `/planificar-mision.html${search}`
  const src =
    !hash || hash === "#missions"
      ? "/lunar-map/inicio.html"
      : hash.startsWith("#plan")
        ? mission(hash.slice(5) || `?lang=${lang}`)
        : mission(`?nueva&lang=${lang}`)
  return (
    <section className="screen lunar-map" aria-label={tr("Missions and landing planner", "Misiones y planificador de alunizaje")}>
      <iframe
        className="lunar-map__frame"
        // Cambiar solo el `#` no recarga un iframe: con `key` se monta de nuevo y el planificador lee el escenario.
        key={src}
        src={src}
        title={tr("Horizon Signai: missions and landing planner", "Horizon Signai: misiones y planificador de alunizaje")}
        allow="fullscreen"
      />
    </section>
  )
}
