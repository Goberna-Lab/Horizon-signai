import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react"
import { useLocation, useNavigate } from "react-router"
import { routes } from "@/app/routes"
import { EVENTO_CASCO, EVENTO_EVA, type AvisoEva, type CascoEva, type EstadoEva } from "@/shared/eva"
import { lang, setLang } from "@/shared/i18n"
import { PREGUNTAS, PUENTES, RESCATE, SEGUIMOS } from "@horizon-signai/shared"
import { decir, entender as entenderVoz, enviarTiempos, turnoDeVoz, usarAcciones, usarAsistente, usarEstado, usarIdioma, usarPantalla, type AccionIA, type Mensaje } from "@/prueba-ia/cliente"
import { crearColaDeVoz, type FraseDeVoz } from "@/prueba-ia/colaDeVoz"
import { olvidar, recordar, recordarNombre, recuerdos } from "@/prueba-ia/memoria"
import { useVoz } from "@/prueba-ia/useVoz"
import { ejecutarAccion, estadoDePantalla } from "./acciones"
import { dondePonerse } from "./colocarse"
import { entender as entenderFrase, esEco, type QueEspera } from "./escucha"
import { EVENTOS, fraseDe, guionDe, hayPeligro, marco, paginaDelMarco, PISTAS, TEXTOS, type Comentario } from "./guion"
import { nombreDe, pideOtroIdioma, type Idioma } from "./idioma"
import { intencionDe } from "./intencion"
import { CONTROL, ELEGIR, ETAPAS, LANDING, OFERTA, recorridoParaRetomar, seGuarda, textoDePaso, type Opcion, type Paso, type Recorrido } from "./recorridos"
import { useOido, type FraseOida } from "./oido"
import * as tiempos from "./tiempos"
import { sugerenciasDe, type Sugerencia } from "./sugerencias"
import { enOraciones, estaGrabada, precargarVoz, restoPorDecir, sinVocativo, vozGrabada, type VozDeOracion } from "./vozGrabada"
import "./eva.css"

const EvaLienzo = lazy(() => import("@/shared/eva/EvaLienzo"))

const COMENTARIO_MS = 90_000 // como mucho un comentario propio cada 90 s
const LECCION_MS = 3500 // en la lección, la pausa entre una parte y la siguiente
const PRIMERO_MS = 2500 // espera al llegar a una pantalla antes del primero
const PASEO_MS = [9000, 15000] // cada cuánto cambia de lugar si nadie la ocupa
const ANCLA_MS = 30_000 // si la arrastras, se queda ahí este tiempo
const GLOBO_MS = 6000 // el globo queda a la vista tras terminar de hablar
const CARGA_MS = 1600 // lo que tarda en encenderse y cargarse antes de saludar (antes 2,6 s: se notaba la espera)
const PREGUNTA_MS = 45_000 // si nadie contesta su pregunta, la retira
const IDIOMA_MS = 90_000 // la del idioma es la primera y abre todo lo demás: espera más
// Una oración con el nombre de la persona no puede estar grabada. En inglés se pide en vivo y se espera esto; si no
// llega, suena la misma sin el nombre. En español la voz en vivo tarda unos 7 s (medido): va directo sin el nombre.
const NOMBRE_MS: Record<Idioma, number> = { en: 2500, es: 0 }
const DICHAS = "horizon-signai.eva.dichas.v1"
const SILENCIO = "horizon-signai.eva.silencio.v1"
const IDIOMA = "horizon-signai.eva.idioma.v1"
const MANOS = "horizon-signai.eva.manos-libres.v1" // en sessionStorage: ya se encendió el micrófono en esta visita
/** Cómo se sigue en un paso del flujo: con «Next», eligiendo uno de los tres caminos o acertando la pregunta de repaso. */
const tipoDe = (p: Paso) => (p.elige ? "camino" : p.repaso ? "repaso" : "paso")
/** Cuánto se ve marcada la opción elegida (botón o voz) antes de seguir. */
const MARCA_MS = 650
const IDIOMA_ELEGIDO = "horizon-signai.eva.idioma-elegido.v1" // en sessionStorage: ya contestó «English or Spanish?»
const MARGEN = 16

const leer = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const escribir = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: se sigue igual */
  }
}
const dichas = () => new Set<string>(JSON.parse(leer(DICHAS) ?? "[]") as string[])
const anotarDicha = (id: string) => escribir(DICHAS, JSON.stringify([...dichas(), id]))
// Lo que vale solo para esta visita (sessionStorage): si ya eligió idioma y si ya la saludó.
const enVisita = (k: string) => {
  try {
    return sessionStorage.getItem(k) === "1"
  } catch {
    return false
  }
}
const anotarEnVisita = (k: string) => {
  try {
    sessionStorage.setItem(k, "1")
  } catch {
    /* sin almacenamiento: lo hará de nuevo */
  }
}
// Saluda una vez por carga de la página (pedido de Manuel, 2026-11-15): al recargar empieza de cero (saludo, nombre y
// oferta); al moverse entre pantallas de la app no lo repite.
let saludoHecho = false
const yaSaludo = () => saludoHecho
const anotarSaludo = () => {
  saludoHecho = true
}
// La sección del recorrido en que va (sessionStorage): si la página se recarga fuera de la landing, EVA ofrece seguir
// desde ahí (recorridoParaRetomar en ./recorridos.ts). En la landing se borra: ahí se empieza de cero.
const PROGRESO = "horizon-signai.eva.progreso.v1"
const leerProgreso = () => {
  try {
    return sessionStorage.getItem(PROGRESO)
  } catch {
    return null
  }
}
const guardarProgreso = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(PROGRESO, id)
    else sessionStorage.removeItem(PROGRESO)
  } catch {
    /* sin almacenamiento: al recargar empieza de cero */
  }
}
/** La página se acaba de recargar porque eligió el otro idioma: vale una sola vez (luego se borra). */
const recienCambioIdioma = () => {
  if (!enVisita(IDIOMA_ELEGIDO)) return false
  try {
    sessionStorage.removeItem(IDIOMA_ELEGIDO)
  } catch {
    /* sin almacenamiento */
  }
  return true
}
/** Espera `ms`. Con `corte`, termina antes si lo cortan. */
// Los tiempos de cada conversación van también al log del API, sin el texto de la persona (./tiempos.ts).
tiempos.alCerrar(enviarTiempos)

// El murmullo de la vez anterior (PUENTES): el siguiente es otro, para que no suene siempre igual.
let ultimoPuente = -1
const otroPuente = (lista: string[]) => {
  let k = Math.floor(Math.random() * lista.length)
  if (lista.length > 1 && k === ultimoPuente) k = (k + 1 + Math.floor(Math.random() * (lista.length - 1))) % lista.length
  ultimoPuente = k
  return lista[k]!
}
// Si a esta altura la IA no dijo nada de su respuesta (sin contar murmullo ni eco), EVA dice RESCATE una vez.
const RESCATE_MS = 6500

const esperar = (ms: number, corte?: AbortSignal) =>
  new Promise<void>((listo) => {
    if (corte?.aborted) return listo()
    const t = setTimeout(listo, ms)
    corte?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        listo()
      },
      { once: true },
    )
  })
/** Una señal que se corta cuando se corta `corte` o cuando pasan `ms`. */
const conLimite = (corte: AbortSignal, ms: number) => {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  corte.addEventListener(
    "abort",
    () => {
      clearTimeout(t)
      c.abort()
    },
    { once: true },
  )
  return c.signal
}
/** Dónde está un elemento en la ventana, aunque viva dentro de la pantalla incrustada (el iframe del Planificador). */
const rectDe = (el: Element) => {
  const r = el.getBoundingClientRect()
  const m = el.ownerDocument.defaultView?.frameElement?.getBoundingClientRect()
  return m ? new DOMRect(r.left + m.left, r.top + m.top, r.width, r.height) : r
}
const aLaVista = (el: Element) => {
  const r = rectDe(el)
  return r.width > 0 && r.bottom > 60 && r.top < innerHeight - 60 && r.right > 0 && r.left < innerWidth
}
/** Las cuatro esquinas que encierran lo que EVA apunta (el trazo del cerco). */
const esquinas = (r: DOMRect) => {
  const x0 = r.left - 6
  const y0 = r.top - 6
  const x1 = r.right + 6
  const y1 = r.bottom + 6
  const l = Math.max(8, Math.min(20, r.width / 3, r.height / 3))
  return `M${x0},${y0 + l}V${y0}H${x0 + l}M${x1 - l},${y0}H${x1}V${y0 + l}M${x1},${y1 - l}V${y1}H${x1 - l}M${x0 + l},${y1}H${x0}V${y1 - l}`
}
/** El velo que oscurece un poco la pantalla menos la parte que EVA señala: toda la ventana con un hueco de su forma. */
const hueco = (r: DOMRect) => {
  const x0 = r.left - 6
  const y0 = r.top - 6
  const x1 = r.right + 6
  const y1 = r.bottom + 6
  const q = Math.max(0, Math.min(8, (x1 - x0) / 2, (y1 - y0) / 2))
  return (
    `M-40,-40H${innerWidth + 40}V${innerHeight + 40}H-40Z` +
    `M${x0 + q},${y0}H${x1 - q}A${q},${q} 0 0 1 ${x1},${y0 + q}V${y1 - q}A${q},${q} 0 0 1 ${x1 - q},${y1}` +
    `H${x0 + q}A${q},${q} 0 0 1 ${x0},${y1 - q}V${y0 + q}A${q},${q} 0 0 1 ${x0 + q},${y0}Z`
  )
}
/** Las piezas del rayo que se mueven en cada cuadro (ver el <svg className="eva-rayo">). */
type PartesDelRayo = {
  capa: HTMLDivElement
  /** Por ojo: el halo, el haz y los pulsos que corren por él. */
  haces: SVGPathElement[][]
  /** Por ojo: el degradado del haz, de la luz de sus ojos al rojo. */
  tintes: SVGLinearGradientElement[]
  /** Por ojo: el punto de luz de donde nace el haz. */
  brillos: SVGCircleElement[]
  /** Por ojo: el punto donde su haz toca lo que señala. */
  puntas: SVGCircleElement[]
  onda: SVGCircleElement
  cerco: SVGPathElement
  marco: SVGRectElement
  destello: SVGRectElement
  velo: SVGPathElement
}

type ColaDeVoz = ReturnType<typeof crearColaDeVoz>

/** La voz de una oración pedida al API en este momento (lo que no está grabado). */
async function vozEnVivo(oracion: string, corte: AbortSignal): Promise<VozDeOracion | null> {
  const frases: FraseDeVoz[] = []
  await decir(oracion, (e) => void (e.t === "frase" && frases.push(e)), corte)
  return frases.length ? frases : null
}

/**
 * La voz de una oración del guion: la grabada (./vozGrabada.ts) y, solo si no la tiene, la del API. No la tiene cuando
 * lleva el nombre de la persona o cuando el guion cambió después de grabar. Con el nombre, la misma oración sin él sí
 * está grabada y es la reserva: la voz en vivo tiene poco margen (NOMBRE_MS) para llegar antes.
 */
async function vozDeOracion(oracion: string, idioma: Idioma, corte: AbortSignal): Promise<VozDeOracion | null> {
  const grabada = await vozGrabada(idioma, oracion)
  if (grabada || corte.aborted) return grabada
  const sinNombre = sinVocativo(oracion)
  if (sinNombre === oracion || !estaGrabada(idioma, sinNombre)) return vozEnVivo(oracion, corte).catch(() => null)
  const viva = NOMBRE_MS[idioma] ? await vozEnVivo(oracion, conLimite(corte, NOMBRE_MS[idioma])).catch(() => null) : null
  return viva ?? vozGrabada(idioma, sinNombre)
}

/**
 * Dice una frase del guion por la cola de voz. Las voces de sus oraciones se piden a la vez y se encolan en orden; las
 * grabadas llegan al instante. Devuelve cuántas oraciones llegaron a tener voz.
 */
// Pausas entre lo que EVA dice al contestar (pedido de Manuel, 2026-11-15: «muy rápido, sin pequeñas pausas de idea»):
// Kokoro no hace pausa con «…» (medido), así que el silencio lo pone la cola de voz. Un poco al azar para que no suene
// a metrónomo. En segundos.
const azar = (min: number, max: number) => min + Math.random() * (max - min)
const PAUSA = {
  frase: () => azar(0.25, 0.4), // entre dos frases de una misma idea
  pensar: () => azar(0.5, 0.7), // tras el murmullo: está pensando
  idea: () => azar(0.6, 0.8), // tras el eco, antes de empezar a responder
}

// `pausa`: silencio entre sus oraciones. Por defecto ninguno: los recorridos sincronizan el rayo con la voz grabada.
async function decirGuion(frase: string, idioma: Idioma, cola: ColaDeVoz, corte: AbortSignal, pausa: () => number = () => 0) {
  const voces = enOraciones(frase).map((o) => vozDeOracion(o, idioma, corte))
  let i = 0
  let conVoz = 0
  for (const pedido of voces) {
    const voz = await pedido
    if (corte.aborted) break
    if (voz?.length) conVoz++
    for (const f of voz ?? []) cola.agregar({ ...f, i: i++ }, pausa())
  }
  return conVoz
}

/**
 * EVA, la robot guía, encima de toda la app (montada en el layout raíz).
 *
 * - Empieza apagada (plomo oscuro, difuminada). Cuando sale el Sol en la landing se enciende y se carga; antes que
 *   nada pregunta el idioma («English or Spanish?», dos botones), luego saluda, pregunta el nombre y pregunta quién
 *   llega para dar su recorrido guiado (recorridos.ts).
 * - Todo lo que dice por su cuenta es un guion con la voz grabada (vozGrabada.ts): no le pide nada al servidor. Solo
 *   una pregunta de la persona va a la IA, con la voz en vivo; si llega en medio de un recorrido, el recorrido queda
 *   en pausa y sigue donde iba (intencion.ts distingue «sigue», «otra vez» y «para» de una pregunta).
 * - Vuela por la pantalla, va a la parte de la que habla (colocarse.ts) y la apunta con dos haces que salen de sus
 *   ojos; esa parte queda en un cerco que parpadea y el resto se oscurece un poco. Al tocarla abre un panel para
 *   escribirle o conversar por voz. Recuerda lo que le cuentas (memoria.ts).
 * - Si le escriben en español hace como que se reconfigura y sigue en español (idioma.ts).
 *
 * Una sola voz a la vez: cada frase y cada respuesta «toma la palabra» (`tomarTurno`) y corta a la anterior.
 * Reglas de comportamiento y todo lo que dice: guion.ts. Sin voz hasta el primer toque en la página (los
 * navegadores no dejan sonar audio antes): mientras tanto, solo el globo.
 */
export default function EvaCompanera() {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const oculta = pathname.startsWith("/prueba-ia") // tiene su propia pantalla de voz
  const ruta = useRef(pathname)
  ruta.current = pathname

  const chica = typeof window !== "undefined" && innerWidth < 640
  const ANCHO = chica ? 120 : 168
  const ALTO = chica ? 150 : 210

  const caja = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: innerWidth - ANCHO - MARGEN, y: innerHeight - ALTO - MARGEN })
  const meta = useRef({ ...pos.current })
  const vel = useRef({ x: 0, y: 0 })
  // En el casco del simulador (evaEnCasco de @/shared/eva): vive dentro del visor, quieta en ese punto y como holograma
  const [casco, setCasco] = useState<CascoEva>(null)
  const cascoRef = useRef<CascoEva>(null)
  const nivel = useRef(0)
  const arrastre = useRef<{ dx: number; dy: number; x0: number; y0: number; movio: boolean } | null>(null)
  const anclada = useRef(0)
  const dormida = useRef(true) // apagada hasta que sale el Sol (o la tocan)
  const ocupada = useRef(true) // apagada no pasea ni comenta
  const habla = useRef<AbortController | null>(null)
  const turno = useRef(0) // quién tiene la palabra: cada frase suya y cada respuesta toma un turno nuevo (ver `tomarTurno`)
  const ultimo = useRef(0)
  const finHabla = useRef(0)
  const leccion = useRef(false) // está dando la lección del Planificador
  const dichasLeccion = useRef(new Set<string>())
  const audioCtx = useRef<AudioContext | null>(null)
  const hilo = useRef<Mensaje[]>([])
  const ocultarGlobo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const esperaPregunta = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // El rayo: a qué apunta, hacia dónde mira el modelo y los trazos que se mueven en cada cuadro.
  const foco = useRef<Element | null>(null)
  const ladoGlobo = useRef<"derecha" | "izquierda" | null>(null) // mientras apunta: el lado contrario a lo que señala
  const mirar = useRef<{ x: number; y: number } | null>(null)
  const punteria = useRef({ x: 0, y: 0 })
  // Dónde están sus ojos dentro de su lienzo (lo escribe el modelo 3D en cada cuadro): de ahí salen los dos haces.
  const ojos = useRef(new Float32Array([0.38, 0.43, 0.62, 0.43]))
  const rayo = useRef<PartesDelRayo | null>(null)
  const cercado = useRef("") // el rectángulo ya dibujado: el cerco y el velo solo se reescriben si cambió
  const descanso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const alMontarRayo = useCallback((capa: HTMLDivElement | null) => {
    cercado.current = ""
    if (!capa) {
      rayo.current = null
      return
    }
    const una = <E extends Element>(selector: string) => capa.querySelector<E>(selector)!
    rayo.current = {
      capa,
      haces: [0, 1].map((k) => [...capa.querySelectorAll<SVGPathElement>(`path[data-ojo="${k}"]`)]),
      tintes: [...capa.querySelectorAll<SVGLinearGradientElement>("linearGradient")],
      brillos: [...capa.querySelectorAll<SVGCircleElement>(".eva-rayo__brillo")],
      puntas: [...capa.querySelectorAll<SVGCircleElement>(".eva-rayo__punta")],
      onda: una(".eva-rayo__onda"),
      cerco: una(".eva-rayo__cerco"),
      marco: una(".eva-rayo__marco"),
      destello: una(".eva-rayo__destello"),
      velo: una(".eva-rayo__velo"),
    }
  }, [])

  const [estado, setEstado] = useState<EstadoEva>("apagada")
  const [globo, setGlobo] = useState("")
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState("")
  const [silencio, setSilencio] = useState(() => leer(SILENCIO) === "1")
  // EVA arranca en el idioma de la app (el selector EN / ES de cada pantalla). Si en la conversación le hablan en el
  // otro idioma, cambia ella sola para esa visita (fijarIdioma), sin recargar la página ni tocar el de la app.
  const [idioma, setIdioma] = useState<Idioma>(lang)
  const [pregunta, setPregunta] = useState<"idioma" | "nombre" | "oferta" | "paso" | "camino" | "repaso" | null>(null)
  // El flujo guiado (./recorridos.ts): en qué etapa va y por qué camino (el riel del globo), y la opción que se acaba de
  // elegir (queda marcada un instante, con botón o con voz, antes de seguir).
  const [riel, setRiel] = useState<{ etapa: number; camino: Opcion | null } | null>(null)
  const caminoActual = useRef<Opcion | null>(null)
  const opcionesDelPasoRef = useRef<() => Opcion[]>(() => [])
  const darPasoRef = useRef<() => Promise<void>>(async () => {})
  // La pregunta que hizo sin audio (antes del primer toque: los navegadores no dejan sonar antes): el primer toque la
  // vuelve a hacer en voz alta, con la pregunta abierta (ver `habilitar`).
  const sinSonar = useRef<{ frase: string; tipo: "nombre" | "oferta" } | null>(null)
  const preguntarRef = useRef<(frase: string, tipo: "idioma" | "nombre" | "oferta") => Promise<void>>(async () => {})
  const preguntaId = useRef(0) // cada pregunta nueva deja sin efecto el cierre de la anterior
  // El paso que EVA está diciendo y cuánto lleva dicho (lo que la cola de voz ya hizo sonar): si la interrumpen con una
  // pregunta, al volver al guion termina desde la oración que cortaron (ver `volverAlGuion`).
  const pasoHablado = useRef<{ t: { r: Recorrido; i: number }; i: number; frase: string; hablado: string; completo: boolean } | null>(null)
  const narrarRef = useRef<(tipo: string, frase: string) => boolean>(() => false)
  const [elegida, setElegida] = useState("")
  // El recorrido guiado en curso (./recorridos.ts) y el rótulo de por dónde va («3 / 10»).
  const recorrido = useRef<{ r: Recorrido; i: number } | null>(null)
  const [avance, setAvance] = useState("")
  const [nombre, setNombre] = useState("")
  // Manos libres (./oido.ts y ./escucha.ts): el micrófono queda abierto y EVA escucha cuando espera algo.
  const [manos, setManos] = useState(false)
  const manosRef = useRef(manos)
  manosRef.current = manos
  const [oido, setOido] = useState("") // lo último que entendió, para mostrarlo en su globo
  const fraseActual = useRef({ frase: "", hasta: 0 }) // lo que dice EVA y hasta cuándo su eco puede colarse
  const oidoEva = useOido((wav, info) => void alOirFraseRef.current(wav, info))
  const alOirFraseRef = useRef<(wav: Blob, info?: FraseOida) => Promise<void>>(async () => {})
  const encenderManosRef = useRef<() => Promise<void>>(async () => {})
  const [duda, setDuda] = useState("") // lo que le escriben en un paso del recorrido
  const [apuntando, setApuntando] = useState(false)
  const abiertaRef = useRef(abierta)
  abiertaRef.current = abierta
  const silencioRef = useRef(silencio)
  silencioRef.current = silencio
  const idiomaRef = useRef(idioma)
  const T = TEXTOS[idioma]

  const fijarIdioma = (i: Idioma) => {
    idiomaRef.current = i
    setIdioma(i)
    usarIdioma(i)
    escribir(IDIOMA, i)
  }
  useEffect(() => usarIdioma(idiomaRef.current), [])

  // EVA ve y maneja la app: con cada pregunta va lo que la pantalla muestra (las cifras del motor del planificador) y
  // la IA puede terminar su respuesta con una orden (abrir una pantalla, cambiar el escenario, aplicar una salida…),
  // que el API valida y aquí se ejecuta. Ver ./acciones.ts y apps/api/src/acciones.ts.
  const navegarRef = useRef<(a: string) => void | Promise<void>>(() => {})
  navegarRef.current = (destino) => navegar(destino)
  const cumplir = useRef((a: AccionIA) => void ejecutarAccion(a, (destino) => navegarRef.current(destino)))
  useEffect(() => {
    usarEstado(estadoDePantalla)
    usarAcciones(cumplir.current)
    return () => {
      usarEstado(null)
      usarAcciones(null)
    }
  }, [])

  // Conversación por voz con micrófono abierto (la misma de /prueba-ia), como EVA.
  const voz = useVoz({
    // Tiempos de cada turno con micrófono abierto (./tiempos.ts), como los de manos libres y lo escrito.
    cronometro: {
      empezar: (haceMs) => tiempos.empezar("micro", idiomaRef.current, haceMs),
      marcar: (m, en) => tiempos.marcar(m, en),
      dato: tiempos.dato,
      pregunta: tiempos.pregunta,
      cerrar: tiempos.cerrar,
    },
    // Como al escribirle o con manos libres: murmullo grabado al instante, eco con las palabras clave y pausas.
    naturalidad: {
      murmullo: (cola, corte) => decirGuion(otroPuente(PUENTES[idiomaRef.current]), idiomaRef.current, cola, corte, PAUSA.frase),
      eco: true,
      pausa: (antes) => (antes === "murmullo" ? PAUSA.pensar() : antes === "eco" ? PAUSA.idea() : PAUSA.frase()),
      respetarPuntuacion: true,
    },
    asistente: "educational",
    historial: () => hilo.current,
    alMensaje: (m) => {
      hilo.current = [...hilo.current, m]
      if (m.role !== "user") return
      recordar(m.content)
      // El idioma elegido se mantiene: solo cambia si la persona lo pide («speak Spanish»), sin ceremonia porque el
      // turno ya está en marcha. Hablarle en el otro idioma no lo cambia (ver pideOtroIdioma).
      const i = pideOtroIdioma(m.content, idiomaRef.current)
      if (i) fijarIdioma(i)
    },
  })
  const conversando = voz.estado !== "reposo"
  const conversandoRef = useRef(conversando)
  conversandoRef.current = conversando
  useEffect(() => {
    if (!conversando) return
    usarAsistente("educational")
    setEstado(voz.estado === "hablando" ? "hablando" : voz.estado === "pensando" ? "pensando" : "escuchando")
    nivel.current = voz.nivel
    if (voz.hablado) mostrar(voz.hablado)
  }, [conversando, voz.estado, voz.nivel, voz.hablado])
  useEffect(() => {
    if (!conversando && !dormida.current) setEstado("reposo")
  }, [conversando])

  // Audio: el primer toque (o tecla) en cualquier parte de la página habilita su voz. Lo que dijo antes en silencio y
  // sigue esperando respuesta (el saludo con «¿Cuál es tu nombre?», la oferta…) lo dice entonces en voz alta; al
  // terminar se abre el micrófono (no escucha mientras habla).
  useEffect(() => {
    const habilitar = () => {
      window.removeEventListener("pointerdown", habilitar)
      window.removeEventListener("keydown", habilitar)
      if (!audioCtx.current || audioCtx.current.state === "closed") audioCtx.current = new AudioContext()
      void audioCtx.current.resume()
      const pendiente = sinSonar.current
      sinSonar.current = null
      // La vuelve a hacer si sigue en pie: abierta, o cerrada solo por el tiempo de espera (nadie contestó ni empezó otra cosa).
      if (pendiente && !recorrido.current && (preguntaRef.current === pendiente.tipo || !preguntaRef.current)) {
        void (async () => {
          await esperar(250) // que el audio termine de arrancar
          if (!recorrido.current && (preguntaRef.current === pendiente.tipo || !preguntaRef.current)) await preguntarRef.current(pendiente.frase, pendiente.tipo)
        })()
      }
      // Ya eligió manos libres en esta visita (la página se recargó al cambiar de idioma): el primer toque lo reabre.
      let quiso = false
      try {
        quiso = sessionStorage.getItem(MANOS) === "1"
      } catch {
        /* sin almacenamiento */
      }
      if (quiso) void encenderManosRef.current()
    }
    window.addEventListener("pointerdown", habilitar)
    window.addEventListener("keydown", habilitar)
    return () => {
      window.removeEventListener("pointerdown", habilitar)
      window.removeEventListener("keydown", habilitar)
    }
  }, [])

  // Vuelo: un resorte hacia `meta`; la velocidad la inclina en 3D. En el mismo cuadro se mueve el rayo.
  useEffect(() => {
    let raf = 0
    const paso = () => {
      const p = pos.current
      const v = vel.current
      const c = cascoRef.current
      if (c) meta.current = { x: c.x - ANCHO / 2, y: c.y - ALTO / 2 } // dentro del visor no pasea: se queda ahí
      if (!arrastre.current || c) {
        v.x = (v.x + (meta.current.x - p.x) * 0.035) * 0.84
        v.y = (v.y + (meta.current.y - p.y) * 0.035) * 0.84
        p.x += v.x
        p.y += v.y
      }
      if (caja.current) caja.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
      // El rayo: dos haces finos, uno por ojo, que se juntan en el punto más cercano de lo que apunta; el modelo mira
      // hacia allá. Alrededor de esa parte van el cerco que parpadea y el velo que oscurece un poco lo demás.
      const el = foco.current
      const R = rayo.current
      if (el && R) {
        const r = rectDe(el)
        const cx = p.x + ANCHO * 0.5
        const cy = p.y + ALTO * 0.43
        const tx = Math.max(r.left - 6, Math.min(r.right + 6, cx))
        const ty = Math.max(r.top - 6, Math.min(r.bottom + 6, cy))
        const d = Math.hypot(tx - cx, ty - cy)
        const ux = d > 0 ? (tx - cx) / d : 1
        const uy = d > 0 ? (ty - cy) / d : 0
        // Cada haz toca la parte en su propio punto, 7 px a cada lado del centro de la puntería: así se ven dos haces
        // aunque los ojos queden en fila con lo que señala (lo normal cuando la parte está a su lado). Al ojo que
        // está más hacia un lado le toca el punto de ese lado, para que no se crucen.
        const o = ojos.current
        const sesgo = (k: number) => (p.x + ANCHO * o[k * 2] - cx) * -uy + (p.y + ALTO * o[k * 2 + 1] - cy) * ux
        const lado = sesgo(0) >= sesgo(1) ? 1 : -1
        for (let k = 0; k < 2; k++) {
          const ex = p.x + ANCHO * o[k * 2]
          const ey = p.y + ALTO * o[k * 2 + 1]
          const px = tx - uy * 7 * (k === 0 ? lado : -lado)
          const py = ty + ux * 7 * (k === 0 ? lado : -lado)
          const x1 = ex.toFixed(1)
          const y1 = ey.toFixed(1)
          const x2 = px.toFixed(1)
          const y2 = py.toFixed(1)
          const trazo = `M${x1},${y1}L${x2},${y2}`
          for (const haz of R.haces[k]) haz.setAttribute("d", trazo)
          // El haz nace con la luz de sus ojos y se vuelve rojo al salir de su cuerpo (unos 80 px), mida lo que mida.
          const largo = Math.max(1, Math.hypot(px - ex, py - ey))
          const tinte = R.tintes[k]
          tinte.setAttribute("x1", x1)
          tinte.setAttribute("y1", y1)
          tinte.setAttribute("x2", (ex + ((px - ex) / largo) * 80).toFixed(1))
          tinte.setAttribute("y2", (ey + ((py - ey) / largo) * 80).toFixed(1))
          R.brillos[k].setAttribute("cx", x1)
          R.brillos[k].setAttribute("cy", y1)
          R.puntas[k].setAttribute("cx", x2)
          R.puntas[k].setAttribute("cy", y2)
        }
        R.onda.setAttribute("cx", tx.toFixed(1))
        R.onda.setAttribute("cy", ty.toFixed(1))
        const clave = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${innerWidth},${innerHeight}`
        if (clave !== cercado.current) {
          cercado.current = clave
          R.cerco.setAttribute("d", esquinas(r))
          R.velo.setAttribute("d", hueco(r))
          for (const caja of [R.marco, R.destello]) {
            caja.setAttribute("x", (r.left - 6).toFixed(1))
            caja.setAttribute("y", (r.top - 6).toFixed(1))
            caja.setAttribute("width", (r.width + 12).toFixed(1))
            caja.setAttribute("height", (r.height + 12).toFixed(1))
          }
        }
        // Pegada a lo que señala (no había sitio al lado) no hay haz que valga: quedan el cerco y el velo.
        R.capa.toggleAttribute("data-corto", d < 28)
        const k = Math.min(1, d / 260) / Math.max(d, 1)
        punteria.current.x = (tx - cx) * k
        punteria.current.y = -(ty - cy) * k
        mirar.current = punteria.current
      } else mirar.current = null
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    const alCambiar = () => {
      meta.current.x = Math.min(meta.current.x, innerWidth - ANCHO - MARGEN)
      meta.current.y = Math.min(meta.current.y, innerHeight - ALTO - MARGEN)
    }
    window.addEventListener("resize", alCambiar)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", alCambiar)
    }
  }, [ANCHO, ALTO])

  const volarA = useCallback(
    (x: number, y: number) => {
      meta.current = {
        x: Math.max(MARGEN, Math.min(innerWidth - ANCHO - MARGEN, x)),
        y: Math.max(MARGEN, Math.min(innerHeight - ALTO - MARGEN, y)),
      }
    },
    [ANCHO, ALTO],
  )

  // Paseo: si nadie la ocupa, cambia de lugar por los bordes (no tapa el centro).
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let t: ReturnType<typeof setTimeout>
    const pasear = () => {
      const libre = !ocupada.current && !abiertaRef.current && !conversandoRef.current && Date.now() > anclada.current
      if (libre) {
        const zonas = [
          [innerWidth - ANCHO - MARGEN, innerHeight * (0.3 + Math.random() * 0.4)],
          [innerWidth * (0.55 + Math.random() * 0.3), innerHeight - ALTO - MARGEN],
          [MARGEN, innerHeight * (0.45 + Math.random() * 0.3)],
          [innerWidth * (0.1 + Math.random() * 0.3), innerHeight - ALTO - MARGEN],
        ]
        const [x, y] = zonas[Math.random() < 0.6 ? Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2)]
        volarA(x, y)
      }
      t = setTimeout(pasear, PASEO_MS[0] + Math.random() * (PASEO_MS[1] - PASEO_MS[0]))
    }
    t = setTimeout(pasear, PASEO_MS[0])
    return () => clearTimeout(t)
  }, [volarA])

  const mostrar = (t: string) => {
    clearTimeout(ocultarGlobo.current)
    setGlobo(t)
  }
  const soltarGlobo = () => {
    clearTimeout(ocultarGlobo.current)
    ocultarGlobo.current = setTimeout(() => !abiertaRef.current && setGlobo(""), GLOBO_MS)
  }
  const quitarFoco = () => {
    clearTimeout(descanso.current)
    foco.current = null
    ladoGlobo.current = null
    setApuntando(false)
  }
  /**
   * El rayo a plena intensidad (velo y haces) mientras habla de esa parte, o en descanso: solo el cerco. Cuando el
   * recorrido se queda esperando en un paso, la pantalla no sigue oscurecida: la persona puede usarla.
   */
  const intensidadDelRayo = (plena: boolean, enMs = 0) => {
    clearTimeout(descanso.current)
    descanso.current = setTimeout(() => rayo.current?.capa.toggleAttribute("data-reposo", !plena), enMs)
  }

  /**
   * El audio, si ya se puede usar. El primer toque en la página lo habilita, pero tarda un instante en arrancar: si
   * ese mismo toque es el que la hace hablar (elegir el idioma), se le da un momento antes de decidir que no hay voz.
   */
  const audioListo = async () => {
    const ctx = audioCtx.current
    if (ctx?.state === "suspended" && !silencioRef.current) await Promise.race([ctx.resume().catch(() => {}), esperar(250)])
    return ctx
  }

  /**
   * Toma la palabra: corta lo que EVA estuviera diciendo (una frase suya o una respuesta de la IA) y abre un turno
   * nuevo. Quien hablaba antes ve que el turno cambió y ya no toca su cara ni su globo, ni la deja libre.
   */
  const tomarTurno = () => {
    habla.current?.abort()
    const corte = new AbortController()
    habla.current = corte
    return { mio: ++turno.current, corte }
  }

  /**
   * Dice una frase hecha: con voz si ya puede sonar, si no solo el globo. La voz del guion está grabada
   * (./vozGrabada.ts): no se le pide al servidor. `grave`: es un aviso, lo dice con cara de alerta (ojos estrechos y
   * marcas rojas). `remate`: la cara con la que cierra, un guiño tras un chiste o los ojos contentos tras algo que
   * salió bien. Devuelve false si otra frase o una pregunta le quitó la palabra antes de terminar.
   */
  const hablar = useCallback(async (frase: string, remate: "bromeando" | "alegre" | null, grave = false) => {
    const { mio, corte } = tomarTurno()
    ocupada.current = true
    fraseActual.current = { frase, hasta: Infinity }
    usarAsistente("educational")
    setEstado(grave ? "alerta" : "hablando")
    const lectura = Math.min(9000, 1800 + frase.length * 55) // sin voz: el tiempo de leerla
    const ctx = await audioListo()
    if (turno.current !== mio) return false
    if (silencioRef.current || !ctx || ctx.state !== "running") {
      mostrar(frase)
      await esperar(lectura, corte.signal)
    } else {
      mostrar("")
      const cola = crearColaDeVoz({
        ctx,
        asistente: "educational",
        alHablar: (texto) => {
          mostrar(texto)
          const h = pasoHablado.current
          if (h && h.frase === frase) h.hablado = texto
        },
        alNivel: (v) => (nivel.current = v),
        alEmpezar: () => {},
        respetarPuntuacion: true,
        alAgendar: (_, empieza) => tiempos.marcar("respuestaSuena", empieza), // la respuesta grabada (si hay registro abierto)
      })
      const callar = () => void cola.detener()
      corte.signal.addEventListener("abort", callar)
      let conVoz = 0
      try {
        conVoz = await decirGuion(frase, idiomaRef.current, cola, corte.signal)
        await cola.terminada()
      } catch {
        /* sin voz: queda el texto */
      } finally {
        corte.signal.removeEventListener("abort", callar)
        cola.cerrar()
        nivel.current = 0
      }
      if (!corte.signal.aborted) {
        mostrar(frase)
        if (!conVoz) await esperar(lectura, corte.signal) // la voz no llegó: queda el texto, con tiempo para leerlo
      }
    }
    if (turno.current === mio) fraseActual.current = { frase, hasta: Date.now() + 2500 } // su eco aún puede llegar
    if (turno.current !== mio) return false
    if (remate && !corte.signal.aborted) {
      setEstado(remate)
      await esperar(1200, corte.signal)
      if (turno.current !== mio) return false
    }
    setEstado("reposo")
    ocupada.current = false
    finHabla.current = Date.now()
    soltarGlobo()
    return true
  }, [])

  /**
   * Va hasta una parte de la pantalla y le dispara el rayo. Dónde se pone y hacia qué lado abre el globo lo decide
   * ./colocarse.ts: al lado de la parte, con aire para que el rayo se vea, y el globo hacia el lado contrario.
   */
  const irA = useCallback(
    async (el: Element) => {
      const sitio = dondePonerse(rectDe(el), { ancho: innerWidth, alto: innerHeight }, { ancho: ANCHO, alto: ALTO }, chica ? 36 : 84)
      ladoGlobo.current = sitio.globo
      volarA(sitio.x, sitio.y)
      // El vuelo es un resorte: llega, se pasa un poco y vuelve. Dispara cuando ya casi se asentó (o tras 1,2 s): no hace
      // falta que pare del todo para empezar a hablar.
      for (let k = 0; k < 24; k++) {
        await esperar(50)
        const lejos = Math.hypot(meta.current.x - pos.current.x, meta.current.y - pos.current.y)
        if (k > 3 && lejos < 24 && Math.hypot(vel.current.x, vel.current.y) < 2) break
      }
      foco.current = el
      setApuntando(true)
      await esperar(150)
    },
    [volarA, ANCHO, ALTO, chica],
  )

  /** Un comentario propio: vuela a su parte, la apunta y lo dice. `raiz`: dónde buscar esa parte (la página o la pantalla incrustada). */
  const comentar = useCallback(
    async (c: Comentario, peligro: boolean, raiz: Document | null) => {
      const frase = fraseDe(c, peligro, idiomaRef.current)
      if (!frase) return
      ultimo.current = Date.now()
      const { mio } = tomarTurno()
      ocupada.current = true
      if (!c.repetible) anotarDicha(c.id)
      const el = c.selector ? [...(raiz?.querySelectorAll(c.selector) ?? [])].find(aLaVista) : undefined
      if (el) await irA(el)
      // Si mientras volaba le preguntaron algo, ya no lo dice: la respuesta va primero.
      if (turno.current === mio) await hablar(frase, peligro ? null : "bromeando", peligro)
      quitarFoco()
    },
    [hablar, irA],
  )

  // En cada pantalla: le dice a la IA dónde estás y comenta algo de ahí. Fuera de la lección respeta los 90 s
  // y un dado; en la lección va parte por parte, en orden, con una pausa corta.
  useEffect(() => {
    if (oculta) return
    usarPantalla(guionDe(pathname, paginaDelMarco()).pantalla)
    const intentar = () => {
      // El guion se elige en cada intento: dentro de /planner la página del prototipo cambia sin que cambie la ruta.
      const g = guionDe(pathname, paginaDelMarco())
      usarPantalla(g.pantalla)
      if (ocupada.current || abiertaRef.current || conversandoRef.current || document.hidden) return
      // Dentro del casco no describe la pantalla: ahí habla de lo que pasa en la caminata (eventos del simulador)
      if (cascoRef.current) return
      const enLeccion = leccion.current && !!g.enMarco
      if (enLeccion ? Date.now() - finHabla.current < LECCION_MS : Date.now() - ultimo.current < COMENTARIO_MS) return
      const peligro = hayPeligro()
      const ya = dichas()
      const raiz = g.enMarco ? marco() : document
      const elegibles = g.comentarios.filter(
        (c) =>
          (enLeccion ? !dichasLeccion.current.has(c.id) : c.repetible || !ya.has(c.id)) &&
          (!peligro || c.serio) &&
          (!c.selector || [...(raiz?.querySelectorAll(c.selector) ?? [])].some(aLaVista)),
      )
      if (!elegibles.length) return
      // El dado: entre los dos primeros que quedan (el orden del guion va de lo general a lo particular).
      const elegido = elegibles[enLeccion ? 0 : Math.floor(Math.random() * Math.min(2, elegibles.length))]
      if (enLeccion) dichasLeccion.current.add(elegido.id)
      void comentar(elegido, peligro, raiz)
    }
    const t0 = setTimeout(intentar, PRIMERO_MS)
    const t = setInterval(intentar, 5000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [pathname, oculta, comentar])

  // El simulador le avisa cuando el astronauta se pone o se quita el casco (ver evaEnCasco en @/shared/eva)
  useEffect(() => {
    const alCasco = (ev: Event) => {
      const sitio = (ev as CustomEvent<CascoEva>).detail
      cascoRef.current = sitio
      setCasco(sitio ? { ...sitio } : null)
    }
    window.addEventListener(EVENTO_CASCO, alCasco)
    return () => window.removeEventListener(EVENTO_CASCO, alCasco)
  }, [])

  // Avisos de otras pantallas (simulador, alunizaje): ver EVENTOS en guion.ts. Y `enfocarEva`: resaltar algo.
  useEffect(() => {
    const alAviso = (ev: Event) => {
      const { tipo, texto: propio, selector } = (ev as CustomEvent<AvisoEva>).detail
      if (dormida.current || conversandoRef.current) return
      if (tipo === "enfocar") {
        if (!selector || ocupada.current) return
        const el = [...document.querySelectorAll(selector), ...(marco()?.querySelectorAll(selector) ?? [])].find(aLaVista)
        if (!el) return
        ultimo.current = Date.now()
        const { mio, corte } = tomarTurno()
        ocupada.current = true
        void (async () => {
          await irA(el)
          if (turno.current === mio) {
            if (propio) await hablar(propio, null)
            else {
              await esperar(4000, corte.signal)
              if (turno.current === mio) ocupada.current = false
            }
          }
          quitarFoco()
        })()
        return
      }
      const e = EVENTOS[tipo]
      if (!e) return
      const peligro = e.critico || hayPeligro()
      const frase = propio ?? fraseDe(e, peligro, idiomaRef.current) ?? ""
      if (!frase) return
      if (narrarRef.current(tipo, frase)) return // el recorrido en curso lo narra (ver `narra` en ./recorridos.ts)
      if (!e.repetible && dichas().has(tipo)) return
      if (!e.critico && (ocupada.current || (!e.guia && Date.now() - ultimo.current < COMENTARIO_MS))) return
      if (e.critico && ocupada.current) habla.current?.abort() // lo crítico pasa adelante
      ultimo.current = Date.now()
      if (!e.repetible) anotarDicha(tipo)
      const cara = peligro ? null : e.festejo ? "alegre" : e.guia ? null : "bromeando"
      // Con `selector` (por ejemplo, una parte del HUD del casco del simulador) apunta con su rayo mientras lo dice
      const el = selector ? [...document.querySelectorAll(selector), ...(marco()?.querySelectorAll(selector) ?? [])].find(aLaVista) : undefined
      if (!el) {
        void hablar(frase, cara, peligro)
        return
      }
      const { mio } = tomarTurno()
      ocupada.current = true
      void (async () => {
        await irA(el)
        if (turno.current === mio) await hablar(frase, cara, peligro)
        quitarFoco()
      })()
    }
    window.addEventListener(EVENTO_EVA, alAviso)
    return () => window.removeEventListener(EVENTO_EVA, alAviso)
  }, [hablar, irA])

  /** Le hablaron en otro idioma: hace como que se reconfigura (el visor repasa, los corchetes buscan) y sigue en ese idioma. */
  const reconfigurar = useCallback(
    async (nuevo: Idioma) => {
      const antes = idiomaRef.current
      if (nuevo === antes) return
      tomarTurno()
      ocupada.current = true
      setEstado("pensando")
      mostrar(TEXTOS[antes].detectado)
      await esperar(1700)
      fijarIdioma(nuevo)
      await hablar(TEXTOS[nuevo].listo, null)
    },
    [hablar],
  )

  /** Hace una pregunta y deja el globo abierto con su respuesta (un campo o unos botones). */
  const preguntar = useCallback(
    async (frase: string, tipo: "idioma" | "nombre" | "oferta") => {
      // Mientras ofrece el flujo, trae ya la voz del primer paso de cada respuesta: al elegir, empieza sin espera.
      if (tipo === "oferta") for (const frase of [CONTROL.pasos[0].texto, LANDING.pasos[0].texto]) precargarVoz(idiomaRef.current, frase[idiomaRef.current])
      // Manos libres: con su primera pregunta pide el micrófono (el navegador muestra el permiso). Si el audio aún no
      // está habilitado (nadie tocó la página), queda anotado y se abre con el primer toque (ver `habilitar`).
      if (tipo !== "idioma" && !manosRef.current) void encenderManos()
      const id = ++preguntaId.current
      // Sin audio todavía: la dice en silencio y queda anotada para el primer toque.
      const ctx = audioCtx.current
      sinSonar.current = tipo !== "idioma" && !silencioRef.current && (!ctx || ctx.state !== "running") ? { frase, tipo } : null
      // El campo o los botones salen mientras lo dice, no al terminar: se le puede contestar desde ya.
      const dicho = hablar(frase, null)
      setPregunta(tipo)
      clearTimeout(esperaPregunta.current)
      esperaPregunta.current = setTimeout(
        () => {
          setPregunta(null)
          ocupada.current = false
          soltarGlobo()
        },
        tipo === "idioma" ? IDIOMA_MS : PREGUNTA_MS,
      )
      if (!(await dicho)) {
        // Le quitaron la palabra. Si fue la respuesta, la pregunta ya se cerró; si fue un aviso de otra pantalla, se retira.
        // Si la quitó otra pregunta (o esta misma, repetida en voz alta con el primer toque), esa manda: no se cierra.
        if (preguntaId.current === id && preguntaRef.current === tipo) cerrarPregunta()
        return
      }
      ocupada.current = true // la pregunta sigue abierta: ni pasea ni comenta
      clearTimeout(ocultarGlobo.current)
      setGlobo(frase)
    },
    [hablar],
  )
  preguntarRef.current = preguntar

  /** El saludo: su nombre y la pregunta por el de la persona. Una vez por carga de la página (ver `saludoHecho`). */
  const saludar = useCallback(async () => {
    anotarSaludo()
    const t = TEXTOS[idiomaRef.current]
    await preguntar(t.hola, "nombre") // de cero: siempre pregunta el nombre

  }, [preguntar])

  /**
   * Se enciende y se carga (lo hace el modelo al salir de «apagada») y, en la landing, antes que nada pregunta el
   * idioma: «English or Spanish?», con dos botones. Con la respuesta sigue el saludo (ver `alIdioma`).
   */
  const despertar = useCallback(async () => {
    if (!dormida.current) return
    dormida.current = false
    setEstado("reposo")
    const t = TEXTOS[idiomaRef.current]
    // Mientras se carga, trae ya la voz de lo primero que va a decir (solo saluda en la landing).
    if (ruta.current === routes.landing) precargarVoz(idiomaRef.current, t.hola)
    await esperar(CARGA_MS)
    if (ruta.current === routes.landing) guardarProgreso(null) // el inicio de la presentación: de cero
    else {
      const retomar = !yaSaludo() && !abiertaRef.current && !conversandoRef.current ? leerProgreso() : null
      const r = retomar ? recorridoParaRetomar(retomar, recuerdos().nombre ?? "") : null
      if (r) {
        anotarSaludo()
        recorrido.current = { r, i: 0 }
        void darPasoRef.current()
        return
      }
    }
    if (ruta.current !== routes.landing || yaSaludo() || abiertaRef.current || conversandoRef.current) {
      ocupada.current = false
      return
    }
    // El idioma ya lo pregunta la landing (su tarjeta, al pausar la entrada): EVA no lo repite y saluda.
    await saludar()
  }, [preguntar, saludar])

  // Apagada hasta que sale el Sol. En la landing, el Sol es el disco que sube por detrás de la cresta
  // (features/landing/flight: `.fl-limb__sun`, animación `fl-sun-up`, que arranca con retraso): se mira cuándo
  // empieza de verdad. En las demás pantallas, o si no hay animación, se enciende sola al poco rato.
  useEffect(() => {
    if (oculta || !dormida.current) return
    const t0 = performance.now()
    const id = setInterval(() => {
      const ms = performance.now() - t0
      const sol = document.querySelector(".fl-limb__sun")
      let salio: boolean
      if (sol) {
        const animaciones = sol.getAnimations?.() ?? []
        salio = animaciones.length
          ? animaciones.some((a) => a.playState === "finished" || Number(a.currentTime ?? 0) >= Number(a.effect?.getTiming().delay ?? 0))
          : ms > 1500
      } else salio = ms > (ruta.current === routes.landing ? 5000 : 900)
      // La página se acaba de recargar porque eligió el otro idioma: no espera otra vez al Sol para saludar.
      if (!yaSaludo() && ms > 500 && recienCambioIdioma()) salio = true
      if (salio || ms > 9000) { // como mucho 9 s (antes 14): si la animación del Sol tarda, no se la espera
        clearInterval(id)
        void despertar()
      }
    }, 200)
    return () => clearInterval(id)
  }, [oculta, despertar])

  const cerrarPregunta = () => {
    setPregunta(null)
    clearTimeout(esperaPregunta.current)
  }
  // Si cambian de pantalla con una pregunta suya abierta, la retira: en la pantalla nueva le toca guiar.
  const preguntaRef = useRef(pregunta)
  preguntaRef.current = pregunta
  useEffect(() => {
    if (!preguntaRef.current || recorrido.current) return // en un recorrido, EVA misma cambia de pantalla
    setPregunta(null)
    clearTimeout(esperaPregunta.current)
    ocupada.current = false
    soltarGlobo()
  }, [pathname])
  // Mientras pregunta qué hacer, tocar la parte de una opción en el dashboard (dentro del marco) también la elige: una
  // misión de la lista es «ver una misión» y «Nueva misión» es «crear» (EVA cuenta los pasos antes de abrir el
  // Planificador: el enlace se intercepta).
  useEffect(() => {
    if (pregunta !== "camino") return
    const d = marco()
    if (!d) return
    const alClic = (ev: Event) => {
      const el = ev.target as Element | null
      for (const o of opcionesDelPasoRef.current()) {
        const parte = o.toque ? el?.closest?.(o.toque) : null
        if (!parte) continue
        if (parte.closest("a")) ev.preventDefault()
        void alCaminoRef.current(o.id)
        return
      }
    }
    d.addEventListener("click", alClic, true)
    return () => d.removeEventListener("click", alClic, true)
  }, [pregunta])
  /** Espera a que una parte de la pantalla esté a la vista (en la página o en el planificador incrustado). */
  const buscarParte = async (selector: string) => {
    let desplazada = false
    for (let k = 0; k < 25; k++) {
      const todas = [...(marco()?.querySelectorAll(selector) ?? []), ...document.querySelectorAll(selector)]
      const el = todas.find(aLaVista)
      if (el) return el
      // Existe pero está fuera de la vista (una sección más abajo en la landing): la trae a la vista una vez.
      const lejos = !desplazada && todas.find((x) => rectDe(x).width > 0)
      if (lejos) {
        desplazada = true
        lejos.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })
        await esperar(700)
        continue
      }
      await esperar(200)
    }
    return undefined
  }
  /** Lo que dice un paso, en el idioma actual. Con `cuenta`, lee los días que faltan en la pantalla (la cuenta regresiva). */
  const fraseDelPaso = (p: Paso) => {
    let dias: number | null = null
    if (p.cuenta) {
      const n = parseInt((marco()?.querySelector(p.cuenta) ?? document.querySelector(p.cuenta))?.textContent ?? "", 10)
      dias = Number.isFinite(n) ? n : null
    }
    return textoDePaso(p, idiomaRef.current, dias)
  }
  /** Las opciones del paso en que espera el recorrido, si es un paso que pregunta. */
  const opcionesDelPaso = (): Opcion[] => {
    const t = recorrido.current
    return (t && t.r.pasos[t.i]?.elige) || []
  }
  /** El recorrido termina (o no empieza): la IA vuelve a poder manejar la app. */
  const terminarRecorrido = () => {
    recorrido.current = null
    caminoActual.current = null
    setRiel(null)
    usarAcciones(cumplir.current)
  }
  /** El recorrido se queda esperando en su paso: el globo con el texto, «Next», «Stop» y el campo para preguntar. */
  const esperarEnPaso = (enElGlobo: string) => {
    const t = recorrido.current
    if (!t) return
    ocupada.current = true // sigue en el recorrido: ni pasea ni comenta hasta que pulsen
    clearTimeout(ocultarGlobo.current)
    setGlobo(enElGlobo)
    setAvance(`${t.i + 1} / ${t.r.pasos.length}`)
    setPregunta(tipoDe(t.r.pasos[t.i]))
    intensidadDelRayo(false, 2200)
  }
  /**
   * Un paso del recorrido guiado: hace lo que toca en la app, apunta a la parte de la que habla, lo dice con su voz
   * grabada y espera a que la persona pulse «Next» o pregunte algo. No depende de la IA ni del servidor de voz.
   */
  const darPaso = async () => {
    const t = recorrido.current
    if (!t) return
    const p = t.r.pasos[t.i]
    const idioma = idiomaRef.current
    if (t.i === 0 && seGuarda(t.r.id)) guardarProgreso(t.r.id) // entra a una sección: queda guardada por si recargan
    cerrarPregunta()
    setDuda("")
    quitarFoco()
    // Calla lo anterior y toma la palabra. Si después se la quitan (preguntaron algo), este paso se retira y el
    // recorrido queda en pausa: la respuesta lo devuelve a esperar aquí (ver `responder`).
    const { mio } = tomarTurno()
    const sigo = () => recorrido.current === t && turno.current === mio
    ocupada.current = true
    leccion.current = false
    usarAcciones(null) // en el recorrido manda el guion: si preguntan, la IA contesta pero no cambia el escenario
    // Mientras tanto, la voz de este paso y la del que sigue.
    const proximo = t.r.pasos[t.i + 1]
    if (!p.cuenta) precargarVoz(idioma, p.texto[idioma]) // con cuenta regresiva, la frase sale de la pantalla al decirla
    precargarVoz(idioma, proximo ? textoDePaso(proximo, idioma) : t.r.fin[idioma])
    if (p.accion) {
      await ejecutarAccion(p.accion, (destino) => navegar(destino))
      await esperar(p.espera ?? 250)
    }
    if (!sigo()) return
    const el = p.selector ? await buscarParte(p.selector) : undefined
    if (!sigo()) return
    if (el) await irA(el)
    if (!sigo()) return
    const frase = fraseDelPaso(p)
    // «Next» (o las misiones, o las respuestas) y el campo salen mientras lo dice: quien ya entendió sigue sin esperar.
    setAvance(`${t.i + 1} / ${t.r.pasos.length}`)
    setRiel(p.etapa ? { etapa: p.etapa, camino: caminoActual.current } : null)
    setOido("")
    pasoHablado.current = { t, i: t.i, frase, hablado: "", completo: false }
    const dicho = hablar(frase, null)
    setPregunta(tipoDe(p))
    if (!(await dicho) || recorrido.current !== t) return
    if (pasoHablado.current?.frase === frase) pasoHablado.current.completo = true
    esperarEnPaso(frase)
  }
  darPasoRef.current = darPaso
  /** «Next» o «Stop» en un paso del recorrido. */
  const alPaso = async (seguir: boolean) => {
    const t = recorrido.current
    cerrarPregunta()
    setDuda("")
    quitarFoco()
    if (!t) return
    if (seguir && t.i + 1 < t.r.pasos.length) {
      t.i++
      void darPaso()
      return
    }
    terminarRecorrido()
    ocupada.current = false
    if (!seguir) {
      await hablar(TEXTOS[idiomaRef.current].luego, null)
      return
    }
    // Terminó: lo dice y sigue con lo que toca (abrir el Planificador, volver a ofrecer o volver a elegir camino).
    const fin = t.r.fin[idiomaRef.current]
    if (fin && !(await hablar(fin, "alegre"))) return
    if (t.r.alFin) guardarProgreso("elegir") // sale de la app (el Planificador): al volver, sigue en «tu turno»
    if (t.r.alFin) await ejecutarAccion(t.r.alFin, (destino) => navegar(destino))
    else if (t.r.luego === "oferta") await preguntar(TEXTOS[idiomaRef.current].quien, "oferta")
    else if (t.r.luego === "elegir") {
      recorrido.current = { r: ELEGIR, i: 0 }
      void darPaso()
    }
  }
  /** Marca un instante la opción elegida (botón o voz) y sigue. */
  const marcar = async (id: string) => {
    setElegida(id)
    await esperar(MARCA_MS)
    setElegida("")
  }
  /**
   * Eligieron una opción de un paso que pregunta (en el globo, diciéndola o tocando su parte en el dashboard): empieza
   * su recorrido o, si no tiene, EVA dice lo suyo y el flujo termina (modo libre).
   */
  const alCamino = async (id: string) => {
    const t = recorrido.current
    const c = opcionesDelPaso().find((x) => x.id === id)
    if (!t || !c) return
    tomarTurno() // si todavía lo estaba preguntando, se calla: ya eligieron
    await marcar(id)
    if (recorrido.current !== t) return
    if (!c.recorrido) {
      guardarProgreso(null) // explora por su cuenta: el recorrido terminó
      cerrarPregunta()
      terminarRecorrido()
      ocupada.current = false
      if (c.dicho) await hablar(c.dicho[idiomaRef.current], "alegre")
      return
    }
    caminoActual.current = c
    recorrido.current = { r: c.recorrido, i: 0 }
    void darPaso()
  }
  const alCaminoRef = useRef(alCamino)
  alCaminoRef.current = alCamino
  opcionesDelPasoRef.current = opcionesDelPaso
  // Un aviso del simulador que el paso en curso narra (la alarma 1202, el control manual, el contacto): lo dice cuando
  // termine lo que está diciendo y vuelve a esperar en el paso.
  narrarRef.current = (tipo, frase) => {
    const t = recorrido.current
    if (!t?.r.pasos[t.i]?.narra?.includes(tipo)) return false
    void (async () => {
      for (let k = 0; k < 60 && fraseActual.current.hasta === Infinity; k++) await esperar(250) // no la corta a media frase
      if (recorrido.current !== t || !t.r.pasos[t.i]?.narra?.includes(tipo)) return
      if (!(await hablar(frase, "alegre")) || recorrido.current !== t) return
      esperarEnPaso(fraseDelPaso(t.r.pasos[t.i]))
    })()
    return true
  }
  /** Contestaron la pregunta de repaso: si aciertan, sigue; si no, lo explica y deja probar otra vez. */
  const alRepaso = async (k: number) => {
    const t = recorrido.current
    const r = t?.r.pasos[t.i].repaso
    if (!t || !r) return
    if (k !== r.correcta) {
      const frase = r.fallo[idiomaRef.current]
      if (!(await hablar(frase, null)) || recorrido.current !== t) return
      esperarEnPaso(frase)
      return
    }
    // Acertó: la pregunta se cierra ya, así lo que diga mientras festeja (o el eco) no vuelve a empezar el festejo.
    cerrarPregunta()
    if (!(await hablar(r.acierto[idiomaRef.current], "alegre")) || recorrido.current !== t) return
    void alPaso(true)
  }
  /** «Otra vez»: repite lo que dijo en este paso, sin rehacer lo que hizo en la app. */
  const repetirPaso = async () => {
    const t = recorrido.current
    if (!t) return
    const frase = fraseDelPaso(t.r.pasos[t.i])
    intensidadDelRayo(true)
    if (!(await hablar(frase, null)) || recorrido.current !== t) return
    esperarEnPaso(frase)
  }
  /**
   * Lo que le escriben en un paso del recorrido. Seguir, repetir y parar se resuelven aquí, sin IA (./intencion.ts);
   * si es una pregunta, la contesta la IA y el recorrido sigue donde iba.
   */
  const alDecirEnPaso = async (ev: FormEvent) => {
    ev.preventDefault()
    const q = duda.trim()
    if (!q) return
    setDuda("")
    const que = intencionDe(q)
    if (que === "siguiente") return alPaso(true)
    if (que === "parar") return alPaso(false)
    if (que === "repetir") return repetirPaso()
    await responder(q)
  }
  /** Contestaron la oferta: «sí» (el control de misión), «solo la landing» (su recorrido) o «ahora no». */
  const alOferta = async (id: (typeof OFERTA)[number]["id"] | null) => {
    if (id) {
      tomarTurno()
      await marcar(id)
    }
    cerrarPregunta()
    if (!id) {
      terminarRecorrido()
      await hablar(TEXTOS[idiomaRef.current].luego, null)
      return
    }
    caminoActual.current = null
    recorrido.current = { r: id === "si" ? CONTROL : LANDING, i: 0 }
    void darPaso()
  }
  /**
   * Contestaron «English or Spanish?». Si es el idioma en que ya está la app, saluda. Si es el otro, la app entera
   * cambia: EVA hace como que se reconfigura y la página se recarga en ese idioma (shared/i18n); al volver ya no
   * pregunta el idioma, se enciende enseguida y saluda.
   */
  const alIdioma = async (elegido: Idioma) => {
    cerrarPregunta()
    void encenderManos() // este toque es el que el navegador pide para el micrófono
    anotarEnVisita(IDIOMA_ELEGIDO)
    if (elegido !== lang) {
      tomarTurno()
      ocupada.current = true
      setEstado("pensando")
      mostrar(TEXTOS[elegido].reconfigurando)
      await esperar(1400)
      setLang(elegido) // recarga la página
      await esperar(1500)
      // Sigue aquí: el navegador no dejó guardar la preferencia y no hubo recarga. Cambia solo ella.
    }
    if (elegido !== idiomaRef.current) fijarIdioma(elegido)
    await saludar()
  }
  // ---------- Manos libres ----------
  /** Abre el micrófono (con el toque que eligió el idioma) y deja anotado que esta visita se maneja hablando. */
  const encenderManos = async () => {
    try {
      sessionStorage.setItem(MANOS, "1")
    } catch {
      /* sin almacenamiento: vale para esta página */
    }
    for (const frase of [...PUENTES[idiomaRef.current], SEGUIMOS[idiomaRef.current], RESCATE[idiomaRef.current]]) precargarVoz(idiomaRef.current, frase)
    const ctx = audioCtx.current
    if (!ctx || ctx.state !== "running") return // sin toque todavía: lo abre el primer toque en la página
    const ok = await oidoEva.encender(ctx)
    manosRef.current = ok
    setManos(ok)
  }
  // EVA escucha solo cuando espera algo (el nombre, la oferta, un camino, el repaso o un paso del flujo) y nunca mientras
  // habla o piensa (2026-11-15, medido en el log de producción): con parlantes su voz vuelve por el micrófono y Whisper
  // la convierte en palabras que no son suyas («Thank you»…), que ningún filtro de eco reconoce; pasaban como preguntas y
  // la cortaban a media frase. Mientras habla se la interrumpe escribiendo o con los botones; al callar, vuelve a oír.
  const hablandoEva = estado === "hablando" || estado === "alerta" || estado === "pensando"
  useEffect(() => {
    oidoEva.escuchar(manos && !!pregunta && pregunta !== "idioma" && !hablandoEva)
  }, [manos, pregunta, hablandoEva, oidoEva])

  /** Las opciones de lo que está esperando, con sus palabras en los dos idiomas (para reconocerlas por voz). */
  const opcionesDe = (espera: string | null): string[][] => {
    if (espera === "camino") return opcionesDelPaso().map((c) => [c.boton.en, c.boton.es, ...c.palabras])
    const t = recorrido.current
    const r = espera === "repaso" && t ? t.r.pasos[t.i].repaso : undefined
    return r ? r.opciones.map((o) => [o.en, o.es]) : []
  }
  /** Calla y se queda esperando en el paso («para»). */
  const callarEnPaso = () => {
    const t = recorrido.current
    tomarTurno()
    quitarFoco()
    if (t) esperarEnPaso(fraseDelPaso(t.r.pasos[t.i]))
    else {
      setEstado("reposo")
      ocupada.current = false
    }
  }
  /**
   * Regla de Manuel (2026-11-15, «muy importante»): si la interrumpen con una pregunta, contesta y, pasado 1 s, avisa que
   * sigue y retoma el guion donde quedó: si cortaron un paso a media frase, lo termina desde la oración cortada; si el
   * paso ya estaba dicho, sigue con el siguiente; si esperaba una respuesta (nombre, oferta, una opción, el repaso), la
   * vuelve a pedir.
   */
  const volverAlGuion = async (enPausa: { r: Recorrido; i: number } | null, espera: string | null) => {
    const mio = turno.current
    await esperar(1000)
    if (turno.current !== mio) return // otra pregunta u otra frase tomó la palabra
    const idioma = idiomaRef.current
    if (enPausa && recorrido.current === enPausa) {
      if (!(await hablar(SEGUIMOS[idioma], null)) || recorrido.current !== enPausa) return
      const p = enPausa.r.pasos[enPausa.i]!
      const frase = fraseDelPaso(p)
      const h = pasoHablado.current
      const cortado = h && h.t === enPausa && h.i === enPausa.i && !h.completo
      if (cortado || p.elige || p.repaso) {
        // Desde la oración que cortaron (o la pregunta entera, si esperaba una respuesta).
        const resto = cortado ? restoPorDecir(frase, h.hablado) : frase
        pasoHablado.current = { t: enPausa, i: enPausa.i, frase: resto, hablado: "", completo: false }
        setPregunta(tipoDe(p))
        if (!(await hablar(resto, null)) || recorrido.current !== enPausa) return
        if (pasoHablado.current?.frase === resto) pasoHablado.current = { t: enPausa, i: enPausa.i, frase, hablado: frase, completo: true }
        esperarEnPaso(frase)
        return
      }
      void alPaso(true) // el paso ya estaba dicho: sigue el protocolo
      return
    }
    if (espera === "oferta") await preguntar(TEXTOS[idioma].quien, "oferta")
    else if (espera === "nombre") await preguntar(TEXTOS[idioma].hola, "nombre")
    else ocupada.current = false
  }
  /** Contesta con la respuesta grabada de una pregunta frecuente y vuelve a lo que estaba esperando. */
  const contestarGrabada = async (id: string, q: string, espera: string | null) => {
    const p = PREGUNTAS.find((x) => x.id === id)
    if (!p) return
    const enPausa = recorrido.current
    cerrarPregunta()
    quitarFoco()
    const idioma = idiomaRef.current
    recordar(q)
    hilo.current = [...hilo.current, { role: "user", content: q }, { role: "assistant", content: p.respuesta[idioma] }]
    const frase = p.respuesta[idioma]
    tiempos.dato("tipo", "faq")
    tiempos.dato("faq", id)
    const dicha = await hablar(frase, null)
    tiempos.marcar("fin")
    tiempos.cerrar(dicha ? "ok" : "interrumpida")
    if (!dicha) return
    void volverAlGuion(enPausa, espera)
  }
  /**
   * Una frase dicha: el API la transcribe y busca la pregunta frecuente parecida (dos líneas, en ese orden). Con el
   * texto se prueba primero lo que EVA espera (./escucha.ts: «siguiente», una misión, la respuesta…), sin esperar a
   * la segunda línea; si no es eso, contesta la pregunta frecuente grabada o, si no hay ninguna, la IA con un puente.
   */
  const alOirFrase = async (wav: Blob, info?: FraseOida) => {
    const espera = preguntaRef.current
    if (!espera || espera === "idioma") return
    const idioma = idiomaRef.current
    // Tiempos (./tiempos.ts): el instante 0 es cuando terminó de hablar, antes del silencio que espera el VAD.
    tiempos.empezar("voz", idioma, info?.vadMs ?? 0)
    tiempos.marcar("vad")
    if (info) {
      tiempos.dato("hablaMs", info.hablaMs)
      tiempos.dato("audioKB", info.audioKB)
      tiempos.dato("audio", info.audio)
    }
    let texto = ""
    let resuelto = false
    try {
      await entenderVoz(wav, idioma, (e) => {
        if (e.t === "oido") {
          tiempos.marcar("oido")
          tiempos.dato("oidoServidorMs", e.ms)
          texto = e.texto.trim()
          // Su propia voz colándose por los parlantes: se ignora.
          const hablando = fraseActual.current.hasta === Infinity
          const eco = Date.now() < fraseActual.current.hasta && esEco(texto, fraseActual.current.frase) && (hablando || texto.split(/\s+/).length >= 3)
          if (!texto || eco) {
            texto = ""
            tiempos.dato("tipo", "ignorado")
            tiempos.cerrar(texto ? "su propio eco" : "nada que oír")
            return
          }
          tiempos.pregunta(texto)
          tiempos.dato("palabras", texto.split(/\s+/).length)
          setOido(texto)
          const r = entenderFrase(texto, espera as QueEspera, opcionesDe(espera))
          if (r.tipo === "nada") return
          resuelto = true
          tiempos.dato("tipo", r.tipo === "orden" ? `orden:${r.orden}` : r.tipo) // lo resuelve el navegador, sin IA
          tiempos.cerrar()
          if (r.tipo === "nombre") void alNombre(undefined, r.nombre)
          else if (r.tipo === "opcion") {
            if (espera === "oferta") void alOferta(OFERTA[r.k]?.id ?? null)
            else if (espera === "camino") {
              const c = opcionesDelPaso()[r.k]
              if (c) void alCamino(c.id)
            }
            else if (espera === "repaso") void alRepaso(r.k)
          } else if (r.orden === "siguiente") void alPaso(true)
          else if (r.orden === "repetir") void repetirPaso()
          else if (espera === "oferta") void alOferta(null)
          else callarEnPaso()
        } else if (e.t === "parecida" && texto && !resuelto) {
          resuelto = true
          tiempos.marcar("parecida")
          if (e.id) void contestarGrabada(e.id, texto, espera)
          else if (texto.split(/\s+/).length >= 3) void responder(texto, "voz")
          else {
            tiempos.dato("tipo", "corta")
            tiempos.cerrar("no entendió")
            setOido(`${texto} · ${TEXTOS[idioma].noEntendi}`)
          }
        }
      })
    } catch {
      tiempos.cerrar("error") // sin red o sin voz: quedan los botones
    }
  }
  alOirFraseRef.current = alOirFrase
  encenderManosRef.current = encenderManos

  /** Contestaron el nombre (o lo saltaron). Un nombre con tilde («José») no cambia el idioma elegido; pedirlo, sí. */
  const alNombre = async (ev?: FormEvent, dicho?: string) => {
    ev?.preventDefault()
    const crudo = (dicho ?? nombre).trim()
    setNombre("")
    cerrarPregunta()
    const n = nombreDe(crudo)
    if (n) recordarNombre(n)
    const i = pideOtroIdioma(crudo, idiomaRef.current)
    if (i) await reconfigurar(i)
    await preguntar(TEXTOS[idiomaRef.current].oferta(n), "oferta")
  }

  /** Una sugerencia del panel: si es una acción, EVA la hace ella misma (sin IA) y lo dice; si es una pregunta, va a la IA. */
  const alSugerencia = async (s: Sugerencia) => {
    if (!s.accion) return enviar(null, s.texto[idiomaRef.current])
    terminarRecorrido()
    cerrarPregunta()
    quitarFoco()
    tomarTurno()
    ocupada.current = true
    const hecho = await ejecutarAccion(s.accion, (destino) => navegar(destino))
    const dicho = hecho && s.dicho ? s.dicho[idiomaRef.current] : ""
    // Queda en la conversación: si después le preguntan a la IA, sabe lo que se hizo.
    hilo.current = [...hilo.current, { role: "user", content: s.texto[idiomaRef.current] }, { role: "assistant", content: dicho || "…" }]
    if (dicho) await hablar(dicho, null)
    else {
      setEstado("reposo")
      ocupada.current = false
    }
  }
  /**
   * Una pregunta de la persona (escrita en su panel, sugerida o hecha en medio de un recorrido): la contesta la IA,
   * con la voz en vivo. Es lo único que no se puede grabar de antemano. Si EVA estaba comentando la pantalla, se calla
   * y atiende. Si estaba en un recorrido, el recorrido queda en pausa y, al terminar de contestar, EVA vuelve a
   * esperar en el mismo paso: el guion sigue donde iba.
   */
  // Para que no quede en silencio mientras la IA piensa (pedido de Manuel, 2026-11-15): al instante, un murmullo
  // grabado («Mmm, let's see.», PUENTES); en inglés, si la respuesta no está a ~1 s, el eco del API, que nombra el tema
  // con sus palabras clave («Ah, the distance between the Earth and the Moon.»: packages/shared/src/eco.ts); luego la
  // respuesta. Si a los RESCATE_MS no empezó, una frase grabada (RESCATE) para que el silencio no parezca un cuelgue.
  const responder = async (q: string, origen: tiempos.Origen = "texto") => {
    // Tiempos: la voz ya abrió su registro al oír la frase; lo escrito o sugerido lo abre aquí.
    if (!tiempos.hayRegistro()) tiempos.empezar(origen, idiomaRef.current)
    tiempos.dato("tipo", "ia")
    tiempos.pregunta(q)
    const enPausa = recorrido.current
    const esperaba = preguntaRef.current
    cerrarPregunta()
    if (!enPausa) quitarFoco()
    tomarTurno() // se calla ya, antes de mirar si pide otro idioma
    ocupada.current = true
    // El idioma elegido se mantiene aunque le escriban en el otro; solo cambia si lo piden (ver pideOtroIdioma).
    const i = pideOtroIdioma(q, idiomaRef.current)
    if (i) await reconfigurar(i)
    const { mio, corte } = tomarTurno()
    ocupada.current = true
    recordar(q)
    hilo.current = [...hilo.current, { role: "user", content: q }]
    usarAsistente("educational")
    setEstado("pensando")
    mostrar("…")
    const ctx = await audioListo()
    if (turno.current !== mio) return tiempos.cerrar("interrumpida")
    const conVoz = !silencioRef.current && !!ctx && ctx.state === "running"
    tiempos.dato("conVoz", conVoz)
    // Qué es cada frase de la cola, para saber cuándo suena cada cosa (lo que no está aquí es el murmullo o el rescate).
    const tipoDe = new WeakMap<object, "eco" | "respuesta">()
    const cola = conVoz
      ? crearColaDeVoz({
          ctx,
          asistente: "educational",
          alHablar: mostrar,
          alNivel: (v) => (nivel.current = v),
          alEmpezar: () => setEstado("hablando"),
          respetarPuntuacion: true,
          alAgendar: (f, empieza) => {
            const tipo = tipoDe.get(f)
            tiempos.marcar(tipo === "eco" ? "ecoSuena" : tipo === "respuesta" ? "respuestaSuena" : "murmullo", empieza)
          },
        })
      : null
    const callar = () => void cola?.detener()
    corte.signal.addEventListener("abort", callar)
    let escrito = ""
    // Qué sonó justo antes de la próxima frase de la IA: decide la pausa (PAUSA).
    let antesSono: "murmullo" | "eco" | "frase" = "murmullo"
    let esEco = false
    // El murmullo suena primero; el eco y las frases de la IA se encolan detrás, en orden.
    let antes: Promise<unknown> = Promise.resolve()
    let rescate: ReturnType<typeof setTimeout> | undefined
    if (cola) {
      setEstado("hablando")
      antes = decirGuion(otroPuente(PUENTES[idiomaRef.current]), idiomaRef.current, cola, corte.signal, PAUSA.frase).catch(() => 0)
      rescate = setTimeout(() => {
        if (escrito || corte.signal.aborted) return
        tiempos.marcar("rescate")
        antes = antes.then(() => decirGuion(RESCATE[idiomaRef.current], idiomaRef.current, cola, corte.signal)).catch(() => 0)
      }, RESCATE_MS)
    }
    let frases = 0
    tiempos.marcar("pedido")
    try {
      await turnoDeVoz(
        hilo.current,
        (e) => {
          if (e.t === "texto") {
            tiempos.marcar("primerTexto")
            escrito += e.d
            if (!conVoz) {
              setEstado("hablando")
              mostrar(escrito)
            }
          } else if (e.t === "eco") {
            esEco = true
            tiempos.marcar("ecoLlega")
          } else if (e.t === "frase") {
            tipoDe.set(e, esEco ? "eco" : "respuesta")
            if (!esEco) {
              tiempos.marcar("respuestaLlega")
              frases++
            }
            fraseActual.current = { frase: escrito, hasta: Infinity }
            const pausa = antesSono === "murmullo" ? PAUSA.pensar() : antesSono === "eco" ? PAUSA.idea() : PAUSA.frase()
            antesSono = esEco ? "eco" : "frase"
            esEco = false
            antes = antes.then(() => cola?.agregar(e, pausa))
          } else if (e.t === "fin") {
            escrito = e.respuesta
            // Lo que midió el servidor (desde que le llegó el pedido): ver turnoDeVoz en apps/api/src/z6.ts.
            tiempos.dato("servidorMs", e.ms)
            tiempos.dato("servidorPrimeraVozMs", e.primeraVozMs)
            for (const [k, v] of Object.entries(e.tiempos ?? {})) tiempos.dato(`servidor_${k}`, v)
          } else if (e.t === "error") throw new Error(e.msg)
        },
        corte.signal,
        undefined,
        conVoz, // el eco solo tiene sentido si EVA habla
      )
      await antes
      await cola?.terminada()
      tiempos.marcar("fin")
      tiempos.dato("frases", frases)
      tiempos.dato("respuestaCaracteres", escrito.length)
      tiempos.cerrar(corte.signal.aborted ? "interrumpida" : "ok")
      fraseActual.current = { frase: escrito, hasta: Date.now() + 2500 }
      if (!corte.signal.aborted) mostrar(escrito)
    } catch {
      tiempos.cerrar(corte.signal.aborted ? "interrumpida" : "error")
      if (!corte.signal.aborted) {
        escrito = ""
        mostrar(TEXTOS[idiomaRef.current].sinSenal)
        setEstado("cansada")
        await esperar(2500, corte.signal)
      }
    } finally {
      clearTimeout(rescate)
      corte.signal.removeEventListener("abort", callar)
      cola?.cerrar()
      nivel.current = 0
    }
    if (escrito) hilo.current = [...hilo.current, { role: "assistant", content: escrito }]
    if (turno.current !== mio) return // otra frase u otra pregunta tomó la palabra
    setEstado("reposo")
    finHabla.current = Date.now()
    if (!escrito) mostrar(TEXTOS[idiomaRef.current].sinSenal)
    void volverAlGuion(enPausa, esperaba)
  }
  // Escribirle en su panel, o tocar una pregunta sugerida (`directo`, que no pasa por el campo de texto).
  const enviar = async (ev: FormEvent | null, directo?: string) => {
    ev?.preventDefault()
    const q = (directo ?? texto).trim()
    if (!q) return
    setTexto("")
    await responder(q, directo ? "sugerencia" : "texto")
  }

  // Arrastrarla; un toque sin arrastre abre o cierra el panel (o la enciende, si está apagada).
  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { dx: e.clientX - pos.current.x, dy: e.clientY - pos.current.y, x0: e.clientX, y0: e.clientY, movio: false }
  }
  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current
    if (!a) return
    if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 6) a.movio = true
    if (!a.movio) return
    const x = Math.max(0, Math.min(innerWidth - ANCHO, e.clientX - a.dx))
    const y = Math.max(0, Math.min(innerHeight - ALTO, e.clientY - a.dy))
    vel.current = { x: x - pos.current.x, y: y - pos.current.y }
    pos.current = { x, y }
    meta.current = { x, y }
  }
  const tocar = () => {
    if (dormida.current) void despertar()
    else {
      setAbierta((v) => !v)
      if (globo) clearTimeout(ocultarGlobo.current)
    }
  }
  const alSoltar = () => {
    const a = arrastre.current
    arrastre.current = null
    if (!a) return
    if (a.movio) anclada.current = Date.now() + ANCLA_MS
    else tocar()
  }

  if (oculta) return null

  // El globo y el panel van hacia el lado con más espacio, según a dónde va (no dónde está). Mientras apunta, hacia
  // el lado contrario a lo que señala (./colocarse.ts). Y si quedó muy arriba, el globo se abre hacia abajo.
  const aLaDerecha = ladoGlobo.current ? ladoGlobo.current === "derecha" : meta.current.x < innerWidth / 2
  const alta = meta.current.y < 160
  // El panel se abre hacia donde hay más sitio, arriba o abajo de ella, y nunca mide más que ese sitio (si no cabe
  // todo, se desplaza por dentro): así su cabecera no queda fuera de la ventana cuando EVA está alta.
  const sitioArriba = meta.current.y + ALTO * 0.6 - MARGEN
  const sitioAbajo = innerHeight - (meta.current.y + ALTO * 0.3) - MARGEN
  const panelAbajo = sitioAbajo > sitioArriba
  return (
    <>
      {/*
        El rayo con el que apunta: dos haces finos que salen de sus ojos y se juntan en lo que señala. Esa parte queda
        encerrada en un cerco que parpadea y el resto de la pantalla se oscurece un poco. Todo va en una capa que no
        recibe clics.
      */}
      {apuntando && (
        <div ref={alMontarRayo} className="eva-rayos" aria-hidden="true">
          {/* Debajo de EVA: el velo y el cerco de lo que señala. */}
          <svg className="eva-rayo eva-rayo--fondo">
            <path className="eva-rayo__velo" fillRule="evenodd" />
            <rect className="eva-rayo__destello" rx="8" />
            <rect className="eva-rayo__marco" rx="8" />
            <path className="eva-rayo__cerco" />
          </svg>
          {/* Encima de EVA: los haces, para que se vean salir de sus ojos. */}
          <svg className="eva-rayo eva-rayo--haces">
            <defs>
              {[0, 1].map((k) => (
                <linearGradient key={k} id={`eva-rayo-tinte-${k}`} gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#d9f1ff" />
                  <stop offset="0.3" stopColor="#9ad7ff" />
                  <stop offset="1" stopColor="#c8102e" />
                </linearGradient>
              ))}
            </defs>
            {[0, 1].map((k) => (
              <g key={k} className="eva-rayo__ojo">
                <path data-ojo={k} className="eva-rayo__halo" />
                <path data-ojo={k} className="eva-rayo__haz" pathLength={1} stroke={`url(#eva-rayo-tinte-${k})`} />
                <path data-ojo={k} className="eva-rayo__pulso" pathLength={1} />
                <circle className="eva-rayo__brillo" r="2.3" />
                <circle className="eva-rayo__punta" r="2.2" />
              </g>
            ))}
            <circle className="eva-rayo__onda" r="5" />
          </svg>
        </div>
      )}
      <div ref={caja} className={`eva-caja${aLaDerecha ? " eva-caja--derecha" : ""}${alta ? " eva-caja--alta" : ""}${casco ? " eva-caja--casco" : ""}`} style={{ width: ANCHO, height: ALTO }} data-estado={estado}>
        <div
          className="eva-cuerpo"
          role="button"
          tabIndex={0}
          aria-label={estado === "apagada" ? T.apagada : abierta ? T.cerrar : T.abrir}
          aria-expanded={abierta}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && tocar()}
        >
          <Suspense fallback={null}>
            <EvaLienzo estado={estado} nivel={nivel} velocidad={vel} mirar={mirar} ojos={ojos} holograma={!!casco} />
          </Suspense>
        </div>

        {globo && !abierta && !pregunta && (
          <p className="eva-globo" aria-live="polite">
            {globo}
          </p>
        )}

        {/* Una pregunta suya: el globo se queda abierto con el campo o los botones para contestar. */}
        {pregunta && !abierta && (
          <div className="eva-globo eva-globo--pregunta">
            {/* El riel del flujo: las etapas en orden, la actual con su nombre. */}
            {riel && (pregunta === "paso" || pregunta === "camino" || pregunta === "repaso") && (
              <div className="eva-riel">
                <ol aria-label={T.etapas}>
                  {ETAPAS.map((e, k) => (
                    <li key={e.en} data-estado={k + 1 < riel.etapa ? "hecha" : k + 1 === riel.etapa ? "actual" : "falta"} aria-current={k + 1 === riel.etapa ? "step" : undefined} title={e[idioma]}>
                      <b>{k + 1}</b>
                      {k + 1 === riel.etapa && <span>{e[idioma]}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <p aria-live="polite">{globo}</p>
            {manos && pregunta !== "idioma" && oidoEva.estado !== "apagado" && (
              <p className="eva-escucha" data-estado={oidoEva.estado}>
                <i aria-hidden="true" />
                <span>
                  {oidoEva.estado === "oyendo" ? T.teOigo : T.escuchando} · {PISTAS[idioma][pregunta]}
                </span>
                {oido && <span className="eva-escucha__oido">«{oido}»</span>}
              </p>
            )}
            {pregunta === "idioma" ? (
              <div className="eva-pregunta eva-pregunta--idioma">
                <button type="button" lang="en" onClick={() => void alIdioma("en")}>
                  English
                </button>
                <button type="button" lang="es" onClick={() => void alIdioma("es")}>
                  Español
                </button>
              </div>
            ) : pregunta === "nombre" ? (
              <form className="eva-pregunta" onSubmit={(e) => void alNombre(e)}>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={T.tuNombre} aria-label={T.tuNombre} maxLength={40} autoComplete="given-name" />
                <button type="submit">{T.ok}</button>
                <button type="button" className="eva-pregunta__suave" onClick={() => void alNombre()}>
                  {T.saltar}
                </button>
              </form>
            ) : pregunta === "camino" ? (
              <div className="eva-pregunta eva-pregunta--lista">
                {opcionesDelPaso().map((c) => (
                  <button key={c.id} type="button" data-elegida={elegida === c.id || undefined} disabled={!!elegida} onClick={() => void alCamino(c.id)}>
                    {c.boton[idioma]}
                  </button>
                ))}
              </div>
            ) : pregunta === "repaso" ? (
              <div className="eva-pregunta eva-pregunta--lista">
                {recorrido.current?.r.pasos[recorrido.current.i].repaso?.opciones.map((o, k) => (
                  <button key={o.en} type="button" onClick={() => void alRepaso(k)}>
                    {o[idioma]}
                  </button>
                ))}
              </div>
            ) : pregunta === "paso" ? (
              <>
                {/* Solo «Next»: en el flujo las etapas no se saltan ni se dejan a medias con un botón. */}
                <div className="eva-pregunta">
                  <button type="button" onClick={() => void alPaso(true)}>
                    {T.siguiente} · {avance}
                  </button>
                </div>
                {/* Preguntarle en medio del recorrido: contesta la IA y el recorrido sigue en este paso. */}
                <form className="eva-pregunta eva-pregunta--duda" onSubmit={(e) => void alDecirEnPaso(e)}>
                  <input value={duda} onChange={(e) => setDuda(e.target.value)} placeholder={T.duda} aria-label={T.dudaRotulo} maxLength={300} />
                  <button type="submit" className="eva-pregunta__suave" disabled={!duda.trim()}>
                    {T.preguntar}
                  </button>
                </form>
              </>
            ) : (
              <div className="eva-pregunta eva-pregunta--quien">
                {OFERTA.map((o) => (
                  <button key={o.id} type="button" data-elegida={elegida === o.id || undefined} disabled={!!elegida} onClick={() => void alOferta(o.id)}>
                    {o.boton[idioma]}
                  </button>
                ))}
                <button type="button" className="eva-pregunta__suave" disabled={!!elegida} onClick={() => void alOferta(null)}>
                  {T.no}
                </button>
              </div>
            )}
          </div>
        )}

        {abierta && (
          <div
            className={`eva-panel${panelAbajo ? " eva-panel--abajo" : ""}`}
            style={{ maxHeight: Math.max(240, panelAbajo ? sitioAbajo : sitioArriba) }}
            role="dialog"
            aria-label={T.panel}
          >
            <header className="eva-panel__cabeza">
              <span className="eva-panel__nombre">{T.titulo}</span>
              <button type="button" className="eva-panel__icono" onClick={() => void reconfigurar(idioma === "es" ? "en" : "es")}>
                {T.otroIdioma}
              </button>
              <button
                type="button"
                className="eva-panel__icono"
                aria-pressed={silencio}
                title={silencio ? T.vozNoTitulo : T.vozSiTitulo}
                onClick={() => {
                  escribir(SILENCIO, silencio ? "0" : "1")
                  setSilencio(!silencio)
                  if (!silencio) habla.current?.abort()
                }}
              >
                {silencio ? T.vozNo : T.vozSi}
              </button>
              <button type="button" className="eva-panel__icono" onClick={() => setAbierta(false)} aria-label={T.cerrar}>
                ×
              </button>
            </header>
            {globo && <p className="eva-panel__respuesta" aria-live="polite">{globo}</p>}
            {voz.error && <p className="eva-panel__error">{voz.error}</p>}
            <div className="eva-panel__sugerencias">
              {sugerenciasDe(pathname, paginaDelMarco()).map((s) => (
                <button key={s.texto.en} type="button" onClick={() => void alSugerencia(s)}>
                  {s.texto[idioma]}
                </button>
              ))}
            </div>
            <form className="eva-panel__form" onSubmit={(e) => void enviar(e)}>
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={T.pregunta} aria-label={T.preguntaRotulo} autoFocus />
              <button type="submit" disabled={!texto.trim()}>
                {T.preguntar}
              </button>
            </form>
            <div className="eva-panel__acciones">
              <button type="button" className={conversando ? "eva-boton eva-boton--activo" : "eva-boton"} onClick={() => (conversando ? voz.terminar() : voz.tocar())}>
                {conversando ? T.callar : T.hablar}
              </button>
              <button
                type="button"
                className="eva-boton"
                onClick={() => {
                  setAbierta(false)
                  abiertaRef.current = false
                  void preguntar(T.quien, "oferta")
                }}
              >
                {T.recorrido}
              </button>
              <button
                type="button"
                className="eva-boton eva-boton--suave"
                onClick={() => {
                  escribir(DICHAS, "[]")
                  ultimo.current = 0
                  setAbierta(false)
                }}
              >
                {T.repetir}
              </button>
              <button
                type="button"
                className="eva-boton eva-boton--suave"
                title={T.olvidarTitulo}
                onClick={() => {
                  olvidar()
                  hilo.current = []
                  mostrar(T.olvide)
                }}
              >
                {T.olvidar}
              </button>
            </div>
            <p className="eva-panel__nota">{T.nota}</p>
          </div>
        )}
      </div>
    </>
  )
}
