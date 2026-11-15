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

/** La ruta del planificador de una misión. */
export const missionPath = (missionId: string) => `${routes.missionPlanner}/${encodeURIComponent(missionId)}`
