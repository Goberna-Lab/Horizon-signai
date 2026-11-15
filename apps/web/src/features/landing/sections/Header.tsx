import { Link } from "react-router"
import { routes } from "@/app/routes"
import { actions, brand, nav } from "../content"

export function Header() {
  return (
    <header className="ln-bar">
      <Link className="ln-bar__brand" to={routes.landing}>
        {brand.name}
      </Link>
      <nav className="ln-bar__nav" aria-label="Screens">
        {nav.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className="ln-bar__cta" to={actions.planner.to}>
        {actions.planner.label}
      </Link>
    </header>
  )
}
