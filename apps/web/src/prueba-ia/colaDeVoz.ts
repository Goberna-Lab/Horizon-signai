import type { AssistantMode } from "@horizon-signai/shared"
import { entonarBuffer } from "./entonacion"
import { pausasDePuntuacion } from "./puntuacion"
import { PERSONAJES } from "./personajes"
import { crearVozRobot } from "./vozRobot"

// Reproduce, una detrás de otra y sin cortes, las frases que llegan del turno de voz en streaming,
// y va revelando el texto palabra por palabra en el instante en que se pronuncia (tipo karaoke).
//
// Con un AudioContext corriendo: cada frase se decodifica y se agenda en la línea de tiempo del
// contexto (sin huecos entre frases). Si el navegador lo dejó suspendido, cae a <audio> en fila:
// cada frase aparece entera al empezar a sonar, y sin la entonación ni el timbre robóticos (van por Web Audio).

export type Palabra = [texto: string, espacio: string, inicio: number, fin: number]
export type FraseDeVoz = { i: number; texto: string; mime: string; audio: string; palabras: Palabra[]; dur: number }

type Opciones = {
  ctx: AudioContext | null
  /** Quién habla: decide la entonación y el timbre (personajes.ts). */
  asistente: AssistantMode
  /** Texto pronunciado hasta ahora (crece palabra a palabra). */
  alHablar: (texto: string) => void
  /** Volumen de la voz, 0..1, para animar la Luna. */
  alNivel: (n: number) => void
  /** Se llama una vez, cuando empieza a sonar la primera frase. */
  alEmpezar: () => void
  /** Silencios en comas y puntos dentro de cada frase (ver pausasDePuntuacion). EVA los usa; /prueba-ia no. */
  respetarPuntuacion?: boolean
  /** Cada frase al quedar agendada: `empieza` es el performance.now() en que va a sonar (para medir tiempos). */
  alAgendar?: (f: FraseDeVoz, empieza: number) => void
}


const aBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

export function crearColaDeVoz({ ctx, asistente, alHablar, alNivel, alEmpezar, respetarPuntuacion = false, alAgendar }: Opciones) {
  const personaje = PERSONAJES[asistente]
  const conWebAudio = !!ctx && ctx.state === "running"
  const fuentes: AudioScheduledSourceNode[] = []
  const linea: { t: number; texto: string }[] = [] // cada palabra con su instante absoluto
  let siguiente = 0 // dónde empieza la próxima frase en la línea de tiempo
  let pendientes = 0
  let empezo = false
  let detenida = false
  let decodificar: Promise<void> = Promise.resolve() // decodifica en orden de llegada
  let alTerminar: (() => void) | null = null
  let raf = 0
  let fallbackAudio: HTMLAudioElement | null = null
  let fallbackCola: Promise<void> = Promise.resolve()
  let hablado = ""

  // fuente → robot (timbre de la asistente, si tiene) → analizador (mide el volumen) → ganancia (baja la voz si hablas encima) → parlantes
  const robot = conWebAudio && personaje.timbre ? crearVozRobot(ctx!, personaje.timbre) : null
  const analizador = conWebAudio ? ctx!.createAnalyser() : null
  const ganancia = conWebAudio ? ctx!.createGain() : null
  if (analizador && ganancia) {
    analizador.fftSize = 512
    robot?.salida.connect(analizador)
    analizador.connect(ganancia)
    ganancia.connect(ctx!.destination)
  }
  const entrada: AudioNode | null = robot?.entrada ?? analizador
  const datos = new Uint8Array(512)

  const comprobarFin = () => {
    if (pendientes === 0 && alTerminar) {
      alTerminar()
      alTerminar = null
    }
  }

  // Bucle de animación: revela las palabras cuyo instante ya pasó y mide el volumen.
  const animar = () => {
    if (detenida || !ctx) return
    const ahora = ctx.currentTime
    let texto = ""
    for (const p of linea) if (p.t <= ahora) texto += p.texto
    if (texto !== hablado) {
      hablado = texto
      alHablar(texto)
    }
    if (analizador) {
      analizador.getByteTimeDomainData(datos)
      let suma = 0
      for (const v of datos) suma += ((v - 128) / 128) ** 2
      alNivel(Math.min(1, Math.sqrt(suma / datos.length) * 5))
    }
    raf = requestAnimationFrame(animar)
  }

  // `pausa`: silencio (s) entre el final de la frase anterior y esta, si esta ya estaba lista. Si llega tarde, el
  // silencio de la espera ya hace de pausa y no se suma otro.
  const agendar = async (f: FraseDeVoz, pausa: number) => {
    const bytes = aBytes(f.audio)
    const crudo = await ctx!.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer)
    if (detenida) return
    // La melodía robótica de la asistente (una nota por palabra); misma duración: los tiempos no cambian.
    let buffer = crudo
    if (personaje.entonacion) {
      try {
        buffer = entonarBuffer(ctx!, crudo, personaje.entonacion, f.palabras.map(([, , ini, fin]) => [ini, fin]))
      } catch (e) {
        console.warn("[voz] sin entonación:", e)
      }
    }
    const inicio = Math.max(ctx!.currentTime + 0.05, siguiente > 0 ? siguiente + pausa : 0)
    // La frase en tramos separados por los silencios de la puntuación (uno solo si no hay cortes).
    const cortes = respetarPuntuacion ? pausasDePuntuacion(f.palabras, buffer.duration) : []
    const bordes = [0, ...cortes.map((c) => c.t), buffer.duration]
    let corrido = 0 // silencio acumulado antes del tramo
    for (let j = 0; j < bordes.length - 1; j++) {
      if (j > 0) corrido += cortes[j - 1]!.silencio
      const fuente = ctx!.createBufferSource()
      fuente.buffer = buffer
      fuente.connect(entrada!)
      pendientes++
      fuente.onended = () => {
        pendientes--
        comprobarFin()
      }
      fuente.start(inicio + bordes[j]! + corrido, bordes[j]!, bordes[j + 1]! - bordes[j]!)
      fuentes.push(fuente)
    }
    siguiente = inicio + buffer.duration + corrido
    alAgendar?.(f, performance.now() + (inicio - ctx!.currentTime) * 1000)
    // Cada palabra se corre lo que suman los silencios que tiene antes.
    const desfase = (t: number) => cortes.reduce((s, c) => (c.t <= t ? s + c.silencio : s), 0)
    // La última palabra de una frase llega sin espacio detrás: sin esto se leía «North Pole.The».
    const separar = linea.length > 0 && !/\s$/.test(linea[linea.length - 1].texto)
    f.palabras.forEach(([texto, espacio, ini], k) =>
      linea.push({ t: inicio + ini + desfase(ini), texto: (k === 0 && separar ? " " : "") + texto + espacio }),
    )
    if (!empezo) {
      empezo = true
      alEmpezar()
      raf = requestAnimationFrame(animar)
    }
  }

  const enFila = (f: FraseDeVoz, pausa: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, empezo ? pausa * 1000 : 0)).then(() => new Promise<void>((resolve) => {
      if (detenida) return resolve()
      const url = URL.createObjectURL(new Blob([aBytes(f.audio)], { type: f.mime }))
      const a = new Audio(url)
      fallbackAudio = a
      const fin = () => {
        URL.revokeObjectURL(url)
        pendientes--
        comprobarFin()
        resolve()
      }
      a.onended = fin
      a.onerror = fin
      a.onplay = () => {
        alAgendar?.(f, performance.now())
        if (!empezo) {
          empezo = true
          alEmpezar()
        }
        hablado = `${hablado}${hablado ? " " : ""}${f.texto}`
        alHablar(hablado)
      }
      void a.play().catch(fin)
    }))

  return {
    /** `pausa` (s): silencio antes de esta frase si viene pegada a la anterior (EVA las usa para sonar menos apurada). */
    agregar(f: FraseDeVoz, pausa = 0) {
      if (detenida) return
      if (conWebAudio) {
        decodificar = decodificar.then(() => agendar(f, pausa)).catch(() => {})
      } else {
        pendientes++
        fallbackCola = fallbackCola.then(() => enFila(f, pausa))
      }
    },
    /** Resuelve cuando terminó de sonar todo lo agregado (llamar después del último agregar). */
    async terminada() {
      await decodificar
      await fallbackCola
      if (pendientes === 0) return
      await new Promise<void>((r) => (alTerminar = r))
    },
    /** Corta en seco (interrupción) y devuelve lo que alcanzó a decir. */
    detener() {
      detenida = true
      cancelAnimationFrame(raf)
      for (const f of fuentes) {
        try {
          f.stop()
        } catch {
          /* ya terminó */
        }
      }
      fallbackAudio?.pause()
      robot?.cerrar()
      analizador?.disconnect()
      ganancia?.disconnect()
      pendientes = 0
      comprobarFin()
      alNivel(0)
      return hablado
    },
    /** Texto pronunciado hasta ahora. */
    hablado: () => hablado,
    /** Lo que pronunció en los últimos `segundos` (para reconocer su propio eco en el micrófono). */
    dichoDesde(segundos: number) {
      if (!ctx || !conWebAudio) return hablado.slice(-300) // <audio> en fila: sin tiempos por palabra
      const ahora = ctx.currentTime
      return linea.filter((p) => p.t <= ahora && p.t >= ahora - segundos).map((p) => p.texto).join("")
    },
    /** Volumen de la voz (0..1), con una rampa corta para que no chasquee. */
    volumen(v: number) {
      if (ganancia && ctx) ganancia.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
      else if (fallbackAudio) fallbackAudio.volume = v
    },
    cerrar() {
      cancelAnimationFrame(raf)
      robot?.cerrar()
      analizador?.disconnect()
      ganancia?.disconnect()
      alNivel(0)
    },
  }
}
