import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { frasesDelGuion, oracionesDelGuion } from "./frasesGrabables.ts"
import { GRABADAS } from "./vozGrabada.indice.ts"
import { claveDe, enOraciones, estaGrabada, restoPorDecir, sinVocativo } from "./vozGrabada.ts"

const CARPETA = fileURLToPath(new URL("../../../../public/eva-voz/", import.meta.url))

test("parte en oraciones igual que el API", () => {
  assert.deepEqual(enOraciones("Your launch slipped. Same lander, same requirements."), ["Your launch slipped.", "Same lander, same requirements."])
  assert.deepEqual(enOraciones("It is 3.5 km away. Done."), ["It is 3.5 km away.", "Done."])
  assert.deepEqual(enOraciones("The official IAU list: 8,876 of them. I know about twelve."), ["The official IAU list: 8,876 of them.", "I know about twelve."])
  assert.deepEqual(enOraciones("Hola, soy EVA. ¿Cómo te llamas?"), ["Hola, soy EVA.", "¿Cómo te llamas?"])
  assert.deepEqual(enOraciones("I have visited none of them. Yet."), ["I have visited none of them.", "Yet."])
  assert.deepEqual(enOraciones("  sin   punto al   final "), ["sin punto al final"])
  assert.deepEqual(enOraciones(""), [])
})

test("la clave depende del idioma y del texto, no de los espacios", () => {
  assert.equal(claveDe("en", "Zone B still passes."), claveDe("en", "  Zone B   still passes. "))
  assert.notEqual(claveDe("en", "Zone B still passes."), claveDe("es", "Zone B still passes."))
  assert.notEqual(claveDe("en", "Zone B still passes."), claveDe("en", "Zone C still passes."))
  assert.match(claveDe("es", "Listo."), /^[0-9a-z]+$/)
})

test("la oración con el nombre tiene su versión sin él", () => {
  assert.equal(sinVocativo("Nice to meet you, Ana."), "Nice to meet you.")
  assert.equal(sinVocativo("Welcome back, María José."), "Welcome back.")
  assert.equal(sinVocativo("Mucho gusto, Ana."), "Mucho gusto.")
  assert.equal(sinVocativo("Hola de nuevo, Ana."), "Hola de nuevo.")
  assert.equal(sinVocativo("Who is visiting today?"), "Who is visiting today?")
})

test("cada grabación del índice existe y trae audio", () => {
  for (const clave of GRABADAS) {
    const archivo = `${CARPETA}${clave}.json`
    assert.ok(existsSync(archivo), `falta el archivo de ${clave}`)
    const frases = JSON.parse(readFileSync(archivo, "utf8")) as { texto: string; mime: string; audio: string; palabras: unknown[] }[]
    assert.ok(Array.isArray(frases) && frases.length > 0, `${clave}: sin frases`)
    for (const f of frases) {
      assert.equal(f.mime, "audio/mpeg", `${clave}: no es MP3`)
      assert.ok(f.texto && Array.isArray(f.palabras) && f.palabras.length > 0, `${clave}: sin texto o sin palabras`)
      const b = Buffer.from(f.audio.slice(0, 16), "base64")
      assert.ok(b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), `${clave}: el audio no empieza como un MP3`)
    }
  }
})

// Editar una frase del guion le quita su grabación: EVA la sigue diciendo, pero pidiéndole la voz al servidor. No
// rompe nada, así que aquí solo se avisa; `node apps/web/scripts/grabar-voz-eva.ts` graba lo que falte.
test("avisa de las oraciones del guion que no tienen voz grabada", (t) => {
  const faltan = oracionesDelGuion().filter((o) => !estaGrabada(o.idioma, o.oracion))
  t.diagnostic(`${oracionesDelGuion().length - faltan.length} de ${oracionesDelGuion().length} oraciones del guion tienen voz grabada`)
  for (const o of faltan.slice(0, 12)) t.diagnostic(`sin grabar [${o.idioma}] ${o.de}: ${o.oracion}`)
  for (const f of frasesDelGuion().filter((x) => x.sinTraducir)) t.diagnostic(`sin traducción al español: ${f.de}`)
})

test("restoPorDecir: desde la oración que quedó a medias", () => {
  const f = "Uno dos tres. Cuatro cinco. Seis siete ocho."
  assert.equal(restoPorDecir(f, ""), f)
  assert.equal(restoPorDecir(f, "Uno dos"), f)
  assert.equal(restoPorDecir(f, "Uno dos tres."), "Cuatro cinco. Seis siete ocho.")
  assert.equal(restoPorDecir(f, "Uno dos tres. Cuatro"), "Cuatro cinco. Seis siete ocho.")
  assert.equal(restoPorDecir(f, "Uno dos tres. Cuatro cinco. Seis siete ocho."), "")
})
