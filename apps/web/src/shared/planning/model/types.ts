// Tipos de dominio del núcleo de planificación: lugares del catálogo, misiones y sus requisitos.
// Lo que viaja al backend (el contexto de misión para el asistente) está en @horizon-signai/shared.

export type SiteKind = "site" | "roi" | "mission"

/** Un lugar del catálogo del polo sur (`data/sites.json`). */
export type Site = {
  id: string
  name: string
  /** `site`: centro de un mosaico de PGDA; `roi`: zona de aterrizaje candidata; `mission`: un alunizaje real. */
  kind: SiteKind
  /** Sitio al que pertenece una zona candidata. */
  parent: string | null
  lat: number
  lon: number
  /** Posición en la estereográfica polar sur (km): x hacia 90° E, y hacia 0° E. */
  xKm: number
  yKm: number
  /** Altura del relieve sobre la esfera de 1737,4 km (m). */
  heightM: number
  /** Pendiente en el punto (°) y desnivel dentro de 2 km (m), sobre la rejilla de 240 m: un indicador grueso. */
  slopeDeg: number
  reliefM: number
  /** `detailed`: horizonte del modelo de 5 m; `approximate`: solo la rejilla de 240 m. */
  horizon: "detailed" | "approximate"
}

/** Lo que la misión necesita para seguir viva. Lo pone quien planifica: no hay umbrales fijos. */
export type Requirements = {
  /** Horas seguidas que la batería aguanta sin Sol. */
  batteryH: number
  /** Parte mínima de la estadía con la Tierra a la vista (%): el enlace directo, sin satélite de relevo. */
  minEarthPct: number
  /** El Sol debe estar a la vista en el momento del aterrizaje. */
  sunAtLanding: boolean
  /** La Tierra debe estar a la vista en el momento del aterrizaje. */
  earthAtLanding: boolean
}

export type Mission = {
  id: string
  name: string
  siteId: string
  /** Aterrizaje, UTC (ms). */
  landingMs: number
  /** Días en la superficie. */
  stayDays: number
  /** Altura del panel solar sobre el suelo (m): desde ahí se mira el Sol. */
  panelHeightM: number
  /** Altura de la antena sobre el suelo (m): desde ahí se mira la Tierra. */
  antennaHeightM: number
  requirements: Requirements
  /** Fecha anterior del aterrizaje, si el plan se movió. */
  movedFromMs?: number
  /** Misión de ejemplo: no es una misión real. */
  example?: boolean
}
