import { type CSSProperties, useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"
import "lenis/dist/lenis.css"
import { brand, hud, opening, scenes } from "../content"
import type { FlightHandle } from "./createFlight"
import type { Flight, ScreenPoint } from "./engine/renderer"
import type { Frame } from "./engine/story"
import { at, horizonAt, sky, span, stamp, stateOf } from "../sections/product/sky"
import poster from "./data/poster.webp"
import { ScenePanel } from "./ScenePanel"
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

/** Rumbo por el que se pone el Sol en Connecting Ridge el día lunar del relato: hacia ahí mira la cresta del inicio. */
const SUNSET_AZ = 176
/**
 * El reloj del inicio, desde que arranca la entrada (ms). Los tiempos de lo que es CSS están en flight.css.
 *   0     pantalla negra: se escribe "Horizon Signal", se borra "al" y se escribe "AI"
 *   3500  la marca sube a su sitio
 *   3700  una línea blanca dibuja el horizonte
 *   4300  el Sol sale desde abajo, por detrás de la cresta
 *   4700  su luz se abre desde él y enciende el terreno
 *   6900  se dibuja la ruta sobre la cresta
 *   8300  el astronauta echa a andar
 *   9700  las lecturas del módulo
 */
const LOAD_AT_MS = 6000
const WALK_AT_MS = 8300
/** La lámina 3D (pesada) se carga cuando el inicio ha terminado, o antes si se empieza a bajar. */
const FLIGHT_AT_MS = 11000
/** Alto del astronauta (px) según el radio del Sol. */
const walkerSize = (r: number) => Math.min(Math.max(r * 0.6, 56), 150)
/** Hora del día lunar (desde el 1 de diciembre de 2026) que enseñan las lecturas del inicio: el Sol y la Tierra a la vista. */
const STATUS_HOUR = 430

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
  const titleEl = useRef<HTMLHeadingElement>(null)
  const panelEl = useRef<HTMLParagraphElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const limbEl = useRef<HTMLDivElement>(null)
  const statusEl = useRef<HTMLDivElement>(null)
  const walkerEl = useRef<HTMLCanvasElement>(null)
  /** La geometría de la cresta del inicio, para que el astronauta pise sobre ella. */
  const ridgeGeo = useRef<{ width: number; top: number; floor: number; y: (x: number) => number; r: number; from: number; to: number } | null>(null)
  const signalEl = useRef<SVGSVGElement>(null)

  // La ilustración del inicio (la del emblema del equipo: el Sol rojo tras la cresta, con la señal que se corta) se
  // dibuja a medida de la pantalla: ocupa el hueco entre el texto y el tablero. La cresta negra es el horizonte real
  // de Connecting Ridge hacia el rumbo por el que se pone el Sol. Vale también sin vuelo, por eso va en su efecto.
  useEffect(() => {
    const stageEl = stage.current
    const box = limbEl.current
    const svg = signalEl.current
    if (!stageEl || !box || !svg) return
    // Una misma parte puede estar en varias capas (el terreno de noche y el iluminado): se escriben todas.
    const set = (name: string, values: Record<string, number | string>) => {
      for (const el of box.querySelectorAll<SVGElement>(`[data-part="${name}"]`))
        for (const [key, value] of Object.entries(values)) el.setAttribute(key, typeof value === "number" ? value.toFixed(1) : value)
    }
    const horizon = sky.ground.horizon
    const layout = () => {
      const width = box.clientWidth
      const height = box.clientHeight
      const panel = panelEl.current
      if (width === 0 || height === 0 || !panel) return
      // La entrada empieza con la marca en el centro de la pantalla: cuánto hay que subirla o bajarla desde su sitio.
      const brandEl = titleEl.current
      if (brandEl) {
        let brandTop = 0
        for (let el: HTMLElement | null = brandEl; el && el !== stageEl; el = el.offsetParent as HTMLElement | null) brandTop += el.offsetTop
        brandEl.style.setProperty("--intro-dy", `${(height / 2 - (brandTop + brandEl.offsetHeight / 2)).toFixed(1)}px`)
      }
      // En pantallas anchas las lecturas van a los lados del Sol; en las demás, bajo las acciones, y cuentan como texto.
      const flank = width >= 1000 && width > height
      const hero = sceneEls.current[0]
      if (hero) hero.dataset.status = flank ? "flank" : "row"
      // Dónde termina el texto del inicio, sumando los desplazamientos hasta el escenario.
      const last = !flank && statusEl.current && statusEl.current.offsetHeight > 0 ? statusEl.current : panel
      let textEnd = last.offsetHeight
      for (let el: HTMLElement | null = last; el && el !== stageEl; el = el.offsetParent as HTMLElement | null) textEnd += el.offsetTop
      const floor = height
      const space = Math.max(floor - textEnd - 16, 80)

      // La cresta: el horizonte real, 110 grados de vuelta centrados en el rumbo de la puesta.
      const perDegree = Math.min(space * 0.07, 20, width * 0.03)
      const level = floor - Math.min(space * 0.2, 96)
      const ridgeY = (x: number) => level - horizonAt(horizon, SUNSET_AZ + (x / width - 0.5) * 110) * perDegree
      let ridge = `M -20 ${floor + 2}`
      for (let x = -20; x <= width + 20; x += 5) ridge += ` L ${x} ${ridgeY(x).toFixed(1)}`
      ridge += ` L ${width + 20} ${floor + 2} Z`
      set("ridge", { d: ridge })
      // El filo de la cresta, abierto: lo dibuja la línea blanca y después lo enciende el Sol por detrás.
      let crestLine = ""
      for (let x = -20; x <= width + 20; x += 5) crestLine += `${crestLine ? " L" : "M"} ${x} ${ridgeY(x).toFixed(1)}`
      set("crest", { d: crestLine })

      // El primer plano: otra loma, más cerca y más abajo, siempre por debajo de la cresta.
      const nearY = (x: number) =>
        Math.max(floor - Math.min(space * 0.06, 34) - horizonAt(horizon, SUNSET_AZ + 160 + (x / width - 0.5) * 60) * perDegree * 1.5, ridgeY(x) + 26)
      let near = `M -20 ${floor + 2}`
      let nearTop = floor
      for (let x = -20; x <= width + 20; x += 6) {
        const y = nearY(x)
        nearTop = Math.min(nearTop, y)
        near += ` L ${x} ${y.toFixed(1)}`
      }
      near += ` L ${width + 20} ${floor + 2} Z`
      set("near", { d: near })

      // Dónde está el relieve, para no calcular la textura del regolito en todo el cielo.
      let crestTop = floor
      for (let x = 0; x <= width; x += 10) crestTop = Math.min(crestTop, ridgeY(x))
      set("far-box", { x: 0, y: crestTop - 4, width, height: floor - crestTop + 6 })
      set("near-box", { x: 0, y: nearTop - 4, width, height: floor - nearTop + 6 })
      set("far-shade", { y1: crestTop, y2: floor })
      set("near-shade", { y1: nearTop, y2: floor })
      set("rim", { x1: 0, x2: width })

      // `r` es el tamaño de la composición (las lecturas se colocan con él); el Sol de verdad es más pequeño.
      const cx = width / 2
      const crest = ridgeY(cx)
      ridgeGeo.current = { width, top: textEnd, floor, y: ridgeY, r: 0, from: 0, to: 0 }
      const r = Math.max(Math.min((crest - textEnd - 14) / 1.5, width * (height > width ? 0.36 : 0.155), 270), 26)
      const cy = crest - r * 0.5
      ridgeGeo.current.r = r
      // El Sol: un disco blanco con su resplandor, asomando por encima de la cresta.
      const sunR = Math.min(Math.max(r * 0.2, 16), 52)
      const sunY = crest - sunR * 0.55
      set("sun", { cx, cy: sunY, r: sunR })
      set("glow", { cx, cy: sunY, r: sunR * 11 })
      // Sale desde abajo: empieza escondido tras la cresta.
      box.style.setProperty("--sun-rise", `${(sunR * 2.6).toFixed(1)}px`)
      // Desde ahí se abre su luz sobre el terreno; por debajo del suelo no se ve.
      box.style.setProperty("--sun-cx", `${cx.toFixed(1)}px`)
      box.style.setProperty("--sun-cy", `${sunY.toFixed(1)}px`)
      box.style.setProperty("--floor", `${floor.toFixed(1)}px`)
      // La Tierra, baja sobre el horizonte, a un lado del Sol.
      set("earth", { cx: cx + r * 1.15, cy: crest - r * 0.95, r: Math.max(r * 0.05, 5) })

      if (hero) {
        hero.style.setProperty("--sun-x", `${(cx - hero.offsetLeft).toFixed(1)}px`)
        hero.style.setProperty("--sun-y", `${(cy - hero.offsetTop).toFixed(1)}px`)
        hero.style.setProperty("--sun-r", `${r.toFixed(1)}px`)
        // Cada columna de lecturas se apoya sobre la cresta que tiene debajo, para no quedar tapada por ella.
        // Debajo de cada columna queda una franja libre: por ahí camina el astronauta.
        const walker = walkerSize(r)
        const rest = (x: number) => Math.min(ridgeY(x) - 18 - walker * 1.1, cy + r * 0.86) - hero.offsetTop
        hero.style.setProperty("--status-left", `${rest(Math.max(cx - r * 3.2, width * 0.12)).toFixed(1)}px`)
        hero.style.setProperty("--status-right", `${rest(cx + r * 2.9).toFixed(1)}px`)
      }
      // La barra de arriba se alinea con las dos columnas de lecturas: la marca encima de la izquierda y la acción
      // encima de la derecha (landing.css). Sin columnas a los lados, la barra va como siempre.
      const root = document.documentElement
      const cols = statusEl.current?.querySelectorAll<HTMLElement>(".fl-status__col")
      if (flank && cols && cols.length === 2) {
        const left = cols[0].getBoundingClientRect()
        const right = cols[1].getBoundingClientRect()
        const page = root.clientWidth
        root.style.setProperty("--bar-left", `${left.left.toFixed(1)}px`)
        root.style.setProperty("--bar-left-w", `${left.width.toFixed(1)}px`)
        root.style.setProperty("--bar-right", `${(page - right.right).toFixed(1)}px`)
        root.style.setProperty("--bar-right-w", `${right.width.toFixed(1)}px`)
        root.dataset.barAligned = ""
      } else {
        delete root.dataset.barAligned
      }

      // La ruta del astronauta, marcada sobre la cresta: cruza desde el borde izquierdo y se para a contraluz, cerca
      // del Sol. La dibuja la entrada (CSS) y el astronauta la recorre (astronaut.ts).
      const size = walkerSize(r)
      const to = Math.max(cx - r * 0.75, size * 0.7)
      // Sale por el borde de la pantalla, sin esperar fuera de ella.
      const from = -size * 0.45
      // La línea dorada cruza la cresta de borde a borde; el punto marca dónde se para el astronauta.
      let route = ""
      for (let x = 0; x <= width; x += 4) route += `${route ? " L" : "M"} ${x.toFixed(1)} ${(ridgeY(x) + 1.5).toFixed(1)}`
      route += ` L ${width.toFixed(1)} ${(ridgeY(width) + 1.5).toFixed(1)}`
      set("route", { d: route })
      set("route-end", { cx: to, cy: ridgeY(to) + 1.5 })
      ridgeGeo.current.from = from
      ridgeGeo.current.to = to
      window.dispatchEvent(new Event("flight:ridge"))
      for (const layer of box.querySelectorAll("svg")) layer.setAttribute("viewBox", `0 0 ${width} ${height}`)
    }
    const observer = new ResizeObserver(layout)
    observer.observe(box)
    if (panelEl.current) observer.observe(panelEl.current)
    if (statusEl.current) observer.observe(statusEl.current)
    layout()
    return () => {
      observer.disconnect()
      delete document.documentElement.dataset.barAligned
    }
  }, [mode])

  // La entrada arranca cuando la serif de la marca ya está cargada (como mucho 900 ms): si se escribiera con la letra
  // de reserva y cambiara a mitad, se vería un salto. Hasta entonces todo está quieto, en negro.
  useEffect(() => {
    const root = container.current
    if (!root) return
    let done = false
    const run = () => {
      if (done) return
      done = true
      root.dataset.intro = "run"
      document.documentElement.dataset.intro = "run"
      window.dispatchEvent(new Event("flight:intro"))
    }
    const timer = window.setTimeout(run, 900)
    if (document.fonts?.load) document.fonts.load(`500 120px ${getComputedStyle(root).getPropertyValue("--font-serif") || "serif"}`).then(run, run)
    else run()
    return () => window.clearTimeout(timer)
  }, [])

  // El astronauta: camina sobre la cresta del inicio y deja huellas. Se carga aparte, cuando el inicio ya se ve.
  useEffect(() => {
    const canvas = walkerEl.current
    const stageEl = stage.current
    if (!canvas || !stageEl) return
    let walker: import("./astronaut").Astronaut | null = null
    let cancelled = false
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const place = () => {
      const r = ridgeGeo.current
      if (!walker || !r) return
      const size = walkerSize(r.r)
      const top = Math.max(r.top, Math.min(r.y(0), r.y(r.width)) - size * 1.35)
      const height = r.floor - top
      canvas.style.cssText = `top:${top}px;height:${height}px`
      walker.resize({ width: r.width, top, height, size, ground: r.y, from: r.from, to: r.to })
    }
    // Se dibuja solo con el inicio a la vista.
    const visible = new IntersectionObserver(([entry]) => walker?.setActive(entry.isIntersecting && window.scrollY < window.innerHeight * 0.6))
    const onScroll = () => walker?.setActive(window.scrollY < window.innerHeight * 0.6)
    const timers: number[] = []
    // El reloj es el de la entrada: el modelo se carga cuando la marca ya está en su sitio y echa a andar cuando la
    // ruta termina de dibujarse.
    const begin = () => {
      timers.push(
        window.setTimeout(() => {
          import("./astronaut")
            // Las huellas son marcas oscuras en el regolito iluminado.
            .then((module) => module.createAstronaut(canvas, { paper: "#26231f", still }))
            .then((created) => {
              if (cancelled) return created.dispose()
              walker = created
              place()
              walker.setActive(window.scrollY < window.innerHeight * 0.6)
              visible.observe(stageEl)
              const go = () => {
                if (cancelled || !walker) return
                canvas.dataset.ready = "true"
                walker.walk()
              }
              const wait = WALK_AT_MS - (performance.now() - startedAt)
              if (wait > 0) timers.push(window.setTimeout(go, wait))
              else go()
            })
            .catch((error) => console.warn("Astronaut unavailable:", error))
        }, Math.max(LOAD_AT_MS - (performance.now() - startedAt), 0)),
      )
    }
    let startedAt = performance.now()
    const onIntro = () => {
      startedAt = performance.now()
      begin()
    }
    if (container.current?.dataset.intro === "run") begin()
    else window.addEventListener("flight:intro", onIntro, { once: true })
    window.addEventListener("flight:ridge", place)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelled = true
      for (const timer of timers) window.clearTimeout(timer)
      window.removeEventListener("flight:intro", onIntro)
      window.removeEventListener("flight:ridge", place)
      window.removeEventListener("scroll", onScroll)
      visible.disconnect()
      walker?.dispose()
    }
  }, [mode])

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
      if (limbEl.current) {
        const w = clamp01(1 - p / 0.42)
        setStyle(limbEl.current, "opacity", (w * w * (3 - 2 * w)).toFixed(3))
        setStyle(limbEl.current, "visibility", w > 0.01 ? "visible" : "hidden")
      }
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
      const hudTop = height
      const gap = hero ? hero.offsetLeft : 16
      const free = Math.max(hudTop - bar, 120)
      const middle = (bar + hudTop) / 2
      return STOPS.map((stop, i) => {
        // El inicio tapa la lámina con su ilustración: debajo queda centrada, lista para cuando se retire.
        if (i === 0) return { shift: [0, (height / 2 - middle) / height], fitPx: Math.min(free * 0.9, width * 0.9) }
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

    // La lámina (three.js, el relieve y las sombras) espera a que termine la entrada: es mucho trabajo y, si se
    // hiciera a la vez, la animación daría tirones. Mientras tanto la tapa el dibujo del inicio.
    const ready = new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, FLIGHT_AT_MS)
      const early = () => {
        window.clearTimeout(timer)
        resolve()
      }
      window.addEventListener("scroll", early, { once: true, passive: true })
    })
    ready
      .then(() => import("./createFlight"))
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

  const [hero, ...rest] = scenes
  // Las lecturas del inicio: el estado del módulo en Connecting Ridge a una hora en la que ve el Sol y la Tierra.
  // Salen de los mismos datos que la vista Lander (`sky.json`), no están escritas a mano.
  const sunNow = stateOf(sky.ground.windows.sun, STATUS_HOUR)
  const earthNow = stateOf(sky.ground.windows.earth, STATUS_HOUR)
  const [, earthEl] = at(sky.earth, STATUS_HOUR)
  const readouts = [
    { label: opening.status.link, value: earthNow.visible ? opening.status.linked : opening.status.unlinked, live: earthNow.visible },
    { label: opening.status.earth, value: `${earthEl.toFixed(1)}°` },
    { label: opening.status.power, value: `${sky.ground.panelWm2[STATUS_HOUR]} W/m²` },
    { label: sunNow.visible ? opening.status.sunLeft : opening.status.sunIn, value: sunNow.hours === null ? "-" : span(sunNow.hours) },
    { label: earthNow.visible ? opening.status.earthLeft : opening.status.earthIn, value: earthNow.hours === null ? "-" : span(earthNow.hours) },
    { label: opening.status.when, value: stamp(STATUS_HOUR) },
  ]

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

        <div className="fl__limb" ref={limbEl} aria-hidden="true">
          {/* El Sol va en su propia capa: la entrada mueve la capa entera (transform), sin repintar el dibujo. */}
          <div className="fl-limb__across">
            <svg className="fl-limb__sun">
              <defs>
                <radialGradient id="fl-glow">
                  <stop offset="0" stopColor="#fffaf0" stopOpacity="0.9" />
                  <stop offset="0.09" stopColor="#fff3dc" stopOpacity="0.55" />
                  <stop offset="0.25" stopColor="#f6dfb8" stopOpacity="0.16" />
                  <stop offset="0.55" stopColor="#d9b98a" stopOpacity="0.04" />
                  <stop offset="1" stopColor="#d9b98a" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle data-part="glow" fill="url(#fl-glow)" />
              <circle data-part="sun" fill="#fffdf7" />
            </svg>
          </div>

          {/* De noche: el relieve es una silueta negra y una línea blanca dibuja el horizonte. */}
          <svg className="fl-limb__night">
            <path data-part="ridge" fill="#070707" />
            <path data-part="near" fill="#040404" />
            <path className="fl-limb__line" data-part="crest" pathLength={1} fill="none" stroke="#f4efe6" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>

          {/*
            El terreno iluminado: regolito con relieve (ruido fractal con luz rasante desde el Sol), más claro en el
            filo y en sombra hacia el primer plano. Lo descubre la luz del Sol, que se abre desde él.
          */}
          <div className="fl-limb__lit">
            <svg>
              <defs>
                <filter id="fl-regolith-far" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
                  {/* Dos escalas: lomas y piedras grandes, y el grano fino del regolito. */}
                  <feTurbulence type="fractalNoise" baseFrequency="0.004 0.011" numOctaves={3} seed={4} result="big" />
                  <feTurbulence type="turbulence" baseFrequency="0.035 0.07" numOctaves={4} seed={9} result="grain" />
                  <feComposite in="big" in2="grain" operator="arithmetic" k2={0.8} k3={0.35} result="relief" />
                  <feDiffuseLighting in="relief" surfaceScale={6} diffuseConstant={1.2} lightingColor="#fff4e2" result="lit">
                    <feDistantLight azimuth={255} elevation={22} />
                  </feDiffuseLighting>
                  <feColorMatrix in="lit" type="matrix" values="0.62 0 0 0 0.02  0 0.6 0 0 0.02  0 0 0.57 0 0.02  0 0 0 0 1" />
                </filter>
                <filter id="fl-regolith-near" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
                  <feTurbulence type="fractalNoise" baseFrequency="0.0025 0.007" numOctaves={3} seed={11} result="big" />
                  <feTurbulence type="turbulence" baseFrequency="0.02 0.04" numOctaves={4} seed={3} result="grain" />
                  <feComposite in="big" in2="grain" operator="arithmetic" k2={0.8} k3={0.4} result="relief" />
                  <feDiffuseLighting in="relief" surfaceScale={8} diffuseConstant={1.15} lightingColor="#fff4e2" result="lit">
                    <feDistantLight azimuth={255} elevation={18} />
                  </feDiffuseLighting>
                  <feColorMatrix in="lit" type="matrix" values="0.5 0 0 0 0.02  0 0.48 0 0 0.02  0 0 0.46 0 0.02  0 0 0 0 1" />
                </filter>
                <linearGradient id="fl-shade-far" data-part="far-shade" gradientUnits="userSpaceOnUse" x1="0" x2="0">
                  <stop offset="0" stopColor="#000" stopOpacity="0" />
                  <stop offset="0.35" stopColor="#000" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#000" stopOpacity="0.85" />
                </linearGradient>
                <linearGradient id="fl-shade-near" data-part="near-shade" gradientUnits="userSpaceOnUse" x1="0" x2="0">
                  <stop offset="0" stopColor="#000" stopOpacity="0.15" />
                  <stop offset="1" stopColor="#000" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="fl-rim" data-part="rim" gradientUnits="userSpaceOnUse" y1="0" y2="0">
                  <stop offset="0" stopColor="#fff6e6" stopOpacity="0.3" />
                  <stop offset="0.5" stopColor="#fffaf0" stopOpacity="1" />
                  <stop offset="1" stopColor="#fff6e6" stopOpacity="0.3" />
                </linearGradient>
                <radialGradient id="fl-earth" cx="0.32" cy="0.38" r="0.75">
                  <stop offset="0" stopColor="#e9f1f8" />
                  <stop offset="0.45" stopColor="#7fa3c8" />
                  <stop offset="0.8" stopColor="#2c4766" />
                  <stop offset="1" stopColor="#0d1622" />
                </radialGradient>
                <clipPath id="fl-clip-far">
                  <path data-part="ridge" />
                </clipPath>
                <clipPath id="fl-clip-near">
                  <path data-part="near" />
                </clipPath>
              </defs>
              <g clipPath="url(#fl-clip-far)">
                <rect data-part="far-box" filter="url(#fl-regolith-far)" />
                <rect data-part="far-box" fill="url(#fl-shade-far)" />
              </g>
              <path data-part="crest" fill="none" stroke="url(#fl-rim)" strokeWidth="1.5" strokeLinejoin="round" />
              <g clipPath="url(#fl-clip-near)">
                <rect data-part="near-box" filter="url(#fl-regolith-near)" />
                <rect data-part="near-box" fill="url(#fl-shade-near)" />
              </g>
              <circle data-part="earth" fill="url(#fl-earth)" />
            </svg>
          </div>

          <svg className="fl-limb__art" ref={signalEl}>
            <path className="fl-limb__route" data-part="route" pathLength={1} fill="none" stroke="var(--route)" strokeWidth="2.5" strokeLinecap="round" />
            <circle className="fl-limb__route-end" data-part="route-end" r="5" fill="var(--paper)" stroke="var(--route)" strokeWidth="2" />
          </svg>
          <canvas className="fl-limb__walker" ref={walkerEl} />
        </div>

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
            {/* Se escribe "Horizon Signal", se borra "al" y se escribe "AI" en rojo: Horizon SignAI. */}
            <h1 className="fl-hero__brand" ref={titleEl} aria-label={brand.name}>
              <span aria-hidden="true">
                {[...opening.brand.keep].map((letter, i) => (
                  <span key={i} className="fl-brand__l" style={{ "--i": i } as CSSProperties}>
                    {letter === " " ? "\u00a0" : letter}
                  </span>
                ))}
                {[...opening.brand.erase].map((letter, i, all) => (
                  // Se borran de la última a la primera, como con la tecla de borrar.
                  <span key={`e${i}`} className="fl-brand__l fl-brand__l--erase" style={{ "--i": opening.brand.keep.length + i, "--e": all.length - 1 - i } as CSSProperties}>
                    {letter}
                  </span>
                ))}
                {[...opening.brand.write].map((letter, i) => (
                  <span key={`w${i}`} className="fl-brand__l fl-brand__l--write" style={{ "--w": i } as CSSProperties}>
                    {letter}
                  </span>
                ))}
                <span className="fl-brand__caret" />
              </span>
            </h1>
            <p className="fl-hero__title" ref={panelEl}>
              {opening.title.map((part) => (part.mark ? <em key={part.text}>{part.text}</em> : part.text))}
            </p>
            <div className="fl-hero__status" ref={statusEl} role="group" aria-label={`${hud.site}: ${opening.status.title}`}>
              {[readouts.slice(0, 3), readouts.slice(3)].map((column, side) => (
                <dl key={side} className="fl-status__col" data-side={side === 0 ? "left" : "right"}>
                  {column.map((item, n) => (
                    <div key={item.label} className="fl-status__cell" style={{ "--n": side * 3 + n } as CSSProperties}>
                      <dt>{item.label}</dt>
                      <dd data-live={item.live || undefined}>
                        {item.live && (
                          <svg className="fl-wifi" viewBox="0 0 24 18" aria-hidden="true">
                            <circle cx="12" cy="15.2" r="1.7" />
                            <path d="M8.1 11.4a5.6 5.6 0 0 1 7.8 0" />
                            <path d="M4.9 8.2a10.1 10.1 0 0 1 14.2 0" />
                            <path d="M1.7 5a14.6 14.6 0 0 1 20.6 0" />
                          </svg>
                        )}
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ))}
              </div>
          </article>

          {rest.map((scene, i) => (
            <article key={scene.id} className="fl-scene fl-scene--panel" data-scene={scene.id} id={`scene-${scene.id}`} ref={(el) => void (sceneEls.current[i + 1] = el)}>
              <ScenePanel scene={scene} open={mode === "static"} />
            </article>
          ))}
        </div>

      </div>
    </section>
  )
}
