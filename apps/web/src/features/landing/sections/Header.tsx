import { Link } from "react-router"
import { routes } from "@/app/routes"
import { actions, brand, nav } from "../content"

export function Header() {
  return (
    <header className="ln-bar">
      <Link className="ln-bar__brand" to={routes.landing}>
        {brand.name}
      </Link>
      <nav className="ln-bar__nav" aria-label="On this page">
        {nav.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <Link className="ln-bar__cta" to={actions.planner.to}>
        {actions.planner.label}
      </Link>
    </header>
  )
}
