// @ts-nocheck
// Planificación del descenso: perfil por fases con puertas, criterio de luz y elipse de dispersión, como las figuras de
// NASA TN D-6846, para el sitio y la hora elegidos. Portado de descent.js.
// Diferencia: el relieve local es el paquete del sitio del simulador (public/simulador/sitios/<id>.i16: ±10 km a 80 m,
// LOLA), no el DEM global de NASA; por eso el mapa local cubre ±10 km (NASA: ±11 km).
import { tr } from "@/shared/i18n"
import { stateAt } from "../analisis"
import { descensoNominal, hitos, evaluarDescenso, CRITERIO_LUZ, ELIPSE_APOLLO11, PRECISION_M } from "../planDescenso"
import { destination, R_LUNA, llToXY } from "../polar"
import { f0 } from "../mision"
import { MAPA_URL } from "./mapa"

const COL = { P63: "#f0b030", P64: "#5aa9ff", P66: "#5fd38d" }
const FASE = { P63: tr(" braking", " frenado"), P64: tr(" approach", " aproximación"), P66: tr(" final", " final") }
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
const D2R = Math.PI / 180
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

/** Curva altura–alcance coloreada por fase. xMaxM: cuánto alcance mostrar antes del sitio. */
function profile(xMaxM, title, gates, pw = 1) {
  const d = descensoNominal(), M = d.muestras.filter((s) => -s.alcanceM <= xMaxM)
  const W = 560, H = 250, L = 62, B = 30, T = 18, R = 34
  const yMax = Math.max(...M.map((s) => s.alturaM)) * 1.08
  // pw < 1 comprime los ejes (raíz) para que las tres fases se vean a la vez, como en la figura del informe
  const X = (a) => L + (1 - Math.pow(Math.max(0, -a) / xMaxM, pw)) * (W - L - R), Y = (h) => T + (1 - Math.pow(Math.max(0, h) / yMax, pw)) * (H - T - B)
  let paths = ""
  for (const ph of ["P63", "P64", "P66"]) {
    const pts = M.filter((s) => s.fase === ph)
    if (pts.length > 1) paths += `<polyline fill="none" stroke="${COL[ph]}" stroke-width="3.5" stroke-linecap="round" points="${pts.map((s) => `${X(s.alcanceM).toFixed(1)},${Y(s.alturaM).toFixed(1)}`).join(" ")}"/>`
    if (pts.length > 1 && Math.hypot(X(pts[0].alcanceM) - X(pts.at(-1).alcanceM), Y(pts[0].alturaM) - Y(pts.at(-1).alturaM)) > 28) { const m = pts[Math.floor(pts.length * 0.45)]; paths += `<text x="${X(m.alcanceM) + 8}" y="${Y(m.alturaM) - 8}" class="sim-nav-ph" fill="${COL[ph]}">${ph}${FASE[ph]}</text>` }
  }
  const at = (t) => d.muestras.reduce((a, b) => (Math.abs(b.tS - t) < Math.abs(a.tS - t) ? b : a))
  const dots = gates.map(([name, t]) => { const s = at(t); return -s.alcanceM > xMaxM ? "" : `<circle cx="${X(s.alcanceM)}" cy="${Y(s.alturaM)}" r="5" fill="#f2f4f8" stroke="#0b0f16" stroke-width="1.5"/><text x="${X(s.alcanceM) - 8}" y="${Y(s.alturaM) - 12}" text-anchor="end" class="sim-nav-gt">${name} · ${f0(s.alturaM)} m</text>` }).join("")
  const xs = pw < 1 ? [1, 0.25, 0.04, 0.004, 0] : [1, 0.75, 0.5, 0.25, 0], ys = pw < 1 ? [1, 0.25, 0.03] : [1, 0.5]
  const ticks = xs.map((q) => `<text x="${X(-xMaxM * q)}" y="${H - 8}" text-anchor="middle" class="sim-nav-ax">${xMaxM * q >= 10000 ? f0((xMaxM * q) / 1000) + " km" : f0(xMaxM * q) + " m"}</text>`).join("")
    + ys.map((q) => { const h = (yMax / 1.08) * q; return `<text x="${L - 6}" y="${Y(h) + 4}" text-anchor="end" class="sim-nav-ax">${h >= 3000 ? f0(h / 1000, 1) + " km" : f0(h) + " m"}</text>` }).join("")
  return `<figure><figcaption>${title}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
    <path d="M${L} ${T}V${H - B}H${W - R}" fill="none" stroke="#4a5262"/>${paths}${dots}${ticks}
    <text x="${W - R}" y="${H - B - 6}" text-anchor="end" class="sim-nav-ax">${tr("site", "sitio")}</text></svg></figure>`
}

/** Relieve del sitio (paquete del simulador): alturas en dm relativas al centro, x al este y z al sur, rejilla n×n. */
const terrenos = new Map()
function cargarTerreno(id) {
  let p = terrenos.get(id)
  if (!p) {
    const dir = `/simulador/sitios/${encodeURIComponent(id)}`
    p = Promise.all([fetch(`${dir}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))), fetch(`${dir}.i16`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))])
      .then(([j, buf]) => {
        const dm = new Int16Array(buf), n = j.wide.n, half = j.wide.half, st = (2 * half) / (n - 1)
        // Altura (m) a e metros al este y n metros al norte del sitio; NaN fuera de la rejilla
        const h = (e, no) => {
          const fx = (e + half) / st, fz = (-no + half) / st
          if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return NaN
          const ix = Math.min(n - 2, Math.floor(fx)), iz = Math.min(n - 2, Math.floor(fz)), tx = fx - ix, tz = fz - iz, o = iz * n + ix
          return ((dm[o] * (1 - tx) + dm[o + 1] * tx) * (1 - tz) + (dm[o + n] * (1 - tx) + dm[o + n + 1] * tx) * tz) / 10
        }
        return { h, half, slope: j.slope }
      })
    p.catch(() => terrenos.delete(id))
    terrenos.set(id, p)
    p.then((t) => { p.listo = t })
  }
  return p
}

export class DescentView {
  constructor(el, app) {
    this.el = el; this.app = app; this.cache = new Map()
    this._click = (e) => { if (e.target.closest("[data-go3d]")) app.ir3d() }
    el.addEventListener("click", this._click)
  }
  destroy() { this.el.removeEventListener("click", this._click) }

  /** Pendientes dentro de la elipse (relieve de 80 m, base de 160 m). Devuelve celdas y % sobre el umbral. */
  _ellipse(site, ter, rumbo) {
    const k = `${site.id}|${Math.round(rumbo)}`
    if (this.cache.has(k)) return this.cache.get(k)
    const a = ELIPSE_APOLLO11.semiRumboM, b = ELIPSE_APOLLO11.semiCruzadoM, rr = rumbo * D2R, h = ter.h
    const cells = []; let steep = 0, tot = 0
    for (let u = -a; u <= a; u += 400) for (let c = -b; c <= b; c += 400) {
      if ((u / a) ** 2 + (c / b) ** 2 > 1) continue
      const e = u * Math.sin(rr) + c * Math.cos(rr), n = u * Math.cos(rr) - c * Math.sin(rr)
      const s = Math.atan(Math.hypot(h(e + 80, n) - h(e - 80, n), h(e, n + 80) - h(e, n - 80)) / 160) / D2R
      if (Number.isNaN(s)) continue
      tot++; if (s > 12) steep++
      cells.push([e, n, s])
    }
    const r = { cells, pct: tot ? (100 * steep) / tot : 0 }
    this.cache.set(k, r)
    return r
  }

  /** Relieve sombreado local (±halfM alrededor del sitio, norte arriba), iluminado desde el acimut del Sol. */
  _relief(site, ter, sunAz, halfM, N = 300) {
    const k = `rel|${site.id}|${Math.round(sunAz / 15)}`
    if (this.cache.has(k)) return this.cache.get(k)
    const st = (2 * halfM) / N
    const H = new Float32Array(N * N)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const e = -halfM + (i + 0.5) * st, n = halfM - (j + 0.5) * st
      const v = ter.h(e, n)
      H[j * N + i] = Number.isNaN(v) ? 0 : v
    }
    const c = document.createElement("canvas"); c.width = c.height = N
    const ctx = c.getContext("2d"), img = ctx.createImageData(N, N)
    const az = sunAz * D2R, alt = 22 * D2R // Sol subido a 22° solo para que el relieve se lea
    const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const g = (a, b) => H[Math.min(N - 1, Math.max(0, b)) * N + Math.min(N - 1, Math.max(0, a))]
      const dzdx = (g(i + 1, j) - g(i - 1, j)) / (2 * st), dzdy = (g(i, j - 1) - g(i, j + 1)) / (2 * st)
      const nl = Math.hypot(dzdx, dzdy, 1), sh = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / nl)
      const v = Math.min(255, 26 + 260 * sh), q = (j * N + i) * 4
      img.data[q] = v; img.data[q + 1] = v; img.data[q + 2] = v * 1.04; img.data[q + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const url = c.toDataURL("image/jpeg", 0.85)
    this.cache.set(k, url)
    return url
  }

  /** Dos mapas: el descenso completo sobre el polo y la llegada sobre el relieve local, con la elipse y el sitio. */
  _maps(s, ter, ev, sunAz) {
    const d = descensoNominal(), M = d.muestras, rr = ev.rumbo * D2R, la = s.lat * D2R, lo = s.lon * D2R
    const at = (t) => M.reduce((a, b) => (Math.abs(b.tS - t) < Math.abs(a.tS - t) ? b : a))
    const gates = [[tr("high gate", "puerta alta"), at(d.eventos.puertaAlta)], [tr("low gate", "puerta baja"), at(d.eventos.puertaBaja)]]
    const a = ELIPSE_APOLLO11.semiRumboM, b = ELIPSE_APOLLO11.semiCruzadoM
    const sitio = tr("site", "sitio")
    // --- Mapa local: ±10 km (el paquete del sitio), norte arriba
    let local = `<p class="sim-nav-d-note">${tr("Loading the site terrain…", "Cargando el relieve del sitio…")}</p>`
    if (ter) {
      const HALF = ter.half, S = 360, sc = S / (2 * HALF), cx = S / 2, cy = S / 2
      const P = (alc) => [cx + alc * Math.sin(rr) * sc, cy - alc * Math.cos(rr) * sc]
      const seg = (ph) => M.filter((q) => q.fase === ph && -q.alcanceM <= HALF * 1.5).map((q) => P(q.alcanceM).map((v) => v.toFixed(1)).join(",")).join(" ")
      local = `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${tr("Arrival at the site over the terrain", "Llegada al sitio sobre el relieve")}">
        <image href="${this._relief(s, ter, sunAz, HALF)}" width="${S}" height="${S}" preserveAspectRatio="none"/>
        ${["P63", "P64", "P66"].map((ph) => `<polyline points="${seg(ph)}" fill="none" stroke="${COL[ph]}" stroke-width="3" stroke-linecap="round"/>`).join("")}
        <ellipse cx="${cx}" cy="${cy}" rx="${b * sc}" ry="${a * sc}" fill="none" stroke="#f0b030" stroke-width="2.2" transform="rotate(${ev.rumbo} ${cx} ${cy})"/>
        <circle cx="${cx}" cy="${cy}" r="${PRECISION_M * sc}" fill="none" stroke="#5aa9ff" stroke-width="1.4" stroke-dasharray="4 3"/>
        ${gates.map(([n, q]) => { const [x, y] = P(q.alcanceM); return -q.alcanceM > HALF * 1.3 ? "" : `<circle cx="${x}" cy="${y}" r="4.5" fill="#f2f4f8" stroke="#0b0f16" stroke-width="1.5"/><text x="${x + 8}" y="${y - 7}" class="sim-nav-mp">${n}</text>` }).join("")}
        <circle cx="${cx}" cy="${cy}" r="6" fill="#f0695a"/><text x="${cx + 12}" y="${cy + 5}" class="sim-nav-mp sim-nav-big">${sitio}</text>
        <text x="10" y="18" class="sim-nav-mp">N ↑</text><path d="M${S - 16 - 5000 * sc} ${S - 14}h${5000 * sc}" stroke="#fff" stroke-width="2"/><text x="${S - 16}" y="${S - 20}" text-anchor="end" class="sim-nav-mp">5 km</text></svg>`
    }
    // --- Mapa del polo: ±300 km en estereográfica polar (el mismo mapa LOLA de la pestaña Mapa)
    const E = 300000, W = 360, k = W / (2 * E), X = (x) => (x + E) * k, Y = (y) => (E - y) * k
    const xy = (alc) => { const [l2, o2] = destination(la, lo, rr + Math.PI, -alc / R_LUNA); const r = 2 * R_LUNA * Math.tan(Math.PI / 4 + l2 / 2); return [X(r * Math.sin(o2)), Y(r * Math.cos(o2))] }
    const track = (ph) => M.filter((q, i) => q.fase === ph && i % 5 === 0).map((q) => xy(q.alcanceM).map((v) => v.toFixed(1)).join(",")).join(" ")
    const [sx, sy] = llToXY(s.lat, s.lon), px = X(sx), py = Y(sy)
    const [hx, hy] = xy(gates[0][1].alcanceM)
    const polar = `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${tr("Descent track over the south pole", "Trayectoria del descenso sobre el polo sur")}">
      <image href="${MAPA_URL}" width="${W}" height="${W}"/>
      <polyline points="${track("P63")}" fill="none" stroke="${COL.P63}" stroke-width="3" stroke-linecap="round"/>
      <polyline points="${track("P64")}" fill="none" stroke="${COL.P64}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${hx}" cy="${hy}" r="4" fill="#f2f4f8" stroke="#0b0f16" stroke-width="1.5"/>
      <circle cx="${px}" cy="${py}" r="6" fill="#f0695a" stroke="#0b0f16" stroke-width="1"/><text x="${px + 10}" y="${py + 5}" class="sim-nav-mp sim-nav-big">${sitio}</text>
      <text x="10" y="18" class="sim-nav-mp">${tr("south pole · ±300 km", "polo sur · ±300 km")}</text><path d="M${W - 16 - 100000 * k} ${W - 14}h${100000 * k}" stroke="#fff" stroke-width="2"/><text x="${W - 16}" y="${W - 20}" text-anchor="end" class="sim-nav-mp">100 km</text></svg>`
    return { local, polar }
  }

  render() {
    const app = this.app, s = app.sel, mask = s && app.masks.get(app.key(s))
    if (!mask) { this.el.innerHTML = `<p class="sim-nav-d-note">${tr("Pick a site in the list.", "Elige un sitio en la lista.")}</p>`; return }
    const tp = cargarTerreno(s.id), ter = tp.listo
    if (!ter) tp.then(() => { if (this.app.view === "descent" && this.app.sel?.id === s.id) this.render() }).catch(() => {})
    const now = stateAt(s, mask, app.time)
    const ev = evaluarDescenso(now.sun, now.earth), d = descensoNominal()
    const gates = [[tr("high gate", "puerta alta"), d.eventos.puertaAlta], [tr("low gate", "puerta baja"), d.eventos.puertaBaja]]
    const el = ter ? this._ellipse(s, ter, ev.rumbo) : null
    const maps = this._maps(s, ter, ev, now.sun.az)
    // Criterio de luz
    const LX = (g) => 20 + (Math.max(0, Math.min(30, g)) / 30) * 420
    const sunX = LX(now.sun.el)
    const coma = (v) => f0(v, 1)
    const light = `<svg viewBox="0 0 460 96" role="img" aria-label="${tr("Lighting criterion", "Criterio de luz")}">
      <rect x="${LX(CRITERIO_LUZ.minGrados)}" y="30" width="${LX(CRITERIO_LUZ.maxGrados) - LX(CRITERIO_LUZ.minGrados)}" height="22" fill="#d9a53a"/>
      <path d="M20 52H440" stroke="#8b93a7"/>
      ${[[0, "0°"], [10.9, coma(10.9) + "°"], [13.6, coma(13.6) + "°"], [30, "30°"]].map(([g, t], i) => `<text x="${LX(g) + (i === 2 ? 14 : i === 1 ? -6 : 0)}" y="72" text-anchor="middle" class="sim-nav-ax">${t}</text>`).join("")}
      <path d="M${sunX} 14V52" stroke="${ev.enBanda ? "#5fd38d" : "#ff6b6b"}" stroke-width="2.5"/><circle cx="${sunX}" cy="14" r="6" fill="#ffd25a"/>
      <text x="${Math.min(380, sunX + 10)}" y="18" class="sim-nav-gt">${tr("Sun at the site", "Sol en el sitio")}: ${f0(now.sun.el, 1)}°</text></svg>`
    const badge = { ok: [tr("pass", "cumple"), "ok"], bad: [tr("fail", "no cumple"), "bad"], na: [tr("n/a at the pole", "no aplica al polo"), "na"] }
    const contacto = new Date(app.time).toISOString().slice(0, 16).replace("T", " ")
    this.el.innerHTML = `<div class="sim-nav-d-wrap">
      <header><h2>${tr("Descent planning", "Planificación del descenso")}</h2><p>${esc(s.name)} · ${tr("touchdown", "contacto")} ${contacto} UTC · ${tr(`nominal Apollo 11 descent (${mmss(d.eventos.contacto)} from ignition)`, `descenso nominal del Apollo 11 (${mmss(d.eventos.contacto)} desde el encendido)`)}</p>
        <button type="button" data-go3d>${tr("See this descent in 3D →", "Ver este descenso en 3D →")}</button></header>
      <section class="sim-nav-d-card sim-nav-d-prof"><h3>${tr("Descent profile by phase", "Perfil de descenso por fases")}</h3><div class="sim-nav-d-two">${profile(500000, tr("Full descent · 480 km (compressed axes to show all three phases)", "Descenso completo · 480 km (ejes comprimidos para ver las tres fases)"), gates, 0.5)}${profile(9000, tr("Approach · last 9 km (true scale)", "Aproximación · últimos 9 km (escala real)"), gates)}</div>
        <p class="sim-nav-d-note">${tr("Height above the site against the remaining range. P63: braking with the engine at full thrust. P64: approach with the site in view. P66: almost vertical final descent.", "Altura sobre el sitio frente al alcance que falta. P63: frenado con el motor al máximo. P64: aproximación con el sitio a la vista. P66: descenso final casi vertical.")}</p></section>
      <section class="sim-nav-d-card"><h3>${tr("Lighting criterion", "Criterio de luz")}</h3><p class="sim-nav-d-sub">${tr("Sun elevation during the approach", "elevación del Sol en la aproximación")}</p>${light}
        <p class="sim-nav-d-note ${ev.enBanda ? "" : "sim-nav-warn"}">${ev.enBanda ? tr("The Sun is inside the band Apollo used.", "El Sol está dentro de la banda que usó el Apollo.") : tr(`<b>Does not apply to the south pole.</b> Apollo wanted the Sun between 10.9° and 13.6° to see the terrain with short shadows. Here the Sun is at ${f0(now.sun.el, 1)}° and never rises above ~2°: shadows are extremely long and planning needs another criterion (hazard cameras, own lighting).`, `<b>No aplica al polo sur.</b> El Apollo pedía el Sol entre 10,9° y 13,6° para ver el relieve con sombras cortas. Aquí el Sol está a ${f0(now.sun.el, 1)}° y nunca pasa de ~2°: las sombras son larguísimas y hay que planificar con otro criterio (cámaras de riesgo, iluminación propia).`)}</p></section>
      <section class="sim-nav-d-card"><h3>${tr("The descent on the map", "El descenso en el mapa")}</h3><p class="sim-nav-d-sub">${tr(`arrival heading ${f0(ev.rumbo)}° · the Sun behind the lander`, `rumbo de llegada ${f0(ev.rumbo)}° · el Sol queda a la espalda`)}</p>
        <div class="sim-nav-d-maps"><figure>${maps.polar}<figcaption>${tr("Track over the pole: it comes in from 480 km (off the map) while braking.", "Trayectoria sobre el polo: entra desde 480 km (fuera del mapa) frenando.")}</figcaption></figure>
          <figure>${maps.local}<figcaption>${tr(`Arrival: dispersion ellipse (3σ, ±${f0(ELIPSE_APOLLO11.semiRumboM / 1000, 1)} × ±${f0(ELIPSE_APOLLO11.semiCruzadoM / 1000, 1)} km) and 1 km precision circle.`, `Llegada: elipse de dispersión (3σ, ±${f0(ELIPSE_APOLLO11.semiRumboM / 1000, 1)} × ±${f0(ELIPSE_APOLLO11.semiCruzadoM / 1000, 1)} km) y círculo de precisión de 1 km.`)}</figcaption></figure></div>
        ${el ? `<p class="sim-nav-d-note ${el.pct > 10 ? "sim-nav-warn" : ""}"><b>${tr(`${f0(el.pct)} % of the ellipse is steeper than 12°.`, `${f0(el.pct)} % de la elipse tiene más de 12° de pendiente.`)}</b> ${tr(`80 m LOLA terrain, shaded with the Sun raised to 22° so it reads (in reality it is at ${f0(now.sun.el, 1)}°). The 12° threshold is an editable team assumption.`, `Relieve LOLA de 80 m, sombreado con el Sol subido a 22° para que se lea (en la realidad está a ${f0(now.sun.el, 1)}°). El umbral de 12° es un supuesto editable del equipo.`)}</p>` : ""}</section>
      <section class="sim-nav-d-card"><h3>${tr("Descent criteria", "Criterios del descenso")}</h3><ul class="sim-nav-d-crit">${ev.criterios.map((c) => `<li><span class="sim-nav-b sim-nav-${badge[c.estado][1]}">${badge[c.estado][0]}</span><div><b>${c.nombre}</b><p>${c.valor}${c.nota ? " · " + c.nota : ""}</p><small>${tr("Source", "Fuente")}: ${c.fuente}</small></div></li>`).join("")}</ul></section>
      <section class="sim-nav-d-card"><h3>${tr("Model validation", "Validación del modelo")}</h3><table><thead><tr><th>${tr("Milestone", "Hito")}</th><th>${tr("Model", "Modelo")}</th><th>${tr("Apollo 11 (pre-mission)", "Apollo 11 (premisión)")}</th><th>${tr("Difference", "Diferencia")}</th></tr></thead><tbody>
        ${hitos().map((h) => `<tr><td>${h.nombre}</td><td>${mmss(h.modeloS)}</td><td>${mmss(h.referenciaS)}</td><td>${h.modeloS - h.referenciaS > 0 ? "+" : ""}${f0(h.modeloS - h.referenciaS)} s</td></tr>`).join("")}
        <tr><td>${tr("Total ΔV", "ΔV total")}</td><td>${f0(ev.deltaV)} m/s</td><td>${f0(ev.deltaVRef)} m/s</td><td>${f0((100 * (ev.deltaV - ev.deltaVRef)) / ev.deltaVRef, 1)} %</td></tr></tbody></table>
        <p class="sim-nav-d-note">${tr("Apollo polynomial guidance (Klumpp, MIT R-695, 1971) with the NASA TN D-6846 profile (Bennett, 1972). The team's descent engine, the same one the 3D simulator flies.", "Guiado polinómico del Apollo (Klumpp, MIT R-695, 1971) con el perfil de NASA TN D-6846 (Bennett, 1972). El motor del descenso del equipo, el mismo que vuela el simulador 3D.")}</p></section>
    </div>`
  }
}
