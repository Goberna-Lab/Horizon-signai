import { DAY_MS, span, stamp, type MissionRow } from "@/shared/planning"
import { copy } from "./copy"

const text = copy.summary

type SummaryProps = { rows: MissionRow[]; nowMs: number; selectedId: string | null; onSelect: (id: string) => void }

/** Las cifras del conjunto y el cronograma: cada misión en su fecha, con su estadía y su estado. */
export function Summary({ rows, nowMs, selectedId, onSelect }: SummaryProps) {
  const ok = rows.filter((r) => r.state === "ok").length
  const bad = rows.filter((r) => r.state === "bad").length
  const next = rows.filter((r) => r.mission.landingMs >= nowMs).sort((a, b) => a.mission.landingMs - b.mission.landingMs)[0]

  // El cronograma va de este mes a un mes después del último aterrizaje, con un mínimo de doce meses.
  const now = new Date(nowMs)
  const first = Math.min(nowMs, ...rows.map((r) => r.mission.landingMs))
  const last = Math.max(nowMs, ...rows.map((r) => r.mission.landingMs + r.mission.stayDays * DAY_MS))
  const start = new Date(first)
  const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth()
  const end = new Date(last)
  const months = Math.max(12, end.getUTCFullYear() * 12 + end.getUTCMonth() - startMonth + 2)
  const monthMs = (index: number) => Date.UTC(Math.floor((startMonth + index) / 12), (startMonth + index) % 12, 1)
  const fromMs = monthMs(0)
  const toMs = monthMs(months)
  const at = (ms: number) => `${((ms - fromMs) / (toMs - fromMs)) * 100}%`
  const every = Math.ceil(months / 14)

  return (
    <div className="db-summary">
      <dl className="db-kpis">
        <div>
          <dt>{text.missions}</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>{text.onPlan}</dt>
          <dd>{ok}</dd>
        </div>
        <div data-alert={bad > 0}>
          <dt>{text.needAttention}</dt>
          <dd>{bad}</dd>
        </div>
        <div>
          <dt>{text.nextLanding}</dt>
          <dd>{next ? span(next.mission.landingMs - nowMs) : "–"}</dd>
        </div>
      </dl>

      <div className="db-schedule" role="group" aria-label={text.schedule}>
        <div className="db-schedule__months" aria-hidden="true">
          {Array.from({ length: months }, (_, i) => {
            const month = (startMonth + i) % 12
            return (
              <span key={i} style={{ left: at(monthMs(i)) }} data-year={month === 0 || i === 0}>
                {i % every === 0 ? `${text.months[month]}${month === 0 || i === 0 ? ` ${Math.floor((startMonth + i) / 12)}` : ""}` : ""}
              </span>
            )
          })}
        </div>
        <div className="db-schedule__track">
          <i className="db-schedule__now" style={{ left: at(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) }} title={text.today} />
          {rows.map((r) => (
            <button
              key={r.mission.id}
              type="button"
              className="db-schedule__mission"
              data-state={r.state}
              aria-pressed={r.mission.id === selectedId}
              style={{ left: at(r.mission.landingMs), width: `max(8px, ${((r.mission.stayDays * DAY_MS) / (toMs - fromMs)) * 100}%)` }}
              title={text.mission(r.mission.name, stamp(r.mission.landingMs), r.mission.stayDays)}
              onClick={() => onSelect(r.mission.id)}
            >
              <b>{r.mission.name}</b>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
