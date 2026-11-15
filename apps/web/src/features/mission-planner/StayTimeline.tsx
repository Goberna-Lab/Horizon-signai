import { useMemo, useRef } from "react"
import { copy } from "./copy"
import { against, DAY_MS, HOUR_MS, hours, margenSol, margenTierra, shortDay, stamp, type Evaluation, type Ventana } from "@/shared/planning"

/**
 * La estadía en el tiempo: tres filas (Sol, Tierra y los dos a la vez) con color donde se ven y rayado donde no, y
 * debajo, en su propio eje, cuántos grados queda cada uno sobre el relieve. Las noches llevan su duración y, si
 * pasan de lo que aguanta la batería, la marca de dónde se agota. Al pasar el puntero se elige un instante: el
 * mapa gira sus flechas y aquí se lee el valor.
 */

type StayTimelineProps = {
  evaluation: Evaluation
  batteryH: number
  cursorMs: number
  onCursor: (ms: number) => void
  /** Nombre del archivo CSV. */
  name: string
}

const copyOf = copy.timeline
/** Puntos de las curvas: de sobra para el ancho de la pantalla. */
const CHART_POINTS = 600

/** Los tramos sin el cuerpo a la vista dentro de la estadía. */
function gaps(windows: Ventana[], fromMs: number, toMs: number): Ventana[] {
  const out: Ventana[] = []
  let t = fromMs
  for (const w of windows) {
    if (w.inicioMs > t) out.push({ inicioMs: t, finMs: w.inicioMs })
    t = Math.max(t, w.finMs)
  }
  if (toMs > t) out.push({ inicioMs: t, finMs: toMs })
  return out
}

export function StayTimeline({ evaluation, batteryH, cursorMs, onCursor, name }: StayTimelineProps) {
  const { fromMs, toMs, sweep, windows } = evaluation
  const length = toMs - fromMs
  const over = useRef<HTMLDivElement>(null)
  const left = (ms: number) => `${((ms - fromMs) / length) * 100}%`
  const width = (w: Ventana) => `${((w.finMs - w.inicioMs) / length) * 100}%`

  const chart = useMemo(() => {
    const stride = Math.max(1, Math.ceil(sweep.n / CHART_POINTS))
    let low = -1
    let high = 1
    const sun: Array<[number, number]> = []
    const earth: Array<[number, number]> = []
    for (let k = 0; k < sweep.n; k += stride) {
      const x = (k / (sweep.n - 1)) * 1000
      const s = margenSol(sweep.solSobreHorizonte[k])
      const e = margenTierra(sweep.tierraSobreHorizonte[k])
      sun.push([x, s])
      earth.push([x, e])
      low = Math.min(low, s, e)
      high = Math.max(high, s, e)
    }
    const pad = (high - low) * 0.08
    low -= pad
    high += pad
    const y = (value: number) => ((high - value) / (high - low)) * 100
    const line = (points: Array<[number, number]>) => points.map(([x, value]) => `${x.toFixed(1)},${y(value).toFixed(2)}`).join(" ")
    const area = (points: Array<[number, number]>) => `0,${y(0).toFixed(2)} ${line(points)} 1000,${y(0).toFixed(2)}`
    return { low, high, zero: y(0), sun: line(sun), earth: line(earth), sunArea: area(sun), earthArea: area(earth) }
  }, [sweep])

  const sunGaps = gaps(windows.sun, fromMs, toMs)
  const earthGaps = gaps(windows.earth, fromMs, toMs)
  const days = Math.round(length / DAY_MS)
  const every = Math.max(1, Math.ceil(days / 8))
  const ticks = Array.from({ length: days + 1 }, (_, d) => d).filter((d) => d % every === 0)

  const cursor = Math.min(Math.max(cursorMs, fromMs), toMs)
  const k = Math.min(Math.round((cursor - fromMs) / sweep.pasoMs), sweep.n - 1)
  const sunNow = margenSol(sweep.solSobreHorizonte[k])
  const earthNow = margenTierra(sweep.tierraSobreHorizonte[k])

  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = over.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    // Con el dedo hay que tocar; con el ratón basta pasar.
    if (event.pointerType !== "mouse" && event.type === "pointermove" && event.buttons === 0) return
    const f = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1)
    onCursor(fromMs + Math.round((f * length) / sweep.pasoMs) * sweep.pasoMs)
  }
  // Con el teclado: flechas de hora en hora, Re Pág y Av Pág de día en día.
  const keys = (event: React.KeyboardEvent) => {
    const jump: Record<string, number> = { ArrowLeft: -HOUR_MS, ArrowRight: HOUR_MS, ArrowDown: -HOUR_MS, ArrowUp: HOUR_MS, PageDown: -DAY_MS, PageUp: DAY_MS }
    if (event.key === "Home") onCursor(fromMs)
    else if (event.key === "End") onCursor(toMs)
    else if (event.key in jump) onCursor(Math.min(Math.max(cursor + jump[event.key], fromMs), toMs))
    else return
    event.preventDefault()
  }

  const exportCsv = () => {
    const rows = ["time_utc,sun_upper_edge_above_terrain_deg,earth_centre_above_terrain_deg,sun_in_view,earth_in_view,panel_w_m2"]
    for (let i = 0; i < sweep.n; i++) {
      const s = margenSol(sweep.solSobreHorizonte[i])
      const e = margenTierra(sweep.tierraSobreHorizonte[i])
      rows.push(`${new Date(fromMs + i * sweep.pasoMs).toISOString()},${s.toFixed(3)},${e.toFixed(3)},${s > 0 ? 1 : 0},${e > 0 ? 1 : 0},${Math.round(sweep.panelWm2[i])}`)
    }
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "mission"}-stay.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const gapLabel = (gap: Ventana, body: string) => {
    const share = (gap.finMs - gap.inicioMs) / length
    if (share < 0.16) return null
    return <em>{copyOf.without(hours((gap.finMs - gap.inicioMs) / HOUR_MS), body)}</em>
  }

  return (
    <section className="pl-tl" aria-label={copyOf.title}>
      <header className="pl-tl__head">
        <h3 className="ui-label">{copyOf.title}</h3>
        <ul className="ui-keys" aria-hidden="true">
          <li data-key="sun">{copyOf.key.sun}</li>
          <li data-key="earth">{copyOf.key.earth}</li>
          <li data-key="both">{copyOf.key.both}</li>
          <li data-key="none">{copyOf.key.none}</li>
        </ul>
        <button type="button" className="ui-btn ui-btn--small" onClick={exportCsv}>
          {copyOf.csv}
        </button>
      </header>

      <div className="pl-tl__body">
        <div className="pl-tl__names" aria-hidden="true">
          <span>{copyOf.sun}</span>
          <span>{copyOf.earth}</span>
          <span>{copyOf.both}</span>
          <span className="pl-tl__names-chart">
            {copyOf.margin}
            <small>{chart.high.toFixed(0)}°</small>
            <small style={{ top: `${chart.zero}%` }}>0°</small>
            <small data-end="true">{chart.low.toFixed(0)}°</small>
          </span>
        </div>

        <div className="pl-tl__plot">
          <div className="pl-tl__row" data-body="sun">
            {windows.sun.map((w) => (
              <i key={w.inicioMs} style={{ left: left(w.inicioMs), width: width(w) }} />
            ))}
            {sunGaps.map((gap) => {
              const tooLong = (gap.finMs - gap.inicioMs) / HOUR_MS > batteryH
              return (
                <span key={gap.inicioMs} className="pl-tl__gap" data-over={tooLong} style={{ left: left(gap.inicioMs), width: width(gap) }}>
                  {gapLabel(gap, copyOf.sun)}
                  {tooLong && <u style={{ left: `${((batteryH * HOUR_MS) / (gap.finMs - gap.inicioMs)) * 100}%` }} title={`Battery empty after ${hours(batteryH)} without Sun`} />}
                </span>
              )
            })}
          </div>
          <div className="pl-tl__row" data-body="earth">
            {windows.earth.map((w) => (
              <i key={w.inicioMs} style={{ left: left(w.inicioMs), width: width(w) }} />
            ))}
            {earthGaps.map((gap) => (
              <span key={gap.inicioMs} className="pl-tl__gap" style={{ left: left(gap.inicioMs), width: width(gap) }}>
                {gapLabel(gap, copyOf.earth)}
              </span>
            ))}
          </div>
          <div className="pl-tl__row" data-body="both">
            {windows.both.map((w) => (
              <i key={w.inicioMs} style={{ left: left(w.inicioMs), width: width(w) }} />
            ))}
          </div>

          <div className="pl-tl__chart">
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id="pl-tl-above">
                  <rect x="0" y="0" width="1000" height={chart.zero} />
                </clipPath>
              </defs>
              <polygon className="pl-tl__area" data-body="earth" points={chart.earthArea} clipPath="url(#pl-tl-above)" />
              <polygon className="pl-tl__area" data-body="sun" points={chart.sunArea} clipPath="url(#pl-tl-above)" />
              <line className="pl-tl__zero" x1="0" x2="1000" y1={chart.zero} y2={chart.zero} />
              <polyline className="pl-tl__curve" data-body="earth" points={chart.earth} />
              <polyline className="pl-tl__curve" data-body="sun" points={chart.sun} />
            </svg>
          </div>

          <div className="pl-tl__axis" aria-hidden="true">
            {ticks.map((d) => (
              <span key={d} style={{ left: `${(d / days) * 100}%` }} data-edge={d === 0 ? "start" : d === days ? "end" : undefined}>
                {shortDay(fromMs + d * DAY_MS)}
              </span>
            ))}
          </div>

          <div
            className="pl-tl__over"
            ref={over}
            onPointerDown={point}
            onPointerMove={point}
            onKeyDown={keys}
            tabIndex={0}
            role="slider"
            aria-label="Moment of the stay"
            aria-valuemin={0}
            aria-valuemax={Math.round(length / HOUR_MS)}
            aria-valuenow={Math.round((cursor - fromMs) / HOUR_MS)}
            aria-valuetext={stamp(cursor)}
          >
            <div className="pl-tl__cursor" style={{ left: left(cursor) }} />
          </div>
        </div>
      </div>

      <p className="pl-tl__read" aria-live="off">
        <strong>{cursor === fromMs ? `${copyOf.landing} · ${stamp(cursor)}` : stamp(cursor)}</strong>
        <span data-body="sun" data-seen={sunNow > 0}>
          {copyOf.sun} {against(sunNow)}
        </span>
        <span data-body="earth" data-seen={earthNow > 0}>
          {copyOf.earth} {against(earthNow)}
        </span>
        <span>
          {copyOf.panel} {Math.round(sweep.panelWm2[k])} W/m²
        </span>
      </p>
    </section>
  )
}
