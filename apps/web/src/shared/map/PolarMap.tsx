import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import { plate, sites, type Site } from "@/shared/planning"
import "./map.css"

/**
 * El mapa del polo sur: la lámina de relieve (LOLA) en estereográfica polar, con la retícula a la vista, los
 * lugares del catálogo y una marca por misión. En la lista encuadra todas las misiones; con una misión abierta se
 * acerca a su lugar y dibuja hacia dónde quedan el Sol y la Tierra en el instante elegido.
 *
 * La lámina y todo lo que va sobre ella viven en una capa de 1000 × 1000 px que se mueve con una sola
 * transformación (`--pmap-zoom`, `--pmap-tx`, `--pmap-ty`, registradas en map.css para que la transición las
 * interpole). Las marcas se anclan en puntos sin tamaño y deshacen la escala: así no crecen al acercar.
 */

export type MapPin = { id: string; name: string; site: Site; state: "ok" | "bad" | "wait" }
/** Rumbo en el mapa (grados desde arriba, en sentido horario) y si se ve cada cuerpo. */
export type MapSky = { sunBearingDeg: number; sunVisible: boolean; earthBearingDeg: number; earthVisible: boolean }

type PolarMapProps = {
  pins: MapPin[]
  selectedId: string | null
  /** Misión abierta en el detalle. */
  focusId: string | null
  sky: MapSky | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
}

const copy = {
  title: "Lunar south pole",
  earth: "Toward Earth",
  alt: "Shaded relief of the lunar south pole, drawn from LOLA elevation.",
  sun: "Sun",
  earthBody: "Earth",
  pole: "South pole",
}

/** Lado de la capa en px. La lámina mide `plate.sizeKm` de lado. */
const BASE = 1000
const RADIUS_KM = 1737.4
const u = (xKm: number) => ((xKm - plate.xMinKm) / plate.sizeKm) * BASE
const v = (yKm: number) => ((plate.yMaxKm - yKm) / plate.sizeKm) * BASE
/** Distancia al polo en la proyección (km) de un paralelo a `colatitude` grados del polo: ρ = 2R·tan(c/2). */
const rho = (colatitudeDeg: number) => 2 * RADIUS_KM * Math.tan((colatitudeDeg * Math.PI) / 360)
const PARALLELS = [1, 2, 3, 4, 5, 6]
const MERIDIANS = Array.from({ length: 12 }, (_, i) => i * 30)
const PLACES = sites.filter((s) => s.kind !== "roi")

/** Ancho en km que se ve con una misión abierta. */
const FOCUS_SPAN_KM = 90
/** Ancho mínimo en km de la vista general. */
const OVERVIEW_SPAN_KM = 150

type View = { zoom: number; tx: number; ty: number }

function viewOf(width: number, height: number, pins: MapPin[], focus: Site | null): View {
  let cx = -3
  let cy = -3
  let spanKm = OVERVIEW_SPAN_KM
  if (focus) {
    cx = focus.xKm
    cy = focus.yKm
    spanKm = FOCUS_SPAN_KM
  } else if (pins.length > 0) {
    const xs = pins.map((p) => p.site.xKm)
    const ys = pins.map((p) => p.site.yKm)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    // Las misiones caben a lo ancho y a lo alto, con aire para sus rótulos.
    spanKm = Math.max(OVERVIEW_SPAN_KM, (x1 - x0) * 1.7, (y1 - y0) * 1.7 * (width / height))
  }
  // La lámina siempre cubre el visor: ni se aleja más que su lado ni deja ver sus bordes.
  const zoom = Math.max(width / ((spanKm / plate.sizeKm) * BASE), width / BASE, height / BASE)
  const clamp = (value: number, low: number) => Math.min(0, Math.max(low, value))
  return { zoom, tx: clamp(width / 2 - u(cx) * zoom, width - BASE * zoom), ty: clamp(height / 2 - v(cy) * zoom, height - BASE * zoom) }
}

/** Largo de la barra de escala: el valor redondo que da entre 56 y 140 px. */
function scaleBar(pxPerKm: number): { km: number; px: number } {
  const km = [2, 5, 10, 20, 50, 100].find((value) => value * pxPerKm >= 56) ?? 100
  return { km, px: km * pxPerKm }
}

export function PolarMap({ pins, selectedId, focusId, sky, onSelect, onOpen }: PolarMapProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // La transición se enciende después del primer encuadre: si no, el mapa entraría volando desde la esquina.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))
    return () => {
      observer.disconnect()
      cancelAnimationFrame(id)
    }
  }, [])

  const focus = pins.find((p) => p.id === focusId) ?? null
  const view = useMemo(() => viewOf(size.width || 1, size.height || 1, pins, focus?.site ?? null), [size, pins, focus])
  const bar = scaleBar((view.zoom * BASE) / plate.sizeKm)
  const pole = { x: u(0), y: v(0) }
  const style = { "--pmap-zoom": view.zoom, "--pmap-tx": `${view.tx}px`, "--pmap-ty": `${view.ty}px` } as CSSProperties
  // Los lugares del catálogo que ya llevan la marca de una misión no repiten su nombre.
  const taken = new Set(pins.map((p) => p.site.id))

  return (
    <div className="pmap" ref={frame} data-ready={ready} data-focus={focus ? "true" : "false"}>
      {size.width > 0 && (
        <div className="pmap__world" style={style}>
          <img src={plate.url} alt={copy.alt} width={plate.px} height={plate.px} decoding="async" draggable={false} />
          <svg className="pmap__grid" viewBox={`0 0 ${BASE} ${BASE}`} aria-hidden="true">
            {PARALLELS.map((c) => (
              <circle key={c} cx={pole.x} cy={pole.y} r={(rho(c) / plate.sizeKm) * BASE} />
            ))}
            {MERIDIANS.map((lon) => {
              const a = (lon * Math.PI) / 180
              return <line key={lon} x1={pole.x} y1={pole.y} x2={u(Math.sin(a) * 400)} y2={v(Math.cos(a) * 400)} />
            })}
          </svg>

          {PARALLELS.map((c) => (
            <span key={c} className="pmap-anchor pmap__lat" style={{ left: u(rho(c) * Math.SQRT1_2), top: v(-rho(c) * Math.SQRT1_2) }} aria-hidden="true">
              <b>{90 - c}° S</b>
            </span>
          ))}
          <span className="pmap-anchor pmap__pole" style={{ left: pole.x, top: pole.y }} aria-hidden="true">
            <i />
            <b>{copy.pole}</b>
          </span>

          {PLACES.filter((s) => !taken.has(s.id)).map((s) => (
            <span key={s.id} className="pmap-anchor pmap-place" style={{ left: u(s.xKm), top: v(s.yKm) }} aria-hidden="true">
              <i />
              <b>{s.name}</b>
            </span>
          ))}

          {focus && sky && (
            <span className="pmap-anchor pmap-rays" style={{ left: u(focus.site.xKm), top: v(focus.site.yKm) }} aria-hidden="true">
              <i className="pmap-ray" data-body="earth" data-seen={sky.earthVisible} style={{ transform: `rotate(${sky.earthBearingDeg}deg)` }}>
                <b style={{ transform: `translate(-50%, -50%) rotate(${-sky.earthBearingDeg}deg)` }}>{copy.earthBody}</b>
              </i>
              <i className="pmap-ray" data-body="sun" data-seen={sky.sunVisible} style={{ transform: `rotate(${sky.sunBearingDeg}deg)` }}>
                <b style={{ transform: `translate(-50%, -50%) rotate(${-sky.sunBearingDeg}deg)` }}>{copy.sun}</b>
              </i>
            </span>
          )}

          {pins.map((pin) => (
            <span key={pin.id} className="pmap-anchor pmap-pin" data-state={pin.state} data-selected={pin.id === selectedId} data-dim={focus !== null && pin.id !== focus.id} style={{ left: u(pin.site.xKm), top: v(pin.site.yKm) }}>
              <button
                type="button"
                aria-pressed={pin.id === selectedId}
                aria-label={`${pin.name}, ${pin.site.name}`}
                onClick={() => (pin.id === selectedId && !focus ? onOpen(pin.id) : onSelect(pin.id))}
              >
                <i />
                <b>{pin.name}</b>
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="pmap__title">{copy.title}</p>
      <p className="pmap__earth" aria-hidden="true">
        {copy.earth}
      </p>
      <p className="pmap__scale" aria-hidden="true">
        <i style={{ width: bar.px }} />
        {bar.km} km
      </p>
    </div>
  )
}
