// @ts-nocheck
// Ficha del sitio antes de ir al 3D: dónde vas a aterrizar y qué te espera ahí durante el periodo. Portado de briefing.js.
// Un gráfico con el Sol visible y la batería de la nave (0–100 %), una banda con la Tierra a la vista, cuatro cifras
// (Sol, Tierra, batería mínima y pendiente) y si el sitio cumple el objetivo de la misión. Enter abre el 3D; Esc cierra.
// Fuera de lo de NASA: la zona segura de 100 m (rocas del 3D), la nota de replanificación y la voz (son del 3D).
import { tr } from "@/shared/i18n"
import { analyze, DAY_MS } from "../analisis"
import { objetivoMision, fmtH, analyzeMission, f0 } from "../mision"

const SOL = "#c98500", BAT = "#3987e5", TIERRA = "#199e70" // paleta validada sobre fondo oscuro
const W = 900, H = 300, L = 46, R = 96, T = 14, B = 64, PW = W - L - R, PH = H - T - B
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

export class Briefing {
  constructor(host, app) {
    this.app = app; this.open = false
    const el = (this.el = document.createElement("div"))
    el.className = "sim-nav-brief"; el.hidden = true
    host.append(el)
    this._onClick = (e) => { if (e.target.closest("[data-go]")) this._go(); else if (e.target.closest("[data-close]")) this.close() }
    this._onMove = (e) => this._hover(e)
    this._onLeave = () => this._hover(null)
    this._onKey = (e) => { if (!this.open) return; if (e.key === "Enter") { e.preventDefault(); this._go() } else if (e.key === "Escape") this.close() }
    el.addEventListener("click", this._onClick)
    el.addEventListener("pointermove", this._onMove)
    el.addEventListener("pointerleave", this._onLeave)
    document.addEventListener("keydown", this._onKey)
  }

  destroy() { this.dead = true; document.removeEventListener("keydown", this._onKey); this.el.remove() }

  _go() { this.close(); this.app.ir3d() }

  /** Abre la ficha con la misión `m` para el sitio y el periodo del navegador. */
  async show(m) {
    this.open = true; this.el.hidden = false
    this.el.innerHTML = `<div class="sim-nav-brief-card"><p class="sim-nav-brief-wait">${tr("Computing the site…", "Calculando el sitio…")}</p></div>`
    const app = this.app, s = app.sel
    const mask = await app.ensureMask(s)
    if (this.dead || !this.open) return
    const series = analyze(s, mask, app.start, app.start + app.days * DAY_MS)
    this._fill(s, m, analyzeMission(series, mask, m))
  }
  close() { if (!this.open) return; this.open = false; this.el.hidden = true }

  _fill(s, m, a) {
    const app = this.app, st = a.stats, n = a.soc.length, obj = objetivoMision(m), slope = s.slopeDeg
    const t0 = a.times[0], t1 = a.times[n - 1], days = (t1 - t0) / DAY_MS
    const x = (t) => L + ((t - t0) / (t1 - t0)) * PW, y = (p) => T + PH * (1 - p)
    // Series reducidas a ~300 puntos (mínimo de cada tramo: no esconder una caída breve)
    const K = Math.max(1, Math.floor(n / 300)), pts = []
    for (let i = 0; i < n; i += K) { let sun = 0, soc = 1; for (let j = i; j < Math.min(n, i + K); j++) { sun += a.sun[j]; soc = Math.min(soc, a.soc[j]) } pts.push({ t: a.times[i], sun: sun / Math.min(K, n - i), soc }) }
    const line = (k) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p[k]).toFixed(1)}`).join("")
    // Tramos de enlace con la Tierra
    let earth = ""; for (let i = 0; i < n;) { if (!a.earth[i]) { i++; continue } let j = i; while (j < n && a.earth[j]) j++; earth += `<rect x="${x(a.times[i]).toFixed(1)}" y="${T + PH + 30}" width="${Math.max(1.5, x(a.times[Math.min(n - 1, j)]) - x(a.times[i])).toFixed(1)}" height="10" rx="2" fill="${TIERRA}"/>`; i = j }
    const stepD = days > 60 ? 15 : days > 20 ? 5 : 1; let ticks = ""
    for (let d = 0; d <= days + 0.01; d += stepD) ticks += `<line x1="${x(t0 + d * DAY_MS)}" x2="${x(t0 + d * DAY_MS)}" y1="${T}" y2="${T + PH}" class="sim-nav-g"/><text x="${x(t0 + d * DAY_MS)}" y="${T + PH + 18}" text-anchor="middle">${tr("day", "día")} ${d + 1}</text>`
    const last = pts[pts.length - 1], now = Math.max(t0, Math.min(t1, app.time))
    const yS = y(last.sun), yB = y(last.soc), gap = Math.abs(yS - yB) < 14 ? (yS < yB ? [-7, 7] : [7, -7]) : [0, 0] // etiquetas directas sin pisarse
    const chart = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr("Visible Sun and lander battery over the period, with the hours of link with Earth", "Sol visible y batería de la nave a lo largo del periodo, con las horas de enlace con la Tierra")}">
      ${[0, 0.5, 1].map((p) => `<line x1="${L}" x2="${L + PW}" y1="${y(p)}" y2="${y(p)}" class="sim-nav-g"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end">${p * 100} %</text>`).join("")}${ticks}
      <line x1="${L}" x2="${L + PW}" y1="${y(m.minSocPct / 100)}" y2="${y(m.minSocPct / 100)}" class="sim-nav-min"/><text x="${L + 6}" y="${y(m.minSocPct / 100) - 5}" class="sim-nav-mut">${tr("minimum reserve", "reserva mínima")} ${m.minSocPct} %</text>
      <path d="${line("sun")}L${x(last.t).toFixed(1)} ${y(0)}L${L} ${y(0)}Z" fill="${SOL}" opacity=".16"/>
      <path d="${line("sun")}" stroke="${SOL}" class="sim-nav-ln"/><path d="${line("soc")}" stroke="${BAT}" class="sim-nav-ln"/>
      <circle cx="${x(last.t)}" cy="${yS}" r="4" fill="${SOL}" class="sim-nav-dot"/><circle cx="${x(last.t)}" cy="${yB}" r="4" fill="${BAT}" class="sim-nav-dot"/>
      <text x="${L + PW + 10}" y="${yS + 4 + gap[0]}" class="sim-nav-lab">${tr("Visible Sun", "Sol visible")}</text><text x="${L + PW + 10}" y="${yB + 4 + gap[1]}" class="sim-nav-lab">${tr("Battery", "Batería")}</text>
      <text x="${L - 8}" y="${T + PH + 39}" text-anchor="end">${tr("Earth", "Tierra")}</text><rect x="${L}" y="${T + PH + 30}" width="${PW}" height="10" rx="2" class="sim-nav-trk"/>${earth}
      <line x1="${x(now)}" x2="${x(now)}" y1="${T}" y2="${T + PH + 42}" class="sim-nav-now"/><text x="${x(now) + (x(now) < L + 60 ? 6 : 0)}" y="${T + PH + 58}" text-anchor="${x(now) < L + 60 ? "start" : "middle"}" class="sim-nav-lab">${tr("you arrive here", "llegas aquí")}</text>
      <g class="sim-nav-hov" visibility="hidden"><line y1="${T}" y2="${T + PH + 42}" class="sim-nav-cross"/><circle r="4.5" fill="${SOL}" class="sim-nav-dot sim-nav-hs"/><circle r="4.5" fill="${BAT}" class="sim-nav-dot sim-nav-hb"/></g>
    </svg>`
    this.plot = { t0, a, n }
    // Veredicto frente al objetivo de la misión
    const en = m.objetivo !== "comunicacion", co = m.objetivo !== "energia"
    const checks = []
    if (en) checks.push([st.depletedH <= 0, tr("The lander does not run out of power", "La nave no se queda sin energía"), st.depletedH > 0 ? tr(`shuts down for ${fmtH(st.depletedH)} in total`, `se apaga ${fmtH(st.depletedH)} en total`) : tr(`minimum battery ${f0(st.minSocPct)} %`, `batería mínima ${f0(st.minSocPct)} %`)])
    if (en) checks.push([st.minSocPct >= m.minSocPct, tr(`Battery reserve ≥ ${m.minSocPct} %`, `Reserva de batería ≥ ${m.minSocPct} %`), tr(`minimum reached ${f0(st.minSocPct)} %`, `mínimo alcanzado ${f0(st.minSocPct)} %`)])
    if (co) checks.push([st.longestBlackoutH <= m.maxBlackoutH, tr(`Without radio at most ${fmtH(m.maxBlackoutH)}`, `Sin radio como mucho ${fmtH(m.maxBlackoutH)}`), tr(`longest silence ${fmtH(st.longestBlackoutH)}`, `silencio más largo ${fmtH(st.longestBlackoutH)}`)])
    checks.push([slope <= 12, tr("Terrain fit to land on", "Terreno apto para posarse"), tr(`site slope ${f0(slope, 1)}° (limit ~12°)`, `pendiente del sitio ${f0(slope, 1)}° (límite ~12°)`)])
    const fails = checks.filter((c) => !c[0]).length
    const seg = (f, bad) => `<i class="sim-nav-sg">${Array.from({ length: 16 }, (_, i) => `<u class="${i < Math.round(Math.max(0, Math.min(1, f)) * 16) ? (bad ? "sim-nav-on sim-nav-bad" : "sim-nav-on") : ""}"></u>`).join("")}</i>`
    const tile = (k, val, sub, f, bad) => `<div class="${bad ? "sim-nav-bad" : ""}"><small>${k}</small><b>${val}</b>${seg(f, bad)}<span>${sub}</span></div>`
    // Lente con el polo sur: el punto es tu sitio (el borde son 85° S; el centro, el polo)
    const rr = Math.min(1, (90 - Math.abs(s.lat)) / 5) * 40, la = (s.lon * Math.PI) / 180, px = Math.sin(la) * rr, py = -Math.cos(la) * rr
    this.el.innerHTML = `<div class="sim-nav-brief-card">
      <i class="sim-nav-cn sim-nav-tl"></i><i class="sim-nav-cn sim-nav-tr"></i><i class="sim-nav-cn sim-nav-bl"></i><i class="sim-nav-cn sim-nav-br"></i>
      <header><div class="sim-nav-brief-lens"><svg class="sim-nav-r1" viewBox="-60 -60 120 120"><circle r="56"/></svg><svg class="sim-nav-r2" viewBox="-60 -60 120 120"><circle r="50"/></svg>
        <svg viewBox="-60 -60 120 120"><circle r="40" class="sim-nav-gr"/><circle r="20" class="sim-nav-gr"/><path d="M-40 0h80M0 -40v80" class="sim-nav-gr"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" class="sim-nav-pt"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" class="sim-nav-pg"/><text y="4" text-anchor="middle">90° S</text></svg></div>
        <div><small>${tr("YOU WILL LAND AT", "VAS A ATERRIZAR EN")}</small><h2><span>${esc(s.name)}</span></h2>
        <p>${f0(Math.abs(s.lat), 3)}° S · ${f0(s.lon, 2)}° E${Number.isFinite(s.elev) ? ` · ${f0(s.elev)} ${tr("m altitude", "m de altitud")}` : ""} · ${tr(`${f0(days)} days from ${new Date(t0).toISOString().slice(0, 10)}`, `${f0(days)} días desde el ${new Date(t0).toISOString().slice(0, 10)}`)}</p></div></header>
      <div class="sim-nav-brief-tiles">
        ${tile(tr("Visible Sun", "Sol visible"), `${f0(st.sunPct)} %`, tr(`longest shadow ${fmtH(st.longestNightH)}`, `sombra más larga ${fmtH(st.longestNightH)}`), st.sunPct / 100, st.depletedH > 0)}
        ${tile(tr("Link with Earth", "Enlace con la Tierra"), `${f0(st.earthPct)} %`, tr(`longest silence ${fmtH(st.longestBlackoutH)}`, `silencio más largo ${fmtH(st.longestBlackoutH)}`), st.earthPct / 100, co && st.longestBlackoutH > m.maxBlackoutH)}
        ${tile(tr("Minimum battery", "Batería mínima"), `${f0(st.minSocPct)} %`, tr(`autonomy without Sun ${fmtH(st.autonomyH)}`, `autonomía sin Sol ${fmtH(st.autonomyH)}`), st.minSocPct / 100, en && st.minSocPct < m.minSocPct)}
        ${tile(tr("Slope", "Pendiente"), `${f0(slope, 1)}°`, tr("limit ~12° (Apollo LM)", "límite ~12° (LM del Apollo)"), Math.min(1, slope / 24), slope > 12)}
      </div>
      <figure><figcaption>${tr("Visible Sun and lander battery over the period", "Sol visible y batería de la nave durante el periodo")} <span class="sim-nav-leg"><i style="background:${SOL}"></i>${tr("Visible Sun", "Sol visible")} <i style="background:${BAT}"></i>${tr("Battery", "Batería")} <i style="background:${TIERRA}"></i>${tr("Earth in view", "Tierra a la vista")}</span></figcaption>
        ${chart}<i class="sim-nav-sweep"></i><div class="sim-nav-brief-tip" hidden></div></figure>
      <div class="sim-nav-brief-goal ${fails ? "sim-nav-bad" : "sim-nav-ok"}"><div><small>${tr("OBJECTIVE", "OBJETIVO")} · ${m.tipo === "tripulada" ? tr("CREWED MISSION", "MISIÓN TRIPULADA") : tr("ROBOTIC MISSION", "MISIÓN ROBÓTICA")}</small><b>${obj.titulo}</b>
        <p class="sim-nav-verd">${fails ? tr(`✕ This site and date do not meet it: ${fails} of ${checks.length} conditions fail.`, `✕ Este sitio y esta fecha no lo cumplen: ${fails} de ${checks.length} condiciones fallan.`) : tr("✓ This site and date meet every condition.", "✓ Este sitio y esta fecha cumplen todas las condiciones.")}</p></div>
        <ul>${checks.map(([ok, t, d]) => `<li class="${ok ? "sim-nav-ok" : "sim-nav-bad"}"><i>${ok ? "✓" : "✕"}</i><span>${t}<small>${d}</small></span></li>`).join("")}</ul></div>
      <footer><span>${tr("You can change site, date or mission in the sidebar and the guided mission.", "Puedes cambiar de sitio, fecha o misión en la barra lateral y en la misión guiada.")} <button type="button" class="sim-nav-brief-back" data-close><kbd>Esc</kbd> ${tr("Back", "Volver")}</button></span><button type="button" data-go><kbd>Enter</kbd> ${tr("Start the descent", "Iniciar el descenso")}</button></footer>
    </div>`
  }

  /** Cursor sobre el gráfico: línea vertical y los valores de ese instante. */
  _hover(e) {
    const svg = this.el.querySelector("figure svg"), tip = this.el.querySelector(".sim-nav-brief-tip"); if (!svg || !this.plot) return
    const g = svg.querySelector(".sim-nav-hov"), r = svg.getBoundingClientRect()
    const px = e ? ((e.clientX - r.left) / r.width) * W : -1
    if (!e || px < L || px > L + PW || e.clientY < r.top || e.clientY > r.bottom) { g.setAttribute("visibility", "hidden"); tip.hidden = true; return }
    const { t0, a, n } = this.plot, i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / PW) * (n - 1)))), y = (p) => T + PH * (1 - p)
    g.setAttribute("visibility", "visible"); g.querySelector(".sim-nav-cross").setAttribute("x1", px); g.querySelector(".sim-nav-cross").setAttribute("x2", px)
    g.querySelector(".sim-nav-hs").setAttribute("cx", px); g.querySelector(".sim-nav-hs").setAttribute("cy", y(a.sun[i]))
    g.querySelector(".sim-nav-hb").setAttribute("cx", px); g.querySelector(".sim-nav-hb").setAttribute("cy", y(a.soc[i]))
    const d = (a.times[i] - t0) / DAY_MS, dt = new Date(a.times[i])
    tip.hidden = false; tip.style.left = `${((px / W) * 100).toFixed(1)}%`; tip.classList.toggle("sim-nav-flip", px > L + PW * 0.7)
    tip.innerHTML = `<b>${tr("Day", "Día")} ${Math.floor(d) + 1} · ${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")} UTC</b>
      <span><i style="background:${SOL}"></i>${tr("Visible Sun", "Sol visible")} <em>${f0(a.sun[i] * 100)} %</em></span><span><i style="background:${BAT}"></i>${tr("Battery", "Batería")} <em>${f0(a.soc[i] * 100)} %</em></span>
      <span><i style="background:${a.earth[i] ? TIERRA : "transparent"};outline:1px solid ${TIERRA}"></i>${tr("Earth", "Tierra")} <em>${a.earth[i] ? tr("in view", "a la vista") : tr("hidden", "oculta")}</em></span>`
  }
}
