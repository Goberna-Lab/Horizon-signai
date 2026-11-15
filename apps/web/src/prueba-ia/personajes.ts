// Cómo suena cada asistente: la entonación (melodía, entonacion.ts) y el timbre (vozRobot.ts).
// La voz base de Kokoro y el prompt de cada una están en packages/shared/src/assistant.ts y
// apps/api/src/asistentes.ts. Para afinar de oído, cambia estos números: no tocan nada más.

import type { AssistantMode } from "@horizon-signai/shared"
import type { Entonacion } from "./entonacion"
import type { Timbre } from "./vozRobot"

/** `null`: ese paso no se aplica y la voz de Kokoro suena tal cual. */
export const PERSONAJES: Record<AssistantMode, { entonacion: Entonacion | null; timbre: Timbre | null }> = {
  // VERA, misión y planificación: voz de instalación. Casi monótona (rango 0,25) en escala mayor, una nota
  // plana por palabra, saltos de un grado de vez en cuando y, en la mitad de las frases, la última palabra
  // cae 5 semitonos (el remate seco). Formante +1. Anillo bajo: más alto suena a Dalek, no a IA.
  assistant: {
    entonacion: { semitonos: 0, rango: 0.25, escala: [0, 2, 4, 5, 7, 9, 11], salto: 0.15, caidaFinal: 5, formante: 1 },
    timbre: { seca: 0.6, anillo: 0.12, anilloHz: 48, peine: 0.32, peineMs: 6, realimentacion: 0.45, brilloDb: 5 },
  },
  // EVA, robot guía: voz natural de Kokoro (af_heart), sin entonación ni timbre de robot. Elegida por Manuel el
  // 2026-11-15 en la prueba de personalidades («Exploradora curiosa», «Voz Kokoro sin procesar»). Antes era
  // cantada: { semitonos: 3, rango: 1.2, escala: [0, 2, 4, 7, 9], salto: 0.3, caidaFinal: 0, formante: 3 } y
  // timbre { seca: 0.75, anillo: 0.05, anilloHz: 110, peine: 0.2, peineMs: 3.5, realimentacion: 0.35, brilloDb: 3 }.
  educational: { entonacion: null, timbre: null },
}
