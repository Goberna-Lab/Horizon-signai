// Cómo debe sonar en inglés lo que Kokoro lee mal (voz de EVA y VERA en horizon-voz). Su conversor a fonemas (misaki)
// deletrea las palabras en mayúsculas («GO» → «G-O», «EVA» → «E-V-A») y las unidades («km» → «K-M», «24 h» → «twenty-four
// aitch», «°C» → «degrees C»). Medido el 2026-11-15 sobre el guion y respuestas reales (pedido de Manuel: «no pronuncia
// bien algunas frases»); comparado con Qwen3-TTS y NVIDIA Magpie, ninguno acertó todo y este diccionario sí.
//
// Usa la sintaxis de misaki `[texto](/fonemas/)`: Kokoro pronuncia los fonemas y en los tiempos por palabra devuelve el
// texto entre corchetes, así que el subtítulo sigue mostrando «NO GO», «km» o «EVA». Solo para el inglés de Kokoro: el
// español (Piper) no entiende esta sintaxis.

type Regla = [RegExp, (m: string, ...g: string[]) => string]

const fon = (texto: string, fonemas: string) => `[${texto}](/${fonemas}/)`
// «1 km» en singular; lo demás en plural («0.5 km» también: «zero point five kilometers»).
const unidad = (num: string, sep: string, u: string, uno: string, varios: string) =>
  `${num}${sep}${fon(u, /^1$/.test(num) ? uno : varios)}`

const REGLAS: Regla[] = [
  // El veredicto del planificador y el nombre de la guía: palabras, no siglas.
  [/\bNO[- ]GO\b/g, (m) => fon(m, "nˈO ɡˈO")],
  [/(?<!NO[- ])\bGO\b/g, (m) => fon(m, "ɡˈO")], // el GO de un NO GO ya quedó dentro de la regla anterior
  [/\bEVA\b/g, (m) => fon(m, "ˈivə")],
  // El nombre del proyecto se dice «sign-A-I» (pedido de Manuel, 2026-11-15); Kokoro decía «sig-nai».
  [/\bSignai\b/g, (m) => fon(m, "sˈIn ˈAˌI")],
  // La efeméride de JPL: «D E four forty-one», no «D E four hundred forty-one».
  [/\bDE ?441\b/g, (m) => fon(m, "dˈi ˈi fˈɔɹ fˈɔɹTiwˌʌn")],
  // Unidades detrás de una cifra.
  [/(\d(?:[\d,.]*\d)?)(\s?)(km)\b/g, (_, n, s, u) => unidad(n, s, u, "kəlˈɑməTəɹ", "kəlˈɑməTəɹz")],
  [/(\d(?:[\d,.]*\d)?)(\s?)(m)\b(?!²|³)/g, (_, n, s, u) => unidad(n, s, u, "mˈiTəɹ", "mˈiTəɹz")],
  [/(\d(?:[\d,.]*\d)?)(\s?)(h)\b/g, (_, n, s, u) => unidad(n, s, u, "ˈWəɹ", "ˈWəɹz")],
  [/\s?°C\b/g, (m) => ` ${fon(m.trim(), "dəɡɹˈiz sˈɛlsiəs")}`],
]

/** El texto con las correcciones de pronunciación para Kokoro en inglés. Lo que no está en la lista queda igual. */
export function paraKokoro(texto: string): string {
  // Un texto que ya trae la sintaxis de fonemas se deja como está: no se anidan corchetes.
  if (/\]\(\//.test(texto)) return texto
  let t = texto
  for (const [patron, cambio] of REGLAS) t = t.replace(patron, cambio as (m: string, ...g: string[]) => string)
  return t
}

// ── Español (Piper, en argus-voz) ───────────────────────────────────────────────────────────────────────────────────
// Piper pasa el texto por espeak-ng, que deletrea con nombres de letra en español: «Mmm» → «eme-eme-eme», «NO GO» →
// «ene-o je-o», «km» → «ka-eme», «24 h» → «hache», y se come el signo menos («-170» → «ciento setenta»). Medido con
// `espeak-ng -v es-419 -x` el 2026-11-15. Piper no acepta fonemas: se reescribe el texto como se dice.
const PIPER: [RegExp, string | ((m: string, ...g: string[]) => string)][] = [
  [/(?<!\d\s?)\b[MmHh]m{1,}\b/g, "Umm"], // el murmullo de pensar («5 mm» son milímetros: se deja)
  [/\bNO[- ]GO\b/g, "nou gou"],
  [/(?<!nou )\bGO\b/g, "gou"],
  [/\bREVIEW\b/g, "riviú"], // espeak decía «rebiéu»
  [/\bSignai\b/g, "Sain ei ai"],
  [/\bDE ?441\b/g, "de cuatro cuarenta y uno"],
  [/(^|[\s(])-(\d)/g, "$1menos $2"],
  [/(\d(?:[\d.,]*\d)?)\s?km\b/g, (_, n) => `${n} ${/^1$/.test(n) ? "kilómetro" : "kilómetros"}`],
  [/(\d(?:[\d.,]*\d)?)\s?m\b(?!²|³)/g, (_, n) => `${n} ${/^1$/.test(n) ? "metro" : "metros"}`],
  [/(\d(?:[\d.,]*\d)?)\s?h\b/g, (_, n) => `${n} ${/^1$/.test(n) ? "hora" : "horas"}`],
  [/\s?°C\b/g, " grados Celsius"],
]

/** El texto reescrito para que Piper (español) lo diga bien. Lo que no está en la lista queda igual. */
export function paraPiper(texto: string): string {
  let t = texto
  for (const [patron, cambio] of PIPER) t = t.replace(patron, cambio as string)
  return t
}
