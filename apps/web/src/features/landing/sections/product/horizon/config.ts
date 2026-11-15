/**
 * Los mandos de la escena del horizonte (`HorizonScene.tsx`): tamaños, velocidades, colores e intensidades.
 * Todo lo que se puede querer ajustar a ojo está aquí.
 */

export type Rgb = [number, number, number]

/** Altura de la línea de 0 grados, como fracción del alto de la pantalla. */
export const HORIZON_LINE = 0.73

/**
 * El Sol, como se ve de verdad desde la Luna: un disco pequeño (medio grado, igual que desde la Tierra) y blanco,
 * sin atmósfera que lo tiña. Lo que lo hace enorme en pantalla es el destello de la cámara, no el disco.
 */
export const SUN = {
  /** Radio real del disco, en grados. De aquí sale cuándo queda tapado por la cresta. */
  radiusDeg: 0.265,
  /** Cuánto se agranda el disco al dibujarlo (1 = tamaño real a la escala vertical de la escena). */
  scale: 1.5,
  /** Recorrido lateral del Sol en pantalla durante el cambio, como fracción del ancho. La cámara lo sigue. */
  drift: 0.07,
  /** Tamaño del destello de cámara, como fracción del lado menor de la pantalla. */
  flareSize: 1,
}

/** Colores: el disco y su resplandor, la corona (que solo se ve con el disco tapado) y la luz zodiacal. */
export const SUN_COLORS = {
  disc: [1.0, 0.98, 0.94] as Rgb,
  corona: [0.86, 0.9, 1.0] as Rgb,
  zodiacal: [1.0, 0.93, 0.82] as Rgb,
}

/** Intensidades de la luz. */
export const GLOW = {
  /** Resplandor pegado al disco (shader). */
  halo: 1,
  /** Corona y luz zodiacal, visibles cuando la cresta tapa el disco. */
  corona: 1,
  /** Destello de cámara: el velo de luz alrededor del Sol. */
  glare: 1,
  /** Rayos de difracción. */
  rays: 0.9,
  /** Línea horizontal (lente anamórfica) y reflejos internos. */
  streak: 0.7,
  ghosts: 0.32,
  /** Luz de canto en las crestas. */
  rim: 1,
  /** Exposición final del shader. */
  exposure: 1.25,
}

/** Profundidad de cada capa: 0 no se mueve, 1 se mueve con todo el recorrido del parallax. */
export const DEPTH = {
  starsFar: 0.03,
  starsMid: 0.07,
  earth: 0.09,
  sun: 0.1,
  far: 0.2,
  ridge: 0.46,
  ground: 1,
}

/** Recorrido del parallax (px con profundidad 1) y suavizado (segundos hasta asentarse). */
export const PARALLAX = {
  pointerX: 54,
  pointerY: 15,
  scroll: 72,
  pointerEase: 0.3,
  scrollEase: 0.12,
}

/** Tonos del regolito: arriba y abajo de cada capa, de día y a contraluz (de noche). El suelo va casi liso: sin franja oscura abajo. */
export const TONES: Record<"far" | "ridge" | "ground", { day: [Rgb, Rgb]; night: [Rgb, Rgb] }> = {
  far: { day: [[205, 200, 191], [158, 153, 145]], night: [[26, 28, 33], [11, 12, 15]] },
  ridge: { day: [[176, 171, 162], [112, 108, 101]], night: [[14, 14, 16], [5, 5, 6]] },
  ground: { day: [[150, 145, 137], [132, 127, 119]], night: [[12, 12, 13], [9, 9, 10]] },
}
export const STAR: Rgb = [244, 239, 230]
/** Luz del Sol sobre el terreno: blanca, apenas cálida (no hay atmósfera que la tiña). */
export const RIM: Rgb = [255, 244, 226]
/** El suelo iluminado por la luz rasante. */
export const LIT_GROUND: Rgb = [214, 206, 192]
export const SPACE = "#030305"

/** Calidad según la pantalla: en las pequeñas, menos píxeles en el shader y menos partículas. */
export type Quality = {
  /** Tope de píxeles del lienzo del Sol. */
  sunPixels: number
  /** Octavas del ruido de la corona. */
  octaves: number
  /** Filamentos finos de la corona. */
  fine: boolean
  /** Una estrella por cada tantos px² (lejanas y medias). */
  starAreaFar: number
  starAreaMid: number
  rocks: number
  craters: number
}
export const QUALITY: { small: Quality; large: Quality } = {
  small: { sunPixels: 420_000, octaves: 3, fine: false, starAreaFar: 2600, starAreaMid: 9000, rocks: 12, craters: 6 },
  large: { sunPixels: 1_100_000, octaves: 4, fine: true, starAreaFar: 3400, starAreaMid: 11000, rocks: 24, craters: 12 },
}
/** Por debajo de este lado menor (px) la pantalla cuenta como pequeña. */
export const SMALL_SCREEN = 700
