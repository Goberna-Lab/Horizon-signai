import { hours, percent, shortDay, span, type MissionRow } from "@/shared/planning"
import { copy } from "./copy"

/** Cuánto Sol y cuánta Tierra tiene la misión elegida, y cuánto falta desde el aterrizaje para que cambien. */
export function SunLink({ row }: { row: MissionRow | null }) {
  const evaluation = row?.evaluation
  if (!row || !evaluation) {
    return (
      <section className="ui-card db-sunlink" aria-label={copy.link.title}>
        <header className="ui-card__head">
          <h2 className="ui-label">{copy.link.title}</h2>
        </header>
        <p className="ui-card__empty">{row ? copy.list.wait : copy.link.empty}</p>
      </section>
    )
  }
  const { figures, landing, fromMs } = evaluation
  const meters = [
    { key: "sun", label: copy.link.sun, pct: figures.sunPct, h: figures.sunH },
    { key: "earth", label: copy.link.earth, pct: figures.earthPct, h: figures.earthH },
    { key: "both", label: copy.link.both, pct: figures.bothPct, h: figures.bothH },
  ]
  const countdown = (visible: boolean, changeMs: number | null, labels: { set: string; rise: string; always: string }) => (
    <div>
      <dt>{changeMs === null ? labels.always : visible ? labels.set : labels.rise}</dt>
      <dd>{changeMs === null ? <small>{copy.link.noChange(visible)}</small> : span(changeMs - fromMs)}</dd>
      {changeMs !== null && (
        <dd className="db-count__date">
          {shortDay(changeMs)}, {copy.link.fromLanding}
        </dd>
      )}
    </div>
  )
  return (
    <section className="ui-card db-sunlink" aria-label={copy.link.title}>
      <header className="ui-card__head">
        <h2 className="ui-label">{copy.link.title}</h2>
        <span className="ui-card__sub">
          {row.mission.name} · {copy.link.ofStay(row.mission.stayDays)}
        </span>
      </header>
      <div className="db-meters">
        {meters.map((m) => (
          <div key={m.key} className="db-meter" data-body={m.key}>
            <p>
              <span>{m.label}</span>
              <strong>
                {percent(m.pct)} <small>{hours(m.h)}</small>
              </strong>
            </p>
            <div className="db-meter__bar" role="img" aria-label={`${m.label}: ${percent(m.pct)}`}>
              <i style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
      <dl className="db-count">
        {countdown(landing.sunMarginDeg > 0, landing.sunChangeMs, { set: copy.link.sunSet, rise: copy.link.sunRise, always: copy.link.sunAlways })}
        {countdown(landing.earthMarginDeg > 0, landing.earthChangeMs, { set: copy.link.earthSet, rise: copy.link.earthRise, always: copy.link.earthAlways })}
      </dl>
    </section>
  )
}
