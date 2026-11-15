// Tiempos de cada conversación con EVA (pedido de Manuel, 2026-11-15: «detectar todos los tiempos en los que yo hablo
// y ella responde, cuánto se demora, cuánto se queda pensando»). Un registro por pregunta: el instante 0 es cuando la
// persona terminó de hablar (o envió lo escrito) y cada marca son los ms desde ahí.
//
// Dónde quedan:
// - En la consola del navegador, una línea legible con la pregunta («[EVA tiempos] …»).
// - En sessionStorage (las últimas 100): en la consola, `evaTiempos()` las muestra en tabla y devuelve el arreglo
//   (`copy(evaTiempos())` lo copia como JSON).
// - En el log del API de producción, SIN el texto de la pregunta ni nada de la persona (`[eva-tiempos]`, ver
//   /eva/tiempos en apps/api/src/z6.ts). Para sacarlos: apps/api/scripts/tiempos-eva.ts.

export type Origen = "voz" | "texto" | "sugerencia"

/** Las marcas, en orden de aparición típico. Solo se guarda la primera vez que pasa cada una. */
export const MARCAS = {
  vad: "el micrófono cerró la frase (incluye el silencio de espera del VAD)",
  oido: "llegó lo que entendió Whisper",
  parecida: "llegó la pregunta frecuente más parecida",
  pedido: "se pidió la respuesta a la IA",
  murmullo: "empezó a sonar el murmullo grabado",
  ecoLlega: "llegó el eco del API",
  ecoSuena: "empezó a sonar el eco",
  primerTexto: "llegó la primera palabra de la IA",
  respuestaLlega: "llegó la primera frase de la respuesta con su voz",
  respuestaSuena: "empezó a sonar la respuesta",
  rescate: "dijo la frase de rescate",
  fin: "terminó de hablar",
} as const
export type Marca = keyof typeof MARCAS

export type Registro = {
  id: string
  origen: Origen
  idioma: "en" | "es"
  /** Hora de inicio (ISO), para cruzarlo con otros logs. */
  hora: string
  /** ms desde el instante 0. */
  marcas: Partial<Record<Marca, number>>
  /** Datos sin texto de la persona: tipo de respuesta, cuánto habló, tiempos del servidor… */
  datos: Record<string, string | number | boolean>
  /** Solo para la consola y sessionStorage del navegador: nunca se manda al servidor. */
  pregunta?: string
}

type Abierto = Registro & { t0: number; cerrado: boolean }

let actual: Abierto | null = null

/** Empieza un registro. `haceMs`: cuánto antes de ahora fue el instante 0 (la voz: el VAD espera un silencio). */
export function empezar(origen: Origen, idioma: "en" | "es", haceMs = 0): Registro {
  if (actual && !actual.cerrado) cerrar("reemplazado")
  const t0 = performance.now() - haceMs
  actual = {
    id: Math.random().toString(36).slice(2, 10),
    origen,
    idioma,
    hora: new Date(Date.now() - haceMs).toISOString(),
    marcas: {},
    datos: {},
    t0,
    cerrado: false,
  }
  return actual
}

/** Anota una marca en el registro abierto (si no hay, no hace nada). `en`: performance.now() del momento, si no es ahora. */
export function marcar(m: Marca, en = performance.now()) {
  if (!actual || actual.cerrado || actual.marcas[m] !== undefined) return
  actual.marcas[m] = Math.max(0, Math.round(en - actual.t0))
}

export function dato(k: string, v: string | number | boolean) {
  if (actual && !actual.cerrado) actual.datos[k] = v
}

export function pregunta(texto: string) {
  if (actual && !actual.cerrado) actual.pregunta = texto
}

export const hayRegistro = () => !!actual && !actual.cerrado

const s = (ms?: number) => (ms === undefined ? "—" : `${(ms / 1000).toFixed(2).replace(".", ",")} s`)

/** Una línea legible del registro. */
export function resumen(r: Registro): string {
  const m = r.marcas
  const partes = [
    `${r.origen}/${r.idioma}`,
    r.datos.tipo ? `→ ${r.datos.tipo}` : "",
    r.datos.hablaMs ? `habló ${s(Number(r.datos.hablaMs))}` : "",
    m.oido !== undefined ? `entendió ${s(m.oido)}` : "",
    m.murmullo !== undefined ? `murmullo ${s(m.murmullo)}` : "",
    m.ecoSuena !== undefined ? `eco ${s(m.ecoSuena)}` : "",
    m.respuestaSuena !== undefined ? `respuesta ${s(m.respuestaSuena)}` : "",
    m.rescate !== undefined ? `rescate ${s(m.rescate)}` : "",
    m.fin !== undefined ? `fin ${s(m.fin)}` : "",
    r.datos.fin && r.datos.fin !== "ok" ? `(${r.datos.fin})` : "",
  ].filter(Boolean)
  return `[EVA tiempos] ${partes.join(" · ")}${r.pregunta ? ` «${r.pregunta}»` : ""}`
}

const CLAVE = "eva-tiempos"
const guardar = (r: Registro) => {
  try {
    const lista = JSON.parse(sessionStorage.getItem(CLAVE) ?? "[]") as Registro[]
    lista.push(r)
    sessionStorage.setItem(CLAVE, JSON.stringify(lista.slice(-100)))
  } catch {
    /* sin sessionStorage: queda la consola */
  }
}

/** Lo que va al servidor: sin la pregunta. */
export const paraServidor = ({ pregunta: _p, ...r }: Registro) => r

let enviar: ((r: Registro) => void) | null = null
/** Quién manda el registro al API (lo pone EvaCompanera con el cliente; así este archivo no depende de la red). */
export const alCerrar = (f: (r: Registro) => void) => {
  enviar = f
}

/** Cierra el registro abierto: `fin` dice cómo terminó (ok, interrumpida, error, sin respuesta…). */
export function cerrar(fin = "ok") {
  if (!actual || actual.cerrado) return
  actual.cerrado = true
  actual.datos.fin = fin
  const { t0: _t, cerrado: _c, ...r } = actual
  console.info(resumen(r), r)
  guardar(r)
  try {
    enviar?.(paraServidor(r))
  } catch {
    /* sin red: queda en el navegador */
  }
}

// `evaTiempos()` en la consola: la tabla de las últimas conversaciones y el arreglo para copiar.
if (typeof window !== "undefined") {
  ;(window as unknown as { evaTiempos: () => Registro[] }).evaTiempos = () => {
    let lista: Registro[] = []
    try {
      lista = JSON.parse(sessionStorage.getItem(CLAVE) ?? "[]") as Registro[]
    } catch {
      /* vacío */
    }
    console.table(lista.map((r) => ({ hora: r.hora.slice(11, 19), origen: r.origen, tipo: r.datos.tipo, ...r.marcas, fin: r.datos.fin, pregunta: r.pregunta })))
    return lista
  }
}
