// Descenso nominal del Apollo 11 (motor del equipo, `luna-recursos/calculos/motor/descenso.ts`), calculado una vez.
import { simularDescenso, type ResultadoDescenso } from "./descenso"

let nominal: ResultadoDescenso | null = null
export const descensoNominal = (): ResultadoDescenso => (nominal ??= simularDescenso())
