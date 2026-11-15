import type { MissionRow } from "@/shared/planning"

const LABELS = { ok: "Meets requirements", bad: "Needs attention", wait: "Calculating" }

/** El veredicto de una misión frente a sus requisitos: cumple, hay que atenderla o todavía se está calculando. */
export function Verdict({ state }: { state: MissionRow["state"] }) {
  return (
    <span className="ui-chip" data-state={state}>
      {LABELS[state]}
    </span>
  )
}
