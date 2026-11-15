// EVA: la asistente de voz de la nave durante el descenso (portada de nuestro simulador NASA). Habla en inglés.
// Voz de mujer, Kokoro-82M `af_heart`, en este orden:
//  · «eva» (por defecto): en la Z6 del equipo (POST /api/z6/eva, el API pone el token). Al arrancar se prueba con
//    «Ready.»: si responde audio, se usa; si no (hoy no existe), se genera en el navegador con kokoro-js en un worker
//    (evaVozWorker.ts; la primera vez baja el modelo, ~90 MB). Si la Z6 falla a mitad de sesión, también pasa al worker.
//  · «equipo»: si el worker no puede cargar, la API de voz del equipo (POST /api/z6/hablar, voz de hombre).
//  · «navegador»: si todo eso falla, la síntesis del sistema (voz femenina en inglés si la hay).
// Con voz generada nunca se cambia a otra voz por tardar, solo si falla de verdad. El subtítulo está oculto hasta que
// suena la frase y muestra solo la frase que se dice. Lo normal espera a tener todas las frases y suena de corrido; un
// peligro arranca con la primera. Timbre de EVA (vozEve) y su chirrido antes de hablar, en vez de radio y tonos Quindar.
// Cola con prioridades: lo urgente corta lo que esté diciendo; lo mismo (misma clave) no se repite antes de `cooldownS`.
// Antes del primer clic o tecla el navegador no deja sonar audio: la cola espera a ese gesto en vez de cambiar de voz.
// También pone los efectos del descenso (alarma, impacto, estática) sobre el mismo AudioContext.
// `?voz=equipo|navegador|apagada` fuerza otro modo; `?evavoz=af_bella` prueba otra voz de Kokoro.

const TTS_URL = "/api/z6/hablar"
const EVA_Z6_URL = "/api/z6/eva"
const CACHE_NAME = "eva-voz-v1"
/** Como mucho 2 pedidos a la vez: el servidor del equipo admite 4 en vuelo para todos sus usuarios. */
const MAX_EN_VUELO = 2
const TIMEOUT_API_MS = 9000
const TIMEOUT_Z6_MS = 8000
const COLA_MAX = 4

type Modo = "eva" | "equipo" | "navegador" | "apagada"
export type Prioridad = 0 | 1 | 2 // 0 info · 1 aviso · 2 peligro (corta lo que se esté diciendo)
type Audio = Promise<AudioBuffer | null> | null
type Turno = { text: string; prio: Prioridad; ps: string[]; audios: Audio[] }
type PedidoK = { text: string; bajo: boolean; ok: (b: ArrayBuffer | null) => void; ko: (e: Error) => void }
type RespuestaK = { id: number; wav?: ArrayBuffer | null; error?: string }

/** Se habla frase por frase: la primera suena mientras llegan las demás, y las frases fijas se reutilizan. */
export const partes = (t: string) =>
  t
    .split(/(?<=[.!?…])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)

// Respaldo: una voz femenina inglesa del sistema, si la hay.
const FEM =
  /female|\+f\d|samantha|zira|aria|jenny|ava|allison|susan|victoria|karen|moira|tessa|serena|fiona|libby|sonia|google us english|google uk english female/i

/** Lo que se lee en voz alta: símbolos y unidades en palabras (el subtítulo conserva el texto original). */
export function hablado(t: string) {
  return t
    .replace(/\s·\s/g, ", ")
    .replace(/·/g, ",")
    .replace(/(\d)\s?%/g, "$1 percent")
    .replace(/(\d)\s?°/g, "$1 degrees")
    .replace(/(\d)\s?m\/s/g, "$1 meters per second")
    .replace(/(\d)\s?km\b/g, "$1 kilometers")
    .replace(/(\d)\s?cm\b/g, "$1 centimeters")
    .replace(/(\d)\s?m\b/g, "$1 meters")
    .replace(/(\d)\s?s\b/g, "$1 seconds")
    .replace(/\bLM\b/g, "lander")
}

/** Caché permanente del audio (Cache Storage). Solo en contexto seguro (localhost o https). */
const abrirCache = (): Promise<Cache | null> | null =>
  typeof caches !== "undefined" && isSecureContext ? caches.open(CACHE_NAME).catch(() => null) : null

/* ── Timbre de EVA ────────────────────────────────────────────────────────────────────────────────────────
 * Robot original (no copia ninguna voz real): sobre la voz de base, brillo en los agudos, menos graves, un poco de
 * modulación en anillo (el brillo metálico) y un chirrido de dos notas antes de hablar, como un robot que «despierta».
 * El tono no se toca: subirlo vuelve la voz una ardilla. */
function vozEve(ctx: AudioContext, buf: AudioBuffer, dest: AudioNode, when: number, ringMix = 0.16) {
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 1.06 // un pelo más ágil
  const hp = ctx.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 260
  const pk = ctx.createBiquadFilter()
  pk.type = "peaking"
  pk.frequency.value = 1900
  pk.gain.value = 3
  pk.Q.value = 1.2
  const air = ctx.createBiquadFilter()
  air.type = "highshelf"
  air.frequency.value = 3800
  air.gain.value = 5
  const dry = ctx.createGain()
  dry.gain.value = 0.9
  const ring = ctx.createGain()
  ring.gain.value = 0
  const car = ctx.createOscillator()
  car.frequency.value = 140
  car.connect(ring.gain)
  const wet = ctx.createGain()
  wet.gain.value = ringMix
  src.connect(hp).connect(pk).connect(air)
  air.connect(dry).connect(dest)
  air.connect(ring).connect(wet).connect(dest)
  car.start(when)
  src.start(when)
  return {
    src,
    stop: () => {
      try {
        car.stop()
      } catch {
        /* ya paró */
      }
    },
  }
}

/** Chirrido de dos notas antes de hablar: sube y baja. En un aviso de peligro, más agudo y triple. */
function chirridoEve(ctx: AudioContext, dest: AudioNode, when: number, alerta = false) {
  const nota = (f0: number, f1: number, t: number, d: number, v: number) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = "sine"
    o.frequency.setValueAtTime(f0, when + t)
    o.frequency.exponentialRampToValueAtTime(f1, when + t + d)
    g.gain.setValueAtTime(0, when + t)
    g.gain.linearRampToValueAtTime(v, when + t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, when + t + d)
    o.connect(g).connect(dest)
    o.start(when + t)
    o.stop(when + t + d + 0.02)
  }
  if (alerta) {
    nota(1500, 2300, 0, 0.08, 0.06)
    nota(1500, 2300, 0.11, 0.08, 0.06)
    nota(2300, 1200, 0.22, 0.09, 0.05)
  } else {
    nota(900, 1700, 0, 0.11, 0.05)
    nota(1700, 1250, 0.13, 0.12, 0.045)
  }
}

export class Voz {
  private readonly el: HTMLDivElement
  private mode: Modo
  private readonly vozEva = new URLSearchParams(location.search).get("evavoz") ?? "af_heart"
  private readonly cache = abrirCache()
  private readonly synth: SpeechSynthesis | null = typeof speechSynthesis !== "undefined" ? speechSynthesis : null
  private readonly corte = new AbortController() // corta los pedidos en curso al desmontar
  private readonly audio = new Map<string, Promise<AudioBuffer | null>>() // frases ya pedidas (esta sesión)
  private readonly last = new Map<string, number>()
  private queue: Turno[] = []
  private busy = false
  private fallos = 0
  private turno = 0
  private enVuelo = 0
  private espera: (() => void)[] = []
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private src: AudioBufferSourceNode | null = null
  private srcStop: (() => void) | null = null
  private voice: SpeechSynthesisVoice | null = null
  private female = false
  private hideT = 0
  private guard = 0
  private disposed = false
  private noiseBuf: AudioBuffer | null = null
  private gesto: (() => void) | null = null
  // Z6: null mientras se prueba; después true (se usa) o false (se usa el worker)
  private z6: boolean | null = null
  private z6p: Promise<void> | null = null
  // Worker de Kokoro: una frase cada vez; lo que se dice ahora pasa delante de la precarga
  private w: Worker | null = null
  private kq: PedidoK[] = []
  private kid = 0
  private kbusy = false
  private kOk = false
  private readonly kwait = new Map<number, PedidoK>()

  constructor(host: HTMLElement) {
    const q = new URLSearchParams(location.search).get("voz")
    this.mode =
      q === "eva" || q === "equipo" || q === "navegador" || q === "apagada"
        ? q
        : typeof Worker !== "undefined"
          ? "eva"
          : "equipo"
    const el = (this.el = document.createElement("div"))
    el.className = "eva-voz"
    el.hidden = true
    el.setAttribute("role", "status")
    el.innerHTML = '<i aria-hidden="true"><u></u><u></u><u></u><u></u><u></u></i><b>EVA</b><span></span>'
    host.append(el)
    this.pickVoice()
    this.synth?.addEventListener("voiceschanged", this.pickVoice)
    // Los navegadores no dejan sonar audio antes de un gesto: se intenta ya y otra vez con la primera tecla o clic
    this.unlock()
    window.addEventListener("pointerdown", this.unlock)
    window.addEventListener("keydown", this.unlock)
    if (this.mode === "eva") this.probarZ6()
  }

  get on() {
    return this.mode !== "apagada"
  }

  /** Hablando o con algo en cola (la personalidad no comenta encima de otra frase). */
  get ocupada() {
    return this.busy || this.queue.length > 0
  }

  private pickVoice = () => {
    const en = (this.synth?.getVoices() ?? []).filter((v) => /^en/i.test(v.lang))
    this.voice = en.find((v) => FEM.test(v.name)) ?? en.find((v) => /en-US/i.test(v.lang)) ?? en[0] ?? null
    this.female = !!this.voice && FEM.test(this.voice.name)
  }

  private unlock = () => {
    if (this.disposed) return
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      const ctx = (this.ctx = new AC())
      this.out = ctx.createGain()
      this.out.connect(ctx.destination)
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {})
  }

  private get audioOk() {
    return this.ctx?.state === "running" && !!this.out
  }

  /* ── Backends de la voz de EVA ── */

  /** ¿Está EVA en la Z6? Una frase corta de prueba: si responde audio, se usa la Z6; si no, la voz en el navegador. */
  private probarZ6() {
    this.z6p = this.pedirZ6("Ready.").then(
      () => {
        this.z6 = true
      },
      () => {
        this.z6 = false
        this.arrancarWorker()
      },
    )
  }

  private pedirZ6(texto: string) {
    return new Promise<void>((ok) => this.reservar(ok)).then(() =>
      fetch(EVA_Z6_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, voz: this.vozEva, formato: "wav" }),
        signal: AbortSignal.any([this.corte.signal, AbortSignal.timeout(TIMEOUT_Z6_MS)]),
      })
        .then((r) => {
          if (!r.ok || !/audio/.test(r.headers.get("content-type") ?? "")) throw new Error("z6 " + r.status)
          return r.arrayBuffer()
        })
        .finally(() => this.liberar()),
    )
  }

  /** Audio de EVA: de la Z6 si está; si falla a mitad, pasa al navegador para el resto de la sesión. */
  private audioEva(texto: string, bajo: boolean): Promise<ArrayBuffer | null> {
    return (this.z6p ?? Promise.resolve()).then(() =>
      this.z6
        ? this.pedirZ6(texto).catch(() => {
            if (this.disposed) throw new Error("desmontado")
            this.z6 = false
            this.arrancarWorker()
            return this.pedirK(texto, bajo)
          })
        : this.pedirK(texto, bajo),
    )
  }

  /** Arranca el worker de Kokoro y empieza a cargar el modelo. Si no puede, EVA pasa a la voz del equipo. */
  private arrancarWorker() {
    if (this.w || this.disposed) return
    try {
      this.w = new Worker(new URL("./evaVozWorker.ts", import.meta.url), { type: "module" })
    } catch {
      this.pasarAEquipo("no se pudo crear el worker")
      return
    }
    this.w.onmessage = ({ data }: MessageEvent<RespuestaK>) => {
      const r = this.kwait.get(data.id)
      this.kwait.delete(data.id)
      this.kbusy = false
      if (data.error && !this.kOk) {
        console.warn("EVA: Kokoro no cargó, uso la voz del equipo:", data.error)
        this.pasarAEquipo(data.error)
        return
      }
      if (data.error) r?.ko(new Error(data.error))
      else {
        this.kOk = true
        r?.ok(data.wav ?? null)
      }
      this.siguienteK()
    }
    this.w.onerror = (e) => console.warn("EVA: worker de voz", e.message)
    void this.pedirK("", true).catch(() => {}) // cargar el modelo ya, mientras empieza el descenso
  }

  private pasarAEquipo(motivo: string) {
    this.mode = "equipo"
    this.w?.terminate()
    this.w = null
    this.kbusy = false
    const e = new Error(motivo)
    for (const [, x] of this.kwait) x.ko(e)
    this.kwait.clear()
    for (const x of this.kq.splice(0)) x.ko(e)
  }

  /** Pide una frase al worker. Lo que EVA va a decir ahora pasa delante de la precarga. */
  private pedirK(text: string, bajo: boolean) {
    return new Promise<ArrayBuffer | null>((ok, ko) => {
      if (!this.w) return ko(new Error("sin worker"))
      const j: PedidoK = { text, bajo, ok, ko }
      if (bajo) this.kq.push(j)
      else this.ponerDelante(j)
      this.siguienteK()
    })
  }

  private ponerDelante(j: PedidoK) {
    const i = this.kq.findIndex((x) => x.bajo)
    if (i < 0) this.kq.push(j)
    else this.kq.splice(i, 0, j)
  }

  private siguienteK() {
    if (this.kbusy || !this.w || !this.kq.length) return
    const j = this.kq.shift()!
    const id = ++this.kid
    this.kbusy = true
    this.kwait.set(id, j)
    this.w.postMessage({ id, text: j.text, voice: this.vozEva })
  }

  /* ── Efectos del descenso ── */

  /** Tono sintetizado: `when` en segundos desde ahora; `slideTo`, frecuencia final (barrido). */
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", when = 0, slideTo?: number) {
    if (!this.audioOk || !this.ctx || !this.out) return
    const t = this.ctx.currentTime + when
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.008)
    g.gain.setValueAtTime(vol, t + dur - 0.02)
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(g).connect(this.out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** Ruido filtrado con caída exponencial. */
  private noise(dur: number, vol: number, type: BiquadFilterType, freq: number, q = 0.8) {
    if (!this.audioOk || !this.ctx || !this.out) return
    const ctx = this.ctx
    if (!this.noiseBuf) {
      const n = ctx.sampleRate * 2
      this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    }
    const t = ctx.currentTime
    const s = ctx.createBufferSource()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    s.buffer = this.noiseBuf
    s.loop = true
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    s.connect(f).connect(g).connect(this.out)
    s.start(t, Math.random())
    s.stop(t + dur + 0.05)
  }

  /** Alarma de programa del ordenador de guiado: tres pares de tonos. */
  programAlarm() {
    for (let i = 0; i < 3; i++) {
      this.tone(880, 0.14, 0.07, "square", i * 0.35)
      this.tone(660, 0.14, 0.07, "square", i * 0.35 + 0.16)
    }
  }

  /** Explosión de la nave, transmitida por el suelo y la estructura: golpe grave largo y retumbo. */
  boom() {
    this.noise(2.6, 0.5, "lowpass", 140, 0.7)
    this.tone(46, 1.6, 0.4, "sine", 0, 22)
    this.noise(0.4, 0.3, "bandpass", 700, 0.6)
  }

  /** Estática de radio al perder la señal. */
  staticNoise(dur = 0.7) {
    this.noise(dur, 0.09, "bandpass", 2300, 0.6)
  }

  /* ── Cola ── */

  private quitarGesto() {
    if (!this.gesto) return
    window.removeEventListener("pointerdown", this.gesto, true)
    window.removeEventListener("keydown", this.gesto, true)
    this.gesto = null
  }

  /** Corta lo que esté diciendo y vacía la cola. */
  stop() {
    this.turno++
    this.queue = []
    this.cut()
    this.busy = false
    this.el.hidden = true
  }

  /** Al desmontar el simulador: cola, audio, pedidos, worker, AudioContext y voz del navegador. */
  dispose() {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    clearTimeout(this.hideT)
    clearTimeout(this.guard)
    this.corte.abort()
    for (const sig of this.espera.splice(0)) sig() // salen y fallan con el pedido ya cortado
    this.pasarAEquipo("desmontado")
    window.removeEventListener("pointerdown", this.unlock)
    window.removeEventListener("keydown", this.unlock)
    this.quitarGesto()
    this.synth?.removeEventListener("voiceschanged", this.pickVoice)
    void this.ctx?.close().catch(() => {})
    this.ctx = this.out = null
    this.el.remove()
  }

  private cut() {
    try {
      this.synth?.cancel()
    } catch {
      /* sin voz */
    }
    try {
      this.src?.stop()
    } catch {
      /* ya paró */
    }
    this.srcStop?.()
    this.src = this.srcStop = null
  }

  /**
   * Audio de una frase, o null si falla. Tres capas para que no espere: memoria (esta sesión) → Cache Storage
   * (sesiones anteriores, permanente; la clave `af_heart|frase` es la misma para la Z6 y el navegador) → generarla.
   * `bajo`: precarga, que cede el paso a lo que se va a decir ahora.
   */
  private fetchFrase(frase: string, bajo = false): Audio {
    const local = this.mode === "eva"
    if (!(local || this.mode === "equipo") || this.fallos >= 3 || this.disposed) return null
    const k = (local ? this.vozEva + "|" : "") + frase
    const ya = this.audio.get(k)
    if (ya) {
      if (!bajo) {
        // Una frase precargada que ahora hace falta: se promociona en la cola del worker
        const j = this.kq.find((x) => x.bajo && x.text === hablado(frase))
        if (j) {
          j.bajo = false
          this.kq.splice(this.kq.indexOf(j), 1)
          this.ponerDelante(j)
        }
      }
      return ya
    }
    const clave = new Request(location.origin + "/eva-voz/" + encodeURIComponent(k))
    const guardar = (b: ArrayBuffer) => {
      void this.cache
        ?.then((c) => c?.put(clave, new Response(b.slice(0), { headers: { "Content-Type": "audio/wav" } })))
        .catch(() => {})
      return b
    }
    let contado = false
    const contar = (e: unknown): never => {
      // Se cuenta ya, antes de dar turno al siguiente: si no, las frases en espera salen igual contra una API caída
      if (!this.disposed) this.fallos++
      contado = true
      throw e
    }
    const red = (): Promise<ArrayBuffer> =>
      local
        ? this.audioEva(hablado(frase), bajo).then((b) => {
            if (!b) throw new Error("sin audio")
            return guardar(b)
          })
        : new Promise<void>((ok) => this.reservar(ok)).then(() => {
            // Si la API ya falló 3 veces mientras esta frase esperaba turno, no se pide: la voz del equipo está caída
            if (this.fallos >= 3 || this.disposed) {
              this.liberar()
              throw new Error("voz del equipo no disponible")
            }
            return fetch(TTS_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ texto: hablado(frase) }),
              signal: AbortSignal.any([this.corte.signal, AbortSignal.timeout(TIMEOUT_API_MS)]),
            })
              .then((r) => {
                if (!r.ok || !/audio/.test(r.headers.get("content-type") ?? "")) throw new Error("voz " + r.status)
                return r.arrayBuffer()
              })
              .then(guardar)
              .catch(contar)
              .finally(() => this.liberar())
          })
    const bytes = this.cache
      ? this.cache
          .then((c) => c?.match(clave))
          .catch(() => undefined) // solo un fallo de la caché pasa a la red (no un fallo de la red, que se pediría dos veces)
          .then((r) => r?.arrayBuffer() ?? red())
      : red()
    const p = bytes
      .then((b) => {
        this.unlock()
        if (!this.ctx) throw new Error("sin audio")
        return this.ctx.decodeAudioData(b)
      })
      .then((buf) => {
        this.fallos = 0
        return buf
      })
      .catch(() => {
        if (!this.disposed && !contado) this.fallos++
        this.audio.delete(k)
        return null
      })
    this.audio.set(k, p)
    if (this.audio.size > 80) this.audio.delete(this.audio.keys().next().value as string)
    return p
  }

  private reservar(ok: () => void) {
    if (this.enVuelo < MAX_EN_VUELO) {
      this.enVuelo++
      ok()
    } else this.espera.push(ok)
  }

  private liberar() {
    const sig = this.espera.shift()
    if (sig) sig()
    else this.enVuelo--
  }

  /** Frases que EVA dice siempre igual: se piden en segundo plano para que después suenen sin espera. */
  precargar(frases: readonly string[]) {
    if (this.mode !== "eva" && this.mode !== "equipo") return
    for (const f of frases) for (const x of partes(f)) void this.fetchFrase(x, true)
  }

  /** Suena con el timbre de EVA, tras su chirrido de robot si es la primera frase. */
  private play(buf: AudioBuffer, done: () => void, primera: boolean, alerta: boolean) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime + (primera ? 0.32 : 0.05)
    if (primera) chirridoEve(ctx, this.out!, ctx.currentTime, alerta)
    const { src, stop } = vozEve(ctx, buf, this.out!, t0)
    src.onended = () => {
      stop()
      if (this.src === src) this.src = this.srcStop = null
      done()
    }
    this.src = src
    this.srcStop = stop
  }

  /** key: para no repetir lo mismo antes de `cooldownS`. */
  say(text: string, { prio = 0, key = text, cooldownS = 45 }: { prio?: Prioridad; key?: string; cooldownS?: number } = {}) {
    if (this.disposed || !this.on) return
    const now = performance.now()
    const t = this.last.get(key)
    if (t && now - t < cooldownS * 1000) return
    this.last.set(key, now)
    if (prio >= 2) {
      this.queue = this.queue.filter((q) => q.prio >= 2)
      this.turno++
      this.cut()
      this.busy = false
    }
    const ps = partes(text)
    this.queue.push({ text, prio, ps, audios: ps.map((x) => this.fetchFrase(x)) }) // se piden ya, mientras espera
    this.queue.sort((a, b) => b.prio - a.prio)
    if (this.queue.length > COLA_MAX) this.queue.length = COLA_MAX // si se acumula, lo menos importante se descarta
    this.next()
  }

  private next() {
    if (this.disposed || this.busy || !this.queue.length) return
    // Con voz generada y el audio aún bloqueado: se espera al primer gesto en vez de cambiar de voz
    if ((this.mode === "eva" || this.mode === "equipo") && this.fallos < 3 && !this.audioOk) {
      if (!this.gesto) {
        this.gesto = () => {
          this.quitarGesto()
          this.unlock()
          window.setTimeout(() => this.next(), 120)
        }
        window.addEventListener("pointerdown", this.gesto, true)
        window.addEventListener("keydown", this.gesto, true)
      }
      return
    }
    const { text, prio, ps, audios } = this.queue.shift()!
    this.busy = true
    clearTimeout(this.hideT)
    const span = this.el.querySelector("span")!
    this.el.className = "eva-voz p" + prio
    span.textContent = text
    this.el.hidden = !!audios[0] // con voz generada, el subtítulo espera a que empiece a sonar
    const id = ++this.turno
    const done = () => {
      if (!this.busy || this.turno !== id) return
      this.busy = false
      clearTimeout(this.guard)
      this.hideT = window.setTimeout(() => {
        if (!this.busy) this.el.hidden = true
      }, 1600)
      window.setTimeout(() => this.next(), 250)
    }
    if (!audios[0]) {
      if (this.audioOk && this.ctx && this.out) chirridoEve(this.ctx, this.out, this.ctx.currentTime, prio >= 2)
      this.browser(text, done, 1200 + text.split(/\s+/).length * 330)
      return
    }
    // Frase por frase y siempre con la misma voz: nunca se cambia a la del navegador porque tarde, solo si falla.
    // El subtítulo muestra solo la frase que se está diciendo, y aparece a la vez que la voz, no antes.
    let i = 0
    const sigue = () => {
      if (this.turno !== id || !this.busy) return
      if (i >= audios.length) return done()
      void (audios[i] ?? Promise.resolve(null)).then((buf) => {
        if (this.turno !== id || !this.busy) return
        span.textContent = ps[i]
        this.el.hidden = false
        if (buf && this.audioOk) this.play(buf, () => (i++, sigue()), i === 0, prio >= 2)
        else {
          // falló esta frase: se lee y se sigue
          const ms = 900 + ps[i].split(/\s+/).length * 330
          i++
          window.setTimeout(sigue, ms)
        }
      })
    }
    // Para que suene de corrido, sin pausas mientras se genera la siguiente: se espera a tenerlas todas.
    // Un aviso de peligro no espera: arranca con la primera.
    if (prio >= 2) sigue()
    else void Promise.all(audios).then(sigue)
    this.guard = window.setTimeout(done, 60000) // por si algo se cuelga
  }

  private browser(text: string, done: () => void, fallbackMs: number) {
    clearTimeout(this.guard)
    const synth = this.synth
    if (this.mode !== "apagada" && synth && this.voice) {
      const u = new SpeechSynthesisUtterance(hablado(text))
      u.voice = this.voice
      u.lang = this.voice.lang
      u.rate = 1.03
      u.pitch = this.female ? 1.05 : 1.35 // si el sistema no trae voz femenina, se sube el tono
      u.onend = done
      u.onerror = done
      window.setTimeout(() => {
        if (this.disposed) return
        try {
          synth.speak(u)
        } catch {
          done()
        }
      }, 320) // tras el chirrido
      this.guard = window.setTimeout(done, fallbackMs + 6000) // por si el navegador nunca avisa del final
    } else this.guard = window.setTimeout(done, fallbackMs) // sin voz: el subtítulo queda el tiempo de leerlo
  }
}
