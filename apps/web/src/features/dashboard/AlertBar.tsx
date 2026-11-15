import { reasons, type MissionRow } from "@/shared/planning"
import { copy } from "./copy"

/**
 * Dashboard: lo primero que ve quien responde por todas las misiones. Arriba, un solo aviso que dice si algo no
 * cumple y por qué (`AlertBar`); debajo, las cifras del conjunto y el cronograma (`Summary`); a la izquierda, las
 * misiones por fecha (`MissionList`) y, para la elegida, cuánto Sol y cuánta Tierra tiene (`SunLink`).
 */

type AlertBarProps = { rows: MissionRow[]; undo: string | null; onUndo: () => void; onReview: (id: string) => void }

/** El aviso único: en rojo de señal solo cuando hay algo que atender. */
export function AlertBar({ rows, undo, onUndo, onReview }: AlertBarProps) {
  const bad = rows.filter((r) => r.state === "bad")
  const waiting = rows.some((r) => r.state === "wait")
  const first = bad[0]
  return (
    <div className="db-alert" data-state={bad.length > 0 ? "bad" : "ok"} role="status">
      <p className="db-alert__text">
        {rows.length === 0 ? (
          copy.alert.none
        ) : first ? (
          <>
            <strong>{copy.alert.some(bad.length, rows.length)}</strong>{" "}
            <span>
              {first.mission.name}: {reasons(first.evaluation!.checks)}.
            </span>
          </>
        ) : waiting ? (
          copy.list.wait
        ) : (
          <strong>{copy.alert.allGood(rows.length)}</strong>
        )}
      </p>
      {undo && (
        <p className="db-alert__undo">
          {undo}{" "}
          <button type="button" onClick={onUndo}>
            {copy.alert.undo}
          </button>
        </p>
      )}
      {first && (
        <button type="button" className="ui-btn ui-btn--onsignal" onClick={() => onReview(first.mission.id)}>
          {copy.alert.review(first.mission.name)}
        </button>
      )}
    </div>
  )
}
