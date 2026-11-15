/**
 * Lo que queda detrás del Sol: estrellas, polvo y la Tierra. Se pinta una vez por tamaño de pantalla en lienzos 2D;
 * después solo se mueven (transform) y cambian de opacidad.
 */
import { type Rgb, STAR } from "./config"

export function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const css = (c: Rgb, alpha = 1) => `rgb(${c[0].toFixed(0)} ${c[1].toFixed(0)} ${c[2].toFixed(0)} / ${alpha.toFixed(3)})`
const COOL: Rgb = [196, 214, 255]
const WARM: Rgb = [255, 224, 188]

type StarOptions = {
  count: number
  seed: number
  /** Tamaño mínimo y máximo, en px. */
  size: [number, number]
  /** Brillo máximo, de 0 a 1. */
  alpha: number
  /** Las más grandes llevan un halo suave. */
  halo: boolean
}

/** Estrellas repartidas por todo el lienzo: muchas mínimas y unas pocas brillantes, con algún tinte frío o cálido. */
export function paintStars(context: CanvasRenderingContext2D, width: number, height: number, options: StarOptions) {
  const random = mulberry(options.seed)
  for (let i = 0; i < options.count; i++) {
    const x = random() * width
    const y = random() * height
    const weight = Math.pow(random(), 3.2)
    const size = options.size[0] + (options.size[1] - options.size[0]) * weight
    const alpha = options.alpha * (0.3 + 0.7 * Math.pow(random(), 1.5)) * (0.55 + 0.45 * weight)
    const pick = random()
    const colour = pick < 0.16 ? COOL : pick < 0.27 ? WARM : STAR
    if (options.halo && weight > 0.55) {
      const reach = size * 3
      const halo = context.createRadialGradient(x, y, 0, x, y, reach)
      halo.addColorStop(0, css(colour, alpha * 0.22))
      halo.addColorStop(1, css(colour, 0))
      context.fillStyle = halo
      context.fillRect(x - reach, y - reach, reach * 2, reach * 2)
    }
    context.fillStyle = css(colour, alpha)
    context.beginPath()
    context.arc(x, y, size / 2, 0, Math.PI * 2)
    context.fill()
  }
}

/** Polvo: una banda diagonal muy tenue de puntos mínimos y unas pocas manchas apenas visibles. */
export function paintDust(context: CanvasRenderingContext2D, width: number, height: number, count: number, seed: number) {
  const random = mulberry(seed)
  const gauss = () => (random() + random() + random() - 1.5) / 1.5
  const slope = -0.22
  const blobs = 6
  for (let i = 0; i < blobs; i++) {
    const x = ((i + 0.5 + gauss() * 0.3) / blobs) * width
    const y = height * 0.36 + (x - width / 2) * slope + gauss() * height * 0.07
    const reach = Math.max(width, height) * (0.1 + random() * 0.1)
    const blob = context.createRadialGradient(x, y, 0, x, y, reach)
    const colour = random() < 0.5 ? COOL : WARM
    blob.addColorStop(0, css(colour, 0.05))
    blob.addColorStop(1, css(colour, 0))
    context.fillStyle = blob
    context.fillRect(x - reach, y - reach, reach * 2, reach * 2)
  }
  for (let i = 0; i < count; i++) {
    const x = random() * width
    const y = height * 0.36 + (x - width / 2) * slope + gauss() * height * 0.13
    context.fillStyle = css(random() < 0.4 ? COOL : STAR, 0.1 + random() * 0.22)
    context.fillRect(x, y, 0.9, 0.9)
  }
}

/**
 * La Tierra, pequeña: un disco casi negro con la parte iluminada hacia el Sol.
 * `lit` es la fracción iluminada (0 nueva, 1 llena) y `towards` el ángulo hacia el Sol en la pantalla (radianes).
 */
export function paintEarth(context: CanvasRenderingContext2D, size: number, radius: number, lit: number, towards: number) {
  context.clearRect(0, 0, size, size)
  context.save()
  context.translate(size / 2, size / 2)
  context.rotate(towards)
  const air = context.createRadialGradient(radius * 0.25, 0, radius * 0.9, radius * 0.25, 0, radius * 1.7)
  air.addColorStop(0, "rgb(120 170 255 / 0.12)")
  air.addColorStop(1, "rgb(120 170 255 / 0)")
  context.fillStyle = air
  context.fillRect(-size / 2, -size / 2, size, size)
  context.fillStyle = "rgb(7 10 18)"
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()
  // La parte iluminada: medio disco del lado del Sol, recortado o ampliado por la elipse del terminador.
  const bulge = radius * (1 - 2 * lit)
  context.beginPath()
  context.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2)
  context.ellipse(0, 0, Math.abs(bulge), radius, 0, Math.PI / 2, -Math.PI / 2, bulge > 0)
  context.closePath()
  const day = context.createLinearGradient(-radius, 0, radius, 0)
  day.addColorStop(0.3, "rgb(38 92 190)")
  day.addColorStop(0.8, "rgb(120 172 250)")
  day.addColorStop(1, "rgb(226 240 255)")
  context.fillStyle = day
  context.fill()
  context.restore()
}

/**
 * Rayos de difracción: lo que hace el diafragma de una cámara con un punto de luz muy intenso. Seis rayos largos y
 * desiguales y una corona de rayos finos. Se pintan una vez; después solo se escalan y giran.
 */
export function paintRays(context: CanvasRenderingContext2D, size: number) {
  const random = mulberry(1202)
  const half = size / 2
  context.clearRect(0, 0, size, size)
  context.save()
  context.translate(half, half)
  context.globalCompositeOperation = "lighter"
  const ray = (angle: number, length: number, width: number, alpha: number) => {
    context.save()
    context.rotate(angle)
    const along = context.createLinearGradient(0, 0, length, 0)
    along.addColorStop(0, `rgb(255 250 240 / ${alpha.toFixed(3)})`)
    along.addColorStop(0.25, `rgb(255 244 228 / ${(alpha * 0.4).toFixed(3)})`)
    along.addColorStop(1, "rgb(255 240 220 / 0)")
    context.fillStyle = along
    context.beginPath()
    context.moveTo(0, -width)
    context.lineTo(length, 0)
    context.lineTo(0, width)
    context.closePath()
    context.fill()
    context.restore()
  }
  const tilt = 0.31
  for (let i = 0; i < 6; i++) ray(tilt + (i * Math.PI) / 3, half * (0.72 + random() * 0.28), half * 0.011, 0.85)
  for (let i = 0; i < 6; i++) ray(tilt + Math.PI / 6 + (i * Math.PI) / 3, half * (0.3 + random() * 0.18), half * 0.008, 0.5)
  for (let i = 0; i < 54; i++) ray(random() * Math.PI * 2, half * (0.1 + Math.pow(random(), 2) * 0.3), half * 0.004, 0.16 + random() * 0.2)
  context.restore()
}
