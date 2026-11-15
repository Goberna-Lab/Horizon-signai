// Lo que la asistente puede HACER en la app, además de hablar (pedido de Estephano, 2026-11-15: «herramientas
// para que pueda controlar la UI»).
//
// Cómo funciona: el modelo termina su respuesta con una sola orden entre dobles ángulos, por ejemplo
// «<<planner zone=B date=2027-04-05>>». El API la saca del texto antes de que se muestre o se pronuncie
// (`filtroDeAcciones`), la valida contra esta lista cerrada (`leerAccion`) y se la manda a la web como un evento
// {t:"accion"}; la web la ejecuta (apps/web/src/features/assistant/eva/acciones.ts). Lo que no está en la lista se
// descarta: el modelo no puede inventar órdenes ni tocar nada fuera del planificador y la navegación.
//
// La regla de siempre se mantiene: el modelo no calcula. Una orden cambia el escenario o aplica una salida que el
// motor ya propuso; el veredicto lo vuelve a calcular el planificador y la asistente lo lee de la pantalla en el
// turno siguiente (ver `estado` en asistentes.ts).
//
// Se usa una orden en el texto y no las «tools» de Ollama porque así la respuesta hablada y la orden salen en una
// sola pasada del modelo: con tools, el modelo calla al llamar la herramienta y haría falta una segunda pasada.

export type Accion =
  | { tipo: "open"; screen: "landing" | "planner" | "missions" | "map" | "walk" }
  | {
      tipo: "planner"
      zone?: "A" | "B" | "C"
      date?: string // AAAA-MM-DD
      time?: string // HH:MM, UTC
      stay?: number
      panel?: number
      antenna?: number
      battery?: number
      earth?: number
    }
  | { tipo: "shift"; days: number }
  | { tipo: "fix"; how: "date" | "zone" | "height" }
  | { tipo: "plan" }
  | { tipo: "compare" }
  | { tipo: "play" }
  | { tipo: "simulate" }
  | { tipo: "language"; to: "en" | "es" }

/** Lo que se le dice al modelo. Va al final del prompt solo si la web avisó que puede ejecutar órdenes. */
export const INSTRUCCIONES_ACCIONES = `You can also operate the app for the person. To do it, finish your answer with exactly one command between double angle brackets, after your last sentence. Say in a few words what you are doing first. The command is not spoken or shown: never read it aloud, never explain its syntax.
Commands (use only these, written exactly like this):
<<open screen=planner>>  also: screen=missions, screen=map (the 3D Map), screen=landing (the start page), screen=walk (the walk concept).
<<planner zone=B>>  choose a candidate zone: A, B or C.
<<planner date=2027-04-05 time=09:00>>  set the landing date (and optionally the UTC time). Dates from 2026 to 2030.
<<planner stay=7 panel=5 antenna=5 battery=48 earth=40>>  change the stay in days, the panel or antenna height in metres, the battery in hours or the minimum Earth contact in percent. Any of zone, date, time, stay, panel, antenna, battery and earth can go together in one planner command.
<<shift days=7>>  move the landing later by that many days; a negative number moves it earlier.
<<fix how=date>>  apply the planner's own proposal for the selected zone when it fails: how=date (the date it proposes), how=zone (the zone it proposes) or how=height (the equipment height it proposes).
<<plan>>  go back to the planned landing date.
<<compare>>  save the current scenario in the comparison table and open it.
<<play>>  play the timeline: the Sun and Earth move along the real horizon over ninety days.
<<simulate>>  run the descent simulation to the selected zone (an Apollo 11 descent profile, as an example vehicle).
<<language to=es>>  switch the whole app to Spanish; to=en for English.
Rules for commands: use one when the person asks you to do, show, open, move, switch, run or change something, or says yes to your offer. Words alone do nothing in the app: if you say you are doing something, the command must be the last thing in that same answer. One command per answer; if they ask for two things, do the first and offer the second. For a plain question, answer without a command. Never attach a command to an offer you make ("Want to see the timeline move?"): wait for their yes.
Examples. "Move the landing one week later." -> "One week later, coming up. <<shift days=7>>"  "Switch to zone B." -> "Zone B it is. <<planner zone=B>>"  "Run the descent." -> "Starting the descent now. <<simulate>>"  "Why does it fail?" -> an explanation with no command. The planner recomputes everything after your command, so never announce the new verdict or new figures in the same answer: say what you are changing and invite them to look. If they ask for something no command covers, say so and tell them where to click instead.`

/**
 * Nota que se pega al final del último mensaje del usuario en cada turno. Hace falta porque las respuestas anteriores
 * vuelven en el historial sin su orden (se quitó del texto), y el modelo, al verse a sí mismo «hacer cosas» sin orden,
 * deja de escribirla (medido: a la cuarta petición ya no la ponía).
 */
export const RECORDATORIO_ACCIONES =
  "[Note from the app: your earlier answers are shown here without their commands, but each one that did something ended with one. If this message asks you to do, open, show, move, switch, run or change something in the app, end your answer with the matching <<command>>. If it is only a question, answer with no command.]"

const numero = (v: string | undefined, min: number, max: number, entero = false): number | undefined => {
  if (v === undefined || !/^-?\d+(\.\d+)?$/.test(v)) return undefined
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) return undefined
  return n
}

/** Lee lo que hay entre «<<» y «>>». Devuelve la orden validada o null si no es de la lista. */
export function leerAccion(crudo: string): Accion | null {
  const partes = crudo.trim().split(/\s+/).slice(0, 12)
  const nombre = (partes.shift() ?? "").toLowerCase()
  const p: Record<string, string> = {}
  for (const x of partes) {
    const m = /^([a-z]+)=([\w:.+-]+)$/i.exec(x)
    if (!m) return null
    p[m[1].toLowerCase()] = m[2]
  }
  switch (nombre) {
    case "open": {
      const s = (p.screen ?? "").toLowerCase()
      return s === "landing" || s === "planner" || s === "missions" || s === "map" || s === "walk" ? { tipo: "open", screen: s } : null
    }
    case "planner": {
      const a: Extract<Accion, { tipo: "planner" }> = { tipo: "planner" }
      const z = (p.zone ?? "").toUpperCase()
      if (z === "A" || z === "B" || z === "C") a.zone = z
      if (p.date && /^20(2[6-9]|30)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(p.date)) a.date = p.date
      if (p.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) a.time = p.time
      a.stay = numero(p.stay, 1, 60, true)
      a.panel = numero(p.panel, 0, 30)
      a.antenna = numero(p.antenna, 0, 30)
      a.battery = numero(p.battery, 0, 720, true)
      a.earth = numero(p.earth, 0, 100, true)
      const algo = Object.entries(a).some(([k, v]) => k !== "tipo" && v !== undefined)
      return algo ? (JSON.parse(JSON.stringify(a)) as Accion) : null // sin los campos vacíos
    }
    case "shift": {
      const d = numero(p.days?.replace(/^\+/, ""), -400, 400, true)
      return d ? { tipo: "shift", days: d } : null
    }
    case "fix": {
      const h = (p.how ?? "").toLowerCase()
      return h === "date" || h === "zone" || h === "height" ? { tipo: "fix", how: h } : null
    }
    case "plan":
      return { tipo: "plan" }
    case "compare":
      return { tipo: "compare" }
    case "play":
      return { tipo: "play" }
    case "simulate":
      return { tipo: "simulate" }
    case "language": {
      const t = (p.to ?? "").toLowerCase()
      return t === "en" || t === "es" ? { tipo: "language", to: t } : null
    }
    default:
      return null
  }
}

/**
 * Saca las órdenes del texto a medida que llega del modelo. `pasar` recibe cada trozo y devuelve lo que se puede
 * mostrar y pronunciar; lo que podría ser el comienzo de una orden se retiene hasta saber. Solo la primera orden
 * válida de la respuesta se entrega (`alAccion`); una orden sin cerrar o demasiado larga se descarta.
 */
export function filtroDeAcciones(alAccion: (a: Accion) => void) {
  let retenido = ""
  let entregada = false
  return {
    pasar(delta: string): string {
      let s = retenido + delta
      retenido = ""
      let salida = ""
      for (;;) {
        const i = s.indexOf("<<")
        if (i < 0) {
          if (s.endsWith("<")) {
            retenido = "<"
            return salida + s.slice(0, -1)
          }
          return salida + s
        }
        salida += s.slice(0, i)
        const j = s.indexOf(">>", i + 2)
        if (j < 0) {
          retenido = s.length - i > 200 ? "" : s.slice(i)
          return salida
        }
        const a = entregada ? null : leerAccion(s.slice(i + 2, j))
        if (a) {
          entregada = true
          alAccion(a)
        }
        s = s.slice(j + 2)
      }
    },
  }
}
