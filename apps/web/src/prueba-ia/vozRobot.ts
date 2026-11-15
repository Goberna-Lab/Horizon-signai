// Timbre robótico sobre la voz de Kokoro, todo en Web Audio. No cambia la duración del audio, así que los
// tiempos por palabra (subtítulos y eco) siguen valiendo. Cada asistente trae su Timbre (personajes.ts).
//
//   entrada → paso alto 160 Hz ─┬─ seca ───────────────────────────────┐
//                               ├─ modulación en anillo (anilloHz) ────┼─ brillo 3,2 kHz → salida
//                               └─ peine metálico (peineMs, realim.) ──┘
//
// El anillo da el zumbido de máquina; el peine, la resonancia de lata; el brillo, lo «digital».
// Con `seca: 1` y lo demás en 0 vuelve la voz natural.

export type Timbre = {
  seca: number
  anillo: number
  anilloHz: number
  peine: number
  peineMs: number
  realimentacion: number
  brilloDb: number
}

export type VozRobot = { entrada: AudioNode; salida: AudioNode; cerrar: () => void }

export function crearVozRobot(ctx: AudioContext, t: Timbre): VozRobot {
  const entrada = ctx.createGain()
  const pasoAlto = ctx.createBiquadFilter()
  pasoAlto.type = "highpass"
  pasoAlto.frequency.value = 160
  entrada.connect(pasoAlto)

  const brillo = ctx.createBiquadFilter()
  brillo.type = "peaking"
  brillo.frequency.value = 3200
  brillo.Q.value = 0.9
  brillo.gain.value = t.brilloDb
  const salida = ctx.createGain()
  salida.gain.value = 0.85 // la suma de las tres ramas pasa de 1: que no sature
  brillo.connect(salida)

  const seca = ctx.createGain()
  seca.gain.value = t.seca
  pasoAlto.connect(seca).connect(brillo)

  // Anillo: la voz multiplicada por una senoidal (la senoidal maneja la ganancia, que parte en 0).
  const anillo = ctx.createGain()
  anillo.gain.value = 0
  const oscilador = ctx.createOscillator()
  oscilador.frequency.value = t.anilloHz
  oscilador.connect(anillo.gain)
  oscilador.start()
  const mezclaAnillo = ctx.createGain()
  mezclaAnillo.gain.value = t.anillo
  pasoAlto.connect(anillo).connect(mezclaAnillo).connect(brillo)

  // Peine: un eco cortísimo que se realimenta.
  const retardo = ctx.createDelay(0.05)
  retardo.delayTime.value = t.peineMs / 1000
  const realimentacion = ctx.createGain()
  realimentacion.gain.value = t.realimentacion
  retardo.connect(realimentacion).connect(retardo)
  const mezclaPeine = ctx.createGain()
  mezclaPeine.gain.value = t.peine
  pasoAlto.connect(retardo)
  retardo.connect(mezclaPeine).connect(brillo)

  return {
    entrada,
    salida,
    cerrar() {
      try {
        oscilador.stop()
      } catch {
        /* ya parado */
      }
      for (const n of [entrada, pasoAlto, seca, anillo, oscilador, mezclaAnillo, retardo, realimentacion, mezclaPeine, brillo, salida]) n.disconnect()
    },
  }
}
