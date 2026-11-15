import { type RefObject, useEffect, useMemo, useRef } from "react"
import layersData from "../data/horizon.json"
import { paintDust, paintEarth, paintRays, paintStars } from "./horizon/backdrop"
import { DEPTH, GLOW, HORIZON_LINE, PARALLAX, QUALITY, SMALL_SCREEN, SUN } from "./horizon/config"
import { createSun, type Sun } from "./horizon/sun"
import { type Geometry, groundAt, type Layer, type Lighting, paintLayer, type Profile, topOf, yOf } from "./horizon/terrain"
import { AFTERGLOW_H, at, DUSK_H, horizonAt, inside, sky, turnOf } from "./sky"

/**
 * El fondo de la vista Lander: la puesta y la salida del Sol como se verían de verdad desde el suelo del sitio,
 * filmadas con una cámara de cine.
 *
 * Qué es real:
 *   - El Sol es pequeño (medio grado, como desde la Tierra) y blanco: no hay atmósfera que lo agrande ni lo tiña.
 *   - Su trayectoria: en el polo no baja, resbala casi a ras del horizonte hasta que una ladera lo tapa. La posición
 *     sale de las efemérides (`sky.json`) y el relieve es el horizonte real de Connecting Ridge, así que el disco
 *     desaparece tras la cresta justo cuando la cuenta pasa a "Sunrise in".
 *   - La cámara mira siempre hacia el Sol y lo sigue alrededor del horizonte: el paisaje gira despacio.
 *   - El cielo es negro con el Sol arriba, y con el Sol en cuadro no se ven estrellas (la exposición no da). Salen
 *     cuando se oculta, junto con la corona y la luz zodiacal, que asoman un rato tras la cresta.
 *   - La Tierra aparece solo cuando está sobre el horizonte del sitio, con su fase real.
 * Qué es de cine: el destello de la cámara (velo de luz, rayos de difracción, línea anamórfica y reflejos), que es
 * lo que hace grande al Sol en pantalla; el disco se dibuja un poco mayor que el real (`SUN.scale`); la escala
 * vertical va exagerada respecto a la horizontal; la Tierra va en una esquina y no en su rumbo; y el primer plano
 * (suelo, rocas y cráteres) es decorativo.
 *
 * Capas, de atrás hacia delante, cada una con su profundidad (parallax con el puntero, el scroll y la inclinación
 * del teléfono):
 *   1. Estrellas lejanas (dos lienzos que se relevan: titilan sin repintarse).
 *   2. Estrellas medias y polvo.
 *   3. La Tierra.
 *   4. El Sol: disco, resplandor, corona y luz zodiacal (shader, `horizon/sun.ts`).
 *   5. Montañas lejanas y 6. cresta cercana con cráteres.
 *   7. Primer plano: regolito con grano, rocas y sombras larguísimas hacia la cámara.
 *   8. El destello de la cámara, por delante de todo el relieve.
 *
 * Cómo se dibuja: un solo bucle. El parallax, el giro de la cámara y los fundidos son solo `transform` y `opacity`;
 * el relieve se repinta únicamente cuando cambia la luz o la cámara ha girado más que su margen, y el shader
 * únicamente mientras el Sol está en escena. Los mandos están en `horizon/config.ts`.
 */

type HorizonSceneProps = {
  /** Hora del día lunar que se está mostrando. */
  time: RefObject<number>
  /** Horizonte real del observador, un valor por grado de rumbo (grados). */
  horizon: number[]
  /** Ventanas en las que el Sol se ve desde el sitio (horas del día lunar). */
  sunWindows: number[][]
  /** Ventanas en las que se ve la Tierra. */
  earthWindows: number[][]
  /** Oscuridad que se está mostrando ahora, de 0 a 1 (la escribe ProductWindow cuadro a cuadro). */
  level: RefObject<{ shown: number }>
  /** La vista está en pantalla: la escena se dibuja. */
  active: boolean
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const smooth = (x: number) => x * x * (3 - 2 * x)
const wrap = (az: number) => ((Math.round(az) % 360) + 360) % 360
const LAYERS: Layer[] = ["far", "ridge", "ground"]
/** Margen de las capas de relieve (parallax más giro de la cámara entre dos repintados) y de las de estrellas. */
const LAND_PAD = 112
const PAN_LIMIT = 40
const STAR_PAD = 28
const AFTER = AFTERGLOW_H / DUSK_H

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

export function HorizonScene({ time, horizon, sunWindows, earthWindows, level, active }: HorizonSceneProps) {
  const root = useRef<HTMLDivElement>(null)
  const wanted = useRef(active)
  wanted.current = active
  const start = useRef<() => void>(() => {})
  const relayout = useRef<() => void>(() => {})
  const profiles = useMemo(() => ({ real: horizon, ...split(horizon) }), [horizon])
  const current = useRef(profiles)
  current.current = profiles
  const windows = useRef({ sun: sunWindows, earth: earthWindows })
  windows.current = { sun: sunWindows, earth: earthWindows }

  useEffect(() => {
    const el = root.current
    if (!el) return
    const pick = <T extends HTMLElement>(name: string) => el.querySelector<T>(`[data-part="${name}"]`)!
    const parts = {
      space: pick<HTMLElement>("space"),
      stars: pick<HTMLElement>("stars"),
      starsFar: [pick<HTMLCanvasElement>("stars-far-a"), pick<HTMLCanvasElement>("stars-far-b")],
      starsMid: pick<HTMLCanvasElement>("stars-mid"),
      earth: pick<HTMLCanvasElement>("earth"),
      sun: pick<HTMLCanvasElement>("sun"),
      land: LAYERS.map((layer) => pick<HTMLCanvasElement>(`land-${layer}`)),
      glare: pick<HTMLElement>("glare"),
      rays: pick<HTMLCanvasElement>("rays"),
      streak: pick<HTMLElement>("streak"),
      ghosts: [0, 1, 2].map((i) => pick<HTMLElement>(`ghost-${i}`)),
    }
    const landContexts = parts.land.map((canvas) => canvas.getContext("2d"))
    const earthContext = parts.earth.getContext("2d")
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    /** Dónde se anotan `--glare` (para el velo de la ventana): la sección entera. */
    const host = el.closest<HTMLElement>("section")

    let geo: Geometry = { width: 0, height: 0, centre: 0, zero: 0, sx: 1, sy: 1, pad: LAND_PAD }
    let quality = QUALITY.large
    let ratio = 1
    let sun: Sun | null = null
    let sunQuality = quality
    let sunScale = 1
    let sunShown = false
    let landTops = [0, 0, 0]
    let earthSize = 0
    let raf = 0
    let last = 0
    let landKey = ""
    let landAt = 0
    let landCentre = 0
    let starsShown = 0
    let earthKey = ""
    let sunKey = ""
    let laid = ""
    let slow = 0
    let counted = 0
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const scroll = { value: 0, primed: false }

    /** Escribe un estilo o un atributo solo si cambió: en reposo no se toca el DOM. */
    const written = new Map<HTMLElement, Record<string, string>>()
    const put = (target: HTMLElement, key: string, value: string, write: () => void) => {
      let seen = written.get(target)
      if (!seen) written.set(target, (seen = {}))
      if (seen[key] === value) return
      seen[key] = value
      write()
    }
    const move = (target: HTMLElement, x: number, y: number, scale = 1, stretch = 1, spin = 0) => {
      const value = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${spin ? ` rotate(${spin.toFixed(2)}deg)` : ""}${scale === 1 && stretch === 1 ? "" : ` scale(${(scale * stretch).toFixed(3)}, ${scale.toFixed(3)})`}`
      put(target, "transform", value, () => (target.style.transform = value))
    }
    const fade = (target: HTMLElement, opacity: number) => {
      const value = clamp01(opacity).toFixed(3)
      put(target, "opacity", value, () => (target.style.opacity = value))
    }

    const profileOf = (layer: Layer): Profile => {
      const { back, front } = current.current
      return layer === "far" ? (az) => back[wrap(az)] : layer === "ridge" ? (az) => front[wrap(az)] : groundAt
    }

    const sizeSun = () => {
      const { width, height } = geo
      sunScale = Math.min(ratio, Math.sqrt(sunQuality.sunPixels / Math.max(width * height, 1)))
      sun?.resize(width, height, sunScale)
      sunKey = ""
    }

    /** Mide la pantalla, da tamaño a los lienzos y pinta lo que no cambia: estrellas y polvo. */
    const layout = () => {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      const width = box.width
      const height = box.height
      const sy = Math.min(Math.max(height * 0.046, 24), 46)
      geo = { width, height, centre: geo.centre, zero: height * HORIZON_LINE, sx: Math.max(sy / 1.7, width / 150), sy, pad: LAND_PAD }
      quality = Math.min(width, height) < SMALL_SCREEN ? QUALITY.small : QUALITY.large
      ratio = Math.min(window.devicePixelRatio || 1, 1.5)

      // Relieve: cada lienzo va de su punto más alto hasta abajo.
      landTops = LAYERS.map((layer) => Math.floor(topOf(geo, profileOf(layer))) - 10)
      parts.land.forEach((canvas, i) => {
        const tall = height + 150 - landTops[i]
        canvas.width = Math.round((width + 2 * LAND_PAD) * ratio)
        canvas.height = Math.round(tall * ratio)
        canvas.style.cssText = `left:${-LAND_PAD}px;top:${landTops[i]}px;width:${width + 2 * LAND_PAD}px;height:${tall}px`
      })
      written.clear()
      landKey = ""
      earthKey = ""

      // Estrellas: solo se repintan si cambió el tamaño (no al cambiar de perfil).
      const size = `${width}x${height}x${ratio}`
      if (size !== laid) {
        laid = size
        const starWidth = width + 2 * STAR_PAD
        const starHeight = Math.min(height, geo.zero + 3.4 * sy) + 2 * STAR_PAD
        const sheet = (canvas: HTMLCanvasElement) => {
          canvas.width = Math.round(starWidth * ratio)
          canvas.height = Math.round(starHeight * ratio)
          canvas.style.cssText = `left:${-STAR_PAD}px;top:${-STAR_PAD}px;width:${starWidth}px;height:${starHeight}px`
          const context = canvas.getContext("2d")
          context?.setTransform(ratio, 0, 0, ratio, 0, 0)
          return context
        }
        const area = starWidth * starHeight
        const far = Math.round(area / quality.starAreaFar)
        const [a, b] = parts.starsFar.map(sheet)
        if (a) paintStars(a, starWidth, starHeight, { count: Math.round(far * 0.6), seed: 20261218, size: [0.7, 1.7], alpha: 0.8, halo: false })
        if (b) paintStars(b, starWidth, starHeight, { count: Math.round(far * 0.4), seed: 7741, size: [0.7, 1.9], alpha: 0.9, halo: false })
        const mid = sheet(parts.starsMid)
        if (mid) {
          paintDust(mid, starWidth, starHeight, Math.round(area / (quality.starAreaFar * 0.9)), 31337)
          paintStars(mid, starWidth, starHeight, { count: Math.round(area / quality.starAreaMid), seed: 1969, size: [1, 2.3], alpha: 1, halo: true })
        }
        // El Sol: se crea al conocer la calidad y se rehace si la pantalla cambia de categoría.
        if (!sun || sunQuality !== quality) {
          sun?.dispose()
          sunQuality = quality
          sun = createSun(parts.sun, quality)
        }
        sizeSun()
        earthSize = Math.round(Math.min(Math.max(Math.min(width, height) * 0.075, 30), 68))
        parts.earth.width = parts.earth.height = Math.round(earthSize * ratio)
        parts.earth.style.cssText = `left:0;top:0;width:${earthSize}px;height:${earthSize}px`
        const raysSize = Math.round(Math.min(Math.max(Math.min(width, height) * 0.9, 360), 900))
        parts.rays.width = parts.rays.height = raysSize
        const rays = parts.rays.getContext("2d")
        if (rays) paintRays(rays, raysSize)
      }
      tick(0, performance.now())
    }

    /** Un cuadro: dónde está cada cosa ahora y qué hay que repintar. */
    const tick = (dt: number, now: number) => {
      const { width, height, sy } = geo
      if (width === 0) return
      const { real } = current.current
      const night = clamp01(level.current.shown)
      const hour = time.current

      // --- Parallax: el puntero y el scroll, suavizados -------------------------------------------------------
      const settle = (seconds: number) => (dt > 0 ? 1 - Math.exp(-dt / seconds) : 1)
      pointer.x += (pointer.tx - pointer.x) * settle(PARALLAX.pointerEase)
      pointer.y += (pointer.ty - pointer.y) * settle(PARALLAX.pointerEase)
      const top = el.parentElement ? el.parentElement.getBoundingClientRect().top : 0
      const travel = still ? 0 : Math.min(Math.max(-top / Math.max(height, 1), -1), 1.5)
      scroll.value = scroll.primed ? scroll.value + (travel - scroll.value) * settle(PARALLAX.scrollEase) : travel
      scroll.primed = true
      const shift = (depth: number) => ({ x: -pointer.x * PARALLAX.pointerX * depth, y: -pointer.y * PARALLAX.pointerY * depth - scroll.value * PARALLAX.scroll * depth })

      // --- La secuencia: de la hora sale todo lo demás --------------------------------------------------------
      // `u` va de 0 (empieza el cambio, con el Sol todavía despejado) a 1 (oculto: la cuenta cambia) y sigue un
      // poco más allá, ya de noche, mientras la corona termina de esconderse.
      const turn = turnOf(windows.current.sun, hour)
      const u = turn ? (turn.up ? 1 - turn.hours / DUSK_H : 1 + turn.hours / DUSK_H) : -1
      const on = turn !== null && u > 0 && u < 1 + AFTER
      const presence = on ? smooth(clamp01((u - 0.2) / 0.2)) * (1 - smooth(clamp01((u - 1) / AFTER))) : 0

      // Dónde está el Sol de verdad y cuánto asoma sobre el horizonte real en su rumbo.
      const [sunAz, sunEl] = at(sky.sun, hour)
      const gap = sunEl - horizonAt(real, sunAz)
      const visible = on ? clamp01((gap + SUN.radiusDeg) / (2 * SUN.radiusDeg)) : 0
      // La cámara mira hacia el Sol. Durante el cambio lo deja resbalar un poco por la pantalla, en el sentido en
      // el que se mueve de verdad (hacia la izquierda), y fuera del cambio lo lleva en el centro.
      const through = on && turn ? (turn.rising ? 1 - u / (1 + AFTER) : u / (1 + AFTER)) : 0.5
      const slide = on ? SUN.drift * width * (0.5 - through) * smooth(clamp01(u / 0.2)) * (1 - smooth(clamp01((u - 1) / AFTER))) : 0
      geo.centre = sunAz - slide / geo.sx
      const sunX = width / 2 + slide
      const radius = SUN.radiusDeg * sy * SUN.scale
      const crestY = yOf(geo, horizonAt(real, sunAz))
      const sunY = crestY - gap * sy * SUN.scale
      /** Cuánta luz directa llega a la cámara: manda en el destello, en las estrellas y en el velo de la ventana. */
      const bright = presence * Math.pow(visible, 0.45)
      const light = presence * smooth(clamp01(visible * 4))
      const corona = presence * (1 - smooth(clamp01(visible * 3)))
      const sky01 = smooth(night)
      // Las estrellas no se ven con el Sol en cuadro; al ocultarse, salen poco a poco (como se adapta el ojo).
      const starsWanted = sky01 * (1 - smooth(clamp01(bright * 2.5))) * (1 - 0.35 * corona)
      starsShown = dt > 0 && Math.abs(starsWanted - starsShown) > 0.01 ? starsShown + (starsWanted - starsShown) * settle(starsWanted > starsShown ? 1.1 : 0.3) : starsWanted

      // --- Capas que solo se mueven y cambian de opacidad -----------------------------------------------------
      fade(parts.space, sky01)
      fade(parts.stars, starsShown)
      const farMove = shift(DEPTH.starsFar)
      for (const canvas of parts.starsFar) move(canvas, farMove.x, farMove.y)
      const midMove = shift(DEPTH.starsMid)
      move(parts.starsMid, midMove.x, midMove.y)

      // --- El relieve: se repinta si cambió la luz o si la cámara giró más que el margen; si no, solo se mueve --
      const key = `${night.toFixed(2)}|${light.toFixed(2)}|${real.length}|${real[0]}|${real[90]}`
      let pan = ((((geo.centre - landCentre) % 360) + 540) % 360) - 180
      if ((key !== landKey || Math.abs(pan * geo.sx) > PAN_LIMIT) && (dt === 0 || now - landAt >= 30 || Math.abs(pan * geo.sx) > LAND_PAD - 60)) {
        landKey = key
        landAt = now
        landCentre = geo.centre
        pan = 0
        const lit: Lighting = { night, light, sunX, sunRadius: radius, groundY: crestY }
        LAYERS.forEach((layer, i) => {
          const context = landContexts[i]
          if (!context) return
          context.setTransform(1, 0, 0, 1, 0, 0)
          context.clearRect(0, 0, parts.land[i].width, parts.land[i].height)
          context.setTransform(ratio, 0, 0, ratio, LAND_PAD * ratio, -landTops[i] * ratio)
          paintLayer(context, layer, geo, profileOf(layer), lit, quality)
        })
      }
      parts.land.forEach((canvas, i) => {
        const offset = shift(DEPTH[LAYERS[i]])
        move(canvas, offset.x - pan * geo.sx, offset.y)
      })

      // La Tierra: solo cuando está sobre el horizonte del sitio. La fase sale de su separación real con el Sol.
      const earthUp = inside(windows.current.earth, hour)
      fade(parts.earth, earthUp ? sky01 * (1 - 0.6 * bright) : 0)
      if (earthUp && earthContext) {
        const stacked = height > width
        const ex = width * (stacked ? 0.78 : 0.86)
        const ey = height * (stacked ? 0.16 : 0.2)
        const earthMove = shift(DEPTH.earth)
        move(parts.earth, ex - earthSize / 2 + earthMove.x, ey - earthSize / 2 + earthMove.y)
        const [earthAz, earthEl] = at(sky.earth, hour)
        const rad = Math.PI / 180
        const apart = Math.acos(Math.min(Math.max(Math.sin(sunEl * rad) * Math.sin(earthEl * rad) + Math.cos(sunEl * rad) * Math.cos(earthEl * rad) * Math.cos((sunAz - earthAz) * rad), -1), 1))
        const lit = (1 - Math.cos(apart)) / 2
        const towards = Math.atan2(sunY - ey, sunX - ex)
        const earthNow = `${lit.toFixed(2)}|${towards.toFixed(1)}`
        if (earthNow !== earthKey) {
          earthKey = earthNow
          earthContext.setTransform(ratio, 0, 0, ratio, 0, 0)
          paintEarth(earthContext, earthSize, earthSize * 0.3, lit, towards)
        }
      }

      // --- El Sol --------------------------------------------------------------------------------------------
      // Va pegado a la capa de relieve que lo tapa: si no, el parallax lo sacaría de detrás de la cresta.
      const { back, front } = current.current
      const sunMove = shift(back[wrap(sunAz)] >= front[wrap(sunAz)] ? DEPTH.far : DEPTH.ridge)
      const sx = sunX + sunMove.x
      const sY = sunY + sunMove.y
      if (sun) {
        if (presence > 0.004) {
          // Con "reducir movimiento" la corona se queda quieta: se dibuja solo cuando cambia la hora.
          const sunNow = still ? `${hour.toFixed(3)}|${presence.toFixed(3)}` : ""
          if (!still || sunNow !== sunKey) {
            sunKey = sunNow
            sun.draw({ x: sx, y: sY, radius, time: still ? 12 : now / 1000, disc: presence, corona })
            sunShown = true
          }
          // Si el equipo no llega, el lienzo del Sol baja de resolución: es luz suave y casi no se nota.
          if (!still && dt > 0 && dt < 0.1) {
            counted++
            if (dt > 0.024) slow++
            if (counted >= 45) {
              if (slow > 30 && sunQuality.sunPixels > 200_000) {
                sunQuality = { ...sunQuality, sunPixels: sunQuality.sunPixels * 0.7 }
                sizeSun()
              }
              counted = slow = 0
            }
          }
        } else if (sunShown) {
          sun.clear()
          sunShown = false
          sunKey = ""
        }
      }

      // --- El destello de la cámara, por delante del relieve --------------------------------------------------
      // Nace en la parte del disco que queda a la vista y se encoge con ella: el último filo de luz es un punto
      // con rayos largos. Todo son piezas de 100 px colocadas y escaladas (solo transform y opacity).
      const bottom = Math.max(Math.min(sY + radius, crestY + sunMove.y), sY - radius)
      const fy = (sY - radius + bottom) / 2
      const base = Math.min(width, height) * SUN.flareSize
      const sliver = 1 - smooth(clamp01(visible * 2.5))
      const breath = still ? 1 : 1 + 0.025 * Math.sin(now * 0.0013)
      fade(parts.glare, GLOW.glare * bright)
      move(parts.glare, sx - 50, fy - 50, (base * (0.4 + 0.6 * bright)) / 100)
      fade(parts.rays, GLOW.rays * bright * (0.55 + 0.45 * sliver))
      move(parts.rays, sx - 50, fy - 50, (base * 0.8 * (0.45 + 0.55 * bright) * breath) / 100, 1, pointer.x * 5 + (still ? 0 : Math.sin(now * 0.0004) * 2))
      fade(parts.streak, GLOW.streak * bright)
      move(parts.streak, sx - 50, fy - 50, (base * 0.5) / 100, 4.4 * (0.5 + 0.5 * bright))
      const axisX = width / 2 + pointer.x * 30 - sx
      const axisY = height * 0.42 + pointer.y * 14 - fy
      const ghosts: Array<[number, number, number]> = [
        [0.6, 0.07, 0.7],
        [1.5, 0.045, 1],
        [2.3, 0.13, 0.5],
      ]
      parts.ghosts.forEach((ghost, i) => {
        const [along, size, strength] = ghosts[i]
        fade(ghost, GLOW.ghosts * bright * strength)
        move(ghost, sx + axisX * along - 50, fy + axisY * along - 50, (base * size * 2) / 100)
      })

      // Para la ventana (su velo) y para las comprobaciones: cuánto deslumbra el Sol y cuánto asoma.
      if (host) {
        const value = (Math.round(bright * 0.7 * 25) / 25).toFixed(2)
        put(host, "glare", value, () => host.style.setProperty("--glare", value))
      }
      const state = on ? visible.toFixed(2) : "off"
      put(el, "sun", state, () => (el.dataset.sun = state))
    }

    relayout.current = layout
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      tick(still ? 0 : dt, now)
      raf = wanted.current ? requestAnimationFrame(frame) : 0
    }
    start.current = () => {
      if (raf) return
      if (geo.width === 0) layout()
      last = performance.now()
      scroll.primed = false
      raf = requestAnimationFrame(frame)
    }

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch" || still) return
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2
    }
    // En el teléfono, inclinarlo hace lo que el puntero (donde el navegador lo permite sin pedir permiso).
    const onTilt = (event: DeviceOrientationEvent) => {
      if (still || event.gamma === null || event.beta === null) return
      pointer.tx = Math.min(Math.max(event.gamma / 25, -1), 1)
      pointer.ty = Math.min(Math.max((event.beta - 45) / 25, -1), 1)
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches
    window.addEventListener("pointermove", onPointer, { passive: true })
    if (coarse) window.addEventListener("deviceorientation", onTilt, { passive: true })
    const observer = new ResizeObserver(layout)
    observer.observe(el)
    if (wanted.current) start.current()

    return () => {
      cancelAnimationFrame(raf)
      raf = 0
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("deviceorientation", onTilt)
      observer.disconnect()
      sun?.dispose()
      host?.style.removeProperty("--glare")
      start.current = () => {}
      relayout.current = () => {}
    }
  }, [level, time])

  // Al cambiar de perfil (suelo o mástil) el relieve se mide y se pinta de nuevo.
  useEffect(() => {
    relayout.current()
  }, [profiles])

  useEffect(() => {
    if (active) start.current()
  }, [active])

  return (
    <div className="sw-sky" aria-hidden="true">
      <div className="hz" ref={root}>
        <div className="hz__space" data-part="space" />
        <div className="hz__stars" data-part="stars">
          <canvas className="hz__twinkle" data-part="stars-far-a" />
          <canvas className="hz__twinkle hz__twinkle--b" data-part="stars-far-b" />
          <canvas data-part="stars-mid" />
        </div>
        <canvas className="hz__earth" data-part="earth" />
        <canvas className="hz__sun" data-part="sun" />
        <canvas className="hz__land" data-part="land-far" />
        <canvas className="hz__land" data-part="land-ridge" />
        <canvas className="hz__land" data-part="land-ground" />
        <i className="hz__glare" data-part="glare" />
        <canvas className="hz__rays" data-part="rays" />
        <i className="hz__streak" data-part="streak" />
        <i className="hz__ghost" data-part="ghost-0" />
        <i className="hz__ghost hz__ghost--ring" data-part="ghost-1" />
        <i className="hz__ghost" data-part="ghost-2" />
      </div>
    </div>
  )
}
