import { Link } from "react-router"
import { routes } from "@/app/routes"
import { actions, brand } from "../content"

export function Header() {
  return (
    <header className="ln-bar">
      <Link className="ln-bar__brand" to={routes.landing}>
        {brand.name}
      </Link>
      <div className="ln-bar__end">
        {/* En un teléfono la acción lleva la etiqueta corta, para que quepa el selector de idioma (landing.css). */}
        <Link className="ln-bar__cta" to={actions.planner.to} aria-label={actions.planner.label}>
          <span className="ln-bar__cta-full">{actions.planner.label}</span>
          <span className="ln-bar__cta-short" aria-hidden="true">
            {actions.planner.short}
          </span>
        </Link>
      </div>
    </header>
  )
}
