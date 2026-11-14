// E19: evaluación de un punto de aterrizaje. Funciones puras, sin React ni three.
// Objetivo del proyecto (SPEC): evaluar las condiciones de un aterrizaje lunar. Aquí se MIDEN las condiciones; no se da
// veredicto, porque nuestras fuentes no traen umbrales numéricos para aterrizar (decisión del 2026-11-06, Abiertas). LSB
// solo dice, cualitativamente, que con el Sol a la espalda no se ven sombras y que solo se ven mirando de costado al Sol
// (cap. 3, pp. 28–29).
import { centrosPiesLM } from './equipos'
import { direccionDesdeHorizonte, elevacionDe, azimutDe, type Vec3 } from './environment'
import { elevacionHorizonte } from './horizonte'
import { alturaSuelo, dentroDelTerreno, pendienteGrados, LADO_ESTE_M, LADO_NORTE_M, PASO_ESTE_M } from './terreno'
import { estado, type DiaLunar, type EstadoEscena } from './simulation'

const RAD = Math.PI / 180

/** Apoyo del LM sobre el relieve real (DTM NAC de 2 m, E6), con sus cuatro pies (E15.6). */
export type Apoyo = {
  /** Alturas del suelo en los cuatro pies, relativas al centro (m). */
  alturasPiesM: [number, number, number, number]
  /** Inclinación del plano de mínimos cuadrados por los cuatro pies (°). */
  inclinacionGrados: number
  /** Azimut hacia donde baja ese plano (°, desde el norte hacia el este). */
  bajaHaciaGrados: number
  /** Mayor diferencia de altura entre dos pies (m). */
  desnivelM: number
  /**
   * Alabeo: con tres pies apoyados, cuánto queda el cuarto separado del suelo (o hundido), |h₁ + h₃ − h₂ − h₄| (m).
   * Es cero si los cuatro pies están en un plano.
   */
  alabeoM: number
  /** Pendiente local del DTM en el centro, por diferencias centradas a 2 m (°). */
  pendienteCentroGrados: number
}

/**
 * Plano por cuatro pies en cruz y simétricos (0–2 y 1–3 opuestos): el de mínimos cuadrados tiene pendiente (h₊ − h₋)/(2r)
 * en cada eje y pasa por la media de las alturas. Devuelve la inclinación, hacia dónde baja y el alabeo.
 */
export function planoPorPies(pies: Array<[number, number]>, h: [number, number, number, number]) {
  const r = Math.hypot(pies[0][0] - pies[2][0], pies[0][1] - pies[2][1]) / 2
  const ejeA: [number, number] = [(pies[0][0] - pies[2][0]) / (2 * r), (pies[0][1] - pies[2][1]) / (2 * r)]
  const ejeB: [number, number] = [(pies[1][0] - pies[3][0]) / (2 * r), (pies[1][1] - pies[3][1]) / (2 * r)]
  const sA = (h[0] - h[2]) / (2 * r)
  const sB = (h[1] - h[3]) / (2 * r)
  // Gradiente en ejes de la escena (x este, z sur): dh/dx, dh/dz.
  const gx = sA * ejeA[0] + sB * ejeB[0]
  const gz = sA * ejeA[1] + sB * ejeB[1]
  return {
    inclinacionGrados: Math.atan(Math.hypot(gx, gz)) / RAD,
    // Baja hacia −gradiente; azimut desde el norte (−z) hacia el este (+x).
    bajaHaciaGrados: (Math.atan2(-gx, gz) / RAD + 360) % 360,
    alabeoM: Math.abs(h[0] + h[2] - h[1] - h[3]),
  }
}

/** Apoyo del LM en (x, z), sobre el DTM. */
export function apoyoLM(x: number, z: number): Apoyo {
  const pies = centrosPiesLM(x, z)
  const h0 = alturaSuelo(x, z)
  const h = pies.map(([px, pz]) => alturaSuelo(px, pz) - h0) as [number, number, number, number]
  const plano = planoPorPies(pies, h)
  return {
    alturasPiesM: h,
    inclinacionGrados: plano.inclinacionGrados,
    bajaHaciaGrados: plano.bajaHaciaGrados,
    desnivelM: Math.max(...h) - Math.min(...h),
    alabeoM: plano.alabeoM,
    pendienteCentroGrados: pendienteGrados(x, z),
  }
}

/** true si los cuatro pies caen dentro del DTM (fuera, alturaSuelo repite el borde y el apoyo no vale). */
export function huellaDentro(x: number, z: number): boolean {
  return centrosPiesLM(x, z).every(([px, pz]) => dentroDelTerreno(px, pz))
}

/**
 * ¿El relieve cercano (DTM de 2 m, hasta el borde del recorte de 400 m) tapa la dirección d vista desde (x, z) a 1 m
 * del suelo? Marcha de rayos con paso de 2 m (RTR pp. 465–466). Más allá del recorte manda el horizonte de los macizos.
 */
export function tapadoPorRelieve(x: number, z: number, d: Vec3, alturaOjoM = 1): boolean {
  const horizontal = Math.hypot(d[0], d[2])
  if (horizontal < 1e-9) return false
  const [ux, uz] = [d[0] / horizontal, d[2] / horizontal]
  const tangente = d[1] / horizontal
  const y0 = alturaSuelo(x, z) + alturaOjoM
  const maximo = Math.hypot(LADO_ESTE_M, LADO_NORTE_M)
  for (let s = PASO_ESTE_M; s < maximo; s += PASO_ESTE_M) {
    const px = x + ux * s
    const pz = z + uz * s
    if (!dentroDelTerreno(px, pz)) return false
    if (alturaSuelo(px, pz) > y0 + tangente * s) return true
  }
  return false
}

/** Condiciones del cielo en un instante, para un punto. */
export type CieloEnPunto = {
  /** Elevación del centro del Sol sobre el horizonte real en su azimut (macizos, SLDEM2015, E10) (°). */
  solSobreHorizonteGrados: number
  /** El centro del Sol está sobre los macizos y ningún relieve cercano lo tapa. */
  solVisible: boolean
  /** Elevación del centro de la Tierra sobre el horizonte real en su azimut (°). */
  tierraSobreHorizonteGrados: number
  /** El centro de la Tierra está sobre los macizos y ningún relieve cercano la tapa (comunicación directa posible). */
  tierraVisible: boolean
}

/** E21: altura del ojo para el relieve cercano: la del observador, con 1 cm como mínimo. */
const ojoCercano = (alturaM: number) => Math.max(alturaM, 0.01)

/**
 * E21: ¿se ve alguna parte de un disco (Sol o Tierra) desde (x, z) a alturaM? El borde superior (centro + semidiámetro)
 * debe quedar sobre el horizonte lejano y sin relieve cercano que lo tape. Es la definición de los mapas de visibilidad
 * de Mazarico et al. (2011): "sunlit (by any fraction of the solar disc)".
 */
export function algoDelDiscoVisible(azimutGrados: number, elevacionGrados: number, semidiametroGrados: number, x: number, z: number, alturaM = 0): boolean {
  const borde = elevacionGrados + semidiametroGrados
  if (borde <= elevacionHorizonte(azimutGrados, alturaM)) return false
  return !tapadoPorRelieve(x, z, direccionDesdeHorizonte(borde, azimutGrados), ojoCercano(alturaM))
}

/**
 * E21: fracción de una serie [az, el, az, el, …] con alguna parte del disco visible (algoDelDiscoVisible). Sirve para
 * comparar con los mapas de visibilidad media de Mazarico et al. (2011) sobre 18,6 años.
 */
export function fraccionVisible(serie: ArrayLike<number>, semidiametroGrados: number, x: number, z: number, alturaM = 0): number {
  let visibles = 0
  const n = serie.length / 2
  for (let i = 0; i < n; i++) if (algoDelDiscoVisible(serie[2 * i], serie[2 * i + 1], semidiametroGrados, x, z, alturaM)) visibles++
  return visibles / n
}

/** E21: alturas del observador que ofrece la interfaz (m): a ras del suelo, un astronauta (supuesto) y un mástil (supuesto). */
export const ALTURAS_OBSERVADOR_M = [0, 1.7, 10] as const

/**
 * Cielo en (x, z) para el estado e, con el observador a alturaM sobre el suelo (E21). Simplificación: el horizonte lejano
 * es el medido desde el centro del sitio (E10, E20); a 200 m del centro, con el relieve que lo forma a km de distancia, la
 * diferencia es de ~0,1–0,5° (paralaje, supuesto sin medir). El relieve cercano (DTM) se mira desde la misma altura.
 * E21: antes (E19) el ojo cercano iba a 1 m como mínimo; ahora va a la altura elegida (1 cm a ras del suelo, para no
 * partir dentro del suelo interpolado), que es lo que valida la comparación con Mazarico et al. (2011).
 */
export function cieloEnPunto(e: EstadoEscena, x: number, z: number, alturaM = 0): CieloEnPunto {
  const sobre = (d: Vec3) => elevacionDe(d) - elevacionHorizonte(azimutDe(d), alturaM)
  const ojo = ojoCercano(alturaM)
  const sol = sobre(e.direccionSol)
  const tierra = sobre(e.direccionTierra)
  return {
    solSobreHorizonteGrados: sol,
    solVisible: sol > 0 && !tapadoPorRelieve(x, z, e.direccionSol, ojo),
    tierraSobreHorizonteGrados: tierra,
    tierraVisible: tierra > 0 && !tapadoPorRelieve(x, z, e.direccionTierra, ojo),
  }
}

/** Resumen de un día lunar en un punto. */
export type ResumenDia = {
  /** Horas con el centro del Sol visible (macizos y relieve cercano). */
  horasSol: number
  /** Fracción del día lunar con el Sol visible. */
  fraccionSol: number
  /** Fracción del día lunar con la Tierra visible. */
  fraccionTierra: number
  /** Primer y último instante (t) con Sol visible; NaN si no lo hay. */
  primerSol: number
  ultimoSol: number
}

/** Paso del muestreo del resumen: 10 min (el Sol avanza ~0,08°). */
export const PASO_RESUMEN_S = 600

const resumenes = new Map<string, ResumenDia>()

/** Resumen del día lunar d en (x, z) con el observador a alturaM, muestreado cada 10 min; con caché por punto, altura y día. */
export function resumenDia(d: DiaLunar, x: number, z: number, alturaM = 0): ResumenDia {
  const clave = `${d.indice}|${x.toFixed(2)}|${z.toFixed(2)}|${alturaM}`
  const guardado = resumenes.get(clave)
  if (guardado) return guardado
  let conSol = 0
  let conTierra = 0
  let n = 0
  let primerSol = NaN
  let ultimoSol = NaN
  for (let t = d.inicio; t < d.fin; t += PASO_RESUMEN_S) {
    const c = cieloEnPunto(estado(t), x, z, alturaM)
    n++
    if (c.solVisible) {
      conSol++
      if (Number.isNaN(primerSol)) primerSol = t
      ultimoSol = t
    }
    if (c.tierraVisible) conTierra++
  }
  const r: ResumenDia = {
    horasSol: (conSol * PASO_RESUMEN_S) / 3600,
    fraccionSol: conSol / n,
    fraccionTierra: conTierra / n,
    primerSol,
    ultimoSol,
  }
  resumenes.set(clave, r)
  return r
}

/** Para pruebas: dirección desde elevación y azimut (reexporta el helper del motor). */
export const direccionDe = direccionDesdeHorizonte
