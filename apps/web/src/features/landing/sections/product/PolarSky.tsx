import { useId, useMemo } from "react"
import { tr } from "@/shared/i18n"
import { at, type Body, inside } from "./sky"

/**
 * El cielo del sitio en polar, como lo dibuja el software: el rumbo va alrededor (norte arriba, este a la
 * derecha) y la elevación hacia el centro. El anillo oscuro es lo que el relieve tapa; el Sol y la Tierra
 * recorren su trayectoria del día lunar y quedan ocultos cuando entran en el anillo.
 */

const CX = 300
const CY = 290
const R = 200
/** Elevación en el borde y en el centro (grados): solo se dibuja el cielo bajo, que es donde pasa todo. */
const RIM = -5
const CENTRE = 15

const radius = (el: number) => (R * (CENTRE - Math.min(Math.max(el, RIM), CENTRE))) / (CENTRE - RIM)
function point(az: number, el: number, r = radius(el)): [number, number] {
  const a = (az * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
}
const xy = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`

/** Anillo de terreno: del borde hasta el horizonte real de cada rumbo. */
function ring(horizon: number[]): string {
  let d = `M${CX} ${CY - R}A${R} ${R} 0 1 1 ${CX - 0.01} ${CY - R}Z`
  for (let az = 0; az < 360; az++) d += `${az === 0 ? "M" : "L"}${xy(point(az, horizon[az]))}`
  return `${d}Z`
}

function outline(horizon: number[]): string {
  let d = ""
  for (let az = 0; az < 360; az++) d += `${az === 0 ? "M" : "L"}${xy(point(az, horizon[az]))}`
  return `${d}Z`
}

/** Trayectoria partida en lo que se ve y lo que queda tras el relieve. */
function track(body: Body, step: number, windows?: number[][]): { seen: string; hidden: string } {
  const out = { seen: "", hidden: "" }
  let open: "seen" | "hidden" | null = null
  for (let i = 0; i < body.az.length - 1; i++) {
    const key = !windows || inside(windows, (i + 0.5) * step) ? "seen" : "hidden"
    if (open !== key) out[key] += `M${xy(point(body.az[i], body.el[i]))}`
    out[key] += `L${xy(point(body.az[i + 1], body.el[i + 1]))}`
    open = key
  }
  return out
}

const AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315]
/** Los puntos cardinales: en español el oeste es "O". */
const COMPASS: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: tr("W", "O") }
const RINGS = [0, 5, 10]

type PolarSkyProps = {
  horizon: number[]
  /** Segundo horizonte, a trazos (por ejemplo, el del mástil). */
  other?: number[]
  sun?: Body
  earth?: Body
  /** Horas entre muestras de las trayectorias. */
  step?: number
  windows?: { sun: number[][]; earth: number[][] }
  /** Hora del día lunar: si se indica, se dibujan el Sol y la Tierra en ese instante. */
  t?: number
  variant?: "full" | "mini"
  below?: string
  label: string
}

export function PolarSky({ horizon, other, sun, earth, step = 1, windows, t, variant = "full", below, label }: PolarSkyProps) {
  const id = useId()
  const full = variant === "full"
  const open = horizon.indexOf(Math.min(...horizon))
  const paths = useMemo(
    () => ({
      ring: ring(horizon),
      other: other ? outline(other) : "",
      sun: sun ? track(sun, step, windows?.sun) : null,
      earth: earth ? track(earth, step, windows?.earth) : null,
    }),
    [horizon, other, sun, earth, step, windows],
  )

  const marker = (body: Body | undefined, visible: boolean, name: string, kind: "sun" | "earth") => {
    if (!body || t === undefined) return null
    const [az, el] = at(body, t / step)
    const p = point(az, el)
    const a = (az * Math.PI) / 180
    const right = Math.sin(a) >= 0
    const tip = point(az, 0, R + 8)
    const text = point(az, 0, R + 30)
    return (
      <g className={`sw-polar__body sw-polar__body--${kind}`} data-seen={visible}>
        {full && <line x1={p[0]} y1={p[1]} x2={tip[0]} y2={tip[1]} />}
        <circle cx={p[0]} cy={p[1]} r={full ? 8 : 13} />
        {full && (
          <text x={text[0] + (right ? 6 : -6)} y={text[1] + (Math.cos(a) > 0.5 ? -14 : Math.cos(a) < -0.5 ? 22 : 5)} textAnchor={right ? "start" : "end"}>
            {name} {el.toFixed(1)}°
          </text>
        )}
      </g>
    )
  }

  return (
    <svg className={`sw-polar sw-polar--${variant}`} viewBox="0 0 600 580" role="img" aria-label={label}>
      <circle className="sw-polar__sky" cx={CX} cy={CY} r={R} />
      {RINGS.map((el) => (
        <circle key={el} className={el === 0 ? "sw-polar__level" : "sw-polar__ring"} cx={CX} cy={CY} r={radius(el)} />
      ))}
      <path className="sw-polar__centre" d={`M${CX - 7} ${CY}H${CX + 7}M${CX} ${CY - 7}V${CY + 7}`} />

      <path className="sw-polar__terrain" d={paths.ring} fillRule="evenodd" />
      {paths.other && <path className="sw-polar__other" d={paths.other} />}
      <circle className="sw-polar__rim" cx={CX} cy={CY} r={R} />

      {paths.sun && <path className="sw-polar__path sw-polar__path--sun" data-hidden="true" d={paths.sun.hidden} />}
      {paths.earth && <path className="sw-polar__path sw-polar__path--earth" data-hidden="true" d={paths.earth.hidden} />}
      {paths.sun && <path className="sw-polar__path sw-polar__path--sun" d={paths.sun.seen} />}
      {paths.earth && <path className="sw-polar__path sw-polar__path--earth" d={paths.earth.seen} />}

      {full && below && (
        <>
          <path id={`${id}-top`} d={`M${xy(point(304, 0, R - 15))}A${R - 15} ${R - 15} 0 0 1 ${xy(point(56, 0, R - 15))}`} fill="none" />
          <path id={`${id}-bottom`} d={`M${xy(point(236, 0, R - 9))}A${R - 9} ${R - 9} 0 0 0 ${xy(point(124, 0, R - 9))}`} fill="none" />
          {["top", "bottom"].map((side) => (
            <text key={side} className="sw-polar__below">
              <textPath href={`#${id}-${side}`} startOffset="50%" textAnchor="middle">
                {below}
              </textPath>
            </text>
          ))}
        </>
      )}

      {AZIMUTHS.filter((az) => full || az % 90 === 0).map((az) => {
        const a = point(az, 0, R)
        const b = point(az, 0, R + 7)
        const c = point(az, 0, R + (full ? 23 : 30))
        return (
          <g key={az}>
            <line className="sw-polar__tick" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
            <text className="sw-polar__az" x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="middle">
              {COMPASS[az] ?? `${az}°`}
            </text>
          </g>
        )
      })}
      {full &&
        RINGS.filter((el) => el > horizon[open] + 0.4).map((el) => {
          // Los rótulos de elevación van por el rumbo más despejado, donde siempre hay cielo.
          const p = point(open, el)
          return (
            <text key={el} className="sw-polar__el" x={p[0]} y={p[1] + 4}>
              {el}°
            </text>
          )
        })}

      {marker(earth, !windows || t === undefined || inside(windows.earth, t), tr("Earth", "Tierra"), "earth")}
      {marker(sun, !windows || t === undefined || inside(windows.sun, t), tr("Sun", "Sol"), "sun")}
    </svg>
  )
}
