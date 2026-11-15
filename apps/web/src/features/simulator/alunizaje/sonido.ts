// Sonido del alunizaje y la caminata, sintetizado con Web Audio (sin archivos): alarma de programa del guiado, impacto,
// estática de radio, pitidos del HUD y la alarma maestra del traje. La voz no va aquí: quien habla es la EVA de toda la aplicación, avisada con `avisarEva` de `@/shared/eva`.
// Los navegadores no dejan sonar audio antes de un gesto: se intenta al montar y otra vez con la primera tecla o clic.

export class Sonido {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private disposed = false

  constructor() {
    this.unlock()
    window.addEventListener("pointerdown", this.unlock)
    window.addEventListener("keydown", this.unlock)
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

  private get ok() {
    return this.ctx?.state === "running" && !!this.out
  }

  /** Tono sintetizado: `when` en segundos desde ahora; `slideTo`, frecuencia final (barrido). */
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", when = 0, slideTo?: number) {
    if (!this.ok || !this.ctx || !this.out) return
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
    if (!this.ok || !this.ctx || !this.out) return
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

  /** Pitido corto del HUD (aviso, tarea hecha). */
  blip(alto = false) {
    this.tone(alto ? 1560 : 1180, 0.05, 0.045, "triangle")
  }

  private alarmaT = 0
  /** Alarma maestra del traje: dos tonos que se repiten mientras dure el estado crítico. */
  alarma(on: boolean) {
    window.clearInterval(this.alarmaT)
    this.alarmaT = 0
    if (!on) return
    const sonar = () => {
      this.tone(1046, 0.18, 0.05, "square")
      this.tone(784, 0.18, 0.05, "square", 0.22)
    }
    sonar()
    this.alarmaT = window.setInterval(sonar, 1400)
  }

  /** Al desmontar el simulador: listeners, alarma y AudioContext. */
  dispose() {
    if (this.disposed) return
    this.alarma(false)
    this.disposed = true
    window.removeEventListener("pointerdown", this.unlock)
    window.removeEventListener("keydown", this.unlock)
    void this.ctx?.close().catch(() => {})
    this.ctx = this.out = null
  }
}
