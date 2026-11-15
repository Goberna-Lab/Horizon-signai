// @ts-nocheck
// Misión guiada: un recorrido de 5 pasos para que cualquier persona entienda por qué planificar una misión lunar es
// difícil y qué puede salir mal. Portado de guide.js. Sol, Tierra y cifras: el motor del Planificador (analisis.ts);
// pendiente: la del catálogo del Planificador (slopeDeg, rejilla de 240 m), no el DEM de NASA.
import { tr } from "@/shared/i18n"
import { analyze, acotar, DAY_MS, TABLE_TO_MS } from "../analisis"
import { PRESETS, DEFAULT_MISSION, analyzeMission, totalLoad, fmtH, loadMission, saveMission, objetivoMision, f0, LOC } from "../mision"

// Anillo de porcentaje (conic-gradient) y medidor grande
const ring = (pct, cls, label) => `<div class="sim-nav-g-ring sim-nav-${cls}" style="--p:${Math.max(0, Math.min(100, pct))}"><b>${Math.round(pct)}<small>%</small></b><span>${label}</span></div>`
const ICON = {
  robotica: '<svg viewBox="0 0 64 64"><rect x="14" y="22" width="36" height="22" rx="6"/><circle cx="25" cy="33" r="4"/><circle cx="39" cy="33" r="4"/><path d="M32 22v-8M26 14h12M18 44l-6 10M46 44l6 10M10 54h12M42 54h12"/></svg>',
  tripulada: '<svg viewBox="0 0 64 64"><circle cx="32" cy="26" r="16"/><path d="M21 24c2-6 20-6 22 0v5c-2 5-20 5-22 0z"/><path d="M16 58c2-10 9-15 16-15s14 5 16 15"/></svg>',
}
const day = (h) => tr(`day ${f0(h / 24 + 1)}`, `día ${f0(h / 24 + 1)}`)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const NIVEL = { alto: tr("high", "alto"), medio: tr("medium", "medio"), bajo: tr("low", "bajo") }

// Sitios representativos: cada uno enseña algo distinto
const SHORTLIST = [
  { id: "connecting-ridge-roi-6", why: tr("A high ridge between two craters: sunlit almost all the time.", "Una cresta alta entre dos cráteres: casi siempre con Sol.") },
  { id: "shackleton-rim-roi-4", why: tr("The rim of Shackleton crater, next to permanent shadows holding ice.", "El borde del cráter Shackleton, junto a sombras permanentes con hielo.") },
  { id: "malapert-massif", why: tr("A 5 km mountain facing Earth: good radio.", "Una montaña de 5 km mirando hacia la Tierra: buena radio.") },
  { id: "im-2", why: tr("Where the IM-2 mission landed (2025) and tipped over.", "Donde alunizó la misión IM-2 (2025) y cayó de lado.") },
  { id: "haworth", why: tr("Next to a large shadowed crater: interesting for ice, very dark.", "Junto a un gran cráter en sombra: interesante por el hielo, muy oscuro.") },
  { id: "shoemaker", why: tr("Far from the sunlit ridges: long nights.", "Lejos de las crestas iluminadas: largas noches.") },
]

// Complicaciones reales que ya vivieron misiones lunares
export const CASES = [
  { k: "aterrizaje", mission: "Apollo 11 (1969)", ok: true, text: tr("The planned site was full of boulders. Armstrong took manual control and landed with about 25 seconds of fuel before the limit, while the computer raised 1202 and 1201 overload alarms.", "El sitio previsto estaba lleno de rocas. Armstrong tomó el control manual y aterrizó con unos 25 segundos de combustible antes del límite, mientras la computadora daba alarmas 1202 y 1201 por sobrecarga.") },
  { k: "tripulacion", mission: "Apollo 13 (1970)", ok: true, text: tr("An oxygen tank exploded on the way to the Moon. The landing was cancelled and the crew came back using the Lunar Module as a lifeboat.", "Explotó un tanque de oxígeno camino a la Luna. Se canceló el alunizaje y la tripulación volvió usando el Módulo Lunar como bote salvavidas.") },
  { k: "polvo", mission: "Apollo 17 (1972)", ok: true, text: tr("A rover fender broke and lunar dust started covering everything. They fixed it with laminated maps, tape and clamps.", "Se rompió un guardabarros del rover y el polvo lunar empezó a cubrirlo todo. Lo repararon con mapas plastificados, cinta y pinzas.") },
  { k: "hardware", mission: tr("Beresheet, Israel (2019)", "Beresheet, Israel (2019)"), ok: false, text: tr("A gyroscope failed; while resetting systems the main engine shut down during the descent and the lander crashed.", "Falló un giroscopio; al reiniciar sistemas el motor principal se apagó durante el descenso y la nave se estrelló.") },
  { k: "comunicacion", mission: "Chang'e 4, China (2019)", ok: true, text: tr("It landed on the far side, with no line of sight to Earth. It needed a relay satellite (Queqiao) to communicate.", "Aterrizó en la cara oculta, sin línea de vista con la Tierra. Necesitó un satélite de retransmisión (Queqiao) para comunicarse.") },
  { k: "noche", mission: "Chandrayaan-3, India (2023)", ok: true, text: tr("First landing near the south pole (≈69° S). It worked for one lunar day, but never woke up again after the freezing night.", "Primer alunizaje cerca del polo sur (≈69° S). Funcionó un día lunar, pero no volvió a despertar después de la noche helada.") },
  { k: "aterrizaje", mission: tr("Hakuto-R M1, Japan (2023)", "Hakuto-R M1, Japón (2023)"), ok: false, text: tr("Passing over a crater rim, the lander misjudged its altitude. It thought it was on the ground, ran out of fuel and fell.", "Al pasar sobre el borde de un cráter, la nave calculó mal su altura. Creyó estar en el suelo, se quedó sin combustible y cayó.") },
  { k: "hardware", mission: tr("Luna 25, Russia (2023)", "Luna 25, Rusia (2023)"), ok: false, text: tr("An engine burn lasted 127 s instead of 84 s and the spacecraft crashed before attempting the landing.", "Un encendido de motor duró 127 s en lugar de 84 s y la nave se estrelló antes de intentar el alunizaje.") },
  { k: "energia", mission: tr("SLIM, Japan (2024)", "SLIM, Japón (2024)"), ok: true, text: tr("It landed precisely but upside down after losing a nozzle. Its panels ended up badly oriented and only generated power when the Sun direction changed.", "Aterrizó con precisión pero boca abajo tras perder una tobera. Sus paneles quedaron mal orientados y solo generó energía cuando cambió la dirección del Sol.") },
  { k: "aterrizaje", mission: tr("IM-1 Odysseus, USA (2024)", "IM-1 Odysseus, EE. UU. (2024)"), ok: true, text: tr("Its laser rangefinders did not work (a safety switch was left off). It landed near the south pole, but tipped over on a slope.", "Sus telémetros láser no funcionaron (un interruptor de seguridad quedó sin activar). Aterrizó cerca del polo sur, pero volcó sobre una pendiente.") },
  { k: "hardware", mission: tr("Peregrine, USA (2024)", "Peregrine, EE. UU. (2024)"), ok: false, text: tr("A propellant leak shortly after launch prevented any landing attempt.", "Una fuga de propelente poco después del lanzamiento impidió intentar el alunizaje.") },
  { k: "aterrizaje", mission: tr("IM-2 Athena, USA (2025)", "IM-2 Athena, EE. UU. (2025)"), ok: false, text: tr("It landed on its side inside a cold, dark crater on Mons Mouton. Without good light for its panels, the mission ended the next day.", "Alunizó de lado dentro de un cráter frío y oscuro en Mons Mouton. Sin buena luz para sus paneles, la misión terminó al día siguiente.") },
  { k: "noche", mission: tr("Blue Ghost M1, USA (2025)", "Blue Ghost M1, EE. UU. (2025)"), ok: true, text: tr("It landed well and operated a full lunar day (about 14 Earth days) until night came.", "Aterrizó bien y operó un día lunar completo (unos 14 días terrestres) hasta que llegó la noche.") },
]
const KIND = {
  aterrizaje: tr("Landing", "Aterrizaje"), noche: tr("Lunar night", "Noche lunar"), energia: tr("Power", "Energía"), comunicacion: tr("Communication", "Comunicación"),
  polvo: tr("Dust", "Polvo"), hardware: tr("Technical failures", "Fallos técnicos"), tripulacion: tr("Crew", "Tripulación"),
}

export class Guide {
  constructor(el, app) {
    this.el = el; this.app = app
    // El estado de la guía sobrevive a cambiar de pestaña (vive en la memoria del navegador)
    const g = (app.mem.guia ??= { step: 0, m: { ...DEFAULT_MISSION, ...PRESETS.robotica }, siteId: SHORTLIST[0].id, extras: { polvoPct: 0, falloBateria: false, falloAntena24h: false, incertidumbreDeg: 0 } })
    this.g = g
    this.cache = new Map()
    this.runId = 0
    this._onClick = (e) => this._click(e)
    this._onChange = (e) => this._change(e)
    el.addEventListener("click", this._onClick)
    el.addEventListener("change", this._onChange)
  }
  destroy() { this.dead = true; this.el.removeEventListener("click", this._onClick); this.el.removeEventListener("change", this._onChange) }

  get step() { return this.g.step } set step(v) { this.g.step = v }
  get m() { return this.g.m } set m(v) { this.g.m = v }
  get siteId() { return this.g.siteId } set siteId(v) { this.g.siteId = v }
  get extras() { return this.g.extras }
  get site() { return this.app.sites.find((s) => s.id === this.siteId) }
  _slope(site) { return site.slopeDeg }

  /* ---------------- Datos ---------------- */
  async _series(site, start, days) {
    const k = `${site.id}|${start}|${days}|${this.app.obsH}`
    if (!this.cache.has(k)) {
      const mask = await this.app.ensureMask(site)
      this.cache.set(k, analyze(site, mask, start, start + days * DAY_MS))
    }
    return this.cache.get(k)
  }

  /** Riesgo del aterrizaje (estimación educativa): pendiente, luz rasante y enlace en vivo. */
  _landingRisk(site, series) {
    const slope = this._slope(site), el = series.sunEl[0], frac = series.sunFrac[0], earth = !!series.earthVis[0]
    const factors = [], cases = new Set()
    let score = 0
    if (slope > 12) { score += 2; cases.add("IM-1"); factors.push(tr(`Slope of ${f0(slope, 1)}°: more than the ~12° the Apollo Lunar Module tolerated. Risk of tipping over, like IM-1.`, `Pendiente de ${f0(slope, 1)}°: más que los ~12° que toleraba el Módulo Lunar de Apollo. Riesgo de volcar, como IM-1.`)) }
    else if (slope > 6) { score += 1; factors.push(tr(`Slope of ${f0(slope, 1)}°: acceptable, but the exact spot must be chosen carefully.`, `Pendiente de ${f0(slope, 1)}°: aceptable, pero hay que elegir bien el punto exacto.`)) }
    else factors.push(tr(`Almost flat terrain (${f0(slope, 1)}°).`, `Terreno casi plano (${f0(slope, 1)}°).`))
    if (frac < 0.5) { score += 2; cases.add("IM-2"); factors.push(tr("You land in shadow: the cameras cannot see the rocks and the panels do not charge on arrival (like IM-2).", "Aterrizas en sombra: las cámaras no ven las rocas y los paneles no cargan al llegar (como IM-2).")) }
    else if (el < 1.5) { score += 1; cases.add("Hakuto-R"); factors.push(tr(`Sun only ${f0(el, 1)}° above the horizon: very long shadows hide rocks and holes.`, `Sol a solo ${f0(el, 1)}° sobre el horizonte: sombras larguísimas que esconden rocas y huecos.`)) }
    if (!earth) { score += 1; cases.add("Chang'e 4"); factors.push(tr("Earth is hidden behind the terrain: mission control cannot watch the descent live.", "La Tierra está oculta tras el relieve: el control de misión no ve el descenso en vivo.")) }
    else factors.push(tr("Earth is visible from the site: the descent is followed live.", "La Tierra se ve desde el sitio: el descenso se sigue en vivo."))
    if (!cases.size) cases.add("Apollo 11")
    return { level: score >= 3 ? "alto" : score >= 1 ? "medio" : "bajo", factors, slope, cases: [...cases].slice(0, 2).map((k) => CASES.find((c) => c.mission.startsWith(k))) }
  }

  /* ---------------- Eventos ---------------- */
  _change(e) {
    const t = e.target
    if (t.dataset.extra) {
      this.extras[t.dataset.extra] = t.type === "checkbox" ? t.checked : Number(t.value)
      this.render()
    }
    if (t.dataset.start && t.value) { this.app.setPeriod({ start: Date.parse(t.value + "T00:00:00Z") }).then(() => this.render()) }
  }

  async _click(e) {
    const b = e.target.closest("[data-g]")
    if (!b) return
    const [act, v] = b.dataset.g.split(":")
    if (act === "step") this.step = Number(v)
    if (act === "next") this.step = Math.min(4, this.step + 1)
    if (act === "prev") this.step = Math.max(0, this.step - 1)
    if (act === "type") this.m = { ...this.m, ...PRESETS[v] }
    if (act === "site") { this.siteId = v; this.app.select(v) }
    if (act === "month") { await this.app.setPeriod({ start: Number(v), days: 30 }) }
    if (act === "land") {
      // La ficha del sitio usa esta misma misión; al cerrarla se abre el 3D en el sitio y la fecha elegidos
      saveMission({ ...loadMission(), ...this.m, ...this.extras })
      this.app.select(this.siteId)
      this.app.setTime(this.app.start)
      this.app.mostrarFicha({ ...this.m, ...this.extras })
      return
    }
    if (act === "retry") { this.siteId = v; this.app.select(v); this.step = 3 }
    this.render()
  }

  /* ---------------- Dibujo ---------------- */
  async render() {
    const id = ++this.runId
    const steps = [tr("Your mission", "Tu misión"), tr("Where to land", "Dónde aterrizar"), tr("When", "Cuándo"), tr("Simulate", "Simula"), tr("Result", "Resultado")]
    const body = await [this._s0, this._s1, this._s2, this._s3, this._s4][this.step].call(this)
    if (this.dead || id !== this.runId) return
    const hints = [tr("What will you send to the Moon?", "¿Qué vas a mandar a la Luna?"), tr("Where will it land?", "¿Dónde va a aterrizar?"), tr("In which month?", "¿En qué mes?"), tr("This is what your first month would look like", "Así sería tu primer mes"), tr("Did you make it?", "¿Lo lograste?")]
    this.el.innerHTML = `
      <div class="sim-nav-g-wrap">
        <header class="sim-nav-g-hero">
          <div class="sim-nav-g-orbit" aria-hidden="true"><i></i><i></i><b></b></div>
          <div><p class="sim-nav-g-eyebrow">${tr("Guided mission · lunar south pole", "Misión guiada · polo sur de la Luna")}</p>
          <h2>${tr("Could you plan a mission to the Moon?", "¿Podrías planear una misión a la Luna?")}</h2>
          <p>${tr("Choose what to send, where and when. With real NASA data you will see whether your lander survives.", "Elige qué enviar, dónde y cuándo. Con datos reales de la NASA verás si tu nave sobrevive.")}</p></div>
        </header>
        <ol class="sim-nav-g-steps" style="--prog:${this.step / 4}">${steps.map((t, i) => `<li><button type="button" data-g="step:${i}" class="${i === this.step ? "sim-nav-on" : i < this.step ? "sim-nav-done" : ""}" aria-current="${i === this.step ? "step" : "false"}"><span>${i < this.step ? "✓" : i + 1}</span><em>${t}</em></button></li>`).join("")}</ol>
        <h3 class="sim-nav-g-q"><span>${tr(`Step ${this.step + 1} of 5`, `Paso ${this.step + 1} de 5`)}</span>${hints[this.step]}</h3>
        <section class="sim-nav-g-body">${body}</section>
        <nav class="sim-nav-g-nav">${this.step > 0 ? `<button type="button" data-g="prev">${tr("← Back", "← Atrás")}</button>` : "<span></span>"}${this.step < 4 ? `<button type="button" class="sim-nav-primary" data-g="next">${this.step === 2 ? tr("Simulate my mission", "Simular mi misión") : tr("Next", "Siguiente")} <i>→</i></button>` : `<button type="button" class="sim-nav-primary" data-g="step:0">${tr("Plan another mission", "Planear otra misión")} <i>↺</i></button>`}</nav>
      </div>`
  }

  _s0() {
    const card = (t, title, lines) => {
      const p = PRESETS[t], obj = objetivoMision(p)
      return `<button type="button" class="sim-nav-g-card ${this.m.tipo === t ? "sim-nav-on" : ""}" data-g="type:${t}">
        <div class="sim-nav-g-icon">${ICON[t]}</div><h3>${title}</h3>
        <div class="sim-nav-g-chips"><span><b>${f0(totalLoad(p) * 1000)}</b> ${tr("W consumption", "W de consumo")}</span><span><b>${p.batteryKWh}</b> ${tr("kWh battery", "kWh de batería")}</span><span><b>${p.maxBlackoutH}</b> ${tr("h max. without radio", "h máx. sin radio")}</span></div>
        <p class="sim-nav-g-goal"><b>${tr("Objective:", "Objetivo:")}</b> ${obj.titulo.charAt(0).toLowerCase() + obj.titulo.slice(1)}. ${obj.porque}</p>
        <ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul><i class="sim-nav-g-pick">${this.m.tipo === t ? tr("Chosen ✓", "Elegida ✓") : tr("Choose", "Elegir")}</i></button>`
    }
    const r = PRESETS.robotica, c = PRESETS.tripulada
    return `<div class="sim-nav-g-two">
      ${card("robotica", tr("Robotic mission", "Misión robótica"), [tr(`A lander with instruments that draws ${f0(r.loadKW * 1000)} W`, `Un módulo con instrumentos que consume ${f0(r.loadKW * 1000)} W`), tr(`${r.batteryKWh} kWh battery and ${f0(r.panelKW * 1000)} W panels`, `Batería de ${r.batteryKWh} kWh y paneles de ${f0(r.panelKW * 1000)} W`), tr(`It can go up to ${r.maxBlackoutH} h without talking to Earth`, `Puede pasar hasta ${r.maxBlackoutH} h sin hablar con la Tierra`), tr("If it shuts down, the mission is lost, not lives", "Si se apaga, se pierde la misión, no vidas")])}
      ${card("tripulada", tr("Crewed mission", "Misión tripulada"), [tr(`${c.crew} astronauts: life support can never shut down`, `${c.crew} astronautas: el soporte vital no puede apagarse nunca`), tr(`${f0(totalLoad(c))} kW consumption, ${c.batteryKWh} kWh battery, ${c.panelKW} kW panels`, `Consumo de ${f0(totalLoad(c))} kW, batería de ${c.batteryKWh} kWh, paneles de ${c.panelKW} kW`), tr(`At most ${c.maxBlackoutH} h without contact with Earth`, `Máximo ${c.maxBlackoutH} h sin contacto con la Tierra`), tr(`Moonwalks of ${c.evaH} h a day`, `Salidas al exterior de ${c.evaH} h al día`)])}
    </div>
    <div class="sim-nav-g-why"><i class="sim-nav-g-qm">?</i><b>${tr("Why does it matter?", "¿Por qué importa?")}</b> ${tr("On the Moon there are no power outlets and nobody to rescue you. Everything you need (power, communication, air) depends on where and when you land.", "En la Luna no hay enchufes ni nadie que te rescate. Todo lo que necesitas (energía, comunicación, aire) depende de dónde y cuándo aterrices.")}</div>`
  }

  async _s1() {
    const app = this.app, start = app.start
    const rows = await Promise.all(SHORTLIST.map(async (x) => {
      const s = app.sites.find((q) => q.id === x.id)
      if (!s) return ""
      const r = (await this._series(s, start, 30)).stats
      const slope = this._slope(s)
      const tags = [r.sunPct > 70 ? ["ok", tr("lots of light", "mucha luz")] : r.sunPct < 30 ? ["bad", tr("little light", "poca luz")] : ["warn", tr("light at times", "luz a ratos")],
        r.earthPct > 60 ? ["ok", tr("good radio", "buena radio")] : r.earthPct < 30 ? ["bad", tr("little radio", "poca radio")] : ["warn", tr("radio at times", "radio a ratos")],
        slope > 12 ? ["bad", tr("very steep", "muy inclinado")] : slope > 6 ? ["warn", tr("somewhat steep", "algo inclinado")] : ["ok", tr("flat", "plano")]]
      return `<button type="button" class="sim-nav-g-site ${s.id === this.siteId ? "sim-nav-on" : ""}" data-g="site:${s.id}">
        <h3>${esc(s.name)}</h3><p>${x.why}</p>
        <div class="sim-nav-g-rings">${ring(r.sunPct, "sun", tr("Sun", "Sol"))}${ring(r.earthPct, "earth", tr("Earth", "Tierra"))}</div>
        <div class="sim-nav-g-tags">${tags.map(([c, t]) => `<span class="sim-nav-${c}">${t}</span>`).join("")}</div>
        <dl><dt>${tr("Longest night", "Noche más larga")}</dt><dd>${fmtH(r.longestNightH)}</dd><dt>${tr("Slope", "Pendiente")}</dt><dd>${f0(slope, 1)}°</dd></dl></button>`
    }))
    const d = new Date(start).toISOString().slice(0, 10)
    return `<div class="sim-nav-g-why"><i class="sim-nav-g-qm">?</i><b>${tr("Why the south pole?", "¿Por qué el polo sur?")}</b> ${tr(`At the bottom of its craters there are places that never see the Sun and hold <b>water ice</b> (to drink, breathe and make fuel). But right next to them, on the ridges, the Sun almost never sets. The challenge: be close to the ice <i>and</i> have light and radio. Values for the 30 days from ${d}.`, `En el fondo de sus cráteres hay lugares que nunca ven el Sol y guardan <b>hielo de agua</b> (para beber, respirar y hacer combustible). Pero justo al lado, en las crestas, el Sol casi nunca se pone. El reto: estar cerca del hielo <i>y</i> tener luz y radio. Valores para los 30 días desde ${d}.`)}</div>
      <div class="sim-nav-g-grid">${rows.join("")}</div>`
  }

  async _s2() {
    const s = this.site, now = new Date()
    const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    const months = []
    for (let i = 0; i < 12; i++) {
      const t = Date.UTC(new Date(base).getUTCFullYear(), new Date(base).getUTCMonth() + i, 1)
      if (t + 30 * DAY_MS > TABLE_TO_MS) break // fuera de la tabla de efemérides (hasta 2030)
      months.push({ t, st: (await this._series(s, acotar(t), 30)).stats })
    }
    const cur = this.app.start
    const bars = months.map(({ t, st }) => `<button type="button" class="sim-nav-g-month ${Math.abs(t - cur) < DAY_MS ? "sim-nav-on" : ""}" data-g="month:${t}" title="${tr("Sun", "Sol")} ${f0(st.sunPct)} % · ${tr("Earth", "Tierra")} ${f0(st.earthPct)} %">
      <i class="sim-nav-sun" style="height:${st.sunPct}%"></i><i class="sim-nav-earth" style="height:${st.earthPct}%"></i>
      <span>${new Date(t).toLocaleString(LOC, { month: "short", timeZone: "UTC" })}</span></button>`).join("")
    return `<h3 class="sim-nav-g-h">${esc(s.name)} · ${tr("light and radio month by month", "luz y radio mes a mes")}</h3>
      <div class="sim-nav-g-months">${bars}</div>
      <p class="sim-nav-g-legend"><i class="sim-nav-sun"></i> ${tr("Sun visible", "Sol visible")} <i class="sim-nav-earth"></i> ${tr("Earth visible", "Tierra visible")} · ${tr("Tap a month to choose it (or type a date:", "Toca un mes para elegirlo (o escribe una fecha:")} <input type="date" data-start value="${new Date(cur).toISOString().slice(0, 10)}" min="2026-01-01" max="2030-12-01">)</p>
      <div class="sim-nav-g-why"><i class="sim-nav-g-qm">?</i><b>${tr("Why does it change?", "¿Por qué cambia?")}</b> ${tr("The Moon's axis is tilted only 1.5°, so at the pole the Sun circles skimming the horizon. Some months it passes a bit higher (more light) and others lower (more shadow). Earth, instead, rises and sets every month because of the Moon's <i>wobble</i> (libration), and a mountain can hide it for days.", "El eje de la Luna está inclinado solo 1,5°, así que en el polo el Sol da vueltas rozando el horizonte. Unos meses pasa un poco más alto (más luz) y otros más bajo (más sombra). La Tierra, en cambio, sube y baja cada mes por el <i>bamboleo</i> de la Luna (libración), y una montaña puede taparla durante días.")}</div>`
  }

  async _plan() {
    const s = this.site, app = this.app
    const series = await this._series(s, app.start, 30)
    const mask = await app.ensureMask(s)
    const m = { ...this.m, ...this.extras }
    return { s, series, a: analyzeMission(series, mask, m), risk: this._landingRisk(s, series), m }
  }

  _events({ s, a, risk, m }) {
    const ev = []
    const dt = a.stepH, n = a.soc.length
    const caseOf = (k) => CASES.filter((c) => c.k === k).slice(0, 2)
    ev.push({ h: 0, k: "aterrizaje", lvl: risk.level === "alto" ? "bad" : risk.level === "medio" ? "warn" : "ok", title: tr(`Landing at ${s.name} · ${NIVEL[risk.level]} risk`, `Aterrizaje en ${s.name} · riesgo ${NIVEL[risk.level]}`), text: risk.factors.join(" "), cases: risk.cases })
    if (m.falloBateria) ev.push({ h: 20, k: "hardware", lvl: "warn", title: tr("A battery module fails", "Falla un módulo de batería"), text: tr(`You have half the capacity left: ${f0(a.stats.capKWh, 1)} kWh. Every night becomes more dangerous.`, `Te queda la mitad de la capacidad: ${f0(a.stats.capKWh, 1)} kWh. Cada noche se hace más peligrosa.`), cases: [CASES.find((c) => c.mission.startsWith("SLIM"))] })
    if (m.falloAntena24h) ev.push({ h: 1, k: "comunicacion", lvl: "warn", title: tr("The antenna is mispointed", "La antena no apunta bien"), text: tr("No contact with Earth for the first 24 h: the ground team does not know whether you landed safely.", "Las primeras 24 h no hay contacto con la Tierra: el equipo en tierra no sabe si aterrizaste bien."), cases: [CASES.find((c) => c.mission.startsWith("IM-2"))] })
    if (m.polvoPct > 0) ev.push({ h: 48, k: "polvo", lvl: "warn", title: tr(`Dust covers the panels (−${m.polvoPct} %)`, `El polvo cubre los paneles (−${m.polvoPct} %)`), text: tr("Lunar regolith is fine, abrasive and sticks by static electricity. The panels generate less.", "El regolito lunar es fino, abrasivo y se pega por electricidad estática. Los paneles generan menos."), cases: caseOf("polvo") })
    // Noches (sin Sol, según el motor) y apagones de batería
    let i = 0
    let nights = 0
    while (i < n && nights < 3) {
      while (i < n && a.lit[i]) i++
      if (i >= n) break
      const s0 = i; while (i < n && !a.lit[i]) i++
      const len = (i - s0) * dt
      let dead = null
      for (let j = s0; j < i; j++) if (a.soc[j] <= 1e-6) { dead = j; break }
      nights++
      if (len >= 6) ev.push({ h: s0 * dt, k: "noche", lvl: dead != null ? "bad" : len > a.stats.autonomyH * 0.7 ? "warn" : "ok",
        title: tr(`Shadow arrives · lasts ${fmtH(len)}`, `Llega la sombra · dura ${fmtH(len)}`),
        text: dead != null ? tr(`The battery (${f0(a.stats.capKWh, 1)} kWh for ${f0(a.stats.loadKW * 1000)} W ≈ ${fmtH(a.stats.autonomyH)}) runs out after ${fmtH((dead - s0) * dt)} of darkness. Without power the electronics freeze: at −170 °C many landers never switch on again.`, `La batería (${f0(a.stats.capKWh, 1)} kWh para ${f0(a.stats.loadKW * 1000)} W ≈ ${fmtH(a.stats.autonomyH)}) se agota a las ${fmtH((dead - s0) * dt)} de oscuridad. Sin energía la electrónica se congela: a −170 °C muchas naves no vuelven a encender.`)
          : tr(`The battery holds: it had ${fmtH(a.stats.autonomyH)} and the shadow lasts ${fmtH(len)}.`, `La batería aguanta: tenía para ${fmtH(a.stats.autonomyH)} y la sombra dura ${fmtH(len)}.`), cases: dead != null ? caseOf("noche") : [] })
    }
    // Silencio con la Tierra
    let b = 0, best = null
    for (let j = 0; j < n; j++) { if (!a.earth[j]) { b++; if (!best || b > best.len) best = { end: j, len: b } } else b = 0 }
    if (best && best.len * dt >= 12) {
      const tooLong = best.len * dt > m.maxBlackoutH
      ev.push({ h: (best.end - best.len + 1) * dt, k: "comunicacion", lvl: tooLong ? "bad" : "warn", title: tr(`Radio silence: ${fmtH(best.len * dt)} without seeing Earth`, `Silencio de radio: ${fmtH(best.len * dt)} sin ver la Tierra`),
        text: tr("A mountain or the Moon's wobble hides Earth. ", "Una montaña o el bamboleo de la Luna esconden la Tierra. ") + (tooLong ? tr(`It exceeds your ${fmtH(m.maxBlackoutH)} limit: you would need a relay satellite.`, `Supera tu límite de ${fmtH(m.maxBlackoutH)}: necesitarías un satélite de retransmisión.`) : tr("It is within what your mission tolerates.", "Está dentro de lo que tu misión tolera.")), cases: caseOf("comunicacion") })
    }
    ev.push({ h: (n - 1) * dt, k: "fin", lvl: a.viable ? "ok" : "bad", title: tr("End of the first month", "Fin del primer mes"), text: tr(`You generated ${f0(a.stats.genKWh)} kWh and consumed ${f0(a.stats.loadKWh)} kWh. Minimum battery: ${f0(a.stats.minSocPct)} %.`, `Generaste ${f0(a.stats.genKWh)} kWh y consumiste ${f0(a.stats.loadKWh)} kWh. Batería mínima: ${f0(a.stats.minSocPct)} %.`), cases: [] })
    return ev.sort((x, y) => x.h - y.h)
  }

  async _s3() {
    const p = await this._plan()
    const ev = this._events(p)
    const chk = (k, label) => `<label class="sim-nav-g-chk"><input type="checkbox" data-extra="${k}" ${this.extras[k] ? "checked" : ""}> ${label}</label>`
    return `<div class="sim-nav-g-sim">
      <aside><h3 class="sim-nav-g-h">${tr("Add complications", "Añade complicaciones")}</h3>
        <label class="sim-nav-g-chk">${tr("Dust on the panels:", "Polvo en paneles:")} <select data-extra="polvoPct">${[0, 20, 40].map((v) => `<option value="${v}" ${this.extras.polvoPct === v ? "selected" : ""}>${v} %</option>`).join("")}</select></label>
        ${chk("falloBateria", tr("A battery module fails", "Falla un módulo de batería"))}${chk("falloAntena24h", tr("Antenna blocked on arrival", "Antena bloqueada al llegar"))}
        <label class="sim-nav-g-chk">${tr("Terrain map error:", "Error del mapa de relieve:")} <select data-extra="incertidumbreDeg">${[0, 0.5, 1].map((v) => `<option value="${v}" ${this.extras.incertidumbreDeg === v ? "selected" : ""}>${v}°</option>`).join("")}</select></label>
        <p class="sim-nav-g-small">${p.m.tipo === "tripulada" ? tr("Crewed mission", "Misión tripulada") : tr("Robotic mission", "Misión robótica")} · ${esc(p.s.name)} · ${tr("from", "desde")} ${new Date(this.app.start).toISOString().slice(0, 10)}</p>
        <button type="button" class="sim-nav-g-land" data-g="land">${tr("See the landing in 3D →", "Ver el alunizaje en 3D →")}</button>
      </aside>
      <ol class="sim-nav-g-timeline">${ev.map((e) => `<li class="sim-nav-${e.lvl}"><time>${day(e.h)}</time><div><h4><i class="sim-nav-g-dot"></i>${esc(e.title)}</h4><p>${e.text}</p>
        ${e.cases.map((c) => `<p class="sim-nav-g-case"><b>${tr("It really happened", "Pasó de verdad")} · ${c.mission}:</b> ${c.text}</p>`).join("")}</div></li>`).join("")}</ol></div>`
  }

  async _s4() {
    const p = await this._plan()
    const { a, risk, m } = p
    const dims = [
      [tr("Terrain", "Terreno"), risk.level === "bajo" ? "ok" : risk.level === "medio" ? "warn" : "bad", tr(`Slope: ${NIVEL[risk.level]} risk`, `Pendiente: riesgo ${NIVEL[risk.level]}`)],
      [tr("Power", "Energía"), a.stats.depletedH > 0 ? "bad" : a.stats.minSocPct < m.minSocPct ? "warn" : "ok", a.stats.depletedH > 0 ? tr(`${fmtH(a.stats.depletedH)} without power`, `${fmtH(a.stats.depletedH)} sin energía`) : tr(`Minimum battery ${f0(a.stats.minSocPct)} %`, `Batería mínima ${f0(a.stats.minSocPct)} %`)],
      [tr("Communication", "Comunicación"), a.stats.longestBlackoutH > m.maxBlackoutH ? "bad" : "ok", tr(`Longest silence ${fmtH(a.stats.longestBlackoutH)}`, `Silencio más largo ${fmtH(a.stats.longestBlackoutH)}`)],
      [tr("Surviving the night", "Sobrevivir la noche"), a.stats.longestNightH > a.stats.autonomyH ? "bad" : "ok", tr(`Night ${fmtH(a.stats.longestNightH)} vs battery ${fmtH(a.stats.autonomyH)}`, `Noche ${fmtH(a.stats.longestNightH)} vs batería ${fmtH(a.stats.autonomyH)}`)],
    ]
    const bad = dims.filter((d) => d[1] === "bad").length
    const verdict = risk.level === "alto" ? ["bad", tr("The chosen terrain exceeds the slope the lander tolerates", "El terreno elegido supera la pendiente que tolera la nave")] : bad === 0 ? ["ok", tr("It meets all your power and communication criteria", "Cumple todos tus criterios de energía y comunicación")] : ["warn", tr("It only partly meets them: check what is marked in red", "Cumple solo en parte: revisa lo marcado en rojo")]
    // Sugerencia: el sitio de la lista con mejores resultados para la misma misión y fecha
    let bestAlt = null
    for (const x of SHORTLIST) {
      const s = this.app.sites.find((q) => q.id === x.id)
      if (!s) continue
      const ser = await this._series(s, this.app.start, 30)
      const r = analyzeMission(ser, await this.app.ensureMask(s), { ...m })
      const score = (r.viable ? 100 : 0) + r.stats.minSocPct + r.stats.earthPct / 2 - r.stats.depletedH
      if (!bestAlt || score > bestAlt.score) bestAlt = { s, score, r }
    }
    const lessons = []
    if (a.stats.longestNightH > a.stats.autonomyH) lessons.push(tr("The lunar night is enemy number one: either pick a site with short nights or carry much more battery.", "La noche lunar es el enemigo número uno: o eliges un sitio con noches cortas o llevas mucha más batería."))
    if (a.stats.longestBlackoutH > m.maxBlackoutH) lessons.push(tr("Seeing Earth is not guaranteed, not even at the pole: the terrain hides it for days.", "Ver la Tierra no está garantizado ni en el polo: el relieve la tapa por días."))
    if (risk.level !== "bajo") lessons.push(tr("Landing with a grazing Sun or on a slope is dangerous: several recent landers tipped over that way.", "Aterrizar con el Sol rasante o en pendiente es peligroso: varias naves recientes volcaron así."))
    if (!lessons.length) lessons.push(tr("You chose well: light, radio and terrain on your side. Now try with complications in step 4.", "Elegiste bien: luz, radio y terreno a favor. Prueba ahora con complicaciones en el paso 4."))
    const pts = { ok: 100, warn: 60, bad: 15 }
    const score = Math.round((dims.reduce((acc, d) => acc + pts[d[1]], 0) / dims.length) * (risk.level === "alto" ? 0.6 : 1))
    return `<div class="sim-nav-g-result">
        <div class="sim-nav-g-gauge sim-nav-${verdict[0]}" style="--p:${score}"><b>${score}</b><span>${tr("mission points", "puntos de misión")}</span></div>
        <div class="sim-nav-g-verdict sim-nav-${verdict[0]}"><h3>${verdict[1]}</h3><p>${esc(p.s.name)} · ${new Date(this.app.start).toISOString().slice(0, 10)} · ${m.tipo === "tripulada" ? tr("crewed mission", "misión tripulada") : tr("robotic mission", "misión robótica")}</p>
          <div class="sim-nav-g-dims">${dims.map(([t, c, v]) => `<div class="sim-nav-${c}"><i></i><span>${t}</span><b>${v}</b></div>`).join("")}</div></div>
      </div>
      <h3 class="sim-nav-g-h">${tr("What you learned", "Lo que aprendiste")}</h3><ul class="sim-nav-g-lessons">${lessons.map((l) => `<li>${l}</li>`).join("")}</ul>
      ${bestAlt && bestAlt.s.id !== this.siteId ? `<div class="sim-nav-g-why"><b>${tr("Try this:", "Prueba esto:")}</b> ${tr(`with the same mission and date, <b>${esc(bestAlt.s.name)}</b> would give a minimum battery of ${f0(bestAlt.r.stats.minSocPct)} % and Earth visible ${f0(bestAlt.r.stats.earthPct)} % of the time.`, `con la misma misión y fecha, <b>${esc(bestAlt.s.name)}</b> daría batería mínima de ${f0(bestAlt.r.stats.minSocPct)} % y Tierra visible el ${f0(bestAlt.r.stats.earthPct)} % del tiempo.`)} <button type="button" data-g="retry:${bestAlt.s.id}">${tr("Simulate there →", "Simular allí →")}</button></div>` : ""}
      <h3 class="sim-nav-g-h">${tr("Complications other missions already lived through", "Complicaciones que ya vivieron otras misiones")}</h3>
      <div class="sim-nav-g-cases">${CASES.map((c) => `<article class="sim-nav-${c.ok ? "ok" : "bad"}"><span>${KIND[c.k]}</span><h4>${c.mission}</h4><p>${c.text}</p><b>${c.ok ? tr("The mission went on or was saved", "La misión siguió o se salvó") : tr("Mission lost", "Misión perdida")}</b></article>`).join("")}</div>
      <p class="sim-nav-g-small">${tr("Educational estimates with real data: the Planner's horizons (PGDA 5 m DTM + LOLA) and its Sun and Earth for the site, energy balance every 10 minutes. The landing risk is a simple rule (slope, light and radio), not a prediction.", "Estimaciones educativas con datos reales: los horizontes del Planificador (DTM de 5 m de PGDA + LOLA) y su Sol y Tierra para el sitio, balance de energía cada 10 minutos. El riesgo de aterrizaje es una regla simple (pendiente, luz y radio), no una predicción.")}</p>`
  }
}

