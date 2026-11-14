// ENV-005: el tiempo controla el estado de la escena.
// estado(t) es una función pura: el mismo t da siempre el mismo estado, se llegue avanzando,
// retrocediendo o saltando. El reloj (en la interfaz) solo decide qué t mostrar.
//
// E5: las posiciones del Sol y la Tierra son reales. Vienen de JPL Horizons (efemérides DE441) para el
// sitio del Apollo 17, en una tabla horaria descargada por scripts/horizons.ts (src/data/). Entre filas se
// interpola linealmente; el Sol avanza ~0,5° por hora, así que el error de interpolación es pequeño.
import { azimutDe, direccionDesdeHorizonte, elevacionDe, type Vec3 } from './environment'
import { elevacionHorizonte } from './horizonte'
import { SITIO_ACTIVO } from './sitio'

// E20: tabla del sitio activo (src/data/efemerides-<sitio>.json), cargada antes de exportar nada.
type Efemerides = typeof import('../data/efemerides-apollo17.json')
const datos: Efemerides = (await import(`../data/efemerides-${SITIO_ACTIVO.id}.json`)).default

/** Sitio, con su fuente (LROC, Wagner et al. 2016). */
export const SITIO = datos.sitio

/** Procedencia de las efemérides (fuente, consulta, fecha), para citar en la interfaz. */
export const PROCEDENCIA = datos.procedencia

// E18: la tabla cubre varios días lunares seguidos; limitesDiaUTC trae N + 1 límites y el día k va del límite k al
// k + 1. t = 0 es el primero. E20: los límites son salidas del Sol (centro del disco cruzando 0°) o medianoches locales
// (paso del Sol por el antimeridiano), según datos.definicionDia.
export const DEFINICION_DIA = datos.definicionDia as 'salida' | 'medianoche'
const LIMITES_MS = datos.limitesDiaUTC.map((x) => Date.parse(x))
const SALIDA_MS = LIMITES_MS[0]
const INICIO_TABLA_MS = Date.parse(datos.inicioTablaUTC)
const PASO_S = datos.pasoS
const FILAS = datos.sol.elevacionGrados.length

/** E18/E20: t de cada límite entre días (segundos desde el primero); N + 1 valores. */
export const LIMITES_DIA_S: readonly number[] = LIMITES_MS.map((ms) => (ms - SALIDA_MS) / 1000)

/** E18: cantidad de días lunares seguidos en la tabla. */
export const CANTIDAD_DIAS = LIMITES_DIA_S.length - 1

/**
 * ENV-005 (E18): duración de toda la tabla, de la primera salida del Sol a la última. Cada día lunar dura ~29,5 días
 * terrestres; el promedio es 29,531 (LSB cap. A3.1, p. 58). La duración de cada día está en diaDe(t).duracion.
 */
export const DURACION_S = LIMITES_DIA_S[CANTIDAD_DIAS]

/** Desplazamiento de t = 0 (salida del Sol) dentro de la tabla, en segundos. */
const DESFASE_S = (SALIDA_MS - INICIO_TABLA_MS) / 1000

export type EstadoEscena = {
  /** Segundos desde el primer límite de día de la tabla, limitados a [0, DURACION_S]. */
  t: number
  /** Instante real (UTC) que corresponde a t. */
  fechaUTC: string
  /** Dirección unitaria hacia el Sol en ejes de la escena. */
  direccionSol: Vec3
  elevacionSolGrados: number
  /** Azimut del Sol desde el norte hacia el este. */
  azimutSolGrados: number
  /** ENV-007: diámetro angular real del Sol (varía con la distancia). */
  diametroSolGrados: number
  /** ENV-002 (E9): distancia al Sol en UA (Horizons, cantidad 20), para la irradiancia 1/r². */
  distanciaSolAu: number
  /** ENV-010: dirección unitaria hacia la Tierra; se mueve unos grados por la libración. */
  direccionTierra: Vec3
  elevacionTierraGrados: number
  azimutTierraGrados: number
  /** ENV-007: diámetro angular real de la Tierra. */
  diametroTierraGrados: number
  /** E14: distancia a la Tierra en UA (Horizons, cantidad 20). */
  distanciaTierraAu: number
  /** ENV-010: fracción iluminada de la Tierra vista desde el sitio (Horizons, cantidad 10). */
  faseTierra: number
}

/**
 * Limita t a la tabla descargada, [0, DURACION_S]. E7: un día NO se repite. Repetirlo hacía saltar la Tierra 3,65° y su
 * fase de 76,8 % a 74,7 % al cerrar el ciclo, porque la libración sigue los meses anomalístico (27,554550 d) y
 * dracónico (27,212220 d), no el día solar (FA cap. 11.4, p. 257; cap. 17.1, p. 413). E18: por eso la tabla trae los
 * días siguientes reales en vez de repetir uno; más allá del último no hay datos y el reloj se detiene.
 */
export function limitarT(t: number): number {
  if (Number.isNaN(t)) return 0
  return Math.min(Math.max(t, 0), DURACION_S)
}

/** Interpola entre dos direcciones unitarias (lineal y normalizada; ángulos pequeños entre filas). */
function interpolarDireccion(a: Vec3, b: Vec3, f: number): Vec3 {
  const v: Vec3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  const n = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}

function filaYFraccion(t: number): [number, number] {
  const s = DESFASE_S + t
  const i = Math.min(Math.max(Math.floor(s / PASO_S), 0), FILAS - 2)
  return [i, s / PASO_S - i]
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/** Estado de la escena para un tiempo t (segundos desde la salida del Sol en el sitio). */
export function estado(tEntrada: number): EstadoEscena {
  const t = limitarT(tEntrada)
  const [i, f] = filaYFraccion(t)
  const { sol, tierra } = datos
  const direccionSol = interpolarDireccion(
    direccionDesdeHorizonte(sol.elevacionGrados[i], sol.azimutGrados[i]),
    direccionDesdeHorizonte(sol.elevacionGrados[i + 1], sol.azimutGrados[i + 1]),
    f,
  )
  const direccionTierra = interpolarDireccion(
    direccionDesdeHorizonte(tierra.elevacionGrados[i], tierra.azimutGrados[i]),
    direccionDesdeHorizonte(tierra.elevacionGrados[i + 1], tierra.azimutGrados[i + 1]),
    f,
  )
  return {
    t,
    fechaUTC: new Date(SALIDA_MS + t * 1000).toISOString(),
    direccionSol,
    elevacionSolGrados: elevacionDe(direccionSol),
    azimutSolGrados: azimutDe(direccionSol),
    diametroSolGrados: lerp(sol.diametroArcsec[i], sol.diametroArcsec[i + 1], f) / 3600,
    distanciaSolAu: lerp(sol.distanciaAu[i], sol.distanciaAu[i + 1], f),
    direccionTierra,
    elevacionTierraGrados: elevacionDe(direccionTierra),
    azimutTierraGrados: azimutDe(direccionTierra),
    diametroTierraGrados: lerp(tierra.diametroArcsec[i], tierra.diametroArcsec[i + 1], f) / 3600,
    distanciaTierraAu: lerp(tierra.distanciaAu[i], tierra.distanciaAu[i + 1], f),
    faseTierra: lerp(tierra.iluminadaPorciento[i], tierra.iluminadaPorciento[i + 1], f) / 100,
  }
}

/** Velocidades del reloj (× tiempo real). ×1 es tiempo real estricto. */
export const VELOCIDADES = [1, 1_000, 10_000, 100_000] as const

/** Paso de los botones ◀ ▶: 12 horas terrestres (~6° de Sol). */
export const PASO_BOTON_S = 12 * 3600

/**
 * E18: un día lunar de la tabla, entre dos límites (salidas astronómicas del Sol o, en sitios polares, medianoches
 * locales; E20). Todos los tiempos son t.
 */
export type DiaLunar = {
  /** 0 para el primero. */
  indice: number
  /** Límite inicial: salida astronómica (centro del disco cruzando 0° hacia arriba) o medianoche local. */
  inicio: number
  /** Límite siguiente (inicio del día siguiente). */
  fin: number
  duracion: number
  /** E7: paso del Sol por el meridiano (FA cap. 11.4, pp. 252–254). */
  mediodia: number
  /** Puesta astronómica (centro del disco cruzando 0° hacia abajo); NaN si ese día no la hay (polo). */
  puesta: number
  /** E10: salida y puesta locales, sobre el horizonte real; NaN si ese día no las hay (polo). */
  salidaLocal: number
  puestaLocal: number
}

/** Fila de la tabla que contiene t (sin limitar). */
const filaDe = (t: number) => Math.floor((DESFASE_S + t) / PASO_S)
/** t de la fila k. */
const tDeFila = (k: number) => k * PASO_S - DESFASE_S

/** Bisección sobre estado(): el primer t de [bajo, alto] donde cumple(t) pasa a ser verdadero. */
function biseccion(bajo: number, alto: number, cumple: (t: number) => boolean, pasos = 50): number {
  for (let n = 0; n < pasos; n++) {
    const medio = (bajo + alto) / 2
    if (cumple(medio)) alto = medio
    else bajo = medio
  }
  return alto
}

/** E20: azimut del meridiano hacia el ecuador: 180° (sur) en el hemisferio norte y 0° (norte) en el sur. */
export const AZIMUT_MERIDIANO = SITIO_ACTIVO.latitudGrados >= 0 ? 180 : 0

/** Ángulo de un azimut respecto de una referencia, en [−180°, 180°). */
const relativo = (az: number, referencia: number) => ((((az - referencia + 540) % 360) + 360) % 360) - 180

/**
 * E7: mediodía local = paso del Sol por el meridiano (FA cap. 11.4, pp. 252–254: el día se mide entre pasos sucesivos por
 * el meridiano). Se busca la fila del día donde el azimut cruza el meridiano hacia el ecuador y se refina por bisección
 * sobre estado(). Antes se tomaba la fila de mayor elevación, que en el primer día lunar caía 21 min antes del tránsito.
 * E20: vale en ambos hemisferios; en el sur el Sol cruza el norte (0°) con el azimut bajando.
 */
function transito(inicio: number, fin: number): number {
  const az = datos.sol.azimutGrados
  for (let k = Math.max(filaDe(inicio), 0); k < Math.min(filaDe(fin), FILAS - 1); k++) {
    const a = relativo(az[k], AZIMUT_MERIDIANO)
    const b = relativo(az[k + 1], AZIMUT_MERIDIANO)
    if (Math.abs(a) < 90 && Math.abs(b) < 90 && (a < 0) !== (b < 0)) {
      const subiendo = b >= 0
      return biseccion(
        limitarT(tDeFila(k)),
        limitarT(tDeFila(k + 1)),
        (t) => relativo(estado(t).azimutSolGrados, AZIMUT_MERIDIANO) >= 0 === subiendo,
      )
    }
  }
  throw new Error('No se encontró el tránsito del Sol por el meridiano en el día.')
}

/**
 * Puesta astronómica del día: la fila donde la elevación del centro del Sol pasa de > 0 a ≤ 0, refinada por bisección.
 * E20: NaN si no la hay (en el polo el Sol puede no ponerse en todo el día).
 */
function puestaAstronomica(desde: number, fin: number): number {
  const el = datos.sol.elevacionGrados
  for (let k = Math.max(filaDe(desde), 0); k < Math.min(filaDe(fin), FILAS - 1); k++) {
    if (el[k] > 0 && el[k + 1] <= 0) {
      return biseccion(limitarT(tDeFila(k)), limitarT(tDeFila(k + 1)), (t) => estado(t).elevacionSolGrados <= 0)
    }
  }
  return NaN
}

/**
 * ENV-008 (E10): salida y puesta LOCALES del Sol, cuando el centro del disco cruza el horizonte real del sitio (macizos,
 * SLDEM2015). Se busca el cruce de e − h(az) con paso de 10 min dentro del día y se refina por bisección.
 */
function cruceHorizonteLocal(inicio: number, fin: number, subiendo: boolean): number {
  const sobre = (t: number) => {
    const e = estado(t)
    return e.elevacionSolGrados - elevacionHorizonte(e.azimutSolGrados)
  }
  const paso = 600
  for (let t = inicio; t + paso <= fin; t += paso) {
    const a = sobre(t)
    const b = sobre(t + paso)
    if (subiendo ? a <= 0 && b > 0 : a > 0 && b <= 0) {
      return biseccion(t, t + paso, (x) => sobre(x) > 0 === subiendo, 40)
    }
  }
  return NaN
}

/** Caché por día: cada día se calcula la primera vez que se pide (el estado sigue siendo función pura de t). */
const diasCalculados = new Map<number, DiaLunar>()

/** E18: el día lunar k de la tabla (0 ≤ k < CANTIDAD_DIAS). */
export function dia(indice: number): DiaLunar {
  const k = Math.min(Math.max(Math.trunc(indice), 0), CANTIDAD_DIAS - 1)
  const guardado = diasCalculados.get(k)
  if (guardado) return guardado
  const inicio = LIMITES_DIA_S[k]
  const fin = LIMITES_DIA_S[k + 1]
  const mediodia = transito(inicio, fin)
  const d: DiaLunar = {
    indice: k,
    inicio,
    fin,
    duracion: fin - inicio,
    mediodia,
    puesta: puestaAstronomica(mediodia, fin),
    salidaLocal: cruceHorizonteLocal(inicio, fin, true),
    puestaLocal: cruceHorizonteLocal(inicio, fin, false),
  }
  diasCalculados.set(k, d)
  return d
}

/** E18: el día lunar que contiene t; el final exacto de la tabla pertenece al último día. */
export function diaDe(t: number): DiaLunar {
  const x = limitarT(t)
  let k = 0
  while (k < CANTIDAD_DIAS - 1 && x >= LIMITES_DIA_S[k + 1]) k++
  return dia(k)
}

/**
 * t de la mañana del día d en que el Sol alcanza una elevación dada (bisección sobre estado, entre la salida y el
 * mediodía). Sirve para empezar en α = 12° y repetir la prueba de E2 (L ≈ 47,0 m).
 */
export function tParaElevacionManana(d: DiaLunar, elevacionGrados: number): number {
  if (estado(d.mediodia).elevacionSolGrados < elevacionGrados) return d.mediodia
  return biseccion(d.inicio, d.mediodia, (t) => estado(t).elevacionSolGrados >= elevacionGrados, 60)
}

/**
 * t de la tarde del día d en que el Sol baja a una elevación dada (bisección entre el tránsito y la puesta astronómica,
 * o el final del día si no hay puesta).
 */
export function tParaElevacionTarde(d: DiaLunar, elevacionGrados: number): number {
  if (estado(d.mediodia).elevacionSolGrados < elevacionGrados) return d.mediodia
  const hasta = Number.isNaN(d.puesta) ? d.fin : d.puesta
  return biseccion(d.mediodia, hasta, (t) => estado(t).elevacionSolGrados <= elevacionGrados, 60)
}
