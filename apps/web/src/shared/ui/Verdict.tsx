import { tr } from "@/shared/i18n"
import type { MissionRow } from "@/shared/planning"

const LABELS = { ok: tr("Meets requirements", "Cumple los requisitos"), bad: tr("Needs attention", "Requiere atención"), wait: tr("Calculating", "Calculando") }

/** El veredicto de una misión frente a sus requisitos: cumple, hay que atenderla o todavía se está calculando. */
export function Verdict({ state }: { state: MissionRow["state"] }) {
  return (
    <span className="ui-chip" data-state={state}>
      {LABELS[state]}
    </span>
  )
}
