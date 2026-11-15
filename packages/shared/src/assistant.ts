// Contrato entre la web y el API para el asistente con IA (IA asistente e IA educativa).
//
// Regla: el modelo no calcula. Las cifras de una misión las calcula el motor en la web y viajan aquí como
// contexto; el modelo las explica y cita los documentos que recuperó (RAG). Ver docs/11-flujo-y-arquitectura.md.

/** `assistant`: ayuda a quien planifica con su misión. `educational`: explica el porqué a quien está aprendiendo. */
export type AssistantMode = "assistant" | "educational"

/** Lo que la web sabe de la misión abierta, ya calculado por el motor. Unidades en el nombre de cada campo. */
export type MissionContext = {
  mission: {
    name: string
    site: string
    latDeg: number
    lonEastDeg: number
    landingUTC: string
    stayDays: number
    panelHeightM: number
    antennaHeightM: number
  }
  requirements: { batteryH: number; minEarthPct: number; sunAtLanding: boolean; earthAtLanding: boolean }
  /** Cifras de la estadía (definiciones: docs/04-planificador.md, sección 4). */
  figures: { sunPct: number; earthPct: number; bothPct: number; longestNightH: number; longestSilenceH: number; meanPanelWm2: number }
  /** En el aterrizaje: grados sobre el horizonte del terreno (> 0 visible). */
  landing: { sunMarginDeg: number; earthMarginDeg: number }
  verdict: { ok: boolean; failed: string[] }
  /** Horizonte del lugar: `detailed` (modelo de 5 m) o `approximate` (rejilla de 240 m). */
  horizon: "detailed" | "approximate"
}

export type AssistantMessage = { role: "user" | "assistant"; content: string }

/** POST /api/assistant */
export type AssistantRequest = {
  mode: AssistantMode
  messages: AssistantMessage[]
  /** La misión abierta, si la hay. Sin ella el asistente responde solo con los documentos. */
  context?: MissionContext
}

/** Un trozo de documento que el asistente usó para responder. */
export type AssistantSource = { title: string; path: string; excerpt: string }

export type AssistantReply = { answer: string; sources: AssistantSource[]; model: string; ms: number }
