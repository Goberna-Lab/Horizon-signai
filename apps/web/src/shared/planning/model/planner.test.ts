// Correr: npm test (Node ≥ 22.18 entiende TypeScript)
//
// Comprueba el motor portado contra el ejemplo registrado en el SPEC E23 (docs/04-planificador.md, sección 5) y la
// lógica propia del planificador: cifras por tramo, alturas separadas, fechas alternativas y misiones de ejemplo.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { crearTablaLuna, prepararSitio } from "../engine/efemeridesLuna.ts"
import { perfilDesde, type Mascara } from "../engine/mascara.ts"
import { barrer, proximoCambio, resumir } from "../engine/planificador.ts"
import { DAY_MS, STEP_MS, dateWindows, evaluate, figures, scanDates, station, suggestDate, suggestHeight, sweep } from "./evaluate.ts"
import { describe, percent, reasons, span, stamp, toInput, fromInput } from "./format.ts"
import { EXAMPLE_MISSIONS, newMission, sanitize, TABLE_TO_MS } from "./missions.ts"
import type { Mission, Site } from "./types.ts"

const data = (name: string) => new URL(`../data/${name}`, import.meta.url)
const bytes = readFileSync(data("ephemeris.f32"))
const table = crearTablaLuna(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, JSON.parse(readFileSync(data("ephemeris.json"), "utf8")))
const sites: Site[] = JSON.parse(readFileSync(data("sites.json"), "utf8")).sites
const site = (id: string) => sites.find((s) => s.id === id)!
const mask = (id: string): Mascara => {
  const h = JSON.parse(readFileSync(data(`horizons/${id}.json`), "utf8"))
  return { pasoAzimutGrados: h.stepDeg, vertices: h.vertices, fuente: h.horizon }
}
const stationOf = (m: Mission) => station(site(m.siteId), mask(m.siteId), m.panelHeightM, m.antennaHeightM)
const evaluateMission = (m: Mission) => evaluate(table, stationOf(m), m)
const example = (id: string) => EXAMPLE_MISSIONS.find((m) => m.id === id)!

test("el motor portado reproduce el ejemplo del SPEC E23 (Connecting Ridge, 2026-12-01, a ras del suelo)", () => {
  const cr = site("connecting-ridge")
  const punto = { sitio: prepararSitio(cr.lat, cr.lon), perfil: perfilDesde(mask("connecting-ridge"), 0) }
  const inicio = Date.parse("2026-12-01T00:00:00Z")
  const mes = 29.530589 * DAY_MS
  const r = resumir(barrer(table, punto, inicio, inicio + mes - STEP_MS, STEP_MS))
  assert.equal((r.fraccionSol * 100).toFixed(1), "56.8")
  assert.equal((r.fraccionTierra * 100).toFixed(1), "19.9")
  assert.equal((r.fraccionAmbos * 100).toFixed(1), "9.4")
  const salida = proximoCambio(table, punto, inicio, "sol", inicio + 60 * DAY_MS)
  assert.equal(salida.visible, false)
  assert.equal(new Date(salida.cambioMs!).toISOString().slice(0, 16), "2026-12-04T08:51")
})

test("las cifras por tramo son las de `resumir` del motor", () => {
  const m = example("inti-2")
  const st = stationOf(m)
  const b = sweep(table, st, m.landingMs, m.landingMs + 10 * DAY_MS)
  const r = resumir(b)
  const f = figures(b)
  assert.ok(Math.abs(f.sunPct - r.fraccionSol * 100) < 1e-9)
  assert.ok(Math.abs(f.earthPct - r.fraccionTierra * 100) < 1e-9)
  assert.ok(Math.abs(f.bothPct - r.fraccionAmbos * 100) < 1e-9)
  assert.ok(Math.abs(f.sunH - r.horasSol) < 1e-9)
  assert.ok(Math.abs(f.longestNightH - r.nocheMasLargaH) < 1e-9)
  assert.ok(Math.abs(f.longestSilenceH - r.silencioMasLargoH) < 1e-9)
  assert.ok(Math.abs(f.meanPanelWm2 - r.panelMedioWm2) < 1e-6)
  // Un tramo en medio del barrido da lo mismo que barrer solo ese tramo.
  const largo = sweep(table, st, m.landingMs - 3 * DAY_MS, m.landingMs + 13 * DAY_MS)
  const tramo = figures(largo, 3 * 144, b.n)
  assert.deepEqual(tramo, f)
})

test("la antena baja ve menos Tierra y no cambia el Sol; con la misma altura el barrido es uno solo", () => {
  const cr = site("connecting-ridge")
  const m = mask("connecting-ridge")
  const sc = { ...example("inti-2") }
  const alta = evaluate(table, station(cr, m, 10, 10), sc)
  const baja = evaluate(table, station(cr, m, 10, 2), sc)
  assert.equal(baja.figures.sunPct, alta.figures.sunPct)
  assert.equal(baja.figures.longestNightH, alta.figures.longestNightH)
  assert.ok(baja.figures.earthPct < alta.figures.earthPct, `${baja.figures.earthPct} < ${alta.figures.earthPct}`)
  const misma = station(cr, m, 10, 10)
  assert.equal(misma.panel, misma.antenna)
})

test("misiones de ejemplo: KILLA-1 y CHASKA-3 cumplen; INTI-2 dejó de cumplir al moverse del 8 al 29 de marzo", () => {
  assert.equal(evaluateMission(example("killa-1")).ok, true)
  const chaska = evaluateMission(example("chaska-3"))
  assert.equal(chaska.ok, true)
  // Lejos del filo: el Sol queda a más de medio disco sobre el relieve al aterrizar.
  assert.ok(chaska.landing.sunMarginDeg > 0.25, `margen del Sol ${chaska.landing.sunMarginDeg}`)

  const inti = example("inti-2")
  const antes = evaluateMission({ ...inti, landingMs: inti.movedFromMs! })
  assert.equal(antes.ok, true)
  const ahora = evaluateMission(inti)
  assert.equal(ahora.ok, false)
  assert.deepEqual(ahora.checks.filter((c) => !c.ok).map((c) => c.id), ["earthAtLanding", "battery"])
  assert.equal(Math.round(ahora.figures.longestNightH), 105)
  assert.equal(reasons(ahora.checks), "Earth hidden at landing · longest night 105 h, battery 50 h")
  // Las ventanas suman lo mismo que las cifras (a un paso de 10 min por borde).
  const horasSol = ahora.windows.sun.reduce((a, w) => a + (w.finMs - w.inicioMs), 0) / 3_600_000
  assert.ok(Math.abs(horasSol - ahora.figures.sunH) < 1, `${horasSol} frente a ${ahora.figures.sunH}`)
  // La cuenta regresiva cae en el borde de la primera ventana de Sol.
  assert.ok(Math.abs(ahora.landing.sunChangeMs! - ahora.windows.sun[0].finMs) < 60_000)
})

test("fechas alternativas: cada día del barrido largo da el mismo veredicto que evaluarlo solo", () => {
  const inti = example("inti-2")
  const st = stationOf(inti)
  const dias = scanDates(table, st, inti)
  assert.equal(dias.length, 151)
  for (const d of [dias[0], dias[30], dias[38], dias[77], dias[150]]) {
    const solo = evaluate(table, st, { ...inti, landingMs: d.landingMs })
    assert.equal(d.ok, solo.ok)
    assert.deepEqual(d.figures, solo.figures)
  }
  assert.equal(dias[30].landingMs, inti.landingMs)
  assert.equal(dias[30].ok, false)

  const propuesta = suggestDate(dias, inti.landingMs)!
  assert.equal(stamp(propuesta.window.fromMs), "4 Apr 2027, 12:00 UT")
  assert.equal(stamp(propuesta.window.toMs), "8 Apr 2027, 12:00 UT")
  assert.equal(stamp(propuesta.day.landingMs), "6 Apr 2027, 12:00 UT")
  assert.equal(propuesta.slackDays, 2)
  assert.equal(propuesta.day.ok, true)
  // La ventana del plan original (del 6 al 15 de marzo) también aparece.
  assert.ok(dateWindows(dias).some((w) => w.fromMs <= inti.movedFromMs! && inti.movedFromMs! <= w.toMs))
  // En esa fecha subir el equipo no arregla nada: la Tierra está oculta por libración, no por el relieve cercano.
  assert.equal(suggestHeight(table, site(inti.siteId), mask(inti.siteId), inti, inti.panelHeightM, inti.antennaHeightM), null)
})

test("fechas alternativas: el barrido no se sale de la tabla de efemérides", () => {
  const tarde = sanitize({ ...example("killa-1"), landingMs: TABLE_TO_MS })
  assert.equal(tarde.landingMs, TABLE_TO_MS - 10 * DAY_MS)
  const dias = scanDates(table, stationOf(tarde), tarde)
  assert.equal(dias.at(-1)!.landingMs, tarde.landingMs)
  assert.equal(dias.length, 31)
})

test("formato y misiones nuevas", () => {
  assert.equal(span(37.4 * 3_600_000), "1 d 13 h")
  assert.equal(span(5.9 * 3_600_000), "5 h")
  assert.equal(percent(99.96), "100%")
  assert.equal(percent(56.44), "56.4%")
  assert.equal(fromInput(toInput(Date.UTC(2027, 2, 29, 12))), Date.UTC(2027, 2, 29, 12))
  assert.equal(fromInput("nada"), null)
  assert.equal(describe({ id: "earthAtLanding", ok: false, value: -4.59, limit: 0 }).detail, "Centre of Earth 4.6° below the terrain")
  const nueva = newMission(EXAMPLE_MISSIONS, Date.UTC(2026, 10, 15, 5, 30), "connecting-ridge-roi-6")
  assert.equal(nueva.name, "MISSION-4")
  assert.equal(stamp(nueva.landingMs), "15 Dec 2026, 12:00 UT")
})

test("tipo y salidas: un módulo fijo no tiene salidas; las demás quedan dentro de la estadía y en orden", () => {
  const base = EXAMPLE_MISSIONS[0]
  assert.equal(sanitize({ ...base, outings: [{ route: "science", afterH: 5 }] }).outings, undefined)
  assert.ok(!("kind" in sanitize(base)), "sin tipo sigue sin la clave: las misiones guardadas no cambian")
  const m = sanitize({ ...base, kind: "crewed", stayDays: 3, outings: [{ route: "short", afterH: 500 }, { route: "nope" as never, afterH: 25.4 }] })
  assert.deepEqual(m.outings, [{ route: "science", afterH: 25 }, { route: "short", afterH: 72 }])
  assert.equal(sanitize({ ...base, kind: "rover" }).outings?.length, 0)
})

test("salidas contra las ventanas: hay Sol y Tierra al empezar, y cuánto falta para que cambien", async () => {
  const { outingChecks } = await import("./evaluate.ts")
  const H = 3_600_000, t0 = 1_000 * H
  const ev = { fromMs: t0, toMs: t0 + 72 * H, windows: { sun: [{ inicioMs: t0 + 26 * H, finMs: t0 + 72 * H }], earth: [{ inicioMs: t0, finMs: t0 + 40 * H }], both: [] } }
  const [a, b, c] = outingChecks(ev, [{ afterH: 10 }, { afterH: 30 }, { afterH: 50 }])
  assert.deepEqual([a.sun, a.earth, a.ok, a.sunChangeH, a.earthChangeH], [false, true, false, 16, 30])
  assert.deepEqual([b.sun, b.earth, b.ok, b.earthChangeH], [true, true, true, 10])
  assert.deepEqual([c.sun, c.earth, c.ok, c.sunChangeH, c.earthChangeH], [true, false, false, null, null])
})
