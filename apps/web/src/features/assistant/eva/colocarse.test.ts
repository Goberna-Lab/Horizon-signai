import assert from "node:assert/strict"
import { test } from "node:test"
import { dondePonerse, type Caja } from "./colocarse.ts"

const EVA = { ancho: 168, alto: 210 }
const AIRE = 84
const caja = (left: number, right: number, top: number, bottom: number): Caja => ({ left, right, top, bottom })

// Las partes del planificador a 1440×900 (medidas en la página): columna izquierda, columna derecha, mapa y línea de tiempo.
const GRANDE = { ancho: 1440, alto: 900 }
const TARJETAS = caja(42, 381, 294, 639)
const HORIZONTE = caja(1059, 1398, 165, 256)
const VEREDICTO = caja(1324, 1398, 523, 551)
const MAPA = caja(437, 1003, 101, 700)
const TIEMPO = caja(340, 1020, 803, 877)
const COMPARTIR = caja(313, 381, 148, 174)

/** EVA y su globo (328 px hacia su lado) no pisan la parte señalada. */
const libre = (r: Caja, s: ReturnType<typeof dondePonerse>, vista = GRANDE) => {
  const evaFuera = s.x >= r.right || s.x + EVA.ancho <= r.left || s.y >= r.bottom || s.y + EVA.alto <= r.top
  const globoIzq = s.globo === "derecha" ? s.x + EVA.ancho * 0.78 : s.x + EVA.ancho * 0.22 - 320
  const globoFuera = globoIzq >= r.right || globoIzq + 320 <= r.left
  const dentro = s.x >= 16 && s.x + EVA.ancho <= vista.ancho - 16 && s.y >= 16 && s.y + EVA.alto <= vista.alto - 16
  return { evaFuera, globoFuera, dentro }
}

test("una parte de la columna izquierda: EVA a su derecha y el globo más a la derecha", () => {
  const s = dondePonerse(TARJETAS, GRANDE, EVA, AIRE)
  assert.equal(s.x, 381 + AIRE)
  assert.equal(s.globo, "derecha")
  assert.deepEqual(libre(TARJETAS, s), { evaFuera: true, globoFuera: true, dentro: true })
})

test("una parte de la columna derecha: EVA a su izquierda y el globo más a la izquierda", () => {
  for (const r of [HORIZONTE, VEREDICTO]) {
    const s = dondePonerse(r, GRANDE, EVA, AIRE)
    assert.equal(s.x, r.left - AIRE - EVA.ancho)
    assert.equal(s.globo, "izquierda")
    assert.deepEqual(libre(r, s), { evaFuera: true, globoFuera: true, dentro: true })
  }
})

test("una parte pequeña arriba: queda al lado, dentro de la ventana", () => {
  const s = dondePonerse(COMPARTIR, GRANDE, EVA, AIRE)
  assert.equal(s.globo, "derecha")
  assert.equal(s.y, 56) // centrada en el botón; el globo se abre hacia abajo cuando EVA queda tan arriba (EvaCompanera)
  assert.deepEqual(libre(COMPARTIR, s), { evaFuera: true, globoFuera: true, dentro: true })
})

test("una parte ancha (el mapa, la línea de tiempo): EVA queda fuera de ella aunque el globo no pueda alejarse", () => {
  for (const r of [MAPA, TIEMPO]) {
    const s = dondePonerse(r, GRANDE, EVA, AIRE)
    const l = libre(r, s)
    assert.ok(l.evaFuera && l.dentro, JSON.stringify(s))
  }
  // La línea de tiempo está pegada abajo: EVA no se sale de la ventana.
  assert.ok(dondePonerse(TIEMPO, GRANDE, EVA, AIRE).y + EVA.alto <= 900 - 16)
})

test("una parte de lado a lado: encima si hay sitio, debajo si no", () => {
  const abajo = dondePonerse(caja(20, 1420, 600, 760), GRANDE, EVA, AIRE)
  assert.ok(abajo.y + EVA.alto <= 600, "encima de la parte")
  const arriba = dondePonerse(caja(20, 1420, 80, 300), GRANDE, EVA, AIRE)
  assert.ok(arriba.y >= 300, "debajo de la parte")
})

test("en un teléfono nunca se sale de la ventana", () => {
  const vista = { ancho: 390, alto: 780 }
  const eva = { ancho: 120, alto: 150 }
  for (const r of [caja(16, 374, 120, 260), caja(16, 374, 500, 760), caja(250, 374, 16, 50), caja(0, 390, 0, 780)]) {
    const s = dondePonerse(r, vista, eva, 36)
    assert.ok(s.x >= 16 && s.x + eva.ancho <= vista.ancho - 16 && s.y >= 16 && s.y + eva.alto <= vista.alto - 16, JSON.stringify({ r, s }))
  }
})
