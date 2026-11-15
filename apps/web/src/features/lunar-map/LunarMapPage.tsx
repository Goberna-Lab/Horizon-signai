import { useLocation } from "react-router"
import { tr } from "@/shared/i18n"
import "./lunarMap.css"

/**
 * El Dashboard y el Planificador (prototipo estático de `prototipos/lunar-map/`, en inglés), a pantalla completa.
 *
 * Es HTML/CSS/JS sin dependencias que sirve la API en `/lunar-map/` (en dev, Vite lo reenvía). Esta pantalla es solo
 * el marco: un iframe de `/lunar-map/inicio.html`. La ruta de React (`/planner`) y la carpeta estática (`/lunar-map/`)
 * son distintas a propósito para que no choquen. No se copia a `public/`: la única fuente es `prototipos/lunar-map/`.
 *
 * `/planner` (y `/planner#missions`) abre "Missions", la campaña de ejemplo: el equipo decidió que "Open the planner" pase
 * primero por ahí (PR #15). `/planner#landing` abre directamente el planificador, `/planner#walk` su paso 2 (la caminata), y
 * `/planner#z=B&t=2027-04-03T09:00&…` lo abre con ese escenario: es el enlace que da el botón "Link" del planificador
 * y el que usan el mapa 3D y el escritorio de misiones para llevar un lugar o una misión (ver `plannerPath`).
 */
export function LunarMapPage() {
  const { hash } = useLocation()
  const src = !hash || hash === "#missions" ? "/lunar-map/inicio.html" : hash === "#walk" ? "/lunar-map/planificar.html" : `/lunar-map/index.html${hash === "#landing" ? "" : hash}`
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
