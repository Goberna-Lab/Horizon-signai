import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"
import "lenis/dist/lenis.css"
import { actions, brand, comparison, hud, scenes } from "../content"
import type { FlightHandle } from "./createFlight"
import type { Flight, ScreenPoint } from "./engine/renderer"
import type { Frame } from "./engine/story"
import poster from "./data/poster.webp"
import { STOPS } from "./stops"
import "./flight.css"

gsap.registerPlugin(ScrollTrigger)

const LAST = scenes.length - 1
/** Cuánto scroll ocupa cada tramo entre dos escenas, en alturas de pantalla. Más largo = la cámara avanza más despacio. */
const LEG_VH = 150

/** Sitios rotulados en la escena de comparación: id del catálogo, texto y hacia dónde cae el rótulo. */
const MARKS: Array<{ id: string; label: string; side: "left" | "right" }> = [
  { id: "connecting-ridge", label: "Connecting Ridge + RoI 6", side: "left" },
  { id: "shackleton-rim", label: "Shackleton rim", side: "right" },
  { id: "de-gerlache-rim", label: "de Gerlache rim", side: "left" },
  { id: "im-2", label: "IM-2 Athena landing", side: "right" },
]

/**
 * "live": vuelo con scroll. "static": las escenas se leen como una página normal, con la lámina fija de fondo.
 * Se usa "static" sin WebGL2, con "reducir movimiento" activado en el sistema o con `?flight=off` en la dirección
 * (útil para grabar la demo en un equipo lento).
 */
function detectMode(): "live" | "static" {
  if (typeof window === "undefined") return "static"
  if (new URLSearchParams(window.location.search).get("flight") === "off") return "static"
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static"
  try {
    const gl = document.createElement("canvas").getContext("webgl2")
    if (!gl) return "static"
    gl.getExtension("WEBGL_lose_context")?.loseContext()
    return "live"
  } catch {
    return "static"
  }
}

const palette = () => {
  const css = getComputedStyle(document.documentElement)
  const read = (name: string) => css.getPropertyValue(name).trim()
  return { paper: read("--paper"), shade: read("--shade"), ink: read("--ink"), signal: read("--signal") }
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

/**
 * Las tres composiciones del escenario. Las mismas consultas están en `flight.css`: el texto y la escena cambian
 * a la vez.
 *   - apilada (pantalla vertical): titular arriba, escena en medio y panel abajo.
 *   - compacta (apaisada y baja, como un móvil girado): texto a la izquierda y escena en el hueco de la derecha.
 *   - lateral (el resto): el encuadre de diseño de `stops.ts`.
 */
const STACKED = "(orientation: portrait)"
const COMPACT = "(orientation: landscape) and (max-height: 520px)"

export function FlightStage() {
  const [mode] = useState(detectMode)
  const [ready, setReady] = useState(false)
  const container = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const sceneEls = useRef<Array<HTMLElement | null>>([])
  const railEls = useRef<Array<HTMLAnchorElement | null>>([])
  const markEls = useRef<Record<string, HTMLElement | null>>({})
  const hudEls = useRef<Record<string, HTMLElement | null>>({})
  const titleEl = useRef<HTMLHeadingElement>(null)
  const panelEl = useRef<HTMLDivElement>(null)
  const hudEl = useRef<HTMLDListElement>(null)
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    if (mode !== "live") return
    const root = container.current
    const stageEl = stage.current
    const canvasEl = canvas.current
    if (!root || !stageEl || !canvasEl) return

    const state = { p: 0 }
    let handle: FlightHandle | null = null
    let cancelled = false
    let activeRail = -1
    const point: ScreenPoint = { x: 0, y: 0, visible: false }
    const shown: Record<string, string> = {}

    const setText = (key: string, value: string) => {
      if (shown[key] === value) return
      shown[key] = value
      const el = hudEls.current[key]
      if (el) el.textContent = value
    }

    /** Escribe un estilo solo si cambió: en reposo no se toca el DOM. */
    const styles = new Map<HTMLElement, Record<string, string>>()
    const setStyle = (el: HTMLElement, property: "opacity" | "transform" | "visibility", value: string) => {
      let current = styles.get(el)
      if (!current) styles.set(el, (current = {}))
      if (current[property] === value) return
      current[property] = value
      el.style[property] = value
    }

    const sides: Record<string, string> = {}
    const placeMark = (key: string, at: ScreenPoint, weight: number, side?: "left" | "right") => {
      const el = markEls.current[key]
      if (!el) return
      const visible = at.visible && weight > 0.02
      setStyle(el, "opacity", visible ? weight.toFixed(2) : "0")
      setStyle(el, "visibility", visible ? "visible" : "hidden")
      if (!visible) return
      setStyle(el, "transform", `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`)
      if (!side) return
      // Un rótulo pegado a un borde se abre hacia dentro, para que no lo corte la pantalla.
      const width = stageEl.clientWidth
      const towards = at.x > width * 0.66 ? "left" : at.x < width * 0.34 ? "right" : side
      if (sides[key] !== towards) el.dataset.side = sides[key] = towards
    }

    /** Después de cada cuadro: el tablero y los rótulos siguen a la cámara. */
    const onFrame = (flight: Flight) => {
      if (!handle) return
      const r = handle.readouts()
      setText("time", r.time)
      setText("sun", r.sun)
      setText("earth", r.earth)
      setText("siteSun", r.siteSun)
      setText("siteEarth", r.siteEarth)

      const oblique = clamp01((flight.pose.tilt - 35) / 20)
      placeMark("sun", flight.bodyOnScreen("sun", point), oblique)
      placeMark("earth", flight.bodyOnScreen("earth", point), oblique)
      placeMark("site", flight.project(handle.points["connecting-ridge"], point), clamp01(flight.pose.ring * 1.5 - 0.25), "right")
      const compare = clamp01((state.p - (LAST - 0.45)) / 0.3)
      for (const mark of MARKS) placeMark(mark.id, flight.project(handle.points[mark.id], point), compare, mark.side)
    }

    /** El scroll fija el punto de la ruta; de ahí salen el texto visible, el riel y la cámara. */
    const apply = () => {
      const p = state.p
      sceneEls.current.forEach((el, i) => {
        if (!el) return
        const w = clamp01(1 - Math.abs(p - i) / 0.42)
        const eased = w * w * (3 - 2 * w)
        setStyle(el, "opacity", eased.toFixed(3))
        setStyle(el, "transform", `translate3d(0, ${((1 - eased) * (p < i ? 18 : -18)).toFixed(1)}px, 0)`)
        setStyle(el, "visibility", w > 0.01 ? "visible" : "hidden")
        if (el.inert !== w < 0.5) el.inert = w < 0.5
      })
      const nearest = Math.round(p)
      if (nearest !== activeRail) {
        activeRail = nearest
        railEls.current.forEach((el, i) => {
          if (!el) return
          if (i === nearest) el.setAttribute("aria-current", "step")
          else el.removeAttribute("aria-current")
        })
      }
      handle?.flight.setProgress(p)
    }

    /**
     * Encuadre de cada parada para esta pantalla. Se mide el texto real (titular, paneles, barra y tablero) y la
     * escena se coloca en el hueco que queda: así nada depende de porcentajes fijos ni del tipo de dispositivo.
     * Se usan las medidas de maquetación (`offset*`), que no cambian con las transiciones de las escenas.
     */
    const frames = (width: number, height: number): Frame[] => {
      const hero = sceneEls.current[0]
      const title = titleEl.current
      const heroPanel = panelEl.current
      const stacked = window.matchMedia(STACKED).matches
      const compact = !stacked && window.matchMedia(COMPACT).matches
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar")) || 64
      const hudTop = hudEl.current ? hudEl.current.offsetTop : height - 46
      const gap = hero ? hero.offsetLeft : 16
      const free = Math.max(hudTop - bar, 120)
      const middle = (bar + hudTop) / 2
      return STOPS.map((stop, i) => {
        const scene = sceneEls.current[i]
        // El bloque de texto de la escena: en el inicio es el panel; el titular va aparte.
        const box =
          i === 0 && hero && heroPanel
            ? { top: hero.offsetTop + heroPanel.offsetTop, right: hero.offsetLeft + heroPanel.offsetLeft + heroPanel.offsetWidth }
            : scene
              ? { top: scene.offsetTop, right: scene.offsetLeft + scene.offsetWidth }
              : { top: hudTop, right: 0 }
        if (stacked) {
          const top = (i === 0 && hero && title ? hero.offsetTop + title.offsetTop + title.offsetHeight : bar) + gap * 0.75
          const bottom = Math.max(box.top - gap * 0.75, top + 80)
          return { shift: [0, (height / 2 - (top + bottom) / 2) / height], fitPx: Math.min(bottom - top, width * 0.94) }
        }
        if (compact) {
          const left = Math.min(box.right + gap, width * 0.72)
          const right = width - gap * 0.5
          return {
            shift: [((left + right) / 2 - width / 2) / width, (height / 2 - middle) / height + (stop.shift[1] * free) / height],
            fitPx: Math.min(free * 0.93, (right - left) * 0.96),
          }
        }
        return {
          shift: [stop.shift[0], (height / 2 - middle) / height + stop.shift[1]],
          fitPx: Math.min(free * 0.93, (1 - 2 * Math.abs(stop.shift[0])) * width * 0.94),
        }
      })
    }

    const resize = () => {
      if (!handle) return
      const width = stageEl.clientWidth
      const height = stageEl.clientHeight
      const small = Math.min(width, height) < 700
      handle.flight.resize(width, height, Math.min(window.devicePixelRatio || 1, small ? 2 : 1.5), frames(width, height))
    }

    // Scroll suavizado: la rueda deja de avanzar a saltos y la cámara se desliza. El scroll sigue siendo el del
    // navegador (teclado, barra y táctil funcionan igual), así que `position: sticky` no se rompe.
    // Los enlaces del menú dejan libre la barra fija.
    const barHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar")) || 64
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true, anchors: { offset: -barHeight }, autoRaf: false })
    lenisRef.current = lenis
    lenis.on("scroll", ScrollTrigger.update)
    // Un solo reloj para todo: primero avanza el scroll y después se dibuja la escena, una vez por cuadro.
    const tick = (time: number) => {
      lenis.raf(time * 1000)
      handle?.flight.frame(performance.now())
    }
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    const context = gsap.context(() => {
      gsap.to(state, {
        p: LAST,
        ease: "none",
        onUpdate: apply,
        // El scroll ya llega suavizado: aquí basta un retardo corto para que la cámara no vaya a remolque.
        scrollTrigger: { trigger: root, start: "top top", end: "bottom bottom", scrub: 0.25 },
      })
    }, root)
    apply()

    import("./createFlight")
      .then(async (module) => {
        if (cancelled) return
        const small = Math.min(window.innerWidth, window.innerHeight) < 700
        const created = await module.createFlight(canvasEl, {
          palette: palette(),
          quality: small || (navigator.hardwareConcurrency ?? 8) <= 2 ? "low" : "high",
          // El antialiasing por hardware sale barato en gráficas de móvil y caro en una integrada de escritorio.
          antialias: window.matchMedia("(pointer: coarse)").matches,
          onReady: () => !cancelled && setReady(true),
          onFrame,
        })
        if (cancelled) {
          created.flight.dispose()
          return
        }
        handle = created
        if (import.meta.env.DEV) (window as unknown as { __flight?: FlightHandle }).__flight = created
        resize()
        apply()
      })
      .catch((error) => {
        // Sin escena la página sigue completa: queda la lámina fija de fondo.
        console.warn("Flight scene unavailable:", error)
      })

    // El encuadre depende del tamaño del escenario y del alto de cada panel (cambia al cargar la tipografía).
    const observer = new ResizeObserver(resize)
    observer.observe(stageEl)
    for (const el of sceneEls.current) if (el) observer.observe(el)

    return () => {
      cancelled = true
      observer.disconnect()
      context.revert()
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33)
      lenis.destroy()
      lenisRef.current = null
      handle?.flight.dispose()
      handle = null
    }
  }, [mode])

  const jump = (index: number) => (event: React.MouseEvent) => {
    const root = container.current
    if (!root || mode !== "live") return
    event.preventDefault()
    const top = root.getBoundingClientRect().top + window.scrollY + (index / LAST) * (root.offsetHeight - window.innerHeight)
    // Un salto largo dura más que uno corto, para que el vuelo no pase de golpe.
    if (lenisRef.current) lenisRef.current.scrollTo(top, { duration: 1.2 + 0.5 * Math.abs(top - window.scrollY) / window.innerHeight / (LEG_VH / 100) })
    else window.scrollTo({ top, behavior: "smooth" })
  }

  const [hero, ...rest] = scenes
  const [first, second] = hero.title.split(". ")
  const [siteName, siteDetail] = hud.site.split(", ")

  return (
    <section
      ref={container}
      className="fl"
      data-mode={mode}
      data-ready={ready}
      style={mode === "live" ? { height: `calc(${LAST * LEG_VH}vh + 100lvh)` } : undefined}
      aria-label="The lunar south pole, from chart to surface"
    >
      <div ref={stage} className="fl__stage">
        <img className="fl__poster" src={poster} alt="" width={1585} height={1000} decoding="async" />
        <canvas ref={canvas} className="fl__canvas" aria-hidden="true" />

        {mode === "live" && (
          <div className="fl__marks" aria-hidden="true">
            <div className="fl-mark fl-mark--body" ref={(el) => void (markEls.current.sun = el)}>
              <span className="fl-mark__label">Sun</span>
            </div>
            <div className="fl-mark fl-mark--body" ref={(el) => void (markEls.current.earth = el)}>
              <span className="fl-mark__label">Earth</span>
            </div>
            <div className="fl-mark fl-mark--site" ref={(el) => void (markEls.current.site = el)}>
              <span className="fl-mark__label">Connecting Ridge</span>
            </div>
            {MARKS.map((mark) => (
              <div key={mark.id} className="fl-mark fl-mark--point" data-side={mark.side} ref={(el) => void (markEls.current[mark.id] = el)}>
                <i className="fl-mark__cross" />
                <span className="fl-mark__label">{mark.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="fl__scenes">
          <article className="fl-scene fl-scene--hero" id={`scene-${hero.id}`} ref={(el) => void (sceneEls.current[0] = el)}>
            <p className="fl-hero__eyebrow">{brand.challenge}</p>
            <h1 className="fl-hero__title" ref={titleEl}>
              <span>{first}.</span> <span>{second}</span>
            </h1>
            <div className="fl-hero__panel" ref={panelEl}>
              <p className="fl-hero__body">{hero.body}</p>
              <div className="fl-hero__actions">
                <Link className="btn btn--primary" to={actions.planner.to}>
                  {actions.planner.label}
                </Link>
                <Link className="btn" to={actions.simulator.to}>
                  {actions.simulator.label}
                </Link>
              </div>
            </div>
          </article>

          {rest.map((scene, i) => (
            <article key={scene.id} className="fl-scene fl-scene--panel" data-scene={scene.id} id={`scene-${scene.id}`} ref={(el) => void (sceneEls.current[i + 1] = el)}>
              <div className="fl-scene__text">
                <h2 className="fl-scene__title">{scene.title}</h2>
                <p className="fl-scene__body">{scene.body}</p>
                {scene.note && <p className="fl-scene__note">{scene.note}</p>}
              </div>
              {scene.facts && (
                <dl className="fl-facts">
                  {scene.facts.map((fact) => (
                    <div key={fact.label} className="fl-facts__item">
                      <dt>{fact.label}</dt>
                      <dd>
                        <data value={fact.value}>{fact.value}</data>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {scene.id === "compare" && (
                <table className="fl-table">
                  <caption>{comparison.caption}</caption>
                  <thead>
                    <tr>
                      {comparison.columns.map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          {row.name}
                          {row.approximate ? " *" : ""}
                        </th>
                        <td>{row.sun}</td>
                        <td>{row.earth}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>* {comparison.footnote}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </article>
          ))}
        </div>

        {mode === "live" && (
          <>
            <nav className="fl__rail" aria-label="Flight stops">
              <ol>
                {scenes.map((scene, i) => (
                  <li key={scene.id}>
                    <a href={`#scene-${scene.id}`} onClick={jump(i)} ref={(el) => void (railEls.current[i] = el)}>
                      {scene.rail}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <dl className="fl__hud" ref={hudEl} aria-label="Sun and Earth for the date shown">
              <div className="fl-hud__cell">
                <dt>{hud.time}</dt>
                <dd>
                  <output ref={(el) => void (hudEls.current.time = el)}>2026-12-04 00:00</output>
                </dd>
              </div>
              <div className="fl-hud__cell fl-hud__cell--wide">
                <dt>{hud.sun}</dt>
                <dd>
                  <output ref={(el) => void (hudEls.current.sun = el)}>&nbsp;</output>
                </dd>
              </div>
              <div className="fl-hud__cell fl-hud__cell--wide">
                <dt>{hud.earth}</dt>
                <dd>
                  <output ref={(el) => void (hudEls.current.earth = el)}>&nbsp;</output>
                </dd>
              </div>
              <div className="fl-hud__cell fl-hud__cell--site">
                <dt>
                  {siteName}
                  {siteDetail && <span className="fl-hud__detail">, {siteDetail}</span>}
                </dt>
                <dd>
                  <output ref={(el) => void (hudEls.current.siteSun = el)}>&nbsp;</output>
                  <output ref={(el) => void (hudEls.current.siteEarth = el)}>&nbsp;</output>
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </section>
  )
}
