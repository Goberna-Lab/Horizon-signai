/** Textos del escritorio de misiones (lo que no es de ninguna feature), en inglés y en español (`@/shared/i18n`). */
import { tr } from "@/shared/i18n"

export const copy = {
  /** Nombre provisional, el mismo de la landing: el definitivo está pendiente (docs/03-producto.md). */
  brand: "Horizon Signai",
  nav: {
    label: tr("Workspace", "Escritorio de misiones"),
    // «Dashboard» se queda igual en español: «panel» ya es el panel solar en estas pantallas.
    dashboard: "Dashboard",
    planner: tr("Planner", "Planificador"),
    map3d: tr("3D Map", "Mapa 3D"),
  },
  loading: tr("Loading ephemeris and terrain…", "Cargando efemérides y terreno…"),
  failed: tr("The planner data could not be loaded. Check the connection and reload the page.", "No se pudieron cargar los datos del planificador. Revisa la conexión y recarga la página."),
  missing: tr("That mission is not in this browser.", "Esa misión no está en este navegador."),
  foot: tr(
    "Sun and Earth: NASA/JPL Horizons, DE441. Terrain: LRO LOLA (PDS Geosciences Node) and the 5 m south pole models of NASA GSFC PGDA (Barker et al. 2021). The example missions are fictional. This project is not endorsed by NASA.",
    "Sol y Tierra: NASA/JPL Horizons, DE441. Terreno: LRO LOLA (PDS Geosciences Node) y los modelos de 5 m del polo sur de NASA GSFC PGDA (Barker et al. 2021). Las misiones de ejemplo son ficticias. Este proyecto no cuenta con el aval de la NASA.",
  ),
}
