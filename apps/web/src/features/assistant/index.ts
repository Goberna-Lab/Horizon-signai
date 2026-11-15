import { lazy } from "react"

/**
 * Asistente con IA (IA asistente e IA educativa). API pública de la feature (guía: CLAUDE.md de esta carpeta).
 */
export { AssistantDock, type AssistantDockProps } from "./AssistantDock"

/** EVA, la robot guía en 3D que flota encima de toda la app. Diferida: three.js y la voz bajan después. */
export const EvaCompanera = lazy(() => import("./eva/EvaCompanera"))
