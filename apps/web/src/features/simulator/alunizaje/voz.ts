// EVA: la asistente de voz de la nave durante el descenso (portada de nuestro simulador NASA). Habla en inglés.
// Voz: primero la API del equipo (POST /api/z6/hablar → WAV, mismo origen), que suena por la radio con un filtro
// robótico hecho con Web Audio; si tarda más de 3 s o falla, la síntesis del navegador en inglés.
// Siempre muestra lo que dice como subtítulo, por si no hay voz o el sonido está apagado. Cola con prioridades: lo
// urgente corta lo que esté diciendo; lo mismo (misma clave) no se repite antes de su `cooldownS`.
// `?voz=navegador` usa solo la voz del navegador; `?voz=apagada`, solo subtítulos.

const TTS_URL = "/api/z6/hablar"
const CACHE_NAME = "eva-voz-v1"
/** Como mucho 2 pedidos a la vez: el servidor del equipo admite 4 en vuelo para todos sus usuarios. */
const MAX_EN_VUELO = 2
const ESPERA_API_MS = 3000
const TIMEOUT_API_MS = 9000

type Modo = "equipo" | "navegador" | "apagada"
export type Prioridad = 0 | 1 | 2 // 0 info · 1 aviso · 2 peligro (corta lo que se esté diciendo)
type Turno = { text: string; prio: Prioridad; ps: string[]; audios: (Promise<AudioBuffer | null> | null)[] }

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

export class Voz {
  private readonly el: HTMLDivElement
  private readonly mode: Modo
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
  private voice: SpeechSynthesisVoice | null = null
  private female = false
  private hideT = 0
  private guard = 0
  private disposed = false

  constructor(host: HTMLElement) {
    const q = new URLSearchParams(location.search).get("voz")
    this.mode = q === "navegador" || q === "apagada" ? q : "equipo"
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
      const lp = ctx.createBiquadFilter() // banda de la radio
      lp.type = "lowpass"
      lp.frequency.value = 3400
      this.out.connect(lp).connect(ctx.destination)
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {})
  }

  private get audioOk() {
    return this.ctx?.state === "running" && !!this.out
  }

  /** Tono corto por la radio (tonos Quindar del Apollo: 2525 Hz al abrir, 250 ms; pitido más agudo si es un peligro). */
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine") {
    if (!this.audioOk || !this.ctx || !this.out) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.008)
    g.gain.setValueAtTime(vol, t + dur - 0.02)
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(g).connect(this.out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** Corta lo que esté diciendo y vacía la cola. */
  stop() {
    this.turno++
    this.queue = []
    this.cut()
    this.busy = false
    this.el.hidden = true
  }

  /** Al desmontar el simulador: cola, audio, pedidos, AudioContext y voz del navegador. */
  dispose() {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    clearTimeout(this.hideT)
    clearTimeout(this.guard)
    this.corte.abort()
    for (const sig of this.espera.splice(0)) sig() // salen y fallan con el pedido ya cortado
    window.removeEventListener("pointerdown", this.unlock)
    window.removeEventListener("keydown", this.unlock)
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
    this.src = null
  }

  /**
   * Audio de una frase de la API del equipo, o null si falla. Tres capas para que no espere:
   * memoria (esta sesión) → Cache Storage (sesiones anteriores, permanente) → la API (≈2 s).
   */
  private fetchFrase(frase: string): Promise<AudioBuffer | null> | null {
    if (this.mode !== "equipo" || this.fallos >= 3 || this.disposed) return null
    const ya = this.audio.get(frase)
    if (ya) return ya
    const clave = new Request(location.origin + "/eva-voz/" + encodeURIComponent(frase))
    const red = () =>
      new Promise<void>((ok) => this.reservar(ok)).then(() => {
        const signal = AbortSignal.any([this.corte.signal, AbortSignal.timeout(TIMEOUT_API_MS)])
        return fetch(TTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: hablado(frase) }),
          signal,
        })
          .then((r) => {
            if (!r.ok || !/audio/.test(r.headers.get("content-type") ?? "")) throw new Error("voz " + r.status)
            return r.arrayBuffer()
          })
          .then((b) => {
            void this.cache
              ?.then((c) => c?.put(clave, new Response(b.slice(0), { headers: { "Content-Type": "audio/wav" } })))
              .catch(() => {})
            return b
          })
          .finally(() => this.liberar())
      })
    const bytes = this.cache
      ? this.cache
          .then((c) => c?.match(clave))
          .then((r) => r?.arrayBuffer() ?? red())
          .catch(red)
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
        if (!this.disposed) this.fallos++
        this.audio.delete(frase)
        return null
      })
    this.audio.set(frase, p)
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
    if (this.mode !== "equipo") return
    for (const f of frases) for (const x of partes(f)) void this.fetchFrase(x)
  }

  /** Suena por la radio: banda estrecha, un poco de saturación y un trémolo rápido que la vuelve robótica. */
  private play(buf: AudioBuffer, done: () => void, primera: boolean) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 320
    const pk = ctx.createBiquadFilter()
    pk.type = "peaking"
    pk.frequency.value = 2400
    pk.gain.value = 5
    pk.Q.value = 1.1
    const sh = ctx.createWaveShaper()
    const c = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = i / 127.5 - 1
      c[i] = Math.tanh(2.2 * x) / Math.tanh(2.2)
    }
    sh.curve = c
    const g = ctx.createGain()
    g.gain.value = 0.85
    const trem = ctx.createOscillator() // modulación metálica
    const td = ctx.createGain()
    trem.frequency.value = 55
    td.gain.value = 0.18
    trem.connect(td).connect(g.gain)
    src.connect(hp).connect(pk).connect(sh).connect(g).connect(this.out!)
    src.onended = () => {
      trem.stop()
      if (this.src === src) this.src = null
      done()
    }
    this.src = src
    trem.start()
    src.start(ctx.currentTime + (primera ? 0.26 : 0.06)) // la primera, tras el tono de la radio
  }

  /** key: para no repetir lo mismo antes de `cooldownS`. */
  say(text: string, { prio = 0, key = text, cooldownS = 45 }: { prio?: Prioridad; key?: string; cooldownS?: number } = {}) {
    if (this.disposed) return
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
    const audios = this.mode === "apagada" ? [] : ps.map((x) => this.fetchFrase(x)) // se piden ya, mientras espera
    this.queue.push({ text, prio, ps, audios })
    this.queue.sort((a, b) => b.prio - a.prio)
    if (this.queue.length > 4) this.queue.length = 4 // si se acumula, lo menos importante se descarta
    this.next()
  }

  private next() {
    if (this.disposed || this.busy || !this.queue.length) return
    const { text, prio, ps, audios } = this.queue.shift()!
    this.busy = true
    clearTimeout(this.hideT)
    this.el.hidden = false
    this.el.className = "eva-voz p" + prio
    this.el.querySelector("span")!.textContent = text
    if (prio >= 2) this.tone(1560, 0.05, 0.045, "triangle")
    else this.tone(2525, 0.25, 0.05)
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
    const words = text.split(/\s+/).length
    const fallbackMs = 1200 + words * 330
    const first = audios[0]
    if (!first) return this.browser(text, done, fallbackMs)
    // Frase por frase. Si la primera tarda más de 3 s (o falla), mejor la voz del navegador que llegar tarde.
    let i = 0
    let ya = false
    const plan = window.setTimeout(() => {
      if (this.turno !== id || !this.busy) return
      ya = true
      this.browser(text, done, fallbackMs)
    }, ESPERA_API_MS)
    const sigue = () => {
      if (this.turno !== id || !this.busy) return
      if (i >= audios.length) return done()
      void (audios[i] ?? Promise.resolve(null)).then((buf) => {
        if (this.turno !== id || !this.busy || (i === 0 && ya)) return
        if (i === 0) {
          clearTimeout(plan)
          ya = true
        }
        if (buf && this.audioOk) this.play(buf, () => (i++, sigue()), i === 0)
        else {
          const resto = ps.slice(i).join(" ")
          this.browser(resto, done, 1200 + resto.split(/\s+/).length * 330)
        }
      })
    }
    sigue()
    this.guard = window.setTimeout(done, fallbackMs + 20000)
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
      }, 260) // tras el tono de la radio
      this.guard = window.setTimeout(done, fallbackMs + 6000) // por si el navegador nunca avisa del final
    } else this.guard = window.setTimeout(done, fallbackMs) // sin voz: el subtítulo queda el tiempo de leerlo
  }
}
