// Timbre robótico femenino (tipo EVA) sobre la voz de Kokoro «af_heart», todo en Web Audio:
// no cambia la duración del audio, así que los tiempos por palabra (karaoke y eco) siguen valiendo.
//
//   entrada → paso alto 160 Hz ─┬─ seca (0,6) ───────────────────────────┐
//                               ├─ modulación en anillo 70 Hz (0,3) ─────┼─ brillo 3,2 kHz → salida
//                               └─ peine metálico 7 ms, realim. 0,45 (0,3)┘
//
// La modulación en anillo da el zumbido de máquina; el peine, la resonancia de lata; el brillo, lo «digital».
// Para ajustarlo, cambia MEZCLA: con todo en 0 salvo `seca: 1` vuelve la voz natural.

const MEZCLA = { seca: 0.6, anillo: 0.3, peine: 0.3 }
const ANILLO_HZ = 70
const PEINE_S = 0.007
const PEINE_REALIMENTACION = 0.45

export type VozRobot = { entrada: AudioNode; salida: AudioNode; cerrar: () => void }

export function crearVozRobot(ctx: AudioContext): VozRobot {
  const entrada = ctx.createGain()
  const pasoAlto = ctx.createBiquadFilter()
  pasoAlto.type = "highpass"
  pasoAlto.frequency.value = 160
  entrada.connect(pasoAlto)

  const brillo = ctx.createBiquadFilter()
  brillo.type = "peaking"
  brillo.frequency.value = 3200
  brillo.Q.value = 0.9
  brillo.gain.value = 4
  const salida = ctx.createGain()
  salida.gain.value = 0.85 // la suma de las tres ramas pasa de 1: que no sature
  brillo.connect(salida)

  const seca = ctx.createGain()
  seca.gain.value = MEZCLA.seca
  pasoAlto.connect(seca).connect(brillo)

  // Anillo: la voz multiplicada por una senoidal (la senoidal maneja la ganancia, que parte en 0).
  const anillo = ctx.createGain()
  anillo.gain.value = 0
  const oscilador = ctx.createOscillator()
  oscilador.frequency.value = ANILLO_HZ
  oscilador.connect(anillo.gain)
  oscilador.start()
  const mezclaAnillo = ctx.createGain()
  mezclaAnillo.gain.value = MEZCLA.anillo
  pasoAlto.connect(anillo).connect(mezclaAnillo).connect(brillo)

  // Peine: un eco cortísimo que se realimenta.
  const retardo = ctx.createDelay(0.05)
  retardo.delayTime.value = PEINE_S
  const realimentacion = ctx.createGain()
  realimentacion.gain.value = PEINE_REALIMENTACION
  retardo.connect(realimentacion).connect(retardo)
  const mezclaPeine = ctx.createGain()
  mezclaPeine.gain.value = MEZCLA.peine
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
