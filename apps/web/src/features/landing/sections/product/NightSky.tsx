import { type RefObject, useEffect, useRef } from "react"

/**
 * El cielo de noche de la página: estrellas en tres profundidades y una galaxia en espiral que gira despacio.
 * Solo existe mientras es de noche en la ventana del software (cuando la cuenta pasa a "Sunrise in"): entra con
 * el último tramo del anochecer y se va al amanecer.
 *
 * Es decoración, no dato: las estrellas se reparten al azar (siempre igual, con una semilla fija) y la espiral no
 * representa ningún objeto real. Se dibuja con puntos cuadrados, como una carta estelar impresa: sin degradados
 * ni brillos.
 *
 * Profundidad (parallax): las capas cercanas se mueven más que las lejanas con el puntero y con el scroll, y al
 * entrar la noche llegan desde un poco más lejos. Con "reducir movimiento" el cielo se queda quieto.
 */

type Star = {
  /** Posición en polares alrededor del centro del cielo (px y radianes). */
  radius: number
  angle: number
  size: number
  alpha: number
  /** Velocidad y fase del parpadeo; 0 si no parpadea. */
  twinkle: number
  phase: number
  /** 0 blanco, 1 rojo de señal, 2 azul de la Tierra. */
  tint: 0 | 1 | 2
}

type Layer = {
  stars: Star[]
  /** 0 lejos, 1 cerca: cuánto responde al puntero, al scroll y a la entrada. */
  depth: number
  /** Vueltas por segundo (rad/s). */
  spin: number
  /** La galaxia va inclinada: su plano se aplasta y se gira. */
  tilt?: { squash: number; turn: number }
}

type Meteor = { x: number; y: number; vx: number; vy: number; born: number; life: number }

/** Azar repetible: el cielo es el mismo en cada visita. */
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

const TINTS = ["--ink-night", "--signal-night", "--earth-night"]
const TAU = Math.PI * 2

function buildLayers(width: number, height: number): Layer[] {
  const random = mulberry(20261201)
  // Las capas giran alrededor del centro: hay que cubrir el círculo que contiene la pantalla.
  const reach = Math.hypot(width, height) / 2 + 60
  const area = (Math.PI * reach * reach) / 1_000_000
  const scale = Math.min(1, 5200 / (area * 640))
  const field = (perMegapixel: number, size: [number, number], alpha: [number, number], twinkling: number): Star[] =>
    Array.from({ length: Math.round(area * perMegapixel * scale) }, () => {
      const colour = random()
      return {
        // Raíz cuadrada: reparto uniforme en el disco.
        radius: Math.sqrt(random()) * reach,
        angle: random() * TAU,
        size: size[0] + random() * (size[1] - size[0]),
        alpha: alpha[0] + random() * (alpha[1] - alpha[0]),
        twinkle: random() < twinkling ? 0.6 + random() * 2.2 : 0,
        phase: random() * TAU,
        tint: colour < 0.045 ? 1 : colour < 0.1 ? 2 : 0,
      }
    })

  // La galaxia: dos brazos en espiral logarítmica y un núcleo más denso. Ocupa buena parte de la pantalla y tiene
  // diez veces más puntos por superficie que el campo de estrellas: por eso se lee como una espiral.
  const galaxy: Star[] = []
  const armLength = Math.min(Math.max(Math.min(width, height) * 0.84, 320), 900)
  const count = Math.round(Math.min(Math.max(armLength * 7, 1800), 5600))
  for (let i = 0; i < count; i++) {
    const core = random() < 0.2
    const colour = random()
    if (core) {
      galaxy.push({
        radius: armLength * 0.12 * Math.pow(random(), 1.5),
        angle: random() * TAU,
        size: 0.9 + random() * 0.9,
        alpha: 0.4 + random() * 0.42,
        twinkle: random() < 0.1 ? 0.8 + random() * 1.6 : 0,
        phase: random() * TAU,
        tint: colour < 0.05 ? 1 : 0,
      })
      continue
    }
    const along = 0.07 + Math.pow(random(), 0.9) * 0.93
    const arm = random() < 0.5 ? 0 : Math.PI
    // Reparto triangular alrededor del eje del brazo, que se ensancha al alejarse del núcleo.
    const spread = (random() + random() - 1) * (0.2 + along * 0.26)
    galaxy.push({
      radius: along * armLength * (0.96 + random() * 0.08),
      angle: arm + Math.log(1 + along * 9) * 3.1 + spread,
      size: 0.7 + random() * 0.9,
      alpha: (0.3 + random() * 0.46) * (1 - along * 0.45),
      twinkle: random() < 0.07 ? 0.8 + random() * 1.6 : 0,
      phase: random() * TAU,
      tint: colour < 0.05 ? 1 : colour < 0.12 ? 2 : 0,
    })
  }

  return [
    { stars: field(360, [0.7, 1.1], [0.16, 0.42], 0.1), depth: 0.18, spin: TAU / 2400 },
    { stars: galaxy, depth: 0.42, spin: TAU / 640, tilt: { squash: 0.5, turn: -0.34 } },
    { stars: field(170, [1, 1.6], [0.34, 0.72], 0.22), depth: 0.66, spin: TAU / 1700 },
    { stars: field(46, [1.7, 2.6], [0.6, 0.95], 0.4), depth: 1, spin: TAU / 1300 },
  ]
}

type NightSkyProps = {
  /** Oscuridad que se está mostrando ahora, de 0 a 1 (la escribe ProductWindow cuadro a cuadro). */
  level: RefObject<{ shown: number }>
  /** Es de noche o está a punto de serlo: el cielo empieza a dibujarse. */
  active: boolean
}

/** A partir de qué oscuridad asoman las estrellas, y con cuánta están todas. */
export const STARS_FROM = 0.82
export const starsAt = (night: number) => {
  const x = Math.min(Math.max((night - STARS_FROM) / (1 - STARS_FROM), 0), 1)
  return x * x * (3 - 2 * x)
}

export function NightSky({ level, active }: NightSkyProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wanted = useRef(active)
  wanted.current = active
  const start = useRef<() => void>(() => {})

  useEffect(() => {
    const el = canvas.current
    const context = el?.getContext("2d")
    if (!el || !context) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const css = getComputedStyle(document.documentElement)
    const colours = TINTS.map((name) => css.getPropertyValue(name).trim() || "#f4efe6")

    let layers: Layer[] = []
    let width = 0
    let height = 0
    let ratio = 1
    let raf = 0
    let last = 0
    let clock = 0
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const meteors: Meteor[] = []
    let nextMeteor = 3

    const resize = () => {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      width = box.width
      height = box.height
      // En pantallas densas basta con algo más que un píxel por punto: el cielo no gana nitidez y cuesta el triple.
      ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      el.width = Math.round(width * ratio)
      el.height = Math.round(height * ratio)
      layers = buildLayers(width, height)
      draw(0)
    }

    const draw = (dt: number) => {
      const stars = starsAt(level.current.shown)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      if (stars <= 0 || layers.length === 0) return
      if (!still) clock += dt
      // El puntero se sigue con suavidad: el cielo se desliza, no salta.
      const follow = 1 - Math.exp(-dt / 0.28)
      pointer.x += (pointer.tx - pointer.x) * follow
      pointer.y += (pointer.ty - pointer.y) * follow
      // Cuánto ha pasado ya la ventana por la pantalla: el cielo sube un poco más despacio que la página.
      const travel = el.parentElement ? -el.parentElement.getBoundingClientRect().top / Math.max(height, 1) : 0
      const cx = width / 2
      const cy = height / 2
      // Entrada: las capas llegan desde un poco más lejos y terminan de girar al asentarse.
      const arriving = (1 - stars) * (1 - stars)

      for (const layer of layers) {
        const shiftX = -pointer.x * 26 * layer.depth
        const shiftY = -pointer.y * 18 * layer.depth - travel * 70 * layer.depth
        const zoom = 1 + arriving * 0.22 * layer.depth
        const turn = clock * layer.spin + arriving * 0.5 * layer.depth
        const squash = layer.tilt?.squash ?? 1
        const cos = Math.cos(layer.tilt?.turn ?? 0)
        const sin = Math.sin(layer.tilt?.turn ?? 0)
        for (let tint = 0; tint < 3; tint++) {
          context.fillStyle = colours[tint]
          for (const star of layer.stars) {
            if (star.tint !== tint) continue
            const angle = star.angle + turn
            const px = Math.cos(angle) * star.radius * zoom
            const py = Math.sin(angle) * star.radius * zoom * squash
            const x = cx + px * cos - py * sin + shiftX
            const y = cy + px * sin + py * cos + shiftY
            if (x < -3 || y < -3 || x > width + 3 || y > height + 3) continue
            const flicker = star.twinkle ? 0.72 + 0.28 * Math.sin(clock * star.twinkle + star.phase) : 1
            context.globalAlpha = star.alpha * flicker
            context.fillRect(x, y, star.size, star.size)
          }
        }
      }

      // Estrellas fugaces: un trazo corto, de vez en cuando.
      if (!still) {
        if (clock > nextMeteor) {
          const random = Math.random
          meteors.push({ x: width * (0.25 + random() * 0.75), y: height * random() * 0.45, vx: -(620 + random() * 380), vy: 300 + random() * 220, born: clock, life: 0.55 + random() * 0.4 })
          nextMeteor = clock + 4.5 + random() * 7
        }
        context.strokeStyle = colours[0]
        context.lineWidth = 1.4
        for (let i = meteors.length - 1; i >= 0; i--) {
          const meteor = meteors[i]
          const age = (clock - meteor.born) / meteor.life
          if (age >= 1) {
            meteors.splice(i, 1)
            continue
          }
          const hx = meteor.x + meteor.vx * (clock - meteor.born)
          const hy = meteor.y + meteor.vy * (clock - meteor.born)
          // La cola se dibuja en tramos cada vez más tenues.
          for (let k = 0; k < 6; k++) {
            context.globalAlpha = (1 - age) * (1 - k / 6) * 0.85
            context.beginPath()
            context.moveTo(hx - meteor.vx * 0.022 * k, hy - meteor.vy * 0.022 * k)
            context.lineTo(hx - meteor.vx * 0.022 * (k + 1), hy - meteor.vy * 0.022 * (k + 1))
            context.stroke()
          }
        }
      }
      context.globalAlpha = 1
    }

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      draw(dt)
      // Sigue mientras sea de noche o las estrellas no hayan terminado de irse.
      raf = wanted.current || starsAt(level.current.shown) > 0 ? requestAnimationFrame(frame) : 0
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
  }, [level])

  useEffect(() => {
    if (active) start.current()
  }, [active])

  return (
    <div className="sw-sky" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  )
}
