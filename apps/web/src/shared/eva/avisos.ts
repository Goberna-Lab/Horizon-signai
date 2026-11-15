// Cómo cualquier pantalla le avisa algo a EVA sin importar la feature del asistente (las features no se
// importan entre sí): un CustomEvent en window. Los tipos y lo que EVA dice: features/assistant/eva/guion.ts.

export const EVENTO_EVA = "eva:evento"
export type AvisoEva = { tipo: string; texto?: string }

/** Ej.: `avisarEva("aterrizaje-nominal")`, o `avisarEva("aviso-critico", "Fuel below ten percent.")`. */
export const avisarEva = (tipo: string, texto?: string) =>
  window.dispatchEvent(new CustomEvent<AvisoEva>(EVENTO_EVA, { detail: { tipo, texto } }))
