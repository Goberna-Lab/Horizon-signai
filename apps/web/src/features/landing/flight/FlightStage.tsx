import { type CSSProperties, useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"
import "lenis/dist/lenis.css"
import { tr } from "@/shared/i18n"
import { lang, setLang, type Lang } from "@/shared/i18n"
import { brand, chooseLanguage, hud, loading, missionLog, opening, scenes } from "../content"
import type { FlightHandle, LoadStep, SiteInfo } from "./createFlight"
import type { Flight, ScreenPoint } from "./engine/renderer"
import type { Frame } from "./engine/story"
import { at, horizonAt, sky, span, stamp, stateOf } from "../sections/product/sky"
import poster from "./data/poster.webp"
import { MissionLog } from "./MissionLog"
import { MissionPoints, PointDetail, pointMissions } from "./MissionPoints"
import { ScenePanel } from "./ScenePanel"
import { HERO_DAY, STOPS, SUNRISE_FROM } from "./stops"
import "./flight.css"

gsap.registerPlugin(ScrollTrigger)

const LAST = scenes.length - 1
/** Cuánto scroll ocupa cada tramo entre dos escenas, en alturas de pantalla. Más largo = la cámara avanza más despacio. */
const LEG_VH = 150

/**
 * Sitios rotulados en la escena de comparación: id del catálogo, texto y hacia dónde cae el rótulo. Son los nombres
 * del catálogo (nombres propios): no se traducen.
 */
/** La parada de la bitácora de misiones. */
const MISSION_STOP = scenes.findIndex((scene) => scene.id === "missions")
/** La parada de los tres puntos de la misión elegida. */
const POINTS_STOP = scenes.findIndex((scene) => scene.id === "points")

/**
 * Coloca la parada de los puntos sobre los de la misión: mira al centro de los tres desde lejos e inclinada (como la
 * vista de Connecting Ridge), de lado al eje de los puntos y a la distancia que los deja bien separados en pantalla.
 */
function aimPoints(handle: FlightHandle, missionId: string, pointIndex: number) {
  const mission = pointMissions.find((m) => m.id === missionId)
  const sites = mission?.points.map((id) => handle.sites[id]).filter(Boolean) ?? []
  if (sites.length === 0) return
  const cx = sites.reduce((sum, site) => sum + site.xKm, 0) / sites.length
  const cy = sites.reduce((sum, site) => sum + site.yKm, 0) / sites.length
  // Los dos puntos más alejados entre sí marcan el eje: la cámara lo mira de lado, así cruza la pantalla de un lado
  // a otro en vez de quedar en profundidad (donde los puntos se juntan).
  let axis = [0, 1]
  let diameter = 0
  for (const a of sites)
    for (const b of sites) {
      const d = Math.hypot(b.xKm - a.xKm, b.yKm - a.yKm)
      if (d > diameter) {
        diameter = d
        axis = [b.xKm - a.xKm, b.yKm - a.yKm]
      }
    }
  const bearing = (Math.atan2(axis[0], axis[1]) * 180) / Math.PI + 90
  // Cerca y con el campo abierto: el relieve se ve de cerca y los tres puntos siguen cabiendo, bien separados.
  // En vertical la vista es estrecha: la cámara se aleja hasta que los tres caben a lo ancho.
  const narrow = typeof window !== "undefined" && window.innerWidth < window.innerHeight ? Math.min((window.innerHeight / window.innerWidth) * 1.4, 3.4) : 1
  handle.flight.updateStop(POINTS_STOP, { at: [cx, cy], distance: Math.max(diameter * 0.9 * narrow, 16), tilt: 56, bearing, fov: 50 })
  aimPoint(handle, missionId, pointIndex, bearing)
}

/** La parada de cerca, sobre el punto elegido: el mismo rumbo, para que acercarse sea seguir bajando hacia él. */
function aimPoint(handle: FlightHandle, missionId: string, index: number, bearing?: number) {
  const mission = pointMissions.find((m) => m.id === missionId)
  const site = mission ? handle.sites[mission.points[index]] : undefined
  if (!site) return
  handle.flight.updateStop(POINTS_STOP + 1, { at: [site.xKm, site.yKm], distance: 7, tilt: 62, fov: 40, ...(bearing === undefined ? {} : { bearing }) })
}
/**
 * Las misiones de la bitácora, agrupadas por sitio: una marca por sitio, con los códigos de sus misiones. Vistos desde
 * arriba los sitios del polo quedan a pocos píxeles: cada rótulo tiene su lado fijo para no pisarse con los vecinos.
 */
type MissionSide = "left" | "right" | "up" | "left-down"
const MISSION_SIDE: Record<string, MissionSide> = {
  "shackleton-rim-roi-4": "up",
  "connecting-ridge-roi-6": "left-down",
  "de-gerlache-rim": "left",
  "im-2": "left",
}
const MISSION_SITES = Object.values(
  missionLog.missions.reduce<Record<string, { site: string; ids: string[]; status: string; side: MissionSide }>>((sites, mission) => {
    const entry = (sites[mission.site] ??= { site: mission.site, ids: [], status: mission.status, side: MISSION_SIDE[mission.site] ?? "right" })
    entry.ids.push(mission.id)
    return sites
  }, {}),
)
/**
 * El scroll del vuelo va por paradas: cada golpe de rueda viaja a la siguiente (o a la anterior) con este recorrido.
 * Entre gestos tiene que haber una pausa: la inercia de un trackpad no salta dos paradas.
 */
const STEP = { duration: 2.4, quietMs: 220 }
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

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
 */
/** El relieve 3D es el propio inicio: se carga enseguida, con la pantalla de carga delante. */
const FLIGHT_AT_MS = 0
/** Cuándo se pregunta el idioma (ms de la entrada): con la marca ya retirada, antes de que entre la frase. */
const LANG_AT_MS = 5600
/** Marca de sesión: la recarga tras elegir el otro idioma no vuelve a preguntar. */
const LANG_ASKED = "horizon-signai.lang-asked"
/** Se lee una sola vez, al cargar la página (y se borra: la visita siguiente vuelve a preguntar). */
const justChoseLang = (() => {
  if (typeof window === "undefined") return false
  try {
    const asked = window.sessionStorage.getItem(LANG_ASKED) === "1"
    window.sessionStorage.removeItem(LANG_ASKED)
    return asked
  } catch {
    return false
  }
})()
/** El amanecer en 3D: el día avanza entre estos instantes de la entrada (ms), de `SUNRISE_FROM` a `HERO_DAY`. */
const DAWN = { from: 3400, to: 7400 }
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

/** Números al azar repetibles (mulberry32): el cielo sale igual en cada visita y al cambiar el tamaño. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * El HUD del módulo se reinicia con la entrada: de noche está sin energía y sin enlace; al salir el Sol los paneles
 * cargan (la potencia sube con la luz) y el enlace con la Tierra se recupera. Tiempos desde que arranca la entrada (ms).
 */
const HUD = { chargeFrom: 4300, chargeTo: 7000, seek: 4800, sunData: 5600, link: 6600, end: 7600 }
const smooth = (t: number) => t * t * (3 - 2 * t)

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
  /** La carga del relieve 3D: paso y porcentaje. Sin vuelo (modo de lectura) no hay nada que cargar. */
  const [load, setLoad] = useState<{ step: LoadStep | "engine" | "done"; pct: number }>(() => (mode === "live" ? { step: "engine", pct: 2 } : { step: "done", pct: 100 }))
  const container = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const sceneEls = useRef<Array<HTMLElement | null>>([])
  const railEls = useRef<Array<HTMLAnchorElement | null>>([])
  const markEls = useRef<Record<string, HTMLElement | null>>({})
  const titleEl = useRef<HTMLHeadingElement>(null)
  const panelEl = useRef<HTMLParagraphElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  /** Cuándo arrancó la entrada (performance.now()): el reloj del amanecer y del HUD. */
  const introAt = useRef<number | null>(null)
  /** Mientras se elige idioma la entrada está en pausa: desde cuándo (performance.now()). */
  const holdAt = useRef<number | null>(null)
  /** Tiempo de la entrada (ms), parado durante la pausa. */
  const introTime = () => (introAt.current === null ? 0 : (holdAt.current ?? performance.now()) - introAt.current)
  /** El modal de idioma: en cada visita, entre la marca y la frase. */
  const [askLang, setAskLang] = useState(false)
  /** La misión de la bitácora bajo el puntero: su marca sobre el terreno se resalta. */
  const [focusMission, setFocusMission] = useState<string | null>(null)
  /** La misión elegida en la bitácora: la parada de los puntos enseña los suyos. */
  const [selectedMission, setSelectedMission] = useState(pointMissions[0]?.id ?? "")
  const selectedRef = useRef(selectedMission)
  /** El punto elegido de esa misión: la parada de cerca vuela a él (solo a él). */
  const [chosenPoint, setChosenPoint] = useState(0)
  const chosenRef = useRef(0)
  /** El punto bajo el puntero (en el panel o en el terreno). */
  const [focusPoint, setFocusPoint] = useState<string | null>(null)
  /** Las cifras de los sitios, cuando la lámina ya está cargada. */
  const [sites, setSites] = useState<Record<string, SiteInfo> | null>(null)
  const handleRef = useRef<FlightHandle | null>(null)
  /** Vuela a una parada del vuelo (lo pone el efecto del vuelo). */
  const goToStop = useRef<(index: number) => void>(() => {})

  // Al cambiar de misión, la parada de los puntos se coloca sobre los suyos.
  useEffect(() => {
    selectedRef.current = selectedMission
    chosenRef.current = 0
    setChosenPoint(0)
    if (handleRef.current) aimPoints(handleRef.current, selectedMission, 0)
  }, [selectedMission])

  /** Elegir un punto: la parada de cerca se coloca sobre él y el vuelo va directo (es la parada siguiente). */
  const pickPoint = (index: number) => {
    chosenRef.current = index
    setChosenPoint(index)
    if (handleRef.current) aimPoint(handleRef.current, selectedRef.current, index)
    goToStop.current(POINTS_STOP + 1)
  }

  const selectMission = (id: string, fly: boolean) => {
    setSelectedMission(id)
    if (fly) goToStop.current(POINTS_STOP)
  }
  const limbEl = useRef<HTMLDivElement>(null)
  const statusEl = useRef<HTMLDivElement>(null)
  const cellEls = useRef<Record<string, HTMLElement | null>>({})
  const meterEl = useRef<HTMLElement>(null)
  const liveEl = useRef<HTMLParagraphElement>(null)
  const countEl = useRef<HTMLSpanElement>(null)
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
      // La frase puede ir desplazada hacia el centro del cielo (`top`, más abajo): se mide donde estaría sin moverla.
      let textEnd = last.offsetHeight - (last === panel ? parseFloat(panel.style.top) || 0 : 0)
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

      // `r` es el tamaño de la composición (las lecturas se colocan con él); el Sol de verdad es más pequeño.
      const cx = width / 2
      const crest = ridgeY(cx)
      const r = Math.max(Math.min((crest - textEnd - 14) / 1.5, width * (height > width ? 0.36 : 0.155), 270), 26)
      const cy = crest - r * 0.5
      // El Sol: un disco blanco con su resplandor, asomando por encima de la cresta.
      const sunR = Math.min(Math.max(r * 0.2, 16), 52)
      const sunY = crest - sunR * 0.55
      set("sun", { cx, cy: sunY, r: sunR })
      set("bloom", { cx, cy: sunY, r: sunR * 2.6 })
      set("glow", { cx, cy: sunY, r: sunR * 11 })
      set("rays", { transform: `translate(${cx.toFixed(1)} ${sunY.toFixed(1)}) scale(${sunR.toFixed(2)})` })
      // Sale desde abajo: empieza escondido tras la cresta.
      box.style.setProperty("--sun-rise", `${(sunR * 2.6).toFixed(1)}px`)
      // Desde ahí se abre su luz sobre el terreno; por debajo del suelo no se ve.
      box.style.setProperty("--sun-cx", `${cx.toFixed(1)}px`)
      box.style.setProperty("--sun-cy", `${sunY.toFixed(1)}px`)
      box.style.setProperty("--floor", `${floor.toFixed(1)}px`)

      // El cielo: estrellas fijas (siempre las mismas, con semilla), más densas en una franja como la Vía Láctea,
      // y solo por encima del horizonte. Tres tamaños; las más brillantes titilan.
      const random = seeded(7)
      const count = Math.round(Math.min(Math.max((width * height) / 4200, 140), 700))
      const stars = ["", "", ""]
      for (let i = 0; i < count; i++) {
        let x: number
        let y: number
        if (i % 3 === 0) {
          // En la franja: a lo largo de la diagonal, con dispersión.
          const t = random()
          const spread = (random() + random() + random() - 1.5) * height * 0.12
          x = t * width
          y = height * 0.78 - t * height * 0.7 + spread
        } else {
          x = random() * width
          y = random() * height
        }
        if (y < 2 || y > ridgeY(x) - 4) continue
        const kind = random() < 0.72 ? 0 : random() < 0.8 ? 1 : 2
        stars[kind] += `M${x.toFixed(1)} ${y.toFixed(1)}h0`
      }
      set("stars-dim", { d: stars[0] })
      set("stars-mid", { d: stars[1] })
      set("stars-bright", { d: stars[2] })
      set("milky", { cx: width / 2, cy: height * 0.43, rx: Math.hypot(width, height * 0.7) / 2, ry: height * 0.13, transform: `rotate(${((-Math.atan2(height * 0.7, width) * 180) / Math.PI).toFixed(1)} ${width / 2} ${height * 0.43})` })
      // La nave cruza el cielo de lado a lado, alta, por detrás de todo.
      set("ship-track", { transform: `translate(0 ${(height * 0.2).toFixed(1)})` })
      box.style.setProperty("--ship-dx", `${(width + 160).toFixed(0)}px`)

      if (hero) {
        hero.style.setProperty("--sun-x", `${(cx - hero.offsetLeft).toFixed(1)}px`)
        hero.style.setProperty("--sun-y", `${(cy - hero.offsetTop).toFixed(1)}px`)
        hero.style.setProperty("--sun-r", `${r.toFixed(1)}px`)
        // El HUD va a las esquinas de un marco centrado (el mismo al que se alinea la barra de arriba); la frase, en el
        // centro de la pantalla.
        const frame = Math.min(1320, width - 2 * Math.max(32, width * 0.09))
        const edge = (width - frame) / 2
        const colW = Math.min(Math.max(width * 0.17, 200), 280)
        hero.style.setProperty("--frame-edge", `${(edge - hero.offsetLeft).toFixed(1)}px`)
        hero.style.setProperty("--col-w", `${colW.toFixed(1)}px`)
        // La fila de abajo del HUD, sobre el terreno, cerca del borde inferior.
        hero.style.setProperty("--bottom-y", `${(height - 26 - hero.offsetTop).toFixed(1)}px`)
        const natural = textEnd - panel.offsetHeight / 2
        const shift = flank ? Math.max(height / 2 - natural, 0) : 0
        panel.style.top = `${shift.toFixed(1)}px`
      }
      // La barra de arriba se alinea con el marco del HUD: la marca y la acción, en sus bordes y con el mismo ancho.
      // Sin HUD a los lados (pantallas estrechas), la barra va como siempre.
      const root = document.documentElement
      if (flank) {
        const frame = Math.min(1320, width - 2 * Math.max(32, width * 0.09))
        const edge = (width - frame) / 2
        const side = Math.min(Math.max(width * 0.17, 200), 280)
        root.style.setProperty("--bar-left", `${edge.toFixed(1)}px`)
        root.style.setProperty("--bar-left-w", `${side.toFixed(1)}px`)
        root.style.setProperty("--bar-right", `${edge.toFixed(1)}px`)
        root.style.setProperty("--bar-right-w", `${side.toFixed(1)}px`)
        root.dataset.barAligned = ""
      } else {
        delete root.dataset.barAligned
      }

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
    // Hacen falta la letra y, con vuelo, el relieve 3D listo (la pantalla de carga cubre la espera). Si el 3D falla o
    // tarda demasiado, la entrada sale igual, con el dibujo 2D.
    let fontReady = false
    let sceneReady = mode !== "live"
    const run = () => {
      if (done || !fontReady || !sceneReady) return
      done = true
      introAt.current = performance.now()
      root.dataset.intro = "run"
      document.documentElement.dataset.intro = "run"
      window.dispatchEvent(new Event("flight:intro"))
    }
    const font = () => {
      fontReady = true
      run()
    }
    const scene = () => {
      sceneReady = true
      run()
    }
    const fontTimer = window.setTimeout(font, 900)
    const sceneTimer = window.setTimeout(scene, 25000)
    window.addEventListener("flight:loaded", scene)
    if (document.fonts?.load) document.fonts.load(`500 120px ${getComputedStyle(root).getPropertyValue("--font-serif") || "serif"}`).then(font, font)
    else font()
    return () => {
      window.clearTimeout(fontTimer)
      window.clearTimeout(sceneTimer)
      window.removeEventListener("flight:loaded", scene)
    }
  }, [mode])

  // El idioma: en cada visita, entre la marca y la frase, la entrada se pausa y se pregunta. Elegir el idioma que ya
  // está (o "Not now") la reanuda; elegir el otro recarga la página en ese idioma, y esa recarga ya no pregunta.
  useEffect(() => {
    if (justChoseLang) return
    const root = container.current
    if (!root) return
    let timer = 0
    const ask = () => {
      timer = window.setTimeout(() => {
        holdAt.current = performance.now()
        root.dataset.hold = ""
        document.documentElement.dataset.hold = ""
        setAskLang(true)
      }, Math.max(LANG_AT_MS - introTime(), 0))
    }
    if (root.dataset.intro === "run") ask()
    else window.addEventListener("flight:intro", ask, { once: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("flight:intro", ask)
    }
  }, [])

  const resume = () => {
    const root = container.current
    if (holdAt.current !== null && introAt.current !== null) introAt.current += performance.now() - holdAt.current
    holdAt.current = null
    if (root) delete root.dataset.hold
    delete document.documentElement.dataset.hold
    setAskLang(false)
  }

  const choose = (next: Lang) => {
    if (next !== lang) {
      // La recarga en el otro idioma no vuelve a preguntar.
      try {
        window.sessionStorage.setItem(LANG_ASKED, "1")
      } catch {
        // sin almacenamiento, la recarga preguntará otra vez
      }
      setLang(next)
      return
    }
    setLang(next)
    resume()
  }

  // El HUD se reinicia con el Sol (ver `HUD`): sin energía y sin enlace de noche, la potencia sube con la luz y el
  // enlace vuelve. El texto final está ya en la página (sin JS o con "reducir movimiento" se queda así).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const root = container.current
    const hero = sceneEls.current[0]
    if (!root || !hero) return
    const cell = (key: string) => cellEls.current[key]
    const value = (key: string) => cell(key)?.querySelector<HTMLElement>(".fl-status__value") ?? null
    const final = (key: string) => value(key)?.dataset.final ?? ""
    const shown: Record<string, string> = {}
    const write = (key: string, text: string, state: string) => {
      const el = value(key)
      if (!el || shown[key] === text + state) return
      shown[key] = text + state
      el.textContent = text
      cell(key)!.dataset.state = state
    }
    const sunNow = stateOf(sky.ground.windows.sun, STATUS_HOUR)
    const sunset = `${opening.status.sunsetIn} ${sunNow.hours === null ? "-" : span(sunNow.hours)}`
    const power = parseFloat(final("power")) || 0
    const earth = parseFloat(final("earth")) || 0
    let frame = 0
    const show = (t: number) => {
      const charge = smooth(clamp01((t - HUD.chargeFrom) / (HUD.chargeTo - HUD.chargeFrom)))
      hero.dataset.power = t < HUD.chargeFrom ? "off" : t < HUD.chargeTo ? "charging" : "online"
      hero.dataset.link = t < HUD.seek ? "off" : t < HUD.link ? "seek" : "on"
      hero.dataset.sun = t < HUD.chargeFrom ? "down" : "up"
      if (liveEl.current) liveEl.current.dataset.state = hero.dataset.link
      // Bajo la fecha: la cuenta atrás hasta que asoma el Sol y, ya fuera, cuánto falta para que se ponga.
      const left = Math.ceil((HUD.chargeFrom - t) / 1000)
      const count = t >= HUD.chargeFrom ? sunset : left > 3 ? opening.status.sunriseIn : `${opening.status.sunriseIn} ${left}…`
      if (countEl.current && countEl.current.textContent !== count) countEl.current.textContent = count
      write("power", `${Math.round(power * charge)} W/m²`, charge >= 1 ? "on" : charge > 0 ? "seek" : "off")
      meterEl.current?.style.setProperty("--charge", charge.toFixed(3))
      write("link", t < HUD.seek ? opening.status.noSignal : t < HUD.link ? opening.status.seeking : final("link"), t < HUD.seek ? "off" : t < HUD.link ? "seek" : "on")
      const earthIn = clamp01((t - HUD.link) / 500)
      write("earth", t < HUD.link ? "--.-°" : `${(earth * earthIn).toFixed(1)}°`, t < HUD.link ? "off" : "on")
      write("earthLeft", t < HUD.link ? "--" : final("earthLeft"), t < HUD.link ? "off" : "on")
    }
    const tick = () => {
      const t = introTime()
      show(t)
      if (t < HUD.end) frame = requestAnimationFrame(tick)
    }
    // Desde el primer momento: sin energía y sin enlace.
    show(0)
    const start = () => {
      tick()
    }
    if (root.dataset.intro === "run") start()
    else window.addEventListener("flight:intro", start, { once: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("flight:intro", start)
    }
  }, [])

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
      // Los rótulos son de la lámina: en la vista realista del inicio no van.
      const oblique = clamp01((flight.pose.tilt - 35) / 20) * (1 - flight.pose.real)
      placeMark("sun", flight.bodyOnScreen("sun", point), oblique)
      placeMark("earth", flight.bodyOnScreen("earth", point), oblique)
      placeMark("site", flight.project(handle.points["connecting-ridge"], point), clamp01(flight.pose.ring * 1.5 - 0.25), "right")
      const compare = clamp01((state.p - (LAST - 0.45)) / 0.3)
      for (const mark of MARKS) placeMark(mark.id, flight.project(handle.points[mark.id], point), compare, mark.side)
      // Las misiones de la bitácora, en sus sitios, mientras se ve esa parada.
      const missions = clamp01(1 - Math.abs(state.p - MISSION_STOP) / 0.45)
      for (const entry of MISSION_SITES) placeMark(`m:${entry.site}`, flight.project(handle.points[entry.site], point), missions)
      // Los tres puntos de la misión elegida en su parada; de cerca, solo el elegido (resaltado).
      const all = clamp01(1 - Math.abs(state.p - POINTS_STOP) / 0.45)
      const close = clamp01(1 - Math.max(POINTS_STOP - state.p, state.p - (POINTS_STOP + 1), 0) / 0.45)
      const chosen = pointMissions.find((m) => m.id === selectedRef.current)
      chosen?.points.forEach((id, n) => {
        const mine = n === chosenRef.current
        placeMark(`p${n}`, flight.project(handle!.points[id], point), mine ? close : all)
        const el = markEls.current[`p${n}`]
        const here = mine && state.p > POINTS_STOP + 0.5
        if (el && (el.dataset.here !== undefined) !== here) {
          if (here) el.dataset.here = ""
          else delete el.dataset.here
        }
      })
    }

    /** El scroll fija el punto de la ruta; de ahí salen el texto visible, el riel y la cámara. */
    const apply = () => {
      const p = state.p
      sceneEls.current.forEach((el, i) => {
        if (!el) return
        const w = clamp01(1 - Math.abs(p - i) / 0.42)
        const eased = w * w * (3 - 2 * w)
        if (i === 0) {
          setStyle(el, "opacity", eased.toFixed(3))
          setStyle(el, "transform", `translate3d(0, ${((1 - eased) * (p < i ? 18 : -18)).toFixed(1)}px, 0)`)
        } else {
          // Los paneles salen por la izquierda y el siguiente entra por el mismo lado: se ve el relevo.
          const away = el.offsetWidth + el.offsetLeft + 24
          setStyle(el, "opacity", Math.sqrt(eased).toFixed(3))
          setStyle(el, "transform", `translate3d(${(-(1 - eased) * away).toFixed(1)}px, 0, 0)`)
        }
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
      // El encuadre de los puntos depende de la forma de la pantalla (ver `aimPoints`).
      aimPoints(handle, selectedRef.current, chosenRef.current)
    }


    // Scroll suavizado: la rueda deja de avanzar a saltos y la cámara se desliza. El scroll sigue siendo el del
    // navegador (teclado, barra y táctil funcionan igual), así que `position: sticky` no se rompe.
    // Los enlaces del menú dejan libre la barra fija.
    const barHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar")) || 64
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true, anchors: { offset: -barHeight }, autoRaf: false })
    lenisRef.current = lenis
    lenis.on("scroll", ScrollTrigger.update)

    // Dentro del vuelo la rueda va por paradas: un gesto, una parada, con un recorrido largo y suave. Fuera del vuelo
    // (y al salir por el final) la rueda vuelve a ser la de siempre. Teclado, barra y táctil no cambian.
    let stepping = false
    let lastWheel = 0
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) return
      // Dentro de un panel con más contenido del que cabe, la rueda lo recorre a él (Lenis lo deja con `data-lenis-prevent`).
      const panel = event.target instanceof Element ? event.target.closest<HTMLElement>(".fl-scene--panel") : null
      if (panel && panel.scrollHeight > panel.clientHeight + 2) {
        const room = event.deltaY > 0 ? panel.scrollHeight - panel.clientHeight - panel.scrollTop : panel.scrollTop
        if (room > 1) return
      }
      const top = root.offsetTop
      const span = root.offsetHeight - window.innerHeight
      const y = window.scrollY
      if (span <= 0 || y < top - 4 || y > top + span + 4) return
      const dir = Math.sign(event.deltaY)
      const p = ((y - top) / span) * LAST
      if ((dir > 0 && p >= LAST - 0.02) || (dir < 0 && p <= 0.02)) return
      event.preventDefault()
      event.stopPropagation()
      const now = performance.now()
      const fresh = now - lastWheel > STEP.quietMs
      lastWheel = now
      if (stepping || !fresh) return
      const target = Math.min(Math.max(dir > 0 ? Math.floor(p + 0.05) + 1 : Math.ceil(p - 0.05) - 1, 0), LAST)
      stepping = true
      lenis.scrollTo(top + (target / LAST) * span, {
        duration: STEP.duration,
        easing: easeInOut,
        lock: true,
        force: true,
        onComplete: () => {
          stepping = false
          lastWheel = performance.now()
        },
      })
    }
    // Ir a una parada desde la página (al elegir una misión en la bitácora), con el mismo recorrido que la rueda.
    goToStop.current = (index: number) => {
      const top = root.offsetTop
      const span = root.offsetHeight - window.innerHeight
      stepping = true
      lenis.scrollTo(top + (index / LAST) * span, {
        duration: STEP.duration,
        easing: easeInOut,
        lock: true,
        force: true,
        onComplete: () => {
          stepping = false
          lastWheel = performance.now()
        },
      })
    }
    // En captura, antes que Lenis: así la rueda no se suma al recorrido.
    document.addEventListener("wheel", onWheel, { passive: false, capture: true })
    // Un solo reloj para todo: primero avanza el scroll y después se dibuja la escena, una vez por cuadro.
    let dawnDone = false
    const tick = (time: number) => {
      lenis.raf(time * 1000)
      const now = performance.now()
      if (handle && !dawnDone) {
        // El amanecer de la entrada: el día avanza y el Sol sale de verdad por detrás del horizonte.
        const t = introTime()
        const k = clamp01((t - DAWN.from) / (DAWN.to - DAWN.from))
        handle.flight.setIntroDay(SUNRISE_FROM + (HERO_DAY - SUNRISE_FROM) * smooth(k))
        if (k >= 1) {
          handle.flight.setIntroDay(null)
          dawnDone = true
        }
      }
      handle?.flight.frame(now)
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
    // La pantalla de carga: cada paso ocupa un tramo de la barra.
    const span: Record<LoadStep, [number, number]> = { terrain: [16, 72], mesh: [74, 84], light: [86, 98] }
    const loaded = () => {
      if (cancelled) return
      setLoad({ step: "done", pct: 100 })
      window.dispatchEvent(new Event("flight:loaded"))
    }
    ready
      .then(() => import("./createFlight"))
      .then(async (module) => {
        if (cancelled) return
        setLoad({ step: "terrain", pct: 16 })
        const small = Math.min(window.innerWidth, window.innerHeight) < 700
        const created = await module.createFlight(canvasEl, {
          palette: palette(),
          quality: small || (navigator.hardwareConcurrency ?? 8) <= 2 ? "low" : "high",
          // El antialiasing por hardware sale barato en gráficas de móvil y caro en una integrada de escritorio.
          antialias: window.matchMedia("(pointer: coarse)").matches,
          onReady: () => {
            if (cancelled) return
            setReady(true)
            loaded()
          },
          onFrame,
          onProgress: (step, fraction) => {
            if (cancelled) return
            const [from, to] = span[step]
            setLoad({ step, pct: Math.round(from + (to - from) * fraction) })
          },
        })
        if (cancelled) {
          created.flight.dispose()
          return
        }
        handle = created
        handleRef.current = created
        setSites(created.sites)
        aimPoints(created, selectedRef.current, chosenRef.current)
        if (import.meta.env.DEV) (window as unknown as { __flight?: FlightHandle }).__flight = created
        resize()
        apply()
      })
      .catch((error) => {
        // Sin escena la página sigue completa: queda el dibujo 2D del inicio y la lámina fija de fondo.
        console.warn("Flight scene unavailable:", error)
        loaded()
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
      document.removeEventListener("wheel", onWheel, { capture: true })
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
  const readouts: Record<string, { key: string; label: string; value: string; meter?: boolean }> = {
    link: { key: "link", label: opening.status.link, value: earthNow.visible ? opening.status.linked : opening.status.unlinked },
    earth: { key: "earth", label: opening.status.earth, value: `${earthEl.toFixed(1)}°` },
    power: { key: "power", label: opening.status.power, value: `${sky.ground.panelWm2[STATUS_HOUR]} W/m²`, meter: true },
    site: { key: "site", label: opening.status.site, value: hud.site.split(", ")[0] },
    earthLeft: { key: "earthLeft", label: earthNow.visible ? opening.status.earthLeft : opening.status.earthIn, value: earthNow.hours === null ? "-" : span(earthNow.hours) },
  }
  /** Una lectura del HUD: rótulo y valor; el enlace lleva el icono del wifi y la potencia su medidor. */
  const item = (r: (typeof readouts)[string], wifi = false) => (
    <div className="fl-hud__item" key={r.key}>
      <dt>{r.label}</dt>
      <dd data-state="on" ref={(el) => void (cellEls.current[r.key] = el)}>
        {wifi && (
          <svg className="fl-wifi" viewBox="0 0 24 18" aria-hidden="true">
            <circle cx="12" cy="15.2" r="1.7" />
            <path d="M8.1 11.4a5.6 5.6 0 0 1 7.8 0" />
            <path d="M4.9 8.2a10.1 10.1 0 0 1 14.2 0" />
            <path d="M1.7 5a14.6 14.6 0 0 1 20.6 0" />
          </svg>
        )}
        <span className="fl-status__value" data-final={r.value}>
          {r.value}
        </span>
      </dd>
      {r.meter && (
        <span className="fl-meter" aria-hidden="true">
          <i ref={meterEl} />
        </span>
      )}
    </div>
  )

  return (
    <section
      ref={container}
      className="fl"
      data-mode={mode}
      data-ready={ready}
      data-loaded={load.step === "done"}
      style={mode === "live" ? { height: `calc(${LAST * LEG_VH}vh + 100lvh)` } : undefined}
      aria-label={tr("The lunar south pole, from chart to surface", "El polo sur lunar, de la lámina a la superficie")}
    >
      <div ref={stage} className="fl__stage">
        <img className="fl__poster" src={poster} alt="" width={1585} height={1000} decoding="async" />
        <canvas ref={canvas} className="fl__canvas" aria-hidden="true" />

        <div className="fl__limb" ref={limbEl} aria-hidden="true">
          {/* El cielo: estrellas, la franja de la Vía Láctea y una nave que lo cruza. */}
          <svg className="fl-limb__sky">
            <defs>
              <radialGradient id="fl-milky">
                <stop offset="0" stopColor="#c9c3d8" stopOpacity="0.09" />
                <stop offset="0.6" stopColor="#8f88a8" stopOpacity="0.03" />
                <stop offset="1" stopColor="#8f88a8" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse data-part="milky" fill="url(#fl-milky)" />
            <path data-part="stars-dim" stroke="#d8d4cc" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
            <path data-part="stars-mid" stroke="#eeeae2" strokeOpacity="0.75" strokeWidth="1.5" strokeLinecap="round" />
            <path className="fl-stars--twinkle" data-part="stars-bright" stroke="#fffaf0" strokeWidth="2.2" strokeLinecap="round" />
            {/* Una nave en órbita: cuerpo, dos paneles solares y su luz de posición. */}
            <g data-part="ship-track">
              <g className="fl-ship">
                <rect x="-11" y="-2.5" width="9" height="5" fill="#2c3b57" stroke="#5d7092" strokeWidth="0.5" />
                <rect x="2" y="-2.5" width="9" height="5" fill="#2c3b57" stroke="#5d7092" strokeWidth="0.5" />
                <path d="M-6.5 -2.5V2.5M6.5 -2.5V2.5" stroke="#5d7092" strokeWidth="0.4" />
                <rect x="-2.2" y="-3.6" width="4.4" height="7.2" rx="1" fill="#d9d3c6" />
                <circle className="fl-ship__light" cx="0" cy="-4.6" r="0.9" fill="#ff5a5a" />
              </g>
            </g>
          </svg>

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
                <radialGradient id="fl-bloom">
                  <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="0.6" stopColor="#fff6e0" stopOpacity="0.4" />
                  <stop offset="1" stopColor="#ffeac2" stopOpacity="0" />
                </radialGradient>
                {/* El disco: blanco puro en el centro y algo más cálido hacia el borde (oscurecimiento del limbo). */}
                <radialGradient id="fl-disc">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="0.7" stopColor="#fffcf3" />
                  <stop offset="1" stopColor="#ffeccc" />
                </radialGradient>
                <radialGradient id="fl-ray" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="9">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
                  <stop offset="0.35" stopColor="#fff4dc" stopOpacity="0.25" />
                  <stop offset="1" stopColor="#fff4dc" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle data-part="glow" fill="url(#fl-glow)" />
              {/* Los destellos de la cámara: rayos finos que salen del Sol. */}
              <g data-part="rays">
                <g className="fl-sun__rays" fill="url(#fl-ray)">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                    <path key={angle} d={angle % 90 === 0 ? "M-0.07 0L0 -9L0.07 0Z" : "M-0.05 0L0 -5.5L0.05 0Z"} transform={`rotate(${angle})`} />
                  ))}
                  <path d="M0 -0.05L-13 0L0 0.05L13 0Z" opacity="0.6" />
                </g>
              </g>
              <circle data-part="bloom" fill="url(#fl-bloom)" />
              <circle data-part="sun" fill="url(#fl-disc)" />
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
              <g clipPath="url(#fl-clip-near)">
                <rect data-part="near-box" filter="url(#fl-regolith-near)" />
                <rect data-part="near-box" fill="url(#fl-shade-near)" />
              </g>
            </svg>
          </div>

          <svg className="fl-limb__art" ref={signalEl}>
          </svg>
        </div>

        {/* La pantalla de carga: el relieve 3D real tarda unos segundos; la entrada empieza cuando está listo. */}
        {mode === "live" && (
          <div className="fl-loader" role="status" aria-live="polite" aria-hidden={load.step === "done"}>
            <p className="fl-loader__title">{loading.title}</p>
            <p className="fl-loader__pct">
              {load.pct}
              <span>%</span>
            </p>
            <span className="fl-loader__bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${load.pct / 100})` }} />
            </span>
            <p className="fl-loader__step">{loading.steps[load.step]}</p>
            <p className="fl-loader__source">{loading.source}</p>
          </div>
        )}

        {/* El idioma, con el estilo de las preguntas del vuelo. */}
        {askLang && (
          <div className="fl-lang">
            <div className="fl-lang__card" role="dialog" aria-modal="true" aria-labelledby="fl-lang-title">
              <p className="fl-quiz__label">{chooseLanguage.label}</p>
              <h2 className="fl-scene__title" id="fl-lang-title">
                {chooseLanguage.title}
              </h2>
              <div className="fl-quiz__options">
                {chooseLanguage.options.map((option) => (
                  <button key={option.lang} type="button" onClick={() => choose(option.lang)}>
                    {option.name}
                  </button>
                ))}
              </div>
              <button type="button" className="fl-quiz__show" onClick={resume}>
                {chooseLanguage.skip}
              </button>
            </div>
          </div>
        )}

        {mode === "live" && (
          <div className="fl__marks" aria-hidden="true">
            <div className="fl-mark fl-mark--body" ref={(el) => void (markEls.current.sun = el)}>
              <span className="fl-mark__label">{tr("Sun", "Sol")}</span>
            </div>
            <div className="fl-mark fl-mark--body" ref={(el) => void (markEls.current.earth = el)}>
              <span className="fl-mark__label">{tr("Earth", "Tierra")}</span>
            </div>
            <div className="fl-mark fl-mark--site" ref={(el) => void (markEls.current.site = el)}>
              <span className="fl-mark__label">Connecting Ridge</span>
            </div>
            {MISSION_SITES.map((entry) => (
              <div
                key={entry.site}
                className="fl-mark fl-mark--mission"
                data-status={entry.status}
                data-side={entry.side}
                data-focus={focusMission !== null && entry.ids.includes(focusMission) ? "" : undefined}
                ref={(el) => void (markEls.current[`m:${entry.site}`] = el)}
              >
                <i className="fl-mark__pin" />
                <span className="fl-mark__label">{entry.ids.join(" · ")}</span>
              </div>
            ))}
            {pointMissions
              .find((m) => m.id === selectedMission)
              ?.points.map((id, n) => (
                <button
                  key={id}
                  type="button"
                  className="fl-mark fl-mark--plan"
                  aria-label={`${n + 1} · ${sites?.[id]?.name ?? id}`}
                  data-focus={focusPoint === id ? "" : undefined}
                  data-side={n === 1 ? "left" : "right"}
                  onClick={() => pickPoint(n)}
                  onPointerEnter={() => setFocusPoint(id)}
                  onPointerLeave={() => setFocusPoint(null)}
                  ref={(el) => void (markEls.current[`p${n}`] = el)}
                >
                  <i className="fl-mark__num">{n + 1}</i>
                  <span className="fl-mark__label">{sites?.[id]?.name ?? id}</span>
                </button>
              ))}
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
            {/*
              El HUD del módulo, flotando sobre el paisaje sin tarjetas. Arriba: el enlace con la Tierra (wifi), la luz
              "Live" y la fecha con la cuenta atrás hasta el amanecer. Abajo, sobre el terreno: energía y datos del sitio.
              Al principio solo se ven el enlace, "Live" (apagados) y la fecha; lo demás llega con el Sol.
            */}
            <div className="fl-hero__status" ref={statusEl} role="group" aria-label={`${hud.site}: ${opening.status.title}`}>
              <dl className="fl-hud fl-hud--tl">{item(readouts.link, true)}</dl>
              <p className="fl-live" ref={liveEl} data-state="on" aria-hidden="true">
                <i />
                Live
              </p>
              <p className="fl-hud fl-hud--tr fl-clock" aria-hidden="true">
                <span className="fl-clock__time">{stamp(STATUS_HOUR)}</span>
                <span className="fl-clock__count" ref={countEl} />
              </p>
              <dl className="fl-hud fl-hud--bl">
                {item(readouts.power)}
                {item(readouts.earth)}
              </dl>
              <dl className="fl-hud fl-hud--br">
                {item(readouts.site)}
                {item(readouts.earthLeft)}
              </dl>
            </div>
          </article>

          {rest.map((scene, i) => (
            <article key={scene.id} className="fl-scene fl-scene--panel" data-lenis-prevent data-scene={scene.id} id={`scene-${scene.id}`} ref={(el) => void (sceneEls.current[i + 1] = el)}>
              {scene.id === "missions" ? (
                <MissionLog scene={scene} selected={selectedMission} onFocus={setFocusMission} onSelect={(id) => selectMission(id, true)} />
              ) : scene.id === "points" ? (
                <MissionPoints
                  selected={selectedMission}
                  sites={sites}
                  onSelect={(id) => selectMission(id, false)}
                  onFocus={setFocusPoint}
                  onPick={pickPoint}
                />
              ) : scene.id === "point" ? (
                <PointDetail index={chosenPoint} selected={selectedMission} sites={sites} onBack={() => goToStop.current(POINTS_STOP)} />
              ) : (
                <ScenePanel scene={scene} open={mode === "static"} />
              )}
            </article>
          ))}
        </div>

      </div>
    </section>
  )
}
