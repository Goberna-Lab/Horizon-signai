import { useEffect, useRef } from "react"

type Estrella = { x: number; y: number; r: number; fase: number; vel: number; base: number }

/**
 * Cielo de estrellas en canvas que titilan despacio. Con `prefers-reduced-motion`
 * se dibuja una sola vez, quieto. `densidad` = estrellas por cada 10.000 px².
 */
export function Estrellas({ densidad = 1.6 }: { densidad?: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = lienzo.current
    const ctx = cv?.getContext("2d")
    if (!cv || !ctx) return
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let estrellas: Estrella[] = []
    let raf = 0

    const preparar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { width, height } = cv.getBoundingClientRect()
      cv.width = width * dpr
      cv.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(((width * height) / 10_000) * densidad)
      estrellas = Array.from({ length: n }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.08 ? 1.3 : Math.random() * 0.8 + 0.2,
        fase: Math.random() * Math.PI * 2,
        vel: 0.3 + Math.random() * 0.9,
        base: 0.25 + Math.random() * 0.6,
      }))
    }

    const dibujar = (t: number) => {
      const { width, height } = cv.getBoundingClientRect()
      ctx.clearRect(0, 0, width, height)
      for (const e of estrellas) {
        const brillo = quieto ? e.base : e.base * (0.55 + 0.45 * Math.sin(t / 1000 * e.vel + e.fase))
        ctx.globalAlpha = brillo
        ctx.fillStyle = e.r > 1 ? "#dfe8ff" : "#ffffff"
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
        ctx.fill()
      }
      if (!quieto) raf = requestAnimationFrame(dibujar)
    }

    const alCambiar = () => {
      cancelAnimationFrame(raf)
      preparar()
      raf = requestAnimationFrame(dibujar)
    }
    alCambiar()
    window.addEventListener("resize", alCambiar)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", alCambiar)
    }
  }, [densidad])

  return <canvas ref={lienzo} className="estrellas" aria-hidden="true" />
}
