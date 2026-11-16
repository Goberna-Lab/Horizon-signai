import { Link } from "react-router"
import { routes } from "@/app/routes"
import { actions, brand } from "../content"

export function Header() {
  return (
    <header className="ln-bar">
      <Link className="ln-bar__brand" to={routes.landing} aria-label={brand.name}>
        {/* El logo oficial, en vectorial con sus medidas: el Sol rojo sobre tres líneas de horizonte y "AI" en rojo. */}
        <svg className="ln-bar__mark" viewBox="0 0 277 231" aria-hidden="true">
          <path className="ln-bar__sun" d="M32 106a106.5 106 0 0 1 213 0Z" />
          <rect x="0" y="130" width="277" height="16" />
          <rect x="43" y="172" width="191" height="16" />
          <rect x="85" y="215" width="107" height="16" />
        </svg>
        <span className="ln-bar__name" aria-hidden="true">
          Horizon Sign<span className="ln-bar__ai">AI</span>
        </span>
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
