// @ts-nocheck
// Configuración de la misión y viabilidad (energía + comunicaciones) por sitio. Portado de mission.js del navegador de NASA.
//
// Balance de energía paso a paso sobre la serie del sitio (Sol y Tierra del motor del Planificador):
//   generación = potencia de paneles × factor de orientación × (1 − polvo)
//   batería    = batería + (generación − consumo) · Δt, limitada a [0, capacidad]
// Orientación (en el polo el Sol está a ±1.5° del horizonte):
//   vertical con seguimiento: factor = fracción visible del Sol × cos(elevación)
//   vertical fija (acimut A): factor = fracción × max(0, cos(acimut del Sol − A)) × cos(elevación)
//   horizontal:               factor = fracción × max(0, sen(elevación))  -> casi nada en el polo
// Incertidumbre: se sube el horizonte δ grados y se recalcula el Sol visible.
// Sol visible (noches): la definición del motor (algo del disco a la vista), igual que las cifras del Planificador.
import { tr, lang } from "@/shared/i18n"
import { fraccionDisco, horizonteA, RADIO_SOL } from "./analisis"

const KEY = "horizon-signai.navegador.mision"
const D2R = Math.PI / 180
export const LOC = lang === "es" ? "es" : "en"

export const PRESETS = {
  robotica: { tipo: "robotica", objetivo: "ambos", duracionD: 14, loadKW: 0.15, batteryKWh: 5, panelKW: 0.6, crew: 0, evaH: 0, maxBlackoutH: 72, minSocPct: 20 },
  tripulada: { tipo: "tripulada", objetivo: "ambos", duracionD: 7, loadKW: 2.0, batteryKWh: 60, panelKW: 8, crew: 2, evaH: 4, maxBlackoutH: 24, minSocPct: 25 },
}

export const DEFAULT_MISSION = {
  ...PRESETS.robotica,
  nombre: tr("South pole mission", "Misión polo sur"),
  orientacion: "vertical-seguimiento", panelAz: 0,
  incertidumbreDeg: 0, polvoPct: 0,
  falloBateria: false, falloAntena24h: false,
}

export function loadMission() {
  try { return { ...DEFAULT_MISSION, ...JSON.parse(localStorage.getItem(KEY) || "{}") } } catch { return { ...DEFAULT_MISSION } }
}
export function saveMission(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* sin almacenamiento */ }
}

/** Número con decimales fijos en el idioma de la página. */
export const f0 = (n, d = 0) => (Number.isFinite(n) ? n : 0).toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d })

export function fmtH(h) {
  if (!Number.isFinite(h)) return "∞"
  if (h >= 48) return `${(h / 24).toLocaleString(LOC, { maximumFractionDigits: 1 })} d`
  return `${Math.round(h)} h`
}

/** Qué tiene que lograr la misión, dicho en claro. `metas` son las condiciones que se comprueban en el periodo. */
export function objetivoMision(m) {
  const crew = m.tipo === "tripulada", en = m.objetivo !== "comunicacion", co = m.objetivo !== "energia"
  const dd = m.duracionD ?? (crew ? 7 : 14)
  const titulo = crew
    ? tr(`Keep ${m.crew} astronauts alive at the south pole for ${dd} days`, `Mantener con vida a ${m.crew} astronautas en el polo sur durante ${dd} días`)
    : tr(`Keep a science station running at the south pole for ${dd} days, like today's robotic landers`, `Mantener funcionando una estación científica en el polo sur durante ${dd} días, como los módulos robóticos actuales`)
  const metas = []
  if (en) metas.push(crew ? tr("Life support must never shut down: the battery cannot reach zero", "Que el soporte vital no se apague nunca: la batería no puede llegar a cero") : tr("The lander must not run out of power: without heating the electronics freeze", "Que la nave no se quede sin energía: sin calefacción la electrónica se congela"))
  if (en) metas.push(tr(`The battery must not drop below a ${m.minSocPct} % reserve, not even in the longest shadow`, `Que la batería no baje del ${m.minSocPct} % de reserva, ni siquiera en la sombra más larga`))
  if (co) metas.push(tr(`No more than ${fmtH(m.maxBlackoutH)} in a row without line of sight to Earth`, `No pasar más de ${fmtH(m.maxBlackoutH)} seguidas sin línea de vista con la Tierra`))
  if (crew && m.evaH) metas.push(tr(`Be able to go outside ${m.evaH} h a day and come back with margin`, `Poder salir al exterior ${m.evaH} h al día y volver con margen`))
  return {
    titulo, metas,
    porque: crew ? tr("With people on board there is no second chance: what shuts down is the air.", "Con gente a bordo no hay segunda oportunidad: lo que se apaga es el aire.") : tr("If the lander shuts down the mission is lost, not lives; that is why it tolerates more silence and less margin.", "Si la nave se apaga se pierde la misión, no vidas; por eso tolera más silencio y menos margen."),
  }
}

/** Consumo total de la misión (kW): base + tripulación (soporte vital ~0.5 kW por persona). */
export const totalLoad = (m) => m.loadKW + (m.tipo === "tripulada" ? 0.5 * m.crew : 0)

const fecha = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC"

/**
 * Analiza una serie de un sitio con la configuración de misión.
 * @param series  resultado de analyze() (times, sunFrac, sunLit, sunAz, sunEl, earthVis, stepH)
 * @param mask    máscara del sitio a su altura (para la incertidumbre)
 */
export function analyzeMission(series, mask, m) {
  const n = series.times.length, dt = series.stepH
  const cap = m.batteryKWh * (m.falloBateria ? 0.5 : 1)
  const load = totalLoad(m)
  const soc = new Float32Array(n), gen = new Float32Array(n), sun = new Float32Array(n), lits = new Uint8Array(n), earth = new Uint8Array(n)
  let b = cap, minSoc = cap, depletedH = 0, firstDepletion = null, below = 0
  let night = 0, maxNight = 0, black = 0, maxBlack = 0, windows = 0, windowH = 0, inWin = false, genSum = 0
  for (let i = 0; i < n; i++) {
    const el = series.sunEl[i], az = series.sunAz[i]
    let f = series.sunFrac[i]
    let lit = !!series.sunLit[i]
    if (m.incertidumbreDeg && mask) { f = fraccionDisco(el, horizonteA(mask, az) + m.incertidumbreDeg, RADIO_SOL); lit = f > 0 }
    sun[i] = f; lits[i] = lit ? 1 : 0
    const orient = m.orientacion === "horizontal" ? Math.max(0, Math.sin(el * D2R))
      : m.orientacion === "vertical-fija" ? Math.max(0, Math.cos((az - m.panelAz) * D2R)) * Math.cos(el * D2R)
        : Math.cos(el * D2R)
    const g = m.panelKW * f * orient * (1 - m.polvoPct / 100)
    gen[i] = g; genSum += g * dt
    b = Math.min(cap, Math.max(0, b + (g - load) * dt))
    soc[i] = cap ? b / cap : 0
    if (b < minSoc) minSoc = b
    if (b <= 1e-6) { depletedH += dt; if (firstDepletion == null) firstDepletion = series.times[i] }
    if (cap && b / cap < m.minSocPct / 100) below += dt
    const e = m.falloAntena24h && i * dt < 24 ? 0 : series.earthVis[i]
    earth[i] = e
    night = lit ? 0 : night + dt; maxNight = Math.max(maxNight, night)
    black = e ? 0 : black + dt; maxBlack = Math.max(maxBlack, black)
    const ok = lit && e
    if (ok && !inWin) windows++
    if (ok) windowH += dt
    inWin = ok
  }
  const autonomyH = load > 0 ? cap / load : Infinity
  const total = (n - 1) * dt
  const causes = []
  if (depletedH > 0) causes.push(tr(`The battery runs out for ${fmtH(depletedH)} in total (first time: ${fecha(firstDepletion)}).`, `La batería se agota ${fmtH(depletedH)} en total (primera vez: ${fecha(firstDepletion)}).`))
  else if (below > 0) causes.push(tr(`The battery drops below the ${m.minSocPct} % minimum for ${fmtH(below)}.`, `La batería baja del mínimo de ${m.minSocPct} % durante ${fmtH(below)}.`))
  if (m.objetivo !== "energia" && maxBlack > m.maxBlackoutH) causes.push(tr(`Communication blackout of ${fmtH(maxBlack)} (maximum allowed ${fmtH(m.maxBlackoutH)}).`, `Corte de comunicación de ${fmtH(maxBlack)} (máximo permitido ${fmtH(m.maxBlackoutH)}).`))
  if (maxNight > autonomyH) causes.push(tr(`The longest night (${fmtH(maxNight)}) exceeds the battery autonomy (${fmtH(autonomyH)}).`, `La noche más larga (${fmtH(maxNight)}) supera la autonomía de la batería (${fmtH(autonomyH)}).`))
  const risks = []
  if (m.orientacion === "horizontal") risks.push(tr("Horizontal panels: at the pole the Sun is almost on the horizon and they barely generate.", "Paneles horizontales: en el polo el Sol está casi en el horizonte y apenas generan."))
  if (maxNight > autonomyH * 0.7 && maxNight <= autonomyH) risks.push(tr("Tight battery margin against the longest night.", "Margen de batería ajustado frente a la noche más larga."))
  if (maxBlack > m.maxBlackoutH * 0.7 && maxBlack <= m.maxBlackoutH) risks.push(tr("Tight communication margin.", "Margen de comunicación ajustado."))
  if (m.incertidumbreDeg > 0) risks.push(tr(`With ${m.incertidumbreDeg}° of terrain error the visible Sun changes; check the sensitivity.`, `Con ${m.incertidumbreDeg}° de error en el relieve, el Sol visible cambia; revisa la sensibilidad.`))
  if (genSum < load * total) risks.push(tr("Over the period less energy is generated than consumed.", "En el periodo se genera menos energía de la que se consume."))
  return {
    soc, gen, sun, lit: lits, earth, times: series.times, stepH: dt,
    stats: {
      sunPct: (100 * lits.reduce((s, v) => s + v, 0)) / n,
      earthPct: (100 * earth.reduce((s, e) => s + e, 0)) / n,
      minSocPct: cap ? (100 * minSoc) / cap : 0, depletedH, longestNightH: maxNight, longestBlackoutH: maxBlack,
      autonomyH, windows, windowH, genKWh: genSum, loadKWh: load * total, capKWh: cap, loadKW: load,
    },
    viable: causes.length === 0, causes, risks,
  }
}
