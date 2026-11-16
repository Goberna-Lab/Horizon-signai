// Correr: npm test. El recorrido guiado de una misión planificada sale de la evaluación del motor, en orden y en dos idiomas.
import { test } from "node:test"
import assert from "node:assert/strict"
import { bitacoraDelPlan, type EvaluacionPlan } from "./planGuiado.ts"

const H = 3600e3, T0 = Date.UTC(2027, 4, 5, 9)
const fuente = { id: "planner-engine", titulo: "engine", url: "https://ssd.jpl.nasa.gov/api/horizons.api" }
const base = { nombre: "SR-05", sitio: { id: "shackleton-rim-roi-4", nombre: "Shackleton rim RoI 4", lat: -89.78, lon: 204.04 }, stayDays: 3, panelM: 2, antenaM: 2, batteryH: 24, minEarthPct: 40, fuente }
// Como SR-05: Sol oculto al contacto, sale a las 25,6 h; Tierra siempre a la vista; noche de 26 h contra 24 h.
const ev: EvaluacionPlan = {
  fromMs: T0, toMs: T0 + 72 * H,
  sweep: { solSobreHorizonte: [-0.9], tierraSobreHorizonte: [7.2] },
  figures: { sunPct: 64, earthPct: 100, bothPct: 64, longestNightH: 26, longestSilenceH: 0 },
  windows: { sun: [{ inicioMs: T0 + 25.6 * H, finMs: T0 + 72 * H }], earth: [{ inicioMs: T0, finMs: T0 + 72 * H }] },
  checks: [{ id: "sunAtLanding", ok: false, value: -0.6, limit: 0 }, { id: "earthAtLanding", ok: true, value: 7.2, limit: 0 }, { id: "battery", ok: false, value: 26, limit: 24 }, { id: "earthContact", ok: true, value: 100, limit: 40 }],
  ok: false,
}

test("plan que no cumple: a oscuras, el Sol sale el día 2 y el veredicto lo dice", () => {
  const b = bitacoraDelPlan({ ...base, ev })
  assert.deepEqual(b.hechos.map((h) => h.id), ["luz", "contacto", `sol-sale-${T0 + 25.6 * H}`, "fin"])
  assert.equal(b.plan?.cumple, false)
  assert.match(b.hechos[0].titulo.es, /a oscuras/)
  assert.match(b.hechos[1].texto.es, /Sol −0,9° y Tierra \+7,2°/)
  assert.match(b.hechos[3].texto.es, /Noche más larga: 26 h, contra una batería de 24 h: no alcanza/)
  assert.equal(b.real.es, "El plan no cumple 2 de 4 requisitos")
  assert.equal(b.contactoUtc, "2027-05-05T09:00:00Z")
})

test("cada paso tiene los dos idiomas, fuente y va en orden", () => {
  const b = bitacoraDelPlan({ ...base, evaH: 25, ev })
  let antes = -Infinity
  for (const h of b.hechos) {
    for (const t of [h.titulo, h.texto, h.porQue!]) assert.ok(t.en && t.es && t.en !== t.es, h.id)
    assert.deepEqual(h.fuentes, ["planner-engine"])
    const ms = Date.parse(h.utc!); assert.ok(ms >= antes, h.id); antes = ms
  }
  assert.ok(b.hechos.some((h) => h.id === "caminata"), "la caminata sale a las 25 h")
  assert.match(b.hechos.find((h) => h.id === "caminata")!.texto.es, /El Sol está oculto y la Tierra a la vista/)
})

test("plan que cumple, sin noche", () => {
  const todo = [{ inicioMs: T0, finMs: T0 + 72 * H }]
  const b = bitacoraDelPlan({ ...base, nombre: "CR-01", ev: { ...ev, sweep: { solSobreHorizonte: [2.7], tierraSobreHorizonte: [6.5] }, figures: { sunPct: 100, earthPct: 100, bothPct: 100, longestNightH: 0, longestSilenceH: 0 }, windows: { sun: todo, earth: todo }, checks: ev.checks.map((c) => ({ ...c, ok: true })), ok: true } })
  assert.deepEqual(b.hechos.map((h) => h.id), ["luz", "contacto", "fin"])
  assert.match(b.hechos[2].texto.es, /^Sin noche durante la estadía\./)
  assert.equal(b.plan?.cumple, true)
})
