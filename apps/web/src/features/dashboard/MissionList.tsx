import { hours, percent, reasons, span, stamp, type MissionRow } from "@/shared/planning"
import { Verdict } from "@/shared/ui/Verdict"
import { copy } from "./copy"

type MissionListProps = {
  rows: MissionRow[]
  selectedId: string | null
  nowMs: number
  canRestore: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onAdd: () => void
  onRestore: () => void
}

export function MissionList({ rows, selectedId, nowMs, canRestore, onSelect, onOpen, onAdd, onRestore }: MissionListProps) {
  return (
    <section className="ui-card db-missions" aria-label={copy.list.title}>
      <header className="ui-card__head">
        <h2 className="ui-label">{copy.list.title}</h2>
        <button type="button" className="ui-btn ui-btn--small" onClick={onAdd}>
          + {copy.list.add}
        </button>
      </header>
      <ul>
        {rows.map((r) => {
          const { mission, site, evaluation } = r
          const wait = mission.landingMs - nowMs
          return (
            <li key={mission.id} className="db-mission" data-selected={mission.id === selectedId} data-state={r.state}>
              <button type="button" className="db-mission__pick" aria-pressed={mission.id === selectedId} aria-label={`${mission.name}: show on the map`} onClick={() => onSelect(mission.id)} />
              <p className="db-mission__name">
                {mission.name}
                {mission.example && <small>{copy.list.example}</small>}
              </p>
              <Verdict state={r.state} />
              <p className="db-mission__meta">
                {site.name} · {stamp(mission.landingMs)} · {mission.stayDays} d
              </p>
              <p className="db-mission__when">{wait > 0 ? copy.list.lands(span(wait)) : copy.list.landed}</p>
              {evaluation && (
                <p className="db-mission__why">
                  {evaluation.ok
                    ? `Sun ${percent(evaluation.figures.sunPct)} · Earth ${percent(evaluation.figures.earthPct)} · longest night ${hours(evaluation.figures.longestNightH)}`
                    : reasons(evaluation.checks)}
                </p>
              )}
              <button type="button" className="ui-btn ui-btn--small db-mission__open" onClick={() => onOpen(mission.id)}>
                {copy.list.open}
              </button>
            </li>
          )
        })}
      </ul>
      {canRestore && (
        <button type="button" className="ui-link db-missions__restore" onClick={onRestore}>
          {copy.list.restore}
        </button>
      )}
    </section>
  )
}
