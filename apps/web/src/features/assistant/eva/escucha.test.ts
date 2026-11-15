import assert from "node:assert/strict"
import { test } from "node:test"
import { entender, esEco, opcionDe, palabrasDeOpciones } from "./escucha.ts"

const MISIONES = [
  ["CR-01", "Connecting Ridge", "the launch slipped", "el lanzamiento se atrasó"],
  ["PS-03", "Peak near Shackleton", "Pico cerca de Shackleton", "can we call home?", "¿podemos llamar a casa?"],
  ["SR-05", "Shackleton rim", "Borde de Shackleton", "the wrong spot", "el lugar equivocado"],
]
const REPASO = [
  ["The Sun was behind the terrain", "El Sol estaba detrás del relieve"],
  ["The Moon was too far away", "La Luna estaba muy lejos"],
  ["The lander was too heavy", "La nave pesaba demasiado"],
]

test("órdenes en un paso del flujo, en inglés y en español", () => {
  for (const t of ["Next", "next please", "Siguiente.", "sigue por favor", "ok", "dale"]) assert.deepEqual(entender(t, "paso"), { tipo: "orden", orden: "siguiente" }, t)
  for (const t of ["again", "repeat that", "otra vez", "repite"]) assert.deepEqual(entender(t, "paso"), { tipo: "orden", orden: "repetir" }, t)
  for (const t of ["stop", "para", "basta"]) assert.deepEqual(entender(t, "paso"), { tipo: "orden", orden: "parar" }, t)
  assert.deepEqual(entender("why is the sun so low?", "paso"), { tipo: "nada" })
})

test("elegir misión por número, nombre o tema; «siguiente» no la elige", () => {
  assert.deepEqual(entender("mission 2", "mision", MISIONES), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("la primera", "mision", MISIONES), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("Connecting Ridge please", "mision", MISIONES), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("the one about calling home", "mision", MISIONES), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("el borde", "mision", MISIONES), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("the second one", "mision", MISIONES), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("mission one", "mision", MISIONES), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("mission CR-01", "mision", MISIONES), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("PS 03 please", "mision", MISIONES), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("la misión SR05", "mision", MISIONES), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("Shackleton", "mision", MISIONES), { tipo: "nada" }) // está en dos: no distingue
  assert.deepEqual(entender("next", "mision", MISIONES), { tipo: "nada" })
})

test("contestar el repaso por número o con palabras de la respuesta", () => {
  assert.deepEqual(entender("the sun was behind the terrain", "repaso", REPASO), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("el relieve", "repaso", REPASO), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("too heavy", "repaso", REPASO), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("option b", "repaso", REPASO), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("la tercera", "repaso", REPASO), { tipo: "opcion", k: 2 })
})

test("quién llega, el nombre y el eco", () => {
  assert.deepEqual(entender("I'm a teacher", "oferta"), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("planifico misiones", "oferta"), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("tengo curiosidad", "oferta"), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("me llamo Ana", "nombre"), { tipo: "nombre", nombre: "Ana" })
  assert.deepEqual(entender("skip", "nombre"), { tipo: "nombre", nombre: "" })
  assert.equal(esEco("press next when we are down", "Press next when we are down."), true)
  assert.equal(esEco("next please", "Three candidate zones. Each card answers one question."), false)
  assert.equal(opcionDe("dos", palabrasDeOpciones(REPASO)), 1)
})
