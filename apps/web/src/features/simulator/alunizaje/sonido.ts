// Sonido del alunizaje y la caminata, sintetizado con Web Audio (sin archivos), portado del sonido del traje de nuestro
// simulador NASA (sfx.js). En el vacío no se oye nada de fuera: todo llega por la estructura del módulo, por el traje o
// por la radio. Motor de descenso (por la estructura), alarma de programa, impacto, estática de radio, tonos Quindar de
// la radio del Apollo, pitidos del HUD y alarma maestra. Con el casco puesto: ventilador del traje, pasos amortiguados,
// golpe al caer de un salto, roce del visor solar, latido (solo con esfuerzo, susto o falta de aire) y respiración con
// eco del casco (solo con esfuerzo, cansancio o falta de aire; en reposo no se oye). La voz es la de EVA, la de toda la
// aplicación (avisarEva de @/shared/eva). Los navegadores no dejan sonar audio antes de un gesto: se intenta al montar y
// otra vez con la primera tecla o clic.

export class Sonido {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private disposed = false
  private muted = false
  private fan: GainNode | null = null
  private brF: BiquadFilterNode | null = null
  private brG: GainNode | null = null
  private engF: BiquadFilterNode | null = null
  private engG: GainNode | null = null
  private bRate = 14
  private bDepth = 0
  private bP = 0

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
      this.out.gain.value = this.muted ? 0 : 1
      const casco = ctx.createBiquadFilter() // encerrado en el casco: sin agudos de fuera
      casco.type = "lowpass"
      casco.frequency.value = 3200
      this.out.connect(casco).connect(ctx.destination)
      this.iniciarTraje(ctx)
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {})
  }

  private ruido(ctx: AudioContext) {
    if (!this.noiseBuf) {
      const n = ctx.sampleRate * 2
      this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    }
    return this.noiseBuf
  }

  /** Fondo del traje: ventilador (zumbido grave) y respiración (ruido filtrado) con el eco de la burbuja del casco. */
  private iniciarTraje(ctx: AudioContext) {
    const out = this.out!
    const fan = ctx.createBufferSource()
    fan.buffer = this.ruido(ctx)
    fan.loop = true
    const fl = ctx.createBiquadFilter()
    fl.type = "lowpass"
    fl.frequency.value = 170
    this.fan = ctx.createGain()
    this.fan.gain.value = 0
    fan.connect(fl).connect(this.fan).connect(out)
    fan.start()
    const br = ctx.createBufferSource()
    br.buffer = this.ruido(ctx)
    br.loop = true
    this.brF = ctx.createBiquadFilter()
    this.brF.type = "bandpass"
    this.brF.Q.value = 0.9
    this.brG = ctx.createGain()
    this.brG.gain.value = 0
    br.connect(this.brF).connect(this.brG).connect(out)
    br.start()
    // Eco del casco: dos retardos cortos realimentados y algo apagados
    const eco = (tiempo: number, realim: number, nivel: number) => {
      const d = ctx.createDelay(0.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain()
      d.delayTime.value = tiempo
      fb.gain.value = realim
      lp.type = "lowpass"
      lp.frequency.value = 1500
      wet.gain.value = nivel
      this.brG!.connect(d)
      d.connect(lp)
      lp.connect(fb)
      fb.connect(d)
      lp.connect(wet)
      wet.connect(out)
    }
    eco(0.085, 0.38, 0.42)
    eco(0.137, 0.3, 0.26)
  }

  private get ok() {
    return this.ctx?.state === "running" && !!this.out
  }

  /** M: silencia o vuelve a sonar. Devuelve si quedó en silencio. */
  toggleMute() {
    this.muted = !this.muted
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05)
    return this.muted
  }

  /** Con el casco puesto o sin él: enciende o apaga el ventilador y corta la respiración y la alarma al salir. */
  casco(on: boolean) {
    if (!this.ctx || !this.fan) return
    this.fan.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.3)
    if (!on) {
      this.alarma(false)
      this.brG?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
    }
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
    const t = ctx.currentTime
    const s = ctx.createBufferSource()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    s.buffer = this.ruido(ctx)
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

  /** Paso: golpe sordo que sube por la bota y el traje. fuerza 0–1. */
  paso(fuerza = 0.5) {
    this.noise(0.11, 0.1 + 0.14 * fuerza, "lowpass", 190)
    this.tone(74, 0.13, 0.09 + 0.1 * fuerza, "sine", 0, 44)
  }

  /** Caída tras un salto (o el contacto del módulo): más grave y largo. */
  golpe(fuerza = 1) {
    this.noise(0.22, 0.22 * fuerza, "lowpass", 150)
    this.tone(60, 0.24, 0.2 * fuerza, "sine", 0, 34)
  }

  /** Tonos Quindar de la radio del Apollo: 2525 Hz al abrir, 2475 Hz al cerrar, 250 ms. */
  radio(abre = true) {
    this.tone(abre ? 2525 : 2475, 0.25, 0.05)
  }

  /** Visor solar: roce del mecanismo. */
  visor() {
    this.noise(0.35, 0.05, "bandpass", 900, 1.2)
  }

  /** Latido que se oye por dentro cuando falta el aire o el pulso se dispara. */
  latido(vol = 0.5) {
    this.tone(58, 0.09, 0.22 * vol, "sine", 0, 40)
    this.tone(52, 0.11, 0.16 * vol, "sine", 0.17, 36)
  }

  /**
   * Respiración. `esfuerzo` 0–1 decide si se oye y cuánto (0 = reposo, en silencio); `ritmo` en respiraciones por minuto.
   * Devuelve cuánto se está exhalando (0–1), para empañar el vidrio del casco al mismo compás.
   */
  respiracion(dt: number, esfuerzo: number, ritmo: number, jadeo = 0) {
    this.bRate += (ritmo - this.bRate) * Math.min(1, dt * 0.7) // el cuerpo tarda en acelerarse y en calmarse
    this.bDepth += (esfuerzo - this.bDepth) * Math.min(1, dt * (esfuerzo > this.bDepth ? 0.9 : 0.35))
    this.bP = (this.bP + (dt * this.bRate) / 60) % 1
    const p = this.bP, inh = 0.4 - 0.08 * jadeo // con jadeo la inhalación es corta y brusca
    let env = 0, f = 900, ex = 0
    if (p < inh) {
      env = Math.sin((Math.PI * p) / inh) * (0.7 + 0.3 * jadeo)
      f = 1250 + 600 * (p / inh)
    } else if (p >= inh + 0.05 && p < 0.94) {
      const q = (p - inh - 0.05) / (0.89 - inh)
      ex = Math.sin(Math.PI * q) ** 0.8
      env = ex
      f = 840 - 320 * q
    }
    if (this.ok && this.ctx && this.brG && this.brF) {
      const t = this.ctx.currentTime
      this.brG.gain.setTargetAtTime(env * this.bDepth * 0.3, t, 0.04)
      this.brF.frequency.setTargetAtTime(f, t, 0.05)
    }
    return ex * this.bDepth
  }

  /** Rugido del motor de descenso, transmitido por la estructura (dentro de la cabina se oye; fuera, en el vacío, no). */
  motor(empuje: number, vol = 1) {
    if (!this.ok || !this.ctx || !this.out) return
    if (!this.engG) {
      const ctx = this.ctx, src = ctx.createBufferSource()
      src.buffer = this.ruido(ctx)
      src.loop = true
      this.engF = ctx.createBiquadFilter()
      this.engF.type = "lowpass"
      this.engF.frequency.value = 120
      this.engF.Q.value = 2
      this.engG = ctx.createGain()
      this.engG.gain.value = 0
      src.connect(this.engF).connect(this.engG).connect(this.out)
      src.start()
    }
    const t = this.ctx.currentTime
    this.engG.gain.setTargetAtTime(Math.max(0, empuje) * 0.9 * vol, t, 0.08)
    this.engF!.frequency.setTargetAtTime(80 + 260 * Math.max(0, empuje), t, 0.1)
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

  /** Pitido corto del HUD (aviso nuevo, tarea hecha). */
  blip(alto = false) {
    this.tone(alto ? 1560 : 1180, 0.05, 0.045, "triangle")
  }

  /** Apagado del HUD por falta de energía. */
  apagado() {
    this.tone(420, 0.9, 0.08, "sawtooth", 0, 50)
  }

  private alarmaT = 0
  private alarmaOn = false
  /** Alarma maestra: dos tonos que se repiten mientras dure el estado crítico. */
  alarma(on: boolean) {
    if (on === this.alarmaOn) return
    this.alarmaOn = on
    window.clearInterval(this.alarmaT)
    this.alarmaT = 0
    if (!on) return
    const sonar = () => {
      this.tone(880, 0.16, 0.07, "square")
      this.tone(660, 0.16, 0.07, "square", 0.2)
    }
    sonar()
    this.alarmaT = window.setInterval(sonar, 1500)
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
