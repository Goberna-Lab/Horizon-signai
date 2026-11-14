// E14: la Luna completa. Direcciones del Sol y la Tierra en el marco selenográfico (fijo al cuerpo, mean Earth/polar
// axis) a partir de las direcciones topocéntricas del sitio (Horizons), y la calibración del brillo del globo.
// Funciones puras, sin React ni three.
//
// Marco selenográfico: x hacia (0° N, 0° E), el centro medio de la cara visible; y hacia (0° N, 90° E); z hacia el polo
// norte. Con ejes locales del sitio: este E = (−sin λ, cos λ, 0), norte N = (−sin φ cos λ, −sin φ sin λ, cos φ),
// arriba U = (cos φ cos λ, cos φ sin λ, sin φ).
import { SUPERFICIE, type Vec3 } from './environment'
import type { EstadoEscena } from './simulation'
import { SITIO } from './simulation'

const RAD = Math.PI / 180
export const RADIO_LUNA_KM = 1737.4 // esfera de referencia de LOLA y Horizons
export const UA_KM = 149_597_870.7 // FA tabla B.1, p. 671

/** Escena (+X este, +Y arriba, −Z norte) → selenográfico. */
export function aSelenografico([x, y, z]: Vec3, latitudGrados = SITIO.latitudGrados, longitudGrados = SITIO.longitudEsteGrados): Vec3 {
  const f = latitudGrados * RAD
  const l = longitudGrados * RAD
  const este = x
  const arriba = y
  const norte = -z
  return [
    -Math.sin(l) * este - Math.sin(f) * Math.cos(l) * norte + Math.cos(f) * Math.cos(l) * arriba,
    Math.cos(l) * este - Math.sin(f) * Math.sin(l) * norte + Math.cos(f) * Math.sin(l) * arriba,
    Math.cos(f) * norte + Math.sin(f) * arriba,
  ]
}

/** Punto (latitud, longitud este) en grados → vector unitario selenográfico. */
export function vectorDePunto(latitudGrados: number, longitudGrados: number): Vec3 {
  const f = latitudGrados * RAD
  const l = longitudGrados * RAD
  return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]
}

/** Vector unitario selenográfico → (latitud, longitud este en [0, 360)) en grados. */
export function puntoDeVector([x, y, z]: Vec3): [number, number] {
  return [Math.asin(Math.max(-1, Math.min(1, z))) / RAD, ((Math.atan2(y, x) / RAD) + 360) % 360]
}

export type GeometriaGlobal = {
  /** Dirección hacia el Sol y hacia la Tierra en el marco selenográfico (unitarias). */
  sol: Vec3
  tierra: Vec3
  /** Punto subsolar y subterrestre (latitud, longitud este). */
  subsolar: [number, number]
  subterrestre: [number, number]
  /** Distancia a la Tierra en km (Horizons, topocéntrica; la diferencia con la selenocéntrica es ≤ 1737 km). */
  distanciaTierraKm: number
}

/**
 * Geometría global del instante. Las direcciones al Sol y a la Tierra son las del sitio; a escala lunar, la paralaje
 * entre el sitio y el centro de la Luna es ≤ 0,27° para la Tierra y despreciable para el Sol (simplificación).
 */
export function geometriaGlobal(e: EstadoEscena, distanciaTierraAu: number): GeometriaGlobal {
  const sol = aSelenografico(e.direccionSol)
  const tierra = aSelenografico(e.direccionTierra)
  return {
    sol,
    tierra,
    subsolar: puntoDeVector(sol),
    subterrestre: puntoDeVector(tierra),
    distanciaTierraKm: distanciaTierraAu * UA_KM,
  }
}

/**
 * Brillo visible del globo a partir del albedo normal de LOLA a 1064 nm (LDAM): se escala para que en el Apollo 17
 * coincida con el albedo normal visible del sitio (0,085, E8/E12). LOLA da 0,177 ahí: el regolito es más rojo
 * (LSB cap. 7.2, p. 307; fig. 7.10, p. 308). Supuesto: la misma pendiente espectral en toda la Luna (en realidad mares
 * y tierras altas difieren).
 */
export const ALBEDO_LOLA_SITIO = 0.177
export const FACTOR_VISIBLE_LOLA = SUPERFICIE.albedo / ALBEDO_LOLA_SITIO
