// @ts-nocheck
// Navegador de sitios (planificación): estado compartido por las cinco pestañas y el pegamento entre vistas.
// Portado de main.js del navegador de NASA, sin la escena 3D (la pestaña 3D abre el alunizaje de Horizon).
// Motor sin React: `montarNavegador` construye el DOM dentro de `host` y devuelve cómo cambiar de vista y desmontarlo.
// El estado (sitio, comparados, periodo, altura, instante y la misión guiada) vive en `memoria`, a nivel de módulo:
// sobrevive a ir al 3D y volver.
import { tr } from "@/shared/i18n"
import { analyze, stateAt, mascaraEn, prepararTabla, sitiosNav, siteByIdNav, acotar, DAY_MS, TABLE_FROM_MS, TABLE_TO_MS } from "./analisis"
import { MapView } from "./vistas/mapa"
import { drawPanorama } from "./vistas/horizonte"
import { renderCompare, drawStrips } from "./vistas/comparar"
import { Guide } from "./vistas/guia"
import { DescentView } from "./vistas/descenso"
import { Briefing } from "./vistas/ficha"

export const VISTAS = ["guide", "descent", "map", "horizon", "compare"]
const SITIO_INICIAL = "connecting-ridge-roi-6"
// Inicio por defecto: el plan de CR-01 (aterrizaje el 2026-12-18 a las 09:00 UTC)
const INICIO = Date.UTC(2026, 11, 18, 9)

export const memoria = {
  selId: SITIO_INICIAL,
  compare: new Set([SITIO_INICIAL, "malapert-massif", "shoemaker"]),
  start: INICIO,
  days: 30,
  obsH: 2,
  time: INICIO,
  guia: null,
}

/** Sitio e instante del navegador: lo que abre el 3D. */
export const estadoNavegador = () => ({ siteId: memoria.selId, ms: memoria.time })

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const fmtDate = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC"
const isoDia = (t) => new Date(t).toISOString().slice(0, 10)

function plantilla() {
  const opt = (v, t, sel) => `<option value="${v}"${sel ? " selected" : ""}>${t}</option>`
  return `<div class="sim-nav-layout" data-n="layout">
  <aside class="sim-nav-sidebar">
    <section>
      <h2>${tr("Sites", "Sitios")}</h2>
      <p class="sim-nav-hint">${tr("Tick the sites to compare. Click the map to select the nearest one.", "Marca los sitios a comparar. Haz clic en el mapa para elegir el más cercano.")}</p>
      <ul class="sim-nav-site-list" data-n="site-list"></ul>
    </section>
    <section>
      <h2>${tr("Period", "Periodo")}</h2>
      <label>${tr("Start (UTC)", "Inicio (UTC)")}<input type="date" data-n="start-date" /></label>
      <label>${tr("Duration", "Duración")}
        <select data-n="duration">${opt(7, tr("7 days", "7 días"))}${opt(14, tr("14 days", "14 días"))}${opt(30, tr("30 days (1 lunar day)", "30 días (1 día lunar)"))}${opt(90, tr("90 days", "90 días"))}${opt(365, tr("1 year", "1 año"))}</select>
      </label>
      <label>${tr("Panel / antenna height", "Altura del panel / antena")}
        <select data-n="obs-height">${opt(2, tr("2 m (lander / astronaut)", "2 m (módulo / astronauta)"))}${opt(10, tr("10 m (mast)", "10 m (mástil)"))}${opt(20, tr("20 m (tower)", "20 m (torre)"))}</select>
      </label>
    </section>
    <section class="sim-nav-readout" data-n="readout"></section>
    <details class="sim-nav-about">
      <summary>${tr("Data and method", "Datos y método")}</summary>
      <p>${tr("Horizon of each site: the Planner's masks, from the <b>PGDA 5 m DTM</b> (Barker et al. 2021) plus <b>LOLA</b> (Lunar Reconnaissance Orbiter, NASA) for the far terrain.", "Horizonte de cada sitio: las máscaras del Planificador, del <b>DTM de 5 m de PGDA</b> (Barker et al. 2021) más <b>LOLA</b> (Lunar Reconnaissance Orbiter, NASA) para el relieve lejano.")}</p>
      <p>${tr("Sun and Earth: the Planner's ephemeris table (2026–2030), every 10 minutes. The Sun counts as visible when part of its disk is above the terrain; Earth, when its center is (direct link).", "Sol y Tierra: la tabla de efemérides del Planificador (2026–2030), cada 10 minutos. El Sol cuenta como visible si asoma parte de su disco sobre el relieve; la Tierra, si su centro está sobre él (enlace directo).")}</p>
      <p>${tr("The figures are the same as the Planner's for that site, date and height. Educational tool, not for operational planning.", "Las cifras son las mismas del Planificador para ese sitio, fecha y altura. Herramienta educativa, no para planificación operacional.")}</p>
    </details>
  </aside>
  <div class="sim-nav-main">
    <div class="sim-nav-status" data-n="status" hidden></div>
    <section class="sim-nav-view sim-nav-view-guide" data-v="guide"></section>
    <section class="sim-nav-view" data-v="descent"></section>
    <section class="sim-nav-view sim-nav-view-map" data-v="map"><canvas class="sim-nav-map-canvas" data-n="map-canvas"></canvas><div class="sim-nav-tip" data-n="map-tip" hidden></div></section>
    <section class="sim-nav-view" data-v="horizon">
      <div class="sim-nav-cards" data-n="now-cards"></div>
      <canvas class="sim-nav-pano" data-n="pano-canvas"></canvas>
      <p class="sim-nav-legend"><span class="sim-nav-sw sim-nav-sun"></span>${tr("Sun path", "Trayectoria del Sol")} <span class="sim-nav-sw sim-nav-earth"></span>${tr("Earth path", "Trayectoria de la Tierra")} <span class="sim-nav-sw sim-nav-terrain"></span>${tr("Terrain (local horizon). Faint dots are hidden behind the terrain.", "Relieve (horizonte local). Los puntos tenues están ocultos tras el relieve.")}</p>
    </section>
    <section class="sim-nav-view" data-v="compare">
      <table class="sim-nav-compare" data-n="compare-table"></table>
      <p class="sim-nav-legend"><span class="sim-nav-sw sim-nav-both"></span>${tr("Sun + Earth", "Sol + Tierra")} <span class="sim-nav-sw sim-nav-sun"></span>${tr("Sun only", "Solo Sol")} <span class="sim-nav-sw sim-nav-earth"></span>${tr("Earth only", "Solo Tierra")} <span class="sim-nav-sw sim-nav-none"></span>${tr("Neither Sun nor Earth", "Ni Sol ni Tierra")}</p>
    </section>
    <footer class="sim-nav-timebar">
      <button type="button" data-n="play" aria-label="${tr("Play", "Reproducir")}">▶</button>
      <input type="range" data-n="time-slider" min="0" max="1000" value="0" aria-label="${tr("Time", "Instante")}" />
      <span class="sim-nav-time-label" data-n="time-label"></span>
      <select data-n="speed" aria-label="${tr("Speed", "Velocidad")}">${opt(1, "1 h/s")}${opt(6, "6 h/s", true)}${opt(24, tr("1 day/s", "1 día/s"))}</select>
    </footer>
  </div>
</div>`
}

/**
 * Monta el navegador en `host`. `ir3d({ siteId, ms })` abre el alunizaje 3D. `sitio`/`fecha` (de la dirección) eligen
 * el sitio y el instante al entrar, si son válidos.
 */
export function montarNavegador(host, { vista = "guide", ir3d, sitio, fecha }) {
  host.innerHTML = plantilla()
  const $ = (k) => host.querySelector(`[data-n="${k}"]`)
  const viewEl = (v) => host.querySelector(`[data-v="${v}"]`)
  let vivo = true

  if (sitio && siteByIdNav.has(sitio) && sitio !== memoria.selId) { memoria.selId = sitio; memoria.compare.add(sitio) }
  if (fecha != null && Number.isFinite(fecha) && fecha >= memoria.start && fecha <= memoria.start + memoria.days * DAY_MS) memoria.time = fecha

  const maxStart = () => TABLE_TO_MS - app.days * DAY_MS
  const app = {
    sites: sitiosNav,
    selId: memoria.selId,
    compare: memoria.compare,
    masks: new Map(),
    results: new Map(),
    obsH: memoria.obsH,
    days: memoria.days,
    start: memoria.start,
    time: memoria.time,
    view: vista,
    mem: memoria,
    key(s) { return `${s.id}@${this.obsH}` },
    get sel() { return this.sites.find((s) => s.id === this.selId) },

    select(id) {
      this.selId = id
      this.compare.add(id)
      refresh()
    },

    setTime(t) {
      const end = this.start + this.days * DAY_MS
      this.time = Math.min(end, Math.max(this.start, t))
      $("time-slider").value = ((this.time - this.start) / (end - this.start)) * 1000
      renderTime()
    },
  }

  function guardar() {
    Object.assign(memoria, { selId: app.selId, start: app.start, days: app.days, obsH: app.obsH, time: app.time })
  }

  function status(msg, ms) {
    const el = $("status")
    if (!el) return
    el.textContent = msg; el.hidden = !msg
    clearTimeout(status.t)
    if (ms) status.t = setTimeout(() => { el.hidden = true }, ms)
  }

  async function ensureMask(s) {
    const k = app.key(s)
    if (app.masks.has(k)) return app.masks.get(k)
    status(tr(`Loading the horizon of ${s.name}…`, `Cargando el horizonte de ${s.name}…`))
    const m = await mascaraEn(s, app.obsH)
    app.masks.set(k, m)
    status("")
    return m
  }

  let runId = 0
  async function refresh() {
    const id = ++runId
    renderSiteList()
    map.draw()
    const end = app.start + app.days * DAY_MS
    const ids = new Set([...app.compare, app.selId])
    for (const s of app.sites.filter((x) => ids.has(x.id))) {
      const k = app.key(s)
      const resKey = `${k}|${app.start}|${app.days}`
      if (app.results.get(k)?.resKey === resKey) continue
      const mask = await ensureMask(s)
      if (!vivo || id !== runId) return
      const r = analyze(s, mask, app.start, end)
      r.resKey = resKey
      app.results.set(k, r)
    }
    status("")
    if (!vivo || id !== runId) return
    renderSiteList()
    if (app.view === "compare") renderCompare($("compare-table"), app)
    renderTime()
  }

  function renderSiteList() {
    const ul = $("site-list")
    ul.innerHTML = ""
    for (const s of app.sites) {
      const li = document.createElement("li")
      li.className = s.id === app.selId ? "sim-nav-selected" : ""
      const st = app.results.get(app.key(s))?.stats
      li.innerHTML = `<input type="checkbox" ${app.compare.has(s.id) ? "checked" : ""} aria-label="${tr("Compare", "Comparar")} ${esc(s.name)}">
        <span class="sim-nav-dot" style="background:${s.color}"></span>
        <span class="sim-nav-name">${esc(s.name)}<small>${s.lat.toFixed(3)}°, ${s.lon.toFixed(2)}°E${st ? ` · ☀ ${st.sunPct.toFixed(0)}% · 🜨 ${st.earthPct.toFixed(0)}%` : ""}</small></span>`
      li.querySelector("input").addEventListener("click", (e) => {
        e.stopPropagation()
        if (e.target.checked) app.compare.add(s.id); else app.compare.delete(s.id)
        refresh()
      })
      li.addEventListener("click", () => app.select(s.id))
      ul.appendChild(li)
    }
  }

  function renderTime() {
    if (!vivo) return
    guardar()
    $("time-label").textContent = fmtDate(app.time)
    const s = app.sel
    if (!s) return
    const k = app.key(s)
    const mask = app.masks.get(k)
    if (!mask) return
    const now = stateAt(s, mask, app.time)
    const yes = (v) => (v ? `<span class="sim-nav-ok">${tr("yes", "sí")}</span>` : `<span class="sim-nav-bad">no</span>`)
    $("readout").innerHTML = `<h2>${esc(s.name)}</h2>
      <div class="sim-nav-row"><span>${tr("Terrain elevation", "Elevación del terreno")}</span><span>${Math.round(s.elev)} m</span></div>
      <div class="sim-nav-row"><span>${tr("Horizon", "Horizonte")}</span><span>${s.horizon === "detailed" ? "DTM 5 m (PGDA)" : "LOLA 240 m"}</span></div>
      <div class="sim-nav-row"><span>${tr("Sun: azimuth / elevation", "Sol: acimut / altura")}</span><span>${now.sun.az.toFixed(1)}° / ${now.sun.el.toFixed(2)}°</span></div>
      <div class="sim-nav-row"><span>${tr("Visible solar disk", "Disco solar visible")}</span><span>${(now.sun.frac * 100).toFixed(0)} %</span></div>
      <div class="sim-nav-row"><span>${tr("Earth: azimuth / elevation", "Tierra: acimut / altura")}</span><span>${now.earth.az.toFixed(1)}° / ${now.earth.el.toFixed(2)}°</span></div>
      <div class="sim-nav-row"><span>${tr("Direct communication", "Comunicación directa")}</span><span>${yes(now.earth.visible)}</span></div>`

    if (app.view === "horizon") {
      const st = app.results.get(k)?.stats
      $("now-cards").innerHTML = `
        <div class="sim-nav-card"><h3>${tr("Solar power now", "Energía solar ahora")}</h3><div class="sim-nav-big ${now.sun.frac > 0.5 ? "sim-nav-ok" : "sim-nav-bad"}">${(now.sun.frac * 100).toFixed(0)} %</div>
          <div class="sim-nav-sub">${tr(`Sun at ${now.sun.el.toFixed(2)}°, terrain at ${now.sun.horizon.toFixed(2)}° (azimuth ${now.sun.az.toFixed(0)}°)`, `Sol a ${now.sun.el.toFixed(2)}°, relieve a ${now.sun.horizon.toFixed(2)}° (acimut ${now.sun.az.toFixed(0)}°)`)}</div></div>
        <div class="sim-nav-card"><h3>${tr("Link with Earth", "Enlace con la Tierra")}</h3><div class="sim-nav-big">${yes(now.earth.visible)}</div>
          <div class="sim-nav-sub">${tr(`Earth at ${now.earth.el.toFixed(2)}°, terrain at ${now.earth.horizon.toFixed(2)}°`, `Tierra a ${now.earth.el.toFixed(2)}°, relieve a ${now.earth.horizon.toFixed(2)}°`)}</div></div>
        ${st ? `<div class="sim-nav-card"><h3>${tr("Over the period", "En el periodo")}</h3><div class="sim-nav-big">${st.sunPct.toFixed(0)} % / ${st.earthPct.toFixed(0)} %</div>
          <div class="sim-nav-sub">${tr(`Sun visible / Earth visible · both ${st.bothPct.toFixed(0)} %`, `Sol visible / Tierra visible · ambos ${st.bothPct.toFixed(0)} %`)}</div></div>` : ""}`
      drawPanorama($("pano-canvas"), { mask, series: app.results.get(k), now })
    }
    if (app.view === "compare") drawStrips($("compare-table"), app.time)
    if (app.view === "descent") descent.render()
  }

  function showView(v) {
    if (!VISTAS.includes(v)) v = "guide"
    app.view = v
    $("layout").classList.toggle("sim-nav-guide-mode", v === "guide") // vista simple para el público general
    host.querySelectorAll(".sim-nav-view").forEach((el) => el.classList.toggle("sim-nav-active", el.dataset.v === v))
    if (v === "map") map.draw()
    if (v === "guide") guide.render()
    if (v === "descent") descent.render()
    if (v === "compare") renderCompare($("compare-table"), app)
    return refresh()
  }

  // Reproducción
  let playing = false, last = 0, raf = 0
  function setPlaying(p) {
    playing = p
    $("play").textContent = playing ? "❚❚" : "▶"
    $("play").setAttribute("aria-label", playing ? tr("Pause", "Pausar") : tr("Play", "Reproducir"))
    last = 0
    cancelAnimationFrame(raf)
    if (playing) raf = requestAnimationFrame(tick)
  }
  function tick(ts) {
    if (!playing || !vivo) return
    const dt = last ? (ts - last) / 1000 : 0
    last = ts
    const end = app.start + app.days * DAY_MS
    let t = app.time + dt * Number($("speed").value) * 3600e3
    if (t > end) t = app.start
    app.setTime(t)
    raf = requestAnimationFrame(tick)
  }

  /** Cambia el periodo de análisis y sincroniza la barra lateral. */
  app.setPeriod = ({ start, days, obsH }) => {
    if (days != null) { app.days = days; $("duration").value = String(days) }
    if (start != null && !Number.isNaN(start)) app.start = Math.min(maxStart(), Math.max(TABLE_FROM_MS, start))
    else app.start = Math.min(maxStart(), app.start)
    $("start-date").value = isoDia(app.start)
    $("start-date").max = isoDia(maxStart())
    if (obsH != null) { app.obsH = obsH; $("obs-height").value = String(obsH) }
    app.setTime(Math.min(Math.max(app.time, app.start), app.start + app.days * DAY_MS))
    return refresh()
  }
  app.refresh = () => refresh()
  app.ensureMask = ensureMask
  app.ir3d = () => { setPlaying(false); guardar(); ir3d({ siteId: app.selId, ms: acotar(app.time) }) }
  app.mostrarFicha = (m) => brief.show(m)

  const map = new MapView($("map-canvas"), $("map-tip"), app)
  const guide = new Guide(viewEl("guide"), app)
  const descent = new DescentView(viewEl("descent"), app)
  const brief = new Briefing(host.querySelector(".sim-nav-layout"), app)

  // Controles
  const off = []
  const on = (el, t, f) => { el.addEventListener(t, f); off.push(() => el.removeEventListener(t, f)) }
  $("start-date").value = isoDia(app.start)
  $("start-date").min = isoDia(TABLE_FROM_MS)
  $("start-date").max = isoDia(maxStart())
  $("duration").value = String(app.days)
  $("obs-height").value = String(app.obsH)
  on($("start-date"), "change", (e) => {
    if (!e.target.value) return
    // Se conserva la hora del día del inicio (09:00 UTC en el plan por defecto)
    const hora = app.start % DAY_MS
    app.setPeriod({ start: Date.parse(e.target.value + "T00:00:00Z") + hora })
    app.setTime(app.start)
  })
  on($("duration"), "change", (e) => { app.setPeriod({ days: Number(e.target.value) }) })
  on($("obs-height"), "change", (e) => { app.setPeriod({ obsH: Number(e.target.value) }) })
  on($("time-slider"), "input", (e) => {
    app.time = app.start + (Number(e.target.value) / 1000) * app.days * DAY_MS
    renderTime()
  })
  on($("play"), "click", () => setPlaying(!playing))
  const ro = new ResizeObserver(() => renderTime())
  ro.observe($("pano-canvas"))

  // Arranque: la tabla de efemérides primero (las vistas calculan en síncrono)
  status(tr("Loading ephemeris…", "Cargando efemérides…"))
  const listo = prepararTabla().then(() => {
    if (!vivo) return
    status("")
    app.setTime(app.time)
    return showView(vista)
  }).catch((e) => { console.error(e); status(tr("Error: ", "Error: ") + e.message) })

  return {
    setView(v) { if (vivo) listo.then(() => vivo && showView(v)) },
    destroy() {
      vivo = false
      guardar()
      setPlaying(false)
      cancelAnimationFrame(raf)
      clearTimeout(status.t)
      off.forEach((f) => f())
      ro.disconnect()
      map.destroy()
      guide.destroy()
      descent.destroy()
      brief.destroy()
      host.innerHTML = ""
    },
  }
}
