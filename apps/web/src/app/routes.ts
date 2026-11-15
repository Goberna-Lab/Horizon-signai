/** Rutas de la app. Úsalas en vez de escribir strings sueltos. */
export const routes = {
  landing: "/",
  /** Dashboard: todas las misiones. */
  dashboard: "/dashboard",
  /** Planificador: una misión, en `/planificador/<id>`. Sin id lleva al Dashboard, donde se elige la misión. */
  missionPlanner: "/planificador",
  /** Dashboard y Planificador (prototipo estático) a pantalla completa. Los archivos van en `/lunar-map/`, a propósito distinto. */
  lunarMap: "/planner",
  simulator: "/simulador",
  map3d: "/3d-map",
  /** Página de pruebas de IA (voz y chat). No está enlazada desde la landing. */
  aiTest: "/prueba-ia",
} as const

/**
 * El Planificador (prototipo) abierto directamente en la comparación de zonas, sin pasar por la campaña de ejemplo.
 * `/planner` a secas abre "Missions"; con `#…` abre el planificador, y lo que siga al `#` es el escenario
 * (`z`, `t`, `stay`, `panel`, `antenna`, `battery`, `earth`, `site`, `lat`, `lon`: ver `prototipos/lunar-map/index.html`).
 */
export const plannerPath = (scenario?: Record<string, string | number>) =>
  `${routes.lunarMap}#${scenario ? new URLSearchParams(Object.entries(scenario).map(([k, v]) => [k, String(v)])).toString() : "landing"}`

/** "Missions": la campaña de ejemplo del prototipo. Es también lo que abre `/planner` a secas. */
export const missionsPath = `${routes.lunarMap}#missions`

/** La ruta del planificador de una misión. */
export const missionPath = (missionId: string) => `${routes.missionPlanner}/${encodeURIComponent(missionId)}`
