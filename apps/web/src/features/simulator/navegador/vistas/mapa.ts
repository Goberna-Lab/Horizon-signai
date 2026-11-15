// @ts-nocheck
// Mapa 2D del polo sur (relieve sombreado LOLA, map.png de ±300 km) con zoom, desplazamiento y selección de sitios.
// Portado de mapView.js. Diferencia: aquí no hay relieve global para calcular el horizonte de un punto cualquiera,
// así que un clic fuera de un sitio no añade un punto propio: elige el sitio del catálogo más cercano. Por lo mismo,
// la etiqueta del cursor muestra solo las coordenadas (sin altura).
import { tr } from "@/shared/i18n"
import { llToXY, xyToLL, R_LUNA } from "../polar"

export const MAPA_URL = "/simulador/navegador/map.png"
const TXT = '"Archivo Variable", system-ui, sans-serif'

export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth, h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext("2d")
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

export class MapView {
  constructor(canvas, tip, app) {
    this.canvas = canvas; this.tip = tip; this.app = app
    this.cx = 0; this.cy = 0; this.mpp = 250 // metros por píxel CSS
    this._size = { w: 0, h: 0 }
    this.img = new Image()
    this.img.onload = () => this.draw()
    this.img.src = MAPA_URL
    this._bind()
  }

  toScreen(x, y) {
    const { w, h } = this._size
    return [w / 2 + (x - this.cx) / this.mpp, h / 2 - (y - this.cy) / this.mpp]
  }

  toWorld(px, py) {
    const { w, h } = this._size
    return [this.cx + (px - w / 2) * this.mpp, this.cy - (py - h / 2) * this.mpp]
  }

  _bind() {
    const c = this.canvas
    let drag = null
    const on = (t, f, o) => { c.addEventListener(t, f, o); this._off.push(() => c.removeEventListener(t, f, o)) }
    this._off = []
    on("wheel", (e) => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      const [wx, wy] = this.toWorld(e.clientX - r.left, e.clientY - r.top)
      const k = Math.exp(e.deltaY * 0.0015)
      this.mpp = Math.min(600, Math.max(20, this.mpp * k))
      const [nx, ny] = this.toWorld(e.clientX - r.left, e.clientY - r.top)
      this.cx += wx - nx; this.cy += wy - ny
      this.draw()
    }, { passive: false })
    on("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; c.setPointerCapture(e.pointerId) })
    on("pointermove", (e) => {
      const r = c.getBoundingClientRect()
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        if (drag.moved) {
          this.cx -= dx * this.mpp; this.cy += dy * this.mpp
          drag.x = e.clientX; drag.y = e.clientY
          this.draw()
        }
      }
      const [wx, wy] = this.toWorld(e.clientX - r.left, e.clientY - r.top)
      const [lat, lon] = xyToLL(wx, wy)
      this.tip.hidden = false
      this.tip.style.left = e.clientX - r.left + 14 + "px"
      this.tip.style.top = e.clientY - r.top + 14 + "px"
      this.tip.textContent = `${lat.toFixed(3)}°, ${(((lon % 360) + 360) % 360).toFixed(2)}°E`
    })
    on("pointerleave", () => { this.tip.hidden = true })
    on("pointerup", (e) => {
      if (drag && !drag.moved) {
        const r = c.getBoundingClientRect()
        const px = e.clientX - r.left, py = e.clientY - r.top
        // El sitio del catálogo más cercano al clic (sin puntos propios: ver la cabecera)
        let best = null, bd = Infinity
        for (const s of this.app.sites) {
          const [sx, sy] = this.toScreen(...llToXY(s.lat, s.lon))
          const d = Math.hypot(sx - px, sy - py)
          if (d < bd) { bd = d; best = s }
        }
        if (best) this.app.select(best.id)
      }
      drag = null
    })
    this._ro = new ResizeObserver(() => this.draw())
    this._ro.observe(c)
  }

  destroy() {
    this._off.forEach((f) => f())
    this._ro.disconnect()
    this.img.onload = null
  }

  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas)
    this._size = { w, h }
    if (!w || !h) return
    ctx.fillStyle = "#05070c"
    ctx.fillRect(0, 0, w, h)
    if (this.img.complete && this.img.naturalWidth) {
      const ext = 300000
      const [x0, y0] = this.toScreen(-ext, ext)
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(this.img, x0, y0, (2 * ext) / this.mpp, (2 * ext) / this.mpp)
    }
    // Retícula: paralelos y meridianos
    ctx.strokeStyle = "rgba(255,255,255,.22)"
    ctx.fillStyle = "rgba(255,255,255,.7)"
    ctx.lineWidth = 1
    ctx.font = `11px ${TXT}`
    const [ox, oy] = this.toScreen(0, 0)
    for (const lat of [-89, -88, -87, -86, -85, -84, -82, -80]) {
      const r = (2 * R_LUNA * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / this.mpp
      if (r < 18) continue
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.fillText(`${lat}°`, ox + 3, oy - r - 3)
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const [ex, ey] = this.toScreen(...llToXY(-80, lon))
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke()
      const [lx, ly] = this.toScreen(...llToXY(-80.4, lon))
      ctx.fillText(`${lon > 180 ? lon - 360 : lon}°`, lx - 10, ly)
    }
    ctx.fillText(tr("Towards Earth (0°)", "Hacia la Tierra (0°)"), ...this.toScreen(...llToXY(-84.2, 1.5)))

    // Sitios
    for (const s of this.app.sites) {
      const [sx, sy] = this.toScreen(...llToXY(s.lat, s.lon))
      const sel = s.id === this.app.selId
      const cmp = this.app.compare.has(s.id)
      ctx.beginPath(); ctx.arc(sx, sy, sel ? 7 : 5, 0, Math.PI * 2)
      ctx.fillStyle = cmp || sel ? s.color : "rgba(255,255,255,.45)"
      ctx.fill()
      ctx.lineWidth = sel ? 2.5 : 1.2; ctx.strokeStyle = sel ? "#fff" : "#000"; ctx.stroke()
      if (sel || cmp || this.mpp < 120) {
        ctx.font = sel ? `600 12px ${TXT}` : `12px ${TXT}`
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.75)"
        ctx.strokeText(s.name, sx + 10, sy + 4)
        ctx.fillStyle = "#fff"; ctx.fillText(s.name, sx + 10, sy + 4)
      }
    }
    // Escala
    const km = (this.mpp * 120) / 1000
    const nice = [1, 2, 5, 10, 20, 50, 100].find((v) => v >= km * 0.6) || 100
    const px = (nice * 1000) / this.mpp
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(12, h - 34, px + 16, 24)
    ctx.fillStyle = "#fff"; ctx.fillRect(20, h - 18, px, 3)
    ctx.font = `11px "IBM Plex Mono", ui-monospace, monospace`; ctx.fillText(`${nice} km`, 20, h - 22)
  }
}
