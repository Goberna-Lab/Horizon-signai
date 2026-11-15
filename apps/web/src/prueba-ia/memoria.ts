// Lo que las asistentes recuerdan de quien les habla: su nombre, sus últimas preguntas y cuántas veces vino.
// Vive SOLO en este navegador (localStorage) y viaja en cada pedido para que la IA lo use (ver personaDe en
// apps/api/src/asistentes.ts). No se guarda en el servidor. «Olvidarme» lo borra.

export type Recuerdos = { nombre: string; preguntas: string[]; visitas: number }

const CLAVE = "horizon-signai.recuerdos.v1"
const MAX_PREGUNTAS = 12
const vacio = (): Recuerdos => ({ nombre: "", preguntas: [], visitas: 0 })

export function recuerdos(): Recuerdos {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Partial<Recuerdos> | null
    if (!r) return vacio()
    return {
      nombre: typeof r.nombre === "string" ? r.nombre : "",
      preguntas: Array.isArray(r.preguntas) ? r.preguntas.filter((q) => typeof q === "string").slice(-MAX_PREGUNTAS) : [],
      visitas: Number.isFinite(r.visitas) ? Number(r.visitas) : 0,
    }
  } catch {
    return vacio()
  }
}

const guardar = (r: Recuerdos) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(r))
  } catch {
    /* modo privado o almacenamiento lleno: se sigue sin memoria */
  }
}

// «My name is Ana», «I'm Ana», «call me Ana», «me llamo Ana», «soy Ana».
const NOMBRE = /(?:^|[\s,.!¡¿?])(?:[Mm]y name is|[Cc]all me|I am|I'm|[Mm]e llamo|[Mm]i nombre es|[Ss]oy)\s+([A-ZÁÉÍÓÚÑ][\p{L}'-]{1,30})/u

/** Nombre que se presenta en el mensaje, si lo hay (con mayúscula inicial, para no tomar «I'm tired»). */
export const nombreEn = (texto: string) => NOMBRE.exec(texto)?.[1] ?? ""

/** Anota una pregunta de la persona (y su nombre, si se presentó). */
export function recordar(texto: string) {
  const t = texto.replace(/\s+/g, " ").trim().slice(0, 160)
  if (!t) return
  const r = recuerdos()
  r.nombre = nombreEn(t) || r.nombre
  r.preguntas = [...r.preguntas.filter((q) => q !== t), t].slice(-MAX_PREGUNTAS)
  guardar(r)
}

/** Una visita más (una vez por carga de la página). */
export function contarVisita() {
  const r = recuerdos()
  r.visitas += 1
  guardar(r)
}

export function olvidar() {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    /* nada que borrar */
  }
}
