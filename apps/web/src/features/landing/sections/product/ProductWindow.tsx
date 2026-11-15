import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react"
import { tr } from "@/shared/i18n"
import { software as copy } from "../../content"
import { Reveal } from "../Reveal"
import { CalendarView } from "./CalendarView"
import { CompareView } from "./CompareView"
import { HorizonScene } from "./HorizonScene"
import { LanderView } from "./LanderView"
import { LearnView } from "./LearnView"
import { MapView } from "./MapView"
import { PlanBView } from "./PlanBView"
import { darkness, type HeightId, LAST, sky, spotlight, tempo } from "./sky"
import "./product.css"

type Tab = keyof typeof copy.tabs
const TABS = Object.keys(copy.tabs) as Tab[]
/** Pestañas en las que el tiempo corre solo. */
const TIMED: Tab[] = ["lander", "compare"]

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

/**
 * La ventana del producto: las pantallas del software funcionando dentro de la landing, con datos reales.
 *
 * No lleva barra propia: el selector de vistas va encima, con los controles de la página. En la vista Lander toda
 * la pantalla sigue al Sol del sitio: papel mientras está a la vista, cada vez más oscura según se acerca la puesta
 * y negra cuando se oculta; al acercarse la salida vuelve a aclarar. Solo ocurre con la ventana en pantalla: al
 * seguir bajando, la página recupera el papel. Detrás de la vista va el horizonte del sitio (`HorizonScene`): el
 * Sol rasante se esconde tras el relieve justo cuando la cuenta cambia.
 */
export function ProductWindow() {
  // La ventana abre en "Compare sites": la comparación de sitios es lo primero que se ve.
  const [tab, setTab] = useState<Tab>("compare")
  const [height, setHeight] = useState<HeightId>("ground")
  const [t, setT] = useState(11 * 24)
  const [playing, setPlaying] = useState(false)
  /** Cuánto de la ventana hay en pantalla, de 0 a 1: la noche de la página entra y sale con ella. */
  const [presence, setPresence] = useState(0)
  const touched = useRef(false)
  const frame = useRef<HTMLDivElement>(null)

  // El tiempo avanza solo cuando la ventana entra en pantalla, hasta que alguien la toca.
  useEffect(() => {
    const el = frame.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let wasIn = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        // La parte visible se mide contra lo que cabe en pantalla: en un teléfono la ventana es más alta que ella.
        const room = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height ?? window.innerHeight) || 1
        const seen = clamp01(entry.intersectionRect.height / room)
        const eased = clamp01((seen - 0.15) / 0.45)
        setPresence(eased * eased * (3 - 2 * eased))
        const isIn = seen >= 0.3
        if (isIn === wasIn) return
        wasIn = isIn
        if (!isIn) setPlaying(false)
        else if (!touched.current && !reduced) setPlaying(true)
      },
      { threshold: Array.from({ length: 41 }, (_, i) => i / 40) },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const running = playing && TIMED.includes(tab)
  useEffect(() => {
    if (!running) return
    let id = 0
    let last = performance.now()
    const step = (now: number) => {
      // El día lunar entero en unos 45 segundos, más lo que se frena en la puesta y en la salida del Sol.
      const dt = Math.min(now - last, 100)
      last = now
      setT((value) => (value + (dt / 1000) * (LAST / 45) * (tab === "lander" ? tempo(sky[height].windows.sun, value) : 1)) % LAST)
      id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [running, tab, height])

  // Día y noche. La oscuridad sale de las ventanas de Sol del sitio; fuera de la vista Lander, o con la ventana
  // fuera de pantalla, la página va en papel. Los dos valores se escriben en la raíz de la landing (`.ln`), de la
  // que cuelgan todos los colores: así cambia la pantalla entera y no solo la ventana.
  const night = tab === "lander" ? darkness(sky[height].windows.sun, t) * presence : 0
  const shade = useRef({ shown: 0, target: 0, painted: -1, raf: 0, last: 0 })
  useEffect(() => {
    const root = frame.current?.closest<HTMLElement>(".ln")
    if (!root) return
    const state = shade.current
    state.target = night
    const paint = () => {
      // Centésimas: de un cuadro a otro casi no cambia, y cada cambio repinta la página entera.
      const value = Math.round(state.shown * 100) / 100
      if (value === state.painted) return
      state.painted = value
      root.style.setProperty("--night", String(value))
      // La tinta cambia de oscura a clara en un tramo corto a mitad del fundido.
      const ink = clamp01((value - 0.5) / 0.1)
      root.style.setProperty("--night-text", (ink * ink * (3 - 2 * ink)).toFixed(3))
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.shown = night
      paint()
      return
    }
    // Sigue al valor pedido con suavidad: con el tiempo corriendo apenas se nota; al saltar en la línea de
    // tiempo evita el golpe de blanco a negro. Va por tiempo, no por cuadros: tarda lo mismo en un equipo lento.
    const step = (now: number) => {
      const dt = Math.min(now - state.last, 400)
      state.last = now
      const gap = state.target - state.shown
      state.shown = Math.abs(gap) < 0.004 ? state.target : state.shown + gap * (1 - Math.exp(-dt / 110))
      paint()
      state.raf = state.shown === state.target ? 0 : requestAnimationFrame(step)
    }
    if (!state.raf) {
      state.last = performance.now()
      state.raf = requestAnimationFrame(step)
    }
  }, [night])
  useEffect(() => {
    const state = shade.current
    const root = frame.current?.closest<HTMLElement>(".ln")
    return () => {
      // Al salir de la landing se suelta el cuadro pendiente y la página vuelve al día.
      cancelAnimationFrame(state.raf)
      state.raf = 0
      root?.style.removeProperty("--night")
      root?.style.removeProperty("--night-text")
    }
  }, [])

  // La escena de fondo lee la hora de aquí cuadro a cuadro, sin volver a pintar React.
  const clock = useRef(t)
  clock.current = t
  const scene = tab === "lander" ? presence : 0
  // El momento de la puesta: con el reloj corriendo, la ventana se aparta y deja el paisaje a pantalla completa;
  // quedan la cuenta del Sol, la fecha y el botón de pausa. Al pausar o tocar la línea de tiempo, vuelve.
  const cinema = tab === "lander" && running ? spotlight(sky[height].windows.sun, t) * presence : 0
  const spot = useRef(cinema)
  spot.current = cinema

  const take = useCallback((value: number) => {
    touched.current = true
    setPlaying(false)
    setT(Math.min(Math.max(value, 0), LAST))
  }, [])
  const toggle = () => {
    touched.current = true
    setPlaying((value) => !value)
  }

  return (
    // `--scene` dice cuánto se ve el horizonte de fondo: entra con la ventana y solo en la vista Lander.
    <section className="ln-sec" id="software" style={{ "--scene": scene, "--cinema": cinema.toFixed(3) } as CSSProperties}>
      <HorizonScene time={clock} horizon={sky[height].horizon} sunWindows={sky[height].windows.sun} earthWindows={sky[height].windows.earth} level={shade} cinema={spot} active={scene > 0} />
      <div className="ln-wrap">
        <Reveal as="h2" className="ln-title" wipe>
          {copy.title}
        </Reveal>
        <Reveal as="p" className="ln-lede" delay={80}>
          {copy.body}
        </Reveal>

        <Reveal className="sw-views" role="tablist" aria-label={tr("Software views", "Vistas del software")} delay={100}>
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" id={`sw-tab-${id}`} aria-selected={tab === id} aria-controls="sw-panel" onClick={() => setTab(id)}>
              {copy.tabs[id]}
            </button>
          ))}
        </Reveal>

        <Reveal className="sw-frame" delay={120}>
          <div className="sw" ref={frame} data-view={tab}>
            <div className="sw__panel" role="tabpanel" id="sw-panel" aria-labelledby={`sw-tab-${tab}`}>
              {tab === "lander" && <LanderView t={t} height={height} playing={playing} onTime={take} onPlay={toggle} onHeight={setHeight} />}
              {tab === "compare" && <CompareView t={t} />}
              {tab === "calendar" && <CalendarView />}
              {tab === "map" && <MapView />}
              {tab === "planb" && <PlanBView />}
              {tab === "learn" && <LearnView />}
            </div>
          </div>
          {/* La nota de la vista va fuera de la ventana, como pie de figura: dentro solo queda lo que se usa. */}
          {tab === "lander" && <p className="sw-caption">{copy.lander.note}</p>}
        </Reveal>
      </div>
    </section>
  )
}
