// E22: el Sol y la Tierra vistos desde cualquier punto de la Luna, en cualquier instante de 2026 a 2030. Funciones puras,
// sin React ni three.
//
// Datos: scripts/efemerides-luna.ts guarda, cada 3 h, el punto subsolar y el sub-Tierra en ejes fijos a la Luna
// (MOON_ME de JPL Horizons, DE441) y sus distancias. La dirección desde un sitio es la del cuerpo menos la posición del
// sitio sobre la esfera de 1737,4 km (paralaje: hasta ~0,26° para la Tierra), llevada a ejes locales este-norte-arriba.
// Comprobado contra las tablas de Horizons por sitio (Apollo 17, Connecting Ridge): ≤ 0,01° (tests/efemerides.test.ts).
// Simplificación: no se aplica la aberración anual (~20″ = 0,006°), porque el observador de las consultas está en el
// centro del Sol o de la Tierra y no en la superficie de la Luna.
//
// La tabla es binaria (src/data/efemerides-luna.f32, 457 KB): quien la usa la lee (fetch en la página, Bun.file en las
// pruebas) y se la pasa a crearTablaLuna. Así el motor sigue siendo puro.
import { direccionDesdeHorizonte, type Vec3 } from './environment'

const RAD = Math.PI / 180
/** Radio de referencia de la Luna (km), el de Horizons y LOLA. */
export const RADIO_LUNA_KM = 1737.4
/** 1 UA (km): FA p. 671. */
const UA_KM = 149_597_870.7
/** R☉ = 695 508 km (FA tabla B.4, p. 673), el mismo que SOL en environment.ts. */
const RADIO_SOL_KM = 695_508
/** Radio ecuatorial de la Tierra (km): el de la cabecera de Horizons ("Target radii 6378.137"); Horizons da el diámetro ecuatorial. */
const RADIO_TIERRA_KM = 6378.137

/** Metadatos de la tabla (src/data/efemerides-luna.json). */
export type MetaTablaLuna = { inicioUTC: string; finUTC: string; pasoS: number; filas: number }

export type TablaLuna = {
  inicioMs: number
  finMs: number
  pasoMs: number
  filas: number
  /** Por fila: Sol (x, y, z unitario; km), Tierra (x, y, z unitario; km). */
  datos: Float32Array
}

export function crearTablaLuna(buffer: ArrayBuffer, meta: MetaTablaLuna): TablaLuna {
  const datos = new Float32Array(buffer)
  if (datos.length !== meta.filas * 8) throw new Error(`Tabla de efemérides con ${datos.length / 8} filas; se esperaban ${meta.filas}.`)
  return { inicioMs: Date.parse(meta.inicioUTC), finMs: Date.parse(meta.finUTC), pasoMs: meta.pasoS * 1000, filas: meta.filas, datos }
}

/** true si el instante cae dentro de la tabla. */
export const dentroDeTabla = (tabla: TablaLuna, ms: number) => ms >= tabla.inicioMs && ms <= tabla.finMs

/** Sitio preparado: posición (km) y ejes locales este, norte, arriba en MOON_ME. */
export type SitioLuna = {
  latitudGrados: number
  longitudEsteGrados: number
  posicionKm: [number, number, number]
  este: [number, number, number]
  norte: [number, number, number]
  arriba: [number, number, number]
}

/** Prepara un sitio (latitud y longitud este en grados, sobre la esfera de referencia; altitud 0, como las tablas de E5). */
export function prepararSitio(latitudGrados: number, longitudEsteGrados: number): SitioLuna {
  const f = latitudGrados * RAD
  const l = longitudEsteGrados * RAD
  const arriba: [number, number, number] = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]
  return {
    latitudGrados,
    longitudEsteGrados,
    posicionKm: [arriba[0] * RADIO_LUNA_KM, arriba[1] * RADIO_LUNA_KM, arriba[2] * RADIO_LUNA_KM],
    este: [-Math.sin(l), Math.cos(l), 0],
    norte: [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)],
    arriba,
  }
}

/** Un cuerpo visto desde el sitio. */
export type CuerpoVisto = {
  azimutGrados: number
  elevacionGrados: number
  /** Dirección unitaria en ejes de la escena (+X este, +Y arriba, −Z norte). */
  direccion: Vec3
  distanciaKm: number
  diametroGrados: number
}

export type CieloLuna = {
  ms: number
  sol: CuerpoVisto & { distanciaAu: number }
  tierra: CuerpoVisto & { /** Fracción iluminada de la Tierra vista desde el sitio (0–1). */ fase: number }
}

const punto = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Vector (km, MOON_ME) de un cuerpo en ms: unitario interpolado y normalizado, distancia lineal. */
function cuerpoKm(tabla: TablaLuna, ms: number, desplazamiento: 0 | 4): [number, number, number] {
  const s = (Math.min(Math.max(ms, tabla.inicioMs), tabla.finMs) - tabla.inicioMs) / tabla.pasoMs
  const i = Math.min(Math.floor(s), tabla.filas - 2)
  const f = s - i
  const d = tabla.datos
  const a = i * 8 + desplazamiento
  const b = a + 8
  const x = d[a] + (d[b] - d[a]) * f
  const y = d[a + 1] + (d[b + 1] - d[a + 1]) * f
  const z = d[a + 2] + (d[b + 2] - d[a + 2]) * f
  const km = (d[a + 3] + (d[b + 3] - d[a + 3]) * f) / Math.hypot(x, y, z)
  return [x * km, y * km, z * km]
}

function visto(sitio: SitioLuna, cuerpo: [number, number, number], radioKm: number): CuerpoVisto & { rel: [number, number, number] } {
  const rel: [number, number, number] = [cuerpo[0] - sitio.posicionKm[0], cuerpo[1] - sitio.posicionKm[1], cuerpo[2] - sitio.posicionKm[2]]
  const distanciaKm = Math.hypot(rel[0], rel[1], rel[2])
  const e = punto(rel, sitio.este)
  const n = punto(rel, sitio.norte)
  const u = punto(rel, sitio.arriba)
  const elevacionGrados = Math.asin(u / distanciaKm) / RAD
  const az = (Math.atan2(e, n) / RAD + 360) % 360
  const azimutGrados = 360 - az < 1e-9 ? 0 : az
  return {
    rel,
    azimutGrados,
    elevacionGrados,
    direccion: direccionDesdeHorizonte(elevacionGrados, azimutGrados),
    distanciaKm,
    diametroGrados: (2 * Math.asin(radioKm / distanciaKm)) / RAD,
  }
}

/** El Sol y la Tierra vistos desde el sitio en el instante ms (UTC). Fuera de la tabla se limita a sus extremos. */
export function cieloEn(tabla: TablaLuna, sitio: SitioLuna, ms: number): CieloLuna {
  const s = cuerpoKm(tabla, ms, 0)
  const t = cuerpoKm(tabla, ms, 4)
  const { rel: relSol, ...sol } = visto(sitio, s, RADIO_SOL_KM)
  const { rel: relTierra, ...tierra } = visto(sitio, t, RADIO_TIERRA_KM)
  // Fase de la Tierra: ángulo en la Tierra entre el Sol y el sitio; fracción iluminada (1 + cos φ)/2 (esfera).
  const tierraSol = [relSol[0] - relTierra[0], relSol[1] - relTierra[1], relSol[2] - relTierra[2]]
  const cosFase = punto(tierraSol, relTierra.map((x) => -x)) / (Math.hypot(tierraSol[0], tierraSol[1], tierraSol[2]) * tierra.distanciaKm)
  return {
    ms,
    sol: { ...sol, distanciaAu: sol.distanciaKm / UA_KM },
    tierra: { ...tierra, fase: (1 + cosFase) / 2 },
  }
}

/** Solo elevación y azimut del Sol y la Tierra (para barridos largos: sin objetos intermedios). */
export function elevacionesEn(tabla: TablaLuna, sitio: SitioLuna, ms: number, salida: Float64Array): void {
  for (const [k, desplazamiento] of [
    [0, 0],
    [2, 4],
  ] as const) {
    const c = cuerpoKm(tabla, ms, desplazamiento)
    const rx = c[0] - sitio.posicionKm[0]
    const ry = c[1] - sitio.posicionKm[1]
    const rz = c[2] - sitio.posicionKm[2]
    const L = Math.hypot(rx, ry, rz)
    const e = rx * sitio.este[0] + ry * sitio.este[1] + rz * sitio.este[2]
    const n = rx * sitio.norte[0] + ry * sitio.norte[1] + rz * sitio.norte[2]
    const u = rx * sitio.arriba[0] + ry * sitio.arriba[1] + rz * sitio.arriba[2]
    salida[k] = (Math.atan2(e, n) / RAD + 360) % 360
    salida[k + 1] = Math.asin(u / L) / RAD
  }
}
