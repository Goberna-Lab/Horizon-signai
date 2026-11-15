// Simulación del contacto: dónde se posa de verdad la nave y qué le pasa ahí (portado de nuestro simulador NASA).
//
// 1. Error de navegación: el guiado lleva la nave a un punto desplazado del planificado (supuesto del simulador: σ ≈ 25 m).
//    El descenso sigue la trayectoria hasta el contacto, sin control manual ni desvío del piloto (decisión del equipo).
// 2. Peligros en ese punto, con el terreno real del sitio (LOLA):
//    - inclinación del plano de las cuatro patas (huella del LM: patas a ~4,6 m del centro), más el alabeo si una pata
//      queda en un hoyo o sobre un bulto;
//    - rocas bajo la nave, si la escena las tiene (la etapa de descenso deja poco hueco con el suelo).
// 3. Contacto: el motor se apaga con la luz de contacto (sondas de 1,7 m); a oscuras el corte es menos preciso.
// 4. Fallo del cálculo de altura (4 % con luz, 12 % a oscuras): el guiado cree que ya tocó el suelo y apaga el motor a
//    8–30 m; la caída a 1/6 g llega a 5–10 m/s y la nave se estrella (como Hakuto-R M1, 2023).
//
// Límites (de referencia histórica, redondeados): el LM toleraba unos 12° de pendiente y su tren de aterrizaje se
// diseñó para unos 3 m/s de velocidad vertical. Los umbrales de rocas son una simplificación del simulador.

export const LEG = 4.6 // distancia de cada pata al centro (m)
export const TIP_DEG = 12 // a partir de aquí vuelca
export const TILT_DEG = 6 // a partir de aquí queda inclinada: paneles y antena desalineados
export const HARD_MS = 3.0 // límite del tren de aterrizaje
export const CRASH_MS = 5.0 // velocidad de contacto a la que la nave se destruye
export const ROCK_SMALL = 0.3 // radio de roca (m) que inclina
export const ROCK_BIG = 0.55 // radio de roca (m) que vuelca
const NAV_SIGMA_M = 25

export type Terreno = { groundY: (x: number, z: number) => number }
export type Roca = { x: number; z: number; r: number }
export type Peligro = { tilt: number; rock: number; y: number; gx: number; gz: number }
export type Punto = { x: number; z: number }
/** Fallo del cálculo de altura: el motor se apaga `cutM` metros por encima del suelo. */
export type FalloAltura = { cutM: number }
export type PlanContacto = {
  planned: Punto
  arrive: Punto
  final: Punto & { hz: Peligro }
  lit: boolean
  /** Metros de caída libre de más: la luz de contacto llega antes o después de lo debido. */
  cutoffExtra: number
  fault: FalloAltura | null
}
export type Resultado = { kind: "ok" | "tilt" | "hard" | "tip" | "crash"; title: string; why: string; real: string }
/** 0 buen sitio · 1 quedaría inclinada · 2 volcaría. */
export type Gravedad = 0 | 1 | 2

/** Peligro de posarse con el centro en (x, z). */
export function hazardAt(v: Terreno, x: number, z: number, rocks: readonly Roca[] = []): Peligro {
  const a = LEG / Math.SQRT2
  const h = [v.groundY(x + a, z + a), v.groundY(x - a, z + a), v.groundY(x - a, z - a), v.groundY(x + a, z - a)]
  const gx = (h[0] + h[3] - (h[1] + h[2])) / (4 * a)
  const gz = (h[0] + h[1] - (h[2] + h[3])) / (4 * a)
  let tilt = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI
  // El plano no es perfecto: si una pata queda en un hoyo o sobre un bulto, la nave cabecea más
  const mean = (h[0] + h[1] + h[2] + h[3]) / 4
  const warp = Math.max(
    ...h.map((y, i) => Math.abs(y - (mean + (i === 0 || i === 3 ? gx : -gx) * a + (i < 2 ? gz : -gz) * a))),
  )
  tilt += (Math.atan(warp / LEG) * 180) / Math.PI
  let rock = 0
  for (const r of rocks) if (Math.hypot(r.x - x, r.z - z) < LEG + r.r) rock = Math.max(rock, r.r)
  if (rock > ROCK_SMALL) tilt += rock > ROCK_BIG ? 14 : 6 // una roca bajo una pata o bajo la etapa de descenso
  return { tilt, rock, y: mean, gx, gz }
}

export const gravedad = (hz: Peligro): Gravedad =>
  hz.tilt >= TIP_DEG || hz.rock > ROCK_BIG ? 2 : hz.tilt >= TILT_DEG || hz.rock > ROCK_SMALL ? 1 : 0

const gauss = () => {
  let u = 0
  let w = 0
  while (!u) u = Math.random()
  while (!w) w = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w)
}

/**
 * Planifica el contacto. `lit`: si el Sol ilumina la zona. La nave llega con el error de navegación y se posa ahí:
 * sin desvío, el punto final es el de llegada.
 */
export function planTouchdown(v: Terreno, rocks: readonly Roca[], { lit }: { lit: boolean }): PlanContacto {
  const planned = { x: 0, z: 0 }
  const arrive = { x: planned.x + gauss() * NAV_SIGMA_M, z: planned.z + gauss() * NAV_SIGMA_M }
  // Con luz, el corte del motor es nominal; a oscuras llega tarde o temprano
  let cutoffExtra = lit ? Math.random() * 0.4 : Math.random() * 1.6
  // Fallo del cálculo de altura: el guiado cree que ya está en el suelo (o el radar pierde el eco en la sombra o en el
  // borde de un cráter) y apaga el motor demasiado alto. Pasó de verdad: Hakuto-R M1 (2023), al cruzar el borde de un cráter.
  const fault = Math.random() < (lit ? 0.04 : 0.12) ? { cutM: 8 + Math.random() * 22 } : null
  if (fault) cutoffExtra = fault.cutM
  return { planned, arrive, final: { ...arrive, hz: hazardAt(v, arrive.x, arrive.z, rocks) }, lit, cutoffExtra, fault }
}

const n1 = (x: number) => x.toFixed(1)

/** Qué le pasó a la nave, con el caso real que se le parece. */
export function outcome(hz: Peligro, touchV: number, touchH = 0, fault: FalloAltura | null = null): Resultado {
  // Por encima de ~5 m/s el tren ya no absorbe el golpe: se rompen los tanques de la etapa de descenso y sus propelentes
  // hipergólicos (Aerozine 50 y tetróxido de nitrógeno) se encienden solos al mezclarse.
  if (touchV >= CRASH_MS)
    return {
      kind: "crash",
      title: "The lander crashed",
      why: `${fault ? `The altitude calculation failed: the guidance thought it was on the ground and shut down the engine at ${Math.round(fault.cutM)} m. ` : ""}The lander fell at ${n1(touchV)} m/s, far beyond the ~3 m/s the landing gear can take: the tanks ruptured and the propellants ignited as they mixed.`,
      real: "Hakuto-R M1 (ispace, 2023) misjudged its altitude while crossing a crater rim, ran out of fuel believing it was already down, and fell. Beresheet (2019) crashed when its main engine shut off.",
    }
  const hard = touchV > HARD_MS
  // Tocar el suelo moviéndose de lado: el tren del LM admitía ~1,2 m/s horizontales; más, una pata se clava
  if (touchH > 2)
    return {
      kind: "tip",
      title: "The lander tipped over",
      why: `It touched down moving sideways at ${n1(touchH)} m/s: a footpad dug into the regolith and the lander rolled over.`,
      real: "The Apollo lunar module's landing gear tolerated about 1.2 m/s of horizontal speed at touchdown.",
    }
  if (touchH > 1.2) hz = { ...hz, tilt: hz.tilt + (touchH - 1.2) * 8 }
  if (hz.tilt >= TIP_DEG || (hard && hz.tilt >= TILT_DEG))
    return {
      kind: "tip",
      title: "The lander tipped over",
      why:
        hz.rock > ROCK_BIG
          ? `A ${Math.round(hz.rock * 200)} cm boulder ended up under a footpad and the lander leaned ${Math.round(hz.tilt)}°: more than it can take.`
          : `The ground under the footpads sloped ${n1(hz.tilt)}°: more than the ~12° the lander could tolerate.`,
      real: "IM-1 Odysseus (2024) and IM-2 Athena (2025) both ended up on their side near the south pole.",
    }
  if (hard)
    return {
      kind: "hard",
      title: "Hard landing",
      why: `The lander touched down at ${n1(touchV)} m/s, above the ~3 m/s the landing gear was built for: damaged legs.`,
      real: "Without light, the altimeter and the contact light are the only reference to the ground.",
    }
  if (hz.tilt >= TILT_DEG || hz.rock > ROCK_SMALL)
    return {
      kind: "tilt",
      title: "Down, but tilted",
      why: `It came to rest tilted ${n1(hz.tilt)}°${hz.rock > ROCK_SMALL ? " on a rock" : ""}: panels and antenna are off-pointed and it will generate less power.`,
      real: "SLIM (Japan, 2024) landed upside down and only produced power once the light changed.",
    }
  return { kind: "ok", title: "Nominal landing", why: `Footpads at ${n1(hz.tilt)}° and contact at ${n1(touchV)} m/s.`, real: "" }
}
