/**
 * Ruta de la cámara: una parada por escena y la interpolación entre paradas. Funciones puras.
 *
 * Cada parada describe la cámara "en órbita" sobre un punto del terreno, que interpola mejor que una posición suelta:
 * a dónde mira, desde qué rumbo, con qué inclinación y a qué distancia. El tiempo de misión también va en la parada:
 * el scroll mueve la cámara y el reloj a la vez.
 */

export type Stop = {
  /** Punto de la proyección al que mira la cámara (km). */
  at: [number, number]
  /** Altura del punto de mira sobre el terreno (km). */
  lift: number
  /** Rumbo de la mirada sobre el suelo, en grados desde 0° E hacia 90° E. Con inclinación 0 es el "arriba" de la pantalla. */
  bearing: number
  /** Inclinación desde el nadir: 0 mira hacia abajo, 90 mira al horizonte. */
  tilt: number
  /** Distancia de la cámara al punto de mira (km). */
  distance: number
  /** Si se indica, la distancia se calcula para que quepan estos kilómetros de terreno en el área libre de la vista. */
  frameKm?: number
  /** Campo de visión vertical (grados). */
  fov: number
  /**
   * Desplazamiento del centro óptico, en fracciones del ancho y el alto de la vista (+x derecha, +y arriba).
   * Es el encuadre de diseño para pantallas apaisadas; el escenario lo recalcula para cada pantalla (ver `Frame`).
   */
  shift: [number, number]
  /** Días desde el inicio del día lunar. */
  day: number
  /** Peso de la capa "sin línea de vista a la Tierra". */
  earth: number
  /** Peso del anillo y los rumbos del sitio destacado. */
  ring: number
  /** Cuánto sube la cámara a mitad del tramo que sale de esta parada (0: recto). */
  arc?: number
  /** Peso del dibujo realista (regolito iluminado, cielo negro con estrellas) frente a la lámina impresa. */
  real?: number
}

/**
 * Encuadre de una parada en una pantalla concreta. Lo calcula el escenario midiendo el texto que hay en pantalla:
 * el motor no sabe nada de paneles ni de tamaños de dispositivo.
 */
export type Frame = {
  /** Desplazamiento final del centro óptico (fracciones del ancho y el alto; +x derecha, +y arriba). */
  shift: [number, number]
  /** Lado, en píxeles, del cuadrado en el que debe caber el terreno de las paradas con `frameKm`. */
  fitPx: number
}

export type Pose = Omit<Stop, "arc" | "frameKm" | "real"> & { real: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1)
const angle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t
/**
 * Suaviza la entrada y la salida de cada parada sin frenar del todo: la cámara se asienta donde el texto está en su
 * punto, pero a mitad de tramo no acelera de golpe.
 */
const ease = (t: number) => lerp(t, t * t * (3 - 2 * t), 0.6)
/** Igual que `ease`, pero ocupando solo la parte [from, to] del tramo. */
const within = (t: number, from: number, to: number) => ease(clamp01((t - from) / (to - from)))

/** Pose en el punto `p` de la ruta: 0 es la primera parada, `stops.length - 1` la última. */
export function poseAt(stops: Stop[], p: number, out: Pose): Pose {
  const last = stops.length - 1
  const q = Math.min(Math.max(p, 0), last)
  const i = Math.min(Math.floor(q), last - 1)
  const a = stops[i]
  const b = stops[i + 1]
  const linear = q - i
  const t = ease(linear)
  // Girar y picar a la vez marea. Al bajar, la lámina gira primero (vista desde arriba, como un mapa) y después la
  // cámara se inclina; al subir, al revés.
  let turn = t
  let pitch = t
  if (b.tilt - a.tilt > 20) {
    turn = within(linear, 0, 0.62)
    pitch = within(linear, 0.3, 1)
  } else if (a.tilt - b.tilt > 20) {
    pitch = within(linear, 0, 0.7)
    turn = within(linear, 0.38, 1)
  }
  out.at[0] = lerp(a.at[0], b.at[0], t)
  out.at[1] = lerp(a.at[1], b.at[1], t)
  out.lift = lerp(a.lift, b.lift, t)
  out.bearing = angle(a.bearing, b.bearing, turn)
  out.tilt = lerp(a.tilt, b.tilt, pitch)
  out.distance = Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), t)) * (1 + (a.arc ?? 0) * Math.sin(Math.PI * t))
  out.fov = lerp(a.fov, b.fov, t)
  out.shift[0] = lerp(a.shift[0], b.shift[0], t)
  out.shift[1] = lerp(a.shift[1], b.shift[1], t)
  out.day = lerp(a.day, b.day, t)
  out.earth = lerp(a.earth, b.earth, t)
  out.ring = lerp(a.ring, b.ring, t)
  // Lo realista se va pronto: al alejarse de la primera parada ya manda la lámina.
  out.real = lerp(a.real ?? 0, b.real ?? 0, within(linear, 0, 0.55))
  return out
}

export const emptyPose = (): Pose => ({ at: [0, 0], lift: 0, bearing: 0, tilt: 0, distance: 1, fov: 30, shift: [0, 0], day: 0, earth: 0, ring: 0, real: 0 })
