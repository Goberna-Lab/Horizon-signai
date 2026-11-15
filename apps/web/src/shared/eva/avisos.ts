// Cómo cualquier pantalla le avisa algo a EVA sin importar la feature del asistente (las features no se
// importan entre sí): un CustomEvent en window. Los tipos y lo que EVA dice: features/assistant/eva/guion.ts.

export const EVENTO_EVA = "eva:evento"
export type AvisoEva = {
  tipo: string
  texto?: string
  /** Con `tipo: "enfocar"`: la parte de la pantalla a la que va y que apunta con su rayo. */
  selector?: string
}

/** Ej.: `avisarEva("aterrizaje-nominal")`, o `avisarEva("aviso-critico", "Fuel below ten percent.")`. */
export const avisarEva = (tipo: string, texto?: string) =>
  window.dispatchEvent(new CustomEvent<AvisoEva>(EVENTO_EVA, { detail: { tipo, texto } }))

/**
 * Le pide a EVA que resalte algo: vuela hasta ese elemento, lo apunta con su rayo y, si se le da, dice el texto.
 * Ej.: `enfocarEva(".pl-checks", "Start with these checks.")`. Si el elemento no está a la vista, no hace nada.
 */
export const enfocarEva = (selector: string, texto?: string) =>
  window.dispatchEvent(new CustomEvent<AvisoEva>(EVENTO_EVA, { detail: { tipo: "enfocar", selector, texto } }))
