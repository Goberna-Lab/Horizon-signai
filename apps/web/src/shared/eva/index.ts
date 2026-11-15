/**
 * EVA, la robot guía, en 3D. `EvaLienzo` es el export por defecto de su propio archivo para cargarlo
 * diferido (three.js pesa): `lazy(() => import("@/shared/eva/EvaLienzo"))`. Quien la mueve por la
 * pantalla y le da voz: features/assistant/eva.
 */
export type { EstadoEva } from "./EvaModelo"
export { avisarEva, enfocarEva, EVENTO_EVA, type AvisoEva } from "./avisos"
