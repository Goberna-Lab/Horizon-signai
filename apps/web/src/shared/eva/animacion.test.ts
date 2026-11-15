import assert from "node:assert/strict"
import { test } from "node:test"
import { crearAnimacion, ESTADOS, type EntradaEva, type EstadoEva, type PoseEva } from "./animacion.ts"

const DT = 1 / 60
const quieta = (estado: EstadoEva, nivel = 0): EntradaEva => ({ estado, nivel, vx: 0, vy: 0 })
// Índices dentro de `pose.ojos` (16 por ojo; ver PoseEva).
const ALTO = 3
const PARPADO = 5
const SONRISA = 7
const BARRAS = 8
const ANILLO = 9

/** Avanza `segundos` con la misma entrada y devuelve la última pose. */
function correr(a: ReturnType<typeof crearAnimacion>, entrada: EntradaEva, segundos: number) {
  let p = a.pose
  for (let i = 0; i < Math.round(segundos / DT); i++) p = a.paso(DT, entrada)
  return p
}
const fija = () => crearAnimacion({ vida: false, encendido: false })

test("en reposo queda seria: sin sonrisa, con el párpado recto y los ojos abiertos", () => {
  const p = correr(fija(), quieta("reposo"), 3)
  for (const o of [0, 16]) {
    assert.ok(p.ojos[o + SONRISA] < 0.02, `sonrisa ${p.ojos[o + SONRISA]}`)
    assert.ok(p.ojos[o + PARPADO] > 0.2, `párpado ${p.ojos[o + PARPADO]}`)
    assert.ok(p.ojos[o + ALTO] > 0.06, `alto ${p.ojos[o + ALTO]}`)
  }
})

test("solo sonríe cuando bromea o está contenta", () => {
  for (const e of ESTADOS) {
    const p = correr(fija(), quieta(e), 3)
    const sonrie = Math.max(p.ojos[SONRISA], p.ojos[16 + SONRISA]) > 0.5
    assert.equal(sonrie, e === "bromeando" || e === "alegre", e)
  }
})

test("al hablar los ojos son barras y crecen con el volumen", () => {
  const media = (nivel: number) => {
    const a = fija()
    correr(a, quieta("hablando", nivel), 1)
    let s = 0
    for (let i = 0; i < 120; i++) {
      const p = a.paso(DT, quieta("hablando", nivel))
      assert.ok(p.ojos[BARRAS] > 0.9, `barras ${p.ojos[BARRAS]}`)
      for (const n of p.niveles) s += n
    }
    return s / 1200
  }
  const bajo = media(0)
  const alto = media(1)
  assert.ok(bajo > 0.15, `en silencio las barras siguen a la vista: ${bajo}`)
  assert.ok(alto > bajo + 0.2, `con volumen crecen: ${bajo} → ${alto}`)
})

test("al escuchar y al sobresaltarse los ojos son aros", () => {
  assert.ok(correr(fija(), quieta("escuchando"), 3).ojos[ANILLO] > 0.9)
  assert.ok(correr(fija(), quieta("sorpresa"), 3).ojos[ANILLO] > 0.9)
  assert.ok(correr(fija(), quieta("reposo"), 3).ojos[ANILLO] < 0.05)
})

test("cansada baja la luz y el propulsor", () => {
  const descansada = correr(fija(), quieta("reposo"), 4)
  const luz = descansada.luz
  const propulsor = descansada.propulsor
  const p = correr(fija(), quieta("cansada"), 8)
  assert.ok(p.luz < luz * 0.7, `luz ${p.luz} frente a ${luz}`)
  assert.ok(p.propulsor < propulsor * 0.7, `propulsor ${p.propulsor} frente a ${propulsor}`)
})

test("pasar de un estado a otro no da saltos en la postura", () => {
  // Lo que no puede saltar de un cuadro al siguiente (los ojos sí cambian rápido, con parpadeo).
  const postura = (p: PoseEva) => [p.y, p.cabeceo, p.guinada, p.alabeo, p.ladeoX, p.ladeoZ, p.estira]
  for (const de of ESTADOS) {
    for (const a of ESTADOS) {
      if (de === a) continue
      const anim = fija()
      let antes = postura(correr(anim, quieta(de, 0.6), 2))
      for (let i = 0; i < 90; i++) {
        const ahora = postura(anim.paso(DT, quieta(a, 0.6)))
        ahora.forEach((v, k) => assert.ok(Math.abs(v - antes[k]) < 0.04, `${de}→${a}, cuadro ${i}, canal ${k}: ${antes[k]} → ${v}`))
        antes = ahora
      }
    }
  }
})

test("la misma semilla da la misma animación", () => {
  const una = crearAnimacion({ semilla: 7 })
  const otra = crearAnimacion({ semilla: 7 })
  for (let i = 0; i < 900; i++) {
    const e = quieta(ESTADOS[Math.floor(i / 100) % ESTADOS.length], (i % 17) / 17)
    const p = una.paso(DT, e)
    const q = otra.paso(DT, e)
    assert.deepEqual(Array.from(p.ojos), Array.from(q.ojos), `cuadro ${i}`)
    assert.equal(p.y, q.y)
  }
})

test("con entradas de cualquier tipo todo sigue acotado y sin NaN", () => {
  let s = 12345
  const azar = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s / 0x7fffffff)
  const a = crearAnimacion({ semilla: 3 })
  let e: EntradaEva = quieta("reposo")
  for (let i = 0; i < 6000; i++) {
    if (i % 40 === 0) {
      e = {
        estado: ESTADOS[Math.floor(azar() * ESTADOS.length)],
        nivel: azar() * 1.5 - 0.2,
        vx: (azar() - 0.5) * 240,
        vy: (azar() - 0.5) * 240,
        puntero: azar() < 0.5 ? { x: azar() * 4 - 2, y: azar() * 4 - 2 } : null,
        sujeta: azar() < 0.3,
        calma: azar() < 0.2,
      }
    }
    const p = a.paso(azar() < 0.05 ? 0.4 : DT * (0.5 + azar()), e)
    for (const v of [...p.ojos, ...p.niveles, ...p.hud, p.y, p.cabeceo, p.guinada, p.alabeo, p.ladeoX, p.ladeoZ, p.estira, p.luz, p.falla, p.lineas, p.pulso, p.propulsor]) {
      assert.ok(Number.isFinite(v), `cuadro ${i}: ${v}`)
    }
    assert.ok(Math.abs(p.y) < 0.6 && Math.abs(p.cabeceo) < 1 && Math.abs(p.guinada) < 1.6 && Math.abs(p.alabeo) < 1, `cuadro ${i}: postura fuera de rango`)
    assert.ok(p.estira > 0.85 && p.estira < 1.15)
    assert.ok(p.luz >= 0 && p.luz < 2.2 && p.propulsor >= 0 && p.propulsor < 2.5)
    for (const o of [0, 16]) assert.ok(p.ojos[o + 2] >= 0 && p.ojos[o + 2] < 0.2 && p.ojos[o + ALTO] >= 0 && p.ojos[o + ALTO] < 0.2, `cuadro ${i}: ojo fuera de tamaño`)
  }
})

test("con pausa la pose no cambia", () => {
  const a = crearAnimacion()
  const antes = Array.from(correr(a, quieta("hablando", 0.8), 1).ojos)
  a.pausa = true
  const p = correr(a, quieta("cansada"), 2)
  assert.deepEqual(Array.from(p.ojos), antes)
})

test("si la arrastran rápido se sobresalta y al soltarla vuelve a su estado", () => {
  const a = fija()
  correr(a, quieta("reposo"), 2)
  const p = correr(a, { estado: "reposo", nivel: 0, vx: 22, vy: -9, sujeta: true }, 0.5)
  assert.ok(p.ojos[ANILLO] > 0.6, `aro ${p.ojos[ANILLO]}`)
  const q = correr(a, quieta("reposo"), 4)
  assert.ok(q.ojos[ANILLO] < 0.05 && q.ojos[PARPADO] > 0.2, "vuelve a la cara seria")
})

test("al encender empieza a oscuras y termina con los ojos abiertos", () => {
  const a = crearAnimacion({ vida: false })
  const p0 = a.paso(DT, quieta("reposo"))
  assert.ok(p0.luz < 0.05 && p0.ojos[ALTO] < 0.005, `luz ${p0.luz}, alto ${p0.ojos[ALTO]}`)
  const p = correr(a, quieta("reposo"), 2.5)
  assert.ok(p.luz > 0.9 && p.ojos[ALTO] > 0.06)
})
