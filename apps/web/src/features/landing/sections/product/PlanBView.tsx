import { tr } from "@/shared/i18n"
import { software } from "../../content"
import product from "../data/product.json"
import { type Figures, percent, verdictOf } from "./sky"

const copy = software.planb
const plan = product.planB
const verdicts = software.compare.verdicts

const date = (iso: string) => new Date(iso).toLocaleDateString(tr("en-GB", "es-ES"), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
const signed = (value: number, unit: string) => `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value) % 1 === 0 ? Math.abs(value).toFixed(0) : Math.abs(value).toFixed(1)}${unit}`

const ROWS: Array<{ name: string; detail: string; figures: Figures }> = [
  { name: copy.move, detail: tr(`${plan.move.distanceM} m, to ${plan.move.to}`, `${plan.move.distanceM} m, hasta ${plan.move.to}`), figures: plan.move.figures },
  { name: copy.wait, detail: tr(`Same site, from ${date(plan.wait.startUTC)}`, `Mismo sitio, desde el ${date(plan.wait.startUTC)}`), figures: plan.wait.figures },
  { name: copy.mast, detail: tr("Same site, same date", "Mismo sitio, misma fecha"), figures: plan.mast.figures },
]

/** La pantalla "Plan B": lo que cambia cada salida frente al plan original, con las cifras del motor. */
export function PlanBView() {
  const base: Figures = plan.baseline
  const cells = (f: Figures, compare: boolean) => (
    <>
      {(["sunPct", "earthPct", "bothPct"] as const).map((key, i) => (
        <td key={key} data-label={copy.columns[i + 1]}>
          <strong>{percent(f[key])}</strong>
          {compare && <small data-up={f[key] >= base[key]}>{signed(Number((f[key] - base[key]).toFixed(1)), " pts")}</small>}
        </td>
      ))}
      <td data-label={copy.columns[4]}>
        <strong>{Math.round(f.longestNightH)} h</strong>
        {compare && <small data-up={f.longestNightH <= base.longestNightH}>{signed(Math.round(f.longestNightH - base.longestNightH), " h")}</small>}
      </td>
      <td data-label={copy.columns[5]}>
        <span className="sw-chip" data-state={verdictOf(f) === "viable" ? "on" : verdictOf(f) === "limited" ? "limited" : "off"}>
          {verdicts[verdictOf(f)]}
        </span>
      </td>
    </>
  )

  return (
    <div className="sw-view sw-planb">
      <header className="sw-view__head">
        <h3 className="sw-view__title">{copy.title}</h3>
      </header>
      <p className="sw-lede">{copy.body}</p>

      <div className="sw-scroll">
        <table className="sw-table sw-table--plan">
          <thead>
            <tr>
              {copy.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="sw-plan__base">
              <th scope="row">
                <span className="sw-label">{copy.baselineTag}</span>
                {copy.baseline}
              </th>
              {cells(base, false)}
            </tr>
            {ROWS.map((row) => (
              <tr key={row.name}>
                <th scope="row">
                  {row.name}
                  <small>{row.detail}</small>
                </th>
                {cells(row.figures, true)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sw-note">{software.compare.thresholds}</p>
    </div>
  )
}
