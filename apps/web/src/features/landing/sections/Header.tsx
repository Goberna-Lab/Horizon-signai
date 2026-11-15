import { Link } from "react-router"
import { routes } from "@/app/routes"
import { tr } from "@/shared/i18n"
import { LangToggle } from "@/shared/i18n/LangToggle"
import { actions, brand, nav } from "../content"

export function Header() {
  return (
    <header className="ln-bar">
      <Link className="ln-bar__brand" to={routes.landing}>
        {brand.name}
      </Link>
      <nav className="ln-bar__nav" aria-label={tr("Screens", "Pantallas")}>
        {nav.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
      </nav>
      {/* El idioma va junto a la acción: así sigue a la vista en un teléfono, donde los enlaces se ocultan. */}
      <div className="ln-bar__end">
        <LangToggle className="ln-bar__lang" />
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
