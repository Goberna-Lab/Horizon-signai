import { useState } from "react"
import { tr } from "@/shared/i18n"
import { months as copy, software } from "../../content"
import facts from "../../flight/data/facts.json"

const months = facts.months as Array<[number, number, number]>
const sun = months.map((m) => m[1])
const low = Math.min(...sun)
const high = Math.max(...sun)
const year = (ms: number) => new Date(ms).getUTCFullYear()
const date = (ms: number) => new Date(ms).toLocaleDateString(tr("en-GB", "es-ES"), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/** La pantalla "Calendario": Sol y Tierra a la vista en cada mes lunar de 2026 a 2030, en el mismo sitio. */
export function CalendarView() {
  const [active, setActive] = useState<number | null>(null)
  const shown = active === null ? null : months[active]

  return (
    <div className="sw-view sw-calendar">
      <header className="sw-view__head">
        <h3 className="sw-view__title">{software.calendar.title}</h3>
        <span className="sw-field">{tr("2026 to 2030", "2026 a 2030")}</span>
      </header>
      <p className="sw-lede">{copy.body}</p>

      <figure className="sw-months">
        <p className="sw-months__readout" aria-live="polite">
          {shown ? (
            <>
              <span className="sw-label">{tr(`Lunar month from ${date(shown[0])}`, `Mes lunar desde el ${date(shown[0])}`)}</span>
              <strong data-key="sun">{shown[1]}%</strong>
              <span className="sw-label">{copy.sun}</span>
              <strong data-key="earth">{shown[2]}%</strong>
              <span className="sw-label">{copy.earth}</span>
            </>
          ) : (
            <span className="sw-label">{copy.hint}</span>
          )}
        </p>
        <div className="sw-months__plot" role="img" aria-label={tr(`${copy.caption}. The Sun is in view between ${low}% and ${high}% of each month.`, `${copy.caption}. El Sol está a la vista entre el ${low}% y el ${high}% de cada mes.`)} onPointerLeave={() => setActive(null)}>
          {months.map(([start, sunPct, earthPct], i) => (
            <div key={start} className="sw-months__slot" data-active={active === i} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}>
              <div className="sw-months__bar" style={{ height: `${sunPct}%` }} />
              <i style={{ bottom: `${earthPct}%` }} />
            </div>
          ))}
        </div>
        <div className="sw-months__axis" aria-hidden="true">
          {months.map(([start], i) => (
            <span key={start}>{i === 0 || year(start) !== year(months[i - 1][0]) ? year(start) : ""}</span>
          ))}
        </div>
        <figcaption className="sw-months__caption">
          <span className="sw-label">{copy.caption}</span>
          <span className="sw-key" data-key="sun">
            {copy.sun}, {tr(`${low}% to ${high}%`, `${low}% a ${high}%`)}
          </span>
          <span className="sw-key" data-key="earth-line">
            {copy.earth}
          </span>
        </figcaption>
      </figure>
    </div>
  )
}
