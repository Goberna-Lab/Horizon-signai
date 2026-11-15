import assert from "node:assert/strict"
import { test } from "node:test"
import { entonar, seguirTono, type Entonacion } from "./entonacion.ts"

const SR = 24000

// Voz de prueba: tren de armónicos cuyo tono sube de 190 a 260 Hz en 1,2 s, con una pausa en medio.
function vozSintetica() {
  const n = Math.round(1.2 * SR)
  const x = new Float32Array(n)
  let fase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const hz = 190 + (70 * t) / 1.2
    fase += (2 * Math.PI * hz) / SR
    if (t > 0.55 && t < 0.65) continue
    let s = 0
    for (let h = 1; h <= 8; h++) s += Math.sin(h * fase) / h
    x[i] = 0.3 * s
  }
  return x
}

const nota = (hz: number) => 69 + 12 * Math.log2(hz / 440)
const plano: Entonacion = { semitonos: 0, rango: 0, escala: null, salto: 0, caidaFinal: 0, formante: 0 }

test("el seguidor de tono lee la subida de 190 a 260 Hz", () => {
  const f0 = seguirTono(vozSintetica(), SR)
  const al = (s: number) => f0[Math.round(s / 0.01)]
  assert.ok(Math.abs(al(0.1) - 196) < 6, `0,1 s: ${al(0.1)}`)
  assert.ok(Math.abs(al(1.0) - 248) < 6, `1,0 s: ${al(1.0)}`)
  assert.equal(al(0.6), 0, "la pausa no tiene tono")
})

test("no cambia la duración y con rango 0 deja la frase en una sola nota", () => {
  const x = vozSintetica()
  const y = entonar(x, SR, plano)
  assert.equal(y.length, x.length)
  const antes = [...seguirTono(x, SR)].filter((v) => v > 0).map(nota)
  const despues = [...seguirTono(y, SR)].filter((v) => v > 0).map(nota)
  const rango = (v: number[]) => [...v].sort((a: number, b: number) => a - b)[Math.floor(v.length * 0.9)] - [...v].sort((a: number, b: number) => a - b)[Math.floor(v.length * 0.1)]
  assert.ok(rango(antes) > 4, `la original recorre ${rango(antes).toFixed(1)} semitonos`)
  assert.ok(rango(despues) < 1, `la aplanada recorre ${rango(despues).toFixed(2)} semitonos`)
})

test("sube los semitonos pedidos", () => {
  const x = vozSintetica()
  const y = entonar(x, SR, { ...plano, semitonos: 4 })
  const media = (v: Float32Array) => {
    const s = [...v].filter((z) => z > 0).map(nota)
    return s.reduce((a, b) => a + b, 0) / s.length
  }
  const subida = media(seguirTono(y, SR)) - media(seguirTono(x, SR))
  assert.ok(Math.abs(subida - 4) < 1, `subió ${subida.toFixed(2)} semitonos`)
})

test("el silencio y el ruido sordo pasan sin agrandarse", () => {
  const x = new Float32Array(SR / 2)
  let semilla = 1
  for (let i = 0; i < x.length; i++) {
    semilla = (semilla * 1103515245 + 12345) % 2147483648
    x[i] = (semilla / 2147483648 - 0.5) * 0.1
  }
  const y = entonar(x, SR, { ...plano, semitonos: 5 })
  const rms = (v: Float32Array) => Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length)
  assert.ok(Math.abs(rms(y) / rms(x) - 1) < 0.25, `ruido: ${rms(x).toFixed(4)} → ${rms(y).toFixed(4)}`)
})

test("una nota plana por palabra: con tramos, cada palabra queda en una sola nota", () => {
  const x = vozSintetica()
  const y = entonar(x, SR, { ...plano, rango: 1 }, [[0, 0.5], [0.7, 1.2]])
  const f0 = seguirTono(y, SR)
  for (const [a, b] of [[0.05, 0.45], [0.75, 1.15]]) {
    const v = [...f0.subarray(Math.round(a / 0.01), Math.round(b / 0.01))].filter((z) => z > 0).map(nota)
    const ancho = Math.max(...v) - Math.min(...v)
    assert.ok(ancho < 1, `palabra ${a}-${b} s recorre ${ancho.toFixed(2)} semitonos`)
  }
})

test("el formante sube el timbre sin mover el tono", () => {
  const x = vozSintetica()
  const y = entonar(x, SR, { ...plano, rango: 1, formante: 3 })
  // Proxy del timbre: energía de la derivada sobre energía de la señal (crece con los agudos).
  const agudos = (v: Float32Array) => {
    let d = 0
    let s = 0
    for (let i = 1; i < v.length; i++) {
      d += (v[i] - v[i - 1]) ** 2
      s += v[i] ** 2
    }
    return d / s
  }
  assert.ok(agudos(y) > agudos(x) * 1.2, `agudos ${agudos(x).toFixed(4)} → ${agudos(y).toFixed(4)}`)
  const media = (v: Float32Array) => {
    const s = [...seguirTono(v, SR)].filter((z) => z > 0).map(nota)
    return s.reduce((a, b) => a + b, 0) / s.length
  }
  assert.ok(Math.abs(media(y) - media(x)) < 1, `el tono se movió ${(media(y) - media(x)).toFixed(2)} semitonos`)
})
