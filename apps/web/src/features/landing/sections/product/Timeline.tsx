import { useRef } from "react"
import { LAST, stamp } from "./sky"

type TimelineProps = {
  windows: { sun: number[][]; earth: number[][] }
  t: number
  onTime: (t: number) => void
  names: { sun: string; earth: string }
  now: string
}

const DAYS = [0, 5, 10, 15, 20, 25]

/** Ventanas de Sol y de Tierra en el día lunar: color donde se ven y rayado donde no. Se arrastra para elegir la hora. */
export function Timeline({ windows, t, onTime, names, now }: TimelineProps) {
  const plot = useRef<HTMLDivElement>(null)
  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons === 0) return
    const box = plot.current?.getBoundingClientRect()
    if (!box) return
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId)
    onTime(((event.clientX - box.left) / box.width) * LAST)
  }
  // Con el teclado: flechas de 3 en 3 horas, Re Pág y Av Pág de día en día.
  const keys = (event: React.KeyboardEvent) => {
    const jump: Record<string, number> = { ArrowLeft: -3, ArrowRight: 3, ArrowDown: -3, ArrowUp: 3, PageDown: -24, PageUp: 24 }
    if (event.key === "Home") onTime(0)
    else if (event.key === "End") onTime(LAST)
    else if (event.key in jump) onTime(t + jump[event.key])
    else return
    event.preventDefault()
  }
  const bars = (list: number[][]) =>
    list
      .filter(([a]) => a < LAST)
      .map(([a, b]) => <i key={a} style={{ left: `${(a / LAST) * 100}%`, width: `${((Math.min(b, LAST) - a) / LAST) * 100}%` }} />)

  return (
    <div className="sw-time">
      <div className="sw-time__names" aria-hidden="true">
        <span>{names.sun}</span>
        <span>{names.earth}</span>
      </div>
      <div
        className="sw-time__plot"
        ref={plot}
        onPointerDown={drag}
        onPointerMove={drag}
        onKeyDown={keys}
        tabIndex={0}
        role="slider"
        aria-label="Mission time"
        aria-valuemin={0}
        aria-valuemax={LAST}
        aria-valuenow={Math.round(t)}
        aria-valuetext={stamp(t)}
      >
        <div className="sw-time__bar" data-body="sun">
          {bars(windows.sun)}
        </div>
        <div className="sw-time__bar" data-body="earth">
          {bars(windows.earth)}
        </div>
        <div className="sw-time__axis" aria-hidden="true">
          {DAYS.map((d) => (
            <span key={d} style={{ left: `${((d * 24) / LAST) * 100}%` }}>
              {d} d
            </span>
          ))}
          <span style={{ left: "100%" }} data-end="true">
            29.5 d
          </span>
        </div>
        <div className="sw-time__now" style={{ left: `${(t / LAST) * 100}%` }}>
          <span>{now}</span>
        </div>
      </div>
    </div>
  )
}
