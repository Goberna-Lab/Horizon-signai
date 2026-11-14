// Reglas y constantes del entorno lunar. Sin React ni three: solo datos y funciones puras.
// Cada constante dice qué regla (ENV-*) implementa o si es un supuesto.

/** ENV-004: 1 unidad 3D = 1 metro. */
export const METROS_POR_UNIDAD = 1

/**
 * ENV-001: prácticamente sin atmósfera (~2×10⁵ moléculas/cm³ de noche, ~10⁴ de día; LSB cap. 3.9, pp. 40–41):
 * el cielo es negro, sin niebla ni dispersión.
 */
export const CIELO = {
  color: '#000000',
  niebla: false,
} as const

import { LADO_NORTE_M } from './terreno'
import { elevacionHorizonte } from './horizonte'
import { SITIO_ACTIVO } from './sitio'

/**
 * Superficie (ENV-004: medidas en metros). Desde E6 es el relieve real del Apollo 17 (terreno.ts, ENV-008):
 * un cuadrado de 400 m alrededor del módulo lunar.
 */
export const SUPERFICIE = {
  ladoM: LADO_NORTE_M,
  /**
   * ENV-009 (E8): reflectancia del regolito del sitio, usada como ρ de una superficie lambertiana.
   * El Apollo 17 está en el fondo de Taurus-Littrow: basalto de mar con un manto oscuro de "low-albedo deposit"
   * (LSB cap. 10.6.6, p. 631). Los mares tienen albedo de ~7–10 % (LSB A3.2, p. 59; es albedo normal, medido con
   * Luna llena) y el suelo 75081 del Apollo 17 refleja ≈0,08–0,09 del flujo a 0,55 µm en laboratorio
   * (LSB cap. 7.2, fig. 7.10, p. 308; lectura aproximada de una gráfica). Se usa 0,085.
   * Antes (E2.1–E7) era 0,15, de tierras altas: no correspondía al sitio.
   * E20: el valor sale del sitio activo (src/engine/sitio.ts): 0,085 en el Apollo 17 y 0,15 en el polo (tierras altas,
   * LSB p. 59; supuesto). La Hapke de E12 sigue calibrada con 0,085 y se escala por albedo/0,085, como en E15.1.
   * Simplificaciones: lambertiana y gris. El regolito real retrorrefleja (LSB 9.3.1, p. 559; RTR p. 350):
   * pendiente para E12 (Hapke). Su color tira levemente al rojo (LSB p. 307).
   */
  albedo: SITIO_ACTIVO.albedo,
} as const

/** Cuadrícula de escala (ENV-004). ENV-006: es una ayuda de medición, no recibe luz ni sombra. */
export const CUADRICULA = {
  pasoMenorM: 1,
  pasoMayorM: 10,
} as const

/**
 * ENV-002: el Sol es la fuente principal de luz, representado como luz direccional.
 * Sin atmósfera que absorba, la radiación solar llega completa a la superficie
 * (Lunar Sourcebook, cap. 10, p. 603). Su posición real viene de JPL Horizons, a través de simulation.ts (E5).
 * Simplificaciones:
 * - ENV-007: el Sol es un disco, no un punto (ver diametroAngularGrados); la sombra tiene penumbra
 *   (Fielder, *Secrets of the Moon*, cap. 4). Se trata como disco de brillo uniforme: se ignora
 *   el oscurecimiento del limbo (supuesto).
 */
export const SOL = {
  /**
   * ENV-007: diámetro angular MEDIO del Sol, de referencia. El motor usa el real de cada instante
   * (Horizons, cantidad 13: 0,534°–0,540° en el día lunar descargado). θ = 2·asin(R☉ / 1 UA) = 0,533°, derivado de
   * R☉ = 695 508 km (Wakker, *Fundamentals of Astrodynamics*, tabla B.4, p. 673) y
   * 1 UA = 149 597 870,7 km (misma obra, p. 671). RTR (p. 375) da "alrededor de medio grado".
   * Simplificación: valor medio fijo; varía entre 0,524° y 0,542° con la distancia Tierra-Sol,
   * y la posición de la Luna lo cambia menos de 0,3 %.
   * Ojo: el "0,53°" de FA p. 543 es el ángulo del cono de sombra de la Tierra, no este diámetro.
   */
  diametroAngularGrados: (2 * Math.asin(695_508 / 149_597_870.7) * 180) / Math.PI,
} as const

/**
 * ENV-010: luz terrestre (earthshine). La cara visible de la Luna siempre mira a la Tierra
 * (LSB cap. A3.1, p. 58; cap. 10, p. 596), así que la Tierra está casi fija en su cielo; la libración la mueve
 * unos grados. Con luz terrestre se ve la cara nocturna (LSB cap. 3, pp. 29–30).
 * Posición, fase y diámetro reales: JPL Horizons, a través de simulation.ts (E5). El sitio (Apollo 17) está
 * en la cara visible.
 */
export const TIERRA = {
  /**
   * ENV-010 (E9): albedo de Bond de la Tierra para la luz terrestre: "32 % … reflected and diffused", modelo simple
   * de FA cap. 20.4, p. 542. Con la Tierra como esfera lambertiana (supuesto: FA dice que 1–10 % de la reflexión
   * es especular), el albedo geométrico es 2/3·A y la irradiancia sobre la Luna con la Tierra llena es
   * (2/3)·A·sin²(θ⊕/2)·E☉ ≈ 5,9·10⁻⁵ E☉ a la distancia media (PBR pp. 193, 554). Reemplaza el supuesto de 1e-4 (E2.1).
   */
  albedoBond: 0.32,
  /**
   * ENV-007: diámetro angular MEDIO de la Tierra vista desde la Luna, de referencia: 2·atan(R⊕ / d) = 1,90°,
   * con R⊕ = 6371 km y d = 384 401 km (FA cap. 17.1, p. 410). El motor usa el real de cada instante
   * (Horizons: 1,81°–2,01°). Supuesto que sigue: disco lleno y uniforme aunque la Tierra esté en fase.
   */
  diametroAngularGrados: (2 * Math.atan(6371 / 384_401) * 180) / Math.PI,
} as const

/**
 * ENV-006: la exposición es una decisión de la cámara, no del entorno.
 * Las luces se expresan en "irradiancia solar = 1" y se multiplican por esta escala, que ancla la exposición
 * a un fotómetro de luz incidente (RTR cap. 8.2.2, p. 289): con +0 EV, una superficie lambertiana de reflectancia ρ
 * de cara al Sol da ρ en valor lineal (un gris del 18 % da 0,18), porque L = ρ·E/π y la escala es π.
 * Antes (hasta E7) era 10, sin ancla.
 */
export const ESCALA_VISUAL = Math.PI

/**
 * ENV-002 (E9): constante solar, 1361 W/m² a 1 UA (FA cap. 20.4, p. 542). Las luces del motor están en unidades de
 * "Sol = 1 a 1 UA"; la irradiancia real cae con el cuadrado de la distancia (PBR cap. 5.2.1, p. 187; FA p. 152).
 */
export const CONSTANTE_SOLAR_W_M2 = 1361

/** ENV-006: exposición aumentada (en pasos EV, ×2 por paso). 0 = sin aumento. */
export const EXPOSICION = {
  minEV: 0,
  /** Desde E9 la noche con luz terrestre necesita ~+15,5 EV para que el suelo llegue a 0,18 en lineal. */
  maxEV: 20,
} as const

/** ENV-003: obstáculo vertical ideal sobre terreno horizontal (experimento 01, sección 4). */
export const OBSTACULO = {
  alturaM: 10,
  /**
   * Supuesto: poste cilíndrico delgado centrado en el origen. Al girar el Sol la sombra cambia
   * de dirección. La tapa superior (un disco horizontal) se proyecta igual sobre el suelo, así que
   * la punta de la sombra queda a r + L del eje, es decir, a L del borde del poste.
   */
  radioM: 0.25,
} as const

export type Vec3 = [number, number, number]

const RAD = Math.PI / 180

/**
 * ENV-003: longitud de la sombra de un obstáculo vertical sobre terreno horizontal.
 * L = h / tan(α)   (experimento 01, sección 4).
 * Es el mismo método de sombras con que se midieron alturas lunares desde la Tierra,
 * a la inversa: h = L · tan(α) (Fielder, *Secrets of the Moon*, caps. 2 y 4).
 * Límite: solo vale en terreno horizontal; en terreno real la altura deducida
 * depende de la longitud de sombra usada (Fielder, cap. 4).
 * Con α = 0 el Sol está en el horizonte y la sombra es infinita; con α < 0 no hay sombra solar.
 */
export function longitudSombra(alturaM: number, elevacionGrados: number): number {
  // Por debajo de una millonésima de grado se considera horizonte (evita errores de redondeo).
  if (elevacionGrados <= 1e-6) return Infinity
  return alturaM / Math.tan(elevacionGrados * RAD)
}

/**
 * Método de sombras al revés: altura a partir del largo de la sombra, h = L · tan(α).
 * Así se midieron alturas lunares desde la Tierra (Fielder, *Secrets of the Moon*, caps. 2 y 4).
 * Mismos límites que longitudSombra: terreno horizontal; sin Sol (α ≤ 0) no hay medida.
 */
export function alturaDesdeSombra(largoM: number, elevacionGrados: number): number {
  if (elevacionGrados <= 1e-6) return NaN
  return largoM * Math.tan(elevacionGrados * RAD)
}

export type MedicionInversa = {
  /** Largo medido: proyección del punto sobre la dirección de la sombra, desde el borde del poste. */
  largoM: number
  /** Separación del punto respecto del eje de la sombra (si es grande, el clic no cayó en la sombra). */
  desvioLateralM: number
  /** Altura deducida, h = L · tan(α). */
  alturaM: number
}

/**
 * Medición inversa de Fielder sobre un punto del suelo (x, z) que el observador marca como punta de la
 * sombra de un poste vertical centrado en el origen. Usa la dirección del Sol del instante de la medida.
 * Devuelve null si el Sol no está sobre el horizonte.
 */
export function medicionInversa(x: number, z: number, direccionSol: Vec3, radioPosteM: number): MedicionInversa | null {
  const elevacion = elevacionDe(direccionSol)
  if (elevacion <= 1e-6) return null
  const horizontal = Math.hypot(direccionSol[0], direccionSol[2])
  if (horizontal < 1e-9) return null
  // La sombra cae opuesta al Sol en el plano horizontal.
  const sx = -direccionSol[0] / horizontal
  const sz = -direccionSol[2] / horizontal
  const largoM = x * sx + z * sz - radioPosteM
  const desvioLateralM = Math.abs(x * sz - z * sx)
  return { largoM, desvioLateralM, alturaM: alturaDesdeSombra(largoM, elevacion) }
}

/**
 * Dirección unitaria en ejes de la escena (+X este, +Y arriba, -Z norte)
 * a partir de elevación y azimut (medido desde el norte hacia el este).
 */
export function direccionDesdeHorizonte(elevacionGrados: number, azimutGrados: number): Vec3 {
  const e = elevacionGrados * RAD
  const a = azimutGrados * RAD
  const este = Math.cos(e) * Math.sin(a)
  const norte = Math.cos(e) * Math.cos(a)
  return [este, Math.sin(e), -norte]
}

/** Elevación en grados de una dirección unitaria. */
export function elevacionDe([, y]: Vec3): number {
  return Math.asin(Math.max(-1, Math.min(1, y))) / RAD
}

/** Irradiancias en unidades de "Sol = 1 a 1 UA" (× CONSTANTE_SOLAR_W_M2 para W/m²). */
export type Iluminacion = {
  /** ENV-007: fracción del disco solar sobre el horizonte (0 de noche, 1 con el disco entero arriba). */
  solVisible: number
  /** ENV-002: irradiancia solar perpendicular a la dirección efectiva: F / r² (r en UA). */
  solNormal: number
  /** ENV-007: dirección efectiva del Sol (centroide del segmento visible del disco). */
  direccionSolEfectiva: Vec3
  /** ENV-010: dirección efectiva de la Tierra (centroide del segmento visible). */
  direccionTierraEfectiva: Vec3
  /** ENV-002: Sol directo sobre suelo horizontal: F · sin(α), con F la fracción del disco visible (ENV-007). */
  solSobreSuelo: number
  /** ENV-010: fracción iluminada de la Tierra (Horizons). */
  faseTierra: number
  /** ENV-010: irradiancia de la Tierra perpendicular a su dirección (derivada, E9). */
  tierraNormal: number
  /** Irradiancia total sobre el suelo horizontal (Sol + Tierra). */
  suelo: number
  /**
   * ENV-009: luz que devuelve el suelo iluminado = albedo · suelo.
   * Una cara que mira hacia abajo recibe todo; una cara vertical, la mitad (factor de vista 1/2);
   * el suelo horizontal no recibe nada de sí mismo.
   */
  reflejadaTerreno: number
}

/** Lo que la iluminación necesita del instante (lo da simulation.ts: EstadoEscena lo cumple). */
export type EntradaIluminacion = {
  direccionSol: Vec3
  diametroSolGrados: number
  direccionTierra: Vec3
  diametroTierraGrados: number
  /** Fracción iluminada de la Tierra (0–1). */
  faseTierra: number
  /** Distancia al Sol en UA (Horizons). */
  distanciaSolAu: number
}

/**
 * Suma de luces del entorno para un instante.
 * Simplificación de ENV-009: el suelo se trata como un plano infinito y uniformemente iluminado, aunque desde
 * E6 tenga relieve (ENV-008): las pendientes reflejan distinto según su orientación.
 * Ignora que la zona en sombra no refleja y que hay un solo rebote.
 * Simplificación de ENV-010: la luz terrestre es proporcional a la fracción iluminada, no a la función
 * de fase real de la Tierra.
 */
export function iluminacion(e: EntradaIluminacion): Iluminacion {
  // ENV-002: la irradiancia cae con 1/r² (PBR p. 187).
  const factorDistancia = 1 / (e.distanciaSolAu * e.distanciaSolAu)
  // ENV-007: cerca del horizonte solo ilumina la parte del disco que está sobre él, y desde su centroide (E9).
  // ENV-008 (E10): medido contra el horizonte real del sitio, no contra el astronómico.
  const visible = fraccionVisibleLocal(e.direccionSol, e.diametroSolGrados)
  const direccionSolEfectiva = direccionCentroideVisible(e.direccionSol, e.diametroSolGrados)
  const solNormal = factorDistancia * visible
  const solSobreSuelo = solNormal * Math.max(0, direccionSolEfectiva[1])
  // ENV-010 (E9): luz terrestre derivada, esfera lambertiana de albedo de Bond A (FA p. 542) en fase g.
  const k = e.faseTierra
  const tierraVisible = fraccionVisibleLocal(e.direccionTierra, e.diametroTierraGrados)
  const direccionTierraEfectiva = direccionCentroideVisible(e.direccionTierra, e.diametroTierraGrados)
  const tierraNormal = factorDistancia * luzTierraLlena(e.diametroTierraGrados) * faseEsferaLambert(k) * tierraVisible
  const tierraSobreSuelo = tierraNormal * Math.max(0, direccionTierraEfectiva[1])
  const suelo = solSobreSuelo + tierraSobreSuelo
  return {
    solVisible: visible,
    solNormal,
    direccionSolEfectiva,
    direccionTierraEfectiva,
    solSobreSuelo,
    faseTierra: k,
    tierraNormal,
    suelo,
    reflejadaTerreno: SUPERFICIE.albedo * suelo,
  }
}

/**
 * ENV-007: fracción del disco solar (o terrestre) que está sobre el horizonte, si su centro está
 * a una elevación e y su diámetro angular es θ. Área de un segmento circular, con t = e / (θ/2):
 *   F = 1/2 + (asin t + t·√(1 − t²)) / π   para |t| < 1;  0 debajo y 1 encima.
 * En el Apollo 17 (20,19° N), con θ ≈ 0,537°, el disco tarda ~68 min en salir por completo (con las efemérides de E5).
 * Supuesto: horizonte plano a 0° (sin relieve) y disco de brillo uniforme.
 */
export function fraccionDiscoVisible(elevacionGrados: number, diametroAngularGrados: number): number {
  const t = elevacionGrados / (diametroAngularGrados / 2)
  if (t <= -1) return 0
  if (t >= 1) return 1
  return 0.5 + (Math.asin(t) + t * Math.sqrt(1 - t * t)) / Math.PI
}

/**
 * ENV-007 (E9): elevación del centroide del segmento visible de un disco de diámetro θ cuyo centro está a e.
 * Con y₀ = −e y ρ = θ/2: área A = ρ²·(acos t − t·√(1 − t²)) con t = y₀/ρ; primer momento M = (2/3)(ρ² − y₀²)^(3/2);
 * centroide ȳ = M/A. La irradiancia sobre el suelo es F·sin(e + ȳ) (PBR p. 545). Con e = 0 da F·ȳ = 2ρ/(3π) en
 * radianes; F·sin(e), lo de antes, daba 0 y subestimaba hasta un 38 % con e = 0,1°. Devuelve NaN si no se ve nada.
 */
export function elevacionCentroideVisible(elevacionGrados: number, diametroAngularGrados: number): number {
  const rho = diametroAngularGrados / 2
  if (elevacionGrados >= rho) return elevacionGrados
  if (elevacionGrados <= -rho) return NaN
  const y0 = -elevacionGrados
  const t = y0 / rho
  const area = rho * rho * (Math.acos(t) - t * Math.sqrt(1 - t * t))
  const momento = (2 / 3) * Math.pow(rho * rho - y0 * y0, 1.5)
  return elevacionGrados + momento / area
}

/** Azimut (desde el norte hacia el este) de una dirección en ejes de la escena (+X este, −Z norte). */
export function azimutDe([x, , z]: Vec3): number {
  const az = (Math.atan2(x, -z) / RAD + 360) % 360
  return 360 - az < 1e-6 ? 0 : az
}

/**
 * ENV-008 (E10): fracción de un disco visible sobre el horizonte LOCAL (macizos del valle, SLDEM2015) en su azimut.
 * Aproximación: el borde del horizonte es horizontal a lo ancho del disco (0,5°–2°).
 */
export function fraccionVisibleLocal(direccion: Vec3, diametroAngularGrados: number): number {
  return fraccionDiscoVisible(elevacionDe(direccion) - elevacionHorizonte(azimutDe(direccion)), diametroAngularGrados)
}

/**
 * Dirección hacia el centroide del segmento visible sobre el horizonte local (mismo azimut); igual a la del centro si
 * no hay recorte.
 */
export function direccionCentroideVisible(direccion: Vec3, diametroAngularGrados: number): Vec3 {
  const e = elevacionDe(direccion)
  const h = elevacionHorizonte(azimutDe(direccion))
  const relativa = elevacionCentroideVisible(e - h, diametroAngularGrados)
  const ec = relativa + h
  if (Number.isNaN(relativa) || Math.abs(ec - e) < 1e-12) return direccion
  const horizontal = Math.hypot(direccion[0], direccion[2]) || 1
  const c = Math.cos(ec * RAD)
  return [(direccion[0] / horizontal) * c, Math.sin(ec * RAD), (direccion[2] / horizontal) * c]
}

/**
 * ENV-010 (E9): irradiancia de la Tierra llena sobre la Luna, en unidades del Sol a la misma distancia:
 * p·sin²(θ⊕/2) con p = (2/3)·A, el albedo geométrico de una esfera lambertiana (PBR pp. 193, 554).
 */
export function luzTierraLlena(diametroTierraGrados: number): number {
  const s = Math.sin((diametroTierraGrados / 2) * RAD)
  return (2 / 3) * TIERRA.albedoBond * s * s
}

/**
 * ENV-010 (E9): función de fase de una esfera lambertiana, normalizada a 1 en fase 0:
 * Φ(g) = [sin g + (π − g)·cos g] / π, con g el ángulo de fase. La fracción iluminada k cumple k = (1 + cos g)/2.
 * Antes la luz era proporcional a k, que no es la ley de una esfera lambertiana (con k = 0,5: 0,318, no 0,5).
 * Verificada con Monte Carlo en las pruebas (T8).
 */
export function faseEsferaLambert(fraccionIluminada: number): number {
  const g = Math.acos(Math.min(1, Math.max(-1, 2 * fraccionIluminada - 1)))
  return (Math.sin(g) + (Math.PI - g) * Math.cos(g)) / Math.PI
}

/** ENV-007: tan(θ/2), el factor que convierte distancia a lo largo del rayo en radio de penumbra. */
export function tanSemidiametro(diametroAngularGrados: number): number {
  return Math.tan((diametroAngularGrados / 2) * RAD)
}

/** Distancias sobre el suelo medidas desde el BORDE del poste, a lo largo de la sombra. */
export type LimitesSombra = {
  /** Sombra del centro del disco solar: L = h / tan(α) (ENV-003). */
  centroM: number
  /** Hasta aquí la sombra es completamente negra (núcleo, sin ningún punto del disco visible). */
  finNucleoM: number
  /** Desde aquí el suelo recibe el disco completo: fin de la penumbra. */
  finPenumbraM: number
  /** Ancho de la penumbra en la punta: finPenumbra − fin del núcleo por la tapa, ≈ h·θ / sin²α. */
  anchoPenumbraM: number
  /** true si el núcleo se corta antes por el ancho del poste (el poste tapa menos que el disco). */
  nucleoCortadoPorAncho: boolean
  /** Elevación mínima para que el núcleo llegue a la punta (algo menor que asin(h·θ / D)); misma condición que nucleoCortadoPorAncho. */
  umbralNucleoEnPuntaGrados: number
}

/**
 * ENV-007: límites de la sombra de un poste vertical (altura h, diámetro D) con un Sol de diámetro θ
 * a elevación α, sobre suelo horizontal.
 * - Tapa superior: el núcleo termina en h / tan(α + θ/2) y la penumbra en h / tan(α − θ/2).
 * - Ancho: a una distancia d a lo largo del rayo, el poste tapa un ángulo D/d; el núcleo existe
 *   mientras D > d·θ, o sea hasta d₀ = D/θ, que en el suelo cae a d₀·cos α del eje. Solo corta
 *   si el rayo desde la tapa es más largo que d₀ (sin α < h·θ/D) y si cae antes que el límite de la tapa.
 * Distancias devueltas desde el borde del poste (eje − r). Si α ≤ θ/2 la penumbra no termina.
 * Aproximación de ángulos pequeños en el ancho; error < 0,1 % aquí.
 */
export function limitesSombra(
  alturaM: number,
  diametroPosteM: number,
  elevacionGrados: number,
  diametroAngularGrados: number,
): LimitesSombra {
  const r = diametroPosteM / 2
  const semi = diametroAngularGrados / 2
  const thetaRad = diametroAngularGrados * RAD
  const centroM = longitudSombra(alturaM, elevacionGrados)
  // Cerca del cenit, α + θ/2 pasa de 90° y la tangente cambia de signo: el núcleo empieza en el borde.
  const finNucleoTapa = elevacionGrados + semi >= 90 ? 0 : longitudSombra(alturaM, elevacionGrados + semi)
  const finPenumbraM = elevacionGrados - semi > 1e-6 ? longitudSombra(alturaM, elevacionGrados - semi) : Infinity
  // El ancho solo corta el núcleo si el rayo desde la tapa recorre más de d₀ = D/θ (sin α < h·θ/D)
  // y si ese corte cae antes que el límite de la tapa. Cerca del cenit no aplica.
  const limiteSeno = (alturaM * thetaRad) / diametroPosteM
  const finAnchoDesdeBorde = (alfa: number) => (diametroPosteM / thetaRad) * Math.cos(alfa * RAD) - r
  const cortado = (alfa: number) =>
    Math.sin(alfa * RAD) < limiteSeno && finAnchoDesdeBorde(alfa) < longitudSombra(alturaM, alfa + semi)
  const nucleoCortadoPorAncho = cortado(elevacionGrados)
  // Umbral por bisección: cortado es true debajo y false encima.
  let bajo = semi + 1e-6
  let alto = limiteSeno >= 1 ? 90 : Math.asin(limiteSeno) / RAD
  if (!cortado(bajo)) alto = bajo
  for (let i = 0; i < 60 && alto - bajo > 1e-9; i++) {
    const medio = (bajo + alto) / 2
    if (cortado(medio)) bajo = medio
    else alto = medio
  }
  return {
    centroM,
    finNucleoM: nucleoCortadoPorAncho ? Math.max(0, finAnchoDesdeBorde(elevacionGrados)) : finNucleoTapa,
    finPenumbraM,
    anchoPenumbraM: finPenumbraM - finNucleoTapa,
    nucleoCortadoPorAncho,
    umbralNucleoEnPuntaGrados: alto,
  }
}

/** Limita la exposición al rango del control. */
export function limitarExposicion(ev: number): number {
  if (Number.isNaN(ev)) return 0
  return Math.min(EXPOSICION.maxEV, Math.max(EXPOSICION.minEV, ev))
}
