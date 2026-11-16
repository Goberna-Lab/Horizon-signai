import assert from "node:assert/strict"
import { test } from "node:test"
import { entender, esEco, opcionDe, palabrasDeOpciones } from "./escucha.ts"

// Como opcionesDe("camino") en EvaCompanera: el botón en los dos idiomas y sus palabras (CAMINOS, recorridos.ts).
const CAMINOS = [
  ["See a mission", "Ver una misión", "see", "view", "look", "existing", "exists", "review", "edit", "open", "ver", "mirar", "existe", "existente", "revisar", "editar", "abrir", "realizada", "hecha"],
  ["Create a new mission", "Crear una misión nueva", "create", "new", "make", "plan", "build", "crear", "nueva", "nuevo", "generar", "planear", "armar", "hacer"],
  ["Straight to the simulation", "Directo a la simulación", "simulation", "simulate", "simulator", "exciting", "straight", "descent", "land", "simulacion", "simular", "simulador", "emocionante", "directo", "descenso", "alunizar", "alunizaje"],
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

test("elegir camino por número o con sus palabras; «siguiente» no elige", () => {
  assert.deepEqual(entender("ver una misión", "camino", CAMINOS), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("I want to see an existing mission", "camino", CAMINOS), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("quiero editar una", "camino", CAMINOS), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("create a new one", "camino", CAMINOS), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("crear una misión nueva", "camino", CAMINOS), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("la simulación", "camino", CAMINOS), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("something exciting", "camino", CAMINOS), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("directo a simular", "camino", CAMINOS), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("the second one", "camino", CAMINOS), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("la tercera", "camino", CAMINOS), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("mission", "camino", CAMINOS), { tipo: "nada" }) // está en dos: no distingue
  assert.deepEqual(entender("next", "camino", CAMINOS), { tipo: "nada" })
})

test("una pregunta de sí o no: «sí» elige la primera opción; con tres opciones, no", () => {
  const SI_NO = [
    ["Yes, show me", "Sí, muéstrame", "show", "decide", "steps", "muestrame", "decidir", "pasos"],
    ["Skip to the real mission", "Saltar a la misión real", "skip", "real", "apollo", "nasa", "saltar", "salta"],
  ]
  for (const t of ["sí", "yes", "dale", "ok", "claro que sí"]) assert.deepEqual(entender(t, "camino", SI_NO), { tipo: "opcion", k: 0 }, t)
  assert.deepEqual(entender("muéstrame los pasos", "camino", SI_NO), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("mejor la misión real", "camino", SI_NO), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("yes", "camino", CAMINOS), { tipo: "nada" })
})

test("contestar el repaso por número o con palabras de la respuesta", () => {
  assert.deepEqual(entender("the sun was behind the terrain", "repaso", REPASO), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("el relieve", "repaso", REPASO), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("too heavy", "repaso", REPASO), { tipo: "opcion", k: 2 })
  assert.deepEqual(entender("option b", "repaso", REPASO), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("la tercera", "repaso", REPASO), { tipo: "opcion", k: 2 })
})

test("la oferta, el nombre y el eco", () => {
  assert.deepEqual(entender("yes", "oferta"), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("Sí, quiero aprender", "oferta"), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("dale", "oferta"), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("ok", "oferta"), { tipo: "opcion", k: 0 })
  assert.deepEqual(entender("No, solo quiero ver la landing", "oferta"), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("just the landing page", "oferta"), { tipo: "opcion", k: 1 })
  assert.deepEqual(entender("no thanks", "oferta"), { tipo: "orden", orden: "parar" })
  assert.deepEqual(entender("ahora no", "oferta"), { tipo: "orden", orden: "parar" })
  assert.deepEqual(entender("me llamo Ana", "nombre"), { tipo: "nombre", nombre: "Ana" })
  assert.deepEqual(entender("skip", "nombre"), { tipo: "nombre", nombre: "" })
  assert.equal(esEco("press next when we are down", "Press next when we are down."), true)
  assert.equal(esEco("next please", "Three candidate zones. Each card answers one question."), false)
  // Pedazos de su voz mal transcritos: siguen siendo eco (antes pasaban como pregunta y la cortaban).
  const oferta = "This is Horizon Signal, by Goberna: a platform to plan and simulate lunar missions. Would you like to experience planning a lunar mission?"
  assert.equal(esEco("planning a lunar machine", oferta), true)
  assert.equal(esEco("horizon signal by gobernar", oferta), true)
  assert.equal(esEco("say next when we are down", "Listen to the radio. Say next when we are down."), true)
  // Una pregunta de verdad, aunque comparta palabras vacías, no es eco.
  assert.equal(esEco("why is the sun so low at the pole", oferta), false)
  assert.equal(esEco("yes", oferta), false)
  assert.equal(opcionDe("dos", palabrasDeOpciones(REPASO)), 1)
})
