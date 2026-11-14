/** Rutas de la app. Úsalas en vez de escribir strings sueltos. */
export const routes = {
  landing: "/",
  missionPlanner: "/planificador",
  simulator: "/simulador",
  /** Página de pruebas de IA (voz y chat). No está enlazada desde la landing. */
  aiTest: "/prueba-ia",
} as const
