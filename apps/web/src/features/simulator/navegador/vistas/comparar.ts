// @ts-nocheck
// Tabla comparativa de sitios con franja temporal de iluminación / comunicación. Portado de compare.js.
// Sol visible por muestra: la definición del motor (sunLit), la misma de las cifras.
import { tr } from "@/shared/i18n"
import { fmtH } from "../mision"

const COLORS = { both: "#5fd38d", sun: "#ffd25a", earth: "#4fa8ff", none: "#1d2230" }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

export function renderCompare(table, app) {
  const rows = [...app.compare].map((id) => app.sites.find((s) => s.id === id)).filter(Boolean)
    .map((s) => ({ s, r: app.results.get(app.key(s)) })).filter((x) => x.r)
  if (!rows.length) {
    table.innerHTML = `<tr><td class="sim-nav-muted">${tr("Tick one or more sites in the list to compare them.", "Marca uno o más sitios en la lista para compararlos.")}</td></tr>`
    return
  }
  const best = (f, max = true) => {
    const vals = rows.map((x) => x.r.stats[f])
    return max ? Math.max(...vals) : Math.min(...vals)
  }
  const b = {
    sunPct: best("sunPct"), earthPct: best("earthPct"), bothPct: best("bothPct"),
    longestNightH: best("longestNightH", false), longestBlackoutH: best("longestBlackoutH", false),
  }
  const cell = (st, f, txt) => `<td class="${rows.length > 1 && st[f] === b[f] ? "sim-nav-best" : ""}">${txt}</td>`
  table.innerHTML = `<thead><tr><th>${tr("Site", "Sitio")}</th><th>${tr("Sun visible", "Sol visible")}</th><th>${tr("Earth visible", "Tierra visible")}</th><th>${tr("Both", "Ambos")}</th><th>${tr("Longest night", "Noche más larga")}</th><th>${tr("Longest without contact", "Sin comunicación más largo")}</th><th>${tr("Timeline", "Línea de tiempo")}</th></tr></thead><tbody>${
    rows.map(({ s, r }) => {
      const st = r.stats
      return `<tr data-id="${esc(s.id)}"><td><span class="sim-nav-sw" style="background:${s.color}"></span>${esc(s.name)}</td>${
        cell(st, "sunPct", st.sunPct.toFixed(1) + " %")}${cell(st, "earthPct", st.earthPct.toFixed(1) + " %")}${
        cell(st, "bothPct", st.bothPct.toFixed(1) + " %")}${cell(st, "longestNightH", fmtH(st.longestNightH))}${
        cell(st, "longestBlackoutH", fmtH(st.longestBlackoutH))}<td class="sim-nav-strip"><canvas></canvas></td></tr>`
    }).join("")}</tbody>`
  table.querySelectorAll("tbody tr").forEach((tr_, k) => {
    const canvas = tr_.querySelector("canvas")
    canvas._series = rows[k].r
    canvas.addEventListener("click", (e) => {
      const rc = canvas.getBoundingClientRect()
      const ts = canvas._series.times
      const f = (e.clientX - rc.left) / rc.width
      app.setTime(ts[0] + f * (ts[ts.length - 1] - ts[0]))
    })
    const td = tr_.querySelector("td")
    td.style.cursor = "pointer"
    td.addEventListener("click", () => app.select(rows[k].s.id))
  })
  drawStrips(table, app.time)
}

export function drawStrips(table, time) {
  table.querySelectorAll("td.sim-nav-strip canvas").forEach((canvas) => {
    const r = canvas._series
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    canvas.width = w * dpr; canvas.height = h * dpr
    const ctx = canvas.getContext("2d")
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const n = r.times.length
    for (let px = 0; px < w; px++) {
      const i0 = Math.floor((px / w) * n), i1 = Math.max(i0 + 1, Math.floor(((px + 1) / w) * n))
      let sun = 0, earth = 0
      for (let i = i0; i < i1; i++) { sun += r.sunLit[i]; earth += r.earthVis[i] }
      const m = i1 - i0
      const k = sun / m >= 0.5 ? (earth / m >= 0.5 ? "both" : "sun") : earth / m >= 0.5 ? "earth" : "none"
      ctx.fillStyle = COLORS[k]
      ctx.fillRect(px, 0, 1, h)
    }
    const t0 = r.times[0], t1 = r.times[n - 1]
    const x = ((time - t0) / (t1 - t0)) * w
    ctx.fillStyle = "#fff"; ctx.fillRect(x - 1, 0, 2, h)
  })
}
