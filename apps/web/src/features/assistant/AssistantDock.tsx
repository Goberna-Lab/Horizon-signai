import type { AssistantMode, MissionContext } from "@horizon-signai/shared"

export type AssistantDockProps = {
  /** `assistant` en el Dashboard y el Planificador; `educational` en el Simulador. */
  mode: AssistantMode
  /** La misión abierta, con las cifras del motor ya calculadas. `null` si no hay ninguna abierta. */
  context: MissionContext | null
}

/**
 * El asistente con IA dentro de las pantallas de trabajo. El escritorio de misiones ya lo monta y le pasa la
 * misión abierta; mientras no esté construido no dibuja nada (no se muestra una herramienta que no funciona).
 * Qué construir aquí: CLAUDE.md de esta carpeta.
 */
export function AssistantDock(_props: AssistantDockProps) {
  return null
}
