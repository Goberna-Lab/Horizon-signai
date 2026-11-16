import assert from "node:assert/strict"
import { test } from "node:test"
import { sinInterno } from "./interno.ts"

test("los extractos llegan sin rutas, código ni enlaces a archivos", () => {
  const t = sinInterno(
    "La cuenta regresiva se calcula desde el instante elegido (`calculos/motor/planificador.ts:154`, función `proximoCambio`). Detalle en [04-planificador.md](04-planificador.md) y en apps/web/src/features/assistant/eva/recorridos.ts.",
  )
  assert.ok(!/\.ts|apps\/|planificador\.md|proximoCambio|`/.test(t), t)
  assert.ok(t.startsWith("La cuenta regresiva se calcula desde el instante elegido"), t)
  assert.ok(t.includes("Detalle en 04-planificador") === false && t.includes("Detalle en"), t)
})

test("lo que no es interno queda igual", () => {
  const t = "El Sol no pasa de 1,59° sobre el polo entre 2026 y 2030 (JPL Horizons, https://ssd.jpl.nasa.gov/horizons/)."
  assert.equal(sinInterno(t), t)
})
