// E15.3: equipos del Apollo 17 en su posición real, medida por LROC en imágenes NAC (±3–4 m): LROC Science Operations
// Team, "Coordinates of Lunar Anthropogenic Targets", 28-jul-2016 (docs/fuentes/lroc-coordinates-human-features-2016.pdf;
// Wagner et al., Icarus 283). Funciones puras, sin React ni three.
// Dimensiones con fuente:
//   Etapa de descenso del LM (lo que quedó: la de ascenso despegó): "an octagonal prism 4.2 meters across and 1.7 m thick",
//   base "1.5 m above the surface", "the distance between the ends of the footpads on opposite landing legs was 9.4 m"
//   (NASA NSSDCA, ficha del Apollo 17 LM, id 1972-096C, consultada el 2026-11-06).
//   LRV: 310 cm de largo, 229 cm entre ejes, 183 cm de trocha, 114 cm de alto máx., ruedas de 81,8 cm × 22,9 cm
//   (LSB fig. 9.44, p. 527).
// Supuestos: orientación de cada equipo (las fuentes dan solo la posición), forma y tamaño del ALSEP y del SEP, y el
// aspecto de los materiales.

const RADIO_M = 1_737_400
const RAD = Math.PI / 180

/** Módulo lunar del Apollo 17 (origen de la escena). */
const LM = { latitudGrados: 20.1911, longitudEsteGrados: 30.7723 }

export type Equipo = {
  id: 'LM' | 'ALSEP' | 'LRV' | 'SEP'
  nombre: string
  latitudGrados: number
  longitudEsteGrados: number
  incertidumbreM: number
}

/** Tabla de LROC (2016), filas del Apollo 17. */
export const EQUIPOS_APOLLO17: Equipo[] = [
  { id: 'LM', nombre: 'Etapa de descenso del módulo lunar', latitudGrados: 20.1911, longitudEsteGrados: 30.7723, incertidumbreM: 3.5 },
  { id: 'ALSEP', nombre: 'ALSEP (estación central)', latitudGrados: 20.1923, longitudEsteGrados: 30.7655, incertidumbreM: 3.5 },
  { id: 'LRV', nombre: 'Vehículo lunar (LRV)', latitudGrados: 20.1896, longitudEsteGrados: 30.7769, incertidumbreM: 3.2 },
  { id: 'SEP', nombre: 'SEP (transmisor)', latitudGrados: 20.192, longitudEsteGrados: 30.7768, incertidumbreM: 3.7 },
]

/** Posición local (x este, z sur, en metros) respecto del LM, en el plano tangente. */
export function posicionLocal(e: Pick<Equipo, 'latitudGrados' | 'longitudEsteGrados'>): [number, number] {
  const norte = (e.latitudGrados - LM.latitudGrados) * RAD * RADIO_M
  const este = (e.longitudEsteGrados - LM.longitudEsteGrados) * RAD * RADIO_M * Math.cos(LM.latitudGrados * RAD)
  return [este, -norte]
}

export const DIMENSIONES_LM = { anchoM: 4.2, espesorM: 1.7, alturaBaseM: 1.5, entrePatasM: 9.4 } as const

/** E15.6: radio del pie del LM. Supuesto: 0,94 m de diámetro (sin fuente en nuestros libros). */
export const RADIO_PIE_LM_M = 0.47
/** E15.6: orientación del LM. Supuesto: porche y escalera hacia el oeste (dirección de vuelo en el descenso). */
export const GIRO_LM_RAD = -Math.PI / 2

/**
 * E19: centros de los cuatro pies del LM con el cuerpo en (x, z), en coordenadas de la escena (x este, z sur). Patas en
 * los ejes del LM, la delantera hacia +Z del LM; con los extremos de los pies a 9,4 m (NSSDCA), el centro queda a
 * 4,7 m − radio del pie.
 */
export function centrosPiesLM(x: number, z: number, giro = GIRO_LM_RAD): Array<[number, number]> {
  const r = DIMENSIONES_LM.entrePatasM / 2 - RADIO_PIE_LM_M
  return [0, 90, 180, 270].map((grados) => {
    const a = (grados * Math.PI) / 180
    const [ux, uz] = [Math.sin(a) * r, Math.cos(a) * r]
    return [x + Math.cos(giro) * ux + Math.sin(giro) * uz, z - Math.sin(giro) * ux + Math.cos(giro) * uz]
  })
}
export const DIMENSIONES_LRV = {
  largoM: 3.1,
  entreEjesM: 2.29,
  trochaM: 1.83,
  altoMaxM: 1.14,
  diametroRuedaM: 0.818,
  anchoRuedaM: 0.229,
} as const
