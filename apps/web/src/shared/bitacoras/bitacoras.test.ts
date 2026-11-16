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

test("el archivo del planificador estático está al día (node apps/web/scripts/exportar-bitacoras.ts)", async () => {
  const { readFileSync } = await import("node:fs")
  const { bitacorasJs } = await import("./exportar.ts")
  const archivo = readFileSync(new URL("../../../../../prototipos/lunar-map/data/bitacoras.js", import.meta.url), "utf8")
  assert.equal(archivo, bitacorasJs())
})

test("IM-1 en Markdown: todos los hechos y las fuentes, en los dos idiomas", async () => {
  const { bitacoraMarkdown } = await import("./exportar.ts")
  for (const l of ["en", "es"] as const) {
    const md = bitacoraMarkdown(IM1, l)
    for (const h of IM1.hechos) assert.ok(md.includes(h.titulo[l]), `${l}: ${h.id}`)
    for (const f of IM1.fuentes) assert.ok(md.includes(f.url), `${l}: ${f.id}`)
  }
  assert.match(bitacoraMarkdown(IM1, "es"), /80,13° S, 1,44° E · 2579 m · pendiente 12°/)
})

test("cada bitácora se vuela en un sitio que tiene paquete 3D", async () => {
  const { existsSync } = await import("node:fs")
  for (const b of BITACORAS) {
    const id = b.simulador.sitio
    const ok = id === "connecting-ridge-roi-6" || existsSync(new URL(`../../../public/simulador/sitios/${id}.json`, import.meta.url))
    assert.ok(ok, `${b.id}: sin paquete para ${id}`)
    if (b.simulador.nota) assert.ok(b.simulador.nota.en && b.simulador.nota.es)
  }
})
