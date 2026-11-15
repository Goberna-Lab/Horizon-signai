/**
 * El relieve, en tres capas: montañas lejanas, cresta cercana con cráteres y primer plano con rocas.
 * Cada capa se pinta en su propio lienzo 2D y solo cuando cambia la luz; el parallax la mueve sin repintarla.
 */
import { mulberry } from "./backdrop"
import { GLOW, LIT_GROUND, type Rgb, RIM, STAR, TONES } from "./config"

export type Geometry = {
  width: number
  height: number
  /** Rumbo del centro de la vista (grados): la cámara sigue al Sol alrededor del horizonte. */
  centre: number
  /** Altura (px) de la línea de 0 grados y px por grado en cada eje. */
  zero: number
  sx: number
  sy: number
  /** Margen que se pinta a cada lado, para que el parallax no descubra el borde. */
  pad: number
}

export type Lighting = {
  /** Cielo negro, de 0 a 1. */
  night: number
  /** Luz del Sol que llega al terreno, de 0 a 1. */
  light: number
  /** Dónde está el Sol y dónde toca el suelo su luz. */
  sunX: number
  sunRadius: number
  groundY: number
}

export type Layer = "far" | "ridge" | "ground"
export type Profile = (az: number) => number

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (c: Rgb, alpha = 1) => `rgb(${c[0].toFixed(0)} ${c[1].toFixed(0)} ${c[2].toFixed(0)} / ${Math.max(alpha, 0).toFixed(3)})`

/** Perfil del suelo del primer plano: decorativo. */
export const groundAt: Profile = (az) => -3.55 + 0.42 * Math.sin((az * Math.PI) / 23.5 + 1.3) + 0.24 * Math.sin((az * Math.PI) / 9.5)

export const xOf = (geo: Geometry, az: number) => geo.width / 2 + (az - geo.centre) * geo.sx
export const azOf = (geo: Geometry, x: number) => geo.centre + (x - geo.width / 2) / geo.sx
export const yOf = (geo: Geometry, elevation: number) => geo.zero - elevation * geo.sy

/** El punto más alto (la y menor) de un perfil en toda la vuelta: de ahí hacia abajo mide su lienzo. */
export function topOf(geo: Geometry, profile: Profile): number {
  let top = Infinity
  for (let az = 0; az < 360; az++) top = Math.min(top, yOf(geo, profile(az)))
  return top
}

/** Cráteres de la ladera, repartidos por toda la vuelta: rumbo, caída bajo la cresta (grados), ancho (grados) y aplastamiento. */
const CRATERS = (() => {
  const random = mulberry(4107)
  return Array.from({ length: 30 }, (_, i) => ({ az: i * 12 + (random() - 0.5) * 9, drop: 0.45 + random() * 0.75, wide: 1.1 + random() * 2.2, flat: 0.1 + random() * 0.06 }))
})()

/** Rocas del primer plano: posición (0 a 1 a lo ancho), cercanía (0 lejos, 1 junto a la cámara) y forma. */
const ROCKS = (() => {
  const random = mulberry(90210)
  return Array.from({ length: 24 }, () => {
    const corners = 6 + Math.floor(random() * 3)
    return {
      x: random(),
      near: 0.06 + 0.94 * Math.pow(random(), 1.25),
      scale: 0.7 + random() * 0.7,
      shape: Array.from({ length: corners }, (_, i) => ({ angle: Math.PI + (i / (corners - 1)) * Math.PI, reach: 0.72 + random() * 0.36, tall: 0.5 + random() * 0.35 })),
    }
  }).sort((a, b) => a.near - b.near)
})()

/** Grano del regolito: un mosaico de motas claras y oscuras que se repite. */
let grainTile: HTMLCanvasElement | null = null
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile
  grainTile = document.createElement("canvas")
  grainTile.width = grainTile.height = 128
  const context = grainTile.getContext("2d")!
  const random = mulberry(555)
  for (let i = 0; i < 2600; i++) {
    const bright = random() < 0.45
    context.fillStyle = bright ? `rgb(255 244 226 / ${(0.05 + random() * 0.16).toFixed(3)})` : `rgb(0 0 0 / ${(0.08 + random() * 0.26).toFixed(3)})`
    const size = random() < 0.9 ? 1 : 2
    context.fillRect(Math.floor(random() * 128), Math.floor(random() * 128), size, size)
  }
  return grainTile
}

/** Pinta una capa entera. El contexto ya viene colocado en las coordenadas de la escena. */
export function paintLayer(context: CanvasRenderingContext2D, layer: Layer, geo: Geometry, profile: Profile, lit: Lighting, detail: { rocks: number; craters: number }) {
  const { width, height, pad } = geo
  const bottom = height + 160
  const first = Math.floor(azOf(geo, -pad - 20)) - 1
  const last = Math.ceil(azOf(geo, width + pad + 20)) + 1
  const crest = new Path2D()
  let px = xOf(geo, first)
  let py = yOf(geo, profile(first))
  let highest = py
  crest.moveTo(px, py)
  for (let az = first + 1; az <= last; az++) {
    const x = xOf(geo, az)
    const y = yOf(geo, profile(az))
    crest.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2)
    px = x
    py = y
    if (y < highest) highest = y
  }
  crest.lineTo(px, py)
  const body = new Path2D(crest)
  body.lineTo(px, bottom)
  body.lineTo(xOf(geo, first), bottom)
  body.closePath()

  const { night, light } = lit
  const rim = RIM
  const tone = TONES[layer]

  // El regolito: más claro arriba y más oscuro hacia quien mira. A contraluz queda casi en silueta.
  const fill = context.createLinearGradient(0, highest, 0, layer === "ground" ? height : highest + (height - highest) * 0.8)
  fill.addColorStop(0, css(mix(tone.day[0], tone.night[0], night)))
  fill.addColorStop(1, css(mix(tone.day[1], tone.night[1], night)))
  context.fillStyle = fill
  context.fill(body)

  context.save()
  context.clip(body)

  if (layer === "ridge") {
    // Cráteres: de canto, elipses muy aplastadas. La pared del lado de la cámara mira al Sol y recibe la luz.
    for (const [index, crater] of CRATERS.entries()) {
      if (detail.craters < 10 && index % 2) continue
      // El rumbo más cercano al centro de la vista (la vuelta se cierra en 360).
      const az = geo.centre + ((((crater.az - geo.centre) % 360) + 540) % 360) - 180
      const x = xOf(geo, az)
      if (x < -pad - 200 || x > width + pad + 200) continue
      const y = yOf(geo, profile(az)) + crater.drop * geo.sy
      const rx = crater.wide * geo.sx
      const ry = Math.max(rx * crater.flat, 2)
      context.fillStyle = `rgb(0 0 0 / ${(0.08 + 0.2 * night).toFixed(3)})`
      context.beginPath()
      context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      context.fill()
      const reach = Math.max(1 - Math.abs(x - lit.sunX) / (width * 0.5), 0)
      context.lineWidth = 1.25
      context.strokeStyle = css(rim, GLOW.rim * light * reach * 0.6 + 0.3 * (1 - night))
      context.beginPath()
      context.ellipse(x, y, rx, ry, 0, 0.12 * Math.PI, 0.88 * Math.PI)
      context.stroke()
    }
  }

  if (layer === "ground") {
    // La luz rasante sobre el suelo: un charco cálido que nace bajo el Sol y se alarga hacia la cámara.
    if (light > 0.01) {
      context.save()
      context.translate(lit.sunX, highest)
      context.scale(1, 0.6)
      const reach = Math.max(width * 0.6, 420)
      const pool = context.createRadialGradient(0, 0, 0, 0, 0, reach)
      pool.addColorStop(0, css(LIT_GROUND, 0.7 * light))
      pool.addColorStop(0.4, css(LIT_GROUND, 0.3 * light))
      pool.addColorStop(1, css(LIT_GROUND, 0.06 * light))
      context.fillStyle = pool
      context.fillRect(-reach, -20, reach * 2, (bottom - highest) / 0.6 + 20)
      context.restore()
    }
    const pattern = context.createPattern(grain(), "repeat")
    if (pattern) {
      context.globalAlpha = 0.55
      context.fillStyle = pattern
      context.fillRect(-pad - 20, highest - 2, width + 2 * pad + 40, bottom - highest)
      context.globalAlpha = 1
    }

    // Rocas. Primero todas las sombras (largas, duras y hacia la cámara, abiertas en abanico desde el Sol) y
    // después las rocas, de lejos a cerca.
    const rocks = ROCKS.slice(0, detail.rocks).map((rock) => {
      // Las rocas giran con la cámara y vuelven a entrar por el otro lado.
      const span = width + 2 * pad + 240
      const x = ((((rock.x * span - geo.centre * geo.sx) % span) + span) % span) - pad - 120
      const top = yOf(geo, profile(azOf(geo, x)))
      const y = top + 6 + Math.pow(rock.near, 1.35) * (height - top + 14)
      const size = (4 + 30 * rock.near * rock.near) * rock.scale * Math.min(Math.max(height / 900, 0.7), 1.25)
      return { rock, x, y, size }
    })
    // El Sol del polo nunca sube de dos grados: las sombras son siempre larguísimas.
    const stretch = 10
    const shade = 0.85 * light + 0.16 * (1 - night)
    if (shade > 0.01) {
      context.fillStyle = `rgb(0 0 0 / ${shade.toFixed(3)})`
      for (const { rock, x, y, size } of rocks) {
        let dx = x - lit.sunX
        let dy = (y - lit.groundY) * 1.6
        const length = Math.hypot(dx, dy) || 1
        dx /= length
        dy /= length
        const far = size * stretch * (0.5 + rock.near)
        context.beginPath()
        context.moveTo(x - size * 0.5, y)
        context.lineTo(x + size * 0.5, y)
        context.lineTo(x + dx * far + size * 0.72, y + dy * far * 0.55)
        context.lineTo(x + dx * far - size * 0.72, y + dy * far * 0.55)
        context.closePath()
        context.fill()
      }
    }
    const stone = mix([126, 121, 113], [9, 9, 10], night)
    for (const { rock, x, y, size } of rocks) {
      const outline = new Path2D()
      const lip = new Path2D()
      rock.shape.forEach((corner, i) => {
        const cx = x + Math.cos(corner.angle) * size * 0.5 * corner.reach
        const cy = y + Math.sin(corner.angle) * size * corner.tall
        if (i === 0) {
          outline.moveTo(cx, y)
          lip.moveTo(cx, y)
        }
        outline.lineTo(cx, i === 0 || i === rock.shape.length - 1 ? y : cy)
        lip.lineTo(cx, i === 0 || i === rock.shape.length - 1 ? y : cy)
      })
      outline.closePath()
      context.fillStyle = css(stone)
      context.fill(outline)
      // El canto que mira al Sol.
      const reach = Math.max(1 - Math.abs(x - lit.sunX) / (width * 0.7), 0.15)
      context.lineWidth = 1
      context.strokeStyle = light > 0.01 ? css(rim, GLOW.rim * light * reach * 0.7) : css(night > 0.5 ? STAR : [255, 252, 240], night > 0.5 ? 0.05 : 0.5 * (1 - night))
      context.stroke(lip)
    }
  }
  context.restore()

  // Luz de canto en la cresta: más intensa bajo el Sol y cuanto más bajo está. Dos pasadas: un halo ancho y el filo.
  if (light > 0.01) {
    const span = Math.max(width * 0.42, 320) * (layer === "far" ? 0.8 : 1)
    const strength = GLOW.rim * light * (layer === "ground" ? 0.7 : 1)
    const along = context.createLinearGradient(lit.sunX - span, 0, lit.sunX + span, 0)
    along.addColorStop(0, css(rim, 0))
    along.addColorStop(0.5, css(rim, strength))
    along.addColorStop(1, css(rim, 0))
    context.strokeStyle = along
    context.globalAlpha = 0.22
    context.lineWidth = 6
    context.stroke(crest)
    context.globalAlpha = 1
    context.lineWidth = layer === "far" ? 1.25 : 1.75
    context.stroke(crest)
  }
  // Sin Sol: el filo de papel de día, o el de la luz de las estrellas de noche.
  const plain = (1 - light) * (night > 0.5 ? 0.14 * night : 0.55 * (1 - night))
  if (plain > 0.01) {
    context.lineWidth = 1
    context.strokeStyle = night > 0.5 ? css(STAR, plain) : `rgb(255 252 240 / ${plain.toFixed(3)})`
    context.stroke(crest)
  }
}
