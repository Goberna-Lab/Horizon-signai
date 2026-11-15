import { type RefObject, useEffect, useMemo, useRef } from "react"
import layersData from "../data/horizon.json"
import { DUSK_H } from "./sky"

/**
 * El fondo de la vista Lander: lo que vería una persona de pie en el sitio durante un día lunar.
 *
 * El Sol es el protagonista del cambio y solo aparece entonces: en las horas previas a la puesta baja, grande y en
 * el centro, hasta hundirse tras la cresta justo cuando la cuenta pasa a "Sunrise in"; al amanecer sale igual y
 * se desvanece al subir. El resto del día la página queda limpia, y de noche quedan las estrellas.
 *
 * Capas, de atrás hacia delante, cada una con su profundidad (parallax con el puntero y con el scroll):
 *   - Estrellas: solo de noche.
 *   - El Sol, con su resplandor.
 *   - Montañas lejanas y cresta cercana: el horizonte real de Connecting Ridge (`sky.json` y `data/horizon.json`),
 *     mirando hacia el oeste. La luz del Sol las aclara por el lado desde el que llega.
 *   - Suelo en primer plano: decorativo.
 *
 * Qué no es exacto: es una vista pensada para que se lea la puesta y la salida, no una simulación. En el polo
 * el Sol real no baja así: se desliza casi a ras del horizonte hasta que una cresta lo tapa, y su disco es mucho
 * más pequeño. Lo exacto son el relieve y las horas de salida y puesta.
 */

type HorizonSceneProps = {
  /** Hora del día lunar que se está mostrando. */
  time: RefObject<number>
  /** Horizonte real del observador, un valor por grado de rumbo (grados). */
  horizon: number[]
  /** Ventanas en las que el Sol se ve desde el sitio (horas del día lunar). */
  sunWindows: number[][]
  /** Oscuridad que se está mostrando ahora, de 0 a 1 (la escribe ProductWindow cuadro a cuadro). */
  level: RefObject<{ shown: number }>
  /** La vista está en pantalla: la escena se dibuja. */
  active: boolean
}

type Rgb = [number, number, number]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (c: Rgb, alpha = 1) => `rgb(${c[0].toFixed(0)} ${c[1].toFixed(0)} ${c[2].toFixed(0)} / ${alpha.toFixed(3)})`
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const smooth = (x: number) => x * x * (3 - 2 * x)
const wrap = (az: number) => ((Math.round(az) % 360) + 360) % 360

/** Tonos del regolito: arriba y abajo de cada capa, de día y de noche. */
const TONES = {
  back: { day: [[205, 200, 191], [158, 153, 145]] as Rgb[], night: [[44, 42, 40], [30, 29, 27]] as Rgb[] },
  front: { day: [[176, 171, 162], [112, 108, 101]] as Rgb[], night: [[32, 31, 29], [20, 19, 18]] as Rgb[] },
  ground: { day: [[104, 100, 94], [40, 38, 35]] as Rgb[], night: [[16, 16, 15], [6, 6, 6]] as Rgb[] },
}
const STAR: Rgb = [244, 239, 230]
/** Rumbo del centro de la vista: el oeste, donde el terreno cae y asoman las montañas lejanas. */
const CENTRE_AZ = 262

function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Estrellas: posición en fracciones de la pantalla, tamaño y brillo. Siempre las mismas. */
const STARS = (() => {
  const random = mulberry(20261218)
  return Array.from({ length: 260 }, () => ({ x: random(), y: Math.pow(random(), 1.3) * 0.86, size: 0.8 + random() * 1.4, alpha: 0.25 + random() * 0.65 }))
})()

/** Separa el horizonte real en la cresta cercana y las montañas lejanas que asoman donde el terreno cae. */
function split(real: number[]): { back: number[]; front: number[] } {
  const back: number[] = []
  const front: number[] = []
  for (let az = 0; az < 360; az++) {
    const mountains = real[az] - layersData.far[az] < 0.25
    back[az] = mountains ? real[az] : Math.min(layersData.far[az], real[az] - 0.2)
    front[az] = mountains ? Math.min(layersData.near[az], real[az] - 0.35) : real[az]
  }
  return { back, front }
}

const groundAt = (az: number) => -4.4 + 0.42 * Math.sin((az * Math.PI) / 23.5 + 1.3) + 0.24 * Math.sin((az * Math.PI) / 9.5)

export function HorizonScene({ time, horizon, sunWindows, level, active }: HorizonSceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wanted = useRef(active)
  wanted.current = active
  const start = useRef<() => void>(() => {})
  const profiles = useMemo(() => ({ real: horizon, ...split(horizon) }), [horizon])
  const current = useRef(profiles)
  current.current = profiles
  const windows = useRef(sunWindows)
  windows.current = sunWindows

  useEffect(() => {
    const el = canvas.current
    const context = el?.getContext("2d")
    if (!el || !context) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let width = 0
    let height = 0
    let ratio = 1
    let raf = 0
    let last = 0
    let drawn = ""
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }

    const resize = () => {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      width = box.width
      height = box.height
      ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      el.width = Math.round(width * ratio)
      el.height = Math.round(height * ratio)
      drawn = ""
      draw(0)
    }

    const draw = (dt: number) => {
      if (width === 0) return
      const { real, back, front } = current.current
      const night = clamp01(level.current.shown)
      // Solo se vuelve a dibujar si algo cambió: la hora, la luz, el puntero o el scroll.
      const settle = dt > 0 ? 1 - Math.exp(-dt / 0.3) : 1
      pointer.x += (pointer.tx - pointer.x) * settle
      pointer.y += (pointer.ty - pointer.y) * settle
      const top = el.parentElement ? el.parentElement.getBoundingClientRect().top : 0
      const key = `${time.current.toFixed(3)}|${night.toFixed(3)}|${pointer.x.toFixed(3)}|${pointer.y.toFixed(3)}|${top.toFixed(0)}|${real.length}|${real[0]}`
      if (key === drawn) return
      drawn = key
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)

      const sy = Math.min(Math.max(height * 0.046, 24), 46)
      const sx = Math.max(sy / 1.7, width / 150)
      const zero = height * 0.76
      const travel = Math.min(Math.max(-top / Math.max(height, 1), -1), 1.5)
      const shift = (depth: number) => ({ x: -pointer.x * 54 * depth, y: -pointer.y * 15 * depth - travel * 72 * depth })
      const azAt = (x: number, dx: number) => CENTRE_AZ + (x - dx - width / 2) / sx
      const yOf = (elevation: number, dy: number) => zero - elevation * sy + dy

      // --- El Sol: solo en el cambio --------------------------------------------------------------------
      // Aparece en las horas previas a la puesta y en las que siguen a la salida, grande y en el centro. `phase`
      // va de 0 (justo en el horizonte, oculto) a 1 (ya alto, donde se desvanece). El resto del día no se dibuja.
      const hour = time.current
      const open = windows.current.find(([from, to]) => hour >= from && hour < to)
      const phase = open ? clamp01(Math.min(hour - open[0], open[1] - hour) / DUSK_H) : 0
      const presence = open ? 1 - smooth(clamp01((phase - 0.7) / 0.3)) : 0
      const sunR = Math.max(64, Math.min(height * 0.2, width * 0.22))
      const frontMove = shift(0.45)
      const sunX = width / 2
      const crestY = yOf(real[wrap(azAt(sunX, frontMove.x))], frontMove.y)
      // En el horizonte el disco queda entero bajo la cresta; al subir asoma hasta casi despegarse de ella.
      const sunY = crestY + sunR * (1.12 - 2.05 * smooth(phase))
      const light = presence * smooth(clamp01(phase * 4))

      // --- Estrellas ---------------------------------------------------------------------------------------
      const stars = smooth(clamp01((night - 0.75) / 0.25))
      if (stars > 0) {
        context.fillStyle = css(STAR)
        for (const star of STARS) {
          context.globalAlpha = star.alpha * stars
          context.fillRect(star.x * width, star.y * zero, star.size, star.size)
        }
        context.globalAlpha = 1
      }

      // Resplandor y disco. Se dibujan antes que el relieve: el horizonte los tapa.
      if (presence > 0.005) {
        context.globalAlpha = presence
        // Luz sobre el horizonte: una franja ancha y baja, más intensa cuanto más cerca está el Sol de la cresta.
        context.save()
        context.translate(sunX, crestY)
        context.scale(1, 0.42)
        const wash = context.createRadialGradient(0, 0, 0, 0, 0, width * 0.62)
        wash.addColorStop(0, `rgb(255 150 70 / ${(0.5 * (1 - phase * 0.5)).toFixed(3)})`)
        wash.addColorStop(0.35, "rgb(255 120 60 / 0.2)")
        wash.addColorStop(1, "rgb(255 110 60 / 0)")
        context.fillStyle = wash
        context.fillRect(-width, -height * 2, width * 2, height * 4)
        context.restore()
        // Halo alrededor del disco.
        const halo = context.createRadialGradient(sunX, sunY, sunR * 0.9, sunX, sunY, sunR * 2.4)
        halo.addColorStop(0, "rgb(255 170 80 / 0.55)")
        halo.addColorStop(0.4, "rgb(255 140 70 / 0.2)")
        halo.addColorStop(1, "rgb(255 130 70 / 0)")
        context.fillStyle = halo
        context.beginPath()
        context.arc(sunX, sunY, sunR * 2.4, 0, Math.PI * 2)
        context.fill()
        // El disco: dorado arriba y rojo anaranjado hacia el horizonte, con el centro más claro.
        const disc = context.createLinearGradient(0, sunY - sunR, 0, sunY + sunR)
        disc.addColorStop(0, "rgb(255 226 150)")
        disc.addColorStop(0.45, "rgb(255 170 78)")
        disc.addColorStop(1, "rgb(240 78 44)")
        context.fillStyle = disc
        context.beginPath()
        context.arc(sunX, sunY, sunR, 0, Math.PI * 2)
        context.fill()
        const core = context.createRadialGradient(sunX, sunY - sunR * 0.25, 0, sunX, sunY - sunR * 0.25, sunR * 0.9)
        core.addColorStop(0, "rgb(255 250 225 / 0.7)")
        core.addColorStop(1, "rgb(255 240 200 / 0)")
        context.fillStyle = core
        context.beginPath()
        context.arc(sunX, sunY, sunR, 0, Math.PI * 2)
        context.fill()
        context.globalAlpha = 1
      }

      // --- Relieve: de las montañas lejanas al suelo -------------------------------------------------------
      const layers: Array<{ profile: (az: number) => number; depth: number; tone: keyof typeof TONES }> = [
        { profile: (az) => back[wrap(az)], depth: 0.18, tone: "back" },
        { profile: (az) => front[wrap(az)], depth: 0.45, tone: "front" },
        { profile: groundAt, depth: 1, tone: "ground" },
      ]
      for (const layer of layers) {
        const move = shift(layer.depth)
        const xOf = (az: number) => width / 2 + (az - CENTRE_AZ) * sx + move.x
        const first = Math.floor(azAt(-40, move.x)) - 1
        const lastAz = Math.ceil(azAt(width + 40, move.x)) + 1
        const crest = new Path2D()
        let px = xOf(first)
        let py = yOf(layer.profile(first), move.y)
        let highest = py
        crest.moveTo(px, py)
        for (let az = first + 1; az <= lastAz; az++) {
          const x = xOf(az)
          const y = yOf(layer.profile(az), move.y)
          crest.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2)
          px = x
          py = y
          if (y < highest) highest = y
        }
        crest.lineTo(px, py)
        const body = new Path2D(crest)
        body.lineTo(px, height + 40)
        body.lineTo(xOf(first), height + 40)
        body.closePath()

        // El regolito: más claro arriba, donde le da la luz, y más oscuro hacia quien mira.
        const tone = TONES[layer.tone]
        const fill = context.createLinearGradient(0, highest, 0, height)
        fill.addColorStop(0, css(mix(tone.day[0], tone.night[0], night)))
        fill.addColorStop(1, css(mix(tone.day[1], tone.night[1], night)))
        context.fillStyle = fill
        context.fill(body)

        // La luz del Sol sobre el terreno: se aclara por el lado desde el que llega.
        if (light > 0.01) {
          context.save()
          context.clip(body)
          const pool = context.createRadialGradient(sunX, Math.max(sunY, highest), 0, sunX, Math.max(sunY, highest), width * 0.5)
          pool.addColorStop(0, `rgb(255 176 96 / ${(0.5 * light).toFixed(3)})`)
          pool.addColorStop(1, "rgb(255 170 90 / 0)")
          context.fillStyle = pool
          context.fillRect(0, highest - 4, width, height - highest + 4)
          context.restore()
        }

        // Un filo de luz en la cresta.
        context.lineWidth = 1
        context.strokeStyle = night > 0.5 ? css(STAR, 0.16) : `rgb(255 252 240 / ${(0.55 * (1 - night)).toFixed(3)})`
        context.stroke(crest)
      }
    }

    const frame = (now: number) => {
      // A 30 cuadros por segundo: el paisaje se mueve despacio y así deja sitio al resto de la página.
      if (now - last >= 30) {
        const dt = Math.min((now - last) / 1000, 0.1)
        last = now
        draw(still ? 0 : dt)
      }
      raf = wanted.current ? requestAnimationFrame(frame) : 0
    }
    start.current = () => {
      if (raf) return
      if (width === 0) resize()
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || still) return
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener("pointermove", move, { passive: true })
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    if (wanted.current) start.current()

    return () => {
      cancelAnimationFrame(raf)
      raf = 0
      window.removeEventListener("pointermove", move)
      observer.disconnect()
      start.current = () => {}
    }
  }, [level, time])

  useEffect(() => {
    if (active) start.current()
  }, [active])

  return (
    <div className="sw-sky" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  )
}
