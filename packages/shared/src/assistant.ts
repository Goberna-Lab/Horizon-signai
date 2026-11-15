// Contrato entre la web y el API para el asistente con IA (IA asistente e IA educativa).
//
// Regla: el modelo no calcula. Las cifras de una misión las calcula el motor en la web y viajan aquí como
// contexto; el modelo las explica y cita los documentos que recuperó (RAG). Ver docs/11-flujo-y-arquitectura.md.

/** `assistant`: ayuda a quien planifica con su misión. `educational`: explica el porqué a quien está aprendiendo. */
export type AssistantMode = "assistant" | "educational"

/**
 * Las dos asistentes: personalidad, entonación y voz distintas (pedido de Estephano, 2026-11-15).
 * - VERA, asistente de misión y planificación: voz de instalación, clínica, casi monótona y con humor seco.
 * - EVA, asistente pedagógica: un robot guía que enseña todo el proyecto, bromea, acompaña por todo el flujo
 *   y recuerda lo que la persona le contó (en su navegador). Voz natural de Kokoro, sin filtro de robot (elegida
 *   por Manuel el 2026-11-15 en la prueba de personalidades: «Exploradora curiosa», af_heart). Su dibujo: shared/eva.
 * EVA viene de «extravehicular activity» (caminata espacial); VERA es provisional. `voice` es la voz de Kokoro-82M que pide el API a horizon-voz (Geografo);
 * las dos ya están en su caché. El prompt de cada una está en apps/api/src/asistentes.ts y su filtro de voz
 * en apps/web/src/prueba-ia/personajes.ts.
 */
export const ASSISTANTS: Record<AssistantMode, { name: string; role: string; voice: string }> = {
  assistant: { name: "VERA", role: "Mission & planning", voice: "af_heart" },
  educational: { name: "EVA", role: "Your guide", voice: "af_heart" },
}
export const ASSISTANT_MODES = Object.keys(ASSISTANTS) as AssistantMode[]
export const isAssistantMode = (x: unknown): x is AssistantMode => x === "assistant" || x === "educational"

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
