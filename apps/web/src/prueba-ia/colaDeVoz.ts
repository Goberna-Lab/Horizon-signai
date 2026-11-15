// Reproduce, una detrás de otra y sin cortes, las frases que llegan del turno de voz en streaming,
// y va revelando el texto palabra por palabra en el instante en que se pronuncia (tipo karaoke).
//
// Con un AudioContext corriendo: cada frase se decodifica y se agenda en la línea de tiempo del
// contexto (sin huecos entre frases). Si el navegador lo dejó suspendido, cae a <audio> en fila:
// suena igual, pero cada frase aparece entera al empezar a sonar.

export type Palabra = [texto: string, espacio: string, inicio: number, fin: number]
export type FraseDeVoz = { i: number; texto: string; mime: string; audio: string; palabras: Palabra[]; dur: number }

type Opciones = {
  ctx: AudioContext | null
  /** Texto pronunciado hasta ahora (crece palabra a palabra). */
  alHablar: (texto: string) => void
  /** Volumen de la voz, 0..1, para animar la Luna. */
  alNivel: (n: number) => void
  /** Se llama una vez, cuando empieza a sonar la primera frase. */
  alEmpezar: () => void
}

const aBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

export function crearColaDeVoz({ ctx, alHablar, alNivel, alEmpezar }: Opciones) {
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

  // fuente → analizador (mide el volumen de la voz) → ganancia (baja la voz si hablas encima) → parlantes
  const analizador = conWebAudio ? ctx!.createAnalyser() : null
  const ganancia = conWebAudio ? ctx!.createGain() : null
  if (analizador && ganancia) {
    analizador.fftSize = 512
    analizador.connect(ganancia)
    ganancia.connect(ctx!.destination)
  }
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

  const agendar = async (f: FraseDeVoz) => {
    const bytes = aBytes(f.audio)
    const buffer = await ctx!.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer)
    if (detenida) return
    const inicio = Math.max(ctx!.currentTime + 0.05, siguiente)
    siguiente = inicio + buffer.duration
    const fuente = ctx!.createBufferSource()
    fuente.buffer = buffer
    fuente.connect(analizador!)
    pendientes++
    fuente.onended = () => {
      pendientes--
      comprobarFin()
    }
    fuente.start(inicio)
    fuentes.push(fuente)
    for (const [texto, espacio, ini] of f.palabras) linea.push({ t: inicio + ini, texto: texto + espacio })
    if (!empezo) {
      empezo = true
      alEmpezar()
      raf = requestAnimationFrame(animar)
    }
  }

  const enFila = (f: FraseDeVoz) =>
    new Promise<void>((resolve) => {
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
        if (!empezo) {
          empezo = true
          alEmpezar()
        }
        hablado = `${hablado}${hablado ? " " : ""}${f.texto}`
        alHablar(hablado)
      }
      void a.play().catch(fin)
    })

  return {
    agregar(f: FraseDeVoz) {
      if (detenida) return
      if (conWebAudio) {
        decodificar = decodificar.then(() => agendar(f)).catch(() => {})
      } else {
        pendientes++
        fallbackCola = fallbackCola.then(() => enFila(f))
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
      analizador?.disconnect()
      ganancia?.disconnect()
      alNivel(0)
    },
  }
}
