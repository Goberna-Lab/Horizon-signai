// @ts-nocheck
// Panorama de 360°: perfil del horizonte + trayectorias del Sol y la Tierra. Portado de panorama.js.
// El perfil es el del Planificador (perfilDesde de la máscara a la altura elegida), no uno calculado aquí.
import { tr } from "@/shared/i18n"
import { fitCanvas } from "./mapa"

const DIRS = tr(["N", "NE", "E", "SE", "S", "SW", "W", "NW"], ["N", "NE", "E", "SE", "S", "SO", "O", "NO"])
const TXT = '"Archivo Variable", system-ui, sans-serif'
const NUM = '"IBM Plex Mono", ui-monospace, monospace'

export function drawPanorama(canvas, { mask, series, now }) {
  const { ctx, w, h } = fitCanvas(canvas)
  if (!w || !h) return
  const prof = mask.perfil.elevacionGrados, paso = mask.perfil.pasoAzimutGrados, bins = prof.length
  const padL = 36, padB = 22, padT = 10
  const pw = w - padL - 8, ph = h - padB - padT
  let top = 6, bot = -3
  for (const v of prof) top = Math.max(top, v + 1.5)
  if (series) for (let i = 0; i < series.earthEl.length; i++) {
    top = Math.max(top, series.earthEl[i] + 1.5, series.sunEl[i] + 1)
    bot = Math.min(bot, series.earthEl[i] - 1.5, series.sunEl[i] - 1)
  }
  top = Math.min(Math.ceil(top), 40)
  bot = Math.max(Math.floor(bot), -12)
  const X = (az) => padL + (az / 360) * pw
  const Y = (el) => padT + ((top - el) / (top - bot)) * ph
  const ppd = ph / (top - bot)

  const g = ctx.createLinearGradient(0, padT, 0, padT + ph)
  g.addColorStop(0, "#04050a"); g.addColorStop(1, "#0d1220")
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)

  // Retícula
  ctx.font = `11px ${NUM}`; ctx.textAlign = "right"
  const stepEl = top - bot > 20 ? 5 : top - bot > 10 ? 2 : 1
  for (let e = Math.ceil(bot / stepEl) * stepEl; e <= top; e += stepEl) {
    ctx.strokeStyle = e === 0 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.08)"
    ctx.beginPath(); ctx.moveTo(padL, Y(e)); ctx.lineTo(padL + pw, Y(e)); ctx.stroke()
    ctx.fillStyle = "#8b93a7"; ctx.fillText(`${e}°`, padL - 6, Y(e) + 4)
  }
  ctx.textAlign = "center"
  for (let a = 0; a <= 360; a += 45) {
    ctx.strokeStyle = "rgba(255,255,255,.08)"
    ctx.beginPath(); ctx.moveTo(X(a), padT); ctx.lineTo(X(a), padT + ph); ctx.stroke()
    ctx.fillStyle = "#8b93a7"; ctx.fillText(`${DIRS[(a / 45) % 8]} ${a}°`, X(a), h - 6)
  }

  // Relieve
  ctx.beginPath()
  ctx.moveTo(X(0), padT + ph)
  for (let i = 0; i <= bins; i++) ctx.lineTo(X(i * paso), Y(Math.max(bot, prof[i % bins])))
  ctx.lineTo(X(360), padT + ph); ctx.closePath()
  const tg = ctx.createLinearGradient(0, padT, 0, padT + ph)
  tg.addColorStop(0, "#5a5e6b"); tg.addColorStop(1, "#22252e")
  ctx.fillStyle = tg; ctx.fill()
  ctx.strokeStyle = "#b8bcc8"; ctx.lineWidth = 1.2
  ctx.beginPath()
  for (let i = 0; i <= bins; i++) ctx[i ? "lineTo" : "moveTo"](X(i * paso), Y(Math.max(bot, prof[i % bins])))
  ctx.stroke()

  // Trayectorias del periodo (tenues donde el relieve las oculta)
  if (series) {
    const n = series.times.length
    const dots = Math.max(1, Math.floor(n / 1500))
    for (let i = 0; i < n; i += dots) {
      ctx.fillStyle = series.sunLit[i] ? "rgba(255,210,90,.75)" : "rgba(255,210,90,.22)"
      ctx.fillRect(X(series.sunAz[i]) - 1, Y(series.sunEl[i]) - 1, 2, 2)
      ctx.fillStyle = series.earthVis[i] ? "rgba(79,168,255,.8)" : "rgba(79,168,255,.22)"
      ctx.fillRect(X(series.earthAz[i]) - 1, Y(series.earthEl[i]) - 1, 2, 2)
    }
  }

  // Posiciones actuales
  if (now) {
    const body = (b, color, label, visible) => {
      const x = X(b.az), y = Y(b.el), r = Math.max(5, b.radius * ppd)
      ctx.globalAlpha = visible ? 1 : 0.35
      if (!visible) label += tr(" (hidden)", " (oculta)")
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
      glow.addColorStop(0, color + "aa"); glow.addColorStop(1, color + "00")
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = "#fff"; ctx.font = `600 12px ${TXT}`; ctx.fillText(label, x, y - r - 6)
    }
    body(now.earth, "#4fa8ff", tr("Earth", "Tierra"), now.earth.visible)
    body(now.sun, "#ffd25a", tr("Sun", "Sol"), now.sun.frac > 0)
  }
}
