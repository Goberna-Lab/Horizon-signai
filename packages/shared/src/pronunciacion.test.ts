// Correr: npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { paraKokoro, paraPiper } from "./pronunciacion.ts"

test("el veredicto y el nombre se dicen como palabras, con el texto original para el subtítulo", () => {
  assert.equal(paraKokoro("Zone A is a NO GO, but zone B is a GO."), "Zone A is a [NO GO](/nˈO ɡˈO/), but zone B is a [GO](/ɡˈO/).")
  assert.equal(paraKokoro("It is NO-GO."), "It is [NO-GO](/nˈO ɡˈO/).")
  assert.equal(paraKokoro("I am EVA."), "I am [EVA](/ˈivə/).")
  assert.equal(paraKokoro("Welcome to Horizon Signai."), "Welcome to Horizon [Signai](/sˈIn ˈAˌI/).")
  assert.equal(paraKokoro("Let's go, Eva."), "Let's go, Eva.") // en minúscula ya suena bien
})

test("unidades detrás de una cifra, en singular o plural", () => {
  assert.equal(paraKokoro("About 384,400 km away."), "About 384,400 [km](/kəlˈɑməTəɹz/) away.")
  assert.equal(paraKokoro("Only 1 km."), "Only 1 [km](/kəlˈɑməTəɹ/).")
  assert.equal(paraKokoro("A 5 m mast and a 24 h battery."), "A 5 [m](/mˈiTəɹz/) mast and a 24 [h](/ˈWəɹz/) battery.")
  assert.equal(paraKokoro("It drops to -170 °C."), "It drops to -170 [°C](/dəɡɹˈiz sˈɛlsiəs/).")
  assert.equal(paraKokoro("The DE441 ephemeris."), "The [DE441](/dˈi ˈi fˈɔɹ fˈɔɹTiwˌʌn/) ephemeris.")
})

test("no toca lo que no es una unidad ni un texto ya corregido", () => {
  assert.equal(paraKokoro("I'm here, m'kay? 5 min left."), "I'm here, m'kay? 5 min left.")
  assert.equal(paraKokoro("NASA and LOLA data."), "NASA and LOLA data.")
  const ya = "Zone A is a [GO](/ɡˈO/)."
  assert.equal(paraKokoro(ya), ya)
})

test("español para Piper: el murmullo, el veredicto, unidades y el signo menos", () => {
  assert.equal(paraPiper("Mmm, a ver."), "Umm, a ver.")
  assert.equal(paraPiper("Hmm. Ya veo."), "Umm. Ya veo.")
  assert.equal(paraPiper("La zona A es NO GO, la B es GO."), "La zona A es nou gou, la B es gou.")
  assert.equal(paraPiper("Está a 384.400 km y el mástil mide 5 m."), "Está a 384.400 kilómetros y el mástil mide 5 metros.")
  assert.equal(paraPiper("Dura 24 h y baja a -170 °C."), "Dura 24 horas y baja a menos 170 grados Celsius.")
  assert.equal(paraPiper("Soy EVA, de Horizon Signai."), "Soy EVA, de Horizon Sain ei ai.")
  assert.equal(paraPiper("Mamá, mmm no sé, pero mi mapa sí."), "Mamá, Umm no sé, pero mi mapa sí.")
  assert.equal(paraPiper("La zona A-2 y 3-4 días."), "La zona A-2 y 3-4 días.") // el guion entre cifras no es un menos
  assert.equal(paraPiper("Un tornillo de 5 mm."), "Un tornillo de 5 mm.")
})
