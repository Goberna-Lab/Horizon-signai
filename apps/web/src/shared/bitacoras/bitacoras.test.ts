// Correr: npm test. Cada hecho de una bitácora real tiene fuente, los dos idiomas y va en orden.
import { test } from "node:test"
import assert from "node:assert/strict"
import { BITACORAS, diaDeMision, fuentesDe, hechosHasta, IM1 } from "./index.ts"

for (const b of BITACORAS) {
  test(`${b.id}: cada hecho cita fuentes que existen`, () => {
    for (const h of b.hechos) {
      assert.ok(h.fuentes.length > 0, `${h.id} sin fuente`)
      for (const f of fuentesDe(b, h)) assert.ok(f?.url.startsWith("https://"), `${h.id}: fuente desconocida`)
    }
    for (const id of b.sitio.fuentes) assert.ok(b.fuentes.some((f) => f.id === id), `sitio: fuente ${id}`)
  })

  test(`${b.id}: todo el texto en inglés y en español`, () => {
    const textos = [b.prevista, b.real, b.resumen, ...b.hechos.flatMap((h) => [h.titulo, h.texto, ...(h.porQue ? [h.porQue] : [])])]
    for (const t of textos) assert.ok(t.en.trim() && t.es.trim() && t.en !== t.es, JSON.stringify(t).slice(0, 80))
  })

  test(`${b.id}: ids únicos, fechas válidas y en orden`, () => {
    assert.equal(new Set(b.hechos.map((h) => h.id)).size, b.hechos.length)
    let antes = -Infinity
    for (const h of b.hechos) {
      if (h.utc == null) { assert.equal(h.fase, "antes", `${h.id}: sin fecha solo antes de la misión`); continue }
      const ms = Date.parse(h.utc)
      assert.ok(Number.isFinite(ms), `${h.id}: fecha`)
      if (h.precision === "dia") assert.match(h.utc, /^\d{4}-\d{2}-\d{2}$/, `${h.id}: con precisión de día va solo la fecha`)
      if (h.hastaUtc) assert.ok(Date.parse(h.hastaUtc) >= ms, `${h.id}: hasta antes que desde`)
      assert.ok(ms >= antes, `${h.id}: fuera de orden`)
      antes = ms
    }
  })
}

test("IM-1: contacto el día 1, fin el día 8 (siete días después)", () => {
  const dia = (id: string) => diaDeMision(IM1, IM1.hechos.find((h) => h.id === id)!)
  assert.equal(dia("contacto"), 1)
  assert.equal(dia("lro"), 3)
  assert.equal(dia("noche"), 8)
  assert.equal(dia("sitio"), null)
})

test("IM-1: hasta el contacto solo se ve lo de antes y el descenso", () => {
  const ids = hechosHasta(IM1, Date.parse(IM1.contactoUtc)).map((h) => h.id)
  assert.deepEqual(ids, ["sitio", "laseres", "contacto", "de-lado"])
})
