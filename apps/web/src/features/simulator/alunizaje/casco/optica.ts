// Óptica del visor: cuentas puras, sin renderizador. Todos los valores están
// elegidos a ojo contra la imagen de referencia.

import * as THREE from 'three'

/** Ángulo desde el eje de la mirada en el borde superior de la pantalla. */
export const THETA_V = (27 * Math.PI) / 180
/** Más allá de este ángulo el ojo de pez se recorta. */
export const THETA_MAX = (62 * Math.PI) / 180
/** Mirar un poco hacia abajo al empezar (rad). */
export const INCLINACION_INICIAL = -0.075


/** Grosor aparente del canto del vidrio, en unidades de pantalla. */
export const CANTO = 0.065
/**
 * Abertura del visor: rectángulo muy redondeado, en unidades de pantalla
 * (1 = media altura). El medio ancho va multiplicado por el aspecto. El
 * sombreador y el HUD usan estos mismos números.
 */
export const VISOR = { centroY: 0.03, medioAncho: 0.965, medioAlto: 1.06, radioArriba: 0.7, radioAbajo: 0.86 }
/**
 * Posiciones del visor solar: ángulo de su filo alrededor del eje de las
 * bisagras (rad; 0 al frente, positivo hacia arriba). SUPUESTO: elegidas a ojo;
 * el visor real se detiene en cualquier punto del recorrido.
 */
export const POSICIONES_VISOR = [
  { nombre: 'MEDIO', angulo: 0.27 },
  { nombre: 'ABAJO', angulo: -0.95 },
  { nombre: 'ARRIBA', angulo: 0.8 },
] as const

/** Distancia con signo al borde de la abertura, en coordenadas del casco. Negativa dentro. */
export function sdVisor(x: number, y: number, aspecto: number) {
  y -= VISOR.centroY
  const bx = aspecto * VISOR.medioAncho
  const by = VISOR.medioAlto
  const r = Math.min(y > 0 ? VISOR.radioArriba : VISOR.radioAbajo, bx, by)
  const qx = Math.abs(x) - bx + r
  const qy = Math.abs(y) - by + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

export interface Punto {
  x: number
  y: number
}
export interface Direccion extends Punto {
  z: number
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const cuat = new THREE.Quaternion()
const vec = new THREE.Vector3()

/**
 * Dónde cae en pantalla una dirección del mundo para una mirada dada. La
 * pantalla va de -1 a 1 en vertical y de -aspecto a aspecto en horizontal.
 * Devuelve el ángulo entre la dirección y el eje de la mirada.
 */
export function direccionAPantalla(dir: Direccion, giro: number, inclinacion: number, salida: Punto) {
  cuat.setFromEuler(euler.set(inclinacion, giro, 0)).invert()
  vec.set(dir.x, dir.y, dir.z).applyQuaternion(cuat)
  const theta = Math.acos(Math.min(1, Math.max(-1, -vec.z)))
  const l = Math.hypot(vec.x, vec.y) || 1
  salida.x = (vec.x / l) * (theta / THETA_V)
  salida.y = (vec.y / l) * (theta / THETA_V)
  return theta
}

/** Lo inverso: la dirección del mundo que se ve en un punto de la pantalla. */
export function pantallaADireccion(x: number, y: number, giro: number, inclinacion: number, salida: Direccion) {
  const r = Math.hypot(x, y)
  const theta = r * THETA_V
  const k = r > 1e-9 ? Math.sin(theta) / r : 0
  cuat.setFromEuler(euler.set(inclinacion, giro, 0))
  vec.set(x * k, y * k, -Math.cos(theta)).applyQuaternion(cuat)
  salida.x = vec.x
  salida.y = vec.y
  salida.z = vec.z
}

/**
 * Encuadre que debe tener la cámara de la escena (tangentes del medio ancho y
 * del medio alto) para cubrir todo lo que el ojo de pez muestra en pantalla.
 */
export function encuadre(aspecto: number) {
  let tanAncho = 0
  let tanAlto = 0
  for (let j = 0; j <= 16; j++) {
    for (let i = 0; i <= 32; i++) {
      const x = (aspecto * i) / 32
      const y = j / 16
      const r = Math.hypot(x, y)
      if (r === 0) continue
      const t = Math.tan(Math.min(r * THETA_V, THETA_MAX)) / r
      tanAncho = Math.max(tanAncho, t * x)
      tanAlto = Math.max(tanAlto, t * y)
    }
  }
  return { tanAncho: tanAncho * 1.01, tanAlto: tanAlto * 1.01 }
}

const tmp = { x: 0, y: 0 }

/** Giro inicial para que el Sol caiga arriba a la derecha, dentro del vidrio. */
export function giroInicial(aspecto: number, dirSol: Direccion) {
  const meta = Math.min(0.8 * aspecto, 1.7)
  let a = -0.7
  let b = 0.7
  for (let i = 0; i < 24; i++) {
    const c = (a + b) / 2
    direccionAPantalla(dirSol, c, INCLINACION_INICIAL, tmp)
    if (tmp.x > meta) b = c
    else a = c
  }
  return (a + b) / 2
}
