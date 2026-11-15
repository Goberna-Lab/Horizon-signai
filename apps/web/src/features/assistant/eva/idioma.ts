// En qué idioma le escribieron a EVA: español o inglés. Regla simple, sin modelo: cuenta palabras muy comunes
// de cada idioma y las marcas propias del español (ñ, tildes, ¿, ¡). Si no hay señal clara (un nombre suelto,
// una cifra), devuelve null y EVA sigue en el idioma en que estaba.

export type Idioma = "en" | "es"

// Solo palabras que no existen o casi no se usan en el otro idioma («no», «me», «a» y «es» quedan fuera a propósito).
const ES = new Set(
  (
    "hola buenas buenos gracias favor qué que cómo como cuál cuándo cuánto dónde quién quiero quieres puedes puedo necesito tengo tienes " +
    "soy estoy eres está están el la los las un una unos unas del al y o pero para con sin sobre mi tu su te se lo le sí más muy también " +
    "porque cuando donde esto esta este eso aquí ahora hay misión luna sol tierra alunizaje alunizar aterrizar aterrizaje planificar " +
    "planificador explícame explica dime llamo nombre hablas habla español ayuda ayúdame enséñame aprender polo sur noche batería cráter"
  ).split(" "),
)
const EN = new Set(
  (
    "hi hello hey thanks thank please what how which when where who want can could need have has am are is the an of and or but for with " +
    "without about my your you it yes more very also because this that these those here now there mission moon sun earth landing land " +
    "plan planner explain tell name speak english help teach learn do does i to in on at south pole night battery crater why show"
  ).split(" "),
)

/** "es" o "en" si el texto lo deja claro; null si no. */
export function detectarIdioma(texto: string): Idioma | null {
  const t = texto.toLowerCase()
  let es = 0
  let en = 0
  if (/[ñ¿¡]/.test(t)) es += 2
  if (/[áéíóú]/.test(t)) es += 1
  for (const palabra of t.split(/[^a-záéíóúüñ']+/)) {
    if (!palabra) continue
    if (ES.has(palabra)) es += 1
    else if (EN.has(palabra) || EN.has(palabra.replace(/'(m|s|re|ll|d|ve)$/, ""))) en += 1
  }
  if (es > en && es >= 1) return "es"
  if (en > es && en >= 1) return "en"
  return null
}

/** El nombre que alguien escribió al presentarse: sin el «me llamo» o el «my name is», limpio y con mayúscula. */
export function nombreDe(texto: string): string {
  let t = texto.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim()
  for (let i = 0; i < 3; i++) t = t.replace(/^(hola|hi|hello|hey|buenas|my name is|i am|i'm|im|call me|it's|its|me llamo|mi nombre es|soy|yo soy)\s+/i, "")
  if (/^(hola|hi|hello|hey|buenas|ok|no|yes|sí|si)$/i.test(t)) return "" // un saludo suelto no es un nombre
  const palabras = t.split(" ").filter(Boolean).slice(0, 2)
  return palabras
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
    .slice(0, 30)
}
